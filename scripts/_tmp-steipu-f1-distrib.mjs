#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const c = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
  for (const l of c.split('\n')) {
    const t = l.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i+1).trim();
  }
}
loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let from = 0;
const all = [];
while (true) {
  const { data, error } = await supabase
    .from('atlas_products')
    .select('mpn, family_id, category, subcategory, atlas_source_file')
    .eq('manufacturer', 'STEIPU')
    .range(from, from + 999);
  if (error) { console.error(error.message); break; }
  if (!data || !data.length) break;
  all.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`STEIPU total atlas_products rows: ${all.length}`);
const byFamily = new Map();
for (const r of all) {
  const fid = r.family_id ?? 'null';
  byFamily.set(fid, (byFamily.get(fid) ?? 0) + 1);
}
console.log('By family:', [...byFamily.entries()].map(([f, c]) => `${f}=${c}`).join(', '));

const bySub = new Map();
for (const r of all) {
  if (r.family_id !== 'F1') continue;
  const key = `${r.subcategory ?? '(no subcat)'}`;
  bySub.set(key, (bySub.get(key) ?? 0) + 1);
}
console.log('\nF1 STEIPU products by subcategory:');
for (const [s, c] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.toString().padStart(4)}  "${s}"`);
}

const bySrcFile = new Map();
for (const r of all) {
  if (r.family_id !== 'F1') continue;
  const key = r.atlas_source_file ?? '(no source)';
  bySrcFile.set(key, (bySrcFile.get(key) ?? 0) + 1);
}
console.log('\nF1 STEIPU by source file:');
for (const [s, c] of bySrcFile) console.log(`  ${c.toString().padStart(4)}  ${s}`);
