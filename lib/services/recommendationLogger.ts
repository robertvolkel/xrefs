/**
 * Recommendation Logger — Server-side QC logging.
 *
 * Logs recommendation requests to Supabase when QC logging is enabled.
 * Checks the platform_settings toggle (cached for 60s) before writing.
 * Caps snapshot to top 10 recommendations to limit JSONB size.
 */

import { createClient } from '@/lib/supabase/server';
import { RecommendationLogSnapshot, RequestSource } from '@/lib/types';

const MAX_SNAPSHOT_RECS = 10;
const CACHE_TTL_MS = 60_000;

// Module-level cache for the logging toggle
let cachedEnabled: boolean | null = null;
let cachedAt = 0;

/** Check if QC logging is enabled. Cached for 60s. */
export async function isQcLoggingEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedEnabled;
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('platform_settings')
      .select('qc_logging_enabled')
      .eq('id', 'global')
      .single();

    const enabled = data?.qc_logging_enabled ?? false;
    cachedEnabled = enabled;
    cachedAt = now;
    return enabled;
  } catch {
    // If the table doesn't exist yet or query fails, default to off
    cachedEnabled = false;
    cachedAt = now;
    return false;
  }
}

/** Invalidate the cache (called when admin toggles the setting). */
export function invalidateLoggingCache(): void {
  cachedEnabled = null;
  cachedAt = 0;
}

export interface LogRecommendationParams {
  userId: string;
  sourceMpn: string;
  sourceManufacturer?: string;
  familyId?: string;
  familyName?: string;
  recommendationCount: number;
  requestSource: RequestSource;
  dataSource?: string;
  snapshot: RecommendationLogSnapshot;
}

/**
 * Log a recommendation request. No-ops if logging is disabled.
 * Caps snapshot.recommendations to top 10 before inserting.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function logRecommendation(params: LogRecommendationParams): Promise<string | null> {
  const enabled = await isQcLoggingEnabled();
  if (!enabled) return null;

  try {
    const supabase = await createClient();

    // Cap recommendations to top 10 (already sorted by matchPercentage desc)
    const cappedSnapshot: RecommendationLogSnapshot = {
      ...params.snapshot,
      recommendations: params.snapshot.recommendations.slice(0, MAX_SNAPSHOT_RECS),
    };

    const { data, error } = await supabase
      .from('recommendation_log')
      .insert({
        user_id: params.userId,
        source_mpn: params.sourceMpn,
        source_manufacturer: params.sourceManufacturer ?? null,
        family_id: params.familyId ?? null,
        family_name: params.familyName ?? null,
        recommendation_count: params.recommendationCount,
        request_source: params.requestSource,
        data_source: params.dataSource ?? null,
        snapshot: cappedSnapshot,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('QC log insert failed:', error.message, error.details, error.hint);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.warn('QC log error:', err);
    return null;
  }
}
