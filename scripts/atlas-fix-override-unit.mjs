#!/usr/bin/env node

/**
 * Atlas Triage — surgical UPDATE of a single override's `unit` field.
 *
 * Use when a previously-accepted dictionary override declares the WRONG unit
 * (paramName parenthetical says one unit, override says another, empirical
 * check of stored values confirms paramName was correct).
 *
 * Audit pipeline that discovered this class of bug:
 *   1. scripts/atlas-audit-paramname-unit-mismatch.mjs  → surface suspects
 *   2. Manual categorization → filter false positives (bias-condition units)
 *   3. Empirical value-distribution check per candidate
 *   4. This script → apply fix (dry-run default)
 *   5. `npm run atlas:backfill -- --mfr <name>` → correct existing stored values
 *
 * DRY-RUN BY DEFAULT. Pass --apply to write. Fully reversible — the old unit
 * is printed for restore if needed.
 *
 * Usage:
 *   node scripts/atlas-fix-override-unit.mjs --id <uuid> --to <unit>          # preview
 *   node scripts/atlas-fix-override-unit.mjs --id <uuid> --to <unit> --apply  # write
 *
 * The script prints the before-state (paramName, current unit, attribute) so
 * you can verify you're targeting the right row before applying.
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

// Reject values that look like another flag — otherwise `--to --apply` would
// silently interpret `--apply` as the unit string and write nonsense to
// override.unit. Returns null so downstream usage/help fires.
function getArg(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) return null;
  return v;
}

const id = getArg('--id');
const toUnit = getArg('--to');
const apply = args.includes('--apply');

if (!id || !toUnit) {
  console.error('Usage: node scripts/atlas-fix-override-unit.mjs --id <uuid> --to <unit> [--apply]');
  console.error('  --id    Override UUID (from atlas_dictionary_overrides.id)');
  console.error('  --to    New unit string (e.g. "mA", "mW")');
  console.error('  --apply Write the change (dry-run by default)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fetch the row so we can print before-state and verify it exists / is active
const { data: row, error: fetchErr } = await supabase
  .from('atlas_dictionary_overrides')
  .select('id, family_id, param_name, attribute_id, attribute_name, unit, is_active, created_at, updated_at')
  .eq('id', id)
  .single();

if (fetchErr) {
  console.error(`Fetch failed: ${fetchErr.message}`);
  process.exit(1);
}
if (!row) {
  console.error(`Override not found: id=${id}`);
  process.exit(1);
}

const displayParam = row.param_name.replace(/\n/g, '\\n');
console.log('\n=== Override unit fix ===');
console.log(`  id:              ${row.id}`);
console.log(`  is_active:       ${row.is_active}`);
console.log(`  family_id:       ${row.family_id || '(none)'}`);
console.log(`  attribute_id:    ${row.attribute_id}`);
console.log(`  attribute_name:  ${row.attribute_name || '(none)'}`);
console.log(`  paramName:       "${displayParam}"`);
console.log(`  current unit:    ${row.unit}`);
console.log(`  proposed unit:   ${toUnit}`);
console.log('');

if (!row.is_active) {
  console.log('⚠ This override is INACTIVE (is_active=false). Aborting — reactivate before editing.\n');
  process.exit(1);
}
if (row.unit === toUnit) {
  console.log(`No change — override.unit is already "${toUnit}". Nothing to do.\n`);
  process.exit(0);
}

if (!apply) {
  console.log('DRY-RUN. Pass --apply to write the change.\n');
  console.log(`Undo instructions if needed:`);
  console.log(`  node scripts/atlas-fix-override-unit.mjs --id ${row.id} --to "${row.unit}" --apply`);
  console.log('');
  process.exit(0);
}

const { error: updErr } = await supabase
  .from('atlas_dictionary_overrides')
  .update({ unit: toUnit, updated_at: new Date().toISOString() })
  .eq('id', id);

if (updErr) {
  console.error(`Update failed: ${updErr.message}`);
  process.exit(1);
}

console.log(`✓ Wrote unit="${toUnit}" to override id=${id}`);
console.log(`  (was: "${row.unit}")`);
console.log('');
console.log('⚠ The running Next.js server holds a 60s in-memory cache of dict overrides');
console.log('  (lib/services/atlasDictOverrides.ts). Live queries may see the OLD unit');
console.log('  until the cache expires. If you need it fresh right now, either wait ~60s');
console.log('  or restart the dev server. Backfill (below) reads Supabase directly and is');
console.log('  unaffected.');
console.log('');
console.log('Next: run `npm run atlas:backfill -- --mfr <MFR>` to correct already-stored');
console.log('parameter values on existing atlas_products rows for the affected MFR(s).');
console.log('Prefix with `caffeinate -i` on Mac to prevent sleep during the run.');
console.log('');
