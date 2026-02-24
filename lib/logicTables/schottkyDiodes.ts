import { LogicTable } from '../types';

/**
 * Schottky Barrier Diodes
 * Block B: Discrete Semiconductors — Family B2
 *
 * Derived from: docs/schottky_diodes_logic.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * Key differences from rectifier diodes (B1):
 * - No reverse recovery attributes (trr, Qrr, recovery_category, recovery_behavior)
 *   — Schottky uses metal-semiconductor junction, no minority carrier storage
 * - Junction Capacitance (Cj) elevated from Application Review to Threshold
 *   — Schottky diodes are disproportionately used in high-frequency circuits
 * - Vf weight elevated (9 vs 8) — THE dominant specification for Schottky
 * - Ir weight elevated (7 vs 5) — Schottky's Achilles' heel, thermal runaway risk
 * - Thermal resistance weights elevated — leakage-driven thermal runaway risk
 * - New: Semiconductor Material (Si vs SiC) as Identity Flag
 * - New: Technology (Trench vs Planar) as Application Review
 * - New: Vf Temperature Coefficient as Application Review (parallel operation)
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification
 */
export const schottkyDiodesLogicTable: LogicTable = {
  familyId: 'B2',
  familyName: 'Schottky Barrier Diodes',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for Schottky barrier diode replacement part validation',
  rules: [
    {
      attributeId: 'schottky_technology',
      attributeName: 'Schottky Technology',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Confirms the diode is a Schottky barrier type, not a standard PN junction. Schottky diodes use a metal-semiconductor junction with fundamentally different characteristics: near-zero reverse recovery time (majority carrier device), lower Vf (0.2–0.5V vs 0.7–1.1V), but higher reverse leakage. A standard silicon rectifier cannot replace a Schottky where low Vf is required.',
      sortOrder: 1,
    },
    {
      attributeId: 'vrrm',
      attributeName: 'Max Repetitive Peak Reverse Voltage (Vrrm)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'Primary voltage specification. Silicon Schottky typically limited to ≤200V. Common values: 20V, 30V, 40V, 45V, 60V, 100V, 150V, 200V. SiC Schottky extends to 600–1700V.',
      sortOrder: 2,
    },
    {
      attributeId: 'io_avg',
      attributeName: 'Average Rectified Forward Current (Io)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'Primary current specification. Maximum average forward current at a specified reference temperature. Common Schottky current ratings: 0.5A, 1A, 2A, 3A, 5A, 10A, 15A, 20A, 30A, 40A, 60A.',
      sortOrder: 3,
    },
    {
      attributeId: 'vf',
      attributeName: 'Forward Voltage Drop (Vf)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'THE dominant specification for Schottky diodes — this is why they exist. Typical Schottky Vf: 0.2–0.5V at rated current. In low-voltage circuits (3.3V, 5V), every 50mV of Vf difference is significant. The Vf-Ir-Vrrm trade-off triangle means lower Vf almost certainly means higher Ir.',
      sortOrder: 4,
    },
    {
      attributeId: 'ir_leakage',
      attributeName: 'Reverse Leakage Current (Ir)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'The Achilles\' heel of Schottky diodes. Schottky leakage is 10–1000× higher than standard silicon rectifiers. Typical values: 10µA–1mA at 25°C, rising to 1–100mA at 125°C. Ir approximately doubles every 10°C, creating thermal runaway risk at high voltage and high ambient temperature.',
      sortOrder: 5,
    },
    {
      attributeId: 'ifsm',
      attributeName: 'Max Surge Forward Current (Ifsm)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Maximum non-repetitive peak forward current for a single half-sine pulse (typically 8.3ms or 10ms). Critical in capacitor-input filters and motor drive applications where inrush current occurs.',
      sortOrder: 6,
    },
    {
      attributeId: 'cj',
      attributeName: 'Junction Capacitance (Cj)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Elevated from Application Review (rectifier diodes) to Threshold for Schottky because Schottky diodes are disproportionately used in high-frequency applications where Cj is the switching speed limiter. Since there is no reverse recovery time, Cj becomes the dominant switching loss mechanism.',
      sortOrder: 7,
    },
    {
      attributeId: 'semiconductor_material',
      attributeName: 'Semiconductor Material (Si vs SiC)',
      logicType: 'identity_flag',
      weight: 9,
      engineeringReason: 'SiC Schottky can replace silicon Schottky (upgrade) but silicon CANNOT replace SiC at high voltage. SiC operates at 600–1700V with low leakage and temperature-stable characteristics. Silicon Schottky is limited to ≤200V. If the original is SiC, the replacement must also be SiC.',
      sortOrder: 8,
    },
    {
      attributeId: 'configuration',
      attributeName: 'Configuration',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Critical physical and functional constraint. Configurations: Single, Dual Common Cathode, Dual Common Anode, Dual Series. Internal wiring determines pin connections — a common cathode dual cannot replace a common anode dual even if the package is identical.',
      sortOrder: 9,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Form Factor',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Must match the PCB footprint. Common packages: SMD (SOD-123, SMA, SMB, SMC, DPAK, D2PAK, PowerDI), Through-hole (DO-41, DO-15, DO-27, DO-201, TO-220, TO-247). Package also determines thermal capability.',
      sortOrder: 10,
    },
    {
      attributeId: 'pin_configuration',
      attributeName: 'Pin Configuration / Polarity Marking',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Incorrect polarity = reverse-biased diode in a forward-biased position = circuit failure. For multi-die packages, pin-to-function mapping varies between manufacturers. The tab/heatsink connection also matters — usually connected to the common pin.',
      sortOrder: 11,
    },
    {
      attributeId: 'rth_jc',
      attributeName: 'Thermal Resistance, Junction-to-Case (Rtheta_jc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'More critical for Schottky than standard rectifiers due to leakage-driven thermal runaway risk. Lower is better. Dominant thermal metric for heatsink-mounted packages. At high ambient temperature, poor thermal resistance accelerates the Ir-temperature positive feedback loop.',
      sortOrder: 12,
    },
    {
      attributeId: 'rth_ja',
      attributeName: 'Thermal Resistance, Junction-to-Ambient (Rtheta_ja)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Important due to Schottky thermal runaway risk from leakage current. Relevant for SMD packages and small through-hole packages relying on PCB copper for heat dissipation.',
      sortOrder: 13,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Max Junction Temperature (Tj_max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Maximum allowable junction temperature. Standard silicon Schottky: typically 125°C or 150°C. SiC Schottky: 175°C. Higher Tj_max provides more thermal headroom — especially important for Schottky due to exponential leakage increase with temperature.',
      sortOrder: 14,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Ambient temperature range over which the device is rated. The replacement range must fully contain the original range. For automotive: -40°C to +125°C or +150°C.',
      sortOrder: 15,
    },
    {
      attributeId: 'pd',
      attributeName: 'Power Dissipation (Pd)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Maximum power the device can dissipate. For Schottky diodes, total dissipation includes conduction loss (Vf × If), leakage loss (Ir × Vr), and capacitive switching loss (½ × Cj × V² × f). Leakage loss can be significant at high voltage and temperature.',
      sortOrder: 16,
    },
    {
      attributeId: 'technology_trench_planar',
      attributeName: 'Technology (Trench vs Planar)',
      logicType: 'application_review',
      weight: 4,
      engineeringReason: 'Trench Schottky offers lower Vf and better Ir-vs-Vf trade-off than planar. Replacing trench with planar may degrade performance; replacing planar with trench is generally an upgrade. Flag for review to verify trade-offs are acceptable.',
      sortOrder: 17,
    },
    {
      attributeId: 'vf_tempco',
      attributeName: 'Vf Temperature Coefficient',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Critical for parallel operation and wide temperature range applications. At high currents, Schottky Vf has a positive tempco (natural current sharing — safe). At low currents, Vf has a negative tempco (thermal runaway risk in parallel — dangerous). Must verify operating point relative to the tempco crossover.',
      sortOrder: 18,
    },
    {
      attributeId: 'mounting_style',
      attributeName: 'Mounting Style',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Surface mount vs. through-hole. Cannot interchange without PCB redesign. Within each: axial vs. vertical (different footprints, mounting hardware). Power pad packages require matching PCB pads for thermal path.',
      sortOrder: 19,
    },
    {
      attributeId: 'height',
      attributeName: 'Height (Seated Max)',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Verify mechanical clearance. Through-hole axial diodes (DO-41) ~4-5mm. TO-220 ~15mm. SMD varies: SMA ~2.5mm, DPAK ~2.3mm, D2PAK ~4.4mm. Stacked PCBs, enclosures, and adjacent components constrain available height.',
      sortOrder: 20,
    },
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Automotive qualification for discrete semiconductors. AEC-Q101 (not Q200 — Q200 is for passives). Includes HTRB, H3TRB, TC stress tests. A non-qualified part cannot replace a qualified one in automotive applications.',
      sortOrder: 21,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging (Tape & Reel / Tube / Bulk)',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'SMD requires Tape & Reel for automated pick-and-place. Through-hole: Ammo Pack for auto-insertion, Tube or Bulk for hand assembly. Mismatch halts production lines but doesn\'t affect electrical performance.',
      sortOrder: 22,
    },
  ],
};
