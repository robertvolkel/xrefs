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

## NEXT — Fix #1 (in progress): acceptance must re-admit, not just re-score
Acceptance currently only flips a rule to *pass* (scoring). Candidates removed by
**membership filters** never come back. Under **automotive intent**, non-AEC parts
are hard-excluded by the qualification-domain filter + `filterAutomotiveAecMismatches`
(`partDataService.ts`) *before* recs return — so accepting "AEC: No" is silently
inert there (works fine with no automotive context). Fix = thread
`acceptanceCriteria` into those post-scoring filters so an explicitly-accepted
value suppresses the corresponding hard-exclude for that attribute. Be careful:
these are safety-sensitive gates — bypass only the specific attribute the user
accepted, not the whole filter.

## THEN — Step 2: fetch-widening (the big one)
Keyword-driving attributes (resistance/capacitance/package, etc.) never fetch
near-value/alternate candidates, so `range` bands and keyword `set` criteria can't
surface new parts. `buildCandidateSearchQuery` (`partDataService.ts`) uses the
exact value as a search keyword. Need parametric/range queries: Digikey parametric
filters + Atlas numeric-range SQL, driven by the `acceptanceCriteria` shape.

## Other review findings (from `da64b68` review) — backlog, by priority
1. **(fixing now)** acceptance re-scores but doesn't re-admit filtered candidates (above).
2. Checklist dedups options by raw string but the engine matches by `normalize()`
   (case/whitespace) — variants render as separate boxes yet one tick passes all.
   Fix: dedup options + source-exclusion via the engine's `normalize()`.
3. **Altitude:** eligibility is two hardcoded attributeId allowlists in the UI
   (`RANGE_ELIGIBLE_ATTRIBUTE_IDS` / `SET_ELIGIBLE_ATTRIBUTE_IDS`); engine is
   generic. Right depth = per-rule metadata on the logic table (e.g. `rule.acceptanceKind`).
4. `acceptanceModifier` 'set' path sets `acceptedValues` on any rule type with no
   guard — latent footgun if a set-eligible attr ever maps to a safety threshold rule.
5. No-op check uses order-sensitive `JSON.stringify` on the set → spurious re-score
   when toggled to the same values in different order. Fix: sort before compare.
6. `getAcceptanceKind` extra `numericValue === 'number'` guard re-introduces parser
   dependence → range editor hidden when a value didn't parse numerically.
7. `SetEditor` not keyed by criterion → latent checklist desync if cleared externally while open.
8. `overrideMerger` CLEANUP has no `acceptedValues` clause — safe only by pipeline
   ordering (acceptance runs Step 2b.5, after override cleanup); no test pins it.
9. `candidateValuesByAttribute` scans all recs×matchDetails on every enrichment for
   3 attributeIds — scope the scan to set-eligible params.
10. Naming/dup: `TOLERANCE_MAX`/`TOLERANCE_MARKS` leftover; RangeEditor/SetEditor
    share an identical Clear-link shell worth extracting.
