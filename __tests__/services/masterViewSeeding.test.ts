import {
  decideSeedAction,
  shouldRetry,
  SEED_MAX_ATTEMPTS,
  SEED_RETRY_DELAYS_MS,
  type MasterViewReadResult,
} from '@/lib/services/masterViewSeeding';
import type { MasterView } from '@/lib/viewConfigStorage';

const view = (name: string): MasterView => ({
  id: `id_${name}`,
  name,
  columns: ['sys:status'],
  isDefault: false,
  sortOrder: 0,
});

const ok = (views: MasterView[]): MasterViewReadResult => ({ ok: true, views });
const failed: MasterViewReadResult = { ok: false };

const USER = 'user-1';

describe('decideSeedAction', () => {
  // ----------------------------------------------------------------
  // THE BUG: a failed read used to be indistinguishable from an empty
  // account, so it seeded a second set of starter views. Live evidence:
  // one account seeded 2026-06-03 and again 2026-07-07 = 4 views.
  // ----------------------------------------------------------------
  it('never seeds when the read failed, even with a signed-in user', () => {
    expect(decideSeedAction({ userId: USER, read: failed })).toEqual({
      action: 'abort',
      reason: 'read-failed',
    });
  });

  it('never seeds when the read failed and the user is unknown', () => {
    expect(decideSeedAction({ userId: null, read: failed }).action).toBe('abort');
  });

  it('a failed read is NOT treated as an empty account', () => {
    // The precise regression: these two inputs must not decide the same way.
    const onFailure = decideSeedAction({ userId: USER, read: failed });
    const onEmpty = decideSeedAction({ userId: USER, read: ok([]) });
    expect(onFailure.action).not.toBe(onEmpty.action);
  });

  // ----------------------------------------------------------------
  // The path that must keep working: a genuinely new account
  // ----------------------------------------------------------------
  it('seeds a confirmed-empty account with a signed-in user', () => {
    expect(decideSeedAction({ userId: USER, read: ok([]) })).toEqual({ action: 'seed' });
  });

  it('does not seed an empty account when the user is unknown', () => {
    expect(decideSeedAction({ userId: null, read: ok([]) })).toEqual({
      action: 'abort',
      reason: 'no-user',
    });
  });

  // ----------------------------------------------------------------
  // Existing accounts
  // ----------------------------------------------------------------
  it('uses existing views and does not seed', () => {
    expect(decideSeedAction({ userId: USER, read: ok([view('Basic View')]) })).toEqual({
      action: 'use-existing',
    });
  });

  it('uses a full starter set without re-seeding', () => {
    const decision = decideSeedAction({
      userId: USER,
      read: ok([view('Basic View'), view('Replacements')]),
    });
    expect(decision.action).toBe('use-existing');
  });

  it('never discards views it successfully read, even if the user is unknown', () => {
    expect(decideSeedAction({ userId: null, read: ok([view('Basic View')]) })).toEqual({
      action: 'use-existing',
    });
  });

  // ----------------------------------------------------------------
  // Ordering is the safety property. If the empty-check were moved ahead
  // of the read-failure check, the first case here would seed again.
  // ----------------------------------------------------------------
  it('checks read failure before emptiness', () => {
    // A failed read carries no views array at all; treating its absence as
    // "length === 0" is exactly the original defect.
    const decision = decideSeedAction({ userId: USER, read: failed });
    expect(decision.action).toBe('abort');
    expect(decision).not.toEqual({ action: 'seed' });
  });
});

describe('shouldRetry', () => {
  it('retries an aborted attempt', () => {
    expect(shouldRetry({ action: 'abort', reason: 'read-failed' })).toBe(true);
    expect(shouldRetry({ action: 'abort', reason: 'no-user' })).toBe(true);
  });

  it('does not retry a decided attempt', () => {
    expect(shouldRetry({ action: 'seed' })).toBe(false);
    expect(shouldRetry({ action: 'use-existing' })).toBe(false);
  });
});

describe('retry budget', () => {
  it('makes more than one attempt', () => {
    expect(SEED_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(SEED_MAX_ATTEMPTS).toBe(SEED_RETRY_DELAYS_MS.length + 1);
  });

  it('backs off without stalling page load', () => {
    const total = SEED_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(5000);
    expect(SEED_RETRY_DELAYS_MS.every(d => d > 0)).toBe(true);
  });
});
