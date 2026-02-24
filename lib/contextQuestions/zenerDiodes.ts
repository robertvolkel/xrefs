import { FamilyContextConfig } from '../types';

/**
 * Zener Diodes / Voltage Reference Diodes (Family B3)
 * Block B: Discrete Semiconductors
 *
 * 4 context questions:
 * 1. Function (always ask — clamping vs reference vs ESD vs level shifting)
 *    THIS IS THE CRITICAL QUESTION — completely changes matching priorities
 * 2. Precision needed (conditional — if reference application)
 * 3. Signal speed (conditional — if ESD/signal-line protection)
 * 4. Automotive (always ask — AEC-Q101 gate)
 */
export const zenerDiodesContext: FamilyContextConfig = {
  familyIds: ['B3'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Primary function — THE critical question
    {
      questionId: 'zener_function',
      questionText: 'What is the primary function of this Zener diode?',
      priority: 1,
      options: [
        {
          value: 'clamping',
          label: 'Voltage clamping / overvoltage protection',
          description: 'Vz and power dissipation are the only primary specs. Tolerance can be loose (±5–10%). TC, Zzt, and noise are irrelevant.',
          attributeEffects: [
            { attributeId: 'tc', effect: 'not_applicable', note: 'Clamping application — voltage stability over temperature is not a concern. Only the approximate clamp level matters.' },
            { attributeId: 'zzt', effect: 'not_applicable', note: 'Dynamic impedance is irrelevant for clamping — the voltage does not need to be precise under varying current.' },
            { attributeId: 'zzk', effect: 'not_applicable', note: 'Knee impedance is irrelevant for clamping applications.' },
            { attributeId: 'regulation_type', effect: 'not_applicable', note: 'Noise characteristics are irrelevant for voltage clamping.' },
          ],
        },
        {
          value: 'reference',
          label: 'Voltage reference / precision bias',
          description: 'TC becomes primary — voltage stability is the whole point. Dynamic impedance (Zzt) and tolerance tighten. Noise may matter.',
          attributeEffects: [
            { attributeId: 'tc', effect: 'escalate_to_primary', note: 'Voltage reference application — TC determines voltage stability over temperature. Near 5.1V has best TC due to physics.' },
            { attributeId: 'zzt', effect: 'escalate_to_primary', note: 'Lower Zzt = more stable voltage as current varies. Critical for reference quality.' },
            { attributeId: 'vz_tolerance', effect: 'escalate_to_mandatory', note: 'Reference application requires tight tolerance — ±2% or ±1%.' },
            { attributeId: 'regulation_type', effect: 'add_review_flag', note: 'Avalanche breakdown (>5V) is noisier than Zener breakdown (<5V). Verify noise is acceptable for reference chain.' },
          ],
        },
        {
          value: 'esd_protection',
          label: 'ESD protection on signal line',
          description: 'Junction capacitance (Cj) becomes primary — high Cj degrades signal integrity on fast data lines. Reverse leakage matters.',
          attributeEffects: [
            { attributeId: 'cj', effect: 'escalate_to_primary', note: 'ESD/signal-line protection — Cj directly degrades signal integrity. Even a few pF matters at high data rates.' },
            { attributeId: 'ir_leakage', effect: 'escalate_to_primary', note: 'Zener sits across signal line during normal operation — leakage affects signal integrity.' },
            { attributeId: 'tc', effect: 'not_applicable', note: 'Temperature coefficient is irrelevant for ESD protection.' },
            { attributeId: 'zzt', effect: 'not_applicable', note: 'Dynamic impedance is irrelevant for ESD protection.' },
          ],
        },
        {
          value: 'level_shifting',
          label: 'Voltage level shifting',
          description: 'Vz accuracy at actual operating current matters. Dynamic impedance determines level-shift variation with load. TC matters for temperature stability.',
          attributeEffects: [
            { attributeId: 'zzt', effect: 'escalate_to_primary', note: 'Level shifting — dynamic impedance determines how much the shift varies with load current.' },
            { attributeId: 'tc', effect: 'escalate_to_primary', note: 'Level shift must be stable over temperature if used in a precision signal path.' },
          ],
        },
      ],
    },

    // Q2: Precision needed (conditional — reference applications)
    {
      questionId: 'reference_precision',
      questionText: 'What voltage precision/stability is needed for this reference?',
      condition: { questionId: 'zener_function', values: ['reference'] },
      priority: 2,
      options: [
        {
          value: 'high',
          label: 'High precision (<0.1% stability over temp)',
          description: 'TC ≤0.01%/°C, tolerance ≤1%, Zzt becomes a hard threshold. Consider dedicated IC voltage reference (LM4040, TL431) if requirements are very tight.',
          attributeEffects: [
            { attributeId: 'tc', effect: 'escalate_to_mandatory', note: 'High precision reference — TC must be ≤0.01%/°C. Consider if a dedicated IC voltage reference would be more appropriate.' },
            { attributeId: 'vz_tolerance', effect: 'escalate_to_mandatory', note: 'High precision requires ±1% tolerance or better.' },
            { attributeId: 'zzt', effect: 'escalate_to_mandatory', note: 'Dynamic impedance becomes a hard threshold for high-precision reference.' },
          ],
        },
        {
          value: 'moderate',
          label: 'Moderate precision (0.1–1% stability)',
          description: 'TC ≤0.05%/°C, tolerance ≤2%. Standard Zzt matching. Noise is secondary.',
          attributeEffects: [
            { attributeId: 'tc', effect: 'escalate_to_primary', note: 'Moderate precision — TC ≤0.05%/°C is sufficient.' },
            { attributeId: 'vz_tolerance', effect: 'escalate_to_primary', note: 'Moderate precision requires ±2% tolerance.' },
          ],
        },
        {
          value: 'coarse',
          label: 'Coarse reference (>1% stability)',
          description: 'Standard Vz and tolerance matching. TC and Zzt are secondary.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Signal speed (conditional — ESD/signal-line protection)
    {
      questionId: 'signal_speed',
      questionText: 'What is the signal speed on the protected line?',
      condition: { questionId: 'zener_function', values: ['esd_protection'] },
      priority: 3,
      options: [
        {
          value: 'high_speed',
          label: 'High-speed digital (USB 2.0+, HDMI, SPI >10MHz)',
          description: 'Cj becomes a hard threshold — must be ≤ original. Consider dedicated ESD protection diodes (TVS arrays) instead.',
          attributeEffects: [
            { attributeId: 'cj', effect: 'escalate_to_mandatory', note: 'High-speed signal line — Cj must be ≤ original. Even a few pF difference matters. Consider dedicated ESD TVS arrays for better Cj performance.' },
          ],
        },
        {
          value: 'low_speed',
          label: 'Low-speed digital or analog (I2C, UART, GPIO, sensors)',
          description: 'Cj is secondary — low-speed signals tolerate higher capacitance.',
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
