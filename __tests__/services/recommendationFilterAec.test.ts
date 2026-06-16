import { isAecQualified, applyRecommendationFilter } from '@/lib/services/recommendationFilter';
import type { XrefRecommendation } from '@/lib/types';

function makeRec(opts: {
  mpn: string;
  aecMatchDetail?: 'Yes' | 'No' | 'N/A';
  qualifications?: string[];
}): XrefRecommendation {
  return {
    part: {
      mpn: opts.mpn,
      manufacturer: 'Test',
      description: 'x',
      detailedDescription: 'x',
      category: 'Capacitors',
      subcategory: 'MLCC Capacitors',
      status: 'Active',
      qualifications: opts.qualifications,
    },
    matchPercentage: 80,
    matchDetails: opts.aecMatchDetail
      ? [{
          parameterId: 'aec_q200',
          parameterName: 'AEC-Q200',
          sourceValue: 'Yes',
          replacementValue: opts.aecMatchDetail,
          matchStatus: 'exact',
          ruleResult: 'pass',
        }]
      : [],
  };
}

describe('isAecQualified', () => {
  it('is true when an AEC matchDetail reads "Yes"', () => {
    expect(isAecQualified(makeRec({ mpn: 'A', aecMatchDetail: 'Yes' }))).toBe(true);
  });

  it('is true via the part qualifications badge array (no AEC rule in family)', () => {
    expect(isAecQualified(makeRec({ mpn: 'B', qualifications: ['AEC-Q200', 'RoHS'] }))).toBe(true);
    expect(isAecQualified(makeRec({ mpn: 'B2', qualifications: ['AEC-Q100'] }))).toBe(true);
  });

  it('is false for explicit "No", missing data, or no AEC signal at all', () => {
    expect(isAecQualified(makeRec({ mpn: 'C', aecMatchDetail: 'No' }))).toBe(false);
    expect(isAecQualified(makeRec({ mpn: 'D', aecMatchDetail: 'N/A' }))).toBe(false);
    expect(isAecQualified(makeRec({ mpn: 'E' }))).toBe(false);
  });

  it('does not false-match longer numeric encodings (trailing boundary)', () => {
    expect(isAecQualified(makeRec({ mpn: 'F', qualifications: ['AEC-Q1006'] }))).toBe(false);
    expect(isAecQualified(makeRec({ mpn: 'G', qualifications: ['AEC-Q2009'] }))).toBe(false);
  });
});

describe('applyRecommendationFilter — aec_qualified_only', () => {
  const recs = [
    makeRec({ mpn: 'QUAL-MATCH', aecMatchDetail: 'Yes' }),
    makeRec({ mpn: 'QUAL-BADGE', qualifications: ['AEC-Q200'] }),
    makeRec({ mpn: 'NONQUAL-NO', aecMatchDetail: 'No' }),
    makeRec({ mpn: 'NONQUAL-MISSING' }),
  ];

  it('keeps only AEC-qualified recs when set', () => {
    const out = applyRecommendationFilter(recs, { aec_qualified_only: true });
    expect(out.map(r => r.part.mpn).sort()).toEqual(['QUAL-BADGE', 'QUAL-MATCH']);
  });

  it('is a no-op when unset/false (missing-AEC parts are NOT dropped)', () => {
    expect(applyRecommendationFilter(recs, {}).length).toBe(4);
    expect(applyRecommendationFilter(recs, { aec_qualified_only: false }).length).toBe(4);
  });
});
