/**
 * Digikey parametric-filter widening (Decision #238 Step 3) — facet matching + in-band
 * value selection. Covers the pieces that turn a ±% band on a voltage/frequency spec into
 * a set of in-band Digikey ValueIds: facet→attribute resolution (findFacetForAttribute),
 * facet ValueName parsing (extractNumericValue), and the in-band filter (criterionToBounds).
 */
import { findFacetForAttribute, extractNumericValue } from '@/lib/services/digikeyMapper';
import { criterionToBounds } from '@/lib/services/fetchWidening';
import type { DigikeyProduct, DigikeyParametricFilter } from '@/lib/services/digikeyClient';

/** Minimal product whose deepest category resolves to a registered param-map category. */
function zenerProduct(): DigikeyProduct {
  return {
    Category: { CategoryId: 287, Name: 'Single Zener Diodes' },
    Parameters: [],
  } as unknown as DigikeyProduct;
}

const vzFacet: DigikeyParametricFilter = {
  ParameterId: 920,
  ParameterText: 'Voltage - Zener (Nom) (Vz)',
  FilterValues: [
    { ValueId: '4.3 V', ValueName: '4.3 V', ProductCount: 5 },
    { ValueId: '4.7 V', ValueName: '4.7 V', ProductCount: 40 },
    { ValueId: '5.1 V', ValueName: '5.1 V', ProductCount: 60 },
    { ValueId: '5.6 V', ValueName: '5.6 V', ProductCount: 35 },
    { ValueId: '6.2 V', ValueName: '6.2 V', ProductCount: 20 },
    { ValueId: '750 mV', ValueName: '750 mV', ProductCount: 2 },
  ],
};

const tolFacet: DigikeyParametricFilter = {
  ParameterId: 99,
  ParameterText: 'Tolerance',
  FilterValues: [{ ValueId: '±5%', ValueName: '±5%', ProductCount: 100 }],
};

describe('findFacetForAttribute', () => {
  it('matches the facet whose ParameterText maps to the target attributeId (via the forward param map)', () => {
    const facet = findFacetForAttribute('vz', [tolFacet, vzFacet], zenerProduct());
    expect(facet).not.toBeNull();
    expect(facet!.ParameterId).toBe(920);
  });

  it('returns null when no facet maps to the target attr (e.g. izt has no Digikey param-map entry)', () => {
    expect(findFacetForAttribute('izt', [tolFacet, vzFacet], zenerProduct())).toBeNull();
  });

  it('returns null when there is no sample product or no facets', () => {
    expect(findFacetForAttribute('vz', [vzFacet], undefined)).toBeNull();
    expect(findFacetForAttribute('vz', [], zenerProduct())).toBeNull();
  });

  it('returns null when the product category has no param-map coverage', () => {
    const unknown = { Category: { CategoryId: 1, Name: 'Mystery Widgets' }, Parameters: [] } as unknown as DigikeyProduct;
    expect(findFacetForAttribute('vz', [vzFacet], unknown)).toBeNull();
  });
});

describe('extractNumericValue — facet ValueName parsing (base SI)', () => {
  it('parses volt facet values', () => {
    expect(extractNumericValue('5.1 V').numericValue).toBeCloseTo(5.1, 6);
    expect(extractNumericValue('750 mV').numericValue).toBeCloseTo(0.75, 6);
    expect(extractNumericValue('1.8 V').numericValue).toBeCloseTo(1.8, 6);
  });

  it('parses frequency facet values with SI prefixes', () => {
    expect(extractNumericValue('400 kHz').numericValue).toBeCloseTo(400_000, 6);
    expect(extractNumericValue('16 MHz').numericValue).toBeCloseTo(16_000_000, 6);
  });

  it('returns no numericValue for a non-numeric facet string (caller filters these out)', () => {
    expect(extractNumericValue('-').numericValue).toBeUndefined();
    expect(extractNumericValue('Standard').numericValue).toBeUndefined();
  });
});

describe('in-band facet-value selection (the apply-step ValueId set)', () => {
  // Mirrors the production predicate in fetchDigikeyCandidates: keep facet values whose parsed
  // base-SI number falls inside the ±% band, then collect their ValueId strings.
  function selectInBandValueIds(facet: DigikeyParametricFilter, lo: number, hi: number): string[] {
    return facet.FilterValues
      .filter(fv => {
        const { numericValue } = extractNumericValue(fv.ValueName);
        return typeof numericValue === 'number' && numericValue >= lo && numericValue <= hi;
      })
      .map(fv => fv.ValueId);
  }

  it('selects the in-band Vz neighbors for 5.1 V ±10%', () => {
    const bounds = criterionToBounds({ kind: 'range', percent: 10 }, 5.1);
    expect(bounds).not.toBeNull();
    // 5.1 ±10% → [4.59, 5.61] → 4.7, 5.1, 5.6 (NOT 4.3, 6.2, 750mV)
    expect(selectInBandValueIds(vzFacet, bounds!.lo, bounds!.hi)).toEqual(['4.7 V', '5.1 V', '5.6 V']);
  });

  it('widens the selection as the band grows', () => {
    const bounds = criterionToBounds({ kind: 'range', percent: 25 }, 5.1);
    // 5.1 ±25% → [3.825, 6.375] → 4.3, 4.7, 5.1, 5.6, 6.2
    expect(selectInBandValueIds(vzFacet, bounds!.lo, bounds!.hi)).toEqual(['4.3 V', '4.7 V', '5.1 V', '5.6 V', '6.2 V']);
  });
});
