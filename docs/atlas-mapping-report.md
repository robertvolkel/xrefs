# Atlas Manufacturer Attribute Mapping Report

> Generated: 2026-04-04
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
| Package | `package_case` | 10 | identity | 100/100 (100%) | SOT-723, SOT-523 |
| Cfg. | `channel_type` | 10 | identity | 100/100 (100%) | P, N |
| BV(V) | `vds_max` | 10 | threshold (gte) | 100/100 (100%) | -20, 30 |
| ID(A) TA=25 | `id_max` | 10 | threshold (gte) | 93/100 (93%) | -0.4, 0.35 |
| ID(A) TC=25 | `id_max` | 10 | threshold (gte) | 17/100 (17%) | -67, 4 |
| RDS(on)(mΩ MAX.) 10V | `rds_on` | 9 | threshold (lte) | 59/100 (59%) | 800, 10.5 |
| VGS(±V) | `vgs_max` | 8 | threshold (gte) | 100/100 (100%) | 12, 20 |
| Coss(pF)TYP. | `coss` | 7 | application_review | 100/100 (100%) | 21, 8 |
| Crss(pF)TYP. | `crss` | 7 | threshold (lte) | 100/100 (100%) | 11, 3 |
| Ciss(pF)TYP. | `ciss` | 6 | threshold (lte) | 100/100 (100%) | 46, 28 |
| VTH(V)-typ. | `vgs_th` | 6 | application_review | 92/100 (92%) | -0.75, 0.95 |
| RDS(on)(mΩ MAX.) 4.5V | `_rds_on_4v5` | — | *(no rule)* | 100/100 (100%) | 525, 700 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 100/100 (100%) | New, Engineer sample |

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
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | SOD123FL, SMB(DO-214AA) |
| 电源电压 | `vrwm` | 10 | identity | 96/100 (96%) | 12V, 6V |
| 极性 | `polarity` | 10 | identity | 86/100 (86%) | 双向, 单向 |
| 通道数 | `num_channels` | 10 | identity | 77/100 (77%) | 1, 2 |
| 反向断态电压 | `vrwm` | 10 | identity | 75/100 (75%) | 6V, 5V |
| 电路数 | `num_channels` | 10 | identity | 5/100 (5%) | 1 |
| 击穿电压 V(BR)-min | `vbr` | 9 | identity | 89/100 (89%) | 13.3V, 6.67V |
| 功率-峰值脉冲 | `ppk` | 9 | threshold (gte) | 81/100 (81%) | 200W, 600W |
| 峰值脉冲电流(Ipp) | `ipp` | 8 | threshold (gte) | 87/100 (87%) | 10.1A, 58.3A |
| 结电容 | `cj` | 8 | threshold (lte) | 33/100 (33%) | 30pF@1MHz, 0.8pF |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 71/100 (71%) | -55℃~+150℃(TJ), -65℃~+150℃(TJ) |
| 反向漏电流 IR | `ir_leakage` | 5 | threshold (lte) | 62/100 (62%) | 1uA, 0.5uA |
| 击穿电压Max | `_vbr_max` | — | *(no rule)* | 1/100 (1%) | 7.14V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 最大工作电压 | 100/100 (100%) | 12V, 6V |
| 压敏电压 | 5/100 (5%) | 30V, 200V |
| 测试电流(IT) | 4/100 (4%) | 1mA |

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
| 保持电流 | `hold_current` | 10 | identity | 100/100 (100%) | 500mA, 200mA |
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | 1206, PTC_D9.7X3MM_TM |
| 额定电压-DC | `max_voltage` | 10 | threshold (gte) | 100/100 (100%) | 6V, 24V |
| 最大工作电压 | `max_voltage` | 10 | threshold (gte) | 97/100 (97%) | 6V, 24V |
| 额定电流 | `hold_current` | 10 | identity | 22/100 (22%) | 100A, 10A |
| 跳闸动作电流(It) | `trip_current` | 9 | threshold (lte) | 96/100 (96%) | 1A, 420mA |
| 熔断电流 | `trip_current` | 9 | threshold (lte) | 84/100 (84%) | 1A, 460mA |
| 电流-最大值 | `max_fault_current` | 8 | threshold (gte) | 90/100 (90%) | 100A, 40A |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 99/100 (99%) | -40℃~+85℃, -10℃~+40℃ |
| 熔断时间 | `time_to_trip` | 7 | threshold (lte) | 25/100 (25%) | 0.3sec, 1.5sec |
| 电阻-初始(Ri)(最小值) | `initial_resistance` | 6 | threshold (lte) | 56/100 (56%) | 150mΩ, 350mΩ |
| 功率耗散(最大值) | `power_dissipation` | 5 | threshold (lte) | 82/100 (82%) | 600mW, 880mW |
| 电阻-跳断后(R1)(最大值) | `post_trip_resistance` | 5 | application_review | 50/100 (50%) | 700mΩ, 3.5Ω |

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

**Coverage**: 11 of 23 rules covered (48%) | 13 raw params mapped | 5 unmapped | 12 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 62/62 (100%) | SOD-123, SMB(DO-214AA) |
| 反向耐压VR | `vrrm` | 10 | threshold (gte) | 60/62 (97%) | 400V, 1KV |
| 平均整流电流 | `io_avg` | 10 | threshold (gte) | 60/62 (97%) | 2A, 1A |
| 二极管配置 | `configuration` | 10 | identity | 49/62 (79%) | 单路, 3 Independent |
| 反向峰值电压(最大值) | `vrrm` | 10 | threshold (gte) | 41/62 (66%) | 150V, 100V |
| 正向电流 | `io_avg` | 10 | threshold (gte) | 14/62 (23%) | 3A, 120A |
| 正向压降VF | `vf` | 8 | threshold (lte) | 55/62 (89%) | 1.3V, 980mV |
| 正向压降VF Max | `vf` | 8 | threshold (lte) | 28/62 (45%) | 1.25V, 1V |
| 反向恢复时间(trr) | `trr` | 8 | threshold (lte) | 10/62 (16%) | 35ns, 500ns |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 49/62 (79%) | -55℃~+150℃, +150℃ |
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

**Coverage**: 9 of 22 rules covered (41%) | 11 raw params mapped | 4 unmapped | 13 rules missing

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

**Coverage**: 7 of 27 rules covered (26%) | 9 raw params mapped | 1 unmapped | 20 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | SOP-8, SOT23-3 |
| Polarity | `channel_type` | 10 | identity | 100/100 (100%) | P, N |
| VDS (V) | `vds_max` | 10 | threshold (gte) | 100/100 (100%) | -600, -350 |
| ID (A) | `id_max` | 10 | threshold (gte) | 100/100 (100%) | -1, -0.3 |
| Tech nology | `technology` | 9 | identity_flag | 100/100 (100%) | MVMOS, MVMOS II |
| Qg*  (nC) | `qg` | 8 | threshold (lte) | 95/100 (95%) | 8.8, 1.25 |
| Vth(V) Typ | `vgs_th` | 6 | application_review | 100/100 (100%) | -3, -1.6 |
| RDS(ON) (mΩ) 10V typ | `_rds_on_typ` | — | *(no rule)* | 98/100 (98%) | 12000, 1200 |
| RDS(ON) (mΩ) 4.5V typ | `_rds_on_4v5_typ` | — | *(no rule)* | 4/100 (4%) | 19000, 18 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 100/100 (100%) | New, Act |

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

**Coverage**: 6 of 22 rules covered (27%) | 12 raw params mapped | 3 unmapped | 16 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Topology | `topology` | 10 | identity | 37/37 (100%) | 反激、正激, 降压、升压和反激（SEPIC 和 Cuk） |
| Control Mode | `control_mode` | 9 | identity | 37/37 (100%) | 电流, 电压 |
| IOUT (A) | `iout_max` | 9 | threshold (gte) | 3/37 (8%) | 4.5, 0.65 |
| Vin(max) (V) | `vin_max` | 8 | threshold (gte) | 37/37 (100%) | 90, 120 |
| Freq(max) (KHz) | `fsw` | 8 | identity | 37/37 (100%) | 1MHz, 2MHz |
| Vin(min) (V) | `vin_min` | 7 | threshold (lte) | 3/37 (8%) | 5, 7.5 |
| UVLO on/off (V) | `_uvlo` | — | *(no rule)* | 34/37 (92%) | Programmable, 7.5/6.0 |
| Duty Cycle (max) (%) | `_duty_max` | — | *(no rule)* | 34/37 (92%) | 97, 95 |
| Source/Sink Current (A) | `_gate_drive` | — | *(no rule)* | 34/37 (92%) | 1, 0.3/0.7 |
| Channels | `_channels` | — | *(no rule)* | 3/37 (8%) | 1 |
| VOUT (V) | `_output_voltage` | — | *(no rule)* | 3/37 (8%) | 可调 |
| Duty Cycle (max)(%) | `_duty_max` | — | *(no rule)* | 1/37 (3%) | 95 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 37/37 (100%) | R&D, Act |
| Features | 37/37 (100%) | 内置误差放大器、高精度基准电压、可编程线路欠压锁定（UVLO）、逐周期限流、斜坡补偿、软起动和..., 内置误差放大器、精密基准、欠压保护、逐周期限流、斜坡补偿、软启动、振荡器可同步和过温保护 |
| Cross Refrence | 25/37 (68%) | LM5020, LM5020-1 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `package_case` | Package / Footprint | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
| `vout_range` | Output Voltage Range (Min–Max Achievable) | 8 | threshold (range_superset) |
| `compensation_type` | Compensation Type (Internal / External Type-II / Type-III / No-Comp) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
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

**Coverage**: 5 of 25 rules covered (20%) | 8 raw params mapped | 2 unmapped | 20 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 29/29 (100%) | TO247plus-3, TO247-3 |
| VCES(V) | `vces_max` | 10 | threshold (gte) | 29/29 (100%) | 1200, 650 |
| IC(A)@100℃ | `ic_max` | 10 | threshold (gte) | 29/29 (100%) | 75, 60 |
| VCE(v)_15_max | `vce_sat` | 9 | threshold (lte) | 28/29 (97%) | 2.05, 2.00 |
| Eoff(mJ) | `eoff` | 9 | threshold (lte) | 28/29 (97%) | 5.69, 2.9 |
| Vth(V)Typ | `vgs_th` | — | *(no rule)* | 29/29 (100%) | 5.3, 5.7 |
| VCE(v)_15_Typ | `_vce_sat_typ` | — | *(no rule)* | 28/29 (97%) | 1.65, 1.70 |
| Vf(V) | `_diode_vf` | — | *(no rule)* | 28/29 (97%) | 2.06, 1.92 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 29/29 (100%) | New, R&D |
| TechType | 29/29 (100%) | IGBT |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `channel_type` | Channel Type (N-Channel / P-Channel) | 10 | identity |
| `co_packaged_diode` | Co-Packaged Antiparallel Diode | 10 | identity_flag |
| `igbt_technology` | IGBT Technology (PT / NPT / FS) | 9 | identity_upgrade |
| `mounting_style` | Mounting Style | 9 | identity |
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

**Coverage**: 6 of 23 rules covered (26%) | 7 raw params mapped | 10 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 21/24 (88%) | TO220-2, TO247-2 |
| Polarity | `configuration` | 10 | identity | 21/24 (88%) | single, Double |
| VDS (V) | `vrrm` | 10 | threshold (gte) | 21/24 (88%) | 650, 1200 |
| ID* (A)  @25°C | `io_avg` | 10 | threshold (gte) | 15/24 (63%) | 8, 20 |
| VF (V) | `vf` | 8 | threshold (lte) | 15/24 (63%) | 1.27, 1.45 |
| Cj (pF) | `cj` | 4 | application_review | 15/24 (63%) | 530, 1350 |
| Qc (nC) | `_qc` | — | *(no rule)* | 15/24 (63%) | 21, 80 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 24/24 (100%) | New, Act |
| Tech nology | 21/24 (88%) | SiCSBD Ⅲ |
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
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
| `vdc` | Max DC Blocking Voltage (Vdc) | 8 | threshold (gte) |
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
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### C1 — Linear Voltage Regulators (LDOs) (22 products, sampled 22)

**Coverage**: 4 of 22 rules covered (18%) | 7 raw params mapped | 3 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Iout(max) (A) | `iout_max` | 9 | threshold (gte) | 22/22 (100%) | 0.75, 2 |
| Vin(max) (V) | `vin_max` | 8 | threshold (gte) | 22/22 (100%) | 26, -35 |
| Vin(min) (V) | `vin_min` | 7 | threshold (lte) | 22/22 (100%) | 2, 2.24 |
| Vdrop(typ) (mV) | `vdropout` | 7 | threshold (lte) | 22/22 (100%) | 300, 420 |
| Vout(max) (V) | `_output_voltage_max` | — | *(no rule)* | 22/22 (100%) | 26, 5 |
| Vout(min) (V) | `_output_voltage_min` | — | *(no rule)* | 22/22 (100%) | 1.24, 5 |
| Noise (uVrms) | `_noise` | — | *(no rule)* | 11/22 (50%) | 400, 2.5 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 22/22 (100%) | Act, R&D |
| Output options | 22/22 (100%) | Adjustable Output, Fixed Output(5.0V) |
| Cross Refrence | 12/22 (55%) | MIC29372BU, MIC29152BU |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `output_type` | Output Type (Fixed / Adjustable / Tracking / Negative) | 10 | identity |
| `output_voltage` | Output Voltage Vout | 10 | identity |
| `package_case` | Package / Footprint | 10 | identity |
| `polarity` | Polarity (Positive / Negative) | 10 | identity |
| `output_cap_compatibility` | Output Capacitor ESR Compatibility (Ceramic Stable) | 8 | identity_flag |
| `enable_pin` | Enable Pin (Active High / Active Low / Absent) | 8 | identity |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
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

**Coverage**: 6 of 23 rules covered (26%) | 10 raw params mapped | 10 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Function | `logic_function` | 10 | identity | 13/14 (93%) | 与门, 与非门 |
| Number of channels | `gate_count` | 10 | identity | 13/14 (93%) | 2, 4 |
| Output type | `output_type` | 8 | identity_flag | 13/14 (93%) | Push-Pull |
| Supply voltage (min)(V) | `supply_voltage` | 8 | threshold (range_superset) | 13/14 (93%) | 1.65 |
| Supply voltage (max)(V) | `supply_voltage` | 8 | threshold (range_superset) | 13/14 (93%) | 7 |
| Technology family | `logic_family` | 7 | application_review | 13/14 (93%) | LVC |
| IOL (mA) | `drive_current` | 7 | threshold (gte) | 13/14 (93%) | 32 |
| IOH (mA) | `drive_current` | 7 | threshold (gte) | 13/14 (93%) | -32 |
| Inputs per channel | `_inputs_per_gate` | — | *(no rule)* | 13/14 (93%) | 3, 4 |
| Input type | `_input_type` | — | *(no rule)* | 13/14 (93%) | Standard CMOS |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 13/14 (93%) | Act |
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
| `package_case` | Package / Footprint | 10 | identity |
| `oe_polarity` | 3-State Output Enable (OE) Polarity | 9 | identity_flag |
| `aec_q100` | AEC-Q100 Automotive Qualification | 8 | identity_flag |
| `voh` | Output High Voltage (VOH) | 7 | threshold (gte) |
| `schmitt_trigger` | Schmitt Trigger Input | 7 | identity_flag |
| `vih` | Input High Threshold (VIH) | 7 | threshold (lte) |
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

**Coverage**: 9 of 17 rules covered (53%) | 11 raw params mapped | 0 unmapped | 8 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| 封装/外壳 | `package_case` | 10 | identity | 100/100 (100%) | IND_7.3X6.6MM_SM, IND_6X6MM_SM |
| 感值 | `inductance` | 10 | identity | 100/100 (100%) | 1μH, 10μH |
| 额定电流 | `rated_current` | 9 | threshold (gte) | 100/100 (100%) | 12A, 4A |
| 饱和电流 | `saturation_current` | 9 | threshold (gte) | 56/100 (56%) | 22A, 5.5A |
| 屏蔽 | `shielding` | 8 | identity_upgrade | 53/100 (53%) | 屏蔽, 无屏蔽 |
| 直流电阻(DCR) | `dcr` | 7 | threshold (lte) | 99/100 (99%) | 9mΩ, 60mΩ |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 86/100 (86%) | -40℃~+125℃ |
| 精度 | `tolerance` | 6 | threshold (lte) | 100/100 (100%) | ±20% |
| 自谐振频率 | `srf` | 5 | threshold (gte) | 1/100 (1%) | 100KHz |
| 测试频率 | `_test_frequency` | — | *(no rule)* | 53/100 (53%) | 100KHz |
| 类型 | `_type` | — | *(no rule)* | 6/100 (6%) | 功率电感, 绕线 |

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

**Coverage**: 10 of 23 rules covered (43%) | 11 raw params mapped | 0 unmapped | 13 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | DFN2510, DO-214AA/SMB |
| VRWM(V) | `vrwm` | 10 | identity | 99/100 (99%) | 5, 11.0~150.0 |
| Dir. | `polarity` | 10 | identity | 82/100 (82%) | Bi-Dir, Uni-dir |
| Config. | `configuration` | 10 | identity | 82/100 (82%) | Array, Single |
| VC max(V) | `vc` | 10 | threshold (lte) | 18/100 (18%) | 18.2~243.0, 7.3 |
| Ppp(W) | `ppk` | 9 | threshold (gte) | 98/100 (98%) | 3000, 200 |
| VBR min(V) | `vbr` | 9 | identity | 97/100 (97%) | 12.2~167.0, 4.1 |
| Ipp(A) | `ipp` | 8 | threshold (gte) | 99/100 (99%) | 12.35~164.84, 27.5 |
| C typ.(pF) | `cj` | 8 | threshold (lte) | 82/100 (82%) | 0.05, 265 |
| IR max(uA) | `ir_leakage` | 5 | threshold (lte) | 98/100 (98%) | 0.1, 2 |
| VBR max(V) | `_vbr_max` | — | *(no rule)* | 18/100 (18%) | 13.50~185.0, 6.5 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `num_channels` | Number of Channels / Lines | 10 | identity |
| `pin_configuration` | Pin Configuration / Pinout | 10 | identity |
| `mounting_style` | Mounting Style | 9 | identity |
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

**Coverage**: 7 of 23 rules covered (30%) | 12 raw params mapped | 0 unmapped | 16 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | SOD-323, TO-252 |
| VRRM(V) | `vrrm` | 10 | threshold (gte) | 100/100 (100%) | 100, 45 |
| IF(mA) | `io_avg` | 10 | threshold (gte) | 35/100 (35%) | 150, 10 |
| I(AV)(A) | `io_avg` | 10 | threshold (gte) | 32/100 (32%) | 5, 4.0 |
| Io(mA) | `io_avg` | 10 | threshold (gte) | 26/100 (26%) | 200, 150 |
| IF(A) | `io_avg` | 10 | threshold (gte) | 7/100 (7%) | 3.0, 5.0 |
| VF(V) | `vf` | 8 | threshold (lte) | 74/100 (74%) | 1, 0.55 |
| Trr(nS) | `trr` | 8 | threshold (lte) | 25/100 (25%) | 50, 8.0 |
| IFSM(A) | `ifsm` | 7 | threshold (gte) | 73/100 (73%) | 0.75, 120 |
| IR(uA) | `ir_leakage` | 5 | threshold (lte) | 67/100 (67%) | 2, 0.5 |
| IR(mA) | `ir_leakage` | 5 | threshold (lte) | 7/100 (7%) | 0.005 |
| PD(mW) | `_pd` | — | *(no rule)* | 26/100 (26%) | 250, 400 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `recovery_category` | Recovery Category | 10 | identity_upgrade |
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
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rtheta_ja) | 5 | threshold (lte) |
| `height` | Height (Seated Max) | 5 | fit |
| `cj` | Junction Capacitance (Cj) | 4 | application_review |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B7 — IGBTs — Insulated Gate Bipolar Transistors (105 products, sampled 100)

**Coverage**: 4 of 25 rules covered (16%) | 4 raw params mapped | 0 unmapped | 21 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | D6, D2 |
| VCES(V) | `vces_max` | 10 | threshold (gte) | 100/100 (100%) | 1200, 650 |
| VCE(sat) | `vce_sat` | 9 | threshold (lte) | 99/100 (99%) | 2.2, 3.00 |
| VGE (th)(V) | `vgs_th` | — | *(no rule)* | 96/100 (96%) | 4.5~5.7, 4.0~5.5 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `channel_type` | Channel Type (N-Channel / P-Channel) | 10 | identity |
| `co_packaged_diode` | Co-Packaged Antiparallel Diode | 10 | identity_flag |
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

**Coverage**: 6 of 22 rules covered (27%) | 5 raw params mapped | 0 unmapped | 16 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 30/30 (100%) | DO-41, DO-214AA/SMB |
| VZ Type(V) | `vz` | 10 | identity | 30/30 (100%) | 3.3~100, 3.3~250.0 |
| Pd(W) | `pd` | 9 | threshold (gte) | 30/30 (100%) | 1.0, 3.0 |
| IR max(uA) | `ir_leakage` | 5 | threshold (lte) | 30/30 (100%) | 5.0~100, 0.5~100 |
| VF (V) | `vf` | 3 | application_review | 30/30 (100%) | 1.2, 1.5 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `pin_configuration` | Pin Configuration / Polarity Marking | 10 | identity |
| `configuration` | Configuration | 9 | identity |
| `vz_tolerance` | Zener Voltage Tolerance | 8 | threshold (lte) |
| `izt` | Zener Test Current (Izt) | 8 | identity |
| `aec_q101` | AEC-Q101 Qualification | 8 | identity_flag |
| `zzt` | Dynamic / Differential Impedance (Zzt) | 7 | threshold (lte) |
| `tc` | Temperature Coefficient (TC / αVz) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `izm` | Maximum Zener Current (Izm) | 6 | threshold (gte) |
| `rth_ja` | Thermal Resistance, Junction-to-Ambient (Rθja) | 6 | threshold (lte) |
| `tj_max` | Max Junction Temperature (Tj_max) | 6 | threshold (gte) |
| `height` | Height (Seated Max) | 5 | fit |
| `zzk` | Knee Impedance (Zzk) | 4 | application_review |
| `cj` | Junction Capacitance (Cj) | 4 | application_review |
| `regulation_type` | Regulation Type (Zener vs. Avalanche) | 3 | application_review |
| `packaging` | Packaging (Tape & Reel / Tube / Bulk) | 2 | operational |

---

### B6 — BJTs — NPN & PNP (28 products, sampled 28)

**Coverage**: 5 of 18 rules covered (28%) | 6 raw params mapped | 0 unmapped | 13 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 28/28 (100%) | DFN1006, SOT363 |
| Polarity | `polarity` | 10 | identity | 28/28 (100%) | NPN, PNP |
| Vceo(V) | `vceo_max` | 9 | threshold (gte) | 28/28 (100%) | 40, -65~-45 |
| Vcbo(V) | `_vcbo` | — | *(no rule)* | 28/28 (100%) | 60, -80~-50 |
| Vebo(V) | `_vebo` | — | *(no rule)* | 28/28 (100%) | 6, -5 |
| Ic(mA) | `_ic` | — | *(no rule)* | 28/28 (100%) | 200, -0.1 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `vce_sat` | Vce(sat) Max (Collector-Emitter Saturation Voltage) | 8 | threshold (lte) |
| `hfe` | DC Current Gain (hFE) | 8 | application_review |
| `tst` | Storage Time (tst) | 8 | threshold (lte) |
| `aec_q101` | AEC-Q101 (Automotive Qualification) | 8 | identity_flag |
| `vces_max` | Vces Max (Collector-Emitter Voltage, shorted base) | 7 | threshold (gte) |
| `ft` | Transition Frequency (ft) | 7 | threshold (gte) |
| `toff` | Turn-Off Time (toff) | 7 | threshold (lte) |
| `rth_jc` | Junction-to-Case Thermal Resistance (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA Curves) | 7 | application_review |
| `vbe_sat` | Vbe(sat) Max (Base-Emitter Saturation Voltage) | 6 | threshold (lte) |
| `ton` | Turn-On Time (ton) | 6 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 6 | threshold (gte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Ammo) | 2 | operational |

---

### 66 — PTC Resettable Fuses (PolyFuses) (13 products, sampled 13)

**Coverage**: 6 of 15 rules covered (40%) | 5 raw params mapped | 0 unmapped | 9 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 11/13 (85%) | 1206, Bulk |
| Vmax(V) | `max_voltage` | 10 | threshold (gte) | 11/13 (85%) | 6~60, 60 |
| Ihold(A) | `hold_current` | 10 | identity | 11/13 (85%) | 0.05~3.50, 0.05~4.0 |
| Itrip(A) | `trip_current` | 9 | threshold (lte) | 11/13 (85%) | 0.15~7.00, 0.1~8.0 |
| Pd(W) | `power_dissipation` | 5 | threshold (lte) | 11/13 (85%) | 0.4~1.2, 0.3~8.2 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `max_fault_current` | Maximum Fault Current (Imax) | 8 | threshold (gte) |
| `safety_rating` | Safety Rating (UL, TUV, CSA) | 8 | identity_flag |
| `aec_q200` | AEC-Q200 Qualification | 8 | identity_flag |
| `time_to_trip` | Time-to-Trip | 7 | threshold (lte) |
| `initial_resistance` | Initial Resistance (R₁) | 6 | threshold (lte) |
| `endurance_cycles` | Endurance (Trip/Reset Cycles) | 6 | threshold (gte) |
| `post_trip_resistance` | Post-Trip Resistance (R1max) | 5 | application_review |
| `height` | Height (Seated Max) | 5 | fit |
| `packaging` | Packaging | 2 | operational |

---

### B5 — MOSFETs — N-Channel & P-Channel (13 products, sampled 13)

**Coverage**: 8 of 27 rules covered (30%) | 8 raw params mapped | 0 unmapped | 19 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 13/13 (100%) | SOT-23, SOT363 |
| Polarity | `channel_type` | 10 | identity | 13/13 (100%) | N-MOS, Dual  N-MOS |
| VDS(V) | `vds_max` | 10 | threshold (gte) | 13/13 (100%) | 30, 50 |
| ID(A) | `id_max` | 10 | threshold (gte) | 13/13 (100%) | 5.8, 0.2 |
| Rds(on)@VGS=4.5V(Ω) | `rds_on` | 9 | threshold (lte) | 12/13 (92%) | 22, 6 |
| Rds(on)@VGS=10V(Ω) | `rds_on` | 9 | threshold (lte) | 7/13 (54%) | 20, 3.5 |
| VGS(V) | `vgs_max` | 8 | threshold (gte) | 13/13 (100%) | ±12, ±20 |
| VGS(th)(V) | `vgs_th` | 6 | application_review | 13/13 (100%) | 0.9, 1.5 |

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
| `coss` | Output Capacitance (Coss) | 7 | application_review |
| `crss` | Reverse Transfer Capacitance (Crss) | 7 | threshold (lte) |
| `rth_jc` | Thermal Resistance Junction-to-Case (Rθjc) | 7 | threshold (lte) |
| `soa` | Safe Operating Area (SOA) Curves | 7 | application_review |
| `qgs` | Gate-Source Charge (Qgs) | 6 | threshold (lte) |
| `ciss` | Input Capacitance (Ciss) | 6 | threshold (lte) |
| `body_diode_vf` | Body Diode Forward Voltage (Vf) | 6 | threshold (lte) |
| `rth_ja` | Thermal Resistance Junction-to-Ambient (Rθja) | 5 | application_review |
| `height` | Height / Profile | 5 | fit |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 2 | operational |

---

### 65 — Varistors / Metal Oxide Varistors (MOVs) (4 products, sampled 4)

**Coverage**: 5 of 16 rules covered (31%) | 9 raw params mapped | 0 unmapped | 11 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| V(1mA)(V) | `varistor_voltage` | 10 | identity | 4/4 (100%) | 18~1100, 18~820 |
| VDC(V) | `max_continuous_voltage` | 9 | threshold (gte) | 4/4 (100%) | 14~895, 14~670 |
| VC(V) | `clamping_voltage` | 9 | threshold (lte) | 4/4 (100%) | 36~1815, 36~1355 |
| IP(A) | `peak_surge_current` | 8 | threshold (gte) | 4/4 (100%) | 5~25, 2.5~10 |
| 8/20us(A) | `peak_surge_current` | 8 | threshold (gte) | 4/4 (100%) | 500~3500, 250~1750 |
| 10/1000μs(J) | `energy_rating` | 8 | threshold (gte) | 4/4 (100%) | 2.1~155, 0.9~73 |
| Diameter | `_disc_diameter` | — | *(no rule)* | 4/4 (100%) | Φ10mm, Φ 7mm |
| VAC(V) | `_max_ac_voltage` | — | *(no rule)* | 4/4 (100%) | 11~680, 11~510 |
| Rated Power(W) | `_rated_power` | — | *(no rule)* | 4/4 (100%) | 0.05~0.4, 0.02~0.25 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `package_case` | Package / Form Factor | 10 | identity |
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
| 阻值 | `resistance` | 10 | identity | 100/100 (100%) | 5.1Ω, 200mΩ |
| 封装 | `package_case` | 10 | identity | 100/100 (100%) | 0603, 2512 |
| 功率 | `power_rating` | 9 | threshold (gte) | 100/100 (100%) | 100mW, 250mW |
| 精度 | `tolerance` | 7 | threshold (lte) | 100/100 (100%) | ±1%, ±5% |
| 工作温度范围 | `operating_temp` | 7 | threshold (range_superset) | 57/100 (57%) | -55℃~+125℃, -55℃~+170℃ |
| 温度系数 | `tcr` | 6 | threshold (lte) | 91/100 (91%) | ±200ppm/℃, ±100ppm/℃ |
| 电阻类型 | `composition` | 5 | identity_upgrade | 79/100 (79%) | 厚膜电阻, 采样电阻 |

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
| 封装 | `package_case` | 10 | identity | 100/100 (100%) | 2520, SMD,1.3x1mm |
| 电感值 | `inductance` | 10 | identity | 85/100 (85%) | 220nH, 0.8nH |
| 额定电流 | `rated_current` | 9 | threshold (gte) | 81/100 (81%) | 1.9A, 850mA |
| 饱和电流(Isat) | `saturation_current` | 9 | threshold (gte) | 59/100 (59%) | 2.16A, 4.3A |
| 直流电阻(DCR) | `dcr` | 7 | threshold (lte) | 83/100 (83%) | 60mΩ, 100mΩ |
| 精度 | `tolerance` | 6 | threshold (lte) | 99/100 (99%) | ±20%, ±2% |
| 自谐振频率 | `srf` | 5 | threshold (gte) | 33/100 (33%) | 4.5GHz |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Q值 | 21/100 (21%) | 4@100MHz, 5@100MHz |
| 车规等级 | 7/100 (7%) | AEC-Q200 |

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
| 封装 | `package_case` | 10 | identity | 16/16 (100%) | SMD, SMD-4P,2.5x2mm |
| 输出电压 | `output_voltage` | — | *(no rule)* | 8/16 (50%) | 1V~5V, 0.8V~4V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 转换效率 | 16/16 (100%) | 转换效率, 95% |
| 转换类型 | 16/16 (100%) | 转换类型, DC-DC |
| 输入电压(DC) | 8/16 (50%) | 4.5V~17V, 2.7V~5.5V |
| 输出电流(最大值) | 8/16 (50%) | 1A, 3A |
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

**Coverage**: 9 of 24 rules covered (38%) | 66 raw params mapped | 20 unmapped | 15 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 100/100 (100%) | SOT353,SOT23-5, SOP8,MSOP8 |
| CH | `channels` | 10 | identity | 87/100 (87%) | 1, 2 |
| GBWP(MHz) | `gain_bandwidth` | 8 | threshold (gte) | 34/100 (34%) | 10, 1.6 |
| GBWP | `gain_bandwidth` | 8 | threshold (gte) | 22/100 (22%) | 18 kHz, 10 kHz |
| Output Type | `output_type` | 8 | identity | 16/100 (16%) | Analog, Push-Pull |
| GBWP(MHz)(Typ.) | `gain_bandwidth` | 8 | threshold (gte) | 9/100 (9%) | 0.009, 0.1 |
| BW(MHz) | `gain_bandwidth` | 8 | threshold (gte) | 4/100 (4%) | 250 |
| BW (MHz) | `gain_bandwidth` | 8 | threshold (gte) | 1/100 (1%) | 3 |
| Slew Rate(V/μs) | `slew_rate` | 7 | threshold (gte) | 58/100 (58%) | 0.7, 4.5 |
| tPD- | `response_time` | 7 | threshold (lte) | 14/100 (14%) | 10 ns, 110 ns |
| tPD+ | `response_time` | 7 | threshold (lte) | 10/100 (10%) | 10 ns, 120 ns |
| Slew Rate(V/μs)(Typ.) | `slew_rate` | 7 | threshold (gte) | 9/100 (9%) | 0.003, 0.02 |
| Slew Rate | `slew_rate` | 7 | threshold (gte) | 4/100 (4%) | 10 mV/μs, 6 mV/μs |
| CMRR(dB) | `cmrr` | 5 | threshold (gte) | 6/100 (6%) | 130, 127 |
| CMRR (db, Min) | `cmrr` | 5 | threshold (gte) | 1/100 (1%) | 80 |
| VDD(V) | `_supply_voltage` | — | *(no rule)* | 70/100 (70%) | 2.5~6.0, 2.7~5.5 |
| IBIAS(pA) | `ibias` | — | *(no rule)* | 59/100 (59%) | 1, 10 |
| VOS TC(µV/°C) | `vos_drift` | — | *(no rule)* | 49/100 (49%) | 0.5, 0.4 |
| VOS(max)(mV) | `vos` | — | *(no rule)* | 43/100 (43%) | 1, 3 |
| Rail-Rail | `rail_to_rail` | — | *(no rule)* | 39/100 (39%) | In/Out |
| eN@1kHz ( nV/√Hz ) | `_en` | — | *(no rule)* | 25/100 (25%) | 38, 10 |
| VOS(max) | `vos` | — | *(no rule)* | 24/100 (24%) | 1.5, 3 |
| eN@1kHz( nV/√Hz ) | `_en` | — | *(no rule)* | 22/100 (22%) | 170, 265 |
| IQ(Typ.)(per CH) | `supply_current` | — | *(no rule)* | 18/100 (18%) | 600 nA, 300 nA |
| IQ(Typ.)(per CH)(μA) | `supply_current` | — | *(no rule)* | 18/100 (18%) | 80, 600 |
| IQ(Max.)(per CH)(μA) | `supply_current` | — | *(no rule)* | 18/100 (18%) | 130, 900 |
| IQ(Max.)(per CH) | `supply_current` | — | *(no rule)* | 14/100 (14%) | 800 nA, 500 nA |
| IOUT(mA) | `_iout` | — | *(no rule)* | 12/100 (12%) | 130, 100 |
| Hyst.(mV) | `_hysteresis` | — | *(no rule)* | 12/100 (12%) | 7, 6 |
| Supply Voltage(V)(Min) | `_supply_voltage_min` | — | *(no rule)* | 9/100 (9%) | 1.7, 2.7 |
| Supply Voltage(V)(Max) | `_supply_voltage_max` | — | *(no rule)* | 9/100 (9%) | 3.6, 5.5 |
| Sink/Source Current(mA)(Typ.) | `_iout` | — | *(no rule)* | 9/100 (9%) | 25, 60 |
| VOS(mV)(Max) | `vos` | — | *(no rule)* | 9/100 (9%) | 0.02, 0.0075 |
| VOS TC(μV/℃)(Typ.) | `vos_drift` | — | *(no rule)* | 9/100 (9%) | 0.01, 1 |
| IB(pA)(Typ.) | `ibias` | — | *(no rule)* | 9/100 (9%) | 20, 50 |
| eN@1kHz(nV/√Hz)(Typ.) | `_en` | — | *(no rule)* | 9/100 (9%) | 320, 100 |
| Open Loop Gain(dB)(Typ.) | `_avol` | — | *(no rule)* | 9/100 (9%) | 125, 150 |
| IQ(Typ.)(per CH)(mA) | `supply_current` | — | *(no rule)* | 8/100 (8%) | 1.4, 0.19 |
| VN@0.1Hz to 10Hz(μVPP) | `_vn_pp` | — | *(no rule)* | 8/100 (8%) | 3.1, 3.2 |
| eN@1kHz(nV/√Hz) | `_en` | — | *(no rule)* | 8/100 (8%) | 8.2, 13 |
| Iq per Channel(μA)(Max) | `supply_current` | — | *(no rule)* | 8/100 (8%) | 0.79, 15 |
| VOS(max)(μV) | `vos` | — | *(no rule)* | 6/100 (6%) | 10, 5 |
| VOS TC (µV/°C) | `vos_drift` | — | *(no rule)* | 6/100 (6%) | 0.008, 0.006 |
| IQ(Typ.)(1 Channel)(mA) | `supply_current` | — | *(no rule)* | 4/100 (4%) | 6.5 |
| Gmin(V/V) | `_gmin` | — | *(no rule)* | 4/100 (4%) | 1 |
| eN@1MHz ( nV/√Hz ) | `_en_1mhz` | — | *(no rule)* | 4/100 (4%) | 6.3 |
| Rail-Rail In | `rail_to_rail` | — | *(no rule)* | 4/100 (4%) | Yes |
| Rail-Rail Out | `rail_to_rail` | — | *(no rule)* | 4/100 (4%) | Yes |
| VDD (V) | `_supply_voltage` | — | *(no rule)* | 4/100 (4%) | 4.5~36, 4.5~5.5 |
| Insulation Rating(Vrms) | `_isolation` | — | *(no rule)* | 4/100 (4%) | 5000, 3750 |
| IQ (mA, Max) | `supply_current` | — | *(no rule)* | 2/100 (2%) | 2, 10 |
| Common Mode Voltage  (V) | `_vicm` | — | *(no rule)* | 2/100 (2%) | -0.3~36, 0~70 |
| IQ (µA, Typ.) | `supply_current` | — | *(no rule)* | 2/100 (2%) | 120, 1000 |
| Ib (µA, Typ.) | `ibias` | — | *(no rule)* | 2/100 (2%) | 35, 100 |
| VOS  (µV, max) | `vos` | — | *(no rule)* | 2/100 (2%) | 100, 500 |
| VOS TC  (µV/°C, Max) | `vos_drift` | — | *(no rule)* | 2/100 (2%) | 0.5 |
| Gain Drift (ppm/℃, Max) | `_gain_drift` | — | *(no rule)* | 2/100 (2%) | 10, 5 |
| VOS  (mV, Max) | `vos` | — | *(no rule)* | 1/100 (1%) | 0.3 |
| VOS TC  (µV/°C, Typ.) | `vos_drift` | — | *(no rule)* | 1/100 (1%) | 2 |
| Common Mode Voltage at VDD=30V (V) | `_vicm` | — | *(no rule)* | 1/100 (1%) | -60 ~ +57 |
| Gain (V/V) | `_gain` | — | *(no rule)* | 1/100 (1%) | 1 |
| Gain Error (%, Max) | `_gain_error` | — | *(no rule)* | 1/100 (1%) | 0.05 |
| IQ(μA,Typ.) | `supply_current` | — | *(no rule)* | 1/100 (1%) | 220 |
| Ib(pA,Typ.) | `ibias` | — | *(no rule)* | 1/100 (1%) | 50 |
| VOS(mV,max) | `vos` | — | *(no rule)* | 1/100 (1%) | 4 |
| VOS TC(μV/℃,Typ.) | `vos_drift` | — | *(no rule)* | 1/100 (1%) | 2 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 92/100 (92%) | Production, Preview |
| Resolution | 9/100 (9%) | 480i, 576i, 720p, 1080i |
| Channel | 9/100 (9%) | 1-SD, 3-SD |
| VDD (V) | 9/100 (9%) | 3.0~5.5, 3.0-5.5 |
| Quiescent Current @3.3V (mA) | 9/100 (9%) | 3.8, 11.6 |
| Voltage Gain (dB) | 9/100 (9%) | 6 |
| Stop-Band Rejection  @27MHz (dB) | 9/100 (9%) | 51.2, 31.1dB @74.25MHz |
| Diff. Gain (%) | 9/100 (9%) | 0.4, 0.2 |
| Diff. Phase (Deg) | 9/100 (9%) | 0.7, 0.4 |
| THD (%) | 9/100 (9%) | 0.1, 0.3 |
| VDD  (V) | 4/100 (4%) | 1.8~6.0 |
| Topology | 4/100 (4%) | VFA |
| Gain | 4/100 (4%) | 8, 41 |
| Input Voltage Range | 4/100 (4%) | 250mV, 50mV |
| Output | 4/100 (4%) | Differential, Single End |
| Input Current Range | 1/100 (1%) | 1nA to 12mA |
| Logarithmic Slope (mV/dec, Typ.) | 1/100 (1%) | 200 |
| Law Conformance Error (dB, Max.) | 1/100 (1%) | 0.25 at Input>10nA |
| Reference Output(V,Typ.) | 1/100 (1%) | 2.5 |
| Reference Accuracy(%,Max) | 1/100 (1%) | 1%, 0.4% |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `input_type` | Input Stage Technology (CMOS / JFET / Bipolar) | 9 | identity_upgrade |
| `vicm_range` | Input Common-Mode Voltage Range (VICM) | 9 | threshold (range_superset) |
| `rail_to_rail_input` | Rail-to-Rail Input (RRI) | 8 | identity_flag |
| `rail_to_rail_output` | Rail-to-Rail Output (RRO) | 8 | identity_flag |
| `min_stable_gain` | Minimum Stable Gain (V/V) | 8 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `input_offset_voltage` | Input Offset Voltage Vos (Max) | 7 | threshold (lte) |
| `input_bias_current` | Input Bias Current Ib (Max) | 7 | threshold (lte) |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `input_noise_voltage` | Input Noise Voltage Density en (nV/√Hz) | 6 | threshold (lte) |
| `output_current` | Output Current Drive (Short-Circuit) | 6 | threshold (gte) |
| `avol` | Open-Loop Voltage Gain Avol (dB) | 5 | threshold (gte) |
| `psrr` | Power Supply Rejection Ratio PSRR (dB) | 5 | threshold (gte) |
| `iq` | Quiescent Current per Channel (Iq) | 5 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C7 — Interface ICs (RS-485, CAN, I2C, USB) (72 products, sampled 72)

**Coverage**: 6 of 22 rules covered (27%) | 26 raw params mapped | 3 unmapped | 16 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Protocol | `protocol` | 10 | identity | 19/72 (26%) | LIN, CAN, CAN FD |
| Max Data Rate(Mbps) | `data_rate` | 9 | threshold (gte) | 48/72 (67%) | 150, 0.5 |
| Data Rate (Max)(kBPS) | `data_rate` | 9 | threshold (gte) | 20/72 (28%) | 400000, 200000 |
| Max Data Rate(Kbps) | `data_rate` | 9 | threshold (gte) | 4/72 (6%) | 20 |
| Bus Fault Protection Voltage | `bus_fault_protection` | 8 | threshold (gte) | 17/72 (24%) | 42V, -42V to +42V |
| Bus Fault Protection Voltage(V) | `bus_fault_protection` | 8 | threshold (gte) | 4/72 (6%) | -45 to +45 |
| Operating Temperature Range(℃) | `operating_temp` | 7 | threshold (range_superset) | 20/72 (28%) | -40 to +85, -40 to +125 |
| Package | `package_case` | 5 | application_review | 72/72 (100%) | WSOP16,WSOP8,SOP8, WSOP16,SOP16,QSOP16 |
| IEC-61000-4-2 Contact(kV) | `esd_rating` | — | *(no rule)* | 39/72 (54%) | 8, 15 |
| Surge Voltage Capability(Vpk) | `_surge_rating` | — | *(no rule)* | 33/72 (46%) | 10000 |
| CMTI(kV/μs)(Static) | `_cmti` | — | *(no rule)* | 33/72 (46%) | 200 |
| CMTI(kV/μs)(Dynamic) | `_cmti_dynamic` | — | *(no rule)* | 33/72 (46%) | 150 |
| Isolation Rating(Vrms) | `_isolation_rating` | — | *(no rule)* | 31/72 (43%) | 5000 |
| Nubmer of Channel | `_channels` | — | *(no rule)* | 25/72 (35%) | 2, 3 |
| Forward/Reverse Channels | `_reverse_channels` | — | *(no rule)* | 25/72 (35%) | 2/0, 2/1 |
| Default Output | `_default_output` | — | *(no rule)* | 25/72 (35%) | High/Low |
| Drivers Per Package | `_drivers` | — | *(no rule)* | 20/72 (28%) | 0, 1 |
| Receivers Per Package | `_receivers` | — | *(no rule)* | 20/72 (28%) | 4, 1 |
| VCC (Min)(V) | `_supply_voltage` | — | *(no rule)* | 20/72 (28%) | 3 |
| VCC(Max)(V) | `_supply_voltage` | — | *(no rule)* | 20/72 (28%) | 3.6, 5.5 |
| ICC(Max)(mA) | `_icc` | — | *(no rule)* | 20/72 (28%) | 20, 24 |
| ESD HBM(kV) | `esd_rating` | — | *(no rule)* | 20/72 (28%) | 8, 18 |
| VCC(V) | `_supply_voltage` | — | *(no rule)* | 15/72 (21%) | 4.5~5.5 |
| Mode | `_operating_mode` | — | *(no rule)* | 4/72 (6%) | Half/Full Duplex |
| VBAT(V) | `_vbat` | — | *(no rule)* | 4/72 (6%) | 5.5~40 |
| Isolation Rating(V rms) | `_isolation_rating` | — | *(no rule)* | 2/72 (3%) | 3750 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 65/72 (90%) | Production, Preview |
| Feature | 19/72 (26%) | Sleep, Sleep, INH, WAKE |
| Clock Direction | 2/72 (3%) | Bidirection, Single Direction |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `operating_mode` | Operating Mode / Driver Topology | 9 | identity |
| `de_polarity` | Driver Enable / Direction Control Polarity | 8 | identity |
| `isolation_type` | Galvanic Isolation Type | 8 | identity_flag |
| `can_variant` | CAN Standard Variant / USB Speed Grade | 8 | identity_flag |
| `txd_dominant_timeout` | TXD Dominant Timeout / Bus Watchdog | 7 | identity_flag |
| `isolation_working_voltage` | Isolation Working Voltage (VIORM) | 7 | threshold (gte) |
| `esd_bus_pins` | ESD Rating — Bus Pins | 7 | threshold (gte) |
| `receiver_threshold_cm` | Input Receiver Threshold & Common-Mode Range | 7 | threshold (range_superset) |
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

**Coverage**: 7 of 22 rules covered (32%) | 10 raw params mapped | 1 unmapped | 15 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 40/40 (100%) | DFN3X3-10, SOT23-3,SOT23-5,SOT89-3 |
| Maximum Output Current(mA) | `iout_max` | 9 | threshold (gte) | 40/40 (100%) | ±3000, 400 |
| Input Voltage(V) | `vin_max` | 8 | threshold (gte) | 40/40 (100%) | 2.375~5.5, 2.4~6.0 |
| Accuracy(max) | `vout_accuracy` | 7 | threshold (lte) | 40/40 (100%) | ±25mV, ±3% |
| Dropout(mV) | `vdropout` | 7 | threshold (lte) | 22/40 (55%) | 350, 200 |
| Dropput(mV) | `vdropout` | 7 | threshold (lte) | 14/40 (35%) | 720, 250 |
| PSRR(dB) | `psrr` | 6 | application_review | 36/40 (90%) | 54, 60 |
| Iq(mA) | `iq` | 5 | threshold (lte) | 35/40 (88%) | 0.8, 0.0014 |
| Temperature Range (°C) | `operating_temp` | — | *(no rule)* | 40/40 (100%) | -40 to +125, -40 to +150 |
| Noise(μVRMS) | `_noise` | — | *(no rule)* | 36/40 (90%) | 90, 40 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 38/40 (95%) | Production, Preview |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `output_type` | Output Type (Fixed / Adjustable / Tracking / Negative) | 10 | identity |
| `output_voltage` | Output Voltage Vout | 10 | identity |
| `polarity` | Polarity (Positive / Negative) | 10 | identity |
| `output_cap_compatibility` | Output Capacitor ESR Compatibility (Ceramic Stable) | 8 | identity_flag |
| `enable_pin` | Enable Pin (Active High / Active Low / Absent) | 8 | identity |
| `aec_q100` | AEC-Q100 Qualification | 8 | identity_flag |
| `vin_min` | Minimum Input Voltage (Vin Min / Dropout) | 7 | threshold (lte) |
| `tj_max` | Maximum Junction Temperature (Tj Max) | 7 | threshold (gte) |
| `power_good` | Power-Good / Flag Pin | 6 | identity_flag |
| `thermal_shutdown` | Thermal Shutdown | 6 | identity_flag |
| `rth_ja` | Thermal Resistance (Rθja / Rθjc) | 6 | threshold (lte) |
| `load_regulation` | Load Regulation (ΔVout / ΔIout) | 5 | threshold (lte) |
| `soft_start` | Soft-Start | 5 | identity_flag |
| `line_regulation` | Line Regulation (ΔVout / ΔVin) | 4 | threshold (lte) |
| `packaging` | Packaging Format (Tape/Reel, Tube, Tray) | 1 | operational |

---

### C2 — Switching Regulators (DC-DC Converters & Controllers) (34 products, sampled 34)

**Coverage**: 4 of 22 rules covered (18%) | 6 raw params mapped | 1 unmapped | 18 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Package | `package_case` | 10 | identity | 34/34 (100%) | ESOP8,DFN4X4-8,DFN3X3-8, ESOP8 |
| Max Output Current(A) | `iout_max` | 9 | threshold (gte) | 34/34 (100%) | 1, 3.5 |
| Control Mode | `control_mode` | 9 | identity | 26/34 (76%) | Constant On-time, Peak Current Mode |
| VIN(V) | `vin_max` | 8 | threshold (gte) | 34/34 (100%) | 4.5~100, 4.5~60 |
| Temperature Range(℃) | `operating_temp` | — | *(no rule)* | 34/34 (100%) | -40 to +125 |
| Output(V) | `_output_voltage` | — | *(no rule)* | 34/34 (100%) | 1.225~100, 0.8~60 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 31/34 (91%) | Preview, Production |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `topology` | Topology (Buck / Boost / Buck-Boost / Flyback / Forward / SEPIC / Inverting / Resonant) | 10 | identity |
| `architecture` | Architecture (Integrated Switch / Controller-Only / Half-Bridge / Full-Bridge) | 10 | identity |
| `output_polarity` | Output Polarity (Positive / Negative / Isolated) | 10 | identity |
| `vref` | Feedback Reference Voltage (Vref) | 9 | vref_check |
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

**Coverage**: 4 of 20 rules covered (20%) | 13 raw params mapped | 1 unmapped | 16 rules missing

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
| Isolation Rating(Vrms) | `_isolation_rating` | — | *(no rule)* | 5/20 (25%) | 5700 |
| Peak Output Current(A) | `output_peak_current` | — | *(no rule)* | 5/20 (25%) | 5/5 |
| Output Voltage Max(V) | `_vout_max` | — | *(no rule)* | 5/20 (25%) | 40 |
| Output Voltage Min(V) | `_vout_min` | — | *(no rule)* | 5/20 (25%) | 14 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 17/20 (85%) | Preview, Production |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `isolation_type` | Isolation Type (Non-Isolated Bootstrap / Transformer / Optocoupler / Digital Isolator) | 10 | identity |
| `output_polarity` | Output Polarity (Non-Inverting / Inverting) | 9 | identity_flag |
| `input_logic_threshold` | Input Logic Threshold (VDD-referenced / 3.3V / 5V / Differential) | 8 | identity |
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

**Coverage**: 7 of 23 rules covered (30%) | 11 raw params mapped | 5 unmapped | 16 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| CH | `gate_count` | 10 | identity | 15/15 (100%) | 1, 2 |
| Package | `package_case` | 10 | identity | 15/15 (100%) | SOP16,TSSOP16,QFN3X3-16, SOP16,QFN3X3-16 |
| VDD(V) | `supply_voltage` | 8 | threshold (range_superset) | 15/15 (100%) | 3~12, 3~16 |
| VIH(Min)(V) | `vih` | 7 | threshold (lte) | 15/15 (100%) | 2, 1.5 |
| tON(ns) | `tpd` | 7 | threshold (lte) | 15/15 (100%) | 60, 320 |
| VIL(Max)(V) | `vil` | 6 | threshold (gte) | 15/15 (100%) | 0.8, 0.5 |
| Leakage Current(nA) | `input_leakage` | 4 | threshold (lte) | 15/15 (100%) | 100, 10 |
| Switch Config | `_switch_config` | — | *(no rule)* | 15/15 (100%) | 8:01, 4:01 |
| BW(MHz) | `_bandwidth` | — | *(no rule)* | 15/15 (100%) | 200, 100 |
| Ron(Ω) | `_ron` | — | *(no rule)* | 15/15 (100%) | 120, 10 |
| tOFF(ns) | `_toff` | — | *(no rule)* | 15/15 (100%) | 50, 130 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 15/15 (100%) | Production |
| Input Range | 15/15 (100%) | VEE to VDD, 0V to VDD |
| IQ(Typ.)(1 Channel)(μA) | 15/15 (100%) | 8, 1 |
| Latch up(mA) | 15/15 (100%) | 150, 800 |
| VEE(V) | 4/15 (27%) | -6~0, -8~0 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `logic_function` | Logic Function (Part Number Suffix) | 10 | identity |
| `oe_polarity` | 3-State Output Enable (OE) Polarity | 9 | identity_flag |
| `output_type` | Output Type (Totem-pole / Open-drain / 3-state) | 8 | identity_flag |
| `aec_q100` | AEC-Q100 Automotive Qualification | 8 | identity_flag |
| `voh` | Output High Voltage (VOH) | 7 | threshold (gte) |
| `drive_current` | Output Drive Current (IOH / IOL) | 7 | threshold (gte) |
| `schmitt_trigger` | Schmitt Trigger Input | 7 | identity_flag |
| `logic_family` | Logic Family (HC / HCT / AC / ACT / LVC / AHC / ALVC / AUP) | 7 | application_review |
| `operating_temp` | Operating Temperature Range | 7 | threshold (range_superset) |
| `vol` | Output Low Voltage (VOL) | 6 | threshold (lte) |
| `fmax` | Maximum Operating Frequency (fmax) | 6 | threshold (gte) |
| `setup_hold_time` | Setup Time / Hold Time (tsu / th) | 6 | application_review |
| `bus_hold` | Bus Hold / Weak Pull-up | 5 | identity_flag |
| `input_clamp_diodes` | Input Clamp Diodes | 4 | identity_flag |
| `transition_time` | Output Transition Time (tr / tf) | 4 | application_review |
| `packaging` | Packaging Format (Tape & Reel / Tube / Tray) | 1 | operational |

---

### C9 — ADCs — Analog-to-Digital Converters (14 products, sampled 14)

**Coverage**: 8 of 20 rules covered (40%) | 24 raw params mapped | 11 unmapped | 12 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Resolution | `resolution_bits` | 10 | identity | 1/14 (7%) | 10 |
| CH'' | `channel_count` | 8 | threshold (gte) | 10/14 (71%) | 4, 8 |
| CH | `channel_count` | 8 | threshold (gte) | 1/14 (7%) | 1 |
| INL(LSB,Max) | `inl_lsb` | 7 | threshold (lte) | 10/14 (71%) | ±2, ±1.5 |
| DNL(LSB,Max) | `dnl_lsb` | 6 | threshold (lte) | 9/14 (64%) | ±1, (-1, 1.5) |
| DNL(LSB) | `dnl_lsb` | 6 | threshold (lte) | 1/14 (7%) | 0.3 |
| Package | `package_case` | 5 | application_review | 14/14 (100%) | WSOP8, LQFP10X10-64 |
| VDD(V)" | `supply_voltage` | — | *(no rule)* | 10/14 (71%) | 4.75~5.25, 2.7~5.5 |
| Offset Error(LSB, Max) | `_offset_error` | — | *(no rule)* | 10/14 (71%) | ±15, ±4 |
| Gain Error(LSB) | `_gain_error` | — | *(no rule)* | 10/14 (71%) | ±15, ±3 |
| Voltage Input Range(V) | `_input_range` | — | *(no rule)* | 10/14 (71%) | ±5, ±10, 0.~2.5, 0~5 |
| IDD(mA) | `_idd` | — | *(no rule)* | 10/14 (71%) | 52, 1.65 |
| Temperature Range(℃) | `operating_temp` | — | *(no rule)* | 10/14 (71%) | -40 to +125 |
| Speed(Msps) | `sampling_rate` | — | *(no rule)* | 10/14 (71%) | 0.35, 0.2 |
| Clock Source | `_clock_source` | — | *(no rule)* | 2/14 (14%) | External, Internal |
| Insulation Rating(Vrms) | `_isolation_rating` | — | *(no rule)* | 2/14 (14%) | 5000 |
| Interface | `interface` | — | *(no rule)* | 2/14 (14%) | Parallel, SPI |
| VDD(V) | `supply_voltage` | — | *(no rule)* | 2/14 (14%) | 2.7~5.5 |
| SINAD(dB) | `_sinad` | — | *(no rule)* | 1/14 (7%) | 56.5 |
| Update Rate(MSPS) | `sampling_rate` | — | *(no rule)* | 1/14 (7%) | 50 |
| VIN(V) | `_vin` | — | *(no rule)* | 1/14 (7%) | 0~2 |
| Datum | `_reference` | — | *(no rule)* | 1/14 (7%) | Internal |
| Power(mW) | `_power` | — | *(no rule)* | 1/14 (7%) | 84 |
| VREF | `_vref` | — | *(no rule)* | 1/14 (7%) | Internal/External |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Resolution'’ | 10/14 (71%) | 16, 12 |
| Status | 8/14 (57%) | Preview, Production |
| Input Voltage Range | 2/14 (14%) | 250mV |
| Output | 2/14 (14%) | Differential |
| ADC Channel | 1/14 (7%) | 8 |
| ADC Resolution | 1/14 (7%) | 12bit |
| DAC Channel | 1/14 (7%) | 8 |
| DAC Resolution | 1/14 (7%) | 12bit |
| GPIO Number | 1/14 (7%) | 8 |
| Temperature Sensor | 1/14 (7%) | Internal |
| VDDIO(V) | 1/14 (7%) | 1.8~5.5 |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `interface_type` | Interface Type | 9 | identity |
| `input_configuration` | Input Configuration | 9 | identity |
| `sample_rate_sps` | Sample Rate (SPS) | 8 | threshold (gte) |
| `enob` | Effective Number of Bits (ENOB) | 7 | threshold (gte) |
| `reference_type` | Reference Type | 7 | identity_flag |
| `supply_voltage_range` | Supply Voltage Range (V) | 7 | threshold (range_superset) |
| `operating_temp_range` | Operating Temperature Range (°C) | 7 | threshold (range_superset) |
| `thd_db` | Total Harmonic Distortion (dBc) | 6 | threshold (lte) |
| `conversion_latency_cycles` | Conversion Latency (cycles) | 6 | threshold (lte) |
| `reference_voltage` | Internal Reference Voltage (V) | 5 | application_review |
| `power_consumption_mw` | Power Consumption (mW) | 5 | threshold (lte) |
| `aec_q100` | AEC-Q100 Qualification | 4 | identity_flag |

---

### C6 — Voltage References (12 products, sampled 12)

**Coverage**: 5 of 19 rules covered (26%) | 17 raw params mapped | 1 unmapped | 14 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Output Voltage | `output_voltage` | 10 | identity | 7/12 (58%) | Adjustable(VREF to 36V), Fixed(2.048, 2.5, 3.0, 4.096, 5.0, 8.192, 10.0) |
| Accuracy | `initial_accuracy` | 8 | threshold (lte) | 7/12 (58%) | 0.5%, 0.1% |
| TC(ppm/℃) | `tc` | 8 | threshold (lte) | 7/12 (58%) | 50, 25 |
| Accuracy(max) | `initial_accuracy` | 8 | threshold (lte) | 5/12 (42%) | 0.05%, 0.15% |
| TC(-40 to 85℃)(ppm/℃) | `tc` | 8 | threshold (lte) | 5/12 (42%) | 5, 3 |
| TC(-40 to 125℃)(ppm/℃) | `tc` | 8 | threshold (lte) | 5/12 (42%) | 3, 6 |
| 0.1 to 10Hz Output Voltage Noise(uVpp) | `output_noise` | 6 | threshold (lte) | 5/12 (42%) | 2.5, 7.5 |
| 10 to 10kHz Voltage Noise(μVrms) | `output_noise` | 6 | threshold (lte) | 2/12 (17%) | 90 |
| Package | `package_case` | 5 | application_review | 12/12 (100%) | SOT23-G, SOP8 |
| Isink(min)(mA) | `_isink_min` | — | *(no rule)* | 7/12 (58%) | 0.6, 1 |
| Isink(max)(mA) | `_isink_max` | — | *(no rule)* | 7/12 (58%) | 80, 15 |
| Output Capacitor Load(μF) | `_cout_load` | — | *(no rule)* | 7/12 (58%) | Any Load, 0.1 to 100 |
| Vin(min)(V) | `_vin_min` | — | *(no rule)* | 5/12 (42%) | max(Ver+0.2, 3), max(Ver+0.05, 2.1) |
| Vin(max)(V) | `_vin_max` | — | *(no rule)* | 5/12 (42%) | 15, 5.5 |
| Iq(max)(μA) | `_iq` | — | *(no rule)* | 5/12 (42%) | 1700, 1000 |
| Line Regulation(max)(ppm/V) | `_line_reg` | — | *(no rule)* | 5/12 (42%) | 5, 20 |
| Load Regulation(max)(ppm/mA) | `_load_reg` | — | *(no rule)* | 5/12 (42%) | 20 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 9/12 (75%) | Production |

#### Missing Logic Table Rules

| attributeId | Attribute Name | Weight | Type |
|-------------|----------------|--------|------|
| `configuration` | Configuration (Series / Shunt) | 10 | identity |
| `adjustability` | Output Voltage Adjustability (Fixed / Adjustable / Trimmable) | 8 | identity |
| `enable_shutdown_polarity` | Enable/Shutdown Pin Polarity | 8 | identity |
| `architecture` | Reference Architecture (Band-gap / Buried Zener / XFET) | 7 | identity |
| `tc_accuracy_grade` | TC/Accuracy Grade (Suffix) | 7 | identity_flag |
| `dropout_voltage` | Dropout Voltage | 7 | threshold (lte) |
| `input_voltage_range` | Input Voltage Range | 7 | threshold (range_superset) |
| `operating_temp` | Operating Temperature Range | 6 | threshold (range_superset) |
| `quiescent_current` | Quiescent Current (Iq) | 5 | threshold (lte) |
| `output_current` | Output Current / Load Current Capability | 5 | threshold (gte) |
| `long_term_stability` | Long-Term Stability (ppm/1000h) | 4 | threshold (lte) |
| `nr_pin` | Output Noise Filtering (NR Pin) | 4 | application_review |
| `aec_q100` | AEC-Q100 Automotive Qualification | 3 | identity_flag |
| `packaging` | Packaging Format (Tape & Reel / Cut Tape / Bulk) | 1 | operational |

---

### C10 — DACs — Digital-to-Analog Converters (11 products, sampled 11)

**Coverage**: 5 of 22 rules covered (23%) | 21 raw params mapped | 1 unmapped | 17 rules missing

#### Mapped Attributes

| Raw Name (MFR) | attributeId | Weight | Rule Type | Frequency | Sample Value |
|----------------|-------------|--------|-----------|-----------|--------------|
| Resolution | `resolution_bits` | 10 | identity | 10/11 (91%) | 12, 14 |
| Resolution' | `resolution_bits` | 10 | identity | 1/11 (9%) | 10 |
| CH | `channel_count` | 7 | threshold (gte) | 10/11 (91%) | 1, 4 |
| INL | `inl_lsb` | 7 | threshold (lte) | 10/11 (91%) | ±2, ±8 |
| DNL(LSB, Max) | `dnl_lsb` | 7 | threshold (lte) | 10/11 (91%) | ±1 |
| INL(LSB) | `inl_lsb` | 7 | threshold (lte) | 1/11 (9%) | 0.5 |
| CH' | `channel_count` | 7 | threshold (gte) | 1/11 (9%) | 1 |
| DNL(LSB) | `dnl_lsb` | 7 | threshold (lte) | 1/11 (9%) | 0.25 |
| Package | `package_case` | 5 | application_review | 11/11 (100%) | MSOP8, TSSOP16 |
| VDD(V) | `_supply_voltage` | — | *(no rule)* | 10/11 (91%) | 2.7~5.5 |
| Offset Error(mV, Max) | `_offset_error` | — | *(no rule)* | 10/11 (91%) | ±30, ±0.17 |
| IDD(μA/CH, Max)(μA) | `_supply_current` | — | *(no rule)* | 10/11 (91%) | 80, 150 |
| Gain Error (% of FSR, Max) | `_gain_error` | — | *(no rule)* | 10/11 (91%) | ±0.3, ±0.011 |
| Voltage Output Range(V) | `_output_range` | — | *(no rule)* | 10/11 (91%) | 0~Vref |
| D to A Glitch Impulse(nV-sec) | `_glitch_impulse` | — | *(no rule)* | 10/11 (91%) | 2, 10 |
| Temp Range(℃) | `operating_temp` | — | *(no rule)* | 10/11 (91%) | -40 to +125, -40 to +105 |
| Update Rate(MSPS) | `_update_rate` | — | *(no rule)* | 1/11 (9%) | 125 |
| Datum | `_reference` | — | *(no rule)* | 1/11 (9%) | Internal, 1.10V |
| SFDR(dB) | `_sfdr` | — | *(no rule)* | 1/11 (9%) | 79 |
| VDD(V)' | `_supply_voltage` | — | *(no rule)* | 1/11 (9%) | 2.7~5.5 |
| Power(mW) | `_power` | — | *(no rule)* | 1/11 (9%) | 175 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| Status | 10/11 (91%) | Production |

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
| 封装/外壳 | `package_case` | 10 | identity | 99/100 (99%) | DFN2510-10, SOD923 |
| 极性 | `polarity` | 10 | identity | 92/100 (92%) | 单向, 双向 |
| 通道数 | `num_channels` | 10 | identity | 80/100 (80%) | 4, 1 |
| 反向断态电压 | `vrwm` | 10 | identity | 78/100 (78%) | 5V, 3.3V |
| 电源电压 | `vrwm` | 10 | identity | 40/100 (40%) | 7V, 5V |
| 击穿电压 V(BR)-min | `vbr` | 9 | identity | 86/100 (86%) | 6.8V, 5V |
| 功率-峰值脉冲 | `ppk` | 9 | threshold (gte) | 63/100 (63%) | 80W, 150W |
| 峰值脉冲电流(Ipp) | `ipp` | 8 | threshold (gte) | 89/100 (89%) | 4.5A, 7A |
| 结电容 | `cj` | 8 | threshold (lte) | 52/100 (52%) | 0.8pF, 14pF |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 87/100 (87%) | -55℃~+125℃, -55℃~+125℃(TJ) |
| 反向漏电流 IR | `ir_leakage` | 5 | threshold (lte) | 22/100 (22%) | 0.08μA, 0.06μA |
| 击穿电压Max | `_vbr_max` | — | *(no rule)* | 17/100 (17%) | 8.4V, 17V |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 最大工作电压 | 36/100 (36%) | 12V, 5V |

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
| 晶体管类型 | `channel_type` | 10 | identity | 21/44 (48%) | N沟道, 2个N沟道(双) |
| 击穿电压 | `vds_max` | 10 | threshold (gte) | 9/44 (20%) | 20V, 30V |
| 栅极源极击穿电压 | `vgs_max` | 8 | threshold (gte) | 19/44 (43%) | ±12V, ±8V |
| 充电电量 | `qg` | 8 | threshold (lte) | 4/44 (9%) | 12nC, 0.8nC |
| 反向传输电容Crss | `crss` | 7 | threshold (lte) | 9/44 (20%) | 10pF, 82pF |
| 功率耗散 | `pd` | 6 | threshold (gte) | 18/44 (41%) | 1.36W, 2W |
| 阈值电压 | `vgs_th` | 6 | application_review | 15/44 (34%) | 0.9V, 0.75V |
| 输入电容 | `ciss` | 6 | threshold (lte) | 14/44 (32%) | 702pF, 120pF |
| 工作温度 | `operating_temp` | — | *(no rule)* | 27/44 (61%) | -55℃~+150℃, +150℃(TJ) |
| 配置 | `_configuration` | — | *(no rule)* | 14/44 (32%) | 单路, 共漏 |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 不同 Id，Vgs时的 RdsOn(最大值) | 17/44 (39%) | 180mΩ, 200mΩ |
| 额定功率 | 12/44 (27%) | 1.36W, 280mW |
| 栅极电荷(Qg) | 10/44 (23%) | 4.8nC, 0.74nC |
| 漏极电流 | 5/44 (11%) | 1uA, 1µA |

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

**Coverage**: 5 of 22 rules covered (23%) | 5 raw params mapped | 14 unmapped | 17 rules missing

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
| 输出电压(最大值) | 5/16 (31%) | 18V, 12V |
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
| 封装/外壳 | `package_case` | 10 | identity | 15/15 (100%) | SOD923, SOD-123 |
| 反向耐压VR | `vrrm` | 10 | threshold (gte) | 12/15 (80%) | 30V, 100V |
| 平均整流电流 | `io_avg` | 10 | threshold (gte) | 12/15 (80%) | 200mA, 1A |
| 二极管配置 | `configuration` | 10 | identity | 11/15 (73%) | 单路 |
| 反向峰值电压(最大值) | `vrrm` | 10 | threshold (gte) | 2/15 (13%) | 100V, 40V |
| 正向压降VF | `vf` | 8 | threshold (lte) | 10/15 (67%) | 400mV, 1V |
| 正向压降VF Max | `vf` | 8 | threshold (lte) | 10/15 (67%) | 400mV, 1V |
| 反向恢复时间(trr) | `trr` | 8 | threshold (lte) | 3/15 (20%) | 4ns |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 11/15 (73%) | +125℃(TJ), +125℃ |
| Ifsm - 正向浪涌峰值电流 | `ifsm` | 7 | threshold (gte) | 6/15 (40%) | 500mA, 750mA |
| 反向漏电流IR | `ir_leakage` | 5 | threshold (lte) | 12/15 (80%) | 10µA, 5μA |
| 结电容 | `cj` | 4 | application_review | 1/15 (7%) | 8pF |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 二极管类型 | 4/15 (27%) | Schottky, Single |
| 总电容C | 3/15 (20%) | 8pF, 3pF |
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
| 封装/外壳 | `package_case` | 10 | identity | 4/4 (100%) | MSOP10_3.1X3.1MM, SOT-363 |
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
| 封装/外壳 | `package_case` | 5 | application_review | 2/2 (100%) | SOP-16, SOP-8 |

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
| 容值 | `capacitance` | 10 | identity | 99/100 (99%) | 150µF, 10µF |
| 额定电压 | `voltage_rated` | 9 | threshold (gte) | 99/100 (99%) | 450V, 400V |
| 纹波电流 | `ripple_current` | 8 | threshold (gte) | 47/100 (47%) | 184mA, 350mA |
| 不同温度时的使用寿命 | `lifetime` | 7 | threshold (gte) | 99/100 (99%) | 7000Hrs@105℃, 3000Hrs@105℃ |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 99/100 (99%) | -25℃~+105℃, -40℃~+105℃ |
| 等效串联电阻 | `esr` | 7 | threshold (lte) | 25/100 (25%) | 210mΩ, 520mΩ |
| 精度 | `tolerance` | 5 | threshold (lte) | 99/100 (99%) | ±20%, -40~0% |
| 漏泄电流 | `leakage_current` | 5 | threshold (lte) | 99/100 (99%) | 1000µA, 漏泄电流 |
| 封装/外壳 | `package_case` | — | *(no rule)* | 99/100 (99%) | 插件,D30xL30mm, 插件,D10xL16mm |
| 耗散因数 | `dissipation_factor` | — | *(no rule)* | 99/100 (99%) | 0.10, 0.20 |

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
| 容值 | `capacitance` | 10 | identity | 92/93 (99%) | 100µF, 560µF |
| 额定电压 | `voltage_rated` | 9 | threshold (gte) | 92/93 (99%) | 35V, 10V |
| 纹波电流 | `ripple_current` | 9 | threshold (gte) | 72/93 (77%) | 2.35A, 3.6A |
| 等效串联电阻 | `esr` | 9 | threshold (lte) | 72/93 (77%) | 50mΩ, 15mΩ |
| 工作温度 | `operating_temp` | 7 | threshold (range_superset) | 92/93 (99%) | -55℃~+105℃, -55℃~+125℃ |
| 精度 | `tolerance` | 5 | threshold (lte) | 92/93 (99%) | ±20% |
| 漏泄电流 | `leakage_current` | 5 | threshold (lte) | 33/93 (35%) | 700µA, 1120µA |
| 封装/外壳 | `package_case` | — | *(no rule)* | 93/93 (100%) | 插件,D6.3xL8mm, 插件,D8xL9mm |
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
| 输出类型 | `output_type` | 10 | identity | 45/100 (45%) | 固定, 可调 |
| 输出电压 | `output_voltage` | 10 | identity | 45/100 (45%) | 1.2V~5V, 5V |
| 输出电流 | `iout_max` | 9 | threshold (gte) | 100/100 (100%) | 500mA, 300mA |
| 最大输入电压 | `vin_max` | 8 | threshold (gte) | 45/100 (45%) | 10V, 40V |
| 压差 | `vdropout` | 7 | threshold (lte) | 1/100 (1%) | 280mV@(200mA) |
| 电源纹波抑制比(PSRR) | `psrr` | 6 | application_review | 5/100 (5%) | 40dB@(100Hz), 65dB@(1kHz) |
| 工作温度 | `operating_temp` | — | *(no rule)* | 5/100 (5%) | -40℃~+85℃@(Ta), -40℃~+85℃ |

#### Unmapped Raw Attributes

| Raw Name (MFR) | Frequency | Sample Values |
|----------------|-----------|---------------|
| 输出极性 | 45/100 (45%) | 正极 |
| 输出通道数 | 45/100 (45%) | 1 |
| 待机电流 | 17/100 (17%) | 1.2uA, 25uA |

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
| 封装 | `package_case` | 10 | identity | 23/23 (100%) | SOT-89-3L, SOT-89-3 |
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
