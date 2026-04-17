import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { AppFeedbackListItem, AppFeedbackStatusCounts, AppFeedbackStatus, AppFeedbackCategory } from '@/lib/types';

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

    const allowedSorts = ['created_at', 'status', 'category'];
    const column = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    query = query
      .order(column, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

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

    const items: AppFeedbackListItem[] = (fbRows ?? []).map((row: Record<string, unknown>) => {
      const profile = profileMap.get(row.user_id as string);
      const resolvedByProfile = row.resolved_by ? profileMap.get(row.resolved_by as string) : undefined;
      return {
        id: row.id as string,
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
        userEmail: profile?.email,
        userName: profile?.full_name,
        resolvedByName: resolvedByProfile?.full_name,
      };
    });

    // Status counts (unfiltered by status, filtered by category if set)
    const statusCounts: AppFeedbackStatusCounts = { open: 0, reviewed: 0, resolved: 0, dismissed: 0 };
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

    return NextResponse.json({
      success: true,
      data: { items, total: count ?? 0, statusCounts },
    });
  } catch (error) {
    console.error('App feedback list API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
