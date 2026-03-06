import { getLogicTable } from '../logicTables';
import { getContextQuestionsForFamily } from '../contextQuestions';
import { LogicType, ThresholdDirection, ContextEffectType } from '../types';

const VALID_LOGIC_TYPES: LogicType[] = [
  'identity', 'identity_range', 'identity_upgrade', 'identity_flag',
  'threshold', 'fit', 'application_review', 'operational', 'vref_check',
];

const VALID_DIRECTIONS: ThresholdDirection[] = ['gte', 'lte', 'range_superset'];

const VALID_EFFECTS: ContextEffectType[] = [
  'escalate_to_mandatory', 'escalate_to_primary', 'set_threshold',
  'not_applicable', 'add_review_flag',
];

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ── Rule Override Validation ────────────────────────────────

export function validateRuleOverride(body: {
  familyId?: string;
  attributeId?: string;
  action?: string;
  weight?: number;
  logicType?: string;
  thresholdDirection?: string;
  upgradeHierarchy?: string[];
  blockOnMissing?: boolean;
  tolerancePercent?: number;
  engineeringReason?: string;
  attributeName?: string;
  sortOrder?: number;
  changeReason?: string;
}): ValidationResult {
  // Required fields
  if (!body.familyId) return { valid: false, error: 'familyId is required' };
  if (!body.attributeId) return { valid: false, error: 'attributeId is required' };
  if (!body.action || !['modify', 'add', 'remove'].includes(body.action)) {
    return { valid: false, error: 'action must be modify, add, or remove' };
  }
  if (!body.changeReason?.trim()) {
    return { valid: false, error: 'changeReason is required' };
  }

  // Family must exist
  const table = getLogicTable(body.familyId);
  if (!table) return { valid: false, error: `Unknown family: ${body.familyId}` };

  const existingRule = table.rules.find(r => r.attributeId === body.attributeId);

  // Action-specific checks
  if (body.action === 'modify' && !existingRule) {
    return { valid: false, error: `Attribute '${body.attributeId}' not found in family ${body.familyId}` };
  }
  if (body.action === 'add' && existingRule) {
    return { valid: false, error: `Attribute '${body.attributeId}' already exists in family ${body.familyId}` };
  }
  if (body.action === 'add') {
    if (!body.attributeName) return { valid: false, error: 'attributeName required for add action' };
    if (!body.logicType) return { valid: false, error: 'logicType required for add action' };
    if (body.weight === undefined || body.weight === null) {
      return { valid: false, error: 'weight required for add action' };
    }
  }
  if (body.action === 'remove' && !existingRule) {
    return { valid: false, error: `Attribute '${body.attributeId}' not found in family ${body.familyId}` };
  }

  // Field-level validation
  if (body.weight !== undefined && body.weight !== null) {
    if (!Number.isInteger(body.weight) || body.weight < 0 || body.weight > 10) {
      return { valid: false, error: 'weight must be an integer 0-10' };
    }
  }
  if (body.logicType && !VALID_LOGIC_TYPES.includes(body.logicType as LogicType)) {
    return { valid: false, error: `Invalid logicType: ${body.logicType}` };
  }
  if (body.thresholdDirection && !VALID_DIRECTIONS.includes(body.thresholdDirection as ThresholdDirection)) {
    return { valid: false, error: `Invalid thresholdDirection: ${body.thresholdDirection}` };
  }

  // Cross-field: threshold/fit needs direction
  const effectiveType = (body.logicType ?? existingRule?.logicType) as LogicType | undefined;
  if (effectiveType === 'threshold' || effectiveType === 'fit') {
    if (!body.thresholdDirection && !existingRule?.thresholdDirection) {
      return { valid: false, error: 'thresholdDirection required for threshold/fit rules' };
    }
  }
  if (effectiveType === 'identity_upgrade') {
    if (!body.upgradeHierarchy && !existingRule?.upgradeHierarchy) {
      return { valid: false, error: 'upgradeHierarchy required for identity_upgrade rules' };
    }
  }

  return { valid: true };
}

// ── Context Override Validation ─────────────────────────────

export function validateContextOverride(body: {
  familyId?: string;
  questionId?: string;
  action?: string;
  questionText?: string;
  priority?: number;
  required?: boolean;
  optionValue?: string;
  optionLabel?: string;
  optionDescription?: string;
  attributeEffects?: Array<{ attributeId?: string; effect?: string; note?: string; blockOnMissing?: boolean }>;
  changeReason?: string;
}): ValidationResult {
  // Required fields
  if (!body.familyId) return { valid: false, error: 'familyId is required' };
  if (!body.questionId) return { valid: false, error: 'questionId is required' };

  const validActions = ['modify_question', 'add_question', 'disable_question', 'add_option', 'modify_option'];
  if (!body.action || !validActions.includes(body.action)) {
    return { valid: false, error: `action must be one of: ${validActions.join(', ')}` };
  }
  if (!body.changeReason?.trim()) {
    return { valid: false, error: 'changeReason is required' };
  }

  // Family must exist in logic tables
  const table = getLogicTable(body.familyId);
  if (!table) return { valid: false, error: `Unknown family: ${body.familyId}` };

  const existingConfig = getContextQuestionsForFamily(body.familyId);
  const existingQuestion = existingConfig?.questions.find(q => q.questionId === body.questionId);

  // Action-specific checks
  if (['modify_question', 'disable_question'].includes(body.action) && !existingQuestion) {
    return { valid: false, error: `Question '${body.questionId}' not found for family ${body.familyId}` };
  }
  if (body.action === 'add_question' && existingQuestion) {
    return { valid: false, error: `Question '${body.questionId}' already exists for family ${body.familyId}` };
  }
  if (body.action === 'add_question' && !body.questionText) {
    return { valid: false, error: 'questionText required for add_question action' };
  }

  // Option-level actions need option identification
  if (body.action === 'add_option' || body.action === 'modify_option') {
    if (!body.optionValue) return { valid: false, error: 'optionValue required for option actions' };
    if (body.action === 'add_option' && !body.optionLabel) {
      return { valid: false, error: 'optionLabel required for add_option action' };
    }
    if (body.action === 'modify_option' && existingQuestion) {
      const existingOption = existingQuestion.options.find(o => o.value === body.optionValue);
      if (!existingOption) {
        return { valid: false, error: `Option '${body.optionValue}' not found in question '${body.questionId}'` };
      }
    }
  }

  // Validate attribute effects structure
  if (body.attributeEffects) {
    for (const effect of body.attributeEffects) {
      if (!effect.attributeId) return { valid: false, error: 'Each effect must have an attributeId' };
      if (!effect.effect || !VALID_EFFECTS.includes(effect.effect as ContextEffectType)) {
        return { valid: false, error: `Invalid effect type: ${effect.effect}` };
      }
    }
  }

  return { valid: true };
}
