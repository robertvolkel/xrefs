# Plan: Grounded part numbers — never serve an unverified MPN

Status: **v2 — revised after adversarial audit** (4 independent reviewers, 2026-06-25). Owner: TBD.

> **What changed from v1 and why.** v1 proposed a post-hoc "scanner" (gate) as the *primary* guarantee. The audit found that wrong on two counts: (1) a text scanner cannot *guarantee* anything in this domain because real MPNs and ordinary electronics vocabulary share the same shape, and (2) the "verified list" v1 wanted to check against does not exist server-side today — the system forgets parts from earlier turns, so the scanner would delete legitimate parts. v2 flips the design: **structural rendering is the primary guarantee; the scanner is a narrow backstop + a permanent measurement alarm.** Detail below.

## Goals

- **Goal 1 (hard guarantee):** a part number reaches a customer only if our system actually pulled it from the catalog in that conversation.
- **Goal 2 (risk reduction):** reduce wrong commentary (specs / manufacturer claims) without crippling usefulness on general questions.

## Why v1's scanner-as-primary fails (audit findings)

1. **Detection is structurally unsound as a guarantee.** v1's detector = "MPN-shaped token (letters+digits, ≥4 chars) minus a stoplist." In this domain that maximizes *both* error modes:
   - **False negatives (the unacceptable failure):** a large class of real MPNs have **no digits** (`CSTLS`, `ASTX`, `CRYDOM`, and a fabricated sibling like `MAXREF`/`ASTXR` passes clean); MPNs written with whitespace pass; and standard-shaped real MPNs (`ISO1042`, `RS485`, `0451`) collide with the stoplist so a fabricated `ISO1099` launders through.
   - **False positives (UX damage):** the app's core vocabulary is MPN-shaped — `X7R`, `C0G`, `SOT-23-5`, `AEC-Q200`, `100nF`. A scanner that strips these deletes the *answer*, not a stray code.
   - The stoplist must be simultaneously broad (to spare real vocabulary) and narrow (to catch fabrications that share those shapes) **on the same tokens** — a contradiction. Denylists in open vocabularies are never complete.
2. **The verified set isn't where v1 assumed.** The server receives only a live snapshot of the *current* search/part, which is **replaced** on each new search and **wiped** on reset. A part the customer saw three turns ago is not in the set — so the scanner would strip it as "fabricated." `refinementChat` gets even less (current recommendations only); `listChat` gets BOM rows only. The accumulated, cross-turn verified set the guarantee needs **does not exist yet** and must be built.
3. **A scanner's action must be recovery, not deletion.** Stripping the user's *own* typed part number, or silently deleting "what about the BC547?", is product-wrong and produces broken/dangling replies. The correct response to an unverified part is to **look it up**, not erase it.
4. **Manufacturer names are the same risk class** and were out of scope. "BC846 from Vishay" (real part, wrong maker) is as damaging as a fake MPN and must be covered.

Good news from the audit: **nothing streams** — all three chat replies are assembled fully server-side before sending, so there is a clean, un-bypassable choke point for whichever defense we run. And the structural approach is **already proven here** (the search and recommendation summary lines are system-built, not AI-written, and are fabrication-proof by construction).

## v2 architecture

### Foundation — one accumulated, server-side verified set
- Build a **conversation-keyed verified set** that accumulates across every turn and survives new searches: every looked-up part (`search_parts`, `get_*_attributes`, `present_part_options`), every recommendation, the source part, plus **manufacturer names** from the same lookups. Track **user-typed** MPNs separately ("mentionable," and a trigger to look up — never silently stripped).
- Persist it (keyed on conversation id, like existing recommendation snapshots) so the server holds it on every turn for all three orchestrators.
- **Unify with the existing clickable-link set** so there is ONE source of truth feeding both "what renders as a verified part" and "what the gate trusts."
- This foundation is a prerequisite for *either* defense to validate correctly. It ships first.

### Primary defense — structural rendering (the guarantee)
- Part numbers reach the screen only through **system-rendered components built from tool data** (cards, deterministic tables, summary lines). The model writes the connective narration around them. A part the system never retrieved cannot be rendered — guaranteed by construction, no detector required.
- **First target: a deterministic comparison-table renderer.** This is the highest-density MPN surface and the exact case in the reported screenshot. When the user asks to compare parts, the system pulls the data and draws the table; the model does not type the cells. (Extends the existing proven summary pattern.)

### Backstop — a narrow, high-precision gate (not the primary)
- Structural rendering leaves exactly one prose case: the model **referring to an already-on-screen part by name** ("of those two, the second is obsolete"). Run the gate only there, where the verified set is small and local → precision is high.
- Detector flips to **verified-set-first + positive known-MPN-family signal** (we already have thousands of real MPN-family patterns across the mappers), NOT "permissive-minus-denylist." Derive the non-MPN vocabulary allowlist **programmatically from the logic tables / param maps** so it's self-maintaining.
- Also validate **manufacturer names** in prose against the verified-MFR set (same machinery).

### Action on a catch — recovery, not deletion
1. **User-typed MPN → look it up** (and card it), never strip. Converts "can't mention your part" into "pulled your part up." Matches the existing "always search first" behavior.
2. **Model-introduced unverified part, answer still coherent → regenerate once** with a corrective instruction, behind a visible loading state.
3. **Regenerate still offends, or the part was the whole answer → deterministic safe message + fire a lookup** ("Let me confirm that part from the catalog first —"). **Never an empty or dangling bubble.**
4. **Tables → rendered deterministically** (primary defense), so destructive row-stripping never happens.

### Commentary (Goal 2) — observe, don't strip, in v1
- Manufacturer **names**: in scope for the gate (above).
- Spec **values** tied to a named part: **log-and-observe only** in v1. Error economics are the *inverse* of the MPN gate — stripping a true datasheet spec is exactly the "crippling usefulness" Goal 2 warns against. Don't copy the MPN gate's "stripping is safe" bias here.

### Measurement — the permanent alarm
- Run the detector in **observe-only mode everywhere, forever**, decoupled from enforcement: log every catch (conversation, turn, token, verified-set snapshot, action). Gives a real fabrication rate, a regression alarm if someone adds a new un-rendered prose surface, and tuning data.
- **Strip before persistence.** Saved conversations replay without re-gating, so the gate must act before a reply is stored — and observe-only must not permanently bake pre-enforcement fabrications into history.

## Rollout (revised order)
1. ✅ **Foundation + observe-only detector** — accumulated server-side verified set (MPNs + MFR names) and logging. Zero user impact; measures the real fabrication rate and tunes the allowlist. *(SHIPPED on branch; observe-logging silently no-ops until the `mpn_grounding_observations` table + `SUPABASE_SERVICE_ROLE_KEY` exist in the deployed env.)*
2. ✅ **Deterministic comparison-table rendering** — kills the highest-density fabrication surface (the screenshot case). *(SHIPPED + verified e2e; `present_comparison` tool → `buildComparisonTable` → `ComparisonTable` UI. Handles cold-start + not-carried parts.)*
3. ✅ **Scoped backstop gate** on the prose residue, with recovery actions (regenerate-once → deterministic safe message; user-typed parts are mentionable, never stripped). *(SHIPPED in `chat()` behind `GROUNDING_GATE_ENABLED`, **default OFF**; `lib/services/grounding/groundingGate.ts`. Enforces HIGH-confidence findings only. Verified e2e with the flag forced on. **Enable only after** the observe-only data confirms the dual threshold below.)*
4. **Extend** to remaining prose surfaces (refine modal, list agent) once their verified-set plumbing exists. *(Pending — see BACKLOG "Grounded-MPN gate — follow-ups" (C)/(D), plus cross-turn accumulation (B).)*
5. **Spec-commentary**: keep observe-only; revisit enforcement only if the data justifies it.

**Activation lever:** `GROUNDING_GATE_ENABLED=true` flips the backstop from dormant to enforcing in `chat()`. Leave OFF until the observe-only measurement (step 1) confirms the dual threshold (below). The comparison-table renderer (step 2) and observe-logging (step 1) are always on, independent of this flag.

## Open product decisions to confirm
- **Strict catalog + auto-recover.** Confirm the stance: never suggest a part from memory; when an unverified part comes up, *look it up* rather than delete. (This is the materially-better version of v1's "strict + strip.")
- **"Still referenceable" scope.** A part that scrolled off several searches ago stays in the verified set and is mentionable — confirm that's desired vs. scoping to the current episode.
- **Enforce gate is a DUAL threshold** — flip from observe to enforce only when *both* the missed-fabrication rate and the false-positive-on-legit-vocabulary rate are below stated bars.

## Confidence
The audit changed the design materially (primary mechanism flipped; a foundational gap surfaced). The v2 approach delivers a *real* guarantee on the high-value surfaces (structural rendering, proven in-codebase) instead of a probabilistic detector dressed as one, and isolates the scanner to where it's actually precise. This is the right approach to build.
