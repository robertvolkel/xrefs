import {
  extractSpecTokens,
  detectUngroundedSpecValues,
  knownValuesFromAttributes,
  knownValuesFromUserText,
  type KnownSpecValue,
} from '@/lib/services/grounding/specValueDetector';

/**
 * Mutation-grade tests. The riskiest surfaces are (a) the token regex — it must find real
 * value+unit spec claims while NOT firing inside MPNs / size codes / package families, and
 * (b) the CONSERVATIVE grounding rule — a numeric match must REQUIRE unit agreement, because
 * a false "grounded" hides a real fabrication (the dangerous direction).
 */

describe('extractSpecTokens', () => {
  it('parses value + unit with SI prefixes into base SI', () => {
    const byToken = Object.fromEntries(
      extractSpecTokens('50 V, 4.7kΩ, 100mA, 5MHz').map((t) => [t.token.replace(/\s/g, ''), t]),
    );
    expect(byToken['50V'].baseSI).toBeCloseTo(50);
    expect(byToken['50V'].unit).toBe('v');
    expect(byToken['4.7kΩ'].baseSI).toBeCloseTo(4700); // k = 1e3, Ω → ohm
    expect(byToken['4.7kΩ'].unit).toBe('ohm');
    expect(byToken['100mA'].baseSI).toBeCloseTo(0.1); // m = 1e-3
    expect(byToken['5MHz'].baseSI).toBeCloseTo(5e6); // M = 1e6, Hz
    expect(byToken['5MHz'].unit).toBe('hz');
  });

  it('parses a bare percentage', () => {
    const t = extractSpecTokens('up to 90% efficiency');
    expect(t).toHaveLength(1);
    expect(t[0].value).toBe(90);
    expect(t[0].unit).toBe('%');
  });

  it('does NOT fire inside MPNs, size codes, or package families', () => {
    for (const s of ['LM317T', 'SOT-23', '0805 package', 'BC847BLT1G', '1N4148']) {
      expect(extractSpecTokens(s)).toHaveLength(0);
    }
  });

  it('finds multiple tokens in one sentence', () => {
    expect(extractSpecTokens('rated 50 V and 2 A').map((t) => t.unit)).toEqual(['v', 'a']);
  });
});

describe('detectUngroundedSpecValues', () => {
  const known: KnownSpecValue[] = [{ baseSI: 50, unitKey: 'v', display: '50v' }];

  it('grounds a token that matches a known value + unit (no finding)', () => {
    expect(detectUngroundedSpecValues('rated for 50 V', known)).toHaveLength(0);
  });

  it('flags a value+unit not present in the known set (high confidence)', () => {
    const f = detectUngroundedSpecValues('aim for around 12 V input', known);
    expect(f).toHaveLength(1);
    expect(f[0].reason).toBe('value-unit-unverified');
    expect(f[0].confidence).toBe('high');
  });

  it('requires unit agreement — a known 50 V does NOT ground a prose "50 A"', () => {
    const f = detectUngroundedSpecValues('handles 50 A', known);
    expect(f).toHaveLength(1); // fails if the unit-agreement guard is removed
    expect(f[0].unit).toBe('a');
  });

  it('flags a bare percentage as a medium-confidence finding', () => {
    const f = detectUngroundedSpecValues('choose >90% efficiency', known);
    expect(f).toHaveLength(1);
    expect(f[0].reason).toBe('percentage-unverified');
    expect(f[0].confidence).toBe('medium');
  });

  it('grounds via the display-string fallback when the known side has no numericValue', () => {
    const strOnly: KnownSpecValue[] = [{ baseSI: null, unitKey: null, display: '50v' }];
    expect(detectUngroundedSpecValues('the 50 V part', strOnly)).toHaveLength(0);
  });

  it('returns nothing for an empty message', () => {
    expect(detectUngroundedSpecValues('', known)).toEqual([]);
  });
});

describe('known-value builders', () => {
  it('builds known values from part attributes (numericValue + unit + display)', () => {
    const kv = knownValuesFromAttributes([
      [{ numericValue: 50, unit: 'V', value: '50 V' }, { numericValue: 0.8, unit: 'A', value: '0.8 A' }],
      undefined,
      null,
    ]);
    expect(kv).toHaveLength(2);
    expect(kv[0]).toMatchObject({ baseSI: 50, unitKey: 'v', display: '50v' });
  });

  it("treats the user's own stated spec as grounded (assistant echo is not a leak)", () => {
    const userKnown = knownValuesFromUserText('I need a 25 V capacitor');
    expect(detectUngroundedSpecValues('here is a 25 V option', userKnown)).toHaveLength(0);
  });
});
