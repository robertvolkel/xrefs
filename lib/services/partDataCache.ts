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

export type CacheService = 'digikey' | 'partsio' | 'mouser' | 'findchips' | 'search';
export type CacheTier = 'parametric' | 'lifecycle' | 'commercial' | 'search' | 'recommendations';

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

/** Lifecycle data (parts.io + FindChips): 6 months */
export const TTL_LIFECYCLE_MS = 180 * 24 * 60 * 60 * 1000;

/** Commercial data (FindChips pricing/stock): 24 hours */
export const TTL_COMMERCIAL_MS = 24 * 60 * 60 * 1000;

/** Search results: 7 days (pricing preview goes stale; detailed pricing from getAttributes) */
export const TTL_SEARCH_MS = 7 * 24 * 60 * 60 * 1000;

/** Recommendations: 30 days. Parametric data and scoring logic are stable;
 *  pricing/stock are refreshed on display via triggerFCEnrichment().
 *  Invalidated explicitly by admin writes that affect scoring (xref uploads,
 *  rule overrides, context overrides, manufacturer enable/disable). */
export const TTL_RECOMMENDATIONS_MS = 30 * 24 * 60 * 60 * 1000;

/** Bump this when scoring logic changes (logic table edits, scoring engine
 *  changes, new rule types). Cached results from older versions become
 *  unreachable automatically — no need for manual purges.
 *  v11: APPLY_UNIT_PREFIX_TO_NUMERIC enabled — Atlas numericValues now
 *       normalized to base SI (matches Digikey convention), so threshold
 *       and identity comparisons against Atlas-source candidates produce
 *       different scores than cached v10 entries.
 *  v12: F1 (EMR) / F2 (SSR) Atlas classifier branch + dicts shipped
 *       (Decision TBD). HONGFA + 9 other relay MFRs re-ingested from
 *       family_id=null to F1/F2 with full parametric data. Cached recs
 *       computed against the old (8-key, null-family) atlas_products
 *       rows are now stale.
 *  v13: Per-attribute tolerance bands (Source Specs panel) added to the
 *       scoring pipeline (applyTolerancesToLogicTable) and to the recs
 *       cache variant. Scoring output for no-tolerance requests is
 *       unchanged, but bump as cheap insurance for the pipeline change.
 *  v14: Tolerance bands generalized into unified AcceptanceCriteria (range +
 *       discrete-value 'set'); new acceptedValues short-circuit in the engine.
 *       Cache variant key renamed tol→accept. Bump to invalidate v13 entries.
 *  v15: buildCandidateSearchQuery now emits an inductance value keyword on the
 *       DEFAULT (no-criteria) inductor query, so the candidate set differs even
 *       with accept:null. The full-result cache is consulted before the base
 *       payload, so without this bump pre-deploy inductor recs (scored against the
 *       old narrower pool) would persist for the 30-day TTL.
 *  v16: Digikey parametric-filter widening (Decision #238 Step 3) — a ±% band on a
 *       voltage/frequency-type attr now also widens the Digikey fetch (was Atlas-only),
 *       so the full-result candidate set for such bands changed. The full-result cache
 *       is read before the base payload, so it must invalidate too (mirrors v15).
 *  v17: parts.io candidate lifecycle status normalized via mapPartsioStatus
 *       (raw "Transferred"/"Acquired"/empty → 'Active'), changing the stored
 *       status value AND the Active-first display sort (Decision #232). Cached
 *       v16 recs carry the old raw status + pre-Active-first order.
 *  v18: automotive AEC enforcement (filterAutomotiveAecMismatches) no longer
 *       bypassed for certified crosses (Decision #221 follow-up) — an automotive
 *       context now drops non-AEC Accuris/MFR crosses. Cached v17 automotive
 *       results still include those crosses. (Full-result tier only — keyed on
 *       context; the base-payload tier runs before this post-scoring filter.)
 *  v19: recommendation mfrOrigin now forces 'atlas' when the candidate's dataSource
 *       is 'atlas' (mirrors searchParts), so an Atlas-sourced Chinese maker whose
 *       name the alias index misses reads 🇨🇳 consistently across the search + recs
 *       panels. Cached v18 recs carry the old 'unknown' origin for those parts.
 *       (Full-result tier only — mfrOrigin is resolved after the base payload.)
 *   v19→v20 on 2026-07-13: `package_case` is now compared (identity) in C6/C7/C8/C9/C10
 *       instead of being handed to a human ('application_review' = a flat 50% for EVERY
 *       candidate). 33 other families already compared it; these five did not, so a
 *       request for SOT-23 accepted a QFN-32 at half marks. SCORING CHANGES: a
 *       different-package candidate now FAILS in those families and sinks, as it always
 *       has everywhere else. Cached v19 recs hold the old flat-50% scores.
 *       (Full-result tier only — the base payload holds no scores.) */
export const RECS_CACHE_SCHEMA_VERSION = 'v20';

/** Bump this when search merge/dedup/MFR-filter semantics change. v1→v2 on
 *  2026-06-02 to invalidate entries cached by the pre-MFR-filter merge that
 *  let off-MFR rows claim MPN dedup slots (e.g. Galaxy "1.5KE10" was lost
 *  because Digikey's Littelfuse "1.5KE10" beat it at dedup, then got
 *  post-filtered out). v2→v3 on 2026-06-22 for logic-vetted descriptive search
 *  (Decision #243): the cached SearchResult now carries vetted ranking + new
 *  matchScore/failCount/hardFail fields, and the cache key gained a vetting
 *  signature segment. v3→v4 on 2026-06-24 for greenfield parametric pool filtering
 *  (Decision #248 Phase B): the Digikey candidate pool is now parametric-filtered by
 *  the stated numeric specs, so a cached v3 entry holds a different (keyword-only) pool.
 *  v4→v5 on 2026-06-24 for identity-categorical injection (Decision #248): the vetting
 *  pass now derives a gating categorical (polarity / channel_type / dielectric / …) from
 *  the part-type noun, changing the cached vetted ORDER for the same key (e.g. PNP parts
 *  no longer top an "NPN" request), so v4 entries hold a stale ranking.
 *  v5→v6 on 2026-06-30: greenfield query now keeps categorical size/package CODES (0805)
 *  AND the synthetic source adopts the catalog's own wording for a categorical code
 *  ("0805" → "0805 (2012 Metric)"), so an exact part scores 0 real fails instead of a
 *  spurious package mismatch — v5 entries hold a stale pool AND stale fit labels.
 *  v6→v7 on 2026-06-30: greenfield candidate POOL is now fetched by parametric-filtering the
 *  catalog on ALL stated specs (keyword-free category resolution + multi-spec AND), replacing
 *  the keyword-bootstrapped single-numeric-band fetch. A v6 entry holds a narrower keyword-only
 *  pool (verbose family names returned 0), so its vetted set + fit labels differ.
 *  v7→v8 on 2026-06-30: the guided-selection flow now passes its AUTHORITATIVE familyId, which
 *  category-scopes the keyword pool + forces the scoring family. A v7 guided entry could hold a
 *  wrong-family pool (gate-driver ICs for a MOSFET search) mislabelled "Fits".
 *  v8→v9 on 2026-06-30: searchParts now resolves PartSummary.mfrOrigin per match (atlas/western/
 *  unknown) so the deterministic Chinese/Western search-card filter works. A v8 entry's matches
 *  lack mfrOrigin, so the Western filter would wrongly come back empty.
 *  v9→v10 on 2026-07-13: the greenfield parametric fetch no longer caps a "must be rated at least
 *  X" band at X×10 (headroom on a maximum rating is free), and `fit` specs now band DOWNWARD as
 *  the engine has always evaluated them. A v9 entry holds the POISONED pool this fixed — for a
 *  small-signal-NPN search that is 18 exotic parts rated 2–20 mA with every ordinary transistor
 *  excluded. Without this bump the fix is invisible: the fetch is corrected but the stale pool is
 *  served straight from cache, which reads exactly like the fix not working.
 *  v10→v11 on 2026-07-14: SearchResult gained `narrowing` — the question to ask when the pool came
 *  back too big to be useful. A v10 entry simply has no such field, so a cached greenfield search
 *  silently skips the narrowing step and hands the user 50 parts. Same lesson as v9→v10, one day
 *  apart: a new FIELD on a cached shape needs a bump exactly as much as a new VALUE does, and the
 *  failure looks identical either way — like the feature was never wired up.
 *  v11→v12 on 2026-07-14: the narrowing question is now chosen by the DOCUMENT's ranking among the
 *  specs the pool can support, not by the best entropy score (which flips with the enrichment path
 *  — see guidedSelection.MIN_SPLIT_QUALITY). v11 rows carry a `narrowing` naming whichever spec the
 *  old ranker picked. There is one Supabase instance and no separate prod DB, so rows written while
 *  developing this ARE live rows.
 *  v12→v13 on 2026-07-14: a stated band now carries its DIRECTION (statedBands.parseStatedBands).
 *  v12 banded the catalog FETCH two-sided on max-rating rules, so a user's "1-2 mA" asked Digikey
 *  for parts RATED 1-2 mA — the Decision #271 misread, restored in the fetch. v12 pools were
 *  fetched under that band and are wrong wherever the band fired. */
export const SEARCH_CACHE_SCHEMA_VERSION = 'v13';

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
 * Nuke the entire recommendations cache tier. Called from admin write routes
 * that mutate scoring inputs (xref uploads, rule overrides, context overrides,
 * manufacturer enable/disable). Fire-and-forget — errors logged, never thrown.
 */
export function invalidateRecommendationsCache(): void {
  invalidateCache({ tier: 'recommendations' })
    .then((count) => {
      if (count > 0) console.log(`[partDataCache] Invalidated ${count} recommendation cache entries`);
    })
    .catch((err) => console.warn('[partDataCache] invalidateRecommendationsCache error:', err));
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
