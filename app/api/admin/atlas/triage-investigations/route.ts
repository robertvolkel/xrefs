/**
 * GET /api/admin/atlas/triage-investigations
 *
 * Lists rows from atlas_triage_investigations for the admin log page.
 * Supports filters: bucket, action_taken, param_name (substring),
 * scope_kind, scope_key, ran_by, since (ISO date). Default sort is
 * ran_at DESC. Paginated by `limit` (default 50, max 500) + `offset`.
 *
 * Service-role read — requireAdmin gates upstream. Returns the raw
 * JSONB plus resolved admin display name for ran_by so the UI doesn't
 * have to join client-side.
 *
 * POST /api/admin/atlas/triage-investigations
 *
 * Decision-time logging: writes ONE complete audit row when the engineer
 * actually decides something (Accept / Confirm Wrong Family / Mark
 * Unmappable). The Investigate click itself does NOT log — otherwise
 * an engineer iterating on a tricky param creates N orphan "Pending"
 * rows that never resolve. Caller passes the cached DeepAnalysis from
 * client state along with the action taken.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';

const VALID_BUCKETS = new Set([
  'new_canonical',
  'disambiguation',
  'wrong_family',
  'unit_mismatch',
  'unscoped_products',
  'unmappable',
]);
const VALID_ACTIONS = new Set([
  'override_created',
  'flagged_wrong_family',
  'marked_unmappable',
  'dismissed',
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), 500);
    const offset = Math.max(parseInt(sp.get('offset') ?? '0', 10) || 0, 0);
    const bucket = sp.get('bucket');
    const action = sp.get('action');
    const paramName = sp.get('param_name');
    const scopeKind = sp.get('scope_kind');
    const scopeKey = sp.get('scope_key');
    const ranBy = sp.get('ran_by');
    const since = sp.get('since');
    const pendingOnly = sp.get('pending_only') === '1';

    const supabase = createServiceClient();
    let query = supabase
      .from('atlas_triage_investigations')
      .select(
        'id, param_name, scope_kind, scope_key, bucket, confidence, summary, prose, primary_action_label, raw_response, action_taken, action_at, resulting_override_id, reverted_at, reverted_by, ran_by, ran_at',
        { count: 'exact' },
      )
      .order('ran_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (bucket && VALID_BUCKETS.has(bucket)) query = query.eq('bucket', bucket);
    if (action && VALID_ACTIONS.has(action)) query = query.eq('action_taken', action);
    if (paramName) query = query.ilike('param_name', `%${paramName}%`);
    if (scopeKind) query = query.eq('scope_kind', scopeKind);
    if (scopeKey) query = query.eq('scope_key', scopeKey);
    if (ranBy) query = query.eq('ran_by', ranBy);
    if (since) query = query.gte('ran_at', since);
    if (pendingOnly) query = query.is('action_taken', null);
    if (sp.get('reverted_only') === '1') query = query.not('reverted_at', 'is', null);

    const { data, error, count } = await query;
    if (error) {
      console.error('triage-investigations GET failed:', error);
      return NextResponse.json(
        { success: false, error: 'Database error', detail: error.message },
        { status: 500 },
      );
    }

    // Resolve admin display names so the UI shows "Robert Volkel" instead
    // of a raw UUID. Includes both ran_by AND reverted_by — the latter is
    // null for never-reverted rows but we resolve everyone together.
    const userIds = [
      ...new Set([
        ...(data ?? []).map((r) => r.ran_by as string),
        ...(data ?? []).map((r) => r.reverted_by as string | null).filter((v): v is string => !!v),
      ]),
    ];
    const adminNames = await resolveAdminNames(userIds);

    const items = (data ?? []).map((r) => ({
      id: r.id,
      paramName: r.param_name,
      scopeKind: r.scope_kind,
      scopeKey: r.scope_key,
      bucket: r.bucket,
      confidence: r.confidence,
      summary: r.summary,
      prose: r.prose,
      primaryActionLabel: r.primary_action_label,
      rawResponse: r.raw_response,
      actionTaken: r.action_taken,
      actionAt: r.action_at,
      resultingOverrideId: r.resulting_override_id,
      revertedAt: r.reverted_at,
      revertedBy: r.reverted_by,
      revertedByName: r.reverted_by ? (adminNames.get(r.reverted_by as string) ?? 'Unknown') : null,
      ranBy: r.ran_by,
      ranByName: adminNames.get(r.ran_by as string) ?? 'Unknown',
      ranAt: r.ran_at,
    }));

    return NextResponse.json({ success: true, items, total: count ?? items.length, limit, offset });
  } catch (err) {
    console.error('triage-investigations GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

const VALID_SCOPE_KINDS = new Set(['family', 'category', 'none']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const paramName = body?.paramName as string | undefined;
    const scopeKind = body?.scopeKind as string | undefined;
    const scopeKey = (body?.scopeKey as string | null | undefined) ?? null;
    const analysis = body?.analysis as Record<string, unknown> | undefined;
    const actionTaken = body?.actionTaken as string | undefined;
    const resultingOverrideId = (body?.resultingOverrideId as string | undefined) ?? null;

    if (!paramName || !analysis || !actionTaken) {
      return NextResponse.json(
        { success: false, error: 'paramName, analysis, and actionTaken are required' },
        { status: 400 },
      );
    }
    if (!VALID_ACTIONS.has(actionTaken)) {
      return NextResponse.json(
        { success: false, error: `Invalid actionTaken: ${actionTaken}` },
        { status: 400 },
      );
    }
    if (scopeKind && !VALID_SCOPE_KINDS.has(scopeKind)) {
      return NextResponse.json(
        { success: false, error: `Invalid scopeKind: ${scopeKind}` },
        { status: 400 },
      );
    }

    const recommendation = (analysis.recommendation as Record<string, unknown> | undefined) ?? undefined;
    const insertRow = {
      param_name: paramName,
      scope_kind: scopeKind ?? 'none',
      scope_key: scopeKey,
      bucket: (analysis.bucket as string) ?? 'unmappable',
      confidence: (analysis.confidence as string) ?? 'low',
      summary: (recommendation?.summary as string | undefined) ?? null,
      prose: (analysis.prose as string | undefined) ?? null,
      primary_action_label: (recommendation?.primaryActionLabel as string | undefined) ?? null,
      raw_response: analysis,
      ran_by: user!.id,
      // ran_at defaults to now() in the schema; we set action_taken/action_at
      // explicitly because this row is born with a decision attached.
      action_taken: actionTaken,
      action_at: new Date().toISOString(),
      resulting_override_id: resultingOverrideId,
    };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_triage_investigations')
      .insert(insertRow)
      .select('id')
      .single();

    if (error) {
      console.error('triage-investigations POST insert failed:', error);
      return NextResponse.json(
        { success: false, error: 'Database error', detail: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('triage-investigations POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
