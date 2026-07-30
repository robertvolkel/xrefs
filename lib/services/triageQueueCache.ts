/**
 * Triage Queue Cache — L1 (in-memory) + L2 (persistent admin_stats_cache row)
 * + SWR for the heavy aggregation powering /api/admin/atlas/ingest/batches.
 *
 * Mirrors the L1/L2/SWR pattern used by /api/admin/atlas (atlas-coverage)
 * and /api/admin/atlas/growth (atlas-growth).
 *
 * Why this layering (May 2026 redesign — see Decision #198):
 *   - L2 is the SOURCE OF TRUTH. Per-row invalidation MARKS the L2 row stale
 *     (backdates computed_at) rather than deleting it (July 2026 — Triage load
 *     fix): the next reader then serves the last-good snapshot immediately +
 *     background-recomputes, instead of a cold miss forcing a synchronous
 *     rebuild on the interactive load right after an Accept. The UPDATE is just
 *     as cross-worker-visible as the old DELETE, so it still fixes the dev-mode
 *     HMR fragility where one module instance's L1 wipe couldn't clear another
 *     instance's L1 (accepted rows stuck visible for up to 30 min). Batch-state
 *     invalidation (invalidateTriageQueueCacheAndAwaitFresh) still hard-DELETEs
 *     + awaits a fresh recompute, because it needs guaranteed-fresh semantics.
 *   - L1 (30 sec) is a tiny burst-absorption layer. Stale L1 in a fragmented
 *     instance now self-heals within seconds rather than the prior 30-min
 *     TTL — staleness is bounded, not unbounded.
 *   - SWR (6h): if L2 is older than this on read, serve it AND kick off a
 *     silent background recompute. Safety net for ingest paths that bypass
 *     the API routes (e.g. CLI scripts) and don't call invalidate.
 *   - Background recompute on invalidation: per-row invalidate marks the L2 row
 *     stale (the shared UPDATE is the cross-process durability guarantee); the
 *     registered compute (set by the batches route at module-load) fires async
 *     to pre-warm L2 so the next reader gets fresh data. If registeredCompute
 *     isn't bound in this module instance (HMR), the next reader still serves
 *     the stale row immediately and triggers its own recompute — still correct.
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
  statusCounts: { open: number; accepted: number; undone: number; deferred: number; unmappable: number };
  cachedAt: number;
};

export type CacheReadResult =
  | { data: CachedTriageData; source: 'l1' }
  | { data: CachedTriageData; source: 'l2-fresh' }
  | { data: CachedTriageData; source: 'l2-stale' };

const L2_CACHE_KEY = 'triage-queue';
// L1 TTL is intentionally SHORT (was 30 min — caused dev-mode HMR fragility
// where one module instance's invalidate couldn't clear another instance's
// L1, leaving accepted rows visible for hours). With a 30-second TTL, even
// if invalidation misses a fragmented L1, staleness bounds to 30s. L1 is
// now strictly a burst-absorption layer, not a durability layer — L2 is the
// source of truth, marked stale cross-process via UPDATE on per-row invalidate
// (or DELETEd by the guaranteed-fresh batch-state variant).
const MEM_CACHE_TTL_MS = 30 * 1000;             // 30 sec
const SWR_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours
// Sentinel computed_at used to MARK the cached row stale WITHOUT deleting it
// (per-row invalidation). Any timestamp older than SWR_STALE_THRESHOLD_MS forces
// readCachedTriageData → source='l2-stale'; the Unix epoch is unambiguously a
// manual stale-mark (never a real compute time) to anyone inspecting the row.
const STALE_SENTINEL_ISO = new Date(0).toISOString();

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

function startRecompute(reason: 'invalidate' | 'swr' | 'cold'): void {
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
export async function invalidateTriageQueueCache(): Promise<void> {
  // Local L1 wipe (this module instance only) — forces this worker to re-read
  // L2 (now stale) rather than serve its fresh in-process copy for up to 30s.
  memCache = null;
  // L2 MARK-STALE (was a DELETE). We backdate computed_at to the epoch sentinel
  // instead of deleting the row so the next reader gets source='l2-stale' and
  // serves the LAST-GOOD snapshot IMMEDIATELY while a background recompute
  // refreshes it — instead of a cold miss that forced the next interactive load
  // to synchronously rebuild the whole queue right after an Accept. Preserves
  // the Decision #198 cross-worker durability: an UPDATE to the shared row is
  // visible to every module instance / worker on next read, exactly like the old
  // DELETE, so staleness is still bounded to one recompute cycle. The acting user
  // is covered by client-side optimistic UI; other readers tolerate a few seconds
  // of stale L2. UPDATE-only (no upsert): if the row is physically absent we do
  // NOT resurrect an empty-payload row — a no-match UPDATE is a harmless no-op and
  // the next reader cold-computes once.
  try {
    const supabase = createServiceClient();
    await supabase
      .from('admin_stats_cache')
      .update({ computed_at: STALE_SENTINEL_ISO })
      .eq('key', L2_CACHE_KEY);
  } catch (err) {
    // Non-fatal — short L1 TTL (30s) bounds staleness even if this fails.
    console.error('triage cache L2 mark-stale failed:', err);
  }
  // Kick a background recompute so the next reader doesn't pay the cold compute.
  // Best-effort, single-flight; if registeredCompute isn't bound in this module
  // instance (HMR), the mark-stale alone still makes the next reader serve-stale
  // and trigger its own recompute — still correct.
  startRecompute('invalidate');
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
  // Phase 1: drain any in-flight recompute (its RPC may have read pre-commit
  // state). If we returned now and started Phase 2 alongside the stale one,
  // a concurrent reader could still hit the stale Promise's resolution.
  while (backgroundRecomputePromise) {
    try { await backgroundRecomputePromise; } catch { return; }
  }
  // Phase 2: hard wipe. Local L1 + shared L2 row. The L2 DELETE is the
  // durability guarantee — any other module instance (dev HMR) or worker
  // (prod multi-worker) reading the cache after this point sees L2 missing
  // and triggers a fresh compute. See invalidateTriageQueueCache() above
  // for the May 2026 incident motivating this design.
  memCache = null;
  try {
    const supabase = createServiceClient();
    await supabase.from('admin_stats_cache').delete().eq('key', L2_CACHE_KEY);
  } catch (err) {
    console.error('triage cache L2 delete failed:', err);
  }
  // Phase 3: start + await a fresh recompute. RPC fires NOW (post-commit),
  // so it's guaranteed to include the caller's changes. If registeredCompute
  // isn't bound in this instance (HMR), startRecompute is a no-op — that's
  // fine, the L2 DELETE alone is sufficient; the next reader computes.
  startRecompute('invalidate');
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

/** Read the triage data, computing SYNCHRONOUSLY on a cold cache.
 *
 *  Unlike readCachedTriageData() — which returns null on cold cache and leaves
 *  the caller to decide — this guarantees a value whenever a compute is
 *  registered: cold cache → run the registered compute, write L1+L2, return
 *  the fresh data. (A registered compute is bound by importing
 *  lib/services/triageQueueCompute, which runs registerTriageCompute() at
 *  module scope.)
 *
 *  This is what lets the /admin/manufacturers "Improvement Potential" column
 *  self-heal: that route only READS the triage cache, so after any triage
 *  invalidation (Accept/Revert, batch apply, deploy) the cache could be cold
 *  and the column went permanently "—" until someone opened the Triage page
 *  to repopulate it. With this helper, the manufacturers route rebuilds the
 *  cache itself on the next request.
 *
 *  Returns null only when (a) the cache is cold AND no compute is registered
 *  in this process, or (b) the compute throws. Callers treat null the same as
 *  before — render the column as "—" rather than block the page. */
export async function getOrComputeTriageData(): Promise<CachedTriageData | null> {
  const cached = await readCachedTriageData(false);
  if (cached) {
    // Serve immediately; refresh in the background if past the SWR threshold.
    if (cached.source === 'l2-stale') triggerBackgroundRecompute();
    return cached.data;
  }
  // Cold cache. If a recompute is already in flight (e.g. from a concurrent
  // invalidation), await that one rather than starting a redundant second.
  if (backgroundRecomputePromise) {
    try { return await backgroundRecomputePromise; } catch { return null; }
  }
  // Start a fresh compute and await it. startRecompute is a no-op (leaves
  // backgroundRecomputePromise null) when nothing is registered — then we
  // return null and the caller falls back to the "—" no-data rendering.
  startRecompute('cold');
  if (backgroundRecomputePromise) {
    try { return await backgroundRecomputePromise; } catch { return null; }
  }
  return null;
}
