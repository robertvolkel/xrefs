import {
  fetchWideningKey,
  isFetchWideningCriterion,
  criterionToBounds,
  criterionToValueSet,
  inBandESeriesValues,
  formatValueForKeyword,
  rangeKeywordTokens,
  MAX_WIDEN_QUERIES,
} from '@/lib/services/fetchWidening';
import type { AcceptanceCriteria } from '@/lib/types';

describe('fetchWidening — eligibility', () => {
  it('classifies range on resistance/capacitance as fetch-widening', () => {
    expect(isFetchWideningCriterion('resistance', { kind: 'range', percent: 10 })).toBe(true);
    expect(isFetchWideningCriterion('resistance_r25', { kind: 'range', percent: 5 })).toBe(true);
    expect(isFetchWideningCriterion('capacitance', { kind: 'range', percent: 20 })).toBe(true);
  });

  it('excludes rescore-only range attrs (inductance/impedance) from fetch widening', () => {
    expect(isFetchWideningCriterion('inductance', { kind: 'range', percent: 10 })).toBe(false);
    expect(isFetchWideningCriterion('impedance_100mhz', { kind: 'range', percent: 10 })).toBe(false);
  });

  it('classifies set on package_case as fetch-widening but NOT AEC sets', () => {
    expect(isFetchWideningCriterion('package_case', { kind: 'set', values: ['0603', '0805'] })).toBe(true);
    expect(isFetchWideningCriterion('aec_q200', { kind: 'set', values: ['Yes', 'No'] })).toBe(false);
  });
});

describe('fetchWidening — fetchWideningKey projection (base cache key)', () => {
  it('returns null when only rescore-only criteria are present (AEC set, inductance range)', () => {
    const criteria: AcceptanceCriteria = {
      aec_q200: { kind: 'set', values: ['Yes', 'No'] },
      inductance: { kind: 'range', percent: 10 },
    };
    expect(fetchWideningKey(criteria)).toBeNull();
  });

  it('includes only fetch-affecting criteria, canonically sorted', () => {
    const criteria: AcceptanceCriteria = {
      resistance: { kind: 'range', percent: 10 },
      aec_q200: { kind: 'set', values: ['No'] },
      package_case: { kind: 'set', values: ['0805', '0603'] },
    };
    expect(fetchWideningKey(criteria)).toEqual([
      { attr: 'package_case', kind: 'set', values: ['0603', '0805'] },
      { attr: 'resistance', kind: 'range', percent: 10 },
    ]);
  });

  it('is stable regardless of input value order (so the cache key is order-insensitive)', () => {
    const a: AcceptanceCriteria = { package_case: { kind: 'set', values: ['0805', '0603'] } };
    const b: AcceptanceCriteria = { package_case: { kind: 'set', values: ['0603', '0805'] } };
    expect(fetchWideningKey(a)).toEqual(fetchWideningKey(b));
  });

  it('returns null for undefined criteria', () => {
    expect(fetchWideningKey(undefined)).toBeNull();
  });
});

describe('fetchWidening — criterionToBounds', () => {
  it('computes ±% bounds from a base-SI source value', () => {
    const b = criterionToBounds({ kind: 'range', percent: 10 }, 4700);
    expect(b).not.toBeNull();
    expect(b!.lo).toBeCloseTo(4230, 6);
    expect(b!.hi).toBeCloseTo(5170, 6);
  });

  it('returns null for set criteria or missing/invalid source value', () => {
    expect(criterionToBounds({ kind: 'set', values: ['x'] }, 4700)).toBeNull();
    expect(criterionToBounds({ kind: 'range', percent: 10 }, undefined)).toBeNull();
    expect(criterionToBounds({ kind: 'range', percent: 10 }, 0)).toBeNull();
    expect(criterionToBounds({ kind: 'range', percent: 10 }, NaN)).toBeNull();
  });
});

describe('fetchWidening — criterionToValueSet', () => {
  it('trims + de-dupes accepted set values', () => {
    expect(criterionToValueSet({ kind: 'set', values: [' 0603 ', '0805', '0603'] })).toEqual(['0603', '0805']);
  });
  it('returns null for range or empty set', () => {
    expect(criterionToValueSet({ kind: 'range', percent: 5 })).toBeNull();
    expect(criterionToValueSet({ kind: 'set', values: ['  ', ''] })).toBeNull();
  });
});

describe('fetchWidening — inBandESeriesValues', () => {
  it('returns the E24 neighbors of 4.7k within ±10%', () => {
    // 4700 ±10% → [4230, 5170]; E24 in band = 4.3k, 4.7k, 5.1k
    expect(inBandESeriesValues(4230, 5170, 'E24')).toEqual([4300, 4700, 5100]);
  });

  it('spans decade boundaries', () => {
    // 900..1300 spans the 100s and 1000s decades
    const vals = inBandESeriesValues(900, 1300, 'E24');
    expect(vals).toContain(910);
    expect(vals).toContain(1000);
    expect(vals).toContain(1200);
  });

  it('uses the coarser E12 grid for capacitance-style enumeration', () => {
    // E12 has no 4.3 mantissa; 4.7 is present
    const vals = inBandESeriesValues(4.0e-9, 5.2e-9, 'E12');
    expect(vals).toEqual([4.7e-9]);
  });

  it('clamps to MAX_WIDEN_QUERIES with a representative spread on a wide band', () => {
    const vals = inBandESeriesValues(1000, 100000, 'E24');
    expect(vals.length).toBeLessThanOrEqual(MAX_WIDEN_QUERIES);
    expect(vals[0]).toBeGreaterThanOrEqual(1000);
    expect(vals[vals.length - 1]).toBeLessThanOrEqual(100000);
  });

  it('returns empty for an invalid band', () => {
    expect(inBandESeriesValues(5000, 1000)).toEqual([]);
    expect(inBandESeriesValues(-1, 10)).toEqual([]);
  });
});

describe('fetchWidening — formatValueForKeyword (base SI → Digikey token)', () => {
  it('formats resistance with SI prefixes', () => {
    expect(formatValueForKeyword(4700, 'resistance')).toBe('4.7k');
    expect(formatValueForKeyword(1e6, 'resistance')).toBe('1M');
    expect(formatValueForKeyword(330, 'resistance')).toBe('330');
    expect(formatValueForKeyword(5100, 'resistance_r25')).toBe('5.1k');
  });

  it('formats capacitance with SI prefixes', () => {
    expect(formatValueForKeyword(1e-7, 'capacitance')).toBe('100nF');
    expect(formatValueForKeyword(4.7e-6, 'capacitance')).toBe('4.7µF');
    expect(formatValueForKeyword(1e-11, 'capacitance')).toBe('10pF');
  });

  it('returns null for non-formattable attrs or bad input', () => {
    expect(formatValueForKeyword(100, 'voltage')).toBeNull();
    expect(formatValueForKeyword(0, 'resistance')).toBeNull();
  });
});

describe('fetchWidening — rangeKeywordTokens (end-to-end fan-out tokens)', () => {
  it('produces the in-band resistance tokens for 4.7k ±10%', () => {
    const tokens = rangeKeywordTokens('resistance', { kind: 'range', percent: 10 }, 4700);
    expect(tokens).toEqual(['4.3k', '4.7k', '5.1k']);
  });

  it('is empty when source value is missing', () => {
    expect(rangeKeywordTokens('resistance', { kind: 'range', percent: 10 }, undefined)).toEqual([]);
  });
});
