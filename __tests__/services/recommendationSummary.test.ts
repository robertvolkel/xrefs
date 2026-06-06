import { buildRecsSummary } from '@/lib/services/recommendationSummary';
import { isDefaultDisplayed, getDefaultDisplayedRecs } from '@/lib/types';
import type { XrefRecommendation, MatchDetail, Part } from '@/lib/types';

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
  status: Part['status'] = 'Active',
): XrefRecommendation => ({
  part: {
    mpn,
    manufacturer,
    description: `${manufacturer} ${mpn}`,
    detailedDescription: `${manufacturer} ${mpn}`,
    category: 'Capacitors',
    subcategory: 'Aluminum Electrolytic',
    status,
  },
  matchPercentage,
  matchDetails: details,
});

/** N real mismatches = N fail details with a known (non-N/A) replacement value. */
const fails = (n: number): MatchDetail[] =>
  Array.from({ length: n }, (_, i) => mkDetail(`P${i}`, 'fail', '50'));

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
    expect(out).toContain('All shown candidates pass primary rules.');
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
    expect(out).toContain('All shown candidates pass primary rules.');
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
    expect(out).toContain('All shown candidates pass primary rules.');
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

  it('leads with the SHOWN count and notes hidden (high-fail + obsolete) candidates', () => {
    const recs = [
      rec('SHOWN', 'CapXon', 90, [mkDetail('Capacitance', 'pass')]),
      rec('HIGHFAIL', 'CapXon', 40, fails(3)), // >2 mismatches → hidden
      rec('OBSOLETE', 'Lelon', 85, [mkDetail('Capacitance', 'pass')], 'Obsolete'), // hidden
    ];
    const out = buildRecsSummary(recs, 'X');
    expect(out).toContain('Found **1** replacement candidate for **X**.');
    expect(out).toContain('Top match: **SHOWN** — CapXon, 90% match.');
    expect(out).toContain('2 others are hidden (obsolete or 3+ failing parameters)');
    expect(out).toContain('say "show all" to review them');
  });

  it('uses singular phrasing when exactly one candidate is hidden', () => {
    const recs = [
      rec('SHOWN', 'CapXon', 90, [mkDetail('Capacitance', 'pass')]),
      rec('OBSOLETE', 'Lelon', 85, [mkDetail('Capacitance', 'pass')], 'Obsolete'),
    ];
    const out = buildRecsSummary(recs, 'X');
    expect(out).toContain('Found **1** replacement candidate for **X**.');
    expect(out).toContain('1 other is hidden');
  });

  it('all-hidden: does NOT claim "none found", offers show-all instead', () => {
    const recs = [
      rec('HIGHFAIL', 'CapXon', 40, fails(4)),
      rec('OBSOLETE', 'Lelon', 85, [mkDetail('Capacitance', 'pass')], 'Obsolete'),
    ];
    const out = buildRecsSummary(recs, 'X');
    expect(out).not.toContain('No replacement candidates');
    expect(out).toContain('Found **2** candidates for **X**');
    expect(out).toContain('hidden by default');
    expect(out).toContain('say "show all" to review them');
  });

  it('all-hidden single: singular phrasing', () => {
    const out = buildRecsSummary([rec('HIGHFAIL', 'CapXon', 40, fails(3))], 'X');
    expect(out).toContain('Found **1** candidate for **X**, but it is obsolete or has 3+ failing parameters and is hidden by default');
    expect(out).toContain('say "show all" to review it');
  });

  it('certified cross with >2 mismatches stays shown (bypasses hide)', () => {
    const certified: XrefRecommendation = {
      ...rec('CERT', 'KEMET', 75, fails(4)),
      certifiedBy: ['manufacturer'],
    };
    const out = buildRecsSummary([certified], 'X');
    expect(out).toContain('Found **1** replacement candidate for **X**.');
    expect(out).not.toContain('hidden');
  });
});

describe('isDefaultDisplayed / getDefaultDisplayedRecs', () => {
  it('shows Active candidates with <= 2 real mismatches', () => {
    expect(isDefaultDisplayed(rec('A', 'M', 80, fails(2)))).toBe(true);
    expect(isDefaultDisplayed(rec('A', 'M', 80, [mkDetail('C', 'pass')]))).toBe(true);
  });

  it('hides Active candidates with > 2 real mismatches', () => {
    expect(isDefaultDisplayed(rec('A', 'M', 80, fails(3)))).toBe(false);
  });

  it('hides non-Active candidates regardless of mismatch count', () => {
    expect(isDefaultDisplayed(rec('A', 'M', 80, [mkDetail('C', 'pass')], 'Obsolete'))).toBe(false);
    expect(isDefaultDisplayed(rec('A', 'M', 80, [mkDetail('C', 'pass')], 'NRND'))).toBe(false);
  });

  it('keeps certified crosses even with > 2 mismatches (but still requires Active)', () => {
    const certActive: XrefRecommendation = { ...rec('A', 'M', 80, fails(5)), certifiedBy: ['partsio_fff'] };
    const certObsolete: XrefRecommendation = { ...rec('A', 'M', 80, fails(5), 'Obsolete'), certifiedBy: ['manufacturer'] };
    expect(isDefaultDisplayed(certActive)).toBe(true);
    expect(isDefaultDisplayed(certObsolete)).toBe(false);
  });

  it('does not count missing-attribute fails (N/A) toward the limit', () => {
    const naFails = Array.from({ length: 5 }, (_, i) => mkDetail(`P${i}`, 'fail', 'N/A'));
    expect(isDefaultDisplayed(rec('A', 'M', 80, naFails))).toBe(true);
  });

  it('getDefaultDisplayedRecs filters the set', () => {
    const set = [
      rec('SHOW', 'M', 90, [mkDetail('C', 'pass')]),
      rec('HIDE_FAIL', 'M', 40, fails(3)),
      rec('HIDE_OBS', 'M', 85, [mkDetail('C', 'pass')], 'Obsolete'),
    ];
    const shown = getDefaultDisplayedRecs(set);
    expect(shown.map((r) => r.part.mpn)).toEqual(['SHOW']);
  });
});
