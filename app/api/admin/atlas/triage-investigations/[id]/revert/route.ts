/**
 * POST /api/admin/atlas/triage-investigations/[id]/revert
 *
 * Sends a previously-actioned investigation back to the Triage queue.
 * Performs the underlying revert based on what action was originally
 * taken:
 *
 *   action_taken='override_created'     → set the linked override's
 *                                          is_active=false (matches the
 *                                          Revert button in the Triage page)
 *   action_taken='flagged_wrong_family' → clear noteStatus='wrong_family'
 *                                          on atlas_unmapped_param_notes
 *   action_taken='marked_unmappable'    → clear noteStatus='unmappable'
 *
 * The audit row itself is NOT erased — the original action_taken /
 * action_at stay put, and reverted_at + reverted_by are appended so the
 * log shows the full history. Idempotent (re-PATCH after revert is a
 * no-op). Service-role writes, requireAdmin gates upstream.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateTriageQueueCacheAndAwaitFresh } from '@/lib/services/triageQueueCache';

interface InvestigationRow {
  id: string;
  param_name: string;
  action_taken: string | null;
  resulting_override_id: string | null;
  reverted_at: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Load the audit row to figure out what to revert.
    const { data: row, error: loadErr } = await supabase
      .from('atlas_triage_investigations')
      .select('id, param_name, action_taken, resulting_override_id, reverted_at')
      .eq('id', id)
      .maybeSingle<InvestigationRow>();

    if (loadErr || !row) {
      return NextResponse.json(
        { success: false, error: 'Investigation not found', detail: loadErr?.message ?? null },
        { status: 404 },
      );
    }

    if (!row.action_taken) {
      return NextResponse.json(
        { success: false, error: 'Nothing to revert — no action was taken on this investigation' },
        { status: 400 },
      );
    }

    if (row.reverted_at) {
      // Already reverted. Return success so re-clicking from a stale UI
      // doesn't error out — idempotent.
      return NextResponse.json({ success: true, alreadyReverted: true });
    }

    // Perform the underlying revert action.
    let revertError: string | null = null;

    if (row.action_taken === 'override_created') {
      if (!row.resulting_override_id) {
        revertError = 'audit row marked override_created but resulting_override_id is null';
      } else {
        const { error } = await supabase
          .from('atlas_dictionary_overrides')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', row.resulting_override_id);
        if (error) revertError = `Override revert failed: ${error.message}`;
      }
    } else if (row.action_taken === 'flagged_wrong_family' || row.action_taken === 'marked_unmappable') {
      // Both clear the notes row's status. Delete the row entirely if
      // there's no note attached either (matching the existing
      // /unmapped-param-notes DELETE semantics) — otherwise leave the note
      // intact with status=null.
      const { data: note, error: noteLoadErr } = await supabase
        .from('atlas_unmapped_param_notes')
        .select('param_name, note, status')
        .eq('param_name', row.param_name)
        .maybeSingle<{ param_name: string; note: string | null; status: string | null }>();

      if (noteLoadErr) {
        revertError = `Note load failed: ${noteLoadErr.message}`;
      } else if (note && note.note && note.note.trim().length > 0) {
        // Keep the note, clear the status.
        const { error } = await supabase
          .from('atlas_unmapped_param_notes')
          .update({
            status: null,
            flagged_by: null,
            auto_diagnosis: null,
            updated_by: user!.id,
            updated_at: new Date().toISOString(),
          })
          .eq('param_name', row.param_name);
        if (error) revertError = `Note status clear failed: ${error.message}`;
      } else if (note) {
        // No note attached — delete the row entirely so the foreign-family
        // registry can re-fire on next render if applicable.
        const { error } = await supabase
          .from('atlas_unmapped_param_notes')
          .delete()
          .eq('param_name', row.param_name);
        if (error) revertError = `Note delete failed: ${error.message}`;
      }
      // If note is null, nothing to do — the noteStatus was already gone.
    } else {
      revertError = `Cannot revert action_taken=${row.action_taken}`;
    }

    if (revertError) {
      console.error('triage-investigations revert underlying action failed:', revertError);
      return NextResponse.json(
        { success: false, error: 'Underlying revert failed', detail: revertError },
        { status: 500 },
      );
    }

    // Stamp the audit row. is_null guard so concurrent revert clicks can't
    // double-stamp; first-revert-wins (matches the PATCH idempotency).
    const { data: stamped, error: stampErr } = await supabase
      .from('atlas_triage_investigations')
      .update({
        reverted_at: new Date().toISOString(),
        reverted_by: user!.id,
      })
      .eq('id', id)
      .is('reverted_at', null)
      .select('id')
      .maybeSingle();

    if (stampErr) {
      // Underlying revert already happened — log but don't fail the request,
      // since the dictionary-override / note state is the source of truth.
      console.error('triage-investigations revert stamp failed:', stampErr);
    }

    // Bring the row back into the Triage open queue. Same wait-then-restart
    // pattern as other batch-state mutations (Decision #180/#182).
    void invalidateTriageQueueCacheAndAwaitFresh();

    return NextResponse.json({ success: true, stamped: !!stamped });
  } catch (err) {
    console.error('triage-investigations revert error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
