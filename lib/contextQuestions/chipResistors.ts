import { FamilyContextConfig } from '../types';

export const chipResistorsContext: FamilyContextConfig = {
  familyIds: ['52'],
  contextSensitivity: 'low',
  questions: [
    {
      questionId: 'precision',
      questionText: 'Is this a precision or instrumentation application?',
      priority: 1,
      options: [
        {
          value: 'yes',
          label: 'Yes — precision / instrumentation',
          description: 'TCR and tolerance thresholds tighten; thin film composition may be required',
          attributeEffects: [
            { attributeId: 'tolerance', effect: 'escalate_to_primary', note: 'Precision application — tighter tolerance matching required' },
            { attributeId: 'tcr', effect: 'escalate_to_primary', note: 'Precision application — low TCR is critical for measurement stability' },
            { attributeId: 'composition', effect: 'escalate_to_primary', note: 'Thin film composition preferred for lower TCR and tighter tolerance' },
          ],
        },
        {
          value: 'no',
          label: 'No — general purpose',
          description: 'Standard parametric matching is sufficient',
          attributeEffects: [],
        },
      ],
    },
    {
      questionId: 'environment',
      questionText: 'What environment is this for?',
      priority: 2,
      options: [
        {
          value: 'automotive',
          label: 'Automotive',
          description: 'AEC-Q200 qualification becomes mandatory',
          attributeEffects: [
            { attributeId: 'aec_q200', effect: 'escalate_to_mandatory', note: 'Automotive application — AEC-Q200 qualification is required' },
          ],
        },
        {
          value: 'industrial_sulfur',
          label: 'Industrial with sulfur exposure',
          description: 'Anti-sulfur termination becomes mandatory',
          attributeEffects: [
            { attributeId: 'anti_sulfur', effect: 'escalate_to_mandatory', note: 'Sulfur-rich environment — anti-sulfur termination is required to prevent open-circuit failure' },
          ],
        },
        {
          value: 'standard',
          label: 'Standard / consumer',
          description: 'No additional environmental flags needed',
          attributeEffects: [],
        },
      ],
    },
  ],
};
