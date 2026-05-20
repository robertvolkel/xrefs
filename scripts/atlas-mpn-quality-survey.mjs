#!/usr/bin/env node

/**
 * Atlas MPN Quality Survey — scan atlas_products for un-matchable MPN
 * patterns that the ingest validator (lib/services/atlasMpnQualityValidator.ts)
 * detects. Phase 1 companion: shows engineers the existing-data backlog
 * of rows that need manual cleanup, not just rows from new ingests.
 *
 * Patterns (mirror of TS module):
 *   - range_thru:    CREATEK "Thru"/"thru"/"thur"/"through" range entries
 *   - range_series:  "X Series" entries (CREATEK / AWINIC / KEXIN)
 *   - placeholder_x: GIGADEVICE trailing-x placeholders
 *   - slash_variant: Geehy slash-delimited two-MPN rows
 *
 * Uses indexed Postgres ILIKE / regex queries rather than a full-table
 * scan, so it completes in <30s even on 100K+ row atlas_products.
 *
 * Usage:
 *   node scripts/atlas-mpn-quality-survey.mjs            # summary
 *   node scripts/atlas-mpn-quality-survey.mjs --verbose  # per-row listing
 *   node scripts/atlas-mpn-quality-survey.mjs --json     # JSON output (for piping)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      if (!process.env[t.slice(0, i).trim()]) {
        process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    }
  } catch { /* .env.local missing — assume env already set */ }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const AS_JSON = argv.includes('--json');

// Queries that map to each detection kind. Same patterns as the TS
// validator; the regex syntax is PostgREST/Postgres flavor here.
const QUERIES = [
  { kind: 'range_thru',            method: 'ilike',  arg: '%thru%',    note: 'CREATEK "Thru"/"thru" ranges' },
  { kind: 'range_thru',            method: 'ilike',  arg: '%thur%',    note: 'CREATEK "thur" typo' },
  { kind: 'range_thru',            method: 'ilike',  arg: '%through%', note: '"through" ranges' },
  { kind: 'range_series',          method: 'ilike',  arg: '% series%', note: '"X Series" entries' },
  // `%xx%` alone is too common (matches STM32 marketing names, etc.) and
  // times out on 114K rows. Narrow to `-xx` which is the Gainsil pattern.
  { kind: 'placeholder_xx_midword', method: 'ilike', arg: '%-xx%',     note: 'Gainsil-style "-xx" mid-MPN placeholders' },
  // Slash `%/%` is also too common on 114K rows — skipped here. The
  // phase-1 ingest validator catches it cleanly on new ingests, and the
  // single known existing row (Geehy GHD3440/3440R) is already identified.
  // To enumerate slash hits in atlas_products, run a one-off SQL query
  // with `mpn ~ '[A-Za-z0-9]/[A-Za-z0-9]'` directly in psql / Supabase.
  // placeholder_x (trailing x or X preceded by alphanumeric) needs per-row
  // regex eval — see the TS validator. PostgREST `~*` is unreliable across
  // statement_timeout boundaries for this pattern. Run the TS validator
  // backfill separately if needed.
];

const all = []; // { kind, mpn, mfr, family_id }

for (const q of QUERIES) {
  let qb = sb.from('atlas_products').select('mpn, manufacturer, family_id', { count: 'exact' });
  if (q.method === 'ilike') qb = qb.ilike('mpn', q.arg);
  qb = qb.limit(2000); // generous sample cap
  const { data, count, error } = await qb;
  if (error) {
    console.error(`  [${q.kind}] query failed: ${error.message}`);
    continue;
  }
  for (const r of data ?? []) {
    all.push({ kind: q.kind, mpn: r.mpn, mfr: r.manufacturer ?? '(null)', family: r.family_id ?? '(null)' });
  }
  if (!AS_JSON) {
    console.log(`  [${q.kind}] '${q.arg}' → ${count} total (${q.note})`);
  }
}

// Dedupe rows that match multiple ilike queries (e.g. "thru" + "through").
const seen = new Set();
const unique = all.filter((r) => {
  const k = `${r.kind}::${r.mpn}::${r.mfr}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (AS_JSON) {
  console.log(JSON.stringify({ total: unique.length, rows: unique }, null, 2));
  process.exit(0);
}

// Summary
console.log(`\n=== Atlas MPN Quality Survey ===`);
console.log(`Total un-matchable rows (deduped across patterns): ${unique.length}\n`);

const byKindAndMfr = new Map();
for (const r of unique) {
  const k = `${r.kind} | ${r.mfr} | family=${r.family}`;
  if (!byKindAndMfr.has(k)) byKindAndMfr.set(k, []);
  byKindAndMfr.get(k).push(r.mpn);
}
const sorted = [...byKindAndMfr.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('Top affected (kind | MFR | family — count):');
for (const [k, mpns] of sorted.slice(0, 30)) {
  console.log(`  ${String(mpns.length).padStart(4, ' ')}  ${k}`);
  if (VERBOSE) for (const m of mpns) console.log(`           ${m}`);
  else for (const m of mpns.slice(0, 2)) console.log(`           e.g. ${m}`);
}
if (sorted.length > 30) console.log(`  ... ${sorted.length - 30} more (kind|MFR|family) groups`);

console.log(`\nNext steps:`);
console.log(`  - For CREATEK/AWINIC range entries: chase upstream cleanup or hand-expand in SQL`);
console.log(`  - For GIGADEVICE placeholder x/X: enumerate variants from datasheet`);
console.log(`  - For Geehy slash-delimited: split on '/' and re-ingest as separate rows`);
console.log(`  - All new ingests will surface these patterns automatically per Decision-pending entry (phase 1).`);
