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
| 26 | Mica Capacitors | 13 | **Low** | Precision is assumed (that's why mica was chosen); minimal context needed |

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

### 5. MOSFETs — N-Channel and P-Channel (Family B5)

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

---

### 6. BJTs — NPN and PNP (Family B6)

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

---

### 7. IGBTs — Insulated Gate Bipolar Transistors (Family B7)

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

---

### 8. Thyristors / TRIACs / SCRs (Family B8)

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

### 9. MLCC Capacitors (Family 12)

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

### 10. Tantalum Capacitors (Family 59)

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

### 11. RF / Signal Inductors (Family 72)

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

### 12. Current Sense Resistors (Family 54)

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

### 13. Varistors / MOVs (Family 65)

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

### 14. PTC Resettable Fuses (Family 66)

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

### 15. Power Inductors (Family 71)

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

### 16. Aluminum Electrolytic Capacitors (Family 58)

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

### 17. Supercapacitors / EDLCs (Family 61)

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

### 18. Chassis Mount / High Power Resistors (Family 55)

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

### 19. Aluminum Polymer Capacitors (Family 60)

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

### 20. Chip Resistors (Family 52)

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

### 21. Through-Hole Resistors (Family 53)

**Context sensitivity: LOW**

Inherits all context from Chip Resistors (Family 52). No additional application context questions — lead spacing and body dimensions are physical constraints determined by the original part, not by the application.

#### Questions: Same as Chip Resistors (Family 52)

1. Precision / instrumentation application?
2. Harsh / industrial / automotive environment?

No additional questions. The delta attributes (lead spacing, mounting style, body dimensions) are resolved from the original part's physical specifications, not from application context.

---

### 22. Mica Capacitors (Family 13)

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

## Summary: Application Context Questions by Family

This table shows which questions to ask and in what order. The chat engine should ask ONLY the questions relevant to the resolved family.

| Family | ID | Q1 (Always Ask) | Q2 (Conditional) | Q3 (Conditional) | Q4 (Conditional) |
|--------|----|-----------------|-------------------|-------------------|-------------------|
| **Thermistors** | 67/68 | Function? (sensing / inrush / compensation / protection / heater) | If sensing: Accuracy needed? | If sensing: R-T curve in firmware? | — |
| **CM Chokes** | 69 | Signal-line or power-line? | If signal: Which interface? | If power: Mains-connected? | — |
| **Ferrite Beads** | 70 | Power rail or signal line? | Operating DC current? | If signal: Signal frequency? | — |
| **Film Caps** | 64 | Application? (EMI / DC / snubber / motor-run / precision) | If EMI: Safety class? | If snubber: dV/dt requirement? | — |
| **MOSFETs** | B5 | Operating mode? (switching / linear) | If switching: Frequency range? | If switching: Hard or soft switching? | Body diode conduction? Automotive? |
| **BJTs** | B6 | Operating mode? (switching / linear / class AB pair) | If switching: Frequency? | Complementary pair? | Automotive? |
| **IGBTs** | B7 | Switching frequency? (<20kHz / 20–50kHz / 50–100kHz / >100kHz) | Hard or soft switching? | Parallel operation? | Short-circuit protection required? Automotive? |
| **Thyristors / TRIACs / SCRs** | B8 | Device sub-type? (SCR / TRIAC / DIAC) | Application type? (phase control / zero-cross / crowbar / motor soft-start) | If TRIAC: Q4 operation required? | Snubber present? Automotive? |
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
| **Schottky Diodes** | B2 | Low-voltage application (≤12V)? | Operating/ambient temperature? | Si or SiC? | Parallel operation? Automotive? |
| **Zener Diodes** | B3 | Function? (clamping / reference / ESD protection / level shifting) | If reference: Precision needed? | If ESD/signal: Signal speed? | Automotive? |
| **TVS Diodes** | B4 | Power rail or signal line? | Transient source / surge standard? | If signal: Interface speed? | Automotive? |

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
