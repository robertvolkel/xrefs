/**
 * Permanent regression guard for the connector-abstraction characterization oracle.
 *
 * The oracle's verdict logic used to live only inside scripts/providers-characterize.ts
 * with no test, and it shipped a real bug: two runs that both errored (or both came
 * back empty from an unreachable source) were reported as "✅ IDENTICAL". These tests
 * pin the fixed behavior so it can't silently regress — several assertions here FAIL
 * against that old logic (see the "would have passed under the old bug" cases).
 */

import {
  EMPTY_SENTINEL,
  ERROR_SENTINEL_PREFIX,
  errorSentinel,
  isInconclusive,
  comparableOutput,
  computeDiff,
} from '../../scripts/lib/characterizationCore';

describe('comparableOutput — reached, comparable data vs unreachable/empty', () => {
  it('null (getAttributes could not resolve) is NOT comparable', () => {
    expect(comparableOutput(null)).toBe(false);
    expect(comparableOutput(undefined)).toBe(false);
  });

  it('search: rows are comparable, empty pool is not (a caught error looks identical)', () => {
    expect(comparableOutput({ matches: [{ mpn: 'X' }] })).toBe(true);
    expect(comparableOutput({ type: 'none', matches: [] })).toBe(false);
  });

  it('recommendations: rows are comparable, empty is not', () => {
    expect(comparableOutput({ recommendations: [{ part: {} }] })).toBe(true);
    expect(comparableOutput({ recommendations: [] })).toBe(false);
  });

  it('recommendations take precedence over a nested sourceAttributes.parameters', () => {
    // A RecommendationResult with real recs but an empty source-part param list is
    // still comparable (keyed on recommendations, not the nested parameters).
    expect(comparableOutput({ recommendations: [{ part: {} }], sourceAttributes: { parameters: [] } })).toBe(true);
    // ...and empty recs stay inconclusive even if the nested source part has params.
    expect(comparableOutput({ recommendations: [], sourceAttributes: { parameters: [{ id: 'v' }] } })).toBe(false);
  });

  it('attributes: a NON-null result is comparable even with zero parameters (source resolved it ⇒ reachable)', () => {
    expect(comparableOutput({ part: { mpn: 'X' }, parameters: [{ id: 'v' }] })).toBe(true);
    expect(comparableOutput({ part: { mpn: 'X' }, parameters: [] })).toBe(true); // sparse-but-real
  });

  it('allowEmpty opt-in makes an empty search/recs pool comparable (per-case escape hatch)', () => {
    expect(comparableOutput({ matches: [] }, true)).toBe(true);
    expect(comparableOutput({ recommendations: [] }, true)).toBe(true);
    // null is still not comparable even with allowEmpty (a crash/unresolved is never "expected empty").
    expect(comparableOutput(null, true)).toBe(false);
  });

  it('unknown shapes are assumed comparable (never FALSE-flag real data as empty)', () => {
    expect(comparableOutput({ foo: 1 })).toBe(true);
    expect(comparableOutput(42)).toBe(true);
    expect(comparableOutput('some-string')).toBe(true);
  });
});

describe('isInconclusive / sentinels', () => {
  it('recognizes both sentinels', () => {
    expect(isInconclusive(EMPTY_SENTINEL)).toBe(true);
    expect(isInconclusive(errorSentinel('connect ECONNREFUSED'))).toBe(true);
    expect(isInconclusive(`${ERROR_SENTINEL_PREFIX} anything`)).toBe(true);
  });

  it('real recorded JSON is never inconclusive (no collision with the sentinels)', () => {
    expect(isInconclusive('{\n  "matches": []\n}')).toBe(false);
    expect(isInconclusive('[]')).toBe(false);
    expect(isInconclusive('"null"')).toBe(false);
  });

  it('errorSentinel embeds the message behind the prefix', () => {
    expect(errorSentinel('boom')).toBe('__ERROR__ boom');
    expect(isInconclusive(errorSentinel('boom'))).toBe(true);
  });
});

describe('computeDiff — the verdict that gates every phase', () => {
  const real1 = '{\n  "matches": 1\n}';
  const real2 = '{\n  "parameters": 2\n}';

  it('THE BUG: two runs that both errored are INCONCLUSIVE, never a pass', () => {
    const err = errorSentinel('connect ECONNREFUSED 127.0.0.1:443');
    const out = computeDiff({ a: err, b: err }, { a: err, b: err });
    expect(out.ok).toBe(false); // old logic returned true here — this is the regression guard
    expect(out.inconclusive).toBe(2);
    expect(out.verified).toBe(0);
    expect(out.differing).toBe(0);
  });

  it('THE BUG: two runs that both came back empty are INCONCLUSIVE, never a pass', () => {
    const out = computeDiff({ a: EMPTY_SENTINEL }, { a: EMPTY_SENTINEL });
    expect(out.ok).toBe(false);
    expect(out.inconclusive).toBe(1);
    expect(out.verified).toBe(0);
  });

  it('happy path: identical real data on both sides is a valid proof', () => {
    const out = computeDiff({ a: real1, b: real2 }, { a: real1, b: real2 });
    expect(out.ok).toBe(true);
    expect(out.verified).toBe(2);
    expect(out.inconclusive).toBe(0);
    expect(out.differing).toBe(0);
  });

  it('a genuine difference fails and is reported as differing (not inconclusive)', () => {
    const out = computeDiff({ a: '{"v":1}' }, { a: '{"v":2}' });
    expect(out.ok).toBe(false);
    expect(out.differing).toBe(1);
    const c = out.cases[0];
    expect(c.kind).toBe('differ');
    if (c.kind === 'differ') {
      expect(c.va).toBe('{"v":1}');
      expect(c.vb).toBe('{"v":2}');
    }
  });

  it('mixed real+empty still fails — one dead source blocks the proof', () => {
    const out = computeDiff({ a: real1, b: EMPTY_SENTINEL }, { a: real1, b: EMPTY_SENTINEL });
    expect(out.ok).toBe(false);
    expect(out.verified).toBe(1);
    expect(out.inconclusive).toBe(1);
  });

  it('a case present in only one run is a difference (not silently ignored)', () => {
    const out = computeDiff({ a: real1, extra: real2 }, { a: real1 });
    expect(out.differing).toBe(1);
    expect(out.ok).toBe(false);
    const extra = out.cases.find((c) => c.name === 'extra');
    expect(extra?.kind).toBe('differ');
    if (extra?.kind === 'differ') expect(extra.vb).toBe(''); // missing side normalized to ''
  });

  it('empty inputs (no cases at all) are not a valid proof', () => {
    const out = computeDiff({}, {});
    expect(out.ok).toBe(false);
    expect(out.verified).toBe(0);
  });
});
