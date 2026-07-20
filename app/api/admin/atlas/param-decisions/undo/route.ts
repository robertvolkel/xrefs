/**
 * POST /api/admin/atlas/param-decisions/undo   { decisionIds: string[] }
 *
 * Undo one or more decisions from the Decision Log.
 *
 * APPEND, NEVER EDIT. Undoing does not touch the original row — it performs
 * the underlying reversal and then APPENDS a new decision describing it, so
 * the log reads "Accepted 09:00 → Reverted 09:05". The table has no UPDATE
 * policy precisely so this can't be done any other way.
 *
 * Deliberately keyed on a DECISION row rather than an investigation row (the
 * older /triage-investigations/[id]/revert route stays untouched while the
 * panel it serves is still mounted — no rewriting live code out from under a
 * consumer).
 *
 * Reversal by decision type:
 *   mapping_accepted                   → deactivate the override
 *   deferred / marked_unmappable /
 *   flagged_wrong_family /
 *   confirmed_in_family                → clear the notes status (reopen)
 *   mapping_edited                     → refused. Undoing an edit means
 *                                        RESTORING the predecessor, which this
 *                                        route cannot do — see UNDOABLE_MAPPING.
 *   mapping_revoked / reopened         → refused: these ARE undos. Re-applying
 *                                        a mapping needs the full Triage
 *                                        context, so we send the user there
 *                                        rather than guess.
 *
 * Keep this list in step with UNDOABLE_MAPPING / UNDOABLE_STATUS below. It
 * previously claimed `mapping_edited` was undoable while the code refused it —
 * the same "a rule in a comment is not a rule" trap that produced the misdated
 * revokes in the backfill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { recordParamDecisions, type ParamDecisionInput } from '@/lib/services/paramDecisionLog';

// Only a FIRST mapping can be undone here.
//
// `mapping_edited` is deliberately excluded. Its override_id points at the
// SUCCESSOR mapping (the "after" of the edit), and 172 of the 209 edits in
// live data point at a mapping that is currently active. Deactivating it does
// NOT restore the predecessor — the parameter would go from mapped-to-B to
// not mapped at all, silently degrading ingest translation coverage while the
// log honestly reported "revoked". Undoing an edit means RESTORING the prior
// version, which needs the full Triage context (sample values, the AI
// suggestion, product counts). So we refuse and point there.
const UNDOABLE_MAPPING = new Set(['mapping_accepted']);
const UNDOABLE_STATUS = new Set([
  'deferred',
  'marked_unmappable',
  'flagged_wrong_family',
  'confirmed_in_family',
]);

interface DecisionRow {
  id: string;
  param_name: string;
  param_name_display: string | null;
  family_id: string | null;
  decision: string;
  override_id: string | null;
  attribute_id: string | null;
  attribute_name: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.decisionIds)
      ? body.decisionIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'decisionIds[] required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_param_decisions')
      .select('id, param_name, param_name_display, family_id, decision, override_id, attribute_id, attribute_name')
      .in('id', ids);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as DecisionRow[];
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching decisions' }, { status: 404 });
    }

    const appended: ParamDecisionInput[] = [];
    const families = new Set<string>();
    const skipped: Array<{ id: string; reason: string }> = [];

    // A requested id that matched no row was silently dropped before: the
    // caller asked to undo N decisions, got `undone: N-1` and no explanation.
    // Every id the caller sends gets an answer.
    const found = new Set(rows.map((r) => r.id));
    for (const id of ids) {
      if (!found.has(id)) skipped.push({ id, reason: 'no such decision' });
    }

    // ── Mapping undos: deactivate the overrides in one indexed update ────
    const mappingRows = rows.filter((r) => UNDOABLE_MAPPING.has(r.decision) && r.override_id);
    if (mappingRows.length > 0) {
      const overrideIds = mappingRows.map((r) => r.override_id as string);
      // `.select()` is load-bearing, not decoration: `.eq('is_active', true)`
      // means the update can legitimately match ZERO rows (the override was
      // already deactivated in Triage, or this decision was undone a moment
      // ago). Without reading back what changed, we'd append a
      // `mapping_revoked` row crediting this admin, now, for a revocation
      // that already happened — and an append-only table can never take it
      // back. Log ONLY what this request actually changed.
      const { data: reverted, error: updErr } = await supabase
        .from('atlas_dictionary_overrides')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('id', overrideIds)
        .eq('is_active', true)
        .select('id');

      if (updErr) {
        return NextResponse.json(
          { success: false, error: `Failed to revert mappings: ${updErr.message}` },
          { status: 500 },
        );
      }

      const actuallyReverted = new Set(((reverted ?? []) as Array<{ id: string }>).map((x) => x.id));
      for (const r of mappingRows) {
        if (!actuallyReverted.has(r.override_id as string)) {
          skipped.push({ id: r.id, reason: 'mapping was already inactive — nothing to undo' });
          continue;
        }
        if (r.family_id) families.add(r.family_id);
        appended.push({
          paramName: r.param_name,
          decision: 'mapping_revoked',
          decidedBy: user!.id,
          familyId: r.family_id,
          attributeId: r.attribute_id,
          attributeName: r.attribute_name,
          overrideId: r.override_id,
          note: 'Undone from the Decision Log',
          source: 'ui',
        });
      }
    }

    // ── Status undos: clear the notes row's status (back to open queue) ──
    const statusRows = rows.filter((r) => UNDOABLE_STATUS.has(r.decision));
    for (const r of statusRows) {
      // Match how the notes route already handles clearing: keep a genuine
      // note (it's the engineer's reasoning) and null the status; delete the
      // row outright when there's nothing left worth keeping.
      const displayName = r.param_name_display || r.param_name;
      const { data: note } = await supabase
        .from('atlas_unmapped_param_notes')
        .select('param_name, note, status')
        .eq('param_name', displayName)
        .maybeSingle();

      // Nothing parked ⇒ nothing to reopen. Logging "reopened" here would
      // assert a state transition that did not happen — and undoing twice
      // would append a second phantom row that can never be removed.
      if (!note || !note.status) {
        skipped.push({ id: r.id, reason: 'status was already cleared — nothing to undo' });
        continue;
      }

      // The write's error is CHECKED before anything is logged. Appending
      // `reopened` off an unchecked write would assert a state transition
      // that may not have happened — the param would still be parked in
      // Triage while the log permanently claimed it had been reopened, and an
      // append-only table cannot retract that. A log that can be wrong about
      // the thing it exists to record is worse than no log.
      let writeErr: string | null = null;
      if (typeof note.note === 'string' && note.note.trim().length > 0) {
        // Keep the engineer's reasoning, drop only the status.
        const { error: updErr } = await supabase
          .from('atlas_unmapped_param_notes')
          .update({
            status: null,
            flagged_by: null,
            auto_diagnosis: null,
            updated_by: user!.id,
            updated_at: new Date().toISOString(),
          })
          .eq('param_name', displayName);
        writeErr = updErr?.message ?? null;
      } else {
        const { error: delErr } = await supabase
          .from('atlas_unmapped_param_notes')
          .delete()
          .eq('param_name', displayName);
        writeErr = delErr?.message ?? null;
      }

      if (writeErr) {
        skipped.push({ id: r.id, reason: `could not clear the status: ${writeErr}` });
        continue;
      }

      appended.push({
        paramName: r.param_name,
        decision: 'reopened',
        decidedBy: user!.id,
        familyId: r.family_id,
        note: 'Undone from the Decision Log',
        source: 'ui',
      });
    }

    for (const r of rows) {
      if (r.decision === 'mapping_edited') {
        skipped.push({
          id: r.id,
          reason:
            'undoing an edit means restoring the previous mapping — do that in Triage, ' +
            'where the sample values and suggestion are visible',
        });
      } else if (!UNDOABLE_MAPPING.has(r.decision) && !UNDOABLE_STATUS.has(r.decision)) {
        skipped.push({ id: r.id, reason: `"${r.decision}" is itself an undo — re-apply it from Triage` });
      } else if (UNDOABLE_MAPPING.has(r.decision) && !r.override_id) {
        skipped.push({ id: r.id, reason: 'no linked mapping to revert' });
      }
    }

    // Logging is non-fatal everywhere else, but this action was initiated FROM
    // the log — so if the append failed, say so rather than letting the page
    // imply an entry that isn't there.
    const logged = await recordParamDecisions(appended);

    for (const fam of families) invalidateDictOverrideCache(fam);
    await invalidateTriageQueueCache();

    return NextResponse.json({
      success: true,
      undone: appended.length,
      logged,
      skipped,
    });
  } catch (err) {
    console.error('param-decisions undo error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
