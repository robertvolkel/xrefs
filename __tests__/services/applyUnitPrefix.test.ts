import { _applyUnitPrefixCore, extractNumericWithPrefix, effectiveUnit } from '@/lib/services/atlasMapper';

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
