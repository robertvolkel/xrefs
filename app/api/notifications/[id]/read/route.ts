import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * POST — mark a single notification read. Goes through the SECURITY DEFINER
 * RPC, which is locked to the caller's own rows.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;
    const supabase = await createClient();
    const { error } = await supabase.rpc('mark_notification_read', { p_id: id });

    if (error) {
      console.error('mark_notification_read error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to mark read' },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Mark-read API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
