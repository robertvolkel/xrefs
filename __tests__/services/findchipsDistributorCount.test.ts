import {
  computePerMakerDistributorCounts,
  resolveDistributorCount,
  resolveCardDistributorCount,
  type DistributorCountPayload,
} from '@/lib/services/findchipsDistributorCount';
import type { FCDistributorResult } from '@/lib/services/findchipsClient';

/**
 * Per-maker distributor counting for the search-card badge. The dangerous direction is
 * showing a card a count that includes OTHER makers of the same shared MPN — so the
 * fail-safe cases (maker not present / legacy row → no badge, never the maker-blind
 * total) are the load-bearing ones.
 */

const dist = (name: string, makers: string[]): FCDistributorResult =>
  ({
    distributor: { id: name.length, name, authorized: true },
    parts: makers.map((m) => ({ manufacturer: m, part: 'LM317T', price: [], stock: 0 })),
  } as unknown as FCDistributorResult);

// Mirrors a live multi-maker LM317T set: ST is at 3 distributors; the others at 1 each.
const LM317T: FCDistributorResult[] = [
  dist('DigiKey', ['Rochester Electronics LLC', 'STMicroelectronics', 'Goodwork Semiconductor Co Ltd', 'onsemi']),
  dist('element14', ['STMicroelectronics']),
  dist('RS', ['STMicroelectronics']),
  dist('Bristol', ['Fairchild Semiconductor Corporation', 'National Semiconductor Corporation']),
];

describe('computePerMakerDistributorCounts', () => {
  it('counts each distributor once per maker it carries, and the total across all makers', () => {
    const p = computePerMakerDistributorCounts(LM317T)!;
    expect(p.count).toBe(4); // 4 distributors carry the MPN under some maker
    expect(p.byMaker).toEqual({
      stmicroelectronics: 3, // DigiKey + element14 + RS
      rochester: 1,
      goodwork: 1,
      onsemi: 1,
      fairchild: 1,
      national: 1,
    });
  });

  it('counts a distributor ONCE for a maker even when it lists that maker several times', () => {
    // If dedupe-within-distributor is removed, this distributor counts ST twice.
    const p = computePerMakerDistributorCounts([
      dist('DigiKey', ['STMicroelectronics', 'STMicroelectronics', 'ST Microelectronics']),
    ])!;
    expect(p.count).toBe(1);
    expect(p.byMaker!.stmicroelectronics).toBe(1);
  });

  it('returns null for empty/absent results and ignores distributors with no parts', () => {
    expect(computePerMakerDistributorCounts(null)).toBeNull();
    expect(computePerMakerDistributorCounts([])).toBeNull();
    const onlyEmpty = [{ distributor: { id: 1, name: 'X', authorized: true }, parts: [] }] as unknown as FCDistributorResult[];
    expect(computePerMakerDistributorCounts(onlyEmpty)).toBeNull();
  });
});

describe('resolveDistributorCount', () => {
  const payload = computePerMakerDistributorCounts(LM317T)!;

  it('with a maker, returns ONLY that maker’s distributor count', () => {
    expect(resolveDistributorCount(payload, 'STMicroelectronics')).toBe(3);
    expect(resolveDistributorCount(payload, 'GOODWORK')).toBe(1); // short name normalizes to the same core
    expect(resolveDistributorCount(payload, 'onsemi')).toBe(1);
  });

  it('with a maker NOT present, returns undefined (no badge, never the maker-blind total)', () => {
    // The dangerous direction: falling back to payload.count (4) would show an HGSEMI
    // card everyone-else's distributors.
    expect(resolveDistributorCount(payload, 'HGSEMI')).toBeUndefined();
  });

  it('with a maker whose spelling differs beyond a suffix strip, returns undefined (fail safe, not the total)', () => {
    // "ST" -> "st" is not the stored "stmicroelectronics" core; without alias variants we
    // under-show rather than borrow the total. (Alias variants are a separate follow-up.)
    expect(resolveDistributorCount(payload, 'ST')).toBeUndefined();
  });

  it('on a LEGACY row (no byMaker) with a maker, returns undefined — not the maker-blind total', () => {
    const legacy: DistributorCountPayload = { count: 4 };
    expect(resolveDistributorCount(legacy, 'STMicroelectronics')).toBeUndefined();
  });

  it('with NO maker supplied, returns the maker-blind total (unchanged legacy behavior)', () => {
    expect(resolveDistributorCount(payload, undefined)).toBe(4);
    expect(resolveDistributorCount(payload, '')).toBe(4);
    expect(resolveDistributorCount({ count: 7 }, null)).toBe(7);
  });

  it('returns undefined for a null/absent payload', () => {
    expect(resolveDistributorCount(null, 'STMicroelectronics')).toBeUndefined();
    expect(resolveDistributorCount(undefined, undefined)).toBeUndefined();
  });
});

describe('resolveCardDistributorCount (shared per-card policy)', () => {
  const payload = computePerMakerDistributorCounts(LM317T)!;

  it('with a maker present, returns that maker’s count (same as resolveDistributorCount)', () => {
    expect(resolveCardDistributorCount(payload, 'STMicroelectronics')).toBe(3);
    expect(resolveCardDistributorCount(payload, 'onsemi')).toBe(1);
  });

  it('with a BLANK/absent maker, returns undefined — NEVER the maker-blind total', () => {
    // THE load-bearing difference from resolveDistributorCount: a card with no maker must not
    // borrow the cross-maker aggregate. If the blank-maker guard is removed, these return 4 (the
    // total) — the exact wrong-maker attribution the per-card policy exists to prevent.
    expect(resolveCardDistributorCount(payload, undefined)).toBeUndefined();
    expect(resolveCardDistributorCount(payload, null)).toBeUndefined();
    expect(resolveCardDistributorCount(payload, '')).toBeUndefined();
    expect(resolveCardDistributorCount(payload, '   ')).toBeUndefined();
    // Contrast: resolveDistributorCount DOES return the total on a blank maker (for maker-agnostic
    // callers) — proving the two helpers genuinely differ and this isn't a vacuous pass.
    expect(resolveDistributorCount(payload, '')).toBe(4);
  });

  it('with a maker NOT present, returns undefined (fail safe)', () => {
    expect(resolveCardDistributorCount(payload, 'HGSEMI')).toBeUndefined();
  });

  it('returns undefined for a null payload regardless of maker', () => {
    expect(resolveCardDistributorCount(null, 'STMicroelectronics')).toBeUndefined();
    expect(resolveCardDistributorCount(undefined, 'onsemi')).toBeUndefined();
  });
});
