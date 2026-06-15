# Atlas Dict Mirror Audit

**Generated**: 2026-06-15
**Total drift entries** (one-sided keys across all dicts): **301**

Compares dict contents between [lib/services/atlasMapper.ts](../../lib/services/atlasMapper.ts) and [scripts/atlas-ingest.mjs](../../scripts/atlas-ingest.mjs).

Per Decision #174 mirror discipline, both files MUST stay byte-equivalent in dict content. Drift means silently-failed ingest mappings.

## FAMILY_PARAMS

### ✓ 12 — TS=8, mjs=8

No drift.

### ✓ 52 — TS=8, mjs=8

No drift.

### ✓ 58 — TS=10, mjs=10

No drift.

### ✓ 59 — TS=9, mjs=9

No drift.

### ✓ 60 — TS=9, mjs=9

No drift.

### ✓ 65 — TS=23, mjs=23

No drift.

### ✓ 66 — TS=26, mjs=26

No drift.

### ✓ 67 — TS=11, mjs=11

No drift.

### ✓ 69 — TS=14, mjs=14

No drift.

### ✓ 70 — TS=11, mjs=11

No drift.

### ✓ 71 — TS=25, mjs=25

No drift.

### ⚠ B1 — TS=76, mjs=139

**Only in TS (1):**

- `qc (nc)`

**Only in mjs (64):**

- `electrical parameters vrrm`
- `electrical parameters vr`
- `electrical parameters if`
- `electrical parameters vf@if`
- `electrical parameters ifsm(a)`
- `electrical parameters trr@rg-1`
- `electrical parameters ir`
- `vf_max(v)`
- `vf@if(v)`
- `vfm@if(v)`
- `vfm@if tj=25℃(v)`
- `vf@iftj=125℃(v)`
- `forward voltage(v)`
- `forward  voltage vf(v)`
- `io_max(a)`
- `rated lo(a)`
- `if (a)`
- `if(av) d=0.5tc=110℃ (a)`
- `if(av)d=0.5tc=125℃(a)`
- `if(av)@tc(a)`
- `iftj=125℃(a)`
- `vr(v)`
- `vr (v)`
- `vrm(v)`
- `vrm (v)`
- `vrm_max(v)`
- `vrm_max (v)`
- `ifsm_max(a)`
- `ifsm 10ms(a)`
- `ifsm10ms(a)`
- `ifsmt=10mstj=45℃(a)`
- `ifsmt=8.3mstj=45℃(a)`
- `itsm10ms(a)`
- `forward surge current ifsm(a)`
- `ir@25℃ir(ua)`
- `ir@25℃ir(ma)`
- `ir@100℃ir(ua)`
- `ir@100℃ir(ma)`
- `ir@125℃ir(ua)`
- `ir@125℃ir(ma)`
- `ir@vr(μa)`
- `ir(μa)`
- `ir (ua)`
- `irm(μa)`
- `reverse leakage current ir(ua)`
- `trr_max(ns)`
- `trr @rg_1(ns)`
- `cj(pf)`
- `cj _typ(pf)`
- `rθja(℃/w)`
- `rth(j-c)(℃/w)`
- `rth(j-c) (℃/w)`
- `thermal resistance rthj-c(°c/w)`
- `pd(w)`
- `pd (w)`
- `pcm(mw)`
- `total power dissipation ptot (w)`
- `total power dissipation ptot(w)`
- `tj(℃)`
- `tj (℃)`
- `tj (ºc)`
- `tj_max (°c)`
- `tjm(℃)`
- `maximum junction temperature (℃)`

### ⚠ B3 — TS=67, mjs=77

**Only in TS (5):**

- `izk`
- `izk (ma)`
- `knee current`
- `knee current izk`
- `dynamic impedance @izk ma`

**Only in mjs (15):**

- `vz@izt(v)`
- `vz@izt_min(v)`
- `vz@izt_nom(v)`
- `vz@izt_max(v)`
- `vz_min@izt(v)`
- `vz_typ@izt(v)`
- `vz_max@izt(v)`
- `izt(ma)`
- `izm(ma)`
- `zzt@izt(ω)`
- `zzk@izk(ω)`
- `pd(mw)`
- `pd (w)`
- `tj(℃)`
- `tj (℃)`

### ⚠ B4 — TS=69, mjs=91

**Only in TS (2):**

- `尺寸代码`
- `英时`

**Only in mjs (24):**

- `vbr_min(v)`
- `vbr_max(v)`
- `vbr _min(v)`
- `vbr _max(v)`
- `vbr(v)`
- `vbr(v@1ma)`
- `vc@ipp(v)`
- `vcc(v@ippmax)`
- `max clamp voltage vc@ipp`
- `pppm(w)`
- `ppk(w)`
- `peak pulse current ipp`
- `ipp 10/1000us min(a)`
- `ipp 10/160us min(a)`
- `ipp 10/560us min(a)`
- `ipp 8/20us min(a)`
- `ipp 2/10us min(a)`
- `it(ma)`
- `test current it`
- `ir@vrwm(μa)`
- `unidirectional/bidirectional`
- `cj(pf)`
- `tj(℃)`
- `tj (℃)`

### ⚠ B5 — TS=118, mjs=137

**Only in TS (4):**

- `rds(on)@vgs=4.5v(Ω)`
- `rds(on)@vgs=10v(Ω)`
- `rds(on) (mΩ) 4.5v typ`
- `rd(mΩ) typ`

**Only in mjs (23):**

- `vdss (v)`
- `vgs (v)`
- `vgs,op (v)`
- `vth_typ (v)`
- `ciss_typ (pf)`
- `coss_typ (pf)`
- `crss_typ (pf)`
- `qg_typ (nc)`
- `gate charge total qg(nc)`
- `output capacitance coss(pf)`
- `rdson(mω)@25℃`
- `rdson@ vgs10v_max (mω)`
- `rdson@ vgs10v_typ (mω)`
- `rdson@ vgs4.5v_max (mω)`
- `rdson@ vgs4.5v_typ (mω)`
- `rdson@ vgs2.5v_max (mω)`
- `rdson@ vgs2.5v_typ (mω)`
- `rdson@ vgs1.8v_max (mω)`
- `rdson@ vgs1.8v_typ (mω)`
- `tj(℃)`
- `tj (℃)`
- `tj (ºc)`
- `tj_max (°c)`

### ✓ B6 — TS=52, mjs=52

No drift.

### ✓ B7 — TS=37, mjs=37

No drift.

### ✓ B8 — TS=40, mjs=40

No drift.

### ✓ C1 — TS=53, mjs=53

No drift.

### ✓ C10 — TS=29, mjs=29

No drift.

### ✓ C2 — TS=61, mjs=61

No drift.

### ✓ C3 — TS=31, mjs=31

No drift.

### ⚠ C4 — TS=104, mjs=98

**Only in TS (6):**

- `en@1mhz ( nv/√hz )`
- `vn@0.1hz to 10hz(μvpp)`
- `common mode voltage at vdd=30v (v)`
- `gain (v/v)`
- `gain error (%, max)`
- `gain drift (ppm/℃, max)`

### ⚠ C5 — TS=24, mjs=21

**Only in TS (3):**

- `switch config`
- `bw(mhz)`
- `ron(Ω)`

### ⚠ C6 — TS=37, mjs=36

**Only in TS (1):**

- `工作温度`

### ⚠ C7 — TS=96, mjs=95

**Only in TS (1):**

- `vbat(v)`

### ✓ C8 — TS=13, mjs=13

No drift.

### ⚠ C9 — TS=46, mjs=44

**Only in TS (2):**

- `operating temperature range`
- `工作温度`

### ✓ D1 — TS=31, mjs=31

No drift.

### ⚠ E1 — TS=135, mjs=115

**Only in TS (20):**

- `isolation voltage`
- `channel count`
- `output type`
- `forward voltage`
- `forward current`
- `reverse voltage`
- `rise time`
- `fall time`
- `propagation delay`
- `output current`
- `input type`
- `zero crossing`
- `vdrm`
- `static dv/dt`
- `cmti`
- `data rate`
- `supply voltage`
- `operating temperature`
- `package`
- `ctr`

### ✓ F1 — TS=85, mjs=85

No drift.

### ✓ F2 — TS=76, mjs=76

No drift.

## L2_PARAMS

### ⚠ Audio — TS=21, mjs=11

**Only in TS (10):**

- `type`
- `frequency`
- `frequency range`
- `impedance`
- `sound pressure level`
- `sensitivity`
- `output type`
- `rated power`
- `operating temperature`
- `mounting type`

### ⚠ Battery Products — TS=9, mjs=5

**Only in TS (4):**

- `battery chemistry`
- `cell size`
- `rated voltage`
- `capacity`

### ⚠ Connectors — TS=27, mjs=18

**Only in TS (9):**

- `connector type`
- `contact type`
- `number of positions`
- `pitch`
- `contact finish`
- `mounting type`
- `current rating`
- `voltage rating`
- `operating temperature`

### ⚠ Filters — TS=21, mjs=13

**Only in TS (8):**

- `type`
- `filter order`
- `cutoff frequency`
- `attenuation`
- `insertion loss`
- `current rating`
- `voltage rating`
- `operating temperature`

### ✓ LEDs and Optoelectronics — TS=85, mjs=85

No drift.

### ⚠ Memory — TS=42, mjs=24

**Only in TS (18):**

- `memory type`
- `memory format`
- `technology`
- `memory size`
- `capacity`
- `memory organization`
- `memory interface`
- `interface`
- `clock frequency`
- `speed`
- `write cycle time`
- `access time`
- `supply voltage`
- `voltage`
- `operating temperature`
- `temperature`
- `主要封装`
- `package`

### ✓ Microcontrollers — TS=42, mjs=42

No drift.

### ⚠ Motors and Fans — TS=16, mjs=8

**Only in TS (8):**

- `fan type`
- `rated voltage`
- `power`
- `rpm`
- `air flow`
- `noise`
- `bearing type`
- `operating temperature`

### ⚠ Power Supplies — TS=28, mjs=17

**Only in TS (11):**

- `type`
- `number of outputs`
- `input voltage`
- `output voltage`
- `output current`
- `power`
- `isolation voltage`
- `efficiency`
- `switching frequency`
- `operating temperature`
- `mounting type`

### ⚠ Processors — TS=15, mjs=9

**Only in TS (6):**

- `programmable type`
- `logic elements`
- `total ram bits`
- `number of i/o`
- `supply voltage`
- `operating temperature`

### ⚠ RF and Wireless — TS=35, mjs=11

**Only in TS (24):**

- `type`
- `protocol`
- `modulation`
- `frequency`
- `data rate`
- `output power`
- `输出功率(最大)`
- `输出功率(最小)`
- `最大输出功率`
- `最小输出功率`
- `output power (max)`
- `output power (min)`
- `max output power`
- `min output power`
- `sensitivity`
- `cat-nb1 reference sensitivity (max)`
- `cat-nb1 reference sensitivity (typ)`
- `cat-nb1 reference sensitivity (typical)`
- `conducted receiver sensitivity (max)`
- `conducted receiver sensitivity (typ)`
- `conducted receiver sensitivity (typical)`
- `gain`
- `supply voltage`
- `operating temperature`

### ⚠ Sensors — TS=30, mjs=19

**Only in TS (11):**

- `sensor type`
- `output type`
- `accuracy`
- `sensitivity`
- `axis`
- `bandwidth`
- `response time`
- `peak wavelength`
- `reverse voltage`
- `supply voltage`
- `operating temperature`

### ⚠ Switches — TS=32, mjs=19

**Only in TS (13):**

- `circuit`
- `switch function`
- `contact rating`
- `actuator type`
- `operating force`
- `illumination`
- `mounting type`
- `operating temperature`
- `current rating`
- `voltage rating dc`
- `voltage rating ac`
- `contact finish`
- `number of positions`

### ⚠ Transformers — TS=17, mjs=9

**Only in TS (8):**

- `type`
- `turns ratio`
- `primary voltage`
- `isolation voltage`
- `inductance`
- `frequency`
- `operating temperature`
- `mounting type`

## SHARED_PARAMS

- TS: 9 keys
- mjs: 9 keys

✓ No drift.

## METADATA_PARAMS

- TS: 18 keys
- mjs: 18 keys

✓ No drift.

## SKIP_PARAMS

- TS: 50 keys
- mjs: 50 keys

✓ No drift.
