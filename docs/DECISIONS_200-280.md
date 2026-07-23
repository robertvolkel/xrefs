# Architectural Decisions — Archive (Decisions 200–280)

> Full text of decisions 200–280. The index lives in [docs/DECISIONS.md](DECISIONS.md).
> Historical record — some entries here are superseded by later decisions.

## Decision #200 — Coverage Repair Workflow: Matching Impact + Per-MFR Drilldown + One-Click Backfill (May 23, 2026)

### Context

May 23 session: user accepted ~150 overrides in a focused Triage session, ran the new backfill from Decision #199, and noticed SWST still sitting at 15% coverage. Investigation surfaced multiple gaps that turned "is coverage low because the data's thin?" into "is coverage low because of broken workflow signal?"

Three failures the existing Triage UI didn't address:

1. **No impact prioritisation.** Triage rows are surfaced by global volume rollup but the queue doesn't tell the engineer which accepts would actually move matching quality vs which are display-only. A high-volume row mapped to a satellite attr (`_vbr_max`) looks identical to one mapped to a blocking gate (`vrwm`). Engineers default to working top-to-bottom and miss the leverage.
2. **No per-MFR drilldown.** Engineer sees "SWST: 15% coverage" in Atlas MFRs panel. Mental cross-reference to "which pending Triage rows would lift it?" is manual — requires opening the Triage queue, scrolling, scanning for SWST in `affectedManufacturers` lists, etc. The two views don't talk to each other.
3. **No one-click backfill.** Decision #199's `npm run atlas:backfill` is the right script, but typing it in a terminal between Triage sessions adds friction. Coverage % visibly lags every accept session until the engineer remembers to run it.

### Decision

Ship a three-part Coverage Repair workflow that closes the loop:

**Part 1 — Matching Impact score on every Triage row.**

Server (`/api/admin/atlas/ingest/batches`) computes `matchingImpact` per row after the override-annotation pass: `score = productCount × weight`, where `weight` is the destination attribute's rule weight in the dominantFamily's logic table (0 = display-only / satellite / not in logic table, 10 = blocking gate). For accepted rows, weight is looked up exactly (`isEstimate=false`). For pending rows without acceptedOverride, weight defaults to 7 (medium-high — `isEstimate=true` for the dashed-border UI hint).

Triage UI ([components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx)) renders an `ImpactChip` column with tiered colours (🔥 red ≥50k, 🟠 orange ≥10k, 🟡 yellow ≥1k, ⚪ grey <1k, "—" for display-only). Tooltip shows `productCount × weight (→ canonical)` + the estimate disclaimer. **Sort by impact desc is now the default ordering** for every Triage view — engineers see the highest-leverage pending accepts at the top automatically.

**Part 2 — Per-MFR drilldown from Atlas MFRs panel.**

Each MFR row in [components/admin/ManufacturersPanel.tsx](../components/admin/ManufacturersPanel.tsx) (the live component — `AtlasPanel.tsx` is dead code; got it wrong the first time) carries a small 🔧 wrench icon next to its coverage %. Click → navigates to `/admin?section=atlas-dict-triage&mfr=<slug>`. The Triage panel reads the `?mfr=` query param on mount and pre-applies it as an MFR filter (one-shot — doesn't write back on subsequent user filter changes).

Empty-state handling for the drilldown: when the only active filter is a single MFR slug and the filtered result is empty, render a green success banner — "No pending unmapped params for {MFR}. With current dictionary overrides, every param this MFR ships is already mapped to a canonical attribute." — instead of the generic "no params match" message. Otherwise an MFR with zero queue presence (like CCTC, 1 product, fully mapped) looks broken when it's actually correct.

**Part 3 — One-click backfill from Atlas MFRs panel header.**

`POST /api/admin/atlas/backfill-translations` spawns `node scripts/atlas-ingest.mjs --backfill-translations` as a detached child process (mirroring the existing ingest/report pattern). Returns 202 immediately. Status (started/finished/scanned/changed/errors) persisted in `admin_stats_cache` row keyed `'atlas-backfill-status'`. `GET` on the same path reads the status row. The status row IS the lock — concurrent POST during in-flight returns 409. Stale-lock guard auto-clears after 10 min so a crashed run doesn't strand the button.

UI: new "Refresh from accepts" button in [components/admin/ManufacturersPanel.tsx](../components/admin/ManufacturersPanel.tsx) header. Inline status badge ("Backfill 23m ago · 37,514 changed") shown when there's any history. Click → toast "Backfill started — coverage will update in ~5 min" → button switches to "Backfilling…" disabled → polls status every 10s → on completion auto-refreshes the MFR list so coverage % updates visibly.

### Why not the alternatives

**Per-accept auto-backfill** (rejected): each backfill is ~5 min × 198K-product scan. 150 accepts in today's session would have been ~12 hours of compute + race conditions on `atlas_products` writes. Scoped per-accept (only the products with that raw key) is faster but still 30s-2min per accept and adds latency to every Accept click. The burst-session pattern fits a manual button better than per-accept triggers.

**Per-Proceed auto-backfill** (deferred): coherent with the engineer mental model ("apply the batch, then apply its accepts") but Proceed is already an attention-cost operation. Adding ~5 min on top would degrade ingest UX. Revisit after we see how the manual button gets used.

**Nightly cron** (BACKLOG): right answer if button usage settles into daily-or-more cadence. Cheap to add (~1 line of platform config). Deferred from ship so we can see real usage first.

**Override-aware coverage RPC** (rejected per Decision #199): would have shown overrides translating keys at query time, but the matching engine reads `atlas_products.parameters` as-is — display would claim coverage the matching engine doesn't actually see. Backfill is the symmetric fix because it brings storage and matching back into sync.

### Trade-offs

- **Engineer remembers to click the button.** Decision #199's correction held: dict overrides apply at ingest time only. Backfill is the retroactive bridge. Manual click is the cost of doing this right; the auto-trigger backlog entry tracks the followup.
- **Impact weight defaults to 7 for un-accepted rows.** Without a definitive canonical, the server estimates. The dashed-border `ImpactChip` makes the uncertainty visible. Future enhancement: client refines the estimate after Generate AI Suggestions populates a `suggestedAttributeId` — the route can't see that cache (it's per-route module scope).
- **L2 cache invalidation.** The backfill script ends with `DELETE` on `admin_stats_cache.atlas-coverage` + `manufacturers-list` (per Decision #198 L2-as-source-of-truth pattern). Next admin page load recomputes from updated `atlas_products`. Already proven during today's first real run — 37,514 changed in ~5 min.

### Files Touched

- `app/api/admin/atlas/ingest/batches/route.ts` — `MatchingImpact` type + `computeMatchingImpact()` + `lookupRuleWeight()` memo cache + extension to GlobalUnmapped + apply post-override-annotation.
- `components/admin/atlasIngest/types.ts` — `matchingImpact` on `GlobalUnmappedParam`.
- `components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx` — `ImpactChip` local component + Impact column header + cell + default sort by `matchingImpact.score`.
- `components/admin/AtlasDictTriagePanel.tsx` — `?mfr=` URL param consumed on mount + single-MFR empty-state success banner.
- `components/admin/ManufacturersPanel.tsx` — `BuildOutlinedIcon` wrench in coverage cell + "Refresh from accepts" button in header + status badge + poll-while-in-flight effect + auto-refresh MFR list on completion + alert for start success/error.
- `app/api/admin/atlas/backfill-translations/route.ts` (new) — POST spawn + GET status + lock-by-status + stale-lock TTL.

### Lessons

1. **Look at what's actually rendered, not what's named "obvious."** Spent ~10 min editing `AtlasPanel.tsx` (dead code, zero imports) thinking that was the Atlas MFRs panel before grepping for `MfrRow` references and discovering the live component was `ManufacturersPanel.tsx`. Pattern: when adding a feature to "the X panel," grep for `X` to find the file isn't enough — also grep for `import X` to confirm something actually mounts it.
2. **Empty states are silent bugs.** The drilldown worked correctly for CCTC (zero pending Triage rows) but the user couldn't tell whether the filter was broken. Friendly empty-state messaging is cheap and converts "looks broken" into "looks complete."
3. **Workflow signal isn't the same as data signal.** SWST showing 15% coverage wasn't "the data's thin." It was "the workflow doesn't tell you which accepts would lift it." Spent 15K product-impact accepts (e.g. `package_outline → package_case`) sitting in the queue unprioritised. The Impact score + drilldown together turn this into a visible workflow signal.

## Decision #201 — Vendor-Name Hygiene: "gaia-" Prefix Must Never Reach End Users (May 24, 2026)

### Context

GAIA is the third-party vendor that did our Atlas datasheet parameter extraction. Their output lands in `atlas_products.parameters` JSONB with a `gaia-{snake_case_stem}-{Min|Max|Typ}` naming convention. End users have no business knowing about that vendor — it's an internal implementation detail of the ingest pipeline.

Audit found that the happy path is already clean (`parseGaiaParam()` in `atlasGaiaDictionaries.ts` strips the prefix at parse time, and both `atlasMapper.ts` + `atlas-ingest.mjs` store under `gaia.stem`, never the raw prefixed key), but two real leak vectors remained:

1. **`gaiaId` field on the `AtlasManufacturer` type** was being mapped into the API response of `/api/admin/manufacturers/[slug]`. No component rendered it, but the field name was visible in browser DevTools network inspector to any admin user. The field is purely an internal foreign key for the Atlas external API sync script — it has no UI consumer.
2. **Fallback paths in `atlasMapper.ts`** — line 2489 (ingest fallback when a gaia-prefixed name has no dictionary entry) and line 2790 (DB-read humanize fallback when JSONB carries an unrecognized key) — would store `p.name.trim()` or `humanizeStem(attributeId)` verbatim as `parameterName`. If a malformed gaia name slipped past `parseGaiaParam()` (e.g. format drift on the vendor side, or stale JSONB rows from pre-strip ingest), the string would render to users with the vendor prefix intact.

### Decision

Two-part vendor-name hygiene:

**Part 1 — Drop `gaiaId` from over-the-wire responses.**

Removed `gaiaId` from `AtlasManufacturer` interface in [lib/types.ts](../lib/types.ts), from `rowToAtlasManufacturer()` in [lib/services/manufacturerProfileService.ts](../lib/services/manufacturerProfileService.ts), and from both the GET response payload and the PATCH `allowedFields` list in [app/api/admin/manufacturers/[slug]/route.ts](../app/api/admin/manufacturers/[slug]/route.ts). The `gaia_id` DB column stays — it's read directly by `scripts/atlas-api-sync-profiles.mjs` and `lib/services/atlasProfileSync.ts` (server-only). No more network exposure to admin clients.

**Part 2 — Belt-and-suspenders sanitizer at fallback construction sites.**

Added `stripGaiaPrefix(s)` helper at the top of [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts). Tight regex `/^gaia[-_]/i` — only strips a literal leading `gaia-` or `gaia_`, does not touch any other substring. Applied at exactly two leak vectors:

- Line 2489 in `mapAtlasModel()` — the ingest fallback where `parameterName: p.name.trim()` stores raw paramName when no dictionary mapping exists.
- Line 2790 in `fromParametersJsonb()` — the DB-read humanize fallback where `humanizeStem(attributeId)` runs on a JSONB key without a recognized lookup.

**Critical property: zero impact on parameter mapping.** The sanitizer runs purely on the user-facing `parameterName` display string. It does not touch `parameterId` (matching engine's lookup key — and `rawId` derivation at line 2484 already replaces hyphens with underscores, so a `gaia-` prefix could never survive into `parameterId` anyway). Dictionary-mapped values (`"Drain Source Voltage"`, `"vrrm"`, `"rdc_max"`) never start with `gaia-`, so the sanitizer is a no-op on every happy-path value. All 1580 tests pass unchanged.

### Why not the alternatives

- **Strip at the database layer (rewrite atlas_products rows)?** No — the JSONB keys are already stems (no prefix), so there's nothing to strip there. The leak vector is in the display path, not storage.
- **Rename the dictionary file / function names internally?** No — those are server-only. The "never show the vendor" rule applies to end-user surfaces (UI, network responses to clients), not internal symbol names.
- **Aggressive regex like `/\bgaia[-_]/gi`?** No — that could in principle mutate a real parameterName if "gaia" ever appears as a substring inside a dictionary entry (unlikely but not guaranteed by construction). The tight `^gaia[-_]` anchor only fires on the actual leak shape and leaves everything else untouched, satisfying the "must not affect mapping in any way" requirement.
- **Leave the admin-only `GlobalUnmappedParamsTable` untouched (still shows raw `gaia-...` paramNames)?** Yes — engineers triaging unmapped params need to see the vendor-side raw name to author dictionary entries. Acceptable per the existing "admin = internal" carve-out, same precedent as `ManufacturerDetailPage`.

### Files Touched

- `lib/types.ts` — drop `gaiaId` from `AtlasManufacturer`.
- `lib/services/manufacturerProfileService.ts` — drop `gaiaId` from `rowToAtlasManufacturer()` mapping.
- `app/api/admin/manufacturers/[slug]/route.ts` — drop from GET response + PATCH allowlist.
- `lib/services/atlasMapper.ts` — add `stripGaiaPrefix()` helper + apply at two fallback construction sites.

### Lessons

1. **"Already clean in the happy path" is not "guaranteed clean."** Ingest correctness depends on the vendor's naming format staying stable. A defensive sanitizer at the output stage costs near-zero runtime and converts a vendor-format-drift bug from "user-visible leak" to "missing dictionary entry shows humanized stem."
2. **Internal foreign keys don't belong on the wire.** `gaiaId` had no UI consumer but shipped to every admin client. Whenever a DB-row type is the response shape for an admin endpoint, audit which fields are actually consumed by the UI — anything else is a leak surface for naming, schema details, or vendor identity.
3. **Audit the network tab, not just the rendered UI.** Field names in JSON responses count as "user-visible" even when no React component renders them. DevTools network inspector is a real reading path for curious customers and integrators.

## Decision #202 — Improvement Potential Column on Manufacturers Admin Page (May 26, 2026)

### Context

Decision #200 closed the loop on per-row prioritisation inside the Triage queue (Matching Impact score per unmapped paramName) and on per-MFR drilldown (🔧 wrench → filtered Triage). What it didn't address: when a non-technical operator opens `/admin/manufacturers` to assign their engineer's next sprint, the Coverage % column tells them *current* state but not *upside*. A 40%-coverage MFR could be a goldmine (huge ruleweight stuck behind a handful of unmapped Chinese param names) or a lost cause (no fixable unmapped params).

User framing was explicit: "I need to be able to prioritize the work of my engineer. I want them to tackle the MFRs that have the most improvement potential."

### Decision

Add a sortable **Improvement Potential** column between Coverage and MFR Crosses on [components/admin/ManufacturersPanel.tsx](../components/admin/ManufacturersPanel.tsx). Server computes a weighted per-MFR ppt estimate; UI tier-colours the cell and exposes a three-state visual contract so zero-values don't blur into cache-cold values.

**Server-side computation** in [app/api/admin/manufacturers/route.ts](../app/api/admin/manufacturers/route.ts) `computeStats()`:

1. Adds `weightedTotalRules` alongside the existing count-based `totalRules` per (MFR, family) bucket. Denominator = `Σ (Σ rule.weight in family) × productCount`. Family weight sums memoised at module scope.
2. Reads the existing triage cache via `readCachedTriageData(false)` in parallel with the manufacturers query — cold-safe (returns null, UI shows "—" rather than blocking the whole page on the heavy aggregation).
3. Re-inverts the triage queue's `affectedManufacturers` per row: each unmapped param contributes `perMfrProductCount × estimatedWeight` to its affected MFRs. Rows with `noteStatus='unmappable'` are skipped (engineer has explicitly decided those can't contribute).
4. Per-MFR result folded across alias variants (same pattern as `productAgg` to handle `atlas_products.manufacturer` ↔ `atlas_manufacturers.name_display` mismatch).
5. Final `improvementPotentialPpt = min(100, (addressableSlots / weightedTotalRules) × 100)`. Cap defends against the default-7-weight heuristic over-estimating on un-triaged rows.

**Weight resolution** mirrors `computeMatchingImpact()` in the batches route (Decision #200) for consistency:

- `acceptedOverride.attributeId` in dominantFamily's logic table → exact rule weight (0 if not a matching attr).
- L3 family without override → default 7 (medium-high; most unmapped params being triaged end up mapping to matching-relevant attrs).
- L2-only / no family → default 2 (display-only weight).

**Three-state UI display:**

| State | Render | Tooltip | When |
|---|---|---|---|
| No scorable products | `—` (opacity 0.3) | "No scorable products for this manufacturer — no matching budget to improve." | `scorableCount === 0` |
| Cache cold | `—` (opacity 0.3) | "Improvement potential is still loading — refresh in a few seconds…" | Triage cache returned null |
| In queue, fully addressed | `0.0 ppt` (opacity 0.3) | "No currently-unmapped params in the Triage queue affect this manufacturer. Either its products are fully mapped, or it hasn't been ingested recently." | `ppt === 0` with scorable products |
| Actionable | `+X.X ppt` (green ≥5, amber 1–5) | `N unmapped params · M weighted product-rule slots addressable` | `ppt > 0` |

Sort on DESC sequence: real values > 0 first → real zeros → cache-cold (`—`) → no-scorable (`—`). Engineers ranking by upside hit the actionable rows first; "no signal yet" rows sink.

Cache key bumped from `manufacturers-list` → `manufacturers-list-v2` so persisted rows recompute on next load with the new field. Both `manufacturers-list` AND `triage-queue` invalidation paths already fire on all relevant batch mutations (Decision #180) — no new invalidation hooks needed; the column updates organically as engineers accept overrides in Triage.

### Why not the alternatives

**Count-based improvement potential** (rejected): would have mirrored the existing Coverage % math exactly (rule-count numerator over rule-count denominator). Rejected because a weight-10 blocking gate unmapped is far more valuable to fix than a weight-2 display rule, and the whole point of the column is engineer-time prioritisation. The user pushed back on the original count-based draft explicitly: "should we not take weight of the rules into consideration as well?" Weight-based ranks the same MFRs differently than count-based — sometimes the highest-count-impact MFR isn't the highest-weighted-impact MFR.

**Also switch Coverage % to weight-based** (deferred): would unify the two metrics' units but breaks calibration for operators who've been reading the existing column for months. Decision #200's Matching Impact already lives in weight units inside Triage; this column also lives in weight units on Manufacturers. Coverage % stays count-based as the stable "what's already covered" reference. Worth revisiting if/when we re-design the whole coverage-analytics surface.

**New SQL RPC for per-MFR weighted aggregation** (rejected): tempting given the SQL-aggregation pattern of Decisions #179/#180/#183/#189. Rejected because the triage cache already lives in Node memory + Supabase via `triageQueueCache.ts`, the manufacturers route already does Node-side aggregation for the count-based denominator, and the per-MFR rollup is bounded (~1000 MFR × ~thousands of triage rows = single-digit ms). No RPC needed; route-layer merge is sufficient and avoids a new schema artefact.

**Strict mode (only count override-resolved or AI-suggested rows)** (rejected): would have under-counted MFRs heavily for the typical case where most queue rows haven't been triaged yet. User picked the upper-bound option explicitly: "rankings stay correct: the MFR with the biggest pile of unmapped × products will still be the highest-priority target." The cap-at-100 + tier-colouring + tooltip-explained heuristic accept the over-estimation tradeoff for ranking-correctness.

### Trade-offs

- **`+X.X ppt` is an estimate, not a contract.** When a row hasn't been triaged, the default weight is 7. If the eventual accept maps to a weight-2 satellite, the displayed ppt over-estimated. Ranking is still correct (over-estimates scale uniformly across MFRs in the same queue state), but the user shouldn't read the absolute number as "this is how much coverage will exactly rise."
- **Cache-cold MFRs render `—`.** Cold cache is all-or-nothing — the triage aggregation either has fired for the request or hasn't. Acceptable trade-off: blocking the manufacturers page on a multi-second triage compute would degrade the page that the operator visits most often.
- **Triage-queue staleness lags by up to 6h** (the SWR threshold from Decision #180). A burst of Accepts inside the queue UI flips the ppt for affected MFRs immediately (per-row invalidation runs on Accept), but a cold-cache rebuild without explicit invalidation can return slightly-stale numbers. Acceptable; this is the same staleness contract the Triage UI itself runs on.

### Files Touched

- `app/api/admin/manufacturers/route.ts` — `getFamilyWeightSum()` module-scope memo; `estimateUnmappedParamWeight()` heuristic; `weightedTotalRules` on per-MFR coverage struct; parallel `readCachedTriageData()`; per-MFR `mfrWeightedImpact` rollup; `improvementPotentialPpt` + `improvementPotentialDetail` on result rows. Cache key bumped to `manufacturers-list-v2`.
- `components/admin/ManufacturersPanel.tsx` — `improvementPotentialPpt` / `improvementPotentialDetail` on `MfrListItem`; new `improvementPotentialPpt` sort key; sortable column header with tooltip; tier-coloured cell with three-state display; skeleton column.

### Lessons

1. **Two metrics with different units beats one over-loaded metric.** Coverage % was count-based and stable in operators' heads. The right move was leaving it alone and adding a sibling column in weight units, not retrofitting the existing column. Same playbook Decision #200 followed with Matching Impact inside Triage.
2. **"0" and "no data" need to look different.** Initial render used `opacity: 0.3` for both cache-cold (`—`) and real-zero (`0.0 ppt`). User immediately flagged "many MFRs don't have this figure...empty...why?" — the answer was visual ambiguity, not a data bug. Three-state display with distinct strings + tooltips converted a "looks broken" experience into a "looks complete" one. Same lesson as Decision #200's empty-state success banner — silent zeros are silent bugs.
3. **The user's weight question wasn't a feature request, it was a correctness check.** Initial plan defaulted to count-based math because it was simpler and mirrored Coverage %. User push-back ("should we not take weight of the rules into consideration as well?") was the correctness signal — engineers prioritising work need the metric to reflect what they actually optimise for. Weight matters.

---

## Decision #203 — Clickable Atlas-MFR Mentions in Chat + Hardening Decision #166 (May 26, 2026; amended Jun 1, 2026)

### Context

Two-part change. (a) A user asks "tell me about 3PEAK" and gets a textual answer; today there's no way to click the MFR name in the chat response to open the same right-hand `ManufacturerProfilePanel` that opens from recommendation-card MFR clicks. Inline MPN linkification (Decision #165) already covers MPNs in chat prose; the parallel affordance for MFR names was missing. (b) Before adding the clickable affordance, audit whether Decision #166's MFR claim-discipline rules still cover every code path that can talk about a manufacturer. Same failure-mode pattern that produced #166 (GigaDevice `stockCode` was in the DB but dropped from the LLM projection → "Private company" fabrication) could be lurking on fields not yet projected, on null-vs-omitted asymmetry, or on orchestrators where the rules don't apply.

### Decision

Audit + linkification ship together. Audit closes three concrete gaps; linkification adds a parallel `knownAtlasManufacturers` Set with the same combined-regex pattern that MPNs use.

**Audit gaps closed (hardening Decision #166):**

1. **`designResources` projected to the LLM** ([lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) — `executeGetManufacturerProfile()`). `mapAtlasToManufacturerProfile()` populated `designResources` (SPICE models, reference designs, app notes) from the Atlas row, but the tool projection dropped it. If a user asked "does X publish SPICE models?", the LLM had no backing field — exact same shape as the original `stockCode` bug.
2. **Explicit `null` normalization for all optional fields** in the same projection. Previously `foundedYear`, `logoUrl`, `headquarters`, `stockCode`, `websiteUrl`, `contactInfo`, `partsioName`, `distributorCount`, `catalogSize`, `familyCount` were passed directly to `JSON.stringify` which silently drops `undefined` keys. The LLM could not distinguish "queried + no data" (should produce "not in our profile") from "never queried this field" (training-data inference risk). Now every optional field is `?? null` so the JSON always carries the key, and the prompt is updated to instruct the model to treat null as "not in our profile — verify with the manufacturer directly".
3. **`get_manufacturer_profile` exposed to `refinementChat()` and `listChat()`**, with a condensed claim-discipline paragraph (`MFR_CLAIM_DISCIPLINE_MINI`) injected into both system prompts. Previously only `chat()` had the tool + the discipline rules — net-new fabrication surface for users asking about a MFR from inside the per-part refinement modal or the list-agent drawer. Tool definition + handler hoisted to a single shared `GET_MFR_PROFILE_TOOL` constant + `executeGetManufacturerProfile()` helper at module scope; main `chat()` `executeTool()` and both other orchestrators reference them, eliminating copy-paste drift.

**Linkification (Atlas-only scope):**

- New `knownAtlasManufacturers: ReadonlySet<string>` memo in [components/AppShell.tsx](../components/AppShell.tsx), parallel to the existing `knownMpns`. Sources: `XrefRecommendation.part.mfrOrigin === 'atlas'` (canonical signal per Decision #161), `PartSummary.dataSource === 'atlas'` on search-result matches and source part, plus MFRs already opened in the side panel this session that resolved to Atlas.
- `useManufacturerProfile` ([hooks/useManufacturerProfile.ts](../hooks/useManufacturerProfile.ts)) now exposes `atlasNamesQueried` — a state-tracked Set of canonical MFR names that resolved to `source: 'atlas'`. Updated inside `applyResult` so panel-opened-then-rotated-off MFRs remain link-able. Set identity is preserved on duplicate add to avoid spurious re-renders.
- Single combined regex in [components/MessageBubble.tsx](../components/MessageBubble.tsx): `buildLinkPattern(knownMpns, knownMfrs)` returns `{ regex, mpnGroup, mfrGroup }` with longest-first alternations and `\b...\b` boundaries. `linkifyChildren()` dispatches by which capture group matched. One linear scan preserves document order and prevents one pass wrapping a span the other pass already wrapped (the failure mode if MFR names happen to overlap MPN substrings or vice versa).
- Visual: MFR matches use the same primary-color underline-on-hover as MPNs but drop the monospace font (MFR names aren't part numbers).
- Atlas-only scope is deliberate. Western MFR mentions in chat won't linkify even when the tool returned mock data — we only want clickable affordances where we have rich profile data. Aliases (e.g. "GD" → GigaDevice) deferred — the orchestrator prompt already steers the model to canonical names, and substring matching on short aliases has too much false-positive risk in English prose.

### Files Touched

- [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) — extracted `GET_MFR_PROFILE_TOOL` + `executeGetManufacturerProfile()` + `MFR_CLAIM_DISCIPLINE_MINI` to module scope; projection adds `designResources` + null-normalizes 10 optional fields; `refinementTools` + `listAgentTools` include the tool; both orchestrators' tool-dispatch loops handle `get_manufacturer_profile`; both system prompts append the mini discipline rules. `listChat` tool-result mapper switched from sync `.map` to `await Promise.all(...)` to accommodate the now-async dispatch.
- [hooks/useManufacturerProfile.ts](../hooks/useManufacturerProfile.ts) — adds `atlasNamesQueried` state Set, updated in `applyResult` when `source === 'atlas'`.
- [components/AppShell.tsx](../components/AppShell.tsx) — `knownAtlasManufacturers` memo, threaded down to both layouts.
- [components/DesktopLayout.tsx](../components/DesktopLayout.tsx), [components/MobileAppLayout.tsx](../components/MobileAppLayout.tsx) — accept + forward `knownAtlasManufacturers` to `ChatInterface`; pass existing `onManufacturerClick` callback (already wired for cards) to chat.
- [components/ChatInterface.tsx](../components/ChatInterface.tsx) — accept + forward the two new props to `MessageBubble`.
- [components/MessageBubble.tsx](../components/MessageBubble.tsx) — `buildLinkPattern()` + extended `linkifyChildren()` with two-group dispatch; MPN vs MFR styling branch.

### Why not the alternatives

- **Audit-only, no code change.** Would have left two real fabrication surfaces open (refinement modal + list agent). Decision #166 had grown the discipline rules for the main chat but the lift to other orchestrators never happened — Triage Phase 3 hardening (Decision #186) showed the same drift on a different axis.
- **Linkify every MFR name the LLM writes (global NER).** Considered and rejected. Would require a global MFR dictionary or NER pass; "Texas" matching as a prefix of "Texas Instruments" has too much false-positive risk in prose. Atlas-only scope keeps the set small (~115 names, mostly romanized Chinese) and the false-positive risk near-zero.
- **Two separate regex passes for MPN + MFR.** Considered. Combined single-regex pass with capture-group dispatch is cheaper to compile, preserves document order, and prevents double-wrapping when one identifier overlaps another's substring.
- **A new "Profile" badge/chip next to MFR mentions.** Would have made the affordance more discoverable but cluttered chat density. Reusing the MPN underline pattern keeps visual noise low — same affordance, same hover behavior, user picks it up by analogy.

### Lessons

1. **Audit before extending.** The user asked for a linkification feature and wanted reassurance that the existing hallucination rules were holding. The audit surfaced three real gaps that no one would have noticed from product use (`designResources` would only manifest on a question we haven't yet seen; refinement/list MFR questions silently failed-open with no claim discipline). The pattern: when a user asks "is this safe?", treat it as a real audit prompt, not as a request for verbal reassurance.
2. **Null-vs-omitted is the same failure shape as not-projected.** Decision #166 was about a field that existed in the DB but never reached the LLM. Two years later, the same shape recurs at a finer grain: a field that's projected but only when populated. `JSON.stringify` dropping `undefined` is a silent-failure pattern that's easy to write past during review. The fix (`?? null`) is small; the discipline is to apply it to every optional field uniformly, not just the ones that have caused a reported bug.
3. **Extract the shared helper at the moment of the second copy.** Three orchestrators now need the same tool definition + handler. Extracting `GET_MFR_PROFILE_TOOL` + `executeGetManufacturerProfile()` at the time of the change costs ~10 minutes and prevents the now-classic drift pattern where one of three copies grows a fix the others don't get. The async-Promise-all switch in `listChat`'s tool mapper is the visible second-order cost of this move — acceptable.
4. **`Part.mfrOrigin` lives on `Part`, not `XrefRecommendation`.** Caught by `tsc` immediately. Worth recording because it's a common cross-cutting concern — `XrefRecommendation.part.mfrOrigin` looks identical to `r.part.dataSource` and `r.dataSource` (the rec has its own `dataSource` distinct from the candidate part's). When the type system gives you the answer for free, lean on it.

### Amendment (Jun 1, 2026) — Cold-ask round-trip wire

Initial ship covered the four sources that populated `knownAtlasManufacturers` from data the *client* already had: recs with `part.mfrOrigin === 'atlas'`, search matches with `dataSource === 'atlas'`, source part, plus MFRs already opened in the side panel (`atlasNamesQueried`). What it missed: the most common cold-ask path. User asks "tell me about 3PEAK" in chat — the LLM calls `get_manufacturer_profile` server-side, Atlas returns a profile, the LLM writes a reply mentioning **3PEAK** — but the client never learned that 3PEAK resolved to Atlas because that lookup happened entirely server-side. So the name stayed un-linkified in the assistant's prose.

Fix wires the tool-call result back to the client:

- Every `get_manufacturer_profile` dispatch in `chat()`, `refinementChat()`, `listChat()` now parses the tool result; if `source === 'atlas'`, accumulates `profile.name` into a per-turn Set on `ToolResultData` (or a local Set in `listChat`).
- New `mentionedAtlasManufacturers?: string[]` on `OrchestratorResponse` + `ListAgentResponse` ([lib/types.ts](../lib/types.ts)) surfaces the per-turn set.
- New `chatAtlasMfrs: ReadonlySet<string>` on `AppState` ([hooks/useAppState.ts](../hooks/useAppState.ts)) accumulates across turns; merged in the chat-response handler with stable-Set-identity preservation when nothing new arrived (avoids spurious re-renders).
- `AppShell.knownAtlasManufacturers` memo now also unions in `appState.chatAtlasMfrs`. Same MessageBubble combined regex picks up the name immediately on the same assistant message that mentions it.
- Symmetry: added `registerAtlasMfrs(names)` to `useManufacturerProfile` for future callers; current code path uses the `appState` union instead, but the helper is the right shape for any future flow that learns about Atlas MFRs outside the chat response cycle.

**Lesson 5.** Linkification scoped to "MFRs the client already knows about" is the wrong scope when the most common ask path resolves the MFR server-side. The data the user is asking about IS the data that needs to be linkified, but the client only has it AFTER the response arrives — so the response itself has to carry the provenance. Mirror of Decision #163's deferred-enrichment shape (server returns the enrichment alongside the data, client merges into state).

## Decision #204 — Domain Card Approval Workflow Hardening (May 27, 2026)

### Context

Bulk review of generated `atlas_family_domain_cards` (Decision #192 grounding + #195 audit) surfaced four recurring friction patterns when an operator tries to Approve a dozen+ cards in a single session:

1. **False-positive bogus-MFR flags on 2-letter codes** that collide with engineering abbreviations. `atlas_manufacturers` has registered entries like `TC 德昌`, `BC 宝成`, `RS 容硕`, `CS 创世`. The audit's mention-detection regex extracted bare `TC` / `BC` / `RS` / `CS` tokens from card prose where they actually meant case-temperature, BJT MPN prefix, RS-485 / RUNIC, and Chip Select (SPI signal) respectively — and flagged the cards as making false MFR claims that block Approve. The existing `MFR_NAME_BLOCKLIST` was the right structural fix (DC/AC/HC/PTC/NTC already there); just had to grow the list as more collisions surfaced.

2. **False-positive Chinese-substring fabricated-dict flags** when a card cites a compound dict key. Cards cite real keys like `电阻-初始(ri)(最小值)` (existing in the dict), but the FABRICATED_DICT check's regex extracts `最小值` from inside the chained parentheticals and looks it up in isolation, where it's not present. The existing parenthetical-exemption only walked back ONE char to check for a Han root, missing the case `<HanRoot>(qualifier1)(qualifier2)` where the char immediately before the open paren is the close paren of the prior qualifier group.

3. **`ON CONFLICT DO UPDATE` errors during Proceed** when vendor JSON contains the same MPN twice for one MFR. Postgres rejects the entire upsert chunk because two rows in the same statement target the same primary key `(mpn, manufacturer)`. The ingest script was building the upsert list directly from the vendor JSON without dedup, propagating data-quality issues from third-party vendor files into hard Proceed failures.

4. **Native `confirm()` dialog on every Proceed** asking "this batch has N unmapped params — apply anyway?" is correct safety messaging for new operators but adds a click per batch for engineers who've already triaged and know about the queue. No way to opt out per session.

### Decision

Five surgical changes — none of them rewrites; each is a localized hardening to the existing patterns:

1. **Grow `MFR_NAME_BLOCKLIST` with engineering-abbreviation collisions.** Added `TC`, `BC`, `RS`, `CS` to both [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts) (runtime, used by the live audit UI) AND [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) (offline batch script mirror). Each entry carries a one-line comment naming the colliding engineering term and the MFR it would otherwise false-positive against. The existing comment on the blocklist already documents this as the explicit trade — "small blind spot if a card legitimately discusses one of these MFRs by name, acceptable trade."

2. **Walk-back through chained parentheticals in the FABRICATED_DICT check.** In both audit modules, replaced the single-char `cardText[m.index - 2]` check with a loop that skips past every `(...)` group preceding the current parenthetical phrase, then checks whether the underlying root char is Han. Handles `电阻-初始(ri)(最小值)` and any other `<HanRoot>(qualifier)(qualifier)...` chain. Depth-counting paren matcher (handles nested parens cleanly). Mirror kept byte-for-byte in [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) per the existing convention.

3. **Defensive MPN dedup in `atlas-ingest.mjs`** at the entry to the per-MFR apply function. Vendor JSON gets collapsed via `Map(mpn → product)` keeping the LAST occurrence (matches "last write wins" Postgres semantics that would apply if duplicates were applied sequentially). Logs `⚠ N duplicate MPN(s) collapsed` when dupes are found so the operator can spot which vendor files have data-quality issues without it being a fatal error. Snapshot rows + soft/hard-delete tracking all derive from the deduped list, so consistency is preserved automatically.

4. **MUI Dialog + "Don't ask again this session" checkbox in [BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx).** Replaced native `confirm()` with a real MUI Dialog. State stored in `sessionStorage` under key `atlas-ingest-suppress-unmapped-warn`. First Proceed on any unmapped batch shows the dialog; if user checks the box + Apply, subsequent Proceeds skip the dialog until tab refresh. Preserves the warning for first-time-in-session reminder AND for "Proceed All Clean" bulk operations (one click can apply 50 batches), but eliminates per-batch friction for routine per-batch clicks.

5. **Atlas Mapper dict cleanups (3 cards' worth, illustrative of the pattern):** C7 Interface ICs (6 deprioritized aliases promoted to canonical `operating_mode` / `txd_dominant_timeout` / `esd_bus_pins`), Family 71 Power Inductors (added `操作溫度` traditional Chinese + dimension trio `高`/`长`/`宽` with `(公釐)` qualifier; `height` is a real canonical, `_length_mm` / `_width_mm` stored deprioritized since no logic-table canonical exists yet), B4 TVS Diodes (added bare `靜電次數` alongside existing `靜電次數(pulses)` parenthesized form). Each cleanup mirrored to [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) per the existing convention. Pattern: when an audit advisory flags a real-but-uncatalogued Chinese term, the right fix is usually to add the dict entry, not edit the card prose.

### Files Touched

- [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts) — `MFR_NAME_BLOCKLIST` grew by 4 entries (TC, BC, RS, CS); FABRICATED_DICT parenthetical walk-back replaces single-char lookup.
- [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) — mirror of both changes.
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — `applyBatch()` deduplicates `mappedProducts` by MPN at entry, logs collapsed-dupe count; C7 / family-71 / B4 dict entries promoted/added; `detectMpnQualityIssue` gains `description_as_mpn` kind.
- [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) — same dict edits as the .mjs mirror.
- [lib/services/atlasMpnQualityValidator.ts](../lib/services/atlasMpnQualityValidator.ts) — added `description_as_mpn` detection kind (heuristic: ≥3 space-separated tokens AND ≥2 are pure-alphabetic 4+ chars; conservative, runs last so more-specific patterns win).
- [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) + [BatchCard.tsx](../components/admin/atlasIngest/BatchCard.tsx) — `byKind` extended for the new kind; BatchCard renders "N description-as-MPN" in the per-batch warning summary. Same file also: native `confirm()` → MUI Dialog with sessionStorage-backed "don't ask again" checkbox.
- [scripts/supabase-atlas-family-mfr-grounding-rpc.sql](../scripts/supabase-atlas-family-mfr-grounding-rpc.sql) — added `AND status <> 'discontinued'` to all three grounding RPCs (`get_atlas_family_mfr_grounding`, `get_atlas_family_grounding_counts`, `get_atlas_all_family_grounding_counts`). The Decision #174 soft-delete convention was silently broken for grounding-driven flows (domain card generation, audit, MFR cohort verification counted all atlas_products regardless of status). **Requires manual deploy to live Supabase via dashboard SQL editor** (no service-role JS client path to execute arbitrary SQL).

### One-time data cleanup applied

- WAY-ON family B5: 5 description-as-MPN rows hard-deleted (`Fast Turn-Off Synchronous Rectifier (100V MOS inside)` and 4 siblings — marketing-summary entries from the vendor JSON that were misclassified into B5 because "MOS inside" caught the classifier). Verified B5 grounding now shows real WAY-ON MPNs (`WM03N58M2`, `WM05N02M`, etc.).
- Cross-MFR survey using the new validator heuristic found 7 additional active garbage rows (LRC datasheet section headers stored as MPNs, SHOU HAN's "MICRO 7.2 JBWZ" duplicates, XTX "Power Tool-Electric Wrench"). All hard-deleted in the same pass. Total: 12 rows cleaned across 3 MFRs.

### Why not the alternatives

- **Don't grow the blocklist; make the MFR matcher smarter (require capitalization context, etc.).** Would eliminate the ad-hoc list growth, but the structural fix would have to draw a line between "TC means case temp here" vs "TC means a manufacturer in this card" that's fundamentally context-dependent — hard to encode robustly without a token-context-aware NER pass. Blocklist is cheap, the existing comment explicitly documents the trade as acceptable, and each addition is a 30-second edit. Bigger fix can land later if the list grows past ~20 entries.
- **Fail the ingest on duplicate MPNs instead of deduping.** Considered. Rejected because the vendor JSON quality is variable (~115 Chinese MFRs, third-party data) and the dupes are recoverable — silently last-write-wins matches what would happen if applied sequentially anyway. The `⚠` log line preserves visibility for engineers who want to chase down the upstream data-quality issue.
- **Remove the unmapped-params Proceed dialog entirely.** Considered. Rejected because Decision #176 explicitly added it as the operator-confirm gate — bulk "Proceed All Clean" can apply 50 batches in one click and the warning is genuine safety messaging. Per-session opt-out preserves that safety net for the first click while clearing routine friction.
- **Edit the card prose to defeat the audit regex** (e.g., rewrite "TC=80°C" to avoid bare TC). Tried in B6 BJTs, then realized it's whack-a-mole. The audit regex extracting "TC" from any case-temperature mention is the actual bug — fixing the regex is the root cause. Cards stay clean and engineering-accurate.

### Lessons

1. **Audit regex precision is the right place to fix recurring false positives, not the cards themselves.** Once you've manually rewritten three cards to avoid bare "TC" tokens, the audit script is the bug, not the cards. Same applies to the parenthetical walk-back fix — the prose `电阻-初始(ri)(最小值)` is engineering-accurate; the audit's substring extraction needed to know about chained qualifiers.
2. **The audit script's two-file mirror (.ts runtime + .mjs offline) needs the same discipline as the atlasMapper.ts / atlas-ingest.mjs mirror.** Same "duplicated by design, no import path" convention. Every change to one file needs the byte-for-byte equivalent in the other or audits diverge between live UI and batch script.
3. **`MFR_NAME_BLOCKLIST` is a working idiom for the ambiguous-2-letter-code problem.** Pattern: when a 2-letter MFR name exists AND that 2-letter token has a standard engineering meaning, the blocklist entry is the safe move. The cost — small blind spot if a card legitimately mentions one of those MFRs by name — is acceptable because (a) the MFRs in question are tiny in volume (zero products in most families) and (b) the engineering term usage vastly outweighs the MFR usage in card prose.
4. **Vendor data quality assumptions belong in the script, not the route handler.** The ON CONFLICT error came back as an opaque 500 in the UI. Defensive normalization in the script (dedup, sanitize, log) catches data issues at the boundary where context is best for both detection and recovery, rather than turning each new vendor quirk into a route-handler firefight.
5. **sessionStorage is the right scope for "I've acknowledged this warning."** Not localStorage (too permanent — a new operator on the same browser shouldn't inherit the suppression), not in-memory (loses scope across React unmounts). Tab lifetime matches the engineer's review session.

---

## Decision #205 — Atlas Dict-Canonical Drift Repair: C4 Op-Amps Migration to Logic-Table IDs (May 27, 2026)

### Context

C4 (Op-Amps / Comparators / Instrumentation Amplifiers) family domain card audit surfaced that the C4 `atlasParamDictionaries` block in [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) was using attributeIds that didn't match the logic-table canonicals in [lib/logicTables/opampComparator.ts](../lib/logicTables/opampComparator.ts):

| atlasMapper C4 dict | Logic-table rule |
|---|---|
| `vos` | `input_offset_voltage` |
| `ibias` | `input_bias_current` |
| `supply_current` | `iq` |

C4 atlasMapper was the **sole outlier**. Every other data source already used the logic-table IDs:
- Digikey ([digikeyParamMap.ts:2827](../lib/services/digikeyParamMap.ts))
- Parts.io ([partsioParamMap.ts:349](../lib/services/partsioParamMap.ts))
- Atlas gaia datasheet extraction ([atlas-gaia-dicts.json:316](../lib/services/atlas-gaia-dicts.json))
- C4 context questions ([opampComparator.ts:136](../lib/contextQuestions/opampComparator.ts))

Spot-checked B5/B6/C1/C2 atlasMapper dicts — no equivalent drift. The matching engine has VALUE aliasing (per-rule synonyms) but **no attributeId aliasing**, so atlas-sourced C4 products were silently scoring as "missing data" against the offset/bias/iq rules.

The C4 card itself had a paragraph instructing the Triage AI to "preserve dictionary mapping" — documenting the drift as if it were a feature. It wasn't; it was a coverage bug encoded into the AI's context.

### Investigation findings (load-bearing for the migration plan)

Before migrating, three things were verified to bound the blast radius:

1. **Populations are mostly mutually exclusive.** Of 1,972 C4 products, 248 carry one of the outlier keys, ~2,175 carry logic-table-ID keys (input_offset_voltage 613 + input_bias_current 461 + iq 497 + multi-key overlap). Only **14 products** carry both keys (5 vos/iov, 1 ibias/ibc, 8 sc/iq). Random intersection would predict ~75; the actual count is much smaller because each product's param-name form matched EITHER a static-dict-only key (→ outlier ID) OR an override-covered key (→ logic-table ID), rarely both.

2. **Conflict values mostly AGREE.** Of the 14 dual-key products, 12 show numerically-identical values across the two keys (different units/notation, same magnitude). Only 2 vos cases show real divergence (DIOO DIO2331B / DIO2333B at 2-3× ratios), consistent with **Max vs Typ** semantic differences at different operating points — both values "correct" for different purposes.

3. **Extraction-source values are rare in logic-table-ID keys.** Only 44 of ~2,175 logic-table-ID entries are `source: 'extraction'` (the rest are `source: 'atlas'` — written by override-covered ingests). The merge-on-collision concern (atlas would overwrite extraction on re-ingest after rename) affects fewer than 50 products; sample shows values agree at extraction-vs-atlas boundaries.

Net: low-risk migration. The "preserve dictionary mapping" card instruction was reading the architecture as deliberate when it was just unfinished drift.

### Decision

Migrate the C4 atlasMapper block to use logic-table canonicals. Three coordinated changes:

1. **In-file scoped rename** (atlasMapper.ts + atlas-ingest.mjs C4 blocks only). 26 attributeId references per file. **Critical: scoped to C4 brace boundaries.** `attributeId: 'supply_current'` also appears at line 1948 of atlasMapper.ts in the Sensors L2 block (optical motion sensors) — a naive `replace_all` would have corrupted unrelated data. Used a node script that walks brace depth from the `  C4: {` opener to identify the block, then only edits inside.

2. **Idempotent backfill** via new [scripts/atlas-c4-rename-outlier-attrs.mjs](../scripts/atlas-c4-rename-outlier-attrs.mjs) — walks `atlas_products` C4 rows, renames keys in `parameters` JSONB, preserves `source`/`ingested_at` provenance. **Conflict policy** on the 14 dual-key products: keep the existing logic-table-ID value, drop the outlier — backed by the sample analysis showing values agree in 12/14 cases. Backfill applied: 604 clean renames + 14 conflict-drops = 618 attribute renames across 248 products.

3. **L2 cache invalidation** post-backfill: `triage-queue`, `atlas-coverage`, `manufacturers-list` rows in `admin_stats_cache` deleted (per Decision #198 L2-as-source-of-truth pattern).

Plus opportunistic cleanup of 5 wrong overrides surfaced during the audit pass (sequential bulk-Accept misclicks, same admin user, ~175ms apart in the C1 cluster):
- **C1**: `噪声 → iout_max`, `待机电流 → iout_max`, `输出极性 → iout_max`. Soft-deleted.
- **C4**: `工作电压 → channels`, `线性输入范围(mv) → input_offset_voltage`. Soft-deleted.

And 2 blocklist additions to [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts) + .mjs mirror:
- **FTR**: tolerance/packaging letter-code suffix on resistor MPNs (AMF03FTTR001, RAS12FTN1000, MRF6432(2512)LR001FTR). Collides with minor MFR "FTR 乔光电子" (zero products).
- **TR**: universal Tape-and-Reel packaging suffix (M/TR, /TR, -TR) on virtually every SMD IC. Collides with minor MFR "TR 湖北天瑞" (zero C4 products).

Both will recur on countless future cards; blocklist is the right idiom (Decision #204 lesson #3).

### What this DOES NOT cover (Phase B, deferred)

The C4 `rail_to_rail` single-flag dict entries (`轨到轨`, `轨对轨`, `rail-rail`) all map to one `rail_to_rail` attributeId, but the logic table has TWO separate flags: `rail_to_rail_input` (line 120) + `rail_to_rail_output` (line 128). Values are structured strings ("In/Out", "In, Out", "轨到轨输出", "轨到轨输入", possibly ambiguous "In" or "Out" alone) that need a parser to split into the two booleans. 232 products affected. Deferred because parser edge cases need more design and the Phase A migration isn't blocked.

### Verification

- C4 `atlas_products` carrying outlier IDs after backfill: 0 / 0 / 0 ✓
- Counts grew consistently: `input_offset_voltage` 613→852 (+239 renames), `input_bias_current` 461→656 (+195 renames), `iq` 497→667 (+170 renames) ✓
- Sensors `工作电流 → supply_current` mapping at atlasMapper.ts line 1948: untouched ✓
- Re-audit of C4 card after dict rename + TR blocklist: dropped from BOGUS_MFR-block to advisory-only-warn. Card is Approve-unblocked.

### Files Touched

- [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) — C4 block: 26 attributeId rename references (3 unique renames × multiple param-name forms each).
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — byte-for-byte mirror of the C4 rename (mjs-mirror convention).
- [scripts/atlas-c4-rename-outlier-attrs.mjs](../scripts/atlas-c4-rename-outlier-attrs.mjs) — NEW one-off backfill (dry-run by default, `--apply` to commit). Idempotent. Conflict policy documented in header.
- [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts) — `MFR_NAME_BLOCKLIST` grew by `FTR` + `TR` (on top of Decision #204's TC/BC/RS/CS and subsequent HT/SY/THD/TLC).
- [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) — mirror of the blocklist additions.

### Lessons

1. **An attributeId rename in atlasMapper is a content-layer schema change, not a cosmetic fix.** The matching engine has no aliasing layer; renaming the dict without backfilling existing `atlas_products` would silently break scoring for hundreds of products. Always pair dict renames with a backfill script. Don't assume "the next re-ingest will fix it" — re-ingest is operator-triggered and selective.

2. **Verify `mergeAtlasParameters` semantics before assuming intent.** The actual code at [atlasMapper.ts:2699](../lib/services/atlasMapper.ts) keeps extraction entries IN STEP 1, then OVERWRITES with new atlas in STEP 2. Net behavior on key collision: **atlas wins**. The C4 outlier dict's key separation (vos vs input_offset_voltage) was inadvertently working around this — atlas wrote `vos`, extraction wrote `input_offset_voltage`, they coexisted because the keys differed. Renaming brings C4 in line with C1/B5/B6 behavior where atlas-overwrites-extraction is already the de facto policy. The sample evidence supports this trade.

3. **The "are you sure?" pushback caught two real engineering errors in the unrelated B6 voltage-trio rewrite.** Draft 1 dropped useful preserved content. Draft 2 made a false physics claim ("Vceo passing implies Vcbo passing" — true for a single transistor, NOT across different transistors). Draft 3 used the wrong mechanism ("base is driven" — irrelevant; the actual reason Vcbo doesn't bind is "emitter is connected in three-terminal use"). User verification ratchets quality the prompt alone can't deliver.

4. **Cross-family scope check is mandatory for `replace_all`-style schema renames.** `attributeId: 'supply_current'` appeared safe at first scan, but the Sensors L2 block uses the same attributeId for optical motion sensors. Naive global replace would have corrupted unrelated data. Always scope schema renames to the relevant block via explicit brace-boundary detection.

5. **Wrong overrides clustered in time + same user + same wrong target = sequential bulk-Accept misclick pattern.** The C1 trio (噪声/待机电流/输出极性 → iout_max) was created within 175ms by the same admin. The C4 pair (工作电压 → channels, 线性输入范围 → input_offset_voltage) is the same shape. UI guard worth considering: confirm dialog when bulk-accepting ≥3 overrides with the same target attributeId in <500ms. Not blocking; just a "did you mean to?" check.

6. **2-letter / 3-letter MFR collisions with engineering codes recur per family.** This session added `FTR` + `TR` to the running list (DC/AC/HC/PTC/NTC/TC/BC/RS/CS/MAX/Fast/Milliohm/TVS/LED/IC/VIBRATION/CTR/HT/SY/THD/TLC/FTR/TR). The pattern: register a MFR in atlas_manufacturers, audit substring-extracts the name, but card prose almost always means the engineering concept. Blocklist remains the right idiom.

## Decision #206 — Atlas Coverage Report: weekly chart + PostgREST 1000-row cap on coverage RPC (May 27, 2026)

### Context

User opened `/atlas` and reported two visual problems with the growth chart, then a deeper data-correctness problem surfaced during the fix:

1. **Y-axis didn't match the KPI.** Cumulative line topped at ~330k while the "Products Cataloged" tile read 184,210. Two different numbers, no explanation on screen.
2. **X-axis spacing was uneven.** Calendar-time gaps compressed; ingest-busy days fanned out.
3. **PDF export was missing the chart** entirely (intentional `data-no-print="true"` from an earlier session) and page 1 of the export looked half-empty.

The chart was reading from `events[].partsInserted` and computing its own cumulative from per-batch gross inserts. That number has nothing to do with the live catalog — it's "how much work has the pipeline done over time," monotone-increasing forever even when products get disabled or churned. The route was already computing the right number (`series.cumulativeProducts`, bucketed by `atlas_products.created_at`) and shipping it in the response payload — the chart simply wasn't consuming it.

### Decision

Three coordinated changes plus a load-bearing side-fix.

1. **Chart re-bucketed to ISO weeks, sourced from `series`.** [components/admin/AtlasGrowthChart.tsx](../components/admin/AtlasGrowthChart.tsx) now accepts `series: AtlasGrowthSeriesPoint[]` instead of `events`. Client-side grouping: take the last `cumulativeProducts` value seen in each ISO week (Monday-start), forward-fill weeks with no inserts, derive weekly delta as `cumulative[i] − cumulative[i-1]`. X-axis is a continuous band of week-start dates from the first observed week through today — empty weeks render as zero-height bars with a flat line segment so calendar gaps reflect honest time, not ingest cadence.

2. **Growth RPC filters to enabled MFRs the same way the KPI does.** [scripts/supabase-atlas-growth-rpc.sql](../scripts/supabase-atlas-growth-rpc.sql) — both subqueries `LEFT JOIN LATERAL` against `atlas_manufacturers` on `(name_display = manufacturer OR name_en = manufacturer)`, `WHERE COALESCE(m.enabled, true) = true`. Mirrors [app/api/admin/atlas/route.ts:121–131](../app/api/admin/atlas/route.ts#L121) which prefers `atlas_manufacturers.enabled` (Decision #161) with `atlas_manufacturer_settings` as fallback.

3. **PDF export polish.** [components/admin/AtlasOverviewTab.tsx](../components/admin/AtlasOverviewTab.tsx) — removed `data-no-print="true"` from the chart wrapper, added `@media print` overrides on `.MuiChartsAxis-line / -tick / -tickLabel` and `.MuiChartsLegend-label` so the dark-theme-baked SVG renders readable on white. Forced KPI grid to 4 columns at print width (responsive breakpoint falls to xs at ~720px, the Letter content area). Tightened category-card grid to 5 columns and shrunk page margins from 0.5in → 0.4in. Report compressed from ~10 pages to ~3.

### The load-bearing side-fix: PostgREST max-rows cap on TABLE-returning RPCs

Once the chart was switched to the correct data source, it landed at ~338k while the KPI was still showing 184k. That meant the KPI itself was wrong — and had been for some time. Investigation chain:

- Direct SQL: `SELECT COUNT(*) FROM atlas_products` returned 338,491.
- Direct SQL: `SELECT SUM(product_count) FROM get_atlas_coverage_aggregates('{}'::jsonb)` also returned 338,491.
- Cached `admin_stats_cache` row keyed `atlas-coverage`: `totalProducts: 184210`.
- `SELECT COUNT(*) FROM get_atlas_coverage_aggregates('{}'::jsonb)` returned **1,896**.

The coverage RPC `RETURNS TABLE` (8 columns, one row per `(manufacturer, family_id, category, subcategory)` tuple). PostgREST applies a server-side **`max-rows` cap of 1000** to table-shaped RPC responses on Supabase. The route called the RPC via `supabase.rpc(...)` with no `.range()` chaining and consumed the first 1000 tuples, summing them to 184,210 instead of the true 338,491. A `.range(0, 99999)` retry confirmed the cap is enforced server-side and can't be overridden by client headers.

**Fix:** converted the RPC to `RETURNS jsonb`, wrapping the SELECT in `jsonb_agg(row_to_json(t))`. JSONB is a single scalar value — the row cap doesn't apply. Mirrors the pattern already used by `get_atlas_growth_aggregates` (Decision #183), `get_triage_unmapped_aggregate` (Decision #180), and `get_atlas_coverage_aggregates` was the only aggregation RPC still using TABLE. Route's consumer code (`aggResult.data` as Array) works unchanged because PostgREST already returns the JSONB array as a JS array.

### Impact

After cache invalidation:

| KPI | Before | After |
|---|---|---|
| Products Cataloged | 184,210 | 338,491 |
| Live Manufacturers | 123 | 241 |
| Chart cumulative right edge | ~330k (wrong source) | 338,491 (matches KPI) |

Both `Products Cataloged` and `Live Manufacturers` had been silently frozen by the same truncation. The "123 live MFRs" number was the count of distinct manufacturer strings appearing in the first 1000 aggregate tuples — coincidentally readable, but wrong.

### Lessons

1. **TABLE-returning RPCs on Supabase carry a silent failure mode.** PostgREST's server-side `max-rows` cap (default 1000) applies to the entire response body, including aggregation RPCs that intend to return all rows. The TS client doesn't error or warn — `data` is just shorter than expected. Once `atlas_products` grew past ~120 MFRs, the cap silently kicked in and the KPI under-reported for weeks. **Default to `RETURNS jsonb` for any aggregation RPC in this codebase.** Decisions #179, #180, #183 all settled on jsonb; the coverage RPC was the holdout and the lesson cost real customer-visible numbers.

2. **When two on-screen numbers disagree, both might be wrong.** The chart was reading the wrong data source (gross inserts); the KPI was reading the right data source but silently truncated. Either alone could have been "the bug." The fix only landed because we kept verifying numbers against `SELECT COUNT(*)` ground truth at each step — neither dashboard number was authoritative.

3. **Mirror the KPI's filter logic exactly when correlating numbers across panels.** The growth RPC initially filtered by `atlas_manufacturer_settings.enabled` (the legacy table). The KPI prefers `atlas_manufacturers.enabled` with settings as fallback. Without matching filters, the chart's cumulative would never agree with the KPI even if both data sources were truthful. The `LEFT JOIN LATERAL (name_display OR name_en) LIMIT 1` pattern mirrors the TS `mfrIdentity` map exactly.

4. **Server-rendered route responses can outlive a cache invalidation by one request.** During debugging the user ran `DELETE FROM admin_stats_cache` and reloaded — but the page had been loaded once between the DELETE and the dev-server restart, which let the OLD route code recompute and re-cache the wrong value. Subsequent refreshes appeared "broken" because they were serving the freshly-rebuilt cache. Resolution: re-DELETE after the dev restart, then reload. Worth remembering when chasing cache-related discrepancies: invalidation is a point-in-time act, and any request that hits the stale code between invalidation and code-deploy will re-poison the cache.

5. **The admin toggle UI is currently a no-op for the KPI.** [Decision #107](#) describes the toggle writing to `atlas_manufacturer_settings`. [Decision #161](#) added `atlas_manufacturers.enabled` and routed the KPI to prefer it. The two were never reconciled — the toggle still writes to settings, but the KPI reads atlas_manufacturers (which is always `enabled = true` because the toggle never writes there). Tracked as a separate Backlog item; not fixed here because no MFRs are currently disabled and the chart change doesn't depend on it. But the divergence is a real bug waiting for the day someone disables their first MFR and watches nothing change in the count.

## Decision #207 — FAMILY_PARAM_SIGNATURES regex bug fix + cooccurrence layer (May 27, 2026)

**Status:** Implemented & deployed to atlas_products

### Problem

The Atlas classifier's `FAMILY_PARAM_SIGNATURES` registry in [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) used `\b` (word boundary) anchors in 9 of 12 signature patterns. JavaScript regex treats `_` as a `\w` character, so `\b` does NOT match between letters and underscores — patterns like `/^hfe\b/i` failed silently on real-world Atlas keys (`hfe_min`, `hfe_max`, `vceo_v`, `bvceo_v`, `vebo_v`, etc.).

Survey (May 27, 2026) found ~64% of the B7 IGBT family (2,774 of 4,317 products) were misclassified BJTs because the signatures never fired on the data shapes our 13 affected MFRs ship.

### Fix

Three interlocking changes:

1. **Regex pattern fix.** Replaced `\b` with `(?![A-Za-z0-9])` negative lookahead across all 9 buggy signatures (B6 vcbo/vceo/vebo, B6 ic, B6 hfe, B6 ft, B5 qg, B7 eon|eoff|ets, B9 idss, E1 ctr, E1 viso). The negative lookahead correctly handles `_`, paren, space, and end-of-string. Already-correct patterns using `[\s_(]*` (B5 rds_on, B5 vgs_th, B7 vce_sat) left as-is.

2. **Cooccurrence layer.** New `requiresAlsoMatching?: RegExp[]` optional field on `ParamSignature`. The reclassifier in `atlasMapper.ts → reclassifyByParameterSignals` checks: signature only fires if at least one OTHER paramName on the same product matches one of the cooccurrence patterns. Applied to **5 signatures** for params shared across families:
   - **B6 Ic** requires BJT-unique (hfe / vcbo|vceo|vebo) — IGBTs spec Ic too
   - **B6 fT** requires BJT-unique — RF MOSFETs spec fT too
   - **B5 Vgs(th)** requires MOSFET-unique (Rds(on)) — IGBTs have voltage-controlled gates too
   - **B5 Qg/Qgs/Qgd** requires MOSFET-unique (Rds(on)) — IGBTs spec gate charge too
   - **B7 Vce(sat)** requires IGBT-unique (Vces / Eon|Eoff|Ets) — BJTs spec switching saturation too

   Rds(on) is the only truly MOSFET-unique signal (IGBTs are bipolar conduction, no channel resistance). Tightening MOSFET cooccurrence to just Rds(on) means a MOSFET that ships data with only Vgs(th)/Qg (no Rds(on)) won't auto-reclassify — rare in practice since Rds(on) is virtually always specified.

3. **Triage defensive skip.** `detectForeignFamilyWithList` (the per-paramName entry point used by the Triage UI in [app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts)) cannot evaluate cooccurrence — it only has one paramName. So it defensively skips cooccurrence-required signatures (returns null). Engineers still surface auto-flags for the strictly-unique ones (hfe / vcbo|vceo|vebo / rds_on / eon|eoff|ets / idss / ctr / viso); the cooccurrence-required ones (ic / ft / vgs_th / qg / vce_sat) require manual product-context review. Tracked as a follow-up enhancement in [BACKLOG.md](BACKLOG.md) — batch-level cooccurrence is an option.

### Mirror to scripts/atlas-ingest.mjs (Decision #176 convention)

Both `FAMILY_PARAM_SIGNATURES` (lines 212–245) and `reclassifyByParameterSignals` (lines 247–290) in `scripts/atlas-ingest.mjs` updated to match `lib/services/`. The .mjs script is the production ingest pipeline; it duplicates TS code byte-for-byte per the no-import-path convention. The two `_COOCCURRENCE_PATTERNS` constants (BJT, MOSFET, IGBT) are mirrored.

### Validation harness

New script [scripts/atlas-family-signatures-validate.mjs](../scripts/atlas-family-signatures-validate.mjs) runs three Supabase-backed checks before any production-data action:

- **Check A — Cross-family safety.** Pulls every distinct paramName across atlas_products per family (231,148 rows scanned). Asserts no paramName outside B5/B6/B7/B9/E1 matches any signature. Original implementation had a subtle bug (`NON_DISCRETE_FAMILIES` regex excluded E1 and F-families) — caught by code review and fixed. The corrected check surfaces 89-102 CT MICRO B8 products carrying `viso_rms_v` — pre-existing data drift (c3="Triac, SCR Output Optoisolators" in source JSON should route to E1), not a regression. Documented in [BACKLOG.md](BACKLOG.md) as separate cleanup.
- **Check B — 244 legitimate B7 IGBTs non-touch.** Simulates the full reclassify pipeline against B7 products carrying `vces_max ∪ eoff ∪ igbt_technology`. Initial run with the BJT-only fix showed 128 CREATEK IGBTs would misroute B7→B5 via vgs_th, then 27 CRMICRO IGBTs via Qg. Each surfaced an additional cooccurrence requirement (above). Final post-fix run: 0 reclassifications.
- **Check C — B6 dict coverage gaps.** Lists raw paramNames in the 13 affected MFR JSON files that won't translate cleanly to the B6 dict post-reclassification (123 entries). Informational only; engineers add dict entries via the normal Triage workflow.

### Apply outcomes

Staged smoke test on WPMSEMI (smallest, 5 products) verified the exact 5 known BJTs (HFT3837/HFT3838/HFT4083NW/HFT4083PW/HFT4083QW) flipped B7→B6. After confirmation, the remaining 12 MFRs applied via standard admin batch-apply workflow.

**Aggregate impact (DB-wide):**
- B7 family: 4,317 → 1,302 (~70% reduction, 3,015 misclassified products fixed)
- B6 family: corresponding growth
- Per-MFR breakdown (post-apply BJT count in B6): WPMSEMI 5, MDD 31, Prisemi flipped 65 reverse (IGBTs to B7), WAY-ON 66, BORN 85, Slkor 101, Jingheng 120 reverse, SALLTECH 132, Comchip 211, LRC 487, YANGJIE 551 mostly attr-only + 118 reverse, SWST 864, KEXIN 1,115

Several MFRs (Prisemi, Jingheng, YANGJIE) surfaced **reverse-direction fixes** — products misclassified as BJTs (B6) when their source JSON `c3="IGBTs"` clearly identifies them as IGBTs (B7). These are pre-existing data drift fixed by c3 routing alone (not by my new signatures); same shape as the CT MICRO opto-SCR cleanup pattern. Net effect across the 13 MFRs: more accurate classifications in both directions.

### Lessons

- **JS regex `\b` is not the same as a "word boundary that respects identifier syntax".** It matches between `\w` and `\W`, and `_` is `\w`. Use `(?![A-Za-z0-9])` for an identifier-aware trailing boundary OR use `[\s_(]*`-style explicit-character-class idioms.
- **Shared-across-families parametric signals need cooccurrence guards, not standalone matching.** A param that's "BJT-specific" by intent may actually be shared (Ic is both BJT collector current AND IGBT collector current). Without cooccurrence, signatures that fire on these false-positive across families. Discovered the pattern with Ic/fT (planned); had to extend mid-session to Vgs(th)/Qg (MOSFET-IGBT overlap) and Vce(sat) (BJT-IGBT overlap). The cleaner architectural alternative — `forbidsAlsoMatching` (negative cooccurrence) — was considered and rejected; positive cooccurrence is safer-by-default in an open-world (any unknown param becomes a "not forbidden" signal under negative cooccurrence).
- **Validation reveals scope; validation guides patches.** The original BACKLOG diagnosis listed only the regex bug + Ic/fT guards. Three additional guards (vgs_th, Qg, vce_sat) emerged from Check B regression discovery and WPMSEMI dry-run. The validation script is the load-bearing safety net; the code change itself is mechanical once the validation is in place.
- **Re-ingest fixes more than the targeted change.** Running --report on the 13 MFRs surfaced ~3,015 misclass fixes — well above the BACKLOG-predicted 2,774. The extras come from (a) the reverse-direction IGBT-misclass-in-B6 cases (Prisemi/Jingheng/YANGJIE) and (b) attribute key normalization (dict-canonical IDs). Decision to apply: net data quality improvement, 30-day per-batch revert window, no regressions caught by validation.

### Files

- [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) — signature registry + cooccurrence constants + Triage detector
- [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) lines 86–152 — `reclassifyByParameterSignals` with cooccurrence guard in Phase 2 loop
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) lines 212–296 — mirror per Decision #176
- [scripts/atlas-family-signatures-validate.mjs](../scripts/atlas-family-signatures-validate.mjs) — new validation harness (Checks A/B/C)
- [__tests__/services/atlasFamilyParamSignatures.test.ts](../__tests__/services/atlasFamilyParamSignatures.test.ts) — new test file (pattern + detector coverage)
- [__tests__/services/atlasMapper.test.ts](../__tests__/services/atlasMapper.test.ts) — extended with cooccurrence + real-MFR fixture cases (WPMSEMI/SWST/KEXIN/CREATEK/CRMICRO)

### Related

- Decision #175 — Phase 1 of `reclassifyByParameterSignals` (B1 Type-value signals)
- Decision #176 — Mirror convention for atlas-ingest.mjs
- Decision #177 — Foreign-family auto-flag registry (the registry this fix audits)
- Decision #188 — Engineer-driven `atlas_family_param_signatures` DB table (code wins on collision; DB rows untouched by this fix)

## Decision #208 — Triage Near-Duplicate Clustering: Two-Tier Hybrid (May 29, 2026)

### Problem

The Atlas Dictionary Triage queue's existing "+N similar" cosmetic-variant fanout (Decision #186 part f) only matched paramNames that collapsed to the same normalized key under `/[^\p{L}\p{N}]+/gu` — whitespace, case, punctuation. Engineer review throughput was the bottleneck on the 200-1000-row typical queue: every paramName that survived Tier-1 normalization was one more Accept the engineer had to issue.

Categories the existing matcher missed:
- ASCII single-char typos (`propogation_delay` vs `propagation_delay`)
- CJK character semi-equivalents and synonyms (`工作电压` vs `操作电压`)
- Unit-suffix presence/absence (`电压(V)` vs `电压`)
- Abbreviation vs full form (`T` vs `thickness`)
- Word reordering

### Design — two tiers

**Tier 1 (deterministic, this Decision):** Extend the existing matcher with ASCII-only Levenshtein-1 fuzzy fallback. Catches single-char typos in pure-ASCII paramNames at length ≥ 5 (e.g. `propogation_delay` ≡ `propagation_delay`). Gated against CJK and Greek/Cyrillic characters because per-character semantic weight is too high — `电压_max` vs `电流_max` is Levenshtein distance 1 but means voltage_max vs current_max, opposite concepts. Also explicitly does NOT strip unit suffixes — `电压(V)` and `电压(mV)` must stay distinct so bulk-apply can't propagate a wrong unit. Lives in new module [lib/services/paramNameSimilarity.ts](../lib/services/paramNameSimilarity.ts) with 22-test coverage. Component [GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) imports `normalizeParamKey` + `isFuzzyMatch` from there.

**Tier 2 (AI, opt-in, this Decision):** New per-row "Find Similar (AI)" icon button calls `POST /api/admin/atlas/dictionaries/cluster-suggest` with the focal paramName + the open candidates in the same scope (already in client memory — no DB read). Sonnet 4.6, max_tokens 1500, single call returns `[{paramName, isMatch, confidence, reasoning}]`. Modal renders the cluster with high+medium-confidence matches pre-checked; engineer reviews per-row reasoning, ticks/unticks, clicks "Accept N matches". Each Accept fires through the existing `acceptMatchWithPrimaryOverride()` so the audit trail and `invalidateTriageQueueCacheAndAwaitFresh()` invalidation behave identically to the existing Tier 1 fanout. Cached in localStorage (7d TTL, prefix `atlas-cluster-suggest-v1:`) keyed `(scopeKind::scopeKey, focalParamName)` — verdicts are paramName-text-stable; client filters cached entries against the current candidate set on re-open.

### Why scoped back from the original plan

The plan committed to three Tier-1 features: parens-unit-stripping, CJK punctuation fold, ASCII Levenshtein. On second pass before implementation:

- **Parens-unit-stripping was data-integrity-unsafe.** `电压(V)` and `电压(mV)` would have clustered, and a bulk-applied override would propagate the focal's unit (V) onto rows that are actually in mV. The engineer's cluster preview would catch obvious cases, but the whole point of Tier 1 is to reduce review burden — relying on engineer inspection to backstop a known-unsafe matcher defeats the point.
- **CJK punctuation fold was redundant.** The existing `/[^\p{L}\p{N}]+/gu` regex already treats full-width and half-width punctuation as the same non-letter/non-digit run inside paramNames, so `电压（V）` and `电压(V)` already collapse to `电压_v`. A fold table would have done nothing the regex isn't already doing.
- **CJK Levenshtein was data-integrity-unsafe.** `电压` vs `电流` is distance 1 but means voltage vs current. ASCII-only restriction keeps the fuzzy tier inside its safe envelope.

Both removed features land in Tier 2 (AI) where Sonnet can reason about semantics + sample values rather than blindly trusting a distance metric.

### Files

- **NEW** [lib/services/paramNameSimilarity.ts](../lib/services/paramNameSimilarity.ts) — `normalizeParamKey` (lifted from component), `isAsciiOnly`, `levenshteinDistance`, `isFuzzyMatch`
- **NEW** [__tests__/services/paramNameSimilarity.test.ts](../__tests__/services/paramNameSimilarity.test.ts) — 22 tests covering the safety envelope (CJK skip, opposite-pair rejection at Levenshtein 2, min-length-5 guard, unit-suffix retention)
- **NEW** [app/api/admin/atlas/dictionaries/cluster-suggest/route.ts](../app/api/admin/atlas/dictionaries/cluster-suggest/route.ts) — Tier 2 Sonnet endpoint
- **NEW** [components/admin/atlasIngest/ClusterPreviewModal.tsx](../components/admin/atlasIngest/ClusterPreviewModal.tsx) — checkbox grid + reasoning column + cache
- [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx) — extended `normalizedMatchesByRow` with fuzzy-fallback merge pass; new `renderFindSimilarButton` per-row; modal mounted at component root

### Amendment — Cross-scope mode (May 31, 2026)

Triggered by recurring "I keep accepting AEC-Q101 across every family" pain. Same-scope-only Tier 2 forced an engineer to open Find Similar 20+ times for one canonical (AEC-Q101 / AEC-Q100 spans B1–B9, C1–C10, E1, F1–F2). The fix: Find Similar (AI) is now **cross-scope by default**. Candidates = every open unmapped row in the queue (minus focal + Tier 1 cosmetic siblings + actively-mapped + unscoped). Per-row scope chip + AI verdict + engineer review per match is the safety machinery.

**Four guardrails ship alongside the wider candidate net:**

1. **Per-row scope chip.** Engineer sees "B5 MOSFETs" / "MLCC Capacitors" / "Microcontrollers" next to every candidate. Context is never hidden — clicking through a wide cluster without realizing you're crossing scopes is impossible.
2. **Conservative defaults on cross-scope.** Only `high` confidence pre-checked. `medium` and `low` require explicit tick. Same-scope retains `high + medium` default (smaller blast radius).
3. **Generic-term warning banner.** Focal paramName normalized to one of [`frequency`, `voltage`, `current`, `capacitance`, `inductance`, `resistance`, `power`, `tolerance`, `type`, `style`, `size`, `level`, `time`, `rate`] surfaces a yellow Alert at modal top — *"Frequency / Voltage / etc. often means different things in different scopes."* These are the canonicals where cross-scope clustering most risks data-integrity bugs. Unit-suffixed forms (`Voltage (V)`, `Frequency (Hz)`) explicitly do NOT trigger the warning — the unit pins down the concept.
4. **Prompt hardening for cross-scope generic terms.** Sonnet receives an extra block when both `crossScope=true` AND focal is a generic term: explicit instruction to default `isMatch=false` and only return `true` when sample-value scale + reasoning unambiguously align. Three worked examples in-prompt (Frequency, Capacitance, Power) to anchor the conservatism.

**Parent sorts candidates exact-normalized-key-first.** `MAX_CANDIDATES=50` caps the prompt; without prioritization, a focal in a large-queue scope could push the obvious matches (e.g. every other `AEC-Q101` row) below the cap. Now any row whose `normalizeParamKey` collapses to the same key as the focal ranks first.

**Cache prefix bumped `v1` → `v2`.** v1 verdicts were generated under same-scope-only context; reusing them as cross-scope verdicts would surface stale reasoning. v2 forces a re-evaluation under the new prompt.

**What did NOT change:** the Tier 1 cosmetic-variant fanout (whitespace/case/punctuation + ASCII Levenshtein-1) is still scope-local — it composes cleanly with cross-scope Tier 2. Tier 1 fanout still fires when accepting a focal from inside the modal (matches the row-Accept-button behavior).

**Tests:** added `isGenericTerm` coverage (5 new tests, 27 total in `paramNameSimilarity.test.ts`, 1761 total).

### Deferred to BACKLOG

**Tier 3** — eager batch-level clustering at ingest time so the engineer sees pre-computed clusters instead of clicking "Find Similar" per row. Wait until Tier 1+2 show whether per-row opt-in is the throughput bottleneck. If so, run `/cluster-suggest` once per batch in the background and surface ready-to-Accept clusters as a dashboard tile.

### Related

- Decision #181 — AI Triage Suggester (the per-row /suggest endpoint this Tier 2 mirrors structurally)
- Decision #185 — AI Triage Investigator (six-bucket verdict + cached-analysis pattern reused for cluster cache shape)
- Decision #186 part f — Bulk normalized-match Accept (the existing Tier 1 fanout this Decision extends)
- Decision #187 — Proactive staleness signaling (cluster-suggest cache could later adopt the same `cardVersionAtWrite` / `schemaVersionAtWrite` pattern if cluster verdicts start depending on per-family schema state)
- BACKLOG line 185 — "Promote cross-family canonicals to SHARED_PARAMS once reused ≥3 times" (related but different fix: that one lifts canonicals into the codebase shared dict; this amendment lets engineers fan out overrides across scopes in one click without lifting to shared)
- BACKLOG line 1087 — "Multi-category override fan-out in inline Accept" (the L2-category analog of this cross-scope flow; multi-category fan-out still tracked separately since it doesn't pass through Find Similar)

---

## Decision #209 — Side-by-side comparison panel row alignment + flag/clamp polish (May 31, 2026)

### Problem

When a user opened the side-by-side comparison view, sparse-data replacements broke vertical row alignment with the source panel: `OverviewContent` conditionally dropped the entire Description / Datasheet / Lifecycle Status rows and the whole Environmental & Export section when those fields were absent on a candidate, pushing all subsequent rows up on the right side. Long descriptions also pushed rows asymmetrically (3-line vs 2-line). Separately, the Chinese-MFR flag (🇨🇳) rendered on the recommendation card but disappeared from both the comparison-view sticky header and the Overview hero, so Atlas-sourced parts looked like Western parts the moment the user clicked into them.

### Design

1. **Always-render rows with `—` fallback.** In [components/AttributesTabContent.tsx](../components/AttributesTabContent.tsx) `OverviewContent`, Description / Datasheet / Lifecycle Status and the four fixed Environmental & Export rows (RoHS, REACH, ECCN, HTS Code) now always render — sparse data shows `—` instead of dropping the row. Mirrors the existing parts.io row pattern already there (Years to EOL / Risk Rank / Country of Origin). Cross References stays source-side-only (final section, no alignment cost). Dynamic per-region HTS rows still conditional since their count is data-dependent.

2. **Description clamp + tooltip + overflow-only affordance.** Extracted `DescriptionRow` subcomponent with `-webkit-line-clamp: 2` and `minHeight: '2.8em'` so every Description cell reserves the same 2-line vertical space regardless of content length. `ResizeObserver` measures `scrollHeight > clientHeight` to detect actual overflow; only then does the MUI Tooltip + `cursor: 'help'` activate.

3. **CN flag everywhere a MFR name renders.** Added the existing 🇨🇳 + "Chinese manufacturer" Tooltip pattern to [ComparisonView.tsx](../components/ComparisonView.tsx) sticky header (restructured the click-to-open-profile handler onto an inner Box so the flag sits outside it but inside the same Typography line) and to `OverviewContent` hero. AttributesPanel's sticky header already had it.

### Files

- [components/AttributesTabContent.tsx](../components/AttributesTabContent.tsx) — `OverviewContent` row pattern, `DescriptionRow` subcomponent, hero flag.
- [components/ComparisonView.tsx](../components/ComparisonView.tsx) — sticky-header flag.

### Related

- Decision #161 — `mfrOrigin` resolution at response time (this flag work consumes the same field).

---

## Decision #210 — Comparison-view part-swap prevention: skip Atlas re-fetch + MFR-match validation (May 31, 2026)

### Problem

Clicking a recommendation card opened the comparison view correctly with the picked part (e.g. AK's `2SC2873`), but ~5 seconds later the right panel silently swapped to a different part with a different MFR (Toshiba's `2SC2873-Y(TE12L,ZC)`). Root cause: `handleSelectRecommendation` in [hooks/useAppState.ts:1486](../hooks/useAppState.ts#L1486) fires `getPartAttributes(rec.part.mpn)` to enrich the panel — but `/api/attributes/[mpn]` resolves MPN-only against Digikey. For Chinese parts (Atlas), Digikey returns whatever it ranks highest for that MPN under any MFR. For generic JEDEC MPNs (`2SC2873`, `2N3904`), even Western parts can return a different MFR's packaging variant.

### Design — two guards

1. **Skip re-fetch entirely for Atlas-sourced recs.** When `rec.part.mfrOrigin === 'atlas'`, set `isLoadingComparison: false` immediately and leave `comparisonAttributes: null`. `ComparisonView`'s existing fallback at [line 182](../components/ComparisonView.tsx#L182) — `(replacementAttributes ?? recommendation).part` — uses the recommendation's authoritative Atlas data for Overview/Commercial, and Specs falls back to `matchDetails.replacementValue`. No enrichment to gain since Digikey doesn't carry Chinese MFRs.

2. **Validate MFR match on non-Atlas re-fetches.** After the fetch returns, compare `attributes.part.manufacturer` to `rec.part.manufacturer` case-insensitively. If they differ, log the mismatch and set `comparisonAttributes: null` so the fallback path takes over. Catches generic-MPN cases (BJT base numbers, JEDEC standards) where Digikey legitimately returned a different MFR's variant.

### Why not server-side filtering

`getAttributes()` could be extended to accept a manufacturer hint and filter Digikey results, but Digikey's Product Details API takes only MPN — filtering would require a keyword-search detour. Client-side discard is simpler, gives the user a visibly-correct panel immediately, and doesn't waste downstream enrichment work on a known-wrong fetch.

### Files

- [hooks/useAppState.ts](../hooks/useAppState.ts) — `handleSelectRecommendation` skip-Atlas branch + MFR-mismatch guard.

### Related

- Decision #161 — `mfrOrigin` field this branch keys off.
- Decision #133 — certified-cross bypass (similar "trust the input, override our automation" pattern).

---

## Decision #211 — Automotive qualification: rule-level enforcement (B6 PoC), classifier broadening, cross-surface AEC chip visibility, Grade row (May 31, 2026)

### Problem

Selecting "Yes — automotive (AEC-Q101 required)" on a BJT context question had no effect on recommendation ordering: a non-AEC-Q101 part (FMMT495TA) ranked at the top. Two stacked gaps:

1. The B6 context effect `escalate_to_mandatory` on `aec_q101` ([contextModifier.ts:58-60](../lib/services/contextModifier.ts#L58-L60)) only bumped weight to 10 — it didn't set `blockOnMissing` and didn't change rule type. The underlying `identity_flag` evaluator at [matchingEngine.ts:404-452](../lib/services/matchingEngine.ts#L404-L452) defaults missing source value to `'No'`, so `sourceRequired = false` and the rule trivially passed for every candidate regardless of automotive intent.
2. No post-scoring filter existed for B6 (only C2, C4–C10, D1–D2, E1, F1–F2 were filtered at [partDataService.ts:1459-1484](../lib/services/partDataService.ts#L1459-L1484)).

Stacked second-order problem: AEC qualification chips were ALSO invisible across the app even when the underlying data was correct. `upgradeFromAttributes` ([qualificationDomain.ts:123](../lib/services/qualificationDomain.ts#L123)) only checked `aec_q200`, so BJTs/MOSFETs/IGBTs/ICs with `aec_q101`/`aec_q100` classified as `unknown` → `DomainChip` rendered nothing → `isDomainCoveredQualification('AEC-Q101')` stripped the plain-chip fallback too → silent.

### Audit: Path A (rule-level fail + post-scoring drop) vs. Path B (qualification-domain hard-exclude)

Path B (extend the Decision #155/#196 qualification-domain classifier registry to B6 BJTs) was the original instinct — it's the intended general mechanism. **Rejected on audit:** it hard-excludes cross-domain candidates entirely (silently hidden), which conflicts with the user UX intent of keeping cards visible with an explicit `aec_q101` rule-fail row in the Specs comparison so engineers can see WHY a non-Q101 card was rejected and override if justified. Path A also avoids per-MFR classifier scaffolding (Path B needs an MPN-prefix table per manufacturer per family, like the existing Murata MLCC classifier).

### Design — engine

1. **Context-driven source-attribute injection (scoring-local, B6 + automotive).** New helper `applyContextSourceOverrides(sourceAttrs, applicationContext, familyId)` in [partDataService.ts](../lib/services/partDataService.ts) clones `sourceAttrs` and injects `aec_q101: 'Yes'` when `familyId === 'B6' && applicationContext.answers.automotive === 'yes'`. The matching engine sees the override (`scoringSourceAttrs`); the returned `sourceAttributes` (rendered in the user's Specs panel) is untouched so the user isn't confused by a synthetic 'Yes' on a source part that doesn't carry it. Pattern designed for one-line extension to other family/context combos.

2. **B6 post-scoring filter.** New `filterBjtAutomotiveMismatches` drops candidates whose `matchDetails` entry for `aec_q101` has `ruleResult === 'fail'`. With the source override, `evaluateIdentityFlag`'s default-to-`'No'` behavior on missing candidate data falls through to the fail branch, so the filter catches both explicit `'No'` AND missing-data candidates. Registered as Step 3a in the family-id switch, wrapped with the existing `withCertifiedBypass` so MFR-certified and Accuris-certified crosses still surface (Decision #133).

### Design — classification broadening

3. **`upgradeFromAttributes` extended.** Now accepts `aecQ101Value`, `aecQ100Value`, and a `qualifications?: string[]` array. Q101/Q100/Q200 attribute values are checked in turn; if none fire, the `qualifications` array is scanned for `AEC-Q101`/`Q100`/`Q200` prefixes (case-insensitive). This was the load-bearing fix: per-category param maps don't always include AEC fields (e.g. C1 LDOs map none of `aec_q*`), but `extractQualifications` populates `part.qualifications` from Digikey's "Ratings"/"Features"/"Qualification" text fields uniformly across all categories.

4. **Attributes route classifies at response time.** [/api/attributes/[mpn]/route.ts](../app/api/attributes/[mpn]/route.ts) now runs `classifyQualificationDomain` + `upgradeFromAttributes` and writes `qualificationDomain` onto the response. Same pattern as the Decision #161 `mfrOrigin` tagging — resolved at response time so L2-cached `PartAttributes` don't need a schema bump. Previously the classification step only ran inside `getRecommendations()`, so source-only views (attributes panel before user clicked "Find Replacements") had no domain → no chip.

### Design — UI surfaces

5. **Grade row in Overview Attributes.** New `FieldRow label="Grade"` between Lifecycle Status and Years to EOL in `OverviewContent`. Reads `part.qualificationDomain.domain` and renders via existing `humanReadable()` helper ("AEC-Q100 Automotive" / "Medical — implantable (GHTF D)" / "MIL-spec" / etc). Always rendered (`—` when unknown) for the row-alignment pattern from Decision #209.

6. **AEC chips on chat search-result + Add Part picker.** [PartOptionsSelector.tsx](../components/PartOptionsSelector.tsx) and [AddPartDialog.tsx](../components/parts-list/AddPartDialog.tsx) previously filtered AEC labels through `isDomainCoveredQualification` (which strips them on the assumption `DomainChip` will render them instead). But those surfaces don't render `DomainChip` — `PartSummary` carries no `qualificationDomain`. Dropped the filter on those two surfaces only; the chips now render directly from `PartSummary.qualifications`. RecommendationCard's filter stays (it does render DomainChip alongside).

### Out of scope (BACKLOG)

- Replicating the automotive enforcement pattern to B5/B7/B8/B9/C9/C10/D1/D2/E1/F1. Same shape applies but B6 is the proof of concept.
- Generalizing the source-attribute override switch beyond `automotive`. Medical / military / aerospace contexts could ride the same mechanism if/when those context questions land in family files.

### Files

- [lib/services/qualificationDomain.ts](../lib/services/qualificationDomain.ts) — `upgradeFromAttributes` accepts Q101, Q100, and `qualifications[]`.
- [lib/services/partDataService.ts](../lib/services/partDataService.ts) — `applyContextSourceOverrides`, `filterBjtAutomotiveMismatches`, B6 registered in family-id switch, both classification call sites pass new args.
- [app/api/attributes/[mpn]/route.ts](../app/api/attributes/[mpn]/route.ts) — response-time domain classification.
- [components/AttributesTabContent.tsx](../components/AttributesTabContent.tsx) — Grade row.
- [components/PartOptionsSelector.tsx](../components/PartOptionsSelector.tsx) — chip filter removed.
- [components/parts-list/AddPartDialog.tsx](../components/parts-list/AddPartDialog.tsx) — chip filter removed + chips rendered.

### Related

- Decision #133 — certified-cross bypass (reused by `withCertifiedBypass` wrap).
- Decision #155 / #196 — qualification-domain filter (the rejected Path B; classifier registry remains Phase 1 / Murata MLCC).
- Decision #161 — response-time tagging pattern (mfrOrigin → qualificationDomain).
- Decision #209 — row-alignment fallback pattern (Grade row inherits it).

---

## Decision #212 — Audit-check expansion + Fix-with-AI button UX: make the panel the answer (June 1, 2026)

### Context

Pre-Decision #195 the auto-audit caught four hallucination classes (BOGUS_MFR, OMITTED_MFR, WRONG_PREFIX, FABRICATED_DICT) and produced an advisory panel. In practice the operator still had to decide on every card whether to click **Fix with AI**, whether to **Approve** despite an amber Health chip, and whether a given flag was actually actionable. Each ambiguous card became a "can you sanity-check this for me?" round with engineering — not scalable for an operator-trained workflow.

Three concrete failure modes surfaced in a one-session card-audit sprint:

1. **Fix-with-AI loops on advisory-only cards** — operator clicked the button on cards with no block-level flags, AI returned a no-op proposal, accept fired with no change, audit re-fired same advisory → endless loop. Button gave no visual signal that there was nothing to fix.
2. **High-share MFR omissions silently passed approve** — SWST at 25% of family B3 was a top-share MFR missing from the cohort claim, classified as advisory like a 6% editorial trim. Card claimed "cohort is X, Y, Z" and was materially wrong.
3. **Engineering claims (rule type, weight, dict arrow direction) entirely unverified** — audit only checked MFR/prefix data claims. A card asserting `output_voltage (identity_upgrade, w=8)` for a rule that's actually `identity, w=10` shipped clean. Even worse: Chinese→canonical dict arrows pointing at wrong targets shipped clean — silently misinforming downstream Atlas extraction.

Also: the Health chip ("Consider refresh" / "Refresh recommended") had three independent drivers (`flagCount`, `ruleDrift`, `groundingDrift`) but the chip looked identical regardless. Operator regenerated C1 three times trying to clear an amber chip — couldn't, because the driver was `flagCount` which clears only on **Approve**, not Regenerate. The chip didn't tell them which lever to pull.

### Design

**Button traffic-light** ([components/admin/AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx)) — Fix-with-AI button visual state IS the answer:
- Load-bearing flags ≥1 → `variant="contained"` amber, label `"Fix N issue(s) with AI"`. Click it.
- No load-bearing flags → `variant="outlined"` grey, label `"No issues to fix"`. Don't.
- Audit not yet run → outlined grey, label `"Fix with AI"`, disabled.
- Built-in card → outlined grey, label `"Fix with AI"`, disabled, tooltip directs to customize.

The operator-facing rule shrinks to one sentence: **if the button is filled, click it; if ghost, don't.**

**OMITTED_MFR escalation** ([lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts)) — new `OMIT_BLOCK_SHARE = 0.15` constant. Omissions whose share ≥15% move from advisory to block-level (`criticalOmittedMfrs` field on `CardAuditResult`). Block headline now reads `X hallucination(s) + Y critical MFR omission(s) — blocks Approve`. Fix-with-AI prompting handles critical omissions: instructs Sonnet to add a **bare cohort mention** (`"and SWST"`) — no prefix invention, since Fix doesn't have the grounding RPC. For prefix-level enrichment, the inline hint directs to Regenerate.

**WRONG_RULE_CLAIM check** — parses card text for `attributeId (type, w=N)` and `attributeId (weight=N, type)` shapes, validates against the family's logic-table rules. Flags type-only mismatches and weight-only mismatches separately. Conservative regex: only inspects attributeIds present in the logic table (no prose false-positives), only flags claims actually asserted (a card claiming type-only is checked for type only).

**WRONG_DICT_ARROW check** — two parallel paths:
- Chinese-source: `<Han>→<canonical>` walked, looked up in family + shared dicts, flagged when source-in-dict but target-mismatched.
- English-quoted-source: `"<english>"→<canonical>` walked, same lookup. Quoting is the high-confidence dict-claim signal — bare-id arrows (`vref_typ → output_voltage` without quotes) intentionally skipped because they're indistinguishable from prose arrows like `tc → BLOCKING`.
- Both paths consult `atlas_dictionary_overrides` (the engineer-accepted DB layer) before flagging — initially missed on the English path, fixed when C6 `"reference voltage" → adjustability` surfaced as a false positive that should have cleared via DB-override lookup.

**Health chip driver hint** ([AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx)) — under each amber/red chip, a `Typography.caption` lists the active driver(s) with the action that clears each: `+2 MFRs (regen) · 5 flags (approve)`. The operator can read at a glance whether Regenerate will help. Plus a **stale-flags downgrade**: when flagCount is the ONLY driver (no ruleDrift, no groundingDrift), the chip drops to `⚪ Stale flags (N)` outlined-grey — visually conveying that this is informational, not structurally urgent.

**Diff-vs-prior stacked mode** — word-level diff (`diffWordsWithSpace`) is unreadable past ~30% change ratio (regenerations interleave red/green tokens until both sides are illegible). Auto-switches to a stacked Prior/Current view at `DENSE_DIFF_THRESHOLD = 0.3`, with a manual Inline/Stacked toggle. Inline stays the default for small Fix-with-AI swaps where token-level deltas are the signal.

### Audit (deliberate non-additions)

- **Engineering-reason quote verification** considered — would parse `"<quoted phrase>"` in card and check against logic-table `engineeringReason` strings. **Skipped:** cards quote many things (Chinese phrases, MPN suffixes, marketing slogans). False-positive rate too high. Engineering reasons are paraphrased prose where exact-quote match doesn't apply.
- **English bare-id dict arrows** intentionally not flagged. The regex would catch `vref_typ → output_voltage` (a legitimate dict-claim shape) but also `tc → BLOCKING when ...` (prose). The canonical-pattern guard (`[a-z]` start required) eliminates the `BLOCKING` case but not all prose. Tradeoff: narrower coverage > noise.
- **Approve-gating on severity** — currently the Approve button isn't disabled when severity is `'block'`. The audit banner says "blocks Approve" but doesn't enforce. Intentional: the audit can have false positives; operator judgment is the final gate. Banner copy is aspirational.

### Files

- [lib/services/atlasFamilyCardAuditTypes.ts](../lib/services/atlasFamilyCardAuditTypes.ts) — added `criticalOmittedMfrs`, `wrongRuleClaims`, `wrongDictArrows` fields.
- [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts) — CHECK 5 (rule claims), CHECK 6 (dict arrows Chinese + English-quoted + DB-override consult), OMIT_BLOCK_SHARE escalation.
- [app/api/admin/atlas/family-domain-cards/[familyId]/fix-issues/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/fix-issues/route.ts) — prompts for critical omissions, wrong rule claims, wrong dict arrows.
- [components/admin/AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx) — button traffic-light, audit detail rendering (split critical/editorial omissions, rule-claim + dict-arrow sections), Health chip driver hint + stale-flags downgrade, `CardDiffView` stacked mode.

### Related

- Decision #195 — Phase 1 of the auto-audit pattern (4 base checks). This is Phase 2.
- Decision #197 — original severity semantics (FABRICATED_DICT downgraded to warn). Extended here, not replaced.
- Decision #213 — auto-derived exemption helpers (sibling decision, replaces blocklist whack-a-mole).

---

## Decision #213 — Auto-derive exemptions to replace MFR blocklist whack-a-mole (June 1, 2026)

### Context

The audit's MFR-alias resolver matches every known MFR name (~1,000 entries) against card text using word-boundary regex. Many 2–3 character Chinese MFR names collide with technical tokens that cards legitimately use as MPN-prefix or packaging-suffix annotations: `"-TD" (TDSEMIC)`, `"HX..." (HGC)`, `Hanrun (HR)`, `(FS/HS/SS)` for USB speed grades.

The accumulated workaround was `MFR_NAME_BLOCKLIST` — a manual set in `atlasFamilyCardAudit.ts` listing tokens to ignore. Each one-off blocklist entry required: notice a false positive on a card → diagnose the colliding minor MFR → write a comment with the technical token context → add to both TS and `.mjs` mirror → bounce dev server → re-audit.

By the end of one audit session the blocklist had grown to 8 entries (TR, SST, HR, CW, AM, HT, HX, TD) over a few hours. Each entry was correct individually but each represented the same architectural pattern: a card was annotating an MPN-affix relationship and pointing it at a real MFR via parens. The blocklist was a symptom of the audit not understanding the shape.

### Audit — pattern recognition

Looking at the 8 entries side by side:
- TR: `Tape-and-Reel ("-TR" or "/TR" suffix)` — appears in suffix-annotation prose
- SST: `"SST (SMC)"` — quoted-prefix attribution to MFR in parens
- HR: `"Hanrun (HR)"` — MFR-paren-prefix inverse attribution
- CW: `YMIN series anchor` — prefix-paren-MFR forward attribution
- AM: `"5.0SMDJxxxA-A / -AM" (INPAQ)` — quoted-suffix-paren-MFR
- HT: `"SiC HT 175°C"` — descriptive prose context (different shape — temperature anchor, not MFR attribution)
- HX: `"HX... (HGC)"` — quoted-prefix-paren-MFR
- TD: `"-TD" (TDSEMIC)` — quoted-suffix-paren-MFR

Seven of eight fit ONE of two canonical shapes:
1. **Forward MFR attribution**: `<token>... (<REAL_MFR>)` — a token annotated as belonging to a real MFR
2. **Inverse MFR attribution**: `<REAL_MFR> (<token>...)` — a MFR's known prefix/suffix listed in parens

Then C7 (Interface ICs) surfaced a third shape:
3. **Acronym list**: `(FS/HS/SS)` — short-token slash-separated peer list inside parens, prose (not a MFR) preceding the open paren

### Design

Three exemption helpers added to [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts), each precise about its shape:

1. **`isMfrAttributionContext(text, mentionIndex, name, knownMfrNames)`** — covers shapes 1 + 2. Forward pattern: regex `^[.…"'`\-\s/]{0,20}\(([^)]{1,80})\)` against the after-window. Inverse pattern: walks back to the nearest unclosed `(` and checks if the trailing word before paren is in `knownMfrNames`. The known-MFR guard is the safety lever — generic English words like `(clones)` won't false-exempt; `(TDSEMIC)` will.

2. **`isAcronymListContext(text, mentionIndex, name)`** — covers shape 3. Finds the enclosing parens, splits inner on `[/,]`, requires ≥2 chunks all matching `/^[A-Za-z0-9]{1,6}$/`. Catches `(FS/HS/SS)`, `(HBM/MM/CDM)`, `(LV/HV)`. Single-token parens (handled by `isMfrAttributionContext`) and multi-word names won't match.

Both register in the BOGUS_MFR check loop alongside the existing 4 exemption helpers (`isNegativeListContext`, `isQuotedDescriptorContext`, `isProtocolNumberContext`, `isDashDescriptorContext`, `isMpnSuffixContext`). Six-layer exemption architecture, each layer with a precise pattern signature.

The blocklist isn't removed — the 8 historical entries stay as belt-and-suspenders and as documentation of the original incidents. But it should stop growing.

### Heuristic / decision rule

The rhythm that emerged for handling MFR-alias-resolver false positives:

| Frequency | Response |
|---|---|
| 1–2 instances of same token | Blocklist it. Document the trigger context in the comment. |
| 3+ instances fitting a recognizable shape | Lift to a pattern-detection helper. |
| New shape that the current 6 helpers don't cover | Add a 7th helper. Don't grow the blocklist past pattern-evident. |

The lesson: a blocklist is a tactical patch; an exemption helper is an architectural fix. Once the blocklist reveals a pattern, lift it.

### Files

- [lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts) — `isMfrAttributionContext`, `isAcronymListContext`, registered in the BOGUS_MFR loop.
- [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) — byte-for-byte mirror of the TS helpers per the standing convention (CLAUDE.md / Decision #174).

### Related

- Decision #195 — Phase 1 of the audit (introduced `MFR_NAME_BLOCKLIST`).
- Decision #212 — sibling decision: audit-check expansion + button UX.

## Decision #214 — In-app Atlas Ingest "How To" drawer + operator runbook (June 1, 2026)

**Context.** Operator workflow for Atlas MFR ingest has accumulated subtle ordering rules (Triage-before-Proceed avoids backfill; per-batch Regen unlocks Proceed All Clean; cached `/suggest` results survive override revocation, etc.). Mid-session questions kept surfacing — "what does Regen actually do?", "is the disappearing banner a bug?", "do I need backfill?". Up to now, the only documentation was scattered across DECISIONS.md (#174, #176, #180, #186, #187, #199, #200) and CLAUDE.md, which is great for architectural archaeology but terrible for an operator on a deadline.

**Decision.** Two-part docs lift, with the runbook as source-of-truth and the drawer as in-context rendering:

1. **[docs/RUNBOOK_INGESTION.md](RUNBOOK_INGESTION.md)** — four-phase operator workflow (Upload+Triage → Apply → Domain Cards → Optional Cleanup) with explicit "why this position" column on every step, key principles section, and a gotchas table for the failure modes operators actually hit. Source of truth — edit this when the workflow changes.

2. **[components/admin/atlasIngest/IngestHowToDrawer.tsx](../components/admin/atlasIngest/IngestHowToDrawer.tsx)** — right-anchored MUI Drawer triggered by a "How to" button in the Atlas Ingest page header. Renders the runbook content with proper MUI components (Table, Chip, Paper, Typography, Divider) for visual hierarchy — explicitly NOT raw markdown via `react-markdown` (user requested proper formatting). Same content as the .md, hand-laid for visual punch.

**Sync convention:** the .md is canonical; the .tsx mirrors it. When the workflow changes, edit BOTH. Footer caption on the drawer points editors at the .md so the relationship is visible. If divergence becomes a real maintenance burden (3+ instances of "I updated the .md but forgot the .tsx"), refactor to render the .md via `react-markdown` with a custom MUI theme — but ship the cleaner-looking version first.

**Core principle the runbook drives home:** *Triage BEFORE Proceed.* Mapping unmapped params while batches are still Pending means `loadAndApplyDictOverrides()` writes already-correctly-translated values to `atlas_products` at proceed time. No backfill round-trip needed. The reverse order (Proceed first → Triage → backfill) works but creates retroactive cleanup work that scales poorly.

**Why not just point operators at DECISIONS.md.** Decisions are written for future-Claude doing archaeology, not for someone with 40 pending batches who needs to know what button to click next. The runbook reorders the same information by task flow rather than chronology; the drawer puts it one click away from the work. Different audience, same source material.

### Files

- [docs/RUNBOOK_INGESTION.md](RUNBOOK_INGESTION.md) — new operator runbook.
- [components/admin/atlasIngest/IngestHowToDrawer.tsx](../components/admin/atlasIngest/IngestHowToDrawer.tsx) — new drawer component (~280 lines, MUI Drawer + Table).
- [components/admin/atlasIngest/AtlasIngestPanel.tsx](../components/admin/atlasIngest/AtlasIngestPanel.tsx) — added `HelpOutlineIcon` "How to" button next to Refresh, `howToOpen` state, drawer mount.

### Related

- Decision #174 — atlas re-ingest pipeline (the workflow being documented).
- Decision #199 — backfill semantics (why the order matters).
- Decision #200 — Coverage Repair workflow (companion operator surface).

## Decision #215 — Galaxy MFR coverage repair: vendor-spelling aliases + post-mapping derivation framework (June 1, 2026)

**Context.** User asked why Galaxy (银河微) MFR showed "Missing" on virtually every attribute in the Coverage drawer for a B4 TVS product (1.5KE10), even though Galaxy's source JSON publishes complete parametric data. Investigation revealed Galaxy uses a uniform vendor-specific column-naming convention across all 6 families it ships into Atlas — `VRRM (V) max`, `IF (A) max`, `VBR (V) min.` (trailing period), `Condition1_IPP (A)`, `RDS(on)(mΩ) @ 25℃ 10V Typ` (Greek omega + degrees-celsius + multi-condition Rds(on) columns), `最高工作温度` / `最低工作温度` (Chinese for max/min operating temp split into separate columns), etc. None of these spellings matched existing dict aliases in the B1/B3/B4/B5/B6 blocks of `atlasMapper.ts`. Net effect: 7,650 Galaxy products (B1 + B3 + B4) effectively invisible to the matching engine on most rule weights.

The pattern was missed for ~30+ sessions because three independent surfacing mechanisms had aligned blind spots: (a) the Triage queue aggregates by paramName across MFRs, so Galaxy's unique spellings ranked low despite high per-MFR impact; (b) the Coverage drawer renders "Missing" identically whether the spec is unpublished OR mis-keyed (no visual distinction); (c) the dict was built incrementally as new MFRs were added without a systematic per-MFR vendor-spelling audit. The day this surfaced, Galaxy was at ~32% coverage for a typical B4 product (7 of 22 logic-table attributes).

**Decision (three layers).**

**Layer 1: Vendor-spelling dict aliases.** Added ~50 Galaxy-specific aliases across B1/B3/B4/B5/B6 dict blocks in both `atlasMapper.ts` AND `scripts/atlas-ingest.mjs` (mirror per CLAUDE.md convention). Each block tagged with a comment block identifying it as Galaxy-specific so future engineers see the provenance. Covers Galaxy's three patterns: trailing-` max`/` max.` suffix on most numeric specs; Chinese `最高/最低工作温度` for operating-temp split; multi-Vgs Rds(on) test conditions (10V/4.5V/2.5V/1.8V × Typ/Max = 8 satellite canonicals).

**Layer 2: Post-mapping derivation step in `mapModel`.** Three derivations injected after the dict-mapping loop but before `return`:

1. **B4 polarity from MPN suffix** — Galaxy doesn't ship a Polarity column; standard TVS naming convention (base or `A` suffix = unidirectional; `CA`/`CB` suffix = bidirectional) is encoded in the MPN itself. Set `parameters.polarity` from MPN regex when not already mapped.
2. **`operating_temp` range synthesis** — when 最高 and 最低 are both present (read directly from `model.parameters` to bypass the satellite-drop at line 2211), synthesize the canonical `operating_temp` range field as `"<min>°C to <max>°C"`. Works for any family that splits temp into max/min columns.
3. **`mounting_style` + `height` from `package_case`** — new `PACKAGE_TRAITS` lookup table (~30 entries covering DO-15/27/35/41/204/220, SMA/SMB/SMC, SOT-23/89/223/etc., TO-220/247/252/263) maps package_case codes to `{ mounting: 'Through Hole' | 'Surface Mount', height_mm: <number> }`. Derives both attributes when not already set. New packages surface via the Triage workflow; keep the table focused (not a dumping ground).

**Layer 3: Backfill to apply retroactively.** Multiple `npm run atlas:backfill` runs to retranslate `atlas_products` — first run scanned all 408K rows, then subsequent runs scoped via `--mfr Galaxy` (~30 sec vs 30+ min for full scan). The full backfill triggered Supabase rate-limiting after 4 runs in one session, reinforcing that scoped backfills are the right default once you know which MFR(s) you fixed.

**Result.** 1.5KE10 went from 7/22 (32%) → 13/22 (59%) — the realistic ceiling given what Galaxy actually publishes. The remaining 41% is genuinely missing source data (Galaxy's JSON catalog doesn't ship `num_channels`, `configuration`, `pin_configuration`, `surge_standard`, `esd_rating`, `response_time`, `rth_ja`, `pd` steady-state, etc. — those are datasheet-only specs requiring PDF extraction). 8,539 Galaxy products updated across the full catalog.

**Two architectural lessons captured as BACKLOG entries:**

- **Per-MFR coverage audit** (P2) — `scripts/atlas-audit-mfr-paramname-coverage.mjs` walks every MFR's products, compares raw paramNames against the merged dict + overrides, flags any MFR where >50% of paramNames are unmapped. Plus optional Manufacturers admin-panel chip (🔴<20% / 🟡20-50% / 🟢>50%) drilldown. Would have caught Galaxy on ingest day instead of 6 weeks later.
- **Promote cross-family canonicals to `SHARED_PARAMS`** (P3) — when a canonical reaches 3+ family blocks for the same semantic concept, lift to shared. Galaxy reuse of `tj_max`/`operating_temp` derivation patterns hit this threshold this session.

**Bugs surfaced and fixed:**

- `extractNumeric(undefined)` crashed via `isMissing(value).trim()` — caught when my synthesis code passed `tMaxObj?.value` which could be undefined when only `numericValue` was set. Fixed at the call site with `typeof === 'string'` guards rather than the broader fix in `isMissing` itself (lower blast radius).
- Line 2211 in `atlas-ingest.mjs` (`if (mapping.attributeId.startsWith('_')) continue;`) silently drops all satellite-mapped values — discovered when synthesis couldn't find `_operating_temp_min`. Worked around by reading directly from `model.parameters` rather than relying on satellites for cross-derivation reads. The architectural question of "should satellites store values at all" is deferred — current behavior is intentional per the display-only satellite convention.
- Galaxy variant data: 19 of 322 B5 products use TAB character + no-space-before-Typ/Max in Rds(on) column names (vs the 303-product majority that uses space). Caught when sampling BL1012BV first; 2N5003 (303-set) verified the alias for the common case. Added 8 additional aliases for the 19-set TAB variants.

**Why not Triage UI for these 50 accepts.** Volume + uniformity. Operator clicking through 50 vendor-specific accepts in Triage is repetitive and would have taken ~hour. Direct dict additions (with comment-tagged provenance for each Galaxy block) shipped in ~10 min of editing. The Triage workflow is the right surface for one-off accepts and the audited path for ambiguous cases — for systematic same-vendor patterns, the dict file is faster and equivalently audited via git blame on the comment block.

**Capacitance_khz revoke (sibling cleanup, same session).** Earlier in the session a Triage row surfaced citing the previously-accepted `capacitance_khz` canonical for varistor capacitance. Investigation: `capacitance_khz` was hallucinated (low-confidence May 11 accept) and exists nowhere in the codebase — only in `atlas_dictionary_overrides`. The existing family 65 satellite `_static_capacitance` was the correct canonical. Wrote `scripts/atlas-revoke-bad-canonical.mjs` to dry-run + soft-revoke any override by attribute_id. Revoked the override; subsequent Triage rows still surfaced cached `capacitance_khz` suggestions (the existing Decision #187 staleness signal doesn't track override-revoke events — backlogged separately). After 3 instances surfaced in one session, that triggered the "extend Decision #187 to override-revoke" BACKLOG entry. Also wrote `scripts/atlas-migrate-orphan-canonical.mjs` for JSONB-key cleanup but decided not to run it (see tooling lesson below).

### Files

- [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) — Galaxy alias blocks in B1, B3, B4, B5, B6 dicts (~50 aliases total); B4 `'最高工作温度' → tj_max` re-route; B4 `'condition1_ipp (a)' → ipp` re-route.
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — mirror of all dict additions; new post-mapping derivation block in `mapModel` (polarity-from-MPN for B4, `operating_temp` range synthesis, `mounting_style`+`height` from `package_case`); `PACKAGE_TRAITS` lookup table.
- [scripts/atlas-revoke-bad-canonical.mjs](../scripts/atlas-revoke-bad-canonical.mjs) — new audit/revoke utility (used earlier this session for the `capacitance_khz` cleanup).
- [scripts/atlas-migrate-orphan-canonical.mjs](../scripts/atlas-migrate-orphan-canonical.mjs) — new orphan-key migration utility (written but not run — see lesson below).

**Tooling lesson.** Wrote `atlas-migrate-orphan-canonical.mjs` to rename orphan JSONB keys after revoking a bad canonical, but the user pushed back ("are you sure this is the right thing to do?") and that prompted re-examination. Concluded: don't migrate dead bytes. Bad override revoked + future ingests routed correctly is enough; the 387 orphan rows in JSONB are inert (no code reads them) and a direct mutation would bypass the dict-override audit trail. The script stays as standby tooling but should rarely be needed. Two-part lesson: (a) momentum-driven cleanup is a real failure mode; (b) "are you sure?" is a healthy interrupt and I should treat it as a real prompt to reconsider rather than a confirmation prompt.

### Related

- Decision #174 — atlas re-ingest pipeline (the override layer this builds on).
- Decision #199 — backfill semantics (the cleanup tool this session leaned on).
- Decision #200 — Coverage Repair workflow (the surface where Galaxy's gap was eventually noticed — should have been noticed sooner).
- Decision #201 — vendor-name hygiene (similar "Atlas-internal naming hits end users" pattern, GAIA prefix variant).
- BACKLOG — per-MFR paramName-coverage audit (the prevention tool this incident motivates).

## Decision #216 — Metadata param dictionary: a third dict tier for compliance/export-control (June 2, 2026)

**Context:**
- User noticed Atlas products had `rohs: YES` / `reach: YES` / `eccn: EAR99` in `atlas_products.parameters` JSONB, but the front-end Overview's "Environmental & Export" section rendered blank.
- Two layers were broken: (1) `atlasClient.rowToPartAttributes` wasn't lifting these JSONB keys onto `Part.rohsStatus` / `eccnCode` / etc. (top-level fields the Overview reads); (2) `mapManufacturerProducts` in `atlas-ingest.mjs` had no dict entry for `eccn`/`rohs`/etc., so they landed in `unmappedParams` and surfaced in Triage as if they needed human mapping decisions.
- Fix shipped earlier in session: read-time lift in `rowToPartAttributes` (got Overview rendering for existing rows). Triage noise remained.
- User asked: what's the right structural home for compliance fields so Triage stops flagging them?

**Decision:** Introduce a third parameter-dictionary tier — `metadataParamDictionary` in `atlasMapper.ts` (mirrored as `METADATA_PARAMS` in `scripts/atlas-ingest.mjs` per Decision #174). Distinct from both `sharedParamDictionary` (cross-family parametric) and `skipParams` (silenced metadata). Resolves as the 3rd fallback in dict lookups: `familyDict ?? sharedParamDictionary ?? metadataParamDictionary`.

Behavior:
- **Ingest:** dict resolution recognizes raw keys (e.g., `ECCN代码`, `rohs status`, `湿敏等级`) and normalizes to canonical attributeIds (`eccn_code`, `rohs`, `msl`). Stored in JSONB. NOT added to `unmappedParams` → Triage stops flagging.
- **Read (`fromParametersJsonb`):** consults metadata dict for canonical display names AND checks `METADATA_ATTRIBUTE_IDS` set to EXCLUDE these from the ParametricAttribute output. Specs panel stays clean (no `ECCN: EAR99` row sitting alongside `Standoff Voltage: 85.5V`).
- **Overview surface:** `atlasClient.rowToPartAttributes` (the earlier read-time lift) continues to read raw JSONB by canonical key and populate `Part.rohsStatus` / `eccnCode` / etc. This is the sole display path for metadata.

Initial 17 entries cover RoHS, REACH, ECCN, HTS, MSL with English + Chinese + spaced variants. Each canonical attributeId maps 1:1 to an existing `Part.xxx` field that already has UI in `AttributesTabContent.tsx`. SortOrder 900–904 so if they ever DO slip into a ParametricAttribute output (shouldn't, but defense-in-depth), they sink to the bottom.

**Why not the alternatives:**

| Alt | Why rejected |
|---|---|
| **SKIP list** | `continue`'s during ingest → JSONB purge. Would erase the very data the Overview lift depends on, regressing the just-shipped fix. |
| **Add to SHARED dict** | SHARED is for cross-family PARAMETRIC attributes (package, operating_temp, supply_voltage — things scored against in logic tables). Compliance isn't scored. Treating it as parametric would surface ECCN/RoHS as rows in the user-facing Specs panel and in cross-ref candidate comparisons — semantic clutter everywhere Atlas data flows. |
| **Tag on existing SHARED entries** (`isMetadata: true`) | Mixes parametric + metadata in one container. Search-readability cost; future contributors would have to know about the tag to reason about SHARED. |
| **Top-level DB columns on `atlas_products`** | Schema migration + backfill on 408K rows. Only justified if we plan to filter SQL-side on compliance — we don't today. JSONB stays sufficient. |
| **Read-time-only lift (no ingest change)** | Doesn't stop Triage flagging — leaves the operator-facing noise that motivated this work. |

**Why this slot is right:**
- Parallel to how AEC qualifications (Q200/Q101/Q100) are handled — they're in per-family dicts (because they ARE scored), lifted at read-time to a special `Part.qualifications` field, rendered as chips not Specs rows. Metadata dict generalizes the same pattern for non-scoreable cross-family metadata.
- Slot is durable: future cross-family metadata (lifecycle markers, marking codes, custom IDs) can land here without polluting SHARED or SKIP.
- Self-contained: one new dict + one read-time exclude check + one ingest dict-fallback line. ~45 LOC across both files.

**Process lesson — re-examine before committing:**

Initially proposed SHARED dict (wrong slot). User pushed back: "Are you sure?" Switched to SKIP (wrong — would purge JSONB). User pushed back again. Only on the third pass did I actually read both `fromParametersJsonb` (read-time skip) and `mapManufacturerProducts` (ingest-time skip) to confirm what SKIP actually does. Should have read first, proposed once. Lesson: when a fix touches a system whose semantics are encoded across TS + .mjs mirror + frozen batch reports + L1/L2 caches, the cost of guessing the slot wrong is real architectural debt. Read the code before proposing the structural answer, not after.

Net change: 17 dict entries × 2 files + 3 resolver lines + 1 exclude check + `npm run atlas:backfill` for 408K rows (58K updated, 0 errors, coverage cache invalidated).

**Caveat — pending batches retain stale Triage entries:**

Frozen batch reports in `atlas_ingest_batches` are computed at upload-time using whatever dict was active then. Today's metadata dict change doesn't retroactively rewrite those reports — pending batches uploaded before today still surface ECCN/RoHS as "unmapped" in Triage. Three handling paths:
1. Discard old pending batches and re-upload (cleanest)
2. Per-batch Regenerate button in admin UI (tedious at scale)
3. Just ignore the metadata rows in Triage (recommended default — they're functionally resolved; new uploads use new dict natively so noise won't accumulate)

If pending-batch staleness becomes a recurring friction across future dict changes, lift to: bulk-regenerate endpoint OR auto-regenerate on dict change. Don't build either until the friction is real.

### Related

- Decision #174 — TS + .mjs mirror convention (this decision adds another item to the mirror discipline).
- Decision #176 — Triage Workspace + override-active filtering (defines why pending-batch reports go stale on dict changes — they're frozen, only override rows filter post-hoc).
- Decision #199 — atlas backfill workflow (the cleanup tool this decision leans on for existing rows).
- Decision #201 — vendor-name hygiene (same "internal data structure leaks into user-facing surface" pattern, different leak vector).
- Earlier this session — read-time lift in `atlasClient.rowToPartAttributes` (the prerequisite fix; metadata dict builds on it).

## Decision #217 — Atlas unit-prefix conversion: value-string-first hybrid (June 2, 2026)

**Context:**
- User reviewing Triage rows noticed AI suggestions repeatedly claimed "150 kHz → 0.15 MHz conversion happens when the dictionary override is applied." User asked: is the conversion real, or is AI hallucinating a feature?
- Investigation confirmed: **the conversion does not exist.** Atlas storage at `atlasMapper.ts:2750` (mirror in `atlas-ingest.mjs`) stored `numericValue` as raw digits from the source string, while Digikey's `extractNumericValue` ([digikeyMapper.ts:362-378](lib/services/digikeyMapper.ts#L362-L378)) applied SI prefix to base SI. Cross-source matching (Atlas vs Digikey) for any prefix-bearing unit silently false-failed every comparison.
- Real-world example: EVISUN K7812-2000R3 has display `"400kHz"` for fsw. Atlas stored `numericValue: 400, unit: 'MHz'` (dict declared MHz). Digikey stores 400 kHz fsw as `numericValue: 400000`. Matching engine compared 400 vs 400000 → false fail. The bug touched every Atlas product with a unit-prefixed numeric value.

**Initial design (rejected after spot-check):** "Trust the dict's `unit:` field — apply SI prefix from the dict declaration to the raw numericValue." Built helper `applyUnitPrefix(numericValue, mapping.unit)`. Wired to all 4 push sites in atlasMapper.ts (standard dict, gaia-with-mapping, gaia-no-mapping). Audit script enumerated 389 distinct attributeIds with units across in-code dicts + DB overrides. Looked clean — 46 multi-unit attributes (vendor variance, conversion would normalize), 115 single-unit prefix-triggering (audit-pass).

**Why it was wrong:** spot-check against real data revealed the dict's `unit:` field is often an engineer's GUESS about source units, not vendor truth. EVISUN ships `"400kHz"` for fsw but the Chinese label `'开关频率'` was mapped with `unit: 'MHz'` (the dict author's display preference, applied to all vendors using that label). Applying MHz prefix to 400 → 400,000,000 Hz = 400 MHz, which is 1000× worse than the original wrong behavior. The dict-unit-trust design would have shipped a bigger bug.

**Pivot (the right design):** **Value-string-first hybrid.** Mirror Digikey's `extractNumericValue` pattern — parse SI prefix from the VALUE STRING (the vendor's ground truth), fall back to the dict's `unit:` field only for unit-less values like `"8"` or `"100"`.

```ts
const { numericValue, parsedUnit } = extractNumericWithPrefix(displayValue);
const effUnit = effectiveUnit(parsedUnit, mapping.unit);  // value string wins
const finalNumeric = applyUnitPrefix(numericValue, effUnit);
```

**Architecture:**
- **`_applyUnitPrefixCore(num, unit)`** — pure SI prefix math. Mirrors Digikey's logic byte-for-byte (`p/n/µ/u/m/k/K/M/G/T` with `mm`/`MSL`/`no` guards). Exported for testing.
- **`applyUnitPrefix(num, unit)`** — gated wrapper that checks `APPLY_UNIT_PREFIX_TO_NUMERIC` kill switch before delegating to core.
- **`extractNumericWithPrefix(value)`** — parses leading number + optional unit suffix from value strings. Returns `{ numericValue?, parsedUnit? }`. Handles range, ±, comparison-prefix, standard, and loose-fallback (preserves `extractNumeric` behavior for prefix-junk like `"@25°C 100mA"`).
- **`effectiveUnit(parsedUnit, dictUnit)`** — `parsedUnit || dictUnit`. Safety hinge: value-string truth wins over dict guess.
- **`APPLY_UNIT_PREFIX_TO_NUMERIC`** kill switch — boolean constant. Started `false` (dark code) for audit + spot-check, flipped `true` after pivot + 1804/1804 test pass.
- **Mirror discipline (Decision #174):** every change above duplicated byte-for-byte in `scripts/atlas-ingest.mjs`. Both files MUST move together.

**Hooks applied at 3 push sites in atlasMapper.ts (+ .mjs mirror):**
1. Standard dict mapping (`mapModel`, line ~2750)
2. Gaia-with-mapping (line ~2691)
3. Gaia-no-mapping (line ~2653)

Skipped: raw-fallback site (no unit), LDO synthesis (hard-coded 'V'), PACKAGE_TRAITS height (mm guarded), `tagAtlasParameters` + `fromParametersJsonb` (passthrough reads — wrapping would double-apply).

**Cache versions bumped:**
- `RECS_CACHE_SCHEMA_VERSION`: v10 → v11
- `BASE_RECS_SCHEMA_VERSION`: v1 → v2

Both invalidate prior cached recs since Atlas-source candidate scoring shifts under post-flip math.

**Audit + Discovery tools (read-only, both ship with this decision):**
- `scripts/atlas-audit-unit-mismatches.mjs` — enumerates every `(attributeId, unit)` combo in DB overrides + in-code dicts. Outputs 3-tier report (HIGH-RISK multi-unit / ATTENTION single-unit prefix-triggering / SAFE no-op).
- `scripts/atlas-find-mfrs-needing-backfill.mjs` — scans `atlas_products` for rows with prefix-triggering units, aggregates per-MFR affected counts, outputs priority-ordered punch list.

**Spot-check results (post-pivot, against real data):**

| Attr | Display | Dict unit | Parsed unit | Effective | numericValue (base SI) | Sanity |
|---|---|---|---|---|---|---|
| fsw | "300KHz" | MHz | KHz | KHz | 300,000 Hz | ✓ 300 kHz |
| fsw | "1.5MHz" | MHz | MHz | MHz | 1,500,000 Hz | ✓ 1.5 MHz |
| trr | "35" | ns | (none) | ns | 3.5e-8 s | ✓ 35 ns (fallback) |
| trr | "80ns" | (none) | ns | ns | 8e-8 s | ✓ 80 ns |
| wavelength_peak | "940nm" | nm | nm | nm | 9.4e-7 m | ✓ 940 nm |
| output_current | "400mA" | A | mA | mA | 0.4 A | ✓ 400 mA |
| output_current | "1.2A" | A | A | A | 1.2 A | ✓ 1.2 A |
| ft | "8" | MHz | (none) | MHz | 8e6 Hz | ✓ 8 MHz (fallback) |

The fsw row is the proof — dict said MHz but vendor shipped kHz; value string wins, correct base SI emerges.

**Discovery output (June 2, 2026):** 389,253 atlas_products scanned; 137,518 affected across 169 MFRs. Top 10 MFRs cover 59%; top 20 cover 80% (Pareto). Sunlord (16,794), XKB Connectivity (9,960), ISC (8,777), YANGJIE (8,695), YFW (7,191), Jingheng (6,547), JJW (6,542), Comchip (6,044), Galaxy (5,168), KEXIN (4,887) are the top 10.

**Backfill workflow (operator-controlled):** Each MFR ~30 sec via `npm run atlas:backfill -- --mfr <name>` (uses Decision #199 plumbing; mapper re-runs against current dict overrides AND the new conversion). Sequential batches of 3-4 MFRs avoid Supabase rate limits. Verify via `npm run atlas:backfill:dry -- --mfr <name> --verbose`.

**Top-20 backfill execution (this session, June 2, 2026):** Ran the top 20 MFRs in batches of 4-in-parallel. **100,948 products updated across 22 MFRs** (AK substring bonus matched 3PEAK + AMPAK for free). Coverage cache invalidated each run. ~73% of all 137K affected products covered; remaining 149 MFRs tracked in BACKLOG as P2 follow-up.

**Diff-fix found mid-execution:** First Sunlord backfill returned "0 changed / 16,756 same" — the conversion was running but writes were skipped. Root cause: `compareParamsIgnoringIngestedAt` in `scripts/atlas-ingest.mjs` originally compared only `value`/`unit`/`source` and IGNORED `numericValue`. Fix added `numericValuesEqual()` helper with relative-tolerance float comparison and extended the diff to include it. After fix, Sunlord re-ran and showed 15,584 changed. **Architecture lesson:** any change to atlas storage semantics needs the diff function audited too — provenance-only diffs are blind to value-only mutations. This is now baked into the helper docblock so future engineers don't hit the same trap.

**Top-20 changed counts (for posterity):** Sunlord 15584 / XKB 2544 / ISC 5013 / YANGJIE 11653 / YFW 4623 / Jingheng 5321 / JJW 7067 / Comchip 8028 / Galaxy 8435 / KEXIN 3781 / SWST 3577 / TA-I 3273 / LGE 3697 / AK+3PEAK+AMPAK 3746 / Everlight 2012 / FOSAN 2022 / Good-Ark 3449 / Viking 1753 / JSCJ 3256 / JCET 2111. **Long-tail (149 MFRs):** 45,840 additional. **Grand total: 147,301 products updated.**

**Greek-mu vs Latin-µ bug (discovered post-backfill via numeric-outlier audit):** `applyUnitPrefix` originally checked `unit.startsWith('µ') || unit.startsWith('u')` — where µ is U+00B5 (micro sign). But Atlas data carries both U+00B5 AND U+03BC (Greek small mu) interchangeably; they render identically. Helper now checks for both. ~6,300 products across 29 MFRs (Prisemi 1657, LGE 1262, YANGJIE 826, KEXIN 740, YFW 372, etc.) had unit='μA'/'μF'/'μV' that were silently NOT being converted; numericValue stayed raw (e.g. `100` for "100 μA" instead of `1e-4` A). Fixed across atlasMapper.ts + atlas-ingest.mjs + audit-unit-mismatches + find-mfrs-needing-backfill + tests. Targeted re-backfill ran on the 29 affected MFRs after fix. **Architecture lesson:** Unicode look-alikes are silent bugs — when the spec calls for "micro," accept all Unicode codepoints that mean "micro" (U+00B5 micro sign, U+03BC Greek small mu), not just the canonical one. Future SI prefix additions should audit for similar variants (Ω U+03A9 vs Ohm sign U+2126 is the next known one).

**Operational follow-ups (same-day, post-backfill):**
1. **`/suggest` prompt updated to drop "canonical unit X" framing.** The C2 fsw row that triggered this work surfaced that the AI was still generating prose like "fsw is canonically stored in MHz, raw values must be converted on ingest" — describing the OLD broken design. New UNIT FIELD GUIDANCE section in the prompt teaches Sonnet that the dict's `unit:` field is now load-bearing for unit-less value strings, and tells it to read the paramName (e.g. "FSW(kHz)") and sample values for unit hints rather than defaulting to any "canonical unit."
2. **Cache version bump REVERTED (v7→v8→v7).** Bumping `SUGGEST_CACHE_VERSION` invalidated every cached AI suggestion across the queue, forcing engineers to regenerate hundreds of rows just to see the prose change. Most cached suggestions had unchanged mappings — only prose was suboptimal for unit-bearing rows. Sledgehammer for a cosmetic fix. Reverted both server-side (atlasSuggestCache.ts) and client-side (GlobalUnmappedParamsTable.tsx localStorage prefix). Engineers refresh suspect rows individually via the ↻ refresh icon (see #3 below). **Lesson:** bump prompt-cache versions only when the cached mappings themselves would change, not when only prose improves.
3. **Per-row refresh ↻ icon made always-visible.** Previously only rendered when system independently detected staleness (Decision #187 — card/schema version drift). Now renders on every cached suggestion: muted gray for normal rows ("Refresh AI suggestion for this row"), amber + ⚠ for stale rows. Engineer-driven on-demand regen for the FSW(kHz)-style cases where the prose looks suspect but no auto-staleness signal fires. One-line UI tweak in `GlobalUnmappedParamsTable`.
4. **UI safety net: inline conversion preview** below the unit field in `GlobalUnmappedParamsTable`. New `previewConversion(sampleValue, unit)` helper shows what numericValue would land in atlas_products with the proposed mapping — e.g., "120 → 1.20e+5" appears below the unit field. Tooltip explains the math. Suspicious case (sample value embeds a unit different from the dict unit) renders amber with ⚠ prefix. **This is the real safety net** — even when AI prose is wrong, the engineer's eyeball on the preview catches actual magnitude errors. Subsequent /suggest hallucinations ("AMP will be normalized to A during ingest") didn't matter to correctness because the engineer-set unit + preview verification handle it.
5. **`/suggest` prompt refactored: lexical bans → one principled rule.** After watching the AI hallucinate "MHz canonical conversion" (round 1) then "AMP-to-A normalization at ingest" (round 2) — both about system behavior the AI doesn't actually know — replaced piecemeal phrase-bans with one upstream SCOPE OF YOUR ROLE rule: *"You recommend attributeId + unit + verdict and justify the match. You do NOT know what the ingest pipeline, runtime, or matching engine do with the data — do not describe, predict, or assert system behavior."* Plus a redirect: data-quality observations get framed as recommendations to the engineer ("set unit to 'A'") not predictions about system behavior ("system will normalize"). One rule kills the whole class of hallucinations including future ones we haven't seen yet. **Lesson:** when an AI prompt is whack-a-mole'd with 2+ specific phrase-bans for the same underlying pattern, lift to a principled rule that bans the pattern.

**Numeric-outlier audit (`scripts/atlas-audit-numeric-outliers.mjs`):** Post-backfill sanity check. Looks for products whose post-conversion numericValue deviates >1e4× from per-attribute median — symptom of dict entries whose `unit:` field is wrong for vendors that ship unit-less value strings. June 2, 2026 run found 44 suspect attributes but ALL with outlier counts of 1-2 products each (no systematic vendor patterns suggesting bulk dict errors). Most "outliers" turned out to be (a) the Greek-mu bug above, OR (b) pre-existing data-quality issues unrelated to Decision #217 (dict author typos like `unit:'k/w'` lowercase k spuriously applying kilo to thermal resistance K/W; ad-hoc unit strings like `'TO +85 ℃'` or `'(none)'` that bypass prefix handling). Categorized as P3 BACKLOG follow-up, not regression.

**Why this is "done right" rather than "shipped":**
- Kill switch retained — flip back to `false` if regression discovered, no data damage.
- 43 unit tests cover the helpers + edge cases (mm/MSL/no guards, ranges, ±, comparison prefix, prefix-junk loose fallback, value-string-wins-over-dict).
- 1804/1804 existing tests pass — no fixture regressions despite flag flip.
- Audit script captures every (attribute, unit) combo for future engineers.
- Discovery script outputs priority-ordered MFR backfill list with copy-paste commands.

**Why not the alternatives:**

| Alt | Why rejected |
|---|---|
| **Trust dict's `unit:` field only** | Initial design. Spot-check on EVISUN fsw proved dict often LIES about source unit. Would have multiplied wrong direction (1000× worse than current bug). |
| **Build canonical-units lookup per attributeId** | What I initially proposed. ~60-80 manual entries. Replaced by hybrid since Digikey's pattern (value-string SI prefix) already gives canonical-by-construction. Less code, fewer guesses. |
| **Server-side migration script that rewrites all 137K rows once** | Backfill via existing atlas-ingest pipeline is cleaner (mapper re-runs entire family-dict logic, picks up any other concurrent dict changes too, provenance-preserving per Decision #199). Migration script would have to duplicate the mapper. |
| **Defer the bug to BACKLOG** | User judged bug urgent (every Triage accept session was potentially adding new mis-stored mappings). Same-session fix avoided the can-kick. |

**Lessons:**
- **Spot-check against real data is non-negotiable** when changing storage semantics. Static audit on dict declarations missed the EVISUN-style aspirational-unit problem entirely. ~5 minutes of spot-checking saved shipping a worse bug.
- **AI-suggestion prose is unreliable about code behavior.** The /suggest endpoint confidently asserted "conversion happens when override is applied" — there was no such code. Pattern: trust AI for translation (paramName → canonical attributeId, value semantics), distrust for system-behavior claims.
- **Dark-launch + kill switch + audit-first** is the right shape for any change that mutates how stored data is interpreted. Three-stage (build dark / audit / flip+verify) gave us reversibility at every step.
- **Pivot decisions are cheap when foundations are solid.** Switching from dict-trust to value-string-first reused 100% of the kill-switch + audit infrastructure. Only the inner math changed.
- **"Done right" includes the backfill punch list, not just the code.** Without `atlas-find-mfrs-needing-backfill.mjs`, this would have been a dead-code ship — flag flipped but old data never re-translated, so cross-source matching stayed broken for the 169 affected MFRs.

### Related
- Decision #174 — atlas re-ingest pipeline (provides the backfill plumbing this decision leans on)
- Decision #199 — atlas backfill translations (the existing operator workflow this work plugs into)
- Decision #201 — vendor-name hygiene (sibling "internal artifact leaks into stored data" pattern)
- Decision #215 — Galaxy coverage repair (proved scoped per-MFR backfill is the right tool for vendor-specific data fixes)
- digikeyMapper.ts:362-378 — `extractNumericValue` (the reference implementation Atlas now mirrors)

---

## Decision #218 — Atlas mirror drift reconciliation: three latent divergences fixed; "verbatim mirror" convention is not self-enforcing (June 2, 2026)

**Context:** The no-import-path mirror convention between `lib/services/atlasMapper.ts` and `scripts/atlas-ingest.mjs` (Decisions #174, #176, #188) treats the two files as "duplicated by design." An investigation into whether the .mjs script could be consolidated under `tsx` and import directly from atlasMapper.ts surfaced three real behavioral drifts. Consolidation was deferred (real risk during pre-multi-tenant period; ~6-8h with reconciliation). Drift fixes shipped on their own merits.

**The three drifts found:**

1. **`classifyAtlasCategory` was missing D1 Crystal in .mjs.** The .ts version routes c3 names containing "crystal" (and not "oscillator") to family D1. The .mjs script had no such branch — any crystal MFR ingested via the script would have fallen through to the catch-all ICs bucket or generic Diodes. Latent because no crystal MFRs have been in the recent Chinese ingest stream, but real. **Fix:** Added the missing branch in the same position relative to the oscillator check (commit `bf4a845`).

2. **`mergeAtlasParameters` legacy-handler asymmetry.** The .mjs version defensively upconverts pre-migration `_source: 'desc_extract'` entries to the current `source: 'extraction'` shape on the fly, in case any row escaped the original backfill. The .ts version had no such handler and would silently drop those entries. **The test suite (`__tests__/services/atlasMerge.test.ts`) exercises only the .ts version — production behavior (.mjs) was untested.** Fix: brought .ts in line with .mjs's defensive handler; extended `AtlasParamEntry` with the legacy `_source?: 'desc_extract'` field so the upconversion is type-checked; added two tests covering the upconversion and input-non-mutation guarantee (commit `335018f`).

3. **`APPLY_UNIT_PREFIX_TO_NUMERIC` kill switch was wired in .ts only.** The .mjs file declared the constant (with a comment explicitly stating "both files must move together") but its `applyUnitPrefix()` function never read it — the flag was effectively dead code in the ingest path. If anyone toggled the flag to `false` (rollback / debug), .ts would correctly disable prefix conversion but .mjs would silently keep doing it — exactly the divergence the kill switch exists to prevent. **Fix:** added the early-return check that .ts already had (commit `9478d45`).

**Discovered but not addressed:**

- **`mapAtlasModel` (TS) is dead code.** A grep across the codebase found zero callers outside `__tests__`. The .mjs ingest uses its own `mapModel` function; the .ts version exists but isn't wired into any production path. Recorded in BACKLOG as a P3 cleanup — delete or wire up; the decision can't be made without knowing whether it was intended as a future runtime path (e.g. a query-time mapping that never landed).

**Architectural meta-lesson:**

The "duplicated by design, no import path" convention from Decision #174 is structurally honest about the constraint but **not self-enforcing about freshness.** Drift accumulated quietly because:

- Tests cover the .ts version (the one that's easier to test). Production runs the .mjs version. **Tests can pass while production is wrong.**
- The mirror discipline is a comment convention — engineers do it by hand, and humans miss things. Three drifts across two files in 3,200 and 4,000 lines isn't bad statistically, but each represents a latent bug.
- The drifts were asymmetric in both directions (.mjs ahead on JFET signature, .ts ahead on Crystal classification, .mjs ahead on legacy merge handler, .ts ahead on kill switch). There's no single "source of truth" to default to.

**Options considered for the structural problem:**

| Option | Why deferred / not chosen now |
|---|---|
| **Full consolidation** — rename .mjs to .ts, import from atlasMapper, run via `tsx` (already installed) | ~6-8h real work including reconciliation; touches three `spawn('node', ...)` call sites + Turbopack argv workaround; sits on a production-critical pipeline. Investigation confirmed it's *technically* feasible but the timing is poor — multi-tenant rewrite is the next initiative and may restructure these files anyway. |
| **Drift-detection guardrail script** (~30 min) | Considered as a band-aid. After investigation revealed drift already exists, the guardrail's value is lower — it would fire immediately on three known issues. Better to reconcile first; build a guardrail later if mirror discipline doesn't stick. |
| **Surgical extraction** — pull truly-pure helpers (`extractNumericWithPrefix`, `extractNumeric`, `effectiveUnit`, `_applyUnitPrefixCore`) into a shared module both can import | Reasonable middle ground for a future session. These helpers are verified behaviorally equivalent. Defers the high-risk pieces (mapper, classifier) while removing ~40 lines of duplication. Not done now to keep this commit set tight. |

**Lessons:**

- **"Verbatim mirror" is not a verifiable claim by inspection.** Three "this is mirrored from X" comments in this codebase were wrong about behavior. The convention is honest about intent but provides no safety mechanism.
- **Tests-as-coverage gives a false read when test target and production target differ.** The `atlasMerge.test.ts` suite had 10 tests passing against a function that *didn't reflect production*. Tests of dead-code reference implementations are worse than no tests because they create a false sense of coverage.
- **Investigation before implementation paid for itself.** The original "2-3 hour consolidation" pitch would have erased three behavior asymmetries silently, picking one side as canonical without engineer judgment. ~45 min of read-only investigation surfaced the asymmetries and let us reconcile on our own terms.
- **`mapAtlasModel` being dead code is a smaller version of the same problem.** A reference implementation that doesn't ship is technical debt; either delete it or wire it up. Worse, its presence implies it's the canonical mapping function, misleading future engineers — the actual canonical mapper is in the .mjs script.

### Related
- Decision #174 — atlas re-ingest pipeline (established the "duplicated by design" convention)
- Decision #176 — Dictionary Triage workspace (also notes the mirror discipline)
- Decision #188 — Engineer-driven FAMILY_PARAM_SIGNATURES via DB (relies on the same mirror discipline; gains a DB tier to reduce the mirror surface)
- Decision #207 — FAMILY_PARAM_SIGNATURES regex bug (a different kind of mirror-discipline failure — pattern correctness drifted in both files together)
- BACKLOG: `mapAtlasModel` dead-code cleanup (June 2, 2026)

---

## Decision #219 — Automotive AEC enforcement extended to B5/B7/C9 + B6 PoC test backfill (June 2, 2026)

**Context:** Decision #211 shipped automotive AEC-Q101 enforcement as a B6 BJT proof of concept, with the explicit out-of-scope note that the same pattern needed to be replicated to B5/B7/B8/B9/C9/C10/D1/D2/E1/F1. The BACKLOG entry (`Automotive AEC enforcement — replicate B6 pattern to remaining AEC-aware families`) flagged this as P1 because every other family with an automotive context question was silently no-op'ing: the user could pick "Yes — automotive" on a MOSFET search and get unfiltered results. Three families (B5 / B7 / C9 — the most user-facing of the list) shipped in this session.

**Scope shipped:**

| Family | Standard | parameterId | New filter |
|---|---|---|---|
| B5 MOSFETs | AEC-Q101 | `aec_q101` | `filterMosfetAutomotiveMismatches` |
| B7 IGBTs | AEC-Q101 | `aec_q101` | `filterIgbtAutomotiveMismatches` |
| C9 ADCs | **AEC-Q100** | `aec_q100` | `filterAdcAutomotiveMismatches` |

**Pattern:** Identical to the B6 PoC (Decision #211).
1. `applyContextSourceOverrides` gets a branch per family that injects the correct AEC attribute (`'Yes'`) onto the scoring-local source attrs when `applicationContext.answers.automotive === 'yes'`. Source visible in the user's Specs panel stays untouched.
2. A per-family `filterXxxAutomotiveMismatches` function drops candidates whose AEC `matchDetails` entry has `ruleResult === 'fail'`.
3. Registered in the family-id switch around line 1522, wrapped with `withCertifiedBypass` so MFR-certified and Accuris-certified crosses still surface (Decision #133).

**Q100 vs Q101 distinction:** Block B (discrete semiconductors — MOSFETs, BJTs, IGBTs) qualifies to AEC-Q101. Block C (ICs — ADCs, DACs, op-amps, etc.) qualifies to AEC-Q100. The C9 filter explicitly keys on `aec_q100`, not `aec_q101`. A test case in `automotiveAecEnforcement.test.ts` locks this distinction by asserting a Q101-failing candidate is NOT dropped by the ADC filter (since C9 is keyed on Q100).

**Test backfill:** Decision #211's B6 PoC shipped without unit tests for either `applyContextSourceOverrides` or `filterBjtAutomotiveMismatches`. Coverage was integration-only. This decision exports both helpers from `partDataService.ts` and adds 30 unit tests in `__tests__/services/automotiveAecEnforcement.test.ts` covering B6 + B5 + B7 + C9 symmetrically. The B6 PoC is now retroactively tested at the same depth as the three new families.

**Why per-family functions instead of one table-driven helper:** The BACKLOG entry explicitly defers the abstraction: "If this expands past ~5 families it's worth lifting to a generic table-driven mechanism: a `Record<FamilyId, { contextKey, contextValue, attributeId }>` consumed by both the source-override helper and a single generic filter. Defer the abstraction until then to keep the per-family logic auditable." This session brings us to 4 families (B6 + B5 + B7 + C9), still under that threshold. Per-family functions remain auditable by grepping a single name (e.g. `filterIgbtAutomotiveMismatches`) and produce ~13 lines of near-clone code per family. The abstraction is the right call when the next 2 families land.

**Remaining (BACKLOG-tracked):** B8 Thyristors (AEC-Q101 — note: context Q1 suppresses per sub-type so verify aec_q101 stays active for all three), B9 JFETs (AEC-Q101), C10 DACs (AEC-Q100), D1 Crystals (AEC-Q200 — passive), D2 Fuses (AEC-Q200 — passive), E1 Optocouplers (AEC-Q101 — already has E1 post-scoring filter, extend or chain), F1 EMRs (AEC-Q200 — already has F1 post-scoring filter, extend or chain). Once the remaining families are also done (or even at the next 2), lift to the table-driven abstraction the BACKLOG describes.

### Lessons

- **The PoC convention "ship without tests, replicate later" propagates an untested-behavior gap each round.** Closing the gap retroactively (Commit 1 in this session) was cheap and removed an asymmetry that future engineers would have noticed. When the next safety-relevant PoC ships, write the tests with the PoC — don't defer them to "the rollout commit."
- **Q100 vs Q101 is not interchangeable.** The C9 implementation deliberately uses different test cases from B5/B7. The "lock the distinction" test guards against the copy-paste path where someone replicates the B5 filter for a future C family and forgets to swap the attribute ID.
- **Atomic commits per family pays off when one family has structural differences.** The C9 commit is structurally different from B5/B7 (different attribute ID), and isolating it in its own commit makes that visible in `git log`. If a future regression surfaces on automotive ADCs specifically, the bisect lands on the right commit.

### Files

- [lib/services/partDataService.ts](../lib/services/partDataService.ts) — three new branches in `applyContextSourceOverrides`, three new filter functions, three new switch entries.
- [__tests__/services/automotiveAecEnforcement.test.ts](../__tests__/services/automotiveAecEnforcement.test.ts) — new test file, 30 tests across B6 + B5 + B7 + C9.

### Related

- Decision #211 — B6 BJT PoC (the pattern this session replicates).
- Decision #133 — certified-cross bypass (`withCertifiedBypass` wrap reused).
- Decision #109 — `blockOnMissing` controls note severity not result (relevant to C9 which had `blockOnMissing: true` on its context effect but still needed this filter).
- BACKLOG: Automotive AEC enforcement — replicate B6 pattern to remaining AEC-aware families (now partially complete: B5/B7/C9 done, B8/B9/C10/D1/D2/E1/F1 remaining).

---

## Decision #220 — Collaborative app-feedback threads + platform-scoped under multi-tenancy (June 3, 2026)

### Context

The existing `app_feedback` flow (Decision #162) was one-way: end user submits, admin (Rob) sees it in the Monitoring inbox, admin writes a private `admin_notes` field that the user never sees. No way for a user to see their own past submissions or follow up. No way for Rob to discuss an idea with the person who proposed it.

Customers had started telling Rob in chat/email "did you see my feedback?" — i.e. the absence of a two-sided thread was generating out-of-band communication that defeats the point of having an in-app feedback channel.

### Decision

App feedback becomes a two-sided thread.

**Schema** (`scripts/supabase-app-feedback-comments-schema.sql`):
- New `app_feedback_comments` table — `id`, `feedback_id`, `author_id`, `author_role ∈ {'user','admin'}`, `body`, `created_at`. **Immutable** — no `updated_at`, no UPDATE policy, no DELETE policy. RLS gates user→own-thread reads/writes; admin gets cross-thread read/write.
- Two new columns on `app_feedback`: `user_last_read_at`, `admin_last_read_at`. Single global admin timestamp is the correct shape today (one platform admin) — lift to a per-admin reads table only if/when tenant admins arrive.
- `admin_notes` is migrated into a seed admin comment per row, then dropped (commented manual step in the schema file so Rob can spot-check the migration before committing).

**APIs** (5 new + 2 modified):
- `GET /api/app-feedback` — own list, enriched with `commentCount` + `hasUnread`.
- `GET /api/app-feedback/[id]` — own thread; side-effect stamps `user_last_read_at`.
- `POST /api/app-feedback/[id]/comments` — role resolved server-side from `profiles.role`; max 4000 chars.
- `GET /api/app-feedback/unread-count` — lightweight count for the sidebar dot.
- `GET /api/admin/app-feedback/[id]/thread` — admin variant; side-effect stamps `admin_last_read_at`.
- `GET /api/admin/app-feedback` — extended to compute `commentCount` + `hasUnread` per row.
- `PATCH /api/admin/app-feedback/[id]` — dropped `adminNotes` from payload; status is the only remaining field.

**UI**:
- New `/feedback` page ([app/feedback/page.tsx](../app/feedback/page.tsx)) with two-pane layout — left list of own submissions, right thread detail. "+ New Feedback" button opens the existing unchanged `AppFeedbackDialog`.
- Reusable `FeedbackThread` component ([components/feedback/FeedbackThread.tsx](../components/feedback/FeedbackThread.tsx)) used by BOTH the user page and the admin detail view, parameterized by `viewerRole` — same component, mirrored bubble alignment.
- Sidebar icon (`EditNoteOutlinedIcon`) now routes to `/feedback` instead of opening the dialog. Red dot on icon when admin has replied (user side) or when status='open' OR there's an unread user reply (admin Monitoring side).
- Admin detail view: dropped the `admin_notes` textarea, added the same `FeedbackThread`. Status dropdown stays.

**Multi-tenant posture (deliberate)**: feedback stays platform-scoped. NO `workspace_id` / `tenant_id` on `app_feedback` or `app_feedback_comments`. Even when multi-tenancy ships, every end user still communicates directly with the platform admin (Rob). The `author_role` enum is sized to grow to `'platform_admin' | 'tenant_admin'` without a schema migration if tenant admins later become a concept.

### Rationale

- **Comments replace admin_notes rather than coexist.** Adding a second public-vs-private toggle to the admin UI doesn't pay for the cognitive overhead. If Rob needs private notes later, lift to a separate `app_feedback_admin_internal_notes` table — but YAGNI for now.
- **Immutable comments.** Editable comments would require: (a) versioning the body, (b) deciding whether an edit re-fires the unread dot (it should — the other party hasn't seen the edited form), (c) UI affordance for "(edited)" markers. Three lines of UX-design debt for a feature that support-style threads almost never need. Mirrors Slack DM convention (edits exist but most teams don't use them on support tickets).
- **Side-effect read stamps on GET endpoints.** Not REST-pure, but the alternative (separate PATCH /read endpoint called from the client) doubles the round-trip count and creates a race where the user opens the thread but closes the tab before the client posts. GET-with-side-effect is fine for read tracking; we already do similar things in QC and Atlas Triage.
- **Single `admin_last_read_at`, not per-admin.** Today there is exactly one platform admin (Rob). A per-admin reads table is the right answer if/when tenant admins arrive but it'd be over-engineered today.
- **Unread is computed, not stored.** `hasUnread` per row is `exists(comment from other party with created_at > my_last_read_at)`. Pure derivation from the two timestamps + comments table. No materialized "unread count per row" column to keep consistent.

### Lessons

- The "user can't see their own submissions" gap is invisible to engineering until a user complains out-of-band. The original `app_feedback` shipped fast (one form, one inbox), but the absence of a personal history view turned every follow-up into an email to Rob.
- Sharing `FeedbackThread` between the user page and the admin detail view pays for itself immediately — both sides got chat-bubble alignment, ⌘+Enter to send, char limit, and posting-state UX for the price of one component.
- Keeping the existing `AppFeedbackDialog` untouched (no changes to the submission UX) meant zero risk of regressing the working submission path while shipping the threading layer on top.

### Files

- [scripts/supabase-app-feedback-comments-schema.sql](../scripts/supabase-app-feedback-comments-schema.sql) — new table + `admin_last_read_at`/`user_last_read_at` columns + admin_notes migration (commented manual step).
- [lib/types.ts](../lib/types.ts) — `AppFeedbackComment`, `AppFeedbackCommentAuthorRole`, `AppFeedbackThread`; extended `AppFeedbackListItem` with `commentCount`/`hasUnread`; deprecated `adminNotes` on record.
- [lib/feedbackChrome.tsx](../lib/feedbackChrome.tsx) — shared category icon/status chip/formatters extracted from the admin detail view so the user page can reuse them.
- [app/api/app-feedback/route.ts](../app/api/app-feedback/route.ts) — added GET (own list); POST unchanged.
- [app/api/app-feedback/[feedbackId]/route.ts](../app/api/app-feedback/[feedbackId]/route.ts) — new GET (own thread + read stamp).
- [app/api/app-feedback/[feedbackId]/comments/route.ts](../app/api/app-feedback/[feedbackId]/comments/route.ts) — POST comment, role resolved server-side.
- [app/api/app-feedback/unread-count/route.ts](../app/api/app-feedback/unread-count/route.ts) — lightweight count for sidebar dot.
- [app/api/admin/app-feedback/[feedbackId]/thread/route.ts](../app/api/admin/app-feedback/[feedbackId]/thread/route.ts) — admin thread + read stamp.
- [app/api/admin/app-feedback/route.ts](../app/api/admin/app-feedback/route.ts) — extended to compute `commentCount` + `hasUnread`.
- [app/api/admin/app-feedback/[feedbackId]/route.ts](../app/api/admin/app-feedback/[feedbackId]/route.ts) — stripped `adminNotes` from PATCH.
- [app/feedback/page.tsx](../app/feedback/page.tsx) + [components/feedback/](../components/feedback/) — new user-facing UI.
- [components/admin/AppFeedbackDetailView.tsx](../components/admin/AppFeedbackDetailView.tsx) — replaced admin_notes textarea with shared `FeedbackThread`.
- [components/admin/AppFeedbackTab.tsx](../components/admin/AppFeedbackTab.tsx) — unread dot on user cell + comment-count chip + listener on `feedback-unread-changed` event.
- [components/AppSidebar.tsx](../components/AppSidebar.tsx) — feedback icon routes to `/feedback`, two new dot-badge wirings.

### Related

- Decision #162 — original `app_feedback` schema + attachments.
- Multi-tenant prep memory entry — confirms feedback was always intended to stay platform-scoped under tenancy.

---

## Decision #221 — Automotive AEC enforcement: table-driven mechanism + completing the 11-family rollout (June 3, 2026)

**Context:** Decisions #211 and #219 had shipped automotive AEC enforcement for 4 families (B6 then B5/B7/C9) via per-family copy-paste — each new family added one branch to `applyContextSourceOverrides` and one near-clone filter function (`filterXxxAutomotiveMismatches`). The BACKLOG entry (`Automotive AEC enforcement — replicate B6 pattern to remaining AEC-aware families`) scoped the table-driven abstraction for "past ~5 families" — a heuristic written when only B6 existed and the pattern's generalizability was unproven. This session refactored to the table-driven mechanism and shipped the remaining 7 families in one pass.

### What shipped

1. **`AUTOMOTIVE_AEC_ENFORCEMENT` table** in [partDataService.ts](../lib/services/partDataService.ts): one row per family with `{ familyId, questionId, answerValue, attributeId, attributeName }`. Replaces the 4 per-family filter functions from Decisions #211 / #219.

2. **Generic `applyContextSourceOverrides`** iterates the table on every call and injects when matched. No per-family branches.

3. **New generic `filterAutomotiveAecMismatches(recs, src, ctx, familyId)`** looks the family up in the table to determine which `attributeId` and which `questionId` to consult.

4. **Single switch entry** in the family-id switch — `if (hasAutomotiveAecEnforcement(familyId)) withCertifiedBypass(...)` — covers every enrolled family. The four old per-family switch entries are gone.

5. **11 families enrolled:** B5, B6, B7, B8, B9, C9, C10, D1, D2, E1, F1. Every family from the BACKLOG punch list.

### The questionId trap that made this refactor non-optional

Investigation surfaced that four of the seven remaining families use **different `questionId` strings** in their context configs:

| Family | questionId |
|---|---|
| B5–B9, C9, C10 | `automotive` |
| D1 Crystals | `extended_temp_automotive` |
| D2 Fuses | `automotive_aec_q200` |
| E1 Optocouplers | `automotive_aec_q101` |
| F1 EMRs | `automotive_aec_q200` |

The old per-family approach hardcoded `applicationContext.answers.automotive === 'yes'` in every filter. Continuing per-family would have either silently failed for D1/D2/E1/F1, or required per-family branches keyed on different question strings — strictly worse than encoding the `questionId` on each table row. The "lift past 5" BACKLOG heuristic was therefore wrong about the 5-family threshold; the *real* trigger should have been "the moment we discover families that don't share the same context key." The table needed to exist to ship the four `questionId`-distinct families correctly.

### AEC standard varies by component class

The table makes this visible at a glance instead of buried in 11 filter functions:

- **AEC-Q100 (active ICs):** C9 ADCs, C10 DACs
- **AEC-Q101 (discrete semiconductors):** B5 MOSFETs, B6 BJTs, B7 IGBTs, B8 Thyristors, B9 JFETs, E1 Optocouplers (LED + phototransistor pair)
- **AEC-Q200 (passives + electromechanical):** D1 Crystals, D2 Fuses, F1 EMRs

### B8 sub-type suppression — checked, no special handling needed

B8 Thyristors carries `not_applicable` effects on context Q1 (SCR/TRIAC/DIAC) that suppress sub-type-specific rules like `tq`, `quadrant_operation`, `gate_sensitivity`. None of those `not_applicable` effects touch `aec_q101` — automotive qualification applies uniformly across all three sub-types. Recorded as an inline comment on the B8 table row.

### E1/F1 "extend or chain" — chain, not extend

Both E1 and F1 already had post-scoring filters (`filterOptocouplerMismatches`, `filterRelayMismatches`) for unrelated concerns (E1: output_transistor_type + channel_count; F1: contact_form + coil_voltage_vdc + contact_count). The new AEC filter runs as a separate `withCertifiedBypass` wrap — independent, both bypass for certified crosses, order-independent. The existing filter functions are untouched.

### Test coverage

- All 30 behavior tests from Decisions #211/#219 still pass under the generic API — proof the refactor preserves behavior for the original 4 families (B5/B6/B7/C9).
- 14 new tests: `expectFamilyWiring()` helper exercises each new table row's source-override + filter behavior in 4 assertions per family (B8/B9/C10/D1/D2/E1/F1).
- Table-introspection tests: membership, unique familyIds, valid attributeIds, `hasAutomotiveAecEnforcement` reflects table state, full BACKLOG-punch-list coverage assertion.
- D1's wiring tests include an extra guard: the source-override does NOT fire when the user answers a generic `automotive` question on D1 (since D1's entry is keyed on `extended_temp_automotive`). Locks the per-family questionId contract.
- Total: 44 tests in `automotiveAecEnforcement.test.ts`. Full suite: 1,850 passing.

### Generalization beyond `automotive`

The BACKLOG note also flagged: "If/when medical / military / aerospace context questions land in family files, the switch should be table-driven on (familyId, questionId, answerValue) → injectedAttribute." That generalization is structurally already done — the current table is named for automotive AEC because that's what it covers today, but the row shape is identical to what a medical or military table would need. If/when those land, the right call is a sibling table (`MEDICAL_QUALIFICATION_ENFORCEMENT`, etc.) consumed the same way. Don't try to merge into a single mega-table prematurely — domain-specific table names keep grep-ability high.

### Lessons

- **Heuristic thresholds like "lift past 5" are guesses about generalizability.** The real trigger here was discovering the per-family `questionId` variance, which forced the table regardless of the family count. When you find a structural reason to abstract, lift then — don't wait for a count.
- **Refactor proofs come from preserved behavior tests.** The 30 existing tests from the previous decisions were the safety net for the refactor — they pass unchanged under the new API, confirming the rewrite didn't move the behavior. Skipping those tests would have left this refactor much riskier.
- **A wiring helper (`expectFamilyWiring`) makes adding the remaining 7 families nearly free.** Each new row got 4 behavior assertions for one function call. That's the multiplier the table mechanism unlocks — adding family #12 in the future is now ~5 minutes.
- **`expectFamilyWiring` exercises both directions of the table** — fires on the right `questionId`, no-ops on the wrong one. That asymmetry test is what would catch a future engineer accidentally writing `questionId: 'automotive'` for a D-family entry that should be `automotive_aec_q200`.

### Files

- [lib/services/partDataService.ts](../lib/services/partDataService.ts) — AUTOMOTIVE_AEC_ENFORCEMENT table + generic helpers; replaces ~150 lines of per-family code with ~50 lines.
- [__tests__/services/automotiveAecEnforcement.test.ts](../__tests__/services/automotiveAecEnforcement.test.ts) — refactored existing tests to use the generic API + added 14 wiring tests + table-introspection tests.

### Related

- Decision #211 — B6 BJT PoC (the pattern this decision lifts to a table).
- Decision #219 — B5/B7/C9 + B6 test backfill (the per-family expansion this refactor consolidates).
- Decision #133 — certified-cross bypass (`withCertifiedBypass` wrap reused unchanged).
- BACKLOG: `Automotive AEC enforcement — replicate B6 pattern to remaining AEC-aware families` — CLOSED. All 11 families on the punch list are now enrolled.

---

## Decision #222 — Collaborative app feedback: Trello-style overlay + visual signals + delete capability (June 3, 2026, post-#220 session)

### Context

Decision #220 shipped the two-way thread schema, RLS, all routes, and the initial UI. Same-session testing as a real user surfaced a string of UX and correctness issues that needed back-to-back fixes, ending up as a focused follow-up cut that touches almost every surface of the feature while leaving the data model unchanged. This is that bundle, recorded as one decision so the rationale doesn't fragment across N tiny per-fix notes.

### Decision

**1. Trello-style overlay replaces the inline two-pane shell.**

`/feedback` (user) and `/monitoring` (admin) both stopped using the "list on the left, inline detail on the right" pattern. The list is now full-width on the page; clicking a row opens a centered MUI `<Dialog maxWidth="lg" fullWidth height: 90vh>` with a 60/40 split — left column shows the original submission + attachments + status (+ admin status editor + technical-info collapse), right column is the conversation. Shared component: [components/feedback/FeedbackDetailModal.tsx](../components/feedback/FeedbackDetailModal.tsx), parameterized by `viewerRole: 'user' | 'admin'`. The old [components/admin/AppFeedbackDetailView.tsx](../components/admin/AppFeedbackDetailView.tsx) was deleted.

**2. `FeedbackThread` rewritten: composer at top, newest-first, feed layout.**

The original chat-bubble alignment (mine right / yours left, oldest at top, scroll-to-bottom) was wrong for support threads where the most recent message is what you came to see. Now: composer at the TOP, comments below in reverse-chronological order, no auto-scroll. Each comment is an avatar + name/timestamp header + body block — Trello/forum-style, not chat-bubble. ⌘/Ctrl+Enter still posts, 4000-char limit unchanged. Same component serves both sides (the only thing `viewerRole` drives now is the "You" label on the author's own comments).

**3. User-side card layout + activity-first sort.**

User list was an unstyled `<List>` with rows hugging the top of the page. Replaced with a stack of `<Paper variant="outlined">` cards (rounded, breathing room, hover/selected states). Cards with `hasUnread=true` get a 1.5px primary-color border + "NEW REPLY" label + bold preview text — all three signals clear together when the modal mounts. Sort: `hasUnread` first, then by `createdAt desc` within each group.

**4. Admin-side activity-first sort via `sort_by=activity` on the list endpoint.**

Default `sortColumn` on `AppFeedbackTab` changed from `'created_at'` to `'activity'`. On the server ([app/api/admin/app-feedback/route.ts](../app/api/admin/app-feedback/route.ts)), `sort_by=activity` triggers a different path: fetch the full filtered set (no DB-level `.range()`), compute `hasUnread` per row from the comments table, sort by `(hasUnread desc, created_at desc)`, then slice to the requested page in JS. Other sorts (Submitted/Category/Status column clicks) still use the original DB-ordered + ranged path.

**5. Background polling on all three surfaces.**

`/feedback`, `/monitoring → AppFeedbackTab`, and the AppSidebar badges (both admin and user) each got a 30-second `setInterval` poll guarded by `document.visibilityState === 'visible'` plus a `visibilitychange` listener for immediate-on-focus refresh. Tab-hidden polls are skipped entirely. No event bus needed — the 30s cadence plus the existing `feedback-unread-changed` window event covers the cross-tab / cross-page case.

**6. Re-anchored badges to `needsAttentionCount` (not `status='open'`).**

The Monitoring sidebar dot and the App Feedback nav-section dot used to light up while `statusCounts.open > 0`. That conflated "workflow queue" with "needs my attention" — every reviewed-but-not-resolved item kept the dot on forever. Replaced with a server-computed `needsAttentionCount`: count of items where `hasUnread=true` OR (`admin_last_read_at IS NULL AND status='open'`). Status changes don't affect the badge; only opening the thread (or a new submission landing) does. Field added to the existing admin list response shape; AppSidebar.tsx, MonitoringShell.tsx, and MonitoringSectionNav.tsx all switched.

**7. "NEW" pill moved to leftmost column on admin grid.**

The earlier inline-with-Status placement got moved to its own narrow column at the far left of the table (no header label). Status stays the rightmost column. The pill renders when `!adminLastReadAt && status === 'open'`.

**8. Count badges stripped from filter chips.**

The little numeric badges on the All / Open / Reviewed / Resolved / Dismissed and All types / Idea / Issue / Other chips read as cluttered. Plain chips now. The corresponding `statusCounts` state was dropped from `AppFeedbackTab` since nothing reads it.

**9. Delete-thread capability on both sides.**

Per-row kebab (`MoreVertIcon`) menu via the new shared [components/feedback/FeedbackRowMenu.tsx](../components/feedback/FeedbackRowMenu.tsx). Menu has one item ("Delete thread") that opens a confirm Dialog spelling out "this removes it for both you and {the other side}." Confirm fires `DELETE /api/app-feedback/[feedbackId]` which:
   - Fetches the row's attachments list first (paths needed before DB delete)
   - Best-effort `storage.from(BUCKET).remove(paths)` on the attachment objects
   - DELETE the `app_feedback` row — `app_feedback_comments` cascades via FK
RLS gates the DB-level delete: new policies allow user-owned-row delete and admin delete-any. Matching `storage.objects DELETE` policies for the same authority model.

Admin kebab lives in a new rightmost `<TableCell>` (no header label); user-side kebab lives in the top-right of each card with `onClick={(e) => e.stopPropagation()}` on the wrapper so the modal doesn't open from the kebab click.

**10. RLS fix: SECURITY DEFINER function for user read stamp.**

The original schema only had a user `SELECT` policy and an admin `UPDATE` policy on `app_feedback`. So when the GET `/api/app-feedback/[id]` route fired `UPDATE app_feedback SET user_last_read_at = ...`, RLS silently blocked it — the user's read timestamp never stamped, `hasUnread` stayed true forever, and the blue "new activity" border + red dot + bold text + "NEW REPLY" label all persisted across modal opens. Fix: new `mark_app_feedback_user_read(p_feedback_id UUID) RETURNS TIMESTAMPTZ` function with `SECURITY DEFINER` + `SET search_path = public`, locked to `WHERE id = p_feedback_id AND user_id = auth.uid()`. Route changed from raw `.update()` to `.rpc()`. Same RPC used by the comment-POST route's "stamp author's own read so they don't see themselves as unread" call.

This was a `silent failure` — no error surfaced, the UPDATE just affected zero rows. Improved the comments-POST route to echo Postgres error details into the JSON response so the next "Failed to post comment" surface includes the underlying cause.

**11. Sidebar icon swap + position.**

Feedback nav switched from `EditNoteOutlinedIcon` (pencil-on-paper, implies one-way submission) to `ForumOutlinedIcon` (two overlapping speech bubbles, conveys the back-and-forth thread). Moved from the top-group (under Lists) to the bottom-group, directly above the Releases megaphone (`CampaignOutlinedIcon`).

**12. Card-as-button hydration fix.**

`FeedbackList` originally wrapped each card in `<ButtonBase>` to make the whole card clickable. After the kebab landed inside the card, that became `<button>` (kebab) inside `<button>` (ButtonBase) — invalid HTML. Browsers re-parse and lift the inner button, causing a real React hydration mismatch (not the stale-HMR flavor — actual structural mismatch). Fix: `<Paper>` itself is now the clickable surface (`role="button"`, `tabIndex={0}`, `cursor: pointer`, Enter/Space keyboard handlers, `:focus-visible` outline). The kebab IconButton is now the only `<button>` in the tree.

### Rationale

- **Trello as the reference UX.** The user explicitly invoked it. Side-by-side comparison showed Trello-style modals match how operators actually think about a support ticket: "show me everything about this item at once" — context on the left, conversation on the right — rather than the cramped two-pane shell where everything competes for screen.
- **Composer-at-top + newest-first inverts a chat convention because the use case is different.** Chat is "what's happening now, scroll up for history." Support threads are "what's the latest reply, scroll down for context." The compose target is the same: the next message you're about to send.
- **Activity-first sort was the user's explicit ask, but the right way to ship it server-side meant accepting an in-memory sort + slice path.** At ~100 items this is fine. If the inbox grows past several hundred items, push the sort into a Postgres function (likely `RETURNS jsonb` per Decision #206) so the wire payload stays small.
- **`needsAttentionCount` is the third try at badge semantics in this feature.** First was "any submission exists" (Decision #162 original), second was "open status exists" (Decision #220), this is "unread or never-opened-and-open." The user kept saying "but I've already read these." Lesson: badge math has to model "is there something for the human to do RIGHT NOW", which means anchoring on read state, not status state. Status is a workflow tag, separate concept.
- **Mutual delete (both sides can wipe) over soft-hide.** Simpler model (one boolean less per row), simpler RLS (no "hidden_for_user_at" / "hidden_for_admin_at" columns), and matches the user's stated intent ("deletes for everyone in the thread"). If asymmetric delete-for-me-only becomes a need later, that's a separate column add, not a model change.
- **SECURITY DEFINER over per-column UPDATE grant.** Tried to think through column-level RLS for `user_last_read_at` only and decided the function approach is much cleaner — the policy stays simple, the route's intent is explicit, and the function's body is the documentation. The auth.uid() check inside the function is the actual security boundary.

### Lessons

- **Silent UPDATE-zero-rows under RLS is a high-recurrence trap.** Every Supabase project hits this at least once. Pattern to watch: a route does `.update()` to a column the caller doesn't have an UPDATE policy for, gets `{ data: null, error: null, count: 0 }` back, and the UI quietly stays stale. The fix is usually a SECURITY DEFINER function, not a broader policy. The diagnostic is: when "the update isn't sticking," check RLS policies for the WRITE side specifically — `SELECT` policies don't help with `UPDATE`. The route should log `error?.code` AND `count` (zero rows affected is the smoking gun).
- **Badge semantics rewrites cost more than building the original.** Three rewrites in this feature's life (status-of-any → open-only → needs-attention). Worth investing the time up front asking "what should the dot mean WHEN I'M DONE FOR THE DAY" — that question forces the right anchor (read state vs workflow state vs queue size).
- **`<button>` inside `<button>` only surfaces once a real interactive child lands.** The ButtonBase wrapper was fine in #220's first cut because the card had no clickable children. Adding the kebab changed everything. Pattern: if a clickable container needs to contain ANY actionable element later, don't use `<button>` as the container — use a `<Paper>` / `<Box>` with `role="button"` and `cursor: pointer` from day one. Sub-rule: this also bites with anchor tags — `<a>` inside `<button>` is the same trap.
- **"Hard refresh" reflexively before debugging.** Twice this session, the Next.js corner showed `(stale)` and a hydration error appeared that was actually HMR debris, not a real bug. The yellow `(stale)` badge is the tell. CMD+Shift+R should be step 0.
- **Two-line user descriptions of layout problems compress into the right design constraints.** "60% left, 40% right, composer at top, latest at top, more padding, looks like a card not a list" — that's seven distinct directives in one paragraph that mapped cleanly to the rewrite. Trust them and don't ask for clarification on the small stuff; ask for clarification on the structural stuff (admin parity, attachment lightbox y/n).

### Files

**SQL** — [scripts/supabase-app-feedback-comments-schema.sql](../scripts/supabase-app-feedback-comments-schema.sql) (extended with `mark_app_feedback_user_read` function + 4 DELETE policies for `app_feedback` + storage)

**Server**:
- [app/api/app-feedback/[feedbackId]/route.ts](../app/api/app-feedback/[feedbackId]/route.ts) — switched read-stamp UPDATE to RPC; added `DELETE` handler with storage cleanup
- [app/api/app-feedback/[feedbackId]/comments/route.ts](../app/api/app-feedback/[feedbackId]/comments/route.ts) — RPC for user-side stamp; richer error detail on insert failure
- [app/api/admin/app-feedback/route.ts](../app/api/admin/app-feedback/route.ts) — new `sort_by=activity` mode + `needsAttentionCount` field

**Components**:
- [components/feedback/FeedbackDetailModal.tsx](../components/feedback/FeedbackDetailModal.tsx) — NEW (60/40 Dialog)
- [components/feedback/FeedbackRowMenu.tsx](../components/feedback/FeedbackRowMenu.tsx) — NEW (kebab + confirm + delete)
- [components/feedback/FeedbackThread.tsx](../components/feedback/FeedbackThread.tsx) — composer-top, newest-first, feed layout
- [components/feedback/FeedbackShell.tsx](../components/feedback/FeedbackShell.tsx) — full-width list, modal trigger, polling, delete handler
- [components/feedback/FeedbackList.tsx](../components/feedback/FeedbackList.tsx) — card layout, activity-first sort, kebab placement, button-less clickable Paper
- [components/admin/AppFeedbackTab.tsx](../components/admin/AppFeedbackTab.tsx) — activity-default sort, NEW pill column, kebab column, modal mount, polling, stripped count badges
- [components/admin/AppFeedbackDetailView.tsx](../components/admin/AppFeedbackDetailView.tsx) — DELETED
- [components/AppSidebar.tsx](../components/AppSidebar.tsx) — ForumOutlinedIcon, moved to bottom group, `needsAttentionCount`-driven badges, 30s polling on both useEffects
- [components/monitoring/MonitoringShell.tsx](../components/monitoring/MonitoringShell.tsx) + [components/monitoring/MonitoringSectionNav.tsx](../components/monitoring/MonitoringSectionNav.tsx) — switched to `appFeedbackNeedsAttentionCount`

**Client**:
- [lib/api.ts](../lib/api.ts) — `needsAttentionCount` added to response type; `deleteAppFeedback()` wrapper

### Related

- Decision #220 — initial collaborative feedback feature (this is the bundled follow-up).
- Decision #162 — original `app_feedback` schema + attachments.
- Decision #198 — "L2 as source of truth" pattern (this didn't bite here but the silent-UPDATE-under-RLS lesson is in the same family).
- Decision #206 — `RETURNS jsonb` RPC pattern (where to go if activity-sort scale eventually demands server-side ordering).

---

## Decision #223 — Persisted Defer + Unmappable lifecycle states in Triage (June 4, 2026)

### Problem

The Atlas Dictionary Triage queue accumulated 765 OPEN rows with ~82 of them noting "can't accept this right now — needs upstream work / more context." Notes didn't filter out of OPEN, so the queue kept growing. The schema actually allowed `status='unmappable'` already (per Decision #185) and the queue route already excluded unmappable rows from the default OPEN view — but `unmappable` was reachable **only** through the AI Investigator's `unmappable` bucket action. An engineer who wanted to manually mark "vendor test-condition column" or "park this for engineering reclassification" had no UI button. Two real-world examples from yesterday's session made the gap concrete:

- **Galaxy `AEC Qualified`** — engineer should accept, bad numeric values are upstream's problem. (Accept already works.)
- **JJW `cate3 → 可控硅`** — engineer needs to defer because the right fix is value-based reclassification of misclassified products (BACKLOG entry already filed), not a dict mapping. Today, the only way to take action is to write a team-note that doesn't move the row anywhere.

### Decision

Add two parked lifecycle states with first-class chips, per-row actions, and reversibility:

- **DEFERRED** — new persisted status (`atlas_unmapped_param_notes.status='deferred'`). "Park for later, may revisit." Reversible via Reopen.
- **UNMAPPABLE** — surface the *existing* status as a manual action (was AI-only). "Will never be mappable." Also reversible.

Both:

- Excluded from the default OPEN view (mirrors the existing unmappable exclusion).
- Surfaced as dedicated chips in the lifecycle row of `TriageFilterBar` (between UNDONE and ALL). Lifecycle row goes 4 chips → 6.
- Excluded from `triageCounts` (Open Synonyms / Auto-flagged) so badges match what the engineer actually sees in the default view.
- Excluded from the `manufacturers/route.ts` "Improvement Potential" rollup — parked rows shouldn't keep boosting a MFR's upside score (parallel to the pre-existing `unmappable` skip).

Per-row UI:

- New **Defer** button (warning color, `PauseCircleOutline` icon) next to Accept. Opens a popover with optional reason textarea pre-filled from the AI defer explanation when present (engineer doesn't retype context).
- New `MoreVert` overflow icon next to Defer → Menu with **Mark Unmappable** (less common — confirm dialog, no popover).
- For deferred / unmappable rows: new branch BEFORE the flagged branch renders a status chip + **Reopen** button (clears `status` back to NULL, preserves any engineer note).

### Implementation

**Schema** ([scripts/supabase-atlas-unmapped-param-notes-schema.sql](../scripts/supabase-atlas-unmapped-param-notes-schema.sql)) — CHECK constraint extended to allow `'deferred'`. Idempotent DROP-then-add migration (same pattern already used for prior status growth). Doc-comment block updated.

**Type unions** — `NoteStatus` and `StatusFilter` in [components/admin/atlasIngest/types.ts](../components/admin/atlasIngest/types.ts) are the canonical homes; inline duplicates in `UnmappedParamNoteCell.tsx`, `GlobalUnmappedParamsTable.tsx`, `AtlasDictTriagePanel.tsx`, `unmapped-param-notes/[paramName]/route.ts`, `unmapped-param-notes/route.ts`, `app/api/admin/manufacturers/route.ts`, `app/api/admin/atlas/ingest/batches/route.ts`, and `lib/services/triageQueueCache.ts` synced. `StatusFilter` grew from 4 to 6 values (`open / accepted / undone / deferred / unmappable / all`).

**Queue route** ([app/api/admin/atlas/ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts)) — three structural additions:

1. New predicates: `isDeferred`, `isUnmappable`, and crucially **`isInOpenQueue(r) = isOpen(r) && !isUnmappable(r) && !isDeferred(r)`**. The OPEN count + triage counts now derive from `isInOpenQueue` instead of `isOpen`, so chip badges and visible rows stay aligned.
2. `statusCounts` shape grows: `{ open, accepted, undone, deferred, unmappable }`.
3. View-filter logic changes: parked rows are now excluded conditionally — only when the engineer hasn't explicitly clicked the matching status chip:

```ts
if (include !== 'all') {
  visible = visible.filter((r) => {
    if (isUnmappable(r) && statusFilter !== 'unmappable') return false;
    if (isDeferred(r) && statusFilter !== 'deferred') return false;
    return true;
  });
}
```

This is the right shape — parked rows are *positionally* hidden from default views but *findable* by clicking their own chip. Pre-deploy L2 cache entries get a defensive backfill at read time (`rawCounts.deferred ?? classified.filter(isDeferred).length`) so chip counts are honest immediately on the first post-deploy load, not "wait for SWR refresh."

**Notes endpoint** ([app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts](../app/api/admin/atlas/unmapped-param-notes/[paramName]/route.ts)) — `VALID_STATUS` Set + JSDoc + response cast all accept `'deferred'`. Cache invalidation already there (single-flight `invalidateTriageQueueCache()`) — correct for per-row mutations since the acting user gets optimistic UI and other tabs pick up on next refetch (per the wait-then-restart distinction from Decision #180).

**`onRowFlagged` extended (not new callbacks)** — the plan called for new named callbacks (`onRowDeferred` / `onRowMarkedUnmappable` / `onRowReopened`) but during implementation I extended the existing `onRowFlagged` to accept the wider status union instead. Reasoning: the callback's machinery (optimistic row mutation + triage/status count adjustment + notesByParam seed) is identical regardless of which status is being written, and the alternative was three thin wrappers over the same function. Treating `deferred` + `unmappable` as a single "parked" concept inside the function made the count-math cleaner too (`wasParked`/`isParkedNow` flags). The table calls `onRowFlagged(paramName, 'deferred', 'engineer')` directly — the status arg is the disambiguator.

**Defer popover UX** — `Popover` anchored to the per-row Defer button. Width 520px, textarea `minRows=6 maxRows=14` (grows with content, capped so buttons stay on screen), font size matched to surrounding caption text (`0.75rem` with `lineHeight: 1.5` on `.MuiInputBase-input`). Reason is optional; pre-fill priority: existing engineer note > AI defer explanation > empty.

**Optimistic update fix to `markUnmappable`** — the pre-existing `markUnmappable` only called `onNoteChange` (which updates `notesByParam`). Visibility worked because `filteredRows` reads `liveNoteStatus` from `notesByParam`, but chip count badges (which read from `data.statusCounts`) wouldn't update until next refetch. Extended `markUnmappable` to also call `onRowFlagged` so chip counts update optimistically. Same pattern adopted for `deferRow` + `reopenRow`. Rollback path on PUT failure restores the prior state via the same callback.

### Why DEFERRED and UNMAPPABLE stay separate (not collapsed into one PARKED)

Considered collapsing them into a single `PARKED` chip with sub-filters but rejected. The semantic difference is load-bearing: "come back later" vs "never mappable" inform different downstream behaviors:

- **Improvement Potential math** (today) — both skip, but if we ever want "potential we *could* unlock" vs "potential we *won't* unlock," we need them separate.
- **Bulk operations** (future) — bulk-reopen-deferred makes sense; bulk-reopen-unmappable doesn't.
- **Engineer cognitive load** — these are different decisions; chip labels should reflect that.

### Why AI: DEFER chip and Status: DEFERRED chip both exist

Same word, intentionally orthogonal concepts:

- **AI: DEFER** (Row 3) = filter on the AI's suggestion (transient, client-cached `DictSuggestion.suggestion`).
- **Status: DEFERRED** (Row 2) = filter on the engineer's persisted decision (`atlas_unmapped_param_notes.status`).

A row can sit in `AI:defer + Status:open` (the AI suggested defer, the engineer hasn't acted yet — surfaces in the queue) or `AI:defer + Status:deferred` (engineer agreed and parked it). Don't merge them.

### What this explicitly does NOT do

- No bulk-defer fan-out for "+N similar" cosmetic variants. Per-row only in v1; gauge bulk need from real usage.
- No expiry / reminder on deferred rows. Manual Reopen is the only path back. (If DEFERRED count grows past ~500 over months → BACKLOG item to add "Bulk reopen by MFR" sweep.)
- No new `wrong_family` / `confirmed_in_family` chips on Row 2 — they already have a contextual home under the AUTO-FLAGGED MISCLASSIFICATIONS view in Row 1.

### Process note

The plan said "new callbacks `onRowDeferred` / `onRowMarkedUnmappable` / `onRowReopened`" — I extended `onRowFlagged` instead. This was a deliberate deviation made during implementation when I realized the named wrappers would all delegate to the same machinery. Captured in a memory entry so the deviation is visible in future planning: when an existing general callback covers a new case cleanly, prefer extending over wrapping. The cost of named callbacks is type-discrimination work at every call site for a function that already discriminates internally.

### Verification

All 1,850 existing tests pass. TypeScript clean across the change set. Manual smoke test against the dev DB after applying the schema migration:

1. Pick any OPEN row → Defer → row leaves OPEN view, appears under DEFERRED chip, OPEN count -1, DEFERRED +1.
2. Reopen → row returns to OPEN, counts reverse.
3. MoreVert → Mark Unmappable → row leaves OPEN, appears under UNMAPPABLE chip.
4. AI: DEFER filter still surfaces rows whose engineer hasn't acted (Status:open) — independent of Status: DEFERRED.

### Related

- Decision #176 — Triage workspace origin + persistent queue.
- Decision #177 — `atlas_unmapped_param_notes` schema introduction + `wrong_family` / `confirmed_in_family` statuses.
- Decision #181 — AI Suggester `'accept' | 'defer'` verdict (the AI-side of "defer" the engineer-side now mirrors).
- Decision #185 — AI Investigator's `unmappable` bucket (this work surfaces that status as a manual action).
- Decision #186 — `is_flagged` column + Phase 3 hardening (sibling concept to the new statuses; both add per-row engineer signal).
- Decision #180 — wait-then-restart vs single-flight cache invalidation (per-row defer = single-flight is correct).
- Decision #182 — optimistic row-mutation pattern via `onRowAccepted` / `onRowReverted` (extended by `onRowFlagged`'s wider status union).

## Decision #224 — Self-healing triage cache for the Improvement Potential column (June 4, 2026)

### Problem

The `/admin/manufacturers` "Improvement Potential" column went uniformly blank ("—" on every row) sometime around the Decision #223 deploy. Root cause was an architectural gap, not a calculation bug:

- The column is computed in `app/api/admin/manufacturers/route.ts` from the Triage queue aggregation (`classified` rows × per-row weight), read from the `triage-queue` L2 cache row in `admin_stats_cache`.
- The route only **read** that cache (`readCachedTriageData(false)`). It never registered or invoked the compute.
- The compute fn (`computeTriageAggregation`) and its `registerTriageCompute(...)` call were **module-private to the batches route** (`app/api/admin/atlas/ingest/batches/route.ts`). The compute is therefore only registered in a process/worker that has loaded the batches route module.
- The `triage-queue` row is **DELETEd** on every triage mutation (Accept/Revert/note edit) and effectively reset by the #223 deploy (which reshaped `CachedTriageData`). Once cold, the manufacturers route got `null` → `triageAvailable=false` → `improvementPotentialPpt=null` for **every** MFR → all "—", and it could not self-heal until someone opened the Atlas Ingest/Triage page (which loads the batches module, registers the compute, and repopulates the cache).

### Decision

Make the manufacturers route rebuild the triage cache itself rather than depending on another route's module load.

1. **Extract** `computeTriageAggregation` + its shared types (`AutoFlag`, `NoteStatus`, `MatchingImpact`, `GlobalUnmapped`, `Classified`, `OverrideMeta`) + status predicates (`isOpen/isAccepted/isUndone/isDeferred/isUnmappable/isInOpenQueue`) out of the batches route into a new shared module `lib/services/triageQueueCompute.ts`. The module calls `registerTriageCompute(computeTriageAggregation)` at its own scope, so **any importer registers the compute**. Compute fn is a closure with no per-request deps, so the move is behavior-preserving. The batches route imports these back; no logic change to its GET handler.
2. **Add** `getOrComputeTriageData()` to `lib/services/triageQueueCache.ts`: read L1→L2; on a cold cache, run the registered compute synchronously (~1–3s post-#194), write L1+L2, return fresh data; on stale L2, serve + background-refresh (SWR). Returns null only if no compute is registered or it throws.
3. **Switch** the manufacturers route from `readCachedTriageData` to `getOrComputeTriageData`, plus a bare side-effect import of `triageQueueCompute` so the compute is registered in this route's process.
4. **Close the persisted-payload loop.** The manufacturers route caches its own computed payload (60s mem + persistent `manufacturers-list-*` row) and serves it indefinitely until invalidated — so an all-"—" payload computed during a cold cache would survive. Added `summary.triageAvailable` to the payload and extended `looksPoisoned(payload, { includeTriageGap })`: the normal read path rejects a `triageAvailable === false` payload (forces a self-healing recompute), the compute-failed fallback path does NOT (a list with one empty column beats a 503). Absent field (legacy rows) is treated as not-poisoned to avoid a deploy thundering-herd. Bumped `CACHE_KEY` `manufacturers-list-v2` → `v3` so the existing cold-triage row is discarded on first post-deploy read.

### Result

The column self-heals on the next request after any triage invalidation — no manual "open the Triage page" step. Net behavior for the user: open `/admin/manufacturers`, the first load recomputes (a couple seconds), the column is populated, and it stays correct across subsequent triage mutations. 1850 tests pass; tsc clean on touched files.

### Related

- Decision #202 — the Improvement Potential column itself (weight heuristic, three-state display).
- Decision #180 — triage cache L1+L2+SWR + the two invalidate variants this builds on.
- Decision #198 — L2-as-source-of-truth cache invalidation pattern.
- Decision #223 — the deploy that reset `CachedTriageData` and surfaced this gap.

## Decision #225 — MFR identity: dedupe shadow rows, expose Atlas ID, guard the import (June 4, 2026)

### Problem

The admin MFRs list showed visually duplicated manufacturer rows. Investigation split them into two distinct phenomena:

- **True duplicates (9 pairs):** same `name_en` AND `name_zh` — one real company imported twice. Fingerprint: a richer "original" (descriptive slug like `jdt-fuse`, `700xxx` atlas_id, aliases/partsio) plus a bare "shadow" (`jdt`, small atlas_id `251`, no aliases). Root cause: `scripts/atlas-manufacturers-import.mjs` upserts with `onConflict: 'atlas_id'`, so the same company re-listed under a *different* atlas_id inserts a second row.
- **English-code collisions (9 pairs):** same `name_en`, *different* `name_zh` — genuinely different companies sharing a 2–3 char abbreviation (HX = 红星 / 恒佳兴; HUAWEI = 华威集团 / 华为). Legitimate separate rows.

A compounding display bug: `app/api/admin/manufacturers/route.ts` computes per-row product counts by folding across `[name_display, name_en, name_zh, ...aliases]`. When two rows share `name_en`, both match products keyed under that string — so both HX rows claimed the same 1,642 products. **Key finding:** `atlas_products` has *no* manufacturer ID — products link to manufacturers purely by **name string** (upsert key `(mpn, manufacturer)`). The headline totals are summed from raw product stats (not the MFR rows), so they were NOT inflated; only the per-row display and "MFRs with products" count were.

### Decision

Three things, scoped to what's safe now; the deeper ID-on-products migration deferred to BACKLOG.

1. **Expose `atlas_id` as an "Atlas ID" column** on the MFRs page. Verified unique: 1,023 rows, 0 null, 1,023 distinct, none shared — a clean row-level key (just not yet unique *per company*, which is what the dedupe fixes). Makes both phenomena legible: true dupes show two different Atlas IDs for one name; collisions show different IDs + different Chinese names.

2. **Dedupe the 9 true-duplicate pairs.** New `scripts/atlas-dedupe-manufacturers.mjs` (dry-run default, `--apply`, snapshot-before-delete). Groups by `(name_en|name_zh)`; keeper = richer row (aliases·100 + partsio·50 + slug length); ties abort for manual review. Safe because no table FKs `atlas_manufacturers`, and the only slug-keyed dependent (`manufacturer_cross_references`) is migrated first (0 needed this run). Applied: 1,023 → 1,014 rows, 0 dupes remaining. Snapshot gitignored for reversibility.

3. **Guard the import against recurrence.** `atlas-manufacturers-import.mjs` now skips any incoming record whose `(name_en|name_zh)` already exists under a *different* atlas_id (DB guard), plus an intra-file guard for the same within one sheet. Matching atlas_id still updates normally. Without this, the next master-list import would recreate the shadows.

### Direction (the "unique ID" model)

`atlas_id` is the intended per-company spine. Getting there is staged: (1) dedupe so it's unique *per company* (done); (2) add an `atlas_id` FK to `atlas_products` + backfill so products peg to it instead of a name string; (3) switch aggregation to join on ID, killing collisions by construction. Note: a related `companyUid` concept (Decision #148) is the cross-source key that also covers Western MFRs — atlas_id is the Atlas-specific identity that would map under it. Steps 2–3 tracked in BACKLOG.

### Update (same day) — collision root cause found + bridge fix shipped

Investigating why two different "HX" companies (红星 / 恒佳兴) each showed the same 1,642 products revealed the exact mechanism — and corrected an earlier wrong assumption:

- **Root cause:** ingest's `cleanManufacturerName()` (`scripts/atlas-ingest.mjs`) strips the Chinese half of the source's `manufacturer.name` (`"HX 红星"` → `"HX"`). Fine for unique English names; for shared codes it merges two companies under one string, and the admin page's `name_en` fold credits both with each other's products.
- **The "unresolvable tail" fear was WRONG.** The source files are per-company (`mfr_207_HX_红星` vs `mfr_731_HX_恒佳兴`), each carries the full unique name, AND every product stores `atlas_source_file`. So the correct owner is 100% deterministic — no guessing. (Verified: all 1,642 "HX" products trace to 红星's file; all 634 "LX" to 灵星芯微's. The other 7 collisions have zero ingested products.)
- **Bridge fix (shipped today):** `scripts/atlas-rekey-collision-products.mjs` (dry-run/`--apply`/snapshot) re-keys colliding products' `manufacturer` from the bare code to the full source name via `atlas_source_file`. Applied: 1,642 → "HX 红星", 634 → "LX 灵星芯微". Page now attributes correctly (红星 1642 / 恒佳兴 0; 灵星芯微 634 / 连欣科技 0). Safe — verified zero flag/settings/xref references to the bare strings.
- **Recurrence prevented:** `cleanManufacturerName()` is now collision-aware — `loadCollidingEnNames()` pulls `name_en` values shared by >1 manufacturer at ingest start (auto-discovers, no hardcoded list) and keeps the full name for those. Because `runProceed` re-maps from source ("we don't trust report content for the DB write"), this applies on UI Proceed too — so the **pending 恒佳兴 batch is now safe to apply** (keys to "HX 恒佳兴").
- The bridge is forward-compatible with Steps 2–3 (the atlas_id backfill keys off `atlas_source_file`, not the manufacturer string).

Separate item surfaced (BACKLOG): 连欣科技's LX batch was applied but shows 0 products — likely clobbered by 灵星芯微's same-"LX" upsert (overlapping `(mpn, manufacturer)` key, last-write-wins). Re-ingesting its file under the collision-aware script recovers it as "LX 连欣科技".

### Related

- Decision #148 — manufacturer alias resolver + `companyUid` stable-FK concept.
- Decision #202 — Improvement Potential column (consumes the same per-MFR fold).
- Decision #174 — ingest pipeline (report/proceed re-map from source; proceed route spawns the .mjs).

## Decision #226 — Sync the chat agent's recommendation count with the panel's displayed set (June 4, 2026)

**Problem.** The chat agent reported "Found 13 replacement candidates" while the right-most recommendations panel showed only 1 card. Both numbers were technically correct but measured different things, so the contradiction read as a bug:

- The agent's count came from `recs.length` — the **full** candidate set the server returns — in two deterministic summaries: `buildRecsSummary()` ([lib/services/recommendationSummary.ts](../lib/services/recommendationSummary.ts)) and the LLM context block `summarizeRecommendations()` ([lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)).
- The panel's count came from two **default-ON** display filters in `RecommendationsPanel` — `activeOnly` (hides non-`Active`: Obsolete/Discontinued/NRND/LastTimeBuy) and `hideHighFails` (hides non-certified candidates with >2 real failing parameters). The chat-driven `dispatchFilterIntent()` path ("Chinese only", "≥80%") had the same drift — it counted the `applyRecommendationFilter` result, which omits the panel's default quality/active filter.

**Decision.** Route every count the agent states through **one shared predicate** equal to the panel's default-visible set, and report it "lead-with-shown, note-hidden."

- **Single source of truth** in [lib/types.ts](../lib/types.ts): `DEFAULT_MAX_MISMATCHES = 2`, `isDefaultDisplayed(rec)` = `status === 'Active' && (isCertifiedCross(rec) || countRealMismatches(rec) <= DEFAULT_MAX_MISMATCHES)`, and `getDefaultDisplayedRecs(recs)`. Sits next to the existing `countRealMismatches`/`isCertifiedCross`/`filterRecsByMismatchCount` helpers (client-importable).
- **Panel** now references `DEFAULT_MAX_MISMATCHES` instead of an inline `const MAX_MISMATCHES = 2`, so when both default toggles are on, the visible set provably equals `getDefaultDisplayedRecs(...)`. The user toggles are unchanged — turning one off intentionally widens the set beyond the predicate.
- **`buildRecsSummary`** leads with `getDefaultDisplayedRecs(recs).length`, appends "N others hidden (obsolete or 3+ failing parameters) — say 'show all' to review them", and has an all-hidden branch that says the candidates exist + how to reveal them (never "none found").
- **`summarizeRecommendations`** quotes the shown count as the headline number but keeps the **full** list available to the LLM with hidden entries tagged `[hidden by default — …]`, plus an instruction line: report the shown count, surface a hidden candidate only when directly relevant (e.g. the only match for a constraint), and when you do, say it's hidden + how to reveal it. This is what lets the agent answer "any Chinese replacements?" truthfully when the only Chinese option is quality-hidden, instead of flatly denying it.
- **`dispatchFilterIntent`** reports `getDefaultDisplayedRecs(filtered).length` for the headline + top picks (panel still receives the full `filtered` set so its own "show all" reveals the rest), with the same hidden note and an all-hidden branch.

**Scope note.** Display/summary only — **no `RECS_CACHE_SCHEMA_VERSION` bump** (scoring is untouched). Chat messages remain a static log: the shared predicate matches the panel's *default* state at the moment the agent speaks; if the user later manually toggles "show all", an older chat line doesn't retro-update (expected for a transcript), but any new statement still computes from the same predicate.

### Related

- Decision #173 — deterministic post-recs summary (`buildRecsSummary`) replacing LLM-driven assessment; this extends it to reconcile counts.
- Decision #109 / #159 — `countRealMismatches` / `isCertifiedCross` / `filterRecsByMismatchCount` pure helpers (the new predicate joins them).
- Decision #131 / #171 — filter pipeline + origin filter (the chat-driven path that also drifted).

## Decision #227

**Date:** 2026-06-07

**Context.** A user asked why the recommendation context questions for `BC337-40` (a BJT, family **B6**) appeared to ask "Is this an automotive application?" **twice**. Investigation showed it wasn't a duplicate question — the **operating-mode** question (Q1) was rendering with the **automotive** question's title. The UI renders question titles/labels from the i18n locale files (`contextQ.<familyId>.<questionId>.text`), falling back to the TS source (`lib/contextQuestions/*.ts`) only when the key is absent — see [components/ApplicationContextForm.tsx](../components/ApplicationContextForm.tsx). The TS source (the single source of truth the matching engine reads) was always correct; the bug lived purely in the translation layer.

**Root cause.** A broken translation-extraction step had two failure modes: (a) it **copy-pasted the automotive question's text into the first/classifying question** of several families, and (b) it **truncated strings at apostrophes**, leaving dangling escape backslashes (e.g. `"Low Q / don\\"`). Affected, across en/de/zh-CN:
- Q1 title clobbered with automotive text: `65.application_type`, `B6.operating_mode`, `C4.device_function`, `B4.tvs_application`, `B3.zener_function`.
- Title cross-contaminated with a sibling question / truncated: `64.application_type`, `64.dvdt_requirement`, `67.function`, `68.function`, `69.application_type`.
- Apostrophe-truncated option labels/descriptions (8 keys, en + de identically; zh-CN clean — no apostrophes).

**Scoring impact: none.** The engine keys off `questionId` + selected answer `value` + each option's `attributeEffects`; it never reads the human-readable title. Only the *displayed* labels were wrong — a user-confusion bug, not a wrong-recommendation bug.

**Fix.**
- `en` is the source language, so its `contextQ` entries are now regenerated to match the TS source byte-for-byte (text + option label + option description).
- `de` corrupt (backslash-truncated) values restored; the 5 families' Q1 titles + the two cross-contaminated titles translated to proper German. `zh-CN` Q1 titles corrected (its option labels were already clean).
- New guard test [__tests__/services/contextQuestionTranslations.test.ts](../__tests__/services/contextQuestionTranslations.test.ts) makes this class of error fail CI: (1) `en` must match the TS source exactly for every present text/label/desc; (2) no two questions within a family may share a title and no two options within a question may share a label (copy-paste detector — the only check that works for the translated locales); (3) no string may be empty or end in a stray backslash (truncation detector). 164 cases, all locales.

**Lesson.** Display text and matching logic are intentionally decoupled (logic in TS, display in locale JSON), so a translation typo can silently misrepresent a question with zero test coverage and no effect on results to flag it. Any text rendered from a translation layer that mirrors a code-side source of truth needs a guard test asserting the source-language locale matches the source verbatim, plus structural detectors (intra-scope uniqueness, corruption) for the translated locales where verbatim comparison can't apply.

## Decision #228 — Composite domain cards: deterministic facts + AI narrative (June 8, 2026)

**Context.** Atlas family "domain cards" (`atlas_family_domain_cards.card_text`) were fully Opus-generated prose, injected verbatim into the Triage `/suggest` + `/investigate` Sonnet prompts. An auto-audit ([lib/services/atlasFamilyCardAudit.ts](../lib/services/atlasFamilyCardAudit.ts)) regex-parses that prose to verify facts (MFR cohort, MPN prefixes, rule weights/types, Chinese→canonical mappings) against source-of-truth and gates Approve. This failed trust two ways: (1) **false-positive blocks** — the audit misread the AI's prose idioms (three classes patched in one prior session alone: ASCII-prefixed dict keys, short-ASCII MFR-name collisions, "all weight=10 except X=9"); each erodes confidence in the red signal. (2) **unverifiable narrative** — the audit only checks data-grounding, so a human still had to skim every card. Root cause: the AI was asked to *re-state* facts already known authoritatively in code/DB, and the audit *re-extracted* them from prose to check — the round-trip through prose is the defect.

**Decision.** Render the factual card sections **deterministically from source** at generation time; have Opus write only the engineering narrative; compose both into `card_text`. Scope the audit to the narrative region only.

- **New pure module** [lib/services/atlasFamilyCardComposite.ts](../lib/services/atlasFamilyCardComposite.ts) — dependency-free sentinels (`===FAMILY FACTS…===` / `===END FAMILY FACTS===` / `===ENGINEERING NOTES===`), `CARD_FORMAT_VERSION=2`, `composeCardText(facts, narrative)`, `splitCardText(card) → {factsRegion, narrativeRegion}`. Kept dependency-free so the client admin panel can import compose/split without dragging the server-only renderer (Supabase service client via grounding) into the bundle — same split as `atlasFamilyCardAuditTypes.ts` vs `atlasFamilyCardAudit.ts`. `splitCardText` returns `factsRegion=null` when no sentinel is found → the legacy-prose signal.
- **New renderer** [lib/services/atlasFamilyCardFacts.ts](../lib/services/atlasFamilyCardFacts.ts) — `renderCardFacts(familyId, {table, groundingBlock})` composes the facts prose (RULES from `getLogicTable`, CHINESE→CANONICAL dict from `getAtlasParamDictionary`+shared CJK-filtered, CONVENTIONAL UNITS from the dict `unit` field, MFR COHORT from `buildGroundingBlock`) plus structured arrays for a future UI-tables follow-up. Re-exports the composite helpers for server callers. Exported `extractChineseDictEntries` from `atlasFamilyCardGrounding.ts` for reuse.
- **Generate route** narrows the Opus prompt to "write the ENGINEERING NOTES only" with the facts injected as read-only "FACTS ALREADY ESTABLISHED (do not restate)"; the four anti-restatement rules forbid exactly the shapes audit CHECKS 1–6 hunt — assert weight/type in `attr (…)` form, write a `中文→canonical` arrow, introduce an MFR, claim an MPN prefix (naming a canonical or interpreting a clone relationship is still allowed). After Opus returns, `composeCardText(facts.renderedText, narrative)` is persisted; `data_snapshot.cardFormatVersion=2` + `factsRenderedAt`.
- **Audit** splits at the top: v2 → checks 1,3,4,5,6 run on the narrative; CHECK 2 (OMITTED_MFR) skipped entirely (renderer includes the top-15 cohort by construction, `MFR_LIMIT=15` ≥ the top-10 omission window). v1 (no sentinel) → full-text path unchanged. Mechanically: param renamed `cardTextRaw`, `const cardText = isV2 ? narrativeRegion : cardTextRaw` so every existing check body operates on the right surface. Legacy heuristics (`MFR_NAME_BLOCKLIST`, context-exemption helpers) stay for v1.
- **fix-issues route** edits only the narrative for v2 and recomposes the facts back, so the proposal the engineer sees + saves is a full composite card.
- **UI** ([components/admin/AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx)) renders the FACTS region read-only (boxed monospace + muted banner) and binds the editable textarea to the NARRATIVE only; recomposes `composeCardText(factsRegion, editedNarrative)` before every PATCH so stored `card_text` stays composite.
- **Mirror** the split + sentinels into [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) (byte-identical inline copies — same no-import mirror discipline as `atlas-ingest.mjs`).

**Backward compatibility.** No forced migration. The 7 TS built-in cards + all existing DB active cards stay plain prose with no sentinel → `splitCardText` returns null → audit runs the legacy full-text path, UI shows the single textarea, Triage injects them verbatim. A family becomes v2 only when regenerated. `getFamilyDomainCard` is unchanged — Triage consumes both identically. Composition is at generation time (not read time) — keeps the Triage hot path fast and approve/diff semantics intact (the engineer approves the exact injected bytes).

**Verification.** `renderCardFacts` against live DB for C8 (RULES 22=22, cohort 15=15) and B4 (RULES 23=23, cohort 15=15) — facts match `getLogicTable`/`buildGroundingBlock` by construction; compose/split round-trips; auditing the composite returns `clean` (issueCount=0) even though the real facts regions contain dict arrows, explicit rule weights, and AM-style MPN suffixes — because those now live in the stripped facts region. 2037 unit tests pass (new: [atlasFamilyCardComposite.test.ts](../__tests__/services/atlasFamilyCardComposite.test.ts), [atlasFamilyCardAuditScoping.test.ts](../__tests__/services/atlasFamilyCardAuditScoping.test.ts) — the latter asserts a bogus MFR in the facts region is NOT flagged while the same MFR in the narrative IS, plus v1 backward-compat). Rollout is engineer-driven family-by-family via the existing Regenerate → review → Approve flow; start with the families that suffered the most false positives (C8, C9, C4, B4, F66, B8, C2). Follow-up (BACKLOG): render FACTS as proper tables via the `RenderedFacts` structured arrays.

**Lesson.** When an AI is asked to re-state facts that already exist authoritatively in code/DB, and a verifier re-extracts them from prose to check, the prose round-trip is the defect — not the AI and not the verifier. Render the facts deterministically, let the AI write only what it actually owns (judgment), and scope verification to that region. Facts become correct by construction and the human review surface shrinks from "the whole card" to "a few judgment sentences."

## Decision #229 — Source-panel Cross References chips become clickable filters (June 9, 2026)

**Context.** The single-part view has two cross-reference filter surfaces. The **source panel**'s "Cross References" section ([components/AttributesTabContent.tsx](../components/AttributesTabContent.tsx)) renders `MFR Certified (N)` / `Accuris Certified (N)` / `Logic Driven (N)` chips + a "Manufacturers with crosses" chip list — always visible, but presentational (no `onClick`). The **Replacements panel**'s Filters popover ([components/RecommendationsPanel.tsx](../components/RecommendationsPanel.tsx)) holds the real `CROSS REFERENCE SOURCE` + manufacturer filters in *local* state. Users instinctively clicked the always-visible source-panel chips and nothing happened. Removing the chips wasn't wanted (the summary is useful); duplicating the filter logic wasn't either.

**Decision.** Wire the source-panel chips to the popover's existing filters via one shared state — the source panel becomes an always-visible overview + one-click shortcut; the popover stays the full refine surface (not redundant: one is a launchpad, the other the advanced control).

- **Lift** the two filter values into `DesktopLayout` (`xrefCategory: RecommendationCategory | 'all'`, `xrefMfr: string`), reset on `sourceAttributes?.part.mpn` change — mirrors the existing `activeAttributesTab` lift. Passed to *both* panels as the single source of truth.
- **`RecommendationsPanel`** — `selectedCategory`/`selectedMfr` converted to **controlled-with-fallback** props (`categoryFilter`/`onCategoryFilterChange`, `mfrFilter`/`onMfrFilterChange`): use the prop when provided, else local state. The modal-chat usage (`compactHeader`, unwired) keeps purely-local behavior. All existing readers/handlers (`activeFilterCount`, the filter chain, the popover chip group, `handleClearFilters`, dismissible chips) read the resolved value unchanged.
- **Source chips** ([AttributesTabContent.tsx](../components/AttributesTabContent.tsx)) gain `onClick` + toggle (click active → clear) + active-fill styling (category: solid `CATEGORY_CHIP_COLORS.fg` bg + dark text; MFR: `color="primary"` filled) so the source panel visually matches the popover selection. Clicking a chip while `phase === 'comparing'` also calls `onBackToRecommendations()` so the filtered list is visible.
- **Count alignment (finishes Decision #226 for this surface).** `summarizeCrossRefs` now counts over `getDefaultDisplayedRecs(allRecs)` instead of the raw set, so a chip's number equals what a click surfaces in the panel (default-hides inactive + >2-fail). #226 fixed the same count-drift for the chat↔panel surfaces but left this fourth surface counting the full candidate set.
- **Source panel = part inventory, not view (same-session follow-up).** Testing surfaced a deeper principle: when the agent narrows the right panel via a chat filter ("show me Chinese replacements" → `mfr_origin_filter: 'atlas'`), the source panel's "Cross References" summary (category chips + "Manufacturers with crosses" row) was *also* narrowed — listing only the filtered MFRs — because [DesktopLayout.tsx](../components/DesktopLayout.tsx) fed `<AttributesPanel allRecommendations={recommendations}>` the *filtered* subset. But the source panel describes the **part**, so it should show the part's complete cross-reference inventory regardless of any right-panel filter; filters are a property of the working recommendation view, not of the part. The chat filter is already non-destructive — `dispatchFilterIntent` ([useAppState.ts](../hooks/useAppState.ts)) keeps the full set in `state.allRecommendations` and only narrows `state.recommendations` (enrichment re-applies `currentFilter` against the base, confirming the base is preserved for exactly this). Fix is two lines: AppShell passes `allRecommendations={appState.allRecommendations}` to DesktopLayout, which feeds the **base** set to `<AttributesPanel>` while the right panel keeps `recommendations` (filtered). **Scope kept the #229 quality bar** (user-confirmed): `summarizeCrossRefs` still counts over `getDefaultDisplayedRecs(...)`, so the source lists every MFR with a *solid* (non-obsolete, ≤2-fail) cross — all origins, default quality — rather than every raw cross. No change to `AttributesTabContent`. Edge resolved (same session): the source-panel filter chips are right-panel shortcuts, so clicking an MFR outside an active chat filter would yield 0 in the right panel (its data is the chat-narrowed subset). Fixed by having source-chip clicks **silently clear** any active chat filter first, so they always filter from the full inventory. New `clearChatFilterSilently()` in [useAppState.ts](../hooks/useAppState.ts) (restores `recommendations = allRecommendations`, nulls `currentFilter`/`currentFilterLabel`, NO chat messages — distinct from `dispatchClearFilter` which posts "Filter cleared…" to the transcript; bails out via `return prev` when no filter is active). Threaded AppShell → DesktopLayout → the `handleSelectXrefCategory`/`handleSelectXrefMfr` handlers, which call it before setting the panel-local filter. No UI consumes `currentFilterLabel`, so the silent clear leaves no stray indicator.
- **Panel-header reconciliation (same-session follow-up).** Testing surfaced a second drift: the Replacements header read "69 active matches · 10 hidden" while a filter chip read "40 hidden" — three tallies (`activeCount`/`hiddenCount`/`highFailHiddenCount`) all computed over the *full* `sorted` set, none reacting to the active manufacturer/category filter, and two using the word "hidden" for different reasons (status vs quality). Fixed by introducing a `scoped` set (recs after the explicit MFR/category/CN/zero-stock filters) and computing every count from it: header now reads `{shownCount} shown · {hiddenInScope} hidden` (reconciles exactly with the rendered cards — `shownCount` accounts for the render-time active-only collapse at [RecommendationsPanel.tsx](../components/RecommendationsPanel.tsx) line ~380), and `qualityHiddenCount`/`statusHiddenCount` (the ">N fails" chip + "Active only (N hidden)" / "Hide >N failed (N hidden)" popover labels) are scoped to the same set so they read as a breakdown of the header's single hidden total rather than competing numbers. i18n `headerFiltered` reworded in en/de/zh-CN (`{{activeCount}}`→`{{shownCount}}`, drop `{{matchWord}}`) — edited surgically per the locale-clobber trap ([[translation-layer-guard]]): a full json round-trip silently collapsed en.json's duplicate keys and reindented zh-CN, both reverted and hand-edited.

**Scope note.** Display/interaction only — **no `RECS_CACHE_SCHEMA_VERSION` bump** (scoring untouched, same as #226). The popover's own `categoryCounts` still count over the full `sorted` set (the "advanced" surface where showing everything is fine); routing those through the predicate too is optional future polish. Zero new type/lint errors (the 2 pre-existing React-Compiler errors in the touched files are baseline).

### Related
- Decision #226 — the count-alignment predicate (`getDefaultDisplayedRecs`) this reuses; #226 was scoped to chat↔panel, this extends it to the source-panel summary.
- Decision #122 / #127 — recommendation categorization + sort (the `RecommendationCategory` buckets the chips filter on).

## Decision #230 — Unified notifications system: in-app inbox + transactional email (June 9, 2026)

The app communicated through scattered, source-specific channels (feedback unread dots, release-note badges, a release-digest email) with no single place a user could see "everything the app wants to tell me," and most events produced no email at all. This decision adds a **source-agnostic notification pipeline**: any producer calls one service that (1) drops a row into a per-user in-app **inbox** (bell icon + unread badge + popover + `/notifications` page) and (2) sends a **transactional email** gated by the user's per-type settings, with a click-through link back into the app.

**Why immediate per-event email (not a digest):** confirmed with the user. It matches the "click and go read it" mental model and — critically — needs **no scheduler**, so it works on the IT-managed off-Vercel host. Per-type on/off toggles in Settings prevent overload. (The existing batched release-digest cron is left running; per-event `release_note` notifications are a future producer that will eventually supersede or gate it.)

**Architecture:**
- **Table `notifications`** ([scripts/supabase-notifications-schema.sql](../scripts/supabase-notifications-schema.sql)): `recipient_id`, `type` (CHECK enum: `feedback_reply`/`feedback_new`/`release_note`/`bom_report`/`system`), `title`, `body`, `link`, `data` JSONB (carries `dedupeKey`), `read_at`, `email_sent_at`, `created_at`. RLS: users SELECT own only; **no user INSERT/UPDATE policy** — writes go through the service-role client, mark-read through SECURITY DEFINER RPCs `mark_notification_read` / `mark_all_notifications_read` (mirrors `mark_app_feedback_user_read`).
- **Central service** [lib/services/notificationService.ts](../lib/services/notificationService.ts) (server-only): `createNotification()` inserts the inbox row, then reads recipient `email`/`preferences`/`disabled`, and if email is enabled for the type sends via Resend and stamps `email_sent_at`. **Email is failure-isolated** — the inbox row is created first and email failure only logs. `createNotifications()` is the bulk fan-out variant (single insert, one profiles query, chunked sends). `getAdminRecipientIds()` resolves active admins. Dedup via `data->>dedupeKey`. Called fire-and-forget from producers (`void createNotification(...).catch(()=>{})`).
- **Shared email helper** [lib/services/emailService.ts](../lib/services/emailService.ts): `getResend()`, `getFromEmail()`, `toAbsoluteUrl()`, `buildNotificationEmailHtml()` (dark-theme shell + CTA button), `sendNotificationEmail()`. The release-digest route was refactored to use `getFromEmail()` so the from-address default is consistent.
- **API routes** under `app/api/notifications/`: GET list (cursor on `created_at`), `unread-count`, `[id]/read`, `read-all`. Client wrappers in [lib/api.ts](../lib/api.ts).
- **Inbox UI** [components/notifications/](../components/notifications/): self-contained `NotificationsBell` (badge + 30s poll gated on tab visibility + `notifications-changed` window event, mirroring the existing feedback-dot pattern in `AppSidebar`), `NotificationsPopover` (recent 15 + mark-all-read + "View all"), shared `NotificationsList`, and a full `/notifications` page. Bell mounted in `AppSidebar` above the feedback icon.
- **Preferences** [components/settings/NotificationsPanel.tsx](../components/settings/NotificationsPanel.tsx): new Settings → Notifications section. Master email switch + per-type checkboxes stored in `profiles.preferences.notificationPreferences` (JSONB, no migration). `NotificationPreferences` + `DEFAULT_NOTIFICATION_PREFS` + `isNotificationEmailEnabled()` in [lib/types.ts](../lib/types.ts). The in-app inbox **always** receives every notification; settings only gate email.

**v1 producers wired** (per user choice): admin reply → feedback owner (`feedback_reply`); user submission/reply → active admins (`feedback_new`). Release-note-to-all-users and the weekly BOM report are deferred — they're one `createNotification()`/`createNotifications()` call away (BACKLOG).

**Email domain correction:** the existing `DIGEST_FROM_EMAIL` was `notifications@xrefs.app`; the real domain is **xrefs.ai**. Fixed in `.env.local` + `.env.example` and the code default. **Prerequisite for delivery (IT/DNS task):** verify `xrefs.ai` in Resend and add SPF/DKIM/DMARC records; set `NEXT_PUBLIC_APP_URL=https://xrefs.ai` so email links are absolute.

**Verification:** 2040/2040 tests pass; zero new type/lint errors. SQL must be run manually in the Supabase SQL editor before the feature works.

---

## Decision #231 — Legacy-MFR Triage discovery pipeline + gaia preferredSuffix fix (June 10, 2026)

**Trigger.** An engineer saw `vrrm` "Missing" on Atlas product `20ETF10` (mfr ISC) even though
the raw param `gaia-peak_repetitive_reverse_voltage = 1000 V` was clearly ingested, and searching
Triage for it returned nothing. Investigation found **two systemic gaps for legacy MFRs** (those
bulk-loaded Mar 23 2026 via the old direct-upsert script, before the batch pipeline / Decision
#174 shipped May 5 2026 — confirmed ~102 of 382 source files have **no** `atlas_ingest_batches`
row; ISC is one).

**Gap A — discovery blind spot.** The Triage queue reads unmapped params ONLY from
`atlas_ingest_batches.report->'unmappedParams'` (status pending/applied). Legacy MFRs have no
batch row, so their genuinely-unmapped params are invisible/undiscoverable in Triage — no search
string surfaces them. Triage search is not broken; it indexes the raw vendor param name, and the
row simply doesn't exist.

**Fix A — retroactive "discovery" batches.** New `--discover-legacy` mode in
[scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) re-runs the current mapper over every
source file with no batch and writes a slim `status='discovery'` batch carrying that MFR's
`unmappedParams` (original vendor names preserved). The existing Triage RPC/compute/UI surface
them with ~zero downstream changes. Design choices:
- New `status='discovery'` value (migration
  [supabase-atlas-ingest-discovery-status.sql](../scripts/supabase-atlas-ingest-discovery-status.sql)
  + one-token RPC change). NOT reused `'applied'` — the 30-day `atlas_ingest_cleanup_expired`
  sweep would auto-delete the discovery signal, and revert/Applied-tab flows would break (no
  snapshots). Every other status consumer filters `pending`/`applied` explicitly, so `discovery`
  is naturally excluded from the operator apply queue.
- Discovery skips the expensive `fetchExistingProducts`+`computeDiff` (unmapped params are
  diff-independent) and stores a slimmed report (no per-product attrChanges) to keep the Triage
  RPC's JSONB walk cheap as ~102 batches accumulate.
- **Dedup guard:** a later real upload of a legacy MFR deletes its stale `discovery` row in the
  same `reportOneFile` delete block (`.in('status', ['pending','discovery'])`) so the same params
  aren't double-counted.
- Admin trigger [POST /api/admin/atlas/ingest/discover-legacy](../app/api/admin/atlas/ingest/discover-legacy/route.ts)
  (cloned from backfill-translations: detached spawn with **spread argv** for the Turbopack
  gotcha, status-row lock, `invalidateTriageQueueCacheAndAwaitFresh()` on child exit) +
  "Scan legacy MFRs" button/chip in [AtlasIngestPanel](../components/admin/atlasIngest/AtlasIngestPanel.tsx).
- Loop closes via the existing global backfill (`--backfill-translations` applies the new
  overrides into `atlas_products`). Runbook Phase 5 added.

**Gap B — gaia `preferredSuffix` silent drop (separate bug, all MFRs).** When a gaia param's
suffix didn't match the dict's `preferredSuffix` (e.g. only `-Max` present but dict prefers
`Typ`), the mapper `continue`d — storing nothing AND not pushing to `unmappedParams`. The value
was lost AND hidden from Triage. This is why `20ETF10.trr` (`gaia-reverse_recovery_time-Max`)
stayed Missing.

**Fix B.** `preferredSuffix` is now a preference among *available* variants, not a hard drop: a
pre-pass records `stem → Set<suffix>` per product; a non-preferred suffix is skipped only if the
preferred variant is actually present, else it maps. Mirrored in
[atlasMapper.ts](../lib/services/atlasMapper.ts) (read) + [atlas-ingest.mjs](../scripts/atlas-ingest.mjs)
(ingest). Impact: ISC backfill went from **0 → 1,493** products that would gain previously-dropped
params (`rds_on`, `vgs_th`, `body_diode_vf`, `trr`, …) — a large coverage recovery from one fix.

**Backfill hardening (audit).** `runBackfillTranslations` now also purges the recommendation
cache (`part_data_cache` where `service='search' AND cache_tier='recommendations'`) — re-mapping
an Atlas candidate otherwise leaves source-MPN recs scored on stale specs for up to 30 days.
Operational note: `atlas_products` is **411K rows** (≈4× prior estimate), so the global backfill
runs scoped/in waves, off-peak; ISC alone is the first wave.

**Verification:** 2042/2042 tests pass (incl. 2 new preferredSuffix regression tests); zero new
type errors in changed files; `--discover-legacy --dry-run --mfr 388` detects ISC as legacy
(883 unmapped) and the ISC backfill dry-run now shows 1,493 changes incl. `20ETF10 → trr`. SQL
(migration + RPC re-run) must be applied manually in Supabase before discovery inserts work.

## Decision #232 — Dictionary-override loaders silently capped at 1000 (June 10, 2026)

**Symptom.** While adding two B1 gaia aliases (ISC's `peak_repetitive_reverse_voltage → vrrm`,
`non_repetitive_peak_surge_current → ifsm`, the value-present-but-Missing case on `20ETF10`),
the backfill printed `Loaded 1000 dictionary overrides (add: 1000, modify: 0, remove: 0)` — a
suspiciously round number with the cap signature.

**Root cause.** Both dictionary-override loaders fetched
`atlas_dictionary_overrides.select().eq('is_active', true)` with **no `.range()` pagination**, so
PostgREST's 1000-row default response cap silently truncated the result. Confirmed: after
pagination the true count is **1034** — 34 active overrides (every accepted Triage mapping past
#1000) were being **silently dropped**. This bit BOTH paths:
- ingest/backfill: [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) `loadAndApplyDictOverrides()`
- live read: [lib/services/atlasDictOverrides.ts](../lib/services/atlasDictOverrides.ts)
  `fetchAllDictOverrides()` + `fetchDictOverrides()` (feeds `fromParametersJsonb` recommendation scoring)

So mappings beyond #1000 stopped applying **anywhere** — directly throttling the legacy-discovery
loop (Decision #231): the more the engineer accepts in Triage, the more accepts are ignored. This
is a **new instance** of the same 1000-row footgun class as Decision #206 (which fixed the *triage
aggregation RPC* via `RETURNS jsonb`) — different code, different table, never touched by #206.

**Fix.** Paginate both loaders with `.range(from, from+999)` loops that **STOP on error** (never
loop on a failed page — the Decision #183 partial-result trap). Read-path uses a shared
`fetchOverridesPaginated(supabase, familyId?)` helper; the .mjs carries the mirror inline next to
the existing `loadCollidingEnNames()` pagination. After the fix the loader reports the true 1034.

**Same-session companion (gaia aliases).** The two B1 aliases live in the shared
[atlas-gaia-dicts.json](../lib/services/atlas-gaia-dicts.json) (loaded by both the TS read-path and
`atlas-ingest.mjs` — no mirror needed). ISC backfill: **224 products changed, 0 errors**;
`20ETF10` now carries `vrrm = 1000 V` / `ifsm = 300 A`. Pattern matches the Galaxy vendor-spelling
playbook (Decision #215) — vendor word-order variants the existing dict didn't cover.

**Verification.** tsc clean on changed files; 241 atlas tests pass; ISC dry-run + real backfill
both report 224 changed / 0 errors; loader count 1000 → 1034.

## Decision #233 — Override loader stable ordering + full-fleet legacy backfill + duplicate-MPN convergence finding (June 11, 2026)

**Context.** Ran the full legacy-discovery + backfill follow-through from Decision #231. Discovery:
`--discover-legacy` created **101 new discovery batches** (now 102 discovery / 295 applied / 0
pending); the Triage distinct-param total rose **14,413 → 26,440** (legacy MCU/memory/processor MFRs
carry heavy vendor-unique param sprawl). Backfill (user-approved, run-now scoped waves):
**18,441 products** would change fleet-wide from the gaia preferredSuffix fix + the #232-uncapped
overrides; executed as MindMotion (validate 112) → 70-MFR tail (5,570) → JJW (3,925) → SWST (8,834,
5 transient `fetch failed`, idempotent re-run converged). ~18,197 rows backfilled clean and
**converged** (subsequent global dry-run shows them `same`).

**Bug found mid-backfill — non-deterministic override loading.** A 244-row / 13-MFR remainder would
NOT converge: re-running reported "N changed, 0 errors" yet the next dry-run flagged the identical
rows, and a probe showed a product's mapped key-set flipping between runs. Root cause #1: **both
dictionary-override loaders paginated with `.range()` but no `ORDER BY`** — PostgREST returns
paginated rows in arbitrary, run-to-run order, so the ~35 active overrides *past #1000* (exactly the
ones #232 just un-capped) silently dropped/duplicated across the page boundary. Same 1000-row footgun
family as Decisions #206/#232, third instance. **Fix:** added a stable total order
`.order('created_at').order('id')` before `.range()` in BOTH
[lib/services/atlasDictOverrides.ts](../lib/services/atlasDictOverrides.ts) `fetchOverridesPaginated`
(live recommendation-scoring read path — this was a latent **scoring-determinism** bug, not just an
ingest one) and [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) `loadAndApplyDictOverrides`
(mirror). `created_at` = meaningful order (newer accepts apply last), `id` = unique tiebreak that
guarantees no skip/dup. Post-fix the loader loads a stable 1035 every run.

**The deeper root cause #2 — duplicate-MPN dual-category source collisions (the real reason the 244
won't converge).** The ORDER-BY fix made loading deterministic but the 244 STILL flagged. Source
inspection: SEMBO's `SA5.0A` (and ~200 of the 244) appears **twice in one source file** under two
different category classifications — e.g. once as **TVS Diodes** (B4, 8 params → 7 rich keys: ipp /
vbr / vc / ir_leakage / vrwm / polarity / package) and once as **Rectifiers** (B1, 7 params → ~1 key).
Both share `componentName`, so ingest/backfill map both and write both against the same
`(mpn, manufacturer)` DB row — **last-write-wins** — and the dry-run *always* sees the non-winning
occurrence as a pending diff. These rows are **irreducible via backfill**: they can never converge,
and forcing re-runs risks landing the sparse Rectifier version over good TVS data. Confirmed by
matching the per-MFR "would change" counts to dual-category-dup counts almost exactly (YJYCOIN 34≡34,
INPAQ 67≡67, Hanrun 7≡7, SUMIDA 3≡3, SEMBO/LGE 1≡1, Aosong 2≡2). A residual ~43 (MXChip/UMW/Geehy/
COSINE/ETA, 0 dups) are a smaller separate value-level matter, not investigated. These collisions
predate this session (always in the source); backfill merely rewrote them under the same last-wins
rule. **Decision: stop backfilling these 13; the proper fix is deterministic collision resolution
(prefer the richer / more-specific classification, or dedup at source) — BACKLOG'd**, tied to
Decisions #175 (B1↔B4 reclassification), #191 (MPN-quality validator), #225 (name-string identity).

**Verification.** 2067/2067 tests pass; tsc clean on changed files; post-fix override load stable at
1035 across 5 runs; SEMBO `SA5.0A` restored to its 7-key TVS mapping. Net fleet backfill ≈18,197
rows converged, 0 net errors. NO SQL/DDL required (the #231 migration + jsonb RPC were already in
prod). Files changed: the two override loaders only.

**Follow-up same session — duplicate-MPN collision FIXED (richest-wins dedup), not just deferred.**
Rather than leave the 244 as BACKLOG, shipped the deterministic fix: new `dedupRichestByMpn(products)`
helper in [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) collapses same-`componentName`
occurrences within one source file to the **richest** (most mapped keys; ties keep first for
stability). Wired into BOTH write paths — `runBackfillTranslations` (had no dedup → last-UPDATE-wins)
and `runProceed` (changed its existing **last**-wins Map to richest-wins). Ingest-only (the read path
maps a single already-deduped DB row, so no atlasMapper.ts mirror needed). Because the dry-run uses
the same `runBackfillTranslations` path, these rows now **converge** instead of perpetually
re-flagging. Recovery run over the 13 MFRs: **162 changed, 0 errors**; global "would change" dropped
**244 → 43**; collision rows' rich/sparse split improved **119/112 → 180/51** (61 sparse rows
recovered to their full TVS spec). The remaining **51 "sparse"** are parts whose *richest* occurrence
genuinely maps to ≤3 keys (real source-data limitation, now correctly + stably stored — not loss).
**No permanent data loss occurred** — all rich versions live in the source files and are now applied.
The residual **43** non-convergent rows (MXChip 3, Geehy 5, COSINE 14, ETA 21 — zero duplicate MPNs)
are a SEPARATE, minor **value-level** non-convergence (same keys, a value/unit/numericValue
representation that won't settle across map→write→re-map; NO key/data loss) — BACKLOG'd for later,
low impact (4 small MFRs). 2067/2067 tests pass; richest-wins helper unit-checked.

**Third + fourth instances of the 1000-row footgun — Triage override fetches (same session).** An
engineer asked "am I re-mapping params I already mapped?" Investigation found TWO more uncapped
`atlas_dictionary_overrides` SELECTs (the table is now **1319 rows: 1136 active + 183 inactive**, so
a single SELECT silently drops 319 to the cap):
- [lib/services/triageQueueCompute.ts](../lib/services/triageQueueCompute.ts) `getOrComputeTriageData`
  — fetched overrides ordered `updated_at desc`, no `.range()`. The cap dropped the **253 oldest
  active overrides** from the "already-accepted" map, so the params they map were no longer
  recognised and **reappeared in the OPEN Triage queue** (engineer re-sees old work). This is the
  one that drives the visible queue.
- [lib/services/atlasTriageContext.ts](../lib/services/atlasTriageContext.ts) cross-family canonical
  index (feeds the AI /suggest + /investigate prompts) — unscoped `is_active` fetch, no `.range()`,
  so the AI saw an incomplete view of already-mapped canonicals and could re-suggest existing ones.
**Both fixed** with paginated loops + stable order (`updated_at desc, id` / `attribute_id`), STOP-on-
error. **Measured real impact**, replicating the compute's `${dominantFamily|dominantCategory}:norm(param)`
match over the live 26,440-row queue with capped (883-active) vs full (1136-active) maps: only **8
queue rows** were actually resurfacing (the other 245 dropped overrides map params not currently in
the aggregate). So the bug is real but small *today* — it grows as accepts accumulate, and it
degraded AI suggestions. The engineer's broader déjà-vu is mostly **vendor-spelling variants** (same
concept, different Chinese/English string per MFR — Decision #215 pattern) + **cross-scope re-mapping**
(same param under a different family/category — Decision #178), i.e. genuinely-new work that merely
*feels* repetitive. 2067/2067 tests pass; tsc clean on both files. Atlas now has **FOUR** known
override-fetch sites; the two display/per-family ones ([dictionaries/route.ts](../app/api/admin/atlas/dictionaries/route.ts)
list, `fetchAcceptedCanonicals` per-family) are scope-bounded and not at practical cap risk.

## Decision #234 — Reverted per-row dict mutations to single-flight invalidate (June 12, 2026)

**Symptom.** Engineer reported Triage Accept clicks took 30+ seconds each, up from "a few seconds" earlier in the week. Consistent across every Accept, not intermittent.

**Root cause.** Decision #186(e) had switched dict `POST` / `PATCH` / `DELETE` from `invalidateTriageQueueCache()` (single-flight, fire-and-forget after `L2 DELETE`) to `invalidateTriageQueueCacheAndAwaitFresh()` (drain in-flight + `L2 DELETE` + start fresh recompute + **await it**). At the time the swap shipped, the recompute was ~2–3s (Decision #180 had just brought it down via the JSONB RPC) and `await` semantics were cheap. Two recent changes compounded the cost:

1. **Decision #231 (June 10)** moved filter/sort/clustering server-side. The compute now does per-row `isFlagged` / `hasNote` / `similarSiblings` PLUS "+N similar" siblings over the FULL queue set (~26k rows after PR #2).
2. **Decision #233 (June 11)** paginated `atlas_dictionary_overrides` to handle the 1,319-row table. The compute now reads **all** active overrides on every recompute, not just the first 1,000.

Net: the recompute grew from ~2–3s to ~20–30s. Because per-row mutations awaited it under #186(e), every Accept inherited the full cost.

**Why #186(e) was the wrong fix even at the time.** The concern it addressed was "client refetch races the recompute and sees the just-overridden row as Open." That concern had already been **superseded by Decision #182** (optimistic UI): `onRowAccepted` mutates the row in place — there *is no* client refetch on Accept. The pre-existing [cache-invalidation-wait-then-restart](../.claude/projects/-Users-robvolkel-Developer-xrefs-app/memory/cache-invalidation-wait-then-restart.md) memory (2026-05-08) had already documented the convention: per-row mutations use single-flight, batch-state mutations use wait-then-restart. #186(e) silently violated that convention to satisfy a freshness guarantee that wasn't actually being used by any code path.

**Fix.** Reverted three call sites back to `invalidateTriageQueueCache()`:
- [app/api/admin/atlas/dictionaries/route.ts:237](../app/api/admin/atlas/dictionaries/route.ts) — POST = Accept
- [app/api/admin/atlas/dictionaries/[overrideId]/route.ts:52](../app/api/admin/atlas/dictionaries/[overrideId]/route.ts) — PATCH = edit override
- [app/api/admin/atlas/dictionaries/[overrideId]/route.ts:98](../app/api/admin/atlas/dictionaries/[overrideId]/route.ts) — DELETE = Revert

The `L2 DELETE` still runs synchronously (~100–300ms — keeps concurrent readers from seeing pre-insert state). The background recompute fires async; the next Triage GET that misses L2 waits ~20–30s on cold compute, but subsequent GETs hit warm L2. Batch-state mutations (upload / proceed / revert / regenerate / batch-DELETE / proceed-all-clean) unchanged — `invalidateTriageQueueCacheAndAwaitFresh()` remains correct for those per the original Decision #180 split, since they're slow operations where the user is already in a "waiting for slow op" mental state and downstream-page freshness matters.

**Verified.** Live dev-server timings on three back-to-back Accepts:

| # | Total | compile | proxy.ts | render | Note |
|---|-------|---------|----------|--------|------|
| 1 | 1.0 s | 213 ms | 300 ms | 531 ms | Cold compile |
| 2 | 612 ms | 4 ms | 193 ms | 415 ms | Warm — expected baseline |
| 3 | 5.8 s | 22 ms | 657 ms | 5.1 s | Spike (see follow-up) |

Net: ~30 s → ~600 ms warm = **50× improvement**. The 5.8 s spike on the third request is almost certainly the prior Accept's background recompute holding a Supabase service-client connection while this Accept's POST queues on the pool — filed as a BACKLOG follow-up; the underlying 50× win is unaffected.

**Tests.** `__tests__/services/triageQueue*` (12/12) passes. TS errors in `matchingEngine.test.ts` are pre-existing and unrelated.

**Lesson — recompute cost is a moving target.** A pattern that's free when the recompute is 2 s becomes a foot-gun when the recompute is 25 s. The choice between single-flight and wait-then-restart should be made based on *"does the caller actually depend on the freshness guarantee?"* — not on *"is this technically an awaited call?"* When the answer is no (because optimistic UI handles freshness for the acting user), single-flight is always the safer default: its worst case is "next cold read pays 25 s," which is bounded, rare, and amortized across all callers — vs. wait-then-restart which charges every single mutation 25 s.

## Decision #235 — F1/F2 Atlas classifier branch + relay MFR re-ingest (June 14, 2026)

**Symptom.** User flagged a Triage row for `介质耐压` (dielectric withstanding voltage) on HONGFA showing AI verdict "wrong family" → reclassify to "Transformers" with productCount 141k. Spot-checked the row: zero affected products in HONGFA scope per the diagnostic. Same pattern repeated across 9 other clearly-relay paramNames (`线圈电压类型`, `触点形式`, `机械耐久性`, etc.), all labeled B5 MOSFETs.

**Investigation.** Three rounds of progressively cheaper, more thorough diagnostics:

1. **Source file pristine** — `mfr_30_HONGFA_宏发_params.json` ships c1="Relays", c2/c3="Power Relays, Over 2 Amps", 20,206 products with canonical relay parametric data (`触点形式`, `线圈工作电压`, `介质耐压`, ~34 params per product). Not an ingest input bug.
2. **Classifier blind spot** — `classifyAtlasCategory` in [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) and the [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) mirror had **zero relay handling at any tier**. No L3 branch for F1/F2, no L2 fallback (Transformers / Filters / Sensors / etc all had c1/c2 catch-alls; relays did not), and no c1 catch-all for the "Relays" string. HONGFA's perfectly-tagged file fell all the way through to the final catch-all and landed as `{ category: 'ICs', subcategory: 'Power Relays, Over 2 Amps', familyId: null }`. Paginated `GROUP BY family_id` confirmed: **19,843 (98.2 %) HONGFA products sitting at `family_id = null`, 363 (1.8 %) in B5**.
3. **Catastrophic JSONB degradation** — sampled 12 HONGFA products at random offsets across the catalog. Every one had only 7–10 parameter keys, mostly **unit-suffix stems** like `g, m, ac, dc, mm, ms, mm3, input_voltage_type`. Source ships ~34 paramNames per product; effective ingest survival rate was ~24 %. Cause: unmapped paramNames falling through to an aggressive unit-suffix fallback that collides on shared suffixes (`重量(单位：g)` and any other `(单位：g)`-suffixed param both key to `g`, last write wins). F1 and F2 dicts in `atlasParamDictionaries` were **completely empty** (grep clean), so every Chinese relay paramName hit the fallback.

**The 363-in-B5 turned out to be benign.** Hypothesized to be a separate SSR/PhotoMOS line caught by a Rds(on) signature. Actually: same disease, different legacy state. The re-ingest upsert correctly flipped all 20,206 products to F1 in a single pass (none stayed in B5).

**Fix — three code changes + nine data migrations.**

1. **Classifier branch** in [lib/services/atlasMapper.ts:200](../lib/services/atlasMapper.ts) + mirror in [scripts/atlas-ingest.mjs:130](../scripts/atlas-ingest.mjs). SSR check first (substring subset: `'solid state relay'` / `'photo relay'` / `'photomos'`) → F2. EMR catch-all (`c3.includes('relay')` or `c1.includes('relay')`) → F1. Placed between E1 Optocouplers and the discrete-semi block, matching that block's "subset check before generic match" pattern.
2. **F1 + F2 dicts** in [lib/services/atlasMapper.ts:1819](../lib/services/atlasMapper.ts) + mirror. F1: ~75 entries covering all 34 HONGFA paramNames + English aliases, mapped to F1 logic-table canonicals (`coil_voltage_vdc`, `contact_form`, `contact_voltage_rating_v`, `operate_time_ms`, `mechanical_life_ops`, `isolation_voltage_vrms`, etc.) with underscore-prefix catalog attrs for non-scored fields. AC/DC switching ratings split (AC → canonical, DC → catalog `_contact_voltage_dc_v`) so both can coexist in JSONB without overwriting. F2: ~30 entries seeded from F2 logic table + best-guess Chinese aliases — no ground-truth SSR vendor file yet, expect refinement via Triage when the first dedicated Chinese SSR MFR drops.
3. **`包装形式` added to skipParams** in both files. HONGFA's only unmapped param post-fix was `包装形式` (packaging form, values "吸塑片" / "型管或吸塑盘"). The shorter `包装` was already in skipParams as a buyer-concern not a parametric; this is the same concept under the longer Chinese name. One-line addition rather than a Triage Accept since the convention already exists.
4. **`RECS_CACHE_SCHEMA_VERSION` v11 → v12** in [lib/services/partDataCache.ts:81](../lib/services/partDataCache.ts) to invalidate any recommendation responses cached against pre-re-ingest (null-family, 8-key) HONGFA / Slkor / Everlight / etc. products. Otherwise up to 30-day staleness on any MPN that was searched before this change.

**Data migrations applied.** Eight pending batches generated and applied via the Decision #174 pipeline (each writes a `atlas_products_snapshots` row first; revert window 30 days):

| MFR | Products | Family after |
|---|---|---|
| HONGFA | 20,206 | F1 = 20,206 |
| Everlight | 3,559 | F2 = 4 + LEDs/optos as before |
| Slkor | 1,153 | F1 + scattered (mixed discrete-semi MFR) |
| CT MICRO | 357 | F1 |
| APSEMI | 349 | F2 = 393 (PhotoMOS line) |
| CHIPANALOG | 348 | F2 = 1 |
| AOTE | 309 | F2 |
| KTP | 200 | F2 |
| STEIPU | 196 | F1 = 370, F2 = 12 |

Total upserts: **~26,677 products** updated. Verified post-apply scope check: of 20,708 products with subcategory containing "relay" (or 继电器) currently in the DB, **20,706 are now in F1 or F2; 0 in B5; 2 in null** (down from 19,843 in null). Average JSONB key count per HONGFA product: **7.3 → 14.6** (sample products carry 14–15 real F1 canonicals each: `coil_voltage_vdc, contact_form, contact_count, contact_material, contact_voltage_rating_v, contact_current_rating_a, isolation_voltage_vrms, operate_time_ms, release_time_ms, mechanical_life_ops, electrical_life_ops, operating_temp_range, package_footprint, coil_power_mw, mounting_type, coil_suppress_diode`).

**Tests.** Full suite 2068 / 2068 passes. Atlas-specific suite 241 / 241.

**Lesson — three concentric blind spots compound.** The bug surfaced because the AI Triage Investigator gave a wrong verdict (Transformers, an L2 category — Decision #190's validation would have rejected it had Confirm fired). But the AI verdict was the symptom, not the disease. Behind it sat:

- **Layer 1**: classifier missing F1/F2 branches.
- **Layer 2**: dicts missing for F1/F2.
- **Layer 3**: ingest fallback that silently degrades unmapped params instead of preserving them under their raw paramName.

Each layer alone would have been recoverable in Triage. Together they made **~26K products effectively invisible** to the recommendation engine — sitting at `family_id = null` (no logic table runs) with ~24 % of their parametric data preserved (and even that 24 % under collided unit-stem keys). The system had no signal that this was happening: every relay MFR ingested cleanly with no errors, no warnings, no Triage queue noise that pointed at the disease (the unmapped paramNames appeared in Triage but only got assigned to `dominantFamily = B5` because of the 363 stragglers, leading the AI Investigator down a wrong path).

**Followup.** Step 5 of the plan — adding unambiguous-relay paramNames (e.g. `^contact_form`, `^coil_voltage`, `^mechanical_life`) to `FAMILY_PARAM_SIGNATURES` (Decision #207) — would have caught Layer 1 even without the classifier branch. Tracked in BACKLOG as the future-proofing safety net. Decision #199 retroactive backfill (`npm run atlas:backfill --mfr <slug>`) is now available for cleaning up the English-paramName variants the engineer will accept via Triage over the next few sessions (APSEMI uses "Circuit ", "Voltage - Input ", "Operating Temperature " with trailing spaces; CT MICRO ships compound forms like `集射极饱和电压(VCE(sat))`).

**Post-apply Triage cleanup — superseded-batch staleness.** After the re-ingest, user reported the Triage UI still showed all the now-mapped Chinese relay paramNames as unmapped, with their stale pre-fix dominantFamily=B5. Investigation: `get_triage_unmapped_aggregate()` (Decision #180) reads `report->'unmappedParams'` JSONB from **every** `atlas_ingest_batches` row with `status IN ('pending', 'applied', 'discovery')`. SUMs productCount across batches. Old applied batches from prior ingests (HONGFA had a 2026-05-20 batch alongside today's 2026-06-14 batch; Slkor had 3 batches; Everlight had 3) carried a frozen pre-fix `unmappedParams` array — those got summed into the current aggregate even though today's batch correctly reports only `包装形式` as unmapped. Net: 22 superseded batches across 19 MFRs (6 from this session, 16 accumulated from prior re-ingest sessions) polluting the queue.

Fix: `scripts/_tmp-clear-superseded-unmapped.mjs` identifies applied batches with a NEWER applied batch for the same `source_file` and zeroes out their `report.unmappedParams` array (preserves snapshot links, classification stats, audit trail — only clears the queue-contribution field). Cleared all 22 in one pass, invalidated `admin_stats_cache` L2 row for `triage-queue`. Verified post-cleanup via direct RPC call: 11 of the 11 originally-polluted HONGFA paramNames disappeared from the queue except `包装形式` (HONGFA's June 14 batch was generated before `包装形式` was added to skipParams; will clear on next HONGFA re-ingest).

**Lesson — the .mjs `--proceed` path should clear superseded batches' unmappedParams automatically.** Re-ingest IS the supersede signal — there's no scenario where the previous batch's unmappedParams aggregate should still contribute to the queue after a newer batch is applied for the same source_file. Tracked in BACKLOG: add `clearSupersededUnmappedParams(sourceFile)` call inside the `--proceed` path so this doesn't recur. Until that lands, manually re-run `_tmp-clear-superseded-unmapped.mjs --apply` after any batch of re-ingests; idempotent (skips batches whose unmappedParams is already empty).

**Closeout (June 14, 2026) — 7 follow-up commits that finished Items 1 + 2:**

**A. F2 SSR dict expansion + whitespace normalization (commit `2fda2ac`).** The classifier moved 7 non-HONGFA relay MFRs into F1/F2, but my Chinese-focused dicts (seeded from HONGFA's vocabulary) didn't cover APSEMI's English vendor convention or STEIPU/AOTE/KTP's distinct Chinese variants — leaving those products classified-but-degraded with ~0 mapped F2 attributes. Added ~25 F2 entries (APSEMI English: `circuit`, `voltage - input`, `output type`, `operating temperature`, `device package`; PhotoMOS catalog: `fet type`, `rds on`, `vgs(th)`; Chinese: `隔离电压(vrms)`, `触点形式`, `最大切换电流`, `连续负载电流`, `导通时间(ton)`, `截止时间(toff)`, `导通电阻`, `过零功能`) + `rohs code` to metadata dict + `country of origin` to skipParams. Also added internal-whitespace normalization to the dict lookup (`p.name.toLowerCase().trim().replace(/\s+/g, ' ')`) so CT MICRO's multi-space padded paramNames (`Light Current   (mA)`) and APSEMI's trailing-space pattern match dict keys without per-variant entries. Backfilled APSEMI (341 changed), STEIPU (11), AOTE (33), KTP (2), HONGFA (0 — already gold standard).

**B. Stale-batch cleanup (commit `2a414b1`).** Same staleness pattern as A applied to batch reports: today's dict additions made paramNames mapped, but 103 batches' frozen `unmappedParams` still listed them. Generic `_tmp-clear-now-mapped-params.mjs` cleared 185 stale entries across 19+ MFRs (many Chinese MFRs use the same paramNames I added, not just relay ones). Triage queue: 26,329 → 26,294.

**C. Productized cleanup commands (commit `c0481e4`) — closes the "still open" backlog item from above.** Replaced the `_tmp` scripts with first-class ingest commands:

1. **`--proceed` auto-clear (inline)**. After successful `status='applied'` mark, finds every OTHER batch for the same `source_file` and blanket-clears their `report.unmappedParams = []`. Same source_file = same paramName universe; the new batch's report is a strict subset of any older batch's (new dict entries only ever REMOVE entries). Failure is non-fatal — the apply already succeeded, idempotent on next `--proceed`.
2. **`--rescan-unmapped-params` standalone command**. Walks every applied/pending/discovery batch's report.unmappedParams and drops entries that would now resolve against the active dict (per-family / L2-category / shared / metadata / skipParams) after `loadAndApplyDictOverrides()` merge. Handles the cross-batch dict-additions case where a paramName became mapped via a code change or a Triage Accept in `atlas_dictionary_overrides`, which `--proceed` auto-clear doesn't subsume. Supports `--dry-run`.

First rescan revealed the full backlog: **334 batches across all MFRs had 3,422 stale entries** accumulated over every Triage Accept since the system started. SG-Micro 194→150, Sunlord 92→65, AnBon 64→23, SIMCOM 2163→2124, YFW 1125→1083. Triage queue: 26,294 → 24,969 (–1,325).

**D. E1 optocoupler dict expansion (commit `e54c933`) — Item 1 from the post-session followups.** Survey of Triage queue scoped to `dominantFamily=E1` showed 80 unmapped paramNames affecting 2K+ optocoupler products. Most were vendor-variant forms of paramNames the existing E1 dict already handled — parenthetical-suffix variation, half-letter case in propagation-delay names, Greek μ vs Latin u in CMTI units, or English forms from MFRs using JEDEC nomenclature. Added ~80 new E1 entries: `正向电流(If)` and `forward current (if)` → `if_rated_ma`; `集射极饱和电压(VCE(sat))` → `vce_sat_v`; `电流传输比(CTR)最小值` / `最大值/饱和值` → `ctr_min_pct` / `ctr_max_pct`; `传播延迟 tpHL` / `tpLH` (with space) → `propagation_delay_us`; `cmti(kv/us)` Latin-u variant → `_cmti_kv_us`; power dissipation / data rate / input threshold current catalogs; JJW English (`VISO (Vrms)`, `TOPR (°C)`, `VR_Max (V)`); CT MICRO Static dv/dt variants; light-current / Ic output current variants; many shared opto-LED-side catalogs.

Backfilled 9 opto-heavy MFRs:

| MFR | Products | Changed | % |
|---|---|---|---|
| AOTE | 309 | 248 | 80 % |
| Kinglight | 502 | 237 | 47 % |
| JJW | 8,287 | 2,251 | 27 % |
| Yint | 2,546 | 1,154 | 45 % |
| CT MICRO | 357 | 103 | 29 % |
| Everlight | 3,559 | 45 | 1 % (mostly LEDs) |
| KTP | 200 | 27 | 14 % |
| MP | 269 | 22 | 8 % |

**~4,087 products newly mapped.** Then `--rescan-unmapped-params` cleared 174 more stale entries from 61 batches. E1-touching unmapped paramNames in Triage queue: **80 → 39 (–51 %)**.

**Remaining stragglers filed in BACKLOG**: CT MICRO multi-space `TOPR` pattern (likely non-standard whitespace char — `\s+` collapse doesn't catch it); L2 LEDs dict expansion (Sunlord + CT MICRO + Everlight LED products, ~8K products); C7 digital isolators dict expansion (CHIPANALOG + parts of Yint, ~500 products).

**Final session totals.** 7 commits, ~26,677 + ~4,087 = **~30,764 products' parametric data corrected** (relay misclassification + opto vendor-variant mapping). 519 batches' stale `unmappedParams` cleared (22 + 103 + 334 + 61). Triage queue: surfaces a ~5% smaller and meaningfully more accurate work list. F1/F2/E1 dicts grew by ~190 entries. New atlas-ingest commands prevent the staleness pattern from recurring on future re-ingests or dict additions.

## Decision #236 — Recommendation sort: least-fails-first (real mismatches as primary key) (June 15, 2026)

**Symptom.** User observed the single-part Replacements list was non-monotonic in fail count: a few cards with many fails at the top, then clean (no-fail) cards below, then fails increasing again. The "right behavior" per the product owner: least fails first.

**Cause.** `sortRecommendationsForDisplay()` in [lib/services/recommendationSort.ts](../lib/services/recommendationSort.ts) bucketed **Accuris Certified → MFR Certified → Logic Driven** as the *primary* key (Decisions #127/#133/#143), with match %/composite score only as within-bucket tiebreaks. So the certified bucket (whose cards in this case all carried "3 failed") floated to the top regardless of fails, the Logic bucket began at highest match % (fewest fails), then fails rose as match % fell. The non-monotonic pattern was the bucket boundary.

**Decision (user-chosen, via two-question prompt).** *Fails win globally*, using *real mismatches*:
- Primary sort key is now `countRealMismatches(rec)` ascending — fail rules where the replacement has a value that disagrees; missing-data fails (`replacementValue === 'N/A'`) don't count (same metric the `hideHighFails` filter already uses, [lib/types.ts:231](../lib/types.ts#L231)).
- The former bucket order (Accuris → MFR → Logic), mfr-equivalence rank, qualification-domain rank, and match %/composite score are all **demoted to tiebreaks** among candidates with the same real-mismatch count.
- A clean logic match therefore outranks a high-fail Accuris/MFR certified cross. Certified status no longer floats high-fail crosses to the top; it only breaks ties.

**Scope / side effects.**
- The sort is shared server-side ([partDataService.ts:1606](../lib/services/partDataService.ts#L1606), before cache write) and client-side ([RecommendationsPanel.tsx:42](../components/RecommendationsPanel.tsx#L42), re-sorted on render). So the change takes effect on display immediately with **no `RECS_CACHE_SCHEMA_VERSION` bump** (sort-order only; shape unchanged; the panel always re-sorts whatever it receives).
- `row.replacement` (the top BOM-row pick, persisted from `recs[0]` at validation time) now also reflects fewest-fails-first. Already-validated lists keep their prior top pick until re-validated; new/re-validated rows get the new ordering.
- The **certified-cross bypass is untouched** — high-fail certified crosses still *appear* (the `hideHighFails` filter still exempts them, Decision #133); they just no longer sit at the top.
- Supersedes the *primary-key* ordering from Decision #143; the bucket order it defined survives as the first tiebreak.

**Files.** `lib/services/recommendationSort.ts` (import `countRealMismatches`; `failDiff` as the first comparator; docstring rewritten), `lib/services/partDataService.ts` (stale comment updated). 2075 tests pass.

## Decision #237 — Tolerance-band eligibility restricted to a continuous-numeric allowlist (June 15, 2026)

**Symptom.** The Source Specs panel offered a ±% tolerance slider on `Package / Case` (value `0805`), where a tolerance band is meaningless. The feature is intended for numeric attributes only.

**Cause.** The eligibility gate `isToleranceEligible()` in [components/AttributesPanel.tsx](../components/AttributesPanel.tsx) only checked `logicType === 'identity'` + `numericValue` present. But `package_case` is `logicType: 'identity'` — identical to `resistance`/`capacitance` ([chipResistors.ts:25](../lib/logicTables/chipResistors.ts#L25)) — so logicType can't distinguish numeric from categorical identity. And the number parser turns `"0805 (2012 Metric)"` into `numericValue: 2012, unit: "Metric"` ([digikeyMapper.ts:362](../lib/services/digikeyMapper.ts#L362)), so neither `numericValue` nor `unit` could gate it out either. Nothing in the rule or attribute data reliably separates a *continuous* numeric (resistance, capacitance, frequency) from a categorical (`package_case`, `mounting_style`, `polarity`) or a discrete count (`resolution_bits`, `gate_count`) — all of which were getting a slider.

**Decision (MVP scope).** Gate on an explicit allowlist `TOLERANCE_ELIGIBLE_ATTRIBUTE_IDS` of continuous physical quantities; require `rule.attributeId` to be on it (in addition to `identity` + `numericValue`). Built by surveying every `identity` rule across the logic tables and keeping the clearly-continuous ones:
- **Passives:** `resistance`, `resistance_r25`, `capacitance`, `load_capacitance_pf`, `inductance`, `impedance_100mhz`, `varistor_voltage`
- **Frequency control:** `fsw`, `nominal_frequency_hz`, `output_frequency_hz`
- **Discrete semis:** `vz`, `vrwm`, `vbr`, `izt`, `trip_current`, `hold_current`
- **ICs:** `output_voltage`, `input_logic_threshold`

An allowlist (vs denylist) is deliberately conservative: a numeric attribute we forgot to add simply won't get a slider (acceptable, one-line fix to extend), whereas a categorical we forgot to deny would show nonsense. `Package / Case`, `mounting_style`, `polarity`, `resolution_bits`, etc. now correctly show no control; `Resistance` keeps it.

**Files.** `components/AttributesPanel.tsx` (allowlist constant + `isToleranceEligible` extended; docstrings updated). 2075 tests pass.

## Decision #238 — Per-attribute acceptance criteria (range + discrete set) on the Source Specs panel (June 15, 2026)

**Context.** A customer asked to click an attribute in the Source Part Specs panel and set an acceptable **tolerance** for matching — "not all values have to match the original." Shipped first as a ±% tolerance band on numeric identity rules (Decisions #236/#237 are part of that line), then generalized.

**Unified model.** `AcceptanceCriterion = { kind:'range'; percent } | { kind:'set'; values }` and `AcceptanceCriteria = Record<attributeId, AcceptanceCriterion>` ([lib/types.ts](../lib/types.ts)) — one shape covering both continuous (±% band) and categorical/discrete (accepted-values checklist) acceptance. This is deliberately the shape a future candidate-fetch (parametric query) layer will read. Threaded through `getRecommendations` → POST `/api/xref/[mpn]` → `getRecommendationsWithOverrides` → `useAppState` (`acceptanceCriteria` state + `acceptanceCriteriaRef`, session-only, cleared on reset/new-part). Added to the full-result cache variant (key `accept`); `RECS_CACHE_SCHEMA_VERSION` v12→v13→**v14**. NOT in `buildBaseRecsVariant` (rescore-only, doesn't affect candidate fetch).

**Engine.** Two mechanisms, applied by `applyAcceptanceCriteriaToLogicTable` ([lib/services/acceptanceModifier.ts](../lib/services/acceptanceModifier.ts), mirrors `contextModifier`): `range` → raise-only `tolerancePercent` on identity rules (reuses the existing band in `evaluateIdentity`); `set` → `MatchingRule.acceptedValues`, consumed by a rule-type-agnostic **short-circuit at the top of `evaluateRule`** ([matchingEngine.ts](../lib/services/matchingEngine.ts)) that returns `pass` when a candidate's `normalize()`d value is in the accepted set. The modifier restricts `set` to identity-family rules (identity / identity_flag / identity_upgrade) so an accepted value can never bypass a numeric SAFETY gate (threshold/fit/vref_check) — the modifier is the safety boundary, not the UI.

**UI.** Eligible Specs rows get a hover-revealed tune icon left of the D/P/A source badge; click opens an inline editor — a ±% **RangeEditor** (slider+input) for continuous attrs, or a **SetEditor** checklist for discrete ones. Eligibility is two hardcoded allowlists in `AttributesPanel` (`RANGE_ELIGIBLE_ATTRIBUTE_IDS`, `SET_ELIGIBLE_ATTRIBUTE_IDS`); set demonstrator = `aec_q200/q101/q100`. Checklist options come from the current candidates' `matchDetails` (deduped + source-excluded via the engine's exported `normalize()`); `SetEditor` is controlled (no desync). Changing any criterion silently auto-re-scores the visible Replacements panel via the deferred parts.io re-fetch path (no chat message).

**Scope / known gap (step 2).** Step 1 (above) covered **scoring relaxation only**. **Acceptance does NOT override the qualification-domain SAFETY gate** (cross-domain block); it IS reconciled with `filterAutomotiveAecMismatches` (which keys off the rule result the short-circuit flips). Full status, the resolved/deferred review findings, and step-2 detail live in [docs/acceptance-criteria-followups.md](acceptance-criteria-followups.md).

**Step 2 — fetch-widening (SHIPPED, commit `9539ed3`).** Keyword-driving attributes now widen the candidate FETCH driven by the `AcceptanceCriteria` shape. New [lib/services/fetchWidening.ts](../lib/services/fetchWidening.ts) is the single source of truth for both the fetch path and the base cache key. **Digikey = E-series keyword fan-out** (chosen over full parametric ValueId filtering, deferred): `buildCandidateSearchQuery` gained value-token substitution; `fetchDigikeyCandidates` fans out one keyword search per in-band E-series value (`range`) / accepted value (`package_case` `set`), union+dedup, capped at `MAX_WIDEN_QUERIES`. **Atlas** = new `fetch_atlas_candidates_widened` RPC ([scripts/supabase-atlas-candidates-widened-rpc.sql](../scripts/supabase-atlas-candidates-widened-rpc.sql)) that applies the numeric band BEFORE the `.limit(50)` (fixes value-band starvation), falling back to the default fetch on RPC error only. **Cache:** candidate set is now acceptance-dependent → `buildBaseRecsVariant` keys on `fetchWideningKey()` (the **fetch-affecting subset only**, so rescore-only criteria — AEC sets, context — still hit the base cache + Decision #163 fast path); `BASE_RECS_SCHEMA_VERSION` v2→v3. `FETCH_WIDENING_ELIGIBLE` is intentionally narrower than the UI allowlists (resistance/cap + package_case); other range-eligible attrs (inductance/impedance) stay rescore-only — UX-gap reconciliation + full parametric ValueId filtering are the documented follow-ups. The headline figure ("±% on resistance pull in 9k–11k parts") is the eligible-universe size, NOT a fetch target — output is a ranked shortlist of in-band parts, not an enumeration. 21 new unit tests; suite 2100 pass.

**Step 3 — Digikey parametric value-grid widening (SHIPPED June 16, 2026, branch `feat/digikey-parametric-widening`).** Closes the Step-2 gap where voltage/frequency-type specs widened on **Atlas only**: they now also widen the **Digikey** fetch via the full parametric ValueId filter (`FilterOptionsRequest.ParameterFilterRequest`) — the originally-deferred escalation, which subsumes the value-grid idea. Two-call discover→apply in `fetchDigikeyCandidates`, gated by new `isParametricWideningCriterion` (`RANGE_FETCH_ATTRS` minus `ESERIES_ENUMERABLE_ATTRS`, single-attr/first-eligible like `computeAtlasWidening`): (1) `getCategoryParametricFacets('', categoryId)` — **empty keyword** so the facet reflects the whole category, not the source MPN's 1-part result; (2) `findFacetForAttribute` matches the facet to the attr via the **existing forward param map** (no reverse map, no drift) — facets name the parameter via `ParameterName` (per-product field is `ParameterText`) and carry their own `Category`; (3) in-band facet values selected by **`ProductCount` DESC** (cap `MAX_PARAMETRIC_VALUES`=25) so standard E-series neighbors survive a dense facet (a 5.1 V Zener band holds dozens of oddball precision values); (4) `parametricFilterSearch` applies the ValueId filter; (5) in-band **re-verify** drops mis-keyed/unfiltered results. Latency bounded to ~2 round-trips (fan-out+discover in one `Promise.all`, then apply). `BASE_RECS_SCHEMA_VERSION` v4→v5, `RECS_CACHE_SCHEMA_VERSION` v15→v16 (candidate set for such bands changed; key shape unchanged — these attrs were already in `RANGE_FETCH_ATTRS`). **Live-verified** against the Digikey v4 API (1N4733A 5.1 V Zener ±10% → 541 Vz facet values, 25 most-stocked in-band selected, apply returns in-band 4.7/5.1/5.6 V parts). New `digikeyClient` fns + `findFacetForAttribute`/exported `extractNumericValue` in `digikeyMapper`. Still deferred: multi-attr parametric widening; attrs with no Digikey param-map entry (e.g. `izt`) stay Atlas-only; parts.io value-search. 2128 tests pass.

**Files.** `lib/types.ts`, `lib/services/acceptanceModifier.ts` (new), `lib/services/matchingEngine.ts`, `lib/services/partDataService.ts`, `lib/services/partDataCache.ts`, `app/api/xref/[mpn]/route.ts`, `lib/api.ts`, `hooks/useAppState.ts`, `components/{AttributesPanel,DesktopLayout,AppShell}.tsx`, tests. Step 2 added `lib/services/fetchWidening.ts` + `scripts/supabase-atlas-candidates-widened-rpc.sql`. Step 3 added `digikeyClient`/`digikeyMapper`/`apiUsageLogger` changes + `__tests__/services/digikeyParametricWidening.test.ts`. Branches `feat/source-attribute-tolerance` (Steps 1–2) + `feat/digikey-parametric-widening` (Step 3).

## Decision #232 — Suggestions panel shows ALL candidates; Active-first within bucket; supersedes #226 (June 10, 2026; merged after #238)

**Trigger.** For 2SC1815 the panel filter popover advertised "Accuris Certified (10)" but clicking it showed **zero** cards — even after the user unchecked "Hide >2 failed parameters". Root cause: the 10 Accuris (parts.io) crosses carry non-`'Active'` lifecycle statuses (raw codes like "Transferred"/"Unknown" from [partDataService.ts](../lib/services/partDataService.ts) `fetchPartsioEquivalents`), so they were hidden by the panel's **"Active only"** default filter — not the quality filter the user relaxed. Compounding it, the source-panel Cross References summary counted over the default-displayed set (Decision #229/#226) and so omitted Accuris, while the panel filter counted the full pool — the two surfaces disagreed (29 vs 79).

**Decision (user call).** Stop hiding anything in the single-part suggestions panel. Show **all lifecycle statuses** (Active, Obsolete, Transferred, …) **and all match qualities** (no >2-fail hiding). Surface Active by **ranking, not hiding**: sort **Active-first within each existing certification bucket** (Accuris → MFR → Logic). Scope: **suggestions panel only** — the BOM parts-list keeps preferring Active for its auto-picked replacement.

**This supersedes Decision #226** (chat/Overview count-sync). #226 existed only to reconcile counts with a panel that hid a subset; with the panel hiding nothing, "displayed count" == full count, so the contradiction dissolves by construction and the shared predicate is removed.

**Changes.**
- [components/RecommendationsPanel.tsx](../components/RecommendationsPanel.tsx): removed `activeOnly` + `hideHighFails` state, the STATUS/QUALITY popover sections, their dismissible chips, and all derived hidden-counts. `filtered` is now just the explicit user filters (manufacturer / CN-only / zero-stock / category / AEC-qualified — the last from Decision #238); every card renders. Header shows the plain count.
- [lib/services/recommendationSort.ts](../lib/services/recommendationSort.ts): new `statusRank` (`status === 'Active' ? 0 : 1`) applied as a sort key — after the least-fails-first primary (Decision #236) + bucket, before mfr-equivalence — so Active floats to the top of each bucket.
- Unwound #226: removed `DEFAULT_MAX_MISMATCHES`, `isDefaultDisplayed`, `getDefaultDisplayedRecs` from [lib/types.ts](../lib/types.ts); `buildRecsSummary`, `summarizeRecommendations`, `dispatchFilterIntent`, `llmOrchestrator.summarizeRecommendations`, and [AttributesTabContent.tsx](../components/AttributesTabContent.tsx) `summarizeCrossRefs` revert to full counts. `countRealMismatches` / `isCertifiedCross` / `filterRecsByMismatchCount` kept (batch/parts-list still use them).
- parts.io status normalized via `mapPartsioStatus()` (exported from `partsioClient.ts`) at both parts.io→Part sites in `partDataService.ts` — orderable codes → `'Active'`, only true end-of-life sink — so Active-first works + the green chip shows (follow-up commit).

**Merge note (into main after #238).** Reconciled with #236 (least-fails-first sort — `statusRank` is now a tiebreak *after* the `countRealMismatches` primary, not the top key), #238 (the `aec_qualified_only` filter is kept as the one explicit popover toggle), and #229 (`getDefaultDisplayedRecs` removed from `AttributesTabContent`/`llmOrchestrator`/`recommendationSummary` too). Cache bumps land as `RECS_CACHE_SCHEMA_VERSION` v16→v17 and `BASE_RECS_SCHEMA_VERSION` v5→v6 (status-value + sort-order change). Branch `feat/suggestions-panel-show-all`.

**Follow-up (June 17, 2026; merged via PR #7).** Two clarifications after the merge with #236:

1. **Intended ordering — least-fails-first dominates Active-first (user-confirmed, do NOT "fix").** Because `countRealMismatches` is the *primary* sort key (#236) and `statusRank` is only a tiebreak *within* an equal fail count, a **0-fail Obsolete part outranks a 1-fail Active part**. Live-verified via the real comparator (smoke test): `OBSOLETE-0fail > ACTIVE-1fail`. Rationale: the suggestions panel is a technical-equivalence view (best fit first); the obsolete part is still shown and orderable, just ranked by match quality. Neither #232 nor #236 specified this exact interaction, so it's recorded here as deliberate.

2. **Lifecycle-status filter added.** #232 removed the *default-hiding* "Active only" status section. This follow-up adds an explicit, opt-in **lifecycle-status checklist** to the Replacements filter popover (per-status checkboxes Active/Obsolete/Discontinued/NRND/Last Time Buy). **All statuses checked by default** — the panel still shows everything (#232 preserved) and the per-status counts + external chip/chat counts stay reconciled (defaulting to Active-only would reintroduce the #226→#232 count mismatch + an empty-panel surprise for parts whose only crosses are obsolete). Mechanism: `hiddenStatuses: Set<PartStatus>` (empty = all shown), unchecking adds to the set, `.filter(r => !hiddenStatuses.has(r.part.status))` on the candidate chain; `activeHiddenStatuses` (present-filtered) drives the filter badge + a "Hiding: …" dismissible chip; section renders only when >1 status is present. Counts over the full `sorted` set, mirroring `aecCount`/`cnCount`. Display/sort only — **no cache bump**. Commits `e9a9f7c` (filter) + `bf2c77f` (docs).

## Decision #239 — Greenfield part-selection grounding: never recite parts from memory; search-now-if-concrete, grounded-caveats-only (June 18, 2026)

**Trigger.** The main chat agent (`chat()` in `lib/services/llmOrchestrator.ts`, Haiku 4.5) answered a greenfield selection request — "I need a low-noise NPN for an audio preamp, 9V, 1–2mA, hFE 200–400" — with **no tool call**, reciting specific MPNs, noise figures (nV/√Hz), and MFR attributions straight from training data. One was wrong: it recommended the **2N5087, a PNP**, when the user asked for NPN. To a non-engineer this ungrounded prose is visually indistinguishable from tool-grounded answers, which directly undermines the product's trust model.

**Gap.** Existing claim-discipline rules are scoped to specific request *shapes*: Decision #166 covers manufacturer-profile questions, #172 covers replacement requests for an already-named part, #173 governs post-recs summaries. A greenfield "I need a part for X" request is none of these, so it fell through unguarded — an instance of the per-shape patching anti-pattern flagged in BACKLOG ("Lift claim-discipline rule into a global system-prompt block").

**Decision (user calls across the session).**
1. **Floor (non-negotiable):** in a greenfield/no-MPN request, never state a specific checkable fact from memory — no part numbers, no numeric spec values, no MFR attributions, no availability/pricing/qualification. Specifics enter the prose ONLY after `search_parts` returns them.
2. **Act, don't ask:** when constraints are concrete (a part type + ≥1 parameter), call `search_parts` immediately on a descriptive query. No "want me to search?" permission round-trip — the user stated a need; fill it. Reserve a short guiding reply for genuinely vague/exploratory asks.
3. **Grounded caveats only:** no textbook preamble, no echoing the user's stated constraints back as "insight"; at most one or two specific gotchas tied to the real results.

(An interim ask-first + qualitative-guidance wording was tried and rejected on user review — asking is friction when constraints are already complete, and the generic guidance was mostly padding that restated the user's own priorities.)

**Mechanism.** Prompt-only. New "Part-selection-advice discipline" block in the `chat()` `SYSTEM_PROMPT`, immediately after the "Replacement-coverage discipline" block. No code/logic change (`search_parts` was already a tool the model could call), no cache bump, no migration. Scope `chat()` only — `refinementChat()` (per resolved part) and `listChat()` (list-scoped) don't see the greenfield shape.

**Status.** Shipped to prompt; **behavioral verification pending** — Haiku-4.5 adherence on three test prompts (concrete → immediate search with no named parts in prose; vague → short guiding reply; named-MPN regression unchanged). Open dependency: descriptive (non-MPN) keyword-search quality determines whether "search now" returns sensible cards; if weak, that's a separate search-relevance issue, NOT a reason to revert the grounding floor.

**Files.** `lib/services/llmOrchestrator.ts` (SYSTEM_PROMPT only).

**Follow-up.** This block is now a 4th per-shape discipline; the BACKLOG "global system-prompt block" consolidation should fold it (with #166/#172/#173) into one referenced rule rather than leaving four standalone blocks — more pressing as a result. Note `chat()` runs on Haiku, where abstracted/consolidated discipline may be more fragile than on Sonnet/Opus (cf. BACKLOG #1236).

## Decision #240 — Commercial-tab spot pricing goes stock-aware: insufficient-stock flag + in-stock-first ordering + crown-on-fulfillable (June 18, 2026)

**Trigger.** On the single-part Commercial tab (the spot-pricing feature: a quantity control + a green "Best @ qty N" crown on the cheapest distributor), the crown and the card order ignored stock entirely. A distributor with the lowest unit price but **0 in stock** still wore the crown and sat at the top — a "best price" the user can't actually buy. The user asked for two things: (1) flag distributors whose stock can't cover the needed quantity, and (2) push them down so the top of the list is distributors that can fulfill the order, cheapest first.

**Decision.** Make the Commercial tab stock-aware against the spot quantity (`qty`). Scoped to the tab's display logic only — the chat "Best Spot Price" flow (Decision #170) and `computeBestPrice` in `bestPriceCalculator.ts` are **unchanged**.

**Changes** (all in [components/AttributesTabContent.tsx](../components/AttributesTabContent.tsx)):
1. **Insufficient-stock highlight.** `SupplierCard` gained a `requiredQty` prop (default `1`). The In Stock cell tints light-red (`rgba(255,82,82,0.12)` pill + `#FF5252` value) when `quantityAvailable != null && quantityAvailable < requiredQty` — generalizes the prior `=== 0` check (at qty 1 it still flags exactly 0-stock, so the default-prop `SupplierBreakdownPopover` caller is unaffected). **Unknown stock (`null`) is never flagged** — we can't assert "less than" what we can't see.
2. **In-stock-first ordering.** `CommercialContent` replaces the old winner-float-only sort with: crowned winner pinned first, then distributors that can fulfill the qty (`quantityAvailable >= qty`, cheapest unit price first), then those that can't (also cheapest first). The `isWinner`-first branch is **load-bearing** — it keeps the currency-filtered crown above any numerically-cheaper non-dominant-currency card the raw-number price sort would otherwise float up.
3. **Crown on a fulfillable distributor.** The `bestPrice` memo now runs `computeBestPrice` over the **in-stock subset** (`quantityAvailable >= qty`), falling back to the full quote set only when nobody has enough stock (so a crown still appears). `winnerOriginalIndex` prefers the in-stock quote when the winning supplier name appears more than once, so the crown can't latch onto a same-named out-of-stock duplicate.

**Known limitations (accepted, recorded).** Within-group price ordering is raw-number — no FX conversion — so cross-currency price ties are best-effort, the same limitation the crown already had. And because the tab crowns best-**in-stock** while the chat Best Spot Price flow reports overall-cheapest, the two can diverge when the cheapest distributor is out of stock; aligning the chat flow to be stock-aware was deliberately left out of scope.

**No cache bump, no migration** — display/interaction only. Branch `feat/commercial-best-spot-price`.

## Decision #241 — chat() SYSTEM_PROMPT structural refactor (Phase 1) + behavioral-regression-checklist methodology (June 21, 2026)

The `chat()` `SYSTEM_PROMPT` in [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) had accreted into a convoluted ~200-line literal: grounding/claim-discipline scattered across 5 blocks, the manufacturer-profile rule-set buried inside Workflow step 5(e), several rules repeated verbatim (specs-in-text ×2, search-first ×4, button-labels ×2, never-run-cross-refs ×2), and an internal contradiction (the "NEVER describe specs in text" ban vs ASK-mode "answer from the returned data"). This is the #166 follow-up that #239 turned into a *4th* per-shape grounding block — the per-shape patching anti-pattern flagged in BACKLOG.

**Phase 1 (this decision) — PURE structural reorg, no behavior change intended.** The literal is now 15 named sections: identity → role → scope → **grounding floor** (the 4 CRITICAL blocks — source-part / pre-recs replacement-coverage / greenfield part-selection / post-recs recommendation-block — grouped and moved near the top) → About This System → **Manufacturer Profiles** (lifted out of Workflow step 5(e) into its own section) → Workflow (steps 1-6, modes a-e) → Search presentation → **Conversation style** (answer-first / use-context / when-to-ask / answer-and-stop grouped) → Engineering Assessment → capability awareness → **Part-specific questions — ALWAYS search first** (consolidated) → Formatting → User Context → History. Four verbatim repeats de-duped to one canonical each (+ a pointer where useful). The specs-in-text↔ASK contradiction reconciled: the spec-dump ban is scoped to *presenting/identifying* a part, with an explicit exception for ASK-mode (answering a parametric question the user explicitly asked, from tool data). "four modes" → "five modes" (FILTER-RECS was the 5th). Blast radius = `chat()` only — `SYSTEM_PROMPT` has one consumer; `refinementChat()` / `listChat()` use independent prompts (`MFR_CLAIM_DISCIPLINE_MINI`, `LIST_AGENT_SYSTEM_PROMPT`).

**The reusable methodology — a behavioral regression checklist as the safety net.** There is NO automated test for prompt behavior (LLM output is non-deterministic; the codebase's only validation path is the live app). So prompt refactors are gated by a manual checklist: [docs/chat-prompt-regression-checklist.md](chat-prompt-regression-checklist.md) — 19 scenarios, one per prompt rule, each traced to the real failure that created it, with PASS/FAIL signatures and sensitivity tiers (CRITICAL grounding / HIGH tool-routing / MED conversation-shape). Run on **Haiku** (`claude-haiku-4-5`, the production chat model — abstraction holds less reliably there than on Opus, so a desktop run would be falsely optimistic). **Acceptance gate:** every CRITICAL+HIGH row that was PASS at baseline must stay PASS after each phase; any CRITICAL regression → revert that phase. Re-run the whole list and diff vs the recorded baseline.

**Results.** Baseline (pre-edit, Haiku): 17 PASS / 1 FAIL (A3 greenfield) / 1 N/A (D1, no exclusion UI). Post-Phase-1 gate **PASSED** — every CRITICAL+HIGH baseline-PASS row held; the two riskiest rows (B1 search-first, which lost dedup repetition; B2 no-specs-in-text + the reconciliation) clean; A3 still FAIL (exempt — pre-existing). **Headline finding:** the grounding floor holds in STRUCTURED contexts (where the prompt hands the model a block to read — source-part block, recs block, profile-tool result) but LEAKS in free-prose "my read" elaboration (A3, plus soft spots on A4/A5/C5 closings). So the eventual consolidation must explicitly govern free-prose elaboration, not just per-block contexts.

**Phased plan.** Phase 1 reorg — done, merged to main as `8f20bc2`. Phase 2 — move enforcement to deterministic code where already covered (thin the prompt to one-line reminders, never delete unless code-coverage is verified + unit-tested). Phase 3 — consolidate the grounding blocks into one referenced free-prose floor (the real fix for A3 + the soft-spot leaks; high-risk on Haiku, so keep belt-and-suspenders reminders, validate hard against the full checklist, revert per-step on any CRITICAL regression). A user-prioritized **guided/exploratory part-selection** capability ("I need a transistor → ask narrowing questions → recommend") is slotted *ahead* of Phases 2-3 — it deliberately inverts the act-don't-ask tuning that Phase 1 consolidated into one clean edit surface (§"Part-selection-advice discipline" + §"Conversation style"); it's a behavior change with its own design pass + checklist + baseline.

**Code-review note.** A follow-up xhigh multi-agent review found the reorg itself clean on every angle (no dropped/weakened/garbled rule, cross-references resolve, dedups complete, template valid). The only fallout was documentation-citation staleness — the reorg shifted prompt line numbers, leaving the checklist's per-scenario `Origin:` citations and a BACKLOG note pointing at the wrong rules. Fixed by switching both to durable section-name references (e.g. `SYSTEM_PROMPT §"Source-part factual discipline"`) so they don't rot on Phases 2-3.

## Decision #242 — Guided part selection + deterministic greenfield search presentation (June 22, 2026)

Two related pieces of chat-grounding work that build on #241's reorg, both validated on the Haiku behavioral checklist ([docs/chat-prompt-regression-checklist.md](chat-prompt-regression-checklist.md), new section E + two results logs) and merged together. Branch `feat/guided-part-selection`.

**Part A — Guided / exploratory part selection (prompt-only).** When a request is too vague to search ("I need a transistor", "help me pick a capacitor, not sure where to start"), the agent now runs ONE consolidated narrowing turn — naming the 1–2 discriminators it needs with an "or I'll search now" escape hatch — then searches. A NARROW carve-out: its only job is *get from a vague need to a searchable query*; once cards render and the user clicks one, the existing post-confirm context-question machinery takes over. Prompt-only, **no new tool/component** — verified that `searchParts()` already takes descriptive multi-word queries and `present_choices` with `action:'other'` already round-trips a clicked label back as a new user turn ([hooks/useAppState.ts](../hooks/useAppState.ts)), so the ask→click→continue→search loop needs zero new code. Implemented as 3 edits to the `chat()` SYSTEM_PROMPT: (1) rewrote §"Part-selection-advice discipline" — floor (now spans the whole arc incl. the free-prose closing) + act-don't-ask (don't ask for a 2nd param when one already searches) + a guided-selection bullet (single turn, taxonomy device→function→discriminator→application, hard STOP @ type+≥1 param, `present_choices` for closed sets, REQUIREMENTS-only grounding, no 2nd consecutive guiding turn) + grounded-caveats + a **routing-examples** bullet (Haiku follows concrete in-prompt examples better than the abstract STOP rule — added after E3 initially over-narrowed); (2) §"Search result presentation" `present_choices` rule authorizes pre-search scope/category narrowing with a hard line ("an option names a requirement CATEGORY, never a specific part"); (3) §"Conversation style" when-to-ask clause scoped to opinion questions (selection requests defer to §5c). Decision boundary = **SEARCH-NOW > GUIDE > ANSWER-FIRST**, first-match-wins, A>B and C>B tie-breaks (so the guide branch only owns the residue and can't poach the tuned act-don't-ask / answer-first behaviors). **Single-shot** chosen over multi-turn deliberately: every extra free-prose turn is exposure to Haiku's grounding-leak failure mode. Gate PASSED — CRITICAL E2 (concrete request still searches) + E4 (the guiding turn itself leaks no ungrounded specs) both clean; E4 is the result that proves prompt-only is viable. Known accepted limitation: the STOP condition is non-deterministic on Haiku (E6 sometimes asks one more discriminator — e.g. capacitance, which is defensible) — not a fabrication, logged as accepted variance.

**Part B — Deterministic greenfield search presentation (the #173 pattern, kills the A3 leak).** The guided-selection gate surfaced that on **broad** greenfield searches Haiku's accompanying prose recites a from-memory curated parts list with specs + AEC quals that don't even match the rendered cards (the pre-existing A3-family fabrication leak — checklist E3/E2). It is NON-UNIFORM: it fires on the "curate-a-recommendation" impulse over broad/heterogeneous result sets, but stays clean on plain presentation of a tight set (E6). Three prompt rounds (#239 → #241 reorg → the strengthened §5c floor) failed to hold it on Haiku — the documented signal (Decision #173 / `llm-prose-vs-deterministic-template`) that when the model has strong priors AND the facts already live on UI cards, a **deterministic template beats prose** (it can't fabricate by construction). So we applied #173's move to exactly the leaking surface rather than the riskier full Phase-3 consolidation. New [lib/services/searchSummary.ts](../lib/services/searchSummary.ts): `buildSearchSummary(searchResult)` posts a deterministic one-liner ("I found **N** parts matching your criteria — click…") built only from `SearchResult` fields (count + MPN + MFR; no specs/B2, no status/quals, no provenance, no post-click promise/C6). `handleSearchWithLLM` substitutes it for the LLM prose on **greenfield** card searches (`!looksLikeMpn(query)`) in BOTH the chat bubble AND the `conversationRef` push — the latter fixes a history-poisoning bug where the leaked prose was pushed unconditionally, so a fabrication couldn't be inherited by later turns. MPN-lookup searches keep the LLM confirmation message (rules C6/B2, passing). `looksLikeMpn` relocated from server-only `partDataService.ts` to the new client-safe module (re-exported for back-compat) so the client hook can import it without pulling API clients + crypto into the bundle. Gate: E3 leak GONE, E2 closing-leak retired, C6/B2 MPN-path untouched (override correctly scoped) — both directions confirmed; `npm test` 2185/2185, build green, 14 new unit tests. This **retires the A3 leak** — the lone exempt baseline FAIL from #241 — without the risky Phase-3 consolidation, which is now lower-urgency.

**Also:** removed an inert §"When User Context is provided" rule ("never recommend parts from excluded manufacturers") — `UserPreferences.excludedManufacturers` is never populated (no UI/extractor writer) AND the engine already pre-filters excluded MFRs before the LLM sees candidates ([partDataService.ts:1603](../lib/services/partDataService.ts#L1603)), so the rule could never fire (zero behavior change). The remaining deferred chat-prompt work — the residual free-prose leaks on inherently-prose surfaces (A4 post-recs Q&A / A5 profile asides / C5-E5 opinion closings), the dormant excluded-MFR feature decision, and Phases 2-3 — is consolidated in [docs/BACKLOG.md](BACKLOG.md) "Chat-prompt remaining work". Lesson reinforced: structural-where-data-is-on-cards beats prompt rules on Haiku; the inherently-free-prose surfaces (opinion answers) are largely accept-the-ceiling, not whack-a-mole.

## Decision #243 — Logic-vetted descriptive search: rank greenfield results through the matching engine (June 22, 2026)

**Trigger.** A user did the demo's Beat-2 flow — *"I need a MOSFET … N-channel, 12V / 5A"* — and the result cards included 30V and even **1700V / 1200V** parts. Descriptive (greenfield) search was pure keyword text: the LLM folded the numbers into a `search_parts` query string, Digikey's free-text keyword API matched on description tokens and **ignored the numbers as filters**, and nothing downstream re-checked results against the stated values (`searchParts` merged/deduped/active-sorted only). The deterministic greenfield bubble (Decision #242) even said "matching your criteria" — overclaiming a filter that never ran. It made the agent look like it wasn't listening. This is the relevance gap logged in BACKLOG "Greenfield search doesn't hard-filter polarity / key categorical constraints" — now addressed.

**Decision (locked with the user).** Vet descriptive-search results with the app's **own matching engine** instead of an ad-hoc ≥/band heuristic — treat the user's stated specs as a **synthetic source part** and score every candidate against it exactly like a cross-reference. **Rank, keep all** (off-target parts sink to the bottom, never an empty list). Interpret values via the **logic rules**: a part that *fails* a rule (undersized voltage, wrong channel) "would never work" → sinks hard; a part that *passes* but is wildly over-spec (1700V for 12V) is technically valid → stays but sinks via a closeness tiebreak. Hiding over-spec outright was deliberately left out (it'd need an upper-bound rule the logic tables don't have).

**Why a synthetic source works — the load-bearing invariant.** In `matchingEngine`, a rule whose **source** value is missing returns `pass` (`evaluateIdentity` L154, `evaluateThreshold` L467). So a synthetic source carrying only the 2-3 constrained attributes doesn't dilute scoring: unconstrained rules pass, constrained rules gate normally. Undersized threshold / wrong identity → real `fail` → sinks via `countRealMismatches`; over-spec passes the `gte` rule. Verified, not assumed.

**Why an explicit closeness penalty (not match %).** Both a 30V and a 1700V part pass every rule for a 12V ask → identical match % (`gte` gives full weight regardless of headroom). So match % can't sink over-spec. New `computeOverSpecPenalty` (sum of `log(candidate/required)` over the user's numeric `gte` constraints) does — applied **only** in the search-vetting sort, NOT in the shared `sortRecommendationsForDisplay` (a higher-rated *cross* is genuinely better, so cross-refs must not penalize over-spec). Voltage over-spec dominates the penalty, which is why the 1700V SiC parts sink hardest.

**Zero extra API calls.** Candidate attributes are rebuilt from data already in the search payloads: `mapKeywordResponseToAttributesByMpn` (the Digikey keyword response carries full `Parameters[]` + category, previously discarded by `mapDigikeyProductToSummary`) and `searchAtlasProducts` now returns `{ result, attrsByMpn }` (built from the Atlas rows' `parameters` JSONB it already fetched). Only added work: one `applyRuleOverrides` (cached) + an in-memory `findReplacements` over ≤cap candidates.

**Flow.** `search_parts` tool gained optional `partType` + `constraints[]` (human terms — `{attribute:"drain-source voltage", value:12, unit:"V"}`, `{attribute:"channel type", value:"N-Channel"}`), emitted by the LLM ONLY on descriptive searches (the "Act, don't ask" prompt bullet; pass only specs the user stated, never invent). `searchParts` builds the synthetic source ([searchConstraints.ts](../lib/services/searchConstraints.ts) `buildSyntheticSource` — classify family by plurality of candidate subcategories → fallback `resolveFamilyFromText(partType)` in [logicTables/index.ts](../lib/logicTables/index.ts); map human term → attributeId via the logic table's own `attributeName` + a small B5-thorough synonym map; normalize to base SI), scores, and reranks (fewest real mismatches → Active-first → over-spec closeness → match %). The reranked `mergedMatches` becomes the single ordering authority, so `present_part_options` / guided selection see the vetted order for free.

**Surfaces.** `PartSummary` gained optional `matchScore` / `failCount` / `hardFail` (additive). [PartOptionsSelector](../components/PartOptionsSelector.tsx) shows a qualitative **"Fits your specs" / "Below spec"** chip — NOT a raw % (match % is ~100 for every valid part vs a sparse synthetic spec; the *ranking* carries the signal, not the number). `buildSearchSummary` says "ranked by how well they fit your specs — best match first" when vetted. Search cache key includes a constraints+partType signature so a vetted search doesn't collide with a constraint-less one.

**No regression.** Vetting fires only when `constraints` are present AND a family is classifiable; otherwise byte-identical to prior keyword behavior. MPN lookups, `/api/search`, and BOM validation pass no constraints → unchanged.

**Verified.** Live E2E (Digikey+Atlas): for *"N-channel MOSFET 12V 5A"* the unvetted list had 1700V at #3/#4 and 1200V at #10; vetted, those are gone from the top 15 (all 12V/30V N-channel, "Fits your specs"), 1700V/600V kept but sunk. 2200/2200 tests pass (15 new in [searchConstraints.test.ts](../__tests__/services/searchConstraints.test.ts)), typecheck + lint clean.

**Known v1 nuances (accepted, in BACKLOG).** (a) Dual-channel "2N-CH" parts whose Vds/Id numericValue Digikey doesn't parse get a 0 over-spec penalty and can float above closer single-channel parts — all still valid (`fails=0`); the egregious voltage over-spec still sinks because voltage dominates. (b) Closeness penalizes *current* over-spec equally to voltage, though current headroom is benign — fine for now since voltage drives the sink. (c) Synonym map is B5-thorough; other families rely on attributeName fuzzy-match (an unmapped constraint is a safe drop — vetting relaxes, never mis-vets). (d) Over-spec parts are sunk, not hidden — hard-hiding remains an optional one-line flip via `filterRecsByMismatchCount`.

**Post-review hardening (xhigh `/code-review`, same day).** Four fixes from the multi-agent review: (1) `SEARCH_CACHE_SCHEMA_VERSION` bumped **v2→v3** — ranking semantics + the cached `SearchResult` shape (new `matchScore`/`failCount`/`hardFail`) + the key's new vetting-signature segment all changed. (2) Candidate-attrs building (`mapKeywordResponseToAttributesByMpn` for Digikey, `rowToPartAttributes` in `searchAtlasProducts` via a new `buildAttrs` param) is now **gated behind `constraints` present** — plain MPN/keyword lookups (the hot path) no longer pay to build attrs they discard. (3) The synthetic family is classified over the **scored (MFR-filtered) population** (`scorable`), not the unfiltered `candidateAttrsByMpn` superset, so an MFR hint that selects a minority family can't be vetted against the majority's table. (4) `resolveFamilyFromText` matches **whole words** (boundary regex with optional trailing plural `s`), not raw substring — short acronym keys (MOV/SCR/ADC/LDO…) no longer match inside unrelated words ("removable"→Varistors, "screw"→SCRs). The linchpin invariant (no evaluator returns `fail` on source-missing) was directly re-verified across all eight evaluators. 2202 tests pass (+2 boundary tests).

## Decision #244 — Replacement display sort: Active is the top-level key; match % replaces raw fail-count as the primary score (June 22, 2026)

**Trigger.** On an NPN BJT (MJE13007G) the single-part Replacements panel showed **obsolete** Accuris crosses at the very top (all "8 need review", 74%) above **Active** logic matches — one of them (BD500B-6200) even a **PNP** part against an NPN source. The user: "Something with no values appears above something with lots of values and 1 fail. This is odd. No matter what, Actives should always show above… and within Actives, Accuris/MFR certified above anything logic produces."

**Root cause.** The primary sort key was `countRealMismatches` (Decision #236, "fewest real mismatches first"). A `fail` only counts when the replacement's value is *known* and disagrees; a missing attribute scores `review`, not `fail`. So a sparse parts.io candidate with almost no parametric data has *zero* "real" mismatches — a fake-perfect primary score that floated obsolete, even wrong-polarity, crosses to the top (BD500B's polarity came through as missing → `review`, dodging the count). Status (`Active`) was only the 3rd key (Decision #232 placed it after fails + bucket), so it couldn't rescue the ordering.

**Decision (locked with the user).** New ordering in [sortRecommendationsForDisplay](../lib/services/recommendationSort.ts) — **supersedes the Decision #236 primary key and the Decision #232 within-bucket status placement**:

1. **Active first — always** (hard top tier; every Active part outranks every non-Active part regardless of bucket/score — you're recommending a *replacement*, a dead part rarely belongs on top). Binary `Active=0 else 1`, unchanged from the old `statusRank`.
2. **Certification bucket** within the lifecycle tier: Accuris → MFR → Logic.
3. pin-to-pin > functional, then qualification-domain (`context-matched > unknown > deviation`, Decision #155).
4. **Match % desc** (compositeScore breaks ties within ±`MATCH_PERCENT_TIE_BAND`), applied to **every** bucket (was logic-only; certified buckets previously broke ties on composite alone).

**Why match % is the right "data-aware" key.** The engine already penalizes sparse data: `review` (missing) earns **50%** weight, `pass` 100%, `fail` 0 ([matchingEngine.ts:949-963](../lib/services/matchingEngine.ts#L949-L963)). So an under-characterized candidate is dragged toward 50%, while a fully-spec'd part with one real fail (full weight lost on that one rule) stays higher — exactly the "penalize sparse data / don't reward no-data" behavior the user asked for. We didn't need a new metric; we just stopped sorting on `countRealMismatches` (which ignores `review` entirely) and let match % carry it. Raw fail-count survives only as a **display filter** (`filterRecsByMismatchCount`, unchanged), never as a sort key. Note this also makes fails *weighted by rule importance* rather than blindly counted (a failed w10 critical rule sinks a part more than a failed w2 minor one — strictly better than the old equal-weight count).

**Accepted interaction (flagged, user-confirmed "go with this for now").** Because bucket (step 2) sits above match % (step 4), the sparse-data penalty operates **only within a bucket, not across** — a sparse-but-Active Accuris cross (74%) still ranks above a fully-spec'd Active logic part (95%). This is faithful to rule "certified above logic within Active" (a human-verified cross is a verified equivalent; sparseness is *our* coverage gap, not the part's fault). If we later want a well-characterized logic match to beat a thin certified one, the move is a **coverage floor** (a certified cross missing >X% of its weight forfeits the bucket jump) — deferred, not built.

**Scope / mechanics.** Display/sort only — **no cache-version bump**: the panel re-sorts client-side ([RecommendationsPanel.tsx:59](../components/RecommendationsPanel.tsx#L59)), so the new policy takes effect immediately on cached recs. The shared function is also called server-side before cache write and to persist `row.replacement` during BOM validation, so the modal top card, the parts-list auto-pick, and the panel all stay aligned. The greenfield search-vetting sort ([partDataService.ts:606](../lib/services/partDataService.ts#L606), Decision #243) is a **separate** ordering and is intentionally untouched (it keeps fewest-real-mismatches → Active → over-spec closeness → match %, correct for a synthetic-source spec match). `countRealMismatches` import dropped from `recommendationSort.ts` (now unused there). 2203 tests pass (the one Decision-#232 test that encoded bucket-before-status was updated to assert Active-before-bucket + a new same-tier bucket-ordering test); lint clean.

## Decision #245 — Context-answer confirmation bubble spells out question + answer, not raw codes (June 23, 2026)

**Trigger.** In the single-part agent flow, after the user answers the per-family application-context questions and clicks **Continue**, the chat posted a confirmation bubble echoing the raw internal answer **codes**: *"Application context: saturated_switching, low_lt_10khz, yes"*. Cryptic — a bare "yes"/"low" tells the user nothing about *what* they just selected.

**Root cause.** [useAppState.ts](../hooks/useAppState.ts) `handleContextResponse` built the message from `Object.values(filteredAnswers)` — `filteredAnswers` is a `Record<questionId, answerValue>`, so the values are the option `value` codes, never the human-readable `label`.

**Decision (format confirmed with the user).** Render **one line per answered question, pairing the question text with the option label** — not a flat list of labels. Pairing is load-bearing because some option labels are themselves bare (B5 MOSFET's automotive `No` has `label: 'No'`) and some labels contain commas; only the question text guarantees every selection is self-described. Heading reworded to **"Your context answers:"** (user's wording). Example (BJT flow):

> Your context answers:
> - What is the operating mode of this BJT? → Saturated switching (digital logic driver, relay driver, solenoid driver, LED driver)
> - What is the switching frequency? → Low frequency (<10kHz) — relay drivers, solenoid drivers, LED drivers
> - Is this an automotive application? → Yes — automotive (AEC-Q101 required)

**Mechanics.** New pure, client-safe helper `describeContextAnswers(familyId, answers)` in [lib/contextQuestions/index.ts](../lib/contextQuestions/index.ts) maps each `{questionId → code}` to a `{question, answer}` pair, iterating `config.questions` for **priority order** (and to skip conditionally-hidden questions). Fallbacks keep nothing from being dropped: a free-text / unknown option code falls back to the typed value; an unknown `familyId` falls back to `questionId → value`. The family id was already computed in the handler as `familyIdForBlock`, and `getContextQuestionsForFamily` was already imported, so the call site reuses both. The bubble is markdown (ReactMarkdown + remark-gfm via [MessageBubble.tsx](../components/MessageBubble.tsx)), so the body is a `-` list with a blank line after the heading.

**Scope.** User-facing chat bubble; no cache/schema change, no behavior change to scoring or context modifiers. The TS `label`/`questionText` (English) is used directly — consistent with the other hardcoded English strings in this hook (the form UI localizes via `t()`, but `useAppState` has no `t()`; localizing this message is a separate, larger change, not requested). 2217 tests pass (+7 in [describeContextAnswers.test.ts](../__tests__/services/describeContextAnswers.test.ts), covering the BJT happy path, the bare-label B5 case, priority ordering, free-text/unknown-family fallbacks); lint + build clean.

**Follow-up applied same day — refinement-chat prompt fed readable context too.** The **server-side LLM prompt** for the per-part *refinement* modal ([buildRefinementSystemPrompt](../lib/services/llmOrchestrator.ts), the `applicationContext` block) was `JSON.stringify`ing the raw answer codes (`{"automotive":"yes"}`) into the model's context — the only LLM site that ingests `applicationContext` (the main `chat()` orchestrator does not). Swapped to the same `describeContextAnswers` helper, so the model now reads `- Is this an automotive application? → Yes — automotive (AEC-Q101 required)` instead of decoding `automotive: "yes"`. Strictly more signal for the modal where users weigh candidates against their stated application; the empty-context case now omits the block instead of emitting `{}`. Input-only change (no new behavioral instruction), so the [chat-prompt regression checklist](chat-prompt-regression-checklist.md) does **not** apply — it's scoped to the `chat()` SYSTEM_PROMPT, which this edit leaves byte-identical, and there is no separate behavioral checklist for the refinement modal. Verified by reproducing the exact before/after prompt block via the helper + typecheck/lint/build clean; 2225 tests pass.

## Decision #246 — Comparison Specs tab: source & replacement panels render from one shared aligned row set (June 23, 2026)

**Trigger.** In the single-part "comparing" view the SOURCE part (left panel) and the COMPARING WITH replacement (right panel) each rendered their own Specs table, and the rows didn't line up vertically — left row 8 ("Operating Temperature Range") sat opposite right row 8 ("AEC-Q101 Qualification"). Users couldn't read attributes across the two panels apples-to-apples.

**Root cause.** The two panels built their row sets independently with different inclusion logic. [AttributesPanel](../components/AttributesPanel.tsx) (left) rendered every recognized source attribute by the source's own `sortOrder`. [ComparisonView](../components/ComparisonView.tsx) (right) built its own rows and (a) **dropped** source attributes with no matching rule (`.filter(row => !(row.matchStatus==='different' && !row.ruleResult))` — removed Operating Temp / Mounting Style / MSL) and (b) **appended** replacement-only rows the left never showed (SOA Curves, Packaging Format). Two independently-filtered, separately-ordered tables stacked side by side → vertical drift.

**Decision (user-confirmed: keep two panels, align rows).** Both panels render from ONE shared, unioned, ordered row set joined on the stable `parameterId` key, with a muted "—" where an attribute is absent on a side. New pure helper [buildComparisonRows()](../lib/services/comparisonRows.ts) (+ `AlignedSpecRow` type) unions recognized source params (by `sortOrder`) with replacement-only matchDetails (appended last, keeping the existing `ruleResult && !== 'pass'` filter), **no longer dropping source-only rows** (they keep `replacementValue: null`). [DesktopLayout](../components/DesktopLayout.tsx) computes it once (only when comparing) and passes the **same array reference** to both panels — the only way to guarantee identical ordering. (A single-merged 4-column table — the [QcFeedbackDetailView](../components/admin/QcFeedbackDetailView.tsx) shape — was the considered alternative; rejected to preserve the two-panel UX with independent Overview/Specs/Commercial tabs.)

**Mechanics.**
- `AttributesPanel` gains an optional `comparisonRows?` prop; its Specs `<TableBody>` renders a unified `specRows` view-model. A `paramById` lookup recovers the real `ParametricAttribute` for each row — **present ⇒ a source attribute** (keeps acceptance-tune controls + D/P/A badge); **absent ⇒ a replacement-only row** rendered inert (muted value, no controls) to hold the aligned slot. Prop absent ⇒ standalone rendering unchanged; the unrecognized-Atlas "extras" toggle stays a source-only appendix **below** the aligned region (hidden by default, so alignment holds).
- `ComparisonView` takes the shared `rows`; source-only rows get a grey dot for free (existing `getDotInfo('different', no ruleResult)`). `rows` is **optional** — when not supplied (mobile / parts-list modal, which have no side-by-side panel to align with) it builds the same rows internally via `buildComparisonRows`. `ProposeAliasButton` receives `?? ''` so its missing-value guard hides on half-blank rows.
- `ComparisonFeedbackDialog` widened to nullable values (renders `?? '—'`); its old exported `ComparisonRow` type was unused elsewhere and replaced by `AlignedSpecRow` (the admin `QcFeedbackDetailView` has its own separate local `ComparisonRow`, untouched).

**Note — datasheet-only rules show the engine's value on both sides.** Rules like SOA Curves carry the engine's `sourceValue`/`replacementValue` (both `'N/A'` when neither part has the parametric), so they now appear aligned on BOTH panels showing `N/A` — honest apples-to-apples, not a fabricated blank. The muted "—" appears only where a side genuinely has no entry for an attribute (`null`).

**Scope / accepted caveat.** Display/sort only — **no cache-version bump** (rows recompute client-side from existing data; no schema/scoring/context-modifier change). Known/accepted: opening a left-panel acceptance-tune editor injects a transient `Collapse` row that shifts rows below it until collapsed — user-triggered, not mirrored on the right (would require lifting `expandedAcceptance` to DesktopLayout; tracked in BACKLOG). 2219 tests pass (+9 in [comparisonRows.test.ts](../__tests__/services/comparisonRows.test.ts): union both directions, ordering, blanks both ways, no-drop regression, null-replacement loading, extras filter, Atlas-extras exclusion); typecheck clean on all touched files; zero new lint errors (the 4 eslint findings in the touched files pre-date this change, verified via stdin-lint of the HEAD versions).

## Decision #248 — Deterministic greenfield search, Phase A: the server owns one spec-driven search per turn (June 23, 2026)

**Trigger (production bug, proven from dev logs).** The SAME descriptive (non-MPN) chat query — e.g. *"I need a small-signal NPN for a low-noise audio preamp, 9V, 1–2mA, hFE 200–400"* — returned a **different part family every run** (BC847 ↔ 2N5089 ↔ MMBT5089 ↔ BC550C), sometimes raw LLM prose instead of cards.

**Root cause.** For one greenfield turn the model fires **4–6 `search_parts` calls**, each a part number *recalled from training memory* (`mmbt5089`, `2n3904`, `bc550c`…). They run in `Promise.all` and `data.searchResult` is **last-completes-wins** ([llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) tool loop → handler). It's the agent's *strategy* varying, not sampling jitter. Two earlier fixes were rejected: temperature 0 (Decision #247, **reverted** `8e310b3` — greedy decoding can't pin which memory MPN is recalled) and message-keyed memoization (caching freezes the chaos instead of fixing it; caching must stay speed-only).

**Decision (user-confirmed: main-line now, determinism first, relevance deferred to Phase B).** Make the greenfield search a **deterministic function of the structured request** so the result is stable *by construction*: the server runs **exactly one** search per greenfield turn and drives it off `{partType, constraints}` (parsed reliably), not off whichever MPN the model recalled. The search cache stays a pure **speed** optimization, never the determinism mechanism. This builds on the Decision #243 synthetic-source vetting (which reranks whatever the keyword search returns) — #248 makes *which* search runs deterministic; **Phase B** (deferred) will make the candidate *pool* itself spec-relevant via Digikey parametric filtering.

**Mechanics (all gated on `isGreenfield = !looksLikeMpn(userText)`; MPN lookups byte-identical to before).**
- **One search per turn** — `chat()` captures the raw last user message *before* context blocks mutate it, computes `isGreenfield`, and **pre-partitions `toolUseBlocks` before `Promise.all`** via new pure `partitionToolUses(blocks, isGreenfield, alreadySearched)`: keep the FIRST `search_parts` (by array order — deterministic, not the racy resolution order), suppress the rest with a canned steering `tool_result` (`{deduped:true, note:"…do not issue more searches this turn"}`) so the Anthropic one-result-per-tool-use contract still holds. A turn-scoped `greenfieldSearchRan` flag is threaded across tool-loop iterations (the `alreadySearched` arg) so a model that pivots and searches again in a *later* iteration is also suppressed — the dedup is per-turn, not per-iteration. `present_choices` and every non-search tool always run — **guiding is never suppressed**.
- **Reliable structured intent** — a `GreenfieldCtx {client, isGreenfield, userText}` threads into `executeTool`. On **every** greenfield search the handler fires **one `tool_choice`-forced, temperature-0 `extract_part_specs` call** over ONLY the raw user text (not the history, so it can't inherit from-memory guesses), and **unions its constraints into vetting** to backfill any spec the agentic call dropped (see the Residual #1 note below for why this is union-into-vetting rather than authoritative-replace). This is the file's first `tool_choice` use; **`SYSTEM_PROMPT` is untouched** → the [regression checklist](chat-prompt-regression-checklist.md) stays valid.
- **Canonical query** — `buildGreenfieldQuery(partType, constraints)` ([searchConstraints.ts](../lib/services/searchConstraints.ts)) builds a STABLE keyword string from `partType` + categorical (non-numeric) constraints (lower-cased, de-duped, sorted; tokens already in `partType` skipped; numeric specs excluded — keyword search ignores numbers, they're vetting-only). The handler searches on this, **ignoring the model's recalled-MPN `query`**. No part type even after extraction (truly vague) → fall through to the model's query (today's behavior; the model has usually already chosen to guide).
- **Deterministic presentation, no prose fall-through** — [useAppState.ts](../hooks/useAppState.ts) broadens the greenfield gate to also cover `searchResult.type === 'none'`, so a greenfield no-match renders the deterministic `buildSearchSummary` "couldn't find / relax a requirement" line instead of free LLM prose (still `!hasChoices`, so a guiding turn keeps its prose).

**No cache bump.** `SearchResult` shape unchanged; the cache key already varies on the query string + `vettingKey`, so a canonical query simply produces a new (cold-miss) key — never a stale hit. (Phase B *will* bump `SEARCH_CACHE_SCHEMA_VERSION` when the fetch strategy changes.)

**Validation.** 2239 tests pass (+37: `partitionToolUses` keep-one/contract/guiding-untouched/MPN-runs-all, `buildGreenfieldQuery` stability/numeric-exclusion/dedup, `isThinConstraints`); lint clean on touched files; build clean. **In-process spotcheck** ([scripts/sonnet-spotcheck.ts](../scripts/sonnet-spotcheck.ts)) on the NPN bug repro: one `search_parts`, `family=B6` (BJT — correct), canonical query `npn bjt transistor`, `choices:0`; **run 3× across fresh processes → identical L2 cache key** (`v3__npn bjt transistor__…|channel type=npn,collector current=2ma,collector-emitter voltage=9v,dc current gain (hfe)=200`) = same family + same result every run. A descriptive "MOSFET for a 24V motor driver" → `family=B5`, searched (not `present_choices`) — no guiding regression. Scope is gated entirely on `isGreenfield`, so `SYSTEM_PROMPT`, `present_choices` guiding, and MPN lookups are all untouched.

**Residual #1 + the tightening (shipped same session).** Initial live testing showed family + canonical query pinned, but the ranking still wiggled run-to-run because the agentic call's inline spec extraction occasionally DROPPED a stated spec (one run dropped `1–2mA` collector current → 3 constraints vs 4 → different order; the engine correctly floats 2mA-specced BC847 parts up only when 2mA survives). Fix: run the dedicated `extract_part_specs` call (now at **temperature 0**) on EVERY greenfield turn and **UNION its constraints into vetting**, so a dropped spec is always recovered → stable ranking. **Design lesson (found by instrumenting both):** the dedicated extraction is *lower quality* than the agentic call's inline output for the query — it returns a verbose partType (`"low-noise NPN transistor"`) and application descriptors (`application=audio preamp`) that zero out Digikey keyword search (an authoritative-replace attempt produced `type:none` + an 8-loop retry). So the extraction is used ONLY to backfill vetting constraints (where `buildSyntheticSource` resolves to attributeIds, dedups model-naming-first, and drops unmappable noise); partType + the keyword query stay sourced from the clean agentic call (extraction partType is a fallback only when the model gave none). Net: stable ranking, no query regression, one extra ~512-token call per greenfield search.

**Phase B — parametric pool relevance (SHIPPED, branch `feat/greenfield-relevance-phase-b`).** Phase A vetted the RANKING; Phase B makes the candidate POOL itself spec-relevant. When a greenfield turn carries a numeric spec the keyword API ignores (e.g. hFE 200–400), the Digikey pool is now parametric-filtered by that spec, so the cards FIT the spec, not just rank by it. Mechanics: `getDeepestCategoryId` exported to bootstrap a categoryId from the keyword result's own `Category` tree (no extra round-trip); `pickFetchBand` ([searchConstraints.ts](../lib/services/searchConstraints.ts)) derives the single most-selective base-SI band from the RAW constraints — a `"200-400"` range, separate min/max (incl. underscore forms `hFE_min`/`hFE_max`), or repeated same-attr values; gte→`[v, v×10]`, two-sided widened ±15% so boundary parts survive the fetch; selection prefers two-sided, then rule weight, then attrId. `applyParametricFilter` ([partDataService.ts](../lib/services/partDataService.ts)) is extracted from the #238 APPLY block and called **only** from the spec path — the shipped acceptance-widening block is left byte-identical (TODO to converge). `searchParts` unions the parametric pool into the keyword pool; vetting (Phase A) ranks. Null band → keyword-only, byte-identical to Phase A. `SEARCH_CACHE_SCHEMA_VERSION` v3→v4.

**Phase B debugging lessons (three layered bugs, all live-data-only).** (1) **Band lost the range** — the extractor labels bounds inconsistently (`hFE_min`/`hFE_max` with **underscores**); a `\b`-based min/max detector doesn't break across `_`, so they were dropped and the band collapsed to the single value ±15%. Fix: normalize `[_-]→space` before detecting AND stripping. (2) **Compound facet values** — the hFE facet's values are `"200 @ 2mA, 5V"` (gain @ test conditions); `extractNumericValue` grabbed the unit-bearing test current (`2mA`), not the gain → `0 of 1327` in-band. Fix: parse the leading token before `@`. (3) **Unitless values** — `extractNumericValue` returns `undefined` for a bare `"200"` (it's built for unit-bearing strings); hFE gains are unitless → still 0. Fix: `parseFloat` fallback. After all three: the hFE-200–400 repro fetches **25 in-band parts** (pool 20→40 scored), family B6 stable. The #238 path was unaffected throughout (its attrs — Vz etc. — are simple unit-bearing values, which is why it never hit these). 2246 tests pass; build clean.

**Identity-categorical injection (SHIPPED with Phase B — the fix UI testing surfaced).** Live-testing the NPN repro exposed a relevance gap Phase B *amplified*: the **#1 card was a PNP** (`MMBT5087`) for an explicit **NPN** request. Root cause: the polarity lives in the part-type NOUN ("small-signal **NPN**"), which only drives family classification + the keyword query — it never became a *gating constraint*. So the B6 `polarity` hard identity gate saw a MISSING source value and **passed every candidate** (the load-bearing source-missing-→-pass invariant). Phase A's keyword-only pool masked this (it searched `"…npn…"`, NPN-biased); Phase B's hFE-facet widening is **polarity-blind**, so it pulled PNP parts matching the hFE band into the pool and one ranked #1. The fix is **general, not per-family** (the user explicitly flagged the whack-a-mole risk of a polarity-specific patch): in `buildSyntheticSource`, for each `identity`/`identity_upgrade` rule not already constrained, **mine the candidate pool** for the distinct CATEGORICAL values it carries (number-leading values skipped so numeric identity attrs like capacitance/package-code can't be matched), then inject the single value whose token appears in `partType` (token-bounded match, exactly-one-or-skip so it never mis-vets). The off-type candidate then becomes a real `fail` → sinks via `countRealMismatches`. Data-driven off the same candidate `matchDetails` the #238 SetEditor reads — **any identity-gated categorical across the 43 families (polarity, channel_type, dielectric C0G/X7R, B8 SCR/TRIAC, topology, …) is covered for zero new code per family.** Because the vetted ORDER changes for the same cache key, `SEARCH_CACHE_SCHEMA_VERSION` v4→v5. Validated end-to-end (3 UI tests): "small-signal NPN …" → all top cards `TRANS NPN`, PNP sunk (`[search-vetting] family=B6 scored=40`); "N-channel MOSFET 100V 30A" → all `MOSFET N-CH`, 40V/30V parts tagged "Below spec" and sunk (`family=B5 scored=45`); `IRFZ44N` MPN lookup unchanged (no vetting). 2253 tests pass (+7 injection: NPN/PNP inject, no-noun-no-inject, no-pool-no-inject, end-to-end PNP-mismatch, B5 channel inject, explicit-constraint-wins); lint clean on touched files; build clean.

**Phase B deferred (v1 follow-ups, BACKLOG).** Atlas band-widen via `fetchAtlasCandidates` (Atlas parts still appear + get vetted, just not band-pre-filtered); multi-attribute parametric filter in one Digikey call; converging `applyParametricFilter` with the inline #238 copy; surfacing the matched spec on cards.

## Decision #249 — Admin Manufacturers panel: two more PostgREST 1000-row caps (June 25, 2026)

**Context.** User spotted the admin **Manufacturers panel header** (265 MFRs / 272,691 products) disagreeing with the **Atlas Coverage Report** KPI tiles (379 / 411,468 — the true total, since growth uses a `RETURNS jsonb` RPC). The report was right; the panel was silently truncated. `SELECT COUNT(*) FROM atlas_products` = 411,468 confirmed ground truth.

**Root cause — two independent 1000-row caps on one compute path** (`computeStats` in [app/api/admin/manufacturers/route.ts](../app/api/admin/manufacturers/route.ts)):
1. **`get_manufacturer_product_stats` was still `RETURNS TABLE`** — PostgREST capped it at 1000 of its **1457** `(manufacturer, family_id)` group rows (`ORDER BY manufacturer, family_id`, so the alphabetical tail dropped). The surviving 1000 groups summed to *exactly* the panel's 265 MFRs / 272,691 products; ~114 MFRs / ~138K products were invisible — not just in the header, the entire list and every per-MFR coverage/scorable/improvement-potential figure.
2. **The `atlas_manufacturers` identity select was a plain `.select().order('name_en')`** — that table crossed 1000 rows (now **1014**), so the last 14 canonical rows silently dropped too. The same plain-select cap also lurked in [app/api/admin/atlas/route.ts](../app/api/admin/atlas/route.ts) (its `~115 rows` comment had gone stale under growth), undercounting `targetManufacturers` to 1000 and missing disabled-state for MFRs past the cutoff.

Fourth instance of the Decision #206 footgun family (after #232 dict-override selects and #233 ordering) — different code, different table, never touched by the prior fixes.

**Fix.** (1) Migrated `get_manufacturer_product_stats` to **`RETURNS jsonb`** (`jsonb_agg(row_to_json(t))` over the same `groups`+`param_union` CTEs — [scripts/supabase-mfr-stats-rpc.sql](../scripts/supabase-mfr-stats-rpc.sql)); the route parses `data` as the array directly, shape-compatible with both forms so the code is safe to deploy before the SQL runs. (2) Paginated both `atlas_manufacturers` selects with `.range()` loops ordered by a stable unique tiebreak (`name_en, id` / `id`) and STOP-on-error (Decision #183 partial-result trap). (3) **Bumped the `manufacturers-list` cache key v4→v5** — `looksPoisoned` does NOT reject a nonzero-but-truncated payload, so the stale L2 `admin_stats_cache` row would otherwise keep serving the wrong numbers (both locally and on the next prod deploy).

**Latent holdout + sweep.** `grep "RETURNS TABLE\|RETURNS SETOF" scripts/*.sql` swept every RPC: `get_cross_ref_counts` is the lone remaining `RETURNS TABLE` aggregator (5 rows today — BACKLOG-flagged to migrate before it crosses 1000); all others are jsonb, bounded by a `lim` param (`search_atlas_products_admin`), or one-row (grounding / cleanup). Also corrected the misleading CLAUDE.md "Supabase 1000-row limit" note — "push aggregation to an RPC" is insufficient guidance; the RPC must `RETURNS jsonb` because `RETURNS TABLE` re-introduces the same cap.

**Verification.** Live DB after the SQL was applied: RPC returns 1457 entries / Σ product_count 411,468 = true `COUNT(*)`; simulated header math lands on 379 MFRs / 411,468 products with every product folding onto a known MFR (no orphans). tsc + eslint clean on touched files; 2259 tests pass. **Numbers caveat:** the two surfaces count manufacturers differently (Coverage Report = distinct *enabled* product-strings in `atlas_products`; panel = canonical `atlas_manufacturers` identity rows, alias-folded), and products differently (Coverage = enabled-only; panel = all incl. disabled) — so they coincide today but aren't structurally locked: disabling an MFR or adding aliases can diverge them.

## Decision #250 — Commercial-tab best-price crown becomes comparative: neutral grey on the source, green/red on a replacement vs. the source (June 25, 2026)

**Trigger (user request).** Both the SOURCE part and each REPLACEMENT candidate have a **Commercial** tab that crowns the cheapest distributor at the chosen spot quantity. That crown was always **green** (`SUCCESS_GREEN #69F0AE` + light-green tint) regardless of side, so green carried no comparative meaning. The user wanted the crown to *guide* the buyer: on the **source** part, highlight the best price in a **very light contrast grey** (nothing to compare against); on a **replacement**, **green if its best price is lower** than the source's, **light red if higher** — a direct "is this swap cheaper or pricier than what I have today?" signal.

**Root cause.** Both tabs render the SAME side-agnostic `CommercialContent` (it received only `part`), and `SupplierCard` hardcoded green in three spots (the "Best @ qty N" chip, the winning price-break row's bg, and that row's text colour), all gated on `isBestPrice`. There was no notion of a source baseline to compare against.

**Decision (user-confirmed).** Give `CommercialContent` an optional source-price baseline: present → comparative (green/red), absent → neutral grey. Green's meaning shifts from "cheapest distributor for this part" to "cheaper than the source you're comparing against"; the standalone single-part source tab therefore moves green→grey, which is the intended, more-correct semantics.

**Mechanics.**
- **Pure tone seam** — new `comparePriceTone(replUnitPrice, replCurrency, sourceUnitPrice, sourceCurrency): 'neutral' | 'better' | 'worse'` + `PriceTone` type in [bestPriceCalculator.ts](../lib/services/bestPriceCalculator.ts). Currency-gated on purpose: missing input, exact tie, OR different currencies → `neutral` (the app has **no FX rate**, so a cross-currency comparison would be dishonest — same limitation the crown already carries). Uses `== null` (not `!price`) so a genuine `$0` reads as `better`, not missing. Six unit tests in [bestPriceCalculator.test.ts](../__tests__/services/bestPriceCalculator.test.ts) (better/worse/tie/cross-currency/case-insensitive/missing).
- **Colour map + shared helper** — [AttributesTabContent.tsx](../components/AttributesTabContent.tsx) gains `HIGHLIGHT_TONES` (`neutral` grey `#B0BEC5`, `better` reuses `SUCCESS_GREEN`, `worse` reuses the existing insufficient-stock red `#FF5252`) and a `bestFulfillablePrice(quotes, qty)` helper (in-stock-first, else all — the existing fulfillment logic, now needed for two parts).
- **`SupplierCard`** — new `highlightTone?: PriceTone` prop (default `'neutral'`); the 3 hardcoded green usages become `tone.fg`/`tone.bg`; the crown chip is wrapped in a `<Tooltip>` whose text is tone-derived so colour isn't the only signal.
- **`CommercialContent`** — new optional `sourcePart?: Part` prop; a `sourceBaseline` memo computes the source's best fulfillable price (reads only `sourcePart?.supplierQuotes` so the React Compiler's `preserve-manual-memoization` rule accepts the narrow dep), and `highlightTone` is derived via `comparePriceTone` and passed to the winning card.
- **Single wiring point** — [ComparisonView.tsx](../components/ComparisonView.tsx) passes `sourcePart={sourceAttributes.part}` to the replacement's `CommercialContent` (one line). Because every comparison surface (desktop / mobile / part-detail modal) routes through `ComparisonView`, this one edit covers them all. The source tab ([AttributesPanel](../components/AttributesPanel.tsx)) and the parts-list modal call `CommercialContent` with **no** `sourcePart`, so they default to neutral grey with zero edits.

**Scope / accepted caveat.** Display-only — **no cache-version bump** (tone is derived client-side from data already on the parts). Cross-currency stays neutral grey rather than converting (no FX rate — documented, not worked around). The non-comparative chat "Best Spot Price" flow (Decision #170) and the Decision #240 stock-highlight/ordering are unaffected. Shipped together with the Decision #246 comparison-row alignment work but a distinct concern (that aligned the Specs rows; this colours the Commercial crown). 2271 tests pass; tsc + eslint clean on touched files (the pre-existing `react/no-unescaped-entities` lint in `ComparisonView.tsx` predates this change, verified against HEAD).

## Decision #251 — Replacements panel: distributor price/stock is opt-in, deferred behind a remembered toggle (no auto-FindChips on every part) (June 25, 2026)

**Trigger (user request).** The single-part Replacements panel auto-fetched FindChips (FC) pricing/stock the moment recs landed (`triggerFCEnrichment` in `showRecsAndDeferAssessment`, plus a second fire in the parts.io re-score tail). Two asks: (1) **don't** call FindChips by default — the user clicks to launch the price/stock fetch; (2) the existing display toggle was a bare, easy-to-miss `$` `IconButton` — make it a more visible (but compact) labeled control. Plus a follow-up: **remember** the choice rather than reset per part.

**Decision (user-confirmed).** FC commercial enrichment is now **opt-in and a remembered preference**. We never auto-call FindChips; the user enables price/stock once and it stays on for every subsequent part **and across page reloads** (localStorage), or stays off until they ask.

**Mechanics.**
- **Deferred fetch + gating** — [useAppState.ts](../hooks/useAppState.ts) gains `commercialEnabled: boolean` state (initial `false`) + `handleToggleCommercial()`. The two automatic `triggerFCEnrichment` calls are gated: `showRecsAndDeferAssessment` fires it on a fresh recs load **only when** `commercialEnabledRef.current` is true; the parts.io tail re-merge likewise. `commercialFetchedRef` is a per-rec-set guard so toggling off→on doesn't re-hit the API (resets on each new recs load so a sticky-on pref re-fetches for the new candidates). `handleToggleCommercial` reuses the active `abortRef` signal (so a reset/new-search cancels the fetch) or `freshAbort()` when none is live.
- **Remembered preference** — persisted in `localStorage` under `xrefs:show-commercial` (`readCommercialPref`/`writeCommercialPref`, best-effort, SSR-guarded). `initialState` stays `false` for deterministic SSR; a mount effect hydrates the real pref client-side. `handleReset` and `hydrateState` **preserve** `commercialEnabled` from the ref (it's a user preference, not conversation state); hydrate additionally re-fires FC for the restored recs when the pref is on so the (already-visible) toggle has data behind it.
- **More visible toggle** — [RecommendationsPanel.tsx](../components/RecommendationsPanel.tsx) replaces the `$` `IconButton` with a compact labeled `Button` ("Price & stock", `$` start-icon): **outlined** when off, **contained** when on, and a `CircularProgress` + "Loading…" while `isEnrichingFC`. It's controlled-with-fallback (`commercialEnabled`/`onToggleCommercial` props, mirroring the existing `mfrFilter`/`categoryFilter` pattern): the single-part view (desktop + mobile) drives it from `useAppState`; the parts-list modal / modal-chat omit the props and fall back to local display-only state defaulting to shown (their recs are already FC-enriched, so behavior is unchanged).
- **Wiring** — props threaded `AppShell → DesktopLayout/MobileAppLayout → RecommendationsPanel`. The unused `MoneyOffOutlined` import was dropped.

**Scope / accepted caveat.** Display + fetch-timing only — **no cache-version bump** (no scoring/data-shape change). Only the deferred *single-part* `triggerFCEnrichment` paths are gated; the BOM parts-list FC enrichment (its own `enrichWithFCBatch` flows, `hideZeroStock` deep-fetch) is untouched. A side effect of deferring: chat turns that ran after auto-enrichment used to see FC pricing in `summarizeRecommendations` context — with the pref off, the LLM simply won't have pricing for those recs (acceptable; fewer calls, and the user can enable it). 2271 tests pass; tsc clean on touched files; eslint shows only pre-existing warnings (no new ones).

## Decision #252 — Revert #251: always load distributor price/stock for replacements; "Price & stock" toggle becomes display-only (June 27, 2026)

**Trigger (user request).** Decision #251's opt-in gating had an unintended consequence: clicking the **Commercial tab inside a replacement-suggestion card** showed nothing and never tried to load. Root cause — the Commercial tab (`CommercialContent`) renders directly from `part.supplierQuotes`, which is only populated by `triggerFCEnrichment()`; with the auto-fetch gated off, the data was never fetched, and the tab itself has no fetch trigger. The user noted the original premise was wrong: **FindChips is our internal API with no rate limits**, so there is no reason to withhold the fetch. Two options weighed — (a) auto-fetch for all by default, vs (b) lazy-fetch on Commercial-tab click (rejected: introduces a per-click wait). The user chose (a).

**Decision (user-confirmed).** Always load FindChips for every replacement the moment recs land — **decoupled from the toggle**. The "Price & stock" button stays but is now **display-only**: it shows/hides the price chips on the suggestion cards (default ON, still a remembered preference). This permanently fixes the empty Commercial tab with no per-click latency.

**Mechanics.**
- **Unconditional fetch** — [useAppState.ts](../hooks/useAppState.ts): the three `triggerFCEnrichment` callers — `showRecsAndDeferAssessment` (fresh recs), the `triggerPartsioEnrichment` re-score tail, and `hydrateState` — drop their `if (commercialEnabledRef.current)` guards and fire unconditionally. `commercialFetchedRef` (the per-rec-set re-fetch guard from #251) is **removed entirely** — there's nothing left to gate.
- **Toggle = display only** — `handleToggleCommercial()` no longer launches a fetch; it just flips `commercialEnabled`, persists it, and re-renders. `commercialEnabledRef` now only mirrors the display state for the handler.
- **Default ON** — `readCommercialPref()` returns `true` unless localStorage holds an explicit `'0'` (`xrefs:show-commercial`); `initialState.commercialEnabled` is `true` (SSR-safe — the Replacements panel only renders once recs exist, so the button isn't in the server markup); the mount effect applies an explicit prior "hide". `handleReset`/`hydrateState` still preserve the remembered pref.
- **Copy** — [RecommendationsPanel.tsx](../components/RecommendationsPanel.tsx) tooltip reworded to "Show/Hide distributor price & stock **on the cards**" (no longer implies it fetches). The "Loading…" state (driven by `isEnrichingFC`) stays and now reflects the automatic load on each new part.

**Scope / accepted caveat.** Display + fetch-timing only — **no cache-version bump**. Reintroduces the pre-#251 behavior of FC firing on every single-part recs load (the cost the user explicitly accepts, given the internal/no-limit API). BOM parts-list FC flows unchanged. A user who manually hides price/stock still gets the data loaded (Commercial tab works regardless) — the toggle no longer affects whether the Commercial tab has data. The #251 "fewer FindChips calls" benefit is intentionally given up.

## Decision #253 — Replacements panel stays mounted across compare→back so its filters (and scroll) persist (June 27, 2026)

**Trigger (user report).** Filtering the Replacements panel to Chinese-only, opening a card's detail, then clicking **back** showed ALL replacements again — the filter was lost. Decision #229 had lifted the manufacturer + category filters into `DesktopLayout` (because the source-panel chips drive them), so those survived; but `showCnOnly`, `aecOnly`, and `hiddenStatuses` are **local** `useState` in `RecommendationsPanel`. Root cause: [DesktopLayout.tsx](../components/DesktopLayout.tsx) rendered `ComparisonView` **instead of** `RecommendationsPanel` in a ternary (`phase==='comparing' ? <ComparisonView/> : <RecommendationsPanel/>`), so opening a card **unmounted** the panel and "back" **remounted** it fresh — wiping every local filter and the scroll position.

**Decision (user-confirmed, after weighing alternatives).** Root-cause fix over per-filter lifting. Options considered: (1) keep the panel mounted (chosen); (2) consolidate all filters into one lifted state object; (3) lift each remaining filter individually like #229. The user explicitly pushed on scalability — (3) repeats boilerplate for every future filter, so it was rejected. (1) is the most scalable (and actually *less* code): every current and future panel filter, plus scroll position, survives for free with no per-filter wiring.

**Mechanics.**
- **Keep-mounted render** — both [DesktopLayout.tsx](../components/DesktopLayout.tsx) and [MobileAppLayout.tsx](../components/MobileAppLayout.tsx): the right-panel cell no longer picks ComparisonView **xor** RecommendationsPanel. Instead `ComparisonView` renders **on top** when `isComparing` (`phase==='comparing' && selectedRecommendation/comparisonAttributes && sourceAttributes`), while `RecommendationsPanel` stays mounted in a wrapper `<Box sx={{ display: isComparing ? 'none' : 'contents' }}>`. `display:none` while comparing keeps the React subtree (and all its `useState`) alive but hidden; `display:contents` when visible makes the wrapper layout-transparent so the panel renders exactly as the prior direct child (no visual change).
- **New-part reset preserved** — a fresh part still clears filters: a new search empties recs / flips `isLoadingRecs`, which unmounts the panel (skeleton path), so local filters reset on the next part. The #229 lifted `xrefCategory`/`xrefMfr` still reset via the `sourceAttributes?.part.mpn` effect. Only the *same-part* compare→back round-trip now preserves state.

**Scope / accepted caveat.** Render-structure only — **no cache bump**, no logic/data change; 2281 tests pass. Mobile was fixed too (same bug, and worse there — its panel never received the #229 lifted MFR/category props, so it lost every filter). Bonus: scroll position now survives compare→back. Edge case (not introduced by this change, just noted): the filter popover is a body-portaled MUI `Popover`; if it were somehow open at the moment a card is clicked, `display:none` on the anchor wouldn't hide the portal — but clicking a card requires the popover closed, so it's unreachable in practice.

## Decision #254 — Raise FindChips rate caps (it's an internal API); fixes ~1-minute price/stock fill on high-candidate parts (June 27, 2026)

**Trigger (user report, follow-up to #252).** After #252 made price/stock load for every replacement, a ~70-candidate part (e.g. BC847B) took ~a minute for the cards' pricing to fill in. Root cause: [findchipsClient.ts](../lib/services/findchipsClient.ts) fetches FindChips **once per MPN** (`getSiteResults` → `acquireRateSlot`), throttled at `PER_MINUTE_CAP = 60` with `BATCH_CONCURRENCY = 5`. For 70 MPNs the 61st call hits the cap and `acquireRateSlot` **waits until the minute resets** (~60s), so the tail of the cards only populate after that wait. The 60/min, 5000/day caps were a conservative guess ("adjust based on FC API docs") — but FindChips is **our internal aggregator API with no published quota**, so the throttle was self-imposed and unnecessary.

**Decision (user-confirmed).** Raise the caps to high SAFETY CEILINGS (a backstop against a runaway loop, not a throttle) and make all three env-tunable so production can adjust without a code change:
- `PER_MINUTE_CAP`: 60 → **1200** (`FINDCHIPS_PER_MINUTE_CAP`)
- `DAILY_CAP`: 5000 → **200000** (`FINDCHIPS_DAILY_CAP`)
- `BATCH_CONCURRENCY`: 5 → **20** (`FINDCHIPS_BATCH_CONCURRENCY`)

A 70-candidate part now fans out in ~4 concurrency rounds, all within the per-minute cap — pricing fills in seconds instead of ~a minute. New `envInt(name, fallback)` helper reads a positive-int env override or falls back to the default.

**Scope / accepted caveat.** Throughput only — no behavior/data/cache change; existing tests unaffected (the limiter has no unit test; it's a module-scope counter). The caps remain real ceilings: if the "internal/unlimited" assumption is ever wrong, the env knobs let ops dial them back down without a deploy. Does NOT touch the separate double-fetch (FC fires on initial recs then again after the parts.io rescore — review finding, deferred) or the unmemoized `RecommendationCard` off-screen re-render (deferred); with the caps raised, both are far less impactful. The Decision #193 "FindChips rate-limit silent degradation" failure mode (throttled → `/api/fc/enrich` returns 200 with missing data, no retry) is now rarely reached on normal loads, though the retry-on-empty hardening remains a separate BACKLOG item.

## Decision #255 — Part-number requests in a sentence are NOT greenfield: `mentionsMpn` gate fixes invented "Below spec" tags (June 27, 2026)

**Trigger (user report).** Asking *"I need replacements for BC847CLT3G from On Semi"* in chat returned a 16-card **search list** (the part plus look-alike transistors) with every card — including the exact requested part — tagged **"Below spec"**, under the bubble *"I found 16 parts and ranked them by how well they fit your specs."* The user gave only an MPN and no specs; the "Below spec" labels were meaningless, and the user (rightly) escalated it as the assistant **inventing data and ignoring its own rules**.

**Root cause.** The chat orchestrator classifies each turn as greenfield (descriptive) vs. MPN-lookup via `isGreenfield = userText.length>0 && !looksLikeMpn(userText)` ([llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)). `looksLikeMpn` asks whether the **whole message** is an MPN — always false for a multi-word sentence — so a request that *names* a specific MPN inside prose was misclassified greenfield. That routed it through the Decision #248 greenfield pipeline: forced `extract_part_specs` (temp-0) → `buildGreenfieldQuery` query rewrite → Decision #243 logic-vetting. The forced extraction **fabricated specs from the named part** (the model's own memory of BC847CLT3G: NPN/45V/0.1A/SOT-23), built a synthetic source from them, and the vetting tagged the part's keyword neighbours "Below spec." The invention never reached the user as prose (so the prose-grounding floor never saw it) — it corrupted a UI label via a tool input. The original instinctive fix (a guard in `searchParts` keyed on `looksLikeMpn(query)`) was **downstream of the misclassification** and never fired, because the handler had already rewritten the query to a descriptive one.

**Decision / mechanics (deterministic guard, not a prompt tweak — the established pattern).**
- New `mentionsMpn(text)` in [searchSummary.ts](../lib/services/searchSummary.ts): token-scans for an MPN *inside* a phrase (≥5 chars, has both a letter and a digit) while EXCLUDING the value/range/size/package/qualification tokens that legitimately appear in descriptive searches — `12V`, `1–2mA`, `0805`, `X7R`, `SOT-23`, `AEC-Q200`. The asymmetry is deliberate: a false positive only loses fit-ranking on a descriptive search, whereas a false negative reintroduces the wrong "Below spec" labels — so the detector leans toward catching MPNs.
- AND'd into the classifier: `isGreenfield = … && !looksLikeMpn(userText) && !mentionsMpn(userText)`.
- The non-greenfield branch of the `search_parts` handler now **drops any `partType`/`constraints` the model attached**, so spec-vetting can never run on a part-number turn regardless of the query string the model chose.
- Defense-in-depth retained: `searchParts` ignores `constraints` when `looksLikeMpn(query)`.
- With the turn correctly classified as an MPN lookup, the existing client `find_replacements` intent (Decision #172) fires after the part auto-confirms — so the request resolves to the exact part and loads its cross-reference replacements end-to-end (verified live).

**Scope / accepted caveat.** Classification + display only — **no cache bump**, no logic/data change. 3 new `mentionsMpn` unit tests (genuine greenfield queries incl. a `1–2mA` range and a `SOT-23` package stay `false`; MPN-in-sentence cases return `true`); full suite 2337 passing. Accepted FP: a bare package/qualification token a detector misses (e.g. `D2PAK`) in a genuine descriptive query would suppress fit-ranking for that query — a mild degradation that never produces a wrong label. **Audit (read-only, same session):** swept every chat tool for the same pattern (LLM input → visible label/list without a resolve-or-drop guard); the rest are well-guarded (MPN lookups resolve against the catalog and drop non-existent parts; summaries/tables/filter chips are deterministically rebuilt). One comparable soft spot was found and — at the user's request — **also fixed in a follow-up**: `present_choices` button labels ([ChoiceButtons.tsx](../components/ChoiceButtons.tsx)) are free LLM text rendered as-is. The SYSTEM_PROMPT already forbids part-proposing choices ("no option carries an mpn/manufacturer or otherwise proposes a candidate"), but that's a soft instruction; new [choiceGuard.ts](../lib/services/choiceGuard.ts) `sanitizeChoiceOptions` makes it deterministic — wired into the `present_choices` handler, it strips `mpn`/`manufacturer`, neuters `action:'confirm_part'`→`'other'`, and DROPS any choice whose **label** names a part (via `mentionsMpn`, which spares categorical labels like "N-channel" / "X7R" / "AEC-Q200" / "100V rail"). The tool schema was tightened to match (removed the `confirm_part` enum value + `mpn`/`manufacturer` fields — they contradicted the prompt's hard line). Only LLM-authored choices pass through the guard; the app's own next-step choices (`find_replacements` / `show_mfr_profile` / `show_best_price`) are built client-side from resolved parts and untouched. 5 new unit tests; 2342 passing. All work committed on branch `fix/mpn-request-not-greenfield-search`, not merged.

## Decision #256 — Confirming a NEW source part clears the previous part's derived state (stale Cross References fix) (June 27, 2026)

**Trigger (user report).** With replacements on screen for BC847CLT3G, the user filtered to a Galaxy cross (works), then **clicked the Galaxy part** (DTC113ZE) in chat to load it as the source. The Overview attributes loaded correctly, but the bottom **"Cross References" section showed BC847CLT3G's data** — "Logic Driven (79)" (the original part's exact candidate count), Accuris (10), and its manufacturer chips — i.e. the previous part's crosses, not the clicked part's.

**Root cause (path divergence).** The source panel's Cross References section reads `allRecommendations` (Decision #229). A fresh **search** clears the previous part's derived state ([useAppState.ts](../hooks/useAppState.ts) ~L1314: `recommendations`/`allRecommendations`/`selectedRecommendation`/`comparisonAttributes`/`applicationContext`), but the two **confirm-a-part** paths (`handleConfirmWithLLM`, `handleConfirmDeterministic`) — which share an identical setState — only swapped `sourcePart` + dropped acceptance criteria. So clicking a part left the old recommendations in state. The LLM confirm path never auto-recomputes replacements (button-driven, Decision #165), so the stale set lingered indefinitely; the deterministic path would flash it until `loadAttributesAndRecommendations` repopulated. Classic reset-logic drift between the search path and the confirm paths.

**Fix.** Both confirm paths' initial setState now also clear `recommendations`, `allRecommendations`, `selectedRecommendation`, `comparisonAttributes`, `applicationContext`, `currentFilter`, `currentFilterLabel` — mirroring the search-reset. After a click, the Cross References section is correctly **empty until the user runs "Find replacements" on the new part** (identical to how a freshly-searched part behaves — cross-refs are computed on demand). The bug was showing *wrong* data; the fix shows *correct* (empty-until-computed) data. Also clears any stale chat filter chip (the user's "Galaxy" filter) and stops wasted background enrichment churning on the old part's 79 crosses.

**Scope / accepted caveat.** Client state only — **no cache bump**, no logic/data change; full suite 2342 passing (state-machine behavior in the `useAppState` hook isn't unit-tested — verified live: clicking the Galaxy part no longer shows the prior part's crosses). Does NOT change cross-ref-on-demand behavior (clicking a part still shows next-step buttons, not auto-computed crosses) and does NOT address the separate slowness of loading an Atlas part (inherent multi-source fetch; the cleared stale recs only remove some wasted background work). Committed on branch `fix/source-panel-stale-crossrefs`.

## Decision #257 — Instant source-panel load: optimistic preview from on-screen data + Atlas fetch routing (June 27, 2026)

**Trigger (user report).** Clicking a part in chat to load it as the source took 20–30s showing a BLANK skeleton panel — even though the part's specs were *literally just on screen* (it was a replacement card). Worst for Atlas/Chinese parts. The user pushed for a robust, source-agnostic fix, not a per-source patch.

**Two root causes.** (1) **Wrong-source fetch routing** — `handleMpnClick`'s rec branch built a bare `PartSummary` with NO `dataSource`, so the confirm flow ran the Digikey-first gauntlet (`getAttributes`: two sequential ~10s product-details + keyword-search timeouts for a part Digikey doesn't carry) before falling through to Atlas — the bulk of the 20–30s. (2) **Blank skeleton during the fetch** — the source panel renders a pure skeleton (no header) while `phase==='loading-attributes'` AND `sourceAttributes===null`, so the user stared at a blank box for the whole fetch, regardless of source.

**Fix (fast for ANY part — display is decoupled from the fetch).**
- **Optimistic preview** ([optimisticAttributes.ts](../lib/services/optimisticAttributes.ts)): `buildOptimisticFromRec(rec)` / `buildOptimisticFromSummary(summary)` synthesize a partial `PartAttributes` from data already in memory — `rec.part` (rich Overview: status / supplier quotes / lifecycle from FindChips enrichment) + `rec.matchDetails` (scored values → partial Specs), or a `PartSummary`'s header + `keyParameters`. `handleConfirmPart(part, optimistic?)` passes it (the richer rec-preview when available, else a summary fallback so EVERY confirm path benefits) into both confirm flows, whose initial setState now sets `sourceAttributes: preview ?? null` — so the panel **paints instantly**. The canonical full fetch still runs in the background and replaces the preview the moment it lands. Layouts gate the skeleton: `loading={phase==='loading-attributes' && !sourceAttributes}`.
- **Readiness gate** (`sourceAttrsReadyRef`): false while a confirm shows the preview, flips true once canonical attrs are committed. The follow-up intent shortcut (`handleSearch`) checks it, so replacement-finding never scores a partial preview (which lacks `subcategory` + full params). Next-step buttons that trigger recs only appear post-fetch anyway — the ref hardens the typed-intent edge.
- **Atlas fetch routing**: `handleMpnClick`'s rec `PartSummary` now carries `dataSource: mfrOrigin==='atlas' ? 'atlas' : undefined`, so the BACKGROUND fetch routes straight to Atlas (skips the Digikey gauntlet) — making the canonical fetch itself fast for Chinese parts, on top of the instant paint. Mirrors the rec-CARD path's existing `mfrOrigin==='atlas'` skip.

**Scope / accepted caveat.** Client display/timing only — **no cache bump**, no logic/data change; full suite 2342 passing; verified live ("loading fast now"). The preview is display-only and never scored. Brief partial window: a rec-preview's Specs is the scored subset (full set fills on fetch); a summary-preview shows `subcategory:''` (cosmetic — only feeds logic-table selection, which is gated off the preview) and an empty Commercial tab until the fetch. Conceptually mirrors `handleSelectRecommendation`'s existing optimistic-open for the comparison view. Bundled with Decision #256 on branch `fix/source-panel-stale-crossrefs` (PR #14).

## Decision #258 — Chat manufacturer-discovery tool: "which manufacturers make X?" (June 27, 2026)

**Trigger (user report).** Asking the chat agent *"Are there any Chinese component manufacturers that make BJTs?"* returned the deterministic zero-result line *"I couldn't find any parts matching your criteria. Try adding or relaxing a requirement."* The chat had no tool to **discover** manufacturers by component type — only `get_manufacturer_profile` (one named company) and `search_parts` (specific parts) — so the model fell to a part search, got zero candidates, and `buildSearchSummary()` ([searchSummary.ts](../lib/services/searchSummary.ts)) emitted the no-results line (main-chat-only; called only from [useAppState.ts](../hooks/useAppState.ts)). The data + query path already existed (the Decision #192 grounding RPCs) but were walled off from chat.

**Fix — new `find_component_manufacturers` chat tool (chat() only), flexible across three grains.** A free-text component term resolves deterministically in TS (the LLM never has to know our family IDs / taxonomy) to one of:
- **specific family** ("BJTs", "MLCC", "tantalum capacitors") → `family_id` set;
- **component supertype** ("capacitors", "diodes", "voltage regulators") → `atlas_products.category` (the ComponentCategory enum — the supertype grain, indexed; includes uncovered products for breadth);
- **high-level group** ("passive components", "discrete semiconductors", "ICs") → a `family_id` set derived from the registry's `LogicTable.category` (Passives / Discrete Semiconductors / Integrated Circuits / Relays);
- **all** ("all components") → no filter; else **unresolved** (model asks for specificity, never searches).

**Backing RPC.** New `get_atlas_manufacturers_for_scope(p_family_ids text[], p_categories text[], p_limit int=30) RETURNS jsonb` ([scripts/supabase-atlas-manufacturers-by-scope-rpc.sql](../scripts/supabase-atlas-manufacturers-by-scope-rpc.sql)) — SECURITY DEFINER, 30s timeout, granted authenticated+service_role. AND'd optional filters, `GROUP BY manufacturer`, returns `{ total_manufacturer_count (true distinct, uncapped), total_product_count, manufacturers:[{manufacturer, product_count}] top-N }`. **`RETURNS jsonb` is load-bearing** — a broad scope (all passives) can exceed the PostgREST 1000-row cap (Decision #206); a scalar return sidesteps it. **Deploy:** the SQL is run once in Supabase (this project has a single Supabase instance the operator manages directly — no separate prod env or IT handoff for DB changes); **applied & verified live June 27** (BJTs → 89 MFRs led by ISC, capacitors → 15, passives → 78). A fresh env would need the SQL re-run; until then the tool returns a graceful error, rest of chat unaffected.

**Resolver** ([lib/services/atlasManufacturerDiscovery.ts](../lib/services/atlasManufacturerDiscovery.ts)). `resolveDiscoveryScope(text)` + `listManufacturersForScope(scope)`. The load-bearing subtlety is the **bare-supertype-vs-qualified-family arbitration**: `subcategoryToFamily` has broad keys ("Resistors"→52, "Relay"→F1) that would narrow a group/supertype question to one family. We accept the specific-family match only when a *qualifier* remains after stripping the supertype head word (`meaningfulRemainder`) — so "tantalum capacitors"→family 59 but bare "resistors"→supertype Resistors (all 4 families), and "logic ics"→Logic ICs supertype, not the ICs group. Mostly registry/enum-derived (robust to dataset growth); only two small synonym maps are hand-authored.

**Honesty + linkify.** Tool/prompt state the **Chinese/Atlas-only** scope ("Among the Chinese manufacturers in our Atlas dataset, N make X"). The true `totalManufacturerCount` + a `truncated` flag prevent the top-30 cap being read as "only 30 exist." Listed manufacturer names register in `data.mentionedAtlasManufacturers`, so they render as **clickable links** to profile panels (the Decision #203 cold-ask wire). New system-prompt routing rule after the "Manufacturer profile questions" block routes "which/who/are there manufacturers that make X" to this tool, **never** `search_parts`.

**Stale-count cleanup (folded in).** Removed the hardcoded "~115 Chinese manufacturers" figure from six chat-prompt blocks ([llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)) — a stale first-ingest number (the `atlas_manufacturers` identity table has since crossed 1,000+ rows; the admin route's "~115" comment was already flagged stale). Counts are now always live from the RPC.

**Scope / verification.** `chat()` only (the module-scope `tools` array; `refinementChat`/`listChat` use separate inline dispatch and are out of scope for general discovery). 17 unit tests on `resolveDiscoveryScope`; full suite 2359 passing; lint clean; new code type-clean. Verified live against staging: BJTs → 89 MFRs (led by ISC, 4,673 products), capacitors → 15, passives → 78. No cache bump (no scoring/shape change). Branch `feat/manufacturer-discovery-chat`. Follow-up parked in BACKLOG: "Manufacturer profile pull should open the right-hand panel" (P3).

## Decision #259 — Explanatory tooltips on calculated parts-list column headers (June 28, 2026)

**Trigger (user report).** Reviewing the `demo_bom` parts list, the user noticed the **Top Repl. Savings** and **Max Repl. Savings** columns were blank for every row. Diagnosis: those columns compute **(your current cost) − (replacement price)**, and `demo_bom` has no current-cost column, so there is no minuend — the replacement prices themselves were filling in fine. Not a bug; the BOM simply had nothing to compare against. That surfaced a broader gap: several parts-list columns are **computed/derived** (savings, top replacement, lowest price, best price, total stock, the cross-reference counts, FindChips risk scores, user formulas) and nothing on screen explained what each one does. Request: tooltips on the calculated column headers so people understand the calculation.

**Fix — one optional `description` on the column catalog, surfaced two ways.**
- New optional `description?: string` field on `ColumnDefinition` ([lib/columnDefinitions.ts](../lib/columnDefinitions.ts)). Populated, in plain non-technical wording, on every calculated/derived built-in: the `sys:*` **Replacements** columns (`hits`/`logicBasedCount`/`mfrCertifiedCount`/`accurisCertifiedCount`/`top_suggestion*`/`priceDelta`/`cheapest_viable_price`/`maxPriceDelta`), the `commercial:*` aggregates, the `fc:*` lifecycle/risk columns, **and** `mapped:unitCost` (the input that feeds savings — described so the chain is legible). The two savings descriptions explicitly state *"Needs a unit-cost column in your upload"* — **self-documenting the exact confusion that started this**.
- **Header render** ([components/parts-list/PartsListTable.tsx](../components/parts-list/PartsListTable.tsx)): an `InfoOutlinedIcon` + `Tooltip` is appended after the label when `col.description` exists, reusing the existing 12px / `text.disabled` adornment pattern already used for the "Matched from your data" sparkle. The two trailing adornments (portable sparkle + new info icon) were factored into one shared `adornments` fragment so the sortable and non-sortable header branches stay DRY (previously the sparkle JSX was duplicated across both).
- **User `calc:*` columns**: get a formula description (e.g. *"Your formula: Quantity × Price (DK)"*) via a new pure helper `describeFormula(formula, resolveLabel)` in [lib/calculatedFields.ts](../lib/calculatedFields.ts) — the label resolver is injected by the caller so the module avoids importing `columnDefinitions` (cycle: `columnDefinitions` already imports `calculatedFields`). Wired where `calcColumnDefs` is built in [components/parts-list/PartsListShell.tsx](../components/parts-list/PartsListShell.tsx) (resolves each operand to its display label via `availableColumns` + `getColumnDisplayLabel`, with a `headerHint`/id fallback).
- **Column-picker discoverability** ([components/parts-list/ColumnPickerDialog.tsx](../components/parts-list/ColumnPickerDialog.tsx)): the same `description` renders as muted secondary text under each column name, so users learn what a column does before adding it.

**Scope / verification.** Display-only — **no cache bump**, no data-model / scoring change, and **no view-config or template change** (the field lives on the static column catalog, not on saved views, so existing saved/master views are untouched). Raw columns (`ss:*`, `mapped:mpn`, etc.) intentionally carry no `description` → no icon, keeping the marker meaningful. Full suite **2359 passing**, type-clean on every touched file, lint clean (a stale unused `CalculatedFieldDef` import on the edited line in PartsListShell was dropped as incidental cleanup). Could not eyeball via a second dev server (the running instance holds the `.next/dev` lock) — verification is the type-checker compiling the icon/JSX + HMR on the running server; hover the calculated headers on a parts list to confirm. Committed `615571b` on `main`.

## Decision #260 — Parts-list "prefer a buyable replacement as the #1 pick" (June 28, 2026)

**Trigger (user report).** On `PackMAN-BOM` many rows showed a blank **Repl. Price**. Direct FindChips queries (main + broker feed, run from this session) confirmed the blanks are real — the part chosen as the **#1 replacement** is a manufacturer-**certified** equivalent that no distributor stocks (Knowles `0603W105K500YW`, automotive Murata `GCM188R71E104KA01D`, Samsung `RCS2012F1001CS`), while a **purchasable** alternative often sits lower (on `ERJ-6ENF1001V`, Panasonic `ERJU06F1001V` at $0.0172 / 15,032 in stock is alternate #3). Root cause: the #1 pick is chosen at validation time, **before FindChips runs**, by `sortRecommendationsForDisplay` (Active → cert bucket → equivalence → match %); stock/price aren't inputs, so a certified-but-unstocked cross can win the slot.

**Audit (why the obvious fix is too narrow).** On a **reloaded** list `fromStoredRows` drops `allRecommendations` ([lib/supabasePartsListStorage.ts:72](../lib/supabasePartsListStorage.ts)); only `replacement` + `replacementAlternates` (≤4) + `cheapestViableRecs` (≤5) survive, and FindChips only ever enriched the top-5. A naive "search the top-5" version would fix `ERJ-6ENF` (buyable cross is among the top matches) but **miss** the all-blank rows (`CL10A105`, `GRM188`) where the buyable option is ranked below the top matches. `cheapestViableRecs` (persisted, powers the **Lowest Repl. Price** column — the $0.10 on the Murata row) is exactly where buyable options live → it's the widening lever.

**Decisions (user).** Per-list setting **ON by default** (`preferBuyable`; absent ⇒ on); **user-configurable** "buyable" via `buyableRequires: 'price' | 'price_and_stock'` (default `'price_and_stock'`); **wider fix** over the narrow one; **display preference** (recompute the shown #1 at render time, instantly reversible) — reuses the existing `pickEffectiveTopRec` machinery (the `hideZeroStock` render-time layer, Decision #146) rather than a new ranking pipeline or stored reshuffle.

**Implementation.** New `preferBuyable?` + `buyableRequires?` on `ReplacementPriorities` ([lib/types.ts](../lib/types.ts), defaults in `DEFAULT_REPLACEMENT_PRIORITIES`). Pure buyability logic extracted to [lib/services/buyableSelection.ts](../lib/services/buyableSelection.ts) (`isBuyable` = `resolveBestRecPrice != null` AND, under `price_and_stock`, `recTotalStock > 0` where stock = FC supplier quotes else Digikey `part.quantityAvailable`; `getCandidatePool` = MPN-deduped `[replacement, ...alternates, ...cheapestViableRecs]`, top-first). `pickEffectiveTopRec` ([PartsListTable.tsx](../components/parts-list/PartsListTable.tsx)) now: filter the pool by `recPassesFilters` (hideZeroStock+buckets) → if `preferBuyable` and the best-eligible pick isn't buyable, return the first buyable candidate; else current behavior. **Reorders, never hides** — a row with no buyable candidate keeps its pick (never blank-by-hiding); an explicit `preferredMpn` is never overridden. `getAlternateReplacements` builds from `getCandidatePool` on the reload path so the **demoted certified cross + cheapest-viable** show as alternates (display-only, no persisted swap, so the certified one isn't lost). The price/stock cells already fall back to Digikey `unitPrice`/`quantityAvailable`, so a promoted cheapest-viable candidate renders real data without extra enrichment. **Near-free enrichment top-up** ([usePartsListState.ts](../hooks/usePartsListState.ts) `runFCEnrichment`): when `preferBuyable`, add each row's `cheapestViableRecs` MPNs to the enrichment `Set` (mostly overlap the top-5 already) + a merge block onto `row.cheapestViableRecs`, so `price_and_stock` reliably has their stock. Settings UI: checkbox + "Buyable means" select in [ReplacementPrioritiesField.tsx](../components/parts-list/ReplacementPrioritiesField.tsx); threaded through [PartsListShell.tsx](../components/parts-list/PartsListShell.tsx) like `hideZeroStock`. `handleUpdateListDetails`'s `rankingChanged` compares only `order`/`enabled`, so toggling these is display-only (no re-validate, no cache bump).

**Scope / verification.** BOM parts-list only; **no cache bump** (no scoring/shape change). A part with no buyable equivalent anywhere stays blank (correct). Accepted caveat: a promoted cheapest-viable candidate may show **Digikey** price/stock (not full multi-distributor) until FC-enriched. 13 new unit tests on `buyableSelection`; full suite **2372 passing**; type-clean; no new lint. In-browser check deferred (running dev server holds the `.next/dev` lock).

## Decision #261 — 🇨🇳 flag on Chinese (Atlas) manufacturers in the parts-list table (June 28, 2026)

**Request.** In the lists table, always show the little red Chinese flag to the right of a manufacturer name when that MFR is a Chinese (Atlas) one — mirroring the flag already on the single-part recommendation cards (Decision #161).

**Implementation** ([components/parts-list/PartsListTable.tsx](../components/parts-list/PartsListTable.tsx)). New local `MfrWithFlag` helper renders the name in an ellipsizing box with a `flexShrink: 0` flag pinned right (so a truncated name never cuts off the flag); the flag is the same `&#127464;&#127475;` glyph + "Chinese manufacturer" tooltip as the cards. Applied to: (1) **Repl. MFR** (`sys:top_suggestion_mfr`) keyed off `topRec.part.mfrOrigin === 'atlas'` — reliable identity signal, and it covers alternate sub-rows for free (same cell, `recommendation={rec}`); (2) **Source manufacturer** (`mapped:manufacturer` / `dk:manufacturer`, intercepted before the generic text path) keyed off `row.resolvedPart?.dataSource === 'atlas'`. The two surfaces use different signals because `mfrOrigin` is resolved per-MFR for **replacements** but not for **source** rows in the list flow (source origin surfaces only via `dataSource`, the narrower "came from Atlas" proxy — matches the request's wording). Accepted caveat: a Chinese source MFR whose attributes came from Digikey won't flag in the source column (it still flags as a replacement). Display-only, **no cache bump**; type-clean, full suite **2372 passing**.

## Decision #262 — System-driven guided part selection: chat asks a family's required specs one step at a time (June 29, 2026, ⏳ checkpoint on `feat/guided-selection-system-driven`, pending live validation)

**Problem.** Greenfield part selection in chat ("I need a voltage regulator", no MPN) was inconsistent run-to-run — the model improvised which narrowing questions to ask, how many, and whether as buttons or prose. Two cosmetic fixes shipped first (on `main`): the orphaned "2." numbering artifact (the model numbered a two-part question where one part became buttons, leaving a dangling "2." with no "1."), and a deterministic bare-button backstop (inject a fallback sentence when `present_choices` arrives with empty text). Neither addressed the root: the model owned the flow.

**Source of truth.** A second session produced verified per-family **Tier 2 (required-to-search)** + **Tier 3 (narrow-a-large-result-set)** attribute sets — [docs/min_attr_sets.md](min_attr_sets.md) (the table + per-family domain notes) and [docs/xrefs-families-and-attributes.md](xrefs-families-and-attributes.md) (a generated mirror of the live logic tables, produced by [scripts/export-family-attributes.ts](../scripts/export-family-attributes.ts)). Every Tier-2/Tier-3 attributeId was cross-checked against the live logic tables (all match; variant families inherit IDs from the merged runtime table).

**Phase 1 (model-driven) — built, then found insufficient by audit.** [lib/services/selectionQuestions.ts](../lib/services/selectionQuestions.ts) (`SELECTION_TIERS` + `getSelectionQuestions(familyId)`, resolving labels/options against `getLogicTable`) fed a read-only `get_selection_questions(partType)` tool; the guided-selection prompt told the model to ask the Tier-2 gaps "≤3 at a time, chips for categorical, prose for numeric," then search. A live test (Sonnet 4.6) + an **independent code audit** found three root failures: **(1) code bug** — `kind` was derived from `logicType`, but many numeric specs (`output_voltage`, `nominal_frequency_hz`, `coil_voltage_vdc`) are scored by `identity` exact-match yet are TYPED values → mislabeled as categorical-without-options → the live "text asks voltage, buttons say Fixed/Adjustable" mismatch; the original test masked it (asserted `iout_max` numeric, never `output_voltage`). **(2) structural** — the chat renders ONE message + ONE button group per turn, so a turn mixing a chip-spec and prose-specs cannot render coherently (and two chip-specs in one turn is impossible). **(3) no state** — the tool was stateless; "which specs are answered" / "is the checklist complete" were left to the model, which lost track, re-asked, and never converged.

**Phase 2 (system-driven) — the redesign (the user chose "do it right" over a prompt-tightening stopgap).** The system owns every DECISION; the model only phrases ONE step.
- **Bug fix**: `input: 'choice' | 'value'` (renamed from `kind`) is decided SOLELY by whether a real closed option set exists (from `upgradeHierarchy` or a tightened attributeName-parenthetical parse that rejects single-char/garbage tokens — "Safety Rating (X/Y Class)"→~~`["X","Y Class"]`~~, "Channel Type (N/P)"→~~`["N","P"]`~~) — NOT by `logicType`. New tests pin `output_voltage`→value, the false-positive rejections, and "every choice has options, every value has none" across all 43 families.
- **Controller** [lib/services/guidedSelection.ts](../lib/services/guidedSelection.ts) — pure, tested `nextGuidedStep(familyId, answered)`: choice specs ONE per turn (each needs its own button group), remaining typed-value specs batched into ONE prose turn, then `search` once Tier 2 is complete. "any / not sure" (value null) counts as answered but is dropped from constraints so it never blocks the search.
- **State** — `extractAnsweredSpecs(client, conversation, familyId)` in [llmOrchestrator.ts](../lib/services/llmOrchestrator.ts): a temp-0, forced-tool classification that re-derives which Tier-2 specs the user has answered from the WHOLE conversation each turn (the convergence fix — checklist is system-held, not model-tracked). Mirrors the existing `forceExtractSpecs` pattern.
- **Tool** `guided_select(partType)` (replaces `get_selection_questions`): resolves family → extracts answers → `nextGuidedStep`; for a choice step it ATTACHES the buttons itself (`data.choices`) + returns a directive to write one sentence for that one spec; for a value step a one-prose-question directive; for search "call search_parts now with these constraints." So buttons can never mismatch (one spec), it can't loop (system-held checklist), and the search fires deterministically. Tool-call logging (`[chat] tool:<name> input=…`) added so "did guided_select fire / what partType" is answerable (the audit flagged this was invisible). The model keeps the FIRST family-disambiguation question (it does that well) + sanity catches (flag an impossible 30V output on an LDO).
- **Admin** — read-only "Required to search" (Tier 2) / "Narrows results" (Tier 3) chip markers in the "Attribute Templates" section ([ParamMappingsPanel.tsx](../components/admin/ParamMappingsPanel.tsx)), fed by the SAME `SELECTION_TIERS` data so admin and the agent can't disagree. i18n in en/de/zh-CN.

**Phase 3 (fully system-emitted turn) — built after a second live test exposed Phase 2's residual leak.** A live NTC-thermistor run showed the model still freelancing: after the user answered, instead of relaying the system's "search now" step it improvised its own `present_choices` ("did you mean 10 kΩ?"), silently rewrote the user's stated 10 Ω → 10 kΩ, and ran its OWN keyword search — which dropped the structured constraints, so the "Fits your specs / Below spec" fit chips never computed. Root cause: Phase 2 left the model both *phrasing* the question AND *firing* the search, so it could still wander at either point. The user asked for something "consistent and bulletproof," so the question/search path was taken away from the model entirely.
- **The model is BYPASSED on guided turns.** New deterministic controller [lib/services/guidedSelectionController.ts](../lib/services/guidedSelectionController.ts) `decideGuidedTurn(messages, parse, hasOnScreenContext)` runs at the TOP of `chat()` (before the agentic loop). When it owns a turn it returns the system-authored response directly — a fixed-wording question + the system's buttons, or it runs `searchParts` itself with the tracked specs attached — and `chat()` returns early. The model never phrases a guided question, never fires the guided search, can't swap a value. The ONLY model call on a guided turn is the injected temp-0 `extractAnsweredSpecs` (the answer parser).
- **Fixed wording IS the state marker.** `OrchestratorMessage` has only `{role, content}` — no metadata channel — so the controller recognizes its own reserved phrasings (`renderChoiceQuestion`→"Which X do you need?", `renderValuesQuestion`→"What … are you targeting? (Say \"any\" …)", `renderDisambiguationQuestion`) via `isSystemGuidedQuestion` to know a selection is in progress (a continuation turn). Choice labels strip their option-list parenthetical so the question doesn't restate the buttons.
- **Fit labels guaranteed (folds in the missing-chip fix).** The system-run search passes the `nextGuidedStep` constraints (attributeId-keyed) straight into `searchParts({partType, constraints})`, so the logic-vetting pass always runs and every card gets its `matchScore`/`failCount` → the chips always render. The model's value-swap is gone (it can't reach the search), and an off-spec value now surfaces honestly as "Below spec" instead of being silently rewritten.
- **Gates (keep it from hijacking the wrong turns):** greenfield only; the MPN gate applies ONLY to a fresh turn (a one-word continuation answer like "Fixed"/"Buck" can `looksLikeMpn`-false-positive, so it's skipped mid-questions); fresh ENTRY requires selection intent (not a theory question) and a clean screen (`hasOnScreenContext` false) so post-results refine/filter/compare/pivot stay with the LLM; known-ambiguous heads (regulator→C1/C2, transistor→B5/B6/B9) disambiguate deterministically with chips whose labels resolve back to their family. Continuation (mid-questions) is unconditional.
- **`guided_select` tool REMOVED** (def + handler) and the prompt's guided-selection block slimmed to "the system owns these turns; you only clarify an unrecognized component type." Sanity catches (the "30V LDO?" nudge) are dropped for v1 — an off value shows as "Below spec" instead; a deterministic per-family range nudge can be added later (BACKLOG).

**Phase 4 (registry-backed recognition — kills the whack-a-mole).** Live testing surfaced a *pattern*, not just bugs: whether the system owned a turn hinged on a hand-maintained recognizer (`resolveFamilyFromText` keyword map + a small `AMBIGUOUS_HEADS` table), and every word it missed ("Tantalum", "capacitor", "diode") fell through to the chat loop — which then freelanced the whole flow (numbered questions, ungrounded "Vishay has lower ESR" prose). So each missing word silently reproduced the original bug. Fixes, in order of depth:
- **Immediate correctness:** the MPN gate (`looksLikeMpn`) false-positives on type words ("Tantalum", "MLCC", "Film", "Fixed") — now skipped when the message names a part type (`resolvePartTypeFamily`). Added capacitor (12/58/59/64/60) and diode (B1/B2/B3/B4) to `AMBIGUOUS_HEADS`, and a `LABEL_TO_FAMILY` index built from the table so every chip label re-pins by construction (covers variant families B2 Schottky / B4 TVS, which `resolveFamilyFromText` can't reach).
- **The structural fix:** recognition is no longer a hand list. `classifyPartTypeFamily` ([llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)) is a temp-0 forced-tool classifier whose **enum is derived from the live 43-family `logicTableRegistry`** — complete by construction (a new family extends recognition for free) and **output-bounded to a valid familyId or 'none'**, so the model acts as a pure classifier, never a free-prose author (it cannot reintroduce freelancing). It's wired as the FALLBACK in `decideGuidedTurn`: the deterministic recognizer runs first (common types → 100% consistent, zero LLM cost), and the classifier fires ONLY on a fresh sourcing turn the deterministic layer misses (gated `!isLikelyTheory && (intent || bareNoun)` so it's skipped for theory questions and recognized types). Net: any phrasing of a known component is OWNED by the system; only genuine non-sourcing/theory/MPN turns defer to the chat path (correctly). Tests assert the classifier is NOT called for deterministically-recognized types or theory questions.

**Status.** Checkpoint on `feat/guided-selection-system-driven`; **2781 tests pass** (23 controller tests) + app code type-clean. **NOT merged / not live-validated** — same consistency gate as before (run greenfield requests live, identical flow each time). Known v1 limitations (BACKLOG): a 2nd guided selection later in the same chat (results already on screen) falls to the LLM; an MPN-pivot typed mid-questions is re-asked rather than handled; sanity-catches dropped. Chat-prompt change ⇒ re-run [docs/chat-prompt-regression-checklist.md](chat-prompt-regression-checklist.md) (greenfield section) before merge.

## Decision #263 — Deterministic Chinese/Western origin filter over chat search-result cards + flag-consistency resolver fix (June 30, 2026)

**Problem (BACKLOG P2, now resolved).** After an MPN search ("LM358"), "show me only the Chinese ones" returned only a SUBSET of the Chinese makers visible in the list (caught 3PEAK/ChipNobo, missed HGSEMI/Slkor/LX/TDSEMIC), or the model prose-answered *"None of the current 50 results are from Chinese MFRs."* Two root causes, found in sequence.

**Why the LLM path failed.** First cut added `mfr_origin_filter: 'atlas' | 'western'` to the `filter_search_results` tool ([searchResultFilter.ts](../lib/services/searchResultFilter.ts), [llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)). The model REFUSED to call it — its "never assert MFR origin" claim-discipline (Decision #166) overrode the tool instruction, so it prose-answered instead. Origin filtering can't depend on the model.

**Deterministic intercept.** `detectSearchOriginRefinement(query)` ([filterIntentDetector.ts](../lib/services/filterIntentDetector.ts)) + `dispatchSearchOriginFilter` ([useAppState.ts](../hooks/useAppState.ts)) apply the filter client-side the moment the user asks — mirrors the recs-panel `detectFilterIntent`/`dispatchFilterIntent` path (Decision #131). Narrows from a preserved FULL match set (`searchFullMatchesRef`) so sequential "Chinese ones" → "Western ones" each filter the complete result. `PartSummary.mfrOrigin` is resolved server-side per unique MFR in `searchParts` (alias resolver, mirrors `getRecommendations`, Decision #161) so every Chinese maker is caught, not just Atlas-tagged rows.

**The actual bug behind "none are Chinese" (traced, not guessed).** That message is `dispatchSearchOriginFilter`'s OWN empty-result branch — the deterministic filter DID run and returned zero. Cause: the predicate keyed off `mfrOrigin`, but the card's 🇨🇳 flag renders off `dataSource === 'atlas'` ([PartOptionsSelector.tsx](../components/PartOptionsSelector.tsx)), and cached search cards carried `dataSource` without a resolved `mfrOrigin`. Fix: the predicate now MIRRORS the flag — Chinese = `mfrOrigin === 'atlas' || dataSource === 'atlas'`; Western = `mfrOrigin === 'western' && dataSource !== 'atlas'`. `SEARCH_CACHE_SCHEMA_VERSION` v8→v9 (stale entries lack `mfrOrigin`, which Western needs).

**`/code-review` hardening (three findings, each verified against the code before fixing).**
- **Detector vocabulary.** The old residual heuristic treated any leftover ≥3-char word as a part type, so descriptor phrasings ("PRC-based options", "Chinese firms only", "the reputable Chinese ones") leaked to the LLM and reproduced the prose bug. Now the refine-vs-new-search decision keys off a real component vocabulary — `namesComponentType` in the new client-safe [componentVocabulary.ts](../lib/services/componentVocabulary.ts) (`GROUP_SYNONYMS` + `SUPERTYPE_SYNONYMS` extracted from [atlasManufacturerDiscovery.ts](../lib/services/atlasManufacturerDiscovery.ts) so the two SHARE one vocabulary and can't drift, + material/sub-type qualifiers like tantalum/ceramic/electrolytic). Only a NAMED component ("Chinese MLCCs") is a new search; everything else refines. The fragile `ORIGIN_FILLER_RE` word list is retired. Failure mode is now SAFE: a missing word makes it refine (deterministic) rather than leak to the prose path.
- **Stale-view guard.** `searchFullMatchesRef` was set only on an LLM search and never cleared, so an origin ask after a part-confirm/reset could resurrect a prior search's cards. The intercept guard now keys off the CURRENT view (`searchResultRef`), not the persistent full-set ref. Deterministic (no-API-key) searches now also populate the ref so their Chinese→Western flip narrows from the full set.
- **Flag-consistency resolver.** `getRecommendations` resolved a candidate's `mfrOrigin` from the alias index only, while `searchParts` (~L642) also forces `'atlas'` when the part came FROM the Atlas dataset. So an Atlas-sourced Chinese maker whose name the alias index missed read `'unknown'` in recs — the 🇨🇳 flag disagreed between the search + recs panels for the same maker. `getRecommendations` now mirrors the override. `RECS_CACHE_SCHEMA_VERSION` v18→v19 (full-result tier only — `mfrOrigin` is resolved after the base payload, verified by reading the cache flow). The two filter PREDICATES were deliberately left independent (user call — each fits its own data: search cards can be cached-without-origin, recs are always freshly resolved); with the resolver corrected they return the same answer for the same maker, so unifying them would add coupling for no behavior gain.

**Verification.** 2838 tests pass (new: cached-Atlas-no-origin filter cases; descriptor-phrasing refinement cases; discovery vocab-move regression); type-clean at baseline; lint clean. Live-verified in the UI (Chinese filter returns the full set of makers; Western flips cleanly; "find Chinese MLCC" stays a new search). Merged to `main` June 30, 2026. **Process note:** this session's fixes were repeatedly reached by *tracing the observed symptom to its exact source* (the "none are Chinese" string → own code; `resolveFamilyFromText` gaps → verified before building) rather than acting on a plausible theory — recorded in the `feedback-verify-cause-before-fixing` working note.

## Decision #264 — MPNs the assistant surfaces via tool lookups are clickable in chat (tool-resolved known-set) (July 1, 2026)

**Trigger (user report).** After a search, the user asked *"which of these has the lowest input offset voltage?"*. The assistant answered with a ranked table of parts (LM358A-TSR, LM358BIDDFR, LM358D, …) — but **none of the MPNs were clickable**. Hard product rule: any MPN shown in the app must be clickable (a click loads that part into the source panel, same as a search-result card).

**Root cause — a data gap, not a rendering bug.** [MessageBubble.tsx](../components/MessageBubble.tsx) already linkifies MPNs inside `p`/`li`/`strong`/`em`/`td` (bold MPNs in a markdown table cell included), but only for strings present in the `knownMpns` set (exact-set membership, `buildLinkPattern`). `knownMpns` ([AppShell.tsx](../components/AppShell.tsx)) was built from just three sources: `searchResult.matches`, `allRecommendations`, `sourcePart`. When the model answers a parametric question, it resolves parts via `get_batch_attributes` / `present_comparison`, and those MPNs never entered the set. Traced the flow to confirm: `summarizeSearchResults` injects only the **top-3** keyParameters per card, so a niche spec like Vos forces a `get_batch_attributes` call; and the model passed *variant* MPNs (which the catalog resolved to real parts) that were never the search cards — so the base set genuinely couldn't cover them. `handleMpnClick` had the same three-source gap: even if linkified, a click on such an MPN silently returned.

**The data was already on the wire.** The main chat orchestrator already returns `result.attributes = toolData.attributes` — a `Record<requestedMPN, PartAttributes>` of every part resolved by tools this turn ([llmOrchestrator.ts:~2036](../lib/services/llmOrchestrator.ts)), on the existing `OrchestratorResponse.attributes` field. **The client just never read it.** So the fix is client-only wiring, mirroring the Decision #203 `mentionedAtlasManufacturers → chatAtlasMfrs` pattern.

**Fix (2 files, client-only, no server/type/prompt change, no cache bump).**
- New session-accumulated state `chatMentionedParts: ReadonlyMap<string, PartAttributes>` in [useAppState.ts](../hooks/useAppState.ts) (interface + `initialState` + `hydrateState` reset, mirroring `chatAtlasMfrs`). `handleSearchWithLLM` merges `response.attributes` into it after the `chatAtlasMfrs` block — keying by **BOTH** the requested form (`Object.keys`, what the model typically writes) **and** the canonical `part.mpn` (what the catalog resolved to / what `ComparisonTable` renders), both lower-cased. Catalogs canonicalize (BC847B → BC847BLT1G), so both forms are needed — mirrors the existing `groundingCtx.attributeMpns` union. Immutable merge, stable Map identity when nothing new.
- `chatMentionedPartsRef` mirror + a fourth fallback in `handleMpnClick`: on a miss in search/recs/source, look up the map, build a thin `PartSummary`, and `handleConfirmPart(part, attrs)` — passing the stored `PartAttributes` as the Decision #257 optimistic preview so the panel paints instantly (with an Atlas fetch-routing hint for Chinese parts).
- `knownMpns` memo gains `for (const k of appState.chatMentionedParts.keys()) set.add(k)`. Case doesn't matter downstream: the linkify regex is `gi` and displays the prose's own casing; `handleMpnClick` re-resolves case-insensitively.

**Grounding preserved.** Only tool-**resolved** (real catalog) parts land in `response.attributes` — a fabricated MPN returns `notFound` and is never added, so it stays un-clickable. The fix can only ever *add* coverage. Covers both render paths: the model-written markdown table (linkified via `knownMpns`) and the system-built `present_comparison` → `ComparisonTable` (which gates on `knownMpns.has(row.mpn)` and is also populated from `data.attributes`).

**Not a prompt violation.** "Which has the lowest X?" is a superlative **ASK** question — the prompt's ASK mode says *"answer from the returned data"* with no table restriction; the "never hand-write a comparison table" rule is scoped to the separate side-by-side-comparison paragraph. The ranked ASK table is an accepted discovery-flow format (a mild ASK-vs-`present_comparison` wording overlap in the tool description is noted, not touched — a checklist-gated prompt concern, Decision #241).

**Scope / out of scope.** Main `chat()` surface only. Refinement chat (parts-list modal) and List Agent return different response shapes (no `attributes`) and don't render batch MPN tables — deferred. Exact-set matching unchanged (fuzzy/suffix-stripping rejected — false-positive risk vs the zero-false-positive design, #165).

**Verification.** 2838 tests pass; changed files type-clean (pre-existing test-file tsc errors unrelated); zero changes to the greenfield search pipeline (grep-confirmed: `knownMpns`/`handleMpnClick`/`chatMentionedParts` are display-side only, never read by search/greenfield code). Live click-through pending. Branch `fix/clickable-mpns-in-chat-answers`.

## Decision #265 — Durable AI Triage suggestions: DB-persisted verdicts, batch-size box, "generated so far" counter, server-side Accept pile (July 4–6, 2026; ✅ merged to `main` July 8, SQL applied, LIVE — 3,068 server-side verdicts as of July 12)

**Trigger (engineer working a ~25,000-row queue).** The Atlas Dictionary Triage engineer wanted to sweep the easy "AI Accept" wins first, in controlled batches, then come back for the rest. Three things blocked that: (1) no batch-size control (the bulk button generated for *everything loaded*, no "generate N" input) and no way to see *how many generated so far*; (2) the generated pile wasn't safe (browser-local `localStorage` + 24h in-memory server cache only); (3) every visit reset to the first 50 rows with endless "Show more" clicking — and even cached verdicts couldn't be *seen* until their rows were re-loaded.

**Root cause — one thing underneath all three.** The AI Generate verdict (`accept`/`defer`) was computed by [`/api/admin/atlas/dictionaries/suggest`](../app/api/admin/atlas/dictionaries/suggest/route.ts) and stored **only** in the browser (`atlas-ingest-ai-suggest-v7:` localStorage, 1yr) + a **24h in-memory** module cache ([atlasSuggestCache.ts](../lib/services/atlasSuggestCache.ts)) — **never the database**. Each queue row (`GlobalUnmapped`) the server returned carried **no verdict**, so the server couldn't count or filter "Accept" across the whole queue → the client had to load rows a page at a time and filter locally in `states`.

**Decision (asked & answered):** persist AI suggestions to the DB so the count and the pile are true across sessions/computers; **don't overcrowd the header** (top mapped/left/total row unchanged; the counter lives by the Generate control; the Accept chip is the single "Accepts waiting" number).

**Fix — server.**
- New table **`atlas_param_suggestions`** ([scripts/supabase-atlas-param-suggestions-schema.sql](../scripts/supabase-atlas-param-suggestions-schema.sql)): PK `(family_id, param_name)` where `family_id = dominantFamily ?? dominantCategory ?? ''` (mirrors the overloaded override scope, Decision #178) and `param_name` is stored **normalized** (`normalizeOverrideKey` = NFC+lower+trim) so a queue row's `(scopeKey, normalizedParam)` looks up its verdict directly. Admin RLS mirrors `atlas_unmapped_param_notes`. Same file adds RPC **`get_atlas_param_suggestion_verdicts()` `RETURNS jsonb`** — load-bearing: a plain `.select()` (or `RETURNS TABLE` RPC) is server-capped at 1000 rows (Decision #206), which would silently freeze the counter + Accept pile at 1000; a scalar jsonb return is not row-capped.
- **Client-safe types module** [atlasParamSuggestionTypes.ts](../lib/services/atlasParamSuggestionTypes.ts) (`StoredSuggestion`/`RowSuggestion`/`VerdictCounts`/`AiVerdictFilter` + pure `normalizeParamKey`/`scopeKeyForRow`/`verdictMapKey`) so both client (`types.ts`) and server can import the join contract **without** pulling the server-only service client. **Server-only store** [atlasParamSuggestionStore.ts](../lib/services/atlasParamSuggestionStore.ts): `getParamSuggestion` (single-row DB read), `upsertParamSuggestion` + `upsertParamSuggestionsBulk` (writes), `fetchVerdictMap` (whole-queue map via the jsonb RPC, 30s cache, invalidated on every write), `fetchSuggestionDetails` (page-scoped detail, `.in()` **chunked at 150** to dodge PostgREST URL-length limits).
- **`/suggest`** reads the DB on an in-memory cache miss (a redeploy that cleared the 24h memory cache still serves the persisted verdict — **regen is free after generation**) and upserts every fresh Sonnet result (`generated_by` from `requireAdmin().user`).
- **`queryTriage`** ([triageQueueQuery.ts](../lib/services/triageQueueQuery.ts)) gains an `ai_verdict` filter (`accept`/`defer`/`none`/`all`) + `verdictCounts` — `generatedTotal` over ALL working rows with a verdict (stable, monotonic, not a shrinking fraction); `accept`/`defer`/`none` over the OPEN synonym queue (so `accept` reads as "Accepts waiting", independent of the active filter).
- **Batches route** ([ingest/batches/route.ts](../app/api/admin/atlas/ingest/batches/route.ts)) attaches the verdict map onto the cached `Classified` rows **at request time** (outside the 6h-cached `computeTriageAggregation`, so new generations reflect immediately) via a **non-mutating spread** — only generated rows become fresh objects, the rest pass by reference; **never mutates the shared cached `classified` array** (also read by the manufacturers route). Page rows get full detail (fresh, effective-stripped objects — safe to mutate). Returns `verdictCounts`.
- New **`POST /api/admin/atlas/param-suggestions/backfill`** for the one-time browser→DB migration.

**Fix — client.**
- **Batch-size box** (default 100, max 500 = `MAX_BATCH_GENERATE`) + `Generate N`; **per-batch verdict tally** ("Last batch of 100 → 28 Accept · 41 Defer") accumulated in the worker; `onBatchGenerated` bubbles the tally so the panel bumps the counter optimistically.
- **"Generated so far" counter** rendered by [AtlasDictTriagePanel.tsx](../components/admin/AtlasDictTriagePanel.tsx) **next to the Generate control, NOT the mapped/left/total header** (anti-crowding). Raw cumulative `verdictCounts.generatedTotal` + an optimistic `verdictDelta` reset on every fetch. The **Accept/Defer/None chips** ([TriageFilterBar.tsx](../components/admin/atlasIngest/TriageFilterBar.tsx)) now carry whole-queue counts — the Accept chip *is* the "Accepts waiting" pile (one source, no separate banner).
- **Server-driven AI verdict filter** (`buildQuery` sends `ai_verdict`) so "Accept" pulls the whole pile paginated — no load-everything dance (this also removes the earlier runaway auto-fetch risk: server-side Accept pages are already all-accept). The thin client-side re-confirm reads `states … ?? row.suggestion?.verdict` so optimistic updates are instant AND there's no first-render flash before `states` hydrate.
- **Infinite-scroll auto-load** (IntersectionObserver sentinel; reveals loaded rows then fetches the next page, capped at `AUTO_LOAD_MAX_VISIBLE`=600, `useTransition` freeze-guard preserved) so "Show more" is no longer a chore; **remember-view** persists `mode`/`statusFilter`/`aiVerdict` in `localStorage` (`atlas-triage-view-v1`); **one-time backfill** runs on mount (guarded flag `atlas-triage-suggest-backfilled-v1`), and rows **hydrate their AI card from the server-attached `row.suggestion.detail`** so verdicts render cross-browser.

**Load-bearing traps handled.** (a) 1000-row cap → jsonb RPC for the full verdict map; (b) scope-correct join (`dominantFamily|dominantCategory : normalizedParam`, not bare paramName — a verdict can't mis-attach to a same-named param in another family); (c) never mutate the shared cached `classified` array (spread only generated rows); (d) counter is a raw cumulative count so it doesn't wobble as rows get accepted; (e) verdict map invalidated on every write + 30s TTL backstop; (f) chunked `.in()` for page detail; (g) client-safe type split so no server-only code leaks into the client bundle.

**REQUIRED manual step before live.** Apply the schema SQL **once** in Supabase (single project ref `xlgsymrexucuiauwecje`; user runs SQL directly, no separate prod DB / IT step — see Decision #258 note). Additive/idempotent; touches no existing data. Until applied, the counter reads 0 and the Accept pile is empty (table absent).

**Verification.** 2846 unit tests pass (added: `queryTriage` verdict filter/counts + the `atlasParamSuggestionTypes` join-key contract); `npm run build` clean; tsc clean on all touched files (pre-existing test-file tsc errors unrelated). **Live click-through NOT yet verified** — needs the SQL applied + a hands-on run (honest gap). Follow-ups (BACKLOG): dev-HMR module-cache fragility of the verdict-map invalidation (30s TTL is the backstop); a same-computer counter starts from the backfill, not zero.

**Code-review follow-up (commit e8b8863, same branch).** Two fixes from the branch review: (1) **`fetchSuggestionDetails` cap-safety** — the page-detail query keyed on `param_name` alone, which fans out across every family sharing a normalized name (e.g. a voltage/`type` param) and could exceed the 1000-row cap, silently dropping some page rows' Accept-card detail on the fresh-browser path. Now **grouped by scope** — each query filters on `(family_id, param_name)`, bounding the result by the page (each PK matches ≤1 row), with capped concurrency (Supabase pool safety); the earlier "chunked 150 names" note is superseded. (2) **"Generated so far" counter honesty** — `/suggest` always normalizes to `accept|defer` and persists only on success, so a batch's "no verdict" rows are actually **failed** generations (nothing persisted, retry), NOT un-counted successes; the tally now reads "N couldn't generate (try again)" instead of "no verdict". `generatedTotal` switched from the batch-scoped working-set count to a **cap-safe global head-count** (`fetchGeneratedCount`, `select('*',{count:'exact',head:true})`) — true cumulative + monotonic + no longer mislabeled as global while being batch-scoped. Optimistic client math already excluded failures (`generated = accept+defer`), so no panel change.

## Decision #266 — A transient AI error no longer latches the whole chat session into keyword-only fallback (July 8, 2026)

**Trigger (customer report).** A user pasted a multi-part sourcing request (three equivalent 60V/100A MOSFET MPNs + a description line + "find chinese sources") and got the deterministic no-results line *"I couldn't find any parts matching '…'. Please try a different part number or include the manufacturer name."* That exact wording is produced by **only one** site — `handleSearchDeterministic` ([useAppState.ts](../hooks/useAppState.ts)) — so the AI orchestrator was **not** in the loop for that turn (the greenfield no-match line via `buildSearchSummary` reads *"…matching your criteria. Try adding or relaxing a requirement."* — different string, ruling out an LLM search-miss).

**Root cause — a sticky capability flag treated as a permanent verdict.** `AppState.llmAvailable` (`boolean | null`, null = unprobed) is set to `false` in `handleSearchWithLLM`'s catch block on **any** `/api/chat` failure (missing/invalid `ANTHROPIC_API_KEY` → 500; Anthropic 429/529/timeout; server exception). `handleSearch` routing gated on `state.llmAvailable === false → handleSearchDeterministic`. But nothing flips the flag back within a session: the only place it's set `true` is `handleSearchWithLLM`'s success path, and routing never calls that path again once the flag is false. **Net: one transient blip downgrades every later search in the session to the keyword-only backup — no retry, no auto-recovery, only a page reload / new chat clears it.** The failure is also near-invisible (the confirm path doesn't call the AI, so clicking cards still works, masking the degraded state), though `ServiceStatusContext` does flip `anthropic` → `unavailable` from the returned `serviceWarnings`.

**Fix (1 file, 1 site).** `handleSearch` no longer branches on the sticky flag — it always `await handleSearchWithLLM(query)`, which **already** self-falls-back to `handleSearchDeterministic(query, true)` in its own catch. So each new message gives the AI a fresh attempt; a transient error degrades only the one message that hit it, and the AI is used again on the next turn the moment it recovers — no reload needed. `state.llmAvailable` (and `handleSearchDeterministic`, now unreferenced there) dropped from the callback deps. Chosen over a cooldown/consecutive-failure counter (right depth — remove the special-case latch rather than layer machinery on it) and over touching the confirm path (it doesn't call the AI, so it's not part of this bug). Trade-off: in a genuinely-unconfigured deployment every search pays one fast failed round-trip (immediate 500) + a brief "Thinking…" flash before falling back — accepted for automatic recovery. No new "AI down" notice added — the existing service-status signal already covers visibility.

**Separate, still-open question (not fixed here).** *Why* the AI request failed for that customer in the live app is a runtime/ops question code can't answer — likely missing AI credentials in the IT-managed deployment (systematic, every message) or a transient Anthropic blip (intermittent). Decisive check: send a plain `LM358` in a fresh live chat — if even that hits the fallback wording, the AI isn't running in prod (credentials); if it behaves normally, the customer hit an intermittent blip that the old latch then amplified. The multi-part-paste parsing gap (recognizing several equivalent MPNs bundled with prose) is the other half of the report — tracked in BACKLOG under conversational query-shape routing.

**Verification.** 2838 tests pass; `useAppState.ts` type-clean and no new lint warnings (the 8 remaining are all pre-existing, none at `handleSearch`). Branch `fix/ai-search-fallback-latch`.

---

## Decision #267 — Triage Batch Accept: star the AI's no-caveat high-confidence rows, tick, accept in one click (July 11–12, 2026, ✅ merged to `main` as PR #18 / `7ea3780`)

**Trigger.** With Decision #265's durable verdicts in place, the engineer working the ~26,000-row Atlas Triage queue asked the obvious next question: *"isn't the tool automatically creating the mapping when it can, or am I supposed to manually approve each one?"* Nothing was automatic — every mapping needed its own Accept click. They explicitly did **not** want blanket auto-approval (*"Accept suggestions can sometimes have warnings or be slightly off"*), and rejected the richer design we first drew up (computed safe-subset + server-side safe count + preview modal) in favour of something simpler: **"mark with a star the ones that are HIGH confidence so I can check boxes for each one and click a batch 'accept' button at the top."**

**Design — the star is a spotlight, not a gate.** The engineer hand-ticks every box, so the star carries no safety authority: it points at rows that are *quick to clear*, and every existing on-row warning (invented-field indicator, wrong-family auto-flag, staleness stripe) still renders next to it. This is why there is no automated safe-subset predicate, no server-computed "safe count", and no preview step — the human IS the check, and the one-click Undo is the backstop.

**What earns a star** — `isStarrableRow` in [lib/services/triageBatchApprove.ts](../lib/services/triageBatchApprove.ts) (pure, client-safe, unit-tested; the component and the tests share one predicate): verdict `accept`, confidence **high**, **no caveat in the AI's own prose**, a writable `suggestedAttributeId` + `suggestedAttributeName`, a scope to write under (L3 `dominantFamily` or L2 `dominantCategory`, per Decision #178), and still-open status (not auto-flagged, not parked, no *active* override). Reverted (inactive) overrides stay starrable — a row you undid is a row you can re-accept.

**The caveat rule — the load-bearing correction.** First live test: a starred `RDS(on)/(mΩ) typ 2.5V` row whose own explanation read *"the outlier value of 1700 mΩ warrants a data-quality note: verify whether that sample is a data entry error."* The AI's `confidence` field only ever described **the mapping**; a caveat about the **data values** lived in prose and never touched it. The engineer's rule, verbatim: *"If there is ANYTHING that looks off, including values, and there's a need to inspect, then it is not high confidence and the star needs to be removed."* Fixed at both ends:

1. **At the source** — the `/suggest` prompt's definition of "high" now folds in data caveats: *"there is NOTHING — about the mapping OR the sample values — that you would ask a human to inspect… if your explanation would recommend the engineer verify, spot-check, confirm, or double-check ANYTHING, the confidence is NOT 'high'."* The model uses its own judgment; no phrase list to maintain.
2. **As a backstop** — `explanationHasCaveat()` keyword-scans explanation + reasoning for the ~3,000 verdicts generated under the *old* definition. Deliberately biased toward catching hedges (a false positive only costs a manual accept; a false negative is the exact failure being removed).

**The `unambiguous` trap.** The first caveat list contained `ambiguous` — which substring-matched **"unambiguously"**, the AI's word for *maximum* certainty, and stripped stars off the cleanest rows in the queue. Certainty words whose negative form is a caveat marker (`ambiguous`/`ambiguity`/`uncertain`) are now **excluded from the list entirely** (real ambiguity is a `defer` verdict, already filtered by verdict), and a `NEGATION_BEFORE` guard ignores any marker preceded within ~14 chars by a negator (*"no need to verify"*, *"nothing to spot-check"*). **General lesson: a substring blocklist over natural-language prose must be checked against the positive forms of its own words.**

**Write path** — `POST /api/admin/atlas/dictionaries/batch` mirrors the single-write route (NFC+lower+trim → deactivate-then-insert) with four batch-specific guards, each of which was a real bug caught in the pre-implementation audit rather than in production:
- **Dedupe within the request.** Two cosmetic variants that collapse to one `(family_id, param_name)` key would violate the partial unique index `WHERE is_active = true` and fail the *entire* bulk insert.
- **Never a composite multi-tuple `.or()`.** PostgREST can't OR tuples safely — write **per family** with `.in('param_name', names)` (the codebase already avoids this in `atlasClient.ts`).
- **Per-row insert fallback** on a unique-violation race, so one bad row can't poison a family's whole batch.
- **Exactly ONE cache invalidation**, at the very end — single-flight per Decision #234 (Atlas-scale recompute is ~20–30s; one-per-row would be unusable). Undo (`POST .../batch/undo`) deactivates by **primary key** `id IN (...)`, never an unindexed `change_reason` text scan.

**Code review (xhigh) found three real bugs, all in the client's counting** — fixed in `e53d500`: (a) `leftBucket` was hard-coded `'accept'`, so re-accepting a previously-undone row decremented an open count it was never in (the single-row Accept path had an explicit guard with a comment warning about exactly this; the batch path failed to copy it); (b) ticks survived a filter change (the `[viewKey]` effect reset only `visibleCount`), so the button could claim — and submit — rows no longer on screen; (c) a **failed** batch left the Undo button wired to the **previous successful** one. Also de-duplicated a second copy of `normalizeParamKey` (drift there would write overrides under a key the queue can't find, silently re-opening every accepted row — the Decision #186(d) bug), now pinned by a test asserting the two are the same function.

**Sizing reality (measured against live data, July 12).** 3,068 verdicts stored; 1,114 `accept`; **1,020 of those already mapped in earlier sessions** — only ~40 accept rows remain open, and the residue at the top of the queue is precisely the medium/caveated rows the engineer skipped by hand. **The star pays off on the ~22,600 ungenerated params, not on the existing pile.** Measured rates for planning: ~40% of a fresh Generate batch returns `accept`; ~85–93% of those are high-confidence; the caveat net pulls ~7%. A 500-row Generate (~$2.50) should yield roughly 150–170 one-click mappings. **Lesson: "N AI verdicts exist" ≠ "N rows are waiting" — always join against what's already mapped before quoting a backlog number** (an earlier estimate of "~950 batchable" was off by ~30× for exactly this reason).

**Explicitly out of scope.** Ungenerated rows, `defer` verdicts, and medium/low confidence are never starred and can't be batch-accepted. **No DB migration** — the star reads the `confidence` already carried on each row's durable suggestion detail, and Undo keys off the existing primary key.

**Verification.** 27 unit tests on the predicate + batch prep (including the `unambiguously` regression, negated-hedge handling, shared-regex statelessness, and normalizer identity); full suite 2,862 passing (the 11 `mfrMatchPicker`/`manufacturerAliasResolver` failures are pre-existing — verified identical on clean `main`); build + lint clean. Docs: [docs/RUNBOOK_INGESTION.md](RUNBOOK_INGESTION.md) step 5★ and its in-app mirror in [IngestHowToDrawer.tsx](../components/admin/atlasIngest/IngestHowToDrawer.tsx) (kept in sync per Decision #214).

## Decision #268 — Lifecycle-status filters are per-status and deterministic: "hide discontinued" hides Discontinued, not Obsolete (July 13, 2026)

**Reported symptom.** In chat, over search-result cards: "don't show me obsolete parts" filtered correctly, but "don't show me discontinued parts" did nothing — the Discontinued cards stayed on screen.

**Root cause — a word/enum coincidence, and it was worse than "does nothing".** There was exactly ONE lifecycle control, the boolean `exclude_obsolete`, implemented in both filter predicates as a literal `status !== 'Obsolete'` check ([searchResultFilter.ts](../lib/services/searchResultFilter.ts), [recommendationFilter.ts](../lib/services/recommendationFilter.ts)). `PartStatus` has FIVE values (`Active | Obsolete | Discontinued | NRND | LastTimeBuy`). "Obsolete" only appeared to work because the user's word happens to equal the enum value. Every OTHER lifecycle word — "discontinued", "NRND", "last time buy", "EOL" — was recognized upstream (the detector regex grouped them; the `filter_recommendations` tool description literally promised "hide obsolete/discontinued parts") and then routed into the same one flag, which deleted the user's **Obsolete** parts and left the ones they actually asked to remove. **Reproduced before fixing:** input `[Active, Obsolete, Discontinued, Discontinued]` + "hide discontinued" → output `[Active, Discontinued, Discontinued]`. It filtered the wrong thing, silently.

**Why the test suite was green.** `searchResultFilter.test.ts` had a test named *"exclude_obsolete drops Obsolete parts only"* whose fixture set contained **no Discontinued part at all**. The test pinned what the code did, not what a user asks for. A fixture blind spot, not a missing test.

**The fix.**
1. **Precise per-status predicate (shared).** `exclude_statuses?: PartStatus[]` on both `FilterInput` and `SearchFilterInput`. One shared `resolveExcludedStatuses` / `statusIsExcluded` / `describeExcludedStatuses` in `recommendationFilter.ts`, imported by `searchResultFilter.ts`, so the two predicates **cannot drift again**. Missing status ⇒ treated as `Active` (missing data never hides a part — same philosophy as the engine's `review`-not-`fail`). `exclude_obsolete` retained as a legacy alias for `['Obsolete']` that **unions** (never overrides) with the precise list.
2. **Precise detection.** `detectStatusIntent` ([filterIntentDetector.ts](../lib/services/filterIntentDetector.ts)) now scans each status word independently and unions: obsolete→`Obsolete`, discontinued→`Discontinued`, nrnd/"not recommended"→`NRND`, "last time buy"/ltb→`LastTimeBuy`; the genuine GROUP words (eol / end-of-life / inactive / dead) and "only active" map to every non-Active status. Polarity is EXCLUDE-cue-first, then ONLY-cue (keep-named, hide-rest). **Active is never hidden as collateral** unless a cue sits directly on it — so "show the active ones but drop discontinued" hides Discontinued only.
3. **Deterministic on search cards (Phase 2).** `dispatchSearchOriginFilter` generalized to `dispatchSearchFilter(input, label, query)`; new `detectSearchStatusRefinement` is intercepted client-side in `handleSearch` alongside origin. Same rationale as Decision #263: relying on the LLM to reach for the filter tool is a coin-flip, and **a filter that silently never fires is indistinguishable from one that fired and matched nothing**. Guarded by `namesComponentType` symmetrically with origin, so "only active MLCCs" over transistor cards is still a PIVOT, not a refine — and that fall-through is now safe either way, because the predicate under the LLM's tool is fixed too.
4. **No silent failures (Phase 4).** Every card filter reports the arithmetic ("Filtered to 3 of 11 — hiding Discontinued (8 hidden)"). A zero-match filter says so and **leaves the cards up** rather than emptying the panel. New `currentSearchFilterLabel` state + `dispatchClearSearchFilter` make an active card filter visible and clearable ("show me all"), mirroring the recs panel's `currentFilter`. Sequential filters still compose from the preserved full set (`searchFullMatchesRef`).
5. **Honest tool schemas.** Both `filter_recommendations` and `filter_search_results` now expose `exclude_statuses` (enum array) and instruct the model to pass EXACTLY the statuses named; `exclude_obsolete` is marked deprecated. The old description's promise ("hide obsolete/discontinued") is now true.

**Not touched.** The RecommendationsPanel per-status checklist (Decision #232) is component-local `hiddenStatuses` state, never `FilterInput` — already precise, unchanged. BOM parts-list uses `filterRecsByMismatchCount`, which already dropped both Obsolete and Discontinued (the "right" version that existed all along). **No cache bump** — these are post-fetch display filters; the schema versions key the fetch cache.

**Deferred (BACKLOG).** Phase 3 — attribute filtering on search cards ("remove SOT-363 parts", "hide the 45V ones"). Cards carry only ~3 `keyParameters` + a description string (no `matchDetails`), so it needs a match-against-visible-data predicate plus an honest "these cards don't list that spec" path.

**Verification.** Bug reproduced first with a throwaway test (printing the wrong-filter output above), then fixed. 36 new/updated unit tests pinning every status word, multi-status unions, the group words, the only-inversion, the Active-collateral guard, the question-not-a-filter case, and the "inactive" ≠ "active" boundary. Full suite 2,887 passing (the 11 `mfrMatchPicker`/`manufacturerAliasResolver` failures are pre-existing — verified identical on clean `main`); `tsc` error count unchanged from baseline (92→92, none in touched files); eslint 0 errors on touched files; build compiles clean.

---

## Decision #269 — Triage row is memoized; the freeze was render cost, not the server — and the dev build was half of it (July 13, 2026)

**Symptom.** In Admin → Triage, filtering AI Suggestion = Accept, scrolling to load ~350 rows, selecting all High Confidence and hitting Batch Accept froze Chrome ("page unresponsive") and took a minute+. The accepts all landed correctly — it was purely a speed bug.

**Root cause.** A Triage row is **162 MUI elements** (35 of them `Tooltip`s, each Popper-backed). The row JSX was inlined in the parent's `visibleRows.map()`, so React had no memoization boundary: **any** parent state change — a checkbox tick, a scroll that loaded 50 more rows, the Batch Accept button entering its busy state — synchronously re-rendered **every row on screen**. At 350 rows that is ~57,000 elements per redraw. Cost therefore grew with how far you had scrolled (adding 50 rows redrew the 300 already there), which is why the freezes compounded: measured main-thread blocks of 671ms → 2052ms → 5114ms → 9308ms → **14,140ms**, *from scrolling alone, before Batch Accept was involved at all*.

**Fix.**
1. **`TriageRow` extracted + `React.memo`'d** (the 789-line row JSX moved byte-for-byte). Everything it displays now arrives as a **prop**, and the parent resolves whole-collection reads into per-row primitives (`selected.has(p)` → `isSelected: boolean`, `revertingIds` → `isReverting`, `schemaByFamily[k]` → `familySchema`). Pass primitives, never containers, or the shallow compare never bails.
2. **Ten row callbacks were identity-unstable** and would have silently made the memo a no-op — `confirmFlag`, `acceptAndRegenerate`, `runInvestigate`, `openDeferPopover`, `reopenRow`, `acceptRow`, `recordInvestigationAction`, `toggleFlag` all listed `states` or `notesByParam` in their deps (`states` is rewritten on **every keystroke** in a row's text field), and `renderBulkMatchChip` / `renderFindSimilarButton` weren't memoized at all. Fixed with **live ref mirrors** (`statesRef`, `notesByParamRef`, `bulkOptedOutRef`, `normalizedMatchesByRowRef`) so deps collapse to `[]`/props-only. **Refs are safe for event handlers ONLY** (they run after render and want the freshest value); a memoized row that read a ref during *render* would go stale — so the two render helpers were inlined into `TriageRow` and made props-driven instead.
3. **`getFamilyDisplayName` now caches by familyId.** It returned a fresh `{short, full}` object per call and is passed as a prop, so every auto-flagged row would have had a new prop identity each render and never bailed. Found by auditing prop identity, not by any test — nothing would have caught it.
4. Supporting: `hydrateFromCache` no longer calls `setStates` with an empty object (it re-fires on every `rows` identity change — the optimistic accept rebuilds the array — and `{...prev}` is a new object React can't bail out of, forcing a whole extra full-list redraw per accept); header stats memoized; the Batch Accept commit wrapped in `startTransition`; the fire-and-forget `recordInvestigationAction` loop bounded to 4 (it opened one fetch per approved row).
5. **Server** ([batch/route.ts](../app/api/admin/atlas/dictionaries/batch/route.ts)): the per-family loop was **sequential** — 3 awaited Supabase round trips per family, up to ~57 scopes (43 families + 14 L2 categories) = ~171 serialized trips. Now a **bounded pool of 5** over families (the 3 calls *within* a family stay ordered; different families touch disjoint `(family_id, param_name)` keys). Every guarantee preserved: dedupe, idempotent same-attribute skip, per-row insert fallback, exactly-ONE cache invalidation (Decision #267).

**Measured** (throwaway harness mounting the real table with realistic synthetic rows; worst chunk = loading rows 350→400):

| | memo OFF (before) | memo ON (after) |
|---|---|---|
| **dev build** | 9705ms | **3772ms** |
| **production build** | 4720ms | **839ms** |

The memo is worth **2.6× in dev, 5.6× in prod**; the production build is worth another ~4.5×. Together **~11×** (9705ms → 839ms).

**The finding that matters most, and it needed no code:** the engineer was doing Triage against the **dev server**. The dev React build instruments every fiber (`logComponentRender`, `addValueToProperties`, `createTask` all showed up in the CPU profile) and double-renders every component. A memo *bail-out* — which costs microseconds in production — was costing ~4ms per row in dev. **Do bulk Triage against a production build, not `npm run dev`.**

**Two wrong diagnoses, both killed by measurement — this is the lesson.** (1) The plan originally ranked the *server* fix first; the 14s freeze happened while merely scrolling, when the server isn't involved, so it was a footnote. (2) After the memo landed and the numbers didn't move, the next hypothesis was browser `<table>` layout (a table re-computes column widths globally, so insertions look O(n²)) — but splitting the commit into `reactMs` (useLayoutEffect) vs `browserMs` (useEffect, post-paint) showed **`browserMs` flat at ~10ms the whole time**. It was never layout. Reasoning produced two plausible, confidently-argued, wrong answers in a row; the render-counter and the CPU profile produced the right one. **Instrument the actual thing.**

**Also worth knowing:** the engineer's own before/after (14.1s → 15.4s, "no improvement") was **confounded** — production builds, the full test suite and headless Chrome were running on the same machine during the "after" measurement. Same-machine, back-to-back harness runs are the only trustworthy comparison.

**Not done (BACKLOG).** Cost still grows with rows on screen (319ms at 100 rows → 839ms at 400, prod). Virtualization — keeping only the ~20 visible rows mounted — would make it flat. Deferred: it changes scroll ownership (sticky header, scroll container, variable row heights) on the engineer's daily-driver table, and prod+memo is already a hitch rather than a freeze.

**Verification.** Full suite 2,887 passing (the same 11 `mfrMatchPicker`/`manufacturerAliasResolver` failures are pre-existing — verified identical on a clean tree via `git stash`); the 27 `triageBatchApprove` tests pass **unedited**, which is the check that the server's pure helpers were untouched by the parallelization; `tsc` and `eslint` clean on both files (the `react-hooks/exhaustive-deps` rule was **test-fired on a deliberate violation** to confirm it was actually enabled before trusting a clean run); production build compiles.

---

## Decision #270 — Superseded ≠ Reverted: the Triage "Reverted" bucket was 95% phantoms (July 13, 2026)

**Symptom.** The engineer asked why Triage showed ~180 "Reverted" params when he remembered reverting "a dozen or so" — and why **so many of them had no sample values**. Both turned out to be one bug.

**Root cause.** The override write path is **deactivate-then-insert**: every edit / re-accept of a mapping flips the previous row to `is_active=false` and inserts a new one. That dead row is *history* — the param is mapped and working right now via its active sibling.

`computeTriageAggregation` ([triageQueueCompute.ts](../lib/services/triageQueueCompute.ts)) builds its orphan pass from **both** `activeOverrideMap` and `inactiveOverrideMap`, de-duping only by **override id**. For a param carrying both an active and a superseded override, the live batch row consumes the **active** id (`lookupOverride` prefers active) — so the **inactive** id is never consumed, falls through to the orphan pass, and is synthesized as a row with `sampleValues: []` / `productCount: 0`, which then classifies as `isUndone`.

Hence both symptoms at once: **phantom "Reverted" rows, with no sample values, for params that were never reverted.**

**Measured on live data** (read-only audit of `atlas_dictionary_overrides`, 2,247 rows):

| | |
|---|---|
| active overrides | 2,029 |
| **inactive** | **218** |
| — of which **SUPERSEDED** (an active sibling exists for the same family+param) | **209** |
| — of which **genuinely reverted** (no active sibling) | **9** |
| "Reverted" rows shown BEFORE (deduped by family:param) | **181** |
| "Reverted" rows shown AFTER | **9** |

Some params carried **three** dead versions each (`ifsm(a)`, `pd(w)`, `id[a]`, `長(公釐)`).

**Fix.** New pure predicate `isSupersededOverride(ov, activeKeys)`: an **inactive** override whose `(familyId, normalizeOverrideKey(paramName))` key has an **active** sibling is superseded history — skip it in the orphan pass. A genuinely reverted param has no active sibling and still surfaces. **Nothing is deleted from the DB** — the history rows stay, they just stop pretending to be reverts.

**The asymmetry that matters:** hiding too much would silently swallow a *real* revert, which is far worse than showing a phantom. So the "no active sibling → KEEP" case is pinned at least as hard as the hiding case (8 unit tests: family scoping, param scoping, never-hide-an-active, NFC/case/whitespace normalization matching how the maps are keyed, CJK names, L2-category scopes). Verified against live data: the engineer's own hand-revert (`B5:rds(on) /(mω) typ 2.5v`) survives the filter.

**Cache.** The triage queue is cached (`admin_stats_cache` key `triage-queue`, L1 30s / L2 persistent, **no schema version**). The corrected counts appear after one `invalidateTriageQueueCache()` — which fires automatically on the next dict accept. No manual step required, but the bucket won't visibly drop until then.

**Adjacent, still open (BACKLOG).** Revert gives no signal about where the row went (it silently leaves Open *and* Accepted and lands in Reverted), and a reverted param can never rejoin the **Open** queue. Both logged separately.

### Decision #268 — follow-up: self-review caught the recognition layer over-firing (July 13, 2026)

An xhigh code review of #268 found the per-status *predicate* was sound but the *phrase-recognition* layer bolted on top was dangerously loose: it tested "is there a cue anywhere?" and "is there a status word anywhere?" as two independent global checks. Reproduced, then fixed:

| Input | Old (broken) behaviour |
|---|---|
| "show me parts with 100ns **dead** time" | `exclude_statuses: ['Active']` → **hid every Active part** |
| "show me parts with **active** low enable" | hid every non-Active part |
| "can you show me if any are discontinued?" | filtered the list down to only discontinued (a QUESTION became a filter) |
| "hide the Vishay ones, they're **discontinued** anyway" | hid every discontinued part; the Vishay filter never ran |
| "exclude discontinued, **not active**" | hid Active too — the exact collateral the guard existed to prevent |

**Root cause:** `hasOnlyCue` was keyed off `FILTER_VERB_RE`, which matches a bare "show me" — so any message containing "show me" + any status word became a keep-only filter. Compounded by `dead` and bare `active` being treated as lifecycle words when both are everyday electronics specs (dead time; active low / active filter).

**Fix — recognition is now CUE-ADJACENT.** A status word only counts when a cue *governs it directly*, across a whitelist of meaningless filler ("remove parts that are discontinued" ✓) but never across a real noun ("hide the Vishay ones, they're discontinued" ✗). `dead` is gone entirely; `active` carries a negative lookahead for spec readings (low/high/mode/filter/current/…). Weak cues (`no`/`not`) require strict adjacency and may never target Active. `no longer active` / `inactive` / `eol` are group words. Strong cues may target Active explicitly ("hide active parts"). EXCLUDE beats ONLY, so "show the active ones but drop discontinued" hides only Discontinued.

**Three more review findings fixed in the same pass:**
1. **Filters now COMPOSE.** `dispatchSearchFilter` applied only the *new* predicate against the full set, so "the Chinese ones" → "hide discontinued" silently resurrected the Western parts. It now merges onto the active predicate (`{...active, ...next}` — same-key still replaces, so a Chinese→Western flip flips). Root cause was reducing `currentSearchFilter` to just a label; the predicate is now kept in `searchFilterInputRef`, and `OrchestratorResponse.searchFilterInput` carries the LLM's predicate back so an LLM filter and a client-side filter compose across the boundary too.
2. **Clearing a filter could wipe the panel to zero.** `dispatchClearSearchFilter` read `searchFullMatchesRef` with no fallback, so when a fresh search never populated it (cache hit / dev reload / hydrated conversation) "show me all" restored `[]` and reported "showing all 0 results". New `captureFullMatches()` lazily captures the pre-filter set on first use, plus an empty-set guard.
3. **Honest counts + copy.** The zero-match message quoted the full-set size as "still showing"; it now counts what is actually on screen. The recs headline is `Filtered to **5** replacements — hiding Discontinued.` (was the ungrammatical "Filtered to **5** hiding Discontinued replacements."). `ALL_STATUSES` is now a single exported list derived from `NON_ACTIVE_STATUSES` and consumed by the detector's inversion, the labels, and BOTH LLM tool enums — the five hardcoded copies were the same drift risk this decision set out to kill.

**Verification.** 12 new guard tests, one per confirmed defect, each pinning the old broken output as the thing that must never return. Full suite 2,910 passing (11 pre-existing `mfrMatchPicker`/`manufacturerAliasResolver` failures unchanged); `tsc` 92 errors = baseline, none in touched files; eslint 0 errors on touched files; build clean. **Lesson: the fix was right and the recognition layer around it was wrong — a narrow correct predicate behind a loose trigger is still a filter that does the wrong thing.**

---

### Decision #270 — the selection questions are generated from a reviewable document, and the build refuses an unclassified rule (July 13, 2026)

**The bug, in one line: the app never asked what voltage goes INTO a voltage regulator.**

`docs/min_attr_sets.md` said which specs the agent asks a user who is choosing a part by description. It was hand-copied ONCE into `SELECTION_TIERS` (`lib/services/selectionQuestions.ts`) — whose own header read *"transcribed verbatim from docs/min_attr_sets.md"* — and then never revisited. Two hand-maintained copies of the same truth, with nothing forcing them to agree. Measured, across all 43 families:

| | |
|---|---|
| Specs the matching engine scores | **823** |
| …with a state recorded anywhere | **287 (35%)** |
| …never asked **and never ruled on** | **536 (65%)**, in **all 43** families |
| Cross-family contradictions | **38** |
| `tier3` ("narrows results") runtime consumers | **ZERO** |

The TS copy was *faithful*. **The document itself had the hole**: C2 switching regulators require `vin_max`; C1 LDOs — also a Vin→Vout device, and the engine scores C1 `vin_max` at weight 8 — do not. Nothing could ever have noticed, because the one guard test asserted every *listed* id **exists**; it never asserted anything was **missing**. 536 holes, zero red tests.

**Inverted the dependency.** The document is now the SOURCE OF TRUTH and the code is generated from it:

- `lib/services/selectionDoc.ts` — parser, validator, serializer, contradiction detector (pure).
- `npm run selection:audit` — reconciles the doc against the live logic tables: every scored rule gets a row (new ones seed as `Not Asked`), names/weights/ids are re-read from the tables so they cannot go stale, and the human decisions (State + Reason) are preserved. Emits `lib/services/selectionTiers.generated.ts`.
- `npm run selection:check` — wired as `prebuild`, so **`npm run build` fails** if any scored rule has no state, if an attribute id was invented, or if the generated module is stale. Also a jest test, so `npm test` catches it identically.
- `SELECTION_TIERS` is now a re-export of the generated module. The public API (`getSelectionQuestions`, `getSelectionTier`) is unchanged — the existing 381-test drift guard passes untouched, which is the proof the swap is behaviour-identical.

**THREE states, not two.** `Required for Search` (always asked, blocks the search) · `Narrows Results` (asked only when the result set is too large) · `Not Asked`. The two ask-states fire on *different triggers* — collapsing them means asking everything up front, i.e. up to 27 questions before showing a MOSFET, the interrogation failure this product already shipped once.

**No weight threshold anywhere in the check — on purpose.** An earlier draft gated on weight ≥ 8. That is an invented heuristic and it fails BOTH ways: false-positive on `tst` (storage temperature, w8, correctly never asked) and false-negative on C1 `vin_min` (w7, never asked, plausibly a real hole — the threshold would have *hidden* it). **The build only guarantees a decision was MADE about everything; a human (Claude Fable 5) makes the decisions in the document, with weight shown as information, never as the verdict.** The one surviving automatic signal is also threshold-free: **cross-family contradiction** — the same attributeId asked in one family and silently skipped in a sibling that also scores it. That check catches the reported `vin_max` bug on its own, with no intuition required.

**ONE writable surface.** The admin "Attribute Templates" panel is **read-only** — it renders the state but cannot edit it. A file *and* a UI that can both write the same truth is precisely the drift being fixed. The panel's chip is also **never blank** now: previously an unasked spec was an unmarked row, so a real omission (`vin_max`) and a deliberate one (`rth_ja`) looked identical and there was nothing to review against. Unreviewed rows render `⚠️ Not asked`.

**The review loop (there is no engineer on this project — this is the actual workflow).** `npm run selection:audit` emits ONE artefact: the review prompt in the header, all 43 families, every scored spec with its real name + weight + current state, and the contradiction list. The owner hands that single file to Claude; the corrected file comes back; applying it and re-running audit regenerates the code, and **the build validates it** — a missing rule or an invented id names the offending line. The prompt ships *inside* the file deliberately: a separate prompt file could drift from the data, which is the exact failure being fixed.

**Honest limit, stated in the file itself:** `Required for Search` corrections take effect immediately. `Narrows Results` corrections are **recorded but not yet acted on** — the narrowing step that consumes tier 3 does not exist (its zero runtime consumers are why a small-signal-NPN search stopped surfacing BC847: gain is filed as a narrowing spec and was never asked). Building that step is the next piece of work.

**Verification.** 21 new tests, including the guard that was missing — the completeness check *fails* when a rule is added and left unclassified, proven end-to-end by injecting a real rule into the real C1 logic table (`npm run selection:check` → exit 1, naming the rule) and reverting. Generator is a byte-exact fixed point across runs. Full suite 2,931 passing (11 pre-existing `mfrMatchPicker`/`manufacturerAliasResolver` failures unchanged); `tsc` and eslint clean on touched files; `npm run build` passes with the gate firing first.

---

### Decision #271 — headroom on a maximum rating is free; and a detector for the whole class of hand-transcribed label bugs (July 13, 2026)

**The bug:** "I need a small-signal NPN for a 9 V circuit drawing 1–2 mA" stopped returning the BC847 on June 30. It was NOT missing — it sat at **rank 11**, below ten parts nobody would pick.

**ONE semantic error caused it.** A stated **operating condition** ("my circuit draws 2 mA") was read as a **max-rating requirement** ("I want a part rated for 2 mA"). Two symptoms fell out of it:
1. **The pool was poisoned.** `pickNumericValueIds` banded a `gte` threshold as `[X, X×10]`, so Digikey was asked for parts *rated* 2–20 mA → **18 exotic products**, with every ordinary small-signal NPN (rated 100 mA — the BC847, the 2N3904, all of them) excluded **by construction**.
2. **The right part was demoted.** The over-spec penalty (`Σ ln(candidate/required)`) charged the BC847 **5.52** for being rated 100 mA, while the injected exotics scored 2.30–3.51. Every candidate had 0 fails, so the penalty *was* the ranking.

**Fix — one line:** the `gte` band is now `[X, ∞)`. **Headroom on a maximum rating is free.** Verified live: pool 19 exotic → 50 sensible; BC847BLT1G **rank 11 → 3**; the whole top-10 becomes BC847/BC846/MMBT3904. 162 rules, all 43 families. `SEARCH_CACHE_SCHEMA_VERSION` v9→v10 — **without the bump the fix is invisible**, because the stale poisoned pool is served straight from cache (it looked exactly like the fix not working; it had worked first try).

**⚠️ THE PLAN'S CENTREPIECE WAS WRONG AND THE DIAGNOSTIC KILLED IT.** The plan called rewriting the over-spec penalty "the step with real design content" and staked a **global ranking change across all 43 families** on it. Measured: with the pool clean, **today's penalty puts the BC847 at rank 3; the proposed replacement put it at rank 5** and polluted the top-10. **The penalty was never broken — it only looked broken because the pool was poisoned.** The plan's other prime suspect (the verbose keyword `"BJTs — NPN & PNP"`) was also innocent: it finds the BC847 at rank 3 on its own. **Fixing either would have changed nothing.** This is why Road-B Step 0 forbade code before a live diagnostic.

**The mirror-image bug, found while fixing it.** `fit` (height, diameter — "the part must be no BIGGER than this") is evaluated `lte` by the engine, but the **fetch banded it with the `gte` branch**: ask for "height ≤ 1 mm" and it fetched parts 1–10 mm tall — precisely the ones that cannot fit. **31 rules across 25 families.** The function's own doc comment said `"lte/fit → [0, v]"` — **the comment was right and the code was wrong**, which is what a second copy of a truth always eventually becomes. Root-fixed: `effectiveThresholdDirection()` (matchingEngine) is now the ONE definition of which way a rule compares, and the fetch reads it from there.

**THE REAL DELIVERABLE — a detector, not five patches.** `package_case` was scored `application_review` (a rule type that hands **every** candidate a flat 50% and can never separate two parts) in **C6/C7/C8/C9/C10**, while **33 other families compared it exactly**. All five *also* listed it **Required to Search** — so the agent asked "what package do you need?" and then a SOT-23 request accepted a **QFN-32** at half marks. (The C8 rule's own note says *"BLOCK substitutions with a different package size"*; the code did the opposite.) These weren't lazy — they conflated *"does the package match?"* (mechanical, a mismatch is a fail) with *"even if it matches, check the pad assignments"* (a note for a human), and choosing `application_review` made the second the rule and **lost the first entirely**. Fixed to `identity` (36 families now agree), engineering note preserved as the rule's guidance. `RECS_CACHE_SCHEMA_VERSION` v19→v20 (**scoring changes** in those five families).

**Generalised into `findLogicTypeDivergences` + `findAskedButUncomparable`** ([selectionDoc.ts](lib/services/selectionDoc.ts)) — siblings of the Decision #270 contradiction detector, **threshold-free for the same reason**: *if 33 families compare a spec one way and 5 compare it another, at least one group is wrong. That is evidence, not opinion.* Both render as review sections in `docs/min_attr_sets.md`. They immediately surfaced **17 more divergences** and **6 remaining "we ask you, then ignore you" specs** (gain, DC bias derating, logic family, Vgs(th), PSRR, parasitic inductance) — **not auto-fixed**, because some divergences are legitimate (a mica capacitor's dielectric genuinely has no better/worse ranking the way an MLCC's does). A test pins the six; it fails if that list ever **grows**.

**Every hand-set label in a logic table is unverified until checked.** `logicType`, `thresholdDirection` and the tier assignment were all typed in by Claude from the source `.docx` files, and **all three have now been found wrong**. So `thresholdDirection` went under the same cross-family guard. Verified two ways, neither trusting the label: (a) **zero** direction disagreements across 43 independent transcriptions; (b) a semantic scan of every `gte` spec whose name implies lower-is-better returned 8 hits — **all 8 correct; the scan was wrong.** The real distinction is **capability vs cost**, not big-number vs small-number: ripple current and saturation current are *ratings the part can withstand* (more is free ⇒ `gte`), while ESR / leakage / dropout / quiescent current are *losses* (less is better ⇒ `lte`, 230 rules, band untouched).

**Verification.** 10 new band tests + 6 new detector tests, each pinning an old broken output. The existing `gte: keeps values … up to ×10` test **PINNED the bug** and was rewritten, not weakened. 3,111 passing (11 pre-existing `mfrMatchPicker`/`manufacturerAliasResolver` failures unchanged); `tsc`/eslint clean on touched files; build green.

---

### Decision #272 — the narrowing step: hear every spec the user states, and ask ONE question when the pool is useless (July 14, 2026)

**The complaint.** *"I need a small-signal NPN, 9V, 1-2mA, hFE 200-400"* — the app's own canonical query — could not surface the BC847B, the part that answers it. Three independent failures, all now fixed.

**1. We threw away the gain.** The guided-selection answer-extractor's `attributeId` enum was the family's REQUIRED spec list. Gain is a *narrowing* spec, so it wasn't in the enum, so the user's stated `hFE 200-400` was **deleted before the search ran**. Across all 43 families that discarded **629 of the 823 specs the engine can score**. The ask-list and the hear-list are different things: *what we choose not to ASK about was never a reason to IGNORE the user when they tell us anyway.* The enum is now the family's entire rule list. **Measured before shipping** (both enums over the same real conversations): it recovers the volunteered specs and reports **nothing** the user didn't say — 0 hallucinations, even with B5's enum going 6 → 27 specs.

**2. Gain could not separate two parts even when heard.** `hfe` is `application_review`, which returns a flat `review` (50%) and **never compares the two values**. BC847A (gain 110), BC847B (200) and BC847C (420) scored *identically*. **The fix is NOT to retype the rule.** For a *cross-reference* — "the replacement's gain differs; a human should look" — `application_review` is the RIGHT verdict, and retyping it would have traded a search bug for a cross-ref bug (the plan's named risk). A *search* is a different question: "I asked for 200-400 and this is 420" is a plain mismatch. So the search path compares stated bands **itself** ([statedBands.ts](../lib/services/statedBands.ts)), engine untouched, **zero cross-ref behaviour change**. It applies to every rule the engine structurally cannot compare (`ruleCanCompare`) — the class the #271 detector already enumerates — not to `hfe` in B6.

**3. The narrowing step was specified and never built.** `tier3` — authored for all 43 families, **read by zero runtime consumers**. Now: a search that returns a useless pool asks **one** question before presenting. **Which** question is not hand-ranked per family — *the data gets a veto, the document gets the vote*: split-quality (normalized entropy over pool buckets) + a coverage gate decide which specs **can** separate the parts in front of us; among those, the reviewed order in [min_attr_sets.md](min_attr_sets.md) decides which one to **ask**. The numeric buckets that measure the split **become the buttons**, so the answer is an explicit range by construction.

> **⚠️ Split quality is a GATE, not a ranking — and the measurement is why.** Ranking on entropy looked obviously right. On the *same* family and *same* query, gain vs saturation voltage scored **0.90/0.85** read from enriched attributes and **0.71/0.92** read from the lighter projection the vetting pass actually scores. **The order flips with the enrichment path.** A question chosen that way changes based on plumbing the user cannot see. Entropy answers *"can this question split the pool?"* (a fact); it cannot answer *"which question matters to someone choosing this part?"* (a judgement — and judgements live in the reviewed document).

**Only EXPLICIT bands are honoured** — a range, or a min/max-labelled bound. A **bare** value is refused, because its direction is unknowable: "gain 200" means *at least*, "parasitic inductance 2nH" means *at most*, and nothing in the data says which. Guessing a direction is what caused Decision #271. Gap logged in BACKLOG rather than papered over with an invented default.

**Convergence.** Hard cap of ONE narrowing question. A narrowing answer — **including "any"** — lands in the answered set, so the count of answered narrowing specs *is* the number of questions asked. No counter, no state channel, nothing to fall out of sync. This product's documented worst behaviour is *"never stops asking"* (27 questions before showing a MOSFET); the guards are that cap, a pool-size floor, a coverage gate, and never asking a question that cannot split the set.

**Two severe bugs the END-TO-END run caught that reasoning did not:**
- **`vceo_max` was read as a user-stated upper bound.** Half the specs in this codebase are *named* `*_max` — because the spec IS the part's maximum RATING. The parser saw "max" in `vceo_max` and banded a user's "9V" to *parts rated ≤ 9V*, throwing away every ordinary transistor — **Decision #271's bug, reintroduced by me through a different door**, and invisible because no BJT is rated under 10V so the filter matched nothing. On a MOSFET (`vds_max`, "30V") it would have destroyed the pool. Fix: resolve the attribute **as given** first; only strip a min/max when it does *not* name a real spec. Pinned by test.
- **The "Any" escape was an infinite loop.** Waiving the question answers the spec *without a value*, so the constraints are unchanged, so the cache key was unchanged — and the cache returned the result still carrying the question. Forever. `answeredSpecIds` is now in the cache key.

**Also:** `pickFetchBand` **deleted**. Dead code (no production caller) that still contained the `[v, v×10]` over-spec ceiling — i.e. the #271 bug — pinned by a passing test suite. The plan told me to resurrect it as the range-aware band builder, which would have silently restored the bug. *A dead reference implementation with a live bug in it is worse than no code at all.* Its range **parsing** was the good half and is preserved; the band **shaping** is gone.

**Result (live catalog).** BC847B **rank 11 → rank 2**; BC847C (gain 420) correctly marked **BELOW SPEC** at rank 44+; BC847A (110) excluded from the pool entirely. When gain is *not* volunteered, the system asks *"That gives 50 parts — more than is useful. Which dc current gain do you need?"* with `[40-72] [72-130] [130-230] [230-420] [Any]` — buttons drawn from the real catalog. `SEARCH_CACHE_SCHEMA_VERSION` v10 → v12. 3,128 tests passing (11 pre-existing failures unchanged), `tsc`/eslint clean, build green.

**Follow-up (same day, from the code review of the above).** The review caught the **same misreading a third time**, in a door I had not checked: `parseStatedBands` handed the catalog FETCH a raw `[lo, hi]` pair, and `buildFiltersForCategory` applied it with no rule-type gate — so a stated *"1-2 mA"* (what the user's circuit DRAWS) banded the catalog to parts **rated 1-2 mA**. Rule 2 of the module's own docstring ("only rules the engine cannot compare") was enforced in the scoring path and **forgotten in the fetch**. Measured live: inert for BJTs by luck (no transistor is rated 0.85–2.3 mA, so the filter matched nothing and was skipped) but it **FIRES on MOSFETs** — an ordinary *"N-channel MOSFET, 30V, 1-5A"* banded the catalog to parts rated ≤5.75 A, excluding every 10 A / 20 A / 60 A part, all of which run a 5 A load fine.

**The tests hid it:** every fixture passed `ic_max: 2` (a scalar), while the real extractor emits `ic_max: "1-2"` (a range string, measured). A scalar produces no band at all, so the entire threshold-band path was never exercised — *the suite validated a shape the system does not produce.*

**The real fix — the band carries its own direction.** Three times the guarding rule lived in a COMMENT and three times a new consumer failed to obey it, so it now lives in the data: `parseStatedBands` resolves `effectiveThresholdDirection` at PARSE time and drops the free end — `gte` (a max RATING) → `[lo, ∞)`, `lte`/`fit` (a LIMIT) → `(-∞, hi]`. Only rules where both ends genuinely bind (an exact `identity` like capacitance, or a spec the engine cannot compare at all, like gain) keep a two-sided band. **A consumer can now use a band directly and cannot get it wrong.** Three old tests failed on the fix — each had asserted a two-sided band on a max-rating rule, i.e. **they had pinned the bug** (the same pattern as the deleted `×10` test). Also fixed: the band branch preempted the categorical branch (a package code like `TO-220-3` parses as the "range" 220-to-3 and would have been filtered numerically against a package facet); `sig2` emitted float artifacts straight onto user-visible buttons (`0.7000000000000001`); categorical narrowing options were uncapped. `SEARCH_CACHE_SCHEMA_VERSION` v12 → v13 (v12 pools were fetched under the bad band). 3,134 passing.

## Decision #273 — Automatic maintenance mode when Claude credits run out (July 14, 2026)

> Numbered #273 on the `feat/maintenance-mode` branch (branched from `main`, whose last entry was #270); the parallel `feat/selection-audit` branch had already claimed #271/#272, so this jumped clear to avoid a merge collision. Renumber on merge if needed.

**Problem.** When our Anthropic (Claude) credits are exhausted, the app's AI features fail silently — the chat route errors, the client quietly drops into the no-AI deterministic path, and the user sees **nothing**. It reads as "the app is broken." We want it to read as "the app is briefly down for maintenance, come back soon."

**Decision (per product owner).** Fully **automatic** — no manual switch. The app turns maintenance ON by itself when it detects a genuine out-of-credits error, and turns it OFF by itself once credits are back. Regular users get a **full-screen** friendly "robot power-nap" notice; **admins bypass** it and keep working.

**How it works.**
- **Storage** — three columns on the existing single-row `platform_settings` table (`maintenance_mode`, `maintenance_since`, `maintenance_last_check`) plus **three `SECURITY DEFINER` functions** (`get_maintenance_status`, `set_maintenance_mode`, `claim_maintenance_recovery_check`), granted to `anon` + `authenticated`. Definer functions are load-bearing: `platform_settings` RLS allows SELECT only to `authenticated` and UPDATE only to admins, but the flag must be **read from a public endpoint** (login screen), **written by a regular user** (chat route detecting the error), and **written from an anon endpoint** (recovery). A direct `.update()`/`.select()` in those contexts silently no-ops under RLS ([[silent-update-under-rls]]). SQL: `scripts/supabase-platform-settings-add-maintenance.sql` (run once — single Supabase project = live everywhere).
- **Detection (auto-ON)** — `isOutOfCreditsError(err)` in `lib/services/maintenanceMode.ts` fires ONLY for the credit signature (403 `billing_error`, or 400/403 whose message contains "credit balance"); it returns **false** for 429 rate-limit, 529 overloaded, 500, timeouts, and network errors. This narrowness is the whole safety story under "automatic only" — a transient blip must never black out the app. `maybeEnterMaintenance(err)` is called (fire-and-forget) from the catch blocks of `chat`, `modal-chat`, and `list-chat` routes; the existing `reportServiceFailure`/deterministic-fallback behavior is untouched.
- **Recovery (auto-OFF)** — public `GET /api/maintenance/status` returns `{ maintenance }`. While ON, whichever caller wins the DB-throttled once-a-minute slot (`claim_maintenance_recovery_check`) fires a 1-token Claude "ping" using the **app's own model** (`ANTHROPIC_MODEL || 'claude-sonnet-4-6'`, NOT a hardcoded Haiku — a model the key can't reach would make recovery never succeed). Ping succeeds → clear the flag. Poll-driven, so no cron needed.
- **UI** — `components/MaintenanceGate.tsx` (mounted once in `app/layout.tsx` inside the provider stack) polls the status endpoint every 30s + on focus/visibility; blocks a resolved signed-in non-admin with the full-screen `components/MaintenanceScreen.tsx`; shows admins a small ribbon; passes signed-out/loading through so admins can still reach login. `components/auth/LoginForm.tsx` shows a matching `<Alert>` while keeping the form usable.

**Verification.** `__tests__/services/maintenanceMode.test.ts` pins the classifier (9 cases). Proved not-a-placebo: a naive `status >= 400` implementation fails exactly the 4 transient cases (429/529/generic-400/500). **Lesson: an auto-only kill-switch needs BOTH a surgically narrow trigger (so it can't false-fire) AND a self-healing recovery path (so it can't get stuck on) — either alone is a foot-gun.**

## Decision #274 — Chat‑flow fundamentals: three verified gaps in "name a part → correct answer" and "ambiguous ask → clarify" (July 16, 2026)

**Problem.** Audit of the two most fundamental chat behaviors. Two Explore passes over current `main` found the fundamentals mostly healthy (guided selection is deterministic; common named parts resolve), with **three verified gaps** — each fixed here, each shipped with a guard test proven to FAIL on the pre‑fix code ([[green-test-must-fail-on-broken-code]]).

**Fix 1 (P1) — variant lock‑on: naming a part returned a sample‑kit/variant instead.** `searchParts` ([partDataService.ts](../lib/services/partDataService.ts)) sorted the merged candidate pool by active‑vs‑not only — **no exact‑MPN preference** — so Digikey floating a `…-D-KIT` sample box or a longer ordering variant (`BSS138NH6327XTSA2`) ahead of the bare part made `pickMfrAwareMatch` (`matches[0]`) and the first search card lock onto the wrong row (a kit's category is often unsupported → false "we don't support this"). Fix: extracted `orderSearchCandidates(matches, query)` — **exact‑MPN first, then active‑first** (stable sort preserves source priority within each group). No‑op for descriptive searches (no candidate MPN equals a multi‑word phrase). `SEARCH_CACHE_SCHEMA_VERSION` v15→v16 (a cached MPN lookup carried the pre‑fix order; stale it reads exactly like the fix never shipped).

**Fix 2 (P2) — "I need a relay/thermistor/inductor" didn't ask which kind.** Deterministic disambiguation fired only for four hand‑listed supertypes (regulator/transistor/capacitor/diode). **relay** (F1 EMR vs F2 SSR), **thermistor** (67 NTC vs 68 PTC), and **inductor** (71 power vs 72 RF/signal) each resolved to ONE family via a *bare* subcategory key (`Relay`→F1, …), so `pinFamily` pinned it before disambiguation could run — the opposite of "ambiguous → clarify". Fix ([guidedSelectionController.ts](../lib/services/guidedSelectionController.ts)): added the three heads AND made disambiguation **bare‑aware** and hoisted it **above** `pinFamily`. New `resolveFamilyMatch(text)` ([logicTables/index.ts](../lib/logicTables/index.ts)) exposes *which* subcategory key matched; a head fires only when that key is the **bare** supertype word — so a QUALIFIED name ("solid state relay"→F2, "NTC thermistor"→67, "power inductor"→71) falls through to `pinFamily` unchanged. Provably non‑regressive for the four existing heads (their bare words have no bare key → resolveFamilyMatch null → still ambiguous). Registry‑backed guard (`familiesUnderWord`) pins the three clean two‑way splits so a future family can't silently reopen the gap. **Known limitation (BACKLOG "Over‑disambiguation on qualified non‑key phrasings"):** a qualified sub‑type with no exact subcategory key ("reed relay", "toroidal inductor") now over‑disambiguates — `resolveFamilyMatch` falls back to the bare key, so the message looks bare. Only relay/thermistor/inductor are affected (only they have a bare key); the common keyed forms (signal/power/solid‑state relay, power/RF inductor, NTC/PTC thermistor) pin correctly. It's a redundant question, not a wrong answer; no clean deterministic fix exists (the "reed ⇒ F1" signal needs domain knowledge), so it's deferred.

**Fix 3 (P2) — false "we don't support this part" on some catalogue labels.** The gate is exact‑string on `subcategoryToFamily`, fed by `mapSubcategory`'s output. Running **every covered‑family Digikey leaf** (the app's own param‑coverage + taxonomy maps) through the real mapper + gate found 3 leaves the gate rejected — **2 real production drifts** plus 1 defensive: `Mica and PTFE Capacitors` and `Diode Arrays` (matched no branch → returned verbatim) are the real ones; `Solid State Relays - Industrial Mount` is **defensive** — digikeyParamMap's F2 taxonomy override documents that Digikey's live tree has no such leaf (the real leaf `Solid State Relays (SSR)` already mapped to F2 pre‑fix), so no user ever hit it. Fix ([digikeyMapper.ts](../lib/services/digikeyMapper.ts)): normalize all three to **existing** canonical keys (mica→`Mica Capacitor`; diode arrays→`Rectifier Diode` **B1 base**, so `getLogicTableForSubcategory`'s classifier refines the variant; SSR industrial→plural key, kept consistent for the phantom leaf). The registry‑derived guard's precise guarantee is that **no coverage/taxonomy leaf is falsely REJECTED** (each resolves to SOME supported family) — NOT that each maps to the *right* family: a leaf listed under a family only for param‑coverage can legitimately map elsewhere (family 13's coverage entry `Ceramic Capacitors` → 12/MLCC, correct — mica shares the ceramic param map). The 3 targeted tests assert the *correct* family for the real drifts, and a corpus‑honesty check fails the build if a new registry family isn't wired into the coverage maps. Genuinely‑unsupported categories (Microcontroller, LED, Motor) stay rejected.

> **Deviated from the approved plan on Fix 3 after verifying.** The plan proposed inverting `familyToDigikeyCategories`/`familyTaxonomyOverrides` into a leaf→family gate fallback. Verification killed it: those are **param‑coverage** maps, not classification maps — inverting them routes "Diode Arrays"→B2 (Schottky), **bypassing the base‑family classifier** — and they're keyed on RAW leaves, so they wouldn't even fix the SSR case (the mapper *transforms* that leaf to a non‑key before the gate). Fixing the normalization at the mapper is smaller, safe, and correct. [[verify-dont-reason-technical-plans]] · [[two-lists-will-drift]].

**Verification.** New/extended guards: `multiSourceSearch.test.ts` (`orderSearchCandidates`, 6), `guidedSelectionController.test.ts` (+16), `familySupportGate.test.ts` (13). Each was run against the pre‑fix code (temporary neuter / `git checkout HEAD --` then restore) and the fix‑specific cases failed while preserved‑behavior cases stayed green — the tests genuinely discriminate. No chat‑prompt changes (all three are deterministic‑path fixes), so the Haiku prompt checklist isn't triggered. **Lesson: "does the user name a specific part?" and "which family does this catalogue label belong to?" are both settled on the deterministic path — the LLM never sees these turns — so the fixes are code + tests, not prompt.**

## Decision #275 — Data-source connector abstraction: insulate the matching engine from Digikey (July 18, 2026)

**The business risk.** Losing Digikey API access would be a top-line threat, and the engine was wired *directly* to it — `partDataService.ts` (a ~5,000-line god-module) imported `digikeyClient` and called it from three functions, with no seam to cut along. Ripping Digikey out (or dropping in a replacement source) would have meant surgery across the whole module. This introduces a small typed **data-access layer** so the engine talks to "a catalog provider" instead of "Digikey."

**The design — capability-based providers, data-access ONLY.** A new `lib/services/providers/` layer replaces the half-finished, wrong-altitude `PartDataProvider` in `types.ts` (which bundled `getRecommendations` — scoring/filtering/sorting a swappable *data source* must never own). Three provider kinds — `CatalogProvider` (Digikey full-live, Atlas DB-only), `EnrichmentProvider` (parts.io gap-fill + equivalents), `CommercialProvider` (FindChips) — plus an optional `ParametricCapability` mix-in. Sources are **non-uniform** (Digikey alone has facet/parametric-filter methods), so each advertises `ProviderCapabilities` booleans the orchestrator branches on; the engine only asks a source for what it declares it can do. A provider **fetches and maps one source's data and nothing else** — it never scores, never arbitrates across sources (the fallback ladder + both `seenMpns` merges + all metadata maps + both cache tiers stay in `partDataService`), and **never resolves `mfrOrigin`**. Load-bearing separation: **providers set `dataSource` (provenance); only the orchestrator sets `mfrOrigin`** (Chinese/Western manufacturer identity, via `resolveManufacturerAlias`) — a Chinese maker can arrive via Digikey, so the two must not conflate. Enforced by a test asserting no `providers/*.ts` imports `resolveManufacturerAlias`. Mouser stays a plain helper (not a provider) — its only live use is a pure string helper. `providerRegistry.ts` is the **single control point** (priority-ordered, config/flag-filtered) — written so its source of truth can move from env (today) to a DB/admin table (future no-code connect) without changing any caller.

**Adoption — flag-gated, 6 phases, each proven byte-identical before the next.** Global rule `if (flag) newPath else oldPath` in the same function; every phase deep-equaled (entire returned object incl. `sourcesContributed`/`serviceWarnings`/`dataSource`/`mfrOrigin` + serialized cache payloads) flag-off vs flag-on over a live corpus before the next phase started. Phases: 1 interface+adapters (unused), 2 `getAttributes` ladder (`PROVIDERS_ATTRS`), 3 enrich+commercial (`PROVIDERS_ENRICH`), 4 search fan-out (`PROVIDERS_SEARCH`), 5 recs candidate fetch (`PROVIDERS_RECS`), 6 Digikey-off proof. **All flags are read at call time and are UNSET in production — behavior is unchanged; no cache-version bump (no phase changes shape).** The two parametric-widening islands (`fetchDigikeyCandidates`, `fetchGreenfieldParametricProducts`) stay direct calls this pass (guarded so Digikey-off no-ops) — see Deferred.

**Phase 6 — the Digikey-off kill-switch is ONE gate.** `DIGIKEY_PROVIDER_DISABLED=1` lives inside `isDigikeyConfigured()` (`digikeyClient.ts`) — the single predicate all three entry points + both widening islands already funnel through, plus the provider adapter's `isConfigured()` (so the registry drops Digikey from `catalogProviders()` and returns `null` from `parametricProvider()`) and the `health` + `admin/data-sources` routes. Deliberately **no second registry-only check** that could drift. Read at call time, so toggling needs no restart. This exercises the *capability-absent* path, not just an auth failure. ⚠️ `sourcesContributed` still LISTS `digikey` when disabled — a disabled branch returns a *fulfilled empty* result (same as absent creds); the list means "branch settled," NOT "returned data." The real signal is that no returned PART has `dataSource: 'digikey'`.

**The honest limit (stated in the deliverable).** An abstraction insulates the *code*, not the *capability*. Nothing else on the market supplies live Western parametric facet search, so losing Digikey degrades the product even with a perfect abstraction: broad Western keyword search, facet discovery, and parametric widening are **Lost** with Digikey off (Atlas is Chinese-MFR + substring only); MPN lookup and the cross-ref pool fall back to parts.io→Atlas; commercial (FindChips) is unaffected. Full capability matrix + "how to turn Digikey off" in **[docs/CONNECTOR_ABSTRACTION.md](CONNECTOR_ABSTRACTION.md)**.

**Verification.** Characterization harness `scripts/providers-characterize.ts` (`record`/`diff`/`enrich-ab`/`selftest`); its verdict logic extracted into a pure unit-tested oracle (`scripts/lib/characterizationCore.ts` + `__tests__/scripts/characterizationCore.test.ts`) — proven to FAIL on the old `ok: differing===0` semantics, so a doubly-empty/errored run can no longer read as a false pass. `__tests__/services/providers.test.ts` guards capability flags, registry gating, and the single-gate kill-switch (6 tests proven to fail with the kill-switch removed). The volatile pricing path (Phase 3) uses in-process `enrich-ab` (pins L1 caches so off-vs-on read the same bytes). **parts.io is VPN-gated on the local machine** (reachable in production without VPN); with the VPN on, both parts.io swaps (Phase 3 enrich, Phase 5 equivalents) were verified live and byte-identical with a non-vacuous candidate pool. **All 6 phases verified by execution — no inspection-only gaps.**

**Deferred (own plan + review): parametric-widening convergence.** The widening exists as two divergent copies (`greenfieldParametricFetch.ts`'s `parametricFilterSearchMulti` + `leadingMagnitudeToBaseSI` vs `fetchDigikeyCandidates`'s `parametricFilterSearch` + `extractNumericValue`); converging them onto `ParametricCapability.applyParametricWidening` fixes a latent GHz/THz/negative-band parser bug. It is a *behavior change*, not a byte-identical move, so it is out of scope; the interface seam lands now so it has a clean home (BACKLOG "Parametric-widening convergence", P2).

**Status.** Built on branch `feat/data-source-connector-abstraction`, all phases verified, **merged to `main` July 18, 2026 with every adoption flag OFF** (production behavior unchanged; the seam and the kill-switch are available when needed).

## Decision #276 — Gaia-prefixed params obey the dictionary + accepts like every other param (July 19, 2026)

**The bug (surfaced reviewing low-confidence Triage accepts).** "Gaia" is not a data category — it is a third-party company whose datasheet-extraction pipeline prefixes param names `gaia-<stem>-<Min|Max|Typ|Nom>`. The prefix is **pure provenance**. But the mapper *forked* on it: a `gaia-` param resolved ONLY against the separate gaia stem dictionary (`atlas-gaia-dicts.json`) and `continue`d before the standard-dict lookup — which is exactly where DB dictionary overrides (Triage "Accept") get merged (`loadAndApplyDictOverrides` → `FAMILY_PARAMS`/`L2_PARAMS`). Consequence: **an accepted mapping on a gaia param was inert** — the override row was written but never read. 183 of the user's 2,032 active accepts were gaia-prefixed real mappings (`open_loop_gain→avol`, `id_max`, `ir_leakage`, …) that had had zero effect, and every future gaia accept would too. Verified the other 1,849 non-gaia accepts DID apply.

**The fix (one lookup reorder, two mirrored files).** Give the standard/override lookup (keyed on the FULL lowered raw name, e.g. `gaia-open_loop_gain-min`) PRIORITY over the gaia stem dict, in both [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) (runtime reference — has **zero non-test callers**) and [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) (the ingest/backfill path that actually writes `atlas_products`). Because the 183 overrides are already stored under the full name under their family, they match immediately — **no DB migration, no re-key, no write-path change**. Safe by construction: standard/shared/metadata dicts contain **zero** `gaia-` keys (disjoint keyspaces — machine snake_case-with-prefix vs human names), so the added lookups only ever hit when an override exists; unaccepted gaia params fall through to the stem dict unchanged. The existing `GaiaParamMapping | undefined` type already accepts a plain `AtlasParamMapping` (preferredSuffix optional), so no type change.

**Deliberately NOT: physically merging the two dictionaries into one.** The user's intent ("one dictionary, gaia means nothing") is met *in practice* — overrides now beat gaia defaults exactly like they beat standard defaults. A literal file-merge is bigger, riskier, and would re-key in a way that **breaks** the zero-migration 183 rescue, for no user-visible gain. Deferred.

**De-prefix auto-map is a red herring (measured, not reasoned).** Asked whether stripping the prefix would auto-map the ~12,700 unmapped gaia stems against the *existing* dictionary: **no** — only ~250 at the very most (~5–10% of impact, an optimistic ceiling ignoring family scope), because the datasheet names are machine snake_case never added to the human-name dictionary. The fix makes gaia *obey* the dictionary; it does not *populate* it. Bulk-mapping the long tail stays a separate optional project (BACKLOG).

**Verification (gate: prove before writing anything).** Proof 1 — new [atlasMapper.test.ts](../__tests__/services/atlasMapper.test.ts) cases proven to FAIL on the pre-fix code (override falls to the stem fallback) and PASS after; full suite 3254 green. Proof 2 — scoped **dry-run** backfill of Gainsil (op-amp maker) on real data showed products gaining `avol`/`iq`/`input_noise_voltage` from the accepts, **zero writes**. Then LIVE scoped backfill of the **30 affected MFRs** (only ones carrying an accepted gaia param — provably complete since only the 183 change behavior): ~9,400 products updated, 0 errors, **family-scoped** (a MOSFET got `id_max`, a TVS got `ir_leakage`; no op-amp `avol` leaked onto discretes). `--rescan-unmapped-params` removed 1,334 stale report entries; **0 accepted gaia names remain in the Triage queue** (gaia rows 18,815→18,729; the ~18,700 remainder are un-accepted long tail, untouched by design).

**Status.** Branch `fix/atlas-gaia-override-honoring`, commit `3f83e3b` (code + tests). Data backfilled + queue cleared live (single shared Supabase — live everywhere). Not yet merged to `main`.

## Decision #277 — The Decision Log: an append-only record of every Triage parameter decision (July 20, 2026)

**The reframe (the user's, and it changed the build).** The starting BACKLOG item was "Deferred leaves no trace in the AI Investigation Log," whose cheap fix was to add `'deferred'` to that table's `action_taken` CHECK. The user rejected the framing outright: *"I don't think 'investigations' is the right idea. It's really about what decision was made… An investigation is just an action that generates more information to lead to a decision."* That inverts the model — the decision is the record, the AI verdict is one optional input — and the inversion is what makes the cheap fix insufficient.

**Why a rename would have been worse than nothing (measured).** `atlas_triage_investigations` is written only when the AI Investigate drawer is used. Against live data (July 19): **2,032** active accepted mappings, **65** in the log — **1,967 invisible (97%)** — plus **80** deferred params, **0** logged. A surface *named* "Decision Log" containing 3% of decisions promises a completeness it does not have. So: new append-only table, not a relabel.

**Correction to the premise, found by reading the code.** The schema header on the investigations table claims "every click of Investigate writes a row." That comment is **stale and wrong** — the POST route logs at *decision* time, corroborated by data (0 of 97 rows carry a null `action_taken`). The existing table was already decision-shaped; it was simply blind to every decision not made through the drawer. (I had told the user the wrong thing first and corrected it — the comment, not the code, was the source.)

**Shape: current-state table + event log, deliberately complementary.** `atlas_unmapped_param_notes` stays exactly as it is — it is the fast last-write-wins state driving the ~26k-row Triage queue's filters and counts. `atlas_param_decisions` is added *alongside*; current state is **not** derived from events (that would be a real regression on a queue that already has a scaling item in BACKLOG).

**Append-only is enforced, not documented.** SELECT + INSERT RLS policies only — **no UPDATE, no DELETE**. The absence *is* the guarantee. Undo never edits the original row; it performs the reversal and appends (`mapping_revoked` / `reopened`), so the log reads "Accepted 09:00 → Reverted 09:05."

**One choke point + an anti-drift guard test.** Every decision goes through `recordParamDecision()` ([lib/services/paramDecisionLog.ts](../lib/services/paramDecisionLog.ts)). The original failure was structural — nothing *failed* when a route logged nothing — so a comment saying "remember to log" is not a control; [the guard test](../__tests__/services/paramDecisionLog.test.ts) enumerates the six decision-writing routes and goes red if any stops calling the helper, plus an **inverse** guard that `triage-investigations` POST does *not* (the client calls it alongside the real mutation; logging in both places would double-count, permanently).

**Backfill: `is_active=false` does NOT mean "revoked."** The plan's first draft said emit `mapping_revoked` for every deactivated override. Measured: of **218** inactive rows, **209** were superseded by a newer active row (an **edit**) and only **9** were genuinely revoked — independently corroborated by the Triage page's own "REVERTED 9" chip. Shipping the draft would have opened the log announcing 218 revocations that never happened: fabricated history, in the feature built to prevent it. The risky logic lives in a pure, unit-tested module ([paramDecisionBackfill.ts](../lib/services/paramDecisionBackfill.ts)); the script is **TypeScript so it imports the tested code** rather than mirroring it into `.mjs` (this repo has been bitten by mirror drift). 2,631 rows reconstructed, all tagged `source='backfill'` and shown as *reconstructed*, never as observed.

**What is NOT recoverable, stated in the UI.** The notes table is one mutable row per param. A param deferred → reopened → deferred yields exactly ONE backfilled row: its final state. Every intermediate transition is permanently gone, and the panel says so on `backfill` rows rather than implying precision it lacks.

**Two review rounds, 20 findings, and the pattern in them.** Round 1 (10) included revokes dated at their own creation instant — up to 18 days off, from a documented `updated_at` fallback that was never implemented — and a reverted-unmappable recorded as `confirmed_in_family` (the only row of that type in the log, 100% fabricated). Round 2 (10) was mostly **the same defect in sibling paths an earlier fix had not swept**: three separate routes could log a decision that had not actually happened (repeat DELETE appending duplicate permanent revokes; status-undo appending `reopened` off an unchecked write; batch accept recording every write as a fresh accept when it had replaced a live mapping). The log's one true blind spot was **erasing an engineer's note**, which both notes handlers dropped because each guarded on the *new* note being non-empty — fixed with a `note_cleared` type and by lifting the rule out of the two routes into `decisionForNoteWrite()`, since the duplicated copies had already diverged.

**Verification.** Every fix has a test proven to fail on the pre-fix source — route guards checked by stashing the routes (8 red, control green), the note-clear cases against verbatim copies of both old inline rules (both returned `null` where the fix returns `note_cleared`). Grouping assumptions were **measured, not assumed**: under the route's ordering, batch rows are contiguous (7 batches in the newest 200, none fragmented), one batch holds **55** rows against a 50-row page (so the straddle case is real and the group reports its TRUE size), and **31** timestamps in 200 rows are shared — which is why the `id` tiebreak on the sort is load-bearing, not decoration. Suite 3,310 green; production build clean.

**Status.** Branch `feat/param-decision-log`. Schema applied live. Investigation Log retired (`?section=atlas-ai-log` redirects); `AtlasAiLogPanel.tsx` still on disk pending the user's first look at the new panel.

---

### Round 3, and the diagnosis that changed what got built (July 20, 2026)

A third review found **12 more** defects, all in the panel — the one layer I had shipped without ever loading. That is 32 across three rounds, every one found by *review*, none by a test. The user's response reframed the work: *"I have no idea how to trust any of the work you've done… parameter mappings are crucial for the working of this product."*

**The diagnosis is structural, not "be more careful."** This repo had 1,631 tests and **not one executed an API route** — while every write to a parameter mapping happens in a route. The tests proved the pure calculations right and said nothing about whether accepting a mapping writes the right row, or whether that row is ever read back.

**Two facts established before writing anything**, so the scope was the real problem and not the visible one:
- **The live mapping path was untouched by the branch.** `atlasMapper.ts`, `atlas-ingest.mjs`, `atlasDictOverrides.ts`, `matchingEngine.ts`, `partDataService.ts` byte-identical to `main`.
- **A larger, older hole:** `atlasMapper.ts` had a thorough suite for `mapAtlasModel()` — a function with **no runtime callers** — while `mapModel()` in `atlas-ingest.mjs`, which actually applies accepted mappings during ingest, was guarded by two regexes checking that certain text appears in the file. A tested dead function beside an untested live one is worse than testing neither: it reads as coverage.

**What was built.** A route-test harness in `__tests__/helpers/` (stateful Supabase mock supporting *writes* — the four pre-existing mocks are read-only — plus an auth-guard stub and a handler invoker), **zero new dependencies**, then suites over the five mapping-write routes, the override read layer, and the real ingest mapper. Suite 1,631 → 3,477.

**Every suite proven by mutation, not by going green.** The source is broken one line at a time and the suite must catch it: **undo 12/12 · batch 14/14 · accept 16/16 · notes 13/13 · read layer 12/12 · mapper 7/7 · entrypoint guard 3/4**. Mutation kept finding what review had not:
- Two contracts `paramDecisionLog` states in prose that nothing enforced — it chunks inserts at 500 so one rejected request cannot lose a whole batch's trail, and it never throws so a logging hiccup cannot turn a successful mapping write into a 500. Breaking either left all 58 tests green.
- Nothing asserted the `is_active` filter on the override read, because the stub ignored it — a *revoked* mapping coming back to life, the mirror of an accepted one never applying.
- Two survivors on the mapper were **fixture gaps, not test gaps**: nothing exercised the #175 reclassification loop or the gaia path. Real models were found for each (CT815 reclassifies E1→B6).

**One survivor was left standing on purpose, then killed by a better assertion.** Deleting the accept route's insert-error check still returns 500 — the route falls through to a null dereference and the outer catch produces 500 anyway. A status-only assertion cannot tell a handled failure from a crash. Tightening it to the message the operator actually sees (`Failed to create dictionary override`) caught it.

**The CLI became importable under a byte-identical gate.** ~10 lines of entrypoint guard; `--report --dry-run` and the no-argument usage output verified identical before and after across stdout, stderr and exit code.

**TWO REAL FINDINGS, recorded in [BACKLOG](BACKLOG.md) rather than fixed here** — changing mapper output deserves its own before/after:
1. **The override-merge rule exists twice and the copies disagree on 5 of 10 shapes** (a dropped unit on MODIFY; a non-canonical name becoming a *second* entry rather than overwriting). Measured against the live table: **not firing today** — 2,032 active overrides, all `add`, all canonical — so it is a landmine, not a fault. Both the agreement and the divergence are pinned.
2. **`"–55 to 125 ℃"` yields `numericValue: NaN`, not `null`** (3 in 365,726 mapped params). Found *only* because the golden file encodes `NaN` — `JSON.stringify(NaN)` is `null`, so a plain dump would have recorded the bug as normal. Worse than null in process: `typeof NaN === 'number'`, so "do we have a number?" says yes while every comparison is false.

**What tests structurally cannot cover** is written down and handed over, not glossed: real-database behaviour (unique indexes, RLS, the 1000-row cap, Postgres collation), concurrency, and rendering. [docs/QA_PARAM_MAPPING.md](QA_PARAM_MAPPING.md) is the permanent coverage for that — nine scenarios in plain language, every step carrying an exact expected number and a specific *FAILS IF*. Every command in it was **verified by running it**, which corrected two things written from reading the code alone: `--mfr` matches a substring of the *source file name*, not a slug; and the rescan is currently clean (`0 batches / 0 stale`), so its key signal is 0 → non-zero rather than a small delta.

**The honest limit.** A green suite here is not a promise the write survives real Postgres, and the mock's header says so explicitly. Two of my own mistakes in this round were caught by mutation rather than by review — a child-process guard test that passed its flag where `argv.slice(2)` never saw it, and a mutation harness that reported "survived" for a mutation that had killed the jest run outright.

---

## Decision #278 — A parameter value is never discarded: accepting a mapping must not delete data (July 21, 2026)

**The bug, found by hand and not by any test.** Accepting a mapping in Triage could **delete product data**. Good-Ark's source file ships `Rdson@ 10V(mΩ) Typ` at column 7 and `Rdson@ 10V(mΩ) Max` at column 8. Both point at `rds_on`. The mapper takes the first and drops the rest — so accepting the *Max* spelling silently removed the Max value (6.0) from all 44 parts, and left `rds_on` holding a **typical** number on a **weight-9 threshold rule**. Nothing errored. The panel looked fine. The value was simply gone.

This surfaced during the manual QA run of [docs/QA_PARAM_MAPPING.md](QA_PARAM_MAPPING.md) (Decision #277), not from the 3,477-test suite — a reminder of what the checklist is *for*. It was diagnosed, the 44 parts were restored, and the restore was verified against four predictions made **before** running it.

### The scale, measured rather than estimated

The real mapper was instrumented and run over **all 429 files in `data/atlas/` (437,093 products) with the live 2,033 dictionary overrides loaded** — not over fixtures, and not with an empty dictionary (`--report --dry-run` loads zero overrides and would have understated it badly).

| Discard site | Values | Notes |
| --- | --- | --- |
| Mapped loser (two spellings, one slot) | 225,902 | **195,886 (86.7%) carried a value the winner did not have** |
| Unmapped, empty key | 251,643 | pure-Chinese name → key `''` → value binned |
| Unmapped, key collision | 7,062 | |
| Gaia stem collision | 80,228 | `…-Min`/`-Max`/`-Typ` all reduce to one stem |
| **Total no longer deleted** | **534,819** | ~1.2 values per product |

The second leak was **larger than the one we set out to fix** and was found only by measuring the fix: the storage key is built by discarding every non-English character, so `额定线圈功率` (rated coil power, 14,198 occurrences), `工作电压` (operating voltage), `额定电压` and `触点电流` slugged to the empty string and were dropped outright. Those params also reached Triage carrying an **empty `attributeId`**.

### The fix — Layer 1 of three

One `storeRawValue()` choke point per copy keeps a displaced value under its raw parameter name, exactly where an unmapped param already goes. **No domain judgement is involved** — keeping beats binning — raw ids appear in no logic table so scoring is untouched, and rescued values are deliberately **not** pushed into Triage (they are mapped, just displaced; ~196k entries would bury the genuine gaps).

Three load-bearing details:

1. **The key keeps Unicode letters and digits.** An ASCII-only rule is exactly what dropped the 251,643, and the stored key *is* the display name (`fromParametersJsonb` humanizes it).
2. **Identical values are still dropped** (30,016 — nothing to preserve). The comparison is deliberately **conservative**: a false "differs" keeps a redundant copy, a false "same" deletes data.
3. **Colliding keys are suffixed, never overwritten.** `MAX_LOSER_SUFFIX = 200` is a runaway guard, **not a data cap** — a bound of 20 dropped 1,530 real values. Do not tighten it casually.

**Existing keys do not change.** The first occurrence keeps its historical id, so no ingested row re-keys; only previously-deleted values gain new numbered keys. Verified in the golden diff.

### Both copies, pinned against each other

`mapModel()` in `scripts/atlas-ingest.mjs` is the **live ingest path**; `mapAtlasModel()` in `lib/services/atlasMapper.ts` backs the admin surfaces. A "keep in lockstep" comment is **not a mechanism** — the override-merge pair already diverges on 5 of 10 shapes (BACKLOG). The parity block in `__tests__/services/atlasLayer1KeepLoser.test.ts` is the mechanism.

### Verification

- **Mutation score 18/18** across both copies. The first run scored 15/18; all three survivors were **fixture gaps, not test gaps** — no case exercised the gaia *dedup* branch (distinct from the preferredSuffix branch) or the unmapped-gaia stem collision. Both added; the fix was to go find real colliding dictionary spellings, not to weaken a test.
- Full suite 3,511 pass / 94 suites; lint 86 and type 92 both unchanged.
- CLI usage output byte-identical including exit code, with the revert **proven to land** before believing the comparison.
- Golden regenerated and the diff **read**: 132 → 221 parameters, 89 additions, zero real removals — every `-` line is an empty `attributeId` or a key superseded by a numbered sibling.

### What this does NOT fix — and the finding that came free

Layer 1 stops a wrong mapping *destroying* the correct value. It does not make the mapping right. Instrumenting the corpus exposed that **some accepted mappings are semantically wrong**, and dedup had been hiding them — the wrong mapping won the slot and the correct value was deleted, so nothing looked broken:

| Slot | Losing params routed into it |
| --- | --- |
| `color` | 功率 (power), 峰值波长 (peak wavelength) — 11,826, 100% differing |
| `supply_voltage` | `gaia-current_consumption-Max`, `gaia-idd-Max` — a *current* in a *voltage* slot |
| `contact_rating` | `gaia-contact_resistance`, `-Max` — resistance in a rating slot |
| `vrwm` | 电源电压 (supply voltage) |
| `tolerance` | 温度系数Tf (temperature coefficient) — visible in the golden fixture |

These need engineering judgement to resolve and are in BACKLOG, not fixed here.

**Layers 2 and 3 remain deferred**, with their cost stated: `rds_on` still holds *typical* values where *maximum* was available (Layer 2 — conservative pick by `thresholdDirection`), and the underlying problem is that `Rdson@10V` and `Rdson@4.5V` are genuinely *different attributes* that the schema has no way to distinguish (Layer 3 — condition-qualified attributes; the rds_on rule's own `engineeringReason` says "a comparison is ONLY VALID if the drive voltage matches").

**Accepted consequence.** Where a vendor repeats one column name — one file carries 20 columns named `gaia-reflow_zone_temperature-Typical` holding 135…215 °C — all 20 now survive as numbered siblings. Previously 19 were deleted and the first was presented as *the* reflow temperature, which was a false claim. The extras list is longer; nothing else in the product is affected. The real fix is for extraction to carry the test condition (BACKLOG).

---

## Decision #279 — Four defects that let unvetted or mis-scaled numbers reach the matching engine (July 21, 2026)

Decision #278's docblock claimed *"raw ids appear in no logic table, so scoring is untouched."* That was **false**, and re-verifying it before starting the fix work turned up three more problems. All four are fixed together because one re-import repairs all of them, and doing it twice is the expensive part.

### What was measured (live database, 106,000 products = 24.3% of the corpus)

Every value sitting in a scoring slot was re-derived from its own string and compared against what was stored:

| | count | meaning |
| --- | --- | --- |
| values in a scoring slot holding the WRONG number | **6,958 (1.43%)** across 45 attributeIds | scoring is wrong |
| values whose DISPLAY disagrees with the scored number | 505 (0.10%) across 30 attributeIds | scoring is right, the spec on screen is wrong — **deferred** |

Worst case, `rds_on` — the heaviest rule B5 has (weight 9, `lte`) — appeared **1,777 times** in the sample holding `"80mΩ@10V"` as **80**, not 0.08.

**End-to-end demonstration** (not inference — every link was also read in code): against a source part at 100 mΩ, a genuinely *better* candidate at 80 mΩ scored `fail` with a hard failure at 89%; after the fix it scores `pass`, rated **better**, at 94%. Good Chinese parts were being rejected on the strength of a unit conversion that never happened.

### The four defects

**1 — A raw value could occupy a real scoring slot.** `rawIdForParam` joins on underscores, so an unmapped supplier column `"RDS(on)"` slugs to exactly `rds_on`, and `matchingEngine.ts:23` returns a stored `numericValue` verbatim with no re-parse. **Two different routes reach the same slot**: the Unicode-preserving key for an ASCII name, and the *historical ASCII slug* (passed as `preferredId`) for a Chinese one — 导通电阻(RDS(on)) reduces to `rds_on` because every CJK character becomes a separator and is then stripped. The guard therefore sits inside `storeRawValue`, below both, escaping any reserved id to `raw_<id>`.

`RESERVED_ATTRIBUTE_IDS` (434 ids / 43 families) is computed from the registry in TS and **generated** into `lib/services/atlas-reserved-attribute-ids.json` for `scripts/atlas-ingest.mjs`, which cannot import TS. A test pins the file against the live registry, so adding a family and forgetting `npm run atlas:reserved-ids` fails the build.

**Measured cost, not assumed:** the guard demotes ~8,640 values per 67,000 products (~56,000 corpus-wide) out of scoring slots, including some that were correct by luck (`"Channel type" = "N"`). Accepted because (a) nothing can distinguish a lucky-correct raw value from `"NA"` or a scale-ambiguous bare `"5"` — all three bypassed the dictionary; (b) a missing value scores `review`, which is flagged for a human, whereas a wrong value is silently wrong; and (c) **verified**: these params were already reported as unmapped and already in the Triage queue, so the engineer's workload does not change — only where the value is stored.

**2 — Rescued values skipped unit normalization.** `storeRawValue` used the bare `extractNumeric` while every winner path used `applyUnitPrefix`. This is what turned `"80mΩ@10V"` into 80.

**3 — The rescue still deleted data.** `keepLosingValue` compared the loser's RAW string against the winner's *stored* string, which has been through `parseGaiaValue` / `normalizeTemperatureRange` / `normalizeVoltageRange`. `"<30 V"` is stored as `"30"`, so a genuinely different loser reading `"30"` was judged identical and dropped — exactly what the comment above it warned about. Fixed by recording each winner's raw source string (`rawByAttributeId`) and comparing raw-against-raw. Comparing two *normalized* forms would have been the wrong direction: it widens "identical" and deletes more.

**4 — SI prefixes written in the wrong case were silently ignored** (new, found during verification). `applyUnitPrefix` tested `unit.startsWith('p')` — lowercase only. Reproduced on real data: `data/atlas/mfr_389_AK_奥科_params.json`, model AK4080, ships `"4010 PF"` and stored 4010 instead of 4.01e-9, while `"6.5 mΩ"` on the *same product* converted correctly.

⚠️ **The obvious fix is destructive.** Measured over all 429 files, case-folding the first letter would newly "convert" **14,840** values reading `Pin` (pin count), 39,645 `P`, 7,106 `N` and 342 `Nm` (newton-metre). Only ~2,100 of ~29,600 case-mismatched tokens are genuine prefixes — **the lowercase-only rule was protecting the other 27,000**. So a prefix applies only when the *remainder* is exactly a known unit atom. Verified corpus-wide: converts 2,086 values (PF/UA/PA/Ps/Us), leaves 661,728 untouched including `MΩ` (9,038) and `MHz` (14,681).

`N` and `M` are deliberately excluded — `Nm` outnumbers `Ns` ~85:1 with no lexical rule to separate them, and `M` already means mega. **`splitUnit` from `mappingHealthCore.ts` was NOT reused**: its `UNIT_ATOMS` contains `['m', 'length']` because a *classifier* wants breadth, and that entry alone would silently convert every newton-metre. A converter needs a narrow list.

### Blocker 3 — an undo could diverge from its own audit log

The undo route deactivated overrides and appended `mapping_revoked` rows as two writes with no transaction, returning `success: true` regardless. On an append failure the mappings were OFF, nothing recorded why, and a retry said "already inactive" (`.eq('is_active', true)` matches nothing the second time) — unrepairable, because the table has no UPDATE and no DELETE policy. Now a **compensating rollback** re-activates exactly what the request deactivated and reports the failure; if the rollback itself fails it says so and names how many are stranded.

**This reverses a documented decision.** The existing test asserted the opposite in so many words ("recordParamDecisions is non-fatal by design, so the undo itself stands"). The suite's own stated invariant settles it: *the log must never claim a transition that did not happen* — and its converse binds equally.

Same pass: `dictionaries/batch/undo` used the RLS-subject cookie client while its sibling used the service client. A policy-filtered UPDATE **does not error** — it returns `{ data: [], error: null }`, indistinguishable from "nothing needed undoing" — so it reported successful undos that changed nothing.

### Two lessons worth more than the fixes

**A test that passes against the broken code is worse than no test.** Two of the suites written here were vacuous on the first attempt and only mutation testing exposed them:
- The Blocker 2 cases used a Typ/Max pair on ONE stem, which routes through the `preferredSuffix` branch *before* a winner exists and never reaches the comparison. The case needs two **different** stems sharing an attributeId.
- The parity block compared **value sets** only. When a normalized winner (`"<30 V"` → `"30"`) and a rescued loser (`"30"`) carry the same string, the value set is identical whether the loser was preserved or deleted — only the KEYS differ. It now compares keys.
- The client-swap test mocked both Supabase clients to one instance. `supabaseMock` deliberately does not model RLS, so the two were **indistinguishable** and the test passed whichever client the route picked. The cookie client is now modelled by its real signature: empty result, no error.

**The golden fixture was blind to a whole defect class.** A change affecting 2,086 values produced an *empty* golden diff, because none of the 8 fixture models carried a capital-cased unit. The real AK4080 model was added. Every subsequent golden diff was read, not rubber-stamped — Blocker 1's 32 changes are all corrections (20 → 2e-11 pF, 82.4 → 0.0824 mΩ, 275 → 275000 kHz→Hz).

### Not in this batch

The 505 display/scoring mismatches (scoring is already correct); the Mapping Health detector's accuracy fixes and the 32/1/46 worksheet; and Layer 2, the typical-vs-maximum problem — confirmed again here, a source shipping `_Typ 2.1` and `_Max 2.8` stores **2.1**.

## Decision #280 — Fix the mis-scaled numbers only; withdraw the reserved-id renaming (July 21, 2026)

**Supersedes the storage half of Decision #279.** A max-effort review of #279 returned 15
findings and a `DO NOT MERGE OR BACKFILL` hold. This decision keeps #279's *correct* half — the
scale fix — and **withdraws the rename**.

### What was wrong with #279

#279 solved two problems at once and only one of them was real. Alongside the scale fix it moved
unvetted values to a new key (`rds_on` → `raw_rds_on`). But the key **is** a storage contract:
four consumers find values by it — the Specs panel (`fromParametersJsonb`), the coverage RPC, the
widening RPC (in SQL, where `raw_` has no meaning) and the reclassify RPC. Only two were updated.
The rename also freed the old slot, so a *different* measurement could occupy it — verified live
on YANGJIE/FRD60A600AS-290A, where the vendor's own `VRRM = 600` was displaced by a dict-mapped
`VR (V) = 630`.

Measured, HEAD-vs-baseline over all 429 files / 437,387 products: the rename changed **14,110 key
names across 6,559 products (16%)**. It also demoted CATEGORICAL values (`channel_type = "N"`),
which makes matching *more* permissive, not safer — a missing value scores `review` = 50% credit
that never fails, so an N-channel source could surface P-channel replacements.

An `unvetted: true` annotation was designed as the replacement and **also rejected**, on two
verified grounds: (1) `fromParametersJsonb` (`atlasMapper.ts:4026-4035`) builds its output as an
explicit field-by-field literal, so an added field is silently dropped and the flag never reaches
the engine; (2) probing the YANGJIE case showed the mapped write at `:3012` is an *unconditional*
overwrite, so a naive annotation would have **destroyed** the 600 that HEAD at least preserved.

### What ships

ONE change, in `storeRawValue` (the rescued path) in both mapper copies: replace bare
`extractNumeric` with `rescueNumericValue`, which scales the number **only** when its unit is on a
conservative allowlist — `{p n u µ m k K M G} × {F A V W H Hz s Ω J C S}`, minus `MS`/`KS`, 97
tokens — shared verbatim via `lib/services/atlas-rescue-units.json`.

**The allowlist IS the safety property, not an implementation detail.** Both "proper" fixes were
measured and rejected: a first-letter rule reads `ppm` as pico (11,122 values) and `pcs` as pico
(11,254); a strict whole-token rule instead BREAKS `PF` (1,989), `nV/√Hz` (474), `mW/sr` (391),
`Mbit` (431), `Kbyte` (372). There are **367 distinct unit spellings** in this corpus — recognising
them all is its own project. An unrecognised token therefore keeps today's value **exactly**, so
this change can only make a number more correct or leave it alone; it can never introduce a wrong
one. Uppercase `P`/`U`/`N` are deliberately absent for the same reason (enabling `PF` generatively
also enables `UV` and `PW`).

**Scope: the rescued path only.** The dictionary-mapped paths already normalise and are untouched
— applying this table there would REMOVE conversions that work today.

### Verified by execution — full corpus, 429 files, 437,387 products

| Gate | Result |
| --- | --- |
| Key names added / removed | **0 / 0** |
| Display strings changed | **0** |
| Numbers lost | **0** |
| Conversions on a non-unit token (`ppm`, `pcs`, `mil`, `Max`…) | **0** |
| **Numbers corrected** | **153,993** — **50,521** in scoring slots, across **69,639 products** |

Headline, confirmed end-to-end: Siliup/SP40N25TQ ships `导通电阻(RDS(on)) = "80mΩ@10V"`, which
slugs onto `rds_on` (weight 9, `lte`) and which `matchingEngine.ts:23` returns **verbatim** with no
re-parse and no unit check. Stored as `80`, a genuinely better 80 mΩ candidate hard-*failed*
against a 100 mΩ source. Now stored as `0.08`.

Mutation-tested to the bar (`[[green-test-must-fail-on-broken-code]]`): 8 mutations, all caught.
⚠️ One survived first time and the test was rewritten — the exclusion-list test *iterated*
`SHARED.excluded`, so DELETING an entry made it check one fewer thing and still pass. Excluded
tokens are now named explicitly. **A test whose coverage is defined by the data it tests cannot
fail when that data shrinks.**

### Withdrawn from #279

The reserved-id guard, `atlas-reserved-attribute-ids.json`, its generator and npm script, and
`readSlot` (which existed only to compensate for the rename) are all removed. Also parked, both
independent of the bug: #279's raw-vs-raw comparison (measured: changes 78 keys) and its
uppercase-prefix work (touches the mapped paths; its rule was generative — 18 combinations
enabled, 5 measured).

### The undo route

`dictionaries/batch/undo` keeps its service-client swap — under the RLS-subject client a
policy-filtered UPDATE returns `{data: [], error: null}`, success-shaped and empty, so the route
reported a successful undo that changed nothing. `param-decisions/undo` keeps its `override_id`
dedupe but **loses its compensating rollback**, which made the worst case unrecoverable rather
than merely bad: `recordParamDecisions` inserts in chunks of 500 and returns false if any chunk
fails *while earlier chunks stay committed*, so the rollback reactivated mappings the append-only
log already, permanently, described as revoked. It also restored only
`atlas_dictionary_overrides`, never the `atlas_unmapped_param_notes` writes, while telling the user
"nothing was changed". The reversal now stands and the failure is reported — `buildUndoMessage`
already appends "The log entry for this undo could not be written" and flips the alert to a
warning. The real fix is atomicity (one `SECURITY DEFINER` function), in BACKLOG.

### Found while verifying — NOT fixed here

`extractNumericWithPrefix`'s unit character class accepts the MICRO SIGN (U+00B5) but not GREEK
SMALL LETTER MU (U+03BC). Measured: **36,554 values use Greek mu — nearly 3× the 13,380 that use
the micro sign** — and they yield NO parsed unit at all, on *every* path. `"800μA"` stores **800**,
not 0.0008. `applyUnitPrefix` even has a U+03BC branch that can never fire. Same class as the bug
above and larger in reach, but fixing it changes the dictionary-mapped paths, so it is logged in
BACKLOG rather than folded in here.

### Post-merge review of #280 — five fixes, one of them a bug this change introduced (July 21, 2026)

A max-effort review (10 angles, every finding reproduced against the real 429-file corpus)
returned 15 findings. **One was a new data bug; four were cheap fixes mis-triaged as "log it".**

**⚠️ THE HEADLINE: the allowlist's safety property was FALSE.** #280 asserted, in five places,
that an unrecognised token keeps its value so the change "can never introduce a wrong one".
The prefix×atom cross generates `Gs` — which in this corpus is **GAUSS**, not giga-second — so
**229 real values** on Hall-effect sensors (HXYMOS `磁工作点`, Dowaytech `工作磁场范围`,
ElecSuper) were multiplied by 1e9: `"70 Gs"` stored as 70,000,000,000.

Two process failures made it invisible, and both are now closed:

1. **The four corpus gates cannot detect this class by construction.** They count keys added /
   removed / display strings changed / numbers lost. A newly-WRONG number and a newly-RIGHT one
   are indistinguishable — both register as "corrected". *The gates measure change, not
   correctness.*
2. **The audit checked the wrong tokens.** The exclusion list guarded `MS`/`KS`, which occur
   **zero** times in the corpus, while the collision that occurs **229** times was never looked
   at. Hypothetical collisions were reasoned about; real ones were not measured.

**The fix for the process, not just the data:** a test now enumerates *every allowlisted token
that actually occurs in `data/atlas/*.json`* and fails on any that has not been explicitly
acknowledged. Adding an atom widens the cross by 9 tokens, a prefix by 11 — neither is a
one-line change any more. That audit immediately surfaced `MW` (`insulation_resistance =
"100 MW"`), which turned out to be 100 **MEGAOHM** with Ω mangled to W by an encoding fault —
harmless, since mega is mega either way, and now recorded so nobody re-litigates it.

**Exact scaling — `evaluateThreshold` has no epsilon.** `9 * 1e-3` is `0.009000000000000001`;
a source `rds_on` of `"0.009 Ω"` against a candidate `"9mΩ"` — the same resistance — returned a
**hard FAIL**, and PASSED when the sides were swapped. Fixed by shifting the DECIMAL
(`Number("244.6e-3")`) rather than doing float arithmetic. Measured over 339,490 real
conversions: **multiply 20.43% inexact, divide 2.49%, decimal shift 0.00%.** Division was tried
first and rejected on evidence — the golden diff caught it regressing `0.2446`.

**The new suite tested the wrong copy.** `rescueNumericValue` / the allowlist were not exported
from `scripts/atlas-ingest.mjs`, so all 25 assertions ran against `atlasMapper.ts`, *the copy
with no runtime callers*. Deleting the exclusion loop from the LIVE file kept the suite green.
Both are now exported for the parity test, every allowlist assertion runs through **both**
copies via `describe.each`, and that mutation now fails 6 tests. Mutation-verified: live-copy
exclusion delete (6 fails), float regression (13), gauss un-exclusion (7, incl. the corpus
audit), wiring revert (2).

**Kill switch.** `rescueNumericValue` ignored `APPLY_UNIT_PREFIX_TO_NUMERIC`, so flipping the
documented rollback would have left dict-mapped values at display scale beside rescued values
at base SI — two conventions in one product, worse than either setting. Verified by flipping it.

**Cache versions.** `RECS_CACHE_SCHEMA_VERSION` v20→v21 and `BASE_RECS_SCHEMA_VERSION` v6→v7.
The base-cache's own history records the precedent verbatim from Decision #217. Without it the
30-day caches would keep serving scores from old wrong-scale numbers after the backfill —
reading exactly like "the fix didn't work".

**Final measured state**, full corpus (429 files / 437,387 products): keys added **0**, keys
removed **0**, display strings changed **0**, numbers lost **0**, junk-token conversions **0**;
**153,993 numbers corrected**, **50,521** in scoring slots, across **69,639 products**. The
count fell by exactly 229 from #280's figure — the gauss values, a clean cross-check.

### Follow-up applied — Greek mu (U+03BC), same day

A sibling bug of the same shape shipped hours later on branch `fix/greek-mu-unit-parser`:
`extractNumericWithPrefix` accepted the MICRO SIGN (U+00B5) but not GREEK SMALL LETTER MU (U+03BC),
so `"800μA"` stored 800 amps. Fix = Greek mu into the 8 character classes (4 per mapper copy) AND
into the shared rescue allowlist (`applyUnitPrefix` already handled both; the allowlist did not —
widening the regex alone would parse the unit then decline to scale it).

Backfill applied 22 July 2026: `Scanned 437093 / Changed 7439 / Errors 0` — matching the dry-run
prediction exactly (Sunlord left reverted after the rehearsal to keep the number checkable).
Verified five ways: DB-vs-backup **7,419** differing (= prediction; the 20 fewer than 7,439 are the
null-vs-NaN churn); second dry run **43** still-changing (the identical null-vs-NaN set, so no mu
value stuck); **1,730** corrected values re-read by an independent SI parser with **0**
disagreements; and the real engine taking a 1.8 µH inductor from **FAIL to PASS** (88%→97%) against
the Sunlord part that had been stored as 1.8 nH. 11,223 numbers corrected; gates all 0. Sibling
parsers with the same latent gap (`matchingEngine.applyPrefix`, `recommendationFilter`,
`digikeyMapper`) are logged in BACKLOG — none exercised by the backfill.

### Applied to the database — July 22, 2026

`Scanned 437093 / Changed 52997 / Unchanged 363825 / Missing 20271 / Errors 0`. Siliup/SP40N25TQ
`rds_on` now stores **0.08**; the display string `"80mΩ@10V"` is byte-identical.

**Rehearsed before the full run.** The restore path had never written anything — it had only ever
reported "0 differences," which proves it runs, not that it works. So the whole round trip was
run on one manufacturer first: apply (729 changed, 0 errors) → backup detects (**729**) → restore
(**729**, 0 failures) → verify (**0** differing). Siliup was then deliberately left reverted so the
full run's predicted 52,997 stayed a checkable number rather than an assertion. It matched exactly.

**The four corpus gates were re-run against the DATABASE, not just source-vs-source.** #280's gates
compared HEAD's mapper output to baseline's; that says nothing about what a write would do to rows
accumulated over many past ingests under different dictionary states. A value-level audit over all
416,822 stored products returned keys added **0**, keys removed **0**, display strings changed **0**,
numbers lost **0**, extraction/manual entries dropped **0**, with 104,445 numbers corrected — every
ratio a clean power of ten matching the unit in its own value string.

⚠️ **A harness that imports this mapper inherits none of the CLI's startup state, and every omission
looks like a data finding rather than a crash.** The dispatcher runs THREE initializers before any
mapping. Skipping `loadAndApplyDictOverrides` made 2,033 accepted mappings vanish, so every
override-mapped key read as a rename (`id_max` → `id`) — a scoring regression that did not exist.
Skipping `loadCollidingEnNames` shortened "HX 红星" to "HX", so 3,289 products across the Decision
#225 collision manufacturers matched no DB row at all. Both were reported as findings before being
recognised as instrument error. They are now exported as one commented set for that reason.

**52,997 written vs 52,992 actually changed — the gap is now measured, not accepted.** Those 5
products carry a field where the mapper emits `NaN`; JSON serialises it to `null`; stored null never
equals in-memory NaN, so they are rewritten on every run while their stored content never changes.
The same cause leaves **43 products permanently "would change"** on a follow-up dry run (ETA 21,
COSINE 14, Geehy 5, MXChip 3 — `supply_voltage`, `operating_temp`, `storage_temperature_range`).
Pre-existing, no data impact, logged in BACKLOG. **A non-zero dry run here is not evidence of a
failed backfill** until the reason is shown to be something other than null-vs-NaN.

**Verified by an independently-written parser.** 15,104 corrected values were re-read by a
from-scratch SI table rather than by `rescueNumericValue`, because reusing the source would only
prove the code agrees with itself. **0 disagreements.**

**Left open, logged not fixed:** the stale CLAUDE.md KEY-parity claim; the deleted
`applyUnitPrefix` TS↔.mjs parity block and `cased_unit_prefixes` golden fixture; the BACKLOG
section still listing withdrawn mechanisms as FIXED; the 34,425 unvetted values in scoring
slots; an epsilon for `evaluateThreshold`; the Greek-mu entry (overstated 2.6× — real figure
**14,057**, and Decision #217 already fixed the handler in June).
