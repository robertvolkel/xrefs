import { FamilyContextConfig } from '../types';

export const micaCapacitorsContext: FamilyContextConfig = {
  familyIds: ['13'],
  contextSensitivity: 'low',
  questions: [
    {
      questionId: 'environment',
      questionText: 'What environment is this for?',
      priority: 1,
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
          value: 'military',
          label: 'Military / aerospace',
          description: 'MIL-spec compliance becomes mandatory',
          attributeEffects: [
            { attributeId: 'mil_spec', effect: 'escalate_to_mandatory', note: 'Military/aerospace application — MIL-spec compliance is required' },
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
