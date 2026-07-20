import { readFileSync } from 'fs';
import path from 'path';
import {
  canonicalizeParamName,
  decisionForNoteStatus,
} from '@/lib/services/paramDecisionLog';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

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
