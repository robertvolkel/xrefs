import { FamilyContextConfig } from '../types';

/**
 * DACs — Digital-to-Analog Converters (Family C10)
 * Block C: Standard ICs
 *
 * 4 context questions:
 * 1. DAC output type — BLOCKING gate (Voltage / Current)
 * 2. Resolution / precision class (≤12-bit / 12–16-bit / 16–20-bit)
 * 3. Application type (Audio / Precision DC / Industrial / Battery)
 * 4. Automotive — AEC-Q100 gate
 *
 * Context sensitivity: high
 * Output type (voltage vs. current) is the first and hardest gate — these are
 * architecturally incompatible circuit topologies. No cross-type substitution
 * is possible. Within voltage-output DACs, resolution class and glitch energy
 * drive the most impactful substitution constraints.
 *
 * Q2 determines whether INL, DNL, glitch energy, settling time, noise density,
 * and reference type are primary matching axes or secondary. For 16–20-bit high
 * precision, these all escalate to mandatory + blockOnMissing.
 *
 * Q3 drives application-specific escalations: audio (glitch energy ≤ 10 nVs
 * mandatory), industrial control (power-on reset state mandatory — actuator
 * safety), precision DC (monotonicity mandatory), battery (power consumption).
 *
 * Source: docs/application-context-attribute-map.md, Section 37
 */
export const dacContext: FamilyContextConfig = {
  familyIds: ['C10'],
  contextSensitivity: 'high',
  questions: [
    // Q1: DAC output type — THE critical question, BLOCKING gate
    {
      questionId: 'dac_output_type',
      questionText: 'What is the DAC output type?',
      priority: 1,
      options: [
        {
          value: 'voltage_output',
          label: 'Voltage output (output pin produces a voltage proportional to digital code)',
          description: 'Current-output DAC candidates BLOCKED unconditionally. Output voltage range becomes mandatory + blockOnMissing. Output buffered and output current source remain active for load drive capability assessment. Proceed to Q2 for resolution context, Q3 for application type.',
          attributeEffects: [
            { attributeId: 'output_type', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Voltage output confirmed — all current-output DAC candidates are architecturally incompatible. A voltage-output DAC drives a voltage proportional to the digital code into a load; a current-output DAC sinks or sources current into a termination impedance (4–20 mA). The PCB output stage, feedback network, and load are designed for voltage signals — no cross-type substitution possible.' },
            { attributeId: 'output_voltage_range', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'Voltage output — output voltage range is the defining output specification. Replacement range must contain the original range (0–2.5V, 0–5V, ±10V, etc.). Clipping at the range boundary causes hard output limiting.' },
          ],
        },
        {
          value: 'current_output',
          label: 'Current output (sources/sinks current, typically 4–20 mA industrial loop)',
          description: 'Voltage-output DAC candidates BLOCKED unconditionally. Output current source escalated to mandatory + blockOnMissing — full-scale current must match loop standard. Output voltage range and output buffered become not applicable. Verify output compliance voltage covers maximum loop resistance at full current.',
          attributeEffects: [
            { attributeId: 'output_type', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Current output confirmed — all voltage-output DAC candidates are architecturally incompatible. A current-output DAC controls loop current (typically 4 mA = zero-scale, 20 mA = full-scale) into a low-impedance load. The PCB loop circuit, termination resistance, and compliance voltage are designed for current signals — no cross-type substitution possible.' },
            { attributeId: 'output_current_source_ma', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Current output — full-scale output current must match the loop standard. A 4–20 mA loop requires exactly 20 mA full-scale output. Verify output compliance voltage covers maximum loop resistance at full current.' },
            { attributeId: 'output_voltage_range', effect: 'not_applicable', note: 'Current output — output voltage range is not applicable. Current-output DACs control current, not voltage. The output voltage is determined by the loop resistance and compliance voltage.' },
            { attributeId: 'output_buffered', effect: 'not_applicable', note: 'Current output — buffered/unbuffered distinction is not applicable. Current-output DACs have a current-source output stage, not a voltage-source output stage.' },
          ],
        },
      ],
    },

    // Q2: Resolution / precision class
    {
      questionId: 'precision_class',
      questionText: 'What is the resolution / precision class?',
      priority: 2,
      options: [
        {
          value: 'general_12bit',
          label: '≤12-bit general purpose (setpoint control, bias generation, non-precision)',
          description: 'Default thresholds apply. INL ≤ 2 LSB and DNL ≤ 1 LSB are sufficient. Glitch energy and output noise density are Application Review. Reference type matching is standard.',
          attributeEffects: [],
        },
        {
          value: 'precision_16bit',
          label: '12–16-bit precision (industrial process control, precision bias, test equipment)',
          description: 'INL, DNL, reference type, glitch energy, settling time, and output noise density all escalated to primary. INL tightened to ≤ 1 LSB, DNL to ≤ 0.5 LSB. At 16-bit resolution, linearity errors directly affect output voltage accuracy in precision applications.',
          attributeEffects: [
            { attributeId: 'inl_lsb', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — INL tightened to ≤ 1 LSB. At 16-bit resolution, ±2 LSB INL introduces ±0.003% full-scale output error that corrupts precision setpoints and calibration voltages.' },
            { attributeId: 'dnl_lsb', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — DNL tightened to ≤ 0.5 LSB. DNL > 0.5 LSB at this resolution approaches non-monotonic territory — dangerous for closed-loop control applications.' },
            { attributeId: 'reference_type', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — reference type compatibility becomes critical. An external precision reference (C6 family) on the original board must be accepted by the replacement.' },
            { attributeId: 'glitch_energy_nVs', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — glitch energy at code transitions becomes a significant output disturbance. At major carry (midscale), R-2R DACs produce 50–500 nVs glitches that can disturb precision control loops.' },
            { attributeId: 'settling_time_us', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — settling time determines how quickly the output reaches its final value to within 1 LSB accuracy. For precision setpoint control, settling must be complete before the next measurement cycle.' },
            { attributeId: 'output_noise_density_nvhz', effect: 'escalate_to_primary', note: 'Precision 12–16-bit — output noise density limits the resolution achievable in practice. A noisy DAC with 16-bit resolution may only achieve 12–14 effective bits at the output.' },
          ],
        },
        {
          value: 'high_precision_20bit',
          label: '16–20-bit high precision (metrology, calibration source, high-resolution control)',
          description: 'INL, DNL, glitch energy, settling time, and output noise density escalated to mandatory + blockOnMissing. Reference type escalated to mandatory. Reference voltage escalated to primary. At this resolution, linearity errors are catastrophic and reference accuracy dominates system performance.',
          attributeEffects: [
            { attributeId: 'inl_lsb', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–20-bit high precision — INL ≤ 0.5 LSB required. At 20-bit resolution (1 LSB = Vref/1,048,576), even ±1 LSB INL introduces measurable non-linearity that corrupts metrology-grade output voltages.' },
            { attributeId: 'dnl_lsb', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–20-bit high precision — DNL ≤ 0.5 LSB required. Non-monotonic output (DNL > 1 LSB) is catastrophic for precision calibration sources and high-resolution control loops.' },
            { attributeId: 'reference_type', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–20-bit high precision — reference type match is critical. External reference circuits (C6 family, typically LTZ1000 or REF5025 class) are designed for the original DAC\'s Vref input characteristics.' },
            { attributeId: 'reference_voltage', effect: 'escalate_to_primary', note: '16–20-bit high precision — reference voltage mismatch changes LSB size and full-scale range. At 20-bit resolution, even 1% Vref difference shifts calibration significantly. Application Review because firmware recalibration may compensate.' },
            { attributeId: 'glitch_energy_nVs', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–20-bit high precision — glitch energy at code transitions directly limits the output purity. At this resolution, even small glitches produce measurable output disturbances. Must be verified from datasheet — almost never in Digikey parametric data.' },
            { attributeId: 'settling_time_us', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–20-bit high precision — settling time to within 1 LSB at 20-bit resolution requires extremely tight settling behavior. Verify the DAC settles to < 1 µV at 20-bit resolution with a 5V reference.' },
            { attributeId: 'output_noise_density_nvhz', effect: 'escalate_to_mandatory', note: 'MANDATORY: 16–20-bit high precision — output noise density is the practical resolution limiter. A 20-bit DAC with high output noise achieves far fewer effective bits. Noise integrates over the measurement bandwidth and directly limits setpoint stability.' },
          ],
        },
      ],
    },

    // Q3: Application type
    {
      questionId: 'application_type',
      questionText: 'What is the application type?',
      priority: 3,
      options: [
        {
          value: 'audio',
          label: 'Audio (waveform reproduction, D/A conversion for speakers/headphones)',
          description: 'Glitch energy escalated to mandatory + blockOnMissing with threshold ≤ 10 nVs (professional audio). Update rate must match audio sample rate. Output noise density and settling time escalated to mandatory. Architecture escalated to primary (Delta-Sigma preferred for low glitch and noise floor).',
          attributeEffects: [
            { attributeId: 'glitch_energy_nVs', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Audio — glitch energy > 10 nVs is audible as clicks and intermodulation artifacts at line level. Professional audio requires < 1 nVs. Many 16-bit general-purpose DACs have glitch energy of 50–300 nVs — completely unacceptable for audio despite matching on resolution, INL, and DNL. This spec is almost never in Digikey parametric data — must be verified from the datasheet directly.' },
            { attributeId: 'update_rate_sps', effect: 'escalate_to_mandatory', note: 'MANDATORY: Audio — update rate must match the audio stream sample rate exactly: 44.1 kSPS (CD), 48 kSPS (professional), 96 kSPS (high-res), 192 kSPS (studio). A DAC that cannot accept the source sample rate produces silence or distortion.' },
            { attributeId: 'output_noise_density_nvhz', effect: 'escalate_to_mandatory', note: 'MANDATORY: Audio — output noise density at 1 kHz determines signal-to-noise ratio. A 16-bit audio DAC needs noise density < ~10 nV/√Hz to achieve > 90 dB SNR across 20 Hz–20 kHz bandwidth. Higher noise reduces dynamic range and masks low-level audio detail.' },
            { attributeId: 'settling_time_us', effect: 'escalate_to_mandatory', note: 'MANDATORY: Audio — settling time must be < one sample period (< 22 µs at 44.1 kSPS, < 20 µs at 48 kSPS). If the DAC has not settled by the next sample, intersample interference occurs, degrading the audio signal at high frequencies.' },
            { attributeId: 'architecture', effect: 'escalate_to_primary', note: 'Audio — Delta-Sigma architecture is preferred for audio due to inherent low glitch energy and noise shaping. R-2R has large midscale glitch. Current-steering has very large glitch energy. Flag non-Delta-Sigma architectures as Application Review for audio glitch profile.' },
          ],
        },
        {
          value: 'precision_dc',
          label: 'Precision DC / waveform generation (calibration source, waveform generator, precision setpoint)',
          description: 'INL and DNL escalated to mandatory (monotonicity required). Glitch energy and output noise density escalated to primary. Settling time escalated to primary. Reference type escalated to mandatory. Power-on reset state flagged as Application Review.',
          attributeEffects: [
            { attributeId: 'inl_lsb', effect: 'escalate_to_mandatory', note: 'MANDATORY: Precision DC — INL directly determines output voltage accuracy across the entire code range. For calibration sources, INL must be ≤ 0.5 LSB to maintain traceable accuracy. For waveform generation, INL creates harmonic distortion in the output signal.' },
            { attributeId: 'dnl_lsb', effect: 'escalate_to_mandatory', note: 'MANDATORY: Precision DC — monotonicity required. DNL > +1 LSB creates a non-monotonic transfer function where increasing the digital code decreases the output voltage at that transition. In closed-loop control, this creates positive feedback at the non-monotonic code, driving the loop away from setpoint.' },
            { attributeId: 'glitch_energy_nVs', effect: 'escalate_to_primary', note: 'Precision DC — glitch energy limits THD and SFDR of generated waveforms. At high output frequencies where the DAC cycles through midscale frequently, each glitch contributes a harmonic component to the output spectrum.' },
            { attributeId: 'output_noise_density_nvhz', effect: 'escalate_to_primary', note: 'Precision DC — noise integrates over the control loop bandwidth and limits setpoint stability. For calibration sources, output noise must be well below 1 LSB at the operating bandwidth.' },
            { attributeId: 'settling_time_us', effect: 'escalate_to_primary', note: 'Precision DC — settling time determines how quickly the output reaches a stable, accurate value after a code change. For waveform generation, settling must be complete before the next sample period.' },
            { attributeId: 'reference_type', effect: 'escalate_to_mandatory', note: 'MANDATORY: Precision DC — reference type match is critical. Precision DC applications typically use external references (C6 family) for superior initial accuracy and temperature stability. Reference type mismatch means the DAC cannot connect to the reference circuit on the PCB.' },
          ],
        },
        {
          value: 'industrial_control',
          label: 'Industrial process control (control valve, actuator drive, 4–20 mA loop)',
          description: 'Power-on reset state escalated to mandatory — verify output safe state on power-up before firmware initialization. Output buffered escalated to primary. Settling time escalated to primary for fast control loops.',
          attributeEffects: [
            { attributeId: 'power_on_reset_state', effect: 'escalate_to_mandatory', note: 'MANDATORY: Industrial control — power-on reset state determines actuator position before firmware loads. A DAC driving a proportional valve that powers on to midscale instead of 0V partially opens the valve before temperature/pressure control firmware has initialized. A DAC driving a heating element powering on to full-scale activates the heater at 100% before temperature control starts. ALWAYS verify safe state on power-up.' },
            { attributeId: 'output_buffered', effect: 'escalate_to_primary', note: 'Industrial control — most industrial designs drive loads directly from the DAC without external buffer amplifiers. An unbuffered replacement for a buffered original produces output voltage errors under load — the output droops proportional to (Iload × Zout) where Zout may be 5–50 kΩ for unbuffered DACs.' },
            { attributeId: 'settling_time_us', effect: 'escalate_to_primary', note: 'Industrial control — settling time must be << the control loop period for accurate process control. For fast loops (PID at 100 Hz): settling must be < 1 ms. For slow loops (temperature control at 1 Hz): settling is rarely the bottleneck.' },
          ],
        },
        {
          value: 'battery_powered',
          label: 'Battery-powered / power-constrained',
          description: 'Power consumption escalated to primary. High-speed or current-steering architecture candidates flagged Application Review for power budget. Verify DAC power-down mode current if system uses sleep/wake cycles.',
          attributeEffects: [
            { attributeId: 'power_consumption_mw', effect: 'escalate_to_primary', note: 'Battery-powered — power consumption directly affects battery life. High-speed current-steering DACs consume significantly more power than low-speed R-2R types. Buffered DACs with internal op-amp consume more than unbuffered. Verify that power consumption includes both analog and digital supply contributions. Also check power-down mode current if the system uses sleep/wake cycles — a DAC with 1 mW active but 100 µA power-down is far better for battery life than 0.5 mW active with 10 µA power-down if the system sleeps 90% of the time.' },
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
          description: 'AEC-Q100 becomes mandatory + blockOnMissing. Non-AEC-Q100 candidates removed from pool before scoring. Operating temperature range must cover −40°C to +125°C minimum. Power-on reset state escalated to primary for safety-critical initialization.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q100 required. Non-automotive-qualified parts removed from results before scoring. Required for DACs in ECU output stages, body control modules, ADAS actuator control, and battery management systems.' },
            { attributeId: 'operating_temp_range', effect: 'escalate_to_mandatory', note: 'Automotive — must cover −40°C to +125°C minimum (Grade 1). DAC accuracy specs (INL, offset, gain drift, reference TC) are temperature-dependent — verify specs are maintained over the full automotive temperature range, not just +25°C. Commercial-grade DACs (0 to +70°C) have unspecified performance at automotive temperature extremes.' },
            { attributeId: 'power_on_reset_state', effect: 'escalate_to_primary', note: 'Automotive — power-on reset state is safety-critical in automotive applications. A DAC driving an actuator (throttle, brake assist, steering) that powers on to an unsafe state before ECU firmware initialization can cause unintended vehicle motion. Verify safe power-on state for the specific automotive application.' },
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
