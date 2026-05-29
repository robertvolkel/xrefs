import {
  normalizeParamKey,
  levenshteinDistance,
  isAsciiOnly,
  isFuzzyMatch,
} from '@/lib/services/paramNameSimilarity';

describe('normalizeParamKey', () => {
  it('lowercases', () => {
    expect(normalizeParamKey('Voltage')).toBe('voltage');
  });
  it('collapses whitespace and punctuation to underscores', () => {
    expect(normalizeParamKey('T(mm)')).toBe('t_mm');
    expect(normalizeParamKey('T (mm)')).toBe('t_mm');
    expect(normalizeParamKey('t(mm)')).toBe('t_mm');
  });
  it('treats full-width and half-width parens the same way (via collapse)', () => {
    expect(normalizeParamKey('电压(V)')).toBe('电压_v');
    expect(normalizeParamKey('电压（V）')).toBe('电压_v');
  });
  it('preserves CJK characters', () => {
    expect(normalizeParamKey('输入侧VCC电压(Max)(V)')).toBe('输入侧vcc电压_max_v');
    expect(normalizeParamKey('输出侧VCC电压(Max)(V)')).toBe('输出侧vcc电压_max_v');
  });
  it('does NOT collapse input-side vs output-side CJK params to the same key', () => {
    // This is the historical regression we explicitly defend against.
    const a = normalizeParamKey('输入侧VCC电压(Max)(V)');
    const b = normalizeParamKey('输出侧VCC电压(Max)(V)');
    expect(a).not.toBe(b);
  });
  it('keeps unit suffix in the key (V vs mV must stay distinct)', () => {
    expect(normalizeParamKey('电压(V)')).not.toBe(normalizeParamKey('电压(mV)'));
  });
  it('strips leading/trailing underscores', () => {
    expect(normalizeParamKey('  voltage  ')).toBe('voltage');
    expect(normalizeParamKey('_voltage_')).toBe('voltage');
  });
});

describe('isAsciiOnly', () => {
  it('true for pure ASCII', () => {
    expect(isAsciiOnly('vcc_max_v')).toBe(true);
    expect(isAsciiOnly('propagation_delay')).toBe(true);
    expect(isAsciiOnly('')).toBe(true);
  });
  it('false for CJK', () => {
    expect(isAsciiOnly('电压')).toBe(false);
    expect(isAsciiOnly('vcc_电压')).toBe(false);
  });
  it('false for Greek / Cyrillic / accented Latin', () => {
    expect(isAsciiOnly('Ω')).toBe(false);
    expect(isAsciiOnly('μs')).toBe(false);
    expect(isAsciiOnly('résistance')).toBe(false);
  });
});

describe('levenshteinDistance', () => {
  it('zero for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });
  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });
  it('single substitution', () => {
    expect(levenshteinDistance('propagation', 'propogation')).toBe(1);
  });
  it('single insertion', () => {
    expect(levenshteinDistance('voltage', 'voltages')).toBe(1);
  });
  it('two substitutions', () => {
    // vcc_max vs vcc_min — positions 5 (a vs i) and 6 (x vs n)
    expect(levenshteinDistance('vcc_max', 'vcc_min')).toBe(2);
  });
});

describe('isFuzzyMatch', () => {
  it('exact match always passes', () => {
    expect(isFuzzyMatch('voltage', 'voltage')).toBe(true);
    expect(isFuzzyMatch('电压', '电压')).toBe(true);
  });
  it('catches ASCII single-char typos at len ≥ 5', () => {
    expect(isFuzzyMatch('propagation', 'propogation')).toBe(true);
    expect(isFuzzyMatch('settings', 'setting')).toBe(true);
  });
  it('refuses to fuzzy-match opposite-pair ASCII keys (Levenshtein 2)', () => {
    // The critical safety case: vcc_max vs vcc_min must NOT cluster.
    expect(isFuzzyMatch('vcc_max', 'vcc_min')).toBe(false);
  });
  it('refuses to fuzzy-match short ASCII keys', () => {
    // Length 4 — too tight for safe fuzzy matching.
    expect(isFuzzyMatch('vmax', 'vmin')).toBe(false);
    expect(isFuzzyMatch('vmax', 'vmix')).toBe(false);
  });
  it('refuses to fuzzy-match CJK keys (semantic weight per code point)', () => {
    // Critical: voltage vs current must NOT cluster despite distance 1.
    expect(isFuzzyMatch('电压_max', '电流_max')).toBe(false);
    expect(isFuzzyMatch('电压', '电流')).toBe(false);
  });
  it('refuses to fuzzy-match mixed CJK + ASCII', () => {
    expect(isFuzzyMatch('vcc_电压', 'vcc_电流')).toBe(false);
  });
  it('refuses when length diff exceeds 1', () => {
    expect(isFuzzyMatch('propagation', 'propa')).toBe(false);
  });
});
