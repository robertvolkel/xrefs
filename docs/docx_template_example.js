const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageOrientation
} = require('docx');
const fs = require('fs');

const HEADER_BG  = "1F3864";
const HEADER_FG  = "FFFFFF";
const ROW_ALT    = "DDEEFF";
const ROW_WHITE  = "FFFFFF";
const SECTION_BG = "2E75B6";
const SECTION_FG = "FFFFFF";

const COL_ATTR   = 2400;
const COL_LOGIC  = 1500;
const COL_RULE   = 3200;
const COL_REASON = 5860;
const TABLE_WIDTH = COL_ATTR + COL_LOGIC + COL_RULE + COL_REASON;

const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function hdrCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill: HEADER_BG, type: ShadingType.CLEAR },
    margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: HEADER_FG, size: 20, font: "Arial" })] })]
  });
}

function sectionRow(text) {
  return new TableRow({ children: [new TableCell({
    columnSpan: 4, borders, width: { size: TABLE_WIDTH, type: WidthType.DXA },
    shading: { fill: SECTION_BG, type: ShadingType.CLEAR }, margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: SECTION_FG, size: 20, font: "Arial" })] })]
  })] });
}

function dataCell(text, width, fill, bold = false) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: cellMargins, verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18, font: "Arial" })] })]
  });
}

function dataRow(attr, logic, rule, reason, alt) {
  const fill = alt ? ROW_ALT : ROW_WHITE;
  return new TableRow({ children: [
    dataCell(attr,   COL_ATTR,   fill, true),
    dataCell(logic,  COL_LOGIC,  fill),
    dataCell(rule,   COL_RULE,   fill),
    dataCell(reason, COL_REASON, fill),
  ]});
}

function heading(text, level = 1) {
  const sizes = { 1: 32, 2: 26, 3: 22 };
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: sizes[level] || 22, font: "Arial" })]
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 18, font: "Arial" })]
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 480, hanging: 240 },
    children: [new TextRun({ text: `\u2022  ${text}`, size: 18, font: "Arial" })]
  });
}

const rows = [
  // ── IDENTITY ────────────────────────────────────────────────────────────────
  ["Output Type\n(Fixed / Adjustable / Tracking / Negative)",
   "Identity",
   "Must match. Fixed-output LDOs cannot replace adjustable without circuit changes (feedback resistors must be added). Negative-output LDOs are a completely separate device class. Tracking regulators require specific sequencing compatibility.",
   "Fixed-output LDOs have the output voltage set internally — they typically need only input, output, and ground connections (plus optional enable and power-good pins). Adjustable LDOs set output voltage via an external resistor divider on a feedback pin; they offer flexibility but require additional components and careful resistor selection. Replacing a fixed LDO with an adjustable one requires adding the resistor divider network and verifying the feedback pin's reference voltage and input bias current are compatible with achievable resistor values. Negative-output LDOs regulate a negative rail (output voltage is negative with respect to ground) — they require a negative input voltage and have completely different application circuits. They cannot substitute for positive-output devices under any circumstances. Tracking regulators (output tracks a reference input, used in symmetric ±supply designs) have sequencing and tracking accuracy requirements not present in standard LDOs.",
   false],

  ["Output Voltage Vout\n(Fixed value, or adjustable range)",
   "Identity",
   "For fixed-output LDOs: replacement Vout must match exactly (±tolerance). Standard values: 1.2V, 1.5V, 1.8V, 2.5V, 3.0V, 3.3V, 5.0V. For adjustable LDOs: replacement adjustable range must include the target Vout. Even a 1% difference in fixed output voltage can violate downstream rail tolerance budgets.",
   "Output voltage is the primary Identity parameter for LDOs. For fixed devices, the output is set by an internal bandgap reference and resistor divider — it cannot be changed externally. A 3.3V fixed LDO cannot substitute for a 3.0V device; the downstream circuit (microcontroller, FPGA, ADC reference) has a defined operating voltage range, and even a 10% deviation may exceed the maximum rated supply voltage of the load IC. Common downstream supply voltages have tight tolerance requirements: DDR memory rails (1.35V, 1.5V, 1.8V) are typically ±5%; FPGA core rails may be ±3%. For adjustable LDOs, the target output voltage must fall within the adjustable range, and the feedback reference voltage (Vref, typically 0.8–1.25V) determines the minimum achievable output and the external resistor ratio required.",
   true],

  ["Package / Footprint",
   "Identity",
   "Package must match PCB footprint exactly. Pin assignment for Vin, Vout, GND, Enable, Power-Good, and Adjust pins varies across package types and manufacturers. In SOT-23-5, pin ordering varies significantly between manufacturers for the same functional pinout.",
   "LDO packages range from tiny 2-pin SOT-23-3 (for simple fixed regulators) to 5-pin SOT-23-5 (most common for feature-complete LDOs), 6-pin SOT-23-6, various DFN/QFN sizes, SOT-89, TO-252 (DPAK), TO-263 (D2PAK), and TO-220 for high-current types. The critical subtlety: in SOT-23-5 packages (the dominant LDO package for ICs up to ~500mA), pin ordering for Enable and Output varies between manufacturers. A Texas Instruments LDO in SOT-23-5 may have Enable on pin 5, while a Diodes Inc. equivalent has Enable on pin 3. Installing a device with Enable and Input swapped means the enable signal controls the input rail — potentially damaging both devices. Always verify all pin assignments from the specific datasheet, never assume from package name alone. The exposed thermal pad in DFN/QFN packages must also match — some designs rely on the pad for heat dissipation, and a replacement without an exposed pad will overheat.",
   false],

  ["Polarity\n(Positive / Negative)",
   "Identity",
   "Positive and negative LDOs are fundamentally different circuit topologies. No substitution across polarity types.",
   "Positive LDOs regulate a positive output voltage referenced to ground, using a P-channel or PNP pass element. Negative LDOs regulate a negative output voltage referenced to ground, using an N-channel or NPN pass element with inverted control sense. The feedback, enable, and protection circuitry are mirror-inverted between positive and negative types. This is as hard an Identity boundary as N-channel vs. P-channel MOSFETs — there is no meaningful sense in which they can substitute for each other.",
   true],

  // ── INPUT / OUTPUT VOLTAGE RANGE ──────────────────────────────────────────
  ["Vin Max\n(Maximum Input Voltage)",
   "Threshold \u2265",
   "Replacement Vin max \u2265 original. Must cover the highest expected input voltage including startup transients, supply overshoot, and any load-dump events (automotive). Exceeding Vin max causes gate oxide breakdown or junction breakdown of the pass element.",
   "Vin(max) sets the absolute maximum input voltage the LDO can withstand. In battery-powered systems, the maximum input may be the fully charged battery voltage (e.g., 4.2V per lithium cell). In mains-powered systems with a DC bus, the maximum is the unloaded bus voltage including ripple. Automotive designs face load-dump transients (typically 40V on a 12V system, 80V on a 24V system) — automotive LDOs must be rated for load-dump survivability (explicitly specified in the datasheet or covered by AEC-Q100 qualification). A replacement with lower Vin(max) than the original may survive normal operation but fail during startup when supply caps are charged from zero, or during any overvoltage event the original was designed to survive.",
   false],

  ["Vin Min\n(Minimum Input Voltage, including dropout)",
   "Threshold \u2264",
   "Replacement Vin(min) \u2264 original. Vin(min) = Vout + Vdropout. If the supply drops below Vin(min), the LDO exits regulation. In battery-powered systems, the usable battery life is determined by how low Vin can fall before the LDO drops out.",
   "Minimum input voltage is determined by the dropout voltage: Vin(min) = Vout + Vdropout at the operating load current. In battery-powered applications, maximizing battery utilization requires the lowest possible Vin(min) — an LDO with lower dropout extends usable battery life by allowing operation to a lower battery cutoff voltage. A replacement with higher dropout (higher Vin(min)) than the original may drop out of regulation at a higher battery voltage, effectively wasting battery capacity. Vin(min) also determines the cold-start capability: if the supply must rise above Vin(min) before the LDO regulates, a higher Vin(min) means a later regulation point during startup.",
   true],

  // ── KEY PERFORMANCE ───────────────────────────────────────────────────────
  ["Iout Max\n(Maximum Output Current)",
   "Threshold \u2265",
   "Replacement Iout max \u2265 original at the worst-case operating temperature. Current rating typically derates with temperature — verify at Tj, not just at 25\u00b0C. Do not substitute a lower-current device even if the nominal load appears to be within its rating, unless thermal derating has been verified.",
   "Maximum output current is the primary sizing parameter for LDO selection. It determines: whether the regulator can supply the load under worst-case conditions (maximum load current plus all inrush during startup); whether the overcurrent protection (current limiting) activates at an acceptable level; and whether the device can survive output short circuits. LDO current ratings derate with rising junction temperature — a device rated 500mA at 25°C may deliver only 350mA at 125°C ambient in a poorly ventilated enclosure. When evaluating a replacement, compute the actual operating junction temperature (Tj = Ta + Iout × Vdropout × Rθja) and verify the replacement's current rating at that temperature. Also check: does the replacement's current limit level match the original? Some circuits rely on the LDO's current limit as a form of downstream protection — a replacement with significantly higher or lower current limit may either fail to protect downstream components or limit at too low a level.",
   false],

  ["Vdropout Max\n(Dropout Voltage at rated Iout)",
   "Threshold \u2264",
   "Replacement Vdropout \u2264 original at the same Iout and temperature. Dropout voltage directly determines the minimum headroom required and the power dissipated as heat. A replacement with higher dropout may drop out of regulation in marginal supply conditions and will run hotter.",
   "Dropout voltage is the minimum difference between input and output voltage at which the LDO maintains regulation: Vdropout = Vin − Vout(min). For a 3.3V output LDO with 200mV dropout, the input must stay above 3.5V to maintain regulation. Dropout determines: (1) Minimum usable supply voltage — critical in battery systems and low-rail power chains. (2) Power dissipation — Pd = Iout × Vdropout. An LDO dropping 1V at 500mA dissipates 500mW; one dropping 200mV at the same current dissipates only 100mW. At high load currents, dropout voltage is the dominant factor in LDO efficiency and thermal performance. Traditional LDOs (NPN pass element) have dropout ≈ Vce(sat) + Vbe ≈ 1.5–2V. Low-dropout (PMOS pass element) types have dropout ≈ Vgs × Ron × Iout, typically 100–500mV at rated current. Replacing a low-dropout device with a higher-dropout type changes the thermal operating point and may violate the input voltage budget.",
   true],

  ["Iq\n(Quiescent Current / Ground Current)",
   "Threshold \u2264",
   "Replacement Iq \u2264 original. Critical for battery-powered and always-on applications where the LDO is active even when the load is in sleep mode. Iq flows from input to ground regardless of load current — it is pure waste in sleep states.",
   "Quiescent current (Iq, also called ground current or IQ) is the current drawn from the input supply by the LDO's internal circuitry — error amplifier, reference, bias network — independent of load current. It flows from Vin to GND even with zero load. Iq matters most in: (1) Battery-powered IoT and wearable devices in sleep mode — if Iq = 50µA and the device sleeps 99% of the time, Iq dominates the average current draw and determines battery life. An LDO with Iq = 1µA vs 50µA can mean the difference between 6-month and 10-year battery life in ultra-low-power applications. (2) Energy harvesting systems where total available current is in the µA range. (3) Always-on monitoring circuits powered from coin cells. For non-battery or always-on high-load applications, Iq is typically negligible compared to load current and is a low-priority specification. A replacement with higher Iq than the original is acceptable in these cases but should still be noted.",
   false],

  ["Vout Accuracy\n(Initial Output Voltage Tolerance)",
   "Threshold \u2264",
   "Replacement Vout accuracy \u2264 original (tighter tolerance is always acceptable). Expressed as a percentage. Must be combined with temperature coefficient to determine worst-case total output voltage error. Critical for precision analog references, ADC supplies, and any load with a tight voltage window.",
   "Output voltage accuracy defines how close the actual Vout is to the specified Vout at 25°C and nominal conditions. Common specifications: ±1% (general purpose), ±0.5% (precision), ±0.2% (ultra-precision). This matters when: (1) The LDO feeds a precision ADC or DAC reference — a 1% supply error appears as 1% gain error in the data converter. (2) The downstream IC has a tight supply voltage window — a microcontroller with Vcc = 3.3V ±5% has only 165mV of total margin; a 1% LDO tolerance consumes 33mV of that budget, leaving 132mV for transients, load regulation, and temperature drift. (3) Multiple LDOs power matched circuits — offset between rails causes offset errors in differential measurements. The initial accuracy figure must be combined with line regulation, load regulation, and temperature coefficient to determine the total error budget over all conditions.",
   true],

  // ── STABILITY & TRANSIENT ─────────────────────────────────────────────────
  ["Output Capacitor Requirement\n(Min/Max Cout, ESR window)",
   "Identity",
   "CRITICAL: Replacement must be stable with the same output capacitor type and value already on the PCB. If the replacement requires a different output capacitor (different ESR range, different minimum capacitance), the existing PCB cannot be used without rework. Verify the replacement's stability specification matches the PCB's populated capacitor.",
   "LDO stability is one of the most common substitution failure modes and is unique to linear regulators — it has no parallel in discrete component substitution. LDO stability depends critically on the output capacitor's ESR (Equivalent Series Resistance): the output cap is part of the feedback compensation network. Two stability regimes exist: (1) ESR-stabilized LDOs (older/traditional designs using PMOS pass element): require a minimum ESR to add a zero in the loop response. These devices are designed for tantalum or aluminum electrolytic capacitors (ESR 0.1–5Ω). Using a low-ESR ceramic capacitor with such an LDO will cause oscillation. (2) Ceramic-stable (or 'LDO with internal compensation' or 'any-cap' LDOs): designed to be stable with the very low ESR of ceramic capacitors (ESR < 10mΩ for X5R/X7R ceramics). These are the dominant modern LDO architecture. A replacement that requires ESR-stabilization substituted into a ceramic-cap design will oscillate. The datasheet must explicitly state stability with ceramic capacitors. Also check minimum output capacitance — some LDOs become unstable below a minimum Cout. If the PCB uses a 1µF output cap and the replacement requires 4.7µF minimum, it will be unstable with the existing BOM.",
   false],

  ["PSRR\n(Power Supply Rejection Ratio)",
   "Threshold \u2265",
   "Replacement PSRR \u2265 original at the relevant frequency. PSRR is frequency-dependent — always verify at the actual ripple frequency (switching frequency of upstream converter, 50/60Hz mains ripple, etc.), not just DC.",
   "PSRR (Power Supply Rejection Ratio) measures how well the LDO attenuates noise and ripple on its input from reaching the output. It is expressed in dB: PSRR = 20 log(ΔVin / ΔVout). A PSRR of 60dB means a 1V ripple on the input appears as only 1mV on the output. PSRR is frequency-dependent and always degrades at higher frequencies: a device with 70dB PSRR at DC may have only 30dB at 1MHz. This matters critically when: (1) An LDO post-regulates a switching supply — the switching frequency ripple (typically 100kHz–1MHz) is the dominant noise source. PSRR at the switching frequency is what matters, not DC PSRR. (2) An LDO powers an RF circuit, ADC, or precision analog block where supply noise directly corrupts the signal. (3) An LDO is on a noisy digital supply and feeds an analog section. A replacement with lower PSRR at the relevant frequency will allow more input ripple through to the output, potentially corrupting sensitive downstream circuits.",
   true],

  ["Load Regulation\n(ΔVout / ΔIout)",
   "Threshold \u2264",
   "Replacement load regulation \u2264 original. Load regulation defines how much Vout changes as load current varies from minimum to maximum. Expressed as mV or % change over the full load range.",
   "Load regulation measures the LDO's ability to maintain constant output voltage as the load current changes. It is determined by the open-loop gain of the error amplifier and the output impedance of the pass element. Poor load regulation means the output voltage sags under heavy load and rises under light load — creating a dynamic voltage variation that superimposes on the static accuracy. For digital loads (microcontrollers, FPGAs) with rapidly switching current demand, load regulation interacts with output capacitance to determine transient response. For precision analog loads (ADC references, precision amplifiers), load regulation directly contributes to gain and offset variation with signal level. Most modern LDOs have excellent load regulation (1–10mV over full load range) and this is rarely the binding specification, but it matters in precision measurement circuits where the load current varies with signal amplitude.",
   false],

  ["Line Regulation\n(ΔVout / ΔVin)",
   "Threshold \u2264",
   "Replacement line regulation \u2264 original. Line regulation defines how much Vout changes as Vin varies. Less critical than PSRR for AC ripple rejection, but relevant for DC supply variation (battery discharge curves, supply tolerance).",
   "Line regulation measures the LDO's output stability against slowly varying input voltage changes — as opposed to PSRR which covers AC ripple. Line regulation matters when: the input supply has a wide DC variation (e.g., a battery discharging from 4.2V to 3.0V feeding a 2.8V output LDO), or the input comes from an unregulated wall adapter with significant load-dependent variation. For most modern LDOs with high open-loop gain, line regulation is excellent (1–5mV/V) and rarely the binding specification. It becomes more important in precision references and measurement circuits where any supply-correlated output variation is an error source.",
   true],

  // ── PROTECTION & FEATURES ─────────────────────────────────────────────────
  ["Enable Pin\n(Active High / Active Low / Absent)",
   "Identity (Flag)",
   "If original has an Enable pin, replacement must also have one with matching logic polarity (active-high vs. active-low). An active-high Enable replacement in a circuit designed for active-low will keep the LDO permanently off or permanently on, depending on the default state of the control signal.",
   "The Enable pin allows the LDO to be turned on and off by an external logic signal — used for power sequencing, sleep mode, or power gating. Enable polarity: active-high Enable turns on with a high logic signal (most common in modern LDOs). Active-low Enable (sometimes called Shutdown, active-low) turns off with a high signal. Swapping polarity inverts the intended behavior. If the original has no Enable pin (always-on, 3-terminal device) and the replacement adds one, the Enable pin must be tied appropriately (to Vin or GND depending on polarity) — the PCB may not have this connection. If the original has Enable and the replacement does not, the power sequencing or sleep-mode control signal is now unconnected and the LDO is always on — potentially violating the system's power sequencing requirements.",
   false],

  ["Power-Good / Flag Pin\n(Present / Absent)",
   "Identity (Flag)",
   "If original has a Power-Good output pin, replacement must also have one. Power-Good is used by the system for power sequencing, microcontroller reset release, and fault monitoring — its absence disrupts these functions. An open-drain Power-Good output requires a pull-up resistor that must be present on the PCB.",
   "Power-Good (PG) is an open-drain output that asserts (typically pulls low when output is out of regulation, or drives high when in regulation, depending on implementation) to indicate that the output voltage has reached and is maintaining its target value. Common uses: (1) Microcontroller reset — the MCU is held in reset until PG asserts, ensuring the supply is stable before code executes. (2) Power sequencing — Rail A's PG enables Rail B, creating a defined startup sequence. (3) Fault monitoring — a fault processor monitors PG to detect regulator failures. If the original LDO has a PG pin and the replacement does not, all of these functions are disrupted. The PCB pull-up resistor for the PG open-drain output is present on the board — an LDO without PG leaves this resistor floating to Vin, potentially conflicting with the sequencing logic.",
   true],

  ["Soft-Start\n(Present / Absent / Adjustable)",
   "Identity (Flag)",
   "If original has soft-start, replacement should also have soft-start. Soft-start limits inrush current at power-up — its absence may cause supply voltage droops, blown fuses, or UVLO trips in the upstream supply during startup of capacitive loads.",
   "Soft-start controls the rate at which the output voltage ramps from 0V to its target value at power-up. Without soft-start, the LDO slams the output capacitor to the target voltage immediately, creating an inrush current spike: Iinrush = Cout × dVout/dt. For large output capacitors (hundreds of µF), this spike can: trip the upstream supply's overcurrent protection or UVLO; cause a voltage droop on the input rail that disturbs other circuits sharing the supply; or stress the LDO's pass element with a brief but high-power event. If the original LDO has soft-start and the replacement does not, the inrush behavior changes — test thoroughly with the actual output capacitance and upstream supply to verify acceptable startup.",
   false],

  ["Thermal Shutdown\n(Present / Absent)",
   "Threshold \u2265",
   "Replacement should have thermal shutdown if original does. Thermal shutdown protects both the LDO and downstream circuits from damage due to overtemperature — its absence increases fault risk.",
   "Thermal shutdown disables the LDO pass element when the junction temperature exceeds a threshold (typically 150–165°C), preventing thermal runaway and die damage during overload or short-circuit conditions. Without thermal shutdown, a sustained overload condition will destroy the pass element. Most modern LDOs include thermal shutdown as a standard feature — its absence is unusual and indicates a very low-cost or legacy device. When substituting, verify the thermal shutdown threshold temperature is compatible with the application's thermal design — some high-temperature applications specifically require a higher shutdown threshold (e.g., 175°C) to avoid nuisance tripping.",
   true],

  // ── THERMAL ──────────────────────────────────────────────────────────────
  ["Rθja / Rθjc\n(Thermal Resistance)",
   "Threshold \u2264",
   "Replacement Rθja \u2264 original for SMD packages without heatsink. Replacement Rθjc \u2264 original for TO-220/TO-252 packages with heatsinks. Determines maximum ambient temperature at rated power dissipation.",
   "LDO power dissipation: Pd = (Vin − Vout) × Iout + Vin × Iq ≈ Vdropout × Iout. The junction temperature: Tj = Ta + Pd × Rθja (for SMD without heatsink). For a 5V-in, 3.3V-out LDO at 500mA: Pd = 1.7V × 0.5A = 850mW. With Rθja = 250°C/W (typical SOT-23): Tj = 25 + 0.85 × 250 = 237°C — far above the 125°C Tj(max). This means the device CANNOT operate at 500mA in SOT-23 at room temperature without copper heatsinking on the PCB. A replacement in the same package but with higher Rθja will have even higher junction temperature for the same operating point. Always compute Tj before approving a replacement for a thermally loaded LDO application. For TO-220 and DPAK packages used with heatsinks, Rθjc determines the thermal path to the heatsink — lower is better.",
   false],

  ["Tj Max\n(Maximum Junction Temperature)",
   "Threshold \u2265",
   "Replacement Tj max \u2265 original. Most LDOs are rated 125\u00b0C. Automotive and industrial grades are rated 150\u00b0C or 175\u00b0C. Do not substitute a 125\u00b0C-rated part into a design with 150\u00b0C thermal margins.",
   "Maximum junction temperature limits the operating range of the LDO. Most commercial-grade LDOs are rated Tj(max) = 125°C. Industrial grades extend to 150°C. Automotive grades must cover Tj(max) = 150–175°C for underhood applications. Operating above Tj(max) causes: accelerated oxide degradation; increased reference voltage drift (degrading output accuracy); thermal shutdown activation at every operating cycle (causing output oscillation); and ultimate device failure. If the original design was engineered with a 150°C-rated LDO, a 125°C replacement reduces the thermal safety margin — the design may work at room temperature but fail during summer ambient conditions or high-load duty cycles.",
   true],

  // ── QUALIFICATION ────────────────────────────────────────────────────────
  ["AEC-Q100\n(Automotive Qualification)",
   "Identity (Flag)",
   "If original is AEC-Q100 qualified, replacement must be AEC-Q100 qualified. Mandatory for any automotive application. AEC-Q100 covers Grade 0 (−40°C to +150°C junction) through Grade 3 (0°C to +85°C junction) — verify the replacement meets the same or better grade.",
   "AEC-Q100 is the automotive IC qualification standard covering accelerated stress tests: High Temperature Operating Life (HTOL), Temperature Cycling, Humidity Biased Testing, Electromigration, and device-specific parametric stability tests. For LDOs specifically, AEC-Q100 validation includes output voltage stability over temperature and lifetime, dropout voltage stability, and PSRR retention. Automotive LDOs must also handle load-dump transients (up to 40V on 12V systems per ISO 7637) without damage — not all non-AEC-Q100 parts have been characterized for load-dump survivability. The qualification grade (0 through 3) determines the junction temperature range and must be matched: a Grade 1 (−40°C to +125°C TJ) part cannot replace a Grade 0 (−40°C to +150°C TJ) part without engineering review of the thermal margin.",
   false],

  ["Packaging Format\n(Tape/Reel, Tube, Tray)",
   "Operational",
   "Must match production line requirements. SOT-23, DFN, QFN packages in tape/reel. TO-220, TO-252 in tubes or trays. Confirm reel quantity (1000 or 3000 pieces) and tape width match pick-and-place feeder specs.",
   "Packaging format is a production logistics specification. Small SMD LDOs (SOT-23-3, SOT-23-5, DFN, QFN) are delivered on tape/reel for automated SMT assembly, typically in 3,000-piece reels on 8mm tape. Larger power LDOs (TO-252/DPAK, TO-263/D2PAK) may be on tape/reel or in tubes. Through-hole TO-220 LDOs are in tubes (typically 50 pieces). For high-volume production, reel quantity and tape width affect line changeover time. Verify the replacement's reel quantity matches the production order quantity to avoid partial reels.",
   true],
];

// ── Build table ────────────────────────────────────────────────────────────────
const tableRows = [
  new TableRow({
    tableHeader: true,
    children: [
      hdrCell("Attribute", COL_ATTR),
      hdrCell("Logic Type", COL_LOGIC),
      hdrCell("Matching Rule", COL_RULE),
      hdrCell("Engineering Reasoning", COL_REASON),
    ]
  }),
  sectionRow("IDENTITY — Output Type, Voltage & Physical"),
  ...rows.slice(0, 4).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
  sectionRow("INPUT / OUTPUT VOLTAGE RANGE"),
  ...rows.slice(4, 6).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
  sectionRow("KEY PERFORMANCE PARAMETERS"),
  ...rows.slice(6, 10).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
  sectionRow("STABILITY & TRANSIENT RESPONSE"),
  ...rows.slice(10, 14).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
  sectionRow("PROTECTION FEATURES & AUXILIARY PINS"),
  ...rows.slice(14, 18).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
  sectionRow("THERMAL"),
  ...rows.slice(18, 20).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
  sectionRow("QUALIFICATION & PRODUCTION"),
  ...rows.slice(20).map(([a,l,r,e,alt]) => dataRow(a,l,r,e,alt)),
];

// ── Summary table ──────────────────────────────────────────────────────────────
const summaryData = [
  ["Identity", "4", "Output Type (fixed/adjustable/tracking/negative), Output Voltage Vout, Package/Footprint, Polarity (positive/negative)"],
  ["Identity (Flag)", "3", "Enable Pin (polarity must match), Power-Good Pin (present/absent), Soft-Start (present/absent)"],
  ["Identity (critical — see note)", "1", "Output Capacitor Requirement (ESR window / ceramic stability)"],
  ["Threshold \u2265", "5", "Vin Max, Iout Max, PSRR, Thermal Shutdown, Tj Max"],
  ["Threshold \u2264", "7", "Vin Min / Dropout, Vdropout Max, Iq, Vout Accuracy, Load Regulation, Line Regulation, R\u03b8ja/R\u03b8jc"],
  ["Identity (Flag)", "1", "AEC-Q100"],
  ["Operational", "1", "Packaging Format"],
];

const summaryTable = new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: [2400, 600, 9960],
  rows: [
    new TableRow({ children: [
      new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: HEADER_BG, type: ShadingType.CLEAR }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: "Logic Type", bold: true, color: HEADER_FG, size: 20, font: "Arial" })] })] }),
      new TableCell({ borders, width: { size: 600, type: WidthType.DXA }, shading: { fill: HEADER_BG, type: ShadingType.CLEAR }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: "Count", bold: true, color: HEADER_FG, size: 20, font: "Arial" })] })] }),
      new TableCell({ borders, width: { size: 9960, type: WidthType.DXA }, shading: { fill: HEADER_BG, type: ShadingType.CLEAR }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: "Attributes", bold: true, color: HEADER_FG, size: 20, font: "Arial" })] })] }),
    ]}),
    ...summaryData.map(([type, count, attrs], i) => {
      const fill = i % 2 === 0 ? ROW_WHITE : ROW_ALT;
      return new TableRow({ children: [
        new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR }, margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: type, bold: true, size: 18, font: "Arial" })] })] }),
        new TableCell({ borders, width: { size: 600, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR }, margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: count, size: 18, font: "Arial" })] })] }),
        new TableCell({ borders, width: { size: 9960, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR }, margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: attrs, size: 18, font: "Arial" })] })] }),
      ]});
    }),
    new TableRow({ children: [
      new TableCell({ columnSpan: 3, borders, width: { size: TABLE_WIDTH, type: WidthType.DXA },
        shading: { fill: HEADER_BG, type: ShadingType.CLEAR }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: "TOTAL: 22 attributes", bold: true, color: HEADER_FG, size: 20, font: "Arial" })] })] }),
    ]}),
  ]
});

// ── Document ───────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: [
      heading("Component Replacement Logic Table — C1: Linear Voltage Regulators (LDOs)", 1),
      body("Family ID: C1  |  Block: C — Power Management ICs  |  Complexity: Moderate  |  Total Attributes: 22"),
      body("First family in Block C. The most parametric and substitution-friendly of all IC families."),
      body("Related Families: Switching Regulators (C2) — share power management context; Zener Diodes (B3) — share voltage reference concepts; Aluminum Electrolytics / MLCCs — output capacitor stability is the critical interface between LDO and passive families."),
      new Paragraph({ spacing: { after: 200 }, children: [] }),

      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_ATTR, COL_LOGIC, COL_RULE, COL_REASON],
        rows: tableRows,
      }),

      new Paragraph({ spacing: { before: 400, after: 200 }, children: [] }),

      heading("Engineering Notes — LDO-Specific Trade-offs and Gotchas", 2),

      heading("The Output Capacitor Stability Problem: The Most Common LDO Substitution Failure", 3),
      body("Of all the LDO specifications, output capacitor compatibility is the one most likely to cause a field failure that is invisible on the bench. The reason: LDO stability is a closed-loop control problem, and the output capacitor is part of the compensation network. Change the capacitor type or the LDO type without considering both together, and the loop compensation changes."),
      body("The two stability regimes:"),
      bullet("ESR-stabilized LDOs: The error amplifier has a dominant pole at low frequency. Without compensation, the loop would be unstable. The output capacitor's ESR introduces a zero that moves the phase back above 0° before the gain crosses unity — stabilizing the loop. These LDOs require ESR in the range of 0.1Ω to 5Ω. Tantalum and aluminum electrolytic capacitors provide this naturally. Ceramic capacitors (ESR < 10mΩ) do not — a ceramic output capacitor on an ESR-stabilized LDO will oscillate, sometimes at audio frequencies (audible whine), sometimes at MHz frequencies (visible on oscilloscope as output noise). This design was common through the 1990s and early 2000s; many legacy designs still use it."),
      bullet("Ceramic-stable (internally compensated) LDOs: The error amplifier includes internal compensation that does not rely on ESR. These devices are stable with ceramic capacitors and are the dominant modern architecture. They typically require a minimum output capacitance (often 1–10µF) for stability but have no maximum ESR requirement. They also work fine with tantalum or electrolytic caps."),
      body("The substitution trap: If the PCB uses ceramic output capacitors and the replacement is an ESR-stabilized LDO, it will oscillate. The datasheet phrase to look for: 'stable with ceramic capacitors' or 'CMOS LDO' or 'any-cap LDO'. If the datasheet specifies a minimum ESR or recommends tantalum capacitors, the device is ESR-stabilized and must not be used with ceramics."),

      heading("Dropout Voltage: More Than Just a Headroom Number", 3),
      body("Dropout voltage is often treated as a simple headroom calculation (Vin must exceed Vout + Vdropout), but it has two additional consequences that matter for substitution:"),
      bullet("Thermal impact: Every millivolt of dropout voltage is multiplied by the load current to get power dissipation. An LDO with 500mV dropout at 1A dissipates 500mW. One with 200mV dropout dissipates only 200mW — running significantly cooler in the same package. In thermally constrained designs (small SMD packages, high ambient temperature), a replacement with higher dropout may overheat even if it is within its absolute ratings."),
      bullet("Battery life impact: In battery-powered systems, the LDO drops out when Vin falls below Vout + Vdropout. An LDO with 300mV dropout on a 3.3V output will drop out at Vin = 3.6V. One with 100mV dropout will continue regulating until Vin = 3.4V. For a lithium cell discharging from 4.2V to 3.0V, those 200mV of additional usable range represent meaningful additional operating time. Ultra-low dropout LDOs (sometimes called VLDO or nano-power LDOs) specifically optimize for minimum dropout to maximize battery utilization."),
      body("When evaluating a replacement's dropout voltage, verify it at the actual operating load current and temperature — dropout is specified at a particular current and rises with load."),

      heading("Quiescent Current: The Sleep-Mode Gotcha", 3),
      body("Iq is specified at a particular load current (often zero load or light load). It does not scale with load current the way a MOSFET's gate drive scales — it is a fixed overhead regardless of what the load is doing. This matters when:"),
      bullet("The load is in deep sleep — the LDO's Iq may be the single largest current draw in the system during sleep mode. A difference of 10µA vs 200µA in Iq is the difference between months and weeks of battery life for a coin-cell IoT sensor."),
      bullet("The upstream source has a current budget — energy harvesters, solar cells, and thin-film batteries have limited available current. Iq must fit within the harvested power budget even with zero load."),
      body("Conversely: for high-load always-on applications (a 500mA load), Iq of 50µA is 0.01% of load current and is completely irrelevant. Don't over-optimize for Iq in applications where it doesn't matter — it can cause unnecessary rejection of otherwise good replacement candidates."),

      heading("PSRR: The Noise Propagation Interface", 3),
      body("PSRR is the specification that bridges the LDO to its upstream power environment. An LDO post-regulating a switching converter must reject the switching frequency ripple. If the switching frequency is 500kHz, the relevant PSRR is at 500kHz — not the DC PSRR headlined in the datasheet. Most LDO datasheets show PSRR vs. frequency curves; use these, not the single-number DC spec."),
      body("Two related failure modes in substitution:"),
      bullet("Replacement has lower PSRR at the upstream switching frequency → more ripple on the output → noisier supply for the downstream load. Visible as increased noise floor in audio, degraded SNR in ADC measurements, or EMI issues."),
      bullet("Replacement has lower PSRR at low frequencies → DC load variations on the input (from other loads sharing the supply) modulate the regulated output → correlated noise appears on the output when other system loads switch on and off."),

      heading("Feature Pins: The Pin-Compatibility Trap", 3),
      body("The Enable and Power-Good pins are where otherwise-identical-looking LDOs most commonly fail to be drop-in compatible. The failure modes are subtle:"),
      bullet("Enable active-high vs. active-low: both variants exist. Active-high Enable (EN pin driven high to turn on) is more common in modern designs. Active-low Enable (sometimes labelled /EN or SHDN) turns off when driven high. If the replacement inverts this polarity, the LDO may be permanently off or permanently on depending on what the controlling circuit drives."),
      bullet("Enable pin float behavior: what does the LDO do when the Enable pin is unconnected? Some default to on (enable pin has internal pullup); others default to off (no pullup). If the original design expected default-on behavior and the replacement defaults to off, the system will not power up."),
      bullet("Power-Good threshold: PG asserts when Vout reaches a threshold, typically 90–95% of target. If the replacement has a different PG threshold, the downstream sequencing (MCU reset release) may occur earlier or later than designed, causing startup race conditions."),

      heading("LDO vs. Switching Regulator: Know When Not to Substitute", 3),
      body("LDOs are sometimes proposed as 'simpler' replacements for switching regulators (or vice versa). This is never a drop-in substitution:"),
      bullet("LDO replacing a switcher: the LDO will work electrically only if Vin > Vout (LDOs cannot boost). The efficiency will be dramatically lower (LDO dissipates all excess as heat). At high currents or large Vin-Vout differentials, the thermal dissipation may be unacceptable. However, for low-current, small Vin-Vout differential applications, an LDO replacement may be intentional for reduced EMI."),
      bullet("Switcher replacing an LDO: switching regulators produce output ripple that LDOs are specifically designed to avoid. The PCB layout changes required for a switcher (switching node, inductor placement, feedback routing) are incompatible with an LDO footprint. Never recommend this substitution."),

      new Paragraph({ spacing: { before: 400, after: 200 }, children: [] }),
      heading("Logic Type Summary", 2),
      summaryTable,
      new Paragraph({ spacing: { after: 200 }, children: [] }),
      body("Document generated for Component Replacement Engine — Block C: Power Management ICs. Family C1 of 7."),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/home/claude/ldo_logic_c1.docx", buf);
  console.log("Done: ldo_logic_c1.docx");
});
