#!/usr/bin/env node

/**
 * Team Update Email — Live Atlas figures
 *
 * Pulls the time-sensitive, continuously-changing numbers that must NEVER be
 * quoted from documentation (CLAUDE.md / MEMORY.md / DECISIONS.md go stale).
 * Run this every time you draft an update email.
 *
 * Resolves node_modules + .env.local by walking up to the repo root, so it
 * works regardless of the current working directory (as long as it lives
 * inside the repo tree).
 *
 * Usage:
 *   node .claude/skills/team-update-email/atlas-stats.mjs            # last 30 days
 *   node .claude/skills/team-update-email/atlas-stats.mjs --days 28  # custom window
 *   node .claude/skills/team-update-email/atlas-stats.mjs --since 2026-05-18 --until 2026-06-15
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..'); // .claude/skills/team-update-email -> repo root

// --- load .env.local ---
for (const line of readFileSync(resolve(REPO_ROOT, '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// --- args ---
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const sinceArg = arg('--since');
const untilArg = arg('--until');
const days = arg('--days') ? parseInt(arg('--days'), 10) : 30;

const until = untilArg ? new Date(untilArg) : new Date();
const since = sinceArg ? new Date(sinceArg) : new Date(until.getTime() - days * 24 * 60 * 60 * 1000);

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const head = { count: 'exact', head: true };
const { count: totalProducts } = await sb.from('atlas_products').select('*', head);
const { count: mfrMasterRows } = await sb.from('atlas_manufacturers').select('*', head);
const { count: addedInRange } = await sb
  .from('atlas_products')
  .select('*', head)
  .gte('created_at', since.toISOString())
  .lte('created_at', until.toISOString());

const before = (totalProducts ?? 0) - (addedInRange ?? 0);
const multiple = before > 0 ? (totalProducts / before).toFixed(1) : 'n/a';

console.log('=== Atlas live figures (verified against atlas_products) ===');
console.log(`Window:                 ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`);
console.log(`Total products now:     ${totalProducts?.toLocaleString()}`);
console.log(`Added in window:        ${addedInRange?.toLocaleString()}`);
console.log(`Total at window start:  ~${before.toLocaleString()}`);
console.log(`Growth multiple:        ${multiple}x over the window`);
console.log(`Manufacturer master rows: ${mfrMasterRows?.toLocaleString()} (NOTE: "live" MFR count comes from the Atlas Coverage dashboard, not this table — this is the full master list)`);
console.log('');
console.log('Reminder: confirm "live manufacturers" + "categories" against the Atlas Coverage Report dashboard.');
