import {
  LogicTable,
  MatchingRule,
  ApplicationContext,
  FamilyContextConfig,
  ContextEffectType,
} from '../types';

/**
 * Apply application context answers to a logic table, returning a modified copy.
 * The original logic table is not mutated.
 *
 * Effects:
 * - escalate_to_mandatory: set weight = 10
 * - escalate_to_primary: set weight = max(current, 9)
 * - set_threshold: adds a review flag (threshold changes are noted)
 * - not_applicable: set weight = 0 (rule is effectively skipped)
 * - add_review_flag: change logicType to 'application_review' and set engineeringReason
 */
export function applyContextToLogicTable(
  logicTable: LogicTable,
  context: ApplicationContext,
  familyConfig: FamilyContextConfig
): LogicTable {
  // Deep clone rules so we don't mutate the original
  const modifiedRules: MatchingRule[] = logicTable.rules.map(rule => ({ ...rule }));

  // For each answered question, apply the selected option's effects
  for (const question of familyConfig.questions) {
    const answer = context.answers[question.questionId];
    if (!answer) continue;

    // Find the matching option (check predefined options first, fall back to free-text)
    const option = question.options.find(o => o.value === answer);
    if (!option) continue; // Free-text answer without a matching option — no effects

    for (const effect of option.attributeEffects) {
      const rule = modifiedRules.find(r => r.attributeId === effect.attributeId);
      if (!rule) continue; // Attribute not in this logic table — skip silently

      applyEffect(rule, effect.effect, effect.note, effect.blockOnMissing);
    }
  }

  return {
    ...logicTable,
    rules: modifiedRules,
  };
}

function applyEffect(
  rule: MatchingRule,
  effect: ContextEffectType,
  note?: string,
  blockOnMissing?: boolean
): void {
  switch (effect) {
    case 'escalate_to_mandatory':
      rule.weight = 10;
      if (note) rule.engineeringReason = note;
      break;

    case 'escalate_to_primary':
      rule.weight = Math.max(rule.weight, 9);
      if (note) rule.engineeringReason = note;
      break;

    case 'set_threshold':
      // Threshold changes are complex — we note the context but keep the rule type
      // The note provides guidance for the engineer's review
      if (note) rule.engineeringReason = note;
      break;

    case 'not_applicable':
      rule.weight = 0;
      break;

    case 'add_review_flag':
      rule.logicType = 'application_review';
      if (note) rule.engineeringReason = note;
      break;
  }

  // Propagate blockOnMissing — makes missing candidate data a hard fail for threshold rules
  if (blockOnMissing) rule.blockOnMissing = true;
}
