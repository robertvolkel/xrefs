import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { RecommendationLogEntry, FeedbackStatus } from '@/lib/types';
import { resolveManufacturerAlias } from '@/lib/services/manufacturerAliasResolver';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const requestSource = searchParams.get('request_source');
    const familyId = searchParams.get('family_id');
    const userId = searchParams.get('user_id');
    const hasFeedback = searchParams.get('has_feedback');
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

    // Build query — no FK join with profiles (FK points to auth.users, not profiles)
    let query = supabase
      .from('recommendation_log')
      .select('*', { count: 'exact' });

    if (requestSource) {
      query = query.eq('request_source', requestSource);
    }
    if (familyId) {
      query = query.eq('family_id', familyId);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }

    // Search: match columns OR user IDs from profile pre-query
    if (search) {
      const columnFilter = `source_mpn.ilike.%${search}%,family_name.ilike.%${search}%,data_source.ilike.%${search}%`;
      if (searchUserIds && searchUserIds.length > 0) {
        query = query.or(`${columnFilter},user_id.in.(${searchUserIds.join(',')})`);
      } else {
        query = query.or(columnFilter);
      }
    }

    // Dynamic sort with whitelist
    const allowedSorts = ['created_at', 'source_mpn', 'source_manufacturer', 'family_name', 'recommendation_count', 'request_source', 'data_source'];
    const column = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    query = query
      .order(column, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      console.error('QC log query error:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: `Failed to fetch logs: ${error.message}` },
        { status: 500 },
      );
    }

    // Get unique user IDs and fetch profiles separately
    const userIds = [...new Set((logs ?? []).map((l: Record<string, unknown>) => l.user_id as string))];
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

    // Get feedback counts and statuses per log entry
    const logIds = (logs ?? []).map((l: Record<string, unknown>) => l.id as string);
    const feedbackCounts = new Map<string, number>();
    const feedbackStatuses = new Map<string, FeedbackStatus>();

    // Priority: open > reviewed > resolved > dismissed (show the "worst" status)
    const statusPriority: Record<string, number> = { open: 0, reviewed: 1, resolved: 2, dismissed: 3 };

    if (logIds.length > 0) {
      const { data: fbData } = await supabase
        .from('qc_feedback')
        .select('log_id, status')
        .in('log_id', logIds);

      if (fbData) {
        for (const fb of fbData) {
          const id = fb.log_id as string;
          const status = fb.status as FeedbackStatus;
          feedbackCounts.set(id, (feedbackCounts.get(id) ?? 0) + 1);

          const current = feedbackStatuses.get(id);
          if (!current || statusPriority[status] < statusPriority[current]) {
            feedbackStatuses.set(id, status);
          }
        }
      }
    }

    // Resolve Chinese (atlas) vs Western origin per unique source manufacturer name.
    // Mirrors getRecommendations()'s per-MFR mfrOrigin resolution (Decision #161);
    // the alias resolver is cached (5-min L1 + L2), so this is cheap for a page of rows.
    const mfrOriginMap = new Map<string, 'atlas' | 'western'>();
    const uniqueMfrNames = [
      ...new Set(
        (logs ?? [])
          .map((l: Record<string, unknown>) => (l.source_manufacturer as string | undefined)?.trim())
          .filter((n): n is string => !!n),
      ),
    ];
    await Promise.all(
      uniqueMfrNames.map(async (name) => {
        try {
          const match = await resolveManufacturerAlias(name);
          if (match?.source === 'atlas' || match?.source === 'western') {
            mfrOriginMap.set(name.toLowerCase(), match.source);
          }
        } catch {
          // Origin lookup is best-effort — a failure just means no flag,
          // never a broken logs page.
        }
      }),
    );

    // Map to typed entries
    const items: RecommendationLogEntry[] = (logs ?? []).map((row: Record<string, unknown>) => {
      const profile = profileMap.get(row.user_id as string);
      const fbCount = feedbackCounts.get(row.id as string) ?? 0;
      const mfrName = (row.source_manufacturer as string | undefined)?.trim();
      return {
        id: row.id as string,
        userId: row.user_id as string,
        sourceMpn: row.source_mpn as string,
        sourceManufacturer: row.source_manufacturer as string | undefined,
        sourceMfrOrigin: mfrName ? mfrOriginMap.get(mfrName.toLowerCase()) : undefined,
        familyId: row.family_id as string | undefined,
        familyName: row.family_name as string | undefined,
        recommendationCount: row.recommendation_count as number,
        requestSource: row.request_source as RecommendationLogEntry['requestSource'],
        dataSource: row.data_source as string | undefined,
        snapshot: row.snapshot as RecommendationLogEntry['snapshot'],
        feedbackCount: fbCount,
        feedbackStatus: feedbackStatuses.get(row.id as string),
        createdAt: row.created_at as string,
        userEmail: profile?.email,
        userName: profile?.full_name,
      };
    });

    // Filter by has_feedback on the server side after counting
    let filteredItems = items;
    if (hasFeedback === 'true') {
      filteredItems = items.filter(i => (i.feedbackCount ?? 0) > 0);
    }

    return NextResponse.json({
      success: true,
      data: { items: filteredItems, total: count ?? 0 },
    });
  } catch (error) {
    console.error('QC log API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
