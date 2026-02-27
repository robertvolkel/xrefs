import { FamilyContextConfig } from '../types';

/**
 * Context questions for Family C4: Op-Amps / Comparators / Instrumentation Amplifiers
 *
 * contextSensitivity: 'critical' — op-amp vs. comparator sub-type drives
 * fundamental rule suppression, and source impedance / precision / stability
 * context can escalate multiple parameters to BLOCKING.
 *
 * Q1 (device_function) determines sub-type: op-amp rules are suppressed for
 * comparators and vice versa, following the B8 Thyristor pattern.
 * Q4 (circuit_gain) is CONDITIONAL on Q1 = op_amp or instrumentation_amp.
 */
export const opampComparatorContext: FamilyContextConfig = {
  familyIds: ['C4'],
  contextSensitivity: 'critical',
  questions: [
    // ================================================================
    // Q1: Device Function — drives sub-type rule suppression
    // ================================================================
    {
      questionId: 'device_function',
      questionText: 'What is the primary device function in your circuit?',
      priority: 1,
      options: [
        {
          value: 'op_amp',
          label: 'Op-Amp (closed-loop feedback)',
          description: 'Amplifier operating in a closed-loop negative feedback configuration — signal conditioning, filtering, gain stages, voltage followers',
          attributeEffects: [
            {
              attributeId: 'output_type',
              effect: 'not_applicable',
              note: 'Op-amps have push-pull outputs — output type matching is not applicable',
            },
            {
              attributeId: 'response_time',
              effect: 'not_applicable',
              note: 'Comparator response time not applicable — use GBW and slew rate for op-amp speed',
            },
          ],
        },
        {
          value: 'comparator',
          label: 'Comparator (open-loop switching)',
          description: 'Device operating open-loop for threshold detection, zero-crossing, PWM generation, or level shifting',
          attributeEffects: [
            {
              attributeId: 'gain_bandwidth',
              effect: 'not_applicable',
              note: 'Comparators operate open-loop — GBW is not a meaningful specification',
            },
            {
              attributeId: 'min_stable_gain',
              effect: 'not_applicable',
              note: 'Stability/compensation not applicable — comparators are always open-loop',
            },
            {
              attributeId: 'output_type',
              effect: 'escalate_to_primary',
              note: 'Output type is critical for comparators — open-drain vs. push-pull determines circuit interface requirements',
            },
            {
              attributeId: 'response_time',
              effect: 'escalate_to_primary',
              note: 'Comparator response time determines switching speed — critical for PWM, ADC, zero-crossing detection',
            },
          ],
        },
        {
          value: 'instrumentation_amp',
          label: 'Instrumentation Amplifier (differential measurement)',
          description: 'Matched differential input stage for bridge sensors, biomedical, strain gauges — requires high CMRR',
          attributeEffects: [
            {
              attributeId: 'output_type',
              effect: 'not_applicable',
              note: 'Instrumentation amplifiers have push-pull outputs — output type matching is not applicable',
            },
            {
              attributeId: 'response_time',
              effect: 'not_applicable',
              note: 'Comparator response time not applicable for instrumentation amplifiers',
            },
            {
              attributeId: 'cmrr',
              effect: 'escalate_to_primary',
              note: 'CMRR is the defining specification for instrumentation amplifiers — must maintain 100+ dB at the signal frequency',
            },
          ],
        },
      ],
    },

    // ================================================================
    // Q2: Source Impedance — drives input stage and noise escalation
    // ================================================================
    {
      questionId: 'source_impedance',
      questionText: 'What is the typical source impedance driving the input?',
      priority: 2,
      options: [
        {
          value: 'low',
          label: 'Low impedance (< 1kΩ)',
          description: 'Current sources, voltage dividers, low-impedance transducers — voltage noise dominates',
          attributeEffects: [
            {
              attributeId: 'input_noise_voltage',
              effect: 'escalate_to_primary',
              note: 'At low source impedance, voltage noise (en) dominates total noise — bipolar op-amps (NE5532: 5nV/√Hz) may be optimal',
            },
          ],
        },
        {
          value: 'medium',
          label: 'Medium impedance (1kΩ – 100kΩ)',
          description: 'Typical signal conditioning — both voltage and current noise contribute',
          attributeEffects: [],
        },
        {
          value: 'high',
          label: 'High impedance (> 100kΩ)',
          description: 'Piezo sensors, pH probes, photodiodes, high-impedance dividers — current noise and bias current dominate',
          attributeEffects: [
            {
              attributeId: 'input_type',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — at source impedance > 100kΩ, bipolar input stage is incompatible. Ib × Rs creates offset voltage exceeding most system error budgets. Only CMOS or JFET inputs are acceptable.',
            },
            {
              attributeId: 'input_bias_current',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — at high source impedance, even moderate bias current (> 1nA) creates unacceptable offset. Verify Ib × Rs < system offset budget.',
            },
          ],
        },
      ],
    },

    // ================================================================
    // Q3: Precision Application — drives Avol, Vos, CMRR, PSRR escalation
    // ================================================================
    {
      questionId: 'precision_application',
      questionText: 'Is this a precision application (offset voltage < 500µV or gain > 100)?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — precision measurement',
          description: 'High-gain amplification, instrumentation, precision DAC output buffering, sensor signal conditioning requiring < 0.1% gain accuracy',
          attributeEffects: [
            {
              attributeId: 'avol',
              effect: 'escalate_to_primary',
              note: 'Avol becomes primary for precision — closed-loop gain error ≈ 100% / (Avol × β). At gain=100 and Avol=80dB: 1% error.',
            },
            {
              attributeId: 'input_offset_voltage',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — Vos is the dominant DC error source in precision circuits. At gain=100, even 1mV Vos creates 100mV output error.',
            },
            {
              attributeId: 'cmrr',
              effect: 'escalate_to_primary',
              note: 'CMRR limits accuracy in differential measurements — common-mode voltage appears as differential error at 1/CMRR ratio.',
            },
            {
              attributeId: 'psrr',
              effect: 'escalate_to_primary',
              note: 'Supply noise appears at the output reduced by PSRR — in precision circuits, even -80dB PSRR may inject measurable error.',
            },
          ],
        },
        {
          value: 'no',
          label: 'No — general purpose',
          description: 'General-purpose amplification, buffering, filtering where standard accuracy is sufficient',
          attributeEffects: [],
        },
      ],
    },

    // ================================================================
    // Q4: Circuit Gain — conditional on Q1 = op_amp or instrumentation_amp
    // Drives decompensated op-amp blocking
    // ================================================================
    {
      questionId: 'circuit_gain',
      questionText: 'What is the minimum closed-loop gain in your circuit?',
      priority: 4,
      condition: { questionId: 'device_function', values: ['op_amp', 'instrumentation_amp'] },
      options: [
        {
          value: 'unity',
          label: 'Unity gain (1 V/V)',
          description: 'Voltage follower / buffer — decompensated op-amps are BLOCKED (will oscillate)',
          attributeEffects: [
            {
              attributeId: 'min_stable_gain',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — decompensated op-amps (minimum stable gain > 1 V/V) will oscillate at unity gain. The additional open-loop gain crosses the noise gain curve before the compensation pole provides phase margin. Reject any replacement with minimum stable gain > 1.',
            },
          ],
        },
        {
          value: 'low',
          label: 'Low gain (2 – 10 V/V)',
          description: 'Low-gain amplification — some decompensated op-amps may be usable at gain ≥ 5',
          attributeEffects: [
            {
              attributeId: 'min_stable_gain',
              effect: 'escalate_to_primary',
              note: 'Minimum stable gain becomes primary — verify replacement is stable at your circuit\'s actual gain. Decompensated devices (e.g., min stable gain = 5) are acceptable only if circuit gain ≥ 5.',
            },
          ],
        },
        {
          value: 'high',
          label: 'High gain (> 10 V/V)',
          description: 'High-gain amplification — decompensated op-amps provide higher GBW at this gain',
          attributeEffects: [],
        },
      ],
    },

    // ================================================================
    // Q5: Automotive Application — drives AEC-Q100 and temp escalation
    // ================================================================
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 5,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'Automotive electronics requiring AEC-Q100 qualification, extended temperature range, and reliability testing',
          attributeEffects: [
            {
              attributeId: 'aec_q100',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — AEC-Q100 is mandatory for automotive. Non-qualified parts are rejected regardless of electrical match. Grade hierarchy: Grade 0 > Grade 1 > Grade 2 > Grade 3 (a higher grade number cannot substitute for a lower one).',
            },
            {
              attributeId: 'operating_temp',
              effect: 'escalate_to_primary',
              note: 'Automotive operating temperature must meet AEC-Q100 grade requirements — typically -40°C to +125°C (Grade 1) or +105°C (Grade 2).',
            },
          ],
        },
        {
          value: 'no',
          label: 'No — non-automotive',
          description: 'Consumer, industrial, or commercial application',
          attributeEffects: [],
        },
      ],
    },
  ],
};
