import { NextRequest, NextResponse } from 'next/server';
import {
  AppFeedbackAttachment,
  AppFeedbackAttachmentView,
  AppFeedbackCategory,
  AppFeedbackComment,
  AppFeedbackCommentAuthorRole,
  AppFeedbackListItem,
  AppFeedbackStatus,
  AppFeedbackThread,
} from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'app-feedback-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { feedbackId } = await params;
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from('app_feedback')
      .select('*')
      .eq('id', feedbackId)
      .eq('user_id', user!.id)
      .maybeSingle();

    if (error) {
      console.error('Own feedback thread fetch error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch feedback' },
        { status: 500 },
      );
    }
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'Not found' },
        { status: 404 },
      );
    }

    const { data: commentRows } = await supabase
      .from('app_feedback_comments')
      .select('id, feedback_id, author_id, author_role, body, created_at')
      .eq('feedback_id', feedbackId)
      .order('created_at', { ascending: true });

    const comments: AppFeedbackComment[] = ((commentRows ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      feedbackId: c.feedback_id as string,
      authorId: c.author_id as string,
      authorRole: c.author_role as AppFeedbackCommentAuthorRole,
      body: c.body as string,
      createdAt: c.created_at as string,
    }));

    // Stamp read timestamp via SECURITY DEFINER RPC. A raw UPDATE would be
    // blocked by RLS — only admins have an UPDATE policy on app_feedback.
    const { data: rpcReadAt } = await supabase.rpc('mark_app_feedback_user_read', {
      p_feedback_id: feedbackId,
    });
    const readAt = (rpcReadAt as string | null) ?? new Date().toISOString();

    const rawAttachments = (row.attachments as AppFeedbackAttachment[] | null) ?? [];
    const attachments: AppFeedbackAttachmentView[] = await Promise.all(
      rawAttachments.map(async (att) => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(att.path, SIGNED_URL_TTL_SECONDS);
        return { ...att, signedUrl: signed?.signedUrl ?? '' };
      }),
    );

    const feedback: AppFeedbackListItem = {
      id: row.id as string,
      userId: row.user_id as string,
      category: row.category as AppFeedbackCategory,
      userComment: row.user_comment as string,
      userAgent: row.user_agent as string | undefined,
      viewport: row.viewport as string | undefined,
      status: row.status as AppFeedbackStatus,
      resolvedBy: row.resolved_by as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      userLastReadAt: readAt,
      adminLastReadAt: row.admin_last_read_at as string | undefined,
      attachments,
      commentCount: comments.length,
      hasUnread: false,
    };

    const data: AppFeedbackThread = { feedback, comments };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Own feedback thread API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE — wipe out the entire thread (the original submission, all
// comments via ON DELETE CASCADE, and the attachment objects in
// Storage). RLS allows the owning user OR any admin. Either side can
// call this; it's the same endpoint.
// ─────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const { feedbackId } = await params;
    const supabase = await createClient();

    // Fetch the attachments list BEFORE deleting the row — otherwise
    // we lose the storage paths and orphan the files.
    const { data: row, error: fetchErr } = await supabase
      .from('app_feedback')
      .select('id, attachments')
      .eq('id', feedbackId)
      .maybeSingle();

    if (fetchErr) {
      console.error('Pre-delete fetch error:', fetchErr.message);
      return NextResponse.json(
        { success: false, error: 'Failed to load feedback for deletion' },
        { status: 500 },
      );
    }
    // Not found (or RLS hid it) → behave like a no-op success so the
    // client can drop it locally either way.
    if (!row) {
      return NextResponse.json({ success: true });
    }

    const attachments = (row.attachments as AppFeedbackAttachment[] | null) ?? [];
    const paths = attachments.map((a) => a.path).filter((p): p is string => !!p);

    // Best-effort storage cleanup. If this fails (e.g. transient storage
    // error) we still want the DB row + comments gone — the bucket can
    // be reconciled later by a sweep.
    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (storageErr) {
        console.error('Feedback attachment delete failed:', storageErr.message, paths);
      }
    }

    const { error: deleteErr } = await supabase
      .from('app_feedback')
      .delete()
      .eq('id', feedbackId);

    if (deleteErr) {
      console.error('App feedback delete failed:', deleteErr.message, deleteErr.code);
      return NextResponse.json(
        { success: false, error: `Failed to delete feedback: ${deleteErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback DELETE API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
