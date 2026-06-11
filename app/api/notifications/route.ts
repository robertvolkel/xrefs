import { NextRequest, NextResponse } from 'next/server';
import { Notification } from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function mapRow(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    recipientId: row.recipient_id as string,
    type: row.type as Notification['type'],
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    link: (row.link as string | null) ?? null,
    data: (row.data as Record<string, unknown>) ?? {},
    readAt: (row.read_at as string | null) ?? null,
    emailSentAt: (row.email_sent_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * GET — the signed-in user's notifications, newest first. Cursor pagination
 * via `?before=<ISO created_at>`; RLS scopes rows to the owner.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT,
      MAX_LIMIT,
    );
    const before = searchParams.get('before');

    const supabase = await createClient();
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) {
      console.error('Notifications list query error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch notifications' },
        { status: 500 },
      );
    }

    const items = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error('Notifications list API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
