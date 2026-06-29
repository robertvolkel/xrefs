/**
 * Exports every component family in the application together with all the
 * attributes (matching rules) we evaluate for each one, into a single Markdown
 * file. Imports the live logic-table registry so the export stays in sync with
 * the actual matching engine.
 *
 * Run: npx tsx scripts/export-family-attributes.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { logicTableRegistry, getFamilyLastUpdated } from '../lib/logicTables';
import type { LogicTable, MatchingRule } from '../lib/types';

// Display order: passives → discrete semis → block C ICs → D → E → F.
const FAMILY_ORDER = [
  '12', '13', '52', '53', '54', '55', '58', '59', '60', '61', '64', '65',
  '66', '67', '68', '69', '70', '71', '72',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
  'D1', 'D2', 'E1', 'F1', 'F2',
];

const LOGIC_TYPE_LABEL: Record<string, string> = {
  identity: 'Identity (exact match)',
  identity_range: 'Identity range (range overlap)',
  identity_upgrade: 'Identity upgrade (match or superior)',
  identity_flag: 'Identity flag (boolean gate)',
  threshold: 'Threshold (numeric ≥ / ≤ / ⊇)',
  fit: 'Fit (physical ≤)',
  application_review: 'Application review (manual)',
  operational: 'Operational (non-electrical)',
  vref_check: 'Vref check (cross-attribute recalc)',
};

const DIRECTION_LABEL: Record<string, string> = {
  gte: 'replacement ≥ original',
  lte: 'replacement ≤ original',
  range_superset: 'replacement range ⊇ original',
};

function ruleTypeCell(rule: MatchingRule): string {
  let label = LOGIC_TYPE_LABEL[rule.logicType] ?? rule.logicType;
  if (rule.thresholdDirection) {
    label += ` — ${DIRECTION_LABEL[rule.thresholdDirection] ?? rule.thresholdDirection}`;
  }
  if (rule.tolerancePercent != null) {
    label += ` (±${rule.tolerancePercent}%)`;
  }
  return label;
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function familySection(familyId: string, table: LogicTable): string {
  const lines: string[] = [];
  lines.push(`### ${familyId} — ${table.familyName}`);
  lines.push('');
  lines.push(`- **Category:** ${table.category}`);
  lines.push(`- **Attributes (rules):** ${table.rules.length}`);
  lines.push(`- **Logic last updated:** ${getFamilyLastUpdated(familyId)}`);
  lines.push(`- **Description:** ${table.description}`);
  lines.push('');
  lines.push('| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |');
  lines.push('|---|-----------|--------------|-------------|:------:|--------------------|');

  const sorted = [...table.rules].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const rule of sorted) {
    let reason = escapePipes(rule.engineeringReason);
    if (rule.upgradeHierarchy?.length) {
      reason += ` _(Hierarchy best→worst: ${rule.upgradeHierarchy.join(' > ')})_`;
    }
    if (rule.valueAliases?.length) {
      const aliases = rule.valueAliases.map(g => g.join('≡')).join('; ');
      reason += ` _(Aliases: ${aliases})_`;
    }
    lines.push(
      `| ${rule.sortOrder} | ${escapePipes(rule.attributeName)} | \`${rule.attributeId}\` | ${escapePipes(ruleTypeCell(rule))} | ${rule.weight} | ${reason} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [];

  out.push('# XRefs — Component Families & Attributes');
  out.push('');
  out.push(
    'This document lists every component family supported by the cross-reference ' +
    'matching engine, along with all attributes (matching rules) evaluated for each ' +
    'family. It is generated directly from the live logic tables.'
  );
  out.push('');
  out.push(`- **Generated:** ${today}`);
  out.push(`- **Total families:** ${FAMILY_ORDER.length}`);
  const totalAttrs = FAMILY_ORDER.reduce(
    (sum, id) => sum + (logicTableRegistry[id]?.rules.length ?? 0),
    0
  );
  out.push(`- **Total attributes across all families:** ${totalAttrs}`);
  out.push('');

  // Match-logic legend
  out.push('## How to read the "Match Logic" column');
  out.push('');
  out.push('| Logic Type | Behavior |');
  out.push('|------------|----------|');
  out.push('| Identity | Exact match required (after normalization / aliases) |');
  out.push('| Identity range | Replacement value range must overlap the original\'s range |');
  out.push('| Identity upgrade | Match or a strictly superior variant per a defined hierarchy |');
  out.push('| Identity flag | Boolean gate — if the original requires it, the replacement must have it too |');
  out.push('| Threshold | Numeric comparison: replacement ≥, ≤, or range ⊇ original |');
  out.push('| Fit | Physical/dimensional constraint — replacement must fit (≤) |');
  out.push('| Application review | Cannot be automated; flagged for human review |');
  out.push('| Operational | Non-electrical info (packaging, supply-chain) |');
  out.push('| Vref check | Cross-attribute Vref→Vout recalculation with ±2% tolerance |');
  out.push('');
  out.push('**Weight** is the rule\'s relative importance (0–10) used in scoring.');
  out.push('');

  // Table of contents
  out.push('## Families');
  out.push('');
  for (const id of FAMILY_ORDER) {
    const table = logicTableRegistry[id];
    if (!table) continue;
    out.push(`- **${id}** — ${table.familyName} _(${table.category}, ${table.rules.length} attributes)_`);
  }
  out.push('');

  // Detail sections, one per family, in block order. (Category is shown per
  // family rather than as a repeating section header, because later blocks
  // reuse earlier categories — e.g. Crystals/Fuses are "Passives" and
  // Optocouplers are "Discrete Semiconductors".)
  out.push('## Family Details');
  out.push('');
  for (const id of FAMILY_ORDER) {
    const table = logicTableRegistry[id];
    if (!table) {
      console.warn(`WARNING: no logic table found for family ${id}`);
      continue;
    }
    out.push(familySection(id, table));
  }

  const outPath = join(process.cwd(), 'docs', 'FAMILY_ATTRIBUTES.md');
  writeFileSync(outPath, out.join('\n'), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Families: ${FAMILY_ORDER.length}, total attributes: ${totalAttrs}`);
}

main();
