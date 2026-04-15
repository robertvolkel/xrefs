import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { DistributorClickEntry } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const distributor = searchParams.get('distributor');
    const search = searchParams.get('search')?.trim();
    const sortBy = searchParams.get('sort_by') ?? 'created_at';
    const sortDir = searchParams.get('sort_dir') ?? 'desc';
    const page = parseInt(searchParams.get('page') ?? '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const offset = page * limit;

    const supabase = await createClient();

    // Pre-query profiles if searching by user name/email
    let searchUserIds: string[] | undefined;
    if (search) {
      const { data: matchingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
      if (matchingProfiles && matchingProfiles.length > 0) {
        searchUserIds = matchingProfiles.map((p: Record<string, unknown>) => p.id as string);
      }
    }

    let query = supabase
      .from('distributor_clicks')
      .select('*', { count: 'exact' });

    if (distributor) {
      query = query.eq('distributor', distributor);
    }

    if (search) {
      const columnFilter = `mpn.ilike.%${search}%,manufacturer.ilike.%${search}%,distributor.ilike.%${search}%`;
      if (searchUserIds && searchUserIds.length > 0) {
        query = query.or(`${columnFilter},user_id.in.(${searchUserIds.join(',')})`);
      } else {
        query = query.or(columnFilter);
      }
    }

    const allowedSorts = ['created_at', 'mpn', 'manufacturer', 'distributor'];
    const column = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    query = query
      .order(column, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: clicks, count, error } = await query;

    if (error) {
      console.error('Distributor clicks query error:', error.message);
      return NextResponse.json(
        { success: false, error: `Failed to fetch clicks: ${error.message}` },
        { status: 500 },
      );
    }

    // Profile enrichment
    const userIds = [...new Set((clicks ?? []).map((c: Record<string, unknown>) => c.user_id as string))];
    const profileMap = new Map<string, { email?: string; full_name?: string }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.id as string, { email: p.email, full_name: p.full_name });
        }
      }
    }

    const items: DistributorClickEntry[] = (clicks ?? []).map((row: Record<string, unknown>) => {
      const profile = profileMap.get(row.user_id as string);
      return {
        id: row.id as string,
        userId: row.user_id as string,
        mpn: row.mpn as string,
        manufacturer: row.manufacturer as string,
        distributor: row.distributor as string,
        productUrl: row.product_url as string | undefined,
        createdAt: row.created_at as string,
        userEmail: profile?.email,
        userName: profile?.full_name,
      };
    });

    return NextResponse.json({
      success: true,
      data: { items, total: count ?? 0 },
    });
  } catch (error) {
    console.error('Distributor clicks API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
