#!/usr/bin/env node
// Spot-check suspicious unverified tokens that LOOK MFR-shaped from each family.
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

// Specifically: tokens that look like MPN families with digits, or ALLCAPS proper-noun shape with digits.
const SUSPECT = {
  '52': ['FNH','L1502FT'],
  'B1': ['1KFxxxx','10A1-10A10','10SQ0xx','1N4001-1N4007','6Dxxxxx','M1-M7','SMA-body','WS','WT','WL'],
  'B3': ['P1SMB59xx','MiniMELF','E24'],
  'B4': ['P600','DO-15'],
  'B5': ['P14xx','BVdss'],
  'B6': ['BC8xx','ULN2xxx','SOT-23'],
  'B7': ['BCP5x-16Q','PNMT-series','2KA-series'],
  'C1': ['HT75','HT77','HT78','RT9013','RT9193','LP2950','TLV70xx','LM78xx','LM79xx','XC6204','XC6206','XC6219','BL83xx','SGM2019'],
  'C2': ['SY8089','SY8113','SY8120','MP1584','MP2315','TPS5430','LM2596','LM2576','TPS54xxx','XL6019','XL6009','PT4115','BD9329','BD9G341'],
  'C3': ['UCC27xxx','MIC4452','MCP1402','TC4421','IR2110','IR2104','TLP250','ACPL-x','ADuM3xxx','TC44xx','HCPL3120'],
  'C5': ['74HC04','74LVC1G','74AHC','74HCT','SN74xxx','MM74Cxx','CD4xxx','BU4xxx','TC4011'],
};
for (const [fam, toks] of Object.entries(SUSPECT)) {
  for (const t of toks) {
    // try as prefix (strip non-prefix suffix like 'xx', '-xx', etc.)
    const cleaned = t.replace(/x+/gi, '').replace(/-.*$/, '').replace(/[^A-Za-z0-9]/g,'');
    if (cleaned.length < 2) continue;
    const { count: cMpn } = await sb.from('atlas_products').select('*', { count: 'exact', head: true }).eq('family_id', fam).ilike('mpn', `${cleaned}%`);
    const { count: cMfr } = await sb.from('atlas_products').select('*', { count: 'exact', head: true }).eq('family_id', fam).ilike('manufacturer', `%${cleaned}%`);
    console.log(`[${fam}] '${t}' (cleaned '${cleaned}'): mpn=${cMpn||0}, mfr=${cMfr||0}`);
  }
}
