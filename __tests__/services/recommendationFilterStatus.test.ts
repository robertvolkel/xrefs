import {
  applyRecommendationFilter,
  describeFilterInput,
  resolveExcludedStatuses,
} from '@/lib/services/recommendationFilter';
import type { XrefRecommendation, PartStatus } from '@/lib/types';

const rec = (mpn: string, status?: PartStatus): XrefRecommendation => ({
  part: {
    mpn,
    manufacturer: 'Panasonic Industry',
    description: mpn,
    detailedDescription: mpn,
    category: 'Transistors',
    subcategory: 'BJT',
    ...(status ? { status } : {}),
  },
  matchPercentage: 90,
  matchDetails: [],
});

const recs: XrefRecommendation[] = [
  rec('ACT', 'Active'),
  rec('OBS', 'Obsolete'),
  rec('DISC', 'Discontinued'),
  rec('NR', 'NRND'),
  rec('LTB', 'LastTimeBuy'),
  rec('NOSTATUS'),
];

const mpns = (input: Parameters<typeof applyRecommendationFilter>[1]) =>
  applyRecommendationFilter(recs, input).map(r => r.part.mpn).sort();

/**
 * The recommendations panel shares the status predicate with the search cards, but
 * it is a SEPARATE call site — it had the identical `status !== 'Obsolete'` bug and
 * has to be pinned independently, not by proxy through the search-card tests.
 */
describe('applyRecommendationFilter — lifecycle status', () => {
  it('hides Discontinued WITHOUT touching Obsolete', () => {
    const out = mpns({ exclude_statuses: ['Discontinued'] });
    expect(out).not.toContain('DISC');
    expect(out).toContain('OBS'); // the original bug dropped OBS and kept DISC
  });

  it('hides Obsolete WITHOUT touching Discontinued', () => {
    const out = mpns({ exclude_statuses: ['Obsolete'] });
    expect(out).not.toContain('OBS');
    expect(out).toContain('DISC');
  });

  it('"only active" hides every non-Active status but keeps parts with no status data', () => {
    expect(mpns({ exclude_statuses: ['Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'] }))
      .toEqual(['ACT', 'NOSTATUS']);
  });

  it('legacy exclude_obsolete still means exactly ["Obsolete"]', () => {
    expect(mpns({ exclude_obsolete: true })).toEqual(['ACT', 'DISC', 'LTB', 'NOSTATUS', 'NR']);
  });

  it('an empty status list is a no-op, not a wipe', () => {
    expect(mpns({ exclude_statuses: [] })).toHaveLength(recs.length);
  });
});

describe('resolveExcludedStatuses', () => {
  it('unions the precise list with the legacy boolean', () => {
    expect([...resolveExcludedStatuses({ exclude_statuses: ['Discontinued'], exclude_obsolete: true })].sort())
      .toEqual(['Discontinued', 'Obsolete']);
  });
});

describe('describeFilterInput — status labels are honest about what is hidden', () => {
  it('names the exact status', () => {
    expect(describeFilterInput({ exclude_statuses: ['Discontinued'] })).toBe('hiding Discontinued');
  });

  it('names several', () => {
    expect(describeFilterInput({ exclude_statuses: ['Obsolete', 'NRND'] })).toBe('hiding Obsolete + NRND');
  });

  it('collapses the full non-Active set to "active parts only"', () => {
    expect(describeFilterInput({ exclude_statuses: ['Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'] }))
      .toBe('active parts only');
  });
});
