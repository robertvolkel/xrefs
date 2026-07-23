# Architectural Decisions — Archive (Decisions 100–199)

> Full text of decisions 100–199. The index lives in [docs/DECISIONS.md](DECISIONS.md).
> Historical record — some entries here are superseded by later decisions.

## Decision #100 — Gaia Datasheet-Extracted Parameter Mapping for Atlas (Mar 2026)

**Decision:** Add a gaia parameter preprocessing layer to the Atlas mapper that handles structured datasheet-extracted parameters (`gaia-{stem}-{Min|Max|Typ}` format), plus a shared JSON dictionary approach to eliminate code duplication between `atlasMapper.ts` and `atlas-ingest.mjs`.

**Problem:** 64% of Atlas products (35K of 55K) had parametric data being thrown away. The Atlas mapper only handled Chinese parameter names via per-family dictionaries. Three unmapped data formats existed: (1) `gaia-*` prefixed params from Gaia datasheet extraction technology — 19K distinct names, structured and consistent across all MFRs; (2) plain English params with MFR-specific abbreviations (1,327 distinct names); (3) Chinese params already handled by existing dictionaries.

**Impact:** YFW rectifier diodes went from 1 mapped param (package only) to 10 params (Vrrm, Io, Vf, Ifsm, Cj, Ir, thermal resistance, operating temp). YFW MOSFETs went from 1 to 17-18 params. All 54,746 products re-ingested with 0 errors.

**Architecture:**
- New lookup chain: gaia prefix check → family gaia dict → shared gaia dict → existing Chinese/English dict → shared dict → skip/warn
- `parseGaiaParam()` strips `gaia-` prefix and `-Min/-Max/-Typ/-Nom` suffix, returns `{ stem, suffix }`
- `parseGaiaValue()` splits embedded unit values (`"5.8 mΩ"`, `"±20 V"`, `"-55 to +150 °C"`) into display + numeric + unit
- `preferredSuffix` field on mappings controls which variant to use (e.g., `rds_on` wants Max, `ciss` wants Typ)
- `seenAttributeIds` set prevents duplicates when same stem appears at multiple test conditions
- Gaia params that map to `_`-prefixed attributeIds are internal-only (stored but not displayed)

**Shared JSON approach:** `lib/services/atlas-gaia-dicts.json` is the single source of truth for gaia dictionaries. Both `atlasMapper.ts` (TS import) and `atlas-ingest.mjs` (file read + JSON parse) consume the same file — no dictionary duplication.

**Families covered (Phase 1):** B1 Rectifiers (~25 stem mappings), B3 Zener (~15), B4 TVS (~20), B5 MOSFETs (~30), B6 BJTs (~25), B7 IGBTs (~9), B8 Thyristors (~15), C1 LDOs (~14), C2 Switching Regs (~10), C4 Op-Amps (~20), D1 Crystals (~11), 71 Inductors (~12), plus shared operating temp mappings.

**Phase 2 (future):** Expand existing per-family dictionaries with plain English alias entries for MFR-specific formats (`RDS(ON) @10VTyp (mΩ)`, `BVDSS (V)`, `BV(V)`, etc.). Same dictionary approach, just more entries — no architectural change needed.

**New files:** `lib/services/atlasGaiaDictionaries.ts` (TS module: parse functions, skip stems, type-safe exports), `lib/services/atlas-gaia-dicts.json` (shared dictionary data).

**Modified files:** `lib/services/atlasMapper.ts` (import gaia module, gaia preprocessing in `mapAtlasModel()` loop with suffix preference + dedup), `scripts/atlas-ingest.mjs` (load shared JSON, inline `parseGaiaParam()`/`parseGaiaValue()`, mirror gaia-first logic in `mapModel()`).

**Also in this session:** Atlas admin panel improvements — all manufacturers now expandable (not just scorable), breakdown table shows "Scorable" column, top-level columns are sortable. Files: `app/api/admin/atlas/route.ts`, `components/admin/AtlasPanel.tsx`.

## Decision #101 — Rule Override Audit History, Revert & Annotations (Mar 2026)

**Decision:** Add full audit trail, version restore, and admin annotation threads to the rule override system.

**Problem:** When admins changed logic table rules via the override system (Decision #60), there was no way to see the history of changes, no field-level diffs ("weight changed from 5 to 8"), and no way to restore a previous version. The PATCH endpoint modified records in-place, destroying previous state. Additionally, admins had no way to leave notes on rules for other admins — they had to commit to a change or communicate out-of-band.

**Architecture — Audit Trail:**
- Added `previous_values JSONB` column to `rule_overrides` table. Each override record captures a snapshot of the rule state BEFORE the change was applied (computed at write time from the active override or TS base).
- Converted PATCH to a **deactivate-and-create** pattern: every edit now deactivates the current record and inserts a new immutable record with `previous_values`. No more in-place mutations.
- POST also captures `previous_values` before deactivating the existing override.
- The chain of deactivated records + `previous_values` forms a complete, diffable history.
- Admin names resolved via batch `profiles` lookup (`resolveAdminNames()` helper).

**Architecture — History & Restore:**
- `GET /api/admin/overrides/rules/history?family_id=X&attribute_id=Y` — Returns ALL records (active + inactive) with admin names + the TS base rule for reference.
- `POST /api/admin/overrides/rules/restore` — Creates a new active override from any history entry's field values, with its own `previous_values` snapshot.
- "Restore to TS base" uses the existing DELETE (soft-delete) on the active override.

**Architecture — Annotations:**
- New `rule_annotations` Supabase table — flat comment list keyed on `family_id + attribute_id` (not on override records). Admins can discuss any rule whether or not it's been overridden.
- Comments can be resolved/unresolved (like GitHub review comments). Own comments can be edited or hard-deleted. Any admin can resolve.
- `GET/POST /api/admin/overrides/rules/annotations` (family-level or rule-level), `PATCH/DELETE .../annotations/[annotationId]`.

**UI — LogicPanel:**
- Override tooltip enhanced: now shows admin name + date + reason (was just action + reason).
- Red circle badge with white count on rules with unresolved annotations.
- Single API call fetches all annotations for the family (not N calls per rule).

**UI — RuleOverrideDrawer:**
- **Annotations section** (auto-expands if unresolved annotations exist): comment input at top, unresolved list below, resolved comments collapsed with toggle.
- **Change History section** (collapsible): vertical timeline with field-level diff chips (`Weight: 5 → 8`), admin names, relative dates, restore buttons. TS base shown as anchor entry at bottom.
- Restore flow: click restore → confirm dialog with reason → new override created from historical values.

**Pre-existing overrides:** Records created before this feature have `previous_values = NULL`. The history timeline shows "Pre-audit change" for these entries.

**New files:** `lib/services/overrideHistoryHelper.ts`, `app/api/admin/overrides/rules/history/route.ts`, `app/api/admin/overrides/rules/restore/route.ts`, `app/api/admin/overrides/rules/annotations/route.ts`, `app/api/admin/overrides/rules/annotations/[annotationId]/route.ts`.

**Modified files:** `scripts/supabase-overrides-schema.sql`, `lib/types.ts`, `lib/api.ts`, `app/api/admin/overrides/rules/route.ts`, `app/api/admin/overrides/rules/[overrideId]/route.ts`, `components/admin/LogicPanel.tsx`, `components/admin/RuleOverrideDrawer.tsx`, `locales/en.json`, `locales/zh-CN.json`.

**Future:** Same pattern can be applied to `context_overrides` (same schema + API approach). Override preview (scoring impact before saving) and QC feedback→override workflow remain as P1 backlog items.

---

## Decision #102 — Atlas Explorer QC Tool + L2 Category Dictionaries (Mar 2026)

**Decision:** Build an Atlas data QC tool (Explorer) in the admin panel and add L2 category Chinese/English translation dictionaries for all 14 L2 categories so Atlas products outside the 43 L3 families get their parameters mapped to standard attribute IDs.

**Problem:** Atlas products that don't match any of the 43 L3 families got `family_id = null` and `category = 'ICs'` (generic fallback). Their Chinese parameter names stayed unmapped because dictionaries only existed for L3 families. Admins had no way to search and inspect individual Atlas products to verify data quality.

**Architecture — Atlas Explorer:**
- `GET /api/admin/atlas/explorer?q=` — MPN/manufacturer search via Supabase `ilike`, returns up to 50 results with familyName and parameterCount.
- `GET /api/admin/atlas/explorer/[id]` — Detail endpoint: fetches product, builds L3 `schemaComparison` (from logic table rules) OR L2 `schemaComparison` (from L2 param maps via `getL2ParamMapForCategory()`), plus `extraAttributes` and `rawParameters`.
- `AtlasExplorerTab.tsx` — Search bar + results table with debounced search (300ms). Columns: MPN, Manufacturer, Family (chip), Category, Status (chip), Params count.
- `AtlasExplorerDrawer.tsx` — 660px right-side drawer: identity block, coverage bar, schema comparison table (L3: Attribute/Weight/Type/Value; L2: Attribute/Value), collapsible extra attributes, collapsible raw parameters. Row tinting: green=present, red=missing+blockOnMissing (L3), amber=missing (L2).
- Added as "Search" tab in AtlasPanel (alongside existing "Overview" manufacturer stats tab).

**Architecture — L2 Category Classification:**
- `classifyAtlasCategory()` in both `atlasMapper.ts` and `atlas-ingest.mjs` now detects all 14 L2 categories (Microcontrollers, Memory, Sensors, RF/Wireless, LEDs, Switches, Connectors, Transformers, Filters, Battery Products, Motors/Fans, Audio, Power Supplies, Processors) between L3 family checks and the generic catch-all. Products that previously fell through to `{ category: 'ICs' }` now get their correct L2 category, enabling dictionary lookup.

**Architecture — L2 Translation Dictionaries:**
- `atlasL2ParamDictionaries` in `atlasMapper.ts` — Record keyed by `ComponentCategory` string, each mapping Chinese + English param names → internal `attributeId` for that category's L2 param map attributes. All 14 categories covered.
- `L2_PARAMS` in `atlas-ingest.mjs` mirrors the TS dictionaries (must stay in sync).
- `mapAtlasModel()` familyDict resolution: `classification.familyId ? atlasParamDictionaries[familyId] : atlasL2ParamDictionaries[classification.category]`.
- Shared dictionary expanded with `主要封装` (main package) and `电压` (voltage) — common short Chinese variants used across categories.
- Re-ingestion required for changes to take effect (mapping happens at ingest time).

**Architecture — Atlas Dictionaries Admin for L2:**
- `GET /api/admin/atlas/dictionaries` now accepts `?category=Microcontrollers` in addition to `?familyId=B5`. L2 queries use `getAtlasL2ParamDictionary()` and query `atlas_products` by `category` (not `family_id`).
- `AtlasDictionaryPanel.tsx` accepts `l2Category?: string` prop. FamilyPicker shows L2 categories for the atlas-dictionaries section.
- Validation updated to check both L3 and L2 base dictionaries for modify/remove actions.

**Architecture — L2 Param Map Lookup:**
- `getL2ParamMapForCategory()` added to `digikeyParamMap.ts` — returns the L2 param map object for a given `ComponentCategory` string. Used by the Explorer detail endpoint for L2 schema comparison.

**Key gotchas:**
- Explorer API returns raw JSON (not `{ success, data }` envelope) — client uses `fetch()` not `fetchApi()`.
- Short Chinese param variants (e.g., `容量` for capacity, `频率(mhz)` with unit suffix) must be added to dictionaries — Atlas data often uses abbreviated forms.
- Sort order column removed from dictionary tables (no user value).
- Dictionary keys are always lowercase — `lowerName = p.name.toLowerCase().trim()`.

**New files:** `app/api/admin/atlas/explorer/route.ts`, `app/api/admin/atlas/explorer/[id]/route.ts`, `components/admin/AtlasExplorerTab.tsx`, `components/admin/AtlasExplorerDrawer.tsx`.

**Modified files:** `lib/services/atlasMapper.ts`, `lib/services/digikeyParamMap.ts`, `lib/api.ts`, `scripts/atlas-ingest.mjs`, `app/api/admin/atlas/dictionaries/route.ts`, `components/admin/AtlasPanel.tsx`, `components/admin/AtlasDictionaryPanel.tsx`, `components/admin/AdminShell.tsx`, `locales/en.json`.

## Decision #103 — Parts.io Param Map Audit & Atlas Coverage Drawer PIO Column (Mar 2026)

**Decision:** Audit all 17 parts.io class `classExtraFields` for fields that should be mapped to logic table attributeIds, map them, and add a Parts.io (PIO) column to the Atlas Coverage Drawer so admins can see all data source coverage in one view.

**Problem:** The parts.io param maps were built from initial API testing with 1-2 MPNs per class. Fields returned by the API that weren't immediately recognized were placed in `classExtraFields` (unmapped extras shown in the admin panel). Over time, as logic tables expanded to 43 families, many of these "extra" fields turned out to map directly to critical matching rules — but they were silently dropped during enrichment, reducing coverage. The Atlas Coverage Drawer only showed Atlas, Dict, and DK columns, omitting parts.io entirely.

**Audit findings — 10 newly mapped fields:**

| Class | Field | attributeId | Family | Weight |
|---|---|---|---|---|
| Inductors | `Saturation Current` | `saturation_current` | 71 Power Inductors | 9 |
| Transistors | `FET Technology` | `technology` | B5 MOSFETs | 9 |
| Transistors | `Gate-Source Voltage-Max` | `vgs_max` | B5 MOSFETs | 8 |
| Drivers And Interfaces | `Output Polarity` | `output_polarity` | C3 Gate Drivers | 9 |
| Drivers And Interfaces | `Output Low Current-Max` | `peak_sink_current` | C3 Gate Drivers | 8 |
| Trigger Devices | `Latching Current-Max` | `il` | B8 Thyristors | 6 |
| Trigger Devices | `I²T For Fusing-Max` | `i2t` | B8 Thyristors | 6 |
| Crystals/Resonators | `Shunt Capacitance` | `shunt_capacitance_pf` | D1 Crystals | 6 |
| Signal Circuits | `Supply Current-Max (Isup)` | `icc_active_ma` | C8 Timers/Osc | 6 |
| Relays | `Mechanical Life` | `mechanical_life_ops` | F1 EMR Relays | 5 |
| Diodes | `Configuration` | `configuration` | B1-B4 Diodes | 10 |

**Data quality bugs fixed:**
- `Circuit Protection` > `Fuse Size` was in both `classExtraFields` and `circuitProtectionParamMap` — removed from extras.
- `Optoelectronics` > `On-State Current-Max` was in both `classExtraFields` and `optoelectronicsParamMap` — removed from extras.

**`specialMergeAttrs` mechanism:** The parts.io mapper has special merge functions (`mergeOperatingTemp()`, `mergeSupplyVoltageRange()`) that run unconditionally and produce `operating_temp` and `supply_voltage` attributes by combining Min/Max fields. These attributes weren't reflected in `reversePartsioParamLookup()`, so the coverage drawer and admin panel didn't know parts.io covers them. Added a `specialMergeAttrs` array that the reverse lookup consults, so coverage reporting is accurate.

**Atlas Coverage Drawer PIO column:** Added `inPartsio` boolean to the coverage API response (`/api/admin/atlas/coverage`) using `reversePartsioParamLookup()`. Drawer now shows 4 source columns: Atlas (product count + %), Dict (checkmark), DK (checkmark), PIO (checkmark, amber color). Drawer widened from 580→630px.

**Impact on matching accuracy:** These fields were already being returned by the parts.io API but silently dropped because no param map entry existed. Now they flow through `enrichWithPartsio()` gap-fill and into the matching engine. Families with the highest incremental coverage: B8 Thyristors (+12 weight from il+i2t), 71 Power Inductors (+9 from saturation_current), B5 MOSFETs (+17 from technology+vgs_max), C3 Gate Drivers (+17 from output_polarity+peak_sink_current).

**Modified files:** `lib/services/partsioParamMap.ts`, `app/api/admin/atlas/coverage/route.ts`, `components/admin/AtlasCoverageDrawer.tsx`, `locales/en.json`, `locales/zh-CN.json`.

---

## Decision #104 — Atlas Classification Audit: c1 Guards + Skip List Fix + Coverage Column (Mar 2026)

**Decision:** Systematically audit all 54,746 Atlas products for classification accuracy using the source c1 (top-level category) field, fix all identified misclassifications, make the skip list dictionary-aware, expand L2 dictionaries, and add a coverage % column to the Explorer search results.

**Problem:** The `classifyAtlasCategory()` function matched only on c3 (leaf category) substrings without checking c1 (top-level category), causing widespread misclassification:

| Bug | Count | Root Cause |
|-----|-------|------------|
| LEDs → B8 Thyristors | 494 | `'scr'` is substring of `'discrete'` in "LED Indication - Di**scr**ete" |
| RF Amplifiers → C4 Op-Amps | 81 | `'amplifier'` matches "RF **Amplifier**s" |
| Laser/Photo Diodes → B1 Rectifiers | 19 | `'diode'` matches "Laser **Diode**s, Modules" |
| RF Multiplexers → C5 Logic ICs | 4 | `'multiplexer'` matches "RF **Multiplexer**s" |
| Power ICs → Switches | 297 | `'switch'` matches "Offline **Switch**es" (fixed in #102) |
| Audio Connectors → Audio | 214 | `'audio'` matches "**Audio** Connectors" (fixed in #102) |
| Connector Sockets → Processors | 424 | `'soc'` substring in "Female So**c**kets" (fixed in #102) |

Additionally, the `skipParams` set blocked dictionary lookups for params like `安装类型` (mounting_type), `高度` (height), `引脚数` (pin count) — meaningful for L2 categories but treated as metadata.

**Fix — c1 guards (L3):** Moved `c1lower` computation to the top of `classifyAtlasCategory()`. Added:
- Word-boundary regex for SCR: `/\bscr\b/i.test(lower)` prevents "discrete" collision
- `isOptoOrSensor` guard on B1 generic diode classifier — excludes laser diodes and photodiodes
- `isRF` guard on C4 amplifier classifier — excludes RF amplifiers
- `isRF` guard on C5 multiplexer check within Logic ICs

**Fix — c1 guards (L2):** (Done in #102) `isIC`, `isConnector` guards for Switches, Audio, Motors, LEDs, Processors.

**Fix — skip list:** Changed skip check from unconditional to dictionary-aware in `mapAtlasModel()` (atlasMapper.ts), `mapModel()` (atlas-ingest.mjs), and unmapped detection (dictionaries API). Pattern: `if (!hasDictMapping && skipParams.has(name)) continue;`

**Fix — L2 dictionaries:** Expanded Switches (7→31 entries: added `触点形式`→circuit, `额定电压-dc`→voltage_rating_dc, `额定电流-dc`→current_rating, `触头镀层`→contact_finish, `高度`→actuator_height, etc.), Connectors (+8: `端口数`, `排数`, `脚间距`, `触头镀层`, `高度`, `工作温度范围`, `适用温度`), Power Supplies (+6: `供电电压`, `额定功率`, `输出功率`, `效率(typ)`, `开关频率`, `高度`).

**Coverage % column:** Explorer search endpoint now computes per-product coverage against the family's schema (L3 logic table rules or L2 param map). Search results table shows coverage % with color coding (green ≥60%, amber ≥30%, red <30%) and tooltip "X of Y schema attributes present". Replaced the raw "Params" count column.

**Verification:** Post-fix audit found 0 misclassified products across all L3 families. All 598 previously misclassified products now route correctly (LEDs to LEDs/Optoelectronics, RF amplifiers to RF/Wireless, laser diodes to LEDs/Optoelectronics, etc.).

**Modified files:** `lib/services/atlasMapper.ts`, `scripts/atlas-ingest.mjs`, `app/api/admin/atlas/explorer/route.ts`, `components/admin/AtlasExplorerTab.tsx`, `lib/api.ts`, `app/api/admin/atlas/dictionaries/route.ts`.

---

## Decision #105 — Atlas Dictionary Mapping Workbench + Attribute Display Cleanup (Mar 2026)

**Decision:** Enhance the Atlas dictionary override workflow for QC team use, fix Atlas attribute display names in the user-facing Attributes Panel, and separate recognized vs. unrecognized attributes.

**Problem 1 — QC workflow gaps:** The DictionaryOverrideDrawer required typing `attributeId` and `attributeName` from memory. Unmapped params in the admin panel showed no sample values to help identify what they are. No AI assistance for translating Chinese parameter names.

**Problem 2 — Display name bug:** `fromParametersJsonb()` only checked L3 family dictionaries for human-readable names. Gaia-extracted attributes (`rdc_max`, `ir_max_ma`, `l_100khz_0_1v`) showed raw IDs in the user-facing Attributes Panel because no fallback chain existed.

**Problem 3 — Unrecognized clutter:** Atlas products showed all parameters equally in the Attributes Panel, mixing recognized schema attributes with auto-generated Gaia stems that duplicate existing mapped values.

**Fix — Dictionary Mapping Workbench:**
- `DictionaryOverrideDrawer` now uses MUI Autocomplete (strict, no free-text) for attributeId selection, populated from the family's logic table rules (L3) or L2 param map. Options show attributeId, attributeName, weight, unit, and "(mapped)" indicator for already-mapped attributes. Selecting an option auto-fills attributeId, attributeName, and unit.
- AI-assisted suggestion endpoint: `POST /api/admin/atlas/dictionaries/suggest` sends Chinese param name + sample values + family schema attributes to Claude Haiku. Returns translation, suggested attributeId match, confidence level, and reasoning. Auto-fills on high confidence; shows "Apply suggestion" button on medium/low.
- Sample values: dictionaries API now returns up to 3 unique sample values per unmapped param. Shown inline in the unmapped params table ("e.g. 50V, 100V, 12V") and in the drawer.
- Drawer widened from 420→460px. Floating label clipping fixed across all 3 admin drawers (Dictionary, Rule, Context) with `pt: 1` on form containers.

**Fix — Display name resolution:**
- `fromParametersJsonb()` rewritten with full fallback chain: L3 family dict → L2 category dict → shared dict → logic table rules → L2 param map → `humanizeStem()` fallback. Function signature extended with optional `category` parameter.
- Added `recognized?: boolean` to `ParametricAttribute` type. Set `true` when name resolved from any lookup source, `false` when falling through to `humanizeStem()`.

**Fix — Recognized/extra split in Attributes Panel:**
- `AttributesPanel` splits Atlas parameters into recognized (shown normally) and extras (hidden by default).
- Small grey "More (N)" link at bottom-right expands extras in `text.disabled` color. "Less" collapses them.
- Non-Atlas data sources (Digikey, parts.io) are unaffected — all their params show as recognized.

**Other:** Renamed "original (unmapped) parameters" to "original Atlas parameters" in Explorer drawer (i18n key `atlasRawParams`).

**New files:** `app/api/admin/atlas/dictionaries/suggest/route.ts`.

**Modified files:** `components/admin/DictionaryOverrideDrawer.tsx`, `components/admin/AtlasDictionaryPanel.tsx`, `components/admin/RuleOverrideDrawer.tsx`, `components/admin/ContextOverrideDrawer.tsx`, `components/AttributesPanel.tsx`, `app/api/admin/atlas/dictionaries/route.ts`, `lib/services/atlasMapper.ts`, `lib/services/atlasClient.ts`, `lib/types.ts`, `lib/api.ts`, `locales/en.json`.

---

## Decision #106 — Multi-Source Parallel Part Search (Mar 2026)

**Problem:** `searchParts()` only searched Digikey + Atlas. Users got "part not found" for parts that exist in Parts.io (10x larger DB) or Mouser, limiting source part discoverability.

**Solution:** Search all four data sources in parallel with priority-ordered dedup:

1. **Digikey** (priority) — keyword search, handles both MPNs and descriptions
2. **Atlas** — Supabase ilike on MPN + manufacturer
3. **Parts.io** — MPN prefix wildcard (`Manufacturer Part Number=query*`), 10x larger coverage
4. **Mouser** — MPN prefix (`partSearchOptions: 'BeginsWith'`), rate-limited

**MPN vs description detection:** `looksLikeMpn()` heuristic routes queries — MPN-like queries (alphanumeric, dashes, 1-2 words) hit all 4 sources; description-like queries (3+ words or containing component terms like "capacitor") only hit Digikey + Atlas (the MPN-prefix APIs can't handle descriptions).

**Dedup rule:** Digikey always wins. Non-Digikey results only appear for parts NOT in Digikey. Priority order: Digikey → Atlas → Parts.io → Mouser. Case-insensitive MPN matching. Result cap: 50.

**Rate limit protection:** Batch validation (`/api/parts-list/validate`) passes `{ skipMouser: true }` to preserve Mouser's daily budget (950 calls/day) for enrichment. Mouser search also guards on `hasMouserBudget()`.

**UI:** `PartSummary.dataSource` field tags each result's origin. `PartOptionsSelector` shows a subtle chip ("Atlas", "Parts.io", "Mouser") for non-Digikey results. No indicator for Digikey (default/expected).

**API discoveries (verified via live testing):**
- Parts.io: `Manufacturer Part Number=LM358*` returns 440 matches (wildcard in field value, not `q=` param)
- Mouser: POST with `partSearchOptions: 'BeginsWith'` returns 137 matches for "LM358"
- Parts.io `exactMatch: 'false'` returns empty (wrong approach)
- Parts.io `q=LM358*` returns 0 (Solr `q` param doesn't work for this API)

**New files:** `__tests__/services/multiSourceSearch.test.ts` (38 tests).

**Modified files:** `lib/types.ts` (`PartSummary.dataSource`), `lib/services/partDataService.ts` (`looksLikeMpn`, `searchParts` rewrite), `lib/services/partsioClient.ts` (`searchPartsioProducts`, `mapPartsioListingToPartSummary`), `lib/services/mouserClient.ts` (`searchMouserProducts`, `mapMouserProductToPartSummary`), `lib/services/digikeyMapper.ts` (tag `dataSource: 'digikey'`), `lib/services/atlasClient.ts` (tag `dataSource: 'atlas'`), `lib/api.ts` (ROUTE_SERVICES), `app/api/parts-list/validate/route.ts` (skipMouser), `hooks/useAppState.ts` (status text), `components/PartOptionsSelector.tsx` (source chip).

---

## Decision #107 — Atlas Manufacturer Enable/Disable Toggle (Mar 2026)

**Problem:** Some Atlas manufacturers have poor attribute coverage — their products lack enough mapped parametric data to produce meaningful cross-reference matches. These low-quality entries clutter search results and generate poor recommendation candidates.

**Solution:** Admin-togglable enable/disable per Atlas manufacturer. Opt-out model: all manufacturers enabled by default, admin disables poor-quality ones.

**Storage:** New `atlas_manufacturer_settings` Supabase table with `manufacturer` TEXT PK, `enabled` BOOLEAN (default true), `updated_at`, `updated_by`. Only rows for explicitly-toggled manufacturers are stored. Separate table avoids modifying thousands of product rows per toggle and handles new ingestions cleanly (new products from a disabled manufacturer stay disabled automatically).

**Filtering:** 60s TTL in-memory cache of disabled manufacturers in `atlasClient.ts` (same pattern as override caches). All three public functions filter:
- `searchAtlasProducts()` — over-fetches 50, filters disabled in memory, trims to 20
- `getAtlasAttributes()` — returns null for disabled manufacturer products
- `fetchAtlasCandidates()` — database-level `.not('manufacturer', 'in', ...)` filter for scoring efficiency

**Cache invalidation:** `invalidateManufacturerCache()` called by the PATCH endpoint for immediate effect on the same server instance. Other instances pick up changes within 60s via TTL expiry.

**Admin UI:** Toggle switch in each manufacturer row of `AtlasPanel.tsx` (Overview tab). Disabled rows dimmed (50% opacity) with "Disabled" chip. Summary text adapts: "X of Y manufacturers enabled" when any are disabled. Optimistic UI with revert on failure.

**API:** `PATCH /api/admin/atlas/manufacturers` — upsert with `onConflict: 'manufacturer'`. `GET /api/admin/atlas` — response now includes `enabled` per manufacturer and `enabledManufacturers`/`enabledProducts` in summary.

**Scope:** Only affects Atlas data source. Digikey, Parts.io, and Mouser results are completely unaffected. Disabled manufacturers remain visible in the admin panel for monitoring — only user-facing search and recommendation pipelines are filtered.

**New files:** `app/api/admin/atlas/manufacturers/route.ts`, DDL in `scripts/supabase-atlas-schema.sql`.

**Modified files:** `lib/services/atlasClient.ts` (cache + filtering), `app/api/admin/atlas/route.ts` (enabled state in response), `components/admin/AtlasPanel.tsx` (toggle UI).

## Decision #108 — Parts.io Fallback for Unresolved MPNs + List Footer Timestamp (Mar 2026)

**Problem:** When Digikey doesn't recognize an MPN (Chinese/niche parts), batch validation marked the row as "not-found" even when parts.io or Atlas could resolve it. Three gaps: (1) batch validation gave up at the search step without trying direct attribute lookup, (2) parts.io Class names (e.g., "Capacitors", "Transistors") were too broad for family classification — 12 of 17 classes fell through `mapSubcategory()`, and (3) multi-family classes had no parametric disambiguation.

**Solution — three layered changes:**

1. **Batch validation fallback** (`app/api/parts-list/validate/route.ts`): When `searchParts()` returns `'none'`, now tries `getAttributes(mpn)` directly before marking "not-found". `getAttributes()` uses exact MPN lookup across Digikey → Atlas → parts.io, which can find parts that prefix/keyword search misses. Passes prefetched attributes to `getRecommendations()` to avoid redundant second lookup.

2. **Parts.io Class name mapping** (`lib/services/digikeyMapper.ts`): Added 15 parts.io Class names as fallback checks at the end of `mapSubcategory()` — after all existing Digikey-specific checks, before the `return categoryName` default. Each Class maps to the most common base family (e.g., "Capacitors"→MLCC, "Diodes"→Rectifier Diode, "Transistors"→MOSFET). The existing `familyClassifier.ts` handles variant detection from there.

3. **Parametric disambiguation** (`lib/services/partDataService.ts`): New `disambiguatePartsioSubcategory()` function refines the default subcategory using description keywords and parts.io listing fields (dielectric type, channel polarity, etc.) for multi-family classes. Only runs when `listing.Category` is empty and we fell back to the broad `Class` name. Covers: Capacitors (MLCC/Tantalum/Al Electrolytic/Film/Supercap), Transistors (MOSFET/BJT/IGBT), Diodes (Rectifier/Schottky/Zener/TVS), Power Circuits (LDO/Switching/Voltage Reference), Converters (ADC/DAC), Drivers And Interfaces (Gate Driver/Interface IC), Filters (Ferrite Bead/CMC), Circuit Protection (Varistor/Fuse), Optoelectronics (Optocoupler/SSR), Trigger Devices (SCR/TRIAC/DIAC).

**Also:** List footer now shows "Last refreshed HH:MM" timestamp instead of "List Agent" label. `lastRefreshedAt` tracked in `usePartsListState` hook, set when validation completes or a saved list loads. Footer height increased 28→34px, font size matched to table row font (`ROW_FONT_SIZE`).

**Modified files:** `app/api/parts-list/validate/route.ts`, `lib/services/digikeyMapper.ts`, `lib/services/partDataService.ts`, `hooks/usePartsListState.ts`, `components/parts-list/ListAgentFooter.tsx`, `components/parts-list/PartsListShell.tsx`, `lib/layoutConstants.ts`.

## Decision #109 — Missing Attribute = Review + Digikey Tiered Pricing Fix + AEC Badge in ComparisonView (Mar 2026)

**Three changes:**

### 1. Missing candidate attribute → review (never fail)

**Problem:** When the matching engine scored a candidate and a parametric attribute was missing from the candidate's data, `identity`/`identity_range`/`identity_upgrade` evaluators always returned hard `'fail'`, and `threshold`/`vref_check` evaluators returned `'fail'` when `blockOnMissing: true`. This removed potentially valid candidates from results entirely — "missing data" was treated as "incompatible data."

**Solution:** All evaluators now return `'review'` when candidate data is missing. The `blockOnMissing` flag remains on rules but only controls the note severity ("Missing critical specification..." vs "...verify from datasheet"). Parts are never rejected solely because we couldn't find a spec in our data sources — the user can verify from the datasheet.

### 2. Digikey tiered pricing

**Problem:** Digikey pricing only showed qty=1 in the UI. Two bugs: (a) The Digikey v4 API nests `StandardPricing` inside `ProductVariations[0]`, not at the top level — our `DigikeyProduct` interface assumed top-level, so `mapDigikeyPriceBreaks()` always got `undefined`. (b) `buildDigikeyQuote()` (which wraps pricing into a `SupplierQuote`) was only called inside `enrichWithMouser()` — when Mouser was unconfigured, the Digikey `SupplierQuote` was never built.

**Solution:** (a) Added `ProductVariations` to `DigikeyProduct` interface; `mapDigikeyPriceBreaks()` now checks `ProductVariations[0].StandardPricing` as fallback. Commercial cache (`extractCommercial`/`applyCommercial`) also preserves `ProductVariations`. (b) `enrichSourceInParallel()` now falls back to `buildDigikeyQuote()` when neither enrichment produced quotes. `enrichCandidatesWithMouser()` always builds Digikey quotes for every candidate regardless of Mouser availability.

### 3. AEC qualification badge in ComparisonView

**Problem:** AEC-Q badges (e.g., AEC-Q200) showed on recommendation cards but not in the ComparisonView header next to the "Active" status chip.

**Solution:** Added `replPart.qualifications` chip rendering in ComparisonView header, matching the existing pattern in RecommendationCard and AttributesPanel.

### 4. ComparisonView row alignment

**Problem:** Spec rows in the right panel (replacement candidate) were slightly taller than the left panel (source part), causing rows to drift out of alignment.

**Solution:** Added `tableLayout: 'fixed'` to both `Table` components (AttributesPanel + ComparisonView). This forces the browser to strictly enforce column widths and row heights instead of auto-sizing based on content. Also tightened `px` on the 3rd column (status dot) and added `lineHeight: 0` to prevent inline-flex dot from adding vertical space.

**Modified files:** `lib/services/matchingEngine.ts`, `lib/services/digikeyClient.ts`, `lib/services/digikeyMapper.ts`, `lib/services/partDataService.ts`, `components/ComparisonView.tsx`, `components/AttributesPanel.tsx`, `__tests__/services/matchingEngine.test.ts`.

## Decision #110 — List Performance, Batch Recommendation Filter, and Admin Logic Docs (Mar 2026)

**Three changes addressing list refresh performance, recommendation quality, and admin documentation.**

### 1. List refresh performance

**Problem:** Refreshing 8 parts took ~2 minutes. Root causes: (a) parts.io fetch had no timeout — if unreachable (VPN off), each call hung for OS-level TCP timeout (~60s) with 3 retries; (b) candidate enrichment fired 20 parallel parts.io API calls per part; (c) "Refreshed at" timestamp showed page-load time, not actual data refresh time.

**Solution:**
- **8s timeout on parts.io fetch** (`lib/services/partsioClient.ts`): `AbortSignal.timeout(8000)` on every fetch call. Each retry gets its own timeout.
- **Skip parts.io candidate enrichment in batch** (`lib/services/partDataService.ts`): New `skipPartsioEnrichment` option gates the 20-call enrichment step. Batch validation sets it; single-part search still enriches fully. Parts.io gap-fill adds ~5-15% weight coverage — acceptable tradeoff for batch speed.
- **Timestamp from Supabase** (`lib/supabasePartsListStorage.ts`): `loadPartsListSupabase()` now returns `updated_at`. `handleLoadList` uses this instead of `new Date()` for `lastRefreshedAt`. Fresh validation/refresh still stamps "now".

### 2. Batch recommendation filter (Decision #109 follow-up)

**Problem:** Lists pulled in ALL scored recommendations (up to 67+ per part) — expensive, noisy, and most aren't actionable. Users want only viable recommendations in lists; full results available on-demand per part.

**Solution:** New `filterForBatch` option on `getRecommendations()`, applied only in batch validation:

**Pre-scoring:** Obsolete and Discontinued candidates removed before scoring (saves computation).

**Post-scoring filter (`filterRecsForBatch`):** A recommendation is kept if ANY of:
- No failing rules (clean match)
- All fails are due to missing attributes (replacementValue is "N/A" — could pass if spec found manually)
- At most 1 real mismatch (fail where both attributes exist)
- Certified by parts.io (FFF or Functional — human-verified, always kept regardless of fails)

Always excluded: Obsolete or Discontinued parts (even if certified). NRND and LastTimeBuy are kept.

Single-part search on the main page is unaffected — still returns all results.

### 3. Admin logic documentation panels

**Problem:** Admins had no reference for how the search and list pipelines work — what APIs are called, what's cached, how recommendations are calculated, what filters apply.

**Solution:** Two new admin sections between Digikey Taxonomy and Feedback:
- **Search Logic** (`components/admin/SearchLogicPanel.tsx`): 9 sections covering source resolution, enrichment, caching (L2 TTLs), family classification, candidate sourcing (4 parallel sources), scoring, post-scoring filters, LLM assessment, admin overrides.
- **List Logic** (`components/admin/ListLogicPanel.tsx`): 9 sections covering per-row processing, direct lookup fallback, parts.io disambiguation, performance optimizations vs search, batch filter rules, caching, data persistence, footer timestamp, parts.io timeout.

Hardcoded markdown content maintained alongside code changes — no LLM generation, instant render.

**Also:** "Risk" tab pill renamed to "Risk & Compliance" in both AttributesPanel and ComparisonView (`locales/en.json`).

**New files:** `components/admin/SearchLogicPanel.tsx`, `components/admin/ListLogicPanel.tsx`.

**Modified files:** `lib/services/partsioClient.ts`, `lib/services/partDataService.ts`, `lib/supabasePartsListStorage.ts`, `hooks/usePartsListState.ts`, `app/api/parts-list/validate/route.ts`, `components/admin/AdminSectionNav.tsx`, `components/admin/AdminShell.tsx`, `locales/en.json`.

## Decision #111 — List Agent: Conversational Control for Parts Lists (Mar 2026)

**Problem:** Users interact with parts lists exclusively through manual UI controls (search box, sort clicks, checkboxes, action buttons). For large BOMs, common operations like "delete all unresolved rows" or "show me only TDK parts" require multiple clicks and manual selection.

**Solution:** A per-list conversational agent that lets users control their list with natural language. Built as a third orchestrator function (`listChat()`) in `llmOrchestrator.ts`, alongside the existing `chat()` (search) and `refinementChat()` (modal per-part).

**Architecture:**
- **9 tools** in three categories:
  - **Read-only** (execute server-side): `get_list_summary`, `query_list` (with status/manufacturer/search/score filters), `get_row_detail`
  - **Client-side view** (execute immediately, no confirmation): `sort_list`, `filter_list`, `switch_view`
  - **Write** (require user confirmation): `delete_rows`, `refresh_rows`, `set_preferred`
- **Write-tool interception:** When the LLM calls a write tool, the server does NOT execute it. Instead, it returns a synthetic tool result ("Action queued for user confirmation") and captures a `PendingListAction` descriptor. Claude then generates a confirmation message. The client renders this as a confirmation widget with [Confirm]/[Cancel] buttons (new `InteractiveElement` type: `'list-action'`).
- **System prompt** includes three sections: role/instructions, user context (reuses `buildUserContextSection()` from main chat — role, industry, goals, compliance, preferred manufacturers), and list context (name, description/objective, customer, currency, status counts, top manufacturers/families, available views).
- **Row data stays server-side:** The API route loads rows from Supabase for tool execution. Row data is never sent to Claude in bulk — only compact query results from tools.
- **Conversation is ephemeral** (MVP): Lost when navigating away. Persistence can be added later.

**UI:** Sticky bottom footer bar (34px, `LIST_AGENT_FOOTER_HEIGHT`) with clickable trigger on the right ("Ask about this list"). Footer also shows item count and last refresh timestamp. Opens a bottom-anchored drawer (`ListAgentDrawer`, 50vh) sliding up with message list + text input.

**Scope:** List operations only. The list agent does NOT have search/xref tools — users go to the main chat for that. This keeps the tool set focused and avoids confusing the LLM with irrelevant capabilities.

**New types:** `PendingListAction` (delete_rows | refresh_rows | set_preferred), `ListClientAction` (sort | filter | switch_view), `ListAgentContext`, `ListAgentResponse`. Extended `InteractiveElement` union with `'list-action'` variant.

**New files:** `hooks/useListAgent.ts`, `app/api/list-chat/route.ts`, `components/parts-list/ListAgentFooter.tsx`, `components/parts-list/ListAgentDrawer.tsx`, `components/parts-list/ListActionConfirmation.tsx`.

**Modified files:** `lib/types.ts`, `lib/services/llmOrchestrator.ts`, `lib/api.ts`, `lib/services/apiUsageLogger.ts`, `lib/layoutConstants.ts`, `components/MessageBubble.tsx`, `components/parts-list/PartsListShell.tsx`.

---

## Decision #112 — Atlas Description Extraction via LLM with Quote Grounding (Mar 2026)

**Problem:** 12,510 Atlas products (22.9%) have structured description text containing parametric specs (voltages, currents, temp ranges, AEC qualifications, etc.) that are never extracted into attributes. Current attribute coverage for these products averages ~15% of their family's schema. The data is right there but unused.

**Solution:** Batch LLM extraction using Claude Haiku. For each product with a description, the script sends the description + the family's attribute schema to Haiku, which returns structured JSON with extracted values. A quote grounding mechanism prevents hallucinations: Haiku must return the exact source substring for each extraction, and any extraction where the quoted text isn't found in the original description is rejected.

**Why LLM over regex:** Descriptions are rich with family-specific specs (MOSFET VDS/RDS(ON), LDO quiescent current/soft-start, inductor shielding/core material). Building regex per attribute per family doesn't scale. Haiku handles the full breadth for ~$12-15 total across all products.

**Anti-hallucination — Quote Grounding:** Each extraction must include `{ value, source }` where `source` is the exact substring from the description. The parser verifies `source` is a case-insensitive substring of the original description. If not found, the extraction is rejected. In testing across multiple families, this produced 0 false positives.

**Gap-fill only:** Extracted values never override existing gaia/standard parameter values. Only attributes not already present on the product are added.

**Idempotent:** Processed products are tagged with `_source: 'desc_extract'` marker. Re-runs skip already-processed products.

**Integration with ingest:** After `atlas-ingest.mjs` upserts products to Supabase, it automatically runs the extraction script as a post-ingest step (non-fatal — if ANTHROPIC_API_KEY is missing or extraction fails, the ingest still completes).

**Coverage impact (estimated):** 15% → ~23% average attribute coverage for products with descriptions (+8pp). Biggest wins: inductors 11%→29%, fuses 0%→21%, LDOs 22%→30%.

**New files:** `lib/services/descriptionExtractor.ts` (schema prompt builder, quote-grounded parser, gap-fill merger), `scripts/atlas-extract-descriptions.ts` (batch script with concurrency control), `__tests__/services/descriptionExtractor.test.ts` (22 tests).

**Modified files:** `scripts/atlas-ingest.mjs` (auto-run extraction post-ingest).

---

## Decision #113 — Manual Part Addition & Empty List Creation (Mar 2026)

**Problem:** Users could only create lists by uploading a file or pasting data. No way to create an empty list and add parts one by one, or to manually add individual parts to an existing list. Some users want to build lists incrementally rather than batch-uploading.

**Solution:** Two new capabilities:

1. **Empty List Creation** — Third tab ("Empty List") in `InputMethodDialog`. Flows through existing two-step dialog chain (choose method → name/configure). Creates a Supabase-persisted list with zero rows and default headers `['MPN', 'Manufacturer']`. Uses new `setPendingEmptyList()` in `pendingFile.ts` and `handleCreateEmptyList()` in `usePartsListState`.

2. **Manual Part Addition** — `AddPartDialog` component accessible from the action bar's "Add Part" button (always enabled, no selection required). Required fields: MPN only (manufacturer optional but encouraged). For lists with existing spreadsheet columns from uploads, shows a collapsible "Additional Columns" section with fields for each extra header. On submit, creates a `PartsListRow` with correct `rawCells` alignment (uses `columnMapping` indices for uploaded lists, default [0, 1] for empty lists) and runs inline validation via the existing streaming `validatePartsList` API.

**Why inline validation instead of `handleRefreshRows`:** The `handleRefreshRows` callback reads `state.rows` from a closure snapshot, which doesn't include the just-added row. `handleAddPart` builds validation items directly from its function arguments, avoiding the stale-closure race.

**Empty state UX:** When a list has zero rows (phase='results'), the table area shows a centered empty state with icon, "No parts yet" heading, and prominent "Add Part" CTA button. The action bar still renders above it so the button is accessible from both locations.

**Design choice — Dialog not Drawer:** Matches existing data-entry patterns (NewListDialog, InputMethodDialog). Drawers are reserved for detail/comparison views.

**New files:** `components/parts-list/AddPartDialog.tsx`.

**Modified files:** `lib/pendingFile.ts`, `hooks/usePartsListState.ts`, `hooks/usePartsListAutoLoad.ts`, `components/lists/InputMethodDialog.tsx`, `components/lists/ListsDashboard.tsx`, `components/parts-list/PartsListActionBar.tsx`, `components/parts-list/PartsListShell.tsx`, `locales/en.json`, `locales/de.json`, `locales/zh-CN.json`.

---

## Decision #114 — Atlas Description Cleanup & Display Fixes (Apr 2026)

**Problem:** Three display issues with Atlas-only parts: (1) Chat responses dump raw, messy Atlas descriptions verbatim ("DATA:Inductance@100KHz/1V(μH)：15uH..."). (2) AEC-Q200 badge doesn't show next to the Active status chip even when the qualification is in the parameters. (3) Risk & Compliance tab hardcodes source as "D" (Digikey) even for Atlas-only parts.

**Solution:**

**Description cleanup (Issue 1):** Batch script (`scripts/atlas-clean-descriptions.ts`) calls Claude Haiku to rewrite raw descriptions into standardized one-liners (max 200 chars) stored in a new `clean_description` column on `atlas_products`. Format: `[Component type]: [key specs]; [features]; [applications]; [qualifications/temp]`. Cleanup rules: fix OCR errors, standardize units, remove marketing fluff, translate Chinese specs. `atlasClient.ts` uses `clean_description` when available, falls back to raw `description`. Runs automatically post-ingest after the attribute extraction step.

**AEC badge (Issue 2):** `rowToPartAttributes()` in `atlasClient.ts` now checks parameters JSONB for `aec_q200`/`aec_q101`/`aec_q100` with value `"Yes"` and populates `part.qualifications`. The badge then renders automatically in `AttributesPanel.tsx` header.

**Source attribution (Issue 3):** `RiskContent` in `AttributesTabContent.tsx` now accepts a `dataSource` prop instead of hardcoding `source="digikey"`. `AttributesPanel.tsx` passes `attributes.dataSource` through.

**New files:** `scripts/atlas-clean-descriptions.ts`.

**Modified files:** `lib/services/atlasClient.ts` (clean_description usage, AEC qualifications extraction, select queries updated), `components/AttributesTabContent.tsx` (dataSource prop on RiskContent), `components/AttributesPanel.tsx` (pass dataSource to RiskContent), `scripts/atlas-ingest.mjs` (auto-run cleanup post-ingest).

**DB migration:** `ALTER TABLE atlas_products ADD COLUMN IF NOT EXISTS clean_description TEXT;`

---

## Decision #115 — Add Part UX: Search Picker, Speed Fix, Inline Editing (Apr 2026)

**Problem:** Three issues with the "Add Part to List" flow: (1) Resolution took 60+ seconds due to Mouser API calls hanging with no timeout. (2) MPN and manufacturer inputs were not validated — the manufacturer field was silently ignored, and incorrect MPNs went straight to the list with no feedback. (3) User-provided spreadsheet columns were read-only after entry; no way to fix typos or update values without re-adding.

**Solution:**

**Mouser timeout fix (root cause of 60s delay):** `mouserFetch()` in `mouserClient.ts` had no timeout on `fetch()` and retried 3x on 429. If the Mouser API was slow or unreachable, each attempt hung indefinitely. Two sequential Mouser calls (source part enrichment + suggested replacement lookup) added up to 60s+. Fix: Added 8-second `AbortSignal.timeout()` per attempt. Also added `skipMouser` option to `getAttributes()` and `enrichSourceInParallel()` — batch validation now skips Mouser entirely since it provides only commercial data (pricing/lifecycle), not parametric data needed for scoring. Passed through `getRecommendations()` options and `fetchMouserSuggestions()`.

**Search picker in AddPartDialog:** Replaced the direct-add flow with a two-step Search → Select pattern. User enters MPN (+ optional MFR), clicks "Search". A new lightweight endpoint (`/api/parts-list/search-quick`) runs `searchParts()` only (~500ms, no attributes/recommendations, skipMouser). Results appear as a clickable picker list showing MPN, manufacturer, description, and data source badge. Exact MPN matches get a green checkmark. User selects the correct part, which is added with the verified identity. "Add with original input anyway" link for edge cases. "Back" button to modify the query. If no results, warning with option to add as not-found. This covers both incorrect MPNs (user sees closest matches) and wrong manufacturers (correct manufacturer shown in results).

**Two-phase validation:** The selected `PartSummary` from the search step is passed to `handleAddPart()`, which shows the resolved MPN/MFR in the table immediately (status: 'validating'). Full validation (attributes + recommendations) runs in the background and merges in when complete.

**New part at top:** `handleAddPart()` now prepends `[newRow, ...prev.rows]` instead of appending, so the just-added part is immediately visible without scrolling.

**Inline cell editing:** Spreadsheet columns (`ss:*`) are now double-click-to-edit in the table. `EditableCell` component renders a dashed hover hint, switches to a native `<input>` on double-click, commits on Enter/blur, cancels on Escape. MPN or manufacturer edits trigger debounced (500ms) re-validation via `handleRefreshRows`. Other column edits just save to Supabase. `editable: true` flag on `ColumnDefinition` for all `source: 'spreadsheet'` columns.

**Digikey timeout:** `digikeyFetch()` in `digikeyClient.ts` also had no timeout. Added 10-second `AbortSignal.timeout()` per attempt with fail-fast (no retry on timeout). OAuth token fetch also gets 10s timeout.

**`skipSearch` flag:** When the user picks a part from the search picker, the exact MPN is already known. The validate route now accepts `skipSearch: true` on batch items — skips `searchParts()` entirely and goes straight to `getAttributes()`, saving ~10-15s of redundant multi-source search.

**Cancel validation (Stop button):** `validationManager.ts` now creates an `AbortController` per validation run. New `cancelValidation()` export aborts the stream and saves partial results. `handleRefreshRows` and `handleAddPart` also use a shared `validationAbortRef` for their direct validation streams. Stop button shown next to progress text in `PartsListTable`. Abort errors handled gracefully (no error message shown).

**Notification snackbar:** New `NotificationSnackbar.tsx` component (MUI Snackbar + Alert with optional action button). `PartsListShell` detects failures after validation: error rows → "X parts could not be resolved", Mouser enrichment failure → "Mouser pricing unavailable" with **Retry** button, some not-found → informational notice. Retry triggers `handleRetryMouserEnrichment()` which re-runs `enrichWithMouserBatch` for rows missing Mouser data.

**Progressive Mouser enrichment:** Instead of only enriching Mouser data when validation completes, the enrichment `useEffect` now fires every 10 resolved rows during validation. Mouser columns fill in progressively alongside DK data rather than all at once at the end.

**Row highlight animation:** New part appears at top with a CSS `@keyframes highlightFade` animation (blue glow fading over 1.5s). `highlightedRowIndex` state in `PartsListShell`, cleared after 2s via timer.

**Validation concurrency:** Bumped from `CONCURRENCY = 3` to 5 in the validate route — API calls are I/O-bound so more parallelism improves throughput.

**Default view star fix:** Starring a view saved `defaultViewId` to the ViewState JSON, but the auto-load read from a separate `parts_lists.default_view_id` column. Fixed in `useListViewConfig.ts`: when initializing for a list, `activeViewId` is now overridden with `defaultViewId` if one is starred. Also `PartsListShell` passes `listViewConfigs?.defaultViewId` to auto-load as fallback.

**New files:** `app/api/parts-list/search-quick/route.ts`, `components/NotificationSnackbar.tsx`.

**Modified files:** `lib/services/mouserClient.ts` (fetch timeout), `lib/services/digikeyClient.ts` (fetch timeout), `lib/services/partDataService.ts` (skipMouser option on getAttributes/enrichSourceInParallel/getRecommendations/fetchMouserSuggestions), `app/api/parts-list/validate/route.ts` (skipSearch, skipMouser, concurrency 5), `lib/api.ts` (searchPartQuick wrapper, signal on validatePartsList), `lib/columnDefinitions.ts` (editable flag), `lib/validationManager.ts` (AbortController, cancelValidation), `lib/types.ts` (skipSearch on BatchValidateRequest), `components/parts-list/AddPartDialog.tsx` (rewritten: search picker flow), `components/parts-list/PartsListTable.tsx` (EditableCell, onCellEdit, Stop button, highlight animation), `components/parts-list/PartsListShell.tsx` (notification state, progressive Mouser enrichment, cancel wiring, default view fix), `hooks/usePartsListState.ts` (handleAddPart sync + fire-and-forget, handleCellEdit, handleCancelValidation, handleRetryMouserEnrichment, progressive Mouser enrichment), `hooks/useListViewConfig.ts` (apply defaultViewId on init), `hooks/usePartsListAutoLoad.ts` (effectiveDefaultViewId), `locales/en.json`, `locales/de.json`, `locales/zh-CN.json`.

---

## Decision #116 — Atlas Manufacturer Profiles & Canonical Identity Table (Apr 2026)

**Problem:** Atlas manufacturer data was scattered — `atlas_products.manufacturer` held display names with no canonical identity, aliases, or profile metadata. The `atlas_manufacturer_settings` table only tracked enabled/disabled state. No way to store certifications, locations, or other profile data needed for manufacturer intelligence.

**Solution:** Created `atlas_manufacturers` Supabase table as the canonical manufacturer identity layer, seeded from a 1,011-manufacturer master list (Excel import).

**Schema:** `atlas_id` (PK), `slug` (unique, URL-safe), `name_en`, `name_zh`, `name_display` (join key to `atlas_products`), `aliases` (JSONB array), `partsio_id`, `partsio_name`, plus JSONB profile columns (`certifications`, `locations`, etc.) populated in later phases.

**Import script:** `scripts/atlas-manufacturers-import.mjs` with `--dry-run`, `--verbose`, `--migrate`, `--fix-products` flags. Handles the name format mismatch: master list has "ENGLISH Chinese" combined format while `atlas_products` uses English-only names — the API does fallback lookup on `name_en`.

**Legacy absorption:** The `atlas_manufacturer_settings.enabled` field was absorbed into the new table. `atlasClient.ts` reads from both tables with legacy fallback for backward compatibility during migration.

---

## Decision #117 — Admin Panel Restructuring & Shared Layout (Apr 2026)

**Problem:** The admin panel was a single-page shell (`AdminShell.tsx`) with all sections rendered in one route. Atlas-related sections (manufacturers, dictionaries, explorer) were lumped under a single "Atlas" nav item. No way to deep-link to a specific manufacturer or have sub-routes with persistent navigation.

**Solution:** Reorganized admin into a proper route hierarchy with shared layout.

**Nav restructuring:** "Atlas MFRs" and "Atlas Dictionaries" promoted to top-level nav items above a divider. The old "atlas" section redirects to "manufacturers" for backwards compatibility.

**Shared admin layout:** Created `app/admin/layout.tsx` — sidebar navigation and history drawer persist across `/admin` and `/admin/manufacturers/[slug]` sub-routes. No re-mount on navigation between admin pages.

**ManufacturersPanel replaces AtlasPanel:** Shows all 1,011 manufacturers (dimmed if no products in Atlas). Clickable rows navigate to `/admin/manufacturers/[slug]`. Three tabs: Atlas MFRs (full list), Search (`AtlasExplorerTab` reused), Flagged (flagged products list).

---

## Decision #118 — Manufacturer Detail Pages (Apr 2026)

**Problem:** Admin users needed to drill into individual manufacturers to see their products, coverage gaps, flagged items, and profile data. The flat list view in ManufacturersPanel wasn't sufficient for per-manufacturer analysis.

**Solution:** Sub-route at `/admin/manufacturers/[slug]` with `ManufacturerDetailPage` component.

**5 tabs:** Products (default, paginated table with flag button per row, clicking opens `AtlasExplorerDrawer`), Flagged Products (per-manufacturer filtered), Coverage (family breakdown with `AtlasCoverageDrawer`), Cross-References (placeholder for future), Profile (manufacturer metadata).

**Reuse over rewrite:** All existing drawers (`AtlasCoverageDrawer`, `AtlasExplorerDrawer`) reused unchanged — zero functionality loss from the restructuring.

**API endpoints:** `GET/PATCH /api/admin/manufacturers/[slug]` for manufacturer metadata, `GET /api/admin/manufacturers/[slug]/products` for paginated product listing.

---

## Decision #119 — Atlas Product Flagging System (Apr 2026)

**Problem:** During Atlas data quality review (via Explorer or manufacturer detail pages), admins had no way to flag products with bad data, missing attributes, or misclassifications for later triage. Issues were tracked informally or forgotten.

**Solution:** New `atlas_product_flags` table for data quality flagging, intentionally separate from the QC recommendation feedback system (different domain — source data quality vs matching engine quality).

**Schema:** `product_id` (FK to `atlas_products`), `mpn`, `manufacturer` (denormalized for display without joins), `comment` (text), `status` (`open` | `resolved` | `dismissed`), `created_by`, `resolved_by`, timestamps.

**UI:** Flag button (`FlagOutlined` icon) on search results and manufacturer detail Products tab. Simple dialog with MPN + manufacturer context pre-filled and a multiline comment field. Flagged tab on both `ManufacturersPanel` (global view) and `ManufacturerDetailPage` (per-manufacturer filtered).

**API:** `GET/POST /api/admin/atlas/flags` for listing and creating flags, `PATCH /api/admin/atlas/flags/[flagId]` for status updates.

---

## Decision #120 — Manufacturers List API Caching (Apr 2026)

**Problem:** The ManufacturersPanel needs to load all 1,011 manufacturers with product counts aggregated from 54K+ Atlas products. Supabase caps single queries at 1,000 rows, and computing aggregations on every page load is wasteful since this data only changes on ingestion or logic table updates.

**Solution:** Server-side 30-minute cache on the manufacturers list API response. Uses `fetchAllPages()` pattern to paginate through all products (1,000 rows per page) when building the cache.

**Cache invalidation:** `invalidateManufacturersListCache()` called on manufacturer enable/disable toggle to ensure the UI reflects the change immediately.

**Tradeoff:** Stale data for up to 30 minutes after ingestion. Acceptable because ingestion is a manual admin operation, and the admin can force-refresh if needed.

---

## Decision #121 — Digikey Quantity-Based Price Breaks (Apr 2026)

**Problem:** Digikey API v4 returns quantity-based price breaks in `StandardPricing` array but we only captured the flat `UnitPrice` (qty 1). Mouser already showed real tiers — Digikey always showed a single row.

**Solution:** Added `DigikeyPriceBreak` interface and `StandardPricing?` field to `DigikeyProduct`. `mapDigikeyPriceBreaks()` in `digikeyMapper.ts` converts to internal `PriceBreak[]`, carried on `Part.digikeyPriceBreaks`. `buildDigikeyQuote()` uses real tiers when available, falls back to synthetic single-tier for backward compat. No UI changes — `SupplierCard` already renders `quote.priceBreaks` as a table.

**Files:** `digikeyClient.ts` (interface), `digikeyMapper.ts` (mapping), `types.ts` (`Part.digikeyPriceBreaks`), `mouserMapper.ts` (`buildDigikeyQuote` updated).

**Phase 2 planned:** BOM quantity-aware pricing — qty column auto-detection, `mapped:quantity` on `PartsListRow`, effective price per tier, extended cost columns.

## Decision #122 — Manufacturer Cross-Reference Upload & Recommendation Categorization (Apr 2026)

**Problem:** Two gaps: (1) No way to upload manufacturer-certified cross-references — manufacturers send Excel/CSV files with their own verified replacements that couldn't be ingested into the system. (2) Recommendations panel showed a flat list with a generic "Certified" chip — no clear categorization of where a recommendation comes from (matching engine vs manufacturer vs 3rd party).

**Solution — Feature 1: Manufacturer Cross-Reference Upload:**
- New Supabase table `manufacturer_cross_references` storing bidirectional mappings: original MPN → xref (replacement) MPN with manufacturer slug, descriptions, equivalence type (pin-to-pin / functional), and upload batch tracking.
- Cross-References tab in Admin > Manufacturers detail page (was placeholder) now has drag-drop upload zone + flexible column mapping dialog (6 fields: Xref MPN, Xref MFR, Xref Description, Original MPN, Original MFR, Type) + paginated table of uploaded cross-refs with search and delete.
- Atlas description enrichment on upload: if the xref MPN exists in Atlas with a `clean_description` that's more complete than the uploaded one, the Atlas version is used.
- Pipeline integration: `fetchManufacturerCrossRefs()` runs in parallel with Digikey/Atlas/Parts.io/Mouser candidate fetches. Each cross-ref MPN is resolved to full `PartAttributes` and scored by the matching engine like any other candidate. Tagged with `certifiedBy: ['manufacturer']`.

**Solution — Feature 2: Recommendation Categorization:**
- Three categories: **Logic Driven** (blue, scored by matching engine), **MFR Certified** (green, from manufacturer upload), **3rd Party Certified** (amber, from Parts.io FFF/Functional or Mouser suggestions).
- `deriveRecommendationCategories()` utility derives categories from existing fields — a recommendation can belong to multiple categories.
- RecommendationsPanel shows category filter chips (All / Logic Driven / MFR Certified / 3rd Party) when certified or 3rd-party results exist.
- RecommendationCard shows colored category chips replacing the generic "Certified" chip. 3rd Party chip has tooltip with sub-source detail.

**CertificationSource** extended: `'partsio_fff' | 'partsio_functional' | 'mouser' | 'manufacturer'`.

**New files:** `scripts/supabase-mfr-xrefs-schema.sql`, `app/api/admin/manufacturers/[slug]/cross-references/route.ts`, `lib/services/manufacturerCrossRefService.ts`, `components/admin/CrossReferencesTab.tsx`, `components/admin/CrossRefColumnMappingDialog.tsx`.

**Modified:** `lib/types.ts`, `lib/services/partDataService.ts`, `lib/api.ts`, `components/admin/ManufacturerDetailPage.tsx`, `components/RecommendationsPanel.tsx`, `components/RecommendationCard.tsx`, `components/ComparisonView.tsx`.

## Decision #123 — Manufacturers List Page Performance (Apr 2026)

**Problem:** The Admin > Manufacturers list page took 20-30 seconds to load. The `/api/admin/manufacturers` endpoint fetched ALL ~55K rows from `atlas_products` twice — once for counts (lightweight) and once with full JSONB `parameters` column for coverage calculation — then aggregated everything in JavaScript loops. The 30-min in-memory cache masked the problem on repeat visits but first load (or cache expiry) was brutal.

**Solution:** Replaced the 55K-row client-side aggregation with a Supabase RPC function `get_manufacturer_product_stats()` that does `GROUP BY manufacturer, family_id` in SQL, returning ~2-3K aggregated rows. The RPC uses a CTE: `groups` for counts, `param_union` for collecting distinct parameter keys per group via `LATERAL jsonb_object_keys()`. Coverage calculation in JS now iterates ~2-3K grouped rows (intersecting `param_keys` arrays with logic table rule attributes) instead of 55K individual products. Composite index `(manufacturer, family_id)` added.

**Performance:** First load drops from ~25s to ~1-2s. Graceful fallback: if the RPC function doesn't exist yet, the route returns manufacturers with zero stats instead of crashing.

**Files:** `scripts/supabase-mfr-stats-rpc.sql` (RPC function + index), `app/api/admin/manufacturers/route.ts` (rewritten to use RPC).

## Decision #124 — Separate Applications from Atlas Descriptions (Apr 2026)

**Problem:** The `atlas-clean-descriptions.ts` LLM cleanup prompt intentionally embeds application/market information into the `clean_description` one-liner (e.g., "...shielded, low-noise composite core; **automotive lighting, HVAC, industrial motor control**; AEC-Q200"). Applications should be a separate field — displayable independently in the Explorer Drawer and eventually on the user-facing side.

**Planned solution:**
1. Add `applications TEXT` column to `atlas_products` via migration
2. New batch script `scripts/atlas-split-applications.ts` — Claude Haiku splits each existing `clean_description` into pure technical description + applications string. ~55K products, modeled on existing cleanup script pattern (pagination, 20 concurrent requests)
3. Update cleanup prompt in `atlas-clean-descriptions.ts` to exclude applications from future descriptions
4. Show `applications` field in Atlas Explorer Drawer (below description in header section)
5. Add `applications` to API response and types

**Status:** Planned, not yet implemented. See `docs/BACKLOG.md`.

## Decision #125 — Recommendations Panel Filter Consolidation (Apr 2026)

**Problem:** The RecommendationsPanel had two rows of filter controls (manufacturer dropdown, CN Parts chip, price/stock checkbox, category filter chips) consuming ~80px of vertical space. Adding more filters would make this worse.

**Solution:** Consolidated into a single 45px filter row:
- **Filter icon button** (left): `FilterList` icon with `Badge` showing count of active non-default filters. Opens a `Popover` with three sections: Status (Active Only), Manufacturer (CN checkbox pre-filters dropdown + manufacturer select), and Cross Reference Source (category chips).
- **Inline dismissible chips** (middle): Show active filters (e.g., "Rubycon", "CN MFRs") with `x` to clear individually.
- **Price/stock toggle** (right): `AttachMoney` icon button — display toggle, not a filter.
- CN checkbox above manufacturer dropdown filters the dropdown to only show CN manufacturers. If a non-CN manufacturer was previously selected, it resets.
- "Clear all" link in popover resets all filters.

**Files:** `components/RecommendationsPanel.tsx`

## Decision #126 — Search Cache Source Provenance (Apr 2026)

**Problem:** When data sources (Digikey, Parts.io, Mouser) are temporarily down during a search, partial results from available sources are cached for 7 days. If the failed sources recover minutes later, subsequent searches return the stale partial cache instead of re-querying the now-available sources.

**Solution:** Tag cached search results with which sources contributed, and bypass cache when a previously-missing source is now available:
1. Added `sourcesContributed?: SearchDataSource[]` to `SearchResult` type — tracks which sources returned results for each cached search.
2. New `shouldBypassSearchCache()` function checks on every cache hit whether a configured source is missing from the `sourcesContributed` list. If so, the cache entry is bypassed and all sources are re-queried.
3. Legacy cache entries (without `sourcesContributed`) are treated as stale and force a re-query — self-healing on first access.
4. Atlas excluded from bypass checks (Supabase-backed, always available — 0 results is valid, not a failure).
5. Parts.io and Mouser only checked for MPN-like queries (matching when they would have been called).
6. No schema migration — `sourcesContributed` stored inside `response_data` JSONB in the existing `part_data_cache` table.

**Files:** `lib/types.ts`, `lib/services/partDataService.ts`

## Decision #127 — Recommendation Sort Order: Certified First (Apr 2026)

**Problem:** Recommendations were sorted purely by match score. When manufacturer-certified or 3rd-party-certified cross-references existed, they were mixed in with logic-driven results, making them easy to miss.

**Solution:** Sort recommendations by category priority first, then by match score within each group:
1. **Manufacturer Certified** (green) — highest priority, always listed first
2. **3rd Party Certified** (amber) — Mouser/Parts.io suggestions, listed second
3. **Logic Driven** (blue) — matching engine results, listed last

Category is derived from `deriveRecommendationCategories()` — a recommendation with `certifiedBy: ['manufacturer']` gets priority 0, 3rd-party sources get priority 1, everything else gets priority 2. Preferred MPN (user-starred) still floats to the very top regardless of category.

**Files:** `components/RecommendationsPanel.tsx`

## Decision #128 — Recommendations L2 Cache & Search Cache Bypass Fix (Apr 2026)

**Problem:** Repeat searches took ~10s and repeat recommendations took ~30s despite the L2 Supabase cache. Three root causes:
1. **Sticky search cache bypass:** Decision #126's `shouldBypassSearchCache()` checked if each configured source (Digikey, Parts.io, Mouser) was in `sourcesContributed`. But the write path only tagged sources with `matches.length > 0`. If Mouser returned 0 results for an obscure MPN (very common), it never got tagged → every repeat search bypassed the cache permanently.
2. **No recommendations-level cache:** `getRecommendations()` re-ran the full pipeline (Digikey category search, candidate enrichment, scoring) on every call — 5-30s even when sub-calls hit their own L2 caches.
3. **Manufacturer xref `getAttributes()` called Mouser:** Each of the 34K newly-uploaded 3PEAK cross-reference MPNs triggered a fresh Mouser API call during xref candidate resolution, burning daily quota and adding 1-3s per uncached xref. Also had an arg-order bug (userId passed as currency).

**Solution:**
1. **Fix `sourcesContributed` tracking:** Tag any successfully-queried source regardless of match count. A 0-result fulfilled query proves the source was reachable. Tighten `shouldBypassSearchCache()` to only bypass legacy entries (missing `sourcesContributed`) — per-source checks removed.
2. **Add `'recommendations'` cache tier:** Reuses `service='search'` with `variant='rec:<version>:<mpn>:<sha1-16>'` in `part_data_cache` table. Cache key is a SHA-1 hash of all scoring inputs (overrides, context, prefs, currency, options) + `RECS_CACHE_SCHEMA_VERSION`. 30-day TTL — parametric data and scoring are stable; pricing/stock refreshed on display via existing `triggerMouserEnrichment()`. Global (cross-user) cache: two users with same inputs share one entry.
3. **Admin-write invalidation:** `invalidateRecommendationsCache()` purges the entire `recommendations` tier. Called from 8 admin routes: xref upload/delete, manufacturer enable/disable, rule override CRUD, context override CRUD, rule restore.
4. **Skip Mouser on xref candidates:** Pass `{ skipMouser: true }` to `getAttributes()` in manufacturer xref resolution. Fixed arg-order bug in same edit.

**Also fixed:** `get_cross_ref_counts()` RPC function replaces client-side row counting for the Manufacturers panel MFR Crosses column, fixing the Supabase 1000-row limit that caused 3PEAK's 34K cross-references to show as "—".

**Files:** `lib/services/partDataService.ts`, `lib/services/partDataCache.ts`, `scripts/supabase-cache-schema.sql`, `scripts/supabase-mfr-xref-counts-rpc.sql`, `app/api/admin/manufacturers/route.ts`, `app/api/admin/manufacturers/[slug]/route.ts`, `app/api/admin/manufacturers/[slug]/cross-references/route.ts`, `app/api/admin/overrides/rules/route.ts`, `app/api/admin/overrides/rules/[overrideId]/route.ts`, `app/api/admin/overrides/rules/restore/route.ts`, `app/api/admin/overrides/context/route.ts`, `app/api/admin/overrides/context/[overrideId]/route.ts`

---

## 129. Part Type Classification for BOM Line Items

**Decision:** Separate the concept of "what kind of BOM line item this is" (Part Type) from "did we find it in a catalog" (Validation Status). New `PartType` field: `electronic | mechanical | pcb | custom | other`.

**Problem:** The parts list `status` field conflated two ideas — classification and validation. A BOM with mechanical parts, PCBs, or custom/fabricated items would show those as "Not Found" even though they were never expected to match an electronics catalog. Users had no way to indicate that a line item was intentionally non-electronic.

**Solution:**
1. **New `PartType` union type** on `PartsListRow` — optional, `undefined` treated as `'electronic'` for backward compatibility.
2. **Non-electronic rows skip validation** — `validationManager.ts` filters to electronic rows only. Non-electronic rows are immediately marked `status: 'resolved'`.
3. **Auto-classification** — when catalog validation resolves a part, `partType` is auto-set to `'electronic'`.
4. **Inline dropdown** — `sys:partType` system column renders a `<Select>` in each table row for per-row type changes. Included in `DEFAULT_VIEW_COLUMNS`.
5. **Bulk action** — "Set Type" button in action bar applies a part type to all selected rows.
6. **Type change behavior** — switching to non-electronic: resolves immediately, clears catalog data. Switching back to electronic: resets to pending and triggers re-validation.
7. **Persistence** — `partType` stored in the existing rows JSONB (no Supabase schema change). Existing saved lists work unchanged.

**Files:** `lib/types.ts`, `lib/partsListStorage.ts`, `lib/supabasePartsListStorage.ts`, `lib/columnDefinitions.ts`, `lib/validationManager.ts`, `hooks/usePartsListState.ts`, `components/parts-list/PartsListTable.tsx`, `components/parts-list/PartsListActionBar.tsx`, `components/parts-list/PartsListShell.tsx`, `locales/en.json`, `locales/de.json`, `locales/zh-CN.json`

---

## 130. Master Views & List-Specific Views

**Decision:** Replace the copy-per-list view model with a clear two-tier system: Master Views (shared, Supabase-backed) and List-Specific Views (per-list only). Supersedes the old localStorage template system.

**Problem:** The old system copied all view templates into each list at creation time. Lists diverged independently — "Basic" looked different across lists, users couldn't tell what was shared vs. local, and there was no way to edit a view globally. The mental model was confusing.

**Solution — three view categories:**
1. **Original** — read-only, shows raw uploaded columns. Builtin, unchanged.
2. **Master Views** — shared across all lists, stored in Supabase `view_templates` table (user-scoped, RLS). Editing one updates it everywhere. Lists reference by ID, don't store copies.
3. **List-Specific Views** — per-list only, invisible to other lists. Stored in per-list `view_configs` JSONB.

**Key behaviors:**
- Edit a Master View → warning "Changes will apply across all your lists" → writes to `view_templates` table
- Demote Master → List-Specific → warning → removes from table, copies to per-list JSONB
- Promote List-Specific → Master → warning → sanitizes columns, creates in table, removes from per-list
- Create new view → user picks Master or List-Specific via radio toggle
- "Original" cannot be edited, deleted, or promoted
- Dropdown shows scope badges: "Master" (primary chip) or "This list" (outlined chip)
- Hidden rows for master views stored per-list in `masterViewOverrides` (not shared globally)
- `ss:*` columns auto-stripped from master views; `columnMeta` enables cross-list portability

**Migration:**
1. **localStorage → Supabase** (one-time, `useMasterViews` hook): old templates uploaded as master views, "Basic" seeded if none exist, localStorage cleared
2. **Per-list dedup** (lazy, each list load): old ViewState views matched to master views by name, copies removed, `hiddenRows` moved to `masterViewOverrides`, IDs remapped
3. **Backward compat**: old `ViewState` JSONB detected by absence of `migrated` flag, cleaned up transparently

**Schema:** `view_templates` table with UUID PK, user_id (RLS), name, columns (JSONB), description, column_meta, calculated_fields, is_default (unique partial index per user), sort_order, timestamps.

**Files:** `scripts/supabase-view-templates-schema.sql`, `lib/viewConfigStorage.ts`, `lib/supabaseMasterViewStorage.ts` (new), `hooks/useMasterViews.ts` (new, replaces `useViewTemplates`), `hooks/useListViewConfig.ts`, `components/parts-list/ViewControls.tsx`, `components/parts-list/ColumnPickerDialog.tsx`, `components/parts-list/PartsListShell.tsx`, `lib/supabasePartsListStorage.ts`, `locales/en.json`

## 131. FindChips API — Multi-Distributor Commercial Data (Apr 2026)

Replaced Mouser as the primary commercial data source with FindChips (FC) API, an aggregator covering ~80 distributors (Digikey, Mouser, Arrow, LCSC, Farnell, RS, TME, etc.) in a single ~60-200ms API call.

**Why:** Mouser provided single-distributor pricing/stock. FindChips returns data from all major distributors in one call — faster, broader coverage, and critically, includes Chinese distributors (LCSC, Winsource) that provide purchase paths for Atlas component recommendations. Also provides unique risk scoring data (designRisk, productionRisk, longTermRisk).

**Architecture:**
- `findchipsClient.ts` — GET API with 3-level cache (L1 in-memory 30min, L2 Supabase 24h, L3 live API), rate limiter (60/min, 5000/day), batch via concurrent individual calls
- `findchipsMapper.ts` — Maps FC response to `SupplierQuote[]` (one per distributor, sorted by best price), `LifecycleInfo` (with risk scores), `ComplianceData` (RoHS). `normalizeDistributorName()` maps 40+ variations to canonical keys
- `enrichWithFindchips()` replaces `enrichWithMouser()` in `partDataService.ts`
- `/api/fc/enrich` POST endpoint replaces `/api/mouser/enrich`
- No distributor filter — FC returns all available distributors per MPN

**Mouser retained:** Solely for `SuggestedReplacement` lookups (Decision #97). `fetchMouserSuggestions()` stays in the recommendation pipeline. Mouser client stripped to suggestions-only functions.

**Type changes:**
- `SupplierName` widened from fixed union to `string` (dynamic distributor names)
- `SupplierQuote` extended: `packageType`, `minimumQuantity`, `authorized`
- `LifecycleInfo` extended: `riskRank`, `designRisk`, `productionRisk`, `longTermRisk`
- `LifecycleInfo.source` and `ComplianceData.source` widened to `string`

**Column changes:** All `mouser:*` columns removed. New `fc:lifecycle`, `fc:riskRank`, `fc:designRisk`, `fc:productionRisk`, `fc:longTermRisk` columns. `commercial:bestPrice` and `commercial:totalStock` summary columns unchanged (auto-aggregate across all N supplier quotes). Saved views auto-strip `mouser:*` IDs via `sanitizeTemplateColumns()`.

**Commercial tab UI:** Shows N distributor cards (up to ~26), sorted by best unit price. Top 5 expanded, rest collapsed behind "Show N more distributors" toggle. Currency-aware pricing via `Intl.NumberFormat`. Package type and authorized distributor badge displayed. Flat-pricing fallback removed (FC always provides structured quotes).

**What FC provides that Mouser didn't:** ~80 distributors in one call, Chinese distributor coverage (LCSC), risk scores (design/production/long-term), country of origin, faster response (~60ms vs ~300ms).

**What FC doesn't provide that Mouser did:** HTS codes by region, ECCN (partsio still covers these), suggested replacement MPNs (Mouser retained for this).

**Files:** `lib/services/findchipsClient.ts` (new), `lib/services/findchipsMapper.ts` (new), `app/api/fc/enrich/route.ts` (new), `app/api/mouser/enrich/route.ts` (deleted), `lib/types.ts`, `lib/services/partDataService.ts`, `lib/columnDefinitions.ts`, `components/AttributesTabContent.tsx`, `hooks/useAppState.ts`, `hooks/usePartsListState.ts`, `components/parts-list/PartsListShell.tsx`, `lib/api.ts`, `lib/viewConfigStorage.ts`, `lib/services/partDataCache.ts`, `lib/services/apiUsageLogger.ts`, `components/ServiceStatusIcon.tsx`, `locales/en.json`, `locales/de.json`, `locales/zh-CN.json`

## 132. Distributor Click Tracking (Apr 2026)

Added client-side tracking of distributor link clicks in the Commercial tab, with an admin view for browsing click logs.

**Why:** The team needs visibility into which distributors users are clicking through to, which MPNs drive the most distributor visits, and which users are actively using the commercial data. This informs distributor partnership decisions and helps measure the value of the FindChips multi-distributor integration (Decision #131).

**Architecture:**
- **Client-side logging** via `logDistributorClick()` in `lib/supabaseLogger.ts` — same fire-and-forget pattern as `logSearch()`. Browser Supabase client inserts directly into `distributor_clicks` table. No server-side API route needed for writes.
- **Supabase table** `distributor_clicks`: `id` (UUID), `user_id` (FK auth.users), `mpn`, `manufacturer`, `distributor`, `product_url`, `created_at`. Indexes on user_id, created_at DESC, distributor, mpn. RLS: users INSERT/SELECT own rows; admin reads via service role.
- **Click point**: `SupplierCard` component in `AttributesTabContent.tsx`. The `<Link>` that opens `quote.productUrl` fires `logDistributorClick()` onClick. `CommercialContent` passes `mpn` and `manufacturer` down as optional props. Covers both AttributesPanel (source part) and ComparisonView (replacement part) usage sites.
- **Admin view**: New `'distributor-clicks'` section in the QC nav group. `DistributorClicksTab` component with distributor filter chips, debounced search (MPN/manufacturer/user), sortable columns (date, user, MPN, manufacturer, distributor), product URL link, and pagination. API route at `GET /api/admin/distributor-clicks` with `requireAdmin()` guard and profile enrichment.

**Files:** `scripts/supabase-distributor-clicks-schema.sql` (new), `lib/supabaseLogger.ts`, `components/AttributesTabContent.tsx`, `lib/types.ts` (`DistributorClickEntry`), `app/api/admin/distributor-clicks/route.ts` (new), `lib/api.ts`, `components/admin/DistributorClicksTab.tsx` (new), `components/admin/AdminSectionNav.tsx`, `components/admin/AdminShell.tsx`, `locales/en.json`, `locales/de.json`, `locales/zh-CN.json`

## Decision #132 — Persistent Admin Stats Cache + Atlas MFRs as Default Section (Apr 2026)

**Context:** The Atlas MFRs section (`ManufacturersPanel` → `/api/admin/manufacturers`) took ~10s on every cold load. Existing 30-min in-memory cache was lost on every server restart/deploy, forcing admin to wait repeatedly even though the underlying data only changes during ingest or on manufacturer enable/disable. Admin also opened to "Parameter Mappings" by default instead of the section they actually use most.

**Decision:** Persistent Supabase-backed cache (`admin_stats_cache` table, TEXT-keyed) fronted by a short-lived (60s) in-memory hot path. On GET, the route serves the persistent row instantly; computes fresh only if the row is missing or `?refresh=1` is passed. Writes that affect the aggregate (`PATCH /api/admin/atlas/manufacturers` toggle, `PATCH /admin/manufacturers/[slug]`, cross-ref POST/DELETE) call `invalidateManufacturersListCache()` which deletes the row AND kicks off a fire-and-forget background recompute so the next admin load is already warm. Manual "Refresh" button in the panel header (with relative "Computed Xh ago" label) forces recompute for edge cases. Default admin section changed from `'param-mappings'` to `'manufacturers'`.

**Rationale:** The data changes rarely — waiting 10s per session is pure UX tax. Persistence across deploys is the key unlock. Background recompute after invalidation means even after a change, the next visit is instant. Refresh button is the escape hatch. `admin_stats_cache` is TEXT-keyed to host future admin-panel aggregations without schema churn.

**Files:** `scripts/supabase-admin-stats-cache-schema.sql` (new, generic keyed cache), `app/api/admin/manufacturers/route.ts` (persistent cache, `computeStats()` extracted, `?refresh=1` support, background recompute on invalidation), `app/api/admin/atlas/manufacturers/route.ts` (calls `invalidateManufacturersListCache()` on toggle), `components/admin/ManufacturersPanel.tsx` (Refresh button + relative-time label, reads `cachedAt`), `components/admin/AdminShell.tsx` (default section → `'manufacturers'`).

## Decision #133 — Manufacturer Cross-Reference Lookup Fixes + Certified-Cross Bypass (Apr 2026)

**Context:** Searching `TPW4157-TR` (a 3PEAK analog switch) produced zero MFR-certified recommendations despite 3PEAK having uploaded 136 cross-references with TPW4157 as the replacement for various Texas Instruments parts. Three distinct bugs combined to hide them: (1) packaging suffix `-TR` didn't normalize to the bare MPN stored in the cross-ref table; (2) `fetchManufacturerCrossRefs` only queried `original_mpn`, so an MPN that appeared as `xref_mpn` (the "replacement side") never matched — effectively making cross-references one-directional; (3) even when certified candidates surfaced, post-scoring family-specific blocking-rule filters (C2, C4–C10, D1–D2, E1, F1–F2) hard-dropped them if any architectural/topological attribute disagreed with the source, overriding the human certification.

**Decision:**
1. **Packaging suffix normalization** — new `lib/services/mpnNormalizer.ts` with conservative `stripPackagingSuffix()` (handles `-TR`, `-T/R`, `-REEL`, `-CT`, `-7INCH`, `-13INCH`, `/R7`) and `mpnLookupCandidates()` that returns both raw and stripped variants. Applied in the cross-ref lookup query. Conservative list — never strips patterns that could encode part variant (grade, tolerance, voltage).
2. **Bidirectional cross-reference lookup** — `fetchManufacturerCrossRefs` now queries both `original_mpn` and `xref_mpn` via Supabase `.or()` across all candidate MPNs. For reverse matches (hit via `xref_mpn`), the row's fields are swapped before returning so the consumer in `partDataService.ts` transparently reads `xref_mpn` as the recommendation MPN. Pin-to-pin and functional equivalence are symmetric, so reverse matches are semantically valid.
3. **Pin-to-pin sort preference** — added `mfrEquivalenceType?: 'pin_to_pin' | 'functional'` to `XrefRecommendation`, populated from a per-MPN map (pin-to-pin wins when both exist). `RecommendationsPanel` sort comparator applies `category → mfrEqRank (pin_to_pin → functional → none) → score` within each category.
4. **Certified-cross bypass on post-scoring filters** — new `isCertifiedCross(rec)` helper (true for `manufacturer` or `partsio_*` certifications). All 13 post-scoring blocking-rule filters wrapped through a local `withCertifiedBypass()` at the call site: certified recs are split off, filter runs on uncertified only, result is recombined. `filterRecsForBatch` also extended to keep MFR-certified crosses (previously only parts.io).
5. **Cache invalidation** — `RECS_CACHE_SCHEMA_VERSION` bumped `v1 → v2` (reverse lookup) and again `v2 → v3` (certified-cross bypass) so affected families recompute on next search.

**Rationale:** An explicit human certification — whether a manufacturer uploaded a cross-reference spreadsheet or Accuris's data team marked FFF/Functional equivalence — represents stronger real-world evidence than our inferred blocking-rule rejection. The pipeline was silently dropping these high-signal candidates. Directionality: once an authorized cross-reference is uploaded, both parts are certified equivalents; restricting lookup to one direction was an artifact of table schema, not semantics. Packaging suffixes are a purely cosmetic distinction that never affects electrical equivalence. Pin-to-pin is a stronger guarantee than functional (drop-in replacement vs. logical equivalent), so when a manufacturer certifies both for the same MPN, pin-to-pin should surface first.

**Known trade-off:** Popular xref targets (TPW4157 maps to 136 TI parts in 3PEAK's upload) incur a cold-compute cost on first search — each reverse-matched xref MPN is resolved via `getAttributes()` serially through the candidate resolver. Observed ~25s cold path; subsequent searches hit the 30-day L2 recs cache and return in <100ms. User explicitly declined capping reverse matches because every row is a manufacturer-certified option. Future work: batch MPN resolution or pre-resolve common reverse xrefs at ingest time.

**Files:** `lib/services/mpnNormalizer.ts` (new), `lib/services/manufacturerCrossRefService.ts` (bidirectional query + reverse-match field swap), `lib/types.ts` (`mfrEquivalenceType` on `XrefRecommendation`), `lib/services/partDataService.ts` (`mfrEquivalenceTypeMap`, `isCertifiedCross`, `withCertifiedBypass` wrapping all 13 post-scoring filters, `filterRecsForBatch` extended), `components/RecommendationsPanel.tsx` (pin-to-pin sort within category), `lib/services/partDataCache.ts` (`RECS_CACHE_SCHEMA_VERSION` → `v3`).

## Decision #134 — Overview Tab Consolidation, Risk & Compliance Tab Removed (Apr 2026)

**Context:** The Part Detail panel had three tabs — **Specs**, **Risk & Compliance**, **Commercial** — but no single surface summarized a part at a glance. A user inspecting a part had to tab through three views to piece together image + identity + lifecycle + distributor footprint + compliance. The Risk & Compliance tab, in particular, only showed lifecycle/compliance/supply-chain rows without any of the other high-level context.

**Decision:** Add a new **Overview** tab (leftmost, default) that consolidates a summary of the part: image (Digikey `PhotoUrl`), identity (MPN/MFR/category/subcategory), description, origin & lifecycle (country of origin, status, years to EOL, risk rank, suggested replacements), distribution aggregates (distributor count, price range, **Target Price**), cross-references summary (counts + MFR list — source-side only, gated on `allRecommendations.length > 0`), and environmental & export classifications (RoHS / REACH / ECCN / HTS + regional HTS). The **Risk & Compliance** tab is removed; its lifecycle + compliance fields migrate into the Overview tab's sections.

**Target Price formula:** For each distributor, take the unit price at that distributor's highest-quantity price break. Then take the minimum of those per-distributor top-tier prices and multiply by 0.80. Rationale: approximates a "best price at volume, then negotiated" target. Hidden when no price breaks exist. Tooltip on the row explains the formula.

**Cross-References section scope:** Rendered only on the source-side Overview (inside `AttributesPanel`), never on the replacement-side Overview (inside `ComparisonView`). A replacement part has no cross-references of its own. Source-side gets `allRecommendations` piped from `DesktopLayout` / `MobileAppLayout` / `PartDetailModal`.

**Chinese manufacturer flag:** MFR chips in the cross-reference list append `🇨🇳` when any rec for that MFR has `dataSource === 'atlas'`, reusing the exact markup from `RecommendationCard.tsx`.

**Files:** `components/AttributesTabContent.tsx` (new `OverviewContent` component with `computeTargetPrice` / `computePriceRange` / `summarizeCrossRefs` helpers; `RiskContent` removed), `components/DesktopLayout.tsx` / `components/MobileAppLayout.tsx` / `components/parts-list/PartDetailModal.tsx` (`AttributesTab = 'overview' | 'specs' | 'commercial'`, default `'overview'`, pipe `allRecommendations`/`recs` to source-side panel), `components/AttributesPanel.tsx` (accept `allRecommendations` prop, render `OverviewContent`), `components/ComparisonView.tsx` (render `OverviewContent` without recs), `locales/{en,de,zh-CN}.json` (`tabOverview` key added, `tabRisk` removed).

## Decision #135 — FindChips: Don't Cache Empty Results (Apr 2026)

**Context:** FindChips lookups for parts that temporarily returned zero distributors (rate-limit rejection, API hiccup, stale index, transient upstream issue) were writing a `NOT_FOUND_SENTINEL` to the L2 Supabase cache with a 24-hour TTL. Subsequent requests for the same MPN within that window returned the cached null without ever re-hitting the API, so genuinely-stocked parts (e.g., `TNC0402GTC10K0F345`, a Stackpole NTC thermistor with multiple distributors on findchips.com) could appear as "No pricing data" for a full day. The single-call `getFindchipsResults` path wrote the sentinel; the batch path also read it on the next lookup.

**Decision:** Stop writing empty-result sentinels to L2 on both paths. If the API returns zero distributors we simply return `null` without persisting anything — the next request re-queries. On reads we also ignore any legacy `NOT_FOUND_SENTINEL` rows that were written before this change, so historical entries don't keep masking live results until they expire on their own. Successful (hit) responses continue to be cached normally at `TTL_COMMERCIAL_MS` (24h).

**Trade-off:** Re-querying on every empty response costs an API call each time. Acceptable because (a) the rate limiter (60/min, 5000/day) already caps total spend, (b) most parts that genuinely have no distributors are obscure and rarely looked up, and (c) the user-visible cost of a 24h stale miss is much higher than the server-side cost of extra calls. If spam becomes a problem we can revisit with a much shorter sentinel TTL (e.g., 5 min) instead of removing it entirely.

**Files:** `lib/services/findchipsClient.ts` (remove `NOT_FOUND_SENTINEL` / `TTL_NOT_FOUND_MS` writes on both single + batch paths; read paths now treat sentinels as cache-miss).

## Decision #136 — Mouser Removed from Multi-Source Search (Apr 2026)

**Context:** `searchParts()` queried Mouser as one of four data sources (Digikey + Atlas + Parts.io + Mouser) for MPN-like queries. When Mouser was the *only* source returning a hit — e.g., `GD25B127DSIGR`, a GigaDevice NOR Flash memory not indexed by Digikey or Atlas and not in Parts.io — the UI would render the part card with a "Mouser" badge, then fail when the user clicked through. `getAttributes()` only tries Digikey → Parts.io → Atlas and has no Mouser fallback, so the subsequent `/api/attributes/[mpn]` call returned 404 and the chat showed the generic "Something went wrong while fetching part details" error. Users could discover parts that the downstream pipeline could not process.

**Decision:** Drop Mouser from `searchParts()` entirely. The MPN-branch now only adds Parts.io to the always-on Digikey + Atlas pair. `searchMouserProducts` remains exported in `mouserClient.ts` but is no longer called from the search path. Mouser continues to be used for `SuggestedReplacement` injection into the recommendation pipeline (Decision #97) and is otherwise unused for source-part data — FindChips (Decision #131) is the N-distributor commercial aggregator.

**Rationale:** Per Decision #131, FindChips replaced Mouser as the multi-distributor commercial source. Mouser's participation in search was architectural debt from before that split. Adding a Mouser attribute fallback (map `MouserProduct` → `PartAttributes`) was the alternative, but Mouser's API returns very thin parametric data — the user would get an identity card with an empty attributes panel and no meaningful recommendations, replacing one confusing error with a different dead-end. Silent discoverability for parts we can't process downstream is worse UX than not surfacing them at all. If FindChips coverage gaps prove to matter in practice (GigaDevice, LCSC-only parts, etc.), the clean follow-up is a real FindChips-based search path rather than keeping a half-integrated Mouser search alive.

**Files:** `lib/services/partDataService.ts` (remove `searchMouserProducts` import and its block from the MPN-specific search list; update merge-priority comment from `Digikey → Atlas → Parts.io → Mouser` to `Digikey → Atlas → Parts.io`), `CLAUDE.md` (update "Multi-source search" bullet).

## Decision #137 — Identity Rule: String-Equality-First Comparison (Apr 2026)

**Context:** `evaluateIdentity()` in the matching engine compared `numericValue` via strict `===` (or relative tolerance after a subsequent fix). This produced spurious "fail" results on visually identical values like `"0.33 µF"` vs `"0.33 µF"` when the two parts' `numericValue` fields had been populated by *different* data sources with *different* normalization conventions. Digikey's mapper normalizes to base SI units (`"0.33 µF"` → `3.3e-7`); Parts.io's mapper stores the raw number (`0.33`). When a candidate's capacitance came from Parts.io gap-fill while the source came from Digikey, the identity check compared `3.3e-7` to `0.33` and failed — even though the display strings users see are identical. An earlier fix (relative-tolerance `<1e-6`) handled intra-Digikey float rounding but not cross-source unit-scale mismatches.

**Decision:** Swap the ordering in `evaluateIdentity()`. Always check `normalize(sourceValue) === normalize(candidateValue)` **first**. If the rendered strings match, pass — regardless of what either source stored as `numericValue`. Numeric comparison (with the 1e-6 relative tolerance for float rounding) now runs only as a fallback when the strings genuinely differ, catching legitimate equivalences like `"0.33µF"` vs `"330nF"`.

**Rationale:** The display value is the authoritative representation of the parametric — it's what the user sees and what the engineering engineer-reviewer would compare against. Two sources may have different opinions about how to normalize internally, but if both mapped to the same display string, the parametric value agrees. This avoids making the engine dependent on every data source's mapper agreeing on a canonical numeric representation.

**Cache invalidation:** Bumped `RECS_CACHE_SCHEMA_VERSION` from `v4` → `v5` so stale scored matchDetails with false "fail" entries get recomputed on next search.

**Files:** `lib/services/matchingEngine.ts` (reorder evaluateIdentity to try string equality first), `lib/services/partDataCache.ts` (`RECS_CACHE_SCHEMA_VERSION` → `v5`).

## Decision #138 — Recommendation Card Redesign + Prioritized FindChips Enrichment (Apr 2026)

**Context:** With FindChips (Decision #131) providing N-distributor pricing for every recommendation, the per-card display needed an update. The old card showed one line per supplier with hardcoded Digikey/Mouser labels and a Digikey-only legacy fallback from `part.unitPrice`. Users also wanted commercial data visible by default (not hidden behind a toggle), the datasheet icon removed from the card face (it's available in the Part Detail), and faster perceived load time — a 74-MPN search took up to 60s before the last cards populated because chunks were awaited sequentially and the FindChips rate limiter (60 calls/min) capped throughput.

**Decision:**
1. **Card display** — replace per-supplier lines with a compact two-line summary reading `Price Range: $min–$max (N Distributors)` and `Total Stock: N,NNN` in plain white (no bold). Drop the legacy `part.unitPrice` fallback; show `No distributor data` (or `Loading pricing…` italic while enrichment is in flight) when no `supplierQuotes`. Remove the datasheet PDF icon from the card header — it remains in the Part Detail panel.
2. **Default visible** — `showCommercial` in `RecommendationsPanel` now initializes to `true`. The `$` toggle still exists if users want to hide the summary.
3. **Parallel chunked enrichment** — `triggerFCEnrichment` in `useAppState` now chunks the full MPN list and fires chunks in parallel via `Promise.all`, with per-chunk `setState` so cards populate as each chunk returns (not all-at-once after the slowest chunk).
4. **Priority chunk** — the first chunk is sized 30 (instead of 50) and contains the top-ranked recs by display priority (MFR Certified → 3rd Party Certified → Logic Driven; pin-to-pin before functional; higher match score first). This ensures the user's visible top-of-list cards populate within seconds even under rate-limit throttling.
5. **Loading state** — new `isEnrichingFC` flag on `AppState` propagates through `AppShell → {Desktop,Mobile}Layout → RecommendationsPanel → RecommendationCard`. Empty cards show `Loading pricing…` during enrichment, reverting to `No distributor data` only after the batch settles.
6. **Server-cap respected** — `enrichWithFCBatch` stays a single-call helper; callers (`useAppState.triggerFCEnrichment` and `usePartsListState.runFCEnrichment`) chunk at 50 (the `/api/fc/enrich` cap) and call in parallel.

**Rate-limit caveat:** FindChips' 60-call/minute cap still applies — for a 74-rec search, ~14 MPNs queue until the next minute rolls over. Prioritization guarantees those 14 are the lowest-visibility recs. If FindChips' actual allowance is higher, `PER_MINUTE_CAP` in `findchipsClient.ts` can be raised.

**Shared sort helper:** Extracted `sortRecommendationsForDisplay()` from `RecommendationsPanel.tsx` so the enrichment trigger and the display component use the same ranking — there is a single source of truth for "what the user sees at the top."

**Files:** `components/RecommendationCard.tsx` (two-line summary, removed datasheet icon + unused import, `isEnrichingFC` prop), `components/RecommendationsPanel.tsx` (default `showCommercial=true`, `sortRecommendationsForDisplay` export, pipe `isEnrichingFC`), `components/{DesktopLayout,MobileAppLayout}.tsx` + `components/AppShell.tsx` (pipe `isEnrichingFC` through), `hooks/useAppState.ts` (`isEnrichingFC` in AppState, parallel chunked enrichment, priority chunk, import shared sort), `hooks/usePartsListState.ts` (chunk enrichment in parallel), `lib/api.ts` (revert `enrichWithFCBatch` to single-call).

## Decision #139 — Atlas External API: Manufacturer Profile Enrichment (Apr 2026)

**Context:** Atlas engineering team provided an external HTTP API (`https://cn-api.datasheet5.com`) for manufacturer and product data. The API currently serves manufacturer list, profiles, and paginated product listings — no parametric data on products yet. Our `atlas_manufacturers` table had 1,011 records but most profile JSONB columns (summary, certifications, HQ, etc.) were empty, with the Profile tab showing "No profile data yet" for most manufacturers.

**Decision:**
1. **Profile-only integration** — use the API exclusively for manufacturer profile enrichment. The API's product endpoint returns less data than what's already in `atlas_products` (no parameters, no family_id) and lacks bulk/family queries needed by the recommendation pipeline.
2. **ID mapping validated** — API partner `id` matches our `atlas_id` at 89.2% (297/333 API partners). Zero ID mismatches. 35 API-only partners (not in our DB), 714 local-only (not in API). Join key: `atlas_id`.
3. **Batch sync script** (`scripts/atlas-api-sync-profiles.mjs`) — fetches partner details one-by-one and enriches existing rows. Merge strategy: "API enriches, existing data preserved" (don't overwrite non-null admin-edited fields unless `--force`). Flags: `--dry-run`, `--force`, `--verbose`, `--id <N>`, `--add-new`.
4. **New DB columns** — `contact_info`, `core_products`, `stock_code`, `gaia_id`, `api_synced_at` added to `atlas_manufacturers` (migration: `scripts/supabase-atlas-manufacturers-profile-migration.sql`).
5. **API client** — `lib/services/atlasApiClient.ts`, server-side only, `ATLAS_API_TOKEN` env var, typed response interfaces for all 4 endpoints.
6. **Profile tab enriched** — `ManufacturerDetailPage.tsx` Profile tab now shows: About (summary), Basic Info (founded year, HQ, website link, contact, stock code), Core Products (comma-split chips), Aliases, Parts.io, Certifications (parsed with category inference), Compliance, Logo. API sync timestamp shown in header.

**Results:** 297 manufacturers enriched. Coverage: 229 with summaries, 108 with logos, 64 with parsed certifications.

**Future:** When the API adds parametric data on products, it could replace the JSON file ingestion pipeline (`atlas-ingest.mjs`). The Supabase-first architecture remains — batch sync to Supabase, query from Supabase. Live API queries are unsuitable for the recommendation hot path.

**Admin sync buttons:** Two sync triggers in the admin UI, both reusing `lib/services/atlasProfileSync.ts`:
- **ManufacturersPanel** — "Sync Profiles" button (batch all 297 matched manufacturers, ~30s). `POST /api/admin/manufacturers` → `syncAllProfiles()`. Shows progress alert with counts.
- **ManufacturerDetailPage** — "Sync Profile" button on Profile tab (single manufacturer, ~200ms). `POST /api/admin/manufacturers/[slug]/sync` → `syncSingleProfile()`. Re-fetches detail data to reflect changes in place.

**Files:** `lib/services/atlasApiClient.ts` (new), `lib/services/atlasProfileSync.ts` (new — shared sync logic), `scripts/atlas-api-validate-ids.mjs` (new), `scripts/atlas-api-sync-profiles.mjs` (new), `scripts/supabase-atlas-manufacturers-profile-migration.sql` (new), `lib/types.ts` (AtlasManufacturer extended), `lib/api.ts` (syncAllMfrProfiles, syncMfrProfile), `app/api/admin/manufacturers/route.ts` (POST handler for batch sync), `app/api/admin/manufacturers/[slug]/route.ts` (new fields exposed + PATCH allowlist), `app/api/admin/manufacturers/[slug]/sync/route.ts` (new — single sync), `components/admin/ManufacturersPanel.tsx` (Sync Profiles button), `components/admin/ManufacturerDetailPage.tsx` (Profile tab enriched + Sync Profile button).

## Decision #140 — Granular Replacements Columns: Y/N Xrefs + Per-Bucket Counts (Apr 2026)

**Context:** The parts-list Replacements column group collapsed every cross-reference into a single "Xrefs" count. That flattens trust tiers that users care about: logic-driven matches depend on attribute-level scoring (weaker when source data is missing), whereas manufacturer-uploaded cross-references and parts.io (Accuris) FFF/functional equivalents are explicit human- or vendor-certified equivalences. `RecommendationsPanel` already classified recs via `deriveRecommendationCategories()` but only as *overlapping* buckets, and only inside the modal — the list view gave no signal that a row had high-trust certified alternatives.

**Decision:**
1. **New mutually-exclusive bucket** — add `RecommendationBucket = 'accuris' | 'manufacturer' | 'logic'` plus `deriveRecommendationBucket()` and `computeRecommendationCounts()` in `lib/types.ts`. Priority: **Accuris > Manufacturer > Logic**. Accuris is parts.io-only (`partsio_fff`, `partsio_functional`); Mouser-only certified and all uncertified recs fall into Logic. The existing overlapping `deriveRecommendationCategories()` is left unchanged (still used by the modal chips).
2. **`sys:hits` becomes Y/N** — replace the count-Link with "Y" (clickable → drawer) or "N" (muted, not clickable). Sort value collapses to boolean 1/0 so Y rows sort above N rows. Label stays "Xrefs".
3. **Three new Replacements columns** — `sys:logicBasedCount`, `sys:mfrCertifiedCount`, `sys:accurisCertifiedCount`. All `isNumeric: true`, center-aligned, clickable when > 0 (opens drawer). Not in `DEFAULT_VIEW_COLUMNS` — opt-in via the column picker so existing users aren't surprised.
4. **Persisted counts** — new `logicDrivenCount`, `mfrCertifiedCount`, `accurisCertifiedCount` fields on `PartsListRow` and both `StoredRow` variants. Computed from full `allRecommendations` at validation time (in `usePartsListState.ts` and `validationManager.ts`) and persisted in the existing `parts_lists.rows` JSONB — no DB schema change. Older stored rows lack these fields and render `0` until next validation.

**Rationale:** Mutually-exclusive was the user's call — framed as trust tiers, overlapping counts were confusing (a single rec could appear in two buckets). Accuris outranks Manufacturer because parts.io's FFF/functional data comes from a commercial equivalence registry with stricter curation than our manufacturer upload workflow, which accepts bulk drops without per-entry review. Mouser moved to Logic because it's a suggestion stream, not a certification, and including it under "Accuris Certified" (as the modal does) conflates two very different data qualities.

**Known inconsistency (follow-up):** `RecommendationsPanel` still uses the overlapping `deriveRecommendationCategories()` and labels its third-party bucket "Accuris Certified" despite including Mouser. After this change the list column "Accuris Certified" excludes Mouser while the modal chip includes it. Harmonize in a follow-up — either rename the modal chip or split Mouser out there too.

**Files:** `lib/types.ts` (`RecommendationBucket`, `deriveRecommendationBucket()`, `computeRecommendationCounts()`, new `PartsListRow` count fields), `lib/partsListStorage.ts` + `lib/supabasePartsListStorage.ts` (`StoredRow` extended, `toStoredRows`/`fromStoredRows` carry counts), `hooks/usePartsListState.ts` + `lib/validationManager.ts` (populate counts wherever `allRecommendations` is assigned, reset alongside `recommendationCount`), `lib/columnDefinitions.ts` (three new `SYSTEM_COLUMNS` entries, Y/N sort semantics for `sys:hits`, numeric sort cases for new columns), `components/parts-list/PartsListTable.tsx` (Y/N renderer for `sys:hits`, count renderer for the three new columns), `__tests__/services/recommendationBucket.test.ts` (new — 10 tests covering bucket priority and count tallying).

## Decision #141 — Cache-Only Bucket-Count Backfill for Legacy Lists (Apr 2026)

**Context:** Decision #140 added three per-bucket count fields to `StoredRow`. Lists validated **before** that change don't have the fields in their `parts_lists.rows` JSONB, and since `allRecommendations` is intentionally not persisted (too heavy), the list view showed a **—** dash for those columns until the user manually refreshed each row. For a 500-part BOM that's a non-starter.

**Decision:** On list load, silently backfill the three counts from the existing L2 recommendations cache (`part_data_cache` table, Decision #128) — **cache-only**, never fall through to a live pipeline run. Runs once per list, ever; writes back to Supabase so subsequent opens skip the backfill entirely.

**Pipeline:**
1. `handleLoadList()` detects any resolved row with `recommendationCount > 0` and all three bucket counts `undefined`.
2. Fires `POST /api/parts-list/backfill-counts { listId }` (fire-and-forget).
3. Server loads the list, authenticates ownership via RLS, fetches user prefs, and for each target row calls the new `lookupCachedRecommendations()` helper using the **exact same inputs** the validation pipeline used (`currency, userPreferences, { skipPartsioEnrichment: true, filterForBatch: true, skipFindchips: true }`) — this guarantees the variant key matches the entry written at validation time.
4. Cache hit → compute buckets via `computeRecommendationCounts()`, include in response. Cache miss → row stays as dash; user can refresh it explicitly if desired.
5. Client merges updates into row state, persists with a single `updatePartsListSupabase()` call.
6. `NotificationSnackbar` reports the outcome (`"Updated replacement counts for N rows from cache"` or `"N rows missing replacement counts — refresh to populate"`).

**Rationale:** The recs L2 cache is 30-day TTL and cross-user (Decision #128) — if anyone has validated a given MPN in the last month, it's in `part_data_cache` and readable in <100ms. Zero Digikey / Mouser / parts.io / FindChips exposure from the backfill. Rate-limit-sensitive APIs are never touched. Cold-cache rows (older than 30 days or never validated) stay as dashes, which is the honest state — a full refresh is required to recompute them, and that's the same cost whether triggered now or later.

**Why not auto-refresh cold rows?** A 500-row BOM could be fully cold. Auto-refreshing would blow through Digikey's rate limit for a cosmetic column fill the user may not even look at. Cache-only keeps the cost at zero and degrades gracefully for cold entries.

**Variant key alignment critical:** The recs cache variant hash includes `currency, userPrefs, opts`. The backfill endpoint passes `skipPartsioEnrichment: true, filterForBatch: true, skipFindchips: true` to exactly match what `app/api/parts-list/validate/route.ts:82-84` passes during validation. Any mismatch = 100% cache miss. This is fragile — if validation options change, the backfill must be updated in lockstep.

**Concurrency:** 5 parallel cache reads (Supabase can trivially handle this).

**Files:** `lib/services/partDataService.ts` (new `lookupCachedRecommendations()` export wrapping `buildRecommendationsVariant` + `getCachedResponse`), `app/api/parts-list/backfill-counts/route.ts` (new endpoint — POST, auth + RLS check, load list, iterate targets, return `{ updates, scanned, hit, miss }`), `lib/api.ts` (new `backfillListCounts()` client wrapper + response types), `hooks/usePartsListState.ts` (fire backfill after `handleLoadList` resolves, merge updates, persist once, `backfillCountsResult` added to state), `components/parts-list/PartsListShell.tsx` (effect surfaces `backfillCountsResult` via `NotificationSnackbar`).

## Decision #142 — Refresh Forces Cache Bypass for Recovered Upstream Services (Apr 2026)

**Context:** The recs L2 cache (Decision #128) writes a "final" entry whenever `getRecommendations()` completes, even if upstream sources partially failed. `fetchPartsioEquivalents()` catches network errors and returns empty — so a user validating a list while disconnected from the parts.io VPN silently produces recommendations with zero Accuris candidates, and that partial-outage result persists for 30 days. When the same user later reconnects to VPN and clicks Refresh expecting fresh parts.io data, `handleRefreshRows` → `validatePartsList` → server `getRecommendations()` hits the cached variant key and short-circuits **before** parts.io is re-attempted. Accuris counts stay stuck at zero regardless of how many times the user refreshes. The cache is authoritative when it shouldn't be.

**Decision:** The Refresh button now bypasses the L2 cache read via a runtime-only `forceRefresh` flag threaded from the UI through the validate endpoint into `getRecommendations()`. The computed result is still *written* to cache, so subsequent callers (list load backfill, modal opens) benefit from the fresh entry. The flag is **excluded from `buildRecommendationsVariant`** — it's a request-scope behavior toggle, not a cache-key input, so the same variant string is used for read and write (fresh result replaces stale entry in place).

**Scope:** `forceRefresh` applies ONLY to user-initiated Refresh:
- `handleRefreshRows` (toolbar Refresh + snackbar "Refresh N" action) → `true`
- Initial validation after upload (`validationManager.ts`) → unset (cache-friendly — a fresh upload has no existing entry, so bypassing the read is wasteful)
- Single-part Add flow (`handleAddPart`) → unset (new MPN, cache probably cold anyway)
- `handleOpenModal` single-row modal fetch → unset (different variant due to `filterForBatch: false`)
- `/api/xref/[mpn]` GET/POST (non-list flows) → unset

**Rationale:** Refresh should mean *fresh*. The alternatives considered:
- **Don't cache on partial outage** — propagate service-unavailable flags up to the cache writer, skip write if any source errored. Correct but invasive — touches every error handler and adds coupling between unrelated services.
- **Time-bound retry of failed sources** — tag cache entries with "parts.io failed at write time" and re-attempt parts.io (only) on reads after some cooldown. Clever but complicates the cache schema and creates a second cache-state axis (per-source freshness).
- **User-facing "bust cache" toggle** — admin escape hatch. Good for debugging, bad for normal users.

Forced refresh on the Refresh button is the simplest correct fix: the user who knows something is wrong already has the mental model of "this data might be stale, hit Refresh" — aligning behavior with that expectation is lower-friction than any server-side cleverness.

**Known limitation:** This fixes batch validation only. The modal-click path (`handleOpenModal` → `getRecommendations(mpn)` with default opts) uses a *different* cache variant (`filterForBatch: false`) and doesn't get forced. If a cold entry exists for that variant, clicking Y still returns it. In practice the modal variant is usually cold (only populated by explicit user modal opens), so this rarely hurts. Follow-up could add forceRefresh to the modal path too if real-world complaints arise.

**Files:** `lib/services/partDataService.ts` (getRecommendations options type gains `forceRefresh?: boolean`, `buildRecommendationsVariant` already ignores it via its explicit field pick, cache-read block guarded by `if (!options?.forceRefresh)`), `app/api/parts-list/validate/route.ts` (`processItem` accepts forceRefresh, passes it into getRecommendations, POST handler plumbs `body.forceRefresh`), `lib/types.ts` (`BatchValidateRequest.forceRefresh` field), `lib/api.ts` (`validatePartsList(items, currency, signal, forceRefresh?)` gains 4th param), `hooks/usePartsListState.ts` (`handleRefreshRows` passes `true`; other call sites unchanged).

## Decision #143 — Sort Order Flipped: Accuris → MFR → Logic (Apr 2026)

**Context:** Decisions #127 / #133 established the modal recommendation sort as MFR Certified → 3rd Party Certified → Logic Driven. Decision #140 then introduced mutually-exclusive bucket priority (Accuris > MFR > Logic, Mouser-only → Logic) for the parts-list count columns, but the modal's top-level sort was left in the original order. This meant the "Top Suggestion" surfaced at row 0 in the list view could be a different rec than the one at the top of the modal for the same part — a confusing inconsistency.

**Decision:** Flip `sortRecommendationsForDisplay()` to use `deriveRecommendationBucket()` directly (Accuris → MFR → Logic). The modal's sort, the parts-list Top Suggestion, and the bucket count columns now use one priority scheme. Mouser-only certified recs fall into the Logic bucket — consistent with Decision #140's Accuris = parts.io-only definition.

**Rationale:** Parts.io's FFF/functional equivalents come from a curated commercial equivalence registry with stricter per-entry validation than bulk manufacturer cross-reference uploads (which are accept-as-submitted). Per Decision #140 the user explicitly chose Accuris as the highest trust tier; extending that ordering into the recommendation display was the natural follow-up — the Top Suggestion you see in the list matches the top card in the modal matches the Accuris Certified bucket count.

**Visual language not updated:** Category chip colors in the modal remain as before — MFR green, Accuris amber, Logic blue. Flipping chip colors alongside sort order risks confusing users who've built muscle memory. If the sort change creates confusion in practice we can revisit, but it's decoupled from priority. The chip filter uses `deriveRecommendationCategories()` (overlapping) unchanged — a rec certified by BOTH parts.io and manufacturer will still appear in both chip filters, even though it sorts under Accuris.

**Files:** `components/RecommendationsPanel.tsx` (`sortRecommendationsForDisplay()` categoryPriority uses `deriveRecommendationBucket()`; docstring updated; imports `deriveRecommendationBucket`), `CLAUDE.md` (Sort order bullet rewritten to point to Decision #143). `hooks/useAppState.ts` unchanged — already consumes the shared helper.

## Decision #144 — Shared Sort Helper + Hide Match % for Certified Recs in List View (Apr 2026)

**Context:** Two related issues surfaced after the #143 sort reorder.

**Issue 1 — Server/client sort divergence:** `findReplacements()` in the matching engine sorts by `passed` flag then `matchPercentage` with manufacturer-preference boost. The validate route takes `recs[0]` as `suggestedReplacement` and persists it onto the list row. The client's `sortRecommendationsForDisplay()` then re-sorts on display using category bucket priority. Result: the Top Suggestion shown in the parts-list row and the top card in the modal could be **different recs** for the same part. Reported case: `16ZLH2200MEFC12.5X20` showed `EU-FS1E222B / Panasonic` in the list but `MAL214855222E3 / Vishay BCcomponents` (Accuris Certified) at the top of the modal — the higher-match logic-driven rec beat the Accuris-certified one on server side because bucket priority wasn't applied.

**Issue 2 — Confusing percentage display on certified recs:** When the list view's Top Suggestion was an Accuris or MFR cert, the row still showed a match % like `89%` next to the MPN. That number reflects parametric attribute coverage from the matching engine — meaningful for logic-driven matches, misleading for certified ones where the equivalence is asserted by an external registry (parts.io FFF/functional or MFR cross-ref upload) regardless of how many internal parametric rules match.

**Decision:**

**Part 1 — Share the sort.** Extract `sortRecommendationsForDisplay()` into a plain lib module (`lib/services/recommendationSort.ts`) and call it server-side inside `getRecommendations()` right before the cache write. The result: every consumer (batch validate's `suggestedReplacement`, single-xref endpoint, modal fetch, FindChips priority chunk, persisted list rows) receives recs already sorted by bucket priority. The client's redundant sort is idempotent — safe, but no longer load-bearing. `RecommendationsPanel.tsx` re-exports the helper from its new home to keep backward-compat for existing imports (`useAppState.ts`).

**Part 2 — Hide match % AND match-quality dot for certified recs in the list.** In `sys:top_suggestion` cell renderer, gate BOTH the percentage Typography AND the colored dot on `deriveRecommendationBucket(topRec) === 'logic'`. The red/yellow/green dot derives from parametric coverage (red = any rule failed, ≥85% = green, else yellow) — orthogonal to external certification. Showing a red "fail" dot next to an Accuris- or MFR-certified part is actively misleading, since certified recs bypass the blocking-rule filters per Decision #133 precisely because external authority outranks our inferred parametric rejection. For certified recs the list cell now shows just the MPN (and optional preferred-alternate star). Modal continues to render the dot and percentage unconditionally — the drawer has the room for the nuance (category chip + match % + per-rule breakdown) that the narrow list cell doesn't.

**Retroactive behavior:** Existing rows validated before this change still carry the old `suggestedReplacement` (picked by match score, not bucket). They'll correct themselves on the next Refresh — the forceRefresh flag from Decision #142 ensures the Refresh button actually re-runs the pipeline and persists the updated top suggestion. No cache schema bump — the cache stores the full recs array and the client re-sorts on display, so modal top is always correct; only the persisted `suggestedReplacement` was stale.

**Files:** `lib/services/recommendationSort.ts` (new — exports `sortRecommendationsForDisplay`), `components/RecommendationsPanel.tsx` (import from new location + re-export for backward compat; deletes inline implementation), `lib/services/partDataService.ts` (imports sort helper, calls `sortRecommendationsForDisplay(recs)` just before `setCachedResponse` + return in `getRecommendations`), `components/parts-list/PartsListTable.tsx` (imports `deriveRecommendationBucket`, `sys:top_suggestion` renderer wraps match % in `!isCertified` conditional).

## Decision #145 — Per-List Replacement Preferences: Composite "Better Than Source" Ranking (Apr 2026)

**Context:** Matching produces candidates that *fit the spec*; certification buckets surface candidates that an external authority has *validated as equivalent*. Neither answers the decision question that actually drives substitution: *is this candidate **better** than the incumbent along the dimensions the user cares about* — lifecycle longevity, compliance headroom, cost, and stock availability? All four signals already exist on both the source `PartAttributes.part` and each `XrefRecommendation.part` (statuses, supplierQuotes, lifecycleInfo, complianceData, riskRank, qualifications, etc.) — what was missing was an aggregation layer and a user-controllable weighting.

**Decision:** Introduce per-list **Replacement Priorities** — a configurable ordered checklist (Lifecycle / Compliance / Cost / Stock) stored on each `parts_lists` row. The server computes a composite 0–100 score per recommendation, weighted by position in the user's priority order, and persists it on `XrefRecommendation.compositeScore`. The sort tiebreak then uses composite score within each certification bucket (primary for certified buckets since match % is hidden there; breaks ties within a ±2% match band in the Logic bucket so parametric fit remains the floor).

**Why per-list, not user-global:** different BOMs have different priorities — an automotive infotainment module prioritizes lifecycle and compliance, a consumer dev kit prioritizes cost. Following the custom-views precedent (Decision #81) keeps this BOM-specific. Future work can add a template/instance layer (like master views) so users can save priority configurations and reuse them.

**Stock is gated, not graded:** the stock axis contributes 0 when the source part has ≥ 100 units available. Rewarding candidates for abundant stock when the incumbent is already well-stocked was explicitly called out as wrong — stock only matters for recommendation ranking when the incumbent is scarce or unbuyable. When source stock drops below the threshold, the axis activates and rewards candidates proportionally to their `totalStock`.

**Out of scope (per user):** technical headroom scoring. The parametric matching engine already measures that via `matchPercentage`, and mixing two scores that measure the same thing erodes trust in both.

**Per-axis delta functions** (all return [0, 1], 1 = strictly better than source):
- **Lifecycle:** PartStatus tier difference (Active=4 > NRND=3 > LastTimeBuy=2 > Discontinued=1 > Obsolete=0), blended with `riskRank` when both present.
- **Compliance:** candidate has certifications the source lacks (RoHS, REACH, qualifications set-difference). Saturates at 3 extras. Penalized when candidate is missing a cert the source had.
- **Cost:** relative savings `(srcPrice − candPrice) / srcPrice`, clamped to [0, 1]. Missing prices → 0. Never rewards being more expensive.
- **Stock:** gated on source < `LOW_STOCK_THRESHOLD` (100). When gated off, axis weight becomes 0 for that rec.

**Weight assignment:** enabled axes receive weights `[4, 3, 2, 1]` by position in priority order. Disabled (unchecked) axes get weight 0 — excluded from the denominator entirely, not just deprioritized. Gated-off stock behaves identically to a disabled axis for the recs where it's off.

**Cache variant:** `buildRecommendationsVariant()` hash payload now includes `replacementPriorities`, so two lists with different priority configs get independent cache entries. Existing cached entries (written before this change) use `null` priorities and fall back to `DEFAULT_REPLACEMENT_PRIORITIES` when read — no schema bump required.

**UI:** the existing list-edit dialog (gear icon on the parts list page) is now tabbed — "General" (unchanged 5 fields) and "Replacement Preferences" (new 4-axis ordered checklist). The Preferences tab label carries a small colored dot when the saved config differs from defaults, so users can see customization without opening the tab. Save applies to both tabs atomically; if priorities changed, `handleRefreshRows` fires for every row (same pattern as currency changes) so the new ordering propagates immediately.

**UI component reuse:** the ordered checklist uses the same move-up/move-down arrow pattern as `ColumnPickerDialog.tsx` — boundary-disabled buttons, two-line array swap. No new drag-and-drop library added.

**Retroactive behavior:** Lists created before this change have `replacement_priorities = null` — the server defaults kick in. Users can edit in the tabbed dialog to override. Cached recs written before this change are still scoreless on `compositeScore`; sort falls back to `?? 0` so the existing bucket ordering is preserved until a refresh repopulates.

**Files:** `lib/types.ts` (`ReplacementAxis`, `ReplacementPriorities`, `DEFAULT_REPLACEMENT_PRIORITIES`; extends `XrefRecommendation` with `compositeScore` + `compositeAxisDeltas`; extends `BatchValidateRequest`). `lib/services/compositeScore.ts` (new — per-axis delta functions + aggregator). `lib/services/partDataService.ts` (`getRecommendations` + `lookupCachedRecommendations` + cache variant all accept priorities; composite computed before sort). `lib/services/recommendationSort.ts` (tiebreak: match % floor for Logic bucket within ±2%, composite primary otherwise). `app/api/parts-list/validate/route.ts` (plumbs `body.replacementPriorities`). `app/api/xref/[mpn]/route.ts` (POST body accepts priorities). `lib/api.ts` (`validatePartsList`, `getRecommendations`, `getRecommendationsWith{Overrides,Context}` accept optional priorities). `lib/supabasePartsListStorage.ts` (load/save `replacement_priorities` column). `hooks/usePartsListState.ts` (state + `listPrioritiesRef`; passes priorities through refresh + modal + single-part-add; `handleUpdateListDetails` returns `{ currencyChanged, prioritiesChanged }`). `components/parts-list/ReplacementPrioritiesField.tsx` (new — ordered checklist with move-up/down + reset). `components/lists/NewListDialog.tsx` (Tabs wrapper: General + Replacement Preferences, with dot badge on the Preferences tab when customized). `components/parts-list/PartsListShell.tsx` (forwards priorities + refresh on change). `scripts/supabase-parts-lists-priorities-migration.sql` (new — `ALTER TABLE parts_lists ADD COLUMN replacement_priorities JSONB`). `__tests__/services/compositeScore.test.ts` (new — 19 tests covering per-axis deltas, gating, weight assignment, score bounds).

## Decision #146 — Replacement Display Filters + Sug. Distributor + MPN/SKU Taxonomy (Apr 2026)

**Context:** After Decision #145 shipped, several gaps surfaced during testing that shaped a set of display-layer polish. Bundled here because they all hinge on the same conceptual split: *scoring inputs* vs *display-time filters*.

**Changes:**

1. **Sug. Price / Sug. Stock fallback to `supplierQuotes`.** The row-level columns were reading only `part.unitPrice` / `part.quantityAvailable` — Digikey-only fields. Parts.io-sourced Accuris-certified recs never populate those, so their commercial cells went blank. Renderer + `getSortValue` now prefer `min(supplierQuotes[].unitPrice)` / `sum(supplierQuotes[].quantityAvailable)`, same aggregation the Commercial tab uses. Mirrors `commercial:bestPrice` / `commercial:totalStock` logic.

2. **`runFCEnrichment` extended to enrich `suggestedReplacement` + `topNonFailingRecs`.** Batch validation passes `skipFindchips: true` for perf, so certified recs land with empty `supplierQuotes`. The existing source-only FC enrichment now also collects MPNs from top + subs, single deduped batch, merges FC data back onto all three positions. Persisted to Supabase in the same save. Sug. Price / Stock / Distributor columns populate correctly without requiring the user to open the modal.

3. **Sug. Distributor column (`sys:top_suggestion_supplier`).** New opt-in column in Replacements group. Reads `supplierQuotes[0].supplier` (mapper pre-sorts by best unit price → `[0]` is the winning distributor for the Sug. Price). `SUPPLIER_DISPLAY` exported from `AttributesTabContent.tsx` for clean display names (Digikey, Mouser, Arrow, LCSC, etc.). Added to `SUGGESTION_COLUMN_IDS` so sub-rows render it too.

4. **`hideZeroStock` filter — list-level, not modal-level.** Initially shipped as an ephemeral modal toggle. User correction: should live in Replacement Preferences (per-list, persisted), similar to other list settings. Extended `ReplacementPriorities` with `hideZeroStock?: boolean`. Pipeline:
   - **Render-time swap** in `PartsListTable` cell renderer: when the top is known-zero-stock, `pickEffectiveTopRec()` promotes the first stocked candidate from `[top, ...subs]`. Instant, no API call.
   - **Persisted promotion effect** in `usePartsListState`: decoupled from `runFCEnrichment`. Fires on filter toggle + row state change. When the top is known-zero and a sub has stock, swaps them in state, persists via `updatePartsListSupabase`.
   - **Deep-fetch effect** for rows where all persisted top-3 are zero-stock. Calls `getRecommendations(mpn)` fresh. Critical detail (Decision #146 bug fix): `getRecommendations` returns candidates with empty `supplierQuotes` (FC enrichment is deferred by design), so the effect *also* calls `enrichWithFCBatch(top-30-mpns)` and merges FC data into each rec before scanning for stock. Without this, `totalStock()` returns `-1` for every candidate and the effect is a silent no-op. Concurrency 2 (two upstream hops + 30 FC calls per row), plus `deepFetchAttemptedRef` termination guard so rows with no stocked alternative don't retry on every re-render. Attempted set clears when `hideZeroStock` toggles off.
   - **Cache variant excludes `hideZeroStock`.** Display-time filter, not a scoring input. `buildRecommendationsVariant()` hashes only `{order, enabled}` from priorities so toggling the filter doesn't invalidate cached rec sets.
   - **Refresh trigger narrowed.** `handleUpdateListDetails` distinguishes `rankingChanged` (axis `order` or `enabled`) from filter-only toggles. Only ranking changes fire `handleRefreshRows`. `hideZeroStock` / bucket / count toggles save + re-render only.

5. **`maxSuggestions` dropdown (1–5).** New `ReplacementPriorities.maxSuggestions` field, default 3. Persisted-subs cap bumped from 2 → 4 in `toStoredRows` (both Supabase + localStorage storage) to support up to 5 total per row. Existing lists progressively migrate — next normal write persists the wider set. `getSubSuggestions()` slices to `maxSuggestions - 1`.

6. **`suggestionBuckets` multi-select.** New `ReplacementPriorities.suggestionBuckets?: RecommendationBucket[]` field, default all three checked. Empty set interpreted as "all" to prevent accidental blank lists. UI: three checkboxes (Accuris Certified / MFR Certified / Logic Driven) in the Filters block. `recPassesFilters()` unifies bucket filter + zero-stock filter; `pickEffectiveTopRec()` + `getSubSuggestions()` both honor both filters. **Phase 1 scope:** display-time only — if persisted top-3 lacks enough of the selected bucket, user sees fewer than max. Phase 2 (deep-fetch for scope shortfall) tracked in BACKLOG.

7. **Hide match % and dot for certified recs in list view.** Certified recs already bypass the blocking-rule filter (Decision #133), so showing a red "fail" dot next to them was actively misleading. `sys:top_suggestion` renderer now checks `deriveRecommendationBucket(topRec) !== 'logic'` and hides both the dot and the percentage for certified recs. Replaced with a compact `CERT` pill with tooltip showing the bucket ("Accuris Certified" / "MFR Certified"). Modal still shows full dot + % + per-rule breakdown — the drawer has room for nuance the list cell doesn't.

8. **Column picker: MPN/SKU taxonomy cleanup.** Two coupled changes:
   - **`dk:digikeyPartNumber`** renamed label `DigiKey Part #` → `DigiKey SKU` and moved from Product Identity → Commercial group. It's a distributor SKU (e.g. `1276-1001-1-ND`), not a part identity. Column ID preserved — existing saved views render the same data under the new header.
   - **New `dk:mpn` column** in Product Identity group, label `MPN (DK)`. `EnrichedPartData` extended with `mpn?: string`, populated in `buildEnrichedData()` from `attrs.part.mpn`. `getCellValue()` mirrors the existing `dk:manufacturer` fallback pattern: reads `enrichedData.mpn ?? resolvedPart.mpn` so legacy rows (no `mpn` on `enrichedData`) still render. Source-agnostic under the hood even though labeled "(DK)" — Part.mpn is always populated regardless of data source.

**Sort order revision.** Also in this batch: `sortRecommendationsForDisplay()` reordered from MFR → Accuris → Logic to **Accuris → MFR → Logic** at the user's request. Uses the mutually-exclusive `deriveRecommendationBucket()` so the modal's top card and the parts-list Top Suggestion always agree. Extracted from `RecommendationsPanel.tsx` into shared `lib/services/recommendationSort.ts` and called server-side in `getRecommendations()` before cache write, so `suggestedReplacement = recs[0]` matches the client's rendered top. Previously these could diverge because the server used `findReplacements()` sort (match % only) while the client re-sorted by bucket.

**Rationale for bundling into one decision:** all eight items are display-layer (not scoring-layer) and share the same persisted state (`ReplacementPriorities` JSONB) and cache-variant concerns. Decision #145 established the substrate; this decision polishes the surface.

**Files touched (superset, not exhaustive):** `lib/types.ts` (ReplacementPriorities extensions; EnrichedPartData.mpn), `lib/services/enrichedDataBuilder.ts` (populate mpn), `lib/services/recommendationSort.ts` (new bucket order + extracted from component), `lib/services/partDataService.ts` (cache variant scope, sort server-side, accepts priorities), `lib/columnDefinitions.ts` (Sug. Distributor, dk:mpn, DigiKey SKU rename+move, sort/renderer helpers), `lib/supabasePartsListStorage.ts` + `lib/partsListStorage.ts` (subs cap 2→4), `hooks/usePartsListState.ts` (runFCEnrichment enriches top + subs, promotion effect, deep-fetch effect with FC batch, attempted-ref guard), `components/parts-list/PartsListTable.tsx` (pickEffectiveTopRec, recPassesFilters, filter props threaded, CERT pill, supplierQuotes fallbacks), `components/parts-list/ReplacementPrioritiesField.tsx` (Filters block: hideZeroStock, maxSuggestions dropdown, bucket checkboxes), `components/parts-list/PartsListShell.tsx` (pipe filter props to table + modal), `components/parts-list/PartDetailModal.tsx` (hideZeroStock prop), `components/RecommendationsPanel.tsx` (hideZeroStock prop, re-export shared sort helper), `components/AttributesTabContent.tsx` (export SUPPLIER_DISPLAY).

> ℹ️ **Subsequent rename (Decision #147):** `suggestedReplacement` → `replacement`, `topNonFailingRecs` → `replacementAlternates`, `suggestionBuckets` → `buckets`, `maxSuggestions` → `maxReplacements`, helpers like `SUGGESTION_COLUMN_IDS` and `getSubSuggestions` renamed. This file's pre-rename vocabulary is preserved for historical accuracy; code uses the new names.

## Decision #147 — Vocabulary Cleanup: "Suggestion" → "Replacement" Across Parts List (Apr 2026)

**Context:** After Decisions #145 / #146 the parts-list UI was split-vocabulary: user-facing labels said "Repl." (per user rename) while internals said "Sug." / "suggestion" everywhere — `suggestedReplacement`, `topNonFailingRecs`, `suggestionBuckets`, `maxSuggestions`, `SUGGESTION_COLUMN_IDS`, `getSubSuggestions`, etc. User articulated the semantic split cleanly: *"A suggestion can be anything — it should not be a word that is interchangeable with Replacement. A replacement is more specific."* The word "suggestion" is too generic for what these fields actually represent: the concrete proposed swap for a given source part.

**Decision:** Drop "suggestion" vocabulary from parts-list code. Standardize on "replacement" (singular = the top one; alternates for positions #2–#N). Preserve all persisted data and column IDs unchanged so saved views and existing lists keep working.

### Renames

**Row fields (in-memory + JSONB keys):**
- `PartsListRow.suggestedReplacement` → `PartsListRow.replacement`
- `PartsListRow.topNonFailingRecs` → `PartsListRow.replacementAlternates`
- `BatchValidateItem.suggestedReplacement` → `BatchValidateItem.replacement` (NDJSON stream key)

**`ReplacementPriorities` fields (JSONB key on `parts_lists.replacement_priorities`):**
- `suggestionBuckets` → `buckets`
- `maxSuggestions` → `maxReplacements`

**Helpers / constants:**
- `SUGGESTION_COLUMN_IDS` → `REPLACEMENT_COLUMN_IDS`
- `getSubSuggestions()` → `getAlternateReplacements()`
- `hasSuggestionColumns` → `hasReplacementColumns`
- `MAX_SUGGESTIONS_OPTIONS` → `MAX_REPLACEMENTS_OPTIONS`

**LLM tool output keys (from `listChat` orchestrator):**
- `topSuggestion` → `topReplacement`
- `suggestedReplacement` (on `query_list` row summary) → `replacement`

**Copy:**
- "Hide zero-stock recommendations" → "Hide zero-stock replacements"
- "Show suggestions from:" → "Show replacements from:"
- "Show up to N suggestions…" → "Show up to N replacements…"

### Back-compat strategy (zero-risk rollout)

Three layers, decreasing scope:

1. **Persisted rows** (`parts_lists.rows` JSONB + localStorage). `StoredRow` accepts both legacy and new keys. `fromStoredRows` reads `replacement ?? suggestedReplacement` and `replacementAlternates ?? topNonFailingRecs`, strips the legacy keys from the mapped output. `toStoredRows` writes only new keys. Existing lists progressively migrate on next write — no data migration SQL.
2. **Persisted priorities** (`parts_lists.replacement_priorities` JSONB). `ReplacementPriorities` retains `suggestionBuckets` and `maxSuggestions` as optional `@deprecated` fields. `ReplacementPrioritiesField` reads `value.buckets ?? value.suggestionBuckets` on load and strips the legacy key on save. Same for `maxSuggestions`. Progressive migration.
3. **NDJSON wire format** (validate route → validationManager + in-hook stream parsers). Parsers normalize `rawItem.replacement ?? rawItem.suggestedReplacement` → `item.replacement` so a stale client reading a freshly-deployed server (or vice versa) during a staged deploy doesn't drop data mid-stream. Server writes only the new key.

### Non-changes (scope left alone)

- **Column IDs** (`sys:top_suggestion`, `sys:top_suggestion_mfr`, etc.) kept as-is. They're opaque internal handles referenced by every saved view's JSONB. Renaming would require an alias map in `sanitizeTemplateColumns` plus careful read-side compat across master views + per-list views + templates. User never sees the ID — only the label, which is already "Repl.*" per the earlier rename. Churn-without-value.
- **`LifecycleInfo.suggestedReplacement`** and its UI display in `AttributesTabContent.tsx` and `mouserMapper.ts`. This is the Mouser API field representing a *manufacturer-published successor MPN* on an EOL part — a genuinely different concept from our row-level proposed replacement. Keeping "suggestedReplacement" here is correct.
- **`pickEffectiveTopRec`** kept — "rec" is a third neutral term (recommendation) that's fine internally.

### Files Modified

`lib/types.ts`, `lib/partsListStorage.ts`, `lib/supabasePartsListStorage.ts`, `lib/validationManager.ts`, `lib/columnDefinitions.ts`, `lib/services/llmOrchestrator.ts`, `lib/services/recommendationSort.ts`, `lib/services/partDataService.ts`, `app/api/parts-list/validate/route.ts`, `hooks/usePartsListState.ts`, `hooks/useModalChat.ts`, `components/parts-list/PartsListShell.tsx`, `components/parts-list/PartsListTable.tsx`, `components/parts-list/PartDetailModal.tsx`, `components/parts-list/ReplacementPrioritiesField.tsx`.

### Verification

`npx tsc --noEmit` clean. `npm test` → 1270/1270 tests pass. Deprecation hints in the IDE are intentional — they mark the three legacy-read fallback sites (`PartsListShell` prop fallback, `ReplacementPrioritiesField` load/save fallback), not bugs.

---

## Decision #148 — Manufacturer Alias Resolution: Canonical MFR-Identity Layer (Apr 2026)

**Context:** `atlas_manufacturers.aliases` has been GIN-indexed and populated for 1,011 Chinese manufacturers since the canonical-identity import, but no code path read it. Chinese/abbreviated variants (`兆易创新`, `GD`, `gd/兆易创新`) silently missed in Atlas search; BOM rows spelled differently for the same MFR never deduped; AddPart warned users about false mismatches; admin aggregation only folded `name_display OR name_en` so products imported under alias spellings were invisible in coverage reports. Beyond cleanup, this is the identity layer that upcoming AVL / AML / Line Card ingestion needs — customer manufacturer data arrives in inconsistent forms and must canonicalize at ingest time, not be retrofitted later.

**Decision:** Add a shared resolver that maps any known variant (case-insensitive, exact hit only — no fuzzy) to the canonical `name_display`, and wire it into the four hot paths that compare manufacturer names. Design the contract to absorb the Western company-graph follow-on without consumer changes.

### Resolver contract

```ts
export interface ManufacturerAliasMatch {
  canonical: string;
  slug: string;
  source: 'atlas' | 'western';
  variants: string[];
  companyUid?: number;              // Reserved for Western company graph
  lineage?: { uid; name; status }[]; // Reserved for Western parent-chain walk
}
export async function resolveManufacturerAlias(input: string): Promise<ManufacturerAliasMatch | null>;
export async function getAllManufacturerVariants(): Promise<Map<string, ManufacturerAliasMatch>>;
export function invalidateManufacturerAliasCache(): void;
```

5-minute in-memory cache; coalesced in-flight refresh to avoid thundering-herd on cold start. Returns `null` when nothing matches — callers fall through to their existing substring behavior unchanged.

### Exact-hit-only, not fuzzy

Collision risk with fuzzy matching is asymmetric: false positives silently mis-canonicalize unrelated MFRs, corrupting dedup and aggregation; false negatives just mean we don't help. Fuzzy matching also couples the resolver to an opaque scoring function that's hard to tune across languages. Exact hit with a rich alias list (which Atlas already has) gives us the recall we need without the failure mode.

### Why dedup pre-canonicalization is in the caller, not `bomDeduper`

`bomDeduper.ts` is imported into the client-side hook `usePartsListState`. Adding a Supabase-using import would pull server-only code into the client bundle. Instead, `usePartsListState` calls a new server endpoint `POST /api/manufacturer-aliases/canonicalize` (batch) through a thin client wrapper `manufacturerAliasClient.ts`, rewrites `rawManufacturer` to canonical, then calls the unchanged `findDuplicateGroups`. Deduper stays oblivious.

### Atlas search: two parallel queries, merge by id

Inline `.or('mpn.ilike.%x%,manufacturer.in.(v1,v2,v3)')` is tricky to escape correctly for values containing commas, quotes, or CJK characters. Cleaner: one query for MPN ilike, one for `manufacturer.in(variants)` (or the original manufacturer ilike fallback), merge + dedup by `id`. Same semantics as the old `.or()`, zero escaping headaches.

### Admin aggregation: variant-fold

The half-implemented pattern at `admin/manufacturers/route.ts` (`productAgg.get(name_display) || productAgg.get(name_en)`) becomes a full fold across `[name_display, name_en, name_zh, ...aliases]`. `foldAggs` sums `productCount` + `scorableCount`, unions `families`, maxes `lastProductUpdate`. The per-slug products route switches `.or('manufacturer.eq.X,manufacturer.eq.Y')` to `.in('manufacturer', variants)`. No RPC changes, no schema changes — pure lookup-side fold.

### Forward compatibility with Western

Reserving `source`, `companyUid`, `lineage` on the contract means the Western follow-on (P1, see BACKLOG) adds a second source read behind the same interface. Consumers don't change. The `companyUid` field will be the stable FK that AVL/AML/Line Card ingestion stores on customer rows, so future corporate-ownership changes propagate automatically without customer re-upload.

### Files Modified

**New:**
- `lib/services/manufacturerAliasResolver.ts` — server-side cached resolver
- `lib/services/manufacturerAliasClient.ts` — client-safe batch wrapper + `canonicalizeRowManufacturers`
- `app/api/manufacturer-aliases/canonicalize/route.ts` — batch POST endpoint
- `__tests__/services/manufacturerAliasResolver.test.ts` — 16 tests

**Modified:**
- `lib/services/atlasClient.ts` — dual-query search + dedup by id
- `app/api/parts-list/search-quick/route.ts` — alias-aware mismatch suppression
- `hooks/usePartsListState.ts` — pre-canonicalize `rawManufacturer` before dedup
- `app/api/admin/manufacturers/route.ts` — fold product agg + coverage across variants
- `app/api/admin/manufacturers/[slug]/products/route.ts` — `.in('manufacturer', variants)`
- `app/api/admin/atlas/manufacturers/route.ts` — invalidate resolver cache on toggle
- `__tests__/services/bomDeduper.test.ts` — alias-variant collapse documentation test

### Verification

`npm run lint` clean for all touched files. `npm test` → 1,287/1,287 tests pass (19 suites). Backward-compatible: MFRs not in `atlas_manufacturers` fall through the resolver to the original substring/ilike behavior.

---

## Decision #149 — Western MFR Company-Identity Graph (Apr 2026)

**Context:** The app is moving toward ingesting customer-supplied manufacturer data (AVLs, AMLs, Preferred MFR lists, Line Cards). Every one of those is keyed on manufacturer names that will arrive in inconsistent forms — acquired brands (Linear Tech / Maxim / Hittite / Burr-Brown → ADI; Freescale → NXP; Atmel / Microsemi → Microchip; Intersil / IDT / Dialog → Renesas; IR / Cypress → Infineon; Fairchild → onsemi; National Semi → TI), rebrands (ON Semiconductor → onsemi), subsidiary brands (Vishay Dale), and abbreviations (TI, ADI, ST, NXP). Without canonical resolution at ingest time, customer data fragments and filter semantics break; retrofitting canonical identity later is painful and customer-visible.

Decision #148 shipped the resolver for Chinese (Atlas) MFRs with a forward-compat contract (`source: 'atlas' | 'western'`, reserved `companyUid` / `lineage`). This decision adds the Western source behind the same interface.

**Decision:** Ingest a company-identity graph into two Supabase tables and extend the resolver to walk it. Exact-hit matching, no fuzzy. Hot-path consumers unchanged — they light up for Western inputs automatically.

### Source data (already in `/data/`)

- **`UID, name, source_URL, company_status_code, parent_company_ID.xlsx`** — 25,861 companies. Top-level self-reference; children point up via `parent_company_id`. Status enum: `corporate`, `active`, `acquired`, `division`, `brand`, `merged`, `defunct`, `unknown`, `product`, `sister`, null.
- **`content_id, value, context_code.xlsx`** — 8,732 alias rows. `context_code` taxonomy: `also_known_as` (3,361), `brand_of` (1,994), `acquired_by` (706), `formerly_known_as` (619), `short_name` (564), `division_of` (530), `previous_name_value` (388), `acronym` (138), `parent_of` (118), `merged_into` (108), `trademark_of` (79), `product_family` (61), `abbreviation` (34), `mis-spelling` (30), `nickname` (1), `phoenetic` (1).

**Verified chains:** Linear Tech (2136, acquired) → ADI (1742, corporate) via `parent_uid`. Maxim / Hittite / Burr-Brown similarly → ADI / TI. National Semi → TI via `context_code=acquired_by` alias (parent points to self). Linear Tech has 27 alias variants alone (`lt`, `ltc`, `linear tech`, `linetech`, `lint`, misspellings).

### Two-table schema (`scripts/supabase-manufacturer-companies-schema.sql`)

```sql
manufacturer_companies (uid PK, name, source_url, status, parent_uid, slug UNIQUE, created_at, updated_at)
manufacturer_aliases   (id BIGSERIAL PK, company_uid FK, value, value_lower GENERATED, context, created_at)
```

Indexes: `parent_uid` (for future graph queries), `LOWER(name)` (resolver lookup), partial `status` for `('corporate','active')`, `aliases.value_lower`, `aliases.company_uid`, `aliases.context`. RLS: authenticated read, admin-only write. `updated_at` trigger on companies table.

### Import script (`scripts/manufacturer-companies-import.mjs`)

Dual-xlsx input with **two-pass** company insert: pass 1 upserts with `parent_uid=NULL`, pass 2 sets `parent_uid` after every row exists. Avoids self-referential FK ordering issues within batch upserts. Orphan handling:
- 189 alias rows whose `content_id` doesn't exist → dropped with stderr audit.
- 31 companies whose `parent_company_id` doesn't exist → `parent_uid` set NULL.

**Important parser gotcha:** `XLSX.utils.sheet_to_json(sheet, { defval: null })` is required. Without `defval`, columns whose first row is null get silently dropped. A related bug: `Number(null) === 0` (not `NaN`) — guard explicitly with `parentRaw !== null && parentRaw !== undefined && parentRaw !== ''` before `Number()`. Bit me in an early iteration (turned 1,080 false orphan parents into 31 real ones).

### Resolver extension (`lib/services/manufacturerAliasResolver.ts`)

Pre-computes the canonical walk at cache-build time so `resolveManufacturerAlias()` stays O(1):

1. **Load** Atlas + Western (paginated via `fetchAllPages` — 1000-row PostgREST cap) in parallel.
2. **Build** a `companyByUid` map with inlined aliases per node.
3. **Walk** every company to its terminal canonical via `walkToCanonical(startUid)`:
   - Step up through `parent_uid` graph first (primary mechanism).
   - Else step up through `context=acquired_by|merged_into` alias (secondary — source data uses both; user confirmed intentional).
   - Terminate at self-ref row, orphan parent, or `MAX_PARENT_HOPS = 6` (loop guard via `visited` set).
4. **Group** descendants by canonical. Each canonical's `ManufacturerAliasMatch.variants` = union of every descendant's name + aliases — so ADI's variants include `lt`, `ltc`, `linetech`, `hittite`, `maxim`, etc.
5. **Index** variant → uid. Collision policy: prefer canonical with `status IN ('corporate','active')`; ties broken by lowest `uid`. Ensures "Cypress" routes to the surviving entity when multiple companies share a name.
6. **At resolve time:** look up by lowercased input. Attach per-input `lineage` (the chain from origin to canonical) — stored per-uid, applied as an override on the canonical's match object.

**Atlas wins cross-source collisions** (rare, logged when observed). Same 5-minute cache TTL. `invalidateManufacturerAliasCache()` wipes both sources together.

### Hot paths unchanged

Atlas search, AddPart mismatch, BOM dedup, admin aggregation all already consume `ManufacturerAliasMatch` via `resolveManufacturerAlias()`. Zero edits to consumers. Western inputs light up the moment the data lands.

### Deployment (user actions)

The code is live but the data and schema are not. To activate:

1. Apply schema migration in Supabase SQL editor:
   ```bash
   cat scripts/supabase-manufacturer-companies-schema.sql  # copy-paste into SQL editor
   ```
2. Import data (requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`):
   ```bash
   node scripts/manufacturer-companies-import.mjs --dry-run --verbose  # sanity check first
   node scripts/manufacturer-companies-import.mjs                       # real write
   ```
3. Resolver picks up Western data on next 5-min cache refresh (or admin toggle on the Atlas manufacturers page invalidates immediately).

### Future: AVL / AML / Preferred-MFR / Line-Card ingestion

Those features (not in this decision) will call `resolveManufacturerAlias()` at ingest time and persist `companyUid` + raw customer string. Filter semantics become uid-comparisons. Future acquisitions (admin updates `parent_uid`) propagate automatically through customer data without re-upload.

### Files Modified

**New:**
- `scripts/supabase-manufacturer-companies-schema.sql` — 2-table schema + indexes + RLS
- `scripts/manufacturer-companies-import.mjs` — dual-xlsx import with orphan handling

**Modified:**
- `lib/services/manufacturerAliasResolver.ts` — Western source + parent-walk + `acquired_by` alias chain + lineage assembly + collision policy
- `__tests__/services/manufacturerAliasResolver.test.ts` — 24 tests (11 Atlas, 9 Western, 3 cross-source, 1 getAll); mock routes by table name + paginated range

### Verification

`npm run lint` clean for touched files. `npm test` → 1,295/1,295 tests pass (19 suites, +8 Western tests). Import script `--dry-run --verbose` on the real files: 25,861 companies parsed, 8,543 aliases after dropping 189 orphans, 31 orphan parents nulled, status distribution matches inspection values.

---

## Decision #150 — BOM Batch-Validate MFR-Aware Match Selection (Apr 2026)

**Context:** Decisions #148 / #149 wired alias resolution into 4 hot paths (Atlas search, AddPart mismatch, BOM dedup, admin aggregation) but **NOT** into the per-row BOM batch validator at [app/api/parts-list/validate/route.ts](app/api/parts-list/validate/route.ts). That route uses the `manufacturer` field only as a keyword fallback when MPN is blank; otherwise it blindly picks `searchResult.matches[0]` without MFR comparison. Consequence: a BOM row `LT1086 | Linear Technology` gets silently resolved to whatever comes first in search, even when a later candidate canonically matches the user's input MFR.

Gap surfaced in review post-#149 — user called it out immediately.

**Decision:** When `searchParts()` returns multiple candidates AND the user supplied a manufacturer, prefer the candidate whose MFR canonically matches the input. Fall through to `matches[0]` in every ambiguous case (input MFR blank, input doesn't resolve, no candidate's MFR resolves to the same canonical). Zero impact on single-match or MPN-less paths.

### Implementation

New helper `lib/services/mfrMatchPicker.ts` with a single exported function:

```ts
export async function pickMfrAwareMatch(
  matches: PartSummary[],
  inputManufacturer: string | undefined,
): Promise<PartSummary>;
```

Called in `validate/route.ts processItem()` immediately after `searchParts()` returns, replacing the old `resolvedPart = searchResult.matches[0]` line. The existing ambiguity-flag logic (`candidateMatches` when MPN doesn't exactly match) still runs against the resolved part — unchanged semantics.

**Why a separate module rather than inline?** Next.js route files convention-lock exports to HTTP methods; factoring the pure logic out keeps the route file focused on the handler and gives us a clean unit-test target.

### Scope-limits (intentional)

- No new mismatch-warning UI. Predecessor-brand swaps (`Linear Technology` → `Analog Devices Inc`) still happen silently because that's what we want — the canonical is what should be stored. Can add an informational "resolved to successor brand" note later if users ask for it.
- No change to the MPN-less fallback path (`${manufacturer} ${query}` keyword concatenation). Unrelated.
- No change to `search-quick` route (AddPart dialog) — that path already resolves via the slug-comparison approach added in Decision #148.

### Files Modified

**New:**
- `lib/services/mfrMatchPicker.ts` — 25 lines, one exported function
- `__tests__/services/mfrMatchPicker.test.ts` — 8 tests

**Modified:**
- `app/api/parts-list/validate/route.ts` — import `pickMfrAwareMatch`; one-line replacement of `matches[0]` pick

### Verification

`npm run lint` clean. `npm test` → 1,303/1,303 (20 suites, +8 picker tests). Picker tests cover: single-match passthrough, blank-input passthrough, unresolvable-input passthrough, canonical-preferred selection, matches[0]-already-canonical, no-canonical-match fallback, cross-source (Atlas), empty-manufacturer skip.

---

## Decision #151 — Matching-Engine Preferred-MFR Sort Uses Alias Resolver (Apr 2026)

**Context:** Users can set `preferredManufacturers` in [Settings → Company Settings](components/settings/CompanySettingsPanel.tsx) — an existing feature that stores preferences in `profiles.preferences` JSONB and uses them as a sort tiebreaker in [matchingEngine.ts findReplacements()](lib/services/matchingEngine.ts). Before this decision, `isPreferredManufacturer()` used a substring check: `mfrLower.includes(p.toLowerCase()) || p.toLowerCase().includes(mfrLower)`. Consequence: a user who set "prefer Analog Devices" would NOT float Linear Tech / Maxim / Hittite parts because those strings don't substring-match "Analog Devices" in either direction — despite being the same company canonically.

Decisions #148/#149 built the alias resolver but only wired it into hot paths that compare MFR strings at the time (Atlas search, AddPart mismatch, BOM dedup, admin aggregation, batch-validate match pick). The preferred-MFR sort was noted as deferred lower-ROI. This decision closes that gap.

**Decision:** Swap the substring check for canonical-slug comparison via `resolveManufacturerAlias()`. Do the resolution at the caller (partDataService) so `findReplacements` stays sync and the existing substring behavior remains as a fallback for any input that doesn't resolve.

### Contract change

`findReplacements()` gains an optional parameter:

```ts
export function findReplacements(
  logicTable: LogicTable,
  source: PartAttributes,
  candidates: PartAttributes[],
  preferredManufacturers?: string[],
  manufacturerSlugLookup?: Map<string, string>,  // ← new; lowercased MFR → canonical slug
): XrefRecommendation[];
```

`isPreferredManufacturer()` consults the lookup first (slug-to-slug comparison) when provided; falls through to substring on misses. Backward-compatible: tests and `mockXrefService.ts` calls without the lookup argument get today's behavior unchanged.

### Where the lookup is built

[partDataService.getRecommendations()](lib/services/partDataService.ts) builds a single `Map<string, string>` before calling the matching engine:

```ts
const manufacturerSlugLookup = new Map<string, string>();
if (mergedPreferred.length > 0) {
  const resolveOne = async (raw: string) => {
    const key = raw.toLowerCase();
    if (manufacturerSlugLookup.has(key)) return;
    const match = await resolveManufacturerAlias(raw);
    if (match) manufacturerSlugLookup.set(key, match.slug);
  };
  await Promise.all([
    ...mergedPreferred.map(resolveOne),
    ...allCandidates
      .map(c => c.part.manufacturer)
      .filter((m): m is string => !!m)
      .map(resolveOne),
  ]);
}
```

~N+M resolver calls per `getRecommendations` call (preferred count + candidate count, typically <~120). Each hits the 5-min resolver cache after first population — O(1) after warmup.

### Performance

Measured with `console.time('[perf] findReplacements (scoring)')` — no measurable regression in scoring. Alias pre-resolution adds a small async pass BEFORE scoring. The resolver's in-memory variant map hits for every Atlas/Western MFR with no additional Supabase traffic.

### Edge cases

- **Preferred MFR that doesn't resolve:** substring fallback fires (same behavior as today).
- **Candidate MFR that doesn't resolve (non-Atlas/Western vendor):** substring fallback fires for that specific comparison.
- **Empty preferredManufacturers:** `manufacturerSlugLookup` stays empty, no overhead, no lookup passed to `findReplacements`.

### Files Modified

**Modified:**
- [lib/services/matchingEngine.ts](lib/services/matchingEngine.ts) — `isPreferredManufacturer()` signature + implementation; `findReplacements()` signature pass-through.
- [lib/services/partDataService.ts](lib/services/partDataService.ts) — import `resolveManufacturerAlias`; build + pass `manufacturerSlugLookup` to `findReplacements()`.
- [__tests__/services/matchingEngine.test.ts](__tests__/services/matchingEngine.test.ts) — 5 new tests: substring fallback (backward compat), canonical-boost, no-canonical-boost-when-differing, substring-fallback-for-unresolved, honors existing 5% match-% band.

### Verification

`npm run lint` clean for touched files. `npm test` → 1,308/1,308 (20 suites, +5 preferred-MFR tests).

---

## Decision #152 — Admin Alias Editor: Dedicated Aliases Tab (Apr 2026)

**Context:** Atlas aliases (`atlas_manufacturers.aliases` JSONB) have been populated only via the Excel import script. When an admin spots a missing abbreviation, rebrand, or misspelling, the only remediation was re-running the bulk import — friction that actively discouraged alias corrections. Aliases previously rendered as read-only chips inside the Profile tab of the per-MFR admin detail page. User called out the gap after the alias arc (#148 / #149 / #150 / #151) shipped.

**Initial design** (first iteration): upgraded the Profile-tab chip strip in-place to an editable widget. User pushed back: "Why put it in Profile? That makes no sense — it should be a dedicated tab." Correct call — aliases are *identity*, not profile metadata. Rationalized placement based on "that's where the read-only chips already lived" isn't a design principle.

**Decision:** New dedicated "Aliases" tab (tab index 5) on the per-MFR detail page, positioned after Profile. Shows alias count in the tab label (`Aliases (3)`) for discoverability. Editable widget: add/remove with optimistic saves, immediate resolver cache invalidation. Atlas-only — Western `manufacturer_companies` / `manufacturer_aliases` editor stays deferred (graph + 15-context taxonomy warrants its own design).

### UI — dedicated tab

Tab declared alongside existing five (Products, Flagged, Coverage, Cross-References, Profile) at [ManufacturerDetailPage.tsx:408](components/admin/ManufacturerDetailPage.tsx#L408). Tab label includes the alias count when > 0.

Tab content: header with inline `CircularProgress` while a PATCH is in flight, explanatory helper text ("Variant spellings, abbreviations, and translations…"), chip row with MUI `<Chip onDelete={...}>` for each alias, then a `<TextField>` + `<Button>` pair for adds (Enter-key submits). **Immediate save on each action** — optimistic update → PATCH → rollback on failure + `<Alert>` error banner. No dirty state, no Save/Cancel buttons. Matches the `updateEnabled` toggle pattern at [ManufacturerDetailPage.tsx](components/admin/ManufacturerDetailPage.tsx) used by the enabled switch.

The old in-Profile-tab alias chip strip is removed entirely — no duplication, no confusion about where the source of truth lives.

Duplicates (case-insensitive) and empty submissions no-op with `error` prop on the input + helper text "Empty or duplicate alias".

### API — extend existing PATCH allowlist + validation

[app/api/admin/manufacturers/[slug]/route.ts](app/api/admin/manufacturers/[slug]/route.ts) gains `'aliases'` in the `allowedFields` array plus a new exported `normalizeAliasInput()` helper that:

- Rejects non-array input (400)
- Rejects non-string entries (400)
- Rejects empty / whitespace-only entries (400)
- Rejects entries longer than 100 chars (400)
- Caps total at 50 entries (400)
- Dedupes case-insensitively, first writer wins
- Trims surrounding whitespace before dedup

The helper is exported specifically for unit testing; route handler calls it inline right before the `.update()` call.

### Cache invalidation

After successful write, calls `invalidateManufacturerAliasCache()` from [lib/services/manufacturerAliasResolver.ts](lib/services/manufacturerAliasResolver.ts) alongside the existing `invalidateManufacturerCache()` + `invalidateManufacturersListCache()` invalidations. Alias edits skip `invalidateRecommendationsCache()` because the resolver is used for MFR identity only — not for scoring weights. The recommendations cache remains valid across alias edits.

### Files Modified

**New:**
- `__tests__/services/manufacturerAliasValidation.test.ts` — 10 tests covering every validation branch

**Modified:**
- `app/api/admin/manufacturers/[slug]/route.ts` — export `normalizeAliasInput()`, add `aliases` to `allowedFields`, plumb validation + resolver cache invalidation
- `components/admin/ManufacturerDetailPage.tsx` — 5 new useState hooks (aliases / pending / error / input / inputError), `useEffect` to sync from server data, `patchAliases` + `handleAddAlias` + `handleDeleteAlias` callbacks, upgraded Profile-tab alias section with chip-delete + TextField-add widget

### Verification

`npm run lint` clean for touched files. `npm test` → 1,318/1,318 tests pass (21 suites, +10 validation tests). Manual end-to-end: on `/admin/manufacturers/gigadevice`, add "GD777", delete "gd", duplicate-add fails silently, empty-add fails silently, every successful change persists across refresh, resolver picks up the new alias immediately (uploaded BOM with the new alias canonicalizes correctly without waiting on the 5-min TTL).

### Out of scope (deferred)

- Western `manufacturer_companies` / `manufacturer_aliases` editor — graph + 15-context-code taxonomy warrants its own design.
- Bulk-browse tab across all MFRs (the "new tab in AtlasPanel" option). Defer until/unless cross-MFR browsing becomes a recurring admin workflow.
- Context-code selection — Atlas aliases are a flat string list by design; no taxonomy to choose from.

---

## Decision #153 — Fix: atlas_manufacturers.aliases Double-JSON-Encoding (Apr 2026)

**Context:** While testing the new Aliases tab (Decision #152) on `/admin/manufacturers/gigadevice`, the UI showed "No aliases yet" despite the source xlsx clearly listing 6 aliases for GigaDevice (`gigadevice; 兆易创新; gd/兆易创新; gigadevice semiconductor (beijing) inc; gd兆易创新; gigadevice semiconductor`). A direct Supabase query on `atlas_manufacturers.aliases` revealed the root cause:

```
typeof aliases: string
Array.isArray(aliases): false
aliases raw: "[\"gigadevice\",\"兆易创新\",\"gd/兆易创新\",...]"
```

The column was JSONB with a **string** value containing JSON text, instead of a JSON **array**.

**Root cause:** `scripts/atlas-manufacturers-import.mjs` line 165 had `aliases: JSON.stringify(aliases)`. Supabase-JS JSON-encodes the entire record body when sending to PostgREST, so pre-stringifying the field double-encoded it — PostgreSQL stored a JSON string literal in the JSONB column instead of the actual array.

**Latent impact (silent, since the Chinese P1 shipped in Decision #148):**
- 335 of 1,011 atlas manufacturers had mis-encoded aliases. The admin editor correctly showed "No aliases yet" on all of them.
- The resolver iterated `string` instead of `string[]` via `for (const a of row.aliases)`, which walks characters. The variant map was silently polluted with one-char keys like `"["`, `"g"`, `","`, `"\""` for every affected MFR.
- Nothing visibly broke because the resolver returns `null` on non-matches and callers fall back to substring logic. Users saw "mostly works" behavior but the alias-hit path wasn't actually exercising its data.
- The resolver tests didn't catch it because mocks passed real arrays, not strings.

**Fix — three parts:**

1. **Import script** ([scripts/atlas-manufacturers-import.mjs](scripts/atlas-manufacturers-import.mjs)): drop `JSON.stringify()` so the array is passed directly; supabase-js handles encoding. Also replaced the follow-up `JSON.parse(m.aliases).length` in the summary log with `(m.aliases ?? []).length`.

2. **Migration:** re-ran the fixed import. Every row upserts by `atlas_id` / `slug`, so the 335 alias-bearing rows get their columns rewritten as proper JSONB arrays; the 676 alias-free rows pass through unchanged. Verified via Supabase query: `Array.isArray(row.aliases) === true` across sampled rows post-fix.

3. **Defensive parsing in the resolver** ([lib/services/manufacturerAliasResolver.ts](lib/services/manufacturerAliasResolver.ts) `buildAtlasMatch()`): if `row.aliases` comes back as a string (re-corruption from future scripts, partial rollbacks, etc.), `JSON.parse()` it and log a warning with the slug. Prevents silent variant-map pollution if this ever happens again. +1 test case covering the legacy string-encoded form.

### Files Modified

- `scripts/atlas-manufacturers-import.mjs` — drop `JSON.stringify`, fix summary log
- `lib/services/manufacturerAliasResolver.ts` — defensive string→array parse in `buildAtlasMatch`
- `__tests__/services/manufacturerAliasResolver.test.ts` — +1 test: "tolerates a legacy JSON-string-encoded aliases column"

### Verification

`npm test` → 1,319/1,319 (21 suites, +1 defensive test). On reload of `/admin/manufacturers/gigadevice` → Aliases tab, all 6 aliases now render as chips with working delete buttons. Resolver cache tick picks up the corrected data within 5 min, or immediately on any admin manufacturer-toggle PATCH.

### Takeaway

Resolver tests that mock Supabase responses pass TS/JS objects directly, which doesn't reproduce the wire-format of what actually comes back from PostgREST for JSONB columns. For bugs that live in the DB-serialization layer, the test mocks can't catch them. An integration test that hits a real Supabase instance would — out of scope for now, but worth noting if a similar latent bug surfaces.

---

## Decision #154 — Fix: Atlas Alias Separator Parsing (Apr 2026)

**Context:** Second latent bug surfaced while QA'ing the new Aliases tab (Decision #152). KOHER's tab rendered a single chip containing `koher,科或（上海）电子有限公司,科或,KOHERelec` — four distinct manufacturer names mashed together. The cause was parse-time: [scripts/atlas-manufacturers-import.mjs](scripts/atlas-manufacturers-import.mjs) `parseAliases()` split only on ASCII semicolons (`;`), but the source master file uses three separator styles.

**Measured impact** (1,011 rows in `data/atlas_manufacturers_20260319_canonical_identity_model copy.xlsx`):

| Separator | Rows | Pre-fix behavior |
|-----------|------|------------------|
| ASCII `;` | 241 | ✅ split correctly |
| CJK `；` (full-width) | 10 | ❌ one blob alias (SWST, RESI, 2Pai Semi, etc.) |
| Comma-only (no semi) | 2 | ❌ one blob alias (KOHER, one other) |
| No separator | 85 | ✅ correct as-is |
| Empty | 676 | n/a |

12 rows had their aliases silently mis-parsed since the first import. Each affected row held a single chip containing all its variants joined by the unrecognized separator — effectively making those aliases unusable for resolution unless the user typed the whole blob verbatim (with the commas).

### Tricky constraint

Some rows legitimately contain commas inside company names — e.g. HONGFA's aliases include `"xiamen hongfa electroacoustic co.,ltd."`. Those rows use `;` as separator, so they parse correctly today. A naive "split on commas too" would regress them, splitting `Co.,Ltd.` into two fake aliases.

### Fix — tiered split

```js
// 1. Always split on both semicolon variants — neither occurs inside a
//    company name, safe for every row (including mixed ASCII+CJK like RESI).
let parts = raw.split(/[;；]/);
// 2. If no semicolon produced a split, fall back to commas. Only reachable
//    for the 2 comma-only rows; other rows already produced multiple pieces.
if (parts.length === 1) parts = parts[0].split(',');
```

Minimal, no heuristics, preserves all 241 already-correct rows and fixes the 12 broken ones. Re-ran the import (idempotent upsert by `atlas_id`/`slug`) — 1,011 rows touched, only the 12 broken ones changed shape.

### Spot-check results (post-fix)

- KOHER: `1 blob` → 4 chips (`koher`, `科或（上海）电子有限公司`, `科或`, `KOHERelec`)
- SWST: `1 blob` → 4 chips
- RESI: `1 blob` → 8 chips (had mixed ASCII + CJK semicolons)
- 2Pai Semi: `1 blob` → 5 chips
- RUNIC: `1 blob` → 5 chips
- HONGFA (regression check): 5 chips, comma inside `Co.,Ltd.` preserved ✓

### Files Modified

- `scripts/atlas-manufacturers-import.mjs` — `parseAliases()` tiered split + inline comment documenting the three observed separator styles

### Takeaway (pairs with #153)

Both #153 (double-encode) and #154 (separator parsing) were silent data-layer bugs that the existing test mocks couldn't catch. The resolver test mocks pass clean arrays; the import script has no unit tests at all. Both bugs sat in production since the first Chinese P1 ship (#148) and surfaced only because the admin editor (#152) forced the data to round-trip through `Array.isArray()` + per-item chip rendering. If/when a similar data pipeline is added in the future (Western manufacturer curation UI, AVL ingestion, etc.), consider either unit tests on the parse helpers OR an integration test that walks real Supabase reads.

## Decision #155 — Qualification-Domain Filter for Cross-Domain Substitution (Apr 2026)

### Problem

A user opened the Xref modal for Murata `GRM188R71E104KA01D` (commercial MLCC, 0.1 µF / 25 V / X7R / 0603), answered "Automotive" in the context questions, and the top "Accuris Certified" recommendation came back as `GCH188R71E104KE01D` — Murata's implanted-medical-device (GHTF Class D) series, not AEC-Q200 automotive. Per Murata's published application-suitability matrix, GCH has no automotive box checked; the correct automotive substitutes for that value are the GCM / GCJ (soft-termination) / GRT series.

Root cause traced to three reinforcing issues:

1. **`aec_q200` is an `identity_flag` rule.** Semantics: *if the source requires it, the replacement must too.* The source GRM is commercial (aec_q200 = false/missing), so the rule passes for every candidate regardless of their AEC state.
2. **`escalate_to_mandatory` is weight-only.** The automotive context bumps `aec_q200` weight 8→10 via `contextModifier.ts:58-60` but does not flip rule semantics or inject a synthetic "source requires" override.
3. **Bucket precedence is unconditional.** `sortRecommendationsForDisplay` puts `accuris` bucket ahead of `logic` bucket regardless of match %, so a non-AEC Accuris-certified candidate floats above any AEC-qualified Logic-Driven candidate.

Net effect: automotive context could surface a medical-implantable part as the top recommendation. The right mental model, per the user's framing, is that "AEC-Q200 shouldn't be a binary gate — qualification domain should be."

### Decision

Introduce **qualification domain** as a categorical gate orthogonal to the logic table. A part's domain (`automotive_q200`, `medical_implant`, `mil_spec`, `space`, `industrial_harsh`, `commercial`, `unknown`, etc.) is determined by a pluggable per-manufacturer classifier. The user's context selects an **expected-domain set**; cross-domain substitution (e.g. medical_implant → automotive) is hard-excluded regardless of what a vendor's FFF table says.

Three behaviors, in order of precedence:

1. **Hard-exclude** candidates whose domain is incompatible with the selected context (e.g. medical/mil-spec/space under automotive). Runs **before** `withCertifiedBypass()` so certified-cross bypass cannot route around the gate.
2. **Rank context-matched domains first** inside each bucket. Unknown candidates rank above confirmed deviations (see sort rationale below).
3. **Flag deviations with a visible badge** — amber "Domain unknown — verify" for unknown, red "Not AEC-Q200 — verify" for commercial/industrial under automotive context.

### Phase 1 scope — Murata MLCCs only

Deliberately narrow to prove the mechanism on the reported case before generalizing:

- **One classifier:** `lib/services/classifiers/murataMlcc.ts`. MPN prefix → domain. GCM/GCJ/GRT/KGM/KCM → `automotive_q200`; GCH → `medical_implant`; GJM → `mil_spec`; GRM/GMC → `commercial`. Other MFRs → `unknown / no_classifier`.
- **One row of the exclusion matrix wired:** `automotive`. Other rows (medical, industrial, mil_spec, space) are defined in a commented matrix in `qualificationDomain.ts` so Phase 2 devs fill a locked shape rather than make ad-hoc decisions.
- **Single UI treatment:** amber for unknown, red for deviation, green for context-matched. Badge rendered on source panel (anchor) AND candidate cards + modal header.

Non-Murata MFRs universally classify `unknown/no_classifier` in Phase 1 → ranked below context-matched but **not** excluded. Excluding them would collapse recommendations to Murata-only, turning a classifier-coverage gap into a recommendation-coverage cliff. Phase 2 classifiers (TDK, Samsung, Yageo, KEMET, AVX, Kyocera, Taiyo Yuden) feed the same interface with no schema change.

### Design decisions worth tombstoning

**Sort order: `context-matched > unknown > deviation`.** Not obviously right in isolation — it feels backwards since "unknown" seems weaker than "known-anything." The rationale: unknown candidates *may* be AEC-qualified once Phase 2 builds classifiers for their MFRs, so they carry positive expected value. A confirmed deviation (e.g. classifier says `commercial`, context is `automotive`) is definitively not AEC today. Expected-value ranking therefore puts unknown ahead of confirmed-deviation. Documented inline in `recommendationSort.ts` so a future reader doesn't "fix" it.

**Asymmetric `aec_q200` attribute upgrade.** A positive `aec_q200 = true` on an otherwise-unknown part upgrades to `automotive_q200` (confidence: medium). A negative `aec_q200 = false` does **not** downgrade to `commercial` — stays `unknown`. In practice `aec_q200 = false` in Digikey / parts.io / Atlas data is almost always "field not populated" rather than "confirmed not qualified," and suppressing a legitimate AEC part is costlier than leaving it at unknown.

**Deleted `escalate_to_mandatory` on `aec_q200` in MLCC automotive context.** The weight bump 8→10 was a near-noop once domain became the real mechanism: when both source and candidate had AEC data, the rule passed at both weight 8 and weight 10 — the bump only shifted the denominator by ~2–4 percentage points and never changed pass/fail. Two parallel mechanisms trying to solve the same problem is a debugging trap. Single-mechanism principle: domain does the work, `aec_q200` rule stays at base weight. Trivially restored if the narrow case surfaces in telemetry. The `flexible_termination` and `dielectric` escalations under automotive are unrelated and retained.

**Exclusion runs before certified-cross bypass.** Decision #133 bypasses the 13 post-scoring family filters for MFR-certified and Accuris-certified recs, on the principle that a human certification outranks our inferred blocking-rule rejection. Domain exclusion is NOT part of that bypass — cross-domain substitution is unsafe even with a vendor's FFF table behind it. Scope of the certified-cross audit follow-up (see Backlog): decide which of the 13 filters encode safety-class constraints that should never be bypassable even for certified crosses.

### Instrumentation (forcing function for Phase 2)

Every `getRecommendations` call under an active domain-gating context emits telemetry into `recommendation_log.snapshot.domainStats`:

```
{
  excludedByDomain,           // hard drops
  knownMatched,               // survivors in the context-expected set
  unknown: {                  // split by reason for Phase 2 prioritization
    no_classifier,            // → MFR classifier coverage
    ambiguous_series,         // → classifier quality
    no_signal,                // → upstream data completeness
  },
  deviationCount,             // known-mismatch survivors
}
```

Splitting unknown by reason is essential — a single `unknownCount` would hide which of the three workstreams (MFR coverage vs classifier quality vs upstream data) is driving the metric. The per-MFR unknown rate queryable from QC logs tells us which Phase 2 classifiers to build first.

### Files

- **new** `lib/services/qualificationDomain.ts` — types, classifier registry, `classifyQualificationDomain`, `upgradeFromAttributes`, `isDomainCompatible`, `contextExpectedDomains`, `contextActivatesDomainGate`, `domainBadge`.
- **new** `lib/services/classifiers/murataMlcc.ts` — first concrete MfrClassifier.
- **new** `components/DomainChip.tsx` — three-state badge component + `inferContextActive()` helper.
- **new** `__tests__/services/qualificationDomain.test.ts` — 34 tests covering classifier, asymmetric upgrade, automotive exclusion row, reported-bug integration.
- **modified** `lib/types.ts` — added `QualificationDomain`, `UnknownReason`, `DomainClassification`, `DomainStats`. Extended `Part.qualificationDomain`, `XrefRecommendation.domainDeviation`, `RecommendationResult.domainStats`, `RecommendationLogSnapshot.domainStats`.
- **modified** `lib/services/partDataService.ts` — classify source + every candidate, apply exclusion matrix before `withCertifiedBypass`, set deviation flag, build `domainStats`.
- **modified** `lib/services/recommendationSort.ts` — added within-bucket domain tiebreak (accepts optional `applicationContext`).
- **modified** `lib/services/partDataCache.ts` — bumped `RECS_CACHE_SCHEMA_VERSION` v5 → v6.
- **modified** `lib/contextQuestions/mlcc.ts` — deleted `escalate_to_mandatory` on `aec_q200` under automotive; commented rationale.
- **modified** `components/RecommendationCard.tsx`, `components/AttributesPanel.tsx`, `components/ComparisonView.tsx` — render `DomainChip` next to status chip.
- **modified** `components/RecommendationsPanel.tsx` — infer `contextActive` from recs and pass to card.
- **modified** `app/api/xref/[mpn]/route.ts`, `app/api/parts-list/validate/route.ts`, `lib/services/llmOrchestrator.ts` — include `domainStats` in QC log snapshots.

### Verification

- Unit suite: 34/34 pass. Reported-bug integration: `classifyQualificationDomain(GCH188R71E104KE01D)` → `medical_implant`, `isDomainCompatible(automotive, medical_implant)` → `compatible: false`.
- Full suite: 1353 tests, 22 suites, all pass (~1.7s).
- TypeScript: no errors introduced outside pre-existing test files.

### Phase 2 follow-on — tracked in BACKLOG

1. Additional MFR classifiers (TDK, Samsung, Yageo, KEMET, AVX, Kyocera, Taiyo Yuden), ordered by unknown-rate telemetry once Phase 1 ships.
2. Wire remaining rows of the exclusion matrix (medical, industrial, mil_spec, space) as family context questions are added.
3. Severity follow-up question for automotive context (powertrain / safety / infotainment / aftermarket).
4. Per-query "strict AEC-Q200 only" user filter.
5. Datasheet-extraction classifier as a fallback behind MPN-prefix classifiers.
6. **Certified-cross bypass audit** — separate safety-class blocking rules in the 13 post-scoring family filters from compatibility/preference filters; safety-class should apply even to certified crosses (tightens Decision #133).
7. Request-session memoization for domain classification (batch parts-list pipelines repeat the same candidate MPNs across rows).
8. Re-enable the amber "unknown domain" chip once per-family classifier coverage clears ~50% non-unknown (and rewrite the label — "Domain unknown — verify" is jargon).

### Post-ship fixes (same-session)

Three issues surfaced during manual verification and were fixed before close of session:

1. **Parts.io candidate shape bypassed the classifier.** `fetchPartsioEquivalents()` constructs candidate `Part` objects with `subcategory` but no `category` field. The Murata classifier's `isMlccCategory()` guard required `part.category === 'Capacitors'`, so GCH candidates from parts.io fell through to `unknown` instead of `medical_implant` and survived the automotive exclusion filter. Fixed by trusting the MPN prefix authoritatively — Murata's MLCC prefix space (GRM/GCM/GCJ/GRT/GCH/GJM/KGM/KCM/GMC) doesn't collide with their inductor (LQ*) or EMI filter (NFM/BLM/DLW) spaces. `isLikelyMlccFromCategory` retained only as a secondary allow-path for unknown-prefix candidates. Regression tests added in `qualificationDomain.test.ts`. Cache bumped v6 → v7.

2. **React stale closure in main search flow.** `handleFindReplacements` in `hooks/useAppState.ts` read `state.applicationContext` from a `useCallback` closure. Callers (`handleContextResponse`, `handleAttributeResponse`) invoked it immediately after `setState({applicationContext: ...})`, before React had flushed — so the closure served the old null context and the domain filter never ran on the main search view. Fixed by giving `handleFindReplacements` an optional `contextOverride` argument and passing the freshly-built context directly from the two state-setting call sites.

3. **Suppressed the amber "Domain unknown — verify" chip.** Phase 1 has only one registered classifier (Murata MLCC), so the chip fired on the majority of non-Murata candidates — noise rather than signal. The label was also too vague: "domain" is internal taxonomy and "verify" doesn't tell users what to verify. `domainBadge()` now returns `null` for the `unknown` branch; classification still drives the sort tiebreak and QC telemetry. Re-enable tracked in BACKLOG with a coverage threshold (~50% non-unknown per family) and a copy-rewrite prerequisite.

## Decision #156 — BOM Cost-Optimization Workflow: Unit Cost + Repl. Savings (Apr 2026)

### Problem

A common parts-list workflow is cost reduction: users upload a BOM that includes their **current unit cost** column and want to compare it against the proposed replacement's price to surface savings. Three things blocked this workflow:

1. There was no first-class "Unit Cost" mapped field — users with a "Unit Cost" header had to rely on the list-local `ss:N` column, which is stripped from master templates by `sanitizeTemplateColumns()`. Cost columns couldn't be part of a portable view.
2. There was no built-in column comparing current cost to replacement price. Users would have to eyeball Repl. Price next to their raw cost column.
3. **Bug:** Even the raw `ss:N` "Unit Cost" column did not appear in the column-picker's "Your Data" section in either master OR list-specific views. The user could see their Unit Cost data in the Original View table but had no UI affordance to add the column to a custom view.

### Decisions

**1. Add `mapped:unitCost` as a portable auto-detected field.** Same shape as `mapped:cpn` / `mapped:ipn`. Header detection via `UNIT_COST_PATTERNS` in `excelParser.ts` — longer phrases first ("current unit cost", "unit price"), bare "cost"/"price" last so "extended cost" / "list price" don't collide. Persisted as `rawUnitCost` on `PartsListRow` / `StoredRow`. Numeric parsing reuses the existing `toNumber()` helper from `calculatedFields.ts` (now exported), which handles "$1.25", commas, whitespace.

**2. Add `sys:priceDelta` (label "Repl. Savings") as a built-in system column, not a user-defined `calc:*` field.** The existing `calc:*` infrastructure is for runtime-defined formula fields stored per-view. Savings should be a first-class built-in — available to every user, portable by default, no formula-builder interaction. Compute: `toNumber(rawUnitCost) − resolveReplacementUnitPrice(row)`. Positive = savings (replacement cheaper); negative = replacement more expensive; undefined when either side is missing. Display as signed currency, green/red coloring, sortable numerically. Mirrors `sys:top_suggestion_price`'s logic for picking the best cross-distributor quote (FindChips supplierQuotes, falling back to part.unitPrice).

**3. Fix the picker visibility bug by trusting headers, not data scans.** The strict `nonEmptyIndices` filter in `useColumnCatalog.ts:75-87` silently dropped any `ss:*` column whose data scan didn't register as non-empty — and currency/numeric values were slipping past the `val.toString().trim() !== ''` check on certain lists. New rule: if the user provided a real header (non-empty trimmed string in `effectiveHeaders[index]`), the column is selectable in the picker, regardless of the data scan. Unlabeled columns still require data to avoid surfacing phantom trailing columns.

**4. Fix master-view save round-trip stripping mapped fields.** When the column picker opens against a master view, it expands `mapped:*` IDs to concrete `ss:N` indices (so the user sees real column labels). On save, `sanitizeTemplateColumns()` ran directly on those `ss:N` IDs, which strips all `ss:*` — silently wiping every Your Data column. `reverseMapKnownColumns()` already existed (used by PromoteViewDialog) but wasn't called on the normal save path. Wired into `PartsListShell.tsx`'s ColumnPickerDialog `onSave` handler before `sanitizeTemplateColumns` for both create and edit master-scope flows.

### Files

**Auto-detection + storage**:
- `lib/excelParser.ts` — `UNIT_COST_PATTERNS` constant + `unitCost` wired into `autoDetectColumns` greedy assignment
- `lib/types.ts` — `unitCostColumn?` on `ColumnMapping`, `rawUnitCost?` on `PartsListRow`
- `lib/partsListStorage.ts`, `lib/supabasePartsListStorage.ts` — persist `rawUnitCost`
- `hooks/usePartsListState.ts` — extract `rawUnitCost` from raw cells during parsing
- `hooks/useColumnCatalog.ts` — inferred-mapping recovery (locate the column on lists saved before unitCost detection landed)
- `lib/viewConfigStorage.ts` — `unitCostColumn` in `reverseMapKnownColumns` map
- `components/parts-list/PartsListShell.tsx` — `mapped:unitCost` resolution to `ss:N` at render time + portableColumnIds tracking + `reverseMapKnownColumns` on master-view save
- `components/parts-list/AddPartDialog.tsx` — exclude unitCost column from the "extras" picker
- `components/parts-list/ColumnMappingDialog.tsx` — manual "Unit Cost (optional)" override dropdown

**Column registration + display**:
- `lib/columnDefinitions.ts` — `mapped:unitCost` (group "Your Data"), `sys:priceDelta` (group "Replacements"), `resolveReplacementUnitPrice()`, `computePriceDelta()` helpers, `getSortValue` case
- `lib/calculatedFields.ts` — `toNumber()` exported for reuse
- `components/parts-list/PartsListTable.tsx` — `sys:priceDelta` custom renderer + REPLACEMENT_COLUMN_IDS membership

**Picker visibility fix**:
- `hooks/useColumnCatalog.ts:75-87` — header-based ss:* visibility check

### Verification

- Upload a BOM with a "Unit Cost" column → header auto-assigned to `mapped:unitCost`
- Edit any view → "Unit Cost" appears under "Your Data" with the sparkle (portable badge)
- Raw `ss:*` columns now appear under "Your Data" in list-scope views (the picker visibility fix)
- Add "Unit Cost" + "Repl. Savings" to a view → savings render with sign + color, sort numerically, missing values render as `—`
- Save a master view containing mapped fields → reload → mapped fields survive (the reverse-map fix)
- 1355 Jest tests pass

### Out of scope (BACKLOG)

- Extended cost (Unit Cost × Quantity) column
- Percentage savings (delta/cost)
- Cost-optimization view template preset (Unit Cost + Repl. Price + Repl. Savings + Repl. Distributor, sorted by savings)
- Multi-currency reconciliation when user's unit-cost currency differs from the replacement's quote currency

---

## Decision #157 — Column-Label Source Suffix Convention + Manufacturer→MFR (Apr 2026)

### Problem

Column labels in the parts-list table and column picker had no consistent provenance indicator. Some hand-rolled prefixes/suffixes existed inconsistently: "MPN (DK)", "DK Price", "DK Stock", "DigiKey SKU", and most other Digikey columns had no marker at all. The picker's `SourceBadge` chip (orange "DK", blue "PIO", green "Atlas") only appeared in the picker, not the table header, and didn't disambiguate columns whose data origin differs from their ID prefix (e.g. `dk:riskRank` carries `dataSource: 'partsio'` while `fc:riskRank` is FindChips — both rendered as "Risk Rank" in headers).

Additionally, "Manufacturer" eats horizontal space in dense tables with 15+ columns.

### Decisions

**1. Single source-suffix convention via `getColumnDisplayLabel(col)` helper.** Helper appends `(suffix)` to `col.label` based on `col.dataSource`. Idempotent — won't double-suffix. Map (`SOURCE_SUFFIX` in `lib/columnDefinitions.ts`):

| dataSource | suffix |
|------------|--------|
| `digikey`  | DK     |
| `partsio`  | P      |
| `atlas`    | A      |
| `findchips`| FC     |
| `mouser`   | Mouser |

The convention is `dataSource`-driven, not ID-prefix driven. So `dk:riskRank` (which is parts.io-sourced) renders as "Risk Rank (P)" while `fc:riskRank` renders as "Risk Rank (FC)" — collision resolved.

**2. Normalized inline labels** so the helper owns the suffix entirely:
- `dk:mpn` "MPN (DK)" → label "MPN" (renders "MPN (DK)")
- `dk:unitPrice` "DK Price" → "Price" ("Price (DK)")
- `dk:quantityAvailable` "DK Stock" → "Stock" ("Stock (DK)")
- `dk:digikeyPartNumber` "DigiKey SKU" → "SKU" ("SKU (DK)")

**3. Drop the redundant SourceBadge chip for any source covered by the suffix map.** Picker's `SourceBadge` checks `SOURCE_SUFFIX[dataSource]` and returns `null` if present. Removes the orange/blue/green chip entirely from the picker — text suffix is the only indicator now. (Chip code retained as fallback for any future source not yet in `SOURCE_SUFFIX`.)

**4. Abbreviate "Manufacturer" → "MFR" in column labels.** Two definitions touched: `dk:manufacturer` and `mapped:manufacturer`. Replaced "Manufacturer" → "MFR". `sys:top_suggestion_mfr` was already "Repl. MFR".

### Consumers routed through `getColumnDisplayLabel`

- `components/parts-list/PartsListTable.tsx` — table header (sortable + non-sortable spans)
- `components/parts-list/ColumnPickerDialog.tsx` — picker list, active-columns pane, search filter
- `components/parts-list/CalculatedFieldEditor.tsx` — formula operand pickers (left/right)

### Files

- `lib/columnDefinitions.ts` — `SOURCE_SUFFIX` exported, `getColumnDisplayLabel()` helper, normalized PRODUCT_COLUMNS labels, MFR abbreviation
- `components/parts-list/ColumnPickerDialog.tsx` — import + route 3 label sites + `SourceBadge` skips suffixed sources
- `components/parts-list/PartsListTable.tsx` — header labels through helper
- `components/parts-list/CalculatedFieldEditor.tsx` — operand picker through helper

### Extensibility

Adding a new data source becomes a one-line change in `SOURCE_SUFFIX`. Parametric (`dkp:*`) columns auto-inherit the correct suffix from whichever source populated their value (Atlas/Digikey/parts.io) via the existing `parameterKeys` source field — no per-column work needed.

---

## Decision #158 — FindChips Commercial Cache: Drop L2 Persistence (Apr 2026)

**Context:** User reported that the Source Part Commercial tab on `TNC0402GTC10K0F345` showed only Digikey, while findchips.com showed 4+ distributors for the same MPN. Investigation traced this to the L2 cache: `getFindchipsResults()` was writing the full `FCDistributorResult[]` blob (price + stock + lifecycle + compliance + distributor list) to `part_data_cache` under variant `fc-results`, `cache_tier='commercial'`, with `TTL_COMMERCIAL_MS = 24h`. A previous request that hit FC during a transient hiccup (1 distributor returned) pinned that thin response for 24 hours; subsequent requests during that window saw "only Digikey" even though FC's API would now return the full set. Beyond the immediate stale-distributor bug, the user's broader concern: "the only thing that should be cached is technical attributes, NOT price and stock."

### Decision

**Stop persisting FindChips commercial data at L2.** Specifically:

1. **L2 (Supabase) `fc-results` writes removed.** [lib/services/findchipsClient.ts](lib/services/findchipsClient.ts) no longer calls `setCachedResponse('findchips', ...)`. Existing rows expire on their 24h TTL — no manual purge required. Likewise removed the L2 reads at the top of `getFindchipsResults()` and the batch L2 read in `getFindchipsResultsBatch()`. Imports of `getCachedResponse`, `getCachedResponseBatch`, `setCachedResponse`, `isNotFoundSentinel`, `TTL_COMMERCIAL_MS` dropped.

2. **L1 in-memory TTL dropped 30 min → 5 min.** Intra-render dedup is preserved (multiple components on the same page hitting the same MPN within a render tick still hit L1), but no decision-grade pricing is shown on data older than 5 min.

3. **Per-MPN admin purge UI surfaced** on [components/admin/DataSourcesPanel.tsx](components/admin/DataSourcesPanel.tsx). MPN text input + service dropdown (`findchips`/`digikey`/`partsio`/`mouser`/`search`) + "Purge" button calls the existing `DELETE /api/admin/cache?service=...&mpn=...` endpoint; result count + errors surface via Snackbar. Diagnostic for cases where stale cache is suspected.

### Trade

**Cost:** every cold L1 (5+ min idle) hits the live FC API. With ~5000/day budget and current usage well under that, this is fine. The user explicitly accepted this trade in exchange for live pricing/stock.

**Carve-out, not a wholesale L2 removal:** Decision #99's three-tier cache (parametric / lifecycle / commercial 24h) stays intact for everyone else. Digikey's commercial slice (`commercial:${currency}` variant in [digikeyClient.ts](lib/services/digikeyClient.ts)) still uses the 24h tier — flagged for the user but not changed in this session. If/when they call it out, apply the same fix.

### Files

- [lib/services/findchipsClient.ts](lib/services/findchipsClient.ts) — cache reads/writes removed; L1 TTL constant changed to 5 min; `partDataCache` import block deleted.
- [components/admin/DataSourcesPanel.tsx](components/admin/DataSourcesPanel.tsx) — new "Purge cache for one MPN" card + handler + Snackbar.

### Memory

Captured as a feedback memory (`feedback_no_caching_pricing_stock.md`): pricing/stock should never live in L2; only technical attributes / lifecycle / compliance / distributor identity may. Re-read before introducing any new cache layer.

---

## Decision #159 — Mismatch-Count Filter: Client-Side Toggle on Single-Part Path (Apr 2026, extends #109)

**Context:** Decision #109 introduced `filterRecsForBatch` — a post-scoring filter dropping candidates with `>1 real mismatch` (a `fail` rule with `replacementValue !== 'N/A'`; missing-attribute fails are ignored). It only ran on the BOM batch path (`filterForBatch: true`). The single-part xref panel never invoked it, so cards with 2, 3, or more failed parameters routinely surfaced. User asked: "feels silly to show a part with more than 2 failing parameters."

### Decision

**Apply the filter to the single-part path too — client-side and toggleable, threshold `≤2`.** Architectural details:

1. **Promote helpers to client-importable [lib/types.ts](lib/types.ts).** New exports: `isCertifiedCross(rec)`, `countRealMismatches(rec)`, `filterRecsByMismatchCount(recs, max)`. Server-side copies in `partDataService.ts` deleted; that file now imports from `../types`. Renamed from `filterRecsForBatch` to `filterRecsByMismatchCount` since the helper is no longer batch-specific.

2. **Server-side single-part filter REMOVED.** `getRecommendations()` only calls `filterRecsByMismatchCount(recs, 1)` when `options.filterForBatch === true`. Single-part returns the full candidate set so the client can toggle without a refetch.

3. **Client-side filter in [components/RecommendationsPanel.tsx](components/RecommendationsPanel.tsx).** New state `hideHighFails: boolean` (default `true`, threshold constant `MAX_MISMATCHES = 2`). Applied as the final `.filter(...)` in the rendering pipeline, certified-cross bypass preserved. UI:
   - Filter popover gains a "Quality" section with checkbox `Hide >2 failed parameters (N hidden)`.
   - Filter row shows dismissible chip `Showing high-fail` when toggle is OFF (mirrors existing "Include inactive" pattern).
   - `activeFilterCount` and `handleClearFilters` updated so the toggle counts in the badge and resets to default on Clear all.

4. **Cache invalidation.** `RECS_CACHE_SCHEMA_VERSION` bumped `v7 → v9`. The intermediate `v8` (briefly committed during this session as a server-side-only single-part filter at `≤2`) is discarded — old `v8` rows would have been pre-filtered and missing the `>2-fail` candidates the client now wants to toggle into view. Single bump documented; no manual purge needed since old rows are unreachable under the new key.

### Why client-side, not server-side

Server-side at `≤2` would force a refetch whenever the user toggled "Show all," with both states cache-keyed separately and 30-day TTL apart. Client-side gives an instant toggle, no refetch, single cache variant. Trade: ~2× the data over the wire on the single-part path (full candidate set vs. pre-filtered). Acceptable — the candidate set is bounded by the matching-engine output (typically ≤50 recs), and FindChips enrichment is already deferred.

### What's preserved

- **Certified-cross bypass** — MFR-uploaded and Accuris parts.io equivalents flow through regardless of mismatch count, on both batch and single-part paths.
- **Missing-attribute fails ignored** — only `replacementValue !== 'N/A'` fails count.
- **Batch threshold = 1** — BOM flow unchanged; users in that view have no UI to override.
- **Obsolete/Discontinued exclusion** — still always drops in `filterRecsByMismatchCount`.

### Files

- [lib/types.ts](lib/types.ts) — three new exports.
- [lib/services/partDataService.ts](lib/services/partDataService.ts) — local helpers removed; imports from `../types`; single-part filter call deleted.
- [lib/services/partDataCache.ts](lib/services/partDataCache.ts) — `RECS_CACHE_SCHEMA_VERSION = 'v9'`.
- [components/RecommendationsPanel.tsx](components/RecommendationsPanel.tsx) — `hideHighFails` state, filter pipeline addition, popover section, dismissible chip, badge counter, clear-all reset.

---

## Decision #160 — Per-Rule Value Aliases for Categorical Identity Synonyms (Apr 2026)

**Context:** Real failure case from a user-supplied screenshot — Würth Elektronik aluminum electrolytic (family 58, sourced from Digikey) reports `Polarization = "Polar"`. The Accuris-certified replacement (Fenghua, sourced from Atlas) reports `Polarization = "POLARIZED"`. The two strings are semantically identical, but the `polarization` rule (`identity` LogicType) failed the candidate because the engine's `normalize()` only does trim + uppercase + whitespace-collapse. `"POLAR" ≠ "POLARIZED"`. After string-equality fails, the engine falls through to numeric extraction (handles SI-prefix UoM drift like `1 µF ≡ 1000 nF` from Decision #137), but for non-numeric values there was no remediation. No alias / synonym layer existed anywhere in the system.

### Decision

**Per-rule `valueAliases?: string[][]` on `MatchingRule`, evaluated by the matching engine between normalize-equality and numeric fallback, overridable via the existing admin override system (Decision #60).**

Each inner array is a group of equivalent values for that rule; any value in a group is treated as equal to any other value in the same group. Comparison uses the existing `normalize()` helper so casing/whitespace differences inside a group don't matter.

### Why per-rule, not global

Considered four options:

1. **Per-rule alias map on the LogicRule (chosen).** Locality — engineers reading `aluminumElectrolytic.ts` see the alias group right next to the rule. Per-attribute scope — polarization aliases can't bleed into mounting-type or dielectric. Admin-overridable for free via [overrideMerger.ts](lib/services/overrideMerger.ts) with no new UI surface. Becomes part of the rule snapshot in `recommendation_log` for QC.
2. **Mapper-side canonicalization** — fragile; requires knowing every source's value space across 3 mappers and 43 families; a new variant from Atlas silently misses.
3. **Global value-normalizer module** — risks cross-attribute collisions; engineers won't find it co-located with the rule it affects.
4. **Change rule type to `identity_flag`** — semantically wrong for multi-state categoricals (Polar vs Bi-Polar are distinct states, not presence/absence).

### Engine wiring

In [lib/services/matchingEngine.ts](lib/services/matchingEngine.ts):

- New helper `inSameAliasGroup(rule, a, b)` — normalizes both inputs, returns `true` iff they appear in the same `rule.valueAliases` group.
- `evaluateIdentity()` — between the existing normalize-equality check and the numeric-tolerance fallback, consult aliases. If both sides land in the same group, treat as match. Otherwise fall through to today's path. Preserves SI-prefix numeric tolerance entirely.
- `evaluateIdentityUpgrade()` — alias-aware hierarchy lookup. If a value isn't in `upgradeHierarchy` directly but one of its alias-group mates is, use that hierarchy index. Plus the both-missing-from-hierarchy fallback also consults aliases. Lets per-rule synonyms map onto hierarchy positions without bloating the hierarchy itself.
- Other rule types (`threshold`, `fit`, `identity_flag`, `identity_range`, `vref_check`, `application_review`, `operational`) ignore aliases — they're numeric / boolean / non-comparison.

### Hand-curated seed entries (Phase 1)

- **Family 58 (Aluminum Electrolytic) — `polarization`:** `[['Polar', 'Polarized', 'Uni-Polar', 'Unipolar'], ['Bi-Polar', 'Bipolar', 'Non-Polar', 'Non Polar']]`. Validates the engine work against the failing screenshot case.
- **Family 12 (MLCC) — `dielectric`:** `[['C0G', 'NP0']]`. Audit of existing `identity_upgrade` hierarchies turned up exactly one lateral equivalent — `NP0` was previously listed as hierarchy position 1 (right after `C0G` at position 0), causing a `C0G → NP0` substitution to read as a downgrade. The engineering reason on the same rule literally calls them "Class I (C0G/NP0)" together. Fix: removed `NP0` from `upgradeHierarchy`, added it as a `valueAliases` group with `C0G`. Now treated as exact same hierarchy position.

No other lateral equivalents found in the audit; the remaining hierarchies (Thin/Thick Film, FS/NPT/PT, etc.) are genuinely ordered.

### Override-system plumbing

New `value_aliases JSONB` column on `rule_overrides` (Supabase migration: [scripts/supabase-rule-overrides-value-aliases-migration.sql](scripts/supabase-rule-overrides-value-aliases-migration.sql)). Plumbed through:

- [lib/services/overrideMerger.ts](lib/services/overrideMerger.ts) — modify-merge, add-pass-through, cleanup (stripped for non-identity rule types).
- [lib/services/overrideValidator.ts](lib/services/overrideValidator.ts) — validates `string[][]` shape, no empty groups, no value in two groups (case/whitespace-normalized for the dedup check).
- [lib/services/overrideHistoryHelper.ts](lib/services/overrideHistoryHelper.ts) — `value_aliases` in snapshot fields + camelCase map.
- [app/api/admin/overrides/rules/route.ts](app/api/admin/overrides/rules/route.ts) — POST insert + `mapRowToRecord`.
- [app/api/admin/overrides/rules/[overrideId]/route.ts](app/api/admin/overrides/rules/[overrideId]/route.ts) — PATCH field map + previous_values current-state copy.
- [app/api/admin/overrides/rules/restore/route.ts](app/api/admin/overrides/rules/restore/route.ts) — restore copies field forward.
- [lib/logicTables/deltaBuilder.ts](lib/logicTables/deltaBuilder.ts) — variant family (53/54/55/60/13/72/B2/B3/B4) compile-time delta path.

### Admin UI

[components/admin/RuleOverrideDrawer.tsx](components/admin/RuleOverrideDrawer.tsx) — new conditional `Value Aliases` multi-line text field (one group per line, comma-separated). Visible when `logicType ∈ {identity, identity_upgrade}`. Diff display in the history view formats `string[][]` as `group1 | group2`. i18n strings added to `en.json` and `zh-CN.json` (de.json doesn't have adminOverride strings; English fallback). [components/admin/LogicPanel.tsx](components/admin/LogicPanel.tsx) `mergedRules` now includes `valueAliases` so the indicator-dot logic picks up alias-only changes.

### Tests

[__tests__/services/matchingEngine.test.ts](__tests__/services/matchingEngine.test.ts) — new test groups for `identity with valueAliases` (6 tests) and `identity_upgrade with valueAliases` (5 tests) covering: same-group pass, case/whitespace insensitivity, different-group fail, unknown-value fail, no-regression when aliases absent, fall-through to numeric comparison, alias maps to hierarchy index, lateral within-position pass, downgrade still fails, upgrade still passes, both off-hierarchy in same group passes. All 1380 tests pass.

### Phase 2 (shipped same session)

Built [scripts/mine-identity-fails.ts](scripts/mine-identity-fails.ts) — read-only Node script (run via `npx tsx`) that scans `recommendation_log` JSONB snapshots, filters to `identity` / `identity_upgrade` rule fails where both values are non-numeric strings, drops pairs already covered by existing `valueAliases`, groups by `(family_id, attributeId, normalize(a), normalize(b))` direction-insensitively, and writes a ranked CSV + JSON to `scripts/mine-identity-fails-output.{csv,json}`.

**Mining run results (497 logs, 49,114 rule evaluations scanned):**
- 581 string-vs-string identity fails
- **59 unique suspect pairs** — well within the "small + obvious, hand-curate" bucket. No Haiku tooling needed.
- Triage: 4 green-bucket rules (real synonyms), ~6 yellow (mapper / param-map bugs — separate fix), remaining ~49 red (genuinely different specs, engine correctly failing).

**Curation pass — four alias groups added (extensions chosen over strict-evidence):**

1. **[lib/logicTables/d2Fuses.ts](lib/logicTables/d2Fuses.ts) — `speed_class`** — five groups covering Fast/Very Fast/Medium/Slow/Very Slow with all standard letter codes (F, FF, M, T, TT) and prose variants (Fast Blow, Time Delay, Time Lag, etc.). Mining evidence: only Fast↔Fast Blow (51×).
2. **[lib/logicTables/chipResistors.ts](lib/logicTables/chipResistors.ts) — `composition`** — Thick Film + Chinese forms (`厚膜`, `厚膜电阻`) and Thin Film + Chinese forms (`薄膜`, `薄膜电阻`). Mining evidence: 31× across thick-film variants.
3. **[lib/logicTables/interfaceICs.ts](lib/logicTables/interfaceICs.ts) — `protocol`** — six groups covering RS-232, RS-485, RS-422, I²C, CAN, CAN FD with all EIA/TIA/V.28 standard designations and the concatenated forms Atlas/parts.io emit. Mining evidence: 24× on RS-232 variants only.
4. **[lib/logicTables/adc.ts](lib/logicTables/adc.ts) — `architecture`** — four groups covering Delta-Sigma (incl. `ΔΣ`), SAR (incl. `Successive Approximation`), Pipeline (incl. `Pipelined`), Flash (incl. `Direct Conversion`). Mining evidence: 10× on Delta-Sigma variants only.

The non-mining-evidence entries (extensions) were kept after explicit user approval. Justification: each affected attribute has a fixed canonical vocabulary (fuse speed classes, RS-* protocols, ADC architectures, film resistor compositions), so the same vocabulary-drift pattern certainly affects the other variants we just haven't logged yet at sufficient scale.

**Re-mining after curation:** kept-fails dropped 581 → 465 (-20%), unique pairs dropped 59 → 48 (-19%), `already aliased` count more than doubled (119 → 235) confirming the engine is now consuming the new groups. None of the four green-bucket pairs reappear in the output.

**Two follow-ups deferred to backlog:**
- **`package_case` formatting drift** (`0603` ↔ `0603 (1608 Metric)`, 8× on family 52, recurs across many families) — Digikey appends ` (NNNN Metric)` to EIA codes; cleaner fix is a small enhancement to the engine's `normalize()` to strip the parenthetical metric suffix on package values, NOT per-family aliases (doesn't scale across 43 families × ~20 standard EIA sizes).
- **Mapper / param-map bugs** (yellow bucket: `B1/configuration` "BRIDGE, 4 ELEMENTS" ↔ "Single Phase" 82×, `E1/output_transistor_type` 45×, `C7/operating_mode` 28× + 15×, etc.) — these are wrong-field-mapping issues at the Digikey/Atlas mapper layer, not synonym problems.

**Phase 3 — Inline "Propose alias" button (shipped same session):**

Two new components plus wiring into two surfaces, admin-gated:

- [components/admin/ProposeAliasDialog.tsx](components/admin/ProposeAliasDialog.tsx) — modal that fetches the rule's effective `valueAliases` (TS base merged with active override), auto-suggests an existing group when one of the two values is already aliased, lets admin pick "Create new group" or "Add to existing group: X", optional comma-separated extra synonyms, required change reason. Detects collision (same value in two groups) client-side before submit. Posts via `createRuleOverride` (no existing override) or `updateRuleOverride` (existing) — both routes already invalidate cache on save.
- [components/admin/ProposeAliasButton.tsx](components/admin/ProposeAliasButton.tsx) — small `LinkOutlinedIcon` icon button. Renders only when ALL of: user is admin, rule's `logicType` is `identity` / `identity_upgrade`, row's `ruleResult === 'fail'`, both values are non-empty / non-N/A, family has a logic table. Hidden in all other cases — regular users never see it.

Wired into:
- [components/ComparisonView.tsx](components/ComparisonView.tsx) — inline next to the status dot in the per-rule comparison table. FamilyId resolved client-side via `getLogicTableForSubcategory(part.subcategory, sourceAttributes)` (handles variant family classification).
- [components/admin/QcFeedbackDetailView.tsx](components/admin/QcFeedbackDetailView.tsx) — same button on the same row layout. `onSuccess` callback auto-resolves the feedback (status → `resolved`, admin notes appended with "Resolved by adding value alias.") if the feedback was `open` or `reviewed`.

**Net flow per failing row:** admin clicks the link icon → small dialog appears with the two values pre-filled and the rule's existing groups → picks new-group or existing-group → adds optional extras → enters reason → submits. The rule is patched, recommendations cache invalidates, and on the QC feedback path the original feedback ticket is auto-closed. No further dev work needed for ongoing maintenance — admin-driven, per-incident, lives in the UI they already use.

i18n strings added under `proposeAlias.*` in `en.json` and `zh-CN.json`.

**What this does NOT change:**
- The matching engine itself (still consumes `valueAliases` exactly as it did since Phase 1).
- Override system plumbing (just a new caller; existing POST/PATCH routes do the work).
- Existing override-management UI in the rule drawer (still works the same way; this is a faster path for the common case of "I see a fail, fix it on the spot").

### What this does NOT solve

- Compound numeric values where the qualifier matters (e.g. `22.1 mA @ 100 kHz` test conditions) — `getNumeric()` extracts the leading number; if the qualifier is load-bearing for a specific rule, that's per-rule custom logic, not aliases.
- Atlas Chinese parameter NAME → English mapping (separate concern, handled by family dictionaries in `atlasMapper.ts`).
- Cross-source value disagreements that aren't synonyms (data quality, not matching).

## Decision #161 — MFR Profile Panel Wired to atlas_manufacturers + Identity-Based CN Flag (Apr 2026)

### Decision

Two coupled changes, both leaning on the existing manufacturer alias resolver (Decision #148):

1. **MFR profile panel wired to `atlas_manufacturers`.** Clicking an MFR name in the recommendations list resolves through `resolveManufacturerAlias()` → fetches the matching `atlas_manufacturers` row → renders real profile data (summary, logo, headquarters, founded year, certifications, core products, compliance flags). Western MFRs not yet covered by `manufacturer_companies` fall back to the legacy `mockManufacturerData.ts` set; truly unknown MFRs open the panel with an empty-state body. Previously: hardcoded ~10-MFR mock map silently no-op'd for everyone else, which meant every Chinese MFR.

2. **Country flag is now identity-based, not source-based, on both source-attributes panel and recommendation cards.** Single field `Part.mfrOrigin: 'atlas' | 'western' | 'unknown'` carries the resolver verdict everywhere a `Part` is rendered. `getRecommendations()` resolves each unique candidate manufacturer through the alias resolver in parallel (~5-min cached) and tags every `rec.part.mfrOrigin`. `app/api/attributes/[mpn]/route.ts` does the same on the source attributes response (resolved at response time so cached `PartAttributes` rows don't need a schema bump). `RecommendationCard` and `AttributesPanel` both render the 🇨🇳 flag off `part.mfrOrigin === 'atlas'`. Net effect: GIGADEVICE / 3PEAK / etc. show the flag on the source panel AND every rec card, regardless of whether the attributes came from Digikey, Atlas, Mouser, or parts.io. The "Attributes: <source>" footer line keeps using `dataSource` — that line is genuinely about provenance.

**Source-attributes panel also clickable.** `AttributesPanel` accepts an optional `onManufacturerClick` prop; both desktop and mobile layouts pass `mfr.handleManufacturerClick` through. Clicking the MFR name in the source panel opens the same profile side panel as clicking it on a rec card.

### Why bundle them

Both lookups need the same per-MFR alias resolution. Doing them as one change avoids resolving the same MFR twice (once for flag rendering, once for profile fetch) and keeps `atlas_manufacturers` as the single source of truth for MFR identity.

### Files

**New:**
- `lib/utils/countryFlag.ts` — ISO-2 → regional-indicator emoji helper.
- `lib/services/manufacturerProfileService.ts` — `mapAtlasToManufacturerProfile()` + `getProfileForManufacturer()`. Resolves alias → fetches `atlas_manufacturers` row → maps to `ManufacturerProfile` shape. Mock fallback chain.
- `app/api/manufacturer-profile/route.ts` — `GET /api/manufacturer-profile?name=<encoded>`. `requireAuth()` gated. Returns `{ profile, source: 'atlas' | 'mock' }` or 404.

**Modified:**
- `hooks/useManufacturerProfile.ts` — async `handleManufacturerClick` with placeholder-on-open (panel slides in instantly), `mfrLoading` + `mfrSource` state, in-flight request id to drop stale resolutions on rapid clicks.
- `components/ManufacturerProfilePanel.tsx` — "Sample Data" chip now conditional on `source === 'mock'`, loading skeleton, empty-state body for unenriched MFRs.
- `components/AppShell.tsx`, `components/DesktopLayout.tsx`, `components/MobileAppLayout.tsx` — thread `mfrSource` + `mfrLoading` through to the panel.
- `lib/types.ts` — `mfrOrigin?: 'atlas' | 'western' | 'unknown'` on `Part` (single source of truth — both source attrs and rec.part read it).
- `lib/services/partDataService.ts` — resolve unique MFRs in parallel before the rec post-processing `.map`, tag `rec.part.mfrOrigin`.
- `app/api/attributes/[mpn]/route.ts` — tag source-part `mfrOrigin` at response time (post-cache).
- `components/AttributesPanel.tsx` — clickable MFR name + 🇨🇳 flag, accepts new `onManufacturerClick` prop.
- `components/DesktopLayout.tsx`, `components/MobileAppLayout.tsx` — pass `onManufacturerClick` to `AttributesPanel`.
- `components/RecommendationCard.tsx` — flag condition swapped from `dataSource === 'atlas'` to `part.mfrOrigin === 'atlas'`.
- `lib/services/partDataCache.ts` — bumped `RECS_CACHE_SCHEMA_VERSION` v9 → v10 so existing cached recs re-render with the new flag logic.
- `lib/api.ts` — `fetchManufacturerProfile()` client wrapper.

### What this does NOT change

- Western MFR coverage — Decision #149 P1 still blocked on data file. Mock data remains the Western fallback for now.
- Admin manufacturer detail page (`/admin/manufacturers/[slug]`) — uses its own admin route; unchanged.
- Parts-list source attributes (`PartDetailModal.tsx`) — `app/api/parts-list/validate/route.ts` doesn't tag `mfrOrigin` yet. Flag won't render in the per-row modal until validate is updated. Logic-driven recs in lists are unaffected (those already get tagged via `getRecommendations`).


---

## Decision #162 — Image Attachments on App Feedback (Apr 2026)

### Context

The "Give Feedback" dialog ([components/AppFeedbackDialog.tsx](../components/AppFeedbackDialog.tsx)) was text-only. Users reporting visual bugs (broken layouts, wrong recommendations, misrendered panels) had no way to *show* the problem, and admins triaging in `AppFeedbackDetailView` often couldn't tell what the user actually saw. Screenshots are the natural medium for these reports.

This is also the first introduction of Supabase Storage in this codebase.

### What we built

End-to-end image attachment support on `app_feedback`:

1. **DB**: new `attachments JSONB NOT NULL DEFAULT '[]'` column on `app_feedback`. Shape: `Array<{ path, mimeType, sizeBytes }>`. JSONB rather than a separate table — never queried into, just round-tripped.
2. **Storage**: new private bucket `app-feedback-attachments`. Path layout: `{user_id}/{feedback_id}/{nanoid}.{ext}`. Three RLS policies on `storage.objects`: users INSERT under own `user_id` prefix, users SELECT their own, admins SELECT all.
3. **Upload path**: single round-trip via `multipart/form-data` to `POST /api/app-feedback`. Server reads form, uploads each file to Storage with the server client (RLS bypassed), then inserts the row with the resulting paths. Best-effort orphan cleanup on insert failure.
4. **Read path**: admin GET routes generate 1-hour signed URLs via `createSignedUrl(path, 3600)` and return them on the list/detail item as `AppFeedbackAttachmentView.signedUrl`. Bucket stays private.
5. **Submission UI**: `AppFeedbackDialog` adds a file picker (`<input type="file" accept="image/*" multiple>`), thumbnail strip with × remove, and a `paste` handler on the dialog content that catches `image/*` items from the clipboard. Client-side validation: max 5 files, 10 MB each, mime in `{png, jpeg, webp, gif}`.
6. **Admin UI**: `AppFeedbackDetailView` renders attachment thumbnails between Comment and Technical info, each linking out to the full image in a new tab. `AppFeedbackTab` shows a small paperclip icon (with count if >1) at the start of the Comment cell for rows that have attachments.

### Decisions and tradeoffs

**Single round-trip vs two-phase upload.** Options were (a) client uploads directly to Storage with the browser SDK then POSTs metadata, or (b) multipart through the existing API route. Picked (b): no storage SDK wiring on the client, no orphan-object cleanup needed when the user closes the dialog, simpler RLS reasoning. Files are small (≤10 MB × 5 = 50 MB worst-case) so request size isn't an issue.

**Image-only, explicit allow-list.** Rejected SVG even though it's `image/*` — SVG can carry inline scripts and we render attachments inline as `<img>` for admins. The allow-list (png/jpeg/webp/gif) is enforced both client-side and server-side; the server allow-list is the source of truth.

**Private bucket + signed URLs vs public bucket.** Private. Feedback can include screenshots of customer BOMs, internal part numbers, or auth screens — none of that should be reachable by URL guessing. 1-hour signed URLs are regenerated each time admin loads the list.

**`attachments` as JSONB, not a join table.** We never query "which feedback has > N attachments" or "which attachments are oldest" — we always read them with their parent row. JSONB keeps it one fewer table and one fewer query.

**Limits.** 5 images × 10 MB. Five is enough for any normal bug report; more usually means the user should write a different issue. 10 MB easily covers a 4K screenshot at lossless PNG.

### Files

**New:**
- [scripts/supabase-app-feedback-attachments.sql](../scripts/supabase-app-feedback-attachments.sql) — column + bucket + 3 RLS policies.

**Modified:**
- [lib/types.ts](../lib/types.ts) — `AppFeedbackAttachment`, `AppFeedbackAttachmentView`, `AppFeedbackSubmission.attachments?: File[]`, `AppFeedbackListItem.attachments: AppFeedbackAttachmentView[]`.
- [lib/api.ts](../lib/api.ts) — `submitAppFeedback()` switched from JSON to FormData.
- [app/api/app-feedback/route.ts](../app/api/app-feedback/route.ts) — multipart parsing, mime/size validation, Storage upload, orphan cleanup on insert failure.
- [app/api/admin/app-feedback/route.ts](../app/api/admin/app-feedback/route.ts) — sign URLs for each attachment in list response.
- [components/AppFeedbackDialog.tsx](../components/AppFeedbackDialog.tsx) — file picker, paste handler, thumbnail strip, validation.
- [components/admin/AppFeedbackDetailView.tsx](../components/admin/AppFeedbackDetailView.tsx) — attachment thumbnail strip with click-to-open.
- [components/admin/AppFeedbackTab.tsx](../components/admin/AppFeedbackTab.tsx) — paperclip-with-count indicator on rows that have attachments.

### Migration

Run [scripts/supabase-app-feedback-attachments.sql](../scripts/supabase-app-feedback-attachments.sql) once in the Supabase SQL editor. Existing rows get `attachments = '[]'::jsonb`. No backfill needed.

---

## Decision #163 — Three-Layer Search Latency Cuts: Alias L2, Recs Base-Cache Split, Deferred Parts.io Enrichment (Apr 2026)

User reported single-part search felt slow during a live demo. Diagnosis identified three distinct sources of latency, each addressed by a separate fix that ships independently of the others.

### Fix 1 — MFR alias resolver L2 cache

[lib/services/manufacturerAliasResolver.ts](../lib/services/manufacturerAliasResolver.ts) only had a 5-min in-memory cache. Every cold server (deploy, Vercel cold start, demo restart) re-ran three Supabase scans (`atlas_manufacturers` + `manufacturer_companies` + `manufacturer_aliases`) plus a parent-chain walk before any search could complete. The resolver is called twice per search — on the attributes endpoint for source-part origin tagging and on the xref pipeline for every unique candidate MFR (Decision #161) — so the cold-start tax was ~400-600ms before the matching engine even started.

Added a Supabase L2 cache layer using the existing `part_data_cache` table. Stores raw rows under a sentinel key (`service='search'`, `mpn='__mfr_alias_index__'`, `variant='v1'`) with 6-month TTL — the alias graph changes infrequently and admin alias edits invalidate explicitly. On cache hit, the in-memory index is rebuilt from the cached rows (microseconds) instead of re-fetching from Supabase. `invalidateManufacturerAliasCache()` now also fires-and-forgets a Supabase delete so the next cold start rebuilds from source.

Bump `MFR_ALIAS_L2_VERSION` when row shapes change.

### Fix 2 — Recommendations base-payload cache

The full-result `recommendations` cache (Decision #128, RECS_CACHE_SCHEMA_VERSION) keys on `applicationContext`, `userPreferences`, `replacementPriorities`, and `preferredManufacturers` — so any context-only change between runs of the same MPN was a cache miss even though the heavy lifting (Digikey/Atlas/parts.io candidate fetch + parts.io gap-fill + MFR cross-ref expansion) is identical. Demo flows that adjust context answers between searches paid the full 3-8s pipeline rerun every time.

Split the cache into two tiers:
- **`rec-base:v1:<mpn>:<hash>`** — keys only on inputs that affect candidate fetching (`mpn + overrides + currency + opts`). Stores the pre-scoring artifacts: `sourceAttrs`, `allCandidates`, `certificationMap`, `mfrEquivalenceTypeMap`, `dataSourceMap`, `enrichedFromMap`, `resultDataSource`, `sourcePartDataSource`. Maps/Sets serialized as entry arrays for JSON safety. 30-day TTL (same as recs cache).
- **Existing `rec:<v>:<mpn>:<hash>` (RECS_CACHE_SCHEMA_VERSION)** — unchanged, still keyed on the full input set, still serves identical-input repeats.

`getRecommendations()` checks the recs cache first (full hit), then the base cache (skip the heavy fetch block, re-run scoring + filters + composite + sort against fresh `effectiveTable`), then falls through to the live pipeline. Re-derived: logic table from cached `sourceAttrs.subcategory`, admin overrides, user effects, context overlay. The base cache turns a context change from 3-8s into ~100-300ms (in-memory rescore).

Implementation moved table-prep (`applyRuleOverrides`, `applyUserEffectsToLogicTable`, `applyContextToLogicTable`) out of the cached fetch block and into the post-base scoring section, since those depend on `userPreferences` / `applicationContext`. Bump `BASE_RECS_SCHEMA_VERSION` when payload shape changes.

### Fix 3 — Deferred parts.io candidate enrichment

The per-candidate parts.io gap-fill loop in [partDataService.ts](../lib/services/partDataService.ts) (`enrichWithPartsio()` over every Digikey candidate, ~20-30 round-trips per search, 500-1500ms total) blocks the response and runs even if the user never opens a single comparison. It was already deferred for batch validation (`skipPartsioEnrichment: true`); now it's deferred for single-part search too.

Mirrors the existing FindChips deferred-enrichment pattern:
1. Initial fast call: `useAppState` passes `skipPartsioEnrichment: true` to `/api/xref/[mpn]` POST. Server scores candidates on Digikey-only attributes and returns immediately.
2. Background follow-up: `triggerPartsioEnrichment()` re-fires the same call without the flag. Server hits the base cache from Fix 2 (so candidates don't re-fetch), runs parts.io enrichment, re-scores, returns updated recs.
3. State replacement: client replaces the recs array in place. Re-fires `triggerFCEnrichment()` afterwards — FC's L1 in-memory cache is warm so the supplier-data merge is effectively free.

Failure modes are strictly no-worse-than-before: Digikey down → no Digikey candidates → enrichment is a no-op; parts.io down → background call errors silently → cards stay on Digikey-only scoring (matches today's parts.io-down behavior). Tradeoff: for ~500-1500ms after first paint, some attribute cells show "review" instead of `pass`/`fail` until enrichment lands, and match % may tick up slightly when it does.

### Files

**Fix 1:**
- [lib/services/manufacturerAliasResolver.ts](../lib/services/manufacturerAliasResolver.ts) — `loadFromL2()`, `writeToL2()`, L2 read in `refreshCache()`, L2 purge in `invalidateManufacturerAliasCache()`.

**Fix 2:**
- [lib/services/partDataService.ts](../lib/services/partDataService.ts) — `BasePayload` / `SerializableBasePayload` types, `buildBaseRecsVariant()`, `serializeBasePayload()` / `deserializeBasePayload()`, base-cache check + `if (!basePayload) { ... }` wrapper around the fetch block, post-base destructuring, table prep moved out of the cached block.

**Fix 3:**
- [app/api/xref/[mpn]/route.ts](../app/api/xref/[mpn]/route.ts) — POST accepts `skipPartsioEnrichment` in body.
- [lib/api.ts](../lib/api.ts) — `getRecommendationsWithOverrides()` and `getRecommendationsWithContext()` accept trailing `skipPartsioEnrichment` parameter.
- [hooks/useAppState.ts](../hooks/useAppState.ts) — call sites in `handleFindReplacements` pass `skipPartsioEnrichment: true`; new `triggerPartsioEnrichment()` callback; `showRecsAndDeferAssessment()` accepts `opts.deferredPartsio` and fires the trigger.

Commit `1ff118a`.

---

## Decision #164 — Distributor Count on Search-Result Cards (Apr 2026)

User wanted to see "available at N distributors" on search-result picker cards so they could pick more confidently. Two coordinated changes:

**L2 distributor-count cache.** In `getFindchipsResults()` ([lib/services/findchipsClient.ts](../lib/services/findchipsClient.ts)) — fire-and-forget L2 write of `{ count }` under `service='findchips', variant='fc-distributors', tier='lifecycle'` (6-month TTL). Distributor *identity* is stable on weeks/months timescale unlike pricing/stock; safe to cache. Respects Decision #158 — only the count integer is persisted, not pricing/stock. New batch reader `getCachedDistributorCounts(mpns)` in the same file. `searchParts()` populates `PartSummary.distributorCount` from L2 after merge, single Supabase round-trip per search. New PartSummary field is optional.

**Post-search progressive enrichment.** Initial design was cache-only (badges only show when warm). User flagged the cold-start problem: people only open parts that show signals like distributor count, so the cache never fills. Reframed to mirror the existing `triggerFCEnrichment` pattern: cards render immediately, then `triggerSearchDistributorEnrichment(messageId, parts)` in [hooks/useAppState.ts](../hooks/useAppState.ts) fires `enrichWithFCBatch` for any MPNs missing `distributorCount`, merges counts into the matching message's `interactiveElement.parts` AND into `state.searchResult.matches` (so the next chat turn carries fresh counts to the LLM). User confirmed FC is uncapped for our scale, so latency is the only concern; FC runs after the search response renders, so search itself is unchanged.

UI in [components/PartOptionsSelector.tsx](../components/PartOptionsSelector.tsx) — small "N distributor(s)" chip rendered when count > 0. Concurrent UI cleanup: removed redundant category chip, repositioned chips so distributor sits between qualifications and dataSource.

Also bumped Digikey keyword search limit 10 → 20 in [lib/services/partDataService.ts:428](../lib/services/partDataService.ts#L428) — typical chat picker now surfaces ~20 results instead of ~10–15.

---

## Decision #165 — Conversational Chat Over Search Results: Refine, Pivot, Ask, Link (Apr 2026)

User wanted to keep talking after picking a part — refining, pivoting to new requirements, asking parametric questions, and clicking MPNs in prose — without the right-side panels staying pinned to the previously-selected source. Single delivery covering four conversational moves.

**Removed `find_replacements` from chat tools.** Cross-reference matching is button-driven (`handleFindReplacements` in `useAppState`); the LLM tool was a footgun that fired cross-refs when users were just asking parametric questions about loaded parts. System prompt now explicitly: "if the user types 'find cross references for X', tell them to click the button — do NOT try to execute the search yourself." See [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts).

**New tools:**
- `present_part_options(mpns)` — re-renders a chosen subset of the current search-result cards. Resolves MPNs against `currentSearchResult.matches` (case-insensitive exact then substring). Populates `data.searchResult` with the filtered list. The existing reset path in [hooks/useAppState.ts:498–506](../hooks/useAppState.ts#L498) clears sourcePart / sourceAttributes / recommendations whenever a fresh `searchResult` arrives — so refining auto-collapses the right panels for free.
- `get_batch_attributes(mpns)` — up to 10 MPNs, concurrency 5, returns compact `{ name, value }` parameter projection per part plus status / qualifications / distributorCount. For compound parametric questions ("which are AEC-Q200 AND ≤30mm?").

**Search-result context injected into LLM.** New `summarizeSearchResults()` helper mirrors `summarizeRecommendations()` — injects MPN list + lightweight params into the last user message when `currentSearchResult.matches.length > 0`. Lets the model reason about "these parts" / "any of these" without re-running search. Threaded through `chatWithOrchestrator` → `/api/chat` → `chat()` → new `searchResultRef` in `useAppState`.

**Inline MPN auto-linking.** [components/MessageBubble.tsx](../components/MessageBubble.tsx) accepts `knownMpns: Set<string>` + `onMpnClick(mpn)`. ReactMarkdown components override (`p`, `li`, `strong`, `em`, `td`) walks string children and replaces known-MPN matches with monospace clickable spans. Only MPNs in the current state's searchResult/recommendations/sourcePart are clickable — no regex over arbitrary text → zero false positives. `knownMpns` computed in [components/AppShell.tsx](../components/AppShell.tsx); `handleMpnClick` in `useAppState` resolves MPN → PartSummary and delegates to existing `handleConfirmPart`. Click is indistinguishable from clicking a card.

**System prompt routing rules** documented as four explicit modes — Refine, Pivot, Ask, Link — with guidance for when each applies. Pivot is mostly prompt work (`search_parts` already exists; the model just needed clear permission to re-search when requirements change rather than trying to filter).

---

## Decision #166 — Manufacturer Profile Tool + General Claim Discipline (Apr 2026)

When users ask about manufacturers ("tell me about ISC", "where is 3PEAK headquartered?", "is GigaDevice public?"), the chat now has a dedicated tool wrapping existing `getProfileForManufacturer()`. Coverage: ~115 Chinese MFRs in Atlas with rich profiles, plus a few Western majors via mock fallback. For everything else (TI, ADI, ON Semi, Vishay, Murata, etc.) the tool returns `{ notFound: true }` and the model is instructed to tell the user plainly that we only carry detailed profiles for Chinese MFRs, then offer the parts/specs/pricing fallback via search.

**Surfaced four additional fields through `mapAtlasToManufacturerProfile()` and the tool projection:** `stockCode`, `websiteUrl`, `contactInfo`, `partsioName`. The Atlas DB row already had them but the canonical `ManufacturerProfile` type dropped them — meaning the LLM literally couldn't see whether GigaDevice was public, and once guessed "Private company" when the row had `stock_code: "603986"`. All four fields added as optional to [lib/types.ts](../lib/types.ts) `ManufacturerProfile`. `contactInfo` typed as permissive union (`string | Record<string, string>`) since Atlas stores as JSONB with varying shapes.

**General claim-discipline rule** (the architecturally important piece). Initial implementation accumulated five+ overlapping rule blocks for one question shape (industry-fitness cert audits): "literal match for ✓", "quote the source", "checklist completeness", "preserve geographic qualifiers", "preserve summary qualifiers", "no unhedged superlatives". User correctly identified the scaling problem — a manufacturer can be asked about in 10–15 distinct shapes (financial, M&A, EOL, leadership, ESG, cyber, etc.) and per-shape patches are a treadmill.

Refactored to one general principle:

> For every specific factual claim about a manufacturer, you MUST be able to point to a backing field in the tool result, or to a verbatim quote from the summary text. If you can't, downgrade to "not in our profile — verify with the manufacturer directly", or phrase as hedged interpretation with one of {*suggests, likely, typically, often, appears to, my read is*}. There is no third option.

This single rule covers cert presence, founder names, HQ, listing status, product lines, geographic claims, financial position, M&A history — and any future claim shape. New question types ride for free.

**One per-shape template kept: industry-fitness cert audit.** Has genuine structural specificity (per-industry checklist of expected certs the user needs comprehensively addressed; gaps are as informative as presence; the list is domain knowledge the model can't derive from data). Per-industry checklists for automotive (ISO 26262, IATF 16949, AEC-Q100/Q101/Q200), medical (ISO 13485, IEC 60601, ISO 14971), aerospace (AS9100, DO-254, DO-160, ITAR), space (ESCC, NASA EEE-INST-002, MIL-PRF, MIL-STD-883), defense (ITAR, MIL-STD-883, DFARS). Bar for adding future templates: question must have (a) implicit completeness requirement and (b) domain-knowledge-derived checklist not derivable from tool data.

**Mandatory tool call rule.** Any MFR-identity question must call `get_manufacturer_profile` first — not allowed to bail out with "I don't have that" before checking. This was the bug that produced the GigaDevice "I don't have founding-year info" failure even though the Atlas row had `founded_year: 2005`.

**Conversation behavior rules** also added: answer-first / drill-second (no leading clarifying questions for opinion-shaped questions), use existing context before re-asking, three-condition test for when to actually clarify first.

Net: ~30% token reduction in MFR profile section vs. peak-patch state, with stronger generalization. Pattern documented for future application to other domains (recommendations, search-result interpretation, list agent).

---

## Decision #167 — UL94 Flammability Logic-Type Fix + Generalized Missing-Attributes Placeholder (Apr 2026)

User reported the missing-attributes prompt was asking for "Flammability Rating (UL94)" with placeholder "Yes or No". UL94 is categorical (V-0 / V-1 / V-2 / HB), not boolean. Two-part fix:

**Root cause: rule mistype in [lib/logicTables/filmCapacitors.ts](../lib/logicTables/filmCapacitors.ts).** The flammability rule was `logicType: 'identity_flag'` (boolean). The form's "Yes or No" placeholder was the system honestly reporting "this rule looks boolean to me." Changed to `identity_upgrade` with `upgradeHierarchy: ['V-0', 'V-1', 'V-2', 'HB']` — V-0 best (least flammable), HB worst. Original-requires-V-0 will now correctly reject HB candidates.

**Generalized the form via plumbing.** [components/MissingAttributesForm.tsx](../components/MissingAttributesForm.tsx) `getPlaceholder()` previously hardcoded attribute names ("Dielectric" → "X7R", "Resistor Type" → "Thick Film"). Now reads the rule's actual `upgradeHierarchy` from `MissingAttributeInfo` and renders `e.g., V-0, V-1, V-2`. Works for any future categorical-upgrade rule without touching the form.

Plumbed `upgradeHierarchy` through:
- [lib/types.ts](../lib/types.ts) — added optional `upgradeHierarchy?: string[]` to `MissingAttributeInfo`.
- [lib/services/matchingEngine.ts](../lib/services/matchingEngine.ts) `detectMissingAttributes()` — surfaces the rule's hierarchy in the returned info object.

User noted this was the third time the bug had been "fixed" — prior attempts only added more hardcoded `attributeName ===` checks in the form. Real root cause (mistyped rule) was never touched. The form now lives off data, not strings.

---

## Decision #168 — Cross-Reference Availability Preflight Gates the "Find cross-references" Button (Apr 2026)

User flow: search for **GD25B127D** (GigaDevice serial flash, Atlas-only, no logic table). The "Find cross-references" button rendered, the user clicked it, and was met with a warning that the matching engine doesn't support Flash Memory. Offering a button that dead-ends at a warning is broken UX — the button must only appear when the recommendation pipeline can actually return something.

**Gate logic.** Show the button iff at least one of:
1. **Logic** — `isFamilySupported(subcategory)` is true (one of the 43 encoded families)
2. **MFR-certified** — admin-uploaded cross-references exist for this MPN
3. **Parts.io-certified** — `extractEquivalentMpns(listing, mpn, 1)` returns ≥1 FFF or Functional Equivalent
4. **Mouser-suggested** — Mouser's `SuggestedReplacement` field is populated (typically on EOL parts)

If all four are false, the button is hidden and the chat message becomes: *"Loaded details for **MPN**. We don't have replacement coverage for this part — no rules table for this category and no certified crosses available."*

**Implementation: server-side preflight rides the existing attribute round-trip.** New `xrefAvailability: { logic, mfrCertified, partsioCertified, mouserSuggested }` field on `PartAttributes`. Computed inside `getAttributes()` after enrichment via the new `attachXrefAvailability()` helper. The two external lookups (`fetchManufacturerCrossRefs`, `getPartsioProductDetails` + `extractEquivalentMpns`) run in parallel via `Promise.all`. Logic and Mouser checks are pure-function / data-already-loaded, so no extra calls. The parts.io listing is L1-cached by the enrichment that just ran, so its check costs ~0ms in the warm case. Cold-cache regression: ~50–200ms (one Supabase query for MFR crosses).

`getAttributes()` was refactored to call `getAttributesRaw()` + `attachXrefAvailability()`, since the function had four successful return paths (Digikey product details, Digikey keyword fallback, parts.io direct, Atlas) — wrapping was cleaner than duplicating the preflight at every return.

**Failure mode is fail-closed per axis.** Each lookup `.catch(() => false)` on its own promise; one source erroring doesn't suppress the others. Net: degrade to "no button" if everything errors, which is no worse than the broken UX we're fixing. A `hasAnyXrefAvailability()` helper in [lib/types.ts](../lib/types.ts) fail-opens for legacy payloads missing the field (so older cached attribute responses keep showing the button rather than going silent on deploy).

**Client wiring** — `presentNextStepChoices()` in [hooks/useAppState.ts](../hooks/useAppState.ts) reads `sourceAttrs.xrefAvailability` via `hasAnyXrefAvailability()` and conditionally constructs the choices array + the chat message text + the conversation-history line.

**LLM orchestrator** — system prompt's "Unsupported families" paragraph in [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) now describes the `xrefAvailability` field and instructs the model to NOT offer cross-references / NOT call get_recommendations when all four flags are false. `get_part_attributes` tool returns the field unchanged (whole `PartAttributes` shape), so MCP server consumers get the signal for free.

**Defensive fallback retained.** The `isFamilySupported()` gate inside `handleFindReplacements` (added the prior turn) stays — if the preflight ever drifts out of sync with the matching engine, the inner gate still catches it before the user sees a recommendation pipeline that can't deliver.

**Verification scenarios:**
- GD25B127D (Flash) → all four flags false → button hidden, explanatory note shown.
- GRM188R71C104KA01D (Murata MLCC) → `logic: true` → button rendered.
- LM358 (TI op-amp) → `logic: true` → button rendered.
- An MPN with only an admin-uploaded MFR cross-ref → `mfrCertified: true` → button rendered.

---

## Decision #169 — Multi-Button Contextual Actions After Part Resolution (Apr 2026)

Decision #168 hid the "Find cross-references" button when no replacement data existed, which fixed the broken click-to-warning UX. The user then pointed out the deeper framing issue: cross-references is one capability among many (specs, supply, manufacturer profile, lifecycle, comparisons) and the post-resolution turn shouldn't lead with it. Pass 1 of the broader rework turns the single button into a small set of contextual action buttons, each gated on whether that capability has actual data behind it.

**Shape change.** `PartAttributes.xrefAvailability` (introduced #168) renamed to `PartAttributes.partCapabilities`. The four xref booleans are now nested under `partCapabilities.replacements`, and `partCapabilities.mfrProfile: boolean` joins as a sibling. Future capabilities (best-price tier coverage, lifecycle data presence, comparison eligibility) ride the same object without breaking shape. `hasAnyXrefAvailability()` removed; replaced by `hasAnyReplacements()` which ORs the four `replacements.*` flags. Same fail-open behavior on legacy/missing payloads.

**Buttons in this pass:**
- **Replacement Options** (renamed from "Find cross-references") — gated on `hasAnyReplacements()`. Action discriminator stays `'find_replacements'` so the existing dispatch wires through unchanged.
- **{Manufacturer}'s Profile** — gated on `partCapabilities.mfrProfile`. Dynamic label ("GigaDevice's Profile", "Murata's Profile"). New action discriminator `'show_mfr_profile'`.

**MFR profile preflight.** Inside `getAttributes()`, the existing `attachXrefAvailability()` helper (renamed `attachPartCapabilities()`) gained a third parallel branch: `getProfileForManufacturer(part.manufacturer)` checked for non-null. The function has a 5-min module-scope cache and routes through `resolveManufacturerAlias()` — Atlas MFRs return rich profiles, Western MFRs without an Atlas record OR mock fallback return null. The non-null gate is exactly the user's "Atlas part with profile filled out" requirement; mock fallbacks (a few Western majors with hand-curated entries) also pass, which is the right behavior.

> **Amended (Jun 17, 2026):** the `mfrProfile` gate is now **Atlas-only** — `attachPartCapabilities()` requires `r.source === 'atlas' && hasEnrichedProfileContent(r.profile)`. Mock/Western fallbacks **no longer** light the button. Surfacing "TDK's Profile" for a Western part contradicted Decision #166's stance ("we only carry detailed profiles for Chinese MFRs") and either opened a thin mock panel or implied coverage we don't have. The flag still flows into the LLM's `partCapabilities` context, so the model also stops offering Western profiles in prose. One-line change in [lib/services/partDataService.ts](../lib/services/partDataService.ts) (`attachPartCapabilities`, the `mfrProfile` branch).

**Cold-cache regression: ~50–150ms** (one Supabase query). Warm: ~0ms. Total preflight cost vs. baseline: still well under the 200ms budget set in #168.

**Multi-button rendering.** Already worked — `components/ChoiceButtons.tsx` uses `Stack direction="row"` with `flexWrap: 'wrap'`. Two or three buttons render as a horizontal row with no UI changes. Verified by inspection.

**Click dispatch lives in two places.** `useAppState` doesn't (and shouldn't) know about `useManufacturerProfile`; the panel hook is composed at `AppShell`. Click flow:
1. `ChoiceButtons.onSelect` → `AppShell.handleChoiceSelectWithMfr` (new wrapper).
2. Wrapper checks `choice.action === 'show_mfr_profile'`; if so, calls `mfr.handleManufacturerClick(state.sourcePart.manufacturer)` to open the side panel.
3. Wrapper then delegates to `appState.handleChoiceSelect` regardless, so the chat-message side (user message + history note) happens in `useAppState` as it does for every other action.
4. `useAppState.handleChoiceSelect` has a no-op-ish branch for `'show_mfr_profile'` that adds the chat message and returns — no LLM round-trip needed since the panel itself is the answer.

**Message wording** updated to match the user's mockup: *"Got it — loaded the basics for **MPN**. What would you like to explore?"* Same in both have-buttons and no-buttons branches; button presence is the only signal.

**LLM orchestrator** — system prompt's "Unsupported families" section reframed as "Unsupported families and capability awareness". References `partCapabilities` instead of `xrefAvailability`, and adds: when `mfrProfile` is false, decline plainly rather than calling `get_manufacturer_profile` (avoids notFound round-trips for Western MFRs).

**Out of scope (Pass 2):** Best Spot Price button — needs a quantity-prompt sub-flow (chip selector + free-text), best-price compute across `supplierQuotes`, Commercial-tab activation, and inline price answer rendering. If the user doesn't supply a quantity (asks something else instead), the next message is treated as a fresh prompt rather than locking them into the price flow.

**Files touched:**
- [lib/types.ts](../lib/types.ts) — rename + restructure + new helper + extend `ChoiceOption.action` union.
- [lib/services/partDataService.ts](../lib/services/partDataService.ts) — rename helper + add MFR profile branch.
- [hooks/useAppState.ts](../hooks/useAppState.ts) — rebuild `presentNextStepChoices()` + add `'show_mfr_profile'` branch in `handleChoiceSelect`.
- [components/AppShell.tsx](../components/AppShell.tsx) — wrap `handleChoiceSelect` to also trigger the MFR panel for `'show_mfr_profile'`.
- [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) — system prompt reframe.
- [docs/API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md) — field rename + table extension.

---

## Decision #170 — Best Spot Price as a First-Class Chat Action (Apr 2026)

Pass 2 of the contextual-actions rework. The third button — "Best Spot Price" — joins MFR Profile and Replacement Options after part resolution, gated on `partCapabilities.bestPrice` (true when any supplier quote has price-break data). Unlike the other two buttons, this one drives a multi-step sub-flow because pricing is quantity-dependent.

**Flow:**
1. User clicks **Best Spot Price**. Agent posts a chat message: *"What quantity? Pick a common tier or type a custom number."* with a new `quantity-prompt` interactive element rendering chips [1, 10, 100, 1K, 10K, 100K] + a numeric text input + Submit.
2. User picks a chip OR types a number and submits. The prompt locks (chips + input become non-interactive, opacity-dimmed) so it can't be re-fired.
3. `computeBestPrice(supplierQuotes, qty)` runs in-process — no network call. For each supplier, it picks the highest price-break tier whose `quantity` floor is ≤ requested qty (standard distributor pricing semantics), then ranks suppliers by resulting unit price.
4. Agent posts the answer:
   > *At qty **100**, best spot price is **$0.42/each from LCSC** (total $42.00).*
   > *Other options: Mouser $0.48 · Digikey $0.52 · Arrow $0.55*
   > *See the **Commercial** tab for the full quote list.*
5. The right panel auto-switches to the Commercial tab so the user sees the full quote table without an extra click.

**Fallback path: requested qty < every supplier's MOQ.** Surfaces the cheapest over-minimum option with a Yes-button:
> *Lowest available is qty **10** from **LCSC** at **$0.50** each. Want me to price that instead?*
> [ Yes — price at qty 10 ]

Yes-button uses a new action discriminator `'best_price_at_qty'` with `quantity` embedded in the `ChoiceOption`. Re-runs `computeBestPrice` at the bumped qty.

**If user types in the main chat input instead of using the prompt** — falls through to normal search/LLM flow. The stale prompt remains in chat history but is harmless. No phase-machine intercept needed; the prompt is purely opt-in.

**Tab state lifted to `useAppState`.** Was local `useState` in `DesktopLayout` — chat handlers couldn't touch it. New `activeAttributesTab` field on `AppState` + `setActiveAttributesTab` setter exposed from the hook. `DesktopLayout` accepts it as optional props with a local-state fallback that preserves the prior MPN-change reset behavior. `AttributesTab` type moved from `DesktopLayout.tsx` to `lib/types.ts`.

**Compute helper in [lib/services/bestPriceCalculator.ts](../lib/services/bestPriceCalculator.ts).** Pure function, fully tested (10 cases — match path, fallback path, tier selection, top-3 cap, empty quotes, non-positive qty, currency formatting). Returns a discriminated union `BestPriceResult` with `kind: 'match' | 'fallback' | 'none'` so the renderer pattern-matches without optional-field guesswork. Currency comes from each `PriceBreak.currency` (already correct since FC fetches honor the requested currency parameter). `formatPrice()` uses `Intl.NumberFormat` with 4 decimals for sub-$1, 2 decimals otherwise; falls back to bare `toFixed` on bad currency codes.

**New types:**
- `partCapabilities.bestPrice: boolean`
- `ChoiceOption.action`: + `'show_best_price' | 'best_price_at_qty'`
- `ChoiceOption.quantity?: number` (carries the fallback qty for `'best_price_at_qty'`)
- `InteractiveElement`: + `{ type: 'quantity-prompt'; presets: number[]; status: 'pending' | 'submitted' }`

**New component: [components/QuantityPrompt.tsx](../components/QuantityPrompt.tsx).** Chips + numeric `TextField` + Submit button. Numeric-only via inputMode and a regex strip on input change. Disables on `status === 'submitted'`.

**Files touched:**
- [lib/types.ts](../lib/types.ts), [lib/services/partDataService.ts](../lib/services/partDataService.ts) — preflight + types.
- [lib/services/bestPriceCalculator.ts](../lib/services/bestPriceCalculator.ts) — new.
- [components/QuantityPrompt.tsx](../components/QuantityPrompt.tsx) — new.
- [components/MessageBubble.tsx](../components/MessageBubble.tsx) — render new interactive type.
- [components/ChatInterface.tsx](../components/ChatInterface.tsx), [components/DesktopLayout.tsx](../components/DesktopLayout.tsx), [components/MobileAppLayout.tsx](../components/MobileAppLayout.tsx), [components/AppShell.tsx](../components/AppShell.tsx) — prop plumbing.
- [hooks/useAppState.ts](../hooks/useAppState.ts) — tab state + dispatch + render helpers.
- [docs/API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md) — `bestPrice` field row.
- [__tests__/services/bestPriceCalculator.test.ts](../__tests__/services/bestPriceCalculator.test.ts) — 10 unit tests.

**Verification scenarios:**
- **Murata MLCC (rich FC coverage)** → all three buttons. Click Best Spot Price → prompt → pick 1000 → agent posts headline with cheapest distributor + top 3 + tab pointer. Commercial tab opens.
- **Custom qty input (e.g., 5000)** → submit triggers same flow.
- **Qty below all MOQs** (rare in practice — most distributors carry qty 1) → fallback Yes-button appears, click it → re-priced at min qty.
- **Part with no FC quotes** → button hidden via `bestPrice: false`.
- **Tab switch** — verify Commercial tab activates (especially when previously on Specs or Overview).

---

## Decision #171 — Origin Filter (`mfr_origin_filter`) for Recommendations Panel (May 2026)

User asked the chat for "Chinese replacements" and the panel kept showing Western MFRs. The recommendation pipeline already populated `XrefRecommendation.part.mfrOrigin` (`'atlas' | 'western' | 'unknown'`) for every rec via the manufacturer alias resolver (Decision #161), but the filter pipeline had no origin field and the pattern detector had no Chinese-aware patterns. Same shape as the existing manufacturer / status / match-% / qualification / category filters — pure extension.

**Filter input.** `FilterInput.mfr_origin_filter?: 'atlas' | 'western'` added to [recommendationFilter.ts](../lib/services/recommendationFilter.ts). Predicate is a one-liner: `r.part.mfrOrigin === target`. Pure addition, no callers touched.

**Detector.** New `detectOriginIntent()` in [filterIntentDetector.ts](../lib/services/filterIntentDetector.ts), wired into the priority chain BEFORE `detectManufacturerIntent` (origin is a more specific signal than fuzzy MFR-name token matching). Patterns:
- Atlas: `\b(chinese|china|prc|mainland|asian|asia)\b` plus `\b(made|from|sourced)\s+in\s+china\b`
- Western: `\b(western|american|european)\b` plus `\bnon[\s-]?chinese\b`
- Western checked FIRST so "non-chinese" / "non chinese" doesn't get swallowed by the bare `\bchinese\b` atlas pattern.

**No filter-verb requirement.** Origin words ("Chinese", "Asian", "Western") are inherently narrowing in this product context — no one asks "is this part Chinese?" of a recommendations panel; they say it because they want to see only those. Cheaper false positives than missed matches.

**LLM tool parity.** `filter_recommendations` JSON schema in [llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) extended with `mfr_origin_filter` enum so LLM-routed filter calls (e.g., "now narrow to American") have schema parity with the deterministic intercept.

**Out of scope.** Country-level granularity ("Japanese only", "German only") needs data-layer work on `manufacturerAliasResolver` to surface country per alias row; `mfrOrigin` is binary atlas/western today.

**Verification:**
- "show only Chinese" / "Asian alternatives" / "made in China" / "from China" → `mfr_origin_filter: 'atlas'`
- "Western only" / "non-Chinese" / "American replacements" → `mfr_origin_filter: 'western'`
- 24 new tests in [filterIntentDetector.test.ts](../__tests__/services/filterIntentDetector.test.ts).

**Files touched:**
- [lib/services/recommendationFilter.ts](../lib/services/recommendationFilter.ts) — `FilterInput` field + predicate.
- [lib/services/filterIntentDetector.ts](../lib/services/filterIntentDetector.ts) — `detectOriginIntent` helper + chain wire.
- [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) — tool schema + system-prompt mention.
- [__tests__/services/filterIntentDetector.test.ts](../__tests__/services/filterIntentDetector.test.ts) — origin describe block.

---

## Decision #172 — Bundled-Search-Intent Routing: Carry Filter Through Auto-Fire + Fix Stale-Closure on `handleFindReplacements` (May 2026)

User typed "I want to find me Chinese replacements for this part from Wurth: 860020672005" as a fresh search. Three bugs in one query:

1. **LLM speculated about MFR coverage before recs existed.** Sonnet read the bundled query, the search results, and wrote prose listing fictional candidates ("Capxon, Lelon, Rubycon all make 1µF/50V radials") without ever running the matching engine.
2. **Origin qualifier was lost between search-time intent detection and post-confirm intent dispatch.** `detectQueryIntent` correctly returned `'find_replacements'` and stashed it into `pendingIntent` for auto-fire. But on the auto-fire path (`tryAutoFireIntent` → `dispatchIntent('find_replacements', ..., 'fresh')`), the original query string was never stashed into `pendingPostRecsFilterRef` — only the followup-query path did that. So even when the user clicked the right card and recs loaded, the "Chinese" qualifier silently dropped.
3. **`handleFindReplacements` froze silently on the auto-fire path.** Same shape as the Decision #155 stale-closure trap. `handleConfirmWithLLM` did `setState({sourcePart: part})` then awaited attribute fetch then synchronously called `dispatchIntent → handleFindReplacements`, which read `state.sourcePart` / `state.sourceAttributes` from its captured closure — both `null` at click time, before the setState flushed. Function bailed at the `if (!mpn || !sourceAttrs) return;` guard with no message, no error, no recs — chat appeared frozen at "Fetching technical attributes…".

**Three fixes:**

**1. Replacement-coverage discipline rule (LLM prompt).** Added one general anti-speculation rule to the system prompt parallel to the source-part discipline rule: never list hypothetical candidate MPNs/MFRs, never speculate about Atlas/Digikey/Mouser coverage, never characterize the request as "challenging" before the matching engine has run. Calls out the bug-exact fabrications (Capxon/Lelon/Rubycon naming) as not-acceptable examples. General enough to cover all bundled-intent variants (origin, MFR, qualification, category).

**2. `pendingIntentQueryRef`.** Mirror of `pendingIntent` that captures the user's original query string at search time. When `tryAutoFireIntent` fires `find_replacements`, it stashes the captured query into `pendingPostRecsFilterRef` so the existing `showRecsAndDeferAssessment` filter consumer applies any bundled qualifier ("Chinese", "≥80%", etc.) once recs land. Cleared in reset paths alongside `pendingPostRecsFilterRef`.

**3. `partOverride` parameter on `handleFindReplacements`.** Mirrors the existing `contextOverride` workaround from Decision #155 but for `sourcePart` / `sourceAttributes`. `dispatchIntent` passes `{ mpn, sourceAttributes }` explicitly; the function falls back to state reads only when no override is supplied. Also pre-primes `sourceAttributesRef.current` synchronously before `handleFindReplacements` runs (the `useEffect` mirror lags by one render and is read by downstream paths).

**Lesson — same shape, same trap.** Any callback that does `setState` then synchronously calls another callback that reads from the same state hits this. Decision #155 fixed it for `applicationContext`; this fix extends the pattern to `sourcePart` / `sourceAttributes`. Future callsites with the same shape should accept explicit overrides instead of relying on state propagation.

**Files touched:**
- [hooks/useAppState.ts](../hooks/useAppState.ts) — `pendingIntentQueryRef` declaration + intent-stash + auto-fire consume + reset cleanup; `handleFindReplacements` `partOverride` parameter; `dispatchIntent` sync-prime + override pass.
- [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) — Replacement-coverage discipline section in `buildSystemPrompt`.

---

## Decision #173 — Kill the Post-Recs LLM Assessment, Replace with Deterministic Summary (May 2026)

After Decisions #171 and #172 shipped, recs filtered correctly to Atlas-MFR cards. But the LLM-driven engineering assessment that fired immediately after recs landed kept fabricating MFR origin / cert / supply-chain prose:

> *"CapXon (multiple SKUs in the 80–95% range)… Lelon (85–92%)… Rubycon (Japanese-origin but deep China manufacturing footprint; 80%+ matches available)… All candidates pass AEC-Q200… Lead time and stock depth favor CapXon and Lelon given broader distributor reach in your region."*

Actual top 3: SPZ1HM470E08000RAXXX (68%), ERH2GM100G16OT (66%), ENB1JM331W20OT (66%). Match percentages, MFR identities, geographic claims, cert claims, supply-chain claims — all fabricated.

**Three rounds of escalating prompt rules failed to hold:**
1. Decision #166's general claim-discipline rule.
2. Pre-recs Replacement-coverage discipline (Decision #172) — scoped to "no recs in context"; LLM (correctly) read that as "post-recs is fair game".
3. Post-recs Recommendation-block factual discipline + handing the LLM the filtered slice — failed within minutes; Sonnet's prior on "Chinese capacitor MFRs" overrode the rule.

**Decision: pull the LLM out of this code path entirely.** The cards already display every fact the assessment legitimately conveys — MPN, MFR, match %, lifecycle, distributors, AEC badges, FindChips supplier data. Every time the LLM tried to add value beyond that (supply chain, cert coverage, origin, market positioning), it made things up.

**Implementation.** New pure helper `buildRecsSummary(recs, sourceMpn)` in [lib/services/recommendationSummary.ts](../lib/services/recommendationSummary.ts). Reads only `part.{mpn, manufacturer}`, `matchPercentage`, and `countRealMismatches()`. By construction it cannot fabricate anything that isn't on a card the user can see. Output shape:

> *Found **7** replacement candidates for **860020672005**. Top match: **SPZ1HM470E08000RAXXX** — CapXon, 68% match. 3 pass all rules; 4 flagged for parameter mismatches — review per-card spec match before committing.*

`showRecsAndDeferAssessment` in [useAppState.ts](../hooks/useAppState.ts) now calls `addMessage('assistant', buildRecsSummary(...))` instead of `chatWithOrchestrator(...)`. Also dropped the user-role conversation-history trigger (it was bait for the now-removed LLM call). Skipped when a bundled filter matched (`dispatchFilterIntent` already posts an equivalent "Filtered to N <label> replacements + Top picks" message).

**LLM still owns user-driven follow-ups.** The other `chatWithOrchestrator` call site in `useAppState` (handleSearchWithLLM, line ~948) remains — it handles filter intents, parametric questions, MFR-profile lookups, and any other follow-up Q&A. The system-prompt discipline rules from prior passes still apply there.

**Lesson.** When (a) an LLM has strong domain priors on the topic, AND (b) the underlying facts already live on UI elements the user can see, prompt-tightening is the wrong tool. Deterministic templates win — they cannot fabricate by construction, they're testable in isolation, and the chat-stream loses no real signal because the cards were always the source of truth. Reach for LLM prose only when (a) the data isn't already rendered, or (b) the response truly requires natural-language synthesis the user couldn't get from the data alone. The post-recs assessment satisfied neither.

**Files touched:**
- [lib/services/recommendationSummary.ts](../lib/services/recommendationSummary.ts) — new pure helper.
- [hooks/useAppState.ts](../hooks/useAppState.ts) — `showRecsAndDeferAssessment`: drop LLM call + trigger push, add deterministic summary.
- [__tests__/services/recommendationSummary.test.ts](../__tests__/services/recommendationSummary.test.ts) — 7 tests (empty, single, all-pass, mixed pass/fail, N/A handling, rounding, pluralization).

**Verification:**
- Unfiltered flow → chat shows the deterministic summary, no MFR/cert/origin/supply-chain prose.
- Bundled-filter flow → only `dispatchFilterIntent` "Filtered to N <label>" message appears.
- Follow-up Q&A still routes through LLM with system-prompt discipline (unchanged).
- 1511 tests pass (+7 new).

## Decision #174 — Atlas Re-Ingest Pipeline: Provenance + Batch Review + AI Dictionary Triage (May 2026)

**Problem.** Each fresh `mfr_*_params.json` from the data team had three sharp edges that made repeated refreshes risky: (1) the upsert overwrote `parameters` JSONB wholesale, wiping previously LLM-extracted attrs; (2) there was no pre-ingest preview — only `--dry-run --warnings` stderr; (3) there was no surgical rollback. With 100s of MFRs in flight, this couldn't scale.

**Decision.** Built a three-phase pipeline that makes Atlas re-ingest a routine operation with per-MFR diff reports, batch-level approve/revert, and AI-assisted dictionary mapping for unmapped Chinese params.

### Phase 1 — Safety foundation (CLI)

- **Provenance-tagged JSONB**: every `parameters` value now carries `{ value, numericValue?, unit?, source: 'atlas' | 'extraction' | 'manual', ingested_at }`. Re-ingest only touches `source: 'atlas'` entries — LLM-extracted and (future) manual edits survive. `mergeAtlasParameters()` enforces the rule.
- **`atlas_ingest_batches` table**: per-MFR pending batch with full structured `IngestDiffReport` JSONB (product counts, attr changes, unmapped params, classification flips, family counts). Generated `risk` column drives triage: `clean | review | attention`.
- **`atlas_products_snapshots` table**: pre-apply row snapshots with 30-day TTL. Per-batch `--revert` restores from these.
- **CLI modes** in `scripts/atlas-ingest.mjs`: `--report` (no DB write, just batch row), `--proceed <batchId>`, `--proceed-all-clean`, `--revert <batchId>`, `--discard <batchId>`, `--list-pending [--summary]`, `--regenerate-affected-by <paramName>`.
- **Provenance-preserving merge upsert**: existing extraction/manual-tagged attrs preserved; atlas attrs replaced wholesale. Removed-from-new-file products soft-delete (`status='discontinued'`) when extraction attrs exist, hard-delete when only atlas attrs.
- **Multi-key MFR lookup** (`lib/services/atlasIngestService.ts → loadManufacturerLookup`): handles ID-space mismatch between the data team's filename `mfr_id` and the master `atlas_manufacturers` master list — falls through name_display → atlas_id → name_en → slug.
- **Bulk DB ops**: snapshots/upserts chunked to 500/op, deletes via `.in('mpn', [...])` chunked to 200, took the YANGJIE revert from 10+ minutes to ~30 seconds.

### Phase 2 — Admin UI

- **`/admin/atlas/ingest`** (`AtlasIngestPanel.tsx` + `components/admin/atlasIngest/*`): drag-drop folder upload, aggregate dashboard with risk chips, "Proceed All Clean" bulk-apply, per-batch cards (collapsed for clean/review, expanded for attention), Applied tab with revert action.
- **API routes** under `/api/admin/atlas/ingest/`: `upload`, `report`, `batches`, `batches/[batchId]` (GET/DELETE for discard), `batches/[batchId]/proceed`, `batches/[batchId]/revert`, `batches/[batchId]/regenerate`, `proceed-all-clean`. All admin-guarded. Each wraps `runIngestScript()` to spawn the CLI under the hood.
- **New-MFR auto-registration**: filename parser (`parseAtlasFilename`) extracts `atlas_id`, `name_en`, `name_zh`, `name_display`, `slug`. UI surfaces a "New manufacturers detected" panel before report generation; user reviews/edits/confirms, then files join the regular batch flow.
- **`next.config.ts`**: `experimental.proxyClientMaxBodySize: '256mb'` (Next.js 16 — replaces deprecated `middlewareClientMaxBodySize`) for folder-upload sizes.

### Phase 3-A — AI dictionary triage

When the unmapped-params list crosses ~50 entries, hand-mapping doesn't scale. Built an AI-assisted triage step inside the global unmapped-params table:

- **`/api/admin/atlas/dictionaries/suggest`** (Claude Haiku): given a Chinese param name + sample values + family schema, returns `{ translation, suggestedAttributeId, suggestedAttributeName, suggestedUnit, confidence, reasoning }`. Critical fix: Haiku occasionally wraps JSON in markdown fences — strip before parsing. In-memory cache keyed `${familyId}::${paramName}` with 24h TTL.
- **`/api/admin/atlas/family-schema`**: lightweight endpoint returning canonical attributeId list per family (no Anthropic call) — used as fallback so the canonical-vs-invented indicator works on already-cached suggestions.
- **`GlobalUnmappedParamsTable.tsx`**: three caching layers (client localStorage 7d, server in-memory 24h, Anthropic API), concurrency-limited fan-out (4 suggestion fetches + 4 accept fetches). Suggestions hydrate from localStorage first, then fetch missing.
- **Canonical-vs-invented indicators (Option A)**: Each suggested attributeId is checked against the family's canonical schemaIds. Canonical → green `VerifiedOutlinedIcon`; invented → amber `HelpOutlineOutlinedIcon` + amber TextField border. `isBulkEligible` excludes invented IDs from the bulk-accept button.
- **Embed-in-batch-card mode**: when only one pending batch exists, `GlobalUnmappedParamsTable` renders inside that batch's `BatchCard` body (via `embeddedTriagePanel` prop) instead of standalone — keeps the unmapped section visually attached to the MFR it belongs to.
- **Hydration error fix**: MUI `AccordionSummary` renders as `<button>`; the bulk-accept Button got nested inside it. Moved into `AccordionDetails` to fix.

### Option 2 — Ingest + read consult `atlas_dictionary_overrides`

The architectural gap discovered after Phase 3-A landed: accepting an AI-suggested mapping wrote a row to `atlas_dictionary_overrides`, but neither the ingest script nor the read path consulted that table. Overrides were inert until manually copied into `FAMILY_PARAMS` source code.

- **Ingest path** (`scripts/atlas-ingest.mjs`): new `loadAndApplyDictOverrides()` runs once at the dispatcher entry point. Fetches `where is_active=true`, mutates `FAMILY_PARAMS` and `L2_PARAMS` in memory using the same remove → modify → add order as `applyDictOverrides()` in atlasMapper.ts. Logs `Loaded N overrides (add: X, modify: Y, remove: Z)`. Safe no-op when supabase is null (`--dry-run`).
- **Read path** (`lib/services/atlasMapper.ts`, `atlasClient.ts`, `atlasDictOverrides.ts`): new `fetchAllDictOverrides()` (60s in-memory cache, cleared by existing `invalidateDictOverrideCache()` hooks). `fromParametersJsonb` accepts an optional `overrides: DictOverrideRow[]` and seeds the `nameLookup` map first so admin-curated names win over logic-table defaults. `getAtlasAttributes` and `fetchAtlasCandidates` prefetch overrides once and pass through `rowToPartAttributes`.
- **Most useful when**: AI-suggested attributeId isn't in any logic table or shared dict. Without override consult, `fromParametersJsonb` falls back to `humanizeStem('funky_id')` and `recognized: false`. With it: nice display name + `recognized: true`.

### Cache invalidation fix

The new ingest API routes (`proceed`, `proceed-all-clean`, `revert`) initially didn't call `invalidateAtlasCache()` or `invalidateManufacturersListCache()`, so the admin Atlas MFRs panel kept serving stale `admin_stats_cache` rows after every UI-driven apply. The CLI script also only cleared `atlas-coverage`, not `manufacturers-list`. Both now clear both keys on every successful proceed/revert. Hand-off: any other write path that mutates `atlas_products` should mirror this (e.g. `atlas-extract-descriptions.ts`, `atlas-clean-descriptions.ts` already do).

**Files touched:**
- New SQL: `scripts/supabase-atlas-ingest-pipeline-schema.sql`.
- Updated CLI: `scripts/atlas-ingest.mjs` (provenance merge, batch report, snapshot+revert, `loadAndApplyDictOverrides`, dual cache key invalidation).
- New service: `lib/services/atlasIngestService.ts` (filename parser, MFR lookup, script-runner wrapper).
- Updated mapper: `lib/services/atlasMapper.ts` (provenance shape, `mergeAtlasParameters`, `applyDictOverrides`, `fromParametersJsonb` overrides param).
- Updated client: `lib/services/atlasClient.ts` (prefetch overrides for read path).
- Updated overrides service: `lib/services/atlasDictOverrides.ts` (added `fetchAllDictOverrides` + all-cache invalidation).
- New API routes: `app/api/admin/atlas/ingest/upload`, `report`, `batches`, `batches/[batchId]`, `batches/[batchId]/proceed`, `batches/[batchId]/revert`, `batches/[batchId]/regenerate`, `proceed-all-clean`, `app/api/admin/atlas/family-schema`, `app/api/admin/atlas/dictionaries/suggest`.
- New UI: `app/admin/atlas/ingest/page.tsx`, `components/admin/atlasIngest/*` (AtlasIngestPanel, BatchCard, IngestUploader, IngestDashboard, GlobalUnmappedParamsTable, ProductDiffTable, BatchProgressDialog, types.ts).
- `next.config.ts` body-size cap.

**Deferred:** SCR/Modules classifier fix — 316 YANGJIE thyristor modules currently uncovered due to `!lower.includes('module')` exclusion at line 124 of `atlas-ingest.mjs`. Listed in BACKLOG.md.

**Verification.** End-to-end: YANGJIE 12,932 products applied via UI; provenance preserved across re-ingest of older MFRs; AI dict triage cuts unmapped params from 286 → 196 in one pass; tests stay green at 1521.

---

## Decision #175 — Atlas: Parameter-Aware Family Reclassification for Misfiled Diodes (May 2026)

While reviewing the unmapped-params admin panel, user found 5,381 products listed as **B1 Rectifier Diodes** carrying a `Type` parameter with values `Bi` / `Uni` / `Regulator` — clear signatures of B4 TVS Diodes (polarity) and B3 Zener Diodes (voltage regulator), respectively. Root cause: `classifyAtlasCategory(c1, c2, c3)` in [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) decides family at ingestion using only the c3 string (check order `tvs → zener → bridge → generic-rectifier`). Anything whose c3 contains "rectifier" but lacks the keywords "tvs"/"zener"/"bridge" falls into B1 by default — a TVS product whose c3 says "Rectifier Diode" lands in B1 silently. The B4 polarity dictionary entry exists but is consulted *after* classification, never feeding back into family selection.

**Fix — parameter-aware post-classification step.** New helper `reclassifyByParameterSignals(initial, parameters)` in [atlasMapper.ts](../lib/services/atlasMapper.ts) runs after `classifyAtlasCategory` and re-routes B1 products with telltale `Type` values:

- `Bi` / `Uni` / `Bidirectional` / `Unidirectional` → B4 TVS Diodes
- `Regulator` / `Voltage Regulator` → B3 Zener Diodes

Conservative by design: only fires from B1, only on those exact patterns, ignores all other Type values (Standard / Fast / Ultrafast / blank — legitimate B1 rectifiers untouched). Mirrored verbatim into the standalone ingest script [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) since it carries its own classifier copy. Wired into both `mapAtlasModel()` (the runtime path) and the script's `mapModel()` (offline path).

**Dictionary backstop.** Added minimal English `'type'` + Chinese `'类型'` entries to both B3 (→ `_type` deprioritized — value is informational on a Zener, the family already implies regulator behavior) and B4 (→ `polarity` — primary attribute, feeds the matching engine) dictionaries. Without these, reclassified products would land in the right family but their Type parameter would still be unmapped at read time.

**Retroactive script.** New [scripts/atlas-reclassify-by-type-param.mjs](../scripts/atlas-reclassify-by-type-param.mjs) — dry-run by default, `--apply` commits, idempotent (second pass is a no-op). Pages through `atlas_products WHERE family_id='B1'` in chunks of 1000, applies the same helper to JSONB parameters, batch-updates `family_id` / `category` / `subcategory` in chunks of 500.

**Surprise from the dry run.** Scanned 10,475 B1 products in `atlas_products`, found **zero** matches — none of the live products have `Type` values in our reclassification set. The 5,381 misclassified products visible in the admin panel are sitting in **pending ingest batches** ("Unmapped parameters: 211 unique across 2 pending batches" — the panel reads from batch snapshots, not the merged table). When those batches get applied via the admin UI, the new ingest-time correction will route them to B3/B4 automatically. The retroactive script stays in the codebase as a safety net for any future drift between batch processing and the live table.

**Lesson.** Family classification with no feedback loop from extracted parameters is brittle. The c3 string is a noisy signal — Atlas source data uses inconsistent naming ("Rectifier Diode" can be a TVS, a Zener, or an actual rectifier). Adding a narrow post-classification correction step is cheap, conservative, and grows naturally as we discover new signal/family mismatches. When the rule list grows past ~5 entries, lift to a structured rule table; until then the if-tree is more readable than the abstraction.

**Out of scope.** Other suspected misclassifications (Op-Amps vs Logic ICs, voltage regulator type confusion, scattered TVS products under different c3 strings) — each needs its own audit query + classification rule. Defer until the framework proves out on this case.

**Files touched:**
- [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) — `reclassifyByParameterSignals` helper, call site in `mapAtlasModel()`, B3 + B4 dictionary `type`/`类型` entries.
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — mirrored helper + call site.
- [scripts/atlas-reclassify-by-type-param.mjs](../scripts/atlas-reclassify-by-type-param.mjs) — new retroactive DB fixer.
- [__tests__/services/atlasMapper.test.ts](../__tests__/services/atlasMapper.test.ts) — 9 unit tests (empty, blank, Bi/Uni/Bidirectional/Unidirectional → B4, Regulator/voltage regulator → B3, Chinese key parity, case insensitivity, B1-only gating, first-match semantics).

**Verification.** Tests green at 1530 (+9 new). Dry run on prod confirms zero existing-DB matches (validating the "fix is forward-looking" interpretation). Pending-batch behavior verifies on the next ingest run via the admin UI — the panel's `Type → Bi/Uni/Regulator` rows under B1 should disappear (or move to B3/B4 with the new dictionary mappings).

**Adjacent UI polish (not arch-worthy on their own, recorded for completeness).** Same session, [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) gained: `tableLayout: 'fixed'` with explicit widths on every header AND body cell (column widths weren't being honored because the table was running on auto-layout); `fullWidth` on the attributeId / attributeName / Unit TextFields (so they fill their cells); a new "Category" column showing the human-readable family name via a new `getFamilyDisplayName(familyId)` helper (truncated at em dash / parens, full name on tooltip hover). Backlog entry added for a per-row "Search the web" research helper.

---

## Decision #176 — Persistent Dictionary Triage Queue with MFR Provenance + Operator/Engineer Role Split (May 2026)

After Decision #174 shipped the Atlas re-ingest pipeline, the unmapped-params triage UI was an `<Accordion>` embedded inside the Atlas Ingest page that aggregated only PENDING batches. Two structural problems for an admin who wants to delegate dictionary mapping to a hardware engineer: (a) once the operator clicked Proceed, that batch's unmapped params disappeared from the list — no persistent queue across batch lifecycle — and (b) the editor was always next to the upload UI, no separation between operator (uploads + applies) and engineer (reviews + maps) roles. Plus the row data tracked `affectedBatchIds` but never surfaced manufacturer names to the engineer doing research.

**Decision: lift the triage into its own admin section with persistent queue semantics, MFR provenance per row, and remove edit power from the Ingest page (Model 3).**

**Persistent queue.** [/api/admin/atlas/ingest/batches](../app/api/admin/atlas/ingest/batches/route.ts) was rewritten so the unmapped-params aggregation is **independent** of the batch-list status filter. The batch list still defaults to `status='pending'` (operator-facing dashboard counters), but the queue source query pulls `IN (pending, applied)` and filters out anything covered by an active dictionary override (`atlas_dictionary_overrides WHERE is_active=true`, keyed `${family_id}:${param_name}`). Net effect: rows survive batch apply and only leave the queue when an override resolves them. The `report.unmappedParams` JSONB was already persistent on every batch row — only the API filter was hiding it after apply. **No new table** required.

**MFR provenance.** `GlobalUnmappedParam` extended with `affectedManufacturers: Array<{slug, name, productCount}>`, populated by joining batch.manufacturer against `atlas_manufacturers.name_display → slug` (with a `slugifyName()` fallback for unregistered MFRs). Surfaced in the Prods column as a count + MFR list with hover-tooltip breakdown. Engineer doing research now knows whether "Type / 5,381 prods" came from one MFR or twelve.

**Dedicated workspace.** New admin section `'atlas-dict-triage'` rendered by [components/admin/AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx). Same `GlobalUnmappedParamsTable` component lifted from inside the Ingest page, fed by the same batches endpoint with optional `?batch=<id>` query param to scope to one batch. Sidebar nav entry "Dictionary Triage" with `AssignmentLateOutlinedIcon` placed under the Atlas section. Engineer bookmarks this URL.

**Operator/engineer role split (Model 3).** [AtlasIngestPanel.tsx](../components/admin/atlasIngest/AtlasIngestPanel.tsx) and [BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) **no longer mount the editor**. They now render read-only summaries:
- Top-of-page amber alert: "N unmapped parameters across pending batches need engineer review. [Open Dictionary Triage →]"
- Per-batch card: "N unmapped parameters in this batch · sample names: a, b, c · [Review in Dictionary Triage]" — link routes to `?section=atlas-dict-triage&batch=<id>` so the engineer lands pre-filtered to that batch's rows.
- Light Proceed-confirm friction: per-batch Proceed and bulk "Proceed All Clean" warn when unmapped params exist (operator can still proceed; the message tells them what'll happen).

The badge / count widget I started building was later removed at the user's request — they preferred the queue counter visible only on the Triage page itself, not duplicated in the sidebar.

**Five bugs surfaced + fixed during the build:**

1. **PGRST205 fail-open on missing overrides table.** The `atlas_dictionary_overrides` table from Decision #68 was never applied to this Supabase instance. Both anon and service-role keys get `Could not find the table 'public.atlas_dictionary_overrides' in the schema cache`. The route initially tried an inline query that crashed the whole endpoint. Refactored to wrap in try/catch returning empty override set — fail-open: queue stays unfiltered if overrides aren't readable, no override-based filtering happens. Mirrors the pattern in `lib/services/atlasDictOverrides.ts`.

2. **`tableLayout: 'fixed'` for column widths.** Body cell `width` props on a default-auto MUI `<Table>` are silently ignored — the browser layouts based on content. Aligned header + body widths and added `tableLayout: 'fixed'`. Companion fix: `fullWidth` on TextFields so they fill their cells (without it, MUI defaults to a fixed ~200px field regardless of cell width).

3. **Case-insensitive override match.** The Accept flow lowercases `paramName` before insert (`paramName: row.paramName.toLowerCase()`), but the queue's filter compared the override key against the raw `entry.paramName` (preserving source casing — "Type" with capital T). Result: override saved correctly but row never disappeared. Fix: lowercase both sides of the comparison in the filter (`${entry.dominantFamily}:${entry.paramName.toLowerCase()}`).

4. **RLS / cookie-vs-service auth in admin endpoints.** This was the subtlest bug. The route uses `createServiceClient()` (bypasses RLS) for the heavy queries (batches, manufacturer lookups), but I initially routed the override read through `fetchAllDictOverrides()` from `lib/services/atlasDictOverrides.ts` — which uses `createClient()` from `@/lib/supabase/server` (cookie-bound user client). The RLS policy on `atlas_dictionary_overrides` requires admin auth via `auth.uid()` lookup against `profiles.role`. In some request contexts the user's cookie session wasn't propagating to that helper's Supabase call → RLS denied → 0 rows returned → the queue saw "no overrides" and never filtered the row out. Fix: drop the helper, do an inline service-role query in the route. **Lesson: in admin endpoints where `requireAdmin()` already gates entry, prefer service-role for downstream queries — RLS becomes redundant defense-in-depth that costs you when cookie propagation breaks.** The service role is the correct authority for an admin-only server endpoint; routing through cookie auth there is paying for safety you already have.

5. **mjs/TS dict mirroring tax.** `scripts/atlas-ingest.mjs` carries its own copy of `classifyAtlasCategory()` AND every family parameter dictionary because the script runs standalone (can't import `.ts`). I added new dict entries (`'type'` → `polarity` / `_type`) to `atlasMapper.ts` but forgot to mirror to the mjs script — re-ingests using the mjs version then didn't pick up the mappings. The user regenerated three times before I caught it. **Lesson: every time you touch atlasMapper dictionaries OR the classifier, grep `scripts/atlas-ingest.mjs` for the same shape. The duplication is technical debt; consolidating it is its own refactor.** For now, treat the mjs file as a parallel surface that always needs co-edits. Eight family dicts (B1, B3, B4, B5, B6, C1, C2, C6) gained `'type'` / `'类型'` entries this pass — see Decision #175 + this entry's commit for the full set.

**Cheap perf wins applied:**
- Server-side projection: `select('batch_id, manufacturer, status, unmappedParams:report->unmappedParams, familyCounts:report->familyCounts')` instead of `select('*')` — cut payload ~80% (reports include the per-product diff which can be multi-MB).
- Skeleton loading state replaces bare `CircularProgress` on the Triage page.
- `slotProps={{ transition: { unmountOnExit: true } }}` on the Accordion — drops the (potentially 200-row) table from the DOM when collapsed instead of MUI's default "keep mounted, hide via CSS" which still pays the render cost.

**Phase 2 deferred** (see [BACKLOG.md](BACKLOG.md) — "Dictionary Triage Phase 2"): explicit per-param status tracking (open / accepted / rejected / deferred / researching) via a new `atlas_unmapped_param_queue` table. Today's implicit "no override = shows in queue" semantics cover the single-engineer case; the explicit table earns its keep when engineers want to *park* a param without resolving it, or when notifications + assignment become real needs (multi-engineer rotation). Triggers documented in the backlog entry.

**Files touched:**
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — independent unmapped-params aggregation, MFR provenance, override cross-reference, `?batch=` filter, JSONB projection.
- [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) — `affectedManufacturers` field.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — MFR chips per row, table-layout fix, `fullWidth` inputs, Category column with `getFamilyDisplayName()`, unmount-on-collapse.
- [components/admin/atlasIngest/AtlasIngestPanel.tsx](../components/admin/atlasIngest/AtlasIngestPanel.tsx) — embedded editor removed, summary alert + deep link, bulk-Proceed warning.
- [components/admin/atlasIngest/BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) — `embeddedTriagePanel` prop dropped, per-batch summary + deep link, per-batch Proceed warning.
- [components/admin/AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx) — **new**, dedicated workspace.
- [components/admin/AdminShell.tsx](../components/admin/AdminShell.tsx), [components/admin/AdminSectionNav.tsx](../components/admin/AdminSectionNav.tsx) — `'atlas-dict-triage'` section + nav entry.
- [locales/en.json](../locales/en.json), [locales/zh-CN.json](../locales/zh-CN.json) — `atlasDictTriage` label.
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) + [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) — `'type'` / `'类型'` entries on B1, B3, B4, B5, B6, C1, C2, C6 dicts.

**Verification.** Manual: upload a batch with unmapped params, leave some unaccepted, click Proceed → unaccepted ones still appear in Triage labeled with the MFR. Cross-MFR: same paramName from 2 MFRs → one row with both chips, productCount summed. Self-cleanup: accept an override → row disappears (override-cross-reference filter matches). Operator workflow: Ingest page renders count summary + links; no editing surface. Tests stayed green at 1530 across the change.

---

## Decision #177 — Foreign-Family Param Signature Registry: Auto-Detect & Auto-Flag Misclassifications (May 2026)

Decision #175 added `reclassifyByParameterSignals` to fix one specific case (B1 with `Type=Bi/Uni/Regulator` → B4/B3). When triaging unmapped params, the engineer noticed a different and broader misclassification pattern: under family **B1 Rectifier Diodes**, four of six surfaced params (`BVCBO`, `BVCEO`, `BVEBO`, `@Ic`) are unambiguously BJT (transistor) parameters — diodes have no collector / base / emitter. Either Yangjie miscategorized those products upstream, or our c3-only classifier put BJTs into B1 on import. Mapping those param names to diode canonicals (`vrrm`, `vdc`, etc.) would have actively poisoned `atlas_products` with semantically wrong data. The synonym-mapping triage UI gave the engineer no first-class path for "this row reveals a misclassification, don't map it."

**Decision: a foreign-family param signature registry as the single source of truth for both auto-detection in the triage UI and auto-fix at next ingest. Engineer's role drops to one-click Confirm / Revert.**

**Single registry, three consumers.** [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) declares `FAMILY_PARAM_SIGNATURES: ParamSignature[]` — each entry is `{ pattern: RegExp, target: { category, subcategory, familyId }, reasoning: string }`. Seeded with 11 entries covering BJTs (`BVCBO|BVCEO|BVEBO`, `@?Ic`, `hFE`), MOSFETs (`Rds(on)`, `Vgs(th)`, `Qg|Qgs|Qgd`), IGBTs (`Vce(sat)`, `Eon|Eoff|Ets`), JFETs (`Idss`), Optocouplers (`CTR`, `Viso`). The `detectForeignFamily(paramName, currentFamily)` helper returns the matching signature when the target family differs from the row's current — that's the foreign-family signal.

**Triage queue auto-flag at render time.** [/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) runs `detectForeignFamily()` per row, attaches an `autoFlag: { suggestedFamily, reasoning, matchingParam }` field when matched. Server also reads `atlas_unmapped_param_notes.status` and classifies each row into `synonym | flagged` based on (registry hit OR persisted status). New `?include=synonyms|auto_flagged|all` query param drives a server-side filter so the default queue only shows synonym work; auto-flagged rows live in their own view. Returns `triageCounts: { synonyms, autoFlagged, total }` for badge rendering. **Persisted status takes precedence over live registry hit** — Confirm writes `status='wrong_family'`, Revert writes `status='confirmed_in_family'` (suppresses future auto-flags for this paramName even if registry still matches).

**Schema extension on `atlas_unmapped_param_notes`.** Three columns added: `status TEXT (CHECK in 'wrong_family'|'confirmed_in_family')`, `flagged_by TEXT (CHECK in 'auto'|'engineer')`, `auto_diagnosis JSONB`. The note column relaxed to nullable + a `has_signal` CHECK ensures a row exists for at least one of (note text, status). Migration is idempotent — `ALTER COLUMN ... DROP NOT NULL`, `ADD COLUMN IF NOT EXISTS`, `DO`-block constraint adds, `DROP POLICY IF EXISTS` + `CREATE POLICY` so re-runs are safe.

**Ingest classifier extension.** `reclassifyByParameterSignals` in [atlasMapper.ts](../lib/services/atlasMapper.ts) gained a Phase 2 loop after the existing Decision-#175 Type-value rules: iterate the registry and re-route when `sig.target.familyId !== initial.familyId` and any param matches the pattern. Mirrored into [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) per the duplicated-by-design rule. Critically: Phase 1 (Type-value) takes precedence over Phase 2 (param-name) — a B1 with both `Type=Bi` AND `BVCBO` reclassifies to B4 TVS (the Type-value signal is more specific than the param-name signal).

**UI shape.** [TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx) gained a `mode: 'synonyms' | 'auto_flagged' | 'all'` ToggleButtonGroup at the top with live counts. [GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) branches per row on `flagged = !!r.autoFlag || r.noteStatus === 'wrong_family'`:
- Family chip: `B1 → B6` arrow with flag icon (instead of single-family chip)
- Category cell: `Rectifier Diodes` (strikethrough) `→ BJTs` (errored)
- AI translation cell: replaced by the registry's `reasoning` text in error.light
- attributeId/Name/Unit cells: dimmed "Don't map — investigate upstream"
- Conf cell: red "Wrong family" chip pre-confirm; green "Confirmed" post-confirm
- Action cell: Confirm (red contained) + Revert (outlined, undo icon)
- Row: red left-border accent (3px) for pending; muted grey + 0.55 opacity for confirmed

**Sort: pending flags rise, confirmed flags sink.** Within the auto-flagged view, the route's final sort orders `noteStatus === 'wrong_family' ? 1 : 0` ascending, then `productCount` desc. New rows surface at the top; reviewed rows fall to the bottom of their own queue without going invisible.

**Suggestion fetch is skipped for auto-flagged rows.** Asking Haiku to map a misclassified param's name to a canonical attribute would burn tokens producing semantically wrong suggestions. Auto-flagged rows seed their state with empty placeholders and never enter the fetch queue.

**Foundational principle: auto-flag only, no auto-confirm.** A registry hit is high-confidence but not infallible — `Vp` matches JFET pinch-off but could (rarely) appear in another context where it means something else. Engineer Confirm before persisting `status='wrong_family'` is one click and catches that edge case. The friction is on confirmation, not discovery — exactly the inversion the engineer asked for ("I don't want to be the one finding the issue here with a specific row").

**Files touched:**
- [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) — **new**, the registry + `detectForeignFamily()` helper.
- [scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql) — `status`, `flagged_by`, `auto_diagnosis` columns + `has_signal` CHECK + idempotent re-run guards.
- [app/api/admin/atlas/unmapped-param-notes/route.ts](../app/api/admin/atlas/unmapped-param-notes/route.ts) + [.../[paramName]/route.ts](../app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts) — surface + persist new fields.
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — autoFlag computation, `?include=` filter, triageCounts.
- [components/admin/atlasIngest/TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx) — view-mode chip group.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — per-row branch on `flagged`, Confirm/Revert handlers.
- [components/admin/AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx) — `mode` state plumbed to API.
- [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) + [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — registry-driven Phase 2 reclassification.
- [__tests__/services/atlasMapper.test.ts](../__tests__/services/atlasMapper.test.ts) — 12 new test cases per registry entry, no-op-when-target-equals-current, Phase 1 precedence, any-starting-family firing.

**Verification.** Tests green at 1542 (+12). Manual: open the Triage page on a known-affected batch, see the red-badged "Auto-flagged misclassifications (N)" chip; switch view; the diagnosis card shows the `B1 → B6 BJTs` transition with reasoning. Confirm persists; row stays with Confirmed badge, drops in opacity, sinks to bottom. Revert restores it to the synonym view.

---

## Decision #178 — L2 Category Override Scope for Inline Accept (May 2026)

Decision #176 shipped the inline Accept flow on the dictionary triage page. The Accept handler POSTed `{ familyId: row.dominantFamily }` to `/api/admin/atlas/dictionaries`. That endpoint's column is named `family_id` but is actually overloaded — its validation falls through `getAtlasParamDictionary(fid) ?? getAtlasL2ParamDictionary(fid)`, accepting either an L3 familyId (`'B5'`) or an L2 category name (`'Microcontrollers'`). The triage UI never used that overload — when a row had no L3 family (L2-only product like an MCU or memory chip), `dominantFamily` was null and Accept was disabled with a "pick a family manually via Atlas Dictionaries panel" tooltip. Engineer's path forward was to leave the triage page, navigate to the standalone Dict admin, pick the L2 category, type the same mapping again. For an MCU vendor with 15 unmapped Chinese params, that's 15 context switches.

**Decision: surface `dominantCategory` alongside `dominantFamily` in the queue, and let the inline Accept POST whichever is present (family wins; category is the L2 fallback).**

**Ingest pipeline emits `categoryCounts`.** [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) was already accumulating `familyCounts: Record<string, number>` per batch — added a parallel `categoryCounts` keyed on `result.classification.category` (with the same `'(uncovered)'` fallback). Threaded through `mapManufacturerProducts()`'s return tuple and into the report assembly site. Optional in the type (`categoryCounts?: Record<string, number>`) so older batches predating this change don't break the queue. Mirrored into the same field on `IngestDiffReport` in both [atlasIngestService.ts](../lib/services/atlasIngestService.ts) and [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts).

**Queue route aggregates categoryCounts per param.** [/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) reads `report->categoryCounts` and scales the same way `familyCounts` is scaled (per-batch category distribution × per-param product share), producing `dominantCategory` per `GlobalUnmappedParam`. Override-resolved filter then keys on whichever scope is present (`scopeKey = entry.dominantFamily ?? entry.dominantCategory`) when checking against `activeOverrideKeys`.

**Inline Accept routes via scope helper.** [GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) gained `getOverrideScope(row): { kind, key } | null` — returns `{ kind: 'family', key: dominantFamily }` if present, else `{ kind: 'category', key: dominantCategory }`, else null. Every callsite that previously used `r.dominantFamily` for override scoping was swapped: the suggest endpoint POST, the Accept endpoint POST, the schema cache lookup, the disabled-button check, the `isBulkEligible` filter. The change_reason surfaced in audit history records the kind explicitly: `"AI-assisted ingest triage (L2 category: Microcontrollers, confidence: high)"`.

**UI affordance.** Family chip shows `L2` (info color) instead of `?` (warning) when only category is present, with a tooltip "L2 category: Microcontrollers (no logic-table family — override scoped to category)". Category cell shows the category name verbatim (`Microcontrollers`) instead of dash. Accept button enables. Engineer one-clicks instead of detouring.

**Discovered limit (multi-category MFRs).** When the same paramName appears across products in **two** L2 categories — e.g. FMD ships 52 MCUs + 23 memory chips with overlapping Chinese param names like `工作电压(范围)` and `存取时间` — the queue's `dominantCategory` rolls up to whichever has more products (Microcontrollers in FMD's case, 52 > 23). Accepting an override scoped to Microcontrollers leaves the 23 Memory products' params still unmapped on the next regen. The category-scoped override system is fundamentally per-category. **Workaround for this case:** clone the active overrides to the secondary category as separate `add` rows (one-shot script). Long-term fix tracked in BACKLOG: surface multi-category coverage in the triage UI so a single Accept fans out to all observed categories OR lift truly category-agnostic params (`工作电压`, `工作温度`, etc.) to `SHARED_PARAMS` (the dict layer that's already cross-category).

**Backward compat.** Pre-existing pending batches don't have `categoryCounts` in their reports. The queue route falls through gracefully — `dominantCategory: null`, Accept stays disabled for those rows, behavior matches pre-change. Regen via the per-batch button repopulates the field; bulk Regen All Affected fires after every Accept anyway.

**Files touched:**
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — `categoryCounts` build site, threading through report assembly.
- [lib/services/atlasIngestService.ts](../lib/services/atlasIngestService.ts) + [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) — optional `categoryCounts` field on `IngestDiffReport`, optional `dominantCategory` + `categoryCounts` on `GlobalUnmappedParam`.
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — per-param category aggregation, override-resolved filter scope unification.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — `getOverrideScope()` helper, every callsite swapped to scope, L2 chip in Family cell, category-name fallback in Category cell.

**Verification.** FMD batch: regen → 4 unmapped (down from 15); accept the L2 mappings → 0 unmapped on next regen. Multi-category MFR (FMD has both MCUs + Memory): accepting Microcontrollers-scoped overrides leaves 4 unmapped from Memory side; cloned to Memory category via a one-shot script → 0 unmapped, risk dropped from `attention` to `clean`.

---

## Decision #179 — Atlas Coverage Compute via SQL RPC, Not JSONB Pull (May 2026)

The Atlas Coverage admin page was taking ~50 seconds to load on cold cache. Profiling [/api/admin/atlas/route.ts](../app/api/admin/atlas/route.ts) `computeAtlasCoverage()` revealed two `fetchAllPages` walks over `atlas_products`:

1. **Lightweight pass** — 67,164 rows (`manufacturer, family_id, category, subcategory, updated_at`), 1000-row pages, ~70 round trips.
2. **Scorable pass** — 49,129 rows with **full `parameters` JSONB** (~1 KB per row), 1000-row pages, ~50 round trips, **~47 MB on the wire**.

Both fired in parallel, but the scorable+JSONB walk dominated. Plus the cache was empty (cleared by a prior Proceed in the session), so every cold-cache visitor paid the full cost. Aggregating in Node after pulling the JSONB was the wrong layer — Postgres can do it without ever shipping the body.

**Decision: a single SQL RPC `get_atlas_coverage_aggregates(family_attrs JSONB)` does the entire aggregation in Postgres. The route ships only the rule-attr map down (~10–20 KB) and gets aggregate rows back (~5K rows, a few KB).**

**RPC contract.** [scripts/supabase-atlas-coverage-rpc.sql](../scripts/supabase-atlas-coverage-rpc.sql). Returns one row per `(manufacturer, family_id, category, subcategory)` tuple with: `product_count BIGINT`, `total_covered BIGINT`, `total_rules BIGINT`, `last_updated TIMESTAMPTZ`. The coverage SUMs include a `CASE` guard `family_attrs ? p.family_id` so rows in families not present in the input map (or non-scorable rows with `family_id IS NULL`) contribute 0 — letting the route iterate ALL 43 logic tables once at module init without conditioning the RPC call on what families exist in the DB. The GIN index on `parameters` (existing `idx_atlas_products_params`) accelerates the `parameters ? rule_attr` operator inside the correlated subquery.

**Per-function statement timeout bump (added during deployment).** Supabase's default `statement_timeout` is ~60s. The RPC scans 71K rows × ~10–20 attribute-presence checks per scorable row — at the current size this lands well under 60s, but headroom matters as `atlas_products` grows. The function declares `SET statement_timeout = '300s'` so the RPC has its own budget without changing the connection's broader timeout. **This is a stopgap.** The long-term fix is a precomputed `coverage_attrs_count INT` column on `atlas_products` (or a materialized view) maintained at write time — eliminates the per-row JSONB iteration entirely. Tracked in BACKLOG.

**Route refactor.** `computeAtlasCoverage()` now: builds the family→ruleAttrs map once (`buildFamilyAttrsPayload()` cached at module scope; static across requests since logic tables ship with the codebase); fires three queries in parallel — the RPC, `atlas_manufacturers` (~115 rows), `atlas_manufacturer_settings` (~tiny); rolls up the RPC's per-(mfr, family_id, category, subcategory) rows to per-MFR + global summary in TS. Same response shape as before, UI sees no change. Service-role client throughout (admin auth gated upstream by `requireAdmin()`); no RLS round-trip needed.

**Cache layering unchanged.** L1 (60s in-memory) and L2 (`admin_stats_cache` row keyed `'atlas-coverage'`) both still apply. SWR threshold at 6 hours kicks a background recompute when the persistent cache is stale. The `invalidateAtlasCache()` exported function still triggers a fire-and-forget recompute; with the RPC, that recompute now takes ~3s instead of ~50s, so the user-facing latency on cache-miss is acceptable enough that pre-warming after Proceed/Revert isn't worth the script-to-route call complexity.

**Why not refactor the manufacturers route the same way?** It already does — `supabase.rpc('get_manufacturer_product_stats')` per Decision #123. The atlas-coverage compute was the outlier. This decision brings it into alignment.

**Migration deployment.** Idempotent (`CREATE OR REPLACE FUNCTION`), so re-runnable. User applies in Supabase SQL editor. After apply, the route's first call gets the RPC; if the function doesn't exist, the route surfaces the RPC error verbatim via the existing error-fallback path that returns last-known-good cache (or a 503 if nothing's cached).

**Files touched:**
- [scripts/supabase-atlas-coverage-rpc.sql](../scripts/supabase-atlas-coverage-rpc.sql) — **new**, the RPC definition with embedded `SET statement_timeout = '300s'`.
- [app/api/admin/atlas/route.ts](../app/api/admin/atlas/route.ts) — `buildFamilyAttrsPayload()` helper, `computeAtlasCoverage()` rewritten around RPC, dual `fetchAllPages` walks removed, switched from cookie-bound `createClient()` to `createServiceClient()` for consistency.

**Verification.** Tests stayed green at 1542 across the change (no test coverage for the RPC path itself — would need a Supabase test container; verification is observational against prod). After SQL apply, cold-cache page load expected to drop from ~50s to ~3s.

**Deferred.** (1) Pre-warming the cache from `atlas-ingest.mjs` after Proceed/Revert — would require either an HTTP callback to the dev/prod URL or duplicated compute in the script, neither pretty. RPC speedup alone makes the post-Proceed wait acceptable. (2) Precomputed coverage column on `atlas_products` — the durable fix; eliminates the per-row JSONB scan. Deferred until the RPC actually starts hitting timeout headroom (likely at 200K+ products).

## Decision #180 — Triage Queue Compute via SQL RPC + L1+L2+SWR Cache (May 2026)

The Atlas Dictionary Triage page was taking 23+ seconds to load on cold cache, sometimes triggering "Page Unresponsive" warnings in the browser. Two compounding issues:

1. **Server compute**: [/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) `computeTriageAggregation()` was pulling every pending+applied batch's `report->'unmappedParams'` JSONB sub-path over the wire — MBs of data — then aggregating in Node (cross-batch dedup, MFR rollup, familyCounts/categoryCounts merge, sample-value dedup, override annotation, foreign-family classification). 5–25s depending on accumulated batch count.
2. **Client render**: with ~400+ deduplicated rows, MUI was creating ~5000 React elements (Tooltip + Chip + TextField + Button per row × 12 cells). Initial mount took long enough to trigger browser unresponsiveness.

**Decision: mirror the atlas-coverage pattern from #179. Move aggregation to a Postgres RPC. Add a dual-layer cache. Paginate the table client-side.**

**RPC contract.** [scripts/supabase-triage-aggregate-rpc.sql](../scripts/supabase-triage-aggregate-rpc.sql). `get_triage_unmapped_aggregate()` walks `atlas_ingest_batches` (status IN pending/applied), expands each batch's `report->'unmappedParams'` JSONB array via `jsonb_array_elements`, aggregates by `paramName`. Returns one row per unique paramName with: total `product_count BIGINT`, dedup'd `affected_batch_ids TEXT[]`, MFR rollup `affected_mfrs JSONB` (array of `{name, productCount}` sorted by productCount desc), merged `family_counts JSONB`, merged `category_counts JSONB`, dedup'd `sample_values TEXT[]` (capped at 5). Uses CTEs to keep the SQL legible: `expanded` → `base` (per-paramName totals) → `mfr_agg` / `fam_agg` / `cat_agg` / `sv_agg` (each its own GROUP BY) → final LEFT JOIN. Wire payload drops to ~50 KB. `SET statement_timeout = '300s'` per-function override matches #179's pattern. Dropped legacy batch-level `familyCounts`/`categoryCounts` fallback — only the per-param breakdown emitted by the mjs aggregator since the dominantFamily-attribution fix is supported. Older batches without per-param data contribute productCount but no family attribution → `dominantFamily` falls back to null. Acceptable; the legacy batch-level approximation was buggy on mixed-product-type MFRs (the Delta case, Decision #176).

**Cache layering** ([lib/services/triageQueueCache.ts](../lib/services/triageQueueCache.ts)). L1 in-memory (30 min TTL), L2 in `admin_stats_cache` row keyed `'triage-queue'` (persistent, no TTL — invalidated by mutations), SWR threshold at 6 hours. After the first cold compute, every subsequent load is sub-second (L1 hit) or ~500ms (L2 hit warming L1).

**Two invalidate variants.** This is the heart of the Sunlord bug fix:
- `invalidateTriageQueueCache()` — single-flight. Clears L1, kicks off recompute IF none in flight (otherwise reuses the existing one). Returns the in-flight Promise. Used by per-row mutations (Accept/Revert/note edit). Optimistic UI on the client keeps the acting user fresh; staleness for other readers is bounded by the next batch-state mutation.
- `invalidateTriageQueueCacheAndAwaitFresh()` — wait-then-restart. (1) Drains any in-flight recompute (its RPC may have started reading the DB BEFORE this caller's commit landed). (2) Clears L1. (3) Starts a fresh recompute (DB read happens NOW, after the caller's commit, so it's guaranteed to see the changes). (4) Awaits the fresh recompute. Used by batch-state mutations (upload, proceed, revert, regenerate, batch delete, proceed-all-clean). Cost: up to 2 recomputes per call, but the user is already in a "waiting on a slow operation" mental state.

**The Sunlord bug, in detail.** Initial fix added `await invalidateTriageQueueCache()` to the upload route, expecting it to refresh the cache before responding. But the single-flight pattern handed back any existing in-flight Promise — typically from a fire-and-forget per-row Accept earlier in the session. That recompute had already started its RPC against pre-Sunlord DB state, so awaiting it returned stale data. User uploaded Sunlord, navigated to Triage, saw "no unresolved parameters for this batch — nothing to review" because the cached classified set didn't include any Sunlord rows. The wait-then-restart variant guarantees the awaited recompute starts AFTER the caller's commit.

**Stop deleting L2 from the .mjs script.** The original `scripts/atlas-ingest.mjs` was DELETING the `admin_stats_cache` rows for `atlas-coverage`, `manufacturers-list`, `atlas-growth`, and `triage-queue` on every Proceed/Revert. That meant: API route's invalidate hooks kicked off async background recomputes (L2 stays valid, users see slightly-stale data instantly) — but then the script DELETED L2 anyway, forcing the next user request into a synchronous cold compute path. Removed the deletes from the script. The API route's invalidate hooks own cache invalidation correctly.

**Per-route framework caching defeated.** Added `export const dynamic = 'force-dynamic'` to the batches route + `cache: 'no-store'` to the client fetch in `AtlasDictTriagePanel.tsx`. Belt-and-suspenders against any browser-level or Next.js-level caching that might layer on top of our L1/L2.

**Files touched:**
- [scripts/supabase-triage-aggregate-rpc.sql](../scripts/supabase-triage-aggregate-rpc.sql) — **new**, the RPC.
- [lib/services/triageQueueCache.ts](../lib/services/triageQueueCache.ts) — **new**, L1+L2+SWR cache module with two invalidate variants.
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — `computeTriageAggregation()` rewritten around RPC; cache read/write wired in; `dynamic='force-dynamic'`.
- 6 batch-state routes wired to use `invalidateTriageQueueCacheAndAwaitFresh()`: report, proceed, revert, regenerate, batch-DELETE, proceed-all-clean.
- 5 per-row routes use single-flight `invalidateTriageQueueCache()`: dictionaries POST/PATCH/DELETE, notes PUT/DELETE.
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — removed `admin_stats_cache` deletes from Proceed and Revert paths.

**Verification.** 1542 tests pass. Cold-cache load expected to drop from 23s to ~2-3s. Post-upload navigate-to-Triage now shows the new MFR's unmapped params immediately without a Refresh click. Per-row Accept stays snappy (no refetch) via the optimistic-UI pattern (Decision #182).

## Decision #181 — AI Triage Suggestion: On-Demand Sonnet 4.6 Verdict (May 2026)

The user's prior triage workflow involved screenshotting the Triage table, pasting it into Claude (web/desktop, Extra-High mode) one paramName at a time, reading the analysis, then either clicking Accept in our UI or copy-pasting Claude's reasoning into the team-note popover. Each row took multiple manual round-trips. The existing per-row Haiku suggester was a translation, not a recommendation — it didn't say "accept this" or "defer with this rationale".

**Decision: inline the Claude-web step. Per-row Sonnet 4.6 suggestion that returns a binary verdict (`accept` | `defer`) plus a written explanation. The user always decides; the suggestion is advisory.**

**Suggestion shape** ([components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts)). Existing `DictSuggestion` extended with `suggestion: 'accept' | 'defer'` and `explanation: string | null`. Both verdicts get the same depth of evidence — explanation is full prose written in engineer-note voice (1-3 sentences), visible by default below the AI translation in the cell. No opaque "trust me" Accept chips. Symmetric UX so Claude doesn't get to be vague about an Accept rec while justifying a Defer.

**Defer pre-fills the team note draft.** When `suggestion === 'defer'`, the `UnmappedParamNoteCell` component receives `aiDraft={explanation}` and `aiDraftHint={true}`. Opening the note popover seeds the textarea with Claude's reasoning + a small "Pre-filled by AI — edit before saving" caption. The note button itself turns warning-amber when there's a pending AI draft and no existing note. User can edit before saving (first keystroke clears the "from AI" caption). Reuses the existing `atlas_unmapped_param_notes` table — no parallel infrastructure.

**Endpoint upgrade** ([app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts)). Bumped from `claude-haiku-4-5-20251001` to `claude-sonnet-4-6`, `max_tokens` 256→600. Prompt rewritten to require the verdict + explanation as a 6th and 7th output field. Verdict logic: `accept` iff suggested attributeId is canonical (in family schema) AND concept matches AND samples are consistent, OR reuses a previously-accepted canonical that genuinely represents the same concept. `defer` iff: suggested ID is generic-catchall (style/type/size/kind/category/material) and would shoehorn unrelated concepts; OR near-duplicate of an existing canonical (e.g. proposed `positions_per_row` when `pins_per_row` exists); OR sample units don't match the suggested ID; OR concept is ambiguous and a more specific canonical should be defined first. Explanation styled as the engineer would write a team note.

**Generation is on-demand, not eager.** Sonnet 4.6 at ~$0.005/row × 100 params = $0.50 per Triage page load if eager. Replaced eager-on-mount with manual triggers: a top-of-table info Alert "N rows need AI suggestions — generate only when you're ready to triage" with a single **Generate N** button, plus a per-row **Generate** mini-button in the AI translation cell for one-at-a-time use. Previously-generated suggestions persist in localStorage (7d) + server cache (24h), so cached rows render instantly on revisit without re-firing tokens.

**Cache prefix bumped.** `SUGGEST_LS_PREFIX` from `atlas-ingest-ai-suggest:` → `atlas-ingest-ai-suggest-v2:`. Old cached entries lacked `suggestion`/`explanation`; bumping forces refetch against Sonnet on next view. Prevents legacy "verdict undefined" rendering.

**Files touched:**
- [app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts) — Sonnet 4.6, prompt + response shape.
- [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) — extend `DictSuggestion`.
- [components/admin/atlasIngest/UnmappedParamNoteCell.tsx](../components/admin/atlasIngest/UnmappedParamNoteCell.tsx) — `aiDraft` + `aiDraftHint` props, seed textarea, "Pre-filled by AI" caption, amber button hint.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — split eager fetch into `hydrateFromCache()` (auto, no API) + `generateSuggestionsForRows()` (manual). Bulk Generate Alert + per-row Generate button. Repurposed Conf column → Suggestion. Symmetric explanation rendering. Cache prefix bump.

**Why one model call instead of separate translate + verdict.** Sonnet does both well in a single round-trip; splitting into Haiku-translate + Sonnet-verdict adds complexity (two endpoints, two caches, dependent ordering) without meaningful cost savings. The combined call is cleaner.

**Deferred.** (1) Per-MFR batch suggestion call (one Sonnet pass over all unmapped params for an MFR — could spot patterns across rows and consult cross-row context). Cheaper amortized; higher risk of model dropping rows. Revisit if per-row cost becomes painful. (2) Suggester consults cross-scope canonicals (currently sees only the row's own family/category schema). E.g. discovering `gender` in modular-connectors L2 should be visible to a generic Connectors L2 row that needs a male/female mapping. (3) Sample-value-aware concept similarity. (4) Auto-save the AI draft as a note without user confirmation — explicitly out of scope; user always decides.

## Decision #182 — Triage UI: Optimistic Updates + Client-Side Filtering + Pagination (May 2026)

Three compounding UX issues on the Triage page: (1) every Accept triggered a server refetch + 30s skeleton because the cache invalidation forced a cold reload. (2) Every mode/status filter chip click re-fetched server-side. (3) Rendering 400+ rows on initial paint froze the browser long enough to trigger "Page Unresponsive" warnings.

**Decision: optimistic in-place row updates for Accept/Revert; client-side filtering for mode/status/search/MFR/family/has-note; pagination capped at 100 rows initial.**

**Optimistic Accept/Revert.** [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) takes new `onRowAccepted(paramName, override)` and `onRowReverted(paramName)` callbacks. `acceptRow()` POSTs to `/api/admin/atlas/dictionaries`, captures the response (which includes the new override metadata), and calls `onRowAccepted` with it. The parent `AtlasDictTriagePanel` mutates `data.unmappedParamsGlobal[i].acceptedOverride` in place and adjusts `statusCounts` (open-1, accepted+1) + `triageCounts.synonyms` (-1 if applicable). The row instantly transforms: Accept button → "Accepted" chip + Revert button. No skeleton, no refetch. `createdByName` defaults to `'You'` since the current user just did it; the next real refresh resolves to their actual display name.

**Client-side filtering pipeline.** Mode (Open Synonyms / Auto-flagged / All), status (Open / Accepted / Undone / All), and the page-level filters (search, MFR, family, min-prods, has-note) all run in a single `filteredRows` `useMemo` against `data.unmappedParamsGlobal`. The route now defaults `include` and `status_filter` to `'all'` and returns the FULL classified set unconditionally (~50KB after Decision #180's RPC). Mode/status chip clicks are pure JS array filters — instant. The route's per-request `batchFilter` slice still runs server-side because it's a single deterministic filter and doesn't benefit from client-side reuse.

**Single fetch on mount.** `refresh()`'s dep array no longer includes `mode` and `statusFilter`, so it doesn't re-run on chip clicks. New `refresh(forceFresh)` parameter wires `?refresh=1` for the explicit Refresh button.

**Refresh button.** Top-right of the Triage page, always visible. Forces `?refresh=1` (cache bypass + sync compute). Used after major uploads when freshness matters more than speed (~10-30s wait), and as a manual escape hatch for any cache weirdness.

**Pagination.** `INITIAL_VISIBLE_ROWS = 100` constant in `GlobalUnmappedParamsTable.tsx`. The table renders only `rows.slice(0, visibleCount)`. Footer shows "Showing 100 of N rows" with **Show 100 more** + **Show all** buttons. `visibleCount` resets to 100 whenever the filtered `rows` prop changes (new filter narrowed the set — don't carry over a previous "show all" state). Eliminated the browser-freeze that was triggering AbortError + Page Unresponsive warnings on 400+ row queues.

**Why no virtualization library.** react-window/react-virtuoso are heavier deps for a Table component. The 100-row pagination pattern handles the practical case (engineer triages ~20-100 rows per session) without the integration complexity of windowing inside MUI's Table layout.

**Files touched:**
- [components/admin/AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx) — `onRowAccepted` + `onRowReverted` callbacks; client-side mode/status filtering; single fetch per `batchFilter`; Refresh button.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — accept/revert pass new override metadata to parent; pagination footer with `visibleCount` state.

**Verification.** 1542 tests pass. Triage page mount drops to ~500ms (100 rows). Mode/status chip clicks are sub-millisecond. Accept doesn't blank the page. Refresh button is the explicit cache-bypass for the rare case where the cache truly needs forcing.

## Decision #183 — Atlas Growth Aggregates via SQL RPC (May 2026)

The Atlas Coverage page's growth chart was capping at ~40K products on the right axis even though the KPI tile reported 101,938 — a ~60K-row undercount. Diagnosed: [/api/admin/atlas/growth](../app/api/admin/atlas/growth/route.ts) was walking `atlas_products` row-by-row via `fetchAllPages` (101 pages of 1000 once Atlas crossed 100K). The loop destructured only `data` and ignored `error`, so any later page that hit a Postgres `statement_timeout` or network blip returned `null` and the loop broke silently with a partial result. The chart line ended early, the y-axis auto-scaled to the truncated max, and the chart looked like ingest had only added ~40K parts.

**Decision: third Atlas RPC — `get_atlas_growth_aggregates()` does the per-MFR rollup and per-day product bucketing in Postgres.**

Mirrors the patterns from [Decision #179](#decision-179--atlas-coverage-aggregation-via-postgres-rpc-may-2026) (atlas-coverage) and [Decision #180](#decision-180--triage-queue-compute-via-sql-rpc--l1l2swr-cache-may-2026) (triage). One round-trip in, ~50KB JSONB out, no row-by-row pagination, no silent failure mode, `SET statement_timeout = '300s'` as growth headroom.

**RPC return shape** ([scripts/supabase-atlas-growth-rpc.sql](../scripts/supabase-atlas-growth-rpc.sql)):

```json
{
  "mfrs": [{ "manufacturer": "Sunlord", "product_count": 16756, "min_created_at": "...", "categories": ["Capacitors", ...] }, ...],
  "day_buckets": [{ "day": "2026-05-08", "product_delta": 16756 }, ...]
}
```

The route still walks `atlas_ingest_batches` (small, ~thousands of rows) and `atlas_manufacturers` in TS — those drive event generation which has logic-table lookups that don't belong in SQL. The expensive 100K+ row scans are gone.

**Dead code removed.** The old `ProductRollup.maxCreatedAt` field was set but never read. The old `family_id` column was selected from `atlas_products` but never used. Both dropped.

**Cache lifecycle unchanged.** `invalidateAtlasGrowthCache()` already does fire-and-forget background recompute (Decision #180-style) — first page load after Proceed shows the previous cached payload, background recompute upserts the fresh row in ~1-2s now (was ~30-60s on cold compute via the row-by-row path). Mem cache 60s, persistent cache SWR 6h.

**Files touched:**
- [scripts/supabase-atlas-growth-rpc.sql](../scripts/supabase-atlas-growth-rpc.sql) — new file, RPC definition + GRANT.
- [app/api/admin/atlas/growth/route.ts](../app/api/admin/atlas/growth/route.ts) — call RPC, drop fetchAllPages over `atlas_products`, drop dead `maxCreatedAt`/`family_id`, drop `ProductRow` interface.

**Deploy.** Apply [scripts/supabase-atlas-growth-rpc.sql](../scripts/supabase-atlas-growth-rpc.sql) in Supabase SQL Editor. Then click the Atlas Coverage page's Refresh button (or hit `?refresh=1`) to force a fresh compute. Subsequent loads serve from cache.

**Verification.** Cold compute drops from ~30-60s (row-by-row 100K+ rows) to ~1-2s (single RPC). Chart's right axis now matches the KPI tile's product count exactly. No more silent undercount on later pages.

## Decision #184 — FindChips OEMS as Conditional Second Source for Commercial Data (May 2026)

The FindChips API exposes two upstream sources via the same endpoint: `site=fc` (franchised distributors — Digikey, Mouser, Arrow, etc.) and `site=oems` (independent distributors — surfaces oemstrade.com inventory, where Chinese distributors and brokers tend to live). Until now we only hit `fc`, which left Atlas (Chinese-MFR) parts and obsolete Western parts with no commercial-data coverage when the franchised channel didn't carry them.

The user's intent: OEMS is a *last-resort* source — many sellers are brokers, less-trusted pricing — so we don't want to pollute the Commercial tab with broker quotes when FC's franchised coverage is already good. The FC API has no per-call cost or hard rate limit; gating is a quality decision, not a budget one.

**Decision: trigger OEMS conditionally based on three signals — Atlas/Chinese MFR, FC empty, FC reports obsolete/EOL.** Merge results with FC-wins dedup by normalized distributor name. No UI changes (per IT confirmation that OEMS can return identical results to FC, distinguishing them visually would be misleading).

**Trigger conditions:**
1. **Atlas/Chinese-MFR parts** — proactive parallel fetch (FC + OEMS in parallel from the start). Keys off `mfrOrigin === 'atlas'` (Decision #161) for the recs side; falls back to `dataSource === 'atlas'` for search/parts-list source-side rows where `mfrOrigin` isn't yet resolved.
2. **FC returns zero distributors** — server-side fallback fetches OEMS, merges in.
3. **FC reports the part as obsolete/EOL** — server-side fallback (lifecycle code = `'obsolete'` or `'not_recommended'`) fetches OEMS, merges in.

**Client API shape** ([lib/services/findchipsClient.ts](../lib/services/findchipsClient.ts)):

```ts
type FcFetchSource = 'fc' | 'oems' | 'parallel-both' | 'fc-with-oems-fallback';

getFindchipsResults(mpn, userId, opts?: { source?: FcFetchSource })
getFindchipsResultsBatch(mpns, userId, opts?: {
  chineseMpns?: Set<string>;       // proactive parallel
  fallbackOnEmpty?: boolean;       // default true
  fallbackOnObsolete?: boolean;    // default true
})
```

Default `source: 'fc'` preserves prior behavior for any future call sites that don't opt in. The batch helper's defaults make every existing call site strictly better than today (FC-only) without source coupling — `chineseMpns` is the optional upgrade.

**Source-keyed L1 cache.** Cache key changed from `mpn.toLowerCase()` → `${mpn.toLowerCase()}::${site}` so FC and OEMS results cache independently. Caller composes merged results on read; we never re-fetch one site just because the other turned out to be needed. Null results are now cached too (5-min TTL) so a part with no FC coverage doesn't keep firing FC on every retry inside a 5-min window. L2 distributor-count cache (`fc-distributors` variant, 6-mo TTL) keeps its name and shape but now stores the *merged* count.

**Two-phase batch.** `getFindchipsResultsBatch` runs phase 1 (FC for all + OEMS in parallel for `chineseMpns`), then phase 2 (OEMS top-up for any non-Chinese MPN whose FC came back empty or obsolete). Concurrency stays at 5 per site.

**Dedup.** New `mergeFcAndOems(fc, oems)` helper builds a `Set<normalizedDistributorName>` from FC, then appends only OEMS distributors not already in the set. `normalizeDistributorName` moved from [lib/services/findchipsMapper.ts](../lib/services/findchipsMapper.ts) to [lib/services/findchipsClient.ts](../lib/services/findchipsClient.ts) (single source of truth, avoids mapper → client → mapper circular import; mapper re-exports for back-compat).

**Wiring trail:**
- [lib/services/partDataService.ts](../lib/services/partDataService.ts) `enrichWithFindchips` reads `mfrOrigin`, picks `'parallel-both'` for Atlas else `'fc-with-oems-fallback'`.
- [lib/services/partDataService.ts](../lib/services/partDataService.ts) `enrichCandidatesWithFindchips` derives `chineseMpns` from rec `.part.mfrOrigin === 'atlas'`.
- [app/api/fc/enrich/route.ts](../app/api/fc/enrich/route.ts) accepts optional `chineseMpns` array in body, forwards to batch helper.
- [lib/api.ts](../lib/api.ts) `enrichWithFCBatch(mpns, signal, chineseMpns?)` — third optional param.
- [hooks/useAppState.ts](../hooks/useAppState.ts) `triggerFCEnrichment` filters recs by `mfrOrigin === 'atlas'`; `triggerSearchDistributorEnrichment` falls back to `dataSource === 'atlas'` since `PartSummary` lacks `mfrOrigin` (resolved later in the recs pipeline).
- [hooks/usePartsListState.ts](../hooks/usePartsListState.ts) source-side uses `resolvedPart.dataSource === 'atlas'`, replacement-side uses `rec.part.mfrOrigin === 'atlas'`.

**What does not change.** Mapper output (`SupplierQuote[]` / `LifecycleInfo` / `ComplianceData`) is source-agnostic — no provenance field, no UI tagging, no type changes, no DB migration. Commercial-tab `SupplierCard` and parts-list columns auto-include OEMS quotes through the unchanged `quotes` array.

**Knowingly accepted.** L2 distributor-count entries cached pre-rollout reflect FC-only counts; they self-heal on next live fetch or expire at 6 months. Decorative badge, not load-bearing.

**Files touched:**
- [lib/services/findchipsClient.ts](../lib/services/findchipsClient.ts) — site-keyed cache, strategy options, merge helper, two-phase batch.
- [lib/services/findchipsMapper.ts](../lib/services/findchipsMapper.ts) — re-exports `normalizeDistributorName` from client (single source of truth).
- [lib/services/partDataService.ts](../lib/services/partDataService.ts) — strategy selection in `enrichWithFindchips` + `chineseMpns` in `enrichCandidatesWithFindchips`.
- [app/api/fc/enrich/route.ts](../app/api/fc/enrich/route.ts) — accept `chineseMpns`.
- [lib/api.ts](../lib/api.ts) — forward `chineseMpns`.
- [hooks/useAppState.ts](../hooks/useAppState.ts) — derive `chineseMpns` for recs + search-result enrichment.
- [hooks/usePartsListState.ts](../hooks/usePartsListState.ts) — derive `chineseMpns` at both batch FC enrichment call sites.

**Verification.** All 1542 tests pass; type check clean; production build clean. Manual end-to-end TBD: search a known Atlas MPN (3PEAK, GigaDevice) and watch for two `api.findchips.com` calls (`site=fc` + `site=oems`); search a stocked Western part and confirm only one call (`site=fc`); search an obsolete Western part and confirm OEMS fires after FC lifecycle reports EOL.

## Decision #185 — Deep Investigation for Non-Accept Triage Rows (May 2026)

The per-row AI suggester ([/api/admin/atlas/dictionaries/suggest](../app/api/admin/atlas/dictionaries/suggest/route.ts), Decision #181) returns a binary `accept`/`defer` verdict. Accept rows work cleanly — one click commits the override. Defer rows and unscoped rows (rows where `getOverrideScope()` returns null, so the Accept button is grayed) leave the engineer with no concrete next action: the AI explanation typically ends with "recommend investigating the upstream MFR datasheet" or "recommend defining a specific canonical first," which punts the work back. As the queue grows from hundreds → thousands of rows (user is onboarding hundreds more MFRs), this tail becomes the bottleneck — not the volume of accepts but the volume of "now what?" decisions.

**Decision: a second AI pass — [/api/admin/atlas/dictionaries/investigate](../app/api/admin/atlas/dictionaries/investigate/route.ts) — that produces a structured bucketed verdict for non-accept rows.** Returns one of six action buckets with a concrete next-step action button:

| Bucket | Action |
|---|---|
| `new_canonical` | Mint a new attributeId via Accept-flow prefill |
| `disambiguation` | Two side-by-side prefill options (primary + alternative) |
| `wrong_family` | Confirm wrong-family + surface a recommended FAMILY_PARAM_SIGNATURES entry |
| `unit_mismatch` | Mint a unit-specific variant canonical via Accept-flow prefill |
| `unscoped_products` | Show per-product family proposals (Phase 1: diagnosis only, no inline commit) |
| `unmappable` | Persist `status='unmappable'` on `atlas_unmapped_param_notes`; row drops from queue |

**Richer context.** Beyond what /suggest sees, the investigate route pulls:
1. **Top 5 affected products** — `mpn`, `description`, `manufacturer`, `category`, `subcategory`, `family_id`, and the JSONB value at `parameters->paramName` so the AI sees what the values look like in context (Schottky vs phototransistor? AWG vs mm²?).
2. **Cross-scope override hits** — exact-paramName matches in `atlas_dictionary_overrides` under OTHER scopes. Reveals reuse candidates: "this same param was accepted as X under family Y."
3. **Sample value typing** — cheap heuristic classification of numeric vs categorical sample values + trailing-unit extraction.

Sonnet 4.6, `max_tokens: 1200` (vs 600 for /suggest) for the longer structured output. Same caching pattern: 24h server-side `Map<string,CacheEntry>` + 7d localStorage on the client (`atlas-ingest-ai-investigate-v1:` prefix). Opt-in fire — never eager.

**Unmappable status.** Extended `atlas_unmapped_param_notes.status` CHECK constraint from `('wrong_family', 'confirmed_in_family')` → `('wrong_family', 'confirmed_in_family', 'unmappable')`. Default queue views (`include=synonyms` and `include=auto_flagged`) filter `unmappable` out; `include=all` keeps them visible for audit. Migration in [scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql) — DROP-then-recreate the CHECK constraint so existing wrong_family / confirmed_in_family rows stay valid.

**Shared context helpers.** Extracted `getSchemaAttributes()` and `fetchAcceptedCanonicals()` from the /suggest route into [lib/services/atlasTriageContext.ts](../lib/services/atlasTriageContext.ts) so both /suggest and /investigate use the same canonical fetch logic. No behavior change for /suggest; the move enables /investigate without code duplication.

**UI integration.** [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — added an "Investigate" button alongside the Accept button on rows where `!getOverrideScope(r) || state.suggestion?.suggestion === 'defer'`. The deep-analysis result renders as an expanded `<TableRow colSpan={12}>` subrow below the main row with: bucket badge + confidence chip, AI summary, prose, evidence chips (sample products, cross-scope hits), and bucket-specific action buttons. Action buttons reuse existing flows: `new_canonical`/`unit_mismatch`/`disambiguation` prefill `editedAttributeId`/`Name`/`Unit` so the engineer reviews and clicks the regular Accept button (no new endpoint); `wrong_family` calls existing `confirmFlag(r)`; `unmappable` PUTs to the notes endpoint with status='unmappable'.

**Phase 1 scope. Out of scope deliberately:** (a) actual product reclassification for unscoped rows — diagnosis only; engineer addresses upstream by adding subcategory mappings or editing the family classifier. (b) Auto-generating FAMILY_PARAM_SIGNATURES code patches — the route surfaces the recommendation; engineer hand-edits [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts). (c) Clustering across the queue — different problem (volume reduction), user explicitly deferred it.

**Files touched:**
- New: [app/api/admin/atlas/dictionaries/investigate/route.ts](../app/api/admin/atlas/dictionaries/investigate/route.ts) — Sonnet 4.6 investigation endpoint.
- New: [lib/services/atlasTriageContext.ts](../lib/services/atlasTriageContext.ts) — shared `getSchemaAttributes` + `fetchAcceptedCanonicals`.
- [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) — added `DeepAnalysis`, `DeepAnalysisBucket`; extended `NoteStatus` with `'unmappable'`.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — Investigate button + DeepAnalysisRow subrow + action handlers.
- [components/admin/atlasIngest/UnmappedParamNoteCell.tsx](../components/admin/atlasIngest/UnmappedParamNoteCell.tsx) — extended NoteRecord `status` union with `'unmappable'`.
- [app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts) — refactored to import helpers from `atlasTriageContext.ts`.
- [app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts](../app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts) — `VALID_STATUS` set now includes `'unmappable'`.
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — queue route filters `unmappable` from default views (visible only under `include=all`).
- [scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql) — extended CHECK constraint (DROP-then-recreate idempotent block).

**Deploy.** Apply [scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql) in Supabase SQL Editor (drops + recreates the status CHECK to include `'unmappable'`). Restart dev server. No data migration needed — existing notes rows stay valid.

**Verification.** All 1542 tests pass; type check clean. End-to-end smoke test: on a defer row, click Investigate → expanded subrow renders with bucket verdict + evidence chips + action button. Click the action — primary action prefills the Accept flow (new_canonical / unit_mismatch / disambiguation) or fires the confirmFlag / markUnmappable handler (wrong_family / unmappable). On an unscoped row (Accept grayed), Investigate fires unconditionally and returns `unscoped_products` with per-product family proposals. Re-clicking Investigate returns the cached analysis without firing Sonnet again.

## Decision #186 — Triage Phase 3 Hardening: Decision-Time Audit, Engineer Flag, Surface UIDs, Unicode Override Keys (May 2026)

Decision #185 shipped the AI Triage Investigator with a working end-to-end flow but the audit log conflated two concepts ("AI ran" vs "engineer decided") and an engineer iterating on a tricky param could leave a trail of orphan "Pending" rows that never resolved. The Triage table also surfaced rows that engineers had previously accepted because the override-lookup join was sensitive to Unicode normalization differences. This decision records a cluster of UX + correctness fixes layered on top of #185 — too many small items for individual decisions but substantive enough that "what changed and why" should survive in one place rather than be scattered across commit messages.

**Audit log: decisions, not investigations.** /investigate POST no longer inserts a row in `atlas_triage_investigations`. Instead, a new endpoint `POST /api/admin/atlas/triage-investigations` writes ONE complete audit row when the engineer takes an action (Accept / Confirm Wrong Family / Mark Unmappable). Caller passes the in-memory `DeepAnalysis` payload + the `actionTaken` enum + optional `resultingOverrideId`. The previous `PATCH /[id]` endpoint was deleted (no longer needed). Reasoning: an engineer fired Investigate 7 times on T(mm) while we chased a separate bug, then minted on the 8th; under the old model the log had 7 orphan "Pending" rows + 1 "Override created", which was misleading audit data. Now: 1 row per decision, no rows for explorations.

**Engineer flag — generic per-row bookmark.** New `is_flagged BOOLEAN` column on `atlas_unmapped_param_notes`, independent of `status` (which is structured triage outcome) and `note` (free-form). UI surfaces a `BookmarkBorder`/`BookmarkAdded` icon as a new column in the Triage table; click toggles state. New "Flagged" filter chip in the filter bar with live count badge. Reasoning: engineers want a "park this for later review" affordance that doesn't commit to a triage outcome. Reusing `unmappable` would have been semantically wrong; reusing the auto-flag system would have hit registry-only paths. Schema-wise: the row's `has_signal` CHECK gained `OR is_flagged = TRUE` so a flagged-only row is valid; unflagging when no other signal present deletes the row.

**Pending-batch evidence in Investigate.** /investigate's `fetchSampleProducts` now does two passes: applied tier (atlas_products query, tagged `origin: 'applied'`) AND pending tier (read raw `data/atlas/{source_file}` JSON for the row's `affectedBatchIds`, walk `models[].parameters[]`, tag `origin: 'pending'`). Combined up to 5 total. Reasoning: the queue surfaces unmapped params as soon as a batch uploads, but `atlas_products` only contains applied batches — a row from a brand-new INPAQ ingest had zero applied products, leaving the AI with no concrete evidence to reason from. Reading the source file fills the gap. UI renders origin chips per product (green `applied` / amber `pending`) so the engineer knows whether to verify against live data or the raw datasheet.

**JSON parse robustness.** `/investigate` now extracts the JSON object via two-stage parsing: (1) strip code-fence markers and try direct parse, (2) on failure, slice between first `{` and last `}` and retry. `max_tokens` bumped 1200 → 1600 because the prompt grew when pending-tier evidence was added. Surfaces `stop_reason` and `parseError` in the failure response so the UI can distinguish truncation from malformed JSON. Reasoning: occasional parse failures from preamble text or truncation; the slice fallback handles 90% of real-world drift.

**Unicode normalization for override key lookup.** `atlas_dictionary_overrides.param_name` is now normalized to `NFC + lowercase + trim` on both write (POST) and read (queue compute). Reasoning: same Chinese characters can be persisted in NFC vs NFD form depending on source-file encoding, and a row built later may use the other form. JS `toLowerCase()` alone doesn't handle this. Symptom: an engineer accepts a row, sees it disappear, then on hard refresh sees the same row back in Open. Fix lives in [app/api/admin/atlas/dictionaries/route.ts](../app/api/admin/atlas/dictionaries/route.ts) (`canonicalParamName` computed before insert) and [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) (`normalizeOverrideKey()` helper applied to both map construction and lookup).

**Wait-then-restart cache invalidation for dict mutations.** The dict POST/PATCH/DELETE routes now use `invalidateTriageQueueCacheAndAwaitFresh()` instead of the single-flight `invalidateTriageQueueCache()`. Reasoning: the immediately-following client refetch was racing the background recompute and serving pre-mutation cached state. Decision #182 lesson reinforced — for awaited callers needing post-commit freshness, drain in-flight + restart + await. ~1-3s extra latency on Accept; correct view on next refresh.

**Bulk normalized-match Accept ("+N similar").** When an engineer accepts a row that has cosmetic-duplicate paramName variants in the same scope (`T(mm)` ↔ `T (mm)` ↔ `t(mm)` — collapse to the same string under `s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')`), an info chip appears next to the Accept button: "+N similar". On Accept, the same `attributeId/Name/Unit` is fanned out to override rows for every match's paramName in parallel. × on the chip opts out of bulk mode for that single Accept. Reasoning: cosmetic variants are statistically common in Atlas Chinese ingestion (different MFR datasheets use different whitespace/paren styles for the same concept) and forcing N separate Accept clicks is busywork. Same-scope only — cross-family fan-out is in BACKLOG as a separate consideration.

**Surface UIDs (`TR-XXXXXX`).** Each Triage row gets a deterministic 6-hex-char hash UID (`paramUid()` exported from GlobalUnmappedParamsTable). Rendered as a copy-to-clipboard chip in the leftmost column. Search box now matches paramName OR UID. Same UID surfaces on AI Investigation Log rows for cross-page reference. Reasoning: engineers needed a stable way to refer to a specific row in Slack/tickets/follow-up sessions without copy-pasting Chinese paramNames. FNV-1a 32-bit hash → 6 hex chars = 16M slots, no DB / migration required, deterministic across machines and sessions.

**Per-paramName hydration guard.** `GlobalUnmappedParamsTable` previously gated state hydration on a single `fetchedRef` bool that fired once per mount. Switching from Open → Accepted status filter brought in a different `rows` set that never got hydrated, leaving accepted rows showing blank input fields and a misleading "Generate" CTA. Replaced with a `Set<paramName>` ref that hydrates each paramName once and lets new rows entering the prop on a filter switch get seeded. Hydration also now seeds `editedAttributeId/Name/Unit` from `r.acceptedOverride` when no AI suggestion is cached — synthesizing a `DictSuggestion` so the Accepted view shows the saved mapping with "Saved mapping." as the AI translation cell.

**Optimistic in-place mutations for flag actions.** Added `onRowFlagged` callback on the Triage panel, parallel to `onRowAccepted` / `onRowReverted`. Updates `data.unmappedParamsGlobal` in-place AND adjusts `triageCounts` (synonyms / autoFlagged / total) so the mode chips' badge counts update immediately on Confirm Wrong Family / Mark Unmappable / Revert. `confirmFlag` was also extended to fall back to the AI investigation verdict when `row.autoFlag` is missing — previously the handler bailed silently because the registry path was the only entry, leaving the AI's "Add wrong_family signature" button as a no-op.

**AI Log columns: UID, Attribute ID, Attribute Name.** AI Investigation Log table no longer wastes the middle of every row. Columns now: When · Who · UID · Param · Attribute ID · Attribute Name · Scope · AI Verdict · Conf. · Outcome. Attribute ID / Name extracted from `raw_response.recommendation.primaryActionPayload` at decision time (`primary` sub-key for disambiguation; direct fields for new_canonical / unit_mismatch). Other buckets show `—` in dimmed text.

**Files touched (summary):**
- New: [app/api/admin/atlas/triage-investigations/route.ts](../app/api/admin/atlas/triage-investigations/route.ts) — added `POST` handler for decision-time logging.
- Deleted: `app/api/admin/atlas/triage-investigations/[id]/route.ts` (PATCH endpoint, no longer needed).
- [app/api/admin/atlas/dictionaries/investigate/route.ts](../app/api/admin/atlas/dictionaries/investigate/route.ts) — pending-tier source-file fetch, JSON-parse fallback, `max_tokens: 1600`.
- [app/api/admin/atlas/dictionaries/route.ts](../app/api/admin/atlas/dictionaries/route.ts) — Unicode normalization on insert, `await invalidateTriageQueueCacheAndAwaitFresh()`.
- [app/api/admin/atlas/dictionaries/[overrideId]/route.ts](../app/api/admin/atlas/dictionaries/[overrideId]/route.ts) — same `await` invalidation.
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — `normalizeOverrideKey()` helper applied on both map construction and lookup.
- [app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts](../app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts) — `flagged` field handling, returns `flagged` in item payload.
- [app/api/admin/atlas/unmapped-param-notes/route.ts](../app/api/admin/atlas/unmapped-param-notes/route.ts) — selects + projects `is_flagged` → `flagged`.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — `paramUid()` helper, UID column, Flag toggle column, bulk normalized-match chip + handler, hydrateFromCache rewrite, `confirmFlag` AI-verdict fallback, accepted-row hydration synthesis.
- [components/admin/atlasIngest/TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx) — `flaggedOnly` filter chip + `flaggedCount` badge.
- [components/admin/atlasIngest/UnmappedParamNoteCell.tsx](../components/admin/atlasIngest/UnmappedParamNoteCell.tsx) — `NoteRecord.flagged` field.
- [components/admin/AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx) — `onRowFlagged` callback (in-place row + count mutations), `flaggedCount` memo, search-by-UID, filter-by-flagged.
- [components/admin/AtlasAiLogPanel.tsx](../components/admin/AtlasAiLogPanel.tsx) — UID + Attribute ID + Attribute Name columns; `extractMapping()` helper.
- [scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql) — added `is_flagged` column + partial index + relaxed `has_signal` CHECK to permit flagged-only rows.

**Deploy.** Apply [scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql) in Supabase SQL Editor (idempotent — adds column, recreates `has_signal` CHECK with the new clause, adds partial index). One-time SQL cleanup recommended to drop orphan pending rows from the audit table left by Decision #185's old logging behavior:
```sql
DELETE FROM atlas_triage_investigations WHERE action_taken IS NULL;
```

**Verification.** Type check clean. Manual end-to-end: (a) accept a row — confirm it disappears from Open and reappears in Accepted across page reloads (Unicode key + cache invalidation working); (b) flag a row via bookmark icon — confirm it shows under the Flagged filter chip and the count badge updates; (c) click Investigate then Confirm Wrong Family on an AI-detected row with no registry autoFlag — confirm row disappears from Open Synonyms, Auto-flagged count increments, AI Log gets a `flagged_wrong_family` row with the AI verdict captured; (d) click "+N similar" Accept on a row with cosmetic variants — confirm all variants drop from Open in one shot.

## Decision #187 — Proactive Staleness Signaling for Cached AI Suggestions/Investigations (May 2026)

Decision #186 wired the Triage page to silently auto-invalidate cached `/suggest` results when a family domain card was approved — a row that previously had an AI verdict reverted to "Generate" with no explanation. That was *anti*-proactive: the engineer lost context for why a verdict disappeared and had to spend tokens regenerating to figure out whether anything changed. With domain-card edits + logic-rule edits becoming a daily activity, this silent churn was burning trust and money.

**Decision: keep cached verdicts readable, mark them stale, and let the engineer choose to refresh.** Same pattern as the Domain Cards "Health" column — show both the old data and a staleness signal, engineer decides whether to act. Three coordinated changes:

**(1) Cache value carries versions at write, not the key.** Previously cardVersion was baked into the LS cache key, which made stale entries unreachable. Switched to:
```ts
type CachedSuggestion = {
  suggestion: DictSuggestion;
  cachedAt: number;
  cardVersionAtWrite: string | null;
  schemaVersionAtWrite: string | null;
};
```
Same for cached investigations. The key drops cardVersion; the value stores both versions. `SUGGEST_CACHE_VERSION` bumped `v6 → v7`, `SUGGEST_LS_PREFIX` `v6 → v7`, `INVESTIGATE_LS_PREFIX` `v9 → v10`, `SCHEMA_LS_PREFIX` `v5 → v6` so legacy entries clear on first read.

**(2) Schema fingerprint hash for proactive staleness.** New [lib/services/atlasSchemaVersion.ts](../lib/services/atlasSchemaVersion.ts) — `computeSchemaVersion(familyId)` returns a deterministic FNV-1a 32-bit hash over the stable parts of a family's logic-table prompt context: rule attributeId/Name/weight/engineeringReason + `FAMILY_PARAM_SIGNATURES` entries that target this family. Same input → same hash. Edit a rule's reason → hash changes → cached suggestions for that family flag stale on next page load. Hash purposely excludes domain-card text (cards and schemas evolve independently; surfacing WHICH one drove staleness is more informative than a single combined version).

**(3) Server returns current versions on /suggest, /investigate, and /family-schema.** Client compares `cached.{cardVersion,schemaVersion}AtWrite` against the server's current values per-render. Non-matches set `stalenessReason: "domain card updated"`, `"schema changed"`, or `"… and …"`. The family-schema endpoint becomes an always-refetched instant-render seed (LS cache is only for first-paint speed; staleness is determined by the live response).

**Visibility, not new chips.** The Triage row already carries 8+ chips (UID, family, category, status, AI verdict, override, flag, similar-count, MFR origin). Adding a "Stale" chip would compete for attention. Instead, three non-chip channels compound:
- **Row left-border accent** — 4px warning-amber stripe on stale rows. Visible at a glance while skimming a long queue; the eye picks up the vertical stripe before processing chip text.
- **Modify the existing AI verdict chip** — dotted warning border + 0.7 opacity (visually receded so engineer knows it's no-longer-fresh). Chip tooltip prepended with `⚠ Stale — domain card updated 2h ago. Click row's ↻ to refresh.`.
- **Inline ↻ refresh icon-button** — small, monochrome, ONLY rendered when stale (zero footprint when fresh). One-click re-fires `/suggest force=true` for the row.

**Aggregate: header banner + sort toggle, not filter.** When stale count > 0, a `<Alert severity="warning">` at the top of the Triage table reads `12 suggestions and 3 investigations in this view are stale because of recent card / schema changes. The AI verdicts shown may not reflect the latest context.` with two action buttons: `[Refresh 12 stale suggestions]` `[Refresh 3 stale investigations]`. Hidden when stale = 0 (no noise when fresh).

Plus a **"Show stale first"** sort toggle in `TriageFilterBar` (not a filter — engineers wanted to keep the full queue visible while triaging in stale-first order). When on, stale rows sort to the top with their existing sub-ordering preserved within stale/fresh groups.

**Reverse the silent invalidation.** Removed the `invalidateSuggestCacheForFamily()` call from the card-approve PATCH handler. Cards approving no longer wipes suggestion cache — the staleness signal does the work instead, and the cached verdict stays readable.

**Schema-LS cache trap (post-implementation fix).** First-cut implementation read schema versions from LS cache only on mount, with a 7-day TTL. Symptom: user edits a B7 card, no staleness UI appears on B7 rows because the schema-fetch hook short-circuited on the still-valid LS cache. Fix: always refetch the schema endpoint on mount (treating LS as instant-render seed only) and have the response handler **overwrite** version state unconditionally — not the cache-hit guard. The 7-day LS TTL stays but is purely a first-paint optimization, not a freshness contract.

**CJK normalization bug.** Bulk normalized-match (Decision #186) used `/[^a-z0-9]+/g` to compute the dedup key, which stripped Chinese characters and false-matched semantically different paramNames. Fixed with Unicode property escapes: `/[^\p{L}\p{N}]+/gu`.

**Files touched (summary):**
- New: [lib/services/atlasSchemaVersion.ts](../lib/services/atlasSchemaVersion.ts) — FNV-1a per-family schema fingerprint.
- [lib/services/atlasSuggestCache.ts](../lib/services/atlasSuggestCache.ts) — drop cardVersion from key, bump SUGGEST_CACHE_VERSION='v7'.
- [app/api/admin/atlas/family-domain-cards/[familyId]/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/route.ts) — removed `invalidateSuggestCacheForFamily()` from PATCH.
- [app/api/admin/atlas/family-schema/route.ts](../app/api/admin/atlas/family-schema/route.ts) — return `schemaIds` + `cardUpdatedAt` + `schemaVersion`.
- [app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts) — return `currentCardVersion` + `currentSchemaVersion`.
- [app/api/admin/atlas/dictionaries/investigate/route.ts](../app/api/admin/atlas/dictionaries/investigate/route.ts) — same, bump `INVESTIGATE_CACHE_VERSION='v9'`.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — cache-value shape, schema-state ref-mirroring, `computeStaleness()` helper, three per-row visual channels, header banner, schema-fetch always-refetch.
- [components/admin/atlasIngest/TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx) — "Show stale first" sort toggle.

**Deploy.** No SQL migration needed — all client/server changes. Caches auto-clear on first read because prefix versions bumped.

**Verification.** Type check clean; all 1557 tests pass. End-to-end: (1) cache a B7 row's suggestion, edit a B7 logic rule's engineeringReason, reload Triage → 12 stale B7 rows render with stripe + dotted chip + ↻ icon and a banner shows up with count. (2) Click "Refresh 12 stale suggestions" → confirm dialog shows stale-only count + cost (e.g. `12 rows, ~$0.06`); refresh fires only on the stale subset. (3) Click "Show stale first" → stale rows sort to top, full queue still visible. (4) Domain-card edit alone → only `cardVersion`-driven staleness fires (tooltip says "domain card updated"); schema-rule edit alone → only `schemaVersion`-driven (tooltip says "schema changed"). (5) Hard refresh on a fresh state → no stripe, no banner, no ↻ icon anywhere.

## Decision #188 — Engineer-Driven FAMILY_PARAM_SIGNATURES via DB Layer + One-Click Reclassify (May 2026)

Decision #185's wrong_family bucket surfaced a critical UX gap: when the AI Investigator high-confidence diagnosed a misclassification (e.g. `@IB(mA)` on YANGJIE products labeled as IGBT — IB is a BJT-exclusive parameter), the "Confirm" button only wrote `status='wrong_family'` to the notes table. The button label said *"Reclassify Products to B6 and flag @IB(mA) as B6 signature"* but did neither — it just recorded "engineer agrees this is misclassified" without actually moving products or persisting the rule. The engineer/developer had to:
1. Hand-edit [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) to add the signature
2. Code commit + redeploy
3. Run `scripts/atlas-reclassify-by-type-param.mjs` (or equivalent) to fix existing products

A non-technical user had no path to close this loop. The audit row from Decision #186 captured the engineer's intent, but the registry never updated and products stayed in the wrong family.

**Decision: lift FAMILY_PARAM_SIGNATURES from code-only to code + DB-merged, and make the Confirm button do everything in one click.** Three coordinated changes:

**(1) New table `atlas_family_param_signatures`.** Engineer-curated rows that augment the code baseline. Columns: `pattern` (regex source as text), `target_family_id` / `target_category` / `target_subcategory`, `reasoning`, `source` enum (`engineer_via_ai` | `engineer_manual`), `source_investigation_id` (optional FK to audit row), `is_active`, `created_by`. Unique active index on `(pattern, target_family_id)` — same pattern pointing to two different families is a real split and allowed. RLS: admins read/insert/update.

**(2) Server-side merge layer with code-wins-on-collision.** [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) gains:
- `loadAllFamilyParamSignatures()` — async loader that returns code-defined entries merged with active DB rows; 5-min in-process cache.
- `invalidateFamilyParamSignaturesCache()` — cache bust used by the POST endpoint.
- `detectForeignFamilyWithList(paramName, currentFamily, signatures)` — new variant that takes an explicit signatures list (queue route uses this with the merged set).
- `detectForeignFamily(...)` — unchanged behavior, still uses code-only baseline. Reserved for sync call sites (`atlasMapper.reclassifyByParameterSignals` at search-time, `atlasSchemaVersion`) that intentionally want the audited baseline.

Code-defined entries are the audited, tested baseline; DB rows are additive. On `(pattern, targetFamilyId)` collision, **code wins** — accidental DB rows cannot override audited behavior.

**(3) One-click POST endpoint persists + reclassifies in one shot.** New [/api/admin/atlas/family-param-signatures](../app/api/admin/atlas/family-param-signatures/route.ts). Body: `{ paramName, targetFamilyId, reasoning, (optional targetCategory/Subcategory) }`. The endpoint:
1. Escapes the paramName, wraps in `^...$`, validates as compileable regex.
2. Derives `(category, subcategory)` from any existing code-defined entry targeting the same family (or body params for new families).
3. INSERTs the signature row with `source='engineer_via_ai'`. On `23505` duplicate, fetches existing id and proceeds (engineer may be re-confirming after partial failure).
4. Calls `invalidateFamilyParamSignaturesCache()` so queue auto-flag picks it up immediately.
5. Calls `reclassify_products_by_param_key(param_key, target_family_id, target_category, target_subcategory)` RPC — single Postgres statement updates every row where `parameters ? <sanitized key>` AND `family_id != target`. The sanitized key mirrors `fromParametersJsonb`'s storage format (e.g. `@IB(mA)` → `ib_ma`).
6. Returns `{ productsReclassified, reclassifyErrors? }`.

**Sanitized key mirroring.** Unmapped params land in `atlas_products.parameters` JSONB under a sanitized key: `raw.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')`. The endpoint applies the same transformation so the Postgres `?` operator lookup uses the actual stored key. No regex match — the RPC does indexable JSONB key existence.

**atlas-ingest.mjs mirror.** Added `loadAndApplyFamilyParamSignatures()` next to the existing `loadAndApplyDictOverrides()`. Pulls active DB rows on script start and appends them to the local `FAMILY_PARAM_SIGNATURES` array (with the same code-wins-on-collision logic). Future ingests automatically apply engineer-curated signatures without code commits. Mirrors the pattern from Decision #176.

**UI wiring.** `confirmFlag` in [GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) splits two paths:
- **Registry auto-flag** (`row.autoFlag` set) — code registry already has this signature, only writes the notes row.
- **AI-investigation verdict** (`investigationVerdict` set, no `row.autoFlag`) — writes the notes row AND POSTs to `/api/admin/atlas/family-param-signatures`.

POST failure is non-blocking: the wrong_family note still persists; the signature failure surfaces in the Confirm tooltip as `Flag confirmed, but signature insert failed: …`. Lets the engineer retry without losing the underlying classification decision.

**Honest button label.** Wrong_family bucket no longer renders the AI's `primaryActionLabel`. Now displays: *"Confirm: reclassify to {familyId} + add signature"*. Matches what the click actually does. Caption above the JSON snippet changed from *"engineer adds to atlasFamilyParamSignatures.ts"* to *"Signature that will be persisted on Confirm"*.

**Retroactive reclassify RPC.** [scripts/supabase-atlas-family-param-signatures-schema.sql](../scripts/supabase-atlas-family-param-signatures-schema.sql) defines `reclassify_products_by_param_key(param_key, target_family_id, target_category, target_subcategory)`. SECURITY DEFINER, GRANTed to service_role only. Returns count of rows updated. Single Postgres statement keeps round trips minimal even when a signature affects hundreds of products.

**Lesson on layered side-effects.** First implementation considered splitting signature-insert and reclassify into two separate endpoints with a coordination layer in the client. Settled on one endpoint with two side effects because the engineer's mental model is "click Confirm" — splitting leaks coordination concerns into the client and creates a half-done state if the second call fails (signature persisted but products not moved, or vice versa). The endpoint encapsulates the transactional intent even though Postgres doesn't enforce it; the duplicate-row handling on `23505` and the reclassify-error array let the route be re-run idempotently.

**Files touched:**
- New: [scripts/supabase-atlas-family-param-signatures-schema.sql](../scripts/supabase-atlas-family-param-signatures-schema.sql) — table + RLS + reclassify RPC.
- New: [app/api/admin/atlas/family-param-signatures/route.ts](../app/api/admin/atlas/family-param-signatures/route.ts) — POST endpoint.
- [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) — added `loadAllFamilyParamSignatures()`, `invalidateFamilyParamSignaturesCache()`, `detectForeignFamilyWithList()`.
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — switched queue route to merged signatures (async load before classified.map).
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — added `loadAndApplyFamilyParamSignatures()` mirror, called from dispatcher next to dict overrides.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — `confirmFlag` AI-driven path POSTs to new endpoint; wrong_family button label override; signature snippet caption.

**Deploy.** Apply [scripts/supabase-atlas-family-param-signatures-schema.sql](../scripts/supabase-atlas-family-param-signatures-schema.sql) in Supabase SQL Editor.

**Verification.** Type check clean (excluding pre-existing test-file noise); atlasMapper tests 21/21 pass. End-to-end: confirm `@IB(mA)` on YANGJIE wrong_family row from the AI Investigator drawer → row drops from Open Synonyms (status=wrong_family), `atlas_family_param_signatures` row appears with `source='engineer_via_ai'`, all 5 affected YANGJIE products move from `family_id='B7'` → `family_id='B6'` in `atlas_products` (verified via service-role query). Re-clicking Confirm on the same row succeeds (duplicate-23505 path).

## Decision #189 — Atlas Explorer Search via SECURITY DEFINER RPC + Manufacturer Trigram Index (May 2026)

The admin Atlas MFRs → Search tab broke completely at ~114K rows in `atlas_products`. Every search returned 500 + 8s, blocked by Postgres statement_timeout (error code 57014, "canceling statement due to statement timeout"). User-visible symptom: "No Atlas products found for 'MJD122'" despite the rows clearly existing under multiple manufacturers.

**Root cause: two compounding issues.**

1. The endpoint used `.or('mpn.ilike.%${q}%,manufacturer.ilike.%${q}%')`. Postgres' planner doesn't pick up the `idx_atlas_products_mpn_trgm` GIN trigram index when the predicate is inside an OR — it falls back to sequential scan on 114K rows.
2. The `manufacturer` column had only a btree index, not a trigram. So even *alone*, substring ILIKE on manufacturer was always full-scan.

**Secondary problem: silent failure mode hid the issue.** The route's `catch {}` swallowed everything (including the timeout) and returned a generic `'Internal server error'` 500 with no detail. The client's catch then surfaced an empty `results: []` and rendered "No Atlas products found". Two layers of error hiding made it look like a data problem when it was a perf problem.

**Decision: SECURITY DEFINER RPC with explicit indexed CTEs.** New function [scripts/supabase-atlas-explorer-search-rpc.sql](../scripts/supabase-atlas-explorer-search-rpc.sql) defines `search_atlas_products_admin(q TEXT, lim INTEGER)` that:

1. **SECURITY DEFINER** — runs as table owner. Gives the planner consistent access to indexes regardless of who calls it. Resolves an additional unknown: the `authenticated` role's statement_timeout was set lower than the (already slow) sequential scan needed.
2. **`SET LOCAL statement_timeout = '30s'`** — headroom for cold cache. Cap that was killing the cookie-auth path doesn't apply inside the function.
3. **Explicit UNION over two indexed CTEs** — `mpn_hits` does `mpn ILIKE pattern LIMIT lim`, `mfr_hits` does `manufacturer ILIKE pattern LIMIT lim`. Each CTE is its own indexable predicate; UNION (with implicit dedup on `id`) joins them. Planner uses the trigram indexes on each side cleanly.

Plus migration adds `idx_atlas_products_manufacturer_trgm` (GIN trigram on manufacturer) — was missing from the base schema. `pg_trgm` extension ensured installed (idempotent).

**Route handler simplified to one RPC call.** [app/api/admin/atlas/explorer/route.ts](../app/api/admin/atlas/explorer/route.ts) now does `supabase.rpc('search_atlas_products_admin', { q, lim: 50 })` instead of the previous `.or()` query. Result shape unchanged from the caller's perspective.

**Error logging unsilenced.** Both error paths in the route now log to dev server console AND include a `detail` field in the 500 response body. Without this we'd never have found the timeout without service-role diagnostic queries.

**Performance.** Cookie-auth search for `MJD122` (3 rows): from timeout → ~200ms. `ACPR1208S100MT` (1 row): ~150ms. Both under the cookie-auth cap and well under the 30s function-local cap.

**Lessons.**
- **`.or()` over indexed columns is a planner regression risk.** Even with the right indexes, the planner may fall back to seq-scan when predicates are OR'd. Default to UNION when both sides are indexable.
- **Add trigram indexes on every column you ILIKE substring against.** Btree doesn't help for `%X%`. The base schema had it for mpn (where developers had been searching) but not manufacturer (which the explorer UI also accepts).
- **SECURITY DEFINER RPC is the right hammer for "slow under cookie auth but fast under service role"** workloads on big tables — bypasses both per-role statement_timeout disparities and any RLS-induced planning differences. Use sparingly because it bypasses RLS; gate via the route handler (`requireAdmin()`) instead.
- **Silent try/catch in route handlers hides real errors as empty results.** The pre-existing `catch {}` made the cookie-auth path look like a data bug for over a session of debugging. Default to surfacing `detail` + console.error on every server-route catch.

**Files touched:**
- New: [scripts/supabase-atlas-explorer-search-rpc.sql](../scripts/supabase-atlas-explorer-search-rpc.sql) — `pg_trgm` extension + manufacturer trigram index + SECURITY DEFINER RPC.
- [app/api/admin/atlas/explorer/route.ts](../app/api/admin/atlas/explorer/route.ts) — switched to RPC call; error logging unsilenced with `detail` field.

**Deploy.** Apply [scripts/supabase-atlas-explorer-search-rpc.sql](../scripts/supabase-atlas-explorer-search-rpc.sql) in Supabase SQL Editor. Idempotent — `CREATE EXTENSION IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION`. No data risk.

**Verification.** Cookie-auth search returns <250ms for both MPN substring and manufacturer prefix/substring queries on the 114K-row table. Full devtools Network confirms 200 + sub-second across multiple MFRs (`MJD122` → 3 rows, `ACPR1208S100MT` → 1 row, `Sunlord` → 50 capped). Service-role and cookie-auth paths now within 2x of each other.

## Decision #190 — Family-ID Validation Hardening: Four-Layer Defense Against AI-Hallucinated Family IDs (May 2026)

Decision #188 made the AI Triage Investigator's `wrong_family` verdict load-bearing — one engineer click now writes the signature to the persistent `atlas_family_param_signatures` table AND immediately reclassifies products via the RPC. A hallucinated `targetFamilyId` like the observed `"BJT_DIGITAL"` would have corrupted both the signature registry and `atlas_products.family_id` for affected rows. Decision #185's BACKLOG follow-up flagged this risk; this entry records the four-layer defense that closes it.

**Decision: build four independent layers, each able to catch an invalid family ID on its own, so a slip in any single layer leaves three behind it.**

**Layer 1 — Anthropic SDK enum constraint at the tool-use boundary.** [`/api/admin/atlas/dictionaries/investigate`](../app/api/admin/atlas/dictionaries/investigate/route.ts) defines the `submit_triage_verdict` tool's JSON schema with `enum: KNOWN_FAMILY_IDS_LIST` on every family-ID field (`actualFamilyId`, `signatureRecommendation.familyId`, `perProductProposals[].proposedFamilyId`). The model literally cannot return an out-of-set value via tool-use mode — the SDK rejects it at parse time. This was already in place pre-#190 but wasn't documented as a layer.

**Layer 2 — Server-side post-validation in the investigate route.** Same route runs `validateFamilyId()` from `atlasTriageContext.ts` on the parsed response as belt-and-suspenders. Failures surface via the response's `validationErrors` array, which the UI consumes to suppress the deep-analysis Primary Action button. Also already in place pre-#190.

**Layer 3 — `family-param-signatures` POST endpoint guard.** This is what #190 actually shipped. New helper [lib/services/validFamilyIds.ts](../lib/services/validFamilyIds.ts) exports `VALID_FAMILY_IDS` (set), `isValidFamilyId()`, and `listValidFamilyIds()` — derived from `logicTableRegistry` keys. **L3-only by design** because `atlas_products.family_id` is L3-only and that's the reclassify destination; the broader `KNOWN_FAMILY_IDS` in `atlasTriageContext.ts` (L3 + L2 category names) is for the investigate prompt where both kinds are valid expressions of intent, but only L3 is a valid *destination*. POST returns 400 with `code: 'INVALID_FAMILY_ID'` + the canonical list when `targetFamilyId` fails the check.

**Layer 4 — UI pre-flight in `confirmFlag`.** [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) checks `isValidFamilyId(autoDiagnosis.suggestedFamily)` before POSTing to the signatures endpoint. When invalid, skips the POST entirely and surfaces a specific message ("AI suggested unknown family 'X' — edit manually if needed") rather than a misleading "signature insert failed" tooltip from the 400 response.

**Why two separate valid-family-ID modules?** `validFamilyIds.ts` (L3-only) and `atlasTriageContext.ts`'s `KNOWN_FAMILY_IDS` (L3+L2) serve different consumers. L3-only modules: things that write to `atlas_products` or call the reclassify RPC. L3+L2 modules: things that interact with `atlas_dictionary_overrides` (which is scope-overloaded per Decision #178) or generate AI prompts (where L2 category names are valid as override scopes). Two named sets, two named purposes — never blur.

**Files touched:**
- New: [lib/services/validFamilyIds.ts](../lib/services/validFamilyIds.ts) — L3-only valid set + helpers.
- [app/api/admin/atlas/family-param-signatures/route.ts](../app/api/admin/atlas/family-param-signatures/route.ts) — added validation block + `INVALID_FAMILY_ID` error code.
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — `confirmFlag` pre-flight check.

**Verification.** Type check clean. atlasMapper tests 21/21 pass. End-to-end: a manually-crafted POST to `/api/admin/atlas/family-param-signatures` with `targetFamilyId: 'BJT_DIGITAL'` returns 400 + the canonical list. The original AI hallucination scenario (KEXIN `R1(KΩ)` row with AI suggesting `BJT_DIGITAL`) now blocks at the UI before reaching the server.

## Decision #191 — Atlas MPN-Quality Validator Phase 1: Detect Un-Matchable MPN Patterns at Ingest (May 2026)

A May-2026 survey across atlas_products found **250+ un-matchable MPN rows** spanning **5 MFRs and 4 distinct upstream-encoding patterns**: CREATEK's "Thru"/"Through" range entries (168 rows), "Series" sentinels (78 rows across CREATEK/AWINIC/KEXIN), GIGADEVICE's trailing-x placeholders, Geehy's slash-delimited variants, and (added May 18) Gainsil's mid-MPN `xx` placeholder pattern + Refond LED RGB `xx` mid-MPN. All five patterns produce rows that look like normal ingests but are silently unfindable by exact MPN lookup and pollute family-volume statistics. Originally a defer-line BACKLOG item; survey-driven escalation when "fourth MFR" and "200+ rows" trigger conditions both hit.

**Decision: ship phase 1 — detection + ingest-time surfacing + backfill survey tool. Expansion to actual MPN rows deferred to phase 2.**

**Five detection kinds** in [lib/services/atlasMpnQualityValidator.ts](../lib/services/atlasMpnQualityValidator.ts):
1. `range_thru` — Thru/thru/thur (CREATEK typo)/through, word-boundary anchored
2. `range_series` — "X Series" or KEXIN-style Chinese full-width `（Series）` wrapping
3. `placeholder_x` — trailing single x/X with TX/RX endings exempted, alphanumeric-before required
4. `placeholder_xx_midword` — Gainsil-style `-xx[A-Z][suffix]$`; conservative regex requiring alphabetic suffix after the `xx` to avoid false-positive on legitimate MPNs containing `xx` mid-word
5. `slash_variant` — `[A-Za-z0-9]/[A-Za-z0-9]` (slash not legal in any observed MFR MPN)

**Ingest-time wiring.** `mapManufacturerProducts()` in [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) collects issues per-batch and emits them on `report.mpnQuality` (optional field — back-compat with older batches that omit it). Mirror function in the .mjs script duplicates the TS detection logic byte-for-byte, per the established no-import-path convention (Decisions #174 / #176).

**UI surfacing.** [components/admin/atlasIngest/BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) renders a warning card on the per-batch UI when `mpnQuality.totalIssues > 0`, showing total count, per-kind breakdown, and a scrollable sample-MPN list. Only renders when issues exist (zero-noise design).

**Type extensions.** `IngestDiffReport.mpnQuality` added as an optional field to both [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) and [lib/services/atlasIngestService.ts](../lib/services/atlasIngestService.ts) — kept in sync per the existing duplication convention.

**Backfill survey.** [scripts/atlas-mpn-quality-survey.mjs](../scripts/atlas-mpn-quality-survey.mjs) — on-demand scan of existing `atlas_products` to catalog the legacy backlog. Uses indexed Postgres ILIKE filters with tightened patterns (`%-xx%` not `%xx%`, slash skipped because `%/%` times out). Survey is best-effort categorization based on ILIKE match — runtime detection in atlas-ingest.mjs is authoritative.

**Phase 1 explicitly does NOT expand.** Detection surfaces the problem; engineers either chase upstream cleanup at the MFR / dataset provider or hand-fix in SQL. Per-MFR voltage-code expansion is phase 2 (separate BACKLOG entry; deferred until engineer hand-fix load justifies the per-MFR-table build).

**Why ship phase 1 alone.** Phase 1 captures the visibility value (engineers see un-matchable rows at apply-batch time, not months later when a user search misses) without committing to the high-cost expansion-table maintenance. Phase 2 trigger conditions tied to engineer hand-fix load / backlog growth past 500 rows.

**Lessons.**
- **Survey-first decision-making.** The original BACKLOG estimate was "30 + 5 + 1 = 36 rows" based on opportunistic discoveries during domain-card reviews. A 5-minute survey via indexed ILIKE queries revealed 250+ rows — 8x estimate. Both trigger conditions hit simultaneously. Don't decide on shipping cost-vs-benefit without sizing the actual problem; opportunistic discovery underestimates by an order of magnitude.
- **Ingest validators framework is forming.** This is the fourth ingest-time-data-quality item in the P1 cluster (after suspicious-unit-value detector + Schottky/small-signal MPN-prefix recognizer + B6 misclassification cleanup). When the fifth lands, lift to a shared `lib/services/atlasIngestValidators/` framework rather than continuing per-pattern modules.
- **Survey-discovered MFRs.** Building the detector itself surfaced new MFR cohorts — Refond LED RGB `xx` placeholders weren't visible in the original CREATEK + GIGADEVICE + Geehy survey. Each new detection rule finds previously-invisible MFRs; the "if a new MFR exhibits the pattern" trigger condition was already self-validating before the build completed.
- **Tightening ILIKE patterns for backfill surveys.** `%xx%` and `%/%` are too common across 114K rows and time out under the cookie-auth statement_timeout. Tighten to `%-xx%` or skip the pattern and document the SQL-direct alternative. Same general rule from Decision #189: targeted ILIKE > broad pattern when working against indexed but timeout-bounded queries.

**Files touched:**
- New: [lib/services/atlasMpnQualityValidator.ts](../lib/services/atlasMpnQualityValidator.ts) — 5 detection kinds + summary helper.
- New: [scripts/atlas-mpn-quality-survey.mjs](../scripts/atlas-mpn-quality-survey.mjs) — backfill survey tool.
- New: [\_\_tests\_\_/services/atlasMpnQualityValidator.test.ts](../__tests__/services/atlasMpnQualityValidator.test.ts) — 23 cases.
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — mirror functions + integration in `mapManufacturerProducts()`.
- [lib/services/atlasIngestService.ts](../lib/services/atlasIngestService.ts) + [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) — `mpnQuality?` field added to `IngestDiffReport`.
- [components/admin/atlasIngest/BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) — warning card UI section.

**Verification.** 23 tests pass; type check clean. Backfill survey confirms 250 un-matchable rows across the expected MFRs + Refond as a newly-discovered cohort.

## Decision #192 — Atlas Family Domain Card Hallucination Audit + Phase 1 Grounded Generate (May 2026)

The AI Domain Cards system (Decision #185 / #186 lineage) lets engineers click "Generate" on a family row to fire an Opus 4.7 one-shot that writes a domain knowledge card injected into the Triage AI's `/suggest` and `/investigate` prompts. The original implementation fed Opus the family's logic-table rules + signature entries + accepted overrides + cross-family canonicals + a TS-fallback "existing hand-written card" as style reference. **It did NOT feed Opus any view of `atlas_products`.** Opus filled the resulting gap with priors — Western MFR cohorts (Murata GRM / Samsung CL / TDK CGA / Yageo / Kemet / Vishay / etc.) that exist in `atlas_manufacturers` as cross-ref targets but ship **zero products** under the relevant `family_id`.

The defect compounded through the manual review loop. When an engineer collaborated with Claude in-session to "refine" a card and pasted the built-in draft as context, Claude anchored on the seeded prose and treated MFR-cohort lines as facts to keep, not claims to verify. Across 12 cards drafted this way (12, 52, 71, B1, B3, B4, B5, B6, C1, C2, C3, C5), every single one shipped to `active` status with hallucinated cohorts.

**Audit (May 18, 2026).** Cross-checked every claimed MFR and MPN prefix in those 12 cards against `atlas_products` (verified MFR = ≥1 product under `family_id`; verified prefix = ≥1 product whose MPN matches the prefix under that family). Results: ALL 12 cards flagged SUSPECTED_HALLUCINATIONS. Headline numbers — family 12 (MLCC): **1/26 MFRs verified** (only CCTC); family 52: 5/21; family 71: 11/32; B1: 11/37; B3: 7/27; B4: 7/21; B5: 16/38; B6: 12/38; C1: 23/57; C2: 24/62; C3: 12/41; C5: 9/39. Western majors uniformly invented. Verified MFRs are uniformly Chinese (3PEAK, CHIPANALOG, COSINE, HONGWAN, DIOO, Ruimeng, BDASIC, CCTC, Fortior, Geehy, NOVOSENSE). Full per-card detail saved to [docs/audits/domain-card-audit-2026-05-18.md](audits/domain-card-audit-2026-05-18.md).

**Why this matters.** The hallucinated cards inject into every Triage `/suggest` and `/investigate` call. A Sonnet 4.6 model handed "this family ships Murata GRM and Samsung CL" as authoritative context will (1) generate confidence-inflated verdicts on Chinese-MFR rows by anchoring to a non-existent comparable, (2) lean toward "looks similar to a Murata GRM" reasoning when the actual data has none, (3) propagate the fabricated names into engineer-facing tooltips and the AI Log. Quiet error mode, hard to detect at the Triage row level.

**Fix — Phase 1: Grounded Generate.** Three components, ~2h build:

1. **New SQL migration**: [scripts/supabase-atlas-family-mfr-grounding-rpc.sql](../scripts/supabase-atlas-family-mfr-grounding-rpc.sql). Two SECURITY DEFINER RPCs — `get_atlas_family_mfr_grounding(familyId, mfr_limit, sample_limit)` returns the top-N MFRs by product count with sample MPNs in one round-trip (vs fetching all 18.7K family-71 rows app-side); `get_atlas_family_grounding_counts(familyId)` returns total product + distinct MFR counts for snapshot.

2. **New service**: [lib/services/atlasFamilyCardGrounding.ts](../lib/services/atlasFamilyCardGrounding.ts). `buildGroundingBlock(familyId)` calls both RPCs in parallel + extracts the family's Chinese-character dict entries from `atlasMapper.getAtlasParamDictionary()`. `formatGroundingForPrompt()` emits a plain-text VERIFIED_MFRS + GROUNDING_COUNTS + CHINESE_PARAM_DICTIONARY block.

3. **Refit endpoint**: [app/api/admin/atlas/family-domain-cards/[familyId]/generate/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/generate/route.ts). Parallel-fetches the grounding block alongside existing context. Adds **HARD ANTI-HALLUCINATION RULES** to the Opus prompt — explicit blocklist for Western majors (Murata / Samsung / TDK / Kemet / Yageo / Vishay / Panasonic / TI / ADI / Infineon / onsemi / Microchip / Maxim) unless they appear in VERIFIED_MFRS; "ONLY prefixes you can SEE in sample MPNs" rule; required explicit "Atlas currently has only N MFR(s)" line when VERIFIED_MFRS has fewer than 3 entries; Chinese conventions must come from CHINESE_PARAM_DICTIONARY verbatim. **Removes** the prior "EXISTING HAND-WRITTEN CARD" style-reference injection — that mechanism was anchoring Opus on its own prior hallucinations across regenerations. Adds `groundedAtProductCount` / `groundedAtMfrCount` / `verifiedMfrCount` / `chineseDictEntryCount` to `data_snapshot` so a future Phase 2 staleness signal can compare against current atlas state.

**Smoke test (B1 Regenerate, May 18).** Output cohort: YANGJIE, YFW, KEXIN, AK, Prisemi, ISC, JINGDAO, Jsmc, Rectron, CREATEK, Macmic, Techsem, CBI, YONGYUTAI, RUILON — 15 MFRs, all verified, zero Western intrusions. Card explicitly states "Do NOT introduce Vishay/onsemi/Diodes Inc/ST." MPN prefixes (1N4001-1N4007 JEDEC generics, 10A1-10A10 YANGJIE/YFW, ES1D-ES1J RUILON ultrafast, M1-M7 Prisemi SMA-body) all observable in the sample MPNs the grounding block delivered. Card density and idiosyncratic-knowledge load match or beat manual-drafted standard. Phase 1 verified working before fan-out.

**Why phase 1 alone is enough (for now).** The single highest-cost behavior was Opus hallucinating MFRs from priors with no grounding. Phase 1 closes that. Phase 2 (staleness signal — surface "card grounding stale, 152 new products since last save" on the Domain Cards panel) and Phase 3 (section-level diff dialog when regenerating an active card — preserve engineer prose, swap only grounding) are useful refinements but not load-bearing. They wait until Phase 1's grounding fix has stabilized across all 12 polluted families.

**Lessons.**
- **AI generators with no view of "what we actually have" hallucinate from priors.** The defect surface was identical to a developer pulling open a fresh repo and writing a feature based on the README without reading the code. Opus was given labels (logic-table rules) and authoritative templates (existing cards) but no view into the data state. That gap is exactly where priors leak in. Any future AI-assisted content generator on top of any data store must have a deterministic ground-truth-from-DB step before the AI step.
- **Style-reference injection propagates hallucinations across regenerations.** The "existing hand-written card → use this as your style guide" mechanism is the AI equivalent of cargo-culting. The model can't tell which parts of the reference are factual (the canonical attribute list) vs decorative (the MFR cohort) — it preserves both. Remove style references from anti-hallucination-bounded generators; convey style via explicit instructions instead.
- **Same anchoring mechanism applies to human-AI collaboration.** When the user pasted "here's what's in the system currently" prose into a Claude session and asked for refinement, Claude anchored on the seeded MFR list and treated cohort lines as facts to keep rather than claims to verify. This is the human-loop version of the style-reference problem — and it's why establishing "query atlas BEFORE seeing the existing draft" was the methodology fix that didn't take until the audit forced it.
- **Audit before patching.** Tempting fix path was to re-draft the cards manually and ship. Audit-first path (cross-check ALL claimed MFRs + prefixes against atlas_products) revealed the defect surface was 100% of cards, not the handful we'd noticed during MLCC redraft. Forced the structural fix (Phase 1 grounded Generate) instead of 12 one-off manual rewrites. Pattern: when you find one hallucination in AI-generated content, assume the same generator produced more, and audit before re-drafting.
- **Anti-hallucination prompt rules need explicit blocklists, not just positive constraints.** "Use ONLY MFRs in VERIFIED_MFRS" is necessary but not sufficient — the model will still surface a Murata reference as "comparable to" or "industry analog of." The explicit "Do NOT introduce Murata / Samsung / TDK / Kemet / Yageo / Vishay / Panasonic / TI / ADI / Infineon / onsemi / Microchip / Maxim" enumeration is what makes the constraint stick at output time. Mirror this pattern in other AI generators where prior-leakage is a known failure mode.

**Files touched:**
- New: [scripts/supabase-atlas-family-mfr-grounding-rpc.sql](../scripts/supabase-atlas-family-mfr-grounding-rpc.sql) — 2 SECURITY DEFINER RPCs.
- New: [lib/services/atlasFamilyCardGrounding.ts](../lib/services/atlasFamilyCardGrounding.ts) — `buildGroundingBlock` + `formatGroundingForPrompt`.
- [app/api/admin/atlas/family-domain-cards/[familyId]/generate/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/generate/route.ts) — grounding fetch + HARD ANTI-HALLUCINATION RULES + removed existingCardSection + extended data_snapshot.
- New: [docs/audits/domain-card-audit-2026-05-18.md](audits/domain-card-audit-2026-05-18.md) — full per-card audit report.

**Verification.** B1 Regenerate output meets the manual-drafting bar. Type check clean. Migration to be applied to production Supabase before Generate can be re-run on the other 11 polluted families.

## Decision #193 — Domain Card Phase 2 (Grounding-Drift Signal + No-Card Volume Awareness + Flag Auto-Clearance) + May 20 Production-Stability Lessons (May 2026)

Three follow-up changes to Decision #192's domain card system, plus a hard-earned set of production-stability lessons from a same-day Supabase resource-exhaustion cascade. All shipped May 19-20, 2026.

### Phase 2 — Grounding-Drift Signal

Phase 1 (Decision #192) added `groundedAtProductCount` / `groundedAtMfrCount` snapshot fields to `atlas_family_domain_cards.data_snapshot` at card-Generate time. Phase 2 surfaces this snapshot as a **proactive Health-chip signal** so engineers see "this card's grounding cohort is stale because new MFRs/products landed" without having to wait for the slower flagCount signal to accumulate.

**New SECURITY DEFINER RPC** in [scripts/supabase-atlas-family-mfr-grounding-rpc.sql](../scripts/supabase-atlas-family-mfr-grounding-rpc.sql): `get_atlas_all_family_grounding_counts()` returns per-family current product+MFR counts in one round-trip. Used by `/api/admin/atlas/family-domain-cards` route to populate `currentGroundingCounts` for every family in parallel with the existing flag-count + DB-row fetches.

**`computeDomainCardHealth` extended** in [lib/services/atlasFamilyDomainCards.ts](../lib/services/atlasFamilyDomainCards.ts) to compute `groundingProductDrift` + `groundingMfrDrift` (clamped non-negative) and roll into worst-case tier:
- Red (`refresh-recommended`): ≥3 new MFRs OR ≥500 new products
- Yellow (`consider-refresh`): ≥1 new MFR OR ≥100 new products
- Tooltip explicitly distinguishes which signal fired (flag / rule-drift / grounding-drift) and what action clears each — preventing the May 19 confusion where regenerating cards didn't drop the chip (flag count is rolling-30-day, not regen-cleared).

### No-Card Chip Volume Awareness

Original no-card chip was binary (card exists / doesn't) regardless of atlas activity. A family with 1,143 products from 22 MFRs but no card showed identical UI to a dormant zero-products family. Operators couldn't tell which uncarded families were urgent.

Fixed by:
1. Computing drift even for no-card families (against zero baseline — current volume IS the drift). Stored in `groundingProductDrift` / `groundingMfrDrift` so downstream logic treats it uniformly with carded families.
2. Reason text differentiates priority: "HIGH PRIORITY: 1,143 products from 22 MFRs with no domain coverage. Click Generate ASAP" vs "Family is dormant" vs "LOW PRIORITY: 89 products..."
3. Sort within no-card tier by `groundingProductDrift` desc so urgent uncarded families bubble above dormant.
4. Chip visual override in [AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx) — no-card chip now renders as 🔴 / 🟡 / ⚪ + count based on volume, matching refresh-recommended urgency.

May 20 audit ran via subagent: surfaced 7 HIGH-priority uncarded families (C4 Op-Amps top with 1,143 products / 22 MFRs) plus 5 MEDIUM + 14 dormant. Without this fix, all of those were silently labeled identically — engineers wouldn't have known C4 needed a card.

### Flag Auto-Clearance on Card Activate

The `flagCount` signal counts AI-emitted `atlas_ai_context_flags` rows where Sonnet self-flagged `needsDomainCard: true` during a /suggest call. Per Decision #186, flags only cleared via the 30-day rolling window or by future /suggest calls stopping the bleed.

Surfaced gap: when an engineer regenerates a card and approves the new draft, the new card presumably addresses the gaps the old flags pointed at. But the chip stayed red for 30+ days regardless, which trained operators to ignore the signal.

Fixed in [app/api/admin/atlas/family-domain-cards/[familyId]/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/route.ts) PATCH handler: when status transitions to 'active', fire-and-forget DELETE on `atlas_ai_context_flags` rows for that family with `flagged_at < approved_at`. Fire-and-forget so flag cleanup failure never blocks the approve action; flags are advisory by design.

### Triage AI Verdict Filter

Adjacent UX win: added `aiVerdict: 'all' | 'accept' | 'defer' | 'none'` field to `TriageFilters` ([components/admin/atlasIngest/TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx)) with a ToggleButtonGroup. Filter applies inside [GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx)'s `orderedRows` useMemo where per-row suggestion state lives. `viewKey` includes the filter so pagination resets on toggle.

Without this, operators had to scroll the entire 500+ row queue looking for green Accept verdicts to burn through. Now: click "Accept" toggle, see only Accept-verdict rows clustered together, blast through them.

### Ingest Reliability Hotfixes

Three statement_timeout fixes shipped same day:
1. Upload cap bumped 50MB → 200MB in [app/api/admin/atlas/ingest/upload/route.ts](../app/api/admin/atlas/ingest/upload/route.ts) (72MB MFR dump triggered cap).
2. atlas-ingest.mjs upsert chunk: 500 → 100 (SG Micro statement_timeout on heavy JSONB upsert).
3. atlas-ingest.mjs snapshot chunk: 200 → 50 (SIMCOM snapshot insert timeout — even on a 1.9MB file, because snapshots carry full prev_row JSONB which is heavy per row).

Plus a 15s timeout wrapper in [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) cold-compute path — page renders degraded (0/0/0 triage counts) instead of hanging when L2 cache is cold and the aggregation RPC is slow at current scale. **This is a band-aid pending the proper RPC optimization (BACKLOG P1).**

### Production-Stability Lessons (May 20 Cascade)

Late in the session, attempted to "fix" slow Proceed responsiveness by switching from `invalidateTriageQueueCacheAndAwaitFresh` to fire-and-forget plain `invalidateTriageQueueCache`. Theory: page-loads would hit L2-cached and respond fast, while Proceed didn't have to wait for full recompute. **The theory was wrong.** L2 was cold for several routes, so page-loads hit the cold-compute path and hung. Cost was shifted from Proceed (where operator expects to wait) to page-load (where operator expects instant response). Reverted both routes back to await-fresh.

This contributed to a Supabase resource-exhaustion event: hung triage queue computes held connections; multiple consecutive hangs exhausted the free-tier connection pool; eventually the project's auth endpoints stopped responding even to login attempts. User had to upgrade Supabase Free → Pro ($25/mo flat) AND Nano → Small compute ($15/mo) to recover, plus restart the project to drain connections, plus accept a Postgres version upgrade prompt mid-recovery.

**Lessons (engraved in this decision because they should constrain future engineering judgment):**

1. **Cost-shifting between routes does not optimize.** If a query is fundamentally expensive, paying for it on route A vs route B is a wash — the total compute load on the database is unchanged. Real optimization means reducing the query cost itself (indexes, materialized aggregates, etc.). Resist the temptation to "make this route fast by moving work to another route."

2. **Postgres connection pool exhaustion has cascading failure modes.** Hung queries don't release connections cleanly; the pool fills; subsequent requests (including unrelated ones like auth) start failing. The symptoms look like "Supabase is down" but the root cause is on your side. Watch connection-pool metrics; alert on pool saturation BEFORE hung-query backlog cascades.

3. **Free tier is not viable for production-bound work.** Pro plan ($25/mo) unlocks: no auto-pause (Free pauses inactive projects — would 5xx for customers), PITR backups (no recovery from "oops"), upgradeable compute (Free locked at Nano = 0.5 GB RAM), email support, longer log retention. The compute upgrade alone is irrelevant on Free since you can't change tiers without Pro.

4. **Compute upgrade is a symptom-fix not a root-cause-fix.** Small tier ($15/mo, 2 GB RAM, dedicated CPU) gave immediate headroom, but the underlying inefficient RPC remains. Compute upgrade buys time; query optimization is still required.

5. **Don't ship infrastructure changes (Postgres upgrade, etc.) during incident recovery.** Mid-cascade, Supabase prompted user to upgrade Postgres. User clicked through. Lucky it completed cleanly — could just as easily have added a second failure mode on top of the first. Defer infra changes to known-good windows.

6. **Solo development on production-bound code requires extra discipline.** No human reviewer caught the cost-shifting error before it shipped. Mitigations: every meaningful change runs `npx tsc --noEmit` before commit (already standard); for SQL migrations and route handler logic, propose plan + get user approval before coding; consider `/ultrareview` before deploying any session's work to customers.

### Files Touched

- [scripts/supabase-atlas-family-mfr-grounding-rpc.sql](../scripts/supabase-atlas-family-mfr-grounding-rpc.sql) — new `get_atlas_all_family_grounding_counts()` RPC
- [lib/services/atlasFamilyDomainCards.ts](../lib/services/atlasFamilyDomainCards.ts) — extended DomainCardHealthDetail + DomainCardDataSnapshot, no-card volume awareness, fetchCurrentGroundingCountsByFamily
- [app/api/admin/atlas/family-domain-cards/route.ts](../app/api/admin/atlas/family-domain-cards/route.ts) — wired grounding counts + no-card sort
- [app/api/admin/atlas/family-domain-cards/[familyId]/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/route.ts) — flag auto-clearance on activate
- [components/admin/AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx) — chip visual override for no-card volume tiers
- [components/admin/atlasIngest/TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx) — AI verdict filter UI
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — filter applied in orderedRows
- [components/admin/AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx) — pass aiVerdict + include in viewKey
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — upsert + snapshot chunk reductions
- [app/api/admin/atlas/ingest/upload/route.ts](../app/api/admin/atlas/ingest/upload/route.ts) — 50MB → 200MB cap
- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — 15s timeout wrapper for cold-compute degradation

### Verification

All edits type-clean (`npx tsc --noEmit`). Phase 2 chip visual verified live by user (7 no-card HIGH families surfaced with red chips). AI verdict filter verified by user clustering Accept verdicts. Ingest chunk fixes verified by user successfully proceeding SG Micro and SIMCOM batches. Production-stability lessons verified by the cascade itself.

---

## Decision #194 — Measure-First Discipline: Don't Ship the Triage RPC Optimization (May 21, 2026)

### Context

The May 20 production cascade (Decision #193) ended with a 15s timeout wrapper around `computeTriageAggregation()` in `app/api/admin/atlas/ingest/batches/route.ts` — a band-aid covering for cold-compute observations of 30–90s on the triage queue aggregation. The BACKLOG P1 entry "Optimize computeTriageAggregation" proposed two structural fixes: **Option A** (CTE restructure + `MATERIALIZED` hint to eliminate repeated JSONB scanning in `get_triage_unmapped_aggregate`) and **Option B** (precomputed per-batch unmapped-summary table).

The plan for May 21 was: baseline measure → ship Option A → measure again → decide on B.

### Decision

**Do not ship Option A. Do not ship Option B. Remove the 15s timeout band-aid.**

The pre-optimization baseline showed `get_triage_unmapped_aggregate` running in **707ms cold / 266ms warm** against current production scale (31 applied batches, 907 dictionary overrides, 171K atlas_products). The 30–90s symptom that motivated the BACKLOG entry does not reproduce.

Three things changed between the bad observation and the new baseline:
1. **Compute tier upgrade** Nano → Small (Decision #193, May 20)
2. **Postgres major-version upgrade** (Supabase user-initiated, night of May 20→21)
3. **24h of natural query-plan + buffer warming** at the new tier

The bottleneck was Nano-tier resource contention under Free-tier connection pool exhaustion, not an RPC algorithmic problem. The CTE structure that A would have optimized was not the actual cost driver.

### Why Not Just Ship A Anyway

A was a low-risk one-keyword change (`MATERIALIZED` on the `expanded` CTE) plus an optional single-pass restructure. Tempting to ship because "it can't hurt." Reasons to hold:

1. **Measurement attribution breaks.** If we ship A on top of the upgrade and future-us sees `get_triage_unmapped_aggregate` running fast, we won't know whether A or the upgrade was responsible. That ambiguity bites the NEXT time something looks slow — we'd waste a cycle re-deriving what we already know.
2. **Yesterday's lesson** (Decision #193): cost-shifting is not optimization. Optimizing against a symptom that no longer exists is a related failure mode — fixing what isn't broken.
3. **Solo-dev discipline.** No human reviewer to catch "you optimized the wrong thing." Holding off when the data doesn't support shipping is the discipline mechanism.

### Actions Taken

1. **Removed the 15s timeout wrapper** in `batches/route.ts`. The cold-compute path now awaits `computeTriageAggregation()` directly with a comment pointing to this decision. Total LOC removed: ~20.
2. **Ran `ANALYZE`** on the four hot tables (`atlas_ingest_batches`, `atlas_products`, `atlas_dictionary_overrides`, `atlas_unmapped_param_notes`) to refresh planner statistics post-PG-upgrade. `pg_trgm 1.6` / `pgcrypto 1.3` / `plpgsql 1.0` all on current versions — no extension lag from the upgrade.
3. **Marked the BACKLOG entry resolved** with explicit "watch triggers" (cold compute > 5s, Proceed wait > 10s, applied batches > 75) that would re-open it.

### Watch Triggers (Re-open If Any Fire)

- Cold compute on `get_triage_unmapped_aggregate` climbs back above 5s on a fresh measurement.
- Operator-perceived Proceed wait exceeds 10s in real use.
- Applied-batch count crosses 75, OR per-batch JSONB unmapped-entry counts trend up sharply (signal that scale is finally hitting the algorithmic ceiling A would have addressed).
- A second symptom emerges that ALSO maps to JSONB-scanning cost (e.g. atlas-coverage RPC slowing) — at that point the structural fix would resolve a class of problems, not just one.

### Lessons

1. **Re-baseline before optimizing — especially after infra changes.** A 24-hour-old performance observation is not a current baseline. The work to confirm "still slow" is cheap (one script run); the work to ship + later re-ship if wrong is expensive.
2. **Compute upgrades and algorithmic optimizations address different failure modes.** When both are theoretically applicable, do compute first (cheap, reversible) and re-measure before doing algorithmic (irreversible code commitment). Skipping the re-measure is what causes the cost-shifting failure pattern from #193.
3. **The 15s timeout band-aid should not have been left in for "one more session of safety."** It hid the underlying state — was the RPC fast, or was the timeout firing? Removing band-aids promptly when the underlying issue is resolved keeps the system's behavior legible.
4. **A decision to NOT ship is still a decision worth documenting.** Future-me looking at this codebase six months from now should be able to find this entry and understand why there's no Option A / Option B sitting around as half-finished work.

### Files Touched

- [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — removed 15s timeout wrapper; cold-compute path now awaits directly
- [docs/BACKLOG.md](BACKLOG.md) — marked `Optimize computeTriageAggregation` entry resolved with watch triggers

### Verification

Baseline measured via temp script timing the live Supabase RPC: 707ms cold, 266–268ms warm across two consecutive calls. Extension versions confirmed current via SQL Editor. `ANALYZE` completed on hot tables without error. `npx tsc --noEmit` clean after timeout removal.

---

## Decision #195 — Auto-Audit Pattern for AI-Generated Content (May 21, 2026)

### Context

Decision #192's Phase 1 grounding (May 18, 2026) was supposed to eliminate Western-MFR hallucinations in atlas family domain cards by injecting verified atlas_products data into the Generate prompt. May 21 review of the C4 (Op-Amps / Comparators / In-Amps) draft card revealed Phase 1 is necessary but **not sufficient** — even with correct grounding data in the prompt, the AI still produced:

- **`DIA- (DIOO)` prefix claim** — DIOO's grounding samples literally showed `DIO2331`, `DIO2554G`, `DIO2352B`. AI saw `DIO` and wrote `DIA`.
- **`HAD- (HXYMOS)` prefix claim** — HXYMOS uses an `-HXY` SUFFIX, not a `HAD-` prefix. No `HAD` anywhere in grounding data.
- **COSINE missing from jellybean MFR list** — COSINE is the 3rd-largest C4 MFR (169 products, including LM-series clones); grounding data included it; output didn't.
- **`放大器数 → channels` claim** — phrase doesn't exist in atlasMapper.ts C4 dictionary at all.
- **`isc(ma) → output_current` claim** — no isc mapping in dict; `output_current` rule receives zero Chinese-source data.

### Root Cause — The Limits of Prompt-Based Grounding

An LLM is not a database client. It's a probability machine. When generating each token, the output distribution is a mix of:
1. Grounding context in the prompt (e.g. `DIOO — samples: DIO2331, DIO2554G, ...`)
2. Training priors (Chinese fabless MFR conventions, datasheet-style prefix patterns)
3. Pattern plausibility (what "looks right" for the slot)

Putting accurate data in the prompt **shifts probabilities** toward the right answer. It does not **enforce** them. Hard rules in the prompt ("ONLY prefixes you can SEE in sample MPNs") are themselves just text — the model can violate them, especially when its priors are strong.

This is why Decision #190's four-layer family-ID defense works: the constraint is at the **tool-use enum schema** layer, not the prompt. The SDK literally rejects any out-of-set value before it reaches application code. Prose generation has no equivalent enforcement mechanism — every claim in free-form text is a place where priors can win against grounding.

### Decision

Build the auto-audit pattern: **any AI-generated content with factual claims gets cross-checked against authoritative sources automatically, with results surfaced to the engineer at decision time.**

Phase 1 of this pattern (shipped today, this session):
- New script `scripts/atlas-audit-domain-cards.mjs` cross-checks every active + draft card against `atlas_products` + `atlas_manufacturers` + `atlasMapper.ts`.
- Four classes of check: BOGUS MFR / MFR OMISSION / WRONG PREFIX / FABRICATED DICT.
- Heuristic / regex-driven — explicitly informational, not gating. Engineer eyeballs flagged items.
- Run on demand via CLI (`node scripts/atlas-audit-domain-cards.mjs`).

Phase 2 (planned, next session): wire the audit into the Generate endpoint so it runs automatically when a card is produced. Results persist in a new `atlas_family_domain_cards.audit_results` JSONB column. UI shows audit summary alongside card content. Optional configurable threshold blocks Activate when critical issues are present. **Tracked in BACKLOG as a discrete entry**.

Phase 3 (future): apply the same pattern to other AI-generated content where it can be automated — Triage AI suggester verdicts, Triage AI investigator action buckets, AI suggestion explanations on overrides. Where deterministic ground-truth checks exist, run them automatically alongside the AI output.

### Refinements During Build (Real Findings)

The audit script went through several debug iterations against the C4 card. Each iteration surfaced a class of false positive that taught a generalizable lesson:

1. **Supabase 1000-row default cap on `.select()` causes long-tail MFR omissions in family ranking** — bit me when NOVOSENSE/Corebai/HXYMOS at the tail of C4's 1,250-row population didn't appear in my ranked-MFR computation. Fix: `fetchAllPages()` helper paginating in 1000-row chunks. Same pattern as Decision #123.
2. **Case-insensitive MFR-name matching collides with circuit-analysis abbreviations** — "isc(ma)" matched ISC the MFR; "(CMOS/JFET)" matched Cmos the MFR. Fix: case-sensitive boundary check for short ASCII MFR names, case-insensitive for Han/long names.
3. **`atlas_manufacturers.aliases` carries lowercase normalizer variants** that defeat case-sensitive matching — ISC's aliases include `'isc'`. Fix: drop aliases that are merely lowercase forms of an existing primary name.
4. **"Any sample starts with prefix" check passes when MFR has one outlier part** — DIOO has 19 DIO-prefix MPNs and one DIA20722, so claiming "DIA- (DIOO)" passed. Fix: prefix-distribution analysis (≥20% share + top-2 rank).
5. **Prefix regex `[A-Z][A-Z0-9]{1,8}` is too loose** — extracted MPN-substrings like "NCA9545" and "N4007" as prefix claims. Fix: 2-5 char cap.
6. **Strict X→Y arrow regex misses prose-embedded claims** — "放大器数 and 通道数 both → channels" doesn't match because of intervening words. Fix: proximity check (arrow OR attributeId-shaped token within 50 chars after Chinese phrase).
7. **Omission check flags trivial-cohort MFRs as editorial oversights** — HXYMOS with 2 products in B8 isn't a card omission, it's a focus decision. Fix: threshold ≥100 products AND ≥3% of family.
8. **Common technical abbreviations get matched as MFR names** — `DC 东晨`, `HC 虹成电子`, `PTC 普诚`, `Fast 法思特`, `Milliohm 毫欧` all triggered BOGUS_MFR flags because cards discuss DC bias, 74HC logic, PTC thermistors, fast recovery, milliohm units. Fix: `MFR_NAME_BLOCKLIST` for known technical-term collisions.

### Baseline Audit Results (May 21, 2026, 22 cards)

After refinements: 41 issues across 16 cards. Notable real catches beyond C4:
- **Family 52 (Chip Resistors): TA-I omitted** — 3,341 products = 86% of family. Major omission.
- **Family C2 (Switching Regulators): Richtek named but doesn't ship; DELTA D12-prefix claim doesn't match actual PJ-prefix MPNs**
- **Family B5 (MOSFETs): HXYMOS (10%) and SWST (8%) omitted**
- **Family 12 (MLCCs), 58 (Aluminum Electrolytic), 59 (Tantalum), 65 (Varistors), C3 (Gate Drivers): each have at least one fabricated Chinese dict claim**

A few remaining false positives expected (`THD 台华达` in C9 vs Total Harmonic Distortion abbreviation; `RS 容硕` in C7 vs RS-485 protocol) — acceptable for a heuristic check. Engineer eyeballs flagged items.

### Lessons

1. **Prompt-based grounding is necessary but never sufficient for AI-generated factual claims.** Even with the exact correct data in the prompt, the model can produce contradicting output. Pair every grounding pass with a verification pass against the same source.
2. **Verification scope must match generation scope.** If the AI generates prose covering MFR cohort + prefixes + dict claims + sub-types, the audit needs all four checks. Partial verification gives false confidence.
3. **Where structured output is possible (tool-use with enum schemas), use it instead of post-hoc verification.** Decision #190's family-ID enum is the cleanest example: the model literally can't generate an invalid value. Prose can't be enum-constrained, so prose needs verification.
4. **Generalize the pattern across all AI-generated content.** This is not just about family domain cards. Triage AI verdicts, AI investigator analyses, AI suggestion explanations all share the same structural risk. Decision #190 added it for family-ID specifically; we should look at where else the pattern applies.
5. **Heuristic audits are valuable even when imperfect.** 41 flagged items took ~2 min to scan and surfaced ~30 real issues. False-positive rate ~25% is fine when the alternative is no automated check at all.

### Files Touched This Session

- [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) — new audit script (406 lines)
- [docs/BACKLOG.md](BACKLOG.md) — entry for next-session Phase 2 work (auto-audit-on-generation + Activate gating)
- [CLAUDE.md](../CLAUDE.md) — script inventory updated to reference audit script

### Verification

Script tested against C4 (where errors were known): caught DIOO/DIA, HXYMOS/HAD, and `放大器数` correctly after refinements. Full-corpus scan completed in ~45s, surfaced 41 issues across 16 cards. False positive rate manually assessed at ~25% — acceptable for a heuristic-first check.

---

## Decision #196 — Qualification-Domain Filter Phase 1.5: Hard-Exclude Commercial / Industrial-Harsh Under Automotive (May 2026)

### Status

RESOLVED.

### Context

A user reported that when they answered **Automotive** in the replacement context questions, the system still returned candidates without AEC qualification. Investigation traced the bug to the qualification-domain compatibility matrix (`isDomainCompatible` in `lib/services/qualificationDomain.ts`):

- Phase 1 (Decision #155) hard-excluded only `medical_implant`, `medical_general`, `mil_spec`, `space` under automotive context.
- `commercial` and `industrial_harsh` returned `{ compatible: true, deviation: true }` — they passed the filter, just with a downstream badge.
- The `aec_q200` rule in MLCC family 12 had its `escalate_to_mandatory` context effect removed when #155 shipped (the rule is `identity_flag`, which short-circuits to pass when source has no AEC field — common in Digikey/Atlas/parts.io data).

Net result: the automotive context Q had no effective gate against non-qualified parts, contrary to user expectation.

### Decision

Tighten the automotive row of the compatibility matrix to hard-exclude `commercial` and `industrial_harsh` candidates. Keep `unknown` candidates visible.

The three-state distinction matters:

| Candidate domain | Under automotive context | Why |
|---|---|---|
| `automotive_q200` / `_q100` / `_q101` | Show, no badge | Confirmed qualified |
| `commercial`, `industrial_harsh` | **Hard exclude** | Classifier emitted these only with positive evidence the part is NOT automotive (e.g. Murata GRM series → commercial) |
| `medical_*`, `mil_spec`, `space` | Hard exclude | Phase 1 — cross-domain incompatible |
| `unknown` | Show, no badge | Most Atlas products + non-classified MFRs land here; AEC field is rarely populated in Atlas extractions even when the part IS qualified. Hiding `unknown` would wipe out legitimately-qualified Chinese-MFR + TDK / Samsung / Yageo MLCC + similar cohorts |

### Critical asymmetry — why `unknown` stays visible

Atlas products typically lack the `aec_q200` attribute even when the part is AEC-qualified. The asymmetric `upgradeFromAttributes` already handles the positive case (only `aec_q200 = "true"` upgrades unknown → automotive_q200; missing or "false" stays unknown — see #155). The matrix mirrors this asymmetry: only `commercial` / `industrial_harsh` (positive evidence of NOT qualified) trigger exclusion. Filtering on field-absence would punish parts for living in a less-rich data source.

### Scope

The filter site in `partDataService.ts:1431` is already family-agnostic — it runs whenever the user picks automotive context, regardless of family. So this matrix change applies uniformly to every family that has an automotive context option. No per-family wiring needed.

Note: classifier coverage is still Phase 1 (Murata MLCC only). For all other MFRs and families, candidates land in `unknown` and remain visible — correct behavior given Atlas constraints, but it means TDK CGA / Samsung CL series MLCCs (which ARE automotive-qualified) currently show un-badged-as-qualified rather than as confirmed-qualified. Promoting these from `unknown` → `automotive_q200` is the natural Phase 2 work tracked in BACKLOG: expand classifier registry to TDK / Samsung / Yageo / KEMET / AVX / Kyocera / Taiyo Yuden + non-MLCC families.

### Files Touched

- `lib/services/qualificationDomain.ts` — `isDomainCompatible` matrix update (commercial + industrial_harsh → hard exclude)
- `lib/contextQuestions/mlcc.ts` — refresh stale comment on empty `attributeEffects` array
- `__tests__/services/qualificationDomain.test.ts` — flip two test cases to assert hard exclusion + add explanatory note about `unknown` safety

### Verification

- 36 / 36 tests in `qualificationDomain.test.ts` pass.
- `npx tsc --noEmit` — no new errors in touched files.
- End-to-end smoke (deferred to first real cross-ref run by user): search for an MLCC where Atlas/non-Murata candidates appear, answer Automotive, confirm GRM-series Murata candidates are excluded and Atlas + TDK candidates remain (with verify-qualification badge).

### Lessons

1. **Soft deviation flags don't satisfy user intent.** When a user explicitly says "automotive," they expect a gate, not a hint. The deviation/badge UX assumed the user would do final filtering — they don't.
2. **Decision #155's Phase 1 was correct about the mechanism, wrong about the matrix.** The architectural choice (domain filter as enforcement layer, not rule escalation) holds up. The matrix configuration was over-conservative on commercial/industrial_harsh.
3. **Asymmetry is a feature.** `unknown` exists because data is incomplete; treating it as "not qualified" would conflate "unknown" with "no" — which the entire Atlas cohort depends on us NOT doing.
4. **Test fixtures sometimes encode buggy expectations.** The Phase 1 tests asserted `commercial under automotive → deviation flag` — exactly the behavior the user reported as broken. Flipping the tests was as important as flipping the code.

### Addendum — Duplicate AEC-Q200 chips on cards

Same session, a related user report: replacement cards rendered **two** "AEC-Q200" chips side-by-side — a green one from `DomainChip` (the unified #155 badge) and a blue one from a separate `part.qualifications?.map()` render.

**Cause:** `part.qualifications[]` is populated at the data-source layer (Atlas `atlasClient.ts`, Digikey `digikeyMapper.ts`) with the literal string `'AEC-Q200'`. `DomainChip` ALSO renders "AEC-Q200" for the `automotive_q200` domain — which is itself derived from the same `aec_q200` flag via `upgradeFromAttributes()`. Both paths converge on the same string.

**Fix:** New exported helper `isDomainCoveredQualification(label)` in `qualificationDomain.ts` returns true for `AEC-Q200`/`Q100`/`Q101` (case-insensitive, tolerant of trailing notes). All five UI render sites filter `part.qualifications` through it: `RecommendationCard.tsx`, `AttributesPanel.tsx`, `PartOptionsSelector.tsx`, `ComparisonView.tsx`, `AttributesTabContent.tsx`. The data array is left intact — the matching engine and other non-UI consumers still see the full `qualifications[]`. Non-AEC qualifications (future MIL-PRF, RoHS, etc.) still render. In `AttributesTabContent.tsx` the `hasQualifications` flag was recomputed from the filtered list so the dedicated "Qualifications" section header doesn't render when AEC was its only entry.

**Lesson:** When two systems derive a display value from the same underlying datum, expect them to collide on screen. The fix is a single shared predicate, not five ad-hoc inline checks — one source of truth for "what does DomainChip already own."

### Files Touched — chip dedup

- `lib/services/qualificationDomain.ts` — `isDomainCoveredQualification()` helper
- `components/RecommendationCard.tsx`, `components/AttributesPanel.tsx`, `components/PartOptionsSelector.tsx`, `components/ComparisonView.tsx`, `components/AttributesTabContent.tsx` — filter `qualifications` render through the helper

## Decision #197 — Domain-Card Audit: Downgrade FABRICATED_DICT from Block to Warn (May 22, 2026)

**Context.** Decision #195 Phase 2 shipped a four-check auto-audit on AI-generated family domain cards: BOGUS_MFR, WRONG_PREFIX, FABRICATED_DICT, OMITTED_MFR. During the May 22 card-regeneration sweep, the FABRICATED_DICT check fired on five consecutive cards (B4 `英吋`, 12 `外壳`, 52 `工艺`, 65 `暂态能量`, 65 `电容`) — **0 real catches, 5 false positives**. Each was a legitimate Chinese param name the check couldn't resolve.

**Root cause.** FABRICATED_DICT extracts bare Han character runs from the card and substring-matches them against `atlasMapper.ts` source. Real param names appear in rich syntactic forms the bare-run extraction can't reconstruct:
- **Unit words** — `英吋` ("inch"), `公釐` ("mm") are units, never parameter names.
- **Slash-compounds** — `电阻类型/技术/工艺` is a synonym group; the dict stores sub-spans (`技术/工艺` is a key) at varying granularity.
- **Trailing parentheticals** — `电容(khz)` is one param name; the regex captures only `电容`.
- **Synonym siblings** — `暂态能量/能量` lists two synonyms; `能量` is in the dict, `暂态能量` is an uncatalogued-but-valid variant.

Eight tightenings (negative-list context, quoted/dash descriptors, MPN-suffix, protocol-number, traditional→simplified normalization via opencc-js, accepted-overrides lookup, slash-compound sub-span reconstruction, Chinese unit-word skip set) cut the noise substantially but each new card kept surfacing another shape. The check was chasing an asymptote.

**Deeper problem.** FABRICATED_DICT never validated mapping *correctness* — only "is this Chinese phrase present in the dict." A flag means "phrase not catalogued," which is almost always a **dictionary coverage gap**, not a hallucination. The genuinely dangerous case — Opus mapping a phrase to the *wrong* canonical — was never in scope for this check. Meanwhile BOGUS_MFR and WRONG_PREFIX are grounded in `atlas_products` (real shipped data) and proved reliable in the same sweep (the C4 INPAQ/SXN/KOHER prefix catches were all genuine, verified against MPN samples).

**Decision.** FABRICATED_DICT downgraded from **block** to **warn** severity:
- `issueCount` (the block-gating count) now counts BOGUS_MFR + WRONG_PREFIX only.
- FABRICATED_DICT + OMITTED_MFR are warn-level — advisory, surfaced in the audit panel, do NOT gate Approve and do NOT count as "hallucination issues."
- UI relabels FABRICATED_DICT as "Dictionary coverage gaps" (warning color, not error), with inline text explaining it's usually a dict TODO — the term may be a real synonym to add, verify against `atlasMapper.ts` before treating as a card error.
- "Fix with AI" is no longer offered for warn-only cards — dict gaps are resolved by *adding* terms to the dictionary, not by editing the card. Removing a legit synonym would be the wrong action.

**What stays block:** BOGUS_MFR + WRONG_PREFIX. Both verifiable against `atlas_products`, both genuinely dangerous if wrong.

**Lessons.**
1. **A check is only as trustworthy as its reference.** Substring-matching source code is a lossy reference; querying real data (`atlas_products`) is not. Audit checks grounded in data outperformed checks grounded in code-text by a wide margin.
2. **"Not in dict" ≠ "fabricated."** The check's name overpromised. It detects coverage gaps. Naming a check after the failure you fear, rather than the thing it actually measures, mis-sets the severity and the engineer's mental model.
3. **Know when to stop tightening.** Eight heuristics in, false positives still outnumbered real catches. The signal to stop isn't "the next tightening is hard" — it's "the precision isn't improving." Downgrade-and-keep-as-advisory beats an infinite regex chase.
4. **Severity is a product decision, not a code default.** The clean/warn/block enum existed; the mistake was assigning FABRICATED_DICT to block without evidence its precision warranted gating. Real-card data corrected it.

### Files Touched

- `lib/services/atlasFamilyCardAudit.ts` — severity rollup: `issueCount` = bogus + wrongPrefix; fabricatedDict + omittedMfrs are advisory; file-header severity doc updated.
- `components/admin/AtlasDomainCardsPanel.tsx` — `advisoryCount()` helper; audit chip + `AuditDetailPanel` reframe FABRICATED_DICT as "Dictionary coverage gaps" (warning color + advisory note); "Fix with AI" enable keys off `issueCount` (hallucinations) only.
- `scripts/atlas-audit-domain-cards.mjs` — CLI report unchanged (shows all four checks; severity enum is a TS-service/UI concept).

## Decision #198 — Triage Queue Cache: L2 as Source of Truth (May 22, 2026)

### Context

May 22, the Triage queue UI surfaced accepted dictionary rows for hours after Accept. Verified all 8 sampled overrides were in `atlas_dictionary_overrides` with correct family/attribute and `is_active=true`. L2 cache (`admin_stats_cache.triage-queue`) row was null. The queue route's RPC returned the rows correctly. The `lookupOverride()` filter key construction matched (`${familyId}:${normalizeOverrideKey(paramName)}` on both sides, with NFC+lowercase+trim applied symmetrically per Decision #186).

Root cause: Next.js dev-mode HMR fragments modules. `triageQueueCache.ts` was imported by both `app/api/admin/atlas/dictionaries/route.ts` (Accept POST) and `app/api/admin/atlas/ingest/batches/route.ts` (queue GET). HMR gave each route a separate module instance with its own `let memCache` and its own `let registeredCompute`. Accept's `invalidateTriageQueueCacheAndAwaitFresh()` cleared the Accept route's L1 and tried to start a background recompute via the Accept route's `registeredCompute` — which was never registered there (only the batches route registers at module-load), so recompute was a no-op. Meanwhile the batches route's L1 happily held the pre-accept data for the full 30-min TTL.

Symptom: hard refresh, log out / log in, accept a different row — none of it cleared the queue route's local L1. Only `?refresh=1` (which `forceFresh=true` → bypasses L1 entirely) worked.

### Decision

Shift the cache contract from L1-as-truth to L2-as-truth.

1. **Invalidation DELETEs the L2 Supabase row.** `supabase.from('admin_stats_cache').delete().eq('key', 'triage-queue')` runs through a service-role client and is visible to every module instance + worker on next read. Cross-process safe by construction.

2. **L1 TTL dropped from 30 min → 30 sec.** L1 is now a tiny burst-absorption layer for repeated reads within a single page render or rapid navigation, not a durability layer. Staleness in a fragmented HMR instance now self-heals in seconds.

3. **Read contract unchanged.** Routes still call `readCachedTriageData(forceFresh)` → returns null when L1 and L2 are both empty → caller sync-computes and writes back via `writeCachedTriageData`. SWR on `l2-stale` (6h threshold) still triggers background recompute. The only behavior change: invalidation paths now reliably reach all readers.

4. **Both invalidate variants updated.** `invalidateTriageQueueCache()` (single-flight, per-row mutations) and `invalidateTriageQueueCacheAndAwaitFresh()` (drain-then-wipe-then-await, batch-state mutations) both DELETE the L2 row + clear local L1 + best-effort background recompute. The wait-then-restart machinery in the await variant is retained for in-flight stale-promise drainage but is no longer the durability mechanism.

### Why not alternative fixes

- **"Just fix HMR" / move the cache module to a different scope:** dev-mode-only; doesn't help if prod ever exhibits the same fragmentation under multi-worker. L2-DELETE is correct for both.
- **Drop L1 entirely:** L2 round-trip per request is fast (~50-100ms cookie-auth path) but accumulates under burst load. 30s L1 absorbs that without staleness risk.
- **Add L2 freshness ping on every L1 hit:** would catch fragmentation but doubles Supabase reads. 30s L1 TTL bounds the staleness window enough that the extra ping isn't worth it.
- **Force `?refresh=1` on every queue load:** what we were de facto doing today. Defeats the purpose of caching; full sync compute on every page load.

### Trade-offs

- After Accept, the next reader (in the fragmented batches-route instance) may pay a sync compute (~2-3s) because the background recompute fired in the Accept route's instance, not the batches route's instance. This is a one-time cost per invalidation, bounded by L2 being warmed by that recompute (or by the next reader's sync compute). The 30s L1 then absorbs subsequent reads.
- Acceptable for an admin-only route. Not appropriate for a customer-facing read path where 2-3s cold compute would surface as latency.

### Files Touched

- `lib/services/triageQueueCache.ts` — L2 DELETE in both invalidate functions; L1 TTL 30 min → 30 sec; updated file-header docs to reflect L2-as-source-of-truth contract.

### Forward-looking

Same pattern (L1 with HMR-fragile invalidation, L2 with persistent storage) exists in `atlas-coverage` (Decision #179) and `atlas-growth` (Decision #183). They have the same fragility in dev mode but haven't surfaced because (a) their write paths are batch ingest (rare) and (b) they're routinely refreshed by manual buttons. Pre-emptively migrating them would be cheap follow-up; tracking in BACKLOG.

## Decision #199 — Retroactive Dict Override Backfill (May 23, 2026)

### Context

May 22-23: ~150 dict overrides accepted during a focused Triage session — `gaia-capacitance-Typ → cj`, `gaia-conducted_sensitivity → sensitivity`, etc. User assumed (and I initially confirmed) that accepts immediately improved matching quality for existing `atlas_products` via read-time override consultation. **This was wrong.**

Verification surfaced: dict overrides fire at INGEST TIME ONLY. `atlas-ingest.mjs → mapManufacturerProducts() → loadAndApplyDictOverrides()` consults overrides when translating raw MFR JSON params → canonical attributeIds at write-time. `lib/services/atlasMapper.ts → fromParametersJsonb()` uses overrides only for *display names*, not key translation — the JSONB keys are already post-translation by the time it reads them. So products in `atlas_products` carry whatever sanitization was active at THEIR original ingest. New accepts only affected future ingests.

Symptom: user accepted `gaia-capacitance-Typ → cj` for 73 YFW B4 products → DB still showed those products with whatever raw-English sanitization (`capacitance`, dropped, etc.) was applied at original ingest. Coverage % unchanged. Matching engine sees the old sanitization. Cross-checked: SIMCOM products have `transmit_power_min` / `hsdpa_max_data_rate` in JSONB, NOT `gaia-...` raw forms.

### Decision

Ship a retroactive backfill that closes the gap without requiring engineers to re-upload every MFR file through the ingest UI.

New script mode: `node scripts/atlas-ingest.mjs --backfill-translations [--dry-run] [--mfr <slug>] [--verbose]`. Wired as `npm run atlas:backfill` (and `:dry`).

**Architecture:**
- Mounted on `atlas-ingest.mjs` as a new dispatcher case — NOT a separate script — so mapping logic stays single-sourced. Reuses `mapManufacturerProducts()`, `fetchExistingProducts()`, `mergeAtlasParameters()`, `tagAtlasParameters()` verbatim.
- Walks every `mfr_*_params.json` in `data/atlas/`. For each MFR: re-runs mapper with current overrides + signatures → diffs against existing `atlas_products` → UPDATEs `parameters` JSONB in place.
- Provenance-preserving via existing `mergeAtlasParameters`: `source='extraction'` (LLM) + `source='manual'` entries protected; only `source='atlas'` (and legacy untagged) atoms get replaced.
- Idempotent: comparison via `compareParamsIgnoringIngestedAt()` skips writes when fresh merge equals existing (ignores the `ingested_at` timestamp which would otherwise mark every row dirty).
- Cache invalidation: deletes `admin_stats_cache` rows for `atlas-coverage` + `manufacturers-list` after a non-dry run with changes.
- Does NOT INSERT new products. MPNs present in source files but absent from DB are reported as `missing` and skipped — those need `--proceed` (full ingest pipeline) to land. Backfill is parameters-only rewrite for already-ingested products.

**Smoke test → first real run (May 23):**
- Scanned 198,626 products across 144 MFR source files
- Changed 37,514 (top: SWST 3,623; Good-Ark 2,955; INPAQ 1,684; HXYMOS 1,317; DELTA 1,176)
- Unchanged 145,425 (already current — confirms idempotence)
- Missing 15,687 (in source, not in DB — biggest: Brightking 3,373, likely an unproceeded MFR)
- Errors 0

### Why this architecture (and not the alternatives I considered first)

**Rejected: override-aware coverage RPC** (Option B in original planning). Would have modified `get_atlas_coverage_aggregates` to take an `override_map` and translate keys at query time. **This would have been wrong** — it would credit the coverage % display for keys the matching engine doesn't actually see. The matching engine reads `atlas_products.parameters` JSONB as-is and matches rules against the stored keys; if those keys are old sanitizations, the rules don't fire, so the candidate doesn't score regardless of what the coverage % display says. Display-vs-reality divergence is the worst kind of bug. Backfill fixes both layers symmetrically.

**Rejected: re-upload every MFR via ingest UI.** Real busywork (144 manual uploads), repeats every accept burst, and has the human-in-the-loop overhead of batch review even for files that haven't changed.

**Deferred: auto-trigger on dict mutation.** Each Accept would trigger a 110K-row scan — too aggressive. Manual is the right default for now; auto could be a future button or a nightly cron when there's evidence engineers want it.

### Trade-offs

- Cost: each run is a full source-file walk + 37K UPDATEs in the worst case. Took ~5 minutes against the prod Supabase project on May 23. Fine as a manual/nightly job; not appropriate as a per-Accept trigger.
- Granularity: re-translates ALL atlas-tagged atoms per product, not just the ones touched by the changed overrides. Necessary because we don't track per-atom override provenance. Idempotence guard means re-runs without override changes are cheap (zero writes).
- Missing-products visibility: the `missing` count surfaces unproceeded MFRs (Brightking 3,373) which is a useful side signal for operator review.

### Honest correction

I incorrectly told the user earlier in this session that dict overrides apply at read time and "every accept improves matching quality on the very next query." That was wrong. They apply at ingest write time only. Verifying the data shape took less than 5 minutes once I stopped and looked — should have done that before claiming it. Memory updated to call out this verification step (`grounded-ai-generators-anti-hallucination` pattern applied to my own claims too: when telling a user how their data flows, look at the data before answering).

### Files Touched

- `scripts/atlas-ingest.mjs` — new `--backfill-translations` mode + `runBackfillTranslations()` + `compareParamsIgnoringIngestedAt()` helper + CLI flag + usage update.
- `package.json` — `atlas:backfill` + `atlas:backfill:dry` npm scripts.
