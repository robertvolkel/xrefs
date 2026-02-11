import { FamilyContextConfig } from '../types';

export const ferriteBeadContext: FamilyContextConfig = {
  familyIds: ['70'],
  contextSensitivity: 'high',
  questions: [
    {
      questionId: 'signal_or_power',
      questionText: 'Is this ferrite bead on a power rail or a signal line?',
      priority: 1,
      options: [
        {
          value: 'power',
          label: 'Power rail',
          description: 'Filtering a DC supply rail (e.g., 3.3V, 5V, 12V)',
          attributeEffects: [
            { attributeId: 'rated_current', effect: 'escalate_to_primary', note: 'Rated current is critical on power rails — must exceed peak load current with margin' },
            { attributeId: 'dcr', effect: 'escalate_to_primary', note: 'DCR causes voltage drop on the supply rail (Vdrop = I × DCR)' },
            { attributeId: 'signal_integrity', effect: 'not_applicable', note: 'Signal integrity is not relevant for power rail filtering' },
          ],
        },
        {
          value: 'signal',
          label: 'Signal line',
          description: 'Filtering a data or clock signal (e.g., I2C, SPI, clock)',
          attributeEffects: [
            { attributeId: 'signal_integrity', effect: 'escalate_to_primary', note: 'Bead must be transparent to the desired signal frequency' },
            { attributeId: 'dcr', effect: 'not_applicable', note: 'DCR is less critical on signal lines with low DC current' },
          ],
        },
      ],
    },
    {
      questionId: 'operating_current',
      questionText: 'What is the actual DC operating current (peak)?',
      priority: 2,
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 280mA, 1.2A, or "unknown"',
      options: [
        {
          value: 'unknown',
          label: 'Unknown / varies',
          description: 'Will flag all candidates for DC bias derating review',
          attributeEffects: [
            { attributeId: 'impedance_100mhz', effect: 'add_review_flag', note: 'Verify impedance at operating current using manufacturer DC bias curve — impedance collapses under load' },
          ],
        },
      ],
    },
    {
      questionId: 'signal_frequency',
      questionText: 'What is the signal frequency?',
      priority: 3,
      condition: { questionId: 'signal_or_power', values: ['signal'] },
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 100MHz, 2.4GHz, or "broadband"',
      options: [
        {
          value: 'broadband',
          label: 'Broadband / unknown',
          description: 'Will flag for impedance curve review across full band',
          attributeEffects: [
            { attributeId: 'impedance_curve', effect: 'add_review_flag', note: 'Verify impedance curve is transparent at signal frequencies and attenuates at harmonics' },
          ],
        },
      ],
    },
  ],
};
