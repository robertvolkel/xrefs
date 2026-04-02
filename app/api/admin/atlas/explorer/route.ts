import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';
import { getL2ParamMapForCategory, type ParamMapEntry, type ParamMapping } from '@/lib/services/digikeyParamMap';

/** Count unique attributeIds in a ParamMapEntry record */
function countParamMapAttrs(paramMap: Record<string, ParamMapEntry>): Set<string> {
  const ids = new Set<string>();
  for (const entry of Object.values(paramMap)) {
    if (Array.isArray(entry)) {
      for (const m of entry) ids.add((m as ParamMapping).attributeId);
    } else {
      ids.add((entry as ParamMapping).attributeId);
    }
  }
  return ids;
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, description, clean_description, category, subcategory, family_id, status, parameters')
      .or(`mpn.ilike.%${q}%,manufacturer.ilike.%${q}%`)
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = (data ?? []).map((row) => {
      const familyId = row.family_id as string | null;
      const table = familyId ? getLogicTable(familyId) : null;
      const params = row.parameters as Record<string, unknown> | null;
      const paramKeys = params ? new Set(Object.keys(params)) : new Set<string>();

      // Compute coverage against schema (L3 logic table or L2 param map)
      let coveragePct: number | null = null;
      let schemaMatchCount = 0;
      let schemaTotalCount = 0;

      if (table) {
        // L3: count how many rule attributeIds exist in the product's parameters
        schemaTotalCount = table.rules.length;
        schemaMatchCount = table.rules.filter((r) => paramKeys.has(r.attributeId)).length;
        coveragePct = schemaTotalCount > 0 ? Math.round((schemaMatchCount / schemaTotalCount) * 100) : null;
      } else {
        // L2: count how many param map attributeIds exist
        const category = row.category as string;
        const l2Map = getL2ParamMapForCategory(category);
        if (l2Map) {
          const l2AttrIds = countParamMapAttrs(l2Map);
          schemaTotalCount = l2AttrIds.size;
          schemaMatchCount = [...l2AttrIds].filter((id) => paramKeys.has(id)).length;
          coveragePct = schemaTotalCount > 0 ? Math.round((schemaMatchCount / schemaTotalCount) * 100) : null;
        }
      }

      return {
        id: row.id as string,
        mpn: row.mpn as string,
        manufacturer: row.manufacturer as string,
        description: (row.clean_description as string | null) || (row.description as string | null) || null,
        category: row.category as string,
        subcategory: row.subcategory as string,
        familyId,
        familyName: table?.familyName ?? null,
        status: (row.status as string) || 'Active',
        parameterCount: params ? Object.keys(params).length : 0,
        coveragePct,
        schemaMatchCount,
        schemaTotalCount,
      };
    });

    return NextResponse.json({
      results,
      total: results.length,
      capped: results.length === 50,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
