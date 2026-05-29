# How XRefs Searches, Routes, and Recommends Parts

*An explainer for the search flow, the role of the conversational agent,
and the six data sources that feed the matching engine.*

---

## The User's Journey in One Paragraph

A user types a part number — say `RC0805FR-0710KL` — into the chat-style
input box. A few seconds later they see a card identifying that part as a
10kΩ 1% 0805 chip resistor from Yageo, with its full parametric data. They
click "Find Replacements." The right side of the screen fills with a
ranked list of replacement candidates: manufacturer-certified crosses
near the top, then engine-scored matches, each with a match percentage,
mismatch chips, and live distributor pricing. The user can keep typing
into the same chat box to refine the list ("only Chinese alternatives,"
"at least 80% match"), ask parametric questions about the cards
("which ones are AEC-Q200?"), or pivot to a new search.

What looks like one smooth interaction is actually three deterministic
phases stitched together by a conversational agent that never makes
scoring decisions of its own. This explainer covers how that works.

---

## Part 1 — The Three-Phase Pipeline

### The Guiding Principle

**The matching engine is deterministic. The agent is conversational.**

This separation is load-bearing. Cross-reference recommendations have to
be reproducible — the same input must always produce the same scored
output — so the agent is kept out of the scoring loop entirely. The
agent's job is to figure out what the user is asking for and route them
to one of three deterministic phases. Once a phase is running, no model
output influences the result.

---

### Phase 1: Search (Identify the Source Part)

When the user submits a query, the agent decides whether it looks like a
search request and calls a single tool, `search_parts`. That tool runs a
multi-source query in parallel:

- **Digikey** is queried first, always. It's the canonical source of
  Western parametric data.
- **Atlas** (the Chinese-manufacturer dataset described in the ingestion
  explainer) is queried in parallel.
- **Parts.io** (a third-party industry index, formerly Accuris) is queried
  only when the input looks like a manufacturer part number — never on
  free-text descriptions. Description search there is too noisy to be
  worth the latency.

A simple priority dedup merges the three result sets: when the same part
number appears in multiple sources, the Digikey row wins. Non-Digikey
rows only survive for parts Digikey doesn't have. The merged list is
capped at 50 results. Every card carries a `dataSource` tag identifying
where it came from, which is what powers the country-of-origin flag on
the card.

**Mouser is deliberately not in this list.** It was removed from search
in a prior decision because it's a distributor index, not a manufacturer
index — querying it added 100–200ms of latency for results that mostly
duplicated Digikey. Mouser still plays a role, just not here.

### Phase 2: Attribute Fetch (Enrich the Source Part)

When the user clicks a search card to confirm the source part, a second
deterministic call fetches the part's full parametric data. The pipeline
is again Digikey-first, but with a twist: gap-fill happens in parallel.

- **Digikey** returns its full parametric snapshot.
- **Parts.io** runs in parallel to fill *only* the parameters Digikey
  doesn't have — datasheet-only specs like thyristor turn-off time,
  relay coil power, fuse I²t. Digikey values always win on conflict.
- **FindChips** runs in parallel to attach commercial data — pricing
  tiers, stock, lifecycle status, regulatory compliance — from roughly
  80 distributors in one API call.

If Digikey is unavailable, the pipeline falls back to parts.io or Atlas
as primary, and the gap-fill direction reverses. The principle is the
same in either case: **a single source can't tell the whole story, so
fetch what each is best at and merge with a fixed priority.**

### Phase 3: Recommendations (Find and Score Replacements)

When the user clicks "Find Replacements," the recommendation pipeline
runs. This is the most complex of the three phases and the one where
several data sources converge.

The high-level steps:

1. **Classify the source part** into a component family (MLCC capacitors,
   N-channel MOSFETs, LDO regulators, etc.). There are 43 such families,
   each with its own logic table of matching rules.
2. **Load the family's matching rules**, including any admin overrides
   the team has applied through the rules-editor UI.
3. **Apply the user's application context**, if they've answered the
   per-family context questions (intent, environment, special
   constraints). Context can promote a rule from informational to
   blocking, or vice versa.
4. **Fetch candidate parts** from Digikey using the source's critical
   parameters as keywords.
5. **Pull certified-cross candidates from three additional sources** —
   parts.io's Accuris functional-equivalent index, Mouser's
   manufacturer-published successor MPNs, and any in-house
   manufacturer cross-reference table the team has uploaded.
6. **Score every candidate** against every rule. Each rule produces a
   pass / fail / review verdict and contributes to the candidate's
   match percentage.
7. **Apply post-scoring filters** — a categorical qualification-domain
   gate (e.g., an automotive source part shouldn't surface
   commercial-grade replacements) and family-specific blocking-rule
   filters (e.g., a half-bridge gate driver shouldn't surface a
   single-channel driver).
8. **Sort into three buckets** and return.

The three buckets, in order:

- **Accuris Certified** — parts.io's Functional and Form-Fit-Function
  equivalents. Industry-published.
- **Manufacturer Certified** — crosses the team has uploaded through
  the admin MFR cross-references panel, or that Mouser has published as
  manufacturer successors on EOL parts.
- **Logic Driven** — engine-scored matches.

Within each bucket, pin-to-pin crosses rank above functional crosses,
and the team's "preferred manufacturer" parts float to the top of any
bucket they appear in.

---

### A Subtle but Important Optimization

The recommendation phase actually runs **twice**, on purpose.

The first run skips parts.io enrichment on the *candidates* (the source
part is still enriched). This produces the displayed recommendations in
roughly 500–1500 ms instead of the 3–8 seconds the full pipeline takes.

A second run fires automatically in the background with full parts.io
enrichment enabled, hits the cache to skip work it's already done, and
silently updates the displayed cards in place.

This is also where FindChips enrichment runs: as soon as cards appear,
the app fires a deferred batch of FC calls for the top 30 candidates
first (the ones the user is most likely to look at), then chunks the
rest. Cards show a "loading pricing" placeholder until each chunk
returns.

The principle: **show the user the best answer the system can produce
quickly, then refine in the background.** Users almost never need
sub-100ms accuracy; they always need sub-2-second responsiveness.

---

## Part 2 — The Role of the Conversational Agent

### What the Agent Is

The conversational agent — a Claude Sonnet instance with a structured
system prompt and a small tool inventory — is the layer that figures out
what the user is actually asking for and routes them to the right
deterministic phase.

It exists in three variants:

- **Main chat agent** (used on the search page): the orchestrator the
  user types into.
- **Refinement agent** (used in the per-part modal): a more focused
  variant for digging into a single recommendation.
- **List agent** (used on parts-list pages): a per-list variant with
  read/view/write tools for operating on the user's saved BOMs.

### What the Agent Is Not

The agent **does not run the matching engine.** It cannot start a
cross-reference workflow on its own. That's a deliberate architectural
boundary. The "Find Replacements" button on the UI is the only path that
fires the recommendation pipeline. The agent can refine, filter, ask
questions, and pivot — but the scoring itself stays deterministic and
out of its hands.

This is enforced at the tool level: the `find_replacements` tool was
removed from the agent's inventory. The agent literally can't call it.

### The Four Routing Modes

The main chat agent's system prompt teaches it to recognize four kinds of
user message and respond differently to each:

- **Refine** — "show me only the AEC-Q200 ones," "drop anything under
  80% match." The agent calls a `filter_recommendations` tool that
  applies the predicate to the existing list. No new search.
- **Pivot** — "actually, find me a 0603 instead." The agent calls
  `search_parts` with the new query, throws away the old context, and
  starts a fresh part-selection flow.
- **Ask** — "which of these has the lowest ESR?" The agent calls
  `get_batch_attributes` for up to ten of the displayed cards, reads the
  returned parametric data, and answers from it. No filtering, no
  navigation.
- **Link** — when the agent's response mentions a known part number
  inline, the front end auto-linkifies it. Clicking the link opens that
  part as if the user had just searched for it.

The agent also has access to a manufacturer-profile tool that returns
structured company information for the small set of manufacturers
profiled in the database. The system prompt enforces strict claim
discipline: every factual statement about a manufacturer must trace
back to data the tool returned. If the tool returns nothing, the agent
is required to say "we don't have a profile for that manufacturer"
rather than rely on training-data priors.

### The Principle

**Deterministic core, conversational shell.** The agent's job is intent
resolution, not computation. The matching engine produces the answers;
the agent makes them easier to ask for and reason about.

---

## Part 3 — The Six Data Sources

Each source plays a distinct role. None of them, alone, is enough.

### Digikey — The Spine

The primary parametric source for Western parts. Live API access via
OAuth2. Returns categorized parameter data on roughly two million parts.
Powers search, attribute display, candidate fetch for recommendations,
and price-break tables on the commercial tab.

**Wins** every conflict in the merge pipeline. If Digikey says a
capacitor is X7R, the system treats it as X7R, even if another source
says X5R.

### Atlas — The Geopolitical-Resilience Source

A curated dataset of about 115 Chinese component manufacturers and
55,000 of their products, stored in the app's own Supabase database.
Atlas is the only way these parts surface at all — they don't appear in
Western distributor catalogs.

Atlas data is what makes "find me a Chinese alternative" a real query.
The ingestion explainer covers how it stays clean.

### Parts.io — The Industry Cross-Reference Index

A licensed feed from Accuris that provides two things:

- **Gap-fill enrichment** during the attribute-fetch phase, contributing
  datasheet-only specs that Digikey doesn't expose.
- **Functional and Form-Fit-Function (FFF) equivalents** during the
  recommendation phase. These are industry-published equivalents — the
  same "this is a drop-in for that" relationships engineers have always
  consulted, just structured into an API. They land in the Accuris
  Certified bucket at the top of the results.

### FindChips — The Commercial-Intelligence Feed

A multi-distributor aggregator that returns pricing, stock,
manufacturer-lifecycle status, and compliance flags from roughly 80
distributors in a single API call. This is what powers the Commercial
tab on every part page and the price-break tables on every
recommendation card.

FindChips enrichment is deliberately **deferred** rather than blocking:
recommendations display first with their parametric scoring, then
pricing chips populate as FC responses arrive. This is the optimization
that keeps the user from staring at a spinner for eight seconds.

### OEMS — The Independent-Distributor Channel

The same FindChips API, but queried with a different parameter that
surfaces a different inventory pool: independent distributors and
brokers, including the Chinese distributors (LCSC, Winsource) that
actually carry Atlas parts.

OEMS is not queried on every part. It runs conditionally:

- **Always**, in parallel, for Atlas or Chinese-manufactured parts —
  these need an independent purchase path that Western distributors
  don't provide.
- **As a fallback**, when the regular FindChips call returns no
  distributors at all.
- **As a fallback**, when the regular FindChips call reports the part
  as obsolete or end-of-life, since brokers are often the only path to
  legacy inventory.

OEMS results merge with FC results, with FC winning duplicates by
distributor name. The UI doesn't distinguish — a price quote is a price
quote.

### Mouser — The End-of-Life Safety Net

Mouser used to be in the search and attribute pipelines and is no longer.
Its single remaining job is to provide **manufacturer-published successor
MPNs** on parts the manufacturer has end-of-lifed. Those successors are
injected into the recommendation pipeline as certified-cross candidates,
landing in the Manufacturer Certified bucket.

The reasoning: every other commercial responsibility Mouser had is
covered better by FindChips, but Mouser's EOL successor data isn't
available through any other API the team has tested. So it stays in the
pipeline for that one job.

---

## Part 4 — Three Layers of Prioritization

Prioritization happens at three different layers, each with its own
rule. They're easy to confuse but they answer different questions.

**Search layer — Whose row do we show for this part number?**
Digikey wins. Other sources fill gaps for parts Digikey doesn't carry.

**Attribute layer — Whose value do we trust for this parameter?**
Digikey wins on conflict. Parts.io gap-fills missing values. FindChips
contributes only commercial fields. None of these can overwrite each
other on overlapping fields.

**Recommendation layer — How do we rank candidates?**
Three buckets — Accuris Certified, Manufacturer Certified, Logic Driven —
in that order. Within each bucket: pin-to-pin first, then functional
equivalents, then match-percentage. The user's preferred manufacturers
float to the top of any bucket they appear in.

Certified crosses get a special treatment called **certified-cross
bypass**. The matching engine has post-scoring blocking-rule filters
that automatically reject candidates with categorical mismatches — a
comparator can't replace an op-amp, a TRIAC can't replace a MOSFET. An
*industry-certified* equivalent skips those filters. The principle: an
explicit human certification outranks an inferred rule.

The one bypass that *doesn't* apply is the qualification-domain gate.
Even an Accuris-certified cross has to pass the automotive vs commercial
check if the source part is automotive-graded. Safety domains aren't
negotiable, even by certification.

---

## Closing — Four Principles That Tie It Together

**Deterministic core, conversational shell.** The matching engine never
calls a language model. The language model never scores a candidate.
This is what makes the recommendations reproducible.

**Digikey-first with multi-source breadth.** One source isn't enough,
but a free-for-all merge would be incoherent. A fixed priority with
gap-fill from the others produces the most complete picture without
ambiguity about which source said what.

**Certified crosses outrank inferred rules — except safety.** An
industry-published "drop-in" equivalent skips the engine's blocking
filters because a human said so. But automotive-vs-commercial gating
applies to everything, certified or not.

**Show fast, refine in background.** Recommendations display in under
two seconds with Digikey-only parametric data, then re-score in the
background once parts.io enrichment lands, while FindChips pricing
populates the cards in chunks. The user is never staring at a spinner
when there is a partial answer to look at.

The end result is a system that feels like a single conversational tool
but is built like a pipeline. The conversation hides the seams. The
pipeline guarantees the answers.
