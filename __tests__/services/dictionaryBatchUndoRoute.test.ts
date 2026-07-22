/**
 * POST /api/admin/atlas/dictionaries/batch/undo
 *
 * This route reverses a Batch Accept. It used the RLS-SUBJECT cookie client
 * while its sibling (param-decisions/undo) used the service client.
 *
 * Why that is worse than it looks: a policy-filtered UPDATE does not error. It
 * returns `{ data: [], error: null }` — success-shaped and empty, which is
 * exactly what "nothing needed undoing" looks like. So the route reported a
 * successful undo, invalidated no caches, appended no decision rows, and left
 * every mapping active. Nothing anywhere said the undo had not happened.
 *
 * ⚠️ Testing this needs care. `supabaseMock` deliberately does not implement
 * RLS, so pointing both clients at one instance makes them INDISTINGUISHABLE —
 * a suite written that way passes whichever client the route picks (verified by
 * mutation: swapping them changed nothing). The cookie client is therefore
 * modelled by its real failure signature: empty result, no error.
 */

import { createSupabaseMock, type SupabaseMock } from '../helpers/supabaseMock';
import { invokeRoute } from '../helpers/routeHarness';

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => globalThis.__sbMock.client,
}));
/**
 * The RLS-subject client: every write silently matches zero rows. If the route
 * regresses to this client, the assertions below fail — which is the whole
 * point of modelling it this way rather than aliasing it to the service mock.
 */
jest.mock('../../lib/supabase/server', () => {
  const emptyChain: Record<string, unknown> = {};
  Object.assign(emptyChain, {
    update: () => emptyChain,
    eq: () => emptyChain,
    in: () => emptyChain,
    select: () => Promise.resolve({ data: [], error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  });
  return { createClient: async () => ({ from: () => emptyChain }) };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports
jest.mock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').adminGuard());
jest.mock('../../lib/services/atlasDictOverrides', () => ({
  invalidateDictOverrideCache: jest.fn(),
}));
jest.mock('../../lib/services/triageQueueCache', () => ({
  invalidateTriageQueueCache: jest.fn(async () => undefined),
}));

import { POST } from '@/app/api/admin/atlas/dictionaries/batch/undo/route';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { TEST_ADMIN_ID } from '../helpers/authGuard';

let mock: SupabaseMock;

function seed(overrides: Array<Record<string, unknown>>) {
  mock = createSupabaseMock({
    tables: {
      atlas_dictionary_overrides: overrides.map((r) => ({ ...r })),
      atlas_param_decisions: [],
    },
  });
  globalThis.__sbMock = mock;
  (invalidateDictOverrideCache as jest.Mock).mockClear();
}

const rows = () => mock.rows('atlas_dictionary_overrides');
const appended = () => mock.rows('atlas_param_decisions');
const undo = (overrideIds: string[]) =>
  invokeRoute<{ success: boolean; undone?: number; error?: string }>(POST, { body: { overrideIds } });

const ACTIVE = (id: string, param: string) => ({
  id,
  family_id: 'B5',
  param_name: param,
  attribute_id: 'rds_on',
  attribute_name: 'Rds(on)',
  is_active: true,
});

describe('undoing a Batch Accept', () => {
  it('actually deactivates the overrides it reports — not a silent no-op', async () => {
    seed([ACTIVE('ov-1', 'rds(on)'), ACTIVE('ov-2', 'ciss')]);

    const res = await undo(['ov-1']);

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    // The row really changed. Under the RLS-subject client this stays true
    // while the response still says success — the exact bug.
    expect(rows().find((r) => r.id === 'ov-1')!.is_active).toBe(false);
    expect(rows().find((r) => r.id === 'ov-2')!.is_active).toBe(true);
  });

  it('appends a mapping_revoked row crediting the admin who undid it', async () => {
    seed([ACTIVE('ov-1', 'rds(on)')]);

    await undo(['ov-1']);

    expect(appended()).toHaveLength(1);
    expect(appended()[0]).toMatchObject({
      decision: 'mapping_revoked',
      override_id: 'ov-1',
      param_name: 'rds(on)',
      decided_by: TEST_ADMIN_ID,
      family_id: 'B5',
      source: 'ui',
    });
  });

  it('guards on is_active so a second undo cannot append a phantom revocation', async () => {
    seed([ACTIVE('ov-1', 'rds(on)')]);

    await undo(['ov-1']);
    await undo(['ov-1']);

    expect(appended()).toHaveLength(1);
  });

  it('busts the dict cache for each affected family', async () => {
    seed([ACTIVE('ov-1', 'rds(on)')]);

    await undo(['ov-1']);

    expect(invalidateDictOverrideCache).toHaveBeenCalledWith('B5');
  });

  it('rejects a request with no overrideIds before touching the table', async () => {
    seed([ACTIVE('ov-1', 'rds(on)')]);

    const res = await undo([]);

    expect(res.status).toBe(400);
    expect(rows().find((r) => r.id === 'ov-1')!.is_active).toBe(true);
  });
});
