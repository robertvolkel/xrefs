/**
 * PATCH / DELETE /api/admin/atlas/dictionaries/[overrideId]
 *
 * The FIRST executing route-handler test in this repo. 105 route.ts files, and
 * until now none of them was ever invoked by a test — while every write to a
 * parameter mapping happens in a route.
 *
 * This file is first because this route is the ONLY pre-existing code whose
 * behaviour the Decision Log branch changed, and all three changes shipped
 * with no behavioural test:
 *   1. PATCH early-returns on a body with no recognised field
 *   2. PATCH returns 404 for an unknown id (previously silent success)
 *   3. DELETE filters `.eq('is_active', true)`, and on the already-inactive
 *      path no longer calls invalidateDictOverrideCache
 *
 * The decision-log assertions run the REAL recordParamDecision against the
 * mock, so "the override went inactive AND exactly one mapping_revoked row was
 * appended" is one assertion rather than two hopeful ones.
 */

import { createSupabaseMock, type SupabaseMock } from '../helpers/supabaseMock';
import { invokeRoute } from '../helpers/routeHarness';

// Typed global so the mock can be shared with jest.mock factories without an
// `any` cast at every use. jest hoists those factories above any `let`, which
// is why the instance travels via globalThis rather than a closure variable.
declare global {
  var __sbMock: SupabaseMock;
}

// One mock instance shared by BOTH supabase entry points. The route writes via
// createClient (user-scoped) while paramDecisionLog writes via
// createServiceClient — they must see the same store or the cross-table
// assertion is meaningless. Read off globalThis because jest hoists these
// factories above any `let` declaration. Paths are RELATIVE: the `@/` alias
// resolves for imports but not inside jest.mock, which is why every existing
// mock in this repo is written ../../ form.
jest.mock('../../lib/supabase/server', () => ({
  createClient: async () => globalThis.__sbMock.client,
}));
jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => globalThis.__sbMock.client,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted; import is not available inside them
jest.mock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').adminGuard());
jest.mock('../../lib/services/atlasDictOverrides', () => ({
  invalidateDictOverrideCache: jest.fn(),
}));
jest.mock('../../lib/services/triageQueueCache', () => ({
  invalidateTriageQueueCache: jest.fn(async () => undefined),
}));

import { PATCH, DELETE } from '@/app/api/admin/atlas/dictionaries/[overrideId]/route';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { TEST_ADMIN_ID } from '../helpers/authGuard';

const ACTIVE = {
  id: 'ov-active',
  family_id: 'B1',
  param_name: 'vr(v)',
  attribute_id: 'vrrm',
  attribute_name: 'Repetitive Peak Reverse Voltage',
  is_active: true,
  created_by: TEST_ADMIN_ID,
  created_at: '2026-05-01T09:00:00Z',
  updated_at: '2026-05-01T09:00:00Z',
};
const INACTIVE = { ...ACTIVE, id: 'ov-dead', is_active: false };

let mock: SupabaseMock;

function seed() {
  mock = createSupabaseMock({
    tables: {
      atlas_dictionary_overrides: [{ ...ACTIVE }, { ...INACTIVE }],
      atlas_param_decisions: [],
    },
  });
  globalThis.__sbMock = mock;
  (invalidateDictOverrideCache as jest.Mock).mockClear();
  (invalidateTriageQueueCache as jest.Mock).mockClear();
}

beforeEach(seed);

const decisions = () => mock.rows('atlas_param_decisions');
const overrides = () => mock.rows('atlas_dictionary_overrides');
const findOverride = (id: string) => overrides().find((r) => r.id === id);

describe('PATCH — editing a mapping', () => {
  it('a body with no recognised field writes nothing and logs nothing', async () => {
    // Previously this bumped updated_at and appended a mapping_edited row for
    // an edit that never happened. updated_at is load-bearing: for a row later
    // deactivated with nothing replacing it, that column IS the revocation
    // timestamp the backfill reads.
    const res = await invokeRoute(PATCH, { params: { overrideId: 'ov-active' }, body: { nonsense: 1 } });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true, unchanged: true });
    expect(mock.writes('atlas_dictionary_overrides', 'update')).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
    expect(findOverride('ov-active')!.updated_at).toBe('2026-05-01T09:00:00Z');
    expect(invalidateDictOverrideCache).not.toHaveBeenCalled();
  });

  it('an unknown override id is a 404 and logs nothing', async () => {
    const res = await invokeRoute(PATCH, {
      params: { overrideId: 'does-not-exist' },
      body: { attributeId: 'x', attributeName: 'X' },
    });

    expect(res.status).toBe(404);
    expect(decisions()).toHaveLength(0);
  });

  it('a real edit updates the row, appends ONE mapping_edited, and busts both caches', async () => {
    const res = await invokeRoute(PATCH, {
      params: { overrideId: 'ov-active' },
      body: { attributeId: 'vrwm', attributeName: 'Working Peak Reverse Voltage', changeReason: 'corrected' },
    });

    expect(res.status).toBe(200);
    expect(findOverride('ov-active')!.attribute_id).toBe('vrwm');

    const logged = decisions();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      decision: 'mapping_edited',
      param_name: 'vr(v)',
      attribute_id: 'vrwm',
      override_id: 'ov-active',
      decided_by: TEST_ADMIN_ID,
      note: 'corrected',
      source: 'ui',
    });
    expect(invalidateDictOverrideCache).toHaveBeenCalledWith('B1');
    expect(invalidateTriageQueueCache).toHaveBeenCalled();
  });
});

describe('DELETE — revoking a mapping', () => {
  it('deactivates an active override and appends exactly one mapping_revoked', async () => {
    const res = await invokeRoute(DELETE, { params: { overrideId: 'ov-active' }, method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(findOverride('ov-active')!.is_active).toBe(false);

    const logged = decisions();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      decision: 'mapping_revoked',
      param_name: 'vr(v)',
      override_id: 'ov-active',
      decided_by: TEST_ADMIN_ID,
    });
    expect(invalidateDictOverrideCache).toHaveBeenCalledWith('B1');
  });

  it('guards the update on is_active — the filter itself, not just its effect', async () => {
    // Branch change #3 IS this filter. Asserting the recorded filter list pins
    // it behaviourally; a source-text regex would pass even if the call moved
    // somewhere it no longer runs.
    await invokeRoute(DELETE, { params: { overrideId: 'ov-active' }, method: 'DELETE' });

    const [upd] = mock.writes('atlas_dictionary_overrides', 'update');
    expect(upd.filters).toEqual([
      ['eq', 'id', 'ov-active'],
      ['eq', 'is_active', true],
    ]);
    expect(upd.selected).toBe(true);
  });

  it('an ALREADY-INACTIVE override logs nothing and skips the dict-cache bust', async () => {
    // The permanent-phantom-row defect: without the guard this appended a
    // second mapping_revoked crediting this admin, now, for a revocation that
    // happened earlier — into a table with no DELETE policy.
    const res = await invokeRoute(DELETE, { params: { overrideId: 'ov-dead' }, method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true, alreadyInactive: true });
    expect(decisions()).toHaveLength(0);
    // Pins the deliberate narrowing so it stays a diff rather than an accident.
    expect(invalidateDictOverrideCache).not.toHaveBeenCalled();
    expect(invalidateTriageQueueCache).toHaveBeenCalled();
  });

  it('a double-click appends ONE decision, not two', async () => {
    await invokeRoute(DELETE, { params: { overrideId: 'ov-active' }, method: 'DELETE' });
    await invokeRoute(DELETE, { params: { overrideId: 'ov-active' }, method: 'DELETE' });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('mapping_revoked');
  });
});

describe('the admin guard runs before any work', () => {
  it('a non-admin gets 403 and touches nothing', async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    jest.doMock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').forbiddenGuard());
    const { DELETE: GuardedDelete } = await import('@/app/api/admin/atlas/dictionaries/[overrideId]/route');

    const res = await invokeRoute(GuardedDelete, { params: { overrideId: 'ov-active' }, method: 'DELETE' });

    expect(res.status).toBe(403);
    expect(findOverride('ov-active')!.is_active).toBe(true);
    expect(decisions()).toHaveLength(0);
  });
});
