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

/** The NARROWING question — asked after a search that came back too big to be useful, with the
 *  count stated so the user can see why they're being asked. Must stay matchable by NARROW_Q_RE.
 *  The "any" escape is explicit: the user is never trapped behind a question they don't care
 *  about, which is the whole difference between narrowing and interrogating. */
export function renderNarrowingQuestion(label: string, poolSize: number): string {
  const clean = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return `That gives ${poolSize} parts — more than is useful. Which ${clean.toLowerCase()} do you need? (Say "any" to see them all.)`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const CHOICE_Q_RE = /^Which .+ do you need\?$/;
const VALUES_Q_RE = /^What .+ are you targeting\?/;
const NARROW_Q_RE = /^That gives \d+ parts — more than is useful\. Which .+ do you need\?/;

/** True when `text` is one of the fixed questions this controller emits — the signal
 *  that we are mid-guided-selection (no message metadata channel exists). The narrowing
 *  question must be in here: it is asked INSTEAD of showing results, so the user's next message
 *  is answering us and the turn after it has to be recognized as a continuation. */
export function isSystemGuidedQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  return CHOICE_Q_RE.test(t) || VALUES_Q_RE.test(t) || NARROW_Q_RE.test(t);
}

/** A SPEC question (a per-attribute choice/values question), as opposed to the
 *  disambiguation question. The user message that ANSWERS a spec question is a spec
 *  answer — a part-type noun inside it ("16V, for an LDO") is incidental and must not
 *  re-pin the family. The disambiguation answer, by contrast, DOES name the family. */
function isSpecQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  return isSystemGuidedQuestion(t) && t !== renderDisambiguationQuestion();
}

/** The nearest assistant message before index `beforeIdx` (the question a user message
 *  at `beforeIdx` is answering), or null. */
function prevAssistant(messages: OrchestratorMessage[], beforeIdx: number): OrchestratorMessage | null {
  for (let i = beforeIdx - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i];
  }
  return null;
}

/** The user message that STARTED the current guided run — the one just before the
 *  earliest system question in the trailing run of system questions. Used to recover a
 *  classifier-entered family on a continuation turn (the spec answer doesn't name a type,
 *  so keyword-pinning can't). Returns null when there is no trailing guided run. */
function findGuidedEntryUserText(messages: OrchestratorMessage[]): string | null {
  let firstSysQIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    if (isSystemGuidedQuestion(messages[i].content)) firstSysQIdx = i;
    else break; // a non-system assistant message ends the trailing guided run
  }
  if (firstSysQIdx <= 0) return null;
  for (let i = firstSysQIdx - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return null;
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
    // only the unqualified word reaches here.
    test: /\bcapacitors?\b/i,
    options: [
      { familyId: '12', label: 'MLCC' },
      { familyId: '58', label: 'Aluminum electrolytic' },
      { familyId: '59', label: 'Tantalum' },
      { familyId: '64', label: 'Film' },
      { familyId: '60', label: 'Aluminum polymer' },
    ],
  },
  {
    // Bare "diode". B2 Schottky + B4 TVS are VARIANT families not reachable via
    // resolveFamilyFromText, so the chip labels re-pin through LABEL_TO_FAMILY below.
    test: /\bdiodes?\b/i,
    options: [
      { familyId: 'B1', label: 'Rectifier' },
      { familyId: 'B2', label: 'Schottky' },
      { familyId: 'B3', label: 'Zener' },
      { familyId: 'B4', label: 'TVS' },
    ],
  },
];

export function detectAmbiguity(text: string): AmbiguityOption[] | null {
  for (const head of AMBIGUOUS_HEADS) {
    if (head.test.test(text)) return head.options;
  }
  return null;
}

// Reverse index of every disambiguation chip label → its family, so a clicked chip
// re-pins even when the label doesn't resolve through resolveFamilyFromText (variant
// families like B2 Schottky / B4 TVS). Built once from AMBIGUOUS_HEADS — the single
// source of truth — so adding a head can't drift from its label resolution.
const LABEL_TO_FAMILY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const head of AMBIGUOUS_HEADS) for (const o of head.options) m[o.label.toLowerCase()] = o.familyId;
  return m;
})();

/** Resolve a part-type term to a family: a disambiguation chip label first (covers
 *  variant families), then the general keyword resolver. */
export function resolvePartTypeFamily(text: string): string | null {
  return LABEL_TO_FAMILY[text.trim().toLowerCase()] ?? resolveFamilyFromText(text);
}

// ── Entry heuristics (only gate the FIRST turn; continuation is unconditional) ──

// Inflection-tolerant on purpose: a bare `\b` AFTER a stem sits BETWEEN two letters
// (e.g. /choos\b/ never matches "choosing" — `s`→`i` is not a word boundary), so each
// verb carries its real suffix set. Suffix groups stay precise to avoid false friends
// ("needle" ⊄ need, "designate" ⊄ design).
const INTENT_RE = /\b(need(?:s|ed|ing)?|want(?:s|ed|ing)?|look(?:ing|s)?|find(?:s|ing)?|recommend(?:s|ed|ing|ation)?|suggest(?:s|ed|ing|ion)?|pick(?:s|ed|ing)?|choos(?:e|es|ing)|select(?:s|ed|ing|ion)?|sourc(?:e|es|ed|ing)|requir(?:e|es|ed|ing|ement|ements)?|build(?:s|ing)?|design(?:s|ed|ing)?|get me|show me|help me|after an?)\b/i;
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

/** The active family = the NEWEST type-declaring user message (the flow entry, or a
 *  disambiguation answer). SPEC answers are skipped: a part-type noun inside "16V, for an
 *  LDO" is incidental and must not re-pin the family mid-flow — so the family stays
 *  anchored to where it was actually declared. (A spec answer is a user message whose
 *  immediately-preceding assistant message is a spec question; the disambiguation answer
 *  is preceded by the disambiguation question, so it still pins.) */
function pinFamily(messages: OrchestratorMessage[]): Pinned | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const prev = prevAssistant(messages, i);
    if (prev && isSpecQuestion(prev.content)) continue; // a spec ANSWER — don't re-pin from it
    const familyId = resolvePartTypeFamily(m.content);
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
  | {
      kind: 'search';
      query: string;
      partType: string;
      familyId: string;
      constraints: SearchConstraint[];
      /** Every spec the user has addressed, INCLUDING ones waived with "any" (which carry no
       *  value and so never appear in `constraints`). The search uses it to decide whether a
       *  narrowing question is still worth asking — and, because a narrowing ANSWER lands here
       *  too, it is what guarantees the flow terminates instead of asking forever. */
      answeredSpecIds: string[];
    };

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
  classify?: (text: string) => Promise<string | null>,
): Promise<GuidedTurnDecision | null> {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const userText = (lastUser?.content ?? '').trim();
  if (!userText) return null;

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const inProgress = !!lastAssistant && isSystemGuidedQuestion(lastAssistant.content);

  // ESCAPE 1 — a specific part NUMBER referenced anywhere defers to the normal
  // search/lookup path, even mid-flow ("actually look up BC847B", "an LDO like AMS1117").
  // `mentionsMpn` excludes value/range/size/package/qualification tokens and never fires
  // on a spec answer ("10kΩ, 3500K, 0805"), so this is safe to run unconditionally.
  if (mentionsMpn(userText)) return null;

  // ESCAPE 2 — a theory/explanation question mid-flow ("what's a B-value?") defers so the
  // LLM can answer it; the user can restate their spec to resume.
  if (inProgress && isLikelyTheory(userText)) return null;

  // MPN gate (whole-message heuristic) — ONLY for a FRESH turn that does NOT name a part
  // type. `looksLikeMpn` false-positives on ordinary type words ("Tantalum", "MLCC",
  // "Fixed"), so a part-type message is exempt (we want to pin its family, not bail to an
  // MPN lookup). A real part NUMBER was already handled by ESCAPE 1 above.
  const namesPartType = !!resolvePartTypeFamily(userText) || !!detectAmbiguity(userText);
  if (!inProgress && !namesPartType && looksLikeMpn(userText)) return null;

  // Only ENTER a fresh guided selection from a clean screen. Once cards/recs/a source
  // part are showing, post-results turns (refine, filter, compare, pivot, a 2nd
  // selection) belong to the LLM — hijacking them would break those flows. A
  // continuation (we asked a question, no results yet) is unaffected: inProgress is
  // true and there's no on-screen context mid-questions.
  if (!inProgress && hasOnScreenContext) return null;

  let pinned = pinFamily(messages);
  let viaClassifier = false;

  // No specific family yet (deterministic recognizer missed) → disambiguate a curated
  // supertype, else recover via the registry-backed classifier.
  if (!pinned) {
    // ENTRY disambiguation: a curated ambiguous supertype ("regulator", "capacitor",
    // "diode", "transistor") shows sub-family chips BEFORE any single-family guess.
    // Fires whenever this reads as a sourcing turn (explicit intent OR a bare type noun)
    // and is not a theory question — so a bare "regulator" disambiguates too (the old
    // intent-only gate let a bare supertype fall through to a single-family classifier
    // guess). Continuation never reaches here (a continuation has a pinned family, or the
    // classifier-recovery below supplies one).
    if (!inProgress) {
      const options = detectAmbiguity(userText);
      if (options && !isLikelyTheory(userText) && (hasSelectionIntent(userText) || isBareNounPhrase(userText))) {
        return {
          kind: 'ask',
          message: renderDisambiguationQuestion(),
          choices: options.map(o => ({ id: o.familyId, label: o.label })),
        };
      }
    }
    // Classifier: the deterministic recognizer doesn't cover every phrasing ("low-dropout
    // reg", "a schottky", "an op amp"). The bounded, registry-backed classifier returns a
    // real familyId or null, so it recognizes the long tail without authoring prose. On a
    // FRESH turn classify the user's text; on a CONTINUATION of a classifier-entered flow
    // (the spec answer doesn't name a type, so keyword-pinning failed) re-classify the
    // flow's ENTRY message to recover the family — without this, turn 2 of a long-tail
    // flow would abandon to the LLM.
    if (classify) {
      const target = inProgress ? (findGuidedEntryUserText(messages) ?? userText) : userText;
      const gateOk = inProgress || (!isLikelyTheory(target) && (hasSelectionIntent(target) || isBareNounPhrase(target)));
      if (gateOk) {
        const fam = await classify(target);
        if (fam && getSelectionQuestions(fam)) {
          pinned = { familyId: fam, partType: getLogicTable(fam)?.familyName ?? target.trim() };
          viaClassifier = true;
        }
      }
    }
    if (!pinned) return null; // genuinely unknown / not a sourcing request → LLM
  }

  // Entry gate (continuation is unconditional — the user is answering our question;
  // skipped too when the classifier already judged this a sourcing request). Theory wins
  // on a fresh entry even when intent is also present ("I need help understanding the
  // difference between an LDO and a switching regulator").
  if (!inProgress && !viaClassifier) {
    if (isLikelyTheory(userText)) return null;
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
  // familyId is passed AUTHORITATIVELY: the verbose family display name is a poor keyword
  // (Digikey returns gate-driver ICs for "MOSFETs — N-Channel & P-Channel"), so the search
  // scopes the pool + the scoring family to this id rather than re-deriving from the string.
  return {
    kind: 'search',
    query: buildGreenfieldQuery(partType, step.constraints),
    partType,
    familyId,
    constraints: step.constraints,
    answeredSpecIds: Object.keys(answered),
  };
}
