/**
 * Triage "+N similar" near-duplicate clustering (Tier 1, deterministic).
 *
 * Lifted out of GlobalUnmappedParamsTable.normalizedMatchesByRow so it can run
 * SERVER-SIDE over the full classified set. This is load-bearing under server
 * pagination: the cluster groups cosmetic-variant paramNames within an override
 * scope across the WHOLE queue, so it must be computed where the full set lives
 * (compute), then attached per-row as a compact sibling list. If it ran on the
 * client over a single loaded page, "+N similar" would silently undercount.
 *
 * Two passes (verbatim port of the original):
 *   1. Exact-normalized-key groups, scoped to (kind, key). "T(mm)" / "T (mm)" /
 *      "t(mm)" all collapse to one key via normalizeParamKey.
 *   2. ASCII-only Levenshtein-1 fuzzy fallback — merges singleton groups into a
 *      fuzzy-matching target (leader-join, first viable target wins). Gated to
 *      ASCII-only keys inside isFuzzyMatch because CJK code points carry too
 *      much semantic weight per char ("电压_max" vs "电流_max" is distance 1 but
 *      means voltage vs current). CJK synonyms are handled by the AI Tier-2
 *      cluster, not here.
 *
 * Rows are excluded from clustering when:
 *   - they have no override scope (dominantFamily || dominantCategory) — a bulk
 *     accept can't write an override without a scope, and
 *   - they already carry an ACTIVE override — already mapped, not actionable.
 */

import { normalizeParamKey, isFuzzyMatch } from '@/lib/services/paramNameSimilarity';

/** Minimal row shape the clusterer needs. Both the server `GlobalUnmapped` and
 *  the client `GlobalUnmappedParam` structurally satisfy this. */
export interface ClusterableRow {
  paramName: string;
  sampleValues: string[];
  dominantFamily: string | null;
  dominantCategory: string | null;
  affectedBatchIds: string[];
  acceptedOverride?: { isActive: boolean } | undefined;
}

/** Compact sibling descriptor attached per row. Carries exactly the fields the
 *  client consumers need: `paramName` (the chip + the override target),
 *  `sampleValues` (tooltip, sliced to ≤3), `dominantFamily`/`dominantCategory`
 *  (the bulk-accept override scope), and `affectedBatchIds` (so the bulk accept
 *  regenerates the right batches). Deliberately NOT the full row — keeps the
 *  cached payload small. */
export type SiblingRef = {
  paramName: string;
  sampleValues: string[];
  dominantFamily: string | null;
  dominantCategory: string | null;
  affectedBatchIds: string[];
};

/** Override scope for a row — L3 familyId or L2 category name. Mirrors
 *  getOverrideScope in GlobalUnmappedParamsTable. */
function getScopeKey(r: ClusterableRow): string | null {
  if (r.dominantFamily) return `family::${r.dominantFamily}`;
  if (r.dominantCategory) return `category::${r.dominantCategory}`;
  return null;
}

/**
 * Compute the per-row sibling map. Returns paramName → SiblingRef[] (the OTHER
 * rows in the same cluster). Rows with no siblings are absent from the map.
 */
export function computeSimilarSiblings(rows: ClusterableRow[]): Map<string, SiblingRef[]> {
  // Pass 1: exact-normalized-key groups, scoped to (kind, key).
  type Group = { normKey: string; list: ClusterableRow[]; merged?: true };
  const groupsByScope = new Map<string, Group[]>();
  for (const r of rows) {
    const scopeKey = getScopeKey(r);
    if (!scopeKey) continue; // unscoped — bulk-accept can't write an override
    if (r.acceptedOverride?.isActive) continue; // already mapped; not actionable
    const normKey = normalizeParamKey(r.paramName);
    const arr = groupsByScope.get(scopeKey) ?? [];
    let group = arr.find((g) => g.normKey === normKey);
    if (!group) {
      group = { normKey, list: [] };
      arr.push(group);
    }
    group.list.push(r);
    groupsByScope.set(scopeKey, arr);
  }
  // Pass 2: within each scope, merge singleton groups into other groups when
  // their normalized keys fuzzy-match. Leader-join (not transitive) — first
  // viable target wins.
  for (const arr of groupsByScope.values()) {
    for (const s of arr) {
      if (s.list.length !== 1 || s.merged) continue;
      for (const target of arr) {
        if (target === s || target.merged) continue;
        if (isFuzzyMatch(s.normKey, target.normKey)) {
          target.list.push(...s.list);
          s.merged = true;
          break;
        }
      }
    }
  }
  const result = new Map<string, SiblingRef[]>();
  for (const arr of groupsByScope.values()) {
    for (const group of arr) {
      if (group.merged) continue;
      if (group.list.length < 2) continue;
      for (const r of group.list) {
        result.set(
          r.paramName,
          group.list
            .filter((x) => x.paramName !== r.paramName)
            .map((x) => ({
              paramName: x.paramName,
              sampleValues: x.sampleValues.slice(0, 3),
              dominantFamily: x.dominantFamily,
              dominantCategory: x.dominantCategory,
              affectedBatchIds: x.affectedBatchIds,
            })),
        );
      }
    }
  }
  return result;
}
