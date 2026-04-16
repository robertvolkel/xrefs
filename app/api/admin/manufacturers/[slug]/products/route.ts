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
    const rawSearch = searchParams.get('search');
    // PostgREST .or() uses `,` `(` `)` `:` as syntax. User input that contains
    // these mangles the filter expression (400 from Supabase or wrong results),
    // so strip them before interpolation. ilike `%` `_` are kept intentionally.
    const search = rawSearch ? rawSearch.replace(/[,():*]/g, ' ').trim() : null;
    const sort = searchParams.get('sort'); // 'coverage' or null
    const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
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

    const columns = 'id, mpn, description, clean_description, family_id, category, subcategory, status, package, parameters';
    const familyRuleAttrs = new Map<string, Set<string>>();
    const computeCoverage = (familyId: string | null, parameters: Record<string, unknown> | null): number => {
      if (!familyId || !parameters) return 0;
      if (!familyRuleAttrs.has(familyId)) {
        const table = getLogicTable(familyId);
        if (table) familyRuleAttrs.set(familyId, new Set(table.rules.map(r => r.attributeId)));
      }
      const ruleAttrs = familyRuleAttrs.get(familyId);
      if (!ruleAttrs || ruleAttrs.size === 0) return 0;
      let covered = 0;
      for (const attr of Object.keys(parameters)) {
        if (ruleAttrs.has(attr)) covered++;
      }
      return Math.round((covered / ruleAttrs.size) * 100);
    };

    type RawProduct = {
      id: string;
      mpn: string;
      description: string | null;
      clean_description: string | null;
      family_id: string | null;
      category: string;
      subcategory: string;
      status: string;
      package: string | null;
      parameters: Record<string, unknown> | null;
    };

    const mapProduct = (p: RawProduct, coveragePct: number) => ({
      id: p.id,
      mpn: p.mpn,
      description: p.clean_description || p.description,
      familyId: p.family_id,
      category: p.category,
      subcategory: p.subcategory,
      status: p.status,
      package: p.package,
      coveragePct,
    });

    if (sort === 'coverage') {
      // Fetch all matching rows, compute coverage, sort in-memory, slice.
      // Ascending direction excludes non-scorable rows (family_id IS NULL),
      // otherwise the bottom is a wall of 0% products that can't be improved.
      const all: RawProduct[] = [];
      const PAGE_SIZE = 1000;
      let fetchOffset = 0;
      while (true) {
        let q = supabase
          .from('atlas_products')
          .select(columns)
          .or(`manufacturer.eq.${mfr.name_display},manufacturer.eq.${mfr.name_en}`)
          .order('id')
          .range(fetchOffset, fetchOffset + PAGE_SIZE - 1);
        if (family) q = q.eq('family_id', family);
        if (search) q = q.or(`mpn.ilike.%${search}%,description.ilike.%${search}%`);
        if (dir === 'asc') q = q.not('family_id', 'is', null);

        const { data: pageData, error } = await q;
        if (error) {
          console.error('Products query error:', error.message);
          return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }
        if (!pageData || pageData.length === 0) break;
        all.push(...(pageData as RawProduct[]));
        if (pageData.length < PAGE_SIZE) break;
        fetchOffset += PAGE_SIZE;
      }

      const withCoverage = all.map(p => ({ p, coverage: computeCoverage(p.family_id, p.parameters) }));
      withCoverage.sort((a, b) => {
        const d = dir === 'asc' ? a.coverage - b.coverage : b.coverage - a.coverage;
        return d !== 0 ? d : a.p.mpn.localeCompare(b.p.mpn);
      });

      const total = withCoverage.length;
      const slice = withCoverage.slice(offset, offset + limit).map(({ p, coverage }) => mapProduct(p, coverage));

      return NextResponse.json({
        products: slice,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }

    // Default path: SQL order by MPN, range-paginated
    let query = supabase
      .from('atlas_products')
      .select(columns, { count: 'exact' })
      .or(`manufacturer.eq.${mfr.name_display},manufacturer.eq.${mfr.name_en}`)
      .order('mpn')
      .range(offset, offset + limit - 1);

    if (family) query = query.eq('family_id', family);
    if (search) query = query.or(`mpn.ilike.%${search}%,description.ilike.%${search}%`);

    const { data: products, count, error } = await query;

    if (error) {
      console.error('Products query error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const result = ((products ?? []) as RawProduct[]).map(p => mapProduct(p, computeCoverage(p.family_id, p.parameters)));

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
