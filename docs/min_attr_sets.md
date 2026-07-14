# Selection Questions — what the agent asks, per family

<!-- MANAGED FILE. This file is the SOURCE OF TRUTH for the agent's selection questions.
     `npm run selection:audit` regenerates the spec names, ids and weights from the live logic
     tables and PRESERVES the State/Reason columns. `npm run selection:check` fails the build if
     any scored rule is missing a state. Edit State/Reason here — never in the admin UI, which is
     read-only by design (two writable surfaces is the exact bug this file exists to fix). -->

## How to run this review

Attach this whole file to Claude. Claude will not accept an attachment with an empty message
box, so paste this one line as the message — everything it needs is already in the file:

> Read the review prompt at the top of the attached file and carry out the review it describes.
> Return the complete corrected file in the identical format.

---

## Review prompt

You are reviewing which component specifications an electronics sourcing agent asks a user
about when they are choosing a part by description (rather than by part number).

Every spec below is scored by the app's matching engine today. For each one, decide which of
**three states** it belongs in, and put that exact wording in the **State** column:

| State | When the agent asks | Consequence of getting it wrong |
|---|---|---|
| `Required for Search` | **Always** — asked before any search runs, and it blocks the search. | Over-marking is the failure mode. Every extra spec here is another question the user must answer before seeing a single part. Mark 4–6 per family, not 20. |
| `Narrows Results` | **Only when the result set is too large to be useful** (roughly 20+ candidates). Optional; the user can skip. | This is where a spec goes when it genuinely helps pick between candidates but is not needed to run a sane search at all. |
| `Not Asked` | Never asked. | This is where silent holes hid. Choosing this is fine — but choose it *deliberately*. |

### Rules for the review

1. **Judge ANSWERABILITY, not just importance.** Weight is shown as *information*, never as the
   verdict. A user can state an input voltage; a user cannot state a thermal resistance or a
   storage temperature. A high weight on a spec the user cannot possibly know is still `Not Asked`.
2. **`Required for Search` must stay small.** It is asked every single time. A family with 20
   required specs interrogates the user for twenty turns before showing a part. That is a failure
   this product has already shipped once.
3. **The ORDER of the `Required for Search` rows IS the order the agent asks them.** Put the
   architecture-defining question first (for a regulator: fixed vs adjustable, before the voltage).
4. **NEVER invent an attribute id.** Use only the ids already in this file. A new id fails the
   build; it should not be produced in the first place.
5. **A `Reason` is optional** — most useful on a *surprising* skip, i.e. an important-looking spec
   you are deliberately leaving unasked. Rows marked ⚠️ NEEDS REVIEW are ones no human has ruled on yet.
6. **Return the file in the identical format**, so it re-ingests and validates.

Pay particular attention to the **cross-family contradictions** listed below: the same spec asked
in one family and silently skipped in another that also scores it. At least one of those two
decisions is wrong.

> **Status note — for whoever is running this review, not for the reviewer.**
> `Required for Search` decisions take effect as soon as the corrected file is applied and
> `npm run selection:audit` is run. `Narrows Results` decisions are **recorded but not yet acted
> on**: the step that asks a narrowing question when a search returns too many candidates has not
> been built, so today the agent asks *no* `Narrows Results` spec in any family. (That gap is the
> reason a search for a small-signal NPN stopped surfacing the obvious BC847 — gain is filed as a
> narrowing spec and was never asked.) The review is still worth doing now; those decisions land
> the moment that step ships.

---

## Review items — cross-family contradictions

The same spec is **asked** in one family and **not asked** in another that also scores it.

**0 need a decision** — the family that skips the spec records no reason, so nobody
has actually ruled on it. Those are listed first, marked **⚠**.

The other **33** are **deliberate divergences**: the skip carries a
reason, so the two families genuinely differ (a through-hole resistor really does key off lead spacing
rather than package size). They are listed for transparency, not as work. Read the Reason column in the
family table before changing one.

| | Spec | id | Max weight | Asked in | Not asked in |
|---|---|---|---|---|---|
|  | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | `architecture` | 10 | C2, C9, C10 | C6 |
|  | Channel Type (N-Channel / P-Channel) | `channel_type` | 10 | B5, B9 | B7 |
|  | Output Polarity (Positive / Negative / Isolated) | `output_polarity` | 10 | C3 | C2 |
|  | Output Type (Fixed / Adjustable / Tracking / Negative) | `output_type` | 10 | C1, C4, C10 | C5 |
|  | Package / Case | `package_case` | 10 | 35 families | 53 |
|  | Vces Max (Collector-Emitter Voltage, shorted base) | `vces_max` | 10 | B7 | B6 |
|  | ESR | `esr` | 9 | 58, 59, 60, 61 | 12, 13, 64 |
|  | Mounting Style | `mounting_style` | 9 | 53, 55 | B1, B2, B3, B4, B5, B7 |
|  | Mounting Type | `mounting_type` | 9 | 58, 60, F1, F2 | D1, D2 |
|  | Power Dissipation (Pd) | `pd` | 9 | B3 | B1, B2, B4, B5, B6, B7 |
|  | Ripple Current | `ripple_current` | 9 | 58, 59, 60 | 64 |
|  | Saturation Current (Isat) | `saturation_current` | 9 | 71 | 72 |
|  | Tolerance | `tolerance` | 9 | 9 families | 58, 59, 61, 70, 72 |
|  | Forward Voltage Drop (Vf) | `vf` | 9 | B1, B2 | B3 |
|  | Voltage Rating | `voltage_rated` | 9 | 10 families | 54, 70 |
|  | Junction Capacitance (Cj) | `cj` | 8 | B4 | B1, B2, B3 |
|  | Operating Temp Range | `operating_temp` | 8 | 16 families | 12, 52, 53, 54, 55, 68, 70, B1, B2, B3, B4 |
|  | Total Gate Charge (Qg) | `qg` | 8 | B5 | B7 |
|  | Shielding | `shielding` | 8 | 71 | 72 |
|  | Self-Resonant Frequency (SRF) | `srf` | 8 | 72 | 71 |
|  | Temperature Coefficient (TC / αVz) | `tc` | 8 | C6 | B3 |
|  | Anti-Sulfur | `anti_sulfur` | 7 | 52, 54 | 53, 55 |
|  | Capacitor Type / Series | `capacitor_type` | 7 | 59 | 58, 60 |
|  | DC Bias Derating | `dc_bias_derating` | 7 | 12 | 59 |
|  | dV/dt Rating | `dv_dt` | 7 | 64 | B8 |
|  | Transition Frequency (ft) | `ft` | 7 | B6 | B9 |
|  | Reverse Leakage Current (Ir) | `ir_leakage` | 7 | B2 | B1, B3, B4 |
|  | Minimum Input Voltage (Vin Min / Dropout) | `vin_min` | 7 | C2 | C1 |
|  | Height (Seated Max) | `height` | 6 | 58, 59, 60, 64, 71 | 12, 13, 52, 53, 54, 55, 61, 66, 67, 68, 69, 70, 72, B1, B2, B3, B4, B5, B7 |
|  | Leakage Current | `leakage_current` | 6 | 61 | 58, 59, 60, 65 |
|  | PSRR (Power Supply Rejection Ratio) | `psrr` | 6 | C1 | C4 |
|  | R25 Tolerance | `r25_tolerance` | 6 | 67 | 68 |
|  | Core Material | `core_material` | 5 | 72 | 71 |

---

## Review items — specs we ASK you for, then IGNORE

These specs are scored by a rule type that **cannot compare two parts** — it hands every
candidate an identical half-mark, whatever you told us. So the agent asks the question and
then throws the answer away. Either the rule type is wrong, or we should not be asking.

| Family | Spec | id | Weight | Scored as |
|---|---|---|---|---|
| B6 | DC Current Gain (hFE) | `hfe` | 8 | `application_review` |
| 12 | DC Bias Derating | `dc_bias_derating` | 7 | `application_review` |
| C5 | Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | `logic_family` | 7 | `application_review` |
| B5 | Gate Threshold Voltage (Vgs(th)) | `vgs_th` | 6 | `application_review` |
| C1 | PSRR (Power Supply Rejection Ratio) | `psrr` | 6 | `application_review` |
| 54 | Inductance (Parasitic) | `parasitic_inductance` | 5 | `application_review` |

---

## Review items — the same spec, compared differently in different families

17 specs are compared differently depending on the family. At least one
side of each is likely wrong — but **not all of them are bugs**: a mica capacitor's dielectric
genuinely has no better/worse ranking the way an MLCC's does, so an exact match there is
correct. Judge each on its merits. Rows marked **⚠** are the sharp case: a family that asks
you for the spec and then scores it with a rule that cannot compare anything.

| | Spec | id | How it is compared |
|---|---|---|---|
| ⚠ | PSRR (Power Supply Rejection Ratio) | `psrr` | `application_review` (C1) · `threshold` (C4) |
|  | Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | `rth_ja` | `threshold` (B1, B2, B3, B4, C1, C2, C3) · `application_review` (B5) |
|  | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | `architecture` | `identity` (C2, C6, C9) · `identity_flag` (C10) |
|  | Output Type (Fixed / Adjustable / Tracking / Negative) | `output_type` | `identity` (C1, C4, C10) · `identity_flag` (C5) |
|  | Number of Channels | `channel_count` | `threshold` (C9, C10) · `identity` (E1) |
|  | Junction Capacitance (Cj) | `cj` | `application_review` (B1, B3) · `threshold` (B2, B4) |
|  | Forward Voltage Drop (Vf) | `vf` | `threshold` (B1, B2) · `application_review` (B3) |
|  | Core Material | `core_material` | `identity_upgrade` (71) · `identity` (72) |
|  | Dielectric / Temperature Characteristic | `dielectric` | `identity_upgrade` (12) · `identity` (13) |
|  | Hold Current (Ihold) | `hold_current` | `identity` (66) · `threshold` (68) |
|  | Isolation Type (Non-Isolated Bootstrap / Transformer / Optocoupler / Digital Isolator) | `isolation_type` | `identity` (C3) · `identity_flag` (C7) |
|  | Output Polarity (Positive / Negative / Isolated) | `output_polarity` | `identity` (C2) · `identity_flag` (C3) |
|  | Package / Case | `package_type` | `identity_flag` (D1) · `identity` (E1) |
|  | Shielding | `shielding` | `identity_upgrade` (71) · `application_review` (72) |
|  | Technology / Chemistry | `technology` | `identity_upgrade` (61) · `identity_flag` (B5) |
|  | Thermal Shutdown | `thermal_shutdown` | `identity_flag` (C1) · `threshold` (C2) |
|  | Trip Current (Itrip) | `trip_current` | `threshold` (66) · `identity` (68) |

---

## Families

### 12 — Ceramic Capacitors – MLCC (Surface Mount)

Currently asks **8 of 14** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Dielectric / Temperature Characteristic | `dielectric` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Flexible Termination | `flexible_termination` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| DC Bias Derating | `dc_bias_derating` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 8 | Not Asked | Encoded by dielectric class (e.g., X7R = -55 to +125C) |
| Height (Seated Max) | `height` | 6 | Not Asked | Tracks EIA case size |
| ESR | `esr` | 5 | Not Asked | Class ceramics are selected by dielectric class, not ESR |
| ESL | `esl` | 5 | Not Asked | Not user-answerable; tracks case size |
| Moisture Sensitivity Level | `msl` | 4 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 13 — Mica Capacitors (Silver Mica)

Currently asks **8 of 13** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Dielectric Material | `dielectric` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Temperature Coefficient | `temperature_coefficient` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Height (Seated Max) | `height` | 6 | Not Asked | Tracks package |
| ESR | `esr` | 5 | Not Asked | Not a mica selection criterion users state |
| ESL | `esl` | 5 | Not Asked | Not user-answerable |
| Moisture Sensitivity Level | `msl` | 4 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 52 — Chip Resistors (Surface Mount)

Currently asks **9 of 13** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Power Rating | `power_rating` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Temperature Coefficient (TCR) | `tcr` | 6 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Anti-Sulfur | `anti_sulfur` | 7 | Narrows Results |  |
| Composition / Technology | `composition` | 5 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | Near-uniform (-55 to +155C) across chip resistors |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks case size |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 53 — Through-Hole Resistors

Currently asks **10 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Mounting Style | `mounting_style` | 9 | Required for Search |  |
| Lead Spacing / Pitch | `lead_spacing` | 7 | Required for Search |  |
| Power Rating | `power_rating` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Composition / Technology | `composition` | 5 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Temperature Coefficient (TCR) | `tcr` | 6 | Narrows Results |  |
| Body Length × Diameter | `body_dimensions` | 5 | Narrows Results |  |
| Package / Case | `package_case` | 10 | Not Asked | Axial THT parts have no standard case code; fit is captured by mounting_style + lead_spacing + body_dimensions |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | Near-uniform across THT resistors |
| Anti-Sulfur | `anti_sulfur` | 7 | Not Asked | Sulfur failure mode is specific to SMD thick-film terminations |
| Height (Seated Max) | `height` | 5 | Not Asked | Captured by body_dimensions |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | MSL applies to reflow-mounted SMD parts |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 54 — Current Sense Resistors

Currently asks **11 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Power Rating | `power_rating` | 9 | Required for Search |  |
| Kelvin (4-Terminal) Sensing | `kelvin_sensing` | 8 | Required for Search |  |
| Tolerance | `tolerance` | 9 | Narrows Results |  |
| Temperature Coefficient (TCR) | `tcr` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Anti-Sulfur | `anti_sulfur` | 7 | Narrows Results |  |
| Power Rating (Pulse) | `power_rating_pulse` | 7 | Narrows Results |  |
| Composition / Technology | `composition` | 5 | Narrows Results |  |
| Inductance (Parasitic) | `parasitic_inductance` | 5 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 8 | Not Asked | Milliohm-class parts; voltage rating never binds |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | Near-uniform across current-sense resistors |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks case size |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 55 — Chassis Mount / High Power Resistors

Currently asks **11 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Power Rating | `power_rating` | 10 | Required for Search |  |
| Mounting Style | `mounting_style` | 9 | Required for Search |  |
| Heatsink Interface Dimensions | `heatsink_dimensions` | 8 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Thermal Resistance (°C/W) | `thermal_resistance` | 7 | Narrows Results |  |
| Package / Case | `package_case` | 10 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Temperature Coefficient (TCR) | `tcr` | 6 | Narrows Results |  |
| Composition / Technology | `composition` | 5 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | Near-uniform for chassis-mount parts |
| Anti-Sulfur | `anti_sulfur` | 7 | Not Asked | Wirewound/chassis construction is not the sulfur failure mode |
| Height (Seated Max) | `height` | 5 | Not Asked | Captured by heatsink_dimensions/package |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | Chassis-mount; MSL not applicable |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 58 — Aluminum Electrolytic Capacitors

Currently asks **12 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Polarization | `polarization` | 9 | Required for Search |  |
| Mounting Type | `mounting_type` | 9 | Required for Search |  |
| Diameter | `diameter` | 6 | Required for Search |  |
| Lead Spacing | `lead_spacing` | 7 | Required for Search |  |
| ESR | `esr` | 7 | Narrows Results |  |
| Ripple Current | `ripple_current` | 8 | Narrows Results |  |
| Lifetime / Endurance | `lifetime` | 7 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Height | `height` | 6 | Narrows Results |  |
| Tolerance | `tolerance` | 5 | Not Asked | +/-20% is the de-facto standard for electrolytics; rarely differentiating |
| Impedance | `impedance` | 5 | Not Asked | ESR is the asked proxy |
| Leakage Current | `leakage_current` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Capacitor Type / Series | `capacitor_type` | 4 | Not Asked | Manufacturer series is not a cross-vendor attribute |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 59 — Tantalum Capacitors

Currently asks **10 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Package / Case (EIA) | `package_case` | 10 | Required for Search |  |
| Capacitor Type | `capacitor_type` | 7 | Required for Search |  |
| ESR | `esr` | 7 | Narrows Results |  |
| Failure Mode (Benign) | `failure_mode` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Ripple Current | `ripple_current` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Height (Seated Max) | `height` | 5 | Narrows Results |  |
| Tolerance | `tolerance` | 6 | Not Asked | +/-10/20% standard; rarely differentiating |
| Surge / Inrush Voltage | `surge_voltage` | 6 | Not Asked | Handled by voltage-derating guidance, not a question |
| DC Bias Derating | `dc_bias_derating` | 6 | Not Asked | Bias derating is a class-II ceramic phenomenon; minimal for tantalum |
| Leakage Current | `leakage_current` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Dissipation Factor | `dissipation_factor` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 60 — Aluminum Polymer Capacitors

Currently asks **12 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Polarization | `polarization` | 9 | Required for Search |  |
| Mounting Type | `mounting_type` | 9 | Required for Search |  |
| ESR | `esr` | 9 | Required for Search |  |
| Ripple Current | `ripple_current` | 9 | Narrows Results |  |
| Tolerance | `tolerance` | 5 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Lead Spacing | `lead_spacing` | 7 | Narrows Results | THT polymer only; irrelevant when mounting_type = SMD |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Diameter | `diameter` | 6 | Narrows Results |  |
| Height | `height` | 6 | Narrows Results |  |
| Impedance | `impedance` | 5 | Not Asked | ESR is the asked proxy |
| Leakage Current | `leakage_current` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Conductive Polymer Type | `polymer_type` | 5 | Not Asked | Manufacturer construction detail |
| Capacitor Type / Series | `capacitor_type` | 4 | Not Asked | Manufacturer series is not a cross-vendor attribute |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 61 — Supercapacitors (EDLC / Ultracapacitors)

Currently asks **12 of 18** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Package / Case | `package_case` | 8 | Required for Search |  |
| ESR | `esr` | 8 | Required for Search |  |
| Leakage Current | `leakage_current` | 6 | Narrows Results |  |
| Peak Current | `peak_current` | 6 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Technology / Chemistry | `technology` | 7 | Narrows Results |  |
| Cycle Life | `cycle_life` | 7 | Narrows Results |  |
| Lifetime / Endurance | `lifetime` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Diameter | `diameter` | 5 | Narrows Results |  |
| Self-Discharge | `self_discharge` | 5 | Not Asked | Leakage current is the asked proxy |
| Height | `height` | 5 | Not Asked | Diameter is the binding dimension for radial cans |
| Capacitance Aging | `cap_aging` | 5 | Not Asked | Not user-answerable |
| ESR Aging | `esr_aging` | 5 | Not Asked | Not user-answerable |
| Tolerance | `tolerance` | 4 | Not Asked | +/-20% standard; rarely differentiating |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 64 — Film Capacitors

Currently asks **12 of 19** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| Lead Spacing / Pin Pitch | `lead_spacing` | 8 | Required for Search |  |
| Voltage Rating (DC) | `voltage_rated_dc` | 9 | Required for Search |  |
| Safety Rating (X/Y Class) | `safety_rating` | 9 | Required for Search |  |
| Voltage Rating (AC) | `voltage_rated_ac` | 8 | Narrows Results |  |
| Tolerance | `tolerance` | 6 | Narrows Results |  |
| Dielectric Type | `dielectric_type` | 7 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| dV/dt Rating | `dv_dt` | 6 | Narrows Results |  |
| Height | `height` | 5 | Narrows Results |  |
| Self-Healing | `self_healing` | 7 | Not Asked | Metallized construction implies self-healing; film/foil is niche |
| Flammability Rating (UL94) | `flammability` | 7 | Not Asked | safety_rating gates mains use; UL94 rarely differentiates further |
| Ripple Current | `ripple_current` | 6 | Not Asked | Relevant only to DC-link/snubber use; application review |
| Dissipation Factor (tan δ) | `dissipation_factor` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| ESR | `esr` | 5 | Not Asked | Not a film-cap selection criterion users state |
| Body Length | `body_length` | 5 | Not Asked | Lead spacing + case capture fit |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 65 — Varistors / Metal Oxide Varistors (MOVs)

Currently asks **10 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Varistor Voltage (V₁ₘₐ) | `varistor_voltage` | 10 | Required for Search |  |
| Maximum Continuous Voltage (AC/DC) | `max_continuous_voltage` | 9 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Energy Rating (Joules) | `energy_rating` | 8 | Narrows Results |  |
| Peak Surge Current (8/20µs) | `peak_surge_current` | 8 | Narrows Results |  |
| Safety Rating (UL, IEC) | `safety_rating` | 8 | Narrows Results |  |
| Thermal Disconnect / Fuse | `thermal_disconnect` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Lead Spacing / Pitch | `lead_spacing` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Clamping Voltage (Vc) | `clamping_voltage` | 9 | Not Asked | Tracks varistor_voltage; energy and surge current are the asked differentiators |
| Disc Diameter (Radial) | `disc_diameter` | 6 | Not Asked | Disc size is encoded in package_case |
| Number of Surge Pulses (Lifetime) | `surge_pulse_lifetime` | 6 | Not Asked | Not user-answerable |
| Response Time | `response_time` | 5 | Not Asked | Effectively uniform for MOVs |
| Leakage Current | `leakage_current` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 66 — PTC Resettable Fuses (PolyFuses)

Currently asks **10 of 15** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Hold Current (Ihold) | `hold_current` | 10 | Required for Search |  |
| Maximum Voltage (Vmax) | `max_voltage` | 10 | Required for Search |  |
| Trip Current (Itrip) | `trip_current` | 9 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Initial Resistance (R₁) | `initial_resistance` | 6 | Narrows Results |  |
| Time-to-Trip | `time_to_trip` | 7 | Narrows Results |  |
| Maximum Fault Current (Imax) | `max_fault_current` | 8 | Narrows Results |  |
| Safety Rating (UL, TUV, CSA) | `safety_rating` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Endurance (Trip/Reset Cycles) | `endurance_cycles` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Post-Trip Resistance (R1max) | `post_trip_resistance` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Power Dissipation (Tripped State) | `power_dissipation` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks package |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 67 — NTC Thermistors

Currently asks **8 of 15** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance @ 25°C (R25) | `resistance_r25` | 10 | Required for Search |  |
| B-Value (B-Constant) | `b_value` | 9 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| R25 Tolerance | `r25_tolerance` | 6 | Narrows Results |  |
| B-Value Tolerance | `b_value_tolerance` | 5 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Application Category | `application_category` | 5 | Narrows Results |  |
| R-T Curve Matching | `rt_curve` | 8 | Not Asked | Vendor-table-specific; R25 + B-value capture it for substitution |
| Curve Interchangeability | `interchangeability` | 7 | Not Asked | Sensing-grade niche; tolerance questions cover accuracy |
| Maximum Power | `max_power` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Thermal Time Constant | `thermal_time_constant` | 5 | Not Asked | Not user-answerable |
| Dissipation Constant | `dissipation_constant` | 5 | Not Asked | Not user-answerable (thermal-resistance-like) |
| Height | `height` | 4 | Not Asked | Tracks package |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 68 — PTC Thermistors

Currently asks **8 of 15** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance @ 25°C (R25) | `resistance_r25` | 10 | Required for Search |  |
| Curie / Switch Temperature | `curie_temp` | 9 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| Trip Current | `trip_current` | 8 | Narrows Results |  |
| Hold Current | `hold_current` | 7 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Maximum Voltage | `max_voltage` | 7 | Narrows Results |  |
| Maximum Current | `max_current` | 7 | Narrows Results |  |
| R-T Curve Matching | `rt_curve` | 8 | Not Asked | Vendor-table-specific; R25 + Curie temp capture it for substitution |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | Curie temperature is the thermal question for PTCs |
| Curve Interchangeability | `interchangeability` | 7 | Not Asked | Sensing-grade niche |
| R25 Tolerance | `r25_tolerance` | 6 | Not Asked | Protection PTCs don't require sensing-grade tolerance |
| Maximum Power | `max_power` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Height | `height` | 4 | Not Asked | Tracks package |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 69 — Common Mode Chokes / Filters

Currently asks **11 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Common Mode Impedance | `cm_impedance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| Rated Current | `rated_current` | 9 | Required for Search |  |
| Number of Lines | `number_of_lines` | 7 | Required for Search |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Application Type | `application_type` | 5 | Narrows Results |  |
| Common Mode Inductance | `cm_inductance` | 8 | Narrows Results | Mains chokes are quoted in mH, signal chokes in ohms; accept either |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 7 | Narrows Results |  |
| Safety Rating (UL/TUV) | `safety_rating` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 6 | Narrows Results |  |
| Impedance vs Frequency Curve | `impedance_curve` | 8 | Not Asked | Curve, not a scalar; not answerable |
| Interface Compliance | `interface_compliance` | 7 | Not Asked | Overlaps application_type |
| Differential Mode Leakage Inductance | `dm_leakage` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Insulation Voltage | `insulation_voltage` | 6 | Not Asked | safety_rating covers |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks package |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 70 — Ferrite Beads (Surface Mount)

Currently asks **6 of 14** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Impedance @ 100MHz | `impedance_100mhz` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Rated Current | `rated_current` | 9 | Required for Search |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Number of Lines | `number_of_lines` | 6 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Impedance vs Frequency Curve | `impedance_curve` | 8 | Not Asked | Curve, not a scalar; not answerable |
| Signal Integrity (S-Parameters) | `signal_integrity` | 7 | Not Asked | S-parameters are not answerable |
| Operating Temp Range | `operating_temp` | 6 | Not Asked | Near-uniform for ferrite beads |
| Tolerance | `tolerance` | 5 | Not Asked | +/-25% impedance is standard |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks case size |
| Voltage Rating | `voltage_rated` | 5 | Not Asked | Beads are current-rated; voltage rarely specified |
| Resistance Type | `resistance_type` | 4 | Not Asked | Ambiguous canonical; overlaps dcr -- schema cleanup candidate |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 71 — Power Inductors (Surface Mount)

Currently asks **10 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Inductance | `inductance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Saturation Current (Isat) | `saturation_current` | 9 | Required for Search |  |
| Rated Current (Irms) | `rated_current` | 9 | Required for Search |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Shielding | `shielding` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Tolerance | `tolerance` | 6 | Narrows Results |  |
| Height (Seated Max) | `height` | 5 | Narrows Results |  |
| Inductance vs DC Bias | `inductance_vs_dc_bias` | 7 | Not Asked | Curve; Isat is the asked proxy |
| Core Material | `core_material` | 5 | Not Asked | Captured indirectly by Isat / soft-saturation behavior |
| Self-Resonant Frequency (SRF) | `srf` | 5 | Not Asked | SMPS selection is by Isat/Irms; SRF is secondary |
| AC Resistance (ACR) | `acr` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Construction Type | `construction_type` | 4 | Not Asked | Manufacturer construction detail |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### 72 — RF / Signal Inductors

Currently asks **10 of 19** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Inductance | `inductance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Rated Current (Irms) | `rated_current` | 9 | Required for Search |  |
| Self-Resonant Frequency (SRF) | `srf` | 8 | Required for Search |  |
| Q Factor (Quality Factor) | `q_factor` | 9 | Narrows Results |  |
| Core Material | `core_material` | 5 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Narrows Results |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 7 | Narrows Results |  |
| Inductance Tolerance | `inductance_tolerance` | 7 | Narrows Results |  |
| Shielding | `shielding` | 8 | Not Asked | RF/signal inductors are predominantly unshielded; core_material captures construction |
| Inductance vs DC Bias | `inductance_vs_dc_bias` | 7 | Not Asked | Curve; not answerable |
| Tolerance | `tolerance` | 6 | Not Asked | Duplicate of inductance_tolerance -- schema cleanup candidate |
| Saturation Current (Isat) | `saturation_current` | 5 | Not Asked | RF/signal inductors run far below saturation; not a selection criterion |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks case size |
| AC Resistance (ACR) | `acr` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Construction Type | `construction_type` | 4 | Not Asked | Manufacturer construction detail |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | Procurement/assembly attribute, not a selection criterion |
| Packaging | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery

Currently asks **9 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Max Repetitive Peak Reverse Voltage (Vrrm) | `vrrm` | 10 | Required for Search |  |
| Average Rectified Forward Current (Io) | `io_avg` | 10 | Required for Search |  |
| Recovery Category | `recovery_category` | 10 | Required for Search |  |
| Configuration | `configuration` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Forward Voltage Drop (Vf) | `vf` | 8 | Narrows Results |  |
| Reverse Recovery Time (trr) | `trr` | 8 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 8 | Narrows Results |  |
| Max Surge Forward Current (Ifsm) | `ifsm` | 7 | Narrows Results |  |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | Not Asked | Pin compatibility is verified against the original part's datasheet, not asked |
| Mounting Style | `mounting_style` | 9 | Not Asked | Implied by package_case |
| Max DC Blocking Voltage (Vdc) | `vdc` | 8 | Not Asked | Tracks Vrrm |
| Reverse Recovery Charge (Qrr) | `qrr` | 7 | Not Asked | trr is the asked proxy |
| Max Junction Temperature (Tj_max) | `tj_max` | 7 | Not Asked | Thermal metric; not user-answerable |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | Tj-rated parts; near-uniform |
| Recovery Behavior (Soft vs. Snappy) | `recovery_behavior` | 6 | Not Asked | Application review |
| Thermal Resistance, Junction-to-Case (Rtheta_jc) | `rth_jc` | 6 | Not Asked | Thermal metric; not user-answerable |
| Power Dissipation (Pd) | `pd` | 6 | Not Asked | Sized by Io; Pd is derived |
| Reverse Leakage Current (Ir) | `ir_leakage` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | `rth_ja` | 5 | Not Asked | Thermal metric; not user-answerable |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks package |
| Junction Capacitance (Cj) | `cj` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B2 — Schottky Barrier Diodes

Currently asks **9 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Max Repetitive Peak Reverse Voltage (Vrrm) | `vrrm` | 10 | Required for Search |  |
| Average Rectified Forward Current (Io) | `io_avg` | 10 | Required for Search |  |
| Configuration | `configuration` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Semiconductor Material (Si vs SiC) | `semiconductor_material` | 9 | Required for Search |  |
| Forward Voltage Drop (Vf) | `vf` | 9 | Narrows Results |  |
| Reverse Leakage Current (Ir) | `ir_leakage` | 7 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 8 | Narrows Results |  |
| Max Surge Forward Current (Ifsm) | `ifsm` | 7 | Narrows Results |  |
| Schottky Technology | `schottky_technology` | 10 | Not Asked | Overlaps semiconductor_material -- schema cleanup candidate |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | Not Asked | Pin compatibility is verified against the original part's datasheet, not asked |
| Mounting Style | `mounting_style` | 9 | Not Asked | Implied by package_case |
| Thermal Resistance, Junction-to-Case (Rtheta_jc) | `rth_jc` | 7 | Not Asked | Thermal metric; not user-answerable |
| Max Junction Temperature (Tj_max) | `tj_max` | 7 | Not Asked | Thermal metric; not user-answerable |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | Tj-rated parts; near-uniform |
| Junction Capacitance (Cj) | `cj` | 6 | Not Asked | Matters only in RF/detector use; application review |
| Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | `rth_ja` | 6 | Not Asked | Thermal metric; not user-answerable |
| Power Dissipation (Pd) | `pd` | 6 | Not Asked | Sized by Io; Pd is derived |
| Vf Temperature Coefficient | `vf_tempco` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks package |
| Technology (Trench vs Planar) | `technology_trench_planar` | 4 | Not Asked | Manufacturer construction detail |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B3 — Zener Diodes / Voltage Reference Diodes

Currently asks **7 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Zener Voltage (Vz) | `vz` | 10 | Required for Search |  |
| Power Dissipation (Pd) | `pd` | 9 | Required for Search |  |
| Configuration | `configuration` | 9 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Zener Voltage Tolerance | `vz_tolerance` | 8 | Narrows Results |  |
| Dynamic / Differential Impedance (Zzt) | `zzt` | 7 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 8 | Narrows Results |  |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | Not Asked | Two-terminal part; polarity handling is a datasheet-verification step, not a question |
| Mounting Style | `mounting_style` | 9 | Not Asked | Implied by package_case |
| Zener Test Current (Izt) | `izt` | 8 | Not Asked | Test condition, not a requirement users state |
| Temperature Coefficient (TC / αVz) | `tc` | 7 | Not Asked | Matters only for reference-grade use; the Voltage References family (C6) covers that |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | Tj-rated parts; near-uniform |
| Maximum Zener Current (Izm) | `izm` | 6 | Not Asked | Derived from Pd and Vz |
| Thermal Resistance, Junction-to-Ambient (Rθja) | `rth_ja` | 6 | Not Asked | Thermal metric; not user-answerable |
| Max Junction Temperature (Tj_max) | `tj_max` | 6 | Not Asked | Thermal metric; not user-answerable |
| Reverse Leakage Current (Ir) | `ir_leakage` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks package |
| Knee Impedance (Zzk) | `zzk` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Junction Capacitance (Cj) | `cj` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Forward Voltage (Vf) | `vf` | 3 | Not Asked | Zeners are used in reverse; Vf is immaterial |
| Regulation Type (Zener vs. Avalanche) | `regulation_type` | 3 | Not Asked | Implied by Vz (<5V Zener, >5V avalanche) |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B4 — TVS Diodes — Transient Voltage Suppressors

Currently asks **11 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Number of Channels / Lines | `num_channels` | 10 | Required for Search |  |
| Configuration / Topology | `configuration` | 10 | Required for Search |  |
| Polarity (Unidirectional vs. Bidirectional) | `polarity` | 10 | Required for Search |  |
| Standoff Voltage (Vrwm) | `vrwm` | 10 | Required for Search |  |
| Clamping Voltage (Vc) | `vc` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Peak Pulse Power (Ppk) | `ppk` | 9 | Narrows Results |  |
| Junction Capacitance (Cj) | `cj` | 8 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 8 | Narrows Results |  |
| Surge Standard Compliance (IEC 61000-4-5 / ISO 7637) | `surge_standard` | 8 | Narrows Results |  |
| ESD Rating (IEC 61000-4-2) | `esd_rating` | 7 | Narrows Results |  |
| Pin Configuration / Pinout | `pin_configuration` | 10 | Not Asked | Pin compatibility is verified against the original part's datasheet, not asked |
| Breakdown Voltage (Vbr) | `vbr` | 9 | Not Asked | Bracketed by Vrwm and Vc |
| Mounting Style | `mounting_style` | 9 | Not Asked | Implied by package_case |
| Peak Pulse Current (Ipp) | `ipp` | 8 | Not Asked | Ppk is the asked proxy |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | Tj-rated parts; near-uniform |
| Response Time | `response_time` | 6 | Not Asked | Effectively uniform for silicon TVS |
| Max Junction Temperature (Tj_max) | `tj_max` | 6 | Not Asked | Thermal metric; not user-answerable |
| Reverse Leakage Current (Ir) | `ir_leakage` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Thermal Resistance, Junction-to-Ambient (Rθja) | `rth_ja` | 5 | Not Asked | Thermal metric; not user-answerable |
| Steady-State Power Dissipation (Pd) | `pd` | 5 | Not Asked | Transient part; sized by Ppk, not steady-state Pd |
| Height (Seated Max) | `height` | 5 | Not Asked | Tracks package |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B5 — MOSFETs — N-Channel & P-Channel

Currently asks **9 of 27** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Channel Type (N-Channel / P-Channel) | `channel_type` | 10 | Required for Search |  |
| Drain-Source Voltage (Vds Max) | `vds_max` | 10 | Required for Search |  |
| Continuous Drain Current (Id Max) | `id_max` | 10 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| On-State Resistance (Rds(on)) | `rds_on` | 9 | Narrows Results |  |
| Gate Threshold Voltage (Vgs(th)) | `vgs_th` | 6 | Narrows Results |  |
| Technology (Si / SiC / GaN) | `technology` | 9 | Narrows Results | Critical above ~650V but noise for the majority of Si searches; ask only to narrow |
| AEC-Q101 Qualification | `aec_q101` | 8 | Narrows Results |  |
| Total Gate Charge (Qg) | `qg` | 8 | Narrows Results |  |
| Pin Configuration (G-D-S Order, Tab Assignment) | `pin_configuration` | 10 | Not Asked | Pin compatibility is verified against the original part's datasheet, not asked |
| Mounting Style | `mounting_style` | 9 | Not Asked | Implied by package_case |
| Gate-Source Voltage (Vgs Max) | `vgs_max` | 8 | Not Asked | Logic-level compatibility is asked via Vgs(th) |
| Body Diode Reverse Recovery Time (trr) | `body_diode_trr` | 8 | Not Asked | Application review |
| Peak Pulsed Drain Current (Id Pulse) | `id_pulse` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Avalanche Energy (Eas) | `avalanche_energy` | 7 | Not Asked | Application review |
| Gate-Drain Charge / Miller Charge (Qgd) | `qgd` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Output Capacitance (Coss) | `coss` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Reverse Transfer Capacitance (Crss) | `crss` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Thermal Resistance Junction-to-Case (Rθjc) | `rth_jc` | 7 | Not Asked | Thermal metric; not user-answerable |
| Safe Operating Area (SOA) Curves | `soa` | 7 | Not Asked | Curve; not answerable |
| Power Dissipation (Pd Max) | `pd` | 6 | Not Asked | Sized by Id; Pd is derived |
| Gate-Source Charge (Qgs) | `qgs` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Input Capacitance (Ciss) | `ciss` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Body Diode Forward Voltage (Vf) | `body_diode_vf` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Thermal Resistance Junction-to-Ambient (Rθja) | `rth_ja` | 5 | Not Asked | Thermal metric; not user-answerable |
| Height / Profile | `height` | 5 | Not Asked | Tracks package |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B6 — BJTs — NPN & PNP

Currently asks **8 of 18** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Polarity (NPN / PNP) | `polarity` | 10 | Required for Search |  |
| Vceo Max (Collector-Emitter Voltage, open base) | `vceo_max` | 9 | Required for Search |  |
| Continuous Collector Current (Ic Max) | `ic_max` | 10 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| DC Current Gain (hFE) | `hfe` | 8 | Narrows Results |  |
| Vce(sat) Max (Collector-Emitter Saturation Voltage) | `vce_sat` | 8 | Narrows Results |  |
| AEC-Q101 (Automotive Qualification) | `aec_q101` | 8 | Narrows Results |  |
| Transition Frequency (ft) | `ft` | 7 | Narrows Results |  |
| Storage Time (tst) | `tst` | 8 | Not Asked | Datasheet-derived; not user-answerable |
| Vces Max (Collector-Emitter Voltage, shorted base) | `vces_max` | 7 | Not Asked | Vceo is the number users know and quote; Vces adds little |
| Turn-Off Time (toff) | `toff` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Power Dissipation (Pd Max) | `pd` | 7 | Not Asked | Sized by Ic; Pd is derived |
| Junction-to-Case Thermal Resistance (Rθjc) | `rth_jc` | 7 | Not Asked | Thermal metric; not user-answerable |
| Safe Operating Area (SOA Curves) | `soa` | 7 | Not Asked | Curve; not answerable |
| Vbe(sat) Max (Base-Emitter Saturation Voltage) | `vbe_sat` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Turn-On Time (ton) | `ton` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 6 | Not Asked | Thermal metric; not user-answerable |
| Packaging Format (Tape/Reel, Tube, Ammo) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B7 — IGBTs — Insulated Gate Bipolar Transistors

Currently asks **8 of 25** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Collector-Emitter Voltage (Vces Max) | `vces_max` | 10 | Required for Search |  |
| Continuous Collector Current (Ic Max) | `ic_max` | 10 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Co-Packaged Antiparallel Diode | `co_packaged_diode` | 10 | Required for Search |  |
| Collector-Emitter Saturation Voltage (Vce(sat)) | `vce_sat` | 9 | Narrows Results |  |
| Turn-Off Energy Loss (Eoff) | `eoff` | 9 | Narrows Results |  |
| Short-Circuit Withstand Time (tsc) | `tsc` | 9 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 8 | Narrows Results |  |
| Channel Type (N-Channel / P-Channel) | `channel_type` | 10 | Not Asked | Effectively all IGBTs are N-channel; a zero-information question |
| IGBT Technology (PT / NPT / FS) | `igbt_technology` | 9 | Not Asked | Users don't select by PT/NPT/FS; Vce(sat)/Eoff capture the tradeoff |
| Mounting Style | `mounting_style` | 9 | Not Asked | Implied by package_case |
| Gate-Emitter Voltage (Vge Max) | `vge_max` | 8 | Not Asked | Datasheet-derived; not user-answerable |
| Turn-On Energy Loss (Eon) | `eon` | 8 | Not Asked | Eoff is the asked switching-loss proxy |
| Peak Pulsed Collector Current (Ic Pulse) | `ic_pulse` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Total Gate Charge (Qg) | `qg` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Junction-to-Case Thermal Resistance (Rth_jc) | `rth_jc` | 7 | Not Asked | Thermal metric; not user-answerable |
| Safe Operating Area (SOA Curves) | `soa` | 7 | Not Asked | Curve; not answerable |
| Power Dissipation (Pd Max) | `pd` | 6 | Not Asked | Sized by Ic; Pd is derived |
| Gate Threshold Voltage (Vge(th)) | `vge_th` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Turn-On Delay Time (td(on)) | `td_on` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Turn-Off Delay Time (td(off)) | `td_off` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Fall Time (tf) | `tf` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 6 | Not Asked | Thermal metric; not user-answerable |
| Height / Profile | `height` | 5 | Not Asked | Tracks package |
| Packaging Format (Tube, Tray) | `packaging` | 2 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B8 — Thyristors / TRIACs / SCRs

Currently asks **9 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Device Sub-Type (SCR / TRIAC / DIAC) | `device_type` | 10 | Required for Search |  |
| Peak Repetitive Off-State Voltage (VDRM / VRRM) | `vdrm` | 9 | Required for Search |  |
| On-State Current (IT(RMS) for TRIAC / IT(AV) for SCR) | `on_state_current` | 9 | Required for Search |  |
| Package / Footprint | `package_case` | 8 | Required for Search |  |
| Gate Trigger Current (IGT) | `igt` | 7 | Narrows Results |  |
| Holding Current (IH) | `ih` | 7 | Narrows Results |  |
| Gate Sensitivity Class (Standard / Sensitive / Logic-Level) | `gate_sensitivity` | 8 | Narrows Results |  |
| Snubberless Rating (TRIAC Only) | `snubberless` | 6 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 3 | Narrows Results |  |
| Quadrant Operation (TRIAC Only: I+, I-, III+, III-) | `quadrant_operation` | 8 | Not Asked | Drive-design detail; the sensitive-gate question covers MCU triggering |
| Non-Repetitive Surge Current (ITSM) | `itsm` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Critical Rate of Rise of Off-State Voltage (dV/dt) | `dv_dt` | 7 | Not Asked | Application review |
| Surge Current Integral (I²t) for Fuse Coordination | `i2t` | 6 | Not Asked | Fuse-coordination detail; application review |
| Latching Current (IL) | `il` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Critical Rate of Rise of On-State Current (di/dt) | `di_dt` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Non-Repetitive Peak Off-State Voltage (VDSM / VRSM) | `vdsm` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Gate Trigger Voltage (VGT) | `vgt` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Circuit-Commutated Turn-Off Time (tq) — SCR Only | `tq` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Junction-to-Case Thermal Resistance (Rth_jc) | `rth_jc` | 5 | Not Asked | Thermal metric; not user-answerable |
| Gate-Triggered Turn-On Time (tgt) | `tgt` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 4 | Not Asked | Thermal metric; not user-answerable |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### B9 — JFETs — Junction Field-Effect Transistors

Currently asks **9 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Channel Type (N/P) | `channel_type` | 10 | Required for Search |  |
| Pinch-Off Voltage Vp / Vgs(off) | `vp` | 10 | Required for Search |  |
| Drain Saturation Current Idss | `idss` | 9 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Forward Transconductance gfs / gm | `gfs` | 7 | Narrows Results |  |
| Gate Leakage Current Igss | `igss` | 9 | Narrows Results |  |
| Noise Figure NF | `noise_figure` | 8 | Narrows Results |  |
| Drain-Source Breakdown Voltage Vds | `vds_max` | 8 | Narrows Results |  |
| AEC-Q101 Automotive Qualification | `aec_q101` | 5 | Narrows Results |  |
| 1/f Noise Corner Frequency | `fc_1f_corner` | 7 | Not Asked | Not user-answerable |
| Gate-Source Breakdown Voltage Vgs | `vgs_max` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Unity-Gain Frequency ft | `ft` | 6 | Not Asked | Niche; application review |
| Input Capacitance Ciss (Cgs + Cgd) | `ciss` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Reverse Transfer Capacitance Crss (Cgd) | `crss` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Maximum Power Dissipation | `pd_max` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Maximum Junction Temperature | `tj_max` | 4 | Not Asked | Thermal metric; not user-answerable |
| Matched Pair Suitability | `matched_pair_review` | 0 | Not Asked | Zero-weight placeholder -- schema cleanup candidate |

### C1 — Linear Voltage Regulators (LDOs)

Currently asks **13 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Type (Fixed / Adjustable / Tracking / Negative) | `output_type` | 10 | Required for Search |  |
| Polarity (Positive / Negative) | `polarity` | 10 | Required for Search |  |
| Output Voltage Vout | `output_voltage` | 10 | Required for Search |  |
| Maximum Output Current (Iout Max) | `iout_max` | 9 | Required for Search |  |
| Maximum Input Voltage (Vin Max) | `vin_max` | 8 | Required for Search | Input rail is always known and a hard safety constraint |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Dropout Voltage (Vdropout Max) | `vdropout` | 7 | Narrows Results |  |
| Output Capacitor ESR Compatibility (Ceramic Stable) | `output_cap_compatibility` | 8 | Narrows Results |  |
| Enable Pin (Active High / Active Low / Absent) | `enable_pin` | 8 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 8 | Narrows Results |  |
| Output Voltage Accuracy (Initial Tolerance) | `vout_accuracy` | 7 | Narrows Results |  |
| PSRR (Power Supply Rejection Ratio) | `psrr` | 6 | Narrows Results |  |
| Quiescent Current (Iq / Ground Current) | `iq` | 5 | Narrows Results |  |
| Minimum Input Voltage (Vin Min / Dropout) | `vin_min` | 7 | Not Asked | The dropout question covers the low end |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 7 | Not Asked | Thermal metric; not user-answerable |
| Power-Good / Flag Pin | `power_good` | 6 | Not Asked | Pin-level feature; verified at datasheet level |
| Thermal Shutdown | `thermal_shutdown` | 6 | Not Asked | Near-universal in modern LDOs |
| Thermal Resistance (Rθja / Rθjc) | `rth_ja` | 6 | Not Asked | Thermal metric; not user-answerable |
| Load Regulation (ΔVout / ΔIout) | `load_regulation` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Soft-Start | `soft_start` | 5 | Not Asked | Feature detail; application review |
| Line Regulation (ΔVout / ΔVin) | `line_regulation` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C2 — Switching Regulators (DC-DC Converters & Controllers)

Currently asks **11 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant) | `topology` | 10 | Required for Search |  |
| Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | `architecture` | 10 | Required for Search |  |
| Maximum Input Voltage (Vin Max) | `vin_max` | 8 | Required for Search |  |
| Output Voltage Range (Min–Max Achievable) | `vout_range` | 8 | Required for Search |  |
| Maximum Output Current / Switch Current Limit | `iout_max` | 9 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Switching Frequency (fsw) | `fsw` | 8 | Narrows Results |  |
| Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current) | `control_mode` | 9 | Narrows Results |  |
| Feedback Reference Voltage (Vref) | `vref` | 9 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 8 | Narrows Results |  |
| Minimum Input Voltage (Vin Min) | `vin_min` | 7 | Narrows Results |  |
| Output Polarity (Positive / Negative / Isolated) | `output_polarity` | 10 | Not Asked | Captured by topology (Inverting/Flyback imply polarity/isolation) |
| Compensation Type (Internal / External Type-II / Type-III / No-Comp) | `compensation_type` | 8 | Not Asked | Design-stage detail; control_mode is the asked proxy |
| Minimum On-Time / Off-Time (ton_min, toff_min) | `ton_min` | 7 | Not Asked | Derived constraint from Vin/Vout/fsw |
| Gate Drive Voltage / Current (Controller-Only) | `gate_drive_current` | 7 | Not Asked | Controller-only detail; application review |
| Enable / UVLO Pin (Active High / Active Low / Threshold) | `enable_uvlo` | 7 | Not Asked | Pin-level detail; verified at datasheet level |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 7 | Not Asked | Thermal metric; not user-answerable |
| Soft-Start (Internal Fixed / External Css / Absent) | `soft_start` | 6 | Not Asked | Feature detail; application review |
| Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | `ocp_mode` | 6 | Not Asked | Application review |
| Thermal Shutdown Threshold | `thermal_shutdown` | 6 | Not Asked | Near-universal |
| Thermal Resistance (Rθja / Rθjc) | `rth_ja` | 6 | Not Asked | Thermal metric; not user-answerable |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C3 — Gate Drivers (MOSFET / IGBT / SiC / GaN)

Currently asks **12 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Driver Configuration (Single / Dual / Half-Bridge / Full-Bridge) | `driver_configuration` | 10 | Required for Search |  |
| Isolation Type (Non-Isolated Bootstrap / Transformer / Optocoupler / Digital Isolator) | `isolation_type` | 10 | Required for Search |  |
| Peak Source Current (Ipeak+, Turn-On) | `peak_source_current` | 8 | Required for Search |  |
| Peak Sink Current (Ipeak-, Turn-Off) | `peak_sink_current` | 8 | Required for Search |  |
| Gate Drive Supply VDD Range | `vdd_range` | 8 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Propagation Delay tpd (Input Edge to Output Edge) | `propagation_delay` | 7 | Narrows Results |  |
| Dead-Time Control (Internal Fixed / Adjustable Rdt / External / None) | `dead_time_control` | 7 | Narrows Results |  |
| Output Polarity (Non-Inverting / Inverting) | `output_polarity` | 9 | Narrows Results |  |
| Isolation Withstand Voltage (kVrms) | `isolation_voltage` | 9 | Narrows Results |  |
| Input Logic Threshold (VDD-referenced / 3.3V / 5V / Differential) | `input_logic_threshold` | 8 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 8 | Narrows Results |  |
| Dead-Time Duration | `dead_time` | 7 | Not Asked | dead_time_control is the asked question |
| Under-Voltage Lockout Threshold (UVLO) | `uvlo` | 7 | Not Asked | Tracks the driven-switch technology; application review |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 7 | Not Asked | Thermal metric; not user-answerable |
| Rise / Fall Time tr/tf (Output Transition into Load Capacitance) | `rise_fall_time` | 6 | Not Asked | Peak source/sink currents are the asked drive-strength proxy |
| Shutdown / Enable Pin (Active High / Active Low / Absent) | `shutdown_enable` | 6 | Not Asked | Pin-level detail; verified at datasheet level |
| Bootstrap Diode (Internal / External Required) | `bootstrap_diode` | 6 | Not Asked | Verified at datasheet level |
| Thermal Resistance Rθja (Junction-to-Ambient) | `rth_ja` | 6 | Not Asked | Thermal metric; not user-answerable |
| Fault Reporting / FAULT Pin (Present / Absent) | `fault_reporting` | 5 | Not Asked | Feature detail; application review |
| Input-Side Logic Supply Range (VCCI / VDDI) | `input_vdd_range` | 5 | Not Asked | Follows input_logic_threshold |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C4 — Op-Amps / Comparators / Instrumentation Amplifiers

Currently asks **15 of 24** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Device Type (Op-Amp / Comparator / Instrumentation Amplifier) | `device_type` | 10 | Required for Search |  |
| Number of Channels (Single / Dual / Quad) | `channels` | 10 | Required for Search |  |
| Input Stage Technology (CMOS / JFET / Bipolar) | `input_type` | 9 | Required for Search |  |
| Supply Voltage Range (Single/Dual) | `supply_voltage` | 8 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Gain Bandwidth Product (GBW) | `gain_bandwidth` | 8 | Narrows Results |  |
| Input Common-Mode Voltage Range (VICM) | `vicm_range` | 9 | Narrows Results |  |
| Input Bias Current Ib (Max) | `input_bias_current` | 7 | Narrows Results |  |
| Output Type (Push-Pull / Open-Drain / Open-Collector) | `output_type` | 8 | Narrows Results | Critical for comparators (open-drain vs push-pull) |
| Rail-to-Rail Output (RRO) | `rail_to_rail_output` | 8 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 8 | Narrows Results |  |
| Slew Rate (V/µs) | `slew_rate` | 7 | Narrows Results |  |
| Input Offset Voltage Vos (Max) | `input_offset_voltage` | 7 | Narrows Results |  |
| Operating Temperature Range | `operating_temp` | 7 | Narrows Results |  |
| Quiescent Current per Channel (Iq) | `iq` | 5 | Narrows Results |  |
| Rail-to-Rail Input (RRI) | `rail_to_rail_input` | 8 | Not Asked | Captured by the VICM-range question |
| Minimum Stable Gain (V/V) | `min_stable_gain` | 8 | Not Asked | Decompensated amps are niche; application review |
| Response Time / Propagation Delay (Comparator) | `response_time` | 7 | Not Asked | Comparator-only; speed covered in application review |
| Input Noise Voltage Density en (nV/√Hz) | `input_noise_voltage` | 6 | Not Asked | Precision-niche; application review |
| Output Current Drive (Short-Circuit) | `output_current` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Open-Loop Voltage Gain Avol (dB) | `avol` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Common-Mode Rejection Ratio CMRR (dB) | `cmrr` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Power Supply Rejection Ratio PSRR (dB) | `psrr` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C5 — Logic ICs — 74-Series Standard Logic

Currently asks **10 of 24** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Logic Function (Part Number Suffix) | `logic_function` | 10 | Required for Search |  |
| Number of Gates / Sections / Bits | `gate_count` | 10 | Required for Search |  |
| Supply Voltage Range (Vcc) | `supply_voltage` | 8 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | `logic_family` | 7 | Narrows Results |  |
| Input High Threshold (VIH) | `vih` | 7 | Narrows Results |  |
| Propagation Delay (tpd) | `tpd` | 7 | Narrows Results |  |
| AEC-Q100 Automotive Qualification | `aec_q100` | 8 | Narrows Results |  |
| Operating Temperature Range | `operating_temp` | 7 | Narrows Results |  |
| Maximum Operating Frequency (fmax) | `fmax` | 6 | Narrows Results |  |
| 3-State Output Enable (OE) Polarity | `oe_polarity` | 9 | Not Asked | Part-number-level detail; captured by logic_function ('241 vs '244) |
| Output Type (Totem-pole / Open-drain / 3-state) | `output_type` | 8 | Not Asked | Captured by the logic_function suffix (e.g., '07 is open-drain) |
| Output High Voltage (VOH) | `voh` | 7 | Not Asked | VIH is the asked interface-compatibility check (see Engineering Notes) |
| Output Drive Current (IOH / IOL) | `drive_current` | 7 | Not Asked | Fanout detail; application review |
| Schmitt Trigger Input | `schmitt_trigger` | 7 | Not Asked | Encoded in the function number ('14 vs '04) |
| Output Low Voltage (VOL) | `vol` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Input Low Threshold (VIL) | `vil` | 6 | Not Asked | VIH covers the threshold question |
| Setup Time / Hold Time (tsu / th) | `setup_hold_time` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Bus Hold / Weak Pull-up | `bus_hold` | 5 | Not Asked | Family-level detail; application review |
| Max I2C Bus Clock Speed (kHz) | `i2c_bus_speed_max_khz` | 5 | Not Asked | Misfiled canonical -- I2C bus speed does not apply to 74-series logic; schema cleanup candidate |
| Input Clamp Diodes | `input_clamp_diodes` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Input Leakage Current (IIH / IIL) | `input_leakage` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Output Transition Time (tr / tf) | `transition_time` | 4 | Not Asked | Datasheet-derived; not user-answerable |
| Packaging Format (Tape & Reel / Tube / Tray) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C6 — Voltage References

Currently asks **11 of 19** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Configuration (Series / Shunt) | `configuration` | 10 | Required for Search |  |
| Output Voltage (Vout) | `output_voltage` | 10 | Required for Search |  |
| Output Voltage Adjustability (Fixed / Adjustable / Trimmable) | `adjustability` | 8 | Required for Search |  |
| Package / Footprint | `package_case` | 5 | Required for Search |  |
| Initial Accuracy (%) | `initial_accuracy` | 8 | Narrows Results |  |
| Temperature Coefficient (ppm/°C) | `tc` | 8 | Narrows Results |  |
| Dropout Voltage | `dropout_voltage` | 7 | Narrows Results |  |
| Input Voltage Range | `input_voltage_range` | 7 | Narrows Results |  |
| Output Voltage Noise (0.1–10 Hz µVrms) | `output_noise` | 6 | Narrows Results |  |
| Operating Temperature Range | `operating_temp` | 6 | Narrows Results |  |
| AEC-Q100 Automotive Qualification | `aec_q100` | 3 | Narrows Results |  |
| Enable/Shutdown Pin Polarity | `enable_shutdown_polarity` | 8 | Not Asked | Pin-level detail; verified at datasheet level |
| Reference Architecture (Band-gap / Buried Zener / XFET) | `architecture` | 7 | Not Asked | Users specify accuracy/TC, not internal architecture |
| TC/Accuracy Grade (Suffix) | `tc_accuracy_grade` | 7 | Not Asked | Redundant with the initial_accuracy + tc questions |
| Quiescent Current (Iq) | `quiescent_current` | 5 | Not Asked | Near-duplicate of iq canonical -- schema cleanup candidate; application review |
| Output Current / Load Current Capability | `output_current` | 5 | Not Asked | The series/shunt configuration question covers the load class |
| Long-Term Stability (ppm/1000h) | `long_term_stability` | 4 | Not Asked | Precision-niche; application review |
| Output Noise Filtering (NR Pin) | `nr_pin` | 4 | Not Asked | Feature detail; verified at datasheet level |
| Packaging Format (Tape & Reel / Cut Tape / Bulk) | `packaging` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C7 — Interface ICs (RS-485, CAN, I2C, USB)

Currently asks **12 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Protocol / Interface Standard | `protocol` | 10 | Required for Search |  |
| Operating Mode / Driver Topology | `operating_mode` | 9 | Required for Search |  |
| Data Rate / Speed Grade | `data_rate` | 9 | Required for Search |  |
| Supply Voltage Range | `supply_voltage` | 7 | Required for Search |  |
| Package / Footprint | `package_case` | 5 | Required for Search |  |
| Galvanic Isolation Type | `isolation_type` | 8 | Narrows Results |  |
| Bus Fault Protection Voltage | `bus_fault_protection` | 8 | Narrows Results |  |
| ESD Rating — Bus Pins | `esd_bus_pins` | 7 | Narrows Results |  |
| Operating Temperature Range | `operating_temp` | 7 | Narrows Results |  |
| Propagation Delay / Loop Delay | `propagation_delay` | 6 | Narrows Results |  |
| Unit Loads / Bus Loading | `unit_loads` | 5 | Narrows Results | RS-485 node count is user-known |
| AEC-Q100 / Automotive Qualification | `aec_q100` | 4 | Narrows Results |  |
| Driver Enable / Direction Control Polarity | `de_polarity` | 8 | Not Asked | Pinout detail; verified at datasheet level |
| CAN Standard Variant / USB Speed Grade | `can_variant` | 8 | Not Asked | Captured by protocol + data_rate (e.g., 5 Mbps implies CAN FD) |
| TXD Dominant Timeout / Bus Watchdog | `txd_dominant_timeout` | 7 | Not Asked | Feature detail; application review |
| Isolation Working Voltage (VIORM) | `isolation_working_voltage` | 7 | Not Asked | Follows isolation_type; refined in application review |
| Input Receiver Threshold & Common-Mode Range | `receiver_threshold_cm` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Failsafe Receiver Behavior | `failsafe_receiver` | 6 | Not Asked | Feature detail; application review |
| Differential Output Voltage (VOD) | `vod_differential` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Common-Mode Operating Range | `common_mode_range` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Slew Rate Limiting | `slew_rate_class` | 6 | Not Asked | Follows data_rate |
| Shutdown / Low-Power Standby Current | `standby_current` | 5 | Not Asked | Application review |

### C8 — Timers and Oscillators (555 / XO / MEMS / TCXO / VCXO / OCXO)

Currently asks **12 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Device Category / Stability Class | `device_category` | 10 | Required for Search |  |
| Output Frequency | `output_frequency_hz` | 10 | Required for Search |  |
| Output Signal Type | `output_signal_type` | 9 | Required for Search |  |
| Supply Voltage Range | `supply_voltage_range` | 8 | Required for Search |  |
| Package / Case | `package_case` | 5 | Required for Search |  |
| Initial Frequency Tolerance (ppm) | `initial_tolerance_ppm` | 8 | Narrows Results |  |
| Temperature Stability (ppm over range) | `temp_stability_ppm` | 8 | Narrows Results |  |
| VCXO Pull Range (±ppm) | `vcxo_pull_range_ppm` | 8 | Narrows Results |  |
| Timer Variant (CMOS vs Bipolar) | `timer_variant` | 7 | Narrows Results |  |
| Phase Jitter (ps RMS) | `phase_jitter_ps_rms` | 7 | Narrows Results |  |
| Operating Temperature Range | `operating_temp_range` | 7 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 4 | Narrows Results |  |
| Output Enable Polarity | `oe_polarity` | 8 | Not Asked | Pinout detail; verified at datasheet level |
| Output VOH/VOL Levels | `output_voh_vol` | 7 | Not Asked | Follows output_signal_type and supply |
| Output Load Capacitance (pF) | `output_drive_cl_pf` | 6 | Not Asked | Design-point detail; application review |
| Active Supply Current (mA) | `icc_active_ma` | 6 | Not Asked | Application review |
| Aging Rate (ppm/year) | `aging_ppm_per_year` | 5 | Not Asked | Precision-niche; application review |
| Output Duty Cycle (%) | `duty_cycle_pct` | 5 | Not Asked | Near-uniform for XOs |
| Startup Time (ms) | `startup_time_ms` | 5 | Not Asked | Application review |
| Standby Current (µA) | `icc_standby_ua` | 5 | Not Asked | Application review |
| Crystal Load Capacitance (pF) | `crystal_load_cap_pf` | 3 | Not Asked | Crystal-family (D1) attribute misfiled here -- schema cleanup candidate |
| Packaging Format | `packaging_format` | 1 | Not Asked | Procurement/assembly attribute, not a selection criterion |

### C9 — ADCs — Analog-to-Digital Converters

Currently asks **14 of 20** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| ADC Architecture | `architecture` | 10 | Required for Search |  |
| Resolution (bits) | `resolution_bits` | 10 | Required for Search |  |
| Interface Type | `interface_type` | 9 | Required for Search |  |
| Input Configuration | `input_configuration` | 9 | Required for Search |  |
| Number of Channels | `channel_count` | 8 | Required for Search |  |
| Package / Case | `package_case` | 5 | Required for Search |  |
| Sample Rate (SPS) | `sample_rate_sps` | 8 | Narrows Results |  |
| Effective Number of Bits (ENOB) | `enob` | 7 | Narrows Results |  |
| Simultaneous Sampling | `simultaneous_sampling` | 9 | Narrows Results |  |
| Reference Type | `reference_type` | 7 | Narrows Results |  |
| Full-Scale Input Range (V) | `input_voltage_range` | 7 | Narrows Results |  |
| Supply Voltage Range (V) | `supply_voltage_range` | 7 | Narrows Results |  |
| Operating Temperature Range (°C) | `operating_temp_range` | 7 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 4 | Narrows Results |  |
| Integral Non-Linearity (LSB) | `inl_lsb` | 7 | Not Asked | ENOB is the asked precision proxy |
| Differential Non-Linearity (LSB) | `dnl_lsb` | 6 | Not Asked | ENOB is the asked precision proxy |
| Total Harmonic Distortion (dBc) | `thd_db` | 6 | Not Asked | ENOB is the asked precision proxy |
| Conversion Latency (cycles) | `conversion_latency_cycles` | 6 | Not Asked | Architecture implies latency class; application review |
| Internal Reference Voltage (V) | `reference_voltage` | 5 | Not Asked | Follows reference_type |
| Power Consumption (mW) | `power_consumption_mw` | 5 | Not Asked | Application review |

### C10 — DACs — Digital-to-Analog Converters

Currently asks **15 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Type | `output_type` | 10 | Required for Search |  |
| Resolution (bits) | `resolution_bits` | 10 | Required for Search |  |
| Number of DAC Channels | `channel_count` | 7 | Required for Search | Identity-level: single/dual/quad DACs have different pinouts |
| Interface Type | `interface_type` | 9 | Required for Search |  |
| Output Buffered | `output_buffered` | 8 | Required for Search |  |
| Package / Case | `package_case` | 5 | Required for Search |  |
| Update Rate (SPS) | `update_rate_sps` | 7 | Narrows Results |  |
| Power-On Reset State | `power_on_reset_state` | 8 | Narrows Results |  |
| Output Voltage Range (V) | `output_voltage_range` | 8 | Narrows Results |  |
| DAC Architecture | `architecture` | 7 | Narrows Results |  |
| Settling Time (µs) | `settling_time_us` | 7 | Narrows Results |  |
| Reference Type | `reference_type` | 7 | Narrows Results |  |
| Supply Voltage Range (V) | `supply_voltage_range` | 7 | Narrows Results |  |
| Operating Temperature Range (°C) | `operating_temp_range` | 7 | Narrows Results |  |
| AEC-Q100 Qualification | `aec_q100` | 4 | Narrows Results |  |
| Integral Non-Linearity (LSB) | `inl_lsb` | 7 | Not Asked | Resolution + settling cover; application review |
| Differential Non-Linearity (LSB) | `dnl_lsb` | 7 | Not Asked | Resolution + settling cover; application review |
| Glitch Energy (nVs) | `glitch_energy_nVs` | 7 | Not Asked | Application review |
| Output Noise Density (nV/√Hz) | `output_noise_density_nvhz` | 6 | Not Asked | Precision-niche; application review |
| Output Source Current (mA) | `output_current_source_ma` | 6 | Not Asked | The buffered question covers drive class |
| Internal Reference Voltage (V) | `reference_voltage` | 5 | Not Asked | Follows reference_type |
| Power Consumption (mW) | `power_consumption_mw` | 5 | Not Asked | Application review |

### D1 — Crystals — Quartz Resonators

Currently asks **10 of 18** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Nominal Frequency (Hz) | `nominal_frequency_hz` | 10 | Required for Search |  |
| Load Capacitance (pF) | `load_capacitance_pf` | 9 | Required for Search |  |
| Package / Case | `package_type` | 8 | Required for Search |  |
| Crystal Cut Type | `cut_type` | 8 | Required for Search |  |
| Overtone Order | `overtone_order` | 9 | Required for Search |  |
| ESR (Equivalent Series Resistance) | `equivalent_series_resistance_ohm` | 8 | Narrows Results |  |
| Frequency Tolerance (ppm) | `frequency_tolerance_ppm` | 8 | Narrows Results |  |
| Frequency Stability (ppm) | `frequency_stability_ppm` | 8 | Narrows Results |  |
| Operating Temperature Range | `operating_temp_range` | 7 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 4 | Narrows Results |  |
| Mounting Type | `mounting_type` | 7 | Not Asked | Implied by package_type |
| Maximum Drive Level (µW) | `drive_level_uw` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Pin Count | `package_pins` | 6 | Not Asked | Implied by package_type |
| Shunt Capacitance (pF) | `shunt_capacitance_pf` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Aging Rate (ppm/year) | `aging_ppm_per_year` | 6 | Not Asked | Precision-niche; application review |
| Frequency vs Temperature Curve | `frequency_vs_temp_curve` | 4 | Not Asked | Curve; not answerable |
| Storage Temperature Range | `storage_temp_range` | 3 | Not Asked | Users cannot state a storage temperature |
| Qualification Level | `qualification_level` | 2 | Not Asked | Generic catch-all; overlaps aec_q200 -- schema cleanup candidate |

### D2 — Fuses — Traditional Overcurrent Protection

Currently asks **10 of 14** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Current Rating (A) | `current_rating_a` | 10 | Required for Search |  |
| Voltage Rating (V) | `voltage_rating_v` | 10 | Required for Search |  |
| Breaking Capacity (A) | `breaking_capacity_a` | 10 | Required for Search |  |
| Speed Class | `speed_class` | 9 | Required for Search |  |
| Package Format | `package_format` | 9 | Required for Search |  |
| Voltage Type (AC/DC) | `voltage_type` | 7 | Narrows Results |  |
| I²t Let-Through Energy (A²·s) | `i2t_rating_a2s` | 8 | Narrows Results |  |
| Safety Certification | `safety_certification` | 7 | Narrows Results |  |
| Operating Temperature Range | `operating_temp_range` | 6 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 4 | Narrows Results |  |
| Mounting Type | `mounting_type` | 8 | Not Asked | Captured by package_format |
| Melting I²t (A²·s) | `melting_i2t_a2s` | 6 | Not Asked | Clearing I2t is the asked value |
| Body Material | `body_material` | 6 | Not Asked | Breaking capacity is the functional question; body material is a proxy |
| Derating Factor | `derating_factor` | 5 | Not Asked | Derived design guidance, not a part attribute |

### E1 — Optocouplers / Photocouplers

Currently asks **11 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Transistor Type | `output_transistor_type` | 10 | Required for Search |  |
| Isolation Voltage (Vrms) | `isolation_voltage_vrms` | 10 | Required for Search |  |
| Channel Count | `channel_count` | 9 | Required for Search |  |
| Package Type | `package_type` | 9 | Required for Search |  |
| CTR Minimum (%) | `ctr_min_pct` | 9 | Narrows Results |  |
| Bandwidth (kHz) | `bandwidth_khz` | 8 | Narrows Results |  |
| Working Voltage (Vrms) | `working_voltage_vrms` | 9 | Narrows Results |  |
| Creepage Distance (mm) | `creepage_distance_mm` | 8 | Narrows Results |  |
| Safety Certification | `safety_certification` | 7 | Narrows Results |  |
| Operating Temperature Range | `operating_temp_range` | 7 | Narrows Results |  |
| AEC-Q101 Qualification | `aec_q101` | 4 | Narrows Results |  |
| Vce(sat) (V) | `vce_sat_v` | 8 | Not Asked | Datasheet-derived; not user-answerable |
| Clearance Distance (mm) | `clearance_distance_mm` | 7 | Not Asked | Creepage is the binding asked constraint |
| Peak Isolation Voltage (V) | `peak_isolation_voltage_v` | 7 | Not Asked | isolation_voltage_vrms covers |
| CTR Maximum (%) | `ctr_max_pct` | 7 | Not Asked | CTR minimum covers |
| LED Rated Forward Current (mA) | `if_rated_ma` | 7 | Not Asked | Design-point detail; application review |
| Input Forward Voltage Vf (V) | `input_forward_voltage_vf` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Propagation Delay (us) | `propagation_delay_us` | 7 | Not Asked | Bandwidth is the asked speed proxy |
| Supply Voltage VCC | `supply_voltage_vcc` | 7 | Not Asked | Applies only to IC-output types; application review |
| CTR Class (Rank) | `ctr_class` | 6 | Not Asked | Manufacturer binning; ctr_min covers |
| CTR Degradation (%) | `ctr_degradation_pct` | 6 | Not Asked | Lifetime-modeling detail; not answerable |
| Pollution Degree | `pollution_degree` | 5 | Not Asked | System-level parameter, not a part question |
| Output Leakage ICEO (uA) | `output_leakage_iceo_ua` | 5 | Not Asked | Datasheet-derived; not user-answerable |

### F1 — Electromechanical Relays (EMR)

Currently asks **13 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Coil Voltage (VDC) | `coil_voltage_vdc` | 10 | Required for Search |  |
| Contact Form | `contact_form` | 10 | Required for Search |  |
| Mounting Type | `mounting_type` | 9 | Required for Search |  |
| Contact Count (Poles) | `contact_count` | 8 | Required for Search |  |
| Contact Voltage Rating (V) | `contact_voltage_rating_v` | 9 | Required for Search |  |
| Contact Current Rating (A) | `contact_current_rating_a` | 9 | Required for Search |  |
| Package Footprint | `package_footprint` | 8 | Narrows Results |  |
| Coil Resistance (Ω) | `coil_resistance_ohm` | 7 | Narrows Results |  |
| Contact Voltage Type (AC/DC) | `contact_voltage_type` | 7 | Narrows Results | AC vs DC load radically changes effective contact rating |
| Operating Temperature Range | `operating_temp_range` | 7 | Narrows Results |  |
| Electrical Life (operations) | `electrical_life_ops` | 6 | Narrows Results |  |
| Coil Suppression Diode | `coil_suppress_diode` | 6 | Narrows Results | Built-in diode changes drive circuit and coil polarity |
| AEC-Q200 Qualification | `aec_q200` | 4 | Narrows Results |  |
| Contact Material | `contact_material` | 7 | Not Asked | Load class captured by voltage/current ratings; signal-level relays handled in application review |
| Must-Operate Voltage (V) | `must_operate_voltage_v` | 7 | Not Asked | Datasheet-derived; not user-answerable |
| Maximum Switching Power (VA) | `max_switching_power_va` | 6 | Not Asked | Derived from V x I ratings |
| Coil Power (mW) | `coil_power_mw` | 6 | Not Asked | Follows coil voltage/resistance |
| Operate Time (ms) | `operate_time_ms` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Release Time (ms) | `release_time_ms` | 6 | Not Asked | Datasheet-derived; not user-answerable |
| Must-Release Voltage (V) | `must_release_voltage_v` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Mechanical Life (operations) | `mechanical_life_ops` | 5 | Not Asked | Electrical life is the binding number |
| Contact Bounce (ms) | `contact_bounce_ms` | 5 | Not Asked | Datasheet-derived; not user-answerable |
| Sealing Type | `sealing_type` | 5 | Not Asked | Assembly-process attribute; application review |

### F2 — Solid State Relays (SSR)

Currently asks **13 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Switch Type | `output_switch_type` | 10 | Required for Search |  |
| Firing Mode | `firing_mode` | 9 | Required for Search |  |
| Mounting Type | `mounting_type` | 9 | Required for Search |  |
| Load Voltage Max (V) | `load_voltage_max_v` | 10 | Required for Search |  |
| Load Current Max (A) | `load_current_max_a` | 10 | Required for Search |  |
| Input Voltage Range (V) | `input_voltage_range_v` | 9 | Required for Search |  |
| On-State Voltage Drop (V) | `on_state_voltage_drop_v` | 7 | Narrows Results |  |
| Isolation Voltage (Vrms) | `isolation_voltage_vrms` | 8 | Narrows Results |  |
| Off-State Leakage (mA) | `off_state_leakage_ma` | 7 | Narrows Results | Matters for small AC loads (e.g., LED lamps staying lit) |
| Safety Certification | `safety_certification` | 7 | Narrows Results |  |
| Operating Temperature Range | `operating_temp_range` | 7 | Narrows Results |  |
| Package Footprint | `package_footprint` | 7 | Narrows Results |  |
| Built-in Snubber | `built_in_snubber` | 6 | Narrows Results |  |
| Load Voltage Type (AC/DC) | `load_voltage_type` | 8 | Not Asked | Implied by output_switch_type (TRIAC = AC; MOSFET = DC) |
| Input Current (mA) | `input_current_ma` | 7 | Not Asked | Follows input_voltage_range |
| Turn-On Time (ms) | `turn_on_time_ms` | 7 | Not Asked | Firing mode captures the switching-behavior class |
| Turn-Off Time (ms) | `turn_off_time_ms` | 7 | Not Asked | Firing mode captures the switching-behavior class |
| Load Current Min (A) | `load_current_min_a` | 6 | Not Asked | Datasheet footnote; the leakage question covers small-load risk |
| dV/dt Rating (V/µs) | `dv_dt_rating_v_us` | 6 | Not Asked | Application review |
| dI/dt Rating (A/µs) | `di_dt_rating_a_us` | 6 | Not Asked | Application review |
| Thermal Resistance Junction-to-Case (°C/W) | `thermal_resistance_jc` | 6 | Not Asked | Thermal metric; not user-answerable |
| Input Impedance (Ω) | `input_impedance_ohm` | 5 | Not Asked | Follows input spec |
| Built-in Varistor (MOV/TVS) | `built_in_varistor` | 5 | Not Asked | The snubber question covers protection add-ons |

---

**Total: 823 scored specs across 43 families. 449 asked, 374 not asked.**

## Engineering Notes

<!-- HAND-WRITTEN. Preserved verbatim by `npm run selection:audit`. -->

**NTC vs PTC Thermistors (67 vs 68):** These are separate families with different Tier 2 sets. NTC thermistors are defined by `resistance_r25` and `b_value` (which sets the R-T curve shape). PTC thermistors are defined by `resistance_r25` and `curie_temp` (the switching temperature). The agent must resolve which family before collecting attributes — asking "NTC or PTC?" is the prerequisite question.

**Film Capacitors (64):** `safety_rating` is Tier 2 because it's a hard gate for AC mains applications — an X2/Y2-rated film capacitor and a non-safety-rated film capacitor are architecturally different products. Ask `voltage_rated_dc` first; if the application is AC mains, `safety_rating` becomes blocking.

**Aluminum Electrolytic Capacitors (58):** `diameter` and `lead_spacing` are de-facto hard gates for PCB drop-in replacement even though the logic type is Fit/Identity — the PCB footprint is drilled to match. Both must be in Tier 2 for any PCB replacement request.

**Rectifier Diodes (B1) and Schottky (B2):** `configuration` (Single / Dual Common Cathode / Dual Common Anode / etc.) is Identity w10 — pin connections are completely different across configurations. A dual common cathode cannot substitute for a dual common anode even in the same package. This must be in Tier 2.

**Schottky (B2):** `semiconductor_material` (Si vs SiC) is an Identity flag w9 — silicon Schottky is limited to ≤200V, SiC extends to 600–1700V. A silicon part cannot substitute for SiC regardless of other specs. Required in Tier 2.

**TVS Diodes (B4):** `num_channels` and `configuration` are both Identity w10 — a 4-channel array and a single device have completely different pinouts and cannot substitute. These must be in Tier 2 before any other evaluation.

**LDOs (C1):** `output_type` (Fixed / Adjustable / Negative / Tracking) and `polarity` (Positive / Negative) are both Identity w10 BLOCKING. These must be the first two questions asked — they determine the entire circuit topology and no parametric comparison is meaningful until they're confirmed.

**Switching Regulators (C2):** `architecture` (Integrated switch vs Controller-only) is Identity w10 BLOCKING alongside `topology`. An integrated-switch IC has its own power FETs; a controller-only IC drives external FETs via gate outputs. These are not pin-compatible and there is no PCB path for the external FETs if the architecture changes.

**Gate Drivers (C3):** `isolation_type` (Non-isolated bootstrap vs Transformer vs Optocoupler vs Digital isolator) is Identity w10 BLOCKING. A non-isolated bootstrap driver cannot provide galvanic isolation; a galvanically isolated driver has two supply domains that a bootstrap driver lacks entirely.

**Op-Amps/Comparators (C4):** `channels` (Single/Dual/Quad) is Identity w10 BLOCKING — single/dual/quad packages have completely different pinouts. It must be the second question after `device_type`. `vicm_range` is Tier 3 but escalates to BLOCKING when the input common-mode voltage exceeds the device range (phase reversal risk).

**Logic ICs (C5):** `logic_family` is Tier 3 (Application Review) rather than Tier 2 because `logic_function`, `gate_count`, and `supply_voltage` are sufficient to return a useful result set. However, the agent must verify `vih` against the driving source before confirming any candidate — especially the HC vs HCT distinction (HC requires VIH=3.5V which TTL VOH=2.4V cannot meet).

**Crystals (D1):** `overtone_order` is Tier 2 even though it only matters above ~30 MHz. The failure mode (fundamental-mode oscillator running at 1/3 or 1/5 of intended frequency) is catastrophic and silent — the oscillator appears to start but runs at the wrong frequency. `load_capacitance_pf` is Tier 2 for the same reason — wrong CL shifts frequency by 30–100 ppm with no visible failure mode.

**Fuses (D2):** `breaking_capacity_a` is Tier 2 — it is a safety-critical minimum (w10) not a parametric differentiator. A fuse whose breaking capacity is below the available fault current will rupture, not interrupt, creating a fire hazard. It must be confirmed before searching, not after.

**Voltage References (C6):** `adjustability` (Fixed / Adjustable / Trimmable) is Tier 2 — if the original has a trim pin used for factory calibration and the replacement lacks one, the trimmed calibration is lost and initial accuracy reverts to untrimmed spec.

**SSR (F2):** `firing_mode` (Zero-crossing vs Random-fire) is Tier 2 BLOCKING — these are not interchangeable in inrush-sensitive or proportional-control applications. A zero-crossing SSR cannot perform phase-angle power control; a random-fire SSR generates inrush that may trip upstream protection. Must be confirmed before searching.
