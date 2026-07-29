import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';
import {
  buildFamilyAttrsPayload,
  rollupCoverageByManufacturer,
  computeDataCoveragePct,
  computeReachPct,
  type CoverageAggRow,
} from '@/lib/services/atlasCoverageAggregates';

// ── Cache layering (mirrors /api/admin/manufacturers) ───────
//
// L1: 60s in-memory burst buffer — protects against rapid repeat
//     requests in a single server instance.
//
// L2: Supabase admin_stats_cache row (key='atlas-coverage') —
//     persistent; survives restarts/deploys. Invalidated on writes
//     via invalidateAtlasCache(). Backstop: SWR age-check below
//     triggers a silent background recompute if the cached row is
//     older than SWR_STALE_THRESHOLD_MS.
//
// Compute: full aggregation over atlas_products (~55K rows).
//     Only runs when both caches miss, when SWR kicks in, or when
//     a write invalidates.

const CACHE_KEY = 'atlas-coverage';

let memCache: { body: string; cachedAt: string } | null = null;
let memCacheTimestamp = 0;
const MEM_CACHE_TTL_MS = 60_000;

// Advance L1 only when the incoming payload is at least as fresh as what's there
// (computed_at ISO strings sort chronologically). Stops a slow stale read from
// clobbering a fresh background recompute that landed first — the race that left
// L1 serving the pre-invalidate payload for the full TTL.
function setMemCache(body: string, cachedAt: string): void {
  if (memCache && memCache.cachedAt > cachedAt) return;
  memCache = { body, cachedAt };
  memCacheTimestamp = Date.now();
}

// If the persistent cache is older than this, serve it (stale-while-revalidate)
// AND kick off a background recompute. Safety net for writes that don't
// explicitly invalidate (e.g. offline ingestion scripts).
const SWR_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

let backgroundRecomputeInFlight = false;

export function invalidateAtlasCache() {
  memCache = null;
  memCacheTimestamp = 0;
  // Fire-and-forget background recompute. We DON'T delete the persistent row
  // first — `computeAndPersist` upserts on top of the existing row when it
  // finishes, so users keep seeing the previous (slightly stale) payload for
  // the ~20s the recompute takes, instead of falling into the synchronous
  // compute path with a blank cache. Net effect: zero blocking page loads
  // after the very first compute. SWR's 6h threshold catches the rare case
  // where this background recompute fails silently.
  void (async () => {
    try {
      await computeAndPersist();
    } catch (err) {
      console.error('invalidateAtlasCache background error:', err);
    }
  })();
}

async function computeAtlasCoverage(): Promise<object> {
  // Service-role client — admin auth is gated upstream by requireAdmin().
  // Same pattern as the manufacturers route, and matches what `invalidate
  // AtlasCache`'s background recompute uses.
  const supabase = createServiceClient();

  const familyAttrs = buildFamilyAttrsPayload();

  // ── Single RPC call for the heavy aggregation (replaces two
  //    fetchAllPages walks). The function returns one row per
  //    (manufacturer, family_id, category, subcategory) tuple, with
  //    coverage stats already summed in Postgres. ~5K rows, a few KB.
  // ── Manufacturer identity rows: now 1014 — crossed PostgREST's 1000-row cap
  //    (the old "~115" assumption went stale), so the select is paginated. A
  //    plain .select() silently dropped the alphabetical tail, undercounting
  //    targetManufacturers and missing disabled-state for the dropped MFRs.
  // ── Legacy settings table: tiny fallback when atlas_manufacturers is empty.
  const [aggResult, mfrRecordsResult, mfrSettingsResult] = await Promise.all([
    // RPC returns a single jsonb array (one element per
    // (mfr, family_id, category, subcategory) tuple). Previously RETURNS
    // TABLE, which made PostgREST's max-rows cap (1000 on Supabase) silently
    // truncate the result once atlas_products grew past ~120 MFRs.
    supabase.rpc('get_atlas_coverage_aggregates', { family_attrs: familyAttrs }),
    (async (): Promise<{
      data: Array<{ name_display: string; name_en: string; name_zh: string | null; slug: string; id: number; enabled: boolean }> | null;
      error: { message: string } | null;
    }> => {
      const PAGE = 1000;
      const rows: Array<{ name_display: string; name_en: string; name_zh: string | null; slug: string; id: number; enabled: boolean }> = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('atlas_manufacturers')
          .select('name_display, name_en, name_zh, slug, id, enabled')
          .order('id')
          .range(offset, offset + PAGE - 1);
        if (error) return { data: null, error };
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      return { data: rows, error: null };
    })(),
    supabase.from('atlas_manufacturer_settings').select('manufacturer, enabled'),
  ]);

  if (aggResult.error) {
    throw new Error(`get_atlas_coverage_aggregates RPC failed: ${aggResult.error.message}`);
  }
  const { data: mfrRecords, error: mfrRecordsErr } = mfrRecordsResult;
  const { data: mfrSettings } = mfrSettingsResult;

  // RPC rows. Numeric columns come back as bigints which serialize to
  // strings in some drivers; coerce defensively at the consumer.
  const aggRows = (aggResult.data ?? []) as Array<{
    manufacturer: string;
    family_id: string | null;
    category: string;
    subcategory: string;
    product_count: number | string;
    total_covered: number | string;
    total_rules: number | string;
    last_updated: string;
  }>;

  // Build manufacturer identity lookup from atlas_manufacturers (new table).
  // atlas_products.manufacturer typically uses English-only names (e.g. "ISC") while
  // name_display is the combined "ENGLISH Chinese" form (e.g. "ISC 无锡固电") — so we
  // register the identity under both name_display AND name_en so lookups hit either way.
  const mfrIdentity = new Map<string, { nameEn: string; nameZh: string | null; slug: string; id: number; enabled: boolean }>();
  if (!mfrRecordsErr && mfrRecords) {
    for (const r of mfrRecords as { name_display: string; name_en: string; name_zh: string | null; slug: string; id: number; enabled: boolean }[]) {
      const identity = { nameEn: r.name_en, nameZh: r.name_zh, slug: r.slug, id: r.id, enabled: r.enabled };
      if (r.name_display) mfrIdentity.set(r.name_display, identity);
      if (r.name_en && !mfrIdentity.has(r.name_en)) mfrIdentity.set(r.name_en, identity);
    }
  }

  // Disabled set: prefer atlas_manufacturers, fallback to legacy atlas_manufacturer_settings
  const disabledSet = new Set<string>();
  if (mfrIdentity.size > 0) {
    for (const [name, info] of mfrIdentity) {
      if (!info.enabled) disabledSet.add(name);
    }
  } else {
    for (const s of (mfrSettings ?? []) as { manufacturer: string; enabled: boolean }[]) {
      if (!s.enabled) disabledSet.add(s.manufacturer);
    }
  }

  if (aggRows.length === 0) {
    return {
      summary: {
        totalProducts: 0,
        totalManufacturers: 0,
        targetManufacturers: mfrRecords?.length ?? 0,
        queuedManufacturers: mfrRecords?.length ?? 0,
        enabledManufacturers: 0,
        enabledProducts: 0,
        scorableProducts: 0,
        searchOnlyProducts: 0,
        familiesCovered: 0,
        lastUpdated: null,
        dataCoveragePct: 0,
        reachPct: 0,
        coveredSlots: 0,
        requiredSlots: 0,
      },
      manufacturers: [],
      familyBreakdown: [],
      familyNames: {},
    };
  }

  // ── Roll up the SQL aggregates to per-MFR and global summary ─────
  // The RPC already grouped by (manufacturer, family_id, category,
  // subcategory) — we just need to fold these into the existing
  // response shape (per-MFR rollup + per-(MFR × family) breakdown).
  const mfrMap = new Map<string, {
    productCount: number;
    scorableCount: number;
    families: Set<string>;
    categories: Set<string>;
    lastUpdated: string;
  }>();

  const familyBreakdownMap = new Map<string, {
    manufacturer: string;
    familyId: string | null;
    category: string;
    subcategory: string;
    count: number;
    scorableCount: number;
  }>();

  // Per-MFR + global coverage via the SHARED rollup — the single definition
  // both admin routes use (see lib/services/atlasCoverageAggregates.ts). The
  // per-family breakdown (fbCoverage) stays inline below; it's atlas-only and
  // not duplicated anywhere, so it isn't a drift risk.
  const coverage = rollupCoverageByManufacturer(aggRows as CoverageAggRow[]);
  const fbCoverage = new Map<string, { totalCovered: number; totalRules: number }>();

  const allFamilies = new Set<string>();
  let globalLastUpdated: string | null = null;
  let totalProducts = 0;
  let scorableProducts = 0;

  for (const r of aggRows) {
    const productCount = Number(r.product_count);
    const totalCovered = Number(r.total_covered);
    const totalRules = Number(r.total_rules);
    totalProducts += productCount;
    if (r.family_id) {
      scorableProducts += productCount;
      allFamilies.add(r.family_id);
    }

    // Per-MFR rollup
    let mfr = mfrMap.get(r.manufacturer);
    if (!mfr) {
      mfr = { productCount: 0, scorableCount: 0, families: new Set(), categories: new Set(), lastUpdated: r.last_updated };
      mfrMap.set(r.manufacturer, mfr);
    }
    mfr.productCount += productCount;
    if (r.family_id) {
      mfr.scorableCount += productCount;
      mfr.families.add(r.family_id);
    }
    mfr.categories.add(r.category);
    if (r.last_updated > mfr.lastUpdated) mfr.lastUpdated = r.last_updated;
    if (!globalLastUpdated || r.last_updated > globalLastUpdated) globalLastUpdated = r.last_updated;

    // Per-(MFR × family) breakdown — same key shape as before.
    // Non-scorable rows (family_id=null) get a synthetic key with
    // category+subcategory to keep the shape stable for the UI.
    const fbKey = r.family_id
      ? `${r.manufacturer}::${r.family_id}`
      : `${r.manufacturer}::_::${r.category}::${r.subcategory}`;
    let fb = familyBreakdownMap.get(fbKey);
    if (!fb) {
      fb = {
        manufacturer: r.manufacturer,
        familyId: r.family_id,
        category: r.category,
        subcategory: r.subcategory,
        count: 0,
        scorableCount: 0,
      };
      familyBreakdownMap.set(fbKey, fb);
    }
    fb.count += productCount;
    if (r.family_id) fb.scorableCount += productCount;

    // Per-family coverage rollup — only for scorable rows. (Per-MFR + global
    // coverage is handled by the shared `coverage` rollup above.) The RPC
    // already aggregated total_covered + total_rules per (mfr, family_id) tuple
    // at the (category, subcategory) granularity; sum back up.
    if (r.family_id && totalRules > 0) {
      const coverageKey = `${r.manufacturer}::${r.family_id}`;
      let fc = fbCoverage.get(coverageKey);
      if (!fc) { fc = { totalCovered: 0, totalRules: 0 }; fbCoverage.set(coverageKey, fc); }
      fc.totalCovered += totalCovered;
      fc.totalRules += totalRules;
    }
  }

  const manufacturers = [...mfrMap.entries()]
    .map(([name, m]) => {
      const cov = coverage.byManufacturer.get(name);
      const identity = mfrIdentity.get(name);
      return {
        manufacturer: name,
        nameEn: identity?.nameEn ?? null,
        nameZh: identity?.nameZh ?? null,
        slug: identity?.slug ?? null,
        mfrId: identity?.id ?? null,
        productCount: m.productCount,
        scorableCount: m.scorableCount,
        families: [...m.families].sort(),
        categories: [...m.categories].sort(),
        lastUpdated: m.lastUpdated,
        coveragePct: cov && cov.totalRules > 0
          ? Math.round((cov.totalCovered / cov.totalRules) * 100)
          : 0,
        enabled: !disabledSet.has(name),
      };
    })
    .sort((a, b) => b.productCount - a.productCount);

  const familyBreakdown = [...familyBreakdownMap.values()]
    .map(fb => {
      const cov = fbCoverage.get(`${fb.manufacturer}::${fb.familyId}`);
      return {
        ...fb,
        coveragePct: cov && cov.totalRules > 0
          ? Math.round((cov.totalCovered / cov.totalRules) * 100)
          : 0,
      };
    })
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || (a.familyId ?? '').localeCompare(b.familyId ?? ''));

  const familyNames: Record<string, string> = {};
  for (const fid of allFamilies) {
    const table = getLogicTable(fid);
    if (table) familyNames[fid] = table.familyName;
  }

  const enabledMfrs = manufacturers.filter((m) => m.enabled);
  const enabledProductCount = enabledMfrs.reduce((sum, m) => sum + m.productCount, 0);

  const targetManufacturers = mfrRecords?.length ?? mfrMap.size;
  const queuedManufacturers = Math.max(0, targetManufacturers - mfrMap.size);

  return {
    summary: {
      totalProducts,
      totalManufacturers: mfrMap.size,
      targetManufacturers,
      queuedManufacturers,
      enabledManufacturers: enabledMfrs.length,
      enabledProducts: enabledProductCount,
      scorableProducts,
      searchOnlyProducts: totalProducts - scorableProducts,
      familiesCovered: allFamilies.size,
      lastUpdated: globalLastUpdated,
      // Product-level coverage headline (Decision: unify on per-product). Data =
      // covered slots / required slots; Reach = classifiable / all products. Raw
      // slot counts travel too so the tooltip can show live figures.
      dataCoveragePct: computeDataCoveragePct(coverage.totalCovered, coverage.totalRules),
      reachPct: computeReachPct(scorableProducts, totalProducts),
      coveredSlots: coverage.totalCovered,
      requiredSlots: coverage.totalRules,
    },
    manufacturers,
    familyBreakdown,
    familyNames,
  };
}

async function computeAndPersist(): Promise<{ payload: object; computedAt: string }> {
  const payload = await computeAtlasCoverage();
  const computedAt = new Date().toISOString();
  try {
    const svc = createServiceClient();
    await svc
      .from('admin_stats_cache')
      .upsert({ key: CACHE_KEY, payload, computed_at: computedAt }, { onConflict: 'key' });
  } catch (err) {
    console.error('admin_stats_cache persist failed:', err);
  }
  // Populate L1 too — a background recompute (invalidate / SWR) otherwise wrote
  // only L2, leaving the hot cache serving the pre-recompute payload for the full
  // TTL. Body shape must match the GET response (payload + cachedAt). Newer-
  // guarded against a stale read landing afterward.
  setMemCache(JSON.stringify({ ...payload, cachedAt: computedAt }), computedAt);
  return { payload, computedAt };
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

function isStale(computedAt: string): boolean {
  return Date.now() - new Date(computedAt).getTime() > SWR_STALE_THRESHOLD_MS;
}

/** True when a cached payload carries the current coverage schema (the Data/Reach
 *  fields added in Decision #283). A pre-deploy row lacks `summary.dataCoveragePct`;
 *  treating it as a miss forces a recompute so the first post-deploy read serves
 *  the new fields — cheaper than versioning CACHE_KEY (referenced by 5 scripts). */
function hasCoverageSchema(payload: unknown): boolean {
  const summary = (payload as { summary?: { dataCoveragePct?: unknown } } | null)?.summary;
  return typeof summary?.dataCoveragePct === 'number';
}

function triggerBackgroundRecompute() {
  if (backgroundRecomputeInFlight) return;
  backgroundRecomputeInFlight = true;
  void (async () => {
    try {
      await computeAndPersist();
    } catch (err) {
      console.error('Background recompute failed:', err);
    } finally {
      backgroundRecomputeInFlight = false;
    }
  })();
}

export async function GET(request: NextRequest) {
  try {
    // End users (non-admin) read this endpoint via the /atlas page introduced
    // alongside the existing /admin?section=atlas-coverage view. requireAuth()
    // gates anonymous access; the `?refresh=1` cache-bust below is gated to
    // admins only so end users can't trigger recompute.
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const refreshRequested = request.nextUrl.searchParams.get('refresh') === '1';
    let forceRefresh = false;
    if (refreshRequested && user) {
      const svc = createServiceClient();
      const { data: profile } = await svc
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      forceRefresh = profile?.role === 'admin';
    }

    // L1: in-memory cache
    if (!forceRefresh && memCache && Date.now() - memCacheTimestamp < MEM_CACHE_TTL_MS) {
      return new NextResponse(memCache.body, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let payload: object | null = null;
    let computedAt: string | null = null;

    // L2: persistent cache (unless force refresh)
    if (!forceRefresh) {
      const cached = await readPersistentCache();
      // Skip a pre-schema row that predates the Data/Reach coverage fields — the
      // CACHE_KEY isn't versioned here (it's referenced by several offline
      // scripts), so instead we treat a row lacking summary.dataCoveragePct as a
      // miss and recompute. Prevents serving an old row whose missing coveredSlots
      // would crash AtlasOverviewTab's tooltip for up to the 6h SWR window.
      if (cached && hasCoverageSchema(cached.payload)) {
        payload = cached.payload;
        computedAt = cached.computedAt;
        // SWR: serve stale, refresh silently in the background
        if (isStale(cached.computedAt)) {
          triggerBackgroundRecompute();
        }
      }
    }

    // Synchronous compute on full miss (or force refresh)
    if (!payload || !computedAt) {
      try {
        const fresh = await computeAndPersist();
        payload = fresh.payload;
        computedAt = fresh.computedAt;
      } catch (err) {
        console.error('computeAndPersist failed:', err);
        // Fresh compute failed — fall back to last known good cache
        // even on a force-refresh, so admins don't see synthetic empties.
        const cached = await readPersistentCache();
        if (cached) {
          payload = cached.payload;
          computedAt = cached.computedAt;
        } else {
          return NextResponse.json(
            { error: 'Stats temporarily unavailable', detail: err instanceof Error ? err.message : String(err) },
            { status: 503 }
          );
        }
      }
    }

    const body = JSON.stringify({ ...payload, cachedAt: computedAt });
    setMemCache(body, computedAt);

    return new NextResponse(body, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/admin/atlas error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
