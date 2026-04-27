import {
  pickCheapestViableRecs,
  resolveBestRecPrice,
} from '@/lib/columnDefinitions';
import type { XrefRecommendation, CertificationSource, MatchDetail, SupplierQuote, RuleResult } from '@/lib/types';

function makeRec(opts: {
  mpn: string;
  certifiedBy?: CertificationSource[];
  failingRules?: number;
  passingRules?: number;
  unitPrice?: number;
  supplierPrices?: number[];
}): XrefRecommendation {
  const fails: MatchDetail[] = Array.from({ length: opts.failingRules ?? 0 }, (_, i) => ({
    parameterId: `f${i}`,
    parameterName: `Fail ${i}`,
    sourceValue: 'a',
    replacementValue: 'b',
    matchStatus: 'different',
    ruleResult: 'fail' as RuleResult,
  }));
  const passes: MatchDetail[] = Array.from({ length: opts.passingRules ?? 0 }, (_, i) => ({
    parameterId: `p${i}`,
    parameterName: `Pass ${i}`,
    sourceValue: 'a',
    replacementValue: 'a',
    matchStatus: 'exact',
    ruleResult: 'pass' as RuleResult,
  }));
  const supplierQuotes: SupplierQuote[] | undefined = opts.supplierPrices
    ? opts.supplierPrices.map((p, i) => ({
        supplier: `dist${i}`,
        unitPrice: p,
        priceBreaks: [{ quantity: 1, unitPrice: p, currency: 'USD' }],
        fetchedAt: new Date().toISOString(),
      }))
    : undefined;
  return {
    part: {
      mpn: opts.mpn,
      manufacturer: 'X',
      description: 'x',
      detailedDescription: 'x',
      category: 'Capacitors',
      subcategory: 'MLCC',
      status: 'Active',
      unitPrice: opts.unitPrice,
      supplierQuotes,
    },
    matchPercentage: 80,
    matchDetails: [...fails, ...passes],
    certifiedBy: opts.certifiedBy,
  };
}

describe('resolveBestRecPrice', () => {
  it('returns min of supplierQuotes unitPrice when present', () => {
    const rec = makeRec({ mpn: 'A', supplierPrices: [0.50, 0.10, 0.30] });
    expect(resolveBestRecPrice(rec)).toBe(0.10);
  });

  it('falls back to part.unitPrice when no supplierQuotes', () => {
    const rec = makeRec({ mpn: 'B', unitPrice: 1.25 });
    expect(resolveBestRecPrice(rec)).toBe(1.25);
  });

  it('returns undefined when no price anywhere', () => {
    expect(resolveBestRecPrice(makeRec({ mpn: 'C' }))).toBeUndefined();
  });

  it('ignores zero/negative quote prices', () => {
    const rec = makeRec({ mpn: 'D', supplierPrices: [0, 0.20, -1] });
    expect(resolveBestRecPrice(rec)).toBe(0.20);
  });
});

describe('pickCheapestViableRecs', () => {
  it('returns empty for undefined / empty input', () => {
    expect(pickCheapestViableRecs(undefined)).toEqual([]);
    expect(pickCheapestViableRecs([])).toEqual([]);
  });

  it('includes Accuris-certified recs even if they have failing rules', () => {
    const rec = makeRec({ mpn: 'ACC', certifiedBy: ['partsio_fff'], failingRules: 2, supplierPrices: [0.50] });
    const out = pickCheapestViableRecs([rec]);
    expect(out).toHaveLength(1);
    expect(out[0]?.part.mpn).toBe('ACC');
  });

  it('includes MFR-certified recs even if they have failing rules', () => {
    const rec = makeRec({ mpn: 'MFR', certifiedBy: ['manufacturer'], failingRules: 1, supplierPrices: [0.30] });
    expect(pickCheapestViableRecs([rec])).toHaveLength(1);
  });

  it('includes rule-passing recs (no failing rules)', () => {
    const rec = makeRec({ mpn: 'PASS', passingRules: 3, supplierPrices: [0.10] });
    expect(pickCheapestViableRecs([rec])).toHaveLength(1);
  });

  it('excludes uncertified recs with at least one failing rule', () => {
    const rec = makeRec({ mpn: 'FAIL', failingRules: 1, passingRules: 2, supplierPrices: [0.05] });
    expect(pickCheapestViableRecs([rec])).toHaveLength(0);
  });

  it('excludes recs without any FC unit price', () => {
    const rec = makeRec({ mpn: 'NOPRICE', certifiedBy: ['partsio_fff'] });
    expect(pickCheapestViableRecs([rec])).toHaveLength(0);
  });

  it('sorts by best FC price ascending', () => {
    const recs = [
      makeRec({ mpn: 'A', passingRules: 1, supplierPrices: [1.00] }),
      makeRec({ mpn: 'B', passingRules: 1, supplierPrices: [0.10] }),
      makeRec({ mpn: 'C', passingRules: 1, supplierPrices: [0.50] }),
    ];
    const out = pickCheapestViableRecs(recs);
    expect(out.map(r => r.part.mpn)).toEqual(['B', 'C', 'A']);
  });

  it('caps at 5 by default', () => {
    const recs = Array.from({ length: 10 }, (_, i) =>
      makeRec({ mpn: `M${i}`, passingRules: 1, supplierPrices: [(i + 1) * 0.10] }),
    );
    expect(pickCheapestViableRecs(recs)).toHaveLength(5);
  });

  it('respects custom cap', () => {
    const recs = Array.from({ length: 10 }, (_, i) =>
      makeRec({ mpn: `M${i}`, passingRules: 1, supplierPrices: [(i + 1) * 0.10] }),
    );
    expect(pickCheapestViableRecs(recs, 3)).toHaveLength(3);
  });

  it('mixes cert + rule-pass and orders by price across both', () => {
    const recs = [
      makeRec({ mpn: 'CERT_EXPENSIVE', certifiedBy: ['partsio_fff'], failingRules: 5, supplierPrices: [2.00] }),
      makeRec({ mpn: 'PASS_CHEAP', passingRules: 1, supplierPrices: [0.05] }),
      makeRec({ mpn: 'CERT_CHEAP', certifiedBy: ['manufacturer'], supplierPrices: [0.15] }),
    ];
    const out = pickCheapestViableRecs(recs);
    expect(out.map(r => r.part.mpn)).toEqual(['PASS_CHEAP', 'CERT_CHEAP', 'CERT_EXPENSIVE']);
  });
});
