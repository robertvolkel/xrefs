import { XrefRecommendation, RecommendationCategory, deriveRecommendationCategories } from '../types';

export interface AttributeFilter {
  parameter: string;
  operator: 'equals' | 'contains' | 'gte' | 'lte';
  value: string;
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
  if (input.exclude_obsolete) {
    filtered = filtered.filter(r => r.part.status !== 'Obsolete');
  }
  if (input.category_filter) {
    const target = input.category_filter;
    filtered = filtered.filter(r => deriveRecommendationCategories(r).includes(target));
  }
  if (input.mfr_origin_filter) {
    const target = input.mfr_origin_filter;
    filtered = filtered.filter(r => r.part.mfrOrigin === target);
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
