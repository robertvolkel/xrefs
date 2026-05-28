#!/usr/bin/env node

/**
 * Atlas Family-Param Signatures Validator — companion to the May 27, 2026
 * regex-bug fix in lib/services/atlasFamilyParamSignatures.ts.
 *
 * Three checks in one run:
 *
 *   A. Cross-family safety: pull every distinct paramName across atlas_products
 *      per family, run each through the NEW signature patterns, assert that
 *      no paramName outside B5/B6/B7/B9/E1 matches any signature.
 *
 *   B. Legitimate-IGBT non-touch: pull B7 rows carrying IGBT-unique keys
 *      (vces_max / eoff / igbt_technology), simulate the full reclassify
 *      pipeline against each, assert 0 reclassifications. A non-zero count
 *      is a regression — patterns are too aggressive.
 *
 *   C. B6 dictionary coverage gaps: walk the 13 affected MFR JSON files,
 *      collect raw paramNames carried by BJT-shape products (any param
 *      matching a B6 signature with the new patterns), cross-reference
 *      against the B6 dict at lib/services/atlasMapper.ts. List paramNames
 *      that would land in B6 but aren't translated — informational only.
 *
 * Usage:
 *   node scripts/atlas-family-signatures-validate.mjs
 *   node scripts/atlas-family-signatures-validate.mjs --verbose
 *   node scripts/atlas-family-signatures-validate.mjs --json
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      if (!process.env[t.slice(0, i).trim()]) {
        process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    }
  } catch { /* .env.local missing — assume env already set */ }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const AS_JSON = argv.includes('--json');

// ─── Mirror of FAMILY_PARAM_SIGNATURES (post-fix) ──────────────────
// Kept inline to avoid TS import. If patterns drift, update both places
// AND scripts/atlas-ingest.mjs (Decision #176 mirror convention).
const BJT_UNIQUE_COOCCURRENCE_PATTERNS = [
  /^hfe(?![A-Za-z0-9])/i,
  /^b?(?:vcbo|vceo|vebo)(?![A-Za-z0-9])/i,
];

const MOSFET_UNIQUE_COOCCURRENCE_PATTERNS = [
  /^rds[\s_(]*on/i,
];

const IGBT_UNIQUE_COOCCURRENCE_PATTERNS = [
  /^vces(?![A-Za-z0-9])/i,
  /^(?:eon|eoff|ets)(?![A-Za-z0-9])/i,
];

const SIGNATURES = [
  { pattern: /^b?(?:vcbo|vceo|vebo)(?![A-Za-z0-9])/i, targetFamily: 'B6' },
  { pattern: /^@?ic(?![A-Za-z0-9])/i,                 targetFamily: 'B6', requiresAlsoMatching: BJT_UNIQUE_COOCCURRENCE_PATTERNS },
  { pattern: /^hfe(?![A-Za-z0-9])/i,                  targetFamily: 'B6' },
  { pattern: /^ft(?![A-Za-z0-9])/i,                   targetFamily: 'B6', requiresAlsoMatching: BJT_UNIQUE_COOCCURRENCE_PATTERNS },
  { pattern: /^rds[\s_(]*on/i,                        targetFamily: 'B5' },
  { pattern: /^vgs[\s_(]*(th|threshold)/i,            targetFamily: 'B5', requiresAlsoMatching: MOSFET_UNIQUE_COOCCURRENCE_PATTERNS },
  { pattern: /^q(?:g|gs|gd)(?![A-Za-z0-9])/i,         targetFamily: 'B5', requiresAlsoMatching: MOSFET_UNIQUE_COOCCURRENCE_PATTERNS },
  { pattern: /^vce[\s_(]*sat/i,                       targetFamily: 'B7', requiresAlsoMatching: IGBT_UNIQUE_COOCCURRENCE_PATTERNS },
  { pattern: /^(?:eon|eoff|ets)(?![A-Za-z0-9])/i,     targetFamily: 'B7' },
  { pattern: /^idss(?![A-Za-z0-9])/i,                 targetFamily: 'B9' },
  { pattern: /^ctr(?![A-Za-z0-9])/i,                  targetFamily: 'E1' },
  { pattern: /^viso(?![A-Za-z0-9])/i,                 targetFamily: 'E1' },
];

const ALLOWED_TARGET_FAMILIES = new Set(['B5', 'B6', 'B7', 'B9', 'E1']);

// Standalone-only test (ignores cooccurrence) — used for Check A to flag
// every potential pattern hit, then we filter ones outside allowed targets.
function matchesAnyStandalone(paramName) {
  const trimmed = (paramName ?? '').trim();
  return SIGNATURES.filter((s) => s.pattern.test(trimmed));
}

// Full reclassify simulation (matches the production logic at
// atlasMapper.ts:reclassifyByParameterSignals Phase 2). Returns the new
// targetFamily if any signature flips, or null.
function simulateReclassify(currentFamilyId, paramNames) {
  for (const sig of SIGNATURES) {
    if (sig.targetFamily === currentFamilyId) continue;
    const hit = paramNames.some((n) => sig.pattern.test((n ?? '').trim()));
    if (!hit) continue;
    if (sig.requiresAlsoMatching?.length) {
      const coHit = paramNames.some((n) => {
        const pname = (n ?? '').trim();
        return sig.requiresAlsoMatching.some((coPat) => coPat.test(pname));
      });
      if (!coHit) continue;
    }
    return sig.targetFamily;
  }
  return null;
}

// ─── Check A: cross-family false-positive sweep ─────────────────────
async function checkA() {
  console.log('\n=== Check A: cross-family false-positive sweep ===');
  console.log('Pulling parameters JSONB across atlas_products in 1000-row chunks…');

  // Per-family Map<paramName_lowercase, count>
  const familyParamCounts = new Map(); // family_id → Map<paramName, count>
  let total = 0;
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await sb
      .from('atlas_products')
      .select('family_id, parameters')
      .not('family_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`  Check A query error at offset ${from}: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const fam = row.family_id;
      const params = row.parameters;
      if (!params || typeof params !== 'object') continue;
      let famMap = familyParamCounts.get(fam);
      if (!famMap) { famMap = new Map(); familyParamCounts.set(fam, famMap); }
      for (const key of Object.keys(params)) {
        famMap.set(key, (famMap.get(key) ?? 0) + 1);
      }
    }

    total += data.length;
    process.stdout.write(`\r  scanned ${total} rows`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(''); // newline

  // For each family, run paramNames through the standalone patterns and
  // collect any that hit a foreign-family signature. A false positive is any
  // paramName that lives in a family OUTSIDE the registry's target set
  // (B5/B6/B7/B9/E1) but matches one of the signature patterns. Earlier
  // version of this check used a NON_DISCRETE_FAMILIES regex that excluded
  // E1 and F-families from the sweep — silent hole flagged by review.
  const violations = []; // { family, paramName, count, signatureTarget }
  for (const [fam, paramMap] of familyParamCounts.entries()) {
    if (ALLOWED_TARGET_FAMILIES.has(fam)) continue; // signature-target families are out of scope for this check
    for (const [pname, count] of paramMap.entries()) {
      const hits = matchesAnyStandalone(pname);
      for (const sig of hits) {
        violations.push({
          family: fam,
          paramName: pname,
          count,
          wouldRouteTo: sig.targetFamily,
          patternSource: sig.pattern.source,
        });
      }
    }
  }

  const familySummary = [...familyParamCounts.entries()]
    .map(([fam, m]) => ({ family: fam, distinctParamNames: m.size }))
    .sort((a, b) => a.family.localeCompare(b.family));

  console.log(`  Scanned ${total} rows across ${familyParamCounts.size} families`);
  console.log(`  ${violations.length} false-positive paramName hits found in non-discrete families`);
  if (violations.length > 0) {
    console.log('  FAILURES (first 20):');
    for (const v of violations.slice(0, 20)) {
      console.log(`    [${v.family}] '${v.paramName}' (${v.count}×) would route to ${v.wouldRouteTo} via /${v.patternSource}/`);
    }
  }
  return { ok: violations.length === 0, violations, familySummary, totalRows: total };
}

// ─── Check B: legitimate B7 IGBTs must not reclassify ───────────────
async function checkB() {
  console.log('\n=== Check B: legitimate B7 IGBT non-touch ===');
  console.log('Pulling B7 products with vces_max ∪ eoff ∪ igbt_technology…');

  // PostgREST: parameters ? key uses .filter('parameters', '?', key) shape
  // via Supabase-js — but composing OR across multiple ? predicates needs
  // a .or() string. Falling back to a manual scan over family_id='B7' and
  // client-side filter, which is simpler and still bounded (~4K rows).
  const products = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('atlas_products')
      .select('mpn, manufacturer, parameters')
      .eq('family_id', 'B7')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`  Check B query error at offset ${from}: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const p = row.parameters;
      if (!p || typeof p !== 'object') continue;
      if (p.vces_max != null || p.eoff != null || p.igbt_technology != null) {
        products.push(row);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`  Found ${products.length} legitimate B7 IGBTs to simulate`);
  const reclassifications = [];
  for (const prod of products) {
    const paramNames = Object.keys(prod.parameters ?? {});
    const newFamily = simulateReclassify('B7', paramNames);
    if (newFamily) {
      reclassifications.push({
        mpn: prod.mpn,
        manufacturer: prod.manufacturer,
        wouldRouteTo: newFamily,
        paramNames,
      });
    }
  }

  console.log(`  ${reclassifications.length} legitimate IGBTs would reclassify (expected 0)`);
  if (reclassifications.length > 0) {
    console.log('  REGRESSIONS (first 10):');
    for (const r of reclassifications.slice(0, 10)) {
      console.log(`    ${r.mpn} (${r.manufacturer}) → ${r.wouldRouteTo} via params: ${r.paramNames.join(', ')}`);
    }
  }
  return { ok: reclassifications.length === 0, reclassifications, totalIgbts: products.length };
}

// ─── Check C: B6 dict coverage gaps across the 13 affected MFRs ─────
const AFFECTED_MFR_SLUGS = [
  'WPMSEMI', 'SWST', 'KEXIN', 'LRC', 'SALLTECH', 'Slkor', 'Jingheng',
  'WAY-ON', 'Prisemi', 'MDD', 'Comchip', 'YANGJIE', 'BORN',
];

function loadB6DictKeys() {
  // Extract the B6 dict block from atlasMapper.ts and pull the key strings.
  // This is a one-shot string scrape — fragile to formatting changes, but
  // the B6 block is stable.
  const src = readFileSync(resolve(process.cwd(), 'lib/services/atlasMapper.ts'), 'utf-8');
  const start = src.indexOf('B6: {');
  if (start === -1) throw new Error("Could not find 'B6: {' block in atlasMapper.ts");
  // Walk braces to find the matching '},'
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Could not find end of B6 dict block');
  const block = src.slice(start, end);
  // Extract quoted keys (single or double quote)
  const keys = new Set();
  const re = /['"]([^'"]+)['"]\s*:\s*\{/g;
  let m;
  while ((m = re.exec(block)) !== null) keys.add(m[1].toLowerCase());
  return keys;
}

function isBjtShapeProduct(paramNames) {
  // Any param matches a B6 signature (with cooccurrence enforced)
  return simulateReclassify('B1', paramNames) === 'B6';
}

async function checkC() {
  console.log('\n=== Check C: B6 dict coverage gaps across 13 affected MFRs ===');
  const b6Keys = loadB6DictKeys();
  console.log(`  Loaded ${b6Keys.size} B6 dict entries from atlasMapper.ts`);

  const dataDir = resolve(process.cwd(), 'data/atlas');
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  const targetFiles = files.filter((f) =>
    AFFECTED_MFR_SLUGS.some((slug) => f.includes(`_${slug}_`)),
  );

  const gapMap = new Map(); // raw paramName → { count, mfrs: Set, sampleValue }
  let bjtProductCount = 0;

  for (const fname of targetFiles) {
    const json = JSON.parse(readFileSync(resolve(dataDir, fname), 'utf-8'));
    const mfr = json?.manufacturer?.name ?? fname;
    const models = json?.models ?? [];
    for (const model of models) {
      const params = model?.parameters;
      if (!Array.isArray(params) || params.length === 0) continue;
      const paramNames = params.map((p) => p?.name ?? '');
      if (!isBjtShapeProduct(paramNames)) continue;
      bjtProductCount++;
      for (const p of params) {
        const name = (p?.name ?? '').trim();
        if (!name) continue;
        const lower = name.toLowerCase();
        if (b6Keys.has(lower)) continue;
        let entry = gapMap.get(name);
        if (!entry) {
          entry = { count: 0, mfrs: new Set(), sampleValue: p?.value ?? null };
          gapMap.set(name, entry);
        }
        entry.count++;
        entry.mfrs.add(mfr);
      }
    }
  }

  console.log(`  Walked ${targetFiles.length} affected MFR files, ${bjtProductCount} BJT-shape products`);
  console.log(`  ${gapMap.size} raw paramNames absent from B6 dict (informational — would surface as unmapped post-reclassification)`);

  if (VERBOSE && gapMap.size > 0) {
    console.log('  Top gaps (by occurrence):');
    const sorted = [...gapMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 30);
    for (const [name, info] of sorted) {
      console.log(`    '${name}' — ${info.count}× across ${info.mfrs.size} MFR(s); sample value: ${JSON.stringify(info.sampleValue)}`);
    }
  }

  return {
    bjtProductCount,
    gapCount: gapMap.size,
    gaps: [...gapMap.entries()].map(([name, info]) => ({
      paramName: name,
      occurrences: info.count,
      mfrs: [...info.mfrs],
      sampleValue: info.sampleValue,
    })),
  };
}

// ─── Main ──────────────────────────────────────────────────────────
(async () => {
  const start = Date.now();
  const results = {};
  results.checkA = await checkA();
  results.checkB = await checkB();
  results.checkC = await checkC();
  const elapsedMs = Date.now() - start;

  console.log('\n=== Summary ===');
  console.log(`  Check A (no cross-family false positives): ${results.checkA.ok ? 'PASS' : 'FAIL'}`);
  console.log(`  Check B (244 IGBTs untouched): ${results.checkB.ok ? 'PASS' : 'FAIL'}`);
  console.log(`  Check C (B6 dict gaps): ${results.checkC.gapCount} paramNames need B6 dict entries`);
  console.log(`  Total elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);

  if (AS_JSON) {
    console.log('\n' + JSON.stringify(results, null, 2));
  }

  process.exit(results.checkA.ok && results.checkB.ok ? 0 : 1);
})();
