#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function loadEnv() {
  const content = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    const k = t.slice(0, i).trim(), v = t.slice(i+1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: batches } = await supabase
  .from('atlas_ingest_batches')
  .select('batch_id, manufacturer, status, source_file, created_at')
  .or('manufacturer.ilike.%hongfa%,manufacturer.ilike.%apsemi%,manufacturer.ilike.%steipu%,manufacturer.ilike.%aote%,manufacturer.ilike.%everlight%,manufacturer.ilike.%ct micro%,manufacturer.ilike.%ktp%,manufacturer.ilike.%chipanalog%,manufacturer.ilike.%slkor%')
  .order('manufacturer', { ascending: true })
  .order('created_at', { ascending: false });

console.log('Batches for relay MFRs:');
console.log('MFR'.padEnd(15), 'Status'.padEnd(12), 'Created'.padEnd(22), 'Batch ID');
for (const b of batches ?? []) {
  console.log(
    (b.manufacturer ?? '').slice(0, 14).padEnd(15),
    (b.status ?? '').padEnd(12),
    (b.created_at ?? '').slice(0, 19).padEnd(22),
    b.batch_id,
  );
}

// Check the admin_stats_cache for triage queue
const { data: cacheRows } = await supabase
  .from('admin_stats_cache')
  .select('cache_key, updated_at')
  .in('cache_key', ['triage-queue', 'atlas-coverage', 'manufacturers-list']);
console.log('\nadmin_stats_cache state:');
for (const r of cacheRows ?? []) {
  console.log('  ', r.cache_key.padEnd(25), r.updated_at);
}
