# Application Context → Attribute Impact Map

## Purpose

This document maps every component family to the application-context questions the chat engine must ask, and identifies exactly which attributes in the logic table are affected by each answer. This drives the orchestrator's conversation flow — the LLM doesn't freestyle questions; it asks the ones listed here based on the resolved family.

---

## Families Ranked by Application-Context Sensitivity

| Rank | Family | ID | Context Sensitivity | Why |
|------|--------|-----|-------------------|-----|
| 1 | Thermistors (NTC/PTC) | 67/68 | **Critical** | Same component type serves 5 completely different functions — wrong category = wrong part |
| 2 | Common Mode Chokes | 69 | **Critical** | Signal-line vs. power-line are different components sharing a name |
| 3 | Ferrite Beads | 70 | **High** | Power rail vs. signal line changes every priority; DC bias derating invisible without operating current |
| 4 | Film Capacitors | 64 | **High** | AC vs. DC, continuous vs. pulse, safety-rated vs. general — each activates different dominant attributes |
| 5 | MOSFETs (N-ch + P-ch) | B5 | **High** | Switching vs. linear mode is a categorical bifurcation — wrong mode = completely wrong matching priorities. Switching frequency determines whether Rds(on) or gate charge dominates. Hard vs. soft switching changes Coss from "minimize" to "must match resonant design." |
| 6 | BJTs (NPN + PNP) | B6 | **Moderate-High** | Saturated switching vs. linear/analog mode bifurcation — storage time is irrelevant in analog, dominant in fast switching. hFE is a curve not a number; must verify at actual Ic. Complementary pair matching creates dual-device constraints. |
| 7 | IGBTs | B7 | **High** | Switching frequency determines tail-current viability and Eoff budget. PT/NPT/FS technology is an Identity constraint for parallel designs. Co-packaged diode presence is a hard gate. Short-circuit withstand time interfaces directly with gate driver protection design. |
| 8 | Thyristors / TRIACs / SCRs | B8 | **Moderate** | Device sub-type (SCR/TRIAC/DIAC) is a hard gate. Gate sensitivity class must match gate drive capability. TRIAC quadrant operation determines which half-cycles trigger reliably. Snubberless flag is a hard Identity constraint. dV/dt rating interfaces with snubber design. |
| 9 | MLCCs | 12 | **High** | DC bias derating, flex PCB, audio/piezoelectric noise all require context |
| 10 | Tantalum Capacitors | 59 | **High** | Failure mode safety implications, voltage derating practice, inrush conditions |
| 11 | RF / Signal Inductors | 72 | **High** | Operating frequency and Q requirements replace the switcher concerns from power inductors; core material priority inverts |
| 12 | Rectifier Diodes | B1 | **High** | Switching frequency determines whether trr or Vf dominates; circuit topology changes which specs are primary; low-voltage apps make Vf critical |
| 13 | Schottky Diodes | B2 | **Moderate-High** | Vf is almost always dominant; leakage/thermal runaway risk depends on voltage and temperature; Si vs SiC is a hard gate |
| 14 | Zener / Voltage Reference Diodes | B3 | **Moderate-High** | Clamping vs. reference application completely changes priorities — reference cares about TC, Zzt, noise; clamping only cares about Vz and power |
| 15 | TVS Diodes | B4 | **Moderate-High** | Signal-line vs. power-line changes Cj priority entirely; surge standard compliance determines test waveform; steering vs. clamp topology is a hard gate |
| 16 | Current Sense Resistors | 54 | **Moderate-High** | Kelvin sensing, precision class, and switching frequency change matching priorities significantly |
| 17 | Power Inductors | 71 | **Moderate-High** | Converter topology affects saturation behavior requirements; actual current determines derating |
| 18 | Varistors / MOVs | 65 | **Moderate-High** | Mains vs. DC changes safety requirements entirely; transient source type shifts energy vs. response time priority |
| 19 | PTC Resettable Fuses | 66 | **Moderate-High** | Circuit voltage is a hard safety question; ambient temperature causes severe hold current derating |
| 20 | Aluminum Electrolytics | 58 | **Moderate** | Switching frequency affects ripple current; actual temp determines lifetime |
| 21 | Supercapacitors / EDLCs | 61 | **Moderate** | Backup vs. pulse buffering changes priorities; cold-start needs require ESR context |
| 22 | Chassis Mount Resistors | 55 | **Moderate** | Thermal setup (heatsink type, airflow) directly determines effective power rating |
| 23 | Aluminum Polymer Caps | 60 | **Low-Moderate** | Inherits aluminum electrolytic context minus lifetime concerns; ripple frequency still matters |
| 24 | Chip Resistors | 52 | **Low** | Mostly parametric — only harsh environment and precision applications need context |
| 25 | Through-Hole Resistors | 53 | **Low** | Inherits chip resistor context; lead spacing is physical, not application-dependent |
| 26 | JFETs | B9 | **Moderate** | Application mode (low-noise amp / ultra-high-Z / RF / legacy switching) determines whether NF, Igss, ft, or switching specs dominate. Vp and Idss are Identity specs — circuit bias depends on their range. Matched-pair applications require dual-device evaluation. |
| 27 | Linear Voltage Regulators (LDOs) | C1 | **Moderate** | Output capacitor ESR compatibility is the most common substitution failure — ceramic vs. tantalum stability requirement is a hard Identity constraint. Fixed vs. adjustable, enable polarity, and power-good presence are Identity flags. PSRR must be verified at the upstream switching frequency, not DC. |
| 28 | Switching Regulators | C2 | **High** | Topology is a hard Identity gate before any other evaluation. Control mode determines whether existing compensation network is valid — different control modes require different compensation. Switching frequency interfaces directly with inductor and capacitor values. Vref determines whether existing feedback resistors set the correct output. Integrated-switch vs. controller-only is an architectural Identity constraint. |
| 29 | Gate Drivers | C3 | **Moderate-High** | Driver configuration (single/dual/half-bridge) is a hard Identity gate. Output polarity inversion causes instant shoot-through in half-bridge circuits — most dangerous substitution failure mode. Dead-time, bootstrap diode presence, and shutdown polarity are Identity Flags. Peak drive current interfaces with power device switching loss budget. |
| 30 | Mica Capacitors | 13 | **Low** | Precision is assumed (that's why mica was chosen); minimal context needed |
| 31 | Op-Amps / Comparators | C4 | **High** | Op-amp vs. comparator is a categorical hard gate — closed-loop vs. open-loop use determines the entire matching framework. Input stage technology (bipolar/JFET/CMOS) must match source impedance profile. Decompensated vs. unity-gain-stable types are not interchangeable. Comparator output type (push-pull vs. open-drain) determines circuit topology. |
| 32 | Logic ICs (74-Series) | C5 | **Moderate** | Logic function (part number suffix) is a hard gate before any family evaluation. Logic family cross-substitution (HC vs. HCT vs. LVC vs. AC) requires a four-way interface compatibility check — the HC/HCT TTL-threshold mismatch is the most common logic substitution failure. Output type (totem-pole vs. open-drain vs. 3-state) and OE polarity are Identity Flags. Mixed 3.3V/5V interfaces require explicit 5V-tolerance verification. |
| 33 | Voltage References | C6 | **Moderate** | Configuration (series vs. shunt) is a hard Identity gate — the most common categorical substitution error. Output voltage is always Identity. TC curve shape matters beyond headline ppm/°C for precision applications. Architecture (band-gap vs. buried Zener) determines noise floor and long-term stability. Shunt references require external series resistor; series references actively drive output. |
| 34 | Interface ICs (RS-485, CAN, I2C, USB) | C7 | **Moderate-High** | Protocol is a hard categorical gate — RS-485, CAN, I2C, and USB are not cross-substitutable. Within protocol: operating mode (half/full-duplex, isolated/non-isolated) and CAN FD vs. classical are Identity gates. Bus fault protection, ESD, and slew rate change significantly by environment. Automotive vs. industrial vs. consumer splits AEC-Q100 requirement. |
| 35 | Timers and Oscillators | C8 | **Moderate** | Device category (555 timer / XO / MEMS / TCXO / VCXO / OCXO) is a hard categorical gate — none are cross-substitutable. Within oscillators: output frequency is always Identity. OE polarity is a functional hard gate for enable-controlled designs. Stability class (XO vs. TCXO vs. OCXO) drives the accuracy/power/cost trade-off. AEC-Q100 is BLOCKING for automotive. |
| 36 | ADCs (Analog-to-Digital Converters) | C9 | **High** | Architecture (SAR / Delta-Sigma / Pipeline / Flash) is a hard categorical gate — each has fundamentally different latency, noise floor, and speed characteristics. Resolution is always Identity. Simultaneous sampling vs. multiplexed is a hard gate for multi-channel phase-sensitive applications. Interface type (SPI/I2C/Parallel) requires firmware compatibility. ENOB is the honest performance metric; resolution_bits is nominal. AEC-Q100 is BLOCKING for automotive. |
| 37 | DACs (Digital-to-Analog Converters) | C10 | **High** | Output type (voltage vs. current) is a hard categorical gate — voltage-output and current-output DACs are architecturally incompatible circuit topologies. Resolution is always Identity. Power-on reset state is BLOCKING when it determines safe or unsafe actuator state before firmware initialization. Glitch energy is the hidden spec that separates audio-grade and precision DACs from general-purpose parts. AEC-Q100 is BLOCKING for automotive. |
| 38 | Crystals (Quartz Resonators) | D1 | **Moderate-High** | Nominal frequency and load capacitance are both hard Identity gates — mismatched load capacitance is the most common crystal substitution error and causes a systematic frequency offset that persists over temperature. ESR must be verified for cold-start margin (5× minimum negative resistance margin). Overtone mode vs. fundamental mode is a hard gate — cross-substitution causes oscillation at the wrong frequency. Cut type (AT-cut vs. Tuning Fork) is determined by frequency range. AEC-Q200 is BLOCKING for automotive. |
| 39 | Fuses (Traditional Overcurrent Protection) | D2 | **Moderate** | Current rating is Identity — not a threshold. Speed class (fast-blow vs. slow-blow) is a hard categorical gate: cross-class substitutions either blow on normal inrush or fail to protect semiconductors. Voltage rating and breaking capacity are minimum thresholds with safety implications. I²t let-through energy is the key semiconductor protection spec. DC voltage rating is separate from AC rating and must be verified for solar, EV, and battery applications. AEC-Q200 is BLOCKING for automotive. |
| 40 | Optocouplers / Photocouplers | E1 | **Moderate-High** | Output transistor type (phototransistor / photodarlington / logic-output) is a hard categorical gate — gain range, bandwidth, and drive interface differ fundamentally across types. Isolation voltage is safety-critical and must never be downgraded; working voltage, creepage, and clearance are independent safety attributes that must all be met. CTR precision class matters for bounded-gain applications. Bandwidth/propagation delay is the discriminating spec for high-speed vs. slow applications. AEC-Q101 is BLOCKING for automotive (discrete semiconductor qualification — not AEC-Q100 or AEC-Q200). |
| 41 | Electromechanical Relays (EMR) | F1 | **Moderate-High** | Coil voltage is Identity — not a threshold. Contact form (SPST-NO/NC, SPDT, DPDT) is a hard categorical gate that defines wiring topology; cross-form substitution is never safe. Contact current and voltage ratings are safety-critical minimum thresholds and must account for load-type derating — inductive and motor loads require significant derating from resistive ratings. Contact material is a hidden reliability gate for dry-circuit applications below 100mA — silver contacts in a dry-circuit application cause insidious intermittent failures. AEC-Q200 is BLOCKING for automotive (electromechanical/passive qualification — not AEC-Q100 or AEC-Q101). |
| 42 | Solid State Relays (SSR) | F2 | **High** | Output switch type (TRIAC/SCR vs. MOSFET) is a hard categorical gate — TRIAC-output SSRs cannot switch DC loads (no zero-crossing for turn-off, device latches permanently), and MOSFET-output SSRs cannot switch AC loads. Firing mode (zero-crossing vs. random-fire) is a hard gate for inrush-sensitive and proportional-control applications. Load current rating requires thermal derating at elevated ambient temperature — a 25A-rated SSR may be limited to 12A at 50°C. Minimum load current is a hidden reliability gate for TRIAC-output SSRs switching low-current loads. Off-state leakage is a functional gate for sensitive loads that must be fully de-energised. |
---

## Digikey Subcategory Coverage Map

This table maps component families to their corresponding Digikey leaf categories. Some families span multiple Digikey subcategories (e.g., Rectifier Diodes covers both "Single Diodes" and "Bridge Rectifiers"). The system currently has param maps for **62 Digikey subcategories** out of 1,059 total.

| Family ID | Family Name | Digikey Subcategory 1 | Digikey Subcategory 2 |
|-----------|-------------|----------------------|----------------------|
| 12 | MLCC Capacitors | Ceramic Capacitors | — |
| 13 | Mica Capacitors | Mica and PTFE Capacitors | — |
| 52 | Chip Resistors | Chip Resistor | — |
| 53 | Through-Hole Resistors | Through Hole Resistors | — |
| 54 | Current Sense Resistors | Chip Resistor | — |
| 55 | Chassis Mount Resistors | Chassis Mount Resistors | — |
| 58 | Aluminum Electrolytic | Aluminum Electrolytic Capacitors | — |
| 59 | Tantalum Capacitors | Tantalum Capacitors | Tantalum - Polymer Capacitors |
| 60 | Aluminum Polymer | Aluminum - Polymer Capacitors | — |
| 61 | Supercapacitors | Electric Double Layer Capacitors | — |
| 64 | Film Capacitors | Film Capacitors | — |
| 65 | Varistors / MOVs | Varistors | — |
| 66 | PTC Resettable Fuses | PTC Resettable Fuses | — |
| 67 | NTC Thermistors | NTC Thermistors | — |
| 68 | PTC Thermistors | PTC Thermistors | — |
| 69 | Common Mode Chokes | Common Mode Chokes | — |
| 70 | Ferrite Beads | Ferrite Beads and Chips | — |
| 71 | Power Inductors | Fixed Inductors | — |
| 72 | RF/Signal Inductors | Fixed Inductors | — |
| B1 | Rectifier Diodes | Single Diodes | Bridge Rectifiers |
| B2 | Schottky Barrier Diodes | Schottky Diodes | Schottky Diode Arrays |
| B3 | Zener Diodes | Single Zener Diodes | Zener Diode Arrays |
| B4 | TVS Diodes | TVS Diodes | — |
| B5 | MOSFETs | Single FETs, MOSFETs | FET, MOSFET Arrays |
| B6 | BJTs | Single Bipolar Transistors | Bipolar Transistor Arrays |
| B7 | IGBTs | Single IGBTs | — |
| B8 | Thyristors | SCRs | TRIACs |
| B9 | JFETs | JFETs | — |
| C1 | LDOs | Voltage Regulators - Linear, Low Drop Out (LDO) Regulators | — |
| C2 | Switching Regulators | Voltage Regulators - DC DC Switching Regulators | DC DC Switching Controllers |
| C3 | Gate Drivers | Gate Drivers | Isolators - Gate Drivers |
| C4 | Op-Amps / Comparators | Instrumentation, Op Amps, Buffer Amps | Comparators |
| C5 | Logic ICs (74-Series) | Gates and Inverters | Buffers, Drivers, Receivers, Transceivers |
| C5 | Logic ICs (74-Series) | Flip Flops | Latches |
| C5 | Logic ICs (74-Series) | Counters, Dividers | Shift Registers |
| C5 | Logic ICs (74-Series) | Signal Switches, Multiplexers, Decoders | — |
| C6 | Voltage References | Voltage Reference | — (single category covers series + shunt; distinguished by "Reference Type" field) |
| C7 | Interface ICs | RS-485 Interface IC | CAN Interface IC |
| C7 | Interface ICs | I2C/SMBus Interface | USB Interface IC |
| C8 | Timers and Oscillators | Oscillators | Clock/Timing - Programmable Oscillators |
| C8 | Timers and Oscillators | Clock/Timing - Crystal Oscillators | 555 Timers |
| C9 | ADCs (Analog-to-Digital Converters) | Data Acquisition — Analog to Digital Converters (ADC) | — |
| C10 | DACs (Digital-to-Analog Converters) | Data Acquisition — Digital to Analog Converters (DAC) | Audio — DAC |
| D1 | Crystals (Quartz Resonators) | Crystals and Oscillators — Crystals | — |
| D2 | Fuses (Traditional Overcurrent Protection) | Circuit Protection — Fuses | Circuit Protection — Automotive Fuses |
| E1 | Optocouplers / Photocouplers | Optoisolators — Transistor, Photovoltaic Output | Optoisolators — Logic Output |
| F1 | Electromechanical Relays (EMR) | Relays — Power | Relays — Signal |
| F1 | Electromechanical Relays (EMR) | Relays — Automotive | — |
| F2 | Solid State Relays (SSR) | Relays — Solid State | Relays — Solid State — Industrial Mount |

---

## Family-by-Family Breakdown

---

## Block A: Passives

---

### 1. Thermistors — NTC and PTC (Families 67/68)

**Context sensitivity: CRITICAL**

This is the family where application context matters most. The same "thermistor" label covers five fundamentally different use cases, and getting the category wrong means every parameter priority is wrong.

#### Question 1: What is this thermistor's function?

| Answer | Effect on Matching |
|--------|-------------------|
| **NTC — Temperature sensing** | R25, B-value, R25 tolerance, B-value tolerance, R-T curve/Steinhart-Hart, dissipation constant, long-term stability/drift all become PRIMARY. Thermal time constant matters if fast response needed. Max power rating is secondary (sensing current is µA-level). |
| **NTC — Inrush current limiting** | Cold resistance (R0), max steady-state current, max power rating, thermal recovery time become PRIMARY. B-value and tolerance are irrelevant. Package is typically large disc, not SMD chip. |
| **NTC — Temperature compensation** | R25 and B-value must match the compensation target exactly. Tolerance on both is critical. Long-term drift matters because compensation accuracy degrades with drift. |
| **PTC — Overcurrent protection** | Curie/switch temperature, hold current, trip current, max voltage become PRIMARY. R25 and B-value are irrelevant in the NTC sense — the PTC's R-vs-T curve is a step function, not a smooth exponential. |
| **PTC — Self-regulating heater** | Curie temperature (sets heater equilibrium temp), power rating, and physical form factor become PRIMARY. |

**Affected attributes:**
- `Application Category` → Identity (determines which other attributes are primary)
- `R25` → primary for sensing/compensation, irrelevant for PTC protection
- `B-Value` → primary for sensing/compensation, irrelevant for inrush/PTC
- `R-T Curve / Steinhart-Hart` → Application Review, only matters for sensing
- `Tolerance on R25` → critical for sensing, irrelevant for inrush
- `Tolerance on B-Value` → critical for sensing, irrelevant for inrush
- `Dissipation Constant` → Application Review for sensing (self-heating error)
- `Cold Resistance (R0)` → only applicable for inrush limiters
- `Max Steady-State Current` → only applicable for inrush limiters
- `Curie/Switch Temperature` → only applicable for PTC types
- `Long-Term Stability / Drift` → critical for precision sensing, irrelevant for inrush/PTC
- `Thermal Time Constant` → important for fast sensing loops, irrelevant for inrush

#### Question 2 (if sensing): What temperature accuracy do you need?

| Answer | Effect on Matching |
|--------|-------------------|
| **Standard (±1–2°C)** | R25 tolerance ≤5%, B-value tolerance ≤3%. B-value matching is sufficient; Steinhart-Hart not required. |
| **Precision (±0.5°C or better)** | R25 tolerance ≤1%, B-value tolerance ≤1%. R-T curve / Steinhart-Hart coefficients become Application Review — must verify curve match point-by-point, not just B-value. Interchangeability curve flag becomes critical. Long-term drift becomes a hard constraint. |

**Affected attributes:**
- `Tolerance on R25` → threshold tightens
- `Tolerance on B-Value` → threshold tightens
- `R-T Curve / Steinhart-Hart` → escalates from "nice to verify" to "must verify"
- `Interchangeability Curve` → flag becomes critical
- `Long-Term Stability / Drift` → threshold tightens

#### Question 3 (if sensing): Is the R-T curve encoded in firmware?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — lookup table or Steinhart-Hart in code** | The replacement MUST conform to the same R-T curve or the firmware must be updated. This means either same manufacturer's interchangeability series, or point-by-point curve verification. Escalates `R-T Curve` to a hard gate in practice. |
| **No — analog circuit (voltage divider + comparator)** | B-value match is sufficient. Curve shape at extremes matters less because the circuit only operates around its threshold. |

**Affected attributes:**
- `R-T Curve / Steinhart-Hart` → escalates to effective Identity match
- `Interchangeability Curve` → becomes mandatory flag
- `B-Value` → sufficient alone only if no firmware coupling

---

### 2. Common Mode Chokes (Family 69)

**Context sensitivity: CRITICAL**

#### Question 1: Is this a signal-line or power-line application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Signal-line (USB, HDMI, Ethernet, CAN, LVDS, MIPI)** | Common mode impedance at frequency is PRIMARY. Leakage inductance must be LOW (parasitic). Winding balance/symmetry and mode conversion become critical. Interface standard compliance flag activates. DCR matters less. Rated current is typically low (100–500mA). Safety rating is not applicable. |
| **Power-line (AC mains filter, DC bus filter)** | Common mode inductance (mH) is PRIMARY. Rated current is a primary selection criterion. DCR directly affects efficiency. Leakage inductance may be INTENTIONALLY high (combined CM/DM filtering). Safety rating (UL/IEC/EN) may be mandatory. Winding balance matters less. Interface standard compliance is not applicable. |

**Affected attributes:**
- `Application Type` → Identity (signal vs. power)
- `Common Mode Impedance (at freq.)` → primary for signal, secondary for power
- `Inductance (Common Mode)` → primary for power, secondary for signal
- `Differential Mode Leakage Inductance` → must be LOW for signal, may be intentionally HIGH for power
- `Winding Balance / Symmetry` → critical for signal, less important for power
- `Interface Standard Compliance` → flag activates only for signal
- `Safety Rating (UL, IEC, EN)` → flag activates only for power-line mains
- `Rated Current` → secondary for signal, primary for power
- `DCR` → secondary for signal, critical for power
- `Voltage Rating` → secondary for signal, critical for power-line mains

#### Question 2 (if signal-line): Which interface standard?

| Answer | Effect on Matching |
|--------|-------------------|
| **USB 2.0** | 90Ω ±15% impedance, moderate speed — leakage inductance and mode conversion are important but not extreme. |
| **USB 3.x / USB4** | Very high speed — mode conversion (Scd21) becomes the dominant concern. Leakage inductance must be extremely low. Common mode impedance must be high across a very wide band. |
| **HDMI 1.4/2.x** | Similar to USB 3.x — high-speed differential, mode conversion critical. |
| **100BASE-T / 1000BASE-T Ethernet** | Specific insertion loss and return loss specs per IEEE 802.3. Often uses 4-line chokes. |
| **CAN / CAN-FD** | Lower speed, more tolerant of leakage inductance. Common mode impedance at lower frequencies matters more. |
| **Other / Unknown** | Default to checking impedance curve shape across a broad band. |

**Affected attributes:**
- `Interface Standard Compliance` → flag, must match specific standard
- `Common Mode Impedance vs. Frequency Curve` → Application Review, curve must cover the standard's frequency range
- `Differential Mode Leakage Inductance` → Application Review, tighter for higher-speed interfaces
- `Winding Balance / Symmetry` → Application Review, tighter for higher-speed interfaces
- `Number of Lines` → may change (4-line for Ethernet, 2-line for USB/CAN)

#### Question 3 (if power-line): Is this mains-connected?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — AC mains (120V/240V)** | Safety rating becomes MANDATORY. Voltage rating must cover mains + transients. Flammability of housing may matter. Creepage/clearance distances are regulated. |
| **No — DC bus or low-voltage power** | Safety rating not required. Voltage and current rating are still primary but no regulatory compliance needed. |

**Affected attributes:**
- `Safety Rating (UL, IEC, EN)` → mandatory flag for mains, not applicable for DC
- `Voltage Rating` → must include mains voltage + transient margin
- `Insulation Resistance / Isolation` → critical for mains safety

---

### 3. Ferrite Beads (Family 70)

**Context sensitivity: HIGH**

#### Question 1: Is this on a power rail or a signal line?

| Answer | Effect on Matching |
|--------|-------------------|
| **Power rail** | DC bias derating is the DOMINANT concern. Rated current and DCR become primary (voltage drop = I × DCR). Impedance at the actual operating current matters more than the headline 100MHz spec. Signal integrity is not a concern. |
| **Signal line** | Insertion loss at the signal frequency is the DOMINANT concern. The bead must be transparent to the desired signal. DC bias derating matters less (signal currents are small). Signal integrity impact becomes Application Review. |

**Affected attributes:**
- `Impedance at DC Bias (Derating)` → Application Review, critical for power rail
- `Rated Current (DC)` → primary for power rail, secondary for signal
- `DCR` → critical for power rail (voltage drop), secondary for signal
- `Signal Integrity Impact` → Application Review, critical for signal line
- `Impedance vs. Frequency Curve Shape` → Application Review for both, but for different reasons

#### Question 2: What is the actual DC operating current?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific current value (e.g., 300mA)** | Enables checking the impedance-vs-DC-bias curve. The replacement must provide adequate impedance AT THIS CURRENT, not just at zero bias. This is the single most common substitution failure. |
| **Unknown / varies** | Flag all candidates with an Application Review note: "Verify impedance at operating current using manufacturer's DC bias curve." |

**Affected attributes:**
- `Impedance at DC Bias (Derating)` → can be evaluated quantitatively if current is known
- `Rated Current (DC)` → threshold check becomes meaningful

#### Question 3 (if signal line): What is the signal frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific frequency (e.g., 100MHz clock)** | The bead's impedance curve must show LOW impedance at this frequency (transparent to signal) and HIGH impedance at harmonics. This is an Application Review on the impedance curve shape. |
| **Broadband / unknown** | Flag for impedance curve review. |

**Affected attributes:**
- `Signal Integrity Impact` → Application Review, can be evaluated if signal freq is known
- `Impedance vs. Frequency Curve Shape` → Application Review, must be transparent at signal freq

---

### 4. Film Capacitors (Family 64)

**Context sensitivity: HIGH**

#### Question 1: What is the primary application?

| Answer | Effect on Matching |
|--------|-------------------|
| **AC mains filtering / EMI suppression** | Safety rating (X/Y class) becomes MANDATORY. AC voltage rating is primary (not DC). Flammability rating (UL 94 V-0) is mandatory. Ripple current rating matters. Self-healing is expected (metallized construction). |
| **DC filtering / coupling / bypass** | DC voltage rating is primary. Safety rating not required. Construction type (metallized vs film/foil) is flexible. Standard parametric matching. |
| **Snubber / pulse discharge** | dV/dt rating and peak pulse current become PRIMARY — more important than capacitance or voltage. Film/foil construction is strongly preferred over metallized. ESR must be low. |
| **Motor-run / power factor correction** | AC voltage rating is primary. Ripple current rating is primary. Must be rated for continuous AC duty. Lifetime under AC stress matters. |
| **Precision timing / resonant circuit** | Dissipation factor (tan δ), temperature coefficient, and tolerance become PRIMARY. Polypropylene dielectric is almost certainly required. |

**Affected attributes:**
- `Safety Rating (X/Y Class)` → mandatory for mains EMI, not applicable otherwise
- `Flammability Rating (UL 94)` → mandatory for mains, not applicable otherwise
- `Voltage Rating (AC)` → primary for AC applications, not applicable for DC-only
- `Voltage Rating (DC)` → primary for DC applications
- `dV/dt Rating (Pulse)` → primary for snubber, irrelevant for filtering
- `Peak Pulse Current` → primary for snubber, irrelevant for filtering
- `Ripple Current Rating` → primary for motor-run/PFC, secondary otherwise
- `Construction (Metallized vs. Film/Foil)` → preference changes by application
- `Self-Healing` → expected for AC/EMI, may not be wanted for pulse
- `Dissipation Factor (tan δ)` → primary for precision/resonant, secondary otherwise
- `Temperature Coefficient` → primary for precision/resonant, secondary otherwise

#### Question 2 (if mains EMI): What safety class is required?

| Answer | Effect on Matching |
|--------|-------------------|
| **X1, X2, X3** (line-to-line) | Replacement must match or exceed the class. X1 > X2 > X3. |
| **Y1, Y2, Y3, Y4** (line-to-ground) | Replacement must match or exceed the class. Y1 > Y2 > Y3 > Y4. |
| **Unknown** | Flag as Application Review — safety class MUST be determined before substitution. |

**Affected attributes:**
- `Safety Rating (X/Y Class)` → Identity (Flag) with hierarchy

#### Question 3 (if snubber/pulse): What is the circuit's dV/dt requirement?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific value (e.g., 1000 V/µs)** | Hard threshold — replacement must meet or exceed. |
| **Unknown** | Flag all candidates for Application Review. Do not substitute a general-purpose film cap into a snubber position without verifying. |

**Affected attributes:**
- `dV/dt Rating (Pulse)` → threshold check
- `Peak Pulse Current` → threshold check
- `Construction` → film/foil strongly preferred

---

### 5. MLCC Capacitors (Family 12)

**Context sensitivity: HIGH**

#### Question 1: What is the operating voltage relative to the rated voltage?

| Answer | Effect on Matching |
|--------|-------------------|
| **<50% of rated** | DC bias derating is less of a concern but should still be flagged for Class II dielectrics (X7R, X5R). |
| **50–80% of rated** | DC bias derating is a significant concern. Two MLCCs with identical specs can have 30–60% capacitance loss at this bias level. Application Review on DC bias derating is critical. |
| **>80% of rated** | DC bias derating is severe. Only C0G/NP0 dielectrics are safe at this ratio. For Class II dielectrics, effective capacitance may be <30% of nominal. |

**Affected attributes:**
- `DC Bias Derating` → Application Review, severity depends on operating voltage ratio
- `Dielectric Material` → C0G becomes much more important at high voltage ratios

#### Question 2: Is this in a flex or flex-rigid PCB?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | Flexible termination flag becomes MANDATORY. Standard MLCCs crack under board flex, causing shorts and potential fires. |
| **No** | Flexible termination is not required (but acceptable if present). |

**Affected attributes:**
- `Flexible Termination` → Identity (Flag), mandatory for flex PCBs

#### Question 3: Is this in an audio or analog signal path?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | Piezoelectric noise (singing capacitor effect) becomes a concern. Class II dielectrics (X7R, X5R) exhibit piezoelectric effects that generate audible noise under AC voltage. C0G/NP0 is immune. If Class II must be used, smaller case sizes generate less noise. Flag for Application Review. |
| **No** | Piezoelectric noise is not a concern. |

**Affected attributes:**
- `Dielectric Material` → C0G strongly preferred for audio paths
- Piezoelectric noise → Application Review flag

#### Question 4: What environment?

| Answer | Effect on Matching |
|--------|-------------------|
| **Automotive** | AEC-Q200 becomes mandatory. |
| **Industrial / harsh** | Anti-sulfur terminations may be needed. Wide temp range. |
| **Consumer** | Standard specs acceptable. |

**Affected attributes:**
- `AEC-Q200` → Identity (Flag) for automotive
- Operating temp range → may tighten threshold

---

### 6. Tantalum Capacitors (Family 59)

**Context sensitivity: HIGH**

#### Question 1: Is safety-critical failure mode a concern?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — cannot tolerate catastrophic short/ignition** | MnO₂ tantalum types MUST be flagged or excluded. Polymer tantalum types fail benignly (open circuit). If the original is MnO₂, replacing with polymer is an upgrade for safety. If the original is polymer, replacing with MnO₂ is a DOWNGRADE and must be blocked. |
| **No — adequate protection exists in circuit** | Both MnO₂ and polymer are acceptable, but failure mode should still be flagged for awareness. |

**Affected attributes:**
- `Failure Mode (MnO₂ vs. Polymer)` → escalates from flag to effective hard gate in safety-critical apps
- `Construction` → polymer > MnO₂ for safety

#### Question 2: What is the operating voltage as a percentage of rated?

| Answer | Effect on Matching |
|--------|-------------------|
| **Following 50% derating rule** | Industry best practice. Operating at ≤50% of rated voltage dramatically reduces failure rate. |
| **Operating above 50% of rated** | High risk with MnO₂ types. Flag all candidates. For polymer types, risk is lower but still elevated. |
| **Unknown** | Assume worst case. Flag for Application Review. |

**Affected attributes:**
- `Voltage Rating` → threshold, but effective minimum is 2× operating voltage if following derating rule
- `Failure Mode` → risk assessment changes with voltage derating

#### Question 3: Does the circuit have inrush/surge protection?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — series resistance ≥1Ω/V or soft-start** | Surge current is managed. Standard matching on ESR and voltage. |
| **No — hard power-on into capacitor** | Surge current / inrush protection becomes Application Review. MnO₂ types are particularly vulnerable. |

**Affected attributes:**
- `Surge Current / Inrush` → Application Review, critical without protection
- `ESR` → lower ESR = higher inrush current = more risk without protection

---

### 7. RF / Signal Inductors (Family 72)

**Context sensitivity: HIGH**

This is a variant of Power Inductors (Family 71) but with inverted priorities. Q factor and SRF replace Isat as the dominant concerns. Context questions reflect the RF/signal domain rather than power conversion.

#### Question 1: What is the operating frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific frequency (e.g., 13.56MHz, 433MHz, 2.4GHz)** | Q factor must be verified at this specific frequency (Q is frequency-dependent). SRF must be well above this frequency (rule of thumb: SRF ≥ 10× operating frequency). Core material suitability depends on frequency — ferrite cores become lossy above ~10MHz; air core or ceramic is needed for UHF+. |
| **Broadband / wideband** | Q factor must be adequate across the full band. SRF must be above the highest frequency of interest. Flag for impedance curve review. |
| **Unknown** | Flag all candidates for Application Review on frequency suitability. Do not substitute without knowing the operating frequency. |

**Affected attributes:**
- `Q Factor` → can be evaluated at the specific frequency if known
- `SRF (Self-Resonant Frequency)` → threshold becomes quantitatively verifiable (must be ≥10× operating freq)
- `Core Material` → air core required above ~100MHz, ceramic core for moderate RF, ferrite only for low-MHz

#### Question 2: What Q factor is required?

| Answer | Effect on Matching |
|--------|-------------------|
| **High Q (>50) — tuned filter, oscillator, matching network** | Q factor becomes a hard threshold. Core material must support high Q (air core, ceramic). Shielding may reduce Q — verify trade-off. Inductance tolerance becomes critical (tight = less detuning). |
| **Moderate Q (20–50) — general signal filtering** | Standard Q matching. More core material options available. |
| **Low Q acceptable (<20) — broadband / non-resonant** | Q is a soft threshold. Focus shifts to inductance accuracy and SRF. |

**Affected attributes:**
- `Q Factor` → threshold tightens for high-Q applications
- `Core Material` → air core / ceramic required for highest Q
- `Shielding` → Application Review (shielding reduces Q due to eddy current losses)
- `Inductance Tolerance` → tightens for tuned circuits (detuning risk)

#### Question 3: Is EMI shielding required?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — shielded required** | Shielding flag becomes mandatory. But note: shielded RF inductors have lower Q than unshielded due to eddy current losses in the shield. The original design made a deliberate trade-off — match it. |
| **No / don't know** | Shielded can replace unshielded (upgrade), but verify Q impact. |

**Affected attributes:**
- `Shielding` → Identity (Flag), mandatory if required
- `Q Factor` → Application Review (verify Q is still adequate with shielding)

---

### 8. Current Sense Resistors (Family 54)

**Context sensitivity: MODERATE-HIGH**

This is a variant of Chip Resistors (Family 52) with tightened thresholds and additional attributes. Context questions focus on measurement precision and circuit topology.

#### Question 1: Is this a Kelvin (4-terminal) sensing application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — 4-terminal Kelvin sensing pads on PCB** | Kelvin sensing flag becomes MANDATORY. A 2-terminal resistor physically cannot replace a 4-terminal one — the sense pads on the PCB connect to pads that don't exist on a 2-terminal part. This is a hard physical constraint, not just a performance preference. |
| **No — standard 2-terminal** | 4-terminal replacements are acceptable (they work in 2-terminal footprints with reduced benefit), but 2-terminal is fine. |

**Affected attributes:**
- `Kelvin (4-Terminal) Sensing` → Identity (Flag), mandatory if yes
- `Package / Footprint` → 4-terminal parts have a different pad layout

#### Question 2: What measurement precision is required?

| Answer | Effect on Matching |
|--------|-------------------|
| **High precision (<1% system accuracy)** | Tolerance ≤0.5%. TCR ≤15 ppm/°C. Metal element / metal strip composition. Long-term stability/drift becomes a concern. Reverse-geometry or low-inductance package may be needed. |
| **Standard precision (1–5% system accuracy)** | Tolerance ≤1%. TCR ≤50 ppm/°C. Thick film is acceptable. |
| **Rough sensing (>5% system accuracy)** | Tolerance ≤5%. TCR ≤100 ppm/°C. Standard chip resistor matching is largely sufficient. |

**Affected attributes:**
- `Tolerance` → threshold tightens with precision
- `TCR` → threshold tightens with precision
- `Composition` → metal element/strip required for high precision
- `Parasitic Inductance` → Application Review for high precision at high frequency
- `Long-Term Stability / Drift` → escalates to primary for high precision

#### Question 3: What is the switching frequency of the current being measured?

| Answer | Effect on Matching |
|--------|-------------------|
| **DC or low frequency (<10kHz)** | Parasitic inductance is not a concern. Standard package geometry is fine. |
| **High frequency (>100kHz switching converter)** | Parasitic inductance becomes Application Review. Reverse-geometry packages (e.g., 0612 instead of 1206) or metal strip types have lower inductance. Standard wirewound or high-inductance types will corrupt the measurement at high frequency. |
| **Unknown** | Flag parasitic inductance for review. |

**Affected attributes:**
- `Parasitic Inductance` → Application Review, critical at high switching frequencies
- `Package` → reverse-geometry preferred for high-frequency sensing

---

### 9. Varistors / MOVs (Family 65)

**Context sensitivity: MODERATE-HIGH**

#### Question 1: What is the transient source / application type?

| Answer | Effect on Matching |
|--------|-------------------|
| **AC mains surge protection (lightning, switching transients)** | Safety rating (UL 1449, IEC 61643) becomes MANDATORY. Thermal disconnect / fuse becomes MANDATORY for UL compliance. Energy rating and peak surge current (8/20µs waveform) are PRIMARY. Maximum continuous AC voltage must cover mains voltage. |
| **DC bus / automotive protection (load dump, inductive spikes)** | Safety rating is not required. Maximum continuous DC voltage is primary. Peak surge current matters but energy requirements are often lower than mains applications. AEC-Q200 may be required for automotive. Response time becomes more important (DC transients can be faster). |
| **ESD / signal-line protection** | Small SMD form factor. Low capacitance becomes important (high capacitance on a signal line degrades signal integrity). Response time is primary. Energy rating is secondary (ESD pulses are low energy). Clamping voltage must be tight enough to protect sensitive ICs. |

**Affected attributes:**
- `Safety Rating (UL, IEC)` → mandatory for mains, not applicable for DC/ESD
- `Thermal Disconnect / Fuse` → mandatory for mains UL compliance
- `Energy Rating (Joules)` → primary for mains, secondary for ESD
- `Peak Surge Current (8/20µs)` → primary for mains/DC, secondary for ESD
- `Maximum Continuous Voltage (AC/DC)` → must match the application voltage type
- `Clamping Voltage` → critical for ESD/signal protection (tight clamping needed)
- `Response Time` → primary for DC/ESD, secondary for mains (MOVs are inherently fast enough for 50/60Hz)
- `AEC-Q200` → flag for automotive DC applications
- `Leakage Current` → important for battery-powered DC applications

#### Question 2 (if mains): Does the original have a thermal disconnect / fuse?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | Replacement MUST also have a thermal disconnect. This is a safety feature that prevents thermal runaway from causing a fire. Non-negotiable for UL-listed SPDs. |
| **No / bare MOV** | Thermal disconnect is not required but may be an upgrade. Verify the circuit has external overcurrent protection (fuse upstream of the MOV). |
| **Unknown** | Flag as Application Review — inspect the original part or circuit design before substitution. |

**Affected attributes:**
- `Thermal Disconnect / Fuse` → Identity (Flag), mandatory if original has one

#### Question 3: Is this in an automotive application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q200 becomes mandatory. Operating temp range must cover automotive (-40°C to +125°C typically). Surge ratings must cover automotive transients (ISO 7637 load dump: up to 40V/100A on 12V systems). |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q200` → Identity (Flag) for automotive
- `Operating Temp Range` → must cover automotive range
- `Peak Surge Current` → must cover automotive transient standards

---

### 10. PTC Resettable Fuses (Family 66)

**Context sensitivity: MODERATE-HIGH**

#### Question 1: What is the maximum circuit voltage?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific voltage (e.g., 5V, 12V, 24V, 48V)** | This is the MOST CRITICAL context question. The circuit voltage appears across the PTC fuse when it trips. Vmax of the replacement must exceed this voltage. A 6V-rated PTC fuse on a 12V circuit will arc, crack, or fail permanently when tripped — potentially causing a fire instead of providing protection. This is the single most common and most dangerous PTC fuse substitution mistake. |
| **Unknown** | Do NOT proceed without determining circuit voltage. Flag as mandatory Application Review. |

**Affected attributes:**
- `Maximum Voltage (Vmax)` → hard threshold, non-negotiable
- This question should BLOCK the matching engine from returning results if unanswered

#### Question 2: What is the ambient operating temperature?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific temperature (e.g., 25°C, 50°C, 85°C)** | PTC fuses derate severely with temperature. At 50°C ambient, hold current may drop to 60–70% of the 25°C rating. At 85°C, it may be below 50%. The replacement must provide adequate hold current at the actual ambient temperature, not just at 25°C. Enables quantitative derating check. |
| **Room temperature (20–30°C)** | Use nominal 25°C ratings. Minimal derating concern. |
| **Unknown** | Flag for Application Review with derating curve note. |

**Affected attributes:**
- `Hold Current (Ihold)` → effective value derates with temperature
- `Trip Current (Itrip)` → effective value derates with temperature
- `Operating Temp Range` → must cover actual ambient

#### Question 3: Will the fuse experience frequent trip/reset cycles?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — frequent faults expected (e.g., USB port, user-accessible connector)** | Endurance (trip/reset cycles) becomes primary. Post-trip resistance creep becomes Application Review — after many cycles, the initial resistance increases, which causes more voltage drop. On low-voltage circuits (3.3V, 5V), this voltage drop may become unacceptable. |
| **No — fault is a rare event** | Endurance is secondary. Standard cycle rating is sufficient. |

**Affected attributes:**
- `Endurance (Trip/Reset Cycles)` → escalates to primary for frequent-cycling applications
- `Post-Trip Resistance (R1max)` → Application Review for low-voltage circuits with frequent cycling
- `Initial Resistance` → becomes more important (starting point for resistance creep)

---

### 11. Power Inductors (Family 71)

**Context sensitivity: MODERATE-HIGH**

#### Question 1: What type of converter/circuit is this in?

| Answer | Effect on Matching |
|--------|-------------------|
| **Buck/boost/buck-boost switching converter** | Both Isat and Irms are critical. Core material saturation behavior matters — hard saturation (ferrite) vs. soft saturation (composite/powder). Hard saturation causes abrupt current runaway; soft saturation is more forgiving. |
| **LDO output / general filtering** | Irms is primary (thermal). Isat is less critical because there's no switching-induced current peaks. Core material matters less. |
| **EMI filter / common mode** | Should be using a different component (common mode choke or ferrite bead). Flag potential misclassification. |

**Affected attributes:**
- `Isat (Saturation Current)` → critical for switchers, less so for linear
- `Core Material` → hard vs. soft saturation matters for switcher stability
- `L-vs-I Curve (DC Bias Derating)` → Application Review for switchers
- `Shielding` → important for switchers (EMI), less so for linear

#### Question 2: What is the actual operating DC current?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific value** | Check Isat and Irms thresholds quantitatively. Verify inductance retention at this current using L-vs-I curve. |
| **Unknown** | Flag for Application Review on Isat derating. |

**Affected attributes:**
- `Isat` → threshold becomes quantitatively verifiable
- `Irms` → threshold becomes quantitatively verifiable
- `L-vs-I Curve` → Application Review, can evaluate if current is known

#### Question 3: Is EMI shielding required?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — shielded inductor required** | Shielding flag becomes mandatory. Unshielded cannot replace shielded. |
| **No / don't know** | Shielded can always replace unshielded (upgrade). |

**Affected attributes:**
- `Shielding` → Identity (Flag), mandatory if required

---

### 12. Aluminum Electrolytic Capacitors (Family 58)

**Context sensitivity: MODERATE**

#### Question 1: What is the switching/ripple frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **120Hz (mains rectification)** | Ripple current is specified at 120Hz. Use the datasheet value directly. |
| **Specific high frequency (e.g., 100kHz switching supply)** | Ripple current INCREASES at higher frequencies (multipliers: 1.4–1.7× at 100kHz vs. 120Hz). The replacement must have equivalent or better high-frequency ripple current capability. |
| **Unknown** | Use 120Hz as baseline; flag for review if used in a switching converter. |

**Affected attributes:**
- `Ripple Current` → threshold, but effective value changes with frequency multiplier
- `ESR` → ESR decreases at higher frequencies; relevant for switching apps

#### Question 2: What is the actual ambient temperature?

| Answer | Effect on Matching |
|--------|-------------------|
| **Specific temperature** | Enables lifetime calculation. Lifetime doubles every 10°C below rated temp (Arrhenius rule). A 2,000hr/105°C cap at 65°C ambient has ~32,000hr effective lifetime. |
| **Unknown** | Cannot optimize for lifetime. Use rated lifetime as the hard threshold. |

**Affected attributes:**
- `Lifetime / Endurance` → threshold, but effective life depends on actual temp
- `Operating Temp Range` → range must cover actual ambient

#### Question 3: Is this a polarized or non-polarized application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Polarized (DC with consistent polarity)** | Standard polar electrolytics are fine. |
| **Non-polarized / bipolar (AC coupling, crossover networks)** | Bipolar/non-polarized electrolytics required. A standard polar cap CANNOT be used in an AC application — reverse voltage causes gas generation and venting. |

**Affected attributes:**
- `Polarization` → Identity, exact match required

---

### 13. Supercapacitors / EDLCs (Family 61)

**Context sensitivity: MODERATE**

#### Question 1: What is the primary function?

| Answer | Effect on Matching |
|--------|-------------------|
| **Energy backup / hold-up (RTC, SRAM, brownout ride-through)** | Leakage current and self-discharge become PRIMARY — they determine how long the cap holds its charge. Capacitance determines backup duration. Cycle life is secondary (few cycles per day). |
| **Pulse power buffering (GSM bursts, motor starts, regenerative braking)** | ESR and peak current become PRIMARY — they determine power delivery capability. Cycle life becomes critical (thousands of cycles per day). Leakage current is secondary. |
| **Energy harvesting buffer** | Leakage current is the DOMINANT spec — must be lower than the harvester's output. Self-discharge rate determines if the cap can accumulate energy over time. |

**Affected attributes:**
- `Leakage Current` → primary for backup and harvesting, secondary for pulse
- `Self-Discharge Rate` → primary for backup and harvesting
- `ESR` → primary for pulse, secondary for backup
- `Peak / Pulse Current` → primary for pulse, not applicable for backup
- `Cycle Life` → primary for pulse (frequent cycling), secondary for backup
- `Lifetime / Endurance` → primary for long-duration backup

#### Question 2: Does the application require cold-start / low-temperature operation?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes (e.g., automotive, outdoor)** | Cold-temperature ESR derating becomes critical. ESR can increase 5–10× at −40°C. Must verify ESR derating curve, not just the 25°C headline spec. |
| **No — indoor/controlled environment** | Standard ESR spec is sufficient. |

**Affected attributes:**
- `ESR` → Application Review, must check cold-temp derating curve
- `Operating Temp Range` → must cover cold extreme

---

### 14. Chassis Mount / High Power Resistors (Family 55)

**Context sensitivity: MODERATE**

This is a variant of Chip Resistors (Family 52). Inherits the base chip resistor context questions plus thermal management context.

#### Question 1: What is the heatsink / thermal setup?

| Answer | Effect on Matching |
|--------|-------------------|
| **Dedicated heatsink with known thermal resistance** | Power rating can be evaluated at the actual heatsink temperature. Thermal resistance (°C/W) of the replacement must be ≤ original to maintain the same junction temperature. The heatsink interface dimensions (bolt hole spacing, tab size) must match exactly. |
| **Chassis-mounted (PCB enclosure wall, metal frame)** | Similar to heatsink but thermal path depends on chassis material and contact quality. Thermal compound / pad interface matters. Power derating must be evaluated at expected chassis temperature. |
| **No heatsink / free-standing** | Power rating is severely derated. A 50W resistor with no heatsink may only safely dissipate 5–10W. The replacement must match or exceed the free-air derating. |

**Affected attributes:**
- `Thermal Resistance (°C/W)` → threshold becomes quantitatively evaluable
- `Power Rating` → effective rating depends on thermal setup
- `Heatsink Interface Dimensions` → Identity (Fit), must match mounting

#### Question 2: Is forced airflow present?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — fan-cooled** | Power rating improves with airflow. Some manufacturers specify separate ratings for natural convection vs. forced air. |
| **No — natural convection only** | Use the natural convection power rating. |

**Affected attributes:**
- `Power Rating` → use correct derating (natural convection vs. forced air)

#### Question 3 (inherited): Precision or harsh environment?

Same as Chip Resistors (Family 52) Q1 and Q2. If the project context already answers environment, skip.

---

### 15. Aluminum Polymer Capacitors (Family 60)

**Context sensitivity: LOW-MODERATE**

Inherits from Aluminum Electrolytic (Family 58) with modifications. Lifetime/endurance questions are removed (polymer doesn't dry out). Ripple frequency still matters.

#### Question 1: What is the switching/ripple frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **120Hz (mains rectification)** | Use the datasheet ripple current value directly. |
| **Specific high frequency (e.g., 100kHz switching supply)** | Aluminum polymer caps handle high-frequency ripple better than liquid electrolytics due to lower ESR, but still verify the replacement's ripple current rating at the actual frequency. |
| **Unknown** | Use 120Hz baseline. |

**Affected attributes:**
- `Ripple Current` → threshold, verify at actual frequency
- `ESR` → primary attribute (this is the main reason engineers choose polymer)

#### Question 2: Is ESR the primary selection criterion?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — chosen specifically for low ESR** | ESR threshold becomes very tight. A replacement polymer cap with 2× the ESR defeats the purpose. |
| **No — general decoupling / filtering** | Standard ESR matching is sufficient. |

**Affected attributes:**
- `ESR` → threshold tightens if ESR is the primary reason for choosing polymer

**Note:** Ambient temperature and polarization questions are inherited from aluminum electrolytic context but lifetime calculation is not applicable (no Arrhenius-style dry-out for polymer).

---

### 16. Chip Resistors (Family 52)

**Context sensitivity: LOW**

Chip resistors are the most straightforward parametric match. Only two context questions matter:

#### Question 1: Is this a precision / instrumentation application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | TCR and tolerance thresholds tighten. Thin film composition may be required (lower TCR, tighter tolerance than thick film). Long-term stability/drift matters. |
| **No** | Standard parametric matching is sufficient. |

**Affected attributes:**
- `Tolerance` → threshold tightens
- `TCR` → threshold tightens
- `Composition` → thin film preferred/required

#### Question 2: Is this in a harsh / industrial / automotive environment?

| Answer | Effect on Matching |
|--------|-------------------|
| **Automotive** | AEC-Q200 becomes mandatory. |
| **Industrial with sulfur exposure** | Anti-sulfur flag becomes mandatory. |
| **Standard** | No additional flags. |

**Affected attributes:**
- `AEC-Q200` → Identity (Flag) for automotive
- `Anti-Sulfur` → Identity (Flag) for harsh/industrial

---

### 17. Through-Hole Resistors (Family 53)

**Context sensitivity: LOW**

Inherits all context from Chip Resistors (Family 52). No additional application context questions — lead spacing and body dimensions are physical constraints determined by the original part, not by the application.

#### Questions: Same as Chip Resistors (Family 52)

1. Precision / instrumentation application?
2. Harsh / industrial / automotive environment?

No additional questions. The delta attributes (lead spacing, mounting style, body dimensions) are resolved from the original part's physical specifications, not from application context.

---

### 18. Mica Capacitors (Family 13)

**Context sensitivity: LOW**

Mica capacitors are chosen for precision — that decision was already made when the engineer specified mica. The application context is largely implied by the choice of dielectric.

#### Question 1: What environment?

| Answer | Effect on Matching |
|--------|-------------------|
| **Automotive** | AEC-Q200 becomes mandatory (if available — mica caps in automotive are rare). |
| **Military / aerospace** | MIL-spec compliance may be required. Tighter temperature range and tolerance. |
| **Standard** | No additional flags. |

**Affected attributes:**
- `AEC-Q200` → Identity (Flag) for automotive
- MIL-spec compliance → Identity (Flag) for military

**Note:** DC bias derating, flex termination, and piezoelectric noise questions from the base MLCC table are NOT asked for mica — these issues don't apply to mica dielectric (removed in the delta document).

---

## Block B: Discrete Semiconductors

---

### 19. MOSFETs — N-Channel and P-Channel (Family B5)

**Context sensitivity: HIGH**

MOSFETs are the most complex discrete semiconductor family. The single most important bifurcation is operating mode: a MOSFET in linear (partial-conduction) mode has completely different matching priorities than one in switching mode. Within switching mode, frequency and topology determine whether Rds(on) or gate charge parameters are dominant.

#### Question 1: What is the operating mode?

| Answer | Effect on Matching |
|--------|-------------------|
| **Switching mode (PWM switch, synchronous rectifier, half-bridge, full-bridge)** | Gate charge parameters (Qg, Qgd, Qgs) become primary at higher frequencies. Rds(on) is the dominant conduction-loss spec. SOA curves are not a primary concern — the MOSFET is either fully on or fully off. Body diode behavior becomes critical in bridge/synchronous topologies. Proceed to Q2 for frequency context. |
| **Linear mode (hot-swap controller, eFuse, soft-start, motor speed via variable resistance, USB current limiter)** | SOA curves become the PRIMARY specification — the MOSFET operates in partial conduction for extended periods. Rθjc becomes critical because sustained partial-conduction dissipates maximum power. Rds(on) and gate charge are secondary. BLOCKING: flag all linear-mode substitutions for mandatory engineering SOA curve review. The SOA curves of original and replacement must be compared graphically at the expected (Vds, Id, pulse width) operating point. |

**Affected attributes:**
- `SOA Curves` → escalates to mandatory review for linear mode; secondary for switching
- `Rθjc` → escalates to primary for linear mode (sustained partial conduction = sustained high power)
- `Qg / Qgd / Qgs` → primary for switching, secondary for linear
- `Rds(on)` → primary for both modes but for different reasons (conduction loss in switching; power dissipation ceiling in linear)

#### Question 2 (if switching): What is the switching frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **Line frequency / low frequency (<10kHz) — e.g., motor drives, load switches, battery management** | Rds(on) DOMINATES — conduction losses far exceed switching losses at low frequency. Gate charge (Qg, Qgd) is nearly irrelevant (the gate driver can take its time). Body diode characteristics matter mainly in bridge topologies. Focus matching on Rds(on) and thermal specs. |
| **Mid frequency (10kHz–200kHz) — e.g., typical DC-DC converters, synchronous buck/boost** | Rds(on) and gate charge are BOTH significant. The Rds(on) × Qg figure of merit becomes the key selection criterion. Qgd is important for hard-switching topologies. Body diode trr matters in synchronous topologies above ~50kHz. |
| **High frequency (200kHz–1MHz) — e.g., high-density converters, class D audio** | Gate charge (Qg, Qgd, Qgs) becomes DOMINANT — switching losses are proportional to fsw and scale much faster than conduction losses. Coss losses grow significantly. Rds(on) is still important but secondary to gate charge. Body diode trr is a hard concern in synchronous topologies. |
| **Very high frequency (>1MHz) — e.g., GaN-based converters, resonant topologies** | Gate charge is CRITICAL. At this frequency range, SiC or GaN is almost always the correct technology — Si MOSFETs are generally too slow for efficient operation. Flag for engineering review if the original is a Si MOSFET at >1MHz. Coss and Crss become primary constraints. |

**Affected attributes:**
- `Rds(on)` → dominant spec at <10kHz, balanced at 10–200kHz, secondary at >200kHz
- `Qg / Qgd / Qgs` → secondary at <10kHz, balanced at 10–200kHz, dominant at >200kHz
- `Coss` → escalates at very high frequencies; critical in resonant topologies
- `Body Diode trr` → critical concern above 50kHz in synchronous topologies
- `Technology (Si/SiC/GaN)` → flag for engineering review if Si at >1MHz

#### Question 3 (if switching): Hard switching or soft switching (resonant / ZVS / ZCS)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Hard switching (conventional PWM — buck, boost, flyback, forward)** | Qgd (Miller charge) is the primary switching loss driver — minimize. Coss contributes capacitive switching losses — lower is better (Threshold ≤). During turn-on, full Vds voltage and full Id current overlap — switching losses scale with Qgd × Vds × fsw. |
| **Soft switching / resonant (ZVS full-bridge, LLC resonant, CRM, quasi-resonant)** | Coss must be verified against the resonant tank design — the circuit depends on Coss to resonate the drain voltage to zero (ZVS) before turn-on. A replacement with different Coss shifts the resonant frequency and ZVS window. Qgd is less critical because the drain voltage is already at zero when the gate turns on. Coss matching becomes an Application Review requirement. |
| **Unknown** | Default to hard-switching rules. Flag Coss for engineering review. |

**Affected attributes:**
- `Qgd` → hard Threshold ≤ for hard switching; less critical for soft switching
- `Coss` → escalates to Application Review for soft/resonant (must match resonant design); Threshold ≤ for hard switching
- `Crss` → more critical in hard switching (drain-to-gate feedback during transitions)

#### Question 4 (if switching): Does the topology include synchronous rectification or a half/full-bridge with body diode conduction during dead time?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — body diode conducts during dead time (synchronous buck/boost, half-bridge, full-bridge, totem-pole PFC)** | Body diode trr becomes CRITICAL at ≥50kHz. Excessive trr causes shoot-through when the opposing switch turns on while the body diode is still conducting — catastrophic at high frequency. BLOCKING at ≥50kHz: must verify body diode trr before approving substitution. Body diode Vf directly impacts dead-time conduction losses: Pdead = Id × Vf × tdead × fsw. |
| **No — body diode does not conduct in normal operation (low-side switch only, simple load switch, OR-ing)** | Body diode specs are secondary. trr is not a primary concern. Body diode Vf matters only as a fault-condition characteristic. |

**Affected attributes:**
- `Body Diode trr` → escalates to BLOCKING specification for synchronous topologies at ≥50kHz
- `Body Diode Vf` → escalates to Threshold ≤ for synchronous topologies (dead-time loss calculation)
- `Qgs` → more critical in bridge topologies (dV/dt-induced turn-on risk from Crss coupling)

#### Question 5: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Operating temp range must cover -40°C to +125°C (or +150°C for underhood). Gate oxide reliability and UIS (avalanche) testing must be part of manufacturer qualification. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag), mandatory for automotive
- `Operating Temp Range` → must cover full automotive temperature range
- `Avalanche Energy Eas` → AEC-Q101 specifies UIS test conditions; manufacturer must demonstrate compliance

---

### 20. BJTs — NPN and PNP (Family B6)

**Context sensitivity: MODERATE-HIGH**

The most important bifurcation for BJTs is operating mode — saturated switching vs. linear/analog mode. Storage time is a dominant concern only in saturated switching; it is irrelevant in analog applications. hFE must always be evaluated as a curve at the actual operating Ic, not as a single datasheet number.

#### Question 1: What is the operating mode?

| Answer | Effect on Matching |
|--------|-------------------|
| **Saturated switching (digital logic driver, relay driver, solenoid driver, LED driver)** | Storage time (tst) becomes the PRIMARY switching speed concern — it limits maximum operating frequency and causes duty cycle errors. Turn-off time (toff) is dominated by tst. Vce(sat) is the primary conduction loss spec. hFE need only be sufficient to saturate at the required Ic — circuit designers typically overdrive the base by 5–10x minimum hFE. Anti-saturation clamping (Schottky base clamp) may be present in the original design; verify compatibility with replacement. |
| **Linear / analog (amplifier, buffer, linear regulator pass element, current mirror, sensor interface)** | Storage time is IRRELEVANT — the transistor never saturates. hFE at the actual operating Ic and temperature becomes PRIMARY. ft determines bandwidth. SOA becomes critical if the transistor operates at high Vce with significant Ic (class A output, linear regulator). Vce(sat) is secondary (the transistor does not reach saturation). |
| **Class AB / push-pull output stage (audio amplifier, motor driver complementary pair)** | Both switching speed and analog performance matter. hFE matching between the NPN and PNP halves is critical for symmetrical behavior. Vbe(on) matching between the pair determines crossover distortion in class AB stages. SOA verification is required for the quiescent operating point. Treat as a COMPLEMENTARY PAIR substitution — both devices must be evaluated together. |

**Affected attributes:**
- `Storage Time tst` → primary concern for saturated switching; not applicable for linear/analog
- `Turn-Off Time toff` → primary for switching; not applicable for linear
- `hFE` → minimum hFE matters for switching saturation; curve shape at operating Ic matters for analog
- `ft` → secondary for switching; primary for analog/RF bandwidth
- `SOA Curves` → mandatory review for linear mode and class AB output stages
- `Vce(sat)` → primary for switching conduction loss; not a concern in linear mode

#### Question 2 (if saturated switching): What is the switching frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **Low frequency (<10kHz) — relay drivers, solenoid drivers, LED drivers** | Storage time is a concern but not critical at low frequency — even a tst of 2µs is negligible at 1kHz. Standard BJT switching parameters are adequate. Focus on Vce(sat) and base drive adequacy. |
| **Medium frequency (10kHz–100kHz) — PWM motor control, power supply housekeeping, audio PWM** | Storage time becomes a meaningful constraint. tst must fit within the off period. Anti-saturation techniques (Schottky clamp) become important. Verify tst at the operating Ic and base drive conditions — it is temperature-dependent and worsens with heat. |
| **High frequency (>100kHz) — high-speed logic drivers, switching regulators using BJTs** | Storage time is CRITICAL and likely the binding switching-speed constraint. Actively evaluate tst, ton, toff at the operating conditions. High-ft transistors specifically designed for fast switching (e.g., types with ton/toff specified in datasheet) required. Consider whether the original design uses a Schottky clamp and whether the replacement supports it. |

**Affected attributes:**
- `Storage Time tst` → threshold tightens with frequency; BLOCKING concern at >100kHz if tst is long
- `Turn-On/Turn-Off Time` → more critical at higher frequencies
- `ft` → threshold tightens with switching frequency

#### Question 3 (if linear/analog): Is this a complementary pair application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — NPN and PNP are paired (push-pull output, H-bridge, complementary symmetry amplifier)** | Both the NPN and PNP halves must be evaluated together as a matched pair. Replacing only one half requires that the replacement's hFE, ft, Vbe(on), and Vce(sat) closely match the remaining original device. When possible, replace both devices with a known complementary pair (e.g., BC546/BC556, 2N3904/2N3906, 2SA1943/2SC5200). Flag for engineering review if only one half is available. |
| **No — single transistor, current mirror, or differential pair with matched devices of same polarity** | Standard single-device substitution rules apply. For differential pairs (matched NPN–NPN or PNP–PNP), hFE matching between the two devices in the pair matters for offset voltage; replacing only one transistor in a matched pair degrades offset performance. |

**Affected attributes:**
- `hFE` → matching between pair members becomes a concern in complementary stages
- `Vbe(on)` → matching between NPN and PNP halves determines crossover distortion in class AB
- `ft` → matching between pair halves determines slew rate symmetry
- `SOA Curves` → both halves must be verified for the same operating point

#### Question 4: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Operating temp range must cover -40°C to +125°C. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag), mandatory for automotive
- `Operating Temp Range` → must cover automotive range

---

### 21. IGBTs — Insulated Gate Bipolar Transistors (Family B7)

**Context sensitivity: HIGH**

The single most important bifurcation is switching frequency — it determines whether the tail current and Eoff budget are viable, and whether the application even belongs in IGBT territory (above ~100kHz, SiC MOSFETs are generally the correct technology). IGBT technology type (PT/NPT/FS) becomes a hard Identity constraint in parallel multi-device designs.

#### Question 1: What is the switching frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **Low frequency (≤20kHz) — motor drives, UPS, welders, induction heating** | Tail current and Eoff are less critical as a frequency multiplier. Vce(sat) and conduction loss dominate total device losses. Standard PT or NPT IGBTs are viable. Eoff threshold still applies but the Eoff × fsw product is manageable. |
| **Medium frequency (20kHz–50kHz) — high-performance servo drives, high-efficiency inverters** | Tail current becomes a meaningful constraint. Field-Stop (FS) IGBTs are strongly preferred — their faster, controlled tails have lower Eoff at these frequencies. Verify Eoff × fsw fits within the thermal budget. |
| **High frequency (50kHz–100kHz) — high-density power supplies, high-speed servo** | Field-Stop IGBTs required. Eoff is now a primary selection criterion alongside Vce(sat). Gate charge (Qg, Qgc) matters more at higher fsw. Engineering review recommended — at this frequency, SiC MOSFETs may be a better long-term solution. |
| **>100kHz** | Standard silicon IGBTs are not viable — tail current makes efficiency unacceptable. Flag for engineering review: the original design may have used a specialized fast IGBT, or the frequency specification may be incorrect. SiC MOSFET is almost certainly the correct technology at these frequencies. |

**Affected attributes:**
- `Tail Current / Tail Time` → primary concern at ≥20kHz; manageable at <20kHz
- `Eoff` → threshold tightens with frequency (Psw = Eoff × fsw must fit thermal budget)
- `IGBT Technology (PT/NPT/FS)` → FS required above ~20kHz for acceptable tail performance
- `Qg / Qgc` → weight increases with frequency

#### Question 2: Hard switching or soft switching (resonant / ZVS)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Hard switching (conventional PWM)** | Eon and Eoff are both primary loss drivers — both scale with Vbus and current. Qgc (Miller charge) determines switching transition speed. Diode reverse recovery directly contributes to Eon — co-packaged diode trr must be verified. |
| **Soft switching / resonant (ZVS LLC, resonant induction heating)** | Eon is dramatically reduced (drain voltage is near zero at turn-on under ZVS). Eoff is still relevant (current is not zero at turn-off in most resonant topologies). The IGBT's output capacitance and body characteristics interact with the resonant tank — flag for engineering review if the replacement has significantly different Coes. |

**Affected attributes:**
- `Eon` → primary for hard switching; reduced concern for soft switching (ZVS)
- `Eoff` → primary for both (current is rarely zero at turn-off in resonant topologies)
- `Co-Packaged Diode trr` → critical for hard switching; less so for soft switching
- `Qgc` → primary for hard switching transition speed

#### Question 3: Are multiple IGBTs operated in parallel?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — parallel IGBTs (common in high-current motor drives, traction inverters)** | IGBT Technology (PT/NPT/FS) becomes an Identity constraint — do not mix PT with NPT/FS in parallel. Field-Stop is strongly preferred for its positive Vce(sat) TC at high currents. Vce(sat) spread between individual devices must be minimized — narrow-tolerance or matched-lot selection may be required. Individual gate resistors are required for each parallel device to prevent high-speed current sharing oscillation. |
| **No — single device** | Technology type is still an Identity match per the logic table but parallel-specific constraints (TC matching) do not apply. Standard substitution rules govern. |

**Affected attributes:**
- `IGBT Technology` → escalates to hard Identity gate — no cross-technology mixing in parallel
- `Vce(sat)` → device-to-device spread becomes a concern; narrow tolerance selection may be required
- `Vge(th)` → matching between parallel devices reduces turn-on time spread

#### Question 4: Does the application require short-circuit protection (motor drive, traction, servo)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — short-circuit protection is part of the gate driver design** | Short-circuit withstand time (tsc) becomes CRITICAL. Replacement tsc must ≥ original AND ≥ the gate driver's response time. Short-circuit current Isc affects the desaturation detection threshold — flag for recalibration review if Isc differs significantly. AEC-Q101 mandatory for automotive. |
| **No — application does not require short-circuit survivability (simple DC chopper, resistive load)** | tsc is secondary. Standard switching performance matching governs. |

**Affected attributes:**
- `Short-Circuit Withstand Time tsc` → escalates to BLOCKING specification for motor drive / traction applications
- `Short-Circuit Current Isc` → Application Review; affects protection threshold calibration
- `AEC-Q101` → mandatory for automotive traction

#### Question 5: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Operating temp range must cover -40°C to +175°C (junction) for underhood traction applications. Vce(sat) stability over lifetime and temperature cycling are scrutinized in automotive qualification. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag), mandatory for automotive
- `Tj Max` → must cover automotive temperature range (often 175°C for traction)
- `Operating Temp Range` → must cover full automotive ambient range

---

### 22. Thyristors / TRIACs / SCRs (Family B8)

**Context sensitivity: MODERATE**

The most critical question is always device sub-type — SCR, TRIAC, and DIAC are not substitutable for each other without circuit redesign. Within TRIACs, the triggering quadrant used by the gate drive circuit and snubberless rating are hard Identity constraints. Gate sensitivity class is also an Identity match, not a threshold — it must be evaluated against the gate drive's actual current capability.

#### Question 1: What is the device sub-type?

| Answer | Effect on Matching |
|--------|-------------------|
| **SCR (Silicon Controlled Rectifier)** | Unidirectional device — conducts only anode-to-cathode. Gate trigger parameters (IGT, VGT), holding current (IH), latching current (IL), and circuit-commutated turn-off time (tq) are all relevant. Current rating is IT(AV) (average). TRIAC-specific attributes (quadrant operation, snubberless flag, IT(RMS)) are not applicable. |
| **TRIAC** | Bidirectional device — conducts in both directions. Quadrant operation becomes a critical evaluation dimension. Snubberless flag becomes relevant. Current rating is IT(RMS) (RMS). tq (circuit-commutated turn-off time) is not applicable — TRIACs rely on natural AC commutation. |
| **DIAC** | Two-terminal, no gate, triggers symmetrically at breakover voltage. Gate parameters (IGT, VGT, IH, IL) are not applicable. Key specs are breakover voltage (VBO) symmetry and switching current. Almost always used as a TRIAC trigger device — match VBO to the original for consistent phase-control behavior. |

**Affected attributes:**
- `Device Sub-Type` → Identity, gates all other attribute relevance
- `IT(AV) vs IT(RMS)` → use AV for SCRs, RMS for TRIACs
- `tq (turn-off time)` → only applicable for SCRs in forced-commutation DC circuits
- `Quadrant Operation, Snubberless Rating` → TRIAC-only, not evaluated for SCRs/DIACs

#### Question 2: What is the application type?

| Answer | Effect on Matching |
|--------|-------------------|
| **AC phase control (light dimmer, heater controller, motor speed control via phase angle)** | Firing angle range determines whether IH and IL are critical — at minimum phase angles (small conduction pulses near zero crossing), current may not rise above IL fast enough to latch, or may dip below IH during the pulse. dV/dt at commutation (when the device turns off naturally at the AC zero crossing) must be within the device's rating. Gate sensitivity class must match the phase-shift network's output current. |
| **Zero-cross switching (solid-state relay, AC contactor replacement)** | IH and IL matter less — full AC half-cycles are conducted, so current easily exceeds both thresholds. dV/dt at initial turn-on (from full line voltage) is the primary concern. Snubberless types are highly preferred for clean switching without transient injection onto the mains. |
| **Crowbar / overvoltage protection (SCR only)** | Once triggered, the SCR must stay latched until the protecting fuse clears or the supply is removed. IH must be low enough that the fault current (potentially limited by a fusible resistor) keeps the SCR latched. Recovery after reset must be clean — tq is irrelevant (DC crowbar relies on fuse clearing, not commutation). |
| **Motor soft-start / AC motor control** | High inrush current at start-up is the primary concern — ITSM and I²t must accommodate motor locked-rotor current for the soft-start duration. Thermal management of sustained conduction at rated motor current. dV/dt during phase control firing. |

**Affected attributes:**
- `IH (Holding Current)` → critical for phase control at low firing angles; less critical for zero-cross
- `IL (Latching Current)` → critical for inductive load phase control; less critical for resistive or zero-cross
- `dV/dt` → primary concern for zero-cross (full line voltage step) and phase-control commutation
- `ITSM / I²t` → primary for motor soft-start and fault-withstand applications

#### Question 3 (if TRIAC): Does the gate drive circuit require Quadrant IV operation (negative MT2, positive gate current)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — gate drive sources positive current during negative MT2 half-cycles (common with single optocoupler driving both half-cycles)** | Quadrant IV (Q4) sensitivity must be verified. Many standard TRIACs have significantly higher IGT in Q4 (2–3× other quadrants) or do not support Q4 at all. The replacement must explicitly support Q4 at the gate drive's available current. Sensitive-gate or logic-level types typically have better Q4 symmetry. |
| **No — gate circuit senses MT2 polarity and uses negative gate current on negative half-cycles (dual-polarity drive)** | Q4 is not required. Standard quadrant sensitivity matching is sufficient. |
| **Unknown / single-sided optocoupler** | Assume Q4 is required. Verify explicitly in replacement datasheet. |

**Affected attributes:**
- `Quadrant Operation` → Identity, Q4 capability becomes a hard gate if required
- `IGT` → must verify at Q4 (worst-case quadrant), not just Q1

#### Question 4: Is a snubber present on the PCB?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — RC snubber is populated** | Standard (non-snubberless) TRIACs are acceptable. Verify the replacement's dV/dt rating ≥ the dV/dt that the existing snubber provides (calculated from snubber R and C values and peak line voltage). |
| **No — no snubber footprint or snubber is not populated** | Replacement MUST be snubberless-rated. A standard TRIAC without snubber will false-trigger from line transients. This is a BLOCKING constraint — do not approve a non-snubberless replacement for a snubberless PCB design. |
| **Unknown** | Flag for engineering review. Inspect the PCB for the presence of an RC network across the TRIAC. |

**Affected attributes:**
- `Snubberless Rating` → BLOCKING for no-snubber designs; not required for snubber-equipped designs
- `dV/dt` → threshold must be ≥ the dV/dt level the snubber (if present) provides, or ≥ line dV/dt for snubberless designs

#### Question 5: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. IGT must be verified at -40°C (cold-start triggering reliability). Operating temperature range must cover automotive range. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag), mandatory for automotive
- `IGT` → must verify at -40°C for automotive cold-start

---

### 23. Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (Family B1)

**Context sensitivity: HIGH**

This is the first Block B (discrete semiconductor) family. Context sensitivity is high because the switching frequency of the application fundamentally determines whether recovery time or forward voltage is the dominant spec — and the circuit topology changes which parameters are primary.

#### Question 1: What is the switching frequency?

| Answer | Effect on Matching |
|--------|-------------------|
| **50/60Hz (mains rectification)** | Recovery time (trr) is IRRELEVANT — even a 5µs standard recovery diode's trr is negligible compared to the 16–20ms period. Forward voltage (Vf) becomes the dominant spec because conduction loss overwhelms switching loss. Standard recovery diodes are preferred (lowest Vf). Reverse recovery charge (Qrr) and recovery behavior (soft/snappy) can be ignored. Junction capacitance (Cj) is irrelevant. |
| **1kHz–50kHz (low-frequency switching, motor drives)** | trr begins to matter. Fast recovery diodes are the minimum. Vf is still important but the Vf/trr trade-off starts to shift. Recovery behavior (soft vs. snappy) starts to matter — snappy recovery generates voltage spikes that scale with frequency. |
| **50kHz–500kHz (SMPS, DC-DC converters)** | trr and Qrr become PRIMARY — switching losses dominate conduction losses. Ultrafast recovery is typically required. Vf is secondary. Recovery behavior becomes critical — snappy recovery causes significant EMI and voltage ringing at these frequencies. Junction capacitance contributes to switching losses. |
| **>500kHz** | The engineer should probably be using a Schottky diode (zero recovery) or SiC diode, not a silicon rectifier. Flag for review — if the original is a silicon rectifier at this frequency, it may be a legacy design. |

**Affected attributes:**
- `Recovery Category` → standard acceptable at 50/60Hz, fast required >1kHz, ultrafast required >50kHz
- `Reverse Recovery Time (trr)` → irrelevant at 50/60Hz, primary above 50kHz
- `Reverse Recovery Charge (Qrr)` → irrelevant at 50/60Hz, primary above 50kHz
- `Forward Voltage (Vf)` → primary at 50/60Hz, secondary above 50kHz
- `Recovery Behavior (Soft/Snappy)` → not applicable at 50/60Hz, Application Review above 1kHz, critical above 50kHz
- `Junction Capacitance (Cj)` → not applicable at 50/60Hz, Application Review above 100kHz

#### Question 2: What is the circuit topology / function?

| Answer | Effect on Matching |
|--------|-------------------|
| **Power supply rectifier (half-bridge, full-bridge, center-tap)** | Standard rectifier application. Io (average current) is the primary current spec. Configuration must match exactly (single, dual common-cathode, dual common-anode, bridge). Ifsm (surge) is important due to capacitor inrush on power-on. Voltage rating must cover the full reverse voltage with margin. |
| **Freewheeling / clamp diode (across inductor or relay coil)** | The diode clamps inductive voltage spikes. Fast/ultrafast recovery is critical regardless of the main circuit's switching frequency — the inductor deenergizes rapidly. Reverse voltage rating must cover the inductive spike voltage, not just the supply voltage. Vf is less critical (the diode only conducts during brief transient events). Forward surge current (Ifsm) must handle the peak inductor current. |
| **OR-ing / redundant power** | Two supplies feed the load through separate diodes. Vf becomes extremely important — any Vf mismatch between the two diodes causes unequal current sharing. Low Vf and matched Vf between the two paths matter. Reverse leakage (Ir) matters because the non-active diode sees continuous reverse bias. Reverse recovery is rarely important (one supply doesn't typically switch off at high frequency). |
| **Reverse polarity protection** | A single diode in series or parallel with the power input. Vf is critical (it's a permanent voltage loss from the supply). Io must handle the full load current. Reverse leakage matters (series protection). Recovery time is irrelevant (the diode doesn't switch during normal operation). |
| **Voltage multiplier / charge pump** | Capacitors and diodes in a ladder configuration. Vf directly reduces the output voltage of each stage. Reverse voltage per diode equals the peak-to-peak input voltage. Recovery time may matter at higher pump frequencies. |

**Affected attributes:**
- `Configuration` → Identity, topology-specific (bridge for full-bridge, dual for center-tap, single for most others)
- `Forward Voltage (Vf)` → escalates to primary for OR-ing, polarity protection, and voltage multipliers
- `Reverse Recovery Time (trr)` → escalates to primary for freewheeling, irrelevant for polarity protection
- `Ifsm (Surge)` → escalates to primary for power supply rectifiers (capacitor inrush) and freewheeling (inductor energy)
- `Reverse Leakage (Ir)` → escalates to primary for OR-ing (continuous reverse bias)
- `Max Repetitive Reverse Voltage (Vrrm)` → must account for inductive spikes for freewheeling, peak-to-peak for multipliers

#### Question 3: Is this a low-voltage application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — supply voltage ≤12V** | Vf becomes the dominant concern regardless of other factors. A 1.1V Vf on a 5V rail is 22% loss. A 0.7V Vf is 14% loss. Every 100mV of Vf difference matters. Flag the engineer to consider Schottky diodes (Vf ≈ 0.3–0.5V) if they haven't already. If the original is a silicon rectifier in a low-voltage application, it may be a legacy design or chosen for a specific reason (higher voltage handling, lower leakage than Schottky). |
| **No — supply voltage >12V** | Standard Vf matching. A 100mV Vf difference on a 48V or 400V rail is negligible. |

**Affected attributes:**
- `Forward Voltage (Vf)` → escalates to dominant spec for low-voltage
- Consider recommending Schottky diode family as alternative → flag in assessment

#### Question 4: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Operating temp range must cover automotive requirements. Note: automotive uses AEC-Q101 for discretes, NOT AEC-Q200 (which is for passives). |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag) for automotive
- `Operating Temp Range` → must cover automotive range (-40°C to +125°C or +150°C)

---

### 24. Schottky Barrier Diodes (Family B2)

**Context sensitivity: MODERATE-HIGH**

Schottky diodes are chosen specifically for low Vf and zero reverse recovery time. The application context is less complex than rectifier diodes because the switching frequency question is largely answered by the choice of Schottky itself — the engineer already decided recovery time matters. The remaining context questions focus on the Vf/Ir trade-off, thermal environment, and whether SiC is involved.

#### Question 1: Is this a low-voltage application (≤12V)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — 3.3V, 5V, or 12V rail** | Vf becomes the absolute dominant spec. Every 50mV of Vf difference is significant. At 3.3V, a 0.45V Schottky drops 14% of the supply. A 0.3V Schottky drops 9%. That 5% efficiency difference may determine battery life. Reverse leakage (Ir) is secondary unless battery-powered. Cj is secondary unless switching >1MHz. |
| **No — higher voltage (>12V)** | Vf is still important but less dominant. Reverse leakage becomes more important because Ir × Vr = leakage power, and at higher voltages, this can be significant heat. Thermal runaway risk increases with voltage. |

**Affected attributes:**
- `Forward Voltage (Vf)` → escalates to absolute dominant for low-voltage
- `Reverse Leakage (Ir)` → secondary for low-voltage (unless battery), primary for high-voltage
- `Junction Capacitance (Cj)` → secondary unless high-frequency

#### Question 2: What is the operating/ambient temperature?

| Answer | Effect on Matching |
|--------|-------------------|
| **High ambient (>60°C) or poor thermal path** | Reverse leakage escalates to critical concern. Schottky Ir approximately doubles every 10°C. A diode with 100µA leakage at 25°C has ~6.4mA at 85°C and ~50mA at 125°C. At high voltage, this leakage dissipates significant power (50mA × 40V = 2W), which further heats the junction — thermal runaway risk. The replacement's Ir at the actual operating temperature must be verified, not just the 25°C headline number. Flag for thermal runaway analysis. |
| **Room temperature / well-cooled** | Standard Ir matching at 25°C is sufficient. Thermal runaway risk is low. |

**Affected attributes:**
- `Reverse Leakage (Ir)` → must evaluate at actual operating temperature, not just 25°C
- `Thermal Resistance (Rθjc, Rθja)` → tighter matching required for high-ambient applications
- `Tj_max` → thermal headroom becomes more important

#### Question 3: Is this silicon or SiC Schottky?

| Answer | Effect on Matching |
|--------|-------------------|
| **Silicon (standard)** | Normal Schottky matching. Voltage ratings typically ≤200V. Vf is the dominant advantage. |
| **SiC (Silicon Carbide)** | Different product category. Voltage ratings 600–1700V. Vf is higher than silicon Schottky (1.2–1.7V) but the advantage is zero recovery + high voltage + temperature stability. A silicon Schottky cannot replace SiC at these voltages. SiC-to-SiC matching focuses on reverse recovery (should be near-zero for both), Vf, and thermal characteristics. |
| **Don't know** | Determine from voltage rating — if Vrrm ≥ 300V, it's almost certainly SiC. Below 200V, almost certainly silicon. 200–300V is a gray zone. |

**Affected attributes:**
- `Semiconductor Material (Si vs SiC)` → Identity (Flag), SiC cannot be replaced by Si at high voltage
- `Forward Voltage (Vf)` → different expectations for Si vs SiC
- `Reverse Leakage (Ir)` → SiC has much better temperature stability than Si

#### Question 4: Are diodes operating in parallel?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — paralleled for higher current** | Vf temperature coefficient becomes critical. At high currents, Schottky Vf has a positive tempco (natural current sharing — safe). At low currents, Vf has a negative tempco (thermal runaway risk in parallel — dangerous). Vf matching between paralleled diodes matters. Flag for review of the operating point relative to the tempco crossover. |
| **No** | Vf temperature coefficient is a secondary concern. Standard matching. |

**Affected attributes:**
- `Vf Temperature Coefficient` → escalates to primary for parallel operation
- `Forward Voltage (Vf)` → matching between parallel devices matters

#### Question 5: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Operating temp range must cover automotive requirements. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag) for automotive
- `Operating Temp Range` → must cover automotive range

---

### 25. Zener Diodes / Voltage Reference Diodes (Family B3)

**Context sensitivity: MODERATE-HIGH**

Zener diodes serve two fundamentally different purposes — voltage clamping/protection and voltage reference — and the application determines which specs matter. A Zener clamping a relay coil flyback spike cares only about Vz and power. A Zener providing a precision reference voltage for an ADC cares deeply about TC, dynamic impedance, and noise.

#### Question 1: What is the primary function?

| Answer | Effect on Matching |
|--------|-------------------|
| **Voltage clamping / overvoltage protection** | Vz and power dissipation are the only primary specs. Tolerance can be loose (±5% or ±10% is fine). TC is irrelevant — the circuit just needs a clamp level. Dynamic impedance (Zzt) doesn't matter because the voltage doesn't need to be precise. Noise is irrelevant. This is the simplest matching case — almost any Zener with the right Vz and sufficient power rating works. |
| **Voltage reference / precision bias** | TC becomes a primary spec — voltage stability over temperature is the whole point. Dynamic impedance (Zzt) becomes primary — lower Zzt means more stable voltage as current varies. Tolerance tightens to ±2% or ±1%. Noise may matter (especially for ADC reference chains or audio). The Zener voltage near 5.1V has the best TC due to physics — flag if the reference voltage is far from 5.1V. |
| **ESD protection on signal line** | Junction capacitance (Cj) becomes primary — high Cj degrades signal integrity on fast data lines (USB, HDMI, SPI). Reverse leakage (Ir) matters because the Zener sits across the signal line during normal operation. Vz tolerance can be moderate. TC is irrelevant. Configuration matters — multi-line arrays are common for bus protection. |
| **Voltage level shifting** | Vz accuracy at the actual operating current matters more than Vz at Izt. Dynamic impedance determines how much the level shift varies with load current. TC matters if the level shift must be stable over temperature. |

**Affected attributes:**
- `Temperature Coefficient (TC)` → irrelevant for clamping, primary for reference
- `Dynamic Impedance (Zzt)` → irrelevant for clamping, primary for reference/level-shifting
- `Knee Impedance (Zzk)` → Application Review for low-current reference, irrelevant otherwise
- `Tolerance` → loose (±5–10%) for clamping, tight (±1–2%) for reference
- `Junction Capacitance (Cj)` → primary for ESD/signal line, irrelevant for power clamping
- `Reverse Leakage (Ir)` → primary for ESD/signal line, secondary otherwise
- `Regulation Type (noise)` → Application Review for reference, irrelevant for clamping

#### Question 2 (if reference): What precision is needed?

| Answer | Effect on Matching |
|--------|-------------------|
| **High precision (voltage stability <0.1% over temp range)** | TC becomes a hard threshold (≤0.01%/°C). Tolerance ≤1%. Dynamic impedance becomes a hard threshold. Noise voltage must be specified and matched. The engineer should potentially consider a dedicated IC voltage reference (e.g., LM4040, TL431) instead of a Zener — flag this in the assessment if TC requirements are very tight. |
| **Moderate precision (voltage stability 0.1–1%)** | TC ≤0.05%/°C. Tolerance ≤2%. Standard Zzt matching. Noise is secondary. |
| **Coarse reference (voltage stability >1%)** | Standard Vz and tolerance matching. TC is secondary. Zzt is secondary. |

**Affected attributes:**
- `Temperature Coefficient (TC)` → threshold tightens with precision
- `Tolerance` → threshold tightens with precision
- `Dynamic Impedance (Zzt)` → threshold tightens with precision
- Noise voltage → escalates for high precision

#### Question 3 (if ESD/signal): What is the signal speed?

| Answer | Effect on Matching |
|--------|-------------------|
| **High-speed digital (USB 2.0+, HDMI, SPI >10MHz)** | Cj becomes a hard threshold — must be ≤ original. Even a few pF difference matters at high data rates. Consider dedicated ESD protection diodes (TVS arrays) instead of Zeners — they're optimized for low Cj. Flag in assessment. |
| **Low-speed digital or analog (I2C, UART, GPIO, sensor signals)** | Cj is secondary — low-speed signals tolerate higher capacitance. Standard Cj matching is sufficient. |

**Affected attributes:**
- `Junction Capacitance (Cj)` → hard threshold for high-speed, secondary for low-speed

#### Question 4: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Operating temp range must cover automotive requirements. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag) for automotive
- `Operating Temp Range` → must cover automotive range

---

### 26. TVS Diodes — Transient Voltage Suppressors (Family B4)

**Context sensitivity: MODERATE-HIGH**

TVS diodes protect circuits from voltage transients. The application context determines whether the critical specs are surge power handling (power rail) or ultra-low capacitance (signal line), and the transient source determines which surge standard and waveform to match against.

#### Question 1: Is this protecting a power rail or a signal line?

| Answer | Effect on Matching |
|--------|-------------------|
| **Power rail protection** | Peak pulse power (Ppk) and peak pulse current (Ipp) are PRIMARY. Clamping voltage (Vc) must be below the protected circuit's absolute max voltage rating. Junction capacitance (Cj) is IRRELEVANT — power rails tolerate hundreds of pF. Response time is secondary (power surges have µs rise times). Package is typically discrete SMA/SMB/SMC or DO-201 for high power. |
| **Signal-line protection (USB, HDMI, Ethernet, CAN, SPI, I2C)** | Junction capacitance (Cj) becomes PRIMARY — the TVS loads the signal during normal operation. Ultra-low-cap types (<1pF per line) required for high-speed interfaces. ESD rating (IEC 61000-4-2) becomes the primary power spec (not Ppk — signal lines see ESD, not power surges). Package is typically a multi-line array (SOT-23, DFN). Configuration/topology matters — steering diode arrays achieve lowest Cj. |
| **Automotive bus protection (CAN, LIN, FlexRay)** | Combination of both concerns: must handle automotive transients (ISO 7637 load dump — high energy) while maintaining acceptable capacitance for the bus speed. AEC-Q101 mandatory. Clamping voltage must meet the bus transceiver's maximum rating. |

**Affected attributes:**
- `Peak Pulse Power (Ppk)` → primary for power rail, secondary for signal line
- `Peak Pulse Current (Ipp)` → primary for power rail, secondary for signal line
- `Junction Capacitance (Cj)` → irrelevant for power rail, primary for signal line
- `ESD Rating` → secondary for power rail, primary for signal line
- `Configuration/Topology` → steering diode arrays relevant for signal lines
- `AEC-Q101` → mandatory for automotive

#### Question 2: What transient source / surge standard?

| Answer | Effect on Matching |
|--------|-------------------|
| **ESD (human body, IEC 61000-4-2)** | ESD rating is the primary power spec. Pulse waveform is very short (ns-scale). Energy per event is low (µJ–mJ). Response time must be <1ns. Most signal-line TVS are designed for this. |
| **Lightning / power surge (IEC 61000-4-5, 8/20µs)** | Ppk at 8/20µs waveform is the primary spec. Much higher energy than ESD. Power-line TVS required. Cj is irrelevant. |
| **Telecom lightning (GR-1089)** | Specific telecom surge standard. Very high energy. TVS must be explicitly rated for GR-1089 compliance. |
| **Automotive transients (ISO 7637 load dump)** | Very high energy, long duration transients. TVS must be rated for automotive surge profiles. ISO 7637 compliance flag required. |
| **Inductive switching spikes** | Fast transients from relay coils, solenoids, motors. Moderate energy. Fast response matters. Repetitive events — verify the TVS can handle the repetition rate. |

**Affected attributes:**
- `Peak Pulse Power (Ppk)` → must be rated at the correct waveform
- `Surge Standard Compliance` → Identity Flag if original specifies a standard
- `ESD Rating` → primary for ESD applications
- `Response Time` → critical for ESD, less so for power surge

#### Question 3 (if signal-line): What interface speed?

| Answer | Effect on Matching |
|--------|-------------------|
| **High-speed (USB 3.x, HDMI 2.x, PCIe, >1Gbps)** | Cj must be ultra-low (<1pF per line). Steering diode topology preferred. Even 2–3pF is too much — will cause signal integrity failures (eye diagram closure). |
| **Medium-speed (USB 2.0, 100BASE-T Ethernet, SPI >10MHz)** | Cj should be <5pF per line. Standard low-cap TVS arrays work. |
| **Low-speed (I2C, UART, CAN, GPIO, <10MHz)** | Cj up to 15–50pF is acceptable. More TVS options available. Power handling can be higher. |

**Affected attributes:**
- `Junction Capacitance (Cj)` → threshold tightens with signal speed
- `Configuration/Topology` → steering topology preferred for highest speeds

#### Question 4: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 becomes mandatory. Must meet automotive transient profiles. Operating temp range must cover -40°C to +125°C or +150°C. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag) for automotive
- `Surge Standard Compliance` → ISO 7637 for automotive
- `Operating Temp Range` → must cover automotive range

---

### 27. JFETs — Junction Field-Effect Transistors (Family B9)

**Context sensitivity: MODERATE**

The application mode determines which attributes dominate. Low-noise amplifier applications make noise figure and 1/f corner the primary specs. Ultra-high-impedance applications make Igss the binding constraint. RF applications add ft and capacitance requirements. Matched-pair applications require both devices to be evaluated together. Vp and Idss are Identity specs — the bias circuit is designed around their range and a replacement outside that range will shift the operating point.

#### Question 1: What is the primary application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Low-noise amplifier / microphone preamplifier / audio front end** | Noise Figure (NF) and 1/f corner frequency (fc) are PRIMARY. Must verify NF at the operating frequency and bias point — not just headline datasheet figure. fc must be below the lowest signal frequency (for audio, fc < 100Hz is ideal). gfs (transconductance) is secondary — higher gfs improves noise but must be compatible with the bias circuit. Vp and Idss Identity check is essential to confirm the bias point is preserved. |
| **Ultra-high-impedance input (pH electrode, ionization detector, electret capsule, electrometer)** | Igss (gate leakage) is PRIMARY and often BLOCKING — verify at operating temperature, not just 25°C. Even a 10× increase in Igss can introduce unacceptable offset error across gigaohm source impedances. Noise figure is secondary. Vp/Idss Identity check required for bias preservation. |
| **RF low-noise amplifier (HF, VHF, UHF front end)** | ft (transition frequency) and NF at the operating frequency are PRIMARY. Ciss and Crss (gate and reverse transfer capacitances) must match for input matching network compatibility — a replacement with significantly different capacitances will detune the input matching and degrade NF and gain. gfs affects both gain and NF. Vp/Idss Identity for bias point. |
| **Analog switch / VVR (voltage-variable resistor) / AGC element** | On-resistance (rds(on) at Vgs = 0, which is ≈ 1/gfs×Vp) and pinch-off behavior dominate. NF and Igss are less critical. Vp Identity is essential — it directly sets the control voltage range. Idss Identity ensures the on-state resistance matches. |
| **Legacy switching / chopper circuit** | Switching speed is relevant; Vds(max) and Id ratings matter. NF, Igss, ft secondary. Vp/Idss for bias compatibility. Note: modern designs have largely replaced JFET choppers with CMOS switches — this is typically a legacy maintenance scenario. |

**Affected attributes:**
- `NF / en` → primary for audio/low-noise; secondary for ultra-high-Z; critical for RF
- `Igss` → primary (potentially BLOCKING) for ultra-high-Z; secondary for all other modes
- `ft / Ciss / Crss` → primary for RF; irrelevant for audio and ultra-high-Z below 1MHz
- `1/f Corner Frequency` → primary for audio; irrelevant for RF
- `Vp / Idss` → Identity for all modes — bias circuit is always affected

#### Question 2: Is this a matched-pair application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — differential pair, balanced preamplifier, long-tailed pair (two JFETs must track each other)** | Both devices must be evaluated as a matched pair. Standard parametric matching is insufficient — Vp and Idss must match device-to-device (typically ΔVp < 10mV, ΔIdss < 5%). If the original was a matched-pair type (2SK389, IF9030, SSM2212), replace with the same or equivalent matched-pair type. Replacing only one device of a matched pair is a known precision degradation source — both should be replaced together. |
| **No — single device** | Standard single-device substitution rules apply. |

**Affected attributes:**
- `Vp` → tighter matching requirement between the two devices in a pair
- `Idss` → tighter matching requirement between the two devices in a pair
- `gfs` → matching affects differential gain symmetry

#### Question 3: Is this automotive?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q101 mandatory. Igss must be verified at 125°C (automotive max junction temperature). Vp temperature coefficient behavior across -40°C to +125°C must be compatible with the bias circuit's tracking. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q101` → Identity (Flag), mandatory for automotive
- `Igss` → verify at automotive temperature extremes
- `Vp` → temperature coefficient across automotive range must be within bias circuit tolerance

---

## Block C: Standard ICs

---

### 28. Linear Voltage Regulators — LDOs (Family C1)

**Context sensitivity: MODERATE**

The most important bifurcations are output voltage (exact Identity match for fixed types), output capacitor ESR compatibility (hard Identity — determines whether the LDO is stable with the PCB's existing capacitor), and the presence and polarity of feature pins (Enable, Power-Good). PSRR context depends on what's upstream of the LDO.

#### Question 1: What is the output type and target voltage?

> **Impl:** Not a context question — output voltage handled as `identity` rule (w10 blockOnMissing) in logic table. Output type (fixed/adjustable/negative) also handled parametrically.

| Answer | Effect on Matching |
|--------|-------------------|
| **Fixed output — single voltage (e.g., 3.3V, 5V, 1.8V)** | Output voltage is a hard Identity match — replacement must be the exact same nominal output voltage. Even ±1% difference may violate downstream rail tolerance. Fixed-to-adjustable substitution requires adding external resistor divider and is a PCB modification, not a drop-in swap. |
| **Adjustable output** | Replacement must support the same target output voltage within its adjustable range. Verify the feedback reference voltage (Vref) and input bias current — these determine the external resistor values required and whether the existing resistor divider sets the correct output. |
| **Negative output** | Replacement must also be a negative-output LDO. Hard Identity — cannot substitute positive for negative. |
| **Tracking / dual-output** | Replacement must support the same tracking and sequencing behavior. Verify tracking accuracy and soft-start compatibility. Engineering review recommended. |

**Affected attributes:**
- `Output Type` → hard Identity gate before any other evaluation
- `Output Voltage Vout` → hard Identity for fixed; range check for adjustable
- `Iq` → weight increases for battery applications; irrelevant for high-load always-on

#### Question 2: What is the output capacitor type on the PCB?

> **Impl:** Aligned → `output_cap_type` (Q1, priority 1) in `lib/contextQuestions/ldo.ts`. Ceramic → `output_cap_compatibility` escalate_to_mandatory + blockOnMissing. Unknown → add_review_flag.

| Answer | Effect on Matching |
|--------|-------------------|
| **Ceramic (MLCC) — X5R, X7R, C0G** | Replacement MUST be explicitly rated stable with ceramic capacitors. Look for "ceramic-stable," "any-cap LDO," or "CMOS LDO" in the datasheet. An ESR-stabilized LDO substituted here will oscillate. This is a BLOCKING constraint. |
| **Tantalum or aluminum electrolytic** | Both ESR-stabilized and ceramic-stable LDOs are acceptable (ESR from tantalum/electrolytic satisfies ESR-stabilized types; ceramic-stable types work with any cap). Verify minimum ESR is not below the LDO's minimum requirement. |
| **Unknown** | Flag for engineering review. Inspect PCB BOM for output capacitor type. Do not approve substitution until capacitor type is confirmed. |

**Affected attributes:**
- `Output Capacitor Requirement` → BLOCKING for ceramic-cap designs if replacement is ESR-stabilized
- `Vout Accuracy` → tighter if downstream load has narrow voltage window

#### Question 3: Is this a battery-powered or energy-harvested application?

> **Impl:** Aligned → `battery_application` (Q2, priority 2) in `lib/contextQuestions/ldo.ts`. Yes → `iq` escalate_to_primary + blockOnMissing, `vdropout` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — battery, energy harvesting, coin cell** | Iq becomes a PRIMARY constraint. Even a 10µA difference in Iq matters at the system level. Vdropout becomes PRIMARY — lower dropout extends battery life. Verify Iq at the actual sleep-mode load current (often near zero load). |
| **No — mains-powered, always-on, high-load** | Iq is LOW priority — a few hundred µA against a 100mA+ load is negligible. Vdropout still matters for thermal reasons but not for battery life. |

**Affected attributes:**
- `Iq` → escalates to primary constraint for battery applications
- `Vdropout Max` → escalates for battery applications (extends usable range)
- `Vin Min` → must reach regulation before battery is depleted

#### Question 4: Is there an upstream switching regulator feeding this LDO?

> **Impl:** Reframed → `upstream_switching_freq` (Q5, priority 5, conditional on `noise_sensitive`=yes) in `lib/contextQuestions/ldo.ts`. Reframed as frequency band selector (none/low/high/unknown) with graduated PSRR escalation.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — LDO post-regulates a switcher output** | PSRR at the switching frequency becomes a PRIMARY constraint. Must verify PSRR at the actual upstream switching frequency (not DC PSRR). A replacement with lower PSRR at the switching frequency will pass through more switching ripple to the downstream load. |
| **No — LDO is fed from a battery or transformer/linear supply** | PSRR at DC and low frequencies (50/60Hz) is the relevant spec. Generally much less demanding. |

**Affected attributes:**
- `PSRR` → primary concern for post-switcher applications; frequency context is critical
- `Load Regulation` → secondary concern for supplies with high-frequency load variation

#### Question 5: Does the circuit use Enable, Power-Good, or Soft-Start pins?

> **Impl:** GAP — Not implemented as a context question. Pin presence handled as identity rules in logic table. Pin usage context (power sequencing, sleep control) not captured.

| Answer | Effect on Matching |
|--------|-------------------|
| **Enable pin used for power sequencing or sleep control** | Replacement must have Enable pin with MATCHING polarity (active-high vs. active-low). Mismatched polarity inverts control behavior. Verify float behavior (what does the LDO do when EN is undriven?). |
| **Power-Good used for MCU reset or sequencing** | Replacement must have Power-Good with compatible output structure (open-drain) and threshold. Verify PG pull-up resistor is on the PCB. |
| **Soft-start relied upon for inrush current limiting** | Replacement must have soft-start if large output capacitance or inrush-sensitive upstream supply is present. |
| **None of the above — basic 3-terminal application** | Feature pin constraints are not applicable. Any replacement with matching Identity and performance specs is acceptable. |

**Affected attributes:**
- `Enable Pin` → Identity (Flag) if used; polarity must match
- `Power-Good Pin` → Identity (Flag) if used; open-drain structure required
- `Soft-Start` → Identity (Flag) if relied upon for inrush limiting

#### Question 6: Is this automotive?

> **Impl:** Aligned → `automotive` (Q4, priority 4) in `lib/contextQuestions/ldo.ts`. Yes → `aec_q100` escalate_to_mandatory, `tj_max` escalate_to_primary. Map also mentions Vin Max (load-dump); not in impl.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q100 mandatory. Verify Grade (0/1/2/3) matches or exceeds original. Load-dump survivability (40V on 12V systems) must be explicitly rated. Operating temp range must cover automotive ambient extremes. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q100` → Identity (Flag), mandatory for automotive; Grade must match or exceed
- `Vin Max` → load-dump survivability becomes critical (40V for 12V automotive systems)
- `Tj Max` → must cover Grade 0/1 temperature range for automotive

#### Question 7 (Implementation-only — not in original map)

> **Impl:** Added in code → `noise_sensitive` (Q3, priority 3) in `lib/contextQuestions/ldo.ts`. Asks whether the LDO supplies a noise-sensitive analog circuit (ADC/DAC/RF). Yes → `psrr`, `vout_accuracy`, `load_regulation` all escalate_to_primary. This question gates Q5 (upstream_switching_freq) — only asked when noise is relevant.

---

### 29. Switching Regulators (Family C2)

**Context sensitivity: HIGH**

Topology is the first and hardest gate — it determines the entire circuit structure and no other evaluation is meaningful until it's confirmed. Control mode determines compensation compatibility. Switching frequency interfaces with the passive components already on the PCB. Vref determines whether the existing feedback resistors set the correct output voltage. Architecture (integrated vs. controller-only) is a hard structural constraint.

#### Question 1: What is the topology?

> **Impl:** Not a context question — topology handled as `identity` rule (w10 blockOnMissing) + post-scoring filter in logic table.

| Answer | Effect on Matching |
|--------|-------------------|
| **Buck (step-down)** | Vout < Vin always. High-side switch + low-side switch/diode + output inductor. Synchronous vs. non-synchronous is a sub-Identity question — see Q2. |
| **Boost (step-up)** | Vout > Vin always. Low-side switch + output diode + input inductor. |
| **Buck-Boost / SEPIC / Inverting** | Vout can be above or below Vin, or negative. Each requires different inductor configuration and feedback topology — not interchangeable with each other. |
| **Flyback / Forward (isolated)** | Transformer-based isolated topologies. Turns ratio, magnetizing inductance, and snubber design are transformer-dependent. Not interchangeable with non-isolated topologies under any circumstances. Engineering review required for any substitution. |

**Affected attributes:** All — topology must match before any other attribute is evaluated.

#### Question 2: Is this an integrated-switch converter or a controller-only IC?

> **Impl:** Aligned → `architecture_type` (Q1, priority 1) in `lib/contextQuestions/switchingRegulator.ts`. Integrated → `gate_drive_current` not_applicable. Controller → `gate_drive_current` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Integrated switch (converter IC)** | No external MOSFETs on the PCB power path. Replacement must also be an integrated-switch type with compatible pin assignment for SW, Vin, GND, and all auxiliary pins. Current rating is fixed by the on-chip switch. |
| **Controller-only (drives external MOSFETs)** | PCB has external MOSFETs with separate HG/LG gate drive connections. Replacement must be controller-only. Gate drive voltage and current must be compatible with the existing external FETs' gate charge. |

**Affected attributes:**
- `Architecture` → hard Identity gate
- `Gate Drive Voltage/Current` → only applicable for controller-only designs

#### Question 3: What is the control mode?

> **Impl:** Reframed → `comp_redesign` (Q2, priority 2) in `lib/contextQuestions/switchingRegulator.ts`. Map asks control mode directly; impl asks compensation flexibility. `can_redesign` → `control_mode` add_review_flag. `cannot_change` → default identity match.

| Answer | Effect on Matching |
|--------|-------------------|
| **Peak current mode (PCM)** | Inner current loop senses peak inductor current. Replacement must also be PCM for existing compensation to be valid. PCM-to-PCM substitution: verify gm is within ±30% or flag for compensation re-evaluation. |
| **Voltage mode (VM)** | Output voltage feedback only, typically requires Type III compensation. VM-to-VM substitution: verify gm compatibility. |
| **Hysteretic / COT (Constant On-Time)** | No COMP pin — no compensation network. Switching frequency varies with load and Vin. Replacement must also be COT/hysteretic. COT devices often have specific output capacitor requirements (similar to LDO ESR stability) — verify with the PCB's output capacitor type. |
| **Average current mode** | Used in chargers, LED drivers, PFC. Replacement must also be average current mode. |

**Affected attributes:**
- `Control Mode` → Identity gate; wrong mode = wrong compensation
- `Compensation Type` → if externally compensated, gm of replacement must be assessed
- `Output Capacitor Requirement` → critical for COT/hysteretic (similar to LDO ESR issue)

#### Question 4: What is the switching frequency, and is it fixed or adjustable?

> **Impl:** Reframed → `passive_flexibility` (Q4, priority 4) in `lib/contextQuestions/switchingRegulator.ts`. Map asks frequency directly; impl asks passive component flexibility. `passives_fixed` → `fsw` escalate_to_mandatory + blockOnMissing.

| Answer | Effect on Matching |
|--------|-------------------|
| **Fixed frequency — must match exactly** | Replacement must operate at the same frequency. Verify the replacement's fixed frequency matches within ±10%. Any deviation requires evaluating inductor ripple current and output ripple with the existing passives. |
| **Adjustable via Rt resistor — existing resistor sets frequency** | Replacement must have a frequency-setting resistor pin with a compatible Rt-to-fsw relationship. Calculate what frequency the existing Rt sets on the replacement — it may be different if the Rt transfer function differs between manufacturers. |
| **Synchronizable to external clock** | Replacement must support sync input at the system clock frequency. Verify sync range and input threshold compatibility. |

**Affected attributes:**
- `Switching Frequency fsw` → must match within ±10% with existing passives; flag for inductor/cap re-evaluation if larger deviation
- `ton_min / toff_min` → verify at the operating frequency, Vin, and Vout combination

#### Question 5: What is the feedback reference voltage (Vref) of the original?

> **Impl:** Not a context question — handled by the `vref_check` LogicType engine extension which automatically recalculates Vout from Vref mismatch with ±2% tolerance.

| Answer | Effect on Matching |
|--------|-------------------|
| **Known (from original datasheet)** | Calculate: Vout_with_replacement = Vref_new × (1 + Rtop/Rbot). If this does not equal the target Vout within ±2%, calculate the new Rbot and flag for BOM resistor change. |
| **Unknown** | Measure the voltage at the FB pin of the original device in circuit (= Vref at regulation). Then proceed as above. |

**Affected attributes:**
- `Feedback Reference Voltage Vref` → silent output voltage killer if mismatched; always calculate before approving

#### Question 6: Are Enable/UVLO, Power-Good, Soft-Start, or Sync pins used?

> **Impl:** GAP — Not implemented as a context question. Pin presence handled as parametric rules. UVLO threshold recalculation with existing divider is a real concern not captured.

| Answer | Effect on Matching |
|--------|-------------------|
| **Enable/UVLO used with external voltage divider** | Replacement UVLO threshold must be known — recalculate turn-on voltage with replacement threshold and existing divider. If turn-on voltage shifts, flag for resistor change. |
| **Power-Good used for sequencing or reset** | Replacement must have PG with compatible output structure and threshold. |
| **Soft-Start capacitor (Css) present on PCB** | Replacement must have Css pin. Verify the Css-to-ramp-time relationship — a different internal multiplier will change the soft-start duration with the same Css value. |
| **Sync input used** | Replacement must support synchronization. Verify sync range covers the system clock frequency. |
| **None — simple standalone application** | Feature pin constraints not applicable. |

**Affected attributes:**
- `Enable/UVLO` → UVLO threshold change affects turn-on voltage with existing divider
- `Soft-Start` → Css pin required if Css capacitor is on PCB
- `Overcurrent Protection Mode` → verify hiccup/latch/foldback matches system fault handling expectation

#### Question 7: Is this automotive?

> **Impl:** Aligned → `automotive` (Q3, priority 3) in `lib/contextQuestions/switchingRegulator.ts`. Yes → `aec_q100` escalate_to_mandatory, `tj_max` escalate_to_primary, `vin_max` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q100 mandatory with matching grade. Load-dump survivability must be explicitly rated (40V/400ms for 12V systems). EMI compliance per CISPR 25 must be considered. |
| **No** | Standard environmental matching. |

**Affected attributes:**
- `AEC-Q100` → Identity (Flag), mandatory for automotive
- `Vin Max` → load-dump survivability becomes a hard constraint

#### Question 8 (Implementation-only — not in original map)

> **Impl:** Added in code → `high_conversion_ratio` (Q5, priority 5, conditional on `architecture_type` ≠ unknown) in `lib/contextQuestions/switchingRegulator.ts`. Asks whether design has high step-down/step-up ratio (e.g., 12V→1V). Yes → `ton_min` escalate_to_mandatory + blockOnMissing. Critical for extreme duty cycle designs where ton_min becomes the binding constraint.

---

### 30. Gate Drivers (Family C3)

**Context sensitivity: MODERATE-HIGH**

Driver configuration (single/dual/half-bridge/full-bridge) is the first Identity gate. For half-bridge drivers, output polarity and dead-time are safety-critical — wrong polarity or absent dead-time causes immediate shoot-through and power device destruction. Isolation type is mandatory in safety-rated equipment. Peak drive current interfaces directly with the power stage's switching loss budget.

#### Question 1: What is the driver configuration?

> **Impl:** Aligned → `driver_topology` (Q1, priority 1) in `lib/contextQuestions/gateDriver.ts`. Half/full-bridge → `output_polarity`, `dead_time_control`, `dead_time` all BLOCKING (three-check shoot-through validation). Single → dead_time/bootstrap not_applicable.

| Answer | Effect on Matching |
|--------|-------------------|
| **Single or Dual (non-bridge)** | Simpler substitution — main concerns are input logic threshold, output current, and supply voltage compatibility. Dead-time is not applicable. |
| **Half-Bridge (floating high-side + low-side)** | Dead-time, bootstrap diode, VS/VB pin assignment, and output polarity become critical. Shoot-through risk from polarity inversion or dead-time mismatch. dV/dt immunity of VS pin must be verified for high-voltage applications. |
| **Full-Bridge** | Four-switch control — same constraints as half-bridge, applied twice. Engineering review recommended for any substitution. |

**Affected attributes:** All — configuration is the first gate before any other evaluation.

#### Question 2 (half-bridge): Is there a galvanic isolation requirement?

> **Impl:** Reordered → `safety_isolation` (Q4, priority 4) in `lib/contextQuestions/gateDriver.ts`. Map conditions on half-bridge; impl asks unconditionally. Yes → `isolation_type` add_review_flag.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — safety-rated equipment (IEC 62368, UL 508A, medical)** | Isolation type is a BLOCKING Identity constraint. Non-isolated bootstrap cannot replace isolated type. Verify isolation voltage, creepage, and clearance meet the safety standard. |
| **No — non-isolated bootstrap acceptable** | Isolation type not a safety constraint. Standard bootstrap driver acceptable if Vin range and duty cycle are compatible. |

**Affected attributes:**
- `Isolation Type` → BLOCKING for safety-rated applications
- `Gate Drive Supply VDD` → bootstrap voltage must be verified for high-voltage applications (VB = VS + VDD)

#### Question 3: What is the driving logic signal voltage?

> **Impl:** GAP — Not implemented as a context question. 3.3V MCU driving VDD=12V gate driver (VIH threshold mismatch) is a real failure mode not captured as context.

| Answer | Effect on Matching |
|--------|-------------------|
| **3.3V MCU/FPGA GPIO** | Replacement must have logic-level compatible inputs (VIH ≤ 2.0V). VDD-referenced CMOS inputs with VDD=12V will not reliably trigger. |
| **5V logic** | Replacement must tolerate 5V inputs — verify VIH max is not exceeded. Most modern gate drivers with 5V logic compatibility are fine. |
| **Differential (LVDS or similar)** | Replacement must also accept differential input. Single-ended replacement requires an input adapter — not a drop-in substitution. |

**Affected attributes:**
- `Input Logic Threshold` → must be compatible with driving logic voltage

#### Question 4: What is the peak current requirement, and what power device is being driven?

> **Impl:** Split → `power_device_type` (Q2, priority 2) in `lib/contextQuestions/gateDriver.ts`. Map combines peak current and power device; impl focuses on device type. SiC → `vdd_range` mandatory+block. IGBT → `peak_source_current`/`peak_sink_current` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Silicon MOSFET, moderate Qg (<50nC)** | Standard gate driver (1-2A peak) adequate. Verify at operating fsw. |
| **IGBT or large MOSFET (Qg >100nC)** | Higher peak current (≥2A) required for adequate switching speed. Compute transition time = Qg / Ipeak and verify against switching loss budget. |
| **SiC MOSFET (requires negative turn-off voltage)** | Bipolar gate supply required (e.g., -5V / +18V). Standard unipolar drivers cannot provide negative off-state gate voltage — parasitic turn-on risk from Miller coupling. Engineering review required. |

**Affected attributes:**
- `Peak Source/Sink Current` → primary performance spec; lower current = slower switching = more loss
- `Gate Drive Supply VDD` → SiC/GaN requires specific voltage levels; verify range

#### Question 5: Are Shutdown, Fault, Dead-Time, or Soft-Start pins used in the circuit?

> **Impl:** GAP — Not implemented as a context question. Pin usage (especially external Rdt recalculation) is application context not captured by parametric rules.

| Answer | Effect on Matching |
|--------|-------------------|
| **Shutdown/Enable used for fault protection** | Polarity must match exactly. Verify float state (default enabled or disabled when undriven). |
| **FAULT output used for monitoring/interlocking** | Replacement must have FAULT pin with open-drain output. Absent FAULT silently removes protection capability. |
| **Dead-time set by external Rdt resistor** | Replacement must have Rdt pin with compatible resistance-to-time relationship. Recalculate dead-time with replacement's Rdt transfer function. |

**Affected attributes:**
- `Shutdown/Enable Pin` → Identity Flag; polarity must match
- `Fault Reporting Pin` → Identity Flag if used for protection
- `Dead-Time Control` → Rdt pin required if externally adjusted dead-time is on PCB

#### Question 6: Is this automotive?

> **Impl:** Aligned → `automotive` (Q3, priority 3) in `lib/contextQuestions/gateDriver.ts`. Yes → `aec_q100` escalate_to_mandatory, `tj_max` escalate_to_primary, `fault_reporting` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q100 mandatory. ISO 26262 ASIL requirements may mandate FAULT pin and diagnostic features. Load-dump survivability on VDD supply must be verified. |
| **No** | Standard environmental matching. |

#### Question 7 (Implementation-only — not in original map)

> **Impl:** Added in code → `high_frequency` (Q5, priority 5) in `lib/contextQuestions/gateDriver.ts`. Asks whether switching frequency >200kHz. Yes → `rth_ja`, `rise_fall_time`, `propagation_delay` all escalate_to_primary. At high fsw, gate driver dissipation (Pd = QG × VDD × fsw) and timing margins become the binding constraints.

---

### 31. Op-Amps / Comparators (Family C4)

**Context sensitivity: HIGH**

The categorical distinction between op-amp and comparator applications is the most important branching point in this family — it determines the entire matching framework before any parametric evaluation. Input stage technology is the second critical axis: bipolar, JFET, and CMOS input stages span four decades of input bias current and have opposing noise trade-offs that depend entirely on source impedance.

#### Question 1 (BLOCKING): Is this device used in a closed-loop or open-loop configuration?

> **Impl:** Aligned → `device_function` (Q1, priority 1) in `lib/contextQuestions/opampComparator.ts`. Adds instrumentation_amp as third sub-type beyond map's binary closed/open-loop framing. Op-amp → `output_type`, `response_time` not_applicable. Comparator → `gain_bandwidth`, `min_stable_gain` not_applicable.

| Answer | Effect on Matching |
|--------|-------------------|
| **Closed-loop with negative feedback (op-amp application)** | GBW, slew rate, phase margin, closed-loop stability all become primary. Comparators are BLOCKED — they have no internal compensation and will oscillate in any feedback loop. Decompensated op-amp types require minimum stable gain to be verified against circuit gain. |
| **Open-loop switching to logic levels (comparator application)** | Propagation delay, output type (open-drain vs. push-pull), hysteresis, and response time become primary. GBW is irrelevant. Op-amps used as comparators: slow recovery from saturation, output levels may not meet logic VOL/VOH — flag as Application Review, not a hard block. |

**Affected attributes:**
- `Device Type` → Identity (hard gate — comparators BLOCKED for feedback circuits)
- `GBW / GBWP` → primary for op-amp, irrelevant for comparator
- `Propagation Delay (tpd)` → primary for comparator, irrelevant for op-amp
- `Output Type (push-pull / open-drain)` → Identity Flag for comparators
- `Input Hysteresis` → Identity Flag for comparators

#### Question 2: What is the source impedance of the signal being processed?

> **Impl:** Aligned → `source_impedance` (Q2, priority 2) in `lib/contextQuestions/opampComparator.ts`. All 4 tiers implemented: low (<1kΩ), medium (1kΩ–100kΩ), high (100kΩ–10MΩ), very_high (>10MΩ, CMOS only — JFET blocked).

| Answer | Effect on Matching |
|--------|-------------------|
| **Low impedance (<1kΩ) — microphone preamp, low-Z sensor, DAC buffer** | Bipolar input stage preferred. Input voltage noise (en) is the dominant noise parameter. High Ib × low R = negligible offset. JFET/CMOS substitution escalates to Application Review (higher en in most FET devices). |
| **Medium impedance (1kΩ–100kΩ) — general purpose, filter, instrumentation** | Any input stage acceptable. Evaluate total noise numerically: sqrt(en² + (in × Rs)²). Substitution across input stage technologies requires noise recalculation. |
| **High impedance (>100kΩ) — photodiode TIA, pH electrode, piezo sensor** | JFET required. Bipolar BLOCKED — Ib × Rsource creates unacceptable DC offset. |
| **Very high impedance (>10MΩ) — electrometer, charge amplifier** | CMOS required. JFET Ib (pA range) may still be too high. |

**Affected attributes:**
- `Input Stage Technology` → Identity constraint for high-Z circuits
- `Input Bias Current (Ib)` → escalates to primary/blocking for high-Z source
- `Input Current Noise (in)` → escalates to primary for high-Z source
- `Input Voltage Noise (en)` → primary for low-Z source

#### Question 3: Single-supply or dual-supply circuit?

> **Impl:** Aligned → `supply_configuration` (Q3, priority 3) in `lib/contextQuestions/opampComparator.ts`. Single-supply → `vicm_range` mandatory+blockOnMissing, `rail_to_rail_output`/`rail_to_rail_input` escalate_to_primary. Dual-supply → `supply_voltage` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Single-supply (e.g., 3.3V or 5V, ground-referenced)** | Supply Configuration becomes Identity. Must verify Input Common-Mode Range extends to ground (or below). Rail-to-rail output required if output must swing near ground or supply rails. Non-single-supply devices are BLOCKED. |
| **Dual-supply (e.g., ±5V, ±12V, ±15V)** | Standard matching. Verify Vs range covers supply span. Rail-to-rail not typically required. Single-supply CMOS devices are often BLOCKED (Vs_max may be insufficient for total dual-supply span). |

**Affected attributes:**
- `Supply Configuration` → Identity gate
- `Input Common-Mode Range (VICM)` → must include ground for single-supply
- `Output Voltage Swing` → RRO required if ground-referenced output

#### Question 4: Is this a precision or noise-critical application?

> **Impl:** Aligned → `precision_application` (Q4, priority 4) in `lib/contextQuestions/opampComparator.ts`. Three options: `precision_dc` (Avol, Vos+block, CMRR, PSRR primary), `low_noise_ac` (en+block, Ib, GBW primary), `general_purpose`.

| Answer | Effect on Matching |
|--------|-------------------|
| **Precision DC (instrumentation, weighing, 16-24 bit ADC front end)** | Vos, Ib, Ios, Avol, and TCV become primary constraints. Autozero or chopper-stabilized types may be required. Substitution across standard → precision types is fine; precision → standard is Application Review. |
| **Low-noise AC (audio, RF front end, sensor signal conditioning)** | en and in at signal frequency become primary. 1/f corner frequency becomes critical for audio (below 1kHz). Substitution must verify noise at the actual signal frequency, not just headline specs. |
| **General purpose (non-critical filtering, voltage following, buffering)** | Standard parametric matching. No escalation. |

**Affected attributes:**
- `Input Offset Voltage (Vos)` → tightens threshold for precision
- `Input Bias Current (Ib)` → tightens for precision with high-impedance feedback
- `Open-Loop Gain (Avol)` → escalates for high-gain precision amplifiers
- `Input Voltage Noise (en)` → primary for low-noise AC applications
- `Input Current Noise (in)` → primary for low-noise AC with high source impedance

#### Question 5 (if automotive): AEC-Q100 grade required?

> **Impl:** Aligned → `automotive` (Q6, priority 6) in `lib/contextQuestions/opampComparator.ts`. Yes → `aec_q100` mandatory+blockOnMissing, `operating_temp` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes, Grade 1 (125°C) or Grade 0 (150°C)** | AEC-Q100 attribute becomes Identity (hard gate). Non-AEC parts are BLOCKED regardless of electrical match. Temperature range must cover automotive operating range. |
| **No / commercial / industrial** | AEC-Q100 is Operational (nice-to-have, not required). |

#### Question 6 (Implementation-only — not in original map)

> **Impl:** Added in code → `circuit_gain` (Q5, priority 5, conditional on `device_function` = op_amp or instrumentation_amp) in `lib/contextQuestions/opampComparator.ts`. Asks minimum closed-loop gain. Unity → `min_stable_gain` mandatory+blockOnMissing (decompensated op-amps BLOCKED — will oscillate). Low (2–10 V/V) → escalate_to_primary. High (>10 V/V) → default. Critical for detecting decompensated op-amp substitution failures.

---

### 32. Logic ICs — 74-Series (Family C5)

**Context sensitivity: MODERATE**

The logic function encoded in the part number suffix is always the first gate — no amount of context changes whether a '04 can substitute for a '08. Within the same function, context determines which family compatibility issues are blocking and which are acceptable trade-offs.

#### Question 1 (BLOCKING): What logic family is driving this device's inputs?

> **Impl:** Aligned → `driving_source` (Q1, priority 1) in `lib/contextQuestions/c5LogicICs.ts`. TTL → `vih` mandatory+blockOnMissing, `logic_family` escalate_to_primary. Mixed → `vih`/`vil` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **TTL or TTL-compatible output (LS, ALS, AS, HCT output, ACT output, LVT, 5V MCU with VOH_min ~2.4V)** | HC-input replacements are BLOCKED — HC requires VIH = 3.5V at 5V Vcc but TTL only guarantees VOH_min = 2.4V. HCT, ACT, AHC, LVC replacements are acceptable (VIH = 2.0V or 0.7×Vcc at 3.3V, both met by TTL). Logic family attribute escalates to primary gate. |
| **CMOS output at 5V (HC, AC, AHC output)** | Any 5V-family replacement acceptable. HC/HCT/AC/ACT are interchangeable on input threshold. Verify output level compatibility with downstream devices. |
| **CMOS output at 3.3V (LVC, AHC at 3.3V, MCU at 3.3V VOH ~3.0V)** | 5V-only devices (HCT, ACT at 5V Vcc) are BLOCKED if supply is 3.3V. LVC, AHC, AHCT at 3.3V supply acceptable. Must verify if downstream devices are 5V-supply — if so, 3.3V output driving 5V HC input creates a marginal/failing interface. |
| **Mixed / unknown** | Escalate Logic Family to Application Review. Request supply voltage clarification before proceeding. |

**Affected attributes:**
- `Input High Threshold (VIH)` → blocking gate for TTL-source + HC-input mismatch
- `Logic Family` → becomes primary evaluation axis
- `Supply Voltage Range` → must be verified against driving source supply

#### Question 2: What is the supply voltage of the circuit?

> **Impl:** Aligned → `voltage_interface` (Q2, priority 2) in `lib/contextQuestions/c5LogicICs.ts`. Three options: `mixed_3v3_5v` (`input_clamp_diodes`+`voh` mandatory+block), `3v3_only` (`supply_voltage` mandatory+block — TTL families blocked), `single_domain`.

| Answer | Effect on Matching |
|--------|-------------------|
| **5V only** | HC, HCT, AC, ACT, AHC, AHCT all valid (within Vcc range). LVC valid (supports up to 5.5V). TTL families (LS, ALS, AS) valid but discouraged for new designs. |
| **3.3V only** | LVC, AHC, AHCT required. HC/HCT/AC/ACT technically support 3.3V (within range) but may have higher Icc at 3.3V. TTL families BLOCKED (require 5V). |
| **Mixed 3.3V + 5V on the same board** | This triggers the full 5V-tolerance check. Devices receiving 5V signals at 3.3V supply must be explicitly 5V-tolerant (LVC family). Non-tolerant devices at inputs are BLOCKED. Output level compatibility of 3.3V-supply device driving 5V-input devices must be verified — may require HCT/ACT receiver at 5V supply. |

**Affected attributes:**
- `Supply Voltage Range` → hard gate
- `Input Clamp Diodes` → 5V-tolerance check for 3.3V-supply devices with 5V inputs
- `Output High Voltage (VOH)` → 3.3V output driving 5V CMOS inputs — check VIH margin

#### Question 3: What is the output type required?

> **Impl:** Reframed → `bus_application` (Q3, priority 3) in `lib/contextQuestions/c5LogicICs.ts`. Map asks output TYPE directly; impl asks bus APPLICATION context. `shared_bus` → `output_type`, `oe_polarity` mandatory+blockOnMissing, `bus_hold` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Totem-pole / push-pull (standard)** | Default. Any totem-pole replacement acceptable for totem-pole original. |
| **Open-drain / open-collector (wired-AND, I2C, interrupt lines)** | Output Type becomes Identity Flag. Totem-pole replacement BLOCKED for shared-bus or wired-AND applications. Pull-up resistor value must be verified for rise-time timing. |
| **3-state / tri-state (bus drivers, transceivers)** | OE polarity (active-high vs. active-low) becomes Identity Flag. Inverting OE polarity is BLOCKING. Direction pin (DIR) polarity for transceivers is equally critical. |

**Affected attributes:**
- `Output Type` → Identity Flag, with specific sub-checks by type
- `3-State / OE Polarity` → blocking for bus transceiver applications
- `Output Drive Current (IOL/IOH)` → primary for bus driving and pull-up interaction

#### Question 4: Is this an automotive design?

> **Impl:** Aligned → `automotive` (Q5, priority 5) in `lib/contextQuestions/c5LogicICs.ts`. Yes → `aec_q100` mandatory+blockOnMissing, `operating_temp` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes** | AEC-Q100 becomes Identity (hard gate). Non-AEC parts BLOCKED. Temperature range must cover automotive operating range (-40°C to +125°C minimum Grade 1). |
| **No** | AEC-Q100 is Operational. Standard commercial or industrial temperature grade per application environment. |

#### Question 5 (Implementation-only — not in original map)

> **Impl:** Added in code → `input_signal_quality` (Q4, priority 4) in `lib/contextQuestions/c5LogicICs.ts`. Asks whether input signals are slow-edged, noisy, or from analog/mechanical sources. `slow_noisy` → `schmitt_trigger` mandatory+blockOnMissing. Without Schmitt trigger hysteresis, standard CMOS inputs produce multiple output transitions on slow edges — output chatter and glitches.

---

### 33. Voltage References (Family C6)

**Context sensitivity: MODERATE**

Configuration (series vs. shunt) is a hard Identity gate before any parametric evaluation — the most common categorical substitution error. Series references (REF50xx, ADR3x, LT6654) actively drive the output pin from an internal error amplifier. Shunt references (TL431, LM4040, LM385) clamp in parallel with the load via an external series resistor — they cannot drive the output. These topologies are architecturally incompatible without circuit modification.

Within the series category, precision grade and TC are the primary matching axes. Shunt references require the external series resistor circuit to be evaluated as part of the substitution. Architecture (band-gap vs. buried Zener vs. XFET) determines noise floor and long-term stability class.

**Digikey:** Single category "Voltage Reference" covers both series and shunt types. Distinguished by the `Reference Type` parametric field ("Series" or "Shunt"). 13 parametric fields mapped, ~63% weight coverage (78/123). Missing from Digikey: architecture, long_term_stability, dropout_voltage, tc_accuracy_grade, enable_shutdown_polarity, nr_pin, aec_q100, packaging.

**19 matching rules** (total weight: 123):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `configuration` | identity | 10 | yes | HARD GATE. Series vs Shunt. Post-scoring filter removes mismatches |
| 2 | `output_voltage` | identity | 10 | yes | Exact match. 2.500V ≠ 2.048V. Parsed from MPN where encoded |
| 3 | `architecture` | identity | 7 | no | Band-gap / Buried Zener / XFET. Escalated to w10 for precision (Q3) |
| 4 | `adjustability` | identity | 8 | no | Fixed / Adjustable / Trimmable. Losing trim = losing calibration |
| 5 | `tc_accuracy_grade` | identity_flag | 7 | no | Suffix encodes both TC + accuracy (REF5025A=0.05%/3ppm) |
| 6 | `aec_q100` | identity_flag | 3 | no | Escalated to w10+blockOnMissing for automotive (Q4) |
| 7 | `enable_shutdown_polarity` | identity | 8 | no | Active-low shutdown vs active-high enable. Mismatch = permanently off. Uses `identity` not `identity_flag` — both directions fatal |
| 8 | `initial_accuracy` | threshold lte | 8 | no | 0.02%–0.5%. Gain error = accuracy × 2^N |
| 9 | `tc` | threshold lte | 8 | no | <1 to 100 ppm/°C. Escalated to w10 for precision (Q3) |
| 10 | `output_noise` | threshold lte | 6 | no | 0.1–10Hz band. 24-bit: 1 LSB=149nV at 2.5V. Escalated to w9 (Q3) |
| 11 | `long_term_stability` | threshold lte | 4 | no | Band-gap: 25–100 ppm/1000h. Escalated to w8 for metrology (Q3) |
| 12 | `dropout_voltage` | threshold lte | 7 | no | Vin_min = Vout + Vdropout. Headroom check |
| 13 | `quiescent_current` | threshold lte | 5 | no | Escalated for battery/shunt (Q1 shunt → Ika_min primary) |
| 14 | `output_current` | threshold gte | 5 | no | References not power sources. 5–15mA typical |
| 15 | `input_voltage_range` | threshold range_superset | 7 | no | Replacement must contain circuit supply voltage |
| 16 | `operating_temp` | threshold range_superset | 6 | no | Must fully cover application range |
| 17 | `nr_pin` | application_review | 4 | no | NR pin w/ cap → noise reverts to unfiltered if replacement lacks NR |
| 18 | `package_case` | application_review | 5 | no | SOT-23-3 ≠ SOT-23-5 ≠ SC70-5 |
| 19 | `packaging` | operational | 1 | no | Tape-and-reel / cut tape / bulk |

**MPN enrichment** (~30 prefix patterns): Infers `configuration` (series/shunt), `architecture` (band-gap/buried Zener/XFET), and `output_voltage` (parsed from encoded digits — REF5025→2.5V, ADR4550→5.0V, LM4040A25→2.5V). Post-scoring filter removes confirmed configuration mismatches.

#### Question 1 (BLOCKING): Is this device configured as a series reference or a shunt reference?

> **Impl:** Aligned → `configuration_type` (Q1, priority 1) in `lib/contextQuestions/voltageReference.ts`. Series → `configuration` mandatory+blockOnMissing. Shunt → `configuration` mandatory+blockOnMissing + `quiescent_current` escalate_to_primary + `adjustability` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Series reference (dedicated Vout pin drives the load directly)** | Shunt references are BLOCKED — they cannot drive the output and require an external resistor circuit that does not exist in a series topology. `configuration` → escalate_to_mandatory + blockOnMissing. |
| **Shunt reference (TL431 / LM4040 / LM385 — parallel with load, external series resistor)** | Series references are BLOCKED — installing a series reference into a TL431 feedback divider topology completely changes the regulation voltage and destroys the feedback loop. `configuration` → escalate_to_mandatory + blockOnMissing. `quiescent_current` → escalate_to_primary (Ika_min sets series resistor current). `adjustability` → escalate_to_primary (resistor-programmable compatibility). |

**Affected attributes (all 19 rules):**

| Attribute | Default | Q1=Series | Q1=Shunt |
|-----------|---------|-----------|----------|
| `configuration` | identity w10 block | w10 BLOCKING (confirmed) | w10 BLOCKING (confirmed) |
| `output_voltage` | identity w10 block | unchanged | unchanged |
| `architecture` | identity w7 | unchanged | unchanged |
| `adjustability` | identity w8 | unchanged | escalate_to_primary — resistor-programmable compatibility |
| `tc_accuracy_grade` | identity_flag w7 | unchanged | unchanged |
| `aec_q100` | identity_flag w3 | unchanged | unchanged |
| `enable_shutdown_polarity` | identity w8 | unchanged | unchanged |
| `initial_accuracy` | threshold lte w8 | unchanged | unchanged |
| `tc` | threshold lte w8 | unchanged | unchanged |
| `output_noise` | threshold lte w6 | unchanged | unchanged |
| `long_term_stability` | threshold lte w4 | unchanged | unchanged |
| `dropout_voltage` | threshold lte w7 | unchanged | unchanged |
| `quiescent_current` | threshold lte w5 | unchanged | escalate_to_primary — Ika_min determines series resistor sizing |
| `output_current` | threshold gte w5 | unchanged | unchanged |
| `input_voltage_range` | threshold range_superset w7 | unchanged | unchanged |
| `operating_temp` | threshold range_superset w6 | unchanged | unchanged |
| `nr_pin` | application_review w4 | unchanged | unchanged |
| `package_case` | application_review w5 | unchanged | unchanged |
| `packaging` | operational w1 | unchanged | unchanged |

#### Question 2: What type of output voltage is required?

> **Impl:** Aligned → `output_voltage_type` (Q2, priority 2) in `lib/contextQuestions/voltageReference.ts`. Fixed → `output_voltage` mandatory+blockOnMissing. Adjustable → `adjustability` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Fixed voltage (1.2V, 2.048V, 2.500V, 3.000V, 4.096V, 5.000V, 10.000V)** | `output_voltage` → escalate_to_mandatory + blockOnMissing. A 2.500V reference cannot substitute for 2.048V regardless of accuracy class. Standard reference voltages: 1.2V (band-gap), 2.048V and 4.096V (ADC-optimal — powers of 2), 2.500V (most common), 3.000V, 5.000V, 10.000V (metrology). |
| **Adjustable — resistor-programmable (TL431 type) or trim-pin adjustable** | `adjustability` → escalate_to_primary. Verify the replacement's adjustment range and Vref covers the required output voltage. For shunt types with external programming resistors, replacement Vref and trim range must be compatible with existing resistor network. |

**Affected attributes:**

| Attribute | Q2=Fixed | Q2=Adjustable |
|-----------|----------|---------------|
| `output_voltage` | escalate_to_mandatory + blockOnMissing | unchanged |
| `adjustability` | unchanged | escalate_to_primary |

#### Question 3: What is the precision requirement?

> **Impl:** Aligned → `precision_level` (Q3, priority 3) in `lib/contextQuestions/voltageReference.ts`. High → 7 attrs escalated (`tc` mandatory+block, `architecture` mandatory, `initial_accuracy`/`output_noise` primary+block, `long_term_stability`/`nr_pin`/`tc_accuracy_grade` primary). Moderate → `tc` primary. General → `architecture` add_review_flag.

| Answer | Effect on Matching |
|--------|-------------------|
| **High precision (16+ bit ADC reference, metrology, calibration)** | Initial accuracy <0.05% required. TC <5 ppm/°C required (BLOCKING). Architecture (band-gap vs buried Zener) determines noise floor and long-term stability — architectures have fundamentally different TC curve shapes. 0.1–10 Hz noise adds directly to ADC noise floor and cannot be averaged away. NR pin usage must be preserved for noise filtering. |
| **Moderate precision (12–16 bit ADC, sensor conditioning)** | Standard parametric matching. TC becomes primary concern. Initial accuracy 0.1–0.2% acceptable. TC 10–25 ppm/°C acceptable. |
| **General purpose (comparator threshold, simple bias, non-precision)** | Relaxed matching. Primary concerns are Vout, dropout, and Iq. Architecture is informational only. |

**Affected attributes (all 19 rules):**

| Attribute | Default | Q3=High Precision | Q3=Moderate | Q3=General |
|-----------|---------|-------------------|-------------|------------|
| `configuration` | identity w10 block | unchanged | unchanged | unchanged |
| `output_voltage` | identity w10 block | unchanged | unchanged | unchanged |
| `architecture` | identity w7 | escalate_to_mandatory — band-gap vs buried Zener TC curve shapes + noise floors are fundamentally different | unchanged | add_review_flag — informational only |
| `adjustability` | identity w8 | unchanged | unchanged | unchanged |
| `tc_accuracy_grade` | identity_flag w7 | escalate_to_primary — grade suffix encodes both TC and accuracy simultaneously | unchanged | unchanged |
| `aec_q100` | identity_flag w3 | unchanged | unchanged | unchanged |
| `enable_shutdown_polarity` | identity w8 | unchanged | unchanged | unchanged |
| `initial_accuracy` | threshold lte w8 | escalate_to_primary + blockOnMissing — gain error = accuracy × 2^N. At 16-bit: 0.05% = 32.8 LSBs | unchanged | unchanged |
| `tc` | threshold lte w8 | escalate_to_mandatory + blockOnMissing — dominant error source across temperature | escalate_to_primary | unchanged |
| `output_noise` | threshold lte w6 | escalate_to_primary + blockOnMissing — reference noise adds directly to ADC noise floor | unchanged | unchanged |
| `long_term_stability` | threshold lte w4 | escalate_to_primary — determines calibration interval | unchanged | unchanged |
| `dropout_voltage` | threshold lte w7 | unchanged | unchanged | unchanged |
| `quiescent_current` | threshold lte w5 | unchanged | unchanged | unchanged |
| `output_current` | threshold gte w5 | unchanged | unchanged | unchanged |
| `input_voltage_range` | threshold range_superset w7 | unchanged | unchanged | unchanged |
| `operating_temp` | threshold range_superset w6 | unchanged | unchanged | unchanged |
| `nr_pin` | application_review w4 | escalate_to_primary — losing NR cap reverts noise to unfiltered specification | unchanged | unchanged |
| `package_case` | application_review w5 | unchanged | unchanged | unchanged |
| `packaging` | operational w1 | unchanged | unchanged | unchanged |

#### Question 4: Is this an automotive design?

> **Impl:** Aligned → `automotive` (Q4, priority 4) in `lib/contextQuestions/voltageReference.ts`. Yes → `aec_q100` mandatory+blockOnMissing, `operating_temp` escalate_to_primary.

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive (AEC-Q100 required)** | AEC-Q100 becomes mandatory (BLOCKING). Non-automotive-qualified parts cannot substitute regardless of electrical match. Temperature range must cover −40°C to +125°C minimum (Grade 1). |
| **No** | Standard environmental matching. AEC-Q100 is operational — informational but not required. |

**Affected attributes:**

| Attribute | Q4=Yes | Q4=No |
|-----------|--------|-------|
| `aec_q100` | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp` | escalate_to_primary — must cover −40°C to +125°C minimum | unchanged |



### 34. Interface ICs — RS-485, CAN, I2C, USB (Family C7)

**Context sensitivity: MODERATE-HIGH**

Protocol is the first and hardest gate in this family. RS-485, CAN, I2C, and USB use fundamentally different signaling standards, bus arbitration mechanisms, and termination strategies — no cross-protocol substitution is possible without circuit redesign. Within each protocol, the bifurcation between isolated and non-isolated and between automotive and industrial grade drives the most critical safety and qualification constraints.

Context questions are protocol-specific and branch immediately after Q1. The isolated/non-isolated question is the most dangerous substitution error after protocol mismatch: a non-isolated device cannot replace an isolated one without violating the safety certification of the system.

**Digikey:** Four subcategories span the C7 family: "RS-485 Interface IC", "CAN Interface IC", "I2C/SMBus Interface", "USB Interface IC". Most parametric fields (protocol, data rate, supply voltage, operating temperature, AEC-Q100) are present in Digikey. Missing from Digikey: isolation working voltage, bus fault protection voltage, unit loads, failsafe receiver flag, TXD dominant timeout, slew rate class, propagation delay.

**22 matching rules** (total weight: ~145):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `protocol` | identity | 10 | yes | HARD GATE. RS-485 / CAN / I2C / USB — no cross-protocol substitution |
| 2 | `data_rate` | threshold gte | 9 | yes | Replacement max data rate ≥ original. CAN FD data phase rate separate from arbitration phase rate |
| 3 | `operating_mode` | identity | 9 | yes | Half-duplex / Full-duplex / Isolated vs Non-isolated. Half ≠ Full for RS-485 |
| 4 | `isolation_type` | identity_flag | 8 | no | Non-isolated / Capacitive / Transformer. Escalated to w10+blockOnMissing if isolated (Q2) |
| 5 | `isolation_working_voltage` | threshold gte | 7 | no | VIORM must cover fault-condition CM voltage. Escalated for safety-rated equipment (Q2) |
| 6 | `can_variant` | identity_flag | 8 | no | Classical CAN / CAN FD. CAN FD transceivers required for data-phase rates >1 Mbit/s |
| 7 | `de_polarity` | identity | 8 | yes | Active-high DE / Active-low DE / Combined DE+RE. Polarity inversion = inverted direction control |
| 8 | `failsafe_receiver` | identity_flag | 6 | no | With or without failsafe biasing. Required for RS-485 UART-based systems with bus-idle detection |
| 9 | `txd_dominant_timeout` | identity_flag | 7 | no | CAN only. Absence = bus-jamming fault risk. All ISO 11898-2 compliant parts include it |
| 10 | `bus_fault_protection` | threshold gte | 8 | no | ±15 V / ±60 V / ±70 V (auto CAN). Escalated to primary for industrial/harsh (Q3) |
| 11 | `esd_bus_pins` | threshold gte | 7 | no | IEC 61000-4-2 contact discharge rating. ±8 kV minimum industrial; escalated for exposed connectors |
| 12 | `vod_differential` | threshold gte | 6 | no | Minimum VOD into specified load. Threshold ≥ 1.5 V (RS-485/CAN). Escalated for long cable (Q3) |
| 13 | `receiver_threshold_cm` | threshold superset | 7 | no | Differential threshold + CM range. Standard −7 V to +12 V RS-485; extended range for multi-panel |
| 14 | `slew_rate_class` | application_review | 6 | no | Limited (≤250 kbps) vs Unlimited. Substituting unlimited for limited → EMI compliance violation |
| 15 | `propagation_delay` | threshold lte | 6 | no | One-way tpd. CAN FD <140 ns; classical CAN <255 ns. Escalated for CAN FD (Q1) |
| 16 | `unit_loads` | threshold lte | 5 | no | RS-485 only. 1 UL / ½ UL / ¼ UL / ⅛ UL. Escalated for dense multi-drop networks |
| 17 | `common_mode_range` | threshold superset | 6 | no | Replacement CM range must contain actual bus CM range. Extended range for multi-panel systems |
| 18 | `supply_voltage` | threshold superset | 7 | yes | 3.3 V / 5 V / wide-supply. Must contain actual VCC. Escalated for mixed-voltage boards |
| 19 | `standby_current` | threshold lte | 5 | no | Automotive CAN quiescent budget. Escalated to primary for automotive ECU (Q4) |
| 20 | `operating_temp` | threshold superset | 7 | yes | Must cover full application range. −40°C to +125°C minimum for automotive |
| 21 | `aec_q100` | identity_flag | 4 | no | Escalated to w10+blockOnMissing for automotive (Q4) |
| 22 | `package_case` | application_review | 5 | no | SOIC-8 is de facto standard for RS-485/CAN — most vendors pin-compatible. Isolated packages incompatible with SOIC-8 footprint |

**MPN enrichment** (~40 prefix patterns): Infers `protocol` (RS-485 / CAN / I2C / USB from part prefix — MAX485/ADM485/SN75176=RS-485; TJA1042/MCP2561/SN65HVD230=CAN; PCA9600/P82B96=I2C buffer; ISO1042/ADM3053=isolated CAN), `isolation_type` (ISO*/ADuM*/IL3*/ADM2*=isolated), `can_variant` (TJA1441/MCP2558FD/TCAN1042*=CAN FD capable). Post-scoring filter blocks protocol mismatches before scoring.

#### Question 1 (BLOCKING): What is the interface protocol?

| Answer | Effect on Matching |
|--------|-------------------|
| **RS-485 / RS-422** | All CAN, I2C, and USB candidates blocked. `protocol` → HARD GATE. Activates RS-485-specific attributes: DE polarity, failsafe receiver, unit loads, slew rate class, half-duplex vs. full-duplex, common-mode range. |
| **CAN / CAN FD** | All RS-485, I2C, and USB candidates blocked. Activates CAN-specific attributes: CAN standard variant (classical vs. FD), TXD dominant timeout, bus fault protection ≥±70 V for automotive. |
| **I2C / SMBus** | All RS-485, CAN, and USB candidates blocked. Activates I2C-specific: speed grade (Standard/Fast/Fm+/Hs), buffer vs. isolator type, mixed-supply operation, capacitance isolation capability. |
| **USB** | All RS-485, CAN, and I2C candidates blocked. Activates USB-specific: speed grade (FS/HS/SS), USB-IF ESD requirements, differential impedance compliance, signal conditioning vs. transceiver type. |

**Affected attributes:**

| Attribute | Default | Q1=RS-485 | Q1=CAN | Q1=I2C | Q1=USB |
|-----------|---------|-----------|--------|--------|--------|
| `protocol` | identity w10 block | BLOCKING confirmed | BLOCKING confirmed | BLOCKING confirmed | BLOCKING confirmed |
| `can_variant` | identity_flag w8 | not applicable | active | not applicable | not applicable |
| `txd_dominant_timeout` | identity_flag w7 | not applicable | active | not applicable | not applicable |
| `de_polarity` | identity w8 | active | not applicable | not applicable | not applicable |
| `failsafe_receiver` | identity_flag w6 | active | not applicable | not applicable | not applicable |
| `unit_loads` | threshold lte w5 | active | not applicable | not applicable | not applicable |
| `slew_rate_class` | application_review w6 | active | add_review_flag | not applicable | not applicable |
| `vod_differential` | threshold gte w6 | active | active | not applicable | not applicable |
| `receiver_threshold_cm` | threshold superset w7 | active | active | not applicable | not applicable |
| `propagation_delay` | threshold lte w6 | active | escalate_to_primary for CAN FD | active | active |
| `common_mode_range` | threshold superset w6 | active | not applicable | not applicable | not applicable |

#### Question 2: Is galvanic isolation required?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — isolated transceiver required (safety-rated system, ground-fault protection, high-voltage common-mode)** | `isolation_type` → BLOCKING. Non-isolated candidates removed from results. `isolation_working_voltage` → escalate_to_mandatory + threshold ≥ actual fault-condition CM voltage. Both supply domains (host-side VCC1 and bus-side VCC2) must be verified. Isolation class (basic, reinforced, functional) must match safety standard. |
| **No — non-isolated acceptable** | `isolation_type` → unchanged. Isolated replacements are acceptable as upgrades (superset capability) but verify dual-supply requirement doesn't conflict with single-supply PCB design. |

**Affected attributes:**

| Attribute | Default | Q2=Isolated | Q2=Non-Isolated |
|-----------|---------|-------------|-----------------|
| `isolation_type` | identity_flag w8 | escalate_to_mandatory + blockOnMissing — non-isolated BLOCKED | unchanged |
| `isolation_working_voltage` | threshold gte w7 | escalate_to_mandatory — must cover fault CM voltage | not applicable |
| `supply_voltage` | threshold superset w7 | verify both VCC1 and VCC2 domains | unchanged |
| `package_case` | application_review w5 | escalate_to_primary — isolated packages incompatible with SOIC-8 footprint | unchanged |

#### Question 3: What is the operating environment / application severity?

| Answer | Effect on Matching |
|--------|-------------------|
| **Industrial field wiring (RS-485 in conduit, CAN in control panels, exposed connectors, long cable runs >100 m)** | `bus_fault_protection` → escalate_to_primary with threshold ≥±60 V. `esd_bus_pins` → escalate_to_primary with threshold ≥±8 kV (IEC 61000-4-2 Level 4). `common_mode_range` → escalate_to_primary, extended range (−25 V to +25 V) preferred. `slew_rate_class` → escalate_to_primary for RS-485 at moderate speed (EMI compliance). `vod_differential` → escalate_to_primary for long cable (higher margin needed). |
| **Automotive (ECU, BCM, gateway, underhood)** | See Q4 (automotive). `bus_fault_protection` → CAN ±70 V / ±80 V required for ISO 7637 compliance. `standby_current` → escalate_to_primary (quiescent budget). |
| **Consumer / light industrial (protected environment, short cable runs <10 m, no field wiring)** | Standard parametric matching. `bus_fault_protection` → threshold ≥±15 V (minimum). `esd_bus_pins` → threshold ≥±4 kV acceptable. `slew_rate_class` → Application Review only. |

**Affected attributes:**

| Attribute | Default | Q3=Industrial | Q3=Automotive (→Q4) | Q3=Consumer |
|-----------|---------|---------------|---------------------|-------------|
| `bus_fault_protection` | threshold gte w8 | escalate_to_primary ≥±60 V | escalate_to_primary ≥±70 V CAN | threshold ≥±15 V minimum |
| `esd_bus_pins` | threshold gte w7 | escalate_to_primary ≥±8 kV | escalate_to_primary ≥±8 kV | ≥±4 kV acceptable |
| `common_mode_range` | threshold superset w6 | escalate_to_primary, extended range preferred | unchanged | unchanged |
| `slew_rate_class` | application_review w6 | escalate_to_primary for RS-485 ≤1 Mbit/s | unchanged | unchanged |
| `vod_differential` | threshold gte w6 | escalate_to_primary | unchanged | unchanged |
| `standby_current` | threshold lte w5 | unchanged | escalate_to_primary | unchanged |

#### Question 4: Is this an automotive design (AEC-Q100 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive ECU, BCM, gateway, ADAS (AEC-Q100 required)** | `aec_q100` → BLOCKING. Non-automotive parts removed from results. `operating_temp` → escalate_to_mandatory with range ≥ −40°C to +125°C (Grade 1). `standby_current` → escalate_to_primary (ECU quiescent budget). CAN-specific: `can_variant` → verify CAN FD support if network uses CAN FD. `bus_fault_protection` → ≥±70 V for ISO 7637 load dump compliance. |
| **No** | `aec_q100` → unchanged (Operational). Standard environmental matching. |

**Affected attributes:**

| Attribute | Default | Q4=Yes (Automotive) | Q4=No |
|-----------|---------|---------------------|-------|
| `aec_q100` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp` | threshold superset w7 | escalate_to_mandatory — must cover −40°C to +125°C minimum | unchanged |
| `standby_current` | threshold lte w5 | escalate_to_primary | unchanged |
| `bus_fault_protection` | threshold gte w8 | CAN: escalate threshold to ≥±70 V | unchanged |



### 35. Timers and Oscillators (Family C8)

**Context sensitivity: MODERATE**

Device category is the first and hardest gate — 555 timers and packaged oscillators (XO, MEMS, TCXO, VCXO, OCXO) are architecturally unrelated components that share a Digikey category label but serve completely different functions. Within the oscillator subcategory, the stability class determines the accuracy and power trade-off that the original engineer chose deliberately.

Context questions branch immediately after Q1. The oscillator stability / application question (Q2) is the most impactful for threshold escalation — it determines whether frequency tolerance and TC are primary matching axes or secondary concerns. Output enable polarity (handled as an Identity Flag in the logic table) is identified from the original part's datasheet rather than a context question.

**Digikey:** Four subcategories span C8: "Oscillators" (packaged XO), "Clock/Timing - Programmable Oscillators" (MEMS, programmable), "Clock/Timing - Crystal Oscillators" (another oscillator type), "555 Timers". Most parametric fields (frequency, supply voltage, operating temperature, output type, AEC-Q100) are present in Digikey. Missing from Digikey: aging/drift rate, phase jitter (for many entries), VCXO pull range, startup time, OE polarity for many parts, MEMS vs. quartz flag.

**22 matching rules** (total weight: ~138):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `device_category` | identity | 10 | yes | HARD GATE. 555 timer / XO / MEMS / TCXO / VCXO / OCXO. No cross-category substitution |
| 2 | `output_frequency_hz` | identity | 10 | yes | Exact match for oscillators. Not applicable for 555 (set by external R/C) |
| 3 | `output_signal_type` | identity | 9 | yes | CMOS / TTL / LVDS / LVPECL / Clipped Sine / Open Drain |
| 4 | `oe_polarity` | identity_flag | 8 | no | Active-low /OE / Active-high OE / No enable. Polarity mismatch = clock always on or always off |
| 5 | `timer_variant` | identity_flag | 7 | no | CMOS vs. bipolar (555-family only). Supply voltage and output drive constraints |
| 6 | `vcxo_pull_range_ppm` | identity_flag | 8 | no | VCXO only. Pull range and sensitivity must match PLL design. Escalated w10 if VCXO (Q1) |
| 7 | `initial_tolerance_ppm` | threshold lte | 8 | no | Replacement tolerance ≤ original. Escalated to w10+blockOnMissing for comms/precision (Q2) |
| 8 | `temp_stability_ppm` | threshold lte | 8 | no | Over full operating range. Escalated to w10+blockOnMissing for TCXO-class apps (Q2) |
| 9 | `aging_ppm_per_year` | threshold lte | 5 | no | Escalated to w8 for long-deployment / uncalibrated systems (Q2) |
| 10 | `output_voh_vol` | threshold superset | 7 | no | Must cover downstream logic VIH/VIL. 5V oscillator into 3.3V logic = overstress |
| 11 | `output_drive_cl_pf` | threshold gte | 6 | no | Max capacitive load. Replacement must match or exceed rated CL |
| 12 | `duty_cycle_pct` | threshold superset | 5 | no | Acceptable range must contain actual duty cycle. Escalated for high-speed SerDes (Q2) |
| 13 | `phase_jitter_ps_rms` | threshold lte | 7 | no | RMS jitter over specified integration BW. Escalated to w10 for DDR/SerDes (Q2) |
| 14 | `startup_time_ms` | threshold lte | 5 | no | Escalated for fast-wakeup battery applications (Q3) |
| 15 | `supply_voltage_range` | threshold superset | 8 | yes | Must contain actual board supply including transients |
| 16 | `icc_active_ma` | threshold lte | 6 | no | Escalated to primary for battery-powered systems (Q3) |
| 17 | `icc_standby_ua` | threshold lte | 5 | no | Distinguish tri-state vs. full-shutdown behavior if startup time matters |
| 18 | `operating_temp_range` | threshold superset | 7 | yes | Must fully cover application range |
| 19 | `aec_q100` | identity_flag | 4 | no | Escalated to w10+blockOnMissing for automotive (Q4) |
| 20 | `package_case` | application_review | 5 | no | 4-pad SMD footprint dimensions + pad assignment. Pad 1 function varies by vendor |
| 21 | `crystal_load_cap_pf` | application_review | 3 | no | Discrete crystal circuits only. Not applicable for packaged oscillators |
| 22 | `packaging_format` | operational | 1 | no | T&R / cut tape / tray / bulk |

**MPN enrichment** (~50 prefix patterns): Infers `device_category` (NE555/LM555/SA555/ICM7555/TLC555/LMC555/TS555 = 555 timer; SiT8*/DSC1*/ASFL*/ECS-*-MV = MEMS oscillator; ASTX*/TG5*/NDK-T = TCXO; SiT3807/SiT3544/SiT9102 = VCXO), `output_frequency_hz` (parsed from MPN numeric field where present), `output_signal_type` (suffix codes: -C = CMOS, -L = LVDS, -E = LVPECL), `oe_polarity` (suffix codes where standardized). Post-scoring filter blocks cross-category candidates before ranking.

#### Question 1 (BLOCKING): What is the device category?

| Answer | Effect on Matching |
|--------|-------------------|
| **555 / 556 Timer IC** | All oscillator candidates blocked. Activates `timer_variant` (CMOS vs. bipolar). `output_frequency_hz` → not applicable (frequency is set by external R/C). `output_signal_type` → not applicable (555 output is open-collector/CMOS drive, not a clock signal type). Focus matching on supply voltage range, output current, quiescent current, and reset pin polarity. |
| **Packaged Crystal Oscillator (XO)** | All 555, TCXO, VCXO, OCXO candidates blocked unless stability class matches. `output_frequency_hz` → mandatory + blockOnMissing. `vcxo_pull_range_ppm` → not applicable. Proceed to Q2 for stability context. |
| **MEMS Oscillator** | Same rules as XO. Note: MEMS replacements for crystal XO are valid drop-in substitutions if frequency, supply, and output type match — `device_category` match is relaxed to allow XO↔MEMS cross-substitution with an Application Review flag noting MEMS-specific behavior differences (startup time, phase noise signature, vibration sensitivity). |
| **TCXO** | XO and OCXO candidates blocked (wrong stability class). `temp_stability_ppm` → escalated to mandatory. `aging_ppm_per_year` → escalated to primary. VCXO and MEMS-TCXO are acceptable substitutions with App Review. |
| **VCXO** | `vcxo_pull_range_ppm` → escalated to mandatory + blockOnMissing. Fixed-frequency XO/TCXO candidates blocked — cannot replace a voltage-controlled device. |
| **OCXO** | All non-OCXO candidates blocked (TCXO cannot provide OCXO-class stability). `temp_stability_ppm` and `aging_ppm_per_year` → both escalated to mandatory. `icc_active_ma` → escalated to primary (OCXO oven current is the dominant power concern). |

#### Question 2: What is the frequency accuracy / stability requirement of the application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Communications / protocol timing (Bluetooth, Wi-Fi, cellular, GPS, USB HS, Ethernet, SyncE)** | `initial_tolerance_ppm` → escalate_to_mandatory + blockOnMissing with threshold ≤ protocol-specific limit (USB HS: ±100 ppm total; Ethernet: ±100 ppm; Bluetooth: ±20 ppm). `temp_stability_ppm` → escalate_to_mandatory + blockOnMissing. `phase_jitter_ps_rms` → escalate_to_primary with protocol-specific threshold. Flag XO-for-TCXO substitutions as Application Review with error budget calculation note. |
| **Precision / instrumentation (ADC sampling clock, metrology, calibration equipment)** | `initial_tolerance_ppm` → escalate_to_primary. `temp_stability_ppm` → escalate_to_primary. `aging_ppm_per_year` → escalate_to_primary. `phase_jitter_ps_rms` → escalate_to_primary. |
| **High-speed digital (DDR memory, PCIe, SATA, USB HS SerDes)** | `phase_jitter_ps_rms` → escalate_to_mandatory + blockOnMissing with interface-specific threshold (DDR3: ≤10 ps RMS; PCIe Gen1: ≤25 ps RMS; USB HS: ≤200 ps peak-peak). `duty_cycle_pct` → escalate_to_primary (asymmetric duty cycle closes timing eye). |
| **General digital / microcontroller clock (UART, SPI, I2C, general timing)** | Default weights apply. `initial_tolerance_ppm` and `temp_stability_ppm` remain at default weight. XO substitution for TCXO is acceptable with App Review note only. |

**Affected attributes:**

| Attribute | Default | Q2=Comms | Q2=Precision | Q2=SerDes | Q2=General |
|-----------|---------|----------|--------------|-----------|------------|
| `initial_tolerance_ppm` | threshold lte w8 | escalate_to_mandatory + blockOnMissing | escalate_to_primary | unchanged | unchanged |
| `temp_stability_ppm` | threshold lte w8 | escalate_to_mandatory + blockOnMissing | escalate_to_primary | unchanged | unchanged |
| `aging_ppm_per_year` | threshold lte w5 | escalate_to_primary | escalate_to_primary | unchanged | unchanged |
| `phase_jitter_ps_rms` | threshold lte w7 | escalate_to_primary | escalate_to_primary | escalate_to_mandatory + blockOnMissing | unchanged |
| `duty_cycle_pct` | threshold superset w5 | unchanged | unchanged | escalate_to_primary | unchanged |

#### Question 3: Is this a battery-powered / power-constrained application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — battery powered, energy harvested, or tight power budget** | `icc_active_ma` → escalate_to_primary. `icc_standby_ua` → escalate_to_primary; also flag whether replacement enters full shutdown (slow restart) vs. output tri-state (fast restart) on /OE assertion. `startup_time_ms` → escalate_to_primary if system uses frequent sleep/wake cycles. OCXO candidates → add_review_flag noting oven heater current may exceed entire system power budget. |
| **No — mains-powered or power not constrained** | Default weights apply. `icc_active_ma` and `icc_standby_ua` remain at default weight. |

**Affected attributes:**

| Attribute | Default | Q3=Battery | Q3=Mains |
|-----------|---------|------------|----------|
| `icc_active_ma` | threshold lte w6 | escalate_to_primary | unchanged |
| `icc_standby_ua` | threshold lte w5 | escalate_to_primary | unchanged |
| `startup_time_ms` | threshold lte w5 | escalate_to_primary | unchanged |

#### Question 4: Is this an automotive design (AEC-Q100 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive (AEC-Q100 required)** | `aec_q100` → escalate_to_mandatory + blockOnMissing. Non-automotive parts removed from candidate pool. `operating_temp_range` → escalate_to_mandatory with range ≥ −40°C to +125°C (Grade 1). For MEMS oscillators: verify AEC-Q100 grade includes vibration characterization — not all AEC-Q100 MEMS oscillators are characterized for automotive vibration profiles. |
| **No** | `aec_q100` → unchanged (Operational weight). Standard environmental matching. |

**Affected attributes:**

| Attribute | Default | Q4=Yes (Automotive) | Q4=No |
|-----------|---------|---------------------|-------|
| `aec_q100` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp_range` | threshold superset w7 | escalate_to_mandatory ≥ −40°C to +125°C | unchanged |



### 36. ADCs — Analog-to-Digital Converters (Family C9)

**Context sensitivity: HIGH**

Architecture is the first and hardest gate. SAR, Delta-Sigma, Pipeline, and Flash converters have fundamentally different latency, noise floor, speed, and power characteristics — substitution across architectures requires firmware changes and may destabilize control loops. Within architecture, simultaneous sampling topology is the second hard gate for multi-channel applications.

**Digikey:** Single category "Data Acquisition — Analog to Digital Converters (ADC)" covers all architectures. Key parametric fields present: resolution, sample rate, interface, channel count, supply voltage, operating temp, AEC-Q100. Missing from Digikey: ENOB, simultaneous sampling flag (sometimes), conversion latency cycles, INL/DNL (sometimes).

**20 matching rules** (total weight: ~135):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `architecture` | identity | 10 | yes | HARD GATE. SAR / Delta-Sigma / Pipeline / Flash. Post-scoring filter removes all cross-architecture candidates |
| 2 | `resolution_bits` | identity | 10 | yes | Exact match. 12-bit ≠ 16-bit. Higher resolution acceptable with App Review; lower is BLOCKED |
| 3 | `interface_type` | identity | 9 | yes | SPI / I2C / Parallel / LVDS. Different firmware drivers, PCB routing, pin counts |
| 4 | `input_configuration` | identity | 9 | yes | Single-ended / Differential / Pseudo-differential. Circuit and PCB design specific |
| 5 | `channel_count` | threshold gte | 8 | yes | Replacement channels ≥ original. More channels OK; fewer BLOCKED |
| 6 | `simultaneous_sampling` | identity_flag | 9 | no | BLOCKING when original is simultaneous — multiplexed cannot substitute for phase-sensitive applications |
| 7 | `sample_rate_sps` | threshold gte | 8 | yes | Replacement rate ≥ original. For Delta-Sigma: output data rate (ODR) |
| 8 | `enob` | threshold gte | 7 | no | Effective Number Of Bits. Escalated to mandatory + blockOnMissing for 16–24-bit precision (Q2) |
| 9 | `inl_lsb` | threshold lte | 7 | no | Integral Non-Linearity. Escalated for precision/instrumentation (Q2) |
| 10 | `dnl_lsb` | threshold lte | 6 | no | Differential Non-Linearity. DNL > 1 LSB = missing codes — catastrophic for control |
| 11 | `thd_db` | threshold lte | 6 | no | Total Harmonic Distortion (dBc). Escalated for AC-signal/audio applications |
| 12 | `reference_type` | identity_flag | 7 | no | Internal / External / Both. Escalated to mandatory for precision (Q2) |
| 13 | `reference_voltage` | application_review | 5 | no | Internal Vref voltage. Different Vref changes LSB size |
| 14 | `input_voltage_range` | threshold superset | 7 | no | Must contain actual signal range. Unipolar ≠ bipolar |
| 15 | `conversion_latency_cycles` | threshold lte | 6 | no | Escalated to mandatory for control loop applications (Q3). Delta-Sigma latency is decimation filter group delay |
| 16 | `supply_voltage_range` | threshold superset | 7 | yes | Must contain actual board supply. Verify AVDD and DVDD separately |
| 17 | `power_consumption_mw` | threshold lte | 5 | no | Escalated to primary for battery-powered (Q3) |
| 18 | `operating_temp_range` | threshold superset | 7 | yes | Must fully cover application range |
| 19 | `aec_q100` | identity_flag | 4 | no | Escalated to mandatory + blockOnMissing for automotive (Q4) |
| 20 | `package_case` | application_review | 5 | no | Exposed pad, guard ring, AGND/DGND pin separation — layout-sensitive |

**MPN enrichment** (~60 prefix patterns): Infers `architecture` (ADS1x/AD77xx/CS5x = Delta-Sigma; ADS7x/ADS8x/AD76xx/MAX11x/LTC18xx = SAR; ADS5x/AD92xx = Pipeline; MAX11xx high-speed = Flash), `resolution_bits` (parsed from model number), `interface_type` (I2C from ADS1115/ADS1013 family; SPI from ADS8688/ADS1256; parallel from AD9226). Post-scoring filter blocks cross-architecture candidates before ranking.

#### Question 1 (BLOCKING): What is the ADC architecture?

| Answer | Effect on Matching |
|--------|-------------------|
| **SAR** | Delta-Sigma, Pipeline, Flash blocked. `simultaneous_sampling` → active. `conversion_latency_cycles` → active at 1-cycle class. |
| **Delta-Sigma** | SAR, Pipeline, Flash blocked. `conversion_latency_cycles` → escalate_to_primary. `enob` → must be evaluated at application ODR. |
| **Pipeline** | SAR, Delta-Sigma, Flash blocked. `sample_rate_sps` → escalate_to_primary. `thd_db` → escalate_to_primary. |
| **Flash** | SAR, Delta-Sigma, Pipeline blocked. `sample_rate_sps` → escalate_to_mandatory. `power_consumption_mw` → escalate_to_primary. |

#### Question 2: What is the resolution / precision class?

| Answer | Effect on Matching |
|--------|-------------------|
| **≤12-bit general purpose** | Default thresholds. `enob` → Application Review. `inl_lsb` ≤ 2 LSB threshold. `dnl_lsb` ≤ 1 LSB. |
| **12–16-bit precision** | `enob` → escalate_to_primary. `inl_lsb` → escalate_to_primary ≤ 1 LSB. `dnl_lsb` → escalate_to_primary ≤ 0.5 LSB. `reference_type` → escalate_to_primary. |
| **16–24-bit high precision** | `enob` → escalate_to_mandatory + blockOnMissing. `inl_lsb` → escalate_to_mandatory ≤ 0.5 LSB. `dnl_lsb` → escalate_to_mandatory. `reference_type` → escalate_to_mandatory. `reference_voltage` → escalate_to_primary. |

**Affected attributes:**

| Attribute | Default | Q2=≤12-bit | Q2=12–16-bit | Q2=16–24-bit |
|-----------|---------|------------|-------------|-------------|
| `enob` | threshold gte w7 | Application Review | escalate_to_primary | escalate_to_mandatory + blockOnMissing |
| `inl_lsb` | threshold lte w7 | ≤ 2 LSB | escalate_to_primary ≤ 1 LSB | escalate_to_mandatory ≤ 0.5 LSB |
| `dnl_lsb` | threshold lte w6 | ≤ 1 LSB | escalate_to_primary ≤ 0.5 LSB | escalate_to_mandatory ≤ 0.5 LSB |
| `reference_type` | identity_flag w7 | unchanged | escalate_to_primary | escalate_to_mandatory |
| `reference_voltage` | application_review w5 | unchanged | unchanged | escalate_to_primary |
| `thd_db` | threshold lte w6 | Application Review | escalate_to_primary | escalate_to_primary |

#### Question 3: What is the channel / sampling topology and application type?

| Answer | Effect on Matching |
|--------|-------------------|
| **Single-channel or multiplexed multi-channel** | `simultaneous_sampling` → not required. `channel_count` → threshold ≥. `conversion_latency_cycles` → standard threshold. |
| **Simultaneous sampling (multi-channel, phase-sensitive)** | `simultaneous_sampling` → escalate_to_mandatory + blockOnMissing. Multiplexed ADCs BLOCKED. `channel_count` → exact match required. |
| **Control loop / closed-loop feedback** | `conversion_latency_cycles` → escalate_to_mandatory + blockOnMissing. Delta-Sigma flagged Application Review with latency calculation. `sample_rate_sps` → escalate_to_primary. |
| **Battery-powered / power-constrained** | `power_consumption_mw` → escalate_to_primary. High-speed pipeline ADCs add Application Review flag for power. |

#### Question 4: Is this an automotive design (AEC-Q100 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive** | `aec_q100` → escalate_to_mandatory + blockOnMissing. Non-AEC candidates removed. `operating_temp_range` → escalate_to_mandatory −40°C to +125°C. |
| **No** | `aec_q100` → Operational. Standard environmental matching. |

**Affected attributes:**

| Attribute | Default | Q4=Yes (Automotive) | Q4=No |
|-----------|---------|---------------------|-------|
| `aec_q100` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp_range` | threshold superset w7 | escalate_to_mandatory −40°C to +125°C | unchanged |



### 37. DACs — Digital-to-Analog Converters (Family C10)

**Context sensitivity: HIGH**

Output type (voltage vs. current) is the first and hardest gate. Voltage-output and current-output DACs are architecturally incompatible — no cross-type substitution is possible. Within voltage-output DACs, resolution class and glitch energy drive the most impactful substitution constraints. Power-on reset state is BLOCKING when it determines actuator safe/unsafe state before firmware loads.

**Digikey:** Three subcategories cover C10: "Data Acquisition — Digital to Analog Converters (DAC)" (general-purpose and precision), "Audio — DAC" (audio-grade), and current-output variants within the DAC category. Key parametric fields present: resolution, channel count, interface, supply voltage, update rate, AEC-Q100. Missing from Digikey: glitch energy (nVs), output_buffered flag (sometimes), power_on_reset state, settling time (sometimes), output noise density.

**22 matching rules** (total weight: ~140):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `output_type` | identity | 10 | yes | HARD GATE. Voltage output vs. Current output. Post-scoring filter removes all cross-type candidates |
| 2 | `resolution_bits` | identity | 10 | yes | Exact match. Higher resolution acceptable with App Review; lower is BLOCKED |
| 3 | `interface_type` | identity | 9 | yes | SPI / I2C / Parallel / Async. Requires different firmware drivers and PCB routing |
| 4 | `architecture` | identity_flag | 7 | no | R-2R / Current-steering / Delta-Sigma / PWM. Escalated for audio and precision (Q3) |
| 5 | `output_buffered` | identity_flag | 8 | no | Buffered (internal op-amp, low output impedance) vs. Unbuffered (resistor-string tap, high-Z). BLOCK unbuffered replacing buffered when no external buffer exists |
| 6 | `channel_count` | threshold gte | 7 | yes | Replacement channels ≥ original. More OK; fewer BLOCKED |
| 7 | `update_rate_sps` | threshold gte | 7 | yes | Replacement rate ≥ original. For audio: must match sample rate exactly |
| 8 | `power_on_reset_state` | identity_flag | 8 | no | Output state before firmware initializes. BLOCKING when POR state determines actuator safe/unsafe condition |
| 9 | `inl_lsb` | threshold lte | 7 | no | Integral Non-Linearity. Cannot be calibrated out. Escalated for precision (Q2) |
| 10 | `dnl_lsb` | threshold lte | 7 | no | Differential Non-Linearity. DNL > 1 LSB = non-monotonic output — catastrophic for closed-loop control |
| 11 | `glitch_energy_nVs` | threshold lte | 7 | no | Glitch impulse at code transitions. Escalated to mandatory for audio (Q3). Rarely in Digikey — read datasheet |
| 12 | `settling_time_us` | threshold lte | 7 | no | Time to settle within 1 LSB after full-scale step. Escalated for audio and precision (Q3) |
| 13 | `output_noise_density_nvhz` | threshold lte | 6 | no | Output voltage noise (nV/√Hz). Escalated to mandatory for audio and precision DC (Q3) |
| 14 | `reference_type` | identity_flag | 7 | no | Internal / External / Both. Escalated to mandatory for precision (Q2) |
| 15 | `reference_voltage` | application_review | 5 | no | Internal Vref voltage. Different Vref shifts full-scale range and LSB size |
| 16 | `output_voltage_range` | threshold superset | 8 | yes | Must contain required output voltage range. Clipping = distortion |
| 17 | `output_current_source_ma` | threshold gte | 6 | no | Buffered output drive current. For current-output DACs: full-scale current must match loop standard |
| 18 | `supply_voltage_range` | threshold superset | 7 | yes | Must contain board supply. Verify AVDD and DVDD separately |
| 19 | `power_consumption_mw` | threshold lte | 5 | no | Escalated to primary for battery-powered (Q3) |
| 20 | `operating_temp_range` | threshold superset | 7 | yes | Must fully cover application range |
| 21 | `aec_q100` | identity_flag | 4 | no | Escalated to mandatory + blockOnMissing for automotive (Q4) |
| 22 | `package_case` | application_review | 5 | no | Layout-sensitive: exposed pad, AGND/DGND separation. App Review on package change |

**MPN enrichment** (~55 prefix patterns): Infers `output_type` (DAC876x/XTR116/DAC420 = current output; all others = voltage output), `resolution_bits` (parsed from model number: DAC8562=12-bit, DAC8568=16-bit, AD5791=20-bit, MAX5762=16-bit), `interface_type` (I2C from MCP4726/DAC7311/AD5625 families; SPI from DAC8568/AD5791/LTC2756; I2S from PCM51xx/CS434x audio families), `architecture` (PCM/CS/TAS families = Delta-Sigma audio; AD5791/LTC2756 = precision R-2R). Post-scoring filter blocks cross-type (voltage/current) candidates before ranking.

#### Question 1 (BLOCKING): What is the DAC output type?

| Answer | Effect on Matching |
|--------|-------------------|
| **Voltage output** | Current-output candidates BLOCKED. `output_voltage_range` → mandatory + blockOnMissing. `output_buffered` → active. `output_current_source_ma` → active (load drive). |
| **Current output (4–20 mA industrial loop)** | Voltage-output candidates BLOCKED. `output_current_source_ma` → escalate_to_mandatory + blockOnMissing. `output_voltage_range` → not applicable. Verify compliance voltage covers max loop resistance. |

#### Question 2: What is the resolution / precision class?

| Answer | Effect on Matching |
|--------|-------------------|
| **≤12-bit general purpose** | Default thresholds. `inl_lsb` ≤ 2 LSB. `dnl_lsb` ≤ 1 LSB. `glitch_energy_nVs` → Application Review. `output_noise_density_nvhz` → Application Review. |
| **12–16-bit precision** | `inl_lsb` → escalate_to_primary ≤ 1 LSB. `dnl_lsb` → escalate_to_primary ≤ 0.5 LSB. `reference_type` → escalate_to_primary. `glitch_energy_nVs` → escalate_to_primary. `settling_time_us` → escalate_to_primary. `output_noise_density_nvhz` → escalate_to_primary. |
| **16–20-bit high precision** | `inl_lsb` → escalate_to_mandatory ≤ 0.5 LSB. `dnl_lsb` → escalate_to_mandatory ≤ 0.5 LSB. `reference_type` → escalate_to_mandatory. `reference_voltage` → escalate_to_primary. `glitch_energy_nVs` → escalate_to_mandatory. `settling_time_us` → escalate_to_mandatory. `output_noise_density_nvhz` → escalate_to_mandatory. |

**Affected attributes:**

| Attribute | Default | Q2=≤12-bit | Q2=12–16-bit | Q2=16–20-bit |
|-----------|---------|------------|-------------|-------------|
| `inl_lsb` | threshold lte w7 | ≤ 2 LSB | escalate_to_primary ≤ 1 LSB | escalate_to_mandatory ≤ 0.5 LSB |
| `dnl_lsb` | threshold lte w7 | ≤ 1 LSB | escalate_to_primary ≤ 0.5 LSB | escalate_to_mandatory ≤ 0.5 LSB |
| `reference_type` | identity_flag w7 | unchanged | escalate_to_primary | escalate_to_mandatory |
| `reference_voltage` | application_review w5 | unchanged | unchanged | escalate_to_primary |
| `glitch_energy_nVs` | threshold lte w7 | Application Review | escalate_to_primary | escalate_to_mandatory |
| `settling_time_us` | threshold lte w7 | default | escalate_to_primary | escalate_to_mandatory |
| `output_noise_density_nvhz` | threshold lte w6 | Application Review | escalate_to_primary | escalate_to_mandatory |

#### Question 3: What is the application type?

| Answer | Effect on Matching |
|--------|-------------------|
| **Audio** | `glitch_energy_nVs` → escalate_to_mandatory ≤ 10 nVs. `output_noise_density_nvhz` → escalate_to_mandatory. `update_rate_sps` → escalate_to_mandatory (must match audio sample rate). `settling_time_us` → escalate_to_mandatory < 1/update_rate. `architecture` → escalate_to_primary (Delta-Sigma preferred). |
| **Precision DC / waveform generation** | `inl_lsb` → escalate_to_mandatory. `dnl_lsb` → escalate_to_mandatory. `glitch_energy_nVs` → escalate_to_primary. `output_noise_density_nvhz` → escalate_to_primary. `reference_type` → escalate_to_mandatory. `power_on_reset_state` → Application Review. |
| **Industrial process control** | `power_on_reset_state` → escalate_to_mandatory (safe state before firmware). `output_buffered` → escalate_to_primary. `settling_time_us` → escalate_to_primary for fast loops. |
| **Battery-powered / power-constrained** | `power_consumption_mw` → escalate_to_primary. High-speed/current-steering → Application Review flag for power. |

#### Question 4: Is this an automotive design (AEC-Q100 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive** | `aec_q100` → escalate_to_mandatory + blockOnMissing. Non-AEC candidates removed. `operating_temp_range` → escalate_to_mandatory −40°C to +125°C. `power_on_reset_state` → escalate_to_primary. |
| **No** | `aec_q100` → Operational. Standard environmental matching. |

**Affected attributes:**

| Attribute | Default | Q4=Yes (Automotive) | Q4=No |
|-----------|---------|---------------------|-------|
| `aec_q100` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp_range` | threshold superset w7 | escalate_to_mandatory −40°C to +125°C | unchanged |
| `power_on_reset_state` | identity_flag w8 | escalate_to_primary | unchanged |



## Block D: Frequency Components

---

### 38. Crystals — Quartz Resonators (Family D1)

**Context sensitivity: MODERATE-HIGH**

Nominal frequency and load capacitance are both hard Identity gates. Load capacitance is the most commonly mismatched crystal parameter — it shifts the oscillation frequency by 30–100 ppm and cannot be corrected in firmware. ESR determines oscillator startup margin at cold temperature (minimum 5× negative-resistance margin required). Overtone mode is a hard gate — a 3rd-overtone crystal in a fundamental-mode circuit oscillates at the wrong (lower) frequency.

**Digikey:** Single category "Crystals and Oscillators — Crystals" covers all quartz resonators. Key parametric fields present: frequency, load capacitance, package, ESR (sometimes), tolerance (ppm), stability (ppm), operating temp, AEC-Q200. Missing from Digikey: aging rate, shunt capacitance (C0), drive level (sometimes), TC curve coefficients, overtone order (sometimes not explicit).

**18 matching rules** (total weight: ~115):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `nominal_frequency_hz` | identity | 10 | yes | Exact match. 16.000 MHz ≠ 16.384 MHz. 32.768 kHz ≠ 32.000 kHz |
| 2 | `cut_type` | identity_flag | 8 | no | AT-cut / Tuning Fork / SC-cut. Determines TC curve shape. Escalated for precision and RTC (Q1) |
| 3 | `frequency_tolerance_ppm` | threshold lte | 8 | no | Initial accuracy at +25°C. Replacement must be ≤ original. Escalated to mandatory for comms/precision (Q1) |
| 4 | `frequency_stability_ppm` | threshold lte | 8 | no | Stability over full operating temp range. Escalated to mandatory for comms/precision (Q1) |
| 5 | `load_capacitance_pf` | identity | 9 | yes | HARD GATE. 12pF ≠ 18pF — shifts frequency 30–100 ppm. PCB external caps are fixed |
| 6 | `equivalent_series_resistance_ohm` | threshold lte | 8 | no | ESR at resonance. 5× negative-resistance margin must be maintained. Escalated for extended temp (Q3) |
| 7 | `drive_level_uw` | threshold lte | 7 | no | Max crystal power absorption. Overdrive causes accelerated aging and electrode fracture |
| 8 | `shunt_capacitance_pf` | threshold lte | 6 | no | Parasitic parallel capacitance (C0). Escalated to mandatory for VCXO circuits (Q2) |
| 9 | `aging_ppm_per_year` | threshold lte | 6 | no | Long-term frequency drift. Escalated to mandatory for precision/RTC (Q1) |
| 10 | `package_type` | identity_flag | 8 | no | SMD size (3225/2016/1612/5032) vs. through-hole (HC-49). Cross-type BLOCKED |
| 11 | `package_pins` | identity_flag | 6 | no | 2-pad vs. 4-pad SMD. 4-pad cannot install in 2-pad footprint |
| 12 | `mounting_type` | identity | 7 | yes | SMD vs. Through-Hole. BLOCK cross-type |
| 13 | `operating_temp_range` | threshold superset | 7 | yes | Must cover full application range |
| 14 | `storage_temp_range` | application_review | 3 | no | Rarely blocking; verify for extreme logistics environments |
| 15 | `aec_q200` | identity_flag | 4 | no | Escalated to mandatory + blockOnMissing for automotive (Q3). Note: AEC-Q200 (passive), not AEC-Q100 |
| 16 | `overtone_order` | identity_flag | 9 | no | Fundamental / 3rd / 5th overtone. HARD GATE — cross-substitution oscillates at wrong frequency |
| 17 | `frequency_vs_temp_curve` | application_review | 4 | no | TC curve shape. Escalated to primary for VCXO replacement circuits (Q2) |
| 18 | `qualification_level` | operational | 2 | no | Commercial / Industrial / MIL-SPEC. Procurement filter only |

**MPN enrichment** (~40 prefix patterns): Infers `nominal_frequency_hz` (parsed from MPN numeric field — ABM8-10.000MHZ → 10 MHz, AB38T-32.768KHZ → 32.768 kHz), `cut_type` (32.768 kHz → Tuning Fork; all others → AT-cut unless SC-cut specified in description), `load_capacitance_pf` (suffix codes where standardized: -B2 = 18pF in Abracon, last numeric field in TXC and Murata), `package_type` (prefix physical size code where encoded), `mounting_type` (SMD vs. HC-49 prefix inferred from package code). Common prefixes: ABM, ABM3, ABM8, AB38T, ABLS, ABLNO (Abracon); 7M, 7V, 9C, 7A (TXC); NX3225, NX5032, NX2016 (NDK); FC-135, MC-306 (Epson); CSTCE, CSTLS (Murata — note: CSTCE is a ceramic resonator, not quartz crystal — flag as Application Review); XTAL, TSX, TSX-3225, TSX-2520, CX3225 (Kyocera); ECS-160, ECS-250 (ECS).

#### Question 1: What is the application / accuracy requirement?

| Answer | Effect on Matching |
|--------|-------------------|
| **Consumer / general purpose** | Default thresholds. `frequency_tolerance_ppm` ≤ 50 ppm. `frequency_stability_ppm` ≤ 100 ppm. `aging_ppm_per_year` → Application Review. |
| **Communications / protocol timing** | `frequency_tolerance_ppm` → escalate_to_mandatory + blockOnMissing. `frequency_stability_ppm` → escalate_to_mandatory. `cut_type` → escalate_to_primary. `aging_ppm_per_year` → escalate_to_primary. |
| **Precision / instrumentation** | `frequency_tolerance_ppm` → escalate_to_mandatory ≤ 10 ppm. `frequency_stability_ppm` → escalate_to_mandatory ≤ 20 ppm. `aging_ppm_per_year` → escalate_to_mandatory. `cut_type` → escalate_to_mandatory. `equivalent_series_resistance_ohm` → escalate_to_primary. `frequency_vs_temp_curve` → escalate_to_primary. |
| **RTC / watch (32.768 kHz)** | `cut_type` → confirm Tuning Fork. `frequency_tolerance_ppm` → escalate_to_primary. `frequency_stability_ppm` → escalate_to_primary. `aging_ppm_per_year` → escalate_to_primary. `equivalent_series_resistance_ohm` → escalate_to_primary. |

**Affected attributes:**

| Attribute | Default | Q1=Consumer | Q1=Comms | Q1=Precision | Q1=RTC |
|-----------|---------|-------------|----------|-------------|--------|
| `frequency_tolerance_ppm` | threshold lte w8 | ≤ 50 ppm | escalate_to_mandatory | escalate_to_mandatory ≤ 10 ppm | escalate_to_primary |
| `frequency_stability_ppm` | threshold lte w8 | ≤ 100 ppm | escalate_to_mandatory | escalate_to_mandatory ≤ 20 ppm | escalate_to_primary |
| `aging_ppm_per_year` | threshold lte w6 | App Review | escalate_to_primary | escalate_to_mandatory | escalate_to_primary |
| `cut_type` | identity_flag w8 | App Review | escalate_to_primary | escalate_to_mandatory | confirm TF |
| `equivalent_series_resistance_ohm` | threshold lte w8 | default | default | escalate_to_primary | escalate_to_primary |
| `frequency_vs_temp_curve` | application_review w4 | unchanged | unchanged | escalate_to_primary | unchanged |

#### Question 2: Is this crystal in a voltage-controlled (VCXO) oscillator circuit?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — VCXO circuit (voltage-controlled pulling)** | `shunt_capacitance_pf` → escalate_to_mandatory + blockOnMissing (±0.5 pF — C0 controls pullability). `frequency_vs_temp_curve` → escalate_to_primary. `equivalent_series_resistance_ohm` → escalate_to_primary. |
| **No — standard fixed-frequency oscillator** | Default matching. `shunt_capacitance_pf` → active at default weight. |

#### Question 3: Is this an extended temperature or automotive application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — extended temp / automotive (−40°C or beyond)** | `operating_temp_range` → escalate_to_mandatory covering full range. `equivalent_series_resistance_ohm` → escalate_to_mandatory (cold ESR must maintain 5× startup margin). `aec_q200` → escalate_to_mandatory + blockOnMissing for automotive. `frequency_stability_ppm` → escalate_to_mandatory over extended range. TF 32.768 kHz candidates → Application Review if range exceeds 0°C to +70°C. |
| **No — commercial temperature (0°C to +70°C)** | Default weights apply. |

**Affected attributes:**

| Attribute | Default | Q3=Extended/Automotive | Q3=Commercial |
|-----------|---------|----------------------|---------------|
| `operating_temp_range` | threshold superset w7 | escalate_to_mandatory full range | unchanged |
| `equivalent_series_resistance_ohm` | threshold lte w8 | escalate_to_mandatory (cold ESR) | unchanged |
| `aec_q200` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `frequency_stability_ppm` | threshold lte w8 | escalate_to_mandatory over extended range | unchanged |


---

### 39. Fuses — Traditional Overcurrent Protection (Family D2)

**Context sensitivity: MODERATE**

Current rating is Identity — not a minimum threshold. Speed class is a hard categorical gate. Voltage rating and breaking capacity are safety-critical minimum thresholds — never downgrade either. I²t let-through energy is the semiconductor-protection spec that is rarely in distributor parametric tables. DC voltage rating is separate from AC rating and is the binding constraint for solar, EV, and battery applications.

**Digikey:** Two subcategories cover D2: "Circuit Protection — Fuses" (cartridge, SMD, PCB) and "Circuit Protection — Automotive Fuses" (blade types). Key parametric fields present: current rating, voltage rating, speed class, breaking capacity, package, mounting, certification. Missing from Digikey: I²t (often absent), melting I²t, derating factor at temperature, explicit DC voltage rating (sometimes separate field, sometimes not).

**14 matching rules** (total weight: ~100):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `current_rating_a` | identity | 10 | yes | HARD GATE. Exact match. 2A ≠ 3A. Upsizing is not a safe substitution — higher rating may not interrupt faults the original would have caught |
| 2 | `voltage_rating_v` | threshold gte | 10 | yes | Replacement rating ≥ circuit voltage. BLOCKING if below. Upsizing (higher voltage rating) is always safe |
| 3 | `breaking_capacity_a` | threshold gte | 10 | yes | Replacement breaking capacity ≥ available fault current. Underrated fuse may rupture or sustain arc during fault |
| 4 | `speed_class` | identity | 9 | yes | HARD GATE. Fast-blow (F) / Slow-blow (T/TT) / Very Fast (FF). Cross-class substitution BLOCKED |
| 5 | `i2t_rating_a2s` | threshold lte | 8 | no | Let-through energy. Escalated to mandatory for semiconductor protection (Q2). Replacement I²t ≤ component I²t rating |
| 6 | `melting_i2t_a2s` | threshold lte | 6 | no | Pre-arcing energy. Escalated to primary for semiconductor protection (Q2) |
| 7 | `package_format` | identity | 9 | yes | HARD GATE. 5×20mm / 6.3×32mm / SMD / Blade (ATM/ATC/APX). Cross-format BLOCKED |
| 8 | `body_material` | identity_flag | 6 | no | Glass / Ceramic / Sand-fill. Escalated to mandatory for high-voltage DC and mains (Q1) |
| 9 | `mounting_type` | identity | 8 | yes | PCB through-hole / SMD / Panel-mount / In-line. BLOCK cross-type |
| 10 | `operating_temp_range` | threshold superset | 6 | no | Must cover full ambient range. Fuse derates at elevated temperature |
| 11 | `derating_factor` | application_review | 5 | no | % of rated current for continuous operation. Flag when operating current is close to derating limit |
| 12 | `voltage_type` | identity_flag | 7 | no | AC / DC / AC+DC. DC-specific rating required for solar, EV, battery. Escalated to mandatory for DC applications (Q1) |
| 13 | `safety_certification` | identity_flag | 7 | no | UL248 / IEC 60127 / AEC-Q200. Escalated to mandatory for mains-connected (Q1) |
| 14 | `aec_q200` | identity_flag | 4 | no | Escalated to mandatory + blockOnMissing for automotive (Q3) |

**MPN enrichment** (~30 prefix patterns): Infers `current_rating_a` and `voltage_rating_v` (parsed from MPN numeric fields), `speed_class` (suffix F = fast-blow, T = slow-blow, TT = very slow, FF = very fast in most Littelfuse/Schurter/Bel naming), `package_format` (prefix or body code: 218 = 5×20mm, 312 = 6.3×32mm, ATO/ATC/ATM/APX = automotive blade, 0451/0685/SF = SMD). Common prefixes: 218, 218T, 312, 312T (Littelfuse cartridge); 0451, 0452, 0453 (Littelfuse SMD); GSF, FST, PFRA (Schurter); 5HH, 5SB, GMA, GMC (Bel Fuse); SF-xx06 (Bourns SMD); ATM, ATO, ATC, APX, MIDI, MAXI (automotive blade — manufacturer-agnostic blade designations).

#### Question 1: What is the supply type and voltage level?

| Answer | Effect on Matching |
|--------|-------------------|
| **AC mains-connected (120–277VAC)** | `voltage_rating_v` → escalate_to_mandatory ≥ circuit voltage. `breaking_capacity_a` → escalate_to_mandatory ≥ 1500A (IEC) or 10000A (UL). `safety_certification` → escalate_to_mandatory. `body_material` → escalate_to_primary (ceramic preferred). `voltage_type` → confirm AC or AC+DC. |
| **Low-voltage DC board-level (≤60VDC)** | `voltage_type` → escalate_to_mandatory + confirm DC rating ≥ circuit voltage. `breaking_capacity_a` → escalate_to_primary. `safety_certification` → default. |
| **High-voltage DC (>60VDC — solar, EV, industrial DC bus)** | `voltage_type` → escalate_to_mandatory. `body_material` → escalate_to_mandatory (ceramic sand-fill — glass BLOCKED for HV DC). `breaking_capacity_a` → escalate_to_mandatory. Non-DC-rated and glass-body fuses → BLOCKED. |

#### Question 2: What is the fuse protecting?

| Answer | Effect on Matching |
|--------|-------------------|
| **Semiconductor protection (MOSFET, IGBT, diode — component cannot survive sustained overcurrent)** | `speed_class` → escalate_to_mandatory Fast-blow (F). Slow-blow BLOCKED. `i2t_rating_a2s` → escalate_to_mandatory + blockOnMissing ≤ component I²t. `melting_i2t_a2s` → escalate_to_primary. |
| **Motor / transformer / inductive load (inrush during normal operation)** | `speed_class` → escalate_to_mandatory Slow-blow (T or TT). Fast-blow BLOCKED. `i2t_rating_a2s` → default. |
| **General wiring / overcurrent protection** | `speed_class` → match original class (default). `i2t_rating_a2s` → Application Review. `breaking_capacity_a` → escalate_to_primary. |

#### Question 3: Is this an automotive application (AEC-Q200 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive** | `aec_q200` → escalate_to_mandatory + blockOnMissing. Non-AEC parts removed before scoring. `operating_temp_range` → escalate_to_mandatory −40°C to +125°C. |
| **No** | `aec_q200` → Operational. Standard matching. |


## Block E: Optoelectronics

---

### 40. Optocouplers — Photocouplers (Family E1)

**Context sensitivity: MODERATE-HIGH**

Output transistor type is a hard categorical gate before any other evaluation — phototransistor, photodarlington, and logic-output devices differ in gain range, bandwidth, and interface topology. Isolation voltage is a safety attribute that must never be downgraded; working voltage, creepage distance, and clearance distance are independent safety parameters that must all be satisfied. CTR (current transfer ratio) is a gain budget, not a single number — it must be verified at the actual operating If and must carry end-of-life margin based on the CTR degradation curve. Bandwidth and propagation delay are the primary discriminating specs for high-speed digital isolation vs. slow-switching applications.

**Digikey:** Two subcategories cover E1: "Optoisolators — Transistor, Photovoltaic Output" (phototransistor and photodarlington types) and "Optoisolators — Logic Output" (CMOS/TTL-compatible output types). Key parametric fields present: CTR min, isolation voltage, output type, package, channel count, operating temperature. Missing from Digikey parametric: creepage/clearance distances, working voltage (Vrms), CTR degradation curves, safety certification mark, peak isolation voltage.

**23 matching rules** (total weight: ~153):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `output_transistor_type` | identity | 10 | yes | HARD GATE. Phototransistor / Photodarlington / Logic-output (open-collector or push-pull). Defines gain, speed, and interface topology. Cross-type BLOCKED |
| 2 | `isolation_voltage_vrms` | threshold gte | 10 | yes | AC test isolation voltage. Replacement ≥ original. BLOCKING if below. Safety attribute — never downgrade |
| 3 | `working_voltage_vrms` | threshold gte | 9 | yes | Continuous rated working voltage across isolation barrier. Must cover actual circuit voltage. Distinct from test voltage |
| 4 | `channel_count` | identity | 9 | yes | HARD GATE. Single / Dual / Quad. Circuit PCB footprint uses a fixed channel count |
| 5 | `package_type` | identity | 9 | yes | HARD GATE. DIP-4 / DIP-6 / SOP-4 / SSOP-4 / SMD. Footprint incompatibility BLOCKED |
| 6 | `creepage_distance_mm` | threshold gte | 8 | no | Minimum creepage distance. Escalated to mandatory for mains-connected reinforced isolation (Q1). Replacement ≥ original |
| 7 | `clearance_distance_mm` | threshold gte | 7 | no | Minimum clearance (air path). Paired with creepage — one cannot compensate for the other. Escalated for reinforced class (Q1) |
| 8 | `peak_isolation_voltage_v` | threshold gte | 7 | no | Peak non-repetitive isolation voltage. Escalated to mandatory when transient overvoltage present (Q1) |
| 9 | `safety_certification` | identity_flag | 7 | no | UL1577 / IEC 62368-1 / VDE / CSA. Escalated to mandatory for mains-connected safety isolation (Q1) |
| 10 | `pollution_degree` | identity_flag | 5 | no | Pollution degree 1 / 2 / 3. Determines creepage multiplier per IEC 60664. Escalated for harsh environments |
| 11 | `ctr_min_pct` | threshold gte | 9 | no | CTR minimum at specified If. Replacement CTR_min ≥ required minimum. Escalated to mandatory for precision CTR (Q3) |
| 12 | `ctr_max_pct` | threshold lte | 7 | no | CTR maximum. Relevant when load circuit assumes bounded gain. Escalated to mandatory for precision CTR (Q3) |
| 13 | `ctr_class` | identity_flag | 6 | no | CTR rank suffix (A/B/C/D/E). Escalated to mandatory for precision CTR (Q3) |
| 14 | `if_rated_ma` | threshold lte | 7 | yes | LED rated continuous forward current. Circuit drive current must not exceed this |
| 15 | `input_forward_voltage_vf` | threshold lte | 7 | no | LED Vf at specified If. Replacement Vf ≤ original to avoid exceeding input drive voltage budget |
| 16 | `vce_sat_v` | threshold lte | 8 | no | Output transistor saturation voltage. Escalated for logic-output types and tight output swing applications |
| 17 | `bandwidth_khz` | threshold gte | 8 | no | Small-signal bandwidth or max switching frequency. Escalated to mandatory for high-speed digital isolation (Q2) |
| 18 | `propagation_delay_us` | threshold lte | 7 | no | Turn-on/turn-off propagation delay. Escalated to mandatory for digital/PWM applications (Q2). Asymmetric tpHL/tpLH distorts PWM duty cycle |
| 19 | `output_leakage_iceo_ua` | threshold lte | 5 | no | Off-state collector leakage current. Escalated for high-impedance analog input stages |
| 20 | `supply_voltage_vcc` | threshold superset | 7 | no | For logic-output types: VCC range must include board supply. blockOnMissing applies when output_transistor_type = logic-output |
| 21 | `ctr_degradation_pct` | threshold lte | 6 | no | CTR degradation over rated lifetime. Escalated to mandatory for long-life industrial applications (Q3) and automotive (Q4) |
| 22 | `operating_temp_range` | threshold superset | 7 | yes | Must fully cover application range. Extended −40°C to +125°C mandatory for automotive (Q4) |
| 23 | `aec_q101` | identity_flag | 4 | no | AEC-Q101 discrete semiconductor automotive qualification. Escalated to mandatory + blockOnMissing for automotive (Q4). Note: AEC-Q101 (discrete semiconductors) — not AEC-Q100 or AEC-Q200 |

**MPN enrichment** (~30 prefix patterns): Infers `output_transistor_type` (6N137/HCPL-xxxx = logic-output; 4Nxx/H11xx/PC8xx = phototransistor; MCT2/H11Dxx = photodarlington), `ctr_class` (trailing letter suffix for PC817/PC817A/B/C/D family and equivalents), `channel_count` (parsed from description for dual/quad devices), `package_type` (SOP-4/DIP-4/DIP-6 from package code), `isolation_voltage_vrms` (family-level lookup — 5000Vrms for PC817C/D, 3750Vrms for 4N35/36/37). Common prefixes: PC817, PC827 (Sharp/ONSEMI); 4N25, 4N35, 4N36, 4N37 (phototransistor family); 6N135, 6N136, 6N137 (logic-output); H11A1–H11A4, H11D1 (Vishay); HCPL-0314, HCPL-2601, HCPL-3120 (Broadcom/Avago); TLP185, TLP291, TLP785 (Toshiba); MCT2 (ONSEMI photodarlington); SFH6156, SFH617A (OSRAM).

#### Question 1: What is the isolation class / application type?

| Answer | Effect on Matching |
|--------|-------------------|
| **Functional isolation only (low-voltage signal crossing, no safety requirement)** | Default thresholds. `isolation_voltage_vrms` ≥ 500V acceptable. `creepage_distance_mm` and `clearance_distance_mm` → Application Review only. `safety_certification` → not required. `peak_isolation_voltage_v` → Application Review. |
| **Basic isolation (low-voltage boundary, IEC 62368 or similar, single fault protection)** | `isolation_voltage_vrms` → escalate_to_mandatory ≥ 1500V. `working_voltage_vrms` → escalate_to_primary. `creepage_distance_mm` → escalate_to_primary. `clearance_distance_mm` → escalate_to_primary. `safety_certification` → escalate_to_primary. |
| **Reinforced isolation (mains-connected, 2× basic isolation, no accessible single fault)** | `isolation_voltage_vrms` → escalate_to_mandatory ≥ 3750V. `working_voltage_vrms` → escalate_to_mandatory + blockOnMissing. `creepage_distance_mm` → escalate_to_mandatory + blockOnMissing (≥ 8mm at PD2). `clearance_distance_mm` → escalate_to_mandatory. `peak_isolation_voltage_v` → escalate_to_mandatory. `safety_certification` → escalate_to_mandatory + blockOnMissing (UL1577 or VDE required). |
| **Safety-rated / medical / industrial certified (specific certification mark required)** | All reinforced rules apply. `safety_certification` → escalate_to_mandatory + blockOnMissing with specific mark. `pollution_degree` → escalate_to_mandatory. Application Review: verify creepage for pollution degree × overvoltage category. |

**Affected attributes:**

| Attribute | Default | Q1=Functional | Q1=Basic | Q1=Reinforced/Safety |
|-----------|---------|---------------|----------|----------------------|
| `isolation_voltage_vrms` | threshold gte w10 | ≥ 500V | escalate_to_mandatory ≥ 1500V | escalate_to_mandatory ≥ 3750V |
| `working_voltage_vrms` | threshold gte w9 | Application Review | escalate_to_primary | escalate_to_mandatory + blockOnMissing |
| `creepage_distance_mm` | threshold gte w8 | Application Review | escalate_to_primary | escalate_to_mandatory + blockOnMissing |
| `clearance_distance_mm` | threshold gte w7 | Application Review | escalate_to_primary | escalate_to_mandatory |
| `safety_certification` | identity_flag w7 | not required | escalate_to_primary | escalate_to_mandatory + blockOnMissing |
| `peak_isolation_voltage_v` | threshold gte w7 | Application Review | Application Review | escalate_to_mandatory |

#### Question 2: What is the bandwidth / speed requirement?

| Answer | Effect on Matching |
|--------|-------------------|
| **Slow / DC monitoring (≤10 kHz switching, relay driving, slow analog feedback)** | Default thresholds. `bandwidth_khz` → Application Review. `propagation_delay_us` → Application Review. Phototransistor and photodarlington both acceptable. |
| **PWM / control loop (10 kHz–100 kHz switching, motor control, SMPS feedback)** | `bandwidth_khz` → escalate_to_mandatory + blockOnMissing ≥ 5× switching frequency. `propagation_delay_us` → escalate_to_mandatory (tpHL and tpLH asymmetry flags duty-cycle distortion). `output_transistor_type` photodarlington → Application Review flag (typically too slow above 50 kHz). |
| **High-speed digital isolation (>500 kHz, UART/SPI/CAN boundary isolation)** | `bandwidth_khz` → escalate_to_mandatory + blockOnMissing ≥ 2× data rate. `propagation_delay_us` → escalate_to_mandatory. `output_transistor_type` → logic-output strongly preferred; phototransistor BLOCKED above ~1 MHz. `supply_voltage_vcc` → escalate_to_mandatory + blockOnMissing for logic-output types. |
| **Wideband analog isolation (signal fidelity, audio, analog bandwidth)** | `bandwidth_khz` → escalate_to_mandatory + blockOnMissing. `propagation_delay_us` → escalate_to_primary. Phototransistor preferred. Application Review: verify CTR linearity and output load impedance for analog fidelity. |

**Affected attributes:**

| Attribute | Default | Q2=Slow/DC | Q2=PWM/Control | Q2=High-Speed Digital |
|-----------|---------|------------|----------------|----------------------|
| `bandwidth_khz` | threshold gte w8 | Application Review | escalate_to_mandatory ≥ 5× freq | escalate_to_mandatory ≥ 2× data rate |
| `propagation_delay_us` | threshold lte w7 | Application Review | escalate_to_mandatory | escalate_to_mandatory |
| `output_transistor_type` | identity w10 | all types OK | photodarlington App Review | logic-output preferred; phototransistor BLOCKED >1 MHz |
| `supply_voltage_vcc` | threshold superset w7 | N/A if not logic-out | N/A if not logic-out | escalate_to_mandatory + blockOnMissing (logic-out) |

#### Question 3: Is there a CTR precision / range requirement?

| Answer | Effect on Matching |
|--------|-------------------|
| **Standard — CTR minimum only matters (relay driving, digital switching)** | Default thresholds. `ctr_min_pct` → threshold gte w9. `ctr_max_pct` → Application Review. `ctr_class` → Application Review. `ctr_degradation_pct` → Application Review. |
| **Precision CTR — bounded range required (analog feedback, linear region, proportional control)** | `ctr_min_pct` → escalate_to_mandatory + blockOnMissing. `ctr_max_pct` → escalate_to_mandatory + blockOnMissing. `ctr_class` → escalate_to_mandatory. `ctr_degradation_pct` → escalate_to_primary. Application Review: verify CTR at actual operating If. |
| **Long-life / high-reliability (industrial safety relay, 10,000h+ service life)** | `ctr_min_pct` → escalate_to_mandatory with end-of-life margin (initial CTR_min ≥ 2× required minimum). `ctr_degradation_pct` → escalate_to_mandatory + blockOnMissing. `if_rated_ma` → escalate_to_primary (lower If = slower LED aging). Application Review flag for any part without published CTR lifetime curve. |

**Affected attributes:**

| Attribute | Default | Q3=Standard | Q3=Precision CTR | Q3=Long-Life |
|-----------|---------|-------------|-----------------|--------------|
| `ctr_min_pct` | threshold gte w9 | default | escalate_to_mandatory + blockOnMissing | escalate_to_mandatory (2× margin) |
| `ctr_max_pct` | threshold lte w7 | Application Review | escalate_to_mandatory + blockOnMissing | Application Review |
| `ctr_class` | identity_flag w6 | Application Review | escalate_to_mandatory | escalate_to_primary |
| `ctr_degradation_pct` | threshold lte w6 | Application Review | escalate_to_primary | escalate_to_mandatory + blockOnMissing |
| `if_rated_ma` | threshold lte w7 | default | default | escalate_to_primary |

#### Question 4: Is this an automotive application (AEC-Q101 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive (AEC-Q101 required)** | `aec_q101` → escalate_to_mandatory + blockOnMissing. Non-AEC-Q101 parts removed before scoring. `operating_temp_range` → escalate_to_mandatory −40°C to +125°C. `ctr_degradation_pct` → escalate_to_primary. Note: AEC-Q101 (discrete semiconductors) — not AEC-Q100 or AEC-Q200. |
| **No — commercial / industrial** | `aec_q101` → Operational. Standard qualification matching. |

**Affected attributes:**

| Attribute | Default | Q4=Yes (Automotive) | Q4=No |
|-----------|---------|---------------------|-------|
| `aec_q101` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp_range` | threshold superset w7 | escalate_to_mandatory −40°C to +125°C | unchanged |
| `ctr_degradation_pct` | threshold lte w6 | escalate_to_primary | unchanged |


## Block F: Switching & Electromechanical

---

### 41. Electromechanical Relays — EMR (Family F1)

**Context sensitivity: MODERATE-HIGH**

Coil voltage is Identity — exact match required, not a minimum threshold. Contact form is a hard categorical gate that defines wiring topology; cross-form substitution breaks the controlled circuit. Contact current and voltage ratings are safety-critical minimum thresholds and must be derated for inductive and motor loads. Contact material is a hidden reliability gate for dry-circuit (low-current signal) applications — silver contacts form insulating oxide film below ~100mA, causing intermittent failures that do not appear in lab testing at full load current. AEC-Q200 qualification applies to electromechanical components in automotive applications.

**Digikey:** Three subcategories cover F1: "Relays — Power" (general purpose board and panel-mount), "Relays — Signal" (low-level and dry-circuit), and "Relays — Automotive" (AEC-Q200 qualified). Key parametric fields present in Digikey: coil voltage, contact form, contact current rating, contact voltage rating, mounting type, operating temperature. Missing from Digikey parametric: electrical life, contact bounce, coil suppression diode type, DC-specific contact voltage rating (separate from AC), mechanical life.

**23 matching rules** (total weight: ~148):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `coil_voltage_vdc` | identity | 10 | yes | HARD GATE. Must exactly match driver supply voltage. Overvoltage overheats coil; undervoltage fails to operate. Not a threshold — a 12V coil on a 5V supply will not operate |
| 2 | `contact_form` | identity | 10 | yes | HARD GATE. SPST-NO / SPST-NC / SPDT (Form C) / DPST / DPDT. Cross-form substitution BLOCKED — wiring topology is fundamentally different |
| 3 | `mounting_type` | identity | 9 | yes | HARD GATE. PCB through-hole / PCB SMD / DIN-rail / panel-mount / socket. Cross-type BLOCKED — footprint and enclosure are incompatible |
| 4 | `contact_count` | identity | 8 | yes | Number of switched poles (1P/2P/3P/4P). Tied to contact form. Cannot replace 2-pole with 1-pole |
| 5 | `contact_voltage_rating_v` | threshold gte | 9 | yes | Maximum rated switching voltage. Replacement ≥ circuit voltage. BLOCKING if below. AC and DC ratings are separate — verify correct type for load |
| 6 | `contact_current_rating_a` | threshold gte | 9 | yes | Maximum rated switching current. Replacement ≥ original. Derate for inductive (1.5×) and motor (2×) loads. Escalated for inductive/motor (Q1) |
| 7 | `contact_voltage_type` | identity_flag | 7 | no | AC / DC / AC+DC. AC-rated contacts may not be suitable for DC switching applications above 30V. Escalated to mandatory for DC load (Q1) |
| 8 | `contact_material` | identity_flag | 7 | no | AgNi / AgCdO / AgSnO2 / Au-clad / bifurcated gold. Escalated to mandatory for dry-circuit (<100mA) applications (Q1). Gold required for dry-circuit reliability |
| 9 | `max_switching_power_va` | threshold lte | 6 | no | Maximum switching power envelope. Contact rating is bounded by both voltage and current — verify the combination is within rated switching power |
| 10 | `coil_resistance_ohm` | threshold gte | 7 | no | DC coil resistance. Replacement ≥ original to avoid exceeding driver source current capability. Escalated to mandatory for GPIO direct drive (Q2) |
| 11 | `coil_power_mw` | threshold lte | 6 | no | Steady-state coil power consumption. Escalated to mandatory for battery/low-power applications (Q2) |
| 12 | `must_operate_voltage_v` | threshold lte | 7 | no | Minimum reliable operate voltage. Must be ≤ supply voltage minimum. Escalated to mandatory for battery/variable supply (Q2) |
| 13 | `must_release_voltage_v` | threshold gte | 5 | no | Maximum release voltage. Escalated to primary for battery/variable supply (Q2) |
| 14 | `operate_time_ms` | threshold lte | 6 | no | Time from coil energisation to contact closure. Escalated to mandatory for timing-critical applications (Q3) |
| 15 | `release_time_ms` | threshold lte | 6 | no | Time from coil de-energisation to contact opening. Escalated to mandatory for timing-critical applications (Q3). Flyback diode significantly increases release time |
| 16 | `mechanical_life_ops` | threshold gte | 5 | no | No-load endurance. Escalated to primary for high-cycle applications (Q3) |
| 17 | `electrical_life_ops` | threshold gte | 6 | no | Endurance at rated electrical load. Escalated to mandatory for high-cycle industrial applications (Q3). Load-type dependent — inductive load may yield 10–50% of resistive rating |
| 18 | `contact_bounce_ms` | threshold lte | 5 | no | Contact bounce duration after closure. Escalated to primary for timing-critical and counter/edge-detection applications (Q3) |
| 19 | `package_footprint` | identity_flag | 8 | no | PCB footprint / pin pitch. Escalated to mandatory for PCB drop-in replacement. JEDEC and manufacturer-standard footprints interchangeable within that standard |
| 20 | `coil_suppress_diode` | identity_flag | 6 | no | None / Diode / Diode+Zener / Varistor. Change in suppression type requires external circuit modification. Application Review whenever type changes |
| 21 | `operating_temp_range` | threshold superset | 7 | yes | Must fully cover application range. −40°C to +125°C mandatory for automotive (Q4) |
| 22 | `sealing_type` | identity_flag | 5 | no | Open / Sealed / Flux-tight / Fully sealed / Hermetic. Escalated to primary for wash-through assembly and automotive (Q4) |
| 23 | `aec_q200` | identity_flag | 4 | no | AEC-Q200 electromechanical/passive automotive qualification. Escalated to mandatory + blockOnMissing for automotive (Q4). Note: AEC-Q200 — not AEC-Q100 (ICs) or AEC-Q101 (discrete semiconductors) |

**MPN enrichment** (~35 prefix patterns): Infers `coil_voltage_vdc` from MPN suffix (G5LE-1-DC12 → 12V, V23084-A201 → 12V, field position varies by manufacturer), `contact_form` from series model (G5LE-1 = SPDT, G5Q-1 = SPST-NO, G5V-2 = DPDT), `mounting_type` (PCB from series; DIN-rail from prefix like FINDER 40/41 series). Common prefixes: G2R, G2RL, G5LE, G5Q, G5V, G6B, G6C, G6K (Omron); V23084, V23092, IM (TE/Tyco/Axicom); JS, JW, TQ, TXS (Panasonic); FTR (Fujitsu); DS (Aromat); HF115F, HF32F (Hongfa); SRD (Songle/generic PCB). Coil voltage suffix codes: 5/005 = 5V; 12/012 = 12V; 24/024 = 24V; 48/048 = 48V.

#### Question 1: What type of load is being switched?

| Answer | Effect on Matching |
|--------|-------------------|
| **Resistive load (heaters, steady-state lamps, resistive test loads)** | Default thresholds. `contact_current_rating_a` → threshold gte at nominal. `contact_material` → Application Review for currents below 100mA. `electrical_life_ops` → default. |
| **Inductive load (motors, solenoids, transformers, relays)** | `contact_current_rating_a` → escalate_to_mandatory with 1.5× inductive derating applied. `contact_voltage_type` → escalate_to_primary (verify DC rating for DC inductive). `coil_suppress_diode` → escalate_to_primary. `electrical_life_ops` → escalate_to_primary. Application Review: note inductive derating in explanation. |
| **Motor load (high inrush — starting current 3–10× running current)** | `contact_current_rating_a` → escalate_to_mandatory with 2× motor derating or ≥ LRA if known. `contact_voltage_type` → escalate_to_primary. `electrical_life_ops` → escalate_to_mandatory. `coil_suppress_diode` → escalate_to_primary. Application Review: verify rating against locked-rotor amperage. |
| **Dry-circuit / signal switching (load < 100mA)** | `contact_material` → escalate_to_mandatory + blockOnMissing (Au-clad or bifurcated gold required). Silver-contact relays BLOCKED. `max_switching_power_va` → escalate_to_primary (minimum switching current spec). |

**Affected attributes:**

| Attribute | Default | Q1=Resistive | Q1=Inductive | Q1=Motor | Q1=Dry-Circuit |
|-----------|---------|--------------|--------------|----------|----------------|
| `contact_current_rating_a` | threshold gte w9 | default | escalate 1.5× derating | escalate 2× / LRA | default (low current) |
| `contact_material` | identity_flag w7 | App Review <100mA | default | default | escalate_to_mandatory + blockOnMissing |
| `contact_voltage_type` | identity_flag w7 | default | escalate_to_primary | escalate_to_primary | App Review |
| `electrical_life_ops` | threshold gte w6 | default | escalate_to_primary | escalate_to_mandatory | default |
| `coil_suppress_diode` | identity_flag w6 | default | escalate_to_primary | escalate_to_primary | default |

#### Question 2: What is the coil driver circuit?

| Answer | Effect on Matching |
|--------|-------------------|
| **Dedicated relay driver IC or transistor** | Default thresholds. `coil_voltage_vdc` → identity match. `coil_resistance_ohm` → threshold gte w7. `must_operate_voltage_v` → default. |
| **Microcontroller GPIO direct drive (limited source current, 8–25mA typical)** | `coil_resistance_ohm` → escalate_to_mandatory + blockOnMissing (verify coil current ≤ GPIO Ioh_max). `coil_power_mw` → escalate_to_primary. Application Review: flag any replacement where coil_voltage / coil_resistance > 20mA without explicit GPIO capability confirmation. |
| **Battery / low-power supply (voltage varies or droops under load)** | `must_operate_voltage_v` → escalate_to_mandatory (must operate at battery minimum, not nominal). `coil_power_mw` → escalate_to_mandatory + blockOnMissing. `must_release_voltage_v` → escalate_to_primary. |

**Affected attributes:**

| Attribute | Default | Q2=Dedicated Driver | Q2=GPIO Direct | Q2=Battery/Low-Power |
|-----------|---------|---------------------|----------------|----------------------|
| `coil_resistance_ohm` | threshold gte w7 | default | escalate_to_mandatory + blockOnMissing | escalate_to_primary |
| `coil_power_mw` | threshold lte w6 | default | escalate_to_primary | escalate_to_mandatory + blockOnMissing |
| `must_operate_voltage_v` | threshold lte w7 | default | default | escalate_to_mandatory |
| `must_release_voltage_v` | threshold gte w5 | default | default | escalate_to_primary |

#### Question 3: Is this a high-cycle or timing-critical application?

| Answer | Effect on Matching |
|--------|-------------------|
| **Standard / low-cycle (HVAC, lighting, general switching — <100k operations)** | Default thresholds. `operate_time_ms` → Application Review. `release_time_ms` → Application Review. `electrical_life_ops` → threshold gte w6. |
| **High-cycle industrial (>1M operations — production equipment, test fixtures)** | `electrical_life_ops` → escalate_to_mandatory + blockOnMissing (≥ expected cycle count at actual load). `mechanical_life_ops` → escalate_to_primary. `contact_material` → escalate_to_primary (AgSnO2 preferred for high-cycle inductive). Application Review if electrical life < 110% of expected cycles. |
| **Timing-critical / sequential control (operate and release times affect behaviour)** | `operate_time_ms` → escalate_to_mandatory + blockOnMissing. `release_time_ms` → escalate_to_mandatory + blockOnMissing. `contact_bounce_ms` → escalate_to_primary. Application Review: verify flyback suppression matches original — diode suppression significantly extends release time. |

**Affected attributes:**

| Attribute | Default | Q3=Standard | Q3=High-Cycle | Q3=Timing-Critical |
|-----------|---------|-------------|---------------|--------------------|
| `electrical_life_ops` | threshold gte w6 | default | escalate_to_mandatory + blockOnMissing | default |
| `mechanical_life_ops` | threshold gte w5 | default | escalate_to_primary | default |
| `operate_time_ms` | threshold lte w6 | App Review | default | escalate_to_mandatory + blockOnMissing |
| `release_time_ms` | threshold lte w6 | App Review | default | escalate_to_mandatory + blockOnMissing |
| `contact_bounce_ms` | threshold lte w5 | App Review | default | escalate_to_primary |

#### Question 4: Is this an automotive application (AEC-Q200 required)?

| Answer | Effect on Matching |
|--------|-------------------|
| **Yes — automotive (AEC-Q200 required)** | `aec_q200` → escalate_to_mandatory + blockOnMissing. Non-AEC-Q200 parts removed before scoring. `operating_temp_range` → escalate_to_mandatory −40°C to +125°C. `sealing_type` → escalate_to_primary (sealed or fully sealed required). Note: AEC-Q200 (electromechanical/passive) — not AEC-Q100 or AEC-Q101. |
| **No — commercial / industrial** | `aec_q200` → Operational. Standard matching. |

**Affected attributes:**

| Attribute | Default | Q4=Yes (Automotive) | Q4=No |
|-----------|---------|---------------------|-------|
| `aec_q200` | identity_flag w4 | escalate_to_mandatory + blockOnMissing | unchanged |
| `operating_temp_range` | threshold superset w7 | escalate_to_mandatory −40°C to +125°C | unchanged |
| `sealing_type` | identity_flag w5 | escalate_to_primary | unchanged |


---

### 42. Solid State Relays — SSR (Family F2)

**Context sensitivity: HIGH**

Output switch type (TRIAC/SCR vs. MOSFET) is a hard categorical gate before any other evaluation — TRIAC-output SSRs latch permanently on DC loads with no turn-off mechanism, and MOSFET-output SSRs are not rated for AC current flow. Firing mode (zero-crossing vs. random-fire) is a hard gate for inrush-sensitive and proportional-control applications. Load current rating requires thermal derating at elevated ambient temperature — a 25A-rated SSR may be limited to 12A at 50°C ambient. Minimum load current is a hidden failure mode for TRIAC-output SSRs on low-current loads (LED lamps, low-power electronics) where the TRIAC holding current may not be sustained. Off-state leakage through the internal snubber network (1–10mA at mains voltage) can partially energise sensitive loads in the off state.

**Digikey:** Two subcategories cover F2: "Relays — Solid State" (PCB-mount SSRs) and "Relays — Solid State — Industrial Mount" (panel and DIN-rail SSRs). Key parametric fields present: load voltage, load current, input voltage range, output type (AC/DC), mounting, firing mode (sometimes), operating temperature. Missing from Digikey parametric: thermal resistance, on-state voltage drop, dV/dt and dI/dt ratings, minimum load current, off-state leakage, snubber and varistor presence, specific certification marks.

**23 matching rules** (total weight: ~157):

| # | Attribute | Rule Type | Weight | blockOnMissing | Key behavior |
|---|-----------|-----------|--------|----------------|--------------|
| 1 | `output_switch_type` | identity | 10 | yes | HARD GATE. TRIAC / Back-to-back SCR / MOSFET / IGBT. TRIAC/SCR = AC output only (latches on DC). MOSFET = DC output only. Cross-type BLOCKED unconditionally |
| 2 | `firing_mode` | identity | 9 | yes | HARD GATE. Zero-crossing (ZC) / Random-fire (RF). ZC waits for AC zero before switching — eliminates inrush, adds up to one half-cycle delay. RF switches immediately — enables phase control, generates inrush. Not interchangeable in inrush-sensitive or timing-critical applications |
| 3 | `mounting_type` | identity | 9 | yes | HARD GATE. PCB / DIN-rail / Panel-mount. Cross-type BLOCKED |
| 4 | `load_voltage_type` | identity_flag | 8 | no | AC / DC. Must match load supply. Escalated to mandatory when mismatch with output_switch_type detected |
| 5 | `load_voltage_max_v` | threshold gte | 10 | yes | Maximum rated load voltage. Replacement ≥ circuit load voltage. For AC: verify peak rating (Vpeak = Vrms × 1.414). BLOCKING if below |
| 6 | `load_current_max_a` | threshold gte | 10 | yes | Maximum rated load current. Replacement ≥ original. Thermal derating applies: verify derated rating at Tmax ambient ≥ load current. BLOCKING if underated |
| 7 | `load_current_min_a` | threshold lte | 6 | no | Minimum load current for reliable TRIAC latching. Escalated to mandatory for lamp and low-current loads (Q2). Replacement minimum ≤ actual load current |
| 8 | `off_state_leakage_ma` | threshold lte | 7 | no | Off-state output leakage through snubber. Escalated to mandatory for sensitive loads (Q2). Replacement leakage ≤ original |
| 9 | `input_voltage_range_v` | threshold superset | 9 | yes | Control input voltage range must contain actual control voltage. Mismatch = failure to turn on or input damage |
| 10 | `input_current_ma` | threshold lte | 7 | no | Control input current at rated voltage. Replacement ≤ original to avoid exceeding drive source current |
| 11 | `input_impedance_ohm` | threshold gte | 5 | no | Control input impedance. Lower impedance draws more current — Application Review when impedance decreases significantly |
| 12 | `turn_on_time_ms` | threshold lte | 7 | no | Time from input signal to load conduction. Escalated to mandatory for timing-critical and proportional control (Q3) |
| 13 | `turn_off_time_ms` | threshold lte | 7 | no | Time from input removal to load cessation. AC TRIAC: up to one full cycle. DC MOSFET: typically <1ms. Escalated to mandatory for timing-critical (Q3) |
| 14 | `dv_dt_rating_v_us` | threshold gte | 6 | no | Critical rate of voltage rise without spurious turn-on. Replacement ≥ original. Escalated to mandatory for harsh/industrial environments (Q4) |
| 15 | `di_dt_rating_a_us` | threshold gte | 6 | no | Critical rate of current rise at turn-on. Replacement ≥ original. Escalated to mandatory for capacitive/lamp loads (Q2) |
| 16 | `on_state_voltage_drop_v` | threshold lte | 7 | no | Output terminal voltage drop at rated current. Determines power dissipation. Replacement ≤ original to keep existing heatsink adequate. Escalated to primary for high-temp applications (Q3) |
| 17 | `thermal_resistance_jc` | threshold lte | 6 | no | Junction-to-case thermal resistance. Replacement ≤ original. Escalated to mandatory for high-temp applications (Q3) |
| 18 | `built_in_snubber` | identity_flag | 6 | no | Yes / No. Change requires external circuit modification. Application Review whenever type changes |
| 19 | `built_in_varistor` | identity_flag | 5 | no | Yes / No. Absence requires external overvoltage protection. Application Review on change. Escalated to primary for harsh environments (Q4) |
| 20 | `isolation_voltage_vrms` | threshold gte | 8 | no | Input-to-output isolation voltage. Replacement ≥ original. Never downgrade. Escalated to mandatory for safety-certified applications (Q1) |
| 21 | `safety_certification` | identity_flag | 7 | no | UL508 / IEC 62314 / VDE / CSA. Escalated to mandatory for industrial control panel applications (Q1) |
| 22 | `operating_temp_range` | threshold superset | 7 | yes | Must fully cover application range. SSR current rating derate begins at +25–40°C — verify derated current ≥ load current at Tmax |
| 23 | `package_footprint` | identity_flag | 7 | no | PCB footprint / panel cutout / DIN pitch. Escalated to mandatory for drop-in replacement. Standard industry outlines interchangeable within that standard |

**MPN enrichment** (~25 prefix patterns): Infers `output_switch_type` (D-prefix Crydom = DC MOSFET output; CMX/CX/HD = AC TRIAC; G3NA/G3NB/G3MC = AC TRIAC Omron), `firing_mode` (EZ suffix Crydom = zero-crossing; suffix Z Carlo Gavazzi = zero-crossing; suffix R = random-fire; G3NA/G3NB = zero-crossing), `load_voltage_max_v` (numeric field in MPN: D2425 → 240VAC 25A; D4825 → 480VAC 25A), `mounting_type` (panel series vs. PCB series from model prefix). Common prefixes: D24, D48, CMX, CX, HD (Crydom/Sensata); G3NA, G3NB, G3MC, G3PA (Omron); RA, RZ, RD (Carlo Gavazzi); SSM (Schneider); KSI, KSR (Kyotto); TD (TE); MGR (generic panel).

#### Question 1: What is the load supply type and isolation requirement?

| Answer | Effect on Matching |
|--------|-------------------|
| **AC mains load (120VAC or 230VAC, no specific certification required)** | Default thresholds. `output_switch_type` → TRIAC/SCR only (MOSFET BLOCKED). `load_voltage_max_v` → threshold gte at Vpeak. `isolation_voltage_vrms` → threshold gte w8 (4000Vrms min). `safety_certification` → Application Review. |
| **AC mains with safety certification required (UL508 industrial panel, IEC 62314)** | `isolation_voltage_vrms` → escalate_to_mandatory ≥ 4000Vrms + blockOnMissing. `safety_certification` → escalate_to_mandatory + blockOnMissing. Application Review: higher isolation voltage alone does not substitute for a listed certification mark. |
| **DC load (24VDC, 48VDC, or higher DC bus)** | `output_switch_type` → MOSFET only (TRIAC BLOCKED). `load_voltage_type` → escalate_to_mandatory. `firing_mode` → not applicable for DC SSRs. `load_voltage_max_v` → threshold gte at DC bus voltage. |

**Affected attributes:**

| Attribute | Default | Q1=AC Mains | Q1=AC Safety-Certified | Q1=DC Load |
|-----------|---------|-------------|------------------------|------------|
| `output_switch_type` | identity w10 | TRIAC/SCR only | TRIAC/SCR only | MOSFET only — TRIAC BLOCKED |
| `isolation_voltage_vrms` | threshold gte w8 | 4000Vrms min | escalate_to_mandatory + blockOnMissing | default |
| `safety_certification` | identity_flag w7 | Application Review | escalate_to_mandatory + blockOnMissing | App Review |
| `load_voltage_max_v` | threshold gte w10 | ≥ Vpeak | ≥ Vpeak | ≥ DC bus voltage |

#### Question 2: What type of load is being switched?

| Answer | Effect on Matching |
|--------|-------------------|
| **Resistive load (heaters, ovens — no inrush, no back-EMF)** | Default thresholds. `load_current_min_a` → Application Review. `off_state_leakage_ma` → Application Review. `dv_dt_rating_v_us` → default. |
| **Inductive load (motors, solenoids, transformers — back-EMF at switch-off)** | `dv_dt_rating_v_us` → escalate_to_primary. `load_current_max_a` → escalate_to_mandatory with 1.5× inductive derating. `built_in_snubber` → escalate_to_primary. `thermal_resistance_jc` → escalate_to_primary. Application Review: back-EMF may require external snubber. |
| **Capacitive / lamp load (LED drivers, CFL, fluorescent, capacitor banks — high inrush)** | `di_dt_rating_a_us` → escalate_to_mandatory + blockOnMissing. `firing_mode` → escalate_to_primary (zero-crossing preferred). `load_current_min_a` → escalate_to_primary. `off_state_leakage_ma` → escalate_to_primary. |
| **Low-current / sensitive load (< 1A — signals, indicators, low-power electronics)** | `off_state_leakage_ma` → escalate_to_mandatory + blockOnMissing. `load_current_min_a` → escalate_to_mandatory + blockOnMissing. Application Review: consider whether EMR (F1) is more appropriate at very low load currents. |

**Affected attributes:**

| Attribute | Default | Q2=Resistive | Q2=Inductive | Q2=Capacitive/Lamp | Q2=Low-Current |
|-----------|---------|--------------|--------------|-------------------|----------------|
| `dv_dt_rating_v_us` | threshold gte w6 | default | escalate_to_primary | default | default |
| `di_dt_rating_a_us` | threshold gte w6 | default | default | escalate_to_mandatory | default |
| `load_current_min_a` | threshold lte w6 | App Review | default | escalate_to_primary | escalate_to_mandatory |
| `off_state_leakage_ma` | threshold lte w7 | App Review | default | escalate_to_primary | escalate_to_mandatory |
| `built_in_snubber` | identity_flag w6 | default | escalate_to_primary | default | default |

#### Question 3: Is switching speed or thermal management a concern?

| Answer | Effect on Matching |
|--------|-------------------|
| **Standard / non-timing-critical (on/off control only)** | Default thresholds. `turn_on_time_ms` → Application Review. `turn_off_time_ms` → Application Review. |
| **Timing-critical / proportional control (phase-angle firing, duty-cycle accuracy)** | `turn_on_time_ms` → escalate_to_mandatory + blockOnMissing. `turn_off_time_ms` → escalate_to_mandatory + blockOnMissing. `firing_mode` → escalate_to_mandatory (random-fire required for proportional control; zero-crossing BLOCKED). |
| **High ambient temperature (>40°C ambient or enclosed panel)** | `thermal_resistance_jc` → escalate_to_mandatory + blockOnMissing. `on_state_voltage_drop_v` → escalate_to_primary. Application Review: verify derated current at Tmax ≥ load current. |

**Affected attributes:**

| Attribute | Default | Q3=Standard | Q3=Timing-Critical | Q3=High Temp |
|-----------|---------|-------------|--------------------|--------------|
| `turn_on_time_ms` | threshold lte w7 | App Review | escalate_to_mandatory + blockOnMissing | default |
| `turn_off_time_ms` | threshold lte w7 | App Review | escalate_to_mandatory + blockOnMissing | default |
| `firing_mode` | identity w9 | default | escalate_to_mandatory (RF for proportional) | default |
| `thermal_resistance_jc` | threshold lte w6 | default | default | escalate_to_mandatory + blockOnMissing |
| `on_state_voltage_drop_v` | threshold lte w7 | default | default | escalate_to_primary |

#### Question 4: Is there an overvoltage or transient protection requirement?

| Answer | Effect on Matching |
|--------|-------------------|
| **Standard environment (normal mains transients)** | Default thresholds. `built_in_varistor` → Application Review. `built_in_snubber` → default identity_flag. |
| **Industrial / harsh environment (significant transients, motor back-EMF, lightning coupling)** | `built_in_varistor` → escalate_to_primary. `built_in_snubber` → escalate_to_primary. `dv_dt_rating_v_us` → escalate_to_mandatory. `isolation_voltage_vrms` → escalate_to_primary. Application Review: if replacement lacks built-in varistor and original had one, external TVS/MOV required on load terminals. |

**Affected attributes:**

| Attribute | Default | Q4=Standard | Q4=Industrial/Harsh |
|-----------|---------|-------------|---------------------|
| `built_in_varistor` | identity_flag w5 | App Review | escalate_to_primary |
| `built_in_snubber` | identity_flag w6 | default | escalate_to_primary |
| `dv_dt_rating_v_us` | threshold gte w6 | default | escalate_to_mandatory |
| `isolation_voltage_vrms` | threshold gte w8 | default | escalate_to_primary |


## Summary: Application Context Questions by Family

This table shows which questions to ask and in what order. The chat engine should ask ONLY the questions relevant to the resolved family.

| Family | ID | Q1 (Always Ask) | Q2 (Conditional) | Q3 (Conditional) | Q4 (Conditional) |
|--------|----|-----------------|-------------------|-------------------|-------------------|
| **— BLOCK A: PASSIVES —** | | | | | |
| **Thermistors** | 67/68 | Function? (sensing / inrush / compensation / protection / heater) | If sensing: Accuracy needed? | If sensing: R-T curve in firmware? | — |
| **CM Chokes** | 69 | Signal-line or power-line? | If signal: Which interface? | If power: Mains-connected? | — |
| **Ferrite Beads** | 70 | Power rail or signal line? | Operating DC current? | If signal: Signal frequency? | — |
| **Film Caps** | 64 | Application? (EMI / DC / snubber / motor-run / precision) | If EMI: Safety class? | If snubber: dV/dt requirement? | — |
| **MLCCs** | 12 | Operating voltage vs. rated? | Flex/flex-rigid PCB? | Audio/analog signal path? | Environment? |
| **Tantalums** | 59 | Safety-critical failure mode? | Voltage derating practice? | Inrush/surge protection? | — |
| **RF/Signal Inductors** | 72 | Operating frequency? | Q factor requirement? | Shielding required? | — |
| **Current Sense Resistors** | 54 | Kelvin (4-terminal) sensing? | Measurement precision? | Switching frequency? | — |
| **Varistors / MOVs** | 65 | Application type? (mains / DC / ESD) | If mains: Thermal disconnect? | Automotive? | — |
| **PTC Resettable Fuses** | 66 | Maximum circuit voltage? | Ambient temperature? | Frequent trip/reset cycles? | — |
| **Power Inductors** | 71 | Circuit type? (switcher / linear / EMI) | Operating DC current? | Shielding required? | — |
| **Al Electrolytics** | 58 | Ripple frequency? | Ambient temperature? | Polarized or non-polarized? | — |
| **Supercapacitors** | 61 | Function? (backup / pulse / harvesting) | Cold-start required? | — | — |
| **Chassis Mount Resistors** | 55 | Thermal setup? (heatsink / chassis / free-standing) | Forced airflow? | Precision? Environment? | — |
| **Al Polymer Caps** | 60 | Ripple frequency? | ESR primary criterion? | — | — |
| **Chip Resistors** | 52 | Precision application? | Harsh environment? | — | — |
| **Through-Hole Resistors** | 53 | Precision application? | Harsh environment? | — | — |
| **Mica Capacitors** | 13 | Environment? | — | — | — |
| | | | | | |
| **— BLOCK B: DISCRETE SEMICONDUCTORS —** | | | | | |
| **MOSFETs** | B5 | Operating mode? (switching / linear) | If switching: Frequency range? | If switching: Hard or soft switching? | Body diode conduction? Automotive? |
| **BJTs** | B6 | Operating mode? (switching / linear / class AB pair) | If switching: Frequency? | Complementary pair? | Automotive? |
| **IGBTs** | B7 | Switching frequency? (<20kHz / 20–50kHz / 50–100kHz / >100kHz) | Hard or soft switching? | Parallel operation? | Short-circuit protection required? Automotive? |
| **Thyristors / TRIACs / SCRs** | B8 | Device sub-type? (SCR / TRIAC / DIAC) | Application type? (phase control / zero-cross / crowbar / motor soft-start) | If TRIAC: Q4 operation required? | Snubber present? Automotive? |
| **Rectifier Diodes** | B1 | Switching frequency? (50/60Hz / low-freq / SMPS / >500kHz) | Circuit topology? (rectifier / freewheeling / OR-ing / polarity protection / multiplier) | Low-voltage application? | Automotive? |
| **Schottky Diodes** | B2 | Low-voltage application (≤12V)? | Operating/ambient temperature? | Si or SiC? | Parallel operation? Automotive? |
| **Zener Diodes** | B3 | Function? (clamping / reference / ESD protection / level shifting) | If reference: Precision needed? | If ESD/signal: Signal speed? | Automotive? |
| **TVS Diodes** | B4 | Power rail or signal line? | Transient source / surge standard? | If signal: Interface speed? | Automotive? |
| **JFETs** | B9 | Application mode? (low-noise amp / ultra-high-Z / RF / analog switch / legacy switching) | Matched-pair? | Automotive? |
| | | | | | |
| **— BLOCK C: STANDARD ICs —** | | | | | |
| **Linear Voltage Regulators (LDOs)** | C1 | Output type? (fixed / adjustable / negative) | Output capacitor type? (ceramic vs. tantalum — BLOCKING) | Battery-powered? | Upstream switcher? Feature pins used? Automotive? |
| **Switching Regulators** | C2 | Topology? (buck/boost/buck-boost/flyback) | Integrated switch or controller-only? | Control mode? (PCM/VM/COT) | Switching frequency match? Vref match with existing feedback resistors? Feature pins? Automotive? |
| **Gate Drivers** | C3 | Driver configuration? (single/dual/half-bridge/full-bridge) | Isolation required? | Input logic voltage? | Power device type / Qg? Feature pins (SD/FAULT/Rdt)? Automotive? |
| **Op-Amps / Comparators** | C4 | Op-amp or comparator application? (closed-loop / open-loop — BLOCKING) | Input stage type needed? (bipolar / JFET / CMOS) | Single-supply or dual-supply? | Precision / noise-critical application? Automotive? |
| **Logic ICs (74-Series)** | C5 | What is driving this device's inputs? (TTL / CMOS-5V / CMOS-3.3V — BLOCKING for HC/HCT selection) | Supply voltage? (5V / 3.3V / mixed — BLOCKING for 5V-tolerance) | Output type required? (totem-pole / open-drain / 3-state) | Automotive? |
| **Voltage References** | C6 | Series or shunt configuration? (BLOCKING) | Output voltage required? | Precision level? (16-bit / 12-16-bit / general purpose) | Automotive? |
| **Interface ICs (RS-485, CAN, I2C, USB)** | C7 | What is the protocol? (RS-485/CAN/I2C/USB — BLOCKING) | Isolation required? | Industrial / Automotive / Consumer environment? | Automotive? (AEC-Q100 — BLOCKING) |
| **Timers and Oscillators** | C8 | Device category? (555 timer / XO / MEMS / TCXO / VCXO / OCXO — BLOCKING) | Frequency accuracy / stability requirement? (comms / precision / SerDes / general) | Battery-powered / power-constrained? | Automotive? (AEC-Q100 — BLOCKING) |
| **ADCs (Analog-to-Digital Converters)** | C9 | ADC architecture? (SAR / Delta-Sigma / Pipeline / Flash — BLOCKING) | Resolution / precision class? (≤12-bit / 12–16-bit / 16–24-bit) | Sampling topology / application type? (simultaneous / multiplexed / control loop / battery) | Automotive? (AEC-Q100 — BLOCKING) |
| **DACs (Digital-to-Analog Converters)** | C10 | DAC output type? (Voltage / Current — BLOCKING) | Resolution / precision class? (≤12-bit / 12–16-bit / 16–20-bit) | Application type? (audio / precision DC / industrial / battery) | Automotive? (AEC-Q100 — BLOCKING) |
| **— BLOCK D: FREQUENCY COMPONENTS —** | | | | | |
| **Crystals (Quartz Resonators)** | D1 | Application / accuracy requirement? (consumer / comms / precision / RTC) | VCXO circuit? (voltage-controlled pulling) | Extended temp / automotive? (AEC-Q200 — BLOCKING) | — |
| **Fuses (Traditional Overcurrent Protection)** | D2 | Supply type and voltage level? (AC mains / low-voltage DC / high-voltage DC) | What is the fuse protecting? (semiconductor / motor-inductive / general wiring) | Automotive? (AEC-Q200 — BLOCKING) | — |
| | | | | | |
| **— BLOCK E: OPTOELECTRONICS —** | | | | | |
| **Optocouplers / Photocouplers** | E1 | Isolation class / application type? (functional / basic / reinforced / safety-rated mains) | Bandwidth / speed requirement? (slow-DC / PWM-control / high-speed digital / analog) | CTR precision? (standard min only / precision bounded range / long-life high-reliability) | Automotive? (AEC-Q101 — BLOCKING) |
| | | | | | |
| **— BLOCK F: SWITCHING & ELECTROMECHANICAL —** | | | | | |
| **Electromechanical Relays (EMR)** | F1 | Load type? (resistive / inductive / motor / dry-circuit signal) | Coil driver circuit? (dedicated driver / GPIO direct / battery low-power) | High-cycle or timing-critical? (standard / >1M ops / operate+release time matters) | Automotive? (AEC-Q200 — BLOCKING) |
| **Solid State Relays (SSR)** | F2 | Load supply type and isolation? (AC mains / AC safety-certified / DC load) | Load type? (resistive / inductive / capacitive-lamp / low-current sensitive) | Switching speed or thermal concern? (standard / timing-critical proportional / high ambient temp) | Transient protection? (standard / industrial-harsh environment) |

---

## Implementation Guidance

### Encoding in the System

Each question should be encoded as a structured template linked to the family's logic table:

```typescript
interface ContextQuestion {
  familyIds: number[];           // which families this applies to
  questionId: string;            // unique key
  questionText: string;          // what the LLM asks the user
  options: ContextOption[];      // valid answers
  condition?: string;            // only ask if a previous answer matches
  priority: number;              // ask order (1 = always first)
}

interface ContextOption {
  value: string;                 // stored in ApplicationContext
  label: string;                 // display text
  attributeEffects: AttributeEffect[];  // what this answer changes
}

interface AttributeEffect {
  attributeName: string;
  effect: "escalate_to_mandatory"    // flag → hard gate
        | "escalate_to_primary"      // secondary → primary concern
        | "set_threshold"            // change threshold value
        | "not_applicable"           // remove from evaluation
        | "add_review_flag";         // add Application Review note
  note?: string;                     // engineering context for the LLM
}
```

### The LLM Does Not Invent Questions

The orchestrator LLM reads the `ContextQuestion` templates for the resolved family and asks them in order. It may rephrase for natural conversation flow, but it does NOT add questions that aren't in the templates. The engineering team (you) decides what context matters — not the LLM.

### Answers Feed Back Into the Matching Engine

The user's answers populate the `ApplicationContext` object, which is passed to the matching engine. The matching engine uses the context to:
1. Activate or deactivate rules (e.g., safety rating rule only activates for mains-connected applications)
2. Tighten thresholds (e.g., precision sensing tightens tolerance thresholds)
3. Escalate Application Review attributes to effective hard gates (e.g., failure mode for safety-critical tantalum applications)
4. Add flag notes to the assessment (e.g., "Verify impedance at 300mA operating current using manufacturer's DC bias curve")

### Variant Families Inherit and Modify

For variant families (53, 54, 55, 60, 13, 72) that inherit from a base table:
- Start with the base family's context questions
- Apply any overrides or additions from the variant's section in this document
- Remove any questions that are explicitly marked as not applicable for the variant
- The delta document (`passive_variants_delta.docx`) defines the attribute-level changes; this document defines the context-question-level changes

### Blocking Questions

Some questions are so critical that the matching engine should NOT return results if they go unanswered:
- **PTC Resettable Fuses:** "What is the maximum circuit voltage?" — Vmax violations cause fire risk
- **Varistors (mains):** "Does the original have a thermal disconnect?" — fire safety
- **Thermistors:** "What is this thermistor's function?" — wrong category = completely wrong matching

Implement these as `required: true` on the ContextQuestion, and have the orchestrator refuse to proceed until the user answers.
