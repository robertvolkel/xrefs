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

const { data } = await supabase.rpc('get_triage_unmapped_aggregate');
const rows = Array.isArray(data) ? data : (data?.rows ?? []);

// Filter where dominantFamily includes E1 OR familyCounts has E1
const e1Rows = rows.filter(r => {
  const df = r.dominant_family ?? r.dominantFamily;
  const fc = r.family_counts ?? r.familyCounts ?? {};
  return df === 'E1' || (fc.E1 ?? 0) > 0;
});

console.log(`Total Triage unique paramNames: ${rows.length}`);
console.log(`Touching E1: ${e1Rows.length}`);

e1Rows.sort((a, b) => {
  const fcA = a.family_counts ?? a.familyCounts ?? {};
  const fcB = b.family_counts ?? b.familyCounts ?? {};
  return (fcB.E1 ?? 0) - (fcA.E1 ?? 0);
});

console.log('\nTop 40 E1-touching unmapped paramNames (by E1 productCount):');
console.log(`${'paramName'.padEnd(45)} ${'E1 ct'.padStart(7)} ${'total'.padStart(7)}  affected MFRs (top 3)`);
for (const r of e1Rows.slice(0, 40)) {
  const pname = r.param_name ?? r.paramName;
  const fc = r.family_counts ?? r.familyCounts ?? {};
  const pc = r.product_count ?? r.productCount;
  const mfrs = r.affected_mfrs ?? r.affectedMfrs ?? [];
  const mfrNames = mfrs.slice(0, 3).map(m => m.name).join(', ');
  const samples = (r.sample_values ?? r.sampleValues ?? []).slice(0, 3).join(' | ');
  console.log(`${(pname ?? '').slice(0, 45).padEnd(45)} ${String(fc.E1 ?? 0).padStart(7)} ${String(pc).padStart(7)}  ${mfrNames}${mfrs.length > 3 ? '…' : ''}`);
  if (samples) console.log(`  samples: ${samples.slice(0, 100)}`);
}
