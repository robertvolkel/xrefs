#!/usr/bin/env node
// Triage impact diagnostic v2 — answers: "Did my Triage work from last night move coverage?"
// Read-only. Safe to re-run. Streams atlas_products to detect canonical attributeIds your accepts target.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
const env = readFileSync(envPath, 'utf-8');
const getEnv = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  return m ? m[1].replace(/^"(.*)"$/, '$1').trim() : null;
};

const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Missing env vars');

const supabase = createClient(url, key);
const SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const fmt = (n, w = 8) => String(n).padStart(w);

async function main() {
  // 1. Overrides from last 24h
  const { data: overrides, error: e1 } = await supabase
    .from('atlas_dictionary_overrides')
    .select('id, family_id, param_name, attribute_id, attribute_name, created_at, is_active')
    .gte('created_at', SINCE)
    .order('created_at', { ascending: false });
  if (e1) throw e1;

  const active = (overrides ?? []).filter(o => o.is_active);
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('YOUR LAST 24H ACCEPTS');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Active:   ${fmt(active.length, 5)}`);
  console.log(`Reverted: ${fmt((overrides?.length ?? 0) - active.length, 5)}`);

  const byScope = {};
  for (const o of active) byScope[o.family_id] = (byScope[o.family_id] || 0) + 1;
  console.log('\n--- BY SCOPE ---');
  for (const [scope, count] of Object.entries(byScope).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${scope.padEnd(30)} ${fmt(count, 4)}`);
  }

  const uniqAttrs = new Set(active.map(o => o.attribute_id));
  console.log(`\nUnique canonical attributeIds your accepts target: ${uniqAttrs.size}`);

  // 2. Stream-scan atlas_products to find MFRs that carry your canonical attributeIds
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('SCANNING atlas_products (this may take 1-3 min)');
  console.log('════════════════════════════════════════════════════════════════');

  const attrList = [...uniqAttrs];
  // mfr → { attrSet, productCount, productsWithMyAttrs }
  const mfrTouches = new Map();
  const BATCH = 1000;
  let offset = 0;
  let totalScanned = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('manufacturer, parameters')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Scan error:', error.message); break; }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const params = row.parameters;
      if (!params || typeof params !== 'object') continue;
      let touch = mfrTouches.get(row.manufacturer);
      if (!touch) {
        touch = { attrSet: new Set(), productCount: 0, productsWithMyAttrs: 0 };
        mfrTouches.set(row.manufacturer, touch);
      }
      touch.productCount++;
      let productHasAny = false;
      for (const attr of attrList) {
        if (Object.prototype.hasOwnProperty.call(params, attr)) {
          touch.attrSet.add(attr);
          productHasAny = true;
        }
      }
      if (productHasAny) touch.productsWithMyAttrs++;
    }
    totalScanned += data.length;
    if (totalScanned % 20000 === 0) process.stderr.write(`  ...scanned ${totalScanned}\r`);
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  process.stderr.write(`  ...scanned ${totalScanned}                              \n`);

  // 3. Fetch per-MFR coverage via existing admin RPC for join
  console.log('\n--- Fetching current per-MFR coverage stats ---');
  const { data: stats, error: e3 } = await supabase.rpc('get_manufacturer_product_stats');
  if (e3) console.log(`(RPC error: ${e3.message})`);
  const coverageByMfr = new Map();
  for (const row of stats ?? []) {
    coverageByMfr.set(row.manufacturer, {
      products: row.product_count ?? row.products ?? null,
      coverage: row.avg_coverage_pct ?? row.coverage ?? null,
    });
  }

  // 4. Print results
  const ranked = [...mfrTouches.entries()]
    .filter(([, t]) => t.attrSet.size > 0)
    .map(([mfr, t]) => ({
      mfr,
      yourAttrs: t.attrSet.size,
      productsWithMyAttrs: t.productsWithMyAttrs,
      productCount: t.productCount,
      coverage: coverageByMfr.get(mfr)?.coverage ?? null,
    }))
    .sort((a, b) => b.productsWithMyAttrs - a.productsWithMyAttrs)
    .slice(0, 30);

  console.log(`\nUnique MFRs carrying at least one of your canonical attributeIds: ${ranked.length === 30 ? '30+' : ranked.length}`);
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('TOP 30 MFRS BY # OF PRODUCTS YOUR ACCEPTS NOW TOUCH');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('MFR                              | YourAttrs | Hits/Total | Coverage');
  console.log('---------------------------------|-----------|------------|----------');
  for (const r of ranked) {
    const cov = r.coverage != null ? `${(r.coverage * 100).toFixed(1)}%` : '—';
    const ratio = `${r.productsWithMyAttrs}/${r.productCount}`;
    console.log(`${r.mfr.slice(0, 32).padEnd(33)}| ${fmt(r.yourAttrs, 9)} | ${ratio.padStart(10)} | ${cov.padStart(8)}`);
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('INTERPRETATION');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('YourAttrs    = # of your canonical attributeIds now visible on this MFR');
  console.log('Hits/Total   = how many of the MFR\'s products carry at least one of those attrs');
  console.log('Coverage     = current per-MFR coverage % (from admin RPC)');
  console.log('');
  console.log('• Hits/Total ratio > 30% AND coverage > 50% → strong win.');
  console.log('• Hits/Total > 30% but coverage low → translations applied but family');
  console.log('  scoring counts more attributes than you mapped — work matters, more to do.');
  console.log('• Empty list → translations didn\'t apply (backfill or override scope issue).');
}

main().catch(err => { console.error('\n[error]', err); process.exit(1); });
