import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseSelectionDoc,
  validateSelectionDoc,
  findContradictions,
  findLogicTypeDivergences,
  findAskedButUncomparable,
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

  it('separates an UNREASONED skip (needs a human) from a REASONED divergence (settled)', () => {
    // Two families can legitimately differ — a through-hole resistor really does key off lead
    // spacing rather than package size. What makes a divergence actionable is not that it
    // exists, but that the family skipping the spec never said WHY. An unreasoned skip is not
    // a decision, it is an absence — which is the entire bug this file exists to prevent.
    const registry = { A: table('A', rule('spec')), B: table('B', rule('spec')), C: table('C', rule('spec')) };
    const doc: ParsedDoc = {
      families: new Map([
        ['A', [{ attributeId: 'spec', state: 'required' as const, reason: '' }]],
        ['B', [{ attributeId: 'spec', state: 'not_asked' as const, reason: 'Implied by the package.' }]],
        ['C', [{ attributeId: 'spec', state: 'not_asked' as const, reason: '' }]],
      ]),
      notes: '',
    };
    const [found] = findContradictions(doc, registry);
    expect(found.skippedIn).toEqual(['B', 'C']);
    expect(found.unreasonedSkips).toEqual(['C']); // B is settled; only C still needs a human
  });
});

/**
 * The sibling of findContradictions, and the detector that found the package bug. Same
 * threshold-free principle: if 33 families compare a spec one way and 5 compare it another,
 * at least one group is wrong — that is evidence, not opinion.
 */
describe('findLogicTypeDivergences / findAskedButUncomparable — the package-bug detector', () => {
  const registry = {
    A: table('A', { ...rule('package_case', 10), logicType: 'identity' }),
    B: table('B', { ...rule('package_case', 10), logicType: 'identity' }),
    C: table('C', { ...rule('package_case', 10), logicType: 'application_review' }), // the odd one out
  };

  it('flags a spec compared differently across families, majority first', () => {
    const doc = docOf({
      A: [['package_case', 'required']],
      B: [['package_case', 'required']],
      C: [['package_case', 'required']],
    });
    const [d] = findLogicTypeDivergences(doc, registry);
    expect(d.attributeId).toBe('package_case');
    expect(d.variants[0]).toEqual({ logicType: 'identity', familyIds: ['A', 'B'] }); // majority first
    expect(d.variants[1]).toEqual({ logicType: 'application_review', familyIds: ['C'] });
  });

  it('marks the SHARP case: a family that ASKS for a spec it structurally cannot compare', () => {
    // `application_review` hands every candidate a flat 50% — it can never separate two parts.
    // Asking the user and then ignoring the answer is worse than not asking.
    const asked = docOf({
      A: [['package_case', 'required']],
      B: [['package_case', 'required']],
      C: [['package_case', 'required']], // ← asks, and cannot use the answer
    });
    expect(findLogicTypeDivergences(asked, registry)[0].askedButUncomparable).toEqual(['C']);
    expect(findAskedButUncomparable(asked, registry)).toEqual([
      { familyId: 'C', attributeId: 'package_case', attributeName: 'PACKAGE_CASE', logicType: 'application_review', weight: 10 },
    ]);
  });

  it('an uncomparable spec we do NOT ask about is not flagged — that is fine, not a bug', () => {
    const notAsked = docOf({
      A: [['package_case', 'required']],
      B: [['package_case', 'required']],
      C: [['package_case', 'not_asked']],
    });
    expect(findLogicTypeDivergences(notAsked, registry)[0].askedButUncomparable).toEqual([]);
    expect(findAskedButUncomparable(notAsked, registry)).toEqual([]);
  });

  it('does not flag a spec compared the same way everywhere', () => {
    const same = { A: table('A', rule('iq')), B: table('B', rule('iq')) };
    expect(findLogicTypeDivergences(docOf({ A: [['iq', 'required']], B: [['iq', 'required']] }), same)).toEqual([]);
  });
});

describe('the real logic tables — the package bug must stay fixed', () => {
  it('every family compares the package; none hands it to a human', () => {
    // C6/C7/C8/C9/C10 scored `package_case` as application_review — a flat 50% for EVERY
    // candidate — while 33 other families compared it exactly. All five ALSO required the user
    // to state their package, so a request for SOT-23 accepted a QFN-32 at half marks.
    for (const [familyId, t] of Object.entries(logicTableRegistry)) {
      const pkg = t.rules.find(r => r.attributeId === 'package_case');
      if (!pkg) continue;
      expect(`${familyId}:${pkg.logicType}`).toBe(`${familyId}:identity`);
    }
  });

  it('no spec we ASK the user for is scored by a rule that cannot compare it', () => {
    // The six survivors are real review items in docs/min_attr_sets.md (gain, DC bias derating,
    // logic family, Vgs(th), PSRR, parasitic inductance). When they are resolved this drops to 0;
    // if it ever GROWS, someone has added a question whose answer the engine throws away.
    const { doc } = parseSelectionDoc(readDoc());
    const found = findAskedButUncomparable(doc, logicTableRegistry);
    expect(found.map(f => `${f.familyId}:${f.attributeId}`).sort()).toEqual([
      '12:dc_bias_derating',
      '54:parasitic_inductance',
      'B5:vgs_th',
      'B6:hfe',
      'C1:psrr',
      'C5:logic_family',
    ]);
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

  it('asks what voltage goes INTO a voltage regulator — both kinds of them', () => {
    // The bug that motivated this whole mechanism. The document required `vin_max` for C2
    // switching regulators but omitted it for C1 LDOs — also a Vin→Vout device — so the app
    // never asked. Both are Required now. If this ever goes back to `not_asked`, that is the
    // regression, not a preference: a 60 V rail into a 6 V LDO is a hard safety failure.
    const { doc } = parseSelectionDoc(readDoc());
    for (const familyId of ['C1', 'C2']) {
      const vin = doc.families.get(familyId)!.find(r => r.attributeId === 'vin_max');
      expect(vin!.state).toBe('required');
    }
  });

  it('every unasked spec carries a reason — no silent holes left', () => {
    // The original state of this file was 536 specs unasked with no reason recorded: not
    // rejected, never *decided on*. Adding a rule re-opens a hole (it seeds as an unreasoned
    // "Not Asked"), and this is what makes that visible rather than invisible.
    const { doc } = parseSelectionDoc(readDoc());
    const unreasoned = [...doc.families.entries()].flatMap(([familyId, rows]) =>
      rows.filter(r => r.state === 'not_asked' && !r.reason).map(r => `${familyId}.${r.attributeId}`),
    );
    expect(unreasoned).toEqual([]);
  });
});
