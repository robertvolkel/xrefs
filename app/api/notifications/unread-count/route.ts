import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * Count of unread notifications for the signed-in user. Drives the bell
 * badge in the sidebar.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createClient();
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user!.id)
      .is('read_at', null);

    if (error) {
      console.error('Notifications unread-count error:', error.message);
      return NextResponse.json({ success: true, data: { count: 0 } });
    }

    return NextResponse.json({ success: true, data: { count: count ?? 0 } });
  } catch (error) {
    console.error('Notifications unread-count API error:', error);
    return NextResponse.json({ success: true, data: { count: 0 } });
  }
}
