/**
 * triageQueueCache — the L1/L2/SWR cache behind the Dictionary Triage queue.
 *
 * Focus: the July 2026 Triage-load fix. Per-row invalidation now MARKS the L2
 * row stale (backdates computed_at) instead of DELETEing it, so the next
 * interactive load serves the last-good snapshot immediately (source='l2-stale')
 * + background-recomputes, instead of blocking on a synchronous rebuild. The
 * mark-stale assertions below FAIL against the old DELETE implementation.
 *
 * Batch-state invalidation (invalidateTriageQueueCacheAndAwaitFresh) intentionally
 * still hard-DELETEs + awaits a fresh recompute (guaranteed-fresh — the Sunlord
 * case) — pinned here so a future edit can't accidentally converge the two.
 */
import { createSupabaseMock, type SupabaseMock, type Row } from '../helpers/supabaseMock';

// The cache module resolves createServiceClient from '@/lib/supabase/service';
// jest.mock MUST use the relative path (the @/ alias resolves for `import` but
// not inside jest.mock). Read the per-test mock off globalThis so the hoisted
// factory stays static while each test swaps the instance.
jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => globalThis.__sbMock.client,
}));

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

type CacheModule = typeof import('../../lib/services/triageQueueCache');

const EPOCH_ISO = new Date(0).toISOString();

const payload = () => ({
  classified: [],
  triageCounts: { synonyms: 0, autoFlagged: 0, total: 0 },
  statusCounts: { open: 0, accepted: 0, undone: 0, deferred: 0, unmappable: 0 },
});

const seededRow = (computedAtIso: string): Row => ({
  key: 'triage-queue',
  payload: payload(),
  computed_at: computedAtIso,
});

/** Fresh cache-module instance (module-global memCache / backgroundRecomputePromise
 *  reset) wired to a fresh supabase mock. */
async function loadFresh(rows: Row[]): Promise<{ mock: SupabaseMock; mod: CacheModule }> {
  jest.resetModules();
  const mock = createSupabaseMock({ tables: { admin_stats_cache: rows } });
  globalThis.__sbMock = mock;
  const mod: CacheModule = await import('../../lib/services/triageQueueCache');
  return { mock, mod };
}

describe('triageQueueCache — per-row invalidation marks stale (does not delete)', () => {
  it('UPDATEs computed_at to the epoch sentinel and leaves the row in place', async () => {
    // Row is currently FRESH (computed_at = ~now).
    const { mock, mod } = await loadFresh([seededRow(new Date(1_700_000_000_000).toISOString())]);

    await mod.invalidateTriageQueueCache();

    // The whole point: NO delete (the old implementation deleted the row).
    expect(mock.writes('admin_stats_cache', 'delete')).toHaveLength(0);
    // Exactly one UPDATE, backdating computed_at to the epoch sentinel.
    const updates = mock.writes('admin_stats_cache', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ computed_at: EPOCH_ISO });
    // Row still present, now marked stale.
    const rows = mock.rows('admin_stats_cache').filter((r) => r.key === 'triage-queue');
    expect(rows).toHaveLength(1);
    expect(rows[0].computed_at).toBe(EPOCH_ISO);
  });

  it('the next read serves the row as l2-stale (so the load never blocks)', async () => {
    const { mod } = await loadFresh([seededRow(new Date(1_700_000_000_000).toISOString())]);
    await mod.invalidateTriageQueueCache();

    const read = await mod.readCachedTriageData();
    expect(read?.source).toBe('l2-stale');
    // ...and it's the SAME last-good payload, not empty.
    expect(read?.data.triageCounts).toEqual(payload().triageCounts);
  });

  it('kicks exactly one background recompute when a compute is registered', async () => {
    const { mod } = await loadFresh([seededRow(new Date(1_700_000_000_000).toISOString())]);
    let calls = 0;
    mod.registerTriageCompute(async () => {
      calls++;
      return payload();
    });

    await mod.invalidateTriageQueueCache();
    // startRecompute runs the stub's synchronous prefix before returning.
    expect(calls).toBe(1);
  });
});

describe('triageQueueCache — batch-state invalidation stays guaranteed-fresh', () => {
  it('hard-DELETEs the row AND awaits a fresh recompute', async () => {
    const { mock, mod } = await loadFresh([seededRow(new Date(1_700_000_000_000).toISOString())]);
    let calls = 0;
    const fresh = {
      classified: [{ paramName: 'x' }],
      triageCounts: { synonyms: 1, autoFlagged: 0, total: 1 },
      statusCounts: { open: 1, accepted: 0, undone: 0, deferred: 0, unmappable: 0 },
    };
    mod.registerTriageCompute(async () => {
      calls++;
      return fresh;
    });

    await mod.invalidateTriageQueueCacheAndAwaitFresh();

    // Distinct from mark-stale: this variant HARD-DELETEs.
    expect(mock.writes('admin_stats_cache', 'delete').length).toBeGreaterThanOrEqual(1);
    // And it awaited a fresh recompute (post-commit).
    expect(calls).toBeGreaterThanOrEqual(1);
    // The cache now reflects the fresh result (warmed L1), not the stale seed.
    const read = await mod.readCachedTriageData();
    expect(read?.data.triageCounts).toEqual(fresh.triageCounts);
  });
});

describe('triageQueueCache — getOrComputeTriageData single-flights', () => {
  it('runs ONE compute for concurrent cold reads (no redundant double-compute)', async () => {
    const { mod } = await loadFresh([]); // cold cache (empty table)
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    mod.registerTriageCompute(async () => {
      calls++;
      await gate;
      return payload();
    });

    const p1 = mod.getOrComputeTriageData();
    const p2 = mod.getOrComputeTriageData();
    release();
    const [a, b] = await Promise.all([p1, p2]);

    expect(calls).toBe(1);
    expect(a?.triageCounts).toEqual(payload().triageCounts);
    expect(b?.triageCounts).toEqual(payload().triageCounts);
  });
});
