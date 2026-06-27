# Backlog

Known gaps, incomplete features, and inconsistencies found during project audit (Feb 2026).

---

## Double FindChips fetch per single-part recs load (follow-up to Decisions #252 / #254) (P3)

**Context.** Surfaced in the PR #10 review. On a single-part load that carries deferred parts.io enrichment, `triggerFCEnrichment` fires **twice**: once in `showRecsAndDeferAssessment` ([hooks/useAppState.ts](../hooks/useAppState.ts) ~line 755) on the initial Digikey-scored recs, then again in the `triggerPartsioEnrichment` tail after the parts.io rescore **replaces** `allRecommendations` with FC-less recs (discarding the first merge). This is a pre-existing pattern (Decision #163 deferred parts.io enrichment) that Decision #252 made universal-by-default by removing the opt-in gate. Net cost: a redundant fan-out + a brief chip flicker (pricing appears → vanishes on rescore → reappears). With Decision #254's raised caps the second fetch is cheap (L1 warm) and fast, so impact is low.

**Fix (if wanted).** When `opts.deferredPartsio` is set, skip the FC fetch at the initial `showRecsAndDeferAssessment` site and let the parts.io tail fire it once after rescore — single fetch, no flicker. Trade-off: pricing appears after the ~500-1500ms rescore instead of immediately on Digikey-only recs. Alternative: have the parts.io rescore **preserve** already-merged `supplierQuotes` rather than overwriting with FC-less recs. Low priority.

---

## RecommendationCard not memoized — off-screen re-renders while comparing (follow-up to Decision #253) (P3)

**Context.** Surfaced in the PR #10 review. Decision #253 keeps `RecommendationsPanel` mounted (hidden via `display:none`) while a replacement's detail (`ComparisonView`) is open, so its filters + scroll survive going back. Side effect: while hidden the panel still re-renders on every state change — notably each FC enrichment chunk merge (Decision #252 always-on) re-creates the `recommendations` array, so the panel's `.map` rebuilds all ~50-70 `RecommendationCard` elements **off-screen**. `RecommendationCard` ([components/RecommendationCard.tsx](../components/RecommendationCard.tsx)) is not `React.memo`'d and `inferContextActive(recommendations)` is recomputed inline per render, so React reconciles the full card subtree on each invisible re-render. Bounded to the brief enrichment window; no visual glitch, just wasted CPU.

**Fix (if wanted).** Wrap `RecommendationCard` in `React.memo` and hoist `inferContextActive` into a `useMemo`. Largely neutralizes the off-screen cost without lifting filter state (the alternative #253 deliberately rejected). Low priority.

---

## Triage route doesn't scale past ~1k rows — server-side filter/pagination needed (follow-up to Decision #231) (P2, NEXT)

**Context.** Decision #231's triage RPC `RETURNS jsonb` fix removed the PostgREST 1000-row cap (Decision #206) that was silently hiding ~13.7k of the true **14,413** unmapped params. Now the full classified set (**~4.25 MB**, ~13.5k OPEN) ships to the client, and `components/admin/AtlasDictTriagePanel.tsx` filters it client-side + paginates render to 100 (Decision #182). That client-everything model was fine at ~1k rows but doesn't scale to 14k — and the pending **full 102-file legacy discovery** pushes it to ~20k / ~6 MB. The user explicitly chose to harden this **before** running full discovery.

**Fix.** The route (`app/api/admin/atlas/ingest/batches` GET) already calls cached `getOrComputeTriageData()`. Filter/sort/slice **server-side over the cached classified set** per request (accept `search`/`status`/`mode`/`mfr`/`family`/`flagged`/`minProds`/`sort`/`page` params), return only a page + the full counts. Client refetches on filter/page change (debounce search), keeps optimistic accept/revert on the current page. Heavy compute stays cached; only a small page crosses the wire.

**Then (sequenced after the perf fix):** run full discovery for the other 101 legacy MFRs (`node scripts/atlas-ingest.mjs --discover-legacy` / "Scan legacy MFRs" button), then wider `npm run atlas:backfill -- --mfr <slug>` waves off-peak (411K rows; the preferredSuffix fix now changes many products fleet-wide — ISC alone = 1,493; Decision #193 warns against one full unfiltered run). See [memory/atlas-legacy-discovery.md] for live state.

---

## Comparison Specs — acceptance-editor expansion breaks row alignment transiently (follow-up to Decision #246) (P3)

**Context.** Decision #246 aligned the source (left `AttributesPanel`) and replacement (right `ComparisonView`) Specs tables to a single shared row set so rows line up 1:1. The left panel's per-attribute acceptance-tune editor injects a transient `<Collapse>` row beneath the expanded attribute, which pushes every left row below it down relative to the right — so alignment is temporarily lost until the user closes the editor. Accepted as-is at ship: user-triggered, transient, one row at a time.

**Fix (if ever wanted).** Mirror an empty same-height spacer row on the right when an acceptance editor is open. Requires lifting `expandedAcceptance` state from `AttributesPanel` up to `DesktopLayout` (so `ComparisonView` can read it) — non-trivial state plumbing for a cosmetic, transient glitch. Low priority.

---

## Greenfield search relevance — follow-ups to logic-vetted search (Decision #243) (P3)

**Largely addressed by Decision #243** (June 22, 2026). Descriptive searches that carry stated specs now run candidates through the matching engine via a synthetic source: a candidate whose known categorical attribute contradicts a stated constraint (NPN≠PNP, N-ch≠P-ch) is a real `fail` → **sinks to the bottom**; wildly over-spec parts (1700V for a 12V ask) sink via the over-spec closeness penalty. This is "rank, keep all" (the original ask said *hard-filter*; we sink instead of hide — deliberate, so the list never empties). The SSM2220-PNP-for-NPN case is now handled for any family where the polarity/channel constraint resolves to an attributeId.

**Residual items (all P3, accepted v1 nuances):**
- **(a) Synonym-map coverage.** `searchConstraints.ts` `SYNONYMS` is B5-thorough; other families rely on attributeName fuzzy-match, so a terse human term ("NPN", "polarity") may not resolve to the right attributeId for, e.g., B6 — in which case that constraint is silently dropped (safe: vetting relaxes, never mis-vets, but the polarity isn't enforced). Add per-family synonym blocks as families come up (start with the discrete-semi polarity/type terms).
- **(b) Dual-channel penalty-0 float.** Parts whose Vds/Id `numericValue` Digikey doesn't parse (e.g. "2N-CH" dual MOSFETs) get a 0 over-spec penalty and can float above closer single-channel parts. All still valid (`fails=0`); only a mild mis-rank. Fix would treat unknown-numeric as a small penalty rather than 0.
- **(c) Current over-spec penalized like voltage.** `computeOverSpecPenalty` weights all numeric `gte` constraints equally, but current/headroom over-spec is benign vs voltage over-spec (worse Rds(on)). Could down-weight current-like attrs. Fine for now since voltage dominates the sink.
- **(d) Optional hard-hide of over-spec / undersized.** Today everything is kept (sunk). A one-line flip via `filterRecsByMismatchCount` could hide undersized/hard-fails if ever wanted; over-spec hiding would need a new upper-bound rule the logic tables don't have.
- **(e) Non-Digikey/non-Atlas sources aren't vetted.** Only Digikey + Atlas supply candidate attrs (parts.io isn't even queried on descriptive searches). Fine today; revisit if a descriptive path ever pulls parts.io/Mouser.

**Deferred from the xhigh `/code-review` (June 22, 2026) — review fixed #1/#2/#4/#5; these were left:**
- **(f) Dormant unit-prefix scale mismatch (latent correctness).** The synthetic source normalizes numericValue via the UNGATED `_applyUnitPrefixCore`, while Atlas candidates go through the GATED `applyUnitPrefix` (`APPLY_UNIT_PREFIX_TO_NUMERIC`, currently `true`). If that kill-switch is ever flipped off, SI-prefixed constraints (mA/kHz/nF) become incomparable to Atlas candidate values (synthetic = base SI, Atlas = raw) → wrong pass/fail + nonsense over-spec penalty for every Atlas candidate. Digikey unaffected (always prefixes). Fix: route the synthetic source through the same gated path as candidates. Dormant while the flag stays on.
- **(g) Inline vetting sort duplicates `sortRecommendationsForDisplay`.** The vetting block in `partDataService.ts` redefines `statusRank` + a fewest-fails→Active→penalty→match% comparator that mirrors `recommendationSort.ts`'s primary keys. Only genuine delta is the over-spec penalty (which must stay search-only — cross-refs prefer higher-rated parts). Cleaner altitude: parameterize the shared sorter with an optional penalty callback. Low priority.
- **(h) `SyntheticSourceResult` interface lives in `searchConstraints.ts`, not `lib/types.ts`.** Weak convention deviation (precedent: `AtlasCandidateWidening` in `atlasClient.ts`). Move if/when consolidating types.

**Deferred from the xhigh `/code-review` of Decision #248 Phase B (June 24, 2026) — review fixed the SI-prefix/sign mismatch (#1) + the negative-band margin (#2); these LOW/cleanup items were left:**
- **(i) `applyParametricFilter` duplicates the inline #238 APPLY block — and they already diverge.** Both copies carry a `TODO(post-validate): converge`. The extracted greenfield copy handles compound `"200 @ 2mA"` values (splits on `@`) and unitless gains; the inline #238 acceptance-widening copy ([partDataService.ts ~2093](../lib/services/partDataService.ts)) does neither (calls `extractNumericValue` on the whole string). Benign today — #238 only widens unit-bearing E-series/parametric attrs, never unitless/compound ones — but it's the drift the TODO warns about. Converge into one helper taking an `inBand` predicate. **Note:** the greenfield copy was the one fixed for G/T-prefix + sign (now routes facet parsing through `toBaseSI`); the inline #238 copy still uses `extractNumericValue`, so if #238 ever widens a GHz/negative attr it'll hit the same bug — fold that fix in when converging.
- **(j) Dead `sourceNv` on `FetchBand`.** `pickFetchBand` computes `sourceNv` in all branches and returns it, but the only consumer (`applyParametricFilter`) takes `{attrId, lo, hi}` and never reads it. Mirrors Atlas's `AtlasCandidateWidening.sourceNv` (which IS consumed for nearest-first RPC ordering) — so it reads as load-bearing but isn't. Remove it, or wire it into the Digikey apply's ValueId ordering if nearest-first was the intent.
- **(k) `toBaseSI` not reused by `buildSyntheticSource`.** The same 4-line number→base-SI dance is inlined in `buildSyntheticSource` ([searchConstraints.ts ~159](../lib/services/searchConstraints.ts)) AND wrapped in the new `toBaseSI` helper in the same file. Drift risk: a prefix-handling fix to one won't reach the other. Have `buildSyntheticSource` call `toBaseSI`.
- **(l) Zero-floor gte band `[0,0]`.** In `pickFetchBand`, a `min 0` constraint gives `explicitLo=0` → `hi = 0×10 = 0`; the `hi<lo` guard passes (0<0 is false), leaving a band that matches only exactly-zero → empty pool → safe keyword-only fallback. Narrow trigger; treat a 0 floor as "no upper bound" (skip the band) if it ever matters.
- **(m) `RANGE_RE` mis-parses malformed multi-hyphen/dot values.** `"100-200-300"` → `[100,200]` (drops 300); `"1.2.3-4"` → `parseFloat` truncates. Produces a silently-wrong band → safe keyword-only fallback. Garbage-input edge; validate/reject malformed range strings if real inputs surface.
- **(n) 3 sequential Digikey round-trips on band-carrying greenfield searches (perf).** `keywordSearch` → `getCategoryParametricFacets` → `parametricFilterSearch`, serialized because `categoryId` is bootstrapped from the keyword result (~+0.5–1.2s on the Digikey leg). To parallelize, derive `categoryId` offline (a static `partType`/`familyId` → Digikey `categoryId` map) so facet discovery can run concurrently with the keyword search. Inherent cost of the feature today; revisit if greenfield latency becomes a complaint.

**(o) Surface the matched/over-spec spec on result cards (UX) — P3.** A user asking for "9V" and seeing a 45V-rated part on top is correct (the rating is a *minimum* the part must clear), but the **"Fits your specs"** chip reads as "exact match" and doesn't convey "over-rated, which is fine." Show the actual matched value relative to the ask, e.g. `Vceo 45V (≥ your 9V)` or a "meets/exceeds" vs "exact" distinction, so the over-spec isn't mistaken for a mismatch. (Surfaced by a real user question this session.)

---

## Chat-prompt remaining work — grounding leaks + cleanup (follow-ups to Decision #241 + the greenfield deterministic fix) (P2/P3)

**Context.** The chat() SYSTEM_PROMPT refactor (Decision #241) + the deterministic greenfield search-presentation fix (commit `e2b200c`) banked the high-value work — the worst, most-reliable grounding leak (greenfield "curate-a-recommendation" over broad search results) is fixed structurally. These are the remaining, lower-value/higher-risk items, deferred deliberately (not low-risk despite being lower-value; prompt edits are behaviorally risky with manual-only coverage). Full state in [memory/chat-prompt-refactor.md] + [docs/chat-prompt-regression-checklist.md].

**(1) Residual free-prose grounding leaks (the A3-family on non-search surfaces) — P2.** The structural fix only covered the search-presentation surface. Softer, rarer "P✱" leaks remain where the answer is *inherently* free prose (no card-data template to swap in):
- **A4** — post-recs follow-up Q&A names a from-memory part (e.g. "MMBT2222A as an automotive alt").
- **A5** — MFR-profile answers smuggle an unsourced market aside ("#2 in SPI NOR globally").
- **C5 / E5** — opinion-answer closings ("is this a safe choice?") characterize MFRs without a profile call ("Microchip… automotive-capable"; "TI/Nexperia make drop-in automotive NPNs").
The durable fix is **structural per-surface** (the #173 move applied surface-by-surface) for A4/A5 where some data is on cards; C5/E5 are largely **accept-the-ceiling** (opinion synthesis can't be deterministic-templated, and prompt rules don't hold reliably on Haiku — do NOT whack-a-mole, cf. ai-prompt-principled-rules-not-lexical-bans). These leaks are soft/rare → low urgency.

**(2) Dormant "excluded manufacturers" feature — P3 decision.** `UserPreferences.excludedManufacturers` exists and the **engine enforces it** ([lib/services/partDataService.ts:1603](../lib/services/partDataService.ts#L1603) filters excluded MFRs out of candidates *before* the LLM sees them), but **nothing populates the field**: Company Settings only *clears* it, the profile extractor doesn't extract it, no writer sets a value. The inert prompt rule was removed (this commit). The capability blurb at [llmOrchestrator.ts](../lib/services/llmOrchestrator.ts) §"About This System" still lists "excluded manufacturers" as a personalization option (mildly inaccurate until wired). **Decide:** either (a) **wire up an input** — a Company-Settings field and/or profile-extractor extraction — to make exclusion a real feature (the engine code is ready), or (b) **remove the orphaned engine enforcement** + the meta blurb. Note exclusion is partly redundant with engine pre-filtering anyway.

**(3) Phase 2 / Phase 3 of the prompt refactor (Decision #241) — P3.** **Phase 2:** move thin prompt rules already covered by deterministic code into code (e.g. pre-recs origin routing); keep one-line reminders, never delete unless code-coverage is verified + unit-tested (Med risk, testable). **Phase 3** (consolidate the grounding blocks into one free-prose floor) is now **lower-urgency** — the greenfield surface is handled structurally, and a prompt-only consolidation likely won't fix item (1)'s inherent-free-prose leaks anyway. Highest-risk item; revalidate against the full Haiku checklist and revert per-step on any CRITICAL regression if ever attempted.

---

## `present_choices` button labels are unreconciled LLM free text (audit follow-up to Decision #255) (P3)

**Context.** The Decision #255 audit swept every chat tool for the pattern "LLM-supplied input reaches a user-visible label/list/ranking without a deterministic resolve-or-drop guard." The chat is well-guarded overall — MPN lookups resolve against the catalog and drop non-existent parts; summaries / comparison tables / filter chips are deterministically rebuilt. **One comparable soft spot:** [ChoiceButtons.tsx](../components/ChoiceButtons.tsx) renders `choice.label` — **free text authored by the LLM** via `present_choices` — as-is, with no reconciliation against catalog data. Today these are simple categorical narrowing choices ("N-channel" vs "P-channel", dielectric class), so current risk is low, and a `confirm_part` choice re-verifies the MPN against the catalog on click (an invented MPN fails to load — it can't surface wrong *data*). But in principle the LLM could embed an invented MPN or spec in a button's *text* — same class as the Decision #255 "Below spec" issue (a misleading label, not a false data load). **Fix options:** (a) build `confirm_part` button labels from the resolved catalog part rather than free text; and/or (b) run choice labels through the same grounding check as prose (cf. the grounded-MPN gate below). Low urgency.

---

## Grounded-MPN gate — follow-ups (branch `feat/grounded-mpn-detection`, plan `docs/mpn-grounding-gate-plan.md`)

**Context.** The grounded-MPN effort guarantees the chat assistant never serves a part number it didn't pull from the catalog. Foundation (accumulated verified set), observe-only measurement, and the deterministic comparison-table renderer are built (steps 1–4). The backstop gate (step 5) follows. Items below are deferred/known, captured during the pre-backstop code review (commit `4acf54d`).

**(A) Activation — measurement is dormant until IT provisions it (BLOCKER for the management report, P1-when-ready).** The observe-only logger silently no-ops until (1) the `mpn_grounding_observations` table exists (`scripts/supabase-mpn-grounding-observations-schema.sql`) AND (2) `SUPABASE_SERVICE_ROLE_KEY` is set in the deployed env (IT-managed, post-Vercel). Nothing records before then, and the backstop gate's enforce-flip is gated on this data (dual-threshold per the plan §"Open product decisions"). Once live: build the management report (fabrication rate + example catches).

**(B) Cross-turn verified-set accumulation — P2.** The live wiring builds the verified set PER-TURN (`buildVerifiedSetFromContext` called with no `base`), so parts seen in earlier turns aren't remembered. Effect today: medium-confidence over-counting in the measurement (HIGH family-pattern catches are unaffected). Effect once the gate enforces: a part the user saw 3 turns ago could be wrongly flagged. Fix: persist the set keyed on conversation id (like recommendation snapshots) and pass it as `base`. `extendVerifiedSet` is already immutable-union for exactly this. Required before enforcement is trustworthy across multi-turn chats.

**(C) Manufacturer-name coverage in the gate — P2.** `isVerifiedMfr` + MFR harvesting exist, but the detector/gate currently only flag MPNs, not manufacturer names in prose ("BC846 from Vishay" = real part, wrong maker — same damage class per plan §4). Extend detection to MFR names against the verified-MFR set once the MPN gate is proven.

**(D) Extend the gate to the refine modal + list agent — P3.** `present_comparison` and the backstop gate land in `chat()` first (rollout step 4). `refinementChat()` / `listChat()` get observe-only logging today but no comparison renderer and no gate; extend once their verified-set plumbing is richer.

**(E) Minor polish from the review — P3.**
- Cold-start comparison-table MPNs aren't clickable — `MessageBubble` gates clickability on `knownMpns.has(row.mpn)`, and freshly-compared parts (not from a prior search) aren't in `knownMpns`. No dead clicks (the gate prevents them); just less interactive. Fix: union the comparison parts into `knownMpns` (and ensure `handleMpnClick` can resolve a not-on-screen MPN).
- `persistObservation` builds a fresh Supabase service client per call. Harmless (fire-and-forget, ~1/turn) — memoize if volume ever matters.
- A single-part comparison (e.g. when the other part wasn't found) renders only identity columns, no specs (auto-select threshold = 2). By design; could special-case "1 resolved part → show its key specs."

**(F) Spec-commentary stays observe-only — by design, not a TODO.** Per plan §"Commentary": stripping a true datasheet spec is the inverse error economics of the MPN gate (it cripples usefulness). Spec values tied to a named part are logged/observed only; revisit enforcement only if the data justifies it.

**(G) Recovery follow-through is clunky when the user says "search it" — P3 (surfaced during gate testing June 26).** With the gate ON, the assistant correctly withholds an un-looked-up part (e.g. alludes to "a classic general-purpose NPN BJT" without naming 2N2222). But when the user then says "Ok search it," the assistant asks for an MPN ("I need a part number or description to search") instead of just running a descriptive/category search for the thing it described and showing real cards. It even *offers* the right move ("shall I search for general-purpose NPN transistors?") — it just asks instead of acting. This is **not the gate misfiring** (the reply contains no part number, so the gate correctly leaves it alone) and **not a regression** (it's existing "act, don't ask" + grounding-caution behavior the test surfaced). Fix is a careful prompt nudge: after the assistant alludes to a part it wouldn't name, a "search it" turn should run a **category/descriptive search** (the description it already has), not re-ask for an MPN. Risk: over-correcting back toward naming-from-memory — validate against the grounding behavior before/after. Related to "Conversational query-shape routing" (messy follow-ups). Low urgency — one extra turn, not a dead end.

---

## Informative chat "thinking" status — stream the agent's real tool steps to the UI (P3)

**Context.** The chat loading indicator is a static **"Thinking…"** — a spinner + one fixed string ([components/ChatInterface.tsx:154-176](../components/ChatInterface.tsx#L154-L176), driven by `statusText` in [hooks/useAppState.ts](../hooks/useAppState.ts), set to `'Thinking...'` at line 1171 of `handleSearchWithLLM`). A user asked whether it could instead show **what the agent is actually doing** ("Searching components…", "Looking up manufacturer profile…", "Filtering replacements…"). It's very doable — the codebase already has the pieces — but deferred (nice-to-have UX polish, not a correctness/coverage lever). The reason it isn't trivial: `/api/chat` runs the **entire** agent tool-loop server-side and returns one JSON blob at the end ([app/api/chat/route.ts](../app/api/chat/route.ts) → `NextResponse.json({ success, data })`), so the UI never hears intermediate steps. Real per-step status **requires streaming** — there's no shortcut around the single request/response.

**Recommended fix — real streamed stages via SSE.** Stream the agent's *actual* tool steps so status reflects reality (only shows "Searching components" when it actually searched). Reuses the SSE pattern already running in prod ([app/api/admin/qc/analyze/route.ts](../app/api/admin/qc/analyze/route.ts) consumed by [components/admin/QcAnalysisDrawer.tsx](../components/admin/QcAnalysisDrawer.tsx)). The terminal event carries the **unchanged** `OrchestratorResponse`, so all downstream `handleSearchWithLLM` logic (search-result rendering, FC/distributor enrichment, `mentionedAtlasManufacturers` linkify) stays byte-for-byte identical. Touchpoints (≈4-5 files):
- **[lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)** — add a `TOOL_STAGE_LABELS` map (tool name → friendly label) + thread an optional `onStage?(label)` callback into `chat()`. Fire it once before the first LLM call (`'Thinking'`), then once per tool-loop iteration with the label for the tools about to run (`toolUseBlocks` ~line 1471, before the `Promise.all` ~1491); collapse multiple tools in one iteration to a single priority-ranked label so the status doesn't thrash. **Scope to `chat()` only** — `refinementChat()` / `listChat()` untouched.
- **[app/api/chat/route.ts](../app/api/chat/route.ts)** — convert POST to SSE (TransformStream + writer, `data: ${json}\n\n`, `text/event-stream`). Keep `requireAuth()` + `runWithServiceTracking` exactly as-is, starting the background streaming IIFE **synchronously inside** the tracked callback so `getServiceWarnings()` still propagates via AsyncLocalStorage. Emit `{type:'stage',label}` per step, `{type:'complete',data,serviceWarnings}` at the end, `{type:'error',message}` on failure. Non-200 (auth/config) stays plain JSON so the client's `res.ok` check still throws cleanly.
- **[lib/api.ts](../lib/api.ts)** — add `chatWithOrchestratorStream(...)` (sibling to `analyzeQcLogs`): reads the SSE stream, calls `onStage(label)` on stage events, resolves with the final `OrchestratorResponse` on `complete`. Preserve the service-warning side-effects `fetchApi` does today (factor lines ~66-75 into a shared helper).
- **[hooks/useAppState.ts](../hooks/useAppState.ts)** — in `handleSearchWithLLM` swap the single `await chatWithOrchestrator(...)` (lines 1181-1187) for the streaming call, passing `(label) => { if (!signal.aborted) setStatus(label); }`. Everything from line 1189 down is unchanged; existing abort + catch + deterministic fallback already cover stream errors/aborts.
- **[lib/types.ts](../lib/types.ts)** — add a `ChatStreamEvent` union next to `QcAnalysisEvent`.

Suggested labels: `search_parts`→"Searching components"; `get_manufacturer_profile`→"Looking up manufacturer profile"; `filter_recommendations`→"Filtering replacements"; `get_part_attributes`/`get_batch_attributes`→"Checking specifications"; `present_part_options`/`present_choices`→"Preparing options"; history tools→"Reviewing your history".

**Cheaper alternative — NOT recommended.** Reuse the existing `startStatusRotation([{text,delayMs}…])` helper ([useAppState.ts:397-405](../hooks/useAppState.ts#L397-L405)) with a timed generic sequence in `handleSearchWithLLM`. ~10 lines, no backend change, ships in an hour — but the labels are **timed guesses, not real**: it can show "Searching Digikey" on a turn that never searched. Inconsistent with the app's no-fabrication ethos (cf. deterministic summaries replacing LLM prose, Decisions #173/#242). Keep only as a graceful-degradation fallback if a stream can't be established.

**Caveat to set expectations.** Most chat turns are a single LLM call with no tools, so stages flash by fast — the feature shines mainly on multi-tool turns ("find Chinese replacements for X"). Do **not** add artificial minimum-display delays (that reintroduces the dishonesty). Risk note: SSE is already proven in this deployment (qc/analyze + parts-list/validate), so no new infra risk; the one thing to verify in testing is that `getServiceWarnings()` still populates on the streamed path. Since the chat transport changes, re-run [docs/chat-prompt-regression-checklist.md](chat-prompt-regression-checklist.md) even though `OrchestratorResponse` is unchanged.

---

## Conversational query-shape routing — interpreting the messy ways users actually ask (NEW category, P2)

**Thesis.** The engine handles a *clean* query well (a bare MPN, or a part type + one spec). It mishandles the realistic, compound shapes people actually type — refinement turns, "find me something like part X," named exemplars buried in a descriptive ask, multi-part comparisons. The failure here is usually **not** grounding (the model doesn't fabricate) and **not** the vetting math (Decision #243 works once it engages) — it's the **routing/interpretation layer** that decides, for a messy input, *which* search to run, with *what* constraints, and *how* to present the result. This is its own problem space, separate from prose-grounding ("Chat-prompt remaining work") and the synthetic-source mechanics ("Greenfield search relevance #243"). New shapes get appended here as we hit them.

**Related infra change (June 22, 2026):** the chat orchestrator default was flipped **Haiku 4.5 → Sonnet 4.6** ([lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts), no `ANTHROPIC_MODEL` override in prod) because Haiku under-fired `search_parts` on exactly these shapes — it punted a fully-specified part-need back to the user instead of searching. Sonnet raises the routing floor, but model tier alone does not solve the shapes below; they need explicit handling. (Note: CLAUDE.md still says "Sonnet 4.5"; the real default is now `claude-sonnet-4-6`.)

**Known shapes (observed this session, June 22, 2026):**

- **(1) Refinement turns — pivot on new constraints, don't re-offer stale cards (P2).** A part-need result set is on screen; the user then adds new hard constraints (e.g. after a broad "NPN transistor," they type "low-noise, 9V, 1–2mA, hFE 200–400"). Correct behavior: fire a FRESH logic-vetted `search_parts` with the new constraints — not "click any of the earlier parts, which looks promising?" Original failure (on Haiku): exactly that punt. Mitigated by the Sonnet flip; if the shape still misroutes on Sonnet, add an explicit refinement-pivot rule to the Part-selection-advice block and validate on the Haiku checklist. The existing pivot rule ([llmOrchestrator.ts:529](../lib/services/llmOrchestrator.ts#L529)) covers "actually I need 50V" but not "here are more specs for the same part type."

- **(2) "Like part X" / exemplar-seeded search (P2).** Query names reference MPNs inside a descriptive ask ("a low-noise LDO **like the LT3045 or TPS7A4700**, <10µV noise, >70dB PSRR, for hi-fi audio"). Current behavior: the model passes the named MPNs as the keyword query → Digikey exact-matches "LT3045" and floods the list with its package SKUs; the SECOND named reference (TPS7A4700) doesn't surface; the descriptive specs aren't lifted into `constraints`, so the logic-vetted path never engages (summary read "matching your criteria," not "ranked by how well they fit"). Desired: treat named exemplars as **seeds** — classify the family + harvest representative specs from them — then run ONE descriptive logic-vetted search for comparable parts across MFRs, surfacing all named references + peers, not one part's SKU list.

- **(3) SKU / package-ordering-variant flooding (P2, quick win, model-independent).** Search dedups by **exact MPN only** ([partDataService.ts:1395](../lib/services/partDataService.ts#L1395)), so `LT3045EMSE#TRPBF` / `#PBF` / `EDD#TRPBF` / `EDD#PBF` / `EDD-1#TRPBF` all render as separate "parts" — a "20 results" set that is really ~4 distinct parts padded with tape-vs-tube + Pb-free permutations. On a SELECTION surface that is noise. Collapse ordering permutations to one representative card per distinct part (keep genuine package choices — MSOP vs DFN — distinct). `mpnNormalizer.ts` already strips packaging suffixes for cross-ref lookups; wire it into the search-result merge. Helps EVERY search (MPN or descriptive). Overlaps #243's greenfield section but is broader (also fires on MPN lookups).

- **(4) Memory-recalled multi-search non-determinism on descriptive requests (✅ SHIPPED — Decision #248, June 23–24, 2026).** Done via Phase A (server owns one search per turn: `partitionToolUses` dedup + `tool_choice`-forced `extract_part_specs` + canonical `buildGreenfieldQuery`) + Phase B (parametric-filter the Digikey pool by the stated numeric spec) + identity-categorical injection (NPN/PNP, channel type, etc. derived from the part-type noun). Validated by 3 UI tests + a code-review pass; residual cleanups tracked as items (i)–(o) above. Original analysis kept below for context. — The headline failure for this whole category. For ONE descriptive request ("small signal NPN for a low-noise audio preamp, 9V, 1–2mA, hFE 200–400") the model fires **4–6 `search_parts` calls in a single turn**, each a part number *recalled from training memory* (`mmbt5089`, `2n3904`, `mpsa18`, `bc550c`…), they run in `Promise.all`, and `data.searchResult = filtered` is **last-completes-wins** ([llmOrchestrator.ts:915](../lib/services/llmOrchestrator.ts#L915)) — so the same query returns a different family every run, and sometimes raw prose (the deterministic-bubble gate at [useAppState.ts:1205](../hooks/useAppState.ts) requires `type===single|multiple`, so a thin final search falls through to LLM prose). **Two fixes tried + abandoned:** temperature 0 (committed as Decision #247 then **reverted**, `8e310b3` — it's *strategy* variance, not sampling jitter, so a sampling knob can't pin it); message-keyed result memoization (rejected — caching freezes the chaotic process instead of fixing it; cache must stay speed-only). **Approved approach (server owns the search):** on a greenfield turn (`!looksLikeMpn`), get a reliable `{partType, constraints}` (a `tool_choice`-forced `extract_part_specs` call when the model's call lacks them — keeps the SYSTEM_PROMPT untouched so the regression checklist holds), then run **one** Digikey **parametric-filtered** search on the numeric specs (reuse Decision #238 APPLY phase; **generalize facet-eligibility beyond `RANGE_FETCH_ATTRS`** so hFE filters too) → score/rank via `findReplacements` synthetic source (Decision #243) → deterministic `buildSearchSummary`. New `searchBySpecs` in `partDataService.ts` (~150 lines net-new, ~90% reuse). Dedupe multiple `search_parts` to one. Determinism = `f(family-from-message, structured-constraints)` — **strong, not bit-perfect**; no result cache. Fixes BOTH the non-determinism and the "shows 45V, not my hFE" relevance gap (overlaps #243's greenfield section). Deferred within the plan: multi-attr parametric in one Digikey call; matched-spec chip on cards; static familyId→categoryId map.

**Forward-looking shapes (in-class, not yet hit — capture as they appear):** multi-part comparison ("compare X vs Y"); constraints on **datasheet-only** attributes (noise µV / PSRR dB / CTR) where Digikey lacks the field, so #243 vetting can't gate (missing-data = `pass` invariant — Atlas/parts.io gap-fill or datasheet extraction is the only lever); negation/exclusion ("anything but TI," "not pre-biased"); unit/format variance in stated specs ("2k2," "0R1," "1u").

---

## Context-question translation completeness + `en` locale redundancy (follow-up to Decision #227) (P3)

**Context.** Decision #227 fixed a translation-layer corruption where a broken extractor clobbered context-question titles and truncated strings at apostrophes. Two structural follow-ups surfaced while fixing it:

**(a) `de` translation gaps.** German context-question coverage is incomplete: ~17 `contextQ.<family>.<questionId>.text` keys are absent (D2/E1/F1/F2 + parts of 53), and the 5 long descriptions corrupted by the extractor were restored to **English** (their pre-corruption content was already untranslated English), not translated to German. At runtime these fall back to the English TS source — correct content, wrong language. zh-CN is materially more complete. Fix: a proper German translation pass over the `contextQ` subtree. Low priority — falls back gracefully, German is a minority locale.

**(b) `en` `contextQ` is redundant with the TS source.** Because the UI uses the TS `questionText`/`label`/`description` as the i18n fallback (see [components/ApplicationContextForm.tsx](../components/ApplicationContextForm.tsx)), every `en` `contextQ` entry just duplicates the TypeScript source in the same language — pure liability (it's how this bug entered, and how desc "drift" crept in). The guard test now pins `en` == TS verbatim, so they can't diverge silently. Cleaner end state: **delete the entire `en.contextQ` subtree** and let it always fall back to TS. Removes ~hundreds of redundant strings and makes the en-exactness test trivially true. Deferred because it's a larger diff with no user-visible change; the guard test already neutralizes the risk.

---

## Deep-linkable FACTS tables on domain cards (follow-up to Decision #228) (P3)

**Context.** Decision #228 (composite domain cards) renders the factual card sections (RULES, CHINESE→CANONICAL dictionary, CONVENTIONAL UNITS, MFR cohort) deterministically into a **read-only plain-text box** in the review drawer ([components/admin/AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx)). The renderer ([lib/services/atlasFamilyCardFacts.ts](../lib/services/atlasFamilyCardFacts.ts)) already produces the structured arrays (`RenderedFacts.rules` / `.dict` / `.units` / `.mfrs`) alongside the prose — the UI just doesn't use them yet.

**Gap this closes.** Today, if an engineer reads a fact in the box and disagrees with it (a weight they'd change, a dictionary mapping that's wrong/missing, an MFR cohort that looks off), there's **no routing** to where the fix lives — they navigate to the logic-table viewer / Triage dictionary / MFR data themselves. The facts are correct-by-construction relative to source, so this is the rare "I think the *source* is wrong" case — but when it happens, it's a manual hunt.

**Fix idea.** Render the FACTS region as proper **tables** (reuse `LogicPanel.tsx` rule-table + `logicConstants.ts` `typeColors` for RULES; `AtlasDictionaryPanel.tsx` chip patterns for the dictionary) fed by the `RenderedFacts` structured arrays, with **deep-links per row**:
- a RULES row → that rule in the Logic table viewer (`?section=logic&family=<id>`)
- a DICTIONARY row → the Triage/dictionary editor for that param (`?section=atlas-dict-triage` filtered to the param, or the AtlasDictionaryPanel entry)
- an MFR cohort row → that manufacturer's detail page (`/admin/manufacturers/<slug>`)

Turns "navigate there yourself" into one click. Data is already available; this is purely a UI build. Keep the read-only plain-text fallback for any region without a structured array. Mentioned as the deferred follow-up in Decision #228's "Implementation §4 (Follow-up, not MVP)".

---

## Peg `atlas_products` to `atlas_id` instead of manufacturer name string (Steps 2–3 of Decision #225) (P2)

Decision #225 deduped the 9 true-duplicate MFR rows and added a name-based import guard, but `atlas_products` still links to manufacturers by **name string** (upsert key `(mpn, manufacturer)`, no manufacturer ID column). That's the root cause of the English-code collisions (HX = 红星 / 恒佳兴): products keyed under the bare code `"HX"` get attributed to *both* companies by the per-row `name_en` fold in `app/api/admin/manufacturers/route.ts`.

The fix is the rest of the "unique ID spine" model:
- **Step 2:** add a `manufacturer_atlas_id` (FK → `atlas_manufacturers.atlas_id`) column to `atlas_products` + backfill. ~99% of products map unambiguously by name → atlas_id. The bounded tail (ambiguous shared codes like the "HX" 1,642) can't be auto-assigned — the source never disambiguated them; surface those as "owner unresolved" for a manual/source call rather than silently double-counting.
- **Step 3:** switch the admin aggregation (and ideally the alias resolver everywhere) to join products → manufacturer on the ID, retiring the `name_en` fold. Collisions become impossible by construction.

Align with the `companyUid` cross-source concept (Decision #148) — decide whether `atlas_id` *is* the universal key or maps *under* a `companyUid` that also covers Western MFRs (which have no atlas_id). Note: the 9 English-code collision pairs (HX/LX/HUAWEI/etc.) remain as legitimate distinct rows; this work is what finally attributes their products correctly. See Decision #225.

**Bridge already shipped (Decision #225 same-day update):** existing HX/LX products re-keyed to full unique names + `cleanManufacturerName` made collision-aware, so the page is correct *today* and re-ingest won't re-merge. Steps 2–3 remain the durable fix (makes the manufacturer string irrelevant). The bridge is forward-compatible.

**Sub-item — recover clobbered 连欣科技 (LX) products — ✅ DONE (June 4, 2026):** 连欣科技's LX batch (`mfr_574_LX_连欣科技`) had been applied but showed 0 products — clobbered by 灵星芯微's same-"LX" upsert (overlapping `(mpn, manufacturer)` key, last-write-wins, both applied June 1). Re-ran report + proceed under the collision-aware script → keyed to "LX 连欣科技", **680 products recovered** as clean inserts (0 clobber of 灵星芯微's 634). Final verified state: 灵星芯微=634, 连欣科技=680, ambiguous "LX"=0. 连欣科技 is a connector/switch maker (SIM sockets, USB) so it carries ~58 unmapped L2 Chinese params now visible in Triage — normal for a new connector MFR, separate follow-up.

## Triage queue lingers on params resolved by CODE dicts, not DB overrides (P3)

**Discovered June 4, 2026.** The Triage queue (`/api/admin/atlas/ingest/batches`) decides a param is "resolved" by cross-referencing `atlas_dictionary_overrides` (DB overrides). It does NOT consult the code-level dictionaries — `metadataParamDictionary`, `sharedParamDictionary`, or the per-family dicts in `atlasMapper.ts`. So a param that's resolved purely in code, but appears in a batch report's `unmappedParams` list frozen *before* that code entry was added, lingers in the queue forever even though ingest/read already map it correctly.

**Concrete case that surfaced it:** Galaxy `ECCN代码` showed as unmapped (Impact 60k) despite `metadataParamDictionary` mapping `eccn代码 → eccn_code` (Decision #216) and all 8,527 applied products already carrying `eccn_code = EAR99`. The Galaxy batch report (applied 5/26/2026) predated the dict entry. Applied batches have no Regenerate button (route rejects non-pending), so it was cleared by surgically removing the stale entry from the frozen `report.unmappedParams`.

**Fix idea:** in the queue's resolved-filter, also drop any paramName whose lowercased+NFC form hits `metadataParamDictionary` / `sharedParamDictionary` / the dominant family's dict — same check ingest uses (`hasDictMapping`). That closes the staleness window without needing report regeneration. Cheap; the dicts are already importable server-side.

**Watch-out:** applied-batch reports can't be regenerated through the UI (only pending). Until the filter fix lands, the only remedy for a stale applied-report entry is the surgical `unmappedParams` edit. A general cleanup script could scan all applied reports for code-dict-resolved entries if more than a handful accumulate.

---

## Triage /investigate mis-buckets test-condition params as `disambiguation` (P3)

**Discovered June 3, 2026** while clearing the Galaxy B7 IGBT queue. The AI investigator returned `disambiguation` (map to `ic_max` / `vce_sat` / `eoff`) for `Condition1_IC (mA)` and `Condition1_VCE (V)` — both pure test-condition columns ("the current/voltage AT WHICH another spec is measured"). The map-to targets it proposed (`ic_max`, `vce_sat`) **already exist as separate, correctly-mapped attributes** on the same products (visible in the investigate diagnostic's "Actual JSONB keys seen" list). Mapping the condition column onto the existing rating would collide/corrupt (e.g. a 20–1000 mA test current overwriting a tens-to-hundreds-of-A `ic_max` rating).

**Root cause:** the `/investigate` prompt doesn't use "the attribute I'd map to is already populated on these products" as a signal. When the target canonical already appears in the products' JSONB, a same-concept-named column is almost always a *test condition* for that spec → bucket should be `unmappable`, not `disambiguation`.

**Fix idea:** feed the investigator the set of attributeIds already present on the affected products (it already fetches sample products — the keys are right there), and add a principled rule: *"if the canonical you would map to already exists on these products, this column is likely a test-condition qualifier for that spec — prefer `unmappable` unless the values are a distinct, substitution-relevant range."* Principled rule, not a per-paramName ban (cf. [[ai-prompt-principled-rules-not-lexical-bans]]).

**Mitigated, not blocked:** the drawer now always offers a "Mark unmappable instead" escape button (June 3, 2026) so engineer judgment can override the AI's bucket regardless. This BACKLOG item is the upstream prompt fix so the AI gets it right without the override.

---

## Atlas unit-prefix backfill — remaining ~149 MFRs (top 20 done June 2, 2026)
**Status:** PARTIAL — top 20 MFRs completed in Decision #217 session (100,948 products updated across 22 MFRs including 2 substring bonuses from AK matching 3PEAK + AMPAK)
**Priority:** P2 — top 20 covered ~73% of affected products. Long tail of 149 MFRs (~36K products) remains. Each is small (<1K products each typically), so the per-MFR business impact is lower than the top 20.

**Completed in Decision #217 session (June 2, 2026):**
Sunlord (15,584) / XKB Connectivity (2,544) / ISC (5,013) / YANGJIE (11,653) / YFW (4,623) / Jingheng (5,321) / JJW (7,067) / Comchip (8,028) / Galaxy (8,435) / KEXIN (3,781) / SWST (3,577) / TA-I (3,273) / LGE (3,697) / AK+3PEAK+AMPAK (3,746) / Everlight (2,012) / FOSAN (2,022) / Good-Ark (3,449) / Viking (1,753) / JSCJ (3,256) / JCET (2,111).

**Diff-fix discovery during execution:** `compareParamsIgnoringIngestedAt` in `scripts/atlas-ingest.mjs` originally compared only `value`/`unit`/`source` and IGNORED `numericValue`. First Sunlord backfill returned "0 changed" — backfill was a silent no-op because the only field that changed was the one the diff didn't look at. Fixed by adding `numericValuesEqual` helper with relative-tolerance float comparison. **Lesson:** any change to atlas storage semantics needs the diff function audited too — provenance-only diffs are blind to value-only mutations.

**Remaining execution:**
1. Re-run discovery for fresh prioritized list: `node scripts/atlas-find-mfrs-needing-backfill.mjs --top 50`
2. Sequential batches of 4 MFRs in parallel (proven safe at this load in Decision #217 session)
3. Use bare-substring MFR names where possible — multi-word names get truncated by npm (use "XKB" not "XKB Connectivity")
4. Watch for accidental substring bonuses (AK matched 3PEAK + AMPAK — net positive, but verify)

**Effort:** ~30 sec per MFR. 149 MFRs ≈ ~75 min if sequential; ~20 min if 4-at-a-time parallel.

**Lower priority because:** these MFRs were not in the top 20 by affected count, and per-MFR product counts are small. The biggest cross-source matching wins from Decision #217 are already shipped.

**UPDATE June 2, 2026:** Long-tail backfill EXECUTED in same Decision #217 session. 143/149 succeeded via orchestrator script; 6 multi-word MFRs (JNJ OPTOELECTRONICS / Tonyu Photoelectric / BLUE ROCKET / TECH PUBLIC / Signal Micro / Fortior Tech) needed underscore-name retry. All 149 done. **Total backfill across session: 147,301 products updated.** Then Greek-mu helper bug discovered post-audit → 29 affected MFRs re-backfilled. This BACKLOG entry can be CLOSED.

---

## Atlas value-string normalization at ingest (vendor unit-suffix display ugliness)
**Status:** Not started (added June 2, 2026)
**Priority:** P3 — single-vendor quirk today; would matter if multiple vendors start shipping non-standard unit suffixes in value strings.

**Problem:** Atlas ingest preserves vendor value strings as-is. When a vendor ships parametric values with non-standard unit suffixes (e.g. Connectors family vendor ships current rating as `"1.0AMP"`, `"2.0AMP"`, `"3.00AMP"` instead of `"1.0 A"`, `"2.0 A"`, `"3.00 A"`), the raw strings land in `atlas_products.parameters.<attr>.value` and surface unchanged in the Specs panel, Comparison view, and admin Atlas Explorer. Functional but ugly — engineer can normalize the `unit:` field on the dict mapping (to `'A'`) for clean column-header metadata, but the displayed VALUE string stays raw.

**Why not fix now:** Single Connectors vendor; minor cosmetic issue; would require a `valueNormalizationRules` table at ingest (per unit class, per family, edge cases like ranges and ±-prefixed values) — real scope for low payoff. Ugly-but-unambiguous beats absent.

**When to revisit:**
- ≥3 vendors discovered shipping non-standard unit-suffix value strings, OR
- Customer-facing complaint about Specs panel readability of Atlas-sourced parts, OR
- We add a "Compare with Digikey side-by-side" UX where the visual inconsistency becomes prominent

**If/when implemented:** add `lib/services/atlasValueNormalizer.ts` keyed by (attributeId or unit class) → regex-replacement rules. Hook into atlasMapper.ts mapModel after extractNumericWithPrefix; mirror into atlas-ingest.mjs (per Decision #174 convention). Test for ranges (`"-40°C ~ 85°C"`), ± values (`"±10%"`), comparison-prefix values (`"≤150ns"`), and ASCII-vs-Unicode-look-alike units. Backfill affected MFRs via existing `npm run atlas:backfill` plumbing.

---

## Atlas mapper.ts dead code: `mapAtlasModel` has no callers (Decision #218 byproduct)
**Status:** Not started (added June 2, 2026)
**Priority:** P3 — not user-impacting today, but misleading to future engineers.

**Problem:** `mapAtlasModel` in `lib/services/atlasMapper.ts` (line 2722, returns `MappedAtlasProduct`) is dead code. A grep across the repo finds zero callers outside `__tests__`. Production ingest runs through `mapModel` in `scripts/atlas-ingest.mjs` — they overlap conceptually but the .ts version has diverged (different return shape: `parameters: ParametricAttribute[]` vs object-keyed; includes `detailedDescription` and `manufacturerCountry`; emits `familyId` at the root vs inside `part`). The presence of an exported `mapAtlasModel` in the canonical-feeling .ts file implies it's the runtime mapper, which it isn't.

**Why this matters:**
- Misleads engineers reading the codebase ("I'll just call mapAtlasModel" → nothing breaks visibly, but they're not on the ingest path)
- Carries its own maintenance cost (the file's existing tests target the dead version, not the live `.mjs` one — see Decision #218's third lesson)
- Sits next to the mirror-discipline drift fixed in Decision #218; cleaning it up is part of the same hygiene push

**Two ways to resolve:**
1. **Delete it** (simplest). Remove the function plus the `MappedAtlasProduct` interface and `toPartAttributes` if they become orphan. Drop or migrate tests that target it.
2. **Wire it up** as a documented query-time mapper (e.g. for a future runtime path that reads Atlas JSONB directly), and refactor the .mjs ingest to use it via consolidation. This is the deferred Path C from the Decision #218 investigation (~6-8h with tsx).

**Recommendation:** Option 1 unless someone has a near-term plan for the wire-up. Option 2 belongs inside any future "consolidate the .ts and .mjs" initiative, not on its own.

**Effort:** ~30 min for delete. ~6-8h for wire-up (only as part of broader consolidation).

---

## Atlas dict-author-typo cleanup (Decision #217 audit byproduct)
**Status:** Not started (added June 2, 2026)
**Priority:** P3 — Decision #217's numeric-outlier audit (`scripts/atlas-audit-numeric-outliers.mjs`) surfaced ~40 individual dict entries with unit-field typos or non-standard unit strings that produce wrong post-conversion numericValues. None are systematic (1-2 products each), so user-visible impact is small.

**Categories of issues to fix:**
1. **Case typos** that spuriously trigger SI prefix: `unit: 'k/w'` (lowercase k) on thermal resistance → applies kilo. Should be `'K/W'`. ISC thermal_resistance affected (2 products).
2. **Ad-hoc unit strings** that bypass prefix handling but pollute display: XKB Connectivity has units like `'TO +85 ℃'`, `'U"'`, `'n'`, `',±5 ppm/y'` — these came from dict authors copy-pasting source labels rather than declaring canonical units.
3. **Pre-existing missing-unit cases**: many products have `unit: '(none)'` or no unit field at all, so values stored as raw numbers. Decision #217 doesn't make these worse; they were already pre-existing data quality issues. Examples: shutdown_supply_current_at_vin median 0.5 (most products unconverted), noise median 45 (most products unconverted).

**Approach:** Run `node scripts/atlas-audit-numeric-outliers.mjs` periodically (after big ingest sessions). For each suspect (attribute, MFR, dict-entry) triplet, fix the dict entry (atlasMapper.ts in-code OR atlas_dictionary_overrides admin panel) + scoped backfill that MFR. ~5-10 min per cleanup batch.

**Lower priority because:** None of the issues are systematic enough to affect matching scores for the typical part lookup. The audit baseline is now captured; future re-runs will show whether new issues creep in.

---

## Automotive AEC enforcement — replicate B6 pattern to remaining AEC-aware families
**Status:** CLOSED — All 11 families enrolled via Decision #221 (June 3, 2026, table-driven mechanism). B6 shipped in #211, B5/B7/C9 in #219, B8/B9/C10/D1/D2/E1/F1 in #221 alongside the refactor.

| Family | Standard | questionId | Shipped In |
|---|---|---|---|
| B5 MOSFETs | AEC-Q101 | `automotive` | Decision #219 |
| B6 BJTs | AEC-Q101 | `automotive` | Decision #211 (PoC) |
| B7 IGBTs | AEC-Q101 | `automotive` | Decision #219 |
| B8 Thyristors | AEC-Q101 | `automotive` | Decision #221 |
| B9 JFETs | AEC-Q101 | `automotive` | Decision #221 |
| C9 ADCs | AEC-Q100 | `automotive` | Decision #219 |
| C10 DACs | AEC-Q100 | `automotive` | Decision #221 |
| D1 Crystals | AEC-Q200 | `extended_temp_automotive` | Decision #221 |
| D2 Fuses | AEC-Q200 | `automotive_aec_q200` | Decision #221 |
| E1 Optocouplers | AEC-Q101 | `automotive_aec_q101` | Decision #221 (alongside existing filterOptocouplerMismatches) |
| F1 EMRs | AEC-Q200 | `automotive_aec_q200` | Decision #221 (alongside existing filterRelayMismatches) |

**Mechanism:** Table-driven via `AUTOMOTIVE_AEC_ENFORCEMENT` in [partDataService.ts](../lib/services/partDataService.ts). Each row carries `{ familyId, questionId, answerValue, attributeId, attributeName }`. Per Decision #221's lessons, the original "lift past 5 families" heuristic was wrong about the trigger — the real trigger turned out to be the discovery that D1/D2/E1/F1 use per-family `questionId` strings, which forced the table mechanism regardless of family count.

**If a future family needs automotive AEC enforcement:** Add one row to the table. That's it. The `expectFamilyWiring` helper in [automotiveAecEnforcement.test.ts](../__tests__/services/automotiveAecEnforcement.test.ts) covers it in 4 assertions per family.

**Generalization beyond automotive (still BACKLOG):** Medical / military / aerospace context questions, if/when they land in family files, should ride a sibling table (`MEDICAL_QUALIFICATION_ENFORCEMENT`, etc.) consumed the same way. Don't merge into one mega-table — domain-specific table names keep grep-ability high.

---

## Triage near-duplicate clustering Tier 3 — eager batch-level pre-cluster
**Status:** Deferred (added May 29, 2026 — Decision #208)
**Trigger:** Tier 1 (deterministic ASCII fuzzy) + Tier 2 (per-row AI cluster modal) shipped May 29, 2026. Tier 3 is the eager variant — run `/cluster-suggest` once per batch in the background and surface ready-to-Accept clusters at the top of the queue, so the engineer doesn't have to click "Find Similar (AI)" per row.

Wait until Tier 1+2 show whether the per-row opt-in trigger is actually the throughput bottleneck. If most engineer rounds end up Find-Similar-clicking many rows, lift to eager batch-level. If they click selectively, the lazy Tier 2 is sufficient and Tier 3 just burns tokens.

Implementation sketch (if/when we go there):
- Background job on `atlas_ingest_batches` row creation: cluster the batch's unmapped paramNames + open queue rows in the same scope via the existing /cluster-suggest internals.
- Persist clusters in a new table `atlas_triage_clusters` keyed by `(batch_id, focal_paramName)` with `verdicts JSONB` + `cached_at`.
- Triage UI shows a "Pre-clustered groups" dashboard tile with one-click Accept per cluster, plus the existing per-row workflow as fallback.
- Cache invalidation on dict-accept: drop clusters where any member paramName became actively-mapped.

## Admin "disable MFR" toggle writes to wrong table — KPI doesn't reflect disables
**Status:** Not started
**Priority:** P2 (silently-broken admin feature; no impact today because no MFRs are disabled)
**Cost:** ~1-2 hours (decide canonical home + migrate writes/reads + drop the loser)
**Trigger:** Surfaced May 27, 2026 while debugging the coverage RPC truncation (Decision #206). The admin UI writes enable/disable to `atlas_manufacturer_settings` (Decision #107). The KPI route at [app/api/admin/atlas/route.ts:121–131](../app/api/admin/atlas/route.ts#L121) prefers `atlas_manufacturers.enabled` and only falls back to `atlas_manufacturer_settings` when `atlas_manufacturers` is empty — which it never is (1,018 rows). Net: the toggle has been a no-op for the KPI display since Decision #161 added `atlas_manufacturers`.

**Fix:** pick one canonical home for the enabled flag.
- **Option A (recommended):** Migrate the toggle UI's PATCH endpoint to write `atlas_manufacturers.enabled` instead of `atlas_manufacturer_settings`. Drop the legacy `atlas_manufacturer_settings` table. One source of truth, no fallback chain.
- **Option B:** Reverse the route's priority — read settings first, atlas_manufacturers as fallback. Less change but keeps the dual-table confusion.

Why this hasn't bitten yet: zero MFRs are currently disabled in either table. As soon as someone disables their first, they'll see the count not change and file a bug.

**Trigger to flip:** when the first MFR disable is needed for real, OR during a periodic admin-UI audit, OR as part of a broader "canonical-source consolidation" sweep.

## Admin MFRs panel: per-MFR Coverage Δ column (since last touching backfill)
**Status:** Not started (planned June 12, 2026)
**Priority:** P2 (closes a real operator visibility gap — today engineers have no in-UI way to see per-MFR backfill impact)
**Cost:** ~4-6 hours (new history table + RPC + close-handler snapshot + manufacturers route field + UI column)

**Trigger:** Surfaced June 12, 2026 after a long Triage session where the global average-coverage indicator moved only 32% → 33% despite ~320 active accepts across 30+ MFRs that the backfill cleanly applied to 100% of products on KEXIN / SWST / YANGJIE / Comchip / Galaxy. A custom diagnostic script ([scripts/triage-impact-diag.mjs](../scripts/triage-impact-diag.mjs)) confirmed the work landed, but the operator had no UI surface to see per-MFR impact. The global headline is unweighted-MFR-average across 181 MFRs and dilutes focused work by 1/181 ≈ 0.55pp per MFR, so even meaningful work appears invisible at the headline. Engineer trust erodes when work shows no surfaceable signal.

**Spec (user-confirmed June 12, 2026):**
- New column in [components/admin/ManufacturersPanel.tsx](../components/admin/ManufacturersPanel.tsx) between Coverage and Improvement Potential.
- Shows `+X.X ppt` (or `−X.X ppt` if regressed) from the LAST backfill that actually changed this MFR's coverage. NOT "since previous backfill" — walk back through history to find the last meaningful touch, so a backfill that didn't move the MFR keeps showing the previous touch's contribution rather than blanking to 0.
- Tooltip: `"Last meaningful change {relative time}: {prev}% → {current}%"`.
- Sortable.

**Implementation outline (see plan at `/Users/robvolkel/.claude/plans/reflective-doodling-unicorn.md` for full detail):**
1. New table `atlas_mfr_coverage_history` (append-only): `(history_id, manufacturer, coverage_pct, scorable_count, total_covered, total_rules, backfill_run_id, snapshot_at)`. Indexes on `(manufacturer, snapshot_at DESC)` and `(backfill_run_id)`. Modeled on `atlas_products_snapshots` ([scripts/supabase-atlas-ingest-pipeline-schema.sql:139-173](../scripts/supabase-atlas-ingest-pipeline-schema.sql)).
2. New RPC `get_mfr_coverage_delta()` returns one row per MFR via `ROW_NUMBER() OVER (PARTITION BY manufacturer ORDER BY snapshot_at DESC)` window. Shape: `(manufacturer, last_coverage_pct, prev_coverage_pct, last_snapshot_at)`. `prev_coverage_pct` is NULL when only one snapshot exists.
3. Schema migration seeds a Day-0 baseline (one row per MFR at current coverage, idempotent via `NOT EXISTS`) so the column isn't empty for weeks while history accumulates.
4. Backfill close handler in [app/api/admin/atlas/backfill-translations/route.ts](../app/api/admin/atlas/backfill-translations/route.ts) lines 168-187: after the existing `writeStatus`, compute fresh per-MFR coverage, compare to latest history row, batch-insert ONLY for MFRs that changed. Call `invalidateManufacturersListCache()`. Try/catch wrapped — snapshot failure must NOT roll back the backfill.
5. Extract per-MFR coverage compute from [app/api/admin/manufacturers/route.ts](../app/api/admin/manufacturers/route.ts) into a shared `lib/services/mfrCoverageCompute.ts` helper so the close handler and the route use one compute path (no drift risk).
6. Manufacturers route calls the new RPC in parallel with existing RPCs, includes `coverageDeltaPpt: number | null` and `lastTouchedAt: string | null` per row. Bump L2 cache version `manufacturers-list-v4` → `v5` (response shape change).
7. Render the column in `ManufacturersPanel.tsx`: chip styling mirrors the Improvement Potential cell (`+X.X ppt` green / `−X.X ppt` red / `—` neutral when null). Extend the existing `sortKey` union with `'coverageDelta'`.

**Verification flow:** apply migration → cold load shows `—` for every row → run a touching backfill → that MFR shows `+X.X ppt` while others stay `—` → run a no-op backfill → confirm idempotent (no new history rows, `+X.X ppt` persists) → run a SECOND touching backfill → delta updates to reflect new touch.

**Why deferred:** the diagnostic script gives the answer on demand for one-off questions ("did my session matter?"). The UI column is quality-of-life polish for routine operator use — worth doing before Triage becomes a routine for additional operators, but not blocking solo workflow today.

**Related:** [Decision #200](DECISIONS.md) Coverage Repair workflow (this column completes the loop); [Decision #202](DECISIONS.md) Improvement Potential (sibling per-MFR metric, forward-looking version of the same idea); the kept-around `scripts/triage-impact-diag.mjs` (ad-hoc analyses beyond what the column shows).

## Triage Accept latency spikes — Supabase service-client pool contention with background recompute (follow-up to Decision #234) (P3)
**Status:** Not started (surfaced June 12, 2026 immediately after the #234 fix landed)
**Priority:** P3 (5x improvement already shipped; spike is bounded and rare)
**Cost:** ~2-3 hours investigation + likely fix

**Symptom.** After reverting per-row dict mutations to single-flight invalidate (Decision #234), warm Accept POSTs land in ~600ms — but rapid-fire third-in-a-row Accepts have been observed at 5.8s, with the dev-server timing breakdown showing 5.1s inside the route handler (compile + middleware look normal: 22ms + 657ms).

**Hypothesis.** The background recompute spawned by Accept N's `invalidateTriageQueueCache()` holds a Supabase service-client connection for the ~20-30s the recompute runs. Accept N+1's INSERT + L2 DELETE need fresh service-client connections; if the underlying HTTP/Postgres pool has reached its concurrent-connection cap, the next Accept queues. Per-call `createServiceClient()` may not be returning a fresh pool slot the way the code assumes — needs verification.

**Investigation:**
1. Instrument the Accept POST path with `console.time` around `requireAdmin()`, the INSERT, and `invalidateTriageQueueCache()`. Identify which step accounts for the 5s.
2. Check `lib/supabase/service.ts` — does `createServiceClient()` share an HTTP agent / connection pool, or create a fresh one each call?
3. Check Supabase project's `max_connections` and current connection usage in the Supabase dashboard during a rapid-fire Accept sequence.

**Possible fixes** (ranked by simplicity):
- (a) Reuse a single module-scoped service client for L2 DELETE inside the cache invalidate (currently creates a fresh one on every invalidation).
- (b) Throttle the background recompute kickoff — coalesce N back-to-back invalidates into one recompute that starts after a short debounce window. Aligns with the existing "single-flight" pattern's intent.
- (c) If pool is the constraint, raise it (Pro plan supports more concurrent connections per Decision #193).

**Not blocking.** The 30s → 600ms baseline improvement holds regardless. This is the next 10x at the tail.

## Backfill UI: stale-status-row trap (button stuck on "Backfilling" after crash)
**Status:** Not started (surfaced June 12, 2026)
**Priority:** P3 (workaround exists — DevTools POST one-liner — but rough edge for non-technical operators)
**Cost:** ~1-2 hours (GET response gains `isStale` flag + UI button reflects it)

**Trigger:** Surfaced June 12, 2026 after a Mac restart killed an in-flight backfill mid-run. The detached child died without writing `lastFinishedAt` to `admin_stats_cache`. GET status returned `lastFinishedAt: null`, so the UI button stayed disabled at "Backfilling" indefinitely. The route ([app/api/admin/atlas/backfill-translations/route.ts:119-134](../app/api/admin/atlas/backfill-translations/route.ts)) enforces a 10-minute stale-lock check **on POST only**, not on GET — so the UI never knows to surface a "stuck — re-trigger?" action. Catch-22: button is disabled because backfill is "in flight," but the operator can't dismiss it without calling POST, which requires the button to not be disabled. Workaround used in the June 12 session: paste `fetch('/api/admin/atlas/backfill-translations', { method: 'POST' }).then(r => r.json()).then(console.log)` into DevTools console — bypasses the disabled button, server's stale-lock check passes, fresh run starts.

**Fix:** GET endpoint should compute `isStale = lastFinishedAt === null && (Date.now() - Date.parse(lastStartedAt)) > STALE_LOCK_MS` and return it alongside the status. UI button shows: `"Backfilling..."` (running, not stale) OR `"Stuck — re-trigger?"` (stale, click fires POST + replaces the stale row). Existing 10-min stale-lock check on POST already handles the takeover correctly; this just makes it discoverable through the UI instead of requiring DevTools.

**Trigger to flip:** next time a non-technical operator hits this OR as part of a broader Backfill UX polish pass.

## FindChips enrichment degrades silently under rate-limit contention
**Status:** Not started
**Priority:** P2 (no impact at current single-user load; becomes real as concurrent users grow)
**Cost:** ~2-4 hours (retry-on-empty + optional UI signal)
**Trigger:** Surfaced June 4, 2026 while debugging "distributor counts missing on search-result cards." Reproduced as two browser tabs sharing one dev-server process. The FC rate limiter is **module-level state** in [lib/services/findchipsClient.ts:255-260](../lib/services/findchipsClient.ts#L255-L260) (`PER_MINUTE_CAP = 60`, shared counter + `minuteResetAt`), so all requests in a process draw from one 60/min budget. A single search fans out to multiple FC calls (source-part commercial + recommendation pricing in 30-50 MPN chunks + card distributor-count batch), so concurrent activity can exceed 60/min. When `acquireRateSlot()` returns `false`, `getSiteResults` returns `null` → empty quotes → `distributorCount`/pricing stay unset.

**The real problem is the *silent* degradation, not the cap itself:**
- `triggerSearchDistributorEnrichment` ([hooks/useAppState.ts:345](../hooks/useAppState.ts#L345)) is fire-and-forget with no retry — a rate-limited empty result is indistinguishable from "FC genuinely has no data," so cards just render un-badged.
- `/api/fc/enrich` still returns **200** when the underlying FC calls were rate-limited (empty `quotes` arrays), so there's no error signal anywhere.
- Same pattern affects deferred recommendation-pricing enrichment (`triggerFCEnrichment`) and source-part commercial enrichment — pricing/stock can silently drop under load with no user-visible cue.

**Fix options:**
- **Retry-on-empty (recommended):** when FC returns empty for an MPN that wasn't a confirmed not-found, retry once after a short backoff (the per-minute window resets in ≤60s). Distinguish "rate-limited" from "genuinely not found" by threading a reason through `getSiteResults` → `/api/fc/enrich` so the client can decide whether to retry.
- **Soft UI signal:** show a faint "pricing unavailable — retrying…" hint on cards whose enrichment came back empty-due-to-throttle, instead of a blank card (avoids the "looks broken" perception this bug created).
- **Raise/parallelize the cap** only after checking the real FC plan limits — the 60/min was a guess (`// adjust based on FC API docs`).

**Trigger to flip:** when concurrent user load grows enough that throttle contention becomes routine (multi-user sessions, large BOM validations), OR the first user report of "prices/distributors randomly missing."

## Audit other TABLE-returning RPCs for PostgREST 1000-row cap
**Status:** Sweep DONE June 25 2026 — one latent RPC remains (`get_cross_ref_counts`)
**Priority:** P3 (preventive; the remaining holdout is 5 rows today)
**Cost:** ~15 min when `get_cross_ref_counts` approaches the cap
**Trigger:** Decision #206 found `get_atlas_coverage_aggregates` was silently truncated by PostgREST's `max-rows=1000` cap. Recurred June 25 2026 (branch `fix/manufacturers-1000-row-cap`): `get_manufacturer_product_stats` (RETURNS TABLE, 1457 groups) capped at 1000 → admin Manufacturers panel read 265 MFRs / 272,691 products vs true 379 / 411,468. Migrated to `RETURNS jsonb`; also paginated the now-1014-row `atlas_manufacturers` plain selects in `app/api/admin/manufacturers/route.ts` + `app/api/admin/atlas/route.ts`.

**Sweep results (June 25 2026, `grep -rn "RETURNS TABLE\|RETURNS SETOF" scripts/*.sql`):**
- ✅ `get_manufacturer_product_stats` — FIXED (→ jsonb).
- ✅ `get_atlas_coverage_aggregates` — already jsonb (#179).
- ✅ `search_atlas_products_admin` — RETURNS TABLE but bounded by `lim` param (≤50). Safe.
- ✅ grounding RPCs (`get_atlas_family_mfr_grounding` / `_grounding_counts` / `_all_family_grounding_counts`) — top-N / one-row-per-family (~43 max). Safe.
- ✅ `atlas_ingest_cleanup_expired` — returns one row. Safe.
- ⚠️ **`get_cross_ref_counts` — RETURNS TABLE, one row per MFR-slug with active cross-refs. 5 rows today. The ONLY remaining unprotected aggregator.** Migrate to `RETURNS jsonb` (wrap in `jsonb_agg(row_to_json(t))`) before distinct cross-ref'd MFRs cross ~1000. Defined in [scripts/supabase-mfr-xref-counts-rpc.sql](scripts/supabase-mfr-xref-counts-rpc.sql); consumed by `app/api/admin/manufacturers/route.ts`.

**Also confirmed:** the lesson generalizes to plain `.from(table).select()` whole-result reads (Decision #232 + this fix) — a stale "~N small rows" code comment is the tell that an assumption went stale under growth.

## CT MICRO opto-SCRs misclassified as B8 (~89 products) — pre-existing data drift
**Status:** Not started
**Priority:** P3 (data quality, low blast radius)
**Cost:** ~30 min (re-ingest CT MICRO via standard --report flow)
**Trigger:** Surfaced May 27, 2026 by Check A of `scripts/atlas-family-signatures-validate.mjs` during the BJT-misclass cleanup session — 89 CT MICRO products (CT3082-4L, CT3053-4L, etc.) sit in B8 (SCR) but their JSON has `c3="Triac, SCR Output Optoisolators"`, which the current `classifyAtlasCategory` routes to E1. The DB classification is stale — likely from an ingest predating the E1 c3-check at [atlasMapper.ts:190](../lib/services/atlasMapper.ts#L190).

**Why deferred:** Not in the 13-MFR BJT-fix scope. The standard re-ingest (`--report` → batch-apply) would correctly flip them to E1 in one pass. The viso signature would also confirm via Check A, but c3 routing alone is sufficient.

**Trigger to flip:** when scoping a CT MICRO-specific re-ingest, or as part of a broader pre-existing-misclass cleanup sweep.

## Value-based family reclassification — extend `reclassifyByParameterSignals` to consume Chinese category values (JJW `cate3` 可控硅 → B8)
**Status:** Not started (added June 2, 2026)
**Priority:** P2 — single MFR surfaced (JJW, ~6,748 products misclassified B4→B8) but the pattern is reusable for any vendor whose category strings carry the family signal.
**Cost:** ~1-2 hours (helper extension + dict coverage for B8 + mirror to atlas-ingest.mjs + scoped backfill JJW)

**Trigger:** Triage AI Investigator on the JJW `cate3` paramName (June 2, 2026) correctly diagnosed that values like `三象限双向可控硅` (3-quadrant bidirectional triac), `四象限双向可控硅` (4-quadrant bidirectional triac), and `标准型单向可控硅` (standard unidirectional SCR) are unambiguously B8 Thyristor descriptors — but the products sit in B4 TVS Diodes. The AI suggested mapping `cate3 → triac_type`, which would have conflated the canonical with E1 Optocoupler output-stage `triac_type` and corrupted cross-family filtering.

**The shape:** Decision #175 introduced `reclassifyByParameterSignals` in [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) for value-based post-correction (B1 + `Type=Bi/Uni` → B4 TVS). This entry extends the same pattern: B4 (or any starting family) + `cate3` containing `可控硅` → B8 Thyristors. Different from Decision #177's `FAMILY_PARAM_SIGNATURES` (which keys on paramName) — here the paramName (`cate3`) is too generic to flag, but the VALUE strings are diagnostic.

**Build:**
1. Extend `reclassifyByParameterSignals` (or add a sibling `reclassifyByValueSignals`) with a value-substring rule: `cate3` value contains `可控硅` → `B8`. Consider broadening to `category` / `分类` / other generic Chinese category param names since the principle is value-based.
2. Verify B8 dictionary covers `cate3` mapping so reclassified products' values surface correctly (currently it lands in B4-flavored handling).
3. Mirror byte-for-byte into [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) per Decision #174 convention.
4. Scoped backfill: `npm run atlas:backfill -- --mfr JJW` to reclassify existing 6,748 rows.
5. Test harness — add a unit test for the new value-based path in `__tests__/services/atlasMapper.test.ts` (or wherever `reclassifyByParameterSignals` lives).

**Why deferred:** No urgency (single MFR, products are merely categorized in the wrong family — still searchable, still returnable). Adding the rule + reclassifying is a clean operation; just hasn't been scoped into a session yet.

**Related caveat:** Galaxy `AEC Qualified` row (also surfaced June 2, 2026) is a different problem class — that's source data quality (numeric values in a Yes/No column), not a value-based family signal. Don't conflate the two.

## Triage UI: surface "requires product-context" marker for cooccurrence sigs
**Status:** Not started
**Priority:** P3 (UX polish)
**Cost:** ~1 hour
**Trigger:** Code review (May 27, 2026) flagged that `detectForeignFamilyWithList` silently skips cooccurrence-required signatures (Ic, fT, Vgs(th), Qg, Vce(sat)) — engineers reviewing Triage rows for those paramNames will never see an auto-flag suggestion even when one would be correct at product level.

**Build:** Add a `coverage: 'partial'` marker to `detectForeignFamilyWithList` results when it skips a cooccurrence-required match. Triage UI renders the matched paramName + a tooltip ("This signature requires product-context evaluation — check the affected products manually"). Or: pass the batch's full unmapped paramName list into the detector and evaluate cooccurrence at batch level.

**Why deferred:** Engineer review is the gate; false negatives at Triage don't cause data corruption, just slightly more manual investigation.

## ~~FAMILY_PARAM_SIGNATURES regex bug — `\b` doesn't match underscore boundaries (B7 BJT misclass cleanup)~~ COMPLETED May 27, 2026
**Status:** Done — see [Decision #207](DECISIONS.md#decision-207--family_param_signatures-regex-bug-fix--cooccurrence-layer-may-27-2026)
**Result:** B7 family dropped from 4,317 → 1,302 (~70% reduction, 3,015 misclassified products fixed across 13 MFRs). Cooccurrence layer added for 5 shared-across-families signatures (Ic, fT, Vgs(th), Qg, Vce(sat)). 1,733 tests pass. Validation harness at [scripts/atlas-family-signatures-validate.mjs](../scripts/atlas-family-signatures-validate.mjs). Follow-ups: B7 cohort domain card regen, B6 domain card refresh.

**Priority:** ~~P1~~ (resolved)
**Cost:** ~3-4 hours (signature audit + co-occurrence design + re-ingest 13 MFRs + spot-check)
**Trigger:** B7 IGBT domain card audit (May 27, 2026) — card prose honestly noted "many B7 MPNs here (2N3904, 2N3906, 2SA1015, BC807, 13001, 2SC945) are actually BJTs misclassified into this family — flag it when vce_sat/eoff absent and only hFE/Vceo present." Followup parameter-signature scan revealed the scope is far larger than the 6 cited MPN families.

**The bug:** [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) signatures use `\b` (word boundary) in their regex patterns:

```js
{ pattern: /^b?(vcbo|vceo|vebo)\b/i, target: B6 }
{ pattern: /^@?ic\b/i,                target: B6 }
{ pattern: /^hfe\b/i,                 target: B6 }
{ pattern: /^ft\b/i,                  target: B6 }
```

In JS regex, `\b` matches between `\w` and non-`\w`. Underscore (`_`) IS a `\w` character, so `\b` does NOT match between `e` and `_`. Result: only the bare forms (`hfe`, `vceo`) match. The real-world Atlas param keys (`hfe_min`, `hfe_max`, `vceo_v`, `bvceo_v`, `v_br_ceo_v`, `vebo_v`, etc.) do NOT match. Signatures effectively never fire on this data.

**Impact at survey time (May 27, 2026):**
- **2,774 of 4,317 B7 products (~64%) are misclassified BJTs** — carrying hFE/Vceo/Vebo/Vcbo/fT (BJT-only datasheet params) but sitting in B7
- Only ~244 B7 products carry IGBT-only keys (vces_max=144, eoff=27, igbt_technology=73)
- B7 family stats, domain card cohort numbers, and matching-engine recommendations are all inflated by the misclassification
- B6 BJTs is correspondingly under-counted

**Affected MFRs (B7 BJT-misclass count):** KEXIN (970), SWST (863), LRC (484), SALLTECH (128), Slkor (86), Jingheng (86), WAY-ON (49), Prisemi (35), MDD (31), Comchip (18), YANGJIE (13), BORN (6), WPMSEMI (5).

**Cross-contamination check passed:** 0 of 244 legitimate B7 IGBTs (with vces_max/eoff/igbt_technology) carry any BJT-unique key. Schema-level BJT/IGBT distinction is clean in the data — only the classifier signatures fail to enforce it.

**Additional finding — overly broad existing signatures:** Beyond the regex bug, two of the four signatures have a separate false-positive risk:
- `/^@?ic\b/i → B6`: reasoning says "Ic is BJT-specific — diodes carry If not Ic." But **IGBTs also have Ic** (collector current is a legitimate IGBT spec — see `ic_max` rule in [lib/logicTables/igbts.ts:119](../lib/logicTables/igbts.ts) and `ic nom(a)` / `ic(a) 100℃` / `ica` in B7 dict at [atlasMapper.ts:1126-1129](../lib/services/atlasMapper.ts#L1126)). Broadening this pattern naively would route legitimate IGBTs to B6.
- `/^ft\b/i → B6`: source code reasoning already acknowledges "high-frequency RF MOSFETs may also spec fT — if a future MOSFET ingest gets misrouted to B6 by this pattern, refine to require a BJT-co-occurring param." The fix here may need to be tied to the co-occurrence work below.

**What this would build:**

1. **Pattern fix** — replace `\b` with `(?:[_\W]|$)` (matches underscore, non-word char, or end-of-string). Catches `hfe_min`, `hfe_max`, `vceo_v`, `bvceo_v`, etc. Still doesn't catch SWST's concatenated forms (`hfehfe`, `hfemax`, `hfeic_ma`) — those would need separate explicit alternation OR a more permissive `/^hfe/i` (with care for false positives).
2. **Signature scope refinement** — for signatures that aren't strictly target-family-unique (Ic, fT), require co-occurrence of at least one strictly-unique BJT signal (e.g., hFE OR Vebo OR Vcbo). This addresses the existing in-source TODO and prevents IGBT/MOSFET false positives.
3. **Mirror to scripts/atlas-ingest.mjs** per Decision #176 mirror convention.
4. **Cross-family validation** — before shipping, query every distinct param key across atlas_products and verify the new patterns only match keys present in B6/B7 (not in B5, C, D, E, F, or passive families).
5. **Re-ingest the 13 affected MFR source files** via the normal `--report` → batch-approval pipeline (Decision #174). With fixed signatures, batches will correctly stage family_id changes B7 → B6. Engineer approves via admin UI; 30-day snapshot revert available.

**Verification plan before shipping:**
- Test new patterns against all current param keys across B5/B6/B7 — should NOT match any non-BJT keys
- Test against the 244 legitimate B7 IGBTs identified — should NOT route any of them to B6
- Dry-run `--report` on WPMSEMI first (smallest at 5 misclass rows) — verify batch shows correct family_id flip
- Scale up to all 13 MFRs after WPMSEMI validates

**Why deferred (May 27, 2026):**

- Discovered during a card audit (B7) that's still Approve-able as-is — the card prose honestly describes the misclassification
- The fix is a multi-step engineering task (signature audit + co-occurrence logic + cross-family validation + 13-MFR re-ingest), not a quick regex tweak
- Bundling it into a card audit session would have crossed two unrelated concerns and exceeded scope
- The data is wrong but stable — fixing it is a focused project, not an emergency

**Trigger to flip from defer to ship:** when scoping a multi-MFR data quality sprint OR when a domain card audit for B6 BJTs needs to start (the inflated B7 cohort + under-counted B6 cohort would force this same diagnosis).

**Cross-reference patterns:**
- Decision #177 (foreign-family auto-flag registry) — this IS that registry; the bug is in the regex patterns it ships with
- Decision #188 (engineer-driven FAMILY_PARAM_SIGNATURES via DB + one-click reclassify) — the DB-layer add-ons work the same way and may have the same `\b` issue if engineers wrote patterns following the existing examples
- "Ingest-time Schottky / small-signal diode auto-routing (B1 misclassification cleanup)" entry below — similar shape (MPN-prefix-driven misclassification cleanup) for a different family pair (B1↔B2)

**Files involved:**
- [lib/services/atlasFamilyParamSignatures.ts](../lib/services/atlasFamilyParamSignatures.ts) — fix patterns + add co-occurrence logic
- [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs) — mirror per Decision #176
- 13 source files under `data/atlas/` for re-ingest

## Per-MFR coverage audit — surface vendor-specific paramName spellings that miss dict
**Status:** Not started
**Priority:** P2 (recurring pattern — Galaxy was 7,500 products of broken translation)
**Cost:** ~2 hours standalone script; ~4-6 hours with UI integration
**Trigger:** June 1, 2026 — Galaxy MFR coverage drawer showed `Missing` on ~every B1 attribute despite Galaxy publishing complete parametric data. Root cause: Galaxy uses a uniform vendor-specific column-naming convention (`VRRM (V) max`, `IF (A) max`, `IFSM (A) max`, etc. with trailing ` max` suffix) that no other MFR uses. The aliases never reached the B1/B3/B4/B5/B6 dict blocks. Three existing surfacing mechanisms — Triage queue, Coverage drawer, per-MFR drilldown — all have blind spots that aligned: Triage aggregates by paramName across MFRs so Galaxy's unique spellings ranked low despite high per-MFR impact; Coverage drawer renders "Missing" identically whether the spec is unpublished OR mis-keyed; the dict was built incrementally as new MFRs were added without a systematic per-MFR vendor-spelling audit.

**Build (option A — standalone script):** `scripts/atlas-audit-mfr-paramname-coverage.mjs` — given `--mfr <name>` or `--all`, walk every MFR's products in `atlas_products`, extract the set of unique raw paramNames per family per MFR (or read from `data/atlas/mfr_*_params.json` if pre-ingest), check each against the merged dict (atlasMapper.ts + active dict overrides), output a per-MFR-per-family table:
```
Galaxy (B1 Rectifiers — 2,659 products):
  ✓ Configuration (2,547 / 2,659)  → configuration
  ✗ VRRM (V) max (2,659)           → unmapped, suggest: vrrm
  ✗ IF (A) max (2,659)             → unmapped, suggest: io_avg
  ...
  Coverage: 1 / 20 paramNames mapped (5%)
```
Flag any MFR-family combo where >50% of high-volume paramNames are unmapped. Include AI-assisted suggestion column (Sonnet 4.6 with same prompt as Triage `/suggest`) so engineer review is fast. Read-only — operator runs separately, decides which suggestions to promote to dict overrides.

**Build (option B — admin UI integration):** Add a "Vendor-spellings audit" column to the existing Manufacturers admin panel ([components/admin/ManufacturersPanel.tsx](../components/admin/ManufacturersPanel.tsx)). For each MFR row, run option A's audit on-demand or as a background job, render a coverage-style chip (🔴 <20% / 🟡 20-50% / 🟢 >50% paramName→canonical). Click chip to open a drawer with the unmapped paramNames + AI suggestions + per-row "Add to dict override" button. Mirrors Decision #200's Coverage Repair workflow but for paramName-coverage instead of attribute-coverage.

**Recommendation:** Ship A first (cheap, immediate value — operator runs `npm run atlas:audit-paramnames -- --mfr <name>` whenever a new MFR is added, OR scheduled monthly across all MFRs). Promote to B if A surfaces 3+ MFRs with the same systematic gap as Galaxy (then UI integration earns its keep).

**Why this matters:** Galaxy is unlikely to be unique. Any MFR with strongly-templated catalog metadata (auto-generated from a single internal schema) will have uniform vendor-specific column naming. Without this audit, each MFR's gap stays hidden until someone manually opens the Coverage drawer for that specific MFR. The cost of one Galaxy-class miss is ~50 alias additions + 5-10 min backfill — small per incident, but compounds across MFRs and erodes trust in coverage metrics that drive Decision #200 prioritization.

## Domain Card audit: context-aware short-ASCII MFR matcher
**Status:** Not started
**Priority:** P3 (quality of life)
**Cost:** ~3 hours
**Trigger:** Decision #204 added TC/BC/RS/CS to `MFR_NAME_BLOCKLIST` for engineering-abbreviation collisions. The pattern keeps recurring as more cards are reviewed — every new 2-letter MFR code in `atlas_manufacturers` is a potential false-positive landmine.

**Build:** Replace the bare exact-case word-boundary regex for short-ASCII MFR names with a context-aware matcher. Signals to require BEFORE accepting "TC" as a MFR mention: (a) preceded by a known MFR-list separator (`,`, `;`, `(`, or list intro like "MFRs include"); (b) followed by a quoted descriptor like `(W-prefix)` or by `ships` / `MPNs`; (c) appears in a Markdown bullet list of MFRs. Reject if surrounded by parametric prose ("vh", "@Tc=80°C", "RS-485", "CS latch").

**Why deferred:** Blocklist approach is now at 25 entries (HT, SY, THD, TLC, TR, SST, HR added across recent card-audit sessions). Inside the original 20-30 trigger range — the next 2-3 additions should prompt a build decision. Still no real card-content miss (trade remains documented and intentional).

## C7 Interface ICs: promote remaining deprioritized aliases
**Status:** Not started
**Priority:** P3
**Cost:** 1 hour
**Trigger:** Decision #204 cleanup promoted 3 of ~10 deprioritized aliases in the C7 dict. Remaining `_*` entries (atlasMapper.ts:1383-1429): `_common_mode_range`, `_remote_wakeup`, `_supply_voltage`, `_low_power_current`, `_isolation_rating`, `_integrated_power`, `_supply_voltage_range`, `_output_mode`, `_channels`, `_reverse_channels`, `_default_output`, `_cmti`, `_surge_rating`, `_cmti_dynamic`, `_drivers`, `_receivers`.

**Build:** For each entry, check whether a real canonical exists in logic table or other family dicts. Where one exists (e.g. `cmti_kv_us` exists at ICs level, `_cmti` should promote), update mapping. Where no canonical exists yet, leave deprioritized but document.

## length_mm / width_mm canonicals for power inductors
**Status:** Not started
**Priority:** P3
**Cost:** 1 hour if just adding rules; 2 hours including update to powerInductors.ts logic table
**Trigger:** Decision #204 family 71 dict cleanup added `_length_mm` / `_width_mm` deprioritized aliases for `长(公釐)` / `宽(公釐)` because no real canonical exists. Card claims these are "separate canonicals from package_case" but only `height` actually scores.

**Build:** If power inductors should match on length/width separately (e.g. for non-standard packages where the package_case string doesn't carry dimensions), add rules to [lib/logicTables/powerInductors.ts](../lib/logicTables/powerInductors.ts) and promote the dict entries. Otherwise, slightly rewrite the family-71 domain card to honestly say "height is a separate canonical; length/width preserved as data only."

## Atlas C7 ESD remap verification: HBM vs bus-pin semantic check
**Status:** Not started
**Priority:** P3 (data quality)
**Cost:** ~30 min spot-check + corrective fix if needed
**Trigger:** Decision #204 C7 dict cleanup remapped all 4 ESD entries (including `esd hbm(kv)`) to `esd_bus_pins`. HBM (Human Body Model) is typically a chip-level pin spec, NOT specifically bus-pin. For transceivers the bus-pin rating dominates so it's likely a safe move, but worth verifying a few products post-backfill to confirm no values look wrong (e.g. a 2kV HBM value showing as `esd_bus_pins` when the bus pins are actually rated higher).

**Build:** After running `npm run atlas:backfill`, pick 5 C7 products that have both `esd hbm(kv)` and another bus-pin ESD field in their JSONB, verify the final `esd_bus_pins` value is the bus-pin rating not the HBM value. If wrong, split `esd hbm(kv)` back to `esd_rating` or a new `_esd_hbm_kv` deprioritized canonical.

## Domain Card audit: section-aware Chinese-label verification
**Status:** Not started
**Priority:** P3 (quality of life — defer until real catch surfaces)
**Cost:** ~3-4 hours (survey + regex + implementation + .mjs mirror + UI + tests)
**Trigger:** May 27, 2026 family 58 review — operator pasted card text after a screenshot misread suggested a hallucinated Chinese term (`漏理电流` instead of dict's `漏泄电流`). Misread, not a real hallucination, but exposes a real gap: cards have explicit `CHINESE LABELS:` / `CHINESE CONVENTIONS:` sections listing Chinese param names that are implicit claims they're in the dict, and the existing FABRICATED_DICT check only fires near explicit `→` / `'identifier'` mapping syntax. Section-listed terms in plain prose are not currently verified.

**Build:** New CHECK 5 `UNVERIFIED_CHINESE_LABELS` in both `lib/services/atlasFamilyCardAudit.ts` + `scripts/atlas-audit-domain-cards.mjs`. Detect known section headers (CHINESE LABELS, CHINESE CONVENTIONS, CHINESE PARAM DICTIONARY, CHINESE TERMS, etc.), extract each Han phrase from the section body, verify each against atlasMapper.ts + accepted overrides + traditional→simplified + slash compounds (reuse existing logic in a new `isChinesePhraseInDict()` helper). Add `unverifiedChineseLabels: UnverifiedChineseLabel[]` field on `CardAuditResult`. WARN-level initially (matches FABRICATED_DICT pattern); promote to BLOCK after validation against existing cards.

**Why deferred:** Section-header detection across cards is more variable than expected (saw 3 different shapes in 20-card review: `CHINESE LABELS:`, `CHINESE CONVENTIONS (use verbatim...):`, `CHINESE — use dictionary verbatim;`). Implementing without first surveying every existing card's text risks shipping a regex that over- or under-extracts. AND no real hallucination of this class has actually been observed across ~20 reviewed cards — the signal is hypothetical. Revisit when (a) a real Chinese-label hallucination surfaces on a future card OR (b) we're already in the audit code for another reason.



## Triage "needs regen" banner is client-only state — lost on navigation
**Status:** Not started
**Priority:** P3 (workaround exists — per-batch Regen on Atlas Ingest page)
**Cost:** ~1-2 hours (localStorage interim) or ~3-4 hours (derived from server signal)
**Trigger:** May 29, 2026 — operator working through Triage accepted ~30 overrides across multiple batches, then navigated to Atlas Ingest tab to check Proceed All Clean status. On return to Triage the "16 batches need regen" pill + "Regen affected batches" button were gone, but the underlying batches' displayed risk classifications were still stale (accepted overrides are live in DB, but per-batch IngestDiffReports hadn't been re-run, so dashboard `risk` chips and `Proceed All Clean (N)` count don't reflect the new override-resolved state). `pendingRegenIds` is `useState<Set<string>>` in [AtlasDictTriagePanel.tsx:116](../components/admin/AtlasDictTriagePanel.tsx#L116) — resets on component unmount.

**Build (two options):**

*Interim — localStorage persistence* (~1-2h): Mirror the `Set<batchId>` to localStorage on every `setPendingRegenIds` call; rehydrate from localStorage in the `useState` initializer. Per-browser, per-machine. Survives tab close + navigation. Doesn't help cross-device. Cache prefix `atlas-triage-pending-regens:`.

*Structural — derived from server signal* (~3-4h): Add `overridesAcceptedAt` column to `atlas_ingest_batches` set at batch upload time (or last regen time). On every triage queue render, compare against per-family `MAX(updated_at) FROM atlas_dictionary_overrides WHERE family_id IN (batch_family_ids) AND is_active`. If MAX > batch.overridesAcceptedAt, batch needs regen. Compute in the triage queue RPC, return boolean per row, aggregate to the banner. Cross-session, cross-device, can't be lost. Mirrors Decision #187's `schemaVersionAtWrite` pattern (same "compare stored hash against current state" shape).

**Recommendation:** ship interim (localStorage) first if banner-loss repeats; promote to structural if the related Decision #187 override-revoke staleness work (separate backlog entry above) is also being scoped — both can share an `overridesVersion` signal infrastructure.

**Why deferred:** Workaround is cheap (operator clicks per-batch Regen on Atlas Ingest page before clicking per-batch Proceed, as confirmed in the session that triggered this entry). Accepted overrides themselves are live regardless — semantically correct, just dashboard metrics are stale. Not a data-correctness bug. Re-evaluate if (a) banner loss repeats in a future operator session OR (b) the Decision #187 override-version signal lands first (then this becomes a ~30-min UI consumer of that signal).

## Triage /suggest cache staleness: extend Decision #187 to override-revoke events
**Status:** Not started
**Priority:** P3 (workaround exists — manual edit + accept per row)
**Cost:** ~2-3 hours
**Trigger:** May 29, 2026 — three family-65 Varistor Triage rows surfaced in one session (JJW `Capacitance @ 1KHz (pF)`, Yint `cap .Ref @1kz pf`, Semiware `Capacitance (pF)`) all citing the revoked `capacitance_khz` canonical as "previously accepted." Same-day revoke of the bad override via `scripts/atlas-revoke-bad-canonical.mjs` did not invalidate `/suggest` cache because Decision #187's staleness model derives `schemaVersionAtWrite` from logic-table rules + FAMILY_PARAM_SIGNATURES — not from override DB state.

**Build:** Add a parallel `overridesVersion` signal (or extend `schemaVersion` if cleaner) computed per `(family_id, category_key)` as a hash over active `atlas_dictionary_overrides` rows scoped to that family/category. Bump on every override insert/update/revoke. `/suggest` and `/investigate` return the current value; client compares against cached entry's `overridesVersionAtWrite` the same way it currently compares schema/card versions. Stale rows get the existing amber stripe + dotted-border chip + ↻ refresh icon. Cache prefix bump: `SUGGEST_CACHE_VERSION='v8'`, `INVESTIGATE_CACHE_VERSION='v10'` (or whatever the next increment is at build time).

**Why deferred:** Workaround is cheap per row (engineer edits attributeId before accepting, same as Coverage Repair flow). Pattern only emerged at 3 instances within one session — needs more data before we know if it's a recurring class or a one-off byproduct of the May 11 low-confidence accept. If a fourth family-65 row OR any non-65 family shows the same cached-revoked-canonical pattern, that's the trigger to build.

## Promote cross-family canonicals to SHARED_PARAMS once reused ≥3 times
**Status:** Not started
**Priority:** P3 (housekeeping)
**Cost:** ~1 hour per promotion
**Trigger:** May 29, 2026 — Triage accepted `test_current` (canonical originally introduced in the LED dict block at [lib/services/atlasMapper.ts:2023](../lib/services/atlasMapper.ts#L2023) for `Vf @ IF`) for a B4 TVS row mapping `@IT (mA)` to the same canonical for `Vbr @ IT`. Semantic meaning is generic ("test current at which a spec is reported"), so cross-family reuse is correct, but the canonical still lives only in the LED family's dict and gets duplicated each time another family adopts it.

**Build:** When a canonical's dict entries exist in 3+ family blocks for the same semantic concept, lift to `SHARED_PARAMS`. First candidate: `test_current` (LED → B4 → ?). Watch list for likely future promotions: any "test current / test condition" attributes, any "at-condition" qualifiers.

**Why deferred:** Only two families use `test_current` today; lifting prematurely adds churn without payoff. Re-evaluate when a third family wants it (or any other dict entry hits the same 3-family threshold).

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

### Domain card auto-audit on generation + Activate gating (Decision #195 Phase 2 — added May 21, 2026)

Phase 1 of Decision #195's auto-audit pattern shipped today as a CLI script (`scripts/atlas-audit-domain-cards.mjs`). Phase 2 wires it into the Generate flow so the engineer never has to remember to run it.

**Scope:**

1. **Extract audit logic from `.mjs` script to a TS service module** — `lib/services/atlasFamilyCardAudit.ts` exporting `auditFamilyDomainCard(familyId, cardText): Promise<AuditResult>`. The .mjs stays as the CLI entrypoint (imports from the new module, or duplicates the logic per the atlas-ingest.mjs precedent for standalone runs).
2. **Schema migration:** add `audit_results JSONB` column to `atlas_family_domain_cards`. Stores the latest audit findings + computed_at timestamp. Idempotent `ADD COLUMN IF NOT EXISTS`.
3. **Generate endpoint hook:** [/api/admin/atlas/family-domain-cards/[familyId]/generate/route.ts](../app/api/admin/atlas/family-domain-cards/[familyId]/generate/route.ts) runs the audit immediately after the Anthropic call returns and persists results alongside the draft card. Failure modes documented: if audit throws, persist the card anyway with `audit_results: { error: '...' }` — don't block Generate on audit failure.
4. **UI: audit results panel** in the existing card review UI ([components/admin/AtlasDomainCardsPanel.tsx](../components/admin/AtlasDomainCardsPanel.tsx) or wherever cards are reviewed). Default-expanded showing pass/fail summary; expand-on-click for per-issue detail. Same visual language as Triage's foreign-family warnings (Decision #177).
5. **Manual "Re-run audit" button** for cases where `atlas_products` has changed since the audit was last run (e.g. operator applied a batch that brought new MFRs into the family). POSTs to a new route `POST /api/admin/atlas/family-domain-cards/[familyId]/audit` that re-runs + persists.
6. **Activate gating with configurable threshold** — the riskiest piece, do last. Add an audit-severity score (e.g. count of BOGUS_MFR + WRONG_PREFIX + FABRICATED_DICT issues — those are the high-confidence-of-actual-error categories; MFR_OMISSION is editorial soft signal). When `severityScore > threshold` AND audit has run, the existing Activate action shows a warning + requires a typed confirmation ("I understand this card has N flagged issues") before proceeding. Threshold initially hardcoded; expose as admin config (`atlas_family_card_settings` row?) only if needed. **Do NOT silently block** — engineer must always be able to override with intent.

**Why phase this:**
- Pieces 1–4 are additive (new column, new module, new UI panel). Low risk.
- Piece 5 is also additive (new route, new button).
- Piece 6 modifies an existing user workflow (Activate). That's the gate-change shape that bit us during the May 20 cascade — easy to get wrong, deserves focused attention with `/ultrareview` before commit.

**Recommended order for the session:**
1. Schema migration first (apply via Supabase SQL Editor — engineer runs manually; no service-role schema changes from script)
2. Extract audit to TS service + type-check
3. Generate endpoint hook + verify a fresh Generate call writes `audit_results`
4. UI panel + verify rendering in dev
5. Manual re-run button + verify
6. Activate gating — propose diff, get approval, ship, `/ultrareview`
7. Update DECISIONS.md (this entry → resolved + Decision #195's Phase 2 status updated)

**Estimated effort:** 2.5–3h focused session. Solo dev — propose-plan-before-code on Piece 6 specifically.

**Open questions to resolve in the next session:**
- Should `audit_results` invalidate automatically when atlas_products changes (any ingest apply)? Or only on manual re-run? Trade-off: stale audits vs operational cost of re-auditing all cards on every batch apply.
- Severity threshold default — start at 1 (any non-omission issue blocks)? Or 3 (multiple issues)? Likely needs a few weeks of real-card data to tune.
- Does Activate gating apply to BOTH new card activations AND re-activations after Regenerate? (Probably yes — same risk surface.)

### Apply auto-audit pattern to other AI-generated content (Decision #195 Phase 3 — added May 21, 2026)

Phase 2 ships auto-audit for family domain cards specifically. The structural risk applies equally to:
- **Triage AI suggester verdicts** ([/api/admin/atlas/dictionaries/suggest/route.ts](../app/api/admin/atlas/dictionaries/suggest/route.ts)) — Sonnet returns `'accept' | 'defer'` + explanation. Verdict shape is already constrained by tool-use enum (good); explanation prose isn't (potential drift).
- **Triage AI investigator action buckets** ([/api/admin/atlas/dictionaries/investigate/route.ts](../app/api/admin/atlas/dictionaries/investigate/route.ts)) — six-bucket verdict + evidence claims. Bucket is enum-constrained; evidence prose isn't.
- **AI override-suggestion explanations** that engineers read when deciding to Accept.

For each, identify what factual claims the AI makes + whether a deterministic ground-truth source exists for verification. Where it does, run the same pattern (auto-audit alongside generation, surface findings in UI, optional gating). Where it doesn't (subjective explanations, judgment calls), leave alone.

**Triggers that flip from defer to ship:**
- Operator reports surprising AI verdict in any of the above (similar to the C4 cheat sheet review that prompted Decision #195).
- A spot-check audit finds >15% factual-claim error rate in any AI surface.

**Effort:** ~2h per surface (similar shape to Phase 2). Schedule one surface per session.

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

### ~~Engineer cleanup pass — accepted overrides where attribute_id is not in the family logic table (Decision #192 follow-up)~~ DETECTION SHIPPED May 21, 2026

**Script shipped:** [scripts/atlas-audit-orphan-canonicals.ts](../scripts/atlas-audit-orphan-canonicals.ts) — `npx tsx scripts/atlas-audit-orphan-canonicals.ts` (or `--family <id>` / `--min-volume <n>` / `--json <out>`).

**First-run findings (May 21, 2026):**
- 23 L3 families scanned, 14 with orphans
- 50 orphan rows / 507 active overrides (~10% rate — tracks Decision #192's spot-check)
- 31 distinct orphan attributeIds: 22 real orphans need engineer decision, 9 already satellite-tagged (`_name`)
- Top concentrations: **C2 Switching Regulators 36% orphan rate** (9 rows), **71 Power Inductors 20%** (9 rows including `典型值溫升電流 → length_mm` — a totally unrelated mismap), **B5 MOSFETs 11%** (7 rows including the Decision #192 example `vgs_th_max` / `vgs_th_min`).
- L2-category overrides (241 of them, Decision #178 scope-overload) correctly skipped — no logic table applies.

**Still TODO (the engineer-decision pass):** for each orphan, decide (a) re-route to existing canonical, (b) add new rule to logic table, or (c) leave as display-only with satellite `_name` rename. Highest-leverage: walk the C2 (9 orphans) and 71 (9 orphans) lists first — those are concentrated enough that fixes will visibly drop the orphan rate. Re-run the script after each batch of decisions to see the count fall.

**Rerun cadence:** every ~50–100 accepts, or quarterly. Light recurring engineer task. Script is read-only, idempotent — no DB writes.

**Original framing kept for context:** orphans don't fail at runtime — they produce display-only attributes that silently don't participate in matching-engine scoring. Failure mode: when family schema lacks exact canonical, Sonnet picks close-but-not-quite (sibling attribute like B5 `vgs_th_max` vs canonical `vgs_th`, related-but-distinct rule, or broadened L2 generic). Long-term effect: schema fragmentation. May 18, 2026 spot-check of 20 random recently-accepted overrides found 85% precision (17 ✅ / 3 ⚠️ / 0 ❌).

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

**Additional trigger evidence (May 22, 2026):** YFW B4 (TVS Diodes) `gaia-capacitance-Typ` row in Triage shipped sample values 0.05 pF → 4100 pF — 5 orders of magnitude. Real TVS Cj is sub-100 pF; 4100 pF is varistor / MLCC territory, indicating non-TVS products got swept into the B4 family by Gaia extraction. Mapping (`cj`) is correct; the data-quality issue is upstream. Pattern: now have two distinct MFRs (KEXIN, YFW) shipping physically-implausible values, suggesting this is recurring enough to warrant the ingest-time check rather than relying on engineer Triage review to catch.

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

**Update (Decision #239, June 2026):** the anti-pattern recurred — a greenfield "I need a part for X" request fell through the shape-scoped rules (#166 MFR / #172 replacement / #173 post-recs) and the agent recited ungrounded MPNs/specs from memory (incl. a PNP when NPN was asked). Fixed with a *4th* standalone "Part-selection-advice discipline" block. This raises the priority of the consolidation: the global block should fold all four (#166/#172/#173/#239) into one referenced floor. Extra caveat for the design — `chat()` runs on Haiku 4.5, where abstracted/consolidated discipline may hold less reliably than the per-shape spelled-out form (cf. the deferred "mechanical claims you can make" entry below); validate adherence on Haiku before deleting the spelled-out blocks.

**Update (Phase 0 underway, June 19 2026):** the refactor is now in progress on branch `refactor/chat-system-prompt`. Phase 0 (safety net) shipped: a behavioral regression checklist ([docs/chat-prompt-regression-checklist.md](chat-prompt-regression-checklist.md)) — 19 scenarios, one per prompt rule, traced to its originating failure — was run on Haiku to record a baseline: **17 PASS / 1 FAIL / 1 N/A**. **Key finding that reshapes the consolidation:** the grounding floor *holds in STRUCTURED contexts* (where the prompt hands the model a block to read — source-part block, recs block, profile-tool result all clean) but *LEAKS in free-prose "My read" closings* — the one FAIL (greenfield A3) searched correctly then asserted an ungrounded hFE spec as an "exact" match, with softer leaks on the cert-audit/answer-first closings. So the consolidated floor must explicitly govern *free-prose elaboration*, not just per-block contexts. Two bonus findings logged in the checklist: (a) an internal contradiction — `SYSTEM_PROMPT` §"Search result presentation" "NEVER describe specs in text" vs ASK-mode (Workflow step 5a) "answer from the data" (reconciled in Phase 1); (b) the "excluded manufacturers" rule (§"When User Context is provided") has no UI input surface — verify it's wired via the My-Profile extractor or delete as vestigial. Phased plan (risk-ordered): **Phase 1** pure reorg (lift MFR block out of step 5(e), group tool-routing, de-dupe, reorder, reconcile the contradiction) → **Phase 2** move enforcement to deterministic code where covered → **Phase 3** the grounding consolidation (high-risk; keep belt-and-suspenders reminders, validate on Haiku, revert per-step if any CRITICAL row regresses). Acceptance gate: CRITICAL+HIGH rows passing at baseline must stay passing each phase (A3 exempt-but-tracked). **Phase 1 (reorg) shipped June 21 2026 (commit `d812cc2`, merged to main as `8f20bc2` on June 21 2026):** the 15-section restructure + the 4 dedups + the ASK-mode reconciliation landed; the checklist was re-run on Haiku and the acceptance gate passed (every CRITICAL+HIGH PASS row held; A3 still FAIL, exempt). Also folded in a user-prioritized next phase — guided/exploratory part selection — ahead of Phases 2-3.

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

### Qualification-domain Phase 2 — MFR classifier coverage (Decisions #155, #196)

**Promoted by #196 (May 2026)** — now the obvious next step. The matrix was tightened to hard-exclude `commercial` / `industrial_harsh` candidates under automotive context, but the filter only fires when a classifier has positive evidence the part is NOT automotive. Today only Murata MLCCs have a classifier, so most other MFRs land in `unknown` and pass the gate. That's correct given Atlas data gaps, but it means TDK CGA / Samsung CL / Yageo AC parts (which ARE automotive-qualified) currently show un-promoted from `unknown` rather than as confirmed-qualified.

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

## B5 dual-MOSFET handling — `num_channels` logic rule + composite Channel parser
**Status:** Not started
**Priority:** P2 (matching correctness gap)
**Cost:** 1-2 days (logic rule + tests + ingest parser update + mirror to atlas-ingest.mjs)
**Lead time:** Anytime
**Trigger:** When a customer reports a dual-MOSFET cross that shouldn't have passed (or proactively to close a known false-positive class).

The B5 logic table has `channel_type` (polarity: N/P/Complementary) but no `num_channels`. Today, dual MOSFETs (e.g. SOT-363 dual-N in one package) cross-reference against single MOSFETs as if equivalent on the channel dimension — wrong for matching because dual ≠ two singles (shared substrate, different footprint, thermal coupling, board real estate).

Discovered May 23, 2026 during Triage of the "Channel" param on B5 (1,433 products, 3 MFRs — SWST, etc.). Sample values are `"1"`, `"Dual N"`, `"Dual P"`, `"Dual N/P"`, `"Dual-N"` — composites that encode both polarity AND count.

**Three-part fix:**

1. **Logic table:** add `num_channels` rule to B5 (likely `identity`, weight 7-9, blocking — dual cannot substitute for single).
2. **Ingest mapper:** extend the B5 path in [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs)' `mapModel` so that composite values like `"Dual N"` produce TWO JSONB entries: `channel_type='N'` + `num_channels=2`. `"Dual N/P"` → `channel_type='Complementary'` + `num_channels=2`. Mirror into [lib/services/atlasMapper.ts](../lib/services/atlasMapper.ts) per the duplicated-by-design convention.
3. **Dict override:** map `'channel'` → `channel_type` at B5 scope (already done as the workaround). Once the rule + parser ship, the composite values get split correctly.

**Why deferred from the May 23 session:** the in-band fix was to accept `channel_type` and capture polarity (the more critical gate). The dual/single false-positive is a real but lower-volume failure mode worth scheduling, not blocking on.

**Related concern:** B4 TVS has `channel → num_channels` at L4 (signal-line count for ESD arrays). Semantically distinct from B5's MOSFET-conduction-channel sense. The two `num_channels` canonicals share a name but mean different things across families — that's fine because logic-table scope is per-family, but worth a comment in both rules so a future refactor doesn't try to unify them.

## Near-miss canonical detector (Coverage Repair view)
**Status:** Not started
**Priority:** P2 (engineer-productivity, large coverage upside)
**Cost:** 2-3 days (analyzer + admin route + table view)
**Lead time:** Anytime — high ROI per hour spent.
**Trigger:** After SWST/Good-Ark/INPAQ-tier MFRs are sitting at <30% coverage and the Triage queue isn't surfacing the easy wins (`package_outline → package_case`, `aec_q101_qualified → aec_q101`-style 100%-of-products one-line accepts).

The Triage queue surfaces *raw unmapped params* — but the ingest mapper has a fallback that stores unrecognised params as sanitized-English JSONB keys (`package_outline`, `aec_q101_qualified`, `vfif_a`). Those become silent uncanonicals — they ARE flagged into the Triage queue but volume-prioritisation today doesn't make them obvious. Meanwhile, the Coverage Drawer per Decision #69 shows what canonicals are *missing* per MFR but doesn't show what near-miss keys are *present*. Two halves of the same picture, only one rendered.

**Build:**

1. **Analyzer** (`lib/services/coverageRepairAnalyzer.ts`): for each (MFR, family) tuple, compute the diff between (a) family rule attrIds and (b) uncanonical JSONB keys actually present in that MFR's atlas_products rows. Rank candidate near-misses by:
   - Edit distance / substring overlap (e.g. `package_outline` vs `package_case` — high overlap → high candidate score)
   - Product reach (how many products carry the near-miss key)
   - Rule weight of the missing canonical (only suggest the swap if filling it would actually move coverage)
2. **Admin endpoint** `GET /api/admin/atlas/coverage-repair?manufacturer=<slug>`: returns top-N near-miss candidates with `{ rawKey, suggestedCanonical, productCount, weight, projectedCoverageDelta }`.
3. **UI**: new Coverage Repair tab (or expanded inline section) on the per-MFR detail page (`/admin/manufacturers/[slug]`). Each row has one-click Accept that creates the dict override + queues a backfill.

**Why this is decision-critical:** today, the user looked at SWST's 15% coverage and assumed it was a real ceiling. Actual cause was two missing accepts (`package_outline → package_case` 100%, `aec_q101_qualified → aec_q101` 11%) that would jump SWST to ~25%+ in one apply. Without surfacing this signal, low-coverage MFRs stay low until someone manually inspects them.

## Auto-trigger backfill (cron + dict-mutation threshold)
**Status:** Not started
**Priority:** P3 (ergonomic — manual button works fine for current usage)
**Cost:** Half-day per trigger mechanism
**Lead time:** Anytime
**Trigger:** When the "Refresh from accepts" button gets clicked daily-or-more, OR when we forget to run it for a week and customer-facing coverage % drifts stale.

Decision #200 shipped a manual "Refresh from accepts" button. Two upgrades to evaluate once we see real usage patterns:

1. **Nightly cron** (~1 line of vercel.json or platform equivalent): runs `npm run atlas:backfill` at 02:00. Removes the engineer-remembers-to-click step entirely. Safe — backfill is idempotent.
2. **Dict-mutation threshold trigger**: count `atlas_dictionary_overrides` rows created since last backfill run. If ≥ N (e.g. 25), surface a banner in admin: "25 accepts pending backfill — run now?". Or auto-run if ≥ N (e.g. 50).

Either covers the "I forgot to click the button" failure mode. Both are cheap to add — the script + status row + invalidation hook are all in place from Decision #200; only the trigger surface is new.

**Why deferred from #200 ship:** wanted to see how often the manual button actually gets used before optimising. If usage is daily, cron is the right answer. If usage is weekly, threshold-based-banner is better signal-to-noise. If usage is monthly, neither — manual stays.

## MFR profile spreadsheet ingest — REJECTED (2026-05-26)
**Status:** Rejected. Do not build unless trigger conditions met.
**Priority:** N/A
**Cost:** ~36 engineer-hours if revisited

Engineer asked whether to extend `/admin/atlas/ingest` with a spreadsheet upload path for MFR profile data (team sends recurring spreadsheets with profile fields). Plan agent produced a detailed design (parallel snapshot table, per-field provenance JSONB, column mapping dialog, row-by-row diff UI, conflict resolution, atlas-api-sync update for provenance respect).

**Why rejected:** Atlas API (`https://cn-api.datasheet5.com`, consumed via [scripts/atlas-api-sync-profiles.mjs](../scripts/atlas-api-sync-profiles.mjs), Decision #139) is the single source of truth for MFR profile data. Adding a spreadsheet pipeline would create a second source, route around an upstream data-quality problem, and force ongoing provenance + conflict-resolution maintenance. Correct path: team-supplied spreadsheets become input artifacts for IT to update the upstream API; subsequent atlas-api-sync runs propagate the improvements automatically. One source of truth, all consumers benefit.

**Revisit trigger:** Only build if BOTH of the following become true:

(a) Team data is structurally unsuitable for the upstream API (e.g., it's customer-specific, proprietary, or NDA-protected and cannot live in a shared external system); AND
(b) The IT/upstream-API path is permanently blocked (not just slow).

**If revisited, the full design is preserved at:**
`/Users/robvolkel/.claude/plans/golden-dreaming-fairy-agent-a10ab613ff79e84bf.md`
(plan-agent output, May 26 2026 — covers schema, components, API contracts, provenance model, cache invalidation, 36h effort breakdown.)

## Triage Investigator: multi-MFR sampling (avoid sample-size-of-5 trap)
**Status:** Not started
**Priority:** P2 (correctness — current behavior produces overconfident wrong verdicts on cross-MFR semantic collisions)
**Cost:** ~3 hours
**Trigger:** Caught in real Triage walkthrough on 2026-05-26: the "ESD" param on B5 MOSFETs (1066 products across 3 MFRs) — Investigator returned high-confidence `new_canonical: esd_protection` after sampling 5 LRC L2N7002* products where the literal value was the string `"ESD"`. The other 2 MFRs were carrying numeric ratings (`1`, `4`, `6`, `8`, `30` — likely HBM kV) which would have been corrupted by the boolean-flag mapping. The /suggest pass actually caught this ("sample values have no discernible unit") but the Investigator's higher confidence overrode the suggest hedge.

**Root cause:** `fetchSampleProducts` in [/api/admin/atlas/dictionaries/investigate](../app/api/admin/atlas/dictionaries/investigate/route.ts) grabs the first N products from `affectedProducts` without stratifying by MFR. When all 5 happen to come from one MFR (very likely when one MFR dominates the product count for a paramName), the cross-MFR semantic split is invisible to Sonnet.

**Build:**

1. **MFR-stratified sampling** in `fetchSampleProducts`: when `affectedManufacturers.length > 1`, fetch at minimum one product per MFR (up to 5 MFRs), padding the remainder from the dominant MFR. For >5 MFRs, take one from each of the top 5 by product count.
2. **Value-distribution summary** in the prompt: before the per-product samples, include a compact table `{ mfrSlug → distinct value count → sample values }`. Cheap to compute (group by `manufacturer` in the existing query) and makes cross-MFR encoding splits visible to Sonnet without forcing it to infer them from 5 raw products.
3. **New verdict bucket** `multi_meaning_collision`: when value patterns differ across MFRs (e.g., one MFR has numeric values, another has categorical), Sonnet should be able to flag this explicitly rather than picking one MFR's semantics. UI action: opens a defer/note workflow pre-filled with the collision description; future per-MFR override scope (separate BACKLOG item) would close the loop.
4. **/suggest deference policy** (optional, lower priority): when /suggest verdict is `defer` AND /investigate verdict is `accept` with high confidence, surface BOTH in the UI rather than letting /investigate silently override — flag the disagreement for the engineer instead of presenting one false-confident path.

**Why this matters:** the Investigator is now load-bearing for one-click reclassify (Decision #188) and unmappable-marking workflows. An overconfident verdict on a multi-MFR collision corrupts real data (LRC's flag values turn into `'1'`/`'30'` garbage strings if the wrong mapping fires). The fix is structural — the model needs to SEE the cross-MFR variance, not infer it from a one-MFR sample.

**Workaround until built:** when the row's `affectedManufacturers.length > 1` AND the row-level sample values look numerically heterogeneous OR mix string/numeric, treat any Investigator verdict as advisory and verify by spot-checking one product from each MFR via the Atlas Explorer before clicking the action button.

---

## Collaborative app feedback — deferred items (Decision #222 follow-ups)

**Status:** Open. None block the released feature.
**Priority:** P3 — quality-of-life and scale work.

Deferred consciously from the Decision #220 + #222 rollout:

1. **Server-side activity sort via Postgres function.** The current `sort_by=activity` path fetches the full filtered set, computes `hasUnread` in JS, sorts, then slices — fine at the current scale (~100 items). When the inbox grows past several hundred rows, push the sort into a `RETURNS jsonb` RPC per the Decision #206 pattern so the wire payload stays small. The trigger condition: route latency on the admin tab exceeds ~500ms or response body crosses ~50KB.

2. **Email notifications on new reply.** Currently in-app only (red dot, "NEW REPLY" label, polling). Users won't see a reply if they don't visit the app. Wire to whatever transactional-email provider the project standardizes on. Both directions: user-replied → email Rob; admin-replied → email the user. Throttle so back-and-forth bursts don't spam.

3. **Lightbox / zoom for attachment thumbnails inside the modal.** Today, clicking a thumbnail opens the signed URL in a new tab. A modal-on-modal lightbox would feel more native but introduces overlay-ordering complications (ESC closes which one?). Defer until a user complains.

4. **Attachments on follow-up comments.** Currently attachments are only on the initial submission. Adding them to comments doubles the upload code path and storage policy surface. Wait for a user to explicitly request it.

5. **Comment editing / deletion.** Currently immutable — clean audit trail, unambiguous unread semantics. If editing lands, the unread-dot math has to decide whether an edit re-fires the dot for the other party (it probably should, treat edit as a new event).

6. **Real-time inside the open modal.** The modal does NOT poll the thread while open. If both parties are typing at once, the second party's message only appears when the first party closes + reopens, or after the next 30s list-poll completes post-close. Trade-off: avoids cursor-jump-while-typing race. Could be solved with Supabase Realtime subscriptions if needed.

7. **Sort-mode reset affordance on the admin tab.** Clicking a column header (Submitted/Category/Status) currently overrides the default activity sort with no UI to flip back to activity-first without a page refresh. Either: (a) add an explicit "Sort: Latest activity" pill toggle in the toolbar, or (b) treat the activity sort as a fourth column-header click target. (a) is more discoverable.

8. **Tenant-admin enum widening on `app_feedback_comments.author_role`.** Currently `('user', 'admin')`. Decision #222 says when multi-tenancy lands, widen to `('user', 'platform_admin', 'tenant_admin')` so tenant admins (when they exist) can participate in the thread without RLS or app-level role spoofing. Schema migration is just a CHECK constraint widen.

9. **`(stale)` HMR auto-recovery in dev.** Twice this session, Next.js HMR went stale and surfaced hydration errors that weren't real bugs. Track whether Turbopack ships a self-healing fix; if not, consider a dev-only banner that detects the `(stale)` indicator and prompts the user to hard-refresh.

10. **Admin "file feedback on behalf of another user."** The "New feedback" button on the admin tab (added June 9, 2026 — reuses `AppFeedbackDialog`) creates the item under the admin's OWN `user_id`, so there's no "submitted for customer X" attribution and the thread lives in the admin's personal `/feedback`. To let an admin log feedback *as* another user (e.g. a phone/email report from a customer), add a user-picker to the dialog when opened from the admin surface, plus a server change so `POST /api/app-feedback` accepts an optional `onBehalfOfUserId` (admin-gated) that sets `user_id` to the target while recording the acting admin for audit (new column, e.g. `created_by_admin_id`). Touches the dialog (conditional picker), the POST route (admin auth branch + target-user validation), and the read-stamp semantics (whose `user_last_read_at` — the impersonated user's). Defer until a real "customer told me directly" workflow exists; self-authored covers the common case (admin logging a bug they found).

## Notifications system follow-ups (Decision #230)

The unified notification pipeline shipped with two v1 producers (feedback reply → owner, new feedback → admins). Deferred, each ~one `createNotification()`/`createNotifications()` call:

1. **Release-note → all users producer + digest coexistence.** Wire `app/api/admin/releases/route.ts` POST to `createNotifications(allUserIds, { type: 'release_note', link: '/releases', ... })`. Then decide the relationship with the existing batched `release-digest` cron — recommend gating the digest behind `notificationPreferences` or retiring it once per-event is verified, so users don't get both an instant email and a later digest for the same note.

2. **Weekly BOM tracking report producer.** When the scheduled BOM report is built, its (CRON_SECRET-triggered) endpoint calls `createNotification({ type: 'bom_report', link: '/<report-url>', ... })`. The notification type + inbox UI are already in place.

3. **DNS / deliverability prerequisite (IT task, blocks ALL email).** Verify `xrefs.ai` as a sending domain in Resend and add SPF/DKIM/DMARC records to the `xrefs.ai` DNS zone. Set `RESEND_API_KEY`, `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL=https://xrefs.ai` in production. Until done, inbox rows are created but no email is delivered (the in-app inbox still works).

4. **Run the schema migration.** `scripts/supabase-notifications-schema.sql` must be run once in the Supabase SQL editor (table + RLS + the two SECURITY DEFINER mark-read RPCs) before the feature works.

5. **Notification retention / cleanup.** No pruning yet — rows accumulate forever. Add a periodic delete of read notifications older than N days (or cap per user) when volume warrants.

6. **Real-time inbox (optional).** The bell polls every 30s (same pattern as feedback dots). Supabase Realtime on the `notifications` table could push instantly if latency becomes a complaint.

## Atlas backfill value-level non-convergence — residual 43 rows (Decision #233, June 11 2026)

**Status:** the duplicate-MPN dual-category collision issue is **FIXED** (Decision #233 `dedupRichestByMpn` richest-wins dedup in both write paths — 61 sparse rows recovered, collisions now converge, global "would change" 244 → 43). What remains is a SEPARATE, smaller residual.

**Problem.** **43 products across 4 MFRs** (MXChip 3, Geehy 5, COSINE 14, ETA 21 — all with ZERO duplicate `componentName`) won't converge on `--backfill-translations`: a live run reports "N changed, 0 errors" yet the next run reports the identical N. Verbose shows **no key add/remove** — so it's a **value-level** diff (the mapped `value` / `unit` / `numericValue` representation differs between map → write → re-map). **No key or data loss** — the params are all present and readable; the backfill just can't mark these rows "done." Low impact (4 small MFRs).

**Likely cause (unconfirmed).** A value-representation round-trip mismatch — e.g. a `numericValue` or unit-prefixed `value` string that `tagAtlasParameters`/`mergeAtlasParameters` writes one way but the next map produces slightly differently, so `compareParamsIgnoringIngestedAt` always sees a diff. Candidate areas: Decision #217 unit-prefix normalization (`extractNumericWithPrefix`), or a JSONB store/read normalization the comparator doesn't account for. **First step:** dump one Geehy product's stored param entry vs a freshly-mapped one and diff field-by-field (value / unit / numericValue / source) to find which field oscillates; then either fix the mapper to be idempotent or relax the comparator for that field.

**51 genuinely-sparse collision rows (NOT a bug).** Of the 231 dual-category collision parts, 51 still store ≤3 keys after the richest-wins fix — because their *richest* occurrence genuinely maps to ≤3 keys (real source-data limitation). Correctly + stably stored; nothing to recover. Listed here only so a future audit doesn't mistake them for stripped data.

## Consolidate the 1000-row pagination footgun into one shared helper (Decision #233 review)

**Problem.** The same `.range()` 1000-row pagination loop is now hand-rolled in **four+ places** — `lib/services/atlasDictOverrides.ts` `fetchOverridesPaginated`, `scripts/atlas-ingest.mjs` `loadAndApplyDictOverrides`, `lib/services/triageQueueCompute.ts` (the overrides IIFE), `lib/services/atlasTriageContext.ts` — all over `atlas_dictionary_overrides`, plus an existing copy in `app/api/admin/atlas/growth/route.ts`. A generic `fetchAllPages<T>(fetcher, pageSize)` **already exists** but is module-private in `lib/services/manufacturerAliasResolver.ts`. This recurring footgun has caused real incidents (Decisions #206/#231/#232/#233). Four divergent copies also drift (e.g. `atlasTriageContext`'s loop `break`s/fail-opens on a page error while the others `throw`/`return error`).

**Fix.** Lift `fetchAllPages` into a shared `lib/services/supabasePagination.ts` (with a single stable-order + STOP-on-error contract and a docstring explaining the trap), and route the TS call sites through it; `scripts/atlas-ingest.mjs` keeps its own inline mirror per the #174 no-import-path convention. **Do as a separate post-merge PR** — it refactors currently-correct, tested code, so it shouldn't ride a ready-to-deploy branch. Maintainability only; nothing is broken today.

## Gaia preferred-suffix fallback is source-order-dependent (Decision #231 / #233 review)

**Problem.** In `atlasMapper.ts` `mapAtlasModel` (mirrored in `scripts/atlas-ingest.mjs` `mapModel`), when a gaia stem has a `preferredSuffix` set but the product ships the preferred variant *absent* and **two or more** non-preferred suffixes present (e.g. only `-Min` and `-Max`, no `-Typ`), both now pass the suffix gate and whichever appears **first in `model.parameters` order** wins the single mapped attribute slot. So two products listing the same two suffixes in opposite source order store different values (Min vs Max) for the same attribute — silent, source-order-dependent divergence, with no preference for the spec-relevant bound. Rare (requires preferred absent + 2+ alternates) and prior-session; surfaced by the PR #2 review.

**Fix (needs a domain decision).** The *correct* bound is parameter-specific (a min-rating vs a max-rating), so this isn't mechanical. Minimum bar: make it **deterministic** — apply a fixed fallback priority among non-preferred suffixes (e.g. a defined Max > Typ > Min order, or per-attribute) so the stored value no longer depends on vendor array order. Decide the priority deliberately; don't rush it into a deploy.

## Specs panels: replace More/Less toggle with labeled sections (UX, P3)

**Problem.** The source-part **Specs** tab hides non-canonical (schema-unrecognized) attributes behind a "More (N)" / "Less" toggle — an annoying extra click that also makes data/mapping gaps invisible. Separately, the right **"COMPARING WITH"** comparison panel only shows scored/canonical rows (built from `matchDetails` + source params), so a replacement's other attributes never appear — an inconsistency with the source panel.

**Fix (designed, plan tabled June 11 2026).** Drop the More/Less collapse on both panels; show all attributes at once with a labeled **"Additional Attributes"** uppercase section header dividing canonical (top) from non-canonical (below, dimmed). Right panel mirrors the left: canonical rows → Additional Attributes → Issue Summary at the bottom. Display-only; no engine/cache/schema-version impact.
- Left: `components/AttributesPanel.tsx` — keep the existing `recognized`/`extras` split useMemo; remove the toggle `<Link>` + `showExtras` state; render an "Additional Attributes" section-row before the always-shown extras.
- Right: `components/ComparisonView.tsx` — after `rows` is built, compute `additionalRows` from `replacementAttributes?.parameters` not already shown (data already in scope, no extra fetch); render them value-only/no-dot/dimmed under an "Additional Attributes" section-row; leave the Issue Summary block where it is (already below the table).
- Shared: add a table-row variant of the existing `SectionHeader` (`components/AttributesTabContent.tsx:211-232` is a `<Box>`, invalid as a `<TableBody>` child) with a `colSpan` prop (2 left / 3 right); add `additionalHeader` i18n key to `attributes.*` + `comparison.*` in `locales/{en,de,zh-CN}.json`.
- The `recognized`/`extras` concept lives only in `AttributesPanel.tsx` (confirmed repo-wide) — no parts-list/column/export fallout. For non-Atlas parts the flag is undefined → no extras → section simply hidden.

Full plan: `~/.claude/plans/i-am-more-concerned-flickering-mccarthy.md`.

---

## ~~Atlas dict lookup: non-`\s+` whitespace chars in vendor paramNames~~ (RESOLVED — different bug)

**Resolution (June 14, 2026).** Diagnosed mid-investigation: the padding IS plain ASCII space (0x20) — `\s+` collapse was already working. The real bug was CT MICRO encoding UTF-8 special chars (°, µ, ℃, Ω, λ) as **literal escape-sequence text** like `(\xe2\x84\x83)` instead of the actual character. 12 paramName variants across 677 occurrences, single MFR.

**Fix.** New `decodeLiteralByteEscapes()` helper in `lib/services/atlasMapper.ts` (+ mirror in `scripts/atlas-ingest.mjs`) finds runs of `\xHH` literal text and decodes the byte sequence as UTF-8. Applied in the dict-lookup normalization step so dict entries written with the proper char match the broken source form. Invalid UTF-8 byte runs fall back to keeping the raw text (so an audit can spot the bad source instead of silently substituting U+FFFD).

**Why this unblocks Item 2 (L2 LEDs).** CT MICRO is an LED MFR. Without the decoder, the L2 LEDs dict would need duplicate entries — one for the proper char form (`'viewing angle(°)'`) and one for the literal-escape form. With the decoder, a single dict entry covers both. Sets up Item 2 as a clean dict-only edit.

**Carry-forward note.** CT MICRO's ~22K existing products still sit in JSONB under the corrupted catalog-fallback keys (e.g. `topr_xe2_x84_x83` instead of `topr` / `operating_temp`). They'll re-key naturally on next CT MICRO re-ingest, which happens as part of Item 2. No standalone backfill needed.

---

## ~~Atlas L2 LEDs dict expansion~~ (DONE — Refond + CT MICRO + Everlight shipped June 15, 2026)

**Resolution.** ~44 new L2 LEDs dict entries covering CT MICRO LED-indicator vocabulary (`Viewing Angle(°)`, `Size L*W*H(mm)`, `Color Combination`, `Fire`, `Iv (mcd)/lmMin.~ Max.`, `VF(V)Min.~Max.`, `λd(nm)Min.~Max./CIE(X,Y) Typ.`, `TOPR (℃)`) + Refond display-LED vocabulary (`Ta @25℃(TYP.) IF(mA)`, `Ta @25℃(TYP.) vf(V)`, `Max current (mA)`, `2θ1/2(°)`, `50% power angle`, `Iv (RCM)`, `Φe(mW)`, `Lens(mm)`, `Ta @25℃(TYP.) Flux/lm @4000K Ra70`, `Color Rendering Index Ra(min)`, etc.) + Everlight Chinese gaps (`辐射强度`, `耗散功率`, `直流反向耐压`, `正向电流-DC (If)`, `LED极性`). Several new canonical attributeIds introduced: `cri_ra`, `color_temperature`, `radiant_power_mw`, `lens_diameter_mm`, `size_lwh_mm`, `viewing_angle_half_power`, `max_current`, `color_combination`, `mounting_orientation`, `radiant_intensity`, `led_polarity`, `character_size_inches`, `luminous_flux_lm`, `esd_hbm_v`.

**Result.** Re-ingested 3 MFRs: Refond (596+3 = 599 product updates, +2155 new attrs), CT MICRO (326 updates, +1263 new attrs), Everlight (no-op — already covered). LED-touching Triage rows dropped 22 → 7 (−68%). Total Triage queue 24,909 → 24,825 (−84). Sample Refond product RF-A3E31-W60E-B1 now ships 10 canonical attrs (`color`, `max_current`, `viewing_angle`, `forward_current`, `forward_voltage`, `power_dissipation`, etc.) versus the prior 4-5.

**Scope correction.** Original BACKLOG mentioned Sunlord as the highest-volume MFR ("18K+ products"). False — Sunlord ships ZERO LED products; their 16K catalog is inductors / capacitors / filters. The real scope was Refond (789 LED products) + CT MICRO (222 LED) + Everlight (2756 LED) ≈ 3700 LED products. Survey-first decision-making would have caught this before authoring; lesson re-confirmed.

**Latent mjs mirror drift surfaced and fixed.** The mjs L2 LEDs block was missing 16 English-side dict entries that existed in TS (`color`, `forward voltage`, `viewing angle`, `wavelength`, `peak wavelength`, `luminous intensity`, `emission angle`, `test current`, `lens color`, `mounting type`, `forward current`, `reverse voltage`, `color temperature`, `diode configuration`, `operating temperature`, `led color`). Refond's `Color` paramName for 481 products never matched at ingest because of this drift. Fixed inline; future ingests will work correctly. Confirms the Decision #218 pattern — mirror drift is not self-enforcing, and audit-by-grep is the durable check. Other L2 dicts (Switches, RF, Sensors, etc.) likely have similar drift — broader audit recommended but out of scope here.

**Operational note.** When dict additions don't immediately drop stale Triage queue counts: re-run `--rescan-unmapped-params`. The rescan reads the mjs dict at startup, so a dict edit AFTER a rescan won't be reflected until the next rescan. The supersede-clear during `--proceed` also helps drop stale entries from prior batches sharing the same source_file.

---

## Atlas mjs↔TS dict mirror audit — discovery DONE; reconciliation PENDING (Decision #235 follow-up Item 2 surfaced) (P2)

**Audit discovery shipped (June 15, 2026).** New `scripts/atlas-dict-mirror-audit.mjs` parses both files via brace-walking + comment-aware scanning and reports per-dict key-set drift. Full report: [docs/audits/mjs-ts-dict-drift-2026-06-15.md](audits/mjs-ts-dict-drift-2026-06-15.md). Re-run anytime with `node scripts/atlas-dict-mirror-audit.mjs --out docs/audits/mjs-ts-dict-drift-<date>.md`.

**Total drift: 331 one-sided keys across 22 dicts.** Key findings:

- **`SHARED_PARAMS` ✓, `METADATA_PARAMS` ✓, `SKIP_PARAMS` ✓** — all clean.
- **L3 `FAMILY_PARAMS`** — 11 clean (12 / 52 / 58 / 59 / 60 / 65 / 66 / 67 / 69 / 70 / 71), 11 with drift.
- **L2 `L2_PARAMS`** — 2 clean (LEDs and Optoelectronics after today's fix + Microcontrollers), 12 with drift; TS systematically richer than mjs across Audio / Battery Products / Connectors / Filters / Memory / Motors and Fans / Power Supplies / Processors / RF and Wireless / Sensors / Switches / Transformers.

**Top severity:**
1. **`D1` Crystals dict NOT IN mjs at all** (TS=30 entries, mjs=0). Critical — D1 classifier IS in mjs (line 196), so crystal products get correctly classified at `family_id='D1'` but then have NO dict to map their paramNames. All crystal paramNames go to the catalog-fallback path under sanitized stems. Impact today is small (65 products: Slkor 64 + High Diode 1) but grows with every new crystal MFR added.
2. **`E1` Optocouplers** — mjs has 115 entries, TS has 135 (20 TS-only). Decision #235 closeout shipped 80 new E1 entries; the mjs side may have missed some.
3. **`B1` / `B3` / `B4` / `B5`** — reverse direction: mjs has MORE entries than TS (64 / 15 / 24 / extra on mjs side). These were ingest-time additions that didn't get back-ported to TS. For READ time (Specs panel display) this means humanized-stem fallback names instead of proper attributeNames.
4. **`RF and Wireless` L2** — TS=35, mjs=11 (24 TS-only). Likely the next big silent ingest-data-loss case after L2 LEDs.
5. **Most other L3 ICs (`C4`/`C5`/`C6`/`C7`/`C9`)** — 1-6 entries of drift each, mostly recent edits.

**Reconciliation principle (Decision #218 lesson).** Don't pick a canonical side. Investigate WHY each drift exists. Some are intentional (e.g. ingest-only catalog enrichments that don't need display naming). Some are silent data-loss bugs (L2 LEDs `Color` case). Some are recent dict expansions on one side that just haven't propagated yet. Reconciliation needs per-drift judgment, not a blanket sweep.

**Pending work.**
- Reconcile per-dict, starting with D1 Crystals (smallest blast radius, easy fix — just port the TS D1 block to mjs).
- Then L2 RF and Wireless (likely the biggest user-visible win after L2 LEDs).
- Then E1 Optocouplers (closes out Decision #235 mirror gap).
- Then case-by-case for the rest. Estimate: ~3-5 hours total reconciliation, can be split across multiple sessions.
- Re-run audit after each reconciliation. Goal: 0 drift.

**Durable guard.** Audit script can be wired into pre-commit hook (`.husky/pre-commit`) or CI to fail on any drift. Defer until reconciliation phase complete — pre-commit on a 331-entry baseline would block every commit until cleared.

---

## Triage "Generate N" button — count + cost decoupled from visible-rows filter (P3)

**Symptom.** Under AI: ACCEPT the button says "Generate 500" while the table shows 0 visible rows; under AI: ALL the same button says "Generate 100". Reads as backwards — "ALL" should be ≥ a subset filter like "ACCEPT". User-reported June 19, 2026.

**Root cause.** Two independent design choices interact poorly:
1. [components/admin/AtlasDictTriagePanel.tsx:40-41](../components/admin/AtlasDictTriagePanel.tsx#L40-L41) — `DEFAULT_PAGE_SIZE = 100`, `AI_FILTER_PAGE_SIZE = 500`. The server page size bumps to 500 whenever any AI filter (Accept/Defer/None) is active, because the AI verdict filter runs client-side against localStorage-cached verdicts and needs a bigger pool to filter against.
2. [components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx:1146-1149](../components/admin/atlasIngest/GlobalUnmappedParamsTable.tsx#L1146-L1149) — `pendingSuggestionRows` counts loaded rows (`rows` prop) that lack a cached verdict, NOT visible rows after the AI filter.

Net: button label = "rows loaded that need a verdict" — not "rows that will be visible after Generate". When LS cache is empty and AI: ACCEPT is selected, the user is asked to spend ~$2.50 to surface maybe 50-150 actual accepts; the rest of the 500 generations sink invisible into the cache under the current filter (they're recoverable by toggling to ALL).

**Fix options (pick one or compose):**
1. **Clarify the label.** Change "Generate 500" → "Generate 500 (≈X% expected accepts)" or "Generate 500 loaded · Y will pass current filter (estimated)". Cheap; doesn't change behavior.
2. **Make the page-size bump ALL-mode-aware OR scope-aware.** Page size 100 across all AI filters; rely on Load More to grow the pool when the client filter eats most rows. Removes the surprise but hurts UX when LS cache is warm under a restrictive filter (more clicks).
3. **Switch AI filter to server-side.** Send `aiVerdictFilter` to the API + server consults the AI suggestion store (currently this is client-LS-only, so the server doesn't know — would need a server-side cache of suggestions). Bigger change; cleaner UX.
4. **Disable bulk Generate under restrictive AI filters.** Force per-row generation when AI ≠ ALL. Aggressive but prevents the "$2.50 for 50 results" surprise.

Recommendation: ship option 1 as a quick fix (15 min), then evaluate whether 2 or 3 is worth the larger investment. The per-row Generate already works fine for incremental spend control, so the bulk Generate "footgun" is the real wart.

**Out of scope.** Doesn't affect ACCEPTED rows in the database (those are persisted in `atlas_dictionary_overrides`). Pure UX/cost-clarity concern.

---

## ~~Atlas C7 digital isolators dict expansion~~ (DONE — CHIPANALOG shipped June 15, 2026)

**Resolution.** ~40 C7 dict entries added covering CHIPANALOG's digital isolator + RS-485/CAN transceiver vocabulary + cross-MFR Chinese (TDSEMIC/HXYMOS/ElecSuper) + BORN/Union English transceiver fields + SIT bilingual compound paramNames. Re-ingested CHIPANALOG (348 products): 288 updates, +288 new attrs landed in JSONB across 9 new canonical attributeIds (`supply_current_per_channel` × 181, `esd_other_pins` × 36, `esd_hbm_cdm_kv` × 20, `logic_supply_voltage` × 20, `independent_logic_supply` × 19, `integrated_ldo` × 14, etc.). C7-touching Triage rows dropped 471 → 432 (−39); total Triage queue 24,909 → 24,870.

**Scope correction.** Original BACKLOG mentioned Yint as a secondary C7 MFR — wrong. Yint's c3 distribution is 100% circuit protection (TVS / Rectifiers / PTC Fuses / Varistors / Zeners / GDTs / NTC / SPDs / Inductors / CM Chokes). Zero digital-isolator products. The ~500-product estimate was anchored on the false Yint assumption.

**Latent bug surfaced.** Underscore-prefix attributeIds (`_*`) are SKIPPED at ingest ([atlasMapper.ts:3412](../lib/services/atlasMapper.ts) and gaia path at 3353). This means most of the EXISTING C7 dict (25+ `_*` entries) has silently dropped source data on ingest forever — only the four non-underscore canonicals (`data_rate`, `esd_bus_pins`, `package_case`, `operating_temp`) actually wrote to JSONB. My new entries use non-underscore IDs so they store properly. See the dedicated entry below for the holistic fix.

---

## Atlas underscore-prefix attributeIds silently drop ingest data (latent C7+others bug, surfaced June 15, 2026) (P2)

**Context.** `if (mapping.attributeId.startsWith('_')) continue;` at both [atlasMapper.ts:3412](../lib/services/atlasMapper.ts) (standard path) and `:3353` (gaia path) skips any dict mapping whose attributeId starts with `_`. Mirror in [scripts/atlas-ingest.mjs](../scripts/atlas-ingest.mjs). The intent was "internal-only, not for matching engine scoring" — but the side effect is that the SOURCE VALUE never gets written to JSONB. The read-time path (`fromParametersJsonb`) populates display NAMES for `_*` IDs in `nameLookup`, suggesting the design expected `_*` data to be in JSONB — but ingest never puts it there. The two halves contradict.

**Scope.** Anywhere a family dict uses `_*` attributeIds. C7 has 25+ such entries (`_isolation_rating`, `_channels`, `_supply_voltage`, `_output_mode`, `_default_output`, `_cmti`, `_surge_rating`, `_integrated_power`, `_supply_voltage_range`, etc.). C5 has some. Probably others. Net effect: those source paramNames either land in the corrupt catalog-fallback path (under stems like `vrms`, `kvpk`) OR drop entirely after the dict matches and the underscore-skip fires. CHIPANALOG's CA-IS3760HW has 17 source params but only 5 land in JSONB — the other 12 are silently lost. Same shape across all C7 MFRs (348 CHIPANALOG products alone losing ~12 attrs each ≈ ~4K attribute occurrences globally).

**Fix.** Three options:
1. **Drop the skip entirely.** Let `_*` IDs land in JSONB. Matching engine doesn't iterate by attributeId anyway — it iterates logic-table rules — so unscored `_*` attrs don't pollute scoring. Simplest fix, biggest blast radius. Could surface formerly-invisible attrs in the Specs panel for thousands of products.
2. **Migrate every `_*` dict entry to canonical IDs.** Manual rename across all family dicts + mjs mirror + write a backfill script that migrates existing JSONB. High effort.
3. **Hybrid (Item 3 followed this):** keep existing `_*` entries as-is, write all NEW entries with non-underscore IDs. Slow rolling fix as families get new dict work.

Option (1) is the right answer for the holistic cleanup. The "internal only" intent is what `METADATA_ATTRIBUTE_IDS` already enforces in the read path (line 3731) for genuinely-internal cases; the underscore-skip is a redundant + harmful belt. Audit needed: confirm no rules-engine path keys off `_*` prefix before the change.

**Verification.** Pick CA-IS3760HW post-fix: source has 17 params, expect ~15+ to land in JSONB instead of 5. Same shape for any CHIPANALOG product. Avg attr count across CHIPANALOG should jump from ~5.8 to ~12+.

---

## Atlas STEIPU "Miscellaneous" + "Wire Splice Connectors" still in `family_id=null` (Decision #235 byproduct) (P4)

**Context.** Decision #235's relay re-ingest correctly classified STEIPU's 196 source-file products: 118 in F1 (Power/Automotive/Signal/Reed Relays), 12 in F2 (SSRs + Contactors), 66 in null. The 66 null rows split: 32 "Miscellaneous" (c1=Hardware, Fasteners — copper bus bars, heat-sink straps), 32 "Wire Splice Connectors" (c1=Connectors, Interconnects — wire terminals), 1 "Battery Management", 1 "Photointerrupters - Slot Type". These are correctly NOT relays — they fell through to the L2 catch-all and landed at `category='ICs'` (Miscellaneous) or `category='Connectors'` (Wire Splice).

**The "ICs" category landing is wrong** for the Miscellaneous group — they're hardware, not ICs. The classifier's `c1.includes('hardware')` catch-all is missing.

**Fix.** Add `if (c1lower.includes('hardware') || c1lower.includes('fasteners')) return { category: 'Hardware', subcategory: c3, familyId: null };` to the L2 catch-all section in `classifyAtlasCategory` (atlasMapper.ts + .mjs mirror). Trivial 2-line fix per file. Affects ~32 STEIPU + likely a sprinkling from other MFRs.

**Scope.** Low — these products aren't scored anyway (`familyId=null`), just routed to a more honest category label. Filed for cleanup completeness, not blocking.

---

## Acceptance criteria — fetch-widening (step 2) + deferred review items (Decision #238)

**Step 2 (the big one) — ✅ SHIPPED June 15, 2026 (commit `9539ed3`).** Keyword-driving attributes now widen the candidate fetch via new `lib/services/fetchWidening.ts`. **Digikey = E-series keyword fan-out** (one keyword search per in-band E-series value / accepted package, union+dedup, capped); full parametric ValueId filtering deferred as the escalation path. **Atlas = `fetch_atlas_candidates_widened` RPC** applying the numeric band before the limit (filter-before-limit fixes value-band starvation). Cache: candidate set is acceptance-dependent → `buildBaseRecsVariant` keys on the fetch-affecting subset (`fetchWideningKey`), `BASE_RECS_SCHEMA_VERSION` v2→v3. **Apply migration:** `scripts/supabase-atlas-candidates-widened-rpc.sql`. The "9k–11k parts" figure was the eligible-universe size, not a fetch target — output is a ranked in-band shortlist.

**UX-gap reconciliation — ✅ DONE.** `RANGE_FETCH_ATTRS` now mirrors the full UI `RANGE_ELIGIBLE_ATTRIBUTE_IDS`, so every numeric band widens at least the Atlas fetch (generic RPC). Digikey E-series fan-out extended to inductance (`ESERIES_ENUMERABLE_ATTRS` = resistance/cap/inductance); `BASE_RECS_SCHEMA_VERSION` v3→v4. parts.io/Mouser/MFR-crossref are equivalence lookups (MPN-keyed) — nothing to widen.

**Step 3 (Digikey parametric value-grid widening) — ✅ SHIPPED June 16, 2026 (branch `feat/digikey-parametric-widening`).** Voltage/frequency-type specs (`RANGE_FETCH_ATTRS` minus `ESERIES_ENUMERABLE_ATTRS`) now widen the DIGIKEY fetch too (was Atlas-only), via the **full parametric ValueId filter** — extension (b) below, which subsumes (a). Two-call discover→apply: `getCategoryParametricFacets` (empty-keyword category search → `FilterOptions.ParametricFilters`), `findFacetForAttribute` resolves the facet via the existing forward param map, in-band values selected by `ProductCount` DESC (cap 25 so standard E-series neighbors survive), `parametricFilterSearch` applies the ValueId filter; an in-band re-verify drops mis-keyed/unfiltered results. `BASE_RECS_SCHEMA_VERSION` v4→v5, `RECS_CACHE_SCHEMA_VERSION` v15→v16 (candidate set for such bands changed; key shape unchanged). Verified live (1N4733A 5.1 V Zener ±10% → in-band 4.7/5.1/5.6 V Digikey parts). Facets name the parameter via `ParameterName` and carry their own `Category` — both load-bearing, learned from live probing.

  Originally-deferred framing (now done): ~~**(a) Value-grid widening for output_voltage + frequency attrs (P2)** — per-attribute standard-value lists~~ and ~~**(b) Full parametric ValueId filtering (P3)** — `FilterOptionsRequest.ParameterFilterRequest`~~. We built (b) directly (precise, paginated, covers every numeric attr) rather than (a)'s hardcoded value lists.

  **Still deferred (P3):** (i) **multi-attr** parametric widening — currently single-attr (first eligible), mirroring `computeAtlasWidening`; (ii) attrs with **no Digikey param-map entry** (e.g. `izt`) can't match a facet, so they widen Atlas-only (acceptable); (iii) **parts.io value-search** widening — needs the parts.io production endpoint + a param schema-discovery pass (it's a Solr listings API; today it's an MPN-keyed equivalence/enrichment source only).

**Deferred review findings** (from the Decision #238 review; full detail in [acceptance-criteria-followups.md](acceptance-criteria-followups.md)): (#3) lift acceptance eligibility from the two hardcoded UI allowlists to per-rule logic-table metadata (e.g. `rule.acceptanceKind`); (#6) revisit the `numericValue==='number'` range gate that re-introduces parser dependence; (#8) add an `acceptedValues` clause to `overrideMerger` CLEANUP for defense-in-depth; (#9) scope `candidateValuesByAttribute` to set-eligible params; (#10) cosmetic — rename `TOLERANCE_MAX`/`MARKS`, extract the shared editor shell.
