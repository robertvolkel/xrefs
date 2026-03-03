import { FamilyContextConfig } from '../types';

/**
 * ADCs — Analog-to-Digital Converters (Family C9)
 * Block C: Standard ICs
 *
 * 4 context questions:
 * 1. ADC architecture — BLOCKING gate (SAR / Delta-Sigma / Pipeline / Flash)
 * 2. Resolution / precision class (≤12-bit / 12–16-bit / 16–24-bit)
 * 3. Channel / sampling topology and application type
 * 4. Automotive — AEC-Q100 gate
 *
 * Context sensitivity: high
 * Architecture is the first and hardest gate — SAR, Delta-Sigma, Pipeline,
 * and Flash converters have fundamentally different latency, noise floor, speed,
 * and power characteristics. Substitution across architectures requires firmware
 * changes and may destabilize control loops.
 *
 * Q2 is the most impactful escalation question — it determines whether ENOB,
 * INL, DNL, and reference type are primary matching axes or secondary. For
 * 16–24-bit high precision, ENOB/INL/DNL all escalate to mandatory +
 * blockOnMissing.
 *
 * Q3 drives two independent escalations: simultaneous sampling for phase-
 * sensitive multi-channel applications, and conversion latency for control
 * loops. These are independent failure modes — a simultaneous-sampling ADC
 * in a battery application needs both Q3=simultaneous and Q3=battery answers.
 *
 * Source: docs/application-context-attribute-map.md, Section 36
 */
export const adcContext: FamilyContextConfig = {
  familyIds: ['C9'],
  contextSensitivity: 'high',
  questions: [
    // Q1: ADC architecture — THE critical question, BLOCKING gate
    {
      questionId: 'adc_architecture',
      questionText: 'What is the ADC architecture?',
      priority: 1,
      options: [
        {
          value: 'sar',
          label: 'SAR (Successive-Approximation Register)',
          description: 'Delta-Sigma, Pipeline, and Flash candidates blocked. 1-cycle conversion latency, 8–18 bit resolution, 1 kSPS–5 MSPS. Ideal for control loops, multiplexed multi-channel measurement, and low-latency applications. Low power, no pipeline delay.',
          attributeEffects: [
            { attributeId: 'architecture', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: SAR architecture confirmed — all Delta-Sigma, Pipeline, and Flash candidates are architecturally incompatible. SAR has 1-cycle latency; Delta-Sigma has decimation filter group delay (10s–100s ms); Pipeline has multi-cycle pipeline delay. No cross-architecture substitution possible without firmware redesign and potential control loop destabilization.' },
          ],
        },
        {
          value: 'delta_sigma',
          label: 'Delta-Sigma (Sigma-Delta)',
          description: 'SAR, Pipeline, and Flash candidates blocked. High resolution (16–32 bit), high latency (decimation filter group delay = (filter_order × decimation_ratio) / ODR, often 10s–100s ms). Ideal for precision DC measurement, weighing, thermocouples, audio. Fatal in fast control loops due to conversion latency.',
          attributeEffects: [
            { attributeId: 'architecture', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Delta-Sigma architecture confirmed — all SAR, Pipeline, and Flash candidates are architecturally incompatible. Delta-Sigma oversamples 64×–4096× and uses a decimation filter, producing high resolution (16–32 bit) at the cost of conversion latency. The group delay cannot be reduced without sacrificing the resolution advantage.' },
            { attributeId: 'conversion_latency_cycles', effect: 'escalate_to_primary', note: 'Delta-Sigma — decimation filter group delay is the dominant constraint. Latency ≈ (filter_order × decimation_ratio) / ODR. A sinc3 filter at ODR=100 SPS has ~30 ms group delay. Must be evaluated at the application\'s actual ODR, not the best-case ODR in the datasheet.' },
          ],
        },
        {
          value: 'pipeline',
          label: 'Pipeline',
          description: 'SAR, Delta-Sigma, and Flash candidates blocked. High throughput (10–500 MSPS) with moderate resolution (8–16 bit). Pipeline latency = several clock cycles. Ideal for communications receivers, imaging, oscilloscopes. Sample rate and THD are the dominant specifications.',
          attributeEffects: [
            { attributeId: 'architecture', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Pipeline architecture confirmed — all SAR, Delta-Sigma, and Flash candidates are architecturally incompatible. Pipeline processes multiple samples through stages simultaneously, achieving high throughput at moderate resolution. The pipeline latency (several clock cycles) is deterministic and manageable for communications/imaging but not for tight control loops.' },
            { attributeId: 'sample_rate_sps', effect: 'escalate_to_primary', note: 'Pipeline — high speed is the reason for choosing pipeline architecture. Sample rate is the dominant specification (10–500 MSPS). A slower pipeline replacement defeats the purpose of the architecture selection.' },
            { attributeId: 'thd_db', effect: 'escalate_to_primary', note: 'Pipeline — harmonic distortion dominates at high input frequencies. SFDR (spurious-free dynamic range) is the key AC performance metric for pipeline ADCs in communications receivers.' },
          ],
        },
        {
          value: 'flash',
          label: 'Flash / Folding-Interpolating',
          description: 'SAR, Delta-Sigma, and Pipeline candidates blocked. Very high speed (>500 MSPS), low resolution (6–10 bit), high power (100+ mW typical), 1-cycle latency. Ideal for extreme-speed applications (high-speed digitizers, oscilloscopes, radar). Not suitable for precision measurement.',
          attributeEffects: [
            { attributeId: 'architecture', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Flash architecture confirmed — all SAR, Delta-Sigma, and Pipeline candidates are architecturally incompatible. Flash uses 2^N−1 comparators for single-cycle conversion at extreme speed. The massive comparator array limits resolution to 6–10 bits and consumes significant power.' },
            { attributeId: 'sample_rate_sps', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Flash — extreme speed is the only reason for choosing Flash architecture. Sample rate >500 MSPS is the defining requirement. A slower replacement defeats the architecture selection entirely.' },
            { attributeId: 'power_consumption_mw', effect: 'escalate_to_primary', note: 'Flash — power consumption is inherently high (100+ mW typical due to 2^N−1 comparators). Verify the power budget can accommodate Flash-class current draw. The power supply must provide adequate decoupling for the large instantaneous current transients.' },
          ],
        },
      ],
    },

    // Q2: Resolution / precision class
    {
      questionId: 'precision_class',
      questionText: 'What is the resolution / precision class of the application?',
      priority: 2,
      options: [
        {
          value: 'general_12bit',
          label: '≤12-bit general purpose (sensor digitization, position feedback, general control)',
          description: 'Default thresholds apply. ENOB is informational (Application Review). INL ≤ 2 LSB and DNL ≤ 1 LSB are sufficient. Reference type matching is standard. THD is informational.',
          attributeEffects: [],
        },
        {
          value: 'precision_16bit',
          label: '12–16-bit precision (industrial measurement, data acquisition, precision control)',
          description: 'ENOB, INL, DNL, reference type, and THD all escalated to primary. INL tightened to ≤ 1 LSB, DNL to ≤ 0.5 LSB. Linearity errors at this resolution become significant for closed-loop control accuracy.',
          attributeEffects: [
            { attributeId: 'enob', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — ENOB becomes a primary matching axis. A "16-bit ADC" with ENOB=14 performs as 14-bit. Verify ENOB at the application\'s actual sample rate and input frequency.' },
            { attributeId: 'inl_lsb', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — INL tightened to ≤ 1 LSB. At 16-bit resolution, ±2 LSB INL introduces ±0.003% full-scale non-linearity error that corrupts precision measurements.' },
            { attributeId: 'dnl_lsb', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — DNL tightened to ≤ 0.5 LSB. DNL > 0.5 LSB at this resolution should be flagged Application Review — approaching missing code territory.' },
            { attributeId: 'reference_type', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — reference type compatibility becomes critical. An external precision reference (C6 family) on the original board must be accepted by the replacement.' },
            { attributeId: 'thd_db', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — THD becomes important for AC-coupled signal acquisition and audio applications.' },
          ],
        },
        {
          value: 'high_precision_24bit',
          label: '16–24-bit high precision (weighing, pressure, instrumentation, audio)',
          description: 'ENOB escalated to mandatory + blockOnMissing. INL and DNL escalated to mandatory (≤ 0.5 LSB). Reference type escalated to mandatory. Reference voltage escalated to primary. At this resolution, linearity errors are catastrophic and reference accuracy dominates system performance.',
          attributeEffects: [
            { attributeId: 'enob', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: 16–24-bit high precision — ENOB is the honest performance metric. A "24-bit ADC" with ENOB=20 loses 4 bits of dynamic range. Missing ENOB data at this precision level is unacceptable. Evaluate at application ODR, not best-case datasheet ODR.' },
            { attributeId: 'inl_lsb', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–24-bit high precision — INL ≤ 0.5 LSB required. At 24-bit resolution, even ±1 LSB INL introduces measurable non-linearity that cannot be calibrated with gain+offset correction alone.' },
            { attributeId: 'dnl_lsb', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–24-bit high precision — DNL ≤ 0.5 LSB required. No missing codes tolerable. DNL > 0.5 LSB at this resolution causes code-specific discontinuities visible in precision measurements (weight scales, pressure transducers, load cells).' },
            { attributeId: 'reference_type', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–24-bit high precision — reference type match is critical. External reference circuits (C6 family, typically LTZ1000 or REF5025 class) are designed for the original ADC\'s Vref input characteristics.' },
            { attributeId: 'reference_voltage', effect: 'escalate_to_primary', note: '16–24-bit high precision — reference voltage mismatch changes LSB size and full-scale range. At 24-bit resolution, even 1% Vref difference shifts calibration significantly. Application Review because firmware recalibration may compensate.' },
            { attributeId: 'thd_db', effect: 'escalate_to_primary', note: '16–24-bit high precision — THD important for AC-coupled applications (audio ADCs, vibration measurement). Verify at application input frequency, not just low-frequency spec.' },
          ],
        },
      ],
    },

    // Q3: Channel / sampling topology and application type
    {
      questionId: 'sampling_topology',
      questionText: 'What is the channel / sampling topology and application type?',
      priority: 3,
      options: [
        {
          value: 'single_or_multiplexed',
          label: 'Single-channel or multi-channel multiplexed (channels sampled sequentially)',
          description: 'Simultaneous sampling is not required. Inter-channel time skew is acceptable for DC measurement, sensor reading, and non-phase-sensitive applications. Default weights apply for latency and power.',
          attributeEffects: [
            { attributeId: 'simultaneous_sampling', effect: 'not_applicable', note: 'Single-channel or multiplexed — simultaneous sampling is not required. Inter-channel time skew is acceptable for DC measurements, sensor readings, and non-phase-sensitive applications.' },
          ],
        },
        {
          value: 'simultaneous',
          label: 'Multi-channel simultaneous sampling (all channels captured at identical moment — phase-sensitive)',
          description: 'Simultaneous sampling escalated to mandatory + blockOnMissing. Multiplexed ADCs BLOCKED unconditionally — inter-channel time skew is fatal for phase-sensitive applications. Required for three-phase motor control, power quality metering, vibration analysis, cross-correlation measurement.',
          attributeEffects: [
            { attributeId: 'simultaneous_sampling', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Simultaneous sampling required — multiplexed ADCs are BLOCKED unconditionally. Inter-channel time skew of (1/sample_rate) per channel corrupts phase measurements. At 60 Hz on 4-channel multiplexed at 100 kSPS: 10 µs skew per channel pair = 0.216° phase error. In three-phase motor control, this skew corrupts field-oriented control calculations. In power quality metering, it corrupts power factor measurement.' },
          ],
        },
        {
          value: 'control_loop',
          label: 'Control loop / closed-loop feedback (fast response required)',
          description: 'Conversion latency escalated to mandatory + blockOnMissing. Delta-Sigma candidates flagged Application Review with calculated phase margin impact. Sample rate escalated to primary. Extra latency reduces phase margin: 1 ms latency @ 1 kHz control loop = −3.6° phase margin.',
          attributeEffects: [
            { attributeId: 'conversion_latency_cycles', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Control loop — conversion latency directly impacts loop stability. At 1 kHz loop bandwidth, each millisecond of additional latency consumes 1.8° of phase margin. A Delta-Sigma ADC with sinc3 filter at ODR=100 SPS has ~30 ms group delay = −54° phase margin loss — catastrophic for a 10 Hz PID loop (100 ms period). SAR latency = 1/100,000 = 10 µs (three orders of magnitude less).' },
            { attributeId: 'sample_rate_sps', effect: 'escalate_to_primary', note: 'Control loop — sample rate determines the Nyquist bandwidth of the control loop. A slower ADC limits the maximum loop bandwidth and may cause aliasing of high-frequency disturbances.' },
          ],
        },
        {
          value: 'battery_powered',
          label: 'Battery-powered / power-constrained',
          description: 'Power consumption escalated to primary. High-speed pipeline ADCs (100–500 mW) flagged Application Review for power. Delta-Sigma (1–50 mW) or low-rate SAR (<1 mW) preferred. Verify minimum sample rate still meets application requirements.',
          attributeEffects: [
            { attributeId: 'power_consumption_mw', effect: 'escalate_to_primary', note: 'Battery-powered — power consumption directly affects battery life. Pipeline ADCs (100–500 mW) are unsuitable for battery applications. Delta-Sigma (1–50 mW at low ODR) and low-rate SAR (<1 mW) are preferred. Verify that power consumption includes both analog and digital supply contributions. Higher power also increases self-heating, degrading DC measurement accuracy via thermal drift of the internal reference.' },
          ],
        },
      ],
    },

    // Q4: Automotive — AEC-Q100 gate
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive design requiring AEC-Q100?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory + blockOnMissing. Non-AEC-Q100 candidates removed from pool before scoring. Operating temperature range must cover −40°C to +125°C minimum. Required for ECU, ADAS sensor fusion, battery management systems, motor control ADCs.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q100 required. Non-automotive-qualified parts removed from results before scoring. For ADAS and functional safety: verify that INL and DNL meet automotive functional safety requirements — linearity directly affects safety-critical measurements (steering angle sensors, current sensing for battery management, radar IF digitization).' },
            { attributeId: 'operating_temp_range', effect: 'escalate_to_mandatory', note: 'Automotive — must cover −40°C to +125°C minimum (Grade 1). ADC accuracy specs (INL, offset, gain drift) are temperature-dependent — verify specs are maintained over the full automotive temperature range, not just +25°C. Commercial-grade ADCs (0 to +70°C) have unspecified performance at automotive temperature extremes.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard qualification matching. AEC-Q100 is operational — presence is informational but not required.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
