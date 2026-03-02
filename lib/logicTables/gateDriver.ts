import { LogicTable } from '../types';

/**
 * Gate Drivers — Single, Dual, Half-Bridge & Full-Bridge
 * Block C: Power Management ICs — Family C3
 *
 * Derived from: docs/gate_driver_logic_c3.docx
 * 20 attributes with specific matching rules for cross-reference validation.
 *
 * Gate drivers are the interface between logic-level control signals and
 * power semiconductor gates (MOSFETs, IGBTs, SiC MOSFETs, GaN HEMTs).
 * Key substitution pitfalls:
 *
 * - Driver configuration is the NON-NEGOTIABLE first gate. Single, Dual,
 *   Half-Bridge, and Full-Bridge are not interchangeable — PCB connections,
 *   bootstrap circuits, and control signal routing are configuration-specific.
 *
 * - Isolation type is BLOCKING for safety-rated equipment. Non-isolated
 *   bootstrap drivers cannot substitute for isolated types (transformer,
 *   optocoupler, digital isolator). Isolation voltage, creepage, and clearance
 *   are regulatory constraints.
 *
 * - Shoot-through is the most dangerous substitution failure in half-bridge
 *   drivers. Three checks must all pass: output polarity matches, dead-time ≥
 *   original, propagation delay ≤ original. Context Q1 (half-bridge) escalates
 *   all three to BLOCKING.
 *
 * - Output polarity inversion in a half-bridge causes simultaneous conduction
 *   of both switches — instant shoot-through and device destruction within
 *   microseconds. Identity_flag with context escalation to BLOCKING.
 *
 * - SiC/GaN applications requiring negative turn-off gate voltage (-5V for SiC,
 *   0V for GaN) need bipolar gate supply — standard unipolar drivers cannot
 *   substitute. Context Q2 flags for engineering review.
 *
 * - Peak drive current directly determines switching loss in the power stage.
 *   Source and sink currents are often asymmetric — both must be verified.
 *
 * Related families: MOSFETs (B5), IGBTs (B7) — gate drivers are the direct
 * interface to these power devices; Switching Regulators (C2) — controller-only
 * regulators use external gate drivers for the power stage.
 *
 * Covers: Single low-side, Dual independent, Half-bridge (bootstrap),
 * Full-bridge, Isolated (transformer, optocoupler, digital isolator).
 */
export const gateDriverLogicTable: LogicTable = {
  familyId: 'C3',
  familyName: 'Gate Drivers (MOSFET / IGBT / SiC / GaN)',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for gate driver replacement validation — driver configuration and isolation type are BLOCKING gates, shoot-through safety enforced for half-bridge via context',
  rules: [
    // ============================================================
    // IDENTITY — Configuration, Isolation & Physical
    // ============================================================
    {
      attributeId: 'driver_configuration',
      attributeName: 'Driver Configuration (Single / Dual / Half-Bridge / Full-Bridge)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate first. Single: buffers one gate. Dual: two independent gates. Half-bridge: complementary high-side + low-side with dead-time and bootstrap. Full-bridge: four switches. Not interchangeable — PCB connections, bootstrap circuits, and control signal routing are configuration-specific. Substituting a half-bridge for a dual leaves the bootstrap and dead-time circuitry without a partner switch — high-side output will not function.',
      sortOrder: 1,
    },
    {
      attributeId: 'isolation_type',
      attributeName: 'Isolation Type (Non-Isolated Bootstrap / Transformer / Optocoupler / Digital Isolator)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — galvanic isolation (transformer, optocoupler, digital isolator) cannot be replaced by non-isolated bootstrap types in safety-rated equipment. Isolation voltage and working voltage must meet the safety standard (IEC 62368, UL 508A, IEC 60950). Non-isolated bootstrap cannot sustain 100% duty cycle and provides no galvanic isolation. Modern digital isolators (Si84xx, ADUM) support up to 5MHz for SiC/GaN — much faster than optocouplers (~1-2MHz).',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Must match exactly. Half-bridge driver pin assignments (VS, VB, HO, LO, HIN, LIN, SD) vary significantly between IR2104/IR2110, UCC27714, IRS2453, LM5101, and other families even in the same SOIC-8 footprint. No universal standard exists for pin placement of VS, VB, or input signals. Swapping HIN and VB pins applies a control signal to the bootstrap supply — destroying the device at first power-up. Always verify pin-by-pin from the specific replacement datasheet.',
      sortOrder: 3,
    },
    {
      attributeId: 'input_logic_threshold',
      attributeName: 'Input Logic Threshold (VDD-referenced / 3.3V / 5V / Differential)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Must be compatible with the driving logic signal voltage. VDD-referenced CMOS inputs switch at ~VDD/2 — with VDD=12V the threshold is ~6V, above 5V logic level. A 3.3V GPIO driving such an input may not reliably switch the driver. Logic-level compatible inputs have fixed thresholds (VIH=2.0V for TTL, VIH=0.7×VDD for CMOS) that work with 3.3V and 5V regardless of gate driver VDD. Differential inputs (LVDS) require a differential signal source.',
      sortOrder: 4,
    },
    {
      attributeId: 'output_polarity',
      attributeName: 'Output Polarity (Non-Inverting / Inverting)',
      logicType: 'identity_flag',
      weight: 9,
      engineeringReason: 'Inverted polarity drives the power switch ON when the controller commands OFF. In a half-bridge, polarity inversion of either output causes simultaneous conduction — instant shoot-through and device destruction within microseconds. Context Q1 escalates to BLOCKING for half-bridge/full-bridge. Verify INH/INL to HO/LO relationship — some drivers use complementary inputs, others use same-polarity inputs with internal complementary logic.',
      sortOrder: 5,
    },

    // ============================================================
    // DRIVE CAPABILITY
    // ============================================================
    {
      attributeId: 'peak_source_current',
      attributeName: 'Peak Source Current (Ipeak+, Turn-On)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Replacement peak source current ≥ original. Peak current determines turn-on switching speed: t_sw ≈ Qg / Ipeak. For Qg=100nC: 2A driver = 50ns transition; 0.5A driver = 200ns. Lower current = higher switching energy loss (Esw ∝ transition time × Vbus × Iload), longer Vds/Id overlap risking SOA violation. Source and sink currents are often asymmetric — verify both independently.',
      sortOrder: 6,
    },
    {
      attributeId: 'peak_sink_current',
      attributeName: 'Peak Sink Current (Ipeak-, Turn-Off)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Replacement peak sink current ≥ original. Fast turn-off (high sink current) is typically more critical for safe operation in inductive load circuits. Insufficient sink current slows gate discharge, extending overlap of high Vds and Id through the active region. In half-bridge applications, slow turn-off directly consumes dead-time margin and increases shoot-through risk.',
      sortOrder: 7,
    },
    {
      attributeId: 'vdd_range',
      attributeName: 'Gate Drive Supply VDD Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 8,
      engineeringReason: 'Replacement VDD range must include the PCB\'s actual gate supply voltage. VDD determines Vgs applied to the power device — wrong VDD = wrong Rds(on) and conduction losses. Si MOSFETs: 10-15V standard. IGBTs: 15V, some SiC-optimized need 20V. SiC MOSFETs: +18-20V on / -5V off (bipolar supply required). GaN HEMTs: +5-6V / 0V off. Context Q2 escalates for SiC/GaN where tight Vgs window is critical.',
      sortOrder: 8,
    },
    {
      attributeId: 'propagation_delay',
      attributeName: 'Propagation Delay tpd (Input Edge to Output Edge)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement tpd ≤ original. In half-bridge designs with tight dead-time, additional propagation delay reduces effective dead-time — potentially to zero, causing shoot-through. This failure may only appear at temperature extremes where both device and driver are slower. Verify tpd_rise and tpd_fall independently — asymmetric delays cause duty cycle error. Context Q1 escalates for half-bridge. In precision timing (class D audio, resonant), added delay shifts phase.',
      sortOrder: 9,
    },
    {
      attributeId: 'rise_fall_time',
      attributeName: 'Rise / Fall Time tr/tf (Output Transition into Load Capacitance)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement tr/tf ≤ original at the same capacitive load. Slower output transitions increase switching losses: Esw ≈ ½ × Qgs × Vgs × (tr + tf) × fsw. If external gate resistors (Rg) are present, they may need to be reduced to compensate for a slower replacement driver. Specified at a particular test load capacitance (typically 1nF or 1.8nF) — compare at equivalent loads.',
      sortOrder: 10,
    },

    // ============================================================
    // PROTECTION & FEATURES
    // ============================================================
    {
      attributeId: 'dead_time_control',
      attributeName: 'Dead-Time Control (Internal Fixed / Adjustable Rdt / External / None)',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'Half-bridge drivers: replacement must have dead-time control if original did. Dead-time prevents shoot-through — absent dead-time with simultaneous HIN/LIN inputs instantly destroys both power switches. Fixed internal dead-time (e.g., 520ns in IR2104) is simple but inflexible. Adjustable dead-time (Rdt pin) allows optimization. Context Q1 escalates to BLOCKING for half-bridge.',
      sortOrder: 11,
    },
    {
      attributeId: 'dead_time',
      attributeName: 'Dead-Time Duration',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'For half-bridge applications, replacement dead-time must be ≥ original. Dead-time must exceed the power device\'s turn-off time including driver propagation delay. A replacement with shorter dead-time, combined with slow IGBTs or SiC devices with long turn-off tails, is a shoot-through risk that may not appear at room temperature but fails at high temperature where devices are slower. Context Q1 escalates for half-bridge.',
      sortOrder: 12,
    },
    {
      attributeId: 'uvlo',
      attributeName: 'Under-Voltage Lockout Threshold (UVLO)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement UVLO threshold ≤ original. UVLO prevents gate drive output when VDD is insufficient for full FET enhancement — preventing partial gate drive that would leave the device in its linear region (high Rds(on), thermal runaway). If replacement UVLO is higher, the converter won\'t start until VDD exceeds a higher voltage — potential startup failure if the gate supply is marginal or bootstrap charging depends on the driver starting quickly.',
      sortOrder: 13,
    },
    {
      attributeId: 'shutdown_enable',
      attributeName: 'Shutdown / Enable Pin (Active High / Active Low / Absent)',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'If original has SD/EN pin, replacement must have one with matching polarity. The SD pin typically connects to overcurrent detectors or system fault buses. Wrong polarity: driver permanently disabled or provides no fault protection. Float state is critical: if original defaulted to enabled (internal pullup) and replacement defaults to disabled, system will not start without an explicit enable signal.',
      sortOrder: 14,
    },
    {
      attributeId: 'bootstrap_diode',
      attributeName: 'Bootstrap Diode (Internal / External Required)',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'If original has integrated bootstrap diode, replacement must also have one OR an external bootstrap diode must be on the PCB. If original required external bootstrap diode, replacement must support this. Mismatch: original had internal, replacement needs external — no diode on PCB, bootstrap cap cannot charge, high-side gate never fires. In >200V bus designs, verify VB = VS + VDD rating (can reach 600V+ on 600V bus). Context Q1 escalates for half-bridge.',
      sortOrder: 15,
    },
    {
      attributeId: 'fault_reporting',
      attributeName: 'Fault Reporting / FAULT Pin (Present / Absent)',
      logicType: 'identity_flag',
      weight: 5,
      engineeringReason: 'If system uses the FAULT output for monitoring or protection interlocking, replacement must have a compatible FAULT pin. Absent FAULT output leaves the monitoring circuit floating, silently removing fault detection. In motor drives and multi-phase inverters, FAULT reporting is part of the protection architecture — its absence is a safety regression.',
      sortOrder: 16,
    },

    // ============================================================
    // THERMAL
    // ============================================================
    {
      attributeId: 'rth_ja',
      attributeName: 'Thermal Resistance Rθja (Junction-to-Ambient)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement Rθja ≤ original. Gate driver dissipation: Pd = QG(total) × VDD × fsw. At fsw=300kHz, VDD=15V, driving two IGBTs at QG=200nC each: Pd = 400nC × 15V × 300kHz = 1.8W. SOIC-8 with Rθja=120°C/W: Tj = 25 + 1.8×120 = 241°C — far above Tj(max). A replacement with higher Rθja runs hotter for the same load and frequency. Context Q5 escalates for >200kHz.',
      sortOrder: 17,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature (Tj Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement Tj(max) ≥ original. Standard: 125°C. Automotive (AEC-Q100 Grade 1): 150°C. SiC gate drivers for high-temperature applications: up to 175°C. Verify against computed Tj at maximum operating conditions: Tj = Ta + Pd × Rθja.',
      sortOrder: 18,
    },

    // ============================================================
    // QUALIFICATION & PRODUCTION
    // ============================================================
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'AEC-Q100 mandatory if original is qualified. Automotive gate drivers must handle load-dump, reverse polarity, and EMI (CISPR 25). ISO 26262 functional safety for ASIL-rated motor control may specify diagnostic features (FAULT pin, self-test) that must be preserved. Context Q3 escalates to mandatory.',
      sortOrder: 19,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Tray)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Must match production line requirements. SOT-23-5/6 single drivers on 8mm tape/reel. SOIC-8 half-bridge drivers on 12mm tape/reel, typically 2,500 pieces. DIP-8 (industrial controls) in 25-piece tubes. Isolated gate drivers in wide-body SOIC-16 on 16mm tape. Exposed thermal pad DFN/QFN require stencil aperture management.',
      sortOrder: 20,
    },
  ],
};
