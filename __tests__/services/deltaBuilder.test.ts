import { buildDerivedLogicTable, LogicTableDelta } from '@/lib/logicTables/deltaBuilder';
import { LogicTable, MatchingRule } from '@/lib/types';

// ============================================================
// HELPERS
// ============================================================

function makeRule(id: string, overrides: Partial<MatchingRule> = {}): MatchingRule {
  return {
    attributeId: id,
    attributeName: id,
    logicType: 'identity',
    weight: 5,
    engineeringReason: 'test rule',
    sortOrder: 0,
    ...overrides,
  };
}

function makeBase(rules: MatchingRule[]): LogicTable {
  return {
    familyId: 'base',
    familyName: 'Base Family',
    category: 'Passives',
    description: 'Base logic table for testing',
    rules,
  };
}

function makeDelta(overrides: Partial<LogicTableDelta> = {}): LogicTableDelta {
  return {
    baseFamilyId: 'base',
    familyId: 'derived',
    familyName: 'Derived Family',
    category: 'Passives',
    description: 'Derived logic table',
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('deltaBuilder', () => {
  describe('buildDerivedLogicTable', () => {
    it('returns new table with delta metadata', () => {
      const base = makeBase([makeRule('a')]);
      const delta = makeDelta();
      const result = buildDerivedLogicTable(base, delta);
      expect(result.familyId).toBe('derived');
      expect(result.familyName).toBe('Derived Family');
      expect(result.category).toBe('Passives');
      expect(result.description).toBe('Derived logic table');
    });

    it('does not mutate the base table', () => {
      const base = makeBase([makeRule('a', { weight: 5 })]);
      const delta = makeDelta({
        override: [{ attributeId: 'a', weight: 10 }],
      });
      buildDerivedLogicTable(base, delta);
      expect(base.rules[0].weight).toBe(5);
    });

    // --- REMOVE ---

    it('removes rules by attributeId', () => {
      const base = makeBase([makeRule('a'), makeRule('b'), makeRule('c')]);
      const delta = makeDelta({ remove: ['b'] });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules.map(r => r.attributeId)).toEqual(['a', 'c']);
    });

    it('silently skips remove for non-existent attributeId', () => {
      const base = makeBase([makeRule('a')]);
      const delta = makeDelta({ remove: ['nonexistent'] });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules).toHaveLength(1);
    });

    // --- OVERRIDE ---

    it('overrides weight of existing rule', () => {
      const base = makeBase([makeRule('a', { weight: 5 })]);
      const delta = makeDelta({
        override: [{ attributeId: 'a', weight: 10 }],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules[0].weight).toBe(10);
    });

    it('overrides logicType of existing rule', () => {
      const base = makeBase([makeRule('a', { logicType: 'identity' })]);
      const delta = makeDelta({
        override: [{ attributeId: 'a', logicType: 'threshold', thresholdDirection: 'gte' }],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules[0].logicType).toBe('threshold');
      expect(result.rules[0].thresholdDirection).toBe('gte');
    });

    it('overrides upgradeHierarchy', () => {
      const base = makeBase([makeRule('a', { logicType: 'identity_upgrade', upgradeHierarchy: ['X', 'Y'] })]);
      const delta = makeDelta({
        override: [{ attributeId: 'a', upgradeHierarchy: ['A', 'B', 'C'] }],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules[0].upgradeHierarchy).toEqual(['A', 'B', 'C']);
    });

    it('overrides engineeringReason and attributeName', () => {
      const base = makeBase([makeRule('a')]);
      const delta = makeDelta({
        override: [{
          attributeId: 'a',
          engineeringReason: 'new reason',
          attributeName: 'New Name',
        }],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules[0].engineeringReason).toBe('new reason');
      expect(result.rules[0].attributeName).toBe('New Name');
    });

    it('silently skips override for non-existent attributeId', () => {
      const base = makeBase([makeRule('a', { weight: 5 })]);
      const delta = makeDelta({
        override: [{ attributeId: 'nonexistent', weight: 10 }],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].weight).toBe(5);
    });

    it('preserves non-overridden fields', () => {
      const base = makeBase([makeRule('a', {
        weight: 5,
        logicType: 'threshold',
        thresholdDirection: 'gte',
        engineeringReason: 'original reason',
      })]);
      const delta = makeDelta({
        override: [{ attributeId: 'a', weight: 8 }],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules[0].weight).toBe(8);
      expect(result.rules[0].logicType).toBe('threshold');
      expect(result.rules[0].thresholdDirection).toBe('gte');
      expect(result.rules[0].engineeringReason).toBe('original reason');
    });

    // --- ADD ---

    it('adds new rules with auto-assigned sortOrder', () => {
      const base = makeBase([makeRule('a', { sortOrder: 5 })]);
      const delta = makeDelta({
        add: [
          makeRule('b', { sortOrder: 0 }), // sortOrder 0 triggers auto-assign
          makeRule('c', { sortOrder: 0 }),
        ],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules).toHaveLength(3);
      expect(result.rules[1].attributeId).toBe('b');
      expect(result.rules[1].sortOrder).toBe(6); // max(5) + 1
      expect(result.rules[2].attributeId).toBe('c');
      expect(result.rules[2].sortOrder).toBe(7); // max(5) + 2
    });

    it('preserves explicit sortOrder on added rules', () => {
      const base = makeBase([makeRule('a', { sortOrder: 5 })]);
      const delta = makeDelta({
        add: [makeRule('b', { sortOrder: 99 })],
      });
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules[1].sortOrder).toBe(99);
    });

    // --- PROCESSING ORDER: REMOVE → OVERRIDE → ADD ---

    it('processes in order: REMOVE → OVERRIDE → ADD', () => {
      const base = makeBase([
        makeRule('remove-me', { weight: 1, sortOrder: 1 }),
        makeRule('override-me', { weight: 2, sortOrder: 2 }),
        makeRule('keep', { weight: 3, sortOrder: 3 }),
      ]);
      const delta = makeDelta({
        remove: ['remove-me'],
        override: [
          { attributeId: 'override-me', weight: 20 },
          // Override on removed rule should be silently skipped
          { attributeId: 'remove-me', weight: 99 },
        ],
        add: [makeRule('new-rule', { weight: 7 })],
      });
      const result = buildDerivedLogicTable(base, delta);
      // Should have: override-me (weight=20), keep (weight=3), new-rule (weight=7)
      expect(result.rules).toHaveLength(3);
      expect(result.rules.find(r => r.attributeId === 'remove-me')).toBeUndefined();
      expect(result.rules.find(r => r.attributeId === 'override-me')?.weight).toBe(20);
      expect(result.rules.find(r => r.attributeId === 'new-rule')?.weight).toBe(7);
    });

    // --- Empty delta ---

    it('returns a copy of base when delta has no operations', () => {
      const base = makeBase([makeRule('a'), makeRule('b')]);
      const delta = makeDelta();
      const result = buildDerivedLogicTable(base, delta);
      expect(result.rules).toHaveLength(2);
      expect(result.rules.map(r => r.attributeId)).toEqual(['a', 'b']);
    });
  });
});
