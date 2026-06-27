import type { SearchResult } from '../types';

/**
 * Lightweight heuristic: does the query look like a part number (MPN) vs a description?
 * Used to decide whether to call MPN-prefix-only APIs (Parts.io, Mouser) AND, on the
 * client, whether a search is "greenfield" (descriptive) for deterministic presentation.
 *
 * Relocated here from partDataService so it is importable by the CLIENT — partDataService
 * is server-only (it pulls Digikey/Parts.io/Mouser/FindChips clients that read process.env
 * secrets, plus node `crypto`). partDataService re-exports this for back-compat. The body
 * is byte-for-byte identical to the original.
 */
export function looksLikeMpn(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  // 3+ words is almost certainly a description
  if (words.length >= 3) return false;
  // Contains common component description terms
  const descTerms = /\b(capacitor|resistor|inductor|diode|transistor|mosfet|regulator|amplifier|sensor|relay|fuse|crystal|connector|led|switch|filter|oscillator|converter|driver|voltage|current|power|audio|memory|microcontroller)\b/i;
  if (descTerms.test(trimmed)) return false;
  // Single word with typical MPN characters (alphanumeric + dashes/dots)
  if (words.length === 1) return /^[A-Za-z0-9]/.test(trimmed);
  // 2 words — could be "MFR MPN" (e.g., "TDK CGA5L1X7R2J104K160AC") — allow it
  return true;
}

/**
 * Does the text MENTION a specific part number anywhere inside a longer phrase?
 *
 * Distinct from `looksLikeMpn`, which asks whether the WHOLE string is an MPN.
 * A natural-language request can name a specific part inside a sentence —
 * "I need replacements for BC847CLT3G from On Semi" — and that is NOT a
 * greenfield (describe-what-you-want) turn: the user named the exact part. The
 * greenfield classifier used `!looksLikeMpn(userText)` alone, which is true for
 * any multi-word sentence, so an MPN buried in prose was wrongly treated as
 * greenfield → it ran spec-vetting and tagged the named part's neighbours
 * "Below spec".
 *
 * We scan tokens for one that looks like a real MPN while EXCLUDING the
 * value / range / size / package / qualification tokens that legitimately
 * appear in descriptive searches (12V, 0.1A, 1–2mA, 0805, X7R, SOT-23,
 * AEC-Q200), so genuine greenfield queries stay greenfield. The asymmetry is
 * deliberate: a false positive only costs the (mild) loss of fit-ranking on a
 * descriptive search, whereas a false negative reintroduces the wrong
 * "Below spec" labels — so the detector leans toward catching MPNs.
 */
export function mentionsMpn(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  for (const raw of trimmed.split(/\s+/)) {
    // Strip surrounding punctuation; keep internal - . / which appear in MPNs.
    const tok = raw.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, '');
    if (tok.length < 5) continue;                               // too short: X7R, 12V, 5A
    if (!/[A-Za-z]/.test(tok) || !/\d/.test(tok)) continue;     // need BOTH a letter and a digit
    if (/^\d+(\.\d+)?[a-zµΩ%]{1,4}$/i.test(tok)) continue;      // value+unit: 470uF, 4.7kohm, 250mw
    if (/^\d+(\.\d+)?[-–—~]\d+(\.\d+)?[a-zµΩ%]*$/i.test(tok)) continue; // range: 1–2mA, 200-400, 9-12v
    if (/^\d+$/.test(tok)) continue;                            // pure number / size code: 0805, 1206
    if (/^(sot|soic|tssop|msop|qfn|qfp|tqfp|lqfp|bga|dpak|d2pak|to|do|sod|son|dfn|wlcsp|sip|dip|pdip|sc)-?\d/i.test(tok)) continue; // package family: SOT-23, TO220, DO-214
    if (/^aec-?q\d/i.test(tok)) continue;                       // qualification: AEC-Q200
    return true;                                                // looks like a real part number
  }
  return false;
}

/**
 * Deterministic chat message for GREENFIELD (descriptive / no-MPN) search presentation —
 * replaces the orchestrator's free prose on this surface.
 *
 * Why deterministic (Decision #173, mirrored from buildRecsSummary): on broad greenfield
 * result sets Haiku's closing prose recites a from-memory curated parts list with specs +
 * AEC quals that don't match the rendered cards (the A3-family leak, checklist row E3).
 * Three rounds of prompt-tightening could not hold it on Haiku. Pulling the LLM out of the
 * search-presentation surface removes the fabrication surface entirely. Every value here
 * traces to a field on a card the user can see (count, MPN, manufacturer) — by construction
 * it cannot fabricate. No specs appear in the text (rule B2); the single-match form is one
 * sentence with no post-click promise (rule C6). Manufacturer/data-source provenance
 * (sourcesContributed) is intentionally omitted — it doesn't aid selection.
 *
 * MPN-lookup searches do NOT use this — they keep the LLM confirmation message.
 */
export function buildSearchSummary(searchResult: SearchResult): string {
  const matches = searchResult.matches ?? [];
  const n = matches.length;

  // No cards to point at — a greenfield `type==='none'` turn. Phase A routes this
  // here too (the caller no longer keeps the LLM message on greenfield no-matches),
  // so a no-result descriptive turn renders this deterministic line instead of free
  // prose. Also safe for any direct caller/test.
  if (n === 0) {
    return `I couldn't find any parts matching your criteria. Try adding or relaxing a requirement.`;
  }

  // Vetted descriptive search (logic-vetted): the cards were scored against the
  // user's stated specs and re-ranked best-fit-first. Say so honestly — "ranked
  // by fit", NOT "all fit" (we keep below-spec parts at the bottom). Detected by
  // the presence of the engine-supplied matchScore on a card. Still deterministic
  // and spec-free (no values in the text).
  const vetted = matches.some(m => typeof m.matchScore === 'number');

  // Single (or a degenerate 'multiple' with one card): identify the part only. One sentence,
  // MPN + MFR (both on the card), no specs, no post-click promise.
  if (searchResult.type === 'single' || n === 1) {
    const p = matches[0];
    return `I found **${p.mpn}** from **${p.manufacturer}** matching your criteria — click it to confirm.`;
  }

  // Multiple: count equals the number of rendered cards (deterministic).
  if (vetted) {
    return `I found **${n}** parts and ranked them by how well they fit your specs — best match first. Click the one you'd like to use.`;
  }
  return `I found **${n}** parts matching your criteria — click the one you'd like to use.`;
}
