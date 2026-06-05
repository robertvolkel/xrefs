#!/usr/bin/env node

/**
 * Atlas Manufacturers Import Script
 *
 * Imports manufacturer master list from an Excel file into the
 * atlas_manufacturers Supabase table, creating canonical identity records.
 *
 * Usage:
 *   node scripts/atlas-manufacturers-import.mjs [path-to-xlsx] [options]
 *
 * If no path is given, defaults to:
 *   data/atlas_manufacturers_20260319_canonical_identity_model copy.xlsx
 *
 * Options:
 *   --dry-run       Show parsed data without writing to DB
 *   --verbose       Show per-row details
 *   --migrate       Also migrate enabled state from atlas_manufacturer_settings
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Parse CLI args ───────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const migrate = args.includes('--migrate');
const fixProducts = args.includes('--fix-products');
const filePath = args.find(a => !a.startsWith('--'))
  || 'data/atlas_manufacturers_20260319_canonical_identity_model copy.xlsx';

// ─── Name parsing utilities ──────────────────────────────

/**
 * Split a combined Atlas manufacturer name into English and Chinese parts.
 * Examples:
 *   "GIGADEVICE 兆易创新" → { en: "GIGADEVICE", zh: "兆易创新" }
 *   "3PEAK 思瑞浦" → { en: "3PEAK", zh: "思瑞浦" }
 *   "SG-Micro 圣邦微" → { en: "SG-Micro", zh: "圣邦微" }
 *   "ByChip 百域芯" → { en: "ByChip", zh: "百域芯" }
 *   "3L 三礼" → { en: "3L", zh: "三礼" }
 */
function parseAtlasName(nameDisplay) {
  // Find the first CJK character boundary
  // CJK Unified Ideographs: \u4E00-\u9FFF
  // CJK Ext A: \u3400-\u4DBF
  // Fullwidth forms: \uFF00-\uFFEF
  const cjkMatch = nameDisplay.match(/([\u3400-\u9FFF\uFF00-\uFFEF])/);
  if (!cjkMatch) {
    // No Chinese characters — entire name is English
    return { en: nameDisplay.trim(), zh: null };
  }
  const cjkStart = cjkMatch.index;
  const en = nameDisplay.slice(0, cjkStart).trim();
  const zh = nameDisplay.slice(cjkStart).trim();
  return { en: en || nameDisplay.trim(), zh: zh || null };
}

/**
 * Generate a URL-friendly slug from the English name.
 * "GIGADEVICE" → "gigadevice"
 * "SG-Micro" → "sg-micro"
 * "2Pai Semi" → "2pai-semi"
 * "XKB Connectivity" → "xkb-connectivity"
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Non-alphanumeric → hyphens
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
    .replace(/-{2,}/g, '-');       // Collapse multiple hyphens
}

/**
 * Parse separator-delimited aliases into a clean array. The source master
 * file uses three separator styles (verified Apr 2026, Decision #154):
 *   - ASCII semicolon ";"        (241 rows)
 *   - CJK semicolon "；" (full)  (10 rows — e.g. SWST, RESI, 2Pai Semi)
 *   - Comma ","                   (2 rows — e.g. KOHER, when no semi present)
 *
 * Rules:
 *   1. Always split on BOTH semicolon variants (neither occurs inside a
 *      company name, safe for every row).
 *   2. If no semicolon produced a split, fall back to comma splitting.
 *      Guarded so rows that legitimately use `;` as separator but contain
 *      commas inside company names (e.g. "Xiamen Hongfa Electroacoustic
 *      Co.,Ltd.") don't get over-split.
 *
 * "gigadevice; 兆易创新; gd/兆易创新"              → ["gigadevice", "兆易创新", "gd/兆易创新"]
 * "先科；st/先科；st(先科)；先科(st)"               → ["先科", "st/先科", "st(先科)", "先科(st)"]
 * "koher,科或（上海）电子有限公司,科或,KOHERelec"  → 4 entries
 * "hongfa; xiamen hongfa co.,ltd.; 宏发"         → 3 entries (comma inside preserved)
 */
function parseAliases(raw) {
  if (!raw) return [];
  // Step 1: split on any semicolon variant.
  let parts = raw.split(/[;；]/);
  // Step 2: if still one piece, try commas.
  if (parts.length === 1) {
    parts = parts[0].split(',');
  }
  return parts.map(a => a.trim()).filter(Boolean);
}

// ─── Read Excel file ─────────────────────────────────────

console.log(`\nReading: ${filePath}`);
const absolutePath = resolve(process.cwd(), filePath);
const workbook = XLSX.readFile(absolutePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${rows.length} rows in sheet "${sheetName}"\n`);

// ─── Process rows ────────────────────────────────────────

const manufacturers = [];
const slugsSeen = new Map(); // slug → nameDisplay, for dedup
// normalized (name_en|name_zh) → atlas_id, to catch the SAME company listed
// twice in one file under different atlas_ids (the "shadow row" cause —
// see scripts/atlas-dedupe-manufacturers.mjs). Upsert keys on atlas_id, so
// without this a second atlas_id for an existing name inserts a duplicate row.
const nameSeen = new Map();
let skippedDupNames = 0;

for (const row of rows) {
  const nameDisplay = (row['Atlas Manufacturer Name'] || '').trim();
  const atlasIdRaw = row['Atlas Manufacturer ID'];
  const aliasesRaw = (row['Atlas Manufacturer Name Aliases'] || '').trim();
  const partsioName = (row['Partsio Manufacturer Name'] || '').trim() || null;
  const partsioIdRaw = row['Partsio Manufacturer ID'];

  if (!nameDisplay || !atlasIdRaw) {
    console.warn(`  SKIP: missing name or ID — row: ${JSON.stringify(row)}`);
    continue;
  }

  const atlasId = parseInt(String(atlasIdRaw), 10);
  const partsioId = partsioIdRaw ? parseInt(String(partsioIdRaw), 10) : null;
  const { en, zh } = parseAtlasName(nameDisplay);
  const aliases = parseAliases(aliasesRaw);

  // Intra-file duplicate-name guard: same name_en + name_zh under a different
  // atlas_id is the same company listed twice — skip the later one rather than
  // create a shadow row. (Same atlas_id is a normal in-file repeat; harmless.)
  const nameKey = `${en.toLowerCase().trim()}|${(zh || '').trim()}`;
  if (nameSeen.has(nameKey) && nameSeen.get(nameKey) !== atlasId) {
    console.warn(`  SKIP duplicate name in file: "${nameDisplay}" atlas_id=${atlasId} — already seen as atlas_id=${nameSeen.get(nameKey)}`);
    skippedDupNames++;
    continue;
  }
  nameSeen.set(nameKey, atlasId);

  // Generate slug with dedup
  let slug = slugify(en);
  if (!slug) slug = slugify(nameDisplay); // fallback if en is empty
  if (slugsSeen.has(slug) && slugsSeen.get(slug) !== nameDisplay) {
    // Collision — append atlas_id
    slug = `${slug}-${atlasId}`;
  }
  slugsSeen.set(slug, nameDisplay);

  const record = {
    atlas_id: atlasId,
    slug,
    name_en: en,
    name_zh: zh,
    name_display: nameDisplay,
    // Pass array directly — supabase-js JSON-encodes the whole body for us.
    // Calling JSON.stringify here double-encodes and lands a string in a
    // JSONB array column. Early versions of this script did that; the fix
    // was paired with a one-shot migration that re-writes existing rows.
    aliases,
    partsio_id: partsioId,
    partsio_name: partsioName,
    country: 'CN',
    enabled: true,
  };

  manufacturers.push(record);

  if (verbose) {
    console.log(`  ${nameDisplay}`);
    console.log(`    slug: ${slug} | en: "${en}" | zh: "${zh || ''}" | atlas_id: ${atlasId}`);
    console.log(`    aliases: ${aliases.length} | partsio: ${partsioName || 'none'} (${partsioId || 'none'})`);
  }
}

console.log(`Parsed ${manufacturers.length} manufacturers`);
console.log(`  With aliases: ${manufacturers.filter(m => (m.aliases ?? []).length > 0).length}`);
console.log(`  With parts.io: ${manufacturers.filter(m => m.partsio_id).length}`);
if (skippedDupNames > 0) console.log(`  Skipped (duplicate name in file): ${skippedDupNames}`);

// ─── Dry run exit ────────────────────────────────────────

if (dryRun) {
  console.log('\n--dry-run: no database writes.');

  // Show a few samples
  console.log('\nSample records:');
  for (const m of manufacturers.slice(0, 5)) {
    console.log(`  ${m.name_display} → slug: "${m.slug}", en: "${m.name_en}", zh: "${m.name_zh || ''}"`);
  }
  process.exit(0);
}

// ─── Database connection ─────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Dedup guard against EXISTING rows ───────────────────
// The upsert keys on atlas_id, so a company already in the table under one
// atlas_id, re-listed in a later import under a DIFFERENT atlas_id, would
// insert a second ("shadow") row. This guard skips those inserts: if an
// incoming record's (name_en|name_zh) already exists under a different
// atlas_id, we leave the existing row alone and log it for manual review.
// (Matching atlas_id is a normal update and passes through untouched.)
async function fetchAllExistingMfrs() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('atlas_manufacturers')
      .select('atlas_id, name_en, name_zh, slug')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const existingMfrs = await fetchAllExistingMfrs();
const existingByName = new Map();
for (const r of existingMfrs) {
  existingByName.set(`${(r.name_en || '').toLowerCase().trim()}|${(r.name_zh || '').trim()}`, r);
}
const toUpsert = manufacturers.filter((m) => {
  const key = `${(m.name_en || '').toLowerCase().trim()}|${(m.name_zh || '').trim()}`;
  const existing = existingByName.get(key);
  if (existing && existing.atlas_id !== m.atlas_id) {
    console.warn(`  SKIP would-be duplicate: "${m.name_display}" atlas_id=${m.atlas_id} — already exists as atlas_id=${existing.atlas_id} (slug=${existing.slug})`);
    return false;
  }
  return true;
});
const guardSkipped = manufacturers.length - toUpsert.length;
if (guardSkipped > 0) console.log(`Dedup guard: skipped ${guardSkipped} record(s) that already exist under a different atlas_id.`);

// ─── Upsert manufacturers ───────────────────────────────

console.log('\nUpserting to atlas_manufacturers...');

// Batch upsert in chunks of 100
const BATCH_SIZE = 100;
let inserted = 0;
let errors = 0;

for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
  const batch = toUpsert.slice(i, i + BATCH_SIZE);

  const { error, count } = await supabase
    .from('atlas_manufacturers')
    .upsert(batch, { onConflict: 'atlas_id', count: 'exact' });

  if (error) {
    console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
    errors += batch.length;
  } else {
    inserted += count || batch.length;
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toUpsert.length)}/${toUpsert.length}\r`);
  }
}

console.log(`\nDone: ${inserted} upserted, ${errors} errors`);

// ─── Migrate enabled state from atlas_manufacturer_settings ──

if (migrate) {
  console.log('\nMigrating enabled state from atlas_manufacturer_settings...');

  const { data: settings, error: settingsErr } = await supabase
    .from('atlas_manufacturer_settings')
    .select('manufacturer, enabled, updated_at, updated_by')
    .eq('enabled', false);

  if (settingsErr) {
    console.warn('  Could not read atlas_manufacturer_settings:', settingsErr.message);
  } else if (settings && settings.length > 0) {
    let migrated = 0;
    for (const s of settings) {
      const { error: updateErr } = await supabase
        .from('atlas_manufacturers')
        .update({
          enabled: false,
          updated_at: s.updated_at,
          updated_by: s.updated_by,
        })
        .eq('name_display', s.manufacturer);

      if (updateErr) {
        console.warn(`  Failed to migrate ${s.manufacturer}:`, updateErr.message);
      } else {
        migrated++;
      }
    }
    console.log(`  Migrated ${migrated}/${settings.length} disabled manufacturer(s)`);
  } else {
    console.log('  No disabled manufacturers to migrate');
  }
}

// ─── Reconciliation ──────────────────────────────────────

console.log('\nReconciliation...');

// Find atlas_products manufacturers with no atlas_manufacturers record
const { data: productMfrs, error: prodErr } = await supabase
  .rpc('get_distinct_atlas_manufacturers');

// If RPC doesn't exist, fall back to a manual query
let unmatchedProducts = [];
if (prodErr) {
  // Fallback: just fetch distinct manufacturers from atlas_products
  const { data: allProducts } = await supabase
    .from('atlas_products')
    .select('manufacturer')
    .limit(10000);

  if (allProducts) {
    const distinctMfrs = [...new Set(allProducts.map(p => p.manufacturer))];
    const { data: knownMfrs } = await supabase
      .from('atlas_manufacturers')
      .select('name_display');

    const knownSet = new Set((knownMfrs || []).map(m => m.name_display));
    unmatchedProducts = distinctMfrs.filter(m => !knownSet.has(m));
  }
} else {
  const { data: knownMfrs } = await supabase
    .from('atlas_manufacturers')
    .select('name_display');
  const knownSet = new Set((knownMfrs || []).map(m => m.name_display));
  unmatchedProducts = (productMfrs || []).filter(m => !knownSet.has(m.manufacturer));
}

if (unmatchedProducts.length > 0) {
  console.log(`\n  WARNING: ${unmatchedProducts.length} atlas_products manufacturer(s) have no atlas_manufacturers record:`);

  // Try to match unmatched products to canonical names via name_en prefix
  const nameEnToDisplay = new Map();
  for (const m of manufacturers) {
    // Map lowercase English name → canonical name_display
    nameEnToDisplay.set(m.name_en.toLowerCase(), m.name_display);
  }

  const fixable = [];
  for (const m of unmatchedProducts) {
    const name = typeof m === 'string' ? m : m.manufacturer;
    const canonical = nameEnToDisplay.get(name.toLowerCase());
    if (canonical && canonical !== name) {
      fixable.push({ from: name, to: canonical });
      console.log(`    - ${name} → can fix to "${canonical}"`);
    } else {
      console.log(`    - ${name} (no match found)`);
    }
  }

  // Auto-fix if --fix-products flag is set
  if (fixProducts && fixable.length > 0) {
    console.log(`\n  Fixing ${fixable.length} atlas_products manufacturer name(s)...`);
    for (const { from, to } of fixable) {
      const { error: fixErr, count } = await supabase
        .from('atlas_products')
        .update({ manufacturer: to, updated_at: new Date().toISOString() })
        .eq('manufacturer', from);

      if (fixErr) {
        console.warn(`    FAILED ${from} → ${to}: ${fixErr.message}`);
      } else {
        console.log(`    ${from} → ${to} (${count ?? '?'} rows updated)`);
      }
    }
  } else if (fixable.length > 0 && !fixProducts) {
    console.log(`\n  Run with --fix-products to auto-rename these ${fixable.length} manufacturer(s) in atlas_products`);
  }
} else {
  console.log('  All atlas_products manufacturers have matching atlas_manufacturers records');
}

// Reverse: atlas_manufacturers with no products
const { data: mfrsWithProducts } = await supabase
  .from('atlas_products')
  .select('manufacturer')
  .limit(10000);

if (mfrsWithProducts) {
  const productMfrSet = new Set(mfrsWithProducts.map(p => p.manufacturer));
  const noProducts = manufacturers.filter(m => !productMfrSet.has(m.name_display));
  console.log(`  ${noProducts.length} manufacturers have no ingested products (expected — master list is larger)`);
}

// Invalidate Atlas Coverage cache so admin pages recompute on next visit
await supabase.from('admin_stats_cache').delete().eq('key', 'atlas-coverage');
console.log('  Atlas Coverage cache invalidated.');

console.log('\nDone!');
