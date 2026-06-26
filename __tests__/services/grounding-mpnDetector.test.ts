import { emptyVerifiedSet, extendVerifiedSet } from '@/lib/services/grounding/verifiedSet';
import { detectUnverifiedMpns } from '@/lib/services/grounding/mpnDetector';

// Small hand-built vocabulary + patterns so these tests pin the DETECTION LOGIC
// precisely (the real vocabulary is exercised in the nonMpnVocabulary suite).
const vocabulary = new Set<string>([
  'x7r', 'c0g', 'sot-23-5', 'aec-q101', 'package', 'voltage', 'replacement',
]);
const familyPatterns = [/^bc\d/, /^max\d/, /^2n\d/, /^74[a-z]+\d/];
const opts = { vocabulary, familyPatterns };

describe('detectUnverifiedMpns — does not flag legitimate text', () => {
  const verified = extendVerifiedSet(emptyVerifiedSet(), {
    catalogParts: [{ mpn: 'BC847BLT1G' }, { mpn: 'BC846BW,115' }],
    userMpns: ['XYZ123'],
  });

  it('leaves a VERIFIED part referenced in prose alone', () => {
    const found = detectUnverifiedMpns('The BC847BLT1G is your closest match.', verified, opts);
    expect(found).toHaveLength(0);
  });

  it('matches a packaging variant of a verified part (BC846BW vs BC846BW,115)', () => {
    const found = detectUnverifiedMpns('Consider the BC846BW instead.', verified, opts);
    expect(found).toHaveLength(0);
  });

  it('does not flag a user-typed part the user themselves named', () => {
    const found = detectUnverifiedMpns('Comparing XYZ123 to the others.', verified, opts);
    expect(found).toHaveLength(0);
  });

  it('does not flag electronics vocabulary (dielectric/package/standard codes)', () => {
    const found = detectUnverifiedMpns(
      'An X7R or C0G dielectric in a SOT-23-5 package, AEC-Q101 qualified.',
      verified,
      opts,
    );
    expect(found).toHaveLength(0);
  });

  it('does not flag spec value tokens or bare numbers', () => {
    const found = detectUnverifiedMpns('Rated 45V, 4.7uF, 100ppm, 2512 case.', verified, opts);
    expect(found).toHaveLength(0);
  });

  it('does not flag ordinary words', () => {
    const found = detectUnverifiedMpns('This replacement is available and active.', verified, opts);
    expect(found).toHaveLength(0);
  });
});

describe('detectUnverifiedMpns — flags fabrications', () => {
  const verified = extendVerifiedSet(emptyVerifiedSet(), {
    catalogParts: [{ mpn: 'BC847BLT1G' }],
  });

  it('flags an unverified token matching a known MPN family as HIGH', () => {
    const found = detectUnverifiedMpns('You could also use the MAX9988 here.', verified, opts);
    expect(found).toHaveLength(1);
    expect(found[0].token).toBe('MAX9988');
    expect(found[0].confidence).toBe('high');
    expect(found[0].reason).toBe('known-MPN-family');
  });

  it('flags an unverified, structurally MPN-shaped token as MEDIUM', () => {
    const found = detectUnverifiedMpns('A part like ZQX4410K might fit.', verified, opts);
    expect(found).toHaveLength(1);
    expect(found[0].token).toBe('ZQX4410K');
    expect(found[0].confidence).toBe('medium');
  });

  it('reports the character offset of the flagged token', () => {
    const text = 'Try the MAX9988 part.';
    const found = detectUnverifiedMpns(text, verified, opts);
    expect(text.slice(found[0].index, found[0].index + found[0].token.length)).toBe('MAX9988');
  });

  it('flags a fabricated sibling of a verified family (BC847 verified, BC848XY not)', () => {
    const found = detectUnverifiedMpns('The BC848XYZ is similar.', verified, opts);
    expect(found).toHaveLength(1);
    expect(found[0].confidence).toBe('high');
  });
});
