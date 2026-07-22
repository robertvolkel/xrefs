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
  /** When the row was last touched. For a row deactivated with nothing
   *  replacing it, this IS the revocation time — the only record of it that
   *  exists anywhere. Omitting it dated 9 live revokes to their own creation
   *  instant, understating one by 18 days. */
  updated_at?: string | null;
  is_active: boolean;
}

export interface ReconstructedDecision {
  paramName: string;
  decision:
    | 'mapping_accepted'
    | 'mapping_edited'
    | 'mapping_revoked'
    | 'deferred'
    | 'reopened'
    | 'marked_unmappable'
    | 'flagged_wrong_family'
    | 'confirmed_in_family'
    | 'note_added';
  decidedBy: string;
  decidedAt: string;
  /** True when decidedAt is the best available proxy rather than the exact
   *  moment (a revoke with no updated_at). Lets the UI say so instead of
   *  implying precision that isn't there. */
  approximate?: boolean;
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
 * DATING THE EVENTS — this is where the first version was wrong.
 *
 *   creation → the row's own `created_at`.
 *   edit     → the SUPERSEDING row's `created_at`; that is the instant the
 *              change actually happened.
 *   revoke   → the row's `updated_at`. A deactivation is an UPDATE, so
 *              `updated_at` is the revocation time and the only record of it
 *              that exists. The first version used `created_at` here, which
 *              dated every revoke to the same instant as its own accept —
 *              the log read "Accepted 03:40:22 → Revoked 03:40:22" for a
 *              mapping that lived 15 days, and the identical timestamps made
 *              the two render in arbitrary order.
 *
 * `approximate` is set when a revoke has no `updated_at` to fall back on, so
 * the caller can say so instead of implying a precision it doesn't have.
 * Nothing here ever invents a timestamp.
 */
export function classifyOverrideRows(rows: OverrideRow[]): {
  decisions: ReconstructedDecision[];
  counts: { accepted: number; edited: number; revoked: number };
} {
  // Successor lookup: for a dead row, the NEXT row on the same key by
  // created_at — active or not.
  //
  // It must be the next row chronologically, NOT the first active one. A
  // param mapped four times (v1→v2→v3→v4) has three dead rows; pointing them
  // all at the surviving v4 collapses three distinct edits made on three
  // different days into three identical events sharing v4's timestamp. That
  // is both wrong history AND a duplicate-key collision — which is exactly
  // how this bug surfaced (33 colliding keys / 70 rows on live data).
  const byKey = new Map<string, OverrideRow[]>();
  for (const r of rows) {
    const k = canonicalKey(r.param_name, r.family_id);
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  // ONE ordering, used for both the sort and the successor predicate below.
  //
  // These used to disagree: the sort used localeCompare while the predicate
  // used ASCII `>`. ICU collates '.' before '+', so on PostgREST-shaped
  // timestamps '…07:03:15+00:00' vs '…07:03:15.5+00:00' localeCompare says
  // the whole-second value is LATER while ASCII (and reality) say earlier.
  // A sort and a predicate that disagree can pick a successor that isn't the
  // chronologically nearest one — misdating the edit and attaching the wrong
  // attribute and author to it. Comparing instants sidesteps the whole class.
  const at = (r: OverrideRow) => new Date(r.created_at).getTime();
  for (const arr of byKey.values()) {
    arr.sort((a, b) => at(a) - at(b));
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

    // 2. What ended it — the next mapping created on the same key.
    // Nothing after it ⇒ nothing replaced it ⇒ a genuine revoke.
    const key = canonicalKey(r.param_name, r.family_id);
    // Same instant-based ordering as the sort above — see the note there.
    const successor = (byKey.get(key) ?? []).find((a) => at(a) > at(r));

    if (successor) {
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
      // A deactivation is an UPDATE, so updated_at IS the revocation time.
      // Falling back to created_at (the first version's behaviour) claims the
      // mapping was revoked the instant it was created.
      const revokedAt = r.updated_at ?? r.created_at;
      decisions.push({
        paramName: r.param_name,
        decision: 'mapping_revoked',
        decidedBy: r.created_by,
        decidedAt: revokedAt,
        approximate: !r.updated_at,
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
