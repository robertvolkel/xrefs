import type { SearchConstraint, SelectionAttr } from '../types';
import { getSelectionQuestions } from './selectionQuestions';

/**
 * SYSTEM-DRIVEN guided part selection — the deterministic decision core.
 *
 * The system (not the model) owns: which spec to ask next, whether it's a button
 * choice or a typed value, and when the required checklist is complete enough to
 * search. The model only relays one pre-decided step and parses the user's answer.
 *
 * Turn-shaping rule (fixes the live-test failures):
 *   - CHOICE specs ask ONE per turn (each needs its own button group; the chat can
 *     render only one group per message, so two choice-specs can't share a turn and
 *     a choice-spec can't share a turn with unrelated prose).
 *   - VALUE specs (typed) carry no buttons, so all remaining value specs are asked
 *     together in ONE prose turn.
 *   - Order: all choice-specs first (one per turn), then the value batch, then search.
 *
 * This guarantees: buttons always match their question, and the flow converges
 * (the checklist is system-held, so it can't loop or re-ask).
 */

/** One answer the user has supplied. `value: null` = user said "any / not sure". */
export interface GuidedAnswer {
  value: string | number | null;
  unit?: string;
}

/** answered[attributeId] present ⇒ the spec has been asked and resolved. */
export type GuidedAnswerMap = Record<string, GuidedAnswer>;

export type GuidedStep =
  | { type: 'ask_choice'; attr: SelectionAttr; remaining: number }
  | { type: 'ask_values'; attrs: SelectionAttr[] }
  | { type: 'search'; constraints: SearchConstraint[] };

function isAnswered(map: GuidedAnswerMap, attributeId: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, attributeId);
}

function hasValue(answer: GuidedAnswer | undefined): boolean {
  return !!answer && answer.value != null && String(answer.value).trim() !== '';
}

/**
 * Decide the next step for a resolved family given what's been answered so far.
 * Pure and deterministic — same inputs always yield the same step.
 * Returns null only for an unknown/unsupported family (caller falls back).
 */
export function nextGuidedStep(familyId: string, answered: GuidedAnswerMap): GuidedStep | null {
  const questions = getSelectionQuestions(familyId);
  if (!questions) return null;

  const unanswered = questions.tier2.filter(a => !isAnswered(answered, a.attributeId));

  // 1) Ask choice-specs one at a time (each needs its own button group).
  const unansweredChoices = unanswered.filter(a => a.input === 'choice');
  if (unansweredChoices.length > 0) {
    return { type: 'ask_choice', attr: unansweredChoices[0], remaining: unanswered.length };
  }

  // 2) Then ask all remaining typed-value specs together in one prose turn.
  const unansweredValues = unanswered.filter(a => a.input === 'value');
  if (unansweredValues.length > 0) {
    return { type: 'ask_values', attrs: unansweredValues };
  }

  // 3) Tier 2 complete → search. Only specs with a real value become constraints;
  //    "any / not sure" answers (value null) are intentionally dropped so they never
  //    block or over-narrow the search.
  const constraints: SearchConstraint[] = questions.tier2
    .filter(a => hasValue(answered[a.attributeId]))
    .map(a => {
      const ans = answered[a.attributeId];
      const c: SearchConstraint = { attribute: a.attributeId, value: ans.value as string | number };
      if (ans.unit) c.unit = ans.unit;
      return c;
    });
  return { type: 'search', constraints };
}
