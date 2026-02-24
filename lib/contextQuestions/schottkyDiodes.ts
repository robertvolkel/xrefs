import { FamilyContextConfig } from '../types';

/**
 * Schottky Barrier Diodes (Family B2)
 * Block B: Discrete Semiconductors
 *
 * 5 context questions:
 * 1. Low-voltage application (always ask — Vf dominance assessment)
 * 2. Operating/ambient temperature (always ask — leakage thermal runaway risk)
 * 3. Si or SiC (always ask — hard gate for high-voltage)
 * 4. Parallel operation (always ask — Vf tempco concern)
 * 5. Automotive (always ask — AEC-Q101 gate)
 */
export const schottkyDiodesContext: FamilyContextConfig = {
  familyIds: ['B2'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Low-voltage application
    {
      questionId: 'low_voltage',
      questionText: 'Is this a low-voltage application (supply voltage ≤12V)?',
      priority: 1,
      options: [
        {
          value: 'yes',
          label: 'Yes — 3.3V, 5V, or 12V rail',
          description: 'Vf becomes the absolute dominant spec. Every 50mV matters. At 3.3V, a 0.45V Schottky drops 14% of the supply.',
          attributeEffects: [
            { attributeId: 'vf', effect: 'escalate_to_mandatory', note: 'At ≤12V, every 50mV of Vf is significant. At 3.3V, a 0.45V drop is 14% loss vs. 0.30V at 9% — that 5% efficiency difference determines battery life.' },
            { attributeId: 'ir_leakage', effect: 'not_applicable', note: 'Reverse leakage is secondary for low-voltage unless battery-powered (low Vr means low leakage power)' },
          ],
        },
        {
          value: 'no',
          label: 'No — higher voltage (>12V)',
          description: 'Vf is still important but less dominant. Reverse leakage becomes more significant (Ir × Vr = leakage power).',
          attributeEffects: [
            { attributeId: 'ir_leakage', effect: 'escalate_to_primary', note: 'At higher voltages, Ir × Vr = significant leakage power dissipation. Thermal runaway risk increases.' },
          ],
        },
      ],
    },

    // Q2: Operating/ambient temperature
    {
      questionId: 'ambient_temperature',
      questionText: 'What is the operating or ambient temperature environment?',
      priority: 2,
      options: [
        {
          value: 'high_ambient',
          label: 'High ambient (>60°C) or poor thermal path',
          description: 'Reverse leakage escalates to critical. Schottky Ir doubles every 10°C — thermal runaway risk is real.',
          attributeEffects: [
            { attributeId: 'ir_leakage', effect: 'escalate_to_mandatory', note: 'Schottky Ir ~doubles every 10°C. At 85°C, 100µA@25°C becomes ~6.4mA. At 125°C, ~50mA. At high Vr, this dissipates watts and drives thermal runaway.' },
            { attributeId: 'rth_jc', effect: 'escalate_to_primary', note: 'Thermal resistance directly determines junction temperature rise — critical for avoiding thermal runaway' },
            { attributeId: 'rth_ja', effect: 'escalate_to_primary', note: 'For SMD without heatsink, Rθja determines if leakage power can be dissipated safely' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary', note: 'Higher Tj_max provides more thermal headroom against leakage-driven heating' },
          ],
        },
        {
          value: 'room_temp',
          label: 'Room temperature / well-cooled',
          description: 'Standard Ir matching at 25°C is sufficient. Thermal runaway risk is low.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Si or SiC
    {
      questionId: 'semiconductor_material',
      questionText: 'Is this a silicon or silicon carbide (SiC) Schottky diode?',
      priority: 3,
      options: [
        {
          value: 'silicon',
          label: 'Silicon (standard)',
          description: 'Normal Schottky matching. Voltage ratings typically ≤200V. Vf is the dominant advantage.',
          attributeEffects: [],
        },
        {
          value: 'sic',
          label: 'SiC (Silicon Carbide)',
          description: 'Different product category. 600–1700V. Higher Vf (1.2–1.7V) but zero recovery + high voltage + temperature stability.',
          attributeEffects: [
            { attributeId: 'semiconductor_material', effect: 'escalate_to_mandatory', note: 'SiC Schottky cannot be replaced by silicon at these voltages (600V+). SiC-to-SiC matching required.' },
            { attributeId: 'ir_leakage', effect: 'not_applicable', note: 'SiC has much better temperature stability than silicon — leakage is far less of a concern' },
          ],
        },
        {
          value: 'unknown',
          label: 'Don\'t know',
          description: 'Determine from voltage: Vrrm ≥300V is almost certainly SiC. Below 200V is almost certainly silicon.',
          attributeEffects: [
            { attributeId: 'semiconductor_material', effect: 'add_review_flag', note: 'Determine Si vs SiC from voltage rating: Vrrm ≥300V → almost certainly SiC. Below 200V → almost certainly silicon. 200-300V is a gray zone.' },
          ],
        },
      ],
    },

    // Q4: Parallel operation
    {
      questionId: 'parallel_operation',
      questionText: 'Are diodes operating in parallel for higher current?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — paralleled for higher current',
          description: 'Vf temperature coefficient becomes critical. Positive tempco (high current) = safe sharing. Negative tempco (low current) = thermal runaway risk.',
          attributeEffects: [
            { attributeId: 'vf_tempco', effect: 'escalate_to_primary', note: 'At high currents, Schottky Vf has positive tempco (safe sharing). At low currents, negative tempco causes thermal runaway in parallel. Must verify operating point vs. tempco crossover.' },
            { attributeId: 'vf', effect: 'escalate_to_mandatory', note: 'Vf matching between paralleled diodes matters — mismatch causes unequal current sharing' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Vf temperature coefficient is a secondary concern. Standard matching.',
          attributeEffects: [],
        },
      ],
    },

    // Q5: Automotive
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 5,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive',
          description: 'AEC-Q101 becomes mandatory. Note: Q101 for discretes, not Q200 (passives).',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive application — AEC-Q101 (discrete semiconductor qualification) is required' },
            { attributeId: 'operating_temp', effect: 'escalate_to_primary', note: 'Automotive requires -40°C to +125°C (or +150°C under-hood)' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard environmental matching.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
