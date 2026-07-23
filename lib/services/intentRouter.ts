/**
 * Chat intent router — decides WHICH grounded context bundle the orchestrator should
 * inject for a turn. INPUT-ONLY and deterministic-first (see the chat redesign plan,
 * Phase 1 Track A).
 *
 * This is deliberately NOT a tool selector and NOT a gate: it never forces a tool, never
 * suppresses output, and never rewrites the user's turn. It only labels the turn so the
 * orchestrator can add the right grounded material (e.g. `summarizeFamilyKnowledge` for a
 * theory/selection turn, or the manufacturer claim-discipline reminder for a maker turn).
 * Because the only consequence of a route is which additive context block is present, a
 * MIS-ROUTE is a soft failure — the model still has every tool and all the standard
 * summaries; it just may lack (or carry an unhelpful) extra bundle. That property is what
 * lets the router be a cheap deterministic classifier instead of an LLM call on every turn.
 *
 * Composition over invention: it reuses the predicates the codebase already trusts —
 * `mentionsMpn`/`looksLikeMpn` (MPN detection), `resolvePartTypeFamily`/`resolveFamilyFromText`
 * (family recognition), `hasSelectionIntent`/`isLikelyTheory` (guided-selection gates), and
 * `namesComponentType` (component-vocabulary). The only net-new logic is the small set of
 * cue regexes below and the first-match-wins precedence.
 *
 * Pure + synchronous by default (`routeIntent`), so it is fully unit-testable. An optional
 * async wrapper (`routeIntentWithClassifier`) fills the family ONLY when deterministic
 * recognition missed AND the routed intent actually consumes a family bundle — mirroring the
 * `classify?` injection pattern in `decideGuidedTurn`, and keeping the LLM out of the common
 * path.
 */

import { looksLikeMpn, mentionsMpn } from './searchSummary';
import { resolveFamilyFromText } from '../logicTables';
import {
  hasSelectionIntent,
  isLikelyTheory,
  resolvePartTypeFamily,
} from './guidedSelectionController';
import { namesComponentType } from './componentVocabulary';

/**
 * The turn's intent, used to pick a context bundle:
 * - `part-lookup`         — a specific part number is referenced (mentionsMpn / bare MPN).
 * - `comparison`          — explicitly comparing parts/options ("X vs Y", "difference between").
 * - `discovery`           — "which/who manufacturers make <component type>" (Decision #258 grain).
 * - `mfr-question`        — centered on a manufacturer, not a component type ("tell me about Murata").
 * - `selection`           — greenfield sourcing ("I need a 25 V MLCC"), no MPN.
 * - `parametric-question` — asks about attribute VALUES that exist ("what voltages do MLCCs come in").
 * - `theory`              — general concept Q&A ("how does an MLCC work", "what is an LDO").
 * - `unknown`             — no deterministic signal; orchestrator injects nothing extra.
 */
export type ChatIntent =
  | 'part-lookup'
  | 'comparison'
  | 'discovery'
  | 'mfr-question'
  | 'selection'
  | 'parametric-question'
  | 'theory'
  | 'unknown';

export interface IntentRoute {
  intent: ChatIntent;
  /** A single component family the bundle can be built for, when one resolves; else null. */
  familyId: string | null;
  /** Which predicates fired — observability and a stable anchor for mutation tests. */
  signals: string[];
}

// ── Cue regexes (the only net-new lexical logic) ─────────────────────────────

/** Explicit comparison — wins even over an MPN mention ("compare BC847 vs BC848"). */
const COMPARE_RE =
  /\b(compare|comparison|versus|vs\.?|difference between|differences between|better than|pros and cons|trade-?offs?|which (?:is|one is) (?:better|best))\b/i;

/** Manufacturer-centric cue. Splits into `discovery` vs `mfr-question` on whether the turn
 *  also names a component TYPE (a plural "which makers make X" is discovery; a bare maker
 *  reference is an mfr-question). */
const MFR_CUE_RE =
  /\b(manufacturers?|makers?|suppliers?|vendors?|brands?|who makes|who make|who manufactures?|which compan(?:y|ies)|what compan(?:y|ies))\b/i;

/** A question form — a leading/embedded interrogative or a trailing '?'. */
const QUESTION_RE =
  /(\?|\b(what|which|how|why|where|when|is there|are there|does|do|can|could|should)\b)/i;

/** Attribute nouns that make a QUESTION a parametric-value question ("what VOLTAGES exist"). */
const PARAM_ATTR_RE =
  /\b(voltages?|currents?|amperages?|packages?|footprints?|dielectrics?|tolerances?|ratings?|frequenc(?:y|ies)|temperatures?|capacitances?|resistances?|inductances?|wattages?|pinouts?|specs?|specifications?|parameters?)\b/i;

// ── Family resolution (deterministic) ────────────────────────────────────────

interface ResolvedFamily {
  familyId: string | null;
  via: 'partType' | 'familyFromText' | 'none';
}

/** Deterministic family recognition: the registry-backed chip-label recognizer first (covers
 *  variant families + ambiguous-head disambiguation), then whole-word family-from-text. */
function resolveFamily(text: string): ResolvedFamily {
  const pinned = resolvePartTypeFamily(text);
  if (pinned) return { familyId: pinned, via: 'partType' };
  const fam = resolveFamilyFromText(text);
  if (fam) return { familyId: fam, via: 'familyFromText' };
  return { familyId: null, via: 'none' };
}

/** A short type-noun drop with no question and no theory cue — "NTC thermistor", "MLCC".
 *  Mirrors the guided controller's bare-noun entry condition (kept local + type-scoped). */
function isBareTypePhrase(text: string, namesType: boolean): boolean {
  const t = text.trim();
  if (!namesType) return false;
  if (t.includes('?')) return false;
  if (t.split(/\s+/).length > 6) return false;
  return !isLikelyTheory(t);
}

// ── The route ─────────────────────────────────────────────────────────────────

/**
 * Deterministically route a single user turn to an intent + (when resolvable) a family.
 * Pure. First-match-wins over the precedence below; the ordering encodes signal specificity
 * (an explicit "vs" is a stronger signal than a bare noun, so comparison outranks selection).
 */
export function routeIntent(text: string): IntentRoute {
  const signals: string[] = [];
  const raw = (text ?? '').trim();
  if (!raw) return { intent: 'unknown', familyId: null, signals };

  const family = resolveFamily(raw);
  if (family.familyId) signals.push(`family:${family.via}`);

  const namesType = namesComponentType(raw);
  if (namesType) signals.push('namesType');
  const isQuestion = QUESTION_RE.test(raw);
  if (isQuestion) signals.push('question');

  // 1. Comparison — explicit compare/vs cue. Most specific; outranks a bare MPN mention.
  if (COMPARE_RE.test(raw)) {
    signals.push('compare');
    return { intent: 'comparison', familyId: family.familyId, signals };
  }

  // 2. Part-lookup — a real part number inside the turn (robust token scan; excludes
  //    value/size/package/qualification tokens, so it won't fire on "12V" or "0805").
  if (mentionsMpn(raw)) {
    signals.push('mentionsMpn');
    return { intent: 'part-lookup', familyId: family.familyId, signals };
  }

  // 3/4. Manufacturer-centric — discovery when it also names a component type; otherwise a
  //      question about a specific maker.
  if (MFR_CUE_RE.test(raw)) {
    signals.push('mfrCue');
    if (namesType) return { intent: 'discovery', familyId: family.familyId, signals };
    return { intent: 'mfr-question', familyId: family.familyId, signals };
  }

  // 5. Selection — a greenfield sourcing turn: a selection verb, or a bare type-noun drop,
  //    that isn't a theory question and does concern a component. familyId may be null when
  //    the type is an ambiguous supertype ("a capacitor"); the orchestrator/guided flow then
  //    disambiguates.
  const selectionVerb = hasSelectionIntent(raw);
  if (
    !isLikelyTheory(raw) &&
    (selectionVerb || isBareTypePhrase(raw, namesType)) &&
    (namesType || family.familyId)
  ) {
    if (selectionVerb) signals.push('selectionIntent');
    else signals.push('bareType');
    return { intent: 'selection', familyId: family.familyId, signals };
  }

  // 6. Parametric-question — a question about which attribute VALUES exist, about a component.
  //    (Serves the scenario-8 / Family-Value-Catalog grounding surface.)
  if (isQuestion && PARAM_ATTR_RE.test(raw) && (family.familyId || namesType)) {
    signals.push('paramAttr');
    return { intent: 'parametric-question', familyId: family.familyId, signals };
  }

  // 7. Theory — a general concept question, or any question tied to a resolvable family.
  if (isLikelyTheory(raw) || (isQuestion && family.familyId)) {
    signals.push('theory');
    return { intent: 'theory', familyId: family.familyId, signals };
  }

  // 8. Loose part-lookup — a whole-string MPN-looking token that mentionsMpn missed (very
  //    short MPNs), guarded against type words ("Tantalum", "MLCC") which looksLikeMpn
  //    false-positives on.
  if (looksLikeMpn(raw) && !namesType) {
    signals.push('looseMpn');
    return { intent: 'part-lookup', familyId: family.familyId, signals };
  }

  return { intent: 'unknown', familyId: family.familyId, signals };
}

/** Intents whose injected context bundle is family-specific — the only ones worth spending an
 *  LLM classify call to recover a family for when deterministic recognition missed. */
const FAMILY_BUNDLE_INTENTS: ReadonlySet<ChatIntent> = new Set<ChatIntent>([
  'selection',
  'parametric-question',
  'theory',
  'comparison',
]);

/**
 * Route, then — only if the deterministic pass left the family unresolved AND the intent
 * consumes a family bundle — recover the family via the injected classifier (the existing
 * `classifyPartTypeFamily`, passed in so this stays decoupled + testable). Never calls the
 * classifier for MPN/maker/unknown turns, nor when a family already resolved, so the common
 * path stays LLM-free. The classifier only ever FILLS a null family; it never changes the
 * intent (a mis-classified family is a soft failure, exactly like a deterministic miss).
 */
export async function routeIntentWithClassifier(
  text: string,
  classify: (text: string) => Promise<string | null>,
): Promise<IntentRoute> {
  const route = routeIntent(text);
  if (route.familyId || !FAMILY_BUNDLE_INTENTS.has(route.intent)) return route;

  const fam = await classify(text);
  if (!fam) return route;
  return { ...route, familyId: fam, signals: [...route.signals, 'family:classifier'] };
}
