import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { formatTime, buildUndoMessage } from '@/components/admin/AtlasDecisionLogPanel';
import {
  isUndoableDecision,
  isUndoableMapping,
  undoRefusalReason,
} from '@/lib/services/paramDecisionTypes';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

/**
 * Source with comments removed.
 *
 * Any "this must NOT appear" assertion has to run against CODE. These fixes
 * are documented by comments that quote the broken form they replaced
 * ("`mineOnly && user` dropped the filter…"), so asserting over raw source
 * makes the explanation of a fix indistinguishable from the defect — the test
 * fails on correct code and would pass if someone deleted the comment. Caught
 * exactly that on the first run of this file.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PANEL = 'components/admin/AtlasDecisionLogPanel.tsx';
const ROUTE = 'app/api/admin/atlas/param-decisions/route.ts';
const UNDO = 'app/api/admin/atlas/param-decisions/undo/route.ts';

/**
 * REVIEW ROUND 3. Every finding below was in the ONE layer the earlier
 * verification never exercised: the panel's own behaviour. The data layer was
 * checked against live rows and the routes had fail-first tests; the UI was
 * written in a single pass and shipped with only a pure-function test for
 * grouping. These tests close that gap.
 */

describe('Decision Log: per-parameter history asks about ONE parameter', () => {
  it('the drawer requests an exact match, not a substring', () => {
    // Measured on live data: under substring matching, "io" returned 131 rows
    // spanning 119 DISTINCT parameters, all rendered under a heading reading
    // "Everything decided about this parameter". 95 of 823 params (12%) are a
    // substring of another. Exact returns 1 param, as the heading promises.
    const src = read(PANEL);
    const call = src.match(/const sp = new URLSearchParams\(\{[\s\S]*?\}\);/);
    expect(call).toBeTruthy();
    expect(call![0]).toMatch(/param_exact: '1'/);
  });

  it('the route supports exact matching on the canonical column', () => {
    const src = read(ROUTE);
    expect(src).toMatch(/param_exact/);
    expect(src).toMatch(/query = query\.eq\('param_name', canonical\)/);
  });

  it('the route still offers substring search for the search box', () => {
    // Exact must not replace substring — the search field needs "contains".
    expect(read(ROUTE)).toMatch(/query = query\.ilike\('param_name', `%\$\{needle\}%`\)/);
  });

  it('the drawer reports truncation instead of silently capping', () => {
    // limit=100 with no signal meant a param with more entries rendered the
    // newest 100 under a heading asserting completeness.
    const src = read(PANEL);
    expect(src).toMatch(/historyTotal > history\.length/);
    expect(src).toMatch(/most recent of/);
  });
});

describe('Decision Log: search escaping is total', () => {
  it('escapes backslash BEFORE the wildcards', () => {
    // Order is the whole fix. Escaping % and _ first inserts backslashes that
    // the later backslash-escape would then double, and a trailing backslash
    // left a dangling escape in the pattern.
    const src = read(ROUTE);
    const idx = src.indexOf("replace(/\\\\/g, '\\\\\\\\')");
    const idxWild = src.indexOf('replace(/[%_]/g');
    expect(idx).toBeGreaterThan(-1);
    expect(idxWild).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(idxWild);
  });
});

describe('Decision Log: dates carry the year', () => {
  it('formatTime includes a 4-digit year', () => {
    // The log spans months and holds reconstructed rows dated back to May, so
    // without the year a 2026 entry and a 2027 entry render identically — on
    // the surface whose job is "find what I just did and undo it".
    const out = formatTime('2026-05-12T03:40:22Z');
    expect(out).toMatch(/2026/);
  });

  it('distinguishes the same day in different years', () => {
    expect(formatTime('2026-05-12T03:40:22Z')).not.toBe(formatTime('2027-05-12T03:40:22Z'));
  });
});

describe('Decision Log: the undo message reports the whole outcome', () => {
  it('counts each distinct skip reason instead of quoting the first', () => {
    const msg = buildUndoMessage(5, 3, [{ reason: 'already inactive' }, { reason: 'no such decision' }], true);
    // The old inline version said "2 skipped — already inactive", silently
    // attributing both skips to the first row's reason.
    expect(msg.text).toContain('already inactive');
    expect(msg.text).toContain('no such decision');
    expect(msg.text).toContain('Undid 3 of 5');
  });

  it('groups repeated reasons with a count', () => {
    const msg = buildUndoMessage(4, 1, [
      { reason: 'already inactive' },
      { reason: 'already inactive' },
      { reason: 'already inactive' },
    ], true);
    expect(msg.text).toContain('3× already inactive');
  });

  it('APPENDS the log-write failure rather than replacing the count', () => {
    // The old version called setToast twice; the second overwrote the first,
    // so "Undid 3 of 5" vanished and the user concluded all five reverted.
    const msg = buildUndoMessage(5, 3, [{ reason: 'already inactive' }], false);
    expect(msg.text).toContain('Undid 3 of 5');
    expect(msg.text).toContain('1 skipped');
    expect(msg.text).toContain('could not be written');
  });

  it('is a plain success only when everything worked', () => {
    const ok = buildUndoMessage(2, 2, [], true);
    expect(ok.severity).toBe('success');
    expect(ok.text).toBe('Undid 2 decisions.');
    expect(buildUndoMessage(2, 0, [{ reason: 'x' }], true).severity).toBe('warning');
    expect(buildUndoMessage(2, 2, [], false).severity).toBe('warning');
  });
});

describe('Decision Log: one source of truth for what can be undone', () => {
  it('the panel does not keep its own list of undoable decisions', () => {
    // Two hand-typed copies meant a change to the route left the panel's Undo
    // button disabled behind a tooltip claiming the server refuses something
    // it now accepts — with nothing failing.
    const code = readCode(PANEL);
    expect(code).not.toMatch(/const UNDOABLE[^_]/);
    const src = read(PANEL);
    expect(src).toMatch(/from '@\/lib\/services\/paramDecisionTypes'/);
    expect(src).toMatch(/isUndoableDecision/);
  });

  it('the undo route imports the same predicates', () => {
    const code = readCode(UNDO);
    expect(code).toMatch(/from '@\/lib\/services\/paramDecisionTypes'/);
    expect(code).not.toMatch(/const UNDOABLE_MAPPING = new Set/);
    expect(code).not.toMatch(/const UNDOABLE_STATUS = new Set/);
  });

  it('agrees with the route on which decisions reverse', () => {
    expect(isUndoableMapping('mapping_accepted')).toBe(true);
    // The one that must stay refused: its override_id points at the SUCCESSOR,
    // so deactivating it unmaps the param rather than restoring the previous
    // mapping.
    expect(isUndoableMapping('mapping_edited')).toBe(false);
    expect(isUndoableDecision('deferred')).toBe(true);
    expect(isUndoableDecision('mapping_revoked')).toBe(false);
  });

  it('gives one refusal wording to both the tooltip and the server', () => {
    expect(undoRefusalReason('mapping_accepted')).toBeNull();
    expect(undoRefusalReason('mapping_edited')).toMatch(/restoring the previous mapping/);
    expect(undoRefusalReason('reopened')).toMatch(/itself an undo/);
    // And the route actually uses it, rather than its own phrasing.
    expect(read(UNDO)).toMatch(/undoRefusalReason\(r\.decision\)/);
  });

  it('the shared module stays client-safe', () => {
    // It is imported by a client component; paramDecisionLog pulls in
    // createServiceClient, which reads SUPABASE_SERVICE_ROLE_KEY.
    const code = readCode('lib/services/paramDecisionTypes.ts');
    expect(code).not.toMatch(/from '@\/lib\/supabase/);
    expect(code).not.toMatch(/createServiceClient|createClient/);
    expect(code).not.toMatch(/^import /m);
  });
});

describe('Decision Log: stale responses cannot overwrite fresh ones', () => {
  it('the list fetch guards on an in-flight request id', () => {
    // Typing "voltage" fired 7 requests; if "vo" returned last the table
    // showed rows not matching the box, with nothing on screen to reveal it.
    const src = read(PANEL);
    expect(src).toMatch(/listReqRef/);
    expect(src).toMatch(/const reqId = \+\+listReqRef\.current/);
    expect(src).toMatch(/if \(reqId !== listReqRef\.current\) return/);
  });

  it('the detail fetch guards on its own request id', () => {
    // Clicking row A then row B could pair B's header with A's history.
    const src = read(PANEL);
    expect(src).toMatch(/detailReqRef/);
    expect(src).toMatch(/if \(reqId !== detailReqRef\.current\) return/);
  });

  it('the search box is debounced', () => {
    const src = read(PANEL);
    expect(src).toMatch(/SEARCH_DEBOUNCE_MS/);
    expect(src).toMatch(/setTimeout\(\(\) => setSearchDebounced\(search\)/);
    // The query must be built from the DEBOUNCED value, not the raw one.
    expect(src).toMatch(/if \(searchDebounced\.trim\(\)\) sp\.set\('param_name'/);
  });
});

describe('Decision Log: filters and bounds do not fail silently', () => {
  it('the Mine filter is applied unconditionally', () => {
    // `mineOnly && user` dropped the filter when user was absent, returning
    // everyone's decisions with the chip lit — a filter that never fires
    // looks exactly like one that matched nothing (Decision #263).
    const code = readCode(ROUTE);
    expect(code).toMatch(/if \(mineOnly\) query = query\.eq\('decided_by', user!\.id\)/);
    expect(code).not.toMatch(/mineOnly && user/);
  });

  it('batch counts are bounded by arithmetic, not a silent slice', () => {
    // `.slice(0, 25)` dropped the 26th batch, whose group then fell back to
    // the visible row count — the understated number the count exists to
    // prevent, reintroduced by the guard meant to bound it.
    const code = readCode(ROUTE);
    expect(code).not.toMatch(/\.slice\(0, 25\)/);
    expect(code).toMatch(/rowsPerBatch/);
    expect(code).toMatch(/filter\(\(\[, n\]\) => n > 1\)/);
  });
});

describe('Decision Log: no duplicated date formatter', () => {
  it('the retired Investigation Log panel is gone', () => {
    // Its formatTime was the copy this panel drifted from — that is how the
    // year came to be dropped in the rewrite.
    expect(existsSync(path.join(ROOT, 'components/admin/AtlasAiLogPanel.tsx'))).toBe(false);
  });

  it('nothing still references it', () => {
    const shell = readCode('components/admin/AdminShell.tsx');
    expect(shell).not.toMatch(/AtlasAiLogPanel/);
    // ...but the old deep link still resolves.
    expect(shell).toMatch(/'atlas-ai-log': 'atlas-decision-log'/);
  });
});

describe('Decision Log: expansion state is not one shared bag', () => {
  it('table rows and drawer evidence use separate sets', () => {
    const code = readCode(PANEL);
    expect(code).toMatch(/expandedBatches/);
    expect(code).toMatch(/expandedEvidence/);
    // The `ev-` prefix existed only to share one namespace.
    expect(code).not.toMatch(/`ev-\$\{/);
  });
});
