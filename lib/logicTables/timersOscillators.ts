import { LogicTable } from '../types';

/**
 * Timers and Oscillators — Family C8
 * Block C: Standard ICs
 *
 * Derived from: docs/c8_timers_oscillators_logic.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * Eighth family in Block C. Covers two architecturally unrelated component
 * types that share Digikey category labels but serve completely different
 * functions:
 *
 * 555/556 TIMER ICs:
 * - NE555/LM555/SA555/SE555 (bipolar): Minimum VCC 4.5V, output does not
 *   swing rail-to-rail (~1.7V drop from high rail at load).
 * - TLC555/ICM7555/LMC555/TS555 (CMOS): Supply range 2V–18V, rail-to-rail
 *   output, lower power consumption.
 * - Timing frequency set by external R and C, not by the IC itself.
 *   output_frequency_hz is not applicable for timers.
 *
 * PACKAGED OSCILLATORS:
 * - XO (Crystal Oscillator): Standard stability ±25–100 ppm over temperature.
 * - MEMS: Silicon-based, faster startup, better vibration immunity than XO.
 *   Valid XO↔MEMS cross-substitution with Application Review.
 * - TCXO (Temperature Compensated): ±0.5–5 ppm stability.
 * - VCXO (Voltage Controlled): PLL-driven, pull range is the critical spec.
 * - OCXO (Oven Controlled): ±0.01–0.1 ppm, 100–400 mW oven heater power.
 *
 * device_category is the HARD GATE — no cross-category substitution except
 * XO↔MEMS with Application Review. Within oscillators, stability class is a
 * second hard gate: each class represents a qualitatively different level of
 * frequency engineering. Post-scoring filter removes cross-category and
 * cross-stability-class candidates before results are shown.
 *
 * Related families: none directly. Crystal resonators (discrete components)
 * are separate from packaged oscillators (integrated IC + resonator).
 */
export const timersOscillatorsLogicTable: LogicTable = {
  familyId: 'C8',
  familyName: 'Timers and Oscillators (555 / XO / MEMS / TCXO / VCXO / OCXO)',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for timer and oscillator replacement validation — device_category is a BLOCKING gate before any parametric evaluation',
  rules: [
    // ============================================================
    // IDENTITY — Device Category, Frequency, Output Signal Type
    // ============================================================
    {
      attributeId: 'device_category',
      attributeName: 'Device Category / Stability Class',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. 555 timers and packaged oscillators are architecturally unrelated — a 555 produces timing from external R and C; a packaged oscillator contains an internal resonator and produces a fixed output frequency with no external timing components. Within oscillators, the stability class (XO / MEMS / TCXO / VCXO / OCXO) is a second hard gate: each represents a qualitatively different level of frequency engineering. Substituting an XO (±50 ppm) for a TCXO (±2.5 ppm) in a cellular modem violates frequency accuracy requirements. Post-scoring filter blocks all cross-category and cross-stability-class candidates. Exception: XO↔MEMS cross-substitution is permitted with Application Review.',
      sortOrder: 1,
    },
    {
      attributeId: 'output_frequency_hz',
      attributeName: 'Output Frequency',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'Exact match required for oscillators. 10.000 MHz and 10.240 MHz are not substitutable. 32.768 kHz and 32.000 kHz are not substitutable. Where frequency is encoded in the part number, parse it directly. Not applicable for 555 timers — their timing frequency is set by the external R and C values. For VCXOs, this is the center (nominal) frequency; pull range is captured separately in vcxo_pull_range_ppm.',
      sortOrder: 2,
    },
    {
      attributeId: 'output_signal_type',
      attributeName: 'Output Signal Type',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'CMOS, TTL, LVDS, LVPECL, Clipped Sine, and Open Drain are not interchangeable output standards. Each has different VOH/VOL, impedance, and termination requirements. LVDS and LVPECL require differential receivers; CMOS/TTL are single-ended. Clipped sine outputs are for RF applications. Not applicable for 555 timers (output is push-pull or open-collector, not a clock signal type).',
      sortOrder: 3,
    },

    // ============================================================
    // IDENTITY FLAGS — OE Polarity, Timer Variant, VCXO Pull Range
    // ============================================================
    {
      attributeId: 'oe_polarity',
      attributeName: 'Output Enable Polarity',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Functional HARD GATE when OE pin is actively controlled. Active-low /OE: output enabled when pin is low or floating, disabled when driven high. Active-high OE: output enabled when driven high, off when low or floating. If the circuit drives the pin low to gate the clock and the replacement has active-high OE, the clock output is permanently disabled from first power-on. When OE is tied to a fixed rail (always-on), flag as Application Review only.',
      sortOrder: 4,
    },
    {
      attributeId: 'timer_variant',
      attributeName: 'Timer Variant (CMOS vs Bipolar)',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: '555-family only. Bipolar 555 (NE555, LM555, SA555, SE555): minimum supply 4.5V, output does not swing rail-to-rail (drops ~1.7V from high rail at load), higher quiescent current (~3–6 mA). CMOS 555 (TLC555, ICM7555, LMC555, TS555): supply range 2V–18V, rail-to-rail output, lower Iq (~100 µA). BLOCK bipolar 555 substitutions in any design where VCC < 4.5V — the bipolar device will not function. Also flag output swing differences in precision monostable circuits at 5V.',
      sortOrder: 5,
    },
    {
      attributeId: 'vcxo_pull_range_ppm',
      attributeName: 'VCXO Pull Range (±ppm)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'VCXO only. Pull range must support the full frequency offset range required by the PLL — replacement pull range must be ≥ original. A PLL that needs ±30 ppm for crystal temperature tracking plus ±10 ppm for reference offset cannot lock if the replacement VCXO pulls only ±20 ppm — the PLL integrator saturates and the loop loses lock. This failure is temperature-dependent and typically manifests only at temperature extremes in the field. Also check pull sensitivity (ppm/V): mismatch > 2× affects PLL loop dynamics and output jitter.',
      sortOrder: 6,
    },

    // ============================================================
    // THRESHOLD — Tolerance, Stability, Aging, Output Levels
    // ============================================================
    {
      attributeId: 'initial_tolerance_ppm',
      attributeName: 'Initial Frequency Tolerance (ppm)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Replacement tolerance must be ≤ original. Initial tolerance at 25°C determines the maximum frequency offset at room temperature. For communications protocols: USB HS requires ≤±100 ppm total error budget; Bluetooth ≤±20 ppm. Escalated to mandatory + blockOnMissing for comms/precision applications (Q2).',
      sortOrder: 7,
    },
    {
      attributeId: 'temp_stability_ppm',
      attributeName: 'Temperature Stability (ppm over range)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Over full operating temperature range. Replacement stability must be ≤ original. For TCXO-class applications, this is the dominant specification — the entire point of a TCXO is achieving ±0.5–5 ppm stability that no uncompensated crystal can match. Escalated to mandatory + blockOnMissing for comms/precision applications (Q2).',
      sortOrder: 8,
    },
    {
      attributeId: 'aging_ppm_per_year',
      attributeName: 'Aging Rate (ppm/year)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Long-term frequency drift. Critical for deployed systems with no field calibration capability. A 5 ppm/year aging rate means 50 ppm drift over 10-year deployment — potentially exceeding protocol tolerance without recalibration. Escalated to primary for long-deployment / uncalibrated systems (Q2).',
      sortOrder: 9,
    },
    {
      attributeId: 'output_voh_vol',
      attributeName: 'Output VOH/VOL Levels',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Must cover downstream logic VIH/VIL thresholds. A 5V oscillator into 3.3V logic = VIH overstress and potential damage. A 1.8V oscillator driving 3.3V CMOS logic has VOH < VIH_min — the downstream device may not recognize the clock edge. Verify both VOH and VOL against the actual downstream receiver thresholds.',
      sortOrder: 10,
    },
    {
      attributeId: 'output_drive_cl_pf',
      attributeName: 'Output Load Capacitance (pF)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Maximum capacitive load the oscillator output can drive without degraded rise/fall time or frequency pulling. Replacement must match or exceed rated CL. If the replacement has lower CL rating and the PCB trace capacitance + fan-out exceeds it, rise/fall times degrade and may violate downstream setup/hold timing.',
      sortOrder: 11,
    },
    {
      attributeId: 'duty_cycle_pct',
      attributeName: 'Output Duty Cycle (%)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 5,
      engineeringReason: 'Acceptable duty cycle range must contain the actual output duty cycle. For high-speed SerDes interfaces, asymmetric duty cycle closes the timing eye — DDR and PCIe require 45–55% duty cycle. Escalated to primary for SerDes applications (Q2).',
      sortOrder: 12,
    },
    {
      attributeId: 'phase_jitter_ps_rms',
      attributeName: 'Phase Jitter (ps RMS)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'RMS jitter over specified integration bandwidth. For ADC clocking: SNR contribution = -20·log10(2π·f_input·jitter_rms). At 100 MHz analog input, 1 ps RMS jitter limits SNR to ~64 dB (~10.4 ENOB). For SerDes: DDR3 requires ≤10 ps RMS; PCIe Gen1 ≤25 ps RMS; USB HS ≤200 ps peak-to-peak. Escalated to mandatory + blockOnMissing for DDR/SerDes applications (Q2).',
      sortOrder: 13,
    },
    {
      attributeId: 'startup_time_ms',
      attributeName: 'Startup Time (ms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Time from power-on or OE assertion to stable clock output. Crystal XOs: 2–10 ms typical. MEMS: <1 ms. OCXOs: 30 seconds to 5 minutes (oven warm-up). Escalated for battery applications with frequent sleep/wake cycles (Q3) where startup time directly affects average power consumption.',
      sortOrder: 14,
    },

    // ============================================================
    // THRESHOLD — Supply, Temperature
    // ============================================================
    {
      attributeId: 'supply_voltage_range',
      attributeName: 'Supply Voltage Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 8,
      blockOnMissing: true,
      engineeringReason: 'Must contain actual board supply voltage including transients. Many 3.3V oscillators have 3.0V–3.6V range; if the board regulator outputs 3.3V ±5% (3.135–3.465V), verify the oscillator specification covers the full range. For OCXOs, verify both the logic supply (3.3V) and heater supply (often 5V or 12V, sometimes a separate pin) are available.',
      sortOrder: 15,
    },
    {
      attributeId: 'icc_active_ma',
      attributeName: 'Active Supply Current (mA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement must not draw more current than the original. For OCXOs, the oven heater draws 100–400 mW during warm-up and 30–100 mW steady state — verify the power budget can accommodate this. Escalated to primary for battery-powered applications (Q3).',
      sortOrder: 16,
    },
    {
      attributeId: 'icc_standby_ua',
      attributeName: 'Standby Current (µA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Current in OE-disabled / standby state. Distinguish tri-state (output high-Z, internal oscillator running, fast restart) vs full-shutdown (oscillator stopped, slow restart requiring full startup time). Escalated for battery applications (Q3).',
      sortOrder: 17,
    },
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Must fully cover the application temperature range. Industrial: −40°C to +85°C. Automotive: −40°C to +125°C. TCXO stability specifications are defined over this range — using a −20°C to +70°C rated TCXO in a −40°C application means unspecified stability at temperature extremes.',
      sortOrder: 18,
    },

    // ============================================================
    // IDENTITY FLAG — AEC-Q100
    // ============================================================
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'Automotive qualification. Escalated to mandatory + blockOnMissing for automotive applications (Q4). For MEMS oscillators in automotive: verify AEC-Q100 grade includes vibration characterization — not all AEC-Q100 MEMS oscillators are characterized for automotive vibration profiles.',
      sortOrder: 19,
    },

    // ============================================================
    // APPLICATION REVIEW — Package, Crystal Load Cap
    // ============================================================
    {
      attributeId: 'package_case',
      attributeName: 'Package / Case',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Oscillator package encodes the PCB footprint: 3225 = 3.2×2.5mm, 5032 = 5.0×3.2mm, 7050 = 7.0×5.0mm, 2016 = 2.0×1.6mm, 2520 = 2.5×2.0mm. BLOCK substitutions with a different package size — footprints are not compatible. Within the same package size: pad 1 function varies by vendor (may be /OE, NC, or VCC) — always verify pad assignment against the PCB layout, not just package size.',
      sortOrder: 20,
    },
    {
      attributeId: 'crystal_load_cap_pf',
      attributeName: 'Crystal Load Capacitance (pF)',
      logicType: 'application_review',
      weight: 3,
      engineeringReason: 'Relevant only for discrete crystal circuits (not packaged oscillators). When an oscillator module replaces a discrete crystal + oscillator circuit, the crystal load capacitance matching becomes an internal specification of the packaged oscillator. Not applicable for packaged oscillator substitutions.',
      sortOrder: 21,
    },

    // ============================================================
    // OPERATIONAL — Packaging Format
    // ============================================================
    {
      attributeId: 'packaging_format',
      attributeName: 'Packaging Format',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Tape-and-reel, cut tape, tray, or bulk. Affects automated assembly compatibility but not electrical performance.',
      sortOrder: 22,
    },
  ],
};
