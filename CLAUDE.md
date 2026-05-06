# XRefs App

An AI-powered component intelligence platform for the electronics industry. Users enter a part number (or upload a BOM), and the system finds equivalent replacements, scores them with a deterministic rule engine, and adapts its recommendations based on the user's role, objectives, and business constraints.

**Current MVP:** Cross-reference recommendation engine covering 43 passive, discrete semiconductor, IC, frequency control, optoelectronic, and relay families, with Digikey as the primary data source.

**Vision:** A platform that helps engineers, buyers, and supply chain professionals make better component decisions by combining deep technical matching with commercial intelligence, compliance and lifecycle awareness, and supply chain insights — personalized to each user's context. See `docs/PRODUCT_ROADMAP.md` for the full vision and phased implementation plan.

## Tech Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **MUI v7** with Material Design 3 dark mode (`colorSchemes` API, `enableCssLayer: false`)
- **Anthropic Claude API** (Sonnet 4.5) for LLM orchestrator with tool calling
- **Supabase** for auth, user profiles, conversation persistence
- **Digikey Product Information API v4** for live part data (OAuth2 client credentials)
- **Emotion** for CSS-in-JS

## Project Structure

```
app/                          # Next.js App Router
  api/search/                 # Part search (Digikey → mock fallback)
  api/attributes/[mpn]/      # Part parametric attributes
  api/xref/[mpn]/            # Cross-reference recommendations (GET + POST with overrides)
  api/chat/                   # LLM orchestrator conversation
  api/modal-chat/             # Refinement chat (per-part in parts list modal)
  api/parts-list/validate/    # Batch validation (streaming NDJSON, direct getAttributes fallback on search miss)
  api/parts-list/search-quick/ # Lightweight MPN search for Add Part dialog (search only, no attrs/recs)
  api/auth/register/          # User registration with invite code
  api/admin/users/            # Admin user management (role changes owner-only)
  api/admin/qc/               # QC log list (GET with filters, sort, pagination)
  api/admin/qc/[logId]/      # QC log detail (GET snapshot)
  api/admin/qc/export/       # QC log export (GET, CSV/JSON download)
  api/admin/qc/analyze/      # QC AI analysis (POST, SSE streaming via Claude)
  api/admin/qc/feedback/     # QC feedback list (GET with status/search/sort)
  api/admin/qc/feedback/[feedbackId]/ # Feedback status update (PATCH)
  api/admin/qc/settings/     # QC settings (GET/PUT logging toggle)
  api/admin/distributor-clicks/ # Distributor click log (GET with filters/search/sort/pagination)
  api/admin/data-sources/    # Data source status (Digikey, Anthropic, Supabase) + cache stats
  api/admin/cache/           # Cache management (GET stats, DELETE purge)
  api/admin/atlas/           # Atlas manufacturer stats (GET, paginated aggregation + coverage % + enabled state)
  api/admin/atlas/manufacturers/ # Atlas manufacturer enable/disable toggle (PATCH, admin-only)
  api/admin/atlas/coverage/  # Atlas per-family attribute gap analysis (GET)
  api/admin/atlas/explorer/  # Atlas product search (GET ?q=, MPN/manufacturer ilike)
  api/admin/atlas/explorer/[id]/ # Atlas product detail + schema comparison (GET)
  api/admin/atlas/dictionaries/ # Atlas dictionary override CRUD (GET list + samples, POST create, supports L2 ?category=)
  api/admin/atlas/dictionaries/suggest/ # AI-assisted Chinese→English param mapping suggestion (POST, Claude Haiku)
  api/admin/atlas/dictionaries/[overrideId]/ # Dictionary override update/delete (PATCH, DELETE)
  api/admin/atlas/family-schema/ # Canonical attributeId list per family (GET, no Anthropic call)
  api/admin/atlas/ingest/upload/ # Multipart folder upload → data/atlas/, returns staged files + new MFRs (Decision #174)
  api/admin/atlas/ingest/report/ # Generate per-MFR diff report → atlas_ingest_batches (POST)
  api/admin/atlas/ingest/batches/ # List pending/applied batches (GET)
  api/admin/atlas/ingest/batches/[batchId]/ # Batch detail (GET) + discard (DELETE)
  api/admin/atlas/ingest/batches/[batchId]/proceed/ # Apply batch + invalidate admin caches (POST)
  api/admin/atlas/ingest/batches/[batchId]/revert/ # Restore from atlas_products_snapshots (POST, 30d window)
  api/admin/atlas/ingest/batches/[batchId]/regenerate/ # Re-run report after dict overrides change (POST)
  api/admin/atlas/ingest/proceed-all-clean/ # Bulk-apply every risk='clean' batch (POST, concurrency-limited)
  api/admin/taxonomy/        # Digikey category taxonomy with coverage
  api/admin/overrides/rules/ # Rule override CRUD (GET list w/ admin names, POST create w/ previous_values)
  api/admin/overrides/rules/[overrideId]/ # Rule override update/delete (PATCH deactivate-and-create, DELETE soft)
  api/admin/overrides/rules/history/ # Rule override audit trail (GET full chain for family+attribute)
  api/admin/overrides/rules/restore/ # Restore rule override to previous version (POST)
  api/admin/overrides/rules/annotations/ # Rule annotations (GET family/rule, POST create)
  api/admin/overrides/rules/annotations/[annotationId]/ # Annotation update/delete (PATCH, DELETE own)
  api/admin/overrides/context/ # Context override CRUD (GET list, POST create)
  api/admin/overrides/context/[overrideId]/ # Context override update/delete (PATCH, DELETE)
  api/admin/releases/        # Create release note (POST, admin-only)
  api/admin/releases/[id]/   # Update/delete release note (PATCH/DELETE, admin-only)
  api/releases/              # List release notes (GET, all authenticated)
  api/mouser/enrich/         # On-demand Mouser enrichment (POST, batch MPNs)
  api/list-chat/             # List agent conversation (POST, list-scoped LLM with 9 tools)
  api/admin/manufacturers/    # Manufacturer list endpoint (GET, RPC-based aggregation, 30min cache)
  api/admin/manufacturers/[slug]/ # Manufacturer detail + update (GET/PATCH)
  api/admin/manufacturers/[slug]/products/ # Paginated products for MFR (GET)
  api/admin/manufacturers/[slug]/cross-references/ # MFR cross-reference CRUD (GET list, POST bulk upload, DELETE soft)
  api/admin/atlas/flags/      # Atlas product flags CRUD (GET/POST)
  api/admin/atlas/flags/[flagId]/ # Flag status update (PATCH)
  api/feedback/              # QC rule feedback submission (POST)
  api/app-feedback/          # General app feedback (POST multipart, supports image attachments — Decision #162)
  api/admin/app-feedback/    # Admin list + per-row update for general app feedback (GET, PATCH)
  admin/layout.tsx            # Shared admin layout (sidebar persists across routes)
  admin/manufacturers/[slug]/ # Manufacturer detail page (sub-route)
  admin/atlas/ingest/         # Atlas re-ingest UI: drag-drop, batch review, AI dict triage (Decision #174)
  lists/                      # Lists dashboard page
  parts-list/                 # Parts list editor page
  logic/                      # Admin logic table viewer page
  releases/                   # Release notes feed page (all users)
  qc/                          # QC top-level page (admin-only)

components/                   # React components
  AppShell.tsx                # Main layout orchestrator — composes hooks, delegates to DesktopLayout
  DesktopLayout.tsx           # Desktop grid: chat, attributes, recommendations, MFR panels
  ParticleWaveBackground.tsx  # Canvas particle wave animation — idle-state background, fades on panel reveal
  ChatInterface.tsx           # Chat UI with message list + search input
  AttributesPanel.tsx         # Part attributes table
  RecommendationsPanel.tsx    # Scored replacement list
  ComparisonView.tsx          # Side-by-side source vs replacement
  parts-list/                 # Batch parts list components
    PartsListShell.tsx        # Parts list orchestrator — composes hooks, sort/filter pipeline
    PartsListTable.tsx        # Sortable table with validation progress + selection
    ViewControls.tsx          # View dropdown, kebab menu, default star, delete confirm
    PartsListActionBar.tsx    # Selection count, refresh/delete/add-part buttons, search field
    AddPartDialog.tsx         # Manual part entry — Search → Select picker flow, MPN search with multi-source results
    ListAgentFooter.tsx       # Sticky bottom bar (34px) with toggle trigger + item count + refresh time
    ListAgentDrawer.tsx       # Bottom-anchored 50vh drawer with chat messages + input
    ListActionConfirmation.tsx # Confirm/Cancel widget for write actions (delete, refresh, set preferred)
  lists/                      # Lists dashboard components
  admin/                      # Admin panel components
    AdminShell.tsx            # Admin orchestrator — section selection, family picker state
    AdminSectionNav.tsx       # Left nav for admin sections
    FamilyPicker.tsx          # Shared category/family dropdown (used by 3 sections)
    QcFeedbackTab.tsx         # Feedback list — status filters, search, sort, click-to-detail
    QcFeedbackDetailView.tsx  # Feedback detail — comparison table reconstruction from snapshot
    QcLogsTab.tsx             # Log list + detail (existing log review functionality)
    DistributorClicksTab.tsx  # Distributor click log — filter chips, search, sortable table, pagination
    QcFeedbackCard.tsx        # Individual feedback card (used in logs detail + feedback detail)
    QcRecommendationSummary.tsx # Recommendation summary card (used in logs detail)
    QcAnalysisDrawer.tsx      # AI analysis right-side drawer with streaming markdown
    qcConstants.ts            # Shared dot colors + utility functions for QC components
    LogicPanel.tsx            # Logic table rules viewer/editor (per-family, clickable rows)
    RuleOverrideDrawer.tsx    # Right-side drawer for editing rule overrides
    ContextOverrideDrawer.tsx # Right-side drawer for editing context question overrides
    ParamMappingsPanel.tsx    # Attribute-centric param map: Digikey + Parts.io columns, coverage metrics
    AtlasPanel.tsx            # Atlas manufacturer stats — summary + expandable table + coverage % + Explorer search tab
    AtlasCoverageDrawer.tsx   # Per-family attribute gap analysis drawer (Atlas vs Digikey vs logic table)
    AtlasExplorerTab.tsx      # Atlas product search — debounced MPN/MFR search, results table, opens drawer
    AtlasExplorerDrawer.tsx   # Atlas product detail — schema comparison (L3 or L2), extra attrs, raw params
    AtlasDictionaryPanel.tsx  # Atlas translation dictionary viewer/editor (per-family + L2 category + shared)
    AtlasDictOverrideDrawer.tsx # Right-side drawer for editing dictionary overrides — schema Autocomplete, AI suggestion, sample values
    atlasIngest/              # Re-ingest UI components (Decision #174)
      AtlasIngestPanel.tsx    # Top-level orchestrator (Pending/Applied tabs, dashboard, batch list)
      IngestUploader.tsx      # Drag-drop upload zone + new-MFR confirm step
      IngestDashboard.tsx     # Sticky aggregate header: risk chips + Proceed All Clean / Discard All
      GlobalUnmappedParamsTable.tsx # AI dict triage: per-param suggestions with canonical-vs-invented indicators, bulk-accept
      BatchCard.tsx           # Per-batch card with embedded triage panel when single-batch
      ProductDiffTable.tsx    # Per-product attribute diff inside expanded attention cards
      BatchProgressDialog.tsx # Modal during bulk/single apply
      types.ts                # Shared client-side types for the ingest UI
    ManufacturersPanel.tsx    # Manufacturer list + search + flagged tabs
    ManufacturerDetailPage.tsx # MFR detail (5 tabs: Products, Flagged, Coverage, Cross-Refs, Profile)
    FlaggedProductsTab.tsx    # Flagged products list with status filters
    CrossReferencesTab.tsx    # MFR cross-ref upload (drag-drop + column mapping) + paginated table
    CrossRefColumnMappingDialog.tsx # Column mapping dialog for cross-ref upload (6 fields)
    SearchLogicPanel.tsx      # Admin docs: how single-part search pipeline works (hardcoded markdown)
    ListLogicPanel.tsx        # Admin docs: how batch list validation pipeline works (hardcoded markdown)
    logicConstants.ts         # Shared typeColors/typeLabels for rule type chips
  auth/                        # Registration and onboarding
    RegisterForm.tsx          # Step 1 — account creation (name, email, password, invite code)
    RegisterFlow.tsx          # Two-step wizard orchestrator (registration → onboarding)
    OnboardingAgent.tsx       # Step 2 — conversational state machine (6 guided Q&A + free-form)
  settings/                    # User settings panels
    SettingsShell.tsx         # Settings orchestrator — section nav + content routing
    SettingsSectionNav.tsx    # Left nav: My Account, My Profile, Company Settings, General Settings
    ProfilePanel.tsx          # My Account — name, email, password
    MyProfilePanel.tsx        # My Profile — free-form profile prompt (LLM extraction on save)
    CompanySettingsPanel.tsx  # Company Settings — manufacturers, compliance, country-based locations
    AccountPanel.tsx          # General Settings — language, currency, theme
  releases/                    # Release notes feed
    ReleasesShell.tsx         # Feed UI — create/edit/delete (admin), read-only (users)
  qc/                         # QC top-level shell (admin-only)
    QcShell.tsx               # QC orchestrator — settings toggle, section nav, content
    QcSectionNav.tsx          # Left nav: Feedback + Logs sections

hooks/
  useAppState.ts              # Main state machine (LLM mode with deterministic fallback)
  useConversationPersistence.ts # URL hydration, auto-save, conversation CRUD
  usePanelVisibility.ts       # Panel show/hide/dismiss, skeleton delay
  useManufacturerProfile.ts   # MFR panel + chat collapse state — async fetch via /api/manufacturer-profile (Decision #161)
  useNewListWorkflow.ts       # File upload dialog flow
  usePartsListState.ts        # Parts list file upload, parsing, validation
  usePartsListAutoLoad.ts     # Auto-load from URL/pending file, redirect, default view
  useRowSelection.ts          # Multi-select rows, toggle, refresh selected
  useRowDeletion.ts           # Two-step delete confirmation (permanent vs. hide)
  useColumnCatalog.ts         # Header inference, column building, mapping fallback
  useModalChat.ts             # Refinement chat state
  useListAgent.ts             # List agent conversation, action dispatch, confirmation flow
  useViewConfig.ts            # Global view template management (renamed to useViewTemplates)
  useListViewConfig.ts        # Per-list view management (Supabase-backed, debounced save)

lib/
  types.ts                    # All TypeScript interfaces (single source of truth)
  constants/
    profileOptions.ts         # Shared option arrays, curated countries, label lookups (onboarding + settings)
  services/                   # Server-side services (see below)
  services/profileExtractor.ts # LLM extraction of structured fields from free-form profile prompt
  logicTables/                # Per-family matching rules (see below)
    e1Optocouplers.ts          # E1 optocoupler logic table
    f1Relays.ts                # F1 electromechanical relay logic table
    f2SolidStateRelays.ts      # F2 solid state relay logic table
  contextQuestions/            # Per-family application context questions
    e1Optocouplers.ts          # E1 optocoupler context questions
    f1Relays.ts                # F1 electromechanical relay context questions
    f2SolidStateRelays.ts      # F2 solid state relay context questions
  supabase/                   # Auth guard, client, server, middleware
  mockData.ts                 # Fallback data (6 MLCCs, 3 resistors, 5 ICs)
  api.ts                      # Client-side API wrapper (includes admin feedback/QC functions)
  services/partsioClient.ts    # Parts.io API client — best-record selection, caching, retry
  services/partsioMapper.ts     # Parts.io listing → ParametricAttribute[] conversion
  services/partsioParamMap.ts   # Maps parts.io field names → internal attributeId (17 class maps)
  services/recommendationLogger.ts # Logs recommendations to Supabase with JSONB snapshots
  services/qcAnalyzer.ts      # Server-side aggregation of QC log snapshots for AI analysis
  services/overrideMerger.ts  # Fetches admin overrides from Supabase, merges onto TS base
  services/overrideValidator.ts # Validates override values against type constraints
  services/overrideHistoryHelper.ts # Audit trail: previous_values snapshots + admin name resolution
  services/atlasClient.ts     # Atlas Supabase queries — search, attributes, candidate fetch
  services/atlasApiClient.ts  # Atlas external API client — manufacturer profile sync (server-side only)
  services/atlasMapper.ts     # Atlas JSON → internal ParametricAttribute[] conversion (28 L3 family + 14 L2 category dictionaries)
  services/atlasGaiaDictionaries.ts # Gaia datasheet-extracted param mapping (parse, skip stems, dict exports)
  services/atlas-gaia-dicts.json # Shared gaia dictionaries (12 families + shared, consumed by TS + MJS)
  services/atlasDictOverrides.ts # Server-only Supabase fetch/cache for dictionary overrides
  services/descriptionExtractor.ts # LLM description extraction — schema prompt builder, quote-grounded parser, gap-fill merger
  services/mouserClient.ts    # Mouser API client — search, batch, cache, rate limiter
  services/mouserMapper.ts    # Mouser response → SupplierQuote/LifecycleInfo/ComplianceData
  services/manufacturerCrossRefService.ts # MFR cross-ref lookup (60s cached Supabase query, bidirectional)
  services/mpnNormalizer.ts   # Packaging-suffix stripping for cross-ref lookups (-TR, -REEL, /R7, etc.)
  services/partDataCache.ts   # L2 persistent cache (Supabase-backed, 3-tier TTL)
  columnDefinitions.ts        # Dynamic column system for parts list table
  viewConfigStorage.ts        # View types (SavedView, ViewState), localStorage persistence, sanitizeTemplateColumns()
  layoutConstants.ts          # Shared CSS values (heights, font sizes, spacing)

mcp-server/                   # MCP server for external AI agent integration (Decision #80)
  index.ts                    # Entry point: McpServer + tool registration + StdioServerTransport
  tools/                      # Tool handlers (searchParts, getPartAttributes, findReplacements, etc.)
  lib/envLoader.ts            # .env.local parser for standalone mode
  tsconfig.json               # Standalone TS config (Node16 module resolution)

__tests__/services/           # Jest unit tests for core business logic
docs/                         # Cross-reference logic documents (.docx)
scripts/                      # Utility scripts (Digikey param discovery, Supabase schema, Atlas ingest/extract)
  supabase-atlas-manufacturers-schema.sql # atlas_manufacturers table schema
  supabase-atlas-flags-schema.sql # atlas_product_flags table schema
  atlas-manufacturers-import.mjs # Excel import for manufacturer master list
  atlas-api-validate-ids.mjs  # Validate API partner IDs vs local atlas_id
  atlas-api-sync-profiles.mjs # Sync manufacturer profiles from Atlas external API
locales/                      # i18n translations (en, de, zh-CN)
theme/theme.ts                # MUI M3 dark theme configuration
jest.config.ts                # Jest config (next/jest.js, SWC transforms, path aliases)
```

## How the Matching Engine Works

The core pipeline is in `lib/services/partDataService.ts → getRecommendations()`:

1. **Get source attributes** — Fetch the original part's parametric data (Digikey API, mock fallback)
2. **Merge overrides** — Apply any user-supplied attribute corrections
3. **Classify family** — Map subcategory string → family ID, detect variant families (e.g., current sense within chip resistors) via `lib/logicTables/familyClassifier.ts`
4. **Get logic table** — Load the family's matching rules from `lib/logicTables/`
5. **Apply admin overrides** — `overrideMerger.ts` fetches active DB overrides and merges onto the TS base (remove→override→add pattern). Patchable fields include `valueAliases` (Decision #160) for per-rule categorical synonym groups.
6. **Apply context** — If user answered application context questions, `contextModifier.ts` adjusts rule weights/types. Context questions are also subject to admin overrides.
7. **Fetch candidates** — Search Digikey for replacement candidates using critical parameters as keywords
8. **Score candidates** — `matchingEngine.ts` evaluates each candidate against every rule
9. **Apply qualification-domain filter** (Decision #155) — After scoring, classify source + every candidate into a `QualificationDomain` (automotive_q200 / medical_implant / mil_spec / space / ...) via `qualificationDomain.ts`. Hard-exclude cross-domain candidates (e.g. medical_implant under automotive context) **before** the certified-cross bypass so certified crosses can't route around the gate. Flag deviations for the UI badge. Phase 1: Murata MLCCs only.
10. **Apply post-scoring family filters** — `withCertifiedBypass` applies per-family blocking-rule filters (C2/C4–C10/D1–D2/E1/F1–F2); bypassed for MFR-certified and Accuris-certified crosses (Decision #133).
11. **Sort** — `sortRecommendationsForDisplay` buckets (Accuris → MFR → Logic), then within each bucket ranks `context-matched > unknown > deviation` on qualification domain, then match % / composite score.

### Scoring

Each rule has a **weight** (0-10). The matching engine evaluates each rule and produces:
- `matchPercentage = (earnedWeight / totalWeight) * 100`
- A part **fails** if any rule result is `'fail'` (actual value mismatch only — missing data never causes fail)
- Missing candidate data → `'review'` (flagged for human verification, never rejected). `blockOnMissing` flag controls note severity only, not the result (Decision #109).
- `application_review` rules get 50% credit (can't be automated)
- `operational` mismatches get 80% credit (non-electrical)

### Rule Types

Defined in `lib/types.ts` as `LogicType`:

| Type | Behavior | Example |
|------|----------|---------|
| `identity` | Exact match required — string-equality-first check (after normalize), then per-rule `valueAliases` lookup (Decision #160), then numeric fallback with 1e-6 relative tolerance for SI-prefix encoding drift; supports optional `tolerancePercent` band. Decision #137. | Capacitance, package/case, fsw ±10%, Polar≡Polarized |
| `identity_range` | Range overlap required (replacement range must intersect source range) | JFET Vp, Idss |
| `identity_upgrade` | Match or superior per hierarchy (best→worst array); also consults `valueAliases` so synonyms map to hierarchy positions (Decision #160). | Dielectric: C0G≡NP0 > X7R > X5R |
| `identity_flag` | Boolean gate — if original requires it, replacement must too | AEC-Q200, flexible termination |
| `threshold` | Numeric comparison: `gte`, `lte`, or `range_superset` | Voltage ≥, ESR ≤, temp range ⊇ |
| `fit` | Physical constraint ≤ | Component height |
| `vref_check` | Cross-attribute Vref → Vout recalculation with ±2% tolerance | Switching regulator Vref |
| `application_review` | Cannot be automated, flagged for human review | DC bias derating |
| `operational` | Non-electrical info | Packaging type |

## Logic Tables & Family Structure

Each component family has a logic table in `lib/logicTables/` defining its matching rules. All 43 families are encoded:

**Registry:** `lib/logicTables/index.ts` maps family IDs to tables and subcategory strings to family IDs.

| ID | Family | Category |
|----|--------|----------|
| 12 | MLCC Capacitors | Passives |
| 13 | Mica Capacitors | Passives |
| 52 | Chip Resistors | Passives |
| 53 | Through-Hole Resistors | Passives |
| 54 | Current Sense Resistors | Passives |
| 55 | Chassis Mount Resistors | Passives |
| 58 | Aluminum Electrolytic | Passives |
| 59 | Tantalum Capacitors | Passives |
| 60 | Aluminum Polymer | Passives |
| 61 | Supercapacitors | Passives |
| 64 | Film Capacitors | Passives |
| 65 | Varistors / MOVs | Passives |
| 66 | PTC Resettable Fuses | Passives |
| 67 | NTC Thermistors | Passives |
| 68 | PTC Thermistors | Passives |
| 69 | Common Mode Chokes | Passives |
| 70 | Ferrite Beads | Passives |
| 71 | Power Inductors | Passives |
| 72 | RF/Signal Inductors | Passives |
| B1 | Rectifier Diodes | Discrete Semiconductors |
| B2 | Schottky Barrier Diodes | Discrete Semiconductors |
| B3 | Zener / Voltage Reference Diodes | Discrete Semiconductors |
| B4 | TVS Diodes — Transient Voltage Suppressors | Discrete Semiconductors |
| B5 | MOSFETs — N-Channel & P-Channel | Discrete Semiconductors |
| B6 | BJTs — NPN & PNP | Discrete Semiconductors |
| B7 | IGBTs — Insulated Gate Bipolar Transistors | Discrete Semiconductors |
| B8 | Thyristors / TRIACs / SCRs | Discrete Semiconductors |
| B9 | JFETs — Junction Field-Effect Transistors | Discrete Semiconductors |
| C1 | Linear Voltage Regulators (LDOs) | Voltage Regulators |
| C2 | Switching Regulators (DC-DC Converters & Controllers) | Voltage Regulators |
| C3 | Gate Drivers (MOSFET / IGBT / SiC / GaN) | Gate Drivers |
| C4 | Op-Amps / Comparators / Instrumentation Amplifiers | Amplifiers |
| C5 | Logic ICs — 74-Series Standard Logic | Logic ICs |
| C6 | Voltage References (Series / Shunt / Buried Zener) | Voltage References |
| C7 | Interface ICs (RS-485, CAN, I2C, USB) | Interface ICs |
| C8 | Timers and Oscillators (555, XO, MEMS, TCXO, VCXO, OCXO) | Timers and Oscillators |
| C9 | ADCs — Analog-to-Digital Converters (SAR, Delta-Sigma, Pipeline, Flash) | ADCs |
| C10 | DACs — Digital-to-Analog Converters (Voltage Output, Current Output, Audio) | DACs |
| D1 | Crystals — Quartz Resonators | Crystals |
| D2 | Fuses — Traditional Overcurrent Protection | Fuses |
| E1 | Optocouplers / Photocouplers | Optocouplers |
| F1 | Electromechanical Relays (EMR) | Relays |
| F2 | Solid State Relays (SSR) | Relays |

C3 (Gate Drivers) is a standalone base family — detected by subcategory mapping ('Gate Driver', 'MOSFET Driver', 'IGBT Driver', 'Half-Bridge Driver' keywords). TWO Digikey categories ("Gate Drivers" for non-isolated + "Isolators - Gate Drivers" for isolated). 20 matching rules including shoot-through safety: context Q1 (half-bridge) makes output_polarity + dead_time_control + dead_time all BLOCKING — three-check validation ensures any single failure rejects the part.

C4 (Op-Amps / Comparators / Instrumentation Amplifiers) is a single family covering three sub-types (like B8 Thyristors). TWO Digikey categories ("Instrumentation, Op Amps, Buffer Amps" + "Comparators"). 24 matching rules, 5 context questions. Context Q1 (device_function) suppresses sub-type-irrelevant rules: comparators suppress gain_bandwidth/min_stable_gain, op-amps/INA suppress output_type/response_time. device_type (w10 blockOnMissing) is the BLOCKING categorical gate. input_type uses identity_upgrade hierarchy ['CMOS', 'JFET', 'Bipolar']. vicm_range (w9 blockOnMissing) is always BLOCKING (phase reversal risk). min_stable_gain detects decompensated op-amps (BLOCKED in unity-gain via context Q4). MPN prefix enrichment for device_type from 34 patterns.

C5 (Logic ICs — 74-Series Standard Logic) is a standalone base family covering combinational and sequential logic across all active logic families (HC, HCT, AC, ACT, LVC, AHC, AHCT, ALVC, AUP, VHC, VHCT) and legacy TTL. SEVEN Digikey categories ("Gates and Inverters", "Buffers, Drivers, Receivers, Transceivers", "Flip Flops", "Latches", "Counters, Dividers", "Shift Registers", "Signal Switches, Multiplexers, Decoders"). 23 matching rules, 5 context questions. logic_function (w10 blockOnMissing) is the HARD GATE — never cross function codes ('04 ≠ '14, '373 ≠ '374). Post-scoring filter removes function code mismatches. vih (threshold lte w7) catches the HC/HCT substitution trap (TTL VOH_min=2.4V < HC VIH_min=3.5V); context Q1 (TTL driving source) escalates to BLOCKING. Context Q2 (mixed 3.3V/5V) makes input_clamp_diodes + voh BLOCKING. Context Q3 (bus application) makes output_type + oe_polarity BLOCKING. setup_hold_time is application_review (user override — hold-time violations cannot be fixed by slowing clock). MPN parsing (`parse74SeriesMPN`) handles 4 patterns: standard 74-series, original TTL, NC7S/NC7SZ, CD4000.

C6 (Voltage References) covers series references (REF50xx, ADR3x, LT6654), buried Zener references (LTZ1000, REF102, AD587), XFET references (ADR4xxx), and shunt/adjustable types (TL431, LM4040, LM385). ONE Digikey category "Voltage Reference" (series and shunt distinguished by "Reference Type" parametric field). 19 matching rules, 4 context questions. configuration (w10 blockOnMissing) is the HARD GATE — series vs shunt are architecturally incompatible topologies. Post-scoring filter removes configuration mismatches. output_voltage (w10 blockOnMissing) is exact match — 2.500V ≠ 2.048V. enable_shutdown_polarity uses `identity` (not identity_flag) because polarity mismatch in either direction is fatal. Context Q3 (precision level) escalates 7 attributes for high-precision ADC references (tc to BLOCKING, architecture to BLOCKING, initial_accuracy + output_noise + nr_pin to primary+block). MPN enrichment (~30 patterns) infers configuration, architecture, and output_voltage (parsed from encoded digits — REF5025→2.5V, ADR4550→5.0V).

C7 (Interface ICs) covers RS-485/RS-422 transceivers (MAX485, ADM485, SN65HVD0xx/1xx), CAN/CAN FD transceivers (TJA1042, MCP2551, SN65HVD2xx, ISO1042), I2C bus buffers/isolators (PCA9600, ISO1540, ADUM1250), and USB signal-conditioning ICs (TPD4S012, USBLC6). TWO Digikey categories ("Drivers, Receivers, Transceivers" for RS-485+CAN + "Digital Isolators" for I2C). 22 matching rules, 4 context questions. protocol (w10 blockOnMissing) is the HARD GATE — no cross-protocol substitution. Post-scoring filter removes protocol mismatches. Single family with context-driven protocol suppression (like B8 Thyristors). Q1 suppresses protocol-irrelevant attributes (~9 for I2C/USB, ~5 for CAN). de_polarity uses `identity` (not identity_flag) — polarity inversion = inverted direction control. SN65HVD collision: `/^SN65HVD[01]\d/i` = RS-485, `/^SN65HVD2[3-5]\d/i` = CAN. mapCategory() ordering critical — C7 checks MUST come BEFORE Logic ICs 'transceiver' check. ~45 MPN patterns for protocol/isolation/CAN FD enrichment. USB ESD devices (TPD4S012) classified as "TVS Diodes" by Digikey — not in interface IC category.

C8 (Timers and Oscillators) covers 555/556 timer ICs (NE555, TLC555, ICM7555) and packaged oscillators: XO (crystal), MEMS (SiT8008, DSC1001), TCXO (ASTX, TG5032), VCXO (SiT3807, ASVMX), and OCXO (OCHD). TWO Digikey categories ("Programmable Timers and Oscillators" for 555s + "Oscillators" for all oscillator types). 22 matching rules, 4 context questions. device_category (w10 blockOnMissing) is the HARD GATE — 555 timers and packaged oscillators are architecturally unrelated. Post-scoring filter removes cross-category mismatches with XO↔MEMS exception (Application Review instead of hard rejection). Context Q1 (device_category_type, 6 options) suppresses category-irrelevant attributes: 555_timer suppresses ~10 oscillator-only attrs; oscillator types suppress timer_variant. timer_variant (CMOS vs bipolar 555) is a supply voltage gate — inferred from Digikey supply voltage minimum (≤2V = CMOS). MEMS vs crystal XO distinguished by "Base Resonator" Digikey field. ~50 MPN patterns for device_category/timer_variant/output_signal_type enrichment. Suffix-based output type (-L=LVDS, -E=LVPECL). mapCategory() ordering: C8 oscillator check uses `!lower.includes('local oscillator')` guard.

C9 (ADCs — Analog-to-Digital Converters) covers four fundamentally different converter architectures in a single Digikey category ("Analog to Digital Converters (ADCs)"): SAR (1-cycle latency, 8–18 bit, 1 kSPS–5 MSPS), Delta-Sigma (16–32 bit, high latency from decimation filter), Pipeline (10–500 MSPS, moderate resolution), and Flash (>500 MSPS, 6–10 bit, high power). ONE Digikey category. 20 matching rules, 4 context questions. architecture (w10 blockOnMissing) is the HARD GATE — cross-architecture substitution blocked in post-scoring filter (no exceptions, unlike C8's XO↔MEMS). resolution_bits (w10 blockOnMissing) is exact match. simultaneous_sampling (identity_flag w9) catches multiplexed→simultaneous substitution failures in motor control and phase-sensitive measurement. Context Q1 (architecture, BLOCKING) drives all 4 architecture gates. Q2 (precision class) escalates ENOB/INL/DNL to mandatory for 16–24-bit. Q3 (sampling topology) has 4 options: single/multiplexed, simultaneous, control loop, battery-powered. Q4 is automotive AEC-Q100. ~55 MPN patterns for architecture/resolution/interface enrichment (TI ADS1xxx=Delta-Sigma, ADS7xxx/ADS8xxx=SAR; AD AD71xx=Delta-Sigma, AD76xx=SAR, AD92xx=Pipeline; Microchip MCP32xx=SAR). Digikey "Sigma-Delta" normalized to "Delta-Sigma"; "Pipelined" to "Pipeline". ~48% Digikey weight coverage (ENOB, INL, DNL, THD, simultaneous_sampling, conversion_latency all datasheet-only).

C10 (DACs — Digital-to-Analog Converters) covers voltage-output DACs (DAC8568, AD5791, MCP4921), current-output DACs (AD5420, DAC8760), and audio DACs (PCM5102A, CS4344). ONE main Digikey category "Digital to Analog Converters (DAC)". Audio DACs in separate Digikey category "ADCs/DACs - Special Purpose" — NOT mapped. 22 matching rules, 4 context questions. output_type (w10 blockOnMissing) is the HARD GATE — voltage-output and current-output are architecturally incompatible topologies. Post-scoring filter removes cross-type mismatches (no exceptions). Compound Digikey fields: "Output Type" encodes output_type + output_buffered ("Voltage - Buffered"/"Voltage - Unbuffered"/"Current - Buffered"); "INL/DNL (LSB)" encodes inl_lsb + dnl_lsb. Context Q1 (output type, BLOCKING) drives voltage/current gate. Q2 (precision class) escalates INL/DNL/glitch/settling/noise for 16–20-bit. Q3 (application type) has 4 options: audio (glitch_energy BLOCKING), precision_dc, industrial_control (power_on_reset_state BLOCKING), battery_powered. Q4 is automotive AEC-Q100. ~55 MPN patterns for output_type/resolution/interface enrichment. `diac` guard in mapCategory/mapSubcategory prevents collision with Thyristors DIACs.

D1 (Crystals — Quartz Resonators) is the first family in Block D: Frequency Control. Standalone base family — 2-pin passive quartz resonators used as frequency references. ONE Digikey category "Crystals". 18 matching rules, 3 context questions. nominal_frequency_hz (w10 blockOnMissing) is exact Hz match. load_capacitance_pf (w9 blockOnMissing) is the #1 crystal substitution error — wrong CL shifts frequency permanently. mounting_type (w7 blockOnMissing) is SMD↔TH gate. overtone_order (identity_flag w9) is a hard gate — fundamental↔overtone cross-substitution produces wrong frequency. drive_level_uw uses threshold GTE (not LTE) — replacement must handle ≥ original power. AEC-Q200 (passive), NOT AEC-Q100. Post-scoring filter for mounting_type and overtone_order. Context Q1 (accuracy: consumer/comms/precision/RTC). Q2 (VCXO circuit — C0 to mandatory+block). Q3 (extended temp/automotive — ESR+AEC-Q200 mandatory). ~40 MPN enrichment patterns (Abracon, NDK, Epson, TXC, Kyocera, ECS, IQD, Murata). Ceramic resonator detection (CSTCE/CSTLS/CSTNR/AWSCR/ZTT → flagged, not D1). mapCategory() crystal check MUST come before C8 oscillator check with guard `!lower.includes('oscillator')`.

D2 (Fuses — Traditional Overcurrent Protection) is the second family in Block D. Standalone base family — one-time overcurrent protection devices (cartridge, SMD, automotive blade). TWO Digikey categories ("Fuses" for cartridge/SMD + "Automotive Fuses" for blade types). 14 matching rules, 3 context questions. current_rating_a (w10 blockOnMissing) is IDENTITY — not a threshold. Upsizing is NOT safe (higher rating may not interrupt faults). speed_class (w9 blockOnMissing) is a HARD GATE — Fast-blow (F/FF) vs Slow-blow (T/TT) are fundamentally different time-current curves. voltage_rating_v (w10 blockOnMissing) is threshold GTE — safety-critical minimum. breaking_capacity_a (w10 blockOnMissing) is threshold GTE — safety-critical. package_format (w9 blockOnMissing) is a HARD GATE — 5×20mm/6.3×32mm/SMD/blade physically incompatible. i2t_rating_a2s (w8 threshold LTE) — semiconductor protection spec, escalated to mandatory+block for Q2=semiconductor. voltage_type (AC/DC identity_flag w7) — DC arcs have no zero crossing, 250VAC fuse may be only 32VDC. AEC-Q200 (passive), NOT AEC-Q100. Post-scoring filter for speed_class and package_format (including within-blade ATM≠ATC≠APX). Context Q1 (supply type: AC mains/low-voltage DC/high-voltage DC). Q2 (protecting: semiconductor/motor-inductive/general wiring). Q3 (automotive — AEC-Q200 mandatory). ~30 MPN enrichment patterns (Littelfuse 218/312/0451, Schurter GSF/FST, Bel Fuse GMA/MDL, Bourns SF, automotive ATM/ATO/ATC/APX). PTC redirect guard (PPTC/MF-MSMF/0ZC/Polyswitch → Family 66). mapCategory() splits fuse from Protection catch-all: PTC resettable check BEFORE general fuse check.

E1 (Optocouplers / Photocouplers) is the first family in Block E: Optoelectronics. Standalone base family covering phototransistor, photodarlington, and logic-output optocouplers. TWO Digikey categories ("Optoisolators - Transistor, Photovoltaic Output" for phototransistor/photodarlington + "Optoisolators - Logic Output" for CMOS/TTL-compatible output). 23 matching rules, 4 context questions. output_transistor_type (w10 blockOnMissing) is the HARD GATE — phototransistor / photodarlington / logic-output architecturally incompatible. isolation_voltage_vrms (w10 blockOnMissing) is safety-critical threshold GTE — never downgrade. channel_count and package_type are BLOCKING identity gates. CTR is a gain budget at specific If. AEC-Q101 (discrete semiconductors), NOT AEC-Q100 or AEC-Q200. Digital isolators (ADUM, Si84xx, Si86xx) are NOT E1. Post-scoring filter for output_transistor_type and channel_count. Context Q1 (isolation class) escalates creepage/clearance/safety_cert for reinforced isolation. Q2 (bandwidth) escalates for PWM and digital applications. Q3 (CTR precision) escalates ctr_min/ctr_max for bounded-range feedback loops. Q4 is automotive AEC-Q101. ~30 MPN enrichment patterns (PC817/4N25/6N137/HCPL/MCT2). `category: 'Discrete Semiconductors'`.

F1 (Electromechanical Relays — EMR) is the first family in Block F (Relays). Standalone base family — single-coil electromechanical relays: PCB power relays, signal relays, and automotive relays. THREE Digikey categories ("Power Relays, Over 2 Amps" + "Signal Relays, Up to 2 Amps" + "Automotive Relays"). 23 matching rules, 4 context questions. coil_voltage_vdc (w10 blockOnMissing) is IDENTITY — exact match, NOT a threshold in either direction (24V coil on 12V won't pull in; 5V coil on 12V overheats). contact_form (w10 blockOnMissing) is HARD GATE — SPST-NO/SPST-NC/SPDT/DPST/DPDT define wiring topology. contact_current_rating_a and contact_voltage_rating_v (w9 blockOnMissing) are safety-critical threshold GTE — derate for inductive (1.5×) and motor (2×/LRA) loads. contact_material is a reliability gate for dry-circuit applications (<100mA) — silver contacts form insulating oxide, gold-clad required. coil_resistance_ohm (threshold GTE w7) critical for GPIO direct drive (8–25mA limit). AC/DC contact voltage NOT interchangeable — DC arcs have no zero crossing. AEC-Q200 (electromechanical/passive), NOT AEC-Q100/Q101. SSRs (Crydom, G3, G9) are NOT F1 — redirect to F2. Post-scoring filter for contact_form, coil_voltage_vdc, and contact_count mismatches. Context Q1 (load type: resistive/inductive/motor/dry-circuit). Q2 (coil driver: dedicated/GPIO direct/battery). Q3 (cycle/timing: standard/high-cycle/timing-critical). Q4 (automotive AEC-Q200). ~40 MPN enrichment patterns (Omron G2R/G5LE/G5Q/G5V/G6K, TE V23084/RT, Panasonic JS/JW/TQ, Fujitsu FTR, Hongfa HF115F, Songle SRD). Coil voltage inferred from MPN suffix (-12VDC/-DC12/-012).

F2 (Solid State Relays — SSR) is the second family in Block F (Relays). Standalone base family — semiconductor switching with input-output isolation: TRIAC-output (AC loads), SCR-output (AC loads), and MOSFET-output (DC loads) in PCB-mount, panel-mount, and DIN-rail form factors. TWO Digikey categories ("Solid State Relays" + "Solid State Relays - Industrial Mount"). 23 matching rules, 4 context questions. output_switch_type (w10 blockOnMissing) is the HARD GATE — TRIAC/SCR latches on DC loads (no zero-crossing for turn-off = permanent fault), MOSFET not rated for AC. Cross-type BLOCKED unconditionally. firing_mode (w9 blockOnMissing) is a HARD GATE — zero-crossing vs random-fire not interchangeable. load_voltage_max_v and load_current_max_a (w10 blockOnMissing) are safety-critical threshold GTE with thermal derating. load_current_min_a is a hidden TRIAC failure mode for low-current loads. input_voltage_range_v (w9 threshold superset blockOnMissing) — control range must contain actual voltage. No AEC-Q standard applies (not Q100/Q101/Q200). EMR redirect guard: G5LE/G2R/V23084/HF115F/SRD → F1. Discrete TRIAC/SCR redirect: BT136/BT138/TIC206/MAC → B8. Post-scoring filter for output_switch_type and mounting_type mismatches. Context Q1 (load supply: AC mains/AC safety-certified/DC load). Q2 (load type: resistive/inductive/capacitive-lamp/low-current). Q3 (speed/thermal: standard/timing-critical/high-temp). Q4 (transient protection: standard/industrial-harsh). ~25 MPN enrichment patterns (Crydom D24/D48/CMX/CX/HD/EZ, Omron G3NA/G3NB/G3MC/G3PA, Carlo Gavazzi RA/RZ/RD, Schneider SSM, Kyotto KSI/KSR/KSD, Littelfuse RSSR/MSSR). Output switch type and firing mode inferred from MPN prefix and description.

**Variant families** (53, 54, 55, 60, 13, 72, B2, B3, B4) are derived from base families using `deltaBuilder.ts` — the classifier in `familyClassifier.ts` detects them from part attributes. B2 (Schottky) is classified from B1 (Rectifier Diodes) when the part description contains 'Schottky', 'SBD', or 'SiC diode'. B3 (Zener) is classified from B1 when the description contains 'Zener', 'voltage reference diode', or MPN starts with 'BZX', 'BZT', 'MMSZ'. B4 (TVS) is classified from B1 when the description contains 'TVS', 'transient voltage', 'ESD protection', or MPN matches TVS prefixes (SMAJ, SMBJ, P6KE, PESD, TPD, ESDA, etc.). B5 (MOSFETs) is a standalone base family — detected by subcategory mapping ('MOSFET', 'FET', 'N-ch', 'P-ch', 'SiC MOSFET', 'GaN FET' keywords). B6 (BJTs) is a standalone base family — detected by subcategory mapping ('BJT', 'Bipolar Transistor', 'NPN', 'PNP' keywords). B7 (IGBTs) is a standalone base family — detected by subcategory mapping ('IGBT', 'Insulated Gate Bipolar Transistor' keywords). B8 (Thyristors) is a standalone base family — detected by subcategory mapping ('SCR', 'TRIAC', 'DIAC', 'Thyristor', 'SIDAC' keywords). Three sub-types (SCR/TRIAC/DIAC) share one logic table; context question Q1 suppresses irrelevant rules per sub-type via `not_applicable` effects. B9 (JFETs) is classified as a variant of B5 (MOSFETs) when detected by description keywords ('JFET', 'J-FET', 'junction field effect', 'depletion mode FET') or MPN prefixes (2N54xx, 2SK, 2SJ, J112, J113, MPF102, BF245, IFxxx). Uses the new `identity_range` LogicType for Vp and Idss range overlap matching.

**Context questions** in `lib/contextQuestions/` provide per-family application context that modifies rule weights at evaluation time.

## The docs/ Folder

Contains 31 `.docx` files — one per base component family — defining the cross-reference logic rules that were encoded into the TypeScript logic tables. These are the authoritative source documents. The `passive_variants_delta.docx` covers the 6 variant families.

Also: `application-context-attribute-map.md` — comprehensive guide mapping families to context questions with effects.

See `docs/DECISIONS.md` for architectural decisions and `docs/BACKLOG.md` for known gaps.

## Key Patterns

- **OrchestratorMessage/OrchestratorResponse** types live in `lib/types.ts`, not in the orchestrator module, to avoid client bundles importing `@anthropic-ai/sdk`
- **enableCssLayer must be false** in ThemeRegistry — setting it to true causes MUI styles to lose specificity
- **globals.css** should only have `box-sizing: border-box` on `*` — no `padding: 0; margin: 0`
- **Layout constants** are shared via `lib/layoutConstants.ts` (HEADER_HEIGHT, ROW_FONT_SIZE, etc.)
- **Two-step panel reveal**: idle → 70/30 (attributes) → 40/30/30 (recommendations)
- **Particle wave background**: Canvas animation in `ParticleWaveBackground.tsx` shows in idle state, fades out when attributes panel appears. Grid container is transparent; individual panels have opaque `bgcolor` so they cover the canvas.
- **useAppState** tries Claude API first; if no API key, falls back to deterministic mode
- **Multi-source search** (Decision #106, updated #135): `searchParts()` queries Digikey + Atlas + Parts.io in parallel. `looksLikeMpn()` heuristic routes MPN-like queries to Parts.io additionally; descriptions only hit Digikey + Atlas. Priority dedup: Digikey wins, non-Digikey results only for parts not in Digikey. Result cap 50. `PartSummary.dataSource` tags origin. Mouser removed from search (Decision #135) — parts discoverable only via Mouser caused dead-end attribute fetches since `getAttributes()` has no Mouser fallback. Mouser retained for `SuggestedReplacement` lookups only (Decision #97).
- **partDataService** tries Digikey first; if unavailable, falls back to parts.io → Atlas → null. After Digikey, enriches with parts.io gap-fill AND Mouser commercial data **in parallel** via `enrichSourceInParallel()` (Digikey values win on conflicts). When parts.io is the primary source (no Digikey/Atlas match), `disambiguatePartsioSubcategory()` refines broad Class names (e.g., "Capacitors") into specific families using description keywords and parametric hints. Batch validation has an additional fallback: if `searchParts()` returns 'none', tries `getAttributes()` directly (exact MPN lookup) before marking "not-found" (Decision #108).
- **Persistent L2 cache** (Decision #99, modified by #158): `part_data_cache` Supabase table sits between in-memory L1 caches and live API calls. Three-tier TTL: parametric (indefinite Digikey / 90-day parts.io), lifecycle (6 months), commercial (24 hours). Cross-user, survives cold starts. Digikey keyword search results warm the cache via `warmCacheFromSearchResults()`. Not-found results cached 24h. All writes fire-and-forget. Admin: `GET/DELETE /api/admin/cache`, cache stats in data-sources endpoint; per-MPN purge UI on `DataSourcesPanel.tsx`. **FindChips carve-out (Decision #158):** FC pricing/stock are NOT persisted at L2 — `getFindchipsResults()` does not write `fc-results` rows, and L1 in-memory TTL is 5 min (down from 30) so users never see hours-stale numbers. Digikey's commercial slice (`commercial:${currency}` variant) still uses the 24h commercial tier.
- **Search cache source provenance** (Decision #126, updated #128): `SearchResult.sourcesContributed` tracks which data sources were successfully queried (even 0-result queries count). `shouldBypassSearchCache()` only bypasses legacy entries missing `sourcesContributed`. Per-source checks were removed — they caused a sticky bypass when Mouser returned 0 results for obscure MPNs.
- **Recommendations L2 cache** (Decision #128, split by #163): two-tier. **Full-result tier** (`rec:<RECS_CACHE_SCHEMA_VERSION>:<mpn>:<hash>`, 30-day TTL): caches `RecommendationResult` keyed on overrides + context + prefs + currency + options. Hits when every input matches. **Base-payload tier** (`rec-base:<BASE_RECS_SCHEMA_VERSION>:<mpn>:<hash>`, 30-day TTL): caches pre-scoring artifacts (`sourceAttrs`, `allCandidates`, certification/equivalence/dataSource/enrichedFrom maps) keyed only on `mpn + overrides + currency + opts` — context, user prefs, and replacement priorities are NOT in the key. Lets a context-only change skip the heavy fetch block, turning a 3-8s rerun into ~100-300ms in-memory rescore. Both tiers invalidated by `invalidateRecommendationsCache()`. Bump `RECS_CACHE_SCHEMA_VERSION` for full-result schema changes; bump `BASE_RECS_SCHEMA_VERSION` for base-payload shape changes.
- **MFR alias resolver L2 cache** (Decision #163 Fix 1): `manufacturerAliasResolver.ts` adds Supabase-backed L2 over the existing 5-min in-memory cache. Stores raw rows from `atlas_manufacturers` + `manufacturer_companies` + `manufacturer_aliases` under sentinel key (`mpn='__mfr_alias_index__'`, `variant='v1'`), 6-month TTL. Cold-start drops from ~400-600ms to ~30-60ms. `invalidateManufacturerAliasCache()` clears both L1 and L2; called from admin alias-edit routes. Bump `MFR_ALIAS_L2_VERSION` when row shapes change.
- **Deferred parts.io candidate enrichment** (Decision #163 Fix 3): single-part flow fires `/api/xref/[mpn]` POST with `skipPartsioEnrichment: true` for the initial fast call (cards render ~500-1500ms sooner on Digikey-only scoring), then `triggerPartsioEnrichment()` re-fires the same call without the flag in the background. Server hits the base-payload cache to skip candidate re-fetching, runs parts.io gap-fill, re-scores, returns updated recs; client replaces state and re-fires `triggerFCEnrichment()` (FC L1 cache → instant supplier merge). Mirrors the existing FC / LLM deferred-enrichment pattern. Digikey down → enrichment is no-op; parts.io down → background call errors silently, cards stay on Digikey-only scoring.
- **Distributor count on search-result cards** (Decision #164): `PartSummary.distributorCount` populated two ways. (1) **L2 cache**: `getFindchipsResults()` writes `{ count }` under `service='findchips', variant='fc-distributors'`, 6-month TTL — distributor identity is stable on weeks/months timescale unlike pricing/stock. `searchParts()` batch-reads via `getCachedDistributorCounts()` after merge. (2) **Post-search progressive enrichment**: `triggerSearchDistributorEnrichment(messageId, parts)` in `useAppState.ts` mirrors `triggerFCEnrichment` — fires `enrichWithFCBatch` for cold MPNs after cards render, merges counts into both the message's `interactiveElement.parts` and `state.searchResult.matches` (so the LLM sees fresh counts on the next chat turn). Cards show "N distributors" chip when count > 0. Search itself unchanged in latency.
- **Conversational chat over search results** (Decision #165): four routing modes — Refine (subset of current cards), Pivot (new search), Ask (parametric Q), Link (inline MPN clickable). Tools: `present_part_options(mpns)` re-renders a chosen subset of cards (resolves MPNs against `currentSearchResult.matches`, populates `data.searchResult` so the existing reset path collapses right panels for free); `get_batch_attributes(mpns)` (max 10, concurrency 5) returns compact projection per part for compound parametric Qs. `find_replacements` REMOVED from chat tools — cross-refs are strictly button-driven; the LLM tool fired cross-refs when users were just asking parametric questions. `summarizeSearchResults()` injects MPN list + lightweight params into LLM context (mirrors `summarizeRecommendations`). Inline MPN auto-linking in `MessageBubble.tsx`: `knownMpns: Set<string>` (built from `searchResult.matches + allRecommendations + sourcePart`) drives a ReactMarkdown `components` override on `p`/`li`/`strong`/`em`/`td` that linkifies known MPNs only — no regex over arbitrary text → zero false positives. `handleMpnClick` resolves MPN → PartSummary → existing `handleConfirmPart`. New `searchResultRef` mirrors `state.searchResult` for async callbacks.
- **MFR profile tool + general claim discipline** (Decision #166): `get_manufacturer_profile(name)` wraps `getProfileForManufacturer()`. Coverage: ~115 Chinese MFRs in Atlas with rich profiles + a few Western majors via mock fallback; everything else returns `{ notFound: true }` and the model is instructed to tell the user plainly we only carry detailed profiles for Chinese MFRs and offer the search-based fallback. Surfaced four additional fields (`stockCode`, `websiteUrl`, `contactInfo`, `partsioName`) through `mapAtlasToManufacturerProfile()` and the tool projection — Atlas DB had them but the canonical type dropped them, leading to the GigaDevice "Private company" failure when `stock_code: "603986"` was right there. `contactInfo` typed as permissive union (`string | Record<string, string>`) for JSONB shape variance. **Architectural note**: the system prompt initially accumulated five+ overlapping rule blocks for cert-audit specifics; refactored into one general claim-discipline rule ("every factual claim must have a backing source in tool data; otherwise downgrade to 'not in our profile' or hedge as interpretation") plus one per-shape template (industry-fitness cert audit with per-industry checklists for automotive / medical / aerospace / space / defense). New question shapes (financial, M&A, EOL, leadership, ESG) ride the general rule for free — no per-shape patches. Bar for adding future templates: question must have (a) implicit completeness requirement + (b) domain-knowledge-derived checklist not derivable from tool data.
- **Recommendation pipeline performance** (Decision #98, #138): UI passes pre-fetched `sourceAttributes` to `/api/xref` POST to skip duplicate `getAttributes()` call. FindChips candidate enrichment is deferred — recs display immediately, then `triggerFCEnrichment()` sorts recs by display priority (via shared `sortRecommendationsForDisplay()` helper), fires a smaller 30-MPN priority chunk first + subsequent 50-MPN chunks in parallel via `Promise.all`, and merges each chunk into state as it returns so the top-of-list cards populate within seconds even under the 60/min FindChips rate limit. `isEnrichingFC` flag drives a `Loading pricing…` placeholder on cards during enrichment. QC logging is fire-and-forget. See `triggerFCEnrichment()` and `showRecsAndDeferAssessment()` in `useAppState.ts`.
- **Post-recs chat summary is deterministic** (Decision #173): `buildRecsSummary()` in `lib/services/recommendationSummary.ts` posts a 1-2 line summary built directly from rec fields. The previous LLM-driven engineering assessment was removed after three rounds of prompt tightening failed to stop Sonnet from fabricating MFR origin / cert / supply-chain prose. User-driven follow-up Q&A still routes through `chatWithOrchestrator` in `handleSearchWithLLM` with the existing system-prompt discipline rules. Bundled-filter path (e.g., "Chinese replacements") skips the deterministic summary because `dispatchFilterIntent` already posts an equivalent message.
- **Filter pipeline** (Decisions #131 filter intents, #171 origin filter): `applyRecommendationFilter(recs, FilterInput)` in `lib/services/recommendationFilter.ts` is the shared predicate used by both the LLM `filter_recommendations` tool and the client-side `detectFilterIntent` intercept (`lib/services/filterIntentDetector.ts`). Supported predicates: `manufacturer_filter`, `min_match_percentage`, `exclude_obsolete`, `exclude_failing_parameters`, `attribute_filters`, `category_filter`, `mfr_origin_filter` (`'atlas' | 'western'`). Origin filter keys off `XrefRecommendation.part.mfrOrigin` (set per Decision #161); detector recognizes Chinese / Asian / China / PRC / mainland / made-in-China and Western / American / European / non-Chinese phrasings without requiring a filter verb.
- **Bundled-search-intent routing** (Decision #172): when a search query bundles a follow-up intent ("find Chinese replacements for X"), `handleSearch` stashes both `pendingIntent` (state) and `pendingIntentQueryRef` (ref). After part confirmation, `tryAutoFireIntent` consumes both — for `find_replacements`, the stashed query is moved into `pendingPostRecsFilterRef` so the existing `showRecsAndDeferAssessment` consumer applies any bundled qualifier ("Chinese", "≥80%") once recs land. Stale-closure trap: `handleFindReplacements` accepts a `partOverride` parameter (parallel to the `contextOverride` from Decision #155) so callers on the auto-fire path bypass the captured-state read of `state.sourcePart` / `state.sourceAttributes`. `dispatchIntent` also sync-primes `sourceAttributesRef.current` before invoking `handleFindReplacements` (the useEffect mirror lags by one render).
- **Per-list views** (Decision #81): Views stored per-list in Supabase `parts_lists.view_configs` JSONB. Global views are templates (`useViewTemplates` in localStorage) used to seed new lists. `useListViewConfig` hook manages per-list views with 500ms debounced Supabase persistence. "Save as Template" strips `ss:*` columns via `sanitizeTemplateColumns()`. Lists with null `view_configs` auto-migrate from templates on first load. Default (starred) view: `defaultViewId` in ViewState JSONB, applied by `useListViewConfig` on initialization (overrides `activeViewId`). Star icon in `ViewControls.tsx` calls `setDefaultView(activeView.id)`.
- **Column portability**: Templates may only contain portable column IDs (`sys:*`, `mapped:*`, `dk:*`, `dkp:*`). `ss:*` (raw spreadsheet index) columns are list-specific and stripped by `sanitizeTemplateColumns()` before saving to template library.
- **mapped:cpn**: Optional Customer Part Number / Internal Part Number column. Auto-detected from headers in `excelParser.ts`. `cpnColumn` on `ColumnMapping`, `rawCpn` on `PartsListRow`. Resolved at render time like `mapped:manufacturer`.
- **mapped:unitCost** (Decision #156): Optional current-cost column. Auto-detected via `UNIT_COST_PATTERNS` in `excelParser.ts` (longer phrases first, "cost"/"price" last). `unitCostColumn` on `ColumnMapping`, `rawUnitCost` on `PartsListRow`. Powers `sys:priceDelta`. Numeric parsing via shared `toNumber()` from `lib/calculatedFields.ts`.
- **sys:priceDelta** (Decision #156): Built-in "Repl. Savings" column (group "Replacements"). Computes `toNumber(rawUnitCost) − resolveReplacementUnitPrice(row)`. Positive=savings, negative=more expensive, undefined=missing. Mirrors `sys:top_suggestion_price` for picking the best cross-distributor quote (FindChips supplierQuotes → part.unitPrice fallback). Signed currency display, green/red color, sortable.
- **Column display label convention** (Decision #157): `getColumnDisplayLabel(col)` in `lib/columnDefinitions.ts` appends a source suffix based on `col.dataSource`. Map: `digikey→DK`, `partsio→P`, `atlas→A`, `findchips→FC`, `mouser→Mouser`. Idempotent. Routed through table header (`PartsListTable.tsx`), column picker (`ColumnPickerDialog.tsx`), and calculated-field operand picker (`CalculatedFieldEditor.tsx`). Picker's `SourceBadge` chip is suppressed for any source covered by the suffix map. To add a new source: add one line to `SOURCE_SUFFIX`. "Manufacturer" abbreviated to "MFR" on `mapped:manufacturer` and `dk:manufacturer`.
- **Picker visibility for `ss:*` columns** (Decision #156): `useColumnCatalog` keeps any `ss:*` whose `effectiveHeaders[index]` is a non-empty trimmed string. Previously a strict `nonEmptyIndices` data scan silently dropped numeric/currency columns. Unlabeled placeholder columns still require actual data.
- **Master-view save reverse-mapping** (Decision #156): On master-view save in `PartsListShell.tsx`, `reverseMapKnownColumns()` runs before `sanitizeTemplateColumns()`. Picker expands `mapped:*` → `ss:N` on open; without reverse-map, sanitize would strip every Your Data column. Applies to both create and edit master-scope flows.
- **Manual part addition** (Decisions #113, #115): Empty lists can be created via third "Empty List" tab in `InputMethodDialog`. Individual parts added via `AddPartDialog` — two-step Search → Select flow: user enters MPN + optional MFR, clicks Search, picks from a results list (multi-source: Digikey/Atlas/Parts.io), then the verified `PartSummary` is passed to `handleAddPart()`. New part inserted at top of list with highlight animation. Two-phase validation: row appears immediately with resolved identity (status: 'validating'), full attributes + recommendations merge in background. Quick search via `/api/parts-list/search-quick` (search only, ~500ms, skipMouser). `skipSearch` flag on validate route skips redundant search when MPN already confirmed. Inline cell editing: `ss:*` columns are double-click-to-edit; MPN/MFR edits trigger debounced re-validation. Mouser API timeout (8s per attempt) and Digikey API timeout (10s per attempt) prevent batch validation from hanging. Batch validation passes `skipMouser: true` to `getAttributes()` and `getRecommendations()` since Mouser provides only commercial data. Progressive Mouser enrichment runs every 10 resolved rows during validation (not only at end). Cancel validation via Stop button (AbortController on all streams). Notification snackbar alerts on data source failures with Retry button for Mouser. Validation concurrency: 5 parallel items.
- **Supabase 1000-row limit**: Supabase/PostgREST caps single queries at 1000 rows by default. Use `fetchAllPages()` pattern (paginate in chunks of 1000 with `.range()`) for detail pages, or push aggregation to SQL via RPC functions for list pages (Decision #123). See `/api/admin/atlas/route.ts` (fetchAllPages) and `/api/admin/manufacturers/route.ts` (RPC `get_manufacturer_product_stats`).
- **Manufacturer name mismatch**: `atlas_products.manufacturer` uses English-only names (e.g., "ISC") while `atlas_manufacturers.name_display` has combined "ENGLISH Chinese" format (e.g., "ISC 无锡固电"). Admin product aggregation folds across every known variant via `[name_display, name_en, name_zh, ...aliases]` (Decision #148).
- **MFR profile panel + identity-based CN flag** (Decision #161): Side panel that opens on MFR-name click is now wired to `atlas_manufacturers` instead of the legacy ~10-MFR mock map (which silently no-op'd for every Chinese MFR). `lib/services/manufacturerProfileService.ts` resolves through `resolveManufacturerAlias()` → fetches the matching atlas row → maps to `ManufacturerProfile`. Falls back to `mockManufacturerData.ts` for Western MFRs not yet in `manufacturer_companies`, then to empty-state for unknowns. Endpoint `GET /api/manufacturer-profile?name=<encoded>` (auth-guarded). Hook `useManufacturerProfile` is async with placeholder-on-open + in-flight request id. Country flag is now keyed off `XrefRecommendation.mfrOrigin` (resolved per unique MFR in `getRecommendations()` via Promise.all over the alias resolver, 5-min cached) rather than `dataSource === 'atlas'` — so 3PEAK shows 🇨🇳 on every card regardless of whether attributes came from Digikey, Atlas, Mouser, or parts.io. RECS_CACHE_SCHEMA_VERSION bumped v9 → v10 to refresh cached recs.
- **Manufacturer alias resolver** (Decisions #148, #149): `lib/services/manufacturerAliasResolver.ts` is the canonical MFR-identity layer, reading two sources on cold cache (5-min TTL). **Atlas** (Chinese): `atlas_manufacturers.{name_display, name_en, name_zh, aliases[]}`. **Western**: `manufacturer_companies` + `manufacturer_aliases` two-table graph (uid, parent_uid self-ref, status enum, 15 `context_code` taxonomy). `resolveManufacturerAlias(input)` returns `{ canonical, slug, source, variants, companyUid?, lineage? }` via exact case-insensitive hit. Western adds parent-chain walking: steps up through `parent_uid`, falling back to `context=acquired_by|merged_into` alias rows (source uses both mechanisms — user-confirmed intentional). Walk terminates at self-ref corporate/active entity or MAX_PARENT_HOPS=6. Variants for a canonical include every descendant's name + aliases. Collision policy: corporate/active canonical wins; ties broken by lowest uid. Atlas wins cross-source collisions. Wired into Atlas search (`atlasClient.searchAtlasProducts` dual-query), AddPart mismatch (`search-quick/route.ts`), BOM dedup (`usePartsListState` via client-safe `manufacturerAliasClient.ts` + `POST /api/manufacturer-aliases/canonicalize`), admin manufacturer aggregation (list + per-slug products), **BOM batch validation** (Decision #150: `lib/services/mfrMatchPicker.ts` → `pickMfrAwareMatch()` prefers the search candidate whose MFR canonically matches the user's input over blind `matches[0]` when multiple candidates exist, called from `app/api/parts-list/validate/route.ts`), **matching-engine preferred-MFR sort** (Decision #151: `isPreferredManufacturer()` accepts optional `manufacturerSlugLookup` for canonical-slug comparison; `partDataService.getRecommendations()` pre-resolves preferred + candidate MFRs so "prefer Analog Devices" floats Linear Tech / Maxim / Hittite parts too), and **admin alias editor** (Decision #152: dedicated "Aliases" tab on `/admin/manufacturers/[slug]` — sibling of Products / Flagged / Coverage / Cross-Refs / Profile. Click × on a chip to remove, type + Enter to add, optimistic PATCH → resolver cache auto-invalidates on save. `normalizeAliasInput()` helper exported from the PATCH route validates/dedupes/trims input — max 50 aliases, 100 chars each). Null = no match, callers fall through to existing substring behavior. Cache invalidated from `PATCH /api/admin/atlas/manufacturers` on toggle. Western deployment: apply `scripts/supabase-manufacturer-companies-schema.sql` then `node scripts/manufacturer-companies-import.mjs`. Upcoming AVL/AML/Line-Card ingestion will store `companyUid` as the stable FK.
- **List Agent** (Decision #111): Per-list conversational agent (`listChat()` in orchestrator, `/api/list-chat` route). 9 tools: 3 read-only (`get_list_summary`, `query_list`, `get_row_detail`), 3 client-side view (`sort_list`, `filter_list`, `switch_view`), 3 write with confirmation (`delete_rows`, `refresh_rows`, `set_preferred`). Write tools intercepted server-side — return `PendingListAction` descriptor rendered as confirmation button via `InteractiveElement` type `'list-action'`. System prompt includes user context (reuses `buildUserContextSection()`) + list context (name, description, customer, status counts, manufacturers, families). UI: sticky footer bar (34px) + bottom-anchored 50vh drawer. Conversation is ephemeral (MVP).

## QC & Feedback System

The QC page (`/qc`) is a top-level admin-only route (sidebar icon: `RateReviewOutlinedIcon`). It is **feedback-first**: the primary section shows user-submitted feedback items for triage, not raw recommendation logs.

### Architecture

- **Feedback Tab** (primary): Lists all `qc_feedback` rows with status filters (Open/Reviewed/Resolved/Dismissed), search, and sort. Clicking a row opens a detail view that reconstructs the comparison table from the JSONB snapshot stored in `recommendation_log`, highlighting the specific rule the user flagged.
- **Logs Tab** (secondary): Lists raw `recommendation_log` entries with feedback indicators. Has **Export** (CSV/JSON) and **AI Analysis** capabilities.
- **Recommendation Logger** (`lib/services/recommendationLogger.ts`): Writes snapshots (source attributes, recommendations, context Q&A, overrides) to `recommendation_log` as JSONB. Must always be `await`ed — fire-and-forget silently drops entries.
- **Feedback types**: `FeedbackStage` = `rule_logic` | `qualifying_questions`. `FeedbackStatus` = `open` | `reviewed` | `resolved` | `dismissed`.
- **Comparison reconstruction**: The feedback detail view reuses the row-building algorithm from `ComparisonView.tsx` — builds rows from `sourceAttributes.parameters` + `matchDetails`, highlights the flagged rule with a yellow left border.

### Export & AI Analysis (Logs Tab)

- **Export** (`/api/admin/qc/export`): CSV (flat columns + top 3 recs) or JSON (full snapshots) download. Respects current filters, caps at 10K rows. Client uses `window.open(url)` for direct download.
- **AI Analysis** (`/api/admin/qc/analyze`): Server-side aggregation (`lib/services/qcAnalyzer.ts`) computes per-family/per-rule stats from JSONB snapshots, sends compact summary to Claude Sonnet 4.5 via streaming API. SSE events forward text deltas to `QcAnalysisDrawer` (right-side MUI Drawer with `ReactMarkdown` rendering).
- **Aggregation approach**: Raw snapshots are too large for Claude (~5-10K tokens each). `aggregateQcStats()` computes rule failure rates, missing attribute frequency, score distributions, and feedback correlations, then includes 3-5 representative examples. Total input ~3-5K tokens regardless of log count.

### QC Component Structure

`QcShell.tsx` (`components/qc/`) is the top-level orchestrator with settings toggle in the header and `QcSectionNav` for Feedback/Logs sections. Content components live in `components/admin/`:
- `QcFeedbackTab.tsx` → `QcFeedbackDetailView.tsx` (feedback flow)
- `QcLogsTab.tsx` → inline DetailView + Export/Analyze buttons (logs flow)
- `QcAnalysisDrawer.tsx` — AI analysis right-side drawer with streaming markdown
- Shared: `QcFeedbackCard.tsx`, `QcRecommendationSummary.tsx`, `qcConstants.ts`

## Digikey Integration

- Client: `lib/services/digikeyClient.ts` — OAuth2 token management, keyword search, product details
- Mapper: `lib/services/digikeyMapper.ts` — Converts Digikey API responses to internal types
- Param Map: `lib/services/digikeyParamMap.ts` — Maps Digikey `ParameterText` strings to internal `attributeId` values
- Discovery script: `scripts/discover-digikey-params.mjs` — For verifying parameter mappings
- **v4 API pricing** (Decision #121): `StandardPricing` array on `DigikeyProduct` provides quantity-based price breaks (e.g., 1/10/25/100/500/1000). `mapDigikeyPriceBreaks()` in `digikeyMapper.ts` converts to `PriceBreak[]`, carried on `Part.digikeyPriceBreaks`. `buildDigikeyQuote()` uses real tiers when available, falls back to synthetic single-tier for backward compat. Commercial tab `SupplierCard` renders price break tables for both Digikey and Mouser.

**L3 families (43):** Full parameter mapping with logic tables for cross-reference matching:

Parameter mapping is complete for **all 19 passive + 9 discrete + 10 Block C IC + 2 Block D frequency control & protection + 1 Block E optoelectronic + 2 Block F relay families**: MLCC (12), Chip Resistors (52-55), Tantalum (59), Aluminum Electrolytic (58), Aluminum Polymer (60), Film (64), Supercapacitors (61), Fixed Inductors (71/72), Ferrite Beads (70), Common Mode Chokes (69), Varistors (65), PTC Resettable Fuses (66), NTC Thermistors (67), PTC Thermistors (68), Rectifier Diodes (B1, "Single Diodes" + "Bridge Rectifiers"), Schottky Barrier Diodes (B2, "Schottky Diodes" + "Schottky Diode Arrays" — virtual categories resolved from "Technology" parameter), Zener Diodes (B3, "Single Zener Diodes" + "Zener Diode Arrays" — own Digikey categories, ~51% weight coverage), TVS Diodes (B4, single "TVS Diodes" category, ~61% weight coverage — polarity derived from field name enrichment), MOSFETs (B5, "Single FETs, MOSFETs" category, 14 fields, ~60% weight coverage — verified Feb 2026), BJTs (B6, "Bipolar Transistors" category, 11 fields, ~55% weight coverage — verified Feb 2026), IGBTs (B7, "Single IGBTs" category, 14 fields incl. 2 compound, ~55% weight coverage — verified Feb 2026), Thyristors (B8, "SCRs" + "TRIACs" categories, 8-9 fields per sub-type, 1 compound ("Triac Type"→gate_sensitivity+snubberless), ~48-51% weight coverage — verified Feb 2026), JFETs (B9, "JFETs" category, 10 fields, ~45% weight coverage — verified Feb 2026), LDOs (C1, "Voltage Regulators - Linear, Low Drop Out (LDO) Regulators" category, 12 fields, ~52% weight coverage — verified Feb 2026), Switching Regulators (C2, TWO categories: "Voltage Regulators - DC DC Switching Regulators" (integrated, 14 fields) + "DC DC Switching Controllers" (controller-only, 10 fields), ~40-50% weight coverage — verified Feb 2026), Gate Drivers (C3, TWO categories: "Gate Drivers" (non-isolated, 10 fields) + "Isolators - Gate Drivers" (isolated, 10 fields), 5 compound field transformers, ~45-50% weight coverage — verified Feb 2026), Op-Amps/Comparators (C4, TWO categories: "Instrumentation, Op Amps, Buffer Amps" (15 fields) + "Comparators" (13 fields), compound "CMRR, PSRR (Typ)" transformer, ~45-50% weight coverage — verified Feb 2026), Logic ICs (C5, SEVEN categories: "Gates and Inverters" (13 fields) + "Buffers, Drivers, Receivers, Transceivers" (10 fields) + "Flip Flops" (15 fields) + "Latches" (10 fields) + "Counters, Dividers" (11 fields) + "Shift Registers" (9 fields) + "Signal Switches, Multiplexers, Decoders" (9 fields), ~40-45% weight coverage — verified Feb 2026), Voltage References (C6, single "Voltage Reference" category, 13 fields, series/shunt distinguished by "Reference Type" parametric field, ~63% weight coverage — verified Mar 2026), and Interface ICs (C7, TWO categories: "Drivers, Receivers, Transceivers" (RS-485+CAN, 7 fields, ~34% weight coverage) + "Digital Isolators" (I2C, 7 fields, ~39% weight coverage), protocol enrichment from Protocol parametric field + category name, USB ESD devices classified as TVS Diodes by Digikey — verified Mar 2026), and Timers/Oscillators (C8, TWO categories: "Programmable Timers and Oscillators" (555s, 5 fields, ~30% weight coverage) + "Oscillators" (all oscillator types, 10 fields, ~50% weight coverage), device category from "Type" + "Base Resonator" fields, MEMS distinguished by Base Resonator="MEMS", timer_variant inferred from supply voltage minimum — verified Mar 2026), and ADCs (C9, single "Analog to Digital Converters (ADCs)" category, 11 fields, architecture normalization (Sigma-Delta→Delta-Sigma, Pipelined→Pipeline), reference_type normalization (External+Internal→Both), channel_count takes max from multi-value, ~48% weight coverage — ENOB/INL/DNL/THD/simultaneous_sampling/conversion_latency all datasheet-only — verified Mar 2026), and DACs (C10, single "Digital to Analog Converters (DAC)" category, 13 fields incl. 2 compound ("Output Type"→output_type+output_buffered, "INL/DNL (LSB)"→inl_lsb+dnl_lsb), output_type enrichment from compound field, reference_type normalization, channel_count max, ~50% weight coverage — update_rate/glitch_energy/output_noise/output_current/power_on_reset/aec_q100 all datasheet-only — audio DACs in separate "ADCs/DACs - Special Purpose" category NOT mapped — verified Mar 2026), and Crystals (D1, single "Crystals" category, 10 fields, overtone_order from "Operating Mode" field, cut_type inferred from "Type" field ("MHz Crystal"→AT-cut, "kHz Crystal (Tuning Fork)"→Tuning Fork), ~55% weight coverage — shunt_capacitance/drive_level/aging/TC_curve all datasheet-only — ceramic resonator detection guards — verified Mar 2026), and Fuses (D2, TWO categories: "Fuses" (cartridge/SMD, 9 fields) + "Automotive Fuses" (blade, 9 fields), speed_class from "Fuse Type"/"Response Time", breaking_capacity from "Interrupt Rating", PTC resettable guard in mapCategory ordering, ~50% weight coverage — i2t/melting_i2t/body_material/derating all datasheet-only — param field names need discovery script verification — Mar 2026), and Optocouplers (E1, TWO categories: "Optoisolators - Transistor, Photovoltaic Output" (phototransistor/photodarlington, 9 fields) + "Optoisolators - Logic Output" (logic output, 9 fields), ~45% weight coverage — creepage/clearance/working_voltage/CTR_degradation/safety_cert/bandwidth all datasheet-only — param field names need discovery script verification — Mar 2026), and Relays (F1, THREE categories: "Power Relays, Over 2 Amps" (10 fields) + "Signal Relays, Up to 2 Amps" (11 fields) + "Automotive Relays" (11 fields), ~45% weight coverage — electrical_life/contact_bounce/coil_suppress_diode/coil_power/mechanical_life all datasheet-only — param field names need discovery verification — Mar 2026), and Relays (F2, TWO categories: "Solid State Relays" (PCB-mount, 11 fields) + "Solid State Relays - Industrial Mount" (panel/DIN, 11 fields), ~45% weight coverage — thermal_resistance/on_state_voltage_drop/dv_dt/di_dt/load_current_min/off_state_leakage/snubber/varistor/safety_certification all datasheet-only — param field names need discovery script verification — Mar 2026). See `docs/DECISIONS.md` (#16-19, #30-40, #46-55, #71-72) for Digikey API quirks.

**L2 categories (14):** Curated param maps for display only (no logic tables or matching engine). Provide stable `dkp:*` column IDs, clean display names, and proper sort ordering in parts list tables. Wave 1 (Decision #86): Microcontrollers (15 fields), Memory (12), Sensors (19 union → split, see below), Connectors (12), LEDs (12), Switches (10). Wave 2 (Decision #87): RF/Wireless (15 union), Power Supplies (13), Transformers (11 union), Filters (12), Processors (12 union), Audio (15 union), Battery cells (6) + Battery charger ICs (11 — split map), Motors/Fans (13). Cables/Wires and Development Tools intentionally left at L0 (too heterogeneous).

**L2 family-level param maps (Decision #88):** Sensors split into 7 dedicated sub-family param maps + general fallback. Each sensor type gets only its relevant fields (8-14 vs 19-field union). `L2FamilyInfo` metadata index with `getL2Families()` / `getL2FamiliesForCategory()` exports. Temperature Sensors (10 fields, "Analog and Digital Output"), Accelerometers (10, "Accelerometers"), Gyroscopes (11, "Gyroscopes"), IMUs (6, "IMUs (Inertial Measurement Units)"), Current Sensors (14, "Current Sensors"), Pressure Sensors (12, "Pressure Sensors, Transducers"), Humidity Sensors (10, "Humidity, Moisture Sensors"), Magnetic Sensors (10, "Linear, Compass (ICs)"). General `sensorParamMap` (19 fields) remains as fallback for optical, proximity, flow, force, gas sensors. Bug fix: `mapCategory()` now correctly classifies temperature/magnetic/IMU leaf categories as 'Sensors'. Future phases: RF/Wireless, Connectors, Audio, Switches.

## Parts.io Integration (Gap-Fill Enrichment)

Secondary data source (Accuris) that fills parametric gaps after Digikey. See Decision #77.

- Client: `lib/services/partsioClient.ts` — API key auth (query param), `limit=10` with best-record selection, 30-min cache
- Mapper: `lib/services/partsioMapper.ts` — Converts `PartsioListing` → `ParametricAttribute[]`
- Param Map: `lib/services/partsioParamMap.ts` — 17 class param maps, `familyToPartsioClass` mapping (39 families), reverse lookup + extra-fields for admin

**Merge strategy:** Gap-fill only — Digikey values always win. `enrichWithPartsio()` in `partDataService.ts` runs after every Digikey fetch.

**17 parts.io classes:** Capacitors, Resistors, Inductors, Filters, Diodes, Transistors, Trigger Devices, Amplifier Circuits, Logic, Power Circuits, Converters, Drivers And Interfaces, Signal Circuits, Circuit Protection, Optoelectronics, Relays, Crystals/Resonators.

**Taxonomy surprises:** CM Chokes + Ferrite Beads under "Filters" (NOT "Inductors"). SSR photoMOS under "Optoelectronics" (NOT "Relays"). PTC Fuses under "Resistors" (NOT "Circuit Protection").

**Families NOT mapped (no data):** 13 Mica, 55 Chassis Mount, 64 Film, B9 JFETs.

**Top coverage improvements:** B8 Thyristors (+42 weight, ~48%→~70%), F1 Relays (+51, ~45%→~71%), C1 LDOs (+23, ~52%→~65%), E1 Optocouplers (+25, ~45%→~57%), C3 Gate Drivers (+17, ~45%→~55%), 59 Tantalum (+17, ~58%→~73%), 71 Power Inductors (+9), B5 MOSFETs (+17). Param map audit (Decision #103) added 10 previously unmapped fields across 8 classes.

**Admin panel:** `ParamMappingsPanel.tsx` restructured to attribute-centric layout with Digikey Field + Parts.io Field columns, coverage metrics (DK% + PIO% + Combined%), and Zone 2 for extra parts.io fields not in schema.

**API:** Base URL `http://api.qa.parts.io/solr/partsio/listings` (QA — requires VPN). Env var `PARTSIO_API_KEY`. Production URL TBD.

## FindChips Integration (Multi-Distributor Commercial Intelligence — Decision #131)

FindChips (FC) API is an aggregator covering ~80 distributors (Digikey, Mouser, Arrow, LCSC, Farnell, RS, TME, etc.) in a single ~60-200ms API call. Replaces the former per-distributor Mouser integration for pricing/stock/lifecycle. Mouser client retained solely for `SuggestedReplacement` lookups (Decision #97).

- **Client:** `lib/services/findchipsClient.ts` — API key auth (query param), 3-level cache (L1 30min, L2 Supabase 24h, L3 API), rate limiter (60/min, 5000/day), concurrent batch
- **Mapper:** `lib/services/findchipsMapper.ts` — Distributor name normalization, quote/lifecycle/compliance mapping, best-part selection per distributor
- **API:** `GET https://api.findchips.com/v1/fcl-search`. Env var `FINDCHIPS_API_KEY`. No distributor filter (returns all available).

**N-supplier data model:** `SupplierQuote[]`, `LifecycleInfo[]`, `ComplianceData[]` on `Part` and `EnrichedPartData`. `SupplierName` is now `string` to accommodate dynamic distributor names from FC API. `SupplierQuote` extended with `packageType`, `minimumQuantity`, `authorized`. `LifecycleInfo` extended with FC risk scores (`riskRank`, `designRisk`, `productionRisk`, `longTermRisk`).

**Pipeline integration:** Source part enriched after parts.io in `getAttributes()` via `enrichWithFindchips()`. On-demand enrichment via `/api/fc/enrich` for deferred UI enrichment.

**Commercial tab:** Shows one card per distributor (up to ~26), sorted by best unit price. Top 5 expanded, rest behind "Show N more" toggle. Currency-aware formatting via `Intl.NumberFormat`. Package type and authorized badge displayed.

**Mouser suggestions retained (Decision #97):** `fetchMouserSuggestions()` in the recommendation pipeline still queries Mouser for `SuggestedReplacement` MPNs, injected as candidates with `certifiedBy: ['mouser']`. Env var `MOUSER_API_KEY` still required.

**Certified Cross-References (Decision #97, extended #122, #133):** External replacement suggestions from Mouser (`SuggestedReplacement`), parts.io (FFF/Functional Equivalents), and manufacturer-uploaded cross-references are unified under a `certifiedBy?: CertificationSource[]` field on `XrefRecommendation`. `CertificationSource = 'partsio_fff' | 'partsio_functional' | 'mouser' | 'manufacturer'`. All sources are resolved to full parametric candidates and scored by the matching engine. **Manufacturer cross-references** (Decision #122, bidirectional per #133): uploaded via Admin > Manufacturers > Cross-References tab (Excel/CSV with flexible column mapping), stored in `manufacturer_cross_references` Supabase table, fetched in parallel during recommendation pipeline via `fetchManufacturerCrossRefs()`. Lookup queries BOTH `original_mpn` and `xref_mpn` — reverse matches (hit on `xref_mpn`) are swapped before return so the consumer transparently treats the other side as the recommendation. MPN lookups normalize packaging suffixes via `mpnNormalizer.ts` (`-TR`, `-T/R`, `-REEL`, `-CT`, `-7INCH`, `-13INCH`, `/R7`). **Recommendation categorization** (Decision #122): Three categories — Logic Driven (blue), Manufacturer Certified (green), 3rd Party Certified (amber). `deriveRecommendationCategories()` derives from existing fields. Filter chips in RecommendationsPanel, colored category chips on each card. **Sort order** (Decision #127, extended #133, reordered #143): Accuris Certified (parts.io FFF/functional) first, then MFR Certified, then Logic Driven (Mouser-only certified falls into Logic per bucket semantics, Decision #140). Within each group, pin-to-pin (`mfrEquivalenceType='pin_to_pin'`) sorts above functional, then by match score. Preferred MPN floats to top regardless of category. `sortRecommendationsForDisplay()` uses the mutually-exclusive `deriveRecommendationBucket()` so the modal ranking stays aligned with the parts-list bucket count columns. **Certified-cross bypass** (Decision #133): `isCertifiedCross()` (true for `manufacturer` or `partsio_*`) exempts certified candidates from all 13 post-scoring blocking-rule filters (C2, C4–C10, D1–D2, E1, F1–F2) via `withCertifiedBypass()` at the call site, and from `filterRecsByMismatchCount`. An explicit human certification outranks our inferred blocking-rule rejection. **Mismatch-count post-filter** (Decision #109, extended by #159): `isCertifiedCross` / `countRealMismatches` / `filterRecsByMismatchCount` live in [lib/types.ts](lib/types.ts) as pure helpers (client-importable). A "real mismatch" is a `fail` rule where the replacement value is known and disagrees — missing-attribute fails are ignored. Certified crosses bypass; obsolete/discontinued always dropped. **Two paths:** (1) batch/list validation runs `filterRecsByMismatchCount(recs, 1)` server-side in `getRecommendations()` when `filterForBatch: true`; (2) single-part xref panel runs the filter **client-side** in `RecommendationsPanel` at threshold `≤2`, with a "Show all" toggle (`hideHighFails` state, default true) under the filter popover's Quality section + dismissible "Showing high-fail" chip in the filter row. Server-side single-part path returns the full candidate set so the toggle is instant and doesn't require a refetch.

**Columns:** `fc:lifecycle`, `fc:riskRank`, `fc:designRisk`, `fc:productionRisk`, `fc:longTermRisk` (Risk & Lifecycle group). `commercial:bestPrice`, `commercial:totalStock` (Commercial summary, auto-aggregate across all N supplier quotes). Old `mouser:*` columns removed; saved views auto-strip via `sanitizeTemplateColumns()`.

## Replacement Preferences (Decisions #145, #146)

Per-list configuration stored on `parts_lists.replacement_priorities` JSONB column, shape `ReplacementPriorities` in `lib/types.ts`. Editable via List Settings → Replacement Preferences tab (`ReplacementPrioritiesField.tsx`). Two kinds of inputs:

- **Scoring inputs** (affect composite score + cache variant): `order: ReplacementAxis[]` (priority ranking of Lifecycle / Compliance / Cost / Stock), `enabled: Record<ReplacementAxis, boolean>`. Changes trigger `handleRefreshRows`. Composite score computed in `getRecommendations()` via `computeCompositeScore()` (lib/services/compositeScore.ts), stored on `XrefRecommendation.compositeScore`. Used as within-bucket tiebreak: match % floor for Logic within ±2%, composite primary for certified buckets. Stock axis is gated — only active when source `totalStock < 100`.
- **Display filters** (client-side, not cache-varied): `hideZeroStock?: boolean`, `maxReplacements?: 1-5`, `buckets?: RecommendationBucket[]`. Applied in `PartsListTable.tsx` via `pickEffectiveTopRec()` + `recPassesFilters()` + `getAlternateReplacements()`. No refresh triggered on toggle — `handleUpdateListDetails` separates `rankingChanged` from filter-only changes. Legacy `suggestionBuckets` / `maxSuggestions` keys are still accepted on read (pre-Decision-#147) and progressively migrate on next save.

**Three-layer defense for `hideZeroStock`:** (1) render-time swap picks first stocked candidate from persisted `[replacement, ...replacementAlternates]`; (2) post-FC-enrichment promotion effect persists the swap; (3) deep-fetch effect (concurrency 2) handles rows where all persisted top-3 are zero-stock — calls `getRecommendations` + `enrichWithFCBatch(top-30)` because `getRecommendations` returns candidates with empty `supplierQuotes` by design (FC enrichment deferred). `deepFetchAttemptedRef` prevents infinite retry on cohorts with no stocked alternative.

**Persisted alternates cap:** bumped 2 → 4 in `toStoredRows` (both Supabase + localStorage) to support `maxReplacements: 5`. Existing lists progressively migrate on next write.

**Repl. Distributor column (`sys:top_suggestion_supplier`):** reads `supplierQuotes[0].supplier` (pre-sorted by best unit price). Uses `SUPPLIER_DISPLAY` from `AttributesTabContent.tsx`. Column ID preserved pre-rename; header label is "Repl. Distributor".

**Vocabulary (Decision #147):** Parts-list code uses "replacement" throughout. `PartsListRow.replacement` = the top proposed swap (singular); `PartsListRow.replacementAlternates` = positions #2–#5. Storage layer reads legacy `suggestedReplacement` / `topNonFailingRecs` keys for back-compat. Do NOT confuse with `LifecycleInfo.suggestedReplacement` — that's Mouser's manufacturer-published successor MPN on EOL parts, a genuinely different concept.

**Column picker MPN vs SKU:** `dk:mpn` (Product Identity, label "MPN (DK)") surfaces `EnrichedPartData.mpn` — canonical MPN as resolved by source, distinct from user's raw `mapped:mpn`. `dk:digikeyPartNumber` renamed to "DigiKey SKU" and moved to Commercial group — it's a distributor SKU, not part identity.

## Product Direction

The app is evolving from a cross-reference tool into a component intelligence platform built on five pillars:

1. **Technical Matching** (built) — Deterministic rule engine across 43 families
2. **Commercial Intelligence** (planned) — Multi-supplier pricing, availability, lead times
3. **Compliance & Lifecycle** (planned) — EOL tracking, environmental/trade compliance, qualifications
4. **Data Integration** (planned) — Unifying distributor APIs, Atlas (Chinese MFR dataset), customer data, and market feeds
5. **Supply Chain Intelligence** (future) — Geopolitical risk, market monitoring, proactive alerts

### Data Sources

The platform will pull from multiple data sources:
- **Digikey** (built) — Primary source for technical parametric data, pricing, availability
- **Parts.io** (built — Decision #77) — Accuris gap-fill enrichment: 17 class param maps across 39 families, fills datasheet-only specs that Digikey lacks (thyristor tq/dv_dt, relay coil/contact specs, LDO dropout/regulation, fuse I²t, etc.)
- **Atlas** (built — products + param dictionaries + gaia mapping + description extraction + admin panel + coverage analytics + Explorer QC tool; planned — company profiles) — Chinese component manufacturer dataset: 115 manufacturers, 55K products in Supabase `atlas_products`, 38K scorable, 28 L3 family Chinese translation dictionaries + 14 L2 category dictionaries (Decision #102) + 12 family gaia datasheet-extraction dictionaries via shared JSON (`atlas-gaia-dicts.json`, Decision #100). L2 dictionaries map Chinese+English param names to standard L2 attribute IDs for products outside L3 families. `classifyAtlasCategory()` uses c1 guards to prevent cross-domain misclassification (Decision #104) — e.g., laser diodes ≠ rectifiers, RF amplifiers ≠ op-amps, audio connectors ≠ audio devices. Skip list is dictionary-aware (dictionary entries override skip). Gaia mapping handles structured `gaia-{stem}-{Min|Max|Typ}` params with suffix preference and dedup. LLM description extraction (Decision #112): Claude Haiku extracts structured attributes from product descriptions with quote grounding anti-hallucination — `descriptionExtractor.ts` builds family-aware schema prompts from logic tables, parser rejects any extraction whose source substring isn't found in the original description. Batch script `scripts/atlas-extract-descriptions.ts` runs post-ingest automatically. ~12,510 eligible products, +8pp estimated coverage improvement. LLM description cleanup (Decision #114): `scripts/atlas-clean-descriptions.ts` rewrites raw descriptions into standardized one-liners (max 200 chars) stored in `clean_description` column — runs post-ingest after extraction. `atlasClient.ts` uses `clean_description` when available. AEC qualifications (`aec_q200`/`aec_q101`/`aec_q100`) extracted from parameters JSONB into `part.qualifications` for badge display. Overview tab source badge uses `dataSource` instead of hardcoded Digikey (previously on the now-removed Risk & Compliance tab — Decision #134). Admin dictionary panel with Supabase-backed override layer (Decision #68) — supports both L3 families and L2 categories. Coverage % column + per-family gap analysis drawer comparing Atlas vs Digikey vs logic table (Decision #69). Explorer QC tool: search by MPN/manufacturer with coverage % column, detail drawer with L3 or L2 schema comparison (Decision #102). Admin panel: all manufacturers expandable (scorable + non-scorable), sortable columns, breakdown shows Scorable column. Manufacturer enable/disable toggle (Decision #107): admin can disable manufacturers with poor attribute coverage — disabled manufacturers excluded from search, attribute lookup, and recommendation candidates. `atlas_manufacturer_settings` Supabase table, 60s cached filter in `atlasClient.ts`, optimistic toggle UI in AtlasPanel.
- **atlas_manufacturers table**: Canonical manufacturer identity — 1,011 records from master list with atlas_id, slug, name_en, name_zh, name_display (join key), aliases, partsio_id/name, and JSONB profile columns. Import via `scripts/atlas-manufacturers-import.mjs`. Profile enrichment via `scripts/atlas-api-sync-profiles.mjs` (Decision #139) — syncs descriptions, logos, HQ, certifications, contacts, core products from Atlas external API (`https://cn-api.datasheet5.com`). 297 manufacturers enriched. Env var `ATLAS_API_TOKEN`. Admin detail pages at `/admin/manufacturers/[slug]`.
- **Atlas product flagging**: `atlas_product_flags` table for data quality issues. Flag button in search results and manufacturer Products tab. Flagged tab on ManufacturersPanel and per-MFR detail page.
- **Parameter-aware family reclassification** (Decision #175): `reclassifyByParameterSignals(initial, parameters)` in `lib/services/atlasMapper.ts` runs after `classifyAtlasCategory()` and re-routes B1 products with telltale `Type` parameter values that contradict the c3 verdict — `Bi`/`Uni`/`Bidirectional`/`Unidirectional` → B4 TVS, `Regulator`/`Voltage Regulator` → B3 Zener. Mirrored verbatim into `scripts/atlas-ingest.mjs` (the script carries its own classifier copy). Conservative by design: only fires from B1, only on those specific values; other Type values (Standard/Fast/Ultrafast/blank) leave classification untouched. B3 + B4 dictionaries gained `'type'`/`'类型'` entries so reclassified products' Type parameter is recognized at read time (B3 → `_type` deprioritized, B4 → `polarity` for matching). Retroactive script `scripts/atlas-reclassify-by-type-param.mjs` available as a safety net (dry-run by default; idempotent) — though in practice the misclassified products typically sit in pending ingest batches and self-correct on apply rather than needing a DB rewrite. When this rule list grows past ~5 entries, lift to a structured rule table.
- **Atlas re-ingest pipeline** (Decision #174): Drop new `mfr_*_params.json` files via the drag-drop UI at `/admin/atlas/ingest`. Each upload generates a per-MFR `IngestDiffReport` row in `atlas_ingest_batches` (status `pending`, computed `risk` clean/review/attention) — nothing hits `atlas_products` until explicitly approved. Apply via per-batch Proceed or bulk **Proceed All Clean**; revert within 30 days from `atlas_products_snapshots`. JSONB values now carry `{ source: 'atlas' | 'extraction' | 'manual', ingested_at }` so re-ingest preserves LLM-extracted attrs (`mergeAtlasParameters`). Hard-delete only when all attrs are atlas-tagged; otherwise soft-delete (`status='discontinued'`). New-MFR auto-registration step parses filenames before report generation. AI dict triage (`GlobalUnmappedParamsTable`) calls Claude Haiku via `/api/admin/atlas/dictionaries/suggest` with canonical-vs-invented indicators; accepted overrides are consulted at both ingest time (`scripts/atlas-ingest.mjs → loadAndApplyDictOverrides()`) and read time (`fromParametersJsonb` accepts overrides; `atlasClient` prefetches via `fetchAllDictOverrides()`). Every successful proceed/revert clears both `atlas-coverage` AND `manufacturers-list` rows in `admin_stats_cache` so the Atlas MFRs panel refreshes immediately.
- **Dictionary Triage workspace** (Decision #176): Dedicated admin section `?section=atlas-dict-triage` (rendered by `components/admin/AtlasDictTriagePanel.tsx`) for engineers to review unmapped params across all MFRs. **Persistent queue** — aggregates from BOTH pending and applied batches' frozen JSONB reports, filtered by active overrides; rows survive batch apply and only leave when an override resolves them. **MFR provenance** per row (`affectedManufacturers: Array<{slug, name, productCount}>`) so engineers see which manufacturers contributed each unmapped param. **Operator/engineer split (Model 3)**: Atlas Ingest page no longer mounts the editor — it shows a read-only count summary + deep-link to `?section=atlas-dict-triage&batch=<id>` filtered to that batch. Operators get a Proceed-confirm warning when applying batches with unresolved params. The override cross-reference filter (queue route) reads `atlas_dictionary_overrides` via service-role client (NOT cookie-based — RLS would otherwise block the read in some admin endpoints; `requireAdmin()` upstream is the gate). Override compares are case-insensitive (`paramName` is lowercased on insert AND in the filter key). Phase 2 deferred: explicit per-param status tracking in a new `atlas_unmapped_param_queue` table — see BACKLOG.md.
- **FindChips** (built — Decision #131) — Multi-distributor aggregator: single API call returns pricing, stock, lifecycle, risk scores from ~80 distributors (Digikey, Mouser, Arrow, LCSC, Farnell, RS, TME, etc.). Replaces per-distributor Mouser integration. Chinese distributor coverage (LCSC, Winsource) provides purchase paths for Atlas components. Env var `FINDCHIPS_API_KEY`.
- **Mouser** (retained — Decision #83, limited to suggestions) — `SuggestedReplacement` MPNs injected into recommendation pipeline as certified cross-ref candidates. Commercial data now via FindChips. Env var `MOUSER_API_KEY`.
- **Customer Data** (planned) — BOMs, negotiated pricing, AVLs, internal part numbering

Chinese manufacturer options are highlighted with a subtle icon in recommendations (non-promotional, informative only). Rich company profiles for Chinese manufacturers are fed by the Atlas API.

### User Context Model

Context flows at three levels, where more specific overrides more general:

- **User Profile** — Role, industry, compliance defaults, manufacturer preferences (`profiles.preferences` JSONB)
- **List Context** — Per-BOM objectives, constraints, urgency, compliance overrides (`parts_lists.context` JSONB)
- **Per-Search Context** — Family-specific application context questions (existing system, unchanged)

Global preferences produce `AttributeEffect[]` via `contextResolver.ts`, reusing the existing context modifier system. The matching engine itself doesn't change — only the effects applied to logic tables change.

The LLM adapts its conversation style and assessment focus based on user context (appended to system prompt). The UI is the same for all roles.

See `docs/PRODUCT_ROADMAP.md` for the full roadmap and `docs/DECISIONS.md` (#41-45) for architectural decisions.

## Running

```bash
npm run dev     # Start dev server (Turbopack)
npm run build   # Production build
npm run lint    # ESLint
npm test        # Jest unit tests (1051 tests, ~0.8s)
npm run test:watch  # Jest in watch mode
```

Requires `.env.local` with: `ANTHROPIC_API_KEY`, `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `PARTSIO_API_KEY`, `MOUSER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REGISTRATION_CODE`.

Optional: `XREFS_API_KEYS` (comma-separated Bearer tokens for external API access), `SUPABASE_SERVICE_ROLE_KEY` (for MCP server Supabase access).

## External API Access (Decision #80)

The matching engine is accessible to sister products and external systems via two paths:

**REST API** — Existing endpoints (`/api/search`, `/api/attributes/{mpn}`, `/api/xref/{mpn}`) accept `Authorization: Bearer <key>` for machine-to-machine auth. Keys configured in `XREFS_API_KEYS` env var. See `docs/API_INTEGRATION_GUIDE.md` for full documentation.

**MCP Server** — Standalone stdio-transport server for AI agent integration. 5 tools: `search_parts`, `get_part_attributes`, `find_replacements`, `list_supported_families`, `get_context_questions`. Run with `npm run mcp:dev`. Test with `npm run mcp:inspect`. See `mcp-server/` directory.

**Auth architecture:** `requireAuth()` in `lib/supabase/auth-guard.ts` checks API key first, then falls back to Supabase cookie auth. API key users get a fixed service user ID; admin routes remain blocked. `lib/supabase/server.ts` has a try/catch fallback that returns a direct Supabase client when `cookies()` from `next/headers` is unavailable (MCP server, standalone scripts).
