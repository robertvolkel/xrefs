import { FamilyContextConfig } from '../types';

export const powerInductorContext: FamilyContextConfig = {
  familyIds: ['71'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'circuit_type',
      questionText: 'What type of converter/circuit is this in?',
      priority: 1,
      options: [
        {
          value: 'switcher',
          label: 'Buck/boost/buck-boost switching converter',
          description: 'Both Isat and Irms are critical; core material saturation behavior matters',
          attributeEffects: [
            { attributeId: 'saturation_current', effect: 'escalate_to_mandatory', note: 'Switching converter — Isat is critical. Hard saturation (ferrite) causes abrupt current runaway; soft saturation (composite/powder) is more forgiving.' },
            { attributeId: 'core_material', effect: 'escalate_to_primary', note: 'Switching converter — hard vs. soft saturation behavior affects converter stability' },
            { attributeId: 'inductance_vs_dc_bias', effect: 'escalate_to_primary', note: 'Switching converter — verify inductance retention at operating current' },
            { attributeId: 'shielding', effect: 'escalate_to_primary', note: 'Switching converter — shielded inductor preferred to minimize EMI' },
          ],
        },
        {
          value: 'linear',
          label: 'LDO output / general filtering',
          description: 'Irms is primary (thermal); Isat is less critical — no switching-induced current peaks',
          attributeEffects: [
            { attributeId: 'rated_current', effect: 'escalate_to_primary', note: 'Linear/filtering — thermal rating (Irms) is the primary current spec' },
            { attributeId: 'core_material', effect: 'not_applicable', note: 'Linear/filtering — core material saturation behavior matters less' },
          ],
        },
        {
          value: 'emi',
          label: 'EMI filter / common mode',
          description: 'May be using the wrong component type — consider a common mode choke or ferrite bead',
          attributeEffects: [
            { attributeId: 'construction_type', effect: 'add_review_flag', note: 'EMI filtering — consider whether a common mode choke (Family 69) or ferrite bead (Family 70) would be more appropriate' },
          ],
        },
      ],
    },
    {
      questionId: 'operating_current',
      questionText: 'What is the actual operating DC current?',
      priority: 2,
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 2.5A, 500mA, or "unknown"',
      options: [
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Will flag for Isat derating review',
          attributeEffects: [
            { attributeId: 'saturation_current', effect: 'add_review_flag', note: 'Unknown operating current — verify Isat provides adequate margin at actual load' },
            { attributeId: 'inductance_vs_dc_bias', effect: 'add_review_flag', note: 'Unknown operating current — cannot evaluate inductance derating' },
          ],
        },
      ],
    },
    {
      questionId: 'shielding_required',
      questionText: 'Is EMI shielding required?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — shielded inductor required',
          description: 'Unshielded cannot replace shielded',
          attributeEffects: [
            { attributeId: 'shielding', effect: 'escalate_to_mandatory', note: 'Shielded inductor required — unshielded cannot replace shielded' },
          ],
        },
        {
          value: 'no',
          label: 'No / not sure',
          description: 'Shielded can always replace unshielded (upgrade)',
          attributeEffects: [],
        },
      ],
    },
  ],
};
