import type { LogicTable, Part, PartAttributes, ParametricAttribute, SearchConstraint } from '../types';
import { getLogicTable, getLogicTableForSubcategory, resolveFamilyFromText } from '../logicTables';
import { _applyUnitPrefixCore, extractNumericWithPrefix } from './atlasMapper';

/**
 * Logic-vetted descriptive search (greenfield).
 *
 * When a chat search carries user-stated specs ("N-channel MOSFET, 12V, 5A"),
 * we vet the candidate set with the SAME matching engine used for
 * cross-references — by treating the stated specs as a *synthetic source part*.
 * This module turns the LLM's human-term `SearchConstraint`s into that synthetic
 * `PartAttributes`, classifies the family, and exposes the over-spec closeness
 * penalty used as a ranking tiebreak.
 *
 * Why a synthetic source works (verified in matchingEngine): a rule whose SOURCE
 * value is missing returns `pass` (evaluateIdentity / evaluateThreshold), so a
 * source carrying only the 2-3 constrained attributes doesn't dilute scoring —
 * unconstrained rules pass, constrained rules gate normally. An undersized
 * threshold (Vds 8V < 12V) or wrong identity (P-channel vs N) becomes a real
 * `fail` → sinks via `countRealMismatches`; an over-spec part (1200V for 12V)
 * passes the `gte` rule but earns a closeness penalty → sinks via the tiebreak.
 */

/** Sentinel MPN for the synthetic source. `findReplacements` filters out any
 *  candidate whose mpn equals the source mpn — this can never collide. */
export const SYNTHETIC_SOURCE_MPN = '__SEARCH_SPEC__';

/** Family-scoped synonyms for generic human terms the LLM may emit instead of a
 *  spec's full name. attributeName fuzzy-matching (below) covers descriptive
 *  phrases ("drain-source voltage"); this map covers the terse ones ("voltage").
 *  Unmapped terms are simply dropped (the constraint isn't applied) — always
 *  safe: vetting just relaxes, it never mis-vets. Extend per family as needed. */
const SYNONYMS: Record<string, Record<string, string>> = {
  B5: {
    voltage: 'vds_max', 'drain voltage': 'vds_max', 'drain-source voltage': 'vds_max', vds: 'vds_max', vdss: 'vds_max',
    current: 'id_max', 'drain current': 'id_max', 'continuous current': 'id_max', id: 'id_max',
    channel: 'channel_type', 'channel type': 'channel_type',
    power: 'pd', 'gate voltage': 'vgs_max',
    'rds on': 'rds_on', 'on resistance': 'rds_on', technology: 'technology',
  },
};

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Normalize a phrase to space-separated lowercase alphanumerics for whole-phrase,
 *  token-bounded matching (so "N-Channel" ≡ "n channel" and matches "…N-channel MOSFET"). */
const normPhrase = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** True when `phrase` appears as a token-bounded run inside `text` (both normalized),
 *  so "npn" matches "small-signal NPN" but not "PNP", and a ≥2-char floor avoids
 *  trivial single-letter hits. */
function phraseInText(phrase: string, text: string): boolean {
  const p = normPhrase(phrase);
  if (p.length < 2) return false;
  return ` ${normPhrase(text)} `.includes(` ${p} `);
}

/** Resolve a human attribute term to a logic-table attributeId for this family.
 *  Order: family synonym → exact attrId/attrName → attrName-contains-term →
 *  term-contains-attrId. Returns null when nothing matches (caller drops it). */
function resolveAttributeId(term: string, logicTable: LogicTable): string | null {
  const t = norm(term);
  if (!t) return null;

  const fam = SYNONYMS[logicTable.familyId];
  if (fam) {
    for (const [syn, id] of Object.entries(fam)) {
      if (norm(syn) === t) return id;
    }
  }

  for (const r of logicTable.rules) {
    if (norm(r.attributeId) === t || norm(r.attributeName) === t) return r.attributeId;
  }

  // Descriptive human phrase is usually a substring of the full attributeName
  // (e.g. "drain-source voltage" ⊂ "Drain-Source Voltage (Vds Max)"). Prefer the
  // shortest containing name (most specific).
  let best: string | null = null;
  let bestLen = Infinity;
  if (t.length >= 4) {
    for (const r of logicTable.rules) {
      const n = norm(r.attributeName);
      if (n.includes(t) && n.length < bestLen) {
        best = r.attributeId;
        bestLen = n.length;
      }
    }
  }
  if (best) return best;

  for (const r of logicTable.rules) {
    const aid = norm(r.attributeId);
    if (aid.length >= 4 && t.includes(aid)) return r.attributeId;
  }
  return null;
}

/** Adopt the catalog's OWN wording for a categorical code, learned from the candidate
 *  pool, so a user's terse value ("0805") byte-matches the catalog's verbose value
 *  ("0805 (2012 Metric)") in the identity comparison. Prefers an exact normalized hit;
 *  else the most common candidate whose FIRST token is the user's code. Returns null
 *  when nothing in the pool matches (the original value is kept — it simply won't match
 *  anything, which is correct: the pool genuinely has no such code). */
function canonicalizeCategorical(
  userValue: string,
  attrId: string,
  candidateAttrs: PartAttributes[],
): string | null {
  const target = norm(userValue);
  if (!target) return null;
  const leadCounts = new Map<string, number>();
  for (const cand of candidateAttrs) {
    const v = cand.parameters.find(p => p.parameterId === attrId)?.value?.trim();
    if (!v) continue;
    if (norm(v) === target) return v;                         // catalog uses the same form
    if (norm(v.split(/\s+/)[0]) === target) {                 // verbose: "0805 (2012 Metric)"
      leadCounts.set(v, (leadCounts.get(v) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of leadCounts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

/** Tally candidate families via their subcategory + the variant-aware classifier.
 *  Returns the plurality family ONLY when it's a real majority of scorable
 *  candidates — a mixed-bag result (no clear winner) returns null so the caller
 *  falls back to the partType hint rather than vetting against the wrong table. */
function classifyFamilyFromCandidates(candidateAttrs: PartAttributes[]): string | null {
  const tally = new Map<string, number>();
  let scorable = 0;
  for (const attrs of candidateAttrs) {
    const sub = attrs.part.subcategory;
    if (!sub) continue;
    const table = getLogicTableForSubcategory(sub, attrs);
    if (!table) continue;
    scorable++;
    tally.set(table.familyId, (tally.get(table.familyId) ?? 0) + 1);
  }
  if (scorable === 0) return null;
  let bestId: string | null = null;
  let bestN = 0;
  for (const [id, n] of tally) {
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  if (!bestId || bestN / scorable < 0.5) return null;
  return bestId;
}

export interface SyntheticSourceResult {
  source: PartAttributes;
  logicTable: LogicTable;
  familyId: string;
}

/**
 * Build a synthetic source `PartAttributes` from the user's stated constraints.
 * Returns null (→ skip vetting, keep today's keyword behavior) when: no
 * constraints, the family can't be classified, no logic table, or no constraint
 * resolves to a real attribute.
 */
export function buildSyntheticSource(
  constraints: SearchConstraint[] | undefined,
  partType: string | undefined,
  candidateAttrs: PartAttributes[],
): SyntheticSourceResult | null {
  if (!constraints || constraints.length === 0) return null;

  const familyId = classifyFamilyFromCandidates(candidateAttrs) ?? resolveFamilyFromText(partType);
  if (!familyId) return null;

  const logicTable = getLogicTable(familyId);
  if (!logicTable) return null;

  const ruleById = new Map(logicTable.rules.map(r => [r.attributeId, r]));
  const params: ParametricAttribute[] = [];
  const seen = new Set<string>();
  let sortOrder = 1;

  for (const c of constraints) {
    const attrId = resolveAttributeId(c.attribute, logicTable);
    if (!attrId || seen.has(attrId)) continue;
    const rawValue = (typeof c.value === 'number' ? String(c.value) : c.value ?? '').trim();
    if (!rawValue) continue;

    const unit = c.unit?.trim() || undefined;
    const rule = ruleById.get(attrId);
    const categorical = !!rule && (rule.logicType === 'identity' || rule.logicType === 'identity_upgrade' || rule.logicType === 'identity_flag');

    // CATEGORICAL codes (package "0805", channel "N-Channel", dielectric "X7R") are
    // compared as STRINGS against the candidates. The catalog often writes a verbose
    // form of the user's terse code — "0805 (2012 Metric)" for "0805" — so a bare-code
    // source fails the identity check on pure formatting (the exact-match-reads-Below-
    // spec bug). Adopt the catalog's OWN value for this attribute, learned from the
    // candidate pool, so the comparison byte-matches. Pool-learned ⇒ general (no
    // per-attribute table); numeric specs (unit-bearing) keep the numeric path below.
    if (categorical && !unit) {
      const canon = canonicalizeCategorical(rawValue, attrId, candidateAttrs);
      params.push({
        parameterId: attrId,
        parameterName: rule!.attributeName,
        value: canon ?? rawValue,
        sortOrder: sortOrder++,
      });
      seen.add(attrId);
      continue;
    }

    const looksNumeric = /\d/.test(rawValue) && !Number.isNaN(parseFloat(rawValue));

    let numericValue: number | undefined;
    let valueStr = rawValue;
    if (looksNumeric) {
      // Parse number+unit the SAME way candidates were parsed (value string is
      // truth), then normalize to base SI via the ungated core so the synthetic
      // source is comparable to Digikey's always-prefixed numericValue.
      const parsed = extractNumericWithPrefix(unit ? `${rawValue}${unit}` : rawValue);
      const baseUnit = parsed.parsedUnit ?? unit;
      const baseNum = parsed.numericValue ?? parseFloat(rawValue);
      numericValue = _applyUnitPrefixCore(baseNum, baseUnit);
      valueStr = unit ? `${rawValue} ${unit}` : rawValue;
    }

    params.push({
      parameterId: attrId,
      parameterName: rule?.attributeName ?? attrId,
      value: valueStr,
      numericValue,
      unit,
      sortOrder: sortOrder++,
    });
    seen.add(attrId);
  }

  // Inject identity-defining categoricals stated in the part-type NOUN (the "NPN"
  // in "small-signal NPN", the "N-channel" in "N-channel MOSFET", the "X7R" in
  // "X7R capacitor") that the user did NOT also pass as a numeric constraint.
  // Without this, the family's hard identity gate (polarity / channel_type /
  // dielectric / topology) sees a MISSING source value and PASSES every candidate
  // — so a PNP can top an NPN request. General by construction: we learn each
  // gate's categorical vocabulary from the candidate pool (no per-family table),
  // then inject the single value whose token appears in partType. Any new
  // identity-gated categorical across the 43 families is covered for free.
  const ptText = (partType ?? '').trim();
  if (ptText && candidateAttrs.length > 0) {
    for (const rule of logicTable.rules) {
      if (rule.logicType !== 'identity' && rule.logicType !== 'identity_upgrade') continue;
      if (seen.has(rule.attributeId)) continue;
      // Distinct CATEGORICAL values candidates carry for this gate. Skip
      // number-leading values (capacitance "10 µF", package code "0805") so a
      // numeric identity attr can't be matched out of the part-type text.
      const distinct = new Map<string, string>();
      for (const cand of candidateAttrs) {
        const v = cand.parameters.find(p => p.parameterId === rule.attributeId)?.value?.trim();
        if (!v || /^[\d.]/.test(v)) continue;
        distinct.set(normPhrase(v), v);
      }
      // Inject only when EXACTLY ONE of those values is named in the part type
      // (ambiguous or absent → leave the gate relaxed; vetting never mis-vets).
      const matched = [...distinct.values()].filter(v => phraseInText(v, ptText));
      if (matched.length !== 1) continue;
      params.push({
        parameterId: rule.attributeId,
        parameterName: rule.attributeName,
        value: matched[0],
        sortOrder: sortOrder++,
      });
      seen.add(rule.attributeId);
    }
  }

  if (params.length === 0) return null;

  const source: PartAttributes = {
    part: {
      mpn: SYNTHETIC_SOURCE_MPN,
      manufacturer: '',
      description: partType?.trim() || 'stated requirements',
      detailedDescription: partType?.trim() || 'stated requirements',
      category: logicTable.category as Part['category'],
      subcategory: logicTable.familyName,
      status: 'Active',
    },
    parameters: params,
  };

  return { source, logicTable, familyId };
}

/**
 * Over-spec closeness penalty for the ranking tiebreak. For each numeric `gte`
 * threshold the user constrained, a candidate rated far above the requirement
 * earns log(candidate/required); meeting it exactly earns 0; below-requirement
 * is a fail handled by `countRealMismatches`, not here. Lower penalty = closer
 * fit = ranks first — so a 30V part sorts above a 1200V part for a 12V ask.
 */
export function computeOverSpecPenalty(
  logicTable: LogicTable,
  source: PartAttributes,
  candidate: PartAttributes,
): number {
  const candMap = new Map(candidate.parameters.map(p => [p.parameterId, p]));
  let penalty = 0;
  for (const sp of source.parameters) {
    if (sp.numericValue === undefined || sp.numericValue <= 0) continue;
    const rule = logicTable.rules.find(r => r.attributeId === sp.parameterId);
    if (!rule || rule.logicType !== 'threshold' || (rule.thresholdDirection ?? 'gte') !== 'gte') continue;
    const cn = candMap.get(sp.parameterId)?.numericValue;
    if (cn === undefined || cn <= 0) continue;
    const ratio = cn / sp.numericValue;
    if (ratio > 1) penalty += Math.log(ratio);
  }
  return penalty;
}

/**
 * Build a STABLE keyword query for a greenfield search from the structured part
 * type + the user's categorical constraints — NOT from the model's free-text
 * `query` (which on greenfield is whichever MPN the model recalled from memory,
 * and so varies run-to-run; that variance is the root of "different family every
 * run"). Numeric specs are deliberately excluded — keyword search ignores numbers,
 * so they belong to the vetting pass, not the query. Categorical tokens are
 * lower-cased, de-duped, and sorted so the same (partType, constraints) always
 * yields byte-identical text. A token already present in `partType` is skipped to
 * avoid redundant keywords.
 */
export function buildGreenfieldQuery(
  partType: string | undefined,
  constraints: SearchConstraint[] | undefined,
): string {
  const base = (partType ?? '').trim();
  const baseLower = base.toLowerCase();
  // Resolve the family so we can tell a categorical CODE (package "0805", size "1206")
  // from a MEASURED numeric (capacitance, voltage). Package/size codes are stable,
  // highly-discriminating tokens in Digikey part descriptions ("CAP CER 1UF 25V X7R
  // 0805") and strongly shape WHICH parts get fetched — dropping them (the old
  // number-leading skip) returned an all-wrong pool for a fully-specified passive, so
  // nothing could match the user's size. Measured numerics stay out (the model passes a
  // unit / a number type for those, and the fetch band + vetting handle them).
  const familyId = resolveFamilyFromText(partType);
  const table = familyId ? getLogicTable(familyId) : null;
  const tokens: string[] = [];
  for (const c of constraints ?? []) {
    if (typeof c.value === 'number') continue;        // numeric → vetting only
    if (c.unit && c.unit.trim()) continue;            // has a unit → numeric spec
    const v = (c.value ?? '').toString().trim();
    if (!v) continue;                                 // blank → skip
    const lower = v.toLowerCase();
    if (baseLower.includes(lower)) continue;          // already in the part type
    if (/^[\d.]/.test(lower)) {
      // A number-leading, unit-less value is a useful keyword ONLY when it's a
      // categorical CODE (package/size) ≥3 chars. Anything else number-leading is a
      // measured spec whose unit the model dropped (vetting-only), or a stray short
      // number — skip it. Without the family table we keep the old conservative skip.
      const attrId = table ? resolveAttributeId(c.attribute, table) : null;
      const rule = attrId ? table!.rules.find(r => r.attributeId === attrId) : null;
      const categorical = !!rule && (rule.logicType === 'identity' || rule.logicType === 'identity_upgrade' || rule.logicType === 'identity_flag');
      if (!categorical || lower.length < 3) continue;
    }
    tokens.push(lower);
  }
  const uniqSorted = [...new Set(tokens)].sort();
  return [base, ...uniqSorted].filter(Boolean).join(' ').trim();
}

// ── Phase B: parametric pool filtering ────────────────────────
// A base-SI numeric band used to parametric-filter the Digikey candidate POOL by a
// stated spec (so e.g. "NPN hFE 200–400" fetches the hFE-band parts, not generic
// 3904s). Distinct from the vetting pass, which only re-ranks whatever was fetched.
export interface FetchBand {
  attrId: string;
  lo: number;
  hi: number;
  sourceNv: number;
}

/** gte band upper = lo × this. ProductCount-DESC + the MAX_PARAMETRIC_VALUES cap
 *  keep the selected values common, and the vetting over-spec penalty sinks the tail,
 *  so a generous upper is safe (it just keeps the pool inclusive). */
const OVERSPEC_FETCH_FACTOR = 10;
/** Inclusive ± margin on a two-sided band so boundary parts survive the FETCH (e.g. an
 *  hFE-420 part for a 200–400 ask, or the exact E-series neighbor for an identity value).
 *  The fetch is a relevance NET; the vetting pass does the precise ranking. */
const FETCH_BAND_MARGIN = 0.15;

const RANGE_RE = /(-?\d[\d.]*)\s*(?:-|–|~|to)\s*(-?\d[\d.]*)/i;

/** Parse a number(+unit) to base SI the SAME way buildSyntheticSource + the candidate
 *  mappers do, so the band is comparable to Digikey's always-base-SI facet values.
 *  Exported so `applyParametricFilter` parses facet values through the SAME engine
 *  (sign-aware, full G/T prefix coverage) — `digikeyMapper.extractNumericValue` drops
 *  the leading minus and omits G/T, which silently breaks GHz/THz and negative bands. */
export function toBaseSI(numStr: string, unit?: string): number | null {
  const s = numStr.trim();
  if (!s) return null;
  const parsed = extractNumericWithPrefix(unit ? `${s}${unit}` : s);
  const baseUnit = parsed.parsedUnit ?? unit;
  const baseNum = parsed.numericValue ?? parseFloat(s);
  if (!Number.isFinite(baseNum)) return null;
  return _applyUnitPrefixCore(baseNum, baseUnit) ?? null;
}

/**
 * Pick the SINGLE most-selective numeric band to parametric-filter the Digikey pool on
 * (greenfield Phase B). Reads the RAW constraints — not the deduped synthetic source —
 * so a two-sided range expressed as a `"200-400"` value OR as separate min/max
 * constraints (e.g. the extractor's `current min` / `current max`) yields BOTH bounds.
 * Returns base-SI `{attrId, lo, hi, sourceNv}`, or null when nothing maps to a numeric band.
 *
 * Band shape by rule: two-sided (range / identity) → [lo, hi] widened ±FETCH_BAND_MARGIN;
 * threshold gte → [v, v×OVERSPEC_FETCH_FACTOR] (strict floor); threshold lte → [0, v].
 * Selection: two-sided beats one-sided (more selective), then higher logic-rule weight,
 * then attributeId lexicographic — deterministic.
 */
export function pickFetchBand(
  constraints: SearchConstraint[] | undefined,
  logicTable: LogicTable,
): FetchBand | null {
  if (!constraints || constraints.length === 0) return null;
  const ruleById = new Map(logicTable.rules.map(r => [r.attributeId, r]));

  // Accumulate per-attr values across constraints. The LLM labels bounds
  // inconsistently — "hFE max", "hFE_max", or just two separate "IC" entries — so we
  // collect explicit min/max-labelled values AND plain values, and infer the band below.
  type Acc = { mins: number[]; maxs: number[]; plains: number[] };
  const acc = new Map<string, Acc>();

  for (const c of constraints) {
    const rawValue = (typeof c.value === 'number' ? String(c.value) : c.value ?? '').trim();
    if (!rawValue || !/\d/.test(rawValue)) continue; // numeric constraints only
    const unit = c.unit?.trim() || undefined;

    // A "min"/"max" label marks a one-sided bound. Normalize separators (_ - ) to spaces
    // FIRST so "hFE_max" / "hfe-min" are detected AND stripped like "hFE max" — `\b` does
    // not break between `_` and a letter, so the raw form would slip past both.
    const normAttr = c.attribute.replace(/[_-]+/g, ' ');
    const isMin = /\bmin(imum)?\b/i.test(normAttr);
    const isMax = /\bmax(imum)?\b/i.test(normAttr);
    const term = normAttr.replace(/\b(min|max|minimum|maximum)\b/gi, ' ').replace(/\s+/g, ' ').trim() || c.attribute;
    const attrId = resolveAttributeId(term, logicTable);
    if (!attrId) continue;

    const e = acc.get(attrId) ?? { mins: [], maxs: [], plains: [] };
    const m = rawValue.match(RANGE_RE);
    if (m) {
      const a = toBaseSI(m[1], unit);
      const b = toBaseSI(m[2], unit);
      if (a != null && b != null) { e.mins.push(Math.min(a, b)); e.maxs.push(Math.max(a, b)); }
    } else {
      const v = toBaseSI(rawValue, unit);
      if (v != null) {
        if (isMin) e.mins.push(v);
        else if (isMax) e.maxs.push(v);
        else e.plains.push(v);
      }
    }
    acc.set(attrId, e);
  }

  const bands: Array<FetchBand & { twoSided: boolean; weight: number }> = [];
  for (const [attrId, e] of acc) {
    const rule = ruleById.get(attrId);
    const weight = rule?.weight ?? 0;
    const explicitLo = e.mins.length ? Math.min(...e.mins) : undefined;
    const explicitHi = e.maxs.length ? Math.max(...e.maxs) : undefined;
    let lo: number | undefined;
    let hi: number | undefined;
    let twoSided = false;
    let sourceNv: number | undefined;

    if (explicitLo != null && explicitHi != null) { lo = explicitLo; hi = explicitHi; twoSided = true; sourceNv = explicitLo; }
    else if (explicitLo != null) { lo = explicitLo; hi = explicitLo * OVERSPEC_FETCH_FACTOR; sourceNv = explicitLo; } // min-only → gte
    else if (explicitHi != null) { lo = 0; hi = explicitHi; sourceNv = explicitHi; }                                 // max-only → lte
    else if (e.plains.length >= 2) { lo = Math.min(...e.plains); hi = Math.max(...e.plains); twoSided = true; sourceNv = lo; } // implicit range
    else if (e.plains.length === 1) {
      const v = e.plains[0];
      sourceNv = v;
      const dir = rule?.thresholdDirection ?? 'gte';
      if (rule?.logicType === 'threshold' && dir === 'lte') { lo = 0; hi = v; }
      else if (rule?.logicType === 'threshold') { lo = v; hi = v * OVERSPEC_FETCH_FACTOR; } // gte
      else { lo = v; hi = v; twoSided = true; }                                             // identity → exact-ish
    }
    if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) continue;
    // Widen a two-sided band OUTWARD by |bound| × margin (sign-agnostic). For
    // positive bounds this equals the old `lo *= 1-m` / `hi *= 1+m`; for a NEGATIVE
    // bound a multiplicative form would move it the WRONG way (toward zero, or
    // invert a degenerate negative identity band) — subtracting/adding |bound|×m
    // always pushes lo down and hi up.
    if (twoSided) {
      lo -= Math.abs(lo) * FETCH_BAND_MARGIN;
      hi += Math.abs(hi) * FETCH_BAND_MARGIN;
    }
    bands.push({ attrId, lo, hi, sourceNv: sourceNv ?? lo, twoSided, weight });
  }

  if (bands.length === 0) return null;
  bands.sort((a, b) => {
    if (a.twoSided !== b.twoSided) return a.twoSided ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.attrId < b.attrId ? -1 : a.attrId > b.attrId ? 1 : 0;
  });
  const top = bands[0];
  return { attrId: top.attrId, lo: top.lo, hi: top.hi, sourceNv: top.sourceNv };
}
