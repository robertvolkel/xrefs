import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const supabase = await createClient();

    let query = supabase
      .from('atlas_product_flags')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`mpn.ilike.%${search}%,manufacturer.ilike.%${search}%,comment.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Atlas flags fetch error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch flags' }, { status: 500 });
    }

    // Resolve admin names
    const userIds = [...new Set((data ?? []).map(f => f.created_by))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    const nameMap = new Map<string, string>();
    for (const p of (profiles ?? [])) {
      nameMap.set(p.id, p.full_name || p.email || 'Unknown');
    }

    const flags = (data ?? []).map(f => ({
      id: f.id,
      productId: f.product_id,
      mpn: f.mpn,
      manufacturer: f.manufacturer,
      comment: f.comment,
      status: f.status,
      createdBy: f.created_by,
      createdByName: nameMap.get(f.created_by) || 'Unknown',
      createdAt: f.created_at,
      resolvedBy: f.resolved_by,
      resolvedAt: f.resolved_at,
    }));

    return NextResponse.json({ flags });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const { productId, mpn, manufacturer, comment } = body;

    if (!productId || !mpn || !comment) {
      return NextResponse.json({ error: 'productId, mpn, and comment are required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('atlas_product_flags')
      .insert({
        product_id: productId,
        mpn,
        manufacturer: manufacturer || '',
        comment,
        created_by: user!.id,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Atlas flag insert error:', error.message);
      return NextResponse.json({ error: 'Failed to create flag' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
