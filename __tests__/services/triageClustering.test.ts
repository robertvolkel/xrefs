import { computeSimilarSiblings, type ClusterableRow, type SiblingRef } from '@/lib/services/triageClustering';
import { normalizeParamKey, isFuzzyMatch } from '@/lib/services/paramNameSimilarity';

function row(partial: Partial<ClusterableRow> & { paramName: string }): ClusterableRow {
  return {
    sampleValues: [],
    dominantFamily: 'B5',
    dominantCategory: null,
    affectedBatchIds: [],
    acceptedOverride: undefined,
    ...partial,
  };
}

/**
 * FROZEN reference: the PRE-optimization O(n²) algorithm, copied verbatim from
 * triageClustering.ts before the length-bucket rewrite. Its ONLY purpose is to
 * prove the optimized computeSimilarSiblings is behavior-preserving via the
 * differential test below. If the INTENDED clustering behavior ever changes,
 * this oracle (and this test) should be updated or retired alongside it.
 */
function referenceComputeSimilarSiblings(rows: ClusterableRow[]): Map<string, SiblingRef[]> {
  type Group = { normKey: string; list: ClusterableRow[]; merged?: true };
  const groupsByScope = new Map<string, Group[]>();
  for (const r of rows) {
    const scopeKey = r.dominantFamily
      ? `family::${r.dominantFamily}`
      : r.dominantCategory
        ? `category::${r.dominantCategory}`
        : null;
    if (!scopeKey) continue;
    if (r.acceptedOverride?.isActive) continue;
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

/** Serialize a sibling map to a stable, comparable string (keys sorted). */
function serializeMap(m: Map<string, SiblingRef[]>): string {
  return JSON.stringify(
    [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, sibs]) => [k, sibs.map((s) => s.paramName).sort()]),
  );
}

describe('computeSimilarSiblings', () => {
  it('groups exact cosmetic variants within a scope', () => {
    const rows = [
      row({ paramName: 'T(mm)' }),
      row({ paramName: 'T (mm)' }),
      row({ paramName: 't(mm)' }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('T(mm)')?.map((s) => s.paramName).sort()).toEqual(['T (mm)', 't(mm)']);
    expect(map.get('t(mm)')?.map((s) => s.paramName).sort()).toEqual(['T (mm)', 'T(mm)']);
  });

  it('fuzzy-merges single-char ASCII typos', () => {
    const rows = [
      row({ paramName: 'propagation_delay' }),
      row({ paramName: 'propogation_delay' }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('propagation_delay')?.[0]?.paramName).toBe('propogation_delay');
  });

  it('does NOT fuzzy-merge CJK distance-1 keys (different concepts)', () => {
    const rows = [
      row({ paramName: '电压_max' }),
      row({ paramName: '电流_max' }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.has('电压_max')).toBe(false);
    expect(map.has('电流_max')).toBe(false);
  });

  it('isolates by scope — same normKey, different family → not siblings', () => {
    const rows = [
      row({ paramName: 'vgs', dominantFamily: 'B5' }),
      row({ paramName: 'vgs', dominantFamily: 'B6' }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.size).toBe(0);
  });

  it('excludes rows with an active override', () => {
    const rows = [
      row({ paramName: 'T(mm)' }),
      row({ paramName: 'T (mm)', acceptedOverride: { isActive: true } }),
    ];
    const map = computeSimilarSiblings(rows);
    // Only one actionable row left in the group → no siblings.
    expect(map.size).toBe(0);
  });

  it('keeps reverted (inactive) overrides in the cluster', () => {
    const rows = [
      row({ paramName: 'T(mm)' }),
      row({ paramName: 'T (mm)', acceptedOverride: { isActive: false } }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('T(mm)')?.[0]?.paramName).toBe('T (mm)');
  });

  it('clusters by L2 category when no family present', () => {
    const rows = [
      row({ paramName: 'Speed', dominantFamily: null, dominantCategory: 'Microcontrollers' }),
      row({ paramName: 'speed', dominantFamily: null, dominantCategory: 'Microcontrollers' }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('Speed')?.[0]?.paramName).toBe('speed');
  });

  it('truncates sibling sampleValues to 3', () => {
    const rows = [
      row({ paramName: 'T(mm)', sampleValues: ['a', 'b', 'c', 'd', 'e'] }),
      row({ paramName: 'T (mm)', sampleValues: ['1', '2', '3', '4'] }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('T(mm)')?.[0]?.sampleValues).toEqual(['1', '2', '3']);
  });

  it('fuzzy-merges keys whose lengths differ by exactly 1 (length-bucket edge)', () => {
    // 'capacitance' (11) vs 'capacitances' (12): Levenshtein 1, both ASCII, len≥5.
    // The optimized Pass-2 must look at the L+1 bucket, not just same-length.
    const rows = [
      row({ paramName: 'capacitance' }),
      row({ paramName: 'capacitances' }),
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('capacitance')?.[0]?.paramName).toBe('capacitances');
    expect(map.get('capacitances')?.[0]?.paramName).toBe('capacitance');
  });

  it('"first viable target wins" respects original order across length buckets', () => {
    // Source S fuzzy-matches BOTH a length+1 target (T1, emitted first) and a
    // length-1 target (T2, emitted last); T1 and T2 do NOT match each other
    // (|Δlen|=2). The original scan iterates in insertion order → S joins T1.
    // The optimized Pass-2 gathers candidates bucket-by-bucket ({L-1,L,L+1}),
    // which would visit T2's bucket before T1's — so ONLY the idx re-sort keeps
    // S joining T1. This case fails if that sort is removed.
    const rows = [
      row({ paramName: 'control' }),   // S  (len 7, idx 0)
      row({ paramName: 'controls' }),  // T1 (len 8, idx 1) — fuzzy to S, Δlen +1
      row({ paramName: 'contro' }),    // T2 (len 6, idx 2) — fuzzy to S, Δlen −1
    ];
    const map = computeSimilarSiblings(rows);
    expect(map.get('control')?.map((s) => s.paramName)).toEqual(['controls']);
    expect(map.has('contro')).toBe(false); // T2 left un-clustered
  });

  it('is behavior-identical to the pre-optimization O(n²) algorithm over a large mixed fixture', () => {
    // Deterministic LCG (no Math.random → reproducible failures).
    let seed = 123456789;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const rand = () => next() / 0x7fffffff;
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const letter = () => letters[Math.floor(rand() * letters.length)];
    const scopeKeys = ['B5', 'B6', 'CAT'];

    // This fixture MUST exercise the exact path the optimization touches: Pass-2
    // fuzzy merges between SINGLETON groups at equal AND ±1 length. So we build
    // many DISTINCT base tokens (→ singleton normKeys), each with a same-length
    // substitution variant and a length+1 insertion variant (both Levenshtein-1,
    // ASCII, len≥5). If the optimization stopped scanning the ±1 length bucket,
    // the insertion variants would stop merging and this test would diverge from
    // the reference. (Verified: breaking the bucket range fails this test.)
    const rows: ClusterableRow[] = [];
    let counter = 0;
    for (let i = 0; i < 500; i++) {
      const base = 'p' + Array.from({ length: 6 + (i % 4) }, letter).join('');
      const scope = scopeKeys[i % scopeKeys.length];
      const emit = (paramName: string, active?: boolean) => {
        const isCat = scope === 'CAT';
        rows.push(
          row({
            paramName,
            dominantFamily: isCat ? null : scope,
            dominantCategory: isCat ? 'Microcontrollers' : null,
            sampleValues: [String(counter % 7), 'x', 'y', 'z'],
            affectedBatchIds: [`b${counter % 11}`],
            acceptedOverride: active === undefined ? undefined : { isActive: active },
          }),
        );
        counter++;
      };
      // Three fuzzy-related singletons: the base, a same-length substitution
      // variant, and a length+1 insertion variant. Emit them in a ROTATED order
      // (varies with i) so the first-encounter idx order does NOT track the
      // {L-1,L,L+1} bucket-gather order. This makes the test sensitive to the
      // idx-sort that preserves "first viable target wins" — removing that sort
      // changes which target a source joins and diverges from the reference.
      const sub = base.slice(0, 1) + letter() + base.slice(2);
      const ins = base + letter();
      const variants = sub !== base ? [base, sub, ins] : [base, ins];
      const rot = i % variants.length;
      for (let k = 0; k < variants.length; k++) emit(variants[(rot + k) % variants.length]);
      // Occasional exact-normalized cosmetic dup (spacing/case) + an active
      // override to exercise the exclusion branch.
      if (i % 5 === 0) emit(base.toUpperCase() + ' ');
      if (i % 7 === 0) emit(base, true); // active override → excluded
      // A CJK key (must never fuzzy-merge) + a short key (<5, no fuzzy).
      if (i % 3 === 0) emit('电压' + (i % 4));
      if (i % 4 === 0) emit('ab' + (i % 3));
    }

    const optimized = computeSimilarSiblings(rows);
    const reference = referenceComputeSimilarSiblings(rows);
    expect(serializeMap(optimized)).toEqual(serializeMap(reference));
    // Sanity: the fixture actually produced clusters (else the equality is vacuous).
    expect(optimized.size).toBeGreaterThan(50);
  });
});
