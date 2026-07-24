import {
  extractSpecTokens,
  detectUngroundedSpecValues,
  knownValuesFromAttributes,
  knownValuesFromUserText,
  type KnownSpecValue,
} from '@/lib/services/grounding/specValueDetector';
import { extractNumericValue } from '@/lib/services/digikeyMapper';

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

describe('Fix B — prefixed known units ground a bare token (numeric path, not just display)', () => {
  // Grounds the fixtures in the REAL emitted attribute shape: Digikey stores a base-SI
  // numericValue with the DISPLAY unit still prefixed ('µF', 'mA') — exactly what
  // digikeyParamMap + extractNumericValue produce. The discriminating cases below have
  // display strings that DON'T match (so the string fallback can't save them), only the
  // numeric+unit path can — which was unreachable before the prefix strip.

  it("grounds '0.1 A' against a known '100 mA' (base-SI numeric match; displays differ)", () => {
    const known = knownValuesFromAttributes([
      [{ numericValue: extractNumericValue('100 mA').numericValue, unit: 'mA', value: '100 mA' }],
    ]);
    // BUG: known unitKey 'ma' never equals token unit 'a' → false 'ungrounded' finding.
    expect(detectUngroundedSpecValues('this part is rated 0.1 A', known)).toHaveLength(0);
  });

  it("grounds an ASCII 'uF' echo against a known micro-sign 'µF' (same value, different display)", () => {
    const known = knownValuesFromAttributes([
      [{ numericValue: extractNumericValue('10 µF').numericValue, unit: 'µF', value: '10 µF' }],
    ]);
    expect(detectUngroundedSpecValues('use the 10 uF part', known)).toHaveLength(0);
  });

  it("grounds a 'kHz' known value against a bare-Hz token at the same magnitude", () => {
    const known = knownValuesFromAttributes([
      [{ numericValue: extractNumericValue('100 kHz').numericValue, unit: 'kHz', value: '100 kHz' }],
    ]);
    // 100 kHz = 100000 Hz; the assistant writing "100000 Hz" must ground.
    expect(detectUngroundedSpecValues('runs at 100000 Hz', known)).toHaveLength(0);
  });

  it('still REQUIRES unit agreement after the strip — a known 10 µF does NOT ground a prose 10 µH', () => {
    const known = knownValuesFromAttributes([
      [{ numericValue: extractNumericValue('10 µF').numericValue, unit: 'µF', value: '10 µF' }],
    ]);
    const f = detectUngroundedSpecValues('needs a 10 uH inductor', known);
    expect(f).toHaveLength(1); // farad vs henry stay distinct even once both are prefix-stripped
    expect(f[0].unit).toBe('h');
  });

  it("does NOT mangle a bare 'F'/'s'/'ppm' known unit (no spurious strip)", () => {
    // '5 F' (supercap, no prefix): first char is not a prefix → key stays 'f'.
    const farad = knownValuesFromAttributes([[{ numericValue: 5, unit: 'F', value: '5 F' }]]);
    expect(detectUngroundedSpecValues('a 5 F supercap', farad)).toHaveLength(0);
    // 'ppm' leads with prefix char 'p' but remainder 'pm' is not a unit → key stays 'ppm'.
    const ppm = knownValuesFromAttributes([[{ numericValue: 50, unit: 'ppm', value: '50 ppm' }]]);
    expect(detectUngroundedSpecValues('drift of 50 ppm', ppm)).toHaveLength(0);
  });
});

describe('Fix C — word-form units (volts/amps/watts/…) are recognized and normalized', () => {
  it('extracts word-form units and normalizes them to the symbol key', () => {
    const byUnit = extractSpecTokens(
      '50 volts, 2 amps, 5 amperes, 3 watts, 10 farads, 4 henries, 16 hertz',
    ).map((t) => t.unit);
    // BUG: the symbol-only SPEC_TOKEN found none of these.
    expect(byUnit).toEqual(['v', 'a', 'a', 'w', 'f', 'h', 'hz']);
  });

  it("word-form echo: flagged when ungrounded, grounded once the user stated '50 V'", () => {
    const msg = 'so pick a part rated 50 volts';
    // Extracted at all? On broken (symbol-only) SPEC_TOKEN there's no token → no finding, so
    // asserting a finding against an EMPTY known set is what makes this fail on broken code.
    expect(detectUngroundedSpecValues(msg, [])).toHaveLength(1);
    // And normalizeUnit maps volts→v, so it grounds against the user's "50 V".
    const userKnown = knownValuesFromUserText('I need a 50 V rail');
    expect(detectUngroundedSpecValues(msg, userKnown)).toHaveLength(0);
  });

  it("flags a word-form spec that is NOT grounded (still catches a real leak)", () => {
    const known: KnownSpecValue[] = [{ baseSI: 50, unitKey: 'v', display: '50v' }];
    const f = detectUngroundedSpecValues('aim for 12 volts', known);
    expect(f).toHaveLength(1);
    expect(f[0].unit).toBe('v');
    expect(f[0].reason).toBe('value-unit-unverified');
  });

  it('does NOT fire on ordinary words that merely start like a unit', () => {
    // "5 apples", "5 hens", "5 wide" must not read as amps/henries/watts.
    expect(extractSpecTokens('5 apples, 5 hens, 5 wide, 5 seconds ago')).toHaveLength(0);
  });
});
