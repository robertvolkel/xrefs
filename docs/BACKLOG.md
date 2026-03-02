# Backlog

Known gaps, incomplete features, and inconsistencies found during project audit (Feb 2026).

---

## P0 — High Priority

### ~~Digikey parameter maps incomplete for most families~~ COMPLETED
**File:** `lib/services/digikeyParamMap.ts`

All 19 passive families + 9 discrete semiconductor families (B1–B9) + 5 Block C IC families (C1 LDOs, C2 Switching Regulators, C3 Gate Drivers, C4 Op-Amps/Comparators, C5 Logic ICs) now have curated parameter maps. See Decisions #16-19, #30-40, #46-50 for API quirks.

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

Added `dataSource: 'digikey' | 'mock'` to `PartAttributes`. `partDataService.getAttributes()` tags every return path. `AttributesPanel` shows an amber "Mock Data" chip when `dataSource === 'mock'`. See Decision #20.

---

### ~~No .env.example file~~ COMPLETED
**Location:** Project root

Created `.env.example` with all required variables, placeholder values, and comments explaining each variable and where to obtain credentials.

---

## P1 — Medium Priority

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

**Decision:** Rather than making mock data more complete, the app should surface a clear error when Digikey is unavailable instead of silently serving mock results. Mock data stays for local development only — production users should never see it. See future work: remove mock fallback from the recommendation path and show a "Digikey unavailable" message instead.

---

### ~~Account settings mostly incomplete~~ SUBSUMED
**File:** `components/AccountSettingsDialog.tsx`

3 of 4 tabs are disabled with "Coming Soon": Profile, Data Sources, Notifications. Only Global Settings (language selector) works. Currency selector is also disabled.

**Note:** The Profile tab is now tracked as Phase 1 of the Product Roadmap (user preferences foundation). Data Sources and Notifications will be addressed in later phases. See `docs/PRODUCT_ROADMAP.md`.

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

Key data gaps: No way to distinguish control modes (PCM vs VM vs hysteretic) from Digikey parametric data. No COMP pin presence/type field. No gate drive current for controller-only designs. "Voltage - Output (Min/Fixed)" is mapped to `vref` but is actually the minimum adjustable output voltage for adjustable parts — not exactly the reference voltage (close but not identical for parts with non-unity gain internal dividers).

---

### C3 Gate Drivers — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/gateDriver.ts`

Of 20 logic table rules, the following have no Digikey parametric mapping: `dead_time_control`, `dead_time`, `shutdown_enable` (polarity), `fault_reporting`, `rth_ja`, `tj_max`. Non-isolated "Gate Drivers" category has no propagation delay field; isolated "Isolators - Gate Drivers" has no bootstrap-related fields. Compound fields require 5 transformers (peak source/sink, logic threshold, propagation delay, rise/fall time). `isolation_type` enriched from Digikey category name (non-isolated → "Non-Isolated (Bootstrap)"). `driver_configuration` enriched from "Number of Channels"/"Number of Drivers" for isolated drivers. AEC-Q100 available via "Qualification" for isolated drivers only (not for non-isolated "Gate Drivers" category). ~45-50% weight coverage overall.

---

### C4 Op-Amps / Comparators — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/opampComparator.ts`

Of 24 logic table rules, the following have no Digikey parametric mapping: `vicm_range` (w9, BLOCKING — phase reversal risk), `avol` (w5), `min_stable_gain` (w8 — decompensated detection), `input_noise_voltage` (w6), `rail_to_rail_input` (w8 — partially available via "Amplifier Type" but unreliable as a standalone indicator), `aec_q100` (w8), `packaging` (w1). Op-amp category ("Instrumentation, Op Amps, Buffer Amps") has ~50% weight coverage. Comparator category has ~45% weight coverage. Two separate Digikey categories with different field names require two param maps.

Key data gaps: VICM range (the BLOCKING phase reversal check) is entirely datasheet-only — this is the biggest safety gap. Min stable gain (decompensated detection) is datasheet-only. Input noise voltage not in parametric data. AEC-Q100 not in Digikey parametric data for either category.

---

### C1 LDO — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/ldo.ts`

12 of 22 logic table rules have no Digikey parametric mapping (~48% weight unmapped): `vout_accuracy`, `output_cap_compatibility` (ceramic stability), `vin_min`, `load_regulation`, `line_regulation`, `power_good`, `soft_start`, `rth_ja`, `tj_max`, `aec_q100`, `packaging`. These are datasheet-only specs. PSRR is available but only as a headline dB number, not at specific frequencies.

Also: `enable_pin` polarity (active-high vs active-low) cannot be determined from Digikey "Control Features" — it only says "Enable" or "-". The transformer defaults to "Active High" which is correct for most modern LDOs but should be verified from datasheets.

---

### C1 LDO — no Jest test coverage yet
**Files:** `__tests__/services/`

Family C1 logic table, context questions, and Digikey mapper transformers have no dedicated tests. Should add tests for: LDO-specific transformers (`transformToEnablePin`, `transformToThermalShutdown`, `transformToOutputCapCompatibility`, `transformToAecQ100`), subcategory routing ("Voltage Regulators - Linear, Low Drop Out (LDO) Regulators" → C1), context question effects (ceramic cap → blockOnMissing, battery → Iq escalation).

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
**Status:** Not started
**Priority:** P1

Add `preferences` JSONB column to `profiles` table. Define `UserPreferences` type. Build Profile panel UI (replace "Coming Soon" placeholder). Add optional role/industry to registration. Build `GET/PUT /api/profile/preferences` endpoint.

**Key files:** `lib/types.ts`, `scripts/supabase-schema.sql`, `components/settings/ProfilePanel.tsx`, `app/api/profile/preferences/route.ts`

---

### Phase 2: LLM Context Injection
**Status:** Not started
**Priority:** P1

Modify orchestrator to accept user context. Build dynamic system prompt section from preferences. Thread preferences through `/api/chat` and `/api/modal-chat`.

**Key files:** `lib/services/llmOrchestrator.ts`, `app/api/chat/route.ts`, `app/api/modal-chat/route.ts`

---

### Phase 3: Global Effects on Matching Engine
**Status:** Not started
**Priority:** P1

Create `contextResolver.ts` — resolves user/list preferences into `AttributeEffect[]`. Thread global context through `partDataService.getRecommendations()` and all API routes.

**Key files:** `lib/services/contextResolver.ts` (new), `lib/services/contextModifier.ts`, `lib/services/partDataService.ts`

---

### Phase 4: List-Level Context
**Status:** Not started
**Priority:** P2

Add `context` JSONB column to `parts_lists` table. Define `ListContext` type. Build list context UI (dialog/drawer in parts list). Merge list context with user preferences in `contextResolver`.

**Key files:** `lib/types.ts`, `scripts/supabase-schema.sql`, parts list UI, `hooks/usePartsListState.ts`

---

### Phase 5: Manufacturer Filtering & Ranking
**Status:** Not started
**Priority:** P2

Apply preferred/excluded manufacturer filters to candidate search results. Optionally boost match scores for preferred manufacturers.

**Key files:** `lib/services/partDataService.ts`, `lib/services/matchingEngine.ts`

---

### Phase 6: Chinese Manufacturer Highlighting
**Status:** Not started
**Priority:** P2

Add manufacturer→country resolution and display a subtle icon/badge on Chinese manufacturer options in `RecommendationCard` and `PartsListTable`. Non-intrusive — icon only, no ranking changes.

**Key files:** `components/RecommendationCard.tsx`, `components/parts-list/PartsListTable.tsx`, `lib/mockManufacturerData.ts`

---

### Phase 7: Atlas Integration & Manufacturer Profile API
**Status:** Not started
**Priority:** P2

Build Atlas API client + mapper. Replace static `mockManufacturerData.ts` with API-fed profiles from Atlas. Extend `ManufacturerProfile` with Chinese-manufacturer-specific fields (verification, factory audit, export compliance). Integrate Atlas products as candidate source.

**Key files:** `lib/services/atlasClient.ts` (new), `lib/services/atlasMapper.ts` (new), `lib/types.ts`, `components/ManufacturerProfilePanel.tsx`

---

### Phase 8: Commercial Data Enrichment (Multi-Supplier)
**Status:** Not started
**Priority:** P3

Integrate pricing enrichment API (Octopart/Nexar or similar). Extend `Part` type with `supplierPricing`. Build pricing comparison UI. Add lifecycle status tracking. Customer negotiated pricing overlays.

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
