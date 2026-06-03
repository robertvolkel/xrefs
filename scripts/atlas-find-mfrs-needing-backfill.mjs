#!/usr/bin/env node

/**
 * Atlas — Find MFRs Needing Unit-Prefix Backfill
 *
 * After APPLY_UNIT_PREFIX_TO_NUMERIC flipped to true (Decision #216), every
 * Atlas product whose `parameters` JSONB has a `unit` field with an SI
 * prefix character (k/K/M/m/µ/u/n/p/G/T) now stores numericValue raw —
 * which doesn't match the post-flip convention of base SI.
 *
 * This script identifies which MFRs have such products, ranked by total
 * affected count (highest impact first). Operator runs scoped backfill
 * per MFR via `npm run atlas:backfill -- --mfr <name>`.
 *
 * Read-only. Output is a prioritized punch list.
 *
 * Usage:
 *   node scripts/atlas-find-mfrs-needing-backfill.mjs           # full report
 *   node scripts/atlas-find-mfrs-needing-backfill.mjs --csv     # CSV output
 *   node scripts/atlas-find-mfrs-needing-backfill.mjs --top 20  # only top N MFRs
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
    const envPath = resolve(REPO_ROOT, '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
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
const asCsv = args.includes('--csv');
const topIdx = args.indexOf('--top');
const topN = topIdx !== -1 && args[topIdx + 1] ? parseInt(args[topIdx + 1], 10) : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Mirror of unitWouldApplyPrefix from atlas-audit-unit-mismatches.mjs.
function unitTriggersPrefix(unit) {
  if (!unit) return false;
  if (unit.startsWith('p')) return true;
  if (unit.startsWith('n') && !unit.startsWith('no')) return true;
  if (unit.startsWith('µ') || unit.startsWith('μ') || unit.startsWith('u')) return true;
  if (unit.startsWith('m') && !unit.startsWith('mm') && !unit.startsWith('M')) return true;
  if (unit.startsWith('k') || unit.startsWith('K')) return true;
  if (unit.startsWith('M') && !unit.startsWith('MSL')) return true;
  if (unit.startsWith('G')) return true;
  if (unit.startsWith('T')) return true;
  return false;
}

// Paginated fetch — Supabase caps single queries at 1000 rows.
async function fetchAllProducts() {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('manufacturer, parameters')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Page ${from}/${from + PAGE_SIZE - 1} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from % 10000 === 0) console.error(`  ...scanned ${from} rows`);
  }
  return all;
}

function isProductAffected(parameters) {
  if (!parameters || typeof parameters !== 'object') return false;
  for (const [, value] of Object.entries(parameters)) {
    if (value && typeof value === 'object' && unitTriggersPrefix(value.unit)) return true;
  }
  return false;
}

async function main() {
  console.error('Scanning atlas_products (this takes ~30-60s for ~115K rows)...');
  const products = await fetchAllProducts();
  console.error(`  Scanned ${products.length} products.`);
  console.error('');
  console.error('Aggregating per-MFR affected counts...');

  const byMfr = new Map();
  for (const p of products) {
    if (!p.manufacturer) continue;
    const affected = isProductAffected(p.parameters);
    if (!byMfr.has(p.manufacturer)) {
      byMfr.set(p.manufacturer, { affected: 0, total: 0 });
    }
    const cell = byMfr.get(p.manufacturer);
    cell.total++;
    if (affected) cell.affected++;
  }

  // Sort by affected desc, then total desc
  const sorted = [...byMfr.entries()]
    .filter(([, c]) => c.affected > 0)
    .sort((a, b) => b[1].affected - a[1].affected || b[1].total - a[1].total);

  const subset = topN ? sorted.slice(0, topN) : sorted;
  const totalAffected = sorted.reduce((acc, [, c]) => acc + c.affected, 0);

  if (asCsv) {
    console.log('rank,mfr,affected,total,pct');
    subset.forEach(([mfr, c], i) => {
      console.log(`${i + 1},"${mfr}",${c.affected},${c.total},${((c.affected / c.total) * 100).toFixed(1)}`);
    });
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(' Atlas — MFRs Needing Unit-Prefix Backfill');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Total MFRs needing backfill: ${sorted.length}`);
  console.log(`Total affected products:    ${totalAffected}`);
  console.log(`Total scanned:              ${products.length}`);
  console.log('');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(' Priority order (highest impact first)');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(' rank  mfr                              affected / total   pct   cmd');
  console.log('─────────────────────────────────────────────────────────────────────');
  subset.forEach(([mfr, c], i) => {
    const pct = ((c.affected / c.total) * 100).toFixed(1).padStart(5);
    const aff = String(c.affected).padStart(6);
    const tot = String(c.total).padStart(6);
    const mfrPad = mfr.length > 32 ? mfr.slice(0, 29) + '...' : mfr.padEnd(32);
    const cmd = `--mfr "${mfr}"`;
    console.log(` ${String(i + 1).padStart(4)}  ${mfrPad}  ${aff} / ${tot}  ${pct}%  ${cmd}`);
  });
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(' RECOMMENDED EXECUTION');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Run backfills SEQUENTIALLY in batches of 3-4 MFRs:');
  console.log('  npm run atlas:backfill -- --mfr <name>');
  console.log('');
  console.log('  Per-MFR scoped backfill is ~30 seconds. Supabase rate-limits after');
  console.log('  3-4 FULL scans per session, but scoped per-MFR runs are cheap.');
  console.log('');
  console.log('  Verify a few:');
  console.log('  npm run atlas:backfill:dry -- --mfr <name> --verbose');
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
