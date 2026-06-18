/**
 * Shared spot-pricing quantity presets + helpers.
 *
 * Single source of truth for the quantity tiers used by BOTH the chat "Best
 * Spot Price" flow (QuantityPrompt) and the Commercial-tab quantity control
 * (QuantityInline). Keeping them here is load-bearing for the feature's premise
 * that the chat and the tab stay in sync — duplicated literals would silently
 * drift.
 */
export const QUANTITY_PRESETS = [1, 10, 100, 1_000, 10_000, 100_000] as const;

/** Compact preset label: 1 / 10 / 100 / 1K / 10K / 100K / 1M. */
export function formatQuantityPreset(q: number): string {
  if (q >= 1_000_000) return `${q / 1_000_000}M`;
  if (q >= 1_000) return `${q / 1_000}K`;
  return String(q);
}

/**
 * Parse a raw quantity string into a positive integer, or null if invalid.
 * Shared validation for the chat prompt and the tab control so they accept the
 * same inputs.
 */
export function parseQuantity(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}
