/**
 * atlasDictOverrides — the layer that decides whether an accepted mapping is
 * ever SEEN.
 *
 * Until now it had zero tests, which is the wrong place in this system for a
 * blind spot: an engineer can accept a mapping, the route can write a correct
 * row, the decision log can record it faithfully — and if this module drops it
 * on read, the mapping simply never applies. Nothing anywhere reports an error.
 * The parameter just stays untranslated, and the only symptom is a coverage
 * number that fails to move.
 *
 * Three failure modes, all silent, all pinned here:
 *
 *  1. THE 1000-ROW CAP. PostgREST caps a single SELECT at 1000 rows. This table
 *     crossed that (every accepted Triage mapping adds one), so an un-paginated
 *     read returns the first 1000 and every mapping past #1000 stops applying.
 *  2. UNSTABLE ORDER. Without a total ordering, PostgREST returns paginated
 *     rows in arbitrary run-to-run order, so boundary rows get dropped or
 *     duplicated across pages — making Atlas param mapping non-deterministic
 *     between runs of the same code against the same data.
 *  3. A PARTIAL RESULT ON ERROR. If page 2 fails, returning page 1 is worse
 *     than returning nothing: a partial dictionary silently un-applies a subset
 *     of mappings while looking exactly like a complete one.
 *
 * Plus the cache-invalidation assertion this file exists for: after an admin
 * accepts a mapping, `invalidateDictOverrideCache(familyId)` must clear BOTH
 * that family's entry AND the all-families cache. Missing the second one is
 * invisible for exactly 60 seconds and then fixes itself, which is the hardest
 * kind of bug to be handed a report about.
 *
 * A purpose-built stub is used here rather than the shared supabaseMock: this
 * suite is specifically about the pagination LOOP, so it needs to observe each
 * `.range()` call and fail a chosen one — which is not something the shared
 * mock models, and bending it to would make it worse at its own job.
 */

// Marks this file as a module so `declare global` is legal — every other
// import here is dynamic (the caches are module state, so each test re-imports
// the subject with `jest.resetModules()`), which would otherwise leave the file
// a plain script.
export {};

type StubRow = Record<string, unknown>;

interface RangeCall {
  from: number;
  to: number;
  familyId: string | null;
  orderCols: string[];
  /** Every eq() the query applied, so a dropped filter is observable. */
  filters: Array<[string, unknown]>;
}

interface Stub {
  rows: StubRow[];
  calls: RangeCall[];
  /** 1-based index of the range() call that should return an error. */
  failOnCall: number | null;
}

declare global {
  var DICT_STUB: Stub;
}
globalThis.DICT_STUB = { rows: [], calls: [], failOnCall: null };

jest.mock('../../lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      let familyId: string | null = null;
      const orderCols: string[] = [];
      const filters: Array<[string, unknown]> = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          if (col === 'family_id') familyId = val as string;
          return chain;
        },
        order: (col: string) => {
          orderCols.push(col);
          return chain;
        },
        range: (from: number, to: number) => {
          const s = globalThis.DICT_STUB;
          s.calls.push({ from, to, familyId, orderCols: [...orderCols], filters: [...filters] });
          if (s.failOnCall === s.calls.length) {
            return Promise.resolve({ data: null, error: { message: 'connection reset' } });
          }
          // Apply every recorded eq — including is_active, so dropping that
          // filter is observable rather than silently ignored by the stub.
          const scoped = s.rows.filter((r: StubRow) => filters.every(([col, val]) => r[col] === val));
          // Mirror the route's total ordering so the pagination boundary is
          // exercised the way PostgREST would produce it.
          const ordered = [...scoped].sort((a: StubRow, b: StubRow) => {
            const ac = String(a.created_at ?? '');
            const bc = String(b.created_at ?? '');
            if (ac !== bc) return ac < bc ? -1 : 1;
            return String(a.id) < String(b.id) ? -1 : 1;
          });
          return Promise.resolve({ data: ordered.slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  }),
}));

const STUB = globalThis.DICT_STUB;

/** Re-import with a cold module-level cache — the caches are module state. */
async function loadFresh() {
  jest.resetModules();
  return import('@/lib/services/atlasDictOverrides');
}

const row = (i: number, familyId = 'B1', isActive = true) => ({
  id: `ov-${String(i).padStart(5, '0')}`,
  family_id: familyId,
  param_name: `p${i}`,
  action: 'add',
  attribute_id: `a${i}`,
  attribute_name: `A${i}`,
  unit: null,
  sort_order: null,
  is_active: isActive,
  created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
});

const rows = (n: number, familyId = 'B1') => Array.from({ length: n }, (_, i) => row(i, familyId));

beforeEach(() => {
  STUB.rows = [];
  STUB.calls = [];
  STUB.failOnCall = null;
});

describe('pagination past the 1000-row cap', () => {
  it('returns ALL overrides when there are more than 1000', async () => {
    // The bug this prevents: mapping #1001 onward silently stops applying, and
    // nothing anywhere reports an error.
    STUB.rows = rows(1035);
    const { fetchAllDictOverrides } = await loadFresh();

    const result = await fetchAllDictOverrides();

    expect(result).toHaveLength(1035);
    expect(STUB.calls.map((c) => [c.from, c.to])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('makes a SECOND request at exactly 1000 — a full page is not proof of the end', async () => {
    // A full page is indistinguishable from a page that happens to end on the
    // boundary. Stopping here would drop every override past #1000 the moment
    // the table crossed a round number.
    STUB.rows = rows(1000);
    const { fetchAllDictOverrides } = await loadFresh();

    const result = await fetchAllDictOverrides();

    expect(result).toHaveLength(1000);
    expect(STUB.calls).toHaveLength(2);
  });

  it('stops after one request when the first page is short', async () => {
    STUB.rows = rows(42);
    const { fetchAllDictOverrides } = await loadFresh();

    await fetchAllDictOverrides();

    expect(STUB.calls).toHaveLength(1);
  });

  it('returns no duplicates and no gaps across the page boundary', async () => {
    // Drop/duplicate at the boundary is the observable symptom of an unstable
    // sort, and it is silent: the count still looks plausible.
    //
    // The fixture deliberately contains TIED created_at values (they cycle),
    // because a tie is exactly the case the `id` tiebreak exists for: ordering
    // on created_at alone leaves tied rows in arbitrary order, and rows tied
    // ACROSS a page boundary are the ones that get dropped or duplicated.
    STUB.rows = rows(1500);
    const { fetchAllDictOverrides } = await loadFresh();

    const result = await fetchAllDictOverrides();

    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(1500);
    expect(new Set(ids)).toEqual(new Set(STUB.rows.map((r: StubRow) => r.id)));

    // And the sequence is the (created_at, id) total order — deterministic, so
    // two runs against the same data return the same dictionary.
    const expected = [...STUB.rows]
      .sort((a: StubRow, b: StubRow) => {
        const ac = String(a.created_at);
        const bc = String(b.created_at);
        if (ac !== bc) return ac < bc ? -1 : 1;
        return String(a.id) < String(b.id) ? -1 : 1;
      })
      .map((r: StubRow) => r.id);
    expect(ids).toEqual(expected);
  });

  it('orders by created_at then id — a total order, so pages cannot shuffle', async () => {
    STUB.rows = rows(5);
    const { fetchAllDictOverrides } = await loadFresh();

    await fetchAllDictOverrides();

    expect(STUB.calls[0].orderCols).toEqual(['created_at', 'id']);
  });
});

describe('a failed page returns nothing, never a partial dictionary', () => {
  it('drops the whole result when page 2 fails', async () => {
    // A partial dictionary silently un-applies a subset of mappings while
    // looking exactly like a complete one. Empty is honest; partial is not.
    STUB.rows = rows(1500);
    STUB.failOnCall = 2;
    const { fetchAllDictOverrides } = await loadFresh();

    const result = await fetchAllDictOverrides();

    expect(result).toEqual([]);
  });

  it('does not loop forever on a failing page', async () => {
    // The Decision #183 trap: a loop that continues past a failed page either
    // spins or silently truncates.
    STUB.rows = rows(1500);
    STUB.failOnCall = 1;
    const { fetchAllDictOverrides } = await loadFresh();

    const result = await fetchAllDictOverrides();

    expect(result).toEqual([]);
    expect(STUB.calls).toHaveLength(1);
  });

  it('does not cache a failed fetch as an empty dictionary', async () => {
    // Caching [] after a transient error would suppress every mapping for a
    // full TTL — a 60-second outage silently becomes 60 seconds of unmapped
    // parameters even after the database recovers.
    STUB.rows = rows(10);
    STUB.failOnCall = 1;
    const { fetchAllDictOverrides } = await loadFresh();

    expect(await fetchAllDictOverrides()).toEqual([]);

    STUB.failOnCall = null;
    expect(await fetchAllDictOverrides()).toHaveLength(10);
  });
});

describe('revoked mappings must not come back to life', () => {
  it('excludes inactive overrides from the all-families read', async () => {
    // The mirror image of "an accepted mapping never applies": a REVOKED one
    // that keeps applying. The revoke path only flips is_active — the row stays
    // in the table forever — so this filter is the entire mechanism by which a
    // revocation takes effect on the read side.
    STUB.rows = [row(1, 'B1', true), row(2, 'B1', false), row(3, 'B1', true)];
    const { fetchAllDictOverrides } = await loadFresh();

    const result = await fetchAllDictOverrides();

    expect(result.map((r) => r.id)).toEqual(['ov-00001', 'ov-00003']);
    expect(STUB.calls[0].filters).toContainEqual(['is_active', true]);
  });

  it('excludes inactive overrides from the per-family read', async () => {
    STUB.rows = [row(1, 'B4', true), row(2, 'B4', false)];
    const { fetchDictOverrides } = await loadFresh();

    const result = await fetchDictOverrides('B4');

    expect(result).toHaveLength(1);
    expect(STUB.calls[0].filters).toEqual(
      expect.arrayContaining([
        ['is_active', true],
        ['family_id', 'B4'],
      ]),
    );
  });
});

describe('per-family fetch', () => {
  it('scopes the query to the family', async () => {
    STUB.rows = [...rows(3, 'B1'), ...rows(2, 'B4')];
    const { fetchDictOverrides } = await loadFresh();

    const result = await fetchDictOverrides('B4');

    expect(result).toHaveLength(2);
    expect(STUB.calls[0].familyId).toBe('B4');
  });

  it('paginates per family too', async () => {
    STUB.rows = rows(1200, 'B5');
    const { fetchDictOverrides } = await loadFresh();

    const result = await fetchDictOverrides('B5');

    expect(result).toHaveLength(1200);
    expect(STUB.calls).toHaveLength(2);
  });
});

describe('caching', () => {
  it('serves a second call from cache without re-querying', async () => {
    STUB.rows = rows(5);
    const { fetchDictOverrides } = await loadFresh();

    await fetchDictOverrides('B1');
    await fetchDictOverrides('B1');

    expect(STUB.calls).toHaveLength(1);
  });

  it('caches each family separately', async () => {
    STUB.rows = [...rows(2, 'B1'), ...rows(3, 'B4')];
    const { fetchDictOverrides } = await loadFresh();

    await fetchDictOverrides('B1');
    await fetchDictOverrides('B4');

    expect(STUB.calls).toHaveLength(2);
    expect(await fetchDictOverrides('B4')).toHaveLength(3);
    expect(STUB.calls).toHaveLength(2);
  });

  it('re-queries once the TTL expires', async () => {
    STUB.rows = rows(5);
    const { fetchDictOverrides } = await loadFresh();
    const now = jest.spyOn(Date, 'now');

    now.mockReturnValue(1_000_000);
    await fetchDictOverrides('B1');
    now.mockReturnValue(1_000_000 + 60_001);
    await fetchDictOverrides('B1');

    expect(STUB.calls).toHaveLength(2);
    now.mockRestore();
  });
});

describe('invalidation after an admin accepts a mapping', () => {
  it('clears the family cache AND the all-families cache', async () => {
    // THE assertion this file exists for. The accept route calls
    // invalidateDictOverrideCache(familyId); if that clears only the family
    // entry, the all-families read path keeps serving a stale dictionary for a
    // full TTL — so the mapping the engineer just accepted does not apply,
    // then starts applying a minute later with no intervention. A bug that
    // fixes itself before it can be investigated.
    STUB.rows = rows(2);
    const { fetchDictOverrides, fetchAllDictOverrides, invalidateDictOverrideCache } = await loadFresh();

    await fetchDictOverrides('B1');
    await fetchAllDictOverrides();
    expect(STUB.calls).toHaveLength(2);

    // A new mapping lands.
    STUB.rows = rows(3);
    invalidateDictOverrideCache('B1');

    expect(await fetchDictOverrides('B1')).toHaveLength(3);
    expect(await fetchAllDictOverrides()).toHaveLength(3);
    expect(STUB.calls).toHaveLength(4);
  });

  it('clears every family when called with no argument', async () => {
    STUB.rows = [...rows(1, 'B1'), ...rows(1, 'B4')];
    const { fetchDictOverrides, invalidateDictOverrideCache } = await loadFresh();

    await fetchDictOverrides('B1');
    await fetchDictOverrides('B4');
    invalidateDictOverrideCache();

    await fetchDictOverrides('B1');
    await fetchDictOverrides('B4');

    expect(STUB.calls).toHaveLength(4);
  });

  it('invalidating ONE family leaves the others cached', async () => {
    // The narrow invalidation is deliberate — clearing everything on every
    // accept would re-fetch all 43 families' dictionaries per click.
    STUB.rows = [...rows(1, 'B1'), ...rows(1, 'B4')];
    const { fetchDictOverrides, invalidateDictOverrideCache } = await loadFresh();

    await fetchDictOverrides('B1');
    await fetchDictOverrides('B4');
    invalidateDictOverrideCache('B1');

    await fetchDictOverrides('B4');

    expect(STUB.calls).toHaveLength(2);
  });
});
