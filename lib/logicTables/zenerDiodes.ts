import { LogicTable } from '../types';

/**
 * Zener Diodes / Voltage Reference Diodes
 * Block B: Discrete Semiconductors — Family B3
 *
 * Derived from: docs/zener_diodes_logic.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * Key differences from rectifier (B1) and Schottky (B2) diodes:
 * - Zener Voltage (Vz) is THE primary spec — Identity match, not threshold
 *   (the component exists to produce this specific voltage)
 * - Zener Test Current (Izt) is Identity — Vz is only comparable at the same Izt
 * - Dynamic Impedance (Zzt) is Threshold ≤ — regulation quality metric
 * - Temperature Coefficient (TC) is Threshold ≤ on absolute value — voltage stability
 * - Knee Impedance (Zzk) is Application Review — low-current operation concern
 * - Regulation Type (Zener vs Avalanche) is Application Review — noise differences
 * - Forward Voltage (Vf) is Application Review — only for bidirectional clamp circuits
 * - Junction Capacitance (Cj) is Application Review — only for ESD/signal-line protection
 * - No reverse recovery attributes (same as Schottky — irrelevant for Zener operation)
 * - No Vdc attribute (Zener operates in breakdown, not blocking)
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification
 */
export const zenerDiodesLogicTable: LogicTable = {
  familyId: 'B3',
  familyName: 'Zener Diodes / Voltage Reference Diodes',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for Zener diode / voltage reference diode replacement part validation',
  rules: [
    {
      attributeId: 'vz',
      attributeName: 'Zener Voltage (Vz)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'THE primary specification — this is what the component exists to do. Vz is the reverse breakdown voltage at which the diode regulates. A 5.1V Zener must be replaced by a 5.1V Zener. Standard Vz values follow the E24 series. Vz is specified at a particular test current (Izt) at 25°C — the actual voltage shifts with operating current and temperature.',
      sortOrder: 1,
    },
    {
      attributeId: 'vz_tolerance',
      attributeName: 'Zener Voltage Tolerance',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'How tightly the actual Vz matches the nominal value. Standard tolerances: ±20% (E), ±10% (D), ±5% (C), ±2% (B), ±1% (A). Tighter tolerance is always acceptable. In clamping applications ±5–10% is fine; in voltage reference applications ±1–2% may be required. Determines worst-case voltage range the circuit must accommodate.',
      sortOrder: 2,
    },
    {
      attributeId: 'pd',
      attributeName: 'Power Dissipation (Pd)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Second most important spec after Vz. Maximum continuous power: Pd = Vz × Iz. Determines maximum current: Iz_max = Pd / Vz. Common ratings: 200mW (SOD-323/523), 300mW (SOD-123), 500mW (SOD-80/SMA), 1W (DO-41/SMB), 1.3–5W (higher packages). Package and power rating are tightly coupled for Zeners.',
      sortOrder: 3,
    },
    {
      attributeId: 'zzt',
      attributeName: 'Dynamic / Differential Impedance (Zzt)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Key voltage regulation quality metric: Zzt = ΔVz / ΔIz at test current Izt. Lower impedance = more stable voltage as load varies. Typical: 1–10Ω for 5–15V at rated current, 10–100Ω for <3.3V, 100–700Ω for <2.4V. Strongly current-dependent — 5Ω at 20mA may become 500Ω at 100µA. Critical for reference applications.',
      sortOrder: 4,
    },
    {
      attributeId: 'zzk',
      attributeName: 'Knee Impedance (Zzk)',
      logicType: 'application_review',
      weight: 4,
      engineeringReason: 'Dynamic impedance measured at very low current (Izk), near the onset of breakdown. Always much higher than Zzt — typically 100–1000Ω. Matters only when the Zener operates at low current (high-impedance bias network). At rated current (Izt) Zzk is irrelevant.',
      sortOrder: 5,
    },
    {
      attributeId: 'tc',
      attributeName: 'Temperature Coefficient (TC / αVz)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'How much Vz changes with temperature (mV/°C or %/°C). Compared on absolute value — |replacement TC| must be ≤ |original TC|. Below ~5V TC is negative (Zener mechanism); above ~5V TC is positive (avalanche mechanism). At ~5.1V, TC crosses zero — the most commonly used voltage reference point. Critical for reference applications, irrelevant for clamping.',
      sortOrder: 6,
    },
    {
      attributeId: 'izt',
      attributeName: 'Zener Test Current (Izt)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'The current at which Vz and Zzt are specified — a measurement condition, NOT an operating limit. If Izt differs between original and replacement, their Vz values are not directly comparable because Zener voltage shifts with current. Common test currents: 1mA, 5mA, 10mA, 20mA, 50mA, 100mA depending on power rating.',
      sortOrder: 7,
    },
    {
      attributeId: 'izm',
      attributeName: 'Maximum Zener Current (Izm)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Maximum continuous reverse current. Usually derived: Izm = Pd / Vz. Relevant for Zener shunt regulators where load current varies widely. Higher is safe.',
      sortOrder: 8,
    },
    {
      attributeId: 'ir_leakage',
      attributeName: 'Reverse Leakage Current (Ir)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Current flowing when reverse-biased below breakdown voltage. Specified at a voltage below Vz. Matters in battery-powered circuits (drain), high-impedance circuits (bias shift), and ESD protection where leakage affects signal integrity. Typical: 0.1–10µA at 25°C.',
      sortOrder: 9,
    },
    {
      attributeId: 'vf',
      attributeName: 'Forward Voltage (Vf)',
      logicType: 'application_review',
      weight: 3,
      engineeringReason: 'Forward-biased Vf ≈ 0.7V. Relevant only in bidirectional clamp circuits (total clamping window = Vz + Vf) and ESD protection where the Zener may conduct forward during negative transients. In standard voltage reference/regulation applications Vf is irrelevant.',
      sortOrder: 10,
    },
    {
      attributeId: 'cj',
      attributeName: 'Junction Capacitance (Cj)',
      logicType: 'application_review',
      weight: 4,
      engineeringReason: 'Zener junction capacitance when reverse-biased below Vz. Relevant for ESD protection on data lines — high Cj degrades signal integrity (USB, HDMI, SPI). Typical: 10–100pF standard, 0.5–5pF ESD-optimized. For power supply regulation or power rail clamping Cj is irrelevant.',
      sortOrder: 11,
    },
    {
      attributeId: 'regulation_type',
      attributeName: 'Regulation Type (Zener vs. Avalanche)',
      logicType: 'application_review',
      weight: 3,
      engineeringReason: 'Below ~5V breakdown is Zener effect (quantum tunneling, quieter). Above ~5V breakdown is avalanche multiplication (noisier). Between 4.7–5.6V both mechanisms contribute. Matters for noise-sensitive applications: audio circuits, precision references, low-noise analog designs. Low-voltage Zeners (<5V) are inherently quieter.',
      sortOrder: 12,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Form Factor',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Must match the PCB footprint. SMD: SOD-523 (0.2W), SOD-323 (0.2–0.3W), SOD-123 (0.35–0.5W), SOD-80/MiniMELF (0.5W), SMA (1W), SMB (1.5–2W). Through-hole: DO-35 (0.5W glass), DO-41 (1W), DO-201 (5W). Package and power rating are tightly coupled.',
      sortOrder: 13,
    },
    {
      attributeId: 'pin_configuration',
      attributeName: 'Pin Configuration / Polarity Marking',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Zener diodes operate in REVERSE bias — cathode connects to the more positive potential (opposite of rectifier convention). Incorrect polarity = forward-biased diode (Vf ≈ 0.7V) instead of regulating at Vz — can cause excessive current and circuit damage. For dual packages verify pin-to-function mapping.',
      sortOrder: 14,
    },
    {
      attributeId: 'configuration',
      attributeName: 'Configuration',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Single (most common), Dual Common Cathode (bidirectional clamping on differential pairs), Dual Common Anode, Dual Series/back-to-back (symmetrical AC clamping, total clamp = 2×Vz), Triple/Array (multi-line ESD protection). Configuration must match exactly.',
      sortOrder: 15,
    },
    {
      attributeId: 'mounting_style',
      attributeName: 'Mounting Style',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Surface mount vs. through-hole. Cannot interchange without PCB redesign. Glass-body through-hole Zeners (DO-35) are still widely used in legacy designs.',
      sortOrder: 16,
    },
    {
      attributeId: 'height',
      attributeName: 'Height (Seated Max)',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Verify mechanical clearance. Through-hole glass Zeners (DO-35) ~3.5mm body. Larger power Zeners (DO-41, DO-201) are bigger. SMD Zeners are low-profile by definition.',
      sortOrder: 17,
    },
    {
      attributeId: 'rth_ja',
      attributeName: 'Thermal Resistance, Junction-to-Ambient (Rθja)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'How effectively the Zener dissipates heat. Lower is better. Primary thermal metric for Zeners — most are small SMD or through-hole packages without heatsinks. Higher Rθja means hotter junction at same power, potentially shifting Vz via TC.',
      sortOrder: 18,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Max Junction Temperature (Tj_max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Typically 150°C or 175°C for silicon Zeners. Higher provides more thermal headroom. Since Vz shifts with temperature (per TC), operating near Tj_max shifts Vz from 25°C nominal. For precision references, thermal headroom minimizes TC effects.',
      sortOrder: 19,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Replacement range must fully contain original. Standard: -65°C to +150°C or -55°C to +150°C. Automotive: -40°C to +125°C or +150°C. The operating range directly affects voltage stability — wider range means more Vz variation (TC × ΔT).',
      sortOrder: 20,
    },
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Automotive qualification for discrete semiconductors. AEC-Q101 (not AEC-Q200). Zener diodes in automotive are used for voltage clamping, protection, and regulation in sensor circuits, CAN bus interfaces, and power management. A non-qualified part cannot replace a qualified one.',
      sortOrder: 21,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging (Tape & Reel / Tube / Bulk)',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'SMD: Tape & Reel for automated assembly. Through-hole: Ammo Pack or Bulk. Mismatch doesn\'t affect performance but can halt production.',
      sortOrder: 22,
    },
  ],
};
