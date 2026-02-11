import { FamilyContextConfig } from '../types';

export const ptcThermistorContext: FamilyContextConfig = {
  familyIds: ['68'],
  contextSensitivity: 'critical',
  questions: [
    {
      questionId: 'function',
      questionText: "What is this PTC thermistor's function?",
      priority: 1,
      options: [
        {
          value: 'overcurrent',
          label: 'Overcurrent protection (resettable fuse)',
          description: 'Curie/switch temperature, hold current, trip current, and max voltage are primary',
          attributeEffects: [
            { attributeId: 'curie_temp', effect: 'escalate_to_mandatory', note: 'Overcurrent protection — Curie/switch temperature determines trip point' },
            { attributeId: 'trip_current', effect: 'escalate_to_mandatory', note: 'Overcurrent protection — trip current must match circuit fault current requirements' },
            { attributeId: 'hold_current', effect: 'escalate_to_mandatory', note: 'Overcurrent protection — hold current must exceed normal operating current' },
            { attributeId: 'max_voltage', effect: 'escalate_to_primary', note: 'Overcurrent protection — must withstand circuit voltage in tripped state' },
            { attributeId: 'resistance_r25', effect: 'not_applicable', note: 'Overcurrent — absolute R25 value is less critical than trip/hold current' },
          ],
        },
        {
          value: 'heater',
          label: 'Self-regulating heater',
          description: 'Curie temperature (equilibrium temp), power rating, and form factor are primary',
          attributeEffects: [
            { attributeId: 'curie_temp', effect: 'escalate_to_mandatory', note: 'Self-regulating heater — Curie temperature sets the heater equilibrium temperature' },
            { attributeId: 'max_power', effect: 'escalate_to_primary', note: 'Heater — power rating determines heating capability' },
            { attributeId: 'trip_current', effect: 'not_applicable', note: 'Heater — trip/hold current specs are irrelevant' },
            { attributeId: 'hold_current', effect: 'not_applicable', note: 'Heater — trip/hold current specs are irrelevant' },
          ],
        },
      ],
    },
  ],
};
