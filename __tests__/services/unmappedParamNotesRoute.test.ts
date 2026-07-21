/**
 * PUT / DELETE /api/admin/atlas/unmapped-param-notes/[paramName]
 *
 * Fifth route suite. One endpoint, SIX different decisions (defer, mark
 * unmappable, flag wrong-family, confirm in family, reopen, write a note) plus
 * two more on the delete path — and the row it writes is last-write-wins with
 * no history of its own. The moment it is overwritten, what it used to say is
 * unrecoverable, so the decision log is the only record that the decision was
 * ever made.
 *
 * The defect that motivates the DELETE half is worth stating plainly: the old
 * inline copy of the rule logged only when a STATUS was present, so wiping a
 * row that held nothing but an engineer's written rationale destroyed it and
 * recorded nothing. A log whose one blind spot is "somebody deleted the
 * reasoning" is blind exactly where it matters most. Both handlers now share
 * `decisionForNoteWrite`; these tests pin that they still agree.
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
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports
jest.mock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').adminGuard());
jest.mock('../../lib/services/overrideHistoryHelper', () => ({
  resolveAdminNames: jest.fn(async () => new Map([['admin-1', 'Test Admin']])),
}));
jest.mock('../../lib/services/triageQueueCache', () => ({
  invalidateTriageQueueCache: jest.fn(async () => undefined),
}));

import { PUT, DELETE } from '@/app/api/admin/atlas/unmapped-param-notes/[paramName]/route';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { TEST_ADMIN_ID } from '../helpers/authGuard';

interface NoteResponse {
  success: boolean;
  error?: string;
  deleted?: boolean;
  item?: { paramName: string; note: string; status: string | null; flagged: boolean };
}

const PARAM = 'VR(V)';

let mock: SupabaseMock;

function seed(notes: Array<Record<string, unknown>> = [], fail?: Parameters<typeof createSupabaseMock>[0]['fail']) {
  mock = createSupabaseMock({
    tables: {
      atlas_unmapped_param_notes: notes.map((r) => ({ ...r })),
      atlas_param_decisions: [],
    },
    fail,
  });
  globalThis.__sbMock = mock;
  (invalidateTriageQueueCache as jest.Mock).mockClear();
}

const put = (body: Record<string, unknown>, paramName = PARAM) =>
  invokeRoute<NoteResponse, { paramName: string }>(PUT, { body, params: { paramName }, method: 'PUT' });

const del = (paramName = PARAM) =>
  invokeRoute<NoteResponse, { paramName: string }>(DELETE, { params: { paramName }, method: 'DELETE' });

const decisions = () => mock.rows('atlas_param_decisions');
const notesRows = () => mock.rows('atlas_unmapped_param_notes');

describe('each status parks the param under its own decision type', () => {
  it.each([
    ['deferred', 'deferred'],
    ['unmappable', 'marked_unmappable'],
    ['wrong_family', 'flagged_wrong_family'],
    ['confirmed_in_family', 'confirmed_in_family'],
  ])('status %s logs exactly one %s', async (status, expected) => {
    // Six decisions through one endpoint. Collapsing any two of these would
    // make the log unable to answer "why is this parameter not in the queue".
    seed();

    const res = await put({ status, flaggedBy: 'engineer' });

    expect(res.status).toBe(200);
    expect(notesRows()[0]).toMatchObject({ param_name: PARAM, status, updated_by: TEST_ADMIN_ID });
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      decision: expected,
      param_name: 'vr(v)',
      param_name_display: PARAM,
      decided_by: TEST_ADMIN_ID,
      source: 'ui',
    });
    expect(invalidateTriageQueueCache).toHaveBeenCalled();
  });

  it('changing one status to another logs the NEW one, once', async () => {
    seed([{ param_name: PARAM, status: 'deferred', note: null, is_flagged: false }]);

    await put({ status: 'unmappable' });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('marked_unmappable');
  });
});

describe('reopening a parked param', () => {
  it('clearing the status logs reopened and deletes the now-empty row', async () => {
    seed([{ param_name: PARAM, status: 'deferred', note: null, is_flagged: false }]);

    const res = await put({ status: null });

    expect(res.json.deleted).toBe(true);
    expect(notesRows()).toHaveLength(0);
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('reopened');
  });

  it('clearing the status while KEEPING a note logs reopened and keeps the row', async () => {
    seed([{ param_name: PARAM, status: 'deferred', note: 'waiting on datasheet', is_flagged: false }]);

    const res = await put({ status: null, note: 'waiting on datasheet' });

    expect(res.status).toBe(200);
    expect(notesRows()[0]).toMatchObject({ status: null, note: 'waiting on datasheet' });
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('reopened');
  });

  it('writing nothing to a param that was never parked logs NOTHING', async () => {
    // No prior state, no next state — there is no decision here, and inventing
    // one would put a permanent row in an append-only table for a no-op.
    seed();

    const res = await put({});

    expect(res.json.deleted).toBe(true);
    expect(decisions()).toHaveLength(0);
  });
});

describe('notes are decisions too', () => {
  it('adding a note logs note_added', async () => {
    seed();

    await put({ note: 'vendor uses this for reverse voltage' });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      decision: 'note_added',
      note: 'vendor uses this for reverse voltage',
    });
  });

  it('re-saving an IDENTICAL note logs nothing', async () => {
    // A no-op write must not manufacture an entry that can never be removed.
    seed([{ param_name: PARAM, status: null, note: 'same text', is_flagged: false }]);

    const res = await put({ note: 'same text' });

    expect(res.status).toBe(200);
    expect(decisions()).toHaveLength(0);
  });

  it('erasing a note via PUT logs note_cleared, carrying the text that was destroyed', async () => {
    seed([{ param_name: PARAM, status: null, note: 'about to be erased', is_flagged: false }]);

    const res = await put({ note: '' });

    expect(res.json.deleted).toBe(true);
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({ decision: 'note_cleared', note: 'about to be erased' });
  });

  it('a status change WINS over a simultaneous note change — one action, one row', async () => {
    // Precedence status > note > flag. A defer that also saves a note is a
    // defer, not two entries.
    seed([{ param_name: PARAM, status: null, note: 'old', is_flagged: false }]);

    await put({ status: 'deferred', note: 'new reasoning' });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('deferred');
  });

  it('a bookmark toggle alone logs flag_toggled', async () => {
    seed();

    await put({ flagged: true });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('flag_toggled');
  });
});

describe('DELETE destroys the row — and must say what it destroyed', () => {
  it('deleting a row that held ONLY a note logs note_cleared', async () => {
    // THE defect. The old inline copy of this rule logged only when a status
    // was present, so this exact case erased an engineer's reasoning and left
    // no trace of it having existed.
    seed([{ param_name: PARAM, status: null, note: 'the only copy of this reasoning', is_flagged: false }]);

    const res = await del();

    expect(res.status).toBe(200);
    expect(notesRows()).toHaveLength(0);
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({
      decision: 'note_cleared',
      note: 'the only copy of this reasoning',
    });
  });

  it('deleting a parked row logs reopened, matching what PUT would have logged', async () => {
    // The two handlers share one rule. If they diverge, the same user-visible
    // action produces two different histories depending on which button was used.
    seed([{ param_name: PARAM, status: 'deferred', note: 'ctx', is_flagged: false }]);

    await del();

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].decision).toBe('reopened');
  });

  it('deleting a row that does not exist logs nothing', async () => {
    seed();

    const res = await del();

    expect(res.status).toBe(200);
    expect(decisions()).toHaveLength(0);
  });

  it('a failed delete is a 500 and logs nothing', async () => {
    seed([{ param_name: PARAM, status: 'deferred', note: null, is_flagged: false }], {
      atlas_unmapped_param_notes: { delete: { message: 'permission denied' } },
    });

    const res = await del();

    expect(res.status).toBe(500);
    expect(decisions()).toHaveLength(0);
  });
});

describe('validation', () => {
  it('rejects a status outside the allowlist without writing', async () => {
    seed();

    const res = await put({ status: 'made_up' });

    expect(res.status).toBe(400);
    expect(res.json.error).toContain('Invalid status');
    expect(mock.ops()).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });

  it('rejects a flaggedBy outside the allowlist without writing', async () => {
    seed();

    const res = await put({ status: 'deferred', flaggedBy: 'somebody' });

    expect(res.status).toBe(400);
    expect(mock.ops()).toHaveLength(0);
  });

  it('rejects an over-long note without writing', async () => {
    seed();

    const res = await put({ note: 'x'.repeat(5001) });

    expect(res.status).toBe(400);
    expect(res.json.error).toContain('5000');
    expect(mock.writes('atlas_unmapped_param_notes', 'upsert')).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });

  it('rejects a blank paramName', async () => {
    seed();

    const res = await put({ status: 'deferred' }, '   ');

    expect(res.status).toBe(400);
    expect(mock.ops()).toHaveLength(0);
  });

  it('decodes a URL-encoded param name so the row keys on the real vendor string', async () => {
    // Vendor parameters contain slashes, parentheses and Chinese characters;
    // keying the row on the encoded form would silently fork the parameter.
    seed();

    await put({ status: 'deferred' }, encodeURIComponent('额定电压 (V)'));

    expect(notesRows()[0].param_name).toBe('额定电压 (V)');
    expect(decisions()[0].param_name_display).toBe('额定电压 (V)');
  });

  it('a non-admin gets 403 and writes nothing', async () => {
    seed();

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    jest.doMock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').forbiddenGuard());
    const { PUT: Guarded } = await import('@/app/api/admin/atlas/unmapped-param-notes/[paramName]/route');

    const res = await invokeRoute<NoteResponse, { paramName: string }>(Guarded, {
      body: { status: 'deferred' },
      params: { paramName: PARAM },
      method: 'PUT',
    });

    expect(res.status).toBe(403);
    expect(mock.ops()).toHaveLength(0);
    expect(decisions()).toHaveLength(0);
  });
});
