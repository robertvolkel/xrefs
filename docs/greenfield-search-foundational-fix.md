# Greenfield search — foundational fix plan + session status (2026-06-30)

Branch `feat/guided-selection-system-driven`. All work COMMITTED, tree clean, NOT merged/pushed.
Dev server running in background on :3000. Restart if needed:
`pkill -f "next dev"; cd /Users/robvolkel/Developer/xrefs_app && npm run dev > /tmp/xrefs-dev.log 2>&1 &` (ready ~2s).

## Commits this session (newest first)
- `32d0bf2` bump SEARCH_CACHE_SCHEMA_VERSION v5→v6 (invalidate stale fit labels)
- `79f3875` greenfield spec search: keep package CODES in query + synthetic source adopts catalog wording
- `39cf975` guided-selection review fixes (#1–#13 + discovered classifier-continuation fix)
- `cc7e57c` (pre-session) registry-backed part-type recognition (Decision #262 Phase 4)

## Behavioral tests — ALL 5 PASSED in the live UI
1. Capacitor flow + honest Fits/Below chips ✅ (after the search-quality fixes below)
2. Op-amp button bug (numeric spec = typed, no garbage buttons) ✅ — BUT its search tail returned 0 parts (foundational issue, below)
3. Bare "regulator" → LDO/Switching disambiguation ✅
4. "I need an LDO like AMS1117" → looks up AMS1117 (not a checklist) ✅
5. "I need an NTC thermistor" then "actually look up NCP18XH103F03RB" → switches to lookup ✅
Remaining: tests 6–10 NOT run (wording recognition / theory-mid-flow / theory+family / odd-phrasing continuation / stray noun). 7+8 are pure routing (clean); 6/9/10 end in a greenfield search → blocked on the foundational fix.

## The foundational problem (PROVEN with live data)
Greenfield spec search builds a KEYWORD query (`buildGreenfieldQuery`: familyName + categorical tokens),
fetches a pool (`keywordSearch` limit 20 + ONE numeric `fetchBand` via `pickFetchBand`/`applyParametricFilter`),
then logic-vets/ranks. Failure modes:
- **Verbose familyName → 0 results.** PROVEN live: C4 familyName "Op-Amps / Comparators / Instrumentation
  Amplifiers" → query "...cmos dual soic-8" → **0**; clean "op amp dual cmos" → **19**.
- **Too many keyword tokens → over-narrow** ("dual op amp soic-8" → 1).
- **Multiple numeric specs**: only ONE shapes the fetch; others rely on stripped keyword or on vetting over a
  pool that may not contain matches.
- ALREADY FIXED this session: (a) package code dropped from query → now KEEPS categorical codes ≥3 chars on
  identity-family attrs; (b) "0805" vs catalog "0805 (2012 Metric)" identity FAIL → `canonicalizeCategorical`
  in `searchConstraints.ts` adopts the catalog's own wording, learned from the candidate pool.

## The fix (ROBUST): parametric-filter the fetch by ALL structured specs
Stop keyword-guessing. Fetch the candidate pool via Digikey's parametric-filter API on the user's mapped
constraints (numeric AND categorical), so the right parts are GUARANTEED in the pool. Infra already exists:
- `digikeyClient.getCategoryParametricFacets(keyword, categoryId, currency, userId)` — discover facets.
- `digikeyClient.parametricFilterSearch(FilterOptionsRequest w/ ParameterFilterRequest)` — fetch by filters.
- `partDataService.ts` ~L481–510 already does this for ONE numeric band (`applyParametricFilter` +
  `findFacetForAttribute`). **Extend to all constraints.**
- Atlas analog: `fetch_atlas_candidates_widened` RPC (Decision #238).
Steps: (1) resolve Digikey categoryId for the family WITHOUT a working keyword (the op-amp blocker); (2)
discover facets; (3) per constraint, map attributeId→facet via `findFacetForAttribute`, pick matching value
options (categorical = facet ValueText matching user value, apply canonicalization; numeric = in-band
ValueIds); (4) multi-parameter `ParameterFilterRequest` fetch; (5) vet/rank.

## ✅ VERIFICATION DONE (2026-06-30) — proven on the live catalog
Ran throwaway diagnostics against live Digikey for op-amp (C4, the 0-keyword case) + capacitor (12).
Result: **approach works**, but the predicted blocker was WRONG and a different one surfaced.

1. **Category resolution is keyword-free and works.** `getTaxonomyPatternsForFamily(familyId)` → category
   NAMES → walk `getCategories()` tree leaves → CategoryId. C4 → 687 (Op Amps) + 692/773 (Comparators);
   family 12 → 60 (Ceramic Capacitors). The op-amp "0-keyword" fear is GONE.
2. **Multi-parameter AND filter works.** Added `parametricFilterSearchMulti(categoryId, filters[], …)` to
   digikeyClient (additive, nothing in prod calls it yet). Capacitor 4-spec AND (capacitance+voltage+
   dielectric+package) → 20 EXACT 1µF/25V/X7R/0805 parts.
3. **THE REAL BLOCKER (caught by verify-first): facet ValueIds.** Human label = `fv.ValueName`, filter key =
   `fv.ValueId`. Most facets use an OPAQUE numeric ValueId ("25 V"→"132007") and filter fine. BUT **bare-
   integer count facets** ("Number of Circuits" 2→"2", "Number of Elements") silently return **0** even though
   their ProductCount says 10k parts exist. Confirmed the distinguisher: **bare-integer facet values fail;
   unit-bearing literal values ("400 Hz", "1 µF", "10 nV") AND opaque values WORK.** So the only un-filterable
   facets are count facets — exactly the specs we never need to parametric-filter (channel count is cheap via
   keyword "dual" + the vetting pass).
4. **Multi-category families:** facets split across leaves (Op Amps has Amplifier Type but not supply;
   Comparators has supply but not type). → filter EACH category, UNION the parts.

**THE RULE FOR THE BUILD (general, data-driven, no per-family table):**
> Build a ParameterFilter for every mapped spec EXCEPT facets whose selected ValueNames are bare integers
> (no unit/letter). Resolve category(ies) from family taxonomy (keyword-free). Filter each category, union.
> UNION the parametric pool with today's keyword pool. If category doesn't resolve / no specs map → fall back
> to today's keyword pool (byte-identical, never regress). Vetting (Decision #243) ranks the union.

End-to-end proof: op-amp CMOS filter → 20 real CMOS op-amps (TLV271/TLV9001/TLV272/TLV9061…); today returns 0.
Capacitor → 20 exact 1µF/25V/X7R/0805. Building now.

## ✅ BUILT (2026-06-30) — verified through the REAL `searchParts` path
- New module `lib/services/greenfieldParametricFetch.ts`: `resolveCategoryIdsForFamily` (keyword-free) +
  `fetchGreenfieldParametricProducts` (multi-spec, multi-category union, bare-int facet skip) + exported pure
  pickers. `parametricFilterSearchMulti` added to digikeyClient.
- Wired into `searchParts` greenfield branch (`partDataService.ts`): keyword search + parametric spec-fetch in
  PARALLEL, union deduped by MPN (keyword wins). Removed the old keyword-bootstrapped single-band block +
  standalone `applyParametricFilter` (greenfield-only; cross-ref widening path untouched). Fallback = keyword
  pool when family/category/specs don't resolve → never regresses.
- Count-word↔digit bridge in `canonicalizeCategorical` (searchConstraints.ts): "Dual" → catalog "2" so a real
  dual op-amp scores a PASS (was: every op-amp `fail=1` on Dual-vs-2, all "Below spec"). General closed vocab.
- `SEARCH_CACHE_SCHEMA_VERSION` v6→v7. Unit tests: `greenfieldParametricFetch.test.ts` (11, incl. the
  bare-int-skip trap) + count-word test in `searchConstraints.test.ts`. 2812 jest pass, changed files
  lint-clean, tsc baseline 92 unchanged.
- Live `searchParts` result: op-amp "dual CMOS" → 50 matches, 28 Fits (all dual CMOS) / 22 Below; capacitor
  "1µF 25V X7R 0805" → 50 matches, 50 Fits (all exact). NEXT: user UI test + #14 prompt checklist before merge.

## (historical) VERIFY FIRST (before changing any app code) — this is step 1, user-approved approach
Prove end-to-end on op-amp + capacitor via a throwaway live diagnostic. Pattern (tsx top-level await is
unsupported — wrap in async main):
```
cat > diag.ts << 'EOF'
import { ... } from './lib/services/...';
async function main() { /* ... */ }
main().then(() => process.exit(0)).catch(e => { console.error('ERR', e?.message ?? e); process.exit(1); });
EOF
node --env-file=.env.local --import tsx ./diag.ts 2>&1 | grep -vE "ExperimentalWarning|--trace-warnings"
rm -f diag.ts
```
Show parametric filtering returns dual-CMOS op-amps and 1µF/25V/X7R/0805 caps, AND that category resolution
works for C4 (the 0-keyword case). If it holds → build behind existing structure with keyword FALLBACK (a
family that can't be parametric-filtered stays byte-identical to today). If not → report the real blocker.

## Risks / unverified
- **Category resolution without a working keyword (op-amp) — MAIN unknown.** Check `app/api/admin/taxonomy`
  / Digikey category tree for a family→categoryId path, or bootstrap from a clean family-base keyword.
- Multi-constraint facet value matching (canonicalization at scale).
- Only Digikey + Atlas are value-search sources; parts.io/Mouser are MPN-keyed (fine).
- Datasheet-only specs (not Digikey facets) can't be filtered → fall to vetting (acceptable).

## NOT recommended (the cheap patch the user rejected in spirit)
Curated clean keyword base per family. Fixes verbose-name 0-results cheaply but stays text-guessing; doesn't
fix over-narrowing or multi-numeric; per-family drift = whack-a-mole.

## Other open items
- **#14**: greenfield chat-prompt regression checklist (`docs/chat-prompt-regression-checklist.md`) — PRE-MERGE
  gate, manual live-app, NOT run. Required because this session edited the chat prompt (review fix #13).
- `docs/guided-selection-review-fixes.md` records deferred review items (#2 real state channel, #6, #9, #15).
- Cosmetic: op-amp supply-voltage question prose reads "Supply Voltage Range (Single/Dual)" — verbose but not
  a bug (it's a typed question now).
- User is NON-TECHNICAL: plain language, no jargon/IDs/decision-numbers; lead with the answer; stress-test
  plans and name unverified parts BEFORE presenting; never raise "the demo"; commit checkpoints.
