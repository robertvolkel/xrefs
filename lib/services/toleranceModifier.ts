import { LogicTable, MatchingRule, ToleranceOverrides } from '../types';

/**
 * Apply user-supplied per-attribute tolerance bands to a logic table, returning
 * a modified copy. The original logic table is not mutated.
 *
 * Each entry in `tolerances` is a ± percentage the user set from the Source Part
 * Specs panel. It is applied as `tolerancePercent` on the matching `identity`
 * rule, which the engine already honors as a numeric band before failing
 * (see `evaluateIdentity` in matchingEngine.ts).
 *
 * Semantics:
 * - Identity rules only. Tolerance is meaningless for upgrade/range/categorical/
 *   threshold/operational rules, so entries that don't target an identity rule
 *   are ignored (the UI should not emit them, but we guard defensively).
 * - Raise-only: we take max(existing, requested) so a user loosening composes
 *   with any admin-configured baseline band rather than tightening it.
 * - Non-positive values are skipped (a 0% band is a no-op / clear).
 */
export function applyTolerancesToLogicTable(
  logicTable: LogicTable,
  tolerances?: ToleranceOverrides
): LogicTable {
  if (!tolerances || Object.keys(tolerances).length === 0) {
    return logicTable; // fast path — nothing to apply
  }

  // Clone rules so we don't mutate the original table.
  const modifiedRules: MatchingRule[] = logicTable.rules.map(rule => ({ ...rule }));

  for (const rule of modifiedRules) {
    if (rule.logicType !== 'identity') continue;
    const requested = tolerances[rule.attributeId];
    if (typeof requested !== 'number' || !(requested > 0)) continue;
    rule.tolerancePercent = Math.max(rule.tolerancePercent ?? 0, requested);
  }

  return {
    ...logicTable,
    rules: modifiedRules,
  };
}
