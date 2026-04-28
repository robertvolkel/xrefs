import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';

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

// If the persistent cache is older than this, serve it (stale-while-revalidate)
// AND kick off a background recompute. Safety net for writes that don't
// explicitly invalidate (e.g. offline ingestion scripts).
const SWR_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

let backgroundRecomputeInFlight = false;

export function invalidateAtlasCache() {
  memCache = null;
  memCacheTimestamp = 0;
  // Fire-and-forget: clear persistent row AND kick off a background
  // recompute so the next admin page load is instant.
  void (async () => {
    try {
      const svc = createServiceClient();
      await svc.from('admin_stats_cache').delete().eq('key', CACHE_KEY);
      await computeAndPersist();
    } catch (err) {
      console.error('invalidateAtlasCache background error:', err);
    }
  })();
}

async function fetchAllPages<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const results: T[] = [];
  let offset = 0;
  while (true) {
    let query = supabase.from(table).select(columns).order('id').range(offset, offset + PAGE_SIZE - 1);
    if (filter) query = filter(query);
    const { data: page } = await query;
    if (!page || page.length === 0) break;
    results.push(...(page as T[]));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

async function computeAtlasCoverage(): Promise<object> {
  const supabase = await createClient();

  // Fetch all data in parallel: lightweight rows, scorable rows with JSONB, manufacturer records, legacy settings
  const [rows, scorableRows, { data: mfrRecords, error: mfrRecordsErr }, { data: mfrSettings }] = await Promise.all([
    fetchAllPages<{ manufacturer: string; family_id: string | null; category: string; subcategory: string; updated_at: string }>(
      supabase,
      'atlas_products',
      'manufacturer, family_id, category, subcategory, updated_at',
    ),
    fetchAllPages<{ manufacturer: string; family_id: string; parameters: Record<string, unknown> | null }>(
      supabase,
      'atlas_products',
      'manufacturer, family_id, parameters',
      (q) => q.not('family_id', 'is', null),
    ),
    supabase.from('atlas_manufacturers').select('name_display, name_en, name_zh, slug, id, enabled'),
    supabase.from('atlas_manufacturer_settings').select('manufacturer, enabled'),
  ]);

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

  if (rows.length === 0) {
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
      },
      manufacturers: [],
      familyBreakdown: [],
      familyNames: {},
    };
  }

  // Aggregate per-manufacturer
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

  const allFamilies = new Set<string>();
  let globalLastUpdated: string | null = null;

  for (const row of rows) {
    // Per-manufacturer
    let mfr = mfrMap.get(row.manufacturer);
    if (!mfr) {
      mfr = { productCount: 0, scorableCount: 0, families: new Set(), categories: new Set(), lastUpdated: row.updated_at };
      mfrMap.set(row.manufacturer, mfr);
    }
    mfr.productCount++;
    if (row.family_id) {
      mfr.scorableCount++;
      mfr.families.add(row.family_id);
      allFamilies.add(row.family_id);
    }
    mfr.categories.add(row.category);
    if (row.updated_at > mfr.lastUpdated) mfr.lastUpdated = row.updated_at;
    if (!globalLastUpdated || row.updated_at > globalLastUpdated) globalLastUpdated = row.updated_at;

    // Per-manufacturer-family breakdown (scorable + non-scorable)
    if (row.family_id) {
      const key = `${row.manufacturer}::${row.family_id}`;
      let fb = familyBreakdownMap.get(key);
      if (!fb) {
        fb = { manufacturer: row.manufacturer, familyId: row.family_id, category: row.category, subcategory: row.subcategory, count: 0, scorableCount: 0 };
        familyBreakdownMap.set(key, fb);
      }
      fb.count++;
      fb.scorableCount++;
    } else {
      const key = `${row.manufacturer}::_::${row.category}::${row.subcategory}`;
      let fb = familyBreakdownMap.get(key);
      if (!fb) {
        fb = { manufacturer: row.manufacturer, familyId: null, category: row.category, subcategory: row.subcategory, count: 0, scorableCount: 0 };
        familyBreakdownMap.set(key, fb);
      }
      fb.count++;
    }
  }

  // ── Coverage calculation ───────────────────────────────
  const familyRuleAttrs = new Map<string, Set<string>>();
  for (const fid of allFamilies) {
    const table = getLogicTable(fid);
    if (table) {
      familyRuleAttrs.set(fid, new Set(table.rules.map(r => r.attributeId)));
    }
  }

  const mfrCoverage = new Map<string, { totalCovered: number; totalRules: number }>();
  const fbCoverage = new Map<string, { totalCovered: number; totalRules: number }>();

  for (const row of scorableRows) {
    if (!row.parameters) continue;

    const ruleAttrs = familyRuleAttrs.get(row.family_id);
    if (!ruleAttrs || ruleAttrs.size === 0) continue;

    const productAttrs = Object.keys(row.parameters);
    let covered = 0;
    for (const attr of productAttrs) {
      if (ruleAttrs.has(attr)) covered++;
    }
    const total = ruleAttrs.size;

    let mc = mfrCoverage.get(row.manufacturer);
    if (!mc) { mc = { totalCovered: 0, totalRules: 0 }; mfrCoverage.set(row.manufacturer, mc); }
    mc.totalCovered += covered;
    mc.totalRules += total;

    const fbKey = `${row.manufacturer}::${row.family_id}`;
    let fc = fbCoverage.get(fbKey);
    if (!fc) { fc = { totalCovered: 0, totalRules: 0 }; fbCoverage.set(fbKey, fc); }
    fc.totalCovered += covered;
    fc.totalRules += total;
  }

  const manufacturers = [...mfrMap.entries()]
    .map(([name, m]) => {
      const cov = mfrCoverage.get(name);
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
      totalProducts: rows.length,
      totalManufacturers: mfrMap.size,
      targetManufacturers,
      queuedManufacturers,
      enabledManufacturers: enabledMfrs.length,
      enabledProducts: enabledProductCount,
      scorableProducts: scorableRows.length,
      searchOnlyProducts: rows.length - scorableRows.length,
      familiesCovered: allFamilies.size,
      lastUpdated: globalLastUpdated,
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
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

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
      if (cached) {
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
    memCache = { body, cachedAt: computedAt };
    memCacheTimestamp = Date.now();

    return new NextResponse(body, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/admin/atlas error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
