#!/usr/bin/env node

/**
 * Atlas Products — Migrate Orphan Canonical Keys
 *
 * Companion to atlas-revoke-bad-canonical.mjs. Once a bad dict override is
 * revoked, every atlas_products row ingested under it still carries the
 * orphan key in its parameters JSONB. This script either renames those
 * orphan keys to a correct canonical (--to) or removes them entirely
 * (--drop).
 *
 * The orphan value is preserved when renaming — only the key changes.
 * Provenance metadata on the value (source: 'atlas', ingested_at) is
 * untouched. Idempotent: rows already migrated are skipped.
 *
 * Usage:
 *   # Dry run — count rows and show samples:
 *   node scripts/atlas-migrate-orphan-canonical.mjs --from capacitance_khz
 *
 *   # Rename key (preserves value):
 *   node scripts/atlas-migrate-orphan-canonical.mjs --from capacitance_khz --to _static_capacitance --apply
 *
 *   # Drop key (deletes orphan data):
 *   node scripts/atlas-migrate-orphan-canonical.mjs --from capacitance_khz --drop --apply
 *
 * Dry-run by default. --apply required to mutate.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* empty */
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
let fromKey = null;
let toKey = null;
let drop = false;
let apply = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--from' && args[i + 1]) { fromKey = args[i + 1]; i++; continue; }
  if (a === '--to' && args[i + 1]) { toKey = args[i + 1]; i++; continue; }
  if (a === '--drop') { drop = true; continue; }
  if (a === '--apply') { apply = true; continue; }
}

if (!fromKey) {
  console.error('Required: --from <orphan_key>');
  process.exit(1);
}
if (!drop && !toKey) {
  console.error('Required: --to <target_key>  OR  --drop');
  process.exit(1);
}
if (drop && toKey) {
  console.error('Use either --to or --drop, not both');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Scanning atlas_products for orphan key "${fromKey}"...`);

const pageSize = 500;
let offset = 0;
const affected = [];

while (true) {
  const { data, error } = await supabase
    .from('atlas_products')
    .select('id, mpn, manufacturer, family_id, parameters')
    .not('parameters', 'is', null)
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;

  for (const row of data) {
    const params = row.parameters;
    if (params && typeof params === 'object' && fromKey in params) {
      affected.push(row);
    }
  }

  if (data.length < pageSize) break;
  offset += pageSize;
}

console.log(`Found ${affected.length} row(s) carrying orphan key "${fromKey}".\n`);

if (affected.length === 0) {
  console.log('Nothing to migrate.');
  process.exit(0);
}

const byMfr = {};
for (const r of affected) {
  byMfr[r.manufacturer] = (byMfr[r.manufacturer] ?? 0) + 1;
}
console.log('Breakdown by manufacturer:');
for (const [mfr, count] of Object.entries(byMfr).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(6)}  ${mfr}`);
}

console.log('\nFirst 3 sample rows:');
for (const r of affected.slice(0, 3)) {
  console.log(`  ${r.mpn} (${r.manufacturer}, family ${r.family_id})`);
  console.log(`    ${fromKey}: ${JSON.stringify(r.parameters[fromKey])}`);
}

if (!apply) {
  console.log(`\nDry run — no changes made. Re-run with --apply to ${drop ? 'drop the key' : `rename to "${toKey}"`}.`);
  process.exit(0);
}

console.log(`\nApplying: ${drop ? 'DROP' : `RENAME to "${toKey}"`}...`);

let updated = 0;
let skipped = 0;
for (const r of affected) {
  const params = { ...r.parameters };
  const orphanValue = params[fromKey];
  delete params[fromKey];

  if (!drop) {
    if (toKey in params) {
      skipped++;
      continue;
    }
    params[toKey] = orphanValue;
  }

  const { error } = await supabase
    .from('atlas_products')
    .update({ parameters: params })
    .eq('id', r.id);

  if (error) {
    console.error(`  Failed on ${r.mpn}: ${error.message}`);
    continue;
  }
  updated++;
}

console.log(`\nUpdated: ${updated}`);
if (skipped > 0) console.log(`Skipped (target key already present): ${skipped}`);
