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

### Per-row visibility of atlas_ai_context_flags on Triage queue (May 19, 2026)

A "flag" in this system = `atlas_ai_context_flags` row inserted when Sonnet's /suggest output sets `needsDomainCard: true`. The aggregate count drives the Domain Cards Health chip — but there's **no per-row visual on the Triage page** showing which paramNames triggered flags or what Sonnet's `gap_description` said.

Engineers can't:
- See which specific Triage row was flagged by Sonnet
- Read the AI's one-line gap explanation ("could not distinguish input-side vs output-side VCC") without querying the DB directly
- Use the flag info to prioritize which paramNames most need engineer review

**What this would add:**
1. A flag icon (or chip) in the Triage row when an `atlas_ai_context_flags` row exists for `(family_id, param_name)`.
2. Tooltip showing the most recent `gap_description`.
3. Optional "Show flagged only" toggle in the TriageFilterBar — same shape as "Has note" / "Flagged" engineer-flag filter from Decision #186, but for AI-emitted flags.

**Triggers that flip from defer to ship:**
- Engineer joins and asks "I know B6 has 12 flags — which rows are they on?"
- We want to prioritize Triage processing by AI-confidence signals (flagged rows = AI was uncertain → engineer attention more valuable here).

Effort: ~1.5h. New endpoint query joining `atlas_ai_context_flags` against the Triage queue + UI chip + filter toggle.

### Unify three domain-card staleness signals into one model (May 19, 2026)

Today the AI Domain Cards panel has TWO independent staleness signals, and Decision #192's Phase 2 plan adds a THIRD that overlaps with one of them. Operators can't tell which signal fired or what action will clear it.

**The three signals:**
1. **`flagCount`** (existing) — number of engineer self-flags on this family's unmapped Triage params in the last 30 days. Drops only when flagged rows get resolved or the 30-day window ages out. **Regenerate does NOT clear it.**
2. **`ruleDrift`** (existing) — `currentRuleCount − snapshotRuleCount` from the card's `data_snapshot`. Regenerate clears it (writes a new snapshot).
3. **`groundedProductDrift` / `groundedMfrDrift`** (Phase-1-snapshot, Phase-2-display) — `currentAtlasCount − groundedAtSnapshotCount` from the Phase-1-extended `data_snapshot`. Not surfaced in the UI yet. Regenerate clears it.

**Today's user-perceived bug:** operator clicks Regenerate, expects red chip to drop to green, but it persists because flagCount was the trigger (not ruleDrift). Reason text said "Click Regenerate" — misleading. **Hotfix May 19, 2026: reason text now differentiates which signal fired and what action helps.**

**What this would add:** unify into one health-rollup computation that:
1. Computes all three signals independently.
2. Emits the chip color from the worst-case of the three.
3. Tooltip names each signal's contribution and what action clears it.
4. Adds a "what would Regenerate clear?" dry-run preview button — shows operator whether Regenerating now would actually drop the chip or whether they need other action (resolve flags / wait for window).

**Triggers that flip from defer to ship:**
- Operators ask "I just regenerated, why is it still red?" more than once (already happened May 19, 2026 — hotfix shipped).
- Phase 2 (groundedSnapshotDrift surfacing) lands and a third signal compounds the confusion.

Effort: ~3-4h. Includes Phase-2 surface AND the unification refactor. Best done together since both touch the same compute path.

### Domain Card Phase 2 — staleness signal (Decision #192)

Phase 1 (just shipped) makes `Generate` and `Regenerate` produce grounded cards from `atlas_products` data. But the grounded snapshot drifts: as new MFRs ingest, the saved card's MFR cohort gets stale. Today there's no in-app signal — the engineer has to remember to regenerate, or notice manually that "we ingested Sunlord last week but the card still says only CCTC ships under family 12."

**What this would add:**
1. Storage: `atlas_family_domain_cards.data_snapshot.groundedAtProductCount` + `groundedAtMfrCount` already populated by Phase 1. No schema migration needed.
2. New API: extend `GET /api/admin/atlas/family-domain-cards` (or new endpoint) to compute current atlas counts per family + delta against snapshot, return alongside the card row.
3. UI: per-row warning chip on the AI Domain Cards panel when delta crosses threshold — e.g. `≥50 new products` OR `≥1 new MFR with ≥50 products`. Tooltip names the delta ("142 new products + 1 new MFR (KEXIN: 87 products) since 2026-05-17"). Chip uses warning amber, sits next to the OK/none health chip.
4. Sort affordance: "Show stale first" toggle on the Domain Cards header.

**Triggers that flip this from defer to ship:**
- ≥3 new MFRs ingested under any family without the card being regenerated (silent drift in production).
- Engineer asks "which cards should I refresh?" — proves the staleness state needs surfacing.

Effort ~1.5h. Architecture pattern mirrors Decision #187 (proactive staleness signaling for cached AI verdicts) — same shape, applied to domain cards instead of Triage suggestion caches.

### Domain Card draft diff view — visual delta vs prior active card (May 19, 2026)

Lighter / faster-to-ship alternative to the full Phase 3 dialog below. When the operator opens a draft (post-Regenerate, pre-Approve), default to a **two-pane diff view** vs the prior active card:
- Left pane: prior active card text
- Right pane: new draft text
- Inline highlighting — green for added, red strikethrough for removed, neutral for unchanged
- Toggle: "Show diff" / "Show new only" for engineers who prefer to read fresh prose

Approve button works the same — diff is purely informational. Helps operators spot regressions (Sonnet dropped a useful MFR, made a section vaguer, etc.) and quickly distinguish "substantive new content" from "cosmetic rephrasing."

**Why ship this even before the full Phase 3**: operators currently regenerate cards blind to what changed. Yesterday's session surfaced this when the operator regenerated 12+ cards and had no way to quickly confirm whether each new draft was an improvement, regression, or wash.

**Implementation**:
- Use a small line-diff library (jsdiff or similar) — line-level is the v1, word-level is a refinement
- Render in the existing card-preview dialog/drawer
- Trade-off: Sonnet often rewords identical content. Line-diff will show "lots changed" for what's really rephrasing. Word-level diff cleaner but more effort.

**Effort**: ~1.5h for line-diff v1.

**Relationship to Phase 3 below**: Phase 3 adds section-level accept/reject + smart section detection. This diff view is the read-only precursor — if Phase 3 ever ships, the diff visualization is reused as its "current state" pane.

### Domain Card Phase 3 — section-level diff dialog when regenerating (Decision #192)

Today's `Regenerate` overwrites the entire card with the new Opus draft, wiping any engineer prose edits. That's fine when the card was last AI-generated (and probably contained hallucinations anyway — Decision #192 audit), but punishes the engineer who handcrafts the foreign-family-indicator section over the course of a Triage session.

**What this would add:**
1. New dialog opened on Regenerate: 3-column diff showing Current card / New card / Merged result.
2. Section-level accept/reject. Three sections detected by the ALL-CAPS section labels the prompt convention uses (SUB-TYPES / NAMING / CONVENTIONAL UNITS / FOREIGN-FAMILY / HARD GATES / MFR COHORT / MPN PREFIXES / etc.). Default behavior: accept new for sections whose content is data-derived (MFR cohort, MPN prefixes, Chinese paramName lines), keep current for sections that look engineer-edited (foreign-family indicators with bespoke pattern descriptions, hard-gate rationale prose).
3. Engineer can override any section default with a click. "Accept all" shortcut for full overwrite. "Keep current" shortcut to discard the regeneration entirely.
4. Save commits the merged result + bumps the grounding snapshot.

**Triggers that flip this from defer to ship:**
- Engineer reports losing prose edits after a Regenerate (one round of frustration = ship signal).
- We start asking AI to handcraft foreign-family pattern descriptions and engineers actually edit them (today's cards lean heavily on the AI prose; not enough manual editing for the cost to bite yet).

Effort ~2h. Should be built before any future bulk-regeneration script — losing manual edits at scale is the failure mode this prevents.

### Regenerate remaining hallucinated domain cards — DONE May 18, 2026 (Decision #192)

All 12 audit-flagged cards plus B7 (precautionary) regenerated via grounded Generate on May 18, 2026:
- **Cards 12, 52, 71** — replaced via manual paste of grounded drafts (10:54-10:55 AM)
- **B1, B3, B4, B5, B6, B7, C1, C2, C3, C5** — regenerated via Phase 1 grounded Generate endpoint (11:42 AM – 12:05 PM), each reviewed and approved to `active` status.

Cost: ~$0.50 in Opus tokens; ~30 min of review. Output quality across the cohort consistently matched or exceeded the manual-drafting bar (Triage AI gets richer foreign-family flags, sub-type distinctions, Chinese paramName mappings, MPN-suffix decoding than pre-Phase-1).

Post-completion: optional re-audit run against new active card text would close the verification loop (prove Phase 1 actually eliminated the hallucination surface in production). Deferred unless a Triage row surfaces evidence of residual contamination.

### ~~Optimize computeTriageAggregation — both Proceed AND page-load slow as queue grows (May 20, 2026)~~ RESOLVED BY INFRA UPGRADE (May 21, 2026)

**Resolution:** Post-Supabase upgrade (Free→Pro + Nano→Small compute per Decision #193, plus PG version upgrade May 20→21) re-baselined `get_triage_unmapped_aggregate` at **707ms cold / 266ms warm** against 31 applied batches + 907 overrides + 171K products. Down from the 30–90s observation that motivated this entry. Symptom was Nano-tier resource exhaustion under Free-tier connection limits, not an RPC algorithmic issue.

**Actions taken May 21:**
- Removed 15s timeout band-aid in `app/api/admin/atlas/ingest/batches/route.ts` — no longer protecting anything.
- Verified planner stats post-PG-upgrade via `ANALYZE` on hot tables.
- Decision #194 captures the full sequence + reasoning for NOT shipping the planned Option A SQL optimization (cost-shifting against a non-reproducing symptom).

**Watch triggers (re-open this entry if any fire):**
- Cold compute climbs back above 5s on a fresh measurement.
- Proceed wait exceeds 10s in real operator use.
- Applied-batch count crosses 75 OR JSONB unmapped entries per batch trend up sharply.

Original content preserved below for context:

---

### ~~Original entry — Optimize computeTriageAggregation~~ (now resolved, see above)

The triage queue aggregation RPC (`get_triage_unmapped_aggregate`, Decision #180) is the bottleneck for two routes:
1. **Proceed** (single + Proceed All Clean): awaits the recompute via `invalidateTriageQueueCacheAndAwaitFresh` to guarantee the next Triage navigation sees post-apply data. Cost: 30-90s per Proceed at current data scale (30+ applied batches, 500+ unmapped params).
2. **Atlas Ingest page-load** (`/api/admin/atlas/ingest/batches`): if L1 is cold AND L2 is cold/stale, computes synchronously. Same 30-90s cost.

May 20, 2026 attempted hotfix: switched Proceed to fire-and-forget. That shifted the cost to the NEXT page-load (page hung at infinite loader). Reverted — cost-shifting doesn't help, only the underlying compute is the real cost. Both routes now back to await-fresh.

**Proper fix options (pick one):**

1. **Precomputed per-batch unmapped-summary table.** Materialized at apply time: one row per batch storing the unmapped count + per-paramName mini-rollup. Aggregation route just sums across batches (cheap). Trade-off: requires writing the summary on every apply + invalidation logic on override changes (paramName might newly resolve or unresolve).

2. **Lighter aggregation RPC.** Today's RPC pulls `report->'unmappedParams'` JSONB and runs CTE aggregation. Could be made faster by adding indexes on the JSONB path, or by extracting the unmappedParams into a dedicated relational table at apply time.

3. **Async recompute with stale-tolerance UI.** Apply → kick off background recompute → page-load shows "data is recomputing" banner if it sees recently-invalidated L2 with no fresh recompute yet. Trade-off: UI complexity, but no awaited wait anywhere.

**Triggers that flip from defer to ship:**
- Already hit: per-Proceed wait >30s observed May 19/20, 2026.
- If applied-batch count crosses 50 and per-Proceed wait crosses 2 minutes.
- If operator workflow gets bottlenecked on triage-queue cache rebuilds.

Effort: ~4-6h for option (1), ~2-3h for option (2), ~3-4h for option (3). Option (1) most robust but biggest change.

### Atlas apply-batch upsert → SECURITY DEFINER RPC (May 19, 2026 — updated May 21, 2026)

**Status:** chunk sizes restored to 500 upserts / 200 snapshots (May 21, 2026) after Decision #193's Nano→Small compute upgrade made the May-19 reductions unnecessary. Instrumented Proceed-timing run on May 21 (3,921-row AK batch) confirmed the bottleneck is per-round-trip latency, not statement_timeout — sequential round-trips dominated 93% of the 21s wall-clock Proceed time. Post-bump, a 5,482-row Jingheng batch Proceeded in 13.2s script time (15.2s end-to-end). Per-row processing time fell 2.2× (5.3ms → 2.4ms). **No timeouts observed at 500-chunk on Small compute.**

**Why this entry stays open:** the chunk bump is a quick win, not the structural fix. Network + Postgres execute time still dominates 13s on a 5.5K-row batch. The RPC pattern would eliminate it — `apply_atlas_batch_upserts(p_batch_id, p_rows JSONB)` with `SET LOCAL statement_timeout='120s'` doing all upserts + snapshots in one transaction. Same pattern as Decisions #179 / #180 / #183 / #189. Estimated: ~2s end-to-end Proceed (~7× win on top of today's chunk bump).

**Proper fix benefits unchanged:**
- Atomicity: full batch upsert all-or-nothing in one transaction. Today's chunked path can leave partial state if one chunk fails mid-batch (the snapshot step ahead protects against data loss but is hygiene risk).
- Explicit per-statement timeout budget, not bound by cookie-auth role default.
- Single round-trip vs ~28 (5,482 rows at 500 upsert / 200 snapshot chunks).

**Triggers that flip from defer to ship (refined May 21, 2026 with real numbers):**
- A single MFR batch crosses 10,000 rows. Linear math: 10K rows × 2.4ms/row ≈ 24s end-to-end, past operator tolerance.
- Statement_timeout reappears on any MFR at the new 500/200 chunk sizes (means Small compute headroom is insufficient — RPC fix becomes the only path).
- Operator workflow gets bottlenecked on Proceed waits (subjective; user feedback). Current 15s on 5.5K rows is "acceptable" per the May-21 owner check-in.
- Snapshot/upsert partial-state failure observed in production (a chunk fails mid-batch).
- A second Atlas write path needs the same shape of fix (e.g. revert flow at scale) — at that point the RPC is reused across paths.

Effort: ~3-4h. SQL RPC + atlas-ingest.mjs swap to call rpc instead of per-chunk upsert + dry-run script verifying row counts match. Keep chunked path as `--legacy-chunked` fallback during the transition session.

**What we know after May 21 measurement (don't rediscover next time):**
- Compute-tier was the actual May-19 problem; chunking was a band-aid.
- 500-upsert / 200-snapshot chunks are stable on Small compute up to at least 5,482 rows.
- The .mjs script's per-row math: ~2.4ms/row at current chunk sizes; ~5.3ms/row at the old 100/50 chunks.
- Triage cache invalidation is NOT the bottleneck (1.5s out of 15s, mostly inevitable from wait-then-restart pattern).

### Engineer cleanup pass — accepted overrides where attribute_id is not in the family logic table (Decision #192 follow-up)

The May 18, 2026 spot-check of 20 random recently-accepted overrides found 85% precision (17 ✅ / 3 ⚠️ / 0 ❌). All three ⚠️ cases share one failure mode: when the family's schema lacks an exact canonical for the paramName, Sonnet picks something close-but-not-quite — a sibling attribute (B5 `vgs_th_max` vs canonical `vgs_th`), a related-but-distinct rule (family 69 `insulation_resistance` MΩ where schema only has `insulation_voltage` V), or a broadened L2 generic (RF `pass band → frequency_range`). These mappings don't break runtime — they create display-only attributes that don't participate in matching-engine scoring. Long-term effect: schema fragmentation as accepted overrides accumulate canonicals the logic tables don't know about.

**What this would add:**
1. Script `scripts/atlas-audit-orphan-canonicals.mjs` — service-role query joining `atlas_dictionary_overrides` against each family's `logicTableRegistry` rule set. Output: per-family list of accepted overrides where `attribute_id` is NOT in the logic table's rule attributeIds. Sorted by override volume (most-used orphans first).
2. Per-orphan engineer decision: (a) re-route the override to an existing canonical that already exists in the logic table, (b) formally add a new rule to the logic table for this canonical (and re-evaluate the override fits), or (c) leave as display-only if the attribute genuinely doesn't matter for matching but is informational for users.
3. Rerun cadence: every ~50–100 accepts, or quarterly. Light recurring engineer task.

**Triggers that flip this from defer to ship:**
- Spot-check precision drifts below 80% on a future re-audit (signal that orphan-canonical fragmentation is growing).
- An engineer asks "why does this attributeId not match in the engine?" → orphan was accepted, never added to logic table.
- Schema fragmentation visibly worsens — same physical concept mapped to 3+ different canonicals across families.

Effort: ~2h for the audit script + per-family review process documentation. The engineer-decision pass scales linearly with orphan volume (~5 min per orphan).

### Dictionary Triage Phase 2 — explicit per-param status tracking

Phase 1 (just shipped) treats the unmapped-params queue as the inverse of the dictionary-overrides table: a row shows up if no active override resolves it. That's enough when the engineer's only states are "haven't looked yet" and "accepted." It breaks down when they want to *park* a param without resolving it ("I researched PPAP, need to talk to procurement first, hide it from my queue for 2 weeks") or explicitly reject one ("not worth mapping, stop showing it").

**What this would add:**
1. New table `atlas_unmapped_param_queue` keyed on `(param_name, manufacturer_slug, family_id)` with status enum (`open` / `accepted` / `rejected` / `deferred` / `researching`), optional `status_note`, `status_updated_at`, `status_updated_by`. Upsert logic from the ingest pipeline (or computed lazily on the API path).
2. Status filter chips on the Triage page (default: open + researching). "Show all" toggle to see history.
3. Per-row status dropdown alongside the existing Accept button.
4. **"Mark as wontfix"** / explicit reject — one of the new statuses; today there's no way to tell the system "I've decided this isn't worth mapping."
5. Optional notifications when new unmapped params appear (Slack / email / in-app toast). Pure addition, doesn't change data model. Useful with multiple engineers on rotation; less so for solo ownership.

**Triggers that flip this from defer to ship:**
- Queue grows past ~50 unresolved entries (engineer can't visually scan it anymore)
- Engineers tell you they want a "deferred" / "researching" status to park items
- You onboard a second engineer who needs assignment / comments / "who's working on what"
- Operator wants Slack notifications when uploads introduce new param names

Today's pattern (no override → shows in queue, override exists → gone) is documented in [batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts) — the override-cross-reference filter is the part that goes away when this lands. Half day of work for the table + filter chips; another day for the optional notifications.

### Cross-family fan-out for Triage Accept when cross-scope canonical exists

Today every `atlas_dictionary_overrides` row is keyed on `(family_id, param_name)` — so "L×W (mm)" accepted in family 71 (Power Inductors) does NOT auto-apply to family 70 (Ferrite Beads) even if the queue contains the same paramName under the second family. The engineer has to accept it manually in each family's row. This is intentional (the same paramName can mean different things across families) but creates friction when an attributeId truly is universal — e.g. `footprint_lxw_mm` is the same concept whether the part is an inductor or a ferrite bead.

**What this would add:**
1. When the engineer clicks Accept on a row AND the AI Investigation's `crossScopeOverrides` evidence section showed the same paramName accepted in another family with the SAME attributeId, surface an inline prompt: "This paramName is also unmapped in families [B, C, D] — apply the same override there too?"
2. Checkbox list of other affected families. Default-checked when the proposed attributeId already exists in that family's schema (safe), default-unchecked when it doesn't (engineer must verify).
3. On Apply, create N additional override rows — one per checked target family — using the same `attributeId/Name/Unit`.
4. Affected batches across all target families queued for regeneration in one pass.

**Tradeoff**: lets engineers accept once and fan out, but adds a confirmation step to every Accept where cross-scope matches exist. Worth it only if engineers regularly see "same paramName, same canonical" across families. If most cross-scope hits are coincidental (same string, different concept), the confirmation friction outweighs the savings.

**Triggers that flip this from defer to ship:**
- Engineer regularly hits the same paramName Accept in 3+ families in one session.
- The cross-scope evidence box in the AI Investigation regularly says "same attributeId in family X" with high confidence.
- Multi-family Atlas MFR ingestions (single MFR shipping inductors + capacitors + ferrite beads with overlapping param vocabularies) become a workflow bottleneck.

### Per-product family classification drawer for `unscoped_products` Triage rows (Decision #185 follow-up)

When the AI Triage Investigator returns the `unscoped_products` bucket, the affected products have `family_id=null` AND `category=null`, so no override scope resolves and the engineer has no Triage-page action. The AI's recommendation payload already has the right shape (`perProductProposals: [{ mpn, proposedFamilyId, reasoning }]`) but the prompt rarely populates it and there's no UI to commit per-product `family_id` overrides anyway.

**What this would add:**
1. A drawer launched from the Triage row's investigation card listing the affected MPNs with their description, c1/c2/c3 source categories, sample value for the paramName, and an editable family-ID dropdown pre-filled with the AI's proposed family per product.
2. Bulk "Apply all" + per-row checkbox to commit a per-product `family_id` override (new table `atlas_product_family_overrides` keyed on `(manufacturer_slug, mpn)` with priority over `classifyAtlasCategory` at read time).
3. AI prompt revision: actually require + return `perProductProposals` for unscoped_products bucket, with model penalty when the array is empty for >5 affected products.
4. Once products are classified, the existing override in the cross-scope match (e.g. B1 `rth_ja`) auto-applies — the Triage row resolves itself.

**Triggers that flip this from defer to ship:**
- Engineer regularly sees `unscoped_products` rows they can't action (already happening for YANGJIE diodes).
- The classifier code-fix path becomes a bottleneck (i.e. you can't keep up with one-off MFR taxonomy quirks).
- Per-product overrides become useful for OTHER cases (e.g. correcting wrongly-classified products).

Phase 1 alternative (lighter): when investigation returns `unscoped_products`, just surface a "Mark for engineer review" button that sets a new note status `needs_classification` so the row drops from Open queue but is queryable later. Doesn't solve the problem, just parks it until I can fix the classifier — see the "needs_classification" note-status entry below.

### `needs_classification` note status — park `unscoped_products` rows for engineer follow-up

Triage today has no way to say "I've looked at this and it's blocked on upstream classification — hide it from Open until someone fixes the classifier." Engineers either leave it in Open as visual noise or mark it unmappable (wrong — it IS mappable, just not from Triage). Both are bad.

**What this would add:**
1. New value `needs_classification` in the `atlas_unmapped_param_notes.status` CHECK constraint.
2. New "Mark for classifier fix" button on `unscoped_products` investigation rows (parallel to Mark Unmappable on `unmappable` rows). Persists the new status + the AI's diagnosis as the autoDiagnosis payload.
3. Queue filter: `needs_classification` rows hidden from Open / Synonyms by default; visible under All. New status-filter chip "Needs Classification" so engineers can pull them up when they're ready to triage classifier fixes.
4. AI Investigation Log records this as a new action (`marked_needs_classification`) so the audit trail captures it.

When the classifier gets fixed and the row's products acquire `family_id`, the row's `dominantFamily` resolves and the existing cross-scope override auto-applies on re-ingest — the row drops out of the queue entirely. Engineer can also Revert the note status if they decide to look again.

Half-day of work: schema migration + status handling + button + filter chip. Useful in isolation even without the heavier per-product classification drawer above.

### ~~Constrain AI Triage Investigator to known family IDs~~ COMPLETED (May 2026)

Shipped as a three-layer defense after Decision #188 made the AI verdict load-bearing:

1. **Anthropic SDK enum constraint at the tool-use boundary** ([app/api/admin/atlas/dictionaries/investigate/route.ts](../app/api/admin/atlas/dictionaries/investigate/route.ts)) — the `submit_triage_verdict` tool's JSON schema declares `actualFamilyId`, `signatureRecommendation.familyId`, and `perProductProposals[].proposedFamilyId` with `enum: KNOWN_FAMILY_IDS_LIST`. The model literally cannot return an out-of-set value.
2. **Server-side post-validation in the investigate route** (lines ~912-951) — belt-and-suspenders check using `validateFamilyId()` from `atlasTriageContext.ts`. Surfaces invalid IDs via `validationErrors`. UI suppresses the deep-analysis Primary Action button when present.
3. **Server-side validation in `/api/admin/atlas/family-param-signatures` POST** — load-bearing because this endpoint persists signatures and reclassifies products in one click. Returns 400 with `code: 'INVALID_FAMILY_ID'` + the canonical list when `targetFamilyId` isn't a real L3 family. Uses new `isValidFamilyId()` from [lib/services/validFamilyIds.ts](../lib/services/validFamilyIds.ts) (derived from `logicTableRegistry` keys; L3-only because `atlas_products.family_id` is L3-only and that's the reclassify destination).
4. **UI defense in `confirmFlag`** ([components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx)) — pre-flight check before POST. When AI's `suggestedFamily` isn't in the L3 set, skips the registry POST and surfaces a clear "Flag confirmed, but skipped registry insert — AI suggested unknown family 'X'" message instead of a misleading "signature insert failed" tooltip.

Files: new [lib/services/validFamilyIds.ts](../lib/services/validFamilyIds.ts), updates to [app/api/admin/atlas/family-param-signatures/route.ts](../app/api/admin/atlas/family-param-signatures/route.ts) + [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx).

---

### ~~Constrain AI Triage Investigator to known family IDs~~ (original entry, kept for context)

The Investigator's `wrong_family` action bucket returns a `suggestedFamily` field that the prompt currently lets the model freely populate. Observed hallucination: for KEXIN pre-biased digital transistors (DTA/DMUN/UMA series) shipping `R1(KΩ)`, the Investigator returned `familyId: "BJT_DIGITAL"` — a family that doesn't exist. The correct destination is `B6` (BJTs); pre-biased digital transistors are a sub-type of B6, not a separate family.

If an engineer copies the AI's JSON verbatim into `FAMILY_PARAM_SIGNATURES`, the registry entry would target a non-existent family and the reclassifier would have nowhere to send affected products. Today the only thing protecting against this is engineer-time review.

**What this would add:**
1. The `/api/admin/atlas/dictionaries/investigate` prompt should include the canonical family-ID list (B1–B9, C1–C10, D1–D2, E1, F1–F2) AND the L2 category list as the only allowed `suggestedFamily` / `familyId` values. Phrased as a hard constraint, not a hint.
2. Server-side validation: after the model responds, validate `suggestedFamily` against the known set; if invalid, either retry once with an "INVALID — choose from this list" follow-up, or downgrade the bucket from `wrong_family` to `unmappable` with a note explaining the model couldn't pick a valid target.
3. UI defense: when rendering the action button, validate the suggested family — if invalid, hide the button and show an "AI suggested an unknown family — review manually" warning chip instead of letting the engineer click through.

**Why defer:** caught once so far. If hallucination recurs (engineer-time review missed it, or Investigator suggests other invented IDs), this becomes urgent. For now the workaround is engineer attention — when the suggested family ID looks unfamiliar, treat it as a reason to skip the registry add (as we did for R1(KΩ)).

**Urgency bumped (Decision #188 follow-up):** the AI verdict is now load-bearing — one Confirm click writes the signature to the DB and retroactively reclassifies products. A bad `suggestedFamily` no longer just sits in a JSON snippet awaiting a code commit; it lands in `atlas_family_param_signatures` AND moves products to a non-existent family in `atlas_products` immediately. Add at minimum the server-side validation (item 2 above) before another invalid family slips through.

### RF diode family / sub-family for PIN diodes and varicaps

B1 (Rectifier Diodes) is currently a catch-all for any device classified as "diode" — including RF-specific devices that have nothing in common with rectifiers. Caught during Triage of KEXIN BAR64-05W / HVU131/132/133 / MMBV3401 (TR-ee4613), all of which were misrouted into B1:

| Device class | What it does | Headline specs (NOT in B1 today) |
|--------------|--------------|-----------------------------------|
| PIN diode | RF switching, attenuation | Rd (series resistance), Cd, isolation, insertion loss |
| Varicap (varactor) | RF tuning, voltage-controlled capacitance | Cj vs Vr, Q factor, capacitance ratio Cmax/Cmin |
| Schottky RF | RF detection/mixing | Vf at very low currents, junction capacitance |

The B1 logic table is built around forward-current handling (Vf, Ifsm, Irrm, trr) — these rules are largely meaningless when scoring two PIN diodes against each other. Conversely, the specs that DO matter for these devices (Rd, capacitance-vs-voltage curves, RF performance) are either missing from B1's schema or sitting in display-only satellites with no rules consuming them.

**Two structural paths:**

1. **New family B10 (RF Diodes)** — dedicated logic table + classifier rules + dict. Splits PIN, varicap, and RF Schottky as three sub-types under one family (same multi-subtype pattern as B8 Thyristors). Highest correctness, biggest build effort.

2. **B1 sub-family route via `_device_subtype`** — keep these in B1 but add a context question "device function: rectifier / PIN switch / varicap / RF Schottky" that suppresses irrelevant B1 rules and activates new RF-specific rules (parallel to how B8 uses Q1 to suppress sub-type-irrelevant rules across SCR/TRIAC/DIAC). Lower lift, less clean separation.

**Trigger to ship:** when RF diode count in Atlas grows past ~50 products AND/OR a user attempts cross-references on a PIN/varicap part and gets meaningless B1 rectifier-style scoring.

**Files involved (Option 1):** new [lib/logicTables/rfDiodes.ts](../lib/logicTables/rfDiodes.ts), new [lib/contextQuestions/rfDiodes.ts](../lib/contextQuestions/rfDiodes.ts), entries in [lib/logicTables/index.ts](../lib/logicTables/index.ts), new RF diode detector in [lib/logicTables/familyClassifier.ts](../lib/logicTables/familyClassifier.ts), new B10 dict block in [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) + [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs).

### Suspicious-unit-value detector on Atlas ingest

Some MFR data files appear to ship physically-implausible values for a given unit — likely upstream unit-label bugs at the MFR's data-export layer, not actual unusual specs. Caught during Triage of KEXIN B8 IGT(uA) row (TR-ddffc6):

- KEXIN BT139B-600/800 listed IGT = 50 µA → real-world BT139 IGT is 5-50 **mA**, not µA. 1000× off.
- KEXIN BT137-500 listed IGT = 50 µA → real-world BT137 IGT is ~25 mA per ST datasheet.
- (Genuine sensitive-gate variants like CR3AM/CR5AM correctly listed at 20-30 µA.)

The dictionary mapping has to respect the labeled unit (we can't second-guess the source), but a flag at ingest time would help engineers spot data-quality issues before they propagate to the matching engine.

**What this would add:**

A per-family per-attribute "expected value range" lookup (e.g., `B8.igt: { min: 0.5, max: 200, unit: 'mA', alt_unit: 'µA' for sensitive variants }`) and an ingest-time check that flags any value outside the typical range. Flagged values surface in the per-batch diff report under a new "Anomalous Values" section. Engineer reviews before Proceed; can override or note as legit (e.g., genuine sensitive-gate variant).

Could reuse the existing logic-table engineering reasons as the source for "typical range" descriptions — Sonnet could generate the lookup table from logic-table prose in a one-time pre-pass.

**Why defer:**

- Current scope of caught cases is small (one pattern, one MFR).
- The Triage AI Investigator's Disambiguation/Unit-Mismatch buckets already catch these at engineer-review time, so it's not silently corrupting data — just not flagging at the earliest possible point.
- Building the value-range lookup is the bulk of the work; could be incremental (start with a few high-impact attributes per family, expand as more anomalies surface).

**Trigger to flip from defer to ship:** if the same MFR ships another batch with similarly-suspicious values across multiple attributes, OR if a different MFR exhibits the same pattern (suggesting it's a data-export-layer bug worth catching globally).

**Files involved:** new `lib/services/atlasValueAnomalies.ts` for the lookup + check, [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) to invoke at ingest time, [components/admin/atlasIngest/ProductDiffTable.tsx](../components/admin/atlasIngest/ProductDiffTable.tsx) to render the new "Anomalous Values" badge.

### Ingest-time Schottky / small-signal diode auto-routing (B1 misclassification cleanup)

Discovered during MLCC/Chip Resistor/TVS/Power-Inductor/Rectifier domain-card review (May 2026) — Family B1 (Rectifier Diodes) currently contains a meaningful number of products that should be in B2 (Schottky) or in a not-yet-existing "small-signal switching diode" bucket. Sample evidence from `atlas_products WHERE family_id = 'B1'` across 20 ingested MFRs (12,150 rows):

- **Schottky-prefixed** (should be B2): MBR0520, MBR840, MBR6040, MBRB10200, MBR2020CT (at YFW, AK, ISC); SS14, SS220, SS56, SS34, B0530 (at AK, JINGDAO); BAS40, BAT54 (at CREATEK, CBI). Likely hundreds to low-thousands of rows.
- **Small-signal switching** (no dedicated family today): 1N4148, BAS16, BAS316, BAV70, BAV21, MMBD4148 (at YFW, Prisemi, CREATEK, CBI, YONGYUTAI, Rectron, TECH PUBLIC). Lower volume but recurring across MFRs.

The classifier in `atlasMapper.ts → classifyAtlasCategory()` and the c3-based mapping route these under "Rectifier Diode" because the source data labels them that way. Decision #175's `reclassifyByParameterSignals` doesn't catch them because the misclassification isn't via the `Type` parameter — it's via the MPN prefix + the absence of Schottky-specific signals.

**What this would add:**

Two-stage ingest-time auto-routing for B1:

1. **MPN-prefix recognizer** — a small lookup of known Schottky and small-signal MPN families (MBR/MBRB/SS/SR/SB/STPS/B05/B07 for Schottky; 1N414x/1N400x/BAS16/BAS31x/BAV7x/BAV21/MMBD for small-signal). If the MPN matches a known Schottky pattern AND no Schottky-incompatible signal is present (e.g., trr ≥ 500ns), reclassify B1→B2 at ingest. If matches small-signal AND Io < 200mA, flag for engineer review with a "small-signal diode" note (no auto-route since there's no destination family).
2. **Parameter signal recognizer** — when MPN-prefix is ambiguous, check parameters: low Vf (<0.4V) + low Vrrm (<100V) + trr unspecified → Schottky. Vf<1V + Io<200mA + no thermal-resistance spec → small-signal.

Either stage triggers `reclassifyByParameterSignals`-style re-routing in `atlasMapper.ts` AND its mirror in `scripts/atlas-ingest.mjs`. Both stages should also emit a `MisclassificationCandidate` row into the diff report so the engineer sees what got moved (with an undo path via the existing batch-revert mechanism).

**Cross-family pattern:** This is the same shape as Decision #188 (engineer-driven FAMILY_PARAM_SIGNATURES) but for MPN-prefix-driven misclassifications rather than param-name-driven. Could share the underlying merge layer: code-defined Schottky/small-signal patterns + DB-backed engineer additions. The AI Triage Investigator's `wrong_family` bucket is already the human-in-the-loop fallback; this is the automated front line.

**Why defer:**

- The Triage AI Investigator (Decision #185) already surfaces these as `wrong_family` candidates one-by-one, so they're not silently mis-served — engineers see them and can confirm via the Decision #188 one-click flow. The cost is per-row Sonnet calls and engineer time, which scales with backlog volume.
- Domain cards for B1 and B2 (when generated) will sharpen the Triage AI's `wrong_family` verdicts on these rows further.
- Building the MPN-prefix lookup is the bulk of the work; could be incremental.

**Trigger to flip from defer to ship:** if Triage queue grows past a few hundred B1 rows that are demonstrably Schottky/small-signal (visible via auto-flag count when `recovery_category` is null + Vf<0.4V), OR if a new MFR ingest adds another large batch of misclassified Schottkys (one batch of >200 misclassified rows justifies the build cost).

**Small-signal diode family question:** the small-signal switching diodes (1N4148-class) don't have an own logic table today. Worth a separate design decision: do they belong as a B1 variant (like B3/B4 variants of B1), or do they need their own family entry (e.g., B10) with a logic table tuned for low-current, low-capacitance switching specs? Defer until volume justifies — but raise when scoping this auto-routing item, because the answer determines whether the recognizer reclassifies or just flags.

**Files involved:** new `lib/services/atlasMpnFamilyHints.ts` (Schottky + small-signal MPN patterns + parameter signal recognizers), [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) `reclassifyByParameterSignals` to call into the new helper, [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) mirror, batch report shape to include `misclassificationsRouted` array for engineer visibility.

### ~~Detect un-matchable MPN patterns at ingest (phase 1: detection)~~ COMPLETED (May 2026)

Shipped phase 1 — detection only, no expansion. Triggers caught: 4 MFRs (CREATEK + GIGADEVICE + Geehy + AWINIC, + partial KEXIN); 250+ confirmed un-matchable rows across atlas_products. Survey-driven decision to promote from defer → ship.

**What's live:**

- **Detection module:** [lib/services/atlasMpnQualityValidator.ts](../lib/services/atlasMpnQualityValidator.ts) — `detectMpnQualityIssue()` + `summarizeMpnQualityIssues()`. Five detection kinds: `range_thru` (Thru/thru/thur/through), `range_series` ("X Series" / Chinese full-width parens), `placeholder_x` (trailing x/X with TX/RX exemption), `placeholder_xx_midword` (Gainsil-style `-xx-` between prefix and suffix — added May 18 after discovery during C1 LDO review; also catches Refond LED RGB MPNs), `slash_variant` (alphanumeric/alphanumeric).
- **Ingest-time wiring:** [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — mirror of the TS module + per-batch collection in `mapManufacturerProducts()`. Populates `report.mpnQuality` when issues found; field is optional so older batches continue to work.
- **UI surfacing:** [components/admin/atlasIngest/BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) — warning card on per-batch UI with total count, per-kind breakdown, scrollable sample list. Engineer sees the problem at apply-batch time.
- **Backfill survey:** [scripts/atlas-mpn-quality-survey.mjs](../scripts/atlas-mpn-quality-survey.mjs) — on-demand scan of existing `atlas_products` to catalog the legacy backlog. `--verbose` for per-row listing, `--json` for piping.
- **Tests:** 18 cases in [\_\_tests\_\_/services/atlasMpnQualityValidator.test.ts](../__tests__/services/atlasMpnQualityValidator.test.ts) covering each detection kind, exemptions (TX/RX, mid-word substrings, hyphen-x), and the summary helper.

**Phase 1 explicitly does NOT expand.** Detection surfaces the problem; engineers either chase upstream cleanup at the MFR / dataset provider or hand-fix in SQL. Per-MFR voltage-code expansion is phase 2 (separate entry below).

**Verification:** survey script run against current atlas_products confirms 250 un-matchable rows across the expected MFRs. Tests pass.

---

### Phase 2: per-MFR MPN-range expansion tables (phase 1 follow-up)

Phase 1 shipped detection in May 2026. Phase 2 adds actual expansion — turning `BZT52B2V4S thru BZT52B75S` into ~30 individual rows in `atlas_products` rather than leaving the engineer to do it manually.

**Scope:**
1. Per-MFR voltage-code sequence tables. CREATEK alone needs JEDEC Zener sequences for BZT52 (2V4, 2V7, 3V0, …, 75V), CZ3D (2V4–39V), 1SMA (4728–4777 = 3.3V–200V), 1SML (4728–4764, 5913–5956), Schottky barrier voltages for SS/SK/SR series (12, 14, 16, …, 120V), bridge rectifier voltages for GBU/KBP (15xx–10x series). Each is a documented industry-standard sequence.
2. Expansion path in ingest: when detection fires `range_thru`, look up the start/end tokens in the voltage-code table, enumerate the intermediate values, emit one `atlas_products` row per resolved MPN with parameters copied from the source row.
3. Diff-report addition: new "MPN expansions" section showing engineer what got expanded vs flagged for manual review. Already half-built (`mpnQuality.samples` shape is forward-compat).
4. UI: expansion summary in BatchCard alongside the phase 1 warning card.
5. Backfill: optional re-process of existing un-matchable rows in `atlas_products` using the same expansion logic.

**Why defer (still):**
- Phase 1 detection + survey gives engineers visibility now without per-MFR knowledge encoded in the system.
- Building correct voltage-code tables requires either (a) datasheet access per MFR/series OR (b) curating from JEDEC public data. Both take real time and the cost-benefit calc depends on whether the 250-row backlog grows further.
- Phase 1 already surfaces the problem at ingest time — bad data doesn't silently land any more.

**Trigger to ship phase 2:**
- Engineer reports spending non-trivial time hand-expanding ranges in SQL (manual cleanup load justifies the build).
- Backlog grows past ~500 un-matchable rows in production.
- Phase 1 surfaces a new wave of range entries from a future ingest that engineer can't realistically hand-fix at scale.

**Files involved:**
- New: `lib/services/atlasMpnRangeExpander.ts` (per-MFR voltage-code tables + expansion logic).
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — call expansion in `mapManufacturerProducts()` when detection returns `range_thru`.
- [components/admin/atlasIngest/BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) — add expansion summary section.

---

### ~~Detect un-matchable MPN patterns at ingest~~ (original entry pre-phase-1-ship, kept for context)

Discovered during Zener Diode (B3) and Switching Regulator (C2) domain-card review (May 2026). Two related un-matchable-MPN patterns visible:

**(1) CREATEK "thru" / Series range entries.** CREATEK is ingesting series-range entries as single rows in `atlas_products.mpn`, e.g.:

- `"BZT52B2V4S thur BZT52B75S"` (note the typo "thur" → "thru")
- `"CZ3D2V4B Thru CZ3D39B"`
- `"1SMA4728AF Thru 1SMA4777AF"`
- `"1SML4728A Thru 1SML4764A"`
- `"1SML5913A Thru 1SML5956A"`
- `"BAS40T Series"` (also CREATEK, in family B1)

Each likely represents 10–50 individual MPNs that were collapsed in the source data (possibly from a datasheet table that listed the family as a range). Visible at scale today: 30 B3 rows for CREATEK; almost-certainly more across B1/B2/B4 if surveyed.

**(2) GIGADEVICE literal-placeholder `x` MPNs.** GIGADEVICE C2 rows ingest with a literal lowercase `x` (or sometimes uppercase `X`) at the end of the MPN where a variant code should appear:

- `GD30DC1101x`
- `GD30DC1104NSTR-I`
- `GD30DC1105X`
- `GD30DC2300x`
- `GD30DC2301x`

The `x` is a placeholder for an unspecified variant character (likely temperature grade, packaging suffix, or speed bin per their datasheet table). 5+ visible rows in family C2 today; the same pattern likely affects other GIGADEVICE families if surveyed. Like the CREATEK ranges, these are un-matchable by exact MPN lookup and pollute family volume statistics.

**(3) Geehy slash-delimited two-MPN-in-one-row.** Geehy ingests rows that encode two related MPNs separated by a slash, where the second token is an abbreviated variant of the first:

- `GHD3440/3440R` (family C3) — `GHD3440` and `GHD3440R` (R suffix likely "reverse polarity" or "reel packaging")

The slash isn't a known MPN character — it's a datasheet shorthand for "this part comes in standard and -R variants." Currently visible at 1 row in family C3; surveying all Geehy families would likely surface more. Same root issue as Cohorts 1 and 2: un-matchable by exact lookup, polluted statistics.

**Why this matters:**

- These rows are **un-matchable by exact MPN lookup.** A user searching `BZT52B5V1S` will not find CREATEK's row, even though that part is genuinely included in the range.
- They pollute the family-volume statistics (one row counted as one product instead of N).
- They will silently fail xref scoring — the matching engine has nothing to compare against.
- The Triage AI cannot help here because the issue is in the MPN field itself, not the parameters.

**What this would add:**

A pre-ingest MPN-shape validator covering both patterns:

For **CREATEK-style ranges:**
1. Pattern detect: regex `/\b(thru|thur|through|series|to)\b/i` in the `mpn` field, OR an em-dash/en-dash/hyphen between two recognizable MPN-like tokens.
2. Per-MFR expansion strategy table — for the common patterns (BZT52, CZ3D, 1SMA, 1SML, MMSZ, etc.) the voltage suffix increments predictably (e.g., BZT52B**2V4** through B**75** maps to JEDEC Zener voltage code series). Expand programmatically using the known voltage-code sequence per family.
3. For patterns we can't expand (e.g., `"BAS40T Series"` — too ambiguous about what's in the series), flag for engineer review with a "manual expansion needed" diff-report badge.

For **GIGADEVICE-style `x` placeholders:**
1. Pattern detect: trailing literal `x` or `X` on an MPN that otherwise matches the MFR's known prefix (regex `/[xX]$/` on rows where the prefix-stripped body is otherwise valid).
2. Cross-reference the MFR's published variant codes per part-family — GIGADEVICE GD30DC1101 likely has fixed enumerable variants (e.g., -A, -B, -TR, -ESTR). Expand to one row per variant when the variant set is known; flag for engineer review otherwise.
3. Same diff-report surfacing as the range path.

For **Geehy-style slash-delimited variants:**
1. Pattern detect: regex `/\//` (literal slash) in the `mpn` field. Slash is not a legal MPN character at any MFR we've seen — its presence reliably signals "two MPN tokens collapsed."
2. Split on the slash; treat both tokens as candidate MPNs. Validate each against the MFR's prefix convention. When the second token is a known suffix-only variant (e.g., `GHD3440/3440R` → `GHD3440` and `GHD3440R`), expand to two rows with shared parameters and distinct MPNs. When the second token doesn't share enough of the first's structure to be a confident variant (ambiguous), flag for engineer review.
3. Same diff-report surfacing.

All three paths produce real rows in `atlas_products` with proper MPNs; the original range/placeholder/slash row is dropped (or kept with a `status='unmappable'` marker for audit).

Mirror in `scripts/atlas-ingest.mjs` and the upstream `mapManufacturerProducts()` path. Surfaces in the diff report under a new "MPN range expansions" section so engineers see what got expanded vs flagged.

**Cross-family pattern:** Same author-defined-data-quality shape as the suspicious-unit-value detector above (also a P1 backlog item) and the Schottky/small-signal MPN-prefix recognizer. A natural place for a shared "ingest-time validators" framework if more of these patterns surface.

**Why defer:**

- Affects ~30 CREATEK rows in B3 + 5+ GIGADEVICE rows in C2 + 1 Geehy row in C3 today, plus unknown counts in other families. Not large absolute vs the 100K+ total Atlas dataset.
- Voltage-code, variant-set, and slash-split expansion logic is non-trivial per family — JEDEC Zener voltages, GD30 variant suffixes, and per-MFR suffix conventions all differ.
- Three distinct upstream-encoding patterns now confirmed across three different MFRs (was two when this item was first written). Pattern recurrence suggests this is a class of bugs worth a unified validator framework, even at small absolute volume.

**Trigger to flip from defer to ship:** if a fourth MFR exhibits any of these patterns (would confirm the class is a project-wide hazard), OR if combined affected count grows past ~200 rows across families, OR if a user-facing search miss is reported on a part that should be in one of these collapsed rows, OR if any of the three current MFRs surfaces additional families with the same pattern (suggesting the upstream issue is per-MFR systematic rather than per-family one-off).

**Files involved:** new `lib/services/atlasMpnRangeExpander.ts` (pattern detection + family-specific expansion), [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) `mapManufacturerProducts()` to call before insert, [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) mirror, batch report shape to include `mpnRangesExpanded` and `mpnRangesNeedingReview` arrays.

### B6 (BJT) misclassification cleanup — three distinct cohorts observed in atlas_products

Discovered during BJT (B6) domain-card review (May 2026). Of 6,101 rows currently classified as B6, three distinct cohorts are actually different families. All three share the "ingest-time classifier misroute" root cause but have different fix shapes — listing them together so they can be triaged as one effort.

**Cohort A — IGBT misclassifications (YANGJIE + VANGUARD + Prisemi, ~800 rows):**

- YANGJIE DGZ/DGW with `N65` voltage code (731 rows): DGZ50N65CTS2A, DGW75N65CTS2A, etc. The "N65" pattern (~65V class) plus the high current implication of the leading number is characteristic of IGBTs, not BJTs (which are typically ≤300V Vceo but more commonly ≤80V at high current). Likely belong in B7.
- VANGUARD HCKD/HCKW with same `N65` pattern (15 rows): HCKD5N65AM2, HCKW60N65BH2A. Same diagnosis as YANGJIE.
- Prisemi PI*F65 / PI*S120 series (48 rows): PI160F65TDK1B7, PI15S120T3HA7. 120V class + the PI prefix (inconsistent with Prisemi's "P + industry MPN" convention in B1/B3/B4 families) suggests these are IGBT-line products mis-routed.

Fix shape: same as the Schottky/small-signal item above — MPN-prefix recognizer in `atlasMpnFamilyHints.ts`. Add YANGJIE DGZ/DGW + VANGUARD HCKD/HCKW + Prisemi PI*F/PI*S patterns with a B6→B7 route when paired with a high-voltage code (≥60V) AND IGBT-discriminating params (vce_sat present, eon/eoff present, NO hfe).

**Cohort B — Photo interrupters (Everlight, 39 rows):**

Everlight ships ITR/EAITRDA-prefixed products under B6: ITR9809-F/T, EAITRDA2, EAITRDA3, ITR9813. These are definitively photo interrupters / photointerrupters (LED + phototransistor in a slotted package for object detection / encoder use) — NOT discrete BJTs.

Fix shape: more complex. Photo interrupters don't have a dedicated logic table today. Two options:
1. Route to E1 (Optocouplers) — closest existing family, but optos are for galvanic isolation, not slot-based optical sensing. Schema fit is partial.
2. Create a new family (e.g., E2 Photo Interrupters / Optical Sensors) with its own logic table tuned for slot width, detection distance, response time, and dual-output (logic/analog) variants.

Recommended: defer the new-family decision until volume justifies (39 rows is below threshold), but in the meantime add Everlight ITR/EAITRDA + similar prefixes (Omron EE-SX, Sharp GP1A, TT Electronics OPB) to the MPN recognizer with a "manual classification needed" flag at ingest.

**Cohort C — Darlington array driver ICs (MIXIC, WADE, BL, IDCHIP, ~17 rows):**

ULN2003 / ULN2402 / ULN2803 family at MIXIC (11), WADE (5), BL (2), IDCHIP (1). These are integrated 7-channel Darlington arrays with built-in flyback diodes — semantically driver ICs (often paired with relays, motors, stepper coils), not discrete transistors. The B6 logic table doesn't score them meaningfully: hfe / vce_sat / fT all apply per-channel inside the IC but the user-facing spec is "per-channel current sink" + "max output voltage" + "input logic threshold."

Fix shape: open design decision needed:
1. Carve out a sub-family or new family for sink/source driver arrays (would also catch ULN2001/2002/2004 variants and SN754x / TPL7xxx equivalents).
2. Reclassify into an existing C-block IC family (no current fit — none of C1–C10 is a "discrete logic driver array").
3. Leave them in B6 with a "_array_channels" satellite attribute and a triage flag. Cheapest but doesn't help xref scoring.

**Why defer all three together:**

- Total affected rows ~860 across B6 (about 14% of the family) — noticeable but not catastrophic. Until B6 domain card + Triage AI Investigator are doing per-row reclassification work at scale, the impact is bounded.
- Cohort A is the biggest payoff and has the same fix shape as the existing Schottky/small-signal item (also in this BACKLOG section) — natural candidate for shared `atlasMpnFamilyHints.ts` infrastructure.
- Cohorts B and C need design decisions that go beyond a single fix.

**Trigger to flip from defer to ship:** if the B6 Triage queue surfaces these cohorts as wrong_family verdicts at high frequency (engineer time burned on the same diagnosis over and over), OR if a new ingest adds another large batch with the same patterns (suggests it's a recurring upstream issue), OR if Cohort A is bundled into the broader MPN-prefix recognizer build for Schottky/small-signal.

**Files involved:** extends the `lib/services/atlasMpnFamilyHints.ts` proposed in the Schottky item above. Cohort B needs design decision; Cohort C needs design decision plus possible new logic table.

### Rename C4 `supply_current` canonical to `_iq_per_channel` (or merge into `iq`)

The C4 Op-Amps/Comparators dictionary has a `supply_current` canonical at [atlasMapper.ts:1138-1187](lib/services/atlasMapper.ts#L1138-L1187) used as the destination for 11+ paramName variants — but every existing variant is `iq(typ.)(per ch)` style per-channel µA-scaled (not actual total supply current). The name is misleading: it's holding Iq-per-channel values, not ICC-total values.

Caught while triaging KEXIN ICC(mA) row (TR-647e33), where the AI suggested minting `supply_current_ma` — would have collided. Workaround: introduced `_icc_ma` satellite for true ICC values, leaving `supply_current` as-is.

**Two cleanup paths:**
1. **Rename `supply_current` → `_iq_per_channel`** (satellite, leading underscore). Honest naming. Doesn't participate in matching (it never did — no logic table rule). Requires updating all dict entries + any DB rows in `atlas_dictionary_overrides` keyed on `supply_current`.
2. **Merge `supply_current` into existing `iq` canonical**. The C4 `iq` logic rule already exists ([opampComparator.ts:255-263](lib/logicTables/opampComparator.ts#L255-L263)) and would benefit from more values flowing into it. But unit normalization would need attention (some current entries are µA, some mA).

Recommended: Option 1 first (low risk, makes naming honest). Option 2 later as a logic-table consolidation pass.

**Files involved:** [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) C4 block + [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) C4 mirror + any `atlas_dictionary_overrides` rows targeting `supply_current` in C4.

### Split C2 Switching Regulators into chip-level vs module/brick sub-families

Discovered during C2 (Switching Regulators) domain-card review (May 2026). The C2 family currently mixes two semantically-distinct product classes under one logic table:

**Chip-level switching regulators** (the schema's design intent): silicon die in a SOT-23 / SOIC / QFN / VQFN-style package. Specs are die-level: `vref`, `fsw`, `control_mode`, `compensation_type`, `qg`, `rds_on` of integrated FET, etc. Logic table rules score against these.

**Board-level DC-DC modules / bricks**: complete subsystems with the inductor, output caps, sense pins, and sometimes the isolation transformer all on a small daughter board. User-facing spec is "12V input, 5V/3A output, 15W, 75°C ambient" — most chip-level canonicals (`fsw`, `vref`, `control_mode`, `compensation_type`) are unspecified because they're encapsulated inside the module.

**Observed mix in current data** (901 C2 rows):
- DELTA: 401 rows, mostly modules/bricks (`PJ-12V150WLRA`, `DNL10S0A0S16PFD`, `E48SR05012NMFA`)
- CYNTEC: 16 rows, point-of-load modules (`MUN3C1HR6-FB`, `MSN12AD12-MP`)
- Hi-Link: 12 rows, isolated DC-DC bricks (`B0505S-1WR2`, `HLK-10D2405`)

That's ~430 rows / 48% of the family that don't fit chip-level scoring. The matching engine will compare a Hi-Link `HLK-10D2405` (10W isolated 24V→5V brick) against a TPS54xxx chip on `topology=buck` and `vout_range=5V` and produce nonsense scores because most other canonicals are unspecified on the module side.

**What this would add:**

Two paths to evaluate:

1. **Split into C2-IC (chip) and C2-MOD (module).** New family ID for modules with its own logic table tuned for module-level specs: input voltage class, output voltage, output power rating, isolation voltage (if isolated), efficiency curve, MTBF, dimensions, mounting style (PCB pin / DIN rail / surface mount). Ingest classifier routes by MPN-prefix heuristic + presence/absence of chip-level params. Cross-family scoring blocked (chip ≠ module).

2. **Keep C2 unified but add a `form_factor` identity gate.** Adds `form_factor: 'chip' | 'module_pcb' | 'module_brick' | 'module_din'` as a new identity attribute. Hard gate on form-factor mismatch. Doesn't require schema split but requires every existing logic-table rule to be re-evaluated for module applicability (most won't apply to modules).

Option 1 is cleaner long-term; Option 2 is cheaper to ship.

**Why defer:**

- The 430 module rows aren't actively producing bad recommendations yet because the Triage AI Investigator's `wrong_family` bucket isn't currently surfacing them as cross-misclassified (they're labeled C2 in source data, so the AI agrees). The harm is silent: cross-scoring a module against a chip produces a recommendation that won't actually fit, but the user has no way to know until they try to source it.
- C2 isn't a top user-facing search target today (no current evidence of users hitting brick-vs-chip recommendation confusion).
- Building C2-MOD with its own logic table is a non-trivial design effort (new attribute IDs, new rules, dictionary additions).

**Trigger to flip from defer to ship:** if a user reports getting an inappropriate brick recommendation for a chip search (or vice versa), OR if module-MFR ingestion volume grows past ~1000 rows (cumulative across DELTA / CYNTEC / Hi-Link and any new module-shipping MFRs), OR if a similar split need emerges in another family (gate drivers, LDOs — both also have module-equivalent products).

**Related families likely to need the same split:** C1 LDOs (some MFRs ship LDO modules), C3 Gate Drivers (gate driver modules exist for high-power applications). If this becomes a pattern, lift to a project-wide "chip vs module" classifier with consistent semantics across families.

**Files involved:** new `lib/logicTables/c2ModuleSwitchingRegulator.ts` (if Option 1) OR additions to existing [lib/logicTables/switchingRegulator.ts](../lib/logicTables/switchingRegulator.ts) (if Option 2). New dictionary entries in [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) + [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) for module-side params. Ingest classifier extension in either case.

### Per-row research helper on the Atlas Unmapped Parameters table

Non-technical admins reviewing the unmapped-params panel often need to research what a parameter actually means before accepting (or overriding) the AI-suggested mapping — e.g. "PPAP" = Production Part Approval Process, "IFSM(A)" = Maximum Surge Forward Current, "ESD" = Electrostatic Discharge rating. Today they have to manually copy the param name into Google.

**Two options when implementing:**

1. **Web-search button** (small): per-row icon button → opens Google in a new tab with a context-rich query like `"<paramName>" "<familyShortName>" parameter datasheet meaning`. Family scoping is critical — bare "Type" / "ESD" Google searches return chaos. ~15 min, no backend, no AI cost. Reuses `getFamilyDisplayName()` helper already in [GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx).

2. **AI-explanation popover** (larger): per-row button → calls Claude Haiku with the param + family schema + sample values → returns 2-3 sentences explaining what the param likely means and whether the AI's suggested mapping is correct. Higher value for a non-technical user (does the synthesis for them) but requires a new endpoint, caching layer, popover UI, prompt engineering. Possibly extends the existing `/api/admin/atlas/dictionaries/suggest` endpoint with an optional `explain: true` mode.

Recommended path: ship (1) first — cheap and likely sufficient. If admins still struggle to interpret search results, follow up with (2). Plan was drafted but not implemented (deferred per user request).

**Files involved:** [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) for both options. (2) also touches [app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts).

### Lift claim-discipline rule into a global system-prompt block (Decision #166 follow-up)

The general claim-discipline rule ("every factual claim must have a backing source in tool data; otherwise downgrade to 'not in our profile' or hedge as interpretation") was codified inside the manufacturer-profile section. The same rule applies across all chat domains — recommendations, search-result interpretation, parametric Q&A, list agent. Currently each domain has its own discipline language (or none), which means future drift is likely. Lift the rule to a top-level "global rules" block at the start of `SYSTEM_PROMPT`, then have domain sections reference it instead of restating discipline. Watch other domains for the same per-shape patching anti-pattern that hit the MFR section. ~30 min, prompt-only.

### Audit other domains for per-shape patching drift (Decision #166)

Recommendations domain (`filter_recommendations` + `summarizeRecommendations`) and search-result interpretation (`present_part_options` + `summarizeSearchResults`) haven't yet accumulated per-question-type patches the way MFR did, but they're vulnerable. If users start asking "explain why this rec is on top" / "compare these two recs side by side" / "which countries have current trade tariffs?" the temptation will be to add per-question rules. Better: extend the global claim-discipline rule (above) and resist domain-specific patches unless a question shape clears the bar (a) implicit completeness requirement + (b) domain-knowledge-derived checklist. Periodic prompt audits (~quarterly) to catch drift early.

### Surface remaining Atlas profile fields through `mapAtlasToManufacturerProfile()` (Decision #166)

The mapper currently surfaces a subset of Atlas DB columns. After Decision #166 we added stockCode / websiteUrl / contactInfo / partsioName, but other fields are still dropped: `gaia_id`, `partsio_id`, `enabled`, `api_synced_at`, `core_products` (only used internally for productCategories fallback). Some of these may be useful for the LLM (api_synced_at as a freshness signal; partsio_id for cross-system linking) or for future UI panels. Low priority — surface on demand. Tradeoff: adding fields makes the projection bigger; keep optional and skip serialization when absent.

### Mechanical "claims you can make" tool-side output (Decision #166, deferred)

Architectural alternative to prompt-based claim discipline: `get_manufacturer_profile` could return a `verifiedFacts: Array<{ claim, sourceField, verbatim }>` shape that makes the agent literally unable to fabricate without obviously stepping outside structured output. Heavier engineering — requires per-field claim taxonomy and a code-side fact extractor. Worth considering if prompt-side discipline starts drifting again on smaller models or longer responses. Currently the prompt-side rule is sufficient with Sonnet/Opus. Deferred until evidence justifies the lift.

### Value-alias system follow-ups (Decision #160)

Phases 1, 2, and 3 (Inline "Propose alias" button) all shipped same session. 6 alias rules now active (polarization seed, MLCC C0G/NP0, D2 speed_class, 52 composition, C7 protocol, C9 architecture). Remaining work, in priority order:

1. **`package_case` formatting drift** — Digikey appends ` (NNNN Metric)` to EIA codes (`0603` ↔ `0603 (1608 Metric)`), recurs across many families. Cleaner fix: small enhancement to engine's `normalize()` to strip the parenthetical metric suffix on package values. NOT per-family aliases (doesn't scale across 43 families × ~20 EIA sizes). 8× hits in mining output on family 52, plus more on B5/B8.
2. **Mapper / param-map bugs surfaced by mining** (yellow-bucket pairs from `scripts/mine-identity-fails-output.csv`): `B1/configuration` "BRIDGE, 4 ELEMENTS" vs "Single Phase" (82×), `E1/output_transistor_type` (45×), `C7/operating_mode` "Full-Duplex" vs "LINE TRANSCEIVER" (28×) and "DIGITAL ISOLATOR" vs "INTERFACE CIRCUIT" (15×), `B8/package_case` 0603 appearing for thyristors (data quality — wrong source data), `C1/enable_pin` "Absent" vs "Current Limit". Wrong-field-mapping at the Digikey/Atlas mapper layer, not synonym problems. Triage by family.
3. **Re-mining cadence** — re-run `npx tsx scripts/mine-identity-fails.ts` every 4-8 weeks (or whenever logging volume jumps). Incremental discovery from ongoing usage. The script's filter step 5 already drops pairs covered by existing `valueAliases`, so re-runs only show new patterns. Lower priority than (1) and (2) since the inline "Propose alias" button now handles per-incident maintenance — re-mining is just a periodic safety net for patterns admins haven't proactively flagged.
4. **Optional: dashboard surfacing** — instead of waiting for admin to bump into a fail, surface "N new identity fails this week" as a small admin-home card with one-click into the propose-alias flow. Only build if (3) re-mining shows the inline-button path isn't keeping up.

### Side-by-side comparison panel — align section headers across panels

**Files:** `components/AttributesTabContent.tsx` (`OverviewContent`), `components/ComparisonView.tsx`, `components/AttributesPanel.tsx`

When viewing a source part next to a `Comparing With` replacement, the two panels render `OverviewContent` independently, so each section's height is driven by its own row count — Distribution might be 4 rows on the left and 1 on the right, sliding every header below it out of vertical sync. Make section headers (`Attributes`, `Distribution`, `Qualifications`, `Environmental & Export`) align horizontally across panels in comparison mode so the eye can move left-right between equivalent sections.

**Approach (deferred from session 2026-04-26):** extract a `<ComparisonOverview source repl />` parent that renders the two sides as a single section-by-section grid. For each section in fixed order, measure the taller side's row count and pad the shorter side with empty rows up to that height. Cross References stays last and source-only (already moved in this session) so it has no right-side counterpart. Two visually independent panels remain — only the layout coordination is shared.

**Open questions to settle before planning:**
1. Should the two panels scroll in lockstep when in comparison mode, or remain independently scrollable? (Independent scrolling breaks alignment as soon as one side moves.)
2. When a section is conditional on either side (e.g., source has Qualifications, replacement doesn't), always render both headers with "—" on the empty side, or skip on both? Predictability vs. visual sparsity.
3. Within-section row alignment is explicitly out of scope — only headers align. (User confirmed this is acceptable.)

The standalone source-part view (no replacement selected) keeps the existing `OverviewContent` layout — comparison reordering only kicks in when a replacement is selected.

### Cost-optimization follow-ups (Decision #156)

Phase 1 shipped `mapped:unitCost` auto-detection + `sys:priceDelta` (Repl. Savings) column. Natural extensions:

1. **Extended cost column** — `Unit Cost × Quantity` and `Repl. Price × Quantity`, plus a "total project savings" rollup. Requires the existing optional `qtyColumn` to be populated.
2. **Percentage savings** — `(unitCost − replacementPrice) / unitCost`. Useful for sorting by ROI rather than absolute dollars. Could ride on the existing `calc:*` infra now that `toNumber()` is exported, OR be a second built-in `sys:priceDeltaPct`.
3. **Cost-optimization view template preset** — ship a default master template tuned for cost reduction (Unit Cost + Repl. Price + Repl. Savings + Repl. Distributor + sort by savings). Surface it as a one-click "apply" in the view picker.
4. **Multi-currency reconciliation** — when the user's unit-cost currency differs from the replacement quote's currency, today the math runs blind. Need either FX conversion or an explicit warning/per-row currency tag.

### Qualification-domain Phase 2 — MFR classifier coverage (Decision #155)

Phase 1 shipped the qualification-domain filter for Murata MLCCs only. Non-Murata parts universally classify `unknown/no_classifier` today, rank below context-matched in automotive searches, and show the amber "Domain unknown — verify" chip. That's a deliberate ranking tier, not an exclusion — but every non-Murata BOM hits it, so Phase 2 classifier coverage is on the critical path.

**Prioritization:** Once Phase 1 is in prod for a week or two, query `recommendation_log.snapshot.domainStats.unknown.no_classifier` grouped by source MFR. Build the classifiers with the highest unknown hit count first. Initial guess at order (refine with telemetry):

1. **TDK** — CGA (AEC-Q200 automotive), C (commercial), CGJ (AEC-Q200 automotive high-CV), medical-spec CNC series
2. **Samsung Electro-Mechanics** — CL (AEC-Q200 automotive), CIH (implantable medical)
3. **Yageo** — AC (AEC-Q200 automotive), CC (commercial)
4. **KEMET** — C0G/X7R automotive vs commercial split, mil-spec (MIL-PRF-55681)
5. **AVX (now Kyocera AVX)** — Automotive X7R/NP0 series
6. **Kyocera** — MLCC automotive series
7. **Taiyo Yuden** — AMK (automotive), HMK (commercial)

**Files:** add `lib/services/classifiers/<mfr>Mlcc.ts` per MFR, register in `lib/services/qualificationDomain.ts:getClassifiers()`. No schema change — classifiers implement the existing `MfrClassifier` interface.

### Re-enable amber "unknown domain" chip once classifier coverage is high enough (Decision #155)

Phase 1 ships the `unknown`-domain chip in suppressed state — classification is still computed (drives sort tiebreak + QC telemetry) but the badge is not rendered. Reason: with only the Murata MLCC classifier registered, most candidates in a typical search classify unknown, so the chip fires everywhere and users learn to ignore it. The label "Domain unknown — verify" was also too vague — users couldn't tell what domain or what to verify.

**Re-enable criterion:** per-family classifier coverage ≥ ~50% non-unknown under the `automotive` context (query from `recommendation_log.snapshot.domainStats.unknown.*` grouped by family). Below that threshold the chip is noise; above it, the chip legitimately flags the minority of unclassified parts that need attention.

**Also rewrite the copy** before re-enabling — "Domain unknown — verify" is jargon. Candidates: "AEC status unverified for this part" / "Not confirmed AEC-Q200" / "Verification pending" — whichever reads best in the actual UI.

**Files:** single site — `domainBadge()` in [lib/services/qualificationDomain.ts](lib/services/qualificationDomain.ts) (currently returns `null` for the unknown branch).

### Qualification-domain Phase 2 — mechanism extensions (Decision #155)

After MFR coverage stabilizes, wire the remaining mechanism pieces:

1. **Remaining rows of the exclusion matrix** — medical/industrial/mil_spec/space contexts. Matrix shape is already commented in `qualificationDomain.ts`; just needs `isDomainCompatible` + `contextExpectedDomains` extension as family context questions surface those environments.
2. **Severity follow-up for automotive** — powertrain / safety-critical / infotainment / aftermarket. Refines which non-Q200 domains are tolerable as deviations (infotainment might accept commercial+warning; powertrain must not).
3. **Other families** — B1–B9 (AEC-Q101), C1–C10 (AEC-Q100), D1–D2, E1 (AEC-Q101 for optos), F1–F2. Same mechanism, per-family MFR classifiers.
4. **Per-query "strict AEC-Q200 only" user filter** — opt-in hard-mode that also excludes unknowns (makes Phase 1's ranking-tier behavior Option-2-like, as a user choice rather than system default).
5. **Datasheet-extraction classifier fallback** — reuse Atlas `descriptionExtractor` pattern to infer domain from datasheet text when no MPN-prefix rule matches. Cost/benefit depends on Phase 2 telemetry.

### Audit certified-cross bypass for safety-class filters (Decision #155)

Decision #133 bypasses 13 post-scoring family filters for MFR-certified and Accuris-certified crosses, on the principle that a human certification outranks our inferred blocking-rule rejection. Decision #155's qualification-domain filter runs **before** that bypass, which is correct for cross-domain substitution — but the 13 family filters themselves mix two kinds of constraints:

- **Safety-class** — e.g. F2 TRIAC-on-DC latch-up, C10 voltage/current output incompatibility, F1 AC/DC contact voltage, C7 protocol boundaries. These aren't preferences; they're physics. A certified cross that violates them is still unsafe.
- **Compatibility/preference** — e.g. C5 logic-function codes, C6 series-vs-shunt architecture. Certified crosses might legitimately pin-swap across these when the vendor has done the qualification work.

**Task:** audit each of the 13 filters in `lib/services/partDataService.ts` (C2, C4–C10, D1–D2, E1, F1–F2) and classify as safety-class or compatibility. Scope the certified-cross bypass to compatibility-only; safety-class filters should apply even to certified crosses. Likely requires splitting each `filter*Mismatches` into two predicates.

### Request-session memoization for qualification-domain classification (Decision #155)

`getRecommendations` currently memoizes classifier results per call in a `Map<mpn, DomainClassification>`. In batch parts-list validation, the same candidate MPNs frequently appear across source rows (e.g. the whole 0603/X7R/0.1 µF subspace dedups to a few dozen MFR series), so a session-scoped cache would avoid redundant classifier runs.

Low priority — classifier cost is microseconds today since it's pure-function MPN-prefix matching. Revisit when we add datasheet-extraction classifiers (LLM round-trip) in Phase 2+.

### ~~Wire Chinese-MFR aliases into hot lookup paths~~ COMPLETED

Shipped Apr 2026 (Decision #148). New [lib/services/manufacturerAliasResolver.ts](../lib/services/manufacturerAliasResolver.ts) exposes `resolveManufacturerAlias()` + `getAllManufacturerVariants()` with a 5-min cache over `atlas_manufacturers` (`name_display`, `name_en`, `name_zh`, `aliases[]`). Client-safe wrapper `manufacturerAliasClient.ts` proxies through `POST /api/manufacturer-aliases/canonicalize`. Forward-compat contract (`source: 'atlas' | 'western'`, reserved `companyUid`/`lineage`) so the Western follow-on is purely additive.

Wired into four hot paths: Atlas search (dual-query + dedup by id), BOM dedup pre-canonicalization in `usePartsListState`, AddPart mismatch suppression in `search-quick`, admin manufacturer aggregation (both list and per-slug products routes). Cache invalidated from the atlas/manufacturers toggle.

**Deferred (not shipped):** matching-engine preferred-MFR `includes()` check (lower ROI), xref lookup (MPN-only today, no MFR filter), Digikey/parts.io alias expansion (those catalogs don't know Chinese aliases).

### ~~Western MFR aliases — company-identity graph ingestion~~ COMPLETED

Shipped Apr 2026 (Decision #149). New tables `manufacturer_companies` (25,861 rows, parent-chain graph, status enum) + `manufacturer_aliases` (8,543 rows, 15-context taxonomy). Resolver extended with parent-walk + `acquired_by`/`merged_into` alias chain, variants union from all descendants, per-resolve `lineage`, corporate/active canonical collision policy. Full context in [docs/DECISIONS.md](DECISIONS.md) Decision #149.

### ~~BOM batch-validate MFR-aware match selection~~ COMPLETED

Shipped Apr 2026 (Decision #150). Closes the last alias-wiring gap: `app/api/parts-list/validate/route.ts` now uses `pickMfrAwareMatch()` (in new `lib/services/mfrMatchPicker.ts`) to prefer a search candidate whose MFR canonically matches the user's input over blind `matches[0]`. Falls through to existing behavior on any ambiguity (blank input, unresolvable input, no canonical match among candidates). +8 tests.

### ~~Admin alias editor — dedicated Aliases tab~~ COMPLETED

Shipped Apr 2026 (Decision #152). New "Aliases" tab on `/admin/manufacturers/[slug]` (sibling of Products / Flagged / Coverage / Cross-Refs / Profile, shows alias count in the label). Fully editable — click × on any chip to remove, type into the "Add alias" field + Enter to add. Optimistic saves, rollback on PATCH failure, immediate resolver cache invalidation so edits take effect without waiting out the 5-min TTL. New `normalizeAliasInput()` helper in [app/api/admin/manufacturers/[slug]/route.ts](../app/api/admin/manufacturers/[slug]/route.ts) validates shape (array of strings), caps length (50 entries, 100 chars each), dedupes case-insensitively, trims whitespace. +10 validation tests. Atlas only — Western `manufacturer_companies` / `manufacturer_aliases` editor remains deferred.

### Phase 2: Deep-fetch for `suggestionBuckets` shortfall (Decision #146)

Phase 1 shipped `maxSuggestions` (1–5) + `suggestionBuckets` multi-select as display-time filters over the persisted top-5 (`suggestedReplacement` + up to 4 `topNonFailingRecs`). If a row's persisted top-5 doesn't contain enough recs matching the user's selected buckets (e.g. user picks "5 Accuris-only" but the row's persisted set is 2 Accuris + 2 MFR + 1 Logic), the user sees fewer than max.

Phase 2 mirrors the existing `hideZeroStock` deep-fetch effect in `usePartsListState.ts`:
1. Detect rows where `filtered-persisted-subs.length < maxSuggestions - 1`.
2. Call `getRecommendations(mpn, priorities)` + `enrichWithFCBatch(top-30-mpns)` — same two-step pattern as the zero-stock deep-fetch (Decision #146 FC-enrichment fix).
3. Filter for selected buckets, promote to `topNonFailingRecs`, persist.
4. Guard with `scopeFetchAttemptedRef` to avoid infinite retry when the cohort genuinely lacks enough of the target bucket.

**Cost:** one `getRecommendations` + one `enrichWithFCBatch` per affected row, concurrency 2. Same budget profile as the zero-stock deep-fetch. Worth doing if users hit the shortfall in practice.

**File:** [hooks/usePartsListState.ts](hooks/usePartsListState.ts) — extend the existing deep-fetch effect pattern.

### Reconcile RecommendationsPanel "Accuris Certified" chip with list column (Decision #140)

After Decision #140, the parts-list column **Accuris Certified** counts parts.io only (`partsio_fff` / `partsio_functional`), while the modal's **Accuris Certified** chip still comes from the overlapping `deriveRecommendationCategories()` bucket which includes Mouser. A user clicking a count of `2` in the list column may see the drawer chip report `3`, with the extra rec being a Mouser suggestion.

**Options:**
- Rename the modal chip to "3rd Party Certified" and keep Mouser inside.
- Split Mouser into its own modal chip and keep "Accuris Certified" as parts.io-only in both places.

**File:** [components/RecommendationsPanel.tsx:99-106, 294-296](components/RecommendationsPanel.tsx#L99-L106).

### Atlas stats RPC (`get_manufacturer_product_stats`) hits Supabase statement timeout under load

The RPC that backs the admin Atlas MFRs page aggregates ~55K `atlas_products` rows via a `LATERAL jsonb_object_keys(...)` unnest ([scripts/supabase-mfr-stats-rpc.sql](scripts/supabase-mfr-stats-rpc.sql)). It intermittently times out — the UI-layer fix (route.ts) now serves last-known-good data with a stale warning instead of poisoned zeros, but the underlying query is still fragile.

**Options:**
- Materialized view of manufacturer-family counts + param-key arrays, refreshed by a pg_cron job or a trigger on `atlas_products`.
- Pre-aggregated `atlas_product_stats` table populated by ingest scripts (`atlas-ingest.mjs`) at write-time.
- Raise Supabase statement timeout for this RPC only (`ALTER FUNCTION ... SET statement_timeout = ...`).

**Why it matters:** Without a durable fix, admins keep seeing the stale banner even though the data is a few minutes old. Every ingest cycle grows `atlas_products`, so the timeout risk compounds.

### Precomputed coverage column on `atlas_products` (Decision #179 long-term)

Decision #179 moved coverage compute into a SQL RPC (`get_atlas_coverage_aggregates`) which still scans 71K rows × ~10–20 attribute-presence checks per scorable row. As `atlas_products` grows, this approaches the 300s `statement_timeout` ceiling we've already had to set. The structural fix is to precompute `coverage_attrs_count INT` (and optionally `coverage_attrs_total INT`) per product at ingest time — written by [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) using the same family→ruleAttrs map the route already knows. Coverage aggregation then collapses to `SUM(coverage_attrs_count)` with no JSONB iteration.

**Triggers:** RPC starts hitting the 300s limit, OR coverage compute becomes a hot path beyond just the admin page (e.g. a public-facing coverage badge).

**Cost:** schema migration + ingest-script change + one-time backfill script. Logic-table edits become trickier (rule-attr changes invalidate the precomputed values; need a per-family backfill).

### Pre-warm atlas-coverage cache after Proceed/Revert (Decision #179 follow-up)

Today [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) deletes the `admin_stats_cache` row keyed `'atlas-coverage'` on every successful Proceed / Revert. The next admin who hits the page pays the recompute (~3s post-RPC, was ~50s pre-RPC). Acceptable now, but pre-warming makes it free.

**Options:**
- HTTP callback from the script to `/api/admin/atlas?refresh=1` post-delete (needs a base URL + admin auth — awkward in dev/prod boundary).
- Duplicate the compute in a `.mjs` helper called inline (script blocks for 3s, but admins never wait).
- Schedule a Supabase pg_cron job that recomputes any cache key that's been NULL for >10s.

Deferred: the RPC already brought the bad case to acceptable. Revisit if admins start complaining about ingest-day Coverage page slowness.

### Multi-category override fan-out in inline Accept (Decision #178 follow-up)

When the same paramName appears under multiple L2 categories within a single MFR's batch (e.g. FMD's `工作电压(范围)` shows up in 52 Microcontroller products + 23 Memory products), the queue picks `dominantCategory = Microcontrollers` (highest count). An inline Accept scopes the override to Microcontrollers, leaving the Memory-classified products' params unmapped.

**Workaround used today (FMD):** one-shot script that clones every active override under category A to category B for the same MFR.

**Real fix:** when a row's product set spans >1 category with non-trivial counts (e.g. >5 products in each), surface this in the Accept UI — engineer chooses "scope to all observed categories" (creates N override rows) vs. "scope to dominant only" (current behavior). The route already has the per-category counts in `categoryCounts` (Decision #178); just need UI + multi-INSERT.

**Alternative, lower-effort:** lift truly cross-category Chinese params to `SHARED_PARAMS` in [atlasMapper.ts](../lib/services/atlasMapper.ts) + the mjs mirror. `工作电压`, `工作温度`, `存取时间`, `湿气敏感性等级` — these are inherently category-agnostic. One add to `SHARED_PARAMS` covers every L2 category at once. Caveat: `SHARED_PARAMS` isn't currently editable via the dict-overrides admin layer (the `dictFor()` heuristic in `loadAndApplyDictOverrides` steers `add` actions to L3/L2 buckets, not shared) — would need a dedicated "scope: shared" Accept path.

**Why both matter:** cross-category MFRs are common (MCU vendors ship MCUs + memory + companion analog). Without the fix, every multi-category MFR hits the FMD-style cleanup-script step.

### ~~L2 taxonomy: curated param maps for high-value non-xref categories~~ COMPLETED
**Status:** Done — Wave 1 (Decision #86) + Wave 2 (Decision #87)

14 L2 categories now have curated param maps in `digikeyParamMap.ts`:
- **Wave 1** (Decision #86): Microcontrollers, Memory, Sensors, Connectors, LEDs, Switches
- **Wave 2** (Decision #87): RF/Wireless, Power Supplies, Transformers, Filters, Processors, Audio, Battery Products (split: cells + charger ICs), Motors/Fans

**Intentionally skipped:** Cables/Wires (too heterogeneous), Development Tools (no meaningful shared parametrics). Both remain at L0.

**Remaining gap:** Parts.io param maps (`partsioParamMap.ts`) not yet added for L2 categories — currently Digikey-only.

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

### ~~Override audit history, revert & annotations~~ COMPLETED
**Status:** Done — Decision #101

Full audit trail for rule overrides: `previous_values` JSONB snapshot on every change, PATCH converted to deactivate-and-create (immutable history), history API with admin name resolution, version restore from any history entry. Plus admin annotation threads on rules (`rule_annotations` table) for pre-change discussion. LogicPanel shows red badge for rules with unresolved annotations. RuleOverrideDrawer has annotations section (auto-expands) and change history timeline with field-level diffs and restore buttons.

**Remaining:** Same pattern not yet applied to context overrides.

---

### ~~Atlas Explorer QC tool + L2 category dictionaries~~ COMPLETED
**Status:** Done — Decisions #102, #104

Atlas data QC tool: search Atlas products by MPN/manufacturer, click to view detail drawer with schema comparison (L3 from logic table rules, L2 from param maps), extra attributes, and raw parameters. L2 category dictionaries added for all 14 categories. `classifyAtlasCategory()` updated with c1 guards (Decision #104) to prevent cross-domain misclassification — fixed 598 L3 + ~935 L2 misclassified products. Skip list made dictionary-aware. Explorer search results now show coverage % column. Atlas Dictionaries admin section supports L2 categories.

**Remaining:**
- L2 sub-family param maps for optoelectronics: Laser Diodes, Photodiodes, IR Emitters have distinct parameter sets from standard LEDs. Coverage shows correctly low because no schema exists for these sub-types. Same pattern as Sensors split (Decision #88).
- Gaia dictionary refinement: Gaia-extracted duplicate stems (`rdc_max`, `ir_max_ma`, `l_100khz_0_1v`, `e`) should be mapped to canonical attributeIds in the Gaia dictionaries so they merge with dictionary-mapped attributes rather than appearing as unrecognized extras.
- Plain English alias expansion for MFR-specific param names (~1,327 names like `RDS(ON) @10VTyp (mΩ)`) — Phase 2.

---

### Override preview: show scoring impact before saving
**Files:** `components/admin/RuleOverrideDrawer.tsx`

Currently admins save overrides blindly — they can't see how a weight or logicType change would affect scoring for a specific part before publishing. A "preview" mode that re-runs scoring with the proposed override and shows the delta would be very valuable.

---

### QC feedback → override workflow
**Files:** `components/admin/QcFeedbackDetailView.tsx`, `components/admin/RuleOverrideDrawer.tsx`

When an admin reviews QC feedback flagging a specific rule, there should be a direct "Create Override" button that pre-fills the RuleOverrideDrawer with the flagged rule's family and attributeId. Currently the admin must navigate to the Logic section manually.

---

### Reverse cross-reference resolution is slow for popular xref targets
**Files:** `lib/services/partDataService.ts`, `lib/services/manufacturerCrossRefService.ts`

After Decision #133, searching an MPN that appears as `xref_mpn` in many uploaded rows (e.g., 3PEAK's TPW4157 → 136 TI parts) triggers serial `getAttributes()` resolution per matched row. Observed ~17s on the xref-resolution step alone, ~25s total cold-compute. Subsequent searches hit the 30-day L2 recs cache and are instant, but the cold path is poor UX. User explicitly declined capping reverse matches because each is a manufacturer-certified option. Options: (1) pre-resolve reverse xrefs at cross-ref upload time and cache the resolved `PartAttributes` in Supabase; (2) introduce a batch Digikey/Atlas lookup that accepts N MPNs in a single request; (3) resolve reverse xrefs lazily (show certified MPNs as "resolving…" placeholders and stream in as they land).

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

### Applied batch cards — show "currently unresolved" alongside frozen historical unmapped count (May 19, 2026)

Applied batch cards in AtlasIngestPanel today show the unmappedParams count frozen at apply time. After an engineer accepts dict overrides that resolve some of those params, the frozen card count doesn't update — even though the live Triage queue (computed against current overrides per Decision #180) correctly excludes the now-resolved rows.

Result: cognitive dissonance. Operator looks at a NOVOSENSE Applied batch showing "50 unmapped" but the Triage queue shows fewer. They're both correct but measure different things (historical-at-apply vs currently-unresolved).

**What this would add:** on each Applied batch card, render BOTH counts side-by-side:
- "50 unmapped at apply" (historical, what was frozen — same as today)
- "12 currently unresolved" (live, computed from frozen unmapped list filtered by current `atlas_dictionary_overrides`)

The live count is already computed by the queue route's override-filter logic; just needs to be aggregated per-batch and surfaced on the card. Or batch-card consumers can call a new per-batch endpoint that does the same filter scoped to one batch.

Effort: ~1-2h. Pure UX clarity; no data model change.

**Triggers that flip from defer to ship:**
- Operator asks "why does the card say 50 but the queue total moved less than that when I cleared the family?"
- Operators routinely use the per-card count to drive prioritization decisions and the staleness misleads them.

### Atlas stats RPC scales poorly past ~70K products (Decision #174 follow-up)
**Files:** `scripts/supabase-mfr-stats-rpc.sql`, `scripts/atlas-ingest.mjs`.

`get_manufacturer_product_stats()` unnests every JSONB key across all scorable `atlas_products` rows (~500K key-rows after YANGJIE), then `ARRAY_AGG(DISTINCT k)`s per (manufacturer, family_id). This blew past Supabase's default 8s `statement_timeout` once YANGJIE's 12,932 rows landed. Workaround applied: function-scoped `SET statement_timeout = '60s'`.

Long-term fix: precompute `param_keys` on ingest. Either (a) maintain a `manufacturer_family_param_keys` aggregate table updated by the proceed flow, or (b) materialize a view refreshed nightly. The route's `mfrCoverage` math only needs the union of keys per (mfr, family_id) — that aggregate is small (~5K rows for our taxonomy) and stable per ingest.

Trigger: revisit when atlas_products crosses ~150K rows or when the 60s timeout starts hitting on cold cache.

---

### Atlas SCR/Modules classifier excludes thyristor module families (Decision #174 follow-up)
**File:** `scripts/atlas-ingest.mjs` (line 124, `classifyAtlasCategory`).

The SCR matcher uses `if (/\bscr\b/i.test(lower) && !lower.includes('module'))` — the explicit "module" exclusion was originally added to avoid mis-routing module-style products to the bare-die thyristor logic table. As a side effect, 316 YANGJIE thyristor modules ("SCR Modules", "TRIAC Modules") fall through to the uncovered bucket and get no family_id, so they're search-only and never appear as recommendation candidates.

Fix needs: either (a) decide modules ARE B8 candidates with a module-aware MPN enrichment / housing rule, or (b) introduce a `B8m` variant family for module-packaged thyristors. Both options need spec-doc work before code.

---

### C2 Switching Regulators — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/switchingRegulator.ts`

Of 22 logic table rules, the following have no Digikey parametric mapping: `control_mode`, `compensation_type`, `ton_min`, `gate_drive_current`, `ocp_mode`, `soft_start`, `enable_uvlo`, `rth_ja`, `tj_max`, `aec_q100` (controllers only — integrated has "Qualification"). These are typically datasheet-only specs. Integrated-switch parts have ~50% weight coverage; controller-only parts have ~40%.

**Parts.io partial fill (Decision #77):** `control_mode` now filled from parts.io "Control Mode" field (+9 weight). `compensation_type`, `ton_min`, `gate_drive_current` still datasheet-only.

Key data gaps: No way to distinguish control modes (PCM vs VM vs hysteretic) from Digikey parametric data. No COMP pin presence/type field. No gate drive current for controller-only designs. "Voltage - Output (Min/Fixed)" is mapped to `vref` but is actually the minimum adjustable output voltage for adjustable parts — not exactly the reference voltage (close but not identical for parts with non-unity gain internal dividers).

---

### C3 Gate Drivers — datasheet-only fields have no Digikey parametric data
**Files:** `lib/services/digikeyParamMap.ts`, `lib/logicTables/gateDriver.ts`

Of 20 logic table rules, the following have no Digikey parametric mapping: `dead_time_control`, `dead_time`, `shutdown_enable` (polarity), `fault_reporting`, `rth_ja`, `tj_max`. Non-isolated "Gate Drivers" category has no propagation delay field; isolated "Isolators - Gate Drivers" has no bootstrap-related fields. Compound fields require 5 transformers (peak source/sink, logic threshold, propagation delay, rise/fall time). `isolation_type` enriched from Digikey category name (non-isolated → "Non-Isolated (Bootstrap)"). `driver_configuration` enriched from "Number of Channels"/"Number of Drivers" for isolated drivers. AEC-Q100 available via "Qualification" for isolated drivers only (not for non-isolated "Gate Drivers" category). ~45-50% weight coverage overall.

**Parts.io partial fill (Decisions #77, #103):** `output_polarity` (w9) and `peak_sink_current` (w8) now mapped from parts.io extras (+17 weight). `dead_time_control`, `dead_time`, timing specs still datasheet-only.

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

### Recommendation pipeline — further performance opportunities
**Files:** `lib/services/partDataService.ts`, `hooks/useAppState.ts`

Decision #98 reduced recommendation latency from 15-30s to ~5-8s. Decision #99 added persistent L2 cache (Supabase-backed) for cross-user, cross-session caching. Decision #128 added a recommendations-level L2 cache (30-day TTL, cross-user, admin-write invalidation) and fixed a sticky search cache bypass regression. Decision #163 (Apr 2026) added three more cuts: MFR alias L2 cache, recs base-payload cache split (context changes hit a base cache instead of full pipeline rerun), and deferred parts.io candidate enrichment for single-part flow. Remaining opportunities:
- ~~**Request coalescing**: If two users search the same MPN within 5s, share results.~~ Largely addressed by L2 cache — second request hits Supabase instead of live API.
- **Override cache TTL**: Supabase override fetches use 60s TTL. Overrides rarely change — could extend to 5 minutes with invalidation on admin writes.
- ~~**Score-first parts.io enrichment**~~ RESOLVED (Decision #163) — single-part flow now scores on Digikey-only data first, parts.io enrichment runs in background and replaces recs in place. Mirrors the FC deferred-enrichment pattern.
- **Parallelize MFR origin tagging with scoring**: `partDataService.ts:1108-1115` resolves unique candidate MFRs sequentially after `findReplacements()`. Could overlap with scoring (CPU-bound) since alias resolution is network-bound. ~150-400ms cold-cache savings. Cheaper now after Decision #163 Fix 1 dropped alias resolution to ~30-60ms cold but still worth doing.
- **Batch MFR cross-ref attribute fetches**: `partDataService.ts:1003-1023` calls `getAttributes()` per xref MPN inside `Promise.all`. For MFRs with large cross-ref tables (e.g., 3PEAK TPW4157 → 136 TI parts), this is 2-5s cold. Could batch by source. See "Reverse cross-reference resolution is slow" item above for the upload-time pre-resolve alternative.
- **Worker thread scoring**: Matching engine is CPU-bound single-threaded. Node.js `worker_threads` could parallelize candidate evaluation for families with many rules (C4: 24 rules, E1: 23 rules).
- **L2 cache admin UI panel**: Cache stats are exposed via `/api/admin/cache` (GET) and data-sources endpoint. Could add a visual panel in the admin section showing cache size, hit rates, and purge controls.
- **Periodic cache cleanup**: Expired rows accumulate in `part_data_cache`. Could add a Supabase pg_cron or external cron to call `purgeExpired()` daily. Not critical for correctness (reads check TTL) but prevents table bloat.
- ~~**Defer source-part Mouser enrichment**~~ RESOLVED — FindChips API (Decision #131) is ~60-200ms, fast enough to await in the critical path. No longer a performance bottleneck.

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
**Status:** Partially done (Decisions #66, #67, #68, #69, #100, #112, #114)
**Priority:** P2

Atlas product database integrated: 115 manufacturers, 54,746 products ingested into Supabase `atlas_products` table (37,719 scorable). Parallel search + candidate fetch working. Admin panel for ingestion monitoring built with sortable columns and full manufacturer expansion (scorable + non-scorable products). Per-family Chinese→English parameter translation dictionaries added for all 28 families (Decision #67). Gaia datasheet-extracted parameter mapping added (Decision #100) — 12 family gaia dictionaries covering B1/B3/B4/B5/B6/B7/B8/C1/C2/C4/D1/71. Example: YFW rectifier diodes went from 1 mapped param to 10; MOSFETs from 1 to 17-18. Atlas Dictionary admin panel built with Supabase-backed override layer (Decision #68). Coverage analytics with per-family gap analysis drawer (Decision #69) — now shows PIO column alongside Atlas/Dict/DK (Decision #103). LLM description extraction (Decision #112) — Claude Haiku extracts structured attributes from product descriptions with quote grounding anti-hallucination; runs automatically post-ingest; ~12,510 products eligible, estimated +8pp coverage improvement. Description cleanup + display fixes (Decision #114) — raw descriptions rewritten into standardized one-liners via Haiku (`clean_description` column), AEC qualification badges populated from extracted parameters, Risk & Compliance source attribution fixed for Atlas parts.

**Completed (2026-04-02):**
- ~~Manufacturer profile admin pages~~ — `atlas_manufacturers` table (1,011 records), admin detail pages at `/admin/manufacturers/[slug]` with 5 tabs (Products, Flagged, Coverage, Cross-Refs, Profile), `ManufacturersPanel` with search + flagged tabs
- ~~Atlas manufacturer identity table~~ — `atlas_manufacturers` canonical identity with slug, name_en, name_zh, name_display, aliases, partsio_id/name, JSONB profile columns. Import via `scripts/atlas-manufacturers-import.mjs`
- ~~Admin nav restructuring for manufacturers~~ — Manufacturers section in admin sidebar with list + detail sub-routes via shared admin layout
- ~~Product flagging for Atlas products~~ — `atlas_product_flags` table, flag button in search results and manufacturer Products tab, flagged tab on ManufacturersPanel and per-MFR detail page

**Remaining:**
- Connect `atlas_manufacturers` to user-facing ManufacturerProfilePanel (replace mock data in `mockManufacturerData.ts`)
- ~~Cross-References tab: implement manufacturer-certified replacement upload + injection into recommendation pipeline~~ DONE (Decision #122) — upload zone + column mapping + paginated table + pipeline integration + recommendation categorization (Logic Driven / MFR Certified / 3rd Party)
- Atlas product flagging: add server-side filtering by manufacturer to flags API (currently client-side)
- ~~Atlas description cleanup~~ DONE
- ~~Phase 2 English param expansion~~ DONE — added ~150 English MFR-specific format entries to TS dictionaries (atlasMapper.ts) + gaia dicts (atlas-gaia-dicts.json). +55 rule mappings across 16 manufacturer/family combos (Convert, CREATEK, 3PEAK, TECH PUBLIC, MingDa)
- Separate applications from Atlas descriptions (Decision #124) — add `applications` column, batch script to split existing `clean_description` via Haiku, update cleanup prompt, show in Explorer Drawer. ~55K products, ~30-40 min implementation
- Atlas badge in `PartsListTable` "Top Suggestion" column (from Phase 6 remaining)

**Key files:** `lib/services/atlasClient.ts`, `lib/services/atlasMapper.ts`, `lib/services/atlasGaiaDictionaries.ts`, `lib/services/atlas-gaia-dicts.json`, `lib/services/atlasDictOverrides.ts`, `lib/types.ts`, `components/ManufacturerProfilePanel.tsx`, `components/admin/AtlasDictionaryPanel.tsx`, `components/admin/AtlasCoverageDrawer.tsx`, `components/admin/ManufacturersPanel.tsx`, `components/admin/ManufacturerDetailPage.tsx`, `scripts/atlas-ingest.mjs`, `scripts/atlas-manufacturers-import.mjs`

---

### ~~Phase 8: Commercial Data Enrichment (Multi-Supplier)~~ MOSTLY COMPLETED
**Status:** FindChips API replaces Mouser (Decision #131); covers ~80 distributors including LCSC, Arrow, Farnell, RS. Mouser retained for SuggestedReplacement only.
**Priority:** P3

~~Integrate pricing enrichment API.~~ Done — FindChips (FC) API integrated as multi-distributor aggregator (Decision #131). Single API call returns pricing/stock/lifecycle from ~80 distributors. `findchipsClient.ts` with 3-level cache, `findchipsMapper.ts` with distributor name normalization. Commercial tab shows N distributor cards (top 5 expanded + collapse). Risk scores (designRisk, productionRisk, longTermRisk) from FC are new unique data. Chinese distributor coverage (LCSC) provides purchase paths for Atlas components.

**Remaining:**
- Customer negotiated pricing overlays
- ComparisonView multi-supplier pricing table (Phase 3C — side-by-side pricing comparison in xref detail view)
- "Commercial" view template with best price/stock columns pre-configured
- Lifecycle status reconciliation (worst-status-wins across FindChips, Parts.io)
- BOM quantity-aware pricing (Decision #121 Phase 2): qty column auto-detection in `excelParser.ts`, `mapped:quantity` / `rawQuantity` on `PartsListRow`, effective price lookup per supplier tier, extended cost columns in parts list table
- RS Components direct API integration (pending product search API from RS contact — see reference memory)
- ~~Distributor click tracking~~ Done (Decision #132). Client-side fire-and-forget logging of distributor link clicks. Admin view in QC section with filters/search/sort.

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

### Part Type: List agent tool awareness (Decision #129)
**Status:** Not started
**Priority:** P2

List agent tools (`get_list_summary`, `query_list`, `get_row_detail`) should include `partType` in their responses so the agent can answer questions about non-electronic items and filter by type.

### Part Type: Auto-detection from description keywords (Decision #129)
**Status:** Not started
**Priority:** P3

Heuristic detection of non-electronic parts from description text (e.g., "heatsink", "standoff", "enclosure" → mechanical; "PCB", "bare board" → pcb). Would reduce manual tagging on upload.

### ~~View templates: Supabase persistence for multi-device / org sharing (Decision #130)~~ COMPLETED
**Status:** Completed

Master views now stored in Supabase `view_templates` table (user-scoped). localStorage templates migrated on first load. Future: expand to org-level sharing when company model is built.

### ~~Matching-engine preferred-MFR filter should use alias resolver~~ COMPLETED

Shipped Apr 2026 (Decision #151). `isPreferredManufacturer()` now accepts an optional `manufacturerSlugLookup: Map<string, string>` for canonical-slug comparison; `partDataService.getRecommendations()` pre-resolves preferred + candidate MFRs and passes the lookup in. Substring fallback preserved for non-resolving inputs. +5 tests in `matchingEngine.test.ts`.

### Xref lookup could filter by manufacturer
**Status:** Not started
**Priority:** P2
**File:** [lib/services/manufacturerCrossRefService.ts](../lib/services/manufacturerCrossRefService.ts)

`fetchManufacturerCrossRefs()` today matches on MPN alone. If a customer ever uploads cross-refs with an `original_manufacturer` column + two different MFRs ship the same MPN string, we'd conflate them. Adding a `resolveManufacturerAlias()`-based filter would disambiguate. Not a current bug (xrefs aren't dense enough for collisions yet), just preemptive. Deferred from Decision #148.

### Triage AI suggester: per-MFR batch call instead of per-row (Decision #181)
**Status:** Not started
**Priority:** P3
**File:** [app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts)

Per-row Sonnet calls work but are expensive (~$0.005 × 100 rows = $0.50/MFR). One Sonnet call per MFR analyzing ALL unmapped params at once would be cheaper amortized AND would let Claude spot patterns across rows ("these 3 params form a series-spec cluster"). Higher risk of the model dropping rows in a long response — would need explicit row-count validation. Revisit if per-row cost becomes painful in regular use.

### Triage AI suggester: cross-scope canonical lookup (Decision #181)
**Status:** Not started
**Priority:** P3
**File:** [app/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts)

`fetchAcceptedCanonicals(familyId)` only returns overrides scoped to the row's own family/category. Missed case: a generic Connectors L2 row needs `male/female` mapping; `gender` already exists as a canonical in modular-connectors L2 but the suggester can't see it. Should consider the full graph of accepted canonicals across related families/categories. Tricky because "related" needs definition — could start with shared-parent relationships or just include all overrides as context.

### Triage AI suggester: sample-value-aware concept similarity (Decision #181)
**Status:** Not started
**Priority:** P3

Currently the suggester sees paramName + sample values but doesn't reason about whether the sample VALUES are consistent with existing canonicals. E.g., if `wire_gauge` exists with samples `["18 AWG", "20 AWG"]` and the new row has samples `["1.5 mm²", "2.5 mm²"]`, the suggester should recognize the unit mismatch and propose `wire_csa_mm2` instead of suggesting reuse. Currently happens by accident in the prompt, not deterministically.

### Atlas-derived series-compatibility cross-references (Decision #181)
**Status:** Not started
**Priority:** P2

When the suggester proposes `compatible_series` for params like `参考系列` (series reference, e.g. "compatible with XYZ123 series"), the value text is a stable cross-reference signal. Could promote these to first-class cross-ref candidates in the recommendation engine — same shape as `manufacturer_cross_references` (Decision #122). Would need a parser to extract series names from the param value strings. Underused signal currently buried in dictionary overrides.

### L2 category override: multi-category fan-out (Decisions #178, #181)
**Status:** Not started
**Priority:** P3
**File:** [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs)

When a single MFR ships products in two L2 categories with overlapping Chinese param names (the FMD case — MCUs + Memory share several param names), the override is scoped to the dominant category only. Products in the secondary category surface as still-unmapped on next regen. Workarounds: clone overrides to the secondary category manually, or lift the param to `SHARED_PARAMS`. Long-term fix: when the secondary category's count is non-trivial (say >10% of dominant), automatically clone the override to that category too. Or surface a "this param applies to N categories — accept for all?" prompt at Accept time.

### Triage compute: precomputed `unmapped_params_summary` table (Decision #180)
**Status:** Not started
**Priority:** P3

The `get_triage_unmapped_aggregate` RPC walks every pending+applied batch's `report->'unmappedParams'` JSONB array on every cold cache miss. Currently fast enough (~2-3s) but scales linearly with batch count. Long-term, ingest writes a denormalized `unmapped_params_summary` table at apply time; the route reads from it directly (no JSONB iteration). Mirrors the `coverage_attrs_count` precomputed-column suggestion in Decision #179. Defer until cold-load times drift past ~10s as batches accumulate.

---

## Multi-Tenant SaaS — Compliance Roadmap

Process, certification, and policy items spun out of the multi-tenant rebuild plan (`~/.claude/plans/the-application-needs-shimmying-planet.md`). These are **not engineering tasks** — they're paperwork, audits, and external services that unlock enterprise revenue. Architecture-level security foundations (audit log, RLS, MFA, tenant-isolation CI, etc.) are tracked in Phase 1.5 of the plan, not here.

Each item lists its trigger condition. Don't start any of these before the trigger fires — they cost money and lead time.

### SOC 2 Type II (via Vanta or Drata)
**Status:** Not started
**Priority:** P1 once triggered
**Cost:** $30–100k + audit fees
**Lead time:** 6–12 months
**Trigger:** First serious enterprise deal signal (>$50k ACV prospect requests it).

Unlocks every enterprise deal above ~$50k ACV. Vanta/Drata reduce the lift by automating evidence collection. Start scoping policies and procedures as soon as we have a confirmed deal in the pipeline so audit-ready state can land before contract signature.

### ISO 27001
**Status:** Not started
**Priority:** P2 once triggered
**Cost:** $20–50k
**Lead time:** 9–18 months
**Trigger:** EU enterprise pipeline.

International equivalent of SOC 2; often paired. Usually requested instead of SOC 2 by European buyers.

### GDPR DPA + subprocessor list
**Status:** Not started
**Priority:** P1 once triggered
**Cost:** $2–5k legal
**Lead time:** 2–4 weeks
**Trigger:** First EU customer conversation.

Legal template (Data Processing Agreement) + a public page at `xqatlas.com/trust/subprocessors`. Subprocessor list is already inventoried in `docs/SECURITY_DATA_INVENTORY.md` (Phase 1.5 deliverable).

### CCPA notice
**Status:** Not started
**Priority:** P2 once triggered
**Cost:** Covered by GDPR posture
**Lead time:** 1 week
**Trigger:** Same as GDPR — usually rolls into the same trust-page work.

### Annual external pen test
**Status:** Not started
**Priority:** P1 once triggered
**Cost:** $10–30k
**Lead time:** 2–4 weeks
**Trigger:** After Phase 3 ships.

Hire a reputable firm (NCC, Bishop Fox, Trail of Bits, Cobalt) to run a black-box + grey-box test. Report becomes a sales asset.

### Bug bounty program (private HackerOne)
**Status:** Not started
**Priority:** P2 once triggered
**Cost:** $5–20k/yr in payouts
**Lead time:** 2 weeks setup
**Trigger:** After SOC 2 lands.

Start private (invite-only). Public after a year of clean disclosures.

### Cyber liability insurance
**Status:** Not started
**Priority:** P1 once triggered
**Cost:** $5–15k/yr
**Lead time:** 2–4 weeks
**Trigger:** First $100k+ contract — buyer will ask for the certificate.

### Trust center page — `xqatlas.com/trust`
**Status:** Not started
**Priority:** P1
**Cost:** Internal time
**Lead time:** 1 week
**Trigger:** Ship alongside Phase 3.

Single public page covering: subprocessors, encryption posture (TLS 1.2+, TDE at rest), authentication options (SSO/MFA/password), data residency, audit-log retention, tenant isolation explanation + diagram, compliance status (SOC 2 in progress / completed), vulnerability disclosure email, link to status page. Closes deals faster than any feature — procurement reads it before scheduling a call.

### Public status page
**Status:** Not started
**Priority:** P1
**Cost:** $25–100/month (StatusPage, Better Stack, or self-hosted Uptime Kuma)
**Lead time:** 1 day
**Trigger:** Ship alongside Phase 3.

Uptime monitoring + incident history. Looks professional, cheap.

### SSO / SAML
**Status:** Not started
**Priority:** P1 once triggered
**Cost:** Supabase Pro upgrade + 2–3 weeks dev time
**Lead time:** 2–3 weeks
**Trigger:** First enterprise deal that requires it.

Bundle into "Enterprise" license tier. Supabase Pro supports SAML 2.0 natively.

### SCIM provisioning (Okta / Azure AD / Google Workspace)
**Status:** Not started
**Priority:** P2 once triggered
**Cost:** Custom build, 4–6 weeks dev time
**Lead time:** 4–6 weeks
**Trigger:** Same as SSO — large-org requirement.

Auto-provision and deprovision users from the customer's identity provider.

### IP allowlisting (per-org CIDR list at middleware)
**Status:** Not started
**Priority:** P2 once triggered
**Cost:** Internal time
**Lead time:** 1 week
**Trigger:** Enterprise tier requirement.

`orgs.allowed_ip_ranges TEXT[]` column + middleware check. Rejects requests outside the org's CIDR list.

### ITAR / EAR posture statement
**Status:** Not started
**Priority:** P1 once triggered
**Cost:** $2–5k legal review
**Lead time:** 2 weeks
**Trigger:** First defense or aerospace prospect.

One-page legal doc stating that XQ Atlas stores public parametric data (MPNs, specs, datasheets) and does not store ITAR-controlled technical data. Customer BOMs are tenant-isolated and never analyzed cross-tenant. Most electronics platforms don't have this — having it wins deals.

### Quarterly security review process
**Status:** Not started
**Priority:** P2
**Cost:** Internal time
**Lead time:** 1 day to set up
**Trigger:** Now — schedule the recurring review.

Internal policy doc + calendar cadence: review audit logs for anomalies, rotate keys, confirm backups restore cleanly, review access reviews on profiles + api_keys.

### Vendor risk assessment template for customers
**Status:** Not started
**Priority:** P2
**Cost:** Internal time
**Lead time:** 1 week
**Trigger:** First questionnaire received.

Pre-fill the common SIG Lite / CAIQ questions so we can respond same-day instead of re-typing each time.

### Incident response plan + breach notification SLA
**Status:** Not started
**Priority:** P1
**Cost:** Internal time + legal review
**Lead time:** 2 weeks
**Trigger:** Before SOC 2 audit.

72-hour breach notification SLA (GDPR Article 33). Runbook for containment, eradication, recovery, customer comms. Tabletop exercise once written.

### Backup / DR runbook
**Status:** Not started
**Priority:** P1
**Cost:** Internal time
**Lead time:** 1 week
**Trigger:** Before SOC 2 audit.

RPO / RTO targets documented. Quarterly restore test — actually restore a backup to a staging project and confirm app boots against it.

**Bundling strategy:** SSO/SAML + SCIM + IP allowlisting + custom SLA make up the future "Enterprise" license tier. Mid-market gets the Phase 1.5 baseline (audit log, MFA flag, tenant isolation tests, session timeout, no-training assertion). Trust page + status page + SOC 2 are unconditional — they sell every deal above $25k ACV.
