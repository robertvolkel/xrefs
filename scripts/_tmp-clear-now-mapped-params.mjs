#!/usr/bin/env node

/**
 * Clear today's dict additions from every applied batch's frozen
 * unmappedParams. Same root cause as the HONGFA 包装形式 case + the
 * superseded-batches cleanup: batch.report.unmappedParams was a snapshot
 * of the dict state at ingest time. Adding new dict entries doesn't
 * retroactively update those snapshots, so the Triage queue keeps
 * surfacing now-mapped paramNames.
 *
 * Lists every key added to F1/F2/metadata/skipParams in the Decision #235
 * follow-up commits. Idempotent (skips no-op batches).
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

const APPLY = process.argv.includes('--apply');

// Lowercased + normalized form (matching the lookup logic). Compared against
// each unmapped entry's paramName via the same .toLowerCase().trim().replace(/\s+/g, ' ').
const NOW_MAPPED = new Set([
  // F2 SSR English (APSEMI vendor convention)
  'circuit',
  'voltage - input',
  'output type',
  'operating temperature',
  'device package',
  'package / case',
  'supplier device package',
  'mounting type',
  // F2 PhotoMOS catalog (APSEMI)
  'fet type',
  'rds on (max) @ id, vgs',
  'vgs(th) (max) @ id',
  'vgs (max)',
  'power dissipation (max)',
  'current - continuous drain (id) @ 25°c',
  'drive voltage (max rds on, min rds on)',
  // F2 Chinese variants (STEIPU / AOTE / KTP)
  '隔离电压(vrms)',
  '触点形式',
  '最大切换电流',
  '连续负载电流',
  '导通时间(ton)',
  '截止时间(toff)',
  '导通电阻',
  '过零功能',
  '输入电压',
  '输入类型',
  '工作电压',
  // Metadata + skip
  'rohs code',
  'country of origin',
  // F1 cleanup from yesterday's earlier commit
  '包装形式',
]);

function normalize(s) {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function main() {
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from('atlas_ingest_batches')
      .select('batch_id, manufacturer, status, report')
      .in('status', ['applied', 'pending', 'discovery'])
      .range(from, from + 999);
    if (error) { console.error(error.message); return; }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`Scanned ${all.length} batches`);

  let candidates = 0;
  let entriesRemovedTotal = 0;
  const toUpdate = [];
  for (const b of all) {
    const ups = Array.isArray(b.report?.unmappedParams) ? b.report.unmappedParams : [];
    if (!ups.length) continue;
    const kept = ups.filter((e) => !NOW_MAPPED.has(normalize(e?.paramName)));
    if (kept.length === ups.length) continue; // no-op
    candidates++;
    entriesRemovedTotal += (ups.length - kept.length);
    toUpdate.push({ batch: b, kept });
  }

  console.log(`\n${candidates} batches need updating (${entriesRemovedTotal} entries to remove total):`);
  for (const u of toUpdate) {
    console.log(`  ${u.batch.batch_id.slice(0, 8)}  ${(u.batch.manufacturer ?? '').padEnd(14)} [${u.batch.status}]  ${u.batch.report.unmappedParams.length} → ${u.kept.length}`);
  }

  if (!APPLY) {
    console.log('\n[dry-run] No writes. Re-run with --apply.');
    return;
  }

  console.log(`\nApplying ${toUpdate.length} updates...`);
  let ok = 0;
  for (const u of toUpdate) {
    const newReport = { ...u.batch.report, unmappedParams: u.kept };
    const { error } = await supabase
      .from('atlas_ingest_batches')
      .update({ report: newReport })
      .eq('batch_id', u.batch.batch_id);
    if (error) {
      console.error(`  ${u.batch.batch_id.slice(0, 8)}: ${error.message}`);
      continue;
    }
    ok++;
  }
  console.log(`Done. ${ok} updated.`);
  await supabase.from('admin_stats_cache').delete().in('key', ['triage-queue', 'manufacturers-list']);
  console.log('Cache invalidated.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
