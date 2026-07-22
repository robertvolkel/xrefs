import { _applyUnitPrefixCore, extractNumericWithPrefix, effectiveUnit } from '@/lib/services/atlasMapper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyUnitPrefix: mjsApplyUnitPrefix } = require('../../scripts/atlas-ingest.mjs');

describe('_applyUnitPrefixCore — SI prefix conversion to base SI units', () => {
  describe('SI prefixes apply correctly', () => {
    it('converts kHz → Hz (×1e3)', () => {
      expect(_applyUnitPrefixCore(150, 'kHz')).toBe(150_000);
      expect(_applyUnitPrefixCore(1.5, 'KHz')).toBe(1_500);
    });

    it('converts MHz → Hz (×1e6)', () => {
      expect(_applyUnitPrefixCore(1.5, 'MHz')).toBe(1_500_000);
    });

    it('converts GHz → Hz (×1e9)', () => {
      expect(_applyUnitPrefixCore(2.4, 'GHz')).toBe(2_400_000_000);
    });

    it('converts mA → A (×1e-3)', () => {
      expect(_applyUnitPrefixCore(250, 'mA')).toBeCloseTo(0.25, 9);
    });

    it('converts µF → F (×1e-6) — both micro-sign U+00B5 and Greek mu U+03BC', () => {
      expect(_applyUnitPrefixCore(10, 'µF')).toBeCloseTo(1e-5, 12);  // µ = U+00B5 (micro sign)
      expect(_applyUnitPrefixCore(10, 'μF')).toBeCloseTo(1e-5, 12);  // μ = U+03BC (Greek small mu) — common in Atlas data
      expect(_applyUnitPrefixCore(10, 'uF')).toBeCloseTo(1e-5, 12);  // u = ASCII fallback
    });

    it('converts nV → V (×1e-9)', () => {
      expect(_applyUnitPrefixCore(5, 'nV/√Hz')).toBeCloseTo(5e-9, 15);
    });

    it('converts pF → F (×1e-12)', () => {
      expect(_applyUnitPrefixCore(22, 'pF')).toBeCloseTo(22e-12, 15);
    });

    it('converts Mbps → bps (×1e6)', () => {
      expect(_applyUnitPrefixCore(10, 'Mbps')).toBe(10_000_000);
    });

    it('converts kΩ → Ω (×1e3)', () => {
      expect(_applyUnitPrefixCore(4.7, 'kΩ')).toBeCloseTo(4_700, 6);
    });
  });

  describe('non-prefix units pass through unchanged', () => {
    it('V is unchanged (does not start with SI prefix)', () => {
      expect(_applyUnitPrefixCore(3.3, 'V')).toBe(3.3);
    });

    it('A is unchanged', () => {
      expect(_applyUnitPrefixCore(5, 'A')).toBe(5);
    });

    it('Ω is unchanged', () => {
      expect(_applyUnitPrefixCore(100, 'Ω')).toBe(100);
    });

    it('°C is unchanged', () => {
      expect(_applyUnitPrefixCore(-55, '°C')).toBe(-55);
    });

    it('% is unchanged', () => {
      expect(_applyUnitPrefixCore(5, '%')).toBe(5);
    });

    it('ppm/°C is unchanged (starts with p, but p prefix means pico — known limitation)', () => {
      // Note: ppm/°C starts with 'p' which the helper treats as pico — this
      // is a known false-positive. Engineer must NOT set unit='ppm/°C' on a
      // dict mapping; use 'ppm' or leave unit unset. Test documents behavior.
      expect(_applyUnitPrefixCore(5, 'ppm/°C')).toBeCloseTo(5e-12, 15);
    });
  });

  describe('guarded compound units (mm, MSL, no)', () => {
    it('mm is unchanged (length, not milli-units)', () => {
      expect(_applyUnitPrefixCore(8.3, 'mm')).toBe(8.3);
    });

    it('MSL is unchanged (moisture sensitivity level, not mega-units)', () => {
      expect(_applyUnitPrefixCore(3, 'MSL')).toBe(3);
    });

    it('no/none/number is unchanged (count, not nano)', () => {
      expect(_applyUnitPrefixCore(10, 'no')).toBe(10);
      expect(_applyUnitPrefixCore(10, 'none')).toBe(10);
    });
  });

  describe('edge cases', () => {
    it('returns undefined for undefined numericValue', () => {
      expect(_applyUnitPrefixCore(undefined, 'kHz')).toBeUndefined();
    });

    it('returns numericValue unchanged for undefined unit', () => {
      expect(_applyUnitPrefixCore(150, undefined)).toBe(150);
    });

    it('returns numericValue unchanged for empty unit', () => {
      expect(_applyUnitPrefixCore(150, '')).toBe(150);
    });

    it('returns NaN unchanged', () => {
      expect(_applyUnitPrefixCore(NaN, 'kHz')).toBeNaN();
    });

    it('preserves zero', () => {
      expect(_applyUnitPrefixCore(0, 'kHz')).toBe(0);
    });

    it('handles negative values (e.g. operating temp min)', () => {
      expect(_applyUnitPrefixCore(-40, 'mA')).toBeCloseTo(-0.04, 9);
    });

    it('uppercase K is treated as kilo (matches Digikey convention)', () => {
      expect(_applyUnitPrefixCore(10, 'Kohm')).toBe(10_000);
    });
  });

  /**
   * Every token below is REAL — counts are occurrences across all 429 files in
   * data/atlas/. This suite had 43 cases and covered only uppercase 'K', which
   * is exactly how "4010 PF" shipped storing 4010 instead of 4.01e-9.
   */
  describe('wrong-case SI prefixes — whole token must be a unit, never a first letter', () => {
    it('converts PF → F, the token that exposed this (1,989 values in the corpus)', () => {
      // data/atlas/mfr_389_AK_奥科_params.json, model AK4080: "4010 PF".
      expect(_applyUnitPrefixCore(4010, 'PF')).toBeCloseTo(4.01e-9, 15);
    });

    it('converts the remaining genuine cased tokens: UA, PA, Ps, Us', () => {
      expect(_applyUnitPrefixCore(72, 'UA')).toBeCloseTo(7.2e-5, 12);   // microamp, 72x
      expect(_applyUnitPrefixCore(18, 'PA')).toBeCloseTo(1.8e-11, 18);  // picoamp, 18x
      expect(_applyUnitPrefixCore(5, 'Ps')).toBeCloseTo(5e-12, 18);     // picosecond, 5x
      expect(_applyUnitPrefixCore(2, 'Us')).toBeCloseTo(2e-6, 12);      // microsecond, 2x
    });

    /**
     * ⚠️ THE POINT OF THE WHOLE FIX. Case-insensitive prefix matching would
     * "convert" every one of these. Counts are real; 'Pin' alone is 14,840.
     */
    it('refuses tokens whose remainder is not a unit — Pin, Pcs, PPM, PWM, PHONE', () => {
      expect(_applyUnitPrefixCore(8, 'Pin')).toBe(8);       // pin count, 14,840x
      expect(_applyUnitPrefixCore(100, 'Pcs')).toBe(100);   // pieces
      expect(_applyUnitPrefixCore(50, 'PPM')).toBe(50);
      expect(_applyUnitPrefixCore(1, 'PWM')).toBe(1);
      expect(_applyUnitPrefixCore(3, 'PHONE')).toBe(3);     // parser junk, still must not convert
      expect(_applyUnitPrefixCore(70, 'UI')).toBe(70);      // 'I' is not a unit atom
    });

    it('refuses a bare capital with no atom after it — P (39,645x), N (7,106x), U', () => {
      expect(_applyUnitPrefixCore(9087, 'P')).toBe(9087);
      expect(_applyUnitPrefixCore(3109, 'N')).toBe(3109);
      expect(_applyUnitPrefixCore(6, 'U')).toBe(6);
    });

    /**
     * 'N' is deliberately absent from the tolerant table. 'Nm' (newton-metre,
     * 342x) outnumbers 'Ns' (nanosecond, 4x) ~85:1 and no lexical rule separates
     * them, so N is refused entirely: loses 8 values, protects 342.
     */
    it('does NOT read Nm as nano-metre — newton-metre outnumbers nanosecond 85:1', () => {
      expect(_applyUnitPrefixCore(342, 'Nm')).toBe(342);
      expect(_applyUnitPrefixCore(4, 'Ns')).toBe(4); // accepted cost of refusing N
    });

    /**
     * 'M' is already mega in the canonical path. Re-reading it as milli would
     * corrupt 9,038 MΩ and 14,681 MHz values that are correct today.
     */
    it('leaves already-correct uppercase prefixes alone — MΩ and MHz stay mega', () => {
      expect(_applyUnitPrefixCore(10, 'MΩ')).toBe(10_000_000);
      expect(_applyUnitPrefixCore(1.5, 'MHz')).toBe(1_500_000);
    });

    it('does not treat F or A as femto/atto — they are farad and amp', () => {
      expect(_applyUnitPrefixCore(10, 'F')).toBe(10);
      expect(_applyUnitPrefixCore(10, 'A')).toBe(10);
      expect(_applyUnitPrefixCore(10, 'FSR')).toBe(10);
    });
  });
});

/**
 * The prefix rule exists in TWO copies: atlasMapper.ts (TS) and
 * scripts/atlas-ingest.mjs (the LIVE ingest path). Comments saying "keep these
 * in lockstep" have drifted before. This block is the mechanism.
 *
 * The token list is not invented — every entry is a real unit string measured
 * across all 429 files in data/atlas/, chosen to cover both sides of the rule.
 */
describe('parity — the TS copy and the LIVE .mjs copy agree on every real token', () => {
  const REAL_CORPUS_TOKENS = [
    // genuine wrong-case prefixes that must convert
    'PF', 'UA', 'PA', 'Ps', 'Us',
    // wrong-case look-alikes that must NOT convert
    'Pin', 'Pins', 'Pcs', 'PCS', 'PPM', 'PWM', 'PFM', 'PHONE', 'UI', 'UIPP',
    'Nm', 'Ns', 'NA', 'N/', 'P/', 'FSR', 'FPS', 'Form', 'General', 'Typ',
    // bare capitals
    'P', 'N', 'U', 'M', 'K', 'F', 'A', 'V', 'W', 'T', 'G',
    // already-correct canonical units that must be untouched by the new path
    'MΩ', 'MHz', 'kHz', 'KHz', 'mΩ', 'mA', 'µF', 'μF', 'uF', 'nF', 'pF',
    'ns', 'µA', 'mV', 'GHz', 'Kohm', 'mm', 'MSL', 'no', '°C', '°C/W', '%',
    'VAC', 'VDC', 'Mbyte', 'Gbps/lane', 'Ksps',
  ];

  it.each(REAL_CORPUS_TOKENS)('agrees on %s', (unit) => {
    expect(mjsApplyUnitPrefix(1, unit)).toBe(_applyUnitPrefixCore(1, unit));
  });

  it('agrees on undefined/empty units and non-numeric input', () => {
    expect(mjsApplyUnitPrefix(1, undefined)).toBe(_applyUnitPrefixCore(1, undefined));
    expect(mjsApplyUnitPrefix(1, '')).toBe(_applyUnitPrefixCore(1, ''));
    expect(mjsApplyUnitPrefix(undefined, 'PF')).toBe(_applyUnitPrefixCore(undefined, 'PF'));
  });
});

describe('extractNumericWithPrefix — value-string parsing (ground truth from vendor)', () => {
  it('parses "400kHz" into 400 + kHz (the EVISUN fsw case that proved the pivot)', () => {
    expect(extractNumericWithPrefix('400kHz')).toEqual({ numericValue: 400, parsedUnit: 'kHz' });
  });

  it('parses "5.8 mΩ" with space + Greek omega', () => {
    expect(extractNumericWithPrefix('5.8 mΩ')).toEqual({ numericValue: 5.8, parsedUnit: 'mΩ' });
  });

  it('parses "100mA" with no space', () => {
    expect(extractNumericWithPrefix('100mA')).toEqual({ numericValue: 100, parsedUnit: 'mA' });
  });

  it('parses "8" (unit-less) returning no parsedUnit', () => {
    expect(extractNumericWithPrefix('8')).toEqual({ numericValue: 8, parsedUnit: undefined });
  });

  it('parses "≤150ns" stripping comparison prefix', () => {
    expect(extractNumericWithPrefix('≤150ns')).toEqual({ numericValue: 150, parsedUnit: 'ns' });
  });

  it('parses "±10V"', () => {
    expect(extractNumericWithPrefix('±10V')).toEqual({ numericValue: 10, parsedUnit: 'V' });
  });

  it('parses "2.7~18V" range — first num, no unit (range bounds ambiguous)', () => {
    expect(extractNumericWithPrefix('2.7~18V')).toEqual({ numericValue: 2.7, parsedUnit: undefined });
  });

  it('parses "8.3 mm" preserving length unit (not milli)', () => {
    expect(extractNumericWithPrefix('8.3 mm')).toEqual({ numericValue: 8.3, parsedUnit: 'mm' });
  });

  it('parses "940nm"', () => {
    expect(extractNumericWithPrefix('940nm')).toEqual({ numericValue: 940, parsedUnit: 'nm' });
  });

  it('parses "1.5MHz"', () => {
    expect(extractNumericWithPrefix('1.5MHz')).toEqual({ numericValue: 1.5, parsedUnit: 'MHz' });
  });

  it('returns empty for "N/A", "-", empty string', () => {
    expect(extractNumericWithPrefix('N/A')).toEqual({});
    expect(extractNumericWithPrefix('-')).toEqual({});
    expect(extractNumericWithPrefix('')).toEqual({});
  });

  it('parses negative numbers', () => {
    expect(extractNumericWithPrefix('-40°C')).toEqual({ numericValue: -40, parsedUnit: '°C' });
  });

  it('loose fallback for prefix-junk: "@25°C 100mA" → just the first number, no unit', () => {
    expect(extractNumericWithPrefix('@25°C 100mA')).toEqual({ numericValue: 25 });
  });

  it('loose fallback for "Typ: 1.5MHz" → first number, no unit', () => {
    expect(extractNumericWithPrefix('Typ: 1.5MHz')).toEqual({ numericValue: 1.5 });
  });
});

describe('effectiveUnit — value-string wins over dict declaration', () => {
  it('returns parsedUnit when set (vendor truth)', () => {
    expect(effectiveUnit('kHz', 'MHz')).toBe('kHz');
  });

  it('falls back to dictUnit when parsedUnit absent', () => {
    expect(effectiveUnit(undefined, 'MHz')).toBe('MHz');
  });

  it('returns undefined when neither present', () => {
    expect(effectiveUnit(undefined, undefined)).toBeUndefined();
  });

  it('treats empty string parsedUnit as absent (falls back to dictUnit)', () => {
    expect(effectiveUnit('', 'MHz')).toBe('MHz');
  });
});
