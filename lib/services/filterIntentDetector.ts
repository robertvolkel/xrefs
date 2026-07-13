import type { XrefRecommendation, RecommendationCategory, PartStatus } from '../types';
import type { FilterInput } from './recommendationFilter';
import type { SearchFilterInput } from './searchResultFilter';
import { ALL_STATUSES, NON_ACTIVE_STATUSES, describeExcludedStatuses } from './recommendationFilter';
import { namesComponentType } from './componentVocabulary';

/**
 * Pattern-detect a "narrow the recommendations panel" intent on a follow-up
 * chat message. When the user is in viewing phase and asks for a filtered view
 * (e.g., "show only Würth", "only AEC-Q200", "hide obsolete", "≥80% match"),
 * the client intercepts BEFORE sending to the LLM, applies the filter
 * deterministically, and updates the panel + chat in one shot. Same pattern as
 * detectQueryIntent — exists because LLM "answer in prose, skip the tool call"
 * drift is persistent and prompt rules alone don't reliably hold.
 *
 * Returns null when no clean filter intent is detected — caller falls through
 * to the LLM (which has the prompt rule as a softer enforcement layer).
 */

export interface FilterIntent {
  /** Filter to apply via applyRecommendationFilter. */
  filterInput: FilterInput;
  /** Human-readable label for the filter, used in the chat acknowledgement
   *  ("Filtered to {label}"). Distinct from the FilterInput field because the
   *  display form may be normalized (e.g., manufacturer canonical name). */
  label: string;
}

/** Normalize a manufacturer string for fuzzy matching: lowercase + strip
 *  diacritics + collapse non-alphanumerics to spaces. */
function normalizeMfr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that don't carry MFR identity — strip when token-matching. */
const MFR_STOPWORDS = new Set([
  'inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company',
  'gmbh', 'ag', 'sa', 'kg', 'ltd', 'limited',
  'electronics', 'electronic', 'semiconductor', 'semiconductors',
  'industries', 'industry', 'tech', 'technology', 'technologies',
  'group', 'holdings', 'international', 'global',
]);

/** Verb patterns that indicate a FILTER (apply-to-panel) intent vs an ASK
 *  (just-answer) intent. Filter requires at least one of these somewhere in the
 *  message — otherwise we don't intercept. */
const FILTER_VERB_RE = /\b(?:show\s+(?:me\s+)?(?:only|just)?|just\s+(?:show\s+(?:me\s+)?)?|only|filter\s+(?:to|by|down(?:\s+to)?|on)|narrow\s+(?:to|by|down(?:\s+to)?)|limit\s+(?:to|by)|restrict\s+(?:to|by)|hide|exclude|drop|remove|keep\s+only|give\s+me\s+(?:only|just))\b/i;

/** Pattern: "show me Wurth replacements" / "from Wurth" / "by Wurth" — these
 *  carry filter intent without an explicit narrowing verb. Conservative — only
 *  fires when followed/preceded by a manufacturer-like token. */
const SOFT_FILTER_RE = /\b(?:from|by|made by)\s+\S/i;

/**
 * Lifecycle-status detection is CUE-ADJACENT: a status word only counts when a
 * narrowing cue governs it directly ("hide discontinued"), never merely because both
 * appear somewhere in the message. Adjacency is the whole safety mechanism —
 * a global "is there a cue? is there a status word?" test hijacks unrelated requests
 * ("hide the Vishay ones, they're discontinued anyway" would hide every discontinued
 * part and never apply the Vishay filter) and turns questions into destructive
 * filters ("can you show me if any are discontinued?").
 *
 * Filler words permitted between the cue and the status it governs. These carry no
 * meaning of their own, so the cue still reaches the status ("remove parts that are
 * discontinued"), but any real noun breaks the chain — which is what stops a cue
 * from jumping across an unrelated subject.
 */
const FILLER = String.raw`(?:me|us|the|a|an|any|all|those|these|parts?|ones?|items?|that|which|are|is|were|been|of|them|it|anything|everything)`;

/**
 * `active` is ALSO an everyday electronics term — "active low", "active high",
 * "active filter", "active mode" are pin/circuit descriptions, not lifecycle states.
 * The lookahead refuses those readings. (`dead` was previously treated as a lifecycle
 * word and is now gone entirely: "dead time" is a real gate-driver spec, and
 * "show me parts with 100ns dead time" was hiding every Active part.)
 */
const ACTIVE_TOKEN = String.raw`active\b(?!\s*-?\s*(?:low|high|mode|filter|filters|current|region|power|clamp|balanc\w*|discharge|cooling|pull\w*|load|state|edge|termination))`;

/**
 * Status vocabulary → the EXACT statuses each phrase names. Ordered LONGEST-FIRST so
 * multi-word phrases win before their substrings ("no longer active" must be consumed
 * as a group word before the bare `active` token can claim it).
 *
 * `eol` / `end of life` / `inactive` / `no longer active` are genuine GROUP words (no
 * single status owns them) → the whole non-Active set. Everything else names exactly one.
 */
const STATUS_TOKENS: Array<{ src: string; statuses: PartStatus[] }> = [
  { src: String.raw`not\s+recommended(?:\s+for\s+new\s+designs?)?`, statuses: ['NRND'] },
  { src: String.raw`no\s+longer\s+active`, statuses: NON_ACTIVE_STATUSES },
  { src: String.raw`last[\s-]?time[\s-]?buys?`, statuses: ['LastTimeBuy'] },
  { src: String.raw`end[\s-]?of[\s-]?life`, statuses: NON_ACTIVE_STATUSES },
  { src: String.raw`discontinued`, statuses: ['Discontinued'] },
  { src: String.raw`obsolete`, statuses: ['Obsolete'] },
  { src: String.raw`inactive`, statuses: NON_ACTIVE_STATUSES },
  { src: String.raw`nrnd`, statuses: ['NRND'] },
  { src: String.raw`ltb`, statuses: ['LastTimeBuy'] },
  { src: String.raw`eol`, statuses: NON_ACTIVE_STATUSES },
  { src: ACTIVE_TOKEN, statuses: ['Active'] },
];

const STATUS_ALT = STATUS_TOKENS.map(t => t.src).join('|');
/** One or more statuses joined by "and" / "or" / commas — "hide obsolete and discontinued". */
const STATUS_CHAIN = String.raw`(?:${STATUS_ALT})(?:\s*(?:,|/|\+|\band\b|\bor\b)\s*(?:the\s+)?(?:${STATUS_ALT}))*`;

/** Unambiguous "take these away" cues. May target ANY status, including Active. */
const STRONG_EXCLUDE = String.raw`hide|exclude|drop|remove|filter\s+out|skip|ignore|omit|without|don'?t\s+(?:show|want|include)|do\s+not\s+(?:show|want|include)`;
/** Weak cues. Must sit DIRECTLY on the status (no filler), and may never target Active:
 *  "exclude discontinued, not active" means "not the ACTIVE ones" — i.e. keep them. */
const WEAK_EXCLUDE = String.raw`no|not`;
/** "keep only these" cues. Deliberately NOT the broad FILTER_VERB_RE — a bare "show me"
 *  is not an only-cue, and treating it as one turned every "show me … <status word> …"
 *  question into a filter. */
const ONLY_CUE = String.raw`only|just|solely|keep\s+only|nothing\s+but`;

// Built fresh per call — these are /g regexes and a shared instance would carry
// `lastIndex` across calls (a stateful-regex bug we have shipped before).
const excludeStrongRe = () => new RegExp(String.raw`\b(?:${STRONG_EXCLUDE})(?:\s+${FILLER})*\s+(?:the\s+)?(${STATUS_CHAIN})`, 'gi');
const excludeWeakRe = () => new RegExp(String.raw`\b(?:${WEAK_EXCLUDE})\s+(?:the\s+)?(${STATUS_CHAIN})`, 'gi');
const onlyLeadRe = () => new RegExp(String.raw`\b(?:${ONLY_CUE})(?:\s+${FILLER})*\s+(?:the\s+)?(${STATUS_CHAIN})`, 'gi');
const onlyTrailRe = () => new RegExp(String.raw`\b(${STATUS_CHAIN})(?:\s+${FILLER})*\s+only\b`, 'gi');

/** Resolve a matched status phrase to statuses. Consumes longest-first, so a group
 *  phrase ("no longer active") can't also register its substring (`active`). */
function statusesInPhrase(phrase: string): PartStatus[] {
  let rest = phrase;
  const found = new Set<PartStatus>();
  for (const { src, statuses } of STATUS_TOKENS) {
    const re = new RegExp(String.raw`\b(?:${src})`, 'gi');
    if (re.test(rest)) {
      statuses.forEach(s => found.add(s));
      rest = rest.replace(new RegExp(String.raw`\b(?:${src})`, 'gi'), ' ');
    }
  }
  return [...found];
}

/** Canonical order, so the emitted list is deterministic. */
function ordered(set: Set<PartStatus>): PartStatus[] {
  return ALL_STATUSES.filter(s => set.has(s));
}

/**
 * Detect a lifecycle-status filter, precisely and only when a cue actually governs a
 * status word.
 *
 *  - EXCLUDE wins over ONLY, so "show me the active ones but drop discontinued" hides
 *    Discontinued and leaves the Active parts the user asked to see.
 *  - ONLY inverts: "show only active" keeps Active and hides every other status.
 *  - No governing cue → null. A status word alone is a question ("is this
 *    discontinued?"), not an instruction, and belongs to the LLM.
 */
function detectStatusIntent(query: string): FilterIntent | null {
  const excluded = new Set<PartStatus>();

  for (const m of query.matchAll(excludeStrongRe())) {
    statusesInPhrase(m[1]).forEach(s => excluded.add(s));
  }
  for (const m of query.matchAll(excludeWeakRe())) {
    // Weak cues never take Active away — see WEAK_EXCLUDE.
    statusesInPhrase(m[1]).forEach(s => { if (s !== 'Active') excluded.add(s); });
  }
  if (excluded.size > 0) {
    return {
      filterInput: { exclude_statuses: ordered(excluded) },
      label: describeExcludedStatuses(excluded) ?? 'filtered',
    };
  }

  const kept = new Set<PartStatus>();
  for (const m of [...query.matchAll(onlyLeadRe()), ...query.matchAll(onlyTrailRe())]) {
    statusesInPhrase(m[1]).forEach(s => kept.add(s));
  }
  if (kept.size > 0) {
    const inverted = new Set(ALL_STATUSES.filter(s => !kept.has(s)));
    if (inverted.size > 0) {
      return {
        filterInput: { exclude_statuses: ordered(inverted) },
        label: describeExcludedStatuses(inverted) ?? 'filtered',
      };
    }
  }
  return null;
}

/** Detect a min-match-percentage filter (≥80%, above 75, etc.). */
function detectMatchPctIntent(query: string): FilterIntent | null {
  // "≥80%" / ">=80%" / "above 75" / "over 80" / "at least 70" / "min 80"
  const m = query.match(/(?:≥|>=|>|over|above|at\s+least|minimum|min|more\s+than)\s*(\d{1,3})\s*%?/i);
  if (m) {
    const pct = parseInt(m[1], 10);
    if (pct > 0 && pct <= 100) {
      return { filterInput: { min_match_percentage: pct }, label: `≥${pct}% match` };
    }
  }
  // "drop everything below 80" / "hide below 70" / "remove anything under 75"
  const drop = query.match(/\b(?:drop|hide|exclude|remove|filter\s+out)\b.*\b(?:below|under|less\s+than|<)\s*(\d{1,3})\s*%?/i);
  if (drop) {
    const pct = parseInt(drop[1], 10);
    if (pct > 0 && pct <= 100) {
      return { filterInput: { min_match_percentage: pct }, label: `≥${pct}% match` };
    }
  }
  return null;
}

/** Detect a category filter (Accuris / MFR-certified / logic-driven). */
function detectCategoryIntent(query: string): FilterIntent | null {
  if (!FILTER_VERB_RE.test(query)) return null;
  const lower = query.toLowerCase();
  if (/\b(?:accuris|parts[\s.\-]?io|3rd[\s-]?party|third[\s-]?party)(?:[\s-]?certified)?\b/i.test(query)) {
    return {
      filterInput: { category_filter: 'third_party_certified' as RecommendationCategory },
      label: 'Accuris-certified',
    };
  }
  if (/\b(?:mfr|manufacturer|mfg)[\s-]?certified\b/i.test(query)) {
    return {
      filterInput: { category_filter: 'manufacturer_certified' as RecommendationCategory },
      label: 'MFR-certified',
    };
  }
  if (/\b(?:logic[\s-]?driven|logic[\s-]?match(?:ed)?|rule[\s-]?(?:engine|driven|matched))\b/i.test(lower)) {
    return {
      filterInput: { category_filter: 'logic_driven' as RecommendationCategory },
      label: 'logic-driven',
    };
  }
  return null;
}

/** Detect an origin/region filter — "Chinese", "Asian", "Western", etc. In
 *  this codebase Chinese MFRs == Atlas-sourced (Decision #161); the resolver
 *  populates `XrefRecommendation.part.mfrOrigin` for every rec regardless of
 *  whether attributes came from Digikey, Atlas, parts.io, or Mouser.
 *
 *  Does NOT require a filter verb — origin words are inherently narrowing in
 *  this product context (you don't ask "is this part Chinese?" to a recs
 *  panel; you say it because you want to see only those). False positives
 *  here are cheap; the user can clear the filter with "show all".
 *
 *  Exported (unlike the other sub-detectors) because it is pure query regex —
 *  recs-independent — so the pre-recs path can use it to recognize a
 *  region-filtered replacement request ("recommend Chinese MFRs only") BEFORE
 *  any candidates exist, then run cross-references with the filter bundled. */
export function detectOriginIntent(query: string): FilterIntent | null {
  // Western FIRST so "non-chinese" / "non chinese" doesn't get swallowed by
  // the bare \bchinese\b atlas pattern below.
  if (/\b(western|american|european)\b/i.test(query)
      || /\bnon[\s-]?chinese\b/i.test(query)) {
    return { filterInput: { mfr_origin_filter: 'western' }, label: 'Western MFRs' };
  }
  // Atlas / Chinese MFRs
  if (/\b(chinese|china|prc|mainland|asian|asia)\b/i.test(query)
      || /\b(made|from|sourced)\s+in\s+china\b/i.test(query)) {
    return { filterInput: { mfr_origin_filter: 'atlas' }, label: 'Chinese MFRs' };
  }
  return null;
}

/**
 * Detect a PURE origin refinement of the current search-result cards: an origin
 * ask ("the Chinese ones", "western only", "non-Chinese", "PRC-based firms") that
 * does NOT also name a part type. Used by the search-result filter intercept so
 * origin narrowing runs DETERMINISTICALLY (the LLM's "never assert MFR origin"
 * discipline otherwise makes it prose-answer instead of calling the origin filter).
 *
 * The refine-vs-new-search decision keys off a real component vocabulary
 * (`namesComponentType`), NOT "any leftover word". The old word-list heuristic
 * treated every ≥3-char residual as a part type, so descriptor phrasings —
 * "PRC-based", "Chinese firms only", "the reputable Chinese ones" — leaked through
 * to the LLM and reproduced the exact "none are Chinese" prose bug this exists to
 * prevent. Now: only a named component ("Chinese MLCCs", "find Chinese capacitors")
 * is a new search; everything else is a refine.
 */
export function detectSearchOriginRefinement(
  query: string,
): { origin: 'atlas' | 'western'; label: string } | null {
  const intent = detectOriginIntent(query);
  const origin = intent?.filterInput.mfr_origin_filter;
  if (!origin) return null;
  if (namesComponentType(query)) return null; // a part type was named → new search
  return { origin, label: intent!.label };
}

/**
 * Detect a lifecycle-status refinement of the current search-result CARDS
 * ("don't show me discontinued parts", "hide the obsolete ones", "only active").
 *
 * Runs DETERMINISTICALLY for the same reason the origin refinement does: relying on
 * the LLM to reach for the filter tool is a coin-flip, and a filter that silently
 * doesn't fire is indistinguishable from one that fired and matched nothing.
 *
 * Guarded by `namesComponentType` symmetrically with origin: "show me only active
 * MLCCs" while transistor cards are on screen is a PIVOT (new search), not a refine,
 * so it goes to the LLM. That fall-through is now safe either way — the shared
 * predicate underneath the LLM's tool is fixed too, so the worst case is
 * non-deterministic, not wrong.
 */
export function detectSearchStatusRefinement(
  query: string,
): { input: SearchFilterInput; label: string } | null {
  const intent = detectStatusIntent(query);
  const statuses = intent?.filterInput.exclude_statuses;
  if (!statuses || statuses.length === 0) return null;
  if (namesComponentType(query)) return null; // a part type was named → new search
  return { input: { exclude_statuses: statuses }, label: intent!.label };
}

/** Detect a manufacturer filter — needs both a verb and a manufacturer name
 *  recognizable in the current recs set. */
function detectManufacturerIntent(query: string, recs: XrefRecommendation[]): FilterIntent | null {
  if (!FILTER_VERB_RE.test(query) && !SOFT_FILTER_RE.test(query)) return null;
  const normQuery = ` ${normalizeMfr(query)} `;

  // Build a unique MFR list from current recs.
  const uniqueMfrs = Array.from(new Set(recs.map(r => r.part.manufacturer).filter(Boolean)));

  // Track best match — prefer longer matched substring to disambiguate
  // "Murata" from "Murata Electronics" when both could appear.
  let bestMatch: { mfr: string; matchLen: number } | null = null;

  for (const mfr of uniqueMfrs) {
    const normMfr = normalizeMfr(mfr);
    if (normMfr.length === 0) continue;

    // Direct full-name substring (e.g., "show me only würth elektronik")
    if (normQuery.includes(` ${normMfr} `) || normQuery.includes(` ${normMfr}`)) {
      if (!bestMatch || normMfr.length > bestMatch.matchLen) {
        bestMatch = { mfr, matchLen: normMfr.length };
      }
      continue;
    }

    // Token match — any meaningful word of the MFR (≥3 chars, non-stopword)
    // appearing as a whole word in the query.
    const tokens = normMfr.split(/\s+/).filter(t => t.length >= 3 && !MFR_STOPWORDS.has(t));
    for (const tok of tokens) {
      const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
      if (re.test(normQuery)) {
        if (!bestMatch || tok.length > bestMatch.matchLen) {
          bestMatch = { mfr, matchLen: tok.length };
        }
      }
    }
  }

  if (!bestMatch) return null;
  return {
    filterInput: { manufacturer_filter: bestMatch.mfr },
    label: bestMatch.mfr,
  };
}

/** Detect an AEC-Q qualification filter (Q100/Q101/Q200). Routes through
 *  attribute_filters since AEC-Q is exposed as a parametric attribute, not a
 *  first-class field. */
function detectQualificationIntent(query: string): FilterIntent | null {
  if (!FILTER_VERB_RE.test(query)) return null;
  const m = query.match(/\bAEC-?Q(100|101|200)\b/i);
  if (!m) return null;
  const qual = `AEC-Q${m[1]}`;
  // Match against any rule whose parameter name contains "AEC" or "qualification"
  // — both parametric naming styles appear across families. Use 'contains' on
  // the value so "AEC-Q200" matches a value like "AEC-Q200 Compliant".
  return {
    filterInput: {
      attribute_filters: [{ parameter: 'AEC-Q', operator: 'contains', value: qual }],
    },
    label: qual,
  };
}

/** Detect a "clear / remove the current filter" intent. Pure pattern match —
 *  no recs needed. Caller decides what to do (no-op if no filter is active,
 *  restore full set otherwise). Checked BEFORE the apply-filter detector so
 *  phrasings like "remove the wurth filter" don't get misread as "apply Wurth". */
export function detectClearFilterIntent(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  return (
    /\b(?:remove|clear|drop|reset|unfilter|cancel|undo|kill)\s+(?:the\s+)?(?:\w+\s+)?(?:filter|filtering)\b/i.test(query)
    || /\bshow\s+(?:me\s+)?(?:all|every|everything|the\s+full|the\s+complete)\b/i.test(query)
    || /\b(?:no|without|w\/o)\s+filter\b/i.test(query)
    || /\bback\s+to\s+(?:all|the\s+full|everything)\b/i.test(query)
    || /\bunfilter\b/i.test(query)
    || /\bsee\s+(?:all|the\s+full)\b/i.test(query)
    || /\bgive\s+me\s+(?:all|every|everything)\b/i.test(query)
  );
}

/** Top-level detector. Returns the strongest-matching intent, or null. */
export function detectFilterIntent(
  query: string,
  recs: XrefRecommendation[],
): FilterIntent | null {
  if (!query || recs.length === 0) return null;
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  // Priority order: explicit predicates first, manufacturer last (most permissive).
  // Don't try to detect compound filters here — those go through the LLM, which
  // is supposed to combine predicates into one filter_recommendations call.
  return (
    detectStatusIntent(trimmed)
    ?? detectMatchPctIntent(trimmed)
    ?? detectQualificationIntent(trimmed)
    ?? detectCategoryIntent(trimmed)
    ?? detectOriginIntent(trimmed)
    ?? detectManufacturerIntent(trimmed, recs)
  );
}
