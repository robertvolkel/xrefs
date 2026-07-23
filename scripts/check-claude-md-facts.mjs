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

/** The PRE-DIET baseline (CLAUDE.md at 197KB, 1,971 facts), pinned deliberately.
 *  Defaulting to HEAD was a trap: each trim would only be checked against the
 *  previously-trimmed file, so a fact dropped in phase N is "already gone" by
 *  phase N+1 and the loss becomes invisible. Always measure against the original. */
const PRE_DIET_BASELINE = '8795a3cbb73f1b024df5e4bce9d7910e0da61550';
const baseRef = process.argv[2] ?? PRE_DIET_BASELINE;

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

const before = execSync(`git show ${baseRef}:CLAUDE.md`, { encoding: 'utf8', maxBuffer: 64e6 });
const baseline = extractFacts(before);
const reachable = corpus();

const lost = [...baseline].filter((f) => !reachable.includes(f));

const size = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)}KB`;
console.log(`baseline (${baseRef}): ${size(before)}, ${baseline.size} hard facts`);
console.log(`current CLAUDE.md:    ${size(readFileSync('CLAUDE.md', 'utf8'))}`);
console.log(`docs corpus searched: CLAUDE.md + docs/*.md`);

// Shelf-1 size budget (docs/KNOWLEDGE_DOCS_STRATEGY.md). Warning only — never fails —
// so a growing always-loaded file is visible before it re-saturates.
const CLAUDE_BUDGET_KB = 125;
const claudeKB = Buffer.byteLength(readFileSync('CLAUDE.md', 'utf8')) / 1024;
if (claudeKB > CLAUDE_BUDGET_KB)
  console.log(`\n⚠️  CLAUDE.md is ${claudeKB.toFixed(1)}KB, over the ${CLAUDE_BUDGET_KB}KB Shelf-1 budget — demote detail to a topic doc or decision archive (warning only).`);

if (lost.length === 0) {
  console.log(`\n✅ all ${baseline.size} facts still reachable — nothing was lost, only moved.`);
  process.exit(0);
}
console.log(`\n❌ ${lost.length} fact(s) exist in the baseline and NOWHERE in the corpus:\n`);
for (const f of lost.slice(0, 60)) console.log(`   ${f}`);
if (lost.length > 60) console.log(`   … and ${lost.length - 60} more`);
console.log(`\nRestore them (or confirm each is genuinely obsolete) before committing.`);
process.exit(1);
