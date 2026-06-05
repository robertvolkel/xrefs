#!/usr/bin/env node
/**
 * atlas-dedupe-manufacturers.mjs
 *
 * Collapses TRUE-duplicate atlas_manufacturers rows — pairs (or groups) that
 * share BOTH name_en AND name_zh, i.e. the same real company imported twice.
 * These arose from a second import that deduped on atlas_id instead of name,
 * producing a bare "shadow" row (truncated slug, small atlas_id, no aliases)
 * alongside the original.
 *
 * It does NOT touch English-name COLLISIONS (same name_en, different name_zh) —
 * those are genuinely different companies and are left alone.
 *
 * Safety model (verified June 2026):
 *   - No table has a FK to atlas_manufacturers, so deleting a row cascades nothing.
 *   - atlas_products / atlas_product_flags / atlas_manufacturer_settings key on
 *     the manufacturer NAME (shared by both rows in a pair) → unaffected.
 *   - manufacturer_cross_references keys on manufacturer_SLUG (row-specific) →
 *     the ONE thing we migrate: any cross-refs on a shadow slug are re-pointed
 *     to the keeper slug before the shadow is deleted.
 *   - Keeper = the richer row (aliases / partsio link / longer descriptive slug).
 *     A tie aborts that group (manual review) rather than guessing.
 *
 * Usage:
 *   node scripts/atlas-dedupe-manufacturers.mjs            # DRY-RUN (default, no writes)
 *   node scripts/atlas-dedupe-manufacturers.mjs --apply    # migrate xrefs + snapshot + delete
 *   node scripts/atlas-dedupe-manufacturers.mjs --verbose  # extra detail
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  } catch {}
}
loadEnv();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(url, key);

// ── Fetch all manufacturer rows ──────────────────────────────
async function allMfrs() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('atlas_manufacturers')
      .select('id, slug, name_en, name_zh, name_display, aliases, atlas_id, partsio_id, partsio_name, enabled, updated_at')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Keeper score: higher = richer record = keep.
function richness(m) {
  const aliasCount = Array.isArray(m.aliases) ? m.aliases.length : 0;
  return aliasCount * 100 + (m.partsio_id ? 50 : 0) + (m.slug ? m.slug.length : 0);
}

const dupKey = (m) => `${(m.name_en || '').trim().toLowerCase()}|${(m.name_zh || '').trim()}`;

function fmt(m) {
  const a = Array.isArray(m.aliases) ? m.aliases.length : 0;
  return `id=${m.id} slug=${m.slug} atlas_id=${m.atlas_id} aliases=${a}${m.partsio_id ? ' partsio=' + m.partsio_id : ''} score=${richness(m)}`;
}

const mfrs = await allMfrs();
console.log(`Loaded ${mfrs.length} atlas_manufacturers rows.\n`);

// Group by (name_en + name_zh); keep only true-dup groups.
const groups = new Map();
for (const m of mfrs) {
  const k = dupKey(m);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(m);
}
const dupGroups = [...groups.values()].filter((g) => g.length > 1);

if (dupGroups.length === 0) {
  console.log('No true-duplicate groups found. Nothing to do.');
  process.exit(0);
}

// Decide keeper / shadows per group; flag ties for manual review.
const plans = [];      // { keeper, shadows: [...] }
const reviewGroups = []; // ties
for (const g of dupGroups) {
  const sorted = [...g].sort((a, b) => richness(b) - richness(a));
  const top = richness(sorted[0]);
  const tied = sorted.filter((m) => richness(m) === top);
  if (tied.length > 1) {
    reviewGroups.push(g);
    continue;
  }
  plans.push({ keeper: sorted[0], shadows: sorted.slice(1) });
}

// ── Reference scan: cross-refs on shadow slugs ───────────────
const shadowSlugs = plans.flatMap((p) => p.shadows.map((s) => s.slug)).filter(Boolean);
const xrefBySlug = new Map();
if (shadowSlugs.length > 0) {
  const { data, error } = await sb
    .from('manufacturer_cross_references')
    .select('id, manufacturer_slug, is_active')
    .in('manufacturer_slug', shadowSlugs);
  if (error) throw error;
  for (const r of data ?? []) {
    if (!xrefBySlug.has(r.manufacturer_slug)) xrefBySlug.set(r.manufacturer_slug, []);
    xrefBySlug.get(r.manufacturer_slug).push(r);
  }
}

// ── Report ───────────────────────────────────────────────────
console.log(`=== ${plans.length} duplicate group(s) to collapse ===\n`);
let totalShadows = 0;
let totalXrefMigrations = 0;
for (const p of plans) {
  console.log(`"${p.keeper.name_en}" / "${p.keeper.name_zh || ''}"`);
  console.log(`   KEEP   ${fmt(p.keeper)}`);
  for (const s of p.shadows) {
    totalShadows++;
    const xrefs = xrefBySlug.get(s.slug) ?? [];
    const activeXrefs = xrefs.filter((x) => x.is_active).length;
    totalXrefMigrations += xrefs.length;
    const note = xrefs.length > 0
      ? `  ⚠ ${xrefs.length} cross-ref(s) (${activeXrefs} active) on slug "${s.slug}" → migrate to "${p.keeper.slug}"`
      : '  (no cross-refs)';
    console.log(`   DELETE ${fmt(s)}${note}`);
  }
  console.log('');
}

if (reviewGroups.length > 0) {
  console.log(`=== ${reviewGroups.length} group(s) need MANUAL REVIEW (tie on richness — won't auto-pick) ===`);
  for (const g of reviewGroups) {
    console.log(`"${g[0].name_en}" / "${g[0].name_zh || ''}"`);
    for (const m of g) console.log(`   ${fmt(m)}`);
    console.log('');
  }
}

console.log('─────────────────────────────────────────');
console.log(`Groups to collapse:      ${plans.length}`);
console.log(`Shadow rows to delete:   ${totalShadows}`);
console.log(`Cross-refs to migrate:   ${totalXrefMigrations}`);
console.log(`Groups needing review:   ${reviewGroups.length}`);
console.log('─────────────────────────────────────────\n');

if (!APPLY) {
  console.log('DRY-RUN — no changes made. Re-run with --apply to execute.');
  process.exit(0);
}

// ── APPLY ────────────────────────────────────────────────────
console.log('APPLY MODE — executing...\n');

// 1. Snapshot every shadow row (for reversibility) before any deletion.
const snapshot = {
  generatedAt: new Date().toISOString(),
  deletedShadows: plans.flatMap((p) =>
    p.shadows.map((s) => ({ keeperSlug: p.keeper.slug, keeperId: p.keeper.id, row: s }))
  ),
};
const snapPath = resolve(process.cwd(), `atlas-dedupe-snapshot-${Date.now()}.json`);
writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
console.log(`Snapshot written: ${snapPath}\n`);

for (const p of plans) {
  for (const s of p.shadows) {
    // 1a. Migrate cross-refs (slug re-point) BEFORE deleting the row.
    const xrefs = xrefBySlug.get(s.slug) ?? [];
    if (xrefs.length > 0) {
      const { error } = await sb
        .from('manufacturer_cross_references')
        .update({ manufacturer_slug: p.keeper.slug })
        .eq('manufacturer_slug', s.slug);
      if (error) throw new Error(`xref migrate failed for ${s.slug}: ${error.message}`);
      console.log(`  migrated ${xrefs.length} cross-ref(s): ${s.slug} → ${p.keeper.slug}`);
    }

    // 1b. Union any shadow aliases the keeper lacks (usually none).
    const shadowAliases = Array.isArray(s.aliases) ? s.aliases : [];
    if (shadowAliases.length > 0) {
      const keeperAliases = Array.isArray(p.keeper.aliases) ? p.keeper.aliases : [];
      const merged = Array.from(new Set([...keeperAliases, ...shadowAliases]));
      if (merged.length !== keeperAliases.length) {
        const { error } = await sb.from('atlas_manufacturers').update({ aliases: merged }).eq('id', p.keeper.id);
        if (error) throw new Error(`alias merge failed for keeper ${p.keeper.slug}: ${error.message}`);
        p.keeper.aliases = merged;
        console.log(`  merged ${merged.length - keeperAliases.length} alias(es) into ${p.keeper.slug}`);
      }
    }

    // 1c. Delete the shadow row.
    const { error } = await sb.from('atlas_manufacturers').delete().eq('id', s.id);
    if (error) throw new Error(`delete failed for id=${s.id} (${s.slug}): ${error.message}`);
    console.log(`  deleted shadow: ${s.slug} (id=${s.id}, atlas_id=${s.atlas_id})`);
  }
}

console.log(`\nDone. Removed ${totalShadows} shadow row(s) across ${plans.length} group(s).`);
console.log('Click "Refresh" on the admin MFRs page to rebuild the cached list.');
