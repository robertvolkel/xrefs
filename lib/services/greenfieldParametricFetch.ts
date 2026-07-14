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
import { buildSyntheticSource, leadingMagnitudeToBaseSI } from './searchConstraints';
import { parseStatedBands, widenBandForFetch, type StatedBand } from './statedBands';
import { effectiveThresholdDirection } from './matchingEngine';

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

/** A facet's human ValueName ("25 V", "1 µF", "200 @ 2mA, 5V") → base SI. Shared with the
 *  vetting pass so the catalog VALUES and the candidates' VALUES are read by one parser — the
 *  fetch selecting a "200 @ 2mA" facet value while the scorer read that same part's gain as
 *  0.002 is exactly the kind of split-brain a second copy produces. */
const facetValueToBaseSI = leadingMagnitudeToBaseSI;

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

/**
 * Numeric facet ValueIds in-band for a stated spec.
 *
 * Band shape, by how the ENGINE compares the rule (`effectiveThresholdDirection` — one shared
 * definition, so the fetch and the engine cannot drift apart again):
 *
 *   gte  ("must be RATED for at least X")  → [X, ∞)
 *   lte / fit ("must be no more than X")   → [0, X]
 *   range_superset                         → [X, X×OVERSPEC]  (unchanged — see BACKLOG)
 *   identity ("must BE X", e.g. 1 µF)      → X ± IDENTITY_TOL
 *
 * ⚠️ THE gte BAND HAS NO UPPER BOUND, AND THAT IS THE WHOLE POINT. It used to be [X, X×10],
 * which quietly encoded a false idea: that a part rated far above what you need is a worse
 * answer. It isn't — HEADROOM ON A MAXIMUM RATING IS FREE. Ask for a transistor for a circuit
 * drawing 2 mA and the old band fetched only parts *rated* 2–20 mA: 19 exotic products, while
 * every ordinary small-signal NPN (rated 100 mA, e.g. the BC847) was excluded BY CONSTRUCTION.
 * Un-banded, the same search returns 50 sensible parts with the BC847 third.
 *
 * The pool stays bounded by MAX_VALUES_PER_SPEC taken ProductCount-DESC, which selects the
 * MAINSTREAM ratings — verified: a 12 V MOSFET ask fetches 12–60 V parts and admits zero parts
 * rated ≥100 V, so removing the ceiling does not let exotic high-voltage parts in.
 *
 * Skips bare-integer facets (count-facet trap).
 */
export function pickNumericValueIds(
  facet: DigikeyParametricFilter,
  required: number,
  rule: LogicTable['rules'][number] | undefined,
  explicitBand?: { lo: number; hi: number },
): string[] {
  const fvs = facet.FilterValues ?? [];
  if (fvs.length === 0 || fvs.every(v => isBareInt(v.ValueName))) return [];
  let lo: number;
  let hi: number;
  if (explicitBand) {
    // The user stated a RANGE ("hFE 200-400"). That is a direct instruction about which parts
    // they want, and it outranks anything we would infer from the rule's type — including for a
    // rule the engine cannot compare at all, which would otherwise fall to the identity branch
    // below and band the catalog to ±2% of one end of their range.
    ({ lo, hi } = explicitBand);
  } else {
    const dir = effectiveThresholdDirection(rule);
    if (dir === 'lte') { lo = 0; hi = required; }
    else if (dir === 'gte') { lo = required; hi = Infinity; }
    else if (dir === 'range_superset') { lo = required; hi = required * OVERSPEC_FACTOR; }
    else { lo = required * (1 - IDENTITY_TOL); hi = required * (1 + IDENTITY_TOL); } // identity exact-ish
  }
  return fvs
    .map(v => ({ v, n: facetValueToBaseSI(v.ValueName) }))
    .filter(x => x.n != null && (x.n as number) >= lo && (x.n as number) <= hi)
    .sort((a, b) => (b.v.ProductCount ?? 0) - (a.v.ProductCount ?? 0))
    .slice(0, MAX_VALUES_PER_SPEC)
    .map(x => x.v.ValueId);
}

const CATEGORICAL_TYPES = new Set(['identity', 'identity_upgrade', 'identity_flag']);

/**
 * Build the ParameterFilters for ONE category from the synthetic source's resolved specs.
 *
 * `bands` carries the ranges the user stated EXPLICITLY (see statedBands.ts). They are passed
 * separately because the synthetic source flattens a spec to a single `numericValue` — a stated
 * "200-400" arrives here as just `200`, and the upper bound would be lost. Each is widened
 * outward before use: the fetch is a relevance NET (a boundary part must survive it), and the
 * precise cut happens later in the vetting pass.
 */
export function buildFiltersForCategory(
  specs: ParametricAttribute[],
  logicTable: LogicTable,
  facets: DigikeyParametricFilter[],
  sample: DigikeyProduct | undefined,
  bands?: Map<string, StatedBand>,
): ParametricFilterSpec[] {
  const ruleById = new Map(logicTable.rules.map(r => [r.attributeId, r]));
  const filters: ParametricFilterSpec[] = [];
  for (const spec of specs) {
    const facet = findFacetForAttribute(spec.parameterId, facets, sample);
    if (!facet) continue; // no facet in this category → defer to vetting
    const rule = ruleById.get(spec.parameterId);
    const categorical = !!rule && CATEGORICAL_TYPES.has(rule.logicType) && spec.numericValue === undefined;
    // CATEGORICAL WINS OVER A BAND. A band is meaningless for a code like "SOT-23" or "X7R", and
    // one can still be produced by accident: the range regex matches any `digits SEP digits` run,
    // so a package such as "TO-220-3" parses as the "range" 220-to-3. Consulting the band first
    // would then filter a categorical facet ("0805 (2012 Metric)") numerically and select packages
    // at random. If the synthetic source decided this spec is a code, it is a code.
    const band = categorical ? undefined : bands?.get(spec.parameterId);
    const valueIds = band
      // The band already carries its direction (parseStatedBands drops the free end on a
      // max-rating or limit rule), so it can be used as-is — no direction logic here, which is
      // exactly how this consumer got it wrong before.
      ? pickNumericValueIds(facet, spec.numericValue ?? band.lo, rule, widenBandForFetch(band))
      : categorical
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

  // Ranges the user stated outright ("hFE 200-400"). Parsed from the RAW constraints because the
  // synthetic source keeps only one number per spec — by the time a spec reaches `source`, the
  // 400 is gone.
  const bands = parseStatedBands(constraints, logicTable);

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
      const filters = buildFiltersForCategory(source.parameters, logicTable, discover.facets, discover.products[0], bands);
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
