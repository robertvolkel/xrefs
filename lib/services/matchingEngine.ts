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
function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
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
      result: !sourceParam ? 'pass' : 'fail',
      matchStatus: !sourceParam ? 'exact' : 'different',
      note: !candidateParam ? 'Missing attribute data' : undefined,
    };
  }

  // Compare numeric values if available, otherwise string comparison
  let match = false;
  const srcNum = getNumeric(sourceParam);
  const candNum = getNumeric(candidateParam);
  if (srcNum !== null && candNum !== null) {
    match = srcNum === candNum;
  } else {
    match = normalize(sourceValue) === normalize(candidateValue);
  }

  return {
    attributeId: rule.attributeId,
    attributeName: rule.attributeName,
    sourceValue,
    candidateValue,
    logicType: rule.logicType,
    result: match ? 'pass' : 'fail',
    matchStatus: match ? 'exact' : 'different',
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
      result: !sourceParam ? 'pass' : 'fail',
      matchStatus: !sourceParam ? 'exact' : 'different',
    };
  }

  const srcNorm = normalize(sourceValue);
  const candNorm = normalize(candidateValue);

  // Find positions in hierarchy (lower index = better)
  const srcIdx = hierarchy.findIndex(h => srcNorm.includes(h.toUpperCase()));
  const candIdx = hierarchy.findIndex(h => candNorm.includes(h.toUpperCase()));

  // If neither is in hierarchy, do exact string match
  if (srcIdx === -1 && candIdx === -1) {
    const match = srcNorm === candNorm;
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: match ? 'pass' : 'fail',
      matchStatus: match ? 'exact' : 'different',
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
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: !sourceParam ? 'pass' : 'review',
      matchStatus: !sourceParam ? 'exact' : 'different',
      note: !candidateParam ? 'Missing attribute data' : undefined,
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
    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: candTol <= srcTol ? 'pass' : 'fail',
      matchStatus: candTol < srcTol ? 'better' : 'worse',
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

    return {
      attributeId: rule.attributeId,
      attributeName: rule.attributeName,
      sourceValue,
      candidateValue,
      logicType: rule.logicType,
      result: candMSL <= srcMSL ? 'pass' : 'fail',
      matchStatus: candMSL < srcMSL ? 'better' : 'worse',
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
  };
}

function evaluateFit(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  // Fit rules are threshold with lte direction
  return evaluateThreshold(
    { ...rule, thresholdDirection: 'lte' },
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

// ============================================================
// MAIN EVALUATION ENGINE
// ============================================================

/** Evaluate a single rule */
function evaluateRule(
  rule: MatchingRule,
  sourceParam: ParametricAttribute | undefined,
  candidateParam: ParametricAttribute | undefined
): RuleEvaluationResult {
  switch (rule.logicType) {
    case 'identity':
      return evaluateIdentity(rule, sourceParam, candidateParam);
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

    const result = evaluateRule(rule, sourceParam, candidateParam);
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

/** Evaluate multiple candidates and return ranked recommendations */
export function findReplacements(
  logicTable: LogicTable,
  source: PartAttributes,
  candidates: PartAttributes[]
): XrefRecommendation[] {
  // Filter out the source part itself
  const filteredCandidates = candidates.filter(
    c => c.part.mpn !== source.part.mpn
  );

  const evaluations = filteredCandidates.map(candidate =>
    evaluateCandidate(logicTable, source, candidate)
  );

  // Sort by: passed first, then by match percentage
  evaluations.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
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
    }));
}
