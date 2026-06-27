import { PartSummary } from '../types';

/**
 * Input shape for narrowing the current search-result card list. Mirrors the
 * role `FilterInput` (recommendationFilter.ts) plays for the recommendations
 * panel: the LLM emits this structured predicate via the `filter_search_results`
 * tool and the server applies it deterministically over the FULL match set —
 * so the chat never has to hand-pick (and drop) MPNs the way present_part_options
 * forced it to.
 *
 * Only dimensions that `PartSummary` reliably carries are supported. Notably
 * absent vs. the recommendations filter: per-attribute value filters (search
 * cards carry only ~3 lightweight keyParameters, not full matchDetails) and
 * mfr_origin (origin is resolved per-recommendation, not on PartSummary).
 */
export interface SearchFilterInput {
  /** Keep only parts that pass every stated spec — the green "Fits your specs"
   *  cards — dropping the "Below spec" ones. Only meaningful when the current
   *  search carried specs/constraints (i.e. cards were scored by the engine). */
  meets_spec?: boolean;
  /** Keep only parts whose manufacturer name contains this string (case-insensitive). */
  manufacturer_filter?: string;
  /** Drop parts whose lifecycle status is Obsolete. */
  exclude_obsolete?: boolean;
  /** Keep only parts carrying an AEC-Q100/Q101/Q200 automotive qualification. */
  aec_qualified_only?: boolean;
}

const AEC_BADGE_RE = /AEC-?Q\s?(?:100|101|200)(?![0-9])/i;

/** Whether a search-result part advertises an AEC automotive qualification via
 *  its `qualifications` badge array. Missing badge → not qualified (inclusive-keep,
 *  same philosophy as isAecQualified for recommendations). */
function partIsAecQualified(p: PartSummary): boolean {
  const quals = p.qualifications;
  return Array.isArray(quals) && quals.some(q => AEC_BADGE_RE.test(q));
}

/** Human-readable label for a SearchFilterInput, for the tool result / chat narration. */
export function describeSearchFilterInput(f: SearchFilterInput): string {
  const parts: string[] = [];
  if (f.meets_spec) parts.push('meets your specs');
  if (f.manufacturer_filter) parts.push(f.manufacturer_filter);
  if (f.aec_qualified_only) parts.push('AEC-qualified');
  if (f.exclude_obsolete) parts.push('active parts');
  return parts.length > 0 ? parts.join(' + ') : 'filtered';
}

/**
 * Apply a SearchFilterInput to a search-result match list. Pure function.
 *
 * `meets_spec` uses the engine's own per-card verdict (`hardFail`, set true iff
 * the candidate had ≥1 real mismatch vs the stated specs) — the exact same signal
 * that drives the "Below spec" chip — so a "show me the ones that meet spec"
 * request returns EVERY green card, never a subset. Parts with no verdict
 * (unscored / unvetted search) are kept: missing data never causes rejection,
 * consistent with the matching engine's missing-data philosophy.
 */
export function applySearchResultFilter(
  matches: PartSummary[],
  input: SearchFilterInput,
): PartSummary[] {
  let filtered = [...matches];

  if (input.meets_spec) {
    filtered = filtered.filter(p => p.hardFail !== true);
  }
  if (input.manufacturer_filter) {
    const query = input.manufacturer_filter.toLowerCase();
    filtered = filtered.filter(p => p.manufacturer.toLowerCase().includes(query));
  }
  if (input.exclude_obsolete) {
    filtered = filtered.filter(p => p.status !== 'Obsolete');
  }
  if (input.aec_qualified_only) {
    filtered = filtered.filter(partIsAecQualified);
  }

  return filtered;
}
