/**
 * Override History Helper
 *
 * Utilities for computing previous_values snapshots and resolving
 * admin names for the rule override audit trail.
 */

import { getLogicTable } from '@/lib/logicTables';
import { createClient } from '@/lib/supabase/server';

/** Mutable rule fields stored in the override snapshot (snake_case DB format). */
const SNAPSHOT_FIELDS = [
  'weight', 'logic_type', 'threshold_direction', 'upgrade_hierarchy',
  'block_on_missing', 'tolerance_percent', 'engineering_reason',
  'attribute_name', 'sort_order', 'action',
] as const;

/** camelCase → snake_case map for TS base rule fields. */
const CAMEL_TO_SNAKE: Record<string, string> = {
  logicType: 'logic_type',
  thresholdDirection: 'threshold_direction',
  upgradeHierarchy: 'upgrade_hierarchy',
  blockOnMissing: 'block_on_missing',
  tolerancePercent: 'tolerance_percent',
  engineeringReason: 'engineering_reason',
  attributeName: 'attribute_name',
  sortOrder: 'sort_order',
};

/**
 * Build a snapshot of the current rule state BEFORE an override is applied.
 *
 * @param familyId - The component family
 * @param attributeId - The rule's attribute ID
 * @param currentActiveOverride - The currently active DB override row (null if none)
 * @param action - The action being performed ('modify', 'add', 'remove')
 * @returns JSONB-safe object, or null for 'add' actions (nothing existed before)
 */
export function snapshotRuleState(
  familyId: string,
  attributeId: string,
  currentActiveOverride: Record<string, unknown> | null,
  action: string,
): Record<string, unknown> | null {
  // 'add' actions — nothing existed before
  if (action === 'add' && !currentActiveOverride) return null;

  // If there's an active override, snapshot its fields
  if (currentActiveOverride) {
    const snapshot: Record<string, unknown> = {};
    for (const field of SNAPSHOT_FIELDS) {
      if (currentActiveOverride[field] !== undefined && currentActiveOverride[field] !== null) {
        snapshot[field] = currentActiveOverride[field];
      }
    }
    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  // No active override — snapshot from TS base
  const table = getLogicTable(familyId);
  if (!table) return null;

  const baseRule = table.rules.find(r => r.attributeId === attributeId);
  if (!baseRule) return null;

  const snapshot: Record<string, unknown> = { source: 'ts_base' };
  // Map camelCase rule fields to snake_case snapshot
  for (const [camel, snake] of Object.entries(CAMEL_TO_SNAKE)) {
    const val = (baseRule as unknown as Record<string, unknown>)[camel];
    if (val !== undefined && val !== null) {
      snapshot[snake] = val;
    }
  }
  // Direct fields
  if (baseRule.weight !== undefined) snapshot.weight = baseRule.weight;

  return Object.keys(snapshot).length > 1 ? snapshot : null; // >1 because 'source' always present
}

/**
 * Batch-resolve admin user IDs to display names via the profiles table.
 *
 * @param userIds - Array of UUID strings (duplicates are fine, will be deduped)
 * @returns Map<userId, fullName> — missing profiles return 'Unknown'
 */
export async function resolveAdminNames(userIds: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return nameMap;

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);

  for (const row of data ?? []) {
    nameMap.set(row.id as string, (row.full_name as string) || 'Unknown');
  }

  // Fill in missing IDs
  for (const id of unique) {
    if (!nameMap.has(id)) nameMap.set(id, 'Unknown');
  }

  return nameMap;
}
