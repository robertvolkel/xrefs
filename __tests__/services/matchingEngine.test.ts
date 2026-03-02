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
import { switchingRegulatorLogicTable } from '@/lib/logicTables/switchingRegulator';
import { gateDriverLogicTable } from '@/lib/logicTables/gateDriver';
import { opampComparatorLogicTable } from '@/lib/logicTables/opampComparator';
import { c5LogicICsLogicTable } from '@/lib/logicTables/c5LogicICs';

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
  // THRESHOLD RULES — blockOnMissing
  // ----------------------------------------------------------
  describe('threshold rule (blockOnMissing)', () => {
    it('returns fail when candidate is missing and blockOnMissing is true', () => {
      const r = rule({
        attributeId: 'tst',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        blockOnMissing: true,
      });
      const src = attrs([param('tst', '200ns', 200)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
      expect(result.results[0].note).toContain('Missing critical specification');
    });

    it('returns review when candidate is missing and blockOnMissing is false', () => {
      const r = rule({
        attributeId: 'tst',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        blockOnMissing: false,
      });
      const src = attrs([param('tst', '200ns', 200)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });

    it('returns review when candidate is missing and blockOnMissing is undefined', () => {
      const r = rule({
        attributeId: 'tst',
        logicType: 'threshold',
        thresholdDirection: 'lte',
      });
      const src = attrs([param('tst', '200ns', 200)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });

    it('still passes when source is missing even with blockOnMissing', () => {
      const r = rule({
        attributeId: 'tst',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        blockOnMissing: true,
      });
      const src = attrs([]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('blockOnMissing has no effect when candidate has a value', () => {
      const r = rule({
        attributeId: 'tst',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        blockOnMissing: true,
      });
      const src = attrs([param('tst', '200ns', 200)]);
      const cand = attrs([param('tst', '150ns', 150)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });
  });

  // ----------------------------------------------------------
  // identity_range (range overlap matching — JFET Vp, Idss)
  // ----------------------------------------------------------
  describe('identity_range', () => {
    const r = rule({ attributeId: 'vp', logicType: 'identity_range', weight: 10 });

    it('passes when ranges overlap', () => {
      const src = attrs([param('vp', '-0.5V to -6V')]);
      const cand = attrs([param('vp', '-1V to -5V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when ranges do not overlap', () => {
      const src = attrs([param('vp', '-0.5V to -3V')]);
      const cand = attrs([param('vp', '-4V to -8V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes on exact range match', () => {
      const src = attrs([param('vp', '-2V to -6V')]);
      const cand = attrs([param('vp', '-2V to -6V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when single value falls within source range', () => {
      const src = attrs([param('vp', '-1V to -5V')]);
      const cand = attrs([param('vp', '-3V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when single value is outside source range', () => {
      const src = attrs([param('vp', '-1V to -3V')]);
      const cand = attrs([param('vp', '-5V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('passes with mA range (Idss)', () => {
      const idssRule = rule({ attributeId: 'idss', logicType: 'identity_range', weight: 9 });
      const src = attrs([param('idss', '1mA to 5mA')]);
      const cand = attrs([param('idss', '2mA to 8mA')], 'CAND-001');
      const result = evaluateCandidate(table([idssRule]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('handles tilde separator', () => {
      const src = attrs([param('vp', '-1V ~ -4V')]);
      const cand = attrs([param('vp', '-2V ~ -6V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('passes when source is missing (no spec to violate)', () => {
      const src = attrs([]);
      const cand = attrs([param('vp', '-2V to -6V')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails when candidate is missing (lacks critical spec)', () => {
      const src = attrs([param('vp', '-2V to -6V')]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('falls back to string comparison when unparsable', () => {
      const src = attrs([param('vp', 'custom-spec')]);
      const cand = attrs([param('vp', 'custom-spec')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('causes hard failure in scoring (same as identity)', () => {
      const r2 = rule({ attributeId: 'vp', logicType: 'identity_range', weight: 10 });
      const r3 = rule({ attributeId: 'package', logicType: 'identity', weight: 10 });
      const src = attrs([param('vp', '-1V to -3V'), param('package', 'TO-92')]);
      const cand = attrs([param('vp', '-5V to -8V'), param('package', 'TO-92')], 'CAND-001');
      const result = evaluateCandidate(table([r2, r3]), src, cand);
      expect(result.matchPercentage).toBeLessThan(100);
      expect(result.passed).toBe(false);
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

  // ----------------------------------------------------------
  // identity with tolerancePercent (C2 switching frequency ±10%)
  // ----------------------------------------------------------
  describe('identity with tolerancePercent', () => {
    const r = rule({ attributeId: 'fsw', logicType: 'identity', tolerancePercent: 10 });

    it('passes on exact numeric match', () => {
      const src = attrs([param('fsw', '500 kHz', 500000)]);
      const cand = attrs([param('fsw', '500 kHz', 500000)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes within ±10% tolerance (5% deviation)', () => {
      const src = attrs([param('fsw', '500 kHz', 500000)]);
      const cand = attrs([param('fsw', '525 kHz', 525000)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('compatible');
      expect(result.results[0].note).toContain('tolerance');
    });

    it('passes at exactly ±10% boundary', () => {
      const src = attrs([param('fsw', '500 kHz', 500000)]);
      const cand = attrs([param('fsw', '550 kHz', 550000)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('fails beyond ±10% tolerance (15% deviation)', () => {
      const src = attrs([param('fsw', '500 kHz', 500000)]);
      const cand = attrs([param('fsw', '575 kHz', 575000)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('falls through to string comparison when non-numeric', () => {
      const src = attrs([param('fsw', 'Variable')]);
      const cand = attrs([param('fsw', 'Variable')], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('no tolerance applied when tolerancePercent is absent (standard identity)', () => {
      const strictRule = rule({ attributeId: 'fsw', logicType: 'identity' });
      const src = attrs([param('fsw', '500 kHz', 500000)]);
      const cand = attrs([param('fsw', '525 kHz', 525000)], 'CAND-001');
      const result = evaluateCandidate(table([strictRule]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });
  });

  // ----------------------------------------------------------
  // vref_check (cross-attribute Vref → Vout recalculation)
  // ----------------------------------------------------------
  describe('vref_check', () => {
    const r = rule({ attributeId: 'vref', logicType: 'vref_check', weight: 9 });

    it('passes when Vref matches exactly', () => {
      const src = attrs([param('vref', '0.8V', 0.8), param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([param('vref', '0.8V', 0.8)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].matchStatus).toBe('exact');
    });

    it('passes when Vref matches within ±1%', () => {
      const src = attrs([param('vref', '0.800V', 0.8), param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([param('vref', '0.805V', 0.805)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('passes when Vref differs but Vout within ±2%', () => {
      // 3.3V design: Vref=0.8V, ratio = 3.3/0.8 - 1 = 3.125
      // Candidate Vref=0.81V → Vout_new = 0.81 × 4.125 = 3.34125 → 1.25% deviation
      const src = attrs([param('vref', '0.8V', 0.8), param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([param('vref', '0.81V', 0.81)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
      expect(result.results[0].note).toContain('within');
    });

    it('returns review when Vref differs and Vout deviates >2%', () => {
      // 3.3V design: Vref=0.8V, ratio = 3.125
      // Candidate Vref=1.25V → Vout_new = 1.25 × 4.125 = 5.156V → 56% deviation
      const src = attrs([param('vref', '0.8V', 0.8), param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([param('vref', '1.25V', 1.25)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
      expect(result.results[0].note).toContain('Rbot');
    });

    it('passes when source has no Vref (no constraint)', () => {
      const src = attrs([param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([param('vref', '0.8V', 0.8)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('pass');
    });

    it('returns review when candidate Vref is missing', () => {
      const src = attrs([param('vref', '0.8V', 0.8), param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });

    it('fails when candidate Vref missing and blockOnMissing', () => {
      const blockRule = rule({ attributeId: 'vref', logicType: 'vref_check', weight: 9, blockOnMissing: true });
      const src = attrs([param('vref', '0.8V', 0.8), param('output_voltage', '3.3V', 3.3)]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(table([blockRule]), src, cand);
      expect(result.results[0].result).toBe('fail');
    });

    it('returns review when source output_voltage is missing (cannot compute)', () => {
      const src = attrs([param('vref', '0.8V', 0.8)]);
      const cand = attrs([param('vref', '1.25V', 1.25)], 'CAND-001');
      const result = evaluateCandidate(table([r]), src, cand);
      expect(result.results[0].result).toBe('review');
    });
  });

  // ----------------------------------------------------------
  // C2 SWITCHING REGULATOR LOGIC TABLE STRUCTURE
  // ----------------------------------------------------------
  describe('C2 switching regulator logic table', () => {

    it('has correct family metadata', () => {
      expect(switchingRegulatorLogicTable.familyId).toBe('C2');
      expect(switchingRegulatorLogicTable.category).toBe('Integrated Circuits');
    });

    it('has 22 rules', () => {
      expect(switchingRegulatorLogicTable.rules).toHaveLength(22);
    });

    it('topology is identity w10 with blockOnMissing', () => {
      const topology = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'topology');
      expect(topology).toBeDefined();
      expect(topology.logicType).toBe('identity');
      expect(topology.weight).toBe(10);
      expect(topology.blockOnMissing).toBe(true);
    });

    it('architecture is identity w10 with blockOnMissing', () => {
      const arch = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'architecture');
      expect(arch).toBeDefined();
      expect(arch.logicType).toBe('identity');
      expect(arch.weight).toBe(10);
      expect(arch.blockOnMissing).toBe(true);
    });

    it('vref uses vref_check logicType', () => {
      const vref = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'vref');
      expect(vref).toBeDefined();
      expect(vref.logicType).toBe('vref_check');
      expect(vref.weight).toBe(9);
    });

    it('fsw uses identity with tolerancePercent: 10', () => {
      const fsw = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'fsw');
      expect(fsw).toBeDefined();
      expect(fsw.logicType).toBe('identity');
      expect(fsw.tolerancePercent).toBe(10);
      expect(fsw.weight).toBe(8);
    });

    it('control_mode is identity w9 (softened by context Q2)', () => {
      const cm = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'control_mode');
      expect(cm).toBeDefined();
      expect(cm.logicType).toBe('identity');
      expect(cm.weight).toBe(9);
    });

    it('iout_max is threshold gte w9', () => {
      const iout = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'iout_max');
      expect(iout).toBeDefined();
      expect(iout.logicType).toBe('threshold');
      expect(iout.thresholdDirection).toBe('gte');
      expect(iout.weight).toBe(9);
    });

    it('rth_ja is threshold lte', () => {
      const rth = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'rth_ja');
      expect(rth).toBeDefined();
      expect(rth.thresholdDirection).toBe('lte');
    });

    it('packaging is operational w1', () => {
      const pkg = switchingRegulatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'packaging');
      expect(pkg).toBeDefined();
      expect(pkg.logicType).toBe('operational');
      expect(pkg.weight).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // C3 GATE DRIVER LOGIC TABLE STRUCTURE
  // ----------------------------------------------------------
  describe('C3 gate driver logic table', () => {
    it('has correct family metadata', () => {
      expect(gateDriverLogicTable.familyId).toBe('C3');
      expect(gateDriverLogicTable.category).toBe('Integrated Circuits');
    });

    it('has 20 rules', () => {
      expect(gateDriverLogicTable.rules).toHaveLength(20);
    });

    it('driver_configuration is identity w10 with blockOnMissing', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'driver_configuration');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('identity');
      expect(rule.weight).toBe(10);
      expect(rule.blockOnMissing).toBe(true);
      expect(rule.sortOrder).toBe(1);
    });

    it('isolation_type is identity w10 with blockOnMissing', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'isolation_type');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('identity');
      expect(rule.weight).toBe(10);
      expect(rule.blockOnMissing).toBe(true);
    });

    it('output_polarity is identity_flag w9', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'output_polarity');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('identity_flag');
      expect(rule.weight).toBe(9);
    });

    it('peak_source_current is threshold gte w8', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'peak_source_current');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('threshold');
      expect(rule.thresholdDirection).toBe('gte');
      expect(rule.weight).toBe(8);
    });

    it('propagation_delay is threshold lte w7', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'propagation_delay');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('threshold');
      expect(rule.thresholdDirection).toBe('lte');
      expect(rule.weight).toBe(7);
    });

    it('dead_time_control is identity_flag w7', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'dead_time_control');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('identity_flag');
      expect(rule.weight).toBe(7);
    });

    it('dead_time is threshold gte w7', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'dead_time');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('threshold');
      expect(rule.thresholdDirection).toBe('gte');
      expect(rule.weight).toBe(7);
    });

    it('vdd_range is threshold range_superset w8', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'vdd_range');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('threshold');
      expect(rule.thresholdDirection).toBe('range_superset');
      expect(rule.weight).toBe(8);
    });

    it('aec_q100 is identity_flag w8', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'aec_q100');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('identity_flag');
      expect(rule.weight).toBe(8);
    });

    it('packaging is operational w1', () => {
      const rule = gateDriverLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'packaging');
      expect(rule).toBeDefined();
      expect(rule.logicType).toBe('operational');
      expect(rule.weight).toBe(1);
    });
  });

  // ============================================================
  // C4: OP-AMPS / COMPARATORS
  // ============================================================
  describe('C4 Op-Amps / Comparators', () => {
    it('has 24 rules', () => {
      expect(opampComparatorLogicTable.rules).toHaveLength(24);
    });

    it('device_type is identity w10 blockOnMissing', () => {
      const r = opampComparatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'device_type');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity');
      expect(r.weight).toBe(10);
      expect(r.blockOnMissing).toBe(true);
    });

    it('device_type identity — op-amp vs comparator fails', () => {
      const t = table([rule({ attributeId: 'device_type', logicType: 'identity', weight: 10, blockOnMissing: true })]);
      const source = attrs([param('device_type', 'Op-Amp')]);
      const cand = attrs([param('device_type', 'Comparator')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'device_type');
      expect(r?.result).toBe('fail');
      expect(result.passed).toBe(false);
    });

    it('device_type identity — op-amp vs op-amp passes', () => {
      const t = table([rule({ attributeId: 'device_type', logicType: 'identity', weight: 10 })]);
      const source = attrs([param('device_type', 'Op-Amp')]);
      const cand = attrs([param('device_type', 'Op-Amp')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'device_type');
      expect(r?.result).toBe('pass');
    });

    it('input_type identity_upgrade — CMOS replacing JFET is upgrade', () => {
      const t = table([rule({
        attributeId: 'input_type',
        logicType: 'identity_upgrade',
        upgradeHierarchy: ['CMOS', 'JFET', 'Bipolar'],
        weight: 9,
      })]);
      const source = attrs([param('input_type', 'JFET')]);
      const cand = attrs([param('input_type', 'CMOS')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'input_type');
      expect(r?.result).toBe('upgrade');
    });

    it('input_type identity_upgrade — bipolar replacing CMOS fails', () => {
      const t = table([rule({
        attributeId: 'input_type',
        logicType: 'identity_upgrade',
        upgradeHierarchy: ['CMOS', 'JFET', 'Bipolar'],
        weight: 9,
      })]);
      const source = attrs([param('input_type', 'CMOS')]);
      const cand = attrs([param('input_type', 'Bipolar')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'input_type');
      expect(r?.result).toBe('fail');
    });

    it('min_stable_gain threshold lte — decompensated replacing compensated fails', () => {
      const t = table([rule({
        attributeId: 'min_stable_gain',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        weight: 8,
      })]);
      const source = attrs([param('min_stable_gain', '1', 1)]);
      const cand = attrs([param('min_stable_gain', '10', 10)], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'min_stable_gain');
      expect(r?.result).toBe('fail');
    });

    it('min_stable_gain threshold lte — compensated replacing decompensated passes', () => {
      const t = table([rule({
        attributeId: 'min_stable_gain',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        weight: 8,
      })]);
      const source = attrs([param('min_stable_gain', '10', 10)]);
      const cand = attrs([param('min_stable_gain', '1', 1)], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'min_stable_gain');
      expect(r?.result).toBe('pass');
    });

    it('output_type identity — open-drain vs push-pull fails', () => {
      const t = table([rule({ attributeId: 'output_type', logicType: 'identity', weight: 8 })]);
      const source = attrs([param('output_type', 'Push-Pull')]);
      const cand = attrs([param('output_type', 'Open-Drain')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'output_type');
      expect(r?.result).toBe('fail');
    });

    it('rail_to_rail_input identity_flag — source has RRI, candidate lacks → fail', () => {
      const t = table([rule({ attributeId: 'rail_to_rail_input', logicType: 'identity_flag', weight: 8 })]);
      const source = attrs([param('rail_to_rail_input', 'Yes')]);
      const cand = attrs([param('rail_to_rail_input', 'No')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'rail_to_rail_input');
      expect(r?.result).toBe('fail');
    });

    it('rail_to_rail_output identity_flag — candidate has RRO when source does not → better', () => {
      const t = table([rule({ attributeId: 'rail_to_rail_output', logicType: 'identity_flag', weight: 8 })]);
      const source = attrs([param('rail_to_rail_output', 'No')]);
      const cand = attrs([param('rail_to_rail_output', 'Yes')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'rail_to_rail_output');
      expect(r?.result).toBe('pass');
    });

    it('vicm_range is threshold range_superset w9 blockOnMissing', () => {
      const r = opampComparatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'vicm_range');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('threshold');
      expect(r.thresholdDirection).toBe('range_superset');
      expect(r.weight).toBe(9);
      expect(r.blockOnMissing).toBe(true);
    });

    it('channels is identity w10 blockOnMissing', () => {
      const r = opampComparatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'channels');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity');
      expect(r.weight).toBe(10);
      expect(r.blockOnMissing).toBe(true);
    });

    it('aec_q100 is identity_flag w8', () => {
      const r = opampComparatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'aec_q100');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity_flag');
      expect(r.weight).toBe(8);
    });

    it('packaging is operational w1', () => {
      const r = opampComparatorLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'packaging');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('operational');
      expect(r.weight).toBe(1);
    });
  });

  // ============================================================
  // C5: LOGIC ICs — 74-SERIES STANDARD LOGIC
  // ============================================================
  describe('C5 Logic ICs — 74-Series', () => {

    // ----------------------------------------------------------
    // LOGIC TABLE STRUCTURE
    // ----------------------------------------------------------
    it('has correct family metadata', () => {
      expect(c5LogicICsLogicTable.familyId).toBe('C5');
      expect(c5LogicICsLogicTable.category).toBe('Integrated Circuits');
    });

    it('has 23 rules', () => {
      expect(c5LogicICsLogicTable.rules).toHaveLength(23);
    });

    it('logic_function is identity w10 blockOnMissing (HARD GATE)', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'logic_function');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity');
      expect(r.weight).toBe(10);
      expect(r.blockOnMissing).toBe(true);
      expect(r.sortOrder).toBe(1);
    });

    it('gate_count is identity w10 blockOnMissing', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'gate_count');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity');
      expect(r.weight).toBe(10);
      expect(r.blockOnMissing).toBe(true);
    });

    it('output_type is identity_flag w8', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'output_type');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity_flag');
      expect(r.weight).toBe(8);
    });

    it('oe_polarity is identity_flag w9', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'oe_polarity');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity_flag');
      expect(r.weight).toBe(9);
    });

    it('schmitt_trigger is identity_flag w7', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'schmitt_trigger');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity_flag');
      expect(r.weight).toBe(7);
    });

    it('vih is threshold lte w7', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'vih');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('threshold');
      expect(r.thresholdDirection).toBe('lte');
      expect(r.weight).toBe(7);
    });

    it('supply_voltage is threshold range_superset w8', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'supply_voltage');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('threshold');
      expect(r.thresholdDirection).toBe('range_superset');
      expect(r.weight).toBe(8);
    });

    it('tpd is threshold lte w7', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'tpd');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('threshold');
      expect(r.thresholdDirection).toBe('lte');
      expect(r.weight).toBe(7);
    });

    it('setup_hold_time is application_review w6 (user instruction override)', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'setup_hold_time');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('application_review');
      expect(r.weight).toBe(6);
    });

    it('logic_family is application_review w7', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'logic_family');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('application_review');
      expect(r.weight).toBe(7);
    });

    it('aec_q100 is identity_flag w8', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'aec_q100');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('identity_flag');
      expect(r.weight).toBe(8);
    });

    it('packaging is operational w1', () => {
      const r = c5LogicICsLogicTable.rules.find((r: MatchingRule) => r.attributeId === 'packaging');
      expect(r).toBeDefined();
      expect(r.logicType).toBe('operational');
      expect(r.weight).toBe(1);
    });

    // ----------------------------------------------------------
    // LOGIC_FUNCTION IDENTITY — the HARD GATE
    // ----------------------------------------------------------
    it('logic_function identity — same function code passes', () => {
      const t = table([rule({ attributeId: 'logic_function', logicType: 'identity', weight: 10, blockOnMissing: true })]);
      const source = attrs([param('logic_function', '04')]);
      const cand = attrs([param('logic_function', '04')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'logic_function');
      expect(r?.result).toBe('pass');
      expect(result.passed).toBe(true);
    });

    it('logic_function identity — 04 vs 14 fails (inverter vs Schmitt inverter)', () => {
      const t = table([rule({ attributeId: 'logic_function', logicType: 'identity', weight: 10, blockOnMissing: true })]);
      const source = attrs([param('logic_function', '04')]);
      const cand = attrs([param('logic_function', '14')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'logic_function');
      expect(r?.result).toBe('fail');
      expect(result.passed).toBe(false);
    });

    it('logic_function identity — 373 vs 374 fails (latch vs flip-flop)', () => {
      const t = table([rule({ attributeId: 'logic_function', logicType: 'identity', weight: 10, blockOnMissing: true })]);
      const source = attrs([param('logic_function', '373')]);
      const cand = attrs([param('logic_function', '374')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      expect(result.passed).toBe(false);
    });

    it('logic_function blockOnMissing — candidate missing logic_function fails', () => {
      const t = table([rule({ attributeId: 'logic_function', logicType: 'identity', weight: 10, blockOnMissing: true })]);
      const source = attrs([param('logic_function', '04')]);
      const cand = attrs([], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'logic_function');
      expect(r?.result).toBe('fail');
    });

    // ----------------------------------------------------------
    // OUTPUT_TYPE IDENTITY_FLAG — bus contention safety
    // ----------------------------------------------------------
    it('output_type identity_flag — source requires (Yes), candidate lacks (No) → fail', () => {
      const t = table([rule({ attributeId: 'output_type', logicType: 'identity_flag', weight: 8 })]);
      const source = attrs([param('output_type', 'Yes')]);
      const cand = attrs([param('output_type', 'No')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'output_type');
      expect(r?.result).toBe('fail');
    });

    it('output_type identity_flag — neither has flag → pass (exact)', () => {
      const t = table([rule({ attributeId: 'output_type', logicType: 'identity_flag', weight: 8 })]);
      const source = attrs([param('output_type', 'No')]);
      const cand = attrs([param('output_type', 'No')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'output_type');
      expect(r?.result).toBe('pass');
      expect(r?.matchStatus).toBe('exact');
    });

    it('output_type identity_flag — source lacks, candidate has → pass (better)', () => {
      const t = table([rule({ attributeId: 'output_type', logicType: 'identity_flag', weight: 8 })]);
      const source = attrs([param('output_type', 'No')]);
      const cand = attrs([param('output_type', 'Yes')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'output_type');
      expect(r?.result).toBe('pass');
      expect(r?.matchStatus).toBe('better');
    });

    // ----------------------------------------------------------
    // SCHMITT TRIGGER IDENTITY_FLAG
    // ----------------------------------------------------------
    it('schmitt_trigger identity_flag — source requires, candidate lacks → fail', () => {
      const t = table([rule({ attributeId: 'schmitt_trigger', logicType: 'identity_flag', weight: 7 })]);
      const source = attrs([param('schmitt_trigger', 'Yes')]);
      const cand = attrs([param('schmitt_trigger', 'No')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'schmitt_trigger');
      expect(r?.result).toBe('fail');
    });

    it('schmitt_trigger identity_flag — candidate has extra Schmitt → pass (better)', () => {
      const t = table([rule({ attributeId: 'schmitt_trigger', logicType: 'identity_flag', weight: 7 })]);
      const source = attrs([param('schmitt_trigger', 'No')]);
      const cand = attrs([param('schmitt_trigger', 'Yes')], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'schmitt_trigger');
      expect(r?.result).toBe('pass');
      expect(r?.matchStatus).toBe('better');
    });

    // ----------------------------------------------------------
    // VIH THRESHOLD LTE — the HC/HCT substitution trap
    // ----------------------------------------------------------
    it('vih threshold lte — HC VIH (3.5V) vs HCT VIH (2.0V) → HCT passes as lower', () => {
      const t = table([rule({ attributeId: 'vih', logicType: 'threshold', thresholdDirection: 'lte', weight: 7 })]);
      const source = attrs([param('vih', '3.5V', 3.5)]);
      const cand = attrs([param('vih', '2.0V', 2.0)], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'vih');
      expect(r?.result).toBe('pass');
      expect(r?.matchStatus).toBe('better');
    });

    it('vih threshold lte — HCT VIH (2.0V) → HC VIH (3.5V) fails (higher threshold)', () => {
      const t = table([rule({ attributeId: 'vih', logicType: 'threshold', thresholdDirection: 'lte', weight: 7 })]);
      const source = attrs([param('vih', '2.0V', 2.0)]);
      const cand = attrs([param('vih', '3.5V', 3.5)], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'vih');
      expect(r?.result).toBe('fail');
    });

    // ----------------------------------------------------------
    // DRIVE_CURRENT THRESHOLD GTE
    // ----------------------------------------------------------
    it('drive_current threshold gte — 24mA replacing 4mA passes', () => {
      const t = table([rule({ attributeId: 'drive_current', logicType: 'threshold', thresholdDirection: 'gte', weight: 7 })]);
      const source = attrs([param('drive_current', '4mA', 0.004)]);
      const cand = attrs([param('drive_current', '24mA', 0.024)], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'drive_current');
      expect(r?.result).toBe('pass');
      expect(r?.matchStatus).toBe('better');
    });

    it('drive_current threshold gte — 4mA replacing 24mA fails', () => {
      const t = table([rule({ attributeId: 'drive_current', logicType: 'threshold', thresholdDirection: 'gte', weight: 7 })]);
      const source = attrs([param('drive_current', '24mA', 0.024)]);
      const cand = attrs([param('drive_current', '4mA', 0.004)], 'CAND-001');
      const result = evaluateCandidate(t, source, cand);
      const r = result.results.find(r => r.attributeId === 'drive_current');
      expect(r?.result).toBe('fail');
    });

    // ----------------------------------------------------------
    // COMPOSITE SCORING — all C5 rules together
    // ----------------------------------------------------------
    it('perfect match across key C5 rules scores 100%', () => {
      const source = attrs([
        param('logic_function', '04'),
        param('gate_count', '6'),
        param('package_case', 'SOIC-14'),
        param('output_type', 'Totem-Pole'),
        param('schmitt_trigger', 'No'),
        param('vih', '3.5V', 3.5),
        param('supply_voltage', '2V to 6V'),
        param('tpd', '15ns', 15e-9),
        param('aec_q100', 'No'),
      ]);
      const cand = attrs([
        param('logic_function', '04'),
        param('gate_count', '6'),
        param('package_case', 'SOIC-14'),
        param('output_type', 'Totem-Pole'),
        param('schmitt_trigger', 'No'),
        param('vih', '3.5V', 3.5),
        param('supply_voltage', '2V to 6V'),
        param('tpd', '15ns', 15e-9),
        param('aec_q100', 'No'),
      ], 'CAND-001');
      const result = evaluateCandidate(c5LogicICsLogicTable, source, cand);
      expect(result.passed).toBe(true);
      expect(result.matchPercentage).toBeGreaterThanOrEqual(90);
    });

    it('function code mismatch causes hard fail regardless of other matches', () => {
      const source = attrs([
        param('logic_function', '04'),
        param('gate_count', '6'),
        param('package_case', 'SOIC-14'),
      ]);
      const cand = attrs([
        param('logic_function', '14'),  // Schmitt inverter, not standard inverter
        param('gate_count', '6'),
        param('package_case', 'SOIC-14'),
      ], 'CAND-001');
      const result = evaluateCandidate(c5LogicICsLogicTable, source, cand);
      expect(result.passed).toBe(false);
    });
  });
});
