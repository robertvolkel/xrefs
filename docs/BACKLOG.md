# Backlog

Known gaps, incomplete features, and inconsistencies found during project audit (Feb 2026).

---

## P0 — High Priority

### ~~Digikey parameter maps incomplete for most families~~ COMPLETED
**File:** `lib/services/digikeyParamMap.ts`

All 19 passive families + 9 discrete semiconductor families (B1–B9) + 10 Block C IC families (C1 LDOs, C2 Switching Regulators, C3 Gate Drivers, C4 Op-Amps/Comparators, C5 Logic ICs, C6 Voltage References, C7 Interface ICs, C8 Timers/Oscillators, C9 ADCs, C10 DACs) + 2 Block D families (D1 Crystals, D2 Fuses) + 1 Block E family (E1 Optocouplers) + 2 Block F families (F1 Electromechanical Relays, F2 Solid State Relays) now have curated parameter maps. See Decisions #16-19, #30-40, #46-55, #71-75 for API quirks.

**Completed:** MLCC (12, 14 attrs), Chip Resistors (52-55, 11 attrs), Fixed Inductors (71/72, 15 attrs), Ferrite Beads (70, 10 attrs), Common Mode Chokes (69, 13 attrs), Tantalum (59, 9 attrs + 2 placeholders), Aluminum Electrolytic (58, 15 attrs), Aluminum Polymer (60, 14 attrs + 2 placeholders), Film (64, 13 attrs), Supercapacitors (61, 11 attrs + 2 placeholders), Varistors (65, 8 attrs + 1 placeholder), PTC Resettable Fuses (66, 13 attrs incl. dual height fields), NTC Thermistors (67, 8 attrs + 2 placeholders), PTC Thermistors (68, 4 attrs + 1 placeholder), Rectifier Diodes (B1, 11 attrs single + 9 attrs bridge + 2 placeholders), Schottky Barrier Diodes (B2, 11 attrs single + 11 attrs array, virtual category routing), Zener Diodes (B3, 10 attrs single + 11 attrs array), TVS Diodes (B4, 13 attrs), MOSFETs (B5, 14 attrs, verified Feb 2026), BJTs (B6, 11 attrs, verified Feb 2026), IGBTs (B7, 14 attrs incl. 2 compound fields, verified Feb 2026), Thyristors/SCRs (B8-SCR, 8 attrs, ~48% weight coverage, verified Feb 2026), Thyristors/TRIACs (B8-TRIAC, 9 attrs incl. compound "Triac Type" field, ~51% weight coverage, verified Feb 2026).

**Known data gaps (accepted):** PTC thermistors have extremely sparse Digikey data (4 of 15 logic table rules mappable). Varistors missing clamping voltage (w9). NTC B-value only maps B25/50 (bead types with only B25/100 won't match). Rectifier diodes and Schottky diodes have no AEC-Q101 in parametric data. Schottky-specific fields (Ifsm, Rth_jc, Rth_ja, Tj_max, Pd, technology_trench_planar, vf_tempco) not in Digikey parametric data. Zener diodes missing Izt (w8), TC (w7), Izm (w6), Rth_ja (w6), Tj_max (w6), Cj (w4), Zzk (w4), pin_configuration (w10), height (w5) — ~51% weight coverage for singles, ~57% for arrays. Digikey uses "AEC-Q100" (not Q101) for Zener categories. TVS diodes missing ir_leakage (w5), response_time (w6), esd_rating (w7), pin_configuration (w10), height (w5), rth_ja (w5), tj_max (w6), pd (w5), surge_standard (w8) — ~61% weight coverage (108/177). Polarity derived from field name presence, not a standard parameter.

---

### ~~No automated tests~~ COMPLETED
**Location:** `__tests__/services/`

Jest test suite added with 374 tests across 6 suites, covering all priority candidates:
- `matchingEngine.test.ts` (137 tests) — all 9 rule evaluators (incl. vref_check, identity+tolerancePercent), scoring math, fail propagation, partial credit, blockOnMissing, C2/C3/C4/C5 logic table structure, edge cases
- `familyClassifier.test.ts` (50 tests) — all variant classifiers (54/55/53/60/13/72/B2/B3/B4/B9), B5/B6/B7/B8 standalone, C2 registry mapping, cross-family safety, rectifier enrichment, JFET detection
- `deltaBuilder.test.ts` (14 tests) — REMOVE→OVERRIDE→ADD order, immutability, silent skip, auto-sortOrder
- `contextModifier.test.ts` (25 tests) — all 5 effect types, blockOnMissing propagation, last-writer-wins, skip behaviors, C2/C3/C4 context effects
- `digikeyMapper.test.ts` (87 tests) — category/subcategory/status mapping, SI prefixes, value transformers, MOSFET/BJT/IGBT/thyristor routing, search result dedup
- `themeClassifier.test.ts` (34 tests) — theme icon classification

Config: `jest.config.ts` using `next/jest.js` (SWC transforms + path aliases), `testEnvironment: 'node'`. Run: `npm test`.

---

### ~~Silent data source fallback~~ COMPLETED
**File:** `lib/services/partDataService.ts`

Added `dataSource: 'digikey' | 'mock'` to `PartAttributes`. `partDataService.getAttributes()` tags every return path. `AttributesPanel` shows an amber "Mock Data" chip when `dataSource === 'mock'`. See Decision #20. **Update (Decision #78):** Mock product fallback fully removed — all 4 fallback paths now return empty/null. "Mock Data" chip removed from AttributesPanel.

---

### ~~No .env.example file~~ COMPLETED
**Location:** Project root

Created `.env.example` with all required variables, placeholder values, and comments explaining each variable and where to obtain credentials.

---

### ~~Admin override layer for logic tables & context questions~~ COMPLETED
**Files:** `lib/services/overrideMerger.ts`, `lib/services/overrideValidator.ts`, `components/admin/RuleOverrideDrawer.tsx`, `components/admin/ContextOverrideDrawer.tsx`

Admins can now edit rule weights, logic types, thresholds, hierarchies, and context questions/options/effects from the admin UI without code deploys. Overrides stored in Supabase, merged at runtime on top of TS base. See Decision #60.

---

### ~~External API access for sister products~~ COMPLETED
**Files:** `lib/supabase/auth-guard.ts`, `mcp-server/`, `docs/API_INTEGRATION_GUIDE.md`

Two integration paths implemented (Decision #80):
1. **REST API** — Bearer token auth via `XREFS_API_KEYS` env var. All existing routes (`/api/search`, `/api/attributes/{mpn}`, `/api/xref/{mpn}`) accessible with API key.
2. **MCP Server** — Stdio-transport server with 5 tools for AI agent integration. Claude Desktop, Claude Code, and MCP-compatible clients.

**Remaining (future):**
- Streamable HTTP transport for remote MCP access (currently stdio only — requires local process)
- Per-key rate limiting and usage tracking
- API key management UI in admin panel (currently env var only)
- Dedicated REST endpoint for context questions (currently MCP-only)

---

### ~~Per-list views — views are global, editing one list affects all others~~ COMPLETED
**Files:** `hooks/useListViewConfig.ts` (new), `hooks/useViewConfig.ts`, `lib/supabasePartsListStorage.ts`, `lib/viewConfigStorage.ts`, `components/parts-list/PartsListShell.tsx`, `components/parts-list/ViewControls.tsx`

Views are now per-list, stored in Supabase `parts_lists.view_configs` JSONB. Global views became **templates** (localStorage) used to seed new lists. Editing a view only affects the current list. "Save as Template" pushes a view back to the global template library (stripping `ss:*` columns for portability via `sanitizeTemplateColumns()`). Migration is automatic: lists with null `view_configs` copy from global templates on first load. `useViewConfig` renamed to `useViewTemplates` (backwards-compat alias kept). See Decision #81.

Also added `mapped:cpn` — optional Customer Part Number / Internal Part Number column mapping. Auto-detected from spreadsheet headers. Reordered `DEFAULT_VIEW_COLUMNS` to put `sys:status` right after source data columns.

---

## P1 — Medium Priority

### ~~L2 taxonomy: curated param maps for high-value non-xref categories~~ COMPLETED
**Status:** Done — Wave 1 (Decision #86) + Wave 2 (Decision #87)

14 L2 categories now have curated param maps in `digikeyParamMap.ts`:
- **Wave 1** (Decision #86): Microcontrollers, Memory, Sensors, Connectors, LEDs, Switches
- **Wave 2** (Decision #87): RF/Wireless, Power Supplies, Transformers, Filters, Processors, Audio, Battery Products (split: cells + charger ICs), Motors/Fans

**Intentionally skipped:** Cables/Wires (too heterogeneous), Development Tools (no meaningful shared parametrics). Both remain at L0.

**Remaining gap:** Parts.io param maps (`partsioParamMap.ts`) and Mouser mapper entries not yet added for L2 categories — currently Digikey-only.

### L2 family-level param maps: split union maps into per-sensor-type maps
**Status:** Phase 1 (Sensors) done — Decision #88. 7 sensor sub-families with dedicated param maps + general fallback.

**Completed (Phase 1):** Temperature Sensors, Accelerometers, Gyroscopes, IMUs, Current Sensors, Pressure Sensors, Humidity Sensors, Magnetic Sensors. `L2FamilyInfo` metadata index added. `mapCategory()` fixed for 3 sensor leaf categories that were misclassified as 'ICs'.

**Completed (Phase 2):** RF Transceivers (18 fields, covers ICs + modules), RF Antennas (11 fields), Baluns (7 fields), RFID (8 fields). No `mapCategory()` fix needed — all 5 Digikey leaf categories already routed correctly.

**Completed (Phase 3):** PCB Headers/Sockets (16 fields), Terminal Blocks (11 fields), RF Connectors (11 fields), USB/IO Connectors (12 fields). No `mapCategory()` fix needed.

**Completed (Phase 4):** Audio: Buzzers/Sirens (15 fields), Microphones (13 fields), Speakers (17 fields). Switches: Tactile (14 fields), DIP (14 fields), Rocker/Toggle/Slide (15 fields). No `mapCategory()` fix needed.

**Completed (Transformers):** SMPS Transformers (14 fields), Pulse Transformers (8 fields), Current Sense Transformers (11 fields). Memory investigated — single Digikey category with uniform fields across all types, no split needed.

**Remaining phases:**
- ~~Phase 2: RF/Wireless (transceivers vs antennas vs modules vs RFID)~~ ✅ Done (Decision #90)
- ~~Phase 3: Connectors (PCB headers vs RF connectors vs terminal blocks)~~ ✅ Done (Decision #91)
- ~~Phase 4: Audio (buzzers vs microphones vs speakers) + Switches (tactile vs toggle vs DIP)~~ ✅ Done (Decision #92)
- ~~Transformers (SMPS vs pulse vs current sense)~~ ✅ Done (Decision #93)
- ~~Phase 5: Admin panel integration (show L2 sub-families in param mappings panel)~~ ✅ Done (Decision #89)
- Phase 5b: Taxonomy panel L2 integration (show L2 categories in taxonomy view)

---

### Override preview: show scoring impact before saving
**Files:** `components/admin/RuleOverrideDrawer.tsx`

Currently admins save overrides blindly — they can't see how a weight or logicType change would affect scoring for a specific part before publishing. A "preview" mode that re-runs scoring with the proposed override and shows the delta would be very valuable.

---

### QC feedback → override workflow
**Files:** `components/admin/QcFeedbackDetailView.tsx`, `components/admin/RuleOverrideDrawer.tsx`

When an admin reviews QC feedback flagging a specific rule, there should be a direct "Create Override" button that pre-fills the RuleOverrideDrawer with the flagged rule's family and attributeId. Currently the admin must navigate to the Logic section manually.

---

### i18n: German translations incomplete for context questions and engineering reasons
**Status:** Partial — Chinese complete, German partial
**Priority:** P1

Chinese i18n coverage is now comprehensive: context questions (842/842), engineering reasons (719/719), and LLM responses all translate. German lags behind:
- **Context questions:** German 238/842 (28%) — passives translated, discrete + IC families missing
- **Engineering reasons:** German 0/719 (0%) — not started
- Untranslated strings fall back to English at runtime (i18next default behavior)

Remaining work: translate ~600 German context question strings and ~611 unique German engineering reason strings. The `scripts/translate-reasons.mjs` pipeline can be reused — generate a `de-translations.json` lookup and update the script to support German output.

**Key files:** `locales/de.json`, `scripts/translate-reasons.mjs`, `scripts/zh-translations.json` (pattern for German).

---

### i18n: Logic table attribute names and match engine notes not translated
**Status:** Not started — future Phases 2 and 4
**Priority:** P1

~900 logic table attribute names (displayed in ComparisonView, LogicPanel, QC feedback) and ~200 match engine generated notes (displayed in comparison detail) are hardcoded English. Translation keys need to be added per `familyId.attributeId` pattern, similar to context questions.

**Note:** Engineering reason translations (Phase 2 partial) are COMPLETE for Chinese (719/719). The remaining Phase 2 work is attribute *names* only. Phase 4 (match engine notes) is untouched.

**Key files:** `lib/logicTables/*.ts` (attribute names), `lib/services/matchingEngine.ts` (generated notes), `components/ComparisonView.tsx`, `components/admin/LogicPanel.tsx`.

---

### Missing logic table rules for attributes referenced in context questions
**Status:** Open — orphaned effects removed in consistency test fix (Decision #56)
**Priority:** P1

Several context questions reference attributes that should have matching rules but don't. The orphaned effects were removed so tests pass, but the underlying rules should be added when a domain expert can validate them:

1. **Family 13 (Mica Capacitors):** `mil_spec` — MIL-spec compliance flag for military/aerospace applications. Mica capacitors are heavily used in mil/aero; a rule for MIL qualification makes sense.
2. **Family 54 (Current Sense Resistors):** `long_term_stability` — long-term resistance drift, important for high-precision measurement applications.
3. **Family 67 (NTC Thermistors):** `long_term_stability` — long-term resistance drift, critical for sensing and compensation applications. Was referenced in 3 context options (sensing, compensation, precision).
4. **Family 67 (NTC Thermistors):** `max_steady_state_current` — maximum steady-state current for inrush limiter applications. Distinct from `max_power`.

**Key files:** `lib/logicTables/micaCapacitors.ts`, `lib/logicTables/currentSenseResistors.ts`, `lib/logicTables/thermistors.ts`, corresponding context question files.

---

### ~~Hardcoded model version in orchestrator~~ COMPLETED
**File:** `lib/services/llmOrchestrator.ts`

Extracted to `MODEL` constant reading from `ANTHROPIC_MODEL` env var (defaults to `claude-sonnet-4-5-20250929`). Added to `.env.example`.

---

### ~~Large components need splitting~~ IN PROGRESS
**Files:** `components/AppShell.tsx`, `components/parts-list/PartsListShell.tsx`, `components/parts-list/PartsListTable.tsx`

**AppShell refactor COMPLETED** (536 → 122 lines). Extracted 4 hooks + 1 sub-component:
- `hooks/useConversationPersistence.ts` — URL hydration, auto-save, drawer, select/new/delete
- `hooks/usePanelVisibility.ts` — skeleton delay, dismissed state, show/hide derivations
- `hooks/useManufacturerProfile.ts` — MFR panel, chat collapse, expand/reset
- `hooks/useNewListWorkflow.ts` — file upload dialog confirm/cancel
- `components/DesktopLayout.tsx` — grid template, all 4 panels, sidebar, history drawer

**PartsListShell refactor COMPLETED** (800 → 348 lines). Extracted 4 hooks + 2 sub-components:
- `hooks/usePartsListAutoLoad.ts` — auto-load from URL/pending file, redirect, default view
- `hooks/useRowSelection.ts` — multi-select, toggle, refresh selected
- `hooks/useRowDeletion.ts` — two-step delete confirmation (permanent vs. hide from view)
- `hooks/useColumnCatalog.ts` — header inference, column building, column mapping fallback
- `components/parts-list/ViewControls.tsx` — view dropdown, kebab menu, default star, delete confirm
- `components/parts-list/PartsListActionBar.tsx` — selection count, refresh/delete buttons, search

**Remaining:**
- PartsListTable: cell rendering, status formatting, price formatting

---

### ~~Mock data incomplete for MLCC recommendations~~ WON'T FIX
**File:** `lib/mockData.ts`

**Decision:** Rather than making mock data more complete, the app should surface a clear error when Digikey is unavailable instead of silently serving mock results. Mock data stays for local development only — production users should never see it. **Done (Decision #78):** All 4 mock product fallback paths removed from `partDataService.ts`. Production users never see mock data for products. Mock files kept for dev/test use only.

---

### ~~Account settings mostly incomplete~~ COMPLETED
**File:** `components/settings/SettingsShell.tsx`

~~3 of 4 tabs are disabled with "Coming Soon": Profile, Data Sources, Notifications. Only Global Settings (language selector) works. Currency selector is also disabled.~~

**Resolved (Decision #76):** Settings page restructured to two functional sections: "General Settings" (language, currency, theme) and "My Profile" (editable name/email + password change). Notifications section removed. Currency selector remains disabled (placeholder).

---

### ~~Debug endpoint has no dev-only guard~~ COMPLETED
**File:** `app/api/debug-env/route.ts`

Added `NODE_ENV !== 'development'` guard — returns 404 in production.

---

### ~~Basic markdown rendering in chat~~ COMPLETED
**File:** `components/MessageBubble.tsx`

Replaced hand-rolled `renderMarkdown()` with `react-markdown` + `remark-gfm`. Now supports headings, code blocks, inline code, links, tables, blockquotes, and strikethrough with M3 dark theme styling.

---

### Some i18n strings hardcoded
**Files:** `components/parts-list/PartsListTable.tsx`, `components/logic/LogicShell.tsx`

Status text in `PartsListTable` (e.g., "Validated", "Error", "Searching") and logic type labels in `LogicShell` are hardcoded English, not using `useTranslation()`.

---

## P2 — Low Priority

### C2 Switching Regulators — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/switchingRegulator.ts`

Of 22 logic table rules, the following have no Digikey parametric mapping: `control_mode`, `compensation_type`, `ton_min`, `gate_drive_current`, `ocp_mode`, `soft_start`, `enable_uvlo`, `rth_ja`, `tj_max`, `aec_q100` (controllers only — integrated has "Qualification"). These are typically datasheet-only specs. Integrated-switch parts have ~50% weight coverage; controller-only parts have ~40%.

**Parts.io partial fill (Decision #77):** `control_mode` now filled from parts.io "Control Mode" field (+9 weight). `compensation_type`, `ton_min`, `gate_drive_current` still datasheet-only.

Key data gaps: No way to distinguish control modes (PCM vs VM vs hysteretic) from Digikey parametric data. No COMP pin presence/type field. No gate drive current for controller-only designs. "Voltage - Output (Min/Fixed)" is mapped to `vref` but is actually the minimum adjustable output voltage for adjustable parts — not exactly the reference voltage (close but not identical for parts with non-unity gain internal dividers).

---

### C3 Gate Drivers — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/gateDriver.ts`

Of 20 logic table rules, the following have no Digikey parametric mapping: `dead_time_control`, `dead_time`, `shutdown_enable` (polarity), `fault_reporting`, `rth_ja`, `tj_max`. Non-isolated "Gate Drivers" category has no propagation delay field; isolated "Isolators - Gate Drivers" has no bootstrap-related fields. Compound fields require 5 transformers (peak source/sink, logic threshold, propagation delay, rise/fall time). `isolation_type` enriched from Digikey category name (non-isolated → "Non-Isolated (Bootstrap)"). `driver_configuration` enriched from "Number of Channels"/"Number of Drivers" for isolated drivers. AEC-Q100 available via "Qualification" for isolated drivers only (not for non-isolated "Gate Drivers" category). ~45-50% weight coverage overall.

**Parts.io partial fill (Decision #77):** Only output current confirmed from parts.io — marginal benefit (~+0 weight since Digikey already has it). `dead_time_control`, `dead_time`, timing specs still datasheet-only.

---

### C4 Op-Amps / Comparators — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/opampComparator.ts`

Of 24 logic table rules, the following have no Digikey parametric mapping: `vicm_range` (w9, BLOCKING — phase reversal risk), `avol` (w5), `min_stable_gain` (w8 — decompensated detection), `input_noise_voltage` (w6), `rail_to_rail_input` (w8 — partially available via "Amplifier Type" but unreliable as a standalone indicator), `aec_q100` (w8), `packaging` (w1). Op-amp category ("Instrumentation, Op Amps, Buffer Amps") has ~50% weight coverage. Comparator category has ~45% weight coverage. Two separate Digikey categories with different field names require two param maps.

**Parts.io partial fill (Decision #77):** `cmrr` (w5) and `avol` (w5) now filled from parts.io (+10 weight). `vicm_range`, `min_stable_gain`, `input_noise_voltage`, GBW, slew rate still NOT available from parts.io.

Key data gaps: VICM range (the BLOCKING phase reversal check) is entirely datasheet-only — this is the biggest safety gap. Min stable gain (decompensated detection) is datasheet-only. Input noise voltage not in parametric data. AEC-Q100 not in Digikey parametric data for either category.

---

### C1 LDO — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/ldo.ts`

12 of 22 logic table rules have no Digikey parametric mapping (~48% weight unmapped): `vout_accuracy`, `output_cap_compatibility` (ceramic stability), `vin_min`, `load_regulation`, `line_regulation`, `power_good`, `soft_start`, `rth_ja`, `tj_max`, `aec_q100`, `packaging`. These are datasheet-only specs. PSRR is available but only as a headline dB number, not at specific frequencies.

**Parts.io partial fill (Decision #77):** `vin_min`, `vout_accuracy`, `line_regulation`, `load_regulation` now filled from parts.io (+23 weight, ~52% → ~65%). `output_cap_compatibility`, `power_good`, `soft_start` still datasheet-only.

Also: `enable_pin` polarity (active-high vs active-low) cannot be determined from Digikey "Control Features" — it only says "Enable" or "-". The transformer defaults to "Active High" which is correct for most modern LDOs but should be verified from datasheets.

---

### C1 LDO — no Jest test coverage yet
**Files:** `__tests__/services/`

Family C1 logic table, context questions, and Digikey mapper transformers have no dedicated tests. Should add tests for: LDO-specific transformers (`transformToEnablePin`, `transformToThermalShutdown`, `transformToOutputCapCompatibility`, `transformToAecQ100`), subcategory routing ("Voltage Regulators - Linear, Low Drop Out (LDO) Regulators" → C1), context question effects (ceramic cap → blockOnMissing, battery → Iq escalation).

---

### Parts.io integration — production URL + rate limits TBD
**Files:** `lib/services/partsioClient.ts`
**Status:** QA environment working, production migration pending

Parts.io integration (Decision #77) is running against the QA environment (`api.qa.parts.io`, requires VPN to `10.20.x.x`). Before production use:
- Obtain production API base URL (currently hardcoded QA URL)
- Confirm rate limits and negotiate quota if needed
- Test with production API key
- Verify that field names are identical between QA and production environments
- Consider adding `PARTSIO_BASE_URL` env var for environment switching

Also: Film capacitors (family 64) returned 0 matches for all test MPNs — worth retesting with additional MPNs. Series voltage references (REF5025) not found but shunt refs (TL431) are — series refs may need different test MPNs.

**FFF/Functional Equivalent fields (Decision #79):** Now extracted and used as candidate source. However, these fields were never observed populated in 30+ test MPNs — need to test more parts to confirm they contain data. Discovery logging is in place (`[parts.io] FFF Equivalent sample:` / `[parts.io] Functional Equivalent sample:` in server console). If consistently empty, investigate alternative parts.io API parameters (e.g., `exactMatch=false`, Class/Category filtering) for candidate search.

---

### SI prefix parsing collision in digikeyMapper
**File:** `lib/services/digikeyMapper.ts`

The `extractNumericValue()` function matches "m" as milli (1e-3). There's a hardcoded exclusion for "mm" (millimeters), but other collisions exist — e.g., "MSL" would match "M" as mega. Parsing is suffix-based and fragile.

---

### Temperature range parser assumes Celsius only
**File:** `lib/services/matchingEngine.ts`

`parseTempRange()` regex: `/([-+]?\d+)\s*°?\s*C?\s*[~to]+\s*([-+]?\d+)\s*°?\s*C?/i` — no support for Kelvin or Fahrenheit. Not a practical issue (component specs are always in Celsius) but the parser is brittle with the `[~to]+` separator.

---

### Tolerance parsing only for `tolerance` attributeId
**File:** `lib/services/matchingEngine.ts`

The `parseTolerance()` helper (strips ±% to numeric) is only invoked when `attributeId === 'tolerance'`. If another attribute uses tolerance semantics (e.g., inductance tolerance), it won't be parsed correctly.

---

### Context modifier has no conflict resolution
**File:** `lib/services/contextModifier.ts`

If two context questions affect the same rule's weight, the second one overwrites the first. No warning, no merging logic. Effects are applied in question iteration order.

---

### Family classifier false positive risk
**File:** `lib/logicTables/familyClassifier.ts`

- Through-hole classifier checks for substring "through hole" — too loose, could match unrelated descriptions
- RF inductor detection uses nanohenry range (< 0.001 µH converted) — brittle if units vary
- Current sense uses AND logic (low resistance AND keyword) — good, less risk

---

### No pagination on lists or conversation history
**Files:** `components/ChatHistoryDrawer.tsx`, `components/lists/ListsDashboard.tsx`

Both load all records at once. Fine for now but will degrade with hundreds of items.

---

### Color constants duplicated
**Files:** `components/ComparisonView.tsx`, `components/RecommendationCard.tsx`, `components/MatchPercentageBadge.tsx`

Dot/status colors (green, yellow, red, grey) are defined independently in multiple components. Should be shared constants or theme tokens.

---

### Delta builder doesn't validate base rules exist
**File:** `lib/logicTables/deltaBuilder.ts`

`buildDerivedLogicTable()` silently skips if a remove or override target doesn't exist in the base table. No warning logged. Could mask typos in `attributeId`.

---

### Validation manager thread safety
**File:** `lib/validationManager.ts`

The subscriber set is module-level singleton. If two users trigger validations simultaneously in a server-side context, subscribers from one validation could receive updates from another. Unlikely in practice (Next.js is mostly single-tenant per request), but architecturally unsound.

---

### No request/response logging
**File:** `lib/services/llmOrchestrator.ts`

LLM tool calls are not logged (beyond console). No visibility into what the orchestrator searched for, what attributes it found, or what recommendations it produced. Would be valuable for debugging and analytics.

---

### Supabase schema managed manually
**File:** `scripts/supabase-schema.sql`

No migration tool (like Prisma Migrate or Supabase CLI migrations). Schema changes require manually editing the SQL file and applying to the database.

---

## Product Roadmap Items

The following items track the phased evolution from cross-reference engine to component intelligence platform. See `docs/PRODUCT_ROADMAP.md` for full details.

### Phase 1: User Preferences Foundation
~~**Status:** Partially started (Profile UI done, preferences JSONB not yet)~~
**Status:** Done (Decision #82)

~~Build Profile panel UI (replace "Coming Soon" placeholder).~~ Done (Decision #76) — editable name/email + password change.

~~Add `preferences` JSONB column to `profiles` table. Define `UserPreferences` type. Add optional role/industry to registration. Build `GET/PUT /api/profile/preferences` endpoint.~~ Done (Decision #82) — full UserPreferences type, registration with optional businessRole/industry. Settings reorganized into 3 sections: My Account (ProfilePanel), Preferences (PreferencesPanel), General Settings (AccountPanel). Currency enabled in General Settings, wired to `UserPreferences.defaultCurrency`.

**Update (Decision #94):** Registration redesigned as 2-step wizard (credentials → onboarding agent). Settings restructured to 4 sections: My Account, My Profile (free-form profile prompt), Company Settings (renamed from Preferences), General Settings. Profile prompt replaces structured role/industry dropdowns — LLM extraction populates structured fields on save. BusinessRole expanded to 9 values with backward-compatible migration. Manufacturing regions replaced by curated 25-country list + shipping destinations.

---

### Phase 2: LLM Context Injection
~~**Status:** Not started~~
**Status:** Done (Decision #82)

~~Modify orchestrator to accept user context. Build dynamic system prompt section from preferences. Thread preferences through `/api/chat` and `/api/modal-chat`.~~ Done — `buildUserContextSection()`, behavioral instructions, + 5 history tools (`get_my_recent_searches`, `get_my_lists`, `get_list_parts`, `get_my_past_recommendations`, `get_my_conversations`). **Update (Decision #96):** Added `get_list_parts` tool — queries row-level data within BOMs (aggregate breakdowns or filtered detail rows). `get_my_lists` now returns list IDs.

---

### Phase 3: Global Effects on Matching Engine
~~**Status:** Not started~~
**Status:** Done (Decision #82)

~~Create `contextResolver.ts` — resolves user/list preferences into `AttributeEffect[]`. Thread global context through `partDataService.getRecommendations()` and all API routes.~~ Done — `resolveUserEffects()` + `applyUserEffectsToLogicTable()`. Preferred/excluded manufacturers merged/filtered. Applied before per-family context (more specific wins).

---

### Phase 4: List-Level Context
**Status:** Not started
**Priority:** P2

Add `context` JSONB column to `parts_lists` table. Define `ListContext` type. Build list context UI (dialog/drawer in parts list). Merge list context with user preferences in `contextResolver`.

**Key files:** `lib/types.ts`, `scripts/supabase-schema.sql`, parts list UI, `hooks/usePartsListState.ts`

---

### ~~Phase 5: Manufacturer Filtering & Ranking~~
**Status:** Done (Decision #82)

~~Apply preferred/excluded manufacturer filters to candidate search results. Optionally boost match scores for preferred manufacturers.~~ Done — preferred manufacturers merged from user preferences + per-call. Excluded manufacturers filtered post-scoring.

**Key files:** `lib/services/partDataService.ts`, `lib/services/matchingEngine.ts`

---

### Phase 6: Chinese Manufacturer Highlighting
**Status:** Done (Decision #66)
**Priority:** P2

Atlas badge (globe icon) on recommendation cards when `dataSource === 'atlas'`. Tooltip "Atlas — Chinese manufacturer". Non-promotional, informative only.

**Remaining:** Add same badge to `PartsListTable` "Top Suggestion" column for Atlas-sourced recommendations.

---

### Phase 7: Atlas Integration & Manufacturer Profile API
**Status:** Partially done (Decisions #66, #67, #68, #69)
**Priority:** P2

Atlas product database integrated: 99 manufacturers, 27,030 products ingested into Supabase `atlas_products` table. Parallel search + candidate fetch working. Admin panel for ingestion monitoring built. Per-family Chinese→English parameter translation dictionaries added for all 28 families (Decision #67) — average mapped params went from 0.5–2 to 3–9 per product. Atlas Dictionary admin panel built with Supabase-backed override layer (Decision #68). Coverage analytics added: per-manufacturer coverage % column + per-family gap analysis drawer comparing Atlas vs Digikey vs logic table requirements (Decision #69).

**Remaining:**
- Manufacturer profile API (company profiles, verification, factory audit, export compliance)
- Replace `mockManufacturerData.ts` with Atlas-fed profiles
- ManufacturerProfilePanel enrichment with Atlas company data
- Further reduce unmapped param warnings (~40K remaining, mostly manufacturer-specific naming variants)
- Atlas badge in `PartsListTable` "Top Suggestion" column (from Phase 6 remaining)

**Key files:** `lib/services/atlasClient.ts`, `lib/services/atlasMapper.ts`, `lib/services/atlasDictOverrides.ts`, `lib/types.ts`, `components/ManufacturerProfilePanel.tsx`, `components/admin/AtlasDictionaryPanel.tsx`, `components/admin/AtlasCoverageDrawer.tsx`, `scripts/atlas-ingest.mjs`

---

### ~~Phase 8: Commercial Data Enrichment (Multi-Supplier)~~ PARTIALLY COMPLETED
**Status:** Mouser integration done (Decision #83); Arrow/Nexar and customer pricing remaining
**Priority:** P3

~~Integrate pricing enrichment API.~~ Done — Mouser Search API v2 integrated as second distributor. `SupplierQuote[]` model with `PartAvailability` type. Live pricing, stock, lead time, lifecycle, and MOQ for both Digikey and Mouser. `enrichWithMouser()` gap-fill in `partDataService.ts`. Parts list batch enrichment via `validateRow()`. `SupplierPricingDrawer` shows multi-supplier comparison.

**Remaining:**
- Arrow/Nexar: Next distributor API integration (extend `SupplierQuote[]` model)
- Customer negotiated pricing overlays
- Mouser: ComparisonView multi-supplier pricing table (Phase 3C — side-by-side pricing comparison in xref detail view)
- Mouser: Add Mouser suggested replacements as candidate source in `getRecommendations()` for obsolete/EOL parts
- Mouser: "Commercial" view template with DK/Mouser price/stock/lead time columns pre-configured
- Mouser: Lifecycle status reconciliation (worst-status-wins across Digikey, Parts.io, Mouser)

---

### Phase 9: Customer Data Integration
**Status:** Not started
**Priority:** P3

Customer data imports (BOMs, pricing files, AVLs). Negotiated pricing overlays. AVL-restricted recommendations. Per-organization data isolation.

---

### Phase 10: Market Monitoring & Proactive Alerts
**Status:** Not started
**Priority:** P3

Watchlists, event detection, proactive alerts, portfolio risk dashboard. Requires background job system beyond current Next.js architecture.

---

## Onboarding & Profile Follow-ups (Decision #94)

### Profile prompt → matching engine effects
**Status:** Not started
**Priority:** P2

The new profile fields (`productionVolume`, `projectPhase`, `goals`, `productionTypes`) are extracted from the profile prompt and stored as structured data, but `contextResolver.ts` does not yet generate `AttributeEffect[]` from them. Potential effects:
- `productionVolume: 'prototype'` → suppress cost-optimization weights, emphasize availability
- `projectPhase: 'sustaining_eol'` → escalate lifecycle/EOL risk rules
- `goals: 'reduce_sole_source'` → boost multi-source availability scoring

### Re-launch onboarding from settings
**Status:** Not started
**Priority:** P3

Allow users to re-run the onboarding agent conversation from Settings → My Profile (e.g., a "Guided setup" button that replaces the text area with the chat flow temporarily). Currently onboarding only appears once at registration.

### i18n for onboarding and new settings sections
**Status:** Not started
**Priority:** P3

The onboarding agent messages, chip labels, and new settings section labels (My Profile, Company Settings) are hardcoded in English. Add translation keys to `locales/en.json`, `locales/de.json`, `locales/zh-CN.json`.

---

## Code Audit Follow-ups (Decision #95)

### Unit tests for new profile/preferences services
**Status:** Not started
**Priority:** P2

Three new services have zero test coverage:
- `lib/services/profileExtractor.ts` — `validateExtraction()` is pure and highly testable (enum validation, array filtering, goal cap at 3)
- `lib/services/userPreferencesService.ts` — `migratePreferences()` is pure (role mapping, industry normalization)
- `lib/services/contextResolver.ts` — `resolveUserEffects()` is pure (compliance escalation, industry-based rule boosting)

### Fix fire-and-forget migration write-back
**Status:** Not started
**Priority:** P2

`userPreferencesService.ts:67-77` — the Supabase migration auto-write-back uses `.then(() => {})`, silently swallowing errors. Should at minimum log errors: `.then(({ error }) => { if (error) console.error(...) })`.

### Remove dead "Other" role text field in OnboardingAgent
**Status:** Not started
**Priority:** P2

`components/auth/OnboardingAgent.tsx:542-545` — hidden `<Box sx={{ display: 'none' }} />` placeholder and `otherRoleText` state are dead code. Either implement the "Other" free-text input or remove the state + placeholder.
