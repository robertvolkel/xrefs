import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { QcFeedbackListItem, FeedbackStatusCounts, FeedbackStatus } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as FeedbackStatus | null;
    const stage = searchParams.get('stage');
    const search = searchParams.get('search')?.trim();
    const sortBy = searchParams.get('sort_by') ?? 'created_at';
    const sortDir = searchParams.get('sort_dir') ?? 'desc';
    const page = parseInt(searchParams.get('page') ?? '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const offset = page * limit;

    const supabase = await createClient();

    // If searching, pre-query profiles for user name/email matches
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

    // Build main query on qc_feedback
    let query = supabase
      .from('qc_feedback')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }
    if (stage) {
      query = query.eq('feedback_stage', stage);
    }

    // Search across feedback columns + user IDs from profile pre-query
    if (search) {
      const columnFilter = `source_mpn.ilike.%${search}%,replacement_mpn.ilike.%${search}%,rule_attribute_name.ilike.%${search}%,user_comment.ilike.%${search}%`;
      if (searchUserIds && searchUserIds.length > 0) {
        query = query.or(`${columnFilter},user_id.in.(${searchUserIds.join(',')})`);
      } else {
        query = query.or(columnFilter);
      }
    }

    // Dynamic sort with whitelist
    const allowedSorts = ['created_at', 'source_mpn', 'status', 'feedback_stage'];
    const column = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    query = query
      .order(column, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: fbRows, count, error } = await query;

    if (error) {
      console.error('Feedback list query error:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: `Failed to fetch feedback: ${error.message}` },
        { status: 500 },
      );
    }

    // Enrich with profiles
    const userIds = [...new Set((fbRows ?? []).map((r: Record<string, unknown>) => r.user_id as string))];
    const profileMap = new Map<string, { email?: string; full_name?: string }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.id as string, { email: p.email, full_name: p.full_name });
        }
      }
    }

    // Enrich with family_name from recommendation_log (via log_id)
    const logIds = [...new Set((fbRows ?? []).filter((r: Record<string, unknown>) => r.log_id).map((r: Record<string, unknown>) => r.log_id as string))];
    const logMap = new Map<string, string>();

    if (logIds.length > 0) {
      const { data: logRows } = await supabase
        .from('recommendation_log')
        .select('id, family_name')
        .in('id', logIds);

      if (logRows) {
        for (const l of logRows) {
          if (l.family_name) {
            logMap.set(l.id as string, l.family_name as string);
          }
        }
      }
    }

    // Map to QcFeedbackListItem[]
    const items: QcFeedbackListItem[] = (fbRows ?? []).map((row: Record<string, unknown>) => {
      const profile = profileMap.get(row.user_id as string);
      return {
        id: row.id as string,
        logId: row.log_id as string | undefined,
        userId: row.user_id as string,
        feedbackStage: row.feedback_stage as QcFeedbackListItem['feedbackStage'],
        status: row.status as FeedbackStatus,
        sourceMpn: row.source_mpn as string,
        sourceManufacturer: row.source_manufacturer as string | undefined,
        replacementMpn: row.replacement_mpn as string | undefined,
        ruleAttributeId: row.rule_attribute_id as string | undefined,
        ruleAttributeName: row.rule_attribute_name as string | undefined,
        ruleResult: row.rule_result as string | undefined,
        sourceValue: row.source_value as string | undefined,
        replacementValue: row.replacement_value as string | undefined,
        ruleNote: row.rule_note as string | undefined,
        questionId: row.question_id as string | undefined,
        questionText: row.question_text as string | undefined,
        userComment: row.user_comment as string,
        adminNotes: row.admin_notes as string | undefined,
        resolvedBy: row.resolved_by as string | undefined,
        resolvedAt: row.resolved_at as string | undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        userEmail: profile?.email,
        userName: profile?.full_name,
        familyName: row.log_id ? logMap.get(row.log_id as string) : undefined,
      };
    });

    // Status counts (unfiltered by status, filtered by stage if set)
    const statusCounts: FeedbackStatusCounts = { open: 0, reviewed: 0, resolved: 0, dismissed: 0 };
    let countQuery = supabase.from('qc_feedback').select('status');
    if (stage) {
      countQuery = countQuery.eq('feedback_stage', stage);
    }
    const { data: allStatuses } = await countQuery;
    if (allStatuses) {
      for (const r of allStatuses) {
        const s = r.status as FeedbackStatus;
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
    console.error('Feedback list API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
