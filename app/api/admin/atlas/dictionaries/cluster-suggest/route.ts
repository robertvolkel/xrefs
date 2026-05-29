import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { withAnthropicRetry } from '@/lib/services/anthropicRetry';

/**
 * POST /api/admin/atlas/dictionaries/cluster-suggest
 *
 * Tier 2 of the Triage near-duplicate clustering system. The Tier 1 cosmetic-
 * variant fanout (in GlobalUnmappedParamsTable.tsx via paramNameSimilarity.ts)
 * handles whitespace/case/punctuation variants and ASCII-only single-char
 * typos deterministically. This endpoint handles the cases Tier 1 deliberately
 * doesn't touch: CJK synonyms, semantic equivalents, abbreviations vs full
 * forms, word reordering.
 *
 * Request body:
 *   {
 *     focal: { paramName: string, samples?: string[] },
 *     candidates: Array<{ paramName: string, samples?: string[] }>,
 *     scopeLabel?: string  // e.g. "B5 MOSFETs" or "Microcontrollers" — context for Sonnet
 *   }
 *
 * Response:
 *   {
 *     success: true,
 *     clusters: Array<{
 *       paramName: string,
 *       isMatch: boolean,
 *       confidence: 'high' | 'medium' | 'low',
 *       reasoning: string
 *     }>
 *   }
 *
 * Cost: one Sonnet 4.6 call per click. The cluster verdict is paramName-text-
 * stable (it's "are these the same concept?", not row-state-dependent), so the
 * client caches by (focal paramName + scope) in localStorage for 7 days.
 */

const MAX_CANDIDATES = 50;

interface ClusterCandidate {
  paramName: string;
  samples?: string[];
}

interface ClusterVerdict {
  paramName: string;
  isMatch: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'No API key configured' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const focal = body.focal as ClusterCandidate | undefined;
    const rawCandidates = body.candidates as ClusterCandidate[] | undefined;
    const scopeLabel = (body.scopeLabel as string | undefined) ?? '(unscoped)';

    if (!focal?.paramName) {
      return NextResponse.json(
        { success: false, error: 'focal.paramName required' },
        { status: 400 },
      );
    }
    if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
      return NextResponse.json({ success: true, clusters: [] });
    }

    // Cap the candidate set to keep the prompt bounded. If the engineer's
    // queue has more than 50 in-scope candidates, the highest-priority 50
    // (caller's responsibility — e.g. sort by impact desc) are checked.
    const candidates = rawCandidates.slice(0, MAX_CANDIDATES);

    const focalSamples = focal.samples && focal.samples.length > 0
      ? ` (sample values: ${focal.samples.slice(0, 3).join(', ')})`
      : '';
    const candidateList = candidates
      .map((c, i) => {
        const s = c.samples && c.samples.length > 0
          ? ` (sample values: ${c.samples.slice(0, 3).join(', ')})`
          : '';
        return `${i + 1}. "${c.paramName}"${s}`;
      })
      .join('\n');

    const prompt = `You are an electronics-component parameter triage assistant. The engineer has selected one FOCAL parameter from a component-datasheet ingest queue and wants to know which of the listed CANDIDATE parameters represent the SAME attribute concept as the focal.

These candidates are all from the same component scope: ${scopeLabel}. They came from different manufacturers writing the same spec differently — synonyms, abbreviations, word reordering, character variants. Your job is to identify which candidates would map to the same canonical attribute as the focal.

DECISION RULES:
- "isMatch: true" iff the candidate represents the same physical/electrical attribute as the focal AND its sample values would be in the same unit and same scale (e.g. both in V, both in mV — not mixed). The two paramName strings can differ arbitrarily in vocabulary, character variants, or word order; what matters is the concept.
- "isMatch: false" if the candidate is a different attribute (e.g. voltage vs current), a different qualifier of the same attribute (e.g. Max vs Min vs Typ), a different unit/scale (e.g. V vs mV) such that bulk-applying the focal's override would propagate the wrong unit, or a different side/direction (e.g. input-side vs output-side rail).
- Confidence: "high" when paramName + samples both clearly align; "medium" when paramName aligns but samples are ambiguous or absent; "low" when uncertain.

CRITICAL SAFETY CONSTRAINTS — be conservative. The engineer will use your verdict to BULK-APPLY the focal's dictionary mapping to every "isMatch: true" candidate. A false positive propagates a wrong unit/concept across multiple manufacturers and is hard to undo. When in doubt, mark isMatch=false with reasoning="ambiguous — needs manual review".

EXAMPLES:

Focal: "电压(V)" (samples: 5, 12)
Candidates:
1. "电压（V）" (samples: 3.3, 5) → isMatch: true, confidence: high, reasoning: "Same param 'voltage' with full-width vs half-width parens; both V scale."
2. "电压(mV)" (samples: 500, 1200) → isMatch: false, confidence: high, reasoning: "Same concept (voltage) but mV scale — bulk-apply would propagate V unit incorrectly."
3. "Vcc" (samples: 5, 12) → isMatch: true, confidence: medium, reasoning: "Vcc is the standard English label for supply voltage; samples align."
4. "电流(A)" (samples: 1.5) → isMatch: false, confidence: high, reasoning: "Different attribute — current, not voltage."
5. "输入电压(Max)(V)" (samples: 15) → isMatch: false, confidence: high, reasoning: "Same base concept but Max qualifier specifies different spec point — would conflate Typ with Max."

Focal: "电流传输比" (samples: 50%, 100)
Candidate: "电流传输此" (samples: 60%, 80) → isMatch: true, confidence: medium, reasoning: "Single-character typo (比 vs 此); semantically same param 'current transfer ratio'."

Now evaluate:

FOCAL: "${focal.paramName}"${focalSamples}

CANDIDATES:
${candidateList}

Respond in JSON only, no markdown. Return an array with one entry per candidate, in the SAME ORDER as listed above, with this shape:
{"clusters":[{"paramName":"<candidate 1 paramName verbatim>","isMatch":true|false,"confidence":"high|medium|low","reasoning":"one sentence"}, ...]}`;

    const client = new Anthropic({ apiKey });
    // Each verdict is ~120-200 output tokens (paramName + 1-sentence reasoning).
    // At MAX_CANDIDATES=50 the worst case is ~10K — 8000 is the cap below
    // which we observed truncation on full Microcontrollers L2 scope.
    const response = await withAnthropicRetry(
      () =>
        client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: prompt,
          messages: [
            {
              role: 'user',
              content: `Evaluate the ${candidates.length} candidates above against the focal "${focal.paramName}".`,
            },
          ],
        }),
      { label: `cluster-suggest ${focal.paramName}` },
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: { clusters?: unknown };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Disambiguate truncation from genuine bad output — the engineer's
      // recovery path is different (retry / smaller scope vs report a bug).
      const truncated = response.stop_reason === 'max_tokens';
      const errorMsg = truncated
        ? `Model output truncated at ${response.usage.output_tokens} tokens — too many candidates in scope. Try Find Similar on a narrower scope or report this paramName for follow-up.`
        : 'Model returned unparseable JSON';
      console.error('cluster-suggest parse error:', {
        paramName: focal.paramName,
        candidateCount: candidates.length,
        stopReason: response.stop_reason,
        outputTokens: response.usage.output_tokens,
        textSample: text.slice(0, 500),
      });
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 502 },
      );
    }

    if (!Array.isArray(parsed.clusters)) {
      return NextResponse.json(
        { success: false, error: 'Model response missing clusters array' },
        { status: 502 },
      );
    }

    // Validate each verdict. Drop malformed entries silently — caller will see
    // a shorter array and can fall back to manual review.
    const candidateNameSet = new Set(candidates.map((c) => c.paramName));
    const clusters: ClusterVerdict[] = [];
    for (const raw of parsed.clusters) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const paramName = typeof r.paramName === 'string' ? r.paramName : '';
      if (!paramName || !candidateNameSet.has(paramName)) continue;
      const isMatch = r.isMatch === true;
      const confidence: ClusterVerdict['confidence'] =
        r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : 'low';
      const reasoning = typeof r.reasoning === 'string' ? r.reasoning : '';
      clusters.push({ paramName, isMatch, confidence, reasoning });
    }

    return NextResponse.json({ success: true, clusters });
  } catch (error) {
    console.error('cluster-suggest error:', error);
    return NextResponse.json(
      { success: false, error: 'Cluster suggestion failed' },
      { status: 500 },
    );
  }
}
