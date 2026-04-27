#!/usr/bin/env npx tsx

/**
 * Mine recommendation_log JSONB snapshots for identity / identity_upgrade rule
 * fails where both source and candidate values are non-numeric strings — i.e.
 * suspect synonym pairs that the value-alias system (Decision #160) could fix.
 *
 * Usage:
 *   npx tsx scripts/mine-identity-fails.ts [options]
 *
 * Options:
 *   --since <iso>     Only consider logs created on/after this ISO date (default: all)
 *   --min-count <n>   Only emit pairs that occur >= n times (default: 1)
 *   --top <n>         Only emit top N pairs in CSV (default: all)
 *   --family <id>     Only consider logs for this family
 *
 * Output:
 *   scripts/mine-identity-fails-output.csv
 *   scripts/mine-identity-fails-output.json (full data)
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLogicTable } from '../lib/logicTables';
import type { MatchDetail, MatchingRule, XrefRecommendation } from '../lib/types';

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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── CLI options ──────────────────────────────────────────

interface CliOpts {
  since?: string;
  minCount: number;
  top?: number;
  family?: string;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const opts: CliOpts = { minCount: 1 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--since') opts.since = args[++i];
    else if (a === '--min-count') opts.minCount = parseInt(args[++i], 10);
    else if (a === '--top') opts.top = parseInt(args[++i], 10);
    else if (a === '--family') opts.family = args[++i];
  }
  return opts;
}

const opts = parseArgs();

// ─── Helpers ──────────────────────────────────────────────

/** Same normalize() the matching engine uses */
function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Common missing-data placeholders the engine treats as "no value" */
function isMissingValue(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  const upper = t.toUpperCase();
  return upper === 'N/A' || upper === '-' || upper === '--' || upper === 'NONE' || upper === 'NULL' || upper === 'UNKNOWN' || upper === '?';
}

/** Returns true if the string parses cleanly as a number (with optional SI prefix + unit) */
function isCleanNumeric(value: string): boolean {
  const trimmed = value.trim();
  // Match a leading signed decimal followed by an optional unit
  const m = trimmed.match(/^([-+]?\d*\.?\d+)\s*[a-zA-Zµ°%/Ω]*$/);
  return !!m && !isNaN(parseFloat(m[1]));
}

/** Build a deterministic key for a value pair, direction-insensitive */
function pairKey(a: string, b: string): string {
  const na = normalize(a);
  const nb = normalize(b);
  return na <= nb ? `${na}\u0001${nb}` : `${nb}\u0001${na}`;
}

/** Returns true if both values are members of the same group on the rule's existing valueAliases */
function alreadyAliased(rule: MatchingRule, a: string, b: string): boolean {
  if (!rule.valueAliases?.length) return false;
  const na = normalize(a);
  const nb = normalize(b);
  for (const group of rule.valueAliases) {
    let hasA = false;
    let hasB = false;
    for (const member of group) {
      const mn = normalize(member);
      if (mn === na) hasA = true;
      if (mn === nb) hasB = true;
      if (hasA && hasB) return true;
    }
  }
  return false;
}

// ─── Aggregator ───────────────────────────────────────────

interface PairStats {
  familyId: string;
  familyName: string;
  attributeId: string;
  attributeName: string;
  logicType: string;
  valueA: string; // canonical (normalized) lower-sorted of the pair
  valueB: string;
  rawA: string;   // first-seen raw form (for the CSV "value_a" column)
  rawB: string;
  failCount: number;
  sampleMpns: Set<string>;
}

const pairs = new Map<string, PairStats>();

let totalLogsScanned = 0;
let totalRecsScanned = 0;
let totalDetailsScanned = 0;
let totalFailsKept = 0;
let totalDroppedNumeric = 0;
let totalDroppedAlreadyAliased = 0;
let totalDroppedNoRule = 0;
let totalDroppedNotIdentity = 0;

interface LogRow {
  id: string;
  source_mpn: string;
  family_id: string | null;
  family_name: string | null;
  snapshot: { recommendations?: XrefRecommendation[] } | null;
  created_at: string;
}

// ─── Main scan ────────────────────────────────────────────

async function scan() {
  console.log('Mining recommendation_log for identity-rule fails…');
  if (opts.since) console.log(`  since: ${opts.since}`);
  if (opts.family) console.log(`  family: ${opts.family}`);

  const PAGE_SIZE = 500;
  let from = 0;

  while (true) {
    let q = supabase
      .from('recommendation_log')
      .select('id, source_mpn, family_id, family_name, snapshot, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (opts.since) q = q.gte('created_at', opts.since);
    if (opts.family) q = q.eq('family_id', opts.family);

    const { data, error } = await q;
    if (error) {
      console.error('Supabase error:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data as LogRow[]) {
      totalLogsScanned++;
      const familyId = row.family_id;
      if (!familyId) continue;

      const table = getLogicTable(familyId);
      if (!table) continue;

      // Build a quick map of attributeId → MatchingRule for this family
      const ruleMap = new Map<string, MatchingRule>();
      for (const rule of table.rules) ruleMap.set(rule.attributeId, rule);

      const recs = row.snapshot?.recommendations ?? [];
      for (const rec of recs) {
        totalRecsScanned++;
        if (!rec.matchDetails) continue;

        for (const detail of rec.matchDetails as MatchDetail[]) {
          totalDetailsScanned++;
          if (detail.ruleResult !== 'fail') continue;

          const rule = ruleMap.get(detail.parameterId);
          if (!rule) {
            totalDroppedNoRule++;
            continue;
          }
          if (rule.logicType !== 'identity' && rule.logicType !== 'identity_upgrade') {
            totalDroppedNotIdentity++;
            continue;
          }

          const sv = (detail.sourceValue ?? '').trim();
          const cv = (detail.replacementValue ?? '').trim();
          if (isMissingValue(sv) || isMissingValue(cv)) continue;
          if (normalize(sv) === normalize(cv)) continue; // shouldn't happen on a fail, but guard
          if (isCleanNumeric(sv) && isCleanNumeric(cv)) {
            totalDroppedNumeric++;
            continue;
          }
          if (alreadyAliased(rule, sv, cv)) {
            totalDroppedAlreadyAliased++;
            continue;
          }

          totalFailsKept++;

          const key = `${familyId}\u0002${detail.parameterId}\u0002${pairKey(sv, cv)}`;
          let entry = pairs.get(key);
          if (!entry) {
            const na = normalize(sv);
            const nb = normalize(cv);
            const aIsLeft = na <= nb;
            entry = {
              familyId,
              familyName: row.family_name ?? table.familyName,
              attributeId: detail.parameterId,
              attributeName: detail.parameterName,
              logicType: rule.logicType,
              valueA: aIsLeft ? na : nb,
              valueB: aIsLeft ? nb : na,
              rawA: aIsLeft ? sv : cv,
              rawB: aIsLeft ? cv : sv,
              failCount: 0,
              sampleMpns: new Set(),
            };
            pairs.set(key, entry);
          }
          entry.failCount++;
          if (entry.sampleMpns.size < 5 && row.source_mpn) {
            entry.sampleMpns.add(row.source_mpn);
          }
        }
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;

    if (totalLogsScanned % 5000 === 0) {
      console.log(`  scanned ${totalLogsScanned} logs, ${totalFailsKept} kept fails, ${pairs.size} unique pairs so far…`);
    }
  }
}

// ─── Output ───────────────────────────────────────────────

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeOutputs() {
  const all = Array.from(pairs.values())
    .filter(p => p.failCount >= opts.minCount)
    .sort((a, b) => b.failCount - a.failCount);

  const limited = opts.top ? all.slice(0, opts.top) : all;

  // CSV
  const csvRows = [
    'family_id,family_name,attribute_id,attribute_name,logic_type,value_a,value_b,fail_count,sample_mpns',
    ...limited.map(p =>
      [
        escapeCsv(p.familyId),
        escapeCsv(p.familyName),
        escapeCsv(p.attributeId),
        escapeCsv(p.attributeName),
        escapeCsv(p.logicType),
        escapeCsv(p.rawA),
        escapeCsv(p.rawB),
        p.failCount,
        escapeCsv(Array.from(p.sampleMpns).join('; ')),
      ].join(','),
    ),
  ];
  const csvPath = resolve(process.cwd(), 'scripts/mine-identity-fails-output.csv');
  writeFileSync(csvPath, csvRows.join('\n') + '\n');

  // JSON (sample MPNs as array, not Set)
  const jsonPath = resolve(process.cwd(), 'scripts/mine-identity-fails-output.json');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        scannedAt: new Date().toISOString(),
        options: opts,
        stats: {
          totalLogsScanned,
          totalRecsScanned,
          totalDetailsScanned,
          totalFailsKept,
          totalDroppedNumeric,
          totalDroppedAlreadyAliased,
          totalDroppedNoRule,
          totalDroppedNotIdentity,
          uniquePairs: pairs.size,
          emittedPairs: limited.length,
        },
        pairs: limited.map(p => ({ ...p, sampleMpns: Array.from(p.sampleMpns) })),
      },
      null,
      2,
    ),
  );

  // Console summary
  console.log('\n─── Summary ──────────────────────────────────────────');
  console.log(`Logs scanned:             ${totalLogsScanned}`);
  console.log(`Recommendations scanned:  ${totalRecsScanned}`);
  console.log(`Match details scanned:    ${totalDetailsScanned}`);
  console.log(`Fails kept (string-vs-string identity/identity_upgrade): ${totalFailsKept}`);
  console.log(`  dropped — both numeric:           ${totalDroppedNumeric}`);
  console.log(`  dropped — already aliased:        ${totalDroppedAlreadyAliased}`);
  console.log(`  dropped — rule not in logic table: ${totalDroppedNoRule}`);
  console.log(`  dropped — not identity rule:      ${totalDroppedNotIdentity}`);
  console.log(`Unique suspect pairs:     ${pairs.size}`);
  console.log(`Emitted (>= ${opts.minCount}):           ${limited.length}`);
  console.log('');
  console.log(`CSV:  ${csvPath}`);
  console.log(`JSON: ${jsonPath}`);

  // Show top 20 in console for quick sanity check
  if (limited.length > 0) {
    console.log('\n─── Top 20 by fail count ─────────────────────────────');
    for (const p of limited.slice(0, 20)) {
      console.log(
        `  [${p.familyId}/${p.attributeId}] "${p.rawA}" ↔ "${p.rawB}" — ${p.failCount}×`,
      );
    }
  }
}

// ─── Run ──────────────────────────────────────────────────

scan()
  .then(() => writeOutputs())
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
