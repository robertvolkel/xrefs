import { LogicTable } from '../types';

/**
 * Logic ICs — 74-Series Standard Logic
 * Block C: Standard ICs — Family C5
 *
 * Derived from: docs/c5_logic_ic_logic.docx
 * 23 attributes with specific matching rules for cross-reference validation.
 *
 * Covers combinational logic (gates, buffers, inverters, MUX, decoders,
 * encoders) and sequential logic (flip-flops, latches, counters, shift
 * registers) across all active logic families: HC, HCT, AC, ACT, LVC,
 * AHC, AHCT, ALVC, AUP, VHC, VHCT, and legacy TTL (LS, ALS, AS, F).
 * Single-gate packages (SC70, SOT-23) included.
 *
 * Key substitution pitfalls:
 *
 * - Logic function (part number suffix) is a HARD GATE before any other
 *   evaluation. '04 ≠ '14 even though both are hex inverters — '14 has
 *   Schmitt trigger inputs. '373 ≠ '374 — latch vs. flip-flop. Never
 *   cross function codes.
 *
 * - HC vs. HCT is the single most common substitution error. TTL sources
 *   guarantee VOH_min = 2.4V. HC at 5V Vcc requires VIH_min = 3.5V.
 *   2.4V < 3.5V → input in undefined region. HCT requires VIH_min = 2.0V
 *   → acceptable. Context Q1 (TTL driving source) escalates VIH to
 *   BLOCKING when the source is TTL-output.
 *
 * - Mixed 3.3V/5V interfaces require two independent checks:
 *   (a) Input side: 5V signals at 3.3V supply requires 5V-tolerant inputs
 *       (LVC family). Non-tolerant devices are BLOCKED.
 *   (b) Output side: 3.3V CMOS output (VOH ~3.3V) driving 5V HC input
 *       (VIH = 3.5V) fails — only TTL-threshold receivers (HCT, ACT at
 *       5V supply) can accept 3.3V output. Context Q2 escalates these.
 *
 * - Output type and OE polarity mismatches are BLOCKING for bus
 *   applications. Open-drain replacing totem-pole on a shared bus:
 *   wired-AND topology mismatch. Totem-pole replacing open-drain:
 *   bus-contention risk. OE polarity inversion: permanently enabled or
 *   permanently disabled. Context Q3 (bus application) escalates these.
 *
 * - Schmitt trigger flag: if original is a '14, '132, '7414, or any
 *   explicitly Schmitt-input type, replacement must also have Schmitt
 *   inputs. Non-Schmitt replacement in a slow-edge or noisy input circuit
 *   produces output chatter. Context Q4 (slow-edged/noisy) escalates to
 *   BLOCKING.
 *
 * - Setup/hold time violations are not detectable at nominal conditions.
 *   Flagged as Application Review because hold-time violations cannot be
 *   fixed by slowing the clock — they require board-level changes.
 *
 * Digikey categories (5+): "Gates and Inverters", "Buffers, Drivers,
 * Receivers, Transceivers", "Flip Flops", "Latches", "Counters, Dividers",
 * "Shift Registers", "Signal Switches, Multiplexers, Decoders".
 * ~40-45% Digikey weight coverage (most timing/threshold specs are
 * datasheet-only).
 */
export const c5LogicICsLogicTable: LogicTable = {
  familyId: 'C5',
  familyName: 'Logic ICs — 74-Series Standard Logic',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for 74-series standard logic IC replacement validation — logic function is a BLOCKING gate, HC/HCT interface compatibility enforced via context',
  rules: [
    // ============================================================
    // IDENTITY — Function, Gate Count & Physical
    // ============================================================
    {
      attributeId: 'logic_function',
      attributeName: 'Logic Function (Part Number Suffix)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate before all others. The logic function encoded in the part number suffix must match exactly. \'04 (hex inverter) cannot substitute for \'14 (Schmitt hex inverter) even though both are inverters — the \'14 adds Schmitt trigger hysteresis. \'373 (transparent latch) cannot substitute for \'374 (edge-triggered flip-flop) — functionally incompatible despite similar pinout. No cross-function substitution is ever valid regardless of electrical compatibility.',
      sortOrder: 1,
    },
    {
      attributeId: 'gate_count',
      attributeName: 'Number of Gates / Sections / Bits',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — channel/gate count must match exactly. A dual gate package cannot substitute for a quad gate package — the footprints and pin assignments differ. Even when two parts share the same outline (e.g., both 14-pin SOIC), the pin assignments will differ between different gate counts or functions. Hex packages use 14-pin, octal use 20-pin, with non-interchangeable pinouts.',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Package must match PCB footprint for drop-in replacement. Logic ICs span from 14-pin DIP to fine-pitch TSSOP and SC70/SOT-23 for single-gate packages. Single-gate packages (SC70-5, SOT-23-5) have non-standard pinouts NOT compatible with the corresponding multi-gate package pins. Thermal considerations arise at high frequencies where dynamic power dissipation P = Cload × Vcc² × f × N can be significant.',
      sortOrder: 3,
    },

    // ============================================================
    // OUTPUT CHARACTERISTICS
    // ============================================================
    {
      attributeId: 'output_type',
      attributeName: 'Output Type (Totem-pole / Open-drain / 3-state)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Output type must match. Totem-pole outputs cannot replace open-drain/open-collector outputs — wired-AND bus topology will be destroyed (direct current path VCC→GND through conflicting drivers). 3-state outputs are not compatible with totem-pole or open-drain in bus applications without circuit modification. Context Q3 (bus application) escalates to BLOCKING with blockOnMissing.',
      sortOrder: 4,
    },
    {
      attributeId: 'oe_polarity',
      attributeName: '3-State Output Enable (OE) Polarity',
      logicType: 'identity_flag',
      weight: 9,
      engineeringReason: 'BLOCKING for 3-state devices — if the original has active-low OE (/OE, /G, /CE) and the replacement has active-high OE (or vice versa), outputs will be permanently enabled or permanently disabled. This reverses the entire operating behavior of the device. For bidirectional transceivers (74x245), both OE and DIR pin polarity must be verified. Context Q3 (bus application) escalates to mandatory with blockOnMissing.',
      sortOrder: 5,
    },
    {
      attributeId: 'voh',
      attributeName: 'Output High Voltage (VOH)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement VOH_min must equal or exceed the original at the same load current. VOH must exceed the downstream input\'s VIH_min. For CMOS-driving-CMOS at the same supply: VOH is within 0.1–0.4V of Vcc, margin is comfortable. For 3.3V CMOS driving 5V HC inputs: VOH = 3.3V maximum, VIH = 3.5V minimum — negative margin. This is the 3.3V-to-5V level shift problem.',
      sortOrder: 6,
    },
    {
      attributeId: 'vol',
      attributeName: 'Output Low Voltage (VOL)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement VOL_max must equal or lower the original at the same load current. VOL must remain below the downstream input\'s VIL_max. HC family: IOL = 4mA, VOL_max = 0.1V. LVC family: IOL = 24mA, VOL_max = 0.55V. Open-drain outputs: VOL represents the saturation voltage of the output pull-down transistor.',
      sortOrder: 7,
    },
    {
      attributeId: 'drive_current',
      attributeName: 'Output Drive Current (IOH / IOL)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement IOH and IOL must equal or exceed the original. Drive current determines fan-out capability. AC and LVC families (24mA) are preferred over HC (4–8mA) in bus-driving applications. Replacing a 24mA LVC output with a 4mA HC output in a bus transceiver application will cause VOL violations when the bus is loaded — the voltage will not pull down adequately.',
      sortOrder: 8,
    },

    // ============================================================
    // INPUT CHARACTERISTICS
    // ============================================================
    {
      attributeId: 'schmitt_trigger',
      attributeName: 'Schmitt Trigger Input',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'If the original has Schmitt trigger inputs (\'14, \'132, \'7414, or any explicitly Schmitt type), the replacement must also have Schmitt inputs if the input signal is slow-edged, noisy, or has superimposed AC noise. Without hysteresis (0.5–0.7V typical), a standard input produces multiple output transitions on slow edges — glitches, oscillations, or erratic state changes. Common contexts: RC timing, long traces, crystal oscillators, switch debouncing. Context Q4 (slow-edged/noisy) escalates to BLOCKING.',
      sortOrder: 9,
    },
    {
      attributeId: 'vih',
      attributeName: 'Input High Threshold (VIH)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement VIH must be equal to or lower than the original. The driving source\'s guaranteed VOH_min must exceed the replacement\'s VIH_min. HC at 5V: VIH = 3.5V. HCT: VIH = 2.0V. TTL VOH_min = 2.4V → drives HCT but NOT HC. This is THE HC/HCT substitution trap. Context Q1 (TTL driving source) escalates to BLOCKING with blockOnMissing.',
      sortOrder: 10,
    },
    {
      attributeId: 'vil',
      attributeName: 'Input Low Threshold (VIL)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Replacement VIL must be equal to or higher than the original. The driving source\'s guaranteed VOL_max must be lower than the replacement\'s VIL_max. CMOS families: VIL ~= 0.3 × Vcc (1.5V at 5V). TTL-compatible: VIL = 0.8V. Where this matters most: CMOS-to-CMOS interfaces at different supply voltages — a 3.3V LVC output driving a 5V HC input works on the LOW side (LVC VOL = 0.1V << HC VIL = 1.5V).',
      sortOrder: 11,
    },
    {
      attributeId: 'input_clamp_diodes',
      attributeName: 'Input Clamp Diodes',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'If the original has clamp diodes and the replacement does not (or vice versa), flag for review in circuits with fast-switching inputs, long traces, or transmission-line effects. Critical for 5V-tolerant applications: LVC achieves 5V tolerance by blocking the Vcc-side clamp diode. Replacing LVC with standard HC in a 5V-signal-receiving application will forward-bias the clamp diode, injecting current into the Vcc rail.',
      sortOrder: 12,
    },
    {
      attributeId: 'input_leakage',
      attributeName: 'Input Leakage Current (IIH / IIL)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 4,
      engineeringReason: 'Replacement input leakage must be equal to or lower. Matters for: (1) fan-out calculation when driving >32 inputs, (2) open-drain bus pull-up sizing on I2C/SMBus, (3) high-impedance bus states. CMOS gate oxide leakage is typically ±1µA max. Bus-hold circuits (25–100µA) are separate and much larger.',
      sortOrder: 13,
    },
    {
      attributeId: 'bus_hold',
      attributeName: 'Bus Hold / Weak Pull-up',
      logicType: 'identity_flag',
      weight: 5,
      engineeringReason: 'If the original has bus hold and the replacement does not, floating inputs (from 3-state bus masters) will be undefined rather than held at the last state. If the original does not have bus hold and the replacement does, the bus-hold current (25–100µA) may conflict with the driving source during transitions. Bus hold eliminates pull-up/pull-down resistors on bus lines where the master may be tri-stated.',
      sortOrder: 14,
    },

    // ============================================================
    // LOGIC FAMILY & SUPPLY
    // ============================================================
    {
      attributeId: 'logic_family',
      attributeName: 'Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP)',
      logicType: 'application_review',
      weight: 7,
      engineeringReason: 'Logic family determines input thresholds, output levels, drive strength, speed, and supply voltage range simultaneously. Cross-family substitution requires a four-way interface compatibility check: (1) driving source VOH/VOL meets replacement VIH/VIL, (2) replacement VOH/VOL meets downstream VIH/VIL, (3) supply voltage supported, (4) speed grade adequate. HC: 2-6V, CMOS thresholds, 4mA, 8-15ns. HCT: 4.5-5.5V, TTL inputs (VIH=2.0V). LVC: 1.65-5.5V, CMOS, 24mA, 5V-tolerant inputs. AC/ACT: 1.5-5.5V, 24mA, 2-4ns. Never assume same-function different-family parts are drop-in compatible.',
      sortOrder: 15,
    },
    {
      attributeId: 'supply_voltage',
      attributeName: 'Supply Voltage Range (Vcc)',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 8,
      engineeringReason: 'Replacement supply voltage range must contain the actual circuit supply voltage. Below Vcc_min: undefined logic behavior, VIH/VIL unspecified, speed degrades dramatically. Above Vcc_max: oxide breakdown — permanent, immediate failure. HC/HCT: 5V-era. LVC/AHC/ALVC: 1.65-3.6V (some to 5.5V). AUP: 0.8-3.6V. Original TTL (LS, ALS, AS, F): exactly 5V. HCT and ACT are restricted to 4.5–5.5V — using them at 3.3V is a hard block.',
      sortOrder: 16,
    },

    // ============================================================
    // AC / TIMING CHARACTERISTICS
    // ============================================================
    {
      attributeId: 'tpd',
      attributeName: 'Propagation Delay (tpd)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement tpd must be equal to or lower than the original at the actual supply voltage and temperature. For combinational logic: tpd sets the maximum usable operating frequency in timing-critical paths. tpd varies strongly with Vcc (HC: 40ns at 2V, 15ns at 4.5V, 8ns at 6V — 5× variation). A replacement that meets tpd at nominal Vcc but fails at Vcc_min will cause cold-start or battery-end-of-life timing failures. For sequential logic: tpd(CLK-to-Q) directly reduces f_max.',
      sortOrder: 17,
    },
    {
      attributeId: 'fmax',
      attributeName: 'Maximum Operating Frequency (fmax)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'For clocked logic (flip-flops, counters, shift registers), replacement fmax must equal or exceed the original. fmax degrades dramatically at lower Vcc: 74HC574 at 5V has fmax ~= 40MHz; at 2V, fmax drops to ~3MHz. If the system runs at 10MHz with 3.3V supply and the replacement fmax(3.3V) = 8MHz, it will fail. For shift registers in serial data interfaces, fmax ties directly to baud rate — insufficient fmax corrupts data.',
      sortOrder: 18,
    },
    {
      attributeId: 'transition_time',
      attributeName: 'Output Transition Time (tr / tf)',
      logicType: 'application_review',
      weight: 4,
      engineeringReason: 'Faster transitions increase EMI and cross-talk; slower transitions increase power dissipation and may cause timing issues. AC/LVC: 1–2ns edges. HC: 5–10ns edges. Faster edges carry more spectral energy, potentially exceeding FCC Part 15 / CISPR 32 emission limits even at logic frequencies below 100MHz. In EMI-sensitive applications, slower-edge family (HC) may be intentionally chosen. For controlled-slew-rate applications (CAN bus, RS-485), transition time is a hard constraint.',
      sortOrder: 19,
    },
    {
      attributeId: 'setup_hold_time',
      attributeName: 'Setup Time / Hold Time (tsu / th)',
      logicType: 'application_review',
      weight: 6,
      engineeringReason: 'Flag as Application Review for any replacement with longer tsu or th. Setup time violations reduce available logic time: t_logic = t_clock - tpd_CLK-to-Q - t_routing - tsu. Hold-time violations are CRITICAL: they occur when data changes too quickly after the clock edge (tpd_CLK-to-Q < th) and CANNOT be fixed by slowing the clock — they require board-level changes. A longer hold-time requirement in the replacement can introduce violations not present in the original design.',
      sortOrder: 20,
    },

    // ============================================================
    // THERMAL & ENVIRONMENTAL
    // ============================================================
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Replacement temperature range must cover the full application operating range. Commercial: 0°C to +70°C. Industrial: -40°C to +85°C. Automotive: -40°C to +125°C (AEC-Q100). CMOS worst-case tpd occurs at lowest Vcc AND highest temperature simultaneously. A design with 20% timing margin at room temperature may have zero margin at -40°C, Vcc_min. Context Q5 (automotive) escalates to primary.',
      sortOrder: 21,
    },

    // ============================================================
    // COMPLIANCE & OPERATIONAL
    // ============================================================
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Automotive Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'If the original is AEC-Q100 qualified, the replacement must be AEC-Q100 qualified at an equal or lower grade number (lower = higher temperature rating). Grade 0: Tj_max = 150°C. Grade 1: 125°C. Grade 2: 105°C. Grade 3: 85°C. Non-automotive-qualified logic ICs cannot substitute in AEC-qualified designs regardless of electrical match. Context Q5 (automotive) escalates to mandatory with blockOnMissing.',
      sortOrder: 22,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape & Reel / Tube / Tray)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Packaging format must match assembly process. DIP packages are tube-packaged and cannot be tape-and-reel. SMD logic ICs are typically tape-and-reel for production. Verify reel size (7-inch vs. 13-inch) for high-volume assembly line compatibility.',
      sortOrder: 23,
    },
  ],
};
