# Bench test findings — 14 July 2026

Owner-run test pass against branch `feat/selection-audit`, app on localhost:3000.
Protocol: https://claude.ai/code/artifact/d3eb0bef-6302-4685-bf38-44a324132165

**Attribution.** The branch's 20 control queries came back byte-identical between `main` and the branch
(measured via `scripts/search-regression-harness.ts`), so nothing that already worked was broken. But
**four findings ARE introduced by this branch** and are marked ⚠️ MINE: **F8** (critical — every part
reads "Below spec"), **F9** (latent), **F12** and **F13** (UX). The rest are pre-existing on `main`.

---

## Findings

### F1 · The 🇨🇳 flag is missing on search cards for Chinese makers whose data came from Digikey
**Severity: high** · **Effort: one line** · Found by test A3.

`PartOptionsSelector.tsx:108` draws the flag when `part.dataSource === 'atlas'` — i.e. it asks
*where the data came from*, not *who made the part*. Every other surface (recommendation cards,
specs panel, comparison view) correctly asks `mfrOrigin === 'atlas'` — that was Decision #161,
and the search cards never got it.

Measured, on a live `LM358` search:

```
LM358        GOODWORK       source=digikey   mfrOrigin=atlas    ← we KNOW it's Chinese; no flag drawn
LM358DR2G    onsemi         source=digikey   mfrOrigin=western
```

The correct answer is already on the object. Worse, the **"only show me the Chinese ones" filter
uses the right rule** (`mfrOrigin === 'atlas' || dataSource === 'atlas'`, `searchResultFilter.ts`),
so a filtered list *keeps* GOODWORK **and shows it with no flag** — the filter and the flag
visibly disagree, which reads to a user as a broken filter.

**Fix:** make the card mirror the filter predicate exactly. Do NOT leave two copies of the rule —
export one shared predicate and have both call it (see `a-rule-in-a-comment-is-not-a-rule`).

---

### F2 · Search results are ranked by Digikey's keyword relevance, not by anything the user cares about
**Severity: high (product decision, not a code bug)** · Found by test A3.

`partDataService.ts:642` — the ONLY sort applied to merged search results is Active-before-dead.
Source priority (Digikey → Atlas → parts.io) supplies the rest of the order, so in practice the
cards appear in *Digikey's keyword-relevance order*.

Consequence, observed: for the user (Tier-1 automotive buyer, profile says *"low risk above
everything else"*), a search for `LM358` puts **GOODWORK's part at position 1** — because its MPN
is an exact string match — **unflagged** (see F1). Meanwhile the model's own prose, which *does*
read the profile, correctly recommends the two AEC-Q100 automotive parts further down.

**The cards and the written advice contradict each other, and the prose is the one that's right.**

The user profile / preferences feed the *recommendation* sort (preferred manufacturers,
composite score) but touch the search-card order not at all.

**Open question for the owner:** what SHOULD rank a search card? Lifecycle, distributor count,
AEC qualification, manufacturer tier, profile preferences? Nobody has ever decided.

---

### F3 · The top recommendation card doesn't say why it outranks better-scoring parts
**Severity: low (cosmetic, but reads as a bug)** · Found by test A2.

On `BC847BLT1G` → replacements: the #1 card is **BC847B (Diotec), 72%, `1 failed · 7 need review`**,
sitting above three **94%, zero-fail** parts. This is *by design* — BC847B is an **Accuris-certified**
human-verified cross, and certified crosses are deliberately ranked above anything our own rules
merely inferred (`sortRecommendationsForDisplay`, Decision #244).

But nothing on the card explains that, so a lower-scoring part with a failure appears to have won.

**Fix:** one line of copy on the card, e.g. "Ranked first: verified cross-reference".

*Checked and NOT a bug:* the summary line "65 flagged for parameter mismatches" is accurate —
`buildRecsSummary` counts real value disagreements (`countRealMismatches`), not missing data.
I suspected it conflated the two; it does not.

---

### F4 · The spec-driven catalogue fetch times out ~half the time and fails silently
**Severity: critical** · Found by the regression harness.

`getCategoryParametricFacets('', categoryId)` asks Digikey to aggregate an entire product category
with an empty keyword. It is **not cached**, and the client timeout is **10 s**
(`digikeyClient.ts:177`). Measured: **4 of 6 direct calls timed out.**

Both call sites swallow it — `greenfieldParametricFetch.ts:242` and `:246` both end in
`.catch(() => null)` — so the fetch returns zero products, logs nothing, and the search silently
degrades to a plain keyword pool.

Measured, same query run 4× on each commit:

| | run 1 | run 2 | run 3 | run 4 |
|---|---|---|---|---|
| `feat/selection-audit` | 50 | **0** | 50 | **0** |
| `main` | **0** | **0** | 50 | **0** |

**It is a coin flip on both commits — this is not a regression from the branch.**

**Fix:** cache the category facet structure (it is catalogue *structure*, not pricing/stock — a
slowly-changing dimension, safe to persist under the project's own caching rule). That removes the
timeouts *and* takes a 10-second call off the hot path. Separately: **make the silent catch loud.**
A failure nobody can see is why this survived a month.

---

### F5 · A part whose specs we cannot read scores a PASSING grade
**Severity: critical** · Found by the regression harness.

Digikey returns MOSFETs in more than one shape. For dual/array parts (`Configuration = 2 N-Channel
(Dual)`), the parameter map produces slugified fallback ids instead of the ids the rules need:

| rule needs | map produced |
|---|---|
| `id_max` | `current_continuous_drain_id_@_25°c` |
| `vds_max` | `drain_to_source_voltage_vdss_` |
| `channel_type` | `configuration` |

So **every rule sees missing data**, and the engine's invariant is *missing data never fails a part*
→ every rule returns `review` → the part **cannot fail anything** → it scores **86% "Fits your specs"**.

Measured: a request for a **1–5 A** MOSFET returns `2N7002` / `BSS138` (**200–300 mA** parts) labelled
**"fits your specs"**, `failCount = 0`.

**Being unreadable is currently an advantage.** A part we CAN evaluate accumulates real failures; a
part we can't sails through.

**Fix (two parts):** (a) teach the map the second MOSFET shape; (b) more importantly, stop letting an
all-unknown candidate present as a confident match — "we couldn't read this part's specs" must be a
visible state, not a silent pass.

---

### F6 · The regression harness does not cover the chat layer — a gap in the instrument itself
**Severity: medium (process)** · Found by test A5.

`scripts/search-regression-harness.ts` calls `searchParts()` directly. It therefore proves things
about the **search engine** and nothing at all about **the chat's decision of whether to search**.

Test A5 (`mlcc capacitor 0805`) exposed this: the harness said "20 results, identical on both
commits," and I wrote a prediction of "cards appear" tagged **MEASURED**. The app instead entered
the guided question flow — correctly, and identically on both commits. The measurement was true and
the prediction drawn from it was false, because they are about different layers.

**Fix:** extend the harness with a second corpus that drives `chat()` end-to-end and asserts on the
turn OUTCOME (did it ask, or search, and with what) — not on which function ran. The 1,627 real chat
turns in `conversations.messages` are the corpus; it already exists.

---

### F7 · Gain bins are concatenated into the MPN in the Atlas data — **KNOWN TO OWNER**
778 `atlas_products` rows have MPNs like `MMBT5551(RANGE:200-300)`. JSCJ (389) and JCET (388).
Downstream: no distributor can resolve the MPN → "No distributor data" on the card. Owner is aware.

---

### F8 · ⚠️ MINE · Two duplicate constraints become an "exactly N" requirement — EVERY part reads "Below spec"
**Severity: critical** · **Introduced by this branch** · Found by test B8.

`NPN transistor in SOT-23 with gain of at least 300` → **all 50 results marked "Below spec"**.

Cause. On a greenfield turn `llmOrchestrator.ts:~1327` **unions** the agentic model's constraints with
the temp-0 `forceExtractSpecs` output (deliberately — to recover specs the model drops). Measured, the
union for that query is:

```
model     : channel type = NPN | package = SOT-23 | DC current gain (hFE) = 300
extractor : package = SOT-23   | hFE = 300
```

`hFE = 300` therefore arrives **twice**. `parseStatedBands` (`statedBands.ts`) contains this rule:

> `else if (e.plains.length >= 2) { lo = Math.min(...e.plains); hi = Math.max(...e.plains); }`
> *"two plain values for the same attr → two-sided (an implicit range)"*

So it produces **`hfe: [300, 300]`** — "gain must be EXACTLY 300". Nothing on Earth qualifies.

**The rule is an invented heuristic and should be deleted, not patched.** Two identical values are a
DUPLICATE, not a range. Even two *different* bare values are not reliably a range. A range must be
STATED as a range (`"200-400"`) or carry explicit min/max labels — which is the module's own rule 1,
violated by its own rule 2. Dedupe the constraint list as well (belt and braces), but the heuristic
is the defect.

*Verified: with the duplicate removed, the same query produces NO band — correct.*

---

### F9 · ⚠️ MINE · A package code parses as a negative number and becomes a numeric band
**Severity: high (latent)** · **Introduced by this branch** · Found while diagnosing B8.

`parseStatedBands` produced **`package_case: [-23, -23]`** from the string `"SOT-23"` — the range regex
`(-?\d[\d.]*)\s*(?:-|–|~|to)\s*(-?\d[\d.]*)` grabbed `-23` out of the package code.

Inert *today* only because `package_case` is an `identity` rule and `countStatedBandViolations` skips
rules the engine can compare. That is luck, not design — the same regex will hit `TO-220-3`, `0805`,
`SOT-23-3`, `DFN1006-3`.

**Fix:** `parseStatedBands` must refuse to build a band for any rule the engine CAN compare
(`ruleCanCompare`) and for any non-numeric spec — at PARSE time, so a bad band cannot exist for a
consumer to misuse. Same "make it unrepresentable" discipline as the band-direction fix.

---

### F10 · The model describes a bipolar transistor's polarity as "channel type" → the NPN requirement is silently dropped
**Severity: high** · Pre-existing · Found by test B8.

Measured: for `NPN transistor…`, the model emits `{ attribute: "channel type", value: "NPN" }`.
"Channel type" is **MOSFET** vocabulary; family B6 (BJT) has no such attribute, so
`resolveAttributeId('channel type', B6)` returns **null** and the constraint is dropped **without a word**.

Consequence: PNP parts appear in an explicitly-NPN search.

**Fix:** (a) a per-family synonym entry (`channel type` → `polarity` for BJTs); (b) more importantly,
**an unresolvable constraint must be reported, not swallowed** — this is exactly gap D1 (see below),
and it is the reason the gap matters.

---

### F11 · "at least 300" loses its direction before it reaches the engine
**Severity: high** · Pre-existing (extractor) · Found by test B8.

Both the agentic model and `forceExtractSpecs` emit a bare `{ attribute: 'hFE', value: 300 }` for
*"gain of **at least** 300"*. The `at least` is gone. `parseStatedBands` correctly refuses to guess a
direction from a bare value (rule 1) — so the requirement is simply not applied.

**Fix:** the extractor's schema needs a bound field (`min` / `max` / `exact` / `range`), so a stated
direction survives extraction. This is the missing half of the stated-bands work.

---

### F12 · ⚠️ MINE · The guided value questions are a wall of internal jargon, and re-ask on partial answers
**Severity: medium (UX)** · **Introduced by this branch** · Found by test B4/B5.

Observed:
> *"What Output Voltage Vout, Maximum Output Current (Iout Max), Maximum Input Voltage (Vin Max), and
> Package / Footprint are you targeting?"*

Answer one → it re-asks the other three as another batch. Two problems: (a) four questions in one
sentence; (b) the wording is the raw `attributeName` from the logic table, not human phrasing
("How much current does it need to supply?").

---

### F13 · ⚠️ MINE · The narrowing-question buttons carry no units
**Severity: medium (UX)** · **Introduced by this branch** · Found by test B6.

Buttons read `0.12 - 0.24` / `0.24 - 0.46` … with **no unit**. They are volts. Unanswerable without
guessing. `pickNarrowingQuestion` builds the bucket labels from `sig2()` numbers and never appends the
rule's unit.

---

### F14 · Refreshing 6 BOM rows takes ~40 s on a warm cache
**Severity: medium (perf)** · Unattributed · Found by test A8.

~7 s per row. First run (cold cache, after this branch's cache-version bump) took ~60 s; second run
~40 s, so it is not purely cold-cache. **Not yet compared against `main`** — do that before assigning
blame.

---

### F15 · 🔴 The guided search uses the logic table's FAMILY DISPLAY NAME as the Digikey keyword
**Severity: CRITICAL — this is the worst bug found.** Pre-existing on `main` (identical code,
`guidedSelectionController.ts:230` on branch / `:218` on main). Found by tests C1, C2, D3.

```ts
const partType = getLogicTable(familyId)?.familyName   // "MOSFETs — N-Channel & P-Channel"
...
query: buildGreenfieldQuery(partType, step.constraints)
```

We hand Digikey a **keyword search** for the string `"MOSFETs — N-Channel & P-Channel"` — em-dash,
ampersand and all. Measured, live:

| user asked for | pool returned |
|---|---|
| N-channel MOSFET, 30 V, 1–5 A | **3 parts** (2 Discontinued, 1 a bare unpackaged DIE) |
| 10 Ω resistor, 0402, 1% | **20 parts — not one of them 10 Ω** (all 1k / 10k / 100k) |

**The app cannot find a 10 ohm resistor.** It is family-dependent: the C1-LDO family's display name
(`"Linear Voltage Regulators (LDOs)"`) happens to be a usable keyword, which is why test B7 returned
50 good 3.3 V LDOs. MOSFETs and resistors got unlucky.

**This compounds with F4.** The parametric fetch was supposed to make the keyword irrelevant — but it
silently times out, so the keyword *is* the pool.

**Already documented** in the plan file (Road B, defect #6) — *"The mechanism that found BC847 was
removed; the mechanism that replaced it rejects it"* — and never fixed.

**Fix:** the guided path must build a real keyword (`"npn bjt transistor"`, `"chip resistor 0402"`),
not the family's prose title. The model's path already does this correctly (`buildGreenfieldQuery`
with a model-supplied `partType` like `"NPN BJT transistor"`) — which is exactly why B1 worked and
C1 did not.

---

### F16 · The guided answer-extractor cannot represent a RANGE — "1 to 5 amps" silently becomes "any"
**Severity: critical** · Pre-existing · Found by test C1.

Measured, for `"I need an N-channel MOSFET, 30V, 1 to 5 amps"`:

```
answered    = [channel_type, vds_max, id_max, package_case]   ← id_max IS here (it heard you)
constraints = [channel_type=N-Channel, vds_max=30V]           ← id_max is NOT here (no value)
```

`extractAnsweredSpecs` records `id_max` as *addressed* but with **no value** — so `hasValue()` is
false and `buildConstraints` drops it. The current requirement never reaches the engine.

Sibling of **F11** (the model's extractor loses "at least"). Both are the same root defect: **the
extraction schema has no way to carry a bound or a range**, only a scalar.

**Fix:** give the extractor's value schema a shape (`{ kind: 'exact'|'min'|'max'|'range', ... }`),
and reject/flag a spec it heard but could not represent — never silently downgrade it to "any".

---

## Test log

| # | test | result |
|---|---|---|
| A1 | `BC847BLT1G` loads | **PASS** — 3 results, matches measurement. Profile-driven BMS/AEC advice verified grounded. |
| A2 | Find Replacements | **PASS** — 70 matches, as measured. Exposed F3. |
| A3 | `LM358` loads | **PASS** — 50 results, as measured. Exposed F1 and F2. |
| A4 | `EKY-630ELL681ML25S` loads | **PASS** — 1 result, as measured. |
| A5 | `mlcc capacitor 0805` (no specs) | **PASS** — enters the guided flow and asks for the dielectric. Identical on `main`. My prediction ("cards appear") was WRONG; exposed F6. |
| A6 | "show me only the Chinese ones" | **PASS** — filter + count correct, flags correct. Exposed F7 (known). |
| A7 | "hide the obsolete ones" | **PASS** — hides the obsolete part. |
| A8 | open a saved parts list | **PASS** — works. ~40 s for 6 rows (F14). |
| B1 | NPN 9V 1-2mA gain 200-400 → BC847B | **PASS** — BC847BLT1G at rank 2, "Fits your specs". |
| B2 | BC847C marked "Below spec" | **PASS** — near bottom, "Below spec", gain 420. |
| B3 | "I need a voltage regulator" → asks questions | **PASS** — one question at a time, buttons. |
| B4 | typed value used verbatim | **PASS** — typed `3.3V`, used exactly. Exposed F12. |
| B5 | asks for INPUT voltage | **PASS** — asks "Maximum Input Voltage (Vin Max)". This question did not exist before the branch. |
| B6 | narrowing question fires | **PASS** — "That gives 50 parts — more than is useful." Exposed F13 (no units). |
| B7 | "Any" does not loop | **PASS** — no loop; 50 correct 3.3 V LDOs. |
| B8 | volunteered gain is used | **FAIL** — every part "Below spec". Root cause F8 (duplicate → "exactly 300" band). Also exposed F9, F10, F11. |
| C1 | MOSFET 1-5A (expect FAIL) | **FAIL — worse than predicted.** Pool collapsed to **3 parts** (2 discontinued, 1 a bare die). Root cause F15 + F16. |
| C2 | same search 3× (expect FAIL) | **Prediction WRONG** — results are perfectly STABLE. The guided search key is derived from family+specs, not the user's words, so re-wording hits the same cache entry. Deterministically wrong. |
| D1 | "low noise" silently ignored | **CONFIRMED** — 50 correct parts; "low noise"/"low ESR" dropped without a word. |
| D2 | 500uF in an 0402 | **CONFIRMED** — returns 50 parts, **every one "Below spec"**, and still says "ranked by how well they fit your specs". The engine KNOWS nothing fits; the app never says so. |
| D3 | 10 Ω resistor | **FAIL — far worse than predicted.** Returned **zero 10 Ω resistors** — 20 parts, all 1k/10k/100k, all "Below spec". Root cause F15. **The app cannot find a 10 Ω resistor.** |
| D4 | 800V 50A NPN in SOT-23 | **FAIL — the worst result of the session.** A **15 V / 200 mA** part is labelled **"Fits your specs"** for an 800 V / 50 A request. Direct confirmation of F5 in the wild. |

## Wrong calls I made during this session (kept deliberately)

- Claimed the branch broke the MOSFET search. **False** — it's a coin flip on both commits; I had
  diagnosed a regression from a single sample.
- Suspected the "65 flagged for parameter mismatches" wording conflated fails with missing data.
  **False** — checked, it's accurate.
- Suspected the model fabricated GOODWORK's Chinese origin. **False** — it's in the Atlas table and
  correctly resolved. The bug was in the UI, not the model.
- Claimed the guided flow "asks you for information you already gave it" (it appeared to ask
  polarity after the user said NPN). **False** — my test script wired an empty extractor into
  `decideGuidedTurn`. Through the real `chat()`, "NPN transistor, 45V, SOT-23" correctly asks only
  for the missing collector current, and "N-channel MOSFET, 30V, 1-5A" asks only for the package.
  **The app hears what you tell it.** The bug was entirely in my harness.

**Do NOT test `decideGuidedTurn` in isolation.** It takes the answer-extractor as a callback; stub
that callback and the flow looks broken in a way it is not. Drive `chat()`.

Pattern: every wrong call came from reasoning about code; every correction came from running it more
than once. See memory `verify-dont-reason-technical-plans` and `react-perf-measure-dont-reason`.
