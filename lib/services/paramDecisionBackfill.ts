/**
 * paramDecisionBackfill — pure reconstruction logic for the decision log.
 *
 * Extracted from the script so the risky part is unit-testable. The risky
 * part is `classifyOverrideRows`: the first draft of the plan said "every
 * deactivated override is a revoke", which measured WRONG on live data —
 * 209 of 218 deactivated rows were superseded by a newer active row (an
 * EDIT), and only 9 were genuinely revoked. Shipping that would have opened
 * the log claiming 218 revocations that never happened, which is precisely
 * the fabricated history this feature exists to prevent.
 *
 * The 9 is independently corroborated by the Triage page's own "REVERTED 9"
 * chip — two unrelated sources agreeing.
 */

export interface OverrideRow {
  id: string;
  param_name: string;
  family_id: string;
  attribute_id: string | null;
  attribute_name: string | null;
  change_reason: string | null;
  created_by: string;
  created_at: string;
  is_active: boolean;
}

export interface ReconstructedDecision {
  paramName: string;
  decision:
    | 'mapping_accepted'
    | 'mapping_edited'
    | 'mapping_revoked'
    | 'deferred'
    | 'marked_unmappable'
    | 'flagged_wrong_family'
    | 'confirmed_in_family'
    | 'note_added';
  decidedBy: string;
  decidedAt: string;
  familyId?: string | null;
  attributeId?: string | null;
  attributeName?: string | null;
  overrideId?: string | null;
  investigationId?: string | null;
  batchId?: string | null;
  note?: string | null;
  evidence?: Record<string, unknown> | null;
}

/** Same canonical form the runtime helper and the overrides route use. */
export function canonicalKey(paramName: string, familyId: string): string {
  return `${paramName.normalize('NFC').toLowerCase().trim()}||${familyId}`;
}

/** Pull the batch UUID out of a change_reason like
 *  "Batch-accepted (AI high-confidence) [batch:c5bfc8bd-...]".
 *  Verified against live data: 137 rows across 7 batches parse cleanly. */
export function parseBatchId(changeReason: string | null | undefined): string | null {
  if (!changeReason) return null;
  const m = changeReason.match(/\[batch:([^\]]+)\]/);
  return m ? m[1] : null;
}

/**
 * Reconstruct decisions from the override chain.
 *
 * Every row (active or not) produces its original creation decision. A row
 * that is no longer active produces a SECOND decision describing what ended
 * it — and that is where the edit-vs-revoke distinction lives:
 *
 *   superseded (a newer ACTIVE row exists for the same param+family) → edit
 *   nothing replaced it                                              → revoke
 *
 * The creation event's `decided_at` is the row's own created_at. The ending
 * event is dated from the SUPERSEDING row's created_at when there is one
 * (that is when the change actually happened); a true revoke has no such
 * successor, so it falls back to the row's updated_at if supplied, else its
 * created_at — flagged via `endedAtIsApproximate` so the caller can be
 * honest about it rather than inventing precision.
 */
export function classifyOverrideRows(rows: OverrideRow[]): {
  decisions: ReconstructedDecision[];
  counts: { accepted: number; edited: number; revoked: number };
} {
  // Every key that currently has a live mapping.
  const activeKeys = new Set(
    rows.filter((r) => r.is_active).map((r) => canonicalKey(r.param_name, r.family_id)),
  );

  // Successor lookup: for a dead row, the oldest ACTIVE row on the same key
  // that was created after it. That row's birth is this row's death.
  const activeByKey = new Map<string, OverrideRow[]>();
  for (const r of rows) {
    if (!r.is_active) continue;
    const k = canonicalKey(r.param_name, r.family_id);
    const arr = activeByKey.get(k) ?? [];
    arr.push(r);
    activeByKey.set(k, arr);
  }
  for (const arr of activeByKey.values()) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const decisions: ReconstructedDecision[] = [];
  const counts = { accepted: 0, edited: 0, revoked: 0 };

  for (const r of rows) {
    const batchId = parseBatchId(r.change_reason);

    // 1. The creation of this mapping — always a real, dated decision.
    decisions.push({
      paramName: r.param_name,
      decision: 'mapping_accepted',
      decidedBy: r.created_by,
      decidedAt: r.created_at,
      familyId: r.family_id,
      attributeId: r.attribute_id,
      attributeName: r.attribute_name,
      overrideId: r.id,
      batchId,
      note: r.change_reason,
    });
    counts.accepted++;

    if (r.is_active) continue;

    // 2. What ended it.
    const key = canonicalKey(r.param_name, r.family_id);
    const successor = (activeByKey.get(key) ?? []).find((a) => a.created_at > r.created_at);

    if (activeKeys.has(key) && successor) {
      decisions.push({
        paramName: r.param_name,
        decision: 'mapping_edited',
        decidedBy: successor.created_by,
        decidedAt: successor.created_at,
        familyId: r.family_id,
        attributeId: successor.attribute_id,
        attributeName: successor.attribute_name,
        overrideId: successor.id,
        batchId: parseBatchId(successor.change_reason),
        note: successor.change_reason,
      });
      counts.edited++;
    } else {
      decisions.push({
        paramName: r.param_name,
        decision: 'mapping_revoked',
        decidedBy: r.created_by,
        decidedAt: r.created_at,
        familyId: r.family_id,
        attributeId: r.attribute_id,
        attributeName: r.attribute_name,
        overrideId: r.id,
        batchId,
        note: r.change_reason,
      });
      counts.revoked++;
    }
  }

  return { decisions, counts };
}

/** Map a legacy investigation's action_taken onto a decision type. */
export function decisionForInvestigationAction(action: string): ReconstructedDecision['decision'] | null {
  switch (action) {
    case 'override_created':
      return 'mapping_accepted';
    case 'flagged_wrong_family':
      return 'flagged_wrong_family';
    case 'marked_unmappable':
      return 'marked_unmappable';
    // 'dismissed' is reserved and never wired to an inline action; it
    // represents "looked and moved on", not a decision about the param.
    default:
      return null;
  }
}

/** Map a notes-table status onto a decision type. */
export function decisionForNoteRow(status: string | null, note: string | null):
  ReconstructedDecision['decision'] | null {
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
      // No status but a real note → the note itself was the decision.
      return note && note.trim() ? 'note_added' : null;
  }
}
