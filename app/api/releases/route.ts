import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import type { ReleaseNote } from '@/lib/types';

/** GET /api/releases — all authenticated users */
export async function GET(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('release_notes')
      .select('*')
      .order('created_at', { ascending: false });

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
