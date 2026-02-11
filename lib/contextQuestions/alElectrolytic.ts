import { FamilyContextConfig } from '../types';

export const alElectrolyticContext: FamilyContextConfig = {
  familyIds: ['58'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'ripple_frequency',
      questionText: 'What is the switching / ripple frequency?',
      priority: 1,
      options: [
        {
          value: '120hz',
          label: '120Hz (mains rectification)',
          description: 'Use the datasheet ripple current value directly',
          attributeEffects: [],
        },
        {
          value: 'high_frequency',
          label: 'High frequency (switching supply)',
          description: 'Ripple current increases at higher frequencies (1.4-1.7x at 100kHz vs. 120Hz)',
          attributeEffects: [
            { attributeId: 'ripple_current', effect: 'escalate_to_primary', note: 'High-frequency switching — ripple current capability increases at higher frequencies, must verify frequency multiplier' },
            { attributeId: 'esr', effect: 'escalate_to_primary', note: 'ESR decreases at higher frequencies — important for switching converter performance' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Will use 120Hz baseline and flag for review if used in a switching converter',
          attributeEffects: [
            { attributeId: 'ripple_current', effect: 'add_review_flag', note: 'Unknown ripple frequency — verify ripple current rating at actual operating frequency' },
          ],
        },
      ],
    },
    {
      questionId: 'ambient_temp',
      questionText: 'What is the actual ambient temperature?',
      priority: 2,
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 65°C, 85°C, or "unknown"',
      options: [
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Cannot optimize for lifetime — will use rated lifetime as the hard threshold',
          attributeEffects: [
            { attributeId: 'lifetime', effect: 'add_review_flag', note: 'Unknown ambient temperature — cannot calculate effective lifetime (doubles every 10°C below rated)' },
          ],
        },
      ],
    },
    {
      questionId: 'polarization',
      questionText: 'Is this a polarized or non-polarized application?',
      priority: 3,
      options: [
        {
          value: 'polarized',
          label: 'Polarized (DC with consistent polarity)',
          description: 'Standard polar electrolytics are fine',
          attributeEffects: [],
        },
        {
          value: 'non_polarized',
          label: 'Non-polarized / bipolar (AC coupling)',
          description: 'Bipolar/non-polarized electrolytics required — reverse voltage causes gas generation and venting',
          attributeEffects: [
            { attributeId: 'polarization', effect: 'escalate_to_mandatory', note: 'Non-polarized application — standard polar cap cannot be used, reverse voltage causes gas generation and venting' },
          ],
        },
      ],
    },
  ],
};
