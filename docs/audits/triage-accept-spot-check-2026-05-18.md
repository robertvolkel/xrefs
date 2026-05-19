# Triage Accept Spot-Check — 2026-05-18

**Scope:** 20 randomly-sampled overrides from the most-recent 60 accepted entries in `atlas_dictionary_overrides` (post-Decision #192 domain-card cleanup). Sample is deterministic (FNV-1a hash sort of `id`, take 20 lowest).

**Goal:** Verify even the "green" subset (where the proposed `attribute_id` is canonical for the family) is trustworthy. User accepted ~50+ AI-suggested mappings; they are not an engineer.

## Verdict Table

| # | family_id | param_name | proposed attribute_id | In schema? | Verdict | Reasoning |
|---|-----------|-------------|------------------------|------------|---------|-----------|
| 1 | B8 | `vdrm_min (v)` | `vdrm` | ✅ | ✅ CORRECT | VDRM is the canonical peak off-state voltage; `_min` qualifier on the source name is upstream-spec wording. |
| 2 | B8 | `it(rms)_max (a)` | `on_state_current` | ✅ | ✅ CORRECT | IT(RMS) IS the TRIAC on-state current per the rule's engineeringReason. |
| 3 | Diodes (L2) | `vdrm/vrrm (v)` | `vdrm_v` | L2 | ✅ CORRECT | VDRM/VRRM are interchangeable names for the same peak off-state spec. |
| 4 | B5 | `vgs(th) max (v)` | `vgs_th_max` | ❌ | ⚠️ DEBATABLE | Schema canonical is `vgs_th` (single id covers typ/max). `_max` suffix splits the canonical, creates a sibling attr that won't match the existing rule. Engineer should re-route to `vgs_th`. |
| 5 | C9 | `inl (lsb)` | `inl_lsb` | ✅ | ✅ CORRECT | Direct semantic match; canonical exists in C9 ADC table. |
| 6 | C9 | `dnl (lsb)` | `dnl_lsb` | ✅ | ✅ CORRECT | Direct semantic match. |
| 7 | C4 | `iq/comp typ (na)` | `iq` | ✅ | ✅ CORRECT | Quiescent current per channel; canonical and unit (nA→A scale) consistent. |
| 8 | Transformers (L2) | `inductance` | `inductance` | L2 | ✅ CORRECT | Trivially correct identity mapping. |
| 9 | B4 | `channel` | `num_channels` | ✅ | ✅ CORRECT | TVS array channel count; rule's engineeringReason explicitly defines this. |
| 10 | B8 | `tj_max (°c)` | `tj_max` | ✅ | ✅ CORRECT | Direct identity match. |
| 11 | C4 | `enoise typ @1mhz (nv/√hz)` | `input_noise_voltage` | ✅ | ✅ CORRECT | en in nV/√Hz is exactly input-referred noise voltage density. |
| 12 | 69 | `min. insulation resistance(mω)` | `insulation_resistance` | ❌ | ⚠️ DEBATABLE | Family 69 CMC schema has `insulation_voltage` (V) but no `insulation_resistance` (MΩ) rule — different physical quantities. Override creates a NEW attr not in the logic table; valid as a display-only param but won't participate in scoring. AI should have flagged "no canonical in schema". |
| 13 | 69 | `ratedcurrent(ma)` | `rated_current` | ✅ | ✅ CORRECT | Direct identity match against CMC rated-current rule. |
| 14 | C1 | `∆vr-load_typ` | `load_regulation` | ✅ | ✅ CORRECT | ΔVr-load IS load regulation; unit (mV) consistent. |
| 15 | C6 | `vref_typ (v)` | `output_voltage` | ✅ | ✅ CORRECT | For a voltage reference IC, Vref typ IS the output voltage. Rule weight=10 identity match. |
| 16 | ICs (L2) | `balance port impedance(ω)` | `balance_port_impedance_ohm` | L2 | ✅ CORRECT | Trivially correct; new canonical for L2 ICs. |
| 17 | RF and Wireless (L2) | `center frequencymhz` | `center_frequency` | L2 | ✅ CORRECT | Trivially correct. |
| 18 | Power Supplies (L2) | `input voltage max (v)` | `input_voltage_max` | L2 | ✅ CORRECT | Trivially correct. |
| 19 | RF and Wireless (L2) | `pass bandmhz` | `frequency_range` | L2 | ⚠️ DEBATABLE | "Pass band" is the filter pass-band range; mapping to `frequency_range` is reasonable for a generic L2 attribute but loses the filter-specific semantic (could collide with antennae/oscillators that also use `frequency_range`). |
| 20 | 69 | `inductance @100khz/0.1ma` | `cm_inductance` | ✅ | ✅ CORRECT | CM choke characteristic inductance at standard test conditions; canonical match. |

## Summary

- ✅ CORRECT: **17**
- ⚠️ DEBATABLE: **3** (#4 `vgs_th_max` schema-split, #12 `insulation_resistance` not in schema, #19 `pass band → frequency_range` semantic broadening)
- ❌ WRONG: **0**

**Precision: 17 / 20 = 85%**

## Verdict on the Precision Number

**85% — green is mostly safe but engineer should periodically review.**

Falls in the 70–90% band. Zero hard-wrong mappings, but the three debatable cases share a common failure mode: the AI accepts a mapping when the schema doesn't have an exact canonical, inventing a sibling attribute (`vgs_th_max` vs canonical `vgs_th`) or repurposing a generic one (`insulation_resistance` filed under family that only has `insulation_voltage`; `pass band → frequency_range`). These don't break anything — the override just creates a new display-only attr that won't participate in matching-engine scoring — but they fragment the schema over time.

## Recommendation

User can keep accepting green safely, but every ~50 accepts an engineer should:
1. Filter overrides where `attribute_id` is NOT present in the family's logic table → review whether to re-route to an existing canonical or formally add a new rule.
2. Spot-check L2 overrides for semantic broadening (generic IDs like `frequency_range` getting overloaded across sub-categories).

Specific cleanup actions from this batch:
- `28a54e2f...` (B5 `vsd (v) → body_diode_vf`): ✅ unrelated to sample but verified earlier — confirm body_diode_vf is in B5 schema.
- `8bffb770...` (B5 `vgs(th) max → vgs_th_max`): re-route to `vgs_th`.
- `f1f7ee16...` (69 `min. insulation resistance → insulation_resistance`): either add an `insulation_resistance` rule to commonModeChokes.ts or re-route to `insulation_voltage` (keeping in mind they're different units).
- `7b6d082a...` (RF/Wireless L2 `pass band → frequency_range`): consider adding a distinct `passband_frequency_range` L2 attribute to preserve the filter semantic.
