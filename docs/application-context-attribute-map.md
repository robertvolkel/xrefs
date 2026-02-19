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
| 5 | MLCCs | 12 | **High** | DC bias derating, flex PCB, audio/piezoelectric noise all require context |
| 6 | Tantalum Capacitors | 59 | **High** | Failure mode safety implications, voltage derating practice, inrush conditions |
| 7 | RF / Signal Inductors | 72 | **High** | Operating frequency and Q requirements replace the switcher concerns from power inductors; core material priority inverts |
| 8 | Rectifier Diodes | B1 | **High** | Switching frequency determines whether trr or Vf dominates; circuit topology changes which specs are primary; low-voltage apps make Vf critical |
| 9 | Current Sense Resistors | 54 | **Moderate-High** | Kelvin sensing, precision class, and switching frequency change matching priorities significantly |
| 10 | Power Inductors | 71 | **Moderate-High** | Converter topology affects saturation behavior requirements; actual current determines derating |
| 11 | Varistors / MOVs | 65 | **Moderate-High** | Mains vs. DC changes safety requirements entirely; transient source type shifts energy vs. response time priority |
| 12 | PTC Resettable Fuses | 66 | **Moderate-High** | Circuit voltage is a hard safety question; ambient temperature causes severe hold current derating |
| 13 | Aluminum Electrolytics | 58 | **Moderate** | Switching frequency affects ripple current; actual temp determines lifetime |
| 14 | Supercapacitors / EDLCs | 61 | **Moderate** | Backup vs. pulse buffering changes priorities; cold-start needs require ESR context |
| 15 | Chassis Mount Resistors | 55 | **Moderate** | Thermal setup (heatsink type, airflow) directly determines effective power rating |
| 16 | Aluminum Polymer Caps | 60 | **Low-Moderate** | Inherits aluminum electrolytic context minus lifetime concerns; ripple frequency still matters |
| 17 | Chip Resistors | 52 | **Low** | Mostly parametric — only harsh environment and precision applications need context |
| 18 | Through-Hole Resistors | 53 | **Low** | Inherits chip resistor context; lead spacing is physical, not application-dependent |
| 19 | Mica Capacitors | 13 | **Low** | Precision is assumed (that's why mica was chosen); minimal context needed |

---

## Family-by-Family Breakdown

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

### 19. Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (Family B1)

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

## Summary: Application Context Questions by Family

This table shows which questions to ask and in what order. The chat engine should ask ONLY the questions relevant to the resolved family.

| Family | ID | Q1 (Always Ask) | Q2 (Conditional) | Q3 (Conditional) | Q4 (Conditional) |
|--------|----|-----------------|-------------------|-------------------|-------------------|
| **Thermistors** | 67/68 | Function? (sensing / inrush / compensation / protection / heater) | If sensing: Accuracy needed? | If sensing: R-T curve in firmware? | — |
| **CM Chokes** | 69 | Signal-line or power-line? | If signal: Which interface? | If power: Mains-connected? | — |
| **Ferrite Beads** | 70 | Power rail or signal line? | Operating DC current? | If signal: Signal frequency? | — |
| **Film Caps** | 64 | Application? (EMI / DC / snubber / motor-run / precision) | If EMI: Safety class? | If snubber: dV/dt requirement? | — |
| **MLCCs** | 12 | Operating voltage vs. rated? | Flex/flex-rigid PCB? | Audio/analog signal path? | Environment? |
| **Tantalums** | 59 | Safety-critical failure mode? | Voltage derating practice? | Inrush/surge protection? | — |
| **RF/Signal Inductors** | 72 | Operating frequency? | Q factor requirement? | Shielding required? | — |
| **Current Sense Resistors** | 54 | Kelvin (4-terminal) sensing? | Measurement precision? | Switching frequency? | — |
| **Power Inductors** | 71 | Circuit type? (switcher / linear / EMI) | Operating DC current? | Shielding required? | — |
| **Varistors / MOVs** | 65 | Application type? (mains / DC / ESD) | If mains: Thermal disconnect? | Automotive? | — |
| **PTC Resettable Fuses** | 66 | Maximum circuit voltage? | Ambient temperature? | Frequent trip/reset cycles? | — |
| **Al Electrolytics** | 58 | Ripple frequency? | Ambient temperature? | Polarized or non-polarized? | — |
| **Supercapacitors** | 61 | Function? (backup / pulse / harvesting) | Cold-start required? | — | — |
| **Chassis Mount Resistors** | 55 | Thermal setup? (heatsink / chassis / free-standing) | Forced airflow? | Precision? Environment? | — |
| **Al Polymer Caps** | 60 | Ripple frequency? | ESR primary criterion? | — | — |
| **Chip Resistors** | 52 | Precision application? | Harsh environment? | — | — |
| **Through-Hole Resistors** | 53 | Precision application? | Harsh environment? | — | — |
| **Mica Capacitors** | 13 | Environment? | — | — | — |
| | | | | | |
| **— BLOCK B: DISCRETE SEMICONDUCTORS —** | | | | | |
| **Rectifier Diodes** | B1 | Switching frequency? (50/60Hz / low-freq / SMPS / >500kHz) | Circuit topology? (rectifier / freewheeling / OR-ing / polarity protection / multiplier) | Low-voltage application? | Automotive? |

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
