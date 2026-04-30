import type { SupplierQuote } from '../types';

export interface BestPriceOption {
  supplier: string;
  unitPrice: number;
  currency: string;
  totalPrice: number;
  /** The price break tier that was applied — i.e., the largest tier qty ≤ requested qty. */
  appliedTierQty: number;
  /** Distributor's minimum order qty (priceBreaks[0].quantity), useful for diagnostics. */
  minOrderQty: number;
  productUrl?: string;
  inStock?: number;
  authorized?: boolean;
}

export type BestPriceResult =
  | {
      kind: 'match';
      requestedQty: number;
      top: BestPriceOption;
      others: BestPriceOption[];
      /** Suppliers whose MOQ exceeds the requested qty. Surfaced so the user
       *  can decide whether bumping quantity unlocks a better deal at one of
       *  these distributors. Capped at 3, sorted by per-unit price at MOQ. */
      overMinimum: BestPriceOption[];
      totalSuppliers: number;
    }
  | {
      kind: 'fallback';
      requestedQty: number;
      /** Lowest-cost supplier whose minimum order qty exceeds the requested qty.
       *  We surface this so the user can opt in to that minimum tier. */
      minOption: BestPriceOption;
      totalSuppliers: number;
    }
  | {
      kind: 'none';
      requestedQty: number;
      reason: 'no-quotes' | 'no-price-breaks';
    };

/**
 * Compute the best per-unit spot price across supplier quotes at a requested
 * quantity. For each supplier, we apply the highest price-break tier whose
 * `quantity` floor is ≤ the requested qty (standard distributor pricing semantics).
 * Suppliers whose minimum order qty exceeds the requested qty are excluded from
 * the headline ranking — but if NO supplier qualifies, we surface the cheapest
 * over-minimum option as a fallback so the user can choose to up-quantity.
 */
/**
 * Pick the dominant currency across a quote set, counted by SUPPLIERS (not
 * price breaks). Returns a currency only when one has strictly more suppliers
 * than every other — otherwise null, meaning "no dominant pack, keep all
 * currencies." Without an FX rate we can't compare across currencies, but
 * filtering only makes sense when there's a clear pack to protect against
 * a single-supplier outlier (e.g., 3 USD suppliers vs 1 SGD outlier). When
 * each supplier carries a different currency, every quote is "an outlier" by
 * the strict-count rule and nothing gets filtered, which is correct — the
 * user sees all regional options instead of an arbitrary winner.
 */
function pickDominantCurrency(quotes: SupplierQuote[]): string | null {
  // Each supplier contributes one vote — its most-common currency among
  // that supplier's price breaks. Hybrid quotes (rare) get their majority.
  const supplierCurrency = (q: SupplierQuote): string | null => {
    const counts = new Map<string, number>();
    for (const b of q.priceBreaks ?? []) {
      const c = (b.currency || '').toUpperCase();
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: { currency: string; n: number } | null = null;
    for (const [currency, n] of counts) {
      if (!best || n > best.n) best = { currency, n };
    }
    return best?.currency ?? null;
  };

  const supplierVotes = new Map<string, number>();
  for (const q of quotes) {
    const c = supplierCurrency(q);
    if (!c) continue;
    supplierVotes.set(c, (supplierVotes.get(c) ?? 0) + 1);
  }
  if (supplierVotes.size === 0) return null;

  const sorted = [...supplierVotes.entries()].sort((a, b) => b[1] - a[1]);
  const [topCurrency, topCount] = sorted[0];
  const runnerUpCount = sorted[1]?.[1] ?? 0;
  // Strict majority — ties mean no dominant pack.
  return topCount > runnerUpCount ? topCurrency : null;
}

export function computeBestPrice(
  quotes: SupplierQuote[] | undefined,
  requestedQty: number,
): BestPriceResult {
  if (!quotes || quotes.length === 0) {
    return { kind: 'none', requestedQty, reason: 'no-quotes' };
  }
  if (requestedQty <= 0 || !Number.isFinite(requestedQty)) {
    return { kind: 'none', requestedQty, reason: 'no-price-breaks' };
  }

  // Drop quotes whose price breaks are in a non-dominant currency. Without FX
  // conversion, mixing currencies in a min(unitPrice) ranking is incorrect.
  const dominantCurrency = pickDominantCurrency(quotes);
  const filteredQuotes = dominantCurrency
    ? quotes.filter(q =>
        (q.priceBreaks ?? []).some(b => (b.currency || '').toUpperCase() === dominantCurrency),
      )
    : quotes;

  const qualifying: BestPriceOption[] = [];
  const overMinimum: BestPriceOption[] = [];

  for (const quote of filteredQuotes) {
    const breaks = (quote.priceBreaks ?? [])
      .filter(b => !dominantCurrency || (b.currency || '').toUpperCase() === dominantCurrency)
      .slice()
      .sort((a, b) => a.quantity - b.quantity);
    if (breaks.length === 0) continue;

    const minOrderQty = breaks[0].quantity;
    // Largest tier qty ≤ requestedQty wins. If none, this supplier requires a
    // minimum order higher than the user asked for.
    const eligible = breaks.filter(b => b.quantity <= requestedQty);
    const applied = eligible[eligible.length - 1];

    const supplierName = String(quote.supplier);

    if (applied) {
      qualifying.push({
        supplier: supplierName,
        unitPrice: applied.unitPrice,
        currency: applied.currency,
        totalPrice: applied.unitPrice * requestedQty,
        appliedTierQty: applied.quantity,
        minOrderQty,
        productUrl: quote.productUrl,
        inStock: quote.quantityAvailable,
        authorized: quote.authorized,
      });
    } else {
      // requestedQty < minOrderQty — surface the price the user would actually
      // pay if they bumped to this supplier's MOQ. That's the price AT the
      // minimum tier (breaks[0]), not the cheapest tier overall — quoting
      // the cheapest tier is misleading because the user can't access that
      // price at the qty they're being offered.
      const atMinTier = breaks[0];
      overMinimum.push({
        supplier: supplierName,
        unitPrice: atMinTier.unitPrice,
        currency: atMinTier.currency,
        totalPrice: atMinTier.unitPrice * minOrderQty,
        appliedTierQty: atMinTier.quantity,
        minOrderQty,
        productUrl: quote.productUrl,
        inStock: quote.quantityAvailable,
        authorized: quote.authorized,
      });
    }
  }

  const totalSuppliers = qualifying.length + overMinimum.length;

  if (qualifying.length > 0) {
    qualifying.sort((a, b) => a.unitPrice - b.unitPrice);
    overMinimum.sort((a, b) => a.unitPrice - b.unitPrice);
    return {
      kind: 'match',
      requestedQty,
      top: qualifying[0],
      others: qualifying.slice(1, 4), // top 3 below the headline
      overMinimum: overMinimum.slice(0, 3), // up to 3 higher-MOQ alternates
      totalSuppliers,
    };
  }

  if (overMinimum.length > 0) {
    overMinimum.sort((a, b) => a.unitPrice - b.unitPrice);
    return {
      kind: 'fallback',
      requestedQty,
      minOption: overMinimum[0],
      totalSuppliers,
    };
  }

  return { kind: 'none', requestedQty, reason: 'no-price-breaks' };
}

/** Format a unit price using the price's own currency code via Intl.NumberFormat. */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: amount < 1 ? 4 : 2,
      maximumFractionDigits: amount < 1 ? 4 : 2,
    }).format(amount);
  } catch {
    // Bad currency codes (FindChips occasionally returns blanks) — fall back to bare number.
    return amount.toFixed(amount < 1 ? 4 : 2);
  }
}
