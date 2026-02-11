import { FamilyContextConfig } from '../types';

export const tantalumContext: FamilyContextConfig = {
  familyIds: ['59'],
  contextSensitivity: 'high',
  questions: [
    {
      questionId: 'safety_critical',
      questionText: 'Is safety-critical failure mode a concern?',
      priority: 1,
      options: [
        {
          value: 'yes',
          label: 'Yes — cannot tolerate short/ignition',
          description: 'MnO2 types must be flagged or excluded; polymer types fail benignly (open circuit)',
          attributeEffects: [
            { attributeId: 'failure_mode', effect: 'escalate_to_mandatory', note: 'Safety-critical — MnO2 tantalums can fail as short-circuit with ignition risk. Polymer types fail benignly (open circuit). Do not replace polymer with MnO2.' },
            { attributeId: 'capacitor_type', effect: 'escalate_to_mandatory', note: 'Safety-critical — polymer construction strongly preferred over MnO2 for benign failure mode' },
          ],
        },
        {
          value: 'no',
          label: 'No — adequate circuit protection exists',
          description: 'Both MnO2 and polymer are acceptable, but failure mode will still be flagged',
          attributeEffects: [
            { attributeId: 'failure_mode', effect: 'add_review_flag', note: 'Circuit has protection, but failure mode difference should still be noted for awareness' },
          ],
        },
      ],
    },
    {
      questionId: 'voltage_derating',
      questionText: 'What is the operating voltage as a percentage of rated?',
      priority: 2,
      options: [
        {
          value: '50_percent',
          label: 'Following 50% derating rule',
          description: 'Industry best practice — operating at ≤50% of rated dramatically reduces failure rate',
          attributeEffects: [],
        },
        {
          value: 'above_50',
          label: 'Operating above 50% of rated',
          description: 'High risk with MnO2 types — flag all candidates',
          attributeEffects: [
            { attributeId: 'voltage_rated', effect: 'escalate_to_primary', note: 'Operating above 50% derating — higher failure risk, especially with MnO2 construction' },
            { attributeId: 'failure_mode', effect: 'escalate_to_primary', note: 'Risk assessment changes significantly when operating above 50% voltage derating' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Assume worst case — flag for review',
          attributeEffects: [
            { attributeId: 'voltage_rated', effect: 'add_review_flag', note: 'Unknown voltage derating practice — verify operating voltage vs. rated for reliability assessment' },
          ],
        },
      ],
    },
    {
      questionId: 'inrush_protection',
      questionText: 'Does the circuit have inrush/surge protection?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — series resistance or soft-start',
          description: 'Surge current is managed — standard matching on ESR and voltage',
          attributeEffects: [],
        },
        {
          value: 'no',
          label: 'No — hard power-on into capacitor',
          description: 'Surge current is unmanaged — MnO2 types are particularly vulnerable',
          attributeEffects: [
            { attributeId: 'surge_voltage', effect: 'escalate_to_primary', note: 'No inrush protection — surge voltage rating is critical' },
            { attributeId: 'esr', effect: 'add_review_flag', note: 'No inrush protection — lower ESR means higher inrush current, more stress on the capacitor' },
          ],
        },
      ],
    },
  ],
};
