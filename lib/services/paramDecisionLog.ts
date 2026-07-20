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

/** Matches the backfill script's chunk size. */
const INSERT_CHUNK_SIZE = 500;

// The vocabulary and the pure rules live in the CLIENT-SAFE sibling module,
// because this one imports createServiceClient (SUPABASE_SERVICE_ROLE_KEY)
// and the Decision Log panel needs the vocabulary. Re-exported so server
// callers can keep importing everything from one place.
export {
  UNDOABLE_MAPPING_DECISIONS,
  UNDOABLE_STATUS_DECISIONS,
  isUndoableDecision,
  undoRefusalReason,
  canonicalizeParamName,
  type ParamDecisionType,
  type ParamDecisionSource,
} from './paramDecisionTypes';

import {
  canonicalizeParamName,
  type ParamDecisionType,
  type ParamDecisionSource,
} from './paramDecisionTypes';

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

    // Chunked. A Batch Accept has no cap on how many params it can approve,
    // and a single oversized insert fails as ONE unit — so a 400-param batch
    // would lose its entire audit trail to one rejected request, silently
    // (writes here are non-fatal). Chunking bounds the blast radius to 500
    // and lets the rest land.
    let ok = true;
    for (let i = 0; i < inputs.length; i += INSERT_CHUNK_SIZE) {
      const chunk = inputs.slice(i, i + INSERT_CHUNK_SIZE);
      const { error } = await supabase.from('atlas_param_decisions').insert(chunk.map(toRow));
      if (error) {
        // Non-fatal: surface it in logs, let the caller's action succeed.
        console.error(
          `[paramDecisionLog] failed to record ${chunk.length} decision(s) ` +
            `(chunk ${i / INSERT_CHUNK_SIZE + 1} of ${Math.ceil(inputs.length / INSERT_CHUNK_SIZE)}):`,
          error.message,
        );
        ok = false;
      }
    }
    return ok;
  } catch (err) {
    console.error('[paramDecisionLog] unexpected error recording decision(s):', err);
    return false;
  }
}

/** The three things an `atlas_unmapped_param_notes` row can carry. */
export interface NoteState {
  status: string | null;
  note: string | null;
  flagged: boolean;
}

/**
 * What one write to the notes table DECIDED, given what was there before.
 *
 * WHY THIS IS SHARED CODE. Two routes mutate that table — the PUT (upsert or
 * clear) and the DELETE — and each used to carry its own inline version of
 * this rule. They disagreed, and the disagreement was invisible: the DELETE
 * copy logged only when a STATUS was present, so wiping a row that held
 * nothing but an engineer's written rationale destroyed it and recorded
 * nothing. A log whose single blind spot is "somebody deleted the reasoning"
 * is blind exactly where it matters most.
 *
 * At the second consumer, the rule moves out of the route. One function, two
 * callers, one behaviour.
 *
 * PRECEDENCE: status > note > flag. One user action produces ONE row — a
 * defer that also saves a note is a defer, not two entries. The order runs
 * most-consequential first.
 *
 * Returns null when nothing meaningful changed, so a no-op write (re-saving
 * an identical note) doesn't manufacture an entry that can never be removed.
 */
export function decisionForNoteWrite(
  prior: NoteState,
  next: NoteState,
): ParamDecisionType | null {
  if (next.status !== prior.status) {
    return decisionForNoteStatus(next.status, prior.status);
  }
  if (next.note !== prior.note) {
    if (next.note) return 'note_added';
    // Erasing rationale is a decision. Guarding this on `next.note` being
    // truthy — the original bug — silently dropped every clear.
    return prior.note ? 'note_cleared' : null;
  }
  if (next.flagged !== prior.flagged) return 'flag_toggled';
  return null;
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
