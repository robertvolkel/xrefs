import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateMfrCrossRefCache } from '@/lib/services/manufacturerCrossRefService';
import { invalidateRecommendationsCache } from '@/lib/services/partDataCache';
import { invalidateManufacturersListCache } from '../../route';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const search = searchParams.get('search')?.trim() || '';

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('manufacturer_cross_references')
      .select('*', { count: 'exact' })
      .eq('manufacturer_slug', slug)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false });

    if (search) {
      query = query.or(`original_mpn.ilike.%${search}%,xref_mpn.ilike.%${search}%,original_manufacturer.ilike.%${search}%,xref_manufacturer.ilike.%${search}%,xref_description.ilike.%${search}%`);
    }

    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Cross-ref list error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch cross-references' }, { status: 500 });
    }

    return NextResponse.json({
      crossRefs: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const body = await request.json();
    const rows = body.rows as Array<{
      xref_mpn: string;
      xref_manufacturer?: string;
      xref_description?: string;
      original_mpn: string;
      original_manufacturer?: string;
      equivalence_type?: string;
    }>;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    // Validate required fields
    const invalid = rows.filter((r, i) => !r.xref_mpn?.trim() || !r.original_mpn?.trim());
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `${invalid.length} rows missing required fields (xref_mpn, original_mpn)` },
        { status: 400 }
      );
    }

    // Generate batch ID
    const upload_batch_id = crypto.randomUUID();

    // Try to enrich descriptions from Atlas (best-effort)
    const supabase = await createClient();
    const xrefMpns = [...new Set(rows.map(r => r.xref_mpn.trim()))];
    const atlasDescriptions = new Map<string, string>();

    if (xrefMpns.length > 0) {
      // Batch query Atlas for clean descriptions (chunks of 100)
      for (let i = 0; i < xrefMpns.length; i += 100) {
        const chunk = xrefMpns.slice(i, i + 100);
        const { data: atlasProducts } = await supabase
          .from('atlas_products')
          .select('mpn, clean_description')
          .in('mpn', chunk)
          .not('clean_description', 'is', null);

        if (atlasProducts) {
          for (const p of atlasProducts) {
            if (p.clean_description) {
              atlasDescriptions.set(p.mpn.toLowerCase(), p.clean_description);
            }
          }
        }
      }
    }

    // Fetch existing active cross-refs for this manufacturer to dedup
    const serviceClient = createServiceClient();
    const { data: existing } = await serviceClient
      .from('manufacturer_cross_references')
      .select('original_mpn, xref_mpn')
      .eq('manufacturer_slug', slug)
      .eq('is_active', true);

    const existingKeys = new Set<string>();
    if (existing) {
      for (const e of existing) {
        existingKeys.add(`${e.original_mpn.toLowerCase()}::${e.xref_mpn.toLowerCase()}`);
      }
    }

    // Build insert rows with Atlas description enrichment, skipping duplicates
    const insertRows: Array<Record<string, unknown>> = [];
    let skipped = 0;
    for (const r of rows) {
      const origMpn = r.original_mpn.trim();
      const xrefMpn = r.xref_mpn.trim();
      const key = `${origMpn.toLowerCase()}::${xrefMpn.toLowerCase()}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key); // also dedup within the same upload

      const uploadedDesc = r.xref_description?.trim() || '';
      const atlasDesc = atlasDescriptions.get(xrefMpn.toLowerCase()) || '';
      const description = atlasDesc.length > uploadedDesc.length ? atlasDesc : uploadedDesc;

      insertRows.push({
        manufacturer_slug: slug,
        xref_mpn: xrefMpn,
        xref_manufacturer: r.xref_manufacturer?.trim() || null,
        xref_description: description || null,
        original_mpn: origMpn,
        original_manufacturer: r.original_manufacturer?.trim() || null,
        equivalence_type: r.equivalence_type === 'pin_to_pin' ? 'pin_to_pin' : 'functional',
        upload_batch_id,
        uploaded_by: user!.id,
      });
    }

    // Insert only new rows
    if (insertRows.length > 0) {
      const { error: insertError } = await serviceClient
        .from('manufacturer_cross_references')
        .insert(insertRows);

      if (insertError) {
        console.error('Cross-ref insert error:', insertError.message);
        return NextResponse.json({ error: 'Failed to insert cross-references' }, { status: 500 });
      }
    }

    // Invalidate cache
    invalidateMfrCrossRefCache();
    invalidateManufacturersListCache();
    invalidateRecommendationsCache();

    return NextResponse.json({
      success: true,
      inserted: insertRows.length,
      skipped,
      batchId: upload_batch_id,
      atlasEnriched: atlasDescriptions.size,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const body = await request.json();
    const ids = body.ids as string[];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from('manufacturer_cross_references')
      .update({ is_active: false })
      .eq('manufacturer_slug', slug)
      .in('id', ids);

    if (error) {
      console.error('Cross-ref delete error:', error.message);
      return NextResponse.json({ error: 'Failed to delete cross-references' }, { status: 500 });
    }

    // Invalidate cache
    invalidateMfrCrossRefCache();
    invalidateManufacturersListCache();
    invalidateRecommendationsCache();

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
