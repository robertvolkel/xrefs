# Atlas MFR Ingest — Operator Runbook

End-to-end workflow for ingesting a new manufacturer's product JSON into Atlas. Written for operators who execute this regularly; explains both *what* to do and *why* each step lands where it does.

**Core principle: Triage BEFORE Proceed.** Mapping unmapped params via the Triage workspace while batches are still Pending means the Proceed step writes products to `atlas_products` already correctly translated — no retroactive backfill required.

---

## Phase 1: Upload + Triage (before any products land in `atlas_products`)

| Step | Action | Why this position |
|------|--------|-------------------|
| 1 | **Drag-drop new MFR JSON file(s)** onto the Atlas Ingest page | Each file becomes a Pending batch. Nothing has touched `atlas_products` yet. |
| 1a | If a new-MFR confirmation panel appears, **register the MFR** | New MFRs must be registered in `atlas_manufacturers` before their report can generate. |
| 2 | **Wait for batch reports** to populate (polls every 5s, can take 5–30 min depending on file size) | Background script generates per-MFR `IngestDiffReport` with the unmapped-params list. Batches sit at `status='pending'` until done — don't proceed early. |
| 3 | **Switch to Triage page** (`?section=atlas-dict-triage`) | Triage now shows unmapped params from your new Pending batches PLUS any leftover unresolved rows from older batches. |
| 4 | (Optional) Click **"Generate N"** for bulk AI suggestions, OR click ✨ per-row as you go | Sonnet 4.6 reads param context + sample values, suggests `attributeId` / `attributeName` / `unit`. ~$0.005 per row. Per-row is cheaper if you only triage a subset. |
| 5 | **Accept rows you're confident about**. For B4/B5/L2/etc. canonicals, AI's "schema-canonical match" cases are usually safe. | The whole point of Triage-before-Proceed: every accept becomes a live dict override that the Proceed step will apply at ingest time. |
| 5a | **Edit `attributeId` before accepting** when the AI picks a sub-optimal canonical (e.g. L2-context attribute name when an L3 canonical equivalent exists) | Just change the `attributeId` field, leave name/unit alone, then Accept. Future-proofs against later product reclassification. |
| 5b | **Defer rows you can't map**: click 🚩 flag, add a team note explaining why | Better than accepting `type`/`style`/`kind`/`category`/`material`/`characteristic` — these are junk-drawer canonicals (see [scripts/atlas-audit-generic-canonicals.mjs](../scripts/atlas-audit-generic-canonicals.mjs)) that pollute matching and require painful cleanup later. Engineer follows up on flagged rows. |
| 6 | After an accept burst (20+ rows), click **"Regen affected batches"** at the top of Triage | **Load-bearing**, not cosmetic: re-classifies each batch's `risk` field against current overrides. Without this, batches stay marked `attention`/`review` from upload-time and the Proceed All Clean button stays at `(0)`. |
| 6a | If you navigated away and the Regen banner disappeared: **click Regen on each batch card** in the Atlas Ingest page individually | The Triage banner is client-side React state and resets on tab navigation (known gap, backlogged). Per-batch Regen does the same risk recalculation. |

---

## Phase 2: Apply the batches

| Step | Action | Why this position |
|------|--------|-------------------|
| 7 | **Switch to Atlas Ingest → Pending tab** | Dashboard shows updated risk distribution after Regen ran. |
| 8 | Click **"Proceed All Clean (N)"** for bulk-apply of `clean` batches, OR per-batch **Proceed** for `review`/`attention` | Proceed reads current dict overrides at ingest time. Products land in `atlas_products` **already correctly translated**. No backfill required for these batches. |
| 8a | For `review` / `attention` batches that need engineer input: leave them Pending, document what's blocking in a team note | Don't force-apply — `attention` typically means a real semantic gap (e.g. unmapped param spans multiple semantic concepts, ambiguous unit). |

---

## Phase 3: Domain Cards

| Step | Action | Why this position |
|------|--------|-------------------|
| 9 | **Glance at the Domain Cards Health column** for newly-yellow / red chips | Grounding-drift signals fire when the new MFR's products shift family-cohort statistics (≥3 MFR drift = yellow, ≥5 MFR or ≥500 product drift = red). Cards with stale grounding produce hallucinated cohort claims. |
| 10 | On a drifted family, click **Generate** to create a draft card | Opus 4.7 generates a new draft using current `atlas_products` grounding (Decision #192). Anti-hallucination rules constrain output to verified MFRs only. |
| 11 | **Review the auto-audit panel** on the draft. `block`-severity findings (bogus MFRs, fabricated dict mappings, wrong prefixes) disable the Approve button. `warn` is advisory. | Decision #195 auto-audit catches the hallucinations Opus is most prone to. Don't override a `block` finding unless you understand it. Edit the card text to remove the offending claim and re-audit. |
| 12 | Click **Approve** once audit is clean | Flips card status to `active`. Auto-clears `atlas_ai_context_flags` rows older than the approve timestamp (flags about the old card no longer apply). |

---

## Phase 4: (Optional) Retroactive cleanup

| Step | Action | When to do it |
|------|--------|---------------|
| 13 | Run **`npm run atlas:backfill`** | Only if you accepted overrides during this session that benefit **older, already-applied** batches' products (i.e. MFRs whose products were ingested before today's accepts). Skip if you only worked on today's Pending → Proceed flow. |
| 14 | Alternative: use **"Refresh from accepts"** button on a specific MFR's admin detail page | Same effect as backfill but scoped to one MFR. Use when you know exactly which MFR needs retranslation. |

---

## Key principles to teach new operators

1. **Triage BEFORE Proceed.** Mapping first means the Proceed step writes correct translations directly — no backfill round-trip needed for new batches.
2. **Regen is the unlock for bulk-apply, not cosmetic.** It refreshes batch risk classifications against current overrides. Without it, `Proceed All Clean (0)` stays inert even when your accepts have resolved most of the unmapped-param gaps.
3. **Defer is better than wrong.** Junk-drawer canonicals (`type`, `style`, `kind`, `category`, `material`, `characteristic`, etc.) pollute the matching engine because the AI suggester falls back to them when no schema match exists. When in doubt, flag + team note for engineer follow-up.
4. **Each Phase has a clean "done" signal.**
   - Triage done = Regen flushed, risk chips reflect reality.
   - Proceed done = no batches remain in Pending tab.
   - Domain Cards done = no red/yellow drift chips that matter for your scope.
5. **Backfill is only for the past, not the present.** If today's accepts only affect today's batches, skip step 13.

---

## Common gotchas

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Proceed All Clean (0)` stays at zero after Triage accepts | Batch risk classifications are stale from upload-time | Click **Regen affected batches** (step 6) |
| "Regen affected batches" banner disappeared mid-session | Client-side React state reset on tab navigation | Click per-batch Regen on each BatchCard (step 6a) |
| AI suggests a canonical that doesn't exist in code (e.g. `capacitance_khz`) | Either a hallucination OR a legit prior accept in `atlas_dictionary_overrides` | Verify with [scripts/atlas-revoke-bad-canonical.mjs](../scripts/atlas-revoke-bad-canonical.mjs) `--id <name>` (dry-run). Revoke if it's a low-confidence hallucinated accept. |
| Same fabricated canonical keeps surfacing across multiple Triage rows after a revoke | `/suggest` cache staleness (BACKLOG, Decision #187 extension pending) | Manually edit `attributeId` per row to the correct canonical before Accept |
| Triage row's "sample values" look like MPN strings, not parametric values | Pivot-style source data (column header encodes the value, MPN goes in cell) | Defer the row with note; not a dict-override fit |
| Domain card audit flags a fabricated dict claim that's actually in the card text | Card text wasn't regenerated after the bad accept was revoked | Edit card text to remove the offending claim; re-audit; Approve |

---

## Related references

- [docs/DECISIONS.md](DECISIONS.md) — Architectural decisions (#174 ingest pipeline, #176 Triage workspace, #186 hardening, #195 auto-audit, #199 backfill, #200 coverage repair)
- [docs/BACKLOG.md](BACKLOG.md) — Known gaps including: Triage `/suggest` cache staleness on override-revoke, "needs regen" banner persistence, junk-drawer canonical cleanup
- [scripts/atlas-revoke-bad-canonical.mjs](../scripts/atlas-revoke-bad-canonical.mjs) — Audit / revoke a specific attributeId across all active overrides
- [scripts/atlas-audit-generic-canonicals.mjs](../scripts/atlas-audit-generic-canonicals.mjs) — Find junk-drawer canonical accumulations
- [scripts/atlas-audit-domain-cards.mjs](../scripts/atlas-audit-domain-cards.mjs) — Audit family domain cards for hallucinations
