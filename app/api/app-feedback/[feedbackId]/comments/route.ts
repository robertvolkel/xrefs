import { NextRequest, NextResponse } from 'next/server';
import { AppFeedbackComment, AppFeedbackCommentAuthorRole } from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

const MAX_BODY_CHARS = 4000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { feedbackId } = await params;
    const body = await request.json().catch(() => ({}));
    const text = String(body?.body ?? '').trim();

    if (!text) {
      return NextResponse.json({ success: false, error: 'Comment cannot be empty' }, { status: 400 });
    }
    if (text.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { success: false, error: `Comment exceeds ${MAX_BODY_CHARS} characters` },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Resolve caller role + verify the caller has access to this thread.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user!.id)
      .maybeSingle();
    const isAdmin = profile?.role === 'admin';

    const { data: feedbackRow, error: fbErr } = await supabase
      .from('app_feedback')
      .select('id, user_id')
      .eq('id', feedbackId)
      .maybeSingle();
    if (fbErr) {
      console.error('Feedback row fetch error for comment:', fbErr.message);
      return NextResponse.json(
        { success: false, error: 'Failed to verify feedback' },
        { status: 500 },
      );
    }
    if (!feedbackRow) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    const isOwner = (feedbackRow.user_id as string) === user!.id;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const role: AppFeedbackCommentAuthorRole = isAdmin ? 'admin' : 'user';
    const nowIso = new Date().toISOString();

    const { data: inserted, error: insErr } = await supabase
      .from('app_feedback_comments')
      .insert({
        feedback_id: feedbackId,
        author_id: user!.id,
        author_role: role,
        body: text,
      })
      .select('id, feedback_id, author_id, author_role, body, created_at')
      .single();

    if (insErr || !inserted) {
      console.error('Comment insert failed:', insErr?.message, insErr?.details, insErr?.hint, insErr?.code);
      // Surface the underlying cause so missing-table / RLS errors are visible.
      const detail = insErr?.message
        ? `${insErr.message}${insErr.code ? ` [${insErr.code}]` : ''}`
        : 'unknown error';
      return NextResponse.json(
        { success: false, error: `Failed to post comment: ${detail}` },
        { status: 500 },
      );
    }

    // Stamp the author's own read timestamp so their own message doesn't
    // immediately surface as "unread" to themselves. Admin can hit the table
    // directly; user has to go through the SECURITY DEFINER RPC because RLS
    // blocks direct UPDATE on app_feedback for non-admins.
    if (role === 'admin') {
      await supabase
        .from('app_feedback')
        .update({ admin_last_read_at: nowIso })
        .eq('id', feedbackId);
    } else {
      await supabase.rpc('mark_app_feedback_user_read', { p_feedback_id: feedbackId });
    }

    const comment: AppFeedbackComment = {
      id: inserted.id as string,
      feedbackId: inserted.feedback_id as string,
      authorId: inserted.author_id as string,
      authorRole: inserted.author_role as AppFeedbackCommentAuthorRole,
      body: inserted.body as string,
      createdAt: inserted.created_at as string,
    };
    return NextResponse.json({ success: true, data: comment });
  } catch (error) {
    console.error('Comment POST API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
