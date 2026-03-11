import { LogicTable } from '../types';

/**
 * Optocouplers / Photocouplers
 * Block E: Optoelectronics — Family E1
 *
 * Derived from: docs/e1_optocoupler_logic.docx
 * 23 attributes with specific matching rules for cross-reference validation.
 *
 * Family E1 covers optocouplers (photocouplers) — single-LED-input, single-output
 * galvanic isolation devices. Three output types: phototransistor (most common,
 * PC817, 4N25), photodarlington (high CTR but slow, MCT2, H11D1), and logic-output
 * (fastest, HCPL/6N137 — CMOS/TTL-compatible push-pull or open-collector).
 *
 * Key substitution pitfalls:
 *
 * - output_transistor_type is the HARD GATE. Phototransistor / photodarlington /
 *   logic-output define fundamentally different gain ranges, bandwidths, and
 *   interface topologies. A phototransistor optocoupler (CTR-limited, typically
 *   <200 kHz) cannot replace a logic-output type (10 Mbps, requires VCC) in a
 *   digital isolation application. BLOCK cross-type substitutions unconditionally.
 *
 * - isolation_voltage_vrms is safety-critical. The AC test voltage at which the
 *   isolation barrier is verified. Replacement must be ≥ original — never downgrade.
 *   Reinforced isolation for mains-connected circuits requires ≥3750 Vrms (IEC 62368).
 *
 * - working_voltage_vrms is distinct from test voltage. The continuous rated voltage
 *   the barrier can sustain in normal operation. A part rated 5000 Vrms test may only
 *   be rated 630 Vrms working — using it at 800 Vrms continuous degrades the barrier.
 *
 * - load_capacitance mismatch: unlike crystals, optocouplers don't have CL. But CTR
 *   at a given If is the gain budget — wrong CTR causes linear-region or saturation
 *   failures. ctr_min_pct must be verified at the actual operating If.
 *
 * - creepage_distance_mm and clearance_distance_mm are independent safety parameters.
 *   Creepage (surface path) and clearance (air path) serve different insulation
 *   purposes — one cannot compensate for the other.
 *
 * - AEC-Q101 (discrete semiconductors) — NOT AEC-Q100 or AEC-Q200. Optocouplers
 *   contain active semiconductor die (LED + phototransistor).
 *
 * - Digital isolators (ADUM, Si84xx, Si86xx) are NOT optocouplers — they use
 *   magnetic or capacitive coupling, not optical. Flag as out of scope.
 *
 * Related families: Gate Drivers (C3) with isolated gate driver variants (HCPL-3120),
 * Interface ICs (C7) with digital isolators (ADUM, Si84xx — NOT E1).
 */
export const e1OptocouplerLogicTable: LogicTable = {
  familyId: 'E1',
  familyName: 'Optocouplers / Photocouplers',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for optocoupler replacement validation — output_transistor_type, channel_count, and package_type are BLOCKING identity gates; isolation_voltage_vrms is safety-critical threshold GTE',
  rules: [
    // ============================================================
    // SECTION 1: OUTPUT TYPE & CHANNEL — HARD GATES
    // ============================================================
    {
      attributeId: 'output_transistor_type',
      attributeName: 'Output Transistor Type',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate before all others. Phototransistor / Photodarlington / Logic-output (open-collector or push-pull) define fundamentally different gain ranges, bandwidths, and interface topologies. A phototransistor optocoupler (CTR-limited analog output, typically <200 kHz bandwidth) cannot replace a logic-output type (10 Mbps digital, requires VCC, no CTR specification — it has a fixed logic-level output). A photodarlington has 1000–5000% CTR but is limited to <50 kHz and has higher Vce(sat). Cross-type substitutions produce incorrect signal levels, bandwidth failures, or incompatible interfaces. BLOCK unconditionally.',
      sortOrder: 1,
    },
    {
      attributeId: 'channel_count',
      attributeName: 'Channel Count',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. Single / Dual / Quad. The PCB footprint uses a fixed pin count and channel arrangement. A single-channel DIP-4 optocoupler cannot substitute for a dual-channel DIP-8 — the pinout and footprint are completely different. Multi-channel parts also share an LED side common and/or output side common that may be wired differently. BLOCK cross-count substitutions unconditionally.',
      sortOrder: 4,
    },
    {
      attributeId: 'package_type',
      attributeName: 'Package Type',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. DIP-4 / DIP-6 / SOP-4 / SSOP-4 / Mini-flat / SMD — footprint incompatibility. DIP-4 is the most common (PC817, 4N25). DIP-6 adds base pin access (4N35). SOP-4 and SSOP-4 are surface-mount variants with different pad dimensions. DIP ↔ SOP ↔ SSOP are all physically incompatible. BLOCK cross-package substitutions.',
      sortOrder: 5,
    },

    // ============================================================
    // SECTION 2: ISOLATION — SAFETY-CRITICAL
    // ============================================================
    {
      attributeId: 'isolation_voltage_vrms',
      attributeName: 'Isolation Voltage (Vrms)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — safety-critical minimum. AC test isolation voltage at which the barrier integrity is verified per UL1577 or IEC 60747-5-5. Replacement must be ≥ original — never downgrade. A part rated 2500 Vrms cannot replace 5000 Vrms in a mains-connected reinforced isolation design. Functional isolation (signal-level): ≥500 Vrms. Basic (single fault): ≥1500 Vrms. Reinforced (mains, IEC 62368): ≥3750 Vrms. Escalated via Q1 (isolation class).',
      sortOrder: 2,
    },
    {
      attributeId: 'working_voltage_vrms',
      attributeName: 'Working Voltage (Vrms)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — continuous rated working voltage across the isolation barrier. Distinct from test voltage — a part rated 5000 Vrms test may only be rated 630 Vrms working. The working voltage must cover the actual continuous voltage across the barrier in the application. Exceeding working voltage degrades the isolation barrier over time (partial discharge). Escalated to mandatory + blockOnMissing for reinforced isolation (Q1).',
      sortOrder: 3,
    },
    {
      attributeId: 'creepage_distance_mm',
      attributeName: 'Creepage Distance (mm)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Minimum creepage distance — the shortest path along the surface of insulating material between input and output pins. Replacement must be ≥ original. Creepage is determined by package geometry and cannot be improved by PCB design alone. IEC 60664 specifies minimum creepage based on working voltage × pollution degree. Reinforced isolation at 250VAC with PD2: ≥8mm. Creepage and clearance are independent — one cannot compensate for the other. Escalated to mandatory + blockOnMissing for reinforced isolation (Q1).',
      sortOrder: 6,
    },
    {
      attributeId: 'clearance_distance_mm',
      attributeName: 'Clearance Distance (mm)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Minimum clearance distance — the shortest air path between input and output pins. Replacement must be ≥ original. Clearance is independent of creepage and must be satisfied separately. Dirty or humid environments reduce effective clearance. Escalated to mandatory for reinforced isolation (Q1).',
      sortOrder: 7,
    },
    {
      attributeId: 'peak_isolation_voltage_v',
      attributeName: 'Peak Isolation Voltage (V)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Peak non-repetitive isolation voltage — the maximum instantaneous voltage the barrier can withstand without breakdown. Relevant for circuits with transient overvoltages (lightning, switching transients, mains surges). Replacement must be ≥ original. Escalated to mandatory for reinforced isolation (Q1).',
      sortOrder: 8,
    },
    {
      attributeId: 'safety_certification',
      attributeName: 'Safety Certification',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'UL1577 / IEC 62368-1 / VDE 0884-10 / CSA. Safety certifications determine which markets the product can ship to and what isolation class is recognized. A part certified UL1577 only may not satisfy IEC 62368 requirements for European CE marking. BLOCKING when the application requires a specific certification mark. Escalated to mandatory + blockOnMissing for reinforced/safety-rated isolation (Q1).',
      sortOrder: 9,
    },
    {
      attributeId: 'pollution_degree',
      attributeName: 'Pollution Degree',
      logicType: 'identity_flag',
      weight: 5,
      engineeringReason: 'Pollution degree 1 / 2 / 3 per IEC 60664. Determines the creepage distance multiplier. PD1: clean environment (sealed enclosure). PD2: non-conductive contamination (standard indoor). PD3: conductive contamination possible (industrial, outdoor). Higher pollution degree requires more creepage. Escalated to mandatory for safety-rated applications (Q1).',
      sortOrder: 10,
    },

    // ============================================================
    // SECTION 3: CTR & LED INPUT
    // ============================================================
    {
      attributeId: 'ctr_min_pct',
      attributeName: 'CTR Minimum (%)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Current transfer ratio minimum at specified If — the gain budget. CTR defines the minimum ratio of output collector current to input LED forward current. Replacement CTR_min must be ≥ the required minimum to ensure the output transistor saturates adequately. CTR is specified at a particular If (typically 5 mA or 20 mA) and varies nonlinearly — valid only at the specified If, not at a different operating current. For precision CTR applications (Q3): escalated to mandatory + blockOnMissing. For long-life applications: initial CTR_min should be ≥ 2× required minimum to accommodate LED degradation.',
      sortOrder: 11,
    },
    {
      attributeId: 'ctr_max_pct',
      attributeName: 'CTR Maximum (%)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'CTR maximum — upper bound of the gain range. Relevant when the load circuit assumes bounded gain (e.g., SMPS feedback loop stability depends on CTR not exceeding a design limit). Too-high CTR causes the output to saturate with excessive base overdrive, which can slow turn-off response and destabilize feedback loops. Escalated to mandatory + blockOnMissing for precision CTR (Q3).',
      sortOrder: 12,
    },
    {
      attributeId: 'ctr_class',
      attributeName: 'CTR Class (Rank)',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'CTR rank suffix (A/B/C/D/E) — bins parts by CTR range. PC817A: 80–160%, PC817B: 130–260%, PC817C: 200–400%, PC817D: 300–600%. Escalated to mandatory for precision CTR (Q3) where the feedback loop is tuned to a specific CTR range.',
      sortOrder: 13,
    },
    {
      attributeId: 'if_rated_ma',
      attributeName: 'LED Rated Forward Current (mA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'LED rated continuous forward current — the maximum current the input LED can sustain without degradation. The circuit drives a fixed current (set by a resistor) — if the replacement LED rating is lower than the circuit drive current, the LED is overdiven, causing accelerated degradation and eventual failure. Replacement If_rated must be ≥ the circuit drive current (enforced as replacement ≤ original in threshold comparison since lower rating = more restrictive). Escalated to primary for long-life applications (Q3).',
      sortOrder: 14,
    },
    {
      attributeId: 'input_forward_voltage_vf',
      attributeName: 'Input Forward Voltage Vf (V)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'LED forward voltage at specified If. The circuit has a fixed input voltage and a series resistor — if replacement Vf is higher, the LED current is lower, which reduces CTR below the design minimum. Replacement Vf must be ≤ original to maintain adequate drive current. Typical: 1.2V (GaAs IR) to 1.7V (high-efficiency). Escalated for tight-tolerance drive circuits.',
      sortOrder: 15,
    },

    // ============================================================
    // SECTION 4: OUTPUT CHARACTERISTICS
    // ============================================================
    {
      attributeId: 'vce_sat_v',
      attributeName: 'Vce(sat) (V)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Output transistor saturation voltage — the minimum output low voltage when the transistor is fully on. Replacement Vce(sat) must be ≤ original to ensure adequate output swing margin. In digital switching: Vce(sat) must be below the downstream logic low threshold. In linear SMPS feedback: higher Vce(sat) reduces available output swing. Photodarlington types have higher Vce(sat) (~1V vs ~0.3V for phototransistor).',
      sortOrder: 16,
    },
    {
      attributeId: 'bandwidth_khz',
      attributeName: 'Bandwidth (kHz)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Small-signal bandwidth or maximum switching frequency. Replacement bandwidth must be ≥ original. Phototransistor: 20–300 kHz typical. Photodarlington: 5–50 kHz (slow). Logic-output: 1–25 MHz. For PWM/control loop (Q2): bandwidth ≥ 5× switching frequency. For high-speed digital (Q2): bandwidth ≥ 2× data rate. Escalated to mandatory + blockOnMissing for PWM and digital applications.',
      sortOrder: 17,
    },
    {
      attributeId: 'propagation_delay_us',
      attributeName: 'Propagation Delay (us)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Turn-on/turn-off propagation delay — time from input LED state change to output transistor state change. Replacement must be ≤ original. Asymmetric tpHL/tpLH causes PWM duty cycle distortion — if tpLH > tpHL, the output pulse is narrower than the input, shifting the effective duty cycle. For PWM control loops: duty cycle distortion > 1–2% can cause regulation errors. Escalated to mandatory for digital/PWM applications (Q2).',
      sortOrder: 18,
    },
    {
      attributeId: 'output_leakage_iceo_ua',
      attributeName: 'Output Leakage ICEO (uA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Off-state collector leakage current — current flowing through the output transistor when the input LED is off. Replacement must be ≤ original. Important for high-impedance analog input stages where leakage creates offset voltages. Escalated for high-impedance load circuits.',
      sortOrder: 19,
    },
    {
      attributeId: 'supply_voltage_vcc',
      attributeName: 'Supply Voltage VCC',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'For logic-output types only: VCC supply range must include the board supply voltage. Logic-output optocouplers (6N137, HCPL-xxxx) require a VCC supply (typically 3.3V or 5V). The replacement VCC range must include the board supply. Not applicable for phototransistor/photodarlington types (no VCC pin). Escalated to mandatory + blockOnMissing for high-speed digital isolation with logic-output types (Q2).',
      sortOrder: 20,
    },

    // ============================================================
    // SECTION 5: LIFETIME & ENVIRONMENT
    // ============================================================
    {
      attributeId: 'ctr_degradation_pct',
      attributeName: 'CTR Degradation (%)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'CTR degradation over rated lifetime — the percentage of initial CTR lost due to LED aging (GaAs light output decay). Replacement must have ≤ degradation to maintain gain budget over product lifetime. A part with 30% degradation over 10,000h at If=10mA means initial CTR of 100% becomes 70% at end-of-life. If the load requires 50% CTR minimum, the original design had 50% margin — a replacement with 50% degradation would reach 50% CTR (no margin). Escalated to mandatory + blockOnMissing for long-life/high-reliability (Q3) and to primary for automotive (Q4).',
      sortOrder: 21,
    },
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Must fully cover the application ambient temperature range. CTR decreases at temperature extremes — operating outside the rated range produces unspecified CTR behavior and may cause isolation failure. Commercial: 0°C to +70°C. Industrial: −40°C to +85°C. Automotive: −40°C to +125°C. Escalated to mandatory for automotive (Q4).',
      sortOrder: 22,
    },
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'AEC-Q101 discrete semiconductor qualification for automotive. IMPORTANT: Optocouplers use AEC-Q101 (discrete semiconductor standard — LED + phototransistor are discrete devices), NOT AEC-Q100 (active IC standard) or AEC-Q200 (passive standard). Non-AEC parts are BLOCKED from automotive designs when context Q4 escalates to mandatory + blockOnMissing.',
      sortOrder: 23,
    },
  ],
};
