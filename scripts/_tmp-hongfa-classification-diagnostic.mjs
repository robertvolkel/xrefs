#!/usr/bin/env node

/**
 * One-off diagnostic for the relay-misclassification investigation.
 *
 * Goal: confirm what classifyAtlasCategory actually wrote for HONGFA's
 * 20,206 relay parts, and measure the global scope of the disease.
 *
 * Output sections:
 *   A. HONGFA atlas_products family_id distribution
 *   B. 5 sample HONGFA products (mpn, family_id, source_file, parameter keys)
 *   C. Global product counts by family_id where parameters carry "介质耐压"
 *      (dielectric withstanding voltage — unambiguous relay spec)
 *   D. Global product counts by family_id where parameters carry "线圈电压类型"
 *      (coil voltage type — unambiguous relay spec, even narrower)
 *   E. Top 10 manufacturers carrying 介质耐压 broken down by family_id
 *
 * Read-only. Run: node scripts/_tmp-hongfa-classification-diagnostic.mjs
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
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
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
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HONGFA_NAMES = [
  'HONGFA',
  'HONGFA 宏发',
  '宏发',
  'Hongfa',
  'hongfa',
];

const RELAY_PARAM_TERMS = ['介质耐压', '线圈电压类型', '线圈工作电压', '触点形式', '触点数'];

function fmt(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

async function fetchHongfaFamilyDistribution() {
  // Use IN-filter against the candidate names. The atlas_products.manufacturer
  // column stores whatever cleanManufacturerName() emitted at ingest, so we
  // probe a few variants.
  const counts = new Map(); // family_id -> count
  let totalScanned = 0;

  for (const name of HONGFA_NAMES) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('family_id', { count: 'exact', head: false })
      .eq('manufacturer', name)
      .limit(50000);
    if (error) {
      console.error(`[fetchHongfaFamilyDistribution] error for "${name}":`, error.message);
      continue;
    }
    if (!data) continue;
    for (const r of data) {
      const key = r.family_id ?? 'null';
      counts.set(key, (counts.get(key) ?? 0) + 1);
      totalScanned++;
    }
  }
  return { counts, totalScanned };
}

async function fetchHongfaSamples(limit = 5) {
  const out = [];
  for (const name of HONGFA_NAMES) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('mpn, family_id, category, subcategory, atlas_source_file, parameters')
      .eq('manufacturer', name)
      .limit(limit);
    if (error) {
      console.error(`[fetchHongfaSamples] error for "${name}":`, error.message);
      continue;
    }
    if (data && data.length) {
      out.push({ nameProbe: name, rows: data });
      if (out.length >= 1) break; // first probe with hits is enough
    }
  }
  return out;
}

async function fetchProductCountsByFamilyForJsonbKey(jsonbKey) {
  // atlas_products.parameters is JSONB { mappedKey: { value, numericValue?, unit?, ... } }
  // We want to find products where ANY param's RAW NAME equals jsonbKey.
  // After ingest mapping, the raw paramName is stored under each mapping's
  // mapped attribute key — NOT the raw Chinese string. So we can't use ?
  // operator directly. Instead, we do a textual JSONB-cast ILIKE — slow but
  // correct, and bounded by 5K-row sampling.
  //
  // For the actual KEY to grep, ingest stores raw paramName in the
  // value object's `_raw` field (per provenance JSONB shape). We check
  // both: the JSONB ? on a sanitized stem AND a parameters::text ILIKE.

  // SECURITY DEFINER RPC would be ideal here, but we don't have one — and
  // the dataset is too big for client-side full scan. We do a representative
  // scan over a known-affected MFR set instead.
  //
  // ALTERNATIVE: use the triage queue cache which has the rollup already.
  // But to confirm where products SIT (not where paramName APPEARS in the
  // queue), we need the products themselves.
  //
  // Strategy: probe with parameters::text ILIKE %jsonbKey% over the first
  // 1000 rows per known affected MFR. Approximate — flags scope, doesn't
  // measure exactly.

  console.log(`\n  [scope probe for "${jsonbKey}"] — using parameters::text ILIKE`);
  const { data, error } = await supabase
    .from('atlas_products')
    .select('manufacturer, family_id')
    .filter('parameters_text_ignored', 'is', null) // no-op; column doesn't exist, this is just safety
    .limit(0);
  void data; void error;

  // Falling back to a direct rpc-like SQL query via .rpc would need a
  // server-side helper. For this diagnostic, we'll measure via the
  // triage queue cache approach below.
  return null;
}

async function fetchTriageQueueScope(rawParamName) {
  // The triage queue's aggregate already counts products carrying each raw
  // paramName and rolls up the dominantFamily across them. We hit the
  // RPC the route uses.
  const { data, error } = await supabase.rpc('get_triage_unmapped_aggregate');
  if (error) {
    console.error(`[fetchTriageQueueScope] RPC error:`, error.message);
    return null;
  }
  if (!data) return null;
  const rows = Array.isArray(data) ? data : (data.rows ?? []);
  const match = rows.find((r) => {
    const pn = r.param_name ?? r.paramName ?? '';
    return pn === rawParamName;
  });
  return match ?? null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  HONGFA Relay Classification Diagnostic');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('── A. HONGFA atlas_products by family_id ──');
  const dist = await fetchHongfaFamilyDistribution();
  console.log(`  Total products scanned (across all name variants): ${fmt(dist.totalScanned)}`);
  const sorted = [...dist.counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    console.log('  (no rows found — name variant mismatch?)');
  } else {
    for (const [fid, count] of sorted) {
      const pct = ((count / dist.totalScanned) * 100).toFixed(1);
      console.log(`    ${fid.padEnd(8)} ${String(count).padStart(7)}  ${pct.padStart(5)}%`);
    }
  }

  console.log('\n── B. 5 sample HONGFA products ──');
  const samples = await fetchHongfaSamples(5);
  if (!samples.length) {
    console.log('  (no samples found)');
  } else {
    for (const probe of samples) {
      console.log(`  Matched on manufacturer="${probe.nameProbe}":\n`);
      for (const row of probe.rows) {
        const paramKeys = Object.keys(row.parameters ?? {}).slice(0, 12);
        console.log(`    MPN:        ${row.mpn}`);
        console.log(`    family_id:  ${row.family_id ?? 'null'}`);
        console.log(`    category:   ${row.category ?? 'null'}/${row.subcategory ?? 'null'}`);
        console.log(`    source:     ${row.atlas_source_file ?? 'null'}`);
        console.log(`    param keys: ${paramKeys.join(', ')}${Object.keys(row.parameters ?? {}).length > 12 ? ', ...' : ''}`);
        console.log('');
      }
    }
  }

  console.log('── C/D. Triage queue scope for unambiguous relay params ──');
  for (const term of ['介质耐压', '线圈电压类型', '触点数']) {
    const tq = await fetchTriageQueueScope(term);
    if (!tq) {
      console.log(`  "${term}": not found in triage aggregate`);
      continue;
    }
    const dominantFamily = tq.dominant_family ?? tq.dominantFamily ?? null;
    const productCount = tq.product_count ?? tq.productCount ?? null;
    const mfrCount = tq.mfr_count ?? tq.mfrCount ?? null;
    const familyCounts = tq.family_counts ?? tq.familyCounts ?? null;
    console.log(`  "${term}":`);
    console.log(`    dominantFamily: ${dominantFamily}`);
    console.log(`    productCount:   ${fmt(productCount ?? 0)}`);
    console.log(`    mfrCount:       ${mfrCount}`);
    if (familyCounts) {
      const entries = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);
      console.log(`    familyCounts:   ${entries.map(([f, c]) => `${f}=${fmt(c)}`).join(', ')}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Done.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
