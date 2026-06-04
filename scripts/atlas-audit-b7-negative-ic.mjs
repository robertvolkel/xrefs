#!/usr/bin/env node

/**
 * Atlas — B7 (IGBT) negative-Ic misclassification audit
 *
 * Triage surfaced a `@Ic(mA)` param on B7 products with NEGATIVE sample
 * values (-100, -1000, -2, -4000). IGBTs only conduct positive collector
 * current — negative Ic is a PNP BJT (B6) convention. This script finds
 * B7 products whose parameters JSONB carries an Ic-style key with a
 * negative value, so we can decide whether a batch needs reclassifying
 * B7 → B6.
 *
 * Strictly read-only — reports only, mutates nothing.
 *
 * Usage:
 *   node scripts/atlas-audit-b7-negative-ic.mjs           # report
 *   node scripts/atlas-audit-b7-negative-ic.mjs --json    # JSON
 *   node scripts/atlas-audit-b7-negative-ic.mjs --mpns    # list every MPN
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
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
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
const asJson = args.includes('--json');
const listMpns = args.includes('--mpns');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Pull every B7 product (paginate — Supabase caps at 1000/query).
async function fetchAllB7() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, parameters, status')
      .eq('family_id', 'B7')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Query error:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Does this JSONB key look like a collector-current spec?
// Catches: @Ic(mA), Ic, ic_max, Ic(A), IC, @ic_ma, collector current variants.
function isIcKey(key) {
  const k = key.toLowerCase().replace(/[@\s]/g, '');
  // strip a trailing unit paren like (ma)/(a)
  const base = k.replace(/\(.*?\)/g, '');
  return (
    base === 'ic' ||
    base.startsWith('ic_') ||
    base === 'ic_max' ||
    base.startsWith('collectorcurrent') ||
    base === 'icm' // pulsed collector current
  );
}

// Extract a leading numeric (handles "-100", "-1,000", "-2 mA", "−100" w/ U+2212).
function firstNumeric(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const s = String(value).replace(/−/g, '-').replace(/,/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// A parameter value may be a primitive, or an object { value, unit, numericValue, ... }.
function valuesFromParam(paramVal) {
  if (paramVal == null) return [];
  if (typeof paramVal === 'object' && !Array.isArray(paramVal)) {
    const out = [];
    if ('value' in paramVal) out.push(paramVal.value);
    if ('numericValue' in paramVal) out.push(paramVal.numericValue);
    return out;
  }
  return [paramVal];
}

function run() {
  return fetchAllB7().then((rows) => {
    const totalB7 = rows.length;
    const hits = []; // products with an Ic-style key carrying a negative value

    for (const p of rows) {
      const params = p.parameters || {};
      let negKey = null;
      let negVal = null;
      const icKeys = [];
      for (const key of Object.keys(params)) {
        if (!isIcKey(key)) continue;
        icKeys.push(key);
        for (const v of valuesFromParam(params[key])) {
          const n = firstNumeric(v);
          if (n != null && n < 0) { negKey = key; negVal = n; break; }
        }
        if (negKey) break;
      }
      if (negKey) {
        hits.push({
          id: p.id,
          mpn: p.mpn,
          manufacturer: p.manufacturer,
          status: p.status,
          negKey,
          negVal,
          icKeys,
        });
      }
    }

    // Roll up by manufacturer.
    const byMfr = {};
    for (const h of hits) {
      byMfr[h.manufacturer] = byMfr[h.manufacturer] || { count: 0, sampleMpns: [], keys: new Set() };
      byMfr[h.manufacturer].count++;
      if (byMfr[h.manufacturer].sampleMpns.length < 5) byMfr[h.manufacturer].sampleMpns.push(h.mpn);
      byMfr[h.manufacturer].keys.add(h.negKey);
    }

    if (asJson) {
      console.log(JSON.stringify({
        totalB7,
        flagged: hits.length,
        byManufacturer: Object.fromEntries(
          Object.entries(byMfr).map(([m, v]) => [m, { count: v.count, sampleMpns: v.sampleMpns, keys: [...v.keys] }])
        ),
        ...(listMpns ? { hits } : {}),
      }, null, 2));
      return;
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  B7 (IGBT) — negative collector-current audit');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total B7 products scanned : ${totalB7}`);
    console.log(`  Flagged (Ic key < 0)      : ${hits.length}`);
    console.log('');

    if (hits.length === 0) {
      console.log('  ✓ No B7 products carry a negative Ic-style value.');
      console.log('    Nothing to reclassify on this signal.');
      console.log('');
      return;
    }

    console.log('  These have NEGATIVE collector current — IGDTs cannot. Likely');
    console.log('  PNP BJTs (B6) miscategorized into B7. Review per manufacturer:');
    console.log('');
    const sorted = Object.entries(byMfr).sort((a, b) => b[1].count - a[1].count);
    for (const [mfr, v] of sorted) {
      console.log(`  ${String(v.count).padStart(5)}  ${mfr}`);
      console.log(`         keys: ${[...v.keys].join(', ')}`);
      console.log(`         e.g.: ${v.sampleMpns.join(', ')}`);
    }
    console.log('');

    if (listMpns) {
      console.log('  ── Every flagged product ──');
      for (const h of hits) {
        console.log(`  ${h.manufacturer}  ${h.mpn}  ${h.negKey}=${h.negVal}  [${h.status}]`);
      }
      console.log('');
    } else {
      console.log('  Re-run with --mpns to list every flagged MPN.');
      console.log('');
    }
  });
}

run();
