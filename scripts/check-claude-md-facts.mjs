#!/usr/bin/env node
/**
 * check-claude-md-facts — the safety net for trimming CLAUDE.md.
 *
 * CLAUDE.md is loaded in FULL into every session, so it is the single most
 * expensive file in the repo (~200KB / ~50k tokens as of July 2026). It is also
 * 89% hard facts: identifiers, file paths, constants, thresholds. Trimming it by
 * hand is dangerous in a specific way — a dropped invariant does NOT throw an
 * error. It surfaces months later as a bug nobody connects back to a doc edit.
 *
 * So: never trim it on care alone. Trim it, then prove nothing vanished.
 *
 * This extracts every HARD FACT from a baseline revision of CLAUDE.md and
 * asserts each one is still reachable somewhere in the doc corpus (CLAUDE.md
 * itself, or any docs/*.md it points at). Content may MOVE; it may not DISAPPEAR.
 *
 *   node scripts/check-claude-md-facts.mjs                  # vs git HEAD
 *   node scripts/check-claude-md-facts.mjs <git-ref>        # vs any revision
 *
 * Exit 1 (and prints the losses) if any fact went missing.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Baselines to protect, APPEND-ONLY — never replace an entry, only add.
 *
 *  Defaulting to HEAD was a trap: each trim would only be checked against the
 *  previously-trimmed file, so a fact dropped in phase N is "already gone" by
 *  phase N+1 and the loss becomes invisible. Always measure against the original.
 *
 *  But ONE pinned ref decays: it was pinned 2026-07-12, and by 2026-08-03 the file
 *  had moved on far enough that 335 of 1,553 current facts (21.6%) were covered by
 *  nothing — 66 of them existed in no docs/*.md at all, so they could be deleted with
 *  a green result. That gap was exactly the newest, largest entries.
 *
 *  So: union of several baselines. Appending keeps the never-measure-against-the-
 *  previously-trimmed-file property while closing the decay. When you finish a
 *  compaction pass, append the ref of the commit BEFORE it. */
const BASELINES = [
  '8795a3cbb73f1b024df5e4bce9d7910e0da61550', // 2026-07-12 pre-diet, CLAUDE.md 197KB
  'HEAD',                                     // rolling: today's facts, so new entries are covered too
];
/** A single ref may still be passed explicitly to diff against one revision. */
const baseRefs = process.argv[2] && !process.argv[2].startsWith('--') ? [process.argv[2]] : BASELINES;

/** Strictness is opt-in so `prebuild` stays non-breaking; `verify` + CI pass --strict. */
const STRICT = process.argv.includes('--strict');

/** Shelf-1 per-entry cap. Applies ONLY to lines an author ADDED or CHANGED — a
 *  whole-section cap would fail on all 47 pre-existing paragraphs and be switched off
 *  within a day.
 *
 *  1,100 is measured, not chosen. Backtested against every commit since the strategy
 *  landed AND against the output a compaction pass itself produces:
 *      700B -> catches 6/6 regrowth, but falsely blocks 5/47 legitimate entries
 *    1,100B -> catches 6/6 regrowth, falsely blocks 0/47   <- the only clean window
 *    1,200B -> falsely blocks 0/47, but misses 1 of the 6 real regrowth events
 *  A cap validated on one failure mode is not validated. */
const KEY_PATTERN_MAX_BYTES = 1100;

/** Facts deliberately RETIRED — the thing they named no longer exists in the codebase.
 *
 *  Without this list the check stays permanently red after a legitimate deletion, and a
 *  permanently-red check gets silenced (that is exactly how `|| true` ended up in
 *  prebuild). So retirement is allowed — but only here, only explicitly, and only with a
 *  reason. "It's gone" must be a decision somebody made, not a silent disappearance.
 *  Verify with `git log --diff-filter=D` before adding a line. */
const RETIRED = new Map([
  ['`QcShell.tsx`', 'deleted in bdf6be1; QC moved to components/monitoring/MonitoringShell.tsx'],
  ['`QcSectionNav`', 'deleted with QcShell; replaced by MonitoringSectionNav.tsx'],
  ['`components/qc/`', 'directory removed; QC components live in components/monitoring/ + components/admin/'],
  ['BatchProgressDialog.tsx', 'never existed in git; documented in error'],
]);

/** A "hard fact" is a token a future session could BREAK by not knowing it.
 *  Deliberately over-inclusive: a false positive costs one grep; a false
 *  negative is a silently-lost invariant, which is the thing we are preventing. */
function extractFacts(text) {
  const facts = new Set();
  const add = (m) => { for (const x of m ?? []) facts.add(x.trim()); };
  add(text.match(/`[^`\n]{2,80}`/g));                    // `anything in backticks`
  add(text.match(/\b[A-Z][A-Z0-9_]{3,}\b/g));            // CONSTANT_NAMES
  add(text.match(/\b[\w./-]+\.(ts|tsx|mjs|sql|json|docx|md)\b/g)); // file paths
  add(text.match(/\bDecision #\d+\b/g));                 // decision pointers
  add(text.match(/\/api\/[\w[\]/-]+/g));                 // API routes
  return facts;
}

/** Everything a future session can still reach: CLAUDE.md + the docs it links. */
function corpus() {
  let all = readFileSync('CLAUDE.md', 'utf8');
  for (const f of readdirSync('docs')) {
    if (f.endsWith('.md')) all += '\n' + readFileSync(join('docs', f), 'utf8');
  }
  return all;
}

/** The lines of the `## Key Patterns` section — the section that has absorbed 100% of
 *  the regrowth after each of the three compactions. */
function keyPatternLines(text) {
  const out = [];
  let inSection = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('## Key Patterns')) { inSection = true; continue; }
    if (inSection && line.startsWith('## ')) break;
    if (inSection) out.push(line);
  }
  return out;
}

/** Read a file at a git ref, or null when the ref cannot be resolved. */
function showAtRef(ref, path) {
  try {
    return execSync(`git show ${ref}:${path}`, { encoding: 'utf8', maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const before = (() => {
  for (const ref of baseRefs) { const t = showAtRef(ref, 'CLAUDE.md'); if (t) return t; }
  return '';
})();
/** Union across every baseline: one pinned ref decays as the file moves on. */
const baseline = new Set();
for (const ref of baseRefs) {
  const text = showAtRef(ref, 'CLAUDE.md');
  if (text) for (const f of extractFacts(text)) baseline.add(f);
}
const reachable = corpus();

const lost = [...baseline].filter((f) => !reachable.includes(f) && !RETIRED.has(f));
const retiredHits = [...baseline].filter((f) => !reachable.includes(f) && RETIRED.has(f));

const size = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)}KB`;
console.log(`baselines: ${baseRefs.map((r) => r.slice(0, 8)).join(' + ')} — ${baseline.size} hard facts (union)`);
console.log(`current CLAUDE.md:    ${size(readFileSync('CLAUDE.md', 'utf8'))}`);
console.log(`docs corpus searched: CLAUDE.md + docs/*.md`);
if (before) console.log(`oldest baseline size: ${size(before)}`);

// Shelf-1 size budget (docs/KNOWLEDGE_DOCS_STRATEGY.md). Warning only — never fails —
// so a growing always-loaded file is visible before it re-saturates.
const CLAUDE_BUDGET_KB = 125;
const claudeKB = Buffer.byteLength(readFileSync('CLAUDE.md', 'utf8')) / 1024;
if (claudeKB > CLAUDE_BUDGET_KB)
  console.log(`\n⚠️  CLAUDE.md is ${claudeKB.toFixed(1)}KB, over the ${CLAUDE_BUDGET_KB}KB Shelf-1 budget — demote detail to a topic doc or decision archive (warning only).`);

let failed = false;

// ── 1. Nothing may vanish (always enforced) ──────────────────────────────────
if (retiredHits.length) {
  console.log(`\nℹ️  ${retiredHits.length} fact(s) deliberately retired (the thing they named is gone):`);
  for (const f of retiredHits) console.log(`   ${f} — ${RETIRED.get(f)}`);
}

if (lost.length === 0) {
  console.log(`\n✅ all ${baseline.size - retiredHits.length} live facts still reachable — nothing was lost, only moved.`);
} else {
  failed = true;
  console.log(`\n❌ ${lost.length} fact(s) exist in a baseline and NOWHERE in the corpus:\n`);
  for (const f of lost.slice(0, 60)) console.log(`   ${f}`);
  if (lost.length > 60) console.log(`   … and ${lost.length - 60} more`);
  console.log(`\nRestore them (or confirm each is genuinely obsolete) before committing.`);
}

if (STRICT) {
  // ── 2. New Key-Patterns entries must be a rule + pointer, never a paragraph ──
  // Scoped to ADDED/CHANGED lines: the pre-existing paragraphs are grandfathered, so
  // this lands with zero content change and fires only on the next one written.
  const mainText = showAtRef('origin/main', 'CLAUDE.md') ?? showAtRef('HEAD', 'CLAUDE.md');
  if (mainText === null) {
    // Fail OPEN when there is nothing to diff against — same convention as
    // .claude/hooks/require-docs-on-push.mjs. A guard that blocks on uncertainty
    // gets removed; one that waves through on uncertainty survives to catch the real case.
    console.log(`\n⚠️  no origin/main or HEAD to diff against — per-entry cap skipped.`);
  } else {
    const previous = new Set(keyPatternLines(mainText));
    const oversized = keyPatternLines(readFileSync('CLAUDE.md', 'utf8'))
      .filter((l) => l.trim() && !previous.has(l) && Buffer.byteLength(l) > KEY_PATTERN_MAX_BYTES);
    if (oversized.length) {
      failed = true;
      console.log(`\n❌ ${oversized.length} new/changed Key Patterns entr${oversized.length === 1 ? 'y is' : 'ies are'} over ${KEY_PATTERN_MAX_BYTES}B:\n`);
      for (const l of oversized) console.log(`   ${Buffer.byteLength(l)}B  ${l.slice(0, 96)}…`);
      console.log(
        `\nA new pattern earns a one-line rule + a (Decision #N) / topic-doc pointer here —\n` +
        `never a paragraph. The paragraph goes to a flat docs/*.md.\n` +
        `(docs/KNOWLEDGE_DOCS_STRATEGY.md, Shelf 1)`,
      );
    } else {
      console.log(`✅ no oversized new Key Patterns entries (cap ${KEY_PATTERN_MAX_BYTES}B on added/changed lines).`);
    }
  }

  // ── 3. The docs must not describe files that do not exist ───────────────────
  // The fact check is doc-to-doc and never consults the code, which is how six
  // filenames and a whole directory sat in CLAUDE.md, green, for weeks.
  const tracked = new Set(
    execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64e6 })
      .split('\n')
      .map((p) => p.split('/').pop()),
  );
  const phantom = [...new Set(readFileSync('CLAUDE.md', 'utf8').match(/\b[\w./-]+\.(ts|tsx|mjs|sql|json)\b/g) ?? [])]
    .filter((p) => !tracked.has(p.split('/').pop()));
  if (phantom.length) {
    failed = true;
    console.log(`\n❌ ${phantom.length} source file(s) named in CLAUDE.md do not exist in git:\n`);
    for (const p of phantom) console.log(`   ${p}`);
    console.log(`\nFix the name, or delete the entry — documenting a file that isn't there is worse than silence.`);
  } else {
    console.log(`✅ every source file named in CLAUDE.md exists in git.`);
  }
}

process.exit(failed ? 1 : 0);
