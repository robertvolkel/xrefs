import { computeSimilarSiblings, type ClusterableRow } from '@/lib/services/triageClustering';

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
});
