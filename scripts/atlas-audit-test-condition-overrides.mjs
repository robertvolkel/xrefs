#!/usr/bin/env node

/**
 * Atlas Triage — audit accepted overrides for test-condition VARIANT paramNames
 *
 * Reads every active row in `atlas_dictionary_overrides` and flags paramNames
 * that look like a NON-STANDARD test-condition variant of a canonical attribute.
 * Read-only; prints a triage list ranked by suspicion.
 *
 * A test-condition variant is a paramName measured at a condition that differs
 * from the family's standard, causing physically-different values to collide
 * on the same JSONB canonical key (see the Triage discussion in CLAUDE.md +
 * memory/triage-test-condition-and-metadata-params.md).
 *
 * Heuristic — three tiers:
 *
 *   HIGH  = high-temperature explicit (Tj/Ta >100°C, "hot", "@ 150°C", etc.).
 *           Almost always a variant of a 25°C canonical. Review priority 1.
 *
 *   MED   = other test-condition markers ("at Vgs=", "at If=", "@ Ic=",
 *           "at ...Hz" outside standard freq bands, "Condition..."). Could be
 *           either the family's STANDARD condition (Accept was correct) or a
 *           VARIANT (Accept was wrong). Manual review needed.
 *
 *   LOW   = "at 25°C" / "@ Ta=25", explicit standard-condition labeling.
 *           Almost always fine — the label is redundant. Listed only for
 *           completeness.
 *
 * Usage:
 *   node scripts/atlas-audit-test-condition-overrides.mjs
 *   node scripts/atlas-audit-test-condition-overrides.mjs --min-tier med
 *   node scripts/atlas-audit-test-condition-overrides.mjs --format json > out.json
 *
 * All output is dry-run. To revoke a flagged override:
 *   1. Verify manually (spot-check sample values against family's standard condition)
 *   2. Use the Triage UI or an existing revoke script (atlas-revoke-bad-canonical.mjs)
 *      to deactivate + optionally mark unmappable.
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
    const content = readFileSync(resolve(REPO_ROOT, '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
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
const format = (() => {
  const i = args.indexOf('--format');
  return i !== -1 && args[i + 1] ? args[i + 1] : 'text';
})();
const minTier = (() => {
  const i = args.indexOf('--min-tier');
  const v = i !== -1 && args[i + 1] ? args[i + 1].toLowerCase() : 'low';
  return ['high', 'med', 'low'].includes(v) ? v : 'low';
})();

const TIER_RANK = { high: 3, med: 2, low: 1 };

// --------------------------------------------------------------------------
// Heuristic classifiers
// --------------------------------------------------------------------------

// HIGH: elevated temperature — almost certainly variant of 25°C canonical.
// Match Tj/Ta/Tc/Tamb followed by numeric value >= 50°C; also bare "at N°C" >= 50.
// Also match textual "hot"/"cold" markers.
const HIGH_PATTERNS = [
  { re: /\b(?:tj|ta|tc|tamb|tjunction|tcase)\s*[=＝]?\s*(\d{2,3})\s*(?:°|º|деg|deg)?\s*c\b/i, kind: 'high-temp explicit' },
  { re: /\bat\s+(\d{2,3})\s*(?:°|º)?\s*c\b/i, kind: 'at N°C bare', minTemp: 50 },
  { re: /@\s*(\d{2,3})\s*(?:°|º)?\s*c\b/i, kind: '@ N°C bare', minTemp: 50 },
  { re: /\b(?:hot|elevated|high[\s-]?temp)\b/i, kind: 'hot marker' },
  { re: /junction\s+temperature\s*[=＝]?\s*(\d{2,3})/i, kind: 'junction temp explicit' },
];

// MED: any non-temperature test-condition marker.
// These CAN be the standard condition (Accept was correct) or a variant (Accept was wrong).
const MED_PATTERNS = [
  { re: /\bat\s+(?:vgs|vds|vce|vbe|vbr|vf|vr|vin|vcc|vdd|vee|vss)\s*[=＝]/i, kind: 'at V_ bias' },
  { re: /@\s*(?:vgs|vds|vce|vbe|vbr|vf|vr|vin|vcc|vdd|vee|vss)\s*[=＝]?/i, kind: '@ V_ bias' },
  { re: /\bat\s+(?:if|ir|ic|ib|ie|id|is|iout|iin|iq)\s*[=＝]/i, kind: 'at I_ bias' },
  { re: /@\s*(?:if|ir|ic|ib|ie|id|is|iout|iin|iq)\s*[=＝]?/i, kind: '@ I_ bias' },
  { re: /\bat\s+\d+\s*(?:khz|mhz|ghz)\b/i, kind: 'at frequency' },
  { re: /@\s*\d+\s*(?:khz|mhz|ghz)\b/i, kind: '@ frequency' },
  { re: /^condition\d/i, kind: 'ConditionN prefix' },
  { re: /\bpulse\s+test\b/i, kind: 'pulse test' },
];

// LOW: explicit 25°C labeling — usually harmless.
const LOW_PATTERNS = [
  { re: /\b(?:tj|ta|tc|tamb)\s*[=＝]?\s*25\s*(?:°|º)?\s*c\b/i, kind: 'standard 25°C label' },
  { re: /\bat\s+25\s*(?:°|º)?\s*c\b/i, kind: 'at 25°C label' },
  { re: /@\s*25\s*(?:°|º)?\s*c\b/i, kind: '@ 25°C label' },
];

function classify(paramName) {
  // Test HIGH first (any high-temp match wins).
  for (const p of HIGH_PATTERNS) {
    const m = paramName.match(p.re);
    if (m) {
      if (p.minTemp !== undefined) {
        const t = parseInt(m[1], 10);
        if (!isNaN(t) && t < p.minTemp) continue;
        if (t === 25) continue; // fell through to LOW
      }
      return { tier: 'high', kind: p.kind, hit: m[0] };
    }
  }
  // LOW next — catches the "25°C" case before MED patterns pick up spurious bias markers.
  for (const p of LOW_PATTERNS) {
    const m = paramName.match(p.re);
    if (m) return { tier: 'low', kind: p.kind, hit: m[0] };
  }
  // MED last.
  for (const p of MED_PATTERNS) {
    const m = paramName.match(p.re);
    if (m) return { tier: 'med', kind: p.kind, hit: m[0] };
  }
  return null;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllOverrides() {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_at, created_by')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const all = await fetchAllOverrides();
const suspects = [];
for (const row of all) {
  const c = classify(row.param_name);
  if (!c) continue;
  if (TIER_RANK[c.tier] < TIER_RANK[minTier]) continue;
  suspects.push({ ...row, ...c });
}

// Sort: high → med → low; within tier, group by attribute_id, then family
const TIER_ORDER = { high: 0, med: 1, low: 2 };
suspects.sort((a, b) => {
  if (TIER_ORDER[a.tier] !== TIER_ORDER[b.tier]) return TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
  if (a.attribute_id !== b.attribute_id) return a.attribute_id.localeCompare(b.attribute_id);
  if ((a.family_id || '') !== (b.family_id || '')) return (a.family_id || '').localeCompare(b.family_id || '');
  return a.param_name.localeCompare(b.param_name);
});

if (format === 'json') {
  console.log(JSON.stringify({ total_overrides: all.length, suspects }, null, 2));
  process.exit(0);
}

// Text output
console.log(`\n=== Test-condition variant override audit ===`);
console.log(`Total active overrides scanned: ${all.length}`);
console.log(`Suspects found (>= ${minTier.toUpperCase()}): ${suspects.length}\n`);

if (suspects.length === 0) {
  console.log('No suspect overrides found. Nothing to review.\n');
  process.exit(0);
}

const byTier = { high: [], med: [], low: [] };
for (const s of suspects) byTier[s.tier].push(s);

for (const tier of ['high', 'med', 'low']) {
  if (!byTier[tier].length) continue;
  console.log(`\n--- ${tier.toUpperCase()} (${byTier[tier].length}) ---`);
  if (tier === 'high') console.log('  Elevated-temp variants. Very likely wrong Accept; strongly recommend revoke + mark Unmappable.\n');
  if (tier === 'med') console.log('  Non-temp test conditions. Could be family standard (OK) or variant (wrong). Manual review each.\n');
  if (tier === 'low') console.log('  Explicit 25°C labels. Usually redundant, not a problem. Listed for completeness.\n');

  // Group by attribute_id for quick scan.
  const byAttr = new Map();
  for (const s of byTier[tier]) {
    const k = s.attribute_id;
    if (!byAttr.has(k)) byAttr.set(k, []);
    byAttr.get(k).push(s);
  }

  for (const [attrId, rows] of byAttr) {
    console.log(`  → ${attrId}  (${rows.length} suspect(s))`);
    for (const r of rows) {
      const fam = r.family_id || '(no family)';
      console.log(`      [${fam}]  "${r.param_name}"`);
      console.log(`         id=${r.id}  unit=${r.unit || '-'}  hit=${r.kind} "${r.hit}"`);
    }
  }
}

console.log(`\n--- Suggested next steps ---`);
console.log(`  HIGH tier:  revoke via atlas-revoke-bad-canonical.mjs (per attributeId) or Triage UI.`);
console.log(`              Then mark paramName Unmappable so it doesn't re-appear in queue.`);
console.log(`  MED tier:   spot-check each. Ask "is <condition> the family's STANDARD?"`);
console.log(`              If yes → leave Accepted. If no → revoke + Unmappable.`);
console.log(`  LOW tier:   almost always leave as-is.`);
console.log('');
