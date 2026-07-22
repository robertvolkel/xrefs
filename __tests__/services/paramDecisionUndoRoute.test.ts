/**
 * POST /api/admin/atlas/param-decisions/undo
 *
 * Second route suite. This one is ranked here because every mistake it can make
 * is PERMANENT: `atlas_param_decisions` has no UPDATE and no DELETE policy, so a
 * row appended in error cannot be corrected — only contradicted by a later row.
 *
 * The invariant under test throughout is therefore narrower than "does it work":
 *
 *   THE LOG MUST NEVER CLAIM A TRANSITION THAT DID NOT HAPPEN.
 *
 * Three distinct paths can violate it, and each gets a test that fails when the
 * guard is removed:
 *   - the override was already inactive  → the update matches zero rows
 *   - the status was already cleared     → there is nothing parked to reopen
 *   - the clearing write itself errored  → the param is still parked
 * In all three the correct output is a `skipped` entry and ZERO appended rows.
 *
 * The reverse failure is covered too: every id the caller sends must come back
 * either counted in `undone` or explained in `skipped`, because a caller that
 * asked to undo four decisions and was told "3 undone" has no way to learn
 * which one didn't and why.
 */

import { createSupabaseMock, type SupabaseMock, type MockSpec } from '../helpers/supabaseMock';
import { invokeRoute } from '../helpers/routeHarness';

declare global {
  var __sbMock: SupabaseMock;
}

// This route reads and writes exclusively through createServiceClient, and so
// does paramDecisionLog — but they must still share ONE store, or "the override
// went inactive AND a mapping_revoked row was appended" would be two unrelated
// assertions rather than one fact. Relative paths: the `@/` alias does not
// resolve inside jest.mock.
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

import { POST } from '@/app/api/admin/atlas/param-decisions/undo/route';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { TEST_ADMIN_ID } from '../helpers/authGuard';
import { undoRefusalReason } from '@/lib/services/paramDecisionTypes';

interface UndoResponse {
  success: boolean;
  error?: string;
  undone?: number;
  logged?: boolean;
  skipped?: Array<{ id: string; reason: string }>;
}

/** A decision row as the log stores it, with only the columns the route reads. */
function decisionRow(over: Record<string, unknown>) {
  return {
    id: 'd-1',
    param_name: 'vr(v)',
    param_name_display: 'VR(V)',
    family_id: 'B1',
    decision: 'mapping_accepted',
    override_id: 'ov-1',
    attribute_id: 'vrrm',
    attribute_name: 'Repetitive Peak Reverse Voltage',
    ...over,
  };
}

let mock: SupabaseMock;

interface SeedSpec {
  decisions?: Array<Record<string, unknown>>;
  overrides?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  fail?: MockSpec['fail'];
}

function seed(spec: SeedSpec = {}) {
  mock = createSupabaseMock({
    tables: {
      atlas_param_decisions: (spec.decisions ?? []).map((r) => ({ ...r })),
      atlas_dictionary_overrides: (spec.overrides ?? []).map((r) => ({ ...r })),
      atlas_unmapped_param_notes: (spec.notes ?? []).map((r) => ({ ...r })),
    },
    fail: spec.fail,
  });
  globalThis.__sbMock = mock;
  (invalidateDictOverrideCache as jest.Mock).mockClear();
  (invalidateTriageQueueCache as jest.Mock).mockClear();
}

const undo = (decisionIds: string[]) => invokeRoute<UndoResponse>(POST, { body: { decisionIds } });

/** Rows appended by THIS request. The seed never contains appended rows: the
 *  route only ever reads the decisions table, so anything here is a new write. */
const appended = () => mock.rows('atlas_param_decisions').filter((r) => 'decision' in r && r.decided_by);
const notes = () => mock.rows('atlas_unmapped_param_notes');
const overrides = () => mock.rows('atlas_dictionary_overrides');

describe('undoing an accepted mapping', () => {
  it('deactivates the override and appends exactly one mapping_revoked', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true, updated_at: '2026-05-01T09:00:00Z' }],
    });

    const res = await undo(['d-1']);

    expect(res.status).toBe(200);
    expect(res.json.undone).toBe(1);
    expect(res.json.skipped).toEqual([]);
    expect(overrides().find((o) => o.id === 'ov-1')!.is_active).toBe(false);

    expect(appended()).toHaveLength(1);
    expect(appended()[0]).toMatchObject({
      decision: 'mapping_revoked',
      param_name: 'vr(v)',
      override_id: 'ov-1',
      attribute_id: 'vrrm',
      decided_by: TEST_ADMIN_ID,
      family_id: 'B1',
      source: 'ui',
    });
    expect(invalidateDictOverrideCache).toHaveBeenCalledWith('B1');
    expect(invalidateTriageQueueCache).toHaveBeenCalled();
  });

  it('guards the update on is_active — the filter itself, not just its effect', async () => {
    // This filter is the ONLY thing standing between a double-undo and a
    // permanent phantom revocation. Asserting the recorded filter list pins it
    // behaviourally; asserting only the row state would still pass if the
    // filter moved somewhere it no longer runs.
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    await undo(['d-1']);

    const [upd] = mock.writes('atlas_dictionary_overrides', 'update');
    expect(upd.filters).toEqual([
      ['in', 'id', ['ov-1']],
      ['eq', 'is_active', true],
    ]);
    // Reading back what actually changed is what makes the guard observable.
    expect(upd.selected).toBe(true);
  });

  it('an ALREADY-INACTIVE override is skipped and appends NOTHING', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: false }],
    });

    const res = await undo(['d-1']);

    expect(res.json.undone).toBe(0);
    expect(res.json.skipped).toEqual([
      { id: 'd-1', reason: 'mapping was already inactive — nothing to undo' },
    ]);
    expect(appended()).toHaveLength(0);
    // No family entered the set, so the dict cache is not busted for a mapping
    // this request did not change.
    expect(invalidateDictOverrideCache).not.toHaveBeenCalled();
  });

  it('undoing the same decision twice appends ONE row, not two', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    await undo(['d-1']);
    const second = await undo(['d-1']);

    expect(second.json.undone).toBe(0);
    expect(appended()).toHaveLength(1);
  });

  it('a mapping decision with no linked override is skipped, not silently dropped', async () => {
    seed({ decisions: [decisionRow({ override_id: null })], overrides: [] });

    const res = await undo(['d-1']);

    expect(res.json.undone).toBe(0);
    expect(res.json.skipped).toEqual([{ id: 'd-1', reason: 'no linked mapping to revert' }]);
    expect(appended()).toHaveLength(0);
  });

  it('a failed override update is a 500 and appends nothing', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
      fail: { atlas_dictionary_overrides: { update: { message: 'deadlock detected' } } },
    });

    const res = await undo(['d-1']);

    expect(res.status).toBe(500);
    expect(res.json.error).toContain('deadlock detected');
    expect(appended()).toHaveLength(0);
  });
});

describe('undoing a parked status', () => {
  const DEFERRED = decisionRow({ id: 'd-2', decision: 'deferred', override_id: null, family_id: null });

  it('keeps a written note and nulls only the status', async () => {
    // The note is the engineer's reasoning. Reopening the parameter must not
    // destroy it — that is a separate decision (`note_cleared`) that nobody made.
    seed({
      decisions: [DEFERRED],
      notes: [{ param_name: 'VR(V)', note: 'waiting on the datasheet', status: 'deferred', flagged_by: 'x' }],
    });

    const res = await undo(['d-2']);

    expect(res.json.undone).toBe(1);
    const row = notes().find((n) => n.param_name === 'VR(V)')!;
    expect(row.status).toBeNull();
    expect(row.note).toBe('waiting on the datasheet');
    expect(row.updated_by).toBe(TEST_ADMIN_ID);

    expect(mock.writes('atlas_unmapped_param_notes', 'delete')).toHaveLength(0);
    expect(appended()).toHaveLength(1);
    expect(appended()[0]).toMatchObject({ decision: 'reopened', param_name: 'vr(v)', decided_by: TEST_ADMIN_ID });
  });

  it('deletes the row outright when there is no note worth keeping', async () => {
    seed({
      decisions: [DEFERRED],
      notes: [{ param_name: 'VR(V)', note: '   ', status: 'deferred' }],
    });

    const res = await undo(['d-2']);

    expect(res.json.undone).toBe(1);
    expect(notes()).toHaveLength(0);
    expect(appended()[0]).toMatchObject({ decision: 'reopened' });
  });

  it('looks the note up by the DISPLAY name, which is what that table stores', async () => {
    // atlas_unmapped_param_notes stores the raw vendor spelling; the decision
    // log stores it canonicalized. Joining on the canonical form would find
    // nothing and report "already cleared" for a param that is still parked.
    seed({
      decisions: [DEFERRED],
      notes: [{ param_name: 'VR(V)', note: null, status: 'deferred' }],
    });

    await undo(['d-2']);

    const [read] = mock.writes('atlas_unmapped_param_notes', 'select');
    expect(read.filters).toEqual([['eq', 'param_name', 'VR(V)']]);
  });

  it('an ALREADY-CLEARED status is skipped and appends NOTHING', async () => {
    seed({
      decisions: [DEFERRED],
      notes: [{ param_name: 'VR(V)', note: 'kept', status: null }],
    });

    const res = await undo(['d-2']);

    expect(res.json.undone).toBe(0);
    expect(res.json.skipped).toEqual([
      { id: 'd-2', reason: 'status was already cleared — nothing to undo' },
    ]);
    expect(appended()).toHaveLength(0);
  });

  it('a MISSING notes row is skipped rather than treated as reopened', async () => {
    seed({ decisions: [DEFERRED], notes: [] });

    const res = await undo(['d-2']);

    expect(res.json.undone).toBe(0);
    expect(res.json.skipped![0].reason).toBe('status was already cleared — nothing to undo');
    expect(appended()).toHaveLength(0);
  });

  it('a FAILED clear is skipped — the log never claims a reopen that did not happen', async () => {
    // The defect this pins: appending `reopened` off an unchecked write leaves
    // the param parked in Triage while the log permanently says otherwise, and
    // an append-only table cannot retract it.
    seed({
      decisions: [DEFERRED],
      notes: [{ param_name: 'VR(V)', note: 'keep me', status: 'deferred' }],
      fail: { atlas_unmapped_param_notes: { update: { message: 'permission denied' } } },
    });

    const res = await undo(['d-2']);

    expect(res.json.undone).toBe(0);
    expect(res.json.skipped).toEqual([
      { id: 'd-2', reason: 'could not clear the status: permission denied' },
    ]);
    expect(appended()).toHaveLength(0);
  });

  it('a FAILED delete is skipped too — same invariant, other branch', async () => {
    seed({
      decisions: [DEFERRED],
      notes: [{ param_name: 'VR(V)', note: null, status: 'deferred' }],
      fail: { atlas_unmapped_param_notes: { delete: { message: 'permission denied' } } },
    });

    const res = await undo(['d-2']);

    expect(res.json.undone).toBe(0);
    expect(res.json.skipped![0].reason).toBe('could not clear the status: permission denied');
    expect(appended()).toHaveLength(0);
  });

  it.each(['deferred', 'marked_unmappable', 'flagged_wrong_family', 'confirmed_in_family'])(
    'reverses %s — every parked status the panel offers Undo for',
    async (decision) => {
      // The panel enables Undo from UNDOABLE_STATUS_DECISIONS. If the route
      // handled a subset, the button would be live for something it refuses.
      seed({
        decisions: [decisionRow({ id: 'd-x', decision, override_id: null })],
        notes: [{ param_name: 'VR(V)', note: null, status: 'whatever' }],
      });

      const res = await undo(['d-x']);

      expect(res.json.undone).toBe(1);
      expect(appended()[0]).toMatchObject({ decision: 'reopened' });
    },
  );
});

describe('decisions the route refuses', () => {
  it.each(['mapping_edited', 'mapping_revoked', 'reopened', 'note_added', 'flag_toggled'])(
    'refuses %s using the SAME wording the panel tooltip shows',
    async (decision) => {
      // Shared helper, one source of truth: a divergence here would tell the
      // user two different stories about the same greyed-out button.
      seed({ decisions: [decisionRow({ id: 'd-r', decision })], overrides: [] });

      const res = await undo(['d-r']);

      expect(res.json.undone).toBe(0);
      expect(res.json.skipped).toEqual([{ id: 'd-r', reason: undoRefusalReason(decision)! }]);
      expect(appended()).toHaveLength(0);
    },
  );

  it('refusing does not touch the override, even when one is linked', async () => {
    // mapping_edited's override_id points at the SUCCESSOR mapping. Deactivating
    // it would leave the param mapped to nothing while the log said "revoked".
    seed({
      decisions: [decisionRow({ id: 'd-e', decision: 'mapping_edited' })],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    await undo(['d-e']);

    expect(overrides().find((o) => o.id === 'ov-1')!.is_active).toBe(true);
    expect(mock.writes('atlas_dictionary_overrides', 'update')).toHaveLength(0);
  });
});

describe('every requested id gets an answer', () => {
  it('accounts for all four ids in a mixed batch: undone + skipped === requested', async () => {
    // The arithmetic IS the contract. A caller told "3 undone" out of 4 has no
    // way to discover which one failed or why — that was the original defect.
    seed({
      decisions: [
        decisionRow({ id: 'd-ok', override_id: 'ov-live' }),
        decisionRow({ id: 'd-dead', override_id: 'ov-dead' }),
        decisionRow({ id: 'd-edit', decision: 'mapping_edited', override_id: 'ov-live' }),
      ],
      overrides: [
        { id: 'ov-live', family_id: 'B1', is_active: true },
        { id: 'ov-dead', family_id: 'B1', is_active: false },
      ],
    });

    const ids = ['d-ok', 'd-dead', 'd-edit', 'd-ghost'];
    const res = await undo(ids);

    expect(res.json.undone).toBe(1);
    expect(res.json.undone! + res.json.skipped!.length).toBe(ids.length);
    expect(res.json.skipped!.map((s) => s.id).sort()).toEqual(['d-dead', 'd-edit', 'd-ghost']);
    expect(appended()).toHaveLength(1);
  });

  it('an unknown id is reported, not silently dropped', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    const res = await undo(['d-1', 'd-ghost']);

    expect(res.json.skipped).toContainEqual({ id: 'd-ghost', reason: 'no such decision' });
  });

  /**
   * A FAILED LOG APPEND IS REPORTED, NOT COMPENSATED.
   *
   * A compensating rollback was tried here (Jul 2026) and removed, because it
   * made the worst case UNRECOVERABLE rather than merely bad:
   *
   *  1. `recordParamDecisions` inserts in chunks of 500 and returns false if
   *     ANY chunk fails — while earlier chunks stay COMMITTED. Rolling the
   *     overrides back then reactivated mappings the log already, permanently,
   *     described as revoked. `atlas_param_decisions` has no UPDATE and no
   *     DELETE policy, so nothing could ever repair it.
   *  2. It restored only `atlas_dictionary_overrides`. The status branch writes
   *     to `atlas_unmapped_param_notes` and was never put back, while the
   *     response told the user "nothing was changed".
   *
   * So the reversal stands and the log failure is surfaced. That is visible,
   * not silent: `buildUndoMessage` APPENDS "The log entry for this undo could
   * not be written" and flips the alert to a warning (pinned by its own tests
   * in atlasDecisionLogPanel). The resulting state — reversal applied, log
   * entry missing — is recoverable by redoing the change in Triage.
   *
   * The real fix is atomicity, not compensation: one SECURITY DEFINER function
   * doing both writes in a single transaction. See docs/BACKLOG.md.
   */
  it('the reversal STANDS when the log append fails — not silently rolled back', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
      fail: { atlas_param_decisions: { insert: { message: 'insert blew up' } } },
    });

    const res = await undo(['d-1']);

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.undone).toBe(1);
    // The override really is deactivated — the user's action took effect.
    expect(overrides().find((o) => o.id === 'ov-1')!.is_active).toBe(false);
  });

  /**
   * The whole reason the rollback could be dropped safely: the failure is
   * REPORTED. If `logged` stopped being returned, the panel would render a
   * plain success and the missing audit entry would be invisible.
   */
  it('reports logged:false so the panel can warn about the missing audit entry', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
      fail: { atlas_param_decisions: { insert: { message: 'insert blew up' } } },
    });

    const res = await undo(['d-1']);

    expect(res.json.logged).toBe(false);
  });

  it('reports logged:true on the happy path, so the flag actually discriminates', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    const res = await undo(['d-1']);

    expect(res.json.logged).toBe(true);
    expect(appended()).toHaveLength(1);
  });

  /**
   * Two undoable decision rows can point at ONE override. Both would append
   * their own `mapping_revoked` row for a single revocation — and an
   * append-only table can never take the duplicate back.
   */
  it('dedupes on override_id so one revocation appends exactly one row', async () => {
    seed({
      decisions: [decisionRow({}), decisionRow({ id: 'd-2' })], // same override_id 'ov-1'
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    const res = await undo(['d-1', 'd-2']);

    expect(res.json.undone).toBe(1);
    expect(appended()).toHaveLength(1);
    expect(res.json.skipped).toContainEqual({
      id: 'd-2',
      reason: 'another decision in this request already reverts this mapping',
    });
  });
});

describe('request validation and the admin guard', () => {
  it('an empty decisionIds is a 400 before any read', async () => {
    seed({ decisions: [] });

    const res = await invokeRoute<UndoResponse>(POST, { body: { decisionIds: [] } });

    expect(res.status).toBe(400);
    expect(mock.ops()).toHaveLength(0);
  });

  it('drops non-string ids rather than passing them to the query', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    await invokeRoute<UndoResponse>(POST, { body: { decisionIds: ['d-1', 42, null, ''] } });

    const [read] = mock.writes('atlas_param_decisions', 'select');
    expect(read.filters).toEqual([['in', 'id', ['d-1']]]);
  });

  it('no matching decisions at all is a 404', async () => {
    seed({ decisions: [] });

    const res = await undo(['d-ghost']);

    expect(res.status).toBe(404);
    expect(appended()).toHaveLength(0);
  });

  it('a non-admin gets 403 and touches nothing', async () => {
    seed({
      decisions: [decisionRow({})],
      overrides: [{ id: 'ov-1', family_id: 'B1', is_active: true }],
    });

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    jest.doMock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').forbiddenGuard());
    const { POST: Guarded } = await import('@/app/api/admin/atlas/param-decisions/undo/route');

    const res = await invokeRoute<UndoResponse>(Guarded, { body: { decisionIds: ['d-1'] } });

    expect(res.status).toBe(403);
    expect(overrides().find((o) => o.id === 'ov-1')!.is_active).toBe(true);
    expect(appended()).toHaveLength(0);
  });
});
