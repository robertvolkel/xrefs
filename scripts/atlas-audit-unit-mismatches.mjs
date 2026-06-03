#!/usr/bin/env node

/**
 * Atlas Dictionary — Unit-Field Audit
 *
 * Enumerates every distinct (attributeId, unit) combination currently in
 * - atlas_dictionary_overrides (engineer-accepted runtime overrides)
 * - in-code dicts in lib/services/atlasMapper.ts (built-in mappings)
 *
 * Purpose: before flipping APPLY_UNIT_PREFIX_TO_NUMERIC=true (the kill
 * switch in atlasMapper.ts / atlas-ingest.mjs), confirm the `unit` field
 * on every mapping captures the SOURCE unit (engineer's claim about what
 * the incoming raw value's unit is) rather than a target/display unit.
 *
 * When the kill switch flips on, `applyUnitPrefix(numericValue, unit)`
 * multiplies the raw value by the SI prefix implied by `unit`. So:
 *   - mapping with unit='kHz' on raw value 150 → stored numericValue 150000 (Hz)
 *   - mapping with unit='MHz' on raw value 1.5 → stored numericValue 1500000 (Hz)
 *   - mapping with unit='V' on raw value 3.3 → stored numericValue 3.3 (no prefix)
 *
 * If an engineer set unit='MHz' aspirationally (meaning "render as MHz")
 * but the actual raw values are kHz numbers, post-flip stored numericValue
 * will be 1e9× wrong (raw_kHz_value × 1e6 = wrong base-SI).
 *
 * This script does NOT mutate anything. Output is a report for human
 * review.
 *
 * Usage:
 *   node scripts/atlas-audit-unit-mismatches.mjs            # full report
 *   node scripts/atlas-audit-unit-mismatches.mjs --json     # JSON output
 *   node scripts/atlas-audit-unit-mismatches.mjs --samples  # include sample products per combo
 *
 * Read-only.
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
const withSamples = args.includes('--samples');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── SI prefix detection — must match applyUnitPrefix logic ──
// Returns true if applyUnitPrefix WILL transform numericValue when
// flag flips on. Used to flag high-risk combos.
function unitWouldApplyPrefix(unit) {
  if (!unit) return false;
  if (unit.startsWith('p')) return true;
  if (unit.startsWith('n') && !unit.startsWith('no')) return true;
  if (unit.startsWith('µ') || unit.startsWith('μ') || unit.startsWith('u')) return true;
  if (unit.startsWith('m') && !unit.startsWith('mm') && !unit.startsWith('M')) return true;
  if (unit.startsWith('k') || unit.startsWith('K')) return true;
  if (unit.startsWith('M') && !unit.startsWith('MSL')) return true;
  if (unit.startsWith('G')) return true;
  if (unit.startsWith('T')) return true;
  return false;
}

// ─── In-code dict scanner ────────────────────────────────────
// Parses atlasMapper.ts (single source of truth — .mjs is mirror).
// Pattern: { attributeId: 'X', attributeName: '...', unit: 'Y', sortOrder: N }
// Lookbehind/lookaround used to grab attributeId + unit from same object literal.
function scanInCodeDicts() {
  const path = resolve(REPO_ROOT, 'lib/services/atlasMapper.ts');
  const src = readFileSync(path, 'utf-8');

  // Match object literals that have BOTH attributeId and unit. The two fields
  // can appear in any order within the braces.
  const combos = [];
  // Strategy: regex for attributeId, then scan forward in the same line/object
  // for unit. Object literals in this file are single-line — verified by grep.
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const attrMatch = line.match(/attributeId:\s*['"]([^'"]+)['"]/);
    if (!attrMatch) continue;
    const unitMatch = line.match(/\bunit:\s*['"]([^'"]*)['"]/);
    if (!unitMatch) continue;
    const paramNameMatch = line.match(/^\s*['"]([^'"]+)['"]:\s*\{/);
    combos.push({
      attributeId: attrMatch[1],
      unit: unitMatch[1],
      paramName: paramNameMatch ? paramNameMatch[1] : null,
      line: i + 1,
    });
  }
  return combos;
}

// ─── DB override scanner ─────────────────────────────────────
async function scanDbOverrides() {
  const { data, error } = await supabase
    .from('atlas_dictionary_overrides')
    .select('family_id, param_name, attribute_id, attribute_name, unit, created_at, created_by')
    .eq('is_active', true)
    .not('attribute_id', 'is', null)
    .not('unit', 'is', null);
  if (error) throw new Error(`Override fetch failed: ${error.message}`);
  return (data || []).map(row => ({
    attributeId: row.attribute_id,
    unit: row.unit,
    familyId: row.family_id,
    paramName: row.param_name,
    createdAt: row.created_at,
  }));
}

// ─── Sample puller (optional) ────────────────────────────────
async function pullSamples(attributeId, limit = 3) {
  const { data, error } = await supabase
    .from('atlas_products')
    .select('mpn, manufacturer, parameters')
    .filter(`parameters->${attributeId}`, 'not.is', null)
    .limit(limit);
  if (error) return [];
  return (data || []).map(p => {
    const param = p.parameters?.[attributeId];
    return {
      mpn: p.mpn,
      mfr: p.manufacturer,
      value: param?.value ?? null,
      numericValue: param?.numericValue ?? null,
      unit: param?.unit ?? null,
    };
  });
}

// ─── Aggregator ──────────────────────────────────────────────
function aggregate(inCodeCombos, dbCombos) {
  const byAttribute = new Map();
  function add(attributeId, unit, source, detail) {
    if (!byAttribute.has(attributeId)) {
      byAttribute.set(attributeId, new Map());
    }
    const byUnit = byAttribute.get(attributeId);
    if (!byUnit.has(unit)) {
      byUnit.set(unit, { inCode: 0, db: 0, examples: [] });
    }
    const cell = byUnit.get(unit);
    if (source === 'in-code') cell.inCode++;
    else cell.db++;
    if (cell.examples.length < 3) cell.examples.push(detail);
  }
  for (const c of inCodeCombos) {
    add(c.attributeId, c.unit, 'in-code', `${c.paramName ?? '(unnamed)'} @ atlasMapper.ts:${c.line}`);
  }
  for (const c of dbCombos) {
    add(c.attributeId, c.unit, 'db', `${c.familyId}:${c.paramName} (${c.createdAt?.slice(0, 10)})`);
  }
  return byAttribute;
}

// ─── Report ──────────────────────────────────────────────────
function renderReport(byAttribute) {
  // Sort attributes alphabetically, units within each attribute by count desc.
  const sortedAttrs = [...byAttribute.keys()].sort();

  const flaggedSingle = []; // attributes with exactly 1 unit
  const flaggedMulti = [];  // attributes with multiple units (engineer attention)
  const noPrefix = [];      // attributes whose unit(s) don't trigger conversion

  for (const attr of sortedAttrs) {
    const byUnit = byAttribute.get(attr);
    const units = [...byUnit.entries()].sort((a, b) =>
      (b[1].inCode + b[1].db) - (a[1].inCode + a[1].db)
    );
    const anyPrefix = units.some(([u]) => unitWouldApplyPrefix(u));
    if (!anyPrefix) {
      noPrefix.push({ attr, units });
      continue;
    }
    if (units.length === 1) flaggedSingle.push({ attr, units });
    else flaggedMulti.push({ attr, units });
  }

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(' Atlas Dictionary — Unit-Field Audit');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`In-code dict entries with unit set: ${[...byAttribute.values()].reduce((acc, m) => acc + [...m.values()].reduce((s, c) => s + c.inCode, 0), 0)}`);
  console.log(`DB override entries with unit set:  ${[...byAttribute.values()].reduce((acc, m) => acc + [...m.values()].reduce((s, c) => s + c.db, 0), 0)}`);
  console.log(`Distinct attributeIds with unit:    ${byAttribute.size}`);
  console.log('');

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(' 🚨 HIGH-RISK: attributes with MULTIPLE distinct units');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('  Different units on same attributeId means raw values can\'t share');
  console.log('  a numericValue convention. Either dict authors disagreed about the');
  console.log('  source unit, OR vendors actually publish in different units (the');
  console.log('  conversion will normalize them once flag flips on).');
  console.log('');
  if (flaggedMulti.length === 0) {
    console.log('  (none)');
  } else {
    for (const { attr, units } of flaggedMulti) {
      console.log(`  ${attr}`);
      for (const [unit, cell] of units) {
        const prefix = unitWouldApplyPrefix(unit) ? '✦' : ' ';
        console.log(`    ${prefix} unit='${unit}'  inCode=${cell.inCode}  db=${cell.db}`);
        for (const ex of cell.examples) console.log(`        · ${ex}`);
      }
      console.log('');
    }
  }

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(' ⚠  ATTENTION: single unit per attribute, prefix WILL apply');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('  When flag flips ON, every value stored under these (attribute, unit)');
  console.log('  combos gets multiplied by the prefix. Verify the unit IS the source');
  console.log('  unit (what raw values actually are), not the display target.');
  console.log('');
  for (const { attr, units } of flaggedSingle) {
    const [unit, cell] = units[0];
    console.log(`  ${attr.padEnd(30)} unit='${unit}'  inCode=${cell.inCode}  db=${cell.db}`);
    for (const ex of cell.examples.slice(0, 1)) console.log(`      e.g. ${ex}`);
  }
  console.log('');

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(' ✓ SAFE: unit doesn\'t trigger prefix conversion');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`  ${noPrefix.length} attributes use units like V/A/Ω/°C/%/dB — no-op.`);
  console.log('  (Use --json to see full list.)');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  Multi-unit attributes (HIGH-RISK): ${flaggedMulti.length}`);
  console.log(`  Single-unit prefix-triggering:     ${flaggedSingle.length}`);
  console.log(`  No-prefix attributes:              ${noPrefix.length}`);
  console.log('');
  console.log('  Recommendation: review HIGH-RISK section first. For each multi-unit');
  console.log('  attribute, decide whether the unit splits are real (vendors disagree)');
  console.log('  or wrong (one author used display-unit, another source-unit).');
  console.log('');
  console.log('  Then scan ATTENTION list — confirm each unit IS the source unit.');
  console.log('');
  console.log('  Only after this review, flip APPLY_UNIT_PREFIX_TO_NUMERIC=true in');
  console.log('  lib/services/atlasMapper.ts + scripts/atlas-ingest.mjs.');
}

async function main() {
  console.error('Scanning in-code dicts (atlasMapper.ts)...');
  const inCode = scanInCodeDicts();
  console.error(`  Found ${inCode.length} entries with unit field set.`);

  console.error('Scanning DB overrides (atlas_dictionary_overrides)...');
  const db = await scanDbOverrides();
  console.error(`  Found ${db.length} active overrides with unit field set.`);
  console.error('');

  const agg = aggregate(inCode, db);

  if (withSamples) {
    console.error('Pulling sample products for each (attribute, unit) combo (slow)...');
    for (const [attr, byUnit] of agg) {
      const samples = await pullSamples(attr, 3);
      for (const [, cell] of byUnit) {
        cell.samples = samples;
      }
    }
  }

  if (asJson) {
    const out = {};
    for (const [attr, byUnit] of agg) {
      out[attr] = {};
      for (const [unit, cell] of byUnit) {
        out[attr][unit] = {
          inCode: cell.inCode,
          db: cell.db,
          wouldApplyPrefix: unitWouldApplyPrefix(unit),
          examples: cell.examples,
          ...(cell.samples ? { samples: cell.samples } : {}),
        };
      }
    }
    console.log(JSON.stringify(out, null, 2));
  } else {
    renderReport(agg);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
