import { UserPreferences, AttributeEffect, LogicTable } from '../types';
import { applyEffect } from './contextModifier';

/**
 * Resolve user preferences into AttributeEffect[] that modify logic table rules.
 * These are "global" effects — applied BEFORE per-family context questions.
 * Per-family context answers override these (more specific wins).
 */
export function resolveUserEffects(
  prefs: UserPreferences,
  logicTable: LogicTable,
): AttributeEffect[] {
  const effects: AttributeEffect[] = [];

  // Compliance defaults → escalate AEC/MIL rules to mandatory
  if (prefs.complianceDefaults) {
    if (prefs.complianceDefaults.aecQ200) {
      const rule = logicTable.rules.find(r => r.attributeId === 'aec_q200');
      if (rule) {
        effects.push({
          attributeId: 'aec_q200',
          effect: 'escalate_to_mandatory',
          note: 'User profile: automotive compliance default (AEC-Q200)',
          blockOnMissing: true,
        });
      }
    }

    if (prefs.complianceDefaults.aecQ101) {
      const rule = logicTable.rules.find(r => r.attributeId === 'aec_q101');
      if (rule) {
        effects.push({
          attributeId: 'aec_q101',
          effect: 'escalate_to_mandatory',
          note: 'User profile: automotive compliance default (AEC-Q101)',
          blockOnMissing: true,
        });
      }
    }

    if (prefs.complianceDefaults.aecQ100) {
      const rule = logicTable.rules.find(r => r.attributeId === 'aec_q100');
      if (rule) {
        effects.push({
          attributeId: 'aec_q100',
          effect: 'escalate_to_mandatory',
          note: 'User profile: automotive compliance default (AEC-Q100)',
          blockOnMissing: true,
        });
      }
    }

    if (prefs.complianceDefaults.milStd) {
      const rule = logicTable.rules.find(r => r.attributeId === 'mil_std');
      if (rule) {
        effects.push({
          attributeId: 'mil_std',
          effect: 'escalate_to_mandatory',
          note: 'User profile: defense compliance default (MIL-STD)',
          blockOnMissing: true,
        });
      }
    }
  }

  // Industry-based escalations (support both industries[] and legacy industry)
  const userIndustries = prefs.industries ?? (prefs.industry ? [prefs.industry] : []);

  if (userIndustries.includes('automotive')) {
    const tempRule = logicTable.rules.find(r =>
      r.attributeId === 'operating_temperature' || r.attributeId === 'temp_range'
    );
    if (tempRule && tempRule.weight < 9) {
      effects.push({
        attributeId: tempRule.attributeId,
        effect: 'escalate_to_primary',
        note: 'User profile: automotive industry — temperature range critical',
      });
    }
  }

  if (userIndustries.includes('medical')) {
    const qualRules = logicTable.rules.filter(r =>
      r.attributeId.includes('aec_q') || r.attributeId.includes('qualification')
    );
    for (const rule of qualRules) {
      effects.push({
        attributeId: rule.attributeId,
        effect: 'escalate_to_primary',
        note: 'User profile: medical industry — reliability critical',
      });
    }
  }

  return effects;
}

/**
 * Apply user-level effects to a logic table, returning a modified copy.
 * Reuses the same applyEffect() function from contextModifier.ts.
 */
export function applyUserEffectsToLogicTable(
  logicTable: LogicTable,
  effects: AttributeEffect[],
): LogicTable {
  if (effects.length === 0) return logicTable;

  const modifiedRules = logicTable.rules.map(rule => ({ ...rule }));

  for (const effect of effects) {
    const rule = modifiedRules.find(r => r.attributeId === effect.attributeId);
    if (!rule) continue;
    applyEffect(rule, effect.effect, effect.note, effect.blockOnMissing);
  }

  return { ...logicTable, rules: modifiedRules };
}
