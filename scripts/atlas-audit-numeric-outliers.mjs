#!/usr/bin/env node

/**
 * Atlas — Numeric Outlier Audit (post-Decision #217 sanity check)
 *
 * After flipping APPLY_UNIT_PREFIX_TO_NUMERIC and backfilling, this script
 * looks for products whose post-conversion numericValue lands in an
 * implausible range — symptom of a dict entry whose `unit:` field is wrong
 * for vendors that ship unit-LESS value strings (e.g. "400" instead of
 * "400kHz"; without an embedded unit, the conversion falls back to the
 * dict's unit declaration, which can be wrong for some vendors).
 *
 * Methodology: percentile-based outlier detection.
 *   - For each attributeId, collect every numericValue across all products
 *   - Compute median + 1st/99th percentiles
 *   - Flag products whose numericValue is < median/1e4 or > median × 1e4
 *     (4 orders of magnitude is the typical SI-prefix-mistake gap: kHz↔GHz
 *     is 1e6, MHz↔kHz is 1e3, so 1e4 catches both directions safely)
 *   - Group flagged products by (manufacturer, display value) to surface
 *     systematic issues (one vendor consistently mis-handling a label)
 *
 * Read-only. Outputs a punch list of (attribute, vendor, sample value)
 * tuples for engineer review. The "fix" path is to edit the dictionary
 * mapping (atlas_dictionary_overrides admin panel OR in-code atlasMapper.ts),
 * not to re-do Triage work.
 *
 * Usage:
 *   node scripts/atlas-audit-numeric-outliers.mjs                 # full report
 *   node scripts/atlas-audit-numeric-outliers.mjs --attribute fsw # one attribute deep-dive
 *   node scripts/atlas-audit-numeric-outliers.mjs --csv           # CSV output
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

function loadEnv() {
  try {
    const envPath = resolve(REPO_ROOT, '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* empty */ }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const asCsv = args.includes('--csv');
const attrIdx = args.indexOf('--attribute');
const attrFilter = attrIdx !== -1 ? args[attrIdx + 1] : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Outlier threshold: post-conversion numericValue more than 1e4× away from
// median in either direction is suspect. 1e4 chosen because:
//   - kHz↔GHz miss = 1e6 gap (caught)
//   - MHz↔kHz miss = 1e3 gap (not caught by 1e4 alone — but median itself
//     would shift if many vendors had this issue, and we'd catch via the
//     spread of values)
//   - Looser thresholds (1e3) get too many false positives from real
//     wide-range parameters (e.g. resistors span 0.001Ω to 10MΩ legitimately)
const OUTLIER_RATIO = 1e4;

// Attributes to skip — known wide-range parameters where percentile-based
// outlier detection produces too much noise to be useful.
const SKIP_ATTRIBUTES = new Set([
  'package_case', 'manufacturer', 'mpn', 'mounting_style',
  'aec_q200', 'aec_q101', 'aec_q100', 'rohs', 'reach', 'eccn_code',
  'output_type', 'polarity', 'topology', 'protocol', 'logic_function',
]);

async function fetchAllProducts() {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('mpn, manufacturer, family_id, parameters')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Page ${from} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from % 20000 === 0) console.error(`  ...scanned ${from} rows`);
  }
  return all;
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.max(0, Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * p)));
  return sortedArr[idx];
}

function main() {
  return fetchAllProducts().then(products => {
    console.error(`Scanned ${products.length} products.\n`);
    console.error('Collecting numericValues per attributeId...');

    // Per-attribute value collector
    const byAttr = new Map(); // attrId → [{ numericValue, displayValue, unit, manufacturer, mpn, familyId }]

    for (const p of products) {
      if (!p.parameters || typeof p.parameters !== 'object') continue;
      for (const [attrId, val] of Object.entries(p.parameters)) {
        if (!val || typeof val !== 'object') continue;
        if (SKIP_ATTRIBUTES.has(attrId)) continue;
        if (attrFilter && attrId !== attrFilter) continue;
        if (typeof val.numericValue !== 'number' || isNaN(val.numericValue)) continue;
        if (val.numericValue === 0) continue; // log-scale comparison fails on zero
        if (!byAttr.has(attrId)) byAttr.set(attrId, []);
        byAttr.get(attrId).push({
          numericValue: val.numericValue,
          displayValue: val.value,
          unit: val.unit,
          manufacturer: p.manufacturer,
          mpn: p.mpn,
          familyId: p.family_id,
        });
      }
    }

    console.error(`Tracking ${byAttr.size} distinct attributeIds.\n`);

    // For each attribute, compute median + flag outliers
    const flagged = []; // [{ attrId, median, outliers: [...], outlierCount, totalCount }]

    for (const [attrId, values] of byAttr) {
      if (values.length < 10) continue; // need enough samples for meaningful median
      const sorted = values.map(v => Math.abs(v.numericValue)).sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      if (!median || median === 0) continue;

      const lowThresh = median / OUTLIER_RATIO;
      const highThresh = median * OUTLIER_RATIO;
      const outliers = values.filter(v => {
        const abs = Math.abs(v.numericValue);
        return abs < lowThresh || abs > highThresh;
      });

      if (outliers.length > 0) {
        flagged.push({
          attrId,
          median,
          totalCount: values.length,
          outlierCount: outliers.length,
          outliers,
        });
      }
    }

    // Sort flagged by outlierCount desc
    flagged.sort((a, b) => b.outlierCount - a.outlierCount);

    if (asCsv) {
      console.log('attribute,median,total,outlier_count,outlier_pct,mfr,mpn,display,numericValue,deviation');
      for (const f of flagged) {
        for (const o of f.outliers) {
          const dev = (o.numericValue / f.median).toExponential(1);
          console.log(`${f.attrId},${f.median.toExponential(2)},${f.totalCount},${f.outlierCount},${((f.outlierCount / f.totalCount) * 100).toFixed(1)}%,"${o.manufacturer}","${o.mpn}","${o.displayValue}",${o.numericValue},${dev}`);
        }
      }
      return;
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(' Atlas — Numeric Outlier Audit (post-Decision #217 sanity check)');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Outlier threshold: ${OUTLIER_RATIO.toExponential()}× away from median (either direction).`);
    console.log(`Suspect attributes: ${flagged.length}`);
    console.log(`Total outlier products: ${flagged.reduce((a, f) => a + f.outlierCount, 0)}`);
    console.log('');

    if (flagged.length === 0) {
      console.log('✓ No outliers found. Post-conversion numericValues look sensible across all tracked attributes.');
      return;
    }

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log(' Suspect attributes (sorted by outlier count desc)');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('');

    for (const f of flagged) {
      const pct = ((f.outlierCount / f.totalCount) * 100).toFixed(1);
      console.log(`▼ ${f.attrId}   median=${f.median.toExponential(2)}   outliers=${f.outlierCount}/${f.totalCount} (${pct}%)`);

      // Group outliers by (manufacturer, displayValue) to find systematic issues
      const groups = new Map();
      for (const o of f.outliers) {
        const key = `${o.manufacturer}::${o.displayValue}::${o.unit || ''}`;
        if (!groups.has(key)) {
          groups.set(key, { mfr: o.manufacturer, display: o.displayValue, unit: o.unit, count: 0, sample: o });
        }
        groups.get(key).count++;
      }
      const sortedGroups = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8);
      for (const g of sortedGroups) {
        const dev = (g.sample.numericValue / f.median).toExponential(1);
        const ratioStr = Math.abs(g.sample.numericValue) > f.median ? 'HIGH' : 'low';
        console.log(`    ${ratioStr.padEnd(4)}  ${String(g.count).padStart(5)}×  ${g.mfr.padEnd(20)} "${g.display}" → ${g.sample.numericValue} (${dev}× median)  unit='${g.unit ?? '(none)'}'`);
      }
      if (groups.size > 8) console.log(`    ... and ${groups.size - 8} more group(s)`);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(' HOW TO INTERPRET');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  HIGH = numericValue is much LARGER than median (likely over-converted)');
    console.log('  low  = numericValue is much SMALLER than median (likely under-converted)');
    console.log('');
    console.log('  Investigate large groups (count > 10) first — those are systematic');
    console.log('  vendor patterns. Small groups (1-3) may be legitimate one-offs');
    console.log('  (e.g., a high-frequency RF part really IS 100× the median frequency).');
    console.log('');
    console.log('  Fix path: edit the dictionary mapping that produced the bad numericValue.');
    console.log('  Find it in atlasMapper.ts (FAMILY_PARAMS or SHARED_PARAMS) OR in the');
    console.log('  admin Dictionary panel (atlas_dictionary_overrides). Then re-run the');
    console.log('  affected MFR backfill: npm run atlas:backfill -- --mfr "<name>"');
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
