/**
 * GET /api/admin/atlas/param-decisions
 *
 * The Decision Log read surface. Lists rows from atlas_param_decisions —
 * every decision made about a Triage parameter, newest first.
 *
 * Filters: decision, param_name (substring), decided_by, source, since
 * (ISO date), has_evidence, batch_id. Paginated by `limit` (default 50,
 * max 500) + `offset`. Mirrors the response contract of the panel it
 * replaces: { success, items, total, limit, offset }.
 *
 * `include_evidence=1` adds the raw AI blob to each item. OFF by default —
 * every row reports `hasEvidence` regardless, which is all the list needs to
 * render its chip; the blobs are multi-KB each and only the per-parameter
 * history view actually expands them.
 *
 * SORTING IS SERVER-SIDE, ALWAYS. The primary use case is "find what I just
 * did and act on it", so the newest row must be on page 1. Sorting a page
 * slice client-side would reorder 50 arbitrary rows and look correct while
 * being wrong — there is a test pinning this.
 *
 * Service-role read; requireAdmin gates upstream.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';

const MAX_LIMIT = 500;

/** Explicit row shape. The select string is assembled across lines, which
 *  defeats Supabase's literal-type inference and otherwise degrades every
 *  field to GenericStringError. */
interface DecisionRow {
  id: string;
  param_name: string;
  param_name_display: string | null;
  family_id: string | null;
  category: string | null;
  decision: string;
  note: string | null;
  evidence: Record<string, unknown> | null;
  attribute_id: string | null;
  attribute_name: string | null;
  override_id: string | null;
  investigation_id: string | null;
  batch_id: string | null;
  source: string;
  decided_by: string;
  decided_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(sp.get('offset') ?? '0', 10) || 0, 0);

    const decision = sp.get('decision');
    const paramName = sp.get('param_name');
    const decidedBy = sp.get('decided_by');
    const source = sp.get('source');
    const since = sp.get('since');
    const batchId = sp.get('batch_id');
    const hasEvidence = sp.get('has_evidence') === '1';
    // "Mine" quick-filter — resolved server-side so the client never has to
    // know its own user id.
    const mineOnly = sp.get('mine') === '1';
    // The AI DeepAnalysis blob is multi-KB per row. The list needs to know
    // only WHETHER one exists (that's what `hasEvidence` is for) — shipping
    // the payloads for a 500-row page to render a chip is megabytes of
    // transfer nobody reads. The per-parameter history view, which fetches a
    // handful of rows and actually expands them, opts in.
    const includeEvidence = sp.get('include_evidence') === '1';

    const supabase = createServiceClient();
    let query = supabase
      .from('atlas_param_decisions')
      .select(
        'id, param_name, param_name_display, family_id, category, decision, note, evidence, ' +
          'attribute_id, attribute_name, override_id, investigation_id, batch_id, source, ' +
          'decided_by, decided_at',
        { count: 'exact' },
      );

    if (decision) query = query.eq('decision', decision);
    if (source) query = query.eq('source', source);
    if (batchId) query = query.eq('batch_id', batchId);
    if (decidedBy) query = query.eq('decided_by', decidedBy);
    if (mineOnly && user) query = query.eq('decided_by', user.id);
    if (since) query = query.gte('decided_at', since);
    if (hasEvidence) query = query.not('evidence', 'is', null);
    if (paramName) {
      // Search the CANONICAL column only, with the term canonicalized the
      // same way. param_name is by construction the NFC+lowercased form of
      // param_name_display, so one column covers both — and searching a
      // single column avoids PostgREST's .or() grammar, in which parentheses
      // are SYNTAX. That bit: `.or(...ilike.%VR(V)%...)` silently returned 0
      // rows for a param that plainly exists (14 of them), and a filter that
      // silently matches nothing is indistinguishable from "no results".
      // Parens are common in these names — VR(V), PD(W), RDS(ON) Max. (mΩ).
      const needle = paramName.normalize('NFC').toLowerCase().trim().replace(/[%_]/g, (m) => `\\${m}`);
      query = query.ilike('param_name', `%${needle}%`);
    }

    // `id` is a REQUIRED tiebreak, not decoration. Ties on decided_at are
    // routine here: an edit is dated at the successor mapping's creation,
    // which is also that mapping's own accept — 218 rows share an instant
    // with another row in live data. Without a total order, tied rows render
    // in arbitrary order (an accept could appear below its own revoke) and
    // pagination can repeat or skip rows across pages.
    const { data, error, count } = await query
      .order('decided_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('param-decisions GET failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Database error', detail: error.message },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as unknown as DecisionRow[];
    const nameMap = await resolveAdminNames(rows.map((r) => r.decided_by));

    return NextResponse.json({
      success: true,
      total: count ?? 0,
      limit,
      offset,
      items: rows.map((r) => ({
        id: r.id,
        // Show what the engineer actually saw; fall back to the canonical key.
        paramName: r.param_name_display || r.param_name,
        paramKey: r.param_name,
        familyId: r.family_id,
        category: r.category,
        decision: r.decision,
        note: r.note,
        hasEvidence: r.evidence != null,
        ...(includeEvidence ? { evidence: r.evidence } : {}),
        attributeId: r.attribute_id,
        attributeName: r.attribute_name,
        overrideId: r.override_id,
        investigationId: r.investigation_id,
        batchId: r.batch_id,
        source: r.source,
        decidedBy: r.decided_by,
        decidedByName: nameMap.get(r.decided_by) ?? 'Unknown',
        decidedAt: r.decided_at,
      })),
    });
  } catch (err) {
    console.error('param-decisions GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
