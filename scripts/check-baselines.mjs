#!/usr/bin/env node
/**
 * check-baselines — a RATCHET for lint and typecheck.
 *
 * WHY NOT JUST FAIL ON ANY ERROR
 * `npm run lint` and `tsc --noEmit` both already exit non-zero on main: 86
 * lint errors and 92 type errors predate this work. Wiring those straight into
 * CI would paint the branch red on day one for reasons unrelated to any change
 * — and a permanently-red check is worse than no check, because a real failure
 * hides inside it and everyone learns to ignore the cross.
 *
 * So this compares against a COMMITTED baseline and fails only when a number
 * goes UP. The counts can never silently grow, and when they fall the script
 * says so and asks you to lower the baseline — a one-way ratchet toward zero.
 *
 *   node scripts/check-baselines.mjs           # check (CI + `npm run verify`)
 *   node scripts/check-baselines.mjs --update  # record current counts
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE = new URL('../.quality-baseline.json', import.meta.url);
const UPDATE = process.argv.includes('--update');

/** Run a command and return its combined output; non-zero exit is expected. */
function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

function countLintErrors() {
  const out = run('npx eslint . -f json');
  const start = out.indexOf('[');
  if (start === -1) throw new Error(`Could not parse eslint output:\n${out.slice(0, 500)}`);
  const results = JSON.parse(out.slice(start));
  return results.reduce((n, f) => n + f.errorCount, 0);
}

function countTypeErrors() {
  const out = run('npx tsc --noEmit -p tsconfig.json');
  return out.split('\n').filter((l) => / error TS\d+/.test(l)).length;
}

const current = { lintErrors: countLintErrors(), typeErrors: countTypeErrors() };

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Ratchet baselines. These may only go DOWN. check-baselines.mjs fails CI if a count rises; run --update after genuinely reducing one.',
        ...current,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Baseline recorded: ${current.lintErrors} lint errors, ${current.typeErrors} type errors.`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf-8'));
let failed = false;

for (const [key, label] of [
  ['lintErrors', 'lint errors'],
  ['typeErrors', 'type errors'],
]) {
  const now = current[key];
  const was = base[key];
  if (now > was) {
    console.error(`FAIL  ${label}: ${was} → ${now}  (+${now - was}). Fix them, or they become the new normal.`);
    failed = true;
  } else if (now < was) {
    console.log(`IMPROVED  ${label}: ${was} → ${now}. Run \`npm run baseline:update\` to lock the gain in.`);
  } else {
    console.log(`OK  ${label}: ${now} (unchanged)`);
  }
}

process.exit(failed ? 1 : 0);
