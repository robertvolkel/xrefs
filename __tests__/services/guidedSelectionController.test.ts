import {
  decideGuidedTurn,
  renderChoiceQuestion,
  renderValuesQuestion,
  renderDisambiguationQuestion,
  isSystemGuidedQuestion,
  detectAmbiguity,
  hasSelectionIntent,
  isLikelyTheory,
} from '@/lib/services/guidedSelectionController';
import { resolveFamilyFromText } from '@/lib/logicTables';
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
    expect(detectAmbiguity('I need an NTC thermistor')).toBeNull();
  });
  it('every disambiguation label resolves back to its intended family (clicked chip re-pins)', () => {
    for (const text of ['I need a regulator', 'I need a transistor']) {
      for (const opt of detectAmbiguity(text)!) {
        expect(resolveFamilyFromText(opt.label)).toBe(opt.familyId);
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
