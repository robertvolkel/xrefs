#!/usr/bin/env node

/**
 * Atlas API → Supabase ID Mapping Validation
 *
 * Calls GET /api/atlas/partners?locale=en&all=true and cross-references
 * against the local atlas_manufacturers Supabase table to determine
 * whether the API's partner `id` matches our `atlas_id`.
 *
 * Usage:
 *   node scripts/atlas-api-validate-ids.mjs [options]
 *
 * Options:
 *   --verbose    Show per-manufacturer match details
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

const verbose = process.argv.includes('--verbose');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Fetch API partners ──────────────────────────────────

async function fetchApiPartners() {
  const url = `${ATLAS_API_BASE}/api/atlas/partners?locale=en&all=true`;
  console.log(`Fetching partners from API: ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: ATLAS_API_TOKEN },
  });
  if (!res.ok) {
    throw new Error(`API returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(`API error: ${json.msg || 'unknown'}`);
  }
  return json.data; // array of partner objects
}

// ─── Fetch local manufacturers ───────────────────────────

async function fetchLocalManufacturers() {
  // Paginate to handle >1000 rows
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_manufacturers')
      .select('id, atlas_id, slug, name_en, name_zh, name_display, enabled')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ─── Normalize for fuzzy comparison ──────────────────────

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  const [apiPartners, localMfrs] = await Promise.all([
    fetchApiPartners(),
    fetchLocalManufacturers(),
  ]);

  console.log(`\nAPI partners: ${apiPartners.length}`);
  console.log(`Local manufacturers: ${localMfrs.length}\n`);

  // Build lookup maps
  const localByAtlasId = new Map();
  const localByNameNorm = new Map();
  const localByNameEn = new Map();
  for (const m of localMfrs) {
    if (m.atlas_id) localByAtlasId.set(m.atlas_id, m);
    const norm = normalize(m.name_en);
    if (norm) localByNameNorm.set(norm, m);
    const normDisplay = normalize(m.name_display);
    if (normDisplay) localByNameNorm.set(normDisplay, m);
    if (m.name_en) localByNameEn.set(m.name_en.toLowerCase(), m);
  }

  // Match results
  const matchedById = [];
  const matchedByName = [];
  const apiOnly = [];
  const idMismatch = []; // matched by name but IDs differ

  const matchedLocalIds = new Set();

  for (const partner of apiPartners) {
    const apiId = partner.id;
    const apiMfr = partner.mfr || '';
    const apiName = partner.name || '';

    // Try exact ID match first
    const byId = localByAtlasId.get(apiId);
    if (byId) {
      matchedById.push({ apiId, apiMfr, apiName, local: byId });
      matchedLocalIds.add(byId.id);
      continue;
    }

    // Try name match
    const normMfr = normalize(apiMfr);
    const normName = normalize(apiName);
    const byName = localByNameNorm.get(normMfr) || localByNameNorm.get(normName) ||
      localByNameEn.get(apiMfr.toLowerCase()) || localByNameEn.get(apiName.toLowerCase());

    if (byName) {
      if (!matchedLocalIds.has(byName.id)) {
        matchedByName.push({ apiId, apiMfr, apiName, local: byName });
        matchedLocalIds.add(byName.id);
        // Check if IDs differ
        if (byName.atlas_id && byName.atlas_id !== apiId) {
          idMismatch.push({
            apiId,
            localAtlasId: byName.atlas_id,
            apiMfr,
            localName: byName.name_display,
          });
        }
      }
      continue;
    }

    // No match
    apiOnly.push({ apiId, apiMfr, apiName });
  }

  // Local-only (not matched to any API partner)
  const localOnly = localMfrs.filter((m) => !matchedLocalIds.has(m.id));

  // ─── Report ──────────────────────────────────────────

  const totalApiMatched = matchedById.length + matchedByName.length;
  const matchRate = ((matchedById.length / apiPartners.length) * 100).toFixed(1);

  console.log('═══════════════════════════════════════════════════');
  console.log('  ATLAS API ↔ SUPABASE ID MAPPING REPORT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Matched by atlas_id:   ${matchedById.length} (${matchRate}%)`);
  console.log(`  Matched by name only:  ${matchedByName.length}`);
  console.log(`  Total matched:         ${totalApiMatched} / ${apiPartners.length} API partners`);
  console.log(`  API-only (no local):   ${apiOnly.length}`);
  console.log(`  Local-only (no API):   ${localOnly.length}`);
  if (idMismatch.length > 0) {
    console.log(`  ID MISMATCHES:         ${idMismatch.length} ⚠️`);
  }
  console.log('═══════════════════════════════════════════════════\n');

  if (matchedById.length / apiPartners.length > 0.8) {
    console.log('✅ ID match rate is good (>80%). Safe to use atlas_id as join key.\n');
  } else if (totalApiMatched / apiPartners.length > 0.8) {
    console.log('⚠️  ID match is low but name matching brings it up. Consider storing atlas_api_id.\n');
  } else {
    console.log('❌ Match rate is poor. Need to investigate before building sync.\n');
  }

  // Verbose details
  if (verbose) {
    if (matchedByName.length > 0) {
      console.log('── Matched by NAME (not ID) ──────────────────────');
      for (const m of matchedByName) {
        console.log(`  API id=${m.apiId} mfr="${m.apiMfr}" → local atlas_id=${m.local.atlas_id} name="${m.local.name_display}"`);
      }
      console.log();
    }

    if (idMismatch.length > 0) {
      console.log('── ID MISMATCHES ─────────────────────────────────');
      for (const m of idMismatch) {
        console.log(`  API id=${m.apiId} vs local atlas_id=${m.localAtlasId} — "${m.apiMfr}" / "${m.localName}"`);
      }
      console.log();
    }

    if (apiOnly.length > 0) {
      console.log('── API-only (no local match) ─────────────────────');
      for (const m of apiOnly) {
        console.log(`  id=${m.apiId} mfr="${m.apiMfr}" name="${m.apiName}"`);
      }
      console.log();
    }

    if (localOnly.length > 0) {
      console.log(`── Local-only (${localOnly.length} manufacturers, no API match) ──`);
      for (const m of localOnly.slice(0, 30)) {
        console.log(`  atlas_id=${m.atlas_id} name="${m.name_display}" slug=${m.slug}`);
      }
      if (localOnly.length > 30) {
        console.log(`  ... and ${localOnly.length - 30} more`);
      }
      console.log();
    }
  }

  // Sample API data shape
  if (apiPartners.length > 0) {
    console.log('── Sample API partner object ─────────────────────');
    console.log(JSON.stringify(apiPartners[0], null, 2));
    console.log();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
