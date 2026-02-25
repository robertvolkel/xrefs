import { LogicTable } from '../types';

/**
 * Thyristors / TRIACs / SCRs
 * Block B: Discrete Semiconductors — Family B8
 *
 * Derived from: docs/thyristor_logic_b8.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * Sub-types: SCR (Silicon Controlled Rectifier), TRIAC (Triode AC Switch),
 *            DIAC (Diode AC Switch)
 *
 * Key differences from MOSFETs/IGBTs:
 * - LATCHING BEHAVIOR — once triggered, a thyristor stays on regardless of
 *   the gate signal, until main terminal current drops below holding current
 *   (IH). You cannot turn a thyristor off by removing the gate drive. This
 *   creates constraints that have no equivalent in transistor-family devices.
 * - Device sub-type (SCR/TRIAC/DIAC) is the first Identity gate. No
 *   substitution across sub-types without circuit redesign.
 * - Quadrant operation is TRIAC-only — suppressed via context Q1 for SCR/DIAC.
 * - tq (circuit-commutated turn-off time) is SCR-only, relevant only for
 *   forced-commutation DC applications (crowbar, DC chopper).
 * - IT(AV) vs IT(RMS) — use the correct current metric per sub-type. SCRs
 *   use IT(AV) for DC/half-wave; TRIACs use IT(RMS) for AC. The param map
 *   routes each Digikey category to the same `on_state_current` attributeId.
 * - Snubberless rating is BLOCKING for designs without a snubber footprint.
 *   A standard TRIAC in a snubberless PCB will false-trigger from dV/dt.
 * - Gate sensitivity class determines whether the gate drive can fire the
 *   device at all — there is no partial triggering.
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification.
 *
 * Related families: MOSFETs (B5), IGBTs (B7) — share AC power control
 * applications; Varistors/MOVs (65) — share transient protection context.
 */
export const thyristorsLogicTable: LogicTable = {
  familyId: 'B8',
  familyName: 'Thyristors / TRIACs / SCRs',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for thyristor, TRIAC, and SCR replacement part validation',
  rules: [
    // ============================================================
    // IDENTITY — Sub-Type, Gate Class & Physical
    // ============================================================
    {
      attributeId: 'device_type',
      attributeName: 'Device Sub-Type (SCR / TRIAC / DIAC)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'SCR (unidirectional), TRIAC (bidirectional), and DIAC (two-terminal, no gate) are distinct topologies. SCR conducts anode-to-cathode only, triggered by positive gate pulse. TRIAC conducts both directions, equivalent to two anti-parallel SCRs. DIAC is a gateless trigger device. Substituting across sub-types requires circuit redesign — never interchangeable.',
      sortOrder: 1,
    },
    {
      attributeId: 'gate_sensitivity',
      attributeName: 'Gate Sensitivity Class (Standard / Sensitive / Logic-Level)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Sensitive-gate and logic-level types require significantly lower IGT (3-10mA vs 25-100mA standard). A circuit designed around a sensitive-gate TRIAC driven by a MOC3023 optocoupler (5mA drive) will not reliably trigger a standard-gate replacement whose IGT may be 50mA. Conversely, a sensitive-gate replacement for a standard-gate original is generally safe but more susceptible to noise-induced false triggering.',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Thyristor and TRIAC packages do NOT have universally standardized pin ordering. In TO-220, the tab is typically MT2 or Anode but gate and other terminal ordering varies by manufacturer. In TO-92, pin ordering varies significantly. Installing with gate and main terminal swapped will either fail to trigger or damage the gate drive circuit. Always verify terminal assignments from the specific datasheet.',
      sortOrder: 3,
    },

    // ============================================================
    // VOLTAGE RATINGS
    // ============================================================
    {
      attributeId: 'vdrm',
      attributeName: 'Peak Repetitive Off-State Voltage (VDRM / VRRM)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Maximum voltage the device can block in the off state without unintended conduction. For 120V AC: minimum VDRM = 400V (600V preferred). For 230V AC: minimum VDRM = 600V (800V preferred). A replacement with lower VDRM will experience nuisance triggering or breakdown during voltage transients.',
      sortOrder: 4,
    },
    {
      attributeId: 'vdsm',
      attributeName: 'Non-Repetitive Peak Off-State Voltage (VDSM / VRSM)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'Maximum single-event voltage spike the device can withstand (typically VDRM x 1.1-1.2, pulse width 1-10ms). Covers occasional transient spikes from inductive loads, startup transients. If replacement VDSM is lower, infrequent fault conditions may trigger voltage breakdown — easily missed in normal testing.',
      sortOrder: 5,
    },

    // ============================================================
    // CURRENT RATINGS
    // ============================================================
    {
      attributeId: 'on_state_current',
      attributeName: 'On-State Current (IT(RMS) for TRIAC / IT(AV) for SCR)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'IT(RMS) is used for TRIACs in AC applications (sinusoidal current both directions). IT(AV) is used for SCRs in DC or half-wave circuits (non-sinusoidal conduction). These metrics are NOT interchangeable: an SCR rated IT(AV)=10A carries ~15.7A RMS for a half-sine waveform. The Digikey param map routes each sub-type category to the correct metric under this shared attributeId.',
      sortOrder: 6,
    },
    {
      attributeId: 'itsm',
      attributeName: 'Non-Repetitive Surge Current (ITSM)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Peak current the thyristor can survive for a single half-cycle (8.3ms at 60Hz, 10ms at 50Hz). Critical for capacitive inrush at power-on, motor start-up currents (6-10x rated), and fault current survivability. A replacement with insufficient ITSM may be destroyed by the first power-on event.',
      sortOrder: 7,
    },
    {
      attributeId: 'i2t',
      attributeName: 'Surge Current Integral (I²t) for Fuse Coordination',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Defines how much current-time product the thyristor can absorb during a surge. Enables fuse coordination: the protecting fuse I²t clearing characteristic must be lower than the thyristor I²t. If replacement has lower I²t, the existing fuse may allow enough energy through during a fault to destroy it before the fuse clears.',
      sortOrder: 8,
    },

    // ============================================================
    // GATE TRIGGER PARAMETERS
    // ============================================================
    {
      attributeId: 'igt',
      attributeName: 'Gate Trigger Current (IGT)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Minimum gate current to trigger from off to on state. The gate drive (RC network, optocoupler, microcontroller GPIO) must supply at least IGT under all conditions. IGT increases at low temperature (2-3x at -40°C) — verify at minimum ambient, not just 25°C. For optocoupler-driven TRIACs, the phototriac output must exceed IGT(max) at minimum temperature.',
      sortOrder: 9,
    },
    {
      attributeId: 'vgt',
      attributeName: 'Gate Trigger Voltage (VGT)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Gate-cathode (SCR) or gate-MT1 (TRIAC) voltage at triggering. Vgate_drive = IGT x Rgate + VGT. If replacement requires higher VGT, the effective gate drive voltage after resistor drop may be insufficient, especially in optocoupler-isolated or low-voltage logic-driven circuits with limited headroom.',
      sortOrder: 10,
    },
    {
      attributeId: 'ih',
      attributeName: 'Holding Current (IH)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Minimum on-state current to REMAIN latched. If load current drops below IH, the device commutates off even in mid-conduction. A replacement with higher IH will drop out under light-load conditions (LED lighting, minimum firing angle phase control, AC zero-cross switching). This is the fundamental latching property — extremely difficult to debug in the field.',
      sortOrder: 11,
    },
    {
      attributeId: 'il',
      attributeName: 'Latching Current (IL)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Minimum current that must flow immediately after gate trigger for the device to latch. IL > IH always. A replacement with higher IL will fail to latch with inductive loads that limit di/dt — current may not reach IL before the gate pulse ends. Extended or continuous gate drive is used for inductive loads, but if IL is too high, even continuous drive may not help.',
      sortOrder: 12,
    },

    // ============================================================
    // SWITCHING PARAMETERS (dV/dt, di/dt, Timing)
    // ============================================================
    {
      attributeId: 'dv_dt',
      attributeName: 'Critical Rate of Rise of Off-State Voltage (dV/dt)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Rate of voltage rise the device can withstand without false triggering (static dV/dt turn-on). When fast voltage transients are applied, displacement current through junction capacitance injects into the gate region. Snubberless TRIACs have high dV/dt immunity (500-1000V/us). Standard types require RC snubbers. Lower dV/dt in replacement → false triggering from line transients.',
      sortOrder: 13,
    },
    {
      attributeId: 'di_dt',
      attributeName: 'Critical Rate of Rise of On-State Current (di/dt)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Maximum rate of current rise at turn-on. Conduction begins in a small area around the gate and must spread across the full die. If current rises faster than di/dt, localized current density creates a hotspot that melts the silicon — destruction in a single cycle. Worst case: capacitive loads where di/dt = dV/dt x C. Series inductance limits di/dt in practice.',
      sortOrder: 14,
    },
    {
      attributeId: 'tgt',
      attributeName: 'Gate-Triggered Turn-On Time (tgt)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 4,
      engineeringReason: 'Interval from gate trigger pulse to main terminal current reaching 90% of on-state value. In most AC phase-control applications (dimmers, heaters), tgt is 1-5us typical, far shorter than the AC half-cycle (8.3-10ms) — rarely the binding constraint. Only critical in high-precision firing angle control or high-frequency SCR chopper circuits.',
      sortOrder: 15,
    },
    {
      attributeId: 'tq',
      attributeName: 'Circuit-Commutated Turn-Off Time (tq) — SCR Only',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'SCR ONLY. Minimum time the SCR must be reverse-biased before it can block forward voltage again. In forced-commutation circuits (DC drives, inverters), tq limits switching frequency: f_max = 1/(2 x tq). Fast SCRs: 5-30us; standard SCRs: 50-200us. Not applicable to TRIACs (natural AC commutation) or DIACs. Substituting a longer tq SCR causes commutation failure (re-triggering, shoot-through).',
      sortOrder: 16,
    },

    // ============================================================
    // TRIAC-SPECIFIC PARAMETERS
    // ============================================================
    {
      attributeId: 'quadrant_operation',
      attributeName: 'Quadrant Operation (TRIAC Only: I+, I-, III+, III-)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'TRIAC ONLY. Four triggering quadrants define MT2 polarity and gate current direction combinations. Quadrant III+ (MT2 negative, gate positive) is typically least sensitive — 2-3x more IGT than other quadrants, some TRIACs do not support it at all. If replacement has poor Q4 sensitivity, it triggers asymmetrically: full-wave becomes half-wave control, causing 50% less output, visible flicker, and audible hum.',
      sortOrder: 17,
    },
    {
      attributeId: 'snubberless',
      attributeName: 'Snubberless Rating (TRIAC Only)',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'TRIAC ONLY. Snubberless TRIACs have high static dV/dt immunity (500-1000V/us) and do not require RC snubber networks. In PCB designs optimized for snubberless operation, there is no snubber footprint — substituting a standard TRIAC causes random false triggering from line transients with no means to prevent it. BLOCKING when context Q3 = "no snubber" — escalated to mandatory with blockOnMissing.',
      sortOrder: 18,
    },

    // ============================================================
    // THERMAL
    // ============================================================
    {
      attributeId: 'rth_jc',
      attributeName: 'Junction-to-Case Thermal Resistance (Rth_jc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Primary thermal spec for heatsinkable thyristor packages. On-state dissipation: Pd = VT x IT(AV) for SCRs, VT x IT(RMS) for TRIACs (VT typically 1.0-1.5V). At 10A RMS, a TRIAC with VT=1.2V dissipates 12W — requiring a heatsink. Tj = Tc + Pd x Rth_jc. Higher Rth_jc in replacement means higher junction temperature for same power.',
      sortOrder: 19,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature (Tj Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 4,
      engineeringReason: 'Most thyristors rated 125°C; some high-power types rated 150°C. Operating above Tj(max) causes increased leakage current (raising IH, causing erratic commutation), accelerated oxide degradation, and eventual junction damage. In high-ambient industrial environments, the available thermal margin at rated load may be small.',
      sortOrder: 20,
    },

    // ============================================================
    // QUALIFICATION & PRODUCTION
    // ============================================================
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 3,
      engineeringReason: 'AEC-Q101 for thyristors covers HTOL, temperature cycling, humidity testing, plus device-specific gate trigger stability, IGT/VGT drift over temperature and lifetime, and VDRM retention. Automotive thyristor applications include body electronics, HVAC control, battery management switching. Temperature range -40°C to +125°C minimum — cold-start IGT reliability is a known field failure source.',
      sortOrder: 21,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Tray)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Small-signal SCRs and TRIACs in SOT-223 or TO-92-equivalent SMD packages on tape/reel for automated SMT. Power types in TO-220, TO-218, TO-247 in tubes/trays. Some power devices in isolated packages (TO-220F with fully isolated tab) — a non-isolated replacement in an isolated-tab footprint creates a ground fault through the heatsink.',
      sortOrder: 22,
    },
  ],
};
