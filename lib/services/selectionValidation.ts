/**
 * Wrong-CHOICE validation for guided part selection (chat redesign, Phase 1 Track B).
 *
 * When a user names a categorical value that doesn't exist for the family — an invalid
 * dielectric, a bogus output type — the agent should STEP IN with a bounded, system-written
 * clarify question offering the real options, not silently search on the bad value. This is
 * the ENTIRE "catch wrong input" v1 scope: numeric out-of-range and physically-contradictory
 * combinations are deliberately deferred (they need per-family constraint tables that don't
 * exist yet).
 *
 * Design constraints that keep it safe:
 *   - Operates ONLY on attributeIds the extractor already keyed, so it introduces ZERO new
 *     term→attribute resolution and inherits none of that mapping's fragility.
 *   - Validates ONLY specs with a genuine CLOSED option set (`parseSelectionOptions`), so a
 *     free-text/numeric spec is never second-guessed.
 *   - Consults per-rule `valueAliases` (Decision #160), so a valid synonym like NP0 (≡ C0G)
 *     is NOT flagged.
 *   - FAILS OPEN throughout: unknown family/attribute, no option set, blank/"any" value, or
 *     any doubt ⇒ no conflict. A false positive (blocking a valid value) is the failure to
 *     avoid, so the validator only fires on a definite non-match.
 *
 * Pure + side-effect-free (reads only the in-memory logic table), so it's unit-testable; the
 * controller wiring + the SELECTION_VALIDATION_ENABLED gate live in guidedSelectionController.
 */

import { getLogicTable } from '../logicTables';
import type { MatchingRule } from '../types';
import { parseSelectionOptions } from './selectionQuestions';
import { categoricalEquivalent } from './searchConstraints';

/** A stated categorical value that isn't a recognized option for its spec. */
export interface ValueConflict {
  attributeId: string;
  /** The rule's attributeName (may carry an option parenthetical the caller strips for display). */
  label: string;
  /** The value the user stated, verbatim. */
  stated: string;
  /** The real options to offer as buttons. */
  options: string[];
}

/** Minimal shape of a guided answer map entry (matches GuidedAnswer without importing it). */
type AnswerLike = { value: string | number | null } | undefined;

/** True when `value` is a recognized member of `options` for this rule — directly, via the
 *  count-word vocabulary, or via a per-rule alias group that also contains an option. */
function isRecognizedOption(value: string, options: string[], rule: MatchingRule): boolean {
  for (const o of options) {
    if (categoricalEquivalent(value, o)) return true;
  }
  // valueAliases groups synonymous values (e.g. ["C0G","NP0"]). The stated value is valid if it
  // shares a group with any option — so "NP0" is accepted wherever "C0G" is an option.
  for (const group of rule.valueAliases ?? []) {
    const groupHasValue = group.some((m) => categoricalEquivalent(m, value));
    if (!groupHasValue) continue;
    const groupHasOption = group.some((m) => options.some((o) => categoricalEquivalent(m, o)));
    if (groupHasOption) return true;
  }
  return false;
}

/**
 * Every answered categorical value that doesn't match its spec's closed option set, in the
 * logic table's rule order. Empty when the family is unknown or nothing conflicts.
 */
export function findValueConflicts(
  familyId: string,
  answered: Record<string, AnswerLike>,
): ValueConflict[] {
  const table = getLogicTable(familyId);
  if (!table) return []; // fail open — unknown family
  const ruleById = new Map(table.rules.map((r) => [r.attributeId, r]));

  const conflicts: ValueConflict[] = [];
  // Iterate in the table's rule order (stable), not object-key order, so the first conflict is
  // deterministic and matches how the guided flow orders questions.
  for (const rule of table.rules) {
    const answer = answered[rule.attributeId];
    if (!answer) continue;
    const value = answer.value;
    if (value == null || String(value).trim() === '') continue; // "any" / blank → not a conflict
    const options = parseSelectionOptions(rule);
    if (!options) continue; // no closed option set → nothing to validate against
    if (isRecognizedOption(String(value), options, rule)) continue;
    conflicts.push({
      attributeId: rule.attributeId,
      label: rule.attributeName,
      stated: String(value),
      options,
    });
  }
  return conflicts;
}

/** The first wrong-choice conflict (the guided flow clarifies one at a time), or null. */
export function firstValueConflict(
  familyId: string,
  answered: Record<string, AnswerLike>,
): ValueConflict | null {
  return findValueConflicts(familyId, answered)[0] ?? null;
}
