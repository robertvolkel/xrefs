import { LogicTable } from '../types';

/**
 * JFETs — Junction Field-Effect Transistors
 * Block B: Discrete Semiconductors — Family B9
 *
 * Derived from: docs/jfet_logic_b9.docx
 * 17 attributes (16 from document + 1 matched-pair review flag) with specific
 * matching rules for cross-reference validation.
 *
 * Key differences from MOSFETs (B5):
 * - JFETs are DEPLETION-MODE: ON with Vgs=0, must be biased OFF. MOSFETs are
 *   enhancement-mode: OFF with Vgs=0, must be driven ON. Direct substitution
 *   is impossible without circuit redesign.
 * - Pinch-off voltage (Vp) and drain saturation current (Idss) define the
 *   operating point via the square-law: Id = Idss × (1 - Vgs/Vp)².
 *   These have enormous manufacturing spread (3-4:1 typical), so replacement
 *   validity requires RANGE OVERLAP, not exact match or simple threshold.
 * - JFETs are specified primarily for ultra-low noise (audio preamplifiers,
 *   microphone capsules) and ultra-high input impedance (electrometers, pH
 *   electrodes, ionization detectors). Gate leakage (Igss) in the pA range
 *   is the binding specification for high-impedance applications.
 * - 1/f noise corner frequency (fc) is critical for audio applications below
 *   10kHz but irrelevant for RF. The best audio JFETs (2SK170, IF3602) have
 *   fc of 10-100Hz; less optimized types may exceed 1kHz.
 * - Matched-pair devices are required for differential inputs and balanced
 *   preamplifiers — single-device matching rules are insufficient; must
 *   flag for engineering review.
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification.
 *
 * Related families: MOSFETs (B5) — share FET gate-drive concepts but
 * fundamentally different operating mode (depletion vs enhancement);
 * BJTs (B6) — compete in low-noise applications but JFETs have higher
 * input impedance and lower 1/f noise.
 *
 * Fundamental trade-off: Idss vs. noise figure. Higher Idss devices have
 * higher transconductance (gm = 2×Idss/|Vp|) and lower noise, but require
 * more quiescent power. Ultra-low-noise designs run JFETs near Idss for
 * maximum gm and minimum NF.
 */
export const jfetsLogicTable: LogicTable = {
  familyId: 'B9',
  familyName: 'JFETs — Junction Field-Effect Transistors',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for JFET replacement part validation',
  rules: [
    // ============================================================
    // IDENTITY — Channel, Package & Operating Point
    // ============================================================
    {
      attributeId: 'channel_type',
      attributeName: 'Channel Type (N/P)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'N-channel and P-channel JFETs require opposite supply polarities and gate bias polarity. An N-channel JFET needs negative Vgs to reduce drain current; a P-channel needs positive Vgs. Swapping channel type inverts the entire bias scheme and is never a drop-in replacement.',
      sortOrder: 1,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Must match PCB footprint exactly. JFET pin ordering varies significantly — TO-92 has both G-S-D and D-G-S orderings, SOT-23 varies pin 1 assignment (gate vs drain). Installing with gate and drain swapped can apply drain voltage to the low-breakdown gate junction, destroying the device.',
      sortOrder: 2,
    },
    {
      attributeId: 'vp',
      attributeName: 'Pinch-Off Voltage Vp / Vgs(off)',
      logicType: 'identity_range',
      weight: 10,
      engineeringReason: 'Vp defines the gate-source voltage at which drain current drops to threshold. The transfer characteristic Id = Idss × (1 - Vgs/Vp)² means Vp directly sets the bias point, gain, and noise figure at any given operating current. Manufacturing spread is 3-4:1 typical (e.g., -0.5V to -6V). Replacement Vp range must overlap the original — a non-overlapping Vp shifts the bias point outside the designed operating region.',
      sortOrder: 3,
    },
    {
      attributeId: 'idss',
      attributeName: 'Drain Saturation Current Idss',
      logicType: 'identity_range',
      weight: 9,
      engineeringReason: 'Idss is the maximum drain current at Vgs=0, establishing the upper bound of the operating range. Transconductance scales with Idss: gm = 2×sqrt(Id×Idss)/|Vp|. Higher Idss means higher gm and lower noise figure at a given drain current. Manufacturing spread is wide (3-4:1). Replacement Idss range must overlap to ensure the circuit can achieve the designed operating current and gain.',
      sortOrder: 4,
    },

    // ============================================================
    // PERFORMANCE — Noise & Gain
    // ============================================================
    {
      attributeId: 'gfs',
      attributeName: 'Forward Transconductance gfs / gm',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Transconductance determines voltage gain: Av = -gfs × Rd. Lower gfs means lower gain and worse noise figure. gfs varies with operating point: gfs(Vgs) = gfs0 × (1 - Vgs/Vp). Replacement must meet or exceed the original at the same Vgs operating point.',
      sortOrder: 5,
    },
    {
      attributeId: 'noise_figure',
      attributeName: 'Noise Figure NF',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Noise figure is THE primary reason JFETs are specified over other transistor types. NF has two components: thermal channel noise (white, scales with 1/sqrt(gfs)) and 1/f flicker noise. Must be verified at the operating frequency and conditions — datasheet NF is only valid at specified test conditions. Substitution must verify NF directly, not assume from parametric matching alone.',
      sortOrder: 6,
    },
    {
      attributeId: 'fc_1f_corner',
      attributeName: '1/f Noise Corner Frequency',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Critical for audio preamplifiers, microphone capsules, and applications below ~10kHz. The best audio JFETs (2SK170, 2SK369, IF3602) have fc of 10-100Hz. Less optimized types may have fc above 1kHz, making them unsuitable for audio. When not explicitly specified, compare noise spectral density at 10Hz vs 1kHz — a ratio >3-5x indicates significant 1/f noise. Irrelevant for RF applications above 1MHz.',
      sortOrder: 7,
    },

    // ============================================================
    // VOLTAGE & CURRENT RATINGS
    // ============================================================
    {
      attributeId: 'vds_max',
      attributeName: 'Drain-Source Breakdown Voltage Vds',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Must cover full drain voltage swing including transient overshoots. Typical small-signal: 25-40V for ±15V supplies. High-voltage JFETs (100-300V) are used in CRT circuits, high-voltage instrumentation, and high-rail audio output stages. Insufficient Vds causes avalanche breakdown and device failure.',
      sortOrder: 8,
    },
    {
      attributeId: 'vgs_max',
      attributeName: 'Gate-Source Breakdown Voltage Vgs',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Gate-source junction is reverse-biased under normal operation with forward breakdown at ~0.6-0.7V. Typical reverse breakdown: -25V to -40V (N-channel). Low Vgs(max) margin increases vulnerability to gate transients. Critical in ultra-high-impedance circuits where gate current from junction breakdown would corrupt the measurement.',
      sortOrder: 9,
    },
    {
      attributeId: 'igss',
      attributeName: 'Gate Leakage Current Igss',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'THE critical specification for electrometer, photodiode, pH electrode, ionization detector, and ultra-high-impedance input applications. Range: 1-100pA at 25C. Context: 10pA across a 100G-ohm source creates a 1V offset error. Temperature coefficient: roughly doubles every 10C. For elevated-temperature or automotive applications, Igss must be verified at maximum operating temperature, not just 25C.',
      sortOrder: 10,
    },

    // ============================================================
    // FREQUENCY & CAPACITANCE
    // ============================================================
    {
      attributeId: 'ft',
      attributeName: 'Unity-Gain Frequency ft',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Primary frequency specification for RF LNA and VHF/UHF amplifier applications. ft = gm / (2pi × Cgs) — must be well above operating frequency for useful gain and low NF. Noise figure rises sharply as frequency approaches ft. Irrelevant for audio and low-frequency applications.',
      sortOrder: 11,
    },
    {
      attributeId: 'ciss',
      attributeName: 'Input Capacitance Ciss (Cgs + Cgd)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Limits input bandwidth and determines gate drive requirements for RF and high-frequency applications. In low-noise amplifiers, forms part of input matching network: Rs(opt) = 1/(2pi × f × Ciss × Rn). Typical audio JFETs: 5-20pF — corner frequency well above 20kHz, so rarely binding for audio or low-frequency applications.',
      sortOrder: 12,
    },
    {
      attributeId: 'crss',
      attributeName: 'Reverse Transfer Capacitance Crss (Cgd)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Primary bandwidth-limiting element in common-source amplifiers via Miller effect: Cin(Miller) = Crss × (1 + |Av|). A gain-of-10 amplifier with 1pF Crss sees 11pF effective input capacitance. Can cause oscillation at RF frequencies without proper neutralization. Cascode topologies shield Crss. Negligible concern for audio below 100kHz.',
      sortOrder: 13,
    },

    // ============================================================
    // THERMAL & MECHANICAL
    // ============================================================
    {
      attributeId: 'pd_max',
      attributeName: 'Maximum Power Dissipation',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 4,
      engineeringReason: 'Typical: 200-500mW (TO-92), 150-300mW (SOT-23), 1-2W (TO-18). Rarely binding in small-signal amplifier applications where quiescent dissipation is well below the limit. Exceptions: high-supply-voltage audio (±24V+), JFET as constant-current source, or JFET as voltage-variable resistor (VVR) / electronic attenuator.',
      sortOrder: 14,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 4,
      engineeringReason: 'Typical: 125C to 150C. The more relevant concern is temperature coefficients — Vp shifts ~+2mV/C (affecting bias point), Idss decreases 30-50% from 25C to 125C (affecting gain), and Igss doubles per 10C (critical for high-impedance applications at elevated temperature).',
      sortOrder: 15,
    },

    // ============================================================
    // QUALIFICATION & SPECIAL FLAGS
    // ============================================================
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Automotive Qualification',
      logicType: 'identity_flag',
      weight: 5,
      engineeringReason: 'If the original is AEC-Q101 qualified, the replacement must also be AEC-Q101 qualified. Automotive JFET applications include wheel speed sensor interfaces, pressure sensor front ends, and precision instrumentation. Temperature requirement: -40C to +125C. Must verify Igss at 125C and Vp/Idss temperature stability for bias circuit robustness.',
      sortOrder: 16,
    },
    {
      attributeId: 'matched_pair_review',
      attributeName: 'Matched Pair Suitability',
      logicType: 'application_review',
      weight: 0,
      engineeringReason: 'Matched-pair JFETs are required for differential applications (instrumentation amplifiers, balanced microphone preamplifiers). Single-device substitution rules are insufficient — must match Vp and Idss tightly between two devices. When context Q2 indicates matched-pair requirement, this rule is escalated to flag for mandatory engineering review.',
      sortOrder: 17,
    },
  ],
};
