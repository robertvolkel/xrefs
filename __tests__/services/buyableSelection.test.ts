import { isBuyable, recTotalStock, getCandidatePool } from '@/lib/services/buyableSelection';
import type { PartsListRow, XrefRecommendation, Part } from '@/lib/types';

function part(over: Partial<Part> = {}): Part {
  return {
    mpn: 'X',
    manufacturer: 'M',
    description: '',
    category: '',
    subcategory: '',
    status: 'Active',
    ...over,
  } as Part;
}

function rec(over: Partial<Part> = {}, mpn = 'X'): XrefRecommendation {
  return {
    part: part({ mpn, ...over }),
    matchPercentage: 90,
    matchDetails: [],
  } as XrefRecommendation;
}

describe('recTotalStock', () => {
  it('sums FindChips supplier quote stock when present', () => {
    const r = rec();
    r.part.supplierQuotes = [
      { supplier: 'a', unitPrice: 1, quantityAvailable: 100 },
      { supplier: 'b', unitPrice: 2, quantityAvailable: 50 },
    ] as Part['supplierQuotes'];
    expect(recTotalStock(r)).toBe(150);
  });

  it('falls back to Digikey part stock when no supplier quotes', () => {
    expect(recTotalStock(rec({ quantityAvailable: 42 }))).toBe(42);
  });

  it('returns 0 when nothing is known', () => {
    expect(recTotalStock(rec())).toBe(0);
    expect(recTotalStock(undefined)).toBe(0);
  });
});

describe('isBuyable', () => {
  it('price mode: a Digikey unit price alone is enough', () => {
    expect(isBuyable(rec({ unitPrice: 0.1 }), 'price')).toBe(true);
  });

  it('price mode: no price → not buyable', () => {
    expect(isBuyable(rec(), 'price')).toBe(false);
  });

  it('price_and_stock: price but no stock → not buyable', () => {
    expect(isBuyable(rec({ unitPrice: 0.1 }), 'price_and_stock')).toBe(false);
  });

  it('price_and_stock: price + Digikey stock → buyable', () => {
    expect(isBuyable(rec({ unitPrice: 0.1, quantityAvailable: 10 }), 'price_and_stock')).toBe(true);
  });

  it('price_and_stock: price + FindChips stock → buyable', () => {
    const r = rec({ unitPrice: 0.1 });
    r.part.supplierQuotes = [{ supplier: 'a', unitPrice: 0.1, quantityAvailable: 5 }] as Part['supplierQuotes'];
    expect(isBuyable(r, 'price_and_stock')).toBe(true);
  });

  it('uses the FindChips best price even when Digikey unitPrice is absent', () => {
    const r = rec();
    r.part.supplierQuotes = [{ supplier: 'a', unitPrice: 0.25, quantityAvailable: 7 }] as Part['supplierQuotes'];
    expect(isBuyable(r, 'price_and_stock')).toBe(true);
  });

  it('undefined rec → not buyable', () => {
    expect(isBuyable(undefined, 'price')).toBe(false);
  });
});

describe('getCandidatePool', () => {
  it('orders replacement first, then alternates, then cheapest-viable, deduped by MPN', () => {
    const row = {
      replacement: rec({}, 'TOP'),
      replacementAlternates: [rec({}, 'ALT1'), rec({}, 'ALT2')],
      cheapestViableRecs: [rec({}, 'ALT1'), rec({}, 'CHEAP')], // ALT1 duplicate
    } as unknown as PartsListRow;
    expect(getCandidatePool(row).map(r => r.part.mpn)).toEqual(['TOP', 'ALT1', 'ALT2', 'CHEAP']);
  });

  it('is MPN-dedup case-insensitive and skips empties', () => {
    const row = {
      replacement: rec({}, 'Top'),
      replacementAlternates: [rec({}, 'top')], // same as replacement, different case
      cheapestViableRecs: [],
    } as unknown as PartsListRow;
    expect(getCandidatePool(row).map(r => r.part.mpn)).toEqual(['Top']);
  });

  it('handles a row with no candidates', () => {
    expect(getCandidatePool({} as PartsListRow)).toEqual([]);
  });
});
