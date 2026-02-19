import { FamilyContextConfig } from '../types';

export const rfSignalInductorsContext: FamilyContextConfig = {
  familyIds: ['72'],
  contextSensitivity: 'high',
  questions: [
    {
      questionId: 'frequency_band',
      questionText: 'What is the operating frequency?',
      priority: 1,
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 13.56 MHz, 2.4 GHz, 100 kHz–1 MHz',
      options: [
        {
          value: 'low_rf',
          label: 'Low RF (100 kHz – 30 MHz)',
          description: 'Ferrite cores may still be usable; SRF must be well above operating frequency',
          attributeEffects: [
            { attributeId: 'srf', effect: 'escalate_to_primary', note: 'Low RF — SRF must be ≥10× operating frequency for stable inductive behavior' },
            { attributeId: 'q_factor', effect: 'escalate_to_primary', note: 'Low RF — Q factor matters for filter selectivity and resonant circuits' },
          ],
        },
        {
          value: 'high_rf',
          label: 'High RF / microwave (>30 MHz)',
          description: 'Air/ceramic core only; Q factor is the dominant specification',
          attributeEffects: [
            { attributeId: 'q_factor', effect: 'escalate_to_mandatory', note: 'High RF — Q factor is the dominant specification. Lower Q causes insertion loss and degrades filter/matching performance.' },
            { attributeId: 'srf', effect: 'escalate_to_mandatory', note: 'High RF — SRF must be ≥10× operating frequency. Below SRF the inductor becomes capacitive.' },
            { attributeId: 'core_material', effect: 'escalate_to_mandatory', note: 'High RF — air core or ceramic core required. Ferrite has excessive core losses above 30 MHz.' },
          ],
        },
        {
          value: 'broadband',
          label: 'Broadband / wideband',
          description: 'SRF and flat impedance over wide bandwidth are primary concerns',
          attributeEffects: [
            { attributeId: 'srf', effect: 'escalate_to_mandatory', note: 'Broadband — SRF must be well above the entire operating bandwidth' },
            { attributeId: 'q_factor', effect: 'escalate_to_primary', note: 'Broadband — Q should be adequate across the full bandwidth' },
            { attributeId: 'inductance_tolerance', effect: 'escalate_to_primary', note: 'Broadband — inductance tolerance affects performance across the band' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Flag SRF and Q factor for review',
          attributeEffects: [
            { attributeId: 'srf', effect: 'add_review_flag', note: 'Unknown frequency — must verify SRF is adequate before finalizing replacement' },
            { attributeId: 'q_factor', effect: 'add_review_flag', note: 'Unknown frequency — must verify Q factor is adequate for the application' },
          ],
        },
      ],
    },
    {
      questionId: 'q_requirement',
      questionText: 'What Q factor is required?',
      priority: 2,
      options: [
        {
          value: 'high_q',
          label: 'High Q (>50)',
          description: 'Requires air/ceramic core, tight tolerances; shielding may degrade Q',
          attributeEffects: [
            { attributeId: 'q_factor', effect: 'escalate_to_mandatory', note: 'High Q required — must verify Q at operating frequency, not just datasheet peak Q' },
            { attributeId: 'core_material', effect: 'escalate_to_mandatory', note: 'High Q — air core or ceramic core required. Ferrite and metal composite have excessive losses.' },
            { attributeId: 'shielding', effect: 'add_review_flag', note: 'High Q — shielding introduces eddy current losses that reduce Q. Verify Q is still adequate if shielded.' },
          ],
        },
        {
          value: 'moderate_q',
          label: 'Moderate Q (20–50)',
          description: 'Standard Q matching — verify at operating frequency',
          attributeEffects: [
            { attributeId: 'q_factor', effect: 'escalate_to_primary', note: 'Moderate Q — verify Q at operating frequency, not just datasheet peak' },
          ],
        },
        {
          value: 'low_q',
          label: 'Low Q / don\'t care',
          description: 'Q is not a primary selection criterion',
          attributeEffects: [],
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
          label: 'Yes — shielded required',
          description: 'Shielded inductor required; verify Q impact',
          attributeEffects: [
            { attributeId: 'shielding', effect: 'escalate_to_mandatory', note: 'EMI-sensitive circuit — shielded inductor required to prevent interference' },
            { attributeId: 'q_factor', effect: 'add_review_flag', note: 'Shielding reduces Q via eddy current losses — verify Q is still adequate with shielded construction' },
          ],
        },
        {
          value: 'no',
          label: 'No / don\'t know',
          description: 'Unshielded may offer higher Q; shielded can always replace unshielded (upgrade)',
          attributeEffects: [],
        },
      ],
    },
  ],
};
