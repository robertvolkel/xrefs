#!/usr/bin/env node
/**
 * PreToolUse (Bash) hook — the docs gate.
 *
 * Blocks a `git push` on branch `main` when the commits ahead of origin/main change CODE
 * (lib/ components/ app/ hooks/ scripts/) but touch NO docs (docs/ or CLAUDE.md). This is
 * the machine-enforced version of the "record the work in the repo docs" convention — memory
 * can't enforce it, a hook can.
 *
 * The ONLY way past a code-only push is a commit message in the pushed range that states why
 * no docs are needed:   docs: none — <reason>   (a non-empty reason is required). So skipping
 * is never silent — it's a conscious, greppable decision.
 *
 * Fails OPEN (allow) on ANY uncertainty — not a push, not on main, origin/main unknown, git
 * error, unreadable input — so it can never block spuriously. It only ever has teeth in the one
 * exact situation it's meant for.
 *
 * Scope: fires only within Claude Code sessions (it's a PreToolUse Bash hook). Manual pushes
 * from a terminal are unaffected.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOW = 0; // let the tool run
const BLOCK = 2; // PreToolUse: block the tool; stderr is shown to Claude

function sh(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// 1) Parse the tool input. Anything unexpected → allow.
let command = '';
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  command = input?.tool_input?.command ?? '';
} catch {
  process.exit(ALLOW);
}

// 2) Only a git push is in scope.
if (!/\bgit\s+push\b/.test(command)) process.exit(ALLOW);

// 3) Find the repo (cwd-independent). Can't → allow.
const root = sh('git rev-parse --show-toplevel');
if (!root) process.exit(ALLOW);
const git = (args) => sh(`git ${args}`, root);

// 4) Enforce ONLY on branch main.
if (git('rev-parse --abbrev-ref HEAD') !== 'main') process.exit(ALLOW);

// 5) Need origin/main to know what's being pushed. Unknown → allow.
if (!git('rev-parse --verify --quiet origin/main')) process.exit(ALLOW);

// 6) Net file changes in the commits about to be pushed (merge-base..HEAD).
const files = git('diff --name-only origin/main...HEAD')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
if (files.length === 0) process.exit(ALLOW); // nothing new to push

const isCode = (f) => /^(lib|components|app|hooks|scripts)\//.test(f);
const isDoc = (f) => /^docs\//.test(f) || f === 'CLAUDE.md';

const codeFiles = files.filter(isCode);
if (codeFiles.length === 0) process.exit(ALLOW); // no code touched → nothing to require
if (files.some(isDoc)) process.exit(ALLOW); // docs were updated → satisfied

// 7) Conscious bypass: a commit in the pushed range states why no docs are needed.
const messages = git('log --format=%B origin/main..HEAD');
if (/\bdocs:\s*none\s*[—–-]\s*\S+/i.test(messages)) process.exit(ALLOW);

// 8) Code changed, no docs, no stated reason → BLOCK.
const shown = codeFiles.slice(0, 8).map((f) => `    ${f}`).join('\n');
const more = codeFiles.length > 8 ? `\n    …and ${codeFiles.length - 8} more` : '';
process.stderr.write(
  `⛔ Docs gate — this push changes code but updates no docs.\n\n` +
    `Code changed with no matching doc update:\n${shown}${more}\n\n` +
    `Record the work in the repo docs, as appropriate:\n` +
    `  • docs/DECISIONS.md (+ the archive)  — an architectural decision\n` +
    `  • docs/BACKLOG.md                    — a known gap / follow-up\n` +
    `  • CLAUDE.md                          — a load-bearing pattern\n` +
    `Then run: npm run docs:check — and push again.\n\n` +
    `If this genuinely needs NO docs, add a commit-message line saying why:\n` +
    `  docs: none — <reason>   (e.g. "docs: none — internal refactor, no behavior change")\n`,
);
process.exit(BLOCK);
