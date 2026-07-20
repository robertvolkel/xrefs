/**
 * PUT    /api/admin/atlas/unmapped-param-notes/[paramName]  — upsert note + status
 * DELETE /api/admin/atlas/unmapped-param-notes/[paramName]  — clear note + status
 *
 * Body shape (PUT):
 *   {
 *     note?: string,                                  // free-form rationale
 *     status?: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null,
 *     flaggedBy?: 'auto' | 'engineer' | null,         // who set the status
 *     autoDiagnosis?: { suggestedFamily, reasoning, matchingParam } | null,
 *     flagged?: boolean,                               // engineer bookmark
 *   }
 *
 * Empty note + null/undefined status + flagged=false → row is deleted (the
 * icon flips back to empty + the auto-flag re-fires from the registry next
 * render). Non-empty note OR non-null status OR flagged=true → row persists;
 * the schema CHECK constraint requires at least one of the three be present.
 *
 * Service-role writes (per Decision #176 lesson — admin auth gated by
 * requireAdmin() upstream).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import {
  recordParamDecision,
  decisionForNoteWrite,
  type NoteState,
  type ParamDecisionType,
} from '@/lib/services/paramDecisionLog';

const MAX_NOTE_LENGTH = 5000;
const VALID_STATUS = new Set(['wrong_family', 'confirmed_in_family', 'unmappable', 'deferred']);
const VALID_FLAGGED_BY = new Set(['auto', 'engineer']);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ paramName: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { paramName } = await params;
    const decodedParamName = decodeURIComponent(paramName);
    if (!decodedParamName.trim()) {
      return NextResponse.json({ success: false, error: 'paramName required' }, { status: 400 });
    }

    const body = await request.json();
    const noteRaw = typeof body?.note === 'string' ? body.note : '';
    const noteTrimmed = noteRaw.trim();
    const note = noteTrimmed.length > 0 ? noteRaw : null;

    // status / flaggedBy / autoDiagnosis can be:
    //   - omitted (undefined) → treated as null
    //   - explicit null → cleared
    //   - non-empty string → validated against allowlist
    const statusRaw = body?.status;
    const status = statusRaw == null ? null : (typeof statusRaw === 'string' ? statusRaw : null);
    if (status !== null && !VALID_STATUS.has(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status: ${status}` },
        { status: 400 },
      );
    }

    const flaggedByRaw = body?.flaggedBy;
    const flaggedBy = flaggedByRaw == null ? null : (typeof flaggedByRaw === 'string' ? flaggedByRaw : null);
    if (flaggedBy !== null && !VALID_FLAGGED_BY.has(flaggedBy)) {
      return NextResponse.json(
        { success: false, error: `Invalid flaggedBy: ${flaggedBy}` },
        { status: 400 },
      );
    }

    const autoDiagnosis = body?.autoDiagnosis ?? null;
    const isFlagged = body?.flagged === true;

    const supabase = createServiceClient();

    // Read the PRIOR state before mutating. This row is last-write-wins with
    // no history of its own, so "what was it before" is only knowable here —
    // and it's what distinguishes a `deferred` from a `reopened` in the
    // decision log. Cheap: single-row PK lookup.
    const { data: prior } = await supabase
      .from('atlas_unmapped_param_notes')
      .select('status, note, is_flagged')
      .eq('param_name', decodedParamName)
      .maybeSingle();
    const priorStatus = (prior?.status as string | null) ?? null;
    const priorNote = (prior?.note as string | null) ?? null;
    const priorFlagged = (prior?.is_flagged as boolean | null) ?? false;

    const priorState: NoteState = { status: priorStatus, note: priorNote, flagged: priorFlagged };

    /** Pick the single most significant change this write represents. The
     *  rule itself lives in paramDecisionLog so the DELETE handler below
     *  applies the identical one — they used to diverge. */
    const resolveDecision = (
      nextStatus: string | null,
      nextNote: string | null,
      nextFlagged: boolean,
    ): ParamDecisionType | null =>
      decisionForNoteWrite(priorState, { status: nextStatus, note: nextNote, flagged: nextFlagged });

    // Row needs at least one signal to persist (matches the schema CHECK).
    // Empty note + null status + flagged=false → no reason to keep the row;
    // delete it so the auto-flag registry can re-fire on the next render.
    if (!note && status === null && !isFlagged) {
      const { error: delErr } = await supabase
        .from('atlas_unmapped_param_notes')
        .delete()
        .eq('param_name', decodedParamName);
      if (delErr) {
        return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
      }

      // Clearing everything sends the param back to the open queue. That is
      // a real decision ("I un-parked this") and used to leave no trace.
      const cleared = resolveDecision(null, null, false);
      if (cleared) {
        await recordParamDecision({
          paramName: decodedParamName,
          decision: cleared,
          decidedBy: user!.id,
          note: priorNote,
          source: 'ui',
        });
      }
      return NextResponse.json({ success: true, deleted: true });
    }

    if (note && note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Note exceeds ${MAX_NOTE_LENGTH} character limit` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('atlas_unmapped_param_notes')
      .upsert(
        {
          param_name: decodedParamName,
          note,
          status,
          flagged_by: flaggedBy,
          auto_diagnosis: autoDiagnosis,
          is_flagged: isFlagged,
          updated_by: user!.id,
          updated_at: now,
        },
        { onConflict: 'param_name' },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const nameMap = await resolveAdminNames([user!.id]);

    // Append to the decision log. This endpoint serves SIX different
    // decisions (defer / reopen / unmappable / wrong-family / confirm /
    // note) and the row it writes keeps no history, so without this the
    // decision is unrecoverable the moment it's overwritten.
    const decision = resolveDecision(status, note, isFlagged);
    if (decision) {
      await recordParamDecision({
        paramName: decodedParamName,
        decision,
        decidedBy: user!.id,
        note,
        // Optional, and only present when the engineer ran the AI pass first.
        // Must arrive with the request — the log is append-only, so evidence
        // absent at insert time can never be attached afterwards.
        evidence: (body?.analysis as Record<string, unknown> | undefined) ?? null,
        investigationId: (body?.investigationId as string | undefined) ?? null,
        source: 'ui',
      });
    }

    // Note status changes affect classification (wrong_family suppresses
    // synonym workflow; confirmed_in_family suppresses auto-flag). Bust the
    // cache so the next Triage load reflects the new state.
    invalidateTriageQueueCache();

    return NextResponse.json({
      success: true,
      item: {
        paramName: data.param_name as string,
        note: (data.note as string | null) ?? '',
        status: (data.status as 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null) ?? null,
        flaggedBy: (data.flagged_by as 'auto' | 'engineer' | null) ?? null,
        autoDiagnosis: (data.auto_diagnosis as Record<string, unknown> | null) ?? null,
        flagged: (data.is_flagged as boolean | null) ?? false,
        updatedBy: data.updated_by as string,
        updatedByName: nameMap.get(data.updated_by as string) ?? 'Unknown',
        updatedAt: data.updated_at as string,
        createdAt: data.created_at as string,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ paramName: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { paramName } = await params;
    const decodedParamName = decodeURIComponent(paramName);

    const supabase = createServiceClient();

    // Capture what we're about to erase — once the row is gone its status
    // is unrecoverable, so the log entry has to be built from the prior state.
    const { data: prior } = await supabase
      .from('atlas_unmapped_param_notes')
      .select('status, note, is_flagged')
      .eq('param_name', decodedParamName)
      .maybeSingle();

    const { error } = await supabase
      .from('atlas_unmapped_param_notes')
      .delete()
      .eq('param_name', decodedParamName);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // What this delete destroyed — through the SAME rule the PUT path uses,
    // rather than a second hand-written copy of it. The old inline version
    // logged only when a status was present, so wiping a row that held
    // nothing but an engineer's written rationale erased it with no record
    // that it had ever existed: the exact loss this log exists to prevent, in
    // the one code path that performs it irreversibly. A delete is simply a
    // write whose next state is empty.
    const priorNote = (prior?.note as string | null) ?? null;
    const decision: ParamDecisionType | null = decisionForNoteWrite(
      {
        status: (prior?.status as string | null) ?? null,
        note: priorNote,
        flagged: (prior?.is_flagged as boolean | null) ?? false,
      },
      { status: null, note: null, flagged: false },
    );

    if (decision) {
      await recordParamDecision({
        paramName: decodedParamName,
        decision,
        decidedBy: user!.id,
        note: priorNote,
        source: 'ui',
      });
    }

    invalidateTriageQueueCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
