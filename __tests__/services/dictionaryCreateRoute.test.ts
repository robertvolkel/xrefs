/**
 * POST /api/admin/atlas/dictionaries — accepting ONE mapping.
 *
 * Fourth route suite, and the highest-volume path in the system: 97% of the
 * 2,032 accepted mappings in live data came through here, every one of them
 * untested until now.
 *
 * Two things this route does are easy to get wrong and impossible to fix later,
 * because `atlas_param_decisions` is append-only:
 *
 *   1. WHAT NAME IS STORED. The override column is canonicalized (NFC +
 *      lowercase + trim) because that is the join key the ingest mapper uses.
 *      The decision LOG must receive the RAW name, because the helper keeps a
 *      separate display copy — and vendor parameters carry meaningful case
 *      ("RDS(ON) Max. (mΩ)"). Handing it the pre-lowercased form threw away the
 *      only record of what the engineer actually saw. That defect shipped once.
 *   2. ACCEPT vs EDIT. Overwriting a live mapping is an edit. The `hadPrior`
 *      read has to happen as part of the deactivate, while the prior state is
 *      still observable.
 */

import { createSupabaseMock, type SupabaseMock, type MockSpec } from '../helpers/supabaseMock';
import { invokeRoute } from '../helpers/routeHarness';

declare global {
  var __sbMock: SupabaseMock;
}

jest.mock('../../lib/supabase/server', () => ({
  createClient: async () => globalThis.__sbMock.client,
}));
jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => globalThis.__sbMock.client,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports
jest.mock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').adminGuard());
jest.mock('../../lib/services/atlasDictOverrides', () => ({
  invalidateDictOverrideCache: jest.fn(),
}));
jest.mock('../../lib/services/triageQueueCache', () => ({
  invalidateTriageQueueCache: jest.fn(async () => undefined),
}));

import { POST } from '@/app/api/admin/atlas/dictionaries/route';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { TEST_ADMIN_ID } from '../helpers/authGuard';
import { canonicalizeParamName } from '@/lib/services/paramDecisionTypes';

interface CreateResponse {
  success: boolean;
  error?: string;
  data?: { id: string; paramName: string; familyId: string };
}

const accept = (over: Record<string, unknown> = {}) => ({
  familyId: 'B1',
  paramName: 'VR(V)',
  action: 'add',
  attributeId: 'vrrm',
  attributeName: 'Repetitive Peak Reverse Voltage',
  changeReason: 'accepted from Triage',
  ...over,
});

let mock: SupabaseMock;

function seed(overrides: Array<Record<string, unknown>> = [], fail?: MockSpec['fail']) {
  mock = createSupabaseMock({
    tables: {
      atlas_dictionary_overrides: overrides.map((r) => ({ ...r })),
      atlas_param_decisions: [],
    },
    fail,
  });
  globalThis.__sbMock = mock;
  (invalidateDictOverrideCache as jest.Mock).mockClear();
  (invalidateTriageQueueCache as jest.Mock).mockClear();
}

const run = (body: Record<string, unknown>) => invokeRoute<CreateResponse>(POST, { body });
const decisions = () => mock.rows('atlas_param_decisions');
const activeOverrides = () => mock.rows('atlas_dictionary_overrides').filter((r) => r.is_active);

describe('accepting a first-time mapping', () => {
  it('inserts the override and logs exactly one mapping_accepted', async () => {
    seed();

    const res = await run(accept());

    expect(res.status).toBe(201);
    expect(activeOverrides()).toHaveLength(1);
    expect(activeOverrides()[0]).toMatchObject({
      family_id: 'B1',
      param_name: 'vr(v)',
      attribute_id: 'vrrm',
      created_by: TEST_ADMIN_ID,
    });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      decision: 'mapping_accepted',
      family_id: 'B1',
      attribute_id: 'vrrm',
      decided_by: TEST_ADMIN_ID,
      note: 'accepted from Triage',
      source: 'ui',
    });
    expect(invalidateDictOverrideCache).toHaveBeenCalledWith('B1');
    expect(invalidateTriageQueueCache).toHaveBeenCalled();
  });

  it('records no evidence when the engineer did not run an AI investigation', async () => {
    // The honest record of a decision made without AI — the common case. The
    // log is append-only, so evidence absent at insert time can never be added.
    seed();

    await run(accept());

    expect(decisions()[0].evidence).toBeNull();
    expect(decisions()[0].investigation_id).toBeNull();
  });

  it('carries the AI analysis through when one informed the decision', async () => {
    seed();

    await run(accept({ analysis: { verdict: 'accept', confidence: 'high' }, investigationId: 'inv-7' }));

    expect(decisions()[0].evidence).toEqual({ verdict: 'accept', confidence: 'high' });
    expect(decisions()[0].investigation_id).toBe('inv-7');
  });
});

describe('what name gets stored where', () => {
  it('canonicalizes the OVERRIDE key but keeps the RAW name for display', async () => {
    // The override column is the join key the ingest mapper reads; the display
    // name is the only surviving record of what the engineer saw on screen.
    seed();
    const raw = '  RDS(ON) Max. (mΩ)  ';

    await run(accept({ paramName: raw, attributeId: 'rds_on', attributeName: 'On Resistance' }));

    expect(activeOverrides()[0].param_name).toBe('rds(on) max. (mω)');
    expect(decisions()[0].param_name).toBe('rds(on) max. (mω)');
    expect(decisions()[0].param_name_display).toBe(raw);
  });

  it('normalizes Unicode form, so NFD input joins the same row as NFC', async () => {
    // The same characters persist in NFC or NFD depending on the source file's
    // encoding. They render identically, so a split here is invisible on screen
    // and silently forks one parameter's history in two.
    seed();
    const nfd = 'Vé(V)'.normalize('NFD');
    expect(nfd).not.toBe(nfd.normalize('NFC')); // the fixture really is decomposed

    await run(accept({ paramName: nfd }));

    expect(activeOverrides()[0].param_name).toBe('vé(v)'.normalize('NFC'));
    expect(decisions()[0].param_name).toBe('vé(v)'.normalize('NFC'));
  });

  it('stores the same key the decision log canonicalizer produces', async () => {
    // Two copies of one transform in two files. If they drift, per-parameter
    // history splits with nothing to fail — so pin them against each other.
    seed();
    const raw = ' Ω-RATING (Ω) ';

    await run(accept({ paramName: raw }));

    expect(activeOverrides()[0].param_name).toBe(canonicalizeParamName(raw));
    expect(decisions()[0].param_name).toBe(canonicalizeParamName(raw));
  });
});

describe('overwriting a mapping that already exists', () => {
  it('logs mapping_EDITED and deactivates the predecessor', async () => {
    seed([{ id: 'ov-old', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'vrwm', is_active: true }]);

    const res = await run(accept({ attributeId: 'vrrm' }));

    expect(res.status).toBe(201);
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('mapping_edited');

    // Exactly one active row survives — what the partial unique index requires.
    const live = activeOverrides().filter((o) => o.param_name === 'vr(v)');
    expect(live).toHaveLength(1);
    expect(live[0].attribute_id).toBe('vrrm');
  });

  it('scopes the deactivate to family + param + active', async () => {
    // Any missing filter here deactivates mappings the engineer never touched.
    seed([{ id: 'ov-old', family_id: 'B1', param_name: 'vr(v)', is_active: true }]);

    await run(accept());

    const [upd] = mock.writes('atlas_dictionary_overrides', 'update');
    expect(upd.filters).toEqual([
      ['eq', 'family_id', 'B1'],
      ['eq', 'param_name', 'vr(v)'],
      ['eq', 'is_active', true],
    ]);
    // Reading back what changed is what tells accept from edit.
    expect(upd.selected).toBe(true);
  });

  it('an INACTIVE prior mapping is a fresh accept, not an edit', async () => {
    seed([{ id: 'ov-dead', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'vrwm', is_active: false }]);

    await run(accept());

    expect(decisions()[0].decision).toBe('mapping_accepted');
  });

  it('a mapping in ANOTHER family is untouched and does not count as prior', async () => {
    seed([{ id: 'ov-b4', family_id: 'B4', param_name: 'vr(v)', attribute_id: 'vrwm', is_active: true }]);

    await run(accept({ familyId: 'B1' }));

    expect(decisions()[0].decision).toBe('mapping_accepted');
    expect(mock.rows('atlas_dictionary_overrides').find((o) => o.id === 'ov-b4')!.is_active).toBe(true);
  });
});

describe('when the insert fails', () => {
  it('returns the specific 500 and logs no decision for a mapping that does not exist', async () => {
    seed([], { atlas_dictionary_overrides: { insert: { message: 'unique violation' } } });

    const res = await run(accept());

    expect(res.status).toBe(500);
    // The MESSAGE is asserted, not just the status. Removing the explicit
    // error check does not change the status — the route falls through to
    // `data.id` on a null and the outer catch returns 500 anyway — so a
    // status-only assertion cannot tell a handled failure from a crash, and
    // the mutation that deletes the check survives. This distinction is also
    // what the operator sees: a named failure versus "Internal server error".
    expect(res.json.error).toBe('Failed to create dictionary override');
    expect(decisions()).toHaveLength(0);
    // Nothing was created, so nothing is invalidated.
    expect(invalidateDictOverrideCache).not.toHaveBeenCalled();
  });
});

describe('validation rejects before touching the database', () => {
  it.each([
    ['familyId missing', { familyId: undefined }, 'familyId is required'],
    ['paramName missing', { paramName: undefined }, 'paramName is required'],
    ['action not in the enum', { action: 'delete' }, 'action must be modify, add, or remove'],
    ['changeReason blank', { changeReason: '   ' }, 'changeReason is required'],
    ['add without attributeId', { attributeId: undefined }, 'attributeId is required for add action'],
    ['add without attributeName', { attributeName: undefined }, 'attributeName is required for add action'],
    ['negative sortOrder', { sortOrder: -1 }, 'sortOrder must be a non-negative number'],
  ])('%s → 400, no write', async (_label, patch, message) => {
    seed();

    const res = await run(accept(patch as Record<string, unknown>));

    expect(res.status).toBe(400);
    expect(res.json.error).toBe(message);
    expect(mock.ops()).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });

  it('refuses to modify a param the base dictionary does not contain', async () => {
    seed();

    const res = await run(accept({ action: 'modify', paramName: 'not-a-real-param-xyz' }));

    expect(res.status).toBe(400);
    expect(res.json.error).toContain('Cannot modify');
    expect(mock.ops()).toHaveLength(0);
  });

  it('a non-admin gets 403 and writes nothing', async () => {
    seed();

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    jest.doMock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').forbiddenGuard());
    const { POST: Guarded } = await import('@/app/api/admin/atlas/dictionaries/route');

    const res = await invokeRoute<CreateResponse>(Guarded, { body: accept() });

    expect(res.status).toBe(403);
    expect(mock.ops()).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });
});
