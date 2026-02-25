import { applyContextToLogicTable } from '@/lib/services/contextModifier';
import {
  LogicTable,
  MatchingRule,
  ApplicationContext,
  FamilyContextConfig,
  ContextQuestion,
  ContextOption,
} from '@/lib/types';

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
    familyId: '12',
    familyName: 'MLCC',
    category: 'Passives',
    description: 'Test',
    rules,
  };
}

function makeOption(value: string, effects: { attributeId: string; effect: ContextOption['attributeEffects'][0]['effect']; note?: string; blockOnMissing?: boolean }[]): ContextOption {
  return {
    value,
    label: value,
    attributeEffects: effects.map(e => ({
      attributeId: e.attributeId,
      effect: e.effect,
      note: e.note,
      blockOnMissing: e.blockOnMissing,
    })),
  };
}

function makeQuestion(id: string, options: ContextOption[]): ContextQuestion {
  return {
    questionId: id,
    questionText: `Question ${id}?`,
    options,
    priority: 1,
  };
}

function makeConfig(questions: ContextQuestion[]): FamilyContextConfig {
  return {
    familyIds: ['12'],
    contextSensitivity: 'high',
    questions,
  };
}

function makeContext(answers: Record<string, string>): ApplicationContext {
  return {
    familyId: '12',
    answers,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('contextModifier', () => {
  describe('applyContextToLogicTable', () => {
    it('does not mutate the original logic table', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(lt.rules[0].weight).toBe(3); // original untouched
      expect(result.rules[0].weight).toBe(10);
    });

    // --- escalate_to_mandatory ---

    it('escalate_to_mandatory sets weight to 10', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
    });

    it('escalate_to_mandatory updates engineeringReason when note provided', () => {
      const lt = makeTable([makeRule('aec_q200', { engineeringReason: 'original' })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{
            attributeId: 'aec_q200',
            effect: 'escalate_to_mandatory',
            note: 'Automotive requires AEC-Q200',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].engineeringReason).toBe('Automotive requires AEC-Q200');
    });

    // --- escalate_to_primary ---

    it('escalate_to_primary sets weight to at least 9', () => {
      const lt = makeTable([makeRule('tolerance', { weight: 4 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('precision', [{ attributeId: 'tolerance', effect: 'escalate_to_primary' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'precision' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(9);
    });

    it('escalate_to_primary preserves weight if already >= 9', () => {
      const lt = makeTable([makeRule('tolerance', { weight: 10 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('precision', [{ attributeId: 'tolerance', effect: 'escalate_to_primary' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'precision' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
    });

    // --- not_applicable ---

    it('not_applicable sets weight to 0', () => {
      const lt = makeTable([makeRule('flexible_termination', { weight: 5 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('no_flex', [{ attributeId: 'flexible_termination', effect: 'not_applicable' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'no_flex' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(0);
    });

    // --- add_review_flag ---

    it('add_review_flag changes logicType to application_review', () => {
      const lt = makeTable([makeRule('dc_bias_derating', { logicType: 'threshold', weight: 5 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('review', [{
            attributeId: 'dc_bias_derating',
            effect: 'add_review_flag',
            note: 'Needs manual DC bias review',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'review' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].logicType).toBe('application_review');
      expect(result.rules[0].engineeringReason).toBe('Needs manual DC bias review');
    });

    // --- set_threshold ---

    it('set_threshold updates engineeringReason but keeps rule type', () => {
      const lt = makeTable([makeRule('voltage_rating', {
        logicType: 'threshold',
        thresholdDirection: 'gte',
        engineeringReason: 'original',
      })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('tight', [{
            attributeId: 'voltage_rating',
            effect: 'set_threshold',
            note: 'Tightened for high-reliability application',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'tight' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].logicType).toBe('threshold');
      expect(result.rules[0].engineeringReason).toBe('Tightened for high-reliability application');
    });

    // --- Unanswered questions are skipped ---

    it('skips unanswered questions', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({}); // no answers
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(3); // unchanged
    });

    // --- Unknown option value is skipped ---

    it('skips answers that do not match any predefined option', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'some-free-text-answer' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(3); // unchanged
    });

    // --- Effect targeting non-existent rule is silently skipped ---

    it('silently skips effects targeting rules not in the logic table', () => {
      const lt = makeTable([makeRule('capacitance')]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('yes', [{ attributeId: 'nonexistent_rule', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'yes' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules).toHaveLength(1); // no crash, no change
    });

    // --- Last-writer-wins when two questions affect the same rule ---

    it('last-writer-wins when two questions affect the same rule', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
        makeQuestion('q2', [
          makeOption('consumer', [{ attributeId: 'aec_q200', effect: 'not_applicable' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive', q2: 'consumer' });
      const result = applyContextToLogicTable(lt, ctx, config);
      // q1 sets weight=10, then q2 sets weight=0 → last writer wins
      expect(result.rules[0].weight).toBe(0);
    });

    // --- Multiple effects from one option ---

    // --- blockOnMissing propagation ---

    it('propagates blockOnMissing from effect to rule', () => {
      const lt = makeTable([makeRule('tst', { logicType: 'threshold', thresholdDirection: 'lte', weight: 8 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('high_freq', [{
            attributeId: 'tst',
            effect: 'escalate_to_mandatory',
            note: 'BLOCKING at >100kHz',
            blockOnMissing: true,
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'high_freq' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
      expect(result.rules[0].blockOnMissing).toBe(true);
    });

    it('does not set blockOnMissing when effect does not specify it', () => {
      const lt = makeTable([makeRule('tst', { logicType: 'threshold', thresholdDirection: 'lte', weight: 8 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('low_freq', [{
            attributeId: 'tst',
            effect: 'escalate_to_primary',
            note: 'Medium frequency',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'low_freq' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].blockOnMissing).toBeUndefined();
    });

    // --- Multiple effects from one option ---

    it('applies multiple effects from a single option', () => {
      const lt = makeTable([
        makeRule('aec_q200', { weight: 3 }),
        makeRule('tolerance', { weight: 4 }),
      ]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive_precision', [
            { attributeId: 'aec_q200', effect: 'escalate_to_mandatory' },
            { attributeId: 'tolerance', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive_precision' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
      expect(result.rules[1].weight).toBe(9);
    });
  });
});
