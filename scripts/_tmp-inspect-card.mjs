#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const envPath = resolve('/Users/robvolkel/Developer/xrefs_app', '.env.local');
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      if (!process.env[t.slice(0, i).trim()]) {
        process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    }
  } catch {}
}
loadEnv();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const fam = process.argv[2] || '12';
const { data, error } = await sb.from('atlas_family_domain_cards')
  .select('family_id, status, card_text, updated_at, created_at')
  .eq('family_id', fam).eq('status', 'active').limit(1);
if (error) { console.error(error); process.exit(1); }
if (!data || data.length === 0) { console.log('NO ACTIVE CARD for', fam); process.exit(0); }
console.log('family:', data[0].family_id);
console.log('updated:', data[0].updated_at);
console.log('length:', data[0].card_text.length);
console.log('---');
console.log(data[0].card_text);
