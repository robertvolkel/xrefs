import { FamilyContextConfig } from '../types';

export const supercapacitorContext: FamilyContextConfig = {
  familyIds: ['61'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'function',
      questionText: 'What is the primary function of this supercapacitor?',
      priority: 1,
      options: [
        {
          value: 'backup',
          label: 'Energy backup / hold-up',
          description: 'RTC, SRAM, brownout ride-through — leakage current and self-discharge are primary',
          attributeEffects: [
            { attributeId: 'leakage_current', effect: 'escalate_to_primary', note: 'Backup application — leakage current determines how long the cap holds charge' },
            { attributeId: 'self_discharge', effect: 'escalate_to_primary', note: 'Backup application — self-discharge rate limits effective backup duration' },
            { attributeId: 'lifetime', effect: 'escalate_to_primary', note: 'Long-duration backup requires long lifetime' },
          ],
        },
        {
          value: 'pulse',
          label: 'Pulse power buffering',
          description: 'GSM bursts, motor starts, regenerative braking — ESR and peak current are primary',
          attributeEffects: [
            { attributeId: 'esr', effect: 'escalate_to_primary', note: 'Pulse application — ESR determines power delivery capability' },
            { attributeId: 'peak_current', effect: 'escalate_to_primary', note: 'Pulse application — peak current must support burst demands' },
            { attributeId: 'cycle_life', effect: 'escalate_to_primary', note: 'Pulse application — thousands of cycles per day requires high cycle life' },
            { attributeId: 'leakage_current', effect: 'not_applicable', note: 'Leakage current is secondary for pulse buffering' },
          ],
        },
        {
          value: 'harvesting',
          label: 'Energy harvesting buffer',
          description: 'Leakage must be lower than harvester output — self-discharge determines accumulation',
          attributeEffects: [
            { attributeId: 'leakage_current', effect: 'escalate_to_mandatory', note: 'Energy harvesting — leakage current must be lower than harvester output or energy cannot accumulate' },
            { attributeId: 'self_discharge', effect: 'escalate_to_mandatory', note: 'Energy harvesting — self-discharge rate must allow energy accumulation over time' },
          ],
        },
      ],
    },
    {
      questionId: 'cold_start',
      questionText: 'Does the application require cold-start / low-temperature operation?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive, outdoor',
          description: 'Cold-temperature ESR can increase 5-10x at -40°C — must verify derating curve',
          attributeEffects: [
            { attributeId: 'esr', effect: 'add_review_flag', note: 'Cold-start required — ESR can increase 5-10x at -40°C. Verify ESR derating curve, not just 25°C headline spec.' },
            { attributeId: 'operating_temp', effect: 'escalate_to_primary', note: 'Cold-start operation — temperature range must cover cold extreme' },
          ],
        },
        {
          value: 'no',
          label: 'No — indoor / controlled',
          description: 'Standard ESR spec is sufficient',
          attributeEffects: [],
        },
      ],
    },
  ],
};
