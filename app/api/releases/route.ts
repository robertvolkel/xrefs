import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import type { ReleaseNote } from '@/lib/types';

/** GET /api/releases — all authenticated users. Optional ?limit=N */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(100, Number(limitParam) || 100)) : undefined;

    const supabase = await createClient();
    let query = supabase
      .from('release_notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (limit !== undefined) query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('Release notes fetch error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch release notes' },
        { status: 500 },
      );
    }

    const items: ReleaseNote[] = (data ?? []).map((row) => ({
      id: row.id as string,
      content: row.content as string,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));

    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.error('Release notes GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
