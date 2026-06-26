/**
 * Unverified-MPN detector — finds part-number-shaped tokens in assistant prose that
 * are NOT in the conversation's verified set (docs/mpn-grounding-gate-plan.md, step 2).
 *
 * Design follows the plan's audit (Reviewer A), which showed the naive "any
 * letters+digits token minus a denylist" approach maximizes BOTH error modes in this
 * domain, because real MPNs and ordinary electronics vocabulary (package codes,
 * dielectric codes, standards, value tokens) occupy the same shape-space. The detector
 * therefore decides in this precedence order:
 *
 *   1. VERIFIED-SET FIRST — a token matching a catalog-pulled (or user-typed) part is
 *      always safe; nothing downstream can re-flag it.
 *   2. NON-MPN VOCABULARY — exclude tokens that are known electronics terms. The
 *      vocabulary is derived programmatically from the logic tables (see
 *      nonMpnVocabulary.ts), not hand-maintained.
 *   3. VALUE / NUMERIC tokens — "45V", "4.7uF", "100ppm", "2512" are specs, not MPNs.
 *   4. SIGNAL — a leftover token is flagged HIGH if it matches a known MPN-family
 *      pattern (looks like a real manufacturer's scheme but we never pulled it →
 *      strong fabrication signal), MEDIUM if it is merely structurally MPN-shaped
 *      (mixed letters+digits, length ≥ 4).
 *
 * KNOWN GAP (accepted for the observe-only phase): digit-free fabrications that match
 * no family pattern, and bare-numeric series, are not flagged. The primary guarantee
 * is structural rendering (cards/tables); this detector is a precision-oriented
 * backstop + the measurement instrument that tells us what to add to the vocabulary
 * and family-pattern lists BEFORE any enforcement is switched on.
 */

import { VerifiedSet, isMentionableMpn } from './verifiedSet';

export type MpnConfidence = 'high' | 'medium';

export interface UnverifiedMpnFinding {
  /** The token exactly as it appeared in the text. */
  token: string;
  /** Match-normalized form (for logging / dedup). */
  normalized: string;
  /** Character offset of the token in the source text. */
  index: number;
  confidence: MpnConfidence;
  /** Why it was flagged — 'known-MPN-family' | 'structural-mixed'. */
  reason: string;
}

export interface DetectOptions {
  /** Normalized non-MPN vocabulary to exclude (from buildNonMpnVocabulary()). */
  vocabulary: ReadonlySet<string>;
  /** Known MPN-family patterns; a match means HIGH confidence. */
  familyPatterns?: ReadonlyArray<RegExp>;
}

// A "word" as it may appear inside an MPN: alphanumerics joined by internal . / , -
// separators (so "BC846BW,115", "SOT-23-5", "AEC-Q101" each capture as ONE token).
const TOKEN_PATTERN = /[A-Za-z0-9]+(?:[./,-][A-Za-z0-9]+)*/g;

// Loose normalization for vocabulary comparison: lowercase + drop whitespace only.
// (Deliberately NOT the packaging-suffix-stripping MPN normalizer — that would mangle
// codes like dielectrics; vocabulary entries are normalized the same way.)
export function normalizeTokenLoose(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

// Spec value tokens: a number (optional decimal), an optional SI prefix, an optional
// unit. Catches "45v", "4.7uf", "100nf", "10kohm", "2.5mhz", "100ppm", "2ma".
const VALUE_TOKEN_PATTERN =
  /^\d+(?:\.\d+)?(?:k|m|µ|u|n|p|g|t)?(?:f|h|v|a|w|hz|ohm|ohms|ω|wh|ah|va|var|db|dbm|ppm|mil|mm|cm|s|ms|us|ns|ps|bit|bits|sps|ksps|msps|gsps|°c|c)?$/;

function hasLetter(s: string): boolean {
  return /[a-z]/i.test(s);
}
function hasDigit(s: string): boolean {
  return /[0-9]/.test(s);
}

/**
 * A multi-part token whose every part is ordinary — a vocabulary term, a plain word,
 * or a value/number — is not a part number, e.g. "X7R-adjacent", "AEC-Q101-qualified",
 * "3.3V-rail". A part that is itself MPN-shaped (mixed letters+digits, like "bc846bw"
 * in "BC846BW,115") is NOT ordinary, so the whole token stays a candidate.
 */
function isBenignCompound(token: string, vocabulary: ReadonlySet<string>): boolean {
  const parts = token.split(/[./,-]/).map(normalizeTokenLoose).filter(Boolean);
  if (parts.length < 2) return false;
  for (const part of parts) {
    if (vocabulary.has(part)) continue;
    if (/^\d+$/.test(part)) continue;
    if (VALUE_TOKEN_PATTERN.test(part)) continue;
    if (hasLetter(part) && !hasDigit(part)) continue; // plain word
    return false; // mixed letters+digits → token stays a candidate
  }
  return true;
}

/**
 * Scan `text` for part-number-shaped tokens not present in `verifiedSet`. Pure and
 * side-effect-free; returns findings in order of appearance. Empty array means nothing
 * suspicious — i.e. every part the prose names was verified (or was ordinary vocabulary).
 */
export function detectUnverifiedMpns(
  text: string,
  verifiedSet: VerifiedSet,
  opts: DetectOptions,
): UnverifiedMpnFinding[] {
  const findings: UnverifiedMpnFinding[] = [];
  if (!text) return findings;
  const { vocabulary, familyPatterns = [] } = opts;

  let match: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[0];
    const loose = normalizeTokenLoose(token);
    if (loose.length < 2) continue;

    // 1. Verified or user-typed → always safe.
    if (isMentionableMpn(verifiedSet, token)) continue;
    // 2. Known electronics vocabulary → not a part number.
    if (vocabulary.has(loose)) continue;
    // 3. Spec value or bare numeric → not a part number.
    if (/^\d+$/.test(loose)) continue;
    if (VALUE_TOKEN_PATTERN.test(loose)) continue;
    // 3b. Compound of ordinary parts ("X7R-grade", "AEC-Q101-qualified") → not an MPN.
    if (isBenignCompound(token, vocabulary)) continue;

    // 4. Signal.
    const familyMatch = familyPatterns.some((p) => p.test(loose));
    if (familyMatch) {
      findings.push({ token, normalized: loose, index: match.index, confidence: 'high', reason: 'known-MPN-family' });
      continue;
    }
    if (hasLetter(loose) && hasDigit(loose) && loose.length >= 4) {
      findings.push({ token, normalized: loose, index: match.index, confidence: 'medium', reason: 'structural-mixed' });
    }
    // else: digit-free / too short with no family match → not flagged (see KNOWN GAP).
  }

  return findings;
}
