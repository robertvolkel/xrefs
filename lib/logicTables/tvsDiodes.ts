import { LogicTable } from '../types';

/**
 * TVS Diodes — Transient Voltage Suppressors
 * Block B: Discrete Semiconductors — Family B4
 *
 * Derived from: docs/tvs_diodes_logic.docx
 * 23 attributes with specific matching rules for cross-reference validation.
 *
 * Key differences from other diode families (B1/B2/B3):
 * - Standoff Voltage (Vrwm) is Identity — must match circuit operating voltage
 *   (unlike Vrrm in B1/B2 which is Threshold ≥)
 * - Zero Application Review attributes — protection is binary (works or doesn't)
 * - Junction Capacitance (Cj) elevated to hard Threshold ≤ (not Application Review)
 *   because TVS Cj directly determines signal integrity impact
 * - Clamping Voltage (Vc) is THE critical protection spec — Threshold ≤
 * - New TVS-specific attributes: Ppk, Ipp, ESD Rating, Channels, Topology,
 *   Surge Standard Compliance, Polarity, Response Time
 * - Breakdown Voltage (Vbr) is Identity — must match within tolerance because
 *   both too-low (unwanted conduction) and too-high (inadequate clamping) are failures
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification
 *
 * TVS vs. Zener vs. MOV: Three different protection philosophies.
 * TVS: fast, repeatable transient suppression (<1ns, 400W–30kW peak, millions of events)
 * Zener: steady-state voltage regulation (tight Vz, low Zzt, specified TC)
 * MOV: high energy absorption (joules vs. millijoules, but degrades with each surge)
 */
export const tvsDiodesLogicTable: LogicTable = {
  familyId: 'B4',
  familyName: 'TVS Diodes — Transient Voltage Suppressors',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for TVS diode replacement part validation',
  rules: [
    {
      attributeId: 'polarity',
      attributeName: 'Polarity (Unidirectional vs. Bidirectional)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'First gate — determines fundamental clamping behavior. Unidirectional TVS clamps in one direction (reverse) and conducts like a standard diode forward (Vf ≈ 0.7V). Used on DC rails and known-polarity signals. Bidirectional TVS clamps symmetrically at ±Vbr. Used on AC lines, differential signals, and signals that swing both ways. A unidirectional CANNOT replace a bidirectional — it would clamp one polarity at Vbr but the other at only ~0.7V, destroying the signal.',
      sortOrder: 1,
    },
    {
      attributeId: 'vrwm',
      attributeName: 'Standoff Voltage (Vrwm)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'The maximum continuous reverse voltage the TVS can sustain without conducting — the working voltage. The TVS sits across the line at this voltage during normal operation. Vrwm must match the circuit\'s operating voltage: too low and the TVS conducts during normal operation (drawing current, heating up); too high and the clamping voltage is too far above operating voltage, leaving the circuit exposed. Identity match because working voltage is determined by the circuit, not a threshold.',
      sortOrder: 2,
    },
    {
      attributeId: 'vbr',
      attributeName: 'Breakdown Voltage (Vbr)',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'The voltage at which the TVS begins to conduct (measured at ~1mA). Vbr ≈ 1.1× Vrwm. Replacement Vbr must be within ±tolerance of original: too low and the TVS may conduct on normal voltage excursions; too high and the clamping voltage (Vc) rises above the protected IC\'s maximum rating. Both min and max Vbr boundaries matter. Identity match because both directions of deviation are failures.',
      sortOrder: 3,
    },
    {
      attributeId: 'vc',
      attributeName: 'Clamping Voltage (Vc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 10,
      engineeringReason: 'THE most critical protection spec — the voltage the protected circuit actually sees during a surge. Vc is measured at peak pulse current (Ipp). Always higher than Vbr due to dynamic impedance: Vc ≈ 1.3–1.5× Vbr for silicon TVS. The protected IC\'s absolute max rating must be ≥ Vc. If original TVS has Vc = 9.2V protecting a 10V-max IC, a replacement with Vc = 11V does NOT protect the IC. Lower Vc is always better.',
      sortOrder: 4,
    },
    {
      attributeId: 'ppk',
      attributeName: 'Peak Pulse Power (Ppk)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Maximum instantaneous power during a single pulse, specified at a standard waveform (10/1000µs or 8/20µs). Common ratings: 200W to 30kW. Ppk = Vc × Ipp. Higher means the TVS can handle larger surges. A replacement with lower Ppk may survive small transients but fail on surges the original would have handled. The pulse waveform shape matters — verify same standard.',
      sortOrder: 5,
    },
    {
      attributeId: 'ipp',
      attributeName: 'Peak Pulse Current (Ipp)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Maximum peak current during a surge pulse (Ipp = Ppk / Vc), specified at standard waveform (8/20µs or 10/1000µs). Ranges from 1A (small SMD) to 500A+ (high-power through-hole). In lightning and industrial surge applications, Ipp is often the primary selection criterion. For ESD on signal lines, Ipp is less critical.',
      sortOrder: 6,
    },
    {
      attributeId: 'cj',
      attributeName: 'Junction Capacitance (Cj)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Critical for signal-line protection — often THE differentiating spec for TVS on data lines. The TVS loads the signal during normal operation. On high-speed lines (USB 3.x, HDMI, PCIe), even a few pF degrades signal integrity. Typical: 0.2–1pF ultra-low-cap (USB 3.x/HDMI), 3–15pF general-purpose, 50–5000pF power-line TVS. For power rails, Cj is irrelevant. Elevated to hard Threshold because TVS Cj directly impacts signal integrity.',
      sortOrder: 7,
    },
    {
      attributeId: 'ir_leakage',
      attributeName: 'Reverse Leakage Current (Ir)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Current drawn at standoff voltage (Vrwm) during normal operation. Typically 0.1–10µA at 25°C. For battery-powered devices, leakage directly affects standby drain. For signal-line protection, leakage can affect bias in high-impedance circuits. Leakage increases with temperature. Lower is always better.',
      sortOrder: 8,
    },
    {
      attributeId: 'response_time',
      attributeName: 'Response Time',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'How quickly the TVS begins clamping. Silicon TVS is inherently fast — typically <1ns for the semiconductor element. Practical response time is dominated by package parasitics (lead inductance). SMD responds faster than through-hole. For ESD (rise time ~0.7–1ns), parasitics matter. For surge (rise time 8µs), they don\'t. Most datasheets don\'t specify it because it\'s <1ns.',
      sortOrder: 9,
    },
    {
      attributeId: 'esd_rating',
      attributeName: 'ESD Rating (IEC 61000-4-2)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'ESD withstand per IEC 61000-4-2. Typical: ±8kV contact / ±15kV air (standard), ±15kV contact / ±25kV air (high), ±30kV contact (ultra-high). Relevant for TVS on externally accessible ports (USB, HDMI, Ethernet, audio). Higher is always better. Power-line TVS typically don\'t specify this; signal-line TVS arrays almost always do.',
      sortOrder: 10,
    },
    {
      attributeId: 'num_channels',
      attributeName: 'Number of Channels / Lines',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Single-line (power rail or single signal) vs. multi-line arrays (2, 4, 6, 8 lines for bus protection). Channel count must match because the package pinout is designed for the specific bus. A 4-line USB array cannot physically replace an 8-line HDMI array. Some arrays include asymmetric protection (different Vrwm for power vs. data).',
      sortOrder: 11,
    },
    {
      attributeId: 'configuration',
      attributeName: 'Configuration / Topology',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'How TVS elements connect internally: Discrete (single element), Rail-to-rail (common anode/cathode array — single-ended signal protection), Back-to-back (anti-series pair — bidirectional clamping), Steering diode array (steers surge to power/ground rails — lowest Cj, relies on rail decoupling). Topology determines clamping behavior and pin-to-function mapping. Must match exactly.',
      sortOrder: 12,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Form Factor',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Must match PCB footprint. Power TVS: SMA/DO-214AC (400–600W), SMB/DO-214AA (600W), SMC/DO-214AB (1500W), DO-15 (1500W), DO-201 (5000W+). Signal-line arrays: SOT-23, SOT-553, DFN/QFN, µDFN/CSP. Package determines parasitic inductance (response time) and thermal capability (pulse power).',
      sortOrder: 13,
    },
    {
      attributeId: 'pin_configuration',
      attributeName: 'Pin Configuration / Pinout',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'For single power TVS in 2-pin packages, straightforward. For multi-line arrays, the pinout maps specific pins to specific signal lines and the common rail. Different manufacturers often use different pinouts for the same package — always verify from datasheet. Incorrect pinout means some lines are unprotected while others may be shorted.',
      sortOrder: 14,
    },
    {
      attributeId: 'mounting_style',
      attributeName: 'Mounting Style',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Surface mount vs. through-hole. Cannot interchange without PCB redesign. Power TVS available in both SMD (SMA/SMB/SMC) and through-hole (DO-15, DO-201, P600). Signal-line TVS arrays are almost exclusively SMD. Through-hole DO-201 and P600 handle the highest pulse power ratings (5000W+).',
      sortOrder: 15,
    },
    {
      attributeId: 'rth_ja',
      attributeName: 'Thermal Resistance, Junction-to-Ambient (Rθja)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'How effectively the TVS dissipates heat between surge events. Unlike rectifiers that conduct continuously, TVS only conducts during transients — but absorbed pulse energy heats the junction. Rθja determines cooling rate between pulses, affecting capability for repetitive surges. For single isolated surges, less important (adiabatic). For repetitive surges, critical.',
      sortOrder: 16,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Max Junction Temperature (Tj_max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Typically 150°C or 175°C. During a surge, junction temperature spikes far above ambient — pulse energy is absorbed adiabatically in the small silicon volume. Tj_max determines maximum single-pulse energy the TVS can survive. Higher provides more headroom for large surges.',
      sortOrder: 17,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Ambient temperature range. Standard: -55°C to +150°C or -40°C to +125°C. At higher ambient, less thermal headroom to absorb surge energy. Some datasheets provide pulse power derating vs. ambient temperature. Replacement range must fully contain the original.',
      sortOrder: 18,
    },
    {
      attributeId: 'pd',
      attributeName: 'Steady-State Power Dissipation (Pd)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'Maximum continuous power dissipation — relevant during sustained overvoltage faults (not just brief transients). A 600W peak-pulse TVS might have only 1–5W steady-state power. In most applications TVS only conducts briefly, so Pd is secondary. In sustained overvoltage scenarios, it matters.',
      sortOrder: 19,
    },
    {
      attributeId: 'height',
      attributeName: 'Height (Seated Max)',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Verify mechanical clearance. SMD TVS are typically low-profile. Through-hole power TVS (DO-201, P600) can be quite tall. Signal-line TVS arrays in SOT-23 and DFN packages are very thin.',
      sortOrder: 20,
    },
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Automotive qualification for discrete semiconductors. TVS in automotive protect CAN, LIN, FlexRay, power inputs, and sensor interfaces from load dump, ESD, and inductive switching. Must survive automotive transient environment (ISO 7637, ISO 16750). A non-qualified part cannot replace a qualified one.',
      sortOrder: 21,
    },
    {
      attributeId: 'surge_standard',
      attributeName: 'Surge Standard Compliance (IEC 61000-4-5 / ISO 7637)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'If the original is rated to a specific surge standard, the replacement must meet the same standard. Standards: IEC 61000-4-5 (industrial/telecom, 8/20µs), ISO 7637 (automotive load dump), DO-160 (aerospace), GR-1089 (telecom lightning). These define specific waveforms, energy levels, and pass/fail criteria beyond what individual specs capture.',
      sortOrder: 22,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging (Tape & Reel / Tube / Bulk)',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'SMD: Tape & Reel for automated assembly. Through-hole: Ammo Pack or Tube for auto-insertion, Bulk for hand assembly. Mismatch doesn\'t affect performance but can halt production.',
      sortOrder: 23,
    },
  ],
};
