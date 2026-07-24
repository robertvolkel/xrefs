/**
 * Spec-VALUE observe detector (chat redesign, Phase 1 prerequisite; docs/mpn-grounding-gate-plan.md).
 *
 * The MPN detector catches fabricated PART NUMBERS. It is deliberately blind to bare numbers
 * and value+unit tokens (mpnDetector skips them), so a *spec value the model typed from memory*
 * — "aim for >90% efficiency", "pick a 50 V-rated part", "≈100 mΩ Rds(on)" — is UNCAUGHT. Track A
 * feeds the model more engineering material to reason over, which widens exactly this surface.
 *
 * This module is the OBSERVE instrument for it: given a drafted assistant message and the set of
 * spec values the turn actually grounds (the source part's attributes, any looked-up part's
 * attributes, and the values the USER themselves stated), it extracts every value+unit token the
 * model wrote and flags the ones that DON'T trace to a grounded value. It NEVER modifies the
 * message and NEVER enforces — inverse error economics (the gate plan): stripping a *true* spec is
 * the "crippling usefulness" failure, so spec values are measured for weeks, never hard-stripped.
 *
 * Deliberately CONSERVATIVE about calling a token "grounded": a false "grounded" hides a real
 * leak (the dangerous direction), while a false "ungrounded" only adds analyzable noise. So a
 * numeric match REQUIRES the unit to agree — a "50 A" in prose is never grounded by a known "50 V".
 *
 * Pure + side-effect-free, so it's unit-testable; the Supabase sink is separate (specValueLogger).
 */

/** SI-prefix → multiplier. Case-sensitive on purpose (m = milli, M = mega). */
const PREFIX_MULTIPLIER: Record<string, number> = {
  '': 1,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6, // micro sign U+00B5
  μ: 1e-6, // greek mu U+03BC
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/** Normalize a raw unit spelling to a comparison key (prefix already separated). */
function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === 'ω' || u === 'ohm' || u === 'ohms') return 'ohm';
  if (u === '℃' || u === '°c' || u === 'c') return 'c';
  // Word-forms → the symbol key, so "50 volts" grounds against a known "50 V" (and the
  // assistant echoing a user's word-form spec isn't false-flagged). See SPEC_TOKEN.
  if (u === 'volt' || u === 'volts') return 'v';
  if (u === 'amp' || u === 'amps' || u === 'ampere' || u === 'amperes') return 'a';
  if (u === 'watt' || u === 'watts') return 'w';
  if (u === 'farad' || u === 'farads') return 'f';
  if (u === 'henry' || u === 'henries' || u === 'henrys') return 'h';
  if (u === 'hertz') return 'hz';
  return u;
}

/** The bare (prefix-free) electronics units this detector understands, as normalized keys.
 *  A known-side unit is only prefix-stripped when its remainder lands in THIS set — so "F"/"s"
 *  (no prefix) and "ppm"/"bps" (prefix-char lead, non-unit remainder) are never mangled. */
const BARE_UNITS = new Set(['v', 'a', 'w', 'ohm', 'f', 'h', 'hz', 's', 'c', 'db', 'ppm', 'bps', 'sps']);

/** SI-prefix chars AFTER lowercasing (so 'M'→'m', 'K'→'k', 'G'→'g', 'T'→'t' fold in). Used only to
 *  decide whether to strip a leading prefix off a known unit — magnitude is already in baseSI. */
const LOWER_PREFIX_CHARS = new Set(['p', 'n', 'u', 'µ', 'μ', 'm', 'k', 'g', 't']);

/** Whole units that coincidentally read as "SI-prefix + bare unit" but are a DISTINCT physical
 *  quantity — stripping them folds a real value onto the wrong unit, a FALSE 'grounded' that would
 *  HIDE a fabrication in the metric (the dangerous direction). 'gs' = gauss (NOT giga-seconds);
 *  confirmed present in the Atlas corpus (see Decision #280). Left as an accepted observe-only
 *  limitation: siemens ('s' after lowercasing) and millicoulomb ('mc'→celsius) are genuinely
 *  indistinguishable from milliseconds / a temperature without a unit ontology, and denying them
 *  would also kill legitimate ms/ns/µs time grounding — so only the unambiguous 'gs' is blocked. */
const AMBIGUOUS_WHOLE_UNITS = new Set(['gs']);

/**
 * A part attribute's `unit` carries its SI prefix baked in ("µF", "MHz", "mΩ"), but the token side
 * separates the prefix out (SPEC_TOKEN captures {prefix, unit} apart), so `tok.unit` is always bare
 * ("f", "hz", "ohm"). Comparing the raw known unit to the token unit therefore NEVER matched for any
 * prefixed unit — capacitance/inductance/frequency grounding was silently unreachable, inflating the
 * observed fabrication count. Strip a leading SI prefix from the known unit so both sides are bare —
 * but ONLY when the remainder is a real bare unit (the BARE_UNITS gate), so "F"/"s"/"ppm" are safe.
 */
function bareUnitKey(unit: string): string {
  const n = normalizeUnit(unit);
  if (n.length > 1 && !AMBIGUOUS_WHOLE_UNITS.has(n) && LOWER_PREFIX_CHARS.has(n[0])) {
    const rest = normalizeUnit(n.slice(1));
    if (BARE_UNITS.has(rest)) return rest;
  }
  return n;
}

// A value + optional space + optional single-char SI prefix + a known electronics unit, OR a bare
// percentage. The leading (?<![\w.]) stops it firing inside an MPN/identifier ("LM317T" → "317T").
// Prefix chars and unit are captured separately so "4.7kΩ" → {4.7, k, Ω}. Multi-char units (Hz)
// still work because the single-char prefix is matched first. Word-form units (volts/amps/…) come
// first in the alternation so they win over the single-letter symbols; the trailing (?![\w])
// boundary keeps them from firing on ordinary words ("5 apples", "5 hens").
const SPEC_TOKEN =
  /(?<![\w.])(\d+(?:\.\d+)?)\s?([pnuµμmkKMGT])?(volts?|amperes?|amps?|watts?|farads?|henr(?:ies|ys?)|hertz|ohms?|V|A|W|Ω|F|H|Hz|s|°C|℃|dB|ppm|bps|sps)(?![\w])|(?<![\w.])(\d+(?:\.\d+)?)\s?(%)/gi;

export interface ParsedSpecToken {
  /** As written, e.g. "50 V", "4.7kΩ", "90%". */
  token: string;
  value: number;
  prefix: string;
  unit: string; // normalized (e.g. 'v', 'ohm', 'c', '%')
  /** value × prefix multiplier, in base SI; null when the prefix is unknown. */
  baseSI: number | null;
  index: number;
}

/** Extract every spec-value token from a string (value+unit or bare percentage). Pure. */
export function extractSpecTokens(text: string): ParsedSpecToken[] {
  if (!text) return [];
  const out: ParsedSpecToken[] = [];
  SPEC_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPEC_TOKEN.exec(text)) !== null) {
    // Branch A: value + prefix? + unit. Branch B: value + '%'.
    const isPct = m[4] !== undefined;
    const rawValue = isPct ? m[4] : m[1];
    const rawPrefix = isPct ? '' : (m[2] ?? '');
    const rawUnit = isPct ? '%' : m[3];
    const value = parseFloat(rawValue);
    if (!Number.isFinite(value)) continue;
    const mult = PREFIX_MULTIPLIER[rawPrefix];
    out.push({
      token: m[0].trim(),
      value,
      prefix: rawPrefix,
      unit: normalizeUnit(rawUnit),
      baseSI: mult === undefined ? null : value * mult,
      index: m.index,
    });
  }
  return out;
}

/** A spec value the turn actually grounds — from a part's attributes or the user's own words. */
export interface KnownSpecValue {
  baseSI: number | null;
  unitKey: string | null;
  /** Normalized display form for a string fallback match ("50v", "4.7kω"). */
  display: string;
}

/** Normalize a display string for the fallback equality check (drop spaces, lowercase). */
function normDisplay(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * Build the known-value set from part attributes. Each `ParametricAttribute` carries a base-SI
 * `numericValue` (Decision #280) plus a `unit` and a display `value`. Accepts a loose shape so
 * callers can pass attributes without importing the full type here.
 */
export function knownValuesFromAttributes(
  attrLists: ReadonlyArray<
    ReadonlyArray<{ numericValue?: number; unit?: string; value?: string }> | undefined | null
  >,
): KnownSpecValue[] {
  const out: KnownSpecValue[] = [];
  for (const list of attrLists) {
    if (!list) continue;
    for (const p of list) {
      const display = typeof p.value === 'string' ? normDisplay(p.value) : '';
      out.push({
        baseSI: typeof p.numericValue === 'number' ? p.numericValue : null,
        // Prefix-stripped so a base-SI numericValue compares against a bare token unit
        // ("µF" known vs "f" token). See bareUnitKey.
        unitKey: p.unit ? bareUnitKey(p.unit) : null,
        display,
      });
    }
  }
  return out;
}

/** Turn a user's stated spec tokens into known values, so the assistant echoing them isn't a leak. */
export function knownValuesFromUserText(text: string): KnownSpecValue[] {
  return extractSpecTokens(text).map((t) => ({
    baseSI: t.baseSI,
    unitKey: t.unit,
    display: normDisplay(t.token),
  }));
}

const REL_TOL = 0.01;

function isGrounded(tok: ParsedSpecToken, known: ReadonlyArray<KnownSpecValue>): boolean {
  const tokDisplay = normDisplay(tok.token);
  for (const k of known) {
    // Numeric match REQUIRES unit agreement (never ground "50 A" against a known "50 V").
    if (
      tok.baseSI !== null &&
      k.baseSI !== null &&
      k.unitKey === tok.unit &&
      Math.abs(tok.baseSI - k.baseSI) <= REL_TOL * Math.max(Math.abs(k.baseSI), 1e-12)
    ) {
      return true;
    }
    // String fallback for values with no parseable numericValue on the known side.
    if (k.display && k.display === tokDisplay) return true;
  }
  return false;
}

export interface SpecValueFinding {
  token: string;
  value: number;
  unit: string;
  baseSI: number | null;
  reason: 'value-unit-unverified' | 'percentage-unverified';
  confidence: 'high' | 'medium';
  index: number;
}

/**
 * The observe pass: extract spec tokens from `message` and return those NOT grounded in `known`.
 * A value+unit is a `high`-confidence finding (a definite spec claim); a bare percentage is
 * `medium` (often a spec — efficiency/tolerance — but sometimes rhetorical "90% of the time").
 */
export function detectUngroundedSpecValues(
  message: string,
  known: ReadonlyArray<KnownSpecValue>,
): SpecValueFinding[] {
  const findings: SpecValueFinding[] = [];
  for (const tok of extractSpecTokens(message)) {
    if (isGrounded(tok, known)) continue;
    const isPct = tok.unit === '%';
    findings.push({
      token: tok.token,
      value: tok.value,
      unit: tok.unit,
      baseSI: tok.baseSI,
      reason: isPct ? 'percentage-unverified' : 'value-unit-unverified',
      confidence: isPct ? 'medium' : 'high',
      index: tok.index,
    });
  }
  return findings;
}
