import { FamilyContextConfig } from '../types';

export const ntcThermistorContext: FamilyContextConfig = {
  familyIds: ['67'],
  contextSensitivity: 'critical',
  questions: [
    {
      questionId: 'function',
      questionText: "What is this thermistor's function?",
      required: true,
      priority: 1,
      options: [
        {
          value: 'sensing',
          label: 'NTC — Temperature sensing',
          description: 'R25, B-value, tolerances, and R-T curve accuracy are primary',
          attributeEffects: [
            { attributeId: 'resistance_r25', effect: 'escalate_to_mandatory', note: 'Sensing — R25 must match precisely for temperature measurement accuracy' },
            { attributeId: 'b_value', effect: 'escalate_to_mandatory', note: 'Sensing — B-value determines the R-T curve shape and measurement accuracy' },
            { attributeId: 'r25_tolerance', effect: 'escalate_to_primary', note: 'Sensing — R25 tolerance directly affects measurement accuracy' },
            { attributeId: 'b_value_tolerance', effect: 'escalate_to_primary', note: 'Sensing — B-value tolerance affects curve accuracy at temperature extremes' },
            { attributeId: 'rt_curve', effect: 'escalate_to_primary', note: 'Sensing — R-T curve/Steinhart-Hart must match for accurate readings' },
            { attributeId: 'long_term_stability', effect: 'escalate_to_primary', note: 'Sensing — long-term resistance drift degrades measurement accuracy over time' },
            { attributeId: 'thermal_time_constant', effect: 'add_review_flag', note: 'Sensing — thermal time constant matters for fast response loops' },
            { attributeId: 'dissipation_constant', effect: 'add_review_flag', note: 'Sensing — self-heating error depends on dissipation constant' },
          ],
        },
        {
          value: 'inrush',
          label: 'NTC — Inrush current limiting',
          description: 'Cold resistance, max current, max power, and thermal recovery are primary',
          attributeEffects: [
            { attributeId: 'resistance_r25', effect: 'escalate_to_primary', note: 'Inrush — cold resistance (R0/R25) determines initial current limiting' },
            { attributeId: 'max_power', effect: 'escalate_to_mandatory', note: 'Inrush — max power rating must handle the energy dissipated during inrush' },
            { attributeId: 'max_steady_state_current', effect: 'escalate_to_mandatory', note: 'Inrush limiter — max steady-state current must handle the continuous load after inrush' },
            { attributeId: 'b_value', effect: 'not_applicable', note: 'Inrush — B-value precision is irrelevant for current limiting' },
            { attributeId: 'b_value_tolerance', effect: 'not_applicable', note: 'Inrush — B-value tolerance is irrelevant' },
            { attributeId: 'rt_curve', effect: 'not_applicable', note: 'Inrush — R-T curve matching is irrelevant' },
            { attributeId: 'r25_tolerance', effect: 'not_applicable', note: 'Inrush — tight R25 tolerance is not needed' },
            { attributeId: 'dissipation_constant', effect: 'not_applicable', note: 'Inrush — dissipation constant is irrelevant' },
          ],
        },
        {
          value: 'compensation',
          label: 'NTC — Temperature compensation',
          description: 'R25 and B-value must match the compensation target exactly; drift matters',
          attributeEffects: [
            { attributeId: 'resistance_r25', effect: 'escalate_to_mandatory', note: 'Compensation — R25 must match the target exactly' },
            { attributeId: 'b_value', effect: 'escalate_to_mandatory', note: 'Compensation — B-value must match the compensation target exactly' },
            { attributeId: 'r25_tolerance', effect: 'escalate_to_primary', note: 'Compensation — tolerance on R25 is critical for accuracy' },
            { attributeId: 'b_value_tolerance', effect: 'escalate_to_primary', note: 'Compensation — tolerance on B-value is critical' },
            { attributeId: 'long_term_stability', effect: 'escalate_to_primary', note: 'Compensation — long-term drift degrades compensation accuracy' },
          ],
        },
      ],
    },
    {
      questionId: 'accuracy',
      questionText: 'What temperature accuracy do you need?',
      priority: 2,
      condition: { questionId: 'function', values: ['sensing'] },
      options: [
        {
          value: 'standard',
          label: 'Standard (±1-2°C)',
          description: 'R25 tolerance ≤5%, B-value tolerance ≤3% — B-value matching is sufficient',
          attributeEffects: [],
        },
        {
          value: 'precision',
          label: 'Precision (±0.5°C or better)',
          description: 'R25 tolerance ≤1%, B-value tolerance ≤1% — Steinhart-Hart verification required',
          attributeEffects: [
            { attributeId: 'r25_tolerance', effect: 'escalate_to_mandatory', note: 'Precision sensing — R25 tolerance ≤1% required' },
            { attributeId: 'b_value_tolerance', effect: 'escalate_to_mandatory', note: 'Precision sensing — B-value tolerance ≤1% required' },
            { attributeId: 'rt_curve', effect: 'escalate_to_mandatory', note: 'Precision sensing — must verify R-T curve point-by-point, not just B-value' },
            { attributeId: 'interchangeability', effect: 'escalate_to_mandatory', note: 'Precision sensing — interchangeability curve compliance is critical' },
            { attributeId: 'long_term_stability', effect: 'escalate_to_mandatory', note: 'Precision sensing — long-term drift degrades measurement accuracy' },
          ],
        },
      ],
    },
    {
      questionId: 'firmware_rt',
      questionText: 'Is the R-T curve encoded in firmware?',
      priority: 3,
      condition: { questionId: 'function', values: ['sensing'] },
      options: [
        {
          value: 'yes',
          label: 'Yes — lookup table or Steinhart-Hart in code',
          description: 'Replacement must conform to the same R-T curve or firmware must be updated',
          attributeEffects: [
            { attributeId: 'rt_curve', effect: 'escalate_to_mandatory', note: 'Firmware-coupled R-T curve — replacement must match exactly or firmware must be updated' },
            { attributeId: 'interchangeability', effect: 'escalate_to_mandatory', note: 'Firmware coupling — must use same interchangeability series or verify curve point-by-point' },
          ],
        },
        {
          value: 'no',
          label: 'No — analog circuit (voltage divider + comparator)',
          description: 'B-value match is sufficient — curve shape at extremes matters less',
          attributeEffects: [],
        },
      ],
    },
  ],
};
