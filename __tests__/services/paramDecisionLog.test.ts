import { readFileSync } from 'fs';
import path from 'path';

/**
 * Stub state for the writer-contract tests at the bottom of this file. It lives
 * on globalThis because jest hoists the mock factory above every declaration in
 * the module — a `let` here would still be in the temporal dead zone when the
 * factory runs. The mock path is RELATIVE: `@/` resolves for imports but not
 * inside jest.mock.
 */
declare global {
  // eslint-disable-next-line no-var
  var LOG_STUB: {
    calls: Array<Array<Record<string, unknown>>>;
    /** Errors returned to successive insert calls, first-in-first-out. */
    errors: Array<{ message: string } | null>;
    clientThrows: boolean;
  };
}
globalThis.LOG_STUB = { calls: [], errors: [], clientThrows: false };

jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => {
    if (globalThis.LOG_STUB.clientThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
    return {
      from: () => ({
        insert: (rows: Array<Record<string, unknown>>) => {
          globalThis.LOG_STUB.calls.push(rows);
          return Promise.resolve({ error: globalThis.LOG_STUB.errors.shift() ?? null });
        },
      }),
    };
  },
}));

import {
  canonicalizeParamName,
  decisionForNoteStatus,
  decisionForNoteWrite,
  recordParamDecisions,
} from '@/lib/services/paramDecisionLog';

const LOG_STUB = globalThis.LOG_STUB;

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

/** Isolate one exported handler so a guard about the DELETE path can't be
 *  satisfied by a line that happens to sit in PATCH. */
function handlerBody(src: string, name: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return '';
  const rest = src.slice(start + 1);
  const next = rest.indexOf('\nexport async function ');
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * THE ANTI-DRIFT GUARD.
 *
 * The bug this whole feature fixes was structural, not a typo: decisions were
 * written by ~9 routes into 3 tables, and nothing forced a route to record
 * anything. 1,967 of 2,032 accepted mappings (97%) and all 80 deferred params
 * left no audit trail — not because someone wrote the wrong code, but because
 * nothing failed when they wrote none.
 *
 * A comment saying "remember to log this" is not a control. This test is.
 * If any route below stops calling the helper, this goes red.
 */
describe('decision log: every decision-writing route calls the helper', () => {
  // Verified by reading each route + its client call site (July 2026).
  const DECISION_ROUTES: Array<{ file: string; why: string }> = [
    {
      file: 'app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts',
      why: 'defer / reopen / unmappable / wrong-family / confirm / note — SIX decisions, and the row it writes keeps no history of its own',
    },
    {
      file: 'app/api/admin/atlas/dictionaries/route.ts',
      why: 'accept a mapping (the 97%-invisible path)',
    },
    {
      file: 'app/api/admin/atlas/dictionaries/[overrideId]/route.ts',
      why: 'edit / revoke a mapping',
    },
    {
      file: 'app/api/admin/atlas/dictionaries/batch/route.ts',
      why: 'batch accept',
    },
    {
      file: 'app/api/admin/atlas/dictionaries/batch/undo/route.ts',
      why: 'undo a batch',
    },
    {
      file: 'app/api/admin/atlas/triage-investigations/[id]/revert/route.ts',
      why: 'revert an AI-assisted decision',
    },
  ];

  it.each(DECISION_ROUTES)('$file records decisions ($why)', ({ file }) => {
    const src = read(file);
    expect(src).toMatch(/recordParamDecisions?\s*\(/);
    expect(src).toMatch(/from '@\/lib\/services\/paramDecisionLog'/);
  });

  /**
   * The inverse guard. triage-investigations POST must NOT write a decision
   * row: the client calls it IN ADDITION to the mutation that actually made
   * the decision, so logging in both places yields two rows for one decision
   * — and an append-only table can never clean the duplicate up.
   */
  it('triage-investigations POST does NOT write a decision row (double-log guard)', () => {
    const src = read('app/api/admin/atlas/triage-investigations/route.ts');
    expect(src).not.toMatch(/recordParamDecisions?\s*\(/);
    // ...and the reasoning is recorded where the next person will look.
    expect(src).toMatch(/does NOT write to atlas_param_decisions/);
  });
});

/**
 * The canonical join key must stay byte-identical to the transform
 * atlas_dictionary_overrides already applies on write. If they diverge, one
 * parameter's history silently splits into two streams — and because NFC vs
 * NFD differences are invisible on screen, nobody would notice.
 */
describe('decision log: param-name canonicalization is pinned to the overrides route', () => {
  it('matches the transform used by the dictionaries POST route', () => {
    const src = read('app/api/admin/atlas/dictionaries/route.ts');
    expect(src).toMatch(/\.normalize\('NFC'\)\.toLowerCase\(\)\.trim\(\)/);
  });

  it('produces one key for NFC and NFD forms of the same Chinese name', () => {
    // U+8010 U+538B (耐压) composed vs a decomposed-equivalent sequence.
    const nfc = '耐压'.normalize('NFC');
    const nfd = '耐压'.normalize('NFD');
    expect(canonicalizeParamName(nfc)).toBe(canonicalizeParamName(nfd));
  });

  it('folds case and surrounding whitespace', () => {
    expect(canonicalizeParamName('  VR(V) ')).toBe('vr(v)');
    expect(canonicalizeParamName('Vr(v)')).toBe('vr(v)');
  });
});

/**
 * REVIEW FINDING — the log's one blind spot was the destruction of reasoning.
 *
 * Two routes mutate atlas_unmapped_param_notes (PUT and DELETE) and each
 * carried its own inline copy of "what did this write decide". They disagreed.
 * Both copies guarded note-logging on the NEW note being non-empty, so
 * *erasing* an engineer's rationale fell through and recorded nothing at all —
 * the single event this feature exists to prevent, in the one code path that
 * performs it irreversibly.
 *
 * These fail against both old copies.
 */
describe('decision log: erasing an engineer\'s note is itself a decision', () => {
  const empty = { status: null, note: null, flagged: false };

  it('clearing a note-only row records note_cleared', () => {
    // Old behaviour: null — the note vanished with no trace.
    expect(
      decisionForNoteWrite({ status: null, note: 'looks like a test condition', flagged: false }, empty),
    ).toBe('note_cleared');
  });

  it('deleting a row that held only a note records note_cleared', () => {
    // A DELETE is just a write whose next state is empty. The DELETE
    // handler's old inline copy logged ONLY when a status was present.
    expect(decisionForNoteWrite({ status: null, note: 'vendor test condition', flagged: false }, empty)).toBe(
      'note_cleared',
    );
  });

  it('deleting a parked row still records the reopen', () => {
    expect(decisionForNoteWrite({ status: 'deferred', note: 'revisit', flagged: false }, empty)).toBe('reopened');
  });

  it('does not manufacture an entry when nothing changed', () => {
    // Re-saving an identical note must not append a row that can never be
    // removed — the table has no DELETE policy.
    const same = { status: 'deferred', note: 'same text', flagged: true };
    expect(decisionForNoteWrite(same, { ...same })).toBeNull();
    expect(decisionForNoteWrite(empty, empty)).toBeNull();
  });

  it('adding a note to an untouched param records note_added', () => {
    expect(decisionForNoteWrite(empty, { status: null, note: 'checked the datasheet', flagged: false })).toBe(
      'note_added',
    );
  });

  it('ranks status above note above flag, so one action is one row', () => {
    // Deferring while also writing a note is a DEFER, not two entries.
    expect(
      decisionForNoteWrite(empty, { status: 'deferred', note: 'revisit next batch', flagged: true }),
    ).toBe('deferred');
    // No status change, so the note wins over the flag.
    expect(
      decisionForNoteWrite({ status: 'deferred', note: null, flagged: false },
        { status: 'deferred', note: 'why', flagged: true }),
    ).toBe('note_added');
    // Nothing but the bookmark moved.
    expect(
      decisionForNoteWrite({ status: null, note: 'x', flagged: false }, { status: null, note: 'x', flagged: true }),
    ).toBe('flag_toggled');
  });
});

/**
 * REVIEW FINDINGS — route-level guards.
 *
 * These assert the specific safety property each fix installed, scoped to the
 * handler that needs it. They are structural because the alternative is no
 * control at all: this repo's whole problem was that nothing failed when a
 * route skipped the log, and three of the findings below are the SAME defect
 * appearing in a sibling path that an earlier fix didn't sweep.
 */
describe('decision log: a write is logged only if it actually happened', () => {
  it('DELETE of an override guards on is_active before logging a revoke', () => {
    // Without the guard, deactivating an ALREADY-inactive override "succeeds"
    // (0 rows, no error) and appends a second permanent mapping_revoked row
    // crediting this admin, now, for a revocation that happened earlier. The
    // undo route was fixed for exactly this; this sibling path was not.
    const body = handlerBody(read('app/api/admin/atlas/dictionaries/[overrideId]/route.ts'), 'DELETE');
    expect(body).toMatch(/\.eq\('is_active',\s*true\)/);
    expect(body).toMatch(/\.select\(/);
  });

  it('PATCH of an override does not log an edit when the body changed nothing', () => {
    // A PATCH carrying no recognized field used to still bump updated_at and
    // append mapping_edited. Worse than noise: updated_at IS the revocation
    // timestamp for a row later deactivated with nothing replacing it.
    const body = handlerBody(read('app/api/admin/atlas/dictionaries/[overrideId]/route.ts'), 'PATCH');
    expect(body).toMatch(/Object\.keys\(update\)\.length === 0/);
    // updated_at must be set AFTER that check, not seeded into the literal.
    const decl = body.match(/const update: Record<string, unknown> = \{([^}]*)\}/);
    expect(decl).toBeTruthy();
    expect(decl![1]).not.toMatch(/updated_at/);
  });

  it('undoing a status checks the write succeeded before appending "reopened"', () => {
    // An unchecked write let the log assert a state transition that never
    // happened — the param still parked in Triage, the log permanently
    // claiming otherwise, with no way to retract it.
    const src = read('app/api/admin/atlas/param-decisions/undo/route.ts');
    const body = handlerBody(src, 'POST');
    expect(body).toMatch(/writeErr/);
    // Both branches (keep-the-note update, and delete) must surface an error.
    expect(body).toMatch(/error:\s*updErr\s*\}/);
    expect(body).toMatch(/error:\s*delErr\s*\}/);
  });

  it('the undo route documents what it actually refuses', () => {
    // The header claimed `mapping_edited` was undoable while UNDOABLE_MAPPING
    // excluded it — a reader trusting the comment would conclude the feature
    // was broken. This repo has been burned twice by a rule that lived only in
    // a comment (the misdated revokes came from a documented fallback nobody
    // implemented), so the comment gets a test.
    const src = read('app/api/admin/atlas/param-decisions/undo/route.ts');
    const header = src.slice(0, src.indexOf('*/'));
    const deactivateLine = header.split('\n').find((l) => l.includes('deactivate the override')) ?? '';
    expect(deactivateLine).not.toMatch(/mapping_edited/);
    expect(header).toMatch(/mapping_edited[\s\S]*?refused/);
  });

  it('the undo route answers for every id it was given', () => {
    // Ids matching no row were dropped in silence: the caller asked to undo N
    // and got back `undone: N-1` with no explanation of the missing one.
    const body = handlerBody(read('app/api/admin/atlas/param-decisions/undo/route.ts'), 'POST');
    expect(body).toMatch(/no such decision/);
  });

  it('a batch that replaces live mappings logs edits, not fresh accepts', () => {
    // A batch re-pointing 50 existing mappings read as 50 brand-new ones —
    // hiding precisely the change an auditor cares about. Same accept-vs-edit
    // distinction the single-accept route already drew with `hadPrior`.
    const src = read('app/api/admin/atlas/dictionaries/batch/route.ts');
    expect(src).toMatch(/supersededKeys/);
    expect(src).toMatch(/mapping_edited/);
  });
});

describe('decision log: callers hand over the raw param name', () => {
  it('the accept route does not pre-normalize away the display name', () => {
    // The helper canonicalizes for its join key and separately stores what it
    // was given as the DISPLAY name. Passing the already-lowercased form threw
    // away the only copy of what the engineer saw ("RDS(ON) Max. (mΩ)"), and
    // the log is append-only, so it could never be recovered.
    const src = read('app/api/admin/atlas/dictionaries/route.ts');
    const call = src.match(/await recordParamDecision\(\{[\s\S]*?\n    \}\);/);
    expect(call).toBeTruthy();
    expect(call![0]).not.toMatch(/paramName:\s*canonicalParamName/);
    expect(call![0]).toMatch(/paramName:\s*body\.paramName/);
  });
});

describe('decision log: the list endpoint does not ship AI blobs', () => {
  it('returns evidence only when explicitly asked', () => {
    // hasEvidence exists so the list can render its chip without the payload.
    // Returning both meant multi-KB blobs per row for a 500-row page.
    const src = read('app/api/admin/atlas/param-decisions/route.ts');
    expect(src).toMatch(/include_evidence/);
    expect(src).not.toMatch(/^\s*evidence: r\.evidence,/m);
  });
});

describe('decision log: note status → decision type', () => {
  it('maps each status to exactly the decision it names', () => {
    expect(decisionForNoteStatus('deferred', null)).toBe('deferred');
    expect(decisionForNoteStatus('unmappable', null)).toBe('marked_unmappable');
    expect(decisionForNoteStatus('wrong_family', null)).toBe('flagged_wrong_family');
    expect(decisionForNoteStatus('confirmed_in_family', null)).toBe('confirmed_in_family');
  });

  it('clearing a status that existed is a reopen', () => {
    expect(decisionForNoteStatus(null, 'deferred')).toBe('reopened');
    expect(decisionForNoteStatus(null, 'unmappable')).toBe('reopened');
  });

  it('clearing a status that never existed is not a decision', () => {
    // Guards against logging a no-op: a note-only edit on a param that was
    // never parked should not manufacture a "reopened" entry.
    expect(decisionForNoteStatus(null, null)).toBeNull();
  });

  /**
   * Every status the notes table's CHECK constraint allows must map to a
   * decision. Adding a 5th status without a decision type would silently
   * produce unlogged decisions — the original failure mode, re-run.
   */
  it('covers every status the notes schema allows', () => {
    const schema = read('scripts/supabase-atlas-unmapped-param-notes-schema.sql');
    const match = schema.match(/status IN \(([^)]+)\)/);
    expect(match).toBeTruthy();
    const statuses = match![1]
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''))
      .filter(Boolean);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(decisionForNoteStatus(status, null)).not.toBeNull();
    }
  });
});

/**
 * Two contracts this module's header states in prose and nothing enforced.
 * Both were found by mutation: breaking either left all 58 tests green.
 */
describe('decision log: the writer\'s own reliability contract', () => {
  beforeEach(() => {
    LOG_STUB.calls.length = 0;
    LOG_STUB.errors.length = 0;
    LOG_STUB.clientThrows = false;
  });

  const inputs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      paramName: `p${i}`,
      decision: 'mapping_accepted' as const,
      decidedBy: 'admin-1',
    }));

  it('chunks at 500 so one rejected request cannot lose a whole batch\'s trail', async () => {
    // A Batch Accept has no cap on how many params it can approve, and a single
    // oversized insert fails as ONE unit. Because logging is non-fatal, a
    // 600-param batch would lose its entire audit trail silently.
    await recordParamDecisions(inputs(600));

    expect(LOG_STUB.calls.map((c) => c.length)).toEqual([500, 100]);
  });

  it('keeps going after a failed chunk, and reports false', async () => {
    // Fail the FIRST chunk only. The blast radius must stay bounded to it.
    LOG_STUB.errors.push({ message: 'boom' });

    const ok = await recordParamDecisions(inputs(600));

    expect(ok).toBe(false);
    expect(LOG_STUB.calls.map((c) => c.length)).toEqual([500, 100]);
  });

  it('NEVER throws — a logging failure must not break the decision the user made', async () => {
    // The trade this module states explicitly: audit completeness is sacrificed
    // for reliability, because an admin should never lose an accept because the
    // audit table hiccuped. If this throws, every calling route's try/catch
    // turns a successful mapping write into a 500.
    LOG_STUB.clientThrows = true;

    await expect(recordParamDecisions(inputs(1))).resolves.toBe(false);
  });

  it('an empty input list is a no-op that reports success', async () => {
    await expect(recordParamDecisions([])).resolves.toBe(true);
    expect(LOG_STUB.calls).toHaveLength(0);
  });
});
