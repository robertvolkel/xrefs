/**
 * Atlas Dictionary Override Service — server-only.
 *
 * Fetches and caches dictionary overrides from Supabase.
 * Separated from atlasMapper.ts to avoid pulling Supabase into client bundles.
 */

import { createClient } from '@/lib/supabase/server';

// PostgREST caps a single SELECT response at 1000 rows by default, and
// atlas_dictionary_overrides has crossed that (every accepted Triage mapping
// adds a row). An un-paginated `.select()` therefore SILENTLY returns only the
// first 1000 overrides, so any mapping beyond #1000 stops being applied — both
// here (live read-path) and in the ingest/backfill mirror. Paginate with
// `.range()` and STOP on error (never loop on a failed page — the Decision
// #183 trap). Same 1000-row footgun class as Decision #206. See
// scripts/atlas-ingest.mjs loadAndApplyDictOverrides() for the mirror.
const OVERRIDE_PAGE_SIZE = 1000;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function fetchOverridesPaginated(
  supabase: SupabaseLike,
  familyId?: string,
): Promise<DictOverrideRow[]> {
  const rows: DictOverrideRow[] = [];
  for (let from = 0; ; from += OVERRIDE_PAGE_SIZE) {
    let q = supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, action, attribute_id, attribute_name, unit, sort_order')
      .eq('is_active', true)
      // STABLE total ordering is load-bearing, not cosmetic: without it PostgREST
      // returns paginated rows in arbitrary, run-to-run order, so boundary rows
      // (the ~35 overrides past #1000) get dropped or duplicated across pages —
      // i.e. some active overrides silently fail to load on a given run. That made
      // Atlas param mapping (and recommendation scoring) non-deterministic for the
      // affected dictionary entries. created_at is the meaningful order (newer
      // accepts last), id is the unique tiebreak that guarantees no skip/dup. (#232)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (familyId) q = q.eq('family_id', familyId);
    const { data, error } = await q.range(from, from + OVERRIDE_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as DictOverrideRow[];
    rows.push(...batch);
    if (batch.length < OVERRIDE_PAGE_SIZE) break;
  }
  return rows;
}

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
    const rows = await fetchOverridesPaginated(supabase);
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
    const rows = await fetchOverridesPaginated(supabase, familyId);
    cache.set(familyId, { data: rows, fetchedAt: Date.now() });
    return rows;
  } catch {
    // If table doesn't exist yet or Supabase is unavailable, return empty
    return [];
  }
}
