import {
  getCategories,
  getCategoryParametricFacets,
  parametricFilterSearchMulti,
  type DigikeyCategory,
  type DigikeyParametricFilter,
  type DigikeyProduct,
  type ParametricFilterSpec,
} from './digikeyClient';
import { findFacetForAttribute } from './digikeyMapper';
import { getTaxonomyPatternsForFamily } from './digikeyParamMap';
import type { LogicTable, ParametricAttribute, SearchConstraint } from '../types';
import { buildSyntheticSource, toBaseSI } from './searchConstraints';

/**
 * Greenfield parametric pool fetch (the foundational greenfield search).
 *
 * Instead of guessing a keyword from the part type (which returns 0 for verbose family
 * names like "Op-Amps / Comparators / Instrumentation Amplifiers" and over-narrows
 * otherwise), this asks the catalog DIRECTLY for the parts matching the user's stated
 * specs, via Digikey's parametric-filter API. The result is a relevance NET — the
 * Decision #243 vetting pass still does the precise ranking ("Fits your specs" /
 * "Below spec"). Returns extra products to UNION into the keyword pool, never fewer.
 *
 * Proven on the live catalog (2026-06-30, docs/greenfield-search-foundational-fix.md):
 *   • Category resolution is keyword-free: family taxonomy names → category tree leaves.
 *   • Capacitor 4-spec AND → 20 exact 1µF/25V/X7R/0805 parts.
 *   • Op-amp CMOS filter across 2 categories → 20 real CMOS op-amps (keyword search = 0).
 *   • THE quirk: Digikey's filter silently returns 0 for BARE-INTEGER count facets
 *     ("Number of Circuits" 2→0 parts despite 10k ProductCount); unit-bearing and opaque
 *     facets filter correctly. We skip bare-integer facets (channel count is cheap via
 *     keyword + vetting), so the AND never collapses to 0 on a count spec.
 */

/** gte band upper = required × this — keep the in-band pool inclusive; vetting's over-spec
 *  penalty sinks the far-over-spec tail. Mirrors searchConstraints.OVERSPEC_FETCH_FACTOR. */
const OVERSPEC_FACTOR = 10;
/** ± tolerance for an exact-match (identity) numeric facet value (SI-prefix encoding drift). */
const IDENTITY_TOL = 0.02;
/** Cap selected facet values per spec (ProductCount-DESC) so a dense facet stays bounded. */
const MAX_VALUES_PER_SPEC = 25;
/** Hard ceiling on categories filtered per family (real families have ≤3-4 leaves). */
const MAX_CATEGORIES = 4;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isBareInt = (s: string): boolean => /^-?\d+$/.test(s.trim());

function flattenLeaves(cats: DigikeyCategory[], acc: DigikeyCategory[] = []): DigikeyCategory[] {
  for (const c of cats) {
    if (!c.ChildCategories || c.ChildCategories.length === 0) acc.push(c);
    else flattenLeaves(c.ChildCategories, acc);
  }
  return acc;
}

/**
 * Resolve a family to its Digikey category IDs WITHOUT a keyword — the op-amp blocker.
 * `getTaxonomyPatternsForFamily` gives the family's Digikey category NAMES; we match them
 * against the (24h-cached) category-tree leaves. Returns [] when nothing matches (caller
 * falls back to the keyword pool — never regresses).
 */
export async function resolveCategoryIdsForFamily(familyId: string): Promise<number[]> {
  const wanted = new Set(getTaxonomyPatternsForFamily(familyId).map(n => n.toLowerCase()));
  if (wanted.size === 0) return [];
  let tree: DigikeyCategory[];
  try {
    tree = await getCategories();
  } catch {
    return [];
  }
  const ids: number[] = [];
  for (const leaf of flattenLeaves(tree)) {
    if (wanted.has((leaf.Name ?? '').toLowerCase()) && !ids.includes(leaf.CategoryId)) {
      ids.push(leaf.CategoryId);
    }
  }
  return ids.slice(0, MAX_CATEGORIES);
}

/** Parse a facet's human ValueName (e.g. "25 V", "1 µF", "5V ~ 10V", "200 @ 2mA") to base SI.
 *  Takes the leading magnitude before any range/condition separator — the spec value, not the
 *  test condition. Returns null when there's no parseable number. */
function facetValueToBaseSI(valueName: string): number | null {
  const head = (valueName ?? '').split(/@|~|≤|≥|±/)[0].trim();
  const m = head.match(/(-?\d[\d.]*)\s*([a-zA-Zµμ%°/√]+)?/);
  if (!m) return null;
  return toBaseSI(m[1], m[2] || undefined);
}

/** Categorical facet ValueIds matching the user's code: exact normalized hit, else first-token
 *  match (so "0805" → "0805 (2012 Metric)", "X7R" → "X7R"). Skips bare-integer facets. */
export function pickCategoricalValueIds(facet: DigikeyParametricFilter, userValue: string): string[] {
  const target = norm(userValue);
  if (!target) return [];
  const fvs = facet.FilterValues ?? [];
  if (fvs.length === 0 || fvs.every(v => isBareInt(v.ValueName))) return []; // count-facet trap
  const exact = fvs.filter(v => norm(v.ValueName) === target);
  const pool = exact.length ? exact : fvs.filter(v => norm((v.ValueName ?? '').split(/[\s(/,]/)[0]) === target);
  return pool
    .filter(v => !isBareInt(v.ValueName))
    .sort((a, b) => (b.ProductCount ?? 0) - (a.ProductCount ?? 0))
    .slice(0, MAX_VALUES_PER_SPEC)
    .map(v => v.ValueId);
}

/** Numeric facet ValueIds in-band for a stated spec. Band shape by rule type: gte threshold →
 *  [v, v×OVERSPEC]; lte/fit → [0, v]; identity (exact, e.g. capacitance) → v ±IDENTITY_TOL.
 *  Skips bare-integer facets (count-facet trap). */
export function pickNumericValueIds(
  facet: DigikeyParametricFilter,
  required: number,
  rule: LogicTable['rules'][number] | undefined,
): string[] {
  const fvs = facet.FilterValues ?? [];
  if (fvs.length === 0 || fvs.every(v => isBareInt(v.ValueName))) return [];
  let lo: number;
  let hi: number;
  const dir = rule?.thresholdDirection ?? 'gte';
  if (rule?.logicType === 'threshold' && dir === 'lte') { lo = 0; hi = required; }
  else if (rule?.logicType === 'threshold' || rule?.logicType === 'fit') { lo = required; hi = required * OVERSPEC_FACTOR; }
  else { lo = required * (1 - IDENTITY_TOL); hi = required * (1 + IDENTITY_TOL); } // identity exact-ish
  return fvs
    .map(v => ({ v, n: facetValueToBaseSI(v.ValueName) }))
    .filter(x => x.n != null && (x.n as number) >= lo && (x.n as number) <= hi)
    .sort((a, b) => (b.v.ProductCount ?? 0) - (a.v.ProductCount ?? 0))
    .slice(0, MAX_VALUES_PER_SPEC)
    .map(x => x.v.ValueId);
}

const CATEGORICAL_TYPES = new Set(['identity', 'identity_upgrade', 'identity_flag']);

/** Build the ParameterFilters for ONE category from the synthetic source's resolved specs. */
export function buildFiltersForCategory(
  specs: ParametricAttribute[],
  logicTable: LogicTable,
  facets: DigikeyParametricFilter[],
  sample: DigikeyProduct | undefined,
): ParametricFilterSpec[] {
  const ruleById = new Map(logicTable.rules.map(r => [r.attributeId, r]));
  const filters: ParametricFilterSpec[] = [];
  for (const spec of specs) {
    const facet = findFacetForAttribute(spec.parameterId, facets, sample);
    if (!facet) continue; // no facet in this category → defer to vetting
    const rule = ruleById.get(spec.parameterId);
    const categorical = !!rule && CATEGORICAL_TYPES.has(rule.logicType) && spec.numericValue === undefined;
    const valueIds = categorical
      ? pickCategoricalValueIds(facet, spec.value)
      : spec.numericValue !== undefined
        ? pickNumericValueIds(facet, spec.numericValue, rule)
        : pickCategoricalValueIds(facet, spec.value); // unitless identity (e.g. dielectric)
    if (valueIds.length) filters.push({ parameterId: facet.ParameterId, valueIds });
  }
  return filters;
}

/**
 * Fetch the greenfield candidate POOL via parametric filtering on the user's stated specs.
 * Returns extra Digikey products to UNION into the keyword pool (deduped by MPN by the caller),
 * or [] when the family can't be classified / category doesn't resolve / no spec maps to a
 * filterable facet — in which case the caller keeps today's keyword-only pool (no regression).
 */
export async function fetchGreenfieldParametricProducts(
  constraints: SearchConstraint[] | undefined,
  partType: string | undefined,
  currency?: string,
  userId?: string,
  familyIdOverride?: string,
  categoryIdsOverride?: number[],
): Promise<DigikeyProduct[]> {
  if (!constraints || constraints.length === 0 || (!partType && !familyIdOverride)) return [];

  // Resolve family + the constraint→attributeId mapping via the same synthetic-source builder
  // the vetting pass uses (empty candidate pool → family from override/partType, raw values kept).
  const synth = buildSyntheticSource(constraints, partType, [], familyIdOverride);
  if (!synth) return [];
  const { logicTable, familyId, source } = synth;

  // Caller may pass pre-resolved categories (guided flow resolves them once for both the
  // category-scoped keyword search and this fetch) — avoids a duplicate category-tree walk.
  const categoryIds = categoryIdsOverride ?? await resolveCategoryIdsForFamily(familyId);
  if (categoryIds.length === 0) return [];

  // Filter every resolved category in parallel; facets split across leaves for multi-category
  // families (op-amps: Amplifier Type in one, supply in another), so each contributes its own
  // in-scope specs. Union the products.
  const perCategory = await Promise.all(
    categoryIds.map(async (categoryId): Promise<DigikeyProduct[]> => {
      const discover = await getCategoryParametricFacets('', categoryId, currency, userId).catch(() => null);
      if (!discover || discover.facets.length === 0) return [];
      const filters = buildFiltersForCategory(source.parameters, logicTable, discover.facets, discover.products[0]);
      if (filters.length === 0) return [];
      const res = await parametricFilterSearchMulti(categoryId, filters, { limit: 50 }, currency, userId).catch(() => null);
      if (!res) return [];
      return [...(res.ExactMatches ?? []), ...(res.Products ?? [])];
    }),
  );

  // Dedup by MPN across categories.
  const byMpn = new Map<string, DigikeyProduct>();
  for (const products of perCategory) {
    for (const p of products) {
      const key = p.ManufacturerProductNumber?.toLowerCase();
      if (key && !byMpn.has(key)) byMpn.set(key, p);
    }
  }
  return [...byMpn.values()];
}
