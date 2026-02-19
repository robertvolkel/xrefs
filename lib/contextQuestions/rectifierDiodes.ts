import { FamilyContextConfig } from '../types';

/**
 * Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (Family B1)
 * Block B: Discrete Semiconductors
 *
 * 4 context questions:
 * 1. Switching frequency (always ask — determines trr vs Vf priority)
 * 2. Circuit topology (always ask — determines which specs are primary)
 * 3. Low-voltage application (always ask — Vf impact on efficiency)
 * 4. Automotive (always ask — AEC-Q101 gate)
 */
export const rectifierDiodesContext: FamilyContextConfig = {
  familyIds: ['B1'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Switching frequency
    {
      questionId: 'switching_frequency',
      questionText: 'What is the switching frequency of this circuit?',
      priority: 1,
      options: [
        {
          value: 'mains_50_60hz',
          label: '50/60Hz (mains rectification)',
          description: 'trr is irrelevant — even a 5µs standard diode is negligible vs. the 16-20ms period. Vf dominates.',
          attributeEffects: [
            { attributeId: 'trr', effect: 'not_applicable', note: 'At 50/60Hz, even 5µs trr is negligible vs. 16-20ms period' },
            { attributeId: 'qrr', effect: 'not_applicable', note: 'Reverse recovery charge irrelevant at mains frequency' },
            { attributeId: 'recovery_behavior', effect: 'not_applicable', note: 'Soft/snappy distinction irrelevant at mains frequency' },
            { attributeId: 'cj', effect: 'not_applicable', note: 'Junction capacitance irrelevant at mains frequency' },
            { attributeId: 'vf', effect: 'escalate_to_primary', note: 'At 50/60Hz, conduction loss (Vf) dominates — standard recovery diodes preferred for lowest Vf' },
          ],
        },
        {
          value: 'low_freq_1k_50k',
          label: '1kHz-50kHz (motor drives, low-frequency switching)',
          description: 'trr begins to matter. Fast recovery is the minimum. Soft/snappy recovery starts to matter.',
          attributeEffects: [
            { attributeId: 'trr', effect: 'escalate_to_primary', note: 'At 1-50kHz, recovery time begins to contribute to switching losses' },
            { attributeId: 'recovery_behavior', effect: 'add_review_flag', note: 'Snappy recovery generates voltage spikes that scale with frequency — verify circuit can tolerate' },
            { attributeId: 'vf', effect: 'escalate_to_primary', note: 'Vf still matters — the Vf/trr trade-off is balanced at these frequencies' },
          ],
        },
        {
          value: 'smps_50k_500k',
          label: '50kHz-500kHz (SMPS, DC-DC converters)',
          description: 'trr and Qrr become primary — switching losses dominate. Ultrafast typically required.',
          attributeEffects: [
            { attributeId: 'trr', effect: 'escalate_to_mandatory', note: 'At 50-500kHz, switching losses dominate — ultrafast recovery typically required' },
            { attributeId: 'qrr', effect: 'escalate_to_mandatory', note: 'Reverse recovery charge is the best predictor of switching loss at these frequencies' },
            { attributeId: 'recovery_behavior', effect: 'escalate_to_primary', note: 'Snappy recovery causes significant EMI and voltage ringing at SMPS frequencies' },
            { attributeId: 'cj', effect: 'add_review_flag', note: 'Junction capacitance contributes to switching losses above 100kHz' },
            { attributeId: 'vf', effect: 'not_applicable', note: 'Vf is secondary — switching loss reduction from faster recovery outweighs the higher Vf' },
          ],
        },
        {
          value: 'above_500k',
          label: '>500kHz',
          description: 'Consider Schottky or SiC diodes. Silicon rectifiers may be a legacy design at this frequency.',
          attributeEffects: [
            { attributeId: 'trr', effect: 'escalate_to_mandatory', note: 'Above 500kHz a silicon rectifier is unusual — consider Schottky (zero recovery) or SiC diode' },
            { attributeId: 'qrr', effect: 'escalate_to_mandatory', note: 'Qrr is critical — any reverse recovery at >500kHz causes severe losses' },
            { attributeId: 'recovery_behavior', effect: 'escalate_to_mandatory', note: 'Snappy recovery is destructive at >500kHz — soft recovery or Schottky required' },
            { attributeId: 'cj', effect: 'escalate_to_primary', note: 'Junction capacitance is a primary loss mechanism above 500kHz' },
          ],
        },
      ],
    },

    // Q2: Circuit topology / function
    {
      questionId: 'circuit_topology',
      questionText: 'What is the circuit topology or function of this diode?',
      priority: 2,
      options: [
        {
          value: 'power_supply_rectifier',
          label: 'Power supply rectifier (half/full-bridge, center-tap)',
          description: 'Standard rectifier application. Io, Ifsm, and configuration are primary.',
          attributeEffects: [
            { attributeId: 'ifsm', effect: 'escalate_to_primary', note: 'Capacitor inrush on power-on creates massive surge current — Ifsm is critical' },
            { attributeId: 'configuration', effect: 'escalate_to_mandatory', note: 'Configuration must match exactly — single, dual, or bridge per circuit topology' },
          ],
        },
        {
          value: 'freewheeling_clamp',
          label: 'Freewheeling / clamp diode (inductor or relay coil)',
          description: 'Fast/ultrafast recovery critical regardless of main circuit frequency. Reverse voltage must cover inductive spikes.',
          attributeEffects: [
            { attributeId: 'trr', effect: 'escalate_to_mandatory', note: 'Inductor de-energizes rapidly — fast/ultrafast recovery required regardless of main circuit frequency' },
            { attributeId: 'vrrm', effect: 'escalate_to_mandatory', note: 'Must cover inductive spike voltage, not just supply voltage' },
            { attributeId: 'ifsm', effect: 'escalate_to_primary', note: 'Must handle peak inductor current during clamping' },
            { attributeId: 'vf', effect: 'not_applicable', note: 'Diode only conducts during brief transient events — Vf is less critical' },
          ],
        },
        {
          value: 'oring_redundant',
          label: 'OR-ing / redundant power',
          description: 'Vf matching between paths is critical. Reverse leakage matters (continuous reverse bias).',
          attributeEffects: [
            { attributeId: 'vf', effect: 'escalate_to_mandatory', note: 'Vf mismatch causes unequal current sharing between redundant supplies — must match closely' },
            { attributeId: 'ir_leakage', effect: 'escalate_to_primary', note: 'Non-active diode sees continuous reverse bias — leakage drains the standby supply' },
            { attributeId: 'trr', effect: 'not_applicable', note: 'Supplies don\'t typically switch off at high frequency — recovery time rarely matters for OR-ing' },
          ],
        },
        {
          value: 'reverse_polarity',
          label: 'Reverse polarity protection',
          description: 'Vf is critical (permanent voltage loss). Recovery time is irrelevant.',
          attributeEffects: [
            { attributeId: 'vf', effect: 'escalate_to_mandatory', note: 'Vf is a permanent voltage loss from the supply — every 100mV matters' },
            { attributeId: 'trr', effect: 'not_applicable', note: 'Diode doesn\'t switch during normal operation — recovery time is irrelevant' },
            { attributeId: 'qrr', effect: 'not_applicable', note: 'No switching events — Qrr is irrelevant' },
          ],
        },
      ],
    },

    // Q3: Low-voltage application
    {
      questionId: 'low_voltage',
      questionText: 'Is this a low-voltage application (supply voltage ≤12V)?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — supply ≤12V',
          description: 'Vf becomes the dominant concern. A 1.1V drop on 5V is 22% loss. Consider Schottky diodes.',
          attributeEffects: [
            { attributeId: 'vf', effect: 'escalate_to_mandatory', note: 'At ≤12V, Vf has outsized efficiency impact (e.g., 1.1V on 5V = 22% loss). Consider Schottky alternative (0.3-0.5V Vf).' },
          ],
        },
        {
          value: 'no',
          label: 'No — supply >12V',
          description: 'Standard Vf matching. A 100mV difference on 48V or 400V is negligible.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 4,
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
