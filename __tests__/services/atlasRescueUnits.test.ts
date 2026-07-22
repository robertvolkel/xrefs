/**
 * The rescued-parameter path stores a number WITHOUT scaling it — that was the
 * bug. A value arriving under a column name no dictionary recognises had its
 * number read and its unit ignored: `"80mΩ@10V"` became 80 rather than 0.08,
 * a thousand times too high, in a slot the matching engine scores on
 * (`rds_on`, weight 9, `lte`). Measured over all 429 source files: 153,993
 * values were stored at the wrong scale, 50,521 of them in scoring slots,
 * across 69,639 products.
 *
 * ⚠️ EVERY ALLOWLIST ASSERTION RUNS THROUGH BOTH MAPPER COPIES.
 * The first version of this suite tested only `lib/services/atlasMapper.ts` —
 * the copy with NO runtime callers. Deleting the exclusion loop from
 * `scripts/atlas-ingest.mjs` (the LIVE ingest path) left all 25 tests green
 * while production converted gauss. See [[green-test-must-fail-on-broken-code]].
 *
 * ⚠️⚠️ AN ALLOWLIST IS NOT SELF-VALIDATING. This suite used to assert the
 * property "can never introduce a wrong one" and that property was FALSE: the
 * prefix×atom cross generates `Gs`, which in this corpus is GAUSS, and 229 real
 * values were multiplied by 1e9. The tests all passed because they only ever
 * checked tokens NOT in the allowlist (`ppm`, `pcs`, `mm`) — never an
 * allowlisted token whose meaning is not prefix+atom. The corpus-occurrence
 * audit at the bottom of this file is the fix for that blind spot.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import {
  rescueNumericValue,
  RESCUE_UNIT_EXPONENTS,
  scaleByExponent,
  extractNumericWithPrefix,
  mapAtlasModel,
} from '@/lib/services/atlasMapper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mjs = require('../../scripts/atlas-ingest.mjs');

const SHARED = JSON.parse(
  readFileSync(resolve(process.cwd(), 'lib/services/atlas-rescue-units.json'), 'utf-8'),
) as { prefixes: Record<string, number>; atoms: string[]; excluded: string[] };

/**
 * THE MECHANISM. Every allowlist assertion below runs against both copies, so a
 * one-sided edit fails. `impls[1]` is the live ingest path.
 */
const impls: Array<[string, (v: string) => number | undefined]> = [
  ['atlasMapper.ts (TS)', rescueNumericValue],
  ['atlas-ingest.mjs (LIVE)', mjs.rescueNumericValue],
];
const maps: Array<[string, ReadonlyMap<string, number>]> = [
  ['atlasMapper.ts (TS)', RESCUE_UNIT_EXPONENTS],
  ['atlas-ingest.mjs (LIVE)', mjs.RESCUE_UNIT_EXPONENTS],
];

describe.each(impls)('%s — the bug this fixes', (_label, rescue) => {
  /**
   * The exact production value. Siliup/SP40N25TQ ships the column
   * 导通电阻(RDS(on)) = "80mΩ@10V", which slugs onto `rds_on` — a weight-9
   * `lte` rule — and matchingEngine.ts:23 returns a stored numericValue
   * verbatim, with no re-parse and no unit check.
   */
  it('scales the production value that caused this: 80mΩ → 0.08 Ω', () => {
    expect(rescue('80mΩ@10V')).toBe(0.08);
  });

  it('reads the unit from the VALUE STRING, not from a dictionary', () => {
    expect(rescue('80mΩ@10V')).not.toBe(80);
  });
});

describe.each(impls)('%s — GAUSS and the mis-cased seconds', (_label, rescue) => {
  /**
   * ⚠️ THE REGRESSION THIS SUITE EXISTS TO PREVENT.
   * `Gs` is gauss (magnetic flux density), not giga-second. 229 real values
   * across HXYMOS 磁工作点/磁释放点, Dowaytech 工作磁场范围 and ElecSuper.
   */
  it.each([
    ['70 Gs～400 Gs', 70, 'gauss on a Hall-effect sensor, NOT giga-second'],
    ['±35GS', 35, 'gauss, uppercase-S spelling'],
    ['20Gs', 20, 'gauss'],
    ['12 Ms', 12, 'mis-cased millisecond, NOT mega-second'],
    ['30 Ks', 30, 'mis-cased kilosecond'],
    ['80 MS', 80, 'mega-siemens vs mis-cased ms — ambiguous'],
    ['1MH', 1, 'a MHz typo; mega-henry is not a real component value'],
  ])('%s stays %p — %s', (input, expected) => {
    expect(rescue(input)).toBe(expected);
  });

  /**
   * ⚠️ CASE-SENSITIVITY TRAP. Excluding `MH` must not touch `mH`. Getting this
   * wrong silently breaks 133 real millihenry values while "fixing" mega-henry.
   */
  it.each([
    ['20mH', 0.02, 'millihenry — 133 real values'],
    ['5ms', 0.005, 'millisecond'],
    ['1 mS', 0.001, 'millisiemens'],
    ['17 nS', 1.7e-8, 'nanosiemens'],
    ['3 ks', 3000, 'kilosecond'],
    ['1GΩ', 1e9, 'gigaohm — 689 real values'],
    ['1GHz', 1e9, 'gigahertz — 359 real values'],
  ])('%s still converts to %p — %s', (input, expected) => {
    expect(rescue(input)).toBe(expected);
  });
});

describe.each(impls)('%s — unrecognised units are left EXACTLY as they are', (_label, rescue) => {
  it('ppm is not pico — the most common way to get this wrong', () => {
    expect(rescue('+15 ppm')).toBe(15);
    expect(rescue('5ppm/℃')).toBe(5);
  });

  it('pcs is not pico either (11,254 values corpus-wide)', () => {
    expect(rescue('10000 pcs')).toBe(10000);
  });

  it.each([
    ['nV/√Hz', '4.5 nV/√Hz', 4.5],
    ['mW/sr', '200 mW/sr', 200],
    ['Mbit', '4 Mbit', 4],
    ['mil', '31 mil', 31],
  ])('composite/unknown token %s is untouched', (_t, input, expected) => {
    expect(rescue(input)).toBe(expected);
  });

  it('a bare prefix letter with no unit is NOT treated as a prefix', () => {
    expect(rescue('5 m')).toBe(5);
    expect(rescue('3 K')).toBe(3);
  });

  it('mm is millimetre — protected by the allowlist, not by an exclusion entry', () => {
    expect(SHARED.excluded).not.toContain('mm');
    expect(rescue('8.3 mm')).toBe(8.3);
  });

  it('a value with no number returns undefined, not zero', () => {
    expect(rescue('N/A')).toBeUndefined();
  });

  it('a legitimate zero survives (not swallowed by a truthiness check)', () => {
    expect(rescue('0 mΩ')).toBe(0);
  });
});

/**
 * Exponents, not multipliers: `9 * 1e-3` is 0.009000000000000001 but `9 / 1000`
 * is exactly 0.009. `evaluateThreshold` compares with bare `>=`/`<=` and NO
 * epsilon, so that dust hard-FAILS a candidate identical to the source.
 */
describe.each(impls)('%s — scaled values are bit-exact', (_label, rescue) => {
  it.each([
    ['9mΩ', 0.009],
    ['4.5 nV', 4.5e-9],
    ['700nA', 7e-7],
    ['10 uF', 1e-5],
    ['47 nF', 4.7e-8],
    ['4010 pF', 4.01e-9],
  ])('%s === %p exactly, not merely close', (input, expected) => {
    expect(rescue(input)).toBe(expected);
  });

  /**
   * The end-to-end case: a source written '0.009 Ω' and a candidate written
   * '9mΩ' are the same resistance. Under multiplication they differed by
   * 1.73e-18 and the weight-9 `lte` rule returned a HARD FAIL.
   */
  it('a prefixed value equals the same quantity written without a prefix', () => {
    const viaPrefix = rescue('9mΩ');
    const plain = extractNumericWithPrefix('0.009 Ω').numericValue;
    expect(viaPrefix).toBe(plain);
  });
});

describe.each(maps)('%s — the allowlist table', (_label, map) => {
  it('converts every prefix × atom combination it declares', () => {
    for (const [prefix, exp] of Object.entries(SHARED.prefixes)) {
      for (const atom of SHARED.atoms) {
        const token = prefix + atom;
        if (SHARED.excluded.includes(token)) continue;
        expect(map.get(token)).toBe(exp);
      }
    }
  });

  it('is built from the shared file, not a hand-typed copy', () => {
    const expected =
      Object.keys(SHARED.prefixes).length * SHARED.atoms.length -
      SHARED.excluded.filter((t) => SHARED.prefixes[t[0]] !== undefined && SHARED.atoms.includes(t.slice(1)))
        .length;
    expect(map.size).toBe(expected);
  });

  it('drops every excluded token', () => {
    for (const token of SHARED.excluded) expect(map.has(token)).toBe(false);
  });

  it('does NOT case-fold prefixes — PF stays out, on purpose', () => {
    expect(map.has('PF')).toBe(false);
  });

  /**
   * ⚠️ THIS ASSERTION WAS INVERTED, DELIBERATELY. It used to read
   * `expect(SHARED.prefixes['μ']).toBeUndefined()` — correct at the time, because
   * `extractNumericWithPrefix`'s character class accepted the MICRO SIGN (U+00B5)
   * but not GREEK SMALL LETTER MU (U+03BC), so the extractor could never hand the
   * allowlist a μ-token and listing one would have been dead weight.
   *
   * That was the bug, not the design: "800μA" parsed to `{ numericValue: 800 }`
   * with NO unit and was stored as 800 amps — a million times too large, in slots
   * the engine scores on (1,242 `inductance` values had a 10 μH part stored as
   * 10 H). The character class now accepts U+03BC, so the extractor CAN produce
   * μ-tokens and the allowlist MUST carry the prefix or the rescued path would
   * parse the unit and then silently decline to scale it.
   *
   * Both spellings must stay, mapping to the same exponent — real vendor data
   * uses both, sometimes in the same file.
   */
  it('lists BOTH micro spellings, now that the extractor can produce either', () => {
    expect(SHARED.prefixes['μ']).toBe(-6);   // U+03BC GREEK SMALL LETTER MU
    expect(SHARED.prefixes['µ']).toBe(-6);   // U+00B5 MICRO SIGN
  });
});

describe('the two copies agree, token for token', () => {
  it('every generated token maps to the same exponent in both', () => {
    expect(mjs.RESCUE_UNIT_EXPONENTS.size).toBe(RESCUE_UNIT_EXPONENTS.size);
    for (const [token, exp] of RESCUE_UNIT_EXPONENTS) {
      expect(mjs.RESCUE_UNIT_EXPONENTS.get(token)).toBe(exp);
    }
  });

  /**
   * ⚠️ THIS BLOCK PINS THE WIRING, not the helper.
   * `rescueNumericValue` can be perfectly correct while `storeRawValue` fails to
   * call it — which is the original bug. Reverting the live path to bare
   * `extractNumeric` leaves every direct-call assertion above green, so these
   * full-mapper cases are the only thing that fails.
   */
  const mosfetWith = (name: string, value: string) => ({
    componentName: 'TEST-RESCUE-1',
    description: 'N-Channel MOSFET',
    datasheetUrl: '',
    category: {
      c1: { name: 'Discrete Semiconductors' },
      c2: { name: 'Transistors' },
      c3: { name: 'MOSFET' },
    },
    parameters: [{ name, value }],
  });

  it.each([
    ['导通电阻(RDS(on))', '80mΩ@10V', 'rds_on', 0.08, 'scaled through storeRawValue'],
    ['导通电阻(RDS(on))', '9mΩ', 'rds_on', 0.009, 'bit-exact through storeRawValue'],
    ['磁工作点', '30GS', '磁工作点', 30, 'gauss NOT scaled, end to end'],
    ['测试参数', '+15 ppm', '测试参数', 15, 'unrecognised token untouched, end to end'],
  ])('%s = %s stores %s = %p (%s)', (col, value, key, expected) => {
    const model = mosfetWith(col, value);
    const ts = mapAtlasModel(model as Parameters<typeof mapAtlasModel>[0], 'TestMfr', 'test.json');
    const tsEntry = ts.parameters.find((p) => p.parameterId === key);
    const mjsEntry = mjs.mapModel(model, 'TestMfr', 'test.json').parameters[key];

    expect(tsEntry).toBeDefined();
    expect(mjsEntry).toBeDefined();
    // Compare KEY and VALUE across copies, not just the number — a value that
    // landed under a different key with the right number would otherwise pass.
    expect(mjsEntry.value).toBe(tsEntry!.value);
    expect(tsEntry!.numericValue).toBe(expected);
    expect(mjsEntry.numericValue).toBe(expected);
  });
});

describe('scaleByExponent', () => {
  /**
   * Measured over 339,490 real conversions: multiply is 20.43% inexact, divide
   * 2.49%, decimal shift 0.00%. Both alternatives are pinned below so nobody
   * "simplifies" this back into float arithmetic.
   */
  it.each([
    [9, -3, 0.009],
    [244.6, -3, 0.2446],
    [97.4, -3, 0.0974],
    [4.5, -9, 4.5e-9],
    [4010, -12, 4.01e-9],
    [275, 3, 275000],
    [1, 9, 1e9],
    [0, -3, 0],
    [-5, -3, -0.005],
  ])('scaleByExponent(%p, %p) === %p exactly', (v, e, want) => {
    expect(scaleByExponent(v, e)).toBe(want);
  });

  it('beats both float alternatives on the cases they each get wrong', () => {
    expect(9 * 1e-3).not.toBe(0.009); // multiply is wrong here
    expect(244.6 / 1e3).not.toBe(0.2446); // divide is wrong here
    expect(scaleByExponent(9, -3)).toBe(0.009); // shift is right on both
    expect(scaleByExponent(244.6, -3)).toBe(0.2446);
  });

  /**
   * A value JS already renders exponentially would build "1e-7e-3", which parses
   * to NaN. Zero occurrences across 339,490 corpus conversions, but a supplier
   * shipping "0.0000001 V" would hit it, so the fallback is real code.
   */
  it('falls back safely for an exponentially-rendered value', () => {
    expect(String(1e-7)).toContain('e');
    expect(scaleByExponent(1e-7, -3)).toBeCloseTo(1e-10, 20);
    expect(Number.isNaN(scaleByExponent(1e-7, -3))).toBe(false);
  });
});

/**
 * ⚠️ THE AUDIT THAT WAS MISSING — and the reason gauss shipped.
 *
 * The original exclusion list guarded `MS`/`KS`, which occur ZERO times in the
 * corpus, while `Gs` (229 occurrences) was never checked. Hypothetical
 * collisions were reasoned about; real ones were not measured.
 *
 * This test enumerates every allowlisted token that ACTUALLY OCCURS in
 * data/atlas/*.json and asserts each one has been explicitly acknowledged. Add
 * an atom or a prefix and this fails until a human has looked at what the cross
 * newly admits — which is the only thing that would have caught gauss.
 */
describe('every allowlisted token that occurs in the corpus is accounted for', () => {
  /**
   * The 54 tokens that occur in the corpus today, each checked against a real
   * sample value. Adding an entry here is the deliberate human step.
   *
   * Two were genuinely surprising and are recorded so nobody re-litigates them:
   *  - `MW` (2x) is `insulation_resistance = "100 MW"` — that is 100 MEGAOHM
   *    with Ω mangled to W by an encoding fault, not megawatt. Mega is mega
   *    either way, so 1e8 Ω is the right number.
   *  - `mS`/`uS`/`nS`/`µS` are ambiguous siemens-vs-seconds, but the prefix
   *    multiplier is identical under either reading, so the stored number is
   *    correct regardless.
   *
   * The nine `μ`-prefixed (U+03BC) tokens were added when the extractor was
   * taught to read Greek mu. Each was checked against a real sample and each is
   * unambiguously micro+unit:
   *   μA 21807 "800μA" · μs 4892 "2μs" · μH 4207 "22μH" · μW 285 "10μW"
   *   μV 159 "2μV" · μF 76 "1000μF" · μS 56 "20μS" · μC 25 "1.1 μC" · μΩ 4 "500μΩ"
   * `μS` carries the same siemens-vs-seconds ambiguity as its siblings above
   * (the sample is a rise/fall time, so seconds) and is safe for the same reason.
   *
   * ⚠️ These differ in kind from `Gs`/gauss, which is why they are admissible.
   * Gauss was wrong because `G` was being read as a PREFIX when it was part of
   * the unit's name, so the multiplier itself was wrong by 1e9. Here `μ` is
   * unambiguously the micro prefix in every observed token, so 1e-6 is right even
   * where the ATOM is misread. Ambiguity in the atom is harmless; ambiguity in
   * the prefix is what corrupts data.
   */
  const ACKNOWLEDGED = new Set([
    'mA', 'mΩ', 'pF', 'uA', 'mV', 'mW', 'ns', 'MHz', 'nH', 'kV', 'nC', 'nA', 'MΩ',
    'uH', 'nF', 'kΩ', 'nS', 'µA', 'uF', 'kHz', 'ms', 'us', 'KΩ', 'kW', 'mJ', 'KHz',
    'kA', 'µF', 'KV', 'ps', 'pA', 'GHz', 'GΩ', 'µs', 'KA', 'mH', 'uC', 'uV', 'mF',
    'µV', 'pC', 'KW', 'mS', 'uS', 'uW', 'µH', 'µW', 'µS', 'uJ', 'nW', 'mC', 'MW',
    'µC', 'kJ',
    // Greek mu (U+03BC) — see the block comment above; each checked individually.
    'μA', 'μs', 'μH', 'μW', 'μV', 'μF', 'μS', 'μC', 'μΩ',
  ]);

  it('finds no unreviewed token in 429 real source files', () => {
    const dir = resolve(process.cwd(), 'data/atlas');
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return; // corpus not present in this checkout — nothing to audit
    }
    if (files.length === 0) return;

    const seen = new Map<string, { n: number; sample: string }>();
    for (const f of files) {
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(resolve(dir, f), 'utf-8'));
      } catch {
        continue;
      }
      const r = raw as { models?: unknown[]; data?: unknown[] };
      const models = r.models ?? r.data ?? (Array.isArray(raw) ? (raw as unknown[]) : []);
      if (!Array.isArray(models)) continue;
      for (const m of models as Array<{ parameters?: Array<{ value?: unknown }> }>) {
        for (const p of m.parameters ?? []) {
          const { parsedUnit } = extractNumericWithPrefix(String(p.value ?? ''));
          if (!parsedUnit || !RESCUE_UNIT_EXPONENTS.has(parsedUnit)) continue;
          if (!seen.has(parsedUnit)) seen.set(parsedUnit, { n: 0, sample: String(p.value) });
          seen.get(parsedUnit)!.n++;
        }
      }
    }

    const unreviewed = [...seen.entries()]
      .filter(([t]) => !ACKNOWLEDGED.has(t))
      .sort((a, b) => b[1].n - a[1].n)
      .map(([t, v]) => `${t} (${v.n}x, e.g. ${JSON.stringify(v.sample)})`);

    // If this fails, a token the cross generates is live in real data and nobody
    // has confirmed it means prefix+unit. `Gs` failed exactly here.
    expect(unreviewed).toEqual([]);
  });
});
