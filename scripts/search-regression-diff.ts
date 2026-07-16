/* eslint-disable @typescript-eslint/no-explicit-any --
 * Reads the harness's JSON snapshots, whose row shape is intentionally loose (it must survive schema
 * differences between the two commits being compared). Structural access with `any` is deliberate. */
/**
 * SEARCH REGRESSION DIFF — compare two harness runs and say, in plain terms, what changed.
 *
 * The two control groups are ASSERTIONS: a part-number lookup and a description with no stated
 * specs must come back IDENTICAL, because every line of the spec-search work is gated on
 * "constraints present". Any difference there is a regression and this script fails.
 *
 * The spec-search group is a REPORT, not an assertion: those answers are MEANT to change. It
 * prints the before/after side by side, with the `expect` note, for a human to judge.
 *
 *     npx tsx scripts/search-regression-diff.ts <before.json> <after.json>
 */
import { readFileSync } from 'node:fs';

interface Row { rank: number; mpn: string; manufacturer: string; matchScore?: number; failCount?: number; hardFail?: boolean }
interface Snap {
  id: string; group: string; query: string; expect?: string; error?: string;
  matchType?: string; totalResults: number; narrowing?: any; top: Row[];
}

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) { console.error('usage: search-regression-diff.ts <before.json> <after.json>'); process.exit(1); }

const before: Snap[] = JSON.parse(readFileSync(beforePath, 'utf8')).snapshots;
const after: Snap[] = JSON.parse(readFileSync(afterPath, 'utf8')).snapshots;
const byId = (s: Snap[]) => new Map(s.map(x => [x.id, x]));
const B = byId(before), A = byId(after);

const GREEN = '\x1b[32m', RED = '\x1b[31m', YEL = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', OFF = '\x1b[0m';

let regressions = 0;

// ── The controls: identical, or it's a regression. ────────────────────────────────────────────
for (const group of ['mpn-control', 'descriptive-control'] as const) {
  const title = group === 'mpn-control'
    ? 'CONTROL · bare part numbers — must be IDENTICAL (no constraints ⇒ none of the new code runs)'
    : 'CONTROL · descriptions with no stated specs — must be IDENTICAL (same reason)';
  console.log(`\n${BOLD}${title}${OFF}`);

  for (const a of after.filter(s => s.group === group)) {
    const b = B.get(a.id);
    if (!b) { console.log(`  ${YEL}? ${a.id} — not in the "before" run${OFF}`); continue; }

    const problems: string[] = [];
    if (b.error !== a.error) problems.push(`error: ${b.error ?? 'none'} → ${a.error ?? 'none'}`);
    if (b.totalResults !== a.totalResults) problems.push(`result count ${b.totalResults} → ${a.totalResults}`);
    if (b.matchType !== a.matchType) problems.push(`matchType ${b.matchType} → ${a.matchType}`);

    const bTop = b.top.map(r => r.mpn).join(' | ');
    const aTop = a.top.map(r => r.mpn).join(' | ');
    if (bTop !== aTop) problems.push(`order changed:\n      before: ${bTop}\n      after : ${aTop}`);

    if (problems.length === 0) {
      console.log(`  ${GREEN}✓${OFF} ${a.id.padEnd(10)} ${DIM}${a.query.slice(0, 42).padEnd(44)}${OFF} ${String(a.totalResults).padStart(3)} results, identical`);
    } else {
      regressions++;
      console.log(`  ${RED}✗ REGRESSION${OFF} ${a.id.padEnd(10)} ${JSON.stringify(a.query)}`);
      for (const p of problems) console.log(`      ${RED}${p}${OFF}`);
    }
  }
}

// ── The changed path: a report for a human. ───────────────────────────────────────────────────
console.log(`\n${BOLD}THE CHANGED PATH · descriptions WITH stated specs — these are MEANT to differ${OFF}`);
console.log(`${DIM}Read each one against its "expect" line and judge whether it got better.${OFF}`);

for (const a of after.filter(s => s.group === 'spec-search')) {
  const b = B.get(a.id);
  console.log(`\n  ${BOLD}${a.id}${OFF} — ${JSON.stringify(a.query)}`);
  if (a.expect) console.log(`  ${DIM}expect: ${a.expect}${OFF}`);
  if (a.error || b?.error) console.log(`  ${RED}error — before: ${b?.error ?? 'none'} | after: ${a.error ?? 'none'}${OFF}`);

  console.log(`  results: ${b?.totalResults ?? '?'} → ${a.totalResults}`);
  if (a.narrowing) console.log(`  ${YEL}asks a narrowing question:${OFF} "${a.narrowing.label}" → [${a.narrowing.options.join('] [')}]  (pool ${a.narrowing.poolSize})`);

  const bRank = new Map((b?.top ?? []).map(r => [r.mpn, r.rank]));
  const fmt = (r: Row) => {
    const was = bRank.get(r.mpn);
    const move = was === undefined ? `${GREEN}NEW${OFF}` : was === r.rank ? `${DIM}=${OFF}` : was > r.rank ? `${GREEN}↑${was}${OFF}` : `${RED}↓${was}${OFF}`;
    const fit = r.hardFail ? `${RED}BELOW SPEC${OFF}` : r.matchScore !== undefined ? `${GREEN}fits${OFF} ${r.matchScore}%` : '';
    const fails = r.failCount ? ` ${DIM}(${r.failCount} miss)${OFF}` : '';
    return `    ${String(r.rank).padStart(2)}. ${r.mpn.padEnd(22)} ${DIM}${(r.manufacturer ?? '').slice(0, 16).padEnd(17)}${OFF} ${fit}${fails}  ${move}`;
  };
  console.log(`  ${DIM}after (top 12; ↑n / ↓n = its rank BEFORE):${OFF}`);
  for (const r of a.top) console.log(fmt(r));

  const dropped = (b?.top ?? []).filter(r => !a.top.some(x => x.mpn === r.mpn));
  if (dropped.length) console.log(`  ${YEL}fell out of the top 12:${OFF} ${dropped.map(r => r.mpn).join(', ')}`);
}

console.log('');
if (regressions > 0) {
  console.log(`${RED}${BOLD}✗ ${regressions} REGRESSION(S) in the control groups.${OFF} A query that carries no stated specs changed its answer — the spec-search work was supposed to be invisible to it.`);
  process.exit(1);
}
console.log(`${GREEN}${BOLD}✓ No regressions.${OFF} Every part-number lookup and every spec-less description returns exactly what it returned before.`);
