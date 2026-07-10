#!/usr/bin/env node

/**
 * Atlas Triage — audit accepted overrides where paramName parenthetical
 * declares a unit that DISAGREES with the override's own `unit` field.
 *
 * Root cause of silent data corruption: engineer accepts a paramName like
 * `IR(mA)@VRRM` but sets the override's unit to μA. Every product using
 * that column stores its numericValue 1000x too small in base SI — the
 * Decision #217 hybrid normalization applies the WRONG prefix.
 *
 * This is read-only. Prints suspect rows for manual review. Follow-up
 * fix requires an UPDATE — separate script.
 *
 * Usage:
 *   node scripts/atlas-audit-paramname-unit-mismatch.mjs
 *   node scripts/atlas-audit-paramname-unit-mismatch.mjs --format json
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
    const content = readFileSync(resolve(REPO_ROOT, '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
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
const format = (() => {
  const i = args.indexOf('--format');
  return i !== -1 && args[i + 1] ? args[i + 1] : 'text';
})();

// --- Unit normalization ---------------------------------------------------
// Fold Unicode variants of micro (U+03BC Greek mu, U+00B5 micro sign) → 'u'
// Fold Ohm variants (U+03A9 Greek omega, U+2126 Ohm sign) → 'ohm'
// Fold degree variants (U+00B0, U+00BA) → '°'
function normalizeUnit(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Strip whitespace inside
  s = s.replace(/\s+/g, '');
  // Micro fold
  s = s.replace(/[μµ]/g, 'u');
  // Ohm fold — canonicalize to lowercase 'ohm'
  s = s.replace(/[ΩΩ]/g, 'ohm').replace(/Ω/g, 'ohm');
  // Degree fold
  s = s.replace(/[º]/g, '°');
  // Common variants
  s = s.replace(/^ohms$/i, 'ohm');
  return s;
}

// Canonical unit atoms + their prefixed forms. Case-sensitive on prefix
// (m ≠ M) because that IS the distinction — 'mV' vs 'MV' is 1e6 apart.
const UNIT_ATOMS = ['A', 'V', 'F', 'H', 'Hz', 'W', 's', 'ohm', 'bar', 'T'];
const PREFIXES = ['f', 'p', 'n', 'u', 'm', '', 'k', 'M', 'G'];
const KNOWN_UNITS = new Set();
for (const atom of UNIT_ATOMS) {
  for (const pfx of PREFIXES) {
    KNOWN_UNITS.add(pfx + atom);
  }
}
// Compound / special
[
  '°C/W', '°C', 'ppm/°C', '%/°C', 'dB', 'dBm', '%', 'V/us', 'V/s', 'A/us', 'A/s',
  'nV/√Hz', 'nV/rtHz', 'pA/√Hz', 'C', 'J', 'K', 'M', 'kV/us', 'V/ns',
  'A2s', 'A²s', 'kA', 'MA', 'ns', 'us', 'ms', 'ps', 'fs',
].forEach(u => KNOWN_UNITS.add(u));

function isKnownUnit(candidate) {
  if (!candidate) return false;
  const norm = normalizeUnit(candidate);
  if (!norm) return false;
  if (KNOWN_UNITS.has(norm)) return true;
  // Case-fold check for compound units where user may have written "°c/w"
  for (const k of KNOWN_UNITS) {
    if (k.toLowerCase() === norm.toLowerCase()) return true;
  }
  return false;
}

// Extract candidate unit strings from paramName parentheticals.
// Multiple parentheticals possible; return the LAST one that's unit-like
// (that's typically the value's unit; earlier ones tend to be conditions).
function extractParamNameUnit(paramName) {
  if (!paramName) return null;
  const matches = [...paramName.matchAll(/\(([^)]+)\)/g)];
  if (!matches.length) return null;
  // Iterate right-to-left, return first unit-like
  for (let i = matches.length - 1; i >= 0; i--) {
    const raw = matches[i][1].trim();
    if (isKnownUnit(raw)) return raw;
  }
  return null;
}

// Are two units the same after normalization? Case-SENSITIVE on prefix — that
// IS the distinction we're auditing ('m' vs 'M' is 1e9 apart). Case-folding
// would defeat the whole point of this audit: a mV vs MV mismatch would be
// hidden. If a legitimate compound-unit case variant needs to be tolerated
// (e.g. 'V/us' vs 'V/uS'), add both forms to KNOWN_UNITS explicitly.
function unitsMatch(a, b) {
  if (!a || !b) return null; // can't compare
  return normalizeUnit(a) === normalizeUnit(b);
}

// --- Fetch + scan ---------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllOverrides() {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_at')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const all = await fetchAllOverrides();

const suspects = [];
let stats = { total: all.length, hasParenUnit: 0, matched: 0, mismatched: 0, noOverrideUnit: 0 };

for (const row of all) {
  const paramUnit = extractParamNameUnit(row.param_name);
  if (!paramUnit) continue;
  stats.hasParenUnit++;
  if (!row.unit) { stats.noOverrideUnit++; continue; }
  const match = unitsMatch(paramUnit, row.unit);
  if (match === true) { stats.matched++; continue; }
  stats.mismatched++;
  suspects.push({
    id: row.id,
    family_id: row.family_id,
    param_name: row.param_name,
    attribute_id: row.attribute_id,
    attribute_name: row.attribute_name,
    override_unit: row.unit,
    paramname_unit: paramUnit,
    normalized_override: normalizeUnit(row.unit),
    normalized_paramname: normalizeUnit(paramUnit),
  });
}

// Sort: group by attribute_id, then family
suspects.sort((a, b) => {
  if (a.attribute_id !== b.attribute_id) return a.attribute_id.localeCompare(b.attribute_id);
  if ((a.family_id || '') !== (b.family_id || '')) return (a.family_id || '').localeCompare(b.family_id || '');
  return a.param_name.localeCompare(b.param_name);
});

if (format === 'json') {
  console.log(JSON.stringify({ stats, suspects }, null, 2));
  process.exit(0);
}

console.log(`\n=== ParamName vs override unit mismatch audit ===`);
console.log(`Total active overrides: ${stats.total}`);
console.log(`  With unit-like parenthetical: ${stats.hasParenUnit}`);
console.log(`    Match (override unit == paramName unit): ${stats.matched}`);
console.log(`    MISMATCH (silent data corruption risk): ${stats.mismatched}`);
console.log(`    Override has no unit (paramName has one): ${stats.noOverrideUnit}`);
console.log('');

if (!suspects.length) {
  console.log('No unit mismatches found.\n');
  process.exit(0);
}

// Group by attribute_id for scanning
const byAttr = new Map();
for (const s of suspects) {
  if (!byAttr.has(s.attribute_id)) byAttr.set(s.attribute_id, []);
  byAttr.get(s.attribute_id).push(s);
}

console.log(`--- Mismatches (${suspects.length}) ---\n`);
for (const [attrId, rows] of byAttr) {
  console.log(`→ ${attrId}  (${rows.length} suspect(s))`);
  for (const r of rows) {
    const fam = r.family_id || '(no family)';
    const pnDisplay = r.param_name.replace(/\n/g, '\\n');
    console.log(`   [${fam}]  "${pnDisplay}"`);
    console.log(`      paramName says: (${r.paramname_unit})  →  override declares: ${r.override_unit}`);
    console.log(`      id=${r.id}`);
  }
  console.log('');
}

console.log('--- Next steps ---');
console.log('  For each suspect: verify by checking the vendor source file for one product.');
console.log('  If paramName unit is correct → UPDATE override.unit to match paramName.');
console.log('  If override unit is correct → paramName parenthetical was misleading; leave alone.');
console.log('  Fix script: (to be written) atlas-fix-paramname-unit-mismatch.mjs --id <uuid> --to <unit>\n');
