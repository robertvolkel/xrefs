import { FamilyContextConfig } from '../types';

export const chassisMountResistorsContext: FamilyContextConfig = {
  familyIds: ['55'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'thermal_management',
      questionText: 'How is the resistor thermally managed?',
      priority: 1,
      options: [
        {
          value: 'dedicated_heatsink',
          label: 'Dedicated heatsink with known thermal resistance',
          description: 'Thermal resistance and interface dimensions are critical for power handling',
          attributeEffects: [
            { attributeId: 'thermal_resistance', effect: 'escalate_to_mandatory', note: 'Dedicated heatsink — thermal resistance (°C/W) directly determines max operating power' },
            { attributeId: 'heatsink_dimensions', effect: 'escalate_to_mandatory', note: 'Heatsink interface — bolt pattern and tab dimensions must match existing hardware' },
          ],
        },
        {
          value: 'chassis_mounted',
          label: 'Chassis-mounted (enclosure wall, metal frame)',
          description: 'Chassis thermal path has different characteristics than a dedicated heatsink',
          attributeEffects: [
            { attributeId: 'thermal_resistance', effect: 'escalate_to_primary', note: 'Chassis-mounted — thermal path through chassis is less controlled than dedicated heatsink. Verify derating.' },
            { attributeId: 'heatsink_dimensions', effect: 'escalate_to_mandatory', note: 'Chassis mounting — bolt pattern and footprint must match existing mounting points' },
          ],
        },
        {
          value: 'free_standing',
          label: 'No heatsink / free-standing',
          description: 'Power rating must be heavily derated from the mounted rating',
          attributeEffects: [
            { attributeId: 'power_rating', effect: 'escalate_to_mandatory', note: 'Free-standing operation — power rating is heavily derated vs. mounted spec. Verify free-air derating curve.' },
          ],
        },
      ],
    },
    {
      questionId: 'forced_airflow',
      questionText: 'Is forced airflow present?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — fan-cooled',
          description: 'Power rating can use fan-cooled derating curve',
          attributeEffects: [
            { attributeId: 'power_rating', effect: 'escalate_to_primary', note: 'Fan-cooled — use forced-convection derating curve. Higher effective power rating than natural convection.' },
          ],
        },
        {
          value: 'no',
          label: 'No — natural convection',
          description: 'Power rating must use natural-convection derating — more conservative',
          attributeEffects: [
            { attributeId: 'power_rating', effect: 'escalate_to_mandatory', note: 'Natural convection — power rating is heavily derated. Must verify thermal margins.' },
          ],
        },
      ],
    },
    {
      questionId: 'precision',
      questionText: 'Is this a precision or instrumentation application?',
      priority: 3,
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
          value: 'industrial_sulfur',
          label: 'Industrial with sulfur exposure',
          description: 'Anti-sulfur termination becomes mandatory',
          attributeEffects: [
            { attributeId: 'anti_sulfur', effect: 'escalate_to_mandatory', note: 'Sulfur-rich environment — anti-sulfur termination is required to prevent open-circuit failure' },
          ],
        },
        {
          value: 'standard',
          label: 'Standard',
          description: 'No additional environmental flags needed',
          attributeEffects: [],
        },
      ],
    },
  ],
};
