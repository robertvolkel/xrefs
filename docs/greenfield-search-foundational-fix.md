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

## VERIFY FIRST (before changing any app code) — this is step 1, user-approved approach
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
