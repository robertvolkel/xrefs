import { normalizeParamKey, scopeKeyForRow, verdictMapKey, resolveAiVerdict } from '@/lib/services/atlasParamSuggestionTypes';

// These three pure helpers are the JOIN CONTRACT between a stored suggestion
// and a queue row. If they drift from how /suggest stores (familyId +
// normalized paramName) or from normalizeOverrideKey (NFC+lower+trim), verdicts
// silently stop attaching — the counter and Accept pile go quietly wrong. Pin them.
describe('atlasParamSuggestionTypes join helpers', () => {
  it('normalizeParamKey = NFC + lower + trim', () => {
    expect(normalizeParamKey('  VRRM (V) max  ')).toBe('vrrm (v) max');
    expect(normalizeParamKey('Rds(on)')).toBe('rds(on)');
    // NFC composition: decomposed é (e + combining accent) → composed é.
    expect(normalizeParamKey('é')).toBe('é');
  });

  it('scopeKeyForRow prefers dominantFamily, then dominantCategory, then empty', () => {
    expect(scopeKeyForRow({ dominantFamily: 'B5', dominantCategory: 'X' })).toBe('B5');
    expect(scopeKeyForRow({ dominantFamily: null, dominantCategory: 'Microcontrollers' })).toBe('Microcontrollers');
    expect(scopeKeyForRow({ dominantFamily: null, dominantCategory: null })).toBe('');
  });

  it('verdictMapKey composes scope + normalized param with the :: separator', () => {
    expect(verdictMapKey('B5', 'rds(on)')).toBe('B5::rds(on)');
    // Unscoped rows key under an empty family segment (matches /suggest storing '').
    expect(verdictMapKey('', 'foo')).toBe('::foo');
  });

  it('round-trips a row scope + raw param to the same key generation used', () => {
    const row = { dominantFamily: 'B6', dominantCategory: null };
    const raw = '  HFE(min)  ';
    expect(verdictMapKey(scopeKeyForRow(row), normalizeParamKey(raw))).toBe('B6::hfe(min)');
  });
});

// The batches route forces the verdict to 'accept' when High confidence is on
// (a starrable row is an Accept), and validates/defaults the raw param
// otherwise. This is the one branch a stale/broken route would regress silently
// — the queue would either show everything or fall to the legacy full-set path.
describe('resolveAiVerdict', () => {
  it('forces accept when high-confidence is on, regardless of the raw param', () => {
    expect(resolveAiVerdict(null, true)).toBe('accept');
    expect(resolveAiVerdict('all', true)).toBe('accept');
    expect(resolveAiVerdict('defer', true)).toBe('accept');   // high-confidence WINS over a stale param
    expect(resolveAiVerdict('garbage', true)).toBe('accept');
  });

  it('passes through a valid raw verdict when high-confidence is off', () => {
    expect(resolveAiVerdict('accept', false)).toBe('accept');
    expect(resolveAiVerdict('defer', false)).toBe('defer');
    expect(resolveAiVerdict('none', false)).toBe('none');
    expect(resolveAiVerdict('all', false)).toBe('all');
  });

  it('defaults to all for an absent or invalid raw verdict when high-confidence is off', () => {
    expect(resolveAiVerdict(null, false)).toBe('all');
    expect(resolveAiVerdict('', false)).toBe('all');
    expect(resolveAiVerdict('bogus', false)).toBe('all');
  });
});
