import { FamilyContextConfig } from '../types';

export const commonModeChokeContext: FamilyContextConfig = {
  familyIds: ['69'],
  contextSensitivity: 'critical',
  questions: [
    {
      questionId: 'application_type',
      questionText: 'Is this a signal-line or power-line application?',
      priority: 1,
      options: [
        {
          value: 'signal',
          label: 'Signal-line',
          description: 'USB, HDMI, Ethernet, CAN, LVDS, MIPI — impedance at frequency is primary',
          attributeEffects: [
            { attributeId: 'cm_impedance', effect: 'escalate_to_primary', note: 'Signal-line — common mode impedance at frequency is the primary selection criterion' },
            { attributeId: 'dm_leakage', effect: 'escalate_to_primary', note: 'Signal-line — differential mode leakage inductance must be LOW (parasitic)' },
            { attributeId: 'interface_compliance', effect: 'escalate_to_primary', note: 'Signal-line — interface standard compliance is critical' },
            { attributeId: 'safety_rating', effect: 'not_applicable', note: 'Signal-line — safety rating is not applicable' },
            { attributeId: 'rated_current', effect: 'not_applicable', note: 'Signal-line — rated current is typically low and secondary' },
          ],
        },
        {
          value: 'power',
          label: 'Power-line',
          description: 'AC mains filter, DC bus filter — inductance and rated current are primary',
          attributeEffects: [
            { attributeId: 'cm_inductance', effect: 'escalate_to_primary', note: 'Power-line — common mode inductance (mH) is the primary selection criterion' },
            { attributeId: 'rated_current', effect: 'escalate_to_primary', note: 'Power-line — rated current is a primary selection criterion' },
            { attributeId: 'dcr', effect: 'escalate_to_primary', note: 'Power-line — DCR directly affects power efficiency' },
            { attributeId: 'voltage_rated', effect: 'escalate_to_primary', note: 'Power-line — voltage rating is critical' },
            { attributeId: 'interface_compliance', effect: 'not_applicable', note: 'Power-line — interface standard compliance is not applicable' },
            { attributeId: 'cm_impedance', effect: 'not_applicable', note: 'Power-line — impedance at high frequency is secondary to inductance' },
          ],
        },
      ],
    },
    {
      questionId: 'interface_standard',
      questionText: 'Which interface standard?',
      priority: 2,
      condition: { questionId: 'application_type', values: ['signal'] },
      options: [
        {
          value: 'usb2',
          label: 'USB 2.0',
          description: '90Ω ±15% impedance — leakage inductance and mode conversion are important',
          attributeEffects: [
            { attributeId: 'interface_compliance', effect: 'escalate_to_mandatory', note: 'USB 2.0 — must meet interface-specific impedance and insertion loss requirements' },
            { attributeId: 'dm_leakage', effect: 'escalate_to_primary', note: 'USB 2.0 — leakage inductance must be low enough to preserve signal integrity' },
          ],
        },
        {
          value: 'usb3',
          label: 'USB 3.x / USB4',
          description: 'Very high speed — mode conversion (Scd21) is the dominant concern',
          attributeEffects: [
            { attributeId: 'interface_compliance', effect: 'escalate_to_mandatory', note: 'USB 3.x/4 — must meet high-speed interface requirements' },
            { attributeId: 'dm_leakage', effect: 'escalate_to_mandatory', note: 'USB 3.x/4 — leakage inductance must be extremely low for high-speed signal integrity' },
            { attributeId: 'impedance_curve', effect: 'add_review_flag', note: 'USB 3.x/4 — verify impedance curve covers the very wide frequency band required' },
          ],
        },
        {
          value: 'ethernet',
          label: '100/1000BASE-T Ethernet',
          description: 'Specific insertion loss and return loss specs per IEEE 802.3',
          attributeEffects: [
            { attributeId: 'interface_compliance', effect: 'escalate_to_mandatory', note: 'Ethernet — must meet IEEE 802.3 insertion loss and return loss specifications' },
            { attributeId: 'number_of_lines', effect: 'escalate_to_primary', note: 'Ethernet — often uses 4-line chokes' },
          ],
        },
        {
          value: 'can',
          label: 'CAN / CAN-FD',
          description: 'Lower speed, more tolerant of leakage inductance',
          attributeEffects: [
            { attributeId: 'interface_compliance', effect: 'escalate_to_primary', note: 'CAN — more tolerant of leakage inductance than high-speed interfaces' },
          ],
        },
      ],
    },
    {
      questionId: 'mains_connected',
      questionText: 'Is this mains-connected?',
      priority: 3,
      condition: { questionId: 'application_type', values: ['power'] },
      options: [
        {
          value: 'yes',
          label: 'Yes — AC mains (120V/240V)',
          description: 'Safety rating becomes mandatory; voltage must cover mains + transients',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'Mains-connected — safety rating (UL/IEC/EN) is mandatory' },
            { attributeId: 'voltage_rated', effect: 'escalate_to_mandatory', note: 'Mains-connected — voltage rating must include mains voltage plus transient margin' },
            { attributeId: 'insulation_voltage', effect: 'escalate_to_primary', note: 'Mains-connected — insulation/isolation is critical for safety' },
          ],
        },
        {
          value: 'no',
          label: 'No — DC bus or low-voltage power',
          description: 'Safety rating not required; voltage and current rating are still primary',
          attributeEffects: [],
        },
      ],
    },
  ],
};
