/**
 * Lightweight pattern-matching for user-search-query intent. When the user
 * spells out what they want ("lowest price for X", "alternatives to Y"), we
 * carry the intent through the part-confirmation step and fire the matching
 * action automatically — avoiding the otherwise-rigid menu-of-buttons step.
 *
 * Pattern match only — no LLM call. We accept some recall loss in exchange
 * for predictable, deterministic behavior on common phrasings. Long-tail
 * intents fall through to the generic action menu.
 */

import { parseQuantity } from '@/lib/constants/quantityPresets';

export type PendingIntent = 'best_price' | 'find_replacements' | 'show_mfr_profile';

interface IntentRule {
  intent: PendingIntent;
  /** Patterns are tested case-insensitively with word boundaries where appropriate. */
  patterns: RegExp[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'best_price',
    patterns: [
      /\b(lowest|cheapest|best)\s+(spot\s+)?(price|cost)\b/i,
      /\b(price|cost)\s+(for|of|on)\b/i,
      /\bhow\s+much\b.*\b(cost|price|is)\b/i,
      /\bwhat\s+does\b.*\bcost\b/i,
      /\bwhere\s+(can\s+i\s+)?buy\b/i,
      /\b(in\s+stock|stock\s+(level|availability))\b/i,
      // Short imperative — "price for ABC123" / "cost of ABC123"
      /^\s*(price|cost|stock)\s+/i,
    ],
  },
  {
    intent: 'find_replacements',
    patterns: [
      // Core replacement vocabulary. "alts?" covers "alt"/"alts"; the word
      // boundaries keep it off "salt"/"alter"/"altitude".
      /\b(replacements?|replace|alternatives?|alternates?|alts?|substitutes?|subs?)\b/i,
      // Cross-reference family. "cross"/"crosses" is the industry noun for a
      // cross-reference ("show me the crosses"); the second pattern adds the
      // x-prefixed forms (xref / xrefs / x-ref / x refs) and the spelled-out
      // crossref / cross-reference(s). \b before "cross"/"x" keeps it off
      // "across" / "crossover" / "matrix".
      /\bcross(es)?\b/i,
      /\b(x|cross)[\s-]?refs?(erences?)?\b/i,
      /\b(equivalents?|equiv|interchangeable)\b/i,
      /\binstead\s+of\b/i,
      /\b(swap|drop[\s-]?in)\b/i,
      // "what can I use instead" / "what else can I use"
      /\bwhat\s+(else\s+)?can\s+i\s+use\b/i,
      // Keyword-less "give me something else" phrasings: "other parts",
      // "other options", "parts from other/another/different manufacturer(s)".
      // find_replacements is ordered before show_mfr_profile, so "parts from
      // other manufacturers" routes here (find alternatives) rather than to the
      // profile lookup that "manufacturers" would otherwise also match.
      /\bother\s+(parts?|options?|manufacturers?|brands?|makers?|suppliers?|vendors?)\b/i,
      /\bfrom\s+(other|another|a\s+different|different)\s+(manufacturers?|brands?|makers?|suppliers?|vendors?)\b/i,
    ],
  },
  {
    intent: 'show_mfr_profile',
    patterns: [
      // Manufacturer-about phrasings — note these only fire when the search
      // ALSO contains an MPN (caller checks). "tell me about X" alone routes
      // through the generic LLM path, not this fast-path.
      /\b(tell\s+me\s+about|info\s+(on|about)|profile\s+(of|for)|who\s+(makes|made))\b/i,
      /\b(manufactur(er|ed by)|company)\b/i,
    ],
  },
];

/**
 * Returns the strongest-matching intent for a user query, or null if no
 * pattern fires. When a query matches multiple intents (rare in practice),
 * the first rule in the list wins — best_price > find_replacements > show_mfr_profile.
 * That ordering matches observed query frequency.
 */
export function detectQueryIntent(query: string): PendingIntent | null {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(trimmed))) {
      return rule.intent;
    }
  }
  return null;
}

/** Number group for the quantity extractor: digits with optional comma grouping
 *  or a decimal, plus an optional k/m multiplier. No leading zero — a quantity
 *  is never written "0805" (that's a package code), so it stays out. */
const QTY_NUM = String.raw`([1-9][\d,]*(?:\.\d+)?)\s*([km])?`;
/** A number must NOT be followed by a letter, %, or ° — keeps MPNs ("2N2222"),
 *  spec values ("9V", "1-2mA"), and percentages ("5%") from parsing as a qty. */
const QTY_TRAIL = String.raw`(?![A-Za-z%°])`;

function normalizeQty(numStr: string, suffix?: string): number | null {
  const base = Number(numStr.replace(/,/g, ''));
  if (!Number.isFinite(base) || base <= 0) return null;
  const mult = suffix?.toLowerCase() === 'k' ? 1_000 : suffix?.toLowerCase() === 'm' ? 1_000_000 : 1;
  const n = Math.floor(base * mult);
  if (n <= 0 || n > 100_000_000) return null;
  // Reuse the shared positive-integer validator so the chat and the qty control
  // accept the same values.
  return parseQuantity(String(n));
}

/**
 * Extract an explicit order quantity from a free-text query, or null when none
 * is stated. Lets the single-part chat route messages like "what's the price
 * for 1 unit" or "I will need 100 units" straight into the spot-price flow at
 * the stated quantity instead of re-prompting.
 *
 * Conservative + cue-anchored so it never swallows MPNs or spec values:
 *  1) a number followed by a unit cue (units / pcs / pieces / ea / each)
 *  2) "qty"/"quantity" followed by a number
 *  3) a quantity verb ("for"/"of"/"need"/"want"/"order"/"buy"/"make it"/
 *     "change to"/"give me"/"take") followed by a number
 *  4) a bare number that IS the whole message
 * Accepts comma grouping ("10,000") and a k/m suffix ("1k" -> 1000).
 */
export function extractQuantity(query: string): number | null {
  if (!query || typeof query !== 'string') return null;
  const q = query.trim();
  if (q.length === 0) return null;

  const tryMatch = (re: RegExp): number | null => {
    const m = q.match(re);
    return m ? normalizeQty(m[1], m[2]) : null;
  };

  return (
    // 1) "<n> units|pcs|pieces|ea|each" — cue word makes this inherently safe
    tryMatch(new RegExp(`${QTY_NUM}\\s*(?:units?|pcs?|pieces?|ea|each)\\b`, 'i')) ??
    // 2) "qty|quantity [:] <n>"
    tryMatch(new RegExp(`\\b(?:qty|quantity)\\s*:?\\s*${QTY_NUM}${QTY_TRAIL}`, 'i')) ??
    // 3) "<verb> <n>"
    tryMatch(
      new RegExp(
        `\\b(?:for|of|need|needs|want|wants|order|buy|make\\s+it|change\\s+to|give\\s+me|take)\\s+${QTY_NUM}${QTY_TRAIL}`,
        'i',
      ),
    ) ??
    // 4) bare number as the whole message
    tryMatch(new RegExp(`^${QTY_NUM}$`, 'i'))
  );
}

/**
 * Quantity extractor for messages ALREADY classified as a price/stock question
 * (best_price intent). Tries the strict extractor first, then falls back to any
 * standalone number in the message — safe to be permissive here because the
 * caller knows it's a pricing question, so a number ("price for just 100",
 * "what's 500 going to cost") is almost certainly the desired quantity.
 *
 * Do NOT use this where the intent is unknown — there, a number can belong to a
 * spec ("rated for 200 volts") and must not be read as a quantity; use
 * extractQuantity for that.
 *
 * Guards keep MPNs ("2N2222"), package codes ("0805"), and spec values ("50V",
 * "5%") out: a leading word/.-boundary, no leading zero, no trailing letter/%/°,
 * and the same sane upper cap.
 */
export function extractBestPriceQuantity(query: string): number | null {
  const strict = extractQuantity(query);
  if (strict != null) return strict;
  if (!query || typeof query !== 'string') return null;
  const m = query.match(/(?<![\w.])([1-9][\d,]*(?:\.\d+)?)\s*([km])?(?![A-Za-z%°])/i);
  return m ? normalizeQty(m[1], m[2]) : null;
}
