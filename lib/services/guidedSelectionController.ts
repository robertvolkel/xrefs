import type { OrchestratorMessage, SearchConstraint, ChoiceOption } from '../types';
import { resolveFamilyFromText, getLogicTable } from '../logicTables';
import { getSelectionQuestions } from './selectionQuestions';
import { nextGuidedStep, GuidedAnswerMap } from './guidedSelection';
import { buildGreenfieldQuery } from './searchConstraints';
import { looksLikeMpn, mentionsMpn } from './searchSummary';

/**
 * SYSTEM-DRIVEN guided part selection — the deterministic turn controller.
 *
 * When a user describes a NEW component need (no part number), the SYSTEM owns the
 * whole conversation: it asks the family's make-or-break specs in a FIXED order with
 * FIXED wording, and runs the search ITSELF once the required set is complete. The
 * model never phrases a question, never adds a step, never fires the search — so the
 * flow is byte-identical run-to-run and the "Fits your specs / Below spec" labels
 * always compute (the search carries the tracked specs as constraints).
 *
 * The model's only remaining job on these turns is OFFLINE: a temp-0 spec-extraction
 * call (injected as `parse`) that reads the conversation and reports which specs are
 * already answered. Everything that shapes the turn — which spec is next, choice vs
 * typed, when to search — is decided here in code.
 *
 * STATE WITHOUT A STATE CHANNEL: OrchestratorMessage carries only {role, content} —
 * there is no metadata field to flag "a guided selection is in progress". So the
 * controller's own question WORDING is the marker: `isSystemGuidedQuestion` recognizes
 * the fixed templates this file emits, which is how a continuation turn knows the user
 * is answering a system question (vs. continuing an unrelated chat).
 */

// ── Fixed question wording (reserved phrasings — also the in-progress marker) ──

/** Choice-spec question. Must stay matchable by CHOICE_Q_RE below.
 *  A choice spec's label carries its option list in a trailing parenthetical
 *  (e.g. "Output Type (Fixed / Adjustable / Tracking / Negative)") — strip it so the
 *  question doesn't restate the buttons ("Which output type do you need?"). */
export function renderChoiceQuestion(label: string): string {
  const clean = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return `Which ${clean.toLowerCase()} do you need?`;
}

/** Disambiguation question (which sub-family). Also matches CHOICE_Q_RE. */
export function renderDisambiguationQuestion(): string {
  return `Which type do you need?`;
}

/** Typed-value batch question. Must stay matchable by VALUES_Q_RE below. */
export function renderValuesQuestion(labels: string[]): string {
  const list = joinWithAnd(labels);
  return `What ${list} are you targeting? (Say "any" if one doesn't matter.)`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const CHOICE_Q_RE = /^Which .+ do you need\?$/;
const VALUES_Q_RE = /^What .+ are you targeting\?/;

/** True when `text` is one of the fixed questions this controller emits — the signal
 *  that we are mid-guided-selection (no message metadata channel exists). */
export function isSystemGuidedQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  return CHOICE_Q_RE.test(t) || VALUES_Q_RE.test(t);
}

// ── Ambiguous part-type heads (deterministic disambiguation) ──
// Only heads that DON'T resolve to a single family via resolveFamilyFromText. Labels
// MUST resolve back to their familyId (guard test pins this) so a clicked chip re-pins
// the family on the next turn.
interface AmbiguityOption { familyId: string; label: string }
const AMBIGUOUS_HEADS: Array<{ test: RegExp; options: AmbiguityOption[] }> = [
  {
    test: /\bregulators?\b/i,
    options: [
      { familyId: 'C1', label: 'LDO' },
      { familyId: 'C2', label: 'Switching regulator' },
    ],
  },
  {
    test: /\btransistors?\b/i,
    options: [
      { familyId: 'B5', label: 'MOSFET' },
      { familyId: 'B6', label: 'BJT' },
      { familyId: 'B9', label: 'JFET' },
    ],
  },
  {
    // Bare "capacitor" spans five common families. A qualified name ("tantalum
    // capacitor", "MLCC") resolves to its family in pinFamily BEFORE this runs, so
    // only the unqualified word reaches here. Labels must resolve back to their id.
    test: /\bcapacitors?\b/i,
    options: [
      { familyId: '12', label: 'MLCC' },
      { familyId: '58', label: 'Aluminum electrolytic' },
      { familyId: '59', label: 'Tantalum' },
      { familyId: '64', label: 'Film' },
      { familyId: '60', label: 'Aluminum polymer' },
    ],
  },
];

export function detectAmbiguity(text: string): AmbiguityOption[] | null {
  for (const head of AMBIGUOUS_HEADS) {
    if (head.test.test(text)) return head.options;
  }
  return null;
}

// ── Entry heuristics (only gate the FIRST turn; continuation is unconditional) ──

const INTENT_RE = /\b(need|want|looking|find|recommend|suggest|pick|choos|select|sourc|require|build|design|get me|show me|help me|after a|after an)\b/i;
const THEORY_RE = /\b(difference|differ|versus|vs\b|what is|what's|whats|how (do|does|to)|why|explain|tell me about|compare|pros|cons|when (should|do)|which is better)\b/i;

export function hasSelectionIntent(text: string): boolean {
  return INTENT_RE.test(text);
}
export function isLikelyTheory(text: string): boolean {
  return THEORY_RE.test(text);
}
/** A bare part-type drop like "NTC thermistor" — short, no question, no theory cue. */
function isBareNounPhrase(text: string): boolean {
  const t = text.trim();
  if (t.includes('?')) return false;
  if (t.split(/\s+/).length > 6) return false;
  return !isLikelyTheory(t);
}

// ── Family pinning ──

interface Pinned { familyId: string; partType: string }

/** The active family = the NEWEST user message that names a specific supported family.
 *  Mid-flow spec answers ("10 Ω, 3500K") don't resolve, so the family stays pinned to
 *  the original part-type mention; naming a new type re-pins (a pivot). */
function pinFamily(messages: OrchestratorMessage[]): Pinned | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const familyId = resolveFamilyFromText(m.content);
    if (familyId && getSelectionQuestions(familyId)) {
      // Use the clean family name as the search part-type (deterministic keywords),
      // not the raw user sentence ("i need an…" would pollute the query).
      const partType = getLogicTable(familyId)?.familyName ?? m.content.trim();
      return { familyId, partType };
    }
  }
  return null;
}

// ── The decision ──

export type GuidedTurnDecision =
  | { kind: 'ask'; message: string; choices?: ChoiceOption[] }
  | { kind: 'search'; query: string; partType: string; constraints: SearchConstraint[] };

/**
 * Decide whether the SYSTEM should own this turn, and if so what to do. Returns null
 * to DEFER to the normal LLM path (MPN lookups, theory questions, manufacturer
 * questions, comparisons, and genuinely-unknown part types all fall through).
 *
 * `parse(familyId)` is the injected temp-0 spec-extractor (the only model call on a
 * guided turn); kept as a parameter so the decision logic is pure and unit-testable.
 */
export async function decideGuidedTurn(
  messages: OrchestratorMessage[],
  parse: (familyId: string) => Promise<GuidedAnswerMap>,
  hasOnScreenContext = false,
): Promise<GuidedTurnDecision | null> {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const userText = (lastUser?.content ?? '').trim();
  if (!userText) return null;

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const inProgress = !!lastAssistant && isSystemGuidedQuestion(lastAssistant.content);

  // MPN gate — ONLY for a FRESH turn, and ONLY when the message doesn't name a part
  // type. A part NUMBER lookup ("BC847B") defers to normal search. But `looksLikeMpn`
  // false-positives on ordinary type words ("Tantalum", "MLCC", "Film", "Fixed"), so
  // a fresh "Tantalum pls" would wrongly bail — unless we first check it names a
  // family / known ambiguous head, in which case it's a TYPE request, not a lookup.
  // (A continuation answer is exempt anyway via !inProgress — its family is anchored
  // from the original part-type message.)
  const namesPartType = !!resolveFamilyFromText(userText) || !!detectAmbiguity(userText);
  if (!inProgress && !namesPartType && (looksLikeMpn(userText) || mentionsMpn(userText))) return null;

  // Only ENTER a fresh guided selection from a clean screen. Once cards/recs/a source
  // part are showing, post-results turns (refine, filter, compare, pivot, a 2nd
  // selection) belong to the LLM — hijacking them would break those flows. A
  // continuation (we asked a question, no results yet) is unaffected: inProgress is
  // true and there's no on-screen context mid-questions.
  if (!inProgress && hasOnScreenContext) return null;

  const pinned = pinFamily(messages);

  // No specific family yet → only an ENTRY turn may disambiguate a known-ambiguous head.
  if (!pinned) {
    if (inProgress) return null; // safety: can't be mid-flow without a pinned family
    const options = detectAmbiguity(userText);
    if (options && hasSelectionIntent(userText)) {
      return {
        kind: 'ask',
        message: renderDisambiguationQuestion(),
        choices: options.map(o => ({ id: o.familyId, label: o.label })),
      };
    }
    return null; // unknown / theory → LLM
  }

  // Entry gate (continuation is unconditional — the user is answering our question):
  // take over a fresh turn only when it reads as a selection request, not theory.
  if (!inProgress) {
    if (isLikelyTheory(userText) && !hasSelectionIntent(userText)) return null;
    if (!hasSelectionIntent(userText) && !isBareNounPhrase(userText)) return null;
  }

  const { familyId, partType } = pinned;
  const answered = await parse(familyId);
  const step = nextGuidedStep(familyId, answered);
  if (!step) return null;

  if (step.type === 'ask_choice') {
    return {
      kind: 'ask',
      message: renderChoiceQuestion(step.attr.label),
      choices: (step.attr.options ?? []).map(o => ({ id: o, label: o })),
    };
  }
  if (step.type === 'ask_values') {
    return { kind: 'ask', message: renderValuesQuestion(step.attrs.map(a => a.label)) };
  }
  // step.type === 'search' — required set complete. The system runs the search with
  // the tracked specs attached so off-spec parts sink and the fit labels compute.
  return {
    kind: 'search',
    query: buildGreenfieldQuery(partType, step.constraints),
    partType,
    constraints: step.constraints,
  };
}
