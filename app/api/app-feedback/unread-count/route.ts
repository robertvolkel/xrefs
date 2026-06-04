import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * Count distinct feedback threads with at least one unread admin-authored
 * comment for the signed-in user. Drives the sidebar red dot on the
 * `/feedback` icon.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createClient();

    const { data: rows, error } = await supabase
      .from('app_feedback')
      .select('id, user_last_read_at')
      .eq('user_id', user!.id);
    if (error) {
      console.error('Unread-count own feedback fetch error:', error.message);
      return NextResponse.json({ success: true, data: { count: 0 } });
    }

    const ownIds = (rows ?? []).map((r) => r.id as string);
    if (ownIds.length === 0) {
      return NextResponse.json({ success: true, data: { count: 0 } });
    }

    const lastReadByFid = new Map<string, string | undefined>(
      (rows ?? []).map((r) => [r.id as string, r.user_last_read_at as string | undefined]),
    );

    const { data: adminComments, error: cErr } = await supabase
      .from('app_feedback_comments')
      .select('feedback_id, created_at')
      .in('feedback_id', ownIds)
      .eq('author_role', 'admin');
    if (cErr) {
      console.error('Unread-count comments fetch error:', cErr.message);
      return NextResponse.json({ success: true, data: { count: 0 } });
    }

    const unreadFids = new Set<string>();
    for (const c of (adminComments ?? []) as Record<string, unknown>[]) {
      const fid = c.feedback_id as string;
      const lastRead = lastReadByFid.get(fid);
      const ts = c.created_at as string;
      if (!lastRead || ts > lastRead) unreadFids.add(fid);
    }

    return NextResponse.json({ success: true, data: { count: unreadFids.size } });
  } catch (error) {
    console.error('Unread-count API error:', error);
    return NextResponse.json({ success: true, data: { count: 0 } });
  }
}
