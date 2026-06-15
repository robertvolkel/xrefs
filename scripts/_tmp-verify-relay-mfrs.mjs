#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const c = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
  for (const l of c.split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i+1).trim();
  }
}
loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MFRS = ['HONGFA', 'APSEMI', 'STEIPU', 'AOTE', 'KTP'];
for (const mfr of MFRS) {
  let from = 0;
  let totalRows = 0;
  let totalKeys = 0;
  const sampleProducts = [];
  while (true) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('mpn, family_id, parameters')
      .eq('manufacturer', mfr)
      .eq('family_id', 'F2')
      .range(from, from + 999);
    if (error) { console.error(mfr, error.message); break; }
    if (!data || !data.length) break;
    for (const row of data) {
      const kc = Object.keys(row.parameters ?? {}).length;
      totalRows++; totalKeys += kc;
      if (sampleProducts.length < 2) sampleProducts.push({ mpn: row.mpn, keys: kc, sample: Object.keys(row.parameters ?? {}).slice(0, 10) });
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  if (totalRows === 0) {
    // try F1 instead
    const { data } = await supabase.from('atlas_products').select('mpn, family_id, parameters').eq('manufacturer', mfr).eq('family_id', 'F1').limit(3);
    if (data?.length) {
      const avgKeys = data.reduce((s, r) => s + Object.keys(r.parameters ?? {}).length, 0) / data.length;
      console.log(`${mfr.padEnd(15)} F1: ${data.length} samples, avg keys ${avgKeys.toFixed(1)}, sample keys: ${Object.keys(data[0].parameters ?? {}).slice(0, 10).join(', ')}`);
      continue;
    }
    console.log(`${mfr.padEnd(15)} no F1/F2 products found`);
    continue;
  }
  console.log(`${mfr.padEnd(15)} F2: ${totalRows} products, avg keys ${(totalKeys/totalRows).toFixed(1)}`);
  for (const s of sampleProducts) {
    console.log(`  sample ${s.mpn.padEnd(28)} keys=${s.keys}: ${s.sample.join(', ')}`);
  }
}
