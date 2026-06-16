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

**Eligibility is intentionally narrower than the UI allowlists.** `FETCH_WIDENING_ELIGIBLE`
= `{resistance, resistance_r25, capacitance, load_capacitance_pf}` for `range` +
`{package_case}` for `set`. Other range-eligible attrs (inductance, impedance) stay
rescore-only (not keyword-driving, not yet wired to the Atlas RPC) — the UI offers the
band but the pool doesn't widen. Reconciling that UX gap (or extending the Atlas RPC to
those numeric attrs) is a follow-up. Full parametric ValueId filtering remains the
documented escalation if E-series fan-out proves to miss good in-band parts.

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
