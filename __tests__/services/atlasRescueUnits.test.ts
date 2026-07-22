/**
 * The rescued-parameter path stores a number WITHOUT scaling it — that was the
 * bug. A value arriving under a column name no dictionary recognises had its
 * number read and its unit ignored: `"80mΩ@10V"` became 80 rather than 0.08,
 * a thousand times too high, in a slot the matching engine scores on
 * (`rds_on`, weight 9, `lte`). Measured over all 429 source files: 154,222
 * values were stored at the wrong scale, 50,521 of them in scoring slots,
 * across 69,742 products.
 *
 * ⚠️ THE SAFETY PROPERTY IS ONE-DIRECTIONAL, and most of this suite exists to
 * pin it: an unrecognised unit must leave the number EXACTLY as it is today.
 * This change may only make a value more correct or leave it alone — it must
 * never introduce a wrong one. Both obvious "proper" fixes violate that:
 *
 *   - a first-letter rule reads `ppm` and `pcs` as pico (22,376 values)
 *   - a strict whole-token rule BREAKS `PF`, `nV/√Hz`, `mW/sr`, `Mbit`
 *
 * so the table is a deliberate allowlist, and the tests below are written to
 * fail if someone "improves" it into either of those.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rescueNumericValue, RESCUE_UNIT_MULTIPLIERS, mapAtlasModel } from '@/lib/services/atlasMapper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mapModel } = require('../../scripts/atlas-ingest.mjs');

const SHARED = JSON.parse(
  readFileSync(resolve(process.cwd(), 'lib/services/atlas-rescue-units.json'), 'utf-8'),
) as { prefixes: Record<string, number>; atoms: string[]; excluded: string[] };

describe('the bug this fixes', () => {
  /**
   * The exact production value. Siliup/SP40N25TQ ships the column
   * 导通电阻(RDS(on)) = "80mΩ@10V", which slugs onto `rds_on` — a weight-9
   * `lte` rule — and matchingEngine.ts:23 returns a stored numericValue
   * verbatim, with no re-parse and no unit check. Stored as 80, a genuinely
   * better 80 mΩ candidate hard-FAILED against a 100 mΩ source.
   */
  it('scales the production value that caused this: 80mΩ → 0.08 Ω', () => {
    expect(rescueNumericValue('80mΩ@10V')).toBeCloseTo(0.08, 12);
  });

  it('reads the unit from the VALUE STRING, not from a dictionary', () => {
    // Bare extractNumeric returns 80 here because it never looks at the unit.
    // If this path regresses to it, this is the assertion that fires.
    expect(rescueNumericValue('80mΩ@10V')).not.toBe(80);
  });
});

describe('unrecognised units are left EXACTLY as they are', () => {
  /**
   * ppm is the canary for a first-letter rule. `startsWith('p')` reads it as
   * pico: "+15 ppm" becomes 1.5e-11. 11,122 values corpus-wide.
   */
  it('ppm is not pico — the single most common way to get this wrong', () => {
    expect(rescueNumericValue('+15 ppm')).toBe(15);
    expect(rescueNumericValue('5ppm/℃')).toBe(5);
  });

  it('pcs is not pico either (11,254 values corpus-wide)', () => {
    expect(rescueNumericValue('10000 pcs')).toBe(10000);
  });

  it('units is not micro', () => {
    expect(rescueNumericValue('15 units')).toBe(15);
  });

  /**
   * These are the values a STRICT whole-token rule would break. They are
   * left alone today, which is correct-by-omission rather than correct-by-
   * conversion — an un-taken opportunity, never a corruption.
   */
  it.each([
    ['nV/√Hz', '4.5 nV/√Hz', 4.5],
    ['mW/sr', '200 mW/sr', 200],
    ['mW/°C', '12 mW/°C', 12],
    ['Mbit', '4 Mbit', 4],
    ['mil', '31 mil', 31],
    ['Max', '5 Max', 5],
  ])('composite/unknown token %s is untouched', (_t, input, expected) => {
    expect(rescueNumericValue(input)).toBe(expected);
  });

  it('a bare prefix letter with no unit is NOT treated as a prefix', () => {
    // "m" alone is metre or nothing — guessing milli here would be inventing data.
    expect(rescueNumericValue('5 m')).toBe(5);
    expect(rescueNumericValue('3 K')).toBe(3);
    expect(rescueNumericValue('7 M')).toBe(7);
  });

  it('a value with no unit at all is unchanged', () => {
    expect(rescueNumericValue('42')).toBe(42);
  });

  it('a value with no number returns undefined, not zero', () => {
    expect(rescueNumericValue('N/A')).toBeUndefined();
    expect(rescueNumericValue('')).toBeUndefined();
  });
});

describe('the allowlist itself', () => {
  it('converts every prefix × atom combination it declares', () => {
    for (const [prefix, mult] of Object.entries(SHARED.prefixes)) {
      for (const atom of SHARED.atoms) {
        const token = prefix + atom;
        if (SHARED.excluded.includes(token)) continue;
        expect(rescueNumericValue(`2${token}`)).toBeCloseTo(2 * mult, 20);
      }
    }
  });

  /**
   * ⚠️ NAMED EXPLICITLY, not iterated over `SHARED.excluded`.
   *
   * The first version of this test looped the exclusion list — so DELETING an
   * entry made the test check one fewer thing and still pass. Caught by
   * mutation: removing `MS` left all 25 green. A test whose coverage is
   * defined by the data it is testing cannot fail when that data shrinks.
   * See [[green-test-must-fail-on-broken-code]].
   */
  it.each([
    ['MS', 'ambiguous: mega-siemens vs a mis-cased millisecond'],
    ['KS', 'same ambiguity'],
  ])('%s stays unconverted — %s', (token) => {
    expect(SHARED.excluded).toContain(token);
    expect(RESCUE_UNIT_MULTIPLIERS.has(token)).toBe(false);
    expect(rescueNumericValue(`8 ${token}`)).toBe(8);
  });

  it('every exclusion is load-bearing — the cross really would generate it', () => {
    for (const token of SHARED.excluded) {
      const [prefix, ...rest] = token;
      expect(SHARED.prefixes[prefix]).toBeDefined();
      expect(SHARED.atoms).toContain(rest.join(''));
      expect(RESCUE_UNIT_MULTIPLIERS.has(token)).toBe(false);
    }
  });

  /**
   * Millimetre is safe by ABSENCE, not by exclusion — `m` is not an atom, so
   * `mm` is never generated. This is the allowlist's whole point, and it is
   * pinned separately so nobody "restores" a dead exclusion entry to protect it.
   */
  it('mm is millimetre — protected by the allowlist, not by an exclusion entry', () => {
    expect(SHARED.excluded).not.toContain('mm');
    expect(RESCUE_UNIT_MULTIPLIERS.has('mm')).toBe(false);
    expect(rescueNumericValue('8.3 mm')).toBe(8.3);
  });

  /**
   * GREEK MU (U+03BC) must not be added to this table while the extractor's
   * character class excludes it — it would be dead code that reads like
   * working code. See the _prefixComment in the JSON.
   */
  it('does not list a prefix the extractor can never produce', () => {
    expect(SHARED.prefixes['μ']).toBeUndefined();
    expect(SHARED.prefixes['µ']).toBe(1e-6); // the micro sign IS reachable
  });

  /**
   * Uppercase P/U/N are deliberately ABSENT. A supplier writing `PF` for
   * picofarad is real (1,989 values), but turning case-folding on
   * generatively also turns on `UV`, `PW` and `NA` for tokens that mean
   * something else. That is a separate, measured change.
   */
  it('does NOT case-fold prefixes — PF stays unconverted, on purpose', () => {
    expect(rescueNumericValue('4010 PF')).toBe(4010);
    expect(RESCUE_UNIT_MULTIPLIERS.has('PF')).toBe(false);
  });

  it('is built from the shared file, not a hand-typed copy', () => {
    const expectedSize =
      Object.keys(SHARED.prefixes).length * SHARED.atoms.length - SHARED.excluded.length;
    expect(RESCUE_UNIT_MULTIPLIERS.size).toBe(expectedSize);
    expect(RESCUE_UNIT_MULTIPLIERS.get('mΩ')).toBe(1e-3);
    expect(RESCUE_UNIT_MULTIPLIERS.get('MHz')).toBe(1e6);
  });
});

/**
 * The .mjs copy is the LIVE ingest path and cannot import TS, so it reads the
 * same JSON. A "keep in lockstep" comment is not a mechanism — this is.
 */
describe('the two mapper copies agree', () => {
  const UNMAPPED_COLUMN = (value: string) => ({
    componentName: 'TEST-RESCUE-1',
    description: 'N-Channel MOSFET',
    datasheetUrl: '',
    category: {
      c1: { name: 'Discrete Semiconductors' },
      c2: { name: 'Transistors' },
      c3: { name: 'MOSFET' },
    },
    // No dictionary entry — falls through to the rescued path. This is the
    // LIVE spelling from Siliup's source file.
    parameters: [{ name: '导通电阻(RDS(on))', value }],
  });

  it.each([
    ['80mΩ@10V', 0.08],
    ['+15 ppm', 15],
    ['4010 PF', 4010],
    ['275 KHz', 275000],
    ['8 mm', 8],
  ])('%s produces the same stored number in BOTH copies', (value, expected) => {
    const model = UNMAPPED_COLUMN(value);

    const ts = mapAtlasModel(model as Parameters<typeof mapAtlasModel>[0], 'TestMfr', 'test.json');
    const tsEntry = ts.parameters.find((p) => p.parameterId === 'rds_on');

    const mjs = mapModel(model, 'TestMfr', 'test.json').parameters;
    const mjsEntry = mjs.rds_on;

    expect(tsEntry).toBeDefined();
    expect(mjsEntry).toBeDefined();
    // Compare KEY and VALUE, not just the number: a rescued value that landed
    // under a different key with the right number would otherwise pass.
    expect(mjsEntry.value).toBe(tsEntry!.value);
    expect(tsEntry!.numericValue).toBeCloseTo(expected, 12);
    expect(mjsEntry.numericValue).toBeCloseTo(expected, 12);
  });
});
