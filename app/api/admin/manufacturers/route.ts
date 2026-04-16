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
}

interface StatsRow {
  manufacturer: string;
  family_id: string | null;
  product_count: number;
  param_keys: string[] | null;
}

async function computeStats(): Promise<object> {
  const supabase = await createClient();

  const [{ data: mfrRows, error: mfrErr }, rpcResult, { data: xrefCounts }] = await Promise.all([
    supabase
      .from('atlas_manufacturers')
      .select('name_display, name_en, name_zh, slug, id, enabled, website_url')
      .order('name_en'),
    supabase.rpc('get_manufacturer_product_stats'),
    supabase.rpc('get_cross_ref_counts'),
  ]);
  const statsRows = rpcResult.data as StatsRow[] | null;
  const statsErr = rpcResult.error;

  const crossRefCounts = new Map<string, number>();
  if (xrefCounts) {
    for (const row of xrefCounts as { manufacturer_slug: string; count: number }[]) {
      crossRefCounts.set(row.manufacturer_slug, Number(row.count));
    }
  }

  if (mfrErr) {
    throw new Error(`Failed to fetch atlas_manufacturers: ${mfrErr.message}`);
  }

  if (statsErr) {
    console.warn('get_manufacturer_product_stats RPC failed:', statsErr.message);
    const result = (mfrRows ?? []).map((m: MfrRow) => ({
      id: m.id,
      slug: m.slug,
      nameEn: m.name_en,
      nameZh: m.name_zh,
      nameDisplay: m.name_display,
      enabled: m.enabled,
      websiteUrl: m.website_url,
      productCount: 0,
      scorableCount: 0,
      families: [] as string[],
      coveragePct: 0,
      crossRefCount: crossRefCounts.get(m.slug) || 0,
    }));
    return {
      manufacturers: result,
      summary: { totalManufacturers: result.length, withProducts: 0, enabledWithProducts: 0, totalProducts: 0, scorableProducts: 0, familiesCovered: 0 },
    };
  }

  const manufacturers = (mfrRows ?? []) as MfrRow[];
  const stats = (statsRows ?? []) as StatsRow[];

  const productAgg = new Map<string, {
    productCount: number;
    scorableCount: number;
    families: Set<string>;
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
      agg = { productCount: 0, scorableCount: 0, families: new Set() };
      productAgg.set(row.manufacturer, agg);
    }
    agg.productCount += count;

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

    if (!forceRefresh) {
      try {
        const svc = createServiceClient();
        const { data } = await svc
          .from('admin_stats_cache')
          .select('payload, computed_at')
          .eq('key', CACHE_KEY)
          .maybeSingle();
        if (data?.payload) {
          payload = data.payload as object;
          computedAt = data.computed_at as string;
        }
      } catch (err) {
        console.error('admin_stats_cache read failed:', err);
      }
    }

    if (!payload || !computedAt) {
      const fresh = await computeAndPersist();
      payload = fresh.payload;
      computedAt = fresh.computedAt;
    }

    const body = JSON.stringify({ ...payload, cachedAt: computedAt });
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
