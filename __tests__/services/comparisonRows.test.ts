import { buildComparisonRows } from '@/lib/services/comparisonRows';
import { PartAttributes, XrefRecommendation, ParametricAttribute, MatchDetail } from '@/lib/types';

/** Minimal source ParametricAttribute. */
function param(
  parameterId: string,
  value: string,
  sortOrder: number,
  extra: Partial<ParametricAttribute> = {},
): ParametricAttribute {
  return { parameterId, parameterName: parameterId, value, sortOrder, ...extra };
}

/** Minimal matchDetail. */
function md(
  parameterId: string,
  sourceValue: string,
  replacementValue: string,
  extra: Partial<MatchDetail> = {},
): MatchDetail {
  return {
    parameterId,
    parameterName: parameterId,
    sourceValue,
    replacementValue,
    matchStatus: 'exact',
    ...extra,
  };
}

function sourceAttrs(parameters: ParametricAttribute[]): PartAttributes {
  return { parameters } as PartAttributes;
}

function recommendation(matchDetails: MatchDetail[]): XrefRecommendation {
  return { matchDetails } as XrefRecommendation;
}

describe('buildComparisonRows', () => {
  it('unions both directions — every parameterId appears exactly once', () => {
    const source = sourceAttrs([param('A', '10V', 1), param('B', '20V', 2)]);
    const rec = recommendation([
      md('A', '10V', '10V', { matchStatus: 'exact', ruleResult: 'pass' }),
      md('C', 'N/A', 'N/A', { matchStatus: 'different', ruleResult: 'review' }),
    ]);

    const rows = buildComparisonRows(source, null, rec);
    const ids = rows.map((r) => r.parameterId);

    expect(ids).toEqual(['A', 'B', 'C']);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
  });

  it('orders recognized source rows by sortOrder, then appends extra (replacement-only) rows', () => {
    const source = sourceAttrs([param('A', 'a', 2), param('B', 'b', 1)]);
    const rec = recommendation([
      md('B', 'b', 'b', { ruleResult: 'pass' }),
      md('A', 'a', 'a', { ruleResult: 'pass' }),
      md('C', 'N/A', 'N/A', { ruleResult: 'review' }), // extra → last
    ]);

    const rows = buildComparisonRows(source, null, rec);
    expect(rows.map((r) => r.parameterId)).toEqual(['B', 'A', 'C']);
  });

  it('leaves replacementValue null for a source-only attribute (blank on the right)', () => {
    const source = sourceAttrs([param('OperatingTemp', '-55~150C', 1)]);
    // No matchDetail and (null replacement attrs) → replacement side is absent.
    const rows = buildComparisonRows(source, null, recommendation([]));

    expect(rows).toHaveLength(1);
    expect(rows[0].sourceValue).toBe('-55~150C');
    expect(rows[0].replacementValue).toBeNull();
    expect(rows[0].matchStatus).toBe('different');
    expect(rows[0].ruleResult).toBeUndefined();
  });

  it('does NOT drop a source param that is "different" with no ruleResult (no-drop regression)', () => {
    // The old ComparisonView filter removed exactly this shape from the right panel.
    const source = sourceAttrs([param('MountingStyle', 'SMD', 1)]);
    const rows = buildComparisonRows(source, null, recommendation([]));

    expect(rows.map((r) => r.parameterId)).toContain('MountingStyle');
  });

  it('fills the replacement side from the replacement attributes when present', () => {
    const source = sourceAttrs([param('A', '10V', 1, { source: 'digikey' })]);
    const replacement = sourceAttrs([param('A', '12V', 1, { source: 'atlas' })]);
    const rows = buildComparisonRows(source, replacement, recommendation([]));

    expect(rows[0].sourceValue).toBe('10V');
    expect(rows[0].replacementValue).toBe('12V');
    expect(rows[0].sourceParamSource).toBe('digikey');
    expect(rows[0].replSource).toBe('atlas');
  });

  it('carries matchDetail values + status onto the source row when a rule exists', () => {
    const source = sourceAttrs([param('hFE', '200', 1)]);
    const rec = recommendation([
      md('hFE', '200', '420', { matchStatus: 'compatible', ruleResult: 'review', note: 'hFE varies' }),
    ]);
    const rows = buildComparisonRows(source, null, rec);

    expect(rows[0].replacementValue).toBe('420');
    expect(rows[0].matchStatus).toBe('compatible');
    expect(rows[0].ruleResult).toBe('review');
    expect(rows[0].note).toBe('hFE varies');
  });

  it('appends extra rows for review/fail matchDetails but not for pass', () => {
    const source = sourceAttrs([param('A', 'a', 1)]);
    const rec = recommendation([
      md('A', 'a', 'a', { ruleResult: 'pass' }),
      md('SOA', 'N/A', 'N/A', { matchStatus: 'different', ruleResult: 'review' }),
      md('PassOnly', 'N/A', 'x', { ruleResult: 'pass' }), // not in source, passes → excluded
    ]);

    const rows = buildComparisonRows(source, null, rec);
    const ids = rows.map((r) => r.parameterId);

    expect(ids).toContain('SOA');
    expect(ids).not.toContain('PassOnly');
    // The SOA extra row carries the engine's recorded values on both sides.
    const soa = rows.find((r) => r.parameterId === 'SOA')!;
    expect(soa.sourceValue).toBe('N/A');
    expect(soa.replacementValue).toBe('N/A');
  });

  it('excludes Atlas unrecognized extras (recognized === false) from the union', () => {
    const source = sourceAttrs([
      param('A', 'a', 1, { recognized: true }),
      param('RawAtlasParam', 'x', 2, { recognized: false }),
    ]);
    const rows = buildComparisonRows(source, null, recommendation([]));

    expect(rows.map((r) => r.parameterId)).toEqual(['A']);
  });

  it('does not throw and still produces rows when replacement attributes are null (loading)', () => {
    const source = sourceAttrs([param('A', '10V', 1)]);
    const rec = recommendation([md('A', '10V', '11V', { ruleResult: 'fail' })]);

    expect(() => buildComparisonRows(source, null, rec)).not.toThrow();
    const rows = buildComparisonRows(source, null, rec);
    expect(rows[0].replacementValue).toBe('11V'); // falls back to matchDetail
  });
});
