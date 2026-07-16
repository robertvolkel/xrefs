/**
 * npm run selection:check  (runs automatically before `npm run build`)
 *
 * The guard that makes the selection questions impossible to silently rot.
 *
 * Three assertions, in order:
 *   1. docs/min_attr_sets.md parses.
 *   2. COMPLETENESS — every spec the matching engine scores has an explicit state in the
 *      document, and no state is attached to an attribute id that does not exist. Add a rule
 *      to a logic table and forget the document → the build fails here. You may still choose
 *      "Not Asked" — but it becomes a line in a diff instead of an invisible absence.
 *   3. The generated module matches the document. (Nothing may hand-edit the code copy.)
 *
 * There is no weight threshold anywhere in this check, on purpose. A threshold is a guess
 * about what matters, and it fails both ways — it would flag `tst` (storage temperature,
 * weight 8, correctly never asked) and hide C1 `vin_min` (weight 7, plausibly a real hole).
 * The check only guarantees that a decision was MADE about everything; the decisions
 * themselves are reviewed by a human in the document.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logicTableRegistry } from '../lib/logicTables';
import { parseSelectionDoc, validateSelectionDoc, renderGeneratedModule } from '../lib/services/selectionDoc';

const DOC = resolve(__dirname, '../docs/min_attr_sets.md');
const MODULE = resolve(__dirname, '../lib/services/selectionTiers.generated.ts');

const fail = (headline: string, details: string[], remedy: string): never => {
  console.error(`\n✗ ${headline}\n`);
  details.slice(0, 40).forEach(d => console.error(`    ${d}`));
  if (details.length > 40) console.error(`    …and ${details.length - 40} more`);
  console.error(`\n  ${remedy}\n`);
  process.exit(1);
};

// Read the source doc. It lives under docs/, which production build/deploy environments often
// EXCLUDE from the release tree (IT copies scripts/ + lib/ + app/ but not docs/). This check is a
// DEV/CI drift guard, NOT a runtime dependency: the app imports the COMMITTED generated module
// (lib/services/selectionTiers.generated.ts), and the same doc↔module completeness/staleness guard
// runs as a jest test (`npm test`, see __tests__/services/selectionDoc.test.ts) where docs/ is
// present. So when the doc is genuinely absent, skip cleanly instead of breaking `next build`.
let docSource: string;
try {
  docSource = readFileSync(DOC, 'utf8');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
    console.log(
      `⚠ selection:check skipped — ${DOC} is not present in this environment.\n` +
        `  The committed generated module is authoritative here; the doc↔module drift guard runs\n` +
        `  in dev/CI via \`npm test\` (docs/ present there).`,
    );
    process.exit(0);
  }
  throw e;
}

const { doc, errors } = parseSelectionDoc(docSource);
if (errors.length) {
  fail(
    'docs/min_attr_sets.md could not be parsed.',
    errors,
    'Fix the rows above. Every row needs 5 columns and a State of ' +
      '"Required for Search", "Narrows Results" or "Not Asked".',
  );
}

const invalid = validateSelectionDoc(doc, logicTableRegistry);
if (invalid.length) {
  fail(
    'The selection questions are out of sync with the matching engine.',
    invalid,
    'Run `npm run selection:audit` to add the missing rows (they seed as "Not Asked"), ' +
      'then decide what each one should be.',
  );
}

const expected = renderGeneratedModule(doc, logicTableRegistry);
let actual: string;
try {
  actual = readFileSync(MODULE, 'utf8');
} catch {
  actual = '';
}
if (actual !== expected) {
  fail(
    'lib/services/selectionTiers.generated.ts does not match docs/min_attr_sets.md.',
    [actual ? 'The generated module is stale (or was hand-edited).' : 'The generated module is missing.'],
    'Run `npm run selection:audit`.',
  );
}

const specs = [...doc.families.values()].flat();
const asked = specs.filter(r => r.state !== 'not_asked').length;
// "Not asked" splits two ways, and conflating them is the bug this file exists to fix: a
// spec somebody deliberately excluded, and a spec nobody has ever ruled on. Report both.
const unreviewed = specs.filter(r => r.state === 'not_asked' && !r.reason).length;
console.log(
  `✓ selection questions: all ${specs.length} scored specs across ${doc.families.size} families ` +
    `have a state (${asked} asked, ${specs.length - asked} not asked).`,
);
if (unreviewed) {
  console.log(
    `  ${unreviewed} of the unasked specs have no reason recorded — nobody has ruled on them yet. ` +
      `Review docs/min_attr_sets.md.`,
  );
}
