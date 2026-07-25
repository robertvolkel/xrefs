/**
 * Confident manufacturer-name equality — for attributing a FindChips distributor offer to the
 * specific maker on a card.
 *
 * FindChips returns full corporate names ("Goodwork Semiconductor Co Ltd", "National Semiconductor
 * Corporation") where our cards carry the source's shorter name ("GOODWORK", "STMicroelectronics").
 * We normalize both sides — lowercase, punctuation → space, drop generic corporate-suffix tokens —
 * and require the remaining cores to be EQUAL (or to match one of the maker's known alias variants).
 *
 * Deliberately CONSERVATIVE: match confidently or return false. Attributing a distributor offer to
 * the WRONG maker is the failure we are eliminating (it sends "Go Buy" to a different company's
 * part); showing FEWER distributors than truly exist is the acceptable trade. So an abbreviation we
 * cannot confidently expand ("HGSEMI" vs "HuaGuan Semiconductor") does NOT match — that maker simply
 * shows no distributor data rather than borrowing another maker's.
 *
 * Pure + unit-tested against real FindChips manufacturer strings.
 */

/** Generic company-name words that carry no identity — stripped before comparison. Whole-token
 *  only (so "Microchip" — a single token — is never touched by the "micro" entry). */
const SUFFIX_TOKENS = new Set<string>([
  'semiconductor', 'semiconductors', 'semi',
  'microelectronics', 'microelectronic', 'micro',
  'electronics', 'electronic', 'optoelectronic', 'optoelectronics',
  'corporation', 'corp', 'incorporated', 'inc', 'company', 'co',
  'ltd', 'limited', 'llc', 'gmbh', 'plc', 'ag', 'sa', 'srl', 'bv', 'pte', 'kk',
  'technology', 'technologies', 'tech',
  'components', 'component', 'industries', 'industrial',
  'international', 'intl', 'group', 'holdings', 'holding', 'systems',
]);

/** Lowercase, split on any non-letter/non-digit (Unicode-aware, so CJK names survive), drop the
 *  generic corporate-suffix tokens, and rejoin the identity core. "Goodwork Semiconductor Co Ltd"
 *  → "goodwork"; "STMicroelectronics" → "stmicroelectronics" (one token, no separators); "" → "". */
export function normalizeMakerName(name: string | undefined | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SUFFIX_TOKENS.has(t))
    .join(' ');
}

/**
 * Is `offerMaker` (a FindChips offer's manufacturer) confidently the same company as the card's
 * maker? Compares the normalized offer against the normalized card maker AND any alias variants
 * (from the manufacturer alias resolver). Returns false whenever either side is empty/unknown — an
 * offer we can't attribute is never counted.
 */
export function makerMatches(
  cardMaker: string | undefined | null,
  offerMaker: string | undefined | null,
  variants?: readonly string[],
): boolean {
  const offer = normalizeMakerName(offerMaker);
  if (!offer) return false;
  const candidates = new Set<string>();
  const push = (s: string | undefined | null) => {
    const n = normalizeMakerName(s);
    if (n) candidates.add(n);
  };
  push(cardMaker);
  for (const v of variants ?? []) push(v);
  return candidates.has(offer);
}
