import { LogicTable } from '../types';

/**
 * Bipolar Junction Transistors — NPN & PNP
 * Block B: Discrete Semiconductors — Family B6
 *
 * Derived from: docs/bjt_logic_b6.docx
 * 18 attributes with specific matching rules for cross-reference validation.
 *
 * Key differences from MOSFETs (B5):
 * - Polarity (NPN/PNP) is a hard Identity gate — no cross-polarity substitution.
 *   BJT polarity determines circuit topology and supply rail orientation.
 * - hFE (DC current gain) is Application Review — NOT a simple threshold.
 *   hFE varies with Ic, temperature, and lot. Must verify hFE(min) at the
 *   actual operating Ic against the base drive overdrive ratio.
 * - Storage time (tst) is Threshold ≤ — the unique BJT switching liability.
 *   When saturated, removing base drive does nothing for the duration of tst.
 *   BLOCKING at >100kHz via context modifier (blockOnMissing).
 * - Vce(sat) vs. storage time is THE fundamental BJT trade-off:
 *   deeper saturation → lower Vce(sat) → more stored charge → longer tst.
 * - SOA (Safe Operating Area) includes Second Breakdown (S/B) — a BJT-specific
 *   thermal runaway mode not present in MOSFETs. Critical for linear mode.
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification.
 *
 * Related families: MOSFETs (B5) — share SOA concepts and switching topology
 * considerations; IGBTs (B7) — share gain-driven base drive concepts.
 *
 * Fundamental trade-off: Vce(sat) × Storage Time ≈ constant within a technology.
 * Lower Vce(sat) (deep saturation) → longer storage time → slower switching.
 * Anti-saturation techniques (Schottky/Baker clamp) mitigate this trade-off.
 */
export const bjtTransistorsLogicTable: LogicTable = {
  familyId: 'B6',
  familyName: 'BJTs — NPN & PNP',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for BJT replacement part validation',
  rules: [
    // ============================================================
    // IDENTITY — Polarity & Physical
    // ============================================================
    {
      attributeId: 'polarity',
      attributeName: 'Polarity (NPN / PNP)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'First gate — NPN and PNP are fundamentally different circuit topologies. NPN transistors are ON when the base is driven positive relative to the emitter (low-side switching). PNP transistors are ON when the base is driven negative relative to the emitter (high-side switching, complementary push-pull). Swapping polarity requires redesigning the biasing network, inverting the base drive signal, and rerouting supply connections. There is no drop-in substitution across polarities.',
      sortOrder: 1,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'BJT pin ordering is NOT universally standardized, even within named packages. In TO-92, pin ordering varies by manufacturer: some use E-B-C, others C-B-E. In SOT-23, the collector, base, and emitter assignments vary across suppliers. Installing a BJT with base and collector swapped results in reverse active mode — partially functional but with drastically reduced gain, making the failure mode intermittent and difficult to diagnose. Always verify pin assignment from the specific manufacturer datasheet.',
      sortOrder: 2,
    },

    // ============================================================
    // VOLTAGE RATINGS
    // ============================================================
    {
      attributeId: 'vceo_max',
      attributeName: 'Vceo Max (Collector-Emitter Voltage, open base)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Vceo is the breakdown voltage from collector to emitter with the base open-circuited — the most conservative and most commonly cited voltage rating. In switching circuits, when the BJT turns off, the collector swings to the supply rail or higher (inductive loads). For inductive loads (relay coils, motor windings, solenoids), collector voltage spikes above supply during turn-off. Vceo must include adequate margin above supply voltage even with freewheeling diode protection.',
      sortOrder: 3,
    },
    {
      attributeId: 'vces_max',
      attributeName: 'Vces Max (Collector-Emitter Voltage, shorted base)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Vces is the breakdown voltage from collector to emitter with the base shorted to emitter (Vbe = 0). Vces is always higher than Vceo — typically 20-50% higher — because shorting the base suppresses minority carrier injection. Circuits with a base pull-down resistor (standard switching practice) operate in the Vces condition during off state. A part with Vceo = 40V and Vces = 60V may safely replace one rated Vceo = 45V if the circuit has a base pull-down. Verify which condition applies to the original circuit.',
      sortOrder: 4,
    },
    {
      attributeId: 'vce_sat',
      attributeName: 'Vce(sat) Max (Collector-Emitter Saturation Voltage)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Vce(sat) is the voltage drop across the transistor when fully saturated — the BJT equivalent of Rds(on) x Id in a MOSFET. Conduction power loss = Ic x Vce(sat). CRITICAL: Vce(sat) has a strong inverse relationship with switching speed — devices designed for very low Vce(sat) store more charge, leading to longer storage times and slower turn-off. Vce(sat) is specified at a particular Ic and Ib pair (or forced hFE = Ic/Ib). A comparison is only valid at the same forced hFE.',
      sortOrder: 5,
    },
    {
      attributeId: 'vbe_sat',
      attributeName: 'Vbe(sat) Max (Base-Emitter Saturation Voltage)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Vbe(sat) is the base-emitter voltage in saturation (approximately 0.7-1.1V for silicon BJTs). Matters primarily for base drive circuit design: Ib = (Vdrive - Vbe(sat)) / Rb. If the replacement has significantly higher Vbe(sat), the base drive circuit may supply insufficient current to saturate the transistor. In microcontroller-driven stages (3.3V or 5V IO), even a 200mV difference in Vbe(sat) can meaningfully affect base drive overdrive. Vbe(sat) decreases ~2mV/°C with rising temperature.',
      sortOrder: 6,
    },

    // ============================================================
    // GAIN & FREQUENCY
    // ============================================================
    {
      attributeId: 'hfe',
      attributeName: 'DC Current Gain (hFE)',
      logicType: 'application_review',
      weight: 8,
      engineeringReason: 'Do NOT simply match nominal hFE — it is one of the most widely misused BJT specifications. hFE is NOT a fixed number: (1) It varies significantly with collector current — typically peaking at intermediate Ic and falling at both extremes. (2) It varies with temperature — generally increasing, which can cause thermal runaway in poorly designed bias networks. (3) It has wide manufacturing spread — min/max ratios of 3:1 or wider are common. (4) In switching applications, only hFE(min) matters — design must saturate at worst-case gain. Verify: Ib(available) x hFE(min) >= Ic(max) at the actual operating Ic and temperature. Evaluate the hFE vs. Ic curve shape, not a single datasheet number.',
      sortOrder: 7,
    },
    {
      attributeId: 'ft',
      attributeName: 'Transition Frequency (ft)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'ft is the unity-gain transition frequency — the frequency at which current gain drops to 1. In switching applications, ft determines maximum practical switching frequency and transition times (ton, toff inversely related to ft). In RF and analog applications, ft determines useful frequency range. A replacement with significantly lower ft will exhibit slower switching edges, lower bandwidth, and higher storage time at turn-off. Note: ft is measured in forward-active region — not directly applicable to saturation operation where storage time is the limiting factor.',
      sortOrder: 8,
    },

    // ============================================================
    // SWITCHING TIMES (Saturated BJT Switching)
    // ============================================================
    {
      attributeId: 'tst',
      attributeName: 'Storage Time (tst)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Storage time is the most distinctive and problematic switching parameter of BJTs — it has NO MOSFET equivalent. When a saturated BJT base drive is removed, the collector remains fully on for the entire duration of storage time while stored minority carriers are swept out. Effects: (1) Limits maximum switching frequency — tst must fit within off period. (2) Causes duty cycle distortion — actual turn-off occurs later than control signal commands. (3) Increases power dissipation. (4) Temperature-dependent — worsens with heat. At >100kHz switching, tst is CRITICAL and likely the binding constraint. BLOCKING if not specified in replacement at high frequency.',
      sortOrder: 9,
    },
    {
      attributeId: 'ton',
      attributeName: 'Turn-On Time (ton)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Turn-on time is the total time from application of base drive to when Ic reaches 90% of final value. Consists of delay time (td) while Cbe charges to Vbe(on), plus rise time (tr) while Ic rises from 10% to 90%. Rise time is inversely proportional to base overdrive ratio. In most saturated switching designs, ton is less critical than storage time — but in high-frequency or precise timing circuits, ton matters for duty cycle accuracy and power loss during current/voltage overlap.',
      sortOrder: 10,
    },
    {
      attributeId: 'toff',
      attributeName: 'Turn-Off Time (toff)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Turn-off time is the total time from removal of base drive to when Ic falls to 10% of on-state value. toff = storage time (tst) + fall time (tf). Since tst dominates toff in saturated designs, reducing toff means primarily reducing tst. Applying a brief negative base pulse at turn-off dramatically reduces both tst and tf by actively sweeping out stored minority carriers.',
      sortOrder: 11,
    },

    // ============================================================
    // THERMAL, POWER & SOA
    // ============================================================
    {
      attributeId: 'ic_max',
      attributeName: 'Continuous Collector Current (Ic Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'Ic(max) is the maximum rated continuous collector current, set by bond wire and metallization current-handling capability. CRITICAL: hFE degrades significantly at Ic near Ic(max) — a transistor with hFE of 200 at 10mA may have hFE of only 50 at its rated Ic(max). When evaluating replacements, verify hFE at the ACTUAL operating Ic (not the headline test current), and verify the replacement hFE curve shape is similar to the original.',
      sortOrder: 12,
    },
    {
      attributeId: 'pd',
      attributeName: 'Power Dissipation (Pd Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Maximum power dissipation: Pd = Vce x Ic + Vbe x Ib ≈ Vce x Ic. For small-signal transistors (TO-92, SOT-23), Pd is typically 150-600mW at 25°C ambient. For power transistors (TO-220, TO-247), Pd can be 50-150W at Tc = 25°C. Always compute actual dissipation: Pd(actual) = Vce(sat) x Ic(on) x duty_cycle + (Vce x Ic x switching_time x fsw) and verify within the replacement derated Pd at the actual junction temperature.',
      sortOrder: 13,
    },
    {
      attributeId: 'rth_jc',
      attributeName: 'Junction-to-Case Thermal Resistance (Rθjc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Rθjc defines the thermal path from the silicon die to the case/tab. For power BJTs (TO-220, TO-247), Rθjc is the critical thermal specification — Tj = Ta + Pd x (Rθjc + Rθcs + Rθsa). A replacement with higher Rθjc runs hotter for the same power, potentially exceeding Tj(max). For small-signal BJTs (SOT-23, TO-92), Rθja is more relevant since these are rarely heatsinked. Lower Rθjc is always better.',
      sortOrder: 14,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature (Tj Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Most silicon BJTs are rated 150°C; some high-reliability or older types are rated 175°C or 200°C. Operating above Tj(max) causes accelerated oxide degradation, thermal runaway risk (as Vbe(on) decreases with temperature, drawing more current), and catastrophic junction failure. If the original design used a 175°C part, substituting a 150°C part reduces thermal safety margin and may cause failures in high-temperature environments.',
      sortOrder: 15,
    },
    {
      attributeId: 'soa',
      attributeName: 'Safe Operating Area (SOA Curves)',
      logicType: 'application_review',
      weight: 7,
      engineeringReason: 'BJTs have an additional SOA constraint not present in MOSFETs: Second Breakdown (S/B) — localized current concentration creates a thermal hotspot that can destroy the junction at power levels well below the apparent constant-power limit. The S/B limit appears as a steep slope on the SOA curve at high Vce. Required for: (1) Linear voltage regulators using pass transistors. (2) Class A and Class AB audio output stages. (3) Motor speed controllers in linear mode. (4) Any application where Vce > 20% of Vceo under load. Compare SOA curves graphically at the actual (Vce, Ic, pulse width) operating point.',
      sortOrder: 16,
    },

    // ============================================================
    // QUALIFICATION & PRODUCTION
    // ============================================================
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 (Automotive Qualification)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'AEC-Q101 covers stress qualification for discrete semiconductors in automotive applications, including HTOL, temperature cycling, and H3TRB. Automotive designs require manufacturer-level qualification — end-customer qualification of a non-AEC-Q101 part requires significant engineering deviation. Operating temperature range must cover -40°C to +125°C (or +150°C for underhood). Treat as a hard binary gate for any automotive BOM.',
      sortOrder: 17,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape/Reel, Tube, Ammo)',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Packaging format is a manufacturing logistics specification with no electrical impact. Through-hole BJTs (TO-92, TO-220) ship in tubes or ammo-pack tape. SMD BJTs (SOT-23, SOT-223) in tape/reel (typically 3,000 pcs on 8mm tape). For automated SMT assembly, reel quantity, tape width, and pocket size must match the pick-and-place feeder.',
      sortOrder: 18,
    },
  ],
};
