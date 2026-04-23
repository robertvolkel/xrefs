#!/usr/bin/env node

/**
 * Manufacturer Companies + Aliases Import (Western MFR graph)
 *
 * Ingests the company-identity graph into Supabase. Two input xlsx files:
 *   1) companies:    uid, name, source_url, company_status_code, parent_company_id
 *   2) aliases:      content_id (→ companies.uid), value, context_code
 *
 * FK-safe order: companies first, then aliases. Orphan handling:
 *   - Aliases whose content_id isn't in the companies set → dropped (audit log).
 *   - Companies whose parent_company_id isn't in the companies set → parent set NULL.
 *
 * Usage:
 *   node scripts/manufacturer-companies-import.mjs \
 *     "data/UID, name, source_URL, company_status_code, parent_company_ID.xlsx" \
 *     "data/content_id, value, context_code.xlsx" \
 *     [--dry-run] [--verbose] [--truncate]
 *
 * Options:
 *   --dry-run   Parse and report but don't write to Supabase.
 *   --verbose   Per-row logging.
 *   --truncate  Wipe both tables before inserting (clean reimport).
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
    // .env.local not found — fine for --dry-run
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Parse CLI args ───────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const truncate = args.includes('--truncate');
const positional = args.filter(a => !a.startsWith('--'));

const DEFAULT_COMPANIES = 'data/UID, name, source_URL, company_status_code, parent_company_ID.xlsx';
const DEFAULT_ALIASES = 'data/content_id, value, context_code.xlsx';

const companiesPath = positional[0] || DEFAULT_COMPANIES;
const aliasesPath = positional[1] || DEFAULT_ALIASES;

// ─── Helpers ─────────────────────────────────────────────

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// Accept a handful of permissive context spellings produced by upstream quirks.
// The expected values are listed; anything unusual we still persist (TEXT col).
const EXPECTED_CONTEXTS = new Set([
  'also_known_as', 'brand_of', 'acquired_by', 'formerly_known_as', 'short_name',
  'division_of', 'previous_name_value', 'acronym', 'parent_of', 'merged_into',
  'trademark_of', 'product_family', 'abbreviation', 'mis-spelling',
  'nickname', 'phoenetic',
]);

// ─── Read the two xlsx files ─────────────────────────────

console.log(`\nCompanies: ${companiesPath}`);
console.log(`Aliases:   ${aliasesPath}\n`);

function readSheet(path) {
  const absolutePath = resolve(process.cwd(), path);
  const workbook = XLSX.readFile(absolutePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  // defval: null is critical. Without it, columns whose first row is null
  // get silently dropped from the JSON output — we discovered this the hard
  // way during exploration (thought company_status_code was missing when it
  // was just null in row 1).
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

const companyRows = readSheet(companiesPath);
const aliasRows = readSheet(aliasesPath);

console.log(`Parsed ${companyRows.length} company rows, ${aliasRows.length} alias rows.`);

// ─── Transform companies ─────────────────────────────────

const companies = [];
const companyByUid = new Map(); // uid → { name, status, parent }
const slugsSeen = new Map();    // slug → uid (for collision dedup)

for (const row of companyRows) {
  const uid = Number(row.uid);
  if (!Number.isFinite(uid)) {
    if (verbose) console.warn(`  SKIP company: invalid uid: ${JSON.stringify(row)}`);
    continue;
  }
  const name = (row.name ?? '').toString().trim();
  if (!name) {
    if (verbose) console.warn(`  SKIP company: missing name uid=${uid}`);
    continue;
  }
  const sourceUrl = row.source_url ? row.source_url.toString().trim() || null : null;
  const status = row.company_status_code ? row.company_status_code.toString().trim() || null : null;
  const parentRaw = row.parent_company_id;
  // Guard against Number(null) === 0 and Number(undefined) === NaN.
  const parentUid =
    parentRaw !== null && parentRaw !== undefined && parentRaw !== '' && Number.isFinite(Number(parentRaw))
      ? Number(parentRaw)
      : null;

  // Slug: name → slugify. Collision → suffix with uid.
  let slug = slugify(name);
  if (!slug) slug = `company-${uid}`;
  if (slugsSeen.has(slug) && slugsSeen.get(slug) !== uid) {
    slug = `${slug}-${uid}`;
  }
  slugsSeen.set(slug, uid);

  companies.push({ uid, name, source_url: sourceUrl, status, parent_uid: parentUid, slug });
  companyByUid.set(uid, { name, status, parent_uid: parentUid });
}

// ─── Repair orphan parent pointers ──────────────────────

let orphanParents = 0;
for (const c of companies) {
  if (c.parent_uid !== null && c.parent_uid !== c.uid && !companyByUid.has(c.parent_uid)) {
    if (verbose) console.warn(`  ORPHAN parent: uid=${c.uid} "${c.name}" parent_uid=${c.parent_uid} (not found); setting NULL`);
    c.parent_uid = null;
    orphanParents++;
  }
}

// ─── Transform aliases ───────────────────────────────────

const aliases = [];
let orphanAliases = 0;
const unexpectedContexts = new Map(); // context → count

for (const row of aliasRows) {
  const companyUid = Number(row.content_id);
  if (!Number.isFinite(companyUid)) {
    if (verbose) console.warn(`  SKIP alias: invalid content_id: ${JSON.stringify(row)}`);
    continue;
  }
  const value = (row.value ?? '').toString().trim();
  if (!value) {
    if (verbose) console.warn(`  SKIP alias: empty value, content_id=${companyUid}`);
    continue;
  }
  const context = (row.context_code ?? '').toString().trim();
  if (!context) {
    if (verbose) console.warn(`  SKIP alias: empty context, content_id=${companyUid}`);
    continue;
  }
  if (!companyByUid.has(companyUid)) {
    if (verbose) console.warn(`  ORPHAN alias: content_id=${companyUid} not in companies; dropping "${value}"`);
    orphanAliases++;
    continue;
  }
  if (!EXPECTED_CONTEXTS.has(context)) {
    unexpectedContexts.set(context, (unexpectedContexts.get(context) || 0) + 1);
  }
  aliases.push({ company_uid: companyUid, value, context });
}

// ─── Summary ─────────────────────────────────────────────

console.log(`\nParsed: ${companies.length} companies, ${aliases.length} aliases.`);
console.log(`Orphan parent pointers nulled: ${orphanParents}`);
console.log(`Orphan alias rows dropped:     ${orphanAliases}`);
if (unexpectedContexts.size > 0) {
  console.log(`Unexpected context codes (kept, TEXT column):`);
  for (const [ctx, count] of [...unexpectedContexts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ctx}: ${count}`);
  }
}

// Status distribution for sanity.
const statusCounts = {};
for (const c of companies) {
  const s = c.status ?? '(null)';
  statusCounts[s] = (statusCounts[s] || 0) + 1;
}
console.log(`\nCompany status distribution:`);
for (const [s, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s}: ${count}`);
}

// ─── Dry run exit ────────────────────────────────────────

if (dryRun) {
  console.log('\n--dry-run: no database writes.');
  console.log('\nSample companies:');
  for (const c of companies.slice(0, 5)) {
    console.log(`  uid=${c.uid} "${c.name}" status=${c.status ?? 'null'} parent=${c.parent_uid ?? 'self'} slug="${c.slug}"`);
  }
  console.log('\nSample aliases:');
  for (const a of aliases.slice(0, 5)) {
    console.log(`  content_id=${a.company_uid} "${a.value}" [${a.context}]`);
  }
  process.exit(0);
}

// ─── Database writes ─────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

if (truncate) {
  console.log('\n--truncate: wiping manufacturer_aliases then manufacturer_companies...');
  const { error: e1 } = await supabase.from('manufacturer_aliases').delete().gte('id', 0);
  if (e1) { console.error('Failed to truncate aliases:', e1.message); process.exit(1); }
  const { error: e2 } = await supabase.from('manufacturer_companies').delete().gte('uid', 0);
  if (e2) { console.error('Failed to truncate companies:', e2.message); process.exit(1); }
  console.log('  ✓ both tables empty');
}

// Single-pass upsert — parent_uid is NOT a formal FK in the schema, so child
// rows can land before their parent within a batch without constraint error.
// (Initial version used two passes to dodge a self-ref FK concern that turned
// out not to apply; the two-pass approach also hit a NOT NULL trap on `name`
// because Postgres ON CONFLICT evaluates the INSERT attempt first.)
console.log('\nUpserting manufacturer_companies...');

const BATCH_SIZE = 500;
let companiesInserted = 0;

for (let i = 0; i < companies.length; i += BATCH_SIZE) {
  const batch = companies.slice(i, i + BATCH_SIZE);
  const { error } = await supabase
    .from('manufacturer_companies')
    .upsert(batch, { onConflict: 'uid' });
  if (error) {
    console.error(`  Batch ${i}..${i + batch.length - 1} failed:`, error.message);
    process.exit(1);
  }
  companiesInserted += batch.length;
  if (verbose || companiesInserted % 2500 === 0) {
    console.log(`  ${companiesInserted}/${companies.length}`);
  }
}

console.log(`  ✓ ${companiesInserted} companies upserted`);

// Aliases.
console.log('\nInserting manufacturer_aliases...');

let aliasesInserted = 0;

for (let i = 0; i < aliases.length; i += BATCH_SIZE) {
  const batch = aliases.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from('manufacturer_aliases').insert(batch);
  if (error) {
    console.error(`  Batch ${i}..${i + batch.length - 1} failed:`, error.message);
    process.exit(1);
  }
  aliasesInserted += batch.length;
  if (verbose || aliasesInserted % 2500 === 0) {
    console.log(`  ${aliasesInserted}/${aliases.length}`);
  }
}

console.log(`  ✓ ${aliasesInserted} aliases inserted`);

console.log('\nDone.');
