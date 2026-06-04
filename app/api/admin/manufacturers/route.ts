import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';
import { readCachedTriageData } from '@/lib/services/triageQueueCache';
import { invalidateAtlasCache } from '../atlas/route';

// ── Hot in-memory cache (60s) ─────────────────────────────────
// Fronts the persistent admin_stats_cache row so per-render
// navigation in the panel doesn't re-hit Supabase.
let memCache: { body: string; cachedAt: string } | null = null;
let memCacheTimestamp = 0;
const MEM_CACHE_TTL_MS = 60_000;

// Bumping the suffix forces persisted rows from the previous schema to be
// recomputed so they pick up the new improvementPotentialPpt field.
const CACHE_KEY = 'manufacturers-list-v2';

export function invalidateManufacturersListCache() {
  memCache = null;
  memCacheTimestamp = 0;
  // Fire-and-forget background recompute. We DON'T delete the persistent row
  // first — `computeAndPersist` upserts on top of the existing row when it
  // finishes, so users keep seeing the previous (slightly stale) payload for
  // the ~10-30s the recompute takes, instead of falling into the synchronous
  // compute path with a blank cache. Mirrors the atlas-coverage / atlas-growth
  // pattern (which already do it this way).
  void (async () => {
    try {
      await computeAndPersist();
    } catch (err) {
      console.error('invalidateManufacturersListCache background error:', err);
    }
  })();
}

interface MfrRow {
  name_display: string;
  name_en: string;
  name_zh: string | null;
  aliases: string[] | null;
  slug: string;
  id: number;
  enabled: boolean;
  website_url: string | null;
  updated_at: string;
}

interface StatsRow {
  manufacturer: string;
  family_id: string | null;
  product_count: number;
  param_keys: string[] | null;
  max_updated_at: string | null;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Sum of rule weights per family — memoised at module scope. The matching
 *  engine's denominator for weighted coverage is Σ rule.weight across the
 *  family's logic table. Same shape as familyRuleAttrs but weight-aware. */
const familyWeightSumCache = new Map<string, number>();
function getFamilyWeightSum(familyId: string): number {
  const hit = familyWeightSumCache.get(familyId);
  if (hit !== undefined) return hit;
  const table = getLogicTable(familyId);
  const sum = table ? table.rules.reduce((acc, r) => acc + (r.weight ?? 0), 0) : 0;
  familyWeightSumCache.set(familyId, sum);
  return sum;
}

/** Shape of a Classified row inside the cached triage payload. Mirrors the
 *  fields the batches route writes — we only read the few we need for the
 *  per-MFR weighted-impact rollup, so a partial type is safe. */
interface TriageRowForRollup {
  productCount: number;
  dominantFamily: string | null;
  affectedManufacturers: Array<{ slug: string; name: string; productCount: number }>;
  acceptedOverride?: { attributeId: string; isActive: boolean };
  noteStatus?: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null;
}

/** Estimated rule weight contributed by mapping a single unmapped paramName.
 *  Mirrors the heuristic used by computeMatchingImpact() in the batches route
 *  so the "Improvement Potential" column ranks rows the same way the Triage
 *  table does:
 *    - acceptedOverride → exact lookup against the destination family's logic
 *      table (returns the actual rule.weight, 0 if not a rule attribute).
 *    - L3 family with no override → default 7 (medium-high; most unmapped
 *      params currently in triage end up mapping to matching-relevant attrs).
 *    - L2-only / no family → 2 (display-only weight). */
function estimateUnmappedParamWeight(row: TriageRowForRollup): number {
  const family = row.dominantFamily;
  const accepted = row.acceptedOverride;
  if (accepted && family) {
    if (accepted.attributeId.startsWith('_')) return 0;
    const table = getLogicTable(family);
    return table?.rules.find((r) => r.attributeId === accepted.attributeId)?.weight ?? 0;
  }
  if (family && getLogicTable(family)) return 7;
  return 2;
}

async function computeStats(): Promise<object> {
  const supabase = await createClient();

  // The triage cache may be cold (returns null). When that happens we still
  // render the manufacturers list without the improvement column — the column
  // shows "—" rather than blocking the whole page on a multi-second compute.
  const [{ data: mfrRows, error: mfrErr }, rpcResult, { data: xrefCounts }, triageResult] = await Promise.all([
    supabase
      .from('atlas_manufacturers')
      .select('name_display, name_en, name_zh, aliases, slug, id, enabled, website_url, updated_at')
      .order('name_en'),
    supabase.rpc('get_manufacturer_product_stats'),
    supabase.rpc('get_cross_ref_counts'),
    readCachedTriageData(false).catch(() => null),
  ]);
  const statsRows = rpcResult.data as StatsRow[] | null;
  const statsErr = rpcResult.error;

  const crossRefCounts = new Map<string, number>();
  const crossRefLastUpload = new Map<string, string>();
  if (xrefCounts) {
    for (const row of xrefCounts as { manufacturer_slug: string; count: number; max_uploaded_at: string | null }[]) {
      crossRefCounts.set(row.manufacturer_slug, Number(row.count));
      if (row.max_uploaded_at) crossRefLastUpload.set(row.manufacturer_slug, row.max_uploaded_at);
    }
  }

  if (mfrErr) {
    throw new Error(`Failed to fetch atlas_manufacturers: ${mfrErr.message}`);
  }

  if (statsErr) {
    // Never synthesize a zero-filled "success" payload — it would get persisted
    // to admin_stats_cache and served to every admin until someone clicks Refresh.
    throw new Error(`get_manufacturer_product_stats RPC failed: ${statsErr.message}`);
  }

  const manufacturers = (mfrRows ?? []) as MfrRow[];
  const stats = (statsRows ?? []) as StatsRow[];

  const productAgg = new Map<string, {
    productCount: number;
    scorableCount: number;
    families: Set<string>;
    lastProductUpdate: string | null;
  }>();
  const allFamilies = new Set<string>();

  const familyRuleAttrs = new Map<string, Set<string>>();
  // weightedTotalRules accumulates Σ (Σ rule.weight in family × productCount)
  // for every (MFR, family) bucket. It's the denominator for improvement
  // potential — independent of coverage % so we don't change the existing
  // count-based coverage metric users are already calibrated to.
  const mfrCoverage = new Map<string, {
    totalCovered: number;
    totalRules: number;
    weightedTotalRules: number;
  }>();

  let totalProducts = 0;
  let totalScorable = 0;

  for (const row of stats) {
    const count = Number(row.product_count);
    totalProducts += count;

    let agg = productAgg.get(row.manufacturer);
    if (!agg) {
      agg = { productCount: 0, scorableCount: 0, families: new Set(), lastProductUpdate: null };
      productAgg.set(row.manufacturer, agg);
    }
    agg.productCount += count;
    agg.lastProductUpdate = maxIso(agg.lastProductUpdate, row.max_updated_at);

    if (row.family_id) {
      agg.scorableCount += count;
      totalScorable += count;
      agg.families.add(row.family_id);
      allFamilies.add(row.family_id);

      if (!familyRuleAttrs.has(row.family_id)) {
        const table = getLogicTable(row.family_id);
        if (table) {
          familyRuleAttrs.set(row.family_id, new Set(table.rules.map(r => r.attributeId)));
        }
      }
      const ruleAttrs = familyRuleAttrs.get(row.family_id);
      if (ruleAttrs && ruleAttrs.size > 0) {
        let covered = 0;
        if (row.param_keys && row.param_keys.length > 0) {
          for (const key of row.param_keys) {
            if (ruleAttrs.has(key)) covered++;
          }
        }

        let mc = mfrCoverage.get(row.manufacturer);
        if (!mc) {
          mc = { totalCovered: 0, totalRules: 0, weightedTotalRules: 0 };
          mfrCoverage.set(row.manufacturer, mc);
        }
        mc.totalCovered += covered * count;
        mc.totalRules += ruleAttrs.size * count;
        // Weighted denominator: every product in this (MFR, family) bucket
        // contributes the family's full Σ rule-weight to the matching budget.
        mc.weightedTotalRules += getFamilyWeightSum(row.family_id) * count;
      }
    }
  }

  // ── Per-MFR weighted improvement potential ─────────────────────────────
  // Re-invert the triage queue's affectedManufacturers index: for each
  // unmapped paramName, distribute (perMfrProductCount × estimatedWeight) to
  // each affected MFR. Rows the engineer has marked "unmappable" are skipped
  // (they explicitly cannot contribute to improvement); rows accepted with an
  // attributeId that doesn't resolve to a family rule contribute weight 0.
  //
  // Keyed by MFR display name (matches affectedManufacturers[i].name and the
  // statsRow.manufacturer keys above). When the result loop folds across MFR
  // aliases, it sums across every variant.
  const mfrWeightedImpact = new Map<string, { addressableSlots: number; unmappedParams: number }>();
  if (triageResult?.data?.classified) {
    const rows = triageResult.data.classified as TriageRowForRollup[];
    for (const r of rows) {
      // Skip parked rows — both unmappable (never) and deferred (not now)
      // shouldn't count toward improvement potential for the MFR.
      if (r.noteStatus === 'unmappable' || r.noteStatus === 'deferred') continue;
      const weight = estimateUnmappedParamWeight(r);
      if (weight <= 0) continue;
      const affected = r.affectedManufacturers ?? [];
      if (affected.length === 0) continue;
      for (const m of affected) {
        const mfrName = m.name;
        if (!mfrName) continue;
        let bucket = mfrWeightedImpact.get(mfrName);
        if (!bucket) {
          bucket = { addressableSlots: 0, unmappedParams: 0 };
          mfrWeightedImpact.set(mfrName, bucket);
        }
        bucket.addressableSlots += (m.productCount ?? 0) * weight;
        bucket.unmappedParams += 1;
      }
    }
  }

  const result = manufacturers.map((m) => {
    // Fold product aggregation across every known spelling so products imported
    // under alias names (common before aliases were wired — products use English
    // only; atlas_manufacturers.name_display is "ENGLISH Chinese") are counted.
    const variants = Array.from(new Set(
      [m.name_display, m.name_en, m.name_zh, ...(m.aliases ?? [])].filter((v): v is string => !!v)
    ));

    let productCount = 0;
    let scorableCount = 0;
    const families = new Set<string>();
    let lastProductUpdate: string | null = null;
    let totalCovered = 0;
    let totalRules = 0;
    let weightedTotalRules = 0;
    let addressableSlots = 0;
    let unmappedParams = 0;
    for (const v of variants) {
      const agg = productAgg.get(v);
      if (agg) {
        productCount += agg.productCount;
        scorableCount += agg.scorableCount;
        for (const f of agg.families) families.add(f);
        lastProductUpdate = maxIso(lastProductUpdate, agg.lastProductUpdate);
      }
      const cov = mfrCoverage.get(v);
      if (cov) {
        totalCovered += cov.totalCovered;
        totalRules += cov.totalRules;
        weightedTotalRules += cov.weightedTotalRules;
      }
      const impact = mfrWeightedImpact.get(v);
      if (impact) {
        addressableSlots += impact.addressableSlots;
        unmappedParams += impact.unmappedParams;
      }
    }

    const xrefTs = crossRefLastUpload.get(m.slug) ?? null;
    // Improvement potential = % of the weighted matching budget this MFR
    // would unlock if every currently-unmapped param affecting its products
    // were mapped. Null when the triage cache was cold (UI renders "—") OR
    // when this MFR has no scorable products (no denominator). Capped at
    // 100 so an over-estimate from the default-weight heuristic can't claim
    // physically-impossible improvement.
    const triageAvailable = !!triageResult?.data?.classified;
    let improvementPotentialPpt: number | null = null;
    if (triageAvailable && weightedTotalRules > 0) {
      const raw = (addressableSlots / weightedTotalRules) * 100;
      improvementPotentialPpt = Math.min(100, Math.round(raw * 10) / 10);
    } else if (triageAvailable) {
      improvementPotentialPpt = 0;
    }

    return {
      id: m.id,
      slug: m.slug,
      nameEn: m.name_en,
      nameZh: m.name_zh,
      nameDisplay: m.name_display,
      enabled: m.enabled,
      websiteUrl: m.website_url,
      productCount,
      scorableCount,
      families: [...families].sort(),
      coveragePct: totalRules > 0 ? Math.round((totalCovered / totalRules) * 100) : 0,
      improvementPotentialPpt,
      improvementPotentialDetail: triageAvailable
        ? { unmappedParams, addressableSlots }
        : null,
      crossRefCount: crossRefCounts.get(m.slug) || 0,
      lastProductUpdate,
      lastProfileUpdate: m.updated_at,
      lastCrossRefUpdate: xrefTs,
      lastModified: maxIso(maxIso(lastProductUpdate, m.updated_at), xrefTs),
    };
  });

  const withProducts = result.filter(m => m.productCount > 0).length;
  const enabledMfrs = result.filter(m => m.enabled);
  const enabledWithProducts = enabledMfrs.filter(m => m.productCount > 0).length;

  return {
    manufacturers: result,
    summary: {
      totalManufacturers: manufacturers.length,
      withProducts,
      enabledWithProducts,
      totalProducts,
      scorableProducts: totalScorable,
      familiesCovered: allFamilies.size,
    },
  };
}

async function computeAndPersist(): Promise<{ payload: object; computedAt: string }> {
  const payload = await computeStats();
  const computedAt = new Date().toISOString();
  try {
    const svc = createServiceClient();
    await svc
      .from('admin_stats_cache')
      .upsert({ key: CACHE_KEY, payload, computed_at: computedAt }, { onConflict: 'key' });
  } catch (err) {
    console.error('admin_stats_cache persist failed:', err);
  }
  return { payload, computedAt };
}

function looksPoisoned(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const summary = (payload as { summary?: { totalManufacturers?: number; totalProducts?: number } }).summary;
  if (!summary) return false;
  return (summary.totalManufacturers ?? 0) > 0 && (summary.totalProducts ?? 0) === 0;
}

async function readPersistentCache(): Promise<{ payload: object; computedAt: string } | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('admin_stats_cache')
      .select('payload, computed_at')
      .eq('key', CACHE_KEY)
      .maybeSingle();
    if (data?.payload && data.computed_at) {
      return { payload: data.payload as object, computedAt: data.computed_at as string };
    }
  } catch (err) {
    console.error('admin_stats_cache read failed:', err);
  }
  return null;
}

// ── POST: Batch sync all profiles from Atlas API ──────────
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { syncAllProfiles } = await import('@/lib/services/atlasProfileSync');
    const result = await syncAllProfiles();

    // Invalidate caches so the list and Atlas Coverage reflect new profile data
    invalidateManufacturersListCache();
    invalidateAtlasCache();

    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/admin/manufacturers (sync) error:', err);
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

    if (!forceRefresh && memCache && Date.now() - memCacheTimestamp < MEM_CACHE_TTL_MS) {
      return new NextResponse(memCache.body, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let payload: object | null = null;
    let computedAt: string | null = null;
    let stale = false;

    if (!forceRefresh) {
      const cached = await readPersistentCache();
      if (cached && !looksPoisoned(cached.payload)) {
        payload = cached.payload;
        computedAt = cached.computedAt;
      }
    }

    if (!payload || !computedAt) {
      try {
        const fresh = await computeAndPersist();
        payload = fresh.payload;
        computedAt = fresh.computedAt;
      } catch (err) {
        console.error('computeAndPersist failed:', err);
        // Fresh compute failed — fall back to last known good cache even on
        // a force-refresh, so the admin never sees synthetic zeros.
        const cached = await readPersistentCache();
        if (cached && !looksPoisoned(cached.payload)) {
          payload = cached.payload;
          computedAt = cached.computedAt;
          stale = true;
        } else {
          return NextResponse.json(
            { error: 'Stats temporarily unavailable', detail: err instanceof Error ? err.message : String(err) },
            { status: 503 }
          );
        }
      }
    }

    const body = JSON.stringify({ ...payload, cachedAt: computedAt, stale });
    memCache = { body, cachedAt: computedAt };
    memCacheTimestamp = Date.now();

    return new NextResponse(body, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/admin/manufacturers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
