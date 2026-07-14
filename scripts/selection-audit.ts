/**
 * npm run selection:audit
 *
 * Reconciles docs/min_attr_sets.md against the live logic tables and regenerates
 * lib/services/selectionTiers.generated.ts from it.
 *
 *   - every spec the matching engine scores gets a row (new ones seed as `Not Asked`)
 *   - spec names and weights are re-read from the logic tables, so they cannot go stale
 *   - the State/Reason columns — the human decisions — are preserved
 *
 * The document is the source of truth; this script is the formatter and the compiler.
 * Run it after editing the file, and after adding a rule to any logic table.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { logicTableRegistry } from '../lib/logicTables';
import {
  parseSelectionDoc,
  mergeWithLogicTables,
  validateSelectionDoc,
  findContradictions,
  renderSelectionDoc,
  renderGeneratedModule,
} from '../lib/services/selectionDoc';

const DOC = resolve(__dirname, '../docs/min_attr_sets.md');
const MODULE = resolve(__dirname, '../lib/services/selectionTiers.generated.ts');

const { doc, errors } = parseSelectionDoc(readFileSync(DOC, 'utf8'));
if (errors.length) {
  console.error('The document could not be parsed. Fix these rows, then re-run:\n');
  errors.forEach(e => console.error(`  ✗ ${e}`));
  process.exit(1);
}

const before = new Map([...doc.families].map(([f, rows]) => [f, new Set(rows.map(r => r.attributeId))]));
const merged = mergeWithLogicTables(doc, logicTableRegistry);

const invalid = validateSelectionDoc(merged, logicTableRegistry);
if (invalid.length) {
  console.error('The document does not match the logic tables:\n');
  invalid.forEach(e => console.error(`  ✗ ${e}`));
  process.exit(1);
}

writeFileSync(DOC, renderSelectionDoc(merged, logicTableRegistry));
writeFileSync(MODULE, renderGeneratedModule(merged, logicTableRegistry));

// ─── Report ───────────────────────────────────────────────────────────────────
let specs = 0;
let asked = 0;
let added = 0;
let dropped = 0;
const thin: string[] = [];

for (const [familyId, rows] of merged.families) {
  specs += rows.length;
  const familyAsked = rows.filter(r => r.state !== 'not_asked').length;
  asked += familyAsked;

  const prior = before.get(familyId) ?? new Set();
  added += rows.filter(r => !prior.has(r.attributeId)).length;
  const now = new Set(rows.map(r => r.attributeId));
  dropped += [...prior].filter(id => !now.has(id)).length;

  if (familyAsked / rows.length < 0.35) {
    thin.push(`${familyId} (${familyAsked}/${rows.length})`);
  }
}

const contradictions = findContradictions(merged, logicTableRegistry);
const unreviewed = [...merged.families.values()]
  .flat()
  .filter(r => r.state === 'not_asked' && !r.reason).length;

console.log(`\nWrote ${DOC}`);
console.log(`Wrote ${MODULE}\n`);
console.log(`  ${Object.keys(logicTableRegistry).length} families, ${specs} scored specs`);
console.log(`  ${asked} asked, ${specs - asked} not asked (${unreviewed} of those never ruled on)`);
if (added) console.log(`  ${added} new spec row(s) added — seeded as "Not Asked", flagged for review`);
if (dropped) console.log(`  ${dropped} row(s) dropped (the rule no longer exists)`);
console.log(`  ${contradictions.length} cross-family contradiction(s) to review`);
if (thin.length) console.log(`  thinnest coverage: ${thin.slice(0, 6).join(', ')}`);
console.log('');
