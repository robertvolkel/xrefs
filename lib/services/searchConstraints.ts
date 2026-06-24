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

    const rule = ruleById.get(attrId);
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
 * Deterministic greenfield-search determinism (Phase A).
 *
 * A constraint set is "thin" when it carries no usable spec to vet against —
 * empty, or every entry has a blank value. Drives the greenfield forced-extraction
 * fallback in the orchestrator: when the model searched without handing us specs
 * (its from-memory MPN guesses carry a raw MPN as the query and no constraints),
 * recover them from the user's own words so ranking is stable AND grounded.
 */
export function isThinConstraints(constraints: SearchConstraint[] | undefined): boolean {
  if (!constraints || constraints.length === 0) return true;
  return constraints.every(c => {
    const v = typeof c.value === 'number' ? String(c.value) : (c.value ?? '').trim();
    return v === '';
  });
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
  const tokens: string[] = [];
  for (const c of constraints ?? []) {
    if (typeof c.value === 'number') continue;        // numeric → vetting only
    if (c.unit && c.unit.trim()) continue;            // has a unit → numeric spec
    const v = (c.value ?? '').toString().trim();
    if (!v || /^[\d.]/.test(v)) continue;             // blank or number-like → skip
    const lower = v.toLowerCase();
    if (baseLower.includes(lower)) continue;          // already in the part type
    tokens.push(lower);
  }
  const uniqSorted = [...new Set(tokens)].sort();
  return [base, ...uniqSorted].filter(Boolean).join(' ').trim();
}
