/**
 * paramDecisionLog — the ONE way a Triage parameter decision gets recorded.
 *
 * Every decision about a parameter (accept a mapping, defer it, mark it
 * unmappable, flag wrong family, add a note, undo any of the above) appends
 * one row to `atlas_param_decisions` through `recordParamDecision()`.
 *
 * WHY A SINGLE CHOKE POINT
 * Decisions used to be written by ~9 different routes into 3 different
 * tables, and only the subset made through the AI Investigate drawer was
 * ever logged — 1,967 of 2,032 accepted mappings (97%) and all 80 deferred
 * params left no audit trail. The failure mode was structural: nothing
 * forced a new write path to record anything. A comment saying "remember
 * to log this" is not a control (see the repo's own history of mirrored
 * logic drifting silently). So: one exported function, one table, and a
 * guard test that fails if any decision-writing route stops calling it.
 *
 * APPEND-ONLY. There is no update/delete here by design. Undoing a decision
 * does not edit the original row — it appends a new one (`mapping_revoked`
 * / `reopened`), so the log reads "Accepted 09:00 → Reverted 09:05" rather
 * than quietly rewriting what happened. The table has no UPDATE or DELETE
 * RLS policy to back this up at the database level.
 *
 * NON-FATAL BY DESIGN. A failed log insert never breaks the user's action.
 * This trades audit completeness for reliability, deliberately: the log is
 * a review aid, not a compliance record, and an admin should never lose an
 * accept because the audit table hiccuped. Failures are console.error'd so
 * they surface in server logs rather than vanishing.
 *
 * Schema: scripts/supabase-atlas-param-decisions-schema.sql
 */

import { createServiceClient } from '@/lib/supabase/service';

/** Every decision type the log understands. Mirrors the CHECK constraint
 *  in the schema — keep the two in lockstep (the schema's constraint is
 *  written DROP-then-ADD precisely so this set can grow). */
export type ParamDecisionType =
  | 'mapping_accepted'
  | 'mapping_edited'
  | 'mapping_revoked'
  | 'deferred'
  | 'reopened'
  | 'marked_unmappable'
  | 'flagged_wrong_family'
  | 'confirmed_in_family'
  | 'note_added'
  | 'flag_toggled';

/** How the decision was made. 'backfill' marks a row RECONSTRUCTED from
 *  pre-existing records rather than observed as it happened — the UI shows
 *  it distinctly so reconstructed history never reads as observed history. */
export type ParamDecisionSource = 'ui' | 'batch' | 'script' | 'backfill';

export interface ParamDecisionInput {
  /** The vendor attribute name in WHATEVER form the caller has — this
   *  function normalizes it. Callers must not pre-normalize.
   *
   *  Why the helper owns this: the two source tables disagree on form.
   *  atlas_dictionary_overrides stores NFC + lowercased (normalized by its
   *  POST route); atlas_unmapped_param_notes stores raw. If each caller
   *  passed its own form through, one parameter's history would silently
   *  split in two — and because NFC/NFD differences are invisible on
   *  screen, nobody would notice. One choke point, one canonical key. */
  paramName: string;
  decision: ParamDecisionType;
  /** auth.users id. Required — the log is worthless without an actor. */
  decidedBy: string;

  /** Scope, when known. Null for status decisions: the notes table is keyed
   *  on param_name alone, so a defer genuinely has no family — recording
   *  null is honest, guessing one is not. */
  familyId?: string | null;
  category?: string | null;

  /** The rationale as it stood at decision time (snapshot, not a live FK). */
  note?: string | null;
  /** AI DeepAnalysis blob when one informed this decision; null otherwise. */
  evidence?: Record<string, unknown> | null;

  attributeId?: string | null;
  attributeName?: string | null;

  overrideId?: string | null;
  investigationId?: string | null;
  /** Groups the N rows written by one Batch Accept, for display collapse. */
  batchId?: string | null;

  /** Defaults to 'ui'. */
  source?: ParamDecisionSource;
  /** ISO timestamp. Defaults to now. Set explicitly by the backfill so a
   *  reconstructed decision carries its ORIGINAL date, not today's. */
  decidedAt?: string;
}

/**
 * The canonical join key for a parameter across the decision log.
 *
 * Must stay byte-identical to the transform in
 * app/api/admin/atlas/dictionaries/route.ts (`.normalize('NFC')
 * .toLowerCase().trim()`), which is what atlas_dictionary_overrides
 * already stores. If these two ever diverge, per-param history splits
 * silently — there is a unit test pinning them together.
 */
export function canonicalizeParamName(name: string): string {
  return name.normalize('NFC').toLowerCase().trim();
}

/** Shape actually written to Postgres (snake_case column names). */
function toRow(input: ParamDecisionInput): Record<string, unknown> {
  return {
    param_name: canonicalizeParamName(input.paramName),
    // Preserve what the engineer actually saw, for display only.
    param_name_display: input.paramName,
    decision: input.decision,
    decided_by: input.decidedBy,
    family_id: input.familyId ?? null,
    category: input.category ?? null,
    note: input.note ?? null,
    evidence: input.evidence ?? null,
    attribute_id: input.attributeId ?? null,
    attribute_name: input.attributeName ?? null,
    override_id: input.overrideId ?? null,
    investigation_id: input.investigationId ?? null,
    batch_id: input.batchId ?? null,
    source: input.source ?? 'ui',
    ...(input.decidedAt ? { decided_at: input.decidedAt } : {}),
  };
}

/**
 * Append one decision to the log.
 *
 * Never throws — a logging failure must not break the decision the user
 * just made. Returns true when the row landed, false when it didn't, so
 * callers that genuinely care (the backfill) can count.
 */
export async function recordParamDecision(input: ParamDecisionInput): Promise<boolean> {
  return recordParamDecisions([input]);
}

/**
 * Append many decisions in one insert. Used by Batch Accept, which decides
 * about N params at once.
 *
 * One row PER PARAM on purpose — collapsing a batch into a single row would
 * break per-parameter history, which is the whole point of the log. The UI
 * groups them for display via `batchId` instead.
 */
export async function recordParamDecisions(inputs: ParamDecisionInput[]): Promise<boolean> {
  if (inputs.length === 0) return true;

  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('atlas_param_decisions')
      .insert(inputs.map(toRow));

    if (error) {
      // Non-fatal: surface it in logs, let the caller's action succeed.
      console.error(
        `[paramDecisionLog] failed to record ${inputs.length} decision(s):`,
        error.message,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error('[paramDecisionLog] unexpected error recording decision(s):', err);
    return false;
  }
}

/**
 * Map a status written to `atlas_unmapped_param_notes` onto its decision
 * type. That one PUT endpoint serves six different decisions, so this is
 * where the fan-out lives — in shared code rather than duplicated inside
 * the route, so a new status can't be added without a decision type.
 *
 * Returns null when the write carries no status transition worth logging
 * (e.g. a pure flag toggle, handled separately by the caller).
 */
export function decisionForNoteStatus(
  status: string | null | undefined,
  previousStatus: string | null | undefined,
): ParamDecisionType | null {
  // Clearing a status sends the param back to the open queue.
  if (!status) {
    return previousStatus ? 'reopened' : null;
  }
  switch (status) {
    case 'deferred':
      return 'deferred';
    case 'unmappable':
      return 'marked_unmappable';
    case 'wrong_family':
      return 'flagged_wrong_family';
    case 'confirmed_in_family':
      return 'confirmed_in_family';
    default:
      return null;
  }
}
