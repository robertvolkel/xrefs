# How Atlas Learns: The Ingest → Translate → Verify Loop

This document explains how the XRefs app continuously improves its understanding of Chinese component data — specifically, how new manufacturer datasets flow in, how the system translates unfamiliar Chinese parameter names into the app's internal schema, and how those translations propagate back into the database to actually improve coverage. It's intended for anyone who needs to explain or visualize the workflow without first reading every architectural decision behind it.

---

## Why this loop exists

Atlas is our dataset of Chinese electronic component manufacturers — currently ~115 manufacturers and 55,000+ products housed in a Supabase table called `atlas_products`. Unlike Digikey, where parameters arrive in clean English (`"Capacitance"`, `"Tolerance"`, `"Voltage Rated"`), Atlas products arrive with parameters in **Chinese, in proprietary vendor formats, or in inconsistent English** — for example, `"容值"`, `"耐压"`, `"@IB(mA)"`, or `"封装尺寸"`. The XRefs app's matching engine reasons over a fixed internal schema (`capacitance`, `voltage_rated`, `package_case`, …), so before any Atlas product can be scored against a customer's part, every one of its parameter names has to be **mapped to the equivalent internal attribute**.

That mapping doesn't exist out of the box. It's built up over time, one accepted translation at a time, by a human reviewer working through a queue of unfamiliar parameter names. The system gets smarter with every new manufacturer ingested because:

1. **Each new manufacturer surfaces new parameter names** — typically 20–200 unfamiliar terms per drop.
2. **An AI assistant proposes a mapping** for each unfamiliar term, evaluated against the actual logic-table schema for the family it appears in.
3. **A human accepts, rejects, or refines** that proposal.
4. **The accepted mapping becomes a permanent translation rule** that applies to every future ingest AND, after one explicit "backfill" step, to every existing row already in the database.

This loop is what we mean when we say the app "learns." There's no model retraining and no statistical inference — it's a deterministic, auditable dictionary that grows over time and that any future ingest applies automatically.

---

## The five phases

The workflow has five natural phases, each addressing a different question.

### Phase 1 — Ingest: "Get the new data in safely"

A new manufacturer dataset arrives as a folder of JSON files (one per manufacturer). An operator drags those files into the admin UI. Nothing hits the production `atlas_products` table yet — instead, the app generates a **per-manufacturer diff report** showing exactly what would change (new rows, updated rows, soft-deleted rows, suspicious parameter names) and classifies each batch as `clean`, `review`, or `attention`. The operator then either approves batches individually or hits "Proceed All Clean" to apply every low-risk batch in one click.

Only when the operator explicitly applies a batch do the rows land in `atlas_products`. Every applied batch creates a 30-day snapshot, so any change is fully revertible.

### Phase 2 — Ground: "Update the AI's mental model of what each component family looks like"

Once new manufacturers exist in `atlas_products`, the app's per-family "domain cards" (curated, AI-generated summaries of who builds what in each family) may now be **stale**: the new manufacturers should appear in the cohort, but the cards were written before they existed. A health indicator turns yellow or red on any card whose grounding data has drifted significantly. The operator regenerates affected cards. This step ensures that the next AI step (Phase 3) is reasoning against a fresh, accurate picture of the family.

### Phase 3 — Translate: "Map unfamiliar parameter names to internal attributes"

The operator opens the **Triage** page. This is the heart of the learning loop. Every unfamiliar parameter name — whether Chinese, vendor-proprietary, or just spelled differently — is listed as a row, along with the manufacturer that uses it, the family context, and a small sample of the values seen.

For each row, an AI assistant proposes a target internal attribute (e.g. `"容值" → capacitance`) along with a confidence verdict (`accept` or `defer`) and a written explanation. The operator reviews and **accepts** correct mappings. Each accept writes a new override into the `atlas_dictionary_overrides` table.

A "Matching Impact" score on every row (= product count × the destination attribute's rule weight) prioritizes accepts that will move coverage the most. Accepts with the biggest impact float to the top by default — so a single accept might lift coverage for thousands of products in one click.

### Phase 4 — Apply: "Push new translations into existing rows"

This is the load-bearing step that's easy to miss. **Dictionary overrides only apply at ingest time.** When the operator accepts a new translation in Phase 3, that translation is now active for any *future* ingest — but the products *already* in `atlas_products` were translated using whichever overrides existed at the time of their original ingest. Those rows keep their old (or missing) translation forever unless something rewrites them.

That "something" is the **Backfill** step. A single button in the Atlas MFRs panel (or `npm run atlas:backfill` from the command line) re-reads every active override and updates every existing row in place. The script is idempotent — running it twice in a row is safe — and preserves the original data's provenance, only overwriting fields tagged as Atlas-sourced and never AI-extracted overrides.

After Backfill completes, the coverage percentage on the Atlas MFRs panel rises visibly. This is the only step in the workflow where translations applied to NEW data finally take effect on OLD data.

### Phase 5 — Verify: "Confirm the loop closed"

Two optional cleanup steps. **Regenerate affected batches** refreshes the per-batch counters in the Triage list (cosmetic — the actual translations already applied during Backfill). **Re-check domain cards** confirms that the new vocabulary didn't shift any card's health back to yellow or red. If everything looks green, the loop is closed and the new manufacturer is fully integrated.

---

## The full 8-step operator flow

| Step | Phase | Action | Why this position |
|------|-------|--------|-------------------|
| 1 | Ingest | Drag-drop new MFR JSON → creates Pending batch | Starting point. Nothing in production yet. |
| 2 | Ingest | Apply Pending batch (Proceed / Proceed All Clean) | Products land in `atlas_products` → grounding pool refreshes |
| 3 | Ground | Domain Cards Health column → regenerate any yellow/red cards | New MFRs now in cohort; AI ground-truth needs to catch up before Phase 3 runs against it |
| 4 | Translate | Triage page → click "Refresh N stale" if banner appears, AND click "Generate N" for cold rows | AI verdicts run against fresh domain cards |
| 5 | Translate | Accept green AI suggestions | Sort by Matching Impact desc — biggest accepts first |
| **5b** | **Apply** | **One-click "Backfill" button** in Atlas MFRs panel header (or `npm run atlas:backfill` from CLI) | **Without this, existing rows keep their pre-override translations and coverage % doesn't move. Required after accept bursts (~20+); skip for a handful.** |
| 6 | Verify | (Optional) Regen Affected Batches at top of Triage | Cosmetic refresh of per-batch counters |
| 7 | Verify | (Optional) Re-check domain cards | Only if more chips shifted after Backfill |

---

## Diagram structure (for visualization)

The flow has three kinds of nodes — **actions** taken by an operator, **data stores** that hold state, and **decisions** that branch the path. Listing them out explicitly here so the diagram can be generated in whatever style is appropriate.

**Actors:**
- **Operator** — the human reviewer driving the workflow
- **AI assistant** — proposes translation verdicts in Triage
- **Backfill script** — automated, runs on button click

**Data stores (rectangles with a database visual):**
- `atlas_products` — the master product table
- `atlas_dictionary_overrides` — the translation rule table
- `atlas_ingest_batches` — staged-but-not-yet-applied uploads
- `atlas_family_domain_cards` — per-family AI-generated context cards

**Action nodes (in order):**
1. Drag-drop new manufacturer JSON files into the ingest UI
2. App generates per-MFR diff report → creates Pending batch
3. Operator applies batch (Proceed or Proceed All Clean)
4. App regenerates domain cards whose health turned yellow/red
5. Operator opens Triage; refreshes any stale AI verdicts
6. AI generates verdicts for unfamiliar parameter rows
7. Operator accepts green suggestions (sorted by Matching Impact)
8. **Operator clicks Backfill** — script rewrites existing rows
9. Coverage % rises; loop closed

**Decision points (forks):**
- After Step 3: any domain cards yellow/red? → if yes, regenerate before Triage
- During Step 5–7: stale AI verdicts present? → if yes, refresh before reviewing
- After Step 7: were many accepts made (20+)? → if yes, run Backfill; if not, defer until next session

**Key data flows (arrows):**
- New JSON → `atlas_ingest_batches` (pending) → `atlas_products` (after apply)
- New mappings in Triage → `atlas_dictionary_overrides`
- `atlas_dictionary_overrides` → applied automatically on every NEW ingest
- `atlas_dictionary_overrides` → applied to EXISTING rows only via Backfill (the load-bearing step)

**Visual emphasis recommendations:**
- The Backfill step should be visually distinct — it's the step most often forgotten and is what closes the loop on existing data
- The split between "new ingests" (automatic) and "existing rows" (requires Backfill) is the single most important concept to convey
- Coverage % is the success metric — it should appear as the terminal state

---

## How the app gets smarter over time

Every accept in Phase 3 is a permanent addition to the translation dictionary, and every Backfill propagates those additions to every existing row. The dictionary never shrinks — terms once learned stay learned. This means:

- **The N+1th manufacturer is easier than the Nth.** A new manufacturer that uses common Chinese parameter names (`容值`, `耐压`, etc.) may produce zero unfamiliar terms because every one already exists in the dictionary. Coverage starts high and the Triage queue is empty.
- **New parameter names compound.** Even a manufacturer with 200 unfamiliar terms typically only contributes ~10–20 *globally* new terms — the rest are variations of words we've already learned. Those 10–20 also benefit every future manufacturer that uses them.
- **The Matching Impact score keeps reviewer attention where it matters.** A translation that lifts 15,000 products' coverage gets surfaced first. Long-tail one-off terms can be deferred without consequence.
- **Everything is auditable and revertible.** Every batch has a 30-day snapshot; every accepted override is timestamped and attributable to a reviewer; every domain card has a version history. The "learning" is not a black box — it's a growing, inspectable artifact.

In short: the app doesn't get smarter by training on more data. It gets smarter because **a human reviewer's expertise gets captured in a permanent, deterministic dictionary** — one accept at a time, with AI assistance proposing the right answer most of the time so the human can focus on confirming rather than authoring.

---

## Glossary

| Term | What it means |
|------|---------------|
| **Atlas** | Our dataset of Chinese component manufacturers. ~115 MFRs, 55K+ products. |
| **`atlas_products`** | The Supabase table holding all Atlas product rows. |
| **`atlas_dictionary_overrides`** | The translation rule table. Maps unfamiliar parameter names to internal attribute IDs. |
| **Family** | A component category like B5 (MOSFETs), 12 (MLCC Capacitors), or C1 (LDOs). Each family has its own logic table and matching rules. |
| **Logic table** | The set of rules used to score whether a candidate part is a valid cross-reference for a source part. |
| **Parameter (param)** | A single attribute of a component — capacitance, voltage rating, package size, etc. Arrives in Atlas with vendor-supplied names that need translation. |
| **Internal attribute** | The canonical name we use internally (e.g. `capacitance`, `voltage_rated`, `package_case`). |
| **Triage** | The admin page where unfamiliar parameter names are queued for translation review. |
| **Domain card** | An AI-generated summary of who builds what in a given family. Used as grounding context for the AI translator. |
| **Coverage %** | The percentage of a manufacturer's products whose parameters are sufficiently mapped to be scored by the matching engine. |
| **Matching Impact** | A row's priority score in Triage = product count × destination rule weight. Surfaces high-leverage accepts first. |
| **Backfill** | The script that re-applies the current dictionary to every existing row in `atlas_products`. Required to propagate new translations to already-ingested data. |
| **Override** | A single dictionary entry. One unfamiliar param name → one internal attribute. |
| **Pending / Applied batch** | Pending = uploaded but not yet in production. Applied = pushed to `atlas_products`. |

---

## References

- [Decision #199](./DECISIONS.md) — overrides apply at ingest time only; `--backfill-translations` mode added
- [Decision #200](./DECISIONS.md) — Triage Matching Impact + per-MFR drilldown + one-click Backfill button
- [Decision #174](./DECISIONS.md) — Atlas re-ingest pipeline (provenance JSONB, batch snapshots, revert)
- [Decision #192](./DECISIONS.md) — domain card grounding (Phase 1 anti-hallucination)
- [Decision #193](./DECISIONS.md) — domain card grounding-drift signal (Phase 2 staleness)
