/**
 * Part Data Cache — Supabase-backed L2 cache for external API responses.
 *
 * Three-tier cache sitting between in-memory L1 caches and live API calls:
 *   - parametric  — technical specs (indefinite for Digikey, 90 days for parts.io)
 *   - lifecycle   — YTEOL, risk, compliance, suggested replacements (6 months)
 *   - commercial  — pricing, stock, lead times (24 hours)
 *
 * All writes are fire-and-forget (errors logged, never thrown).
 * Uses service role client for all Supabase operations (bypasses RLS).
 */

import { createServiceClient } from '@/lib/supabase/service';

// ============================================================
// TYPES
// ============================================================

export type CacheService = 'digikey' | 'partsio' | 'mouser' | 'search';
export type CacheTier = 'parametric' | 'lifecycle' | 'commercial' | 'search';

export interface CacheReadResult<T> {
  data: T;
  cachedAt: Date;
  hitCount: number;
}

export interface CacheStats {
  totalRows: number;
  totalSizeBytes: number;
  byService: Record<string, {
    rows: number;
    sizeBytes: number;
    avgHitCount: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  }>;
  byTier: Record<string, { rows: number; sizeBytes: number }>;
  expiredRows: number;
}

export interface InvalidateCacheOptions {
  service?: CacheService;
  mpn?: string;
  tier?: CacheTier;
  olderThan?: Date;
}

// ============================================================
// TTL CONSTANTS
// ============================================================

/** Digikey parametric: indefinite (null expires_at) */
export const TTL_PARAMETRIC_DIGIKEY = null;

/** Parts.io parametric: 90 days */
export const TTL_PARAMETRIC_PARTSIO_MS = 90 * 24 * 60 * 60 * 1000;

/** Lifecycle data (parts.io + Mouser): 6 months */
export const TTL_LIFECYCLE_MS = 180 * 24 * 60 * 60 * 1000;

/** Commercial data (Digikey + Mouser pricing/stock): 24 hours */
export const TTL_COMMERCIAL_MS = 24 * 60 * 60 * 1000;

/** Search results: 7 days (pricing preview goes stale; detailed pricing from getAttributes) */
export const TTL_SEARCH_MS = 7 * 24 * 60 * 60 * 1000;

/** Not-found sentinel: 24 hours */
export const TTL_NOT_FOUND_MS = 24 * 60 * 60 * 1000;

// ============================================================
// SENTINEL
// ============================================================

/** Marker stored for MPNs confirmed not to exist in a given service */
export const NOT_FOUND_SENTINEL = { notFound: true } as const;

export function isNotFoundSentinel(data: unknown): data is typeof NOT_FOUND_SENTINEL {
  return data != null && typeof data === 'object' && 'notFound' in data && (data as Record<string, unknown>).notFound === true;
}

// ============================================================
// READ
// ============================================================

/**
 * Read a single cached response. Returns null on miss or expired entry.
 * Increments hit_count and last_hit_at on successful read (fire-and-forget).
 */
export async function getCachedResponse<T>(
  service: CacheService,
  mpn: string,
  variant: string = 'default',
): Promise<CacheReadResult<T> | null> {
  try {
    const client = createServiceClient();
    const now = new Date().toISOString();

    const { data, error } = await client
      .from('part_data_cache')
      .select('id, response_data, hit_count, created_at, expires_at')
      .eq('service', service)
      .eq('mpn_lower', mpn.toLowerCase())
      .eq('variant', variant)
      .single();

    if (error || !data) return null;

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date(now)) {
      return null;
    }

    // Fire-and-forget: increment hit counter
    client
      .from('part_data_cache')
      .update({ hit_count: (data.hit_count ?? 0) + 1, last_hit_at: now })
      .eq('id', data.id)
      .then(({ error: updateErr }) => {
        if (updateErr) console.warn('[partDataCache] Hit count update failed:', updateErr.message);
      });

    return {
      data: data.response_data as T,
      cachedAt: new Date(data.created_at),
      hitCount: (data.hit_count ?? 0) + 1,
    };
  } catch (err) {
    console.warn('[partDataCache] getCachedResponse error:', err);
    return null;
  }
}

/**
 * Batch read cached responses for multiple MPNs (same service + variant).
 * Returns a Map of lowercase MPN → cached data. Misses are omitted.
 * Used by Mouser batch lookups to minimize individual queries.
 */
export async function getCachedResponseBatch<T>(
  service: CacheService,
  mpns: string[],
  variant: string = 'default',
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  if (mpns.length === 0) return results;

  try {
    const client = createServiceClient();
    const now = new Date().toISOString();
    const lowerMpns = mpns.map(m => m.toLowerCase());

    const { data, error } = await client
      .from('part_data_cache')
      .select('id, mpn_lower, response_data, hit_count, expires_at')
      .eq('service', service)
      .eq('variant', variant)
      .in('mpn_lower', lowerMpns);

    if (error || !data) return results;

    const idsToUpdate: string[] = [];

    for (const row of data) {
      // Skip expired
      if (row.expires_at && new Date(row.expires_at) < new Date(now)) continue;

      results.set(row.mpn_lower, row.response_data as T);
      idsToUpdate.push(row.id);
    }

    // Fire-and-forget: batch increment hit counters
    if (idsToUpdate.length > 0) {
      // Supabase doesn't support bulk increment, so use RPC or individual updates
      // For simplicity, update all matched rows with a single query using .in()
      client
        .from('part_data_cache')
        .update({ last_hit_at: now })
        .in('id', idsToUpdate)
        .then(({ error: updateErr }) => {
          if (updateErr) console.warn('[partDataCache] Batch hit update failed:', updateErr.message);
        });
    }

    return results;
  } catch (err) {
    console.warn('[partDataCache] getCachedResponseBatch error:', err);
    return results;
  }
}

// ============================================================
// WRITE
// ============================================================

/**
 * Store a response in the L2 cache. Fire-and-forget — never throws.
 * Uses upsert (ON CONFLICT DO UPDATE) to handle concurrent writes.
 *
 * @param ttlMs - TTL in milliseconds. null = indefinite (expires_at = NULL).
 */
export function setCachedResponse(
  service: CacheService,
  mpn: string,
  variant: string,
  tier: CacheTier,
  data: unknown,
  ttlMs: number | null,
): void {
  try {
    const client = createServiceClient();
    const now = new Date();
    const jsonStr = JSON.stringify(data);
    const expiresAt = ttlMs != null
      ? new Date(now.getTime() + ttlMs).toISOString()
      : null;

    client
      .from('part_data_cache')
      .upsert(
        {
          service,
          mpn_lower: mpn.toLowerCase(),
          variant,
          cache_tier: tier,
          response_data: data,
          response_size: jsonStr.length,
          expires_at: expiresAt,
          updated_at: now.toISOString(),
          // Reset hit count on fresh write
          hit_count: 0,
          last_hit_at: null,
        },
        { onConflict: 'service,mpn_lower,variant' },
      )
      .then(({ error }) => {
        if (error) console.warn('[partDataCache] setCachedResponse upsert failed:', error.message);
      });
  } catch (err) {
    console.warn('[partDataCache] setCachedResponse error:', err);
  }
}

/**
 * Store multiple responses in a single batch. Fire-and-forget.
 * All entries share the same service, variant, tier, and TTL.
 */
export function setCachedResponseBatch(
  service: CacheService,
  entries: Array<{ mpn: string; data: unknown }>,
  variant: string,
  tier: CacheTier,
  ttlMs: number | null,
): void {
  if (entries.length === 0) return;

  try {
    const client = createServiceClient();
    const now = new Date();
    const expiresAt = ttlMs != null
      ? new Date(now.getTime() + ttlMs).toISOString()
      : null;

    const rows = entries.map(({ mpn, data }) => ({
      service,
      mpn_lower: mpn.toLowerCase(),
      variant,
      cache_tier: tier,
      response_data: data,
      response_size: JSON.stringify(data).length,
      expires_at: expiresAt,
      updated_at: now.toISOString(),
      hit_count: 0,
      last_hit_at: null,
    }));

    client
      .from('part_data_cache')
      .upsert(rows, { onConflict: 'service,mpn_lower,variant' })
      .then(({ error }) => {
        if (error) console.warn('[partDataCache] setCachedResponseBatch upsert failed:', error.message);
      });
  } catch (err) {
    console.warn('[partDataCache] setCachedResponseBatch error:', err);
  }
}

// ============================================================
// INVALIDATION
// ============================================================

/**
 * Purge cache entries matching the given filters. Returns count of deleted rows.
 * Called by admin cache management endpoint.
 */
export async function invalidateCache(opts?: InvalidateCacheOptions): Promise<number> {
  try {
    const client = createServiceClient();
    let query = client.from('part_data_cache').delete().gte('created_at', '1970-01-01');

    if (opts?.service) query = query.eq('service', opts.service);
    if (opts?.mpn) query = query.eq('mpn_lower', opts.mpn.toLowerCase());
    if (opts?.tier) query = query.eq('cache_tier', opts.tier);
    if (opts?.olderThan) query = query.lt('updated_at', opts.olderThan.toISOString());

    const { data, error } = await query.select('id');

    if (error) {
      console.warn('[partDataCache] invalidateCache error:', error.message);
      return 0;
    }

    return data?.length ?? 0;
  } catch (err) {
    console.warn('[partDataCache] invalidateCache error:', err);
    return 0;
  }
}

/**
 * Delete all expired cache entries. Returns count of deleted rows.
 * Can be called periodically to prevent table bloat.
 */
export async function purgeExpired(): Promise<number> {
  try {
    const client = createServiceClient();
    const now = new Date().toISOString();

    const { data, error } = await client
      .from('part_data_cache')
      .delete()
      .not('expires_at', 'is', null)
      .lt('expires_at', now)
      .select('id');

    if (error) {
      console.warn('[partDataCache] purgeExpired error:', error.message);
      return 0;
    }

    return data?.length ?? 0;
  } catch (err) {
    console.warn('[partDataCache] purgeExpired error:', err);
    return 0;
  }
}

// ============================================================
// STATS
// ============================================================

/**
 * Get cache statistics for the admin dashboard.
 */
export async function getCacheStats(): Promise<CacheStats> {
  const empty: CacheStats = {
    totalRows: 0,
    totalSizeBytes: 0,
    byService: {},
    byTier: {},
    expiredRows: 0,
  };

  try {
    const client = createServiceClient();
    const now = new Date().toISOString();

    // Fetch all rows with minimal columns for aggregation
    const { data, error } = await client
      .from('part_data_cache')
      .select('service, cache_tier, response_size, hit_count, created_at, expires_at');

    if (error || !data) return empty;

    const stats: CacheStats = {
      totalRows: data.length,
      totalSizeBytes: 0,
      byService: {},
      byTier: {},
      expiredRows: 0,
    };

    for (const row of data) {
      const size = row.response_size ?? 0;
      stats.totalSizeBytes += size;

      // Check expired
      if (row.expires_at && new Date(row.expires_at) < new Date(now)) {
        stats.expiredRows++;
      }

      // By service
      if (!stats.byService[row.service]) {
        stats.byService[row.service] = {
          rows: 0, sizeBytes: 0, avgHitCount: 0,
          oldestEntry: null, newestEntry: null,
        };
      }
      const svc = stats.byService[row.service];
      svc.rows++;
      svc.sizeBytes += size;
      svc.avgHitCount += row.hit_count ?? 0;
      if (!svc.oldestEntry || row.created_at < svc.oldestEntry) svc.oldestEntry = row.created_at;
      if (!svc.newestEntry || row.created_at > svc.newestEntry) svc.newestEntry = row.created_at;

      // By tier
      if (!stats.byTier[row.cache_tier]) {
        stats.byTier[row.cache_tier] = { rows: 0, sizeBytes: 0 };
      }
      stats.byTier[row.cache_tier].rows++;
      stats.byTier[row.cache_tier].sizeBytes += size;
    }

    // Compute averages
    for (const svc of Object.values(stats.byService)) {
      svc.avgHitCount = svc.rows > 0 ? Math.round((svc.avgHitCount / svc.rows) * 10) / 10 : 0;
    }

    return stats;
  } catch (err) {
    console.warn('[partDataCache] getCacheStats error:', err);
    return empty;
  }
}
