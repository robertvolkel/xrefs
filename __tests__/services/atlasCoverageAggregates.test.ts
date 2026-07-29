import {
  rollupCoverageByManufacturer,
  computeDataCoveragePct,
  computeReachPct,
  type CoverageAggRow,
} from '@/lib/services/atlasCoverageAggregates';

/**
 * Anti-drift guard for the ONE coverage definition. Both admin routes
 * (/api/admin/atlas and /api/admin/manufacturers) feed their `get_atlas_
 * coverage_aggregates` rows through this same pure function, so pinning its
 * arithmetic here pins both pages at once — there is no second copy to diverge.
 *
 * Coverage is per PRODUCT, per attribute SLOT: total_covered / total_rules,
 * summed across every (family, category, subcategory) row for a manufacturer.
 */

function row(p: Partial<CoverageAggRow> & { manufacturer: string }): CoverageAggRow {
  return {
    family_id: 'B5',
    product_count: 10,
    total_covered: 0,
    total_rules: 0,
    ...p,
  };
}

describe('rollupCoverageByManufacturer', () => {
  it('SUMS a manufacturer that spans multiple (family, category, subcategory) rows', () => {
    // HONGFA-style: one MFR, several rows. Coverage must be the pooled ratio
    // across ALL its products' slots, not a per-row or per-family average.
    const rows: CoverageAggRow[] = [
      row({ manufacturer: 'HONGFA', family_id: 'F1', product_count: 20000, total_covered: 600000, total_rules: 1000000 }),
      row({ manufacturer: 'HONGFA', family_id: 'F1', product_count: 206, total_covered: 3000, total_rules: 10000 }),
    ];
    const { byManufacturer, totalCovered, totalRules } = rollupCoverageByManufacturer(rows);
    const hongfa = byManufacturer.get('HONGFA')!;
    expect(hongfa.totalCovered).toBe(603000);
    expect(hongfa.totalRules).toBe(1010000);
    // Pooled coverage %, not (60% + 30%)/2 = 45%.
    expect(computeDataCoveragePct(hongfa.totalCovered, hongfa.totalRules)).toBe(60);
    // Global equals this single MFR's slots.
    expect(totalCovered).toBe(603000);
    expect(totalRules).toBe(1010000);
  });

  it('keeps manufacturers separate and aggregates the global numerator/denominator', () => {
    const rows: CoverageAggRow[] = [
      row({ manufacturer: 'A', total_covered: 30, total_rules: 100 }),
      row({ manufacturer: 'B', total_covered: 90, total_rules: 100 }),
    ];
    const { byManufacturer, totalCovered, totalRules } = rollupCoverageByManufacturer(rows);
    expect(computeDataCoveragePct(byManufacturer.get('A')!.totalCovered, byManufacturer.get('A')!.totalRules)).toBe(30);
    expect(computeDataCoveragePct(byManufacturer.get('B')!.totalCovered, byManufacturer.get('B')!.totalRules)).toBe(90);
    // Global is product-pooled (60%), NOT the unweighted mean of MFR %s (also 60% here,
    // but the point is it comes from summed slots) — verify via the raw sums.
    expect(totalCovered).toBe(120);
    expect(totalRules).toBe(200);
    expect(computeDataCoveragePct(totalCovered, totalRules)).toBe(60);
  });

  it('excludes non-scorable (family_id = null) rows from coverage but not from the catalog', () => {
    const rows: CoverageAggRow[] = [
      row({ manufacturer: 'A', family_id: 'B5', product_count: 40, total_covered: 20, total_rules: 100 }),
      row({ manufacturer: 'A', family_id: null, product_count: 60, total_covered: 0, total_rules: 0 }),
    ];
    const { byManufacturer, scorableProducts, totalCovered, totalRules } = rollupCoverageByManufacturer(rows);
    // Only the scorable row contributes coverage.
    expect(byManufacturer.get('A')!.totalRules).toBe(100);
    expect(totalCovered).toBe(20);
    expect(totalRules).toBe(100);
    // scorableProducts counts only the family_id row (40), not the 60 search-only.
    expect(scorableProducts).toBe(40);
  });

  it('drops rows whose family carries zero rule slots (family not in family_attrs)', () => {
    const rows: CoverageAggRow[] = [
      row({ manufacturer: 'A', family_id: 'ZZ', product_count: 10, total_covered: 0, total_rules: 0 }),
    ];
    const { byManufacturer, totalRules, scorableProducts } = rollupCoverageByManufacturer(rows);
    // No coverage bucket created for a zero-rule family...
    expect(byManufacturer.has('A')).toBe(false);
    expect(totalRules).toBe(0);
    // ...but it still counts toward scorable products (it has a family_id).
    expect(scorableProducts).toBe(10);
  });

  it('coerces bigint-as-string RPC values', () => {
    const rows: CoverageAggRow[] = [
      { manufacturer: 'A', family_id: 'B5', product_count: '10', total_covered: '25', total_rules: '50' },
    ];
    const { totalCovered, totalRules, scorableProducts } = rollupCoverageByManufacturer(rows);
    expect(totalCovered).toBe(25);
    expect(totalRules).toBe(50);
    expect(scorableProducts).toBe(10);
    expect(computeDataCoveragePct(totalCovered, totalRules)).toBe(50);
  });

  it('handles the empty and all-non-scorable cases without dividing by zero', () => {
    expect(rollupCoverageByManufacturer([])).toEqual({
      byManufacturer: new Map(),
      totalCovered: 0,
      totalRules: 0,
      scorableProducts: 0,
    });
    expect(computeDataCoveragePct(0, 0)).toBe(0);
    expect(computeReachPct(0, 0)).toBe(0);
  });
});

describe('computeReachPct', () => {
  it('is classifiable / total, rounded', () => {
    expect(computeReachPct(288989, 416822)).toBe(69);
    expect(computeReachPct(100, 100)).toBe(100);
  });
});
