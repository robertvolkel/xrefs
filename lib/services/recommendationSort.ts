import { XrefRecommendation, deriveRecommendationBucket } from '@/lib/types';

/**
 * Display-priority sort for recommendations: Accuris Certified → MFR Certified → Logic Driven,
 * then pin-to-pin > functional within category, then by match score. Called both server-side
 * (in `getRecommendations()` before cache write) AND client-side (in `RecommendationsPanel`)
 * so `suggestedReplacement` (persisted from `recs[0]` during validation) agrees with the
 * modal's top card.
 *
 * Uses the mutually-exclusive `deriveRecommendationBucket()` (Accuris > MFR > Logic,
 * Mouser-only → Logic) to keep sort priority aligned with the parts-list bucket count
 * columns (Decision #140).
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
    return b.matchPercentage - a.matchPercentage;
  });
  if (!preferredMpn) return byCategoryThenScore;
  const prefIdx = byCategoryThenScore.findIndex(r => r.part.mpn === preferredMpn);
  if (prefIdx <= 0) return byCategoryThenScore;
  const [preferred] = byCategoryThenScore.splice(prefIdx, 1);
  return [preferred, ...byCategoryThenScore];
}
