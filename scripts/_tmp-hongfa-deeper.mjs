#!/usr/bin/env node

/**
 * Deeper diagnostic — (a) real aggregate count via paginated GROUP BY,
 * (b) random-offset sampling to verify parameters JSONB shape,
 * (c) scope check: which other relay MFRs are in the same boat.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(REPO_ROOT, '.env.local');
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
}

loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function fmt(n) { return new Intl.NumberFormat('en-US').format(n); }

async function paginatedHongfaFamilyCount() {
  // Paginate atlas_products for HONGFA (all name variants) in 1000-row
  // chunks and count by family_id. Avoids PostgREST's 1000-row default cap.
  const names = ['HONGFA', 'HONGFA 宏发', '宏发', 'Hongfa'];
  const counts = new Map();
  let totalRows = 0;
  let totalNullParams = 0;
  let totalSmallParams = 0; // <= 10 keys
  let totalLargeParams = 0; // >= 20 keys
  const paramKeyCountHist = new Map(); // bucket counts

  for (const name of names) {
    let from = 0;
    let pageNum = 0;
    while (true) {
      const { data, error } = await supabase
        .from('atlas_products')
        .select('family_id, parameters')
        .eq('manufacturer', name)
        .range(from, from + 999);
      if (error) {
        console.error(`[paginated] error for "${name}" page ${pageNum}:`, error.message);
        break;
      }
      if (!data || !data.length) break;
      for (const row of data) {
        const fid = row.family_id ?? 'null';
        counts.set(fid, (counts.get(fid) ?? 0) + 1);
        totalRows++;
        const keyCount = Object.keys(row.parameters ?? {}).length;
        if (keyCount === 0) totalNullParams++;
        else if (keyCount <= 10) totalSmallParams++;
        else if (keyCount >= 20) totalLargeParams++;
        const bucket = keyCount === 0 ? '0' : keyCount <= 5 ? '1-5' : keyCount <= 10 ? '6-10' : keyCount <= 20 ? '11-20' : keyCount <= 30 ? '21-30' : '31+';
        paramKeyCountHist.set(bucket, (paramKeyCountHist.get(bucket) ?? 0) + 1);
      }
      if (data.length < 1000) break;
      from += 1000;
      pageNum++;
      if (pageNum > 30) { console.warn(`[paginated] capped at 30 pages for "${name}"`); break; }
    }
  }
  return { counts, totalRows, totalNullParams, totalSmallParams, totalLargeParams, paramKeyCountHist };
}

async function fetchRandomHongfaSamples(n = 10) {
  // Random offset sampling — try a few offsets to avoid first-page bias.
  const samples = [];
  for (const offset of [3000, 8000, 12000, 17000]) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('mpn, family_id, category, parameters')
      .eq('manufacturer', 'HONGFA')
      .range(offset, offset + 2);
    if (error) {
      console.error(`[random] error at offset ${offset}:`, error.message);
      continue;
    }
    if (data) samples.push(...data.map(r => ({ offset, ...r })));
  }
  return samples;
}

async function fetchRelayManufacturers() {
  // Distinct MFRs whose source file is under c1=Relays — read from
  // atlas_source_file ILIKE %relay% won't work generically. Instead:
  // find all MFRs with category ILIKE '%relay%' OR subcategory ILIKE '%relay%'.
  // Paginate.
  const mfrs = new Map(); // mfr -> { count, sampleSubcategories: Set }
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('manufacturer, family_id, subcategory')
      .or('subcategory.ilike.%relay%,subcategory.ilike.%继电器%')
      .range(from, from + 999);
    if (error) { console.error(`[scope] error:`, error.message); break; }
    if (!data || !data.length) break;
    for (const row of data) {
      const mfr = row.manufacturer ?? '(null)';
      if (!mfrs.has(mfr)) mfrs.set(mfr, { count: 0, families: new Map(), subcategories: new Set() });
      const entry = mfrs.get(mfr);
      entry.count++;
      const fid = row.family_id ?? 'null';
      entry.families.set(fid, (entry.families.get(fid) ?? 0) + 1);
      if (entry.subcategories.size < 3) entry.subcategories.add(row.subcategory);
    }
    if (data.length < 1000) break;
    from += 1000;
    if (from > 50000) { console.warn('[scope] capped at 50K rows'); break; }
  }
  return mfrs;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  HONGFA Relay — Deeper Diagnostic');
  console.log('═══════════════════════════════════════════════════════════════');

  console.log('\n── (a) Paginated GROUP BY family_id for HONGFA ──');
  const agg = await paginatedHongfaFamilyCount();
  console.log(`  Total HONGFA rows: ${fmt(agg.totalRows)}`);
  console.log('  Family distribution:');
  for (const [fid, count] of [...agg.counts.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / agg.totalRows) * 100).toFixed(1);
    console.log(`    ${fid.padEnd(8)} ${String(count).padStart(7)}  ${pct.padStart(5)}%`);
  }
  console.log('\n  Parameters JSONB key-count distribution:');
  for (const bucket of ['0', '1-5', '6-10', '11-20', '21-30', '31+']) {
    const c = agg.paramKeyCountHist.get(bucket) ?? 0;
    const pct = ((c / agg.totalRows) * 100).toFixed(1);
    console.log(`    keys ${bucket.padEnd(6)} ${String(c).padStart(7)}  ${pct.padStart(5)}%`);
  }

  console.log('\n── (b) Random-offset HONGFA samples ──');
  const samples = await fetchRandomHongfaSamples();
  for (const s of samples) {
    const keys = Object.keys(s.parameters ?? {});
    console.log(`  offset=${String(s.offset).padStart(6)}  MPN=${(s.mpn ?? '').padEnd(28)}  family_id=${(s.family_id ?? 'null').padEnd(6)}  keys=${keys.length}`);
    if (keys.length > 0) console.log(`    keys: ${keys.slice(0, 15).join(', ')}${keys.length > 15 ? ', ...' : ''}`);
  }

  console.log('\n── (c) Scope check: all relay MFRs in DB ──');
  const mfrs = await fetchRelayManufacturers();
  const sortedMfrs = [...mfrs.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 25);
  console.log(`  Total relay MFRs detected: ${mfrs.size}`);
  console.log(`  Top 25 by relay product count:`);
  console.log(`    ${'Manufacturer'.padEnd(30)} ${'Count'.padStart(7)}  Family distribution`);
  for (const [mfr, info] of sortedMfrs) {
    const famDist = [...info.families.entries()].sort((a, b) => b[1] - a[1])
      .map(([f, c]) => `${f}=${c}`).join(', ');
    console.log(`    ${mfr.slice(0, 30).padEnd(30)} ${String(info.count).padStart(7)}  ${famDist}`);
  }

  let totalRelayProducts = 0;
  let totalRelayNull = 0;
  let totalRelayB5 = 0;
  for (const [, info] of mfrs) {
    totalRelayProducts += info.count;
    totalRelayNull += info.families.get('null') ?? 0;
    totalRelayB5 += info.families.get('B5') ?? 0;
  }
  console.log(`\n  GLOBAL relay-product totals (across all detected MFRs):`);
  console.log(`    Total:    ${fmt(totalRelayProducts)}`);
  console.log(`    family_id=null:  ${fmt(totalRelayNull)} (${((totalRelayNull/totalRelayProducts)*100).toFixed(1)}%)`);
  console.log(`    family_id=B5:    ${fmt(totalRelayB5)} (${((totalRelayB5/totalRelayProducts)*100).toFixed(1)}%)`);

  console.log('\n═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
