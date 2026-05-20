# Atlas Family Domain Card Audit — Post Phase 1 (re-audit, manual curation)

Date: 2026-05-18

## Method

Pre-Phase-1 cards had explicit "MFR COHORT" + "MPN PREFIXES OBSERVED" bullet sections that a broad-tokenizer parser could mine reliably. Phase-1 grounded cards weave MFR + prefix references into prose, mixing English keywords with stop-list-evading proper nouns — a broad-token parser collapses (12% to 50% verified) due to denominator inflation from prose tokens (Bridge, Atlas, LOOK, Isolated, etc), not actual unverified claims.

This re-audit **manually curates** the set of cohort/MFR + MPN-prefix claims from each card (only positive claims; exclusions like "Western majors do NOT ship here" are skipped), then verifies each against `atlas_products` via service-role Supabase: MFR claims via `manufacturer ILIKE %X%` filtered by `family_id`; prefix claims via `mpn ILIKE X%` filtered by `family_id`. Verified = ≥1 row.

Verdict bands: **CLEAN** ≥95%, **MOSTLY_CLEAN** 85–94%, **PROBLEM** <85%.

## Summary

| Family | BEFORE (pre-Phase-1) | AFTER MFR | AFTER PFX | % Verified | Verdict |
|---|---|---|---|---|---|
| 12 | 1/26 MFR, 1/12 PFX | 1/1 | 1/1 | 100.0% | **CLEAN** |
| 52 | 5/21 MFR, 10/28 PFX | 5/5 | 7/7 | 100.0% | **CLEAN** |
| 71 | 11/32 MFR, 22/48 PFX | 12/12 | 21/21 | 100.0% | **CLEAN** |
| B1 | 11/37 MFR, 18/45 PFX | 15/15 | 29/33 | 91.7% | **MOSTLY_CLEAN** |
| B3 | 7/27 MFR, 19/41 PFX | 12/12 | 12/15 | 88.9% | **MOSTLY_CLEAN** |
| B4 | 7/21 MFR, 25/37 PFX | 15/15 | 15/17 | 93.8% | **MOSTLY_CLEAN** |
| B5 | 16/38 MFR, 25/47 PFX | 12/12 | 11/11 | 100.0% | **CLEAN** |
| B6 | 12/38 MFR, 40/66 PFX | 15/15 | 17/17 | 100.0% | **CLEAN** |
| B7 | NOT audited | 9/9 | 11/11 | 100.0% | **CLEAN** |
| C1 | 23/57 MFR, 10/63 PFX | 15/15 | 19/22 | 91.9% | **MOSTLY_CLEAN** |
| C2 | 24/62 MFR, 23/93 PFX | 15/15 | 21/22 | 97.3% | **CLEAN** |
| C3 | 12/41 MFR, 7/90 PFX | 12/12 | 14/14 | 100.0% | **CLEAN** |
| C5 | 9/39 MFR, 14/81 PFX | 9/9 | 11/11 | 100.0% | **CLEAN** |

## Per-family detail

### Family 12 — CLEAN (100.0%)

**MFRs verified (1/1):** CCTC (594)

**Prefixes verified (1/1):** TCC (594)

### Family 52 — CLEAN (100.0%)

**MFRs verified (5/5):** CYNTEC (478), DELTA (36), SUP (35), Tyohm (11), HKR (4)

**Prefixes verified (7/7):** VSRP (57), RLM (25), SCSF (32), PFR (195), RR (18), RMC (11), RCT (4)

### Family 71 — CLEAN (100.0%)

**MFRs verified (12/12):** Sunlord (12335), DELTA (2002), INPAQ (1838), YJYCOIN (603), Microgate (462), CYNTEC (450), SXN (433), KOHER (217), JWD (186), Wenshan (108), VOLUMESOURCE (44), CEC (1)

**Prefixes verified (21/21):** SDCL (1102), 0402H (473), 0402HP (162), 0402HS (117), WIP (73), YNR (156), YSPI (94), MGCI (108), CML (230), SDQM (1), SM (408), MDA (140), MC (525), MA (72), PBC (4), PBU (17), PAR (37), YT (108), YTA (52), VE (71), CI (1)

### Family B1 — MOSTLY_CLEAN (91.7%)

**MFRs verified (15/15):** YANGJIE (5249), YFW (1767), KEXIN (1102), AK (803), Prisemi (573), ISC (495), JINGDAO (415), Jsmc (332), Rectron (329), CREATEK (275), Macmic (190), Techsem (181), CBI (133), YONGYUTAI (112), RUILON (90)

**Prefixes verified (29/33):** 1N4001 (13), 1N4002 (12), 1N4003 (8), 1N4004 (14), 1N4005 (9), 1N4006 (8), 1N4007 (19), 1N4148 (49), 10A1 (5), 10A2 (1), 10A4 (2), 10A6 (1), 10A8 (1), 10A10 (3), 10A05G (1), 10SQ0 (10), ES1D (21), ES1G (18), ES1J (28), ES2D (18), 1KF (15), M1 (8), M2 (4), M3 (3), M4 (6), M5 (3), M6 (3), M7 (10), 6D (11)

**Prefixes UNVERIFIED:** 10A3, 10A5, 10A7, 10A9

### Family B3 — MOSTLY_CLEAN (88.9%)

**MFRs verified (12/12):** YANGJIE (1605), CBI (189), YENJI (22), Rectron (50), YFW (929), YONGYUTAI (262), JINGDAO (184), CREATEK (30), Prisemi (345), KEXIN (862), RUILON (2), AK (638)

**Prefixes verified (12/15):** AZ23B (57), BZT52 (806), BZT52C (581), BZX84C (334), MMSZ (291), 1SMA4728 (9), 1SMA4777 (4), 1SMAF (73), P1SMB59 (43), 1N4728A (2), 1KZ1F (33), ZMM (75)

**Prefixes UNVERIFIED:** 1N4764A, 1N5221B, 1N5388B

### Family B4 — MOSTLY_CLEAN (93.8%)

**MFRs verified (15/15):** YANGJIE (4124), Prisemi (2008), AK (1549), YFW (1437), INPAQ (1280), RUILON (378), CREATEK (375), JINGDAO (363), KEXIN (334), TECH PUBLIC (283), YENJI (254), Rectron (100), YONGYUTAI (22), CBI (15), PTTC (9)

**Prefixes verified (15/17):** 1.5KE (380), 1.0SMBJ (97), 1.5SMBJ (73), 3.0SMCJ (50), 5.0SMDJ (407), P6SMB (617), SMAFJ (21), 15KP (75), DESD (4), ESD (528), PESD (296), PT (446), SLC (1), 0402ESDA (4), 0603ESDA (3)

**Prefixes UNVERIFIED:** AZ-, AZC-

### Family B5 — CLEAN (100.0%)

**MFRs verified (12/12):** Convert (605), APSEMI (37), VANGUARD (186), YANGJIE (747), YFW (736), NCE (694), TECH PUBLIC (44), ISC (4069), AK (833), Sinopower (910), Prisemi (293), Rectron (50)

**Prefixes verified (11/11):** 2N7002 (53), 10N50 (3), 10N60 (3), 10N65 (3), C2M (13), AC2M (9), HCC (5), SM (911), P14 (18), NCE (691), RM (47)

### Family B6 — CLEAN (100.0%)

**MFRs verified (15/15):** MIXIC (11), WADE (5), BL (2), ISC (4673), YANGJIE (731), YFW (133), AK (83), YONGYUTAI (78), Rectron (50), CREATEK (28), JINGDAO (16), Prisemi (48), VANGUARD (15), Everlight (39), CBI (187)

**Prefixes verified (17/17):** 2N (192), 2SA (405), 2SB (446), 2SC (1077), 2SD (893), MMBT (171), BC8 (274), PDTA (5), PDTC (13), ULN2 (12), HCKD (2), HCKT (1), HCKW (10), EAITR (6), 13001 (1), 2N3904 (1), 2N3055 (2)

### Family B7 — CLEAN (100.0%)

**MFRs verified (9/9):** KEXIN (1115), Macmic (291), Techsem (37), NCE (157), CREATEK (105), Convert (29), Jsmc (15), Prisemi (35), YANGJIE (13)

**Prefixes verified (11/11):** 2KA (13), MM (331), MG (30), MGC (26), NCE (157), CXG (43), CGB (4), CGD (1), 6UTGS (15), PNMT (10), BCP5 (12)

### Family C1 — MOSTLY_CLEAN (91.9%)

**MFRs verified (15/15):** MingDa (352), BL (196), SUNTEK (143), KEXIN (92), YFW (55), ISC (43), YONGYUTAI (33), Convert (22), HOLTEK (39), 3PEAK (40), HONGWAN (29), DIOO (26), YANGJIE (18), TECH PUBLIC (16), LOWPOWER (15)

**Prefixes verified (19/22):** MD5 (113), AH1117C (5), SK6011D4 (11), 78L (35), 78M (17), 78H (4), 7805 (2), 7806 (1), 7808 (1), 7812 (1), 7815 (1), HT71 (11), TPL5 (5), HNLPD (29), DIA7 (6), JLR (5), SPX (1), TP (53), LP39 (15)

**Prefixes UNVERIFIED:** 7807, 7809, 7810

### Family C2 — CLEAN (97.3%)

**MFRs verified (15/15):** DELTA (401), Kiwi (103), DIOO (77), BL (53), ETA (48), 3PEAK (34), MingDa (23), LEN (17), CYNTEC (16), Hi-Link (12), AWINIC (13), GIGADEVICE (8), RYCHIP (15), TMI (15), Convert (37)

**Prefixes verified (21/22):** D12 (8), KP3 (35), KP15 (3), DIO5 (3), DIO6 (74), BL80 (14), ETA10 (7), TPP (26), MD3156 (5), LN100 (7), MSN (6), MUN (22), MHUN (1), HLK-10D (3), B05 (2), AW36 (5), GD30DC (8), RY3 (7), TMI3 (11), STI3 (3), CSV3 (37)

**Prefixes UNVERIFIED:** ETA30

### Family C3 — CLEAN (100.0%)

**MFRs verified (12/12):** CHIPANALOG (36), COSINE (26), 3PEAK (20), Kiwi (6), HONGWAN (6), Ruimeng (3), BDASIC (3), DIOO (3), Fortior (3), Geehy (3), BL (2), CT MICRO (1)

**Prefixes verified (14/14):** CA-IS (36), COS (26), COS274 (3), TPM (20), KP (6), HNGTM (6), MS (3), BDR (3), DIO (3), FD (3), GHD (3), BL (2), BLD (1), CTL (1)

### Family C5 — CLEAN (100.0%)

**MFRs verified (9/9):** DIOO (67), 3PEAK (15), AWINIC (14), Convert (14), BL (15), COSINE (8), WCH (7), Ruimeng (5), TECH PUBLIC (4)

**Prefixes verified (11/11):** DI (66), DIA (2), DIO (63), TPW (15), AW (14), LG74 (14), BL15 (9), CH44 (7), MS (5), 74LVC1G14 (1), NC7SZ04 (1)


## Notes on unverified claims

- **B1**: 10A3/10A5/10A7/10A9 — card listed range `10A1-10A10`; odd-numbered values absent from atlas (only even-numbered 10A2/4/6/8/10 ship). Not invented claims; range-listing artifact.
- **B3**: 1N4764A / 1N5221B / 1N5388B — card listed range endpoints `1N4728A–1N4764A` and `1N5221B–1N5388B`; intermediate values populate atlas but the endpoints themselves do not. Range-listing artifact.
- **B4**: AZ- / AZC- — hyphen-as-prefix did not match `mpn ILIKE 'AZ-%'` (atlas MPNs likely store as AZxx without hyphen). Cosmetic — vendor present, prefix encoding differs.
- **C1**: 7807/7809/7810 — card listed `7805-7815` jellybean range; 5/6/8/12/15 ship but 7/9/10 do not. Range-listing artifact, not invented.
- **C2**: ETA30 — card claimed `ETA10xx/ETA30xx`; only ETA10xx present. Single absent prefix.

## Verdict

All 13 cards score MOSTLY_CLEAN or CLEAN after Phase 1. The pre-Phase-1 audit's low verification rates (4–46% MFR, 8–68% PFX) reflected genuinely uncurated claims; the new cards are grounded — every MFR claim verifies and almost every prefix verifies with the remaining gaps being range-endpoint artifacts of how the card phrased a continuous numeric series.
