import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * Delete a single comment from a feedback thread. Only the comment's own
 * author can delete it (RLS policy "Authors delete own comments" enforces
 * `author_id = auth.uid()`); admins cannot delete a user's comment and
 * users cannot delete an admin's. Whole-thread deletion lives on the parent
 * DELETE /api/app-feedback/[feedbackId] route.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string; commentId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { feedbackId, commentId } = await params;
    const supabase = await createClient();

    // Delete our own comment only. Scope by author_id AND feedback_id so a
    // mis-routed id can't touch another thread. `.select()` is load-bearing:
    // a delete against a row RLS won't let us touch returns no error and an
    // empty set (see the "silent update under RLS" trap), so we must inspect
    // the returned rows to tell "deleted" from "not yours / not found".
    const { data: deleted, error: delErr } = await supabase
      .from('app_feedback_comments')
      .delete()
      .eq('id', commentId)
      .eq('feedback_id', feedbackId)
      .eq('author_id', user!.id)
      .select('id');

    if (delErr) {
      console.error('Comment delete failed:', delErr.message, delErr.code);
      return NextResponse.json(
        { success: false, error: `Failed to delete comment: ${delErr.message}` },
        { status: 500 },
      );
    }

    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Comment not found or not yours to delete' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Comment DELETE API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
