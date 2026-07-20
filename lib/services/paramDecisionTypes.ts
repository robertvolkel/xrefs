/**
 * paramDecisionTypes — the CLIENT-SAFE half of the decision log.
 *
 * Types, vocabulary and pure rules that both the server routes and the
 * Decision Log panel need. Deliberately free of any server-only import:
 * `paramDecisionLog.ts` pulls in `createServiceClient`, which reads
 * SUPABASE_SERVICE_ROLE_KEY, so a client component must never import it.
 * (Same split as componentVocabulary.ts / manufacturerAliasClient.ts.)
 *
 * WHY THIS FILE EXISTS AT ALL. The undoable-decision list lived twice — once
 * in the undo route, once hand-typed in the panel — which is the shape this
 * repo has repeatedly been bitten by: two copies of one truth, drifting with
 * nothing to fail. Concretely, adding a type to the route's set left the
 * panel's Undo button disabled behind a tooltip claiming the server refuses
 * something it now accepts. One copy, imported by both.
 */

/** Every decision type the log understands. Mirrors the CHECK constraint in
 *  scripts/supabase-atlas-param-decisions-schema.sql — keep the two in
 *  lockstep (the constraint is written DROP-then-ADD so this set can grow). */
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
  /** An engineer's written rationale was erased. Distinct from `reopened`
   *  (which is about a STATUS returning to the queue) because destroying the
   *  reasoning behind a decision is precisely the loss this log exists to
   *  prevent — it must not be the one event that leaves no trace. */
  | 'note_cleared'
  | 'flag_toggled';

/** How the decision was made. 'backfill' marks a row RECONSTRUCTED from
 *  pre-existing records rather than observed as it happened — the UI shows
 *  it distinctly so reconstructed history never reads as observed history. */
export type ParamDecisionSource = 'ui' | 'batch' | 'script' | 'backfill';

/**
 * Mapping decisions the undo endpoint will reverse.
 *
 * `mapping_edited` is deliberately ABSENT. Its override_id points at the
 * SUCCESSOR mapping (the "after" of the edit), and 172 of the 209 edits in
 * live data point at a mapping that is currently active. Deactivating it does
 * NOT restore the predecessor — the parameter would go from mapped-to-B to
 * not mapped at all, silently degrading ingest translation coverage while the
 * log honestly reported "revoked". Undoing an edit means RESTORING the prior
 * version, which needs the full Triage context.
 */
export const UNDOABLE_MAPPING_DECISIONS: ReadonlySet<ParamDecisionType> = new Set<ParamDecisionType>([
  'mapping_accepted',
]);

/** Status decisions the undo endpoint will clear back to the open queue. */
export const UNDOABLE_STATUS_DECISIONS: ReadonlySet<ParamDecisionType> = new Set<ParamDecisionType>([
  'deferred',
  'marked_unmappable',
  'flagged_wrong_family',
  'confirmed_in_family',
]);

// Predicates take `string` on purpose: the DB column is text, so callers
// reading a row have a string, and forcing a cast at every call site is how a
// wrong value ends up silently asserted into the union.
export function isUndoableMapping(d: string): boolean {
  return UNDOABLE_MAPPING_DECISIONS.has(d as ParamDecisionType);
}

export function isUndoableStatus(d: string): boolean {
  return UNDOABLE_STATUS_DECISIONS.has(d as ParamDecisionType);
}

export function isUndoableDecision(d: string): boolean {
  return isUndoableMapping(d) || isUndoableStatus(d);
}

/**
 * Why the undo endpoint refuses a decision, or null when it accepts it.
 *
 * Shared so the panel's disabled-button tooltip and the server's `skipped`
 * reason cannot tell the user two different stories about the same decision.
 */
export function undoRefusalReason(d: string): string | null {
  if (isUndoableDecision(d)) return null;
  if (d === 'mapping_edited') {
    return 'Undoing a re-map means restoring the previous mapping. Do that on the Triage page, where the sample values and suggestion are visible.';
  }
  if (d === 'mapping_revoked' || d === 'reopened') {
    return 'This entry is itself an undo. Re-apply it from the Triage page.';
  }
  return 'This kind of entry has nothing to reverse.';
}

/**
 * The canonical join key for a parameter across the decision log.
 *
 * Must stay byte-identical to the transform in
 * app/api/admin/atlas/dictionaries/route.ts (`.normalize('NFC')
 * .toLowerCase().trim()`), which is what atlas_dictionary_overrides already
 * stores. If these two ever diverge, per-param history splits silently —
 * there is a unit test pinning them together.
 */
export function canonicalizeParamName(name: string): string {
  return name.normalize('NFC').toLowerCase().trim();
}
