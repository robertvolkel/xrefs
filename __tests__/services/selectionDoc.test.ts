import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseSelectionDoc,
  validateSelectionDoc,
  findContradictions,
  mergeWithLogicTables,
  renderSelectionDoc,
  renderGeneratedModule,
  type ParsedDoc,
} from '@/lib/services/selectionDoc';
import { logicTableRegistry } from '@/lib/logicTables';
import type { LogicTable, MatchingRule } from '@/lib/types';

const DOC_PATH = resolve(process.cwd(), 'docs/min_attr_sets.md');
const MODULE_PATH = resolve(process.cwd(), 'lib/services/selectionTiers.generated.ts');
const readDoc = () => readFileSync(DOC_PATH, 'utf8');

const rule = (attributeId: string, weight = 5): MatchingRule => ({
  attributeId,
  attributeName: attributeId.toUpperCase(),
  logicType: 'identity',
  weight,
  engineeringReason: '',
  sortOrder: 1,
});

const table = (familyId: string, ...rules: MatchingRule[]): LogicTable => ({
  familyId,
  familyName: `Family ${familyId}`,
  category: 'Test',
  description: '',
  rules,
});

const docOf = (families: Record<string, [string, 'required' | 'narrows' | 'not_asked'][]>): ParsedDoc => ({
  families: new Map(
    Object.entries(families).map(([f, rows]) => [f, rows.map(([attributeId, state]) => ({ attributeId, state, reason: '' }))]),
  ),
  notes: '',
});

/**
 * THE GUARD THAT WAS MISSING.
 *
 * The old test asked "does every spec the list mentions exist in the logic table?" — an
 * EXISTENCE check, which 536 unclassified specs passed cleanly. These ask the opposite and
 * far more useful question: "is every spec the engine SCORES accounted for?"
 */
describe('validateSelectionDoc — completeness, not existence', () => {
  const registry = { X1: table('X1', rule('alpha'), rule('beta', 9)) };

  it('passes when every scored rule has a state', () => {
    const doc = docOf({ X1: [['alpha', 'required'], ['beta', 'not_asked']] });
    expect(validateSelectionDoc(doc, registry)).toEqual([]);
  });

  it('FAILS when a scored rule has no row — the 536-hole bug', () => {
    const doc = docOf({ X1: [['alpha', 'required']] });
    const errors = validateSelectionDoc(doc, registry);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('beta');
    expect(errors[0]).toContain('weight 9');
  });

  it('FAILS when a whole family is missing', () => {
    expect(validateSelectionDoc(docOf({}), registry)[0]).toContain('missing from the file entirely');
  });

  it('FAILS on an invented attribute id — the AI-review failure mode', () => {
    const doc = docOf({ X1: [['alpha', 'required'], ['beta', 'not_asked'], ['hallucinated_spec', 'required']] });
    const errors = validateSelectionDoc(doc, registry);
    expect(errors.some(e => e.includes('hallucinated_spec') && e.includes('never be invented'))).toBe(true);
  });

  it('"Not Asked" is a valid decision — it just has to be MADE', () => {
    const doc = docOf({ X1: [['alpha', 'not_asked'], ['beta', 'not_asked']] });
    expect(validateSelectionDoc(doc, registry)).toEqual([]);
  });
});

describe('parseSelectionDoc', () => {
  const md = `
### C1 — Linear Voltage Regulators (LDOs)

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Type | \`output_type\` | 10 | Required for Search |  |
| Dropout Voltage | \`vdropout\` | 7 | Narrows Results |  |
| Max Input Voltage | \`vin_max\` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Quiescent Current | \`iq\` | 5 | Not Asked | A user cannot state this. |

## Engineering Notes

Keep me.
`;

  it('reads ids, states and reasons; keeps row order (which IS ask order)', () => {
    const { doc, errors } = parseSelectionDoc(md);
    expect(errors).toEqual([]);
    expect(doc.families.get('C1')).toEqual([
      { attributeId: 'output_type', state: 'required', reason: '' },
      { attributeId: 'vdropout', state: 'narrows', reason: '' },
      { attributeId: 'vin_max', state: 'not_asked', reason: '' }, // the review marker is not a reason
      { attributeId: 'iq', state: 'not_asked', reason: 'A user cannot state this.' },
    ]);
  });

  it('preserves the hand-written engineering notes verbatim', () => {
    expect(parseSelectionDoc(md).doc.notes).toContain('Keep me.');
  });

  it('rejects an unknown state rather than silently dropping the row', () => {
    const bad = md.replace('Required for Search', 'Maybe Ask Sometimes');
    const { errors } = parseSelectionDoc(bad);
    expect(errors[0]).toContain('unknown state');
  });

  it('rejects a duplicated spec', () => {
    const dupe = md.replace('| Quiescent Current | `iq` | 5 | Not Asked | A user cannot state this. |',
      '| Output Type | `output_type` | 10 | Not Asked |  |');
    expect(parseSelectionDoc(dupe).errors[0]).toContain('listed twice');
  });
});

describe('findContradictions — the threshold-free gap detector', () => {
  it('flags a spec asked in one family and silently skipped in a sibling that also scores it', () => {
    const registry = {
      C1: table('C1', rule('vin_max', 8)),
      C2: table('C2', rule('vin_max', 8)),
    };
    const doc = docOf({ C1: [['vin_max', 'not_asked']], C2: [['vin_max', 'required']] });
    const found = findContradictions(doc, registry);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ attributeId: 'vin_max', askedIn: ['C2'], skippedIn: ['C1'] });
  });

  it('does not flag a spec treated the same way everywhere', () => {
    const registry = { C1: table('C1', rule('iq')), C2: table('C2', rule('iq')) };
    expect(findContradictions(docOf({ C1: [['iq', 'not_asked']], C2: [['iq', 'not_asked']] }), registry)).toEqual([]);
  });
});

describe('mergeWithLogicTables', () => {
  const registry = { X1: table('X1', rule('alpha', 3), rule('beta', 9), rule('gamma', 7)) };

  it('adds a brand-new scored rule as "Not Asked" instead of dropping it on the floor', () => {
    const merged = mergeWithLogicTables(docOf({ X1: [['alpha', 'required']] }), registry);
    const beta = merged.families.get('X1')!.find(r => r.attributeId === 'beta');
    expect(beta).toEqual({ attributeId: 'beta', state: 'not_asked', reason: '' });
  });

  it('drops a row whose rule no longer exists', () => {
    const merged = mergeWithLogicTables(docOf({ X1: [['alpha', 'required'], ['deleted_rule', 'required']] }), registry);
    expect(merged.families.get('X1')!.map(r => r.attributeId)).not.toContain('deleted_rule');
  });

  it('preserves ask order among Required rows — NOT weight order', () => {
    // alpha (w3) is asked FIRST despite beta being w9. C1 depends on exactly this: it must
    // ask output type and polarity before anything else, whatever the weights say.
    const merged = mergeWithLogicTables(docOf({ X1: [['alpha', 'required'], ['beta', 'required']] }), registry);
    expect(merged.families.get('X1')!.slice(0, 2).map(r => r.attributeId)).toEqual(['alpha', 'beta']);
  });

  it('groups required → narrows → unasked, and sorts the unasked by weight so the biggest holes read first', () => {
    const merged = mergeWithLogicTables(docOf({ X1: [['alpha', 'required']] }), registry);
    expect(merged.families.get('X1')!.map(r => r.attributeId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('is idempotent', () => {
    const once = mergeWithLogicTables(docOf({ X1: [['alpha', 'required']] }), registry);
    expect(mergeWithLogicTables(once, registry)).toEqual(once);
  });
});

/**
 * These run against the REAL document and the REAL logic tables. They are the standing
 * guard: add a rule to any logic table, forget the document, and `npm test` goes red — the
 * same failure `npm run build` gives, so it cannot be missed either way.
 */
describe('the real document', () => {
  it('parses with no errors', () => {
    expect(parseSelectionDoc(readDoc()).errors).toEqual([]);
  });

  it('accounts for every spec the matching engine scores, in all 43 families', () => {
    const { doc } = parseSelectionDoc(readDoc());
    expect(validateSelectionDoc(doc, logicTableRegistry)).toEqual([]);
    expect(doc.families.size).toBe(Object.keys(logicTableRegistry).length);
  });

  it('is in sync with the generated module (run `npm run selection:audit` if this fails)', () => {
    const { doc } = parseSelectionDoc(readDoc());
    expect(readFileSync(MODULE_PATH, 'utf8')).toBe(renderGeneratedModule(doc, logicTableRegistry));
  });

  it('round-trips: rendering it and re-parsing yields the identical decisions', () => {
    const { doc } = parseSelectionDoc(readDoc());
    const reparsed = parseSelectionDoc(renderSelectionDoc(doc, logicTableRegistry)).doc;
    expect([...reparsed.families]).toEqual([...doc.families]);
  });

  it('still records the reported bug: an LDO never asks what voltage goes INTO it', () => {
    // A canary, not an assertion of correctness — it documents the state the review must
    // fix. When Fable 5 marks C1 vin_max as asked, DELETE this test; do not weaken it.
    const { doc } = parseSelectionDoc(readDoc());
    const c1 = doc.families.get('C1')!.find(r => r.attributeId === 'vin_max');
    const c2 = doc.families.get('C2')!.find(r => r.attributeId === 'vin_max');
    expect(c1!.state).toBe('not_asked');
    expect(c2!.state).toBe('required');
  });
});
