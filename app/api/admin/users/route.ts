import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const supabase = await createClient();

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, disabled, created_at')
      .order('created_at', { ascending: true });

    if (profilesError) {
      return NextResponse.json(
        { success: false, error: profilesError.message },
        { status: 500 },
      );
    }

    // Get activity stats from search_history (aggregated per user)
    const { data: stats } = await supabase
      .from('search_history')
      .select('user_id, created_at');

    // Aggregate stats per user
    const activityMap = new Map<string, { search_count: number; last_active: string }>();
    for (const row of stats ?? []) {
      const existing = activityMap.get(row.user_id);
      if (!existing) {
        activityMap.set(row.user_id, {
          search_count: 1,
          last_active: row.created_at,
        });
      } else {
        existing.search_count += 1;
        if (row.created_at > existing.last_active) {
          existing.last_active = row.created_at;
        }
      }
    }

    // Merge profiles with activity stats
    const users = (profiles ?? []).map((p) => {
      const activity = activityMap.get(p.id);
      return {
        ...p,
        search_count: activity?.search_count ?? 0,
        last_active: activity?.last_active ?? null,
      };
    });

    return NextResponse.json({ success: true, data: users });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
