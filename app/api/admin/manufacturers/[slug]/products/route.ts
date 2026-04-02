import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const family = searchParams.get('family');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    // Resolve slug → name_display
    const { data: mfr } = await supabase
      .from('atlas_manufacturers')
      .select('name_display, name_en')
      .eq('slug', slug)
      .single();

    if (!mfr) {
      return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from('atlas_products')
      .select('id, mpn, description, clean_description, family_id, category, subcategory, status, package, parameters', { count: 'exact' })
      .or(`manufacturer.eq.${mfr.name_display},manufacturer.eq.${mfr.name_en}`)
      .order('mpn')
      .range(offset, offset + limit - 1);

    if (family) {
      query = query.eq('family_id', family);
    }
    if (search) {
      query = query.or(`mpn.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: products, count, error } = await query;

    if (error) {
      console.error('Products query error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    // Compute coverage % per product
    const familyRuleAttrs = new Map<string, Set<string>>();
    const result = (products ?? []).map(p => {
      let coveragePct = 0;
      if (p.family_id && p.parameters) {
        if (!familyRuleAttrs.has(p.family_id)) {
          const table = getLogicTable(p.family_id);
          if (table) {
            familyRuleAttrs.set(p.family_id, new Set(table.rules.map(r => r.attributeId)));
          }
        }
        const ruleAttrs = familyRuleAttrs.get(p.family_id);
        if (ruleAttrs && ruleAttrs.size > 0) {
          let covered = 0;
          for (const attr of Object.keys(p.parameters as Record<string, unknown>)) {
            if (ruleAttrs.has(attr)) covered++;
          }
          coveragePct = Math.round((covered / ruleAttrs.size) * 100);
        }
      }

      return {
        id: p.id,
        mpn: p.mpn,
        description: p.clean_description || p.description,
        familyId: p.family_id,
        category: p.category,
        subcategory: p.subcategory,
        status: p.status,
        package: p.package,
        coveragePct,
      };
    });

    return NextResponse.json({
      products: result,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
