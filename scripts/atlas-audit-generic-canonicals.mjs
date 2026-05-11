#!/usr/bin/env node

/**
 * Atlas Dictionary — Generic-Canonical Audit
 *
 * Surfaces every active dictionary override whose attribute_id is one of
 * the known "junk drawer" generics (style, type, size, kind, category,
 * material, characteristic). These attributeIds tend to accumulate
 * semantically unrelated values across MFRs because the AI suggester
 * falls back to them when no schema match exists. Once a single canonical
 * holds 4+ unrelated concepts (e.g. style = orientation + flange-presence
 * + series-reference), downstream filtering and comparison break silently.
 *
 * Output: a per-attributeId table grouped by family/category, with the
 * raw paramName + display name + acceptance metadata. Engineer reviews
 * the list, decides which to revert (via the Triage UI's Revert action),
 * and re-accepts under more specific attributeIds.
 *
 * Usage:
 *   node scripts/atlas-audit-generic-canonicals.mjs
 *   node scripts/atlas-audit-generic-canonicals.mjs --ids style,type,kind
 *   node scripts/atlas-audit-generic-canonicals.mjs --json
 *
 * Read-only — does not modify any data. Safe to run anytime.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load environment ─────────────────────────────────────

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
    // .env.local not found — fall through to error below
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// ─── CLI parsing ──────────────────────────────────────────

const DEFAULT_GENERIC_IDS = [
  'style',
  'type',
  'size',
  'kind',
  'category',
  'material',
  'characteristic',
  'characteristics',
  'feature',
  'features',
  'spec',
  'specs',
  'specification',
  'specifications',
];

const args = process.argv.slice(2);
let attributeIds = DEFAULT_GENERIC_IDS;
let outputJson = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--ids' && args[i + 1]) {
    attributeIds = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
    i++;
    continue;
  }
  if (a === '--json') {
    outputJson = true;
    continue;
  }
  if (a === '--help' || a === '-h') {
    console.log(`
Atlas Dictionary — Generic-Canonical Audit

Surfaces active dict overrides mapped to known junk-drawer attributeIds.

Usage:
  node scripts/atlas-audit-generic-canonicals.mjs
  node scripts/atlas-audit-generic-canonicals.mjs --ids style,type,kind
  node scripts/atlas-audit-generic-canonicals.mjs --json

Default attributeIds checked:
  ${DEFAULT_GENERIC_IDS.join(', ')}
`);
    process.exit(0);
  }
  console.error(`Unknown argument: ${a}`);
  process.exit(1);
}

// ─── Query ────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.error(`Auditing ${attributeIds.length} attributeId(s): ${attributeIds.join(', ')}\n`);

const { data, error } = await supabase
  .from('atlas_dictionary_overrides')
  .select('id, family_id, param_name, attribute_id, attribute_name, unit, change_reason, created_by, created_at, updated_at')
  .eq('is_active', true)
  .in('attribute_id', attributeIds)
  .order('attribute_id', { ascending: true })
  .order('family_id', { ascending: true })
  .order('created_at', { ascending: true });

if (error) {
  console.error(`Query failed: ${error.message}`);
  process.exit(1);
}

const rows = data ?? [];

if (rows.length === 0) {
  console.error('No active overrides found mapping to any of the audited attributeIds.');
  console.error('Dictionary is clean on the generic-catchall axis. ✅');
  process.exit(0);
}

// Resolve admin display names in one batch read
const userIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
const nameMap = new Map();
if (userIds.length > 0) {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  for (const p of profiles ?? []) {
    nameMap.set(p.id, p.full_name || 'Unknown');
  }
}

// ─── Output ───────────────────────────────────────────────

if (outputJson) {
  const enriched = rows.map((r) => ({
    overrideId: r.id,
    attributeId: r.attribute_id,
    familyOrCategory: r.family_id,
    rawParamName: r.param_name,
    attributeName: r.attribute_name,
    unit: r.unit,
    changeReason: r.change_reason,
    acceptedByName: nameMap.get(r.created_by) || 'Unknown',
    acceptedAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  console.log(JSON.stringify(enriched, null, 2));
  process.exit(0);
}

// Human-readable: group by attributeId, then by family/category
const byAttrId = new Map();
for (const r of rows) {
  if (!byAttrId.has(r.attribute_id)) byAttrId.set(r.attribute_id, []);
  byAttrId.get(r.attribute_id).push(r);
}

console.log('═'.repeat(100));
console.log(`ATLAS DICTIONARY — GENERIC-CANONICAL AUDIT`);
console.log(`Total active overrides on audited attributeIds: ${rows.length}`);
console.log(`Distinct attributeIds with hits: ${byAttrId.size}`);
console.log('═'.repeat(100));

for (const [attrId, group] of byAttrId) {
  console.log('');
  console.log('─'.repeat(100));
  console.log(`attributeId: ${attrId}  (${group.length} override${group.length === 1 ? '' : 's'})`);
  console.log('─'.repeat(100));

  // Group by family within this attributeId
  const byFamily = new Map();
  for (const r of group) {
    if (!byFamily.has(r.family_id)) byFamily.set(r.family_id, []);
    byFamily.get(r.family_id).push(r);
  }

  for (const [fam, famRows] of byFamily) {
    console.log(`\n  family/category: ${fam}`);
    for (const r of famRows) {
      const date = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : 'unknown';
      const unitSuffix = r.unit ? ` (${r.unit})` : '';
      const author = nameMap.get(r.created_by) || 'Unknown';
      console.log(`    • ${r.param_name}  →  "${r.attribute_name}"${unitSuffix}`);
      console.log(`        accepted by ${author} on ${date}`);
      if (r.change_reason && r.change_reason.trim()) {
        const reason = r.change_reason.length > 80 ? r.change_reason.slice(0, 80) + '…' : r.change_reason;
        console.log(`        reason: ${reason}`);
      }
      console.log(`        override id: ${r.id}`);
    }
  }
}

console.log('');
console.log('═'.repeat(100));
console.log('NEXT STEPS');
console.log('═'.repeat(100));
console.log(`
For each row above, decide:
  1. KEEP — the generic attributeId is genuinely the right home (rare)
  2. RE-MAP — revert via Triage's Accepted/Revert flow, then accept under
              a more specific attributeId (e.g. style → mating_orientation,
              has_flange, compatible_series, etc.)

To revert from the UI:
  Open Atlas Dict Triage → switch the Status filter to "Accepted" → find the
  row by paramName/family → click Revert → re-accept with the specific ID.

To revert via SQL (faster for bulk):
  UPDATE atlas_dictionary_overrides SET is_active = false
  WHERE id IN ('<override-id-1>', '<override-id-2>', ...);
  -- Then in Triage, those rows reappear as Open and you re-accept fresh.
`);
