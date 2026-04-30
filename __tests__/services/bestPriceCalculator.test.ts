import { computeBestPrice, formatPrice } from '@/lib/services/bestPriceCalculator';
import type { SupplierQuote } from '@/lib/types';

const quote = (
  supplier: string,
  breaks: Array<[number, number]>,
  opts?: Partial<SupplierQuote> & { currency?: string },
): SupplierQuote => ({
  supplier,
  priceBreaks: breaks.map(([qty, price]) => ({ quantity: qty, unitPrice: price, currency: opts?.currency ?? 'USD' })),
  fetchedAt: '2026-01-01T00:00:00Z',
  ...opts,
});

describe('computeBestPrice', () => {
  it('returns no-quotes when supplier list is empty or undefined', () => {
    expect(computeBestPrice(undefined, 100).kind).toBe('none');
    expect(computeBestPrice([], 100).kind).toBe('none');
  });

  it('picks the lowest unit price across suppliers at the requested qty', () => {
    const result = computeBestPrice(
      [
        quote('Digikey', [[1, 0.5], [10, 0.4], [100, 0.3]]),
        quote('Mouser', [[1, 0.55], [10, 0.42], [100, 0.28]]),
        quote('LCSC', [[1, 0.6], [100, 0.35]]),
      ],
      100,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.top.supplier).toBe('Mouser');
    expect(result.top.unitPrice).toBe(0.28);
    expect(result.top.totalPrice).toBeCloseTo(28);
    expect(result.others).toHaveLength(2);
    expect(result.others[0].supplier).toBe('Digikey');
  });

  it('applies the highest tier <= requested qty (not the lowest)', () => {
    const result = computeBestPrice(
      [quote('Digikey', [[1, 1.0], [10, 0.5], [100, 0.3], [1000, 0.2]])],
      50,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.top.appliedTierQty).toBe(10);
    expect(result.top.unitPrice).toBe(0.5);
  });

  it('caps "others" at top 3 below the headline', () => {
    const result = computeBestPrice(
      [
        quote('A', [[1, 0.10]]),
        quote('B', [[1, 0.20]]),
        quote('C', [[1, 0.30]]),
        quote('D', [[1, 0.40]]),
        quote('E', [[1, 0.50]]),
      ],
      1,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.top.supplier).toBe('A');
    expect(result.others).toHaveLength(3);
    expect(result.others.map(o => o.supplier)).toEqual(['B', 'C', 'D']);
    expect(result.totalSuppliers).toBe(5);
  });

  it('returns fallback when no supplier covers the requested qty (price quoted at MOQ, not cheapest tier)', () => {
    const result = computeBestPrice(
      [
        // Digikey MOQ=10 at $0.50/each, gets cheaper at qty 100 ($0.30)
        quote('Digikey', [[10, 0.5], [100, 0.3]]),
        // Mouser MOQ=25 at $0.40/each
        quote('Mouser', [[25, 0.4]]),
      ],
      5,
    );
    expect(result.kind).toBe('fallback');
    if (result.kind !== 'fallback') return;
    // At each supplier's MOQ, Mouser is cheaper ($0.40 vs $0.50). The earlier
    // bug picked Digikey's cheapest tier ($0.30 at qty 100) which the user
    // can't access at MOQ=10.
    expect(result.minOption.supplier).toBe('Mouser');
    expect(result.minOption.minOrderQty).toBe(25);
    expect(result.minOption.unitPrice).toBe(0.4);
    expect(result.minOption.totalPrice).toBeCloseTo(0.4 * 25);
  });

  it('fallback uses the price AT minOrderQty, not the cheapest tier overall', () => {
    // Real-world Würth-style case: element14 carries qty 5/50/250/500/1000/2000
    // with the cheapest unit price at qty 2000. The fallback for a user asking
    // qty 1 must quote the price at qty 5 (the actual minimum), not qty 2000.
    const result = computeBestPrice(
      [quote('element14', [[5, 0.181], [50, 0.147], [500, 0.10], [2000, 0.095]])],
      1,
    );
    expect(result.kind).toBe('fallback');
    if (result.kind !== 'fallback') return;
    expect(result.minOption.minOrderQty).toBe(5);
    expect(result.minOption.unitPrice).toBe(0.181); // not 0.095
  });

  it('skips suppliers with no price breaks', () => {
    const result = computeBestPrice(
      [
        quote('Empty', []),
        quote('Real', [[1, 1.0]]),
      ],
      1,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.top.supplier).toBe('Real');
  });

  it('rejects non-positive qty', () => {
    expect(computeBestPrice([quote('A', [[1, 1]])], 0).kind).toBe('none');
    expect(computeBestPrice([quote('A', [[1, 1]])], -5).kind).toBe('none');
  });

  it('drops outlier currencies so a SGD quote cannot undercut a USD pack', () => {
    const result = computeBestPrice(
      [
        quote('Stmicro', [[1, 4.30], [10, 3.26], [100, 2.72]], { currency: 'USD' }),
        quote('Digikey', [[1, 4.56], [10, 3.46]], { currency: 'USD' }),
        quote('Avnet', [[1, 4.70], [10, 4.07]], { currency: 'USD' }),
        quote('Element14', [[1, 4.82]], { currency: 'SGD' }),
      ],
      10,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.totalSuppliers).toBe(3);
    expect([result.top.supplier, ...result.others.map(o => o.supplier)]).not.toContain('Element14');
    expect(result.top.currency).toBe('USD');
  });

  it('picks the dominant currency by SUPPLIER count, not break count', () => {
    // The lone USD supplier has 4 breaks vs 2 EUR suppliers with 1 break each.
    // Counting breaks would pick USD (the previous bug); counting suppliers
    // correctly identifies EUR as the dominant pack and drops the USD outlier.
    const result = computeBestPrice(
      [
        quote('A', [[1, 1.00]], { currency: 'EUR' }),
        quote('B', [[1, 1.10]], { currency: 'EUR' }),
        quote('C', [[1, 1.0], [10, 0.9], [100, 0.8], [1000, 0.7]], { currency: 'USD' }),
      ],
      1,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.top.currency).toBe('EUR');
    expect(result.totalSuppliers).toBe(2);
  });

  it('keeps every currency when no clear majority exists (Würth case: 1 GBP + 1 SGD)', () => {
    // No "pack" to protect — each supplier is its own currency island. Filtering
    // either out would arbitrarily hide a valid option from the user. With a
    // strict-majority rule, both stay regardless of which path the result takes.
    const result = computeBestPrice(
      [
        quote('RS Components', [[50, 0.074], [250, 0.053], [500, 0.042], [1000, 0.04]], { currency: 'GBP' }),
        quote('Element14', [[5, 0.181], [50, 0.147], [250, 0.114], [500, 0.10], [1000, 0.096], [2000, 0.095]], { currency: 'SGD' }),
      ],
      50, // hits both suppliers' tier 50
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.totalSuppliers).toBe(2);
    // Both currencies represented in the ranked output.
    const currencies = new Set([result.top.currency, ...result.others.map(o => o.currency)]);
    expect(currencies.has('GBP')).toBe(true);
    expect(currencies.has('SGD')).toBe(true);
  });

  it('surfaces over-minimum suppliers in the match result, sorted + capped at 3', () => {
    // Real-world Würth case: at qty 10, element14 (MOQ 5) qualifies; RS
    // Components (MOQ 50) doesn't. The user should still see RS Components as
    // a "bump quantity to unlock" option in the match-mode answer, not have
    // it silently dropped.
    const result = computeBestPrice(
      [
        quote('element14', [[5, 0.181], [50, 0.147], [500, 0.10]], { currency: 'SGD' }),
        quote('RS Components', [[50, 0.074], [250, 0.053], [1000, 0.04]], { currency: 'GBP' }),
      ],
      10,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.top.supplier).toBe('element14');
    expect(result.overMinimum).toHaveLength(1);
    expect(result.overMinimum[0].supplier).toBe('RS Components');
    expect(result.overMinimum[0].minOrderQty).toBe(50);
    // Quoted at MOQ tier price, not cheapest break.
    expect(result.overMinimum[0].unitPrice).toBe(0.074);
  });

  it('caps overMinimum at 3 entries, sorted by per-unit price ascending', () => {
    const result = computeBestPrice(
      [
        quote('Eligible', [[1, 1.0]]),
        quote('OverA', [[100, 0.30]]),
        quote('OverB', [[100, 0.20]]),
        quote('OverC', [[100, 0.40]]),
        quote('OverD', [[100, 0.10]]),
        quote('OverE', [[100, 0.50]]),
      ],
      1,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.overMinimum).toHaveLength(3);
    expect(result.overMinimum.map(o => o.supplier)).toEqual(['OverD', 'OverB', 'OverA']);
  });

  it('also keeps everything on a tie (2 USD + 2 GBP)', () => {
    const result = computeBestPrice(
      [
        quote('A', [[1, 1.0]], { currency: 'USD' }),
        quote('B', [[1, 1.1]], { currency: 'USD' }),
        quote('C', [[1, 0.9]], { currency: 'GBP' }),
        quote('D', [[1, 0.95]], { currency: 'GBP' }),
      ],
      1,
    );
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.totalSuppliers).toBe(4);
  });
});

describe('formatPrice', () => {
  it('formats sub-$1 prices to 4 decimals', () => {
    expect(formatPrice(0.0125, 'USD')).toMatch(/0\.0125/);
  });
  it('formats >= $1 prices to 2 decimals', () => {
    expect(formatPrice(42.5, 'USD')).toMatch(/42\.50/);
  });
  it('falls back gracefully on bad currency', () => {
    expect(formatPrice(1.23, '')).toMatch(/1\.23/);
  });
});
