import { sortRecommendationsForDisplay } from '@/lib/services/recommendationSort';
import type { XrefRecommendation, MatchDetail, Part, CertificationSource } from '@/lib/types';

const rec = (
  mpn: string,
  matchPercentage: number,
  status: Part['status'],
  certifiedBy?: CertificationSource[],
): XrefRecommendation => ({
  part: {
    mpn,
    manufacturer: 'M',
    description: '',
    detailedDescription: '',
    category: 'Capacitors',
    subcategory: 'Aluminum Electrolytic',
    status,
  },
  matchPercentage,
  matchDetails: [] as MatchDetail[],
  ...(certifiedBy ? { certifiedBy } : {}),
});

describe('sortRecommendationsForDisplay — Active-first within bucket (Decision #227)', () => {
  it('floats Active parts above non-Active within the same (logic) bucket', () => {
    const out = sortRecommendationsForDisplay([
      rec('OBS_HIGH', 95, 'Obsolete'),
      rec('ACT_LOW', 60, 'Active'),
    ]);
    // Active wins even though the obsolete part has a higher match %.
    expect(out.map((r) => r.part.mpn)).toEqual(['ACT_LOW', 'OBS_HIGH']);
  });

  it('keeps certification bucket order ahead of status (Accuris bucket before Logic)', () => {
    const out = sortRecommendationsForDisplay([
      rec('LOGIC_ACTIVE', 99, 'Active'),
      rec('ACCURIS_OBSOLETE', 50, 'Obsolete', ['partsio_fff']),
    ]);
    // Bucket (Accuris) outranks status — but within each bucket Active would lead.
    expect(out.map((r) => r.part.mpn)).toEqual(['ACCURIS_OBSOLETE', 'LOGIC_ACTIVE']);
  });

  it('within a bucket, Active sorts ahead regardless of match %, then match % orders the rest', () => {
    const out = sortRecommendationsForDisplay([
      rec('OBS_90', 90, 'Obsolete'),
      rec('ACT_70', 70, 'Active'),
      rec('ACT_85', 85, 'Active'),
      rec('NRND_95', 95, 'NRND'),
    ]);
    // Active first (by match %), then non-Active (also by match %: 95 before 90).
    expect(out.map((r) => r.part.mpn)).toEqual(['ACT_85', 'ACT_70', 'NRND_95', 'OBS_90']);
  });
});
