import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';

// ── In-memory cache (30min TTL) ──────────────────────────────
let cachedResponse: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1_800_000; // 30 minutes — data only changes on ingestion or logic updates

export function invalidateManufacturersListCache() {
  cachedResponse = null;
  cacheTimestamp = 0;
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

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    if (cachedResponse && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return new NextResponse(cachedResponse, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = await createClient();

    // Three parallel queries:
    // 1. Manufacturers master list (~1K rows, lightweight)
    // 2. RPC: GROUP BY (manufacturer, family_id) with counts + param keys (~2-3K rows)
    // 3. RPC: Cross-ref counts per slug (avoids 1000-row PostgREST limit)
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

    // Cross-ref counts per slug (from RPC — avoids Supabase 1000-row limit)
    const crossRefCounts = new Map<string, number>();
    if (xrefCounts) {
      for (const row of xrefCounts as { manufacturer_slug: string; count: number }[]) {
        crossRefCounts.set(row.manufacturer_slug, Number(row.count));
      }
    }

    if (mfrErr) {
      console.error('Failed to fetch atlas_manufacturers:', mfrErr.message);
      return NextResponse.json({ error: 'Failed to fetch manufacturers' }, { status: 500 });
    }

    // Fallback: if RPC doesn't exist yet, return manufacturers without stats
    if (statsErr) {
      console.warn('get_manufacturer_product_stats RPC failed:', statsErr.message);
      // Return basic response without stats so the page still loads
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
      return NextResponse.json({
        manufacturers: result,
        summary: { totalManufacturers: result.length, withProducts: 0, enabledWithProducts: 0, totalProducts: 0, scorableProducts: 0, familiesCovered: 0 },
      });
    }

    const manufacturers = (mfrRows ?? []) as MfrRow[];
    const stats = (statsRows ?? []) as StatsRow[];

    // Build per-manufacturer aggregation from grouped stats (~2-3K rows vs 55K)
    const productAgg = new Map<string, {
      productCount: number;
      scorableCount: number;
      families: Set<string>;
    }>();
    const allFamilies = new Set<string>();

    // Pre-compute rule attributes per family (cached across iterations)
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

        // Coverage: intersect param_keys with rule attributeIds
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
            // Weight by product count — each product in this group contributes
            mc.totalCovered += covered * count;
            mc.totalRules += ruleAttrs.size * count;
          }
        }
      }
    }

    // Build response — merge master list with aggregated stats
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

    const responseBody = JSON.stringify({
      manufacturers: result,
      summary: {
        totalManufacturers: manufacturers.length,
        withProducts,
        enabledWithProducts,
        totalProducts,
        scorableProducts: totalScorable,
        familiesCovered: allFamilies.size,
      },
    });

    cachedResponse = responseBody;
    cacheTimestamp = Date.now();

    return new NextResponse(responseBody, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
