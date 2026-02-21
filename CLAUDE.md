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
  lists/                      # Lists dashboard page
  parts-list/                 # Parts list editor page
  logic/                      # Admin logic table viewer page

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
  api.ts                      # Client-side API wrapper
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
| `identity_upgrade` | Match or superior per hierarchy (best→worst array) | Dielectric: C0G > X7R > X5R |
| `identity_flag` | Boolean gate — if original requires it, replacement must too | AEC-Q200, flexible termination |
| `threshold` | Numeric comparison: `gte`, `lte`, or `range_superset` | Voltage ≥, ESR ≤, temp range ⊇ |
| `fit` | Physical constraint ≤ | Component height |
| `application_review` | Cannot be automated, flagged for human review | DC bias derating |
| `operational` | Non-electrical info | Packaging type |

## Logic Tables & Family Structure

Each component family has a logic table in `lib/logicTables/` defining its matching rules. All 19 families are encoded:

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

**Variant families** (53, 54, 55, 60, 13, 72) are derived from base families using `deltaBuilder.ts` — the classifier in `familyClassifier.ts` detects them from part attributes.

**Context questions** in `lib/contextQuestions/` provide per-family application context that modifies rule weights at evaluation time.

## The docs/ Folder

Contains 14 `.docx` files — one per base component family — defining the cross-reference logic rules that were encoded into the TypeScript logic tables. These are the authoritative source documents. The `passive_variants_delta.docx` covers the 6 variant families.

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

## Digikey Integration

- Client: `lib/services/digikeyClient.ts` — OAuth2 token management, keyword search, product details
- Mapper: `lib/services/digikeyMapper.ts` — Converts Digikey API responses to internal types
- Param Map: `lib/services/digikeyParamMap.ts` — Maps Digikey `ParameterText` strings to internal `attributeId` values
- Discovery script: `scripts/discover-digikey-params.mjs` — For verifying parameter mappings

Parameter mapping is complete for **all 19 families**: MLCC (12), Chip Resistors (52-55), Tantalum (59), Aluminum Electrolytic (58), Aluminum Polymer (60), Film (64), Supercapacitors (61), Fixed Inductors (71/72), Ferrite Beads (70), Common Mode Chokes (69), Varistors (65), PTC Resettable Fuses (66), NTC Thermistors (67), PTC Thermistors (68), and Rectifier Diodes (B1, with separate maps for "Single Diodes" and "Bridge Rectifiers"). See `docs/DECISIONS.md` (#16-19) for Digikey API quirks.

## Running

```bash
npm run dev     # Start dev server (Turbopack)
npm run build   # Production build
npm run lint    # ESLint
npm test        # Jest unit tests (175 tests, ~0.2s)
npm run test:watch  # Jest in watch mode
```

Requires `.env.local` with: `ANTHROPIC_API_KEY`, `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REGISTRATION_CODE`.
