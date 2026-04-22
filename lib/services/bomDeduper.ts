import type { DuplicateGroup, PartsListRow } from '@/lib/types';

/** Build the dedupe key. Returns null if the row is ineligible (blank MPN or MFR). */
function keyFor(row: PartsListRow): string | null {
  const mpn = row.rawMpn?.trim() ?? '';
  const mfr = row.rawManufacturer?.trim() ?? '';
  if (!mpn || !mfr) return null;
  return `${mpn.toLowerCase()}|${mfr.toLowerCase()}`;
}

function parseQty(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Scan rows and return groups of rows that share the same (MPN, MFR) pair.
 * Only groups with 2+ members are returned — singletons are excluded.
 * Rows with blank MPN or blank MFR are never grouped.
 */
export function findDuplicateGroups(
  rows: PartsListRow[],
  qtyColumnMapped: boolean,
): DuplicateGroup[] {
  const buckets = new Map<string, {
    mpn: string;
    manufacturer: string;
    rowIndexes: number[];
    totalQty: number;
    anyQtyParsed: boolean;
  }>();

  for (const row of rows) {
    const key = keyFor(row);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        mpn: row.rawMpn.trim(),
        manufacturer: row.rawManufacturer.trim(),
        rowIndexes: [],
        totalQty: 0,
        anyQtyParsed: false,
      };
      buckets.set(key, bucket);
    }
    bucket.rowIndexes.push(row.rowIndex);
    if (qtyColumnMapped) {
      const parsed = parseQty(row.rawQty);
      bucket.totalQty += parsed;
      if (parsed > 0) bucket.anyQtyParsed = true;
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.rowIndexes.length < 2) continue;
    groups.push({
      mpn: bucket.mpn,
      manufacturer: bucket.manufacturer,
      rowCount: bucket.rowIndexes.length,
      rowIndexes: bucket.rowIndexes,
      ...(qtyColumnMapped ? { totalQty: bucket.totalQty } : {}),
    });
  }
  return groups;
}

/**
 * Collapse each duplicate group down to its first occurrence. Drops all other
 * rows in the group. If qty was mapped, the survivor's rawQty becomes the sum
 * across the group. Re-indexes the output so rowIndex is 0..N-1 contiguous.
 */
export function consolidateDuplicates(
  rows: PartsListRow[],
  groups: DuplicateGroup[],
  qtyColumnMapped: boolean,
): PartsListRow[] {
  if (groups.length === 0) return rows;

  // Map: rowIndex → survivor rowIndex (or same index if this row is a survivor/singleton)
  const survivorOf = new Map<number, number>();
  const toDrop = new Set<number>();
  const summedQtyFor = new Map<number, number>();

  for (const g of groups) {
    const survivor = g.rowIndexes[0];
    survivorOf.set(survivor, survivor);
    if (qtyColumnMapped && g.totalQty !== undefined) {
      summedQtyFor.set(survivor, g.totalQty);
    }
    for (let i = 1; i < g.rowIndexes.length; i++) {
      toDrop.add(g.rowIndexes[i]);
    }
  }

  const kept = rows.filter(r => !toDrop.has(r.rowIndex));
  return kept.map((r, i) => {
    const summed = summedQtyFor.get(r.rowIndex);
    return {
      ...r,
      rowIndex: i,
      ...(summed !== undefined
        ? { rawQty: Number.isInteger(summed) ? String(summed) : summed.toFixed(2).replace(/\.?0+$/, '') }
        : {}),
    };
  });
}
