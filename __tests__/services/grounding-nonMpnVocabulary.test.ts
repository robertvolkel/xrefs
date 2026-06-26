import {
  buildNonMpnVocabulary,
  DEFAULT_MPN_FAMILY_PATTERNS,
  _resetVocabularyCache,
} from '@/lib/services/grounding/nonMpnVocabulary';
import { emptyVerifiedSet, extendVerifiedSet } from '@/lib/services/grounding/verifiedSet';
import { detectUnverifiedMpns } from '@/lib/services/grounding/mpnDetector';

beforeEach(() => _resetVocabularyCache());

describe('buildNonMpnVocabulary', () => {
  it('derives descriptive attribute words from the logic tables', () => {
    const vocab = buildNonMpnVocabulary();
    // These appear as attribute names across families.
    expect(vocab.has('package')).toBe(true);
    expect(vocab.has('voltage')).toBe(true);
  });

  it('includes dielectric codes (from value hierarchies and the seed)', () => {
    const vocab = buildNonMpnVocabulary();
    expect(vocab.has('x7r')).toBe(true);
    expect(vocab.has('c0g')).toBe(true);
  });

  it('includes seed package codes and qualification standards', () => {
    const vocab = buildNonMpnVocabulary();
    expect(vocab.has('sot-23')).toBe(true);
    expect(vocab.has('aec-q101')).toBe(true);
  });
});

describe('DEFAULT_MPN_FAMILY_PATTERNS', () => {
  const matches = (s: string) => DEFAULT_MPN_FAMILY_PATTERNS.some((p) => p.test(s));

  it('recognizes common part-number families', () => {
    expect(matches('bc847')).toBe(true);
    expect(matches('2n3904')).toBe(true);
    expect(matches('74hc04')).toBe(true);
    expect(matches('max485')).toBe(true);
  });

  it('does not match ordinary vocabulary words', () => {
    expect(matches('package')).toBe(false);
    expect(matches('capacitance')).toBe(false);
  });
});

describe('integration: detector with the real vocabulary', () => {
  it('keeps real electronics terms safe while flagging a fabricated part', () => {
    const vocab = buildNonMpnVocabulary();
    const verified = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'BC847BLT1G' }],
    });
    const text =
      'The BC847BLT1G in an X7R-adjacent SOT-23 package is AEC-Q101 rated; ' +
      'avoid the MAX9988 unless verified.';
    const found = detectUnverifiedMpns(text, verified, {
      vocabulary: vocab,
      familyPatterns: DEFAULT_MPN_FAMILY_PATTERNS,
    });
    // Only the fabricated MAX9988 should surface — not the verified part or the
    // package/dielectric/standard vocabulary.
    expect(found.map((f) => f.token)).toEqual(['MAX9988']);
  });
});
