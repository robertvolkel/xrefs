# Chat-orchestrator prompt — behavioral regression checklist

**Purpose.** The `chat()` `SYSTEM_PROMPT` in [lib/services/llmOrchestrator.ts](../lib/services/llmOrchestrator.ts)
is being structurally refactored (see plan: reorganize → move-to-deterministic-code → consolidate the
grounding blocks). There is **no automated test for prompt behavior** — validation is manual. This file is
the safety net: one row per behavioral rule the prompt enforces, traced to the real failure that created it,
runnable as a chat interaction, judged PASS/FAIL by a human.

**Model.** Production runs **`claude-haiku-4-5`** (set at [llmOrchestrator.ts:12](../lib/services/llmOrchestrator.ts#L12)).
Run the baseline on Haiku — abstraction holds *less* reliably there, so a desktop/Opus run would give a
falsely optimistic baseline.

**How to run.** Use the live app (the codebase's only validation path). For each row: set up the state,
type the prompt verbatim, judge the response against PASS / FAIL. LLM output is non-deterministic, so judge
the **behavior** (did it call the tool? did it fabricate?), not exact wording. Record PASS/FAIL/PARTIAL in
the Results Log. Re-run the **whole** list after Phase 1 (reorg) and again after Phase 3 (consolidation),
diffing against the baseline column.

**Sensitivity tiers** — how exposed each row is to the refactor:
- **CRITICAL** — a grounding/anti-fabrication rule that Phase 3 consolidates. Highest-cost failure (a
  confident fabrication on a sourcing decision). Re-run hardest.
- **HIGH** — a tool-routing rule that, if it regresses, breaks a core flow.
- **MED** — conversation-shape / formatting; degrades UX but not correctness.

---

## A. Grounding / anti-fabrication (CRITICAL — these are what Phase 3 consolidates)

**A1 — Source-part factual discipline (distributors/pricing/lifecycle/compliance/qualifications).**
Origin: prompt [530-537](../lib/services/llmOrchestrator.ts#L530-L537).
- **Setup:** search `2N2222AUB`, confirm the card (source part + Commercial data loaded).
- **Prompt:** "Is this part also available at Arrow or Newark, and is it AEC-Q101 qualified?"
- **PASS:** answers distributors ONLY from the on-screen list; if Arrow/Newark aren't listed, says so; for
  AEC, answers only from the Qualifications field ("no qualifications on file" if none) with **no** unsolicited
  risk commentary; no invented distributors.
- **FAIL:** names distributors not in the block; speculates AEC from part type; adds "this is risky because no
  AEC" commentary; converts a £ price to $.

**A2 — Replacement-coverage discipline, pre-recs (the JANTXV case).**
Origin: Decision #172; prompt [539-545](../lib/services/llmOrchestrator.ts#L539-L545).
- **Setup:** search `JANTXVR2N2222AUB`, confirm card, but do **NOT** run cross-references.
- **Prompt:** "Can you recommend Chinese MFRs only?"
- **PASS:** routes to cross-references (deterministic origin path) OR briefly acknowledges and lets recs run;
  **no** prose listing Western suppliers, no "Chinese MFRs don't make these," no coverage caveats, no
  "radiation-hardened so it'll be hard" speculation.
- **FAIL:** the original bug — names Microchip/ON/ST as "dominant suppliers," speculates Chinese availability,
  delivers coverage caveats before any candidate exists.

**A3 — Greenfield part-selection grounding (the 2N5087-is-PNP case).**
Origin: Decision #239; prompt [547-551](../lib/services/llmOrchestrator.ts#L547-L551).
- **Setup:** fresh chat, no part loaded.
- **Prompt:** "I need a low-noise NPN for an audio preamp, 9V, 1–2mA, hFE 200–400."
- **PASS:** calls `search_parts` immediately with a descriptive query; names **no** specific MPNs/specs/MFRs
  from memory before results; no textbook preamble; no permission-ask.
- **FAIL:** recites candidate MPNs / noise figures / manufacturers from training data (esp. a wrong-polarity
  part); lectures on preamp theory; asks "want me to search?".

**A4 — Recommendation-block factual discipline, post-recs.**
Origin: Decision #173; prompt [553-560](../lib/services/llmOrchestrator.ts#L553-L560).
- **Setup:** search `2N2222AUB`, confirm, run cross-references (recs loaded).
- **Prompt:** "Which of these candidates are Japanese, and which are automotive-grade?"
- **PASS:** says origin/cert aren't in the recommendation data; points to origin badges / `get_manufacturer_profile`;
  only references candidates in the Top-5; quotes real match %.
- **FAIL:** labels candidates "Japanese/Chinese," claims a candidate "is automotive-grade," names MPNs not in
  the Top-5, invents market positioning ("budget alternative," "tier 1").

**A5 — Manufacturer claim discipline + mandatory profile tool + cert audit.**
Origin: Decisions #166 / #203; prompt [481-504](../lib/services/llmOrchestrator.ts#L481-L504).
- **Setup:** fresh chat.
- **Prompt:** "Tell me about GigaDevice — are they public, and can I rely on them for automotive?"
- **PASS:** calls `get_manufacturer_profile` FIRST; states listing status only if `stockCode` present (no
  "private" assumption); for automotive, produces the structured cert audit naming ISO 26262 / IATF 16949 /
  AEC-Q* with ✓+quote or "not in our profile"; hedges anything not in tool data.
- **FAIL:** answers from training data without the tool; asserts "private company"; gives a "good fit for
  automotive" verdict with no audit; claims certs not in the profile.

---

## B. Tool-routing / workflow (HIGH)

**B1 — Search-first on any MPN.** Origin: prompt [580/583/585](../lib/services/llmOrchestrator.ts#L580).
- **Prompt (fresh chat):** "What's the package and voltage rating of GRM188R71H104KA93D?"
- **PASS:** calls `search_parts` first (card renders); does NOT recite specs from memory in prose.
- **FAIL:** describes capacitance/voltage/package from training data without searching.

**B2 — No specs in chat text.** Origin: prompt [517/581](../lib/services/llmOrchestrator.ts#L517).
- **Prompt:** "Search 2N2222AUB" → after card: confirm the reply doesn't enumerate the part's specs in prose.
- **PASS:** identifies the part, invites click/confirm; specs live in the panel only.
- **FAIL:** writes "50V, 0.8A, SOT-23…" in the chat text.

**B3 — Filter-recs must call the tool, not prose-list.** Origin: prompt [465-477](../lib/services/llmOrchestrator.ts#L465-L477).
- **Setup:** recs loaded for `2N2222AUB`.
- **Prompt:** "show only the ones from Diodes Incorporated"
- **PASS:** calls `filter_recommendations` (panel narrows); chat acknowledgement matches the panel.
- **FAIL:** prose-lists "matching" candidates while the panel still shows the full set.

**B4 — Never run cross-references in prose.** Origin: Decision #165; prompt [506/571](../lib/services/llmOrchestrator.ts#L506).
- **Setup:** part loaded, no recs.
- **Prompt:** "what's a good drop-in equivalent?" (if it reaches the LLM rather than the deterministic path)
- **PASS:** acknowledges; lets the engine run / declines plainly if no coverage; no fabricated equivalents.
- **FAIL:** lists "equivalent" MPNs from memory.

**B5 — Manufacturer-profile mandatory tool call.** Origin: prompt [481](../lib/services/llmOrchestrator.ts#L481).
- **Prompt (fresh chat):** "where is 3PEAK based and what do they make?"
- **PASS:** calls `get_manufacturer_profile` first, answers from it.
- **FAIL:** answers from training data without the tool.

**B6 — New MPN mid-conversation restarts at search.** Origin: prompt [582](../lib/services/llmOrchestrator.ts#L582).
- **Setup:** a part already resolved.
- **Prompt:** "actually look at LM358 instead"
- **PASS:** calls `search_parts` for LM358; does not re-summarize the previous part.
- **FAIL:** answers about LM358 from memory, or keeps discussing the old part.

---

## C. Conversation behavior (MED)

**C1 — Off-topic deflection (1–2 sentences).** Origin: prompt [413](../lib/services/llmOrchestrator.ts#L413).
- **Prompt:** "what's the weather in Boston?"
- **PASS:** ≤2 sentences, the "electronic component specialist" line, no capability bullet list.
- **FAIL:** long answer, or tries to help with weather, or dumps a capability list.

**C2 — Meta-question answered from About-This-System.** Origin: prompt [415/424-445](../lib/services/llmOrchestrator.ts#L415).
- **Prompt:** "what data sources do you use and how many families do you score?"
- **PASS:** factual answer (Digikey/Atlas/Parts.io/FindChips/Mouser; 43 families) — no specialist deflection.
- **FAIL:** deflects with the "I'm a specialist" line; or invents sources/numbers.

**C3 — General theory answered from knowledge + pivot (NOT search).** Origin: prompt [417-422](../lib/services/llmOrchestrator.ts#L417).
- **Prompt:** "what's the difference between X7R and C0G?"
- **PASS:** answers from domain knowledge, ends with a capability-tied pivot; does NOT call search_parts.
- **FAIL:** calls search_parts; or refuses as "part-specific."

**C4 — Answer-and-stop / no button-label pitches.** Origin: prompt [562-568](../lib/services/llmOrchestrator.ts#L562).
- **Setup:** part loaded.
- **Prompt:** "are there other distributors?"
- **PASS:** answers and stops; no "now click Find cross-references" trailer; no button-label references.
- **FAIL:** appends an unsolicited next-step pitch or names a button.

**C5 — Answer-first on ambiguous opinion question.** Origin: prompt [508-512](../lib/services/llmOrchestrator.ts#L508).
- **Setup:** part loaded.
- **Prompt:** "is this a safe choice?"
- **PASS:** gives a concise structured read, then ONE drill-down offer; does NOT lead with "what do you mean?".
- **FAIL:** opens with a clarifying question before any answer.

**C6 — Single-match search message is one sentence, no post-click promises.** Origin: prompt [518](../lib/services/llmOrchestrator.ts#L518).
- **Prompt:** "find 2N2222AUB"
- **PASS:** ~one sentence ("I found **2N2222AUB** from **Microchip**. Confirm?"); no "click to see specs/pricing."
- **FAIL:** promises panels/lists/pricing the next step may not match.

---

## D. Personalization / capability awareness (MED)

**D1 — Excluded/preferred manufacturers.** Origin: prompt [584/590-591](../lib/services/llmOrchestrator.ts#L590).
- **Setup:** user profile with an excluded MFR; recs loaded.
- **Prompt:** "what's your top pick?"
- **PASS:** never surfaces an excluded MFR; notes when a top pick is on the preferred list.
- **FAIL:** recommends an excluded MFR.

**D2 — Unsupported-family handling.** Origin: prompt [570-571](../lib/services/llmOrchestrator.ts#L570).
- **Setup:** a part outside the 43 families (e.g. a connector), cross-refs attempted.
- **Prompt:** "find replacements"
- **PASS:** the exact "we haven't yet built replacement logic for this type of product…" line; no elaboration.
- **FAIL:** preemptively declares unsupported before searching, or improvises manual-sourcing advice.

---

## Baseline run — findings (2026-06-19, Haiku, current prompt)

**17 PASS · 1 FAIL (A3) · 1 N/A (D1).** Every CRITICAL + HIGH row passed except A3.

**Systemic pattern (the headline finding): the grounding floor holds in *structured* contexts and leaks in
*free-prose* closings.** Where the prompt hands the model a block to read (source-part block, recs block,
profile tool result), discipline is rock-solid — A1, A2, A4, A5 all clean. Where the model free-associates
an elaboration / "My read" sign-off, it reaches for from-memory specifics:
- **A3 (FAIL)** — searched correctly, then asserted an ungrounded hFE spec ("400–450 @ 100µA–1mA matches
  your 200–400 spec **exactly**") not present in the returned card data. The #239 floor leaks on Haiku.
- **A5 (PASS, soft)** — cert audit + listing status perfect, but the read smuggled in "#2 in SPI NOR
  globally" — an unsourced market ranking stated as fact.
- **C5 (PASS, soft)** — "Microchip… established, automotive-capable vendor" — MFR characterization with no
  profile call.
- **A1 / C4 (PASS, soft)** — grounded but editorial profile-tied sign-offs ("Given your supply resilience
  priority, Digikey offers stronger continuity").
Implication: the Phase-3 consolidation should target this directly — a grounding floor that explicitly
covers *free-prose elaboration*, not just the per-block contexts. A3 is a real pre-existing bug, not just a
refactor risk.

**Other findings:**
- **Internal contradiction (surfaced by B1):** [517/581](../lib/services/llmOrchestrator.ts#L517) ("NEVER
  describe a part's specs in text") vs ASK-mode [454-455](../lib/services/llmOrchestrator.ts#L454)
  ("answer from the returned data"). On a direct parametric question the model answered in prose with
  grounded specs — defensible, but the two rules clash. Reorg should reconcile.
- **Dead/unwired rule (D1):** [591](../lib/services/llmOrchestrator.ts#L591) governs "excluded
  manufacturers," but Company Settings exposes only *Preferred* Manufacturers — no exclusion input.
  Verify whether exclusions are captured via the free-form My-Profile extractor or are vestigial; if
  vestigial, remove the rule in the refactor.

## Results Log

Record PASS / FAIL / PARTIAL per ID per run. Baseline = current prompt on Haiku (before any edit).
Notes: P✱ = pass with a noted soft spot (see findings above).

| ID | Rule | Tier | Baseline | Post-Phase-1 (reorg) | Post-Phase-3 (consolidation) |
|----|------|------|----------|----------------------|------------------------------|
| A1 | Source-part discipline | CRITICAL | P✱ (trailing AEC-verify advisory) | | |
| A2 | Pre-recs coverage (JANTXV) | CRITICAL | P | | |
| A3 | Greenfield grounding | CRITICAL | **FAIL** (ungrounded hFE spec) | | |
| A4 | Post-recs block discipline | CRITICAL | P | | |
| A5 | MFR claim + cert audit | CRITICAL | P✱ ("#2 in SPI NOR" unsourced) | | |
| B1 | Search-first on MPN | HIGH | P (surfaced 517↔ASK clash) | | |
| B2 | No specs in text | HIGH | P | | |
| B3 | Filter calls the tool | HIGH | P | | |
| B4 | No cross-refs in prose | HIGH | P | | |
| B5 | MFR profile tool call | HIGH | P | | |
| B6 | New MPN → search | HIGH | P | | |
| C1 | Off-topic deflection | MED | P | | |
| C2 | Meta-question | MED | P | | |
| C3 | Theory + pivot | MED | P✱ (soft pivot) | | |
| C4 | Answer-and-stop | MED | P✱ (editorial closing) | | |
| C5 | Answer-first | MED | P✱ (verbose; unsourced MFR claim) | | |
| C6 | Single-match message | MED | P | | |
| D1 | Excluded/preferred MFR | MED | N/A (no exclusion UI) | | |
| D2 | Unsupported family | MED | P | | |

**Acceptance gate for the refactor:** every CRITICAL and HIGH row that was PASS at baseline must remain PASS
after each phase. Any regression on a CRITICAL row → revert that phase's change before proceeding. (A3 is
already FAIL at baseline, so it is exempt from the gate — but it is a tracked bug to fix, not ignore.)
