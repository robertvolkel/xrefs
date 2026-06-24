import {
  PartAttributes,
  XrefRecommendation,
  MatchStatus,
  RuleResult,
  ParametricAttribute,
} from '@/lib/types';

/**
 * One row of the side-by-side Specs comparison, unioned across the source part
 * and the replacement candidate so both panels can render the SAME ordered row
 * set and line up vertically.
 *
 * `sourceValue` / `replacementValue` are `null` when that attribute is absent on
 * that side (render a blank "—" at display time). Moving the dash to render time
 * (rather than substituting "—" here) lets the panels' colour/dot logic see a
 * genuine "absent" and style accordingly.
 */
export interface AlignedSpecRow {
  parameterId: string;
  parameterName: string;
  /** Source part's value, or null when the attribute exists only on the replacement side. */
  sourceValue: string | null;
  /** Replacement candidate's value, or null when the attribute exists only on the source side. */
  replacementValue: string | null;
  matchStatus: MatchStatus;
  ruleResult?: RuleResult;
  note?: string;
  /** Data source of the source-side value (drives the D/P/A badge on the left panel). */
  sourceParamSource?: ParametricAttribute['source'];
  /** Data source of the replacement-side value (drives the D/P/A badge on the right panel). */
  replSource?: ParametricAttribute['source'];
  /** Source param's sortOrder (replacement-only rows sort last). */
  sortOrder: number;
  /** Mirrors ParametricAttribute.recognized for the source param (undefined for extra rows). */
  recognized?: boolean;
}

/**
 * Build a single, ordered, unioned row set for the comparison Specs tab.
 *
 * Both the source (left) AttributesPanel and the replacement (right)
 * ComparisonView render from this same array, so every attribute occupies the
 * same row index on both sides. Absent values are `null` (rendered as "—").
 *
 * Ordering: recognized source params first (by sortOrder), then replacement-only
 * attributes from matchDetails appended last. This mirrors the previous
 * "source rows then extra rows" order so existing layouts are preserved — the
 * only change is that source-only rows are no longer dropped from the union.
 *
 * `replacementAttributes` may be null (still loading); rows are produced from the
 * source params + recommendation.matchDetails alone in that case.
 */
export function buildComparisonRows(
  sourceAttributes: PartAttributes,
  replacementAttributes: PartAttributes | null,
  recommendation: XrefRecommendation,
): AlignedSpecRow[] {
  const matchMap = new Map(
    recommendation.matchDetails.map((d) => [d.parameterId, d]),
  );
  const sourceParamIds = new Set(
    sourceAttributes.parameters.map((p) => p.parameterId),
  );

  // Recognized source params first, in the source's own sort order. Atlas
  // unrecognized "extras" (recognized === false) are deliberately excluded —
  // they never appeared on the replacement side, so they stay a source-only
  // appendix below the aligned region (rendered by AttributesPanel).
  const recognizedSource = [...sourceAttributes.parameters]
    .filter((p) => p.recognized !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const sourceRows: AlignedSpecRow[] = recognizedSource.map((sourceParam) => {
    const replParam = replacementAttributes?.parameters.find(
      (p) => p.parameterId === sourceParam.parameterId,
    );
    const matchDetail = matchMap.get(sourceParam.parameterId);

    return {
      parameterId: sourceParam.parameterId,
      parameterName: sourceParam.parameterName,
      sourceValue: sourceParam.value,
      // null (not "—") when absent so render-time styling can detect it.
      replacementValue: replParam?.value ?? matchDetail?.replacementValue ?? null,
      matchStatus: matchDetail?.matchStatus ?? ('different' as MatchStatus),
      ruleResult: matchDetail?.ruleResult,
      note: matchDetail?.note,
      sourceParamSource: sourceParam.source,
      replSource: replParam?.source,
      sortOrder: sourceParam.sortOrder,
      recognized: sourceParam.recognized,
    };
  });

  // Replacement-only attributes: matchDetails not covered by a source param
  // (e.g. application_review rules for datasheet-only specs like SOA Curves, or
  // threshold rules the parametric data lacks). Appended last on BOTH sides;
  // they render blank on the left.
  const extraRows: AlignedSpecRow[] = recommendation.matchDetails
    .filter(
      (d) =>
        !sourceParamIds.has(d.parameterId) &&
        d.ruleResult &&
        d.ruleResult !== 'pass',
    )
    .map((d) => ({
      parameterId: d.parameterId,
      parameterName: d.parameterName,
      sourceValue: d.sourceValue,
      replacementValue: d.replacementValue,
      matchStatus: d.matchStatus,
      ruleResult: d.ruleResult,
      note: d.note,
      sourceParamSource: undefined,
      replSource: undefined,
      sortOrder: Number.MAX_SAFE_INTEGER,
      recognized: true,
    }));

  return [...sourceRows, ...extraRows];
}
