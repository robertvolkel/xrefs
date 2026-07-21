/**
 * Mapping Health — pure detection core.
 *
 * Answers one question about a parameter mapping: **does the data agree with
 * the mapping?** Nothing here does I/O, so every rule is unit-testable and
 * mutation-testable in isolation. The I/O shell lives in
 * `mappingHealthCompute.ts`.
 *
 * ── Why the rules look like this ────────────────────────────────────────────
 * Two obvious-sounding rules were measured against the live corpus and BOTH
 * were false. They are recorded here because they will look attractive again:
 *
 *   ✗ "Two mappings for one attribute declare different units ⇒ one is wrong."
 *     `unit` is the SOURCE unit — what the incoming vendor value is in. Two
 *     vendor spellings legitimately differ: `ir(ma)`→mA and `ir(µa)`→µA both
 *     feed `ir_leakage` and both are correct. Measured: of 46 attributes with
 *     >1 declared unit, 31 are pure SI-prefix differences and most of the rest
 *     are spelling variants (Ω/Ohm, ℃/W vs °C/W, bytes/B).
 *
 *   ✗ "The declared unit contradicts the parameter name's parenthetical."
 *     In electronics a parenthetical is usually a TEST CONDITION, not the
 *     value's unit: `vf@ if (a)` is forward VOLTAGE at test current If, so `V`
 *     is right and `(a)` is a decoy. `vgs(th) [typ v]` — `(th)` is a subscript.
 *     `scripts/atlas-audit-paramname-unit-mismatch.mjs` implements this rule and
 *     is 96.0% false positives (824 of 858 flagged differ only by letter case,
 *     because param_name is stored lowercased — 0 of 2,033 rows carry any
 *     uppercase — while the declared unit preserves case, and it compares
 *     case-sensitively on purpose). Do NOT write its "fix script".
 *
 * Both failures share a shape: they compare a CLAIM against another CLAIM.
 * Every rule below compares a claim against OBSERVED VALUES.
 */

import { extractNumericWithPrefix, isMissingValue } from './atlasMapper';

// ── Units ───────────────────────────────────────────────────────────────────

/**
 * The physical quantity a unit measures. Comparing quantities (rather than
 * unit strings) is what makes `Ω` == `Ohm` and `mA` == `A` while keeping
 * volts != amps.
 */
export type Quantity =
  | 'voltage'
  | 'current'
  | 'resistance'
  | 'capacitance'
  | 'inductance'
  | 'frequency'
  | 'power'
  | 'energy'
  | 'charge'
  | 'time'
  | 'temperature'
  | 'thermal_resistance'
  | 'length'
  | 'angle'
  | 'count'
  | 'data_size'
  | 'ratio'
  | 'gain'
  | 'unknown';

/**
 * Folds the spelling variants that mean the same unit, WITHOUT touching the
 * SI prefix (m vs M is 1e9 apart and is exactly what we audit).
 *
 * Case is preserved for the prefix character; the unit ATOM is canonicalized.
 */
export function normalizeUnitSpelling(unit: string | null | undefined): string | null {
  if (unit === null || unit === undefined) return null;
  let s = String(unit).trim().replace(/\s+/g, '');
  if (!s) return null;
  // micro sign (U+00B5) and Greek small mu (U+03BC) are different code points
  s = s.replace(/[μµ]/g, 'u');
  // ohm sign (U+2126) and Greek capital omega (U+03A9), plus the spelled form
  s = s.replace(/[ΩΩ]/g, 'ohm').replace(/[Oo][Hh][Mm]s?/g, 'ohm');
  // degree variants: masculine ordinal (U+00BA), degree sign (U+00B0),
  // and the CJK compatibility degree-celsius glyph ℃ (U+2103)
  s = s.replace(/º/g, '°').replace(/℃/g, '°C');
  return s;
}

/**
 * Unit atoms, longest-first so 'Hz' wins over 'H' and 'sps' over 's'.
 *
 * ⚠️ Anything absent from this list resolves to `unknown`, and an `unknown`
 * quantity never contradicts anything — so a MISSING atom silently disables
 * detection rather than causing a false alarm. That is the safe direction, but
 * it means the list has to cover what the corpus actually ships. The Chinese
 * count/angle units below are here because the motivating example (an LED
 * attribute fed colours, wavelengths AND beam angles) is invisible without
 * them: `120°` alone would parse as `unknown` and the clash would never fire.
 */
const UNIT_ATOMS: ReadonlyArray<readonly [string, Quantity]> = [
  ['ohm', 'resistance'],
  ['sps', 'frequency'],
  ['bytes', 'data_size'],
  ['byte', 'data_size'],
  ['°C/W', 'thermal_resistance'],
  ['°C', 'temperature'],
  ['Hz', 'frequency'],
  ['dBm', 'power'],
  ['dB', 'gain'],
  ['VA', 'power'],
  ['Wh', 'energy'],
  ['Ah', 'charge'],
  ['eV', 'energy'],
  ['V', 'voltage'],
  ['A', 'current'],
  ['F', 'capacitance'],
  ['H', 'inductance'],
  ['W', 'power'],
  ['J', 'energy'],
  ['C', 'charge'],
  // ⚠️ Bare 'K' is deliberately NOT kelvin. In this corpus it overwhelmingly
  // means kilo — "16K" is 16 kilobytes of flash, "30K" is 30 kV of ESD
  // withstand. Reading it as kelvin produced confident CERTAIN findings against
  // three mappings that were entirely correct. It stays in SI_PREFIXES, so a
  // bare 'K' now resolves to `unknown` and accuses nobody. Colour temperature
  // ("5700K") is the cost of that choice: also unknown, so a genuine
  // temperature is missed rather than a correct mapping being libelled.
  ['s', 'time'],
  ['m', 'length'],
  ['B', 'data_size'],
  ['b', 'data_size'],
  // Angle — bare degree sign. Must come AFTER '°C' above (longest-first) or
  // every temperature reads as an angle.
  ['°', 'angle'],
  ['deg', 'angle'],
  // Count units. ⚠️ The CJK ones are reachable only from a DECLARED unit:
  // `observedUnitOf` delegates to the mapper's `extractNumericWithPrefix`,
  // whose unit character class is `[a-zA-ZµΩ°%/√]` and therefore cannot
  // capture a CJK suffix — "2位" parses as a BARE number. Deliberately not
  // fixed with a second parser here: the detector must read a value exactly
  // the way ingest does, and a private parser would drift from the one that
  // actually stores the data. Consequence to remember: CJK-suffixed values
  // inflate the `bare` count.
  ['位', 'count'],
  ['段', 'count'],
  ['排', 'count'],
  ['个', 'count'],
  ['pin', 'count'],
];

/** SI prefixes, longest-first. Order matters: 'da' before 'd'. */
const SI_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ['da', 1e1],
  ['f', 1e-15],
  ['p', 1e-12],
  ['n', 1e-9],
  ['u', 1e-6],
  ['m', 1e-3],
  ['c', 1e-2],
  ['d', 1e-1],
  ['k', 1e3],
  ['K', 1e3],
  ['M', 1e6],
  ['G', 1e9],
  ['T', 1e12],
];

/**
 * Splits a unit into its SI prefix multiplier and its base atom.
 *
 * `mm` is millimetres, NOT milli-metres-of-something-else — but that IS
 * prefix m + atom m, so it falls out correctly. `MSL` and `no` are guarded in
 * `_applyUnitPrefixCore`; here they simply fail to match a known atom and
 * return `unknown`, which is the safe outcome (an unknown quantity never
 * contradicts anything).
 */
export function splitUnit(unit: string | null | undefined): {
  multiplier: number;
  prefix: string;
  atom: string;
  quantity: Quantity;
} | null {
  const s = normalizeUnitSpelling(unit);
  if (!s) return null;

  // Exact atom match first — so bare 'm' is metres, not milli-nothing, and
  // bare 'T' is tesla-ish rather than tera.
  for (const [atom, quantity] of UNIT_ATOMS) {
    if (s === atom) return { multiplier: 1, prefix: '', atom, quantity };
  }
  // Percent and ppm are dimensionless ratios with no prefix.
  if (s === '%') return { multiplier: 1, prefix: '', atom: '%', quantity: 'ratio' };
  if (/^ppm/i.test(s)) return { multiplier: 1, prefix: '', atom: 'ppm', quantity: 'ratio' };

  for (const [prefix, multiplier] of SI_PREFIXES) {
    if (!s.startsWith(prefix)) continue;
    const rest = s.slice(prefix.length);
    if (!rest) continue;
    for (const [atom, quantity] of UNIT_ATOMS) {
      if (rest === atom) return { multiplier, prefix, atom, quantity };
    }
  }
  return null;
}

/** The physical quantity a unit measures, or 'unknown' if unrecognised. */
export function quantityOf(unit: string | null | undefined): Quantity {
  return splitUnit(unit)?.quantity ?? 'unknown';
}

// ── Observed values ─────────────────────────────────────────────────────────

/**
 * The unit a real vendor value carries, if any. Reuses the mapper's own
 * parser (`extractNumericWithPrefix`) so the detector reads a value exactly
 * the way ingest does — a second parser here would drift from the one that
 * actually stores the data.
 *
 * Returns `undefined` for a BARE number ("48"), which is the case that makes
 * the declared unit load-bearing.
 */
export function observedUnitOf(value: string): string | undefined {
  const { parsedUnit } = extractNumericWithPrefix(value);
  if (!parsedUnit) return undefined;
  return splitUnit(parsedUnit) ? parsedUnit : undefined;
}

/**
 * True when a value carries no number at all (a colour, a package, a name).
 *
 * ⚠️ A MISSING placeholder is not categorical — it is nothing. Ingest treats
 * "-", "/", "" and "N/A" as absent, and so must this. Without that check every
 * parameter whose sample happened to be mostly placeholders looked like a text
 * parameter, and "text" then clashed with its numeric siblings: it produced 20
 * of 29 findings on the first real run, all false.
 */
export function isCategoricalValue(value: string): boolean {
  if (isMissingValue(String(value))) return false;
  const { numericValue } = extractNumericWithPrefix(value);
  return numericValue === undefined || Number.isNaN(numericValue);
}

/**
 * What a set of real values says about itself.
 *
 * `bare` is the count of numeric values carrying NO unit — the only values for
 * which the mapping's declared unit changes the stored number. A prefix
 * disagreement with zero bare values is harmless and must not be reported.
 */
export interface ValueProfile {
  /** Values that say something — placeholders excluded. */
  total: number;
  /** Values that were "-", "/", "" or "N/A". Evidence in neither direction. */
  missing: number;
  categorical: number;
  bare: number;
  /** unit string → how many values carried it */
  unitCounts: Record<string, number>;
  /** quantity → how many values implied it */
  quantityCounts: Partial<Record<Quantity, number>>;
  /** The unit carried by the most values, if any. */
  dominantUnit?: string;
  /** The quantity implied by the most values, if any. */
  dominantQuantity?: Quantity;
}

export function profileValues(values: readonly string[]): ValueProfile {
  const unitCounts: Record<string, number> = {};
  const quantityCounts: Partial<Record<Quantity, number>> = {};
  let categorical = 0;
  let bare = 0;

  let missing = 0;
  for (const raw of values) {
    if (raw === null || raw === undefined) continue;
    const value = String(raw);
    // Absent values carry no evidence in either direction — they must not
    // count toward `total` or any share, or a placeholder-heavy sample
    // silently rewrites every ratio below.
    if (isMissingValue(value)) {
      missing++;
      continue;
    }
    if (isCategoricalValue(value)) {
      categorical++;
      continue;
    }
    const unit = observedUnitOf(value);
    if (!unit) {
      bare++;
      continue;
    }
    const canonical = normalizeUnitSpelling(unit) as string;
    unitCounts[canonical] = (unitCounts[canonical] ?? 0) + 1;
    const q = quantityOf(unit);
    quantityCounts[q] = (quantityCounts[q] ?? 0) + 1;
  }

  const topOf = <T extends string>(counts: Record<string, number>): T | undefined => {
    let best: string | undefined;
    let bestN = 0;
    // Deterministic on ties: lexicographically smallest key wins, so a finding
    // id computed from this never flip-flops between runs.
    for (const key of Object.keys(counts).sort()) {
      if (counts[key] > bestN) {
        best = key;
        bestN = counts[key];
      }
    }
    return best as T | undefined;
  };

  return {
    // `total` counts values that SAY something. Placeholders are excluded so
    // every share computed from it is a share of real evidence.
    total: values.length - missing,
    missing,
    categorical,
    bare,
    unitCounts,
    quantityCounts,
    dominantUnit: topOf(unitCounts),
    dominantQuantity: topOf(quantityCounts as Record<string, number>) as Quantity | undefined,
  };
}

// ── Findings ────────────────────────────────────────────────────────────────

export type FindingKind =
  /** The mapping declares a unit measuring a different quantity than the values. */
  | 'unit_quantity_mismatch'
  /** Same quantity, wrong SI prefix — only reported when bare values exist. */
  | 'unit_prefix_mismatch'
  /** One attribute is fed values of two or more different quantities. */
  | 'quantity_clash';

export type Severity = 'certain' | 'likely' | 'review';

export interface MappingUnderTest {
  /** familyId (B1, C6) or L2 category name. */
  scope: string;
  /** Lowercased vendor parameter name, as stored. */
  paramName: string;
  attributeId: string;
  declaredUnit?: string | null;
  /** Where the mapping came from, so a fix can target it. */
  source: 'code' | 'db';
  overrideId?: string;
  /** Real values observed for THIS param in THIS scope. */
  values: readonly string[];
  /** Products carrying this param in this scope. */
  productCount: number;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  scope: string;
  attributeId: string;
  /** The parameter(s) the finding is about. */
  params: Array<{
    paramName: string;
    declaredUnit?: string | null;
    source: 'code' | 'db';
    overrideId?: string;
    sampleValues: string[];
    productCount: number;
    observedUnit?: string;
    observedQuantity?: Quantity;
  }>;
  /** Plain-language statement of what the data shows. No jargon. */
  evidence: string;
  /** Products whose stored number/value is affected. */
  affectedProducts: number;
}

/**
 * Stable across recomputes so a human decision sticks to the thing it judged.
 * Deliberately NOT hashed — a readable id is debuggable in a log.
 */
export function findingId(kind: FindingKind, scope: string, attributeId: string, paramName?: string): string {
  return [kind, scope, attributeId, paramName ?? ''].join('::');
}

/** How many values must be seen before a verdict is allowed. */
export const MIN_VALUES_FOR_VERDICT = 4;

/** A quantity must hold at least this share of values to count as real signal. */
export const MIN_QUANTITY_SHARE = 0.15;

/**
 * Rule 3 — the mapping's declared unit vs the param's OWN observed values.
 *
 * Only unit-carrying values are used as ground truth. The declared unit is
 * judged against them, and the blast radius is the count of BARE values —
 * those are the ones whose stored number the declared unit actually sets
 * (`effectiveUnit = parsedUnit || dictUnit`).
 */
export function detectUnitMismatch(m: MappingUnderTest): Finding | null {
  const declared = normalizeUnitSpelling(m.declaredUnit);
  if (!declared) return null;

  const profile = profileValues(m.values);
  const withUnits = Object.values(profile.unitCounts).reduce((a, b) => a + b, 0);
  if (withUnits < MIN_VALUES_FOR_VERDICT) return null;
  if (!profile.dominantUnit) return null;

  const declaredSplit = splitUnit(declared);
  const observedSplit = splitUnit(profile.dominantUnit);
  if (!declaredSplit || !observedSplit) return null;

  // The dominant unit must actually dominate, or the param genuinely carries
  // mixed units and no single one is "the" ground truth.
  const dominantShare = profile.unitCounts[profile.dominantUnit] / withUnits;
  if (dominantShare < 0.6) return null;

  const base = {
    scope: m.scope,
    attributeId: m.attributeId,
    params: [
      {
        paramName: m.paramName,
        declaredUnit: m.declaredUnit,
        source: m.source,
        overrideId: m.overrideId,
        sampleValues: m.values.slice(0, 10).map(String),
        productCount: m.productCount,
        observedUnit: profile.dominantUnit,
        observedQuantity: observedSplit.quantity,
      },
    ],
  };

  if (declaredSplit.quantity !== observedSplit.quantity) {
    return {
      ...base,
      id: findingId('unit_quantity_mismatch', m.scope, m.attributeId, m.paramName),
      kind: 'unit_quantity_mismatch',
      severity: 'certain',
      evidence:
        `"${m.paramName}" is set to ${m.declaredUnit} (${declaredSplit.quantity.replace(/_/g, ' ')}), ` +
        `but its real values are in ${profile.dominantUnit} (${observedSplit.quantity.replace(/_/g, ' ')}) — ` +
        `for example ${sampleForEvidence(m.values)}.`,
      affectedProducts: m.productCount,
    };
  }

  if (declaredSplit.multiplier !== observedSplit.multiplier) {
    // Harmless unless some values are bare: a value that states its own unit
    // overrides the declared one, so only bare values are actually mis-scaled.
    if (profile.bare === 0) return null;
    const ratio = observedSplit.multiplier / declaredSplit.multiplier;
    return {
      ...base,
      id: findingId('unit_prefix_mismatch', m.scope, m.attributeId, m.paramName),
      kind: 'unit_prefix_mismatch',
      severity: 'likely',
      evidence:
        `"${m.paramName}" is set to ${m.declaredUnit}, but its real values are in ` +
        `${profile.dominantUnit} — for example ${sampleForEvidence(m.values)}. ` +
        `${profile.bare} of the values checked have no unit written on them, so those are ` +
        `stored ${formatRatio(ratio)} off.`,
      affectedProducts: Math.round(m.productCount * (profile.bare / Math.max(1, profile.total))),
    };
  }

  return null;
}

/**
 * Rule 4 — one attribute fed genuinely different quantities.
 *
 * This is the `color` case: an attribute holding colours AND wavelengths AND
 * angles. A part holds ONE value per attribute, so every extra quantity is a
 * parameter that loses its slot on every product.
 */
export function detectQuantityClash(scope: string, attributeId: string, mappings: readonly MappingUnderTest[]): Finding | null {
  if (mappings.length < 2) return null;

  const perParam = mappings.map((m) => ({ m, profile: profileValues(m.values) }));

  // A param's own quantity: its dominant observed quantity, or 'categorical'
  // when its values carry no numbers at all (a colour, a package code).
  const CATEGORICAL = '__categorical__';
  const kindOf = (p: (typeof perParam)[number]): string | null => {
    if (p.profile.total < MIN_VALUES_FOR_VERDICT) return null;
    const numeric = p.profile.total - p.profile.categorical;
    if (p.profile.categorical / p.profile.total >= 0.6) return CATEGORICAL;
    if (numeric === 0) return null;
    if (!p.profile.dominantQuantity || p.profile.dominantQuantity === 'unknown') return null;
    const share = (p.profile.quantityCounts[p.profile.dominantQuantity] ?? 0) / numeric;
    return share >= 0.6 ? p.profile.dominantQuantity : null;
  };

  const byKind = new Map<string, Array<(typeof perParam)[number]>>();
  for (const p of perParam) {
    const k = kindOf(p);
    if (!k) continue;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(p);
  }
  if (byKind.size < 2) return null;

  const totalProducts = perParam.reduce((a, p) => a + p.m.productCount, 0);
  // Ignore a kind supported by a trivial share of products — one stray product
  // is a data-entry oddity, not a mapping error.
  const meaningful = [...byKind.entries()].filter(
    ([, ps]) => ps.reduce((a, p) => a + p.m.productCount, 0) / Math.max(1, totalProducts) >= MIN_QUANTITY_SHARE,
  );
  if (meaningful.length < 2) return null;

  const describe = (k: string) => (k === CATEGORICAL ? 'text (not a measurement)' : k.replace(/_/g, ' '));
  // Deterministic ordering so the evidence string is stable across runs.
  meaningful.sort((a, b) => a[0].localeCompare(b[0]));

  const params = perParam
    .filter((p) => meaningful.some(([, ps]) => ps.includes(p)))
    .map((p) => ({
      paramName: p.m.paramName,
      declaredUnit: p.m.declaredUnit,
      source: p.m.source,
      overrideId: p.m.overrideId,
      sampleValues: p.m.values.slice(0, 10).map(String),
      productCount: p.m.productCount,
      observedUnit: p.profile.dominantUnit,
      observedQuantity: p.profile.dominantQuantity,
    }));

  // Products that can only keep one of the competing values.
  const sorted = meaningful
    .map(([, ps]) => ps.reduce((a, p) => a + p.m.productCount, 0))
    .sort((a, b) => b - a);
  const affected = sorted.slice(1).reduce((a, b) => a + b, 0);

  return {
    id: findingId('quantity_clash', scope, attributeId),
    kind: 'quantity_clash',
    severity: meaningful.length > 2 ? 'certain' : 'likely',
    scope,
    attributeId,
    params,
    evidence:
      `"${attributeId}" is being fed ${meaningful.length} different kinds of value — ` +
      meaningful.map(([k, ps]) => `${describe(k)} (${ps.map((p) => `"${p.m.paramName}"`).join(', ')})`).join('; ') +
      `. Each product can only keep one, so the others are lost.`,
    affectedProducts: affected,
  };
}

/** Up to three real values, quoted, for a plain-language evidence line. */
function sampleForEvidence(values: readonly string[]): string {
  const seen: string[] = [];
  for (const v of values) {
    const s = String(v).trim();
    if (s && !seen.includes(s)) seen.push(s);
    if (seen.length === 3) break;
  }
  return seen.map((s) => `"${s}"`).join(', ');
}

/** "1,000× too small" / "1,000× too large" — readable, no exponent notation. */
function formatRatio(ratio: number): string {
  const magnitude = ratio > 1 ? ratio : 1 / ratio;
  const rounded = Math.round(magnitude);
  const pretty = rounded.toLocaleString('en-US');
  return ratio > 1 ? `${pretty}× too small` : `${pretty}× too large`;
}
