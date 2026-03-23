import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const supabase = await createClient();

    // Global stats
    const { count: totalProducts } = await supabase
      .from('atlas_products')
      .select('*', { count: 'exact', head: true });

    const { count: scorableProducts } = await supabase
      .from('atlas_products')
      .select('*', { count: 'exact', head: true })
      .not('family_id', 'is', null);

    // Per-manufacturer stats — paginate to get all rows (Supabase default limit is 1000)
    const PAGE_SIZE = 1000;
    const rows: { manufacturer: string; family_id: string | null; category: string; subcategory: string; updated_at: string; parameters: Record<string, unknown> | null }[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase
        .from('atlas_products')
        .select('manufacturer, family_id, category, subcategory, updated_at, parameters')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (rows.length === 0) {
      return NextResponse.json({
        summary: {
          totalProducts: 0,
          totalManufacturers: 0,
          scorableProducts: 0,
          searchOnlyProducts: 0,
          familiesCovered: 0,
          lastUpdated: null,
        },
        manufacturers: [],
        familyBreakdown: [],
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
      familyId: string;
      category: string;
      subcategory: string;
      count: number;
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

      // Per-manufacturer-family breakdown
      if (row.family_id) {
        const key = `${row.manufacturer}::${row.family_id}`;
        let fb = familyBreakdownMap.get(key);
        if (!fb) {
          fb = { manufacturer: row.manufacturer, familyId: row.family_id, category: row.category, subcategory: row.subcategory, count: 0 };
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

    for (const row of rows) {
      if (!row.family_id || !row.parameters) continue;

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
        return {
          manufacturer: name,
          productCount: m.productCount,
          scorableCount: m.scorableCount,
          families: [...m.families].sort(),
          categories: [...m.categories].sort(),
          lastUpdated: m.lastUpdated,
          coveragePct: cov && cov.totalRules > 0
            ? Math.round((cov.totalCovered / cov.totalRules) * 100)
            : 0,
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
      .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.familyId.localeCompare(b.familyId));

    // Build family ID → name map for tooltip display
    const familyNames: Record<string, string> = {};
    for (const fid of allFamilies) {
      const table = getLogicTable(fid);
      if (table) familyNames[fid] = table.familyName;
    }

    return NextResponse.json({
      summary: {
        totalProducts: totalProducts ?? rows.length,
        totalManufacturers: mfrMap.size,
        scorableProducts: scorableProducts ?? 0,
        searchOnlyProducts: (totalProducts ?? rows.length) - (scorableProducts ?? 0),
        familiesCovered: allFamilies.size,
        lastUpdated: globalLastUpdated,
      },
      manufacturers,
      familyBreakdown,
      familyNames,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
