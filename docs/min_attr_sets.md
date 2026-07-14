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

The same spec is **asked** in one family and **silently skipped** in another that also scores it.
At least one of the two decisions is wrong. 38 found.

| Spec | id | Max weight | Asked in | Silently skipped in |
|---|---|---|---|---|
| Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | `architecture` | 10 | C2, C9 | C6, C10 |
| Channel Type (N-Channel / P-Channel) | `channel_type` | 10 | B5, B9 | B7 |
| Maximum Voltage (Vmax) | `max_voltage` | 10 | 66 | 68 |
| Output Type (Fixed / Adjustable / Tracking / Negative) | `output_type` | 10 | C1, C10 | C4, C5 |
| Package / Case | `package_case` | 10 | 34 families | 53, 55 |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | B3 | B1, B2, B4, B5 |
| Vces Max (Collector-Emitter Voltage, shorted base) | `vces_max` | 10 | B7 | B6 |
| Drain-Source Voltage (Vds Max) | `vds_max` | 10 | B5 | B9 |
| Number of Channels | `channel_count` | 9 | C9, E1 | C10 |
| ESR | `esr` | 9 | 58, 59, 60, 61 | 12, 13, 64 |
| Mounting Style | `mounting_style` | 9 | 53, 55 | B1, B2, B3, B4, B5, B7 |
| Mounting Type | `mounting_type` | 9 | 58, 60, F1, F2 | D1, D2 |
| Power Dissipation (Pd) | `pd` | 9 | B3 | B1, B2, B4, B5, B6, B7 |
| Ripple Current | `ripple_current` | 9 | 58, 60 | 59, 64 |
| Safety Rating (X/Y Class) | `safety_rating` | 9 | 64, 65 | 66, 69 |
| Saturation Current (Isat) | `saturation_current` | 9 | 71 | 72 |
| Tolerance | `tolerance` | 9 | 8 families | 58, 59, 61, 70, 71, 72 |
| Forward Voltage Drop (Vf) | `vf` | 9 | B1, B2 | B3 |
| Voltage Rating | `voltage_rated` | 9 | 12, 13, 58, 59, 60, 61 | 52, 53, 54, 55, 69, 70 |
| Junction Capacitance (Cj) | `cj` | 8 | B4 | B1, B2, B3 |
| Lead Spacing / Pitch | `lead_spacing` | 8 | 53, 58, 64 | 60, 65 |
| Package Footprint | `package_footprint` | 8 | F1 | F2 |
| Shielding | `shielding` | 8 | 71 | 72 |
| Self-Resonant Frequency (SRF) | `srf` | 8 | 72 | 71 |
| Supply Voltage Range | `supply_voltage_range` | 8 | C8 | C9, C10 |
| Temperature Coefficient (TC / αVz) | `tc` | 8 | C6 | B3 |
| Temperature Coefficient (TCR) | `tcr` | 8 | 52, 54 | 53, 55 |
| Maximum Input Voltage (Vin Max) | `vin_max` | 8 | C2 | C1 |
| Capacitor Type / Series | `capacitor_type` | 7 | 59 | 58, 60 |
| DC Resistance (DCR) | `dcr` | 7 | 69, 70, 71 | 72 |
| Reverse Leakage Current (Ir) | `ir_leakage` | 7 | B2 | B1, B3, B4 |
| Lifetime / Endurance | `lifetime` | 7 | 58 | 61 |
| Propagation Delay tpd (Input Edge to Output Edge) | `propagation_delay` | 7 | C3 | C7 |
| Diameter | `diameter` | 6 | 58 | 60, 61 |
| Leakage Current | `leakage_current` | 6 | 61 | 58, 59, 60, 65 |
| R25 Tolerance | `r25_tolerance` | 6 | 67 | 68 |
| Composition / Technology | `composition` | 5 | 53 | 52, 54, 55 |
| Core Material | `core_material` | 5 | 72 | 71 |

---

## Families

### 12 — Ceramic Capacitors – MLCC (Surface Mount)

Currently asks **6 of 14** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Dielectric / Temperature Characteristic | `dielectric` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Flexible Termination | `flexible_termination` | 8 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| DC Bias Derating | `dc_bias_derating` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| ESR | `esr` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| ESL | `esl` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 13 — Mica Capacitors (Silver Mica)

Currently asks **6 of 13** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Dielectric Material | `dielectric` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Temperature Coefficient | `temperature_coefficient` | 7 | Narrows Results |  |
| Operating Temp Range | `operating_temp` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| ESR | `esr` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| ESL | `esl` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 52 — Chip Resistors (Surface Mount)

Currently asks **5 of 13** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Power Rating | `power_rating` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Temperature Coefficient (TCR) | `tcr` | 6 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Anti-Sulfur | `anti_sulfur` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Composition / Technology | `composition` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 53 — Through-Hole Resistors

Currently asks **6 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Mounting Style | `mounting_style` | 9 | Required for Search |  |
| Lead Spacing / Pitch | `lead_spacing` | 7 | Required for Search |  |
| Power Rating | `power_rating` | 9 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Composition / Technology | `composition` | 5 | Narrows Results |  |
| Package / Case | `package_case` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Voltage Rating | `voltage_rated` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Anti-Sulfur | `anti_sulfur` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Temperature Coefficient (TCR) | `tcr` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Body Length × Diameter | `body_dimensions` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 54 — Current Sense Resistors

Currently asks **6 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Power Rating | `power_rating` | 9 | Required for Search |  |
| Kelvin (4-Terminal) Sensing | `kelvin_sensing` | 8 | Required for Search |  |
| Tolerance | `tolerance` | 9 | Narrows Results |  |
| Temperature Coefficient (TCR) | `tcr` | 8 | Narrows Results |  |
| Voltage Rating | `voltage_rated` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Anti-Sulfur | `anti_sulfur` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Rating (Pulse) | `power_rating_pulse` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Composition / Technology | `composition` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Inductance (Parasitic) | `parasitic_inductance` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 55 — Chassis Mount / High Power Resistors

Currently asks **6 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance | `resistance` | 10 | Required for Search |  |
| Power Rating | `power_rating` | 10 | Required for Search |  |
| Mounting Style | `mounting_style` | 9 | Required for Search |  |
| Heatsink Interface Dimensions | `heatsink_dimensions` | 8 | Required for Search |  |
| Tolerance | `tolerance` | 7 | Narrows Results |  |
| Thermal Resistance (°C/W) | `thermal_resistance` | 7 | Narrows Results |  |
| Package / Case | `package_case` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Voltage Rating | `voltage_rated` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Anti-Sulfur | `anti_sulfur` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Temperature Coefficient (TCR) | `tcr` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Composition / Technology | `composition` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 58 — Aluminum Electrolytic Capacitors

Currently asks **9 of 17** scored specs.

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
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Height | `height` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Tolerance | `tolerance` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Impedance | `impedance` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Leakage Current | `leakage_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Capacitor Type / Series | `capacitor_type` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 59 — Tantalum Capacitors

Currently asks **6 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Package / Case (EIA) | `package_case` | 10 | Required for Search |  |
| Capacitor Type | `capacitor_type` | 7 | Required for Search |  |
| ESR | `esr` | 7 | Narrows Results |  |
| Failure Mode (Benign) | `failure_mode` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Ripple Current | `ripple_current` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Tolerance | `tolerance` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Surge / Inrush Voltage | `surge_voltage` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| DC Bias Derating | `dc_bias_derating` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Leakage Current | `leakage_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Dissipation Factor | `dissipation_factor` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 60 — Aluminum Polymer Capacitors

Currently asks **7 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Polarization | `polarization` | 9 | Required for Search |  |
| Mounting Type | `mounting_type` | 9 | Required for Search |  |
| ESR | `esr` | 9 | Required for Search |  |
| Ripple Current | `ripple_current` | 9 | Narrows Results |  |
| Tolerance | `tolerance` | 5 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Lead Spacing | `lead_spacing` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Diameter | `diameter` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Height | `height` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Impedance | `impedance` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Leakage Current | `leakage_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Conductive Polymer Type | `polymer_type` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Capacitor Type / Series | `capacitor_type` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 61 — Supercapacitors (EDLC / Ultracapacitors)

Currently asks **6 of 18** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Capacitance | `capacitance` | 10 | Required for Search |  |
| Voltage Rating | `voltage_rated` | 9 | Required for Search |  |
| Package / Case | `package_case` | 8 | Required for Search |  |
| ESR | `esr` | 8 | Required for Search |  |
| Leakage Current | `leakage_current` | 6 | Narrows Results |  |
| Peak Current | `peak_current` | 6 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Technology / Chemistry | `technology` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Cycle Life | `cycle_life` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Lifetime / Endurance | `lifetime` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Self-Discharge | `self_discharge` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Diameter | `diameter` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Capacitance Aging | `cap_aging` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| ESR Aging | `esr_aging` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Tolerance | `tolerance` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 64 — Film Capacitors

Currently asks **8 of 19** scored specs.

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
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Self-Healing | `self_healing` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Flammability Rating (UL94) | `flammability` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| dV/dt Rating | `dv_dt` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Ripple Current | `ripple_current` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Dissipation Factor (tan δ) | `dissipation_factor` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| ESR | `esr` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Body Length | `body_length` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 65 — Varistors / Metal Oxide Varistors (MOVs)

Currently asks **6 of 16** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Varistor Voltage (V₁ₘₐ) | `varistor_voltage` | 10 | Required for Search |  |
| Maximum Continuous Voltage (AC/DC) | `max_continuous_voltage` | 9 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Energy Rating (Joules) | `energy_rating` | 8 | Narrows Results |  |
| Peak Surge Current (8/20µs) | `peak_surge_current` | 8 | Narrows Results |  |
| Safety Rating (UL, IEC) | `safety_rating` | 8 | Narrows Results |  |
| Clamping Voltage (Vc) | `clamping_voltage` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Disconnect / Fuse | `thermal_disconnect` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Lead Spacing / Pitch | `lead_spacing` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Disc Diameter (Radial) | `disc_diameter` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Number of Surge Pulses (Lifetime) | `surge_pulse_lifetime` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Response Time | `response_time` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Leakage Current | `leakage_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 66 — PTC Resettable Fuses (PolyFuses)

Currently asks **6 of 15** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Hold Current (Ihold) | `hold_current` | 10 | Required for Search |  |
| Maximum Voltage (Vmax) | `max_voltage` | 10 | Required for Search |  |
| Trip Current (Itrip) | `trip_current` | 9 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Initial Resistance (R₁) | `initial_resistance` | 6 | Narrows Results |  |
| Time-to-Trip | `time_to_trip` | 7 | Narrows Results |  |
| Maximum Fault Current (Imax) | `max_fault_current` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Safety Rating (UL, TUV, CSA) | `safety_rating` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Endurance (Trip/Reset Cycles) | `endurance_cycles` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Post-Trip Resistance (R1max) | `post_trip_resistance` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Dissipation (Tripped State) | `power_dissipation` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 67 — NTC Thermistors

Currently asks **5 of 15** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance @ 25°C (R25) | `resistance_r25` | 10 | Required for Search |  |
| B-Value (B-Constant) | `b_value` | 9 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| R25 Tolerance | `r25_tolerance` | 6 | Narrows Results |  |
| B-Value Tolerance | `b_value_tolerance` | 5 | Narrows Results |  |
| R-T Curve Matching | `rt_curve` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Curve Interchangeability | `interchangeability` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Power | `max_power` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Time Constant | `thermal_time_constant` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Dissipation Constant | `dissipation_constant` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Application Category | `application_category` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height | `height` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 68 — PTC Thermistors

Currently asks **5 of 15** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Resistance @ 25°C (R25) | `resistance_r25` | 10 | Required for Search |  |
| Curie / Switch Temperature | `curie_temp` | 9 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| Trip Current | `trip_current` | 8 | Narrows Results |  |
| Hold Current | `hold_current` | 7 | Narrows Results |  |
| R-T Curve Matching | `rt_curve` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Voltage | `max_voltage` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Current | `max_current` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Curve Interchangeability | `interchangeability` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| R25 Tolerance | `r25_tolerance` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Power | `max_power` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Height | `height` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 69 — Common Mode Chokes / Filters

Currently asks **6 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Common Mode Impedance | `cm_impedance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 9 | Required for Search |  |
| Rated Current | `rated_current` | 9 | Required for Search |  |
| Number of Lines | `number_of_lines` | 7 | Required for Search |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Application Type | `application_type` | 5 | Narrows Results |  |
| Common Mode Inductance | `cm_inductance` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Impedance vs Frequency Curve | `impedance_curve` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Voltage Rating | `voltage_rated` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Interface Compliance | `interface_compliance` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Safety Rating (UL/TUV) | `safety_rating` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Differential Mode Leakage Inductance | `dm_leakage` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Insulation Voltage | `insulation_voltage` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 70 — Ferrite Beads (Surface Mount)

Currently asks **5 of 14** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Impedance @ 100MHz | `impedance_100mhz` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Rated Current | `rated_current` | 9 | Required for Search |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Number of Lines | `number_of_lines` | 6 | Narrows Results |  |
| Impedance vs Frequency Curve | `impedance_curve` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Signal Integrity (S-Parameters) | `signal_integrity` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Tolerance | `tolerance` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Voltage Rating | `voltage_rated` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Resistance Type | `resistance_type` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 71 — Power Inductors (Surface Mount)

Currently asks **6 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Inductance | `inductance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Saturation Current (Isat) | `saturation_current` | 9 | Required for Search |  |
| Rated Current (Irms) | `rated_current` | 9 | Required for Search |  |
| DC Resistance (DCR) | `dcr` | 7 | Narrows Results |  |
| Shielding | `shielding` | 8 | Narrows Results |  |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Inductance vs DC Bias | `inductance_vs_dc_bias` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Tolerance | `tolerance` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Core Material | `core_material` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Self-Resonant Frequency (SRF) | `srf` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AC Resistance (ACR) | `acr` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Construction Type | `construction_type` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### 72 — RF / Signal Inductors

Currently asks **6 of 19** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Inductance | `inductance` | 10 | Required for Search |  |
| Package / Case | `package_case` | 10 | Required for Search |  |
| Rated Current (Irms) | `rated_current` | 9 | Required for Search |  |
| Self-Resonant Frequency (SRF) | `srf` | 8 | Required for Search |  |
| Q Factor (Quality Factor) | `q_factor` | 9 | Narrows Results |  |
| Core Material | `core_material` | 5 | Narrows Results |  |
| Shielding | `shielding` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| DC Resistance (DCR) | `dcr` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temp Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Inductance vs DC Bias | `inductance_vs_dc_bias` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Inductance Tolerance | `inductance_tolerance` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Tolerance | `tolerance` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Saturation Current (Isat) | `saturation_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AC Resistance (ACR) | `acr` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Construction Type | `construction_type` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Moisture Sensitivity Level | `msl` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery

Currently asks **7 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Max Repetitive Peak Reverse Voltage (Vrrm) | `vrrm` | 10 | Required for Search |  |
| Average Rectified Forward Current (Io) | `io_avg` | 10 | Required for Search |  |
| Recovery Category | `recovery_category` | 10 | Required for Search |  |
| Configuration | `configuration` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Forward Voltage Drop (Vf) | `vf` | 8 | Narrows Results |  |
| Reverse Recovery Time (trr) | `trr` | 8 | Narrows Results |  |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Mounting Style | `mounting_style` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Max DC Blocking Voltage (Vdc) | `vdc` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Max Surge Forward Current (Ifsm) | `ifsm` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Reverse Recovery Charge (Qrr) | `qrr` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Max Junction Temperature (Tj_max) | `tj_max` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Recovery Behavior (Soft vs. Snappy) | `recovery_behavior` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance, Junction-to-Case (Rtheta_jc) | `rth_jc` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Dissipation (Pd) | `pd` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Reverse Leakage Current (Ir) | `ir_leakage` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | `rth_ja` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Junction Capacitance (Cj) | `cj` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B2 — Schottky Barrier Diodes

Currently asks **7 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Max Repetitive Peak Reverse Voltage (Vrrm) | `vrrm` | 10 | Required for Search |  |
| Average Rectified Forward Current (Io) | `io_avg` | 10 | Required for Search |  |
| Configuration | `configuration` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Semiconductor Material (Si vs SiC) | `semiconductor_material` | 9 | Required for Search |  |
| Forward Voltage Drop (Vf) | `vf` | 9 | Narrows Results |  |
| Reverse Leakage Current (Ir) | `ir_leakage` | 7 | Narrows Results |  |
| Schottky Technology | `schottky_technology` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Mounting Style | `mounting_style` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Max Surge Forward Current (Ifsm) | `ifsm` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance, Junction-to-Case (Rtheta_jc) | `rth_jc` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Max Junction Temperature (Tj_max) | `tj_max` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Junction Capacitance (Cj) | `cj` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | `rth_ja` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Dissipation (Pd) | `pd` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Vf Temperature Coefficient | `vf_tempco` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Technology (Trench vs Planar) | `technology_trench_planar` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B3 — Zener Diodes / Voltage Reference Diodes

Currently asks **7 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Zener Voltage (Vz) | `vz` | 10 | Required for Search |  |
| Power Dissipation (Pd) | `pd` | 9 | Required for Search |  |
| Configuration | `configuration` | 9 | Required for Search |  |
| Pin Configuration / Polarity Marking | `pin_configuration` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Zener Voltage Tolerance | `vz_tolerance` | 8 | Narrows Results |  |
| Dynamic / Differential Impedance (Zzt) | `zzt` | 7 | Narrows Results |  |
| Mounting Style | `mounting_style` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Zener Test Current (Izt) | `izt` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Temperature Coefficient (TC / αVz) | `tc` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Zener Current (Izm) | `izm` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance, Junction-to-Ambient (Rθja) | `rth_ja` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Max Junction Temperature (Tj_max) | `tj_max` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Reverse Leakage Current (Ir) | `ir_leakage` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Knee Impedance (Zzk) | `zzk` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Junction Capacitance (Cj) | `cj` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Forward Voltage (Vf) | `vf` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Regulation Type (Zener vs. Avalanche) | `regulation_type` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B4 — TVS Diodes — Transient Voltage Suppressors

Currently asks **8 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Polarity (Unidirectional vs. Bidirectional) | `polarity` | 10 | Required for Search |  |
| Standoff Voltage (Vrwm) | `vrwm` | 10 | Required for Search |  |
| Clamping Voltage (Vc) | `vc` | 10 | Required for Search |  |
| Number of Channels / Lines | `num_channels` | 10 | Required for Search |  |
| Configuration / Topology | `configuration` | 10 | Required for Search |  |
| Package / Form Factor | `package_case` | 10 | Required for Search |  |
| Peak Pulse Power (Ppk) | `ppk` | 9 | Narrows Results |  |
| Junction Capacitance (Cj) | `cj` | 8 | Narrows Results |  |
| Pin Configuration / Pinout | `pin_configuration` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Breakdown Voltage (Vbr) | `vbr` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Mounting Style | `mounting_style` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Peak Pulse Current (Ipp) | `ipp` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Surge Standard Compliance (IEC 61000-4-5 / ISO 7637) | `surge_standard` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| ESD Rating (IEC 61000-4-2) | `esd_rating` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Response Time | `response_time` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Max Junction Temperature (Tj_max) | `tj_max` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Reverse Leakage Current (Ir) | `ir_leakage` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance, Junction-to-Ambient (Rθja) | `rth_ja` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Steady-State Power Dissipation (Pd) | `pd` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height (Seated Max) | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging (Tape & Reel / Tube / Bulk) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B5 — MOSFETs — N-Channel & P-Channel

Currently asks **6 of 27** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Channel Type (N-Channel / P-Channel) | `channel_type` | 10 | Required for Search |  |
| Drain-Source Voltage (Vds Max) | `vds_max` | 10 | Required for Search |  |
| Continuous Drain Current (Id Max) | `id_max` | 10 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| On-State Resistance (Rds(on)) | `rds_on` | 9 | Narrows Results |  |
| Gate Threshold Voltage (Vgs(th)) | `vgs_th` | 6 | Narrows Results |  |
| Pin Configuration (G-D-S Order, Tab Assignment) | `pin_configuration` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Technology (Si / SiC / GaN) | `technology` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Mounting Style | `mounting_style` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate-Source Voltage (Vgs Max) | `vgs_max` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Total Gate Charge (Qg) | `qg` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Body Diode Reverse Recovery Time (trr) | `body_diode_trr` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Peak Pulsed Drain Current (Id Pulse) | `id_pulse` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Avalanche Energy (Eas) | `avalanche_energy` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate-Drain Charge / Miller Charge (Qgd) | `qgd` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Capacitance (Coss) | `coss` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Reverse Transfer Capacitance (Crss) | `crss` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance Junction-to-Case (Rθjc) | `rth_jc` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Safe Operating Area (SOA) Curves | `soa` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Dissipation (Pd Max) | `pd` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate-Source Charge (Qgs) | `qgs` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Capacitance (Ciss) | `ciss` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Body Diode Forward Voltage (Vf) | `body_diode_vf` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance Junction-to-Ambient (Rθja) | `rth_ja` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Height / Profile | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B6 — BJTs — NPN & PNP

Currently asks **6 of 18** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Polarity (NPN / PNP) | `polarity` | 10 | Required for Search |  |
| Vceo Max (Collector-Emitter Voltage, open base) | `vceo_max` | 9 | Required for Search |  |
| Continuous Collector Current (Ic Max) | `ic_max` | 10 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| DC Current Gain (hFE) | `hfe` | 8 | Narrows Results |  |
| Vce(sat) Max (Collector-Emitter Saturation Voltage) | `vce_sat` | 8 | Narrows Results |  |
| Storage Time (tst) | `tst` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 (Automotive Qualification) | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Vces Max (Collector-Emitter Voltage, shorted base) | `vces_max` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Transition Frequency (ft) | `ft` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-Off Time (toff) | `toff` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Dissipation (Pd Max) | `pd` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Junction-to-Case Thermal Resistance (Rθjc) | `rth_jc` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Safe Operating Area (SOA Curves) | `soa` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Vbe(sat) Max (Base-Emitter Saturation Voltage) | `vbe_sat` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-On Time (ton) | `ton` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Ammo) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B7 — IGBTs — Insulated Gate Bipolar Transistors

Currently asks **6 of 25** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Collector-Emitter Voltage (Vces Max) | `vces_max` | 10 | Required for Search |  |
| Continuous Collector Current (Ic Max) | `ic_max` | 10 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Co-Packaged Antiparallel Diode | `co_packaged_diode` | 10 | Required for Search |  |
| Collector-Emitter Saturation Voltage (Vce(sat)) | `vce_sat` | 9 | Narrows Results |  |
| Turn-Off Energy Loss (Eoff) | `eoff` | 9 | Narrows Results |  |
| Channel Type (N-Channel / P-Channel) | `channel_type` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| IGBT Technology (PT / NPT / FS) | `igbt_technology` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Mounting Style | `mounting_style` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Short-Circuit Withstand Time (tsc) | `tsc` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate-Emitter Voltage (Vge Max) | `vge_max` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-On Energy Loss (Eon) | `eon` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Peak Pulsed Collector Current (Ic Pulse) | `ic_pulse` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Total Gate Charge (Qg) | `qg` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Junction-to-Case Thermal Resistance (Rth_jc) | `rth_jc` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Safe Operating Area (SOA Curves) | `soa` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Dissipation (Pd Max) | `pd` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate Threshold Voltage (Vge(th)) | `vge_th` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-On Delay Time (td(on)) | `td_on` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-Off Delay Time (td(off)) | `td_off` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Fall Time (tf) | `tf` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Height / Profile | `height` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tube, Tray) | `packaging` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### B8 — Thyristors / TRIACs / SCRs

Currently asks **6 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Device Sub-Type (SCR / TRIAC / DIAC) | `device_type` | 10 | Required for Search |  |
| Peak Repetitive Off-State Voltage (VDRM / VRRM) | `vdrm` | 9 | Required for Search |  |
| On-State Current (IT(RMS) for TRIAC / IT(AV) for SCR) | `on_state_current` | 9 | Required for Search |  |
| Package / Footprint | `package_case` | 8 | Required for Search |  |
| Gate Trigger Current (IGT) | `igt` | 7 | Narrows Results |  |
| Holding Current (IH) | `ih` | 7 | Narrows Results |  |
| Gate Sensitivity Class (Standard / Sensitive / Logic-Level) | `gate_sensitivity` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Quadrant Operation (TRIAC Only: I+, I-, III+, III-) | `quadrant_operation` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Non-Repetitive Surge Current (ITSM) | `itsm` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Critical Rate of Rise of Off-State Voltage (dV/dt) | `dv_dt` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Surge Current Integral (I²t) for Fuse Coordination | `i2t` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Latching Current (IL) | `il` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Critical Rate of Rise of On-State Current (di/dt) | `di_dt` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Snubberless Rating (TRIAC Only) | `snubberless` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Non-Repetitive Peak Off-State Voltage (VDSM / VRSM) | `vdsm` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate Trigger Voltage (VGT) | `vgt` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Circuit-Commutated Turn-Off Time (tq) — SCR Only | `tq` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Junction-to-Case Thermal Resistance (Rth_jc) | `rth_jc` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate-Triggered Turn-On Time (tgt) | `tgt` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### B9 — JFETs — Junction Field-Effect Transistors

Currently asks **6 of 17** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Channel Type (N/P) | `channel_type` | 10 | Required for Search |  |
| Pinch-Off Voltage Vp / Vgs(off) | `vp` | 10 | Required for Search |  |
| Drain Saturation Current Idss | `idss` | 9 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Forward Transconductance gfs / gm | `gfs` | 7 | Narrows Results |  |
| Gate Leakage Current Igss | `igss` | 9 | Narrows Results |  |
| Noise Figure NF | `noise_figure` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Drain-Source Breakdown Voltage Vds | `vds_max` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| 1/f Noise Corner Frequency | `fc_1f_corner` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate-Source Breakdown Voltage Vgs | `vgs_max` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Unity-Gain Frequency ft | `ft` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Capacitance Ciss (Cgs + Cgd) | `ciss` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Reverse Transfer Capacitance Crss (Cgd) | `crss` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Automotive Qualification | `aec_q101` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Power Dissipation | `pd_max` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature | `tj_max` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Matched Pair Suitability | `matched_pair_review` | 0 | Not Asked | ⚠️ NEEDS REVIEW |

### C1 — Linear Voltage Regulators (LDOs)

Currently asks **7 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Type (Fixed / Adjustable / Tracking / Negative) | `output_type` | 10 | Required for Search |  |
| Polarity (Positive / Negative) | `polarity` | 10 | Required for Search |  |
| Output Voltage Vout | `output_voltage` | 10 | Required for Search |  |
| Maximum Output Current (Iout Max) | `iout_max` | 9 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Dropout Voltage (Vdropout Max) | `vdropout` | 7 | Narrows Results |  |
| Output Capacitor ESR Compatibility (Ceramic Stable) | `output_cap_compatibility` | 8 | Narrows Results |  |
| Maximum Input Voltage (Vin Max) | `vin_max` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Enable Pin (Active High / Active Low / Absent) | `enable_pin` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Minimum Input Voltage (Vin Min / Dropout) | `vin_min` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Voltage Accuracy (Initial Tolerance) | `vout_accuracy` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| PSRR (Power Supply Rejection Ratio) | `psrr` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Power-Good / Flag Pin | `power_good` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Shutdown | `thermal_shutdown` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance (Rθja / Rθjc) | `rth_ja` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Quiescent Current (Iq / Ground Current) | `iq` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Load Regulation (ΔVout / ΔIout) | `load_regulation` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Soft-Start | `soft_start` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Line Regulation (ΔVout / ΔVin) | `line_regulation` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C2 — Switching Regulators (DC-DC Converters & Controllers)

Currently asks **9 of 22** scored specs.

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
| Output Polarity (Positive / Negative / Isolated) | `output_polarity` | 10 | Not Asked | ⚠️ NEEDS REVIEW |
| Compensation Type (Internal / External Type-II / Type-III / No-Comp) | `compensation_type` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Minimum Input Voltage (Vin Min) | `vin_min` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Minimum On-Time / Off-Time (ton_min, toff_min) | `ton_min` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Gate Drive Voltage / Current (Controller-Only) | `gate_drive_current` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Enable / UVLO Pin (Active High / Active Low / Threshold) | `enable_uvlo` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Soft-Start (Internal Fixed / External Css / Absent) | `soft_start` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | `ocp_mode` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Shutdown Threshold | `thermal_shutdown` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance (Rθja / Rθjc) | `rth_ja` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C3 — Gate Drivers (MOSFET / IGBT / SiC / GaN)

Currently asks **8 of 22** scored specs.

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
| Output Polarity (Non-Inverting / Inverting) | `output_polarity` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Isolation Withstand Voltage (kVrms) | `isolation_voltage` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Logic Threshold (VDD-referenced / 3.3V / 5V / Differential) | `input_logic_threshold` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Dead-Time Duration | `dead_time` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Under-Voltage Lockout Threshold (UVLO) | `uvlo` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Junction Temperature (Tj Max) | `tj_max` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Rise / Fall Time tr/tf (Output Transition into Load Capacitance) | `rise_fall_time` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Shutdown / Enable Pin (Active High / Active Low / Absent) | `shutdown_enable` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Bootstrap Diode (Internal / External Required) | `bootstrap_diode` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance Rθja (Junction-to-Ambient) | `rth_ja` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Fault Reporting / FAULT Pin (Present / Absent) | `fault_reporting` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Input-Side Logic Supply Range (VCCI / VDDI) | `input_vdd_range` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C4 — Op-Amps / Comparators / Instrumentation Amplifiers

Currently asks **8 of 24** scored specs.

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
| Output Type (Push-Pull / Open-Drain / Open-Collector) | `output_type` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Rail-to-Rail Input (RRI) | `rail_to_rail_input` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Rail-to-Rail Output (RRO) | `rail_to_rail_output` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Minimum Stable Gain (V/V) | `min_stable_gain` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Slew Rate (V/µs) | `slew_rate` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Offset Voltage Vos (Max) | `input_offset_voltage` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Response Time / Propagation Delay (Comparator) | `response_time` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Noise Voltage Density en (nV/√Hz) | `input_noise_voltage` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Current Drive (Short-Circuit) | `output_current` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Open-Loop Voltage Gain Avol (dB) | `avol` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Common-Mode Rejection Ratio CMRR (dB) | `cmrr` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Supply Rejection Ratio PSRR (dB) | `psrr` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Quiescent Current per Channel (Iq) | `iq` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape/Reel, Tube, Tray) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C5 — Logic ICs — 74-Series Standard Logic

Currently asks **7 of 24** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Logic Function (Part Number Suffix) | `logic_function` | 10 | Required for Search |  |
| Number of Gates / Sections / Bits | `gate_count` | 10 | Required for Search |  |
| Supply Voltage Range (Vcc) | `supply_voltage` | 8 | Required for Search |  |
| Package / Footprint | `package_case` | 10 | Required for Search |  |
| Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | `logic_family` | 7 | Narrows Results |  |
| Input High Threshold (VIH) | `vih` | 7 | Narrows Results |  |
| Propagation Delay (tpd) | `tpd` | 7 | Narrows Results |  |
| 3-State Output Enable (OE) Polarity | `oe_polarity` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Type (Totem-pole / Open-drain / 3-state) | `output_type` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Automotive Qualification | `aec_q100` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Output High Voltage (VOH) | `voh` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Drive Current (IOH / IOL) | `drive_current` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Schmitt Trigger Input | `schmitt_trigger` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Low Voltage (VOL) | `vol` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Low Threshold (VIL) | `vil` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Operating Frequency (fmax) | `fmax` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Setup Time / Hold Time (tsu / th) | `setup_hold_time` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Bus Hold / Weak Pull-up | `bus_hold` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Max I2C Bus Clock Speed (kHz) | `i2c_bus_speed_max_khz` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Clamp Diodes | `input_clamp_diodes` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Leakage Current (IIH / IIL) | `input_leakage` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Transition Time (tr / tf) | `transition_time` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape & Reel / Tube / Tray) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C6 — Voltage References

Currently asks **6 of 19** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Configuration (Series / Shunt) | `configuration` | 10 | Required for Search |  |
| Output Voltage (Vout) | `output_voltage` | 10 | Required for Search |  |
| Output Voltage Adjustability (Fixed / Adjustable / Trimmable) | `adjustability` | 8 | Required for Search |  |
| Package / Footprint | `package_case` | 5 | Required for Search |  |
| Initial Accuracy (%) | `initial_accuracy` | 8 | Narrows Results |  |
| Temperature Coefficient (ppm/°C) | `tc` | 8 | Narrows Results |  |
| Enable/Shutdown Pin Polarity | `enable_shutdown_polarity` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Reference Architecture (Band-gap / Buried Zener / XFET) | `architecture` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| TC/Accuracy Grade (Suffix) | `tc_accuracy_grade` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Dropout Voltage | `dropout_voltage` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Voltage Range | `input_voltage_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Voltage Noise (0.1–10 Hz µVrms) | `output_noise` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Quiescent Current (Iq) | `quiescent_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Current / Load Current Capability | `output_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Long-Term Stability (ppm/1000h) | `long_term_stability` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Noise Filtering (NR Pin) | `nr_pin` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Automotive Qualification | `aec_q100` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format (Tape & Reel / Cut Tape / Bulk) | `packaging` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C7 — Interface ICs (RS-485, CAN, I2C, USB)

Currently asks **7 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Protocol / Interface Standard | `protocol` | 10 | Required for Search |  |
| Operating Mode / Driver Topology | `operating_mode` | 9 | Required for Search |  |
| Data Rate / Speed Grade | `data_rate` | 9 | Required for Search |  |
| Supply Voltage Range | `supply_voltage` | 7 | Required for Search |  |
| Package / Footprint | `package_case` | 5 | Required for Search |  |
| Galvanic Isolation Type | `isolation_type` | 8 | Narrows Results |  |
| Bus Fault Protection Voltage | `bus_fault_protection` | 8 | Narrows Results |  |
| Driver Enable / Direction Control Polarity | `de_polarity` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| CAN Standard Variant / USB Speed Grade | `can_variant` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| TXD Dominant Timeout / Bus Watchdog | `txd_dominant_timeout` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Isolation Working Voltage (VIORM) | `isolation_working_voltage` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| ESD Rating — Bus Pins | `esd_bus_pins` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Receiver Threshold & Common-Mode Range | `receiver_threshold_cm` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Failsafe Receiver Behavior | `failsafe_receiver` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Differential Output Voltage (VOD) | `vod_differential` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Propagation Delay / Loop Delay | `propagation_delay` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Common-Mode Operating Range | `common_mode_range` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Slew Rate Limiting | `slew_rate_class` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Unit Loads / Bus Loading | `unit_loads` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Shutdown / Low-Power Standby Current | `standby_current` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 / Automotive Qualification | `aec_q100` | 4 | Not Asked | ⚠️ NEEDS REVIEW |

### C8 — Timers and Oscillators (555 / XO / MEMS / TCXO / VCXO / OCXO)

Currently asks **7 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Device Category / Stability Class | `device_category` | 10 | Required for Search |  |
| Output Frequency | `output_frequency_hz` | 10 | Required for Search |  |
| Output Signal Type | `output_signal_type` | 9 | Required for Search |  |
| Supply Voltage Range | `supply_voltage_range` | 8 | Required for Search |  |
| Package / Case | `package_case` | 5 | Required for Search |  |
| Initial Frequency Tolerance (ppm) | `initial_tolerance_ppm` | 8 | Narrows Results |  |
| Temperature Stability (ppm over range) | `temp_stability_ppm` | 8 | Narrows Results |  |
| Output Enable Polarity | `oe_polarity` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| VCXO Pull Range (±ppm) | `vcxo_pull_range_ppm` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Timer Variant (CMOS vs Bipolar) | `timer_variant` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output VOH/VOL Levels | `output_voh_vol` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Phase Jitter (ps RMS) | `phase_jitter_ps_rms` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Load Capacitance (pF) | `output_drive_cl_pf` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Active Supply Current (mA) | `icc_active_ma` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Aging Rate (ppm/year) | `aging_ppm_per_year` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Duty Cycle (%) | `duty_cycle_pct` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Startup Time (ms) | `startup_time_ms` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Standby Current (µA) | `icc_standby_ua` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Crystal Load Capacitance (pF) | `crystal_load_cap_pf` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Packaging Format | `packaging_format` | 1 | Not Asked | ⚠️ NEEDS REVIEW |

### C9 — ADCs — Analog-to-Digital Converters

Currently asks **9 of 20** scored specs.

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
| Integral Non-Linearity (LSB) | `inl_lsb` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Reference Type | `reference_type` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Full-Scale Input Range (V) | `input_voltage_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Supply Voltage Range (V) | `supply_voltage_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range (°C) | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Differential Non-Linearity (LSB) | `dnl_lsb` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Total Harmonic Distortion (dBc) | `thd_db` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Conversion Latency (cycles) | `conversion_latency_cycles` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Internal Reference Voltage (V) | `reference_voltage` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Consumption (mW) | `power_consumption_mw` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 4 | Not Asked | ⚠️ NEEDS REVIEW |

### C10 — DACs — Digital-to-Analog Converters

Currently asks **8 of 22** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Type | `output_type` | 10 | Required for Search |  |
| Resolution (bits) | `resolution_bits` | 10 | Required for Search |  |
| Interface Type | `interface_type` | 9 | Required for Search |  |
| Output Buffered | `output_buffered` | 8 | Required for Search |  |
| Package / Case | `package_case` | 5 | Required for Search |  |
| Update Rate (SPS) | `update_rate_sps` | 7 | Narrows Results |  |
| Power-On Reset State | `power_on_reset_state` | 8 | Narrows Results |  |
| Output Voltage Range (V) | `output_voltage_range` | 8 | Narrows Results |  |
| DAC Architecture | `architecture` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Number of DAC Channels | `channel_count` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Integral Non-Linearity (LSB) | `inl_lsb` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Differential Non-Linearity (LSB) | `dnl_lsb` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Glitch Energy (nVs) | `glitch_energy_nVs` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Settling Time (µs) | `settling_time_us` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Reference Type | `reference_type` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Supply Voltage Range (V) | `supply_voltage_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range (°C) | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Noise Density (nV/√Hz) | `output_noise_density_nvhz` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Source Current (mA) | `output_current_source_ma` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Internal Reference Voltage (V) | `reference_voltage` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Power Consumption (mW) | `power_consumption_mw` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q100 Qualification | `aec_q100` | 4 | Not Asked | ⚠️ NEEDS REVIEW |

### D1 — Crystals — Quartz Resonators

Currently asks **7 of 18** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Nominal Frequency (Hz) | `nominal_frequency_hz` | 10 | Required for Search |  |
| Load Capacitance (pF) | `load_capacitance_pf` | 9 | Required for Search |  |
| Package / Case | `package_type` | 8 | Required for Search |  |
| Crystal Cut Type | `cut_type` | 8 | Required for Search |  |
| Overtone Order | `overtone_order` | 9 | Required for Search |  |
| ESR (Equivalent Series Resistance) | `equivalent_series_resistance_ohm` | 8 | Narrows Results |  |
| Frequency Tolerance (ppm) | `frequency_tolerance_ppm` | 8 | Narrows Results |  |
| Frequency Stability (ppm) | `frequency_stability_ppm` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Mounting Type | `mounting_type` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Drive Level (µW) | `drive_level_uw` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Pin Count | `package_pins` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Shunt Capacitance (pF) | `shunt_capacitance_pf` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Aging Rate (ppm/year) | `aging_ppm_per_year` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Frequency vs Temperature Curve | `frequency_vs_temp_curve` | 4 | Not Asked | ⚠️ NEEDS REVIEW |
| Storage Temperature Range | `storage_temp_range` | 3 | Not Asked | ⚠️ NEEDS REVIEW |
| Qualification Level | `qualification_level` | 2 | Not Asked | ⚠️ NEEDS REVIEW |

### D2 — Fuses — Traditional Overcurrent Protection

Currently asks **7 of 14** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Current Rating (A) | `current_rating_a` | 10 | Required for Search |  |
| Voltage Rating (V) | `voltage_rating_v` | 10 | Required for Search |  |
| Breaking Capacity (A) | `breaking_capacity_a` | 10 | Required for Search |  |
| Speed Class | `speed_class` | 9 | Required for Search |  |
| Package Format | `package_format` | 9 | Required for Search |  |
| Voltage Type (AC/DC) | `voltage_type` | 7 | Narrows Results |  |
| I²t Let-Through Energy (A²·s) | `i2t_rating_a2s` | 8 | Narrows Results |  |
| Mounting Type | `mounting_type` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Safety Certification | `safety_certification` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Melting I²t (A²·s) | `melting_i2t_a2s` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Body Material | `body_material` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp_range` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Derating Factor | `derating_factor` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 4 | Not Asked | ⚠️ NEEDS REVIEW |

### E1 — Optocouplers / Photocouplers

Currently asks **6 of 23** scored specs.

| Spec | id | Weight | State | Reason |
|---|---|---|---|---|
| Output Transistor Type | `output_transistor_type` | 10 | Required for Search |  |
| Isolation Voltage (Vrms) | `isolation_voltage_vrms` | 10 | Required for Search |  |
| Channel Count | `channel_count` | 9 | Required for Search |  |
| Package Type | `package_type` | 9 | Required for Search |  |
| CTR Minimum (%) | `ctr_min_pct` | 9 | Narrows Results |  |
| Bandwidth (kHz) | `bandwidth_khz` | 8 | Narrows Results |  |
| Working Voltage (Vrms) | `working_voltage_vrms` | 9 | Not Asked | ⚠️ NEEDS REVIEW |
| Creepage Distance (mm) | `creepage_distance_mm` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Vce(sat) (V) | `vce_sat_v` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Clearance Distance (mm) | `clearance_distance_mm` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Peak Isolation Voltage (V) | `peak_isolation_voltage_v` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Safety Certification | `safety_certification` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| CTR Maximum (%) | `ctr_max_pct` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| LED Rated Forward Current (mA) | `if_rated_ma` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Forward Voltage Vf (V) | `input_forward_voltage_vf` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Propagation Delay (us) | `propagation_delay_us` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Supply Voltage VCC | `supply_voltage_vcc` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| CTR Class (Rank) | `ctr_class` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| CTR Degradation (%) | `ctr_degradation_pct` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Pollution Degree | `pollution_degree` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Output Leakage ICEO (uA) | `output_leakage_iceo_ua` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q101 Qualification | `aec_q101` | 4 | Not Asked | ⚠️ NEEDS REVIEW |

### F1 — Electromechanical Relays (EMR)

Currently asks **8 of 23** scored specs.

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
| Contact Voltage Type (AC/DC) | `contact_voltage_type` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Contact Material | `contact_material` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Must-Operate Voltage (V) | `must_operate_voltage_v` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Maximum Switching Power (VA) | `max_switching_power_va` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Coil Power (mW) | `coil_power_mw` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Operate Time (ms) | `operate_time_ms` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Release Time (ms) | `release_time_ms` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Electrical Life (operations) | `electrical_life_ops` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Coil Suppression Diode | `coil_suppress_diode` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Must-Release Voltage (V) | `must_release_voltage_v` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Mechanical Life (operations) | `mechanical_life_ops` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Contact Bounce (ms) | `contact_bounce_ms` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Sealing Type | `sealing_type` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| AEC-Q200 Qualification | `aec_q200` | 4 | Not Asked | ⚠️ NEEDS REVIEW |

### F2 — Solid State Relays (SSR)

Currently asks **8 of 23** scored specs.

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
| Load Voltage Type (AC/DC) | `load_voltage_type` | 8 | Not Asked | ⚠️ NEEDS REVIEW |
| Off-State Leakage (mA) | `off_state_leakage_ma` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Current (mA) | `input_current_ma` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-On Time (ms) | `turn_on_time_ms` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Turn-Off Time (ms) | `turn_off_time_ms` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Safety Certification | `safety_certification` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Operating Temperature Range | `operating_temp_range` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Package Footprint | `package_footprint` | 7 | Not Asked | ⚠️ NEEDS REVIEW |
| Load Current Min (A) | `load_current_min_a` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| dV/dt Rating (V/µs) | `dv_dt_rating_v_us` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| dI/dt Rating (A/µs) | `di_dt_rating_a_us` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Thermal Resistance Junction-to-Case (°C/W) | `thermal_resistance_jc` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Built-in Snubber | `built_in_snubber` | 6 | Not Asked | ⚠️ NEEDS REVIEW |
| Input Impedance (Ω) | `input_impedance_ohm` | 5 | Not Asked | ⚠️ NEEDS REVIEW |
| Built-in Varistor (MOV/TVS) | `built_in_varistor` | 5 | Not Asked | ⚠️ NEEDS REVIEW |

---

**Total: 823 scored specs across 43 families. 287 asked, 536 not asked.**

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
