## Minimum Attribute Sets by Family

This section defines the minimum attributes the agent must collect before executing a search, and the secondary attributes that should be asked if not already known because without them the result set is too large to be useful.

**Attribute IDs in this table match the live logic tables exactly.**

**How to use this table:**

- **Tier 2 — Required to Search:** Agent must have all of these before querying. If any are missing after MPN enrichment, ask for them in order before searching. These are hard prerequisites — searching without them returns a result set that is either unsafe (mixes incompatible types) or meaninglessly large.
- **Tier 3 — Result Set Discriminators:** Agent should ask for these after Tier 2 is satisfied but before presenting results. Without them the candidate set may be in the dozens to hundreds. The agent can proceed without Tier 3 and offer to refine, but should ask if the result set exceeds ~20 candidates.
- **MPN-first principle:** Always attempt MPN resolution before asking questions. A resolved MPN may pre-fill all Tier 2 and most Tier 3 attributes, reducing the conversation to zero questions. Only ask for attributes that are genuinely unknown after enrichment.
- **Context questions are separate:** The Q1–Q4 application context questions are not Tier 2 or Tier 3. They re-rank and filter candidates *after* the initial result set is returned. Ask them after you have candidates, not before you search.

---

### Block A: Passives

| Family ID | Family | Tier 2 — Required to Search | Tier 3 — Result Set Discriminators |
|-----------|--------|----------------------------|-------------------------------------|
| 12 | MLCC Capacitors | `capacitance`, `package_case`, `voltage_rated`, `dielectric` | `tolerance`, `flexible_termination` |
| 13 | Mica Capacitors | `capacitance`, `package_case`, `voltage_rated`, `dielectric` | `tolerance`, `temperature_coefficient` |
| 52 | Chip Resistors | `resistance`, `package_case`, `power_rating` | `tolerance`, `tcr` |
| 53 | Through-Hole Resistors | `resistance`, `mounting_style`, `lead_spacing`, `power_rating` | `tolerance`, `composition` |
| 54 | Current Sense Resistors | `resistance`, `package_case`, `power_rating`, `kelvin_sensing` | `tolerance`, `tcr` |
| 55 | Chassis Mount / High Power Resistors | `resistance`, `power_rating`, `mounting_style`, `heatsink_dimensions` | `tolerance`, `thermal_resistance` |
| 58 | Aluminum Electrolytic Capacitors | `capacitance`, `voltage_rated`, `polarization`, `mounting_type`, `diameter`, `lead_spacing` | `esr`, `ripple_current`, `lifetime` |
| 59 | Tantalum Capacitors | `capacitance`, `voltage_rated`, `package_case`, `capacitor_type` | `esr`, `failure_mode` |
| 60 | Aluminum Polymer Capacitors | `capacitance`, `voltage_rated`, `polarization`, `mounting_type`, `esr` | `ripple_current`, `tolerance` |
| 61 | Supercapacitors (EDLC) | `capacitance`, `voltage_rated`, `package_case`, `esr` | `leakage_current`, `peak_current` |
| 64 | Film Capacitors | `capacitance`, `package_case`, `lead_spacing`, `voltage_rated_dc`, `safety_rating` | `voltage_rated_ac`, `tolerance`, `dielectric_type` |
| 65 | Varistors / MOVs | `varistor_voltage`, `max_continuous_voltage`, `package_case` | `energy_rating`, `peak_surge_current`, `safety_rating` |
| 66 | PTC Resettable Fuses | `hold_current`, `max_voltage`, `trip_current`, `package_case` | `initial_resistance`, `time_to_trip` |
| 67 | NTC Thermistors | `resistance_r25`, `b_value`, `package_case` | `r25_tolerance`, `b_value_tolerance` |
| 68 | PTC Thermistors | `resistance_r25`, `curie_temp`, `package_case` | `trip_current`, `hold_current` |
| 69 | Common Mode Chokes | `cm_impedance`, `package_case`, `rated_current`, `number_of_lines` | `dcr`, `application_type` |
| 70 | Ferrite Beads | `impedance_100mhz`, `package_case`, `rated_current` | `dcr`, `number_of_lines` |
| 71 | Power Inductors | `inductance`, `package_case`, `saturation_current`, `rated_current` | `dcr`, `shielding` |
| 72 | RF / Signal Inductors | `inductance`, `package_case`, `rated_current`, `srf` | `q_factor`, `core_material` |

---

### Block B: Discrete Semiconductors

| Family ID | Family | Tier 2 — Required to Search | Tier 3 — Result Set Discriminators |
|-----------|--------|----------------------------|-------------------------------------|
| B1 | Rectifier Diodes | `vrrm`, `io_avg`, `recovery_category`, `configuration`, `package_case` | `vf`, `trr` |
| B2 | Schottky Barrier Diodes | `vrrm`, `io_avg`, `configuration`, `package_case`, `semiconductor_material` | `vf`, `ir_leakage` |
| B3 | Zener Diodes | `vz`, `pd`, `configuration`, `pin_configuration`, `package_case` | `vz_tolerance`, `zzt` |
| B4 | TVS Diodes | `polarity`, `vrwm`, `vc`, `num_channels`, `configuration`, `package_case` | `ppk`, `cj` |
| B5 | MOSFETs | `channel_type`, `vds_max`, `id_max`, `package_case` | `rds_on`, `vgs_th` |
| B6 | BJTs | `polarity`, `vceo_max`, `ic_max`, `package_case` | `hfe`, `vce_sat` |
| B7 | IGBTs | `vces_max`, `ic_max`, `package_case`, `co_packaged_diode` | `vce_sat`, `eoff` |
| B8 | Thyristors / TRIACs / SCRs | `device_type`, `vdrm`, `on_state_current`, `package_case` | `igt`, `ih` |
| B9 | JFETs | `channel_type`, `vp`, `idss`, `package_case` | `gfs`, `igss` |

---

### Block C: Integrated Circuits

| Family ID | Family | Tier 2 — Required to Search | Tier 3 — Result Set Discriminators |
|-----------|--------|----------------------------|-------------------------------------|
| C1 | Linear Voltage Regulators (LDOs) | `output_type`, `polarity`, `output_voltage`, `iout_max`, `package_case` | `vdropout`, `output_cap_compatibility` |
| C2 | Switching Regulators | `topology`, `architecture`, `vin_max`, `vout_range`, `iout_max`, `package_case` | `fsw`, `control_mode`, `vref` |
| C3 | Gate Drivers | `driver_configuration`, `isolation_type`, `peak_source_current`, `peak_sink_current`, `vdd_range`, `package_case` | `propagation_delay`, `dead_time_control` |
| C4 | Op-Amps / Comparators | `device_type`, `channels`, `input_type`, `supply_voltage`, `package_case` | `gain_bandwidth`, `vicm_range`, `input_bias_current` |
| C5 | Logic ICs (74-series) | `logic_function`, `gate_count`, `supply_voltage`, `package_case` | `logic_family`, `vih`, `tpd` |
| C6 | Voltage References | `configuration`, `output_voltage`, `adjustability`, `package_case` | `initial_accuracy`, `tc` |
| C7 | Interface ICs | `protocol`, `operating_mode`, `data_rate`, `supply_voltage`, `package_case` | `isolation_type`, `bus_fault_protection` |
| C8 | Timers & Oscillators | `device_category`, `output_frequency_hz`, `output_signal_type`, `supply_voltage_range`, `package_case` | `initial_tolerance_ppm`, `temp_stability_ppm` |
| C9 | ADCs | `architecture`, `resolution_bits`, `interface_type`, `input_configuration`, `channel_count`, `package_case` | `sample_rate_sps`, `enob`, `simultaneous_sampling` |
| C10 | DACs | `output_type`, `resolution_bits`, `interface_type`, `output_buffered`, `package_case` | `update_rate_sps`, `power_on_reset_state`, `output_voltage_range` |

---

### Block D: Frequency & Protection Components

| Family ID | Family | Tier 2 — Required to Search | Tier 3 — Result Set Discriminators |
|-----------|--------|----------------------------|-------------------------------------|
| D1 | Crystals | `nominal_frequency_hz`, `load_capacitance_pf`, `package_type`, `cut_type`, `overtone_order` | `equivalent_series_resistance_ohm`, `frequency_tolerance_ppm` |
| D2 | Fuses | `current_rating_a`, `voltage_rating_v`, `breaking_capacity_a`, `speed_class`, `package_format` | `voltage_type`, `i2t_rating_a2s` |

---

### Block E: Optoelectronics

| Family ID | Family | Tier 2 — Required to Search | Tier 3 — Result Set Discriminators |
|-----------|--------|----------------------------|-------------------------------------|
| E1 | Optocouplers / Photocouplers | `output_transistor_type`, `isolation_voltage_vrms`, `channel_count`, `package_type` | `ctr_min_pct`, `bandwidth_khz` |

---

### Block F: Switching & Electromechanical

| Family ID | Family | Tier 2 — Required to Search | Tier 3 — Result Set Discriminators |
|-----------|--------|----------------------------|-------------------------------------|
| F1 | Electromechanical Relays (EMR) | `coil_voltage_vdc`, `contact_form`, `mounting_type`, `contact_count`, `contact_voltage_rating_v`, `contact_current_rating_a` | `package_footprint`, `coil_resistance_ohm` |
| F2 | Solid State Relays (SSR) | `output_switch_type`, `firing_mode`, `mounting_type`, `load_voltage_max_v`, `load_current_max_a`, `input_voltage_range_v` | `on_state_voltage_drop_v`, `isolation_voltage_vrms` |

---

### Notes on Specific Families

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
