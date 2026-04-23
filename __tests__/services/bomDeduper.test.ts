import { findDuplicateGroups, consolidateDuplicates } from '@/lib/services/bomDeduper';
import type { PartsListRow } from '@/lib/types';

function makeRow(
  rowIndex: number,
  rawMpn: string,
  rawManufacturer: string,
  rawQty?: string,
): PartsListRow {
  return {
    rowIndex,
    rawMpn,
    rawManufacturer,
    rawDescription: '',
    rawCells: [rawMpn, rawManufacturer, rawQty ?? ''],
    status: 'pending',
    ...(rawQty !== undefined ? { rawQty } : {}),
  };
}

describe('findDuplicateGroups', () => {
  it('returns empty when all rows are unique', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet'),
      makeRow(1, 'A2', 'Kemet'),
      makeRow(2, 'A1', 'Murata'),
    ];
    expect(findDuplicateGroups(rows, false)).toEqual([]);
  });

  it('groups rows with identical MPN+MFR regardless of case/whitespace', () => {
    const rows = [
      makeRow(0, 'C0805C104K3RAC', 'Kemet'),
      makeRow(1, ' c0805c104k3rac ', 'KEMET'),
      makeRow(2, 'C0805C104K3RAC', 'kemet'),
    ];
    const groups = findDuplicateGroups(rows, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].rowCount).toBe(3);
    expect(groups[0].mpn).toBe('C0805C104K3RAC');
    expect(groups[0].manufacturer).toBe('Kemet');
    expect(groups[0].rowIndexes).toEqual([0, 1, 2]);
    expect(groups[0].totalQty).toBeUndefined();
  });

  it('excludes rows with blank MFR even if MPN matches', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet'),
      makeRow(1, 'A1', ''),
      makeRow(2, 'A1', 'Kemet'),
    ];
    const groups = findDuplicateGroups(rows, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].rowCount).toBe(2);
    expect(groups[0].rowIndexes).toEqual([0, 2]);
  });

  it('excludes rows with blank MPN', () => {
    const rows = [
      makeRow(0, '', 'Kemet'),
      makeRow(1, '', 'Kemet'),
    ];
    expect(findDuplicateGroups(rows, false)).toEqual([]);
  });

  it('sums qty when qty column is mapped, tolerating parse failures', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet', '10'),
      makeRow(1, 'A1', 'Kemet', '5'),
      makeRow(2, 'A1', 'Kemet', 'bogus'),
      makeRow(3, 'A1', 'Kemet', '3'),
    ];
    const groups = findDuplicateGroups(rows, true);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalQty).toBe(18);
  });

  it('omits totalQty when qtyColumnMapped is false', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet', '10'),
      makeRow(1, 'A1', 'Kemet', '5'),
    ];
    const groups = findDuplicateGroups(rows, false);
    expect(groups[0].totalQty).toBeUndefined();
  });

  it('collapses alias-variant MFRs once rows are pre-canonicalized', () => {
    // Mirrors the runtime contract: usePartsListState rewrites rawManufacturer
    // to the Atlas canonical (name_display) via the canonicalize endpoint
    // BEFORE calling findDuplicateGroups. The deduper itself stays oblivious
    // to aliasing; this test documents the expected collapsed state.
    const canonical = 'GIGADEVICE 兆易创新';
    const rows = [
      makeRow(0, 'GD32F405', canonical),  // from input 'GD'
      makeRow(1, 'GD32F405', canonical),  // from input 'GigaDevice'
      makeRow(2, 'GD32F405', canonical),  // from input '兆易创新'
    ];
    const groups = findDuplicateGroups(rows, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].rowCount).toBe(3);
    expect(groups[0].manufacturer).toBe(canonical);
    expect(groups[0].rowIndexes).toEqual([0, 1, 2]);
  });

  it('returns multiple groups and excludes singletons', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet'),     // dup group 1
      makeRow(1, 'A2', 'Murata'),    // singleton
      makeRow(2, 'A1', 'Kemet'),     // dup group 1
      makeRow(3, 'B3', 'Vishay'),    // dup group 2
      makeRow(4, 'B3', 'Vishay'),    // dup group 2
      makeRow(5, 'C9', 'Yageo'),     // singleton
    ];
    const groups = findDuplicateGroups(rows, false);
    expect(groups).toHaveLength(2);
    const a1 = groups.find(g => g.mpn === 'A1')!;
    const b3 = groups.find(g => g.mpn === 'B3')!;
    expect(a1.rowIndexes).toEqual([0, 2]);
    expect(b3.rowIndexes).toEqual([3, 4]);
  });
});

describe('consolidateDuplicates', () => {
  it('returns the same rows when no groups are supplied', () => {
    const rows = [makeRow(0, 'A1', 'Kemet'), makeRow(1, 'A2', 'Kemet')];
    const out = consolidateDuplicates(rows, [], false);
    expect(out).toHaveLength(2);
    expect(out[0].rowIndex).toBe(0);
  });

  it('keeps first occurrence, drops the rest, re-indexes contiguously', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet'),
      makeRow(1, 'A2', 'Murata'),
      makeRow(2, 'A1', 'Kemet'),
      makeRow(3, 'A1', 'Kemet'),
    ];
    const groups = findDuplicateGroups(rows, false);
    const out = consolidateDuplicates(rows, groups, false);
    expect(out).toHaveLength(2);
    expect(out.map(r => r.rawMpn)).toEqual(['A1', 'A2']);
    expect(out.map(r => r.rowIndex)).toEqual([0, 1]);
  });

  it('sums qty into survivor when qty column is mapped', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet', '10'),
      makeRow(1, 'A1', 'Kemet', '5'),
      makeRow(2, 'A1', 'Kemet', '3'),
    ];
    const groups = findDuplicateGroups(rows, true);
    const out = consolidateDuplicates(rows, groups, true);
    expect(out).toHaveLength(1);
    expect(out[0].rawQty).toBe('18');
  });

  it('does not touch rawQty when qty column not mapped', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet'),
      makeRow(1, 'A1', 'Kemet'),
    ];
    const groups = findDuplicateGroups(rows, false);
    const out = consolidateDuplicates(rows, groups, false);
    expect(out).toHaveLength(1);
    expect(out[0].rawQty).toBeUndefined();
  });

  it('preserves singletons alongside consolidated rows', () => {
    const rows = [
      makeRow(0, 'A1', 'Kemet', '10'),
      makeRow(1, 'A2', 'Murata', '1'),
      makeRow(2, 'A1', 'Kemet', '5'),
      makeRow(3, 'B3', 'Vishay', '7'),
    ];
    const groups = findDuplicateGroups(rows, true);
    const out = consolidateDuplicates(rows, groups, true);
    expect(out).toHaveLength(3);
    expect(out.map(r => r.rawMpn)).toEqual(['A1', 'A2', 'B3']);
    expect(out.map(r => r.rowIndex)).toEqual([0, 1, 2]);
    const a1 = out.find(r => r.rawMpn === 'A1')!;
    expect(a1.rawQty).toBe('15');
  });
});
