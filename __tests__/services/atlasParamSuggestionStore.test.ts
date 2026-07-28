/**
 * Store-layer contract tests for the shared verdict read. These pin the review-fix
 * behaviours a route harness would otherwise be the only way to catch:
 *   • single-flight — the route reads the verdict map AND the accept-detail map
 *     in one Promise.all, so a cold read must issue ONE rpc, not two;
 *   • negative cache — a failure is remembered briefly so a sustained outage
 *     isn't re-hit every request, and an invalidation clears it to retry;
 *   • generation guard — a read invalidated mid-flight returns its result to its
 *     awaiter but must NOT cache the (now pre-write) data.
 *
 * Supabase is mocked with the repo's standard pattern: a globalThis stub (jest
 * hoists the mock factory above every declaration) + a RELATIVE mock path (`@/`
 * resolves for imports but NOT inside jest.mock). The `rpc` stub counts calls
 * and serves FIFO results (or a caller-controlled `rpcImpl` promise for the
 * mid-flight case); `from` throws because these cases never touch it (defer-only
 * / error results never reach fetchSuggestionDetails).
 */

type RpcResult = { data: unknown; error: unknown };

declare global {
  var VERDICT_STUB: {
    rpcCalls: number;
    results: RpcResult[];
    delayMs: number;
    /** When set, the rpc returns THIS promise instead of a FIFO result — lets a
     *  test hold the rpc open and resolve it by hand (mid-flight invalidation). */
    rpcImpl: (() => Promise<RpcResult>) | null;
  };
}
globalThis.VERDICT_STUB = { rpcCalls: 0, results: [], delayMs: 0, rpcImpl: null };

jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: async () => {
      globalThis.VERDICT_STUB.rpcCalls += 1;
      if (globalThis.VERDICT_STUB.rpcImpl) return globalThis.VERDICT_STUB.rpcImpl();
      if (globalThis.VERDICT_STUB.delayMs > 0) {
        await new Promise((r) => setTimeout(r, globalThis.VERDICT_STUB.delayMs));
      }
      return globalThis.VERDICT_STUB.results.shift() ?? { data: [], error: null };
    },
    from: () => {
      throw new Error('from() should not be called in these tests (no accept rows)');
    },
  }),
}));

import {
  fetchVerdictMap,
  fetchAcceptDetailMap,
  invalidateVerdictMapCache,
} from '@/lib/services/atlasParamSuggestionStore';

const STUB = globalThis.VERDICT_STUB;

beforeEach(() => {
  invalidateVerdictMapCache();
  STUB.rpcCalls = 0;
  STUB.results = [];
  STUB.delayMs = 0;
  STUB.rpcImpl = null;
});

describe('fetchRawVerdicts single-flight', () => {
  it('collapses concurrent cold reads (verdict map + accept-detail map) into ONE rpc', async () => {
    // Defer-only rows → fetchAcceptDetailMap finds no accept pairs and never
    // calls fetchSuggestionDetails (so the `from()` guard stays untripped).
    STUB.results = [{ data: [{ family_id: 'B5', param_name: 'x', verdict: 'defer' }], error: null }];
    STUB.delayMs = 10; // hold the rpc so the second caller must join the in-flight promise

    const [vm, adm] = await Promise.all([fetchVerdictMap(), fetchAcceptDetailMap()]);

    expect(STUB.rpcCalls).toBe(1);   // ← fails on today's code (fires twice cold)
    expect(vm.size).toBe(1);         // the defer row landed in the verdict map
    expect(adm).not.toBeNull();      // success → a map (empty, no accepts), not a failure
    expect(adm?.size).toBe(0);
  });
});

describe('verdict read: negative cache + invalidate', () => {
  it('serves a recent failure from the negative cache (no re-hit), and invalidate clears it to retry', async () => {
    STUB.results = [
      { data: null, error: { message: 'boom' } },                                       // call 1: fail
      { data: [{ family_id: 'B5', param_name: 'x', verdict: 'accept' }], error: null },  // call 2 (after invalidate): succeed
    ];

    const first = await fetchVerdictMap();
    expect(first.size).toBe(0);      // fail-open: empty for this call
    expect(STUB.rpcCalls).toBe(1);

    const second = await fetchVerdictMap();   // within the failure window → negative cache
    expect(second.size).toBe(0);
    expect(STUB.rpcCalls).toBe(1);            // ← NO re-hit (fails if the negative cache is missing)

    invalidateVerdictMapCache();              // a write clears the negative cache
    const third = await fetchVerdictMap();    // now retries
    expect(third.size).toBe(1);               // ← retry populated
    expect(STUB.rpcCalls).toBe(2);
  });
});

describe('generation guard: an invalidated in-flight read caches nothing', () => {
  it('a fetch invalidated mid-flight returns its result to the awaiter but does not poison the cache', async () => {
    let resolveRpc!: (v: RpcResult) => void;
    STUB.rpcImpl = () => new Promise<RpcResult>((r) => { resolveRpc = r; });

    const pending = fetchVerdictMap();     // rpc now in-flight (pending)
    invalidateVerdictMapCache();           // a write lands mid-flight → bumps the generation
    // The in-flight read resolves with PRE-write data (an accept row):
    resolveRpc({ data: [{ family_id: 'B5', param_name: 'x', verdict: 'accept' }], error: null });
    const stale = await pending;
    expect(stale.size).toBe(1);            // the awaiter still gets its (now-stale) result

    // A fresh read must NOT see the stale row — the zombie cached nothing.
    STUB.rpcImpl = null;
    STUB.results = [{ data: [], error: null }];   // post-write reality: empty
    const fresh = await fetchVerdictMap();
    expect(fresh.size).toBe(0);            // ← fresh, not the stale cached accept row
    expect(STUB.rpcCalls).toBe(2);         // the fresh read did a real rpc (cache was NOT poisoned)
  });
});

describe('fetchAcceptDetailMap failure signalling', () => {
  it('returns null (not an empty map) on rpc failure so the route can fall back', async () => {
    STUB.results = [{ data: null, error: { message: 'boom' } }];
    const result = await fetchAcceptDetailMap();
    expect(result).toBeNull();
  });
});
