/**
 * Structural consistency tests for all 43 component family logic tables
 * and their context question configurations.
 *
 * These tests validate structural correctness without making API calls.
 * They catch silent bugs like orphaned context effects, missing required
 * fields, and cross-registry inconsistencies.
 */
import { logicTableRegistry } from '@/lib/logicTables';
import { getContextQuestionsForFamily, getAllContextConfigs } from '@/lib/contextQuestions';
import { LogicTable } from '@/lib/types';

const ALL_FAMILY_IDS = [
  '12', '13', '52', '53', '54', '55', '58', '59', '60', '61', '64', '65', '66', '67', '68',
  '69', '70', '71', '72',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
  'D1', 'D2',
  'E1',
  'F1',
  'F2',
] as const;

function getAttributeIds(table: LogicTable): Set<string> {
  return new Set(table.rules.map(r => r.attributeId));
}

describe('Logic Table Structural Consistency', () => {

  // ============================================================
  // TIER 1: SILENT BUG FINDERS
  // ============================================================
  describe('Tier 1: Silent bug finders', () => {

    describe.each([...ALL_FAMILY_IDS])('Family %s', (familyId) => {

      test('has both logic table and context config', () => {
        expect(logicTableRegistry[familyId]).toBeDefined();
        expect(getContextQuestionsForFamily(familyId)).not.toBeNull();
      });

      test('no duplicate attributeIds in logic table', () => {
        const table = logicTableRegistry[familyId];
        const seen = new Set<string>();
        for (const rule of table.rules) {
          expect(seen.has(rule.attributeId)).toBe(false);
          seen.add(rule.attributeId);
        }
      });

      test('logicType-specific required fields', () => {
        const table = logicTableRegistry[familyId];
        for (const rule of table.rules) {
          if (rule.logicType === 'identity_upgrade') {
            expect(rule.upgradeHierarchy).toBeDefined();
            expect(Array.isArray(rule.upgradeHierarchy)).toBe(true);
          }
          if (rule.logicType === 'threshold') {
            expect(rule.thresholdDirection).toBeDefined();
            expect(['gte', 'lte', 'range_superset']).toContain(rule.thresholdDirection);
          }
        }
      });

      test('every context effect attributeId exists in the logic table', () => {
        const table = logicTableRegistry[familyId];
        const config = getContextQuestionsForFamily(familyId);
        if (!config) return;

        const attrIds = getAttributeIds(table);

        for (const question of config.questions) {
          for (const option of question.options) {
            for (const effect of option.attributeEffects) {
              expect(attrIds.has(effect.attributeId)).toBe(true);
            }
          }
        }
      });
    });
  });

  // ============================================================
  // TIER 2: DATA QUALITY
  // ============================================================
  describe('Tier 2: Data quality', () => {

    describe.each([...ALL_FAMILY_IDS])('Family %s', (familyId) => {

      test('all weights in [0, 10]', () => {
        const table = logicTableRegistry[familyId];
        for (const rule of table.rules) {
          expect(rule.weight).toBeGreaterThanOrEqual(0);
          expect(rule.weight).toBeLessThanOrEqual(10);
        }
      });

      test('no duplicate sortOrder', () => {
        const table = logicTableRegistry[familyId];
        const seen = new Set<number>();
        for (const rule of table.rules) {
          expect(seen.has(rule.sortOrder)).toBe(false);
          seen.add(rule.sortOrder);
        }
      });

      test('sortOrder is a positive integer', () => {
        const table = logicTableRegistry[familyId];
        for (const rule of table.rules) {
          expect(Number.isInteger(rule.sortOrder)).toBe(true);
          expect(rule.sortOrder).toBeGreaterThan(0);
        }
      });

      test('no duplicate questionIds in context config', () => {
        const config = getContextQuestionsForFamily(familyId);
        if (!config) return;
        const seen = new Set<string>();
        for (const q of config.questions) {
          expect(seen.has(q.questionId)).toBe(false);
          seen.add(q.questionId);
        }
      });

      test('conditional questions reference valid earlier questions', () => {
        const config = getContextQuestionsForFamily(familyId);
        if (!config) return;
        const seenIds = new Set<string>();
        for (const q of config.questions) {
          if (q.condition) {
            expect(seenIds.has(q.condition.questionId)).toBe(true);
            expect(q.condition.values.length).toBeGreaterThan(0);
          }
          seenIds.add(q.questionId);
        }
      });

      test('no spurious fields for logicType', () => {
        const table = logicTableRegistry[familyId];
        for (const rule of table.rules) {
          // thresholdDirection only valid on 'threshold' rules
          if (rule.logicType !== 'threshold') {
            expect(rule.thresholdDirection).toBeUndefined();
          }
          // upgradeHierarchy only valid on 'identity_upgrade' rules
          if (rule.logicType !== 'identity_upgrade') {
            expect(rule.upgradeHierarchy).toBeUndefined();
          }
          // tolerancePercent only valid on 'identity' rules
          if (rule.logicType !== 'identity') {
            expect(rule.tolerancePercent).toBeUndefined();
          }
        }
      });

      test('identity_upgrade hierarchies have >= 2 elements', () => {
        const table = logicTableRegistry[familyId];
        for (const rule of table.rules) {
          if (rule.logicType === 'identity_upgrade' && rule.upgradeHierarchy) {
            expect(rule.upgradeHierarchy.length).toBeGreaterThanOrEqual(2);
          }
        }
      });

      test('familyId matches registry key', () => {
        const table = logicTableRegistry[familyId];
        expect(table.familyId).toBe(familyId);
      });

      test('context config familyIds includes this family', () => {
        const config = getContextQuestionsForFamily(familyId);
        if (!config) return;
        expect(config.familyIds).toContain(familyId);
      });

      test('required string fields are non-empty', () => {
        const table = logicTableRegistry[familyId];
        for (const rule of table.rules) {
          expect(rule.attributeId.length).toBeGreaterThan(0);
          expect(rule.attributeName.length).toBeGreaterThan(0);
          expect(rule.engineeringReason.length).toBeGreaterThan(0);
        }

        const config = getContextQuestionsForFamily(familyId);
        if (!config) return;
        for (const q of config.questions) {
          expect(q.questionId.length).toBeGreaterThan(0);
          expect(q.questionText.length).toBeGreaterThan(0);
          for (const opt of q.options) {
            expect(opt.value.length).toBeGreaterThan(0);
            expect(opt.label.length).toBeGreaterThan(0);
          }
        }
      });

      test('context option values are unique within each question', () => {
        const config = getContextQuestionsForFamily(familyId);
        if (!config) return;
        for (const q of config.questions) {
          const values = q.options.map(o => o.value);
          expect(new Set(values).size).toBe(values.length);
        }
      });
    });
  });

  // ============================================================
  // TIER 3: CROSS-REGISTRY COMPLETENESS
  // ============================================================
  describe('Tier 3: Cross-registry completeness', () => {

    test('logic table registry contains exactly 41 families', () => {
      const registryKeys = Object.keys(logicTableRegistry).sort();
      expect(registryKeys).toHaveLength(43);
      expect(registryKeys).toEqual([...ALL_FAMILY_IDS].sort());
    });

    test('context questions cover all 41 families', () => {
      const allConfigs = getAllContextConfigs();
      const coveredFamilyIds = new Set(allConfigs.flatMap(c => c.familyIds));
      for (const id of ALL_FAMILY_IDS) {
        expect(coveredFamilyIds.has(id)).toBe(true);
      }
    });

    test('no extra families in registry beyond expected 38', () => {
      const registryKeys = Object.keys(logicTableRegistry);
      for (const key of registryKeys) {
        expect((ALL_FAMILY_IDS as readonly string[])).toContain(key);
      }
    });
  });
});
