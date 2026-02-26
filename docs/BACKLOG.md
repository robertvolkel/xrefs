# Backlog

Known gaps, incomplete features, and inconsistencies found during project audit (Feb 2026).

---

## P0 — High Priority

### ~~Digikey parameter maps incomplete for most families~~ COMPLETED
**File:** `lib/services/digikeyParamMap.ts`

All 19 passive families + 9 discrete semiconductor families (B1–B9) now have curated parameter maps. See Decisions #16-19, #30-40 for API quirks.

**Completed:** MLCC (12, 14 attrs), Chip Resistors (52-55, 11 attrs), Fixed Inductors (71/72, 15 attrs), Ferrite Beads (70, 10 attrs), Common Mode Chokes (69, 13 attrs), Tantalum (59, 9 attrs + 2 placeholders), Aluminum Electrolytic (58, 15 attrs), Aluminum Polymer (60, 14 attrs + 2 placeholders), Film (64, 13 attrs), Supercapacitors (61, 11 attrs + 2 placeholders), Varistors (65, 8 attrs + 1 placeholder), PTC Resettable Fuses (66, 13 attrs incl. dual height fields), NTC Thermistors (67, 8 attrs + 2 placeholders), PTC Thermistors (68, 4 attrs + 1 placeholder), Rectifier Diodes (B1, 11 attrs single + 9 attrs bridge + 2 placeholders), Schottky Barrier Diodes (B2, 11 attrs single + 11 attrs array, virtual category routing), Zener Diodes (B3, 10 attrs single + 11 attrs array), TVS Diodes (B4, 13 attrs), MOSFETs (B5, 14 attrs, verified Feb 2026), BJTs (B6, 11 attrs, verified Feb 2026), IGBTs (B7, 14 attrs incl. 2 compound fields, verified Feb 2026), Thyristors/SCRs (B8-SCR, 8 attrs, ~48% weight coverage, verified Feb 2026), Thyristors/TRIACs (B8-TRIAC, 9 attrs incl. compound "Triac Type" field, ~51% weight coverage, verified Feb 2026).

**Known data gaps (accepted):** PTC thermistors have extremely sparse Digikey data (4 of 15 logic table rules mappable). Varistors missing clamping voltage (w9). NTC B-value only maps B25/50 (bead types with only B25/100 won't match). Rectifier diodes and Schottky diodes have no AEC-Q101 in parametric data. Schottky-specific fields (Ifsm, Rth_jc, Rth_ja, Tj_max, Pd, technology_trench_planar, vf_tempco) not in Digikey parametric data. Zener diodes missing Izt (w8), TC (w7), Izm (w6), Rth_ja (w6), Tj_max (w6), Cj (w4), Zzk (w4), pin_configuration (w10), height (w5) — ~51% weight coverage for singles, ~57% for arrays. Digikey uses "AEC-Q100" (not Q101) for Zener categories. TVS diodes missing ir_leakage (w5), response_time (w6), esd_rating (w7), pin_configuration (w10), height (w5), rth_ja (w5), tj_max (w6), pd (w5), surge_standard (w8) — ~61% weight coverage (108/177). Polarity derived from field name presence, not a standard parameter.

---

### ~~No automated tests~~ COMPLETED
**Location:** `__tests__/services/`

Jest test suite added with 240 tests across 6 suites, covering all priority candidates:
- `matchingEngine.test.ts` (60 tests) — all 7 rule evaluators, scoring math, fail propagation, partial credit, blockOnMissing, edge cases
- `familyClassifier.test.ts` (45 tests) — all variant classifiers (54/55/53/60/13/72/B2/B3/B4/B9), B5/B6/B7/B8 standalone, cross-family safety, rectifier enrichment, JFET detection
- `deltaBuilder.test.ts` (14 tests) — REMOVE→OVERRIDE→ADD order, immutability, silent skip, auto-sortOrder
- `contextModifier.test.ts` (14 tests) — all 5 effect types, blockOnMissing propagation, last-writer-wins, skip behaviors
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

### Account settings mostly incomplete
**File:** `components/AccountSettingsDialog.tsx`

3 of 4 tabs are disabled with "Coming Soon": Profile, Data Sources, Notifications. Only Global Settings (language selector) works. Currency selector is also disabled.

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
