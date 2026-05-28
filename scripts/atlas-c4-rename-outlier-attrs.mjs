#!/usr/bin/env node
/**
 * One-off backfill: rename C4 atlas_products outlier attributeIds to logic-table canonicals.
 *
 *   vos             → input_offset_voltage
 *   ibias           → input_bias_current
 *   supply_current  → iq
 *
 * Why: pre-rename, atlasMapper.ts C4 dict used `vos`/`ibias`/`supply_current` while the
 * matching engine, context questions, Digikey/parts.io/gaia all use the logic-table IDs.
 * Atlas C4 products scored as "missing data" against the offset/bias/iq rules. The dict
 * rename in atlasMapper.ts + atlas-ingest.mjs fixes new ingests; this script aligns the
 * ~618 products already in the DB.
 *
 * Conflict policy (for the ~14 products with BOTH outlier and logic-table-ID present):
 *   keep the EXISTING logic-table-ID value, drop the outlier. Backed by sample analysis
 *   showing values numerically agree in 12/14 cases; 2 vos disagreements are Max-vs-Typ
 *   semantic differences that are arguably ambiguous in the source data either way.
 *
 * Provenance: preserves source/ingested_at metadata on the renamed key.
 *
 * Idempotent: safe to re-run; products already migrated are a no-op.
 *
 * Usage:
 *   node --env-file=.env.local scripts/atlas-c4-rename-outlier-attrs.mjs          # dry-run
 *   node --env-file=.env.local scripts/atlas-c4-rename-outlier-attrs.mjs --apply  # write
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}
const sb = createClient(URL, KEY);

const APPLY = process.argv.includes('--apply');
const RENAMES = [
  ['vos', 'input_offset_voltage'],
  ['ibias', 'input_bias_current'],
  ['supply_current', 'iq'],
];

async function fetchCandidates() {
  // Pull every C4 product carrying at least one outlier key, paginated.
  const out = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('atlas_products')
      .select('id, mpn, manufacturer, parameters')
      .eq('family_id', 'C4')
      .or('parameters.cs.{"vos":{}},parameters.cs.{"ibias":{}},parameters.cs.{"supply_current":{}}')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('fetch: ' + error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

function planRename(parameters) {
  const next = { ...parameters };
  const changes = [];
  let conflicts = 0;
  for (const [from, to] of RENAMES) {
    if (!(from in next)) continue;
    const fromEntry = next[from];
    if (to in next) {
      // Conflict — keep existing logic-table-ID value, drop outlier.
      changes.push({ from, to, kind: 'conflict_drop_outlier', fromValue: fromEntry?.value, toValue: next[to]?.value });
      delete next[from];
      conflicts++;
    } else {
      // Clean rename.
      next[to] = fromEntry;
      delete next[from];
      changes.push({ from, to, kind: 'rename', value: fromEntry?.value });
    }
  }
  return { next, changes, conflicts };
}

async function main() {
  console.log('=== atlas-c4-rename-outlier-attrs ' + (APPLY ? '(APPLY mode)' : '(DRY-RUN)') + ' ===\n');
  const candidates = await fetchCandidates();
  console.log('Candidates fetched: ' + candidates.length + ' C4 products carrying ≥1 outlier key\n');

  let renamed = 0;
  let conflicted = 0;
  let touched = 0;
  const renameCounts = {};
  const conflictExamples = [];

  for (const row of candidates) {
    const { next, changes, conflicts } = planRename(row.parameters || {});
    if (!changes.length) continue; // no-op
    touched++;
    for (const c of changes) {
      const k = c.from + '→' + c.to + '(' + c.kind + ')';
      renameCounts[k] = (renameCounts[k] || 0) + 1;
      if (c.kind === 'rename') renamed++;
      else conflicted++;
      if (c.kind === 'conflict_drop_outlier' && conflictExamples.length < 10) {
        conflictExamples.push(row.manufacturer + '/' + row.mpn + ' ' + c.from + '=' + JSON.stringify(c.fromValue) + ' (dropped) | ' + c.to + '=' + JSON.stringify(c.toValue) + ' (kept)');
      }
    }
    if (APPLY) {
      const { error } = await sb.from('atlas_products').update({ parameters: next }).eq('id', row.id);
      if (error) {
        console.error('UPDATE failed for ' + row.id + ': ' + error.message);
        process.exit(1);
      }
    }
  }

  console.log('Plan summary:');
  for (const [k, v] of Object.entries(renameCounts).sort()) console.log('  ' + k + ': ' + v);
  console.log('\nTotal products touched: ' + touched);
  console.log('  Clean renames: ' + renamed);
  console.log('  Conflict (kept logic-table-ID, dropped outlier): ' + conflicted);

  if (conflictExamples.length) {
    console.log('\nConflict examples (sampled):');
    for (const e of conflictExamples) console.log('  ' + e);
  }

  if (!APPLY) {
    console.log('\n(dry-run — no writes performed; re-run with --apply to commit)');
  } else {
    console.log('\n✓ Applied');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
