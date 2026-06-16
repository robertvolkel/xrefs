import { LogicTable, MatchingRule, AcceptanceCriteria } from '../types';

/**
 * Apply user-supplied per-attribute acceptance criteria to a logic table,
 * returning a modified copy. The original logic table is not mutated.
 *
 * Each criterion loosens matching on one attribute, dispatched by kind:
 * - `range` → set `tolerancePercent` on the matching `identity` rule (raise-only,
 *   so it composes with any admin/base band rather than tightening it). The
 *   engine already honors this as a ±% numeric band (see evaluateIdentity).
 * - `set`   → set `acceptedValues` on the matching rule (any rule type). The
 *   engine short-circuits to a pass when a candidate's value is in the set
 *   (see evaluateRule). The source value is always implicitly accepted by the
 *   rule's normal logic, so it need not be included.
 *
 * Criteria targeting an attribute with no matching rule are ignored; range
 * criteria targeting a non-identity rule are ignored (a ±% band is meaningless
 * there). Both are defensive — the UI shouldn't emit them.
 */
export function applyAcceptanceCriteriaToLogicTable(
  logicTable: LogicTable,
  criteria?: AcceptanceCriteria
): LogicTable {
  if (!criteria || Object.keys(criteria).length === 0) {
    return logicTable; // fast path — nothing to apply
  }

  // Clone rules so we don't mutate the original table.
  const modifiedRules: MatchingRule[] = logicTable.rules.map(rule => ({ ...rule }));

  for (const rule of modifiedRules) {
    const criterion = criteria[rule.attributeId];
    if (!criterion) continue;

    if (criterion.kind === 'range') {
      if (rule.logicType !== 'identity') continue;
      if (!(criterion.percent > 0)) continue;
      rule.tolerancePercent = Math.max(rule.tolerancePercent ?? 0, criterion.percent);
    } else {
      // kind === 'set'
      const values = criterion.values.filter(v => typeof v === 'string' && v.trim() !== '');
      if (values.length === 0) continue;
      rule.acceptedValues = values;
    }
  }

  return {
    ...logicTable,
    rules: modifiedRules,
  };
}
