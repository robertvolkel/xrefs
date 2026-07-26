/**
 * Per-manufacturer distributor counting for the search-card "N distributors" badge.
 *
 * FindChips indexes by part-number STRING, so one MPN's results mix every maker that
 * sells it. A maker-blind count (every distributor that carries the MPN under ANY maker)
 * over-states a specific card: an ST card would claim distributors that only stock the
 * onsemi/Rochester version. We store a per-maker breakdown so the badge reflects who
 * actually carries THIS card's maker.
 *
 * Pure + unit-tested. The type-only import of FCDistributorResult keeps this module free
 * of a runtime dependency on findchipsClient (which imports the value helpers here).
 */

import { normalizeMakerName } from './makerNameMatch';
import type { FCDistributorResult } from './findchipsClient';

/** Cached payload under the `fc-distributors` variant. `count` is the maker-blind total
 *  (kept for back-compat + the no-maker caller); `byMaker` is normalized-maker → number
 *  of distributors carrying ≥1 offer of that maker. Legacy rows have no `byMaker`. */
export interface DistributorCountPayload {
  count: number;
  byMaker?: Record<string, number>;
}

/**
 * From a FindChips result set, compute the maker-blind distributor total AND a per-maker
 * breakdown. A distributor counts toward a maker if it lists ≥1 offer of that (normalized)
 * maker; a distributor carrying several makers counts once toward each. Distributors with
 * no parts are ignored (mirrors the maker-blind total's filter).
 */
export function computePerMakerDistributorCounts(
  results: FCDistributorResult[] | null,
): DistributorCountPayload | null {
  if (!results || results.length === 0) return null;
  const withParts = results.filter((r) => r.parts && r.parts.length > 0);
  const count = withParts.length;
  if (count === 0) return null;

  const byMaker: Record<string, number> = {};
  for (const dist of withParts) {
    // Dedupe makers within one distributor so multiple offers of the same maker at one
    // distributor still count as ONE distributor for that maker.
    const makersHere = new Set<string>();
    for (const p of dist.parts) {
      const m = normalizeMakerName(p.manufacturer);
      if (m) makersHere.add(m);
    }
    for (const m of makersHere) byMaker[m] = (byMaker[m] ?? 0) + 1;
  }
  return { count, byMaker };
}

/**
 * Resolve the distributor count to SHOW for a card, given the cached payload and the
 * card's maker.
 *
 * - Maker supplied → return ONLY that maker's distributor count. If the row predates
 *   per-maker counts (legacy `{count}` with no `byMaker`) or simply doesn't list this
 *   maker, return `undefined` (no badge) rather than the maker-blind total — showing a
 *   cross-maker count on a maker-specific card is the thing we're eliminating. Fails safe
 *   (under-show), and the live gap-fill path re-enriches an un-badged card per-maker.
 * - No maker supplied → return the maker-blind total (unchanged legacy behavior for any
 *   caller that doesn't know the card's maker).
 */
export function resolveDistributorCount(
  payload: DistributorCountPayload | undefined | null,
  maker: string | undefined | null,
): number | undefined {
  if (!payload) return undefined;
  if (typeof maker === 'string' && maker.trim().length > 0) {
    const norm = normalizeMakerName(maker);
    const perMaker = norm ? payload.byMaker?.[norm] : undefined;
    return typeof perMaker === 'number' && perMaker > 0 ? perMaker : undefined;
  }
  return typeof payload.count === 'number' ? payload.count : undefined;
}

/**
 * Resolve the count to show on a per-MANUFACTURER search/rec CARD. Identical to
 * resolveDistributorCount EXCEPT a blank/absent maker yields `undefined` (no badge) instead of the
 * maker-blind total — a maker-specific card must never display the cross-maker aggregate (that
 * attributes every maker's distributors to one card, the exact confusion this module eliminates).
 *
 * This is the SINGLE home for the search-card policy. Both call sites — the server badge block in
 * `searchParts` and the client gap-fill in `triggerSearchDistributorEnrichment` — go through it, so
 * the "blank maker ⇒ no badge" rule cannot drift between them (it previously lived inline on the
 * server only, and the client path showed the aggregate — the bug this centralization fixes).
 */
export function resolveCardDistributorCount(
  payload: DistributorCountPayload | undefined | null,
  maker: string | undefined | null,
): number | undefined {
  if (typeof maker !== 'string' || maker.trim().length === 0) return undefined;
  return resolveDistributorCount(payload, maker);
}
