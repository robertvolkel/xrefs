# Guided selection (Decision #262) — code-review fix plan

Branch: `feat/guided-selection-system-driven`. Source: the xhigh `/code-review` run.
Work top-down. Correctness first (1–13), then convention (14), then cleanup (15).
After ANY chat-prompt edit, re-run `docs/chat-prompt-regression-checklist.md` (greenfield) before merge.

## STATUS (2026-06-29)

**Fixed + tested** (2797 jest pass, my files typecheck/lint clean):
- **#1** parseOptions — added a numeric-logicType guard: a `threshold`/`fit`/`identity_range`/`vref_check`
  rule never produces choice buttons (kills the `VDRM / VRRM`, `AC/DC`, `Single/Dual` garbage chips).
  Chosen over the heavier "declare options in 43 logic tables" R-A: every confirmed bug is a numeric spec
  and every genuine choice is identity/identity_upgrade, so the one principled guard is sufficient and
  far lower-risk. (B4 polarity `(Unidirectional vs. Bidirectional)` + B9 `(N/P)` still degrade to typed
  values — not garbage, just no chips; left as-is, noted below.)
- **#3 + #11** disambiguation gate now `!isLikelyTheory && (intent || bareNoun)`; entry gate is theory-wins.
- **#4 + #12** unconditional MPN-escape (`mentionsMpn` defers even mid-flow) + mid-flow theory escape.
- **#5** INTENT_RE rewritten with precise inflection suffixes (choose/choosing/sourcing/designing/…).
- **#7** empty-string answer coerced to null.
- **#8** pinFamily skips spec ANSWERS (incidental "…for an LDO" no longer re-pins); disambiguation answers still pin.
- **#10** guided helper token usage now logged (`chat_guided_extract` / `chat_guided_classify` ApiOperations).
- **#13** stale `present_choices` guided-narrowing clause removed from the prompt (the one prompt edit → #14 applies).
- **#16 (discovered, not in the original 15):** a classifier-entered (long-tail) flow broke on turn 2 —
  `pinFamily` can't re-resolve the family from a spec answer, so `if (inProgress) return null` abandoned it
  to the LLM. Fixed by re-classifying the flow ENTRY message on continuation. Fixed in the same pass as #8.

**Deferred (with reason):**
- **#2 / R-B (real state channel):** NOT done. Would add a metadata field to `OrchestratorMessage` threaded
  through the client + persistence + route — high cross-cutting regression risk on the most sensitive file.
  Mitigated instead: the registry-backed classifier now owns disambiguation, and `pinFamily` is a secondary
  gate, so the false-positive window (LLM prose matching "Which … do you need?") is narrow and self-correcting.
  Real fix tracked for when a metadata channel is added.
- **#6 (empty constraints):** no real harm — `buildSearchSummary` only claims "ranked by fit" when a card
  carries an engine `matchScore`, which an empty-constraints search never produces. Left as-is.
- **#9 (i18n of guided questions):** deferred — blocked on #2 (the English-only regex marker) and non-English
  is not an active priority.
- **#14 (greenfield checklist):** PRE-MERGE gate, still pending — requires a live-model run; see below.
- **#15 (shared forceToolCall helper):** optional cleanup, deferred.

Original plan below (unchanged for the record).

---

## Two root fixes that collapse several findings
- **R-A (kills #1):** declare `input: 'choice' | 'value'` + the option list **per-rule in the logic tables**, instead of reverse-engineering modality from the attributeName parenthetical in `parseOptions` (`selectionQuestions.ts:91/104`).
- **R-B (kills #2, unblocks #9 i18n):** detect "mid-guided-selection" via a **real state channel**, not by regex-matching the question prose (`isSystemGuidedQuestion` / `CHOICE_Q_RE` / `VALUES_Q_RE`). `OrchestratorMessage` has no metadata field today — adding one (or another durable marker) is the deep fix.

## Findings (ranked)

1. **parseOptions mislabels numeric/unit specs as choice buttons** — `selectionQuestions.ts:91`. Verified: C6.tc `(ppm/°C)`→[ppm,°C]; C4.supply_voltage `(Single/Dual)`→[Single,Dual]; B8.vdrm `(VDRM / VRRM)`→[VDRM,VRRM]; 65.max_continuous_voltage `(AC/DC)`→[AC,DC]. Garbage buttons + bogus constraints. **Fix = R-A** (or, interim: reject parentheticals that are units/symbol-synonyms — but R-A is the real fix).

2. **isSystemGuidedQuestion false-positives on the LLM's own clarification prose** — `guidedSelectionController.ts:59`. Prompt (`llmOrchestrator.ts:496`) invites "ask ONE short plain-language question to clarify which component they mean"; "Which type of capacitor do you need?" matches `CHOICE_Q_RE` → next turn `inProgress=true` → hijack. Test masks it (uses non-matching phrasing). **Fix = R-B.**

3. **Bare ambiguous supertype skips disambiguation → classifier railroads to one family** — `guidedSelectionController.ts:232` vs `246`. Verified: bare "regulator" → straight into LDO's output_type, no LDO/switching choice. Cause: disambiguation gated on `hasSelectionIntent` (false for a bare noun) while the classifier branch accepts `isBareNounPhrase`. **Fix:** let the disambiguation branch fire on `hasSelectionIntent || isBareNounPhrase` (i.e., whenever the classifier would), so a detected ambiguous head always shows chips before any single-family guess.

4. **In-progress bypasses MPN + context + entry gates → mid-flow pivot swallowed** — `guidedSelectionController.ts:214/222/258` (all guarded `!inProgress`). "actually look up BC847B" / "show me cheaper ones" / a theory Q mid-flow → re-asked the same spec, no escape. **Fix:** even when `inProgress`, honor an MPN-lookup / clear-pivot escape (e.g. if the answer doesn't parse as a spec AND looks like an MPN or a new part type, defer).

5. **INTENT_RE trailing `\b` defeats stems `choos`/`sourc`/`design`** — `guidedSelectionController.ts:141`. Verified false: "choosing a capacitor", "source a regulator", "sourcing a part", "designing a board". Same `\b`-between-letters class as `family-param-signatures-regex-bug.md`. **Fix:** drop the trailing `\b` on stem alternatives or use `(?![A-Za-z])`.

6. **All-"any" answers → search with empty constraints (no fit ranking)** — `guidedSelection.ts:72/79`. Verified: all-null C1 → `{type:'search', constraints:[]}`. **Fix:** if Tier-2 is "complete" only because everything is null/any, either keep at least the categorical anchors or fall back to a sensible non-empty query; at minimum don't claim "ranked by fit" when constraints is empty.

7. **extractAnsweredSpecs: empty-string value counts as answered but drops from constraints** — `llmOrchestrator.ts:1141`. `value: a.value ?? null` keeps `''`; `isAnswered` (hasOwnProperty) → answered → spec never asked; `hasValue('')` false → not in constraints. **Fix:** coerce `''`→null before insert (`a.value === '' ? null : a.value ?? null`).

8. **pinFamily re-pins on a component noun inside a spec answer** — `guidedSelectionController.ts:165`. Mid-MLCC answer "16V, feeding a regulator" → re-pins C1. **Fix:** only re-pin from a NEW user message that is (near-)solely a part-type, or freeze the family once `inProgress` until an explicit pivot.

9. **Guided questions hardcoded English, bypass locale** — `guidedSelectionController.ts:33` render fns + `llmOrchestrator.ts:1816` (early return ignores `locale`). Non-English users get English interrogation; localizing breaks the English-only regex marker (see R-B). **Fix:** localize the templates AND move off prose-regex detection (R-B) together.

10. **Early-return bypasses logTokenUsage** — `llmOrchestrator.ts:1808–1827`. Guided turns fire `extractAnsweredSpecs` (always) + `classifyPartTypeFamily` (fallback) but return before token logging → undercount/cost-misattribution. **Fix:** log token usage for the guided calls before the early return (accumulate + call logTokenUsage).

11. **Theory Q naming a family + an intent word hijacked into specs** — `guidedSelectionController.ts:258`. "I need help understanding the difference between an LDO and a switching regulator" → pinned C1, gate passes (intent present) → asks specs. **Fix:** if `isLikelyTheory` is true, defer regardless of intent (theory wins over intent when both present).

12. **MPN-in-sentence bypasses the MPN gate when a type is also named** — `guidedSelectionController.ts:214`. "an LDO like AMS1117" / "a MOSFET like IRF540N" → `namesPartType` true → reference MPN ignored, generic checklist starts. **Fix:** still run the MPN/`mentionsMpn` check; if a real MPN is present, prefer the lookup (or offer it).

13. **Stale prompt cross-ref** — `llmOrchestrator.ts:605` still tells the model to use `present_choices` for "pre-search scope/category narrowing during guided selection", contradicting the rewritten system-owned block (496). **Fix:** delete that clause from line 605. (Prompt edit → checklist.)

14. **CONVENTION: chat-prompt edit needs the regression checklist** — `llmOrchestrator.ts:496` + removed `guided_select` tool. CLAUDE.md (Decision #241) requires re-running `docs/chat-prompt-regression-checklist.md`; not recorded. **Action:** run it (greenfield section at minimum) before merge.

15. **REUSE: 3 near-identical forced-tool extractors** — `classifyPartTypeFamily` (`llmOrchestrator.ts:1166`) + `forceExtractSpecs` + `extractAnsweredSpecs`. **Fix (optional):** extract a shared `forceToolCall<T>(client, tool, userContent)` helper.

## Refuted / excluded (do not chase)
searchParts arg order correct; choice round-trip (label→user msg→LABEL_TO_FAMILY) works; `hasValue` handles numeric 0; grounding-gate bypass benign today (deterministic output, no free prose); "classifier fires on 'thanks'" refuted (looksLikeMpn catches it first).
