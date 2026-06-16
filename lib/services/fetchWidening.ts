/**
 * Fetch-widening helper for per-attribute acceptance criteria (Decision #238, Step 2).
 *
 * Acceptance criteria (a ±% `range` band or a discrete `set` checklist) relax SCORING.
 * For attributes that drive the candidate *search keyword* (resistance / capacitance /
 * package), the fetch must also widen — otherwise a ±10% band on resistance re-scores
 * the same pool and surfaces no new parts. This module is the single source of truth
 * for two consumers that MUST agree:
 *
 *   1. the fetch path (`fetchDigikeyCandidates`, `fetchAtlasCandidates`) — which parts
 *      to actually pull, and
 *   2. `buildBaseRecsVariant`'s cache key (`fetchWideningKey`) — so the base candidate
 *      cache is partitioned by the same widening that produced it.
 *
 * If these two read different eligibility sets, the cache key can claim "widened" while
 * the fetch wasn't (or vice versa). Both read the constants and helpers below.
 *
 * All numeric math is in base SI (Ω, F) — `param.numericValue` is base SI for both
 * Digikey-source parts (digikeyMapper `extractNumericValue`) and Atlas parts at ingest
 * (Decision #217). Units are reattached only at the Digikey keyword boundary.
 */

import type { AcceptanceCriteria, AcceptanceCriterion } from '../types';

/** Cap on fan-out breadth (number of keyword queries per widened attribute). Bounds
 *  added Digikey latency + API-call budget. A wide band on a dense series is clamped. */
export const MAX_WIDEN_QUERIES = 8;

/** Range-criterion attributes whose ±% band widens the candidate FETCH. Mirrors the UI's
 *  `RANGE_ELIGIBLE_ATTRIBUTE_IDS` (AttributesPanel.tsx) — every numeric attribute the UI
 *  offers a band on now widens the Atlas fetch via the generic numeric-range RPC (no value
 *  enumeration needed). The Digikey keyword fan-out is the narrower part (see
 *  ESERIES_ENUMERABLE_ATTRS) — non-E-series attrs widen on Atlas only.
 *  KEEP IN SYNC with RANGE_ELIGIBLE_ATTRIBUTE_IDS in components/AttributesPanel.tsx. */
export const RANGE_FETCH_ATTRS = new Set<string>([
  // Passives — continuous values
  'resistance', 'resistance_r25',
  'capacitance', 'load_capacitance_pf',
  'inductance', 'impedance_100mhz',
  'varistor_voltage',
  // Frequency control
  'fsw', 'nominal_frequency_hz', 'output_frequency_hz',
  // Discrete-semiconductor continuous values
  'vz', 'vrwm', 'vbr', 'izt', 'trip_current', 'hold_current',
  // ICs — continuous values
  'output_voltage', 'input_logic_threshold',
]);

/** Subset of RANGE_FETCH_ATTRS whose stocked values follow the standard E-series grid,
 *  so the Digikey keyword fan-out can enumerate near-value neighbors. Everything NOT here
 *  widens on the Atlas side only (numeric BETWEEN, no enumeration) and keeps its exact-value
 *  Digikey query via the default keyword. `load_capacitance_pf` is deliberately ABSENT:
 *  crystal load capacitances are a discrete catalog (8/9/12.5/18/20/32 pF), not an E-series
 *  continuum. `inductance` IS here: inductors are stocked at E6/E12/E24 values like resistors.
 *  Voltages/frequencies/impedance are deferred (non-E-series; need a value grid or the
 *  full parametric filter — see BACKLOG). */
export const ESERIES_ENUMERABLE_ATTRS = new Set<string>([
  'resistance', 'resistance_r25', 'capacitance', 'inductance',
]);

/** Set-criterion attributes whose accepted-values checklist widens the FETCH.
 *  `package_case` is keyword-driving (one query per accepted package). AEC qualification
 *  sets are NOT here — those parts are already in the pool and handled by the scoring
 *  modifier, so including them would needlessly bust the base cache. */
export const SET_FETCH_ATTRS = new Set<string>([
  'package_case',
]);

/** Whether a given (attributeId, criterion) pair drives a fetch widening. */
export function isFetchWideningCriterion(attributeId: string, criterion: AcceptanceCriterion): boolean {
  if (criterion.kind === 'range') return RANGE_FETCH_ATTRS.has(attributeId);
  return SET_FETCH_ATTRS.has(attributeId);
}

/** Unit class for keyword formatting — derived from the attributeId. */
function unitClassFor(attributeId: string): 'resistance' | 'capacitance' | 'inductance' | null {
  if (attributeId === 'resistance' || attributeId === 'resistance_r25') return 'resistance';
  if (attributeId === 'capacitance' || attributeId === 'load_capacitance_pf') return 'capacitance';
  if (attributeId === 'inductance') return 'inductance';
  return null;
}

/**
 * Project acceptance criteria down to the fetch-affecting subset, in a canonical,
 * order-stable shape for the base cache key. Returns null when nothing widens the
 * fetch (so rescore-only changes — AEC sets, context, non-keyword ranges — keep
 * hitting the base cache and the Decision #163 fast path).
 */
export function fetchWideningKey(
  criteria: AcceptanceCriteria | undefined,
): Array<{ attr: string; kind: 'range'; percent: number } | { attr: string; kind: 'set'; values: string[] }> | null {
  if (!criteria) return null;
  const out: Array<{ attr: string; kind: 'range'; percent: number } | { attr: string; kind: 'set'; values: string[] }> = [];
  for (const attr of Object.keys(criteria).sort()) {
    const c = criteria[attr];
    if (!isFetchWideningCriterion(attr, c)) continue;
    if (c.kind === 'range') out.push({ attr, kind: 'range', percent: c.percent });
    else out.push({ attr, kind: 'set', values: [...c.values].map(v => v.trim()).filter(Boolean).sort() });
  }
  return out.length ? out : null;
}

/** Translate a `range` criterion + the source value (base SI) into [lo, hi] bounds.
 *  Null for non-range criteria or a missing/invalid source value. */
export function criterionToBounds(
  criterion: AcceptanceCriterion,
  sourceNumericValueSI: number | undefined,
): { lo: number; hi: number } | null {
  if (criterion.kind !== 'range') return null;
  if (typeof sourceNumericValueSI !== 'number' || !isFinite(sourceNumericValueSI) || sourceNumericValueSI <= 0) return null;
  const f = criterion.percent / 100;
  return { lo: sourceNumericValueSI * (1 - f), hi: sourceNumericValueSI * (1 + f) };
}

/** Accepted values of a `set` criterion (trimmed, de-duped), for keyword fan-out. */
export function criterionToValueSet(criterion: AcceptanceCriterion): string[] | null {
  if (criterion.kind !== 'set') return null;
  const seen = new Set<string>();
  for (const v of criterion.values) {
    const t = v.trim();
    if (t) seen.add(t);
  }
  return seen.size ? [...seen] : null;
}

/** Standard E-series mantissas (1.0–10.0 decade), most significant value families. */
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/**
 * Enumerate standard E-series values (base SI) intersecting [lo, hi]. Walks every
 * decade the band spans. Resistance uses the dense E24 grid, capacitance the coarser
 * E12 (caps are rarely stocked at full E24, so E24 would spend fan-out queries on
 * values that don't exist). Result is ascending and clamped to MAX_WIDEN_QUERIES.
 */
export function inBandESeriesValues(lo: number, hi: number, series: 'E24' | 'E12' = 'E24'): number[] {
  if (!(lo > 0) || !(hi > 0) || hi < lo) return [];
  const mantissas = series === 'E12' ? E12 : E24;
  const loDecade = Math.floor(Math.log10(lo));
  const hiDecade = Math.floor(Math.log10(hi));
  const values: number[] = [];
  for (let d = loDecade; d <= hiDecade; d++) {
    const scale = Math.pow(10, d);
    for (const m of mantissas) {
      const v = m * scale;
      // round to mitigate float drift (e.g. 4.7 * 1000 = 4699.9999…)
      const rv = Number(v.toPrecision(12));
      if (rv >= lo && rv <= hi) values.push(rv);
    }
  }
  values.sort((a, b) => a - b);
  if (values.length > MAX_WIDEN_QUERIES) {
    // keep a representative spread (endpoints + evenly-sampled middle) rather than a
    // contiguous low slice, so a wide band doesn't bias to the smallest values.
    const picked: number[] = [];
    const step = (values.length - 1) / (MAX_WIDEN_QUERIES - 1);
    for (let i = 0; i < MAX_WIDEN_QUERIES; i++) picked.push(values[Math.round(i * step)]);
    return [...new Set(picked)];
  }
  return values;
}

/** Trim trailing-zero noise from a formatted number ("4.70" → "4.7", "10.0" → "10"). */
function trimNum(n: number): string {
  return Number(n.toPrecision(6)).toString();
}

/**
 * Format a base-SI value into a Digikey-style search keyword token for the given
 * attribute's unit class. Inverse of digikeyMapper `extractNumericValue` SI-prefixing.
 *   resistance: 4700 → "4.7k", 1e6 → "1M", 330 → "330"
 *   capacitance: 1e-7 → "100nF", 4.7e-6 → "4.7µF", 1e-11 → "10pF"
 *   inductance: 4.7e-6 → "4.7µH", 1e-2 → "10mH", 1e-7 → "100nH"
 * Returns null if the attribute has no recognized unit class.
 */
export function formatValueForKeyword(numericSI: number, attributeId: string): string | null {
  const cls = unitClassFor(attributeId);
  if (cls === null || !isFinite(numericSI) || numericSI <= 0) return null;

  if (cls === 'resistance') {
    if (numericSI >= 1e6) return `${trimNum(numericSI / 1e6)}M`;
    if (numericSI >= 1e3) return `${trimNum(numericSI / 1e3)}k`;
    if (numericSI < 1) return `${trimNum(numericSI * 1e3)}mOhm`;  // current-sense / milliohm parts
    return `${trimNum(numericSI)}`;
  }
  if (cls === 'inductance') {  // base SI = henries
    if (numericSI >= 1) return `${trimNum(numericSI)}H`;
    if (numericSI >= 1e-3) return `${trimNum(numericSI / 1e-3)}mH`;
    if (numericSI >= 1e-6) return `${trimNum(numericSI / 1e-6)}µH`;
    return `${trimNum(numericSI / 1e-9)}nH`;
  }
  // capacitance (base SI = farads)
  if (numericSI >= 1e-6) return `${trimNum(numericSI / 1e-6)}µF`;
  if (numericSI >= 1e-9) return `${trimNum(numericSI / 1e-9)}nF`;
  return `${trimNum(numericSI / 1e-12)}pF`;
}

/**
 * Build the set of substitute keyword tokens for a `range`-widened keyword attribute:
 * the in-band E-series values formatted as Digikey tokens. Empty if the attr isn't a
 * keyword-formattable unit class or the bounds are invalid.
 */
export function rangeKeywordTokens(
  attributeId: string,
  criterion: AcceptanceCriterion,
  sourceNumericValueSI: number | undefined,
): string[] {
  const bounds = criterionToBounds(criterion, sourceNumericValueSI);
  if (!bounds) return [];
  // Only enumerate E-series neighbors for attrs whose values actually follow the grid.
  // Non-enumerable attrs (e.g. load_capacitance_pf) widen via the Atlas numeric RPC +
  // the preserved default Digikey keyword, not a synthetic E-series fan-out.
  if (!ESERIES_ENUMERABLE_ATTRS.has(attributeId)) return [];
  // Resistors are densely stocked at E24; capacitors and inductors at the coarser E12
  // (E24 would spend fan-out queries on values that aren't stocked).
  const series = unitClassFor(attributeId) === 'resistance' ? 'E24' : 'E12';
  const values = inBandESeriesValues(bounds.lo, bounds.hi, series);
  const tokens: string[] = [];
  for (const v of values) {
    const t = formatValueForKeyword(v, attributeId);
    if (t) tokens.push(t);
  }
  return [...new Set(tokens)];
}
