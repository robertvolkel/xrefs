import { buildRecsSummary } from '@/lib/services/recommendationSummary';
import type { XrefRecommendation, MatchDetail } from '@/lib/types';

const mkDetail = (
  parameterName: string,
  ruleResult: NonNullable<MatchDetail['ruleResult']>,
  replacementValue = '10',
): MatchDetail => ({
  parameterId: parameterName.toLowerCase(),
  parameterName,
  sourceValue: '10',
  replacementValue,
  matchStatus: ruleResult === 'pass' ? 'exact' : 'different',
  ruleResult,
});

const rec = (
  mpn: string,
  manufacturer: string,
  matchPercentage: number,
  details: MatchDetail[] = [],
): XrefRecommendation => ({
  part: {
    mpn,
    manufacturer,
    description: `${manufacturer} ${mpn}`,
    detailedDescription: `${manufacturer} ${mpn}`,
    category: 'Capacitors',
    subcategory: 'Aluminum Electrolytic',
    status: 'Active',
  },
  matchPercentage,
  matchDetails: details,
});

describe('buildRecsSummary', () => {
  it('handles empty input', () => {
    expect(buildRecsSummary([], '860020672005')).toBe(
      'No replacement candidates found for **860020672005**.',
    );
  });

  it('handles single rec, all-pass', () => {
    const recs = [rec('CC0805KKX5R7BB106', '3PEAK', 80, [mkDetail('Capacitance', 'pass')])];
    const out = buildRecsSummary(recs, 'GRM188R71C104KA01D');
    expect(out).toContain('Found **1** replacement candidate for **GRM188R71C104KA01D**.');
    expect(out).toContain('Top match: **CC0805KKX5R7BB106** — 3PEAK, 80% match.');
    expect(out).toContain('All candidates pass primary rules.');
  });

  it('handles multiple recs, all-pass', () => {
    const recs = [
      rec('A1', 'CapXon', 95, [mkDetail('Capacitance', 'pass')]),
      rec('A2', 'CapXon', 90, [mkDetail('Capacitance', 'pass')]),
      rec('A3', 'Lelon', 88, [mkDetail('Capacitance', 'pass')]),
    ];
    const out = buildRecsSummary(recs, 'X');
    expect(out).toContain('Found **3** replacement candidates for **X**.');
    expect(out).toContain('Top match: **A1** — CapXon, 95% match.');
    expect(out).toContain('All candidates pass primary rules.');
  });

  it('handles mixed pass/fail with real mismatches', () => {
    const recs = [
      rec('A1', 'CapXon', 88, [mkDetail('Capacitance', 'pass')]),
      rec('A2', 'CapXon', 70, [mkDetail('Voltage', 'fail', '50')]),
      rec('A3', 'Lelon', 65, [mkDetail('Voltage', 'fail', '25')]),
    ];
    const out = buildRecsSummary(recs, 'X');
    expect(out).toContain('Found **3** replacement candidates for **X**.');
    expect(out).toContain('Top match: **A1** — CapXon, 88% match.');
    expect(out).toContain('1 pass all rules; 2 flagged for parameter mismatches');
    expect(out).toContain('review per-card spec match before committing');
  });

  it('does NOT count missing-attribute fails as real mismatches (replacementValue === "N/A")', () => {
    const recs = [
      rec('A1', 'CapXon', 88, [mkDetail('Capacitance', 'fail', 'N/A')]),
      rec('A2', 'Lelon', 80, [mkDetail('Capacitance', 'pass')]),
    ];
    const out = buildRecsSummary(recs, 'X');
    expect(out).toContain('All candidates pass primary rules.');
  });

  it('rounds match percentage to integer', () => {
    const recs = [rec('A1', 'CapXon', 67.6)];
    expect(buildRecsSummary(recs, 'X')).toContain('68% match');
  });

  it('uses singular "candidate" for 1, plural for 0 / many', () => {
    expect(buildRecsSummary([], 'X')).toContain('No replacement candidates');
    expect(buildRecsSummary([rec('A1', 'M', 80)], 'X')).toContain('1** replacement candidate ');
    expect(
      buildRecsSummary([rec('A1', 'M', 80), rec('A2', 'M', 70)], 'X'),
    ).toContain('2** replacement candidates ');
  });
});
