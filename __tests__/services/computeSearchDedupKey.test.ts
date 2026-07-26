import { computeSearchDedupKey } from '@/lib/services/partDataService';

/**
 * Mutation-grade tests for the search merge dedup key — the switch that decides whether alternate
 * makers of a shared standard MPN each get a card or collapse to one. The emergent ordering/merge
 * is verified live; here we pin the key logic: flag off = MPN-only, flag on = MPN+canonical maker,
 * same-canonical collapses, unknown-maker falls back to the raw string (fail toward showing more).
 */

// A stub canonical resolver: onsemi ≡ "ON Semiconductor" (same slug), TI distinct, others unknown.
const slugOf = (mfrLower: string): string | null | undefined => {
  if (mfrLower === 'onsemi' || mfrLower === 'on semiconductor') return 'onsemi';
  if (mfrLower === 'texas instruments' || mfrLower === 'ti') return 'texas-instruments';
  return null; // alias index miss
};

describe('computeSearchDedupKey', () => {
  it('flag OFF: keys purely by MPN — two makers of the same MPN collapse', () => {
    const a = computeSearchDedupKey('LM317T', 'Texas Instruments', false, slugOf);
    const b = computeSearchDedupKey('LM317T', 'Some Chinese Maker', false, slugOf);
    expect(a).toBe(b);
    expect(a).toBe('lm317t');
  });

  it('flag ON: different canonical makers of the same MPN get DIFFERENT keys (each survives)', () => {
    const ti = computeSearchDedupKey('LM317T', 'Texas Instruments', true, slugOf);
    const other = computeSearchDedupKey('LM317T', 'UMW', true, slugOf);
    expect(ti).not.toBe(other);
  });

  it('flag ON: the SAME canonical maker under different spellings collapses (onsemi ≡ ON Semiconductor)', () => {
    const x = computeSearchDedupKey('BC847B', 'onsemi', true, slugOf);
    const y = computeSearchDedupKey('BC847B', 'ON Semiconductor', true, slugOf);
    expect(x).toBe(y); // fails if the canonical slug isn't used
  });

  it('flag ON: an unknown maker falls back to its raw string, so distinct spellings stay separate', () => {
    const p = computeSearchDedupKey('XYZ1', 'Maker Alpha', true, slugOf);
    const q = computeSearchDedupKey('XYZ1', 'Maker Beta', true, slugOf);
    expect(p).not.toBe(q); // fails if the `slug || mfrLower` fallback is dropped
    expect(p).toBe('xyz1::maker alpha');
  });

  it('is case-insensitive on the MPN', () => {
    expect(computeSearchDedupKey('Lm317T', 'TI', true, slugOf)).toBe(
      computeSearchDedupKey('lm317t', 'ti', true, slugOf),
    );
  });
});
