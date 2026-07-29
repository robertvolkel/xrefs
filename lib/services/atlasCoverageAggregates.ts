/**
 * Shared Atlas coverage aggregation — the SINGLE definition of "how much of
 * the attribute data our matching rules need do we actually hold".
 *
 * Both admin routes (`/api/admin/atlas` and `/api/admin/manufacturers`) call
 * `get_atlas_coverage_aggregates` and roll its rows up per-manufacturer. Before
 * this module they each had their own copy of that rollup, and the manufacturers
 * route wired a DIFFERENT, inflated source (`param_keys` bucket-distinct) into
 * its headline — so the two pages disagreed by ~10 percentage points for the same
 * manufacturer (Decision: unify on per-product coverage). This module is now the
 * one place the math lives; the anti-drift guarantee is that both routes feed the
 * same pure `rollupCoverageByManufacturer`.
 *
 * Coverage is per PRODUCT, per attribute SLOT: for each scorable product, the RPC
 * counts how many of its family's rule attributeIds are present as keys in its
 * `parameters` JSONB. Denominator = that family's rule count × products. Reported
 * as two numbers (see docs / the tooltip builders in atlasCoverageCopy.ts):
 *   - Data coverage = Σ covered slots / Σ required slots  (rises on dict accepts)
 *   - Reach         = scorable products / all products    (rises on new families)
 */

import { getAllLogicTables } from '@/lib/logicTables';

/** family → its logic-table rule attributeIds. Sent to the RPC as `family_attrs`
 *  so Postgres knows which JSONB keys count as "covered" per family. Static across
 *  requests (logic tables ship with the codebase), so memoised at module scope.
 *  Moved here from app/api/admin/atlas/route.ts so both routes share one copy. */
let familyAttrsCache: Record<string, string[]> | null = null;
export function buildFamilyAttrsPayload(): Record<string, string[]> {
  if (familyAttrsCache) return familyAttrsCache;
  const out: Record<string, string[]> = {};
  for (const table of getAllLogicTables()) {
    out[table.familyId] = table.rules.map((r) => r.attributeId);
  }
  familyAttrsCache = out;
  return out;
}

/** One row of `get_atlas_coverage_aggregates`. Numeric columns come back as
 *  bigints, which some drivers serialize as strings — every consumer coerces
 *  with Number(). We only type the fields the rollup reads. */
export interface CoverageAggRow {
  manufacturer: string;
  family_id: string | null;
  product_count: number | string;
  total_covered: number | string;
  total_rules: number | string;
}

export interface ManufacturerCoverageRollup {
  /** Per-manufacturer covered/required attribute slots, summed across every
   *  (family, category, subcategory) row for that manufacturer. */
  byManufacturer: Map<string, { totalCovered: number; totalRules: number }>;
  /** Dataset-wide covered slots (the Data-coverage numerator). */
  totalCovered: number;
  /** Dataset-wide required slots (the Data-coverage denominator). */
  totalRules: number;
  /** Products carrying a family_id — the Reach numerator. */
  scorableProducts: number;
}

/**
 * THE coverage rollup. Pure — takes RPC rows, returns per-manufacturer and global
 * covered/required slots. Both admin routes call this; the unit test on it is the
 * anti-drift guard (there is no second copy of the math to diverge).
 *
 * The RPC groups by (manufacturer, family_id, category, subcategory), so a
 * manufacturer spans MANY rows — we SUM, never index. A row whose family isn't in
 * the `family_attrs` payload comes back with total_rules = 0 and contributes
 * nothing (guarded), matching the per-row inline math this replaces.
 */
export function rollupCoverageByManufacturer(rows: CoverageAggRow[]): ManufacturerCoverageRollup {
  const byManufacturer = new Map<string, { totalCovered: number; totalRules: number }>();
  let totalCovered = 0;
  let totalRules = 0;
  let scorableProducts = 0;

  for (const r of rows) {
    if (!r.family_id) continue; // non-scorable rows carry no coverage
    scorableProducts += Number(r.product_count);

    const covered = Number(r.total_covered);
    const rules = Number(r.total_rules);
    if (rules <= 0) continue; // family not in family_attrs → no rule slots

    let mc = byManufacturer.get(r.manufacturer);
    if (!mc) {
      mc = { totalCovered: 0, totalRules: 0 };
      byManufacturer.set(r.manufacturer, mc);
    }
    mc.totalCovered += covered;
    mc.totalRules += rules;
    totalCovered += covered;
    totalRules += rules;
  }

  return { byManufacturer, totalCovered, totalRules, scorableProducts };
}

/** Data coverage % — covered slots / required slots. 0 when nothing is scorable. */
export function computeDataCoveragePct(totalCovered: number, totalRules: number): number {
  return totalRules > 0 ? Math.round((totalCovered / totalRules) * 100) : 0;
}

/** Reach % — classifiable products / all products. 0 when the catalog is empty. */
export function computeReachPct(scorableProducts: number, totalProducts: number): number {
  return totalProducts > 0 ? Math.round((scorableProducts / totalProducts) * 100) : 0;
}
