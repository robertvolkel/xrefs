import { LogicTable, MatchingRule, LogicType, ThresholdDirection } from '../types';

/** A single rule override — partial MatchingRule with only the fields to change */
export interface RuleOverride {
  attributeId: string;
  weight?: number;
  logicType?: LogicType;
  thresholdDirection?: ThresholdDirection;
  upgradeHierarchy?: string[];
  engineeringReason?: string;
  attributeName?: string;
}

/** Delta specification for deriving a variant logic table from a base */
export interface LogicTableDelta {
  baseFamilyId: string;
  familyId: string;
  familyName: string;
  category: string;
  description: string;
  /** Rules to add (full MatchingRule objects) */
  add?: MatchingRule[];
  /** Rules to override (partial — only changed fields) */
  override?: RuleOverride[];
  /** attributeIds to remove from the base */
  remove?: string[];
}

/**
 * Build a derived logic table by applying deltas to a base table.
 * Returns a new LogicTable — the base is never mutated.
 *
 * Processing order: REMOVE first, then OVERRIDE, then ADD.
 * - REMOVE: filters out rules by attributeId. Silently skips if not found.
 * - OVERRIDE: merges partial changes into existing rules. Silently skips
 *   if the attributeId is not found in the (post-remove) base.
 * - ADD: appends new rules. sortOrder is auto-assigned starting after the
 *   last base rule if not explicitly provided.
 */
export function buildDerivedLogicTable(
  base: LogicTable,
  delta: LogicTableDelta
): LogicTable {
  // 1. Deep clone base rules
  let rules: MatchingRule[] = base.rules.map(r => ({ ...r }));

  // 2. REMOVE
  if (delta.remove && delta.remove.length > 0) {
    const removeSet = new Set(delta.remove);
    rules = rules.filter(r => !removeSet.has(r.attributeId));
  }

  // 3. OVERRIDE
  if (delta.override) {
    for (const ov of delta.override) {
      const existing = rules.find(r => r.attributeId === ov.attributeId);
      if (existing) {
        if (ov.weight !== undefined) existing.weight = ov.weight;
        if (ov.logicType !== undefined) existing.logicType = ov.logicType;
        if (ov.thresholdDirection !== undefined) existing.thresholdDirection = ov.thresholdDirection;
        if (ov.upgradeHierarchy !== undefined) existing.upgradeHierarchy = ov.upgradeHierarchy;
        if (ov.engineeringReason !== undefined) existing.engineeringReason = ov.engineeringReason;
        if (ov.attributeName !== undefined) existing.attributeName = ov.attributeName;
      }
    }
  }

  // 4. ADD
  if (delta.add && delta.add.length > 0) {
    const maxSort = Math.max(...rules.map(r => r.sortOrder), 0);
    for (let i = 0; i < delta.add.length; i++) {
      rules.push({
        ...delta.add[i],
        sortOrder: delta.add[i].sortOrder || maxSort + i + 1,
      });
    }
  }

  return {
    familyId: delta.familyId,
    familyName: delta.familyName,
    category: delta.category,
    description: delta.description,
    rules,
  };
}
