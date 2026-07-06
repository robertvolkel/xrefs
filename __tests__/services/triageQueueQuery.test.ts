import { queryTriage, type TriageQueryParams } from '@/lib/services/triageQueueQuery';
import { paramUid } from '@/lib/services/paramUid';
import type { Classified } from '@/lib/services/triageQueueCompute';

function cls(partial: Partial<Classified> & { paramName: string }): Classified {
  return {
    sampleValues: [],
    mfrCount: 1,
    productCount: 10,
    affectedBatchIds: [],
    affectedManufacturers: [{ slug: 'acme', name: 'Acme', productCount: 10 }],
    dominantFamily: 'B5',
    familyCounts: { B5: 10 },
    dominantCategory: null,
    categoryCounts: {},
    effective: 'synonym',
    matchingImpact: { score: 70, weight: 7, canonical: null, isEstimate: true },
    ...partial,
  } as Classified;
}

const BASE: TriageQueryParams = {
  batchFilter: null,
  include: 'all',
  statusFilter: 'all',
  search: '',
  mfrSlugs: [],
  families: [],
  minProds: 0,
  flaggedOnly: false,
  hasNoteOnly: false,
  aiVerdict: 'all',
  sort: 'impact',
  page: 1,
  pageSize: 50,
};

describe('queryTriage', () => {
  it('does not mutate the input array', () => {
    const rows = [cls({ paramName: 'a' }), cls({ paramName: 'b' })];
    const snapshot = JSON.stringify(rows);
    queryTriage(rows, { ...BASE, search: 'a' });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('sorts by matchingImpact.score desc', () => {
    const rows = [
      cls({ paramName: 'low', matchingImpact: { score: 10, weight: 1, canonical: null, isEstimate: true } }),
      cls({ paramName: 'high', matchingImpact: { score: 5000, weight: 7, canonical: null, isEstimate: true } }),
      cls({ paramName: 'mid', matchingImpact: { score: 800, weight: 7, canonical: null, isEstimate: true } }),
    ];
    const res = queryTriage(rows, BASE);
    expect(res.rows.map((r) => r.paramName)).toEqual(['high', 'mid', 'low']);
  });

  it('Accepted filter sorts by acceptedOverride.createdAt desc (most-recent-first)', () => {
    const mkOverride = (createdAt: string) => ({
      id: `id-${createdAt}`,
      attributeId: 'rds_on',
      attributeName: 'Rds(on)',
      unit: 'Ω',
      createdBy: 'user',
      createdByName: 'Test',
      createdAt,
      updatedAt: createdAt,
      isActive: true,
      wasEdited: false,
    });
    const rows = [
      // Low impact score but most recent — must rise to top
      cls({
        paramName: 'recent_low_score',
        matchingImpact: { score: 5, weight: 1, canonical: null, isEstimate: true },
        acceptedOverride: mkOverride('2026-06-12T10:00:00Z'),
      }),
      // High impact score but oldest — must sink to bottom
      cls({
        paramName: 'oldest_high_score',
        matchingImpact: { score: 9999, weight: 10, canonical: null, isEstimate: true },
        acceptedOverride: mkOverride('2026-06-10T10:00:00Z'),
      }),
      cls({
        paramName: 'middle',
        matchingImpact: { score: 100, weight: 5, canonical: null, isEstimate: true },
        acceptedOverride: mkOverride('2026-06-11T10:00:00Z'),
      }),
    ];
    const res = queryTriage(rows, { ...BASE, statusFilter: 'accepted' });
    expect(res.rows.map((r) => r.paramName)).toEqual([
      'recent_low_score',
      'middle',
      'oldest_high_score',
    ]);
  });

  it('filters by mode (include)', () => {
    const rows = [
      cls({ paramName: 'syn', effective: 'synonym' }),
      cls({ paramName: 'flag', effective: 'flagged' }),
    ];
    expect(queryTriage(rows, { ...BASE, include: 'synonyms' }).rows.map((r) => r.paramName)).toEqual(['syn']);
    expect(queryTriage(rows, { ...BASE, include: 'auto_flagged' }).rows.map((r) => r.paramName)).toEqual(['flag']);
    expect(queryTriage(rows, { ...BASE, include: 'all' }).totalFiltered).toBe(2);
  });

  it('search matches paramName OR paramUid', () => {
    const rows = [cls({ paramName: 'VRRM (V) max' }), cls({ paramName: 'other' })];
    expect(queryTriage(rows, { ...BASE, search: 'vrrm' }).rows.map((r) => r.paramName)).toEqual(['VRRM (V) max']);
    const uid = paramUid('VRRM (V) max');
    expect(queryTriage(rows, { ...BASE, search: uid }).rows.map((r) => r.paramName)).toEqual(['VRRM (V) max']);
    // partial UID
    expect(queryTriage(rows, { ...BASE, search: uid.slice(0, 5) }).totalFiltered).toBeGreaterThanOrEqual(1);
  });

  it('filters by mfr, family, minProds, flagged, hasNote', () => {
    const rows = [
      cls({ paramName: 'a', affectedManufacturers: [{ slug: 'foo', name: 'Foo', productCount: 5 }], productCount: 5, dominantFamily: 'B5', isFlagged: true, hasNote: true }),
      cls({ paramName: 'b', affectedManufacturers: [{ slug: 'bar', name: 'Bar', productCount: 50 }], productCount: 50, dominantFamily: 'B6', isFlagged: false, hasNote: false }),
    ];
    expect(queryTriage(rows, { ...BASE, mfrSlugs: ['foo'] }).rows.map((r) => r.paramName)).toEqual(['a']);
    expect(queryTriage(rows, { ...BASE, families: ['B6'] }).rows.map((r) => r.paramName)).toEqual(['b']);
    expect(queryTriage(rows, { ...BASE, minProds: 20 }).rows.map((r) => r.paramName)).toEqual(['b']);
    expect(queryTriage(rows, { ...BASE, flaggedOnly: true }).rows.map((r) => r.paramName)).toEqual(['a']);
    expect(queryTriage(rows, { ...BASE, hasNoteOnly: true }).rows.map((r) => r.paramName)).toEqual(['a']);
  });

  it('status filters partition by override state', () => {
    const open = cls({ paramName: 'open' });
    const accepted = cls({ paramName: 'acc', acceptedOverride: makeOverride(true) });
    const undone = cls({ paramName: 'und', acceptedOverride: makeOverride(false) });
    const deferred = cls({ paramName: 'def', noteStatus: 'deferred' });
    const unmappable = cls({ paramName: 'unm', noteStatus: 'unmappable' });
    const rows = [open, accepted, undone, deferred, unmappable];
    expect(queryTriage(rows, { ...BASE, statusFilter: 'open' }).rows.map((r) => r.paramName)).toEqual(['open']);
    expect(queryTriage(rows, { ...BASE, statusFilter: 'accepted' }).rows.map((r) => r.paramName)).toEqual(['acc']);
    expect(queryTriage(rows, { ...BASE, statusFilter: 'undone' }).rows.map((r) => r.paramName)).toEqual(['und']);
    expect(queryTriage(rows, { ...BASE, statusFilter: 'deferred' }).rows.map((r) => r.paramName)).toEqual(['def']);
    expect(queryTriage(rows, { ...BASE, statusFilter: 'unmappable' }).rows.map((r) => r.paramName)).toEqual(['unm']);
  });

  it('hides parked rows from non-all modes unless the status chip targets them', () => {
    const rows = [
      cls({ paramName: 'open' }),
      cls({ paramName: 'def', noteStatus: 'deferred' }),
    ];
    // synonyms + status=all → parked hidden
    expect(queryTriage(rows, { ...BASE, include: 'synonyms', statusFilter: 'all' }).rows.map((r) => r.paramName)).toEqual(['open']);
    // synonyms + status=deferred → parked visible
    expect(queryTriage(rows, { ...BASE, include: 'synonyms', statusFilter: 'deferred' }).rows.map((r) => r.paramName)).toEqual(['def']);
  });

  it('paginates: totalFiltered is full count, rows is the page slice', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      cls({ paramName: `p${i}`, matchingImpact: { score: 1000 - i, weight: 7, canonical: null, isEstimate: true } }),
    );
    const page1 = queryTriage(rows, { ...BASE, page: 1, pageSize: 10 });
    expect(page1.totalFiltered).toBe(25);
    expect(page1.rows).toHaveLength(10);
    expect(page1.rows[0].paramName).toBe('p0');
    const page3 = queryTriage(rows, { ...BASE, page: 3, pageSize: 10 });
    expect(page3.rows).toHaveLength(5);
    expect(page3.rows[0].paramName).toBe('p20');
    const page99 = queryTriage(rows, { ...BASE, page: 99, pageSize: 10 });
    expect(page99.rows).toHaveLength(0);
    expect(page99.totalFiltered).toBe(25);
  });

  it('pageSize=0 returns counts + option lists but no rows', () => {
    const rows = [cls({ paramName: 'a' }), cls({ paramName: 'b' })];
    const res = queryTriage(rows, { ...BASE, pageSize: 0 });
    expect(res.rows).toHaveLength(0);
    expect(res.totalFiltered).toBe(2);
    expect(res.statusCounts.open).toBe(2);
    expect(res.mfrOptions.length).toBeGreaterThan(0);
  });

  it('option lists are built pre-axis-filter (not narrowed by active filters)', () => {
    const rows = [
      cls({ paramName: 'a', affectedManufacturers: [{ slug: 'foo', name: 'Foo', productCount: 5 }], dominantFamily: 'B5' }),
      cls({ paramName: 'b', affectedManufacturers: [{ slug: 'bar', name: 'Bar', productCount: 5 }], dominantFamily: 'B6' }),
    ];
    // Filter to foo only — but options should still list both MFRs + families.
    const res = queryTriage(rows, { ...BASE, mfrSlugs: ['foo'] });
    expect(res.rows).toHaveLength(1);
    expect(res.mfrOptions.map((m) => m.slug).sort()).toEqual(['bar', 'foo']);
    expect(res.familyOptions).toEqual(['B5', 'B6']);
  });

  it('batchFilter scopes the working set and its counts', () => {
    const rows = [
      cls({ paramName: 'in', affectedBatchIds: ['batch-1'] }),
      cls({ paramName: 'out', affectedBatchIds: ['batch-2'] }),
    ];
    const res = queryTriage(rows, { ...BASE, batchFilter: 'batch-1' });
    expect(res.rows.map((r) => r.paramName)).toEqual(['in']);
    expect(res.statusCounts.open).toBe(1);
  });

  it('strips the server-only `effective` discriminator from returned rows', () => {
    const rows = [cls({ paramName: 'a' })];
    const res = queryTriage(rows, BASE);
    expect('effective' in res.rows[0]).toBe(false);
  });

  describe('ai verdict filter + verdictCounts', () => {
    // Open synonym rows carrying attached verdicts (as the route attaches them).
    const mkRows = () => [
      cls({ paramName: 'acc1', suggestion: { verdict: 'accept' } }),
      cls({ paramName: 'acc2', suggestion: { verdict: 'accept' } }),
      cls({ paramName: 'def1', suggestion: { verdict: 'defer' } }),
      cls({ paramName: 'raw1' }), // not generated
    ];

    it('ai_verdict=accept keeps only accept-verdict rows', () => {
      const res = queryTriage(mkRows(), { ...BASE, statusFilter: 'open', aiVerdict: 'accept' });
      expect(res.rows.map((r) => r.paramName).sort()).toEqual(['acc1', 'acc2']);
    });

    it('ai_verdict=defer keeps only defer-verdict rows', () => {
      const res = queryTriage(mkRows(), { ...BASE, statusFilter: 'open', aiVerdict: 'defer' });
      expect(res.rows.map((r) => r.paramName)).toEqual(['def1']);
    });

    it('ai_verdict=none keeps only not-yet-generated rows', () => {
      const res = queryTriage(mkRows(), { ...BASE, statusFilter: 'open', aiVerdict: 'none' });
      expect(res.rows.map((r) => r.paramName)).toEqual(['raw1']);
    });

    it('verdictCounts reports generatedTotal + accept/defer/none independent of the active filter', () => {
      const res = queryTriage(mkRows(), { ...BASE, statusFilter: 'open', aiVerdict: 'accept' });
      // generatedTotal counts every row with a verdict (any status); accept/defer/
      // none are over the open synonym queue and DON'T shrink under the filter.
      expect(res.verdictCounts).toEqual({ generatedTotal: 3, accept: 2, defer: 1, none: 1 });
    });
  });
});

function makeOverride(isActive: boolean): NonNullable<Classified['acceptedOverride']> {
  return {
    id: 'ov1',
    attributeId: 'vds',
    attributeName: 'Vds',
    unit: 'V',
    createdBy: 'u',
    createdByName: 'U',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isActive,
    wasEdited: false,
  };
}
