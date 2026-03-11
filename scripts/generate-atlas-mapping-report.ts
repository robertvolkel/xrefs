#!/usr/bin/env npx tsx

/**
 * Atlas Manufacturer Attribute Mapping Report Generator
 *
 * For each top Atlas manufacturer and their part families, generates a
 * markdown report showing:
 *   - Raw attribute names → mapped internal attributeId → logic rule coverage
 *   - Unmapped raw attributes (potential dictionary gaps)
 *   - Missing logic table rules (no Atlas data)
 *
 * Usage:
 *   npx tsx scripts/generate-atlas-mapping-report.ts
 *
 * Output:
 *   docs/atlas-mapping-report.md
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logicTableRegistry } from '../lib/logicTables/index';
import {
  getAtlasParamDictionary,
  getSharedParamDictionary,
  getSkipParams,
} from '../lib/services/atlasMapper';
import type { MatchingRule } from '../lib/types';

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
    console.error('Could not read .env.local');
    process.exit(1);
  }
}

// ─── Types ────────────────────────────────────────────────

interface RawParamStat {
  rawName: string;
  count: number;
  samples: string[];
  mappedAttributeId: string | null;
  mappedAttributeName: string | null;
  rule: MatchingRule | null;
}

interface FamilyReport {
  familyId: string;
  familyName: string;
  totalProducts: number;
  sampledCount: number;
  mapped: RawParamStat[];      // has dictionary entry
  unmapped: RawParamStat[];    // no dictionary entry, not skipped
  missingRules: MatchingRule[]; // logic rules with no Atlas coverage
}

interface MfrReport {
  manufacturer: string;
  totalProducts: number;
  families: FamilyReport[];
}

// ─── Top 10 MFRs ─────────────────────────────────────────

const MFR_FAMILIES: Record<string, string[]> = {
  'Sinopower':    ['B5'],
  'YENJI':        ['B4', '66', 'B1', 'B3', 'B5'],
  'Convert':      ['B5', 'C2', 'B7', 'B1', 'C1', 'C5'],
  'YJYCOIN':      ['71', '70'],
  'CREATEK':      ['B4', 'B1', 'B7', 'B3', 'B6', '66', 'B5', '65'],
  'CYNTEC':       ['52', '71', 'C2'],
  '3PEAK':        ['C4', 'C7', 'C1', 'C2', 'C3', 'C5', 'C9', 'C6', 'C10'],
  'TECH PUBLIC':  ['B4', 'B5', 'C1', 'B1', 'C5', 'C2', 'C4', 'C7'],
  'AISHI':        ['58', '60'],
  'MingDa':       ['C1', 'C2', 'C4'],
};

// ─── Family name lookup ───────────────────────────────────

function getFamilyName(familyId: string): string {
  const lt = logicTableRegistry[familyId];
  return lt ? lt.familyName : familyId;
}

// ─── Fetch products for one MFR+family combo ─────────────

async function fetchCombo(
  supabase: SupabaseClient,
  manufacturer: string,
  familyId: string,
): Promise<{ products: Array<{ mpn: string; atlas_raw: any; parameters: any }>; totalCount: number }> {
  const { data, count, error } = await supabase
    .from('atlas_products')
    .select('mpn, atlas_raw, parameters', { count: 'exact' })
    .eq('manufacturer', manufacturer)
    .eq('family_id', familyId)
    .limit(100);

  if (error) {
    console.error(`  Error fetching ${manufacturer}/${familyId}:`, error.message);
    return { products: [], totalCount: 0 };
  }

  return { products: data ?? [], totalCount: count ?? 0 };
}

// ─── Analyze one MFR+family combo ─────────────────────────

function analyzeCombo(
  products: Array<{ mpn: string; atlas_raw: any; parameters: any }>,
  totalCount: number,
  familyId: string,
): FamilyReport {
  const familyDict = getAtlasParamDictionary(familyId) ?? {};
  const sharedDict = getSharedParamDictionary();
  const skipSet = getSkipParams();
  const logicTable = logicTableRegistry[familyId];
  const rules = logicTable?.rules ?? [];

  // Build a lookup: attributeId → rule
  const ruleMap = new Map<string, MatchingRule>();
  for (const rule of rules) {
    ruleMap.set(rule.attributeId, rule);
  }

  // Collect raw param stats
  const statsMap = new Map<string, RawParamStat>();
  const mappedAttributeIds = new Set<string>();

  for (const product of products) {
    const rawParams: Array<{ name: string; value: string }> = product.atlas_raw?.parameters ?? [];

    for (const { name, value } of rawParams) {
      const trimmedName = name.trim();
      const lowerName = trimmedName.toLowerCase();

      // Check skip list
      if (skipSet.has(trimmedName) || skipSet.has(lowerName)) continue;
      // Skip empty/placeholder values
      if (!value || value === '-' || value === '/' || value === 'N/A' || value === 'n/a') continue;

      // Look up dictionary mapping
      const mapping = familyDict[lowerName] ?? sharedDict[lowerName];

      const key = trimmedName; // preserve original casing for display
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          rawName: trimmedName,
          count: 0,
          samples: [],
          mappedAttributeId: mapping?.attributeId ?? null,
          mappedAttributeName: mapping?.attributeName ?? null,
          rule: mapping ? (ruleMap.get(mapping.attributeId) ?? null) : null,
        });
      }

      const stat = statsMap.get(key)!;
      stat.count++;
      if (stat.samples.length < 2 && !stat.samples.includes(value)) {
        stat.samples.push(value.length > 50 ? value.slice(0, 47) + '...' : value);
      }

      if (mapping) {
        mappedAttributeIds.add(mapping.attributeId);
      }
    }

    // Also track attributeIds from the mapped parameters column
    for (const attrId of Object.keys(product.parameters ?? {})) {
      mappedAttributeIds.add(attrId);
    }
  }

  // Classify stats into mapped vs unmapped
  const mapped: RawParamStat[] = [];
  const unmapped: RawParamStat[] = [];

  for (const stat of statsMap.values()) {
    if (stat.mappedAttributeId) {
      mapped.push(stat);
    } else {
      unmapped.push(stat);
    }
  }

  // Sort mapped by rule weight descending, then by count
  mapped.sort((a, b) => {
    const wa = a.rule?.weight ?? -1;
    const wb = b.rule?.weight ?? -1;
    if (wb !== wa) return wb - wa;
    return b.count - a.count;
  });

  // Sort unmapped by count descending
  unmapped.sort((a, b) => b.count - a.count);

  // Find missing rules (rules with no Atlas coverage)
  const missingRules = rules.filter(r => !mappedAttributeIds.has(r.attributeId));
  missingRules.sort((a, b) => b.weight - a.weight);

  return {
    familyId,
    familyName: getFamilyName(familyId),
    totalProducts: totalCount,
    sampledCount: products.length,
    mapped,
    unmapped,
    missingRules,
  };
}

// ─── Markdown generation ──────────────────────────────────

function pct(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

function escMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function generateFamilySection(report: FamilyReport): string {
  const lines: string[] = [];
  const logicTable = logicTableRegistry[report.familyId];
  const totalRules = logicTable?.rules.length ?? 0;
  const coveredRules = totalRules - report.missingRules.length;

  lines.push(`### ${report.familyId} — ${report.familyName} (${report.totalProducts.toLocaleString()} products, sampled ${report.sampledCount})`);
  lines.push('');
  lines.push(`**Coverage**: ${coveredRules} of ${totalRules} rules covered (${pct(coveredRules, totalRules)}) | ${report.mapped.length} raw params mapped | ${report.unmapped.length} unmapped | ${report.missingRules.length} rules missing`);
  lines.push('');

  // Mapped attributes table
  if (report.mapped.length > 0) {
    lines.push('#### Mapped Attributes');
    lines.push('');
    lines.push('| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |');
    lines.push('|----------------|-------------|--------|-----------|-----------|--------------|');
    for (const stat of report.mapped) {
      const weight = stat.rule ? String(stat.rule.weight) : '—';
      const ruleType = stat.rule ? formatRuleType(stat.rule) : '*(no rule)*';
      const freq = `${stat.count}/${report.sampledCount} (${pct(stat.count, report.sampledCount)})`;
      const sample = escMd(stat.samples.join(', '));
      lines.push(`| ${escMd(stat.rawName)} | \`${stat.mappedAttributeId}\` | ${weight} | ${ruleType} | ${freq} | ${sample} |`);
    }
    lines.push('');
  }

  // Unmapped raw attributes table
  if (report.unmapped.length > 0) {
    lines.push('#### Unmapped Raw Attributes');
    lines.push('');
    lines.push('| Raw Name (MFR) | Frequency | Sample Values |');
    lines.push('|----------------|-----------|---------------|');
    for (const stat of report.unmapped) {
      const freq = `${stat.count}/${report.sampledCount} (${pct(stat.count, report.sampledCount)})`;
      const sample = escMd(stat.samples.join(', '));
      lines.push(`| ${escMd(stat.rawName)} | ${freq} | ${sample} |`);
    }
    lines.push('');
  }

  // Missing logic table rules
  if (report.missingRules.length > 0) {
    lines.push('#### Missing Logic Table Rules');
    lines.push('');
    lines.push('| attributeId | Attribute Name | Weight | Type |');
    lines.push('|-------------|----------------|--------|------|');
    for (const rule of report.missingRules) {
      lines.push(`| \`${rule.attributeId}\` | ${rule.attributeName} | ${rule.weight} | ${formatRuleType(rule)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatRuleType(rule: MatchingRule): string {
  let s = rule.logicType;
  if (rule.logicType === 'threshold' && rule.thresholdDirection) {
    s += ` (${rule.thresholdDirection})`;
  }
  return s;
}

function generateMfrSection(report: MfrReport): string {
  const lines: string[] = [];
  const familyCount = report.families.length;

  lines.push(`## ${report.manufacturer}`);
  lines.push('');
  lines.push(`**${report.totalProducts.toLocaleString()} products** across ${familyCount} ${familyCount === 1 ? 'family' : 'families'}`);
  lines.push('');

  for (const family of report.families) {
    lines.push(generateFamilySection(family));
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function generateToc(reports: MfrReport[]): string {
  const lines: string[] = [];
  lines.push('## Table of Contents');
  lines.push('');
  for (const report of reports) {
    const anchor = report.manufacturer.toLowerCase().replace(/\s+/g, '-');
    const familyList = report.families.map(f => f.familyId).join(', ');
    lines.push(`- [${report.manufacturer}](#${anchor}) — ${report.totalProducts.toLocaleString()} products (${familyList})`);
  }
  lines.push('');
  return lines.join('\n');
}

function generateFullReport(reports: MfrReport[]): string {
  const lines: string[] = [];
  const now = new Date().toISOString().split('T')[0];

  lines.push('# Atlas Manufacturer Attribute Mapping Report');
  lines.push('');
  lines.push(`> Generated: ${now}`);
  lines.push('>');
  lines.push('> For each manufacturer + family, shows how their raw Atlas attribute names map');
  lines.push('> to our internal schema, which raw attributes have no dictionary entry, and which');
  lines.push('> of our logic table rules have no Atlas data coverage.');
  lines.push('');
  lines.push(generateToc(reports));
  lines.push('---');
  lines.push('');

  for (const report of reports) {
    lines.push(generateMfrSection(report));
  }

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const mfrNames = Object.keys(MFR_FAMILIES);
  const reports: MfrReport[] = [];

  console.log(`Generating Atlas mapping report for ${mfrNames.length} manufacturers...`);
  console.log('');

  for (const mfr of mfrNames) {
    const families = MFR_FAMILIES[mfr];
    console.log(`${mfr} (${families.length} families)...`);

    const familyReports: FamilyReport[] = [];
    let mfrTotal = 0;

    for (const familyId of families) {
      process.stdout.write(`  ${familyId} — ${getFamilyName(familyId)}... `);
      const { products, totalCount } = await fetchCombo(supabase, mfr, familyId);
      const familyReport = analyzeCombo(products, totalCount, familyId);
      familyReports.push(familyReport);
      mfrTotal += totalCount;

      const logicTable = logicTableRegistry[familyId];
      const totalRules = logicTable?.rules.length ?? 0;
      const coveredRules = totalRules - familyReport.missingRules.length;
      console.log(`${totalCount} products, ${coveredRules}/${totalRules} rules covered`);
    }

    reports.push({
      manufacturer: mfr,
      totalProducts: mfrTotal,
      families: familyReports,
    });
  }

  // Write report
  const outputPath = resolve(process.cwd(), 'docs/atlas-mapping-report.md');
  const content = generateFullReport(reports);
  writeFileSync(outputPath, content, 'utf-8');

  console.log('');
  console.log(`Report written to ${outputPath}`);
  console.log(`${content.split('\n').length} lines`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
