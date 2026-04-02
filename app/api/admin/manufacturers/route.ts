import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';

// ── In-memory cache (60s TTL) ──────────────────────────────
let cachedResponse: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1_800_000; // 30 minutes — data only changes on ingestion or logic updates

export function invalidateManufacturersListCache() {
  cachedResponse = null;
  cacheTimestamp = 0;
}

// ── Paginated fetch (same pattern as /api/admin/atlas) ─────
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

interface MfrRow {
  name_display: string;
  name_en: string;
  name_zh: string | null;
  slug: string;
  id: number;
  enabled: boolean;
  website_url: string | null;
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

    // Fetch all data in parallel: manufacturers, lightweight product rows, scorable rows with JSONB
    const [{ data: mfrRows, error: mfrErr }, lightRows, scorableRows] = await Promise.all([
      supabase
        .from('atlas_manufacturers')
        .select('name_display, name_en, name_zh, slug, id, enabled, website_url')
        .order('name_en'),
      fetchAllPages<{ manufacturer: string; family_id: string | null }>(
        supabase,
        'atlas_products',
        'manufacturer, family_id',
      ),
      fetchAllPages<{ manufacturer: string; family_id: string; parameters: Record<string, unknown> | null }>(
        supabase,
        'atlas_products',
        'manufacturer, family_id, parameters',
        (q) => q.not('family_id', 'is', null),
      ),
    ]);

    if (mfrErr) {
      console.error('Failed to fetch atlas_manufacturers:', mfrErr.message);
      return NextResponse.json({ error: 'Failed to fetch manufacturers' }, { status: 500 });
    }

    const manufacturers = (mfrRows ?? []) as MfrRow[];

    // Aggregate per-manufacturer from lightweight rows
    const productAgg = new Map<string, {
      productCount: number;
      scorableCount: number;
      families: Set<string>;
      lastUpdated: string;
    }>();

    const allFamilies = new Set<string>();

    for (const row of lightRows) {
      let agg = productAgg.get(row.manufacturer);
      if (!agg) {
        agg = { productCount: 0, scorableCount: 0, families: new Set(), lastUpdated: '' };
        productAgg.set(row.manufacturer, agg);
      }
      agg.productCount++;
      if (row.family_id) {
        agg.scorableCount++;
        agg.families.add(row.family_id);
        allFamilies.add(row.family_id);
      }
    }

    // Coverage calculation from scorable rows (with JSONB parameters)
    const familyRuleAttrs = new Map<string, Set<string>>();
    const mfrCoverage = new Map<string, { totalCovered: number; totalRules: number }>();

    for (const row of scorableRows) {
      if (!row.parameters) continue;
      if (!familyRuleAttrs.has(row.family_id)) {
        const table = getLogicTable(row.family_id);
        if (table) {
          familyRuleAttrs.set(row.family_id, new Set(table.rules.map(r => r.attributeId)));
        }
      }
      const ruleAttrs = familyRuleAttrs.get(row.family_id);
      if (!ruleAttrs || ruleAttrs.size === 0) continue;

      let covered = 0;
      for (const attr of Object.keys(row.parameters)) {
        if (ruleAttrs.has(attr)) covered++;
      }

      let mc = mfrCoverage.get(row.manufacturer);
      if (!mc) { mc = { totalCovered: 0, totalRules: 0 }; mfrCoverage.set(row.manufacturer, mc); }
      mc.totalCovered += covered;
      mc.totalRules += ruleAttrs.size;
    }

    // Build response — merge master list with product aggregations
    // Try name_display first (full "ENGLISH Chinese" format), then name_en (English-only)
    // because atlas_products.manufacturer may use either format
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
      };
    });

    const totalProducts = lightRows.length;
    const scorableProducts = scorableRows.length;
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
        scorableProducts,
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
