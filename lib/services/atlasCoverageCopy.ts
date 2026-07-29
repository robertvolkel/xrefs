/**
 * Plain-language tooltip copy for the two admin coverage numbers (Data + Reach).
 *
 * Kept in its own file — with NO logic-table / server imports — so both admin
 * client panels (ManufacturersPanel, AtlasOverviewTab) can import it without
 * pulling the logic-table registry into their bundle. The builders take LIVE
 * counts so the tooltip always reflects the current dataset, never a stale
 * hardcoded figure.
 */

/** Compact number: 2_052_794 → "2.05M", 6_288_428 → "6.29M", 950 → "950".
 *  Null-safe: a missing/NaN count renders "0" rather than throwing (these builders
 *  can receive fields from an older cached payload). */
function compact(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}

/** Data coverage tooltip — what share of the attribute values our rules need
 *  we actually hold, with the live covered/required slot counts spelled out. */
export function dataCoverageTooltip(coveredSlots: number, requiredSlots: number): string {
  return (
    `Of the attribute data our matching rules need — across every part we can classify ` +
    `into a family — how much we actually hold. Right now ${compact(coveredSlots)} of the ` +
    `${compact(requiredSlots)} values our rules look for are filled in. This is the number ` +
    `that rises when you accept dictionary mappings and run "Refresh from accepts".`
  );
}

/** Reach tooltip — what share of the catalog we can classify (and therefore
 *  cross-reference) at all, with the live unclassifiable count spelled out. */
export function reachTooltip(scorableProducts: number, totalProducts: number): string {
  const unclassifiable = Math.max(0, totalProducts - scorableProducts);
  const pct = totalProducts > 0 ? Math.round((unclassifiable / totalProducts) * 100) : 0;
  return (
    `The share of all Atlas parts we can classify into a component family, and therefore ` +
    `cross-reference at all. The other ${pct}% (${unclassifiable.toLocaleString()} parts) have ` +
    `no family yet, so we can't score them. This rises when we add new component families or ` +
    `classifier rules — not when we map attributes.`
  );
}
