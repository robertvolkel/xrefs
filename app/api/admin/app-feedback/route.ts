import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { AppFeedbackListItem, AppFeedbackStatusCounts, AppFeedbackStatus, AppFeedbackCategory, AppFeedbackAttachment, AppFeedbackAttachmentView } from '@/lib/types';

const BUCKET = 'app-feedback-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as AppFeedbackStatus | null;
    const category = searchParams.get('category') as AppFeedbackCategory | null;
    const search = searchParams.get('search')?.trim();
    const sortBy = searchParams.get('sort_by') ?? 'created_at';
    const sortDir = searchParams.get('sort_dir') ?? 'desc';
    const page = parseInt(searchParams.get('page') ?? '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const offset = page * limit;

    const supabase = await createClient();

    // Pre-query profiles for user name/email matches when searching
    let searchUserIds: string[] | undefined;
    if (search) {
      const { data: matchingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
      if (matchingProfiles && matchingProfiles.length > 0) {
        searchUserIds = matchingProfiles.map((p: Record<string, unknown>) => p.id as string);
      }
    }

    const isActivitySort = sortBy === 'activity';

    let query = supabase
      .from('app_feedback')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }
    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      const columnFilter = `user_comment.ilike.%${search}%`;
      if (searchUserIds && searchUserIds.length > 0) {
        query = query.or(`${columnFilter},user_id.in.(${searchUserIds.join(',')})`);
      } else {
        query = query.or(columnFilter);
      }
    }

    if (isActivitySort) {
      // Server-side activity sort needs hasUnread per row, which is computed
      // from the comments table. Fetch the whole filtered set, sort in JS,
      // then slice to the requested page.
      query = query.order('created_at', { ascending: false });
    } else {
      const allowedSorts = ['created_at', 'status', 'category'];
      const column = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
      query = query
        .order(column, { ascending: sortDir === 'asc' })
        .range(offset, offset + limit - 1);
    }

    const { data: fbRows, count, error } = await query;

    if (error) {
      console.error('App feedback list query error:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: `Failed to fetch feedback: ${error.message}` },
        { status: 500 },
      );
    }

    // Enrich with profiles (submitter + resolver)
    const userIds = new Set<string>();
    for (const r of fbRows ?? []) {
      userIds.add(r.user_id as string);
      if (r.resolved_by) userIds.add(r.resolved_by as string);
    }

    const profileMap = new Map<string, { email?: string; full_name?: string }>();
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', [...userIds]);

      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.id as string, { email: p.email, full_name: p.full_name });
        }
      }
    }

    // Comment counts + latest user-authored comment timestamp per thread.
    // For activity sort we need this over the full filtered set so the slice
    // is correct; for other sorts only the current page's IDs are needed.
    const fbIdList = (fbRows ?? []).map((r: Record<string, unknown>) => r.id as string);
    const countByFeedback = new Map<string, number>();
    const latestUserAtByFeedback = new Map<string, string>();
    if (fbIdList.length > 0) {
      const { data: commentRows } = await supabase
        .from('app_feedback_comments')
        .select('feedback_id, author_role, created_at')
        .in('feedback_id', fbIdList);
      for (const c of (commentRows ?? []) as Record<string, unknown>[]) {
        const fid = c.feedback_id as string;
        countByFeedback.set(fid, (countByFeedback.get(fid) ?? 0) + 1);
        if (c.author_role === 'user') {
          const ts = c.created_at as string;
          const existing = latestUserAtByFeedback.get(fid);
          if (!existing || ts > existing) latestUserAtByFeedback.set(fid, ts);
        }
      }
    }

    // Activity sort: reorder fbRows by (hasUnread desc, created_at desc), then
    // slice to the requested page so the post-enrichment loop only generates
    // signed URLs for visible rows.
    let pagedRows = fbRows ?? [];
    if (isActivitySort) {
      pagedRows = [...(fbRows ?? [])].sort((a, b) => {
        const aFid = a.id as string;
        const bFid = b.id as string;
        const aAdminRead = a.admin_last_read_at as string | undefined;
        const bAdminRead = b.admin_last_read_at as string | undefined;
        const aLatestUser = latestUserAtByFeedback.get(aFid);
        const bLatestUser = latestUserAtByFeedback.get(bFid);
        const aUnread = !!aLatestUser && (!aAdminRead || aLatestUser > aAdminRead);
        const bUnread = !!bLatestUser && (!bAdminRead || bLatestUser > bAdminRead);
        if (aUnread !== bUnread) return aUnread ? -1 : 1;
        return (a.created_at as string) < (b.created_at as string) ? 1 : -1;
      }).slice(offset, offset + limit);
    }

    const items: AppFeedbackListItem[] = await Promise.all(pagedRows.map(async (row: Record<string, unknown>) => {
      const profile = profileMap.get(row.user_id as string);
      const resolvedByProfile = row.resolved_by ? profileMap.get(row.resolved_by as string) : undefined;
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
      const adminLastReadAt = row.admin_last_read_at as string | undefined;
      const latestUserAt = latestUserAtByFeedback.get(fid);
      const hasUnread = !!latestUserAt && (!adminLastReadAt || latestUserAt > adminLastReadAt);
      return {
        id: fid,
        userId: row.user_id as string,
        category: row.category as AppFeedbackCategory,
        userComment: row.user_comment as string,
        userAgent: row.user_agent as string | undefined,
        viewport: row.viewport as string | undefined,
        status: row.status as AppFeedbackStatus,
        adminNotes: row.admin_notes as string | undefined,
        resolvedBy: row.resolved_by as string | undefined,
        resolvedAt: row.resolved_at as string | undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        userLastReadAt: row.user_last_read_at as string | undefined,
        adminLastReadAt,
        userEmail: profile?.email,
        userName: profile?.full_name,
        resolvedByName: resolvedByProfile?.full_name,
        attachments,
        commentCount: countByFeedback.get(fid) ?? 0,
        hasUnread,
      };
    }));

    // Status counts (unfiltered by status, filtered by category if set)
    const statusCounts: AppFeedbackStatusCounts = { open: 0, reviewed: 0, wip: 0, resolved: 0, dismissed: 0 };
    let countQuery = supabase.from('app_feedback').select('status');
    if (category) {
      countQuery = countQuery.eq('category', category);
    }
    const { data: allStatuses } = await countQuery;
    if (allStatuses) {
      for (const r of allStatuses) {
        const s = r.status as AppFeedbackStatus;
        if (s in statusCounts) {
          statusCounts[s]++;
        }
      }
    }

    // Needs-attention count (unfiltered) — drives the Monitoring sidebar dot
    // and the App Feedback nav-section dot. "Needs attention" = unread user
    // reply OR feedback the admin has never opened (admin_last_read_at IS NULL
    // AND status='open'). Does NOT include resolved/dismissed/already-read
    // open rows.
    let needsAttentionCount = 0;
    const { data: allFeedbackForAttention } = await supabase
      .from('app_feedback')
      .select('id, status, admin_last_read_at');
    if (allFeedbackForAttention && allFeedbackForAttention.length > 0) {
      const attentionIds = allFeedbackForAttention.map((r: Record<string, unknown>) => r.id as string);
      const { data: allUserComments } = await supabase
        .from('app_feedback_comments')
        .select('feedback_id, created_at')
        .eq('author_role', 'user')
        .in('feedback_id', attentionIds);
      const latestUserAtMap = new Map<string, string>();
      for (const c of (allUserComments ?? []) as Record<string, unknown>[]) {
        const fid = c.feedback_id as string;
        const ts = c.created_at as string;
        const existing = latestUserAtMap.get(fid);
        if (!existing || ts > existing) latestUserAtMap.set(fid, ts);
      }
      for (const r of allFeedbackForAttention as Record<string, unknown>[]) {
        const rStatus = r.status as AppFeedbackStatus;
        const rAdminReadAt = r.admin_last_read_at as string | undefined;
        const rLatestUserAt = latestUserAtMap.get(r.id as string);
        const rHasUnread = !!rLatestUserAt && (!rAdminReadAt || rLatestUserAt > rAdminReadAt);
        const rIsNew = !rAdminReadAt && rStatus === 'open';
        if (rHasUnread || rIsNew) needsAttentionCount++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { items, total: count ?? 0, statusCounts, needsAttentionCount },
    });
  } catch (error) {
    console.error('App feedback list API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
