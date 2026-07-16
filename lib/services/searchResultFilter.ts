import { PartSummary, PartStatus } from '../types';
import {
  resolveExcludedStatuses,
  statusIsExcluded,
  describeExcludedStatuses,
} from './recommendationFilter';

/**
 * Input shape for narrowing the current search-result card list. Mirrors the
 * role `FilterInput` (recommendationFilter.ts) plays for the recommendations
 * panel: the LLM emits this structured predicate via the `filter_search_results`
 * tool and the server applies it deterministically over the FULL match set —
 * so the chat never has to hand-pick (and drop) MPNs the way present_part_options
 * forced it to.
 *
 * Only dimensions that `PartSummary` reliably carries are supported. Per-attribute
 * value filters remain absent (search cards carry only ~3 lightweight keyParameters,
 * not full matchDetails). `mfr_origin_filter` IS supported as of June 2026: searchParts
 * now resolves `PartSummary.mfrOrigin` per-MFR via the alias resolver (Decision #161),
 * the same canonical-identity signal the recommendations filter uses.
 */
export interface SearchFilterInput {
  /** Keep only parts that pass every stated spec — the green "Fits your specs"
   *  cards — dropping the "Below spec" ones. Only meaningful when the current
   *  search carried specs/constraints (i.e. cards were scored by the engine). */
  meets_spec?: boolean;
  /** Keep only parts whose manufacturer name contains this string (case-insensitive). */
  manufacturer_filter?: string;
  /** Precise per-status lifecycle filter — drop EXACTLY these statuses. "hide
   *  discontinued" → ['Discontinued']; "only active" → every non-Active status.
   *  Shares resolveExcludedStatuses with the recommendations filter. */
  exclude_statuses?: PartStatus[];
  /** Legacy alias for `exclude_statuses: ['Obsolete']`. Unions with the above. */
  exclude_obsolete?: boolean;
  /** Keep only parts carrying an AEC-Q100/Q101/Q200 automotive qualification. */
  aec_qualified_only?: boolean;
  /** Narrow by canonical manufacturer origin. 'atlas' = Chinese makers, 'western' =
   *  US/EU/JP and other non-Chinese. Keys off the resolved `mfrOrigin`, so a Chinese
   *  maker's part that arrived via Digikey (untagged Atlas) is still caught. */
  mfr_origin_filter?: 'atlas' | 'western';
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
  if (f.mfr_origin_filter) parts.push(f.mfr_origin_filter === 'atlas' ? 'Chinese MFRs' : 'Western MFRs');
  if (f.aec_qualified_only) parts.push('AEC-qualified');
  const statusLabel = describeExcludedStatuses(resolveExcludedStatuses(f));
  if (statusLabel) parts.push(statusLabel);
  return parts.length > 0 ? parts.join(' + ') : 'filtered';
}

/**
 * Apply a SearchFilterInput to a search-result match list. Pure function.
 *
 * `meets_spec` reads the card's own verdict (`specFit`) — the exact same signal that draws the chip,
 * so "show me the ones that meet spec" returns precisely the cards labelled "Fits your specs",
 * never a different set.
 *
 * ⚠️ IT USED TO SAY `hardFail !== true`, AND THAT WAS THE SAME LIE THE CHIP WAS TELLING. A rule only
 * fails when a value DISAGREES, so a part whose specs we could not READ has no failures — and this
 * filter kept it. Measured: a "1 to 5 A MOSFET" search returned 20 dual MOSFETs rated 0.115–0.95 A,
 * and a "show me the ones that meet spec" request kept every one of them. The filter's name is a
 * promise; a part we never managed to check does not meet the spec, it is simply UNKNOWN.
 *
 * Two surfaces were each re-deriving this rule from `hardFail`, so each told the lie independently.
 * The verdict is now decided ONCE, server-side (partDataService), and both surfaces read it.
 *
 * `specFit === undefined` (a part-number lookup, or a description with no stated specs) is still
 * KEPT: there is nothing to be unconfirmed about when the user stated no specs. That is the case the
 * old "missing data never rejects" note was actually about, and it is preserved.
 */
export function applySearchResultFilter(
  matches: PartSummary[],
  input: SearchFilterInput,
): PartSummary[] {
  let filtered = [...matches];

  if (input.meets_spec) {
    filtered = filtered.filter(p => p.specFit === undefined || p.specFit === 'fits');
  }
  if (input.manufacturer_filter) {
    const query = input.manufacturer_filter.toLowerCase();
    filtered = filtered.filter(p => p.manufacturer.toLowerCase().includes(query));
  }
  const excludedStatuses = resolveExcludedStatuses(input);
  if (excludedStatuses.size > 0) {
    filtered = filtered.filter(p => !statusIsExcluded(p.status, excludedStatuses));
  }
  if (input.aec_qualified_only) {
    filtered = filtered.filter(partIsAecQualified);
  }
  if (input.mfr_origin_filter) {
    const target = input.mfr_origin_filter;
    if (target === 'atlas') {
      // Chinese = exactly what the card's 🇨🇳 flag shows. The flag (PartOptionsSelector)
      // renders on `dataSource === 'atlas'`, so the filter MUST accept that too —
      // otherwise an Atlas-sourced card the user can SEE is flagged Chinese gets
      // silently dropped because its `mfrOrigin` was never resolved (cache, etc.).
      // `mfrOrigin === 'atlas'` additionally catches a Chinese maker whose part
      // arrived via Digikey (flag still shows via resolved origin).
      filtered = filtered.filter(p => p.mfrOrigin === 'atlas' || p.dataSource === 'atlas');
    } else {
      // Western = resolved non-Chinese. We can't infer this from dataSource alone
      // (a Digikey part may be Chinese), so require the resolved origin, and never
      // count an Atlas-sourced card as Western.
      filtered = filtered.filter(p => p.mfrOrigin === 'western' && p.dataSource !== 'atlas');
    }
  }

  return filtered;
}
