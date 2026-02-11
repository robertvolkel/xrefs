import { FamilyContextConfig } from '../types';

export const mlccContext: FamilyContextConfig = {
  familyIds: ['12'],
  contextSensitivity: 'high',
  questions: [
    {
      questionId: 'voltage_ratio',
      questionText: 'What is the operating voltage relative to the rated voltage?',
      priority: 1,
      options: [
        {
          value: 'low',
          label: '< 50% of rated',
          description: 'DC bias derating is less of a concern but still relevant for Class II dielectrics',
          attributeEffects: [
            { attributeId: 'dc_bias_derating', effect: 'add_review_flag', note: 'Low voltage ratio — DC bias derating is minor but should still be checked for X7R/X5R' },
          ],
        },
        {
          value: 'medium',
          label: '50-80% of rated',
          description: 'DC bias derating is a significant concern — two identical MLCCs can lose 30-60% capacitance',
          attributeEffects: [
            { attributeId: 'dc_bias_derating', effect: 'escalate_to_primary', note: 'At 50-80% of rated voltage, Class II dielectrics can lose 30-60% of capacitance — verify DC bias curves' },
            { attributeId: 'dielectric', effect: 'escalate_to_primary', note: 'Dielectric material choice is critical at this voltage ratio — C0G immune to DC bias' },
          ],
        },
        {
          value: 'high',
          label: '> 80% of rated',
          description: 'Severe DC bias derating — only C0G/NP0 dielectrics are safe at this ratio',
          attributeEffects: [
            { attributeId: 'dc_bias_derating', effect: 'escalate_to_mandatory', note: 'At >80% of rated, Class II effective capacitance may be <30% of nominal — C0G/NP0 strongly recommended' },
            { attributeId: 'dielectric', effect: 'escalate_to_mandatory', note: 'Only C0G/NP0 dielectrics maintain capacitance at >80% voltage ratio' },
          ],
        },
      ],
    },
    {
      questionId: 'flex_pcb',
      questionText: 'Is this mounted on a flex or flex-rigid PCB?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — flex or flex-rigid',
          description: 'Standard MLCCs crack under board flex, causing shorts and potential fires',
          attributeEffects: [
            { attributeId: 'flexible_termination', effect: 'escalate_to_mandatory', note: 'Flexible termination is mandatory for flex PCBs — standard MLCCs crack under board flex' },
          ],
        },
        {
          value: 'no',
          label: 'No — rigid PCB',
          description: 'Flexible termination is not required but acceptable if present',
          attributeEffects: [],
        },
      ],
    },
    {
      questionId: 'audio_path',
      questionText: 'Is this in an audio or analog signal path?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — audio / analog',
          description: 'Class II dielectrics (X7R, X5R) exhibit piezoelectric effects causing audible noise',
          attributeEffects: [
            { attributeId: 'dielectric', effect: 'escalate_to_primary', note: 'C0G/NP0 strongly preferred for audio paths — Class II dielectrics cause piezoelectric "singing capacitor" noise' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Piezoelectric noise is not a concern',
          attributeEffects: [],
        },
      ],
    },
    {
      questionId: 'environment',
      questionText: 'What environment is this for?',
      priority: 4,
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
          value: 'industrial',
          label: 'Industrial / harsh',
          description: 'Wide temperature range, potential sulfur exposure',
          attributeEffects: [
            { attributeId: 'operating_temp', effect: 'escalate_to_primary', note: 'Industrial/harsh environment — verify extended temperature range coverage' },
          ],
        },
        {
          value: 'consumer',
          label: 'Consumer',
          description: 'Standard specifications acceptable',
          attributeEffects: [],
        },
      ],
    },
  ],
};
