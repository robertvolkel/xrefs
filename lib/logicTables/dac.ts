import { LogicTable } from '../types';

/**
 * DACs — Digital-to-Analog Converters — Family C10
 * Block C: Standard ICs
 *
 * Derived from: docs/c10_dac_logic.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * Tenth family in Block C. Covers voltage-output and current-output DACs
 * across multiple Digikey categories:
 *
 * VOLTAGE OUTPUT (general-purpose and precision):
 * - R-2R, resistor-string, current-steering, and Delta-Sigma architectures.
 * - 8–20+ bit resolution, SPI/I2C/Parallel/Async interfaces.
 * - Key specs: INL, DNL, glitch energy, settling time, output buffer.
 *
 * CURRENT OUTPUT (industrial):
 * - 4–20 mA loop standard for process control.
 * - Full-scale current, compliance voltage, loop resistance.
 * - Key spec: output_current_source_ma (must match loop standard exactly).
 *
 * AUDIO:
 * - Delta-Sigma architecture, I2S/PCM interface, 16–32 bit.
 * - Key specs: glitch energy (< 10 nVs), SNR, THD+N.
 *
 * output_type is the HARD GATE — voltage-output and current-output DACs are
 * architecturally incompatible circuit topologies. A voltage-output DAC drives
 * a voltage into a load; a current-output DAC sources/sinks current into a
 * termination resistor (typically 0–20 mA or 4–20 mA for industrial loops).
 * Post-scoring filter removes all cross-type candidates before results.
 *
 * Related families: C6 (Voltage References — external Vref), C9 (ADCs —
 * companion converters), C4 (Op-Amps — output buffer for unbuffered DACs),
 * C1 (LDOs — DAC analog supply).
 */
export const dacLogicTable: LogicTable = {
  familyId: 'C10',
  familyName: 'DACs — Digital-to-Analog Converters',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for DAC replacement validation — output_type (voltage vs. current) is a BLOCKING gate before any parametric evaluation',
  rules: [
    // ============================================================
    // SECTION 1: ARCHITECTURE & OUTPUT IDENTITY
    // ============================================================
    {
      attributeId: 'output_type',
      attributeName: 'Output Type',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. Voltage output vs. Current output. These are architecturally incompatible: a voltage-output DAC drives a voltage proportional to the digital code into a load (buffered or unbuffered, output in volts); a current-output DAC sinks or sources a current into a termination resistor (output in mA, typically 0–20 mA or 4–20 mA for industrial loops). The PCB circuit, feedback network, and load are designed for one type — current-output DAC cannot substitute for voltage-output DAC or vice versa without redesigning the output stage. Post-scoring filter removes all cross-type candidates before results are returned.',
      sortOrder: 1,
    },
    {
      attributeId: 'resolution_bits',
      attributeName: 'Resolution (bits)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'Exact resolution match required. 12-bit ≠ 16-bit — LSB size (1 LSB = Vref / 2^N), noise floor, and update register width all change. Higher-resolution replacement is acceptable with Application Review (firmware register write width may change, scaling constants must be updated). Lower-resolution replacement is BLOCKED — it cannot replicate the original\'s output precision. Parsed directly from part number where encoded (DAC8562 = 12-bit, DAC8568 = 16-bit, AD5791 = 20-bit).',
      sortOrder: 2,
    },
    {
      attributeId: 'interface_type',
      attributeName: 'Interface Type',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'SPI / I2C / Parallel / Async (resistor or pin-strap programmable). Requires different firmware drivers, different PCB routing, and different pin counts. Within SPI: verify CPOL/CPHA mode, word length (16-bit vs. 24-bit transfers), and whether the DAC latches on CS rising edge or falling edge — latch timing errors cause output glitches. I2C DACs have programmable 7-bit addresses — verify no conflict on shared bus. Async (voltage-setting) DACs have no digital interface at all — they set output voltage via resistor ratio or control pin. BLOCK interface type mismatches.',
      sortOrder: 3,
    },
    {
      attributeId: 'architecture',
      attributeName: 'DAC Architecture',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'R-2R resistor string / Current-steering / Delta-Sigma / PWM (filtered). These architectures have different noise floors, glitch profiles, and settling behaviors. R-2R: standard general-purpose, inherent glitch at major carry transitions (LSB to MSB rollover). Current-steering: high speed, large glitch energy at code transitions, requires careful PCB layout. Delta-Sigma: very low noise, inherent low-pass filtering, slow settling. PWM: requires external RC filter, filter parameters affect bandwidth and ripple. Escalated to primary for audio and precision applications (Q3).',
      sortOrder: 4,
    },
    {
      attributeId: 'output_buffered',
      attributeName: 'Output Buffered',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Buffered output (internal op-amp drives output directly to low impedance, can source/sink current into load) vs. Unbuffered (output is a high-impedance resistor-string tap — requires external buffer op-amp to drive any significant load, and output voltage is affected by load current). If the original is unbuffered and the PCB has an external buffer op-amp, the replacement can be buffered or unbuffered. If the original is buffered and the PCB has no external buffer, an unbuffered replacement produces voltage errors under load. BLOCK unbuffered replacing buffered when no external buffer exists in the circuit.',
      sortOrder: 5,
    },

    // ============================================================
    // SECTION 2: CHANNEL & UPDATE TOPOLOGY
    // ============================================================
    {
      attributeId: 'channel_count',
      attributeName: 'Number of DAC Channels',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Number of DAC output channels. Replacement channel count must be >= original. More channels acceptable (unused channels can be set to a safe output level). Fewer channels BLOCKED — cannot share channels without hardware changes. For multi-channel DACs: verify whether channels share a common reference or have independent references — shared-reference DACs have correlated errors between channels.',
      sortOrder: 6,
    },
    {
      attributeId: 'update_rate_sps',
      attributeName: 'Update Rate (SPS)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Maximum output update rate (samples per second). Replacement update rate must be >= original. For waveform generation: update rate determines the maximum waveform frequency (Nyquist: maximum output frequency = update_rate / 2). For control loops: update rate determines the maximum control bandwidth. For audio: update rate is the sample rate (44.1 kSPS, 48 kSPS, 96 kSPS, 192 kSPS) — must match the audio stream sample rate exactly.',
      sortOrder: 7,
    },
    {
      attributeId: 'power_on_reset_state',
      attributeName: 'Power-On Reset State',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Output state immediately after power-on before firmware loads a value. Options: output = 0V (most common), output = midscale (Vref/2), output = full-scale (Vref), high-impedance (tri-stated). If the original powers on to 0V and drives a valve, heater, or actuator to a safe off state, a replacement that powers on to midscale may activate that actuator before firmware has initialized. BLOCKING when power-on state determines safety behavior. Flag as Application Review when power-on behavior is safety-neutral.',
      sortOrder: 8,
    },

    // ============================================================
    // SECTION 3: OUTPUT ACCURACY & LINEARITY
    // ============================================================
    {
      attributeId: 'inl_lsb',
      attributeName: 'Integral Non-Linearity (LSB)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Integral Non-Linearity (peak, in LSBs). Maximum deviation of actual output from ideal straight-line transfer function. Replacement INL must be <= original. INL directly causes output voltage errors that cannot be corrected by firmware calibration (gain + offset only correct two points; INL describes the error at every intermediate code). A 16-bit DAC with INL = ±4 LSB has a worst-case output error of ±4/65536 = ±0.006% full scale. Escalated to primary for precision DC (Q3).',
      sortOrder: 9,
    },
    {
      attributeId: 'dnl_lsb',
      attributeName: 'Differential Non-Linearity (LSB)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Differential Non-Linearity (peak, in LSBs). Measures step-size uniformity between adjacent output codes. DNL > +1 LSB means the DAC is non-monotonic — increasing the digital code may decrease the output voltage. Non-monotonic DACs are catastrophic in closed-loop control (positive feedback instead of negative). DNL < −1 LSB means missing codes (multiple input codes produce the same output voltage). Replacement DNL must be <= original. BLOCK any replacement with DNL > 0.5 LSB for applications requiring monotonic behavior (Q2 = precision or high-precision).',
      sortOrder: 10,
    },
    {
      attributeId: 'glitch_energy_nVs',
      attributeName: 'Glitch Energy (nVs)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Glitch impulse area at code transitions (nanoVolt-seconds). At major code transitions (especially midscale, where most significant bits change simultaneously), DAC output momentarily shoots to an incorrect value before settling to the correct voltage. This glitch is architecture-dependent: R-2R glitch at midscale transition can be 50–500 nVs; current-steering DACs can produce much larger glitches. For audio applications: glitch energy causes clicks and pops at code boundaries — audible at > ~10 nVs at audio frequencies. For precision DC: glitch at code transition disturbs control loops. Escalated to mandatory for audio (Q3). Rarely appears in Digikey parametric data — read the datasheet directly.',
      sortOrder: 11,
    },
    {
      attributeId: 'settling_time_us',
      attributeName: 'Settling Time (µs)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Time for output to settle to within 1 LSB (or specified accuracy) of final value after a full-scale step change. Replacement settling time must be <= original. For control loops: settling time must be << control period. For waveform generation: settling time limits the maximum frequency of clean output waveforms. For multiplexed DAC outputs: settling time limits the update rate when switching between channels. Buffered outputs generally have longer settling times than unbuffered due to op-amp bandwidth limitations.',
      sortOrder: 12,
    },
    {
      attributeId: 'output_noise_density_nvhz',
      attributeName: 'Output Noise Density (nV/√Hz)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Output voltage noise spectral density (nV/√Hz). Escalated to primary for audio and precision DC applications (Q3). DAC output noise floor limits the minimum signal level distinguishable at the output. For audio: noise density at 1 kHz determines SNR — a 16-bit audio DAC needs noise density < ~10 nV/√Hz to achieve > 90 dB SNR at 20 kHz bandwidth. For precision DC: noise integrates over the loop bandwidth and limits setpoint stability.',
      sortOrder: 13,
    },

    // ============================================================
    // SECTION 4: REFERENCE & OUTPUT RANGE
    // ============================================================
    {
      attributeId: 'reference_type',
      attributeName: 'Reference Type',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'Internal reference only / External reference only / Both (internal with external override). If the PCB has an external precision reference connected to the Vref pin, the replacement must accept external reference. If the original uses internal reference and the PCB has no external reference circuit, an external-reference-only replacement is BLOCKED. Escalated to mandatory when Q2 = 12–16-bit or 16–20-bit precision.',
      sortOrder: 14,
    },
    {
      attributeId: 'reference_voltage',
      attributeName: 'Internal Reference Voltage (V)',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Internal reference voltage (V). Different internal Vref changes the output full-scale range (Vout_max = Vref for unipolar). If firmware has been calibrated with a specific full-scale range, changing the Vref requires recalibration. Example: 2.5V internal Vref on 12-bit DAC gives 1 LSB = 610 µV; replacing with a DAC with 3.3V internal Vref gives 1 LSB = 806 µV — output voltages shift by 32% for any given digital code.',
      sortOrder: 15,
    },
    {
      attributeId: 'output_voltage_range',
      attributeName: 'Output Voltage Range (V)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 8,
      blockOnMissing: true,
      engineeringReason: 'Full-scale output voltage range (V). Replacement output range must contain the range required by the circuit. A 0–2.5V output DAC cannot substitute for a 0–5V DAC — signals in the 2.5–5V range are clipped. For bipolar output DACs (±5V, ±10V, ±Vref): verify both polarity limits. Output range is determined by both the reference voltage and any internal gain or output scaling — verify the actual output swing, not just the supply voltage.',
      sortOrder: 16,
    },
    {
      attributeId: 'output_current_source_ma',
      attributeName: 'Output Source Current (mA)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'For voltage-output DACs: maximum output source current (mA) from buffered output. Replacement must meet or exceed the load current requirement. If the DAC directly drives a resistive load (R2R network, bridge circuit, low-impedance sensor bias), the buffered output current determines whether the output maintains accuracy under load. Undercurrent causes output voltage droop proportional to (load current × output impedance). For current-output DACs: full-scale output current must match original (0–20 mA loop requires exactly 20 mA full scale).',
      sortOrder: 17,
    },

    // ============================================================
    // SECTION 5: POWER & SUPPLY
    // ============================================================
    {
      attributeId: 'supply_voltage_range',
      attributeName: 'Supply Voltage Range (V)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Analog and digital supply voltages. Must contain actual board supply voltages. Many precision DACs have separate AVDD and DVDD supplies — verify both. Some DACs require split supply (±5V, ±12V, ±15V) for bipolar output range — these cannot substitute for single-supply devices. Wide-supply DACs (2.7V–5.5V single supply) are safer substitutions across board generations.',
      sortOrder: 18,
    },
    {
      attributeId: 'power_consumption_mw',
      attributeName: 'Power Consumption (mW)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Total supply power (mW). Escalated to primary for battery-powered designs (Q3). Buffered DACs with internal op-amp consume more power than unbuffered. High-speed current-steering DACs consume significantly more power than low-speed R-2R types. DAC self-heating affects internal reference stability — verify thermal drift specs at operating power level.',
      sortOrder: 19,
    },

    // ============================================================
    // SECTION 6: QUALIFICATION & PACKAGE
    // ============================================================
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range (°C)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Must fully cover the application operating range. Industrial: −40°C to +85°C. Automotive: −40°C to +105°C or +125°C. Note: DAC accuracy specs (INL, offset, gain, reference TC) are temperature-dependent — verify specs are maintained over the full operating range, not just at +25°C. Internal voltage reference TC directly contributes to output voltage drift.',
      sortOrder: 20,
    },
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'Escalated to mandatory + blockOnMissing for automotive (Q4). AEC-Q100 required for DACs in ECU output stages, body control modules, ADAS actuator control, and battery management. Non-AEC parts BLOCKED from automotive designs.',
      sortOrder: 21,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Case',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'SOT-23-6, MSOP-10, TSSOP-16, QFN-20, etc. Precision DACs may have exposed pad requirements for thermal management of internal reference. Layout-sensitive: output pin placement relative to AGND affects noise. Package change is Application Review — verify footprint and any layout-critical pin assignments.',
      sortOrder: 22,
    },
  ],
};
