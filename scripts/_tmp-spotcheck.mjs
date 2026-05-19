#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
function loadEnv() {
  const envPath = resolve('/Users/robvolkel/Developer/xrefs_app', '.env.local');
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadEnv();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const checks = [
  // family 71
  ['71', 'mfr', 'Microgate'], ['71', 'mfr', 'Wenshan'],
  ['71', 'prefix', 'MGCI'], ['71', 'prefix', 'CML'], ['71', 'prefix', 'SDQM'],
  ['71', 'prefix', 'MDA'], ['71', 'prefix', 'PBC'], ['71', 'prefix', 'WIP'],
  ['71', 'prefix', 'YNR'], ['71', 'prefix', 'YSPI'], ['71', 'prefix', 'SM'],
  ['71', 'prefix', 'YT'], ['71', 'prefix', 'YTA'], ['71', 'prefix', 'VE'],
  ['71', 'prefix', 'SDCL'], ['71', 'prefix', '0402H'],
];
for (const [fam, kind, val] of checks) {
  const col = kind === 'mfr' ? 'manufacturer' : 'mpn';
  const pat = kind === 'mfr' ? `%${val}%` : `${val}%`;
  const { count } = await sb.from('atlas_products').select('*', { count: 'exact', head: true })
    .eq('family_id', fam).ilike(col, pat);
  console.log(`${fam} ${kind} '${val}' → ${count} products`);
}
