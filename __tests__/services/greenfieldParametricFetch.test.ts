/**
 * Greenfield parametric pool fetch — the value-selection rules that turn a user's stated specs
 * into Digikey ParameterFilters. Pure (no live API): mock facets in the shape the live catalog
 * returns. The load-bearing rule, PROVEN against the live catalog on 2026-06-30
 * (docs/greenfield-search-foundational-fix.md): a facet whose values are BARE INTEGERS
 * ("Number of Circuits" 1/2/4) silently returns 0 from Digikey's filter, so we must NEVER build
 * a filter from it; unit-bearing literal values ("25 V") and opaque-coded values ("X7R"→"331587")
 * filter correctly.
 */
import {
  pickCategoricalValueIds,
  pickNumericValueIds,
  buildFiltersForCategory,
} from '@/lib/services/greenfieldParametricFetch';
import { getLogicTable } from '@/lib/logicTables';
import type { DigikeyParametricFilter, DigikeyProduct } from '@/lib/services/digikeyClient';
import type { ParametricAttribute } from '@/lib/types';

// ── Mock facets in real catalog shape ──
const packageFacet: DigikeyParametricFilter = {
  ParameterId: 16,
  ParameterName: 'Package / Case',
  Category: { Id: 60, Value: 'Ceramic Capacitors' },
  FilterValues: [
    { ValueId: '167852', ValueName: '0805 (2012 Metric)', ProductCount: 5000 },
    { ValueId: '168650', ValueName: '0603 (1608 Metric)', ProductCount: 9000 },
    { ValueId: '168666', ValueName: '1206 (3216 Metric)', ProductCount: 3000 },
  ],
};

const dielectricFacet: DigikeyParametricFilter = {
  ParameterId: 17,
  ParameterName: 'Temperature Coefficient',
  Category: { Id: 60, Value: 'Ceramic Capacitors' },
  FilterValues: [
    { ValueId: '305680', ValueName: 'X7R', ProductCount: 8000 },
    { ValueId: '317283', ValueName: 'X5R', ProductCount: 6000 },
    { ValueId: '318976', ValueName: 'C0G, NP0', ProductCount: 4000 },
  ],
};

const voltageFacet: DigikeyParametricFilter = {
  ParameterId: 14,
  ParameterName: 'Voltage - Rated',
  Category: { Id: 60, Value: 'Ceramic Capacitors' },
  FilterValues: [
    { ValueId: '74515', ValueName: '16V', ProductCount: 7000 },
    { ValueId: '132007', ValueName: '25V', ProductCount: 9000 },
    { ValueId: '228504', ValueName: '50V', ProductCount: 8000 },
    { ValueId: '267452', ValueName: '100V', ProductCount: 3000 },
    { ValueId: '252155', ValueName: '250V', ProductCount: 500 },
  ],
};

// Capacitance is a LITERAL facet (ValueId === ValueName) but UNIT-bearing → filterable.
const capacitanceFacet: DigikeyParametricFilter = {
  ParameterId: 2049,
  ParameterName: 'Capacitance',
  Category: { Id: 60, Value: 'Ceramic Capacitors' },
  FilterValues: [
    { ValueId: '100 pF', ValueName: '100 pF', ProductCount: 2000 },
    { ValueId: '0.1 µF', ValueName: '0.1 µF', ProductCount: 9000 },
    { ValueId: '1 µF', ValueName: '1 µF', ProductCount: 8000 },
    { ValueId: '10 µF', ValueName: '10 µF', ProductCount: 4000 },
  ],
};

// The verified TRAP: bare-integer count facet — Digikey's filter returns 0 for these.
const channelsFacet: DigikeyParametricFilter = {
  ParameterId: 2094,
  ParameterName: 'Number of Circuits',
  Category: { Id: 687, Value: 'Instrumentation, Op Amps, Buffer Amps' },
  FilterValues: [
    { ValueId: '1', ValueName: '1', ProductCount: 14000 },
    { ValueId: '2', ValueName: '2', ProductCount: 10000 },
    { ValueId: '4', ValueName: '4', ProductCount: 5000 },
  ],
};

const capProduct = { Category: { CategoryId: 60, Name: 'Ceramic Capacitors' }, Parameters: [] } as unknown as DigikeyProduct;

describe('pickCategoricalValueIds', () => {
  it('matches a package code by first token (0805 → "0805 (2012 Metric)")', () => {
    expect(pickCategoricalValueIds(packageFacet, '0805')).toEqual(['167852']);
  });

  it('exact-matches a dielectric (X7R → X7R)', () => {
    expect(pickCategoricalValueIds(dielectricFacet, 'X7R')).toEqual(['305680']);
  });

  it('matches C0G against a compound "C0G, NP0" value by first token', () => {
    expect(pickCategoricalValueIds(dielectricFacet, 'C0G')).toEqual(['318976']);
  });

  it('returns [] (NOT a bogus "2" filter) for a bare-integer count facet — the verified trap', () => {
    expect(pickCategoricalValueIds(channelsFacet, '2')).toEqual([]);
  });

  it('returns [] when nothing in the facet matches', () => {
    expect(pickCategoricalValueIds(packageFacet, '0402')).toEqual([]);
  });
});

describe('pickNumericValueIds', () => {
  type NumRule = Parameters<typeof pickNumericValueIds>[2];
  const gteRule = { logicType: 'threshold', thresholdDirection: 'gte' } as unknown as NumRule;
  const lteRule = { logicType: 'threshold', thresholdDirection: 'lte' } as unknown as NumRule;
  const identityRule = { logicType: 'identity' } as unknown as NumRule;

  // REWRITTEN 2026-07-13. This test used to assert the ×10 ceiling ("250V > 20×10 → excluded")
  // — i.e. it PINNED the bug. That ceiling encoded a false idea: that a part rated far above what
  // you need is a worse answer. It is not. Headroom on a MAXIMUM RATING is free, and the ceiling
  // is what excluded every ordinary 100 mA small-signal transistor from a "2 mA circuit" search,
  // leaving 18 exotic parts. See greenfieldFetchBand.test.ts for the full story.
  it('gte: keeps everything AT OR ABOVE the requirement — headroom on a max rating is free', () => {
    const ids = pickNumericValueIds(voltageFacet, 20, gteRule); // band [20, ∞)
    expect(ids).toContain('132007'); // 25V
    expect(ids).toContain('228504'); // 50V
    expect(ids).toContain('267452'); // 100V
    expect(ids).toContain('252155'); // 250V — over-spec is FINE; it used to be excluded
    expect(ids).not.toContain('74515'); // 16V — genuinely below spec, still excluded
  });

  it('lte: keeps values ≤ required (250V max → all ≤250V)', () => {
    const ids = pickNumericValueIds(voltageFacet, 250, lteRule);
    expect(ids).toContain('74515'); // 16V
    expect(ids).toContain('252155'); // 250V
  });

  it('identity: exact ±2% match only (1µF → just 1 µF, not 0.1µF/10µF)', () => {
    const ids = pickNumericValueIds(capacitanceFacet, 1e-6, identityRule); // 1 µF in farads
    expect(ids).toEqual(['1 µF']);
  });

  it('returns [] for a bare-integer facet even with a numeric rule (the trap)', () => {
    expect(pickNumericValueIds(channelsFacet, 2, identityRule)).toEqual([]);
  });
});

describe('buildFiltersForCategory (MLCC, family 12)', () => {
  const mlcc = getLogicTable('12')!;

  it('builds a multi-spec AND across capacitance + voltage + dielectric + package', () => {
    const specs: ParametricAttribute[] = [
      { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1e-6, sortOrder: 1 },
      { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '25 V', numericValue: 25, sortOrder: 2 },
      { parameterId: 'dielectric', parameterName: 'Dielectric', value: 'X7R', sortOrder: 3 },
      { parameterId: 'package_case', parameterName: 'Package / Case', value: '0805', sortOrder: 4 },
    ];
    const filters = buildFiltersForCategory(specs, mlcc, [capacitanceFacet, voltageFacet, dielectricFacet, packageFacet], capProduct);
    const byPid = new Map(filters.map(f => [f.parameterId, f.valueIds]));
    expect(byPid.get(2049)).toEqual(['1 µF']);          // capacitance exact
    expect(byPid.get(17)).toEqual(['305680']);          // X7R
    expect(byPid.get(16)).toEqual(['167852']);          // 0805
    expect(byPid.get(14)).toEqual(expect.arrayContaining(['132007', '228504'])); // ≥25V
    expect(filters.length).toBe(4);
  });

  it('drops a spec whose facet is absent from the category (defers to vetting)', () => {
    const specs: ParametricAttribute[] = [
      { parameterId: 'dielectric', parameterName: 'Dielectric', value: 'X7R', sortOrder: 1 },
    ];
    // only the voltage facet present → dielectric has no facet → no filter built
    expect(buildFiltersForCategory(specs, mlcc, [voltageFacet], capProduct)).toEqual([]);
  });
});
