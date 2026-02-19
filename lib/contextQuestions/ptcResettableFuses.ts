import { FamilyContextConfig } from '../types';

export const ptcResettableFusesContext: FamilyContextConfig = {
  familyIds: ['66'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'circuit_voltage',
      questionText: 'What is the maximum circuit voltage?',
      required: true,
      priority: 1,
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 5V, 12V, 24V, or "unknown"',
      options: [
        {
          value: 'low',
          label: 'Low voltage (≤6V)',
          description: 'Initial resistance voltage drop is significant — verify Ihold × R₁ is acceptable',
          attributeEffects: [
            { attributeId: 'initial_resistance', effect: 'escalate_to_primary', note: 'Low voltage circuit — even small resistance causes significant voltage drop (e.g., 500mΩ at 500mA = 250mV on a 3.3V rail)' },
            { attributeId: 'post_trip_resistance', effect: 'escalate_to_primary', note: 'Low voltage — resistance creep after cycling matters more on low-voltage circuits' },
          ],
        },
        {
          value: 'medium',
          label: 'Medium voltage (6–60V)',
          description: 'Standard Vmax margin should be verified',
          attributeEffects: [
            { attributeId: 'max_voltage', effect: 'escalate_to_mandatory', note: 'Verify Vmax provides adequate margin above actual circuit voltage — full voltage appears across tripped device' },
          ],
        },
        {
          value: 'high',
          label: 'High voltage (>60V)',
          description: 'Vmax is the most critical parameter — arcing risk above rating',
          attributeEffects: [
            { attributeId: 'max_voltage', effect: 'escalate_to_mandatory', note: 'High voltage — Vmax must have significant margin. Exceeding Vmax causes arcing and permanent failure (fire risk)' },
          ],
        },
      ],
    },
    {
      questionId: 'ambient_temperature',
      questionText: 'What is the ambient operating temperature?',
      priority: 2,
      options: [
        {
          value: 'specific_temp',
          label: 'Elevated temperature (>40°C)',
          description: 'Hold and trip currents must be derated — PTC fuses are temperature-sensitive',
          attributeEffects: [
            { attributeId: 'hold_current', effect: 'escalate_to_mandatory', note: 'Elevated ambient — hold current derates significantly at higher temperatures. Must verify derated Ihold still exceeds normal operating current.' },
            { attributeId: 'trip_current', effect: 'escalate_to_primary', note: 'Elevated ambient — trip current also derates, affecting protection threshold' },
            { attributeId: 'operating_temp', effect: 'escalate_to_mandatory', note: 'Elevated ambient — operating temperature range must cover the application environment' },
          ],
        },
        {
          value: 'room_temp',
          label: 'Room temperature (~25°C)',
          description: 'Datasheet ratings apply directly — no derating needed',
          attributeEffects: [],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Must determine ambient temperature before finalizing selection',
          attributeEffects: [
            { attributeId: 'operating_temp', effect: 'add_review_flag', note: 'Unknown ambient temperature — must verify hold/trip derating before finalizing replacement' },
          ],
        },
      ],
    },
    {
      questionId: 'fault_frequency',
      questionText: 'Will the fuse experience frequent trip/reset cycles?',
      priority: 3,
      options: [
        {
          value: 'frequent',
          label: 'Frequent (part of normal operation)',
          description: 'Endurance cycles, resistance creep, and initial resistance are critical concerns',
          attributeEffects: [
            { attributeId: 'endurance_cycles', effect: 'escalate_to_mandatory', note: 'Frequent tripping — cycle endurance is critical. Resistance creep accumulates with each cycle.' },
            { attributeId: 'post_trip_resistance', effect: 'escalate_to_mandatory', note: 'Frequent tripping — post-trip resistance creep will be significant over device lifetime' },
            { attributeId: 'initial_resistance', effect: 'escalate_to_primary', note: 'Frequent cycling — initial resistance is the baseline for resistance creep accumulation' },
          ],
        },
        {
          value: 'rare',
          label: 'Rare (emergency protection only)',
          description: 'Standard endurance rating is sufficient',
          attributeEffects: [],
        },
      ],
    },
  ],
};
