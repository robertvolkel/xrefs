/**
 * Atlas Dictionary Override Service — server-only.
 *
 * Fetches and caches dictionary overrides from Supabase.
 * Separated from atlasMapper.ts to avoid pulling Supabase into client bundles.
 */

import { createClient } from '@/lib/supabase/server';

// ── DB Row Type ──────────────────────────────────────────

export interface DictOverrideRow {
  id: string;
  family_id: string;
  param_name: string;
  action: 'modify' | 'add' | 'remove';
  attribute_id: string | null;
  attribute_name: string | null;
  unit: string | null;
  sort_order: number | null;
}

// ── In-Memory Cache ──────────────────────────────────────

interface DictCacheEntry {
  data: DictOverrideRow[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute
const cache = new Map<string, DictCacheEntry>();

// Separate cache for the all-families fetch (read-time path on atlas_products rows).
let allCache: { data: DictOverrideRow[]; fetchedAt: number } | null = null;

/** Invalidate dictionary override cache after admin writes. */
export function invalidateDictOverrideCache(familyId?: string): void {
  if (familyId) {
    cache.delete(familyId);
  } else {
    cache.clear();
  }
  allCache = null;
}

/**
 * Fetch every active dictionary override across all families/categories
 * (cached, server-only). Used by the read path on atlas_products rows so
 * `fromParametersJsonb` can resolve admin-added attributeIds that aren't in
 * any logic table or shared dict.
 */
export async function fetchAllDictOverrides(): Promise<DictOverrideRow[]> {
  if (allCache && Date.now() - allCache.fetchedAt < CACHE_TTL_MS) return allCache.data;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, action, attribute_id, attribute_name, unit, sort_order')
      .eq('is_active', true);

    const rows = (data ?? []) as DictOverrideRow[];
    allCache = { data: rows, fetchedAt: Date.now() };
    return rows;
  } catch {
    return [];
  }
}

/** Fetch active dictionary overrides for a family (cached, server-only). */
export async function fetchDictOverrides(familyId: string): Promise<DictOverrideRow[]> {
  const cached = cache.get(familyId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, action, attribute_id, attribute_name, unit, sort_order')
      .eq('family_id', familyId)
      .eq('is_active', true);

    const rows = (data ?? []) as DictOverrideRow[];
    cache.set(familyId, { data: rows, fetchedAt: Date.now() });
    return rows;
  } catch {
    // If table doesn't exist yet or Supabase is unavailable, return empty
    return [];
  }
}
