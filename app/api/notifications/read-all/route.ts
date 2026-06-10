import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * POST — mark all of the signed-in user's notifications read via the
 * SECURITY DEFINER RPC. Returns the number of rows updated.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('mark_all_notifications_read');

    if (error) {
      console.error('mark_all_notifications_read error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to mark all read' },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, data: { count: (data as number) ?? 0 } });
  } catch (error) {
    console.error('Mark-all-read API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
