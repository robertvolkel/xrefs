#!/usr/bin/env node

/**
 * Clear `report.unmappedParams` on superseded applied batches.
 *
 * After a re-ingest, the previous applied batch for the same source_file
 * holds a frozen, now-stale `unmappedParams` JSONB array that the Triage
 * queue RPC (get_triage_unmapped_aggregate) keeps reading and summing into
 * its productCount aggregates — so paramNames that the new batch
 * successfully mapped still surface as unmapped from the old batch's
 * historical record.
 *
 * This script identifies applied batches that have a NEWER applied batch
 * for the same source_file (definitively superseded) and zeroes out their
 * unmappedParams field. The batch row, snapshots, diff history, and
 * classification stats are all preserved — only the queue-contribution
 * field is cleared.
 *
 * Usage:
 *   node scripts/_tmp-clear-superseded-unmapped.mjs              # dry run
 *   node scripts/_tmp-clear-superseded-unmapped.mjs --apply      # commit
 */

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
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes('--apply');

async function main() {
  // Pull all applied batches, group by source_file, identify the latest
  // per source_file. Any non-latest applied batch in a multi-batch group
  // is superseded — its unmappedParams contribution is stale.
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from('atlas_ingest_batches')
      .select('batch_id, manufacturer, source_file, status, created_at, report')
      .eq('status', 'applied')
      .range(from, from + 999);
    if (error) {
      console.error('Fetch error:', error.message);
      return;
    }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`Scanned ${all.length} applied batches`);

  // Group by source_file
  const bySource = new Map();
  for (const b of all) {
    const key = b.source_file ?? '(null-source)';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(b);
  }

  // Identify superseded
  const superseded = [];
  for (const [src, batches] of bySource) {
    if (batches.length <= 1) continue;
    batches.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const latest = batches[0];
    const older = batches.slice(1);
    for (const b of older) {
      const unmappedCount = Array.isArray(b.report?.unmappedParams)
        ? b.report.unmappedParams.length
        : 0;
      // Only target batches whose unmappedParams is non-empty (others are
      // no-op).
      if (unmappedCount === 0) continue;
      superseded.push({
        batch_id: b.batch_id,
        manufacturer: b.manufacturer,
        source_file: src,
        created_at: b.created_at,
        unmapped_count: unmappedCount,
        latest_batch: latest.batch_id,
        latest_created: latest.created_at,
      });
    }
  }

  console.log(`\nFound ${superseded.length} superseded applied batches with non-empty unmappedParams:`);
  console.log('');
  console.log('MFR'.padEnd(15), 'unmapped'.padStart(8), 'created'.padEnd(22), 'batch_id', '→ latest');
  for (const s of superseded) {
    console.log(
      (s.manufacturer ?? '').slice(0, 14).padEnd(15),
      String(s.unmapped_count).padStart(8),
      s.created_at.slice(0, 19).padEnd(22),
      s.batch_id.slice(0, 8),
      '→',
      s.latest_batch.slice(0, 8),
    );
  }

  if (!APPLY) {
    console.log(`\n[dry-run] No writes. Re-run with --apply to clear ${superseded.length} batches.`);
    return;
  }

  // Apply: update each row to set report.unmappedParams = []
  console.log(`\nApplying ${superseded.length} updates...`);
  let okCount = 0;
  let errCount = 0;
  for (const s of superseded) {
    // Fetch the current report so we preserve other fields, then write back
    // with unmappedParams emptied. (Could be done in a single update with
    // jsonb_set but Supabase JS client doesn't expose that directly without
    // RPC; per-row read+write is fine for ~10 rows.)
    const { data: current, error: readErr } = await supabase
      .from('atlas_ingest_batches')
      .select('report')
      .eq('batch_id', s.batch_id)
      .single();
    if (readErr) {
      console.error(`  ${s.batch_id.slice(0, 8)}: read error: ${readErr.message}`);
      errCount++;
      continue;
    }
    const newReport = { ...(current?.report ?? {}), unmappedParams: [] };
    const { error: writeErr } = await supabase
      .from('atlas_ingest_batches')
      .update({ report: newReport })
      .eq('batch_id', s.batch_id);
    if (writeErr) {
      console.error(`  ${s.batch_id.slice(0, 8)}: write error: ${writeErr.message}`);
      errCount++;
      continue;
    }
    okCount++;
    console.log(`  ✓ ${s.batch_id.slice(0, 8)}  ${s.manufacturer}`);
  }

  console.log(`\nDone. ${okCount} cleared, ${errCount} errors.`);

  // Invalidate L2 triage-queue cache so next read recomputes
  await supabase.from('admin_stats_cache').delete().in('key', ['triage-queue', 'manufacturers-list']);
  console.log('Admin caches invalidated (triage-queue, manufacturers-list).');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
