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

import { normalizeParamKey, isFuzzyMatch, isAsciiOnly } from '@/lib/services/paramNameSimilarity';

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
  //
  // Perf (Decision: Triage load — the O(n²)→~O(n) rewrite): the original used a
  // per-row `arr.find(g => g.normKey === normKey)` linear scan (O(rows×groups))
  // and a Pass-2 that compared EVERY group against EVERY other group calling
  // isFuzzyMatch (O(groups²)). Over the live queue (~26k params) that was ~16s of
  // pure CPU per cold rebuild. This version keeps the OUTPUT byte-identical while
  // making both passes near-linear:
  //   - Pass 1 uses a per-scope Map<normKey, Group> for O(1) group lookup.
  //   - Pass 2 uses a per-scope length index: since isFuzzyMatch is Levenshtein-≤1,
  //     it can only ever match keys whose lengths differ by ≤1 (and it rejects
  //     non-ASCII / len<5 outright). So a singleton only needs to look at groups
  //     of length {L-1, L, L+1}, iterated in ORIGINAL insertion order (via idx) so
  //     the "first viable target wins" leader-join picks the SAME target as before.
  // `idx` records first-encounter order per scope (== the old array order) so both
  // the merge order and the result-map insertion order are unchanged.
  type Group = {
    normKey: string;
    len: number;
    ascii: boolean;
    idx: number;
    list: ClusterableRow[];
    merged?: true;
  };
  const groupsByScope = new Map<string, Map<string, Group>>();
  for (const r of rows) {
    const scopeKey = getScopeKey(r);
    if (!scopeKey) continue; // unscoped — bulk-accept can't write an override
    if (r.acceptedOverride?.isActive) continue; // already mapped; not actionable
    const normKey = normalizeParamKey(r.paramName);
    let byNorm = groupsByScope.get(scopeKey);
    if (!byNorm) {
      byNorm = new Map();
      groupsByScope.set(scopeKey, byNorm);
    }
    let group = byNorm.get(normKey);
    if (!group) {
      group = { normKey, len: normKey.length, ascii: isAsciiOnly(normKey), idx: byNorm.size, list: [] };
      byNorm.set(normKey, group);
    }
    group.list.push(r);
  }
  // Pass 2: within each scope, merge singleton groups into other groups when
  // their normalized keys fuzzy-match. Leader-join (not transitive) — first
  // viable target wins.
  //
  // Deletion-neighborhood (SymSpell) index. Two ASCII keys of length ≥5 are
  // Levenshtein-≤1 iff they share a "delete-one-character" variant (a
  // substitution shares a common (L-1) deletion; an insertion/deletion makes the
  // shorter key itself a deletion of the longer). Indexing each eligible group
  // by {normKey} ∪ {its 1-char deletions} lets a source probe only its own
  // {normKey} ∪ deletions to find every candidate — near-linear regardless of
  // how key lengths cluster. (Plain length-bucketing was still O(groups²) here
  // because a scope's keys share a narrow length band — measured ~17s.)
  // isFuzzyMatch requires BOTH sides ASCII and length ≥5, so only such groups are
  // indexed / used as sources; everything else can only match via exact-normalized
  // Pass 1. The winning target is the earliest-idx unmerged match, which is
  // exactly the old "first viable target in insertion order wins".
  const deletions = (key: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < key.length; i++) out.push(key.slice(0, i) + key.slice(i + 1));
    return out;
  };
  for (const byNorm of groupsByScope.values()) {
    const index = new Map<string, Group[]>();
    const addVariant = (variant: string, g: Group) => {
      const bucket = index.get(variant);
      if (bucket) bucket.push(g);
      else index.set(variant, [g]);
    };
    for (const g of byNorm.values()) {
      if (!g.ascii || g.len < 5) continue;
      addVariant(g.normKey, g);
      for (const d of deletions(g.normKey)) addVariant(d, g);
    }
    for (const s of byNorm.values()) {
      if (s.list.length !== 1 || s.merged) continue;
      if (!s.ascii || s.len < 5) continue;
      // Gather candidate targets sharing a deletion-variant (or the exact key).
      const candidates = new Set<Group>();
      const probe = (variant: string) => {
        const bucket = index.get(variant);
        if (bucket) for (const g of bucket) candidates.add(g);
      };
      probe(s.normKey);
      for (const d of deletions(s.normKey)) probe(d);
      // Pick the earliest-idx unmerged, verified match (== old first-viable-wins).
      let best: Group | null = null;
      for (const target of candidates) {
        if (target === s || target.merged) continue;
        if (!isFuzzyMatch(s.normKey, target.normKey)) continue;
        if (best === null || target.idx < best.idx) best = target;
      }
      if (best) {
        best.list.push(...s.list);
        s.merged = true;
      }
    }
  }
  const result = new Map<string, SiblingRef[]>();
  for (const byNorm of groupsByScope.values()) {
    for (const group of byNorm.values()) {
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
