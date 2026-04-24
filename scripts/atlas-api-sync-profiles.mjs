#!/usr/bin/env node

/**
 * Atlas API Profile Sync Script
 *
 * Fetches manufacturer profiles from the Atlas external API and enriches
 * the local atlas_manufacturers Supabase table with profile data
 * (descriptions, logos, HQ location, certifications, etc.).
 *
 * Merge strategy: "API enriches, existing data preserved."
 * Only overwrites fields that are currently NULL/empty in Supabase,
 * unless --force is used.
 *
 * Prerequisites:
 *   1. Run the profile migration SQL first:
 *      scripts/supabase-atlas-manufacturers-profile-migration.sql
 *   2. Ensure ATLAS_API_TOKEN is set in .env.local
 *
 * Usage:
 *   node scripts/atlas-api-sync-profiles.mjs [options]
 *
 * Options:
 *   --dry-run    Show what would change without writing to DB
 *   --force      Overwrite existing non-null fields
 *   --verbose    Show per-manufacturer details
 *   --id <N>     Sync only this atlas_id (for testing)
 *   --add-new    Also create new atlas_manufacturers records for
 *                API partners not in our DB (35 partners)
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
const ATLAS_API_TOKEN = process.env.ATLAS_API_TOKEN;
const ATLAS_API_BASE = 'https://cn-api.datasheet5.com';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!ATLAS_API_TOKEN) {
  console.error('Missing ATLAS_API_TOKEN in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const verbose = args.includes('--verbose');
const addNew = args.includes('--add-new');
const idFlagIdx = args.indexOf('--id');
const singleId = idFlagIdx !== -1 ? parseInt(args[idFlagIdx + 1], 10) : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── API helpers ──────────────────────────────────────────

async function apiGet(path) {
  const url = `${ATLAS_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: ATLAS_API_TOKEN },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  const json = await res.json();
  if (!json.success) throw new Error(`API error: ${json.msg || 'unknown'}`);
  return json.data;
}

async function fetchPartnerDetail(id) {
  // Fetch both English and Chinese locales
  const [en, zh] = await Promise.all([
    apiGet(`/api/atlas/partners/${id}?locale=en`),
    apiGet(`/api/atlas/partners/${id}?locale=zh`).catch(() => null),
  ]);
  return { en, zh };
}

// ─── Parse helpers ────────────────────────────────────────

/** Parse API year string → integer or null */
function parseYear(y) {
  if (!y || y === '-') return null;
  const n = parseInt(y, 10);
  return n > 1900 && n < 2100 ? n : null;
}

/** Parse API certs text → ManufacturerCertification[] JSONB */
function parseCerts(certsText) {
  if (!certsText) return [];
  // Split on comma, semicolon, or "and"
  const parts = certsText
    .split(/[;,]|(?:\band\b)/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 120);

  return parts.map((name) => {
    // Infer category from keywords
    let category = 'other';
    const lower = name.toLowerCase();
    if (/iso\s*9001|iatf\s*16949/i.test(lower)) category = 'quality';
    else if (/iso\s*14001|rohs|reach|halogen|weee/i.test(lower)) category = 'environmental';
    else if (/ul|tuv|ce|fcc|ccc|kc|pse/i.test(lower)) category = 'safety';
    else if (/aec|automotive/i.test(lower)) category = 'automotive';
    else if (/iso\s*27001/i.test(lower)) category = 'security';
    else if (/iso\s*45001|ohsas/i.test(lower)) category = 'safety';
    return { name, category };
  });
}

/** Clean empty/dash strings to null */
function clean(s) {
  if (!s || s === '-' || s.trim() === '') return null;
  return s.trim();
}

/** Parse name into en/zh parts (same logic as import script) */
function parseApiName(mfr) {
  if (!mfr) return { en: '', zh: '' };
  // Pattern: "ENGLISH Chinese" — split at first Chinese character
  const match = mfr.match(/^([A-Za-z0-9&*.'\-/() ]+?)[\s]*([\u4e00-\u9fff].*)$/);
  if (match) return { en: match[1].trim(), zh: match[2].trim() };
  // All Chinese
  if (/[\u4e00-\u9fff]/.test(mfr)) return { en: '', zh: mfr.trim() };
  return { en: mfr.trim(), zh: '' };
}

/** Generate URL-friendly slug */
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Fetch local manufacturers ───────────────────────────

async function fetchLocalManufacturers() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_manufacturers')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ─── Build update record ─────────────────────────────────

function buildUpdate(local, apiEn, apiZh) {
  const updates = {};
  const changes = []; // human-readable change descriptions

  // Text fields — fill if empty, overwrite if --force
  const textFields = [
    { api: 'description', db: 'summary' },
    { api: 'homepage', db: 'website_url' },
    { api: 'logoUrl', db: 'logo_url' },
    { api: 'location', db: 'headquarters' },
    { api: 'contact', db: 'contact_info' },
    { api: 'products', db: 'core_products' },
    { api: 'stockcode', db: 'stock_code' },
    { api: 'gaiaId', db: 'gaia_id' },
  ];

  for (const { api, db } of textFields) {
    const newVal = clean(apiEn[api]);
    if (!newVal) continue;
    const existing = local[db];
    if (!existing || force) {
      if (existing !== newVal) {
        updates[db] = newVal;
        changes.push(`${db}: ${existing ? `"${existing.slice(0, 40)}…"` : '(empty)'} → "${newVal.slice(0, 40)}…"`);
      }
    }
  }

  // Founded year
  const year = parseYear(apiEn.year);
  if (year && (!local.founded_year || force)) {
    if (local.founded_year !== year) {
      updates.founded_year = year;
      changes.push(`founded_year: ${local.founded_year || '(empty)'} → ${year}`);
    }
  }

  // Certifications — merge parsed certs with existing
  const apiCerts = parseCerts(apiEn.certs);
  const existingCerts = Array.isArray(local.certifications) ? local.certifications : [];
  if (apiCerts.length > 0 && (existingCerts.length === 0 || force)) {
    // Deduplicate by cert name (case-insensitive)
    const existingNames = new Set(existingCerts.map((c) => c.name?.toLowerCase()));
    const merged = [...existingCerts];
    let added = 0;
    for (const cert of apiCerts) {
      if (!existingNames.has(cert.name.toLowerCase())) {
        merged.push(cert);
        existingNames.add(cert.name.toLowerCase());
        added++;
      }
    }
    if (added > 0) {
      updates.certifications = merged;
      changes.push(`certifications: +${added} (total ${merged.length})`);
    }
  }

  // Always update api_synced_at
  if (Object.keys(updates).length > 0) {
    updates.api_synced_at = new Date().toISOString();
    updates.updated_at = new Date().toISOString();
  }

  return { updates, changes };
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log('Atlas API Profile Sync');
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${force ? ' (force overwrite)' : ''}`);
  if (singleId) console.log(`  Single ID: ${singleId}`);
  console.log();

  // Fetch API partners list
  console.log('Fetching API partner list...');
  const apiPartners = await apiGet('/api/atlas/partners?locale=en&all=true');
  console.log(`  ${apiPartners.length} API partners`);

  // Fetch local manufacturers
  console.log('Fetching local manufacturers...');
  const localMfrs = await fetchLocalManufacturers();
  console.log(`  ${localMfrs.length} local manufacturers\n`);

  // Build atlas_id → local record map
  const localByAtlasId = new Map();
  for (const m of localMfrs) {
    if (m.atlas_id) localByAtlasId.set(m.atlas_id, m);
  }

  // Filter to matched partners only
  let toSync = apiPartners.filter((p) => localByAtlasId.has(p.id));
  const apiOnly = apiPartners.filter((p) => !localByAtlasId.has(p.id));

  if (singleId) {
    toSync = toSync.filter((p) => p.id === singleId);
    if (toSync.length === 0) {
      console.error(`atlas_id ${singleId} not found in matched partners`);
      process.exit(1);
    }
  }

  console.log(`Partners to sync: ${toSync.length}`);
  console.log(`API-only (not in DB): ${apiOnly.length}\n`);

  // ─── Sync existing partners ──────────────────────────

  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < toSync.length; i++) {
    const partner = toSync[i];
    const local = localByAtlasId.get(partner.id);

    try {
      // Fetch full detail from API
      const { en: apiEn } = await fetchPartnerDetail(partner.id);

      // Build delta
      const { updates, changes } = buildUpdate(local, apiEn);

      if (changes.length === 0) {
        skipped++;
        if (verbose) console.log(`  [${i + 1}/${toSync.length}] ${local.name_display} — no changes`);
        continue;
      }

      if (verbose || dryRun) {
        console.log(`  [${i + 1}/${toSync.length}] ${local.name_display} (atlas_id=${partner.id})`);
        for (const c of changes) console.log(`    ${c}`);
      }

      if (!dryRun) {
        const { error } = await supabase
          .from('atlas_manufacturers')
          .update(updates)
          .eq('atlas_id', partner.id);

        if (error) {
          console.error(`    ERROR: ${error.message}`);
          errored++;
          continue;
        }
      }

      updated++;
    } catch (err) {
      console.error(`  [${i + 1}/${toSync.length}] ${local.name_display} — FETCH ERROR: ${err.message}`);
      errored++;
    }

    // Progress indicator (non-verbose)
    if (!verbose && !dryRun && (i + 1) % 10 === 0) {
      process.stdout.write(`  Progress: ${i + 1}/${toSync.length}\r`);
    }

    // Rate limit: ~100ms between API calls
    if (i < toSync.length - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // ─── Add new manufacturers (if --add-new) ─────────────

  let added = 0;

  if (addNew && apiOnly.length > 0) {
    console.log(`\nAdding ${apiOnly.length} new manufacturers from API...`);

    // Gather existing slugs to avoid collisions
    const existingSlugs = new Set(localMfrs.map((m) => m.slug));

    for (const partner of apiOnly) {
      try {
        const { en: apiEn } = await fetchPartnerDetail(partner.id);
        const { en: nameEn, zh: nameZh } = parseApiName(partner.mfr);
        let slug = slugify(nameEn || partner.mfr);
        if (!slug) slug = `mfr-${partner.id}`;
        if (existingSlugs.has(slug)) slug = `${slug}-${partner.id}`;

        const record = {
          atlas_id: partner.id,
          slug,
          name_en: nameEn || partner.name || partner.mfr,
          name_zh: nameZh || null,
          name_display: partner.mfr,
          summary: clean(apiEn.description),
          website_url: clean(apiEn.homepage),
          logo_url: clean(apiEn.logoUrl) || clean(partner.logoUrl),
          headquarters: clean(apiEn.location),
          founded_year: parseYear(apiEn.year),
          contact_info: clean(apiEn.contact),
          core_products: clean(apiEn.products),
          stock_code: clean(apiEn.stockcode),
          gaia_id: clean(apiEn.gaiaId),
          certifications: parseCerts(apiEn.certs),
          api_synced_at: new Date().toISOString(),
        };

        if (verbose || dryRun) {
          console.log(`  + ${record.name_display} (atlas_id=${partner.id}, slug="${slug}")`);
        }

        if (!dryRun) {
          const { error } = await supabase
            .from('atlas_manufacturers')
            .insert(record);
          if (error) {
            console.error(`    INSERT ERROR: ${error.message}`);
            errored++;
            continue;
          }
        }

        existingSlugs.add(slug);
        added++;

        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`  + ${partner.mfr} — ERROR: ${err.message}`);
        errored++;
      }
    }
  }

  // ─── Summary ─────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SYNC SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped} (no changes needed)`);
  if (added > 0) console.log(`  Added:    ${added} new manufacturers`);
  console.log(`  Errors:   ${errored}`);
  if (dryRun) console.log('  (DRY RUN — no database writes)');
  console.log('═══════════════════════════════════════════════════');

  // Invalidate Atlas Coverage cache so admin pages recompute on next visit
  if (!dryRun && (updated > 0 || added > 0)) {
    await supabase.from('admin_stats_cache').delete().eq('key', 'atlas-coverage');
    console.log('  Atlas Coverage cache invalidated.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
