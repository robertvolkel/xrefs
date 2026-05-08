import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';
import {
  getL2ParamMapForCategory,
  type ParamMapEntry,
  type ParamMapping,
} from '@/lib/services/digikeyParamMap';

interface SchemaAttr {
  attributeId: string;
  attributeName: string;
  unit?: string;
}

/** Get schema attributes for a family (L3) or category (L2) */
function getSchemaAttributes(familyId: string): SchemaAttr[] {
  // Try L3 logic table first
  const table = getLogicTable(familyId);
  if (table) {
    return table.rules.map((r) => ({
      attributeId: r.attributeId,
      attributeName: r.attributeName,
      unit: undefined,
    }));
  }

  // Try L2 param map (familyId might be an L2 category string)
  const l2Map = getL2ParamMapForCategory(familyId);
  if (l2Map) {
    const seen = new Set<string>();
    const attrs: SchemaAttr[] = [];
    for (const entry of Object.values(l2Map)) {
      const mappings: ParamMapping[] = Array.isArray(entry) ? entry : [entry];
      for (const m of mappings) {
        if (!seen.has(m.attributeId)) {
          seen.add(m.attributeId);
          attrs.push({ attributeId: m.attributeId, attributeName: m.attributeName, unit: m.unit });
        }
      }
    }
    return attrs;
  }

  return [];
}

// In-memory module-scope cache keyed by (paramName + familyId). Survives multiple
// requests within a server process lifetime — typically dev server until restart,
// or until the Next.js production process recycles. Sample values vary per call but
// don't materially affect Haiku's translation, so we key only on paramName+familyId.
// 24h TTL is generous; admin overrides change rarely.
//
// CACHE INVALIDATION CAVEAT: when the engineer accepts a new override, that fact
// becomes part of "previously-accepted attributeIds in this scope" but the cache
// for OTHER paramNames in the same family doesn't auto-bust. In practice this is
// fine: triage is sequential (engineer doesn't re-query the same paramName twice
// within a session), so cache hits are rare during the active triage round, and
// fresh suggestions always see the latest overrides. Worst case: a stale cached
// suggestion shows up — engineer can override it inline, same as before.
type CacheEntry = { value: unknown; expiresAt: number };
const SUGGEST_CACHE = new Map<string, CacheEntry>();
const SUGGEST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** One entry per accepted attributeId, with the example paramName that was first
 *  accepted under it. Used in the suggester prompt so Haiku can see what concept
 *  each existing canonical was originally minted for. */
type AcceptedCanonical = {
  attributeId: string;
  attributeName: string;
  unit: string | null;
  exampleRawParam: string;
};

/** Fetch active dictionary overrides for the given family/category scope, group
 *  by attributeId, and return one entry per unique ID with the OLDEST paramName
 *  attached as the canonical example. The oldest paramName tends to be the one
 *  the engineer originally minted the attributeId for, making it the strongest
 *  signal of intended meaning for prompt context. Empty list if no overrides
 *  exist (or if the table read fails — fail-open so suggestions still work). */
async function fetchAcceptedCanonicals(familyId: string): Promise<AcceptedCanonical[]> {
  if (!familyId) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('param_name, attribute_id, attribute_name, unit, created_at')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .not('attribute_id', 'is', null)
      .order('created_at', { ascending: true });
    if (error || !data) return [];

    const byAttrId = new Map<string, AcceptedCanonical>();
    for (const row of data) {
      const attrId = row.attribute_id as string | null;
      if (!attrId) continue;
      // Already-seen attrId means we keep the OLDER row (created_at asc, so first wins).
      if (byAttrId.has(attrId)) continue;
      byAttrId.set(attrId, {
        attributeId: attrId,
        attributeName: (row.attribute_name as string) ?? attrId,
        unit: (row.unit as string | null) ?? null,
        exampleRawParam: row.param_name as string,
      });
    }
    return [...byAttrId.values()];
  } catch {
    return [];
  }
}

/** POST /api/admin/atlas/dictionaries/suggest */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'No API key configured' }, { status: 500 });
    }

    const body = await request.json();
    const paramName = body.paramName as string;
    const samples = (body.samples as string[]) ?? [];
    const familyId = body.familyId as string;

    if (!paramName) {
      return NextResponse.json({ success: false, error: 'paramName required' }, { status: 400 });
    }

    const schemaAttrs = getSchemaAttributes(familyId);
    const schemaIds = schemaAttrs.map((a) => a.attributeId);

    // Cache check — returns stored suggestion if still fresh
    const cacheKey = `${familyId ?? ''}::${paramName}`;
    const cached = SUGGEST_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ success: true, suggestion: cached.value, schemaIds, cached: true });
    }

    const schemaList = schemaAttrs.length > 0
      ? schemaAttrs.map((a) => `- ${a.attributeId}: ${a.attributeName}${a.unit ? ` (${a.unit})` : ''}`).join('\n')
      : '(no schema attributes available)';

    // Fetch previously-accepted canonicals for this scope. Goal: stop the
    // suggester from inventing near-duplicates (positions_rows vs
    // positions_and_rows; pins_per_row vs positions_per_row; wire_gauge for
    // BOTH AWG and mm² values; etc). Each entry includes the example raw
    // paramName the ID was first accepted under, so Haiku can see what
    // concept that canonical actually represents — preventing it from
    // shoehorning unrelated params into a generic-sounding ID like "style".
    const acceptedCanonicals = await fetchAcceptedCanonicals(familyId);
    const acceptedList = acceptedCanonicals.length > 0
      ? acceptedCanonicals
          .map((c) => `- ${c.attributeId}: ${c.attributeName}${c.unit ? ` (${c.unit})` : ''} — originally accepted for "${c.exampleRawParam}"`)
          .join('\n')
      : '(none yet)';

    const prompt = `You are an electronics component parameter translator. Given a Chinese parameter name from a component datasheet, provide:
1. An English translation of the parameter name
2. The best matching attribute from the schema below (if any)
3. A suggested attributeId and attributeName if no schema match exists
4. The likely unit of measurement (if determinable from the name or sample values)
5. Confidence: "high" if translation is certain AND schema match is clear, "medium" if translation is certain but schema match is approximate, "low" if uncertain

Schema attributes for this component family:
${schemaList}

Previously-accepted attributeIds in this same family/category (the "originally accepted for" hint shows what concept each ID was minted for):
${acceptedList}

When suggesting an attributeId, follow this priority order:
1. Schema attributes (above) — if a schema attribute is a clear conceptual match for the input paramName, ALWAYS prefer it.
2. Previously-accepted attributeIds — if no schema match, check whether an existing canonical here represents the SAME CONCEPT as the input (e.g. "每排PIN数" and "每行端子数" both mean "pins per row" → reuse the existing canonical). Reuse only when the concept matches; do NOT shoehorn semantically different params into a generic-sounding ID like "style", "type", "size", or "kind" just because they exist.
3. Invent a new attributeId only when neither list has anything semantically appropriate. Avoid generic catchall names; prefer specific ones (e.g. "pins_per_row" over "rows", "compatible_series" over "style", "wire_csa_mm2" over "wire_gauge" when units differ).

Respond in JSON only, no markdown:
{"translation":"...","suggestedAttributeId":"...","suggestedAttributeName":"...","suggestedUnit":"...or null","confidence":"high|medium|low","reasoning":"one sentence explaining the match (if reusing a previously-accepted ID, say so explicitly)"}`;

    const userMsg = `Chinese parameter: "${paramName}"${samples.length > 0 ? `\nSample values: ${samples.join(', ')}` : ''}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: prompt,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Haiku occasionally wraps the JSON response in markdown fences (```json ... ```)
    // even when instructed not to. Strip them before parsing to avoid SyntaxError.
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    const suggestion = {
      translation: parsed.translation ?? null,
      suggestedAttributeId: parsed.suggestedAttributeId ?? null,
      suggestedAttributeName: parsed.suggestedAttributeName ?? null,
      suggestedUnit: parsed.suggestedUnit ?? null,
      confidence: parsed.confidence ?? 'low',
      reasoning: parsed.reasoning ?? null,
    };

    SUGGEST_CACHE.set(cacheKey, {
      value: suggestion,
      expiresAt: Date.now() + SUGGEST_CACHE_TTL_MS,
    });

    return NextResponse.json({ success: true, suggestion, schemaIds });
  } catch (error) {
    console.error('Dictionary suggest error:', error);
    return NextResponse.json({ success: false, error: 'Suggestion failed' }, { status: 500 });
  }
}
