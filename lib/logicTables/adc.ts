import { LogicTable } from '../types';

/**
 * ADCs — Analog-to-Digital Converters — Family C9
 * Block C: Standard ICs
 *
 * Derived from: docs/c9_adc_logic.docx
 * 20 attributes with specific matching rules for cross-reference validation.
 *
 * Ninth family in Block C. Covers four fundamentally different converter
 * architectures in a single Digikey category ("Data Acquisition — Analog to
 * Digital Converters (ADC)"):
 *
 * SAR (Successive-Approximation Register):
 * - 1-cycle conversion latency, 8–18 bit resolution, 1 kSPS–5 MSPS.
 * - Correct for control loops and multiplexed precision measurement.
 * - Low power, low latency, moderate speed.
 *
 * DELTA-SIGMA (Sigma-Delta):
 * - High resolution (16–32 bit), high latency (decimation filter group delay,
 *   tens to hundreds of milliseconds at low ODR), 1 SPS–500 kSPS.
 * - Correct for precision DC measurement, weighing, audio.
 * - Fatal in fast control loops due to conversion latency.
 *
 * PIPELINE:
 * - High speed (10–500 MSPS), moderate resolution (8–16 bit), pipeline
 *   latency of several clock cycles.
 * - Correct for communications receivers and imaging.
 *
 * FLASH:
 * - Very high speed (>500 MSPS), low resolution (6–10 bit), high power.
 * - Correct for oscilloscopes and radar.
 *
 * architecture is the HARD GATE — no cross-architecture substitution. SAR,
 * Delta-Sigma, Pipeline, and Flash have fundamentally different latency, noise
 * floor, speed, and power characteristics. Post-scoring filter removes all
 * cross-architecture candidates before results are shown.
 *
 * Related families: C6 (Voltage References) provides external Vref; C8
 * (Timers/Oscillators) provides sampling clocks.
 */
export const adcLogicTable: LogicTable = {
  familyId: 'C9',
  familyName: 'ADCs — Analog-to-Digital Converters',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for ADC replacement validation — architecture is a BLOCKING gate before any parametric evaluation',
  rules: [
    // ============================================================
    // SECTION 1: ARCHITECTURE & INTERFACE IDENTITY
    // ============================================================
    {
      attributeId: 'architecture',
      attributeName: 'ADC Architecture',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. SAR, Delta-Sigma, Pipeline, and Flash converters have fundamentally different latency, noise floor, speed, and power characteristics — substitution across architectures requires firmware changes and may destabilize control loops. SAR: 1-cycle latency, 8–18 bit, 1 kSPS–5 MSPS. Delta-Sigma: high resolution (16–32 bit), high latency (decimation filter group delay). Pipeline: high speed (10–500 MSPS), moderate resolution. Flash: very high speed (>500 MSPS), low resolution. Post-scoring filter removes all cross-architecture candidates before ranking.',
      sortOrder: 1,
      valueAliases: [
        ['Delta-Sigma', 'ADC, DELTA-SIGMA', 'Sigma-Delta', 'ΔΣ'],
        ['SAR', 'Successive Approximation', 'Successive-Approximation Register'],
        ['Pipeline', 'Pipelined'],
        ['Flash', 'Direct Conversion'],
      ],
    },
    {
      attributeId: 'resolution_bits',
      attributeName: 'Resolution (bits)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'Exact match required. 12-bit ≠ 16-bit: the LSB size (1 LSB = Vref / 2^N) changes with resolution, affecting measurement accuracy and noise floor. A lower-resolution replacement is BLOCKED — fewer bits means coarser quantization. A higher-resolution replacement is acceptable as a parametric upgrade but must be flagged Application Review for firmware changes (extra bits may change data register width, require different scaling, and affect DMA transfer size).',
      sortOrder: 2,
    },
    {
      attributeId: 'interface_type',
      attributeName: 'Interface Type',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'SPI, I2C, Parallel, and Serial LVDS interfaces require different firmware drivers, different PCB routing, and are not pin-compatible. Within SPI: verify CPOL/CPHA mode (modes 0,0 and 1,1 are most common but not universal), word length (16-bit vs. 24-bit transfers), conversion trigger (CS-based vs. CNVST pin vs. free-running), and daisy-chain support. Any SPI parameter mismatch requires firmware changes. I2C ADCs have 7-bit addresses — verify no address conflict with other I2C devices on the same bus.',
      sortOrder: 3,
    },
    {
      attributeId: 'input_configuration',
      attributeName: 'Input Configuration',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'Single-ended, differential, and pseudo-differential input configurations determine the analog front-end circuit topology. The input amplifier, common-mode voltage setting, and PCB trace routing are all designed for a specific input configuration. Differential inputs reject common-mode noise — mandatory in electrically noisy environments. A single-ended input circuit cannot drive a differential ADC input to full specification without an instrumentation amplifier or differential driver. Pseudo-differential (low-impedance VCOM pin) ≠ true differential.',
      sortOrder: 4,
    },

    // ============================================================
    // SECTION 2: CHANNEL & SAMPLING TOPOLOGY
    // ============================================================
    {
      attributeId: 'channel_count',
      attributeName: 'Number of Channels',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      blockOnMissing: true,
      engineeringReason: 'Replacement channels must be ≥ original. More channels are acceptable (unused channels do not affect firmware beyond pin count). Fewer channels are BLOCKED — cannot multiplex missing channels without additional hardware. Also verify channel-to-channel crosstalk spec for multi-channel ADCs (separate from SNR). For multiplexed ADCs: total throughput rate is divided by channel count.',
      sortOrder: 5,
    },
    {
      attributeId: 'simultaneous_sampling',
      attributeName: 'Simultaneous Sampling',
      logicType: 'identity_flag',
      weight: 9,
      engineeringReason: 'Whether all channels sample at exactly the same moment (simultaneous with independent sample-and-hold per channel) vs. multiplexed (channels sampled sequentially, introducing inter-channel time skew of 1/sample_rate per channel). BLOCKING when original is simultaneous: a multiplexed ADC cannot substitute in motor control (phase current measurement), power quality metering (voltage/current phase coherence), vibration analysis (accelerometer axis time-coherence), or any cross-correlation/phase-measurement application. At 60 Hz signal on a 4-channel multiplexed ADC at 100 kSPS: each adjacent channel has 10 µs skew = 0.216° phase error.',
      sortOrder: 6,
    },
    {
      attributeId: 'sample_rate_sps',
      attributeName: 'Sample Rate (SPS)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      blockOnMissing: true,
      engineeringReason: 'Maximum samples per second. Replacement rate must be ≥ original. For multi-channel multiplexed ADCs: verify throughput per channel (total rate / channels). For Delta-Sigma: output data rate (ODR) is the relevant spec, not the internal oversampling rate. Nyquist limit moves with sample rate — a lower rate may alias previously clean signals. For Pipeline ADCs: sample rate determines the Nyquist bandwidth for the analog input.',
      sortOrder: 7,
    },

    // ============================================================
    // SECTION 3: ACCURACY & LINEARITY
    // ============================================================
    {
      attributeId: 'enob',
      attributeName: 'Effective Number of Bits (ENOB)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'ENOB = (SNR − 1.76 dB) / 6.02. The honest dynamic performance metric — resolution_bits is nominal. Real 16-bit ADCs achieve ENOB of 13.5–15.5 depending on architecture and sample rate. A "16-bit ADC" with ENOB=14 performs as 14-bit. Replacement ENOB must be ≥ original. For Delta-Sigma ADCs: always evaluate ENOB at the application\'s actual output data rate (ODR), not the lowest/best-case ODR in the datasheet — ENOB degrades significantly as ODR increases. Escalated to mandatory + blockOnMissing for 16–24-bit high precision (Q2).',
      sortOrder: 8,
    },
    {
      attributeId: 'inl_lsb',
      attributeName: 'Integral Non-Linearity (LSB)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Peak deviation of the actual transfer function from a straight line. Replacement INL must be ≤ original (equal or better linearity). INL = ±2 LSB on a 12-bit ADC introduces ±0.049% full-scale non-linearity error that cannot be calibrated out with a simple gain and offset correction. INL directly causes gain error at specific code points. Escalated for precision/instrumentation applications (Q2). For 16–24-bit high precision: escalated to mandatory ≤ 0.5 LSB.',
      sortOrder: 9,
    },
    {
      attributeId: 'dnl_lsb',
      attributeName: 'Differential Non-Linearity (LSB)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Step-size uniformity between adjacent codes. DNL > +1 LSB means the ADC has missing output codes (some input voltages produce the same digital output as adjacent voltages), causing discontinuities. DNL < −1 LSB causes non-monotonic behavior. Both are catastrophic for closed-loop control and precision measurement. Replacement DNL must be ≤ original. BLOCK any replacement where dnl_lsb > 1.0 for applications requiring monotonic behavior (Q2 = precision or high-precision). Escalated for precision (Q2): 12–16-bit → ≤ 0.5 LSB; 16–24-bit → ≤ 0.5 LSB mandatory.',
      sortOrder: 10,
    },
    {
      attributeId: 'thd_db',
      attributeName: 'Total Harmonic Distortion (dBc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'More negative = lower distortion (better). Replacement THD must be ≤ original (more negative or equal). Critical for audio ADCs (THD > −80 dBc is audible at line level), industrial signal analyzers, and power quality measurement. THD dominates for AC-coupled signal acquisition — measures how much the ADC itself adds harmonic distortion to the input signal. Escalated to primary for AC-signal/audio and pipeline architecture applications (Q1/Q2).',
      sortOrder: 11,
    },

    // ============================================================
    // SECTION 4: REFERENCE & INPUT
    // ============================================================
    {
      attributeId: 'reference_type',
      attributeName: 'Reference Type',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'Internal only / External only / Both (internal with external override). If the original PCB has an external precision voltage reference (a C6 family part connected to the ADC\'s Vref pin), the replacement must accept external reference input — a replacement with internal-reference-only is BLOCKED (no Vref input circuit exists on the PCB). If the original uses internal reference (no external Vref circuit), an external-reference-only replacement is BLOCKED (no precision reference available on the board). Escalated to mandatory for precision applications (Q2).',
      sortOrder: 12,
    },
    {
      attributeId: 'reference_voltage',
      attributeName: 'Internal Reference Voltage (V)',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Internal Vref voltage value. If the original uses internal reference, replacement Vref must match — different Vref changes LSB size (1 LSB = Vref / 2^N) and shifts full-scale range. Example: 2.5V on 12-bit = 610 µV/LSB; 3.3V = 806 µV/LSB — all firmware calibration constants change. Firmware recalibration may compensate, hence Application Review rather than hard block. For external ref: verify the ADC input range accepts the external reference voltage. Escalated to primary for 16–24-bit high precision (Q2).',
      sortOrder: 13,
    },
    {
      attributeId: 'input_voltage_range',
      attributeName: 'Full-Scale Input Range (V)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Replacement input range must contain the signal range present on the board. A 0–5V ADC cannot substitute for a ±10V ADC — signals outside the range cause clipping and severe distortion. Unipolar (0 to Vref) ≠ bipolar (−Vref/2 to +Vref/2) without analog front-end modification. Undersized range causes hard clipping at the rails with total loss of signal information above the range. Also verify: some precision ADCs support programmable gain (PGA) — a higher-gain mode reduces the effective input range.',
      sortOrder: 14,
    },
    {
      attributeId: 'conversion_latency_cycles',
      attributeName: 'Conversion Latency (cycles)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Clock or conversion cycles from start to valid output. SAR: typically 1 cycle (low latency). Delta-Sigma: many cycles (decimation filter group delay ≈ (filter_order × decimation_ratio) / ODR, often 10s–100s ms at low ODR). Pipeline: several clock cycles. Critical for control loops — extra latency reduces phase margin. At 1 kHz control loop bandwidth, each millisecond of additional latency consumes 1.8° of phase margin. A sinc3 filter at ODR = 100 SPS has group delay ≈ 30 ms. Escalated to mandatory + blockOnMissing for control loop applications (Q3).',
      sortOrder: 15,
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
      engineeringReason: 'Must contain actual board supply voltages including transients. Verify both AVDD (analog supply) and DVDD (digital supply) separately — many precision ADCs have separate supply pins. AVDD may be 5V analog while DVDD is 3.3V digital. A replacement requiring 5V AVDD cannot substitute on a board with only 3.3V analog supply. Some precision ADCs require split supply (±5V or ±15V) for bipolar input range — these cannot substitute for single-supply devices without additional supply circuitry.',
      sortOrder: 16,
    },
    {
      attributeId: 'power_consumption_mw',
      attributeName: 'Power Consumption (mW)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Total current × voltage. Architecture determines the range: high-speed pipeline 100–500 mW, precision delta-sigma 1–50 mW, SAR at low rates <1 mW. Higher power consumption affects self-heating → thermal drift of internal reference, degrading precision for DC measurement. Escalated to primary for battery-powered applications (Q3). Pipeline ADCs flagged Application Review for power in battery-powered contexts.',
      sortOrder: 17,
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
      engineeringReason: 'Must fully cover the application temperature range. Commercial: 0 to +70°C. Industrial: −40 to +85°C. Automotive: −40 to +105°C or +125°C. ADC accuracy specs (INL, offset, gain, TC) are temperature-dependent — verify the specs are maintained over the full operating range, not just +25°C. Escalated to mandatory for automotive applications (Q4).',
      sortOrder: 18,
    },
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'Automotive qualification. Required for ECU, ADAS sensor fusion, battery management systems, motor control ADCs. Non-automotive parts BLOCKED from automotive designs regardless of electrical match. Escalated to mandatory + blockOnMissing for automotive applications (Q4). For ADAS and functional safety applications: INL and DNL also escalate to primary (linearity directly affects safety-critical measurements).',
      sortOrder: 19,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Case',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'TSSOP-16, MSOP-10, QFN-32, etc. Precision ADCs often have exposed pad or guard-ring requirements affecting PCB layout. High-speed ADCs in QFN/BGA need controlled-impedance routing to differential inputs. Package change is Application Review — verify footprint compatibility, exposed pad thermal connection, and layout-sensitive pin assignments (AGND vs. DGND separation is critical for precision ADCs). Pin-compatible drop-in is the ideal case; any footprint change requires PCB modification.',
      sortOrder: 20,
    },
  ],
};
