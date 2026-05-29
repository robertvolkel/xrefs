# How XRefs Ingests Data and Learns Over Time

*An explainer for the principles behind the Atlas pipeline.*

---

## The Problem This Machinery Solves

XRefs is a cross-reference engine for electronic components. A user types in a
part number (or uploads a list of part numbers, called a BOM — Bill of
Materials), and the engine returns scored replacement parts that should work
in place of the original.

Most of the world's parts come from Western distributors (Digikey, Mouser,
Arrow). Their data is clean, English-language, and uses standardized
parameter names. That part is the easy half.

The hard half is **Atlas**: a dataset of roughly 115 Chinese component
manufacturers and around 55,000 of their products. Western distributors
don't carry these parts, so without Atlas an engineer searching for a
cost-down or geopolitically-resilient alternative would never see them.

Atlas data is messy by nature. Each manufacturer publishes their catalog as
their own JSON file, with parameter names written in Chinese, English, or
both. The names are non-standard ("击穿电压" / "BVceo" / "V(BR)CEO" all refer
to the same spec on a transistor). Units drift. Families are mislabeled.
Some manufacturers even publish placeholder MPNs that don't resolve to
buyable parts.

For the matching engine to score an Atlas part against a Western source
part, every one of those messy parameters has to be translated into the
same canonical attribute schema that the matching logic uses. That is a
curation problem with no end. Engineers find new edge cases every day.

The machinery described in this document is how the app keeps up: a staged
ingestion pipeline that never touches production data without review, and
a set of feedback loops that turn every engineer correction into durable,
compounding leverage.

---

## Part 1 — How New Data Comes In

### The Guiding Principle

**Stage everything before applying anything.**

Nothing a manufacturer ships ever writes directly to the production product
table (`atlas_products`). Every file is parsed, validated, classified, and
diffed against current state — and the result is shown to an engineer as a
preview. Only when an engineer approves the preview does anything change.

This is the difference between "ingestion as event" and "ingestion as
proposal." The XRefs pipeline treats every new file as a proposal.

---

### Stage 1: File Drop and Manufacturer Registration

Engineers drag and drop one or more JSON files into the ingest panel in
the admin UI. Filenames follow the pattern
`mfr_{id}_{english_name}_{chinese_name}_params.json`.

The upload endpoint parses the filename to extract the manufacturer ID,
saves the file to `data/atlas/`, and checks whether the manufacturer
already exists in the canonical manufacturer table (`atlas_manufacturers`).
If it doesn't, the UI flags it as a new manufacturer and asks for explicit
confirmation before going any further.

The principle here: a new manufacturer is a structurally bigger event than
a refresh of an existing one. It deserves its own confirmation step rather
than being swept up in a batch action.

### Stage 2: Report Generation (The Preview)

Once files are staged, the engineer clicks "Generate Report." The upload
endpoint spawns a background script (`scripts/atlas-ingest.mjs --report`)
that runs the full mapping pipeline for each file without writing anything
to the product table.

For each product in the file the script:

- Translates parameter names from Chinese/English into the canonical
  attribute IDs used by the matching engine, using per-manufacturer
  parameter dictionaries.
- Classifies the product into a category and family (for example,
  Discrete Semiconductors → MOSFETs → B5) using a three-tier classifier
  that reads vendor-provided category strings.
- Runs an MPN-quality validator that detects un-buyable placeholder
  patterns (range expressions, "X series" sentinels, trailing-x
  wildcards).
- Re-checks the family choice against parameter-name signatures (more on
  these in Part 2). If a TVS-diode parameter shows up under a "rectifier"
  family, the classifier corrects it.

The script then fetches the manufacturer's current product rows from the
database, computes a per-MPN diff (inserts, updates, deletes), and writes
exactly one row per manufacturer into the `atlas_ingest_batches` table.
That row holds the full structured report as a JSONB document
(JSONB = a structured JSON value stored natively in Postgres, queryable
field by field), with `status='pending'`.

At this point an engineer can see exactly what *would* happen if the file
were applied, without anything actually having happened.

### Stage 3: Risk Classification

Every pending batch gets one of three risk labels, computed automatically
from the diff:

- **clean** — the file only adds new products, no existing parameter
  values change, and every parameter name maps cleanly. Safe to apply
  in bulk.
- **review** — the file deletes existing products, or shifts some of them
  to a different family. A human needs to confirm those products are
  genuinely obsolete rather than accidentally dropped.
- **attention** — the file contains parameter names the dictionary
  doesn't know how to translate yet, or it changes the value of an
  existing parameter. The first is a dictionary gap; the second might be
  a real spec update or might be a unit error.

The principle: risk is a *triage signal*, not a gate. Engineers can still
apply an `attention` batch — but they should look at the unmapped-parameter
list first.

### Stage 4: Engineer Review

The admin UI renders one card per pending batch with the risk chip, the
product counts (insert / update / delete), and an expandable list of
unmapped parameters. Each card has buttons to:

- **Proceed** — apply this batch now.
- **Discard** — throw the batch away without applying it.
- **Regenerate** — re-run the report (useful after adding dictionary
  overrides).
- **Proceed All Clean** — a global button that bulk-applies every
  `clean`-risk batch in one click.

This is also where the AI dictionary-triage workflow lives, but that's a
Part 2 topic.

### Stage 5: Approval With Provenance-Preserving Merge

When an engineer hits Proceed, the pipeline does two important things in
order:

**First, snapshot.** Before any change, every affected row in
`atlas_products` is copied into `atlas_products_snapshots`, tagged with
the batch ID. This is what makes the next step reversible.

**Second, merge with provenance.** Every parameter value stored in the
product row carries a small wrapper indicating where it came from:

    { value: "...", source: "atlas" | "extraction" | "manual", ingested_at: "..." }

When new data comes in, only values tagged `source: "atlas"` get
overwritten. Values added by the LLM description extractor (`extraction`)
or manually edited by an engineer (`manual`) survive untouched.

The same principle applies to deletion. If the new file omits a product
the database already has, the pipeline checks the row's surviving values:

- All values atlas-sourced → hard delete. There's nothing to preserve.
- Any value extraction- or manual-sourced → soft delete. The row stays in
  the database with `status='discontinued'`, preserving the engineer or
  LLM work.

The principle here is that **the pipeline is non-destructive by default**.
A re-ingest a year from now never wipes out the curation work the team has
done in the meantime.

### Stage 6: The 30-Day Revert Window

Snapshots live for 30 days. If a batch turns out to have been bad, an
engineer can revert it in one click — the snapshot rows are written back
to `atlas_products` and the batch is marked `reverted`. After 30 days the
snapshots are garbage-collected.

The principle: fail-safe experimentation. Engineers don't need to ask
permission to try something they can quickly undo. The 30-day ceiling
keeps storage from growing without bound.

---

## Part 2 — How the System Gets Smarter

### The Guiding Principle

**Every engineer correction becomes durable leverage.**

A single accepted translation rule can reclassify thousands of existing
products and prevent hundreds of future ones from being mistranslated. The
job of this layer is to make sure no correction is one-shot — every one
gets captured, generalized, and re-applied wherever it's relevant, both
backward (to existing data) and forward (to the next ingest).

There are seven feedback loops. Each follows the same template: a trigger
event produces a stored signal, which is then applied at a defined time by
a defined process.

---

### Loop 1: Dictionary Overrides

The most common correction. An engineer in the triage queue sees an
unmapped parameter — say, the Chinese string "击穿电压" — and accepts a
mapping to the canonical attribute `breakdown_voltage`.

That mapping is written to the `atlas_dictionary_overrides` table.

The override is then consulted at two different times:

- **At ingest time** — the next `Generate Report` run loads all active
  overrides and patches the per-family parameter dictionary before
  mapping. So new products get the translation baked in permanently.
- **At read time** — when the app fetches an existing product row to
  display it, the parameter renderer (`fromParametersJsonb`) re-applies
  active overrides on the fly, with a 60-second cache. So *existing*
  products immediately show the corrected attribute name even though
  their JSONB rows weren't touched.

The principle: read-time application means a single correction improves
the historical corpus instantly. For cases where the engineer wants the
correction baked into the stored JSONB (for example, before running a
coverage report), the `atlas-ingest.mjs --backfill-translations` script
re-applies all current overrides to every existing product.

### Loop 2: AI-Assisted Triage (Suggester + Investigator)

The triage queue can hold thousands of unmapped parameter rows after a
big ingest. The app uses Claude to help engineers cut through the volume,
in two tiers.

**Suggester** is a per-row, on-demand call to Claude Sonnet. The engineer
clicks "Generate" on a single row; the model sees the canonical attribute
schema, the accepted-canonical inventory, and the sample values, and
returns one of `accept` or `defer` with an explanation. Cheap, fast, and
intentionally opt-in to control cost.

**Investigator** is the deeper second pass for ambiguous cases. The
engineer clicks "Investigate" on a row the Suggester deferred (or one
that can't be accepted at all because of scope problems). The model
returns a structured verdict naming exactly one of six action buckets:

- `new_canonical` — propose a new canonical attribute the schema didn't
  have before.
- `disambiguation` — the same parameter name means two different things
  in two contexts; split it.
- `wrong_family` — this parameter signals the product is in a different
  family than its current classification.
- `unit_mismatch` — the parameter is the right attribute but a different
  unit (mA vs A).
- `unscoped_products` — the override scope doesn't cover the products
  this parameter actually appears on.
- `unmappable` — give up, this parameter is too vendor-specific or
  malformed to fit the schema.

Each bucket renders its own action button. The engineer makes the call.
The principle: **AI as analyst, not authority.** The model surfaces
evidence and proposes a verdict in a structured form, but never writes
to production tables on its own.

### Loop 3: Family Parameter Signatures

A parameter name like `Rds(on)` only ever appears on MOSFETs. `BVceo`
only ever appears on BJTs. `Viso` only ever appears on optocouplers. The
app calls these **family signatures**.

The base set lives in code (`atlasFamilyParamSignatures.ts`), where each
entry carries documented reasoning. Engineers can extend the set at
runtime by adding rows to `atlas_family_param_signatures` — but if a
runtime entry collides with an audited code entry, **the code entry
wins**. Engineers can extend the rules, not override them.

When the AI Investigator returns a `wrong_family` verdict and the
engineer clicks Confirm, a single endpoint does two things at once: it
inserts the new signature row, *and* it runs a Postgres function
(an RPC, or remote procedure call — server-side code triggered by an
API call) that bulk-updates every existing product carrying that
parameter to the corrected family. One click closes the loop on both
new ingests and the historical corpus.

### Loop 4: Foreign-Family Auto-Flag

The same signature registry feeds back into the triage UI as a passive
detector. When a parameter shows up under a family it doesn't belong
to, the row auto-flags red, with a diagnosis chip explaining which family
it actually signals.

This is the loop's prevention arm. Loop 3 corrects misclassified products;
Loop 4 makes sure those misclassifications get noticed in the first place.

The principle: **single signal, multiple consumers.** One signature
registry feeds the ingest reclassifier, the triage UI flag, and any
future backfill script. Adding a new signature once propagates everywhere
it can possibly help.

### Loop 5: Value Aliases

A subtler problem than translation: even when both sides of a comparison
use English, they use different *words* for the same thing.

A capacitor's dielectric might be "C0G" on one datasheet and "NP0" on
another. Both describe the same NP0/C0G dielectric. A naïve string-equal
matcher flags this as a mismatch.

Each logic-table rule can carry a `valueAliases` array: a list of
synonym groups. When a comparison fails the exact-match test, the rule
checks the alias groups before declaring a mismatch.

The "propose alias" button appears inline on the comparison view and on
the QC feedback detail view. An engineer reviewing a flagged comparison
can suggest a new alias group in two clicks. Once accepted, that alias
silences the false-mismatch on every future comparison involving either
value.

### Loop 6: Coverage Repair Workflow

Not all gaps are equally important. A missing parameter on one obscure
product is much less valuable to fix than a missing parameter on 4,000
products in a critical family.

Every gap in the triage queue is scored by **Matching Impact**:

    impact = number of affected products × matching-engine rule weight

The triage UI sorts by impact descending by default, so engineers attack
the highest-leverage gaps first. A per-manufacturer drilldown lets an
engineer focus on one MFR's coverage and apply the same correction to
every affected product. A "Refresh from accepts" button re-applies the
current override set without a full re-ingest.

The principle: surface the gap, surface its leverage, and make the fix
one click. Low coverage → triage → accept → coverage updates.

### Loop 7: Grounded AI Domain Cards

Each component family has a short reference card describing what the
family looks like specifically in Atlas: which Chinese manufacturers ship
into it, what their MPN prefixes look like, what their parameter
conventions are. These cards are used in chat answers and in admin
context.

These cards are AI-generated by Claude Opus — but with a deliberate
anti-hallucination architecture. The generator never sees prior cards
(which would anchor the model on inherited hallucinations). Instead it
sees a deterministic **grounding block** built fresh from the database:

- The verified manufacturer cohort for this family (top N by product
  count, queried directly from `atlas_products`).
- Real sample MPNs from those manufacturers.
- The Chinese dictionary entries actually in use for this family.

Plus an explicit blocklist: do not mention any Western manufacturer that
isn't in the verified cohort. If you can't see a Chinese-character
convention in the dictionary entries provided, do not invent one.

After generation, an audit script (`atlas-audit-domain-cards.mjs`) checks
the output against the same authoritative sources to catch any
hallucination that slipped through. The card stays in draft until the
audit passes and an engineer activates it.

The principle: **prompt grounding is necessary but never sufficient.**
Every AI generation pass gets paired with automated verification against
the underlying data.

---

## Part 3 — Compounding Efficiency Over Time

Three properties together explain why the system gets more efficient as
engineers use it, rather than just staying constant.

**Ingestion is non-destructive.** Provenance tags mean a re-ingest only
touches values it originally placed there. So translation improvements,
classification corrections, and AI-extracted enrichments can be
propagated backward over the entire historical corpus without losing any
of the work that's been done since the last ingest.

**Every learning loop has dual application.** Overrides, signatures, and
aliases all take effect at both read time (existing rows immediately
reflect the correction) and ingest time (new rows get the correction
baked in). A single engineer hour in triage improves both the corpus
that already exists and every batch that arrives in the future.

**Auto-audit closes the AI feedback loop.** Every AI-generated artifact —
dictionary suggestions, investigation verdicts, family domain cards — is
either gated on engineer approval or paired with an automated audit
against the source data. Hallucination drift can't accumulate undetected
the way it would in a system where the AI's output is the final word.

The cumulative effect is straightforward: an engineer hour spent in
triage today reduces the next ingest's triage queue, raises coverage
percentages on the manufacturer panel, improves classification accuracy
on the affected products, and tightens substitution quality on the
matching engine — all from one correction. The same hour spent in a
system without these loops would have to be re-spent the next time the
same kind of correction came up.

That's the design intent. Engineer corrections compound. AI suggestions
are evidence, never authority. The pipeline is reversible. Provenance is
preserved. And nothing reaches production without an explicit human
proceed.
