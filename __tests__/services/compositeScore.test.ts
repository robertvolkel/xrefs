import { computeCompositeScore, LOW_STOCK_THRESHOLD } from '@/lib/services/compositeScore';
import {
  DEFAULT_REPLACEMENT_PRIORITIES,
  type ReplacementPriorities,
  type Part,
  type PartAttributes,
  type XrefRecommendation,
  type SupplierQuote,
  type PartStatus,
} from '@/lib/types';

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    mpn: 'TEST-MPN',
    manufacturer: 'Test Mfr',
    description: 'x',
    detailedDescription: 'x',
    category: 'Capacitors',
    subcategory: 'MLCC Capacitors',
    status: 'Active',
    ...overrides,
  };
}

function makeSource(part: Partial<Part> = {}): PartAttributes {
  return { part: makePart(part), parameters: [] };
}

function makeCandidate(part: Partial<Part> = {}): XrefRecommendation {
  return {
    part: makePart(part),
    matchPercentage: 80,
    matchDetails: [],
  };
}

function quote(unitPrice: number, quantityAvailable: number): SupplierQuote {
  return {
    supplier: 'digikey',
    priceBreaks: [{ quantity: 1, unitPrice, currency: 'USD' }],
    unitPrice,
    quantityAvailable,
    fetchedAt: new Date().toISOString(),
  };
}

const allEnabled: ReplacementPriorities = DEFAULT_REPLACEMENT_PRIORITIES;

describe('computeCompositeScore — lifecycle axis', () => {
  it('Active source + Active candidate → 0 (no upside)', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ status: 'Active' }),
      makeSource({ status: 'Active' }),
      allEnabled,
    );
    expect(axisDeltas.lifecycle).toBe(0);
  });

  it('Obsolete source + Active candidate → delta 1', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ status: 'Active' }),
      makeSource({ status: 'Obsolete' }),
      allEnabled,
    );
    expect(axisDeltas.lifecycle).toBe(1);
  });

  it('NRND source + Active candidate → positive delta', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ status: 'Active' }),
      makeSource({ status: 'NRND' }),
      allEnabled,
    );
    expect(axisDeltas.lifecycle).toBeGreaterThan(0);
    expect(axisDeltas.lifecycle).toBeLessThan(1);
  });

  it('Active source + Obsolete candidate → delta 0 (regression not rewarded)', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ status: 'Obsolete' }),
      makeSource({ status: 'Active' }),
      allEnabled,
    );
    expect(axisDeltas.lifecycle).toBe(0);
  });

  it('blends riskRank when both present — lower cand risk increases delta', () => {
    const srcStatus: PartStatus = 'Active';
    const candStatus: PartStatus = 'Active';
    const equal = computeCompositeScore(
      makeCandidate({ status: candStatus, riskRank: 5 }),
      makeSource({ status: srcStatus, riskRank: 5 }),
      allEnabled,
    );
    const better = computeCompositeScore(
      makeCandidate({ status: candStatus, riskRank: 1 }),
      makeSource({ status: srcStatus, riskRank: 8 }),
      allEnabled,
    );
    expect((better.axisDeltas.lifecycle ?? 0)).toBeGreaterThan(equal.axisDeltas.lifecycle ?? 0);
  });
});

describe('computeCompositeScore — compliance axis', () => {
  it('candidate with RoHS + REACH + AEC-Q100 vs source with only RoHS → positive delta', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ rohsStatus: 'Compliant', reachCompliance: 'Compliant', qualifications: ['AEC-Q100'] }),
      makeSource({ rohsStatus: 'Compliant' }),
      allEnabled,
    );
    expect(axisDeltas.compliance).toBeGreaterThan(0);
  });

  it('candidate missing RoHS that source had → penalized', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ rohsStatus: 'Non-Compliant' }),
      makeSource({ rohsStatus: 'Compliant' }),
      allEnabled,
    );
    expect(axisDeltas.compliance).toBe(0); // base 0 - penalty, floored at 0
  });

  it('3+ extra certifications saturate at delta 1', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({
        rohsStatus: 'Compliant',
        reachCompliance: 'Compliant',
        qualifications: ['AEC-Q100', 'AEC-Q200'],
      }),
      makeSource({}),
      allEnabled,
    );
    expect(axisDeltas.compliance).toBe(1);
  });
});

describe('computeCompositeScore — cost axis', () => {
  it('cheaper candidate → positive cost delta', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ supplierQuotes: [quote(0.5, 1000)] }),
      makeSource({ supplierQuotes: [quote(1.0, 500)] }),
      allEnabled,
    );
    expect(axisDeltas.cost).toBeCloseTo(0.5, 2);
  });

  it('more expensive candidate → 0 (never rewards being expensive)', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ supplierQuotes: [quote(2.0, 1000)] }),
      makeSource({ supplierQuotes: [quote(1.0, 500)] }),
      allEnabled,
    );
    expect(axisDeltas.cost).toBe(0);
  });

  it('missing prices → 0 (neutral, no credit)', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({}),
      makeSource({}),
      allEnabled,
    );
    expect(axisDeltas.cost).toBe(0);
  });
});

describe('computeCompositeScore — stock axis gating', () => {
  it(`source stock >= ${LOW_STOCK_THRESHOLD} → stock axis excluded (activeAxes has no stock)`, () => {
    const { axisDeltas, activeAxes } = computeCompositeScore(
      makeCandidate({ supplierQuotes: [quote(1, 5000)] }),
      makeSource({ supplierQuotes: [quote(1, LOW_STOCK_THRESHOLD + 10)] }),
      allEnabled,
    );
    expect(axisDeltas.stock).toBeUndefined();
    expect(activeAxes).not.toContain('stock');
  });

  it('source stock 0, candidate stock 500 → stock delta 1', () => {
    const { axisDeltas, activeAxes } = computeCompositeScore(
      makeCandidate({ supplierQuotes: [quote(1, 500)] }),
      makeSource({ supplierQuotes: [quote(1, 0)] }),
      allEnabled,
    );
    expect(axisDeltas.stock).toBe(1);
    expect(activeAxes).toContain('stock');
  });

  it('source stock 50, candidate stock 0 → stock delta 0', () => {
    const { axisDeltas } = computeCompositeScore(
      makeCandidate({ supplierQuotes: [quote(1, 0)] }),
      makeSource({ supplierQuotes: [quote(1, 50)] }),
      allEnabled,
    );
    expect(axisDeltas.stock).toBe(0);
  });
});

describe('computeCompositeScore — weight assignment', () => {
  it('disabled axis excluded from weighting', () => {
    const priorities: ReplacementPriorities = {
      order: ['lifecycle', 'cost', 'compliance', 'stock'],
      enabled: { lifecycle: true, compliance: false, cost: true, stock: true },
    };
    const { activeAxes, axisDeltas } = computeCompositeScore(
      makeCandidate({ status: 'Active', rohsStatus: 'Compliant', supplierQuotes: [quote(0.5, 500)] }),
      makeSource({ status: 'Obsolete', supplierQuotes: [quote(1, 0)] }),
      priorities,
    );
    expect(activeAxes).not.toContain('compliance');
    expect(axisDeltas.compliance).toBeUndefined();
  });

  it('all axes disabled → score 0, empty activeAxes', () => {
    const priorities: ReplacementPriorities = {
      order: ['lifecycle', 'compliance', 'cost', 'stock'],
      enabled: { lifecycle: false, compliance: false, cost: false, stock: false },
    };
    const { score, activeAxes } = computeCompositeScore(
      makeCandidate({ status: 'Active' }),
      makeSource({ status: 'Obsolete' }),
      priorities,
    );
    expect(score).toBe(0);
    expect(activeAxes).toEqual([]);
  });

  it('higher-priority axis weighted more heavily', () => {
    // Candidate: big lifecycle win, tiny cost loss. Order A: lifecycle first, Order B: cost first.
    const cand = makeCandidate({ status: 'Active', supplierQuotes: [quote(1.01, 500)] });
    const src = makeSource({ status: 'Obsolete', supplierQuotes: [quote(1.0, 200)] });

    const lifecycleFirst: ReplacementPriorities = {
      order: ['lifecycle', 'cost', 'compliance', 'stock'],
      enabled: { lifecycle: true, cost: true, compliance: false, stock: false },
    };
    const costFirst: ReplacementPriorities = {
      order: ['cost', 'lifecycle', 'compliance', 'stock'],
      enabled: { lifecycle: true, cost: true, compliance: false, stock: false },
    };

    const a = computeCompositeScore(cand, src, lifecycleFirst);
    const b = computeCompositeScore(cand, src, costFirst);
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe('computeCompositeScore — score bounds', () => {
  it('no-data candidate scores 0, not negative', () => {
    const { score } = computeCompositeScore(makeCandidate({}), makeSource({}), allEnabled);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('strictly-better candidate across all axes → high score', () => {
    const src = makeSource({
      status: 'Obsolete',
      rohsStatus: undefined,
      supplierQuotes: [quote(2.0, 0)],
    });
    const cand = makeCandidate({
      status: 'Active',
      rohsStatus: 'Compliant',
      reachCompliance: 'Compliant',
      qualifications: ['AEC-Q100'],
      supplierQuotes: [quote(1.0, 500)],
    });
    const { score } = computeCompositeScore(cand, src, allEnabled);
    expect(score).toBeGreaterThan(70);
  });
});
