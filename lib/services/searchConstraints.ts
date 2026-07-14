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
 *  term-contains-attrId. Returns null when nothing matches (caller drops it).
 *  Exported so statedBands.ts maps constraints through the SAME resolver — two copies of
 *  "which attribute did the user mean?" would drift, and the fetch and the scoring pass
 *  disagreeing about that is exactly how a stated spec goes silently unapplied. */
export function resolveAttributeId(term: string, logicTable: LogicTable): string | null {
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

/** Count-word ↔ digit equivalence (Single/Dual/Quad ↔ 1/2/4) — a closed, family-agnostic
 *  electronics vocabulary. The LLM emits the WORD ("Dual"), Digikey stores the DIGIT ("2"),
 *  so a bare identity compare on a "Number of Channels/Circuits/Elements" spec fails on every
 *  candidate (even the genuinely-dual ones). Bridging both directions lets canonicalization
 *  adopt whichever form the catalog uses. */
const COUNT_WORD_DIGIT: Record<string, string> = {
  single: '1', '1': 'single',
  dual: '2', double: '2', '2': 'dual',
  triple: '3', '3': 'triple',
  quad: '4', quadruple: '4', '4': 'quad',
  hex: '6', '6': 'hex',
  octal: '8', '8': 'octal',
};

/** Adopt the catalog's OWN wording for a categorical code, learned from the candidate
 *  pool, so a user's terse value ("0805") byte-matches the catalog's verbose value
 *  ("0805 (2012 Metric)") in the identity comparison. Also bridges count-word ↔ digit
 *  ("Dual" → catalog "2"). Prefers an exact normalized hit; else the most common candidate
 *  whose FIRST token is the user's code (or its count equivalent). Returns null when nothing
 *  in the pool matches (the original value is kept — correct: the pool has no such code). */
function canonicalizeCategorical(
  userValue: string,
  attrId: string,
  candidateAttrs: PartAttributes[],
): string | null {
  const target = norm(userValue);
  if (!target) return null;
  // Acceptable normalized forms: the value itself + its count-word/digit equivalent.
  const targets = new Set([target]);
  const alt = COUNT_WORD_DIGIT[target];
  if (alt) targets.add(norm(alt));
  const leadCounts = new Map<string, number>();
  for (const cand of candidateAttrs) {
    const v = cand.parameters.find(p => p.parameterId === attrId)?.value?.trim();
    if (!v) continue;
    if (targets.has(norm(v))) return v;                       // catalog uses one of the forms
    if (targets.has(norm(v.split(/\s+/)[0]))) {               // verbose: "0805 (2012 Metric)"
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
 *
 * `familyIdOverride` is the AUTHORITATIVE family when the caller already knows it
 * (the guided-selection flow). It bypasses pool-based classification — a keyword pool
 * polluted with a wrong-but-classifiable family (gate-driver ICs in a MOSFET search)
 * must not be allowed to flip the scoring family.
 */
export function buildSyntheticSource(
  constraints: SearchConstraint[] | undefined,
  partType: string | undefined,
  candidateAttrs: PartAttributes[],
  familyIdOverride?: string,
): SyntheticSourceResult | null {
  if (!constraints || constraints.length === 0) return null;

  const familyId = familyIdOverride ?? classifyFamilyFromCandidates(candidateAttrs) ?? resolveFamilyFromText(partType);
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

// ── Numeric band parsing ─────────────────────────────────────
// `pickFetchBand` USED to live here: it turned the raw constraints into ONE numeric band for
// the Digikey pool filter. It was never wired to a production caller — and it carried the
// `[v, v × 10]` over-spec CEILING that was the whole BC847 bug (a part rated far above what you
// need is not a worse part; headroom on a max rating is free). A dead reference implementation
// with a live bug in it, pinned by a passing test suite, is worse than no code at all: the next
// person to need range parsing reaches for it and silently reintroduces the bug. It is deleted.
//
// Its range PARSING was the good half and is preserved in statedBands.ts — with the band
// SHAPING removed, because that is the part that was wrong.

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
 * Parse the LEADING MAGNITUDE of a catalog value string to base SI, discarding any trailing
 * TEST CONDITION or range tail: `"420 @ 2mA, 5V"` → 420, `"5V ~ 10V"` → 5, `"1 µF"` → 1e-6.
 *
 * ⚠️ Use this — NEVER a candidate's `numericValue` — for any spec whose value carries a test
 * condition. Digikey's mapper regex locks onto the CONDITION, so a BC847C's gain of 420 arrives
 * as `numericValue: 0.002` (that's the 2 mA it was measured at). Verified live: every BJT gain
 * in the catalog is `"<gain> @ <Ic>, <Vce>"`, and every one of their numericValues is the test
 * current. The value STRING is the truth. (Fixing the mapper itself serves all 43 families and
 * is the highest-blast-radius change in the codebase — it is logged in BACKLOG, not done here.)
 */
export function leadingMagnitudeToBaseSI(value: string): number | null {
  // ⚠️ STRIP A LEADING ± FIRST, then split.
  //
  // `±` is in the split set because it separates a magnitude from a tolerance tail. But when it
  // comes FIRST — and in Digikey's catalog it very often does: "±1%", "±20V", "±0.1%" — splitting
  // on it leaves an EMPTY head, the regex finds no digits, and the value is silently discarded.
  //
  // Every `±N` value in the catalog was therefore invisible to us. Measured consequence: a search
  // for a 10 Ω 1% 0402 resistor built a Tolerance filter out of the only values that DID parse
  // ("0%", "-10%", "-20%") and never selected "±1%" — so the parametric search returned ZERO
  // parts. Stripping the leading sign takes that same search from 0 results to 45 correct ones.
  //
  // A ± prefix means "plus or minus N", so its magnitude is N. The sign carries no information
  // here (a "±20V" gate rating is a 20 V rating), which is why dropping it is correct and not a
  // guess.
  const head = (value ?? '').replace(/^\s*[±+]\s*/, '').split(/@|~|≤|≥|±/)[0].trim();
  const m = head.match(/(-?\d[\d.]*)\s*([a-zA-Zµμ%°/√]+)?/);
  if (!m) return null;
  return toBaseSI(m[1], m[2] || undefined);
}
