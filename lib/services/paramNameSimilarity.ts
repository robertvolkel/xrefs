/**
 * Param-name similarity utilities for the Atlas Dictionary Triage queue.
 *
 * The Triage queue's cosmetic-variant fanout (Decision #186 part f) bulk-
 * applies one engineer Accept to syntactic siblings of the same paramName
 * within the same scope. This module is the canonical home for the
 * normalization + similarity functions that decide what counts as a sibling.
 *
 * Tier 1 (this module): deterministic, no AI, conservative on CJK.
 * Tier 2 (cluster-suggest endpoint): AI for semantic + CJK synonyms.
 *
 * Why Tier 1 is conservative on CJK:
 *   "电压_max" vs "电流_max" is Levenshtein distance 1 but means
 *   voltage_max vs current_max — opposite concepts. CJK characters
 *   each carry full semantic weight, so edit distance is not a safe
 *   proxy for similarity. Same logic for unit-suffix stripping:
 *   "电压(V)" and "电压(mV)" must NOT cluster because the unit drives
 *   the value scale and an engineer Accept would propagate the wrong unit.
 */

/** Normalize a paramName for cosmetic-variant grouping.
 *
 *  Pipeline:
 *   1. Lowercase
 *   2. Collapse runs of non-letter/non-digit characters to a single underscore
 *   3. Strip leading/trailing underscores
 *
 *  Uses Unicode property escapes (`\p{L}`, `\p{N}`) so CJK / Greek / Cyrillic
 *  characters are preserved — they carry meaning. Stripping them caused
 *  spurious collisions historically (e.g. "输入侧VCC电压(Max)(V)" and
 *  "输出侧VCC电压(Max)(V)" both collapsed to "vcc_max_v" with an ASCII-only
 *  regex, which bulk-applied an output-side override to an input-side row). */
export function normalizeParamKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

/** True if every code unit is in the 7-bit ASCII range. CJK / Greek /
 *  Cyrillic / accented Latin all fail. */
export function isAsciiOnly(s: string): boolean {
  return /^[\x00-\x7F]*$/.test(s);
}

/** Standard iterative Levenshtein distance with a two-row rolling buffer.
 *  Operates on UTF-16 code units, which is fine here because `isFuzzyMatch`
 *  gates this behind `isAsciiOnly` — every ASCII char is exactly one unit. */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Generic English/Chinese paramName stems that mean DIFFERENT concepts in
 *  different families (e.g. "Frequency" in C8 oscillators means nominal
 *  output Hz; in MLCC it's the impedance measurement test frequency). The
 *  Triage Find Similar (AI) modal surfaces a warning banner when the focal
 *  matches one of these — engineer should review per-candidate reasoning
 *  carefully before bulk-applying across scopes. Standardized industry
 *  terms (AEC-Q###, RoHS, MSL, package codes) are NOT here — those mean
 *  the same thing across every family. */
export const GENERIC_TERM_PARAMS: ReadonlyArray<string> = [
  'frequency',
  'voltage',
  'current',
  'capacitance',
  'inductance',
  'resistance',
  'power',
  'tolerance',
  'type',
  'style',
  'size',
  'level',
  'time',
  'rate',
];

/** True if the normalized paramName is one of the known context-dependent
 *  generic terms. Drives the cross-scope warning banner + prompt hardening. */
export function isGenericTerm(paramName: string): boolean {
  const key = normalizeParamKey(paramName);
  return GENERIC_TERM_PARAMS.includes(key);
}

/** Decide whether two NORMALIZED keys (output of `normalizeParamKey`) are
 *  close enough to be treated as the same param for bulk-Accept purposes.
 *
 *  Rules:
 *   - Exact match → always true.
 *   - Both keys ASCII-only AND min length ≥ 5 AND length diff ≤ 1 AND
 *     Levenshtein distance ≤ 1 → true. Catches single-char typos like
 *     "propagation_delay" vs "propogation_delay".
 *   - Otherwise → false.
 *
 *  Why ASCII-only: CJK code points carry full semantic weight, so a 1-char
 *  edit can flip meaning ("电压" vs "电流"). We refuse to fuzzy-match those
 *  here; the AI cluster-suggest path handles CJK synonyms with proper
 *  semantic understanding.
 *
 *  Why min length 5: at length 4, even ASCII keys like "vmax" / "vmin"
 *  collide at distance 2 — too tight a window for typos to dominate. */
export function isFuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (!isAsciiOnly(a) || !isAsciiOnly(b)) return false;
  const aLen = a.length;
  const bLen = b.length;
  if (Math.min(aLen, bLen) < 5) return false;
  if (Math.abs(aLen - bLen) > 1) return false;
  return levenshteinDistance(a, b) <= 1;
}
