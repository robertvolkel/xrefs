
## Summary table

| Family | Verdict | MFRs verified | Prefixes verified | Unverified MFRs | Unverified prefixes |
|---|---|---|---|---|---|
| 12 | SUSPECTED_HALLUCINATIONS | 1/26 | 1/12 | 25 | 11 |
| 52 | SUSPECTED_HALLUCINATIONS | 5/21 | 10/28 | 16 | 18 |
| 71 | SUSPECTED_HALLUCINATIONS | 11/32 | 22/48 | 21 | 26 |
| B1 | SUSPECTED_HALLUCINATIONS | 11/37 | 18/45 | 26 | 27 |
| B3 | SUSPECTED_HALLUCINATIONS | 7/27 | 19/41 | 20 | 22 |
| B4 | SUSPECTED_HALLUCINATIONS | 7/21 | 25/37 | 14 | 12 |
| B5 | SUSPECTED_HALLUCINATIONS | 16/38 | 25/47 | 22 | 22 |
| B6 | SUSPECTED_HALLUCINATIONS | 12/38 | 40/66 | 26 | 26 |
| C1 | SUSPECTED_HALLUCINATIONS | 23/57 | 10/63 | 34 | 53 |
| C2 | SUSPECTED_HALLUCINATIONS | 24/62 | 23/93 | 38 | 70 |
| C3 | SUSPECTED_HALLUCINATIONS | 12/41 | 7/90 | 29 | 83 |
| C5 | SUSPECTED_HALLUCINATIONS | 9/39 | 14/81 | 30 | 67 |

# Domain Card Audit — 2026-05-18

Audit of 12 AI-generated domain cards for hallucinated MFRs and MPN prefixes.

Method: parse "MPN PREFIXES:" line per card → verify each MFR exists in atlas_manufacturers AND has products in the family; verify each MPN prefix returns ≥1 row in atlas_products for that family.


## Family 12 (status=active)


### MFRs (26 parsed, 1 verified, 25 unverified)


**Verified:** CCTC (594 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **Murata** — inMfrsTable=false, productsInFamily=0
- **TDK** — inMfrsTable=false, productsInFamily=0
- **Samsung** — inMfrsTable=false, productsInFamily=0
- **KEMET** — inMfrsTable=false, productsInFamily=0
- **Yageo** — inMfrsTable=false, productsInFamily=0
- **Kyocera-AVX** — inMfrsTable=false, productsInFamily=0
- **Taiyo Yuden** — inMfrsTable=false, productsInFamily=0
- **Walsin** — inMfrsTable=true, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **Class** — inMfrsTable=false, productsInFamily=0
- **Within Class** — inMfrsTable=false, productsInFamily=0
- **Voltage** — inMfrsTable=false, productsInFamily=0
- **Temperature** — inMfrsTable=false, productsInFamily=0
- **Case** — inMfrsTable=false, productsInFamily=0
- **Size** — inMfrsTable=false, productsInFamily=0
- **EIA** — inMfrsTable=false, productsInFamily=0
- **Metric** — inMfrsTable=false, productsInFamily=0
- **CONVENTIONAL** — inMfrsTable=false, productsInFamily=0
- **CAPACITANCE** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Taiyo** — inMfrsTable=false, productsInFamily=0
- **CCTC TCC** — inMfrsTable=false, productsInFamily=0
- **NOT** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (12 parsed, 1 verified, 11 unverified)


**Verified prefixes:**
- `TCC` (CCTC) — 594 products

**UNVERIFIED prefixes (potential hallucinations):**
- `GRM` (claimed for Murata) — 0 products
- `GCM` (claimed for Murata) — 0 products
- `GCJ` (claimed for Murata) — 0 products
- `KRM` (claimed for Murata) — 0 products
- `CGA` (claimed for TDK) — 0 products
- `CL` (claimed for Samsung) — 0 products
- `CC` (claimed for Yageo) — 0 products
- `AC` (claimed for Yageo) — 0 products
- `(E)MK` (claimed for Taiyo Yuden) — 0 products
- `(L` (claimed for Taiyo Yuden) — 0 products
- `0…BB` (claimed for Walsin) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): capacitance, package_case, voltage_rated, dielectric, tolerance, operating_temp, height, esr, esl, flexible_termination, msl, aec_q200, dc_bias_derating, packaging.

SUB-TYPES that look interchangeable but aren't: Class I (C0G/NP0, U2J) vs Class II (X5R, X7R, X6S, X7S, X8R) vs Class III (Y5V, Z5U). Class I has near-zero DC bias derating and ±30ppm/°C stability — never substitute Class II for Class I in timing/filter/RF circuits even if capacitance matches. Within Class II, X7R→X5R is a DOWNGRADE (temp range shrinks 125°C→85°C). Parts with flexible_termination (a.k.a. soft-termination) are a distinct sub-type — KEMET "C…X7R…7…" suffix, Murata "GCJ"/"KRM", TDK "CGA" with soft-term option. Open-mode and floating-electrode (FE-CAP, e.g. Murata "KRM55") are safety variants — not substitutable by standard MLCC.

SYNONYMS (treat as equal): C0G ≡ NP0 ≡ COG (zero-letter-O confusion). U2J is Class I but NOT the same dielectric as C0G.

NAMING: "Voltage Rating" means DC working voltage (WVDC), not surge. "Tolerance" letter codes (J/K/M) belong as the tolerance value, not a separate param. "Temperature Coefficient" and "Dielectric" are the SAME thing here — collapse to dielectric. "Case Code" / "Size Code" / "EIA Size" / "Metric Size" all map to package_case — but note 0402 imperial = 1005 metric (collision risk).

CONVENTIONAL UNITS (do NOT suffix canonical): capacitance in pF/nF/µF, voltage_rated in V, esr in mΩ, esl in pH/nH, height in mm. tolerance is %.

CAPACITANCE CODE: 3-digit JIS encoding XYn means XY × 10^n picofarads. 105 = 1,000,000 pF = 1µF. 471 = 470 pF. 332 = 3,300 pF = 3.3nF. Decode before comparing — "105" and "1uF" must be treated as equal.

HARD GATES: dielectric class downgrade, package_case mismatch, aec_q200 loss, flexible_termination loss, voltage_rated below original. Capacitance is exact-match (identity), NOT threshold — a 10µF cannot replace a 4.7µF.

MPN PREFIXES: Murata GRM/GCM/GCJ/KRM, TDK C/CGA, Samsung CL, KEMET C…, Yageo CC/AC, Kyocera-AVX 0…, Taiyo Yuden (E)MK/(L,U,T)MK, Walsin 0…BB, CCTC TCC….

CCTC TCC ENCODING: TCC<size><dielectric><cap-code><tolerance><voltage>… e.g. TCC0402X5R105K6R3 = 0402 size, X5R dielectric, 1µF (105 JIS), ±10% (K), 6.3V (6R3 with R as decimal). Trailing chars are thickness + packaging variants — review per datasheet.

FOREIGN signals to flag: dissipation_factor, capacitance_khz, ripple_current → these point to film/electrolytic/tantalum (families 58/59/60/65), NOT MLCC. lifetime_hours, polarity, surge_voltage → electrolytic. b_value → thermistor.

TYPICAL RANGES: capacitance 0.1pF–100µF; voltage_rated 4V–3kV (bulk 6.3–100V); package 01005–2225; ESR 2–500mΩ; height 0.3–2.8mm.
```

</details>


## Family 52 (status=active)


### MFRs (21 parsed, 5 verified, 16 unverified)


**Verified:** CYNTEC (478 products), DELTA (36 products), SUP (35 products), Tyohm (11 products), HKR (4 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **Yageo** — inMfrsTable=false, productsInFamily=0
- **Vishay** — inMfrsTable=false, productsInFamily=0
- **Panasonic** — inMfrsTable=false, productsInFamily=0
- **Rohm** — inMfrsTable=false, productsInFamily=0
- **KOA** — inMfrsTable=false, productsInFamily=0
- **Stackpole** — inMfrsTable=false, productsInFamily=0
- **Bourns** — inMfrsTable=false, productsInFamily=0
- **Susumu** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **Thick** — inMfrsTable=false, productsInFamily=0
- **Thin** — inMfrsTable=false, productsInFamily=0
- **Metal** — inMfrsTable=true, productsInFamily=0
- **CONVENTIONAL** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (28 parsed, 10 verified, 18 unverified)


**Verified prefixes:**
- `VSRP` (CYNTEC) — 57 products
- `SCSF` (CYNTEC) — 32 products
- `RLM` (CYNTEC) — 25 products
- `PFR` (DELTA) — 195 products
- `RR` (SUP) — 18 products
- `RMC` (Tyohm) — 11 products
- `RCT` (HKR) — 4 products
- `RC` (Yageo) — 4 products
- `CR` (Bourns) — 1 products
- `RR` (Susumu) — 18 products

**UNVERIFIED prefixes (potential hallucinations):**
- `AC` (claimed for Yageo) — 0 products
- `PT` (claimed for Yageo) — 0 products
- `RT` (claimed for Yageo) — 0 products
- `CRCW` (claimed for Vishay) — 0 products
- `TNPW` (claimed for Vishay) — 0 products
- `PAT` (claimed for Vishay) — 0 products
- `WSL` (claimed for Vishay) — 0 products
- `ERJ` (claimed for Panasonic) — 0 products
- `MCR` (claimed for Rohm) — 0 products
- `ESR` (claimed for Rohm) — 0 products
- `UCR` (claimed for Rohm) — 0 products
- `RK73` (claimed for KOA) — 0 products
- `SG73` (claimed for KOA) — 0 products
- `RMCF` (claimed for Stackpole) — 0 products
- `RNCF` (claimed for Stackpole) — 0 products
- `CSR` (claimed for Stackpole) — 0 products
- `CRL` (claimed for Bourns) — 0 products
- `RG` (claimed for Susumu) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): resistance, package_case, tolerance, power_rating, voltage_rated, tcr, composition, operating_temp, height, msl, aec_q200, anti_sulfur, packaging.

SUB-TYPES that look interchangeable but aren't: Thick Film (general purpose, ~±100ppm/°C, ±1%–±5%) vs Thin Film (precision, ~±25ppm/°C or better, ±0.1%–±1%) vs Metal Strip/Foil (current sense, sub-milliohm, four-terminal Kelvin) vs Wirewound chip (high power, inductive). Current-sense (Kelvin/4-terminal) resistors are NOT drop-in for 2-terminal even at matching R — flag as topology mismatch (note: true current-sense parts belong in family 54, not 52). Anti-sulfur and standard versions of the same MPN family are NOT interchangeable in harsh environments.

NAMING: "composition" in this family = film technology (Thick Film / Thin Film / Metal Film / Metal Foil / Wirewound), NOT chemistry. "voltage_rated" is the working/continuous voltage, distinct from overload/pulse voltage — don't conflate. "power_rating" is at 70°C ambient by convention; derating curve differences are real but not captured in this label. "tolerance" uses letter codes (J=5%, F=1%, D=0.5%, B=0.1%) — normalize to percent.

CONVENTIONAL UNITS (do not encode in canonical): resistance always Ω (with k/M scaling), tcr always ppm/°C, power_rating always W, tolerance always %. Reuse existing canonical aec_q200 (do not mint variant).

HARD GATES: package_case (0201/0402/0603/0805/1206/2010/2512 — never substitute), resistance value (exact, after E-series normalization), aec_q200 flag, anti_sulfur flag, jumper (0Ω) vs resistor distinction (industry-standard concern; not enforced by a logic-table rule today — review case-by-case).

MPN PREFIXES (Asian — observed in ingested data):
- CYNTEC VSRP/SCSF/RLM (note: many CYNTEC parts are current-sense / 4-terminal and may belong in family 54)
- DELTA PFR (e.g. PFR03S-151-FNH = 150Ω; standard 3-digit value code)
- SUP RR (e.g. RR1005(0402)L1502FT = 15kΩ; pattern RR<metric>(<imperial>)L<value-code><tol>T)
- Tyohm RMC (e.g. RMC06031%N; tolerance encoded as literal "%" in MPN)
- HKR RCT (e.g. RCT0210KJLF = 10kΩ ±5%; pattern RCT<size><value><tol>LF)

MPN PREFIXES (Western — appear via cross-reference, not yet ingested in atlas):
Yageo RC/AC/PT/RT, Vishay CRCW/TNPW/PAT/WSL (WSL=current sense), Panasonic ERJ (ERJ-P=anti-sulfur, ERJ-U=AEC), Rohm MCR/ESR/UCR, KOA RK73/SG73, Stackpole RMCF/RNCF/CSR, Bourns CR/CRL, Susumu RG/RR (thin film precision).

FOREIGN signals to flag: capacitance, dielectric → MLCC / film / electrolytic (families 12/64/58/59/60). inductance → inductor (71/72) or ferrite bead (70). vf, vr, ifsm → diode (B1–B4). b_value, beta, r25 → thermistor (67/68). hfe, vceo → transistor (B5–B7). Current-sense-specific params (sense_voltage, four_terminal, kelvin) → family 54.

TYPICAL RANGES: R: 0.001Ω–10MΩ; P: 0.05W (0201) to 1W (2512); V: 25V–200V; TCR: ±5 to ±400 ppm/°C.
```

</details>


## Family 71 (status=active)


### MFRs (32 parsed, 11 verified, 21 unverified)


**Verified:** INPAQ (1838 products), YJYCOIN (603 products), Microgate (462 products), SXN (433 products), KOHER (217 products), JWD (186 products), Wenshan (108 products), VOLUMESOURCE (44 products), CEC (1 products), Sunlord (12335 products), CYNTEC (450 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **Sunlord SDCL...** — inMfrsTable=false, productsInFamily=0
- **value-code** — inMfrsTable=false, productsInFamily=0
- **DELTA <imperial>H<type>...** — inMfrsTable=false, productsInFamily=0
- **0402HP-9N5EGTS — the leading** — inMfrsTable=false, productsInFamily=0
- **CYNTEC CML... and SDQM...** — inMfrsTable=false, productsInFamily=0
- **different product** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **Vishay** — inMfrsTable=false, productsInFamily=0
- **Coilcraft** — inMfrsTable=false, productsInFamily=0
- **TDK** — inMfrsTable=false, productsInFamily=0
- **Sumida** — inMfrsTable=true, productsInFamily=0
- **Murata** — inMfrsTable=false, productsInFamily=0
- **Rated** — inMfrsTable=false, productsInFamily=0
- **Test** — inMfrsTable=false, productsInFamily=0
- **CONVENTIONAL** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **MFR** — inMfrsTable=true, productsInFamily=0
- **VALUE-CODE** — inMfrsTable=false, productsInFamily=0
- **Taiyo** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (48 parsed, 22 verified, 26 unverified)


**Verified prefixes:**
- `as` (value-code) — 410 products
- `0402HM-470EGTS` (DELTA <imperial>H<type>...) — 1 products
- `WIP` (INPAQ) — 73 products
- `YNR` (YJYCOIN) — 156 products
- `YSPI` (YJYCOIN) — 94 products
- `MGCI` (Microgate) — 108 products
- `SM` (SXN) — 408 products
- `SMNR` (SXN) — 127 products
- `SMMS` (SXN) — 88 products
- `SMDRI` (SXN) — 34 products
- `MDA` (KOHER) — 140 products
- `MC` (JWD) — 525 products
- `MA` (JWD) — 72 products
- `PBC` (JWD) — 4 products
- `PBU` (JWD) — 17 products
- `PAR` (JWD) — 37 products
- `YTA` (Wenshan) — 52 products
- `YT` (Wenshan) — 108 products
- `VERH` (VOLUMESOURCE) — 6 products
- `VENR` (VOLUMESOURCE) — 8 products
- `VE` (VOLUMESOURCE) — 71 products
- `CI` (CEC) — 1 products

**UNVERIFIED prefixes (potential hallucinations):**
- `(dominant` (claimed for Sunlord SDCL...) — 0 products
- `66%` (claimed for Sunlord SDCL...) — 0 products
- `of` (claimed for Sunlord SDCL...) — 0 products
- `ingested` (claimed for Sunlord SDCL...) — 0 products
- `volume;` (claimed for Sunlord SDCL...) — 0 products
- `"3N0"` (claimed for value-code) — 0 products
- `3.0nH` (claimed for value-code) — 0 products
- `using` (claimed for value-code) — 0 products
- `decimal` (claimed for value-code) — 0 products
- `separator)` (claimed for value-code) — 0 products
- `(e.g` (claimed for DELTA <imperial>H<type>...) — 0 products
- `"0402"` (claimed for 0402HP-9N5EGTS — the leading) — 0 products
- `is` (claimed for 0402HP-9N5EGTS — the leading) — 0 products
- `the` (claimed for 0402HP-9N5EGTS — the leading) — 0 products
- `package` (claimed for 0402HP-9N5EGTS — the leading) — 0 products
- `SIZE` (claimed for 0402HP-9N5EGTS — the leading) — 0 products
- `code` (claimed for 0402HP-9N5EGTS — the leading) — 0 products
- `prefixes` (claimed for YJYCOIN) — 0 products
- `(two` (claimed for CYNTEC CML... and SDQM...) — 0 products
- `series` (claimed for CYNTEC CML... and SDQM...) — 0 products
- `same` (claimed for CYNTEC CML... and SDQM...) — 0 products
- `MFR` (claimed for CYNTEC CML... and SDQM...) — 0 products
- `lines)` (claimed for different product) — 0 products
- `prefixes` (claimed for SXN) — 0 products
- `prefixes` (claimed for Wenshan) — 0 products
- `prefixes` (claimed for VOLUMESOURCE) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): inductance, package_case, tolerance, saturation_current, rated_current, dcr, core_material, shielding, srf, operating_temp, height, acr, inductance_vs_dc_bias, construction_type, aec_q200, msl, packaging.

SUB-TYPES that look interchangeable but aren't:
Shielded vs Semi-Shielded vs Unshielded — never substitute down (shielding is logicType=identity_upgrade in the schema; downgrades are blocked). Molded/composite (e.g., Vishay IHLP, Coilcraft XAL/XEL, Würth WE-XHMI) have soft saturation and self-shielding; wirewound ferrite drum (Coilcraft MSS, TDK SLF, Sumida CDRH) saturate hard. construction_type is identity (hard match) — multilayer (e.g., Murata LQM) and wirewound at the same L/package are NOT interchangeable for power rails. core_material is identity_upgrade — substituting a lower-grade core (e.g., ferrite for metal composite at high DC bias) is blocked.

NAMING gotchas:
"Rated Current" in this family means Irms (thermal, ΔT typically 40°C rise) — NOT the saturation rating. Datasheets often list two currents; map the temperature-rise one to rated_current, the L-drop one (20%/30%) to saturation_current. "DCR max" and "DCR typ" both → dcr (prefer max). "Test Frequency" (test_frequency_mhz) is the L-measurement frequency (usually 100kHz or 1MHz) — does NOT imply operating frequency. Chinese labels seen: 电感量→inductance, 额定电流→rated_current, 饱和电流→saturation_current, 直流阻抗→dcr, 车规→aec_q200.

CONVENTIONAL UNITS (do not encode in canonical name):
inductance in µH/nH, dcr in mΩ, currents in A, srf in MHz, height/L/W in mm. Inch package codes (0402–1212) and metric (1005–3232) both map to package_case.

HARD GATES (logicType=identity in schema): inductance (exact, after value-code decode), package_case (exact footprint), construction_type (multilayer ≠ wirewound ≠ molded). identity_upgrade gates (no downgrade allowed): shielding, core_material. identity_flag: aec_q200.

MPN PREFIXES (Asian — observed in ingested data, 18,679 products across 12 MFRs):
- Sunlord SDCL... (dominant — 66% of ingested volume; e.g. SDCL0402H3N0BTS01 = 0402 imperial size, value-code "3N0" = 3.0nH using N as decimal separator)
- DELTA <imperial>H<type>... (e.g. 0402HM-470EGTS, 0402HP-9N5EGTS — the leading "0402" is the package SIZE code, not a manufacturer prefix; do not parse as MFR ID)
- INPAQ WIP<metric>... (e.g. WIP201208Y-R24ML; "R24" = 0.24µH using R as decimal separator)
- YJYCOIN YNR/YSPI prefixes (multiple series)
- Microgate MGCI<metric>... (e.g. MGCI1608H5N6ST-LF)
- CYNTEC CML... and SDQM... (two series — same MFR, different product lines)
- SXN SM/SMNR/SMMS/SMDRI prefixes
- KOHER MDA<package>... (e.g. MDA7050-1R0M)
- JWD MC/MA/PBC/PBU/PAR (mixed prefixes)
- Wenshan YTA/YT prefixes
- VOLUMESOURCE VERH/VENR/VE prefixes
- CEC CI...

NOTE on cross-family MFRs: CYNTEC and INPAQ also appear in other families with DIFFERENT prefix conventions (CYNTEC uses VSRP/RLM in family 52 chip resistors; INPAQ uses SMAJ-AM in B4 TVS). MFR name alone is not enough to identify product family — always combine with prefix.

VALUE-CODE DECODING (universal industry convention seen across all observed MFRs):
- "R" as decimal separator: R24 = 0.24, 1R0 = 1.0, 6R8 = 6.8, R68 = 0.68
- "N" as decimal separator in nH context: 3N0 = 3.0nH, 5N6 = 5.6nH, 9N5 = 9.5nH
- 3-digit EIA code (rare here, more common on chip resistors): "470" = 47 × 10^0 = 47, "103" = 10 × 10^3 = 10,000
- Trailing letter usually tolerance: M = ±20%, K = ±10%, J = ±5%, G = ±2%, F = ±1%
Decode before comparing — "1R0" must equal "1.0µH" must equal "1µH" in the dictionary's eyes.

MPN PREFIXES (Western — appear via cross-reference, not yet ingested in atlas):
IHLP/IHSM (Vishay), XAL/XEL/XGL/MSS/LPS/XFL (Coilcraft), SRR/SRN/SRP (Bourns), SLF/VLS/VLF/SPM (TDK), CDRH/CDMC (Sumida), WE-PD/WE-XHMI/WE-LHMI (Würth), DFE/LQM (Murata — LQM is multilayer chip), NR/NRS (Taiyo Yuden).

TYPICAL RANGES: L 1nH–470µH (smaller values appear on 0402/0603 packages, larger on 1212+); Isat 0.5A–60A; DCR 0.5mΩ–2Ω; SRF 5MHz–500MHz; heights 0.4mm–10mm.

FOREIGN flags (these point to misclassified products):
- cm_inductance, cm_impedance, common_mode_choke → family 69 (common-mode chokes). Two-port, not two-terminal.
- impedance_at_freq (with no inductance value), bead_impedance → family 70 (ferrite beads).
- capacitance, dielectric → MLCC (12) or film capacitor (64).
- b_value, r25 → thermistor (67/68).
- ciss, coss, crss, rds(on) → MOSFET (B5).
- vf, vbr → diode (B1–B4).
This family is two-terminal power chokes only — any param that implies multi-terminal or non-inductive function signals misclassification.
```

</details>


## Family B1 (status=active)


### MFRs (37 parsed, 11 verified, 26 unverified)


**Verified:** YFW (1767 products), KEXIN (1102 products), ISC (495 products), JINGDAO (415 products), Jsmc (332 products), Rectron (329 products), CREATEK (275 products), Macmic (190 products), TECH (196 products), YANGJIE (5249 products), Prisemi (573 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **YANGJIE MD<current><pkg><voltage><suffix>** — inMfrsTable=false, productsInFamily=0
- **"08" =** — inMfrsTable=false, productsInFamily=0
- **dominant at** — inMfrsTable=false, productsInFamily=0
- **e.g.** — inMfrsTable=false, productsInFamily=0
- **Prisemi P<industry-MPN>...** — inMfrsTable=false, productsInFamily=0
- **plus heavy Schottky misclassification** — inMfrsTable=false, productsInFamily=0
- **plus** — inMfrsTable=true, productsInFamily=0
- **proprietary** — inMfrsTable=false, productsInFamily=0
- **likely high-power modules at** — inMfrsTable=false, productsInFamily=0
- **Smaller MFRs** — inMfrsTable=false, productsInFamily=0
- **BDASIC) use mix of industry-standard and proprietary** — inMfrsTable=true, productsInFamily=0
- **1N5817-5822 are** — inMfrsTable=false, productsInFamily=0
- **1N4148 is** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **Within** — inMfrsTable=false, productsInFamily=0
- **KNOWN MISCLASSIFICATION** — inMfrsTable=false, productsInFamily=0
- **Triage** — inMfrsTable=false, productsInFamily=0
- **CONVENTIONAL** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Ultrafast** — inMfrsTable=false, productsInFamily=0
- **Schottky** — inMfrsTable=false, productsInFamily=0
- **Smaller** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0
- **FOREIGN-FAMILY** — inMfrsTable=false, productsInFamily=0
- **Low** — inMfrsTable=true, productsInFamily=0

### MPN Prefixes (45 parsed, 18 verified, 27 unverified)


**Verified prefixes:**
- `MD200C08D2` (YANGJIE MD<current><pkg><voltage><suffix>) — 1 products
- `MBR` (YFW) — 733 products
- `1KK` (KEXIN) — 100 products
- `P1N4007W` (Prisemi P<industry-MPN>...) — 1 products
- `1N4007` (Prisemi P<industry-MPN>...) — 19 products
- `P1N4148` (Prisemi P<industry-MPN>...) — 5 products
- `YG` (ISC) — 11 products
- `RS3JB` (JINGDAO) — 3 products
- `6SS` (Jsmc) — 32 products
- `ULBF` (Rectron) — 7 products
- `1N4448` (plus) — 21 products
- `BAS16` (CREATEK) — 33 products
- `BAS316` (CREATEK) — 10 products
- `CSB` (proprietary) — 24 products
- `MM01` (Macmic) — 21 products
- `MMF` (Macmic) — 80 products
- `MMF400` (likely high-power modules at) — 13 products
- `MMF200` (likely high-power modules at) — 24 products

**UNVERIFIED prefixes (potential hallucinations):**
- `(e.g` (claimed for YANGJIE MD<current><pkg><voltage><suffix>) — 0 products
- `likely` (claimed for YANGJIE MD<current><pkg><voltage><suffix>) — 0 products
- `200A` (claimed for YANGJIE MD<current><pkg><voltage><suffix>) — 0 products
- `class` (claimed for YANGJIE MD<current><pkg><voltage><suffix>) — 0 products
- `module` (claimed for YANGJIE MD<current><pkg><voltage><suffix>) — 0 products
- `800V` (claimed for "08" =) — 0 products
- `or` (claimed for "08" =) — 0 products
- `similar` (claimed for "08" =) — 0 products
- `voltage` (claimed for "08" =) — 0 products
- `code;` (claimed for "08" =) — 0 products
- `proprietary` (claimed for "08" =) — 0 products
- `43%` (claimed for dominant at) — 0 products
- `of` (claimed for dominant at) — 0 products
- `volume)` (claimed for dominant at) — 0 products
- `1KK2106DV)` (claimed for e.g.) — 0 products
- `(e.g` (claimed for Prisemi P<industry-MPN>...) — 0 products
- `rectifier;` (claimed for Prisemi P<industry-MPN>...) — 0 products
- `small-signal` (claimed for Prisemi P<industry-MPN>...) — 0 products
- `(MBR6040PT` (claimed for plus heavy Schottky misclassification) — 0 products
- `small-signal` (claimed for plus) — 0 products
- `misclassified` (claimed for plus) — 0 products
- `sizes)` (claimed for likely high-power modules at) — 0 products
- `(Techsem` (claimed for Smaller MFRs) — 0 products
- `PUBLIC` (claimed for TECH) — 0 products
- `prefixes` (claimed for BDASIC) use mix of industry-standard and proprietary) — 0 products
- `Schottky→B2` (claimed for 1N5817-5822 are) — 0 products
- `small-signal)` (claimed for 1N4148 is) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): recovery_category, vrrm, vdc, io_avg, vf, ifsm, trr, qrr, recovery_behavior, ir_leakage, cj, configuration, package_case, pin_configuration, rth_jc, rth_ja, tj_max, operating_temp, pd, aec_q101, mounting_style, height, packaging.

SUB-TYPES that look interchangeable but aren't:
Standard vs Fast vs Ultrafast recovery is a HARD GATE via recovery_category (logicType=identity_upgrade in the schema — downgrades blocked). Never substitute Ultrafast→Fast→Standard; breaks SMPS designs. Schottky diodes are NOT in B1 — they belong to family B2. If you see "Vf ~0.3V" + "trr not specified" + low Vrrm (<100V), flag as possible misclassification (AI Investigator wrong_family verdict). Within B1, also distinguish Single vs Dual-CC vs Dual-CA vs Dual-Series vs Bridge — configuration is identity-level; a common-cathode dual and common-anode dual share package but are NOT interchangeable.

HARD GATES (logicType=identity in schema — exact match required): configuration, package_case, pin_configuration, mounting_style. identity_upgrade gate (no downgrade allowed): recovery_category. identity_flag: aec_q101.

KNOWN MISCLASSIFICATION CAVEAT (observed in current ingested data):
B1 currently contains a meaningful number of Schottky-prefixed parts (MBR0520, MBR840, MBR6040, SS14, SS220, B0530, BAS40, BAT54) and small-signal switching diodes (1N4148, BAS16, BAS316, BAV70, BAV21, MMBD4148). The classifier doesn't fully separate these at ingest. When the Triage AI sees Schottky-only params (low Vf around 0.3V, low Vrrm, trr unspecified) on a B1 row, prefer wrong_family→B2 (Schottky). For 1N4148-style parts (Io <200mA, no thermal package), flag as small-signal — these don't have an own family today, route to wrong_family with note "small-signal switching diode, no dedicated B1/B2 fit".

NAMING gotchas:
"type" in datasheets almost always means recovery_category here (Standard/Fast/Ultrafast), NOT package or polarity. "Blocking voltage" maps to vdc, not vrrm — vrrm is specifically the repetitive peak. "Qc" and "Qrr" are the same parameter (recovered charge, nC). "Itav" / "Io(AV)" / "IF(AV)" all map to io_avg. "Pcm" / "Ptot" / "PD" → pd. "IFSM" is always single-pulse 8.3/10ms half-sine — don't confuse with repetitive IFRM.

CONVENTIONAL UNITS (don't encode in canonical name):
vrrm/vdc in V, io_avg in A, ifsm in A (peak), vf in V at specified IF, trr in ns, qrr in nC, cj in pF, ir_leakage in µA, rth in °C/W. Vf is always conditional ("vf@if=200ma") — the test current is metadata, not a separate param.

MPN PREFIXES (Asian — observed in ingested data, 12,150 products across 20 MFRs):
- YANGJIE MD<current><pkg><voltage><suffix> (e.g. MD200C08D2 — likely 200A class module, "08" = 800V or similar voltage code; proprietary, dominant at 43% of volume)
- YFW mix: MBR... (Schottky — really B2), 1N4448W (small-signal switching), ULBR/TSR prefixes for true rectifiers
- KEXIN 1KK<code> (proprietary, e.g. 1KK2106DV)
- AK mix: RS2DW/ES2JW (Fast/Ultrafast SMD rectifiers, industry-standard prefix), plus Schottky SS14F/SS220BF/MBR840DS (should be B2)
- Prisemi P<industry-MPN>... (e.g. P1N4007W = 1N4007 rectifier; P1N4148... = small-signal, misclassified)
- ISC YG..., USD..., plus heavy Schottky misclassification (MBR6040PT, MBRB10200, MBR2020CT)
- JINGDAO RS3JB (Fast rectifier SMB), SS/B0530 (Schottky misclassified)
- Jsmc 6SS<code> (proprietary)
- Rectron ULBF<code>, R<value>, plus 1N4448 small-signal misclassified
- CREATEK BAS16/BAS316 (small-signal misclassified), BAS40 (Schottky misclassified), proprietary CSB...
- Macmic MM01.../MMF... (proprietary, likely high-power modules at MMF400/MMF200 sizes)
- Smaller MFRs (Techsem, CBI, YONGYUTAI, RUILON, YENJI, Convert, TECH PUBLIC, SUP, BDASIC) use mix of industry-standard and proprietary prefixes.

MPN PREFIXES (Western — appear via cross-reference, not yet ingested in atlas):
1N (1N4001-1N4007 standard, 1N5817-5822 are Schottky→B2, 1N4148 is small-signal), UF400x (ultrafast), MUR (Motorola/onsemi ultrafast), BYV/BYW/BYT (NXP/Vishay fast), STTH (ST ultrafast), RHRP/RURP (onsemi), ES1/ES2/ES3 (SMD ultrafast — also appears at AK), S1M/S2M/S5M (SMD standard rectifiers), GBJ/GBU/KBP (bridges).

TYPICAL RANGES:
Vrrm 50V–1600V (rectifiers), 200V–1200V common for SMPS ultrafast. Io 0.5A–60A standalone, up to ~200A for modules (e.g., YANGJIE MD200). Vf 0.7–1.3V (Si PN). trr: Standard 2–10µs, Fast 100–500ns, Ultrafast 15–75ns. Tj_max 150°C or 175°C. Rth_jc DPAK ~3°C/W, TO-220 ~1.5°C/W.

FOREIGN-FAMILY FLAGS:
If you see RDS(on), VGS(th), Ciss/Coss/Crss → MOSFET (B5). VCEO, hFE, IC → BJT (B6). Vce(sat), Eon/Eoff → IGBT (B7). VF with IF<20mA and no Io rating → small-signal diode (not a dedicated family today; flag as wrong_family for engineer review). Low Vf (~0.3V) + low Vrrm + no trr → Schottky (B2). Vz/Izt → Zener (B3). Vrwm + polarity bidi/uni + Vc clamping → TVS (B4).
```

</details>


## Family B3 (status=active)


### MFRs (27 parsed, 7 verified, 20 unverified)


**Verified:** YANGJIE (1605 products), YFW (929 products), KEXIN (862 products), Prisemi (345 products), Rectron (50 products), RUILON (2 products), CREATEK (30 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **140V; dominant at** — inMfrsTable=false, productsInFamily=0
- **YENJI all use mix of** — inMfrsTable=false, productsInFamily=0
- **PESD/ESDA/SP05/SMAJ/SMBJ** — inMfrsTable=false, productsInFamily=0
- **B3 if only** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **Regulation** — inMfrsTable=false, productsInFamily=0
- **Precision Voltage** — inMfrsTable=false, productsInFamily=0
- **ESD** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **Working** — inMfrsTable=false, productsInFamily=0
- **Standoff** — inMfrsTable=false, productsInFamily=0
- **CONVENTIONAL** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **NXP** — inMfrsTable=false, productsInFamily=0
- **MELF** — inMfrsTable=false, productsInFamily=0
- **Diodes** — inMfrsTable=false, productsInFamily=0
- **Asian** — inMfrsTable=false, productsInFamily=0
- **Onsemi** — inMfrsTable=true, productsInFamily=0
- **Vishay** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (41 parsed, 19 verified, 22 unverified)


**Verified prefixes:**
- `SMB5Z` (YANGJIE) — 47 products
- `MM1W` (YFW) — 114 products
- `MM1Z` (YFW) — 366 products
- `MMSZ` (YFW) — 291 products
- `KMM` (KEXIN) — 37 products
- `RLZ` (KEXIN) — 47 products
- `P1SMB` (Prisemi) — 43 products
- `BZT52` (YENJI all use mix of) — 806 products
- `MM1Z` (YENJI all use mix of) — 366 products
- `MM3Z` (YENJI all use mix of) — 108 products
- `MMSZ` (YENJI all use mix of) — 291 products
- `1SMA` (YENJI all use mix of) — 539 products
- `BZX884` (Rectron) — 34 products
- `BZX85` (Rectron) — 10 products
- `ZMM` (RUILON) — 75 products
- `BZT52` (CREATEK) — 806 products
- `CZ3D` (CREATEK) — 2 products
- `1SMA` (CREATEK) — 539 products
- `1SML` (CREATEK) — 2 products

**UNVERIFIED prefixes (potential hallucinations):**
- `31%` (claimed for 140V; dominant at) — 0 products
- `of` (claimed for 140V; dominant at) — 0 products
- `volume)` (claimed for 140V; dominant at) — 0 products
- `industry-standard` (claimed for YENJI all use mix of) — 0 products
- `prefixes` (claimed for YENJI all use mix of) — 0 products
- `(TVS-family` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `overlap` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `confirm` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `B3` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `vs` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `B4` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `by` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `checking` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `for` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `vrwm` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `vc` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `presence:` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `B4` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `if` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `both` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `present` (claimed for PESD/ESDA/SP05/SMAJ/SMBJ) — 0 products
- `vz)` (claimed for B3 if only) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): vz, vz_tolerance, pd, zzt, zzk, tc, izt, izm, ir_leakage, vf, cj, regulation_type, package_case, pin_configuration, configuration, mounting_style, height, rth_ja, tj_max, operating_temp, aec_q101, packaging.

SUB-TYPES that look interchangeable but aren't:
1) Regulation Zeners (single, ~2.4–200V, vz is the point) vs 2) Precision Voltage References (tight tolerance ±1–2%, low TC, e.g. 1N821–829, LM329, LM399 — still B3 but vz_tolerance and tc dominate) vs 3) TVS/ESD Zeners (low cj, configuration=dual common anode or array, e.g. PESDxxx, ESDxxx, SP05xx — cj and esd_rating matter, vz is the working/standoff voltage) vs 4) Bidirectional/dual-series clamps (total clamp = 2×Vz + Vf). Configuration is a HARD GATE — never substitute single for dual or common-cathode for common-anode.

HARD GATES (logicType=identity in schema — exact match required): vz, izt, configuration, package_case, pin_configuration, mounting_style. identity_flag: aec_q101. vz_tolerance is threshold (tighter is OK, looser is NOT — natural threshold semantics on tolerance).

NAMING gotchas:
- "Working Voltage" or "Standoff Voltage" on TVS-style Zeners is NOT vz — it's the operating voltage below breakdown. Map vz to the actual breakdown spec ("VBR", "Vz nom").
- "vzt", "vz @ izt", "vzt nom" → vz. "vz(min)"/"vz(max)" → _vz_min/_vz_max bracket pair (display-only, underscore-prefixed), not vz.
- "Vr" or "Vrwm" on ESD parts = working reverse voltage (operating), distinct from Vz breakdown.
- ir_leakage is specified AT a stated Vr (always below Vz) — "ir @ vr" is the canonical pattern.
- tc may appear as "αVz", "TC", "θVz" in mV/°C or %/°C — same canonical.

CONVENTIONAL UNITS (don't suffix the canonical): vz in V, izt in mA, zzt/zzk in Ω, pd in mW or W, cj in pF, tc in mV/°C, ir_leakage in µA.

MPN PREFIXES (Asian — observed in ingested data, 5,118 products across 12 MFRs):
- YANGJIE SMB5Z<voltage><tol> (e.g. SMB5Z140A = SMB package, 5W class, 140V; dominant at 31% of volume)
- YFW MM1W/MM1Z/MMSZ (industry-standard SOD-package Zeners — MMSZ is genuine NXP convention; MM1W/MM1Z proprietary)
- KEXIN KMM/RLZ (proprietary prefixes)
- AK BZT52C/MM1W/MM1Z (BZT52 is industry-standard SOT-23 Zener; mixed)
- Prisemi P1SMB<industry-MPN> (e.g. P1SMB5932B = P-prefixed 1SMB5932; consistent Prisemi pattern across B1/B3/B4 — they prepend P to standard industry MPNs)
- YONGYUTAI, CBI, JINGDAO, YENJI all use mix of BZT52/MM1Z/MM3Z/MMSZ/1SMA industry-standard prefixes
- Rectron BZX884/BZX85 (industry-standard NXP MELF and SOT-23)
- RUILON ZMM (industry-standard MELF Zener)
- CREATEK BZT52/CZ3D/1SMA/1SML (note: CREATEK ingests series-range entries like "BZT52B2V4S thur BZT52B75S" as single rows — un-matchable by exact MPN; data-quality issue, not a cheat-sheet fix)

MPN PREFIXES (Western — appear via cross-reference):
1N47xx/1N52xx/1N53xx (classic through-hole), BZX84/BZX85/BZT52/BZV55 (NXP/Diodes SMD — also seen at Asian MFRs above), MMSZ/MMBZ (Onsemi SMD — also seen at YFW/YENJI), PDZ/PLVA (NXP), TZMC (Vishay MELF), PESD/ESDA/SP05/SMAJ/SMBJ (TVS-family overlap — confirm B3 vs B4 by checking for vrwm/vc presence: B4 if both present, B3 if only vz).

REUSE existing canonicals: cj (shared with B1/B4), esd_rating (B4/C7) for TVS-style parts — do NOT mint B3 variants.

TYPICAL RANGES: vz 1.8V–200V (most common 2.4–75V); pd 200mW (SOT-23 small-signal Zener) to 5W (SMB power Zener); zzt 5Ω–500Ω depending on Vz; cj 50–500pF; tc -3mV/°C to +12mV/°C (sign flips near vz ≈ 5.6V — below is negative, above is positive); izt typical 1–20mA depending on package; tj_max usually 150°C or 175°C.

FOREIGN signals to flag (these point to misclassified products):
- vrwm + vc clamping voltage → TVS (B4), not B3. A part with both vrwm AND vc specified belongs in B4 even if it has Zener-like vz.
- polarity bidi/uni explicitly stated → TVS (B4).
- trr / qrr → rectifier (B1) — Zeners aren't characterized for reverse recovery.
- vf without vz → rectifier or small-signal switching diode (B1).
- rds(on), vgs(th) → MOSFET (B5).
- vceo, hfe → BJT (B6).
- inductance, dcr → inductor.
- dielectric, capacitance class → MLCC (12) — note B3's cj is junction capacitance, NOT a dielectric class.
- Marking-only fields (e.g., "Marking", standalone alphabetic codes) → data-only, not a misclassification signal but should not be treated as a substitution gate.
```

</details>


## Family B4 (status=active)


### MFRs (21 parsed, 7 verified, 14 unverified)


**Verified:** YANGJIE (4124 products), Prisemi (2008 products), YFW (1437 products), INPAQ (1280 products), CREATEK (375 products), KEXIN (334 products), TECH (283 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **e.g.** — inMfrsTable=false, productsInFamily=0
- **TVS2225H220P — does** — inMfrsTable=false, productsInFamily=0
- **JINGDAO use generic** — inMfrsTable=false, productsInFamily=0
- **Rectron — mix of standard** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **POLARITY IS** — inMfrsTable=false, productsInFamily=0
- **FIRST HARD** — inMfrsTable=false, productsInFamily=0
- **OTHER HARD** — inMfrsTable=false, productsInFamily=0
- **UNIT** — inMfrsTable=false, productsInFamily=0
- **SUFFIX** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Littelfuse** — inMfrsTable=false, productsInFamily=0
- **Asian** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (37 parsed, 25 verified, 12 unverified)


**Verified prefixes:**
- `TVS1922S180P` (e.g.) — 1 products
- `TVS` (TVS2225H220P — does) — 20 products
- `1.0SMBJ` (Prisemi) — 97 products
- `P6SMB` (Prisemi) — 617 products
- `P6KE` (YFW) — 466 products
- `1.5KE` (YFW) — 380 products
- `P6SMB` (YFW) — 617 products
- `ESDU0501` (YFW) — 1 products
- `ESD1006B` (YFW) — 12 products
- `SMAJ` (JINGDAO use generic) — 834 products
- `SMBJ` (JINGDAO use generic) — 1095 products
- `SMCJ` (JINGDAO use generic) — 851 products
- `SMF` (JINGDAO use generic) — 630 products
- `CEST23NC` (CREATEK) — 21 products
- `CESD3` (CREATEK) — 49 products
- `1KE7I` (KEXIN) — 5 products
- `1KE6I` (KEXIN) — 5 products
- `ESD` (Rectron — mix of standard) — 528 products
- `SMAJ` (Rectron — mix of standard) — 834 products
- `PESD` (Rectron — mix of standard) — 296 products
- `PSM` (Rectron — mix of standard) — 246 products
- `PRTR` (Rectron — mix of standard) — 2 products
- `TEP` (Rectron — mix of standard) — 28 products
- `TPAZ` (Rectron — mix of standard) — 7 products
- `TPE` (Rectron — mix of standard) — 39 products

**UNVERIFIED prefixes (potential hallucinations):**
- `TVS19xx` (claimed for YANGJIE) — 0 products
- `TVS22xx` (claimed for YANGJIE) — 0 products
- `NOT` (claimed for TVS2225H220P — does) — 0 products
- `follow` (claimed for TVS2225H220P — does) — 0 products
- `JEDEC;` (claimed for TVS2225H220P — does) — 0 products
- `~33%` (claimed for TVS2225H220P — does) — 0 products
- `of` (claimed for TVS2225H220P — does) — 0 products
- `ingested` (claimed for TVS2225H220P — does) — 0 products
- `volume)` (claimed for TVS2225H220P — does) — 0 products
- `SMAJ...-AM` (claimed for INPAQ) — 0 products
- `PUBLIC` (claimed for TECH) — 0 products
- `proprietary` (claimed for Rectron — mix of standard) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): polarity, vrwm, vbr, vc, ppk, ipp, cj, ir_leakage, response_time, esd_rating, num_channels, configuration, package_case, pin_configuration, mounting_style, rth_ja, tj_max, operating_temp, pd, height, aec_q101, surge_standard, packaging.

POLARITY IS THE FIRST HARD GATE. "Unidirectional" vs "Bidirectional" (sometimes spelled "Uni/Bi", "directional", or symbol ↔ vs →) is non-substitutable. Bidirectional parts have no forward Vf knee — using a unidirectional on an AC or differential line will clamp asymmetrically and likely destroy the protected node.

OTHER HARD GATES (all logicType=identity in the schema — exact match required, no threshold logic): vrwm, vbr, num_channels, configuration, package_case, pin_configuration, mounting_style. A 4-channel array cannot replace a 2-channel even at matching Vrwm; an SMA cannot replace an SMB. AEC-Q101 and surge_standard (IEC 61000-4-5 / ISO 7637) are identity_flag gates — if original has the qual, replacement must too.

SUB-TYPES that look interchangeable but aren't:
- Power-rail TVS (SMA/SMB/SMC/DO-214, DO-15, DO-201, P600): high Ppk (400W–30kW), high Cj (50–5000pF), no ESD spec.
- Signal-line TVS arrays (SOT-23, SOT-553, SOT-563, DFN, µDFN, 0201/0402 flip-chip): ultra-low Cj (0.2–3pF), high ESD (IEC 61000-4-2 ±8kV to ±30kV), low Ppk.
- Steering-diode arrays vs rail-to-rail vs back-to-back vs discrete — these are the `configuration` values; not interchangeable even at identical Vrwm/Cj.

NAMING / UNIT CONVENTIONS:
- "Vc" always = clamping at Ipp, NOT at 1mA (that's Vbr). Datasheets list both — don't conflate.
- "C" or "Cj" on a datasheet is pF, measured at 0V or 1MHz — for arrays it may be line-to-ground vs line-to-line (different numbers, same label). Treat as `cj`.
- "Contact (kV)" and "Air (kV)" both map to `esd_rating` — engineers accept contact as the canonical. Always kV, don't suffix.
- "vbr(min)" → `vbr`; "vbr(max)" → `_vbr_max` (separate display-only canonical, already in family — underscore prefix).
- "Ir" / "IR" / "ILeakage" always µA → `ir_leakage`.
- CJK labels appear frequently: "通道數"=num_channels, "靜電次數"=esd_pulse_count, "尺寸代碼"=package_case.
- `esd_pulse_count` is TVS-specific (repetitive ESD strikes survived) — do not map to generic "pulses" in other families.

A / CA SUFFIX CONVENTION (verified across multiple MFRs in ingested data):
- "A" suffix = unidirectional (default). "CA" suffix = bidirectional. Applies to SMAJ/SMBJ/SMCJ/SMDJ/SMF/P6KE/1.5KE/P6SMB families.
- Examples: SMDJ26A (uni) vs SMDJ26CA (bidi); P6KE91A vs P6KE91CA; 1.5KE82CA (bidi). Watch this suffix on every MPN — getting it wrong is the polarity hard gate violation.

MPN PREFIXES (Asian — observed in ingested data, 12,542 products across 17 MFRs):
- YANGJIE TVS19xx / TVS22xx (proprietary, e.g. TVS1922S180P, TVS2225H220P — does NOT follow JEDEC; ~33% of ingested TVS volume)
- Prisemi 1.0SMBJ.../P6SMB... (JEDEC body codes with a leading "1.0" power-tier prefix)
- AK SMDJ/P6KE/ESD3Z/ESD5Z (JEDEC + small-ESD families)
- YFW P6KE/1.5KE/P6SMB/ESDU0501.../ESD1006B...
- INPAQ SMAJ...-AM (SMAJ with "-AM" suffix)
- RUILON, JINGDAO use generic SMAJ/SMBJ/SMCJ/SMF
- CREATEK CEST23NC.../CESD3... (proprietary)
- KEXIN 1KE7I.../1KE6I... (proprietary "1KE" with internal voltage code)
- TECH PUBLIC, YENJI, Rectron — mix of standard ESD/SMAJ/PESD/PSM/PRTR + proprietary TEP/TPAZ/TPE.

MPN PREFIXES (Western — appear via cross-reference, not yet ingested in atlas):
SMAJ/SMBJ/SMCJ/SMDJ/SMFJ (Littelfuse/Vishay power), P6KE/1.5KE/5KP/15KP (power), PESD/ESDA (NXP/ST signal arrays), SP/SPxxxx (Littelfuse SPA), TPD (TI), USBLC6, RClamp (Semtech), AQ (auto). 5KP/15KP and P6KE families are unidirectional unless suffixed "CA" — same convention as Asian MFRs above.

FOREIGN signals to flag (these point to misclassified products):
- vf (forward voltage) without bidirectional polarity → rectifier diode (B1), not TVS.
- vz, izt (Zener test current) → Zener diode (B3).
- rds(on), vgs(th), id → MOSFET (B5).
- vceo, hfe, ft → BJT (B6).
- vce(sat), eon, eoff → IGBT (B7).
- dielectric, capacitance_class → MLCC (12) — note: TVS `cj` is junction capacitance, NOT a dielectric class.
- inductance, dcr → inductor (71/72) or ferrite bead (70).
- vbr WITHOUT polarity/vc/ppk context → Zener (B3) misclassified as TVS.

REUSE: do not mint `clamping_voltage`, `capacitance`, or `channel_count` variants — `vc`, `cj`, `num_channels` are the family canonicals.

TYPICAL RANGES: vrwm 3V–600V (most common 5–58V); vc roughly 1.2–2× vrwm; ppk 200W (small ESD arrays) to 30kW (large bolt-on); cj 0.5pF (signal-line arrays) to 5000pF (high-power); esd_rating ±2kV to ±30kV (IEC 61000-4-2); ir_leakage typically <1µA at vrwm; height 0.6–10mm depending on package family.
```

</details>


## Family B5 (status=active)


### MFRs (38 parsed, 16 verified, 22 unverified)


**Verified:** ISC (4069 products), KEXIN (1281 products), Sinopower (910 products), YANGJIE (747 products), YFW (736 products), NCE (694 products), Convert (605 products), Chiplead (463 products), Prisemi (293 products), VANGUARD (186 products), APSEMI (37 products), Macmic (7 products), Rectron (50 products), Jsmc (370 products), TECH (45 products), JINGDAO (5 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **package callout in** — inMfrsTable=false, productsInFamily=0
- **e.g.** — inMfrsTable=false, productsInFamily=0
- **JINGDAO F<id>N<vds>** — inMfrsTable=false, productsInFamily=0
- **YENJI ship Western prefixes directly** — inMfrsTable=false, productsInFamily=0
- **2SK3018) — these are** — inMfrsTable=false, productsInFamily=0
- **Fortior — smaller proprietary** — inMfrsTable=false, productsInFamily=0
- **IRF/IRFP/IRFR** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **SiC** — inMfrsTable=true, productsInFamily=0
- **GaN** — inMfrsTable=true, productsInFamily=0
- **STANDARD GATE** — inMfrsTable=false, productsInFamily=0
- **Specs** — inMfrsTable=false, productsInFamily=0
- **ONLY** — inMfrsTable=false, productsInFamily=0
- **GATE** — inMfrsTable=true, productsInFamily=0
- **BODY** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Western** — inMfrsTable=false, productsInFamily=0
- **Infineon** — inMfrsTable=false, productsInFamily=0
- **Wuxi NCE** — inMfrsTable=false, productsInFamily=0
- **SILICON** — inMfrsTable=true, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (47 parsed, 25 verified, 22 unverified)


**Verified prefixes:**
- `IRF` (ISC) — 628 products
- `IRFP` (ISC) — 110 products
- `IRFB` (ISC) — 82 products
- `SM` (Sinopower) — 911 products
- `MC` (YANGJIE) — 4 products
- `YJD` (YANGJIE) — 205 products
- `YJG` (YANGJIE) — 152 products
- `YFW` (YFW) — 713 products
- `YFW50N06` (e.g.) — 7 products
- `NCE` (NCE) — 691 products
- `NCEAP` (NCE) — 60 products
- `NCE` (NCE) — 691 products
- `CTD` (Convert) — 25 products
- `CSN` (Convert) — 9 products
- `CSB` (Convert) — 4 products
- `VAT` (Chiplead) — 109 products
- `VAM` (Chiplead) — 268 products
- `PSIC` (Prisemi) — 13 products
- `VS` (VANGUARD) — 180 products
- `VSA` (VANGUARD) — 3 products
- `AC2M` (APSEMI) — 9 products
- `AC3M` (APSEMI) — 28 products
- `MMN` (Macmic) — 7 products
- `RMD` (Rectron) — 5 products
- `6M` (Jsmc) — 159 products

**UNVERIFIED prefixes (potential hallucinations):**
- `2KJDFN` (claimed for KEXIN) — 0 products
- `MPN)` (claimed for package callout in) — 0 products
- `50A` (claimed for e.g.) — 0 products
- `60V` (claimed for e.g.) — 0 products
- `N-channel)` (claimed for e.g.) — 0 products
- `(Wuxi` (claimed for NCE) — 0 products
- `Power)` (claimed for NCE) — 0 products
- `prefixes` (claimed for NCE) — 0 products
- `DN` (claimed for JINGDAO F<id>N<vds>) — 0 products
- `PUBLIC` (claimed for TECH) — 0 products
- `(AO3400` (claimed for YENJI ship Western prefixes directly) — 0 products
- `clones` (claimed for 2SK3018) — these are) — 0 products
- `prefixes` (claimed for Fortior — smaller proprietary) — 0 products
- `(Infineon` (claimed for IRF/IRFP/IRFR) — 0 products
- `including` (claimed for IRF/IRFP/IRFR) — 0 products
- `IR-acquired)` (claimed for IRF/IRFP/IRFR) — 0 products
- `TO-220` (claimed for IRF/IRFP/IRFR) — 0 products
- `TO-247` (claimed for IRF/IRFP/IRFR) — 0 products
- `D2PAK;` (claimed for IRF/IRFP/IRFR) — 0 products
- `standard` (claimed for IRF/IRFP/IRFR) — 0 products
- `gate` (claimed for IRF/IRFP/IRFR) — 0 products
- `threshold` (claimed for IRF/IRFP/IRFR) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): channel_type, technology, pin_configuration, package_case, aec_q101, vds_max, vgs_max, id_max, id_pulse, pd, avalanche_energy, rds_on, vgs_th, qg, qgd, qgs, ciss, coss, crss, body_diode_vf, body_diode_trr, rth_jc, rth_ja, soa, height, mounting_style, packaging.

POLARITY — N-channel vs P-channel: HARD GATE (channel_type, logicType=identity). Never cross-substitute. Drain-source voltage polarity is opposite; gate threshold sign flips; schematic and PCB layout assume one polarity.

HARD GATES (logicType=identity in schema — exact match required): channel_type, pin_configuration, package_case, mounting_style. identity_flag gates (must match if original requires): technology (Si/SiC/GaN), aec_q101.

SUB-TYPES — three physical technologies lumped together (the `technology` attribute):
- Si MOSFET (most common, Vds usually ≤300V trench, ≤900V planar)
- SiC MOSFET (higher Vds 650–1700V, different Vgs window — typically 0V/+15V or -5V/+20V, NOT ±20V like Si)
- GaN HEMT (depletion or enhancement mode, sometimes filed under B5, sometimes B9). Cross-technology substitution rarely works without driver redesign.

LOGIC-LEVEL vs STANDARD GATE THRESHOLD — critical distinction:
- Logic-level (Vgs(th) = 1–2V): can be driven by 3.3V / 5V GPIO directly. Often suffixed "L" (IRLZ44N), "logic level", or specs Rds(on) at Vgs=4.5V.
- Standard (Vgs(th) = 2–4V): needs >8V gate drive for full enhancement. Specs Rds(on) at Vgs=10V only.

Rds(on) ONLY VALID at the spec'd Vgs — comparing 10V-spec'd Rds(on) to 4.5V-spec'd Rds(on) is misleading. Always preserve the spec Vgs.

GATE CHARGE (Qg, Qgs, Qgd) drives switching loss — context-dependent relevance: high-frequency switching needs low Qg; linear regions don't.

BODY DIODE is intrinsic (Vf, trr, Irrm) — replacement must have equivalent or better. Synchronous-rectifier applications care intensely. body_diode_trr is a hard threshold; body_diode_vf is too.

MPN PREFIXES (Asian — observed in ingested data, 11,482 products across 26 MFRs):
- ISC IRF/IRFP/IRFB (dominant at 35% of volume — note: these are ISC-manufactured CLONES of the Western Infineon/IR MPNs; the IRF540A you get from ISC is NOT the same silicon as Infineon IRF540A. Match by name, not by equivalence).
- KEXIN 2KJ<num>DFN (proprietary, package callout in MPN)
- Sinopower SM<num><N/D/P><suffix> (N/P channel encoded in mid-MPN)
- AK AK/AKZE prefixes
- YANGJIE MC/YJD/YJG (multiple proprietary series)
- YFW YFW<id-current><N/P><voltage><suffix> (clear N/P encoding, e.g. YFW50N06 = 50A 60V N-channel)
- NCE (Wuxi NCE Power) NCEAP/NCE prefixes
- Convert CTD/CSN/CSB
- Chiplead VAT/VAM
- Prisemi PSIC<...> (SILICON CARBIDE — DIFFERENT from their P+industry-MPN pattern in B1/B3/B4 families; PSIC is their SiC line)
- VANGUARD VS/VSA
- APSEMI AC2M/AC3M (SiC MOSFETs)
- Macmic MMN (high-voltage modules)
- Rectron RM<current><N><voltage>D
- Jsmc 6M<series>
- JINGDAO F<id>N<vds> / D<id>N<vds> (terse proprietary)
- TECH PUBLIC, YONGYUTAI, CBI, CREATEK, YENJI ship Western prefixes directly (AO3400, SI2301, BSS138, 2N7002, IRLML6401, 2SK3018) — these are clones, not Western originals.
- BL, Ruichips, AWINIC, LOWPOWER, Fortior — smaller proprietary prefixes (BL/RU/AW/LPM/FMD).

MPN PREFIXES (Western — appear via cross-reference or as clone targets):
- IRF/IRFP/IRFR (Infineon — including IR-acquired) — TO-220/TO-247/D2PAK; standard gate threshold.
- IRLR/IRLML/IRLZ (Infineon "L" = logic-level)
- BSS/BSP/BSO (small-signal SOT-23)
- SI/SiR/SiSS (Vishay)
- NTMFS/NTM (Onsemi power)
- AO/AOZ (Alpha & Omega — also seen at TECH PUBLIC/YONGYUTAI as clones)
- 2N7000/2N7002 (logic-level small-signal classic)
- 2SK (Toshiba — includes some JFETs in B9 territory; check by Vp/Idss presence)
- BSC/IPP/IPB (Infineon OptiMOS)
- STD/STP/STB (ST)

TYPICAL RANGES: vds_max 12V (logic-level low-V) to 1700V (SiC); vgs_max ±20V (Si standard), 0/+25V or -5/+25V (SiC); id_max 100mA (small-signal SOT-23) to 200A+ (TO-247 / module); rds_on 0.5mΩ (very-high-current) to 10Ω+ (small-signal); qg 1nC (small-signal) to 200nC+ (large power); body_diode_vf 0.7–1.5V; body_diode_trr 30ns–500ns depending on family.

FOREIGN signals to flag (these point to misclassified products):
- vceo, hfe, ft → BJT (B6). MOSFETs have no base-current-driven gain spec.
- vce(sat), eon, eoff → IGBT (B7). MOSFETs spec Rds(on) for conduction loss, not Vce(sat).
- vp (pinch-off), idss → JFET (B9). MOSFETs are enhancement-mode (off at Vgs=0) so Idss is essentially leakage; explicit Idss = JFET tell.
- vrrm, io_avg, ifsm → rectifier diode (B1). Two-terminal, no gate.
- vz, izt, vz_tolerance → Zener (B3).
- vrwm, vc clamping, polarity bidi → TVS (B4).
- Single specs without gate-related params (no vgs anything, no qg) → not a MOSFET. Check whether the part is actually a discrete or has been categorized wrong.
```

</details>


## Family B6 (status=active)


### MFRs (38 parsed, 12 verified, 26 unverified)


**Verified:** ISC (4673 products), YANGJIE (731 products), CBI (187 products), YFW (133 products), YONGYUTAI (78 products), Rectron (50 products), CREATEK (28 products), JINGDAO (16 products), Prisemi (48 products), VANGUARD (15 products), Everlight (39 products), IDCHIP (1 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **2SA=PNP** — inMfrsTable=false, productsInFamily=0
- **2SD=NPN** — inMfrsTable=false, productsInFamily=0
- **MJE/MJL=NPN epitaxial. Same** — inMfrsTable=false, productsInFamily=0
- **and Chinese-popular** — inMfrsTable=false, productsInFamily=0
- **MIXIC/WADE/BL/IDCHIP** — inMfrsTable=false, productsInFamily=0
- **BCX/BCP** — inMfrsTable=false, productsInFamily=0
- **e.g.** — inMfrsTable=false, productsInFamily=0
- **MMBT** — inMfrsTable=false, productsInFamily=0
- **MPS** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **NOT** — inMfrsTable=false, productsInFamily=0
- **KEXIN** — inMfrsTable=true, productsInFamily=0
- **Diodes Inc** — inMfrsTable=false, productsInFamily=0
- **Digital** — inMfrsTable=false, productsInFamily=0
- **FOREIGN-FAMILY** — inMfrsTable=false, productsInFamily=0
- **The** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Japanese** — inMfrsTable=false, productsInFamily=0
- **Western** — inMfrsTable=false, productsInFamily=0
- **Same** — inMfrsTable=false, productsInFamily=0
- **DGW** — inMfrsTable=false, productsInFamily=0
- **POPULAR** — inMfrsTable=false, productsInFamily=0
- **Chinese** — inMfrsTable=false, productsInFamily=0
- **SMD** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (66 parsed, 40 verified, 26 unverified)


**Verified prefixes:**
- `2SC` (ISC) — 1077 products
- `2SA` (ISC) — 405 products
- `2SD` (ISC) — 893 products
- `MJE` (ISC) — 88 products
- `MJL` (ISC) — 4 products
- `DGZ` (YANGJIE) — 6 products
- `DGW` (YANGJIE) — 41 products
- `MMDT` (CBI) — 47 products
- `BCX` (CBI) — 29 products
- `2SC` (CBI) — 1077 products
- `MMBT` (YFW) — 171 products
- `MJD` (YONGYUTAI) — 33 products
- `DTC` (YONGYUTAI) — 102 products
- `S8550` (YONGYUTAI) — 13 products
- `MMBT` (YONGYUTAI) — 171 products
- `S9018` (YONGYUTAI) — 4 products
- `BCX` (Rectron) — 29 products
- `2SA` (Rectron) — 405 products
- `RT` (Rectron) — 6 products
- `2SC` (Rectron) — 1077 products
- `S9012` (CREATEK) — 13 products
- `S8550` (CREATEK) — 13 products
- `MMBT2222AW` (CREATEK) — 3 products
- `S8050` (CREATEK) — 14 products
- `MMBT3904W` (CREATEK) — 5 products
- `S9014` (JINGDAO) — 11 products
- `MMBT5551` (JINGDAO) — 10 products
- `S8550` (JINGDAO) — 13 products
- `MMBT2907A` (JINGDAO) — 11 products
- `S9012` (JINGDAO) — 13 products
- `HCKD` (VANGUARD) — 2 products
- `HCKW` (VANGUARD) — 10 products
- `ITR` (Everlight) — 29 products
- `EAITRDA` (Everlight) — 3 products
- `ULN2003` (MIXIC/WADE/BL/IDCHIP) — 6 products
- `ULN2402` (MIXIC/WADE/BL/IDCHIP) — 1 products
- `ULN2803` (MIXIC/WADE/BL/IDCHIP) — 2 products
- `WD2002` (MIXIC/WADE/BL/IDCHIP) — 1 products
- `BCX55` (e.g.) — 7 products
- `MMBT3904` (MMBT) — 27 products

**UNVERIFIED prefixes (potential hallucinations):**
- `small-signal` (claimed for 2SA=PNP) — 0 products
- `power` (claimed for 2SD=NPN) — 0 products
- `MPN` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `as` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `Western` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `original` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `same` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `silicon` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `Match` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `by` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `name;` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `flag` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `substitutability` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `with` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `caution.)` (claimed for MJE/MJL=NPN epitaxial. Same) — 0 products
- `prefixes` (claimed for CBI) — 0 products
- `S-series)` (claimed for and Chinese-popular) — 0 products
- `PIF` (claimed for Prisemi) — 0 products
- `(SOT-89` (claimed for BCX/BCP) — 0 products
- `power` (claimed for BCX/BCP) — 0 products
- `(SMD` (claimed for MMBT) — 0 products
- `SOT-23` (claimed for MMBT) — 0 products
- `industry` (claimed for MMBT) — 0 products
- `standard` (claimed for MMBT) — 0 products
- `(Motorola` (claimed for MPS) — 0 products
- `MPS2222` (claimed for MPS) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): polarity, package_case, vceo_max, vces_max, vce_sat, vbe_sat, hfe, ft, tst, ton, toff, ic_max, pd, rth_jc, tj_max, soa, aec_q101, packaging.

POLARITY — NPN vs PNP: HARD GATE (logicType=identity). Collector-emitter polarity opposite; biasing topology flips; cannot cross-substitute.

HARD GATES (logicType=identity in schema): polarity, package_case. identity_flag: aec_q101. Other attributes are thresholds (vceo_max, vces_max, vce_sat, ic_max, pd, etc.) or application_review (hfe, soa).

"BJT_DIGITAL" IS NOT A FAMILY — KEXIN DTCxxx, Diodes Inc DDTC, and similar pre-biased transistors (datasheet calls them "Digital Transistors") are still B6 BJTs with internal bias resistors (R1 on the base, optional R2 base-emitter). Map their bias resistor values as satellite canonicals (`_bias_r1_kohm`, `_bias_r2_kohm`) — NOT as a separate "BJT_DIGITAL" family. The valid family IDs are listed in the FAMILY_ID_CONSTRAINT section of this prompt — DO NOT invent new ones (constrained explicitly per Decision #185 follow-up).

FOREIGN-FAMILY PARAM NAMES — these belong unambiguously to B6 and indicate wrong-family classification if seen on a non-B6 product (matches FAMILY_PARAM_SIGNATURES registry):
- BVCEO / BVCBO / BVEBO / VCEO / VCBO / VEBO — collector / base / emitter breakdown voltages. NOT seen on MOSFETs, JFETs, IGBTs, thyristors. The "O" suffix = "open terminal" measurement, a BJT-only condition. If you see these on a non-B6 product → bucket 'wrong_family'.
- @IC / Ic (collector current with @-prefix convention) — BJT-specific.
- hFE (DC current gain) — BJT-only. (FETs have transconductance gm, not gain.)
- fT (transition frequency / unity-current-gain frequency) — BJT-specific (distinct from fmax in digital logic).

FOREIGN signals to flag (these indicate the product is NOT a BJT — wrong_family verdict on the B6 row):
- rds_on, vgs_th, qg, ciss/coss/crss → MOSFET (B5).
- vce(sat) WITH eon/eoff/ets switching energy → IGBT (B7). BJTs spec ton/toff but not switching energy in mJ.
- vp (pinch-off), idss → JFET (B9).
- vrrm, io_avg, trr → rectifier diode (B1).
- vz, izt → Zener (B3).
- vrwm, vc, polarity bidi → TVS (B4).
- "phototransistor" or any optical-input language, CTR (current transfer ratio), viso → optocoupler (E1) or photo-interrupter (currently no dedicated family — flag for engineer review).
- Multi-channel arrays with 7+ Darlington pairs (ULN2003/ULN2803) — these are integrated driver ICs, not discrete BJTs. Flag for review; B6 is for discrete transistors.

hFE IS GRADE-DEPENDENT within a part number (2N2222A vs 2N2222 vs PN2222A have different hFE bins). Sub-grade letters matter for precision designs.

MPN PREFIXES (Asian — observed in ingested data, 6,101 products across 17 MFRs):
- ISC 2SC/2SA/2SD/MJE/MJL (DOMINANT — 77% of volume; ISC-manufactured CLONES of Japanese JIS small-signal and Western Motorola/onsemi epitaxial. 2SC=NPN small-signal, 2SA=PNP small-signal, 2SD=NPN power, MJE/MJL=NPN epitaxial. Same MPN as Western original ≠ same silicon. Match by name; flag substitutability with caution.)
- YANGJIE DGZ/DGW (proprietary — note: many DGZ/DGW MPNs with "N65" voltage code look IGBT-class; likely a misclassification batch worth Triage review)
- CBI MMDT/BCX/2SC prefixes (mix of dual-die and industry-standard)
- YFW MMBT (industry-standard SOT-23 SMD — MMBT3906/MMBT4401/MMBT5089/MMBTA44)
- AK 2SC/2SD/DTC/MMBTA (DTC = digital transistor with internal bias resistors — pre-biased; stays in B6)
- YONGYUTAI MJD/DTC/S8550/MMBT/S9018 (mix of Western Motorola, digital, and Chinese-popular S-series)
- Rectron BCX/2SA/RT/2SC
- CREATEK S9012/S8550/MMBT2222AW/S8050/MMBT3904W (Chinese small-signal + industry-standard)
- JINGDAO S9014/MMBT5551/S8550/MMBT2907A/S9012 (similar to CREATEK)
- Prisemi PI<series>F<vds><suffix> (NOTE: PI prefix here is different from their P+industry pattern in B1/B3/B4; many PI*F65 / PI*S120 entries are likely IGBT misclassifications — review)
- VANGUARD HCKD/HCKW (proprietary; same N65 IGBT-suspicious pattern as YANGJIE)
- Everlight ITR/EAITRDA (MISCLASSIFIED — these are photo interrupters/optoelectronic; do not score as BJTs)
- MIXIC/WADE/BL/IDCHIP ULN2003/ULN2402/ULN2803/WD2002 (Darlington array ICs — borderline; flag for engineer review on whether they belong in B6 or in a driver-IC family)

POPULAR S-SERIES (universal Chinese-data convention seen across multiple MFRs above):
- S9012 = PNP small-signal SOT-23 (300mA, ~30V) — substitutable with 2N3906/MMBT3906 class
- S9013 = NPN small-signal — substitutable with 2N3904 class
- S9014/S9018 = NPN higher-frequency small-signal
- S8050 = NPN medium-current (~700mA)
- S8550 = PNP medium-current
These are NOT MFR-specific (often unmarked Chinese ICs/transistors) — multiple MFRs ship them under identical part numbers with no MFR brand visible.

MPN PREFIXES (Western — appear via cross-reference, also seen as clone targets in Asian data):
- 2N (industry classic through-hole — 2N2222, 2N3904, 2N3906, 2N2907, 2N5551)
- BC (European through-hole — BC547, BC548)
- BCX/BCP (SOT-89 power, e.g. BCX55, BCP56)
- MMBT (SMD SOT-23 industry standard — MMBT3904, MMBT3906, MMBT5551)
- MMDT/MMDTA (dual SMD — two transistors in one package)
- DTC/DTA (Rohm/Diodes pre-biased "digital" transistors — stay in B6 with bias-resistor satellites)
- MPS (Motorola — MPS2222, MPSA42)
- KSP (Fairchild/onsemi — KSP44)
- MJE/MJL (Motorola/onsemi epitaxial NPN — also clone targets at ISC)
- 2SC/2SA/2SB/2SD (Japanese JIS — also clone targets at ISC)

TYPICAL RANGES: vceo_max 20V (small-signal) to 400V (high-voltage NPN, e.g. MJE13003); ic_max 100mA (SOT-23 small-signal) to 15A (TO-247 power); hfe 50–800 (grade-dependent within same MPN); ft 50MHz (small-signal RF) to 500MHz (high-fT RF); vce_sat 0.1–1.0V at rated ic; pd 200mW (SOT-23) to 100W+ (TO-247); tj_max 150°C or 175°C; ton/toff 10ns–500ns typical small-signal switching.
```

</details>


## Family C1 (status=active)


### MFRs (57 parsed, 23 verified, 34 unverified)


**Verified:** MingDa (352 products), SUNTEK (143 products), YFW (55 products), HOLTEK (39 products), LOW (15 products), HONGWAN (29 products), DIOO (26 products), Convert (22 products), YANGJIE (18 products), TECH PUBLIC (16 products), AWINIC (15 products), LOWPOWER (15 products), ETA (15 products), GIGADEVICE (13 products), WADE (11 products), LEN (9 products), Kiwi (6 products), ESMT (6 products), COSINE (5 products), TMI (5 products), Gainsil (3 products), TECH (16 products), PUBLIC (16 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **KEXIN — ships** — inMfrsTable=false, productsInFamily=0
- **78M15) under** — inMfrsTable=false, productsInFamily=0
- **flag** — inMfrsTable=false, productsInFamily=0
- **ISC ships** — inMfrsTable=false, productsInFamily=0
- **3PEAK TPL<num>** — inMfrsTable=false, productsInFamily=0
- **real Chinese analog** — inMfrsTable=false, productsInFamily=0
- **AMS1117** — inMfrsTable=false, productsInFamily=0
- **L78xx** — inMfrsTable=false, productsInFamily=0
- **AP2112** — inMfrsTable=false, productsInFamily=0
- **MIC5219** — inMfrsTable=false, productsInFamily=0
- **TPS735x** — inMfrsTable=false, productsInFamily=0
- **RT9013** — inMfrsTable=false, productsInFamily=0
- **HT7333** — inMfrsTable=false, productsInFamily=0
- **also seen at** — inMfrsTable=false, productsInFamily=0
- **LP2950** — inMfrsTable=false, productsInFamily=0
- **XC6206** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **OUTPUT** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **DROPOUT** — inMfrsTable=false, productsInFamily=0
- **NEVER** — inMfrsTable=false, productsInFamily=0
- **QUIESCENT** — inMfrsTable=false, productsInFamily=0
- **OUTPUT CAPACITOR** — inMfrsTable=false, productsInFamily=0
- **Ceramic** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Toshiba** — inMfrsTable=false, productsInFamily=0
- **GENUINE** — inMfrsTable=false, productsInFamily=0
- **Chinese** — inMfrsTable=false, productsInFamily=0
- **UNIVERSAL CLONE** — inMfrsTable=false, productsInFamily=0
- **Asian** — inMfrsTable=false, productsInFamily=0
- **Same** — inMfrsTable=false, productsInFamily=0
- **Diodes** — inMfrsTable=false, productsInFamily=0
- **Torex** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (63 parsed, 10 verified, 53 unverified)


**Verified prefixes:**
- `MD` (MingDa) — 352 products
- `as` (78M15) under) — 7 products
- `AMS1117` (YFW) — 32 products
- `HT7330` (HOLTEK) — 2 products
- `HT7333` (HOLTEK) — 4 products
- `HT7544` (HOLTEK) — 5 products
- `HT7550` (HOLTEK) — 7 products
- `HT7833` (HOLTEK) — 1 products
- `LM7805` (AMS1117) — 2 products
- `HT7350` (HT7333) — 4 products

**UNVERIFIED prefixes (potential hallucinations):**
- `SK60-` (claimed for SUNTEK) — 0 products
- `78xx` (claimed for KEXIN — ships) — 0 products
- `79xx` (claimed for KEXIN — ships) — 0 products
- `LINE` (claimed for KEXIN — ships) — 0 products
- `clones` (claimed for KEXIN — ships) — 0 products
- `EXACT` (claimed for 78M15) under) — 0 products
- `industry-standard` (claimed for 78M15) under) — 0 products
- `part` (claimed for 78M15) under) — 0 products
- `numbers` (claimed for 78M15) under) — 0 products
- `NOT` (claimed for 78M15) under) — 0 products
- `same` (claimed for 78M15) under) — 0 products
- `silicon` (claimed for 78M15) under) — 0 products
- `ST` (claimed for 78M15) under) — 0 products
- `L78xx` (claimed for 78M15) under) — 0 products
- `or` (claimed for 78M15) under) — 0 products
- `onsemi` (claimed for 78M15) under) — 0 products
- `MC78xx` (claimed for 78M15) under) — 0 products
- `Match` (claimed for 78M15) under) — 0 products
- `by` (claimed for 78M15) under) — 0 products
- `name` (claimed for 78M15) under) — 0 products
- `substitutability` (claimed for flag) — 0 products
- `proprietary` (claimed for YFW) — 0 products
- `YFW73xx` (claimed for YFW) — 0 products
- `clones` (claimed for YFW) — 0 products
- `78xx` (claimed for ISC ships) — 0 products
- `79xx` (claimed for ISC ships) — 0 products
- `TA78xx` (claimed for ISC ships) — 0 products
- `(proprietary` (claimed for 3PEAK TPL<num>) — 0 products
- `IC` (claimed for real Chinese analog) — 0 products
- `company)` (claimed for real Chinese analog) — 0 products
- `GENUINE` (claimed for HOLTEK) — 0 products
- `Holtek` (claimed for HOLTEK) — 0 products
- `µA-class` (claimed for HOLTEK) — 0 products
- `LDOs` (claimed for HOLTEK) — 0 products
- `LM1117` (claimed for AMS1117) — 0 products
- `L79xx` (claimed for L78xx) — 0 products
- `MC78xx` (claimed for L78xx) — 0 products
- `MC79xx` (claimed for L78xx) — 0 products
- `AP7115` (claimed for AP2112) — 0 products
- `AP7361` (claimed for AP2112) — 0 products
- `MIC5205` (claimed for MIC5219) — 0 products
- `MIC29302` (claimed for MIC5219) — 0 products
- `TPS736x` (claimed for TPS735x) — 0 products
- `TPS796x` (claimed for TPS735x) — 0 products
- `TPS7A4x` (claimed for TPS735x) — 0 products
- `RT9080` (claimed for RT9013) — 0 products
- `RT9166` (claimed for RT9013) — 0 products
- `HT75xx` (claimed for HT7333) — 0 products
- `CBI` (claimed for also seen at) — 0 products
- `YONGYUTAI)` (claimed for also seen at) — 0 products
- `LP5907` (claimed for LP2950) — 0 products
- `TLV70x` (claimed for LP2950) — 0 products
- `XC6209` (claimed for XC6206) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): output_type, output_voltage, package_case, polarity, vin_max, vin_min, iout_max, vdropout, iq, vout_accuracy, output_cap_compatibility, psrr, load_regulation, line_regulation, enable_pin, power_good, soft_start, thermal_shutdown, rth_ja, tj_max, aec_q100, packaging.

OUTPUT VOLTAGE — primary spec (logicType=identity): fixed-output (3.3V, 5V, 1.8V, etc. — single SKU per voltage) vs ADJUSTABLE (one SKU, voltage set externally via Vfb feedback divider). output_type is HARD GATE — these are different sub-types and rarely substitute directly even with the same dropout rating.

HARD GATES (logicType=identity in schema): output_type, output_voltage, package_case, polarity, enable_pin (active-high/active-low/absent are not interchangeable). identity_flag gates (must match if original requires): output_cap_compatibility, power_good, soft_start, thermal_shutdown, aec_q100.

DROPOUT VOLTAGE at rated current — NEVER UPSIZE. A 1V-dropout LDO cannot replace a 0.1V-dropout LDO in a low-headroom rail (battery near end-of-life, 3.3V-from-3.4V supply). Replacement vdropout must be ≤ original. Threshold-direction rule in the matching engine enforces this.

QUIESCENT CURRENT (Iq) — critical for battery designs. µA-class Iq (TPS735x, MIC5219, RT9013, HT7333) cannot be replaced with mA-class (AMS1117, LM1117) without killing battery life. Context-dependent: industrial designs don't care. iq is threshold (lower is better).

PSRR @ frequency — critical for analog rails (ADC reference supplies, RF VCO supplies, audio rails). Datasheet often specs PSRR at 1 kHz and 100 kHz separately; need both for noise-sensitive designs. logicType=application_review — engineer judges per design.

OUTPUT CAPACITOR STABILITY (output_cap_compatibility) — older bipolar pass-device LDOs (LM317, classic AMS1117/LM1117) require minimum ESR (often 0.1–1Ω) and may oscillate with low-ESR ceramic caps; modern CMOS pass-device LDOs (AP2112, TPS73x, HT73xx) require LOW ESR and may oscillate with high-ESR tantalums. Replacement must be in the same stability class — this is the "Ceramic Stable" identity_flag.

MPN PREFIXES (Asian — observed in ingested data, 1,216 products across 29 MFRs):
- MingDa MD<num><suffix> (proprietary — dominant at 29% of volume; e.g. MD85A35PA1 = 3.5V output likely; verify per datasheet)
- BL (Belling) BL<num><suffix>-<voltage>BARN/CB5ATR<voltage> (voltage encoded mid-suffix; e.g. BL8568GCB5ATR30 = 3.0V)
- SUNTEK SK60<num><suffix>-<voltage>
- KEXIN — ships 78xx/79xx LINE clones (78L05, 78L09, 78L12, 78M15) under EXACT industry-standard part numbers. NOT same silicon as ST L78xx or onsemi MC78xx. Match by name, flag substitutability.
- YFW mix: proprietary YFW73xx + AMS1117 clones (e.g. AMS1117-1.9S — unusual voltage but real)
- ISC ships 78xx/79xx + TA78xx (Toshiba TA prefix) clones at high volume
- 3PEAK TPL<num> (proprietary, real Chinese analog IC company)
- HOLTEK HT7330/HT7333/HT7544/HT7550/HT7833 — GENUINE Holtek µA-class LDOs (Taiwan); HT7333 is the canonical 3.3V/170mA µA-class part the original draft mentions
- YONGYUTAI mix: AMS1117 + 78xx + HT clones (ships everything)
- HONGWAN HNLPD<num> (proprietary)
- DIOO DIA/DIO<num>
- Convert CSV<num> (CSV2925 likely LM2925 clone — verify per-MPN)
- YANGJIE YJ<num>D (proprietary YJ-prefixed 78xx variants — YJ7805D, YJ78L05Y)
- TECH PUBLIC TPRT9013-<voltage>GB (RT9013 clone — Richtek µA-class); also XC6206 (Torex clone) and TP/TPMP proprietary
- AWINIC AW<num> — ALSO ships "X Series" un-matchable entries (caught by phase-1 ingest validator)
- LOWPOWER LP<num>-<voltage>B<package>F
- ETA ETA<num>V<voltage><suffix> (real Chinese MFR; voltage encoded mid-MPN)
- GIGADEVICE GD30LD<num><x|X> — many rows have trailing x/X PLACEHOLDER (un-matchable; caught by phase-1 validator)
- CBI mix: HT clones + 79L<voltage>U
- WADE WD78<voltage> (78xx clones)
- AK 78L<voltage>/78M<voltage> (78xx clones)
- LEN LN<num>Q1<suffix> (auto-grade Q1 = AEC-Q100)
- Kiwi KP<num>
- ESMT EMP8130-<voltage>VN05NRR (proprietary)
- COSINE COS<num>WU
- TMI TMI<num>-<voltage>
- Gainsil GS2019-<xx|voltage>TR — uses mid-MPN `xx` PLACEHOLDER (e.g. `GS2019-xxTR`); NOT yet caught by phase-1 validator (only trailing x/X detected); should be folded into validator phase 1.5 or addressed manually
- COSINE/MIXIC/RYCHIP/Convert mix smaller proprietary prefixes

UNIVERSAL CLONE CAVEAT: 78xx/79xx (and AMS1117) part numbers appear at 8+ Asian MFRs in this family. Same MPN ≠ same silicon — KEXIN's 78L05 is not Fairchild's MC78L05 even though the MPN is identical. The matching engine should treat MFR identity as a substitution gate when both MFR and MPN match a Western original.

MPN PREFIXES (Western — appear via cross-reference and as clone targets):
- AMS1117 / LM1117 / LM7805 (classic 1A bipolar — heavy clone targets at YFW, YONGYUTAI, KEXIN, ISC, YANGJIE, WADE)
- L78xx / L79xx / MC78xx / MC79xx (ST and onsemi originals; clone targets at KEXIN/ISC/CBI/AK)
- AP2112 / AP7115 / AP7361 (Diodes Inc — low-power CMOS)
- MIC5219 / MIC5205 / MIC29302 (Microchip — µCap class)
- TPS735x / TPS736x / TPS796x / TPS7A4x (TI)
- RT9013 / RT9080 / RT9166 (Richtek — clone targets at TECH PUBLIC)
- HT7333 / HT7350 / HT75xx (Holtek — genuine Asian, also seen at CBI/YONGYUTAI)
- LP2950 / LP5907 / TLV70x (TI low-Iq)
- XC6206 / XC6209 (Torex Japan — clone target at TECH PUBLIC)
- LM317 (Adjustable classic)

TYPICAL RANGES:
- output_voltage: 0.6V (modern adjustable point-of-load) to 28V; most common 1.2V / 1.5V / 1.8V / 2.5V / 3.3V / 5V / 12V
- vin_max: 5.5V (cellphone Li-ion only) to 60V (industrial input)
- iout_max: 50mA (small SOT-23) to 5A (large TO-220 / DPAK)
- vdropout: 50mV (advanced CMOS µCap) to 2V+ (classic bipolar 1117 at full load)
- iq: 1µA (battery-class HT7333) to 5mA+ (classic AMS1117); µA vs mA class is the major design split
- vout_accuracy: ±0.5% (precision references) to ±4% (low-cost 78xx)
- psrr: 40dB (cheap classic) to 90dB+ (low-noise audio/ADC supplies) at 1kHz

FOREIGN signals to flag (these point to misclassified products):
- topology=buck/boost, fsw, vref → switching regulator (C2), not LDO. LDOs have NO switching frequency by definition.
- vds_max, rds_on, qg → MOSFET (B5).
- output_polarity isolated → isolated DC-DC (also C2).
- Multiple outputs / VDDIO+VDDA → PMIC (multi-rail; no dedicated family today).
- topology=charge_pump → charge-pump regulator (currently borderline C1/C2; flag for engineer review).
- AVO (open-loop gain), CMRR → op-amp (C4).
- vceo, hfe → BJT (B6).
- Battery-charge termination spec → battery charger IC (no dedicated family today).
- Multi-channel (>2 outputs) with no polarity field → likely PMIC or multi-output controller.

```

</details>


## Family C2 (status=active)


### MFRs (62 parsed, 24 verified, 38 unverified)


**Verified:** DIOO (77 products), ETA (48 products), 3PEAK (34 products), LEN (17 products), CYNTEC (16 products), TMI (15 products), RYCHIP (15 products), AWINIC (13 products), LOWPOWER (7 products), TECH (4 products), SIT (4 products), CHIPANALOG (3 products), Prisemi (2 products), YANGJIE (2 products), CHIP (18 products), Kiwi (103 products), Convert (37 products), MingDa (23 products), Link (12 products), GIGADEVICE (8 products), TECH PUBLIC (4 products), KEXIN (4 products), HOLTEK (4 products), Toybrick (3 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **DELTA brick/module patterns** — inMfrsTable=false, productsInFamily=0
- **Kiwi KP<num> proprietary chip** — inMfrsTable=false, productsInFamily=0
- **Convert CSV<num>** — inMfrsTable=false, productsInFamily=0
- **MingDa MD<num> — note** — inMfrsTable=false, productsInFamily=0
- **Hi-Link B<Vin><Vout>S-<power>WR<rev> and HLK-<power>D<Vin><Vout> —** — inMfrsTable=false, productsInFamily=0
- **GIGADEVICE GD30DC<num> — note** — inMfrsTable=false, productsInFamily=0
- **KEXIN KM<num> —** — inMfrsTable=false, productsInFamily=0
- **HOLTEK HT<num>** — inMfrsTable=false, productsInFamily=0
- **Toybrick RK<num>** — inMfrsTable=false, productsInFamily=0
- **TPS54xxx** — inMfrsTable=false, productsInFamily=0
- **LM2596** — inMfrsTable=false, productsInFamily=0
- **LT3xxx** — inMfrsTable=false, productsInFamily=0
- **MP1xxx** — inMfrsTable=false, productsInFamily=0
- **SY8120** — inMfrsTable=false, productsInFamily=0
- **RT8xxx** — inMfrsTable=false, productsInFamily=0
- **MAX73x** — inMfrsTable=false, productsInFamily=0
- **MC34063** — inMfrsTable=false, productsInFamily=0
- **MAX7660** — inMfrsTable=false, productsInFamily=0
- **NCP31xx** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **ARCHITECTURE** — inMfrsTable=false, productsInFamily=0
- **Integrated** — inMfrsTable=false, productsInFamily=0
- **Switching** — inMfrsTable=false, productsInFamily=0
- **CONTROL** — inMfrsTable=false, productsInFamily=0
- **OUTPUT** — inMfrsTable=false, productsInFamily=0
- **SWITCHING** — inMfrsTable=false, productsInFamily=0
- **Vref FOR** — inMfrsTable=false, productsInFamily=0
- **SYNCHRONOUS** — inMfrsTable=false, productsInFamily=0
- **The** — inMfrsTable=false, productsInFamily=0
- **Future** — inMfrsTable=false, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Chinese DIO** — inMfrsTable=false, productsInFamily=0
- **LOAD** — inMfrsTable=false, productsInFamily=0
- **ISOLATED DC-DC** — inMfrsTable=false, productsInFamily=0
- **Natl** — inMfrsTable=true, productsInFamily=0
- **Monolithic** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (93 parsed, 23 verified, 70 unverified)


**Verified prefixes:**
- `PJ-` (DELTA brick/module patterns) — 26 products
- `DIO` (DIOO) — 77 products
- `ETA` (ETA) — 48 products
- `TPP` (3PEAK) — 26 products
- `MD7660` (MingDa MD<num> — note) — 1 products
- `MD3156` (MingDa MD<num> — note) — 5 products
- `MUN3C` (CYNTEC) — 12 products
- `MSN` (CYNTEC) — 6 products
- `TMI` (TMI) — 12 products
- `STI` (TMI) — 3 products
- `RY` (RYCHIP) — 15 products
- `AW` (AWINIC) — 13 products
- `LP` (LOWPOWER) — 7 products
- `TP` (TECH) — 38 products
- `KM34063` (KEXIN KM<num> —) — 1 products
- `KM34064` (KEXIN KM<num> —) — 1 products
- `KM34065` (KEXIN KM<num> —) — 1 products
- `KM7660` (KEXIN KM<num> —) — 1 products
- `SIT2596S-` (SIT) — 4 products
- `CA-IS` (CHIPANALOG) — 3 products
- `PM` (Prisemi) — 82 products
- `JBZ` (YANGJIE) — 1 products
- `JBR` (YANGJIE) — 1 products

**UNVERIFIED prefixes (potential hallucinations):**
- `prefix` (claimed for Kiwi KP<num> proprietary chip) — 0 products
- `proprietary` (claimed for Convert CSV<num>) — 0 products
- `patterns` (claimed for MingDa MD<num> — note) — 0 products
- `look` (claimed for MingDa MD<num> — note) — 0 products
- `like` (claimed for MingDa MD<num> — note) — 0 products
- `MAXIM` (claimed for MingDa MD<num> — note) — 0 products
- `clones` (claimed for MingDa MD<num> — note) — 0 products
- `LNQ1-` (claimed for LEN) — 0 products
- `POINT-OF-LOAD` (claimed for CYNTEC) — 0 products
- `MODULES` (claimed for CYNTEC) — 0 products
- `ISOLATED` (claimed for Hi-Link B<Vin><Vout>S-<power>WR<rev> and HLK-<power>D<Vin><Vout> —) — 0 products
- `DC-DC` (claimed for Hi-Link B<Vin><Vout>S-<power>WR<rev> and HLK-<power>D<Vin><Vout> —) — 0 products
- `BRICKS` (claimed for Hi-Link B<Vin><Vout>S-<power>WR<rev> and HLK-<power>D<Vin><Vout> —) — 0 products
- `many` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `sample` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `MPNs` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `end` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `in` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `literal` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `"x"` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `or` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `"X"` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `placeholder` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `character` (claimed for GIGADEVICE GD30DC<num> — note) — 0 products
- `PUBLIC` (claimed for TECH) — 0 products
- `are` (claimed for KEXIN KM<num> —) — 0 products
- `CLONES` (claimed for KEXIN KM<num> —) — 0 products
- `of` (claimed for KEXIN KM<num> —) — 0 products
- `onsemi` (claimed for KEXIN KM<num> —) — 0 products
- `MC34063` (claimed for KEXIN KM<num> —) — 0 products
- `family;` (claimed for KEXIN KM<num> —) — 0 products
- `is` (claimed for KEXIN KM<num> —) — 0 products
- `MAX7660` (claimed for KEXIN KM<num> —) — 0 products
- `clone` (claimed for KEXIN KM<num> —) — 0 products
- `CLONES` (claimed for SIT) — 0 products
- `of` (claimed for SIT) — 0 products
- `LM2596` (claimed for SIT) — 0 products
- `in` (claimed for SIT) — 0 products
- `standard` (claimed for SIT) — 0 products
- `12V` (claimed for SIT) — 0 products
- `5V` (claimed for SIT) — 0 products
- `3.3V` (claimed for SIT) — 0 products
- `ADJ` (claimed for SIT) — 0 products
- `voltage` (claimed for SIT) — 0 products
- `variants` (claimed for SIT) — 0 products
- `(HT7750SA` (claimed for HOLTEK HT<num>) — 0 products
- `is` (claimed for HOLTEK HT<num>) — 0 products
- `genuine` (claimed for HOLTEK HT<num>) — 0 products
- `Holtek` (claimed for HOLTEK HT<num>) — 0 products
- `step-up` (claimed for HOLTEK HT<num>) — 0 products
- `reg` (claimed for HOLTEK HT<num>) — 0 products
- `(Rockchip-affiliated` (claimed for Toybrick RK<num>) — 0 products
- `TPS62xxx` (claimed for TPS54xxx) — 0 products
- `TPS65xxx` (claimed for TPS54xxx) — 0 products
- `LM2575` (claimed for LM2596) — 0 products
- `LM3478` (claimed for LM2596) — 0 products
- `LTC3xxx` (claimed for LT3xxx) — 0 products
- `MP2xxx` (claimed for MP1xxx) — 0 products
- `SY8088` (claimed for SY8120) — 0 products
- `RT9xxx` (claimed for RT8xxx) — 0 products
- `MAX17x` (claimed for MAX73x) — 0 products
- `MAX19x` (claimed for MAX73x) — 0 products
- `MC33063` (claimed for MC34063) — 0 products
- `(Maxim` (claimed for MAX7660) — 0 products
- `charge-pump` (claimed for MAX7660) — 0 products
- `clone` (claimed for MAX7660) — 0 products
- `targets` (claimed for MAX7660) — 0 products
- `at` (claimed for MAX7660) — 0 products
- `KEXIN` (claimed for MAX7660) — 0 products
- `NCP59xx` (claimed for NCP31xx) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): topology, architecture, package_case, control_mode, output_polarity, vin_min, vin_max, vout_range, iout_max, fsw, ton_min, gate_drive_current, vref, compensation_type, soft_start, enable_uvlo, ocp_mode, thermal_shutdown, rth_ja, tj_max, aec_q100, packaging.

TOPOLOGY — HARD GATE (logicType=identity): buck (step-down), boost (step-up), buck-boost (either direction), SEPIC, flyback (isolated), forward (isolated), full-bridge, half-bridge, push-pull, inverting, resonant. NEVER cross topologies. A buck and a boost are different power-stage architectures with different inductor placement, diode/sync-rect placement, and feedback topology. Cross-topology replacement is a board redesign, not a part swap.

ARCHITECTURE SUB-GATE (logicType=identity) — Integrated Switch (built-in power MOSFET) vs Controller-Only (external MOSFETs required) vs Half-Bridge vs Full-Bridge. Digikey splits these: "DC DC Switching Regulators" = integrated; "DC DC Switching Controllers" = controller-only. Integrated and controller variants of the same topology are NOT drop-in: controllers need external FETs + gate-drive design.

HARD GATES (all logicType=identity in schema — exact match required): topology, architecture, package_case, control_mode, output_polarity, fsw. identity_flag gates (must match if original requires): compensation_type, soft_start, enable_uvlo, ocp_mode, aec_q100. vref is special (logicType=vref_check) — see VREF section below.

CONTROL MODE — identity gate: peak current mode, voltage mode, hysteretic, COT (constant on-time), average current. Loop compensation requirements differ; substituting peak-current for voltage-mode breaks the existing comp network.

OUTPUT POLARITY — identity gate: Positive, Negative, Isolated. An inverting buck-boost is functionally a different chip from a positive-output buck even if Vin/Iout match.

SWITCHING FREQUENCY (fsw) — identity gate, but practically context-dependent: replacement must be within ±10% of original or the L/C values are wrong. Some parts have programmable fsw (RT pin) — preserve that flexibility. Cross fsw decade changes (e.g., 500kHz → 2.2MHz) silently break the original inductor/cap selection.

Vref FOR FEEDBACK — critical for adjustable outputs (logicType=vref_check enforces ±2% tolerance window in the matching engine). Vref typically 0.6V, 0.8V, or 1.0V; the feedback divider was sized for the original Vref. A replacement with a different Vref changes the output voltage by the same ratio — silent failure unless the divider is recalculated.

SYNCHRONOUS RECTIFICATION vs ASYNCHRONOUS — sync uses an integrated low-side FET (better efficiency, no Schottky needed); async uses an external Schottky diode. Substitution across this boundary requires board change. This is captured implicitly by the architecture+topology pair rather than as a separate canonical.

MODULE / BRICK vs CHIP DISTINCTION:
The C2 family currently mixes silicon-chip regulators (the schema's design intent) with board-level DC-DC modules and bricks. The latter ship as complete subsystems with the inductor / output caps / sense pins all integrated. When the AI sees a "module" or "brick" product (telltale: MPN encodes voltage/wattage like 12V150W, has a "S" or "WLNA" suffix, weight/dimensions instead of die-level specs), most of the chip-level canonicals (fsw, vref, control_mode, compensation_type) are unspecified — those are encapsulated inside the module. Don't fabricate values; mark as unmapped and prefer module-level canonicals (input voltage class, output voltage, output power rating, isolation, footprint family). Future BACKLOG item: dedicated module family C2-MOD vs chip C2-IC split.

MPN PREFIXES (Asian — observed in ingested data, 901 products across 24 MFRs):
- DELTA brick/module patterns: PJ-<Vout><Wattage><suffix> (e.g. PJ-12V150WLRA), DNL/E48 series for 48V-input modules, often with -S/-N suffixes. NOT chip-level products.
- Kiwi KP<num> proprietary chip prefix
- DIOO DIO<num> (Chinese DIO Microcircuits)
- BL (Belling) BL<num>CB5TR (chip-level)
- ETA ETA<num><suffix>
- Convert CSV<num> proprietary
- 3PEAK TPP<num> (real Chinese analog IC company)
- MingDa MD<num> — note: MD7660 / MD3156 patterns look like MAXIM clones (MAX7660 = charge-pump regulator; verify equivalence per-MPN, not by name)
- LEN LN<num>Q1-<suffix> (Q1 in name = automotive AEC-Q100)
- CYNTEC MUN3C/MSN<num> — POINT-OF-LOAD MODULES, not chips
- TMI TMI<num>/STI<num>
- RYCHIP RY<num>
- AWINIC AW<num>
- Hi-Link B<Vin><Vout>S-<power>WR<rev> and HLK-<power>D<Vin><Vout> — ISOLATED DC-DC BRICKS, not chips
- GIGADEVICE GD30DC<num> — note: many sample MPNs end in literal "x" or "X" placeholder character (e.g. GD30DC1101x); these are un-matchable, data quality issue similar to CREATEK ranges
- LOWPOWER LP<num>
- TECH PUBLIC TP<num>
- KEXIN KM<num> — KM34063/KM34064/KM34065 are CLONES of onsemi MC34063 family; KM7660 is MAX7660 clone
- SIT SIT2596S-<voltage> — CLONES of LM2596 in standard 12V/5V/3.3V/ADJ voltage variants
- HOLTEK HT<num> (HT7750SA is genuine Holtek step-up reg, not a clone)
- Toybrick RK<num> (Rockchip-affiliated, niche)
- CHIPANALOG CA-IS<num> (isolated DC-DC products — confirm vs digital isolator family C7)
- Prisemi PM<num>
- YANGJIE JBZ/JBR (different from their B-block diode prefixes — proprietary IC line)

MPN PREFIXES (Western — appear via cross-reference, also seen as clone targets):
- TPS54xxx / TPS62xxx / TPS65xxx (TI integrated buck and PMIC)
- LM2596 / LM2575 / LM3478 (TI/Natl Semi integrated and controller — LM2596 clone targets at SIT)
- LM5xxx (TI controller)
- LT3xxx / LTC3xxx (LT/ADI)
- MP1xxx / MP2xxx (Monolithic Power)
- MIC2xxx (Microchip)
- AOZ1xxx (Alpha & Omega)
- SY8120 / SY8088 (Silergy buck — Asian brand widely used in Western xref data)
- RT8xxx / RT9xxx (Richtek — same situation as Silergy)
- MAX73x / MAX17x / MAX19x (Maxim/ADI)
- MC34063 / MC33063 (onsemi classic controller — clone targets at KEXIN)
- MAX7660 (Maxim charge-pump — clone targets at KEXIN, MingDa)
- NCP31xx / NCP59xx (onsemi)

TYPICAL RANGES (chip-level — module products have their own ranges):
- vin: 2.5V (cellphone Li-ion regulators) to 100V (high-Vin controllers like LM5160) or 600V+ (offline AC/DC)
- vout: 0.6V (modern point-of-load) to 60V (boost)
- iout: 200mA (small POL) to 30A (multi-phase controllers)
- fsw: 100kHz (low-noise, older designs) to 2.2MHz (small inductor, automotive)
- vref: 0.6V / 0.8V / 1.0V (most common); 1.225V (LM317-style); 5V (older)
- vin_max headroom: typical replacements maintain ≥120% of original
- aec_q100: required for automotive — never downgrade

FOREIGN signals to flag (these point to misclassified products):
- "linear" or "ldo" in topology / no fsw / no inductor pin → LDO (C1), not C2.
- Vref without topology/fsw → voltage reference (C6), not C2.
- Gate-only specs (Vgs drive, no Vout regulation) → gate driver (C3).
- Sensing-only specs (CMRR, gain, no power switch) → op-amp (C4) or current sense (54).
- "PFC" topology with no DC-DC output → power factor controller (currently no dedicated family — flag for engineer review).
- Battery charger (charge termination, end-of-charge voltage, NTC sense) → battery charger IC (currently no dedicated family — flag).

```

</details>


## Family C3 (status=active)


### MFRs (41 parsed, 12 verified, 29 unverified)


**Verified:** 3PEAK (20 products), HONGWAN (6 products), DIOO (3 products), Ruimeng (3 products), BDASIC (3 products), CHIPANALOG (36 products), COSINE (26 products), Kiwi (6 products), Geehy (3 products), Fortior Tech (3 products), MICRO (1 products), SiC (3 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **CHIPANALOG CA-IS<num><variant>** — inMfrsTable=false, productsInFamily=0
- **COSINE COS<num><suffix>** — inMfrsTable=false, productsInFamily=0
- **but** — inMfrsTable=false, productsInFamily=0
- **Kiwi KP<num>** — inMfrsTable=false, productsInFamily=0
- **Geehy GHD<num> — NOTE** — inMfrsTable=false, productsInFamily=0
- **Fortior Tech FD<num> —** — inMfrsTable=false, productsInFamily=0
- **NOVOSENSE** — inMfrsTable=true, productsInFamily=0
- **Silicon Labs** — inMfrsTable=false, productsInFamily=0
- **ADI** — inMfrsTable=true, productsInFamily=0
- **Infineon EiceDRIVER** — inMfrsTable=false, productsInFamily=0
- **Microchip** — inMfrsTable=false, productsInFamily=0
- **Maxim/ADI** — inMfrsTable=false, productsInFamily=0
- **onsemi** — inMfrsTable=true, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **NON-ISOLATED** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **Non-Isolated** — inMfrsTable=false, productsInFamily=0
- **Digital** — inMfrsTable=false, productsInFamily=0
- **Gate Drive** — inMfrsTable=false, productsInFamily=0
- **VDD** — inMfrsTable=false, productsInFamily=0
- **Power** — inMfrsTable=true, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Maxim** — inMfrsTable=false, productsInFamily=0
- **Infineon** — inMfrsTable=false, productsInFamily=0
- **FAN

GATE-DRIVE** — inMfrsTable=false, productsInFamily=0
- **OUTPUT** — inMfrsTable=false, productsInFamily=0
- **GaN** — inMfrsTable=true, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0
- **PRIMARY** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (90 parsed, 7 verified, 83 unverified)


**Verified prefixes:**
- `TPM` (3PEAK) — 20 products
- `HNGTM` (HONGWAN) — 6 products
- `DIO` (DIOO) — 3 products
- `MS` (Ruimeng) — 3 products
- `BDR` (BDASIC) — 3 products
- `FD2103S` (Fortior Tech FD<num> —) — 1 products
- `FD6288` (Fortior Tech FD<num> —) — 2 products

**UNVERIFIED prefixes (potential hallucinations):**
- `(dominant` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `32%` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `of` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `C3` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `volume;` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `"IS"` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `isolated;` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `same` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `MFR` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `ships` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `isolated` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `DC-DC` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `in` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `C2` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `under` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `same` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `prefix` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `family;` (claimed for CHIPANALOG CA-IS<num><variant>) — 0 products
- `(proprietary` (claimed for COSINE COS<num><suffix>) — 0 products
- `COS44xx` (claimed for but) — 0 products
- `pattern` (claimed for but) — 0 products
- `strongly` (claimed for but) — 0 products
- `suggests` (claimed for but) — 0 products
- `CLONES` (claimed for but) — 0 products
- `of` (claimed for but) — 0 products
- `Microchip` (claimed for but) — 0 products
- `Maxim` (claimed for but) — 0 products
- `MIC4427` (claimed for but) — 0 products
- `MAX4427` (claimed for but) — 0 products
- `MAX4423` (claimed for but) — 0 products
- `MAX4426` (claimed for but) — 0 products
- `family` (claimed for but) — 0 products
- `non-isolated` (claimed for but) — 0 products
- `single` (claimed for but) — 0 products
- `dual` (claimed for but) — 0 products
- `low-side` (claimed for but) — 0 products
- `drivers;` (claimed for but) — 0 products
- `verify` (claimed for but) — 0 products
- `equivalence` (claimed for but) — 0 products
- `per-MPN` (claimed for but) — 0 products
- `(proprietary` (claimed for Kiwi KP<num>) — 0 products
- `one` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `observed` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `row` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `"GHD3440` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `3440R"` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `uses` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `literal` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `slash` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `to` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `encode` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `two` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `variant` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `MPNs` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `in` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `one` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `row;` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `data` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `quality` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `issue` (claimed for Geehy GHD<num> — NOTE) — 0 products
- `and` (claimed for Fortior Tech FD<num> —) — 0 products
- `patterns` (claimed for Fortior Tech FD<num> —) — 0 products
- `suggest` (claimed for Fortior Tech FD<num> —) — 0 products
- `CLONES` (claimed for Fortior Tech FD<num> —) — 0 products
- `of` (claimed for Fortior Tech FD<num> —) — 0 products
- `Infineon` (claimed for Fortior Tech FD<num> —) — 0 products
- `IR2103` (claimed for Fortior Tech FD<num> —) — 0 products
- `NSi6601` (claimed for NOVOSENSE) — 0 products
- `NSi1300` (claimed for NOVOSENSE) — 0 products
- `Si82xx` (claimed for Silicon Labs) — 0 products
- `Si827x` (claimed for Silicon Labs) — 0 products
- `ADuM4xxx` (claimed for ADI) — 0 products
- `ADuM3xxx` (claimed for ADI) — 0 products
- `1ED` (claimed for Infineon EiceDRIVER) — 0 products
- `2ED` (claimed for Infineon EiceDRIVER) — 0 products
- `IR21xx` (claimed for Infineon EiceDRIVER) — 0 products
- `MIC4427` (claimed for Microchip) — 0 products
- `MIC4429` (claimed for Microchip) — 0 products
- `MAX4427` (claimed for Maxim/ADI) — 0 products
- `MAX4429` (claimed for Maxim/ADI) — 0 products
- `NCV` (claimed for onsemi) — 0 products
- `NCP` (claimed for onsemi) — 0 products
- `FAN` (claimed for onsemi) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): driver_configuration, isolation_type, package_case, input_logic_threshold, output_polarity, peak_source_current, peak_sink_current, vdd_range, propagation_delay, rise_fall_time, dead_time_control, dead_time, uvlo, shutdown_enable, bootstrap_diode, fault_reporting, rth_ja, tj_max, aec_q100, packaging, input_vdd_range, isolation_voltage.

SUB-TYPES — critical: gate drivers come in two architectures with very different canonical needs:
1. NON-ISOLATED BOOTSTRAP drivers — single supply (VDD), output drives gate directly. The isolation_type rule will reject these as candidates for isolated-driver replacement, so missing isolated-side specs (input_vdd_range, isolation_voltage) are expected on these parts.
2. ISOLATED drivers (transformer / optocoupler / digital isolator) — have galvanically separated INPUT side (VCCI / VDDI / VDD1, the controller-facing logic supply, typically 3.0–5.5V) and OUTPUT side (VCCO / VDDO / VDD2, the gate-drive supply, typically 10–25V for Si MOSFETs / IGBTs, +18/-5V bipolar for SiC).

HARD GATES (logicType=identity in schema — exact match required): driver_configuration (Single / Dual / Half-Bridge / Full-Bridge), isolation_type (Non-Isolated Bootstrap / Transformer / Optocoupler / Digital Isolator), package_case, input_logic_threshold (3.3V / 5V / VDD-referenced / Differential). identity_flag gates (must match if original requires): output_polarity, dead_time_control, shutdown_enable, bootstrap_diode, fault_reporting, aec_q100.

NAMING — never collapse the two VCC pins on isolated drivers into a single canonical:
- 输入侧VCC / VCCI / VDDI / VDD1 (input side) → input_vdd_range
- 输出侧VCC / VCCO / VDDO / VDD2 (output side) → vdd_range (the existing "Gate Drive Supply VDD Range" — its engineering reason explicitly states this is the OUTPUT side that determines Vgs on the power device)

SAFETY-CRITICAL: isolation_voltage (kVrms) is THE spec that determines whether the part can be substituted in a safety-rated design. Conventional unit is kVrms across every datasheet — DO NOT mint a "_kvrms" variant; use the existing isolation_voltage canonical (it lives in L2 Power Supplies and Transformers already; reuse the name for C3 too per Decision #185 cross-family canonical reuse policy).

MPN PREFIXES (Asian — observed in ingested data, 112 products across 12 MFRs):
- CHIPANALOG CA-IS<num><variant> (dominant — 32% of C3 volume; "IS" = isolated; same MFR ships isolated DC-DC in C2 under same prefix family; e.g. CA-IS3211VBJ, CA-IS3212SCS)
- COSINE COS<num><suffix> (proprietary, but COS44xx pattern strongly suggests CLONES of Microchip/Maxim MIC4427 / MAX4427 / MAX4423 / MAX4426 family — non-isolated single/dual low-side drivers; verify equivalence per-MPN, not by name)
- 3PEAK TPM<num><suffix> (TPM27524 / TPM27524Q look like CLONES of TI UCC27524 dual driver; TPM23514D similar pattern; verify per-MPN)
- Kiwi KP<num> (proprietary, mixed)
- HONGWAN HNGTM<num> (proprietary half-bridge / isolator pattern)
- DIOO DIO<num>
- Ruimeng MS<num><suffix>
- Geehy GHD<num> — NOTE: one observed row "GHD3440/3440R" uses a literal slash to encode two variant MPNs in one row; data quality issue (same shape as CREATEK ranges and GIGADEVICE placeholders), not a cheat-sheet fix
- BDASIC BDR<num> (proprietary)
- Fortior Tech FD<num> — FD2103S and FD6288 patterns suggest CLONES of Infineon IR2103 (half-bridge) and IR6288 (high-side); verify per-MPN
- BL BLD/BL<num>
- CT MICRO CTL<num>

MPN PREFIXES (Western — appear via cross-reference, also referenced as clone targets):
- NOVOSENSE NSi6601 / NSi1300 (Chinese-origin but Western-customer-oriented; not in current ingested set)
- TI UCC52xx / UCC5310 / UCC27xxx (UCC27524 is a clone target at 3PEAK)
- Silicon Labs Si82xx / Si827x (digital isolator gate drivers)
- ADI ADuM4xxx / ADuM3xxx (digital isolators)
- Infineon EiceDRIVER 1ED / 2ED / IR21xx (IR2103 is a clone target at Fortior)
- Microchip MIC4427 / MIC4429 (clone targets at COSINE)
- Maxim/ADI MAX4427 / MAX4429 (same)
- onsemi NCV / NCP / FAN

GATE-DRIVE VOLTAGE BY OUTPUT TECHNOLOGY (useful for sanity-checking values; out-of-range values often indicate wrong-family or wrong-side mapping):
- Si MOSFET: 10–15V
- IGBT: 15V (often +15/-5 or +15/-8 for high-side)
- SiC MOSFET: +18 to +20V on / -5V off (bipolar drive critical)
- GaN HEMT: +5 to +6V / 0V off (low Vgs window)

TYPICAL RANGES (chip-level):
- input_vdd_range (isolated only): 2.7V–5.5V typical (3.3V/5V logic compat)
- vdd_range (output / gate-drive): 8V–30V (most common 10V/12V/15V/18V/20V)
- isolation_voltage (isolated only): 2.5kVrms–8kVrms (most basic-isolation drivers 2.5–5; reinforced isolation 6–8)
- peak_source_current / peak_sink_current: 0.5A (small low-side) to 30A+ (high-power IGBT/SiC drivers)
- propagation_delay: 10ns (fast logic-isolator drivers) to 200ns (older bootstrap)
- rise_fall_time: 5ns (low-Cload) to 100ns (high-Cgate-load Si IGBT)
- uvlo: typically Vdd_min - 0.5V to Vdd_min + 1V

FOREIGN signals to flag (these point to misclassified products):
- vref, control_mode, fsw with topology=buck/boost → switching regulator (C2), not gate driver.
- vds_max, rds_on, qg → MOSFET (B5). Gate drivers are upstream of FETs; specing the power-device side means the product is the FET, not the driver.
- vceo, hfe → BJT (B6).
- vce(sat), eon, eoff → IGBT (B7). Note: an IGBT's eon/eoff are spec'd at a specific Vgs that the driver sources, but if eon/eoff appear AS PRIMARY SPECS on a row the product is likely the IGBT not its driver.
- Iout (large current ratings >5A continuous, not peak) without driver_configuration → likely a discrete power switch or controller-output MOSFET, not a driver IC.
- AVO (open-loop voltage gain), CMRR, GBW → op-amp (C4). Some level-shift drivers have a comparator front-end but those still spec gate-drive output, not amplifier-style figures of merit.
- channel_count > 2 with no isolation_type → multi-channel logic buffer (logic IC C5), not a gate driver.

```

</details>


## Family C5 (status=active)


### MFRs (39 parsed, 9 verified, 30 unverified)


**Verified:** DIOO (67 products), 3PEAK (15 products), Convert (14 products), Ruimeng (5 products), TECH PUBLIC (4 products), AWINIC (14 products), COSINE (8 products), WCH (7 products), TECH (4 products)


**UNVERIFIED MFRs (potential hallucinations):**

- **AWINIC AW<num><suffix> —** — inMfrsTable=false, productsInFamily=0
- **LG74LVC1G00 =** — inMfrsTable=false, productsInFamily=0
- **COSINE COS<num><suffix> +** — inMfrsTable=false, productsInFamily=0
- **WCH CH44x — NOTE** — inMfrsTable=false, productsInFamily=0
- **MS714/T) — caught by** — inMfrsTable=false, productsInFamily=0
- **74xxnnn** — inMfrsTable=false, productsInFamily=0
- **NXP** — inMfrsTable=false, productsInFamily=0
- **Diodes** — inMfrsTable=false, productsInFamily=0
- **74HC** — inMfrsTable=false, productsInFamily=0
- **SN74** — inMfrsTable=false, productsInFamily=0
- **NC7S** — inMfrsTable=false, productsInFamily=0
- **TC74** — inMfrsTable=false, productsInFamily=0
- **I2C bus peripherals** — inMfrsTable=false, productsInFamily=0
- **CANONICAL** — inMfrsTable=false, productsInFamily=0
- **Shift** — inMfrsTable=false, productsInFamily=0
- **HARD** — inMfrsTable=false, productsInFamily=0
- **LOGIC** — inMfrsTable=true, productsInFamily=0
- **HCT** — inMfrsTable=true, productsInFamily=0
- **BUS** — inMfrsTable=false, productsInFamily=0
- **CLOCKED-LOGIC** — inMfrsTable=false, productsInFamily=0
- **Map** — inMfrsTable=true, productsInFamily=0
- **MPN** — inMfrsTable=false, productsInFamily=0
- **Same** — inMfrsTable=false, productsInFamily=0
- **Nanjing** — inMfrsTable=false, productsInFamily=0
- **USB-HID** — inMfrsTable=false, productsInFamily=0
- **Interface** — inMfrsTable=false, productsInFamily=0
- **UNIVERSAL CLONE** — inMfrsTable=false, productsInFamily=0
- **Asian** — inMfrsTable=false, productsInFamily=0
- **TYPICAL** — inMfrsTable=false, productsInFamily=0
- **NOT** — inMfrsTable=false, productsInFamily=0

### MPN Prefixes (81 parsed, 14 verified, 67 unverified)


**Verified prefixes:**
- `DIO` (DIOO) — 63 products
- `TPW` (3PEAK) — 15 products
- `AW9548TSR` (AWINIC AW<num><suffix> —) — 1 products
- `LG74` (Convert) — 14 products
- `COSTS3USB30E` (COSINE COS<num><suffix> +) — 1 products
- `CH440` (WCH CH44x — NOTE) — 2 products
- `CH442` (WCH CH44x — NOTE) — 1 products
- `CH443` (WCH CH44x — NOTE) — 1 products
- `CH444` (WCH CH44x — NOTE) — 1 products
- `CH448` (WCH CH44x — NOTE) — 1 products
- `MS` (Ruimeng) — 5 products
- `NC7SZ` (TECH PUBLIC) — 1 products
- `74LVC` (74HC) — 1 products
- `NC7SZ` (NC7S) — 1 products

**UNVERIFIED prefixes (potential hallucinations):**
- `looks` (claimed for AWINIC AW<num><suffix> —) — 0 products
- `like` (claimed for AWINIC AW<num><suffix> —) — 0 products
- `CLONE` (claimed for AWINIC AW<num><suffix> —) — 0 products
- `of` (claimed for AWINIC AW<num><suffix> —) — 0 products
- `NXP` (claimed for AWINIC AW<num><suffix> —) — 0 products
- `PCA9548` (claimed for AWINIC AW<num><suffix> —) — 0 products
- `LG-prefixed` (claimed for Convert) — 0 products
- `CLONES` (claimed for Convert) — 0 products
- `of` (claimed for Convert) — 0 products
- `standard` (claimed for Convert) — 0 products
- `74-series` (claimed for Convert) — 0 products
- `logic` (claimed for Convert) — 0 products
- `74LVC1G00` (claimed for LG74LVC1G00 =) — 0 products
- `clone)` (claimed for LG74LVC1G00 =) — 0 products
- `Same` (claimed for LG74LVC1G00 =) — 0 products
- `MPN` (claimed for LG74LVC1G00 =) — 0 products
- `same` (claimed for LG74LVC1G00 =) — 0 products
- `silicon` (claimed for LG74LVC1G00 =) — 0 products
- `as` (claimed for LG74LVC1G00 =) — 0 products
- `Western` (claimed for LG74LVC1G00 =) — 0 products
- `original` (claimed for LG74LVC1G00 =) — 0 products
- `from` (claimed for WCH CH44x — NOTE) — 0 products
- `Nanjing` (claimed for WCH CH44x — NOTE) — 0 products
- `Qinheng` (claimed for WCH CH44x — NOTE) — 0 products
- `are` (claimed for WCH CH44x — NOTE) — 0 products
- `USB-to-UART` (claimed for WCH CH44x — NOTE) — 0 products
- `USB-HID` (claimed for WCH CH44x — NOTE) — 0 products
- `INTERFACE` (claimed for WCH CH44x — NOTE) — 0 products
- `CHIPS` (claimed for WCH CH44x — NOTE) — 0 products
- `not` (claimed for WCH CH44x — NOTE) — 0 products
- `pure` (claimed for WCH CH44x — NOTE) — 0 products
- `74-series` (claimed for WCH CH44x — NOTE) — 0 products
- `logic` (claimed for WCH CH44x — NOTE) — 0 products
- `Likely` (claimed for WCH CH44x — NOTE) — 0 products
- `misclassified` (claimed for WCH CH44x — NOTE) — 0 products
- `into` (claimed for WCH CH44x — NOTE) — 0 products
- `C5` (claimed for WCH CH44x — NOTE) — 0 products
- `instead` (claimed for WCH CH44x — NOTE) — 0 products
- `of` (claimed for WCH CH44x — NOTE) — 0 products
- `C7` (claimed for WCH CH44x — NOTE) — 0 products
- `multiple` (claimed for Ruimeng) — 0 products
- `observed` (claimed for Ruimeng) — 0 products
- `rows` (claimed for Ruimeng) — 0 products
- `use` (claimed for Ruimeng) — 0 products
- `slash-delimited` (claimed for Ruimeng) — 0 products
- `variant` (claimed for Ruimeng) — 0 products
- `suffix` (claimed for Ruimeng) — 0 products
- `phase-1` (claimed for MS714/T) — caught by) — 0 products
- `MPN-quality` (claimed for MS714/T) — caught by) — 0 products
- `validator` (claimed for MS714/T) — caught by) — 0 products
- `(standard` (claimed for 74xxnnn) — 0 products
- `logic` (claimed for 74xxnnn) — 0 products
- `onsemi` (claimed for 74xxnnn) — 0 products
- `MC74xxx` (claimed for 74xxnnn) — 0 products
- `74xxx` (claimed for NXP) — 0 products
- `74xxx)` (claimed for Diodes) — 0 products
- `74HCT` (claimed for 74HC) — 0 products
- `74AHC` (claimed for 74HC) — 0 products
- `74AHCT` (claimed for 74HC) — 0 products
- `74ALVC` (claimed for 74HC) — 0 products
- `74AUP` (claimed for 74HC) — 0 products
- `74VHC` (claimed for 74HC) — 0 products
- `(TI)` (claimed for SN74) — 0 products
- `MC74` (claimed for SN74) — 0 products
- `(Toshiba)` (claimed for TC74) — 0 products
- `TC7S` (claimed for TC74) — 0 products
- `PCA9xxx` (claimed for I2C bus peripherals) — 0 products

### Verdict: **SUSPECTED_HALLUCINATIONS**


<details><summary>Card text</summary>

```
CANONICAL ATTRIBUTES (use these IDs exactly): logic_function, gate_count, package_case, output_type, oe_polarity, voh, vol, drive_current, schmitt_trigger, vih, vil, input_clamp_diodes, input_leakage, bus_hold, logic_family, supply_voltage, tpd, fmax, transition_time, setup_hold_time, operating_temp, aec_q100, packaging, i2c_bus_speed_max_khz.

SUB-TYPES — 74-series spans seven Digikey leaf categories (Gates, Buffers/Transceivers, Flip-Flops, Latches, Counters, Shift Registers, MUX/Decoders). Function code is the HARD GATE (logicType=identity): '04 inverter ≠ '14 Schmitt; '373 latch ≠ '374 flip-flop; '241 ≠ '244; '595 shift register ≠ '138 decoder. Never cross function codes.

HARD GATES (logicType=identity in schema — exact match required): logic_function (the part-number suffix is the family's primary identity gate), gate_count, package_case. identity_flag gates (must match if original requires): output_type (totem-pole / open-drain / 3-state), oe_polarity (3-state enable polarity flip is fatal in bus designs), schmitt_trigger, input_clamp_diodes, bus_hold, aec_q100.

LOGIC FAMILY designators (HC, HCT, AC, ACT, LVC, AHC, AHCT, ALVC, AUP, VHC, VHCT) each have different Vcc range, speed, and output drive. HC ↔ HCT TRAP: HC requires VIH ≥ 3.5V min; if driven by TTL (VOH = 2.4V min), HC will not reliably read high. HCT is the TTL-compatible variant. Replacements across HC/HCT boundary need context Q1 awareness. logic_family is logicType=application_review — engineer judges, but cross-family substitution in a mixed-supply design is high-risk.

I2C BUS SPEED ≠ FMAX — this is a common AI confusion to defend against. Logic-IC parts in C5 include I2C bus peripherals (level shifters, buffers, switches, I/O expanders) whose "max frequency" is the I2C bus clock rate in kHz (100/400/1000/3400 — Standard/Fast/Fast-Plus/High-speed modes). The existing fmax canonical is the CLOCKED-LOGIC TOGGLE RATE for flip-flops, counters, shift registers — measured in MHz. Map I2C bus speed to the separate i2c_bus_speed_max_khz canonical. The values themselves disambiguate: kHz values (400, 1000, 3400) are bus speed; MHz values (40, 200) are flip-flop fmax.

MPN PREFIXES (Asian — observed in ingested data, 145 products across 9 MFRs):
- DIOO DIO<num><variant> (dominant at 46% of volume; one observed row uses slash-delimited variant suffix — DIO4481/B — caught by phase-1 MPN-quality validator)
- 3PEAK TPW<num> (proprietary; real Chinese analog IC company)
- AWINIC AW<num><suffix> — AW9548TSR looks like CLONE of NXP PCA9548 (8-channel I2C switch); verify per-MPN
- Convert LG74<family><function><variant> — LG-prefixed CLONES of standard 74-series logic (LG74HCT259 = 74HCT259 clone, LG74LVC1G00 = 74LVC1G00 clone). Same MPN ≠ same silicon as Western original.
- BL BL<num><package> (package encoded in suffix: BL1530MSOP / BL1532TQFN)
- COSINE COS<num><suffix> + COSTS3USB30E (USB-related variant); proprietary
- WCH CH44x — NOTE: CH440/CH442/CH443/CH444/CH448 from Nanjing Qinheng are USB-to-UART / USB-HID INTERFACE CHIPS, not pure 74-series logic. Likely misclassified into C5 instead of C7 (Interface ICs). If you see these in a C5 query, prefer a wrong_family verdict toward C7 or flag for engineer review.
- Ruimeng MS<num><suffix>/T — multiple observed rows use slash-delimited variant suffix (MS713/T, MS714/T) — caught by phase-1 MPN-quality validator
- TECH PUBLIC mix: NC7SZ<function><package> (Fairchild single-gate clones), 74LVC1G14GV (genuine NXP 74LVC1G14), TP3USB30M10 (USB protection — likely should be in B4/TVS)

UNIVERSAL CLONE CAVEAT: 74-series part numbers (74HC04, 74LVC1G00, etc.) appear at multiple Asian MFRs under EXACT industry-standard part numbers. Convert's LG-prefix is a typical clone pattern. Match by MFR identity when scoring substitutability — a Convert LG74HCT259 is not guaranteed to be drop-in for an onsemi 74HCT259.

MPN PREFIXES (Western — appear via cross-reference, also as clone targets):
- 74xxnnn (standard logic — onsemi MC74xxx, TI SNxxxx74xxx, NXP 74xxx, Diodes 74xxx)
- 74HC / 74HCT / 74AHC / 74AHCT / 74LVC / 74ALVC / 74AUP / 74VHC (logic-family-prefixed standard parts)
- SN74 (TI) / MC74 (onsemi/Motorola) / MM74 (Fairchild — legacy)
- NC7S / NC7SZ (Fairchild/onsemi single-gate)
- TC74 (Toshiba) / TC7S (Toshiba single-gate)
- CD4000 (CMOS 4000-series — separate logic family from 74xx)
- I2C bus peripherals: PCA9xxx (NXP — clone target at AWINIC AW9548), NCA9xxx (NOVOSENSE — Chinese, mirrors NXP lineup), TCA9xxx (TI), MAX73xx (Maxim/ADI)

TYPICAL RANGES:
- supply_voltage: 1.65V (74AUP single-supply) to 5.5V (legacy 74HCT); most common 1.8V / 2.5V / 3.3V / 5V
- vih / vil: family-dependent (HC: VIH ≥ 3.5V at Vcc=5V; HCT: VIH ≥ 2V — TTL-compat)
- voh / vol: VOH typically Vcc-0.2V at low current, drops at rated drive
- drive_current: 4mA (HC at rated swing) to 32mA (ALVC bus drivers)
- tpd: 1ns (AUP single-gate) to 50ns+ (classic HC at 5V Vcc)
- fmax (flip-flop toggle rate): 40MHz (HC) to 500MHz+ (LVC at 3.3V)
- i2c_bus_speed_max_khz: 100 (Standard) / 400 (Fast) / 1000 (Fast-Plus) / 3400 (High-speed)

FOREIGN signals to flag (these point to misclassified products):
- USB protocol fields (USB 2.0 / USB 3.0 / data rate Mbps), USB host/device support, USB endpoint count → USB interface IC (C7 Interface ICs, NOT C5). WCH CH44x family is the clearest example in current data.
- UART / SPI / I2C SLAVE-only (not bus-buffer) → microcontroller or interface IC, not 74-series logic.
- Programmable logic count (LUTs, macrocells, registers) → CPLD/FPGA (no dedicated family today).
- ADC resolution bits / sample rate → ADC (C9).
- DAC resolution bits / output range → DAC (C10).
- Vds_max, rds_on, qg → MOSFET (B5).
- Vceo, hfe → BJT (B6).
- Vrrm, Io_avg → rectifier diode (B1).
- vref + topology buck/boost → switching regulator (C2), not logic.
- Vout regulated → LDO (C1).
- "I2C max frequency" in MHz value (not kHz) suggests the AI confused fmax with i2c_bus_speed_max_khz — see the dedicated section above. Stays in C5 but use the right canonical.

```

</details>
