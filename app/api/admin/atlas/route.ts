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
    const rows: { manufacturer: string; family_id: string | null; category: string; subcategory: string; updated_at: string }[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase
        .from('atlas_products')
        .select('manufacturer, family_id, category, subcategory, updated_at')
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

    const manufacturers = [...mfrMap.entries()]
      .map(([name, m]) => ({
        manufacturer: name,
        productCount: m.productCount,
        scorableCount: m.scorableCount,
        families: [...m.families].sort(),
        categories: [...m.categories].sort(),
        lastUpdated: m.lastUpdated,
      }))
      .sort((a, b) => b.productCount - a.productCount);

    const familyBreakdown = [...familyBreakdownMap.values()]
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
