#!/usr/bin/env npx tsx

/**
 * Atlas Orphan-Canonical Audit (BACKLOG: Decision #192 follow-up)
 *
 * Finds engineer-accepted dictionary overrides where the chosen
 * `attribute_id` does NOT exist in the family's logic table. These
 * orphans don't fail at runtime — they produce display-only attributes
 * that silently don't participate in matching-engine scoring. Over time
 * they cause schema fragmentation (same physical concept mapped to 3+
 * different canonicals across families).
 *
 * Root cause (per Decision #192 spot-check, 85% precision found):
 *   When the family's schema lacks an exact canonical for a paramName,
 *   Sonnet picks something close-but-not-quite — a sibling attribute
 *   (B5 `vgs_th_max` vs canonical `vgs_th`), a related-but-distinct
 *   rule (family 69 `insulation_resistance` MΩ where schema only has
 *   `insulation_voltage` V), or a broadened L2 generic. Engineer
 *   accepts because the suggestion looks plausible.
 *
 * Usage:
 *   npx tsx scripts/atlas-audit-orphan-canonicals.ts                    # all L3 families
 *   npx tsx scripts/atlas-audit-orphan-canonicals.ts --family B5        # one family
 *   npx tsx scripts/atlas-audit-orphan-canonicals.ts --min-volume 5     # only orphans used N+ times
 *   npx tsx scripts/atlas-audit-orphan-canonicals.ts --json output.json # also write JSON
 *
 * Notes:
 *   - L2 category overrides (Decision #178, family_id = 'Microcontrollers'
 *     etc.) are SKIPPED — they don't have logic tables, so the
 *     "orphan vs canonical" concept doesn't apply.
 *   - Overrides with action='remove' (attribute_id is null) are SKIPPED.
 *   - Satellite attributes (leading underscore — `_iq_per_channel`) are
 *     flagged but tagged SATELLITE in output. By convention these are
 *     intentional display-only canonicals, so they're less urgent to
 *     route into the logic table.
 *
 * Read-only — does not modify any data.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { logicTableRegistry } from '../lib/logicTables';

// ─── env loading (mirrors other scripts) ─────────────────────
function loadEnv() {
  try {
    const c = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of c.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* .env.local not found */
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(URL, KEY);

// ─── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function argValue(flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const familyArg = argValue('--family');
const minVolumeArg = argValue('--min-volume');
const jsonArg = argValue('--json');
const minVolume = minVolumeArg ? parseInt(minVolumeArg, 10) : 1;

// ─── build family → attributeId set from logic tables ────────
function buildFamilyAttributeIndex(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [familyId, table] of Object.entries(logicTableRegistry)) {
    const attrs = new Set<string>();
    for (const rule of table.rules) {
      if (rule.attributeId) attrs.add(rule.attributeId);
    }
    out.set(familyId, attrs);
  }
  return out;
}

// ─── types ───────────────────────────────────────────────────
interface OverrideRow {
  id: string;
  family_id: string;
  param_name: string;
  attribute_id: string | null;
  attribute_name: string | null;
  created_at: string;
  created_by: string | null;
}

interface OrphanEntry {
  attributeId: string;
  attributeName: string | null;
  isSatellite: boolean;
  paramNames: string[]; // distinct paramNames using this orphan in this family
  rowCount: number;
}

interface FamilyReport {
  familyId: string;
  familyName: string;
  totalActiveOverrides: number;
  inLogicTableCount: number;
  orphanCount: number;
  orphansByAttr: OrphanEntry[]; // sorted by rowCount desc
}

// ─── main ────────────────────────────────────────────────────
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  Atlas Orphan-Canonical Audit                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const familyAttrIndex = buildFamilyAttributeIndex();
  console.log(`Indexed ${familyAttrIndex.size} L3 families from logicTableRegistry.\n`);

  // Fetch all active overrides (paginated).
  let allRows: OverrideRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = sb
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, attribute_id, attribute_name, created_at, created_by')
      .eq('is_active', true)
      .not('attribute_id', 'is', null)
      .range(from, from + pageSize - 1);
    if (familyArg) query = query.eq('family_id', familyArg);
    const { data, error } = await query;
    if (error) {
      console.error('Override fetch failed:', error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    allRows.push(...(data as OverrideRow[]));
    if (data.length < pageSize) break;
  }
  console.log(`Fetched ${allRows.length} active overrides with attribute_id.\n`);

  // Partition by family. Skip L2 category rows (not in logicTableRegistry).
  const byFamily = new Map<string, OverrideRow[]>();
  let skippedL2 = 0;
  for (const row of allRows) {
    if (!familyAttrIndex.has(row.family_id)) {
      skippedL2++;
      continue;
    }
    let bucket = byFamily.get(row.family_id);
    if (!bucket) {
      bucket = [];
      byFamily.set(row.family_id, bucket);
    }
    bucket.push(row);
  }
  if (skippedL2 > 0) {
    console.log(`Skipped ${skippedL2} L2-category overrides (no logic table — see Decision #178).\n`);
  }

  // Per-family analysis.
  const reports: FamilyReport[] = [];
  for (const [familyId, rows] of byFamily) {
    const validAttrs = familyAttrIndex.get(familyId) ?? new Set<string>();
    const table = logicTableRegistry[familyId];
    const familyName = table?.familyName ?? familyId;

    const orphanRowsByAttr = new Map<string, { name: string | null; paramNames: Set<string>; rowCount: number }>();
    let inLogicTableCount = 0;

    for (const row of rows) {
      const attrId = row.attribute_id!;
      if (validAttrs.has(attrId)) {
        inLogicTableCount++;
        continue;
      }
      let entry = orphanRowsByAttr.get(attrId);
      if (!entry) {
        entry = { name: row.attribute_name, paramNames: new Set<string>(), rowCount: 0 };
        orphanRowsByAttr.set(attrId, entry);
      }
      entry.paramNames.add(row.param_name);
      entry.rowCount++;
    }

    const orphansByAttr: OrphanEntry[] = [...orphanRowsByAttr.entries()]
      .map(([attrId, e]) => ({
        attributeId: attrId,
        attributeName: e.name,
        isSatellite: attrId.startsWith('_'),
        paramNames: [...e.paramNames].sort(),
        rowCount: e.rowCount,
      }))
      .filter((o) => o.rowCount >= minVolume)
      .sort((a, b) => b.rowCount - a.rowCount);

    reports.push({
      familyId,
      familyName,
      totalActiveOverrides: rows.length,
      inLogicTableCount,
      orphanCount: rows.length - inLogicTableCount,
      orphansByAttr,
    });
  }

  // Sort families: most orphan-volume first.
  reports.sort((a, b) => b.orphanCount - a.orphanCount);

  // ─── Console output ───
  let totalRows = 0;
  let totalOrphanRows = 0;
  let totalOrphanAttrs = 0;
  let totalSatelliteAttrs = 0;
  let totalRealOrphanAttrs = 0;

  for (const r of reports) {
    totalRows += r.totalActiveOverrides;
    totalOrphanRows += r.orphanCount;
  }

  for (const r of reports) {
    if (r.orphansByAttr.length === 0) continue;
    const pct = r.totalActiveOverrides > 0
      ? Math.round((r.orphanCount / r.totalActiveOverrides) * 100)
      : 0;
    console.log(`\n▸ ${r.familyId} ${r.familyName}`);
    console.log(`  ${r.orphanCount} orphan rows / ${r.totalActiveOverrides} total active (${pct}%)`);
    for (const o of r.orphansByAttr) {
      const tag = o.isSatellite ? ' [SATELLITE]' : '';
      const nameStr = o.attributeName ? ` "${o.attributeName}"` : '';
      console.log(`    • ${o.attributeId}${nameStr}${tag} — ${o.rowCount} row(s), ${o.paramNames.length} distinct paramName(s)`);
      for (const p of o.paramNames.slice(0, 5)) {
        console.log(`        - "${p}"`);
      }
      if (o.paramNames.length > 5) {
        console.log(`        … and ${o.paramNames.length - 5} more`);
      }
      totalOrphanAttrs++;
      if (o.isSatellite) totalSatelliteAttrs++;
      else totalRealOrphanAttrs++;
    }
  }

  console.log('\n═══ SUMMARY ═══');
  console.log(`  Families scanned:           ${reports.length}`);
  console.log(`  Families with orphans:      ${reports.filter((r) => r.orphansByAttr.length > 0).length}`);
  console.log(`  Total active overrides:     ${totalRows}`);
  console.log(`  Total orphan rows:          ${totalOrphanRows}${totalRows > 0 ? ` (${Math.round((totalOrphanRows / totalRows) * 100)}%)` : ''}`);
  console.log(`  Total orphan attributeIds:  ${totalOrphanAttrs}`);
  console.log(`    Real orphans:             ${totalRealOrphanAttrs} (need engineer decision)`);
  console.log(`    Satellite (leading _):    ${totalSatelliteAttrs} (intentional display-only, lower priority)`);
  if (minVolume > 1) {
    console.log(`  Filter:                     --min-volume ${minVolume}`);
  }
  console.log('');
  console.log('  Per-orphan decision options (per BACKLOG entry):');
  console.log('    (a) Re-route the override to an existing canonical in the logic table');
  console.log('    (b) Add a new rule to the logic table for this canonical');
  console.log('    (c) Leave as display-only (rename to satellite `_name` if appropriate)');
  console.log('');

  // ─── Optional JSON output ───
  if (jsonArg) {
    const { writeFileSync } = await import('fs');
    writeFileSync(jsonArg, JSON.stringify(reports, null, 2), 'utf-8');
    console.log(`  JSON written to ${jsonArg}\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
