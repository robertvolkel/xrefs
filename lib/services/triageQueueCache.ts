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

let backgroundRecomputeInFlight = false;

/** Register the heavy aggregation function so invalidate hooks can refresh
 *  L2 in the background. Called once at the top of the batches route module. */
export function registerTriageCompute(fn: ComputeFn): void {
  registeredCompute = fn;
}

/** Read from L1, then L2. Returns null only when both are empty (cold cache,
 *  caller must compute synchronously). When data comes from L2 and is past
 *  the SWR threshold, source='l2-stale' signals the caller to kick off a
 *  background recompute via triggerBackgroundRecompute(). */
export async function readCachedTriageData(): Promise<CacheReadResult | null> {
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

/** Invalidate L1 + kick off background recompute. L2 is NOT deleted — users
 *  keep seeing the slightly-stale L2 data while the recompute runs (~10–30s)
 *  instead of falling through to a synchronous cold compute. The recompute
 *  upserts L2 when finished. */
export function invalidateTriageQueueCache(): void {
  memCache = null;
  if (registeredCompute && !backgroundRecomputeInFlight) {
    const fn = registeredCompute;
    backgroundRecomputeInFlight = true;
    void (async () => {
      try {
        const fresh = await fn();
        await writeCachedTriageData(fresh);
      } catch (err) {
        console.error('triage cache background recompute failed:', err);
      } finally {
        backgroundRecomputeInFlight = false;
      }
    })();
  }
}

/** Explicit SWR trigger — called by the route when a fresh L1 read isn't
 *  available but L2 came back stale. Idempotent; concurrent calls collapse
 *  to a single in-flight recompute. */
export function triggerBackgroundRecompute(): void {
  if (registeredCompute && !backgroundRecomputeInFlight) {
    const fn = registeredCompute;
    backgroundRecomputeInFlight = true;
    void (async () => {
      try {
        const fresh = await fn();
        await writeCachedTriageData(fresh);
      } catch (err) {
        console.error('triage cache SWR recompute failed:', err);
      } finally {
        backgroundRecomputeInFlight = false;
      }
    })();
  }
}
