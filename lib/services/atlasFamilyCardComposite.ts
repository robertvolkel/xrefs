/**
 * Composite domain card — pure, dependency-free string helpers.
 *
 * Sentinels + compose/split live here (NOT in atlasFamilyCardFacts.ts) so
 * client components — the admin AtlasDomainCardsPanel — can import them
 * without dragging the server-only renderer (which pulls in the Supabase
 * service client via the grounding block) into the browser bundle. Same
 * split as atlasFamilyCardAuditTypes.ts vs atlasFamilyCardAudit.ts.
 *
 * atlasFamilyCardFacts.ts re-exports everything here for server callers'
 * convenience. The .mjs audit script inlines byte-identical copies of the
 * sentinels + splitCardText (no import path — same mirror discipline as
 * atlas-ingest.mjs).
 */

// ── sentinels (single source of truth) ──
export const FACTS_START_SENTINEL = '===FAMILY FACTS (source-of-truth, auto-generated — do not edit)===';
export const FACTS_END_SENTINEL = '===END FAMILY FACTS===';
export const NARRATIVE_SENTINEL = '===ENGINEERING NOTES===';

/** The composite-card format version stamped into data_snapshot. v2 = the
 *  composite (facts + narrative) format. Legacy all-prose cards have no
 *  cardFormatVersion (treated as v1). */
export const CARD_FORMAT_VERSION = 2;

/**
 * Compose the composite card_text from a pre-rendered facts string and the
 * AI narrative. Pure string composition wrapping each region in sentinels.
 */
export function composeCardText(factsRenderedText: string, narrative: string): string {
  const factsText = factsRenderedText.trim();
  const narr = narrative.trim();
  return [
    FACTS_START_SENTINEL,
    factsText,
    FACTS_END_SENTINEL,
    '',
    NARRATIVE_SENTINEL,
    narr,
  ].join('\n');
}

export interface SplitCardText {
  /** Inner facts text (between the FACTS sentinels), or null for legacy
   *  prose cards with no FACTS sentinel. */
  factsRegion: string | null;
  /** The auditable narrative. For legacy cards this is the entire card. */
  narrativeRegion: string;
}

/**
 * Split a composite card into its facts and narrative regions.
 *
 * v2 (composite): returns the inner facts text + the narrative after the
 * ENGINEERING NOTES sentinel. Round-trips with composeCardText.
 *
 * v1 (legacy prose, no FACTS sentinel): returns factsRegion=null and the
 * whole card as the narrative — callers run the legacy full-text path.
 */
export function splitCardText(cardText: string): SplitCardText {
  if (!cardText) return { factsRegion: null, narrativeRegion: cardText ?? '' };

  const startIdx = cardText.indexOf(FACTS_START_SENTINEL);
  if (startIdx === -1) {
    // No facts sentinel → legacy v1 prose card.
    return { factsRegion: null, narrativeRegion: cardText };
  }
  const factsBodyStart = startIdx + FACTS_START_SENTINEL.length;
  const endIdx = cardText.indexOf(FACTS_END_SENTINEL, factsBodyStart);
  if (endIdx === -1) {
    // Malformed (start without end) — treat as legacy to avoid hiding text.
    return { factsRegion: null, narrativeRegion: cardText };
  }
  const factsRegion = cardText.slice(factsBodyStart, endIdx).trim();

  const afterFacts = endIdx + FACTS_END_SENTINEL.length;
  const narrIdx = cardText.indexOf(NARRATIVE_SENTINEL, afterFacts);
  const narrativeRegion = narrIdx === -1
    ? cardText.slice(afterFacts).trim()
    : cardText.slice(narrIdx + NARRATIVE_SENTINEL.length).trim();

  return { factsRegion, narrativeRegion };
}
