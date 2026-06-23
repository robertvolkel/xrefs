# XRefs — Executive Demo Runsheet (~15 min)

**Audience:** one senior decision-maker, mixed lens (business value + one deep technical proof point).
**The one sentence to land:** *XRefs is an intelligent application that explores components **with** you — you stay in the driver's seat through a conversational agent, and the same engine serves both the engineer hunting Chinese replacements and the buyer hunting a better price.*

**Anchor part:** `IRFZ44N` — a 55 V / 49 A power MOSFET. A part every hardware person recognizes, with deep Chinese-manufacturer coverage, rich specs, and live multi-distributor pricing. Verified live on 2026-06-22 (numbers in the green boxes below).

**Three threads to keep pulling on throughout:**
1. *The app guides you* — it asks the right next question instead of dumping a spec sheet.
2. *You control it* — every turn, you narrow, pivot, or filter in plain English.
3. *One engine, two personas* — engineer (technical fit + Chinese options) and buyer (price + well-priced Chinese parts) are the same workflow.

> **🖱️ Click map — every action in order (only TWO are clicks on a part/MFR):**
> 1. **Beat 2** — *type* the vague MOSFET prompt → *type* your answer (no card click)
> 2. **Beat 3a** — *type* `IRFZ44N` → **click the top card `IRFZ44NPBF` (Infineon Technologies)** ⟵ *part click #1*. **Do NOT** click the bare `IRFZ44N` from **minos** lower down (Chinese copy — wrong part).
> 3. **Beat 3b** — click the **Find Cross-References** button
> 4. **Beat 3c** — *type* `show me only the Chinese replacements`, then *type* `show me Infineon replacements` (say "Infineon", **not** "Western")
> 5. **Beat 3d** — open the **application-context questions** → pick **Hard-switching PWM**
> 6. **Beat 4** — open the **Commercial tab** / **Best Spot Price** → qty `1000` (same loaded part, no card click)
> 7. **Beat 5** — **click the `ISC` name on the `IRFB4710` cross-ref card** ⟵ *part/MFR click #2* → *type* `Can I rely on ISC for automotive?`

---

## Pre-demo setup (do this 10 min before, not on camera)

- [ ] **Demo on production** — parts.io enrichment + multi-distributor pricing are live there. (Your local machine currently can't reach parts.io over the VPN; not a demo blocker since you're on prod.) Logged in, browser zoomed so cards are legible on the shared screen.
- [ ] Start from a **clean idle screen** (the particle-wave background, no panels open) — the reveal is part of the story.
- [ ] **Run the dry-run checklist in Appendix B once** against today's live data and pencil in the real price numbers. Live data shifts; never read a number off this page you haven't re-confirmed.
- [ ] Have the fallback family (`AMS1117-3.3` LDO) and fallback part (`2N7002`) in your back pocket in case a beat is thin.

---

## Beat 1 — Frame the problem (1 min · talk over the idle screen)

🎯 **Goal:** establish the pain before the product.

🗣️ **Say:** "Two people in every hardware company have the same problem from opposite ends. The **engineer** needs a part that's a genuine technical fit — and increasingly needs to know whether there's a **Chinese alternative** they can trust. The **buyer** needs the same part cheaper, and keeps hearing Chinese suppliers are 2–4× cheaper but has no clean way to see it. Today that means three browser tabs, a distributor site, and a lot of guessing. XRefs collapses that into one agent that *explores the decision with you* — watch how I stay in control the whole time."

✅ **Proves:** sets up the two-persona thesis and the "user in control" thread.

---

## Beat 2 — The app guides you (2–3 min · the "intelligent + interactive" centerpiece)

🎯 **Goal:** show the agent guiding a vague request instead of demanding a perfect query — and the user steering.

⌨️ **Type into chat (verbatim):**
> `I need to pick a MOSFET for a new design, not sure where to start.`

🗣️ **Say (while it responds):** "I gave it almost nothing — no voltage, no current. Instead of a wall of parts or a textbook lecture, it asks me the *one or two questions that actually narrow the field* and gives me an escape hatch. That's the difference between a search box and an assistant."

⌨️ **Answer its question by typing** (it asks in prose, so type your reply — e.g. `N-channel, 30V, a few amps`). The agent then runs a search and renders part cards.

🗣️ **Say:** "Notice I never had to know the right keywords. It guided me to a real shortlist — and I'm still the one deciding."

✅ **Proves:** thread #1 (guides) + thread #2 (control). This is the moment the "intelligent application" claim becomes concrete.

🛟 **Fallback:** if it searches immediately instead of asking (it does that when your prompt already carries a usable parameter), just say: *"It had enough to act, so it didn't waste my time — but watch it guide on a vaguer ask,"* and move on. Don't fight it. Then go to Beat 3.

> ⚠️ **Rehearse this one.** The guiding behavior is the single most prompt-sensitive moment. **Dry-run 2026-06-22: 4/4 runs guided** — it asked for voltage/current + channel type and offered an escape hatch ("or tell me your priority and I'll search with sensible defaults"), never dumping parts. Note it guides in **prose, not clickable chips**, so plan to **type** your answer (don't promise the audience buttons). If a future run searches immediately, use the Beat-2 fallback below.

---

## Beat 3 — Engineer persona: Chinese replacements + the engine being *smart* (4–5 min · deep technical proof)

🎯 **Goal:** the technical credibility moment — a real matching engine, the Chinese-replacement story, *and* the honesty that makes it an engineering tool: it flags unknown specs as "need review" instead of faking a match.

### 3a — Search the anchor part
⌨️ **Type:** `IRFZ44N` → click the **top card, `IRFZ44NPBF` (Infineon Technologies)**, to load it. *(It's the first result. Don't click the bare `IRFZ44N` from **minos**, or `UMWIRFZ44N` from **UMW**, further down — those are Chinese copies and would change the story.)*

🗣️ **Say:** "A jellybean power MOSFET. Look at the **specs panel** — this isn't a catalog listing, it's normalized parametric data: channel type, 55 volts, 49 amps, on-resistance, gate charge, the things an engineer actually matches on."

> 🟢 **Verified live:** card resolves with **15 parameters** — N-Channel, Si, 55 V, 49 A (Tc), Vgs(th) 4 V, **Rds(on) 17.5 mΩ**, Vgs ±20 V, Ciss 1470 pF, **Qg 63 nC**, Pd 94 W. The search itself surfaces Chinese parts inline — Digikey (Infineon, IR, UMW) **and** Atlas (HXYMOS, **ISC**, minos).

### 3b — Find cross-references (button-driven)
⌨️ **Click the "Find Cross-References" button.**

🗣️ **Say:** "Cross-referencing is a deliberate action — a button, not a guess. Behind it is a deterministic rule engine: 43 component families, each with its own matching logic. For MOSFETs that's 27 rules. Every candidate is scored and ranked — fewest real mismatches first. And notice the top card isn't the highest *percentage* — a Chinese **ISC** part at 83% outranks an 87% Infineon part further down, because it has fewer real mismatches. Match score isn't the whole story."

> 🟢 **Verified live 2026-06-22:** **69 candidates**, ranked, with match %. Because the sort is **fewest-real-mismatches-first**, the **#1 card is a Chinese part — `IRFB4710` (ISC, 83%)** — ranked *above* the higher-scoring `IRFZ46NPBF` (Infineon, **87%**, which sits ~8th). **50 of the 69 are Chinese-manufacturer parts.** MFR spread: UMW (27), Infineon (16), **ISC (9)**, Convert (5), Galaxy (5), NCE (1).

### 3c — Show both sides — and the honesty that makes this an engineering tool
⌨️ **Type into chat:** `show me only the Chinese replacements`

🗣️ **Say:** "Plain English, no menus — and here's the engineer's headline: for one Western jellybean, dozens of vetted Chinese equivalents, each scored against the original. But look at the cards — these ISC parts read **'0 fails, 9–14 need review.'** That's not the engine waving them through; it's the engine telling me *half their specs are unknown — go verify.* It will not fake a match on data it can't see."

> 🟢 **Verified live 2026-06-22 (prod):** `mfr_origin_filter: atlas` → **50 Chinese candidates**. ISC parts carry **9–14 of 27 attributes flagged "need review"** (top card `IRFB4710` = 9, the rest = 14) with **0 real fails** — missing data is flagged, never silently passed. (UMW, Convert, NCE, Galaxy also surface.)

⌨️ **Then type:** `show me Infineon replacements`  *(say "Infineon" — "show me Western replacements" hits a half-wired origin filter and returns only 2)*

🗣️ **Say:** "Now the Western side — same 27 rules. Only **4 attributes need review**, and the engine finds **2 real mismatches** on the 87% part. *That's* the difference: with complete data it can prove the match and pinpoint exactly what's off; with sparse data it's honest that it can't. Which is what actually lets you trust a Chinese alternative — you know precisely what to check, instead of a list that pretends everything's identical."

> 🟢 **Verified live 2026-06-22:** `manufacturer_filter: Infineon` → **16 candidates**, avg **4 of 27 "need review"** (~85% of specs present, likely even fewer on prod with parts.io gap-fill). Top `IRFZ46NPBF` (87%): 4 need review, 2 real fails. Each chat filter applies to the full 69, so Chinese→Infineon doesn't stack to zero. **The "N need review" badge is on every card — that's the data-transparency proof, no filtering required.**

### 3d — Show the engine *adapting* to context (the "aha")
🗣️ **Say:** "Here's what makes it intelligent rather than a lookup table. The app can ask me about my *application* — and re-score accordingly."

⌨️ **Open the application-context questions** and answer **"What switching topology does this MOSFET operate in?" → Hard-switching PWM**.

🗣️ **Say:** "I told it this is a hard-switching converter. Now **gate charge and switching losses matter more** than they did a second ago, and the ranking shifts to reflect that. Same parts, smarter match — because it understands *how I'm using it*, not just the datasheet."

✅ **Proves:** threads #1–#3 together — guided, controlled, and genuinely intelligent matching. This is your technical-leadership payoff.

🛟 **Fallback:** if the context form isn't handy, skip 3d and lean harder on 3c (the Chinese-only filter is the bulletproof moment).

---

## Beat 4 — Buyer persona: same engine, price lens (3 min)

🎯 **Goal:** flip personas without changing tools — and show Chinese parts are *well-priced*, not just present.

🗣️ **Say:** "Now I'm the buyer. Same part, same screen — I just care about a different axis."

⌨️ **Open the Commercial tab** (and/or trigger **Best Spot Price**, enter qty **1000**).

🗣️ **Say:** "One call fans out across ~80 distributors — franchised *and* the independent/Asian broker network where Chinese supply actually lives. It crowns the best price that can actually fulfill my quantity, and sinks the ones that can't."

> 🟢 **Verified live 2026-06-22 (re-confirm exact figures in dry-run — they move):** IRFZ44N returns **17 independent distributor offers** via the broker network — unit prices down to **$0.10** (Unikey, ~10k stock). The ISC cross `IRFB4710` returns **14 offers**, cheapest **~$0.89–0.90/unit** (Tedss / Unikey, 5k–10k stock). Franchised side (element14 Asia-Pacific, etc.) comes in parallel.

🗣️ **Land it:** "So the buyer's story and the engineer's story are the *same discovery*: that ISC part wasn't just a technical match — it's a fraction of the price, with real stock behind it. One engine answered both people."

🛟 **Fallback:** if spot-price is thin for the exact part, just show the **Commercial tab quote table** — the per-distributor stock/price grid makes the same point visually.

> ℹ️ Pricing/stock is always pulled **live** (never cached), so the numbers on screen are current — and exactly why you confirm them in the dry-run rather than reading this page.

---

## Beat 5 — "Can I trust this Chinese supplier?" (1–2 min · the honesty moment)

🎯 **Goal:** prove the platform *knows the companies*, not just the parts — and that it's honest about what it knows.

⌨️ **Click the `ISC` manufacturer name** — it's right there on the **top cross-reference card, `IRFB4710` (ISC)** (any ISC card works; these Chinese/Atlas MFR names are the clickable ones). That opens the profile panel. Then **ask in chat:**
> `Can I rely on ISC for automotive?`

🗣️ **Say:** "It doesn't bluff. It pulls ISC's actual profile and runs a certification audit — and tells me plainly what's there and what isn't."

> 🟢 **Verified live:** ISC = **Inchange Semiconductor, founded 1991**, 30+ years in power semiconductors; certifications on file include **IATF 16949** (the automotive quality standard) + ISO 9001 + REACH. The agent cites what's present and flags anything not in the profile as *"verify with the manufacturer"* — it does **not** fabricate an AEC-Q grade it can't see. (For contrast, 3PEAK is a STAR-listed public company, ticker 688536, 8 certifications.)

🗣️ **Land it:** "That last part — admitting what it *doesn't* know — is why a buyer or a quality engineer can actually act on this. It's intelligence you can audit."

🛟 **Fallback:** click only **Chinese/Atlas** manufacturer names (ISC, 3PEAK, YANGJIE) — we hold rich profiles for ~115 of them. Western names (Infineon, TI) intentionally return "not in our profile," so don't click those expecting a card.

---

## Beat 6 — Close (1 min)

🗣️ **Say:** "What you saw is one intelligent agent that **explored the decision with me** the whole way — it guided when I was vague, it obeyed when I steered, and it served the engineer and the buyer with the same five pillars: **technical matching** (shipped today, 43 families), **commercial intelligence**, **compliance and lifecycle**, **Chinese-manufacturer data most tools simply don't have**, and a path to **supply-chain intelligence**. The cross-reference engine is the wedge. The platform is component intelligence."

---

## Appendix A — Copy-paste phrase cheat sheet

| Beat | Type / click exactly |
|---|---|
| 2 | `I need to pick a MOSFET for a new design, not sure where to start.` |
| 3a | `IRFZ44N` → click the **top card `IRFZ44NPBF` (Infineon)** — *not* the `IRFZ44N` from minos or `UMWIRFZ44N` |
| 3b | **Find Cross-References** button |
| 3c | `show me only the Chinese replacements` → then `show me Infineon replacements` (say "Infineon", **not** "Western") |
| 3d | Context question → **Hard-switching PWM** (and optionally **automotive: Yes**) |
| 4 | **Commercial tab** / **Best Spot Price** → qty `1000` |
| 5 | Click **`ISC`** on the **`IRFB4710`** cross-ref card → `Can I rely on ISC for automotive?` |

---

## Appendix B — Dry-run checklist (run once before the meeting)

Confirm each in a real browser against today's data and note the live numbers:

1. [ ] `IRFZ44N` search shows Digikey **and** Atlas/Chinese results; `IRFZ44NPBF` card loads a full specs panel.
2. [ ] **Find Cross-References** returns a large set with Chinese MFRs (ISC/UMW/Convert) and match %.
3. [ ] `show me only the Chinese replacements` narrows to ~50 (ISC cards show **9–14 "need review"**); then `show me Infineon replacements` narrows to ~16 (cards show **~4 "need review"**). **Do NOT** type "show me Western replacements" — it returns only 2.
4. [ ] **Best Spot Price / Commercial tab** populates with real per-distributor pricing → **write the numbers on the script.**
5. [ ] Click **ISC** → profile opens; `Can I rely on ISC for automotive?` returns a grounded cert audit citing IATF 16949.
6. [ ] **Beat 2 guiding behavior** produces a guiding turn (most prompt-sensitive — see the warning in Beat 2).

⚠️ **One known soft spot to rehearse:** per-candidate AEC-Q101 badges enrich *after* the cards render (they come from the live commercial/qualification feed), and the cross-domain qualification *gate* is currently tuned for Murata MLCCs, not MOSFETs. So if you ask *"which of these are automotive-qualified?"* mid-list, the answer can be sparse. **Keep the automotive-certification proof in Beat 5 (the ISC IATF-16949 cert audit), which is grounded and reliable** — don't make a per-candidate AEC badge the headline unless your dry-run shows it populating cleanly.

---

## Appendix C — Guardrails (so the live demo can't trip)

- **Don't ask the chat to "find replacements."** Cross-referencing is the button (by design — it keeps the engine from firing when you're just asking a question). Click the button, *then* filter/ask in chat.
- **To isolate "Western" parts, name a manufacturer** (`show me Infineon replacements`), never `show me Western replacements` — the Western origin filter is half-wired and returns only 2 parts, hiding the obvious Infineon crosses. The Chinese filter (`show me only the Chinese replacements`) works correctly.
- **"Accuris-certified" parts are data-dependent and `IRFZ44N` has none** — its crosses are all "Logic Driven." Don't promise a green Accuris/3rd-Party-Certified bucket on this part; the spec-transparency contrast in Beat 3c is the substitute proof.
- **Only click Chinese/Atlas MFR names for profiles** (ISC, 3PEAK, YANGJIE). Western majors return "not in our profile."
- **The agent won't recite specs in chat prose for a search** — that's intentional anti-fabrication. Point at the specs panel instead.
- **Best Spot Price is a clean deterministic summary**, not an essay — don't tee up "give me your opinion on the supply chain," it won't editorialize (and that's a feature).
- **Never read a price/stock number off this script** — they're live. Read them off the screen.

---

*Verified live 2026-06-22 against the running app (Digikey + Atlas + FindChips). Re-verify with Appendix B before the meeting — live data moves.*
