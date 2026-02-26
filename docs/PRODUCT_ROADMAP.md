# Product Roadmap — From Cross-Reference Engine to Component Intelligence Platform

> Last updated: Feb 2026

---

## 1. Product Vision

### Current State

XRefs is a cross-reference recommendation engine. A user enters a part number, the system finds the original part's parametric data, fetches candidate replacements from Digikey, and a deterministic rule engine scores each candidate on technical equivalence. Twenty-eight component families are supported, each with curated matching rules derived from engineering specification documents.

This is valuable — and it's our starting point — but it's not the destination.

### Where We're Going

XRefs is becoming a **component intelligence platform** — an AI-powered partner for anyone in the electronics industry who needs to make better component decisions.

Choosing a component is never just about electrical specifications. The right choice depends on who's asking, what they're building, where it's being manufactured, and what constraints they're operating under. A hardware engineer redesigning a power supply needs to know if a MOSFET is a drop-in replacement. A procurement manager managing a BOM for an automotive program needs to know if that same MOSFET meets AEC-Q101, is available from approved suppliers, has a stable supply chain, and won't be obsoleted next year. An executive wants to know the total cost impact of switching suppliers for an entire commodity class.

The platform serves all of these users — not by giving them different tools, but by understanding their context and adapting what it prioritizes.

### The Five Pillars

**1. Technical Matching** (MVP — built today)
The foundation. Deterministic rule evaluation across 28+ component families ensures replacement candidates are electrically and physically compatible. Application context questions adjust rule weights based on how the part will be used. This pillar is the differentiator — no one else has this depth of automated technical cross-referencing.

**2. Commercial Intelligence** (next)
Pricing and availability across multiple distributors. Lead times. Price trends over time. Volume pricing tiers. Supplier diversity scoring. The goal is to answer not just "does this part work?" but "can I actually get it, at what cost, and is that cost stable?"

**3. Compliance & Lifecycle Awareness** (next)
Component lifecycle status (active, NRND, obsolete, last-time-buy). Environmental and trade compliance (RoHS, REACH, conflict minerals, ITAR, dual-use). Industry qualifications (AEC-Q200/Q101 for automotive, MIL-STD for defense, IEC 60601 for medical). The goal is to proactively flag risk — before the user discovers it on their own.

**4. Data Integration** (ongoing)
The platform must be the place where a customer's data worlds converge. This means pulling from multiple data sources — distributor APIs (Digikey, Mouser, Arrow), our proprietary **Atlas** dataset of Chinese component manufacturers (products, company profiles, sponsored replacements), customer-owned data (their products, negotiated pricing, approved vendor lists, BOMs), and market intelligence feeds. No single data source has the complete picture; the platform unifies them so the user doesn't have to.

**5. Supply Chain & Market Intelligence** (future)
Geopolitical exposure (manufacturing and sourcing regions). Supplier concentration risk. Market trend analysis. Proactive monitoring and alerts — "this part you're using on 12 BOMs is moving to NRND, here are pre-vetted alternatives." The goal is to make the platform a continuous advisor, not just a reactive tool.

### Chinese Component Strategy

A key differentiator of the platform is its deep knowledge of the Chinese component manufacturer ecosystem via the **Atlas** dataset. Chinese manufacturers often offer cost-effective alternatives with comparable specifications, and the electronics industry's interest in these options is growing rapidly.

The platform's approach is **informative, not pushy**:
- When recommendations are presented, Chinese manufacturer options are marked with a subtle icon so users can identify them at a glance
- Each Chinese manufacturer has a rich company profile (fed by the Atlas API) with verification status, factory audit information, export compliance, and certifications
- The platform never forces Chinese options or ranks them artificially higher — it surfaces them as options and lets the user's context (cost reduction objective, region constraints, compliance requirements) determine relevance
- In the future, manufacturers may pay for sponsored cross-reference placements, but these will always be clearly labeled as such

### The "Partner" Principle

The platform knows:
- **Who you are** — your role, your expertise level, what you care about
- **What you're building** — the industry, the application, the compliance requirements
- **What you need right now** — cost savings, second-source qualification, EOL migration, new design
- **Where your products are manufactured** — which affects trade compliance, supplier options, logistics

It adapts its behavior based on this context. The same search for "GRM188R71H104KA93" surfaces different insights for a design engineer (DC bias derating, dielectric aging, temperature coefficient) versus a buyer (price per unit across 5 distributors, lead time trends, alternative manufacturers with lower MOQ). The UI stays the same for everyone — the AI adapts what it emphasizes.

---

## 2. User Context Model

Context flows through the platform at three levels, forming a hierarchy where more specific context overrides more general context.

### Layer 1: User Profile (set once, evolves over time)

Collected gradually — not all at registration. The profile page lets users fill in details as they see value.

**At registration (minimal — don't gate the experience):**
- Name, email, password (existing)
- Job role (optional dropdown): Design Engineer, Procurement/Buyer, Supply Chain, Commodity Manager, Quality, Executive, Other
- Industry (optional dropdown): Automotive, Aerospace/Defense, Medical, Industrial, Consumer Electronics, Telecom/Networking, Energy, Other

**In the profile (filled in over time):**
- Company name
- Manufacturing regions (multi-select): where their products are built
- Compliance defaults: which regulations always apply to their work
  - Automotive grade (AEC-Q200/Q101)
  - Military grade (MIL-STD)
  - RoHS / REACH / Halogen-free
- Manufacturer preferences: preferred and excluded manufacturers
- Expertise level (affects AI communication style): Engineer, Procurement, General

**How it's used:**
- The LLM adapts its conversation style, question priorities, and assessment focus based on role and expertise
- Compliance defaults automatically escalate relevant matching rules across all families (e.g., "always require AEC-Q200" sets that rule to mandatory weight for every passive search)
- Manufacturer preferences filter and rank candidates
- Manufacturing regions inform future trade/compliance checks

**UX principle:** The AI should infer from conversation and gently prompt to complete the profile when it notices gaps. "I see you're working on automotive parts — would you like me to always prioritize AEC-Q200 qualified components? You can set this in your profile."

### Layer 2: List / BOM Context (set per parts list)

Each parts list can carry structured metadata that affects all recommendations within it.

**Fields:**
- Objective (select): What's the purpose of this list?
  - Cross-reference (find replacements) — default
  - Cost reduction (find cheaper alternatives)
  - Second-source (qualify additional suppliers)
  - EOL migration (replace end-of-life parts)
  - Redesign (find better parts for a new revision)
  - Qualification (validate parts for a specific standard)
- Objective notes (free text): additional context the AI can interpret
  - e.g., "Find cost saving opportunities from Asia suppliers outside of China for this commodity class"
  - e.g., "Customer requires full traceability to non-conflict mineral sources"
- Urgency: Standard, Urgent, Critical
- Compliance overrides: can tighten or relax user-level defaults for this specific list
- Region constraints: limit candidate sourcing to specific regions
- Budget constraints: max price multiplier, target savings percentage

**How it's used:**
- The LLM sees list context in its system prompt and adapts its assessment accordingly
- Objectives like "cost reduction" cause the matching engine to boost lower-cost candidates (future: when multi-supplier pricing is available)
- Compliance overrides layer on top of user defaults — a user who normally requires automotive grade can relax it for a consumer product list
- Budget constraints feed into candidate filtering and ranking

**UX principle:** Show a "List Settings" option when creating or editing a list. Most fields are optional. The free-text objective notes field is the most powerful — the AI can interpret natural language constraints.

### Layer 3: Per-Search Context (existing system — unchanged)

Family-specific context questions that modify rule weights at evaluation time. This is the most granular level and already works well.

**Examples:**
- MLCC: "What is the applied voltage relative to the rated voltage?" → adjusts DC bias derating review weight
- MOSFET: "Is this a high-frequency switching application?" → escalates switching parameters
- Thyristor: "Is a snubber circuit present?" → makes snubberless and dV/dt blocking requirements

**No changes needed** to this layer. It's the most mature part of the context system.

### Override Hierarchy

```
User Profile (broadest defaults)
  ↓ overridden by
List Context (per-BOM specifics)
  ↓ overridden by
Per-Search Context (family-specific, most granular)
```

Example: User sets "require automotive grade" in profile. A specific parts list overrides this to "not required" (consumer product). But a specific search within that list, for a safety-critical MOSFET, gets a per-family context answer of "automotive application" which re-escalates AEC-Q101 to mandatory.

---

## 3. Architecture Plan

### 3.1 Data Model

**User preferences** — stored as a `preferences` JSONB column on the existing `profiles` table.

Rationale: preferences are read-whole, written-whole, change infrequently, and are small (< 5 KB per user). JSONB avoids join complexity and additional RLS policies. If we later need to query across users by preference (e.g., "all automotive users"), a GIN index suffices.

```
profiles table (existing)
  + preferences JSONB DEFAULT '{}'
```

TypeScript type: `UserPreferences` in `lib/types.ts`.

**List context** — stored as a `context` JSONB column on the existing `parts_lists` table.

```
parts_lists table (existing)
  + context JSONB DEFAULT '{}'
```

TypeScript type: `ListContext` in `lib/types.ts`.

### 3.2 Context Resolution

A new `lib/services/contextResolver.ts` service resolves the three-level hierarchy into a flat set of `AttributeEffect[]` — the same type the existing `contextModifier.ts` already consumes. This means **the matching engine doesn't change at all**. Global context just produces additional effects that modify the logic table before evaluation.

```
User preferences  ──┐
                     ├──→ contextResolver.resolveGlobalEffects()
List context     ──┘        ↓
                      AttributeEffect[]
                            ↓
Per-family answers ──→ contextModifier.applyContextToLogicTable()
                            ↓
                      Modified logic table → matching engine (unchanged)
```

Global effects are applied first, then per-family context effects overwrite them. This ensures the most specific context always wins.

### 3.3 LLM Context Injection

The LLM system prompt in `llmOrchestrator.ts` gets a dynamic section appended based on user/list context. The prompt injection is lightweight — just key-value facts, not verbose instructions.

```
## User Context
- Role: Procurement Manager
- Industry: Automotive
- Compliance: AEC-Q200/Q101 required by default
- Preferred manufacturers: TDK, Murata, Samsung

## Active List Context
- Objective: Cost reduction
- Notes: "Find alternatives from non-China Asian suppliers"
- Urgency: Standard
```

The LLM adapts its behavior naturally based on these signals — emphasizing pricing for procurement roles, highlighting compliance for automotive users, interpreting objective notes in its assessments.

### 3.4 API Changes

New endpoints:
- `GET/PUT /api/profile/preferences` — read/write user preferences
- `GET/PUT /api/parts-list/[listId]/context` — read/write list context

Modified endpoints (thread context through):
- `/api/chat` — fetch user preferences, pass to orchestrator
- `/api/modal-chat` — fetch user preferences, pass to refinement chat
- `/api/xref/[mpn]` — fetch user preferences, pass to `getRecommendations()`
- `/api/parts-list/validate` — fetch user preferences + list context, pass to each validation item

### 3.5 Data Source Architecture

The platform will eventually pull from multiple data sources, each serving a different purpose:

**Distributor APIs** (Digikey today; Mouser, Arrow, Nexar/Octopart future)
- Technical parametric data (attributes, specifications)
- Real-time pricing and availability per distributor
- Lifecycle status (active, NRND, EOL)
- Currently Digikey is hardwired at three levels: HTTP client (`digikeyClient.ts`), response mapper (`digikeyMapper.ts`), and parameter map (`digikeyParamMap.ts`)

**Atlas API** (proprietary — Chinese component manufacturer dataset)
- Chinese manufacturer product catalog (parts, specifications, datasheets)
- Company profiles (verification status, factory audits, certifications, export compliance, manufacturing capabilities)
- Sponsored cross-reference mappings (future monetization)
- This is a first-party dataset that we control and curate

**Customer Data** (per-organization)
- Their product BOMs and design histories
- Negotiated pricing with specific distributors
- Approved vendor lists (AVLs) and qualification records
- Internal part numbering and cross-reference tables

**Aggregator/Enrichment APIs** (Octopart/Nexar, SiliconExpert, Z2Data)
- Multi-supplier pricing comparison (without integrating each distributor directly)
- Lifecycle and PCN (product change notification) data
- Compliance databases (RoHS, REACH, conflict minerals)

**Unification strategy:** Each data source feeds into the existing `Part` / `PartAttributes` types through a `DataSourceProvider` interface. The matching engine consumes the unified types and doesn't know or care where the data came from. A `dataSource` field on every record tracks provenance.

```
Digikey API  ──┐
Atlas API    ──┤
Customer DB  ──┼──→ DataSourceProvider interface ──→ Part / PartAttributes ──→ Matching Engine
Nexar API    ──┤
SiliconExpert──┘
```

**Near-term approach:** Rather than abstracting Digikey immediately (high effort — 3 tightly-coupled files, 28+ category-specific param maps), add Atlas and Nexar as enrichment layers that decorate results with additional data. Digikey remains the primary source for technical parametric data.

### 3.6 Manufacturer Profiles (API-Fed)

The existing `ManufacturerProfile` type (`lib/types.ts`) and `ManufacturerProfilePanel.tsx` already support rich company profiles with headquarters, country, certifications, manufacturing locations, authorized distributors, and compliance flags. Currently, profiles are static mock data (`lib/mockManufacturerData.ts`, 11 profiles).

**Evolution path:**
1. **Near-term:** Add a `manufacturerCountry` field to `Part` (or resolve it via a manufacturer→country lookup) so Chinese manufacturers can be identified without loading a full profile. Display a small icon/badge in `RecommendationCard` and `PartsListTable` for Chinese-origin manufacturers.
2. **Mid-term:** Replace static mock profiles with API-fed profiles from Atlas. Extend `ManufacturerProfile` with Chinese-manufacturer-specific fields:
   - `verificationStatus`: verified / pending / unverified
   - `factoryAuditDate`: last factory audit
   - `exportCompliance`: export license status, restricted party screening
   - `manufacturingCapabilities`: process technologies, certifications held
   - `sponsoredCrosses`: sponsored cross-reference mappings (future)
3. **Long-term:** Profile data from multiple sources (Atlas for Chinese MFRs, Digikey/distributor data for established brands, customer-provided data for preferred vendors) merged into a single unified profile view.

### 3.7 Market Monitoring (Future Vision)

The platform will eventually support:
- **Watchlists**: Users tag parts or BOMs for monitoring
- **Event detection**: Lifecycle status changes (NRND, EOL), significant price changes, availability drops, new compliance requirements
- **Proactive alerts**: Email/in-app notifications with pre-computed alternatives
- **Dashboard**: Portfolio-level risk view showing aggregate exposure by manufacturer, region, lifecycle status

This requires a background job system (not part of the current Next.js architecture) and a persistent data store for part history. Architecturally, this is a separate service that reads from the same data sources but runs on a schedule rather than on-demand.

---

## 4. Phased Implementation Roadmap

### Phase 1: User Preferences Foundation
**Goal:** Store and edit user preferences. No downstream effects yet.

- Add `preferences` JSONB column to `profiles` table
- Define `UserPreferences` type in `lib/types.ts`
- Build `GET/PUT /api/profile/preferences` API endpoints
- Build the Profile panel UI (replace "Coming Soon" placeholder)
- Add optional role + industry dropdowns to registration form

**Files:** `scripts/supabase-schema.sql`, `lib/types.ts`, `app/api/profile/preferences/route.ts`, `lib/api.ts`, `components/settings/ProfilePanel.tsx`, `app/api/auth/register/route.ts`, registration form component

### Phase 2: LLM Context Injection
**Goal:** The AI adapts its conversation based on who's talking and what they're working on.

- Modify `llmOrchestrator.chat()` and `refinementChat()` to accept user context
- Build dynamic system prompt section from user preferences
- Thread preferences through `/api/chat` and `/api/modal-chat` routes

**Files:** `lib/services/llmOrchestrator.ts`, `app/api/chat/route.ts`, `app/api/modal-chat/route.ts`

### Phase 3: Global Effects on Matching Engine
**Goal:** User compliance defaults and manufacturer preferences affect recommendation scores.

- Create `lib/services/contextResolver.ts` — resolves global effects from preferences
- Extract `applyEffect()` from `contextModifier.ts` for reuse
- Thread global context through `partDataService.getRecommendations()`
- Thread through `/api/xref/[mpn]` and `/api/parts-list/validate` routes

**Files:** `lib/services/contextResolver.ts` (new), `lib/services/contextModifier.ts`, `lib/services/partDataService.ts`, `app/api/xref/[mpn]/route.ts`, `app/api/parts-list/validate/route.ts`

### Phase 4: List-Level Context
**Goal:** Each parts list carries objectives and constraints that affect all recommendations within it.

- Add `context` JSONB column to `parts_lists` table
- Define `ListContext` type in `lib/types.ts`
- Build `GET/PUT /api/parts-list/[listId]/context` API endpoints
- Build list context dialog/drawer in the parts list UI
- Merge list context with user preferences in `contextResolver`
- Thread list context through batch validation

**Files:** `scripts/supabase-schema.sql`, `lib/types.ts`, `app/api/parts-list/[listId]/context/route.ts`, `lib/api.ts`, parts list UI components, `hooks/usePartsListState.ts`, `lib/services/contextResolver.ts`

### Phase 5: Manufacturer Filtering & Candidate Ranking
**Goal:** Preferred/excluded manufacturers affect which candidates appear and how they're ranked.

- Apply manufacturer filters to `fetchDigikeyCandidates()` results
- Optionally boost match scores for preferred manufacturers (small weight bonus)
- Show manufacturer preference indicators in the recommendations UI

**Files:** `lib/services/partDataService.ts`, `lib/services/matchingEngine.ts`, recommendation UI components

### Phase 6: Chinese Manufacturer Highlighting
**Goal:** Chinese manufacturer options are visually identifiable in recommendations without being pushy.

- Add manufacturer→country resolution (lookup from `ManufacturerProfile` data or a lightweight country map)
- Display a small icon/badge next to manufacturer name in `RecommendationCard` when the manufacturer is Chinese
- Same icon in `PartsListTable` `sys:top_suggestion_mfr` column and sub-rows
- Non-intrusive: icon only, no ranking changes, no special section — just a visual indicator
- Tooltip on hover: "Chinese manufacturer — view company profile for details"

**Files:** `components/RecommendationCard.tsx`, `components/parts-list/PartsListTable.tsx`, `lib/mockManufacturerData.ts` (add country lookup utility), possibly a small `lib/manufacturerCountryMap.ts` for lightweight resolution without loading full profiles

### Phase 7: Atlas Integration & Manufacturer Profile API
**Goal:** Replace static manufacturer profiles with API-fed data from Atlas. Chinese manufacturers get rich, verified profiles.

- Build Atlas API client (`lib/services/atlasClient.ts`) — authentication, product search, company profiles
- Build Atlas mapper (`lib/services/atlasMapper.ts`) — convert Atlas types to internal `Part` / `ManufacturerProfile` types
- Extend `ManufacturerProfile` type with Chinese-manufacturer-specific fields (verification status, factory audit, export compliance, manufacturing capabilities)
- Replace static `mockManufacturerData.ts` with API-fed lookups (keep mock as fallback)
- Integrate Atlas product data as a candidate source alongside Digikey (Atlas products appear in recommendations when relevant)
- Update `ManufacturerProfilePanel.tsx` to show extended fields for verified Chinese manufacturers
- Update `DataSourcesPanel.tsx` in admin to show Atlas integration status

**Files:** `lib/services/atlasClient.ts` (new), `lib/services/atlasMapper.ts` (new), `lib/types.ts`, `lib/mockManufacturerData.ts`, `components/ManufacturerProfilePanel.tsx`, `components/admin/DataSourcesPanel.tsx`

### Phase 8: Commercial Data Enrichment (Multi-Supplier)
**Goal:** Multi-supplier pricing and availability from distributor APIs and aggregators.

- Evaluate and integrate Octopart/Nexar API as a pricing enrichment layer
- Extend `Part` type with `supplierPricing: SupplierPrice[]`
- Build pricing comparison UI (in recommendations panel and parts list table)
- Add lifecycle status tracking (integrate PCN/EOL data)
- Customer negotiated pricing overlays (when customer data is available)

**Files:** New supplier integration service, `lib/types.ts`, UI components

### Phase 9: Customer Data Integration
**Goal:** Customers can bring their own data into the platform — BOMs, negotiated pricing, AVLs.

- Customer data import (CSV/Excel upload for BOMs, pricing files, AVLs)
- Customer-specific part numbering and internal cross-reference tables
- Negotiated pricing overlays on recommendations (show "your price" vs. list price)
- Approved vendor list filtering (restrict recommendations to AVL-approved manufacturers)
- Per-organization data isolation (RLS on Supabase, org-scoped queries)

**Files:** New import services, Supabase schema for org-scoped data, `lib/types.ts`, parts list UI

### Phase 10: Market Monitoring & Proactive Alerts
**Goal:** The platform becomes a continuous advisor.

- Build watchlist/monitoring data model
- Background job system for periodic part status checks
- Event detection and alerting pipeline
- Portfolio risk dashboard
- Email/in-app notification system

**Files:** New services, new UI pages, likely a separate backend job runner

### Future: Sponsored Cross-References
**Goal:** Monetization layer where manufacturers can pay for cross-reference placement.

- Atlas-sourced sponsored crosses appear in recommendations with clear "Sponsored" labeling
- Sponsored results never affect match scores — they appear in a distinct section or with a badge
- Analytics dashboard for sponsors (impressions, clicks, conversions)
- This is a business model decision, not a technical one — implementation is straightforward once Atlas integration exists

---

## 5. Key Architectural Decisions

These are recorded formally in `docs/DECISIONS.md` as decisions #41-45.

1. **JSONB over normalized tables for preferences** — User preferences are read-whole, written-whole, and change infrequently. JSONB avoids join complexity.

2. **Three-level context hierarchy (User → List → Search)** — More specific context overrides more general context. This mirrors how real decisions work: company policies are defaults, project requirements override them, and specific part decisions are the most granular.

3. **Same UI for all roles, AI adapts behavior** — Different roles get different AI emphasis (procurement sees pricing focus, engineers see parametric depth), but the interface itself is the same. This avoids maintaining multiple UIs and lets users discover capabilities they didn't expect to need.

4. **Global effects reuse existing `AttributeEffect` system** — Rather than inventing a new mechanism, global preferences produce the same effect objects that per-family context already uses. The matching engine needs zero changes.

5. **Multi-supplier abstraction deferred** — The effort to abstract Digikey is high (3 tightly-coupled files, 28+ category-specific param maps). Better to add Atlas and Nexar as enrichment layers first, keeping Digikey as the primary technical data source.

6. **Chinese manufacturer highlighting is informative, not promotional** — Chinese options get a subtle icon for identification, not a ranking boost or special section. Sponsored placements (future) will always be clearly labeled. The platform earns trust by being objective.

7. **Atlas is a first-party data source, not a third-party integration** — Unlike Digikey or Nexar, Atlas is our own dataset. This means we control the schema, the update cadence, and the data quality. It feeds both product data (parts as candidates) and company profiles (manufacturer intelligence).
