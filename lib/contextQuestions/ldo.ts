import { FamilyContextConfig } from '../types';

/**
 * Linear Voltage Regulators / LDOs (Family C1)
 * Block C: Power Management ICs
 *
 * 5 context questions:
 * 1. Output capacitor type on PCB (always ask — ceramic vs ESR-stabilized is the #1 failure mode)
 *    THIS IS THE CRITICAL QUESTION — ceramic cap on an ESR-stabilized LDO = oscillation
 * 2. Battery / energy-harvest application (always ask — Iq becomes dominant power draw)
 * 3. Noise-sensitive analog load (always ask — PSRR and accuracy escalation)
 * 4. Automotive application (always ask — AEC-Q100 gate)
 * 5. Upstream switching frequency (conditional on Q3=yes — determines PSRR relevance)
 *
 * Context sensitivity: high
 * LDOs serve applications from ultra-low-power IoT sensors (Iq = 1µA, Iout = 10mA)
 * to high-current FPGA core rails (Iq irrelevant, PSRR critical). The same LDO
 * family serves battery-powered wearables (maximize battery life via low dropout +
 * low Iq), automotive underhood (AEC-Q100 + load-dump survivability), and precision
 * analog references (PSRR at switching frequency + accuracy). Context determines
 * which specs are binding and which are irrelevant.
 */
export const ldoContext: FamilyContextConfig = {
  familyIds: ['C1'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Output capacitor type — THE critical question for LDO substitution
    {
      questionId: 'output_cap_type',
      questionText: 'What type of output capacitor is used on the PCB?',
      priority: 1,
      options: [
        {
          value: 'ceramic',
          label: 'Ceramic (X5R / X7R / X6S / C0G)',
          description: 'CRITICAL: Ceramic capacitors have very low ESR (<10mΩ). ESR-stabilized LDOs will oscillate with ceramic output caps. The replacement MUST be ceramic-stable (internally compensated). If the replacement datasheet does not explicitly state ceramic stability, it must be rejected.',
          attributeEffects: [
            { attributeId: 'output_cap_compatibility', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: PCB uses ceramic output capacitors — replacement must explicitly state ceramic stability. ESR-stabilized LDOs will oscillate with ceramic caps. Missing ceramic stability data = reject.' },
          ],
        },
        {
          value: 'tantalum',
          label: 'Tantalum capacitor',
          description: 'Tantalum capacitors provide ESR in the 0.1–1Ω range. Both ESR-stabilized and ceramic-stable LDOs work correctly with tantalum caps. Standard matching rules apply.',
          attributeEffects: [],
        },
        {
          value: 'electrolytic',
          label: 'Aluminum electrolytic capacitor',
          description: 'Aluminum electrolytic capacitors provide ESR in the 0.1–5Ω range. Both ESR-stabilized and ceramic-stable LDOs work correctly. Standard matching rules apply.',
          attributeEffects: [],
        },
        {
          value: 'unknown',
          label: 'Unknown / not specified',
          description: 'Output capacitor type not known. Flag for engineering review — capacitor compatibility must be verified before approving the replacement.',
          attributeEffects: [
            { attributeId: 'output_cap_compatibility', effect: 'add_review_flag', note: 'Output capacitor type unknown — must verify LDO stability with actual PCB capacitor before approval.' },
          ],
        },
      ],
    },

    // Q2: Battery / energy-harvest — Iq becomes the dominant concern
    {
      questionId: 'battery_application',
      questionText: 'Is this a battery-powered or energy-harvesting application?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — battery or energy-harvest powered',
          description: 'Iq dominates the average current draw in sleep mode. A 50µA vs 1µA difference can mean 6-month vs 10-year battery life for coin-cell IoT sensors. Dropout voltage also becomes critical — lower dropout extends usable battery voltage range.',
          attributeEffects: [
            { attributeId: 'iq', effect: 'escalate_to_primary', blockOnMissing: true, note: 'BLOCKING: Battery/energy-harvest application — Iq dominates sleep-mode current draw. A replacement with higher Iq directly reduces battery life. Missing Iq data is unacceptable for battery designs.' },
            { attributeId: 'vdropout', effect: 'escalate_to_primary', note: 'Battery application — lower dropout extends usable battery voltage range. Every 100mV of additional dropout wastes meaningful battery capacity in the discharge curve tail.' },
          ],
        },
        {
          value: 'no',
          label: 'No — mains-powered or always-on high-load',
          description: 'Iq is negligible compared to load current (e.g., 50µA Iq vs 500mA load = 0.01%). Standard Iq weight applies but is not the binding constraint.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Noise-sensitive analog load — PSRR and accuracy escalation
    {
      questionId: 'noise_sensitive',
      questionText: 'Does the output supply a noise-sensitive analog circuit (ADC, DAC, RF, precision amplifier)?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — noise-sensitive analog load',
          description: 'PSRR, output voltage accuracy, and load regulation become critical. Supply noise directly corrupts signal quality in ADC/DAC/RF circuits. PSRR must be verified at the upstream switching frequency from the datasheet PSRR vs. frequency curve — the DC headline number is insufficient.',
          attributeEffects: [
            { attributeId: 'psrr', effect: 'escalate_to_primary', note: 'Noise-sensitive load — PSRR at the relevant frequency determines how much input ripple reaches the output. Verify PSRR at upstream switching frequency from datasheet curve, not just DC spec.' },
            { attributeId: 'vout_accuracy', effect: 'escalate_to_primary', note: 'Noise-sensitive load — supply accuracy directly affects ADC/DAC gain accuracy and reference stability.' },
            { attributeId: 'load_regulation', effect: 'escalate_to_primary', note: 'Noise-sensitive load — load regulation determines dynamic voltage variation with signal-dependent current draw.' },
          ],
        },
        {
          value: 'no',
          label: 'No — digital load or non-critical analog',
          description: 'Standard PSRR and accuracy requirements. Digital loads (microcontrollers, FPGAs) are less sensitive to supply noise than precision analog circuits.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive — AEC-Q100 gate
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory. Automotive LDOs must handle load-dump transients (40V on 12V systems per ISO 7637). Junction temperature rating must support the qualification grade: Grade 0 (−40 to +150°C Tj), Grade 1 (−40 to +125°C Tj).',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', note: 'Automotive — AEC-Q100 IC qualification is required. Covers HTOL, TC, humidity, and IC-specific parametric stability. Must match or exceed the original qualification grade.' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary', note: 'Automotive — underhood applications typically require Tj(max) ≥ 150°C. 125°C commercial-grade parts have insufficient thermal margin.' },
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

    // Q5: Upstream switching frequency — determines PSRR relevance
    // Only meaningful if Q3 = yes (noise-sensitive analog load)
    {
      questionId: 'upstream_switching_freq',
      questionText: 'What is the upstream switching frequency (if post-regulating a switcher)?',
      priority: 5,
      condition: { questionId: 'noise_sensitive', values: ['yes'] },
      options: [
        {
          value: 'none_dc',
          label: 'None — DC supply only (battery, linear pre-regulator)',
          description: 'No switching frequency to reject. PSRR at DC is relevant but typically excellent for all modern LDOs. PSRR is less critical in this configuration.',
          attributeEffects: [
            { attributeId: 'psrr', effect: 'not_applicable', note: 'DC supply — no switching frequency ripple to reject. PSRR is not a binding specification in this configuration.' },
          ],
        },
        {
          value: 'low_freq',
          label: 'Low (<500kHz) — typical buck/boost converters',
          description: 'Most LDOs have good PSRR (>40dB) below 500kHz. Verify from PSRR vs. frequency curve that the replacement maintains adequate rejection at the specific switching frequency.',
          attributeEffects: [
            { attributeId: 'psrr', effect: 'escalate_to_primary', note: 'Post-regulating <500kHz switcher — PSRR at switching frequency must be verified from datasheet curve. Most modern LDOs provide >40dB at these frequencies.' },
          ],
        },
        {
          value: 'high_freq',
          label: 'High (500kHz–2MHz) — high-frequency DC-DC',
          description: 'BLOCKING: PSRR degrades rapidly above 500kHz. Many LDOs have <20dB PSRR at 1MHz. Replacement must maintain adequate PSRR at the specific switching frequency — verify from datasheet PSRR vs. frequency curve. Missing frequency-specific PSRR data is unacceptable.',
          attributeEffects: [
            { attributeId: 'psrr', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Post-regulating high-frequency (≥500kHz) switcher — PSRR at switching frequency is critical. Many LDOs have <20dB PSRR at 1MHz. Missing PSRR data is unacceptable for this application.' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown switching frequency',
          description: 'Upstream switching frequency not known. PSRR stays as application_review — must be verified for the specific frequency before approval.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
