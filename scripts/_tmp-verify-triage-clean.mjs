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
    const i = t.indexOf('=');
    if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await supabase.rpc('get_triage_unmapped_aggregate');
const rows = Array.isArray(data) ? data : (data?.rows ?? []);
console.log(`Total unique unmapped paramNames in Triage queue: ${rows.length}`);

const relayTerms = ['介质耐压', '线圈电压类型', '线圈工作电压', '触点形式', '触点数', '机械耐久性(单位：次)', '电耐久性(单位：次)', '绝缘电阻(单位：MΩ)', '重量(单位：g)', '体积(单位：mm3)', '额定线圈功率', '引出端形式', '包装形式'];

console.log('\nRelay-related paramName check (should be GONE except 包装形式):');
for (const term of relayTerms) {
  const r = rows.find(x => (x.param_name ?? x.paramName) === term);
  if (r) {
    const pc = r.product_count ?? r.productCount;
    const fc = r.family_counts ?? r.familyCounts;
    console.log(`  ✗ STILL PRESENT: "${term}" productCount=${pc} familyCounts=${JSON.stringify(fc)}`);
  } else {
    console.log(`  ✓ cleared: "${term}"`);
  }
}

console.log('\nTop 15 paramNames by productCount (current Triage queue state):');
rows.sort((a, b) => (b.product_count ?? b.productCount ?? 0) - (a.product_count ?? a.productCount ?? 0));
for (const r of rows.slice(0, 15)) {
  const pname = r.param_name ?? r.paramName;
  const pc = r.product_count ?? r.productCount;
  const df = r.dominant_family ?? r.dominantFamily;
  const mfrs = r.affected_mfrs ?? r.affectedMfrs ?? [];
  const mfrNames = mfrs.slice(0, 3).map(m => m.name).join(', ');
  console.log(`  ${(pname ?? '').padEnd(40)} ${String(pc).padStart(7)}  fam=${(df ?? 'null').padEnd(6)}  mfrs: ${mfrNames}${mfrs.length > 3 ? '…' : ''}`);
}
