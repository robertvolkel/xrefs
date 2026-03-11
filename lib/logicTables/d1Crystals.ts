import { LogicTable } from '../types';

/**
 * Crystals — Quartz Resonators
 * Block D: Frequency Control — Family D1
 *
 * Derived from: docs/d1_crystal_logic.docx
 * 18 attributes with specific matching rules for cross-reference validation.
 *
 * First family in Block D. Covers AT-cut quartz crystals (1–200 MHz fundamental,
 * up to overtone for higher frequencies), Tuning Fork crystals (32.768 kHz for RTC),
 * and SC-cut crystals (OCXO precision applications). Crystals are 2-pin passive
 * quartz resonators — NOT packaged oscillators (Family C8, 4-pin active with VCC).
 *
 * Key substitution pitfalls:
 *
 * - nominal_frequency_hz is the HARD GATE. 16.000 MHz ≠ 16.384 MHz. 32.768 kHz ≠
 *   32.000 kHz. Wrong frequency causes permanent system failure in all frequency-
 *   dependent applications (microcontroller clocks, UART baud rates, timer intervals).
 *   Parse from MPN with full Hz precision — 10.000 MHz is not the same as 10.0 MHz.
 *
 * - load_capacitance_pf is the SECOND HARD GATE and the #1 crystal substitution error.
 *   The crystal oscillates at nominal frequency ONLY when the circuit presents exactly
 *   CL picofarads. Standard values: 6, 8, 9, 10, 12, 18, 20 pF. Mismatch shifts
 *   frequency by ~30–100 ppm — permanent, temperature-independent, cannot be corrected
 *   in firmware. External load capacitors on the PCB are fixed values.
 *
 * - equivalent_series_resistance_ohm determines cold-start reliability. The oscillator
 *   circuit's negative resistance must exceed crystal ESR by ≥5×. ESR increases 30–50%
 *   from room temperature to −40°C. Failure mode: intermittent cold-start failure —
 *   works at room temperature, fails in cold field conditions.
 *
 * - overtone_order is a HARD GATE when the original is 3rd or 5th overtone. Overtone
 *   crystals in fundamental-mode circuits oscillate at the wrong (lower) frequency.
 *   A 100 MHz 5th-overtone crystal in a fundamental-mode circuit runs at ~20 MHz.
 *
 * - cut_type determines TC curve shape. AT-cut and Tuning Fork vibrate in completely
 *   different mechanical modes (thickness-shear vs flexural). 32.768 kHz = always
 *   Tuning Fork; >1 MHz = always AT-cut (or SC-cut for OCXO).
 *
 * - Ceramic resonators (CSTCE, CSTLS, CSTNR, AWSCR, ZTT prefixes) are NOT quartz
 *   crystals — ±0.5% tolerance (50–100× worse). Flag as Application Review.
 *
 * Related families: Timers and Oscillators (C8) — packaged oscillators integrate
 * crystal + oscillator circuit + VCC in one package; Crystals are the bare resonator.
 */
export const d1CrystalsLogicTable: LogicTable = {
  familyId: 'D1',
  familyName: 'Crystals — Quartz Resonators',
  category: 'Frequency Control',
  description: 'Hard logic filters for crystal replacement validation — nominal_frequency_hz and load_capacitance_pf are BLOCKING gates before any parametric evaluation',
  rules: [
    // ============================================================
    // IDENTITY — Nominal Frequency, Load Capacitance, Mounting Type
    // ============================================================
    {
      attributeId: 'nominal_frequency_hz',
      attributeName: 'Nominal Frequency (Hz)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate before all others. Nominal frequency must match exactly with full precision. 16.000 MHz ≠ 16.384 MHz — these are completely different products targeting different clock domains (16 MHz for standard MCU, 16.384 MHz for audio sampling). 32.768 kHz ≠ 32.000 kHz — the former is 2^15 Hz for RTC binary counter dividers, the latter does not divide cleanly to 1 Hz. Wrong frequency causes permanent system failure in all frequency-dependent applications: UART baud rate errors, SPI timing violations, USB packet framing failure, ADC sampling jitter. Resolve to Hz with full precision before comparing — 10.000 MHz catalog entry is 10,000,000 Hz.',
      sortOrder: 1,
    },
    {
      attributeId: 'load_capacitance_pf',
      attributeName: 'Load Capacitance (pF)',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — the #1 crystal substitution error. The crystal is manufactured to oscillate at its nominal frequency ONLY when the oscillator circuit presents exactly CL picofarads. Standard CL values: 6, 8, 9, 10, 12, 18, 20 pF. Substituting a 12 pF crystal where 18 pF is required shifts oscillation frequency by approximately +30 to +100 ppm — a permanent, temperature-independent offset that adds directly to the error budget and CANNOT be corrected in firmware. The external load capacitors on the PCB are fixed values set at design time and cannot be changed without hardware modification. The only exception is Application Review when the board has trimmer capacitors or varactors that can be adjusted — flag explicitly.',
      sortOrder: 5,
    },
    {
      attributeId: 'mounting_type',
      attributeName: 'Mounting Type',
      logicType: 'identity',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — SMD (surface mount, reflow soldering) and Through-Hole (wave or hand soldering) are fundamentally different PCB footprints and assembly processes. A through-hole crystal cannot substitute in a reflow-only SMD assembly line without process change. SMD pads cannot accept through-hole leads without drilling, and through-hole pads cannot reflow an SMD package.',
      sortOrder: 12,
    },

    // ============================================================
    // IDENTITY FLAGS — Cut Type, Overtone, Package, Pins, AEC-Q200
    // ============================================================
    {
      attributeId: 'cut_type',
      attributeName: 'Crystal Cut Type',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Cut type determines the temperature-frequency characteristic curve shape — not just the headline ppm/°C number. AT-cut (thickness-shear mode): inverted parabolic TC with inflection near 25°C, standard for 1–200 MHz. Tuning Fork (flexural mode): different TC curve shape, almost exclusively 32.768 kHz, high mechanical sensitivity. SC-cut (stress-compensated): for OCXO applications requiring best stability. AT-cut and Tuning Fork are not interchangeable even at adjacent frequencies because they vibrate in completely different mechanical modes and have different equivalent circuit parameters, different ESR ranges, and different TC curve shapes. In practice: 32.768 kHz = always Tuning Fork; >1 MHz = always AT-cut.',
      sortOrder: 2,
    },
    {
      attributeId: 'overtone_order',
      attributeName: 'Overtone Order',
      logicType: 'identity_flag',
      weight: 9,
      engineeringReason: 'HARD GATE when the original is overtone-mode. Overtone crystals (3rd or 5th) are designed to oscillate at 3× or 5× their fundamental frequency. The oscillator circuit must include a tuned LC circuit or bandpass filter to suppress fundamental-mode oscillation. Without this circuit — as in a standard microcontroller crystal oscillator or fundamental-mode Colpitts — an overtone crystal oscillates at its fundamental frequency instead. A 100 MHz 5th-overtone crystal in a fundamental-mode circuit runs at approximately 20 MHz, not 100 MHz. A 50 MHz 3rd-overtone crystal has fundamental ~16.7 MHz. Fundamental-mode AT-cut is practical to ~30–40 MHz; above that, overtone is required because crystals become too thin to manufacture reliably. BLOCK fundamental↔overtone cross-substitutions unconditionally.',
      sortOrder: 16,
    },
    {
      attributeId: 'package_type',
      attributeName: 'Package / Case',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'SMD packages are keyed by body size: 3225 (3.2×2.5 mm), 2016 (2.0×1.6 mm), 1612 (1.6×1.2 mm), 5032 (5.0×3.2 mm), 7050 (7.0×5.0 mm). BLOCK cross-size SMD substitutions — pad dimensions and spacing are different. Through-hole: HC-49/U (tall, 13.46 mm), HC-49/S (short, 3.5 mm), HC-49/US (ultra-short) — same lead spacing (4.88 mm standard), different heights. Within through-hole: flag height difference as Application Review for clearance verification.',
      sortOrder: 10,
    },
    {
      attributeId: 'package_pins',
      attributeName: 'Pin Count',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: '2-pad (standard crystal) vs 4-pad (crystal with additional ground/NC pads for stability). 2-pad footprint is subset of 4-pad — a 2-pad crystal can install in a 4-pad footprint with outer pads as NC (no concern). 4-pad crystal CANNOT install in a 2-pad footprint without floating pads. Most modern SMD crystals are 4-pad.',
      sortOrder: 11,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'AEC-Q200 passive component qualification for automotive. IMPORTANT: Crystals use AEC-Q200 (passive standard), NOT AEC-Q100 (for active ICs like packaged oscillators). Non-AEC parts are BLOCKED from automotive designs when context Q3 escalates this to mandatory. For automotive AT-cut: verify frequency stability covers −40°C to +125°C, not just −40°C to +85°C.',
      sortOrder: 15,
    },

    // ============================================================
    // THRESHOLD — Tolerance, Stability, ESR, Drive Level, C0, Aging, Temp Range
    // ============================================================
    {
      attributeId: 'frequency_tolerance_ppm',
      attributeName: 'Frequency Tolerance (ppm)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Initial frequency accuracy at +25°C in ppm. Replacement tolerance must be ≤ original. Standard grades: ±100 ppm (consumer), ±50 ppm (standard), ±20 ppm (precision), ±10 ppm (high precision). Tolerance stacks with temperature stability for total worst-case error budget. Substituting ±50 ppm where ±20 ppm was specified adds 30 ppm to worst-case — may violate protocol timing budget (USB HS requires ±50 ppm total including all sources). Escalated to mandatory for communications and precision applications (Q1).',
      sortOrder: 3,
    },
    {
      attributeId: 'frequency_stability_ppm',
      attributeName: 'Frequency Stability (ppm)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Maximum frequency deviation over the full operating temperature range in ppm. Replacement stability must be ≤ original. For AT-cut: ±10–±100 ppm over −40°C to +85°C. For Tuning Fork 32.768 kHz: ±20–±100 ppm over 0°C to +70°C. Substituting ±100 ppm where ±20 ppm was designed causes cumulative timing errors — ±80 ppm total drift at 85°C = ~2.5 seconds/day error in RTC applications. Escalated to mandatory for communications or precision (Q1).',
      sortOrder: 4,
    },
    {
      attributeId: 'equivalent_series_resistance_ohm',
      attributeName: 'ESR (Equivalent Series Resistance)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'ESR at resonance determines whether the oscillator will reliably start at cold temperatures. The oscillator circuit\'s negative resistance must exceed the crystal\'s ESR by at least 5×. ESR increases as temperature decreases — a crystal with 40 Ω ESR at +25°C may measure 55–65 Ω at −40°C. If the oscillator\'s negative resistance is 200 Ω: at +25°C margin is 5× (adequate); at −40°C margin drops to ~3× (below recommended). The failure mode is intermittent cold-start failure — the product works at room temperature but fails to start reliably in cold field conditions, and the failure is typically blamed on other causes before the crystal is identified. Replacement ESR must be ≤ original ESR. Typical: 32.768 kHz TF 35–70 kΩ; 10 MHz AT-cut 10–80 Ω. Escalated to mandatory for extended temperature/automotive (Q3).',
      sortOrder: 6,
    },
    {
      attributeId: 'drive_level_uw',
      attributeName: 'Maximum Drive Level (µW)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Maximum continuous power the crystal can absorb. Replacement drive level rating must be ≥ the original — a crystal that can handle more power is safer. If the circuit overdrove the original (common when engineers replace crystals without measuring actual drive level), the replacement must survive the same condition. Overdrive causes accelerated aging (frequency drift faster than specified) and eventual electrode fracture visible as frequency jumps — a slow-aging failure mode that may not appear during qualification testing. Standard: 32.768 kHz TF 0.5–1 µW; AT-cut SMD 50–200 µW; fundamental 10 MHz 100–500 µW. Flag as Application Review whenever drive level cannot be confirmed from datasheets.',
      sortOrder: 7,
    },
    {
      attributeId: 'shunt_capacitance_pf',
      attributeName: 'Shunt Capacitance (pF)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Parasitic parallel capacitance (C0) — part of the crystal equivalent circuit. Affects frequency pulling range and sensitivity to stray PCB capacitance. Higher C0 reduces pull range and increases sensitivity. For standard fixed-frequency oscillators: C0 mismatch within ±1 pF is typically acceptable — flag as Application Review. For VCXO replacement crystals: C0 directly determines the crystal\'s pullability range (the ppm range over which the oscillator frequency can be varied by control voltage). Replacement C0 must be within ±0.5 pF when Q2 = VCXO. Escalated to mandatory + blockOnMissing for VCXO circuits (Q2). C0 is rarely listed in distributor parametric tables — it must be read from the datasheet equivalent circuit parameters.',
      sortOrder: 8,
    },
    {
      attributeId: 'aging_ppm_per_year',
      attributeName: 'Aging Rate (ppm/year)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Rate of frequency drift over time caused by mass transfer on electrodes, stress relief in mounting, and package outgassing. Replacement aging rate must be ≤ original. Typical: AT-cut SMD ±1–5 ppm/year; high-quality AT-cut ±0.5–1 ppm/year; TF 32.768 kHz ±3–5 ppm/year. For RTC applications: ±3 ppm/year = ~95 seconds/year drift, over a 10-year battery lifetime = >15 minutes cumulative error. Escalated to primary/mandatory for precision or RTC (Q1).',
      sortOrder: 9,
    },
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Crystal operating temperature range must fully contain the application ambient range. Frequency stability is guaranteed only within the stated range — operating outside produces unspecified frequency deviation and may cause oscillation failure. Industrial: −40°C to +85°C. Automotive: −40°C to +105°C or +125°C. Consumer/commercial: 0°C to +70°C. Note: Tuning Fork 32.768 kHz crystals often have narrower ranges than AT-cut. Escalated to mandatory for extended temp/automotive (Q3).',
      sortOrder: 13,
    },

    // ============================================================
    // APPLICATION REVIEW — Storage Temp, TC Curve
    // ============================================================
    {
      attributeId: 'storage_temp_range',
      attributeName: 'Storage Temperature Range',
      logicType: 'application_review',
      weight: 3,
      engineeringReason: 'Temperature range during unpowered storage. Relevant for products shipped in extreme environments (military, aerospace). Rarely blocking for standard commercial/industrial products.',
      sortOrder: 14,
    },
    {
      attributeId: 'frequency_vs_temp_curve',
      attributeName: 'Frequency vs Temperature Curve',
      logicType: 'application_review',
      weight: 4,
      engineeringReason: 'For AT-cut: TC curve inflection temperature and coefficients determine exact frequency deviation at each temperature point. Two crystals with the same ±20 ppm headline spec may have different curve shapes — one peaking at 10°C, one at 40°C. For standard clock applications: curve shape is not critical. For TCXO replacement crystals: the compensation circuit is calibrated to a specific TC curve — different curve shape means the compensation network produces incorrect corrections at temperature extremes. Flag as Application Review when replacing a crystal in a TCXO circuit. Escalated to primary for VCXO circuits (Q2).',
      sortOrder: 17,
    },

    // ============================================================
    // OPERATIONAL — Qualification Level
    // ============================================================
    {
      attributeId: 'qualification_level',
      attributeName: 'Qualification Level',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Commercial / Industrial / MIL-SPEC / Space. Operational attribute — procurement filtering only. Does not affect electrical matching unless the application specifies a minimum qualification level.',
      sortOrder: 18,
    },
  ],
};
