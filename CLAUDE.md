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
  api/auth/register/          # User registration with invite code
  api/admin/users/            # Admin user management (role changes owner-only)
  api/admin/qc/               # QC log list (GET with filters, sort, pagination)
  api/admin/qc/[logId]/      # QC log detail (GET snapshot)
  api/admin/qc/export/       # QC log export (GET, CSV/JSON download)
  api/admin/qc/analyze/      # QC AI analysis (POST, SSE streaming via Claude)
  api/admin/qc/feedback/     # QC feedback list (GET with status/search/sort)
  api/admin/qc/feedback/[feedbackId]/ # Feedback status update (PATCH)
  api/admin/qc/settings/     # QC settings (GET/PUT logging toggle)
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
  api/feedback/              # User feedback submission (POST)
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
    PartsListActionBar.tsx    # Selection count, refresh/delete buttons, search field
  lists/                      # Lists dashboard components
  admin/                      # Admin panel components
    AdminShell.tsx            # Admin orchestrator — section selection, family picker state
    AdminSectionNav.tsx       # Left nav for admin sections
    FamilyPicker.tsx          # Shared category/family dropdown (used by 3 sections)
    QcFeedbackTab.tsx         # Feedback list — status filters, search, sort, click-to-detail
    QcFeedbackDetailView.tsx  # Feedback detail — comparison table reconstruction from snapshot
    QcLogsTab.tsx             # Log list + detail (existing log review functionality)
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
  useManufacturerProfile.ts   # MFR panel + chat collapse state
  useNewListWorkflow.ts       # File upload dialog flow
  usePartsListState.ts        # Parts list file upload, parsing, validation
  usePartsListAutoLoad.ts     # Auto-load from URL/pending file, redirect, default view
  useRowSelection.ts          # Multi-select rows, toggle, refresh selected
  useRowDeletion.ts           # Two-step delete confirmation (permanent vs. hide)
  useColumnCatalog.ts         # Header inference, column building, mapping fallback
  useModalChat.ts             # Refinement chat state
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
  services/atlasMapper.ts     # Atlas JSON → internal ParametricAttribute[] conversion (28 L3 family + 14 L2 category dictionaries)
  services/atlasGaiaDictionaries.ts # Gaia datasheet-extracted param mapping (parse, skip stems, dict exports)
  services/atlas-gaia-dicts.json # Shared gaia dictionaries (12 families + shared, consumed by TS + MJS)
  services/atlasDictOverrides.ts # Server-only Supabase fetch/cache for dictionary overrides
  services/mouserClient.ts    # Mouser API client — search, batch, cache, rate limiter
  services/mouserMapper.ts    # Mouser response → SupplierQuote/LifecycleInfo/ComplianceData
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
scripts/                      # Utility scripts (Digikey param discovery, Supabase schema)
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
5. **Apply admin overrides** — `overrideMerger.ts` fetches active DB overrides and merges onto the TS base (remove→override→add pattern)
6. **Apply context** — If user answered application context questions, `contextModifier.ts` adjusts rule weights/types (e.g., automotive → AEC-Q200 weight becomes 10). Context questions are also subject to admin overrides.
6. **Fetch candidates** — Search Digikey for replacement candidates using critical parameters as keywords
7. **Score candidates** — `matchingEngine.ts` evaluates each candidate against every rule

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
| `identity` | Exact match required (supports optional `tolerancePercent` band) | Capacitance, package/case, fsw ±10% |
| `identity_range` | Range overlap required (replacement range must intersect source range) | JFET Vp, Idss |
| `identity_upgrade` | Match or superior per hierarchy (best→worst array) | Dielectric: C0G > X7R > X5R |
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
- **Multi-source search** (Decision #106): `searchParts()` queries Digikey + Atlas + Parts.io + Mouser in parallel. `looksLikeMpn()` heuristic routes MPN-like queries to all 4 sources; descriptions only hit Digikey + Atlas. Priority dedup: Digikey wins, non-Digikey results only for parts not in Digikey. Result cap 50. `PartSummary.dataSource` tags origin. Batch validation skips Mouser (`skipMouser: true`).
- **partDataService** tries Digikey first; if unavailable, falls back to Atlas → parts.io → null. After Digikey, enriches with parts.io gap-fill AND Mouser commercial data **in parallel** via `enrichSourceInParallel()` (Digikey values win on conflicts). When parts.io is the primary source (no Digikey/Atlas match), `disambiguatePartsioSubcategory()` refines broad Class names (e.g., "Capacitors") into specific families using description keywords and parametric hints. Batch validation has an additional fallback: if `searchParts()` returns 'none', tries `getAttributes()` directly (exact MPN lookup) before marking "not-found" (Decision #108).
- **Persistent L2 cache** (Decision #99): `part_data_cache` Supabase table sits between in-memory L1 caches (30-min TTL) and live API calls. Three-tier TTL: parametric (indefinite Digikey / 90-day parts.io), lifecycle (6 months), commercial (24 hours). Cross-user, survives cold starts. Digikey keyword search results warm the cache via `warmCacheFromSearchResults()`. Mouser L2 hits bypass rate limiter. Not-found results cached 24h. All writes fire-and-forget. Admin: `GET/DELETE /api/admin/cache`, cache stats in data-sources endpoint.
- **Recommendation pipeline performance** (Decision #98): UI passes pre-fetched `sourceAttributes` to `/api/xref` POST to skip duplicate `getAttributes()` call. LLM assessment and Mouser candidate enrichment are deferred — recs display immediately, assessment streams into chat afterward, Mouser pricing merges in via background `enrichWithMouserBatch()`. QC logging is fire-and-forget. See `showRecsAndDeferAssessment()` in `useAppState.ts`.
- **Per-list views** (Decision #81): Views stored per-list in Supabase `parts_lists.view_configs` JSONB. Global views are templates (`useViewTemplates` in localStorage) used to seed new lists. `useListViewConfig` hook manages per-list views with 500ms debounced Supabase persistence. "Save as Template" strips `ss:*` columns via `sanitizeTemplateColumns()`. Lists with null `view_configs` auto-migrate from templates on first load.
- **Column portability**: Templates may only contain portable column IDs (`sys:*`, `mapped:*`, `dk:*`, `dkp:*`). `ss:*` (raw spreadsheet index) columns are list-specific and stripped by `sanitizeTemplateColumns()` before saving to template library.
- **mapped:cpn**: Optional Customer Part Number / Internal Part Number column. Auto-detected from headers in `excelParser.ts`. `cpnColumn` on `ColumnMapping`, `rawCpn` on `PartsListRow`. Resolved at render time like `mapped:manufacturer`.

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
- **v4 API pricing gotcha**: `StandardPricing` (tiered price breaks) is nested under `ProductVariations[0].StandardPricing`, NOT at the top level of the product response. `mapDigikeyPriceBreaks()` checks both locations. Commercial cache preserves `ProductVariations` alongside `UnitPrice`/`QuantityAvailable`/`ProductStatus` (Decision #109).

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

## Mouser Integration (Commercial Intelligence — Decision #83)

First multi-supplier pricing source. Provides zero parametric data — purely commercial intelligence (Pillar 2) and compliance/trade data (Pillar 3).

- **Client:** `lib/services/mouserClient.ts` — API key auth (query param), batch up to 10 pipe-separated MPNs, 30-min cache, rate limiter (28/min, 950/day soft caps)
- **Mapper:** `lib/services/mouserMapper.ts` — Price parsing, HTS code mapping (8 regions), lifecycle extraction, Digikey quote normalization
- **API:** `https://api.mouser.com/api/v1/search/partnumber`. Env var `MOUSER_API_KEY`. Rate limits: 30/min, 1,000/day.

**N-supplier data model:** `SupplierQuote[]`, `LifecycleInfo[]`, `ComplianceData[]` on `Part` and `EnrichedPartData`. Designed for N suppliers (Digikey, Mouser, Arrow, Nexar). Existing flat fields (`unitPrice`, `quantityAvailable`) preserved for backward compatibility.

**Pipeline integration:** Source part enriched after parts.io in `getAttributes()`. Recommendation candidates enriched in batch after scoring in `getRecommendations()`. On-demand enrichment via `/api/mouser/enrich` for modal/comparison views.

**Rate limit strategy:** Source parts only during batch BOM validation (200 parts ÷ 10/batch = 20 calls = 2% daily quota). Candidates enriched only for scored recommendations (~1 batch call). `hasMouserBudget()` check on every call — graceful skip when daily limit hit.

**Unique data:** `SuggestedReplacement` (Mouser's human-verified replacement MPN — provided for both obsolete AND active parts, injected into scoring pipeline as candidates via Decision #97), regional HTS codes (US, CN, CA, JP, KR, EU/TARIC, MX, BR), ECCN.

**Certified Cross-References (Decision #97):** External replacement suggestions from Mouser (`SuggestedReplacement`) and parts.io (FFF/Functional Equivalents) are unified under a `certifiedBy?: CertificationSource[]` field on `XrefRecommendation`. `CertificationSource = 'partsio_fff' | 'partsio_functional' | 'mouser'`. Mouser suggestions are resolved from Mouser part number format (`resolveMouserSuggestedMpn()` strips numeric prefix), fetched as full parametric candidates, and scored alongside all other candidates. Dedup merges provenance — same MPN from multiple sources shows one card with "Certified (N)" badge. Purple chip for single source, amber for multi-source. Extensible for future `sponsored_${vendor}` sources.

**Columns:** 11 new columns in column system (`mouser:unitPrice`, `mouser:stock`, `mouser:leadTime`, `commercial:bestPrice`, `commercial:totalStock`, `mouser:lifecycle`, `mouser:suggestedReplacement`, `mouser:htsUS/CN/EU`, `mouser:eccn`). Available in column picker, not in default view.

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
- **Atlas** (built — products + param dictionaries + gaia mapping + admin panel + coverage analytics + Explorer QC tool; planned — company profiles) — Chinese component manufacturer dataset: 115 manufacturers, 55K products in Supabase `atlas_products`, 38K scorable, 28 L3 family Chinese translation dictionaries + 14 L2 category dictionaries (Decision #102) + 12 family gaia datasheet-extraction dictionaries via shared JSON (`atlas-gaia-dicts.json`, Decision #100). L2 dictionaries map Chinese+English param names to standard L2 attribute IDs for products outside L3 families. `classifyAtlasCategory()` uses c1 guards to prevent cross-domain misclassification (Decision #104) — e.g., laser diodes ≠ rectifiers, RF amplifiers ≠ op-amps, audio connectors ≠ audio devices. Skip list is dictionary-aware (dictionary entries override skip). Gaia mapping handles structured `gaia-{stem}-{Min|Max|Typ}` params with suffix preference and dedup. Admin dictionary panel with Supabase-backed override layer (Decision #68) — supports both L3 families and L2 categories. Coverage % column + per-family gap analysis drawer comparing Atlas vs Digikey vs logic table (Decision #69). Explorer QC tool: search by MPN/manufacturer with coverage % column, detail drawer with L3 or L2 schema comparison (Decision #102). Admin panel: all manufacturers expandable (scorable + non-scorable), sortable columns, breakdown shows Scorable column. Manufacturer enable/disable toggle (Decision #107): admin can disable manufacturers with poor attribute coverage — disabled manufacturers excluded from search, attribute lookup, and recommendation candidates. `atlas_manufacturer_settings` Supabase table, 60s cached filter in `atlasClient.ts`, optimistic toggle UI in AtlasPanel.
- **Mouser** (built — Decision #83) — First multi-supplier pricing source: quantity-based price breaks, real-time stock, lead times, lifecycle status, suggested replacements, regional HTS codes (8 regions), ECCN. No parametric data. Rate limits: 30/min, 1,000/day.
- **Distributor APIs** (planned) — Arrow, Nexar/Octopart for additional multi-supplier pricing
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
