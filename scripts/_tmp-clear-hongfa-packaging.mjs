#!/usr/bin/env node

/**
 * One-off: HONGFA's 13e97e01 batch report still lists 包装形式 in
 * unmappedParams. That was generated BEFORE 包装形式 was added to skipParams
 * in the code (Decision #235 follow-up). The Triage queue RPC sums
 * productCount from that JSONB so the 18,252-row 包装形式 entry still
 * surfaces. Filter it out of the array directly.
 */
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

const BATCH_ID = '13e97e01-d400-4ed8-9ae6-5193a89eddf3';

const { data: current, error: readErr } = await supabase
  .from('atlas_ingest_batches')
  .select('report, manufacturer')
  .eq('batch_id', BATCH_ID)
  .single();

if (readErr || !current) {
  console.error('Read failed:', readErr?.message);
  process.exit(1);
}

const before = current.report?.unmappedParams ?? [];
const after = before.filter((p) => p.paramName !== '包装形式');
console.log(`HONGFA batch ${BATCH_ID.slice(0, 8)}: unmappedParams ${before.length} → ${after.length}`);

const { error: writeErr } = await supabase
  .from('atlas_ingest_batches')
  .update({ report: { ...current.report, unmappedParams: after } })
  .eq('batch_id', BATCH_ID);

if (writeErr) { console.error('Write failed:', writeErr.message); process.exit(1); }
console.log('✓ Updated.');

await supabase.from('admin_stats_cache').delete().in('key', ['triage-queue', 'manufacturers-list']);
console.log('Cache invalidated.');
