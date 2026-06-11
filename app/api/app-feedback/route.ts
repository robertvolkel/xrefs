import { NextRequest, NextResponse } from 'next/server';
import {
  AppFeedbackCategory,
  AppFeedbackAttachment,
  AppFeedbackAttachmentView,
  AppFeedbackListItem,
  AppFeedbackStatus,
} from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createNotifications, getAdminRecipientIds } from '@/lib/services/notificationService';

const VALID_CATEGORIES: AppFeedbackCategory[] = ['idea', 'issue', 'other'];
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_ATTACHMENTS = 5;
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024;
const BUCKET = 'app-feedback-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    default: return 'bin';
  }
}

// ─────────────────────────────────────────────────────────────
// GET — list the signed-in user's own feedback submissions
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createClient();

    const { data: fbRows, error } = await supabase
      .from('app_feedback')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Own feedback list query error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch feedback' },
        { status: 500 },
      );
    }

    const rows = (fbRows ?? []) as Record<string, unknown>[];
    const feedbackIds = rows.map((r) => r.id as string);

    // Comment counts + latest admin-comment timestamp per thread
    const countByFeedback = new Map<string, number>();
    const latestAdminAtByFeedback = new Map<string, string>();
    if (feedbackIds.length > 0) {
      const { data: comments } = await supabase
        .from('app_feedback_comments')
        .select('feedback_id, author_role, created_at')
        .in('feedback_id', feedbackIds);
      for (const c of (comments ?? []) as Record<string, unknown>[]) {
        const fid = c.feedback_id as string;
        countByFeedback.set(fid, (countByFeedback.get(fid) ?? 0) + 1);
        if (c.author_role === 'admin') {
          const ts = c.created_at as string;
          const existing = latestAdminAtByFeedback.get(fid);
          if (!existing || ts > existing) latestAdminAtByFeedback.set(fid, ts);
        }
      }
    }

    const items: AppFeedbackListItem[] = await Promise.all(rows.map(async (row) => {
      const rawAttachments = (row.attachments as AppFeedbackAttachment[] | null) ?? [];
      const attachments: AppFeedbackAttachmentView[] = await Promise.all(
        rawAttachments.map(async (att) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.path, SIGNED_URL_TTL_SECONDS);
          return { ...att, signedUrl: signed?.signedUrl ?? '' };
        }),
      );
      const fid = row.id as string;
      const userLastReadAt = row.user_last_read_at as string | undefined;
      const latestAdminAt = latestAdminAtByFeedback.get(fid);
      const hasUnread = !!latestAdminAt && (!userLastReadAt || latestAdminAt > userLastReadAt);
      return {
        id: fid,
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
        userLastReadAt,
        adminLastReadAt: row.admin_last_read_at as string | undefined,
        attachments,
        commentCount: countByFeedback.get(fid) ?? 0,
        hasUnread,
      };
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error('Own feedback list API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST — submit new feedback (existing behavior, unchanged)
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const form = await request.formData();
    const category = String(form.get('category') ?? '') as AppFeedbackCategory;
    const userComment = String(form.get('userComment') ?? '').trim();
    const userAgent = (form.get('userAgent') as string | null)?.slice(0, 500) ?? null;
    const viewport = (form.get('viewport') as string | null)?.slice(0, 50) ?? null;

    if (!userComment) {
      return NextResponse.json({ success: false, error: 'Comment is required' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const rawFiles = form.getAll('attachments').filter((v): v is File => v instanceof File);
    if (rawFiles.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_ATTACHMENTS} attachments allowed` },
        { status: 400 },
      );
    }
    for (const f of rawFiles) {
      if (!ALLOWED_IMAGE_MIME.has(f.type)) {
        return NextResponse.json(
          { success: false, error: `Unsupported file type: ${f.type || 'unknown'}` },
          { status: 400 },
        );
      }
      if (f.size > MAX_BYTES_PER_FILE) {
        return NextResponse.json(
          { success: false, error: `File ${f.name} exceeds 10 MB limit` },
          { status: 400 },
        );
      }
    }

    const supabase = await createClient();
    const feedbackId = crypto.randomUUID();
    const uploaded: AppFeedbackAttachment[] = [];

    for (const file of rawFiles) {
      const objectId = crypto.randomUUID();
      const path = `${user!.id}/${feedbackId}/${objectId}.${extFromMime(file.type)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false });
      if (upErr) {
        if (uploaded.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploaded.map((a) => a.path));
        }
        console.error('Feedback attachment upload failed:', upErr.message);
        return NextResponse.json(
          { success: false, error: `Failed to upload attachment: ${upErr.message}` },
          { status: 500 },
        );
      }
      uploaded.push({ path, mimeType: file.type, sizeBytes: file.size });
    }

    const { data, error } = await supabase
      .from('app_feedback')
      .insert({
        id: feedbackId,
        user_id: user!.id,
        category,
        user_comment: userComment,
        user_agent: userAgent,
        viewport,
        attachments: uploaded,
      })
      .select('id')
      .single();

    if (error) {
      if (uploaded.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploaded.map((a) => a.path));
      }
      console.error('App feedback insert failed:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: `Failed to save feedback: ${error.message}` },
        { status: 500 },
      );
    }

    // Notify active admins about the new submission (fire-and-forget).
    void getAdminRecipientIds(user!.id)
      .then((adminIds) =>
        createNotifications(adminIds, {
          type: 'feedback_new',
          title: 'New feedback submitted',
          body: userComment.slice(0, 140),
          link: '/monitoring',
          data: { feedbackId: data.id },
          dedupeKey: `feedback_new:submit:${data.id}`,
        }),
      )
      .catch(() => {});

    return NextResponse.json({ success: true, data: { id: data.id } });
  } catch (error) {
    console.error('App feedback API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
