import { applyContextToLogicTable } from '@/lib/services/contextModifier';
import {
  LogicTable,
  MatchingRule,
  ApplicationContext,
  FamilyContextConfig,
  ContextQuestion,
  ContextOption,
} from '@/lib/types';

// ============================================================
// HELPERS
// ============================================================

function makeRule(id: string, overrides: Partial<MatchingRule> = {}): MatchingRule {
  return {
    attributeId: id,
    attributeName: id,
    logicType: 'identity',
    weight: 5,
    engineeringReason: 'test',
    sortOrder: 0,
    ...overrides,
  };
}

function makeTable(rules: MatchingRule[]): LogicTable {
  return {
    familyId: '12',
    familyName: 'MLCC',
    category: 'Passives',
    description: 'Test',
    rules,
  };
}

function makeOption(value: string, effects: { attributeId: string; effect: ContextOption['attributeEffects'][0]['effect']; note?: string; blockOnMissing?: boolean }[]): ContextOption {
  return {
    value,
    label: value,
    attributeEffects: effects.map(e => ({
      attributeId: e.attributeId,
      effect: e.effect,
      note: e.note,
      blockOnMissing: e.blockOnMissing,
    })),
  };
}

function makeQuestion(id: string, options: ContextOption[]): ContextQuestion {
  return {
    questionId: id,
    questionText: `Question ${id}?`,
    options,
    priority: 1,
  };
}

function makeConfig(questions: ContextQuestion[]): FamilyContextConfig {
  return {
    familyIds: ['12'],
    contextSensitivity: 'high',
    questions,
  };
}

function makeContext(answers: Record<string, string>): ApplicationContext {
  return {
    familyId: '12',
    answers,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('contextModifier', () => {
  describe('applyContextToLogicTable', () => {
    it('does not mutate the original logic table', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(lt.rules[0].weight).toBe(3); // original untouched
      expect(result.rules[0].weight).toBe(10);
    });

    // --- escalate_to_mandatory ---

    it('escalate_to_mandatory sets weight to 10', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
    });

    it('escalate_to_mandatory updates engineeringReason when note provided', () => {
      const lt = makeTable([makeRule('aec_q200', { engineeringReason: 'original' })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{
            attributeId: 'aec_q200',
            effect: 'escalate_to_mandatory',
            note: 'Automotive requires AEC-Q200',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].engineeringReason).toBe('Automotive requires AEC-Q200');
    });

    // --- escalate_to_primary ---

    it('escalate_to_primary sets weight to at least 9', () => {
      const lt = makeTable([makeRule('tolerance', { weight: 4 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('precision', [{ attributeId: 'tolerance', effect: 'escalate_to_primary' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'precision' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(9);
    });

    it('escalate_to_primary preserves weight if already >= 9', () => {
      const lt = makeTable([makeRule('tolerance', { weight: 10 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('precision', [{ attributeId: 'tolerance', effect: 'escalate_to_primary' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'precision' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
    });

    // --- not_applicable ---

    it('not_applicable sets weight to 0', () => {
      const lt = makeTable([makeRule('flexible_termination', { weight: 5 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('no_flex', [{ attributeId: 'flexible_termination', effect: 'not_applicable' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'no_flex' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(0);
    });

    // --- add_review_flag ---

    it('add_review_flag changes logicType to application_review', () => {
      const lt = makeTable([makeRule('dc_bias_derating', { logicType: 'threshold', weight: 5 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('review', [{
            attributeId: 'dc_bias_derating',
            effect: 'add_review_flag',
            note: 'Needs manual DC bias review',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'review' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].logicType).toBe('application_review');
      expect(result.rules[0].engineeringReason).toBe('Needs manual DC bias review');
    });

    // --- set_threshold ---

    it('set_threshold updates engineeringReason but keeps rule type', () => {
      const lt = makeTable([makeRule('voltage_rating', {
        logicType: 'threshold',
        thresholdDirection: 'gte',
        engineeringReason: 'original',
      })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('tight', [{
            attributeId: 'voltage_rating',
            effect: 'set_threshold',
            note: 'Tightened for high-reliability application',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'tight' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].logicType).toBe('threshold');
      expect(result.rules[0].engineeringReason).toBe('Tightened for high-reliability application');
    });

    // --- Unanswered questions are skipped ---

    it('skips unanswered questions', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({}); // no answers
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(3); // unchanged
    });

    // --- Unknown option value is skipped ---

    it('skips answers that do not match any predefined option', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'some-free-text-answer' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(3); // unchanged
    });

    // --- Effect targeting non-existent rule is silently skipped ---

    it('silently skips effects targeting rules not in the logic table', () => {
      const lt = makeTable([makeRule('capacitance')]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('yes', [{ attributeId: 'nonexistent_rule', effect: 'escalate_to_mandatory' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'yes' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules).toHaveLength(1); // no crash, no change
    });

    // --- Last-writer-wins when two questions affect the same rule ---

    it('last-writer-wins when two questions affect the same rule', () => {
      const lt = makeTable([makeRule('aec_q200', { weight: 3 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive', [{ attributeId: 'aec_q200', effect: 'escalate_to_mandatory' }]),
        ]),
        makeQuestion('q2', [
          makeOption('consumer', [{ attributeId: 'aec_q200', effect: 'not_applicable' }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive', q2: 'consumer' });
      const result = applyContextToLogicTable(lt, ctx, config);
      // q1 sets weight=10, then q2 sets weight=0 → last writer wins
      expect(result.rules[0].weight).toBe(0);
    });

    // --- Multiple effects from one option ---

    // --- blockOnMissing propagation ---

    it('propagates blockOnMissing from effect to rule', () => {
      const lt = makeTable([makeRule('tst', { logicType: 'threshold', thresholdDirection: 'lte', weight: 8 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('high_freq', [{
            attributeId: 'tst',
            effect: 'escalate_to_mandatory',
            note: 'BLOCKING at >100kHz',
            blockOnMissing: true,
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'high_freq' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
      expect(result.rules[0].blockOnMissing).toBe(true);
    });

    it('does not set blockOnMissing when effect does not specify it', () => {
      const lt = makeTable([makeRule('tst', { logicType: 'threshold', thresholdDirection: 'lte', weight: 8 })]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('low_freq', [{
            attributeId: 'tst',
            effect: 'escalate_to_primary',
            note: 'Medium frequency',
          }]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'low_freq' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].blockOnMissing).toBeUndefined();
    });

    // --- Multiple effects from one option ---

    it('applies multiple effects from a single option', () => {
      const lt = makeTable([
        makeRule('aec_q200', { weight: 3 }),
        makeRule('tolerance', { weight: 4 }),
      ]);
      const config = makeConfig([
        makeQuestion('q1', [
          makeOption('automotive_precision', [
            { attributeId: 'aec_q200', effect: 'escalate_to_mandatory' },
            { attributeId: 'tolerance', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ q1: 'automotive_precision' });
      const result = applyContextToLogicTable(lt, ctx, config);
      expect(result.rules[0].weight).toBe(10);
      expect(result.rules[1].weight).toBe(9);
    });
  });

  // ----------------------------------------------------------
  // C2 SWITCHING REGULATOR CONTEXT EFFECTS
  // ----------------------------------------------------------
  describe('C2 switching regulator context effects', () => {
    const c2Table = makeTable([
      makeRule('gate_drive_current', { logicType: 'threshold', thresholdDirection: 'gte', weight: 7 }),
      makeRule('control_mode', { logicType: 'identity', weight: 9 }),
      makeRule('aec_q100', { logicType: 'identity_flag', weight: 8 }),
      makeRule('tj_max', { logicType: 'threshold', thresholdDirection: 'gte', weight: 7 }),
      makeRule('vin_max', { logicType: 'threshold', thresholdDirection: 'gte', weight: 8 }),
      makeRule('fsw', { logicType: 'identity', tolerancePercent: 10, weight: 8 }),
      makeRule('ton_min', { logicType: 'threshold', thresholdDirection: 'lte', weight: 7 }),
    ]);

    it('Q1 integrated_switch → gate_drive_current becomes not_applicable (w0)', () => {
      const config = makeConfig([
        makeQuestion('architecture_type', [
          makeOption('integrated_switch', [
            { attributeId: 'gate_drive_current', effect: 'not_applicable' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ architecture_type: 'integrated_switch' });
      const result = applyContextToLogicTable(c2Table, ctx, config);
      const gdcRule = result.rules.find(r => r.attributeId === 'gate_drive_current');
      expect(gdcRule!.weight).toBe(0);
    });

    it('Q2 can_redesign → control_mode becomes application_review', () => {
      const config = makeConfig([
        makeQuestion('comp_redesign', [
          makeOption('can_redesign', [
            { attributeId: 'control_mode', effect: 'add_review_flag' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ comp_redesign: 'can_redesign' });
      const result = applyContextToLogicTable(c2Table, ctx, config);
      const cmRule = result.rules.find(r => r.attributeId === 'control_mode');
      expect(cmRule!.logicType).toBe('application_review');
    });

    it('Q3 automotive → aec_q100 mandatory (w10), tj_max + vin_max escalated', () => {
      const config = makeConfig([
        makeQuestion('automotive', [
          makeOption('yes', [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary' },
            { attributeId: 'vin_max', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ automotive: 'yes' });
      const result = applyContextToLogicTable(c2Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'aec_q100')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'tj_max')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'vin_max')!.weight).toBe(9);
    });

    it('Q4 passives_fixed → fsw becomes mandatory + blockOnMissing', () => {
      const config = makeConfig([
        makeQuestion('passive_flexibility', [
          makeOption('passives_fixed', [
            { attributeId: 'fsw', effect: 'escalate_to_mandatory', blockOnMissing: true },
          ]),
        ]),
      ]);
      const ctx = makeContext({ passive_flexibility: 'passives_fixed' });
      const result = applyContextToLogicTable(c2Table, ctx, config);
      const fswRule = result.rules.find(r => r.attributeId === 'fsw');
      expect(fswRule!.weight).toBe(10);
      expect(fswRule!.blockOnMissing).toBe(true);
    });

    it('Q5 high_conversion_ratio → ton_min mandatory + blockOnMissing', () => {
      const config = makeConfig([
        makeQuestion('high_conversion_ratio', [
          makeOption('yes', [
            { attributeId: 'ton_min', effect: 'escalate_to_mandatory', blockOnMissing: true },
          ]),
        ]),
      ]);
      const ctx = makeContext({ high_conversion_ratio: 'yes' });
      const result = applyContextToLogicTable(c2Table, ctx, config);
      const tonRule = result.rules.find(r => r.attributeId === 'ton_min');
      expect(tonRule!.weight).toBe(10);
      expect(tonRule!.blockOnMissing).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // C3 GATE DRIVER CONTEXT EFFECTS
  // ----------------------------------------------------------
  describe('C3 gate driver context effects', () => {
    const c3Table = makeTable([
      makeRule('output_polarity', { logicType: 'identity_flag', weight: 9 }),
      makeRule('dead_time_control', { logicType: 'identity_flag', weight: 7 }),
      makeRule('dead_time', { logicType: 'threshold', thresholdDirection: 'gte', weight: 7 }),
      makeRule('propagation_delay', { logicType: 'threshold', thresholdDirection: 'lte', weight: 7 }),
      makeRule('bootstrap_diode', { logicType: 'identity_flag', weight: 6 }),
      makeRule('peak_source_current', { logicType: 'threshold', thresholdDirection: 'gte', weight: 8 }),
      makeRule('peak_sink_current', { logicType: 'threshold', thresholdDirection: 'gte', weight: 8 }),
      makeRule('vdd_range', { logicType: 'threshold', thresholdDirection: 'range_superset', weight: 8 }),
      makeRule('aec_q100', { logicType: 'identity_flag', weight: 8 }),
      makeRule('tj_max', { logicType: 'threshold', thresholdDirection: 'gte', weight: 7 }),
      makeRule('fault_reporting', { logicType: 'identity_flag', weight: 5 }),
      makeRule('rth_ja', { logicType: 'threshold', thresholdDirection: 'lte', weight: 6 }),
      makeRule('rise_fall_time', { logicType: 'threshold', thresholdDirection: 'lte', weight: 6 }),
    ]);

    it('Q1 half_bridge → shoot-through safety: output_polarity + dead_time_control + dead_time become BLOCKING', () => {
      const config = makeConfig([
        makeQuestion('driver_topology', [
          makeOption('half_bridge', [
            { attributeId: 'output_polarity', effect: 'escalate_to_mandatory', blockOnMissing: true },
            { attributeId: 'dead_time_control', effect: 'escalate_to_mandatory', blockOnMissing: true },
            { attributeId: 'dead_time', effect: 'escalate_to_mandatory', blockOnMissing: true },
            { attributeId: 'propagation_delay', effect: 'escalate_to_primary' },
            { attributeId: 'bootstrap_diode', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ driver_topology: 'half_bridge' });
      const result = applyContextToLogicTable(c3Table, ctx, config);

      // Shoot-through check 1: polarity BLOCKING
      const polarity = result.rules.find(r => r.attributeId === 'output_polarity');
      expect(polarity!.weight).toBe(10);
      expect(polarity!.blockOnMissing).toBe(true);

      // Shoot-through check 2: dead-time control BLOCKING
      const dtCtrl = result.rules.find(r => r.attributeId === 'dead_time_control');
      expect(dtCtrl!.weight).toBe(10);
      expect(dtCtrl!.blockOnMissing).toBe(true);

      // Shoot-through check 3: dead-time duration BLOCKING
      const dt = result.rules.find(r => r.attributeId === 'dead_time');
      expect(dt!.weight).toBe(10);
      expect(dt!.blockOnMissing).toBe(true);

      // Propagation delay escalated to primary
      const tpd = result.rules.find(r => r.attributeId === 'propagation_delay');
      expect(tpd!.weight).toBe(9);

      // Bootstrap diode escalated
      const bst = result.rules.find(r => r.attributeId === 'bootstrap_diode');
      expect(bst!.weight).toBe(9);
    });

    it('Q1 single → dead_time_control + dead_time become not_applicable', () => {
      const config = makeConfig([
        makeQuestion('driver_topology', [
          makeOption('single', [
            { attributeId: 'dead_time_control', effect: 'not_applicable' },
            { attributeId: 'dead_time', effect: 'not_applicable' },
            { attributeId: 'bootstrap_diode', effect: 'not_applicable' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ driver_topology: 'single' });
      const result = applyContextToLogicTable(c3Table, ctx, config);

      expect(result.rules.find(r => r.attributeId === 'dead_time_control')!.weight).toBe(0);
      expect(result.rules.find(r => r.attributeId === 'dead_time')!.weight).toBe(0);
      expect(result.rules.find(r => r.attributeId === 'bootstrap_diode')!.weight).toBe(0);
    });

    it('Q2 igbt → peak_source_current + peak_sink_current escalated to primary', () => {
      const config = makeConfig([
        makeQuestion('power_device_type', [
          makeOption('igbt', [
            { attributeId: 'peak_source_current', effect: 'escalate_to_primary' },
            { attributeId: 'peak_sink_current', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ power_device_type: 'igbt' });
      const result = applyContextToLogicTable(c3Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'peak_source_current')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'peak_sink_current')!.weight).toBe(9);
    });

    it('Q2 sic_mosfet → vdd_range becomes mandatory + blockOnMissing', () => {
      const config = makeConfig([
        makeQuestion('power_device_type', [
          makeOption('sic_mosfet', [
            { attributeId: 'vdd_range', effect: 'escalate_to_mandatory', blockOnMissing: true },
          ]),
        ]),
      ]);
      const ctx = makeContext({ power_device_type: 'sic_mosfet' });
      const result = applyContextToLogicTable(c3Table, ctx, config);
      const vdd = result.rules.find(r => r.attributeId === 'vdd_range');
      expect(vdd!.weight).toBe(10);
      expect(vdd!.blockOnMissing).toBe(true);
    });

    it('Q3 automotive → aec_q100 mandatory + tj_max + fault_reporting escalated', () => {
      const config = makeConfig([
        makeQuestion('automotive', [
          makeOption('yes', [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary' },
            { attributeId: 'fault_reporting', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ automotive: 'yes' });
      const result = applyContextToLogicTable(c3Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'aec_q100')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'tj_max')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'fault_reporting')!.weight).toBe(9);
    });

    it('Q5 high_frequency → rth_ja + rise_fall_time + propagation_delay escalated', () => {
      const config = makeConfig([
        makeQuestion('high_frequency', [
          makeOption('yes', [
            { attributeId: 'rth_ja', effect: 'escalate_to_primary' },
            { attributeId: 'rise_fall_time', effect: 'escalate_to_primary' },
            { attributeId: 'propagation_delay', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ high_frequency: 'yes' });
      const result = applyContextToLogicTable(c3Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'rth_ja')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'rise_fall_time')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'propagation_delay')!.weight).toBe(9);
    });
  });

  // ============================================================
  // C4: Op-Amps / Comparators Context Effects
  // ============================================================
  describe('C4 Op-Amps / Comparators', () => {
    const c4Table = makeTable([
      makeRule('device_type', { logicType: 'identity', weight: 10 }),
      makeRule('channels', { logicType: 'identity', weight: 10 }),
      makeRule('input_type', { logicType: 'identity_upgrade', weight: 9 }),
      makeRule('output_type', { logicType: 'identity', weight: 8 }),
      makeRule('rail_to_rail_input', { logicType: 'identity_flag', weight: 8 }),
      makeRule('gain_bandwidth', { logicType: 'threshold', weight: 8 }),
      makeRule('min_stable_gain', { logicType: 'threshold', weight: 8 }),
      makeRule('response_time', { logicType: 'threshold', weight: 7 }),
      makeRule('input_bias_current', { logicType: 'threshold', weight: 7 }),
      makeRule('input_offset_voltage', { logicType: 'threshold', weight: 7 }),
      makeRule('input_noise_voltage', { logicType: 'threshold', weight: 6 }),
      makeRule('avol', { logicType: 'threshold', weight: 5 }),
      makeRule('cmrr', { logicType: 'threshold', weight: 5 }),
      makeRule('psrr', { logicType: 'threshold', weight: 5 }),
      makeRule('aec_q100', { logicType: 'identity_flag', weight: 8 }),
      makeRule('operating_temp', { logicType: 'threshold', weight: 7 }),
    ]);

    it('Q1=comparator: gain_bandwidth and min_stable_gain become not_applicable', () => {
      const config = makeConfig([
        makeQuestion('device_function', [
          makeOption('comparator', [
            { attributeId: 'gain_bandwidth', effect: 'not_applicable' },
            { attributeId: 'min_stable_gain', effect: 'not_applicable' },
            { attributeId: 'output_type', effect: 'escalate_to_primary' },
            { attributeId: 'response_time', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ device_function: 'comparator' });
      const result = applyContextToLogicTable(c4Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'gain_bandwidth')!.weight).toBe(0);
      expect(result.rules.find(r => r.attributeId === 'min_stable_gain')!.weight).toBe(0);
      expect(result.rules.find(r => r.attributeId === 'output_type')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'response_time')!.weight).toBe(9);
    });

    it('Q1=op_amp: output_type and response_time become not_applicable', () => {
      const config = makeConfig([
        makeQuestion('device_function', [
          makeOption('op_amp', [
            { attributeId: 'output_type', effect: 'not_applicable' },
            { attributeId: 'response_time', effect: 'not_applicable' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ device_function: 'op_amp' });
      const result = applyContextToLogicTable(c4Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'output_type')!.weight).toBe(0);
      expect(result.rules.find(r => r.attributeId === 'response_time')!.weight).toBe(0);
    });

    it('Q2=high: input_type escalated to mandatory with blockOnMissing', () => {
      const config = makeConfig([
        makeQuestion('source_impedance', [
          makeOption('high', [
            { attributeId: 'input_type', effect: 'escalate_to_mandatory', blockOnMissing: true },
            { attributeId: 'input_bias_current', effect: 'escalate_to_mandatory', blockOnMissing: true },
          ]),
        ]),
      ]);
      const ctx = makeContext({ source_impedance: 'high' });
      const result = applyContextToLogicTable(c4Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'input_type')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'input_type')!.blockOnMissing).toBe(true);
      expect(result.rules.find(r => r.attributeId === 'input_bias_current')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'input_bias_current')!.blockOnMissing).toBe(true);
    });

    it('Q3=precision: avol escalated to primary, input_offset_voltage to mandatory', () => {
      const config = makeConfig([
        makeQuestion('precision_application', [
          makeOption('yes', [
            { attributeId: 'avol', effect: 'escalate_to_primary' },
            { attributeId: 'input_offset_voltage', effect: 'escalate_to_mandatory', blockOnMissing: true },
            { attributeId: 'cmrr', effect: 'escalate_to_primary' },
            { attributeId: 'psrr', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ precision_application: 'yes' });
      const result = applyContextToLogicTable(c4Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'avol')!.weight).toBe(9);
      expect(result.rules.find(r => r.attributeId === 'input_offset_voltage')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'input_offset_voltage')!.blockOnMissing).toBe(true);
      expect(result.rules.find(r => r.attributeId === 'cmrr')!.weight).toBe(9);
    });

    it('Q4=unity: min_stable_gain escalated to mandatory with blockOnMissing', () => {
      const config = makeConfig([
        makeQuestion('circuit_gain', [
          makeOption('unity', [
            { attributeId: 'min_stable_gain', effect: 'escalate_to_mandatory', blockOnMissing: true },
          ]),
        ]),
      ]);
      const ctx = makeContext({ circuit_gain: 'unity' });
      const result = applyContextToLogicTable(c4Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'min_stable_gain')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'min_stable_gain')!.blockOnMissing).toBe(true);
    });

    it('Q5=automotive: aec_q100 escalated to mandatory', () => {
      const config = makeConfig([
        makeQuestion('automotive', [
          makeOption('yes', [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', blockOnMissing: true },
            { attributeId: 'operating_temp', effect: 'escalate_to_primary' },
          ]),
        ]),
      ]);
      const ctx = makeContext({ automotive: 'yes' });
      const result = applyContextToLogicTable(c4Table, ctx, config);
      expect(result.rules.find(r => r.attributeId === 'aec_q100')!.weight).toBe(10);
      expect(result.rules.find(r => r.attributeId === 'aec_q100')!.blockOnMissing).toBe(true);
      expect(result.rules.find(r => r.attributeId === 'operating_temp')!.weight).toBe(9);
    });
  });
});
