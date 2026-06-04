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
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'app-feedback-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { feedbackId } = await params;
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from('app_feedback')
      .select('*')
      .eq('id', feedbackId)
      .maybeSingle();

    if (error) {
      console.error('Admin feedback thread fetch error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch feedback' },
        { status: 500 },
      );
    }
    if (!row) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const { data: commentRows } = await supabase
      .from('app_feedback_comments')
      .select('id, feedback_id, author_id, author_role, body, created_at')
      .eq('feedback_id', feedbackId)
      .order('created_at', { ascending: true });

    // Profile lookup for both submitter and comment authors.
    const authorIds = new Set<string>();
    authorIds.add(row.user_id as string);
    if (row.resolved_by) authorIds.add(row.resolved_by as string);
    for (const c of (commentRows ?? []) as Record<string, unknown>[]) {
      authorIds.add(c.author_id as string);
    }
    const profileMap = new Map<string, { email?: string; full_name?: string }>();
    if (authorIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', [...authorIds]);
      for (const p of (profiles ?? []) as Record<string, unknown>[]) {
        profileMap.set(p.id as string, {
          email: p.email as string | undefined,
          full_name: p.full_name as string | undefined,
        });
      }
    }

    const comments: AppFeedbackComment[] = ((commentRows ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      feedbackId: c.feedback_id as string,
      authorId: c.author_id as string,
      authorRole: c.author_role as AppFeedbackCommentAuthorRole,
      body: c.body as string,
      createdAt: c.created_at as string,
      authorName: profileMap.get(c.author_id as string)?.full_name,
    }));

    // Stamp admin read timestamp.
    const readAt = new Date().toISOString();
    await supabase
      .from('app_feedback')
      .update({ admin_last_read_at: readAt })
      .eq('id', feedbackId);

    const rawAttachments = (row.attachments as AppFeedbackAttachment[] | null) ?? [];
    const attachments: AppFeedbackAttachmentView[] = await Promise.all(
      rawAttachments.map(async (att) => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(att.path, SIGNED_URL_TTL_SECONDS);
        return { ...att, signedUrl: signed?.signedUrl ?? '' };
      }),
    );

    const submitter = profileMap.get(row.user_id as string);
    const resolver = row.resolved_by ? profileMap.get(row.resolved_by as string) : undefined;

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
      userLastReadAt: row.user_last_read_at as string | undefined,
      adminLastReadAt: readAt,
      userEmail: submitter?.email,
      userName: submitter?.full_name,
      resolvedByName: resolver?.full_name,
      attachments,
      commentCount: comments.length,
      hasUnread: false,
    };

    const data: AppFeedbackThread = { feedback, comments };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Admin feedback thread API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
