import { ApplicationContext, XrefRecommendation, deriveRecommendationBucket } from '@/lib/types';
import { contextExpectedDomains } from './qualificationDomain';

/** Logic-bucket recs within this match % band are considered parametrically equivalent,
 *  allowing compositeScore to break the tie. Outside the band, match % wins. */
const MATCH_PERCENT_TIE_BAND = 2;

/**
 * Display-priority sort for recommendations: Accuris Certified → MFR Certified → Logic Driven,
 * then pin-to-pin > functional within category.
 *
 * Qualification-domain tiebreak (Decision #155): within each bucket, candidates
 * are ordered `context-matched > unknown > deviation` when the user's context
 * activates a domain filter. Rationale (documented here so future readers don't
 * "fix" it): `unknown` candidates MAY be AEC-qualified — we just haven't built
 * the classifier for their MFR yet (Phase 2 coverage), so they have positive
 * expected value. A confirmed `deviation` (e.g. classifier says
 * `industrial_harsh`, context is `automotive`) is definitely not AEC today.
 * Expected-value ranking therefore puts `unknown` ahead of `deviation` even
 * though "unknown" feels weaker than "known-anything" in isolation.
 *
 * Final tiebreak:
 *   - Certified buckets: compositeScore desc (match % is hidden for certified).
 *   - Logic bucket: match % primary as a parametric floor; compositeScore breaks ties
 *     within ±MATCH_PERCENT_TIE_BAND (Decision #145).
 *
 * Called both server-side (in `getRecommendations()` before cache write) AND client-side
 * (in `RecommendationsPanel`) so `row.replacement` (persisted from `recs[0]` during
 * validation) agrees with the modal's top card.
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
    const catDiff = categoryPriority(a) - categoryPriority(b);
    if (catDiff !== 0) return catDiff;
    const mfrDiff = mfrEqRank(a) - mfrEqRank(b);
    if (mfrDiff !== 0) return mfrDiff;
    const domainDiff = domainRank(a) - domainRank(b);
    if (domainDiff !== 0) return domainDiff;

    // Logic bucket: match % primary floor; composite breaks ties within a small band.
    // Certified buckets: composite is the only tiebreak (match % is hidden anyway).
    const bucket = deriveRecommendationBucket(a);
    if (bucket === 'logic') {
      const matchDiff = b.matchPercentage - a.matchPercentage;
      if (Math.abs(matchDiff) > MATCH_PERCENT_TIE_BAND) return matchDiff;
    }
    return (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
  });
  if (!preferredMpn) return byCategoryThenScore;
  const prefIdx = byCategoryThenScore.findIndex(r => r.part.mpn === preferredMpn);
  if (prefIdx <= 0) return byCategoryThenScore;
  const [preferred] = byCategoryThenScore.splice(prefIdx, 1);
  return [preferred, ...byCategoryThenScore];
}
