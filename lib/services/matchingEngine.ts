import {
  PartAttributes,
  ParametricAttribute,
  MatchingRule,
  LogicTable,
  RuleResult,
  RuleEvaluationResult,
  CandidateEvaluation,
  MatchStatus,
  XrefRecommendation,
  MatchDetail,
  MissingAttributeInfo,
  ThresholdDirection,
} from '../types';

// ============================================================
// VALUE PARSING UTILITIES
// ============================================================

/** Extract a numeric value from a parameter, using numericValue if available */
function getNumeric(param: ParametricAttribute | undefined): number | null {
  if (!param) return null;
  if (param.numericValue !== undefined) return param.numericValue;

  // Try to parse from string value
  const match = param.value.match(/([-+]?\d*\.?\d+)/);
  return match ? parseFloat(match[1]) : null;
}

/** Parse tolerance string like "±10%" → 10, "±5%" → 5 */
function parseTolerance(value: string): number | null {
  const match = value.match(/±?\s*(\d+\.?\d*)%/);
  return match ? parseFloat(match[1]) : null;
}

/** Parse temperature range like "-55°C ~ 125°C" → { min: -55, max: 125 } */
function parseTempRange(value: string): { min: number; max: number } | null {
  const match = value.match(/([-+]?\d+)\s*°?\s*C?\s*[~to]+\s*([-+]?\d+)\s*°?\s*C?/i);
  if (!match) return null;
  return { min: parseFloat(match[1]), max: parseFloat(match[2]) };
}

/** Parse MSL level like "MSL 1" → 1, or "1" → 1 */
function parseMSL(value: string): number | null {
  const match = value.match(/(\d)/);
  return match ? parseInt(match[1]) : null;
}

/** Normalize boolean-ish values */
function parseBoolean(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return lower === 'yes' || lower === 'true' || lower === '1' || lower === 'required';
}

/** Normalize string for comparison (uppercase, trim, strip whitespace) */
/** Canonicalize a value string for equality comparison — trim, upper-case, and
 *  collapse internal whitespace. Exported so the acceptance UI can dedup/compare
 *  candidate values exactly the way the engine matches them (see SetEditor). */
export function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * A PACKAGE IS AN ALIAS LIST, NOT A NAME.
 *
 * Digikey writes a package as EVERY name the industry knows it by, comma-separated, in one field:
 *
 *     BC847C  →  "TO-236-3, SC-59, SOT-23-3"
 *
 * A user — and every other data source — writes ONE name: "SOT-23". So an exact string compare
 * fails, and it fails for EVERY part, because every part's package is written that way. Measured on
 * BC847C against a "gain of at least 300" search: `package_case` was the ONLY failing rule, and it
 * was enough to label the correct part "Below spec".
 *
 * So compare the field as the list it is: split on commas, and match token against token.
 *
 * ⚠️ THE LEAD COUNT IS LOAD-BEARING. "SOT-23-3" (3 leads) and "SOT-23-6" (6 leads) are different
 * footprints and are NOT interchangeable — a 3-pin transistor cannot be dropped into a 6-pin land
 * pattern. So a trailing "-<n>" is only ignored when ONE SIDE LEAVES IT OPEN ("SOT-23" states no
 * lead count and matches either). When BOTH sides state one they must agree.
 *
 * ⚠️ AND YOU CANNOT DETECT A LEAD COUNT BY "ends in a dash and digits" — "SOT-23" ends in "-23" and
 * that 23 is the package's own name, not a lead count. This is why the rule is expressed as "the
 * longer token is exactly the shorter token plus a -<n> suffix", never as "strip the suffix off
 * both and compare". The first is decidable from the strings; the second is a guess.
 */
// The package-IDENTITY attribute ids — every family whose footprint rule is a string `identity`.
// `package_case` (31 families) plus `package_type` (E1 optocouplers) and `package_format` (D2 fuses).
// NOT the `identity_flag` footprint rules (F1/F2 relays' `package_footprint`, D1 crystals'
// `package_type`): those route through evaluateIdentityFlag, which never calls into here.
const PACKAGE_ATTRIBUTE_IDS = new Set(['package_case', 'package_type', 'package_format']);

/** "0402 (1005 Metric)" → "0402"; "8-SOIC (0.154", 3.90mm Width)" → "8-SOIC". A parenthetical is a
 *  gloss (metric equivalent, dimensions, a cross-reference), never a distinct package. Strip glosses
 *  BEFORE splitting on commas — Digikey puts a COMMA *inside* the dimension gloss, so splitting first
 *  shatters "8-SOIC (0.154", 3.90mm Width)" into fragments and the real token "8-SOIC" is lost. */
function packageTokens(value: string): string[] {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .split(',')
    .map(t => normalize(t))
    .filter(Boolean);
}

/** True when two package tokens name the same footprint:
 *   • identical, or
 *   • one leaves the lead count open: "SOT-23" ≡ "SOT-23-3" (longer = shorter + a "-<1–2 digits>"),
 *     while "SOT-23-3" vs "SOT-23-6" → false (both state a count and disagree) and "SOT-23" vs
 *     "SOT-223" → false (the suffix must be a hyphen + 1–2 digits, and "-223" is three), or
 *   • a pin-count word-order transposition: "8-SOIC" ≡ "SOIC-8" (see transposedPinCountMatch). */
function packageTokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const suffix = /^(.*)-\d{1,2}$/.exec(longer);
  if (suffix && suffix[1] === shorter) return true;
  return transposedPinCountMatch(a, b);
}

/** "8-SOIC" ≡ "SOIC-8": the SAME family name with one pin-count digit group moved front↔back — the
 *  two industry word orders for an IC package. Requires identical family AND identical count, so it
 *  can never cross "8-SOIC" to "8-MSOP". Discrete packages ("SOT-23-3") never start with a bare
 *  digit group, so this leaves the lead-count rule above untouched. This is the ONE legitimate
 *  cross-format the old evaluateIdentity numeric fallback used to (crudely) rescue. */
function transposedPinCountMatch(a: string, b: string): boolean {
  const front = /^(\d{1,3})-(.+)$/;   // "8-SOIC" → count "8", family "SOIC"
  const back = /^(.+)-(\d{1,3})$/;    // "SOIC-8" → family "SOIC", count "8"
  const fa = front.exec(a), bk = back.exec(b);
  if (fa && bk && fa[1] === bk[2] && fa[2] === bk[1]) return true;
  const fb = front.exec(b), ak = back.exec(a);
  return !!(fb && ak && fb[1] === ak[2] && fb[2] === ak[1]);
}

/** Any name for the source's package matching any name for the candidate's. */
export function packageValuesMatch(sourceValue: string, candidateValue: string): boolean {
  const srcs = packageTokens(sourceValue);
  const cands = packageTokens(candidateValue);
  return srcs.some(s => cands.some(c => packageTokensMatch(s, c)));
}

/**
 * Check whether two values land in the same alias group on this rule.
 * Returns true only when both values appear in the same group; any value
 * not in any group is treated as ungrouped (returns false).
 * Comparison uses `normalize()` so casing/whitespace differences don't matter.
 */
function inSameAliasGroup(rule: MatchingRule, a: string, b: string): boolean {
  const groups = rule.valueAliases;
  if (!groups || groups.length === 0) return false;
  const an = normalize(a);
  const bn = normalize(b);
  for (const group of groups) {
    let hasA = false;
    let hasB = false;
    for (const member of group) {
      const mn = normalize(member);
      if (mn === an) hasA = true;
      if (mn === bn) hasB = true;
      if (hasA && hasB) return true;
    }
  }
  return false;
}

/**
 * Parse a parametric value into a numeric range { min, max }.
 * Handles formats:
 *   "-0.5V to -6V", "1mA ~ 5mA", "2...8V", "-3V" (single → degenerate range)
 * Strips unit suffixes (V, mV, A, mA, µA, pA, Hz, etc.) and applies SI prefixes.
 * Returns null if unparsable. Guarantees min <= max.
 */
function parseRange(value: string): { min: number; max: number } | null {
  const s = value.trim();

  // Try two-value range: "X to Y", "X ~ Y", "X...Y", "X - Y" (with optional units)
  const rangeMatch = s.match(
    /([-+]?\d*\.?\d+)\s*([munpfkMGT]?[A-Za-z/°%]*)\s*(?:to|~|\.{2,3}|–|—)\s*([-+]?\d*\.?\d+)\s*([munpfkMGT]?[A-Za-z/°%]*)/i
  );
  if (rangeMatch) {
    const a = applyPrefix(parseFloat(rangeMatch[1]), rangeMatch[2]);
    const b = applyPrefix(parseFloat(rangeMatch[3]), rangeMatch[4]);
    if (a === null || b === null) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  // Single numeric value → degenerate range
  const singleMatch = s.match(/([-+]?\d*\.?\d+)\s*([munpfkMGT]?[A-Za-z/°%]*)/);
  if (singleMatch) {
    const v = applyPrefix(parseFloat(singleMatch[1]), singleMatch[2]);
    if (v === null) return null;
    return { min: v, max: v };
  }

  return null;
}

/** Apply SI prefix from unit string to a raw numeric value */
function applyPrefix(value: number, unit: string): number | null {
  if (isNaN(value)) return null;
  const prefix = unit.charAt(0);
  switch (prefix) {
    case 'p': return value * 1e-12;
    case 'n': return value * 1e-9;
    case 'u': case 'µ': return value * 1e-6;
    case 'm': return value * 1e-3;
    case 'k': return value * 1e3;
    case 'M': return value * 1e6;
    case 'G': return value * 1e9;
    case 'T': return value * 1e12;
    default: return value; // No prefix or unrecognized — return as-is
  }
}

// ============================================================
// RULE EVALUATORS
// ============================================================

function evaluateIdentity(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'N/A';
  const candidateValue = candidateParam?.value ?? 'N/A';

  if (!sourceParam || !candidateParam) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: !sourceParam ? 'pass' : 'review',
      matchStatus: !sourceParam ? 'exact' : 'different',
      note: sourceParam && !candidateParam
        ? (rule.blockOnMissing
          ? `Missing critical specification — ${rule.attributeName} not specified in replacement datasheet`
          : `${rule.attributeName} not specified in replacement — verify from datasheet`)
        : undefined,
    };
  }

  // Prefer string equality of the displayed values — if the two parts render
  // identically, they're the same value regardless of whether each source
  // normalized `numericValue` to base SI units or stored it raw. This avoids
  // false fails when Digikey (normalized, e.g. 3.3e-7) and parts.io (raw, e.g. 0.33)
  // supply the same attribute for different parts in a comparison.
  let match = normalize(sourceValue) === normalize(candidateValue);

  // Per-rule value aliases — different sources often emit synonyms for the
  // same categorical state (e.g. Digikey "Polar" vs Atlas "POLARIZED"). When
  // both sides land in the same alias group on this rule, treat them as equal.
  if (!match && inSameAliasGroup(rule, sourceValue, candidateValue)) {
    match = true;
  }

  // A package is an alias LIST, not a name — Digikey packs every name a footprint goes by into one
  // comma-separated field ("TO-236-3, SC-59, SOT-23-3"). Compare it as the list it is. See
  // `packageValuesMatch`; the lead count still has to agree when both sides state one.
  if (!match && PACKAGE_ATTRIBUTE_IDS.has(rule.attributeId) && packageValuesMatch(sourceValue, candidateValue)) {
    match = true;
  }

  // Numeric comparison (with relative tolerance for float rounding) only when strings genuinely
  // differ — catches "0.33µF" vs "330nF" style equivalence. NEVER for a package: getNumeric reads
  // the FIRST number, which for a package is the pin count, so "8-SOIC" and "8-MSOP" would both read
  // 8 and be declared identical — two different footprints crossed as a clean pass. Packages are
  // compared only as alias lists (above); a real cross-format like "8-SOIC" vs "SOIC-8" is handled
  // there, not here.
  const numericComparable = !match && !PACKAGE_ATTRIBUTE_IDS.has(rule.attributeId);
  const srcNum = numericComparable ? getNumeric(sourceParam) : null;
  const candNum = numericComparable ? getNumeric(candidateParam) : null;
  if (numericComparable && srcNum !== null && candNum !== null) {
    const denom = Math.max(Math.abs(srcNum), Math.abs(candNum), 1e-30);
    match = Math.abs(srcNum - candNum) / denom < 1e-6;
  }

  // Tolerance band: if exact match fails but values are within ±tolerancePercent, pass with note
  if (!match && rule.tolerancePercent && srcNum !== null && candNum !== null && srcNum !== 0) {
    const deviation = Math.abs(candNum - srcNum) / Math.abs(srcNum);
    if (deviation <= rule.tolerancePercent / 100) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'pass',
        matchStatus: 'compatible',
        note: `Within ±${rule.tolerancePercent}% tolerance (${(deviation * 100).toFixed(1)}% deviation) — verify passive components are still optimal for this value`,
      };
    }
  }

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: match ? 'pass' : 'fail',
    matchStatus: match ? 'exact' : 'different',
    note: !match ? `Does not match — ${sourceValue} vs ${candidateValue}` : undefined,
  };
}

/**
 * Identity range evaluator: checks whether source and candidate ranges overlap.
 * Used for specs with wide manufacturing spread (JFET Vp, Idss) where a
 * replacement is valid only if its specified range intersects the original's.
 */
function evaluateIdentityRange(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'N/A';
  const candidateValue = candidateParam?.value ?? 'N/A';

  // Missing-value handling (same as identity)
  if (!sourceParam || !candidateParam) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: !sourceParam ? 'pass' : 'review',
      matchStatus: !sourceParam ? 'exact' : 'different',
      note: sourceParam && !candidateParam
        ? (rule.blockOnMissing
          ? `Missing critical specification — ${rule.attributeName} not specified in replacement datasheet`
          : `${rule.attributeName} not specified in replacement — verify from datasheet`)
        : undefined,
    };
  }

  // Parse both as ranges
  const srcRange = parseRange(sourceValue);
  const candRange = parseRange(candidateValue);

  // If either fails to parse, fall back to exact string comparison
  if (!srcRange || !candRange) {
    const match = normalize(sourceValue) === normalize(candidateValue);
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: match ? 'pass' : 'fail',
      matchStatus: match ? 'exact' : 'different',
      note: !srcRange || !candRange ? 'Could not parse range — fell back to exact comparison' : undefined,
    };
  }

  // Overlap check: ranges overlap iff srcMax >= candMin AND candMax >= srcMin
  const overlaps = srcRange.max >= candRange.min && candRange.max >= srcRange.min;
  const isExact = srcRange.min === candRange.min && srcRange.max === candRange.max;

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: overlaps ? 'pass' : 'fail',
    matchStatus: isExact ? 'exact' : overlaps ? 'compatible' : 'different',
    note: !overlaps ? `Ranges do not overlap — ${sourceValue} vs ${candidateValue}` : undefined,
  };
}

function evaluateIdentityUpgrade(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'N/A';
  const candidateValue = candidateParam?.value ?? 'N/A';
  const hierarchy = rule.upgradeHierarchy ?? [];

  if (!sourceParam || !candidateParam) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: !sourceParam ? 'pass' : 'review',
      matchStatus: !sourceParam ? 'exact' : 'different',
      note: sourceParam && !candidateParam
        ? (rule.blockOnMissing
          ? `Missing critical specification — ${rule.attributeName} not specified in replacement datasheet`
          : `${rule.attributeName} not specified in replacement — verify from datasheet`)
        : undefined,
    };
  }

  const srcNorm = normalize(sourceValue);
  const candNorm = normalize(candidateValue);

  // Find positions in hierarchy (lower index = better).
  // Try exact match first to avoid substring collisions (e.g., "Shielded" matching
  // inside "Semi-Shielded" or "Unshielded"). Fall back to substring for values like
  // "C0G (NP0)" that need to match hierarchy entry "C0G".
  let srcIdx = hierarchy.findIndex(h => srcNorm === h.toUpperCase());
  let candIdx = hierarchy.findIndex(h => candNorm === h.toUpperCase());
  if (srcIdx === -1) srcIdx = hierarchy.findIndex(h => srcNorm.includes(h.toUpperCase()));
  if (candIdx === -1) candIdx = hierarchy.findIndex(h => candNorm.includes(h.toUpperCase()));

  // Alias-aware fallback: if a value isn't in the hierarchy directly, see
  // whether any of its alias-group mates is. Lets per-rule synonyms map onto
  // hierarchy positions without bloating the hierarchy itself.
  if ((srcIdx === -1 || candIdx === -1) && rule.valueAliases?.length) {
    for (const group of rule.valueAliases) {
      const groupNormed = group.map(v => normalize(v));
      const groupHasSrc = groupNormed.includes(srcNorm);
      const groupHasCand = groupNormed.includes(candNorm);
      if (!groupHasSrc && !groupHasCand) continue;
      const groupHierarchyIdx = hierarchy.findIndex(h =>
        groupNormed.includes(h.toUpperCase())
      );
      if (groupHierarchyIdx === -1) continue;
      if (srcIdx === -1 && groupHasSrc) srcIdx = groupHierarchyIdx;
      if (candIdx === -1 && groupHasCand) candIdx = groupHierarchyIdx;
    }
  }

  // If neither is in hierarchy, do exact string match (with alias fallback)
  if (srcIdx === -1 && candIdx === -1) {
    const match = srcNorm === candNorm || inSameAliasGroup(rule, sourceValue, candidateValue);
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: match ? 'pass' : 'fail',
      matchStatus: match ? 'exact' : 'different',
      note: !match ? `Does not match — ${sourceValue} vs ${candidateValue}` : undefined,
    };
  }

  // If source is in hierarchy but candidate isn't (or vice versa)
  if (srcIdx === -1 || candIdx === -1) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'fail',
      matchStatus: 'different',
      note: 'Cannot determine hierarchy position',
    };
  }

  // Same position = exact match
  if (candIdx === srcIdx) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'pass',
      matchStatus: 'exact',
    };
  }

  // Lower index = better (upgrade)
  if (candIdx < srcIdx) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'upgrade',
      matchStatus: 'better',
      note: `Upgraded from ${sourceValue} to ${candidateValue}`,
    };
  }

  // Higher index = worse (downgrade = fail)
  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: 'fail',
    matchStatus: 'worse',
    note: `Downgrade from ${sourceValue} to ${candidateValue} not allowed`,
  };
}

function evaluateIdentityFlag(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'No';
  const candidateValue = candidateParam?.value ?? 'No';

  const sourceRequired = parseBoolean(sourceValue);
  const candidateHas = parseBoolean(candidateValue);

  // If original requires it, replacement must have it
  if (sourceRequired && !candidateHas) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'fail',
      matchStatus: 'worse',
      note: `Original requires ${rule.attributeName}, replacement does not have it`,
    };
  }

  // If original doesn't require it, either is fine
  if (!sourceRequired && candidateHas) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'pass',
      matchStatus: 'better',
      note: `Replacement has ${rule.attributeName} (not required by original)`,
    };
  }

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: 'pass',
    matchStatus: 'exact',
  };
}

function evaluateThreshold(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'N/A';
  const candidateValue = candidateParam?.value ?? 'N/A';

  if (!sourceParam || !candidateParam) {
    // Source missing → can't evaluate, pass
    if (!sourceParam) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'pass',
        matchStatus: 'exact',
      };
    }
    // Candidate missing → review (blockOnMissing controls note severity only)
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'review',
      matchStatus: 'different',
      note: rule.blockOnMissing
        ? `Missing critical specification — ${rule.attributeName} not specified in replacement datasheet`
        : `${rule.attributeName} not specified in replacement — verify from datasheet`,
    };
  }

  // Handle range_superset (temperature ranges)
  if (rule.thresholdDirection === 'range_superset') {
    const srcRange = parseTempRange(sourceValue);
    const candRange = parseTempRange(candidateValue);
    if (!srcRange || !candRange) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'review',
        matchStatus: 'compatible',
        note: 'Could not parse temperature range for comparison',
      };
    }

    const isSuperset = candRange.min <= srcRange.min && candRange.max >= srcRange.max;
    const isExact = candRange.min === srcRange.min && candRange.max === srcRange.max;

    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: isSuperset ? 'pass' : 'fail',
      matchStatus: isExact ? 'exact' : isSuperset ? 'better' : 'worse',
      note: !isSuperset ? `Range ${candidateValue} does not fully cover ${sourceValue}` : undefined,
    };
  }

  // Handle tolerance specially (lower percentage = tighter = better)
  if (rule.attributeId === 'tolerance') {
    const srcTol = parseTolerance(sourceValue);
    const candTol = parseTolerance(candidateValue);
    if (srcTol === null || candTol === null) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'review',
        matchStatus: 'compatible',
        note: 'Could not parse tolerance values',
      };
    }

    if (candTol === srcTol) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'pass',
        matchStatus: 'exact',
      };
    }

    // For tolerance: lower is better (tighter)
    const tolPass = candTol <= srcTol;
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: tolPass ? 'pass' : 'fail',
      matchStatus: candTol < srcTol ? 'better' : 'worse',
      note: !tolPass ? `Tolerance ${candidateValue} is wider than required ${sourceValue}` : undefined,
    };
  }

  // Handle MSL specially
  if (rule.attributeId === 'msl') {
    const srcMSL = parseMSL(sourceValue);
    const candMSL = parseMSL(candidateValue);
    if (srcMSL === null || candMSL === null) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'review',
        matchStatus: 'compatible',
        note: 'Could not parse MSL values for comparison',
      };
    }

    if (candMSL === srcMSL) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue,
        candidateValue,
        logicType: rule.logicType,
        result: 'pass',
        matchStatus: 'exact',
      };
    }

    const mslPass = candMSL <= srcMSL;
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: mslPass ? 'pass' : 'fail',
      matchStatus: candMSL < srcMSL ? 'better' : 'worse',
      note: !mslPass ? `MSL ${candidateValue} exceeds source MSL ${sourceValue}` : undefined,
    };
  }

  // General numeric threshold
  const srcNum = getNumeric(sourceParam);
  const candNum = getNumeric(candidateParam);

  if (srcNum === null || candNum === null) {
    // Fall back to string comparison
    const match = normalize(sourceValue) === normalize(candidateValue);
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: match ? 'pass' : 'review',
      matchStatus: match ? 'exact' : 'compatible',
      note: !match ? 'Could not parse numeric values for threshold comparison' : undefined,
    };
  }

  if (srcNum === candNum) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'pass',
      matchStatus: 'exact',
    };
  }

  const direction = rule.thresholdDirection ?? 'gte';
  let passes: boolean;
  let isBetter: boolean;

  if (direction === 'gte') {
    passes = candNum >= srcNum;
    isBetter = candNum > srcNum;
  } else {
    // lte
    passes = candNum <= srcNum;
    isBetter = candNum < srcNum;
  }

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: passes ? 'pass' : 'fail',
    matchStatus: passes ? (isBetter ? 'better' : 'exact') : 'worse',
    note: !passes
      ? direction === 'gte'
        ? `${candidateValue} is below the minimum ${sourceValue}`
        : `${candidateValue} exceeds the maximum ${sourceValue}`
      : undefined,
  };
}

/**
 * WHICH WAY DOES THIS RULE COMPARE? The single definition — the engine and the greenfield
 * parametric FETCH must both read it from here.
 *
 * They used to each hold their own copy, and they disagreed. `fit` (component height, diameter
 * — "the part must be no BIGGER than this") is evaluated `lte` below, but the fetch banded it
 * with the `gte` branch: ask for "height ≤ 1 mm" and it went to Digikey for parts 1–10 mm tall,
 * i.e. exactly the parts that cannot fit. 31 rules across 25 families. The fetch's own doc
 * comment said "lte/fit → [0, v]" — the comment was right and the code was wrong, which is what
 * a second copy of a truth always eventually becomes.
 *
 * Returns null for a rule that is not a numeric comparison at all.
 */
export function effectiveThresholdDirection(
  rule: Pick<MatchingRule, 'logicType' | 'thresholdDirection'> | undefined,
): ThresholdDirection | null {
  if (!rule) return null;
  if (rule.logicType === 'fit') return 'lte';
  if (rule.logicType === 'threshold') return rule.thresholdDirection ?? 'gte';
  return null;
}

/**
 * Rule types that structurally CANNOT separate two parts. `application_review` returns a flat
 * `review` (50% credit) and `operational` a flat 80% — NEITHER ever looks at the two values.
 * That is the RIGHT verdict for a cross-reference ("the gain differs; a human should look"),
 * and it is why these rules must never be retyped to make a search work.
 *
 * But it means a SEARCH cannot honour a spec typed this way: ask for "hFE 200-400" and every
 * candidate — the 110, the 200, the 420 — scores identically. The two questions are genuinely
 * different, so the search path compares stated bands ITSELF (see statedBands.ts) rather than
 * bending the engine. This set is the boundary between them, and the ONE definition of it:
 * `selectionDoc.findAskedButUncomparable` uses it to flag specs we ASK about and then ignore.
 */
export const CANNOT_COMPARE_LOGIC_TYPES: ReadonlySet<string> = new Set(['application_review', 'operational']);

/** True when the engine's evaluator for this rule actually compares source vs candidate. */
export function ruleCanCompare(rule: Pick<MatchingRule, 'logicType'> | undefined): boolean {
  return !!rule && !CANNOT_COMPARE_LOGIC_TYPES.has(rule.logicType);
}

function evaluateFit(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  return evaluateThreshold(
    { ...rule, thresholdDirection: effectiveThresholdDirection(rule) ?? 'lte' },
    sourceParam,
    candidateParam
  );
}

function evaluateApplicationReview(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue: sourceParam?.value ?? 'N/A',
    candidateValue: candidateParam?.value ?? 'N/A',
    logicType: rule.logicType,
    result: 'review',
    matchStatus: 'compatible',
    note: rule.engineeringReason,
  };
}

function evaluateOperational(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'N/A';
  const candidateValue = candidateParam?.value ?? 'N/A';
  const match = normalize(sourceValue) === normalize(candidateValue);

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: 'info',
    matchStatus: match ? 'exact' : 'compatible',
    note: !match ? 'Verify packaging compatibility with production line' : undefined,
  };
}

/**
 * Vref check evaluator: when Vref differs between source and candidate,
 * automatically recalculates the output voltage using the existing feedback
 * resistor divider ratio. Passes if the recalculated Vout is within ±2%,
 * otherwise returns 'review' with corrected Rbot value.
 *
 * Used by switching regulators (C2) where Vout = Vref × (1 + Rtop/Rbot).
 */
function evaluateVrefCheck(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined,
  sourceAttrs: PartAttributes,
): RuleEvaluationResult {
  const sourceValue = sourceParam?.value ?? 'N/A';
  const candidateValue = candidateParam?.value ?? 'N/A';

  // Missing source Vref — no constraint to enforce
  if (!sourceParam) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'pass',
      matchStatus: 'exact',
    };
  }

  // Missing candidate Vref
  if (!candidateParam) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'review',
      matchStatus: 'different',
      note: rule.blockOnMissing
        ? 'Missing critical specification — Vref not specified, cannot verify output voltage achievability'
        : 'Vref not specified — verify output voltage is achievable with existing feedback network',
    };
  }

  const srcVref = getNumeric(sourceParam);
  const candVref = getNumeric(candidateParam);

  if (srcVref === null || candVref === null || srcVref === 0) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'review',
      matchStatus: 'different',
      note: 'Cannot parse Vref values — verify output voltage achievability manually',
    };
  }

  // Vref matches within ±1% — exact match, no recalculation needed
  const vrefDeviation = Math.abs(candVref - srcVref) / Math.abs(srcVref);
  if (vrefDeviation <= 0.01) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'pass',
      matchStatus: 'exact',
    };
  }

  // Vref differs — compute Vout achievability with existing feedback resistors
  const voutParam = sourceAttrs.parameters.find(p => p.parameterId === 'output_voltage');
  const vout = voutParam ? getNumeric(voutParam) : null;

  if (!vout || vout === 0) {
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'review',
      matchStatus: 'different',
      note: `Vref differs (${sourceValue} → ${candidateValue}) but output voltage unknown — verify feedback resistor network produces correct output`,
    };
  }

  // Compute: ratio = Rtop/Rbot = (Vout/Vref_source) - 1
  const ratio = (vout / srcVref) - 1;
  // Vout with replacement Vref using existing resistors
  const voutNew = candVref * (1 + ratio);
  const voutError = Math.abs(voutNew - vout) / vout;

  if (voutError <= 0.02) {
    // Within ±2% — acceptable with existing feedback network
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: 'pass',
      matchStatus: 'compatible',
      note: `Vref differs (${sourceValue} → ${candidateValue}) but output voltage within ±2% (${voutNew.toFixed(3)}V vs ${vout}V target, ${(voutError * 100).toFixed(1)}% deviation)`,
    };
  }

  // Vout deviation > ±2% — flag for review with corrected Rbot value
  // Corrected Rbot = Rtop / ((Vout_target / Vref_new) - 1)
  // Assume Rtop = 100kΩ as reference: original Rbot = 100k / ratio
  const rtopRef = 100; // kΩ reference
  const rbotOriginal = rtopRef / ratio;
  const newRatio = (vout / candVref) - 1;
  const rbotCorrected = rtopRef / newRatio;

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: 'review',
    matchStatus: 'different',
    note: `Vref mismatch: ${sourceValue} → ${candidateValue}. With existing feedback resistors, output would be ${voutNew.toFixed(3)}V (${(voutError * 100).toFixed(1)}% from ${vout}V target). To correct: change Rbot from ${rbotOriginal.toFixed(1)}kΩ to ${rbotCorrected.toFixed(1)}kΩ (assuming Rtop = ${rtopRef}kΩ)`,
  };
}

// ============================================================
// MAIN EVALUATION ENGINE
// ============================================================

/** Evaluate a single rule (optionally with full source/candidate attributes for cross-attribute evaluators) */
function evaluateRule(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined,
  sourceAttrs?: PartAttributes,
): RuleEvaluationResult {
  // User-defined acceptance allowlist (AcceptanceCriterion kind 'set'). If the
  // user explicitly marked the candidate's value for this attribute as
  // acceptable, short-circuit to a pass regardless of the rule's normal logic.
  // Rule-type-agnostic — works for identity / identity_flag / identity_upgrade.
  if (rule.acceptedValues && rule.acceptedValues.length > 0 && candidateParam) {
    const cand = normalize(candidateParam.value);
    if (rule.acceptedValues.some((v) => normalize(v) === cand)) {
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        sourceValue: sourceParam?.value ?? 'N/A',
        candidateValue: candidateParam.value,
        logicType: rule.logicType,
        result: 'pass',
        matchStatus: 'compatible',
        note: `Accepted by user — ${candidateParam.value} marked acceptable for ${rule.attributeName}`,
      };
    }
  }

  switch (rule.logicType) {
    case 'identity':
      return evaluateIdentity(rule, sourceParam, candidateParam);
    case 'identity_range':
      return evaluateIdentityRange(rule, sourceParam, candidateParam);
    case 'identity_upgrade':
      return evaluateIdentityUpgrade(rule, sourceParam, candidateParam);
    case 'identity_flag':
      return evaluateIdentityFlag(rule, sourceParam, candidateParam);
    case 'threshold':
      return evaluateThreshold(rule, sourceParam, candidateParam);
    case 'fit':
      return evaluateFit(rule, sourceParam, candidateParam);
    case 'application_review':
      return evaluateApplicationReview(rule, sourceParam, candidateParam);
    case 'vref_check':
      return evaluateVrefCheck(rule, sourceParam, candidateParam, sourceAttrs!);
    case 'operational':
      return evaluateOperational(rule, sourceParam, candidateParam);
  }
}

/** Build a lookup map for parameters by attributeId */
function buildParamMap(params: ParametricAttribute[]): Map<string, ParametricAttribute> {
  return new Map(params.map(p => [p.parameterId, p]));
}

/** Evaluate a candidate against a source part using a logic table */
export function evaluateCandidate(
  logicTable: LogicTable,
  source: PartAttributes,
  candidate: PartAttributes
): CandidateEvaluation {
  const sourceMap = buildParamMap(source.parameters);
  const candidateMap = buildParamMap(candidate.parameters);

  const results: RuleEvaluationResult[] = [];
  const reviewFlags: string[] = [];
  const notes: string[] = [];

  let totalWeight = 0;
  let earnedWeight = 0;
  let hasHardFailure = false;

  for (const rule of logicTable.rules) {
    const sourceParam = sourceMap.get(rule.attributeId);
    const candidateParam = candidateMap.get(rule.attributeId);

    const result = evaluateRule(rule, sourceParam, candidateParam, source);
    results.push(result);

    // Scoring logic
    if (rule.logicType === 'application_review') {
      reviewFlags.push(rule.attributeName);
      if (result.note) notes.push(result.note);
      // Application review gets partial credit
      totalWeight += rule.weight;
      earnedWeight += rule.weight * 0.5;
    } else if (rule.logicType === 'operational') {
      // Operational rules don't affect pass/fail or score significantly
      totalWeight += rule.weight;
      earnedWeight += result.matchStatus === 'exact' ? rule.weight : rule.weight * 0.8;
    } else {
      totalWeight += rule.weight;
      switch (result.result) {
        case 'pass':
          earnedWeight += rule.weight;
          break;
        case 'upgrade':
          earnedWeight += rule.weight; // Full credit for upgrades
          break;
        case 'fail':
          hasHardFailure = true;
          earnedWeight += 0;
          break;
        case 'review':
          earnedWeight += rule.weight * 0.5;
          reviewFlags.push(rule.attributeName);
          break;
      }
    }

    if (result.note) {
      notes.push(result.note);
    }
  }

  const matchPercentage = totalWeight > 0
    ? Math.round((earnedWeight / totalWeight) * 100)
    : 0;

  return {
    candidate,
    matchPercentage,
    passed: !hasHardFailure,
    results,
    reviewFlags,
    notes,
  };
}

/**
 * Check if a manufacturer matches any preferred manufacturer.
 *
 * When `manufacturerSlugLookup` is supplied (built by the caller via
 * `manufacturerAliasResolver`), compare canonical slugs — this collapses
 * acquired-brand families so "prefer Analog Devices" also floats Linear
 * Technology / Maxim / Hittite parts. Falls back to the original substring
 * check for any input that doesn't resolve (non-Atlas/Western MFRs, blanks).
 */
function isPreferredManufacturer(
  manufacturer: string,
  preferred: string[],
  manufacturerSlugLookup?: Map<string, string>,
): boolean {
  if (manufacturerSlugLookup) {
    const candidateSlug = manufacturerSlugLookup.get(manufacturer.toLowerCase());
    if (candidateSlug) {
      for (const p of preferred) {
        const preferredSlug = manufacturerSlugLookup.get(p.toLowerCase());
        if (preferredSlug && preferredSlug === candidateSlug) return true;
      }
    }
    // Fall through to substring check for inputs that didn't resolve.
  }
  const mfrLower = manufacturer.toLowerCase();
  return preferred.some(p => mfrLower.includes(p.toLowerCase()) || p.toLowerCase().includes(mfrLower));
}

/** Evaluate multiple candidates and return ranked recommendations */
export function findReplacements(
  logicTable: LogicTable,
  source: PartAttributes,
  candidates: PartAttributes[],
  preferredManufacturers?: string[],
  manufacturerSlugLookup?: Map<string, string>,
): XrefRecommendation[] {
  // Filter out the source part itself
  const filteredCandidates = candidates.filter(
    c => c.part.mpn !== source.part.mpn
  );

  const evaluations = filteredCandidates.map(candidate =>
    evaluateCandidate(logicTable, source, candidate)
  );

  // Sort by: passed first, then by match percentage (with manufacturer preference boost)
  const hasPreferred = preferredManufacturers && preferredManufacturers.length > 0;
  evaluations.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
    // Apply manufacturer preference: preferred manufacturers sort above non-preferred at equal/close scores
    if (hasPreferred) {
      const aPreferred = isPreferredManufacturer(a.candidate.part.manufacturer, preferredManufacturers, manufacturerSlugLookup);
      const bPreferred = isPreferredManufacturer(b.candidate.part.manufacturer, preferredManufacturers, manufacturerSlugLookup);
      if (aPreferred !== bPreferred) {
        // Only boost if scores are within 5% of each other
        if (Math.abs(a.matchPercentage - b.matchPercentage) <= 5) {
          return aPreferred ? -1 : 1;
        }
      }
    }
    return b.matchPercentage - a.matchPercentage;
  });

  // Convert to XrefRecommendation format for UI compatibility
  return evaluations.map(evaluation => {
    const matchDetails: MatchDetail[] = evaluation.results.map(r => ({
      parameterId: r.attributeId,
      parameterName: r.attributeName,
      sourceValue: r.sourceValue,
      replacementValue: r.candidateValue,
      matchStatus: r.matchStatus,
      ruleResult: r.result,
      note: r.note,
    }));

    const noteParts: string[] = [];
    if (!evaluation.passed) {
      noteParts.push('Has failing attributes');
    }
    if (evaluation.reviewFlags.length > 0) {
      noteParts.push(`Needs review: ${evaluation.reviewFlags.join(', ')}`);
    }
    if (evaluation.notes.length > 0) {
      // Add unique notes
      const uniqueNotes = [...new Set(evaluation.notes)];
      noteParts.push(...uniqueNotes.slice(0, 2));
    }

    return {
      part: evaluation.candidate.part,
      matchPercentage: evaluation.matchPercentage,
      matchDetails,
      notes: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
    };
  });
}

// ============================================================
// MISSING ATTRIBUTE DETECTION
// ============================================================

/**
 * Detect source-part attributes that the logic table requires but are missing.
 * Returns matchable rules (excluding application_review and operational) whose
 * attributeId has no corresponding parameterId in the source attributes.
 * Sorted by weight descending (most critical first).
 */
export function detectMissingAttributes(
  attributes: PartAttributes,
  logicTable: LogicTable
): MissingAttributeInfo[] {
  const paramIds = new Set(attributes.parameters.map(p => p.parameterId));

  return logicTable.rules
    .filter(rule =>
      rule.logicType !== 'application_review' &&
      rule.logicType !== 'operational' &&
      !paramIds.has(rule.attributeId)
    )
    .sort((a, b) => b.weight - a.weight)
    .map(rule => ({
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      logicType: rule.logicType,
      weight: rule.weight,
      ...(rule.upgradeHierarchy ? { upgradeHierarchy: rule.upgradeHierarchy } : {}),
    }));
}
