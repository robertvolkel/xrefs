#!/usr/bin/env node

/**
 * Atlas: retroactive family reclassification by "Type" parameter signal.
 *
 * Background: classifyAtlasCategory() in atlasMapper.ts uses only the c3
 * string. Products whose c3 contains "rectifier" but not "tvs"/"zener" land
 * in B1 — even when their extracted "Type" parameter clearly identifies
 * them as B4 TVS Diodes (Bi/Uni/Bidirectional/Unidirectional) or B3 Zener
 * Diodes (Regulator). The same logic is now applied at ingest via
 * reclassifyByParameterSignals(); this script reclassifies the products
 * already in the DB.
 *
 * Mirrors reclassifyByParameterSignals from lib/services/atlasMapper.ts —
 * keep these in sync.
 *
 * Usage:
 *   node scripts/atlas-reclassify-by-type-param.mjs            # dry run
 *   node scripts/atlas-reclassify-by-type-param.mjs --apply    # commit changes
 *   node scripts/atlas-reclassify-by-type-param.mjs --verbose  # per-product details
 *
 * Idempotent — second run is a no-op because reclassified products no
 * longer have family_id='B1'.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load environment ─────────────────────────────────────

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local not found
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

// ─── Reclassification helper (mirrored from atlasMapper.ts) ──

/**
 * `parameters` here is the JSONB shape stored in atlas_products.parameters,
 * which is `Record<string, { value: string; ... }>` (see toParametersJsonb in
 * atlasMapper.ts). The helper in atlasMapper.ts works on the raw model
 * shape `Array<{name, value}>`; this version walks the JSONB record.
 */
function reclassifyByParameterSignals(initial, parametersJsonb) {
  if (initial.familyId !== 'B1') return initial;
  if (!parametersJsonb || typeof parametersJsonb !== 'object') return initial;

  // Find "type" / "类型" entry (case-insensitive on the key — the JSONB stores
  // keys via toParametersJsonb's normalization, but be defensive).
  let typeVal = '';
  for (const [key, entry] of Object.entries(parametersJsonb)) {
    const lkey = key.toLowerCase().trim();
    if (lkey === 'type' || lkey === '类型') {
      // Entry shape: { value: string, ... } from toParametersJsonb.
      const raw = typeof entry === 'string' ? entry : entry?.value ?? '';
      typeVal = String(raw).toLowerCase().trim();
      if (typeVal) break;
    }
  }
  if (!typeVal) return initial;

  if (/^(bi|uni|bidirectional|unidirectional)$/.test(typeVal)) {
    return { category: 'Diodes', subcategory: 'TVS Diode', familyId: 'B4' };
  }
  if (/^(regulator|voltage regulator)$/.test(typeVal)) {
    return { category: 'Diodes', subcategory: 'Zener Diode', familyId: 'B3' };
  }
  return initial;
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write to DB)' : 'DRY RUN (no writes)'}`);
  console.log('Scanning atlas_products WHERE family_id = B1 ...\n');

  const PAGE_SIZE = 1000;
  let from = 0;
  let totalScanned = 0;
  const moves = { B4: [], B3: [] };
  const valueCounts = {}; // typeVal → count

  while (true) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, parameters, category, subcategory, family_id')
      .eq('family_id', 'B1')
      .range(from, from + PAGE_SIZE - 1)
      .order('id', { ascending: true });

    if (error) {
      console.error('Supabase query error:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    totalScanned += data.length;
    for (const row of data) {
      const initial = { category: row.category, subcategory: row.subcategory, familyId: 'B1' };
      const next = reclassifyByParameterSignals(initial, row.parameters);
      if (next.familyId !== 'B1') {
        moves[next.familyId].push({ id: row.id, mpn: row.mpn, manufacturer: row.manufacturer, next });
        // Track which Type value drove the move
        for (const [key, entry] of Object.entries(row.parameters || {})) {
          if (key.toLowerCase().trim() === 'type' || key === '类型') {
            const v = (typeof entry === 'string' ? entry : entry?.value ?? '').toLowerCase().trim();
            valueCounts[v] = (valueCounts[v] || 0) + 1;
            break;
          }
        }
      }
    }

    if (VERBOSE) console.log(`Scanned ${totalScanned} so far ...`);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Report
  console.log(`\n─── Scan complete ────────────────────────────`);
  console.log(`Total B1 products scanned: ${totalScanned}`);
  console.log(`B1 → B4 (TVS):   ${moves.B4.length}`);
  console.log(`B1 → B3 (Zener): ${moves.B3.length}`);
  console.log(`B1 unchanged:    ${totalScanned - moves.B4.length - moves.B3.length}`);
  console.log('\nType-value distribution among reclassified:');
  for (const [v, n] of Object.entries(valueCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.padEnd(20)} → ${n}`);
  }

  if (VERBOSE) {
    console.log('\nFirst 5 of each move:');
    for (const fam of ['B4', 'B3']) {
      console.log(`  ${fam}:`);
      for (const r of moves[fam].slice(0, 5)) {
        console.log(`    ${r.mpn} (${r.manufacturer})`);
      }
    }
  }

  if (!APPLY) {
    console.log('\nDry run only — pass --apply to write changes to DB.');
    return;
  }

  // Apply: batch updates by target family. Each batch is one update statement
  // matching `id IN (...)`. Supabase's `.in()` filter handles up to ~1000 ids
  // per request, so we chunk.
  console.log('\n─── Applying updates ─────────────────────────');
  const CHUNK = 500;
  for (const fam of ['B4', 'B3']) {
    const targets = moves[fam];
    if (targets.length === 0) continue;
    const next = targets[0].next; // all same target family/cat/sub
    let written = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK).map((r) => r.id);
      const { error } = await supabase
        .from('atlas_products')
        .update({ family_id: fam, category: next.category, subcategory: next.subcategory })
        .in('id', chunk);
      if (error) {
        console.error(`Update failed for ${fam} chunk ${i / CHUNK}:`, error);
        process.exit(1);
      }
      written += chunk.length;
      console.log(`  ${fam}: ${written} / ${targets.length}`);
    }
  }

  console.log('\nDone. Re-run with no flags to verify (counts should be 0).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
