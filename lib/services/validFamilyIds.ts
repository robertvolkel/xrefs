/**
 * Canonical valid L3 family ID set + isValidFamilyId() helper.
 *
 * Derived from `logicTableRegistry` keys — that registry is the source of
 * truth for which families have logic tables, and it's what
 * `atlas_products.family_id` is populated from at ingest. Any consumer
 * that needs to validate a string against "real, existing families"
 * should import from here rather than maintain its own list.
 *
 * Use cases:
 *  - POST /api/admin/atlas/family-param-signatures: reject inserts whose
 *    `targetFamilyId` is a hallucinated ID (Decision #185 follow-up;
 *    BACKLOG item "Constrain AI Triage Investigator to known family IDs").
 *  - /api/admin/atlas/dictionaries/investigate: downgrade `wrong_family`
 *    verdicts whose `suggestedFamily` doesn't exist to `unmappable`.
 *  - UI defense: hide the wrong_family Confirm button when the AI's
 *    suggested family isn't in the set.
 *
 * NOT included: L2 category names (e.g. 'Microcontrollers'). The
 * reclassify operation moves rows between L3 family_ids in
 * atlas_products — an L2 string can't be a destination there.
 * atlas_dictionary_overrides.family_id is overloaded per Decision #178
 * but that's a different table with different semantics.
 */

import { logicTableRegistry } from '../logicTables';

/** Set of all valid L3 family IDs (e.g. 'B5', 'B6', 'C2', 'E1', '12', '52'). */
export const VALID_FAMILY_IDS: ReadonlySet<string> = new Set(
  Object.keys(logicTableRegistry),
);

/** Validate that `id` is a known L3 family. Returns false for null/undefined. */
export function isValidFamilyId(id: string | null | undefined): boolean {
  if (!id) return false;
  return VALID_FAMILY_IDS.has(id);
}

/** Sorted list — used by prompt builders to enumerate allowed values. */
export function listValidFamilyIds(): string[] {
  return [...VALID_FAMILY_IDS].sort();
}
