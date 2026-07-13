import type { XrefRecommendation, RecommendationCategory, PartStatus } from '../types';
import type { FilterInput } from './recommendationFilter';
import type { SearchFilterInput } from './searchResultFilter';
import { NON_ACTIVE_STATUSES, describeExcludedStatuses } from './recommendationFilter';
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

/** Every lifecycle status, for "keep ONLY these" inversion. */
const ALL_STATUSES: PartStatus[] = ['Active', 'Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'];

/**
 * Words the user might use for each lifecycle status, mapped to the EXACT statuses
 * they name. This precision is the whole point: the previous implementation collapsed
 * obsolete / eol / discontinued / not-recommended into one `exclude_obsolete` boolean
 * whose predicate only ever deleted `Obsolete` — so "hide discontinued" removed the
 * user's OBSOLETE parts and left the discontinued ones on screen.
 *
 * `eol` / `end of life` / `inactive` / `dead` are genuinely group words (no single
 * status owns them), so they name the whole non-Active set. Everything else names one.
 */
const STATUS_WORDS: Array<{ re: RegExp; statuses: PartStatus[] }> = [
  { re: /\bobsolete\b/i, statuses: ['Obsolete'] },
  { re: /\bdiscontinued\b/i, statuses: ['Discontinued'] },
  { re: /\bnrnd\b|\bnot\s+recommended(?:\s+for\s+new\s+designs?)?\b/i, statuses: ['NRND'] },
  { re: /\blast[\s-]?time[\s-]?buys?\b|\bltb\b/i, statuses: ['LastTimeBuy'] },
  { re: /\beol\b|\bend[\s-]?of[\s-]?life\b|\binactive\b|\bdead\b/i, statuses: NON_ACTIVE_STATUSES },
  { re: /\bactive\b/i, statuses: ['Active'] },
];

/** Unambiguous "take these away" cues — safe to match anywhere in the message. */
const EXCLUDE_CUE_RE = /\b(?:hide|exclude|drop|remove|filter\s+out|skip|ignore|omit|without|don'?t\s+(?:show|want|include)|do\s+not\s+(?:show|want|include)|no\s+longer)\b/i;

/** Weak cues ("no", "not") only count when they sit directly on the status word —
 *  "no obsolete parts" is a filter; "no, show me the obsolete ones" is not. */
const WEAK_EXCLUDE_ADJACENT_RE = /\b(?:no|not)\s+(?:the\s+)?(?:obsolete|discontinued|nrnd|eol|inactive|dead|last[\s-]?time[\s-]?buy)\b/i;

/** "keep only these" cues. */
const ONLY_CUE_RE = /\b(?:only|just|keep\s+only)\b/i;

/** "hide active" — the one case where Active itself is the target. Requires the cue
 *  to sit on the word, so "show active, hide discontinued" never hides Active. */
const EXCLUDE_ACTIVE_ADJACENT_RE = /\b(?:hide|exclude|drop|remove|filter\s+out|skip|ignore|omit|without|no|not)\s+(?:the\s+)?active\b/i;

/** Which statuses does this message name at all? */
function namedStatuses(query: string): Set<PartStatus> {
  const found = new Set<PartStatus>();
  for (const { re, statuses } of STATUS_WORDS) {
    if (re.test(query)) statuses.forEach(s => found.add(s));
  }
  return found;
}

/**
 * Detect a lifecycle-status filter, PRECISELY: each status word hides exactly the
 * status it names ("hide discontinued" → Discontinued and nothing else), multiple
 * words union ("hide obsolete and discontinued"), and "only active" inverts to hide
 * every non-Active status.
 *
 * Polarity rules (first match wins):
 *  - EXCLUDE (an exclude cue is present) → hide the named statuses. Active is only
 *    hidden when a cue sits directly on it, so "show the active ones but drop
 *    discontinued" hides Discontinued only — never the Active parts the user asked for.
 *  - ONLY (an only-cue is present) → keep the named statuses, hide all the others.
 *    This is what turns "show only active" into hide-every-non-Active.
 */
function detectStatusIntent(query: string): FilterIntent | null {
  const named = namedStatuses(query);
  if (named.size === 0) return null;

  const hasExcludeCue = EXCLUDE_CUE_RE.test(query) || WEAK_EXCLUDE_ADJACENT_RE.test(query);
  const hasOnlyCue = ONLY_CUE_RE.test(query) || FILTER_VERB_RE.test(query);

  let excluded: PartStatus[];
  if (hasExcludeCue) {
    // Hide what was named — but never Active unless it was explicitly targeted.
    excluded = [...named].filter(s => s !== 'Active');
    if (EXCLUDE_ACTIVE_ADJACENT_RE.test(query)) excluded.push('Active');
  } else if (hasOnlyCue) {
    // Keep what was named — hide everything else.
    excluded = ALL_STATUSES.filter(s => !named.has(s));
  } else {
    // A status word with no narrowing cue is a question, not a filter
    // ("is this part discontinued?") — leave it to the LLM.
    return null;
  }

  if (excluded.length === 0) return null;
  const label = describeExcludedStatuses(new Set(excluded)) ?? 'filtered';
  return { filterInput: { exclude_statuses: excluded }, label };
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
