import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { RecommendationLogEntry, FeedbackStatus, XrefRecommendation } from '@/lib/types';

/** RFC 4180 CSV field escaping */
function csvEscape(value: string | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_COLUMNS = [
  'id', 'created_at', 'user_email', 'user_name',
  'source_mpn', 'source_manufacturer', 'family_id', 'family_name',
  'recommendation_count', 'request_source', 'data_source',
  'feedback_count', 'feedback_status',
  'rec_1_mpn', 'rec_1_match_pct',
  'rec_2_mpn', 'rec_2_match_pct',
  'rec_3_mpn', 'rec_3_match_pct',
];

function flattenToCSVRow(item: RecommendationLogEntry): string {
  const recs = (item.snapshot?.recommendations ?? []) as XrefRecommendation[];
  const values = [
    item.id,
    item.createdAt,
    item.userEmail,
    item.userName,
    item.sourceMpn,
    item.sourceManufacturer,
    item.familyId,
    item.familyName,
    String(item.recommendationCount),
    item.requestSource,
    item.dataSource,
    String(item.feedbackCount ?? 0),
    item.feedbackStatus ?? '',
    recs[0]?.part?.mpn ?? '',
    recs[0]?.matchPercentage != null ? String(recs[0].matchPercentage) : '',
    recs[1]?.part?.mpn ?? '',
    recs[1]?.matchPercentage != null ? String(recs[1].matchPercentage) : '',
    recs[2]?.part?.mpn ?? '',
    recs[2]?.matchPercentage != null ? String(recs[2].matchPercentage) : '',
  ];
  return values.map(csvEscape).join(',');
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') ?? 'csv';
    const requestSource = searchParams.get('request_source');
    const familyId = searchParams.get('family_id');
    const hasFeedback = searchParams.get('has_feedback');
    const search = searchParams.get('search')?.trim();
    const sortBy = searchParams.get('sort_by') ?? 'created_at';
    const sortDir = searchParams.get('sort_dir') ?? 'desc';

    const supabase = await createClient();

    // Pre-query profiles for search
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

    // Build query — no pagination, cap at 10000
    let query = supabase
      .from('recommendation_log')
      .select('*');

    if (requestSource) query = query.eq('request_source', requestSource);
    if (familyId) query = query.eq('family_id', familyId);

    if (search) {
      const columnFilter = `source_mpn.ilike.%${search}%,family_name.ilike.%${search}%,data_source.ilike.%${search}%`;
      if (searchUserIds && searchUserIds.length > 0) {
        query = query.or(`${columnFilter},user_id.in.(${searchUserIds.join(',')})`);
      } else {
        query = query.or(columnFilter);
      }
    }

    const allowedSorts = ['created_at', 'source_mpn', 'family_name', 'recommendation_count', 'request_source', 'data_source'];
    const column = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    query = query
      .order(column, { ascending: sortDir === 'asc' })
      .limit(10000);

    const { data: logs, error } = await query;

    if (error) {
      console.error('Export query error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Enrich with profiles
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

    // Feedback counts
    const logIds = (logs ?? []).map((l: Record<string, unknown>) => l.id as string);
    const feedbackCounts = new Map<string, number>();
    const feedbackStatuses = new Map<string, FeedbackStatus>();
    const statusPriority: Record<string, number> = { open: 0, reviewed: 1, resolved: 2, dismissed: 3 };

    if (logIds.length > 0) {
      // Supabase .in() has a limit; batch in chunks of 500
      for (let i = 0; i < logIds.length; i += 500) {
        const batch = logIds.slice(i, i + 500);
        const { data: fbData } = await supabase
          .from('qc_feedback')
          .select('log_id, status')
          .in('log_id', batch);
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
    }

    // Map to typed entries
    const items: RecommendationLogEntry[] = (logs ?? []).map((row: Record<string, unknown>) => {
      const profile = profileMap.get(row.user_id as string);
      return {
        id: row.id as string,
        userId: row.user_id as string,
        sourceMpn: row.source_mpn as string,
        sourceManufacturer: row.source_manufacturer as string | undefined,
        familyId: row.family_id as string | undefined,
        familyName: row.family_name as string | undefined,
        recommendationCount: row.recommendation_count as number,
        requestSource: row.request_source as RecommendationLogEntry['requestSource'],
        dataSource: row.data_source as string | undefined,
        snapshot: row.snapshot as RecommendationLogEntry['snapshot'],
        feedbackCount: feedbackCounts.get(row.id as string) ?? 0,
        feedbackStatus: feedbackStatuses.get(row.id as string),
        createdAt: row.created_at as string,
        userEmail: profile?.email,
        userName: profile?.full_name,
      };
    });

    // Apply has_feedback filter
    const filtered = hasFeedback === 'true'
      ? items.filter(i => (i.feedbackCount ?? 0) > 0)
      : items;

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      return new Response(JSON.stringify(filtered, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="qc-logs-${timestamp}.json"`,
        },
      });
    }

    // CSV streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    (async () => {
      try {
        await writer.write(encoder.encode(CSV_COLUMNS.join(',') + '\n'));
        for (const item of filtered) {
          await writer.write(encoder.encode(flattenToCSVRow(item) + '\n'));
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="qc-logs-${timestamp}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
