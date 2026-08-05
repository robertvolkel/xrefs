/**
 * Master-view seeding decision.
 *
 * The app creates the two starter master views ("Basic View", "Replacements")
 * the first time it sees an account that has none. The original implementation
 * asked "did the read return zero views?" — but `fetchMasterViews()` also
 * returned an empty array when the read FAILED, so a transient error was
 * indistinguishable from a genuinely empty account and produced a second set of
 * starter views that nothing ever cleans up.
 *
 * Observed live: one account seeded on 2026-06-03 and again on 2026-07-07,
 * leaving four starter views in the view dropdown.
 *
 * This module is the single place that decides. It is pure so it can be tested
 * without React or Supabase.
 */

import type { MasterView } from '../viewConfigStorage';

/** Outcome of reading the account's master views. */
export type MasterViewReadResult =
  | { ok: true; views: MasterView[] }
  /** The read did not complete — we know NOTHING about what the account holds. */
  | { ok: false };

export type SeedDecision =
  /** Views were read successfully and there is at least one — use them. */
  | { action: 'use-existing' }
  /** Confirmed-empty account with a known signed-in user — safe to create starters. */
  | { action: 'seed' }
  /** Do not read, do not write. Caller should retry rather than invent data. */
  | { action: 'abort'; reason: 'read-failed' | 'no-user' };

/**
 * Decide whether to create the starter master views.
 *
 * The ordering is the safety property, not an implementation detail:
 *  1. A failed read never seeds — this is the duplicate-views bug.
 *  2. A successful read with views always wins, even if the user is unknown —
 *     we never discard data we actually read.
 *  3. An unknown user never seeds — an insert would be attributed to nobody.
 */
export function decideSeedAction(input: {
  userId: string | null;
  read: MasterViewReadResult;
}): SeedDecision {
  const { userId, read } = input;

  if (!read.ok) return { action: 'abort', reason: 'read-failed' };
  if (read.views.length > 0) return { action: 'use-existing' };
  if (!userId) return { action: 'abort', reason: 'no-user' };

  return { action: 'seed' };
}

export type SeedAbort = Extract<SeedDecision, { action: 'abort' }>;

/** An aborted attempt is worth retrying; a decided one is not. */
export function shouldRetry(decision: SeedDecision): decision is SeedAbort {
  return decision.action === 'abort';
}

/** Backoff (ms) before retry attempt N (0-indexed). Short — this runs on page load. */
export const SEED_RETRY_DELAYS_MS = [500, 2000] as const;

/** Total attempts = first try + one per retry delay. */
export const SEED_MAX_ATTEMPTS = SEED_RETRY_DELAYS_MS.length + 1;
