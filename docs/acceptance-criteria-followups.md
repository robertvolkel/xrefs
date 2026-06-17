# Per-Attribute Acceptance Criteria — Status & Follow-ups

Branch: `feat/source-attribute-tolerance` (pushed to origin). Feature lets users
set per-attribute **acceptance criteria** on the Source Specs panel to loosen
matching: a ±% band (`kind:'range'`) or a discrete accepted-values checklist
(`kind:'set'`). Unified model in `lib/types.ts` (`AcceptanceCriterion` /
`AcceptanceCriteria`); this is the shape a future candidate-fetch layer reads.

## Shipped (commits, oldest→newest)
- `e5a7faa` feat: per-attribute tolerance bands (±% on identity rules)
- `29ce8a8` fix: auto re-score visible recs on change (silent, via `triggerPartsioEnrichment`)
- `eca9ceb` fix: hover trigger by the D/P/A badge + fixed clipped editor
- `86688d2` fix: least-fails-first rec sort (#236) + tolerance allowlist (#237)
- `da64b68` feat: unified acceptance criteria (range + discrete `set`); engine
  `acceptedValues` short-circuit in `evaluateRule`; `acceptanceModifier.ts`;
  cache `RECS_CACHE_SCHEMA_VERSION` v13→v14. Step-1 set demonstrator = `aec_q200/q101/q100`.

Key files: `lib/services/acceptanceModifier.ts`, `lib/services/matchingEngine.ts`
(short-circuit ~`evaluateRule`), `components/AttributesPanel.tsx` (RangeEditor /
SetEditor / getAcceptanceKind / eligibility allowlists), `hooks/useAppState.ts`
(`handleAcceptanceChange`, `acceptanceCriteriaRef`).

## Fix #1 — RESOLVED (investigated; no risky change, by decision)
Traced the two membership gates under automotive intent:
- **`filterAutomotiveAecMismatches`** is already reconciled. It keys off
  `matchDetails.ruleResult !== 'fail'`, and the engine's accepted-values
  short-circuit (run during scoring, carried through user/context modifiers into
  the effective table) flips the AEC rule to `pass` for accepted candidates — so
  they survive this filter. No change needed.
- **Qualification-domain hard-exclude** (`partDataService.ts` ~1508) is a
  deliberate cross-domain SAFETY gate (blocks commercial/industrial/medical/mil/
  space under automotive intent; `unknown` stays). It classifies by derived
  domain, not rule result, so acceptance doesn't touch it. **Decision: leave it.**
  Acceptance is NOT allowed to override the domain safety gate — accepting AEC
  must not also unblock medical/mil/space substitutions. Impact is also narrow
  today: the classifier registry is Murata-MLCC-only, so most candidates (incl.
  all chip resistors) are `unknown` and pass the gate regardless.

Net: accepting "AEC: No" works for the AEC mismatch filter and for unknown-domain
parts; explicitly cross-domain parts stay blocked by design.

## AEC removed from acceptance → became a results filter (June 16, 2026)
AEC qualification was the original `set` demonstrator, but it's a **binary requirement,
not a tolerance** — and verification exposed that the acceptance control was inert for it:
non-qualified replacements carry **missing** AEC data (not `"No"`), which the checklist
can't offer (option list skips `N/A`) and the engine short-circuit can't rescue (it
requires the candidate value to be *present*). On an AEC=No source it's a guaranteed
no-op; on AEC=Yes there's nothing actionable to accept.

Resolution: **removed AEC from `SET_ELIGIBLE_ATTRIBUTE_IDS`** (now empty — the `set`
mechanism stays for a genuine multi-valued categorical like dielectric C0G/X7R/X5R, where
candidates carry explicit values). The "automotive matters" intent is now a **filter**:
`aec_qualified_only` predicate + `isAecQualified()` in `recommendationFilter.ts`, surfaced
as an **"AEC-qualified only" toggle** in the Replacements-panel filter popover (only shown
when some recs are qualified). Inclusive-keep on explicit qualification (matchDetail `Yes`
OR `part.qualifications` badge), so it sidesteps the missing-data problem entirely. The
identity_flag hide-on-"No" guard (and the `parseBoolean` export it needed) were reverted as
moot. Note: passive families (MLCC/resistors) are NOT in `AUTOMOTIVE_AEC_ENFORCEMENT`, so
this filter is the only AEC control for them.

## Step 2: fetch-widening — ✅ SHIPPED (commit `9539ed3`)
Keyword-driving attributes (resistance/capacitance/package) now widen the candidate
fetch driven by the `AcceptanceCriteria` shape, via new `lib/services/fetchWidening.ts`
(the single source of truth for both the fetch path and the base cache key):
- **Digikey** = **E-series keyword fan-out** (chosen over full parametric ValueId
  filtering, which is deferred). `buildCandidateSearchQuery` gained value-token
  substitution; `fetchDigikeyCandidates` fans out one keyword search per in-band
  E-series value (`range`) or accepted value (`package_case` `set`), union+dedup,
  capped at `MAX_WIDEN_QUERIES`.
- **Atlas** = new `fetch_atlas_candidates_widened` RPC
  (`scripts/supabase-atlas-candidates-widened-rpc.sql`) that applies the numeric band
  **before** the `.limit(50)` (fixes value-band starvation: returns the nearest in-band
  parts, not an arbitrary family slice). Falls back to the default fetch on RPC error only.
- **Cache:** the candidate set is now acceptance-dependent, so `buildBaseRecsVariant`
  keys on `fetchWideningKey()` — the **fetch-affecting subset only**, so rescore-only
  criteria (AEC sets, context) still hit the base cache + Decision #163 fast path.
  `BASE_RECS_SCHEMA_VERSION` v2→v3.

**UX-gap reconciliation — DONE (Atlas-all + Digikey inductance).** `RANGE_FETCH_ATTRS` now
mirrors the UI's full `RANGE_ELIGIBLE_ATTRIBUTE_IDS`, so **every** numeric attribute the UI
offers a band on widens at least the **Atlas** fetch (the numeric-range RPC is generic — no
value enumeration needed). The **Digikey** keyword fan-out is the narrower part
(`ESERIES_ENUMERABLE_ATTRS` = `{resistance, resistance_r25, capacitance, inductance}`):
resistance/cap/inductance are E-series-stocked so they fan out on Digikey too; everything
else (voltages, frequencies, impedance, varistor_voltage, etc.) widened on **Atlas only**
in Step 2 (Step 3 below closed this for Digikey). Inductance also became a Digikey search
keyword in `buildCandidateSearchQuery` (improves the default inductor query too) →
`BASE_RECS_SCHEMA_VERSION` v3→v4.

**Step 3 (Digikey parametric value-grid widening) — ✅ SHIPPED June 16, 2026.** The voltage/
frequency-type attrs that were Atlas-only now ALSO widen on Digikey, via the full parametric
ValueId filter (`FilterOptionsRequest.ParameterFilterRequest`) — the originally-deferred
extension (b), which subsumes (a). Two-call discover→apply in `fetchDigikeyCandidates`:
`getCategoryParametricFacets('', categoryId)` enumerates the category's facet values,
`findFacetForAttribute` matches the facet via the existing forward param map (no reverse map),
in-band values are picked by `ProductCount` DESC (cap 25 → standard E-series neighbors survive
the cap), `parametricFilterSearch` applies the filter, and an in-band re-verify drops anything
mis-keyed. Latency bounded to ~2 round-trips (fan-out+discover, then apply). `BASE_RECS_SCHEMA_VERSION`
v4→v5, `RECS_CACHE_SCHEMA_VERSION` v15→v16. **Live-verified** end-to-end (1N4733A 5.1 V Zener
±10% → 4.7/5.1/5.6 V Digikey parts). Live probing surfaced three load-bearing facts: facets name
the parameter via `ParameterName` (the per-product field is `ParameterText`), facets carry their
own `Category`, and discovery must use an EMPTY keyword so the facet reflects the whole category
(not the source MPN's 1-part result set). Still deferred (BACKLOG): multi-attr parametric widening;
attrs with no Digikey param-map entry (e.g. `izt`) stay Atlas-only; parts.io value-search (needs
prod endpoint + schema discovery).

**Source taxonomy (why only Atlas + Digikey widen).** Fetch-widening applies only to sources
that search by parametric VALUE — Digikey (keyword) and Atlas (numeric JSONB). parts.io
(Accuris equivalents), Mouser (`SuggestedReplacement`), and manufacturer cross-refs are
identity/equivalence lookups keyed on the source MPN — they return a curated set tied to the
exact part, so there is no value query to widen. Those candidates still get the scoring
relaxation from Step 1 (an off-value curated equivalent can flip fail→pass).

**Apply the migration:** run `scripts/supabase-atlas-candidates-widened-rpc.sql` in Supabase.

## Review findings (from `da64b68` review)
FIXED in the follow-up commit:
1. ✅ **#1** resolved by investigation + decision (see "Fix #1" above) — no code change.
2. ✅ **#2** Checklist options now dedup + exclude source via the engine's exported
   `normalize()` (matchingEngine), so boxes match how scoring compares.
4. ✅ **#4** `acceptanceModifier` 'set' path now skips non-identity-family rules —
   an accepted value can never short-circuit a threshold/fit/vref safety gate.
5. ✅ **#5** `SetEditor` sorts values on commit → order-stable storage, no-op
   compare, and cache key.
7. ✅ **#7** `SetEditor` is now controlled (derives from the committed `accepted`
   prop) — can't desync; no key needed.

DEFERRED (not behavior-affecting today; tracked here):
3. **Altitude:** eligibility is two hardcoded attributeId allowlists in the UI
   (`RANGE_ELIGIBLE_ATTRIBUTE_IDS` / `SET_ELIGIBLE_ATTRIBUTE_IDS`); engine is
   generic. Right depth = per-rule metadata on the logic table (e.g. `rule.acceptanceKind`).
6. `getAcceptanceKind` extra `numericValue === 'number'` guard re-introduces parser
   dependence → range editor hidden when a value didn't parse numerically. (Product call.)
8. `overrideMerger` CLEANUP has no `acceptedValues` clause — safe only by pipeline
   ordering (acceptance runs Step 2b.5, after override cleanup); no test pins it.
9. `candidateValuesByAttribute` scans all recs×matchDetails on every enrichment for
   3 attributeIds — scope the scan to set-eligible params. (Perf.)
10. Naming/dup: `TOLERANCE_MAX`/`TOLERANCE_MARKS` leftover; RangeEditor/SetEditor
    share an identical Clear-link shell worth extracting. (Cosmetic.)
