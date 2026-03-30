# Parts.io API — Real Response Analysis (Mar 2026)

## Critical Design Findings

### 1. Must request limit≥5 and pick most complete record
- `limit=1` returns the first match, which is often a sparse Chinese MFR record (Completeness: 0.0%)
- Different manufacturers have wildly different completeness (0% to 22% for same MPN)
- **Strategy**: Request `limit=10`, select record with highest `Completeness` score or most parametric fields
- Chinese MFR records (SLKOR, JCET) consistently have ZERO parametric data

### 2. Parts.io uses 16 Class types (not 9 or 15)
| Parts.io Class | Category (example) | Our Families |
|---|---|---|
| Capacitors | Ceramic/Fixed Capacitors | 12,13,58,59,60,61,64 |
| Resistors | Fixed Resistors | 52-55,65,67,68 |
| Inductors | Fixed Inductors | 69-72 |
| Diodes | Rectifier Diodes | B1-B4 |
| Transistors | Power FETs / Small Signal BJTs / IGBTs | B5,B6,B7,B9 |
| Trigger Devices | SCRs / TRIACs | B8 |
| Amplifier Circuits | Operational Amplifiers | C4 |
| Logic | Gates / FF / Counters | C5 |
| Power Circuits | Linear Regulator ICs | C1,C2 |
| Converters | ADCs / DACs | C9,C10 |
| Drivers And Interfaces | Line Driver or Receivers | C7 |
| Signal Circuits | Analog Waveform Generation Functions | C8 |
| Circuit Protection | Electric Fuses | D2,66 |
| Optoelectronics | Optocoupler | E1 |
| Relays | Power/Signal Relays | F1,F2 |
| Crystals/Resonators | Quartz Crystals | D1 |

### 3. Confirmed field names (from real API, not spreadsheet)
Note: Some differ from Accuris spreadsheet. These are the ACTUAL field names.

**Capacitors:**
- `Capacitance` (number, µF), `Rated (DC) Voltage (URdc)` (number, V) — NOTE: parens differ from spreadsheet
- `Dielectric Material`, `Temperature Characteristics Code`, `Temperature Coefficient`
- `ESR` — NOT confirmed yet (MLCC doesn't have it; need tantalum test)
- `Positive Tolerance` + `Negative Tolerance` (two fields, numbers)
- `Height`, `Length`, `Width` (numbers, mm)
- `Operating Temperature-Max` + `Min` (numbers, °C)
- `Polarity` — NOT in MLCC response (expected for tantalum)

**Resistors:**
- `Resistance` (number, Ω), `Tolerance` (number, %), `Rated Power Dissipation (P)` (number, W)
- `Temperature Coefficient` (string: "100"), `Working Voltage` (number, V)
- `Technology` (string: "METAL GLAZE/THICK FILM"), `Construction` (string)
- `Package Height/Length/Width` (numbers, mm)

**Inductors:**
- `Inductance-Nom (L)` (number, µH), `DC Resistance` (number, Ω)
- `Rated Current-Max` (number, A), `Self Resonance Frequency` (number, MHz)
- `Core Material`, `Shielded` ("YES"/"NO"), `Inductor Application`
- `Test Frequency` (number, MHz), `Tolerance` (number, %)

**Diodes (BAV99):**
- `Rep Pk Reverse Voltage-Max` (number, V), `Output Current-Max` (number, A)
- `Reverse Recovery Time-Max` (number, µs), `Power Dissipation-Max` (number, W)
- `Diode Element Material`, `Configuration`, `Number of Elements`
- MISSING: `Forward Voltage-Max (VF)` — not in BAV99 response

**Transistors / MOSFETs (IRF540N):**
- `DS Breakdown Voltage-Min` (number, V), `Drain Current-Max (ID)` (number, A)
- `Drain-source On Resistance-Max` (number, Ω)
- `Pulsed Drain Current-Max (IDM)` — CONFIRMED (110.0, only in IR/Infineon records)
- `Avalanche Energy Rating (Eas)` — CONFIRMED (185.0, only in IR/Infineon records)
- `Power Dissipation-Max (Abs)` or `Power Dissipation Ambient-Max`
- `Polarity/Channel Type`, `Operating Mode`, `FET Technology`
- **NOT FOUND: Crss, Coss, Ciss, Qg** — NOT in any of 5 records

**Trigger Devices / Thyristors (BT151-500R):**
- `Repetitive Peak Off-state Voltage` (number, V)
- `On-state Current-Max` (number, mA), `Non-Repetitive Pk On-state Cur` (number, A)
- `DC Gate Trigger Current-Max` (number, mA), `DC Gate Trigger Voltage-Max` (number, V)
- `Holding Current-Max` (number, mA), `On-State Voltage-Max` (number, V)
- `Circuit Commutated Turn-off Time-Nom` — **tq CONFIRMED** (70.0 µs)
- `Critical Rate of Rise of Off-State Voltage-Min` — **dv/dt CONFIRMED** (50.0 V/µs)
- `Trigger Device Type` (string: "SCR")
- `Leakage Current-Max` (number, mA)

**Op-Amps (LM358, from Kuwait Semi record):**
- `Amplifier Type`, `Architecture` ("VOLTAGE-FEEDBACK")
- `CMRR-Min` (65), `CMRR-Nom` (80) — **CONFIRMED gap-filler**
- `Voltage Gain-Min` (25000.0) — **avol CONFIRMED gap-filler**
- `Avg Bias Current-Max (IIB)` (0.25), `Bias Current-Max @25C`
- `Input Offset Voltage-Max` (7000.0 µV)
- `Supply Current-Max`, `Supply Voltage-Nom/Limit-Max`
- `Frequency Compensation` ("YES")
- **NOT FOUND: GBW, Slew Rate, PSRR, vicm_range** — missing from all 4 records

**Logic ICs (SN74HC04N):**
- `Logic IC Type` ("INVERTER"), `Family` ("HC/UH") — **logic_family CONFIRMED**
- `Number of Functions` (6), `Number of Inputs` (1)
- `Propagation Delay (tpd)` (120.0 ns), `Prop. Delay@Nom-Sup` (24.0 ns)
- `Supply Voltage-Min/Max/Nom (Vsup)` (2.0/6.0/5.0)
- `Power Supply Current-Max (ICC)` (0.02 mA)
- `Max I(ol)` (0.004 A) — **drive_current CONFIRMED**
- `Schmitt Trigger` ("NO"), `Technology` ("CMOS")
- `Load Capacitance (CL)` (50.0 pF)
- `Temperature Grade` ("INDUSTRIAL")

**Fuses (0251001.MXL):**
- `Rated Current` (1.0 A), `Rated Voltage(AC)` (125.0 V), `Rated Voltage(DC)` (125.0 V)
- `Rated Breaking Capacity` (50.0 A), `Blow Characteristic` ("VERY FAST")
- `Joule Integral-Nom` (0.0), `Trip Time or Delay` (0.004 s)
- `Fuse Size` ("PICO"), `Circuit Protection Type`, `Mounting Feature`

**Optocouplers (4N25, from Vishay record):**
- `Optoelectronic Device Type` ("TRANSISTOR OUTPUT OPTOCOUPLER")
- `Isolation Voltage-Max` (5000 V) — **CONFIRMED gap-filler**
- `Current Transfer Ratio-Min` (20.0), `Current Transfer Ratio-Nom` (50.0)
- `Dark Current-Max` (50.0), `Forward Current-Max` (0.06), `Forward Voltage-Max` (1.5)
- `Coll-Emtr Bkdn Voltage-Min` (30.0), `On-State Current-Max` (0.15)
- `Response Time-Max` (2.8e-06)

**Relays (G5V-2-DC5):**
- `Coil Voltage-Nom` (5.0), `Coil Voltage(DC)-Max` (6.0)
- `Coil Current(DC)-Max` (0.1), `Coil Resistance` (50.0)
- `Coil Operate Voltage(DC)` (3.75), `Coil Release Voltage(DC)` (0.25)
- `Coil Power` ("500" — string, not number!)
- `Contact Current(DC)-Max` (2.0), `Contact Voltage(AC)-Max` (125.0)
- `Contact Voltage(DC)-Max` (125.0), `Contact Resistance` (50.0)
- `Relay Function` ("DPDT"), `Relay Form` ("2 FORM C")
- `End Contact Material` ("Silver Alloy"), `End Contact Plating` ("GOLD")
- `Electrical Life` (100000), `Operate Time` (7.0), `Release Time` (3.0)
- `Insulation Resistance` (1000000000.0)

**ADCs (ADS1115IDGSR):**
- `Converter Type` ("ADC, DELTA-SIGMA"), `Number of Bits` (16)
- `Number of Analog In Channels` (4), `Sample Rate` (0.00086)
- `Linearity Error-Max (EL)` (0.0015)
- `Analog Input Voltage-Max/Min` (5.5 / -4.096)
- `Supply Voltage-Min/Nom`, `Supply Current-Max`
- `Output Format` ("SERIAL"), `Output Bit Code` ("2S COMPLEMENT BINARY")

**Interface ICs (MAX485ESA):**
- `Interface IC Type` ("LINE TRANSCEIVER"), `Interface Standard` ("EIA-485; EIA-422")
- `Supply Voltage-Min/Max/Nom`, `Supply Current-Max`
- `Transmit Delay-Max` (60.0), `Receive Delay-Max` (200.0)
- `Output Characteristics` ("3-STATE"), `Output Polarity` ("COMPLEMENTARY")
- `Differential Output` ("YES"), `Input Characteristics` ("DIFFERENTIAL SCHMITT TRIGGER")
- `Out Swing-Min` (1.5), `Output Low Current-Max` (0.004)

**Timer/555 (NE555P):**
- Class: "Signal Circuits", Category: "Analog Waveform Generation Functions"
- `Supply Voltage-Min/Max/Nom (Vsup)`, `Supply Current-Max (Isup)`
- `Technology` ("BIPOLAR"), `Temperature Grade` ("COMMERCIAL")
- `Analog IC - Other Type` ("PULSE; RECTANGULAR")
- No timer-specific parametrics (no timing accuracy, threshold ratios, etc.)

**LDO (LM1117-3.3 — BAD MPN, retested with LM1117IMPX-3.3):**
- LM1117-3.3 (no suffix): 1 match, Completeness: 0.79%, only `Regulator Type`
- **LM1117IMPX-3.3**: 2 matches, Completeness: 31.75. `Dropout Voltage1-Max`=1.4, `Dropout Voltage1-Nom`=1.2, `Line Regulation-Max`=0.006, `Load Regulation-Max`=0.01, `Output Voltage1-Nom/Min/Max`=3.3/3.168/3.432, `Output Current1-Max`=0.8, `Input Voltage-Min/Max`=4.75/15.0, `Adjustability`=FIXED, `Voltage Tolerance-Max`=2.0
- **AMS1117-3.3**: 1 match, Completeness: 20.63. `Dropout Voltage1-Max`=1.3, `Load Regulation-Max`=0.025, `Output Current1-Max`=1.0, `Output Voltage1-Nom`=3.3
- **C1 LDOs WILL benefit** — dropout voltage, line/load regulation are key gap-fillers

## Round 2 Findings (additional 15 MPNs, limit=10)

**Tantalum (TAJB106K016RNJ):** Class: Capacitors, Category: "Ceramic Capacitors" (misclassified). Leakage Current=0.0016, Tan Delta="0.06", ESR=2800.0, Ripple Current=70.0 — ALL gap-fillers found.

**NTC Thermistor (NCP18XH103F03RB):** Class: Resistors, Category: "Non-linear Resistors". `Thermal Sensitivity Index`=3380.0 (B-value). Key gap-filler confirmed.

**Schottky (BAT54S):** 61 matches. Forward Voltage-Max=1.0, Rep Pk Reverse Voltage-Max=30.0, Output Current-Max=0.2. Technology="SCHOTTKY". All targets found.

**Zener (BZX84-C5V1):** 8 matches. Reference Voltage-Nom=5.1, Dynamic Impedance-Max=60.0, Working Test Current=5.0, Knee Impedance-Max=480.0, Voltage Temp Coeff-Max=1.2. Excellent — better than expected.

**TVS (SMBJ5.0A):** 75 matches. Clamping Voltage-Max=9.2, Breakdown Voltage-Min/Max/Nom=6.4/7.0/6.7, Non-rep Peak Rev Power Dis-Max=600.0. All targets found.

**BJT (2N2222A):** 76 matches. DC Current Gain-Min (hFE)=100.0, VCEsat-Max=0.3, Transition Frequency-Nom (fT)=300.0, ton=35ns, toff=285ns. NO Cob (collector-base cap). Category: "Small Signal Bipolar Transistors".

**IGBT (IKW40N120H3):** 1 match. Turn-on/off Time only. NO Eon/Eoff, NO Vce\_sat. Configuration="SINGLE WITH BUILT-IN DIODE" (co\_packaged\_diode). Weak coverage.

**TRIAC (BTA16-600B):** 6 matches. Critical Rate of Rise of Commutation Voltage-Min + Off-State Voltage-Min (2 dv/dt types). RMS On-state Current-Max=16.0, Vdrm=600. Trigger Device Type="4 QUADRANT LOGIC LEVEL TRIAC". NO di/dt.

**JFET (2N5457):** 25 matches. Only Crss (Feedback Cap-Max=3.0). NO Vp, Idss, gfs. Nearly useless. Category: "Small Signal Field-Effect Transistors".

**Voltage Ref (REF5025):** 0 matches — series ref NOT IN DATABASE.
**Voltage Ref (TL431AIDBZR — shunt ref retest):** 4 matches. TI record Completeness=30.17. `Output Voltage-Nom`=2.495, `Output Voltage-Min/Max`=2.47/2.52, `Temp Coef of Voltage-Max`=92.0, `Trim/Adjustable Output`=YES, `Output Current-Max`=0.1. Class: "Power Circuits". C6 shunt refs have useful data.

**Gate Driver (UCC27211DR):** 1 match, Completeness=35.9 (highest). Output Current-Max=4.0, Interface IC Type="HALF BRIDGE BASED MOSFET DRIVER", High Side Driver="YES". Turn-on/off Time ambiguous (rise/fall not prop delay). NO dead time. Class: "Drivers And Interfaces", Category: "MOSFET Drivers".

**DAC (DAC8568ICPW):** 1 match, Completeness=31.36. Number of Bits=16, Settling Time-Max=10.0, Converter Type="D/A CONVERTER". Linearity Error-Max (EL)=0.0183 (% NOT LSB). NO DNL.

**SSR (CPC1017N):** 3 matches. Output Circuit Type="MOSFET", On-state Resistance-Max=16.0. **Class: "Optoelectronics"** (NOT "Relays"). Category: "Solid State Relays". NO load voltage field.

## Round 3 Findings (retesting "no benefit" families with better MPNs, limit=10)

**Switching Regulator (LM2576D2TR4-5G):** 2 matches. onsemi record Completeness=28.79. `Switcher Configuration`=BUCK (topology), `Control Mode`=VOLTAGE-MODE, `Control Technique`=PULSE WIDTH MODULATION, `Input Voltage-Min/Max`=8.0/40.0, `Output Voltage-Nom/Min/Max`=5.0/4.9/5.1, `Output Current-Max`=7.5, `Switching Frequency-Max`=63.0. Class: "Power Circuits". **C2 WILL benefit — excellent data.**

**LDO Retest — see Round 1 section above (LM1117IMPX-3.3, AMS1117-3.3 both have data).**

**Voltage Ref Retest — see Round 2 section above (TL431AIDBZR found with TC + output voltage).**

**555 Timer (ICM7555IPAZ):** 2 matches, Completeness=25.69. `Technology`=CMOS (timer_variant!), `Output Frequency-Max`=1.0, `Supply Voltage-Min/Max/Nom`=2.0/18.0/5.0. No timing accuracy or threshold ratios. Marginal improvement — Technology distinguishes 7555 from NE555.

**Al Electrolytic (EEU-FC1V101):** 0 matches — this MPN not found.
**Al Electrolytic (UCD1V101MNL1GS — Nichicon retest):** 1 match, Completeness=24.55. Class: Capacitors, Category: "Ceramic Capacitors" (misclassified like Tantalum). `Capacitance`=100.0, `Rated (DC) Voltage (URdc)`=35.0, `Leakage Current`=0.035, `Tan Delta`=0.12, `Ripple Current`=300.0, `Dielectric Material`="ALUMINUM (WET)", `Polarity`=POLARIZED, `Reference Standard`=AEC-Q200. Same gap-fillers as Tantalum — EXCELLENT.
**Al Electrolytic (860020672012 — Wurth retest):** 1 match, Completeness=18.18. `Leakage Current`=0.0165, `Tan Delta`=0.1, `Ripple Current`=75.0. Confirmed.
**Film Cap (ECQ-E2105KF):** 0 matches — NOT IN DATABASE.
**Film Cap (WIMA MKS2D031001A00JSSD):** 0 matches — NOT IN DATABASE. Film caps may genuinely be sparse.

## Revised Coverage Impact

| Family | Current (Digikey) | With parts.io | Key gains | Notes |
|--------|-------------------|---------------|-----------|-------|
| B8 Thyristors | ~48-51% | ~65-70% | tq, dv/dt CONFIRMED | Best gap-fill target |
| F59 Tantalum | ~75% | ~80-85% | leakage_current, Tan Delta | Need tantalum MPN test |
| B5 MOSFETs | ~60% | ~65% | avalanche_energy, id_pulse | Crss/Qg NOT available |
| C4 Op-Amps | ~50% | ~55-60% | cmrr, avol | vicm_range/GBW/slew NOT found |
| C5 Logic | ~40-45% | ~50-55% | logic_family, tpd, drive_current | CONFIRMED |
| E1 Optocouplers | ~45% | ~55% | CTR, isolation_voltage, Vceo | From Vishay records |
| F1 Relays | ~45% | ~65%+ | coil V/I/R, contact ratings, form, material, electrical life | EXCELLENT data |
| D2 Fuses | ~50% | ~60-65% | blow char, breaking capacity, I2t | CONFIRMED |
| C9 ADCs | ~48% | ~55% | converter_type, bits, channels, linearity | CONFIRMED |
| C7 Interface | ~34-39% | ~45-50% | protocol, delays, output type | CONFIRMED |
| C1 LDOs | ~52% | ~62-65% | dropout_voltage, line/load regulation, Vin/Vout | Bad initial MPN — CORRECTED |
| C2 Switching Regs | ~40-50% | ~55-60% | topology, control_mode, fsw, Vin/Vout | LM2576 Completeness=28.79 |
| C6 Voltage Refs | ~63% | ~68% | TC, output_voltage (shunt refs only) | REF5025 not found, TL431 found |
| 58 Al Electrolytic | ~75% | ~85% | Leakage Current, Tan Delta, Ripple Current | Same gap-fillers as Tantalum |
| C8 Timers | ~30-50% | ~35-50% | Technology (timer_variant) only | Marginal |
