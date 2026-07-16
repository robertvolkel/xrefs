import { nextGuidedStep, GuidedAnswerMap } from '@/lib/services/guidedSelection';

describe('nextGuidedStep — system-driven guided selection', () => {
  it('returns null for an unknown family (caller falls back)', () => {
    expect(nextGuidedStep('ZZ', {})).toBeNull();
  });

  it('asks choice-specs ONE at a time, in order (C1 LDO)', () => {
    // No answers → first choice spec (output_type).
    const s0 = nextGuidedStep('C1', {});
    expect(s0).toMatchObject({ type: 'ask_choice' });
    if (s0?.type === 'ask_choice') {
      expect(s0.attr.attributeId).toBe('output_type');
      expect(s0.attr.input).toBe('choice');
      expect(s0.attr.options).toEqual(['Fixed', 'Adjustable', 'Tracking', 'Negative']);
    }

    // output_type answered → next choice spec (polarity), NOT a value yet.
    const s1 = nextGuidedStep('C1', { output_type: { value: 'Fixed' } });
    expect(s1).toMatchObject({ type: 'ask_choice' });
    if (s1?.type === 'ask_choice') expect(s1.attr.attributeId).toBe('polarity');
  });

  it('batches all remaining typed-value specs into ONE prose turn — INCLUDING the input voltage', () => {
    const answered: GuidedAnswerMap = { output_type: { value: 'Fixed' }, polarity: { value: 'Positive' } };
    const step = nextGuidedStep('C1', answered);
    expect(step?.type).toBe('ask_values');
    if (step?.type === 'ask_values') {
      // `vin_max` is the whole point of the selection review: an LDO converts Vin→Vout and the
      // agent never once asked for Vin. A 60 V rail into a 6 V part is a hard safety failure.
      expect(step.attrs.map(a => a.attributeId)).toEqual([
        'output_voltage',
        'iout_max',
        'vin_max',
        'package_case',
      ]);
      expect(step.attrs.every(a => a.input === 'value')).toBe(true);
    }
  });

  it('searches once Tier 2 is complete, with answers as constraints', () => {
    const answered: GuidedAnswerMap = {
      output_type: { value: 'Fixed' },
      polarity: { value: 'Positive' },
      output_voltage: { value: 3.3, unit: 'V' },
      iout_max: { value: 500, unit: 'mA' },
      vin_max: { value: 12, unit: 'V' },
      package_case: { value: 'SOT-23' },
    };
    const step = nextGuidedStep('C1', answered);
    expect(step?.type).toBe('search');
    if (step?.type === 'search') {
      expect(step.constraints).toContainEqual({ attribute: 'output_voltage', value: 3.3, unit: 'V' });
      expect(step.constraints).toContainEqual({ attribute: 'iout_max', value: 500, unit: 'mA' });
      expect(step.constraints).toContainEqual({ attribute: 'vin_max', value: 12, unit: 'V' });
      expect(step.constraints).toContainEqual({ attribute: 'output_type', value: 'Fixed' });
    }
  });

  it('treats "any / not sure" (value null) as answered but drops it from constraints', () => {
    const answered: GuidedAnswerMap = {
      output_type: { value: 'Fixed' },
      polarity: { value: 'Positive' },
      output_voltage: { value: 3.3, unit: 'V' },
      iout_max: { value: 500, unit: 'mA' },
      vin_max: { value: 12, unit: 'V' },
      package_case: { value: null }, // user said "any / not sure" — must not block the search
    };
    const step = nextGuidedStep('C1', answered);
    expect(step?.type).toBe('search');
    if (step?.type === 'search') {
      expect(step.constraints.find(c => c.attribute === 'package_case')).toBeUndefined();
      expect(step.constraints.length).toBe(5);
    }
  });

  it('sequences two leading choice-specs one-per-turn (C2 switching reg)', () => {
    // C2 Tier 2 starts topology + architecture — both choices; must be asked separately.
    const s0 = nextGuidedStep('C2', {});
    expect(s0).toMatchObject({ type: 'ask_choice' });
    if (s0?.type === 'ask_choice') expect(s0.attr.attributeId).toBe('topology');

    const s1 = nextGuidedStep('C2', { topology: { value: 'Buck' } });
    expect(s1).toMatchObject({ type: 'ask_choice' });
    if (s1?.type === 'ask_choice') expect(s1.attr.attributeId).toBe('architecture');
  });
});
