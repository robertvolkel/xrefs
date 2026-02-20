import {
  evaluateCandidate,
  findReplacements,
  detectMissingAttributes,
} from '@/lib/services/matchingEngine';
import {
  PartAttributes,
  ParametricAttribute,
  MatchingRule,
  LogicTable,
} from '@/lib/types';

// ============================================================
// HELPERS
// ============================================================

/** Minimal Part stub — only fields the engine actually reads */
function makePart(mpn = 'TEST-001') {
  return {
    mpn,
    manufacturer: 'TestCo',
    description: 'Test part',
    detailedDescription: '',
    category: 'Capacitors' as const,
    subcategory: 'MLCC',
    status: 'Active' as const,
  };
}

function param(id: string, value: string, numericValue?: number): ParametricAttribute {
  return { parameterId: id, parameterName: id, value, numericValue, sortOrder: 0 };
}

function attrs(params: ParametricAttribute[], mpn = 'TEST-001'): PartAttributes {
  return { part: makePart(mpn), parameters: params };
}

function rule(overrides: Partial<MatchingRule> & { attributeId: string }): MatchingRule {
  return {
    attributeName: overrides.attributeId,
    logicType: 'identity',
    weight: 5,
    engineeringReason: 'test',
    sortOrder: 1,
    ...overrides,
  };
}

function table(rules: MatchingRule[]): LogicTable {
  return {
    familyId: 'test',
    familyName: 'Test Family',
    category: 'Passives',
    description: 'Test logic table',
    rules,
  };
}

// ============================================================
// getNumeric — tested indirectly via identity / threshold rules
// that compare numericValue fields
// ============================================================

describe('matchingEngine', () => {
  // ----------------------------------------------------------
  // IDENTITY RULES
  // ----------------------------------------------------------
  describe('identity rule', () => {
    const r = rule({ attributeId: 'capacitance', logicType: 'identity' });

    it('passes when values match exactly (numeric)', () => {
      const src = attrs([param('capacitance', '100nF', 1e-7)]);
      const cand = attrs([param('capacitance', '100nF', 1e-7)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when string values match (case-insensitive)', () => {
      const src = attrs([param('capacitance', '100nF')]);
      const cand = attrs([param('capacitance', '100NF')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when values differ', () => {
      const src = attrs([param('capacitance', '100nF', 1e-7)]);
      const cand = attrs([param('capacitance', '10nF', 1e-8)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes when source is missing (N/A)', () => {
      const src = attrs([]);
      const cand = attrs([param('capacitance', '100nF', 1e-7)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when candidate is missing but source has value', () => {
      const src = attrs([param('capacitance', '100nF', 1e-7)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes when both are missing', () => {
      const src = attrs([]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });
  });

  // ----------------------------------------------------------
  // IDENTITY_UPGRADE RULES
  // ----------------------------------------------------------
  describe('identity_upgrade rule', () => {
    const r = rule({
      attributeId: 'dielectric',
      logicType: 'identity_upgrade',
      upgradeHierarchy: ['C0G', 'X7R', 'X5R', 'Y5V'],
    });

    it('passes with exact match', () => {
      const src = attrs([param('dielectric', 'X7R')]);
      const cand = attrs([param('dielectric', 'X7R')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('upgrades when candidate is better', () => {
      const src = attrs([param('dielectric', 'X7R')]);
      const cand = attrs([param('dielectric', 'C0G')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('upgrade');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate is worse (downgrade)', () => {
      const src = attrs([param('dielectric', 'X7R')]);
      const cand = attrs([param('dielectric', 'Y5V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
      expect(result.results[0].matchStatus).toBe('worse');
    });

    it('handles substring matching (e.g. "C0G (NP0)" matches "C0G")', () => {
      const src = attrs([param('dielectric', 'C0G (NP0)')]);
      const cand = attrs([param('dielectric', 'X7R')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      // C0G is index 0, X7R is index 1 → downgrade
      expect(result.results[0].result).toBe('fail');
      expect(result.results[0].matchStatus).toBe('worse');
    });

    it('avoids substring collision (Shielded vs Semi-Shielded)', () => {
      const shieldingRule = rule({
        attributeId: 'shielding',
        logicType: 'identity_upgrade',
        upgradeHierarchy: ['Shielded', 'Semi-Shielded', 'Unshielded'],
      });
      // "Shielded" should match index 0 exactly, not substring-match "Semi-Shielded"
      const src = attrs([param('shielding', 'Shielded')]);
      const cand = attrs([param('shielding', 'Semi-Shielded')], 'CAND-001');
      const result = evaluateCandidate(table([shieldingRule]), src, cand);
      expect(result.results[0].result).toBe('fail');
      expect(result.results[0].matchStatus).toBe('worse');
    });

    it('falls back to exact string comparison when neither is in hierarchy', () => {
      const src = attrs([param('dielectric', 'Unknown1')]);
      const cand = attrs([param('dielectric', 'Unknown1')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when neither in hierarchy but strings differ', () => {
      const src = attrs([param('dielectric', 'Unknown1')]);
      const cand = attrs([param('dielectric', 'Unknown2')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('fails when source in hierarchy but candidate is not', () => {
      const src = attrs([param('dielectric', 'X7R')]);
      const cand = attrs([param('dielectric', 'ZZZ')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes when source is missing', () => {
      const src = attrs([]);
      const cand = attrs([param('dielectric', 'X7R')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when candidate is missing', () => {
      const src = attrs([param('dielectric', 'X7R')]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });
  });

  // ----------------------------------------------------------
  // IDENTITY_FLAG RULES
  // ----------------------------------------------------------
  describe('identity_flag rule', () => {
    const r = rule({ attributeId: 'aec_q200', logicType: 'identity_flag' });

    it('passes when both have the flag', () => {
      const src = attrs([param('aec_q200', 'Yes')]);
      const cand = attrs([param('aec_q200', 'Yes')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('fails when source requires it but candidate does not', () => {
      const src = attrs([param('aec_q200', 'Yes')]);
      const cand = attrs([param('aec_q200', 'No')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes (better) when source does not require but candidate has it', () => {
      const src = attrs([param('aec_q200', 'No')]);
      const cand = attrs([param('aec_q200', 'Yes')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('passes when neither has the flag', () => {
      const src = attrs([param('aec_q200', 'No')]);
      const cand = attrs([param('aec_q200', 'No')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('defaults to "No" when parameter is missing', () => {
      const src = attrs([]);
      const cand = attrs([param('aec_q200', 'Yes')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      // source defaults to "No" (not required), candidate has it → pass (better)
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('recognizes "Required" as truthy', () => {
      const src = attrs([param('aec_q200', 'Required')]);
      const cand = attrs([param('aec_q200', 'No')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });
  });

  // ----------------------------------------------------------
  // THRESHOLD RULES — gte
  // ----------------------------------------------------------
  describe('threshold rule (gte)', () => {
    const r = rule({
      attributeId: 'voltage_rating',
      logicType: 'threshold',
      thresholdDirection: 'gte',
    });

    it('passes when candidate meets threshold (equal)', () => {
      const src = attrs([param('voltage_rating', '25V', 25)]);
      const cand = attrs([param('voltage_rating', '25V', 25)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when candidate exceeds threshold', () => {
      const src = attrs([param('voltage_rating', '25V', 25)]);
      const cand = attrs([param('voltage_rating', '50V', 50)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate is below threshold', () => {
      const src = attrs([param('voltage_rating', '50V', 50)]);
      const cand = attrs([param('voltage_rating', '25V', 25)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes when source is missing', () => {
      const src = attrs([]);
      const cand = attrs([param('voltage_rating', '25V', 25)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('returns review when candidate is missing', () => {
      const src = attrs([param('voltage_rating', '25V', 25)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });

    it('falls back to string comparison when numeric parsing fails', () => {
      const src = attrs([param('voltage_rating', 'abc')]);
      const cand = attrs([param('voltage_rating', 'abc')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });
  });

  // ----------------------------------------------------------
  // THRESHOLD RULES — lte
  // ----------------------------------------------------------
  describe('threshold rule (lte)', () => {
    const r = rule({
      attributeId: 'esr',
      logicType: 'threshold',
      thresholdDirection: 'lte',
    });

    it('passes when candidate is equal', () => {
      const src = attrs([param('esr', '0.5Ω', 0.5)]);
      const cand = attrs([param('esr', '0.5Ω', 0.5)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when candidate is lower (better)', () => {
      const src = attrs([param('esr', '0.5Ω', 0.5)]);
      const cand = attrs([param('esr', '0.3Ω', 0.3)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate is higher', () => {
      const src = attrs([param('esr', '0.5Ω', 0.5)]);
      const cand = attrs([param('esr', '1.0Ω', 1.0)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });
  });

  // ----------------------------------------------------------
  // THRESHOLD RULES — tolerance (special: lower is tighter = better)
  // ----------------------------------------------------------
  describe('threshold rule (tolerance)', () => {
    const r = rule({
      attributeId: 'tolerance',
      logicType: 'threshold',
      thresholdDirection: 'lte',
    });

    it('passes with equal tolerance', () => {
      const src = attrs([param('tolerance', '±5%')]);
      const cand = attrs([param('tolerance', '±5%')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when candidate is tighter', () => {
      const src = attrs([param('tolerance', '±10%')]);
      const cand = attrs([param('tolerance', '±5%')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate is looser', () => {
      const src = attrs([param('tolerance', '±5%')]);
      const cand = attrs([param('tolerance', '±10%')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('handles "5%" without ± sign', () => {
      const src = attrs([param('tolerance', '5%')]);
      const cand = attrs([param('tolerance', '5%')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('returns review when tolerance cannot be parsed', () => {
      const src = attrs([param('tolerance', 'not-a-value')]);
      const cand = attrs([param('tolerance', '5%')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });
  });

  // ----------------------------------------------------------
  // THRESHOLD RULES — range_superset (temperature range)
  // ----------------------------------------------------------
  describe('threshold rule (range_superset)', () => {
    const r = rule({
      attributeId: 'temp_range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
    });

    it('passes when ranges are identical', () => {
      const src = attrs([param('temp_range', '-55°C ~ 125°C')]);
      const cand = attrs([param('temp_range', '-55°C ~ 125°C')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when candidate range is wider (superset)', () => {
      const src = attrs([param('temp_range', '-40°C ~ 85°C')]);
      const cand = attrs([param('temp_range', '-55°C ~ 125°C')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate range is narrower', () => {
      const src = attrs([param('temp_range', '-55°C ~ 125°C')]);
      const cand = attrs([param('temp_range', '-40°C ~ 85°C')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('handles "to" separator', () => {
      const src = attrs([param('temp_range', '-40C to 125C')]);
      const cand = attrs([param('temp_range', '-40C to 125C')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('returns review when range cannot be parsed', () => {
      const src = attrs([param('temp_range', 'unparseable')]);
      const cand = attrs([param('temp_range', '-40°C ~ 85°C')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });
  });

  // ----------------------------------------------------------
  // FIT RULES (delegates to threshold with lte)
  // ----------------------------------------------------------
  describe('fit rule', () => {
    const r = rule({ attributeId: 'height', logicType: 'fit' });

    it('passes when candidate fits (equal)', () => {
      const src = attrs([param('height', '1.0mm', 1.0)]);
      const cand = attrs([param('height', '1.0mm', 1.0)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('passes when candidate is smaller', () => {
      const src = attrs([param('height', '1.5mm', 1.5)]);
      const cand = attrs([param('height', '1.0mm', 1.0)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate is taller', () => {
      const src = attrs([param('height', '1.0mm', 1.0)]);
      const cand = attrs([param('height', '1.5mm', 1.5)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });
  });

  // ----------------------------------------------------------
  // APPLICATION_REVIEW RULES
  // ----------------------------------------------------------
  describe('application_review rule', () => {
    const r = rule({
      attributeId: 'dc_bias_derating',
      logicType: 'application_review',
      engineeringReason: 'Requires manual DC bias check',
    });

    it('always returns review', () => {
      const src = attrs([param('dc_bias_derating', 'some value')]);
      const cand = attrs([param('dc_bias_derating', 'other value')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
      expect(result.results[0].matchStatus).toBe('compatible');
    });

    it('includes engineering reason as note', () => {
      const src = attrs([]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].note).toBe('Requires manual DC bias check');
    });
  });

  // ----------------------------------------------------------
  // OPERATIONAL RULES
  // ----------------------------------------------------------
  describe('operational rule', () => {
    const r = rule({ attributeId: 'packaging', logicType: 'operational' });

    it('returns info with exact matchStatus when values match', () => {
      const src = attrs([param('packaging', 'Tape & Reel')]);
      const cand = attrs([param('packaging', 'Tape & Reel')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('info');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('returns info with compatible matchStatus when values differ', () => {
      const src = attrs([param('packaging', 'Tape & Reel')]);
      const cand = attrs([param('packaging', 'Cut Tape')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('info');
      expect(result.results[0].matchStatus).toBe('compatible');
    });
  });

  // ----------------------------------------------------------
  // SCORING (evaluateCandidate / scoreCandidate)
  // ----------------------------------------------------------
  describe('scoring', () => {
    it('calculates match percentage from weighted rules', () => {
      const rules = [
        rule({ attributeId: 'cap', logicType: 'identity', weight: 10 }),
        rule({ attributeId: 'volt', logicType: 'threshold', thresholdDirection: 'gte', weight: 8 }),
      ];
      const src = attrs([
        param('cap', '100nF', 1e-7),
        param('volt', '25V', 25),
      ]);
      const cand = attrs([
        param('cap', '100nF', 1e-7),
        param('volt', '50V', 50),
      ], 'CAND-001');
      const result = evaluateCandidate(table(rules), src, cand);
      expect(result.matchPercentage).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('hard failure causes passed=false even with high percentage', () => {
      const rules = [
        rule({ attributeId: 'cap', logicType: 'identity', weight: 10 }),
        rule({ attributeId: 'pkg', logicType: 'identity', weight: 1 }),
      ];
      const src = attrs([
        param('cap', '100nF', 1e-7),
        param('pkg', '0402'),
      ]);
      const cand = attrs([
        param('cap', '100nF', 1e-7),
        param('pkg', '0603'),
      ], 'CAND-001');
      const result = evaluateCandidate(table(rules), src, cand);
      expect(result.passed).toBe(false);
      // 10 earned out of 11 total → ~91%
      expect(result.matchPercentage).toBe(91);
    });

    it('application_review gets 50% credit', () => {
      const rules = [
        rule({ attributeId: 'review_rule', logicType: 'application_review', weight: 10, engineeringReason: 'manual check' }),
      ];
      const src = attrs([]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table(rules), src, cand);
      // 50% of weight 10 = 5 earned out of 10 total = 50%
      expect(result.matchPercentage).toBe(50);
      expect(result.passed).toBe(true);
      expect(result.reviewFlags).toContain('review_rule');
    });

    it('operational rule gets 80% credit when values differ', () => {
      const rules = [
        rule({ attributeId: 'packaging', logicType: 'operational', weight: 5 }),
      ];
      const src = attrs([param('packaging', 'Tape & Reel')]);
      const cand = attrs([param('packaging', 'Cut Tape')], 'CAND-001');
      const result = evaluateCandidate(table(rules), src, cand);
      // 80% of 5 = 4 earned out of 5 total = 80%
      expect(result.matchPercentage).toBe(80);
    });

    it('operational rule gets full credit when values match', () => {
      const rules = [
        rule({ attributeId: 'packaging', logicType: 'operational', weight: 5 }),
      ];
      const src = attrs([param('packaging', 'Tape & Reel')]);
      const cand = attrs([param('packaging', 'Tape & Reel')], 'CAND-001');
      const result = evaluateCandidate(table(rules), src, cand);
      expect(result.matchPercentage).toBe(100);
    });

    it('upgrade gets full credit', () => {
      const rules = [
        rule({
          attributeId: 'dielectric',
          logicType: 'identity_upgrade',
          weight: 8,
          upgradeHierarchy: ['C0G', 'X7R', 'X5R'],
        }),
      ];
      const src = attrs([param('dielectric', 'X7R')]);
      const cand = attrs([param('dielectric', 'C0G')], 'CAND-001');
      const result = evaluateCandidate(table(rules), src, cand);
      expect(result.matchPercentage).toBe(100);
    });

    it('returns 0% when totalWeight is 0', () => {
      const result = evaluateCandidate(table([]), attrs([]), attrs([], 'CAND-001'));
      expect(result.matchPercentage).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // findReplacements — ranking and filtering
  // ----------------------------------------------------------
  describe('findReplacements', () => {
    const rules = [
      rule({ attributeId: 'cap', logicType: 'identity', weight: 10 }),
    ];

    it('filters out the source part itself', () => {
      const src = attrs([param('cap', '100nF', 1e-7)], 'SRC-001');
      const candidates = [
        attrs([param('cap', '100nF', 1e-7)], 'SRC-001'), // same MPN
        attrs([param('cap', '100nF', 1e-7)], 'CAND-001'),
      ];
      const results = findReplacements(table(rules), src, candidates);
      expect(results).toHaveLength(1);
      expect(results[0].part.mpn).toBe('CAND-001');
    });

    it('ranks passing candidates before failing ones', () => {
      const src = attrs([param('cap', '100nF', 1e-7)], 'SRC-001');
      const candidates = [
        attrs([param('cap', '10nF', 1e-8)], 'FAIL-001'),
        attrs([param('cap', '100nF', 1e-7)], 'PASS-001'),
      ];
      const results = findReplacements(table(rules), src, candidates);
      expect(results[0].part.mpn).toBe('PASS-001');
      expect(results[1].part.mpn).toBe('FAIL-001');
    });

    it('returns XrefRecommendation format with matchDetails', () => {
      const src = attrs([param('cap', '100nF', 1e-7)], 'SRC-001');
      const candidates = [attrs([param('cap', '100nF', 1e-7)], 'CAND-001')];
      const results = findReplacements(table(rules), src, candidates);
      expect(results[0]).toHaveProperty('matchPercentage', 100);
      expect(results[0]).toHaveProperty('matchDetails');
      expect(results[0].matchDetails[0]).toHaveProperty('parameterId', 'cap');
    });
  });

  // ----------------------------------------------------------
  // detectMissingAttributes
  // ----------------------------------------------------------
  describe('detectMissingAttributes', () => {
    it('detects rules with no matching parameter', () => {
      const lt = table([
        rule({ attributeId: 'capacitance', weight: 10 }),
        rule({ attributeId: 'voltage_rating', weight: 8 }),
      ]);
      const part = attrs([param('capacitance', '100nF')]);
      const missing = detectMissingAttributes(part, lt);
      expect(missing).toHaveLength(1);
      expect(missing[0].attributeId).toBe('voltage_rating');
    });

    it('excludes application_review and operational rules', () => {
      const lt = table([
        rule({ attributeId: 'dc_bias', logicType: 'application_review', weight: 5 }),
        rule({ attributeId: 'packaging', logicType: 'operational', weight: 2 }),
        rule({ attributeId: 'cap', logicType: 'identity', weight: 10 }),
      ]);
      const part = attrs([]); // no params at all
      const missing = detectMissingAttributes(part, lt);
      expect(missing).toHaveLength(1);
      expect(missing[0].attributeId).toBe('cap');
    });

    it('sorts by weight descending', () => {
      const lt = table([
        rule({ attributeId: 'a', weight: 3 }),
        rule({ attributeId: 'b', weight: 10 }),
        rule({ attributeId: 'c', weight: 7 }),
      ]);
      const part = attrs([]);
      const missing = detectMissingAttributes(part, lt);
      expect(missing.map(m => m.attributeId)).toEqual(['b', 'c', 'a']);
    });

    it('returns empty when all rules have matching params', () => {
      const lt = table([rule({ attributeId: 'cap', weight: 10 })]);
      const part = attrs([param('cap', '100nF')]);
      expect(detectMissingAttributes(part, lt)).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------
  // MSL threshold (special case)
  // ----------------------------------------------------------
  describe('MSL threshold', () => {
    const r = rule({
      attributeId: 'msl',
      logicType: 'threshold',
      thresholdDirection: 'lte',
    });

    it('passes when MSL levels are equal', () => {
      const src = attrs([param('msl', 'MSL 1')]);
      const cand = attrs([param('msl', 'MSL 1')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('passes when candidate MSL is lower (better)', () => {
      const src = attrs([param('msl', 'MSL 3')]);
      const cand = attrs([param('msl', 'MSL 1')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('better');
    });

    it('fails when candidate MSL is higher (worse)', () => {
      const src = attrs([param('msl', 'MSL 1')]);
      const cand = attrs([param('msl', 'MSL 3')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });
  });
});
