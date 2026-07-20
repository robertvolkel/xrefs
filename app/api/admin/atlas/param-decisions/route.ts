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
    // Exact match on the canonical param name — used by the per-parameter
    // history view. Substring is still the default for the search box.
    const exactParam = sp.get('param_exact') === '1';
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
    // `user!.id`, not `mineOnly && user`. A guard that skips the filter when
    // the user is missing turns "show only mine" into "show everyone's" with
    // the chip still lit — a filter that silently never fires, which reads
    // exactly like a filter that fired and matched nothing (Decision #263).
    // requireAdmin guarantees a user here; if that ever stops being true this
    // should fail loudly rather than widen the result set.
    if (mineOnly) query = query.eq('decided_by', user!.id);
    if (since) query = query.gte('decided_at', since);
    if (hasEvidence) query = query.not('evidence', 'is', null);
    if (paramName) {
      // Both modes hit the CANONICAL column only. param_name is by
      // construction the NFC+lowercased form of param_name_display, so one
      // column covers both — and searching a single column avoids PostgREST's
      // .or() grammar, in which parentheses are SYNTAX. That bit:
      // `.or(...ilike.%VR(V)%...)` silently returned 0 rows for a param that
      // plainly exists (14 of them), and a filter that silently matches
      // nothing is indistinguishable from "no results". Parens are common in
      // these names — VR(V), PD(W), RDS(ON) Max. (mΩ).
      const canonical = paramName.normalize('NFC').toLowerCase().trim();

      if (exactParam) {
        // EXACT is the mode the per-parameter history view needs, and it is
        // not a nicety. Under substring matching, 95 of 823 distinct params
        // (12%) are a substring of a different param — "aec-q" pulls in
        // aec-q100 compliance / aec-q100 compliant / aec-q101, and "io"
        // matches 89 distinct params. A drawer headed "everything decided
        // about this parameter" that lists OTHER parameters' decisions is
        // exactly the quietly-wrong output this whole feature exists to stop.
        query = query.eq('param_name', canonical);
      } else {
        // Escape backslash FIRST — it is the escape character in the pattern
        // that follows, so escaping the wildcards before it would double-
        // escape their backslashes and a trailing backslash would leave a
        // dangling escape. Order is load-bearing.
        const needle = canonical.replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => `\\${m}`);
        query = query.ilike('param_name', `%${needle}%`);
      }
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

    // TRUE size of each batch represented on this page.
    //
    // A Batch Accept writes one row per param (one live batch wrote 55) and
    // the panel collapses them into a single expandable line. Counting the
    // rows visible on the page would understate that line whenever the batch
    // straddles a page boundary — "Batch accepted 50 params" for a batch of
    // 55, which is exactly the kind of quietly-wrong number this feature is
    // supposed to stop producing.
    //
    // Counted for batches contributing 2+ ROWS TO THIS PAGE, which is both
    // the correct trigger and a natural bound. Correct because the panel only
    // collapses a run of 2+ (a lone row renders as itself and needs no
    // count), so a 1-row appearance has nothing to label. Bounded because at
    // most floor(limit/2) batches can contribute two rows each — 25 for a
    // 50-row page, reached by arithmetic rather than by an arbitrary
    // `.slice(0, 25)` that would silently drop the 26th and let its group
    // fall back to the visible count: the precise understated number this
    // block exists to prevent, reintroduced by the guard meant to bound it.
    const rowsPerBatch = new Map<string, number>();
    for (const r of rows) {
      if (r.batch_id) rowsPerBatch.set(r.batch_id, (rowsPerBatch.get(r.batch_id) ?? 0) + 1);
    }
    const batchIds = [...rowsPerBatch.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    const batchCounts: Record<string, number> = {};
    await Promise.all(
      batchIds.map(async (id) => {
        const { count: n } = await supabase
          .from('atlas_param_decisions')
          .select('*', { count: 'exact', head: true })
          .eq('batch_id', id);
        if (typeof n === 'number') batchCounts[id] = n;
      }),
    );

    return NextResponse.json({
      success: true,
      total: count ?? 0,
      limit,
      offset,
      batchCounts,
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
