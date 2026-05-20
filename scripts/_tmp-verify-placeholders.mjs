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

// Strip placeholder runs (xxx, xx, x at end or middle) to obtain a real ILIKE prefix.
function stripPlaceholders(t) {
  // Strip trailing-x runs
  let s = t.replace(/-?[xX]+$/g, '');
  // Strip mid-x runs by replacing with empty (might overshoot but good for "broad" prefix match)
  s = s.split(/[xX]{2,}/)[0];
  s = s.replace(/-$/, '');
  return s;
}

const suspect = {
  '52': ['L1502FT'],
  'B1': ['1N4001-1N4007','10A1-10A10','10SQ0xx','1KFxxxx','6Dxxxxx'],
  'B3': ['P1SMB59xx'],
  'B4': ['P600'],
  'B5': ['P14xx'],
  'B6': ['BC8xx','ULN2xxx'],
  'B7': ['2KA-series'],
  'C1': ['MD5xxx','SK6011D4-xx','HT71xx','TPL5xxxx','HNLPDxxxx','DIA7xxx','JLRxxx','LP39xx','LP398x'],
  'C2': ['B05xx','D12Sxxxx','D12xxxx','BL80xxCBx','TPPxxxxx','MD3156x','LN100xx','HLK-10Dxxxx','B05xxS','AW36xxx','GD30DCxxxx','RY3xxx','CSV3xxx'],
  'C3': ['CMTI'],
  'C5': ['BL15xx','CH44x'],
};
for (const [fam, list] of Object.entries(suspect)) {
  for (const t of list) {
    const p = stripPlaceholders(t.split('-')[0]);
    if (!p || p.length < 2) { console.log(`[${fam}] ${t} → empty after strip, skip`); continue; }
    const { count: cMpn } = await sb.from('atlas_products').select('*', { count: 'exact', head: true }).eq('family_id', fam).ilike('mpn', `${p}%`);
    const { count: cMfr } = await sb.from('atlas_products').select('*', { count: 'exact', head: true }).eq('family_id', fam).ilike('manufacturer', `%${p}%`);
    console.log(`[${fam}] ${t.padEnd(18)} prefix='${p}' mpn=${cMpn||0} mfr=${cMfr||0}`);
  }
}
