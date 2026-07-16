import type { PartAttributes, SearchConstraint, SelectionAttr } from '../types';
import { getLogicTable } from '../logicTables';
import { getSelectionQuestions } from './selectionQuestions';
import { leadingMagnitudeToBaseSI } from './searchConstraints';

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
  /** WHICH DIRECTION the number binds in, when the user stated one ("at least 300", "no more
   *  than 1.2mm"). Mirrors `SearchConstraint.bound` and is passed straight through.
   *
   *  ⚠️ This was MISSING, and the omission was invisible. `SearchConstraint.bound` existed and
   *  `parseStatedBands` already read it — but the GUIDED extractor had no field to put it in, so on
   *  a guided turn "gain of at least 300" arrived as a bare `300`, the direction was lost, and the
   *  requirement did nothing at all. The catalogue was never filtered by gain and the high-gain
   *  parts never surfaced. The other extractor (`EXTRACT_SPECS_TOOL`) had the field; this one did
   *  not, so the bug depended on WHICH path a turn happened to take. Absent still means "the user
   *  gave a bare number and we do not know which way it binds" — leave the spec uncompared rather
   *  than invent a direction. */
  bound?: 'min' | 'max';
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
  //
  //    Constraints come from EVERYTHING the user answered — not just the specs we asked
  //    about. The ask-list and the hear-list are different things, and conflating them is
  //    why "hFE 200-400" was thrown in the bin: gain is a narrowing spec, so it was outside
  //    the required set, so the search never saw it even though the user had SAID it. A spec
  //    being one we don't ASK about never meant we should IGNORE it when volunteered.
  return { type: 'search', constraints: buildConstraints(answered) };
}

/** Every answered spec with a real value, as search constraints. Keys are already real
 *  attributeIds (the extractor's enum is the family's own rule list), so no term resolution
 *  is needed and none can go wrong. */
function buildConstraints(answered: GuidedAnswerMap): SearchConstraint[] {
  const out: SearchConstraint[] = [];
  for (const [attributeId, ans] of Object.entries(answered)) {
    if (!hasValue(ans)) continue;
    const c: SearchConstraint = { attribute: attributeId, value: ans.value as string | number };
    if (ans.unit) c.unit = ans.unit;
    if (ans.bound) c.bound = ans.bound;   // "at least 300" must stay a floor, not become a bare 300
    out.push(c);
  }
  return out;
}

// ── The narrowing step ────────────────────────────────────────
//
// A search that comes back with 50 parts has not answered the user's question. The doc
// (docs/min_attr_sets.md) has always specified a second tier of specs to ask "after Tier 2 is
// satisfied but before presenting results… when the result set exceeds ~20 candidates". It was
// authored for all 43 families and then read by NOTHING — grep-verified, zero runtime consumers.
// This is that step.
//
// WHICH question to ask is decided by the DATA, not by a hand-ranked list per family:
//
//   • the TIER decides what we are ALLOWED to ask — that is a judgement about whether a human
//     can answer it ("what junction-to-case thermal resistance do you need?" is not a question
//     anyone can answer), and it is recorded by a human in the document.
//   • the POOL decides which of those we SHOULD ask — the one that actually splits the parts in
//     front of us. A question that cannot divide the candidates is noise, no matter how
//     important the spec is in the abstract.
//
// Measured on the live BJT pool: gain scores 0.90, saturation voltage 0.85, transition frequency
// 0.81 — so the system asks about GAIN, which is exactly the right question, with no B6-specific
// code anywhere. AEC qualification looks like a great splitter (0.89) but only 26% of the pool
// carries the field at all, which is why coverage is a gate and not a tiebreak.

/**
 * ⚠️ TEMPORARILY OFF (2026-07-15). The narrowing step ships with known bugs — its numeric range
 * buttons can render as unreadable base-SI/scientific-notation numbers or get dropped entirely by
 * the choice sanitizer, and the loop lacks a deterministic stop. So it is gated OFF until repaired.
 *
 * With this false, a too-big result set is simply presented in full (the behaviour before the step
 * existed); the narrowing logic below stays intact and unit-tested, so re-enabling is one flip.
 * The gate is at the single CALLER (partDataService searchParts) — NOT inside pickNarrowingQuestion
 * — precisely so the logic tests keep exercising the picker. Repair tracked in docs/BACKLOG.md under
 * "Chat Flow → Narrowing step". Typed `boolean` (not the literal `false`) so flipping it needs no
 * other edit and nothing reads as unreachable.
 */
export const NARROWING_ENABLED: boolean = false;

/** Below this, the result set is already useful — asking another question is just friction. */
const MIN_POOL_TO_NARROW = 20;
/** HARD CAP. The documented failure mode of this product is "never stops asking" (27 questions
 *  before showing a MOSFET). One good discriminating question takes 50 parts to a shortlist; a
 *  second has sharply diminishing returns and doubles the interrogation risk. */
const MAX_NARROWING_QUESTIONS = 1;
/** A spec most of the pool doesn't carry can't sort it — and would quietly hide every part with
 *  no value for it. */
const MIN_COVERAGE = 0.5;
/**
 * Normalized entropy floor: below this the pool is so lopsided that the question barely divides
 * it, and asking it is just friction.
 *
 * ⚠️ SPLIT QUALITY IS A GATE, NOT A RANKING. It answers "can this question separate these parts
 * at all?" — a fact about the data. It does NOT answer "which question is most useful to a person
 * choosing this part?" — a judgement about electronics. Using it to RANK looked reasonable and is
 * wrong, and the measurement says so: on the same family and the same query, gain scored 0.90 and
 * saturation voltage 0.85 when read from fully-enriched attributes, but 0.71 and 0.92 when read
 * from the lighter projection the vetting pass actually scores. THE ORDER FLIPS depending on which
 * enrichment path ran. A question chosen that way changes based on plumbing the user cannot see.
 *
 * So the data gets a veto and the document gets the vote: any spec that genuinely splits the pool
 * is a legitimate question, and among those we ask the one a human ranked highest — which is what
 * `tier3` order already carries, straight out of docs/min_attr_sets.md.
 */
const MIN_SPLIT_QUALITY = 0.35;
/** Buckets a numeric spec's observed range is divided into — both to MEASURE the split and to
 *  OFFER it (the buckets become the buttons). Four keeps the choice legible. */
const NUM_BUCKETS = 4;
/** Cap on buttons for a CATEGORICAL narrowing spec (a numeric one is capped by NUM_BUCKETS). */
const MAX_CHOICE_OPTIONS = 6;

export interface NarrowingQuestion {
  attributeId: string;
  label: string;
  /** Always a closed set: a numeric spec is offered as value-RANGE buttons drawn from the pool,
   *  never a free-text box. A typed "200" would be ambiguous (at least 200? about 200?) and a
   *  band whose direction we cannot know is one we refuse to invent — so we ask in a form that
   *  can only produce an explicit range. See statedBands.ts. */
  options: string[];
  poolSize: number;
}

/** Normalized Shannon entropy of a bucket distribution: 1 = an even split (maximally
 *  informative), 0 = every part in one bucket (a useless question). */
function normalizedEntropy(buckets: number[]): number {
  const total = buckets.reduce((a, b) => a + b, 0);
  const used = buckets.filter(n => n > 0);
  if (total === 0 || used.length < 2) return 0;
  let h = 0;
  for (const n of used) {
    const p = n / total;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(used.length);
}

/** Round to 2 significant figures for a bucket LABEL, as a string.
 *
 *  Returns a string, not a number, on purpose: these land straight on a button a user reads.
 *  Arithmetic rounding reintroduces float noise at the last step — `Math.round(0.7/0.01)*0.01`
 *  is `0.7000000000000001`, and `Math.round(2.9/0.1)*0.1` is `2.9000000000000004`, both of which
 *  would render verbatim. `toPrecision` formats the decimal representation instead, so the label
 *  is what it says it is. */
function sig2(n: number): string {
  if (n === 0 || !Number.isFinite(n)) return '0';
  return String(Number(n.toPrecision(2)));
}

/** Split a numeric spec's observed values into equal-WIDTH buckets — deliberately not
 *  equal-count. Equal-count quantiles would report a perfect split for every spec by
 *  construction, which is precisely the signal we are trying to measure. Log-spaced when all
 *  values are positive (electronics specs span decades), linear otherwise (temperatures go
 *  negative). Returns the bucket counts and their human range labels. */
function bucketNumeric(values: number[]): { counts: number[]; labels: string[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!(hi > lo)) return { counts: [values.length], labels: [] }; // no spread → entropy 0 → skipped
  const useLog = lo > 0;
  const tx = (v: number) => (useLog ? Math.log10(v) : v);
  const inv = (v: number) => (useLog ? Math.pow(10, v) : v);
  const tLo = tx(lo);
  const tHi = tx(hi);
  const width = (tHi - tLo) / NUM_BUCKETS;

  const counts = new Array<number>(NUM_BUCKETS).fill(0);
  for (const v of values) {
    const i = Math.min(NUM_BUCKETS - 1, Math.floor((tx(v) - tLo) / width));
    counts[i]++;
  }
  const labels = counts.map((_, i) => {
    const a = sig2(inv(tLo + i * width));
    const b = sig2(inv(tLo + (i + 1) * width));
    return `${a} - ${b}`;
  });
  return { counts, labels };
}

/**
 * Pick the one narrowing question worth asking about this candidate pool, or null to just show
 * the results. Pure and deterministic.
 *
 * `answeredIds` is every spec the user has already addressed — INCLUDING ones they waived with
 * "any". It doubles as the convergence guarantee: a narrowing answer lands in it, so the count of
 * answered narrowing specs is the number of narrowing questions already asked. No state channel,
 * no counter to get out of sync.
 */
export function pickNarrowingQuestion(
  familyId: string,
  answeredIds: Set<string>,
  candidates: PartAttributes[],
): NarrowingQuestion | null {
  if (candidates.length < MIN_POOL_TO_NARROW) return null;
  const questions = getSelectionQuestions(familyId);
  const table = getLogicTable(familyId);
  if (!questions || !table) return null;

  const asked = questions.tier3.filter(a => answeredIds.has(a.attributeId)).length;
  if (asked >= MAX_NARROWING_QUESTIONS) return null;

  type Scored = NarrowingQuestion & { quality: number; docIndex: number };
  const scored: Scored[] = [];

  for (const [docIndex, attr] of questions.tier3.entries()) {
    if (answeredIds.has(attr.attributeId)) continue;
    const raw = candidates
      .map(c => c.parameters.find(p => p.parameterId === attr.attributeId)?.value)
      .filter((v): v is string => !!v && String(v).trim() !== '');
    if (raw.length / candidates.length < MIN_COVERAGE) continue;

    let counts: number[];
    let options: string[];
    if (attr.input === 'choice') {
      const byValue = new Map<string, number>();
      for (const v of raw) byValue.set(v.trim(), (byValue.get(v.trim()) ?? 0) + 1);
      if (byValue.size < 2) continue;
      // Cap the buttons. A numeric spec is bounded to NUM_BUCKETS by construction; a categorical
      // one is bounded by whatever the catalog happens to contain, which can be 25 package codes —
      // an unusable wall of chips. Keep the most common (the pool is already sorted by count), so
      // the options shown are the ones most of the parts actually are.
      const sortedByFreq = [...byValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHOICE_OPTIONS);
      counts = sortedByFreq.map(([, n]) => n);
      options = sortedByFreq.map(([v]) => v);
    } else {
      // The value STRING, never numericValue — see leadingMagnitudeToBaseSI.
      const nums = raw.map(v => leadingMagnitudeToBaseSI(v)).filter((n): n is number => n != null);
      if (nums.length / candidates.length < MIN_COVERAGE) continue;
      const b = bucketNumeric(nums);
      if (b.labels.length < 2) continue;
      counts = b.counts;
      options = b.labels;
    }

    const quality = normalizedEntropy(counts);
    if (quality < MIN_SPLIT_QUALITY) continue;
    // Drop empty buckets so we never offer a range no part in the pool actually occupies.
    const live = options.filter((_, i) => counts[i] > 0);
    if (live.length < 2) continue;

    scored.push({
      attributeId: attr.attributeId,
      label: attr.label,
      options: live,
      poolSize: candidates.length,
      quality,
      docIndex,
    });
  }

  if (scored.length === 0) return null;
  // Everything still standing genuinely splits the pool (the data's veto has been applied above).
  // Among those, ask the one the DOCUMENT ranks first — `tier3` preserves the order of
  // docs/min_attr_sets.md, so this is a human's judgement about what matters for this family, not
  // an entropy score that moves when an enrichment path changes.
  scored.sort((a, b) => a.docIndex - b.docIndex);
  const { attributeId, label, options, poolSize } = scored[0];
  return { attributeId, label, options, poolSize };
}
