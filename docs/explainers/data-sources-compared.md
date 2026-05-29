# How XRefs's Data Sources Differ From Each Other

*An explainer for why the app reads from seven distinct sources, what
each one is best at, and why no single feed could replace the others.*

---

## Why Seven Sources?

The most natural question to ask about XRefs's architecture is also the
sharpest: *why not just pick one good source and stop there?* Component
data is a commodity, after all. Several distributors publish APIs. One
of them should be enough.

It isn't, for two structural reasons.

**No single source covers every kind of information engineers need.**
Picking a part for a design isn't just about its electrical
characteristics. Engineers also need to know what it costs, who has it
in stock, whether the manufacturer has end-of-lifed it, what its
manufacturer-certified equivalents are, and what kind of company makes
it. Those are five different categories of information, and they live
in five different places. Even the largest distributors only cover two
or three of them well.

**Western and Chinese component ecosystems are structurally
different.** Digikey, Mouser, Arrow, and the other Western distributors
cover a particular catalog of parts: the parts manufactured by
companies whose business model includes Western distribution. The
115-or-so Chinese manufacturers in Atlas — companies that sell into
Asian supply chains and ship through Asian distributors — are largely
invisible to Western distributor catalogs. For the app to surface
Chinese alternatives to Western parts (a major use case for cost-down
and geopolitical-resilience reasons), it has to maintain its own
dataset of those manufacturers and publish them alongside the Western
ones.

The seven sources described below each address one of those structural
gaps. None of them is redundant. None of them, alone, would be enough.

---

## Part 1 — The Five Kinds of Information the App Needs

Before walking through the sources individually, it helps to lay out
the categories of data the app composes for every part it shows.

**Parametric data** — the part's technical fingerprint. Capacitance,
voltage rating, package size, tolerance, temperature range. The
canonical attribute schema described in the data-mapping explainer
lives here. This is what the matching engine compares.

**Commercial data** — price, stock, distributor identity, minimum order
quantity, lead time. What the part costs and where you can buy it.
Refreshes hourly to daily. Critical for purchasing decisions but
useless for matching.

**Lifecycle and risk data** — the part's health from the manufacturer's
perspective. Active, Not Recommended for New Designs (NRND), Last-Time
Buy, Discontinued, Obsolete. Plus modern multi-factor risk scores
covering supply, design, and long-term availability. Critical for
deciding whether to design a part *in*, not just whether you can buy
one today.

**Cross-reference data** — explicit "this is equivalent to that"
mappings published by an authoritative source. Industry-curated
functional equivalents, manufacturer-published successors on EOL parts,
or manufacturer-documented drop-in alternatives. These are categorically
different from engine-scored matches: a human (or institutional)
authority has already certified the relationship.

**Manufacturer profile data** — company-level context. Where they're
headquartered, what kinds of parts they're known for, what their
quality certifications are, what their stock-listing is, who their
contacts are. Doesn't affect matching directly, but informs engineering
judgment when picking between candidates.

No source covers all five well. Most cover one or two. Several cover
the same one or two but with different strengths and weaknesses. The
app composes a complete picture from the union.

---

## Part 2 — The Western/Chinese Structural Split

The second structural reason for multiple sources is geographic, and
it's worth treating separately.

**The Western ecosystem** is built around a small number of large
distributors — Digikey, Mouser, Arrow, RS Components, Farnell — who
publish stable, structured APIs covering millions of parts from
thousands of manufacturers. Parameter names are standardized. Categories
are stable. Data is in English. Most parts are findable by part number
across multiple distributors.

**The Chinese ecosystem** is built differently. The major Chinese
component manufacturers — Gigadevice, 3PEAK, Will Semi, Silan, ISSI,
ISC, and dozens of others — sell primarily into Asian supply chains,
and their parts are stocked by Chinese distributors (LCSC, Winsource,
and similar) rather than Western ones. Their datasheets publish
parameter names in Chinese and English, with vendor-specific
terminology and inconsistent formatting. There is no Digikey-equivalent
single feed that covers the Chinese catalog cleanly.

This split matters because the data-source strategy *has* to look
different on either side of it. The Western side can be served by
licensed feeds; the Chinese side has to be assembled, curated, and
maintained in-house. The same is true for purchase-path data: Western
distributor APIs cover the Western catalog well but rarely list Chinese
distributors, so a separate channel is needed to surface LCSC or
Winsource inventory.

Four of the seven sources described below address the Western catalog.
Three address the Chinese catalog or fill specific gaps the Western
sources leave open.

---

## Part 3 — The Seven Sources

Each source below is described in the same shape: what it is, what it
provides, what its coverage looks like, what format the data arrives
in, and what role it plays in the app.

---

### Digikey — The Western Parametric Spine

**What it is.** A major Western component distributor whose Product
Information API provides structured access to its full catalog.

**What it provides.** Parametric data (every attribute in the
distributor's catalog), categorical data (a multi-level category tree
that the app uses as its own taxonomy), commercial data (price breaks
and stock), and basic lifecycle status.

**Coverage.** Roughly two million parts across all the major
electronics categories. The app's 43 component families correspond
to Digikey's leaf categories.

**Format.** Live OAuth2 API. Parameter names are English and
standardized. Categories are stable. Data quality is high.

**Role in the app.** The primary parametric source for every Western
part. The taxonomy authority — the app's category tree literally
mirrors Digikey's. The candidate-search engine for cross-references.
The conflict-winner when the merge pipeline composes attributes from
multiple sources.

**Why it's first.** Digikey's parametric coverage is the most complete
of any single feed the team has tested, its category structure is the
most stable, and its API is the most reliable. Other sources are layered
on top to fill gaps; Digikey is the spine.

---

### Atlas — The Chinese Curated Dataset

**What it is.** A custom in-house dataset of Chinese component
manufacturers, assembled by the team and stored in the app's own
Supabase database.

**What it provides.** Parametric data for Chinese parts (translated
into the canonical schema), manufacturer profiles (descriptions, logos,
HQ locations, certifications, contacts), and the linkage between
Chinese MPNs and the team's matching engine.

**Coverage.** Approximately 115 manufacturers and 55,000 products,
growing through ongoing ingestion. Around 38,000 of those products are
"scorable" — they have enough mapped parametric data for the matching
engine to evaluate. Roughly 300 manufacturers are profiled with rich
business-level information.

**Format.** Raw input is JSON dumps shipped per-manufacturer, with
parameter names in Chinese and English, vendor-specific terminology,
and inconsistent formatting. The ingestion pipeline (described in the
ingestion explainer) translates everything into the canonical schema.

**Role in the app.** The only path through which Chinese
manufacturers' parts become matching-engine candidates. Without Atlas,
queries like "find me a Chinese alternative to this op-amp" would
return nothing.

**Why it exists at all.** Chinese manufacturers aren't in Western
distributor APIs. Building the dataset in-house was the only way to
make the catalog searchable inside the same matching engine that
handles Western parts. The translation and curation machinery — the
biggest single investment in the codebase — exists to keep this
dataset clean as it grows.

---

### Parts.io (Accuris) — Industry Cross-References and Datasheet Specs

**What it is.** A licensed feed from Accuris (the commercial entity
that operates Parts.io) providing two distinct kinds of data the other
sources don't cover well.

**What it provides.** First, parametric data extracted from manufacturer
datasheets — including specs that Digikey's catalog doesn't carry
because Digikey only indexes what's in the distributor's parametric
filters. Things like thyristor turn-off time, relay coil dissipation,
fuse I²t energy, op-amp common-mode voltage range. Second, industry-
curated cross-references — explicit Form-Fit-Function and functional
equivalence mappings between parts. This is Accuris's historical
business: maintaining the "this is a drop-in for that" relationships
that engineers have always consulted in industry directories.

**Coverage.** Seventeen component classes mapping to 39 of the app's 43
L3 families. Datasheet-extracted parametrics for tens of millions of
parts.

**Format.** Structured API. English. Field names differ from Digikey's,
so the app maintains its own translation map.

**Role in the app.** Two roles, both important. Gap-fill enrichment
during the attribute-fetch phase — fills the datasheet-only specs that
Digikey is missing. Certified-cross candidates during the recommendation
phase — Accuris-published functional equivalents enter the top
recommendation bucket ("Accuris Certified") ahead of any engine-scored
candidate.

**Why it's distinct from Digikey.** Distributor APIs publish what they
sell. Industry data aggregators like Accuris publish what manufacturers
*specified*. The two cover overlapping but non-identical territories;
Accuris fills the gap.

---

### FindChips — Multi-Distributor Commercial Intelligence

**What it is.** A commercial-data aggregator that returns pricing,
stock, lifecycle, risk, and compliance data from roughly 80
distributors in a single API call.

**What it provides.** Per-distributor pricing tiers, real-time stock
levels, manufacturer lifecycle status, multi-factor risk scores (design
risk, supply risk, long-term availability), and regulatory compliance
flags (RoHS, REACH, conflict minerals).

**Coverage.** All major distributors carrying any given part. For a
typical Western part, FindChips returns quotes from 10 to 30
distributors with stock and pricing.

**Format.** Live structured API. Deferred enrichment in the app
(described in the search-flow explainer) keeps response time fast: the
matching engine returns recommendations first, then FindChips data
populates the cards in the background as it arrives.

**Role in the app.** The commercial-intelligence backbone. Powers the
Commercial tab on every part page, the price-break tables on every
recommendation card, the lifecycle and risk chips, and the supplier
ranking that drives "best price" sorting. Also the data source for
the lifecycle and stock axes in the replacement-preferences scoring
described in the logic-layer explainer.

**Why a single API replaced per-distributor integrations.** A previous
version of the app integrated Mouser directly for commercial data, then
talked about adding Arrow, Avnet, RS, and others. One per-distributor
integration replicates the same code structure for each new
distributor. FindChips eliminated that work by exposing all of them
through one feed.

---

### OEMS — Independent Distributor Channel

**What it is.** The same FindChips API, but queried with a parameter
that surfaces a different inventory pool: independent distributors
(typically not authorized by the manufacturer) and brokers, plus the
Chinese distributors that don't appear in the standard FindChips feed.

**What it provides.** Pricing and stock from sources that the
authorized-distributor feed misses — LCSC, Winsource, and other Chinese
distributors carrying Atlas parts; brokers holding inventory of obsolete
parts that authorized distributors no longer stock.

**Coverage.** Conditional. Only queried when there's a specific reason
to expect it'll add value.

**Format.** Same structure as FindChips. Results merge with the
standard FindChips response, with FindChips winning duplicates by
distributor name.

**Role in the app.** Three conditional triggers fire OEMS queries:
when the part is Chinese-manufactured (Atlas-sourced or
Chinese-origin), it runs in parallel with the standard FindChips
query; when the standard FindChips query returns no distributors at
all, it runs as a fallback; and when FindChips reports the part as
obsolete or end-of-life, it runs to find broker inventory.

**Why it exists separately.** Chinese distributors and brokers are
legitimate purchase paths but they carry different risk profiles than
authorized Western distributors. Surfacing them only when there's a
clear reason avoids polluting the Commercial tab on every search with
broker quotes.

---

### Mouser — End-of-Life Successor Safety Net

**What it is.** A major Western distributor. Used to play a much
broader role in the app and was largely deprecated when FindChips
replaced per-distributor integrations. One narrow capability survived.

**What it provides.** Manufacturer-published successor part numbers on
end-of-life parts. When a manufacturer issues a Product Change
Notification announcing that part X is being discontinued and
recommending part Y as the replacement, Mouser's API surfaces that Y
in a field called `SuggestedReplacement`.

**Coverage.** Only parts that the manufacturer has formally EOLed
*and* published a successor for. A small but high-value subset.

**Format.** Structured API. The field is sparse — most parts don't have
a suggested replacement — but when it's populated, it's authoritative.

**Role in the app.** During the recommendation pipeline, when a source
part is EOLed, Mouser is queried for its `SuggestedReplacement`. Any
returned successor MPNs enter the "Manufacturer Certified" recommendation
bucket alongside the team's curated cross-references.

**Why it's not in the search pipeline.** Mouser is a Western
distributor. For search and parametric data, Digikey is more complete
and FindChips is more efficient. Mouser added latency and duplicated
coverage. The `SuggestedReplacement` data, though, isn't reliably
available from the other APIs the team has tested. So Mouser stays in
the pipeline solely for that one job.

---

### Team-Curated Manufacturer Cross-References

**What it is.** A database table of explicit cross-reference mappings,
populated by the team through the admin UI. Manufacturers (and the
team's own engineers) publish documentation listing equivalent parts —
typically when a manufacturer wants to position one of its parts as a
drop-in replacement for a competitor's part. The admin UI accepts
Excel/CSV uploads with flexible column mapping and stores the mappings
in `manufacturer_cross_references`.

**What it provides.** High-trust, human-curated cross-reference
relationships — including pin-to-pin equivalents (which are stronger
than functional equivalents) and bidirectional matches.

**Coverage.** Depends on team curation. Grows as new manufacturer
cross-reference documents are uploaded.

**Format.** Structured table with origin MPN, target MPN, equivalence
type, and source documentation. Lookup normalizes packaging suffixes
(`-TR`, `-REEL`, `/R7`, etc.) so distributor-format MPNs match
manufacturer-format MPNs.

**Role in the app.** Recommendation candidates from this table land in
the "Manufacturer Certified" bucket — second only to Accuris Certified
in the sort order. They also get the certified-cross bypass, which
exempts them from the engine's post-scoring blocking filters on the
principle that an explicit human certification outranks an inferred
rule.

**Why it's separate from Accuris.** Accuris's industry-curated
cross-references and the team's manufacturer-uploaded cross-references
are different data sources with different authorities. The team's
table captures relationships that Accuris hasn't indexed — particularly
between Chinese manufacturers (which Accuris doesn't cover well) and
their Western equivalents.

---

## Part 4 — How They Compose

Three layers of merge logic, each addressing a different category of
data, compose the seven sources into one coherent view per part.

**Parametric data** is merged with Digikey as the always-win baseline,
with Parts.io filling in datasheet-only attributes Digikey doesn't
publish, and with Atlas providing the entire baseline for Chinese
parts that Digikey doesn't carry. Provenance tags on every value
identify which source it came from. Conflicts are resolved by source
priority, never overwritten.

**Commercial data** comes from FindChips, with OEMS providing
supplemental quotes when triggered. No conflicts here — the two sources
return different distributors, and duplicates are resolved by
distributor name.

**Cross-reference data** is composed from four sources into three
display buckets. Accuris's FFF and functional equivalents become
"Accuris Certified." The team's curated manufacturer cross-references
and Mouser's `SuggestedReplacement` MPNs become "Manufacturer
Certified." Engine-scored matches from Digikey or Atlas candidates
become "Logic Driven." The certified buckets always sort above the
logic-driven bucket.

The user never sees this composition explicitly. They see one Commercial
tab with all available pricing, one parametric table with all
available attributes (each tagged with its source), and one ranked
recommendation list. The complexity of seven sources collapses into one
view, with the trade-offs resolved by the merge rules described above
and in more detail in the search-flow and logic-layer explainers.

---

## Part 5 — A Compact Comparison

| Source | Primary data | Geography | Role | Why it's irreplaceable |
| --- | --- | --- | --- | --- |
| **Digikey** | Parametric, taxonomy, basic commercial | Western | Parametric spine + candidate search | Most complete Western parametric coverage; sets the taxonomy |
| **Atlas** | Parametric (Chinese), MFR profiles | Chinese | Only path for Chinese parts | Chinese MFRs aren't in any Western feed |
| **Parts.io** | Datasheet-only specs, FFF/functional crosses | Western (mostly) | Gap-fill + Accuris Certified bucket | Carries specs distributor APIs don't publish |
| **FindChips** | Pricing, stock, lifecycle, risk | All | Commercial backbone | ~80 distributors in one call |
| **OEMS** | Pricing/stock from indie + Chinese distributors | All (conditional) | Independent / fallback channel | Only path to LCSC, Winsource, broker stock |
| **Mouser** | EOL successor MPNs | Western | Manufacturer Certified (EOL only) | Only API that reliably exposes successor MPNs |
| **Team-curated crosses** | Explicit equivalence mappings | All | Manufacturer Certified bucket | Captures relationships no API indexes |

---

## Closing — Three Principles That Explain the Architecture

**No single feed covers every kind of data engineers need to make
component decisions.** Parametric, commercial, lifecycle, cross-reference,
and profile data are five different categories living in five different
places. Picking one feed and stopping would mean missing entire
dimensions of the answer.

**The Western and Chinese component ecosystems are structurally
different and have to be served by different machinery.** Western parts
come from licensed distributor APIs. Chinese parts come from a
hand-curated dataset the team maintains. The translation, classification,
and merging work that bridges the two is the largest single investment
in the app.

**Every source is in the pipeline for a specific reason.** None of them
is redundant. Digikey is the parametric spine because it's the most
complete; Atlas is the only path to Chinese parts; Parts.io fills
datasheet gaps and surfaces industry-certified crosses; FindChips
collapses 80 distributors into one feed; OEMS adds the independent
channel; Mouser stays in for one narrow job that no other API does as
well; the team's curated cross-references capture relationships no
external feed indexes. Each one earned its slot. None of them got it
by being convenient.
