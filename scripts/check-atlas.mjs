import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env
const envPath = resolve(process.cwd(), '.env.local');
const content = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

// Use service role key (bypasses RLS)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Check what's in the table
const { data: count } = await supabase.from('atlas_products').select('id', { count: 'exact', head: true });
console.log('Total rows:', count);

// Check C6 products
const { data: c6, error: c6err } = await supabase
  .from('atlas_products')
  .select('mpn, manufacturer, family_id, category')
  .eq('family_id', 'C6')
  .limit(5);

console.log('\nC6 Voltage Refs (first 5):');
if (c6err) console.log('Error:', c6err.message);
else c6?.forEach(r => console.log(`  ${r.mpn} | ${r.manufacturer} | ${r.family_id}`));

// Try searching like the app does
const { data: search, error: serr } = await supabase
  .from('atlas_products')
  .select('mpn, manufacturer, category')
  .or('mpn.ilike.%GD25REF%,manufacturer.ilike.%GD25REF%')
  .limit(5);

console.log('\nSearch "GD25REF":');
if (serr) console.log('Error:', serr.message);
else if (!search?.length) console.log('  No results');
else search.forEach(r => console.log(`  ${r.mpn} | ${r.manufacturer}`));

// Try searching by manufacturer
const { data: mfr, error: merr } = await supabase
  .from('atlas_products')
  .select('mpn, manufacturer, category')
  .ilike('manufacturer', '%GIGADEVICE%')
  .limit(5);

console.log('\nSearch manufacturer "GIGADEVICE":');
if (merr) console.log('Error:', merr.message);
else if (!mfr?.length) console.log('  No results');
else mfr.forEach(r => console.log(`  ${r.mpn} | ${r.manufacturer}`));

// Now try with anon key (what the app uses)
const supabaseAnon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: anonSearch, error: anonErr } = await supabaseAnon
  .from('atlas_products')
  .select('mpn, manufacturer')
  .ilike('manufacturer', '%GIGADEVICE%')
  .limit(5);

console.log('\nAnon key search "GIGADEVICE":');
if (anonErr) console.log('Error:', anonErr.message);
else if (!anonSearch?.length) console.log('  No results (RLS blocking?)');
else anonSearch.forEach(r => console.log(`  ${r.mpn} | ${r.manufacturer}`));
