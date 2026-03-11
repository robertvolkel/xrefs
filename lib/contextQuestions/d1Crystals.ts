import { FamilyContextConfig } from '../types';

/**
 * Crystals — Quartz Resonators (Family D1)
 * Block D: Frequency Control
 *
 * 3 context questions:
 * 1. Application / accuracy requirement — consumer / comms / precision / RTC
 *    Comms escalates frequency tolerance + stability to mandatory.
 *    Precision escalates aging + cut type to mandatory, ESR + TC curve to primary.
 *    RTC confirms Tuning Fork, escalates tolerance + stability + aging + ESR to primary.
 * 2. VCXO circuit — shunt capacitance C0 escalated to mandatory + blockOnMissing,
 *    TC curve to primary, ESR to primary
 * 3. Extended temp / automotive — ESR to mandatory (cold-start margin), AEC-Q200
 *    to mandatory + blockOnMissing, operating temp + stability to mandatory
 *
 * Context sensitivity: high
 * Load capacitance (CL) is ALWAYS mandatory (identity w9 blockOnMissing) regardless
 * of context — it's the #1 crystal substitution error and cannot be context-dependent.
 * Nominal frequency is always mandatory (identity w10 blockOnMissing).
 *
 * Note: Crystals use AEC-Q200 (passive component qualification), NOT AEC-Q100.
 */
export const d1CrystalsContext: FamilyContextConfig = {
  familyIds: ['D1'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Application / accuracy requirement
    {
      questionId: 'accuracy_requirement',
      questionText: 'What is the application / accuracy requirement for this crystal?',
      priority: 1,
      options: [
        {
          value: 'consumer',
          label: 'Consumer / general purpose',
          description: 'Standard clock applications with relaxed accuracy requirements — microcontroller clock, general-purpose timers, non-protocol-critical interfaces. Frequency tolerance ≤ 50 ppm is acceptable. Temperature stability ≤ 100 ppm is acceptable. Aging rate is informational (Application Review).',
          attributeEffects: [
            { attributeId: 'aging_ppm_per_year', effect: 'add_review_flag', note: 'Consumer / general purpose — aging rate is informational only. ±3–5 ppm/year is acceptable for non-precision applications.' },
            { attributeId: 'cut_type', effect: 'add_review_flag', note: 'Consumer — cut type is determined by frequency (32.768 kHz = Tuning Fork, >1 MHz = AT-cut) and not a precision concern.' },
          ],
        },
        {
          value: 'comms',
          label: 'Communications / protocol timing (USB, Bluetooth, Ethernet, UART)',
          description: 'Protocol-critical timing applications where frequency accuracy directly affects communication reliability. USB HS requires ±50 ppm total. Bluetooth requires ±20 ppm. GPS/TCXO applications need ±2.5 ppm. Frequency tolerance and stability become mandatory — protocol frames will fail if total frequency error exceeds the protocol budget.',
          attributeEffects: [
            { attributeId: 'frequency_tolerance_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Communications timing — frequency tolerance is protocol-budget-critical. USB HS: ±50 ppm total. Bluetooth: ±20 ppm. Substituting a ±50 ppm crystal where ±20 ppm is required will violate the protocol timing budget and cause intermittent link failures.' },
            { attributeId: 'frequency_stability_ppm', effect: 'escalate_to_mandatory', note: 'Communications timing — frequency stability over temperature is mandatory. Total error budget = initial tolerance + temperature stability + aging. If stability alone consumes the budget, link failures occur at temperature extremes.' },
            { attributeId: 'cut_type', effect: 'escalate_to_primary', note: 'Communications — cut type affects TC curve shape. AT-cut is standard for MHz-range protocol clocks. Verify TC curve compatibility if replacing in a temperature-compensated design.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_primary', note: 'Communications — aging contributes to long-term frequency error budget. For installed-base products with multi-year lifetimes, aging can push total error over protocol threshold.' },
          ],
        },
        {
          value: 'precision',
          label: 'Precision / instrumentation (measurement, calibration, reference clock)',
          description: 'High-accuracy applications where every ppm counts — frequency counters, test equipment, precision oscillator references, scientific instruments. Tolerance ≤ 10 ppm, stability ≤ 20 ppm required. Aging rate becomes a primary specification. Cut type and TC curve shape affect measurement accuracy at temperature extremes.',
          attributeEffects: [
            { attributeId: 'frequency_tolerance_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Precision application — frequency tolerance ≤ 10 ppm required. Missing tolerance data is unacceptable for precision instruments.' },
            { attributeId: 'frequency_stability_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Precision — frequency stability ≤ 20 ppm over operating range required. Missing stability data is unacceptable.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_mandatory', note: 'Precision — aging rate determines calibration interval. ±1 ppm/year allows annual calibration; ±5 ppm/year requires quarterly. For metrology instruments, aging is the dominant long-term error source.' },
            { attributeId: 'cut_type', effect: 'escalate_to_mandatory', note: 'BLOCKING: Precision — cut type determines TC curve shape. AT-cut and SC-cut have fundamentally different TC characteristics. System temperature compensation is calibrated to a specific curve shape.' },
            { attributeId: 'equivalent_series_resistance_ohm', effect: 'escalate_to_primary', note: 'Precision — ESR affects oscillator phase noise and startup reliability. Lower ESR improves phase noise performance in precision oscillator circuits.' },
            { attributeId: 'frequency_vs_temp_curve', effect: 'escalate_to_primary', note: 'Precision — TC curve inflection point and coefficients matter. Two crystals with same ±20 ppm spec may have different curve shapes, causing systematic measurement error at temperature extremes.' },
          ],
        },
        {
          value: 'rtc',
          label: 'RTC / watch (32.768 kHz timekeeping)',
          description: 'Real-time clock applications using 32.768 kHz (2^15 Hz) Tuning Fork crystals. RTC oscillators have very limited drive current (typically <1 µA) — high ESR causes startup failure at this drive level. Aging rate determines long-term timekeeping drift: ±3 ppm/year = ~95 seconds/year, over 10-year battery = >15 minutes cumulative.',
          attributeEffects: [
            { attributeId: 'cut_type', effect: 'escalate_to_primary', note: 'RTC — confirm Tuning Fork cut type. 32.768 kHz crystals are almost exclusively Tuning Fork (flexural mode). AT-cut at 32.768 kHz exists but is rare, expensive, and has different equivalent circuit parameters.' },
            { attributeId: 'frequency_tolerance_ppm', effect: 'escalate_to_primary', note: 'RTC — initial frequency accuracy directly affects timekeeping accuracy from first power-on. ±20 ppm = ~1.7 sec/day error.' },
            { attributeId: 'frequency_stability_ppm', effect: 'escalate_to_primary', note: 'RTC — temperature stability affects seasonal timekeeping drift. Tuning Fork crystals have narrower operating ranges than AT-cut — verify stability over the actual ambient range.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_primary', note: 'RTC — aging is the dominant long-term error for battery-backed RTCs. ±3 ppm/year = ~95 sec/year. Over a 10-year battery lifetime = >15 minutes cumulative error.' },
            { attributeId: 'equivalent_series_resistance_ohm', effect: 'escalate_to_primary', note: 'RTC — ESR is critical because RTC oscillator circuits have very limited drive current (typically <1 µA for low-power RTCs). High ESR crystals may fail to start in low-power RTC circuits, especially at cold temperatures.' },
          ],
        },
      ],
    },

    // Q2: VCXO circuit
    {
      questionId: 'vcxo_circuit',
      questionText: 'Is this crystal in a voltage-controlled (VCXO) oscillator circuit?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — VCXO circuit (voltage-controlled frequency pulling)',
          description: 'The crystal is used in a VCXO circuit where a varactor diode or voltage-controlled capacitor adjusts the oscillation frequency via a control voltage. Shunt capacitance (C0) directly determines the crystal\'s pullability range — the ppm range over which frequency can be varied. Replacement C0 must be within ±0.5 pF to maintain tuning range and loop gain. TC curve shape affects compensation accuracy.',
          attributeEffects: [
            { attributeId: 'shunt_capacitance_pf', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: VCXO circuit — shunt capacitance C0 directly controls pullability range. Replacement C0 must be within ±0.5 pF. C0 is rarely in distributor parametric data — must be read from datasheet equivalent circuit parameters. Missing C0 data is unacceptable for VCXO replacement.' },
            { attributeId: 'frequency_vs_temp_curve', effect: 'escalate_to_primary', note: 'VCXO — TC curve shape affects the compensation network\'s ability to correct frequency over temperature. Different curve inflection points cause the compensation to over- or under-correct at temperature extremes.' },
            { attributeId: 'equivalent_series_resistance_ohm', effect: 'escalate_to_primary', note: 'VCXO — ESR affects oscillator loop gain and phase noise. In VCXO circuits, ESR interacts with the varactor impedance and affects the effective pull range.' },
          ],
        },
        {
          value: 'no',
          label: 'No — standard fixed-frequency oscillator',
          description: 'Standard Pierce, Colpitts, or other fixed-frequency oscillator circuit. Shunt capacitance (C0) is evaluated at default weight — ±1 pF mismatch is typically acceptable.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Extended temperature / automotive
    {
      questionId: 'extended_temp_automotive',
      questionText: 'Is this an extended temperature or automotive application?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — extended temperature / automotive (−40°C or beyond)',
          description: 'Extended temperature or automotive applications where the crystal must operate reliably at −40°C or colder. ESR increases 30–50% from room temperature to −40°C, reducing oscillator startup margin. AEC-Q200 (passive component qualification) is required for automotive. Note: crystals use AEC-Q200, NOT AEC-Q100 (which is for active ICs). Tuning Fork 32.768 kHz candidates may exceed their standard 0°C to +70°C range — flag as Application Review.',
          attributeEffects: [
            { attributeId: 'operating_temp_range', effect: 'escalate_to_mandatory', note: 'Extended temp — operating temperature range must fully cover the application ambient. Frequency stability is guaranteed only within the stated range. Automotive: −40°C to +105°C or +125°C.' },
            { attributeId: 'equivalent_series_resistance_ohm', effect: 'escalate_to_mandatory', note: 'BLOCKING: Extended temp — ESR increases 30–50% from +25°C to −40°C. Cold-start margin (negative resistance / ESR) must remain ≥5× at −40°C. A crystal with 40 Ω ESR at +25°C may reach 55–65 Ω at −40°C. Intermittent cold-start failure is the most common crystal field failure mode.' },
            { attributeId: 'aec_q200', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q200 passive component qualification required. Non-AEC parts are blocked from automotive designs. Note: crystals use AEC-Q200 (passive standard), NOT AEC-Q100 (active IC standard).' },
            { attributeId: 'frequency_stability_ppm', effect: 'escalate_to_mandatory', note: 'Extended temp — frequency stability must be guaranteed over the full extended temperature range (−40°C to +85°C or +125°C). Standard stability specs may only cover 0°C to +70°C.' },
          ],
        },
        {
          value: 'no',
          label: 'No — commercial temperature (0°C to +70°C)',
          description: 'Standard commercial temperature range. Default weights apply for all temperature-related attributes.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
