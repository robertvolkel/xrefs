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

  // Defensive: no cards to point at. The greenfield caller gates 'none' out (it keeps the
  // LLM message), but keep this safe for any direct caller/test.
  if (n === 0) {
    return `I couldn't find any parts matching your criteria. Try adding or relaxing a requirement.`;
  }

  // Single (or a degenerate 'multiple' with one card): identify the part only. One sentence,
  // MPN + MFR (both on the card), no specs, no post-click promise.
  if (searchResult.type === 'single' || n === 1) {
    const p = matches[0];
    return `I found **${p.mpn}** from **${p.manufacturer}** matching your criteria — click it to confirm.`;
  }

  // Multiple: count equals the number of rendered cards (deterministic).
  return `I found **${n}** parts matching your criteria — click the one you'd like to use.`;
}
