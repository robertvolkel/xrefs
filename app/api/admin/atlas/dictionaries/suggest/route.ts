import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
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
    const schemaList = schemaAttrs.length > 0
      ? schemaAttrs.map((a) => `- ${a.attributeId}: ${a.attributeName}${a.unit ? ` (${a.unit})` : ''}`).join('\n')
      : '(no schema attributes available)';

    const prompt = `You are an electronics component parameter translator. Given a Chinese parameter name from a component datasheet, provide:
1. An English translation of the parameter name
2. The best matching attribute from the schema below (if any)
3. A suggested attributeId and attributeName if no schema match exists
4. The likely unit of measurement (if determinable from the name or sample values)
5. Confidence: "high" if translation is certain AND schema match is clear, "medium" if translation is certain but schema match is approximate, "low" if uncertain

Schema attributes for this component family:
${schemaList}

Respond in JSON only, no markdown:
{"translation":"...","suggestedAttributeId":"...","suggestedAttributeName":"...","suggestedUnit":"...or null","confidence":"high|medium|low","reasoning":"one sentence explaining the match"}`;

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

    const parsed = JSON.parse(text);

    return NextResponse.json({
      success: true,
      suggestion: {
        translation: parsed.translation ?? null,
        suggestedAttributeId: parsed.suggestedAttributeId ?? null,
        suggestedAttributeName: parsed.suggestedAttributeName ?? null,
        suggestedUnit: parsed.suggestedUnit ?? null,
        confidence: parsed.confidence ?? 'low',
        reasoning: parsed.reasoning ?? null,
      },
    });
  } catch (error) {
    console.error('Dictionary suggest error:', error);
    return NextResponse.json({ success: false, error: 'Suggestion failed' }, { status: 500 });
  }
}
