import {
  decideGuidedTurn,
  renderChoiceQuestion,
  renderValuesQuestion,
  renderDisambiguationQuestion,
  isSystemGuidedQuestion,
  detectAmbiguity,
  resolvePartTypeFamily,
  hasSelectionIntent,
  isLikelyTheory,
} from '@/lib/services/guidedSelectionController';
import type { OrchestratorMessage } from '@/lib/types';
import type { GuidedAnswerMap } from '@/lib/services/guidedSelection';

const u = (content: string): OrchestratorMessage => ({ role: 'user', content });
const a = (content: string): OrchestratorMessage => ({ role: 'assistant', content });
const noAnswers = async (): Promise<GuidedAnswerMap> => ({});

describe('fixed question wording + recognizer (the in-progress marker)', () => {
  it('round-trips: every question the controller emits is recognized as a guided question', () => {
    expect(isSystemGuidedQuestion(renderChoiceQuestion('Output Type'))).toBe(true);
    expect(isSystemGuidedQuestion(renderDisambiguationQuestion())).toBe(true);
    expect(isSystemGuidedQuestion(renderValuesQuestion(['R25', 'B-Value', 'Package']))).toBe(true);
  });
  it('choice question lowercases the spec and is one sentence', () => {
    expect(renderChoiceQuestion('Output Type')).toBe('Which output type do you need?');
  });
  it('value batch joins with commas + "and" and offers the "any" escape', () => {
    expect(renderValuesQuestion(['A', 'B', 'C'])).toBe('What A, B, and C are you targeting? (Say "any" if one doesn\'t matter.)');
    expect(renderValuesQuestion(['A', 'B'])).toBe('What A and B are you targeting? (Say "any" if one doesn\'t matter.)');
  });
  it('does NOT recognize ordinary assistant prose as a guided question', () => {
    expect(isSystemGuidedQuestion('Here are 20 NTC thermistors — click one.')).toBe(false);
    expect(isSystemGuidedQuestion('What is the difference between NTC and PTC?')).toBe(false);
  });
});

describe('deterministic disambiguation', () => {
  it('flags known-ambiguous heads, ignores single-family heads', () => {
    expect(detectAmbiguity('I need a voltage regulator')?.map(o => o.familyId)).toEqual(['C1', 'C2']);
    expect(detectAmbiguity('I need a transistor')?.map(o => o.familyId)).toEqual(['B5', 'B6', 'B9']);
    expect(detectAmbiguity('I need a capacitor')?.map(o => o.familyId)).toEqual(['12', '58', '59', '64', '60']);
    expect(detectAmbiguity('I need a diode')?.map(o => o.familyId)).toEqual(['B1', 'B2', 'B3', 'B4']);
    expect(detectAmbiguity('I need an NTC thermistor')).toBeNull();
  });
  it('every disambiguation label re-pins to its intended family (incl. variant families B2/B4)', () => {
    for (const text of ['I need a regulator', 'I need a transistor', 'I need a capacitor', 'I need a diode']) {
      for (const opt of detectAmbiguity(text)!) {
        // resolvePartTypeFamily (chip-label map → keyword resolver) is what pinFamily
        // uses; resolveFamilyFromText alone fails for B2 "Schottky" / B4 "TVS".
        expect(resolvePartTypeFamily(opt.label)).toBe(opt.familyId);
      }
    }
  });
});

describe('entry/theory heuristics', () => {
  it('separates sourcing intent from theory', () => {
    expect(hasSelectionIntent('I need an NTC thermistor')).toBe(true);
    expect(isLikelyTheory("what's the difference between NTC and PTC?")).toBe(true);
    expect(hasSelectionIntent("what's the difference between NTC and PTC?")).toBe(false);
  });
});

describe('decideGuidedTurn — turn ownership', () => {
  it('defers (null) on a part-number turn', async () => {
    expect(await decideGuidedTurn([u('BC847BLT1G')], noAnswers)).toBeNull();
  });

  it('ENTRY: bare "capacitor" → 5-way disambiguation (not punted to the LLM)', async () => {
    const out = await decideGuidedTurn([u('I need a capacitor')], noAnswers);
    expect(out?.kind).toBe('ask');
    if (out?.kind === 'ask') {
      expect(out.message).toBe(renderDisambiguationQuestion());
      expect(out.choices?.map(c => c.label)).toEqual(['MLCC', 'Aluminum electrolytic', 'Tantalum', 'Film', 'Aluminum polymer']);
    }
  });

  it('DIODE: clicking a variant-family chip ("Schottky") is OWNED by the system', async () => {
    const convo = [
      u('I need a diode'),
      a('Which type do you need?'),
      u('Schottky'), // B2 — not reachable via resolveFamilyFromText, only via the chip-label map
    ];
    const out = await decideGuidedTurn(convo, noAnswers);
    expect(out?.kind).toBe('ask'); // system asks B2's first spec, not the LLM
    if (out?.kind === 'ask') expect(isSystemGuidedQuestion(out.message)).toBe(true);
  });

  it('REGRESSION: a fresh type word that looksLikeMpn ("Tantalum pls") is OWNED, not bailed to the LLM', async () => {
    // The live capacitor bug: after the LLM clarified the type, "Tantalum pls" hit the
    // MPN gate (looksLikeMpn true) and bailed → the LLM ran the whole flow. The fix:
    // a message that names a part type is never treated as an MPN lookup.
    const convo = [
      u('I need a capacitor'),
      a('What type of capacitor are you looking for? For example: MLCC, Tantalum, …'), // LLM prose, NOT a system question
      u('Tantalum pls'),
    ];
    const out = await decideGuidedTurn(convo, noAnswers);
    expect(out?.kind).toBe('ask'); // system takes over with the first tantalum spec
    if (out?.kind === 'ask') expect(isSystemGuidedQuestion(out.message)).toBe(true);
  });

  it('defers (null) on a theory question even though it names a family', async () => {
    const out = await decideGuidedTurn([u("what's the difference between NTC and PTC thermistors?")], noAnswers);
    expect(out).toBeNull();
  });

  it('does NOT hijack a fresh entry when results/recs are already on screen (refinement/pivot is the LLM\'s)', async () => {
    const out = await decideGuidedTurn([u('I need an NTC thermistor')], noAnswers, /* hasOnScreenContext */ true);
    expect(out).toBeNull();
  });

  it('STILL drives a continuation even with on-screen context (mid-questions is unaffected)', async () => {
    const convo = [
      u('I need an LDO'),
      a('Which output type do you need?'),
      u('Fixed'),
    ];
    const out = await decideGuidedTurn(convo, noAnswers, /* hasOnScreenContext */ true);
    expect(out?.kind).toBe('ask'); // in-progress overrides the context gate
  });

  it('ENTRY: ambiguous head → disambiguation buttons, parser never consulted', async () => {
    let parserCalled = false;
    const out = await decideGuidedTurn([u('I need a voltage regulator')], async () => { parserCalled = true; return {}; });
    expect(parserCalled).toBe(false);
    expect(out?.kind).toBe('ask');
    if (out?.kind === 'ask') {
      expect(out.message).toBe(renderDisambiguationQuestion());
      expect(out.choices?.map(c => c.id)).toEqual(['C1', 'C2']);
    }
  });

  it('ENTRY: NTC thermistor with nothing answered → one batched typed-value question (no buttons)', async () => {
    const out = await decideGuidedTurn([u('I need an NTC thermistor')], noAnswers);
    expect(out?.kind).toBe('ask');
    if (out?.kind === 'ask') {
      expect(isSystemGuidedQuestion(out.message)).toBe(true);
      expect(out.message.startsWith('What ')).toBe(true);
      expect(out.choices).toBeUndefined(); // typed values carry no buttons
    }
  });

  it('ENTRY: LDO with nothing answered → choice spec first, with buttons', async () => {
    const out = await decideGuidedTurn([u('I need an LDO')], noAnswers);
    expect(out?.kind).toBe('ask');
    if (out?.kind === 'ask') {
      expect(out.message).toBe('Which output type do you need?');
      expect(out.choices?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('CONTINUATION: answering the system question advances the flow (no intent words needed)', async () => {
    const convo = [
      u('I need an NTC thermistor'),
      a(renderValuesQuestion(['Resistance @ 25°C (R25)', 'B-Value (B-Constant)', 'Package / Case'])),
      u('10 ohm, 3500K, any package'),
    ];
    // Parser reports R25 + B-value given, package = "any" (null).
    const parse = async (): Promise<GuidedAnswerMap> => ({
      resistance_r25: { value: 10, unit: 'ohm' },
      b_value: { value: 3500, unit: 'K' },
      package_case: { value: null },
    });
    const out = await decideGuidedTurn(convo, parse);
    expect(out?.kind).toBe('search');
    if (out?.kind === 'search') {
      const ids = out.constraints.map(c => c.attribute).sort();
      expect(ids).toEqual(['b_value', 'resistance_r25']); // package dropped (any)
      expect(out.partType).toBe('NTC Thermistors');
      expect(out.query.length).toBeGreaterThan(0);
    }
  });

  it('CLASSIFIER FALLBACK: an unrecognized sourcing phrase is OWNED via the classifier', async () => {
    const out = await decideGuidedTurn([u('I need a gizmo for my board')], noAnswers, false, async () => 'C4');
    expect(out?.kind).toBe('ask'); // system asks C4's first spec
    if (out?.kind === 'ask') expect(isSystemGuidedQuestion(out.message)).toBe(true);
  });

  it('CLASSIFIER FALLBACK: returns null (not a component) → defers to the chat path', async () => {
    expect(await decideGuidedTurn([u('I need a gizmo for my board')], noAnswers, false, async () => null)).toBeNull();
  });

  it('CLASSIFIER is NOT called for a deterministically-recognized type (no wasted LLM call)', async () => {
    let called = false;
    const spy = async () => { called = true; return 'C4'; };
    const out = await decideGuidedTurn([u('I need a BJT')], noAnswers, false, spy);
    expect(called).toBe(false); // pinFamily already resolved B6
    expect(out?.kind).toBe('ask');
  });

  it('CLASSIFIER is NOT called for a theory question (stays with the chat path)', async () => {
    let called = false;
    const spy = async () => { called = true; return 'C4'; };
    const out = await decideGuidedTurn([u('what is a capacitor?')], noAnswers, false, spy);
    expect(called).toBe(false);
    expect(out).toBeNull();
  });

  it('CONTINUATION: partial answers → asks only the remaining required spec', async () => {
    const convo = [
      u('I need an NTC thermistor'),
      a(renderValuesQuestion(['Resistance @ 25°C (R25)', 'B-Value (B-Constant)', 'Package / Case'])),
      u('10k and 3500K'),
    ];
    const parse = async (): Promise<GuidedAnswerMap> => ({
      resistance_r25: { value: 10000, unit: 'ohm' },
      b_value: { value: 3500, unit: 'K' },
    });
    const out = await decideGuidedTurn(convo, parse);
    expect(out?.kind).toBe('ask'); // package_case still missing
    if (out?.kind === 'ask') expect(isSystemGuidedQuestion(out.message)).toBe(true);
  });
});

describe('hasSelectionIntent — inflected verb stems (the trailing-\\b bug, #5)', () => {
  it.each([
    'choosing a capacitor',
    'help me choose an LDO',
    'sourcing a regulator',
    'source a MOSFET',
    'designing a board',
    'I want to select a diode',
    'requires a buck converter',
  ])('recognizes sourcing intent in "%s"', (t) => {
    expect(hasSelectionIntent(t)).toBe(true);
  });
  it('does not over-match a bare theory question', () => {
    expect(hasSelectionIntent('what is a capacitor?')).toBe(false);
    expect(hasSelectionIntent("what's the difference between NTC and PTC?")).toBe(false);
  });
});

describe('decideGuidedTurn — review-fix regressions', () => {
  it('#3: a bare ambiguous supertype (no intent word) still disambiguates', async () => {
    const out = await decideGuidedTurn([u('regulator')], noAnswers);
    expect(out?.kind).toBe('ask');
    if (out?.kind === 'ask') {
      expect(out.message).toBe(renderDisambiguationQuestion());
      expect(out.choices?.map(c => c.id)).toEqual(['C1', 'C2']);
    }
  });

  it('#11: theory + intent together (names a family) defers to the LLM', async () => {
    const out = await decideGuidedTurn(
      [u('I need help understanding the difference between an LDO and a switching regulator')],
      noAnswers,
    );
    expect(out).toBeNull();
  });

  it('#12: a part number referenced inside a typed request defers (lookup, not a checklist)', async () => {
    expect(await decideGuidedTurn([u('I need an LDO like AMS1117')], noAnswers)).toBeNull();
  });

  it('#4: a part-number pivot mid-flow escapes to lookup (not re-asked)', async () => {
    const convo = [
      u('I need an LDO'),
      a('Which output type do you need?'),
      u('actually look up AMS1117 instead'),
    ];
    expect(await decideGuidedTurn(convo, noAnswers)).toBeNull();
  });

  it('#4: a theory question mid-flow defers so the LLM can answer it', async () => {
    const convo = [
      u('I need an NTC thermistor'),
      a(renderValuesQuestion(['Resistance @ 25°C (R25)', 'B-Value (B-Constant)', 'Package / Case'])),
      u('what is a B-value?'),
    ];
    expect(await decideGuidedTurn(convo, noAnswers)).toBeNull();
  });

  it('#8: an incidental part-type noun in a spec answer does NOT re-pin the family', async () => {
    const convo = [
      u('I need an NTC thermistor'),
      a(renderValuesQuestion(['Resistance @ 25°C (R25)', 'B-Value (B-Constant)', 'Package / Case'])),
      u('10kΩ, 3500K, any package — it feeds an LDO'),
    ];
    const parse = async (): Promise<GuidedAnswerMap> => ({
      resistance_r25: { value: 10000, unit: 'ohm' },
      b_value: { value: 3500, unit: 'K' },
      package_case: { value: null },
    });
    const out = await decideGuidedTurn(convo, parse);
    expect(out?.kind).toBe('search');
    // The "LDO" mention is incidental; the family stays anchored to the NTC entry.
    if (out?.kind === 'search') expect(out.partType).toBe('NTC Thermistors');
  });

  it('CLASSIFIER CONTINUATION: turn 2 of a classifier-entered flow recovers the family via the ENTRY message', async () => {
    const convo = [
      u('I need a doohickey for my board'),       // unresolvable by the keyword recognizer
      a('Which device type do you need?'),         // a system spec question (C4 device_type)
      u('comparator'),
    ];
    let classifiedWith: string | null = null;
    const classify = async (text: string): Promise<string | null> => { classifiedWith = text; return 'C4'; };
    const parse = async (): Promise<GuidedAnswerMap> => ({ device_type: { value: 'Comparator' } });
    const out = await decideGuidedTurn(convo, parse, false, classify);
    expect(out?.kind).toBe('ask');                 // system asks C4's next spec, not abandoned to the LLM
    // Recovery classifies the flow ENTRY, not the spec answer "comparator".
    expect(classifiedWith).toBe('I need a doohickey for my board');
  });
});
