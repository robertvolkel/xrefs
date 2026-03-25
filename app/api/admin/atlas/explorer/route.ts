import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';

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
      .select('id, mpn, manufacturer, description, category, subcategory, family_id, status, parameters')
      .or(`mpn.ilike.%${q}%,manufacturer.ilike.%${q}%`)
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = (data ?? []).map((row) => {
      const familyId = row.family_id as string | null;
      const table = familyId ? getLogicTable(familyId) : null;
      const params = row.parameters as Record<string, unknown> | null;
      return {
        id: row.id as string,
        mpn: row.mpn as string,
        manufacturer: row.manufacturer as string,
        description: (row.description as string | null) ?? null,
        category: row.category as string,
        subcategory: row.subcategory as string,
        familyId,
        familyName: table?.familyName ?? null,
        status: (row.status as string) || 'Active',
        parameterCount: params ? Object.keys(params).length : 0,
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
