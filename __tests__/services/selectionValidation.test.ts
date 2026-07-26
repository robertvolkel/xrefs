import {
  findValueConflicts,
  firstValueConflict,
} from '@/lib/services/selectionValidation';
import { getLogicTable } from '@/lib/logicTables';
import { parseSelectionOptions } from '@/lib/services/selectionQuestions';

/**
 * Mutation-grade tests grounded in the REAL MLCC (family 12) logic table, whose `dielectric`
 * rule has both a closed option set (C0G/X7R/…) and a valueAliases group ([C0G, NP0]) — so the
 * two load-bearing behaviors (flag a genuine non-option; NEVER flag a valid alias) are tested
 * against production data, not a fixture.
 */

const MLCC = '12';
const DIELECTRIC = 'dielectric';

// Preconditions — fail loudly if the fixture family ever changes shape (keeps tests honest).
beforeAll(() => {
  const table = getLogicTable(MLCC)!;
  const rule = table.rules.find((r) => r.attributeId === DIELECTRIC)!;
  expect(parseSelectionOptions(rule)).toContain('X7R'); // closed option set exists
  expect(rule.valueAliases?.some((g) => g.includes('NP0') && g.includes('C0G'))).toBe(true);
});

describe('findValueConflicts', () => {
  it('does not flag a value that is a real option', () => {
    expect(findValueConflicts(MLCC, { [DIELECTRIC]: { value: 'X7R' } })).toEqual([]);
  });

  it('flags a categorical value that is NOT an option, offering the real options', () => {
    const conflicts = findValueConflicts(MLCC, { [DIELECTRIC]: { value: 'ZZ9Q' } });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].attributeId).toBe(DIELECTRIC);
    expect(conflicts[0].stated).toBe('ZZ9Q');
    expect(conflicts[0].options).toContain('C0G');
  });

  it('does NOT flag a valid per-rule alias (NP0 ≡ C0G) — the false-positive guard', () => {
    // NP0 is not in the hierarchy list, but shares a valueAliases group with C0G, which is.
    expect(findValueConflicts(MLCC, { [DIELECTRIC]: { value: 'NP0' } })).toEqual([]);
  });

  it('is case/punctuation-insensitive on options (c0g ≡ C0G)', () => {
    expect(findValueConflicts(MLCC, { [DIELECTRIC]: { value: 'c0g' } })).toEqual([]);
  });

  it('fails open for a blank / "any" value', () => {
    expect(findValueConflicts(MLCC, { [DIELECTRIC]: { value: null } })).toEqual([]);
    expect(findValueConflicts(MLCC, { [DIELECTRIC]: { value: '  ' } })).toEqual([]);
  });

  it('fails open for a spec with no closed option set (a numeric/threshold rule)', () => {
    // `tolerance` is a threshold rule → parseSelectionOptions returns undefined → never validated.
    const table = getLogicTable(MLCC)!;
    expect(parseSelectionOptions(table.rules.find((r) => r.attributeId === 'tolerance')!)).toBeUndefined();
    expect(findValueConflicts(MLCC, { tolerance: { value: 'nonsense-value' } })).toEqual([]);
  });

  it('fails open for an unknown family and unknown attribute', () => {
    expect(findValueConflicts('NOT_A_FAMILY', { [DIELECTRIC]: { value: 'ZZ9Q' } })).toEqual([]);
    expect(findValueConflicts(MLCC, { not_a_real_attr: { value: 'whatever' } })).toEqual([]);
  });
});

describe('firstValueConflict', () => {
  it('returns the first conflict or null', () => {
    expect(firstValueConflict(MLCC, { [DIELECTRIC]: { value: 'X7R' } })).toBeNull();
    expect(firstValueConflict(MLCC, { [DIELECTRIC]: { value: 'ZZ9Q' } })?.attributeId).toBe(DIELECTRIC);
  });
});
