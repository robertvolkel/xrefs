/**
 * POST /api/admin/atlas/dictionaries/batch
 *
 * Third route suite, and the one with the largest blast radius: a single click
 * writes N parameter mappings across F families. When this route is wrong it is
 * wrong N times, and the engineer sees one success toast.
 *
 * `prepareBatchItems` (normalize / validate / dedupe) is pure and already
 * covered by triageBatchApprove.test.ts. What was never executed is everything
 * AFTER it — the part that talks to the database:
 *
 *   - the three round trips per family must stay ORDERED (check → deactivate →
 *     insert). The partial unique index `(family_id, param_name) WHERE is_active`
 *     tolerates no other order, and a reordering is silent in production.
 *   - a param already mapped to the SAME attribute must be skipped, not churned
 *   - a param that had a LIVE mapping to a DIFFERENT attribute is an EDIT, and
 *     must be logged `mapping_edited`. Logging it as `mapping_accepted` is how a
 *     batch that silently re-pointed 50 existing mappings read as 50 new ones,
 *     hiding precisely what an auditor is looking for.
 *   - a failed bulk insert must fall back per-row so ONE bad row cannot drop a
 *     whole family's mappings
 *   - exactly ONE triage-cache invalidation regardless of family count (the
 *     recompute is expensive at Atlas scale)
 */

import { createSupabaseMock, type SupabaseMock } from '../helpers/supabaseMock';
import { invokeRoute } from '../helpers/routeHarness';

declare global {
  // eslint-disable-next-line no-var
  var __sbMock: SupabaseMock;
}

// The route writes via createClient; paramDecisionLog writes via
// createServiceClient. One store, so "the override landed AND it was logged as
// an edit" is a single fact rather than two hopeful assertions.
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

import { POST } from '@/app/api/admin/atlas/dictionaries/batch/route';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { TEST_ADMIN_ID } from '../helpers/authGuard';

interface BatchResponse {
  success: boolean;
  batchId: string | null;
  approvedIds: string[];
  approved: Array<{ paramName: string; familyId: string; override: Record<string, unknown> }>;
  skipped: Array<{ paramName: string; familyId: string; reason: string }>;
  failed: Array<{ paramName: string; familyId: string; reason: string }>;
  deduped: number;
}

type Item = Record<string, unknown>;

const item = (over: Item = {}): Item => ({
  familyId: 'B1',
  paramName: 'VR(V)',
  attributeId: 'vrrm',
  attributeName: 'Repetitive Peak Reverse Voltage',
  ...over,
});

let mock: SupabaseMock;

function seed(overrides: Array<Record<string, unknown>> = [], fail?: Parameters<typeof createSupabaseMock>[0]['fail']) {
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

const run = (items: Item[]) => invokeRoute<BatchResponse>(POST, { body: { items } });
const decisions = () => mock.rows('atlas_param_decisions');
const activeOverrides = () => mock.rows('atlas_dictionary_overrides').filter((r) => r.is_active);

describe('accepting a clean batch', () => {
  it('writes each mapping and logs one mapping_accepted per param', async () => {
    seed();

    const res = await run([
      item({ paramName: 'VR(V)', attributeId: 'vrrm' }),
      item({ paramName: 'IF(A)', attributeId: 'if_avg', attributeName: 'Average Forward Current' }),
    ]);

    expect(res.status).toBe(200);
    expect(res.json.approved).toHaveLength(2);
    expect(res.json.approvedIds).toHaveLength(2);
    expect(res.json.failed).toEqual([]);

    // Stored normalized (NFC + lower + trim) — this is the join key the mapper
    // and the decision log both rely on.
    expect(activeOverrides().map((o) => o.param_name).sort()).toEqual(['if(a)', 'vr(v)']);

    expect(decisions()).toHaveLength(2);
    for (const d of decisions()) {
      expect(d).toMatchObject({ decision: 'mapping_accepted', decided_by: TEST_ADMIN_ID, source: 'batch' });
      expect(d.batch_id).toBe(res.json.batchId);
    }
  });

  it('stamps every decision with the SAME batch id, so Undo can find them all', async () => {
    seed();

    const res = await run([item({ paramName: 'a' }), item({ paramName: 'b' }), item({ familyId: 'B4', paramName: 'c' })]);

    const batchIds = new Set(decisions().map((d) => d.batch_id));
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toBe(res.json.batchId);
  });

  it('keeps the three writes per family in check → deactivate → insert order', async () => {
    // The partial unique index tolerates no other order. Inserting before the
    // deactivate raises a unique violation; deactivating before reading the
    // prior state loses the information that says accept-vs-edit.
    seed([{ id: 'ov-old', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'other', is_active: true }]);

    await run([item()]);

    expect(mock.opOrder('atlas_dictionary_overrides')).toEqual(['select', 'update', 'insert']);
  });
});

describe('a param that already carries a mapping', () => {
  it('skips it when the attribute is identical — no churn, no log row', async () => {
    seed([{ id: 'ov-same', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'vrrm', is_active: true }]);

    const res = await run([item()]);

    expect(res.json.approved).toEqual([]);
    expect(res.json.skipped).toEqual([
      { paramName: 'VR(V)', familyId: 'B1', reason: 'already mapped to same attribute' },
    ]);
    expect(decisions()).toHaveLength(0);
    // Nothing changed, so nothing is invalidated.
    expect(invalidateDictOverrideCache).not.toHaveBeenCalled();
    expect(invalidateTriageQueueCache).not.toHaveBeenCalled();
  });

  it('logs mapping_EDITED when it re-points a live mapping to a different attribute', async () => {
    // The defect this pins: recorded as `mapping_accepted`, a batch that
    // re-pointed existing mappings was indistinguishable from one that created
    // them — and the decision log exists to make exactly that distinction.
    seed([{ id: 'ov-old', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'vrwm', is_active: true }]);

    const res = await run([item({ attributeId: 'vrrm' })]);

    expect(res.json.approved).toHaveLength(1);
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      decision: 'mapping_edited',
      param_name: 'vr(v)',
      attribute_id: 'vrrm',
      source: 'batch',
    });

    // The predecessor is deactivated, the successor is live — exactly one active
    // row survives, which is what the unique index requires.
    const live = activeOverrides().filter((o) => o.param_name === 'vr(v)');
    expect(live).toHaveLength(1);
    expect(live[0].attribute_id).toBe('vrrm');
  });

  it('does NOT treat an INACTIVE prior mapping as an edit', async () => {
    // A revoked mapping is not a predecessor being replaced — re-accepting a
    // param that was previously revoked is a fresh accept.
    seed([{ id: 'ov-dead', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'vrwm', is_active: false }]);

    await run([item({ attributeId: 'vrrm' })]);

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('mapping_accepted');
  });

  it('scopes the same-attribute check to the family, not across families', async () => {
    // `vr(v)` mapped to vrrm under B1 says nothing about B4. Skipping on a
    // cross-family match would silently refuse a legitimate mapping.
    seed([{ id: 'ov-b1', family_id: 'B1', param_name: 'vr(v)', attribute_id: 'vrrm', is_active: true }]);

    const res = await run([item({ familyId: 'B4', attributeId: 'vrrm' })]);

    expect(res.json.approved).toHaveLength(1);
    expect(res.json.skipped).toEqual([]);
    const [read] = mock.writes('atlas_dictionary_overrides', 'select');
    expect(read.filters).toContainEqual(['eq', 'family_id', 'B4']);
  });
});

describe('when an insert fails', () => {
  it('falls back per-row so one bad row does not drop the family', async () => {
    // Injected on `insert`, the bulk write fails and the per-row retries fail
    // too — the point under test is that the fallback RUNS and reports each row
    // individually rather than losing the family silently.
    seed([], { atlas_dictionary_overrides: { insert: { message: 'unique violation' } } });

    const res = await run([item({ paramName: 'a' }), item({ paramName: 'b' })]);

    expect(res.status).toBe(200);
    expect(res.json.approved).toEqual([]);
    expect(res.json.failed).toHaveLength(2);
    expect(res.json.failed[0].reason).toBe('unique violation');

    // One bulk attempt, then one retry per row: 1 + 2.
    expect(mock.writes('atlas_dictionary_overrides', 'insert')).toHaveLength(3);
  });

  it('reports a failed row without claiming it in the decision log', async () => {
    seed([], { atlas_dictionary_overrides: { insert: { message: 'nope' } } });

    await run([item()]);

    expect(decisions()).toHaveLength(0);
  });
});

describe('cache invalidation', () => {
  it('busts the triage cache exactly ONCE no matter how many families', async () => {
    // Per-family invalidation is what made a large batch pathological: the
    // recompute is expensive, and N of them serialize behind one request.
    seed();

    await run([
      item({ familyId: 'B1', paramName: 'a' }),
      item({ familyId: 'B4', paramName: 'b' }),
      item({ familyId: 'C1', paramName: 'c' }),
    ]);

    expect(invalidateTriageQueueCache).toHaveBeenCalledTimes(1);
    // The per-family dict cache IS per family — one call each, deduped by the Set.
    expect((invalidateDictOverrideCache as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual(['B1', 'B4', 'C1']);
  });

  it('invalidates each family once even when it holds several params', async () => {
    seed();

    await run([item({ paramName: 'a' }), item({ paramName: 'b' }), item({ paramName: 'c' })]);

    expect(invalidateDictOverrideCache).toHaveBeenCalledTimes(1);
    expect(invalidateDictOverrideCache).toHaveBeenCalledWith('B1');
  });
});

describe('input handling', () => {
  it('an empty items[] is a 400 before any database work', async () => {
    seed();

    const res = await invokeRoute<BatchResponse>(POST, { body: { items: [] } });

    expect(res.status).toBe(400);
    expect(mock.ops()).toHaveLength(0);
  });

  it('a batch of only invalid rows returns success with a null batchId and writes nothing', async () => {
    seed();

    const res = await run([{ familyId: 'B1' }, { paramName: 'x' }]);

    expect(res.status).toBe(200);
    expect(res.json.batchId).toBeNull();
    expect(res.json.skipped).toHaveLength(2);
    expect(mock.ops()).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });

  it('counts within-request duplicates and writes the param once', async () => {
    // Two cosmetic variants collapsing to one key would violate the partial
    // unique index inside a single bulk insert and fail the whole chunk.
    seed();

    const res = await run([item({ paramName: 'VR(V)' }), item({ paramName: ' vr(v) ' })]);

    expect(res.json.deduped).toBe(1);
    expect(res.json.approved).toHaveLength(1);
    expect(activeOverrides()).toHaveLength(1);
    expect(decisions()).toHaveLength(1);
  });

  it('a non-admin gets 403 and writes nothing', async () => {
    seed();

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    jest.doMock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').forbiddenGuard());
    const { POST: Guarded } = await import('@/app/api/admin/atlas/dictionaries/batch/route');

    const res = await invokeRoute<BatchResponse>(Guarded, { body: { items: [item()] } });

    expect(res.status).toBe(403);
    expect(mock.ops()).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });
});
