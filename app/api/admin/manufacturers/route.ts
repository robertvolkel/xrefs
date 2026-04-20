import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';

// ── Hot in-memory cache (60s) ─────────────────────────────────
// Fronts the persistent admin_stats_cache row so per-render
// navigation in the panel doesn't re-hit Supabase.
let memCache: { body: string; cachedAt: string } | null = null;
let memCacheTimestamp = 0;
const MEM_CACHE_TTL_MS = 60_000;

const CACHE_KEY = 'manufacturers-list';

export function invalidateManufacturersListCache() {
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
      console.error('invalidateManufacturersListCache background error:', err);
    }
  })();
}

interface MfrRow {
  name_display: string;
  name_en: string;
  name_zh: string | null;
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

async function computeStats(): Promise<object> {
  const supabase = await createClient();

  const [{ data: mfrRows, error: mfrErr }, rpcResult, { data: xrefCounts }] = await Promise.all([
    supabase
      .from('atlas_manufacturers')
      .select('name_display, name_en, name_zh, slug, id, enabled, website_url, updated_at')
      .order('name_en'),
    supabase.rpc('get_manufacturer_product_stats'),
    supabase.rpc('get_cross_ref_counts'),
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
  const mfrCoverage = new Map<string, { totalCovered: number; totalRules: number }>();

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

      if (row.param_keys && row.param_keys.length > 0) {
        if (!familyRuleAttrs.has(row.family_id)) {
          const table = getLogicTable(row.family_id);
          if (table) {
            familyRuleAttrs.set(row.family_id, new Set(table.rules.map(r => r.attributeId)));
          }
        }
        const ruleAttrs = familyRuleAttrs.get(row.family_id);
        if (ruleAttrs && ruleAttrs.size > 0) {
          let covered = 0;
          for (const key of row.param_keys) {
            if (ruleAttrs.has(key)) covered++;
          }

          let mc = mfrCoverage.get(row.manufacturer);
          if (!mc) { mc = { totalCovered: 0, totalRules: 0 }; mfrCoverage.set(row.manufacturer, mc); }
          mc.totalCovered += covered * count;
          mc.totalRules += ruleAttrs.size * count;
        }
      }
    }
  }

  const result = manufacturers.map((m) => {
    const agg = productAgg.get(m.name_display) || productAgg.get(m.name_en);
    const cov = mfrCoverage.get(m.name_display) || mfrCoverage.get(m.name_en);
    const xrefTs = crossRefLastUpload.get(m.slug) ?? null;
    const productTs = agg?.lastProductUpdate ?? null;
    return {
      id: m.id,
      slug: m.slug,
      nameEn: m.name_en,
      nameZh: m.name_zh,
      nameDisplay: m.name_display,
      enabled: m.enabled,
      websiteUrl: m.website_url,
      productCount: agg?.productCount ?? 0,
      scorableCount: agg?.scorableCount ?? 0,
      families: agg ? [...agg.families].sort() : [],
      coveragePct: cov && cov.totalRules > 0
        ? Math.round((cov.totalCovered / cov.totalRules) * 100)
        : 0,
      crossRefCount: crossRefCounts.get(m.slug) || 0,
      lastProductUpdate: productTs,
      lastProfileUpdate: m.updated_at,
      lastCrossRefUpdate: xrefTs,
      lastModified: maxIso(maxIso(productTs, m.updated_at), xrefTs),
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

    // Invalidate caches so the list reflects new profile data
    invalidateManufacturersListCache();

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
