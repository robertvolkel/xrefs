import { LogicTable } from '../types';

/**
 * Linear Voltage Regulators (LDOs)
 * Block C: Power Management ICs — Family C1
 *
 * Derived from: docs/ldo_logic_c1.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * First family in Block C. The most parametric and substitution-friendly of all
 * IC families. Key substitution pitfalls:
 * - Output capacitor ESR compatibility is the #1 failure mode — an ESR-stabilized
 *   LDO will oscillate with ceramic output caps. This is a BLOCKING Identity check
 *   when the PCB uses ceramic capacitors (escalated via context Q1).
 * - Output voltage is a hard Identity match for fixed devices — no tolerance
 *   beyond the specified accuracy band. Even 1% mismatch can violate downstream
 *   rail tolerance budgets (DDR ±5%, FPGA core ±3%).
 * - Enable pin polarity must match exactly — active-high and active-low are not
 *   interchangeable. SOT-23-5 pin ordering varies across manufacturers.
 * - PSRR is frequency-dependent — always verify at the upstream switching
 *   frequency, not the DC headline number. Implemented as application_review
 *   since parametric data rarely includes frequency-specific PSRR.
 * - Iq weight is context-dependent — escalated to primary for battery/energy-
 *   harvest applications where Iq dominates sleep-mode current draw.
 *
 * Related families: Switching Regulators (C2) — share power management context;
 * Zener Diodes (B3) — share voltage reference concepts; MLCCs / Aluminum
 * Electrolytics — output capacitor stability is the critical interface between
 * LDO and passive families.
 *
 * Fundamental trade-off: Dropout voltage × Load current = Power dissipation.
 * Lower dropout → higher efficiency and extended battery life, but requires
 * tighter input voltage margin. Ultra-low Iq devices sacrifice transient
 * response speed and PSRR bandwidth.
 */
export const ldoLogicTable: LogicTable = {
  familyId: 'C1',
  familyName: 'Linear Voltage Regulators (LDOs)',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for LDO replacement part validation',
  rules: [
    // ============================================================
    // IDENTITY — Output Type, Voltage & Physical
    // ============================================================
    {
      attributeId: 'output_type',
      attributeName: 'Output Type (Fixed / Adjustable / Tracking / Negative)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'First gate — Fixed-output LDOs cannot replace adjustable without circuit changes (feedback resistors must be added). Adjustable LDOs require external resistor divider and feedback pin compatibility. Negative-output LDOs are a completely separate device class with inverted control sense. Tracking regulators require specific sequencing compatibility not present in standard LDOs.',
      sortOrder: 1,
    },
    {
      attributeId: 'output_voltage',
      attributeName: 'Output Voltage Vout',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'For fixed-output LDOs: Vout must match exactly within the specified accuracy band — no tolerance allowed beyond that. Standard values (1.2V, 1.5V, 1.8V, 2.5V, 3.0V, 3.3V, 5.0V) are not interchangeable. Even a 1% mismatch can violate downstream rail tolerance budgets: DDR memory rails are typically ±5%, FPGA core rails may be ±3%. For adjustable LDOs: replacement adjustable range must include the target output voltage.',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Package must match PCB footprint exactly. In SOT-23-5 (the dominant LDO package for ≤500mA), pin ordering for Enable and Output varies between manufacturers — a TI LDO may have Enable on pin 5 while a Diodes Inc. equivalent has Enable on pin 3. Installing with swapped pins causes damage. DFN/QFN exposed thermal pad must also match for heat dissipation.',
      sortOrder: 3,
    },
    {
      attributeId: 'polarity',
      attributeName: 'Polarity (Positive / Negative)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Positive and negative LDOs are fundamentally different circuit topologies. Positive LDOs use P-channel or PNP pass elements to regulate a positive output referenced to ground. Negative LDOs use N-channel or NPN pass elements with inverted control sense for negative rails. No substitution is possible across polarity types — as hard a boundary as N-channel vs. P-channel MOSFETs.',
      sortOrder: 4,
    },

    // ============================================================
    // INPUT / OUTPUT VOLTAGE RANGE
    // ============================================================
    {
      attributeId: 'vin_max',
      attributeName: 'Maximum Input Voltage (Vin Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Replacement Vin(max) must cover the highest expected input voltage including startup transients, supply overshoot, and load-dump events (automotive: 40V on 12V systems). Exceeding Vin(max) causes gate oxide breakdown or junction breakdown of the pass element. A replacement with lower Vin(max) may survive normal operation but fail during startup or overvoltage events the original was designed to survive.',
      sortOrder: 5,
    },
    {
      attributeId: 'vin_min',
      attributeName: 'Minimum Input Voltage (Vin Min / Dropout)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement Vin(min) ≤ original. Vin(min) = Vout + Vdropout. If the supply drops below Vin(min), the LDO exits regulation. In battery-powered systems, a replacement with higher Vin(min) (higher dropout) drops out of regulation at a higher battery voltage, effectively wasting battery capacity. Also determines cold-start capability — higher Vin(min) means later regulation point during startup.',
      sortOrder: 6,
    },

    // ============================================================
    // KEY PERFORMANCE PARAMETERS
    // ============================================================
    {
      attributeId: 'iout_max',
      attributeName: 'Maximum Output Current (Iout Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Primary sizing parameter. Replacement Iout(max) ≥ original at worst-case operating temperature. Current rating derates with temperature — a 500mA device at 25°C may deliver only 350mA at 125°C in a poorly ventilated enclosure. Verify at operating Tj, not just 25°C. Also check current limit level — some circuits rely on the LDO current limit as downstream protection.',
      sortOrder: 7,
    },
    {
      attributeId: 'vdropout',
      attributeName: 'Dropout Voltage (Vdropout Max)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement Vdropout ≤ original at the same Iout and temperature. Dropout determines: (1) Minimum headroom — critical in low-margin supply chains. (2) Power dissipation — Pd = Iout × Vdropout. An LDO dropping 500mV at 1A dissipates 500mW; one at 200mV dissipates only 200mW. In thermally constrained designs, a higher-dropout replacement may overheat. (3) Battery life — lower dropout extends usable battery voltage range.',
      sortOrder: 8,
    },
    {
      attributeId: 'iq',
      attributeName: 'Quiescent Current (Iq / Ground Current)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Replacement Iq ≤ original. Iq flows from input to ground regardless of load current — pure waste in sleep states. Critical for battery-powered and always-on applications where the LDO is active during sleep mode. A 50µA vs 1µA difference can mean 6-month vs 10-year battery life in ultra-low-power IoT applications. For high-load always-on applications, Iq is negligible vs load current. Context Q2 escalates weight to 9 for battery/energy-harvest applications.',
      sortOrder: 9,
    },
    {
      attributeId: 'vout_accuracy',
      attributeName: 'Output Voltage Accuracy (Initial Tolerance)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement accuracy ≤ original (tighter tolerance always acceptable). Common specs: ±1% (general), ±0.5% (precision), ±0.2% (ultra-precision). Critical when feeding precision ADC/DAC references where supply error appears as gain error, or when downstream IC has tight Vcc window. Must be combined with load regulation and temperature coefficient for total error budget.',
      sortOrder: 10,
    },

    // ============================================================
    // STABILITY & TRANSIENT RESPONSE
    // ============================================================
    {
      attributeId: 'output_cap_compatibility',
      attributeName: 'Output Capacitor ESR Compatibility (Ceramic Stable)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'CRITICAL — the #1 LDO substitution failure mode. The output capacitor is part of the feedback compensation network. ESR-stabilized LDOs require 0.1–5Ω ESR (tantalum/electrolytic); they oscillate with low-ESR ceramic capacitors. Ceramic-stable (internally compensated) LDOs work with any cap type. If the PCB uses ceramic output capacitors and the replacement is ESR-stabilized, it WILL oscillate. Context Q1 escalates to BLOCKING (w10 + blockOnMissing) when ceramic caps are confirmed on the PCB.',
      sortOrder: 11,
    },
    {
      attributeId: 'psrr',
      attributeName: 'PSRR (Power Supply Rejection Ratio)',
      logicType: 'application_review',
      weight: 6,
      engineeringReason: 'PSRR is frequency-dependent and always degrades at higher frequencies — a device with 70dB at DC may have only 30dB at 1MHz. When an LDO post-regulates a switching supply, PSRR at the switching frequency is what matters, not the DC headline number. Parametric data rarely includes frequency-specific PSRR curves, so this must be verified from datasheets by an engineer. Context Q3 (noise-sensitive analog) and Q5 (switching frequency) escalate weight.',
      sortOrder: 12,
    },
    {
      attributeId: 'load_regulation',
      attributeName: 'Load Regulation (ΔVout / ΔIout)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Replacement load regulation ≤ original. Defines how much Vout changes as load current varies from min to max. Poor load regulation causes output voltage sag under heavy load and rise under light load. Matters most for precision analog loads (ADC references) where load current varies with signal amplitude. Most modern LDOs have excellent load regulation (1–10mV) and this is rarely the binding spec.',
      sortOrder: 13,
    },
    {
      attributeId: 'line_regulation',
      attributeName: 'Line Regulation (ΔVout / ΔVin)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 4,
      engineeringReason: 'Replacement line regulation ≤ original. Defines output stability against slowly varying input voltage changes. Matters when input has wide DC variation (battery discharging from 4.2V to 3.0V) or unregulated wall adapter. Rarely the binding specification for modern LDOs with high open-loop gain (1–5mV/V typical). More important in precision references and measurement circuits.',
      sortOrder: 14,
    },

    // ============================================================
    // PROTECTION FEATURES & AUXILIARY PINS
    // ============================================================
    {
      attributeId: 'enable_pin',
      attributeName: 'Enable Pin (Active High / Active Low / Absent)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Enable pin polarity and presence must match exactly. Active-high Enable (most common in modern LDOs) turns on with high logic signal. Active-low Enable (sometimes /EN or SHDN) turns off with high signal. Swapping polarity inverts behavior — the LDO may be permanently off or permanently on. If original has Enable and replacement does not, power sequencing and sleep-mode control are broken. Float behavior also matters: some default-on (internal pullup), others default-off.',
      sortOrder: 15,
    },
    {
      attributeId: 'power_good',
      attributeName: 'Power-Good / Flag Pin',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'If original has a Power-Good output, replacement must too. PG is used for power sequencing (MCU reset release), rail sequencing (Rail A PG enables Rail B), and fault monitoring. Its absence disrupts all three functions. The PCB pull-up resistor for PG open-drain output is present on the board — an LDO without PG leaves this resistor floating, potentially conflicting with sequencing logic. PG assertion threshold (90-95% of Vout) should also be compatible.',
      sortOrder: 16,
    },
    {
      attributeId: 'soft_start',
      attributeName: 'Soft-Start',
      logicType: 'identity_flag',
      weight: 5,
      engineeringReason: 'If original has soft-start, replacement should too. Soft-start limits inrush current at power-up: without it, Iinrush = Cout × dVout/dt. For large output capacitors (hundreds of µF), this spike can trip upstream OCP/UVLO, cause voltage droops disturbing other circuits, or stress the pass element. Absence may be acceptable if output capacitance is small, but must be verified against upstream supply capability.',
      sortOrder: 17,
    },
    {
      attributeId: 'thermal_shutdown',
      attributeName: 'Thermal Shutdown',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'If original has thermal shutdown, replacement should too. Thermal shutdown disables the pass element when Tj exceeds threshold (typically 150–165°C), preventing thermal runaway during overload or short-circuit. Its absence increases fault risk — a sustained overload will destroy the pass element. Verify shutdown threshold temperature is compatible with the application thermal design.',
      sortOrder: 18,
    },

    // ============================================================
    // THERMAL
    // ============================================================
    {
      attributeId: 'rth_ja',
      attributeName: 'Thermal Resistance (Rθja / Rθjc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement Rθja ≤ original for SMD packages without heatsink; Rθjc ≤ original for TO-220/DPAK with heatsinks. Determines maximum ambient temperature at rated power. For a 5V→3.3V LDO at 500mA: Pd = 1.7V × 0.5A = 850mW. With Rθja = 250°C/W (SOT-23): Tj = 25 + 213 = 238°C — the device cannot operate at this power level without PCB copper heatsinking. A replacement with higher Rθja will be even worse.',
      sortOrder: 19,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature (Tj Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement Tj(max) ≥ original. Most commercial-grade LDOs: 125°C. Industrial: 150°C. Automotive (AEC-Q100): 150–175°C for underhood applications. A 125°C replacement in a 150°C design reduces thermal safety margin — may work at room temperature but fail during summer ambient or high-load duty cycles. Operating above Tj(max) causes reference drift, oxide degradation, and ultimate failure.',
      sortOrder: 20,
    },

    // ============================================================
    // QUALIFICATION & PRODUCTION
    // ============================================================
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'If original is AEC-Q100, replacement must be too. AEC-Q100 covers HTOL, temperature cycling, humidity testing, and IC-specific parametric stability. Automotive LDOs must handle load-dump transients (40V on 12V systems per ISO 7637). Qualification grade (0 through 3) determines Tj range — Grade 1 (−40 to +125°C Tj) cannot replace Grade 0 (−40 to +150°C Tj) without thermal margin review. Context Q4 escalates to mandatory for automotive applications.',
      sortOrder: 21,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Tray)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Must match production line requirements. SOT-23, DFN, QFN on tape/reel (8mm, 3000pcs typical). TO-252/DPAK on tape/reel or tubes. TO-220 in tubes (50pcs typical). Verify reel quantity and tape width match pick-and-place feeder specs.',
      sortOrder: 22,
    },
  ],
};
