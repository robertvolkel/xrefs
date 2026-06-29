# XRefs — Component Families & Attributes

This document lists every component family supported by the cross-reference matching engine, along with all attributes (matching rules) evaluated for each family. It is generated directly from the live logic tables.

- **Generated:** 2026-06-29
- **Total families:** 43
- **Total attributes across all families:** 823

## How to read the "Match Logic" column

| Logic Type | Behavior |
|------------|----------|
| Identity | Exact match required (after normalization / aliases) |
| Identity range | Replacement value range must overlap the original's range |
| Identity upgrade | Match or a strictly superior variant per a defined hierarchy |
| Identity flag | Boolean gate — if the original requires it, the replacement must have it too |
| Threshold | Numeric comparison: replacement ≥, ≤, or range ⊇ original |
| Fit | Physical/dimensional constraint — replacement must fit (≤) |
| Application review | Cannot be automated; flagged for human review |
| Operational | Non-electrical info (packaging, supply-chain) |
| Vref check | Cross-attribute Vref→Vout recalculation with ±2% tolerance |

**Weight** is the rule's relative importance (0–10) used in scoring.

## Families

- **12** — Ceramic Capacitors – MLCC (Surface Mount) _(Passives, 14 attributes)_
- **13** — Mica Capacitors (Silver Mica) _(Passives, 13 attributes)_
- **52** — Chip Resistors (Surface Mount) _(Passives, 13 attributes)_
- **53** — Through-Hole Resistors _(Passives, 16 attributes)_
- **54** — Current Sense Resistors _(Passives, 16 attributes)_
- **55** — Chassis Mount / High Power Resistors _(Passives, 16 attributes)_
- **58** — Aluminum Electrolytic Capacitors _(Passives, 17 attributes)_
- **59** — Tantalum Capacitors _(Passives, 17 attributes)_
- **60** — Aluminum Polymer Capacitors _(Passives, 17 attributes)_
- **61** — Supercapacitors (EDLC / Ultracapacitors) _(Passives, 18 attributes)_
- **64** — Film Capacitors _(Passives, 19 attributes)_
- **65** — Varistors / Metal Oxide Varistors (MOVs) _(Passives, 16 attributes)_
- **66** — PTC Resettable Fuses (PolyFuses) _(Passives, 15 attributes)_
- **67** — NTC Thermistors _(Passives, 15 attributes)_
- **68** — PTC Thermistors _(Passives, 15 attributes)_
- **69** — Common Mode Chokes / Filters _(Passives, 17 attributes)_
- **70** — Ferrite Beads (Surface Mount) _(Passives, 14 attributes)_
- **71** — Power Inductors (Surface Mount) _(Passives, 17 attributes)_
- **72** — RF / Signal Inductors _(Passives, 19 attributes)_
- **B1** — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery _(Discrete Semiconductors, 23 attributes)_
- **B2** — Schottky Barrier Diodes _(Discrete Semiconductors, 22 attributes)_
- **B3** — Zener Diodes / Voltage Reference Diodes _(Discrete Semiconductors, 22 attributes)_
- **B4** — TVS Diodes — Transient Voltage Suppressors _(Discrete Semiconductors, 23 attributes)_
- **B5** — MOSFETs — N-Channel & P-Channel _(Discrete Semiconductors, 27 attributes)_
- **B6** — BJTs — NPN & PNP _(Discrete Semiconductors, 18 attributes)_
- **B7** — IGBTs — Insulated Gate Bipolar Transistors _(Discrete Semiconductors, 25 attributes)_
- **B8** — Thyristors / TRIACs / SCRs _(Discrete Semiconductors, 22 attributes)_
- **B9** — JFETs — Junction Field-Effect Transistors _(Discrete Semiconductors, 17 attributes)_
- **C1** — Linear Voltage Regulators (LDOs) _(Integrated Circuits, 22 attributes)_
- **C2** — Switching Regulators (DC-DC Converters & Controllers) _(Integrated Circuits, 22 attributes)_
- **C3** — Gate Drivers (MOSFET / IGBT / SiC / GaN) _(Integrated Circuits, 22 attributes)_
- **C4** — Op-Amps / Comparators / Instrumentation Amplifiers _(Integrated Circuits, 24 attributes)_
- **C5** — Logic ICs — 74-Series Standard Logic _(Integrated Circuits, 24 attributes)_
- **C6** — Voltage References _(Integrated Circuits, 19 attributes)_
- **C7** — Interface ICs (RS-485, CAN, I2C, USB) _(Integrated Circuits, 22 attributes)_
- **C8** — Timers and Oscillators (555 / XO / MEMS / TCXO / VCXO / OCXO) _(Integrated Circuits, 22 attributes)_
- **C9** — ADCs — Analog-to-Digital Converters _(Integrated Circuits, 20 attributes)_
- **C10** — DACs — Digital-to-Analog Converters _(Integrated Circuits, 22 attributes)_
- **D1** — Crystals — Quartz Resonators _(Passives, 18 attributes)_
- **D2** — Fuses — Traditional Overcurrent Protection _(Passives, 14 attributes)_
- **E1** — Optocouplers / Photocouplers _(Discrete Semiconductors, 23 attributes)_
- **F1** — Electromechanical Relays (EMR) _(Relays, 23 attributes)_
- **F2** — Solid State Relays (SSR) _(Relays, 23 attributes)_

## Family Details

### 12 — Ceramic Capacitors – MLCC (Surface Mount)

- **Category:** Passives
- **Attributes (rules):** 14
- **Logic last updated:** 2026-02-11
- **Description:** Hard logic filters for MLCC replacement part validation

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | A 100nF capacitor must be replaced by a 100nF capacitor. Ensure values are normalized before comparison. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | The replacement must match the original footprint exactly. MLCC pad geometries differ across sizes and are not interchangeable without a board redesign. |
| 3 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 9 | The replacement must handle at least the same voltage. Caution: higher voltage-rated MLCCs may exhibit different DC bias derating. |
| 4 | Dielectric / Temperature Characteristic | `dielectric` | Identity upgrade (match or superior) | 9 | Dielectrics have a strict hierarchy. Class I (C0G/NP0) is most stable. You can upgrade (X5R→X7R) but never downgrade. _(Hierarchy best→worst: C0G > X7R > X7S > X6S > X5R > Y5V > Z5U)_ _(Aliases: C0G≡NP0)_ |
| 5 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 7 | A tighter tolerance is always acceptable. ±5% can replace ±10%, but not vice versa. |
| 6 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 8 | The replacement must cover at least the full operating range of the original. |
| 7 | Height (Seated Max) | `height` | Fit (physical ≤) | 6 | Critical for tight enclosures, stacked PCBs, and low-profile designs. A taller part may not fit. |
| 8 | ESR | `esr` | Threshold (replacement ≤ original) | 5 | Lower ESR is generally better for decoupling and filtering. |
| 9 | ESL | `esl` | Threshold (replacement ≤ original) | 5 | Lower ESL improves high-frequency decoupling. |
| 10 | Flexible Termination | `flexible_termination` | Identity flag (boolean gate) | 8 | If original requires flex termination, replacement must also have it. Required on flex-rigid PCBs. |
| 11 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 4 | MSL 1 (unlimited floor life) is best. Lower MSL number is less restrictive and always acceptable. |
| 12 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive/high-reliability. A non-qualified part cannot replace a qualified one. |
| 13 | DC Bias Derating | `dc_bias_derating` | Application review (manual) | 7 | Class II MLCCs lose significant capacitance under DC bias. Different manufacturers can derate differently. Consult DC bias curves. |
| 14 | Packaging | `packaging` | Operational (non-electrical) | 2 | Tape & Reel required for automated pick-and-place. |

### 13 — Mica Capacitors (Silver Mica)

- **Category:** Passives
- **Attributes (rules):** 13
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match exactly. |
| 3 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 9 | Must handle at least the same voltage. |
| 4 | Dielectric Material | `dielectric` | Identity (exact match) | 9 | Silver Mica must match exactly. No Class I/II hierarchy applies. _(Aliases: C0G≡NP0)_ |
| 5 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 7 | Mica capacitors typically have very tight tolerances (≤1%). Tighter is always acceptable. |
| 6 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 8 | Must cover full operating range. |
| 7 | Height (Seated Max) | `height` | Fit (physical ≤) | 6 | Physical clearance. |
| 8 | ESR | `esr` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 9 | ESL | `esl` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 10 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 4 | Lower is less restrictive. |
| 11 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 12 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |
| 13 | Temperature Coefficient | `temperature_coefficient` | Threshold (replacement ≤ original) | 7 | Typically ±50 ppm/°C or better. Primary reason for choosing mica. Lower TC is always better. |

### 52 — Chip Resistors (Surface Mount)

- **Category:** Passives
- **Attributes (rules):** 13
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Resistance | `resistance` | Identity (exact match) | 10 | Must match exactly. E-series values must be normalized. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | 0402, 0603, 0805 etc. have different pad geometries — not interchangeable. |
| 3 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 7 | Tighter tolerance always acceptable. ±1% can replace ±5%, not vice versa. |
| 4 | Power Rating | `power_rating` | Threshold (replacement ≥ original) | 9 | Must handle at least the same power dissipation. |
| 5 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 8 | Must handle at least the same working voltage. |
| 6 | Temperature Coefficient (TCR) | `tcr` | Threshold (replacement ≤ original) | 6 | Lower TCR means better stability over temperature. |
| 7 | Composition / Technology | `composition` | Identity upgrade (match or superior) | 5 | Thin Film > Thick Film. Upgrading always acceptable. _(Hierarchy best→worst: Thin Film > Thick Film)_ |
| 8 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 9 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 10 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 11 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 12 | Anti-Sulfur | `anti_sulfur` | Identity flag (boolean gate) | 7 | Required in harsh environments. If original has it, replacement must too. |
| 13 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 53 — Through-Hole Resistors

- **Category:** Passives
- **Attributes (rules):** 16
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Resistance | `resistance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match. |
| 3 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 7 | Tighter always acceptable. |
| 4 | Power Rating | `power_rating` | Threshold (replacement ≥ original) | 9 | Must handle at least the same power. |
| 5 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 8 | Must handle at least the same voltage. |
| 6 | Temperature Coefficient (TCR) | `tcr` | Threshold (replacement ≤ original) | 6 | Lower TCR is better stability. |
| 7 | Composition / Technology | `composition` | Identity upgrade (match or superior) | 5 | Thin Film > Thick Film. |
| 8 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 9 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 10 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 11 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 12 | Anti-Sulfur | `anti_sulfur` | Identity flag (boolean gate) | 7 | Required in harsh environments. |
| 13 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |
| 14 | Lead Spacing / Pitch | `lead_spacing` | Identity (exact match) | 7 | PCB hole pattern must match. Common: 7.5mm, 10mm, 12.5mm, 15mm. |
| 15 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | Must be axial through-hole. Cannot substitute SMD for through-hole. |
| 16 | Body Length × Diameter | `body_dimensions` | Fit (physical ≤) | 5 | Physical clearance verification. |

### 54 — Current Sense Resistors

- **Category:** Passives
- **Attributes (rules):** 16
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Resistance | `resistance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match. |
| 3 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 9 | Current sense resistors require ≤1% tolerance for accurate measurement. |
| 4 | Power Rating | `power_rating` | Threshold (replacement ≥ original) | 9 | Must handle at least the same power. |
| 5 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 8 | Must handle at least the same voltage. |
| 6 | Temperature Coefficient (TCR) | `tcr` | Threshold (replacement ≤ original) | 8 | Must be ≤50 ppm/°C for measurement stability. |
| 7 | Composition / Technology | `composition` | Identity upgrade (match or superior) | 5 | Thin Film > Thick Film. |
| 8 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 9 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 10 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 11 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 12 | Anti-Sulfur | `anti_sulfur` | Identity flag (boolean gate) | 7 | Required in harsh environments. |
| 13 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |
| 14 | Kelvin (4-Terminal) Sensing | `kelvin_sensing` | Identity flag (boolean gate) | 8 | Separate force/sense pads eliminate lead resistance error. If original has 4-terminal layout, replacement must too. |
| 15 | Power Rating (Pulse) | `power_rating_pulse` | Threshold (replacement ≥ original) | 7 | Short-duration overcurrent surge handling capability. |
| 16 | Inductance (Parasitic) | `parasitic_inductance` | Application review (manual) | 5 | Verify for high-frequency current sensing (>100 kHz). |

### 55 — Chassis Mount / High Power Resistors

- **Category:** Passives
- **Attributes (rules):** 16
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Resistance | `resistance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match. |
| 3 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 7 | Tighter always acceptable. |
| 4 | Power Rating | `power_rating` | Threshold (replacement ≥ original) | 10 | Power rating must be ≥ original, derated at specific mounting surface temperature. Critical for thermal design. |
| 5 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 8 | Must handle at least the same working voltage. |
| 6 | Temperature Coefficient (TCR) | `tcr` | Threshold (replacement ≤ original) | 6 | Lower TCR is better stability. |
| 7 | Composition / Technology | `composition` | Identity upgrade (match or superior) | 5 | Thin Film > Thick Film. |
| 8 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 9 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 10 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 11 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 12 | Anti-Sulfur | `anti_sulfur` | Identity flag (boolean gate) | 7 | Required in harsh environments. |
| 13 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |
| 14 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | TO-220, TO-247, TO-263, bolt-down, or clip mount. Must match exactly. |
| 15 | Thermal Resistance (°C/W) | `thermal_resistance` | Threshold (replacement ≤ original) | 7 | Lower thermal resistance is better for heat transfer to heatsink/chassis. |
| 16 | Heatsink Interface Dimensions | `heatsink_dimensions` | Fit (physical ≤) | 8 | Bolt hole spacing and tab dimensions must match existing heatsink/mounting hardware. |

### 58 — Aluminum Electrolytic Capacitors

- **Category:** Passives
- **Attributes (rules):** 17
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 9 | Must handle at least the same voltage. |
| 3 | Polarization | `polarization` | Identity (exact match) | 9 | Polar and non-polar types are not interchangeable. A polar cap in an AC circuit will fail catastrophically. _(Aliases: Polar≡Polarized≡Unipolar; Bi-Polar≡Bipolar≡Non-Polar)_ |
| 4 | Mounting Type | `mounting_type` | Identity (exact match) | 9 | SMD and through-hole types are not interchangeable without PCB redesign. |
| 5 | Diameter | `diameter` | Fit (physical ≤) | 6 | Must fit within the PCB footprint. |
| 6 | Height | `height` | Fit (physical ≤) | 6 | Must fit within available vertical clearance. |
| 7 | Lead Spacing | `lead_spacing` | Identity (exact match) | 7 | Lead spacing must match for through-hole types. |
| 8 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 5 | Tighter always acceptable. |
| 9 | ESR | `esr` | Threshold (replacement ≤ original) | 7 | Lower ESR is critical for power supply output filtering. |
| 10 | Ripple Current | `ripple_current` | Threshold (replacement ≥ original) | 8 | The #1 reliability parameter for electrolytics in power supplies. |
| 11 | Impedance | `impedance` | Threshold (replacement ≤ original) | 5 | Lower impedance is better for filtering. |
| 12 | Leakage Current | `leakage_current` | Threshold (replacement ≤ original) | 5 | Lower leakage is better. |
| 13 | Lifetime / Endurance | `lifetime` | Threshold (replacement ≥ original) | 7 | Longer lifetime always acceptable. Rated in hours at max temp. |
| 14 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. Every 10°C above rated temp halves the lifetime. |
| 15 | Capacitor Type / Series | `capacitor_type` | Identity upgrade (match or superior) | 4 | Hybrid > Polymer Hybrid > Low ESR > Standard. _(Hierarchy best→worst: Hybrid > Polymer Hybrid > Low ESR > Standard)_ |
| 16 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 17 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 59 — Tantalum Capacitors

- **Category:** Passives
- **Attributes (rules):** 17
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 9 | Tantalum capacitors are particularly sensitive to voltage stress — derating to 50% is common practice. |
| 3 | Package / Case (EIA) | `package_case` | Identity (exact match) | 10 | EIA case size (A/B/C/D/E/V) must match exactly. |
| 4 | Capacitor Type | `capacitor_type` | Identity upgrade (match or superior) | 7 | Polymer > MnO2. Upgrading from MnO₂ to Polymer is generally safe. _(Hierarchy best→worst: Polymer > MnO2)_ |
| 5 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 6 | Tighter always acceptable. |
| 6 | ESR | `esr` | Threshold (replacement ≤ original) | 7 | Lower ESR is better for power filtering. |
| 7 | Ripple Current | `ripple_current` | Threshold (replacement ≥ original) | 7 | Must handle at least the same ripple current. |
| 8 | Leakage Current | `leakage_current` | Threshold (replacement ≤ original) | 5 | Lower leakage is better. |
| 9 | Dissipation Factor | `dissipation_factor` | Threshold (replacement ≤ original) | 5 | Lower dissipation factor means less energy lost as heat. |
| 10 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 11 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 12 | Surge / Inrush Voltage | `surge_voltage` | Application review (manual) | 6 | Surge behavior varies significantly between tantalum types. |
| 13 | Failure Mode (Benign) | `failure_mode` | Identity flag (boolean gate) | 8 | If original specifies benign (open-circuit) failure mode, replacement must also have it. Critical for safety. |
| 14 | DC Bias Derating | `dc_bias_derating` | Application review (manual) | 6 | Tantalum capacitors can lose capacitance under DC bias. |
| 15 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 16 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 17 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 60 — Aluminum Polymer Capacitors

- **Category:** Passives
- **Attributes (rules):** 17
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 9 | Must handle at least the same voltage. |
| 3 | Polarization | `polarization` | Identity (exact match) | 9 | Polar and non-polar types are not interchangeable. |
| 4 | Mounting Type | `mounting_type` | Identity (exact match) | 9 | SMD and through-hole not interchangeable. |
| 5 | Diameter | `diameter` | Fit (physical ≤) | 6 | Must fit within PCB footprint. |
| 6 | Height | `height` | Fit (physical ≤) | 6 | Must fit available clearance. |
| 7 | Lead Spacing | `lead_spacing` | Identity (exact match) | 7 | Lead spacing must match for through-hole types. |
| 8 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 5 | Tighter always acceptable. |
| 9 | ESR | `esr` | Threshold (replacement ≤ original) | 9 | ESR is the primary reason for choosing polymer. Lower is always better. |
| 10 | Ripple Current | `ripple_current` | Threshold (replacement ≥ original) | 9 | Elevated importance for power supply applications. |
| 11 | Impedance | `impedance` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 12 | Leakage Current | `leakage_current` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 13 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 14 | Capacitor Type / Series | `capacitor_type` | Identity upgrade (match or superior) | 4 | Hybrid > Polymer Hybrid > Low ESR > Standard. |
| 15 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 16 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |
| 17 | Conductive Polymer Type | `polymer_type` | Identity (exact match) | 5 | Different polymer types may have different aging characteristics and ESR temperature profiles. |

### 61 — Supercapacitors (EDLC / Ultracapacitors)

- **Category:** Passives
- **Attributes (rules):** 18
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | Must match exactly. Range from mF to thousands of Farads. |
| 2 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 9 | Exceeding voltage rating permanently damages supercapacitors. |
| 3 | Technology / Chemistry | `technology` | Identity upgrade (match or superior) | 7 | Hybrid > EDLC. Upgrading generally safe. _(Hierarchy best→worst: Hybrid > EDLC)_ |
| 4 | ESR | `esr` | Threshold (replacement ≤ original) | 8 | Lower ESR is better for power delivery. |
| 5 | Peak Current | `peak_current` | Threshold (replacement ≥ original) | 6 | Must handle at least the same peak current. |
| 6 | Leakage Current | `leakage_current` | Threshold (replacement ≤ original) | 6 | Lower leakage is better. Critical for backup applications. |
| 7 | Self-Discharge | `self_discharge` | Threshold (replacement ≤ original) | 5 | Lower self-discharge means longer energy retention. |
| 8 | Package / Case | `package_case` | Identity (exact match) | 8 | Package must match for mounting compatibility. |
| 9 | Diameter | `diameter` | Fit (physical ≤) | 5 | Must fit within PCB footprint. |
| 10 | Height | `height` | Fit (physical ≤) | 5 | Must fit available clearance. |
| 11 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 4 | Tighter always acceptable. |
| 12 | Cycle Life | `cycle_life` | Threshold (replacement ≥ original) | 7 | More cycles is always better. |
| 13 | Lifetime / Endurance | `lifetime` | Threshold (replacement ≥ original) | 7 | Longer lifetime always acceptable. |
| 14 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 15 | Capacitance Aging | `cap_aging` | Application review (manual) | 5 | Capacitance degrades over time and cycles. |
| 16 | ESR Aging | `esr_aging` | Application review (manual) | 5 | ESR increases over time and cycles. |
| 17 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 18 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 64 — Film Capacitors

- **Category:** Passives
- **Attributes (rules):** 19
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Capacitance | `capacitance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Voltage Rating (DC) | `voltage_rated_dc` | Threshold (replacement ≥ original) | 9 | Must handle at least the same DC working voltage. |
| 3 | Voltage Rating (AC) | `voltage_rated_ac` | Threshold (replacement ≥ original) | 8 | Must handle at least the same AC voltage. |
| 4 | Dielectric Type | `dielectric_type` | Identity upgrade (match or superior) | 7 | PP > PPS > PEN > PET. Upgrading is safe. _(Hierarchy best→worst: PP > PPS > PEN > PET)_ |
| 5 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 6 | Tighter always acceptable. |
| 6 | Package / Case | `package_case` | Identity (exact match) | 9 | Package must match for PCB footprint compatibility. |
| 7 | Lead Spacing / Pin Pitch | `lead_spacing` | Identity (exact match) | 8 | Lead spacing must match exactly for through-hole parts. |
| 8 | Self-Healing | `self_healing` | Identity flag (boolean gate) | 7 | If original requires self-healing (metallized), replacement must also be self-healing. |
| 9 | Dissipation Factor (tan δ) | `dissipation_factor` | Threshold (replacement ≤ original) | 5 | Lower means less energy lost as heat. |
| 10 | ESR | `esr` | Threshold (replacement ≤ original) | 5 | Lower ESR generally better. |
| 11 | dV/dt Rating | `dv_dt` | Threshold (replacement ≥ original) | 6 | Must handle at least the same voltage slew rate. |
| 12 | Ripple Current | `ripple_current` | Threshold (replacement ≥ original) | 6 | Must handle at least the same ripple current. |
| 13 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 14 | Height | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 15 | Body Length | `body_length` | Fit (physical ≤) | 5 | Must fit available board space. |
| 16 | Safety Rating (X/Y Class) | `safety_rating` | Identity flag (boolean gate) | 9 | If original has X or Y safety rating (e.g., X2, Y2), replacement must have same or better class. Safety critical. |
| 17 | Flammability Rating (UL94) | `flammability` | Identity upgrade (match or superior) | 7 | V-0 > V-1 > V-2 > HB. Never downgrade on safety-critical products. _(Hierarchy best→worst: V-0 > V-1 > V-2 > HB)_ |
| 18 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 19 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 65 — Varistors / Metal Oxide Varistors (MOVs)

- **Category:** Passives
- **Attributes (rules):** 16
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Varistor Voltage (V₁ₘₐ) | `varistor_voltage` | Identity (exact match) | 10 | Primary specification at 1mA DC. Must match exactly — determines clamping threshold. |
| 2 | Clamping Voltage (Vc) | `clamping_voltage` | Threshold (replacement ≤ original) | 9 | Lower clamping voltage is better for downstream component protection. |
| 3 | Maximum Continuous Voltage | `max_continuous_voltage` | Threshold (replacement ≥ original) | 9 | Must handle at least the same continuous voltage. |
| 4 | Energy Rating (Joules) | `energy_rating` | Threshold (replacement ≥ original) | 8 | Higher is always acceptable. |
| 5 | Peak Surge Current (8/20µs) | `peak_surge_current` | Threshold (replacement ≥ original) | 8 | Standard lightning surge waveform rating. Higher always acceptable. |
| 6 | Package / Form Factor | `package_case` | Identity (exact match) | 10 | Radial disc, SMD chip, or block/strap. Must match mounting style exactly. |
| 7 | Disc Diameter (Radial) | `disc_diameter` | Fit (physical ≤) | 6 | Must fit physical space. |
| 8 | Lead Spacing / Pitch | `lead_spacing` | Identity (exact match) | 7 | Must match PCB hole pattern. |
| 9 | Response Time | `response_time` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 10 | Leakage Current | `leakage_current` | Threshold (replacement ≤ original) | 5 | Lower prevents thermal runaway risk. |
| 11 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 12 | Number of Surge Pulses (Lifetime) | `surge_pulse_lifetime` | Threshold (replacement ≥ original) | 6 | More pulses = longer service life. |
| 13 | Safety Rating (UL, IEC) | `safety_rating` | Identity flag (boolean gate) | 8 | If original is certified, replacement must also be certified. |
| 14 | Thermal Disconnect / Fuse | `thermal_disconnect` | Identity flag (boolean gate) | 8 | Required by UL 1449 for certain applications. If original has it, replacement must too. |
| 15 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 16 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 66 — PTC Resettable Fuses (PolyFuses)

- **Category:** Passives
- **Attributes (rules):** 15
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Hold Current (Ihold) | `hold_current` | Identity (exact match) | 10 | Primary specification at 25°C ambient. Too low causes nuisance tripping; too high fails to protect. Must match exactly. |
| 2 | Trip Current (Itrip) | `trip_current` | Threshold (replacement ≤ original) | 9 | Lower trip current = faster protection. |
| 3 | Maximum Voltage (Vmax) | `max_voltage` | Threshold (replacement ≥ original) | 10 | HARD SAFETY LIMIT. Full circuit voltage appears across tripped device. Most common substitution mistake. |
| 4 | Maximum Fault Current (Imax) | `max_fault_current` | Threshold (replacement ≥ original) | 8 | Maximum safe interruption current during dead short. |
| 5 | Time-to-Trip | `time_to_trip` | Threshold (replacement ≤ original) | 7 | Faster is better. |
| 6 | Initial Resistance (R₁) | `initial_resistance` | Threshold (replacement ≤ original) | 6 | Lower = less voltage drop during normal operation. |
| 7 | Post-Trip Resistance (R1max) | `post_trip_resistance` | Application review (manual) | 5 | Resistance creeps up after multiple trip/reset cycles. |
| 8 | Package / Form Factor | `package_case` | Identity (exact match) | 10 | SMD chip, radial leaded, or strap/battery tab. Must match exactly. |
| 9 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Hold/trip currents derate severely with temperature. |
| 10 | Power Dissipation (Tripped State) | `power_dissipation` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 11 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 12 | Endurance (Trip/Reset Cycles) | `endurance_cycles` | Threshold (replacement ≥ original) | 6 | More cycles = longer reliable service. |
| 13 | Safety Rating (UL, TUV, CSA) | `safety_rating` | Identity flag (boolean gate) | 8 | Required for safety-critical overcurrent protection. |
| 14 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 15 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 67 — NTC Thermistors

- **Category:** Passives
- **Attributes (rules):** 15
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Resistance @ 25°C (R25) | `resistance_r25` | Identity (exact match) | 10 | R25 is the primary specification. Must match exactly. |
| 2 | B-Value (B-Constant) | `b_value` | Identity (exact match) | 9 | Defines the R-T curve shape. Even small differences cause significant temperature measurement errors. |
| 3 | R-T Curve Matching | `rt_curve` | Application review (manual) | 8 | Full R-T curve must be compared, not just R25 and B-value. |
| 4 | R25 Tolerance | `r25_tolerance` | Threshold (replacement ≤ original) | 6 | Tighter tolerance always acceptable. |
| 5 | B-Value Tolerance | `b_value_tolerance` | Threshold (replacement ≤ original) | 5 | Tighter always acceptable. |
| 6 | Package / Case | `package_case` | Identity (exact match) | 9 | Package must match. Different packages have different thermal response. |
| 7 | Thermal Time Constant | `thermal_time_constant` | Threshold (replacement ≤ original) | 5 | Faster thermal response acceptable. |
| 8 | Dissipation Constant | `dissipation_constant` | Application review (manual) | 5 | Determines self-heating error. Must review for specific circuit design. |
| 9 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 10 | Maximum Power | `max_power` | Threshold (replacement ≥ original) | 6 | Must handle at least the same power dissipation. |
| 11 | Application Category | `application_category` | Identity (exact match) | 5 | Temperature sensing NTCs and inrush current limiting NTCs are not interchangeable. |
| 12 | Height | `height` | Fit (physical ≤) | 4 | Physical clearance. |
| 13 | Curve Interchangeability | `interchangeability` | Identity flag (boolean gate) | 7 | If original uses standardized R-T curve, replacement should match the same curve standard. |
| 14 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 15 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 68 — PTC Thermistors

- **Category:** Passives
- **Attributes (rules):** 15
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Resistance @ 25°C (R25) | `resistance_r25` | Identity (exact match) | 10 | R25 is the primary specification. Must match exactly. |
| 2 | Curie / Switch Temperature | `curie_temp` | Identity (exact match) | 9 | The Curie temperature is where the PTC exhibits its sharp resistance increase. Must match for proper protection. |
| 3 | R-T Curve Matching | `rt_curve` | Application review (manual) | 8 | Full R-T curve shape determines switching behavior. |
| 4 | R25 Tolerance | `r25_tolerance` | Threshold (replacement ≤ original) | 6 | Tighter always acceptable. |
| 5 | Package / Case | `package_case` | Identity (exact match) | 9 | Package must match. |
| 6 | Maximum Voltage | `max_voltage` | Threshold (replacement ≥ original) | 7 | Must handle at least the same maximum voltage. |
| 7 | Maximum Current | `max_current` | Threshold (replacement ≥ original) | 7 | Must handle at least the same maximum current. |
| 8 | Maximum Power | `max_power` | Threshold (replacement ≥ original) | 6 | Must handle at least the same power dissipation. |
| 9 | Trip Current | `trip_current` | Identity (exact match) | 8 | For resettable fuse PTCs, the trip current must match. |
| 10 | Hold Current | `hold_current` | Threshold (replacement ≥ original) | 7 | Maximum current that won't trigger a trip. |
| 11 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 12 | Height | `height` | Fit (physical ≤) | 4 | Physical clearance. |
| 13 | Curve Interchangeability | `interchangeability` | Identity flag (boolean gate) | 7 | If original uses standardized PTC curve, replacement should match the same standard. |
| 14 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 15 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 69 — Common Mode Chokes / Filters

- **Category:** Passives
- **Attributes (rules):** 17
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Common Mode Impedance | `cm_impedance` | Identity (exact match) | 10 | Primary specification. Must match at the rated frequency. |
| 2 | Common Mode Inductance | `cm_inductance` | Threshold (replacement ≥ original) | 8 | Higher provides better low-frequency noise suppression. |
| 3 | Impedance vs Frequency Curve | `impedance_curve` | Application review (manual) | 8 | Two chokes with the same rated impedance can behave very differently. |
| 4 | Number of Lines | `number_of_lines` | Identity (exact match) | 7 | Number of signal lines must match. |
| 5 | Differential Mode Leakage Inductance | `dm_leakage` | Application review (manual) | 6 | Affects signal integrity. Must review for specific application. |
| 6 | Package / Case | `package_case` | Identity (exact match) | 9 | Footprint must match exactly. |
| 7 | Rated Current | `rated_current` | Threshold (replacement ≥ original) | 9 | Must handle at least the same current. |
| 8 | DC Resistance (DCR) | `dcr` | Threshold (replacement ≤ original) | 7 | Lower DCR means less voltage drop and less power loss. |
| 9 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 7 | Must handle at least the same working voltage. |
| 10 | Insulation Voltage | `insulation_voltage` | Threshold (replacement ≥ original) | 6 | Higher insulation voltage provides better isolation between windings. |
| 11 | Application Type | `application_type` | Identity (exact match) | 5 | Signal-line vs power-line chokes have very different characteristics. |
| 12 | Interface Compliance | `interface_compliance` | Identity flag (boolean gate) | 7 | If original is designed for specific interface (USB, HDMI, Ethernet), replacement must also comply. |
| 13 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 6 | Must cover full range. |
| 14 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 15 | Safety Rating (UL/TUV) | `safety_rating` | Identity flag (boolean gate) | 7 | If original has safety rating, replacement must also have equivalent certification. |
| 16 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 17 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 70 — Ferrite Beads (Surface Mount)

- **Category:** Passives
- **Attributes (rules):** 14
- **Logic last updated:** 2026-02-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Impedance @ 100MHz | `impedance_100mhz` | Identity (exact match) | 10 | Primary specification. Must match the rated impedance at 100MHz. |
| 2 | Impedance vs Frequency Curve | `impedance_curve` | Application review (manual) | 8 | Two beads with the same 100MHz impedance can have very different frequency response shapes. |
| 3 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match exactly. |
| 4 | Rated Current | `rated_current` | Threshold (replacement ≥ original) | 9 | Must handle at least the same current. |
| 5 | DC Resistance (DCR) | `dcr` | Threshold (replacement ≤ original) | 7 | Lower DCR means less voltage drop and less power loss. |
| 6 | Number of Lines | `number_of_lines` | Identity (exact match) | 6 | Single-line vs multi-line ferrite beads are not interchangeable. |
| 7 | Resistance Type | `resistance_type` | Identity (exact match) | 4 | Resistive vs inductive impedance type affects frequency response. |
| 8 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 5 | Tighter always acceptable. |
| 9 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 6 | Must cover full range. |
| 10 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 11 | Voltage Rating | `voltage_rated` | Threshold (replacement ≥ original) | 5 | Must handle at least the same voltage. |
| 12 | Signal Integrity (S-Parameters) | `signal_integrity` | Application review (manual) | 7 | For high-speed data lines, S-parameter matching is critical. |
| 13 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 14 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 71 — Power Inductors (Surface Mount)

- **Category:** Passives
- **Attributes (rules):** 17
- **Logic last updated:** 2026-02-20

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Inductance | `inductance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match exactly. |
| 3 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 6 | Tighter always acceptable. |
| 4 | Saturation Current (Isat) | `saturation_current` | Threshold (replacement ≥ original) | 9 | Must handle at least the same saturation current. Insufficient Isat causes converter instability. |
| 5 | Rated Current (Irms) | `rated_current` | Threshold (replacement ≥ original) | 9 | Must handle at least the same RMS current. Irms is the thermal rating. |
| 6 | DC Resistance (DCR) | `dcr` | Threshold (replacement ≤ original) | 7 | Lower DCR means less I²R loss and less heat. |
| 7 | Core Material | `core_material` | Identity upgrade (match or superior) | 5 | Metal Alloy > Metal Composite > Ferrite. _(Hierarchy best→worst: Metal Alloy > Metal Composite > Ferrite)_ |
| 8 | Shielding | `shielding` | Identity upgrade (match or superior) | 8 | Shielded > Semi-Shielded > Unshielded. Downgrading risks EMI compliance failures. _(Hierarchy best→worst: Shielded > Semi-Shielded > Unshielded)_ |
| 9 | Self-Resonant Frequency (SRF) | `srf` | Threshold (replacement ≥ original) | 5 | Higher SRF ensures inductor operates properly at the switching frequency. |
| 10 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 11 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 12 | AC Resistance (ACR) | `acr` | Threshold (replacement ≤ original) | 4 | Lower AC resistance means less loss at the switching frequency. |
| 13 | Inductance vs DC Bias | `inductance_vs_dc_bias` | Application review (manual) | 7 | Inductance drops as DC current increases. Different core materials have different L vs I curves. |
| 14 | Construction Type | `construction_type` | Identity (exact match) | 4 | Construction affects electrical and thermal characteristics. |
| 15 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 16 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 17 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### 72 — RF / Signal Inductors

- **Category:** Passives
- **Attributes (rules):** 19
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Inductance | `inductance` | Identity (exact match) | 10 | Must match exactly. |
| 2 | Package / Case | `package_case` | Identity (exact match) | 10 | Footprint must match exactly. |
| 3 | Tolerance | `tolerance` | Threshold (replacement ≤ original) | 6 | Tighter always acceptable. |
| 4 | Saturation Current (Isat) | `saturation_current` | Threshold (replacement ≥ original) | 5 | Demoted for RF — signal inductors carry small currents. |
| 5 | Rated Current (Irms) | `rated_current` | Threshold (replacement ≥ original) | 9 | Must handle at least the same RMS current. |
| 6 | DC Resistance (DCR) | `dcr` | Threshold (replacement ≤ original) | 7 | Lower DCR means less I²R loss. |
| 7 | Core Material | `core_material` | Identity (exact match) | 5 | Air core, ceramic core, or thin-film only. NOT ferrite — ferrite has excessive losses at RF. |
| 8 | Shielding | `shielding` | Application review (manual) | 8 | Shielding trade-offs differ at RF — may reduce Q due to eddy currents. |
| 9 | Self-Resonant Frequency (SRF) | `srf` | Threshold (replacement ≥ original) | 8 | Must be ≥10× operating frequency for stable inductive behavior. |
| 10 | Operating Temp Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. |
| 11 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 12 | AC Resistance (ACR) | `acr` | Threshold (replacement ≤ original) | 4 | Lower AC resistance means less loss. |
| 13 | Inductance vs DC Bias | `inductance_vs_dc_bias` | Application review (manual) | 7 | Inductance drops as DC current increases. |
| 14 | Construction Type | `construction_type` | Identity (exact match) | 4 | Construction affects electrical characteristics. |
| 15 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 8 | Required for automotive. |
| 16 | Moisture Sensitivity Level | `msl` | Threshold (replacement ≤ original) | 3 | Lower is less restrictive. |
| 17 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |
| 18 | Q Factor (Quality Factor) | `q_factor` | Threshold (replacement ≥ original) | 9 | PRIMARY specification for RF inductors. Higher Q = lower losses = better selectivity. |
| 19 | Inductance Tolerance | `inductance_tolerance` | Threshold (replacement ≤ original) | 7 | Critical for tuned circuits and filters. Tighter is always better. |

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 23
- **Logic last updated:** 2026-02-19

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Recovery Category | `recovery_category` | Identity upgrade (match or superior) | 10 | Ultrafast > Fast > Standard. Downgrading blocked — standard diode in high-freq switching causes reverse current pulses and thermal failure. _(Hierarchy best→worst: Ultrafast > Fast > Standard)_ |
| 2 | Max Repetitive Peak Reverse Voltage (Vrrm) | `vrrm` | Threshold (replacement ≥ original) | 10 | Primary voltage specification. Higher always safe. |
| 3 | Max DC Blocking Voltage (Vdc) | `vdc` | Threshold (replacement ≥ original) | 8 | Maximum continuous DC reverse voltage. |
| 4 | Average Rectified Forward Current (Io) | `io_avg` | Threshold (replacement ≥ original) | 10 | Primary current specification. |
| 5 | Forward Voltage Drop (Vf) | `vf` | Threshold (replacement ≤ original) | 8 | Lower Vf means lower conduction loss. |
| 6 | Max Surge Forward Current (Ifsm) | `ifsm` | Threshold (replacement ≥ original) | 7 | Startup/inrush current rating. |
| 7 | Reverse Recovery Time (trr) | `trr` | Threshold (replacement ≤ original) | 8 | Most critical switching characteristic. Faster always better for switching. |
| 8 | Reverse Recovery Charge (Qrr) | `qrr` | Threshold (replacement ≤ original) | 7 | Better indicator of switching loss than trr alone. |
| 9 | Recovery Behavior (Soft vs Snappy) | `recovery_behavior` | Application review (manual) | 6 | Snappy recovery generates high di/dt voltage spikes. |
| 10 | Reverse Leakage Current (Ir) | `ir_leakage` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 11 | Junction Capacitance (Cj) | `cj` | Application review (manual) | 4 | Irrelevant at 50/60Hz. At high-freq switching contributes to losses. |
| 12 | Configuration | `configuration` | Identity (exact match) | 10 | Single, Dual Common Cathode, Dual Common Anode, Dual Series, Bridge. Internal wiring determines pin connections — must match exactly. |
| 13 | Package / Form Factor | `package_case` | Identity (exact match) | 10 | Must match PCB footprint. |
| 14 | Pin Configuration / Polarity Marking | `pin_configuration` | Identity (exact match) | 10 | Incorrect polarity = reverse-biased diode = circuit failure. |
| 15 | Thermal Resistance Junction-to-Case | `rth_jc` | Threshold (replacement ≤ original) | 6 | Lower is better. |
| 16 | Thermal Resistance Junction-to-Ambient | `rth_ja` | Threshold (replacement ≤ original) | 5 | Relevant for SMD packages. |
| 17 | Max Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 7 | Higher provides more thermal headroom. |
| 18 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must fully cover original range. |
| 19 | Power Dissipation (Pd) | `pd` | Threshold (replacement ≥ original) | 6 | Useful cross-check for SMD packages. |
| 20 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification for discrete semiconductors. AEC-Q101, not Q200. |
| 21 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | Surface mount vs through-hole — cannot interchange without PCB redesign. |
| 22 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 23 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B2 — Schottky Barrier Diodes

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 22
- **Logic last updated:** 2026-02-24

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Schottky Technology | `schottky_technology` | Identity (exact match) | 10 | Confirms Schottky barrier type. Metal-semiconductor junction — zero reverse recovery, lower Vf but higher leakage. |
| 2 | Max Repetitive Peak Reverse Voltage | `vrrm` | Threshold (replacement ≥ original) | 10 | Primary voltage specification. Silicon Schottky typically ≤200V. SiC extends to 600–1700V. |
| 3 | Average Rectified Forward Current | `io_avg` | Threshold (replacement ≥ original) | 10 | Primary current specification. |
| 4 | Forward Voltage Drop (Vf) | `vf` | Threshold (replacement ≤ original) | 9 | THE dominant specification for Schottky diodes. |
| 5 | Reverse Leakage Current (Ir) | `ir_leakage` | Threshold (replacement ≤ original) | 7 | Schottky Achilles' heel. Rises exponentially with temperature. |
| 6 | Max Surge Forward Current | `ifsm` | Threshold (replacement ≥ original) | 7 | Capacitor inrush and motor start rating. |
| 7 | Junction Capacitance (Cj) | `cj` | Threshold (replacement ≤ original) | 6 | Elevated from App Review — Cj is switching speed limiter for Schottky. |
| 8 | Semiconductor Material (Si vs SiC) | `semiconductor_material` | Identity flag (boolean gate) | 9 | SiC can replace Si but Si CANNOT replace SiC at high voltage. |
| 9 | Configuration | `configuration` | Identity (exact match) | 10 | Single, Dual Common Cathode, Dual Common Anode, Dual Series. Must match exactly. |
| 10 | Package / Form Factor | `package_case` | Identity (exact match) | 10 | Footprint must match. |
| 11 | Pin Configuration / Polarity Marking | `pin_configuration` | Identity (exact match) | 10 | Incorrect polarity = circuit failure. |
| 12 | Thermal Resistance Junction-to-Case | `rth_jc` | Threshold (replacement ≤ original) | 7 | More critical for Schottky due to thermal runaway risk from leakage. |
| 13 | Thermal Resistance Junction-to-Ambient | `rth_ja` | Threshold (replacement ≤ original) | 6 | Important due to Schottky thermal runaway risk. |
| 14 | Max Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 7 | Higher provides more thermal headroom. |
| 15 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must fully cover original range. |
| 16 | Power Dissipation (Pd) | `pd` | Threshold (replacement ≥ original) | 6 | Total dissipation including leakage loss. |
| 17 | Technology (Trench vs Planar) | `technology_trench_planar` | Application review (manual) | 4 | Trench generally an upgrade over planar. |
| 18 | Vf Temperature Coefficient | `vf_tempco` | Application review (manual) | 5 | Critical for parallel operation. Positive tempco at high current = safe sharing; negative at low current = thermal runaway risk. |
| 19 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | SMD vs through-hole — not interchangeable. |
| 20 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 21 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification. AEC-Q101, not Q200. |
| 22 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B3 — Zener Diodes / Voltage Reference Diodes

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 22
- **Logic last updated:** 2026-02-24

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Zener Voltage (Vz) | `vz` | Identity (exact match) | 10 | THE primary specification. Must match exactly. |
| 2 | Zener Voltage Tolerance | `vz_tolerance` | Threshold (replacement ≤ original) | 8 | Tighter tolerance always acceptable. |
| 3 | Power Dissipation (Pd) | `pd` | Threshold (replacement ≥ original) | 9 | Second most important spec after Vz. Determines maximum current. |
| 4 | Dynamic / Differential Impedance | `zzt` | Threshold (replacement ≤ original) | 7 | Key voltage regulation quality metric. Lower = more stable voltage. |
| 5 | Knee Impedance (Zzk) | `zzk` | Application review (manual) | 4 | Matters only when Zener operates at low current. |
| 6 | Temperature Coefficient (TC) | `tc` | Threshold (replacement ≤ original) | 7 | Absolute value comparison. Critical for reference applications. |
| 7 | Zener Test Current (Izt) | `izt` | Identity (exact match) | 8 | Measurement condition at which Vz is specified. Different Izt = Vz values not directly comparable. |
| 8 | Maximum Zener Current (Izm) | `izm` | Threshold (replacement ≥ original) | 6 | Maximum continuous reverse current. Higher is safe. |
| 9 | Reverse Leakage Current (Ir) | `ir_leakage` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 10 | Forward Voltage (Vf) | `vf` | Application review (manual) | 3 | Relevant only in bidirectional clamp circuits. |
| 11 | Junction Capacitance (Cj) | `cj` | Application review (manual) | 4 | Relevant for ESD protection on data lines. |
| 12 | Regulation Type (Zener vs Avalanche) | `regulation_type` | Application review (manual) | 3 | Matters for noise-sensitive applications. |
| 13 | Package / Form Factor | `package_case` | Identity (exact match) | 10 | Footprint must match. |
| 14 | Pin Configuration / Polarity Marking | `pin_configuration` | Identity (exact match) | 10 | Zener operates in REVERSE bias — polarity is critical. |
| 15 | Configuration | `configuration` | Identity (exact match) | 9 | Single, Dual Common Cathode, Dual Series, etc. Must match. |
| 16 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | SMD vs through-hole. |
| 17 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 18 | Thermal Resistance Junction-to-Ambient | `rth_ja` | Threshold (replacement ≤ original) | 6 | Primary thermal metric for Zeners. |
| 19 | Max Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 6 | Higher provides more thermal headroom. |
| 20 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must fully cover original range. |
| 21 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification. AEC-Q101, not Q200. |
| 22 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B4 — TVS Diodes — Transient Voltage Suppressors

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 23
- **Logic last updated:** 2026-02-24

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Polarity (Unidirectional vs Bidirectional) | `polarity` | Identity (exact match) | 10 | First gate. Unidirectional clamps one direction; bidirectional clamps symmetrically. Cannot substitute. |
| 2 | Standoff Voltage (Vrwm) | `vrwm` | Identity (exact match) | 10 | Maximum continuous voltage without conducting. Must match circuit operating voltage exactly. |
| 3 | Breakdown Voltage (Vbr) | `vbr` | Identity (exact match) | 9 | Must be within tolerance of original. Too low = conducts during normal operation; too high = clamping voltage too high. |
| 4 | Clamping Voltage (Vc) | `vc` | Threshold (replacement ≤ original) | 10 | THE most critical protection spec — what the protected circuit actually sees during surge. Lower always better. |
| 5 | Peak Pulse Power (Ppk) | `ppk` | Threshold (replacement ≥ original) | 9 | Must handle larger surges than original. |
| 6 | Peak Pulse Current (Ipp) | `ipp` | Threshold (replacement ≥ original) | 8 | Maximum peak current during surge pulse. |
| 7 | Junction Capacitance (Cj) | `cj` | Threshold (replacement ≤ original) | 8 | Critical for signal-line protection. Lower is better for high-speed lines. |
| 8 | Reverse Leakage Current (Ir) | `ir_leakage` | Threshold (replacement ≤ original) | 5 | Lower is better. |
| 9 | Response Time | `response_time` | Threshold (replacement ≤ original) | 6 | Faster clamping is better. |
| 10 | ESD Rating (IEC 61000-4-2) | `esd_rating` | Threshold (replacement ≥ original) | 7 | Higher withstand always acceptable. |
| 11 | Number of Channels / Lines | `num_channels` | Identity (exact match) | 10 | Single vs array. Channel count must match — different pinout. |
| 12 | Configuration / Topology | `configuration` | Identity (exact match) | 10 | How TVS elements connect internally. Must match exactly. |
| 13 | Package / Form Factor | `package_case` | Identity (exact match) | 10 | Footprint must match. |
| 14 | Pin Configuration / Pinout | `pin_configuration` | Identity (exact match) | 10 | Especially for multi-line arrays. |
| 15 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | SMD vs through-hole. |
| 16 | Thermal Resistance Junction-to-Ambient | `rth_ja` | Threshold (replacement ≤ original) | 5 | Determines cooling rate between pulse events. |
| 17 | Max Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 6 | Higher provides more headroom. |
| 18 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must fully cover original range. |
| 19 | Steady-State Power Dissipation (Pd) | `pd` | Threshold (replacement ≥ original) | 5 | Relevant during sustained overvoltage faults. |
| 20 | Height (Seated Max) | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 21 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification. AEC-Q101, not Q200. |
| 22 | Surge Standard Compliance | `surge_standard` | Identity flag (boolean gate) | 8 | IEC 61000-4-5, ISO 7637, DO-160, GR-1089. If original meets specific standard, replacement must too. |
| 23 | Packaging | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B5 — MOSFETs — N-Channel & P-Channel

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 27
- **Logic last updated:** 2026-02-24

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Channel Type (N-Channel / P-Channel) | `channel_type` | Identity (exact match) | 10 | N-channel and P-channel are fundamentally different topologies. Never substitutable without redesigning gate drive. |
| 2 | Technology (Si / SiC / GaN) | `technology` | Identity flag (boolean gate) | 9 | Si, SiC, and GaN have different gate drive requirements and switching characteristics. |
| 3 | Pin Configuration (G-D-S Order) | `pin_configuration` | Identity (exact match) | 10 | MOSFET pin ordering is not standardized. Swapping gate and drain = short circuit at power-up. |
| 4 | Package / Footprint | `package_case` | Identity (exact match) | 10 | Thermal pad match is critical. DPAK vs D2PAK different pad sizes. |
| 5 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification. AEC-Q101 includes UIS (avalanche) testing. |
| 6 | Drain-Source Voltage (Vds Max) | `vds_max` | Threshold (replacement ≥ original) | 10 | Most fundamental MOSFET rating. Must exceed maximum voltage including transient spikes. |
| 7 | Gate-Source Voltage (Vgs Max) | `vgs_max` | Threshold (replacement ≥ original) | 8 | Maximum gate insulator voltage before oxide breakdown. Permanent failure. |
| 8 | Continuous Drain Current (Id Max) | `id_max` | Threshold (replacement ≥ original) | 10 | Maximum DC current at specified temperature. Compare at relevant operating temperature. |
| 9 | Peak Pulsed Drain Current (Id Pulse) | `id_pulse` | Threshold (replacement ≥ original) | 7 | Covers startup, inrush, and fault transients. |
| 10 | Power Dissipation (Pd Max) | `pd` | Threshold (replacement ≥ original) | 6 | Package thermal capability. |
| 11 | Avalanche Energy (Eas) | `avalanche_energy` | Threshold (replacement ≥ original) | 7 | Energy absorbed during unclamped inductive switching. Lower = reduced fault tolerance. |
| 12 | On-State Resistance (Rds(on)) | `rds_on` | Threshold (replacement ≤ original) | 9 | THE most critical DC performance parameter. Comparison only valid if drive voltage matches. |
| 13 | Gate Threshold Voltage (Vgs(th)) | `vgs_th` | Application review (manual) | 6 | Two failure modes: insufficient drive = not fully on; threshold too low = spurious turn-on. |
| 14 | Total Gate Charge (Qg) | `qg` | Threshold (replacement ≤ original) | 8 | Determines gate driver current and switching losses. |
| 15 | Gate-Drain Charge / Miller Charge (Qgd) | `qgd` | Threshold (replacement ≤ original) | 7 | Dominant switching loss driver in hard-switching topologies. |
| 16 | Gate-Source Charge (Qgs) | `qgs` | Threshold (replacement ≤ original) | 6 | Larger Qgs can cause upper MOSFET false turn-on in half-bridge. |
| 17 | Input Capacitance (Ciss) | `ciss` | Threshold (replacement ≤ original) | 6 | Total gate input load. |
| 18 | Output Capacitance (Coss) | `coss` | Application review (manual) | 7 | Behavior depends on topology. Hard-switching vs resonant ZVS have opposite optimization. |
| 19 | Reverse Transfer Capacitance (Crss) | `crss` | Threshold (replacement ≤ original) | 7 | Drain-gate feedback capacitance. Causes spurious turn-on from dV/dt. |
| 20 | Body Diode Forward Voltage (Vf) | `body_diode_vf` | Threshold (replacement ≤ original) | 6 | Conducts during dead time. SiC body diode Vf is inherently higher (2.5–3.5V). |
| 21 | Body Diode Reverse Recovery Time (trr) | `body_diode_trr` | Threshold (replacement ≤ original) | 8 | One of the most critical and underappreciated MOSFET specs. BLOCKING in synchronous topologies at ≥50kHz. |
| 22 | Thermal Resistance Junction-to-Case | `rth_jc` | Threshold (replacement ≤ original) | 7 | Primary thermal spec for heatsink-mounted devices. |
| 23 | Thermal Resistance Junction-to-Ambient | `rth_ja` | Application review (manual) | 5 | Strongly sensitive to PCB design. |
| 24 | Safe Operating Area (SOA Curves) | `soa` | Application review (manual) | 7 | Required for linear-mode applications. Cannot be reduced to a single number. |
| 25 | Height / Profile | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 26 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | SMD vs through-hole. |
| 27 | Packaging Format | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B6 — BJTs — NPN & PNP

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 18
- **Logic last updated:** 2026-02-25

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Polarity (NPN / PNP) | `polarity` | Identity (exact match) | 10 | NPN and PNP are fundamentally different circuit topologies. Never a drop-in substitution across polarities. |
| 2 | Package / Footprint | `package_case` | Identity (exact match) | 10 | BJT pin ordering is NOT standardized even within named packages. |
| 3 | Vceo Max | `vceo_max` | Threshold (replacement ≥ original) | 9 | Breakdown voltage with open base. Must handle max collector voltage including inductive kickback. |
| 4 | Vces Max | `vces_max` | Threshold (replacement ≥ original) | 7 | Breakdown with shorted base. Higher than Vceo — verify which condition applies. |
| 5 | Vce(sat) Max | `vce_sat` | Threshold (replacement ≤ original) | 8 | On-state voltage drop. BJT equivalent of Rds(on)×Id. |
| 6 | Vbe(sat) Max | `vbe_sat` | Threshold (replacement ≤ original) | 6 | Base-emitter saturation voltage. Affects base drive circuit design. |
| 7 | DC Current Gain (hFE) | `hfe` | Application review (manual) | 8 | Do NOT simply match nominal hFE — it varies with Ic, temperature, and has wide manufacturing spread. Evaluate curve, not single number. |
| 8 | Transition Frequency (ft) | `ft` | Threshold (replacement ≥ original) | 7 | Determines maximum practical switching frequency. |
| 9 | Storage Time (tst) | `tst` | Threshold (replacement ≤ original) | 8 | Most distinctive BJT switching parameter — NO MOSFET equivalent. BLOCKING if not specified at high frequency. |
| 10 | Turn-On Time (ton) | `ton` | Threshold (replacement ≤ original) | 6 | Total time from base drive to Ic at 90%. |
| 11 | Turn-Off Time (toff) | `toff` | Threshold (replacement ≤ original) | 7 | Total time from base removal to Ic at 10%. Dominated by tst. |
| 12 | Continuous Collector Current (Ic Max) | `ic_max` | Threshold (replacement ≥ original) | 10 | Maximum rated continuous collector current. |
| 13 | Power Dissipation (Pd Max) | `pd` | Threshold (replacement ≥ original) | 7 | Must handle at least the same power. |
| 14 | Junction-to-Case Thermal Resistance | `rth_jc` | Threshold (replacement ≤ original) | 7 | Primary thermal spec for power BJTs. |
| 15 | Maximum Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 6 | Higher provides more thermal headroom. |
| 16 | Safe Operating Area (SOA Curves) | `soa` | Application review (manual) | 7 | BJTs have second breakdown (S/B) not present in MOSFETs. Required for linear applications. |
| 17 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification. AEC-Q101, not Q200. |
| 18 | Packaging Format | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B7 — IGBTs — Insulated Gate Bipolar Transistors

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 25
- **Logic last updated:** 2026-02-25

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Channel Type | `channel_type` | Identity (exact match) | 10 | Almost all IGBTs are N-channel. P-channel requires opposite gate drive polarity. |
| 2 | IGBT Technology (PT / NPT / FS) | `igbt_technology` | Identity upgrade (match or superior) | 9 | FS > NPT > PT. CRITICAL in parallel: mixing technologies with different tempco signs causes thermal runaway. _(Hierarchy best→worst: FS > NPT > PT)_ |
| 3 | Co-Packaged Antiparallel Diode | `co_packaged_diode` | Identity flag (boolean gate) | 10 | IGBTs do NOT have a usable intrinsic body diode. In bridge topologies, absence causes freewheeling voltage spikes and destruction. BLOCKING. |
| 4 | Package / Footprint | `package_case` | Identity (exact match) | 10 | IGBT packages not standardized for pin ordering. Swapping gate and collector = short circuit. |
| 5 | Mounting Style | `mounting_style` | Identity (exact match) | 9 | SMD vs through-hole. Thermal dissipation path differs fundamentally. |
| 6 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 8 | Automotive qualification. EV traction also requires IATF 16949. |
| 7 | Collector-Emitter Voltage (Vces Max) | `vces_max` | Threshold (replacement ≥ original) | 10 | Fundamental voltage rating. Standard voltage classes: 600V, 650V, 1200V, 1700V, 3300V, 6500V. |
| 8 | Continuous Collector Current (Ic Max) | `ic_max` | Threshold (replacement ≥ original) | 10 | Maximum continuous collector current. PT has negative tempco — thermal runaway risk. |
| 9 | Peak Pulsed Collector Current (Ic Pulse) | `ic_pulse` | Threshold (replacement ≥ original) | 7 | Motor startup inrush, fault events. |
| 10 | Power Dissipation (Pd Max) | `pd` | Threshold (replacement ≥ original) | 6 | Package thermal capability. |
| 11 | Gate-Emitter Voltage (Vge Max) | `vge_max` | Threshold (replacement ≥ original) | 8 | Maximum gate voltage before oxide breakdown. Standard: ±20V. |
| 12 | Collector-Emitter Saturation Voltage (Vce(sat)) | `vce_sat` | Threshold (replacement ≤ original) | 9 | THE primary on-state performance parameter. Conduction loss is linear in current. |
| 13 | Gate Threshold Voltage (Vge(th)) | `vge_th` | Application review (manual) | 6 | Two failure modes: insufficient drive; threshold too low = Miller-induced parasitic turn-on. |
| 14 | Turn-Off Energy Loss (Eoff) | `eoff` | Threshold (replacement ≤ original) | 9 | THE dominant switching loss parameter — tail current persists after voltage rises. Psw = (Eon+Eoff)×fsw. |
| 15 | Turn-On Energy Loss (Eon) | `eon` | Threshold (replacement ≤ original) | 8 | Includes co-packaged diode reverse recovery contribution. |
| 16 | Turn-On Delay Time (td(on)) | `td_on` | Threshold (replacement ≤ original) | 6 | Determines minimum dead time in bridge topologies. |
| 17 | Turn-Off Delay Time (td(off)) | `td_off` | Threshold (replacement ≤ original) | 6 | Longer td(off) reduces effective duty cycle range. |
| 18 | Fall Time (tf) | `tf` | Threshold (replacement ≤ original) | 6 | Does NOT include tail current. Faster tf = higher dI/dt = larger voltage spikes. |
| 19 | Total Gate Charge (Qg) | `qg` | Threshold (replacement ≤ original) | 7 | Gate driver power and peak current. |
| 20 | Short-Circuit Withstand Time (tsc) | `tsc` | Threshold (replacement ≥ original) | 9 | BLOCKING for motor drive and traction. Must survive longer than desaturation detection response time (~5–10µs). Decreases with temperature. |
| 21 | Junction-to-Case Thermal Resistance | `rth_jc` | Threshold (replacement ≤ original) | 7 | Primary thermal spec. IGBT lifetime strongly dependent on ΔTj. |
| 22 | Maximum Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 6 | Standard: 150°C. High-reliability automotive: 175°C. |
| 23 | Safe Operating Area (SOA Curves) | `soa` | Application review (manual) | 7 | IGBTs share BJT second breakdown susceptibility. Required for fault condition analysis. |
| 24 | Height / Profile | `height` | Fit (physical ≤) | 5 | Physical clearance. |
| 25 | Packaging Format | `packaging` | Operational (non-electrical) | 2 | Assembly process requirement. |

### B8 — Thyristors / TRIACs / SCRs

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 22
- **Logic last updated:** 2026-02-25

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Device Sub-Type (SCR / TRIAC / DIAC) | `device_type` | Identity (exact match) | 10 | SCR (unidirectional), TRIAC (bidirectional), DIAC (gateless trigger) are distinct topologies. Never interchangeable. |
| 2 | Gate Sensitivity Class | `gate_sensitivity` | Identity (exact match) | 8 | Standard / Sensitive / Logic-Level — different IGT requirements. Circuit designed for one may not drive another. |
| 3 | Package / Footprint | `package_case` | Identity (exact match) | 8 | Pin ordering not universally standardized. Swapping gate and main terminal = damage. |
| 4 | Peak Repetitive Off-State Voltage (VDRM / VRRM) | `vdrm` | Threshold (replacement ≥ original) | 9 | Maximum blocking voltage. For 230VAC: minimum 600V (800V preferred). |
| 5 | Non-Repetitive Peak Off-State Voltage | `vdsm` | Threshold (replacement ≥ original) | 5 | Single-event voltage spike withstand. |
| 6 | On-State Current (IT(RMS) for TRIAC / IT(AV) for SCR) | `on_state_current` | Threshold (replacement ≥ original) | 9 | IT(RMS) for TRIACs, IT(AV) for SCRs — these are NOT interchangeable metrics. |
| 7 | Non-Repetitive Surge Current (ITSM) | `itsm` | Threshold (replacement ≥ original) | 7 | Peak current for single half-cycle. Capacitive inrush and motor startup. |
| 8 | Surge Current Integral (I²t) | `i2t` | Threshold (replacement ≥ original) | 6 | Enables fuse coordination. |
| 9 | Gate Trigger Current (IGT) | `igt` | Threshold (replacement ≤ original) | 7 | Minimum gate current to trigger. Verify at minimum ambient temperature — IGT increases 2–3× at −40°C. |
| 10 | Gate Trigger Voltage (VGT) | `vgt` | Threshold (replacement ≤ original) | 5 | Gate-cathode voltage at triggering. |
| 11 | Holding Current (IH) | `ih` | Threshold (replacement ≤ original) | 7 | Minimum current to REMAIN latched. Higher IH causes drop-out under light load. |
| 12 | Latching Current (IL) | `il` | Threshold (replacement ≤ original) | 6 | Minimum current after gate trigger for the device to latch. Higher IL fails with inductive loads. |
| 13 | Critical Rate of Rise of Off-State Voltage (dV/dt) | `dv_dt` | Threshold (replacement ≥ original) | 7 | Prevents false triggering from fast voltage transients. Lower in replacement = false triggering from line transients. |
| 14 | Critical Rate of Rise of On-State Current (di/dt) | `di_dt` | Threshold (replacement ≥ original) | 6 | Maximum current rise at turn-on. Exceeding = localized hotspot = one-cycle destruction. |
| 15 | Gate-Triggered Turn-On Time | `tgt` | Threshold (replacement ≤ original) | 4 | Rarely the binding constraint in AC phase control. |
| 16 | Circuit-Commutated Turn-Off Time (tq) — SCR Only | `tq` | Threshold (replacement ≤ original) | 5 | SCR only. Longer tq limits switching frequency in forced-commutation designs. |
| 17 | Quadrant Operation (TRIAC Only) | `quadrant_operation` | Identity (exact match) | 8 | TRIAC only. Quadrant III+ (MT2 negative, gate positive) typically least sensitive — may not be supported by all TRIACs. |
| 18 | Snubberless Rating (TRIAC Only) | `snubberless` | Identity flag (boolean gate) | 6 | TRIAC only. PCBs designed for snubberless have no snubber footprint — standard TRIAC replacement = random false triggering. |
| 19 | Junction-to-Case Thermal Resistance | `rth_jc` | Threshold (replacement ≤ original) | 5 | Primary thermal spec for heatsinkable packages. |
| 20 | Maximum Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 4 | Higher provides more thermal headroom. |
| 21 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 3 | Automotive qualification. |
| 22 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |

### B9 — JFETs — Junction Field-Effect Transistors

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 17
- **Logic last updated:** 2026-02-25

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Channel Type (N/P) | `channel_type` | Identity (exact match) | 10 | N-channel and P-channel require opposite supply polarities and gate bias. Never a drop-in substitution. |
| 2 | Package / Footprint | `package_case` | Identity (exact match) | 10 | JFET pin ordering varies significantly. Gate and drain swapped = gate junction breakdown. |
| 3 | Pinch-Off Voltage Vp / Vgs(off) | `vp` | Identity range (range overlap) | 10 | Defines bias point and gain. Replacement range must overlap original. Non-overlapping Vp shifts operating point outside designed region. |
| 4 | Drain Saturation Current Idss | `idss` | Identity range (range overlap) | 9 | Maximum drain current at Vgs=0. Replacement range must overlap. |
| 5 | Forward Transconductance gfs / gm | `gfs` | Threshold (replacement ≥ original) | 7 | Determines voltage gain. |
| 6 | Noise Figure NF | `noise_figure` | Threshold (replacement ≤ original) | 8 | THE primary reason JFETs are specified over other transistors. Must verify at operating frequency. |
| 7 | 1/f Noise Corner Frequency | `fc_1f_corner` | Threshold (replacement ≤ original) | 7 | Critical for audio preamplifiers below ~10kHz. Best audio JFETs have fc of 10–100Hz. |
| 8 | Drain-Source Breakdown Voltage Vds | `vds_max` | Threshold (replacement ≥ original) | 8 | Must cover full drain voltage swing. |
| 9 | Gate-Source Breakdown Voltage Vgs | `vgs_max` | Threshold (replacement ≥ original) | 6 | Reverse breakdown of gate junction. |
| 10 | Gate Leakage Current Igss | `igss` | Threshold (replacement ≤ original) | 9 | THE critical specification for electrometer and ultra-high-impedance applications. Roughly doubles every 10°C. |
| 11 | Unity-Gain Frequency ft | `ft` | Threshold (replacement ≥ original) | 6 | Primary frequency specification for RF LNA applications. |
| 12 | Input Capacitance Ciss | `ciss` | Threshold (replacement ≤ original) | 5 | Limits input bandwidth. |
| 13 | Reverse Transfer Capacitance Crss | `crss` | Threshold (replacement ≤ original) | 5 | Primary bandwidth-limiting element via Miller effect. |
| 14 | Maximum Power Dissipation | `pd_max` | Threshold (replacement ≥ original) | 4 | Rarely binding in small-signal applications. |
| 15 | Maximum Junction Temperature | `tj_max` | Threshold (replacement ≥ original) | 4 | Higher provides more headroom. |
| 16 | AEC-Q101 Automotive Qualification | `aec_q101` | Identity flag (boolean gate) | 5 | If original is AEC-Q101, replacement must be too. |
| 17 | Matched Pair Suitability | `matched_pair_review` | Application review (manual) | 0 | Matched-pair applications require separate evaluation. Escalated when context indicates differential application. |

### C1 — Linear Voltage Regulators (LDOs)

- **Category:** Integrated Circuits
- **Attributes (rules):** 22
- **Logic last updated:** 2026-02-26

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Output Type (Fixed / Adjustable / Tracking / Negative) | `output_type` | Identity (exact match) | 10 | BLOCKING. Fixed output LDOs cannot replace adjustable without adding feedback resistors. Negative-output LDOs have inverted control. |
| 2 | Output Voltage Vout | `output_voltage` | Identity (exact match) | 10 | For fixed LDOs: must match exactly. Even 1% mismatch can violate rail tolerance budgets. |
| 3 | Package / Footprint | `package_case` | Identity (exact match) | 10 | Pin ordering for Enable and Output varies between manufacturers in the same package. Swapped pins = damage. |
| 4 | Polarity (Positive / Negative) | `polarity` | Identity (exact match) | 10 | Positive and negative LDOs are fundamentally different topologies. No substitution across polarity types. |
| 5 | Maximum Input Voltage (Vin Max) | `vin_max` | Threshold (replacement ≥ original) | 8 | Must cover highest expected input voltage including startup transients and load-dump. |
| 6 | Minimum Input Voltage (Vin Min / Dropout) | `vin_min` | Threshold (replacement ≤ original) | 7 | Replacement Vin(min) ≤ original. Higher dropout reduces usable battery capacity. |
| 7 | Maximum Output Current (Iout Max) | `iout_max` | Threshold (replacement ≥ original) | 9 | Must meet rated current at worst-case operating temperature. |
| 8 | Dropout Voltage (Vdropout Max) | `vdropout` | Threshold (replacement ≤ original) | 7 | Lower dropout is better. Also determines power dissipation. |
| 9 | Quiescent Current (Iq / Ground Current) | `iq` | Threshold (replacement ≤ original) | 5 | Flows from input to ground regardless of load. Critical for battery-powered designs. |
| 10 | Output Voltage Accuracy (Initial Tolerance) | `vout_accuracy` | Threshold (replacement ≤ original) | 7 | Tighter tolerance always acceptable. |
| 11 | Output Capacitor ESR Compatibility | `output_cap_compatibility` | Identity flag (boolean gate) | 8 | CRITICAL — #1 LDO substitution failure mode. ESR-stabilized LDOs oscillate with ceramic caps. Ceramic-stable LDOs work with any cap. |
| 12 | PSRR | `psrr` | Application review (manual) | 6 | Frequency-dependent. Must verify at switching frequency when post-regulating a switcher. |
| 13 | Load Regulation | `load_regulation` | Threshold (replacement ≤ original) | 5 | Tighter is better. |
| 14 | Line Regulation | `line_regulation` | Threshold (replacement ≤ original) | 4 | Tighter is better. |
| 15 | Enable Pin (Active High / Active Low / Absent) | `enable_pin` | Identity (exact match) | 8 | Polarity and presence must match. Swapped polarity inverts behavior. |
| 16 | Power-Good / Flag Pin | `power_good` | Identity flag (boolean gate) | 6 | If original has PG, replacement must too. Used for power sequencing and fault monitoring. |
| 17 | Soft-Start | `soft_start` | Identity flag (boolean gate) | 5 | Limits inrush current at power-up. Absence may trip upstream OCP on large output capacitor banks. |
| 18 | Thermal Shutdown | `thermal_shutdown` | Identity flag (boolean gate) | 6 | Prevents thermal runaway during overload. Its absence increases fault risk. |
| 19 | Thermal Resistance (Rθja / Rθjc) | `rth_ja` | Threshold (replacement ≤ original) | 6 | Lower is better. |
| 20 | Maximum Junction Temperature (Tj Max) | `tj_max` | Threshold (replacement ≥ original) | 7 | Higher provides more thermal margin. |
| 21 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 8 | Automotive qualification for ICs. AEC-Q100, not Q200. |
| 22 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |

### C2 — Switching Regulators (DC-DC Converters & Controllers)

- **Category:** Integrated Circuits
- **Attributes (rules):** 22
- **Logic last updated:** 2026-02-26

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant) | `topology` | Identity (exact match) | 10 | BLOCKING. Topology determines fundamental circuit structure. No substitution across topologies without complete redesign. |
| 2 | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | `architecture` | Identity (exact match) | 10 | BLOCKING. Integrated-switch includes on-chip MOSFET. Controller-only drives external FETs. Swapping leaves connections floating. |
| 3 | Package / Footprint | `package_case` | Identity (exact match) | 10 | Pin ordering for Vin, SW, COMP, FB, SS, Sync, PG, BST not standardized across manufacturers. SW pin carries high-frequency current — exact footprint critical. |
| 4 | Control Mode | `control_mode` | Identity (exact match) | 9 | Different control modes require fundamentally different compensation networks. Substituting = unstable loop. |
| 5 | Output Polarity | `output_polarity` | Identity (exact match) | 10 | Positive, negative, and isolated converters have different feedback, reference, and compensation configurations. |
| 6 | Minimum Input Voltage (Vin Min) | `vin_min` | Threshold (replacement ≤ original) | 7 | Replacement Vin(min) ≤ original. |
| 7 | Maximum Input Voltage (Vin Max) | `vin_max` | Threshold (replacement ≥ original) | 8 | Must cover maximum expected input voltage including load-dump and overshoot. |
| 8 | Output Voltage Range | `vout_range` | Threshold (replacement range ⊇ original) | 8 | Replacement Vout range must include the target output voltage. |
| 9 | Maximum Output Current / Switch Current Limit | `iout_max` | Threshold (replacement ≥ original) | 9 | For controller-only: current sense threshold must match existing sense resistor. |
| 10 | Switching Frequency (fsw) | `fsw` | Identity (exact match) (±10%) | 8 | Determines inductor and capacitor values. Beyond ±10%, existing passives need verification. |
| 11 | Minimum On-Time / Off-Time | `ton_min` | Threshold (replacement ≤ original) | 7 | Limits achievable duty cycle. Critical for high step-down ratios (12V→1V). |
| 12 | Gate Drive Voltage / Current (Controller-Only) | `gate_drive_current` | Threshold (replacement ≥ original) | 7 | Lower gate drive = slower transitions = higher switching losses. |
| 13 | Feedback Reference Voltage (Vref) | `vref` | Vref check (cross-attribute recalc) | 9 | Different Vref with unchanged feedback resistors silently changes output voltage. Engine computes corrected Rbot. |
| 14 | Compensation Type | `compensation_type` | Identity flag (boolean gate) | 8 | External compensation (COMP pin) vs internal. Mixing types = unstable loop. |
| 15 | Soft-Start | `soft_start` | Identity flag (boolean gate) | 6 | External Css pin vs internal fixed. Absent soft-start causes full-rate output ramp. |
| 16 | Enable / UVLO Pin Polarity | `enable_uvlo` | Identity flag (boolean gate) | 7 | Polarity and UVLO threshold must match. Different threshold changes turn-on voltage. |
| 17 | Overcurrent Protection Mode | `ocp_mode` | Identity flag (boolean gate) | 6 | Hiccup / Foldback / Latch / Constant current. Determines fault behavior. |
| 18 | Thermal Shutdown Threshold | `thermal_shutdown` | Threshold (replacement ≥ original) | 6 | Higher threshold provides more thermal margin before auto-shutdown. |
| 19 | Thermal Resistance (Rθja / Rθjc) | `rth_ja` | Threshold (replacement ≤ original) | 6 | Lower is better. |
| 20 | Maximum Junction Temperature (Tj Max) | `tj_max` | Threshold (replacement ≥ original) | 7 | Higher provides more thermal margin. |
| 21 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 8 | Automotive qualification for ICs. AEC-Q100, not Q200. |
| 22 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |

### C3 — Gate Drivers (MOSFET / IGBT / SiC / GaN)

- **Category:** Integrated Circuits
- **Attributes (rules):** 22
- **Logic last updated:** 2026-02-26

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Driver Configuration (Single / Dual / Half-Bridge / Full-Bridge) | `driver_configuration` | Identity (exact match) | 10 | BLOCKING. Half-bridge has complementary high-side + low-side with dead-time and bootstrap. Substituting a half-bridge for a dual leaves bootstrap without a partner switch. |
| 2 | Isolation Type | `isolation_type` | Identity (exact match) | 10 | BLOCKING. Galvanic isolation (transformer, optocoupler, digital isolator) cannot be replaced by non-isolated bootstrap in safety-rated equipment. |
| 3 | Package / Footprint | `package_case` | Identity (exact match) | 10 | Half-bridge driver pin assignments (VS, VB, HO, LO, HIN, LIN, SD) vary significantly even in the same SOIC-8 footprint. No universal standard. |
| 4 | Input Logic Threshold | `input_logic_threshold` | Identity (exact match) | 8 | Must be compatible with driving logic voltage. VDD-referenced threshold at 12V VDD is ~6V — above 5V logic level. |
| 5 | Output Polarity (Non-Inverting / Inverting) | `output_polarity` | Identity flag (boolean gate) | 9 | Inverted polarity in half-bridge causes simultaneous conduction = instant shoot-through. BLOCKING for half-bridge. |
| 6 | Peak Source Current (Ipeak+, Turn-On) | `peak_source_current` | Threshold (replacement ≥ original) | 8 | Lower current = slower turn-on = higher switching losses. |
| 7 | Peak Sink Current (Ipeak-, Turn-Off) | `peak_sink_current` | Threshold (replacement ≥ original) | 8 | Insufficient sink current slows gate discharge. Increases shoot-through risk in half-bridge. |
| 8 | Gate Drive Supply VDD Range | `vdd_range` | Threshold (replacement range ⊇ original) | 8 | Must include actual gate supply. Wrong VDD = wrong Vgs = wrong Rds(on). |
| 9 | Propagation Delay tpd | `propagation_delay` | Threshold (replacement ≤ original) | 7 | Additional delay reduces effective dead-time. May only appear at temperature extremes. |
| 10 | Rise / Fall Time tr/tf | `rise_fall_time` | Threshold (replacement ≤ original) | 6 | Slower transitions increase switching losses. |
| 11 | Dead-Time Control | `dead_time_control` | Identity flag (boolean gate) | 7 | Half-bridge: replacement must have dead-time control if original did. Absent dead-time = shoot-through. |
| 12 | Dead-Time Duration | `dead_time` | Threshold (replacement ≥ original) | 7 | Shorter dead-time + slow IGBT tail current = shoot-through risk at high temperature. |
| 13 | Under-Voltage Lockout Threshold (UVLO) | `uvlo` | Threshold (replacement ≤ original) | 7 | Prevents gate drive output when VDD insufficient for full FET enhancement. Higher UVLO = later startup. |
| 14 | Shutdown / Enable Pin | `shutdown_enable` | Identity flag (boolean gate) | 6 | If original has SD/EN pin, replacement must have one with matching polarity. |
| 15 | Bootstrap Diode (Internal / External Required) | `bootstrap_diode` | Identity flag (boolean gate) | 6 | If original has integrated bootstrap diode, replacement must too or external must be on PCB. |
| 16 | Fault Reporting / FAULT Pin | `fault_reporting` | Identity flag (boolean gate) | 5 | If system uses FAULT output for monitoring, replacement must have compatible FAULT pin. |
| 17 | Thermal Resistance Rθja | `rth_ja` | Threshold (replacement ≤ original) | 6 | Lower is better. |
| 18 | Maximum Junction Temperature (Tj Max) | `tj_max` | Threshold (replacement ≥ original) | 7 | Higher provides more thermal margin. |
| 19 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 8 | Automotive qualification for ICs. AEC-Q100, not Q200. |
| 20 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |
| 21 | Input-Side Logic Supply Range (VCCI / VDDI) | `input_vdd_range` | Threshold (replacement range ⊇ original) | 5 | For isolated gate drivers only — the input-side supply that powers controller-facing logic. N/A on non-isolated bootstrap drivers. |
| 22 | Isolation Withstand Voltage (kVrms) | `isolation_voltage` | Threshold (replacement ≥ original) | 9 | For isolated gate drivers only — safety-critical. Never downgrade. Typical: 2.5 / 3.0 / 3.75 / 5.0 / 5.7 kVrms. N/A on non-isolated bootstrap drivers. |

### C4 — Op-Amps / Comparators / Instrumentation Amplifiers

- **Category:** Integrated Circuits
- **Attributes (rules):** 24
- **Logic last updated:** 2026-02-26

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Device Type (Op-Amp / Comparator / Instrumentation Amplifier) | `device_type` | Identity (exact match) | 10 | BLOCKING. Comparator in feedback loop = zero phase margin = oscillation. Op-amp as comparator = slow recovery from saturation. InAmp cannot be substituted with standard op-amp. |
| 2 | Number of Channels (Single / Dual / Quad) | `channels` | Identity (exact match) | 10 | BLOCKING. Single/dual/quad packages have completely different pinouts. |
| 3 | Package / Footprint | `package_case` | Identity (exact match) | 10 | Even within SOIC-8, pinouts vary between device types and manufacturers. |
| 4 | Input Stage Technology (CMOS / JFET / Bipolar) | `input_type` | Identity upgrade (match or superior) | 9 | CMOS > JFET > Bipolar. CMOS can replace JFET or Bipolar; Bipolar replacing CMOS = Ib×Rs offset error. _(Hierarchy best→worst: CMOS > JFET > Bipolar)_ |
| 5 | Output Type (Push-Pull / Open-Drain / Open-Collector) | `output_type` | Identity (exact match) | 8 | Open-drain replacing push-pull: must add pull-up resistor. Push-pull replacing open-drain: existing pull-up causes short-to-supply when output drives high. |
| 6 | Rail-to-Rail Input (RRI) | `rail_to_rail_input` | Identity flag (boolean gate) | 8 | BLOCKING mismatch if source has RRI and replacement does not. Without RRI, input may clip or exhibit phase reversal near rails. |
| 7 | Rail-to-Rail Output (RRO) | `rail_to_rail_output` | Identity flag (boolean gate) | 8 | Independent from RRI — validate separately. Non-RRO devices saturate 0.5–2V from rails. |
| 8 | Supply Voltage Range | `supply_voltage` | Threshold (replacement range ⊇ original) | 8 | Must contain actual supply voltage. |
| 9 | Input Common-Mode Voltage Range (VICM) | `vicm_range` | Threshold (replacement range ⊇ original) | 9 | BLOCKING — phase reversal risk if VICM exceeded. Input clips or output latches to rail. |
| 10 | Gain Bandwidth Product (GBW) | `gain_bandwidth` | Threshold (replacement ≥ original) | 8 | f_max = GBW / Acl. Lower GBW = reduced bandwidth and destabilized feedback. |
| 11 | Slew Rate (V/µs) | `slew_rate` | Threshold (replacement ≥ original) | 7 | Insufficient slew rate causes triangularization of sine waves. |
| 12 | Input Offset Voltage Vos (Max) | `input_offset_voltage` | Threshold (replacement ≤ original) | 7 | Appears at output amplified by closed-loop gain. |
| 13 | Input Bias Current Ib (Max) | `input_bias_current` | Threshold (replacement ≤ original) | 7 | Ib × Rs = offset voltage. BLOCKING for Rs > 100kΩ with bipolar input. |
| 14 | Input Noise Voltage Density en (nV/√Hz) | `input_noise_voltage` | Threshold (replacement ≤ original) | 6 | Total input noise = sqrt(en² + (in×Rs)²). |
| 15 | Open-Loop Voltage Gain Avol (dB) | `avol` | Threshold (replacement ≥ original) | 5 | Closed-loop gain error ≈ 100% / (Avol × β). |
| 16 | Common-Mode Rejection Ratio CMRR (dB) | `cmrr` | Threshold (replacement ≥ original) | 5 | Higher CMRR rejects common-mode interference better. |
| 17 | Power Supply Rejection Ratio PSRR (dB) | `psrr` | Threshold (replacement ≥ original) | 5 | Higher PSRR means less supply noise at output. |
| 18 | Minimum Stable Gain (V/V) | `min_stable_gain` | Threshold (replacement ≤ original) | 8 | CRITICAL. Decompensated op-amp in unity-gain buffer WILL oscillate. BLOCKING when circuit operates below minimum stable gain. |
| 19 | Quiescent Current per Channel (Iq) | `iq` | Threshold (replacement ≤ original) | 5 | Lower is better for battery-powered designs. |
| 20 | Response Time / Propagation Delay (Comparator) | `response_time` | Threshold (replacement ≤ original) | 7 | Comparator only. Faster response allows higher frequency operation. |
| 21 | Output Current Drive | `output_current` | Threshold (replacement ≥ original) | 6 | Must drive the intended load while maintaining output swing spec. |
| 22 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. All parameters degrade with temperature. |
| 23 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 8 | Automotive qualification for ICs. Grade number determines Tj range — higher grade number cannot substitute for lower. |
| 24 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |

### C5 — Logic ICs — 74-Series Standard Logic

- **Category:** Integrated Circuits
- **Attributes (rules):** 24
- **Logic last updated:** 2026-02-28

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Logic Function (Part Number Suffix) | `logic_function` | Identity (exact match) | 10 | BLOCKING. '04 ≠ '14 (Schmitt trigger). '373 ≠ '374. No cross-function substitution ever valid. |
| 2 | Number of Gates / Sections / Bits | `gate_count` | Identity (exact match) | 10 | BLOCKING. Dual ≠ quad — different pin counts and assignments. |
| 3 | Package / Footprint | `package_case` | Identity (exact match) | 10 | Single-gate packages (SC70-5, SOT-23-5) have non-standard pinouts incompatible with multi-gate packages. |
| 4 | Output Type (Totem-pole / Open-drain / 3-state) | `output_type` | Identity flag (boolean gate) | 8 | Totem-pole cannot replace open-drain on wired-AND bus — destroys driving outputs. |
| 5 | 3-State Output Enable (OE) Polarity | `oe_polarity` | Identity flag (boolean gate) | 9 | BLOCKING for 3-state devices. Wrong polarity = permanently enabled or permanently disabled. |
| 6 | Output High Voltage (VOH) | `voh` | Threshold (replacement ≥ original) | 7 | VOH_min must exceed downstream VIH_min. |
| 7 | Output Low Voltage (VOL) | `vol` | Threshold (replacement ≤ original) | 6 | VOL_max must stay below downstream VIL_max. |
| 8 | Output Drive Current (IOH / IOL) | `drive_current` | Threshold (replacement ≥ original) | 7 | Determines fan-out capability. LVC (24mA) vs HC (4mA) significantly different. |
| 9 | Schmitt Trigger Input | `schmitt_trigger` | Identity flag (boolean gate) | 7 | If original has Schmitt inputs, replacement must too for slow-edged or noisy inputs. |
| 10 | Input High Threshold (VIH) | `vih` | Threshold (replacement ≤ original) | 7 | THE HC/HCT substitution trap. TTL VOH_min=2.4V cannot drive HC VIH=3.5V. |
| 11 | Input Low Threshold (VIL) | `vil` | Threshold (replacement ≥ original) | 6 | Driving source VOL_max must be below replacement VIL_max. |
| 12 | Input Clamp Diodes | `input_clamp_diodes` | Identity flag (boolean gate) | 4 | LVC achieves 5V tolerance by blocking Vcc-side clamp diode. HC replacing LVC in 5V-signal-receiving application = forward-biased clamp = Vcc rail injection. |
| 13 | Input Leakage Current (IIH / IIL) | `input_leakage` | Threshold (replacement ≤ original) | 4 | Matters for fan-out calculation and open-drain bus pull-up sizing. |
| 14 | Bus Hold / Weak Pull-up | `bus_hold` | Identity flag (boolean gate) | 5 | If original has bus hold and replacement does not, floating inputs from tri-stated masters are undefined. |
| 15 | Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | `logic_family` | Application review (manual) | 7 | Cross-family substitution requires four-way interface compatibility check. Never assume same-function different-family are drop-in compatible. |
| 16 | Supply Voltage Range (Vcc) | `supply_voltage` | Threshold (replacement range ⊇ original) | 8 | Below Vcc_min: undefined logic. Above Vcc_max: oxide breakdown. HCT restricted to 4.5–5.5V — using at 3.3V is a hard block. |
| 17 | Propagation Delay (tpd) | `tpd` | Threshold (replacement ≤ original) | 7 | Sets maximum usable frequency in timing-critical paths. Varies 5× across supply voltage range. |
| 18 | Maximum Operating Frequency (fmax) | `fmax` | Threshold (replacement ≥ original) | 6 | For clocked logic. Degrades dramatically at lower Vcc. |
| 19 | Output Transition Time (tr / tf) | `transition_time` | Application review (manual) | 4 | Faster edges increase EMI. Slower edges may violate timing. |
| 20 | Setup Time / Hold Time | `setup_hold_time` | Application review (manual) | 6 | Longer hold-time requirement can introduce violations not present in original design. Cannot be fixed by slowing clock. |
| 21 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Worst-case tpd at lowest Vcc AND highest temperature. |
| 22 | AEC-Q100 Automotive Qualification | `aec_q100` | Identity flag (boolean gate) | 8 | Grade 0 (150°C) cannot be replaced by Grade 1 (125°C). |
| 23 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |
| 24 | Max I2C Bus Clock Speed (kHz) | `i2c_bus_speed_max_khz` | Threshold (replacement ≥ original) | 5 | For I2C bus interface ICs. Standard=100kHz, Fast=400kHz, Fm+=1000kHz. Missing on non-I2C C5 parts is expected — treated as review. |

### C6 — Voltage References

- **Category:** Integrated Circuits
- **Attributes (rules):** 19
- **Logic last updated:** 2026-03-01

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Configuration (Series / Shunt) | `configuration` | Identity (exact match) | 10 | BLOCKING. Series references drive output from error amplifier. Shunt references clamp in parallel via external series resistor. Architecturally incompatible without circuit modification. |
| 2 | Output Voltage (Vout) | `output_voltage` | Identity (exact match) | 10 | Must match exactly. Standard values: 1.2V, 2.048V, 2.500V, 3.000V, 4.096V, 5.000V, 10.000V. |
| 3 | Reference Architecture (Band-gap / Buried Zener / XFET) | `architecture` | Identity (exact match) | 7 | Architecture determines TC curve shape. Band-gap (parabolic) and buried Zener (more linear) are not interchangeable in systems with TC compensation. |
| 4 | Output Voltage Adjustability (Fixed / Adjustable / Trimmable) | `adjustability` | Identity (exact match) | 8 | Fixed vs adjustable vs trimmable. Loss of trim pin = loss of calibration offset. |
| 5 | TC/Accuracy Grade (Suffix) | `tc_accuracy_grade` | Identity flag (boolean gate) | 7 | Most families encode both initial accuracy and TC in a single suffix. Substituting lower grade relaxes BOTH parameters. |
| 6 | AEC-Q100 Automotive Qualification | `aec_q100` | Identity flag (boolean gate) | 3 | Automotive qualification for ICs. AEC-Q100, not Q200. |
| 7 | Enable/Shutdown Pin Polarity | `enable_shutdown_polarity` | Identity (exact match) | 8 | Polarity mismatch is fatal in BOTH directions — active-low shutdown vs active-high enable. |
| 8 | Initial Accuracy (%) | `initial_accuracy` | Threshold (replacement ≤ original) | 8 | Tighter always acceptable. Directly degrades system gain error floor. |
| 9 | Temperature Coefficient (ppm/°C) | `tc` | Threshold (replacement ≤ original) | 8 | Dominant error source over temperature. Lower is always better. |
| 10 | Output Voltage Noise (0.1–10 Hz µVrms) | `output_noise` | Threshold (replacement ≤ original) | 6 | Reference noise adds directly to ADC noise floor and cannot be averaged away. |
| 11 | Long-Term Stability (ppm/1000h) | `long_term_stability` | Threshold (replacement ≤ original) | 4 | Band-gap: 25–100 ppm/1000h. Buried Zener: 0.5–5 ppm/1000h. |
| 12 | Dropout Voltage | `dropout_voltage` | Threshold (replacement ≤ original) | 7 | Vin_min = Vout + Vdropout. Must verify supply can maintain regulation. |
| 13 | Quiescent Current (Iq) | `quiescent_current` | Threshold (replacement ≤ original) | 5 | Lower is better for battery-powered designs. For shunt: Ika_min determines external resistor design. |
| 14 | Output Current / Load Current | `output_current` | Threshold (replacement ≥ original) | 5 | Must supply full load current while maintaining accuracy. |
| 15 | Input Voltage Range | `input_voltage_range` | Threshold (replacement range ⊇ original) | 7 | Must contain actual supply voltage including transients. |
| 16 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 6 | TC specifications guaranteed only over rated range. |
| 17 | Output Noise Filtering (NR Pin) | `nr_pin` | Application review (manual) | 4 | If original has NR pin and replacement lacks one, low-pass filtering is lost. Noise reverts to unfiltered specification (10–20× worse). |
| 18 | Package / Footprint | `package_case` | Application review (manual) | 5 | SOT-23-3 and SOT-23-5 have DIFFERENT footprints despite similar outlines. |
| 19 | Packaging Format | `packaging` | Operational (non-electrical) | 1 | Assembly process requirement. |

### C7 — Interface ICs (RS-485, CAN, I2C, USB)

- **Category:** Integrated Circuits
- **Attributes (rules):** 22
- **Logic last updated:** 2026-03-02

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Protocol / Interface Standard | `protocol` | Identity (exact match) | 10 | BLOCKING. RS-485, CAN, I2C, and USB use fundamentally different signaling standards. No cross-protocol substitution. _(Aliases: RS-485≡RS485≡EIA-485≡TIA-485; I²C≡I2C≡IIC; CAN FD≡CAN-FD)_ |
| 2 | Data Rate / Speed Grade | `data_rate` | Threshold (replacement ≥ original) | 9 | Must equal or exceed original. A slower device cannot replace a faster one. |
| 3 | Operating Mode / Driver Topology | `operating_mode` | Identity (exact match) | 9 | Half-duplex RS-485 (one pair, DE/RE control) vs full-duplex RS-422 (separate TX/RX pairs, no DE). Isolated vs non-isolated. |
| 4 | Galvanic Isolation Type | `isolation_type` | Identity flag (boolean gate) | 8 | If original is isolated, replacement must also be isolated. Non-isolated has no isolation barrier and no VCC2. |
| 5 | Isolation Working Voltage (VIORM) | `isolation_working_voltage` | Threshold (replacement ≥ original) | 7 | Must equal or exceed original. |
| 6 | CAN Standard Variant / USB Speed Grade | `can_variant` | Identity flag (boolean gate) | 8 | Classical CAN (≤255ns loop delay) cannot support CAN FD data-phase rates. USB FS/HS/SS — hard gate. |
| 7 | Driver Enable / Direction Control Polarity | `de_polarity` | Identity (exact match) | 8 | Active-high vs active-low DE. Wrong polarity = direction control inverted. |
| 8 | Failsafe Receiver Behavior | `failsafe_receiver` | Identity flag (boolean gate) | 6 | Required for Modbus RTU and protocols relying on idle=Mark state for start-of-frame detection. |
| 9 | TXD Dominant Timeout / Bus Watchdog | `txd_dominant_timeout` | Identity flag (boolean gate) | 7 | CAN only. Prevents bus-jamming when TXD held low by software fault. All ISO 11898-2 compliant devices include this. |
| 10 | Bus Fault Protection Voltage | `bus_fault_protection` | Threshold (replacement ≥ original) | 8 | Lower fault protection = destroyed when bus shorts to power. |
| 11 | ESD Rating — Bus Pins | `esd_bus_pins` | Threshold (replacement ≥ original) | 7 | Bus pins connect to field wiring — highest ESD risk. |
| 12 | Differential Output Voltage (VOD) | `vod_differential` | Threshold (replacement ≥ original) | 6 | Lower VOD reduces noise margin on long cables. |
| 13 | Input Receiver Threshold & Common-Mode Range | `receiver_threshold_cm` | Threshold (replacement range ⊇ original) | 7 | Must contain actual bus common-mode voltage range. |
| 14 | Slew Rate Limiting | `slew_rate_class` | Application review (manual) | 6 | Slew-rate-limited types (≤250 kbps) chosen for EMI. Substituting unlimited-slew = EMI compliance failure. |
| 15 | Propagation Delay / Loop Delay | `propagation_delay` | Threshold (replacement ≤ original) | 6 | CAN FD at 2 Mbit/s: bit period=500ns, loop delay must be ≤140ns. |
| 16 | Unit Loads / Bus Loading | `unit_loads` | Threshold (replacement ≤ original) | 5 | RS-485 only. ¼ UL = 48kΩ allows 128 nodes; 1 UL = 12kΩ allows only 32. |
| 17 | Common-Mode Operating Range | `common_mode_range` | Threshold (replacement range ⊇ original) | 6 | Must contain actual bus CM voltage. Extended range (−25V to +25V) for multi-panel systems. |
| 18 | Supply Voltage Range | `supply_voltage` | Threshold (replacement range ⊇ original) | 7 | Must contain actual supply voltage. 5V-only transceiver cannot be powered from 3.3V. |
| 19 | Shutdown / Low-Power Standby Current | `standby_current` | Threshold (replacement ≤ original) | 5 | Automotive CAN spends most lifetime in standby. |
| 20 | Operating Temperature Range | `operating_temp` | Threshold (replacement range ⊇ original) | 7 | Automotive: −40°C to +125°C. Industrial: −40°C to +85°C or +105°C. |
| 21 | AEC-Q100 / Automotive Qualification | `aec_q100` | Identity flag (boolean gate) | 4 | Automotive CAN always AEC-Q100 Grade 1. Non-automotive parts BLOCKED. |
| 22 | Package / Footprint | `package_case` | Application review (manual) | 5 | SOIC-8 is de facto standard for RS-485/CAN — verify pin deviations and isolated transceiver wide-body. |

### C8 — Timers and Oscillators

- **Category:** Integrated Circuits
- **Attributes (rules):** 22
- **Logic last updated:** 2026-03-02

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Device Category / Stability Class | `device_category` | Identity (exact match) | 10 | HARD GATE. 555 timers and packaged oscillators are architecturally unrelated. Within oscillators, stability class (XO/MEMS/TCXO/VCXO/OCXO) is a second hard gate. Exception: XO↔MEMS cross-substitution permitted with Application Review. |
| 2 | Output Frequency | `output_frequency_hz` | Identity (exact match) | 10 | Must match exactly with full precision. Not applicable for 555 timers. |
| 3 | Output Signal Type | `output_signal_type` | Identity (exact match) | 9 | CMOS, TTL, LVDS, LVPECL, Clipped Sine, Open Drain — not interchangeable. |
| 4 | Output Enable Polarity | `oe_polarity` | Identity flag (boolean gate) | 8 | Active-low vs active-high OE. Wrong polarity = clock permanently disabled from first power-on. |
| 5 | Timer Variant (CMOS vs Bipolar) | `timer_variant` | Identity flag (boolean gate) | 7 | 555 only. Bipolar 555 minimum supply 4.5V. BLOCK bipolar in designs where VCC < 4.5V. |
| 6 | VCXO Pull Range (±ppm) | `vcxo_pull_range_ppm` | Identity flag (boolean gate) | 8 | VCXO only. PLL cannot lock if pull range is insufficient. |
| 7 | Initial Frequency Tolerance (ppm) | `initial_tolerance_ppm` | Threshold (replacement ≤ original) | 8 | Tighter tolerance always acceptable. |
| 8 | Temperature Stability (ppm over range) | `temp_stability_ppm` | Threshold (replacement ≤ original) | 8 | Dominant specification for TCXO-class devices. |
| 9 | Aging Rate (ppm/year) | `aging_ppm_per_year` | Threshold (replacement ≤ original) | 5 | Critical for deployed systems with no field calibration. |
| 10 | Output VOH/VOL Levels | `output_voh_vol` | Threshold (replacement range ⊇ original) | 7 | Must cover downstream logic VIH/VIL thresholds. |
| 11 | Output Load Capacitance (pF) | `output_drive_cl_pf` | Threshold (replacement ≥ original) | 6 | Must drive PCB trace capacitance + fan-out without degraded rise/fall time. |
| 12 | Output Duty Cycle (%) | `duty_cycle_pct` | Threshold (replacement range ⊇ original) | 5 | Asymmetric duty cycle closes timing eye in high-speed SerDes. |
| 13 | Phase Jitter (ps RMS) | `phase_jitter_ps_rms` | Threshold (replacement ≤ original) | 7 | Lower jitter always better. DDR3 ≤10ps RMS; PCIe Gen1 ≤25ps RMS; USB HS ≤200ps P-P. |
| 14 | Startup Time (ms) | `startup_time_ms` | Threshold (replacement ≤ original) | 5 | OCXO: 30 seconds to 5 minutes oven warm-up. Affects average power in sleep/wake designs. |
| 15 | Supply Voltage Range | `supply_voltage_range` | Threshold (replacement range ⊇ original) | 8 | Must contain actual board supply including transients. |
| 16 | Active Supply Current (mA) | `icc_active_ma` | Threshold (replacement ≤ original) | 6 | OCXO heater draws 100–400mW during warm-up. Verify power budget. |
| 17 | Standby Current (µA) | `icc_standby_ua` | Threshold (replacement ≤ original) | 5 | Tri-state (fast restart) vs full-shutdown (slow restart). |
| 18 | Operating Temperature Range | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | TCXO stability guaranteed only over rated range. |
| 19 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 4 | Automotive qualification. Verify vibration characterization for MEMS oscillators. |
| 20 | Package / Case | `package_case` | Application review (manual) | 5 | 3225 ≠ 5032 ≠ 2016 — different footprints. Within same size: pad 1 function may vary. |
| 21 | Crystal Load Capacitance (pF) | `crystal_load_cap_pf` | Application review (manual) | 3 | Relevant only for discrete crystal circuits. N/A for packaged oscillator substitutions. |
| 22 | Packaging Format | `packaging_format` | Operational (non-electrical) | 1 | Assembly process requirement. |

### C9 — ADCs — Analog-to-Digital Converters

- **Category:** Integrated Circuits
- **Attributes (rules):** 20
- **Logic last updated:** 2026-03-02

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | ADC Architecture | `architecture` | Identity (exact match) | 10 | HARD GATE. SAR, Delta-Sigma, Pipeline, Flash have fundamentally different latency, noise, speed, and power. Cross-architecture requires firmware changes and may destabilize control loops. _(Aliases: Delta-Sigma≡Sigma-Delta≡ΔΣ; SAR≡Successive Approximation)_ |
| 2 | Resolution (bits) | `resolution_bits` | Identity (exact match) | 10 | Exact match. Lower resolution BLOCKED. Higher resolution requires firmware changes (data register width, scaling). |
| 3 | Interface Type | `interface_type` | Identity (exact match) | 9 | SPI, I2C, Parallel not interchangeable. Verify CPOL/CPHA, word length, conversion trigger within SPI. |
| 4 | Input Configuration | `input_configuration` | Identity (exact match) | 9 | Single-ended, differential, pseudo-differential determine analog front-end circuit topology. |
| 5 | Number of Channels | `channel_count` | Threshold (replacement ≥ original) | 8 | Must be ≥ original. Fewer channels BLOCKED. |
| 6 | Simultaneous Sampling | `simultaneous_sampling` | Identity flag (boolean gate) | 9 | BLOCKING when original is simultaneous. Multiplexed ADC cannot substitute in motor control, power metering, or vibration analysis. |
| 7 | Sample Rate (SPS) | `sample_rate_sps` | Threshold (replacement ≥ original) | 8 | Must be ≥ original. Lower rate aliases previously clean signals. |
| 8 | Effective Number of Bits (ENOB) | `enob` | Threshold (replacement ≥ original) | 7 | Honest dynamic performance metric. Evaluate at actual operating data rate. |
| 9 | Integral Non-Linearity (LSB) | `inl_lsb` | Threshold (replacement ≤ original) | 7 | Cannot be corrected with gain + offset calibration. |
| 10 | Differential Non-Linearity (LSB) | `dnl_lsb` | Threshold (replacement ≤ original) | 6 | DNL > 1 LSB = missing output codes. BLOCK any replacement with dnl_lsb > 1.0 for monotonic applications. |
| 11 | Total Harmonic Distortion (dBc) | `thd_db` | Threshold (replacement ≤ original) | 6 | More negative = lower distortion. Critical for audio ADCs. |
| 12 | Reference Type | `reference_type` | Identity flag (boolean gate) | 7 | Internal only / External only / Both. If PCB has external reference circuit, replacement must accept external reference. |
| 13 | Internal Reference Voltage (V) | `reference_voltage` | Application review (manual) | 5 | Different Vref changes LSB size. Firmware recalibration may compensate. |
| 14 | Full-Scale Input Range (V) | `input_voltage_range` | Threshold (replacement range ⊇ original) | 7 | Must contain the signal range. Unipolar ≠ bipolar without front-end modification. |
| 15 | Conversion Latency (cycles) | `conversion_latency_cycles` | Threshold (replacement ≤ original) | 6 | Extra latency reduces phase margin in control loops. Delta-Sigma group delay can be 10s–100s ms. |
| 16 | Supply Voltage Range (V) | `supply_voltage_range` | Threshold (replacement range ⊇ original) | 7 | Verify both AVDD and DVDD separately. |
| 17 | Power Consumption (mW) | `power_consumption_mw` | Threshold (replacement ≤ original) | 5 | Higher power = more self-heating = reference drift. |
| 18 | Operating Temperature Range (°C) | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | Must cover full application range. |
| 19 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 4 | Automotive qualification. Non-automotive parts BLOCKED. |
| 20 | Package / Case | `package_case` | Application review (manual) | 5 | Precision ADCs may have exposed pad or guard-ring requirements. Package change = Application Review. |

### C10 — DACs — Digital-to-Analog Converters

- **Category:** Integrated Circuits
- **Attributes (rules):** 22
- **Logic last updated:** 2026-03-02

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Output Type | `output_type` | Identity (exact match) | 10 | HARD GATE. Voltage output vs current output architecturally incompatible. PCB circuit, feedback network, and load designed for one type. |
| 2 | Resolution (bits) | `resolution_bits` | Identity (exact match) | 10 | Exact match. Lower resolution BLOCKED. Higher requires firmware changes. |
| 3 | Interface Type | `interface_type` | Identity (exact match) | 9 | SPI, I2C, Parallel, Async not interchangeable. |
| 4 | DAC Architecture | `architecture` | Identity flag (boolean gate) | 7 | R-2R / Current-steering / Delta-Sigma / PWM. Different noise floors, glitch profiles, and settling behaviors. |
| 5 | Output Buffered | `output_buffered` | Identity flag (boolean gate) | 8 | Unbuffered replacing buffered: output voltage error under load. Buffered replacing unbuffered where no external buffer exists: works, but flag. |
| 6 | Number of DAC Channels | `channel_count` | Threshold (replacement ≥ original) | 7 | Must be ≥ original. Fewer channels BLOCKED. |
| 7 | Update Rate (SPS) | `update_rate_sps` | Threshold (replacement ≥ original) | 7 | Determines maximum waveform frequency and control bandwidth. |
| 8 | Power-On Reset State | `power_on_reset_state` | Identity flag (boolean gate) | 8 | BLOCKING when power-on state determines safety behavior. 0V vs midscale at power-on may activate an actuator before firmware loads. |
| 9 | Integral Non-Linearity (LSB) | `inl_lsb` | Threshold (replacement ≤ original) | 7 | Cannot be corrected with gain + offset calibration. |
| 10 | Differential Non-Linearity (LSB) | `dnl_lsb` | Threshold (replacement ≤ original) | 7 | DNL > 1 LSB = non-monotonic. Catastrophic in closed-loop control. BLOCK dnl_lsb > 0.5 for monotonic applications. |
| 11 | Glitch Energy (nVs) | `glitch_energy_nVs` | Threshold (replacement ≤ original) | 7 | At major code transitions. Audible clicks in audio at >~10 nVs. Rarely in Digikey — read datasheet. |
| 12 | Settling Time (µs) | `settling_time_us` | Threshold (replacement ≤ original) | 7 | Must settle to within 1 LSB after full-scale step. Limits update rate. |
| 13 | Output Noise Density (nV/√Hz) | `output_noise_density_nvhz` | Threshold (replacement ≤ original) | 6 | Lower noise limits minimum signal level. |
| 14 | Reference Type | `reference_type` | Identity flag (boolean gate) | 7 | Internal only / External only / Both. PCB must have matching reference circuit. |
| 15 | Internal Reference Voltage (V) | `reference_voltage` | Application review (manual) | 5 | Different Vref changes full-scale range and all calibration constants. |
| 16 | Output Voltage Range (V) | `output_voltage_range` | Threshold (replacement range ⊇ original) | 8 | Must contain the range required by the circuit. |
| 17 | Output Source Current (mA) | `output_current_source_ma` | Threshold (replacement ≥ original) | 6 | Must supply load current without output voltage droop. |
| 18 | Supply Voltage Range (V) | `supply_voltage_range` | Threshold (replacement range ⊇ original) | 7 | Verify both AVDD and DVDD. Split supply (±V) cannot substitute for single supply. |
| 19 | Power Consumption (mW) | `power_consumption_mw` | Threshold (replacement ≤ original) | 5 | Higher power = more self-heating = reference drift. |
| 20 | Operating Temperature Range (°C) | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | Must cover full application range. |
| 21 | AEC-Q100 Qualification | `aec_q100` | Identity flag (boolean gate) | 4 | Automotive qualification. Non-automotive parts BLOCKED. |
| 22 | Package / Case | `package_case` | Application review (manual) | 5 | Precision DACs may have exposed pad requirements. Package change = Application Review. |

### D1 — Crystals — Quartz Resonators

- **Category:** Passives
- **Attributes (rules):** 18
- **Logic last updated:** 2026-03-10

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Nominal Frequency (Hz) | `nominal_frequency_hz` | Identity (exact match) | 10 | BLOCKING. Must match exactly with full precision. 16.000 MHz ≠ 16.384 MHz. 32.768 kHz ≠ 32.000 kHz. Wrong frequency causes permanent system failure in all frequency-dependent applications. |
| 2 | Crystal Cut Type | `cut_type` | Identity flag (boolean gate) | 8 | AT-cut and Tuning Fork vibrate in completely different mechanical modes with different TC curve shapes, ESR ranges, and equivalent circuit parameters. Not interchangeable even at adjacent frequencies. |
| 3 | Frequency Tolerance (ppm) | `frequency_tolerance_ppm` | Threshold (replacement ≤ original) | 8 | Initial accuracy at +25°C. Tighter always acceptable. |
| 4 | Frequency Stability (ppm) | `frequency_stability_ppm` | Threshold (replacement ≤ original) | 8 | Maximum deviation over full temperature range. |
| 5 | Load Capacitance (pF) | `load_capacitance_pf` | Identity (exact match) | 9 | BLOCKING — #1 crystal substitution error. Wrong CL shifts frequency 30–100 ppm permanently. Cannot be corrected in firmware. |
| 6 | ESR (Equivalent Series Resistance) | `equivalent_series_resistance_ohm` | Threshold (replacement ≤ original) | 8 | Determines oscillator startup margin at cold temperature. Oscillator's negative resistance must exceed ESR by ≥5×. Failure mode: intermittent cold-start. |
| 7 | Maximum Drive Level (µW) | `drive_level_uw` | Threshold (replacement ≥ original) | 7 | Overdrive causes accelerated aging and eventual electrode fracture. |
| 8 | Shunt Capacitance (pF) | `shunt_capacitance_pf` | Threshold (replacement ≤ original) | 6 | Parasitic parallel capacitance C0. Critical for VCXO replacement crystals — determines pull range. |
| 9 | Aging Rate (ppm/year) | `aging_ppm_per_year` | Threshold (replacement ≤ original) | 6 | ±3 ppm/year = ~95 seconds/year drift in RTC applications. |
| 10 | Package / Case | `package_type` | Identity flag (boolean gate) | 8 | Cross-size SMD substitutions BLOCKED. 3225 ≠ 2016 ≠ 5032. Through-hole HC-49/U vs HC-49/S have different heights. |
| 11 | Pin Count | `package_pins` | Identity flag (boolean gate) | 6 | 2-pad vs 4-pad. 4-pad crystal cannot install in 2-pad footprint. |
| 12 | Mounting Type | `mounting_type` | Identity (exact match) | 7 | BLOCKING. SMD and Through-Hole require different PCB footprints and assembly processes. |
| 13 | Operating Temperature Range | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | Frequency stability guaranteed only within stated range. |
| 14 | Storage Temperature Range | `storage_temp_range` | Application review (manual) | 3 | Relevant for extreme shipping/storage environments. |
| 15 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 4 | AEC-Q200 for crystals — passive standard. NOT AEC-Q100 (active ICs). |
| 16 | Overtone Order | `overtone_order` | Identity flag (boolean gate) | 9 | HARD GATE. Overtone crystal in fundamental-mode circuit oscillates at fundamental frequency (1/3 or 1/5 of intended). Silent catastrophic failure. BLOCK fundamental↔overtone unconditionally. |
| 17 | Frequency vs Temperature Curve | `frequency_vs_temp_curve` | Application review (manual) | 4 | TC curve shape matters for TCXO compensation and VCXO pullability. |
| 18 | Qualification Level | `qualification_level` | Operational (non-electrical) | 2 | Commercial / Industrial / MIL-SPEC / Space. Procurement filtering only. |

### D2 — Fuses — Traditional Overcurrent Protection

- **Category:** Passives
- **Attributes (rules):** 14
- **Logic last updated:** 2026-03-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Current Rating (A) | `current_rating_a` | Identity (exact match) | 10 | BLOCKING — IDENTITY, not a threshold. A 3A fuse in a 2A circuit means any fault between 2A and 3A is not interrupted — wire overheats, fire risk. A 2A fuse in a 3A circuit blows on normal load. Must match exactly. |
| 2 | Voltage Rating (V) | `voltage_rating_v` | Threshold (replacement ≥ original) | 10 | BLOCKING — safety-critical minimum. Below-rated fuse cannot safely extinguish the arc — body may rupture or catch fire. Never downgrade. |
| 3 | Breaking Capacity (A) | `breaking_capacity_a` | Threshold (replacement ≥ original) | 10 | BLOCKING — safety-critical minimum. If available fault current exceeds breaking capacity: fuse body may explode, fault current continues uninterrupted. |
| 4 | Speed Class | `speed_class` | Identity (exact match) | 9 | HARD GATE. Fast-blow / Medium / Slow-blow / Very Fast / Very Slow. Cross-class substitutions BLOCKED unconditionally. Slow-blow in semiconductor circuit = semiconductor destroyed before fuse clears. _(Aliases: Fast≡Fast Blow≡Fast-Blow≡Fast Acting≡F; Slow≡Slow Blow≡Time Delay≡Time-Delay≡T)_ |
| 5 | I²t Let-Through Energy (A²·s) | `i2t_rating_a2s` | Threshold (replacement ≤ original) | 8 | Replacement must clear at least as fast. If fuse I²t > semiconductor I²t, semiconductor destroyed before fuse clears. |
| 6 | Melting I²t (A²·s) | `melting_i2t_a2s` | Threshold (replacement ≤ original) | 6 | Pre-arcing energy — the semiconductor sees this before the fuse begins interrupting. |
| 7 | Package Format | `package_format` | Identity (exact match) | 9 | HARD GATE. 5×20mm / 6.3×32mm / Blade (Mini/Regular/Maxi) / SMD — physically incompatible. Within automotive blade: ATM ≠ ATC ≠ APX. |
| 8 | Body Material | `body_material` | Identity flag (boolean gate) | 6 | Glass / Ceramic / Sand-filled ceramic. High-voltage DC applications: ceramic sand-fill mandatory. Glass bodies cannot reliably contain DC arcs. |
| 9 | Mounting Type | `mounting_type` | Identity (exact match) | 8 | BLOCKING. PCB through-hole / PCB SMD / Chassis panel-mount / In-line. Not interchangeable. |
| 10 | Operating Temperature Range | `operating_temp_range` | Threshold (replacement range ⊇ original) | 6 | Fuse rated current derate at elevated ambient. Must cover full range. |
| 11 | Derating Factor | `derating_factor` | Application review (manual) | 5 | Operating current must not exceed rated_current × derating_factor. |
| 12 | Voltage Type (AC/DC) | `voltage_type` | Identity flag (boolean gate) | 7 | DC fuses specifically rated for DC. A fuse rated 250VAC may only be rated 32VDC. Solar, battery, EV applications must verify DC rating explicitly. |
| 13 | Safety Certification | `safety_certification` | Identity flag (boolean gate) | 7 | UL248 / IEC 60127 / AEC-Q200. BLOCKING when application specifies required certification. |
| 14 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 4 | AEC-Q200 for fuses — passive/electromechanical standard. NOT AEC-Q100. |

### E1 — Optocouplers / Photocouplers

- **Category:** Discrete Semiconductors
- **Attributes (rules):** 23
- **Logic last updated:** 2026-03-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Output Transistor Type | `output_transistor_type` | Identity (exact match) | 10 | BLOCKING. Phototransistor / Photodarlington / Logic-output define fundamentally different gain ranges, bandwidths, and interface topologies. Cross-type BLOCKED unconditionally. |
| 2 | Isolation Voltage (Vrms) | `isolation_voltage_vrms` | Threshold (replacement ≥ original) | 10 | BLOCKING — safety-critical minimum. Never downgrade. Reinforced isolation (mains, IEC 62368): ≥3750 Vrms. |
| 3 | Working Voltage (Vrms) | `working_voltage_vrms` | Threshold (replacement ≥ original) | 9 | BLOCKING — continuous rated working voltage across barrier. Distinct from test voltage. Exceeding degrades barrier over time. |
| 4 | Channel Count | `channel_count` | Identity (exact match) | 9 | HARD GATE. Single/Dual/Quad. Completely different pinout and footprint across counts. |
| 5 | Package Type | `package_type` | Identity (exact match) | 9 | HARD GATE. DIP-4 / DIP-6 / SOP-4 / SSOP-4 — physically incompatible footprints. |
| 6 | Creepage Distance (mm) | `creepage_distance_mm` | Threshold (replacement ≥ original) | 8 | Minimum path along surface between input and output pins. Cannot be improved by PCB design alone. |
| 7 | Clearance Distance (mm) | `clearance_distance_mm` | Threshold (replacement ≥ original) | 7 | Minimum air path between input and output pins. Independent of creepage. |
| 8 | Peak Isolation Voltage (V) | `peak_isolation_voltage_v` | Threshold (replacement ≥ original) | 7 | Maximum instantaneous voltage the barrier can withstand without breakdown. |
| 9 | Safety Certification | `safety_certification` | Identity flag (boolean gate) | 7 | UL1577 / IEC 62368-1 / VDE 0884-10 / CSA. BLOCKING when application requires specific certification mark. |
| 10 | Pollution Degree | `pollution_degree` | Identity flag (boolean gate) | 5 | PD1/2/3. Determines creepage distance multiplier. |
| 11 | CTR Minimum (%) | `ctr_min_pct` | Threshold (replacement ≥ original) | 9 | Current transfer ratio — the gain budget. Must be ≥ required minimum. Specified at particular If — valid only at that If. |
| 12 | CTR Maximum (%) | `ctr_max_pct` | Threshold (replacement ≤ original) | 7 | Upper bound of gain range. Too-high CTR can destabilize SMPS feedback loops. |
| 13 | CTR Class (Rank) | `ctr_class` | Identity flag (boolean gate) | 6 | CTR rank suffix (A/B/C/D/E). Escalated to mandatory for precision CTR applications. |
| 14 | LED Rated Forward Current (mA) | `if_rated_ma` | Threshold (replacement ≤ original) | 7 | If LED rating < circuit drive current, LED is overdriven — accelerated degradation. |
| 15 | Input Forward Voltage Vf (V) | `input_forward_voltage_vf` | Threshold (replacement ≤ original) | 7 | Higher Vf with fixed resistor = lower LED current = reduced CTR below design minimum. |
| 16 | Vce(sat) (V) | `vce_sat_v` | Threshold (replacement ≤ original) | 8 | Output transistor saturation voltage. Must be below downstream logic low threshold. |
| 17 | Bandwidth (kHz) | `bandwidth_khz` | Threshold (replacement ≥ original) | 8 | Phototransistor: 20–300 kHz. Photodarlington: 5–50 kHz. Logic-output: 1–25 MHz. |
| 18 | Propagation Delay (us) | `propagation_delay_us` | Threshold (replacement ≤ original) | 7 | Asymmetric tpHL/tpLH causes PWM duty cycle distortion. |
| 19 | Output Leakage ICEO (uA) | `output_leakage_iceo_ua` | Threshold (replacement ≤ original) | 5 | Off-state collector leakage. Matters for high-impedance analog input stages. |
| 20 | Supply Voltage VCC | `supply_voltage_vcc` | Threshold (replacement range ⊇ original) | 7 | For logic-output types only. VCC range must include board supply voltage. |
| 21 | CTR Degradation (%) | `ctr_degradation_pct` | Threshold (replacement ≤ original) | 6 | CTR degradation over rated lifetime due to LED aging. |
| 22 | Operating Temperature Range | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | Must cover full application range. CTR decreases at temperature extremes. |
| 23 | AEC-Q101 Qualification | `aec_q101` | Identity flag (boolean gate) | 4 | AEC-Q101 (discrete semiconductor). NOT AEC-Q100 (ICs) or AEC-Q200 (passives). |

### F1 — Electromechanical Relays (EMR)

- **Category:** Relays
- **Attributes (rules):** 23
- **Logic last updated:** 2026-03-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Coil Voltage (VDC) | `coil_voltage_vdc` | Identity (exact match) | 10 | BLOCKING — IDENTITY, not a threshold. 24V coil on 12V supply will not operate. 5V coil on 12V supply overheats. Both directions are hard failures. |
| 2 | Contact Form | `contact_form` | Identity (exact match) | 10 | BLOCKING. SPST-NO / SPST-NC / SPDT / DPST / DPDT. SPST-NO ≠ SPST-NC. SPST cannot substitute for SPDT. DPDT cannot be replaced by SPDT. |
| 3 | Mounting Type | `mounting_type` | Identity (exact match) | 9 | BLOCKING. PCB through-hole / SMD / DIN-rail / panel-mount / socket — physically incompatible. |
| 4 | Contact Count (Poles) | `contact_count` | Identity (exact match) | 8 | BLOCKING. Cannot replace 2-pole with 1-pole — second circuit has no switching element. |
| 5 | Contact Voltage Rating (V) | `contact_voltage_rating_v` | Threshold (replacement ≥ original) | 9 | SAFETY-CRITICAL. Exceeding causes arc-over — may weld contacts or ignite materials. Separate AC and DC ratings. |
| 6 | Contact Current Rating (A) | `contact_current_rating_a` | Threshold (replacement ≥ original) | 9 | SAFETY-CRITICAL. Manufacturer rating assumes resistive test load. Inductive loads: derate 1.5×. Motor loads: derate 2×. |
| 7 | Contact Voltage Type (AC/DC) | `contact_voltage_type` | Identity flag (boolean gate) | 7 | DC arcs have no zero-crossing. A 250VAC-rated relay may carry only 30VDC. Verify for DC switching above 30V. |
| 8 | Contact Material | `contact_material` | Identity flag (boolean gate) | 7 | Silver alloy contacts form insulating film below ~100mA. Gold-clad required for dry-circuit reliability. Escalated to mandatory for loads <100mA. |
| 9 | Maximum Switching Power (VA) | `max_switching_power_va` | Threshold (replacement ≤ original) | 6 | Voltage × current combined cannot exceed switching power limit. |
| 10 | Coil Resistance (Ω) | `coil_resistance_ohm` | Threshold (replacement ≥ original) | 7 | Determines coil drive current I=V/R. Replacement must not draw more than driver can supply. Critical for GPIO direct-drive. |
| 11 | Coil Power (mW) | `coil_power_mw` | Threshold (replacement ≤ original) | 6 | Steady-state coil power. Escalated for battery/low-power applications. |
| 12 | Must-Operate Voltage (V) | `must_operate_voltage_v` | Threshold (replacement ≤ original) | 7 | Minimum reliable pull-in voltage. Verify against supply minimum, not nominal. |
| 13 | Must-Release Voltage (V) | `must_release_voltage_v` | Threshold (replacement ≥ original) | 5 | Maximum voltage at which relay releases. Higher may prevent release on variable supplies. |
| 14 | Operate Time (ms) | `operate_time_ms` | Threshold (replacement ≤ original) | 6 | Time from coil energisation to contact closure. |
| 15 | Release Time (ms) | `release_time_ms` | Threshold (replacement ≤ original) | 6 | Time from coil de-energisation to contact opening. Increases substantially with flyback diode. |
| 16 | Mechanical Life (operations) | `mechanical_life_ops` | Threshold (replacement ≥ original) | 5 | No-load cycling endurance. Typically 10–100M operations. |
| 17 | Electrical Life (operations) | `electrical_life_ops` | Threshold (replacement ≥ original) | 6 | Endurance at rated electrical load. Inductive loads: may be 10–50% of resistive rating. |
| 18 | Contact Bounce (ms) | `contact_bounce_ms` | Threshold (replacement ≤ original) | 5 | Excessive bounce causes false triggering in counters and edge-detection circuits. |
| 19 | Package Footprint | `package_footprint` | Identity flag (boolean gate) | 8 | PCB footprint and pin pitch. Standard footprints interchangeable within standard; proprietary formats are not. |
| 20 | Coil Suppression Diode | `coil_suppress_diode` | Identity flag (boolean gate) | 6 | None / Diode / Diode+Zener / Varistor. Changing suppression type changes driver circuit requirements and release time. Application Review on any change. |
| 21 | Operating Temperature Range | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | Must cover full range. Automotive: −40°C to +125°C mandatory. |
| 22 | Sealing Type | `sealing_type` | Identity flag (boolean gate) | 5 | Open / Sealed / Flux-tight / Fully sealed / Hermetic. Open relays cannot withstand PCB wash processes. |
| 23 | AEC-Q200 Qualification | `aec_q200` | Identity flag (boolean gate) | 4 | AEC-Q200 — electromechanical/passive standard. NOT AEC-Q100 (ICs) or AEC-Q101 (discrete semiconductors). |

### F2 — Solid State Relays (SSR)

- **Category:** Relays
- **Attributes (rules):** 23
- **Logic last updated:** 2026-03-11

| # | Attribute | Attribute ID | Match Logic | Weight | Engineering Reason |
|---|-----------|--------------|-------------|:------:|--------------------|
| 1 | Output Switch Type | `output_switch_type` | Identity (exact match) | 10 | BLOCKING — HARD GATE. TRIAC requires AC zero-crossing for turn-off — on DC load it latches permanently. MOSFET not rated for bidirectional AC. Cross-type substitution BLOCKED unconditionally. |
| 2 | Firing Mode | `firing_mode` | Identity (exact match) | 9 | BLOCKING. Zero-crossing (ZC) eliminates inrush at cost of up to one half-cycle turn-on delay. Random-fire (RF) turns on immediately — enables phase-angle control but generates inrush. Not interchangeable in either direction without engineering decision. |
| 3 | Mounting Type | `mounting_type` | Identity (exact match) | 9 | BLOCKING. PCB-mount / Panel-mount / DIN-rail — physically incompatible. |
| 4 | Load Voltage Type (AC/DC) | `load_voltage_type` | Identity flag (boolean gate) | 8 | Must match load supply. Cross-validates output_switch_type — AC load requires TRIAC, DC load requires MOSFET. |
| 5 | Load Voltage Max (V) | `load_voltage_max_v` | Threshold (replacement ≥ original) | 10 | SAFETY-CRITICAL. For 230VAC: minimum 400V (Vpeak=325V with margin). For 120VAC: 250V minimum. For DC: verify DC voltage rating explicitly. |
| 6 | Load Current Max (A) | `load_current_max_a` | Threshold (replacement ≥ original) | 10 | SAFETY-CRITICAL. Rating at specific case temp — derates to zero at ~70–80°C case. A 25A-rated SSR at 50°C ambient without heatsinking may only sustain 12A. |
| 7 | Load Current Min (A) | `load_current_min_a` | Threshold (replacement ≤ original) | 6 | Hidden TRIAC holding current constraint. TRIAC de-latches if load current falls below this. Critical for LED lamps and low-power loads. Datasheet only — not in Digikey parametric. |
| 8 | Off-State Leakage (mA) | `off_state_leakage_ma` | Threshold (replacement ≤ original) | 7 | RC snubber passes 1–10mA through load in off state. Causes LED lamps to glow faintly. Datasheet only. |
| 9 | Input Voltage Range (V) | `input_voltage_range_v` | Threshold (replacement range ⊇ original) | 9 | BLOCKING — Must fully contain actual control voltage. Universal (3–32VDC) vs fixed-input (4–6VDC) types not substitutable. |
| 10 | Input Current (mA) | `input_current_ma` | Threshold (replacement ≤ original) | 7 | Higher input current may exceed drive source capability (GPIO, PLC output). |
| 11 | Input Impedance (Ω) | `input_impedance_ohm` | Threshold (replacement ≥ original) | 5 | Lower impedance draws more current. Application Review when significantly decreases. |
| 12 | Turn-On Time (ms) | `turn_on_time_ms` | Threshold (replacement ≤ original) | 7 | ZC includes half-cycle wait (8.3ms at 60Hz). RF typically <1ms. |
| 13 | Turn-Off Time (ms) | `turn_off_time_ms` | Threshold (replacement ≤ original) | 7 | AC TRIAC: up to one full cycle (16.7ms at 60Hz). DC MOSFET: typically <1ms. |
| 14 | dV/dt Rating (V/µs) | `dv_dt_rating_v_us` | Threshold (replacement ≥ original) | 6 | Critical rate of voltage rise without spurious turn-on from mains transients or back-EMF. |
| 15 | dI/dt Rating (A/µs) | `di_dt_rating_a_us` | Threshold (replacement ≥ original) | 6 | Maximum current rise at turn-on. Capacitive and lamp loads have very high inrush dI/dt. |
| 16 | On-State Voltage Drop (V) | `on_state_voltage_drop_v` | Threshold (replacement ≤ original) | 7 | Determines power dissipation. Higher Vdrop = larger heatsink required. Datasheet only. |
| 17 | Thermal Resistance Junction-to-Case (°C/W) | `thermal_resistance_jc` | Threshold (replacement ≤ original) | 6 | Determines thermal derating curve and existing heatsink adequacy. Datasheet only. |
| 18 | Built-in Snubber | `built_in_snubber` | Identity flag (boolean gate) | 6 | Internal RC snubber for dV/dt protection. Absence requires external snubber circuit. Also source of off-state leakage. Application Review on any change. |
| 19 | Built-in Varistor (MOV/TVS) | `built_in_varistor` | Identity flag (boolean gate) | 5 | Internal overvoltage protection on load terminals. Absence requires external TVS/MOV in harsh environments. |
| 20 | Isolation Voltage (Vrms) | `isolation_voltage_vrms` | Threshold (replacement ≥ original) | 8 | Input-to-output isolation. Never downgrade. For UL508 panels: certification mark required, not just higher isolation voltage. |
| 21 | Safety Certification | `safety_certification` | Identity flag (boolean gate) | 7 | UL508 / IEC 62314 / VDE / CSA. Per-part listing — higher isolation alone cannot substitute for a listed part in a UL-listed panel. |
| 22 | Operating Temperature Range | `operating_temp_range` | Threshold (replacement range ⊇ original) | 7 | SSR current derating begins at 25–40°C case temperature. Verify derated current ≥ load current at Tmax. |
| 23 | Package Footprint | `package_footprint` | Identity flag (boolean gate) | 7 | PCB footprint, panel cutout, or DIN-rail pitch. Standard industry outlines interchangeable within standard. |
