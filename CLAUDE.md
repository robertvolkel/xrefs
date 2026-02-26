# XRefs App

Cross-reference recommendation engine for electronic components. Users enter a part number, the app finds equivalent replacements from Digikey's catalog, and a deterministic rule engine scores each candidate.

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
  api/parts-list/validate/    # Batch validation (streaming NDJSON)
  api/auth/register/          # User registration with invite code
  api/admin/users/            # Admin user management
  api/admin/qc/               # QC log list (GET with filters, sort, pagination)
  api/admin/qc/[logId]/      # QC log detail (GET snapshot)
  api/admin/qc/export/       # QC log export (GET, CSV/JSON download)
  api/admin/qc/analyze/      # QC AI analysis (POST, SSE streaming via Claude)
  api/admin/qc/feedback/     # QC feedback list (GET with status/search/sort)
  api/admin/qc/feedback/[feedbackId]/ # Feedback status update (PATCH)
  api/admin/qc/settings/     # QC settings (GET/PUT logging toggle)
  api/admin/data-sources/    # Data source status (Digikey, Anthropic, Supabase)
  api/admin/taxonomy/        # Digikey category taxonomy with coverage
  api/feedback/              # User feedback submission (POST)
  lists/                      # Lists dashboard page
  parts-list/                 # Parts list editor page
  logic/                      # Admin logic table viewer page
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
    LogicPanel.tsx            # Logic table rules viewer (per-family)
    ParamMappingsPanel.tsx    # Digikey→internal param map + unmapped rules (unified table)
    logicConstants.ts         # Shared typeColors/typeLabels for rule type chips
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
  useViewConfig.ts            # Column view management

lib/
  types.ts                    # All TypeScript interfaces (single source of truth)
  services/                   # Server-side services (see below)
  logicTables/                # Per-family matching rules (see below)
  contextQuestions/            # Per-family application context questions
  supabase/                   # Auth guard, client, server, middleware
  mockData.ts                 # Fallback data (6 MLCCs, 3 resistors, 5 ICs)
  api.ts                      # Client-side API wrapper (includes admin feedback/QC functions)
  services/recommendationLogger.ts # Logs recommendations to Supabase with JSONB snapshots
  services/qcAnalyzer.ts      # Server-side aggregation of QC log snapshots for AI analysis
  columnDefinitions.ts        # Dynamic column system for parts list table
  layoutConstants.ts          # Shared CSS values (heights, font sizes, spacing)

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
5. **Apply context** — If user answered application context questions, `contextModifier.ts` adjusts rule weights/types (e.g., automotive → AEC-Q200 weight becomes 10)
6. **Fetch candidates** — Search Digikey for replacement candidates using critical parameters as keywords
7. **Score candidates** — `matchingEngine.ts` evaluates each candidate against every rule

### Scoring

Each rule has a **weight** (0-10). The matching engine evaluates each rule and produces:
- `matchPercentage = (earnedWeight / totalWeight) * 100`
- A part **fails** if any rule result is `'fail'`
- `application_review` rules get 50% credit (can't be automated)
- `operational` mismatches get 80% credit (non-electrical)

### Rule Types

Defined in `lib/types.ts` as `LogicType`:

| Type | Behavior | Example |
|------|----------|---------|
| `identity` | Exact match required | Capacitance, package/case |
| `identity_range` | Range overlap required (replacement range must intersect source range) | JFET Vp, Idss |
| `identity_upgrade` | Match or superior per hierarchy (best→worst array) | Dielectric: C0G > X7R > X5R |
| `identity_flag` | Boolean gate — if original requires it, replacement must too | AEC-Q200, flexible termination |
| `threshold` | Numeric comparison: `gte`, `lte`, or `range_superset` | Voltage ≥, ESR ≤, temp range ⊇ |
| `fit` | Physical constraint ≤ | Component height |
| `application_review` | Cannot be automated, flagged for human review | DC bias derating |
| `operational` | Non-electrical info | Packaging type |

## Logic Tables & Family Structure

Each component family has a logic table in `lib/logicTables/` defining its matching rules. All 28 families are encoded:

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

**Variant families** (53, 54, 55, 60, 13, 72, B2, B3, B4) are derived from base families using `deltaBuilder.ts` — the classifier in `familyClassifier.ts` detects them from part attributes. B2 (Schottky) is classified from B1 (Rectifier Diodes) when the part description contains 'Schottky', 'SBD', or 'SiC diode'. B3 (Zener) is classified from B1 when the description contains 'Zener', 'voltage reference diode', or MPN starts with 'BZX', 'BZT', 'MMSZ'. B4 (TVS) is classified from B1 when the description contains 'TVS', 'transient voltage', 'ESD protection', or MPN matches TVS prefixes (SMAJ, SMBJ, P6KE, PESD, TPD, ESDA, etc.). B5 (MOSFETs) is a standalone base family — detected by subcategory mapping ('MOSFET', 'FET', 'N-ch', 'P-ch', 'SiC MOSFET', 'GaN FET' keywords). B6 (BJTs) is a standalone base family — detected by subcategory mapping ('BJT', 'Bipolar Transistor', 'NPN', 'PNP' keywords). B7 (IGBTs) is a standalone base family — detected by subcategory mapping ('IGBT', 'Insulated Gate Bipolar Transistor' keywords). B8 (Thyristors) is a standalone base family — detected by subcategory mapping ('SCR', 'TRIAC', 'DIAC', 'Thyristor', 'SIDAC' keywords). Three sub-types (SCR/TRIAC/DIAC) share one logic table; context question Q1 suppresses irrelevant rules per sub-type via `not_applicable` effects. B9 (JFETs) is classified as a variant of B5 (MOSFETs) when detected by description keywords ('JFET', 'J-FET', 'junction field effect', 'depletion mode FET') or MPN prefixes (2N54xx, 2SK, 2SJ, J112, J113, MPF102, BF245, IFxxx). Uses the new `identity_range` LogicType for Vp and Idss range overlap matching.

**Context questions** in `lib/contextQuestions/` provide per-family application context that modifies rule weights at evaluation time.

## The docs/ Folder

Contains 19 `.docx` files — one per base component family — defining the cross-reference logic rules that were encoded into the TypeScript logic tables. These are the authoritative source documents. The `passive_variants_delta.docx` covers the 6 variant families.

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
- **partDataService** tries Digikey first; if unavailable, falls back to mock data

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

Parameter mapping is complete for **all 19 passive + 9 discrete families**: MLCC (12), Chip Resistors (52-55), Tantalum (59), Aluminum Electrolytic (58), Aluminum Polymer (60), Film (64), Supercapacitors (61), Fixed Inductors (71/72), Ferrite Beads (70), Common Mode Chokes (69), Varistors (65), PTC Resettable Fuses (66), NTC Thermistors (67), PTC Thermistors (68), Rectifier Diodes (B1, "Single Diodes" + "Bridge Rectifiers"), Schottky Barrier Diodes (B2, "Schottky Diodes" + "Schottky Diode Arrays" — virtual categories resolved from "Technology" parameter), Zener Diodes (B3, "Single Zener Diodes" + "Zener Diode Arrays" — own Digikey categories, ~51% weight coverage), TVS Diodes (B4, single "TVS Diodes" category, ~61% weight coverage — polarity derived from field name enrichment), MOSFETs (B5, "Single FETs, MOSFETs" category, 14 fields, ~60% weight coverage — verified Feb 2026), BJTs (B6, "Bipolar Transistors" category, 11 fields, ~55% weight coverage — verified Feb 2026), IGBTs (B7, "Single IGBTs" category, 14 fields incl. 2 compound, ~55% weight coverage — verified Feb 2026), Thyristors (B8, "SCRs" + "TRIACs" categories, 8-9 fields per sub-type, 1 compound ("Triac Type"→gate_sensitivity+snubberless), ~48-51% weight coverage — verified Feb 2026), and JFETs (B9, "JFETs" category, 10 fields, ~45% weight coverage — verified Feb 2026). See `docs/DECISIONS.md` (#16-19, #30-40) for Digikey API quirks.

## Running

```bash
npm run dev     # Start dev server (Turbopack)
npm run build   # Production build
npm run lint    # ESLint
npm test        # Jest unit tests (240 tests, ~0.3s)
npm run test:watch  # Jest in watch mode
```

Requires `.env.local` with: `ANTHROPIC_API_KEY`, `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REGISTRATION_CODE`.
