/**
 * Triage Queue Cache — L1 (in-memory) + L2 (persistent admin_stats_cache row)
 * + SWR for the heavy aggregation powering /api/admin/atlas/ingest/batches.
 *
 * Mirrors the L1/L2/SWR pattern used by /api/admin/atlas (atlas-coverage)
 * and /api/admin/atlas/growth (atlas-growth).
 *
 * Why this layering:
 *   - L1 (30 min): protects against rapid repeat requests in a single
 *     server instance. Cleared on invalidation; recomputed in background.
 *   - L2 (persistent): survives restarts/deploys. Keeps users from ever
 *     hitting a fully-cold synchronous compute (10–60+s) once the cache
 *     has been warmed at least once.
 *   - SWR (6h): if L2 is older than this, serve it AND kick off a silent
 *     background recompute. Safety net for invalidations we missed and
 *     for ingest paths that bypass the API routes (e.g. CLI scripts).
 *   - Background recompute on invalidation: when a mutation route calls
 *     invalidateTriageQueueCache(), L1 is cleared and a registered compute
 *     fn (registered by the batches route at module-load) runs async to
 *     refresh L2. Users keep seeing slightly-stale L2 data for the ~10–30s
 *     the recompute takes — never a blank synchronous wait.
 *
 * Process scope:
 *   L1 lives in module memory; each Next.js worker has its own copy. L2 is
 *   shared across workers and persists. After the first cold load (post-
 *   deploy) or first warm-up after L2 is empty, every subsequent load is
 *   sub-second.
 */

import { createServiceClient } from '@/lib/supabase/service';

// Stays as `unknown[]` so this file doesn't need to depend on the route's
// internal Classified type. Route casts back at the call site.
export type CachedTriageData = {
  classified: unknown[];
  triageCounts: { synonyms: number; autoFlagged: number; total: number };
  statusCounts: { open: number; accepted: number; undone: number };
  cachedAt: number;
};

export type CacheReadResult =
  | { data: CachedTriageData; source: 'l1' }
  | { data: CachedTriageData; source: 'l2-fresh' }
  | { data: CachedTriageData; source: 'l2-stale' };

const L2_CACHE_KEY = 'triage-queue';
const MEM_CACHE_TTL_MS = 30 * 60 * 1000;        // 30 min
const SWR_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

let memCache: CachedTriageData | null = null;

type ComputeFn = () => Promise<Omit<CachedTriageData, 'cachedAt'>>;
let registeredCompute: ComputeFn | null = null;

// Tracked as a Promise so concurrent reads can await the same in-flight
// recompute (single-flight + correctness after mutation). When non-null, an
// invalidation triggered a recompute that hasn't finished yet — readers get
// the fresh data instead of the stale L2 the recompute is about to overwrite.
let backgroundRecomputePromise: Promise<CachedTriageData> | null = null;

/** Register the heavy aggregation function so invalidate hooks can refresh
 *  L2 in the background. Called once at the top of the batches route module. */
export function registerTriageCompute(fn: ComputeFn): void {
  registeredCompute = fn;
}

/** Read from L1, then L2. Returns null only when both are empty (cold cache,
 *  caller must compute synchronously). When data comes from L2 and is past
 *  the SWR threshold, source='l2-stale' signals the caller to kick off a
 *  background recompute via triggerBackgroundRecompute().
 *
 *  Reads NEVER await in-flight recomputes — they always return immediately
 *  with whatever is in L1/L2, even slightly stale. The optimistic-UI pattern
 *  on the client (per-row mutations applied locally) keeps the acting user's
 *  view fresh without round-tripping. Callers that need guaranteed-fresh
 *  data should pass `?refresh=1` (explicit Refresh button) which the route
 *  handles by triggering a synchronous compute. */
export async function readCachedTriageData(forceFresh = false): Promise<CacheReadResult | null> {
  if (forceFresh) {
    // Bypass cache entirely; caller will sync-compute. We DON'T clear L1/L2
    // here — the caller's compute writes fresh data on completion.
    return null;
  }

  // L1
  if (memCache && Date.now() - memCache.cachedAt < MEM_CACHE_TTL_MS) {
    return { data: memCache, source: 'l1' };
  }

  // L2
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_stats_cache')
      .select('payload, computed_at')
      .eq('key', L2_CACHE_KEY)
      .maybeSingle();
    if (data?.payload && data.computed_at) {
      const payload = data.payload as Omit<CachedTriageData, 'cachedAt'>;
      const cachedAt = new Date(data.computed_at as string).getTime();
      const full: CachedTriageData = { ...payload, cachedAt };
      // Warm L1 from L2 so subsequent requests don't hit Supabase.
      memCache = full;
      const stale = Date.now() - cachedAt > SWR_STALE_THRESHOLD_MS;
      return { data: full, source: stale ? 'l2-stale' : 'l2-fresh' };
    }
  } catch (err) {
    console.error('triage cache L2 read failed:', err);
  }
  return null;
}

/** Write to both L1 and L2. Called by the route after a synchronous compute
 *  and by the background recompute hook. */
export async function writeCachedTriageData(data: Omit<CachedTriageData, 'cachedAt'>): Promise<void> {
  const computedAt = new Date().toISOString();
  const full: CachedTriageData = { ...data, cachedAt: Date.now() };
  memCache = full;
  try {
    const supabase = createServiceClient();
    await supabase
      .from('admin_stats_cache')
      .upsert({ key: L2_CACHE_KEY, payload: data, computed_at: computedAt }, { onConflict: 'key' });
  } catch (err) {
    console.error('triage cache L2 persist failed:', err);
  }
}

function startRecompute(reason: 'invalidate' | 'swr'): void {
  if (!registeredCompute || backgroundRecomputePromise) return;
  const fn = registeredCompute;
  backgroundRecomputePromise = (async () => {
    try {
      const fresh = await fn();
      const computedAt = new Date().toISOString();
      const full: CachedTriageData = { ...fresh, cachedAt: Date.now() };
      memCache = full;
      try {
        const supabase = createServiceClient();
        await supabase
          .from('admin_stats_cache')
          .upsert({ key: L2_CACHE_KEY, payload: fresh, computed_at: computedAt }, { onConflict: 'key' });
      } catch (err) {
        console.error('triage cache L2 persist failed:', err);
      }
      return full;
    } catch (err) {
      console.error(`triage cache ${reason} recompute failed:`, err);
      throw err;
    } finally {
      backgroundRecomputePromise = null;
    }
  })();
}

/** Single-flight invalidate. Clears L1 and kicks off a background recompute
 *  IF one isn't already running (otherwise reuses the in-flight one). Used
 *  by per-row mutations (Accept / Revert / note edit) where the acting user
 *  is covered by client-side optimistic UI and any other reader can tolerate
 *  slightly-stale L2 for a few seconds. Returns the in-flight Promise so
 *  callers MAY await; failures are caught internally so the Promise always
 *  resolves.
 *
 *  WARNING: do NOT use the returned Promise for "ensure fresh after my
 *  mutation" semantics. The promise is for whatever recompute happens to be
 *  running, which may have started BEFORE your DB commit and miss your
 *  changes. Use invalidateTriageQueueCacheAndAwaitFresh() instead. */
export function invalidateTriageQueueCache(): Promise<void> {
  memCache = null;
  startRecompute('invalidate');
  return backgroundRecomputePromise
    ? backgroundRecomputePromise.then(() => undefined).catch(() => undefined)
    : Promise.resolve();
}

/** Wait-then-restart invalidate — guarantees the cache reflects any DB
 *  changes the caller committed before calling this function.
 *
 *  Why two functions: when a mutation route awaits invalidateTriageQueueCache()
 *  but a recompute is ALREADY in flight (e.g. from a prior fire-and-forget
 *  Accept), the single-flight pattern hands them the existing Promise. That
 *  recompute's RPC may have started reading DB state BEFORE this caller's
 *  commit landed, so awaiting it gives stale data. (This was the Sunlord
 *  bug: upload committed Sunlord, awaited invalidate, got back a Promise
 *  that resolved with pre-Sunlord state.)
 *
 *  This variant fixes that by:
 *    1. Waiting for any in-flight recompute to finish (might be stale).
 *    2. Clearing memCache + starting a fresh recompute (DB read happens
 *       NOW, after our commit, so it's guaranteed fresh).
 *    3. Awaiting the fresh recompute.
 *
 *  Used by batch-state mutations (upload, proceed, revert, regenerate,
 *  batch delete, proceed-all-clean) where freshness is critical and the
 *  user is already in a "waiting for slow operation" mental state. Cost:
 *  up to ~2 recomputes per call (one stale + one fresh). Per-row mutations
 *  intentionally do NOT use this to avoid doubling Supabase load. */
export async function invalidateTriageQueueCacheAndAwaitFresh(): Promise<void> {
  // Phase 1: drain any in-flight recompute (may have read pre-commit state).
  while (backgroundRecomputePromise) {
    try { await backgroundRecomputePromise; } catch { return; }
  }
  memCache = null;
  // Phase 2: start a fresh recompute. Its RPC starts NOW, after our caller's
  // commit, so it's guaranteed to include the caller's changes.
  startRecompute('invalidate');
  // Phase 3: drain again so we don't return until the fresh one is in L2.
  while (backgroundRecomputePromise) {
    try { await backgroundRecomputePromise; } catch { return; }
  }
}

/** Explicit SWR trigger — called by the route when L2 came back past the
 *  staleness threshold. Idempotent; concurrent calls collapse to a single
 *  in-flight recompute. */
export function triggerBackgroundRecompute(): void {
  startRecompute('swr');
}
