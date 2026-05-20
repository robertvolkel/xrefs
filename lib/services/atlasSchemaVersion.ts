/**
 * Per-family schema fingerprint used for proactive staleness signals on
 * Triage AI suggestions / investigations.
 *
 * Returns a deterministic FNV-1a 32-bit hash (8 hex chars) over the
 * stable parts of the family's logic-table prompt context:
 *   - rule attributeId
 *   - rule attributeName
 *   - rule weight
 *   - rule engineeringReason
 *   - FAMILY_PARAM_SIGNATURES entries that target this family
 *
 * Same input → same hash, so when a family's schema hasn't changed, the
 * cached suggestion's `schemaVersionAtWrite` matches the current version
 * and the row reads as fresh. Edit a rule's reason or add a signature →
 * hash changes → cached row gets flagged stale on next page load.
 *
 * The hash purposely DOES NOT include the domain card's text — that's
 * tracked separately as `cardUpdatedAt`. Cards and schemas evolve
 * independently and we want the engineer to see WHICH one drove a
 * staleness verdict ("domain card updated" vs "schema changed").
 */

import { getLogicTable } from '@/lib/logicTables';
import { FAMILY_PARAM_SIGNATURES } from '@/lib/services/atlasFamilyParamSignatures';

/** FNV-1a 32-bit. Matches the hash used by paramUid() in the Triage UI
 *  so future engineers see one algorithm across the codebase. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function computeSchemaVersion(familyId: string | null): string | null {
  if (!familyId) return null;
  const table = getLogicTable(familyId);
  if (!table) return null;

  // Build the fingerprint deterministically. Sort rules by attributeId so
  // re-ordering rules in the source file (cosmetic) doesn't change the hash.
  // Only the data /suggest's prompt actually consumes is included.
  const ruleParts = table.rules
    .slice()
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
    .map((r) => `${r.attributeId}|${r.attributeName}|${r.weight}|${r.engineeringReason ?? ''}`);

  const sigParts = FAMILY_PARAM_SIGNATURES
    .filter((sig) => sig.target.familyId === familyId)
    .map((sig) => `${String(sig.pattern)}|${sig.target.subcategory}`);

  const fingerprint = `rules:${ruleParts.join('||')}|sigs:${sigParts.join('||')}`;
  return fnv1a(fingerprint);
}
