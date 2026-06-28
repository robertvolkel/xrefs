/**
 * Buyable-replacement selection helpers.
 *
 * Pure logic behind the parts-list "prefer a buyable replacement as the #1 pick" preference
 * (ReplacementPriorities.preferBuyable / buyableRequires). Kept out of the table component so
 * it can be unit-tested directly. Consumed by `pickEffectiveTopRec` in PartsListTable.tsx.
 */

import type { PartsListRow, XrefRecommendation, BuyableRequirement } from '../types';
import { resolveBestRecPrice } from '../columnDefinitions';

/** Total known stock for a rec: sum of FindChips supplier quotes, else the Digikey part stock. */
export function recTotalStock(rec: XrefRecommendation | undefined): number {
  const quotes = rec?.part.supplierQuotes;
  if (quotes && quotes.length > 0) {
    return quotes.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0);
  }
  return rec?.part.quantityAvailable ?? 0;
}

/**
 * A rec is "buyable" when it has a resolvable distributor price (FindChips best, else Digikey
 * unitPrice) and — under the 'price_and_stock' rule — known stock > 0. Used to prefer a
 * purchasable #1 pick over a certified-but-unstocked best match.
 */
export function isBuyable(rec: XrefRecommendation | undefined, requires: BuyableRequirement): boolean {
  if (!rec) return false;
  if (resolveBestRecPrice(rec) == null) return false;
  if (requires === 'price_and_stock' && recTotalStock(rec) <= 0) return false;
  return true;
}

/**
 * The row's known candidate pool, MPN-deduped, in preference order: the current top first
 * (best match), then persisted alternates, then the cheapest viable crosses. All three survive
 * a list reload (allRecommendations does not), so this is the full set buyability can see.
 */
export function getCandidatePool(row: PartsListRow): XrefRecommendation[] {
  const pool: XrefRecommendation[] = [];
  const seen = new Set<string>();
  const add = (rec?: XrefRecommendation) => {
    const mpn = rec?.part.mpn?.toLowerCase();
    if (!rec || !mpn || seen.has(mpn)) return;
    seen.add(mpn);
    pool.push(rec);
  };
  add(row.replacement);
  row.replacementAlternates?.forEach(add);
  row.cheapestViableRecs?.forEach(add);
  return pool;
}
