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
      /\b(replacements?|replace|alternatives?|alternate|substitutes?|subs?|cross[\s-]?refs?(erences?)?)\b/i,
      /\b(equivalents?|equiv|interchangeable)\b/i,
      /\binstead\s+of\b/i,
      /\b(swap|drop[\s-]?in)\b/i,
      // "what can I use instead" / "what else can I use"
      /\bwhat\s+(else\s+)?can\s+i\s+use\b/i,
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
