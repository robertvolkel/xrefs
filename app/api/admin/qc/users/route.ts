import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns the distinct set of users that actually appear in the
 * recommendation_log (i.e. users with Activity Logs activity), enriched
 * with their profile name/email. Used to populate the "Filter by user"
 * dropdown so it never lists users who have no activity.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const supabase = await createClient();

    // Collect distinct user_ids by paging through the log (single light column).
    // PostgREST caps page size at 1000; stop once a short page is returned.
    const userIds = new Set<string>();
    const PAGE = 1000;
    const MAX_PAGES = 200; // safety cap (200k rows)
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('recommendation_log')
        .select('user_id')
        .order('user_id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (error) {
        console.error('QC active-users query error:', error.message);
        return NextResponse.json(
          { success: false, error: `Failed to fetch users: ${error.message}` },
          { status: 500 },
        );
      }

      for (const row of data ?? []) {
        if (row.user_id) userIds.add(row.user_id as string);
      }
      if (!data || data.length < PAGE) break;
      if (page === MAX_PAGES - 1) {
        console.warn('QC active-users: hit MAX_PAGES cap; some old-only users may be omitted');
      }
    }

    const ids = [...userIds];
    if (ids.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Enrich with profile name/email (chunk .in() to stay within limits).
    const users: Array<{ id: string; email: string; full_name: string | null }> = [];
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', batch);
      if (error) {
        console.error('QC active-users profile query error:', error.message);
        return NextResponse.json(
          { success: false, error: `Failed to fetch profiles: ${error.message}` },
          { status: 500 },
        );
      }
      for (const p of profiles ?? []) {
        users.push({
          id: p.id as string,
          email: p.email as string,
          full_name: (p.full_name as string | null) ?? null,
        });
      }
    }

    users.sort((a, b) =>
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
    );

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('QC active-users API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
