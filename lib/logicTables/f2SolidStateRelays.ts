import { LogicTable } from '../types';

/**
 * Solid State Relays — SSR (Family F2)
 * Block F: Relays — Family F2
 *
 * Derived from: docs/f2_ssr_logic.docx
 * 23 attributes with specific matching rules for cross-reference validation.
 *
 * Family F2 covers solid state relays (SSRs): semiconductor switching devices with
 * input-output isolation in a relay form factor. Three output types: TRIAC-output
 * (AC loads), back-to-back SCR-output (AC loads), and MOSFET-output (DC loads).
 * Available in PCB-mount, panel-mount, and DIN-rail form factors.
 *
 * F2 does NOT cover: electromechanical relays (Family F1 — coil and moving contacts),
 * optocouplers (Family E1 — isolation but transistor output only, no power switching),
 * gate driver optocouplers (E1 scope), motor drives/inverters (power electronics with
 * modulation — out of scope), discrete TRIACs/SCRs in TO-220/TO-92 packages (Family
 * B8 Thyristors — not an SSR, requires separate gate drive circuit).
 *
 * Key substitution pitfalls:
 * - output_switch_type is IDENTITY — HARD GATE. TRIAC/SCR-output requires AC load
 *   current zero-crossing for turn-off commutation. On a DC load, the TRIAC latches
 *   into permanent conduction with no turn-off mechanism — this is a permanent fault,
 *   not a degraded condition. MOSFET-output is not rated for bidirectional AC current.
 *   Cross-type substitution is BLOCKED unconditionally.
 * - firing_mode is IDENTITY — Zero-crossing (ZC) synchronises turn-on to AC voltage
 *   zero, eliminating inrush current spikes and EMI, but adds up to one half-cycle
 *   latency (8.3ms at 60Hz, 10ms at 50Hz). Random-fire (RF) turns on immediately,
 *   enabling phase-angle power control but generating significant inrush. Not
 *   interchangeable in inrush-sensitive or proportional-control applications.
 * - load_voltage_max_v and load_current_max_a are safety-critical minimum thresholds.
 *   For AC loads, verify peak voltage (Vpeak = Vrms × √2). Thermal derating applies:
 *   a 25A-rated SSR may be limited to 12A at 50°C ambient without heatsinking.
 * - load_current_min_a is a hidden TRIAC failure mode — below the holding current
 *   threshold, the TRIAC de-latches prematurely, causing erratic switching on LED
 *   lamps, low-wattage heaters, and other low-current loads.
 * - off_state_leakage_ma from the internal RC snubber network (1–10mA at mains
 *   voltage) can partially energise sensitive loads in the off state.
 * - input_voltage_range_v must fully contain the control voltage — not overlap.
 * - on_state_voltage_drop_v determines power dissipation (Pdiss = Vdrop × Iload)
 *   and heatsink adequacy. Higher Vdrop = undersized existing heatsink.
 * - No AEC-Q standard applies to SSRs (not Q100/Q101/Q200).
 *
 * Related families: F1 (Electromechanical Relays — EMR), E1 (Optocouplers),
 * B8 (Thyristors — discrete TRIAC/SCR/DIAC components).
 */
export const f2SolidStateRelayLogicTable: LogicTable = {
  familyId: 'F2',
  familyName: 'Solid State Relays (SSR)',
  category: 'Relays',
  description:
    'Hard logic filters for SSR replacement validation. output_switch_type (w10 identity blockOnMissing) is the HARD GATE — TRIAC/SCR latches on DC loads (no zero-crossing for turn-off), MOSFET not rated for AC. Cross-type BLOCKED unconditionally. firing_mode (w9 identity blockOnMissing) is a HARD GATE — zero-crossing vs random-fire are not interchangeable. load_voltage_max_v and load_current_max_a (w10 threshold gte blockOnMissing) are safety-critical minimums with thermal derating. input_voltage_range_v (w9 threshold superset blockOnMissing) — control range must contain actual voltage. No AEC-Q standard applies.',
  rules: [
    // ── SECTION 1: OUTPUT CONFIGURATION — HARD GATES ────────────────────

    {
      attributeId: 'output_switch_type',
      attributeName: 'Output Switch Type',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — HARD GATE. TRIAC/SCR-output and MOSFET-output are physically incompatible with each other\'s load type. A TRIAC requires AC load current zero-crossing for turn-off commutation. On a DC load, there is no zero-crossing — once triggered, the TRIAC latches into permanent full conduction and cannot be turned off by removing the gate signal. This is not a degraded condition; it is a permanent fault cleared only by removing load supply. Conversely, a MOSFET-output SSR is not designed for bidirectional AC current flow and will fail on AC loads. Cross-type substitution is BLOCKED unconditionally.',
      sortOrder: 1,
    },
    {
      attributeId: 'firing_mode',
      attributeName: 'Firing Mode',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — HARD GATE for inrush-sensitive and proportional-control applications. Zero-crossing (ZC) SSRs synchronise turn-on to the AC load voltage zero-crossing, eliminating the large current spike when a low-impedance load is energised at the voltage peak, and suppressing conducted and radiated EMI. The cost is a turn-on latency of up to one half-cycle (8.3ms at 60Hz, 10ms at 50Hz). Random-fire (RF) SSRs turn on immediately upon input signal, enabling phase-angle power control (lamp dimming, proportional heating) but generating significant inrush current on capacitive and resistive loads. Not interchangeable in either direction without a documented engineering decision. Context Q3 (timing-critical/proportional) escalates: RF required, ZC BLOCKED.',
      sortOrder: 2,
    },
    {
      attributeId: 'mounting_type',
      attributeName: 'Mounting Type',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — PCB-mount, panel-mount, and DIN-rail mounting types are physically incompatible. A PCB SSR cannot be installed in a panel cutout. A panel-mount SSR requires a heatsink surface and mounting hardware not available on a PCB. DIN-rail SSRs require rail mounting infrastructure.',
      sortOrder: 3,
    },

    // ── SECTION 2: LOAD RATINGS — SAFETY-CRITICAL ──────────────────────

    {
      attributeId: 'load_voltage_type',
      attributeName: 'Load Voltage Type (AC/DC)',
      logicType: 'identity_flag',
      weight: 8,
      blockOnMissing: false,
      engineeringReason:
        'AC and DC load voltage types must match the load supply. A TRIAC-output SSR rated for AC loads will latch on DC (see output_switch_type). A MOSFET-output SSR rated for DC loads will fail on AC mains. This attribute cross-validates output_switch_type — AC load → TRIAC/SCR output, DC load → MOSFET output. Context Q1 (DC load) escalates to mandatory.',
      sortOrder: 4,
    },
    {
      attributeId: 'load_voltage_max_v',
      attributeName: 'Load Voltage Max (V)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      blockOnMissing: true,
      engineeringReason:
        'SAFETY-CRITICAL — Maximum rated load voltage. Replacement must be rated ≥ circuit load voltage. For AC loads: verify against peak voltage (Vpeak = Vrms × √2). For 230VAC, Vpeak = 325V; with supply tolerance and transients, 400V is the standard minimum rating, 600V provides additional margin. For 120VAC: 200V minimum, 250V standard. For DC loads: verify the DC voltage rating explicitly — AC and DC voltage ratings on SSRs are not interchangeable. BLOCKING if replacement rating is below circuit voltage.',
      sortOrder: 5,
    },
    {
      attributeId: 'load_current_max_a',
      attributeName: 'Load Current Max (A)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      blockOnMissing: true,
      engineeringReason:
        'SAFETY-CRITICAL — Maximum rated load current. Replacement must be ≥ original. The rated current is specified at a specific case temperature (typically 25°C or 40°C with a heatsink). As ambient temperature rises, on-state power dissipation (Pdiss = Vdrop × Iload) heats the junction. Standard derating curves reach zero rated current at approximately 70–80°C case temperature. A 25A-rated SSR running a 20A load at 50°C ambient without heatsinking will exceed its thermal limit and fail. Context Q2 (inductive) applies 1.5× derating. Context Q3 (high temp) requires thermal derating verification.',
      sortOrder: 6,
    },
    {
      attributeId: 'load_current_min_a',
      attributeName: 'Load Current Min (A)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Hidden reliability constraint for TRIAC-output SSRs. A TRIAC requires a minimum holding current after triggering to remain latched — if load current falls below this threshold during the load cycle (particularly near voltage zero-crossings), the TRIAC de-latches prematurely, causing flickering, erratic switching, or complete failure to maintain conduction. Affects: LED retrofit lamps (often <100mA), low-wattage heating elements at partial power, and any application where load current approaches the TRIAC holding current. Context Q2 (low-current) escalates to mandatory + blockOnMissing. Value must be read from datasheet — absent from Digikey parametric data.',
      sortOrder: 7,
    },
    {
      attributeId: 'off_state_leakage_ma',
      attributeName: 'Off-State Leakage (mA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Off-state output leakage caused by the internal RC snubber network present in most TRIAC-output SSRs. The snubber (typically 100Ω + 10–47nF in series across load terminals) passes 1–10mA continuously through the load even when the SSR is off. For most power loads this is negligible. It becomes a functional problem for: small indicator lamps (may glow faintly in off state), capacitive loads with bleed resistors, and sensitive electronic devices with very low quiescent current. Context Q2 (low-current/sensitive) escalates to mandatory + blockOnMissing. Value must be read from datasheet — absent from Digikey parametric data.',
      sortOrder: 8,
    },

    // ── SECTION 3: CONTROL INPUT ────────────────────────────────────────

    {
      attributeId: 'input_voltage_range_v',
      attributeName: 'Input Voltage Range (V)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 9,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — Control input voltage range must fully contain the actual control voltage — not merely overlap. Universal-input SSRs typically accept 3–32VDC, covering 5V, 12V, and 24V PLC/microcontroller outputs. Fixed-input SSRs (e.g. 4–6VDC, 10–14VDC, 20–28VDC) are designed for a specific control voltage family. A 5V GPIO driving a 10–14VDC input SSR will not reliably trigger; a 24V PLC output driving a 4–6VDC input SSR will damage the input LED. Replacement input range must be a superset of the original.',
      sortOrder: 9,
    },
    {
      attributeId: 'input_current_ma',
      attributeName: 'Input Current (mA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Control input current at rated voltage. Replacement must draw ≤ original to avoid exceeding the drive source current capability. Most SSR inputs are optically isolated LED inputs drawing 5–25mA. If the replacement draws more current, the drive circuit (GPIO pin, PLC output, relay contact) may not supply sufficient current for reliable turn-on.',
      sortOrder: 10,
    },
    {
      attributeId: 'input_impedance_ohm',
      attributeName: 'Input Impedance (Ω)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      blockOnMissing: false,
      engineeringReason:
        'Control input impedance. Lower impedance draws more current from the drive source. Application Review when impedance decreases significantly, as the drive circuit may not supply the additional current. Less critical than input_current_ma because current is the direct constraint.',
      sortOrder: 11,
    },

    // ── SECTION 4: SWITCHING PERFORMANCE ─────────────────────────────────

    {
      attributeId: 'turn_on_time_ms',
      attributeName: 'Turn-On Time (ms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Time from input signal assertion to load conduction. For zero-crossing SSRs, includes the wait time to the next AC voltage zero-crossing (up to one half-cycle: 8.3ms at 60Hz, 10ms at 50Hz). For random-fire SSRs, typically <1ms. Replacement must be ≤ original for timing-critical applications. Context Q3 (timing-critical/proportional) escalates to mandatory + blockOnMissing.',
      sortOrder: 12,
    },
    {
      attributeId: 'turn_off_time_ms',
      attributeName: 'Turn-Off Time (ms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Time from input signal removal to load cessation. For AC TRIAC-output SSRs, the TRIAC remains conducting until the next load current zero-crossing — up to one full cycle (16.7ms at 60Hz, 20ms at 50Hz). For DC MOSFET-output SSRs, typically <1ms. Replacement must be ≤ original for timing-critical applications. Context Q3 (timing-critical) escalates to mandatory + blockOnMissing.',
      sortOrder: 13,
    },
    {
      attributeId: 'dv_dt_rating_v_us',
      attributeName: 'dV/dt Rating (V/µs)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Critical rate of voltage rise across the output terminals without spurious turn-on. If the load voltage rises faster than the dV/dt rating (from mains transients, motor back-EMF, or supply switching), the SSR can false-trigger. Replacement must be ≥ original. Context Q4 (industrial/harsh environment) escalates to mandatory.',
      sortOrder: 14,
    },
    {
      attributeId: 'di_dt_rating_a_us',
      attributeName: 'dI/dt Rating (A/µs)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Critical rate of current rise at turn-on. Capacitive and lamp loads (LED drivers, fluorescent, capacitor banks) draw very high inrush current that rises rapidly. If the dI/dt exceeds the SSR rating, localised junction overheating causes semiconductor damage. Replacement must be ≥ original. Context Q2 (capacitive/lamp load) escalates to mandatory + blockOnMissing.',
      sortOrder: 15,
    },
    {
      attributeId: 'on_state_voltage_drop_v',
      attributeName: 'On-State Voltage Drop (V)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Output terminal voltage drop at rated current. Determines power dissipation: Pdiss = Vdrop × Iload. For a 25A load at 1.6V drop: Pdiss = 40W — requiring a substantial heatsink. If the replacement has a higher Vdrop (e.g. 1.6V vs 1.2V), the existing heatsink is undersized: Pdiss increases by 33%, junction temperature rises, and the SSR may fail or require derating to a lower current. Replacement Vdrop must be ≤ original. Context Q3 (high temp) escalates to primary. Absent from Digikey parametric — datasheet only.',
      sortOrder: 16,
    },
    {
      attributeId: 'thermal_resistance_jc',
      attributeName: 'Thermal Resistance Junction-to-Case (°C/W)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Junction-to-case thermal resistance. Determines the SSR\'s thermal derating curve and the adequacy of the existing heatsink. Replacement must be ≤ original. When Q3 = high ambient temperature: verify derated current at operating ambient ≥ load current using: Tj = Ta + (Rth_jc + Rth_cs) × (Vdrop × Iload) ≤ Tjmax. Context Q3 (high temp) escalates to mandatory + blockOnMissing. Absent from Digikey parametric — datasheet only.',
      sortOrder: 17,
    },

    // ── SECTION 5: PROTECTION, ISOLATION & PHYSICAL ─────────────────────

    {
      attributeId: 'built_in_snubber',
      attributeName: 'Built-in Snubber',
      logicType: 'identity_flag',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Internal RC snubber network across the output terminals for dV/dt protection. An SSR with a built-in snubber does not require an external RC network; if the replacement lacks one, the external circuit must provide dV/dt protection. Note: the snubber is also the source of off-state leakage current — removing it eliminates leakage but may expose the SSR to dV/dt false triggering. Application Review whenever snubber presence changes between original and replacement. Context Q4 (industrial/harsh) escalates to primary.',
      sortOrder: 18,
    },
    {
      attributeId: 'built_in_varistor',
      attributeName: 'Built-in Varistor (MOV/TVS)',
      logicType: 'identity_flag',
      weight: 5,
      blockOnMissing: false,
      engineeringReason:
        'Internal MOV or TVS on the load terminals for overvoltage spike protection. If the replacement lacks this and the application has significant transient energy (inductive load switch-off, lightning coupling, motor back-EMF), the replacement SSR will fail from overvoltage. Application Review whenever varistor presence changes — if original had built-in varistor and replacement does not, external TVS/MOV required on load terminals. Context Q4 (industrial/harsh) escalates to primary.',
      sortOrder: 19,
    },
    {
      attributeId: 'isolation_voltage_vrms',
      attributeName: 'Isolation Voltage (Vrms)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      blockOnMissing: false,
      engineeringReason:
        'Input-to-output galvanic isolation voltage. Replacement must be ≥ original — never downgrade isolation. Standard industrial SSRs provide 4000Vrms minimum. For UL508 industrial control panels and IEC 62314 applications, the isolation voltage is part of the safety listing. A part with higher isolation voltage but no specific certification mark cannot substitute for a listed part. Context Q1 (AC safety-certified) escalates to mandatory + blockOnMissing. Context Q4 (industrial/harsh) escalates to primary.',
      sortOrder: 20,
    },
    {
      attributeId: 'safety_certification',
      attributeName: 'Safety Certification',
      logicType: 'identity_flag',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Safety listing marks: UL508 (industrial control equipment), IEC 62314, VDE, CSA. These are per-part listings, not class-based — a part with higher isolation but no UL508 listing cannot substitute for a UL508-listed part in a UL-listed panel. The listing applies to the specific tested component. Context Q1 (AC safety-certified) escalates to mandatory + blockOnMissing. Certification marks must be read from datasheet — sometimes in Digikey descriptions but not a filterable parametric field.',
      sortOrder: 21,
    },
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason:
        'Replacement temperature range must fully cover the application operating range. SSR current rating derating begins at 25–40°C case temperature (significantly earlier than EMR derating). At elevated ambient, the derated current may be substantially lower than the nameplate rating. Verify derated current ≥ load current at the application maximum ambient temperature.',
      sortOrder: 22,
    },
    {
      attributeId: 'package_footprint',
      attributeName: 'Package Footprint',
      logicType: 'identity_flag',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'PCB footprint, panel cutout dimensions, or DIN-rail pitch. Many SSR manufacturers use standard industry outlines that are interchangeable within the standard (e.g. hockey-puck panel-mount, 22.5mm/45mm DIN-rail modules). A footprint mismatch prevents physical drop-in replacement. Escalated to mandatory for confirmed drop-in replacement requirements.',
      sortOrder: 23,
    },
  ],
};
