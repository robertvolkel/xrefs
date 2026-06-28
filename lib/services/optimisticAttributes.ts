import type { PartAttributes, ParametricAttribute, Part, PartSummary, XrefRecommendation } from '../types';

/**
 * Build a PARTIAL `PartAttributes` from data already in memory, so the source-part
 * panel can render INSTANTLY when the user clicks a part — instead of staring at a
 * blank skeleton for the seconds (historically 20–30s for Atlas parts) the full
 * multi-source fetch takes. The part's specs were literally just on screen; this
 * reuses them.
 *
 * The canonical, complete attributes are still fetched in the background and replace
 * this preview the moment they land. Until then the preview is DISPLAY-ONLY: the
 * confirm flow flips `sourceAttrsReadyRef` to false so replacement-finding (which
 * needs the full source params + subcategory) is gated and never scores against a
 * partial preview. Mirrors the optimistic-open pattern `handleSelectRecommendation`
 * already uses for the comparison view.
 */

/**
 * From a recommendation already on screen: `rec.part` is a full `Part` (rich Overview
 * incl. supplier quotes / lifecycle from FindChips enrichment), and `rec.matchDetails`
 * carry the scored parameter values for a partial Specs preview. `replacementValue` is
 * THIS part's value (the recommendation is becoming the new source).
 */
export function buildOptimisticFromRec(rec: XrefRecommendation): PartAttributes {
  const parameters: ParametricAttribute[] = [];
  rec.matchDetails.forEach((d, i) => {
    if (!d.replacementValue || d.replacementValue === 'N/A') return;
    parameters.push({
      parameterId: d.parameterId,
      parameterName: d.parameterName,
      value: d.replacementValue,
      sortOrder: i,
      recognized: true,
    });
  });
  return {
    part: rec.part,
    parameters,
    dataSource: rec.part.mfrOrigin === 'atlas' ? 'atlas' : undefined,
  };
}

/**
 * From a search-result `PartSummary`: a minimal `Part` header plus any `keyParameters`.
 * `subcategory` is unknown until the full fetch — that's fine, it only feeds logic-table
 * selection, which never runs against this display-only preview (gated by readiness).
 */
export function buildOptimisticFromSummary(s: PartSummary): PartAttributes {
  const parameters: ParametricAttribute[] = (s.keyParameters ?? []).map((kp, i) => ({
    parameterId: `kp-${i}`,
    parameterName: kp.name,
    value: kp.value,
    sortOrder: i,
    recognized: true,
  }));
  const part: Part = {
    mpn: s.mpn,
    manufacturer: s.manufacturer,
    description: s.description,
    detailedDescription: s.description,
    category: s.category,
    subcategory: '',
    status: s.status ?? 'Active',
    qualifications: s.qualifications,
  };
  const dataSource =
    s.dataSource === 'atlas' || s.dataSource === 'partsio' || s.dataSource === 'digikey'
      ? s.dataSource
      : undefined;
  return { part, parameters, dataSource };
}
