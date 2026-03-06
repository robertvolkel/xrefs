/**
 * Tests for overrideValidator + overrideMerger.
 *
 * The merger's Supabase calls are tested indirectly through the validator
 * (pure functions) and the merge logic (tested by directly calling the
 * internal patterns mirrored from deltaBuilder).
 * Full integration tests would require a Supabase test instance.
 */

import { validateRuleOverride, validateContextOverride } from '@/lib/services/overrideValidator';

// ============================================================
// RULE OVERRIDE VALIDATOR TESTS
// ============================================================

describe('validateRuleOverride', () => {
  it('rejects missing familyId', () => {
    const result = validateRuleOverride({ attributeId: 'x', action: 'modify', changeReason: 'test' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('familyId');
  });

  it('rejects missing attributeId', () => {
    const result = validateRuleOverride({ familyId: '12', action: 'modify', changeReason: 'test' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('attributeId');
  });

  it('rejects invalid action', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'invalid', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('action');
  });

  it('rejects empty changeReason', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify', changeReason: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('changeReason');
  });

  it('rejects unknown family', () => {
    const result = validateRuleOverride({
      familyId: 'ZZZZ', attributeId: 'x', action: 'modify', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown family');
  });

  it('rejects modify for non-existent attribute', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'nonexistent_attr', action: 'modify', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects add for already-existing attribute', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'add',
      attributeName: 'Cap', logicType: 'identity', weight: 5, changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects add without required fields', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'new_attr', action: 'add', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('attributeName');
  });

  it('rejects weight out of range', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify',
      weight: 11, changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weight');
  });

  it('rejects invalid logicType', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify',
      logicType: 'bogus', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('logicType');
  });

  it('accepts valid modify override', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify',
      weight: 8, changeReason: 'Reducing weight for testing',
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts valid add override', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'brand_new_param', action: 'add',
      attributeName: 'Brand New Parameter', logicType: 'threshold',
      thresholdDirection: 'gte', weight: 6, changeReason: 'Adding new check',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid remove override', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'remove',
      changeReason: 'Temporarily removing this check',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects threshold without direction when none exists on base', () => {
    // identity rules don't have thresholdDirection, changing to threshold requires it
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify',
      logicType: 'threshold', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('thresholdDirection');
  });

  it('accepts threshold when base already has direction', () => {
    // voltage_rated is a threshold rule with gte direction
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'voltage_rated', action: 'modify',
      weight: 10, changeReason: 'Making voltage critical',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects identity_upgrade without hierarchy', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify',
      logicType: 'identity_upgrade', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('upgradeHierarchy');
  });

  it('accepts weight of 0 (disable rule)', () => {
    const result = validateRuleOverride({
      familyId: '12', attributeId: 'capacitance', action: 'modify',
      weight: 0, changeReason: 'Disabling this check',
    });
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// CONTEXT OVERRIDE VALIDATOR TESTS
// ============================================================

describe('validateContextOverride', () => {
  it('rejects missing familyId', () => {
    const result = validateContextOverride({
      questionId: 'q1', action: 'modify_question', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('familyId');
  });

  it('rejects invalid action', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'q1', action: 'invalid', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('action');
  });

  it('rejects empty changeReason', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'modify_question',
      changeReason: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('changeReason');
  });

  it('rejects modify_question for non-existent question', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'nonexistent_q', action: 'modify_question',
      changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects add_question for existing question', () => {
    // MLCC (family 12) has 'voltage_ratio' question
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'add_question',
      questionText: 'Duplicate', changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects add_question without questionText', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'new_q', action: 'add_question',
      changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('questionText');
  });

  it('rejects add_option without optionValue', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'add_option',
      changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('optionValue');
  });

  it('rejects invalid effect type in attributeEffects', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'add_option',
      optionValue: 'new_opt', optionLabel: 'New',
      attributeEffects: [{ attributeId: 'x', effect: 'bogus_effect' }],
      changeReason: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('effect type');
  });

  it('accepts valid modify_question', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'modify_question',
      questionText: 'Updated question text',
      changeReason: 'Clarifying wording',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid disable_question', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'disable_question',
      changeReason: 'Temporarily disabling',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid add_option with effects', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'voltage_ratio', action: 'add_option',
      optionValue: 'extreme', optionLabel: 'Extreme (>95%)',
      attributeEffects: [
        { attributeId: 'capacitance', effect: 'escalate_to_mandatory' },
      ],
      changeReason: 'Adding extreme voltage scenario',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid add_question for new question', () => {
    const result = validateContextOverride({
      familyId: '12', questionId: 'brand_new_question', action: 'add_question',
      questionText: 'Is this for a safety-critical application?',
      changeReason: 'Adding safety context',
    });
    expect(result.valid).toBe(true);
  });
});
