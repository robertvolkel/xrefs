import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';

// ── In-memory cache (120s TTL) ──────────────────────────────
let cachedResponse: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 120_000;

export function invalidateAtlasCache() {
  cachedResponse = null;
  cacheTimestamp = 0;
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

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    // Return cached response if fresh
    if (cachedResponse && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return new NextResponse(cachedResponse, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

    // Build manufacturer identity lookup from atlas_manufacturers (new table)
    const mfrIdentity = new Map<string, { nameEn: string; nameZh: string | null; slug: string; id: number; enabled: boolean }>();
    if (!mfrRecordsErr && mfrRecords) {
      for (const r of mfrRecords as { name_display: string; name_en: string; name_zh: string | null; slug: string; id: number; enabled: boolean }[]) {
        mfrIdentity.set(r.name_display, { nameEn: r.name_en, nameZh: r.name_zh, slug: r.slug, id: r.id, enabled: r.enabled });
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
      const emptyResponse = JSON.stringify({
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
      });
      cachedResponse = emptyResponse;
      cacheTimestamp = Date.now();
      return new NextResponse(emptyResponse, {
        headers: { 'Content-Type': 'application/json' },
      });
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
    // Pre-build per-family rule attributeId sets
    const familyRuleAttrs = new Map<string, Set<string>>();
    for (const fid of allFamilies) {
      const table = getLogicTable(fid);
      if (table) {
        familyRuleAttrs.set(fid, new Set(table.rules.map(r => r.attributeId)));
      }
    }

    // Accumulate coverage using the already-mapped `parameters` JSONB column
    // (keys are attributeIds, so we just intersect with rule attributeIds)
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

      // Per-manufacturer
      let mc = mfrCoverage.get(row.manufacturer);
      if (!mc) { mc = { totalCovered: 0, totalRules: 0 }; mfrCoverage.set(row.manufacturer, mc); }
      mc.totalCovered += covered;
      mc.totalRules += total;

      // Per-manufacturer-family
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

    // Build family ID → name map for tooltip display
    const familyNames: Record<string, string> = {};
    for (const fid of allFamilies) {
      const table = getLogicTable(fid);
      if (table) familyNames[fid] = table.familyName;
    }

    const enabledMfrs = manufacturers.filter((m) => m.enabled);
    const enabledProductCount = enabledMfrs.reduce((sum, m) => sum + m.productCount, 0);

    // Target = all MFRs in the master list; Queued = on the radar but not yet ingested
    const targetManufacturers = mfrRecords?.length ?? mfrMap.size;
    const queuedManufacturers = Math.max(0, targetManufacturers - mfrMap.size);

    const responseBody = JSON.stringify({
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
    });

    // Cache the response
    cachedResponse = responseBody;
    cacheTimestamp = Date.now();

    return new NextResponse(responseBody, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
