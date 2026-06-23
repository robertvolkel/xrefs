import { ApplicationContext, XrefRecommendation, deriveRecommendationBucket } from '@/lib/types';
import { contextExpectedDomains } from './qualificationDomain';

/** Logic-bucket recs within this match % band are considered parametrically equivalent,
 *  allowing compositeScore to break the tie. Outside the band, match % wins. */
const MATCH_PERCENT_TIE_BAND = 2;

/**
 * Display-priority sort for recommendations. Ordering (Jun 2026 policy):
 *
 *   1. **Active first — always.** Every Active part ranks above every non-Active
 *      part (Obsolete/Discontinued/NRND/…), regardless of bucket or score. You're
 *      recommending a *replacement*; a dead part rarely belongs on top.
 *   2. **Certification bucket:** Accuris → MFR → Logic, within each lifecycle tier.
 *      A human-verified cross outranks an inferred logic match.
 *   3. pin-to-pin > functional equivalence, then qualification-domain match.
 *   4. **Match % desc** (compositeScore breaks ties within ±MATCH_PERCENT_TIE_BAND).
 *
 * Why match % rather than raw fail-count is the final key (supersedes the
 * "fewest real mismatches first" primary of Decision #236): a candidate with little
 * parametric data has *zero* real fails simply because every rule scores 'review'
 * (missing) instead of 'fail' — which let sparse, obsolete, even wrong-polarity
 * crosses float to the top. Match % is data-aware: 'review' earns only 50% credit
 * (see matchingEngine scoring), so an under-characterized part is dragged toward 50%
 * while a fully-spec'd part with one real fail (full weight lost on that rule) stays
 * higher. This implements the "penalize sparse data / don't reward no-data"
 * requirement directly. Raw fail-count survives only as a *display filter*
 * (`filterRecsByMismatchCount`), not as a sort key.
 *
 * Qualification-domain tiebreak (Decision #155): `context-matched > unknown >
 * deviation` when the user's context activates a domain filter. Rationale (so future
 * readers don't "fix" it): `unknown` candidates MAY be AEC-qualified — we just haven't
 * built the classifier for their MFR yet (Phase 2 coverage), so they have positive
 * expected value. A confirmed `deviation` (classifier says `industrial_harsh`, context
 * is `automotive`) is definitely not AEC today, so `unknown` ranks ahead of it.
 *
 * Called both server-side (in `getRecommendations()` before cache write) AND client-side
 * (in `RecommendationsPanel`) so `row.replacement` (persisted from `recs[0]` during
 * validation) agrees with the modal's top card. The client re-sorts, so sort-policy
 * changes take effect without a cache-version bump.
 */
export function sortRecommendationsForDisplay(
  recommendations: XrefRecommendation[],
  preferredMpn?: string,
  applicationContext?: ApplicationContext | null,
): XrefRecommendation[] {
  const categoryPriority = (rec: XrefRecommendation): number => {
    const bucket = deriveRecommendationBucket(rec);
    if (bucket === 'accuris') return 0;
    if (bucket === 'manufacturer') return 1;
    return 2;
  };
  // Active is the TOP-LEVEL key (Jun 2026, supersedes Decision #232's within-bucket
  // placement): every Active part ranks above every non-Active part, regardless of
  // certification or score. Only literal 'Active' is top-tier; every other lifecycle
  // status (Obsolete, Discontinued, NRND, LastTimeBuy, Transferred, …) sinks below.
  const statusRank = (rec: XrefRecommendation): number => (rec.part.status === 'Active' ? 0 : 1);
  const mfrEqRank = (rec: XrefRecommendation): number => {
    if (rec.mfrEquivalenceType === 'pin_to_pin') return 0;
    if (rec.mfrEquivalenceType === 'functional') return 1;
    return 2;
  };
  const expected = contextExpectedDomains(applicationContext);
  const domainRank = (rec: XrefRecommendation): number => {
    if (expected.size === 0) return 0; // no domain gating active → neutral
    const d = rec.part.qualificationDomain?.domain;
    if (d && d !== 'unknown' && expected.has(d)) return 0; // context-matched
    if (!d || d === 'unknown') return 1; // unknown — may be qualified
    return 2; // deviation — known mismatch
  };
  const byCategoryThenScore = [...recommendations].sort((a, b) => {
    // 1. Active first — always (a dead part rarely belongs above a live one).
    const statusDiff = statusRank(a) - statusRank(b);
    if (statusDiff !== 0) return statusDiff;

    // 2. Certification bucket: Accuris → MFR → Logic, within the lifecycle tier.
    const catDiff = categoryPriority(a) - categoryPriority(b);
    if (catDiff !== 0) return catDiff;

    // 3. pin-to-pin > functional, then qualification-domain match.
    const mfrDiff = mfrEqRank(a) - mfrEqRank(b);
    if (mfrDiff !== 0) return mfrDiff;
    const domainDiff = domainRank(a) - domainRank(b);
    if (domainDiff !== 0) return domainDiff;

    // 4. Match % desc — the data-aware key. Missing attributes score 'review' = 50%
    //    credit (not skipped), so under-characterized candidates are dragged toward
    //    50% and can't masquerade as a flawless match the way a raw fail-count let
    //    them. Applied to EVERY bucket so sparse certified crosses lose to
    //    fully-spec'd ones. compositeScore breaks near-ties (within ±band).
    const matchDiff = b.matchPercentage - a.matchPercentage;
    if (Math.abs(matchDiff) > MATCH_PERCENT_TIE_BAND) return matchDiff;
    return (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
  });
  if (!preferredMpn) return byCategoryThenScore;
  const prefIdx = byCategoryThenScore.findIndex(r => r.part.mpn === preferredMpn);
  if (prefIdx <= 0) return byCategoryThenScore;
  const [preferred] = byCategoryThenScore.splice(prefIdx, 1);
  return [preferred, ...byCategoryThenScore];
}
