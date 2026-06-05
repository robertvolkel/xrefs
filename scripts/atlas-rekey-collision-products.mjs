#!/usr/bin/env node
/**
 * atlas-rekey-collision-products.mjs
 *
 * Fixes the manufacturer-collision mis-attribution (Decision #225 follow-up).
 *
 * Some Chinese manufacturers share a short English code (HX = 红星 / 恒佳兴;
 * LX = 灵星芯微 / 连欣科技). The ingest's cleanManufacturerName() strips the
 * Chinese part of "HX 红星" down to the ambiguous "HX", so products from two
 * different companies all land under one string — and the admin MFRs page
 * (which folds product counts across name_en) credits BOTH companies with the
 * full pile.
 *
 * The fix is deterministic: every product carries `atlas_source_file`, and the
 * source file's `manufacturer.name` is the FULL unique identity (= the matching
 * atlas_manufacturers.name_display). We re-key each colliding product's
 * `manufacturer` string from the bare code to that full name, so the page
 * attributes it to exactly one company.
 *
 * This is the interim "bridge" fix. The durable fix is a manufacturer_atlas_id
 * FK on atlas_products (Decision #225 Steps 2–3, BACKLOG) — once aggregation
 * joins on the ID, the manufacturer string no longer matters. This re-key is
 * forward-compatible (that backfill keys off atlas_source_file, not the string).
 *
 * Usage:
 *   node scripts/atlas-rekey-collision-products.mjs           # DRY-RUN (default)
 *   node scripts/atlas-rekey-collision-products.mjs --apply   # snapshot + update
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
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

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Find colliding English codes: name_en shared by >1 manufacturer row.
async function allMfrs() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('atlas_manufacturers').select('name_en, name_zh, name_display, atlas_id').range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const mfrs = await allMfrs();
const byEn = new Map();
for (const m of mfrs) {
  const k = (m.name_en || '').trim().toLowerCase();
  if (!k) continue;
  if (!byEn.has(k)) byEn.set(k, []);
  byEn.get(k).push(m);
}
const collidingCodes = [...byEn.entries()].filter(([, g]) => g.length > 1).map(([, g]) => g[0].name_en);
const validNameDisplays = new Set(mfrs.map((m) => m.name_display));
console.log(`Colliding English codes (${collidingCodes.length}): ${collidingCodes.join(', ')}\n`);

// 2. For products under a colliding code, group by (manufacturer, atlas_source_file).
const pairs = new Map(); // `${code}␟${file}` → count
for (const code of collidingCodes) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('atlas_products').select('atlas_source_file').eq('manufacturer', code).range(from, from + 999);
    if (error) throw error;
    for (const r of data) {
      const key = `${code}␟${r.atlas_source_file || '(null)'}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    if (data.length < 1000) break;
  }
}

if (pairs.size === 0) {
  console.log('No products found under any colliding code. Nothing to re-key.');
  process.exit(0);
}

// 3. Resolve each source file → its full manufacturer name (the re-key target).
function targetFromSourceFile(file) {
  const path = resolve(process.cwd(), 'data/atlas', file);
  if (!existsSync(path)) return null;
  try {
    const j = JSON.parse(readFileSync(path, 'utf-8'));
    return j?.manufacturer?.name?.trim() || null;
  } catch {
    return null;
  }
}

console.log('=== Re-key plan ===\n');
const plan = [];
let totalRows = 0;
for (const [key, count] of pairs.entries()) {
  const [code, file] = key.split('␟');
  totalRows += count;
  const target = file === '(null)' ? null : targetFromSourceFile(file);
  const valid = target && validNameDisplays.has(target);
  const status = !target ? '⚠ NO SOURCE FILE / name — SKIP'
    : !valid ? `⚠ target "${target}" not a known name_display — SKIP`
    : `→ "${target}"`;
  console.log(`  "${code}"  ×${count}  from ${file}`);
  console.log(`        ${status}`);
  if (valid) plan.push({ code, file, target, count });
}
const willRekey = plan.reduce((s, p) => s + p.count, 0);
console.log(`\n─────────────────────────────────────────`);
console.log(`Colliding products total:   ${totalRows}`);
console.log(`Will re-key:                ${willRekey} (${plan.length} group(s))`);
console.log(`Skipped (no/invalid target): ${totalRows - willRekey}`);
console.log(`─────────────────────────────────────────\n`);

if (!APPLY) {
  console.log('DRY-RUN — no changes. Re-run with --apply to execute.');
  process.exit(0);
}

if (plan.length === 0) {
  console.log('Nothing safe to re-key. Exiting.');
  process.exit(0);
}

// 4. Snapshot, then UPDATE per (manufacturer, atlas_source_file).
const snap = {
  generatedAt: new Date().toISOString(),
  rekeys: plan.map((p) => ({ from: p.code, to: p.target, sourceFile: p.file, count: p.count })),
};
const snapPath = resolve(process.cwd(), `atlas-rekey-snapshot-${Date.now()}.json`);
writeFileSync(snapPath, JSON.stringify(snap, null, 2));
console.log(`Snapshot written: ${snapPath}\n`);

for (const p of plan) {
  const { error, count } = await sb
    .from('atlas_products')
    .update({ manufacturer: p.target }, { count: 'exact' })
    .eq('manufacturer', p.code)
    .eq('atlas_source_file', p.file);
  if (error) throw new Error(`re-key failed for ${p.code} / ${p.file}: ${error.message}`);
  console.log(`  re-keyed ${count ?? p.count} rows: "${p.code}" → "${p.target}" (${p.file})`);
}

console.log(`\nDone. Re-keyed ${willRekey} product(s). Click "Refresh" on the admin MFRs page.`);
