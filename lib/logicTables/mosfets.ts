import { LogicTable } from '../types';

/**
 * MOSFETs — N-Channel & P-Channel
 * Block B: Discrete Semiconductors — Family B5
 *
 * Derived from: docs/mosfet_logic_b5.docx
 * 27 attributes with specific matching rules for cross-reference validation.
 *
 * Key differences from diode families (B1-B4):
 * - Channel Type (N vs P) is a hard Identity gate — determines circuit topology
 * - Technology (Si/SiC/GaN) is identity_flag — different semiconductor physics
 * - Rds(on) is the primary DC performance spec — must be compared at the SAME
 *   Vgs drive voltage. Comparing Rds(on) across different Vgs is invalid.
 * - Gate charge parameters (Qg, Qgd, Qgs) determine switching speed and driver
 *   requirements — comparisons valid at same Vds/Id conditions
 * - Body diode trr is BLOCKING in synchronous rectification at ≥50kHz — high trr
 *   causes shoot-through and catastrophic cross-conduction losses
 * - SOA (Safe Operating Area) is application_review — mandatory verification for
 *   linear-mode applications (hot-swap, eFuse, motor soft-start)
 * - Coss is application_review, not threshold — it's a resonant tank component
 *   in ZVS/LLC topologies and can't be reduced to a simple ≤ comparison
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification
 *
 * Related families: BJTs (B6), IGBTs (B7) — share gate-drive and SOA concepts;
 * Schottky Diodes (B2) — body diode considerations overlap.
 *
 * Fundamental trade-off: Rds(on) × Qg ≈ constant within a technology node.
 * Lower Rds(on) → higher Qg (larger die). Optimize for application:
 * - DC/low-frequency: minimize Rds(on), gate charge irrelevant
 * - High-frequency switching: minimize Qgd × Rds(on) product
 */
export const mosfetsLogicTable: LogicTable = {
  familyId: 'B5',
  familyName: 'MOSFETs — N-Channel & P-Channel',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for MOSFET replacement part validation',
  rules: [
    // ============================================================
    // IDENTITY — Channel, Technology & Physical
    // ============================================================
    {
      attributeId: 'channel_type',
      attributeName: 'Channel Type (N-Channel / P-Channel)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'First gate — N-channel and P-channel are fundamentally different circuit topologies. N-channel switches on with positive Vgs (low-side switching, synchronous rectification). P-channel switches on with negative Vgs (high-side switches, battery protection). Swapping channel type requires redesigning the gate drive circuit, circuit topology, and power rail routing — never a drop-in substitution.',
      sortOrder: 1,
    },
    {
      attributeId: 'technology',
      attributeName: 'Technology (Si / SiC / GaN)',
      logicType: 'identity_flag',
      weight: 9,
      engineeringReason: 'Si, SiC, and GaN are fundamentally different semiconductor materials with different gate drive requirements, switching characteristics, and thermal behavior. SiC dominates 650-1200V EV inverters; GaN dominates 100-650V high-frequency converters. Substituting Si into a SiC/GaN design fails at the expected switching frequency. Reverse (SiC/GaN for Si) requires engineering review for gate drive compatibility and Coss energy changes.',
      sortOrder: 2,
    },
    {
      attributeId: 'pin_configuration',
      attributeName: 'Pin Configuration (G-D-S Order, Tab Assignment)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'MOSFET pin ordering is not standardized. TO-220/TO-247: usually G-D-S but some manufacturers ship D-G-S. SOT-23: pin 1 usually gate but not always. DPAK/D2PAK: drain on tab but signal pin order varies. Installing with swapped gate and drain creates a short circuit on first power-up.',
      sortOrder: 3,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'MOSFET packages carry thermal and electrical significance. DPAK vs D2PAK: same topology but different pad sizes, via patterns, and thermal capability. QFN-style (PowerPAK, TSON) not interchangeable with leaded. Even within SO-8, some dual MOSFETs share drain while others do not. Thermal pad match is critical.',
      sortOrder: 4,
    },
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'AEC-Q101 covers HTOL, TC, thermal shock, humidity testing, plus MOSFET-specific tests: UIS (avalanche), gate oxide integrity, body diode stress. Automotive BOM approval requires supplier-level qualification — customer test data is not a substitute.',
      sortOrder: 5,
    },

    // ============================================================
    // VOLTAGE, CURRENT & POWER RATINGS
    // ============================================================
    {
      attributeId: 'vds_max',
      attributeName: 'Drain-Source Voltage (Vds Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'The most fundamental MOSFET rating. Must exceed maximum voltage the drain-source junction ever sees, including transient spikes. In boost converters the switch node rings above Vout; in motor drives inductive kickback spikes above bus voltage. Common derating: 75-80% of rated max. Note: significantly higher Vds is NOT free — higher-rated Si MOSFETs have worse Rds(on) and gate charge (silicon limit).',
      sortOrder: 6,
    },
    {
      attributeId: 'vgs_max',
      attributeName: 'Gate-Source Voltage (Vgs Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Maximum gate insulator voltage before oxide breakdown — a catastrophic, permanent failure. Standard MOSFETs: ±20V or ±30V. Logic-level: often ±12V or ±20V. Gate drive ringing transients in poorly damped layouts can momentarily exceed steady-state drive voltage. Replacement must be rated at or above original.',
      sortOrder: 7,
    },
    {
      attributeId: 'id_max',
      attributeName: 'Continuous Drain Current (Id Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'Maximum DC current at specified temperature. MOSFETs have positive Rds(on) temperature coefficient — as temperature rises, Rds(on) increases causing more self-heating. Datasheets specify Id at 25°C (optimistic) and 100°C (realistic). Compare at relevant operating temperature — a 30A/25°C part may sustain only 15A at 100°C.',
      sortOrder: 8,
    },
    {
      attributeId: 'id_pulse',
      attributeName: 'Peak Pulsed Drain Current (Id Pulse)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Covers short-duration current surges (motor startup, capacitor inrush, converter startup transients, short-circuit events). Peak currents can be 3-10x steady-state. Bond wire and metallization limits set this rating. Lower Id(pulse) risks bond-wire failure during transient events — failures that are easy to miss in functional testing.',
      sortOrder: 9,
    },
    {
      attributeId: 'pd',
      attributeName: 'Power Dissipation (Pd Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Secondary derived figure — represents package thermal capability at Tc=25°C with infinite heatsink. Real limits are determined by actual dissipation (Id² × Rds(on) + switching losses) and thermal path. Pd is a necessary minimum gate but should not be the primary thermal selection criterion.',
      sortOrder: 10,
    },
    {
      attributeId: 'avalanche_energy',
      attributeName: 'Avalanche Energy (Eas)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Energy the MOSFET absorbs when drain voltage exceeds Vds(max) and enters avalanche breakdown. Critical in unclamped inductive switching (UIS): buck converters without clamping, motor drives during fault conditions. Eas degrades at elevated temperature. Lower Eas means reduced fault tolerance — a field reliability concern.',
      sortOrder: 11,
    },

    // ============================================================
    // ON-STATE PERFORMANCE
    // ============================================================
    {
      attributeId: 'rds_on',
      attributeName: 'On-State Resistance (Rds(on))',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'THE most critical DC performance parameter. Conduction losses: Pcond = Id² × Rds(on). In low-frequency apps (ORing, load switches, battery protection), Rds(on) dominates total losses entirely. CRITICAL: Rds(on) is specified at a particular Vgs — typically 4.5V for logic-level, 10V for standard. A comparison is ONLY VALID if the drive voltage matches. Rds(on) rises ~2-2.5x from 25°C to 150°C. If drive voltages differ between source and candidate, this comparison is invalid — flag for engineering review.',
      sortOrder: 12,
    },
    {
      attributeId: 'vgs_th',
      attributeName: 'Gate Threshold Voltage (Vgs(th))',
      logicType: 'application_review',
      weight: 6,
      engineeringReason: 'Two failure modes: (1) Vgs(drive) < Vgs(th) max → MOSFET won\'t fully turn on → linear region → catastrophic overheating. (2) Vgs(th) min approaches noise floor → spurious turn-on → shoot-through in half-bridges. Logic-level MOSFETs (1-2V) are especially vulnerable. Must verify drive voltage fully saturates replacement AND that noise margin is adequate. Cannot be reduced to a simple threshold comparison.',
      sortOrder: 13,
    },

    // ============================================================
    // GATE CHARGE PARAMETERS
    // ============================================================
    {
      attributeId: 'qg',
      attributeName: 'Total Gate Charge (Qg)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Charge to fully switch the MOSFET. Determines: gate driver average current (Qg × fsw), peak gate driver current, and switching losses (Psw ≈ Qg × Vgs × fsw). Higher Qg either slows switching or overloads the driver. In shared-driver topologies, higher Qg causes driver output sag affecting all switches. Compare at same Vgs and Vds conditions.',
      sortOrder: 14,
    },
    {
      attributeId: 'qgd',
      attributeName: 'Gate-Drain Charge / Miller Charge (Qgd)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'THE dominant switching loss driver in hard-switching topologies. Qgd determines the Miller plateau width and dV/dt capability. Power losses: Psw ∝ Qgd × Vds × fsw. In soft-switching (ZVS), Qgd importance drops significantly. Flag for engineering review if Qgd exceeds original by >20%.',
      sortOrder: 15,
    },
    {
      attributeId: 'qgs',
      attributeName: 'Gate-Source Charge (Qgs)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Charge required to bring Vgs from zero to threshold plateau. Larger Qgs can cause the upper MOSFET in a half-bridge to conduct briefly when the lower switch turns off (dV/dt induced turn-on), creating shoot-through. Especially relevant in synchronous rectification designs.',
      sortOrder: 16,
    },

    // ============================================================
    // CAPACITANCE PARAMETERS
    // ============================================================
    {
      attributeId: 'ciss',
      attributeName: 'Input Capacitance (Ciss)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Ciss = Cgs + Cgd — the total gate input load. Determines gate drive speed and current: Ig(peak) ≈ Vgs / (Rg × 2.2τ). Ciss is not constant — specified at a particular Vds but varies with operating voltage. Gate charge figures (Qg, Qgd, Qgs) are more reliable for switching loss calculations.',
      sortOrder: 17,
    },
    {
      attributeId: 'coss',
      attributeName: 'Output Capacitance (Coss)',
      logicType: 'application_review',
      weight: 7,
      engineeringReason: 'Behavior depends entirely on switching topology. Hard-switching: Ecoss = ½ × Coss × Vds² per cycle (lower is better). Resonant/ZVS/LLC: Coss is part of the resonant tank — different Coss shifts resonant frequency and ZVS window, potentially causing hard-switching at the operating point. Coss is strongly nonlinear with Vds — use energy-equivalent Coss(er) for resonant calculations. Cannot be reduced to a simple threshold comparison.',
      sortOrder: 18,
    },
    {
      attributeId: 'crss',
      attributeName: 'Reverse Transfer Capacitance (Crss)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Drain-gate feedback capacitance (≡ Cgd). During fast switching, dV/dt injects current into gate: Ig = Crss × dVds/dt. Higher Crss causes spurious turn-on of complementary devices in bridge circuits and increases gate ringing and EMI. Especially problematic at high switching frequencies and fast edge rates.',
      sortOrder: 19,
    },

    // ============================================================
    // BODY DIODE CHARACTERISTICS
    // ============================================================
    {
      attributeId: 'body_diode_vf',
      attributeName: 'Body Diode Forward Voltage (Vf)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Intrinsic body diode conducts during dead time in synchronous rectifiers and freewheeling in bridge topologies. Body diode Vf is typically 0.7-1.2V (Si) or 2.5-3.5V (SiC — inherently higher due to wider bandgap). Dead-time loss: Pdead = Id × Vf × tdead × fsw. SiC MOSFETs often require anti-parallel SiC Schottky diodes to bypass high body diode Vf.',
      sortOrder: 20,
    },
    {
      attributeId: 'body_diode_trr',
      attributeName: 'Body Diode Reverse Recovery Time (trr)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'One of the most critical and underappreciated MOSFET specs. During body diode recovery, stored minority carriers create a momentary short circuit (shoot-through) when the complementary switch turns on. At ≥50kHz in synchronous rectification: excessive trr causes catastrophic cross-conduction, massive current spikes, and device destruction. SiC MOSFETs have essentially zero reverse recovery (majority carrier device). BLOCKING attribute in synchronous topologies at ≥50kHz — refuse substitution without explicit engineering sign-off.',
      sortOrder: 21,
    },

    // ============================================================
    // THERMAL RESISTANCE
    // ============================================================
    {
      attributeId: 'rth_jc',
      attributeName: 'Thermal Resistance Junction-to-Case (Rθjc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Primary thermal spec for heatsink-mounted devices. Determines heat transfer from die to case/pad. Total thermal path: Tj = Ta + Pd × (Rθjc + Rθcs + Rθsa). Higher Rθjc requires better heatsink or lower power dissipation. In parallel configurations, all devices must have similar Rθjc for equitable thermal load sharing.',
      sortOrder: 22,
    },
    {
      attributeId: 'rth_ja',
      attributeName: 'Thermal Resistance Junction-to-Ambient (Rθja)',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Total thermal resistance from die to ambient air — strongly sensitive to PCB design (copper area, layer count, airflow). A device on a 4-layer 2oz board has dramatically lower effective Rθja than on a 2-layer board. Most useful for SMD packages without heatsink (TSON, SOT-23). For heatsinkable packages (TO-220, TO-247), use Rθjc instead. Treat datasheet Rθja as a starting point, not a constant.',
      sortOrder: 23,
    },

    // ============================================================
    // RELIABILITY & SAFE OPERATING AREA
    // ============================================================
    {
      attributeId: 'soa',
      attributeName: 'Safe Operating Area (SOA) Curves',
      logicType: 'application_review',
      weight: 7,
      engineeringReason: 'SOA defines safe Vds × Id combinations parameterized by pulse width. In pure switching (fully on/off), SOA is rarely a concern. In linear mode (hot-swap controllers, eFuse, motor soft-start, USB current limiters), the MOSFET operates anywhere on the SOA boundary for tens of milliseconds — this is where SOA failures occur. Graphical comparison of SOA curves is mandatory for linear-mode designs. Cannot be reduced to a single number.',
      sortOrder: 24,
    },

    // ============================================================
    // MECHANICAL & PRODUCTION
    // ============================================================
    {
      attributeId: 'height',
      attributeName: 'Height / Profile',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Hard mechanical constraint when MOSFETs are mounted under heatsinks with limited standoff, in card-edge connectors, or in assemblies with fixed chassis clearance. TO-220 tab height is standard but body height varies. DPAK/D2PAK body height is tightly controlled. SMD power packages (PowerPAK, TSON) vary slightly between manufacturers.',
      sortOrder: 25,
    },
    {
      attributeId: 'mounting_style',
      attributeName: 'Mounting Style',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Surface mount vs. through-hole. Cannot interchange without PCB redesign. Power pad packages require matching PCB pads for thermal path. Within each mounting type, verify specific footprint compatibility.',
      sortOrder: 26,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Tray)',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Must match production line requirements. SMT automated assembly requires tape/reel. Through-hole (TO-220, TO-247) ships in tubes or trays. Reel quantity and width must match pick-and-place feeder specs. Mismatch halts production but does not affect electrical performance.',
      sortOrder: 27,
    },
  ],
};
