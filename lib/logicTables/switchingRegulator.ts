import { LogicTable } from '../types';

/**
 * Switching Regulators (DC-DC Converters & Controllers)
 * Block C: Power Management ICs — Family C2
 *
 * Derived from: docs/switching_reg_logic_c2.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * The most complex IC family to substitute. Switching regulators are control
 * systems — stability depends on the combination of IC, passive components,
 * layout, and operating conditions. Key substitution pitfalls:
 *
 * - Topology is the NON-NEGOTIABLE first gate — buck, boost, buck-boost,
 *   flyback, forward, and SEPIC are not interchangeable. All other attributes
 *   (inductor, duty cycle, feedback polarity) depend on topology.
 *
 * - Architecture (integrated-switch vs controller-only) defines whether
 *   external MOSFETs exist on the PCB. Not interchangeable — floating gate
 *   driver outputs or missing power path.
 *
 * - Control mode determines the compensation network. Peak current mode needs
 *   Type-II; voltage mode needs Type-III. A mismatch with existing compensation
 *   causes instability. When compensation can be redesigned, this is flagged
 *   for engineering review rather than auto-rejected (context Q2).
 *
 * - Vref mismatch silently changes the output voltage: Vout = Vref × (1 + Rtop/Rbot).
 *   The vref_check evaluator automatically computes achievability with existing
 *   feedback resistors and flags deviations > ±2% with corrected Rbot values.
 *
 * - Switching frequency tolerance ±10%: within this band, existing passives
 *   are generally acceptable but should be verified. Beyond ±10%, inductor
 *   saturation and capacitor ripple change significantly.
 *
 * Related families: LDOs (C1) — share power management context; Gate Drivers (C3);
 * MOSFETs (B5) — external switch for controller-only; Power Inductors (71).
 *
 * Covers: Buck (step-down), Boost (step-up), Buck-Boost, SEPIC, Flyback,
 * Forward, Inverting, Resonant — both integrated-switch and controller-only.
 */
export const switchingRegulatorLogicTable: LogicTable = {
  familyId: 'C2',
  familyName: 'Switching Regulators (DC-DC Converters & Controllers)',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for switching regulator replacement validation — topology and architecture are BLOCKING gates',
  rules: [
    // ============================================================
    // IDENTITY — Topology, Architecture & Physical
    // ============================================================
    {
      attributeId: 'topology',
      attributeName: 'Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate first. Topology determines the fundamental circuit structure: inductor configuration, switch count and placement, control method, and input-output voltage relationship. Buck (Vout < Vin) uses a series output inductor; Boost (Vout > Vin) uses a series input inductor; Flyback uses a transformer storing energy in the core. No substitution across topologies without complete circuit redesign. Mismatched topology will produce incorrect output voltage and potentially damage downstream components.',
      sortOrder: 1,
    },
    {
      attributeId: 'architecture',
      attributeName: 'Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — integrated-switch ICs include on-chip MOSFET(s). Controller-only ICs drive external MOSFETs via gate driver outputs. An integrated-switch replacement for a controller-only design has no external MOSFET connections (floating gate = latchup risk). A controller-only replacement for an integrated design leaves the switch node unconnected. Half-bridge and full-bridge are used in resonant converters and motor drives — distinct from single-switch topologies.',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Package must match PCB footprint exactly. Switching regulator ICs have more pins than LDOs — verify every pin: Vin, SW (or Vout), GND, Enable, COMP, FB, SS, Sync, PG, BST. Pin ordering for feedback, compensation, and enable is NOT standardized across manufacturers in the same package. The SW pin carries high-frequency current and is the primary EMI source — its PCB connection must be as short as possible, making exact footprint matching critical. Exposed thermal pads are electrically connected to GND or SW.',
      sortOrder: 3,
    },
    {
      attributeId: 'control_mode',
      attributeName: 'Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current)',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Different control modes require fundamentally different compensation networks. Peak current mode (PCM) uses an inner current loop — Type I/II compensation. Voltage mode (VM) requires Type III (two-zero) compensation. Hysteretic/COT has no compensation but requires specific output cap ESR. Average current mode is used in LED drivers and PFC stages. Substituting different control modes with existing compensation = unstable or oscillating loop. Context Q2 softens to application_review when compensation can be redesigned.',
      sortOrder: 4,
    },
    {
      attributeId: 'output_polarity',
      attributeName: 'Output Polarity (Positive / Negative / Isolated)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Positive, negative (inverting), and isolated converters have completely different feedback, reference, and compensation configurations. Positive-output regulators reference to ground. Negative-output inverting converters have inverted feedback/error amplifier connections. Isolated converters (flyback/forward) use optocoupler or secondary-side feedback through transformer-coupled signal. Not interchangeable.',
      sortOrder: 5,
    },

    // ============================================================
    // VOLTAGE & CURRENT RATINGS
    // ============================================================
    {
      attributeId: 'vin_min',
      attributeName: 'Minimum Input Voltage (Vin Min)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement Vin(min) ≤ original. Determines the minimum input voltage at which the regulator maintains regulation. In battery applications, a higher Vin(min) reduces usable battery capacity. For EN/UVLO threshold: if the PCB has a resistor divider on EN/UVLO, it is sized for the original IC\'s threshold — a replacement with a different threshold turns on at a different input voltage.',
      sortOrder: 6,
    },
    {
      attributeId: 'vin_max',
      attributeName: 'Maximum Input Voltage (Vin Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Replacement Vin(max) ≥ original. Must cover maximum expected input voltage including startup transients, load-dump (automotive: 40V on 12V systems), and unloaded supply overshoot. Exceeding Vin(max) destroys internal bootstrap circuits, gate drive supply, and control logic — even in controller-only designs where the power path is handled by external FETs.',
      sortOrder: 7,
    },
    {
      attributeId: 'vout_range',
      attributeName: 'Output Voltage Range (Min–Max Achievable)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 8,
      engineeringReason: 'Replacement Vout range must include the target output voltage. Determined by: feedback reference voltage (Vref), resistor divider range, and duty cycle limits. In a buck, minimum on-time limits how low Vout can go relative to Vin. In a boost, maximum duty cycle limits how high Vout can go. A replacement whose Vout range excludes the target is non-functional regardless of other attributes.',
      sortOrder: 8,
    },
    {
      attributeId: 'iout_max',
      attributeName: 'Maximum Output Current / Switch Current Limit',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Replacement Iout(max) ≥ original. For integrated-switch converters: limited by on-chip MOSFET current rating and built-in overcurrent threshold. A lower current limit starves the load during startup or transients. For controller-only: the IC\'s current sense threshold (Vcs) must be compatible with the existing sensing resistor — a different Vcs changes the current limit: Ilim = Vcs(threshold) / Rsense.',
      sortOrder: 9,
    },

    // ============================================================
    // SWITCHING PARAMETERS
    // ============================================================
    {
      attributeId: 'fsw',
      attributeName: 'Switching Frequency (fsw)',
      logicType: 'identity',
      tolerancePercent: 10,
      weight: 8,
      engineeringReason: 'Switching frequency determines inductor and capacitor values. Within ±10%, existing passives are generally acceptable but should be verified. Beyond ±10%: inductor current ripple ΔIL ∝ 1/fsw — a 2× higher fsw halves ripple (may reduce efficiency from switching losses); a 2× lower fsw doubles ripple (may saturate inductor). EMI profile shifts, potentially moving harmonics into regulated bands. Context Q4 escalates to BLOCKING when passive components cannot be changed.',
      sortOrder: 10,
    },
    {
      attributeId: 'ton_min',
      attributeName: 'Minimum On-Time / Off-Time (ton_min, toff_min)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement ton_min ≤ original. Minimum on-time limits achievable duty cycle: at 1MHz buck with Vout=1V, Vin=12V, duty cycle = 8.3%, required ton = 83ns. If ton_min = 100ns, the converter cannot regulate — output collapses. Critical for high step-down ratios (12V→1V) and high switching frequencies. Context Q5 escalates to BLOCKING for high conversion ratios.',
      sortOrder: 11,
    },
    {
      attributeId: 'gate_drive_current',
      attributeName: 'Gate Drive Voltage / Current (Controller-Only)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'CONTROLLER-ONLY DESIGNS: Replacement gate drive current ≥ original. Peak gate source/sink current determines MOSFET switching speed: Isource/sink = Qg / transition_time. Lower gate drive current means slower transitions = higher switching losses (Psw ∝ Qg × Vbus × fsw) and potentially higher EMI. Gate drive voltage determines Vgs and therefore Rds(on) — insufficient drive = partial enhancement with much higher conduction loss. Context Q1 suppresses for integrated-switch designs.',
      sortOrder: 12,
    },

    // ============================================================
    // FEEDBACK & COMPENSATION
    // ============================================================
    {
      attributeId: 'vref',
      attributeName: 'Feedback Reference Voltage (Vref)',
      logicType: 'vref_check',
      weight: 9,
      engineeringReason: 'Vref determines output voltage: Vout = Vref × (1 + Rtop/Rbot). Common values: 0.6V (modern high-density), 0.8V, 1.0V, 1.25V (classic). A different Vref with unchanged feedback resistors silently changes output voltage. Example: 3.3V design with Vref=0.8V (ratio=3.125) — replacement with Vref=1.25V produces 5.16V, potentially destroying downstream logic. The vref_check evaluator automatically computes output voltage achievability and provides corrected Rbot values.',
      sortOrder: 13,
    },
    {
      attributeId: 'compensation_type',
      attributeName: 'Compensation Type (Internal / External Type-II / Type-III / No-Comp)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'If the original uses external compensation (COMP pin), the replacement must have a COMP pin. Internally compensated devices cannot accept external components — optimized for a specific output cap range. Externally compensated devices require specific RC/RCC network on COMP pin tuned to the IC\'s transconductance (gm). Mixing types: internal comp + orphaned compensation components, or external comp + no COMP pin = unstable loop.',
      sortOrder: 14,
    },
    {
      attributeId: 'soft_start',
      attributeName: 'Soft-Start (Internal Fixed / External Css / Absent)',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'If original uses an external soft-start capacitor (Css pin), replacement must also have a Css pin. Internal fixed soft-start duration must be compatible. Absent soft-start causes full-rate output ramp — potentially exceeding input inrush current limits, tripping upstream fuses, or causing voltage overshoot that damages downstream components. Critical for designs with large output capacitor banks.',
      sortOrder: 15,
    },

    // ============================================================
    // ENABLE & PROTECTION
    // ============================================================
    {
      attributeId: 'enable_uvlo',
      attributeName: 'Enable / UVLO Pin (Active High / Active Low / Threshold)',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'Enable polarity must match (active-high vs active-low). UVLO threshold must be compatible with the existing EN resistor divider. Many switching regulators combine EN + UVLO on one pin — the divider is sized for the original threshold. A different UVLO threshold changes turn-on/turn-off voltage: starting too early (Vin unstable) or too late (reduced usable input range). In battery systems, this directly affects usable energy.',
      sortOrder: 16,
    },
    {
      attributeId: 'ocp_mode',
      attributeName: 'Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current)',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'OCP mode determines system fault behavior. Hiccup: shuts off, retries periodically — preferred for auto-recovery. Foldback: reduces current and voltage together. Latch: shuts off permanently until EN reset — used in safety-critical applications. Constant current: maintains limit current while Vout falls — used in battery chargers and LED drivers. A hiccup replacement in a latch-designed system auto-restarts on faults the designer intended to require manual reset.',
      sortOrder: 17,
    },
    {
      attributeId: 'thermal_shutdown',
      attributeName: 'Thermal Shutdown Threshold',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Replacement thermal shutdown threshold ≥ original. Switching regulators dissipate both conduction losses (I²×Rds_on) and switching losses (∝ fsw) — more complex than LDO dissipation. Auto-restart vs latch behavior must match application fault handling. In QFN packages with exposed thermal pads, the thermal path to PCB copper is critical — poor soldering causes premature thermal shutdown even at moderate loads.',
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
      engineeringReason: 'Replacement Rθja ≤ original for SMD; Rθjc ≤ original for exposed thermal pad packages. Total IC dissipation = conduction + switching + quiescent power. For integrated-switch at >500kHz with Vin > 12V, dissipation can reach several watts in small QFN packages. Tj = Ta + Pd × Rθja — a higher Rθja replacement runs hotter, potentially thermally shutting down at loads the original handled.',
      sortOrder: 19,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature (Tj Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement Tj(max) ≥ original. Commercial: 125°C, automotive/industrial: 150°C. Automotive underhood: ambient up to 125°C — at Tj(max)=125°C and Ta=125°C, zero thermal margin for power dissipation. The design must derate to at least Tj(max)−40°C for meaningful operation.',
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
      engineeringReason: 'If original is AEC-Q100 qualified, replacement must be too. Automotive switching regulators must also handle load-dump transients (40V/400ms for 12V per ISO 7637) and be EMI characterized (CISPR 25). AEC-Q100 includes HTOL, temperature cycling, humidity testing, plus power management-specific stability tests for Vout, fsw, and UVLO drift. Context Q3 escalates to mandatory for automotive applications.',
      sortOrder: 21,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Tray)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Must match production line requirements. Exposed thermal pad packages (DFN/QFN) require specific stencil apertures (50-80% coverage) and reflow profile to prevent voiding. A replacement with different pad size or soldermask opening may require stencil revision.',
      sortOrder: 22,
    },
  ],
};
