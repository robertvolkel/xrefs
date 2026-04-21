import {
  deriveRecommendationBucket,
  computeRecommendationCounts,
  type XrefRecommendation,
  type CertificationSource,
} from '@/lib/types';

function makeRec(certifiedBy?: CertificationSource[], matchPercentage = 80): XrefRecommendation {
  return {
    part: {
      mpn: 'TEST-MPN',
      manufacturer: 'Test',
      description: 'x',
      detailedDescription: 'x',
      category: 'Capacitors',
      subcategory: 'MLCC Capacitors',
      status: 'Active',
    },
    matchPercentage,
    matchDetails: [],
    certifiedBy,
  };
}

describe('deriveRecommendationBucket', () => {
  it('returns "accuris" for parts.io FFF certification', () => {
    expect(deriveRecommendationBucket(makeRec(['partsio_fff']))).toBe('accuris');
  });

  it('returns "accuris" for parts.io functional certification', () => {
    expect(deriveRecommendationBucket(makeRec(['partsio_functional']))).toBe('accuris');
  });

  it('returns "manufacturer" for manufacturer-only certification', () => {
    expect(deriveRecommendationBucket(makeRec(['manufacturer']))).toBe('manufacturer');
  });

  it('returns "logic" for Mouser-only certified rec (Mouser excluded from Accuris)', () => {
    expect(deriveRecommendationBucket(makeRec(['mouser']))).toBe('logic');
  });

  it('returns "logic" for uncertified rec', () => {
    expect(deriveRecommendationBucket(makeRec(undefined))).toBe('logic');
    expect(deriveRecommendationBucket(makeRec([]))).toBe('logic');
  });

  it('Accuris wins over Manufacturer when both certs present', () => {
    expect(deriveRecommendationBucket(makeRec(['manufacturer', 'partsio_fff']))).toBe('accuris');
    expect(deriveRecommendationBucket(makeRec(['partsio_functional', 'manufacturer']))).toBe('accuris');
  });

  it('Manufacturer wins over Mouser', () => {
    expect(deriveRecommendationBucket(makeRec(['manufacturer', 'mouser']))).toBe('manufacturer');
  });
});

describe('computeRecommendationCounts', () => {
  it('returns zeros for undefined input', () => {
    expect(computeRecommendationCounts(undefined)).toEqual({
      logicDrivenCount: 0,
      mfrCertifiedCount: 0,
      accurisCertifiedCount: 0,
    });
  });

  it('tallies buckets mutually exclusively', () => {
    const recs: XrefRecommendation[] = [
      makeRec(['partsio_fff']),
      makeRec(['partsio_functional']),
      makeRec(['manufacturer']),
      makeRec(['mouser']),
      makeRec(undefined),
      makeRec(['manufacturer', 'partsio_fff']), // Accuris wins
    ];
    expect(computeRecommendationCounts(recs)).toEqual({
      accurisCertifiedCount: 3,
      mfrCertifiedCount: 1,
      logicDrivenCount: 2,
    });
  });

  it('counts sum to total recommendations', () => {
    const recs: XrefRecommendation[] = [
      makeRec(['partsio_fff']),
      makeRec(['manufacturer']),
      makeRec(undefined),
    ];
    const counts = computeRecommendationCounts(recs);
    expect(counts.accurisCertifiedCount + counts.mfrCertifiedCount + counts.logicDrivenCount).toBe(recs.length);
  });
});
