/**
 * GET /api/admin/atlas/dictionaries/cluster-candidates?focal=<paramName>
 *
 * Returns the candidate set for the Tier-2 "Find Similar (AI)" cluster modal,
 * gathered SERVER-SIDE over the full cached classified set (Decision #231).
 *
 * Why this exists: under server pagination the client only holds one page of
 * the Triage queue, but the cross-scope cluster feature (Decision #208) must
 * see EVERY open, in-scope row across the WHOLE queue — e.g. matching an
 * `AEC-Q101` focal against every other family's AEC-Q101 row. Gathering
 * candidates from the client's loaded rows would silently degrade to
 * "loaded-rows only," defeating the feature. So the candidate set is built
 * here from the same cached classified set the queue is computed from.
 *
 * Candidates = every classified row that is:
 *   - not the focal,
 *   - not a Tier-1 cosmetic sibling of the focal (already covered by the
 *     "+N similar" chip),
 *   - open (no ACTIVE override — already-mapped rows aren't actionable),
 *   - scoped (dominantFamily || dominantCategory — a bulk-accept can't write
 *     an override without a scope).
 *
 * Pre-sorted exact-normalized-key-first so the highest-likelihood matches rank
 * above the cluster-suggest route's MAX_CANDIDATES cap, then capped here too to
 * bound the payload. The client computes per-candidate scope labels from the
 * returned dominantFamily/dominantCategory (it has the logic-table display
 * names; the server keeps this endpoint cheap).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { getOrComputeTriageData } from '@/lib/services/triageQueueCache';
import type { Classified, GlobalUnmapped } from '@/lib/services/triageQueueCompute';
import { normalizeParamKey } from '@/lib/services/paramNameSimilarity';

export const dynamic = 'force-dynamic';

// Bound the payload. The cluster-suggest route only scores the top 50; we ship
// a few more so the engineer can still see/tick lower-ranked candidates.
const MAX_CANDIDATES = 200;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const focalParam = new URL(request.url).searchParams.get('focal');
    if (!focalParam) {
      return NextResponse.json({ success: false, error: 'Missing focal param' }, { status: 400 });
    }

    const triage = await getOrComputeTriageData();
    if (!triage) {
      // Cold cache with nothing registered — return empty rather than erroring
      // so the modal degrades to "no candidates" instead of a crash.
      return NextResponse.json({ success: true, candidates: [] });
    }
    const classified = triage.classified as Classified[];

    const focal = classified.find((r) => r.paramName === focalParam);
    if (!focal) {
      return NextResponse.json({ success: true, candidates: [] });
    }

    const tier1Names = new Set((focal.similarSiblings ?? []).map((s) => s.paramName));
    const focalNormKey = normalizeParamKey(focal.paramName);

    const candidates: GlobalUnmapped[] = classified
      .filter((r) => {
        if (r.paramName === focal.paramName) return false;
        if (r.acceptedOverride?.isActive) return false;       // already mapped
        if (tier1Names.has(r.paramName)) return false;        // Tier-1 sibling
        return !!(r.dominantFamily || r.dominantCategory);    // has a scope
      })
      // Strip the server-only `effective` discriminator (mirror queryTriage).
      .map(({ effective: _effective, ...rest }) => { void _effective; return rest; });

    // Exact-normalized-key matches first (almost certainly cross-scope hits),
    // then everything else in insertion order. Stable.
    candidates.sort((a, b) => {
      const aExact = normalizeParamKey(a.paramName) === focalNormKey;
      const bExact = normalizeParamKey(b.paramName) === focalNormKey;
      if (aExact === bExact) return 0;
      return aExact ? -1 : 1;
    });

    return NextResponse.json({ success: true, candidates: candidates.slice(0, MAX_CANDIDATES) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
