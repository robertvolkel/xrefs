import { FamilyContextConfig } from '../types';

export const aluminumPolymerContext: FamilyContextConfig = {
  familyIds: ['60'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'ripple_frequency',
      questionText: 'What is the switching/ripple frequency?',
      priority: 1,
      options: [
        {
          value: '120hz',
          label: '120 Hz (mains rectified)',
          description: 'Datasheet ripple current rating at 120 Hz applies directly',
          attributeEffects: [],
        },
        {
          value: 'high_freq',
          label: 'Specific high frequency (>10 kHz)',
          description: 'Ripple current rating varies with frequency — verify derating',
          attributeEffects: [
            { attributeId: 'ripple_current', effect: 'add_review_flag', note: 'High-frequency ripple — ripple current rating is frequency-dependent. Verify manufacturer derating curve at actual switching frequency.' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Must verify ripple current rating at actual frequency',
          attributeEffects: [
            { attributeId: 'ripple_current', effect: 'add_review_flag', note: 'Unknown ripple frequency — must verify ripple current derating at actual frequency before finalizing replacement' },
          ],
        },
      ],
    },
    {
      questionId: 'esr_primary',
      questionText: 'Is ESR the primary selection criterion?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — chose polymer for ESR',
          description: 'ESR matching becomes mandatory — the primary reason for selecting polymer over standard electrolytic',
          attributeEffects: [
            { attributeId: 'esr', effect: 'escalate_to_mandatory', note: 'ESR is the primary criterion for polymer selection — replacement must match or beat ESR specification' },
          ],
        },
        {
          value: 'no',
          label: 'No — standard selection',
          description: 'Standard ESR matching is sufficient',
          attributeEffects: [],
        },
      ],
    },
    {
      questionId: 'environment',
      questionText: 'What environment is this for?',
      priority: 3,
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
          value: 'standard',
          label: 'Standard / consumer',
          description: 'No additional environmental flags needed',
          attributeEffects: [],
        },
      ],
    },
  ],
};
