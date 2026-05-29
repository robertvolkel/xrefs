# How XRefs Represents Components

*An explainer for the canonical attribute schema, the taxonomy that
organizes it, the per-source maps that feed it, and the dictionaries and
aliases that keep translation honest.*

---

## The Polyglot Problem This Schema Solves

A single component — say, a 10 kΩ ±1% 0805 thick-film chip resistor — has
more than a dozen valid representations once you cross sources.

Digikey labels its resistance parameter "Resistance" and reports its
tolerance as "1 %". Parts.io calls the same fields "Resistance (Nominal)"
and "Tolerance, (URT)". Atlas may receive that part from a Chinese
manufacturer with the parameter names written as "电阻值" and "精度",
and with the resistance unit encoded as "10K" in the value string rather
than as a separate unit field. A datasheet might call the same dielectric
"C0G" on one page and "NP0" on another. A MOSFET's drain-source on
resistance might appear as "Rds(on)", "R_DS_ON", or "On-Resistance"
depending on who's publishing it.

For the matching engine to score one component against another, the
system has to treat all of these representations as the same thing. That
requires one canonical reference schema — owned by the engineering team,
shared across every data source — and a set of translation layers that
bridge each source to it.

This explainer covers the canonical schema, the taxonomy that organizes
it, the per-source maps that translate into it, and the two distinct
mechanisms (dictionaries and aliases) that handle name versus value
translation.

---

## Part 1 — The Taxonomy

### The Guiding Principle

**Lean on a taxonomy the industry already uses.** Rather than invent a
component classification from scratch, the app borrows Digikey's
category structure verbatim. Digikey publishes the most widely-used
parametric category tree in the electronics distribution industry, and
their leaf-category names are stable enough to anchor a long-lived
schema against.

### The Three Levels

Components are organized in a three-level hierarchy:

- **Category (L1)** — the broadest grouping. About twenty top-level
  buckets like "Passives," "Discrete Semiconductors," "Voltage
  Regulators," "Logic ICs."
- **Subcategory (L2)** — a Digikey leaf-category string. "MLCC," "Single
  FETs, MOSFETs," "Voltage Regulators - Linear, Low Drop Out (LDO),"
  "Power Relays, Over 2 Amps." These strings come directly from
  Digikey's API.
- **Family ID (L3)** — a short identifier the app uses internally.
  Numeric for passives (12 for MLCC capacitors, 52 for chip resistors,
  71 for power inductors) and alphanumeric for everything else (B5 for
  MOSFETs, C1 for LDOs, D1 for crystals, F2 for solid-state relays).
  Forty-three families in all.

A classifier module (`familyClassifier.ts`) maps a Digikey subcategory
string to a family ID by direct lookup against a curated table. The
table is verified against Digikey's live API periodically — most
recently in March 2026 — and updated when Digikey adds or renames a
category.

### Why L2 and L3 Behave Differently

Not all subcategories deserve the same engineering investment.

**The 43 L3 families** have full logic tables — that is, a structured
list of matching rules that the cross-reference engine uses to score
candidate replacements. These are the families the team has done deep
engineering work on: MLCC capacitors, chip resistors, MOSFETs, BJTs,
IGBTs, op-amps, LDOs, switching regulators, gate drivers, optocouplers,
and so on. A part classified into an L3 family can be cross-referenced.

**The 14 L2 categories** — Microcontrollers, Processors, Memory,
Sensors, RF and Wireless, LEDs, Power Supplies, Transformers, Switches,
Cables, Filters, Audio, Motors, Development Tools — have *curated
parameter maps* but no logic tables. The app knows how to display their
parametric data with clean column headers and sensible sort orders, but
it doesn't try to cross-reference them. These families are too
heterogeneous, too application-specific, or too dependent on firmware
compatibility for rule-based matching to be useful.

The distinction is hard in code: L2 families have a `familyId` of null
where L3 families have an ID. The matching engine refuses to run on a
part with no L3 family.

### Variant Families

A few L3 families are "variants" of a base family: B2 Schottky diodes,
B3 Zener diodes, and B4 TVS diodes are all derived from B1 Rectifier
Diodes, and the classifier detects them by reading the part's
description and parameter values rather than from Digikey's category
string. This keeps the taxonomy aligned with how engineers think about
parts (a Schottky diode is meaningfully different from a rectifier
diode) without requiring Digikey to expose every distinction as a
separate category.

---

## Part 2 — The Canonical Attribute Schema

### The Guiding Principle

**The set of matching rules for a family is its canonical schema.**

There's no separate document somewhere listing "the attributes that
matter for MOSFETs." The MOSFET logic table is that document. Every
attribute the engine cares about appears as a rule. Every rule names a
canonical attribute and explains how to compare two parts on it. To
look up the canonical schema for a family, read the logic table.

### What a Rule Contains

Each rule in a logic table is a structured object. The important fields:

- **`attributeId`** — the canonical name, lowercase with underscores
  (`channel_type`, `rds_on`, `breakdown_voltage`). This is the
  identifier every other layer of the system uses to refer to this
  attribute. Per-source maps, value aliases, admin overrides, the
  matching engine, the comparison view — they all key on this string.
- **`attributeName`** — the human-readable display label
  ("Channel Type (N-Channel / P-Channel)"). Used in the UI; not used
  for keying anything.
- **`logicType`** — one of nine comparison modes (described below).
  Tells the engine *how* to compare values, not just whether they
  match.
- **`weight`** — an integer from 0 to 10 capturing how important this
  attribute is for substitution. Higher weight contributes more to the
  match percentage.
- **`engineeringReason`** — prose explaining why this rule exists and
  why its weight is what it is. This is the field that captures the
  authoring engineer's judgment.
- **`blockOnMissing`** (optional) — when true, missing data on a
  threshold rule becomes a hard fail rather than a soft "review" flag.
  Used for safety-critical attributes like voltage rating.
- **`tolerancePercent`** (optional) — for identity rules that allow a
  small numeric tolerance band (a 100 µF capacitor is interchangeable
  with a 102 µF capacitor for most purposes).
- **`thresholdDirection`** (optional) — for threshold rules: `gte`
  (replacement must be at least the source), `lte` (replacement must be
  at most the source), or `range_superset` (replacement's range must
  contain the source's range).
- **`upgradeHierarchy`** (optional) — for identity_upgrade rules: an
  ordered array of values, best-to-worst. The dielectric hierarchy
  `['C0G', 'X7R', 'X5R']` means a C0G part can substitute for an X7R
  part but not the reverse.
- **`valueAliases`** (optional) — per-rule synonym groups (see Part 5).

### The Nine Logic Types

Each rule's `logicType` tells the engine how to compare values:

- **`identity`** — exact match required. Strings compared after
  normalization; numbers compared with a small tolerance for floating
  point.
- **`identity_range`** — both parts' values are ranges; ranges must
  overlap.
- **`identity_upgrade`** — match or better per a fixed hierarchy.
- **`identity_flag`** — boolean. If the source requires it, the
  replacement must also have it.
- **`threshold`** — numeric comparison with direction (`gte`, `lte`,
  `range_superset`).
- **`fit`** — a physical constraint (replacement must be no larger than
  the source in some dimension).
- **`vref_check`** — a cross-attribute calculation for switching
  regulators.
- **`application_review`** — flagged for human review; cannot be
  automated.
- **`operational`** — non-electrical context (packaging type, etc.).

The same canonical attribute could in principle take different logic
types in different families, but in practice most attributes have a
natural comparison mode and use it consistently.

### How the Schema Got Written

The 43 logic tables are co-authored by hardware engineers and AI, but
the boundary is sharp:

**Engineers own the schema.** Each family started as a Word document in
`docs/` (31 files, one per base family) written by an engineer with
deep domain knowledge. Those documents specify which attributes matter,
why, what their weights should be, and how they should compare. The
TypeScript logic tables are direct encodings of those documents. The
`engineeringReason` field carries the engineer's prose justification
into the code so it travels with the rule.

**AI augments at the edges.** Atlas products get LLM-extracted attributes
from prose descriptions when structured parameters are missing. The AI
dictionary triage suggests how to map new parameter names. The AI
investigator proposes new canonical attributes when engineers are
unsure. But every AI suggestion goes through an engineer approval step
before it modifies the schema. The schema itself is human-owned. AI
proposes; engineers commit.

---

## Part 3 — Source-to-Canonical Mapping

### The Guiding Principle

**Every source speaks its own dialect. The canonical schema is the
shared language.**

Digikey, Parts.io, and Atlas each name the same attributes differently.
Each has its own parameter map module that translates source-specific
field names into canonical attribute IDs. The maps all point in the
same direction — into the canonical schema — but each one's keys come
from its source.

### One Shape, Three Vocabularies

All three source maps use the same value shape:

    { attributeId, attributeName, unit?, sortOrder }

But their *keys* differ:

- **Digikey** (`digikeyParamMap.ts`) keys on the Digikey "ParameterText"
  string. So `"Capacitance"` maps to `{ attributeId: "capacitance", ... }`
  and `"Voltage - Rated"` maps to `{ attributeId: "voltage_rated", ... }`.
  The map is organized by Digikey category, since the same parameter
  name can mean slightly different things in different categories.
- **Parts.io** (`partsioParamMap.ts`) keys on Parts.io field names like
  `"Rated (DC) Voltage (URdc)"` and `"Resistance (Nominal)"`. The map
  is organized into 17 Parts.io class names (Capacitors, Resistors,
  Diodes, Transistors, etc.) that correspond loosely to Digikey
  categories.
- **Atlas** (`atlasMapper.ts`) keys on the Chinese and English parameter
  names that show up in manufacturer JSON dumps. So `"击穿电压"` and
  `"Breakdown Voltage"` both map to the same canonical
  `breakdown_voltage`. Atlas has 28 L3 family dictionaries plus 14 L2
  category dictionaries, and each one is bilingual by design.

The point: regardless of which source brought the data in, once the
mapping runs, the parameter lives in the system under a canonical
attribute ID. From there on, no downstream layer cares where the data
came from. The matching engine, the comparison view, the parts-list
column system, the cross-reference scoring — all of them operate on
canonical IDs.

### Where the Reverse Direction Comes In

The maps are also useful in reverse. The admin "Param Mappings" panel
displays them as a coverage matrix — for each canonical attribute, which
sources have a mapping for it? — so engineers can see at a glance which
attributes are well-covered and which depend on a single source.

This is what surfaces gap-fill opportunities. If Digikey doesn't
publish thyristor turn-off time (`tq`) but Parts.io does, the admin
panel shows that explicitly, and the team knows that a Digikey-only
part will be missing that attribute until Parts.io enrichment runs.

---

## Part 4 — Composite Enrichment

### The Guiding Principle

**No single source covers every attribute. Merge them in a fixed
precedence so the result is unambiguous.**

Even Digikey, the most complete source, is missing a lot of
datasheet-only specifications. Parts.io has them but is missing pricing
detail. FindChips covers pricing across eighty distributors but doesn't
do parametrics. The composite attribute set the system actually uses
for matching draws from all three.

### How the Merge Works

When a part is fetched, the pipeline runs three operations in parallel:

- **Digikey** returns the canonical parametric snapshot.
- **Parts.io** runs gap-fill: it pulls its full parametric record but
  only keeps attributes Digikey didn't already populate. Digikey's
  values always win on overlap.
- **FindChips** returns commercial fields — supplier quotes, stock
  levels, lifecycle status, regulatory compliance.

The merge logic is deliberately simple. Parts.io and FindChips touch
disjoint fields. Parts.io only writes to parametric attributes that are
missing; FindChips only writes to commercial fields. There's no
conflict-resolution heuristic, no tie-breaking — the layers fill
different slots.

When Digikey isn't available — for an Atlas-sourced Chinese part, say —
the same pattern runs with a different lead. Atlas becomes the
baseline, parts.io still gap-fills parametrics, FindChips still adds
commercial. The principle holds: a fixed precedence, gap-fill from the
others, no conflicts.

### Provenance Stays With Every Value

Each attribute value carries a `source` tag identifying which pipeline
populated it — `digikey`, `partsio`, `atlas`, or `mpn_enrichment` (for
LLM-extracted values). The provenance tag is what makes the ingestion
pipeline non-destructive: a re-ingest of Atlas data only overwrites
values originally sourced from Atlas. LLM-extracted attributes and
parts.io gap-fills survive.

### Why the Result Is Richer Than Any Single Source

For a typical Western part, Digikey covers about 50–65 percent of the
attributes the matching engine cares about for that family. Parts.io
gap-fill typically adds 10–25 percentage points. The composite set is
substantially more complete than any single feed. That's the point —
engineers picked the canonical schema based on what *matters* for
matching, not based on what any one source happens to publish, and the
enrichment layer is what closes the gap.

---

## Part 5 — Two Translation Mechanisms

There are two distinct translation problems the system solves, and it
solves them in two completely separate ways. Conflating them is the
most common source of confusion when reasoning about how data flows
through the app.

### Dictionaries — Name Translation

**Problem:** The same attribute is called different things by different
sources. Chinese `击穿电压`, English `Breakdown Voltage`, internal
`breakdown_voltage`.

**Solution:** A dictionary maps a source-side parameter NAME to a
canonical attribute ID. Dictionaries live in source-specific modules —
the Digikey, parts.io, and Atlas param-map files described in Part 3.
Atlas additionally has a database-backed override table
(`atlas_dictionary_overrides`) that engineers populate from the triage
UI to add new translations as Chinese manufacturers introduce new
terminology.

**When it runs:** At ingest time, when raw source data is converted into
the canonical schema. For Atlas, dictionaries are also re-applied at
read time so that overrides added after ingest take effect immediately
on existing rows.

**Scope:** One translation entry per (source dialect, canonical
attribute) pair. Per source.

### Value Aliases — Value Equivalence

**Problem:** Even when two sources agree on the parameter *name*, they
might use different *values* to mean the same thing. `C0G` and `NP0`
are the same dielectric. `Polar` and `Polarized` are the same property.
`Bi-Polar` and `Bipolar` describe the same op-amp input stage.

**Solution:** Each logic-table rule can carry a `valueAliases` array of
synonym groups. When the engine compares the source's value to a
candidate's value and the strict comparison fails, it checks whether
both values fall into the same synonym group. If they do, the rule
passes.

**When it runs:** At match time, every time a rule fires. Not at
ingest. The original values stay in the database as they were; the
equivalence is applied during scoring.

**Scope:** One alias group per rule. A rule in the MLCC family that
treats `C0G` and `NP0` as equivalent dielectrics says nothing about
how a rule in some other family should treat the strings `C0G` or
`NP0` (they probably mean something different there, if anything).

### Why the Two Mechanisms Are Both Necessary

A dictionary cannot solve a value-equivalence problem. If two sources
disagree on whether to write "C0G" or "NP0," a dictionary entry
mapping `Dielectric` → `dielectric` does nothing — both sources are
*already* using the same parameter name, just different values.

Conversely, a value alias cannot solve a name-translation problem. A
value alias group saying `[C0G, NP0]` are equivalent does nothing if
the parameter itself is named `Dielectric Material` in one source and
`电介质材料` in another.

The two mechanisms operate at orthogonal points in the pipeline and on
orthogonal layers of the data. Both are necessary because the data is
messy on both axes — names and values both vary across sources.

Engineers add value aliases through an inline "propose alias" button on
the comparison view. When they're reviewing a flagged mismatch and
realize the two values mean the same thing, two clicks add the alias
to the rule. Every future comparison silently benefits.

---

## Closing — Four Principles That Hold the Whole Picture Together

**One canonical schema per family — owned by engineers.** Forty-three
logic tables, each encoding what matters and why. The `attributeId`
field is the single identifier that flows through every other layer.

**Many source dialects — translated into the canonical.** Per-source
parameter maps bridge each external feed into the same schema, so the
matching engine never has to know where a value came from. Just what it
means.

**Composite enrichment with a fixed precedence.** Digikey is the
baseline. Parts.io gap-fills parametrics. FindChips adds commercial
data. Provenance is preserved on every value so the merge stays
non-destructive across re-ingests.

**Names and values are translated separately.** Dictionaries handle
name variation at ingest time and at read time. Value aliases handle
value variation at match time. Both are needed because source data
varies on both axes, and conflating them produces translation logic
that's both too coarse to be right and too fragile to maintain.

The cumulative effect: an engineer can look at any cross-reference in
the system and trace it back to a deterministic set of canonical
attribute comparisons, with the underlying source data clearly tagged,
with the translation layers visible, and with every engineering
judgment about what mattered captured in code as `engineeringReason`
prose next to the rule it justifies.
