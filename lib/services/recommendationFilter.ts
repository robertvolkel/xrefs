import { XrefRecommendation, RecommendationCategory, PartStatus, deriveRecommendationCategories } from '../types';

export interface AttributeFilter {
  parameter: string;
  operator: 'equals' | 'contains' | 'gte' | 'lte';
  value: string;
}

/** Canonical display order for lifecycle statuses — drives filter labels. */
const STATUS_ORDER: PartStatus[] = ['Active', 'Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'];

const STATUS_LABELS: Record<PartStatus, string> = {
  Active: 'Active',
  Obsolete: 'Obsolete',
  Discontinued: 'Discontinued',
  NRND: 'NRND',
  LastTimeBuy: 'Last Time Buy',
};

/** Every lifecycle status that is not Active. Backs "hide EOL" / "only active". */
export const NON_ACTIVE_STATUSES: PartStatus[] = ['Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'];

/**
 * Resolve the set of lifecycle statuses a filter should hide. Shared by the
 * recommendations filter AND the search-card filter so the two can never drift.
 *
 * `exclude_statuses` is the precise, per-status control: "hide discontinued" must
 * remove Discontinued and NOTHING else. It exists because the original design had
 * only the `exclude_obsolete` boolean below, implemented as a literal
 * `status !== 'Obsolete'` check — so EVERY other lifecycle word ("discontinued",
 * "NRND", "last time buy") silently deleted the user's Obsolete parts and left the
 * ones they actually asked to remove. The word "obsolete" only appeared to work
 * because it happens to equal the enum value.
 *
 * `exclude_obsolete` is retained as a legacy alias (the LLM tool schema still
 * accepts it, and it means exactly what it says: hide `Obsolete`). The two UNION
 * rather than override, so a caller emitting both never silently loses one.
 */
export function resolveExcludedStatuses(input: {
  exclude_statuses?: PartStatus[];
  exclude_obsolete?: boolean;
}): Set<PartStatus> {
  const excluded = new Set<PartStatus>(input.exclude_statuses ?? []);
  if (input.exclude_obsolete) excluded.add('Obsolete');
  return excluded;
}

/** Whether a part's lifecycle status is in the hidden set. A part with NO status
 *  data counts as Active: missing data must never hide a part (same philosophy as
 *  the matching engine, where a missing attribute is `review`, never `fail`). */
export function statusIsExcluded(status: PartStatus | undefined, excluded: Set<PartStatus>): boolean {
  if (excluded.size === 0) return false;
  return excluded.has(status ?? 'Active');
}

/** Human-readable label for a hidden-status set — "hiding Discontinued",
 *  "hiding Obsolete + NRND", or "active parts only" when every non-Active status
 *  is hidden. Returns null when nothing is hidden. */
export function describeExcludedStatuses(excluded: Set<PartStatus>): string | null {
  if (excluded.size === 0) return null;
  if (!excluded.has('Active') && NON_ACTIVE_STATUSES.every(s => excluded.has(s))) {
    return 'active parts only';
  }
  const names = STATUS_ORDER.filter(s => excluded.has(s)).map(s => STATUS_LABELS[s]);
  return `hiding ${names.join(' + ')}`;
}

/**
 * Input shape mirrors the `filter_recommendations` LLM tool. Both the server
 * (when the LLM calls the tool) and the client (when the filter-intent layer
 * intercepts a follow-up query) apply this same filter pipeline so both paths
 * end up at the same panel state.
 */
export interface FilterInput {
  manufacturer_filter?: string;
  min_match_percentage?: number;
  /** Precise per-status lifecycle filter — hide EXACTLY these statuses. "hide
   *  discontinued" → ['Discontinued']; "only active" → every non-Active status.
   *  Preferred over `exclude_obsolete`. */
  exclude_statuses?: PartStatus[];
  /** Legacy alias for `exclude_statuses: ['Obsolete']`. Unions with the above. */
  exclude_obsolete?: boolean;
  exclude_failing_parameters?: string[];
  attribute_filters?: AttributeFilter[];
  sort_by?: string;
  /** Narrow to recommendations belonging to a specific trust category:
   *  'third_party_certified' (Accuris/Mouser), 'manufacturer_certified' (MFR cross-ref),
   *  'logic_driven' (rule-engine match). Maps to UI category chips. */
  category_filter?: RecommendationCategory;
  /** Narrow to recommendations from a specific manufacturer-origin region.
   *  'atlas' = Chinese MFRs (Atlas-sourced). 'western' = US/EU/JP/etc.
   *  Maps to XrefRecommendation.part.mfrOrigin, which is populated for every
   *  rec via the manufacturer alias resolver regardless of dataSource. */
  mfr_origin_filter?: 'atlas' | 'western';
  /** Keep only AEC-qualified replacements (AEC-Q100/Q101/Q200). The binary
   *  "automotive matters" intent — replaces the removed AEC acceptance control.
   *  Inclusive-keep on explicit qualification, so it sidesteps the missing-AEC-data
   *  problem (non-qualified parts that omit AEC are simply not kept). */
  aec_qualified_only?: boolean;
}

/** Human-readable label for a FilterInput, matching the conventions in
 *  filterIntentDetector's sub-detectors. Used to populate `currentFilterLabel`
 *  when the LLM applies a filter via its tool (the deterministic path already
 *  carries a label). Compound filters join their parts with " + ". */
export function describeFilterInput(f: FilterInput): string {
  const parts: string[] = [];
  if (f.manufacturer_filter) parts.push(f.manufacturer_filter);
  if (f.mfr_origin_filter) parts.push(f.mfr_origin_filter === 'atlas' ? 'Chinese MFRs' : 'Western MFRs');
  if (f.category_filter) {
    parts.push(
      f.category_filter === 'third_party_certified' ? 'Accuris-certified'
        : f.category_filter === 'manufacturer_certified' ? 'MFR-certified'
        : 'logic-driven',
    );
  }
  if (typeof f.min_match_percentage === 'number') parts.push(`≥${f.min_match_percentage}% match`);
  if (f.aec_qualified_only) parts.push('AEC-qualified');
  const statusLabel = describeExcludedStatuses(resolveExcludedStatuses(f));
  if (statusLabel) parts.push(statusLabel);
  if (f.exclude_failing_parameters?.length) parts.push('no failing params');
  if (f.attribute_filters?.length) {
    for (const a of f.attribute_filters) parts.push(`${a.parameter} ${a.operator} ${a.value}`);
  }
  return parts.length > 0 ? parts.join(' + ') : 'filtered';
}

const AEC_ATTRIBUTE_IDS = new Set(['aec_q200', 'aec_q101', 'aec_q100']);

/** Whether a recommendation is explicitly AEC-qualified — via an AEC matchDetail that
 *  reads "Yes" (families with an AEC rule) OR the part's `qualifications` badge array
 *  (covers families without an AEC rule). Missing/“No” AEC → not qualified. */
export function isAecQualified(rec: XrefRecommendation): boolean {
  for (const d of rec.matchDetails) {
    if (AEC_ATTRIBUTE_IDS.has(d.parameterId) && d.replacementValue?.trim().toLowerCase() === 'yes') return true;
  }
  const quals = rec.part.qualifications;
  if (Array.isArray(quals) && quals.some(q => /AEC-?Q\s?(?:100|101|200)(?![0-9])/i.test(q))) return true;
  return false;
}

/** Extract a numeric value from a string, handling SI prefixes (e.g. "1 kOhms" → 1000,
 *  "10k" → 10000, "100µF" → 0.0001). Used by attribute-filter `gte` / `lte` operators. */
export function parseNumericFromString(s: string): number | null {
  const siPrefixes: Record<string, number> = {
    'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'µ': 1e-6,
    'm': 1e-3, 'k': 1e3, 'K': 1e3, 'M': 1e6, 'G': 1e9,
  };
  const match = s.match(/([-+]?\d*\.?\d+)\s*([pnuµmkKMG])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const prefix = match[2];
  // 'm' is ambiguous (milli vs mm/meters) — only scale when not followed by another 'm'
  if (prefix && siPrefixes[prefix]) {
    if (prefix === 'm') {
      const afterPrefix = s.slice((match.index ?? 0) + match[0].length);
      if (afterPrefix.startsWith('m')) return num;
    }
    return num * siPrefixes[prefix];
  }
  return num;
}

/** Apply filter_recommendations input to a recommendations array. Pure function
 *  — both server-side (LLM tool dispatch) and client-side (intent interception)
 *  paths share this implementation so filtered results are identical. */
export function applyRecommendationFilter(
  recs: XrefRecommendation[],
  input: FilterInput,
): XrefRecommendation[] {
  let filtered = [...recs];

  if (input.manufacturer_filter) {
    const query = input.manufacturer_filter.toLowerCase();
    filtered = filtered.filter(r => r.part.manufacturer.toLowerCase().includes(query));
  }
  if (input.min_match_percentage != null) {
    filtered = filtered.filter(r => r.matchPercentage >= input.min_match_percentage!);
  }
  const excludedStatuses = resolveExcludedStatuses(input);
  if (excludedStatuses.size > 0) {
    filtered = filtered.filter(r => !statusIsExcluded(r.part.status, excludedStatuses));
  }
  if (input.category_filter) {
    const target = input.category_filter;
    filtered = filtered.filter(r => deriveRecommendationCategories(r).includes(target));
  }
  if (input.mfr_origin_filter) {
    const target = input.mfr_origin_filter;
    filtered = filtered.filter(r => r.part.mfrOrigin === target);
  }
  if (input.aec_qualified_only) {
    filtered = filtered.filter(isAecQualified);
  }
  if (input.exclude_failing_parameters && input.exclude_failing_parameters.length > 0) {
    const excludeNames = input.exclude_failing_parameters.map(n => n.toLowerCase());
    filtered = filtered.filter(r => {
      const failingNames = r.matchDetails
        .filter(d => d.ruleResult === 'fail')
        .map(d => d.parameterName.toLowerCase());
      return !excludeNames.some(name => failingNames.includes(name));
    });
  }
  if (input.attribute_filters && input.attribute_filters.length > 0) {
    for (const af of input.attribute_filters) {
      const paramLower = af.parameter.toLowerCase();
      filtered = filtered.filter(r => {
        const detail = r.matchDetails.find(d => d.parameterName.toLowerCase() === paramLower);
        if (!detail) return false;
        const repValue = detail.replacementValue;
        switch (af.operator) {
          case 'equals':
            return repValue.toLowerCase() === af.value.toLowerCase();
          case 'contains':
            return repValue.toLowerCase().includes(af.value.toLowerCase());
          case 'gte': {
            const repNum = parseNumericFromString(repValue);
            const targetNum = parseNumericFromString(af.value);
            if (repNum == null || targetNum == null) return false;
            return repNum >= targetNum;
          }
          case 'lte': {
            const repNum = parseNumericFromString(repValue);
            const targetNum = parseNumericFromString(af.value);
            if (repNum == null || targetNum == null) return false;
            return repNum <= targetNum;
          }
          default:
            return true;
        }
      });
    }
  }
  if (input.sort_by === 'manufacturer') {
    filtered.sort((a, b) => a.part.manufacturer.localeCompare(b.part.manufacturer));
  } else if (input.sort_by === 'price') {
    filtered.sort((a, b) => (a.part.unitPrice ?? Infinity) - (b.part.unitPrice ?? Infinity));
  } else {
    filtered.sort((a, b) => b.matchPercentage - a.matchPercentage);
  }

  return filtered;
}
