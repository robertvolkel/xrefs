#!/usr/bin/env node

/**
 * Atlas Dictionary — Revoke a Bad Canonical
 *
 * Surfaces every active dict override pointing at a given attribute_id and
 * optionally soft-deletes them (sets is_active=false). Built originally to
 * clean up `capacitance_khz` — a canonical the /suggest AI invented and
 * propagated via accept actions before May 18, 2026, when the family-card
 * audit flagged it. Once an override row like this exists, /suggest keeps
 * citing it as "previously accepted" and re-poisons new rows.
 *
 * Usage:
 *   # Dry run (default) — just lists matching active overrides:
 *   node scripts/atlas-revoke-bad-canonical.mjs --id capacitance_khz
 *
 *   # Confirm + soft-delete (is_active=false, audit trail preserved):
 *   node scripts/atlas-revoke-bad-canonical.mjs --id capacitance_khz --revoke
 *
 * Read-only by default. --revoke required to mutate.
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
let attributeId = null;
let revoke = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--id' && args[i + 1]) {
    attributeId = args[i + 1];
    i++;
    continue;
  }
  if (a === '--revoke') {
    revoke = true;
    continue;
  }
  if (a === '--help' || a === '-h') {
    console.log('Usage: node scripts/atlas-revoke-bad-canonical.mjs --id <attribute_id> [--revoke]');
    process.exit(0);
  }
}

if (!attributeId) {
  console.error('Required: --id <attribute_id>   (e.g. --id capacitance_khz)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from('atlas_dictionary_overrides')
  .select('id, family_id, param_name, attribute_id, attribute_name, unit, action, created_by, created_at, change_reason')
  .eq('attribute_id', attributeId)
  .eq('is_active', true)
  .order('created_at', { ascending: true });

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log(`No active overrides found for attribute_id="${attributeId}".`);
  console.log('Nothing to revoke. The "previously-accepted" framing in /suggest is hallucinated.');
  process.exit(0);
}

console.log(`Found ${data.length} active override(s) for attribute_id="${attributeId}":\n`);
for (const row of data) {
  console.log(`  family_id   : ${row.family_id}`);
  console.log(`  param_name  : ${row.param_name}`);
  console.log(`  attr_id     : ${row.attribute_id}`);
  console.log(`  attr_name   : ${row.attribute_name}`);
  console.log(`  unit        : ${row.unit ?? '(none)'}`);
  console.log(`  action      : ${row.action}`);
  console.log(`  created_at  : ${row.created_at}`);
  console.log(`  reason      : ${row.change_reason ?? '(none)'}`);
  console.log(`  row_id      : ${row.id}`);
  console.log('');
}

if (!revoke) {
  console.log('Dry run — no changes made.');
  console.log('Re-run with --revoke to soft-delete these rows (sets is_active=false).');
  process.exit(0);
}

const ids = data.map((r) => r.id);
const { error: updateError } = await supabase
  .from('atlas_dictionary_overrides')
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .in('id', ids);

if (updateError) {
  console.error('Revoke failed:', updateError.message);
  process.exit(1);
}

console.log(`Soft-deleted ${ids.length} override row(s). is_active=false.`);
console.log('Audit trail preserved. /suggest should stop citing this canonical.');
