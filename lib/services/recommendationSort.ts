import { XrefRecommendation, deriveRecommendationBucket } from '@/lib/types';

/** Logic-bucket recs within this match % band are considered parametrically equivalent,
 *  allowing compositeScore to break the tie. Outside the band, match % wins. */
const MATCH_PERCENT_TIE_BAND = 2;

/**
 * Display-priority sort for recommendations: Accuris Certified → MFR Certified → Logic Driven,
 * then pin-to-pin > functional within category.
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
  const byCategoryThenScore = [...recommendations].sort((a, b) => {
    const catDiff = categoryPriority(a) - categoryPriority(b);
    if (catDiff !== 0) return catDiff;
    const mfrDiff = mfrEqRank(a) - mfrEqRank(b);
    if (mfrDiff !== 0) return mfrDiff;

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
