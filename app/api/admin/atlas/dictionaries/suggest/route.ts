import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import {
  getSchemaAttributes,
  fetchAcceptedCanonicals,
} from '@/lib/services/atlasTriageContext';

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

    const prompt = `You are an electronics component parameter triage assistant. The engineer reviewing this row will manually decide whether to accept the suggested mapping or defer it (leave a team note explaining the concern). Your job is to give them ONE binary suggestion plus a substantive written explanation that they can act on or ignore. You are not deciding for them.

Given a Chinese parameter name from a component datasheet, provide:
1. An English translation of the parameter name
2. The best matching attribute from the schema below (if any)
3. A suggested attributeId and attributeName if no schema match exists
4. The likely unit of measurement (if determinable from the name or sample values)
5. Confidence: "high" if translation is certain AND schema match is clear, "medium" if translation is certain but schema match is approximate, "low" if uncertain
6. A suggestion: "accept" (the suggested attributeId is safe to commit as a dictionary override) OR "defer" (something is off — the engineer should leave a team note and investigate before accepting)
7. An explanation written in the same voice and detail an engineer would write a team note. Full sentences, specific, concrete. ALWAYS populate this field — Accept and Defer get the same depth of evidence.

Schema attributes for this component family:
${schemaList}

Previously-accepted attributeIds in this same family/category (the "originally accepted for" hint shows what concept each ID was minted for):
${acceptedList}

When suggesting an attributeId, follow this priority order:
1. Schema attributes (above) — if a schema attribute is a clear conceptual match for the input paramName, ALWAYS prefer it.
2. Previously-accepted attributeIds — if no schema match, check whether an existing canonical here represents the SAME CONCEPT as the input (e.g. "每排PIN数" and "每行端子数" both mean "pins per row" → reuse the existing canonical). Reuse only when the concept matches; do NOT shoehorn semantically different params into a generic-sounding ID like "style", "type", "size", or "kind" just because they exist.
3. Invent a new attributeId only when neither list has anything semantically appropriate. Avoid generic catchall names; prefer specific ones (e.g. "pins_per_row" over "rows", "compatible_series" over "style", "wire_csa_mm2" over "wire_gauge" when units differ).

When choosing the suggestion field:
- "accept" iff: the suggested attributeId is in the schema list above (canonical match) AND the concept clearly matches the input paramName AND the sample values are consistent with the unit/format implied by that attributeId. OR: the suggested attributeId reuses a previously-accepted canonical AND that canonical genuinely represents the same concept (not just a generic-sounding shoehorn).
- "defer" iff ANY of the following: (a) the suggested attributeId is a generic-catchall name (style, type, size, kind, category, material, characteristic, feature, spec, specification) AND would shoehorn an unrelated concept under that ID — accepting would conflate distinct concepts under one canonical and break filtering. (b) the suggested attributeId would create a near-duplicate of an existing previously-accepted canonical (e.g. previously-accepted has "pins_per_row" and you'd be inventing "positions_per_row"). (c) the sample values' units or format don't match the suggested attributeId (e.g. attributeId implies AWG but values are in mm²). (d) the concept is ambiguous or unclear (e.g. "塑高" could mean housing height, body height, or seated height) and a more specific canonical should be defined manually first.

Explanation field — examples of the depth/voice expected:

For an Accept: "Schema-canonical match — dropout_voltage_v is in the LDO logic table and the sample values (0.3V, 0.45V) are consistent with the unit. Concept aligns directly with the standard LDO dropout spec. Safe to accept."

For a Defer: "Suggested attributeId 'style' is a generic catchall — accepting this would put '参考系列' (which is a series-reference like 'compatible with XYZ123 series') into the same canonical as orientation, flange-presence, and material values. Recommend defining a specific 'compatible_series' attributeId via the Atlas Dictionaries panel first, then accepting here."

For a Defer (ambiguity): "Concept is ambiguous — '塑高' could mean housing height, body height, or seated mating height. None of these exist as canonicals in the Connectors L2 schema. Recommend investigating the upstream MFR datasheet to nail down which dimension this represents before minting a canonical."

For a Defer (unit mismatch): "Suggested attributeId 'wire_gauge' implies AWG, but sample values are mm² (1.5, 2.5, 4.0). These are CSA cross-section values, not gauge numbers. Recommend a separate 'wire_csa_mm2' canonical."

Respond in JSON only, no markdown:
{"translation":"...","suggestedAttributeId":"...","suggestedAttributeName":"...","suggestedUnit":"...or null","confidence":"high|medium|low","reasoning":"one short sentence explaining the attributeId match (separate from the suggestion explanation)","suggestion":"accept|defer","explanation":"full prose written in engineer-note voice, 1-3 sentences, ALWAYS populated"}`;

    const userMsg = `Chinese parameter: "${paramName}"${samples.length > 0 ? `\nSample values: ${samples.join(', ')}` : ''}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
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

    // Normalize the suggestion field — Sonnet may return slight variants
    // ('Accept', 'Defer', etc.). Default to 'defer' on anything unrecognized:
    // erring toward "engineer should look at this" is safer than defaulting
    // to a silent auto-accept. The explanation is always passed through.
    const rawSuggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.toLowerCase().trim() : '';
    const normalizedSuggestion: 'accept' | 'defer' = rawSuggestion === 'accept' ? 'accept' : 'defer';

    const suggestion = {
      translation: parsed.translation ?? null,
      suggestedAttributeId: parsed.suggestedAttributeId ?? null,
      suggestedAttributeName: parsed.suggestedAttributeName ?? null,
      suggestedUnit: parsed.suggestedUnit ?? null,
      confidence: parsed.confidence ?? 'low',
      reasoning: parsed.reasoning ?? null,
      suggestion: normalizedSuggestion,
      explanation: typeof parsed.explanation === 'string' && parsed.explanation.trim() ? parsed.explanation.trim() : null,
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
