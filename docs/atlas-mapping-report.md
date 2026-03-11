# Atlas Manufacturer Attribute Mapping Report

> Generated: 2026-03-11
>
> For each manufacturer + family, shows how their raw Atlas attribute names map
> to our internal schema, which raw attributes have no dictionary entry, and which
> of our logic table rules have no Atlas data coverage.

## Table of Contents

- [Sinopower](#sinopower) — 910 products (B5)
- [YENJI](#yenji) — 451 products (B4, 66, B1, B3, B5)
- [Convert](#convert) — 731 products (B5, C2, B7, B1, C1, C5)
- [YJYCOIN](#yjycoin) — 608 products (71, 70)
- [CREATEK](#createk) — 843 products (B4, B1, B7, B3, B6, 66, B5, 65)
- [CYNTEC](#cyntec) — 944 products (52, 71, C2)
- [3PEAK](#3peak) — 394 products (C4, C7, C1, C2, C3, C5, C9, C6, C10)
- [TECH PUBLIC](#tech-public) — 370 products (B4, B5, C1, B1, C5, C2, C4, C7)
- [AISHI](#aishi) — 851 products (58, 60)
- [MingDa](#mingda) — 381 products (C1, C2, C4)

---

## Sinopower

**910 products** across 1 family

### B5 — MOSFETs — N-Channel & P-Channel (910 products, sampled 100)

**Coverage**: 10 of 27 rules covered (37%) | 12 raw params mapped | 1 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | TO-220, SOT-723 |
| Cfg. | `channel_type` | 10 | identity | 99/100 (99%) | P, N |
| BV(V) | `vds_max` | 10 | threshold (gte) | 99/100 (99%) | -20, 30 |
| ID(A) TA=25 | `id_max` | 10 | threshold (gte) | 96/100 (96%) | -0.4, 0.35 |
| ID(A) TC=25 | `id_max` | 10 | threshold (gte) | 8/100 (8%) | 0.55, -100 |
| RDS(on)(mΩ MAX.) 10V | `rds_on` | 9 | threshold (lte) | 44/100 (44%) | 800, 2 |
| VGS(±V) | `vgs_max` | 8 | threshold (gte) | 99/100 (99%) | 12, 20 |
| Coss(pF)TYP. | `coss` | 7 | application_review | 99/100 (99%) | 21, 8 |
| Crss(pF)TYP. | `crss` | 7 | threshold (lte) | 99/100 (99%) | 11, 3 |
| Ciss(pF)TYP. | `ciss` | 6 | threshold (lte) | 99/100 (99%) | 46, 28 |
| VTH(V)-typ. | `vgs_th` | 6 | application_review | 92/100 (92%) | -0.75, 0.95 |
| RDS(on)(mΩ MAX.) 4.5V | `_rds_on_4v5` | — | *(no rule)* | 99/100 (99%) | 525, 700 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 99/100 (99%) | New, Engineer sample |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration (G-D-S Order, Tab Assignment) | 10 | identity |
| `technology` | Technology (Si / SiC / GaN) | 9 | identity_flag |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `qg` | Total Gate Charge (Qg) | 8 | threshold (lte) |
| `body_diode_trr` | Body Diode Reverse Recovery Time (trr) | 8 | threshold (lte) |
| `id_pulse` | Peak Pulsed Drain Current (Id Pulse) | 7 | threshold (gte) |
| `avalanche_energy` | Avalanche Energy (Eas) | 7 | threshold (gte) |
| `qgd` | Gate-Drain Charge / Miller Charge (Qgd) | 7 | threshold (lte) |
| `rth_jc` | Thermal Resistance Junction-to-Case (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA) Curves | 7 | application_review |
| `pd` | Power Dissipation (Pd Max) | 6 | threshold (gte) |
| `qgs` | Gate-Source Charge (Qgs) | 6 | threshold (lte) |
| `body_diode_vf` | Body Diode Forward Voltage (Vf) | 6 | threshold (lte) |
| `rth_ja` | Thermal Resistance Junction-to-Ambient (Rθja) | 5 | application_review |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 2 | operational |

---

## YENJI

**451 products** across 5 families

### B4 — TVS Diodes — Transient Voltage Suppressors (254 products, sampled 100)

**Coverage**: 10 of 23 rules covered (43%) | 13 raw params mapped | 3 unmapped | 13 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | SMC(DO-214AB), SOD123FL |
| 电源电压 | `vrwm` | 10 | identity | 95/100 (95%) | 48V, 12V |
| 极性 | `polarity` | 10 | identity | 86/100 (86%) | 单向, 双向 |
| 通道数 | `num_channels` | 10 | identity | 78/100 (78%) | 1, 2 |
| 反向断态电压 | `vrwm` | 10 | identity | 76/100 (76%) | 48V, 6V |
| 电路数 | `num_channels` | 10 | identity | 6/100 (6%) | 1 |
| 击穿电压 V(BR)-min | `vbr` | 9 | identity | 90/100 (90%) | 53.3V, 13.3V |
| 功率-峰值脉冲 | `ppk` | 9 | threshold (gte) | 81/100 (81%) | 1.5KW, 200W |
| 峰值脉冲电流(Ipp) | `ipp` | 8 | threshold (gte) | 88/100 (88%) | 19.4A, 10.1A |
| 结电容 | `cj` | 8 | threshold (lte) | 34/100 (34%) | 30pF@1MHz, 0.8pF |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 71/100 (71%) | -65℃~+150℃(TJ), -55℃~+150℃(TJ) |
| 反向漏电流 IR | `ir_leakage` | 5 | threshold (lte) | 62/100 (62%) | 1uA, 0.5uA |
| 击穿电压Max | `_vbr_max` | — | *(no rule)* | 1/100 (1%) | 7.14V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 最大工作电压 | 100/100 (100%) | 48V, 12V |
| 测试电流(IT) | 5/100 (5%) | 1mA |
| 压敏电压 | 5/100 (5%) | 30V, 200V |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `vc` | Clamping Voltage (Vc) | 10 | threshold (lte) |
| `configuration` | Configuration / Topology | 10 | identity |
| `pin_configuration` | Pin Configuration / Pinout | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `surge_standard` | Surge Standard Compliance (IEC 61000-4-5 / ISO 7637) | 8 | identity_flag |
| `esd_rating` | ESD Rating (IEC 61000-4-2) | 7 | threshold (gte) |
| `response_time` | Response Time | 6 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rθja) | 5 | threshold (lte) |
| `pd` | Steady-State Power Dissipation (Pd) | 5 | threshold (gte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### 66 — PTC Resettable Fuses (PolyFuses) (107 products, sampled 100)

**Coverage**: 10 of 15 rules covered (67%) | 13 raw params mapped | 2 unmapped | 5 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 保持电流 | `hold_current` | 10 | identity | 100/100 (100%) | 650mA, 500mA |
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | PTC_D9.7X3MM_TM, 1206 |
| 额定电压-DC | `max_voltage` | 10 | threshold (gte) | 100/100 (100%) | 60V, 6V |
| 最大工作电压 | `max_voltage` | 10 | threshold (gte) | 97/100 (97%) | 60V, 6V |
| 额定电流 | `hold_current` | 10 | identity | 22/100 (22%) | 100A, 10A |
| 跳闸动作电流(It) | `trip_current` | 9 | threshold (lte) | 97/100 (97%) | 1.3A, 1A |
| 熔断电流 | `trip_current` | 9 | threshold (lte) | 84/100 (84%) | 1.3A, 1A |
| 电流-最大值 | `max_fault_current` | 8 | threshold (gte) | 89/100 (89%) | 40A, 100A |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 99/100 (99%) | -10℃~+40℃, -40℃~+85℃ |
| 熔断时间 | `time_to_trip` | 7 | threshold (lte) | 25/100 (25%) | 0.3sec, 1.5sec |
| 电阻-初始(Ri)(最小值) | `initial_resistance` | 6 | threshold (lte) | 57/100 (57%) | 150mΩ, 350mΩ |
| 功率耗散(最大值) | `power_dissipation` | 5 | threshold (lte) | 82/100 (82%) | 880mW, 600mW |
| 电阻-跳断后(R1)(最大值) | `post_trip_resistance` | 5 | application_review | 51/100 (51%) | 700mΩ, 3.5Ω |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 中断电压 | 3/100 (3%) | 600V |
| 工作电流 | 2/100 (2%) | 0.1~3.5A, 50~350mA |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `safety_rating` | Safety Rating (UL, TUV, CSA) | 8 | identity_flag |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `endurance_cycles` | Endurance (Trip/Reset Cycles) | 6 | threshold (gte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging | 2 | operational |

---

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (62 products, sampled 62)

**Coverage**: 10 of 23 rules covered (43%) | 13 raw params mapped | 5 unmapped | 13 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 62/62 (100%) | SMB(DO-214AA), SOD-123 |
| 反向耐压VR | `vrrm` | 10 | threshold (gte) | 60/62 (97%) | 1KV, 400V |
| 平均整流电流 | `io_avg` | 10 | threshold (gte) | 60/62 (97%) | 1A, 2A |
| 二极管配置 | `configuration` | 10 | identity | 49/62 (79%) | 单路, 3 Independent |
| 反向峰值电压(最大值) | `vrrm` | 10 | threshold (gte) | 41/62 (66%) | 150V, 100V |
| 正向电流 | `io_avg` | 10 | threshold (gte) | 14/62 (23%) | 3A, 120A |
| 正向压降VF | `vf` | 8 | threshold (lte) | 55/62 (89%) | 1.7V, 1.3V |
| 正向压降VF Max | `vf` | 8 | threshold (lte) | 28/62 (45%) | 1.7V, 1.25V |
| 反向恢复时间(trr) | `trr` | 8 | threshold (lte) | 10/62 (16%) | 75ns, 35ns |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 49/62 (79%) | -65℃~+150℃, -55℃~+150℃ |
| Ifsm - 正向浪涌峰值电流 | `ifsm` | 7 | threshold (gte) | 28/62 (45%) | 2A, 80A |
| 反向漏电流IR | `ir_leakage` | 5 | threshold (lte) | 58/62 (94%) | 5uA, 2.5µA |
| 结电容 | `cj` | 4 | application_review | 3/62 (5%) | 300pF |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 二极管类型 | 29/62 (47%) | Schottky, Single Phase |
| 总电容C | 12/62 (19%) | 15pF, 19pF |
| 工作温度-结 | 7/62 (11%) | -55°C~125°C, -65°C~150°C |
| 功率耗散(最大值) | 4/62 (6%) | 350mW, 250mW |
| 最大直流阻断电压VDC | 1/62 (2%) | 1KV |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `recovery_category` | Recovery Category | 10 | identity_upgrade |
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vdc` | Max DC Blocking Voltage (Vdc) | 8 | threshold (gte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `qrr` | Reverse Recovery Charge (Qrr) | 7 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 7 | threshold (gte) |
| `recovery_behavior` | Recovery Behavior (Soft vs. Snappy) | 6 | application_review |
| `rth_jc` | Thermal Resistance, Junction-to-Case (Rtheta_jc) | 6 | threshold (lte) |
| `pd` | Power Dissipation (Pd) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B3 — Zener Diodes / Voltage Reference Diodes (22 products, sampled 22)

**Coverage**: 8 of 22 rules covered (36%) | 11 raw params mapped | 4 unmapped | 14 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 21/22 (95%) | SOD-123, SMA(DO-214AC) |
| 稳压值Vz | `vz` | 10 | identity | 20/22 (91%) | 10V, 24V |
| 标准稳压值 | `vz` | 10 | identity | 15/22 (68%) | 9.1V, 27V |
| 二极管配置 | `configuration` | 9 | identity | 20/22 (91%) | 单路 |
| 功率耗散(最大值) | `pd` | 9 | threshold (gte) | 20/22 (91%) | 500mW, 350mW |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 20/22 (91%) | +150℃(TJ), -55℃~+150℃(TJ) |
| Zzt阻抗 | `zzt` | 7 | threshold (lte) | 1/22 (5%) | 700Ω |
| 反向漏电流IR | `ir_leakage` | 5 | threshold (lte) | 21/22 (95%) | 3µA, 100nA |
| 正向压降VF Max | `vf` | 3 | application_review | 3/22 (14%) | 1.2V, 900mV |
| 最小稳压值 | `_vz_min` | — | *(no rule)* | 3/22 (14%) | 6.46V, 12.4V |
| 最大稳压值 | `_vz_max` | — | *(no rule)* | 3/22 (14%) | 7.18V, 14.1V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 反向电流Izt | 20/22 (91%) | 20mA, 5.2mA |
| 动态电阻(最大值) | 17/22 (77%) | 17 Ohms, 33Ohm |
| 湿气敏感性等级 (MSL) | 14/22 (64%) | 1（无限） |
| 正向压降VF | 2/22 (9%) | 900mV |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vz_tolerance` | Zener Voltage Tolerance | 8 | threshold (lte) |
| `izt` | Zener Test Current (Izt) | 8 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `tc` | Temperature Coefficient (TC / αVz) | 7 | threshold (lte) |
| `izm` | Maximum Zener Current (Izm) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rθja) | 6 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 6 | threshold (gte) |
| `height` | Height (Seated Max) | 5 | fit |
| `zzk` | Knee Impedance (Zzk) | 4 | application_review |
| `cj` | Junction Capacitance (Cj) | 4 | application_review |
| `regulation_type` | Regulation Type (Zener vs. Avalanche) | 3 | application_review |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B5 — MOSFETs — N-Channel & P-Channel (6 products, sampled 6)

**Coverage**: 9 of 27 rules covered (33%) | 13 raw params mapped | 1 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 连续漏极电流 | `id_max` | 10 | threshold (gte) | 6/6 (100%) | 173mA, 320mA |
| 封装/外壳 | `package_case` | 10 | identity | 6/6 (100%) | SOT-23, SOT-523-3 |
| 漏源电压(Vdss) | `vds_max` | 10 | threshold (gte) | 6/6 (100%) | 50V, 60V |
| 晶体管类型 | `channel_type` | 10 | identity | 6/6 (100%) | N沟道, P沟道 |
| 极性 | `channel_type` | 10 | identity | 4/6 (67%) | N-沟道, P-沟道 |
| 击穿电压 | `vds_max` | 10 | threshold (gte) | 2/6 (33%) | 60V, 20V |
| 栅极源极击穿电压 | `vgs_max` | 8 | threshold (gte) | 3/6 (50%) | ±20V, ±12V |
| 反向传输电容Crss | `crss` | 7 | threshold (lte) | 1/6 (17%) | 4pF |
| 阈值电压 | `vgs_th` | 6 | application_review | 6/6 (100%) | 1.8V@1mA, 2.5V@250µA |
| 功率耗散 | `pd` | 6 | threshold (gte) | 4/6 (67%) | 1.3W, 270mW |
| 输入电容 | `ciss` | 6 | threshold (lte) | 3/6 (50%) | 25pF, 13pF |
| 工作温度 | `operating_temp` | — | *(no rule)* | 6/6 (100%) | +150℃(TJ), -55℃~+150℃(TJ) |
| 配置 | `_configuration` | — | *(no rule)* | 6/6 (100%) | 单路, 双路 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 不同 Id，Vgs时的 RdsOn(最大值) | 4/6 (67%) | 2.7欧姆@50mA，5V, 380mΩ |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration (G-D-S Order, Tab Assignment) | 10 | identity |
| `technology` | Technology (Si / SiC / GaN) | 9 | identity_flag |
| `rds_on` | On-State Resistance (Rds(on)) | 9 | threshold (lte) |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `qg` | Total Gate Charge (Qg) | 8 | threshold (lte) |
| `body_diode_trr` | Body Diode Reverse Recovery Time (trr) | 8 | threshold (lte) |
| `id_pulse` | Peak Pulsed Drain Current (Id Pulse) | 7 | threshold (gte) |
| `avalanche_energy` | Avalanche Energy (Eas) | 7 | threshold (gte) |
| `qgd` | Gate-Drain Charge / Miller Charge (Qgd) | 7 | threshold (lte) |
| `coss` | Output Capacitance (Coss) | 7 | application_review |
| `rth_jc` | Thermal Resistance Junction-to-Case (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA) Curves | 7 | application_review |
| `qgs` | Gate-Source Charge (Qgs) | 6 | threshold (lte) |
| `body_diode_vf` | Body Diode Forward Voltage (Vf) | 6 | threshold (lte) |
| `rth_ja` | Thermal Resistance Junction-to-Ambient (Rθja) | 5 | application_review |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 2 | operational |

---

## Convert

**731 products** across 6 families

### B5 — MOSFETs — N-Channel & P-Channel (605 products, sampled 100)

**Coverage**: 7 of 27 rules covered (26%) | 8 raw params mapped | 2 unmapped | 20 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | SOP-8, SOT23-3 |
| Polarity | `channel_type` | 10 | identity | 100/100 (100%) | P, N |
| VDS (V) | `vds_max` | 10 | threshold (gte) | 100/100 (100%) | -600, -350 |
| ID (A) | `id_max` | 10 | threshold (gte) | 100/100 (100%) | -1, -0.3 |
| Tech nology | `technology` | 9 | identity_flag | 100/100 (100%) | MVMOS, MVMOS II |
| Qg*  (nC) | `qg` | 8 | threshold (lte) | 90/100 (90%) | 8.8, 1.25 |
| Vth(V) Typ | `vgs_th` | 6 | application_review | 100/100 (100%) | -3, -1.6 |
| RDS(ON) (mΩ) 10V typ | `_rds_on_typ` | — | *(no rule)* | 99/100 (99%) | 12000, 1250 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 100/100 (100%) | New, Act |
| RDS(ON) (mΩ) 4.5V typ | 3/100 (3%) | 19000, 18 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration (G-D-S Order, Tab Assignment) | 10 | identity |
| `rds_on` | On-State Resistance (Rds(on)) | 9 | threshold (lte) |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `vgs_max` | Gate-Source Voltage (Vgs Max) | 8 | threshold (gte) |
| `body_diode_trr` | Body Diode Reverse Recovery Time (trr) | 8 | threshold (lte) |
| `id_pulse` | Peak Pulsed Drain Current (Id Pulse) | 7 | threshold (gte) |
| `avalanche_energy` | Avalanche Energy (Eas) | 7 | threshold (gte) |
| `qgd` | Gate-Drain Charge / Miller Charge (Qgd) | 7 | threshold (lte) |
| `coss` | Output Capacitance (Coss) | 7 | application_review |
| `crss` | Reverse Transfer Capacitance (Crss) | 7 | threshold (lte) |
| `rth_jc` | Thermal Resistance Junction-to-Case (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA) Curves | 7 | application_review |
| `pd` | Power Dissipation (Pd Max) | 6 | threshold (gte) |
| `qgs` | Gate-Source Charge (Qgs) | 6 | threshold (lte) |
| `ciss` | Input Capacitance (Ciss) | 6 | threshold (lte) |
| `body_diode_vf` | Body Diode Forward Voltage (Vf) | 6 | threshold (lte) |
| `rth_ja` | Thermal Resistance Junction-to-Ambient (Rθja) | 5 | application_review |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 2 | operational |

---

### C2 — Switching Regulators (DC-DC Converters & Controllers) (37 products, sampled 37)

**Coverage**: 0 of 22 rules covered (0%) | 0 raw params mapped | 15 unmapped | 22 rules missing

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 37/37 (100%) | R&D, Act |
| Vin(max) (V) | 37/37 (100%) | 90, 120 |
| Freq(max) (KHz) | 37/37 (100%) | 1MHz, 2MHz |
| Control Mode | 37/37 (100%) | 电流, 电压 |
| Topology | 37/37 (100%) | 反激、正激, 降压、升压和反激（SEPIC 和 Cuk） |
| Features | 37/37 (100%) | 内置误差放大器、高精度基准电压、可编程线路欠压锁定（UVLO）、逐周期限流、斜坡补偿、软起动和..., 内置误差放大器、精密基准、欠压保护、逐周期限流、斜坡补偿、软启动、振荡器可同步和过温保护 |
| UVLO on/off (V) | 34/37 (92%) | Programmable, 7/5.8 |
| Duty Cycle (max) (%) | 34/37 (92%) | 97, 95 |
| Source/Sink Current (A) | 34/37 (92%) | 1, 0.3/0.7 |
| Cross Refrence | 25/37 (68%) | LM5020, LM5020-1 |
| Channels | 3/37 (8%) | 1 |
| Vin(min) (V) | 3/37 (8%) | 5, 7.5 |
| IOUT (A) | 3/37 (8%) | 4.5, 0.65 |
| VOUT (V) | 3/37 (8%) | 可调 |
| Duty Cycle (max)(%) | 1/37 (3%) | 95 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `topology` | Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant) | 10 | identity |
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `package_case` | Package / Footprint | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `control_mode` | Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current) | 9 | identity |
| `iout_max` | Maximum Output Current / Switch Current Limit | 9 | threshold (gte) |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `vout_range` | Output Voltage Range (Min–Max Achievable) | 8 | threshold (range_superset) |
| `fsw` | Switching Frequency (fsw) | 8 | identity |
| `compensation_type` | Compensation Type (Internal / External Type-II / Type-III / No-Comp) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min) | 7 | threshold (lte) |
| `ton_min` | Minimum On-Time / Off-Time (ton_min, toff_min) | 7 | threshold (lte) |
| `gate_drive_current` | Gate Drive Voltage / Current (Controller-Only) | 7 | threshold (gte) |
| `enable_uvlo` | Enable / UVLO Pin (Active High / Active Low / Threshold) | 7 | identity_flag |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `soft_start` | Soft-Start (Internal Fixed / External Css / Absent) | 6 | identity_flag |
| `ocp_mode` | Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown Threshold | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### B7 — IGBTs — Insulated Gate Bipolar Transistors (29 products, sampled 29)

**Coverage**: 3 of 25 rules covered (12%) | 3 raw params mapped | 7 unmapped | 22 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 29/29 (100%) | TO220-3, TO247plus-3 |
| VCES(V) | `vces_max` | 10 | threshold (gte) | 29/29 (100%) | 650, 1200 |
| Eoff(mJ) | `eoff` | 9 | threshold (lte) | 28/29 (97%) | 0.39, 5.69 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 29/29 (100%) | New, R&D |
| TechType | 29/29 (100%) | IGBT |
| IC(A)@100℃ | 29/29 (100%) | 20, 150 |
| Vth(V)Typ | 29/29 (100%) | 5.3, 5.7 |
| VCE(v)_15_Typ | 28/29 (97%) | 1.75, 1.65 |
| VCE(v)_15_max | 28/29 (97%) | 2.05, 2.00 |
| Vf(V) | 28/29 (97%) | 1.46, 2.06 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `channel_type` | Channel Type (N-Channel / P-Channel) | 10 | identity |
| `co_packaged_diode` | Co-Packaged Antiparallel Diode | 10 | identity_flag |
| `ic_max` | Continuous Collector Current (Ic Max) | 10 | threshold (gte) |
| `igbt_technology` | IGBT Technology (PT / NPT / FS) | 9 | identity_upgrade |
| `mounting_style` | Mounting Style | 9 | identity |
| `vce_sat` | Collector-Emitter Saturation Voltage (Vce(sat)) | 9 | threshold (lte) |
| `tsc` | Short-Circuit Withstand Time (tsc) | 9 | threshold (gte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `vge_max` | Gate-Emitter Voltage (Vge Max) | 8 | threshold (gte) |
| `eon` | Turn-On Energy Loss (Eon) | 8 | threshold (lte) |
| `ic_pulse` | Peak Pulsed Collector Current (Ic Pulse) | 7 | threshold (gte) |
| `qg` | Total Gate Charge (Qg) | 7 | threshold (lte) |
| `rth_jc` | Junction-to-Case Thermal Resistance (Rth_jc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA Curves) | 7 | application_review |
| `pd` | Power Dissipation (Pd Max) | 6 | threshold (gte) |
| `vge_th` | Gate Threshold Voltage (Vge(th)) | 6 | application_review |
| `td_on` | Turn-On Delay Time (td(on)) | 6 | threshold (lte) |
| `td_off` | Turn-Off Delay Time (td(off)) | 6 | threshold (lte) |
| `tf` | Fall Time (tf) | 6 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 6 | threshold (gte) |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tube, Tray) | 2 | operational |

---

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (24 products, sampled 24)

**Coverage**: 1 of 23 rules covered (4%) | 1 raw params mapped | 16 unmapped | 22 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 21/24 (88%) | TO247-3, TO220-2 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 24/24 (100%) | New, R&D |
| Polarity | 21/24 (88%) | Double, single |
| Tech nology | 21/24 (88%) | SiCSBD Ⅲ |
| VDS (V) | 21/24 (88%) | 1200, 650 |
| ID* (A)  @25°C | 15/24 (63%) | 60, 10 |
| VF (V) | 15/24 (63%) | 1.45, 1.27 |
| Qc (nC) | 15/24 (63%) | 114, 25 |
| Cj (pF) | 15/24 (63%) | 1980, 640 |
| Vin(min) (V) | 3/24 (13%) | 4, 9 |
| Vin(max) (V) | 3/24 (13%) | 80 |
| Iq(tpy) (uA) | 3/24 (13%) | 40, 500 |
| Iq(max)  (uA) | 3/24 (13%) | 130, 1250 |
| FET | 3/24 (13%) | External single FET |
| IGATE SOURCE (tpy)(mA) | 3/24 (13%) | 11, 20 |
| IGATE Sink (tpy) (mA) | 3/24 (13%) | 2370, 2000 |
| Cross Refrence | 3/24 (13%) | LM74700Q, LTC4357 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `recovery_category` | Recovery Category | 10 | identity_upgrade |
| `vrrm` | Max Repetitive Peak Reverse Voltage (Vrrm) | 10 | threshold (gte) |
| `io_avg` | Average Rectified Forward Current (Io) | 10 | threshold (gte) |
| `configuration` | Configuration | 10 | identity |
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vdc` | Max DC Blocking Voltage (Vdc) | 8 | threshold (gte) |
| `vf` | Forward Voltage Drop (Vf) | 8 | threshold (lte) |
| `trr` | Reverse Recovery Time (trr) | 8 | threshold (lte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `ifsm` | Max Surge Forward Current (Ifsm) | 7 | threshold (gte) |
| `qrr` | Reverse Recovery Charge (Qrr) | 7 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 7 | threshold (gte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `recovery_behavior` | Recovery Behavior (Soft vs. Snappy) | 6 | application_review |
| `rth_jc` | Thermal Resistance, Junction-to-Case (Rtheta_jc) | 6 | threshold (lte) |
| `pd` | Power Dissipation (Pd) | 6 | threshold (gte) |
| `ir_leakage` | Reverse Leakage Current (Ir) | 5 | threshold (lte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `cj` | Junction Capacitance (Cj) | 4 | application_review |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### C1 — Linear Voltage Regulators (LDOs) (22 products, sampled 22)

**Coverage**: 0 of 22 rules covered (0%) | 0 raw params mapped | 10 unmapped | 22 rules missing

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 22/22 (100%) | Act, R&D |
| Output options | 22/22 (100%) | Adjustable Output, Fixed Output(5.0V) |
| Iout(max) (A) | 22/22 (100%) | 0.75, 2 |
| Vin(max) (V) | 22/22 (100%) | 26, -35 |
| Vin(min) (V) | 22/22 (100%) | 2, 2.24 |
| Vout(max) (V) | 22/22 (100%) | 26, 5 |
| Vout(min) (V) | 22/22 (100%) | 1.24, 5 |
| Vdrop(typ) (mV) | 22/22 (100%) | 300, 420 |
| Cross Refrence | 12/22 (55%) | MIC29372BU, MIC29152BU |
| Noise (uVrms) | 11/22 (50%) | 400, 30 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `output_type` | Output Type (Fixed / Adjustable / Tracking / Negative) | 10 | identity |
| `output_voltage` | Output Voltage Vout | 10 | identity |
| `package_case` | Package / Footprint | 10 | identity |
| `polarity` | Polarity (Positive / Negative) | 10 | identity |
| `iout_max` | Maximum Output Current (Iout Max) | 9 | threshold (gte) |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `output_cap_compatibility` | Output Capacitor ESR Compatibility (Ceramic Stable) | 8 | identity_flag |
| `enable_pin` | Enable Pin (Active High / Active Low / Absent) | 8 | identity |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min / Dropout) | 7 | threshold (lte) |
| `vdropout` | Dropout Voltage (Vdropout Max) | 7 | threshold (lte) |
| `vout_accuracy` | Output Voltage Accuracy (Initial Tolerance) | 7 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `psrr` | PSRR (Power Supply Rejection Ratio) | 6 | application_review |
| `power_good` | Power-Good / Flag Pin | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown | 6 | identity_flag |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `iq` | Quiescent Current (Iq / Ground Current) | 5 | threshold (lte) |
| `load_regulation` | Load Regulation (ΔVout / ΔIout) | 5 | threshold (lte) |
| `soft_start` | Soft-Start | 5 | identity_flag |
| `line_regulation` | Line Regulation (ΔVout / ΔVin) | 4 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C5 — Logic ICs — 74-Series Standard Logic (14 products, sampled 14)

**Coverage**: 0 of 23 rules covered (0%) | 0 raw params mapped | 20 unmapped | 23 rules missing

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 13/14 (93%) | Act |
| Technology family | 13/14 (93%) | LVC |
| Function | 13/14 (93%) | 与门, 与非门 |
| Number of channels | 13/14 (93%) | 2, 4 |
| Inputs per channel | 13/14 (93%) | 3, 4 |
| Input type | 13/14 (93%) | Standard CMOS |
| Output type | 13/14 (93%) | Push-Pull |
| Supply voltage (min)(V) | 13/14 (93%) | 1.65 |
| Supply voltage (max)(V) | 13/14 (93%) | 7 |
| IOL (mA) | 13/14 (93%) | 32 |
| IOH (mA) | 13/14 (93%) | -32 |
| Cross Refrence | 13/14 (93%) | SN74LV11A, SN74LV21A |
| 功能描述 | 1/14 (7%) | R&D |
| 类别 | 1/14 (7%) | 8位可寻址锁存器 |
| 通道数 | 1/14 (7%) | 8 |
| 输入类型 | 1/14 (7%) | TTL-Compatible CMOS |
| 输出类型 | 1/14 (7%) | Push-Pull |
| 工作电压范围 (V) | 1/14 (7%) | 4.5~7 |
| 封装类型 | 1/14 (7%) | TSSOP16 |
| 兼容 | 1/14 (7%) | 74HCT259 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `logic_function` | Logic Function (Part Number Suffix) | 10 | identity |
| `gate_count` | Number of Gates / Sections / Bits | 10 | identity |
| `package_case` | Package / Footprint | 10 | identity |
| `oe_polarity` | 3-State Output Enable (OE) Polarity | 9 | identity_flag |
| `output_type` | Output Type (Totem-pole / Open-drain / 3-state) | 8 | identity_flag |
| `supply_voltage` | Supply Voltage Range (Vcc) | 8 | threshold (range_superset) |
| `aec_q100` | AEC-Q100 Automotive Qualification | 8 | identity_flag |
| `voh` | Output High Voltage (VOH) | 7 | threshold (gte) |
| `drive_current` | Output Drive Current (IOH / IOL) | 7 | threshold (gte) |
| `schmitt_trigger` | Schmitt Trigger Input | 7 | identity_flag |
| `vih` | Input High Threshold (VIH) | 7 | threshold (lte) |
| `logic_family` | Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | 7 | application_review |
| `tpd` | Propagation Delay (tpd) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `vol` | Output Low Voltage (VOL) | 6 | threshold (lte) |
| `vil` | Input Low Threshold (VIL) | 6 | threshold (gte) |
| `fmax` | Maximum Operating Frequency (fmax) | 6 | threshold (gte) |
| `setup_hold_time` | Setup Time / Hold Time (tsu / th) | 6 | application_review |
| `bus_hold` | Bus Hold / Weak Pull-up | 5 | identity_flag |
| `input_clamp_diodes` | Input Clamp Diodes | 4 | identity_flag |
| `input_leakage` | Input Leakage Current (IIH / IIL) | 4 | threshold (lte) |
| `transition_time` | Output Transition Time (tr / tf) | 4 | application_review |
| `packaging` | Packaging Format (Tape & Reel / Tube / Tray) | 1 | operational |

---

## YJYCOIN

**608 products** across 2 families

### 71 — Power Inductors (Surface Mount) (603 products, sampled 100)

**Coverage**: 9 of 17 rules covered (53%) | 11 raw params mapped | 1 unmapped | 8 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | IND_5.8X5.2MM_SM, IND_10X9MM_SM |
| 感值 | `inductance` | 10 | identity | 99/100 (99%) | 10μH, 1mH |
| 额定电流 | `rated_current` | 9 | threshold (gte) | 99/100 (99%) | 1.44A, 200mA |
| 饱和电流 | `saturation_current` | 9 | threshold (gte) | 56/100 (56%) | 26A, 3A |
| 屏蔽 | `shielding` | 8 | identity_upgrade | 52/100 (52%) | 无屏蔽, 屏蔽 |
| 直流电阻(DCR) | `dcr` | 7 | threshold (lte) | 98/100 (98%) | 0.1Ω, 2.7Ω |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 88/100 (88%) | -40℃~+125℃, -40℃~+85℃ |
| 精度 | `tolerance` | 6 | threshold (lte) | 99/100 (99%) | ±20%, ±10% |
| 自谐振频率 | `srf` | 5 | threshold (gte) | 2/100 (2%) | 75MHz, 100KHz |
| 测试频率 | `_test_frequency` | — | *(no rule)* | 55/100 (55%) | 100KHz |
| 类型 | `_type` | — | *(no rule)* | 4/100 (4%) | 绕线, 功率电感 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 不同频率时Q值 | 1/100 (1%) | 35@10MHz |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `inductance_vs_dc_bias` | Inductance vs DC Bias | 7 | application_review |
| `core_material` | Core Material | 5 | identity_upgrade |
| `height` | Height (Seated Max) | 5 | fit |
| `acr` | AC Resistance (ACR) | 4 | threshold (lte) |
| `construction_type` | Construction Type | 4 | identity |
| `msl` | Moisture Sensitivity Level | 3 | threshold (lte) |
| `packaging` | Packaging | 2 | operational |

---

### 70 — Ferrite Beads (Surface Mount) (5 products, sampled 5)

**Coverage**: 7 of 14 rules covered (50%) | 7 raw params mapped | 0 unmapped | 7 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 5/5 (100%) | 0805, 1206 |
| 阻抗 | `impedance_100mhz` | 10 | identity | 4/5 (80%) | 1KΩ@100MHz, 600Ω |
| 额定电流 | `rated_current` | 9 | threshold (gte) | 4/5 (80%) | 1A, 3A |
| 直流电阻(DCR) | `dcr` | 7 | threshold (lte) | 4/5 (80%) | 300mΩ, 60mΩ |
| 工作温度 | `operating_temp` | 6 | threshold (range_superset) | 2/5 (40%) | -40℃~+125℃ |
| 通道数 | `number_of_lines` | 6 | identity | 1/5 (20%) | 1 |
| 精度 | `tolerance` | 5 | threshold (lte) | 4/5 (80%) | ±25% |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `impedance_curve` | Impedance vs Frequency Curve | 8 | application_review |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `signal_integrity` | Signal Integrity (S-Parameters) | 7 | application_review |
| `height` | Height (Seated Max) | 5 | fit |
| `voltage_rated` | Voltage Rating | 5 | threshold (gte) |
| `resistance_type` | Resistance Type | 4 | identity |
| `packaging` | Packaging | 2 | operational |

---

## CREATEK

**843 products** across 8 families

### B4 — TVS Diodes — Transient Voltage Suppressors (375 products, sampled 100)

**Coverage**: 3 of 23 rules covered (13%) | 3 raw params mapped | 8 unmapped | 20 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | DO-214AA/SMB, SMBF |
| VRWM(V) | `vrwm` | 10 | identity | 99/100 (99%) | 11.0~150.0, 5.0~440.0 |
| IR max(uA) | `ir_leakage` | 5 | threshold (lte) | 98/100 (98%) | 2, 1~1600 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Ipp(A) | 100/100 (100%) | 12.35~164.84, 0.84~65.22 |
| Ppp(W) | 100/100 (100%) | 3000, 600 |
| VBR min(V) | 98/100 (98%) | 12.2~167.0, 6.4~492.0 |
| Dir. | 74/100 (74%) | Uni-dir, Bi-dir |
| Config. | 74/100 (74%) | Single, Array |
| C typ.(pF) | 74/100 (74%) | 155, 265 |
| VC max(V) | 26/100 (26%) | 18.2~243.0, 9.2~713.0 |
| VBR max(V) | 25/100 (25%) | 13.50~185.0, 7.00~543.00 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `polarity` | Polarity (Unidirectional vs. Bidirectional) | 10 | identity |
| `vc` | Clamping Voltage (Vc) | 10 | threshold (lte) |
| `num_channels` | Number of Channels / Lines | 10 | identity |
| `configuration` | Configuration / Topology | 10 | identity |
| `pin_configuration` | Pin Configuration / Pinout | 10 | identity |
| `vbr` | Breakdown Voltage (Vbr) | 9 | identity |
| `ppk` | Peak Pulse Power (Ppk) | 9 | threshold (gte) |
| `mounting_style` | Mounting Style | 9 | identity |
| `ipp` | Peak Pulse Current (Ipp) | 8 | threshold (gte) |
| `cj` | Junction Capacitance (Cj) | 8 | threshold (lte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `surge_standard` | Surge Standard Compliance (IEC 61000-4-5 / ISO 7637) | 8 | identity_flag |
| `esd_rating` | ESD Rating (IEC 61000-4-2) | 7 | threshold (gte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `response_time` | Response Time | 6 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rθja) | 5 | threshold (lte) |
| `pd` | Steady-State Power Dissipation (Pd) | 5 | threshold (gte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (275 products, sampled 100)

**Coverage**: 5 of 23 rules covered (22%) | 5 raw params mapped | 7 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | DO-214AA/SMB, SMB |
| VRRM(V) | `vrrm` | 10 | threshold (gte) | 100/100 (100%) | 400~600, 50~1000 |
| VF(V) | `vf` | 8 | threshold (lte) | 65/100 (65%) | 1.25, 1.0~1.68 |
| Trr(nS) | `trr` | 8 | threshold (lte) | 32/100 (32%) | 4, 8.0 |
| IFSM(A) | `ifsm` | 7 | threshold (gte) | 64/100 (64%) | 35, 100.0 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| IR(uA) | 57/100 (57%) | 5.0, 5 |
| I(AV)(A) | 38/100 (38%) | 1.0, 5.0 |
| PD(mW) | 35/100 (35%) | 200, 400 |
| Io(mA) | 35/100 (35%) | 150, 200 |
| IF(mA) | 19/100 (19%) | 500, 1.0 |
| IF(A) | 8/100 (8%) | 3.0, 5.0 |
| IR(mA) | 8/100 (8%) | 0.005 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `recovery_category` | Recovery Category | 10 | identity_upgrade |
| `io_avg` | Average Rectified Forward Current (Io) | 10 | threshold (gte) |
| `configuration` | Configuration | 10 | identity |
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vdc` | Max DC Blocking Voltage (Vdc) | 8 | threshold (gte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `qrr` | Reverse Recovery Charge (Qrr) | 7 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 7 | threshold (gte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `recovery_behavior` | Recovery Behavior (Soft vs. Snappy) | 6 | application_review |
| `rth_jc` | Thermal Resistance, Junction-to-Case (Rtheta_jc) | 6 | threshold (lte) |
| `pd` | Power Dissipation (Pd) | 6 | threshold (gte) |
| `ir_leakage` | Reverse Leakage Current (Ir) | 5 | threshold (lte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `cj` | Junction Capacitance (Cj) | 4 | application_review |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B7 — IGBTs — Insulated Gate Bipolar Transistors (105 products, sampled 100)

**Coverage**: 3 of 25 rules covered (12%) | 4 raw params mapped | 0 unmapped | 22 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | TO-247, D9 |
| VCES(V) | `vces_max` | 10 | threshold (gte) | 100/100 (100%) | 1200, 650 |
| VCE(sat) | `vce_sat` | 9 | threshold (lte) | 99/100 (99%) | 2.30, 1.7 |
| VGE (th)(V) | `vgs_th` | — | *(no rule)* | 96/100 (96%) | 4.0~6.0, 5.0~6.0 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `channel_type` | Channel Type (N-Channel / P-Channel) | 10 | identity |
| `co_packaged_diode` | Co-Packaged Antiparallel Diode | 10 | identity_flag |
| `ic_max` | Continuous Collector Current (Ic Max) | 10 | threshold (gte) |
| `igbt_technology` | IGBT Technology (PT / NPT / FS) | 9 | identity_upgrade |
| `mounting_style` | Mounting Style | 9 | identity |
| `eoff` | Turn-Off Energy Loss (Eoff) | 9 | threshold (lte) |
| `tsc` | Short-Circuit Withstand Time (tsc) | 9 | threshold (gte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `vge_max` | Gate-Emitter Voltage (Vge Max) | 8 | threshold (gte) |
| `eon` | Turn-On Energy Loss (Eon) | 8 | threshold (lte) |
| `ic_pulse` | Peak Pulsed Collector Current (Ic Pulse) | 7 | threshold (gte) |
| `qg` | Total Gate Charge (Qg) | 7 | threshold (lte) |
| `rth_jc` | Junction-to-Case Thermal Resistance (Rth_jc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA Curves) | 7 | application_review |
| `pd` | Power Dissipation (Pd Max) | 6 | threshold (gte) |
| `vge_th` | Gate Threshold Voltage (Vge(th)) | 6 | application_review |
| `td_on` | Turn-On Delay Time (td(on)) | 6 | threshold (lte) |
| `td_off` | Turn-Off Delay Time (td(off)) | 6 | threshold (lte) |
| `tf` | Fall Time (tf) | 6 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 6 | threshold (gte) |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tube, Tray) | 2 | operational |

---

### B3 — Zener Diodes / Voltage Reference Diodes (30 products, sampled 30)

**Coverage**: 1 of 22 rules covered (5%) | 1 raw params mapped | 4 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 30/30 (100%) | DO-41, DO-214AA/SMB |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| VZ Type(V) | 30/30 (100%) | 3.3~100, 3.3~250.0 |
| VF (V) | 30/30 (100%) | 1.2, 0.9 |
| IR max(uA) | 30/30 (100%) | 5.0~100, 0.5~100 |
| Pd(W) | 30/30 (100%) | 1.0, 3.0 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `vz` | Zener Voltage (Vz) | 10 | identity |
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `pd` | Power Dissipation (Pd) | 9 | threshold (gte) |
| `configuration` | Configuration | 9 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vz_tolerance` | Zener Voltage Tolerance | 8 | threshold (lte) |
| `izt` | Zener Test Current (Izt) | 8 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `zzt` | Dynamic / Differential Impedance (Zzt) | 7 | threshold (lte) |
| `tc` | Temperature Coefficient (TC / αVz) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `izm` | Maximum Zener Current (Izm) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rθja) | 6 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 6 | threshold (gte) |
| `ir_leakage` | Reverse Leakage Current (Ir) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `zzk` | Knee Impedance (Zzk) | 4 | application_review |
| `cj` | Junction Capacitance (Cj) | 4 | application_review |
| `vf` | Forward Voltage (Vf) | 3 | application_review |
| `regulation_type` | Regulation Type (Zener vs. Avalanche) | 3 | application_review |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B6 — BJTs — NPN & PNP (28 products, sampled 28)

**Coverage**: 1 of 18 rules covered (6%) | 1 raw params mapped | 5 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 28/28 (100%) | DFN1006, SOT363 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Polarity | 28/28 (100%) | NPN, PNP |
| Vcbo(V) | 28/28 (100%) | 60, -80~-50 |
| Vceo(V) | 28/28 (100%) | 40, -65~-45 |
| Vebo(V) | 28/28 (100%) | 6, -5 |
| Ic(mA) | 28/28 (100%) | 200, -0.1 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `polarity` | Polarity (NPN / PNP) | 10 | identity |
| `ic_max` | Continuous Collector Current (Ic Max) | 10 | threshold (gte) |
| `vceo_max` | Vceo Max (Collector-Emitter Voltage, open base) | 9 | threshold (gte) |
| `vce_sat` | Vce(sat) Max (Collector-Emitter Saturation Voltage) | 8 | threshold (lte) |
| `hfe` | DC Current Gain (hFE) | 8 | application_review |
| `tst` | Storage Time (tst) | 8 | threshold (lte) |
| `aec_q101` | AEC-Q101 (Automotive Qualification) | 8 | identity_flag |
| `vces_max` | Vces Max (Collector-Emitter Voltage, shorted base) | 7 | threshold (gte) |
| `ft` | Transition Frequency (ft) | 7 | threshold (gte) |
| `toff` | Turn-Off Time (toff) | 7 | threshold (lte) |
| `pd` | Power Dissipation (Pd Max) | 7 | threshold (gte) |
| `rth_jc` | Junction-to-Case Thermal Resistance (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA Curves) | 7 | application_review |
| `vbe_sat` | Vbe(sat) Max (Base-Emitter Saturation Voltage) | 6 | threshold (lte) |
| `ton` | Turn-On Time (ton) | 6 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 6 | threshold (gte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Ammo) | 2 | operational |

---

### 66 — PTC Resettable Fuses (PolyFuses) (13 products, sampled 13)

**Coverage**: 1 of 15 rules covered (7%) | 1 raw params mapped | 4 unmapped | 14 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 11/13 (85%) | 2920, 2018 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Vmax(V) | 11/13 (85%) | 6~60, 10~60 |
| Ihold(A) | 11/13 (85%) | 0.30~7.00, 0.30~2.00 |
| Itrip(A) | 11/13 (85%) | 0.60~14.00, 0.60~4.00 |
| Pd(W) | 11/13 (85%) | 1.5, 0.9~1.1 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `hold_current` | Hold Current (Ihold) | 10 | identity |
| `max_voltage` | Maximum Voltage (Vmax) | 10 | threshold (gte) |
| `trip_current` | Trip Current (Itrip) | 9 | threshold (lte) |
| `max_fault_current` | Maximum Fault Current (Imax) | 8 | threshold (gte) |
| `safety_rating` | Safety Rating (UL, TUV, CSA) | 8 | identity_flag |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `time_to_trip` | Time-to-Trip | 7 | threshold (lte) |
| `operating_temp` | Operating Temp Range | 7 | threshold (range_superset) |
| `initial_resistance` | Initial Resistance (R₁) | 6 | threshold (lte) |
| `endurance_cycles` | Endurance (Trip/Reset Cycles) | 6 | threshold (gte) |
| `post_trip_resistance` | Post-Trip Resistance (R1max) | 5 | application_review |
| `power_dissipation` | Power Dissipation (Tripped State) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging | 2 | operational |

---

### B5 — MOSFETs — N-Channel & P-Channel (13 products, sampled 13)

**Coverage**: 3 of 27 rules covered (11%) | 3 raw params mapped | 5 unmapped | 24 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 13/13 (100%) | SOT-23, SOT363 |
| Polarity | `channel_type` | 10 | identity | 13/13 (100%) | P-MOS, N-MOS |
| ID(A) | `id_max` | 10 | threshold (gte) | 13/13 (100%) | -4.2, -2.8 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| VDS(V) | 13/13 (100%) | -30, -20 |
| VGS(V) | 13/13 (100%) | ±12, ±20 |
| VGS(th)(V) | 13/13 (100%) | -0.9, -0.65 |
| Rds(on)@VGS=4.5V(Ω) | 12/13 (92%) | 46, 70 |
| Rds(on)@VGS=10V(Ω) | 7/13 (54%) | 20, 4.5 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration (G-D-S Order, Tab Assignment) | 10 | identity |
| `vds_max` | Drain-Source Voltage (Vds Max) | 10 | threshold (gte) |
| `technology` | Technology (Si / SiC / GaN) | 9 | identity_flag |
| `rds_on` | On-State Resistance (Rds(on)) | 9 | threshold (lte) |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `vgs_max` | Gate-Source Voltage (Vgs Max) | 8 | threshold (gte) |
| `qg` | Total Gate Charge (Qg) | 8 | threshold (lte) |
| `body_diode_trr` | Body Diode Reverse Recovery Time (trr) | 8 | threshold (lte) |
| `id_pulse` | Peak Pulsed Drain Current (Id Pulse) | 7 | threshold (gte) |
| `avalanche_energy` | Avalanche Energy (Eas) | 7 | threshold (gte) |
| `qgd` | Gate-Drain Charge / Miller Charge (Qgd) | 7 | threshold (lte) |
| `coss` | Output Capacitance (Coss) | 7 | application_review |
| `crss` | Reverse Transfer Capacitance (Crss) | 7 | threshold (lte) |
| `rth_jc` | Thermal Resistance Junction-to-Case (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA) Curves | 7 | application_review |
| `pd` | Power Dissipation (Pd Max) | 6 | threshold (gte) |
| `vgs_th` | Gate Threshold Voltage (Vgs(th)) | 6 | application_review |
| `qgs` | Gate-Source Charge (Qgs) | 6 | threshold (lte) |
| `ciss` | Input Capacitance (Ciss) | 6 | threshold (lte) |
| `body_diode_vf` | Body Diode Forward Voltage (Vf) | 6 | threshold (lte) |
| `rth_ja` | Thermal Resistance Junction-to-Ambient (Rθja) | 5 | application_review |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 2 | operational |

---

### 65 — Varistors / Metal Oxide Varistors (MOVs) (4 products, sampled 4)

**Coverage**: 0 of 16 rules covered (0%) | 0 raw params mapped | 9 unmapped | 16 rules missing

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Diameter | 4/4 (100%) | Φ20mm, Φ10mm |
| VAC(V) | 4/4 (100%) | 11~1100, 11~680 |
| VDC(V) | 4/4 (100%) | 14~1465, 14~895 |
| V(1mA)(V) | 4/4 (100%) | 18~1800, 18~1100 |
| IP(A) | 4/4 (100%) | 10~50, 5~25 |
| VC(V) | 4/4 (100%) | 36~2970, 36~1815 |
| 8/20us(A) | 4/4 (100%) | 1000~6000, 500~3500 |
| 10/1000μs(J) | 4/4 (100%) | 4~335, 2.1~155 |
| Rated Power(W) | 4/4 (100%) | 0.1~0.6, 0.05~0.4 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `varistor_voltage` | Varistor Voltage (V₁ₘₐ) | 10 | identity |
| `package_case` | Package / Form Factor | 10 | identity |
| `clamping_voltage` | Clamping Voltage (Vc) | 9 | threshold (lte) |
| `max_continuous_voltage` | Maximum Continuous Voltage (AC/DC) | 9 | threshold (gte) |
| `energy_rating` | Energy Rating (Joules) | 8 | threshold (gte) |
| `peak_surge_current` | Peak Surge Current (8/20µs) | 8 | threshold (gte) |
| `safety_rating` | Safety Rating (UL, IEC) | 8 | identity_flag |
| `thermal_disconnect` | Thermal Disconnect / Fuse | 8 | identity_flag |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `lead_spacing` | Lead Spacing / Pitch | 7 | identity |
| `operating_temp` | Operating Temp Range | 7 | threshold (range_superset) |
| `disc_diameter` | Disc Diameter (Radial) | 6 | fit |
| `surge_pulse_lifetime` | Number of Surge Pulses (Lifetime) | 6 | threshold (gte) |
| `response_time` | Response Time | 5 | threshold (lte) |
| `leakage_current` | Leakage Current | 5 | threshold (lte) |
| `packaging` | Packaging | 2 | operational |

---

## CYNTEC

**944 products** across 3 families

### 52 — Chip Resistors (Surface Mount) (478 products, sampled 100)

**Coverage**: 7 of 13 rules covered (54%) | 7 raw params mapped | 0 unmapped | 6 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 阻值 | `resistance` | 10 | identity | 100/100 (100%) | 10kΩ, 180Ω |
| 封装 | `package_case` | 10 | identity | 100/100 (100%) | 0201, 0402 |
| 功率 | `power_rating` | 9 | threshold (gte) | 99/100 (99%) | 50mW, 100mW |
| 工作温度范围 | `operating_temp` | 7 | threshold (range_superset) | 99/100 (99%) | -55℃~+125℃ |
| 精度 | `tolerance` | 7 | threshold (lte) | 98/100 (98%) | ±5%, ±1% |
| 温度系数 | `tcr` | 6 | threshold (lte) | 97/100 (97%) | ±200ppm/℃, -200ppm/℃~+600ppm/℃ |
| 电阻类型 | `composition` | 5 | identity_upgrade | 99/100 (99%) | 厚膜电阻 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `voltage_rated` | Voltage Rating | 8 | threshold (gte) |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `anti_sulfur` | Anti-Sulfur | 7 | identity_flag |
| `height` | Height (Seated Max) | 5 | fit |
| `msl` | Moisture Sensitivity Level | 3 | threshold (lte) |
| `packaging` | Packaging | 2 | operational |

---

### 71 — Power Inductors (Surface Mount) (450 products, sampled 100)

**Coverage**: 7 of 17 rules covered (41%) | 7 raw params mapped | 2 unmapped | 10 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装 | `package_case` | 10 | identity | 100/100 (100%) | SMD,7x6.6mm, SMD |
| 电感值 | `inductance` | 10 | identity | 95/100 (95%) | 330nH, 6.8uH |
| 额定电流 | `rated_current` | 9 | threshold (gte) | 90/100 (90%) | 22A, 5.5A |
| 饱和电流(Isat) | `saturation_current` | 9 | threshold (gte) | 6/100 (6%) | 22A, 6.1A |
| 直流电阻(DCR) | `dcr` | 7 | threshold (lte) | 90/100 (90%) | 3.3mΩ, 28mΩ |
| 精度 | `tolerance` | 6 | threshold (lte) | 97/100 (97%) | ±20%, 精度 |
| 自谐振频率 | `srf` | 5 | threshold (gte) | 83/100 (83%) | 6GHz, 5.5GHz |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Q值 | 79/100 (79%) | 4@100MHz, 5@100MHz |
| 车规等级 | 1/100 (1%) | AEC-Q200 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `shielding` | Shielding | 8 | identity_upgrade |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `operating_temp` | Operating Temp Range | 7 | threshold (range_superset) |
| `inductance_vs_dc_bias` | Inductance vs DC Bias | 7 | application_review |
| `core_material` | Core Material | 5 | identity_upgrade |
| `height` | Height (Seated Max) | 5 | fit |
| `acr` | AC Resistance (ACR) | 4 | threshold (lte) |
| `construction_type` | Construction Type | 4 | identity |
| `msl` | Moisture Sensitivity Level | 3 | threshold (lte) |
| `packaging` | Packaging | 2 | operational |

---

### C2 — Switching Regulators (DC-DC Converters & Controllers) (16 products, sampled 16)

**Coverage**: 1 of 22 rules covered (5%) | 2 raw params mapped | 5 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装 | `package_case` | 10 | identity | 16/16 (100%) | SMD, DFN-8(2.8x3) |
| 输出电压 | `output_voltage` | — | *(no rule)* | 8/16 (50%) | 0.8V~5.5V, 0.6V~5V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 转换效率 | 16/16 (100%) | 转换效率, 91% |
| 转换类型 | 16/16 (100%) | 转换类型, DC-DC |
| 输入电压(DC) | 8/16 (50%) | 4.5V~17V, 4.5V~16V |
| 输出电流(最大值) | 8/16 (50%) | 3A, 1A |
| 输出路数 | 8/16 (50%) | 1 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `topology` | Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant) | 10 | identity |
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `control_mode` | Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current) | 9 | identity |
| `iout_max` | Maximum Output Current / Switch Current Limit | 9 | threshold (gte) |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `vout_range` | Output Voltage Range (Min–Max Achievable) | 8 | threshold (range_superset) |
| `fsw` | Switching Frequency (fsw) | 8 | identity |
| `compensation_type` | Compensation Type (Internal / External Type-II / Type-III / No-Comp) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min) | 7 | threshold (lte) |
| `ton_min` | Minimum On-Time / Off-Time (ton_min, toff_min) | 7 | threshold (lte) |
| `gate_drive_current` | Gate Drive Voltage / Current (Controller-Only) | 7 | threshold (gte) |
| `enable_uvlo` | Enable / UVLO Pin (Active High / Active Low / Threshold) | 7 | identity_flag |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `soft_start` | Soft-Start (Internal Fixed / External Css / Absent) | 6 | identity_flag |
| `ocp_mode` | Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown Threshold | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

## 3PEAK

**394 products** across 9 families

### C4 — Op-Amps / Comparators / Instrumentation Amplifiers (176 products, sampled 100)

**Coverage**: 5 of 24 rules covered (21%) | 18 raw params mapped | 27 unmapped | 19 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| CH | `channels` | 10 | identity | 100/100 (100%) | 1, 2 |
| Package | `package_case` | 10 | identity | 100/100 (100%) | SOT353,SOT23-5, SOP8,MSOP8 |
| GBWP(MHz) | `gain_bandwidth` | 8 | threshold (gte) | 54/100 (54%) | 1.6, 20 |
| GBWP(MHz)(Typ.) | `gain_bandwidth` | 8 | threshold (gte) | 5/100 (5%) | 0.009, 0.1 |
| BW(MHz) | `gain_bandwidth` | 8 | threshold (gte) | 4/100 (4%) | 250 |
| Slew Rate(V/μs) | `slew_rate` | 7 | threshold (gte) | 90/100 (90%) | 4.5, 0.7 |
| Slew Rate(V/μs)(Typ.) | `slew_rate` | 7 | threshold (gte) | 5/100 (5%) | 0.003, 0.02 |
| CMRR(dB) | `cmrr` | 5 | threshold (gte) | 9/100 (9%) | 130, 127 |
| IBIAS(pA) | `ibias` | — | *(no rule)* | 95/100 (95%) | 1, 10 |
| VDD(V) | `_supply_voltage` | — | *(no rule)* | 90/100 (90%) | 2.5~6.0, 2.5~5.5 |
| VOS TC(µV/°C) | `vos_drift` | — | *(no rule)* | 82/100 (82%) | 0.5, 1 |
| Rail-Rail | `rail_to_rail` | — | *(no rule)* | 57/100 (57%) | In/Out |
| VOS(max)(mV) | `vos` | — | *(no rule)* | 42/100 (42%) | 1, 3 |
| IQ(Typ.)(per CH)(μA) | `supply_current` | — | *(no rule)* | 32/100 (32%) | 600, 100 |
| VOS(max)(μV) | `vos` | — | *(no rule)* | 9/100 (9%) | 10, 5 |
| IQ(Typ.)(per CH) | `supply_current` | — | *(no rule)* | 5/100 (5%) | 600 nA, 300 nA |
| IQ(Max.)(per CH) | `supply_current` | — | *(no rule)* | 5/100 (5%) | 800 nA, 500 nA |
| VOS TC(μV/℃)(Typ.) | `vos_drift` | — | *(no rule)* | 5/100 (5%) | 0.01 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 93/100 (93%) | Production, Preview |
| VOS(max) | 44/100 (44%) | 1.5, 3 |
| eN@1kHz ( nV/√Hz ) | 38/100 (38%) | 38, 10 |
| GBWP | 37/100 (37%) | 18 kHz, 6 MHz |
| eN@1kHz( nV/√Hz ) | 37/100 (37%) | 170, 19 |
| IQ(Max.)(per CH)(μA) | 32/100 (32%) | 900, 160 |
| IOUT(mA) | 20/100 (20%) | 130, 100 |
| IQ(Typ.)(per CH)(mA) | 16/100 (16%) | 0.19, 3.5 |
| VN@0.1Hz to 10Hz(μVPP) | 16/100 (16%) | 3.2, 2 |
| eN@1kHz(nV/√Hz) | 16/100 (16%) | 13, 7.3 |
| VOS TC (µV/°C) | 9/100 (9%) | 0.008, 0.006 |
| VDD  (V) | 5/100 (5%) | 1.8~6.0 |
| Slew Rate | 5/100 (5%) | 10 mV/μs, 6 mV/μs |
| Supply Voltage(V)(Min) | 5/100 (5%) | 1.7, 2.7 |
| Supply Voltage(V)(Max) | 5/100 (5%) | 3.6, 5.5 |
| Iq per Channel(μA)(Max) | 5/100 (5%) | 0.79, 15 |
| Rail-Rail In | 5/100 (5%) | Yes |
| Rail-Rail Out | 5/100 (5%) | Yes |
| Sink/Source Current(mA)(Typ.) | 5/100 (5%) | 25, 60 |
| VOS(mV)(Max) | 5/100 (5%) | 0.02, 0.0075 |
| IB(pA)(Typ.) | 5/100 (5%) | 20, 50 |
| eN@1kHz(nV/√Hz)(Typ.) | 5/100 (5%) | 320, 100 |
| Open Loop Gain(dB)(Typ.) | 5/100 (5%) | 125, 150 |
| Topology | 4/100 (4%) | VFA |
| IQ(Typ.)(1 Channel)(mA) | 4/100 (4%) | 6.5 |
| Gmin(V/V) | 4/100 (4%) | 1 |
| eN@1MHz ( nV/√Hz ) | 4/100 (4%) | 6.3 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `device_type` | Device Type (Op-Amp / Comparator / Instrumentation Amplifier) | 10 | identity |
| `input_type` | Input Stage Technology (CMOS / JFET / Bipolar) | 9 | identity_upgrade |
| `vicm_range` | Input Common-Mode Voltage Range (VICM) | 9 | threshold (range_superset) |
| `output_type` | Output Type (Push-Pull / Open-Drain / Open-Collector) | 8 | identity |
| `rail_to_rail_input` | Rail-to-Rail Input (RRI) | 8 | identity_flag |
| `rail_to_rail_output` | Rail-to-Rail Output (RRO) | 8 | identity_flag |
| `supply_voltage` | Supply Voltage Range (Single/Dual) | 8 | threshold (range_superset) |
| `min_stable_gain` | Minimum Stable Gain (V/V) | 8 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `input_offset_voltage` | Input Offset Voltage Vos (Max) | 7 | threshold (lte) |
| `input_bias_current` | Input Bias Current Ib (Max) | 7 | threshold (lte) |
| `response_time` | Response Time / Propagation Delay (Comparator) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `input_noise_voltage` | Input Noise Voltage Density en (nV/√Hz) | 6 | threshold (lte) |
| `output_current` | Output Current Drive (Short-Circuit) | 6 | threshold (gte) |
| `avol` | Open-Loop Voltage Gain Avol (dB) | 5 | threshold (gte) |
| `psrr` | Power Supply Rejection Ratio PSRR (dB) | 5 | threshold (gte) |
| `iq` | Quiescent Current per Channel (Iq) | 5 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C7 — Interface ICs (RS-485, CAN, I2C, USB) (72 products, sampled 72)

**Coverage**: 1 of 22 rules covered (5%) | 1 raw params mapped | 28 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 5 | application_review | 72/72 (100%) | WSOP16,WSOP8,SOP8, WSOP16,SOP16,QSOP16 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 65/72 (90%) | Production, Preview |
| Max Data Rate(Mbps) | 48/72 (67%) | 150, 0.5 |
| IEC-61000-4-2 Contact(kV) | 39/72 (54%) | 15, 8 |
| Surge Voltage Capability(Vpk) | 33/72 (46%) | 10000 |
| CMTI(kV/μs)(Static) | 33/72 (46%) | 200 |
| CMTI(kV/μs)(Dynamic) | 33/72 (46%) | 150 |
| Isolation Rating(Vrms) | 31/72 (43%) | 5000 |
| Nubmer of Channel | 25/72 (35%) | 1, 2 |
| Forward/Reverse Channels | 25/72 (35%) | 1/0, 2/0 |
| Default Output | 25/72 (35%) | High/Low |
| Drivers Per Package | 20/72 (28%) | 0, 1 |
| Receivers Per Package | 20/72 (28%) | 4, 1 |
| VCC (Min)(V) | 20/72 (28%) | 3 |
| VCC(Max)(V) | 20/72 (28%) | 3.6, 5.5 |
| Data Rate (Max)(kBPS) | 20/72 (28%) | 400000, 100000 |
| ICC(Max)(mA) | 20/72 (28%) | 20, 24 |
| ESD HBM(kV) | 20/72 (28%) | 8, 18 |
| Operating Temperature Range(℃) | 20/72 (28%) | -40 to +85, -40 to +125 |
| Feature | 19/72 (26%) | LDO, Sleep, Sleep |
| Protocol | 19/72 (26%) | LIN, CAN, CAN FD |
| Bus Fault Protection Voltage | 17/72 (24%) | 42V, -42V to +42V |
| VCC(V) | 15/72 (21%) | 4.5~5.5 |
| Mode | 4/72 (6%) | Half/Full Duplex |
| VBAT(V) | 4/72 (6%) | 5.5~40 |
| Max Data Rate(Kbps) | 4/72 (6%) | 20 |
| Bus Fault Protection Voltage(V) | 4/72 (6%) | -45 to +45 |
| Isolation Rating(V rms) | 2/72 (3%) | 3750 |
| Clock Direction | 2/72 (3%) | Bidirection, Single Direction |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `protocol` | Protocol / Interface Standard | 10 | identity |
| `operating_mode` | Operating Mode / Driver Topology | 9 | identity |
| `data_rate` | Data Rate / Speed Grade | 9 | threshold (gte) |
| `de_polarity` | Driver Enable / Direction Control Polarity | 8 | identity |
| `isolation_type` | Galvanic Isolation Type | 8 | identity_flag |
| `can_variant` | CAN Standard Variant / USB Speed Grade | 8 | identity_flag |
| `bus_fault_protection` | Bus Fault Protection Voltage | 8 | threshold (gte) |
| `txd_dominant_timeout` | TXD Dominant Timeout / Bus Watchdog | 7 | identity_flag |
| `isolation_working_voltage` | Isolation Working Voltage (VIORM) | 7 | threshold (gte) |
| `esd_bus_pins` | ESD Rating — Bus Pins | 7 | threshold (gte) |
| `receiver_threshold_cm` | Input Receiver Threshold & Common-Mode Range | 7 | threshold (range_superset) |
| `supply_voltage` | Supply Voltage Range | 7 | threshold (range_superset) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `failsafe_receiver` | Failsafe Receiver Behavior | 6 | identity_flag |
| `vod_differential` | Differential Output Voltage (VOD) | 6 | threshold (gte) |
| `propagation_delay` | Propagation Delay / Loop Delay | 6 | threshold (lte) |
| `common_mode_range` | Common-Mode Operating Range | 6 | threshold (range_superset) |
| `slew_rate_class` | Slew Rate Limiting | 6 | application_review |
| `unit_loads` | Unit Loads / Bus Loading | 5 | threshold (lte) |
| `standby_current` | Shutdown / Low-Power Standby Current | 5 | threshold (lte) |
| `aec_q100` | AEC-Q100 / Automotive Qualification | 4 | identity_flag |

---

### C1 — Linear Voltage Regulators (LDOs) (40 products, sampled 40)

**Coverage**: 1 of 22 rules covered (5%) | 1 raw params mapped | 10 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 40/40 (100%) | DFN3X3-8,SOT223-3,EMSOP8, SOT23-3,SOT23-5,SOT89-3 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Input Voltage(V) | 40/40 (100%) | 3.0~42, 3.6~24 |
| Accuracy(max) | 40/40 (100%) | ±2.5%, ±2% |
| Maximum Output Current(mA) | 40/40 (100%) | 300, 180 |
| Temperature Range (°C) | 40/40 (100%) | -40 to +150, -40 to +125 |
| Status | 38/40 (95%) | Preview, Production |
| PSRR(dB) | 36/40 (90%) | 70, 73 |
| Noise(μVRMS) | 36/40 (90%) | 80, 70 |
| Iq(mA) | 35/40 (88%) | 0.002, 0.055 |
| Dropout(mV) | 22/40 (55%) | 250, 150 |
| Dropput(mV) | 14/40 (35%) | 400, 800 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `output_type` | Output Type (Fixed / Adjustable / Tracking / Negative) | 10 | identity |
| `output_voltage` | Output Voltage Vout | 10 | identity |
| `polarity` | Polarity (Positive / Negative) | 10 | identity |
| `iout_max` | Maximum Output Current (Iout Max) | 9 | threshold (gte) |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `output_cap_compatibility` | Output Capacitor ESR Compatibility (Ceramic Stable) | 8 | identity_flag |
| `enable_pin` | Enable Pin (Active High / Active Low / Absent) | 8 | identity |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min / Dropout) | 7 | threshold (lte) |
| `vdropout` | Dropout Voltage (Vdropout Max) | 7 | threshold (lte) |
| `vout_accuracy` | Output Voltage Accuracy (Initial Tolerance) | 7 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `psrr` | PSRR (Power Supply Rejection Ratio) | 6 | application_review |
| `power_good` | Power-Good / Flag Pin | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown | 6 | identity_flag |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `iq` | Quiescent Current (Iq / Ground Current) | 5 | threshold (lte) |
| `load_regulation` | Load Regulation (ΔVout / ΔIout) | 5 | threshold (lte) |
| `soft_start` | Soft-Start | 5 | identity_flag |
| `line_regulation` | Line Regulation (ΔVout / ΔVin) | 4 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C2 — Switching Regulators (DC-DC Converters & Controllers) (34 products, sampled 34)

**Coverage**: 1 of 22 rules covered (5%) | 1 raw params mapped | 6 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 34/34 (100%) | ESOP8,DFN4X4-8,DFN3X3-8, ESOP8 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Temperature Range(℃) | 34/34 (100%) | -40 to +125 |
| VIN(V) | 34/34 (100%) | 4.5~100, 4.5~60 |
| Output(V) | 34/34 (100%) | 1.225~100, 0.8~60 |
| Max Output Current(A) | 34/34 (100%) | 1, 3.5 |
| Status | 31/34 (91%) | Preview, Production |
| Control Mode | 26/34 (76%) | Constant On-time, Peak Current Mode |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `topology` | Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant) | 10 | identity |
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `control_mode` | Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current) | 9 | identity |
| `iout_max` | Maximum Output Current / Switch Current Limit | 9 | threshold (gte) |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `vout_range` | Output Voltage Range (Min–Max Achievable) | 8 | threshold (range_superset) |
| `fsw` | Switching Frequency (fsw) | 8 | identity |
| `compensation_type` | Compensation Type (Internal / External Type-II / Type-III / No-Comp) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min) | 7 | threshold (lte) |
| `ton_min` | Minimum On-Time / Off-Time (ton_min, toff_min) | 7 | threshold (lte) |
| `gate_drive_current` | Gate Drive Voltage / Current (Controller-Only) | 7 | threshold (gte) |
| `enable_uvlo` | Enable / UVLO Pin (Active High / Active Low / Threshold) | 7 | identity_flag |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `soft_start` | Soft-Start (Internal Fixed / External Css / Absent) | 6 | identity_flag |
| `ocp_mode` | Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown Threshold | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C3 — Gate Drivers (MOSFET / IGBT / SiC / GaN) (20 products, sampled 20)

**Coverage**: 2 of 20 rules covered (10%) | 10 raw params mapped | 4 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 20/20 (100%) | WSOP6, WSOP8 |
| Propagation Delay(ns) | `propagation_delay` | 7 | threshold (lte) | 20/20 (100%) | 70, 2 |
| # of Channel | `channels` | — | *(no rule)* | 20/20 (100%) | 1, 2 |
| Junction Temperature Range(℃) | `operating_temp` | — | *(no rule)* | 20/20 (100%) | -40 to +150 |
| VIN(V) | `_vin` | — | *(no rule)* | 15/20 (75%) | 4.75~5.25, 4.5~25 |
| Max Output Current(A) | `output_peak_current` | — | *(no rule)* | 15/20 (75%) | 7, 5 |
| Input Voltage Range(V) | `_vin_range` | — | *(no rule)* | 15/20 (75%) | 0~5, -5~20 |
| Rise/Fall Time(ns) | `_rise_fall_time` | — | *(no rule)* | 15/20 (75%) | 0.45/0.45, 7/6 |
| Delay Matching(ns) | `delay_matching` | — | *(no rule)* | 11/20 (55%) | 0.05, <1 |
| Peak Output Current(A) | `output_peak_current` | — | *(no rule)* | 5/20 (25%) | 5/5 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 17/20 (85%) | Preview, Production |
| Isolation Rating(Vrms) | 5/20 (25%) | 5700 |
| Output Voltage Max(V) | 5/20 (25%) | 40 |
| Output Voltage Min(V) | 5/20 (25%) | 14 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `driver_configuration` | Driver Configuration (Single / Dual / Half-Bridge / Full-Bridge) | 10 | identity |
| `isolation_type` | Isolation Type (Non-Isolated Bootstrap / Transformer / Optocoupler / Digital Isolator) | 10 | identity |
| `output_polarity` | Output Polarity (Non-Inverting / Inverting) | 9 | identity_flag |
| `input_logic_threshold` | Input Logic Threshold (VDD-referenced / 3.3V / 5V / Differential) | 8 | identity |
| `peak_source_current` | Peak Source Current (Ipeak+, Turn-On) | 8 | threshold (gte) |
| `peak_sink_current` | Peak Sink Current (Ipeak-, Turn-Off) | 8 | threshold (gte) |
| `vdd_range` | Gate Drive Supply VDD Range | 8 | threshold (range_superset) |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `dead_time_control` | Dead-Time Control (Internal Fixed / Adjustable Rdt / External / None) | 7 | identity_flag |
| `dead_time` | Dead-Time Duration | 7 | threshold (gte) |
| `uvlo` | Under-Voltage Lockout Threshold (UVLO) | 7 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `rise_fall_time` | Rise / Fall Time tr/tf (Output Transition into Load Capacitance) | 6 | threshold (lte) |
| `shutdown_enable` | Shutdown / Enable Pin (Active High / Active Low / Absent) | 6 | identity_flag |
| `bootstrap_diode` | Bootstrap Diode (Internal / External Required) | 6 | identity_flag |
| `rth_ja` | Thermal Resistance Rθja (Junction-to-Ambient) | 6 | threshold (lte) |
| `fault_reporting` | Fault Reporting / FAULT Pin (Present / Absent) | 5 | identity_flag |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C5 — Logic ICs — 74-Series Standard Logic (15 products, sampled 15)

**Coverage**: 1 of 23 rules covered (4%) | 1 raw params mapped | 15 unmapped | 22 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 15/15 (100%) | SOP16,TSSOP16,QFN3X3-16, SOP16,QFN3X3-16 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 15/15 (100%) | Production |
| CH | 15/15 (100%) | 1, 2 |
| Switch Config | 15/15 (100%) | 8:01, 4:01 |
| VDD(V) | 15/15 (100%) | 3~12, 3~16 |
| Input Range | 15/15 (100%) | VEE to VDD, 0V to VDD |
| BW(MHz) | 15/15 (100%) | 200, 100 |
| IQ(Typ.)(1 Channel)(μA) | 15/15 (100%) | 8, 1 |
| Ron(Ω) | 15/15 (100%) | 120, 10 |
| Leakage Current(nA) | 15/15 (100%) | 100, 10 |
| VIH(Min)(V) | 15/15 (100%) | 2, 1.5 |
| VIL(Max)(V) | 15/15 (100%) | 0.8, 0.5 |
| tON(ns) | 15/15 (100%) | 60, 320 |
| tOFF(ns) | 15/15 (100%) | 50, 130 |
| Latch up(mA) | 15/15 (100%) | 150, 600 |
| VEE(V) | 4/15 (27%) | -6~0, -8~0 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `logic_function` | Logic Function (Part Number Suffix) | 10 | identity |
| `gate_count` | Number of Gates / Sections / Bits | 10 | identity |
| `oe_polarity` | 3-State Output Enable (OE) Polarity | 9 | identity_flag |
| `output_type` | Output Type (Totem-pole / Open-drain / 3-state) | 8 | identity_flag |
| `supply_voltage` | Supply Voltage Range (Vcc) | 8 | threshold (range_superset) |
| `aec_q100` | AEC-Q100 Automotive Qualification | 8 | identity_flag |
| `voh` | Output High Voltage (VOH) | 7 | threshold (gte) |
| `drive_current` | Output Drive Current (IOH / IOL) | 7 | threshold (gte) |
| `schmitt_trigger` | Schmitt Trigger Input | 7 | identity_flag |
| `vih` | Input High Threshold (VIH) | 7 | threshold (lte) |
| `logic_family` | Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | 7 | application_review |
| `tpd` | Propagation Delay (tpd) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `vol` | Output Low Voltage (VOL) | 6 | threshold (lte) |
| `vil` | Input Low Threshold (VIL) | 6 | threshold (gte) |
| `fmax` | Maximum Operating Frequency (fmax) | 6 | threshold (gte) |
| `setup_hold_time` | Setup Time / Hold Time (tsu / th) | 6 | application_review |
| `bus_hold` | Bus Hold / Weak Pull-up | 5 | identity_flag |
| `input_clamp_diodes` | Input Clamp Diodes | 4 | identity_flag |
| `input_leakage` | Input Leakage Current (IIH / IIL) | 4 | threshold (lte) |
| `transition_time` | Output Transition Time (tr / tf) | 4 | application_review |
| `packaging` | Packaging Format (Tape & Reel / Tube / Tray) | 1 | operational |

---

### C9 — ADCs — Analog-to-Digital Converters (14 products, sampled 14)

**Coverage**: 1 of 20 rules covered (5%) | 2 raw params mapped | 33 unmapped | 19 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 5 | application_review | 14/14 (100%) | WSOP8, LQFP10X10-64 |
| VDD(V) | `supply_voltage` | — | *(no rule)* | 2/14 (14%) | 2.7~5.5 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Resolution'’ | 10/14 (71%) | 16, 12 |
| VDD(V)" | 10/14 (71%) | 4.75~5.25, 2.7~5.5 |
| CH'' | 10/14 (71%) | 8, 4 |
| INL(LSB,Max) | 10/14 (71%) | ±2, ±1.5 |
| Offset Error(LSB, Max) | 10/14 (71%) | ±15, ±4 |
| Gain Error(LSB) | 10/14 (71%) | ±15, ±2 |
| Voltage Input Range(V) | 10/14 (71%) | ±5, ±10, 0.~2.5, 0~5 |
| IDD(mA) | 10/14 (71%) | 52, 1.65 |
| Temperature Range(℃) | 10/14 (71%) | -40 to +125 |
| Speed(Msps) | 10/14 (71%) | 0.35, 0.2 |
| DNL(LSB,Max) | 9/14 (64%) | ±1, (-1, 1.5) |
| Status | 8/14 (57%) | Preview, Production |
| Clock Source | 2/14 (14%) | External, Internal |
| Input Voltage Range | 2/14 (14%) | 250mV |
| Insulation Rating(Vrms) | 2/14 (14%) | 5000 |
| Output | 2/14 (14%) | Differential |
| Interface | 2/14 (14%) | Parallel, SPI |
| SINAD(dB) | 1/14 (7%) | 56.5 |
| Resolution | 1/14 (7%) | 10 |
| Update Rate(MSPS) | 1/14 (7%) | 50 |
| CH | 1/14 (7%) | 1 |
| VIN(V) | 1/14 (7%) | 0~2 |
| Datum | 1/14 (7%) | Internal |
| DNL(LSB) | 1/14 (7%) | 0.3 |
| Power(mW) | 1/14 (7%) | 84 |
| ADC Channel | 1/14 (7%) | 8 |
| ADC Resolution | 1/14 (7%) | 12bit |
| DAC Channel | 1/14 (7%) | 8 |
| DAC Resolution | 1/14 (7%) | 12bit |
| GPIO Number | 1/14 (7%) | 8 |
| VREF | 1/14 (7%) | Internal/External |
| Temperature Sensor | 1/14 (7%) | Internal |
| VDDIO(V) | 1/14 (7%) | 1.8~5.5 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `architecture` | ADC Architecture | 10 | identity |
| `resolution_bits` | Resolution (bits) | 10 | identity |
| `interface_type` | Interface Type | 9 | identity |
| `input_configuration` | Input Configuration | 9 | identity |
| `simultaneous_sampling` | Simultaneous Sampling | 9 | identity_flag |
| `channel_count` | Number of Channels | 8 | threshold (gte) |
| `sample_rate_sps` | Sample Rate (SPS) | 8 | threshold (gte) |
| `enob` | Effective Number of Bits (ENOB) | 7 | threshold (gte) |
| `inl_lsb` | Integral Non-Linearity (LSB) | 7 | threshold (lte) |
| `reference_type` | Reference Type | 7 | identity_flag |
| `input_voltage_range` | Full-Scale Input Range (V) | 7 | threshold (range_superset) |
| `supply_voltage_range` | Supply Voltage Range (V) | 7 | threshold (range_superset) |
| `operating_temp_range` | Operating Temperature Range (°C) | 7 | threshold (range_superset) |
| `dnl_lsb` | Differential Non-Linearity (LSB) | 6 | threshold (lte) |
| `thd_db` | Total Harmonic Distortion (dBc) | 6 | threshold (lte) |
| `conversion_latency_cycles` | Conversion Latency (cycles) | 6 | threshold (lte) |
| `reference_voltage` | Internal Reference Voltage (V) | 5 | application_review |
| `power_consumption_mw` | Power Consumption (mW) | 5 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 4 | identity_flag |

---

### C6 — Voltage References (12 products, sampled 12)

**Coverage**: 1 of 19 rules covered (5%) | 1 raw params mapped | 17 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 5 | application_review | 12/12 (100%) | SOP8, SOT23-G |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 9/12 (75%) | Production |
| Output Capacitor Load(μF) | 7/12 (58%) | 0.1 to 100, 0.1 to 10 |
| Output Voltage | 7/12 (58%) | Adjustable(VREF to 36V), Fixed(2.048, 2.5, 3.0, 4.096, 5.0, 8.192, 10.0) |
| Isink(min)(mA) | 7/12 (58%) | 0.6, 1 |
| Isink(max)(mA) | 7/12 (58%) | 80, 15 |
| Accuracy | 7/12 (58%) | 0.5%, 0.1% |
| TC(ppm/℃) | 7/12 (58%) | 50, 25 |
| Vin(min)(V) | 5/12 (42%) | max(Ver+0.2, 3), max(Ver+0.05, 2.1) |
| Vin(max)(V) | 5/12 (42%) | 15, 5.5 |
| Iq(max)(μA) | 5/12 (42%) | 1700, 180 |
| Accuracy(max) | 5/12 (42%) | 0.05%, 0.15% |
| TC(-40 to 85℃)(ppm/℃) | 5/12 (42%) | 5, 20 |
| TC(-40 to 125℃)(ppm/℃) | 5/12 (42%) | 3, 30 |
| 0.1 to 10Hz Output Voltage Noise(uVpp) | 5/12 (42%) | 2.5, 50 |
| Line Regulation(max)(ppm/V) | 5/12 (42%) | 5, 50 |
| Load Regulation(max)(ppm/mA) | 5/12 (42%) | 20 |
| 10 to 10kHz Voltage Noise(μVrms) | 2/12 (17%) | 90 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `configuration` | Configuration (Series / Shunt) | 10 | identity |
| `output_voltage` | Output Voltage (Vout) | 10 | identity |
| `adjustability` | Output Voltage Adjustability (Fixed / Adjustable / Trimmable) | 8 | identity |
| `enable_shutdown_polarity` | Enable/Shutdown Pin Polarity | 8 | identity |
| `initial_accuracy` | Initial Accuracy (%) | 8 | threshold (lte) |
| `tc` | Temperature Coefficient (ppm/°C) | 8 | threshold (lte) |
| `architecture` | Reference Architecture (Band-gap / Buried Zener / XFET) | 7 | identity |
| `tc_accuracy_grade` | TC/Accuracy Grade (Suffix) | 7 | identity_flag |
| `dropout_voltage` | Dropout Voltage | 7 | threshold (lte) |
| `input_voltage_range` | Input Voltage Range | 7 | threshold (range_superset) |
| `output_noise` | Output Voltage Noise (0.1–10 Hz µVrms) | 6 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 6 | threshold (range_superset) |
| `quiescent_current` | Quiescent Current (Iq) | 5 | threshold (lte) |
| `output_current` | Output Current / Load Current Capability | 5 | threshold (gte) |
| `long_term_stability` | Long-Term Stability (ppm/1000h) | 4 | threshold (lte) |
| `nr_pin` | Output Noise Filtering (NR Pin) | 4 | application_review |
| `aec_q100` | AEC-Q100 Automotive Qualification | 3 | identity_flag |
| `packaging` | Packaging Format (Tape & Reel / Cut Tape / Bulk) | 1 | operational |

---

### C10 — DACs — Digital-to-Analog Converters (11 products, sampled 11)

**Coverage**: 5 of 22 rules covered (23%) | 13 raw params mapped | 9 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Resolution | `resolution_bits` | 10 | identity | 10/11 (91%) | 16, 12 |
| CH | `channel_count` | 7 | threshold (gte) | 10/11 (91%) | 1, 4 |
| INL | `inl_lsb` | 7 | threshold (lte) | 10/11 (91%) | ±1, ±2 |
| DNL(LSB, Max) | `dnl_lsb` | 7 | threshold (lte) | 10/11 (91%) | ±1 |
| DNL(LSB) | `dnl_lsb` | 7 | threshold (lte) | 1/11 (9%) | 0.25 |
| Package | `package_case` | 5 | application_review | 11/11 (100%) | SOP14, SOP8 |
| VDD(V) | `_supply_voltage` | — | *(no rule)* | 10/11 (91%) | 2.7~5.5 |
| Offset Error(mV, Max) | `_offset_error` | — | *(no rule)* | 10/11 (91%) | ±0.17, ±30 |
| IDD(μA/CH, Max)(μA) | `_supply_current` | — | *(no rule)* | 10/11 (91%) | 150, 80 |
| Gain Error (% of FSR, Max) | `_gain_error` | — | *(no rule)* | 10/11 (91%) | ±0.011, ±0.3 |
| Voltage Output Range(V) | `_output_range` | — | *(no rule)* | 10/11 (91%) | 0~Vref |
| D to A Glitch Impulse(nV-sec) | `_glitch_impulse` | — | *(no rule)* | 10/11 (91%) | 10, 2 |
| Temp Range(℃) | `operating_temp` | — | *(no rule)* | 10/11 (91%) | -40 to +105, -40 to +125 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 10/11 (91%) | Production |
| INL(LSB) | 1/11 (9%) | 0.5 |
| Resolution' | 1/11 (9%) | 10 |
| Update Rate(MSPS) | 1/11 (9%) | 125 |
| CH' | 1/11 (9%) | 1 |
| Datum | 1/11 (9%) | Internal, 1.10V |
| SFDR(dB) | 1/11 (9%) | 79 |
| VDD(V)' | 1/11 (9%) | 2.7~5.5 |
| Power(mW) | 1/11 (9%) | 175 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `output_type` | Output Type | 10 | identity |
| `interface_type` | Interface Type | 9 | identity |
| `output_buffered` | Output Buffered | 8 | identity_flag |
| `power_on_reset_state` | Power-On Reset State | 8 | identity_flag |
| `output_voltage_range` | Output Voltage Range (V) | 8 | threshold (range_superset) |
| `architecture` | DAC Architecture | 7 | identity_flag |
| `update_rate_sps` | Update Rate (SPS) | 7 | threshold (gte) |
| `glitch_energy_nVs` | Glitch Energy (nVs) | 7 | threshold (lte) |
| `settling_time_us` | Settling Time (µs) | 7 | threshold (lte) |
| `reference_type` | Reference Type | 7 | identity_flag |
| `supply_voltage_range` | Supply Voltage Range (V) | 7 | threshold (range_superset) |
| `operating_temp_range` | Operating Temperature Range (°C) | 7 | threshold (range_superset) |
| `output_noise_density_nvhz` | Output Noise Density (nV/√Hz) | 6 | threshold (lte) |
| `output_current_source_ma` | Output Source Current (mA) | 6 | threshold (gte) |
| `reference_voltage` | Internal Reference Voltage (V) | 5 | application_review |
| `power_consumption_mw` | Power Consumption (mW) | 5 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 4 | identity_flag |

---

## TECH PUBLIC

**370 products** across 8 families

### B4 — TVS Diodes — Transient Voltage Suppressors (283 products, sampled 100)

**Coverage**: 10 of 23 rules covered (43%) | 12 raw params mapped | 1 unmapped | 13 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | DFN-10(1x2.5), DFN2510-10 |
| 极性 | `polarity` | 10 | identity | 93/100 (93%) | 单向, 双向 |
| 反向断态电压 | `vrwm` | 10 | identity | 81/100 (81%) | 5V, 3.3V |
| 通道数 | `num_channels` | 10 | identity | 81/100 (81%) | 4, 1 |
| 电源电压 | `vrwm` | 10 | identity | 41/100 (41%) | 7V, 5V |
| 击穿电压 V(BR)-min | `vbr` | 9 | identity | 86/100 (86%) | 6.8V, 5V |
| 功率-峰值脉冲 | `ppk` | 9 | threshold (gte) | 61/100 (61%) | 80W, 150W |
| 峰值脉冲电流(Ipp) | `ipp` | 8 | threshold (gte) | 90/100 (90%) | 4.5A, 7A |
| 结电容 | `cj` | 8 | threshold (lte) | 48/100 (48%) | 0.8pF, 14pF |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 85/100 (85%) | -55℃~+125℃, -55℃~+125℃(TJ) |
| 反向漏电流 IR | `ir_leakage` | 5 | threshold (lte) | 19/100 (19%) | 0.08μA, 0.06μA |
| 击穿电压Max | `_vbr_max` | — | *(no rule)* | 17/100 (17%) | 8.4V, 17V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 最大工作电压 | 37/100 (37%) | 12V, 5V |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `vc` | Clamping Voltage (Vc) | 10 | threshold (lte) |
| `configuration` | Configuration / Topology | 10 | identity |
| `pin_configuration` | Pin Configuration / Pinout | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `surge_standard` | Surge Standard Compliance (IEC 61000-4-5 / ISO 7637) | 8 | identity_flag |
| `esd_rating` | ESD Rating (IEC 61000-4-2) | 7 | threshold (gte) |
| `response_time` | Response Time | 6 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rθja) | 5 | threshold (lte) |
| `pd` | Steady-State Power Dissipation (Pd) | 5 | threshold (gte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B5 — MOSFETs — N-Channel & P-Channel (44 products, sampled 44)

**Coverage**: 10 of 27 rules covered (37%) | 14 raw params mapped | 4 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 42/44 (95%) | SOT-23, SOP8_150MIL |
| 漏源电压(Vdss) | `vds_max` | 10 | threshold (gte) | 35/44 (80%) | 100V, 30V |
| 连续漏极电流 | `id_max` | 10 | threshold (gte) | 35/44 (80%) | 3.5A, 5.8A |
| 极性 | `channel_type` | 10 | identity | 28/44 (64%) | N-沟道, P-沟道 |
| 晶体管类型 | `channel_type` | 10 | identity | 21/44 (48%) | N沟道, P沟道 |
| 击穿电压 | `vds_max` | 10 | threshold (gte) | 9/44 (20%) | 20V,12V, 20V |
| 栅极源极击穿电压 | `vgs_max` | 8 | threshold (gte) | 19/44 (43%) | ±12V, ±8V |
| 充电电量 | `qg` | 8 | threshold (lte) | 4/44 (9%) | 12nC, 0.8nC |
| 反向传输电容Crss | `crss` | 7 | threshold (lte) | 9/44 (20%) | 45pF, 15pF,5pF |
| 功率耗散 | `pd` | 6 | threshold (gte) | 18/44 (41%) | 1.36W, 2W |
| 阈值电压 | `vgs_th` | 6 | application_review | 15/44 (34%) | 0.9V, 1.5V |
| 输入电容 | `ciss` | 6 | threshold (lte) | 14/44 (32%) | 702pF, 405pF |
| 工作温度 | `operating_temp` | — | *(no rule)* | 27/44 (61%) | -55℃~+150℃, +150℃(TJ) |
| 配置 | `_configuration` | — | *(no rule)* | 14/44 (32%) | 单路, 共漏 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 不同 Id，Vgs时的 RdsOn(最大值) | 17/44 (39%) | 210mΩ, 130mΩ |
| 额定功率 | 12/44 (27%) | 1.36W, 1.1W |
| 栅极电荷(Qg) | 10/44 (23%) | 4.8nC, 0.74nC |
| 漏极电流 | 5/44 (11%) | 1A, 1uA |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration (G-D-S Order, Tab Assignment) | 10 | identity |
| `technology` | Technology (Si / SiC / GaN) | 9 | identity_flag |
| `rds_on` | On-State Resistance (Rds(on)) | 9 | threshold (lte) |
| `mounting_style` | Mounting Style | 9 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `body_diode_trr` | Body Diode Reverse Recovery Time (trr) | 8 | threshold (lte) |
| `id_pulse` | Peak Pulsed Drain Current (Id Pulse) | 7 | threshold (gte) |
| `avalanche_energy` | Avalanche Energy (Eas) | 7 | threshold (gte) |
| `qgd` | Gate-Drain Charge / Miller Charge (Qgd) | 7 | threshold (lte) |
| `coss` | Output Capacitance (Coss) | 7 | application_review |
| `rth_jc` | Thermal Resistance Junction-to-Case (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA) Curves | 7 | application_review |
| `qgs` | Gate-Source Charge (Qgs) | 6 | threshold (lte) |
| `body_diode_vf` | Body Diode Forward Voltage (Vf) | 6 | threshold (lte) |
| `rth_ja` | Thermal Resistance Junction-to-Ambient (Rθja) | 5 | application_review |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 2 | operational |

---

### C1 — Linear Voltage Regulators (LDOs) (16 products, sampled 16)

**Coverage**: 4 of 22 rules covered (18%) | 5 raw params mapped | 14 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 16/16 (100%) | SOT23-5, SOT-23 |
| 输出电压 | `output_voltage` | 10 | identity | 14/16 (88%) | 1.8V, 3V |
| 输出类型 | `output_type` | 10 | identity | 7/16 (44%) | 固定 |
| 输出电流 | `iout_max` | 9 | threshold (gte) | 12/16 (75%) | 500mA, 200mA |
| 工作温度 | `operating_temp` | — | *(no rule)* | 11/16 (69%) | -40℃~+85℃, -25℃~+85℃ |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 输入电压 | 12/16 (75%) | 7V, 6V |
| 输出配置 | 7/16 (44%) | Positive |
| 输出电压(最大值) | 5/16 (31%) | 18V, 30V |
| 输入电压(最大值) | 5/16 (31%) | 7V |
| 电源抑制比(PSRR) | 5/16 (31%) | 70dB |
| 静态电流 | 5/16 (31%) | 1μA, 70μA |
| 负荷调节 | 4/16 (25%) | 15mV, 50mV |
| 输出电压(最小值/固定) | 2/16 (13%) | 30V, 18V |
| 类型 | 2/16 (13%) | 线性 |
| 输出端数 | 2/16 (13%) | 1 |
| 输出电压精度 | 1/16 (6%) | ±2% |
| 稳压器数量 | 1/16 (6%) | 1 |
| 正向压降VF Max | 1/16 (6%) | 200mV |
| 供电电压 | 1/16 (6%) | 6V |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `polarity` | Polarity (Positive / Negative) | 10 | identity |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `output_cap_compatibility` | Output Capacitor ESR Compatibility (Ceramic Stable) | 8 | identity_flag |
| `enable_pin` | Enable Pin (Active High / Active Low / Absent) | 8 | identity |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min / Dropout) | 7 | threshold (lte) |
| `vdropout` | Dropout Voltage (Vdropout Max) | 7 | threshold (lte) |
| `vout_accuracy` | Output Voltage Accuracy (Initial Tolerance) | 7 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `psrr` | PSRR (Power Supply Rejection Ratio) | 6 | application_review |
| `power_good` | Power-Good / Flag Pin | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown | 6 | identity_flag |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `iq` | Quiescent Current (Iq / Ground Current) | 5 | threshold (lte) |
| `load_regulation` | Load Regulation (ΔVout / ΔIout) | 5 | threshold (lte) |
| `soft_start` | Soft-Start | 5 | identity_flag |
| `line_regulation` | Line Regulation (ΔVout / ΔVin) | 4 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### B1 — Rectifier Diodes — Standard, Fast, and Ultrafast Recovery (15 products, sampled 15)

**Coverage**: 10 of 23 rules covered (43%) | 12 raw params mapped | 3 unmapped | 13 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 15/15 (100%) | SOD-123, SOD923 |
| 反向耐压VR | `vrrm` | 10 | threshold (gte) | 12/15 (80%) | 40V, 30V |
| 平均整流电流 | `io_avg` | 10 | threshold (gte) | 12/15 (80%) | 1A, 200mA |
| 二极管配置 | `configuration` | 10 | identity | 11/15 (73%) | 单路 |
| 反向峰值电压(最大值) | `vrrm` | 10 | threshold (gte) | 2/15 (13%) | 40V, 100V |
| 正向压降VF | `vf` | 8 | threshold (lte) | 10/15 (67%) | 600mV, 400mV |
| 正向压降VF Max | `vf` | 8 | threshold (lte) | 10/15 (67%) | 400mV, 1V |
| 反向恢复时间(trr) | `trr` | 8 | threshold (lte) | 3/15 (20%) | 4ns |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 11/15 (73%) | -50℃~+150℃(TJ), +125℃(TJ) |
| Ifsm - 正向浪涌峰值电流 | `ifsm` | 7 | threshold (gte) | 6/15 (40%) | 500mA, 750mA |
| 反向漏电流IR | `ir_leakage` | 5 | threshold (lte) | 12/15 (80%) | 1mA, 10µA |
| 结电容 | `cj` | 4 | application_review | 1/15 (7%) | 8pF |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 二极管类型 | 4/15 (27%) | Schottky, Single |
| 总电容C | 3/15 (20%) | 120pF, 8pF |
| 工作温度-结 | 1/15 (7%) | -55°C~125°C |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `recovery_category` | Recovery Category | 10 | identity_upgrade |
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vdc` | Max DC Blocking Voltage (Vdc) | 8 | threshold (gte) |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `qrr` | Reverse Recovery Charge (Qrr) | 7 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 7 | threshold (gte) |
| `recovery_behavior` | Recovery Behavior (Soft vs. Snappy) | 6 | application_review |
| `rth_jc` | Thermal Resistance, Junction-to-Case (Rtheta_jc) | 6 | threshold (lte) |
| `pd` | Power Dissipation (Pd) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### C5 — Logic ICs — 74-Series Standard Logic (4 products, sampled 4)

**Coverage**: 2 of 23 rules covered (9%) | 2 raw params mapped | 3 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 4/4 (100%) | SOT23-5, MSOP10_3.1X3.1MM |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 1/4 (25%) | -40℃~+85℃ |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 开关时间(Ton,Tof)(最大值) | 1/4 (25%) | 50ns |
| 电源电压，双(V±) | 1/4 (25%) | ±6V |
| 电源电压 | 1/4 (25%) | 1.65V~5.5V |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `logic_function` | Logic Function (Part Number Suffix) | 10 | identity |
| `gate_count` | Number of Gates / Sections / Bits | 10 | identity |
| `oe_polarity` | 3-State Output Enable (OE) Polarity | 9 | identity_flag |
| `output_type` | Output Type (Totem-pole / Open-drain / 3-state) | 8 | identity_flag |
| `supply_voltage` | Supply Voltage Range (Vcc) | 8 | threshold (range_superset) |
| `aec_q100` | AEC-Q100 Automotive Qualification | 8 | identity_flag |
| `voh` | Output High Voltage (VOH) | 7 | threshold (gte) |
| `drive_current` | Output Drive Current (IOH / IOL) | 7 | threshold (gte) |
| `schmitt_trigger` | Schmitt Trigger Input | 7 | identity_flag |
| `vih` | Input High Threshold (VIH) | 7 | threshold (lte) |
| `logic_family` | Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | 7 | application_review |
| `tpd` | Propagation Delay (tpd) | 7 | threshold (lte) |
| `vol` | Output Low Voltage (VOL) | 6 | threshold (lte) |
| `vil` | Input Low Threshold (VIL) | 6 | threshold (gte) |
| `fmax` | Maximum Operating Frequency (fmax) | 6 | threshold (gte) |
| `setup_hold_time` | Setup Time / Hold Time (tsu / th) | 6 | application_review |
| `bus_hold` | Bus Hold / Weak Pull-up | 5 | identity_flag |
| `input_clamp_diodes` | Input Clamp Diodes | 4 | identity_flag |
| `input_leakage` | Input Leakage Current (IIH / IIL) | 4 | threshold (lte) |
| `transition_time` | Output Transition Time (tr / tf) | 4 | application_review |
| `packaging` | Packaging Format (Tape & Reel / Tube / Tray) | 1 | operational |

---

### C2 — Switching Regulators (DC-DC Converters & Controllers) (4 products, sampled 4)

**Coverage**: 4 of 22 rules covered (18%) | 6 raw params mapped | 6 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 4/4 (100%) | SOT23-5, SOT23-6 |
| 拓扑结构 | `topology` | 10 | identity | 1/4 (25%) | 降压 |
| 输出电流 | `iout_max` | 9 | threshold (gte) | 2/4 (50%) | 1A, 2A |
| 开关频率 | `fsw` | 8 | identity | 2/4 (50%) | 1.5MHz, 600KHz |
| 工作温度 | `operating_temp` | — | *(no rule)* | 2/4 (50%) | -40℃~+85℃ |
| 输入电压 | `_input_voltage` | — | *(no rule)* | 1/4 (25%) | 2.7V~5.5V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 占空比 | 1/4 (25%) | 100% |
| 输出配置 | 1/4 (25%) | Positive |
| 输入电压(最小值) | 1/4 (25%) | 3.5V |
| 功能 | 1/4 (25%) | 降压 |
| 同步整流器 | 1/4 (25%) | 是 |
| 输入电压(最大值) | 1/4 (25%) | 18V |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `control_mode` | Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current) | 9 | identity |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `vout_range` | Output Voltage Range (Min–Max Achievable) | 8 | threshold (range_superset) |
| `compensation_type` | Compensation Type (Internal / External Type-II / Type-III / No-Comp) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min) | 7 | threshold (lte) |
| `ton_min` | Minimum On-Time / Off-Time (ton_min, toff_min) | 7 | threshold (lte) |
| `gate_drive_current` | Gate Drive Voltage / Current (Controller-Only) | 7 | threshold (gte) |
| `enable_uvlo` | Enable / UVLO Pin (Active High / Active Low / Threshold) | 7 | identity_flag |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `soft_start` | Soft-Start (Internal Fixed / External Css / Absent) | 6 | identity_flag |
| `ocp_mode` | Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown Threshold | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C4 — Op-Amps / Comparators / Instrumentation Amplifiers (2 products, sampled 2)

**Coverage**: 3 of 24 rules covered (13%) | 3 raw params mapped | 4 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 2/2 (100%) | SOT23-5, SOT-23 |
| 通道数 | `channels` | 10 | identity | 1/2 (50%) | 2 |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 1/2 (50%) | -55℃~+125℃ |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 工作电流 | 1/2 (50%) | 4μA |
| -3db带宽 | 1/2 (50%) | 300KHz |
| 电源电压，单/双(±) | 1/2 (50%) | 2.5V~20V |
| 输入偏置电流 | 1/2 (50%) | 100nA |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `device_type` | Device Type (Op-Amp / Comparator / Instrumentation Amplifier) | 10 | identity |
| `input_type` | Input Stage Technology (CMOS / JFET / Bipolar) | 9 | identity_upgrade |
| `vicm_range` | Input Common-Mode Voltage Range (VICM) | 9 | threshold (range_superset) |
| `output_type` | Output Type (Push-Pull / Open-Drain / Open-Collector) | 8 | identity |
| `rail_to_rail_input` | Rail-to-Rail Input (RRI) | 8 | identity_flag |
| `rail_to_rail_output` | Rail-to-Rail Output (RRO) | 8 | identity_flag |
| `supply_voltage` | Supply Voltage Range (Single/Dual) | 8 | threshold (range_superset) |
| `gain_bandwidth` | Gain Bandwidth Product (GBW) | 8 | threshold (gte) |
| `min_stable_gain` | Minimum Stable Gain (V/V) | 8 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `slew_rate` | Slew Rate (V/µs) | 7 | threshold (gte) |
| `input_offset_voltage` | Input Offset Voltage Vos (Max) | 7 | threshold (lte) |
| `input_bias_current` | Input Bias Current Ib (Max) | 7 | threshold (lte) |
| `response_time` | Response Time / Propagation Delay (Comparator) | 7 | threshold (lte) |
| `input_noise_voltage` | Input Noise Voltage Density en (nV/√Hz) | 6 | threshold (lte) |
| `output_current` | Output Current Drive (Short-Circuit) | 6 | threshold (gte) |
| `avol` | Open-Loop Voltage Gain Avol (dB) | 5 | threshold (gte) |
| `cmrr` | Common-Mode Rejection Ratio CMRR (dB) | 5 | threshold (gte) |
| `psrr` | Power Supply Rejection Ratio PSRR (dB) | 5 | threshold (gte) |
| `iq` | Quiescent Current per Channel (Iq) | 5 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C7 — Interface ICs (RS-485, CAN, I2C, USB) (2 products, sampled 2)

**Coverage**: 1 of 22 rules covered (5%) | 1 raw params mapped | 0 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 5 | application_review | 2/2 (100%) | SOP-8, SOP-16 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `protocol` | Protocol / Interface Standard | 10 | identity |
| `operating_mode` | Operating Mode / Driver Topology | 9 | identity |
| `data_rate` | Data Rate / Speed Grade | 9 | threshold (gte) |
| `de_polarity` | Driver Enable / Direction Control Polarity | 8 | identity |
| `isolation_type` | Galvanic Isolation Type | 8 | identity_flag |
| `can_variant` | CAN Standard Variant / USB Speed Grade | 8 | identity_flag |
| `bus_fault_protection` | Bus Fault Protection Voltage | 8 | threshold (gte) |
| `txd_dominant_timeout` | TXD Dominant Timeout / Bus Watchdog | 7 | identity_flag |
| `isolation_working_voltage` | Isolation Working Voltage (VIORM) | 7 | threshold (gte) |
| `esd_bus_pins` | ESD Rating — Bus Pins | 7 | threshold (gte) |
| `receiver_threshold_cm` | Input Receiver Threshold & Common-Mode Range | 7 | threshold (range_superset) |
| `supply_voltage` | Supply Voltage Range | 7 | threshold (range_superset) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `failsafe_receiver` | Failsafe Receiver Behavior | 6 | identity_flag |
| `vod_differential` | Differential Output Voltage (VOD) | 6 | threshold (gte) |
| `propagation_delay` | Propagation Delay / Loop Delay | 6 | threshold (lte) |
| `common_mode_range` | Common-Mode Operating Range | 6 | threshold (range_superset) |
| `slew_rate_class` | Slew Rate Limiting | 6 | application_review |
| `unit_loads` | Unit Loads / Bus Loading | 5 | threshold (lte) |
| `standby_current` | Shutdown / Low-Power Standby Current | 5 | threshold (lte) |
| `aec_q100` | AEC-Q100 / Automotive Qualification | 4 | identity_flag |

---

## AISHI

**851 products** across 2 families

### 58 — Aluminum Electrolytic Capacitors (758 products, sampled 100)

**Coverage**: 8 of 17 rules covered (47%) | 10 raw params mapped | 0 unmapped | 9 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 容值 | `capacitance` | 10 | identity | 100/100 (100%) | 220µF, 100µF |
| 额定电压 | `voltage_rated` | 9 | threshold (gte) | 100/100 (100%) | 35V, 25V |
| 纹波电流 | `ripple_current` | 8 | threshold (gte) | 43/100 (43%) | 350mA, 2.1A |
| 不同温度时的使用寿命 | `lifetime` | 7 | threshold (gte) | 100/100 (100%) | 7000Hrs@105℃, 2000Hrs@105℃ |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 100/100 (100%) | -40℃~+105℃, -55℃~+105℃ |
| 等效串联电阻 | `esr` | 7 | threshold (lte) | 34/100 (34%) | 210mΩ, 35mΩ |
| 精度 | `tolerance` | 5 | threshold (lte) | 100/100 (100%) | ±20%, -10~+20% |
| 漏泄电流 | `leakage_current` | 5 | threshold (lte) | 100/100 (100%) | 漏泄电流, 500µA |
| 封装/外壳 | `package_case` | — | *(no rule)* | 100/100 (100%) | 插件,D8xL12mm, 插件,D6.3xL11mm |
| 耗散因数 | `dissipation_factor` | — | *(no rule)* | 100/100 (100%) | 耗散因数, 0.08 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `polarization` | Polarization | 9 | identity |
| `mounting_type` | Mounting Type | 9 | identity |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `lead_spacing` | Lead Spacing | 7 | identity |
| `diameter` | Diameter | 6 | fit |
| `height` | Height | 6 | fit |
| `impedance` | Impedance | 5 | threshold (lte) |
| `capacitor_type` | Capacitor Type / Series | 4 | identity_upgrade |
| `packaging` | Packaging | 2 | operational |

---

### 60 — Aluminum Polymer Capacitors (93 products, sampled 93)

**Coverage**: 7 of 17 rules covered (41%) | 9 raw params mapped | 2 unmapped | 10 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 容值 | `capacitance` | 10 | identity | 92/93 (99%) | 470µF, 330µF |
| 额定电压 | `voltage_rated` | 9 | threshold (gte) | 92/93 (99%) | 25V, 10V |
| 纹波电流 | `ripple_current` | 9 | threshold (gte) | 72/93 (77%) | 4A, 3.1A |
| 等效串联电阻 | `esr` | 9 | threshold (lte) | 72/93 (77%) | 20mΩ, 15mΩ |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 92/93 (99%) | -55℃~+105℃, -55℃~+125℃ |
| 精度 | `tolerance` | 5 | threshold (lte) | 92/93 (99%) | ±20% |
| 漏泄电流 | `leakage_current` | 5 | threshold (lte) | 33/93 (35%) | 2350µA, 1033µA |
| 封装/外壳 | `package_case` | — | *(no rule)* | 93/93 (100%) | 插件,D10xL12mm, 插件,D8xL11mm |
| 不同温度时的使用寿命 | `lifetime` | — | *(no rule)* | 92/93 (99%) | 2000Hrs@105℃, 2000Hrs@125℃ |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 额定电压-AC | 1/93 (1%) | 35V |
| 额定温度 | 1/93 (1%) | -55°C~+105°C |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `polarization` | Polarization | 9 | identity |
| `mounting_type` | Mounting Type | 9 | identity |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `lead_spacing` | Lead Spacing | 7 | identity |
| `diameter` | Diameter | 6 | fit |
| `height` | Height | 6 | fit |
| `impedance` | Impedance | 5 | threshold (lte) |
| `polymer_type` | Conductive Polymer Type | 5 | identity |
| `capacitor_type` | Capacitor Type / Series | 4 | identity_upgrade |
| `packaging` | Packaging | 2 | operational |

---

## MingDa

**381 products** across 3 families

### C1 — Linear Voltage Regulators (LDOs) (352 products, sampled 100)

**Coverage**: 7 of 22 rules covered (32%) | 8 raw params mapped | 3 unmapped | 15 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装 | `package_case` | 10 | identity | 100/100 (100%) | SOT-89-3, SOT-89-3L |
| 输出类型 | `output_type` | 10 | identity | 50/100 (50%) | 固定, 可调 |
| 输出电压 | `output_voltage` | 10 | identity | 50/100 (50%) | 3V~12V, 3V~5V |
| 输出电流 | `iout_max` | 9 | threshold (gte) | 100/100 (100%) | 300mA, 120mA |
| 最大输入电压 | `vin_max` | 8 | threshold (gte) | 50/100 (50%) | 40V, 30V |
| 压差 | `vdropout` | 7 | threshold (lte) | 2/100 (2%) | 280mV@(200mA), 60mV@(1mA) |
| 电源纹波抑制比(PSRR) | `psrr` | 6 | application_review | 4/100 (4%) | 40dB@(100Hz), 65dB@(1kHz) |
| 工作温度 | `operating_temp` | — | *(no rule)* | 4/100 (4%) | -40℃~+85℃@(Ta), -40℃~+85℃ |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 输出极性 | 50/100 (50%) | 正极 |
| 输出通道数 | 50/100 (50%) | 1 |
| 待机电流 | 16/100 (16%) | 25uA, 600nA |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `polarity` | Polarity (Positive / Negative) | 10 | identity |
| `output_cap_compatibility` | Output Capacitor ESR Compatibility (Ceramic Stable) | 8 | identity_flag |
| `enable_pin` | Enable Pin (Active High / Active Low / Absent) | 8 | identity |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min / Dropout) | 7 | threshold (lte) |
| `vout_accuracy` | Output Voltage Accuracy (Initial Tolerance) | 7 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `power_good` | Power-Good / Flag Pin | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown | 6 | identity_flag |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `iq` | Quiescent Current (Iq / Ground Current) | 5 | threshold (lte) |
| `load_regulation` | Load Regulation (ΔVout / ΔIout) | 5 | threshold (lte) |
| `soft_start` | Soft-Start | 5 | identity_flag |
| `line_regulation` | Line Regulation (ΔVout / ΔVin) | 4 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C2 — Switching Regulators (DC-DC Converters & Controllers) (23 products, sampled 23)

**Coverage**: 4 of 22 rules covered (18%) | 8 raw params mapped | 4 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装 | `package_case` | 10 | identity | 23/23 (100%) | SOP-8, SOT-89-3L |
| 拓扑结构 | `topology` | 10 | identity | 1/23 (4%) | 升压式 |
| 输出电流 | `iout_max` | 9 | threshold (gte) | 9/23 (39%) | 201mA, 203mA |
| 开关频率 | `fsw` | 8 | identity | 12/23 (52%) | 110kHz, 350kHz |
| 输入电压 | `_input_voltage` | — | *(no rule)* | 10/23 (43%) | 1.5V~5.3V, 10V |
| 输出电压 | `output_voltage` | — | *(no rule)* | 8/23 (35%) | 3V~5.3V, 3.6V |
| 工作温度 | `operating_temp` | — | *(no rule)* | 5/23 (22%) | -40℃~+85℃@(TA) |
| 输出类型 | `output_type` | — | *(no rule)* | 1/23 (4%) | 可调 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 功能类型 | 8/23 (35%) | 升压型, 降压型 |
| 开关管(内置/外置) | 6/23 (26%) | 内置 |
| 输出通道数 | 5/23 (22%) | 1 |
| 静态电流(Iq) | 4/23 (17%) | 4uA, 1uA |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `control_mode` | Control Mode (Peak Current / Voltage / Hysteretic / COT / Average Current) | 9 | identity |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
| `vin_max` | Maximum Input Voltage (Vin Max) | 8 | threshold (gte) |
| `vout_range` | Output Voltage Range (Min–Max Achievable) | 8 | threshold (range_superset) |
| `compensation_type` | Compensation Type (Internal / External Type-II / Type-III / No-Comp) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min) | 7 | threshold (lte) |
| `ton_min` | Minimum On-Time / Off-Time (ton_min, toff_min) | 7 | threshold (lte) |
| `gate_drive_current` | Gate Drive Voltage / Current (Controller-Only) | 7 | threshold (gte) |
| `enable_uvlo` | Enable / UVLO Pin (Active High / Active Low / Threshold) | 7 | identity_flag |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `soft_start` | Soft-Start (Internal Fixed / External Css / Absent) | 6 | identity_flag |
| `ocp_mode` | Overcurrent Protection Mode (Hiccup / Foldback / Latch / Constant Current) | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown Threshold | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C4 — Op-Amps / Comparators / Instrumentation Amplifiers (6 products, sampled 6)

**Coverage**: 1 of 24 rules covered (4%) | 1 raw params mapped | 4 unmapped | 23 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装 | `package_case` | 10 | identity | 6/6 (100%) | SOT-23-5, SOIC-8 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 放大器数 | 4/6 (67%) | 单路, 双路 |
| 增益带宽积(GBP) | 4/6 (67%) | 1MHz, 3MHz |
| 压摆率(SR) | 4/6 (67%) | 0.64V/us, 1.74V/us |
| 每个通道供电电流 | 4/6 (67%) | 40uA, 270uA |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `device_type` | Device Type (Op-Amp / Comparator / Instrumentation Amplifier) | 10 | identity |
| `channels` | Number of Channels (Single / Dual / Quad) | 10 | identity |
| `input_type` | Input Stage Technology (CMOS / JFET / Bipolar) | 9 | identity_upgrade |
| `vicm_range` | Input Common-Mode Voltage Range (VICM) | 9 | threshold (range_superset) |
| `output_type` | Output Type (Push-Pull / Open-Drain / Open-Collector) | 8 | identity |
| `rail_to_rail_input` | Rail-to-Rail Input (RRI) | 8 | identity_flag |
| `rail_to_rail_output` | Rail-to-Rail Output (RRO) | 8 | identity_flag |
| `supply_voltage` | Supply Voltage Range (Single/Dual) | 8 | threshold (range_superset) |
| `gain_bandwidth` | Gain Bandwidth Product (GBW) | 8 | threshold (gte) |
| `min_stable_gain` | Minimum Stable Gain (V/V) | 8 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `slew_rate` | Slew Rate (V/µs) | 7 | threshold (gte) |
| `input_offset_voltage` | Input Offset Voltage Vos (Max) | 7 | threshold (lte) |
| `input_bias_current` | Input Bias Current Ib (Max) | 7 | threshold (lte) |
| `response_time` | Response Time / Propagation Delay (Comparator) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `input_noise_voltage` | Input Noise Voltage Density en (nV/√Hz) | 6 | threshold (lte) |
| `output_current` | Output Current Drive (Short-Circuit) | 6 | threshold (gte) |
| `avol` | Open-Loop Voltage Gain Avol (dB) | 5 | threshold (gte) |
| `cmrr` | Common-Mode Rejection Ratio CMRR (dB) | 5 | threshold (gte) |
| `psrr` | Power Supply Rejection Ratio PSRR (dB) | 5 | threshold (gte) |
| `iq` | Quiescent Current per Channel (Iq) | 5 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---
