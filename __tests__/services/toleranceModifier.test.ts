import { applyTolerancesToLogicTable } from '@/lib/services/toleranceModifier';
import { LogicTable, MatchingRule, ToleranceOverrides } from '@/lib/types';

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
// TESTS
// ============================================================

describe('applyTolerancesToLogicTable', () => {
  it('sets tolerancePercent on a matching identity rule', () => {
    const table = makeTable([makeRule('resistance')]);
    const result = applyTolerancesToLogicTable(table, { resistance: 5 });
    expect(ruleFor(result, 'resistance')?.tolerancePercent).toBe(5);
  });

  it('only touches the identity rule named in the tolerances map', () => {
    const table = makeTable([makeRule('resistance'), makeRule('package_case')]);
    const result = applyTolerancesToLogicTable(table, { resistance: 10 });
    expect(ruleFor(result, 'resistance')?.tolerancePercent).toBe(10);
    expect(ruleFor(result, 'package_case')?.tolerancePercent).toBeUndefined();
  });

  it('ignores tolerances targeting non-identity rules', () => {
    const table = makeTable([
      makeRule('power_rating', { logicType: 'threshold', thresholdDirection: 'gte' }),
      makeRule('temp_range', { logicType: 'threshold', thresholdDirection: 'range_superset' }),
      makeRule('dielectric', { logicType: 'identity_upgrade', upgradeHierarchy: ['C0G', 'X7R'] }),
    ]);
    const result = applyTolerancesToLogicTable(table, { power_rating: 20, temp_range: 15, dielectric: 5 });
    expect(ruleFor(result, 'power_rating')?.tolerancePercent).toBeUndefined();
    expect(ruleFor(result, 'temp_range')?.tolerancePercent).toBeUndefined();
    expect(ruleFor(result, 'dielectric')?.tolerancePercent).toBeUndefined();
  });

  it('is raise-only — never lowers an existing admin/base band', () => {
    const table = makeTable([makeRule('fsw', { tolerancePercent: 10 })]);
    // Requesting a smaller band must not tighten the existing 10% baseline.
    const tighter = applyTolerancesToLogicTable(table, { fsw: 3 });
    expect(ruleFor(tighter, 'fsw')?.tolerancePercent).toBe(10);
    // Requesting a larger band loosens it.
    const looser = applyTolerancesToLogicTable(table, { fsw: 18 });
    expect(ruleFor(looser, 'fsw')?.tolerancePercent).toBe(18);
  });

  it('skips zero / negative / non-numeric entries', () => {
    const table = makeTable([makeRule('a'), makeRule('b'), makeRule('c')]);
    const result = applyTolerancesToLogicTable(table, {
      a: 0,
      b: -5,
      c: NaN as unknown as number,
    } as ToleranceOverrides);
    expect(ruleFor(result, 'a')?.tolerancePercent).toBeUndefined();
    expect(ruleFor(result, 'b')?.tolerancePercent).toBeUndefined();
    expect(ruleFor(result, 'c')?.tolerancePercent).toBeUndefined();
  });

  it('does not mutate the original table or its rules', () => {
    const table = makeTable([makeRule('resistance')]);
    const original = ruleFor(table, 'resistance')!;
    const result = applyTolerancesToLogicTable(table, { resistance: 7 });
    expect(original.tolerancePercent).toBeUndefined(); // original rule untouched
    expect(result).not.toBe(table);
    expect(ruleFor(result, 'resistance')).not.toBe(original);
  });

  it('returns the same table reference when no tolerances are supplied (fast path)', () => {
    const table = makeTable([makeRule('resistance')]);
    expect(applyTolerancesToLogicTable(table, undefined)).toBe(table);
    expect(applyTolerancesToLogicTable(table, {})).toBe(table);
  });
});
