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

describe('sortRecommendationsForDisplay — Active is the top-level key (Jun 2026 policy)', () => {
  it('floats Active parts above non-Active within the same (logic) bucket', () => {
    const out = sortRecommendationsForDisplay([
      rec('OBS_HIGH', 95, 'Obsolete'),
      rec('ACT_LOW', 60, 'Active'),
    ]);
    // Active wins even though the obsolete part has a higher match %.
    expect(out.map((r) => r.part.mpn)).toEqual(['ACT_LOW', 'OBS_HIGH']);
  });

  it('Active outranks a non-Active certified cross (status is the top key, above bucket)', () => {
    const out = sortRecommendationsForDisplay([
      rec('ACCURIS_OBSOLETE', 50, 'Obsolete', ['partsio_fff']),
      rec('LOGIC_ACTIVE', 99, 'Active'),
    ]);
    // Active first — always — regardless of certification. This is the fix for
    // obsolete Accuris crosses topping the list over live logic matches.
    expect(out.map((r) => r.part.mpn)).toEqual(['LOGIC_ACTIVE', 'ACCURIS_OBSOLETE']);
  });

  it('within the same lifecycle tier, certification bucket leads (Accuris before Logic)', () => {
    const out = sortRecommendationsForDisplay([
      rec('LOGIC_ACTIVE_HIGH', 99, 'Active'),
      rec('ACCURIS_ACTIVE_LOW', 50, 'Active', ['partsio_fff']),
    ]);
    // Both Active → Accuris bucket outranks Logic even at a lower match %
    // (certified is human-verified; sparse data is penalized only within a bucket).
    expect(out.map((r) => r.part.mpn)).toEqual(['ACCURIS_ACTIVE_LOW', 'LOGIC_ACTIVE_HIGH']);
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
