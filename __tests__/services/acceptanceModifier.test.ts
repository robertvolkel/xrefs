import { applyAcceptanceCriteriaToLogicTable } from '@/lib/services/acceptanceModifier';
import { LogicTable, MatchingRule, AcceptanceCriteria } from '@/lib/types';

// ============================================================
// HELPERS
// ============================================================

function makeRule(id: string, overrides: Partial<MatchingRule> = {}): MatchingRule {
  return {
    attributeId: id,
    attributeName: id,
    logicType: 'identity',
    weight: 5,
    engineeringReason: 'test',
    sortOrder: 0,
    ...overrides,
  };
}

function makeTable(rules: MatchingRule[]): LogicTable {
  return {
    familyId: '52',
    familyName: 'Chip Resistors',
    category: 'Passives',
    description: 'Test',
    rules,
  };
}

function ruleFor(table: LogicTable, attributeId: string): MatchingRule | undefined {
  return table.rules.find((r) => r.attributeId === attributeId);
}

// ============================================================
// RANGE CRITERIA (continuous ±% band)
// ============================================================

describe('applyAcceptanceCriteriaToLogicTable — range', () => {
  it('sets tolerancePercent on a matching identity rule', () => {
    const table = makeTable([makeRule('resistance')]);
    const result = applyAcceptanceCriteriaToLogicTable(table, { resistance: { kind: 'range', percent: 5 } });
    expect(ruleFor(result, 'resistance')?.tolerancePercent).toBe(5);
  });

  it('is raise-only — never lowers an existing band', () => {
    const table = makeTable([makeRule('fsw', { tolerancePercent: 10 })]);
    const tighter = applyAcceptanceCriteriaToLogicTable(table, { fsw: { kind: 'range', percent: 3 } });
    expect(ruleFor(tighter, 'fsw')?.tolerancePercent).toBe(10);
    const looser = applyAcceptanceCriteriaToLogicTable(table, { fsw: { kind: 'range', percent: 18 } });
    expect(ruleFor(looser, 'fsw')?.tolerancePercent).toBe(18);
  });

  it('ignores range criteria targeting non-identity rules', () => {
    const table = makeTable([makeRule('power_rating', { logicType: 'threshold', thresholdDirection: 'gte' })]);
    const result = applyAcceptanceCriteriaToLogicTable(table, { power_rating: { kind: 'range', percent: 20 } });
    expect(ruleFor(result, 'power_rating')?.tolerancePercent).toBeUndefined();
  });

  it('skips zero / negative range percent', () => {
    const table = makeTable([makeRule('a'), makeRule('b')]);
    const result = applyAcceptanceCriteriaToLogicTable(table, {
      a: { kind: 'range', percent: 0 },
      b: { kind: 'range', percent: -5 },
    });
    expect(ruleFor(result, 'a')?.tolerancePercent).toBeUndefined();
    expect(ruleFor(result, 'b')?.tolerancePercent).toBeUndefined();
  });
});

// ============================================================
// SET CRITERIA (categorical accepted values)
// ============================================================

describe('applyAcceptanceCriteriaToLogicTable — set', () => {
  it('sets acceptedValues on a matching rule (any logic type)', () => {
    const table = makeTable([makeRule('aec_q200', { logicType: 'identity_flag' })]);
    const result = applyAcceptanceCriteriaToLogicTable(table, { aec_q200: { kind: 'set', values: ['No'] } });
    expect(ruleFor(result, 'aec_q200')?.acceptedValues).toEqual(['No']);
  });

  it('works for plain identity rules too', () => {
    const table = makeTable([makeRule('composition', { logicType: 'identity_upgrade' })]);
    const result = applyAcceptanceCriteriaToLogicTable(table, { composition: { kind: 'set', values: ['Thin Film', 'Metal Film'] } });
    expect(ruleFor(result, 'composition')?.acceptedValues).toEqual(['Thin Film', 'Metal Film']);
  });

  it('filters out empty/whitespace values and skips when nothing remains', () => {
    const table = makeTable([makeRule('a'), makeRule('b')]);
    const result = applyAcceptanceCriteriaToLogicTable(table, {
      a: { kind: 'set', values: ['Yes', '', '  '] },
      b: { kind: 'set', values: ['  '] },
    });
    expect(ruleFor(result, 'a')?.acceptedValues).toEqual(['Yes']);
    expect(ruleFor(result, 'b')?.acceptedValues).toBeUndefined();
  });
});

// ============================================================
// GENERAL
// ============================================================

describe('applyAcceptanceCriteriaToLogicTable — general', () => {
  it('only touches the attributes named in the criteria map', () => {
    const table = makeTable([makeRule('resistance'), makeRule('package_case')]);
    const result = applyAcceptanceCriteriaToLogicTable(table, { resistance: { kind: 'range', percent: 10 } });
    expect(ruleFor(result, 'resistance')?.tolerancePercent).toBe(10);
    expect(ruleFor(result, 'package_case')?.tolerancePercent).toBeUndefined();
    expect(ruleFor(result, 'package_case')?.acceptedValues).toBeUndefined();
  });

  it('does not mutate the original table or its rules', () => {
    const table = makeTable([makeRule('resistance'), makeRule('aec_q200', { logicType: 'identity_flag' })]);
    const original = ruleFor(table, 'resistance')!;
    const result = applyAcceptanceCriteriaToLogicTable(table, {
      resistance: { kind: 'range', percent: 7 },
      aec_q200: { kind: 'set', values: ['No'] },
    });
    expect(original.tolerancePercent).toBeUndefined();
    expect(ruleFor(table, 'aec_q200')?.acceptedValues).toBeUndefined();
    expect(result).not.toBe(table);
  });

  it('returns the same table reference when no criteria supplied (fast path)', () => {
    const table = makeTable([makeRule('resistance')]);
    expect(applyAcceptanceCriteriaToLogicTable(table, undefined)).toBe(table);
    expect(applyAcceptanceCriteriaToLogicTable(table, {} as AcceptanceCriteria)).toBe(table);
  });
});
