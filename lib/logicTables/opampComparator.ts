import { LogicTable } from '../types';

/**
 * Op-Amps / Comparators / Instrumentation Amplifiers
 * Block C: Power Management & Analog ICs — Family C4
 *
 * Derived from: docs/c4_opamp_comparator_logic.docx
 * 24 attributes with specific matching rules for cross-reference validation.
 *
 * Single family covering three sub-types (like B8 Thyristors covering
 * SCR/TRIAC/DIAC). Context question Q1 determines the device function
 * and suppresses irrelevant rules per sub-type via not_applicable effects.
 *
 * Key substitution pitfalls:
 *
 * - Device type is the NON-NEGOTIABLE first gate. Op-amps operate in
 *   closed-loop negative feedback with internal phase compensation.
 *   Comparators operate open-loop with fast output transitions.
 *   A comparator substituting into a feedback loop has NO phase margin
 *   compensation and WILL oscillate — this is a safety-level block.
 *
 * - Decompensated op-amps are BLOCKED in unity-gain circuits. If the
 *   replacement's minimum stable gain exceeds the circuit's closed-loop
 *   gain, the device will oscillate with full-power output swings.
 *   Context Q4 escalates min_stable_gain to BLOCKING for unity-gain.
 *
 * - Input stage technology (bipolar/JFET/CMOS) must match source
 *   impedance profile. Three-check validation for cross-technology
 *   substitution: (a) Ib × Rs offset within budget, (b) total noise
 *   sqrt(en² + (in×Rs)²) equal or lower, (c) Rs > 100kΩ → bipolar
 *   BLOCKED. The identity_upgrade hierarchy enforces the impedance
 *   compatibility direction (CMOS > JFET > Bipolar).
 *
 * - Comparator output type mismatch requires circuit modification.
 *   Open-drain replacing push-pull: pull-up resistor must be added.
 *   Push-pull replacing open-drain: existing pull-up creates short-to-
 *   supply and must be removed. Never silently approve this change.
 *
 * - Phase reversal from input common-mode violation is BLOCKING.
 *   If replacement VICM range doesn't fully contain the circuit's
 *   operating common-mode voltage, positive feedback causes latching.
 *   This is a functional failure, not degraded performance.
 *
 * - RRI and RRO are independent attributes. "Rail-to-rail" in a part
 *   description defaults to output only. If the circuit requires RRI,
 *   the replacement must explicitly specify RRI support.
 *
 * - For precision applications (Vos < 500µV or gain > 100), Avol
 *   becomes primary. Closed-loop gain error ≈ 100% / (Avol × β).
 *
 * - AEC-Q100 is a hard gate for automotive. A higher grade number
 *   (lower temp rating) cannot substitute for a lower grade number
 *   (Grade 0 = -40/+150°C, Grade 1 = -40/+125°C, etc.).
 *
 * Covers: General-purpose op-amps, precision op-amps, zero-drift,
 * rail-to-rail, low-noise, low-power, high-speed, comparators (single,
 * dual, quad, window), instrumentation amplifiers.
 */
export const opampComparatorLogicTable: LogicTable = {
  familyId: 'C4',
  familyName: 'Op-Amps / Comparators / Instrumentation Amplifiers',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for op-amp, comparator, and instrumentation amplifier replacement validation — device type and VICM are BLOCKING gates, decompensated check enforced via context',
  rules: [
    // ============================================================
    // IDENTITY — Device Type, Configuration & Physical
    // ============================================================
    {
      attributeId: 'device_type',
      attributeName: 'Device Type (Op-Amp / Comparator / Instrumentation Amplifier)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate before all others. Op-amps operate in closed-loop negative feedback with internal frequency compensation (phase margin typically 45-60°). Comparators operate open-loop with fast output transitions and no internal compensation. A comparator in a feedback loop has zero phase margin — it will oscillate with full-power rail-to-rail output swings, potentially destroying downstream components and causing EMI. An op-amp used as a comparator has slow recovery from saturation (10-100× slower than a dedicated comparator) and may have phase-reversal latch-up. Instrumentation amplifiers have matched differential input stages and cannot be substituted with standard op-amps without redesigning the gain-setting network.',
      sortOrder: 1,
    },
    {
      attributeId: 'channels',
      attributeName: 'Number of Channels (Single / Dual / Quad)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — pin count and pinout change between single (5-8 pins), dual (8 pins), and quad (14 pins) packages. A dual op-amp has two independent amplifiers sharing VCC/VEE — the pinout is fundamentally different from a single. Quad packages (LM324, TL074) have 14 pins with different input/output assignments per channel. Substituting across channel counts requires PCB redesign.',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Must match exactly. Even within the same package family (e.g., SOIC-8), pinouts vary between manufacturers and device types. Pin 1 may be output (classic single op-amp), non-inverting input, or NC depending on the specific device. Thermal pad presence/absence changes the footprint. Always verify pin-for-pin compatibility from the replacement datasheet.',
      sortOrder: 3,
    },

    // ============================================================
    // INPUT STAGE
    // ============================================================
    {
      attributeId: 'input_type',
      attributeName: 'Input Stage Technology (CMOS / JFET / Bipolar)',
      logicType: 'identity_upgrade',
      upgradeHierarchy: ['CMOS', 'JFET', 'Bipolar'],
      weight: 9,
      engineeringReason: 'Input stage technology determines bias current, noise profile, and source impedance compatibility. Hierarchy from lowest Ib to highest: CMOS (fA-pA) → JFET (pA-nA) → Bipolar (nA-µA). CMOS can always replace JFET or Bipolar (lower Ib, higher input impedance). Bipolar replacing CMOS fails — Ib × Rs creates offset voltage that may exceed the system error budget. For any cross-technology substitution, verify: (a) Ib × Rsource offset within budget, (b) total input-referred noise sqrt(en² + (in×Rs)²) equal or lower, (c) if Rsource > 100kΩ, bipolar is BLOCKED (Context Q2 escalates to mandatory). CMOS inputs are ESD-sensitive and may require protection diodes.',
      sortOrder: 4,
    },
    {
      attributeId: 'output_type',
      attributeName: 'Output Type (Push-Pull / Open-Drain / Open-Collector)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Comparator output type determines interface circuit requirements. Open-drain replacing push-pull: an external pull-up resistor MUST be added — without it, the output cannot drive high, causing logic errors. Push-pull replacing open-drain: the existing pull-up resistor creates a short-to-supply path when the output drives high — this must be removed to prevent excessive current draw and potential damage. Wired-OR configurations (multiple open-drain outputs on a shared bus) are incompatible with push-pull outputs. Context Q1 makes this N/A for op-amps (which always have push-pull outputs).',
      sortOrder: 5,
    },

    // ============================================================
    // RAIL-TO-RAIL CAPABILITY
    // ============================================================
    {
      attributeId: 'rail_to_rail_input',
      attributeName: 'Rail-to-Rail Input (RRI)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'BLOCKING mismatch if source has RRI and replacement does not. Rail-to-rail input means the input common-mode range extends to both supply rails. In single-supply circuits where the input signal approaches ground or VCC, a non-RRI replacement will hit its VICM limit and either clip or — worse — exhibit phase reversal (input differential pair shuts off, output inverts). "Rail-to-rail" in a part description often defaults to OUTPUT only. Always explicitly verify the datasheet states RRI support. RRI is independent from RRO — validate both separately.',
      sortOrder: 6,
    },
    {
      attributeId: 'rail_to_rail_output',
      attributeName: 'Rail-to-Rail Output (RRO)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Independent from RRI — validate separately. If the original has RRO, the replacement must too. RRO devices use CMOS output stages that swing within 10-50mV of the rails under light loads. Non-RRO devices (bipolar output) typically saturate 0.5-2V from each rail, significantly reducing dynamic range in low-voltage single-supply designs (e.g., 3.3V supply loses 1-4V of output swing). At high output currents, even RRO devices degrade — verify output voltage swing at the actual load current from the datasheet.',
      sortOrder: 7,
    },

    // ============================================================
    // SUPPLY & COMMON-MODE
    // ============================================================
    {
      attributeId: 'supply_voltage',
      attributeName: 'Supply Voltage Range (Single/Dual)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 8,
      engineeringReason: 'Replacement supply voltage range must contain the circuit\'s actual supply. For single-supply operation: replacement Vsupply(max) ≥ original. For dual-supply (±V): verify both positive and negative rail limits. A device rated for 5V single-supply cannot operate at ±15V (30V total) — it will be destroyed instantly. Conversely, a device rated only for ±5V minimum may not start up on a 3.3V single supply.',
      sortOrder: 8,
    },
    {
      attributeId: 'vicm_range',
      attributeName: 'Input Common-Mode Voltage Range (VICM)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — phase reversal risk. If the replacement\'s VICM range does not fully contain the actual circuit common-mode voltage (including worst-case rail conditions), REJECT — do not flag as a warning. When the input common-mode voltage exceeds the device\'s VICM limit, the input differential pair shuts off. In many older bipolar designs (LM741, LM358), this causes phase reversal: the output inverts polarity, creating positive feedback in a negative-feedback loop. This causes the output to latch to a supply rail — a hard functional failure, not a degraded-performance scenario. Modern devices may specify "no phase reversal" but still clip or produce large offset errors outside their VICM range.',
      sortOrder: 9,
    },

    // ============================================================
    // DYNAMIC PERFORMANCE
    // ============================================================
    {
      attributeId: 'gain_bandwidth',
      attributeName: 'Gain Bandwidth Product (GBW)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Replacement GBW ≥ original. GBW determines the maximum usable frequency at a given closed-loop gain: f_max = GBW / Acl. A replacement with lower GBW reduces the circuit\'s bandwidth proportionally and may cause gain roll-off within the signal band, degrading THD in audio, reducing loop gain in control loops, and causing excessive phase shift that destabilizes feedback. For comparators, GBW is not applicable (Context Q1 suppresses). For instrumentation amplifiers, GBW is specified at a particular gain setting — verify at the circuit\'s actual gain.',
      sortOrder: 10,
    },
    {
      attributeId: 'slew_rate',
      attributeName: 'Slew Rate (V/µs)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement slew rate ≥ original. Slew rate limits the maximum output voltage rate of change: for a sine wave, SR_min = 2π × f × Vpeak. Insufficient slew rate causes slew-rate limiting (triangularization of sine waves), increasing THD and reducing power bandwidth. In pulse applications, slower slew rate increases rise/fall times, affecting timing margins. Note: slew rate is often asymmetric (rising vs. falling) — verify the slower edge meets requirements.',
      sortOrder: 11,
    },

    // ============================================================
    // DC PRECISION
    // ============================================================
    {
      attributeId: 'input_offset_voltage',
      attributeName: 'Input Offset Voltage Vos (Max)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement Vos ≤ original. Input offset voltage appears as a DC error at the output, amplified by the closed-loop gain: Vos_out = Vos × (1 + Rf/Rin). At gain=100 and Vos=5mV, the output error is 500mV — unacceptable in many precision applications. For precision circuits (Vos < 500µV or gain > 100), Context Q3 escalates to BLOCKING. Zero-drift (chopper/auto-zero) amplifiers achieve Vos < 10µV but introduce chopping artifacts at their clock frequency. Vos drift with temperature (TCVos, µV/°C) may be more important than initial offset for wide-temperature applications.',
      sortOrder: 12,
    },
    {
      attributeId: 'input_bias_current',
      attributeName: 'Input Bias Current Ib (Max)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement Ib ≤ original. Input bias current flowing through the source impedance creates an offset voltage: Voffset = Ib × Rs. For a 1µA bipolar input with 100kΩ source: 100mV offset — often exceeding the entire signal range. CMOS inputs: fA-pA range (negligible). JFET inputs: 1-200pA (low). Bipolar inputs: 10nA-10µA (significant at high Rs). Context Q2 (Rs > 100kΩ) escalates to BLOCKING because even moderate Ib creates unacceptable offset. Bias current also flows through feedback resistors — use bias current compensation resistor (Rb = Rf || Rin) at the non-inverting input if not already present.',
      sortOrder: 13,
    },
    {
      attributeId: 'input_noise_voltage',
      attributeName: 'Input Noise Voltage Density en (nV/√Hz)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement en ≤ original. Total input-referred noise = sqrt(en² + (in × Rs)²). At low source impedance (< 1kΩ), voltage noise (en) dominates — Context Q2 escalates for low-impedance sources. At high source impedance, current noise (in × Rs) dominates and bipolar inputs (with high in) become problematic. Low-noise bipolar op-amps (NE5532: en=5nV/√Hz) are excellent for low-impedance sources like microphones, while CMOS/JFET are better for high-impedance sensors. 1/f corner frequency also matters for DC/low-frequency precision — chopper-stabilized devices have no 1/f noise but add wideband switching artifacts.',
      sortOrder: 14,
    },
    {
      attributeId: 'avol',
      attributeName: 'Open-Loop Voltage Gain Avol (dB)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'Replacement Avol ≥ original. Closed-loop gain error ≈ 100% / (Avol_linear × β), where β = 1/(1 + Rf/Rin). At Avol = 100dB (100,000 V/V) and gain = 100: error = 0.1%. At Avol = 80dB (10,000 V/V) and gain = 100: error = 1% — unacceptable for precision applications. For precision applications (Context Q3), Avol is escalated to primary. Avol decreases with frequency (20dB/decade for single-pole compensation) and with output load — verify Avol at the actual operating frequency and load from the datasheet, not just the DC spec.',
      sortOrder: 15,
    },
    {
      attributeId: 'cmrr',
      attributeName: 'Common-Mode Rejection Ratio CMRR (dB)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'Replacement CMRR ≥ original. CMRR determines how well the device rejects signals common to both inputs. In instrumentation amplifier applications (bridge sensors, biomedical), CMRR of 100-120dB is critical for extracting small differential signals in the presence of large common-mode interference (60Hz mains, ground loops). CMRR degrades with frequency — at 1kHz, a device with 100dB DC CMRR may only have 60-70dB. Context Q1 escalates for instrumentation amplifiers; Context Q3 escalates for precision.',
      sortOrder: 16,
    },
    {
      attributeId: 'psrr',
      attributeName: 'Power Supply Rejection Ratio PSRR (dB)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'Replacement PSRR ≥ original. PSRR determines how much supply noise appears as output error. In mixed-signal circuits sharing a supply with digital logic, poor PSRR allows switching transients to appear in the analog signal path. PSRR degrades rapidly with frequency — a device with 100dB PSRR at DC may have only 40-50dB at 100kHz. For battery-powered circuits with switching regulators, PSRR at the switching frequency (typically 0.5-3MHz) is the critical specification.',
      sortOrder: 17,
    },

    // ============================================================
    // STABILITY
    // ============================================================
    {
      attributeId: 'min_stable_gain',
      attributeName: 'Minimum Stable Gain (V/V)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'CRITICAL — replacement minimum stable gain must be ≤ source. A fully compensated op-amp (min stable gain = 1 V/V) is stable at any gain including unity (voltage follower). A decompensated op-amp (e.g., min stable gain = 5 V/V) has higher GBW but WILL OSCILLATE at gains below its minimum stable gain — the additional open-loop gain crosses the noise gain curve before the compensation pole provides sufficient phase margin. If the circuit operates as a unity-gain buffer and the replacement is decompensated (min stable gain > 1), the replacement MUST be rejected — it will oscillate with full-power rail-to-rail output swings. Context Q1 makes N/A for comparators (always open-loop); Context Q4 (unity gain) escalates to BLOCKING.',
      sortOrder: 18,
    },

    // ============================================================
    // POWER & OUTPUT
    // ============================================================
    {
      attributeId: 'iq',
      attributeName: 'Quiescent Current per Channel (Iq)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Replacement Iq ≤ original. In battery-powered and energy-harvesting applications, quiescent current directly determines battery life. A quad op-amp (LM324) at 1.5mA total vs. a precision device at 5mA total can be the difference between 1-year and 4-month battery life. For always-on sensor front-ends, Iq is often the dominant current draw. However, very low Iq devices (< 10µA) typically have limited GBW and slew rate — verify that the replacement\'s dynamic performance still meets requirements.',
      sortOrder: 19,
    },
    {
      attributeId: 'response_time',
      attributeName: 'Response Time / Propagation Delay (Comparator)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement response time ≤ original. Comparator propagation delay is specified from input overdrive to output transition (typically at 10mV or 100mV overdrive). Faster comparators (5-20ns) are needed for high-frequency PWM, ADC flash stages, and zero-crossing detection in power converters. Slower comparators (1-10µs) are acceptable for threshold detection and window comparators. Response time varies significantly with overdrive — verify at the circuit\'s actual overdrive voltage, not just the headline spec. Context Q1 makes this N/A for op-amps (use GBW/slew rate instead).',
      sortOrder: 20,
    },
    {
      attributeId: 'output_current',
      attributeName: 'Output Current Drive (Short-Circuit)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Replacement output current ≥ original. Output current determines the minimum load impedance the device can drive while maintaining output voltage swing. Low-power op-amps may only source/sink 1-5mA, insufficient to drive 600Ω headphone loads or long cable runs. Rail-to-rail output swing specification is typically guaranteed only at a specific load current — verify that the replacement\'s output swing at the actual load current meets the circuit\'s dynamic range requirements.',
      sortOrder: 21,
    },

    // ============================================================
    // THERMAL & ENVIRONMENTAL
    // ============================================================
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Replacement temperature range must contain the original\'s range. Standard commercial: 0°C to +70°C. Industrial: -40°C to +85°C. Extended/Military: -55°C to +125°C. Automotive (AEC-Q100 Grade 1): -40°C to +125°C. All op-amp parameters degrade with temperature: Vos drifts (TCVos), Ib doubles per 10°C (bipolar), GBW decreases, noise increases. For automotive, Context Q5 escalates temperature range to primary.',
      sortOrder: 22,
    },

    // ============================================================
    // QUALIFICATION & PRODUCTION
    // ============================================================
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'AEC-Q100 mandatory if original is qualified — non-qualified parts are BLOCKED regardless of electrical match. AEC-Q100 grades define temperature range: Grade 0 (-40/+150°C), Grade 1 (-40/+125°C), Grade 2 (-40/+105°C), Grade 3 (-40/+85°C). A higher grade number (lower temp rating) CANNOT substitute for a lower grade number — Grade 2 cannot replace Grade 1. Automotive-grade parts undergo additional stress testing (HTOL, THB, ESD, latch-up) beyond commercial qualification. Context Q5 escalates to mandatory.',
      sortOrder: 23,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Tray)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Must match production line requirements. SOIC-8 dual op-amps typically on 12mm tape/reel (2,500 pieces). SOT-23-5 single op-amps on 8mm tape/reel (3,000 pieces). TSSOP-14 quad op-amps on 12mm tape/reel. DIP packages in tubes (25-50 pieces per tube). Verify orientation in tape pocket matches pick-and-place programming.',
      sortOrder: 24,
    },
  ],
};
