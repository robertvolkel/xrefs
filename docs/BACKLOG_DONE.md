# Backlog — Done / Resolved (Archive)

> Finished, superseded, or rejected backlog items moved out of [docs/BACKLOG.md](BACKLOG.md) to keep the working backlog readable.
> Kept for history — flat top-level so scripts/check-claude-md-facts.mjs still searches it.

## Blockers — FIXED (Decision #279)

1. ~~A raw key can occupy a real scoring slot~~ — `storeRawValue` now escapes any of the
   434 reserved scoring attributeIds to `raw_<id>`, and rescued values go through
   `applyUnitPrefix`. Guard sits below BOTH colliding routes (Unicode key for ASCII
   names; historical ASCII slug for Chinese ones).
2. ~~The rescue still deletes data~~ — compares loser-raw against winner-**raw** via
   `rawByAttributeId`.
3. ~~Bulk undo can deactivate mappings with no recoverable log~~ — compensating
   rollback; reverses the earlier "the undo itself stands" contract.
4. ~~(found while verifying) SI prefixes in the wrong case were ignored~~ — `"4010 PF"`
   stored 4010 instead of 4.01e-9. Whole-token rule; `N`/`M` deliberately excluded.

### Still open from this cluster

- **(P1) The 505 display/scoring mismatches.** A part whose numeric value is correct at
  50 mA displays as **"50 A"**: ingest stripped the prefix from the value string but
  took `unit` from the dictionary. Scoring is unaffected, so this is a presentation
  bug — but the spec a human reads is wrong by 1000×. Worst ids: `pd` (179),
  `load_regulation` (63), `ic_max` (36), `vdropout` (36), `line_regulation` (31).
- **(P2) A loser whose VALUE matches the winner but whose LABEL differs is dropped**
  (`…-Min` vs nominal, both `"40 V"`). That is Decision #278's stated design, not a
  regression, but the label carries information the value does not.
- **(P2) The reserved-id guard demotes ~56,000 corpus-wide values** out of scoring
  slots, some of which were correct by luck (`"Channel type" = "N"`). The remediation
  path already exists — they were already in the Triage queue — but mapping them
  properly is real work and it is now the thing standing between those parts and being
  scored on those attributes.
- **(P2) 616 values are lost by the re-import for a PRE-EXISTING reason.** Measured on a
  full dry run against a worktree at `ac3591e`, the pre-#279 code loses the *identical*
  616 keys — so this is not caused by (or fixed by) Decision #279. Cause: products whose
  category classifies to `familyId: null`, so no family dictionary applies and
  previously-mapped Chinese columns fall through to raw keys. The clean example is
  `WCM5025F2SF-501T40`, stored as family 69 (Common Mode Chokes) but present in
  TAI-TECH's source file under "Arrays, Signal Transformers" → `familyId: null`. This is
  Decision #225 territory (one MPN in two manufacturers' files). Affected ids:
  `rated_current` (167), `number_of_lines` (115), `voltage_rated` (96),
  `insulation_voltage` (54), `cm_impedance` (32), `insulation_resistance` (30),
  plus `ir_a`/`pd_25_w`/`vf_v`/`vge_v`/`vce_sat_25_typ_v`/`ul`/`cm_inductance`.
- **(P2) The backfill has no snapshot and no revert path**, unlike the batch-ingest flow
  (`atlas_products_snapshots`, 30-day window). It is *reproducible* rather than
  reversible — it re-maps from the immutable source files, so a bad run is fixed by
  fixing the code and re-running. The only values those files cannot regenerate are
  LLM-extracted ones (628 per 40,000 products); `mergeAtlasParameters` preserves them,
  verified on AK/SR820. Worth adding a snapshot before the next large backfill.
- **(P3) Semantically wrong mappings Layer 1 exposed** (power → `color`, current →
  `supply_voltage`, resistance → `contact_rating`, supply voltage → `vrwm`, temperature
  coefficient → `tolerance`). Need engineering judgement.

## Tests that cannot fail — FIXED 22 July 2026 (branch `fix/tests-that-cannot-fail`)

⚠️ These matter more than usual: they are the stated mechanisms for rules documented in
`CLAUDE.md`. See [[green-test-must-fail-on-broken-code]]. **Every fix below was mutation-proven:
the code the test claims to protect was broken, the test was shown to go RED, then reverted.**

- ✅ **Parity now compares KEYS too** (`atlasLayer1KeepLoser.test.ts`) — a new `it.each`
  '…the same set of KEYS is written by both' sits beside the value-parity block. Proven:
  shifting the `.mjs` `storeRawValue` suffix start 2→3 keeps VALUE parity green (values
  unchanged) but turns KEY parity red on the three-way-collision case — the exact key-only
  divergence the old test was blind to.
- ✅ **The two "rescued values NOT pushed into Triage" tests** — `:175` on `mapAtlasModel` was
  vacuous (that copy has **zero** `warnings.push` sites and no `unmappedParams` surface at all),
  so it was replaced with a comment explaining why the guard lives on the `.mjs` copy. `:277` on
  `mapModel` was strengthened from a no-duplicates check to `expect(names).not.toContain(<losing
  spelling>)`. Proven: a `unmappedParams.push` at the `keepLosingValue` call site turns `:277`
  red, while the old `Set.size === length` stayed green for a single unique loser.
- ✅ **Six-route `recordParamDecisions` guard** (`paramDecisionLog.test.ts`) — now matches the
  call against **comment-stripped** source via a new `stripComments()` helper. Proven:
  commenting out the real call in `batch/undo/route.ts` (leaving the mention) turns the fixed
  guard red, while the old whole-file regex still matched the comment.
- ✅ **`dictionaryBatchUndoRoute.test.ts`** — now asserts `res.json.reverted` equals the real
  count (and the helper's response type was corrected from the misnamed `undone?` to
  `reverted?`). Proven: a route returning a constant wrong count is caught.

### Still open (out of scope for the vacuous-assertion pass)

- **`atlasIngestMapper.test.ts:244` "accounts for every source parameter" (`seen.size > 0`) is
  weak but REDUNDANT.** Mutation-verified: dropping params in the main mapping loop turns the
  **golden** test (`… maps exactly as recorded`, which pins `parameters` AND `unmappedParams`)
  red — so silent param loss is already caught. A non-redundant, snapshot-INDEPENDENT partition
  guard ("every source param is mapped, unmapped, or skipped") needs either a `skippedParams`
  return field on `mapModel` or duplicating the mapper's skip logic in the test — neither cheap.
  Fold into the "one shared `.mjs`" cleanup below.
- **The Layer-1 unit tests import the TS copy (no runtime callers), and the parity cases are all
  B5 MOSFET fixtures.** `MAX_LOSER_SUFFIX` in the live `.mjs` is asserted by nothing, and the
  parity cases never exercise the L2/shared dicts. Structural — belongs with the one-shared-`.mjs`
  cleanup (a single importable copy would let every unit test run against the live path).
- **`expect(0).toBe(0)` and the "registry compares an expression to a copy of itself"** claims
  from the older Finding-12 prose are **NOT present** in the current tree (searched exhaustively);
  already fixed or mis-described, like Finding 13.
- **`npm test` is intermittently non-deterministic** — a jest worker SIGSEGV'd in
  `recommendationBucket.test.ts` during review (passes in isolation). CI runs bare
  `npm test`, so expect an occasional unrelated red.

## Immediate state — RESOLVED 21 July 2026

Rob revoked the mapping and the backfill was re-run. **All 44 parts restored**,
verified against four predictions made in advance:

| predicted | actual |
| --- | --- |
| 44 parts change | 44 changed |
| new attribute `rdson_10v_m_max` | `rdson_10v_m_max` |
| `AGMP00504M` value 6.0 | 6.0 |
| `rds_on` still 4.3 (the Typ value) | 4.3 |

The loss was fully reversible. The `rdson@ 10v(mω) max` override is inactive; the
decision log holds three clean accept→revoke cycles.

## ~~Tier-3 narrowing step — SPECIFIED, never BUILT (P0, next up)~~ → BUILT by #272, then turned OFF 2026‑07‑15

**This section is historical.** When it was written, `tier3` had zero runtime consumers and the narrowing step existed only on paper — that gap was the bug that lost BC847BLT1G (for a BJT, gain `hfe` is a tier‑3 spec; a 50‑result small‑signal‑NPN search was supposed to ask "what gain?" and never did). **Decision #272 built the step.** It then shipped with bugs and was **gated off on 2026‑07‑15** pending repair. Current state, the repair checklist, and the still‑open #270 guard ("assert both tiers have a runtime consumer") now live in one place: **Chat Flow → "Narrowing step — BUILT (#272), TURNED OFF…"** at the top of this file.

---

## ~~CLAUDE.md diet — it is 202KB and loads in FULL every session~~ DONE (July 12, 2026)

**Result: 197.2KB → 112.4KB (-43%), ~21,000 tokens back in every session. Zero facts lost.**

**My first plan was wrong and the evidence killed it.** I claimed a trim to ~85KB by compressing the 42 `Decision #NNN` bullets to "one line + a pointer". Two holes, found by attacking my own plan:

1. **"Recoverable from DECISIONS.md" is the wrong test.** A pointer only helps if you *know to go look*. Most of those bullets are things you don't know you need until you've already broken one. Relocating them doesn't preserve them.
2. **The 85KB number was invented.** Measured: **89% of CLAUDE.md sentences carry a hard fact** (identifier/path/constant/threshold), there is **zero duplication**, and the 42 bullets alone hold **634 code identifiers**. Cutting all fact-free prose lands at ~180KB, not 85KB.

**The principle that made a safe trim possible — sort facts by whether you know to look them up:**

- **Trip-wire facts** — you break them by *not knowing* them (`enableCssLayer` must be false; never `.or()` composite tuples; bump the cache version). Nothing prompts you to look, so **a pointer is worthless. These stay INLINE, verbatim, forever.** → the `Key Patterns` section, **left byte-identical**.
- **Reference facts** — you look them up because the work announces the topic (touching family B5 sends you to read B5). **These are safe to move**, because the work itself is the trigger to fetch them.

**What moved** (each its own commit, each verified):
- Data Sources + User Context Model + the Digikey/Parts.io/FindChips integration sections → [docs/DATA_SOURCES.md](DATA_SOURCES.md)
- Per-family detail (C3–F2, variants) + Digikey L3 parameter coverage → [docs/FAMILIES.md](FAMILIES.md); the 43-family registry table stays inline as the map.

**The safety net — `npm run docs:check`** ([scripts/check-claude-md-facts.mjs](../scripts/check-claude-md-facts.mjs)): extracts all **1,971 hard facts** from the pinned pre-diet baseline and asserts each is still reachable in `CLAUDE.md` or `docs/*.md`. Content may MOVE; it may not DISAPPEAR. Proven against a deliberate deletion (caught 90 losses). **Trap it dodges:** the checker originally defaulted to `HEAD`, which would only compare each phase to the *previously-trimmed* file — a fact dropped in phase N is "already gone" by phase N+1 and the loss goes invisible. The baseline is now pinned to the original commit.

**Its limitation, stated honestly:** the checker guards the *corpus*, not the trip-wire rule — most `Key Patterns` facts also exist in `DECISIONS.md`, so it would happily allow deleting them. That discipline stays human: **`Key Patterns` is not to be trimmed.**

**What actually keeps it fixed:** the routing rule. The file reached 202KB because every decision got pasted in. New decisions now get 1–3 lines of current behaviour plus a `(Decision #N)` pointer; the story lives in `DECISIONS.md`, which is only read on demand.

---

## ~~Chinese-origin chat filter is partial — misses Chinese makers not tagged Atlas (P2)~~ — RESOLVED June 30, 2026 (Decision #263)

Fixed and merged to main. `searchParts` now resolves `PartSummary.mfrOrigin` per unique MFR (mirrors `getRecommendations`); a deterministic client-side intercept (`detectSearchOriginRefinement` + `dispatchSearchOriginFilter`) applies the origin filter without depending on the model (which refused to call the tool over its "never assert MFR origin" discipline); the filter predicate mirrors the card's 🇨🇳 flag (`mfrOrigin === 'atlas' || dataSource === 'atlas'`); and `getRecommendations` was aligned to force `'atlas'` on Atlas-sourced candidates so the flag agrees across the search + recs panels. See Decision #263 for the full trace.

---

## ~~`present_choices` button labels are unreconciled LLM free text (audit follow-up to Decision #255)~~ COMPLETED June 27, 2026

Fixed in the Decision #255 follow-up: [choiceGuard.ts](../lib/services/choiceGuard.ts) `sanitizeChoiceOptions` (wired into the `present_choices` handler) deterministically strips `mpn`/`manufacturer`, neuters `confirm_part`→`other`, and drops any choice whose label names a part (`mentionsMpn`); tool schema tightened to remove the `confirm_part`/`mpn`/`manufacturer` affordances. Residual accepted ceiling: a categorical label could still embed a *spec value* in prose (e.g. "the low-noise option") — not distinguishable from legitimate category text and not the concrete fabrication vector the audit flagged. 5 unit tests.

---

## ~~"Deferred" leaves no trace in the AI Investigation Log~~ — SUPERSEDED by the Decision Log (Decision #277)

**Resolved July 20, 2026.** This entry ended by asking which of two shapes to build: the cheap fix (add `'deferred'` to the investigations table's `action_taken` CHECK) or the durable one ("an append-only log on the param, with investigations as one event type — not more columns bolted onto the AI table"). The durable one was built.

The cheap fix would not have been enough, and the measurement is why: the Investigation Log was blind to **1,967 of 2,032 accepted mappings (97%)**, not just to the 80 defers. Stamping one more value onto a table that only 3% of decisions ever reach would have left a surface named for decisions still missing almost all of them.

See `atlas_param_decisions`, `lib/services/paramDecisionLog.ts`, and the Decision Log panel. The Investigation Log is retired; `?section=atlas-ai-log` redirects.

**Related smaller finding (same session):** deferred notes linger after their param leaves the queue — 80 note rows vs **68** still present in the live unmapped aggregate (12 stale). The UI showed 69, a 1-row delta I did not chase; likely Unicode/NFC normalization of Chinese param names when matching note → queue row (cf. [[triage-phase-3-hardening]]). Harmless today, but it means note-table counts and on-screen counts drift apart and neither is wrong.

---

## ~~FAMILY_PARAM_SIGNATURES regex bug — `\b` doesn't match underscore boundaries (B7 BJT misclass cleanup)~~ COMPLETED May 27, 2026
**Status:** Done — see [Decision #207](DECISIONS.md#decision-207--family_param_signatures-regex-bug-fix--cooccurrence-layer-may-27-2026)
**Result:** B7 family dropped from 4,317 → 1,302 (~70% reduction, 3,015 misclassified products fixed across 13 MFRs). Cooccurrence layer added for 5 shared-across-families signatures (Ic, fT, Vgs(th), Qg, Vce(sat)). 1,733 tests pass. Validation harness at [scripts/atlas-family-signatures-validate.mjs](../scripts/atlas-family-signatures-validate.mjs). Follow-ups: B7 cohort domain card regen, B6 domain card refresh.

**Priority:** ~~P1~~ (resolved)
**Cost:** ~3-4 hours (signature audit + co-occurrence design + re-ingest 13 MFRs + spot-check)
**Trigger:** B7 IGBT domain card audit (May 27, 2026) — card prose honestly noted "many B7 MPNs here (2N3904, 2N3906, 2SA1015, BC807, 13001, 2SC945) are actually BJTs misclassified into this family — flag it when vce_sat/eoff absent and only hFE/Vceo present." Followup parameter-signature scan revealed the scope is far larger than the 6 cited MPN families.

**The bug:** [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) signatures use `\b` (word boundary) in their regex patterns:

```js
{ pattern: /^b?(vcbo|vceo|vebo)\b/i, target: B6 }
{ pattern: /^@?ic\b/i,                target: B6 }
{ pattern: /^hfe\b/i,                 target: B6 }
{ pattern: /^ft\b/i,                  target: B6 }
```

In JS regex, `\b` matches between `\w` and non-`\w`. Underscore (`_`) IS a `\w` character, so `\b` does NOT match between `e` and `_`. Result: only the bare forms (`hfe`, `vceo`) match. The real-world Atlas param keys (`hfe_min`, `hfe_max`, `vceo_v`, `bvceo_v`, `v_br_ceo_v`, `vebo_v`, etc.) do NOT match. Signatures effectively never fire on this data.

**Impact at survey time (May 27, 2026):**
- **2,774 of 4,317 B7 products (~64%) are misclassified BJTs** — carrying hFE/Vceo/Vebo/Vcbo/fT (BJT-only datasheet params) but sitting in B7
- Only ~244 B7 products carry IGBT-only keys (vces_max=144, eoff=27, igbt_technology=73)
- B7 family stats, domain card cohort numbers, and matching-engine recommendations are all inflated by the misclassification
- B6 BJTs is correspondingly under-counted

**Affected MFRs (B7 BJT-misclass count):** KEXIN (970), SWST (863), LRC (484), SALLTECH (128), Slkor (86), Jingheng (86), WAY-ON (49), Prisemi (35), MDD (31), Comchip (18), YANGJIE (13), BORN (6), WPMSEMI (5).

**Cross-contamination check passed:** 0 of 244 legitimate B7 IGBTs (with vces_max/eoff/igbt_technology) carry any BJT-unique key. Schema-level BJT/IGBT distinction is clean in the data — only the classifier signatures fail to enforce it.

**Additional finding — overly broad existing signatures:** Beyond the regex bug, two of the four signatures have a separate false-positive risk:
- `/^@?ic\b/i → B6`: reasoning says "Ic is BJT-specific — diodes carry If not Ic." But **IGBTs also have Ic** (collector current is a legitimate IGBT spec — see `ic_max` rule in [lib/logicTables/igbts.ts:119](../lib/logicTables/igbts.ts) and `ic nom(a)` / `ic(a) 100℃` / `ica` in B7 dict at [atlasMapper.ts:1126-1129](../lib/services/atlasMapper.ts#L1126)). Broadening this pattern naively would route legitimate IGBTs to B6.
- `/^ft\b/i → B6`: source code reasoning already acknowledges "high-frequency RF MOSFETs may also spec fT — if a future MOSFET ingest gets misrouted to B6 by this pattern, refine to require a BJT-co-occurring param." The fix here may need to be tied to the co-occurrence work below.

**What this would build:**

1. **Pattern fix** — replace `\b` with `(?:[_\W]|$)` (matches underscore, non-word char, or end-of-string). Catches `hfe_min`, `hfe_max`, `vceo_v`, `bvceo_v`, etc. Still doesn't catch SWST's concatenated forms (`hfehfe`, `hfemax`, `hfeic_ma`) — those would need separate explicit alternation OR a more permissive `/^hfe/i` (with care for false positives).
2. **Signature scope refinement** — for signatures that aren't strictly target-family-unique (Ic, fT), require co-occurrence of at least one strictly-unique BJT signal (e.g., hFE OR Vebo OR Vcbo). This addresses the existing in-source TODO and prevents IGBT/MOSFET false positives.
3. **Mirror to scripts/atlas-ingest.mjs** per Decision #176 mirror convention.
4. **Cross-family validation** — before shipping, query every distinct param key across atlas_products and verify the new patterns only match keys present in B6/B7 (not in B5, C, D, E, F, or passive families).
5. **Re-ingest the 13 affected MFR source files** via the normal `--report` → batch-approval pipeline (Decision #174). With fixed signatures, batches will correctly stage family_id changes B7 → B6. Engineer approves via admin UI; 30-day snapshot revert available.

**Verification plan before shipping:**
- Test new patterns against all current param keys across B5/B6/B7 — should NOT match any non-BJT keys
- Test against the 244 legitimate B7 IGBTs identified — should NOT route any of them to B6
- Dry-run `--report` on WPMSEMI first (smallest at 5 misclass rows) — verify batch shows correct family_id flip
- Scale up to all 13 MFRs after WPMSEMI validates

**Why deferred (May 27, 2026):**

- Discovered during a card audit (B7) that's still Approve-able as-is — the card prose honestly describes the misclassification
- The fix is a multi-step engineering task (signature audit + co-occurrence logic + cross-family validation + 13-MFR re-ingest), not a quick regex tweak
- Bundling it into a card audit session would have crossed two unrelated concerns and exceeded scope
- The data is wrong but stable — fixing it is a focused project, not an emergency

**Trigger to flip from defer to ship:** when scoping a multi-MFR data quality sprint OR when a domain card audit for B6 BJTs needs to start (the inflated B7 cohort + under-counted B6 cohort would force this same diagnosis).

**Cross-reference patterns:**
- Decision #177 (foreign-family auto-flag registry) — this IS that registry; the bug is in the regex patterns it ships with
- Decision #188 (engineer-driven FAMILY_PARAM_SIGNATURES via DB + one-click reclassify) — the DB-layer add-ons work the same way and may have the same `\b` issue if engineers wrote patterns following the existing examples
- "Ingest-time Schottky / small-signal diode auto-routing (B1 misclassification cleanup)" entry below — similar shape (MPN-prefix-driven misclassification cleanup) for a different family pair (B1↔B2)

**Files involved:**
- [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) — fix patterns + add co-occurrence logic
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — mirror per Decision #176
- 13 source files under `data/atlas/` for re-ingest

## MFR profile spreadsheet ingest — REJECTED (2026-05-26)
**Status:** Rejected. Do not build unless trigger conditions met.
**Priority:** N/A
**Cost:** ~36 engineer-hours if revisited

Engineer asked whether to extend `/admin/atlas/ingest` with a spreadsheet upload path for MFR profile data (team sends recurring spreadsheets with profile fields). Plan agent produced a detailed design (parallel snapshot table, per-field provenance JSONB, column mapping dialog, row-by-row diff UI, conflict resolution, atlas-api-sync update for provenance respect).

**Why rejected:** Atlas API (`https://cn-api.datasheet5.com`, consumed via [scripts/atlas-api-sync-profiles.mjs](../scripts/atlas-api-sync-profiles.mjs), Decision #139) is the single source of truth for MFR profile data. Adding a spreadsheet pipeline would create a second source, route around an upstream data-quality problem, and force ongoing provenance + conflict-resolution maintenance. Correct path: team-supplied spreadsheets become input artifacts for IT to update the upstream API; subsequent atlas-api-sync runs propagate the improvements automatically. One source of truth, all consumers benefit.

**Revisit trigger:** Only build if BOTH of the following become true:

(a) Team data is structurally unsuitable for the upstream API (e.g., it's customer-specific, proprietary, or NDA-protected and cannot live in a shared external system); AND
(b) The IT/upstream-API path is permanently blocked (not just slow).

**If revisited, the full design is preserved at:**
`/Users/robvolkel/.claude/plans/golden-dreaming-fairy-agent-a10ab613ff79e84bf.md`
(plan-agent output, May 26 2026 — covers schema, components, API contracts, provenance model, cache invalidation, 36h effort breakdown.)

## ~~Atlas dict lookup: non-`\s+` whitespace chars in vendor paramNames~~ (RESOLVED — different bug)

**Resolution (June 14, 2026).** Diagnosed mid-investigation: the padding IS plain ASCII space (0x20) — `\s+` collapse was already working. The real bug was CT MICRO encoding UTF-8 special chars (°, µ, ℃, Ω, λ) as **literal escape-sequence text** like `(\xe2\x84\x83)` instead of the actual character. 12 paramName variants across 677 occurrences, single MFR.

**Fix.** New `decodeLiteralByteEscapes()` helper in `lib/services/atlasMapper.ts` (+ mirror in `scripts/atlas-ingest.mjs`) finds runs of `\xHH` literal text and decodes the byte sequence as UTF-8. Applied in the dict-lookup normalization step so dict entries written with the proper char match the broken source form. Invalid UTF-8 byte runs fall back to keeping the raw text (so an audit can spot the bad source instead of silently substituting U+FFFD).

**Why this unblocks Item 2 (L2 LEDs).** CT MICRO is an LED MFR. Without the decoder, the L2 LEDs dict would need duplicate entries — one for the proper char form (`'viewing angle(°)'`) and one for the literal-escape form. With the decoder, a single dict entry covers both. Sets up Item 2 as a clean dict-only edit.

**Carry-forward note.** CT MICRO's ~22K existing products still sit in JSONB under the corrupted catalog-fallback keys (e.g. `topr_xe2_x84_x83` instead of `topr` / `operating_temp`). They'll re-key naturally on next CT MICRO re-ingest, which happens as part of Item 2. No standalone backfill needed.

---

## ~~Atlas L2 LEDs dict expansion~~ (DONE — Refond + CT MICRO + Everlight shipped June 15, 2026)

**Resolution.** ~44 new L2 LEDs dict entries covering CT MICRO LED-indicator vocabulary (`Viewing Angle(°)`, `Size L*W*H(mm)`, `Color Combination`, `Fire`, `Iv (mcd)/lmMin.~ Max.`, `VF(V)Min.~Max.`, `λd(nm)Min.~Max./CIE(X,Y) Typ.`, `TOPR (℃)`) + Refond display-LED vocabulary (`Ta @25℃(TYP.) IF(mA)`, `Ta @25℃(TYP.) vf(V)`, `Max current (mA)`, `2θ1/2(°)`, `50% power angle`, `Iv (RCM)`, `Φe(mW)`, `Lens(mm)`, `Ta @25℃(TYP.) Flux/lm @4000K Ra70`, `Color Rendering Index Ra(min)`, etc.) + Everlight Chinese gaps (`辐射强度`, `耗散功率`, `直流反向耐压`, `正向电流-DC (If)`, `LED极性`). Several new canonical attributeIds introduced: `cri_ra`, `color_temperature`, `radiant_power_mw`, `lens_diameter_mm`, `size_lwh_mm`, `viewing_angle_half_power`, `max_current`, `color_combination`, `mounting_orientation`, `radiant_intensity`, `led_polarity`, `character_size_inches`, `luminous_flux_lm`, `esd_hbm_v`.

**Result.** Re-ingested 3 MFRs: Refond (596+3 = 599 product updates, +2155 new attrs), CT MICRO (326 updates, +1263 new attrs), Everlight (no-op — already covered). LED-touching Triage rows dropped 22 → 7 (−68%). Total Triage queue 24,909 → 24,825 (−84). Sample Refond product RF-A3E31-W60E-B1 now ships 10 canonical attrs (`color`, `max_current`, `viewing_angle`, `forward_current`, `forward_voltage`, `power_dissipation`, etc.) versus the prior 4-5.

**Scope correction.** Original BACKLOG mentioned Sunlord as the highest-volume MFR ("18K+ products"). False — Sunlord ships ZERO LED products; their 16K catalog is inductors / capacitors / filters. The real scope was Refond (789 LED products) + CT MICRO (222 LED) + Everlight (2756 LED) ≈ 3700 LED products. Survey-first decision-making would have caught this before authoring; lesson re-confirmed.

**Latent mjs mirror drift surfaced and fixed.** The mjs L2 LEDs block was missing 16 English-side dict entries that existed in TS (`color`, `forward voltage`, `viewing angle`, `wavelength`, `peak wavelength`, `luminous intensity`, `emission angle`, `test current`, `lens color`, `mounting type`, `forward current`, `reverse voltage`, `color temperature`, `diode configuration`, `operating temperature`, `led color`). Refond's `Color` paramName for 481 products never matched at ingest because of this drift. Fixed inline; future ingests will work correctly. Confirms the Decision #218 pattern — mirror drift is not self-enforcing, and audit-by-grep is the durable check. Other L2 dicts (Switches, RF, Sensors, etc.) likely have similar drift — broader audit recommended but out of scope here.

**Operational note.** When dict additions don't immediately drop stale Triage queue counts: re-run `--rescan-unmapped-params`. The rescan reads the mjs dict at startup, so a dict edit AFTER a rescan won't be reflected until the next rescan. The supersede-clear during `--proceed` also helps drop stale entries from prior batches sharing the same source_file.

---

## ~~Atlas C7 digital isolators dict expansion~~ (DONE — CHIPANALOG shipped June 15, 2026)

**Resolution.** ~40 C7 dict entries added covering CHIPANALOG's digital isolator + RS-485/CAN transceiver vocabulary + cross-MFR Chinese (TDSEMIC/HXYMOS/ElecSuper) + BORN/Union English transceiver fields + SIT bilingual compound paramNames. Re-ingested CHIPANALOG (348 products): 288 updates, +288 new attrs landed in JSONB across 9 new canonical attributeIds (`supply_current_per_channel` × 181, `esd_other_pins` × 36, `esd_hbm_cdm_kv` × 20, `logic_supply_voltage` × 20, `independent_logic_supply` × 19, `integrated_ldo` × 14, etc.). C7-touching Triage rows dropped 471 → 432 (−39); total Triage queue 24,909 → 24,870.

**Scope correction.** Original BACKLOG mentioned Yint as a secondary C7 MFR — wrong. Yint's c3 distribution is 100% circuit protection (TVS / Rectifiers / PTC Fuses / Varistors / Zeners / GDTs / NTC / SPDs / Inductors / CM Chokes). Zero digital-isolator products. The ~500-product estimate was anchored on the false Yint assumption.

**Latent bug surfaced.** Underscore-prefix attributeIds (`_*`) are SKIPPED at ingest ([atlasMapper.ts:3412](../lib/services/atlasMapper.ts) and gaia path at 3353). This means most of the EXISTING C7 dict (25+ `_*` entries) has silently dropped source data on ingest forever — only the four non-underscore canonicals (`data_rate`, `esd_bus_pins`, `package_case`, `operating_temp`) actually wrote to JSONB. My new entries use non-underscore IDs so they store properly. See the dedicated entry below for the holistic fix.

---
