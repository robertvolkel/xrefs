import { FamilyContextConfig } from '../types';

export const currentSenseResistorsContext: FamilyContextConfig = {
  familyIds: ['54'],
  contextSensitivity: 'high',
  questions: [
    {
      questionId: 'kelvin_required',
      questionText: 'Does the design use Kelvin (4-terminal) sensing?',
      priority: 1,
      options: [
        {
          value: 'yes',
          label: 'Yes — 4-terminal Kelvin connection',
          description: 'Separate force/sense pads are required for lead resistance elimination',
          attributeEffects: [
            { attributeId: 'kelvin_sensing', effect: 'escalate_to_mandatory', note: 'Kelvin sensing layout — 4-terminal footprint is required, 2-terminal cannot substitute' },
            { attributeId: 'package', effect: 'escalate_to_mandatory', note: 'Kelvin layout — 4-terminal parts have a different pad layout than 2-terminal' },
          ],
        },
        {
          value: 'no',
          label: 'No — standard 2-terminal',
          description: 'Standard footprint matching is sufficient',
          attributeEffects: [],
        },
      ],
    },
    {
      questionId: 'measurement_precision',
      questionText: 'What measurement precision is required?',
      priority: 2,
      options: [
        {
          value: 'high',
          label: 'High precision (<1%)',
          description: 'Tight tolerance, low TCR, and low parasitic inductance are critical',
          attributeEffects: [
            { attributeId: 'tolerance', effect: 'escalate_to_mandatory', note: 'High precision — tolerance ≤1% required for accurate current measurement' },
            { attributeId: 'tcr', effect: 'escalate_to_mandatory', note: 'High precision — low TCR (≤50 ppm/°C) required to maintain accuracy over temperature' },
            { attributeId: 'parasitic_inductance', effect: 'escalate_to_primary', note: 'High precision — parasitic inductance introduces measurement error at higher frequencies' },
            { attributeId: 'long_term_stability', effect: 'escalate_to_primary', note: 'High precision — long-term resistance drift degrades measurement accuracy over time' },
          ],
        },
        {
          value: 'standard',
          label: 'Standard (1–5%)',
          description: 'Standard tolerance and TCR are sufficient',
          attributeEffects: [],
        },
        {
          value: 'rough',
          label: 'Rough (>5%)',
          description: 'Tolerance and TCR are non-critical — overcurrent detection with wide margin',
          attributeEffects: [],
        },
      ],
    },
    {
      questionId: 'sensing_frequency',
      questionText: 'What is the switching frequency?',
      priority: 3,
      options: [
        {
          value: 'dc_low',
          label: 'DC or low frequency (<10 kHz)',
          description: 'Parasitic inductance is not a concern',
          attributeEffects: [],
        },
        {
          value: 'high_frequency',
          label: 'High frequency (>100 kHz)',
          description: 'Parasitic inductance becomes critical — metal strip or reverse-geometry preferred',
          attributeEffects: [
            { attributeId: 'parasitic_inductance', effect: 'escalate_to_mandatory', note: 'High-frequency sensing — parasitic inductance distorts measurement. Metal strip and reverse-geometry packages preferred.' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Flag parasitic inductance for review',
          attributeEffects: [
            { attributeId: 'parasitic_inductance', effect: 'add_review_flag', note: 'Unknown switching frequency — parasitic inductance impact is uncertain, flag for review' },
          ],
        },
      ],
    },
  ],
};
