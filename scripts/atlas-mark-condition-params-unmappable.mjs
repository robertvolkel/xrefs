#!/usr/bin/env node

/**
 * Atlas Triage — bulk-mark vendor test-condition columns as unmappable
 *
 * Galaxy (and some other vendors) ship one universal datasheet-export
 * template that rides along on every part, carrying generic
 * `ConditionN_<param>` columns — `Condition1_IC`, `Condition2_IB`,
 * `Condition1_IF`, etc. These are test-condition qualifiers (the
 * current/voltage AT WHICH another spec is measured), never device
 * specs. They are always `unmappable` and otherwise clog the Triage
 * queue forever.
 *
 * This marks every queue paramName matching the pattern (default
 * /^condition/i) with status='unmappable' on `atlas_unmapped_param_notes`
 * — identical to clicking "Mark unmappable instead" on each row, but in
 * one pass. paramName strings are harvested VERBATIM from the batch
 * reports (the same source the queue reads) so Unicode look-alikes like
 * the Greek mu in `Condition1_IBO (µA)` match exactly.
 *
 * DRY-RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node scripts/atlas-mark-condition-params-unmappable.mjs            # preview
 *   node scripts/atlas-mark-condition-params-unmappable.mjs --apply    # write
 *   node scripts/atlas-mark-condition-params-unmappable.mjs --pattern '^cond' --apply
 *
 * Idempotent (rows already unmappable are skipped). Existing team notes
 * are preserved. Reversible: set status back to null via the Triage UI
 * or the unmapped-param-notes endpoint.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

function loadEnv() {
  try {
    const content = readFileSync(resolve(REPO_ROOT, '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  } catch { /* empty */ }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const patternArg = (() => {
  const idx = args.indexOf('--pattern');
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : '^condition';
})();
const pattern = new RegExp(patternArg, 'i');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Resolve an admin user UUID to attribute the action to. Prefer whoever
// has been doing triage recently (most recent notes author who is an
// admin); fall back to the first admin profile. `updated_by` is NOT NULL.
async function resolveActor() {
  const { data: recent } = await supabase
    .from('atlas_unmapped_param_notes')
    .select('updated_by, updated_at')
    .not('updated_by', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(20);
  for (const r of recent || []) {
    const { data: p } = await supabase
      .from('profiles').select('id, email, role').eq('id', r.updated_by).maybeSingle();
    if (p && p.role === 'admin') return { id: p.id, email: p.email };
  }
  const { data: admin } = await supabase
    .from('profiles').select('id, email').eq('role', 'admin').limit(1).maybeSingle();
  if (admin) return { id: admin.id, email: admin.email };
  return null;
}

async function harvestQueueParams() {
  const { data, error } = await supabase
    .from('atlas_ingest_batches')
    .select('report')
    .in('status', ['pending', 'applied']);
  if (error) { console.error('batch query error:', error.message); process.exit(1); }
  const seen = new Map(); // exact paramName -> { prod, mfrs:Set }
  for (const b of data || []) {
    for (const up of (b.report && b.report.unmappedParams) || []) {
      const pn = up.paramName || '';
      if (!pattern.test(pn.trim())) continue;
      const e = seen.get(pn) || { prod: 0, mfrs: new Set() };
      e.prod += up.productCount || 0;
      seen.set(pn, e);
    }
  }
  return seen;
}

async function run() {
  const seen = await harvestQueueParams();
  const exact = [...seen.keys()].sort();
  if (exact.length === 0) {
    console.log(`\nNo queue paramNames match /${patternArg}/i. Nothing to do.\n`);
    return;
  }

  const { data: notes } = await supabase
    .from('atlas_unmapped_param_notes').select('param_name, note, status');
  const noteByName = new Map((notes || []).map((n) => [n.param_name, n]));
  const todo = exact.filter((pn) => {
    const ex = noteByName.get(pn);
    return !(ex && ex.status === 'unmappable');
  });
  const alreadyDone = exact.length - todo.length;

  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Bulk-mark unmappable — pattern /${patternArg}/i`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Matching queue params : ${exact.length}`);
  console.log(`  Already unmappable     : ${alreadyDone}`);
  console.log(`  To mark                : ${todo.length}`);
  console.log('');
  for (const pn of exact) {
    const done = noteByName.get(pn)?.status === 'unmappable';
    console.log(`    ${done ? '[done]' : '[mark]'} ${pn}  (~${seen.get(pn).prod} prod)`);
  }
  console.log('');

  if (todo.length === 0) {
    console.log('  Everything already marked. Nothing to write.\n');
    return;
  }

  if (!apply) {
    console.log('  DRY RUN — no changes written. Re-run with --apply to mark these.\n');
    return;
  }

  const actor = await resolveActor();
  if (!actor) {
    console.error('  Could not resolve an admin user for updated_by. Aborting.');
    process.exit(1);
  }
  console.log(`  Attributing to: ${actor.email} (${actor.id})`);

  const rows = todo.map((pn) => ({
    param_name: pn,
    note: noteByName.get(pn)?.note || null,
    status: 'unmappable',
    flagged_by: 'engineer',
    updated_by: actor.id,
  }));
  const { data: up, error } = await supabase
    .from('atlas_unmapped_param_notes')
    .upsert(rows, { onConflict: 'param_name' })
    .select('param_name');
  if (error) { console.error('  UPSERT error:', error.message); process.exit(1); }
  console.log(`  ✓ Marked ${up.length} param(s) unmappable.`);

  // Invalidate any triage queue L2 cache row so the rows drop immediately.
  const { data: cacheRows } = await supabase.from('admin_stats_cache').select('key');
  const triageKeys = (cacheRows || []).map((r) => r.key).filter((k) => /triage/i.test(k));
  for (const k of triageKeys) {
    await supabase.from('admin_stats_cache').delete().eq('key', k);
    console.log(`  ✓ Invalidated cache: ${k}`);
  }
  if (triageKeys.length === 0) console.log('  (no triage cache row present — already cold)');
  console.log('\n  Click Refresh on the Triage page to see the rows drop.\n');
}

run();
