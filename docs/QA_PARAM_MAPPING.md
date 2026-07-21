# Manual QA — Parameter Mappings

**What this is for.** The automated tests prove the code does what it was written to
do. They cannot prove things about the real database — that a write survives its
constraints, that two people clicking at once behave, that the number on your screen
matches the number in the table. This checklist covers that gap. It is not a stopgap
until better tests exist; it is the permanent coverage for the part tests can't reach.

**How long.** About 40 minutes for the whole thing. Scenario I is the important one —
if you only have time for one, do that. It answers the actual question: *when I accept
a mapping, does it get used?*

---

## How to use this

Every step has four parts:

| | |
|---|---|
| **DO** | Exactly what to click or type |
| **EXPECT** | An exact number or the exact words on screen |
| **FAILS IF** | The specific wrong thing to watch for |
| **RECORD** | A number to write down, because a later step compares against it |

Three rules that make the difference between a real check and a reassuring one:

1. **Write the number down before you act, not just after.** Otherwise "it worked" and
   "it was already like that" look identical.
2. **A number or the exact words — never an impression.** "Looked right" is not a result.
3. **Do the destructive ones twice.** The decision log can never delete a row, so a
   double-click leaves a permanent mistake. Doing it deliberately is how we find out.

If any step fails, stop and write down: which step, what you expected, what you saw.
Don't work around it — a workaround hides the thing we're looking for.

---

## Before you start

```bash
git rev-parse --abbrev-ref HEAD    # note which branch you're on
npm run verify                     # tests + the quality check. Must be clean.
```

**EXPECT** the last lines to read `Tests: … passed` with no failures, then
`OK lint errors` and `OK type errors`.

**FAILS IF** anything says FAIL. Stop here and send me the output — there is no point
testing by hand on top of a broken build.

---

## Scenario A — the Decision Log shows real history

1. **DO** Open the admin area → **Decision Log** in the left sidebar.
   **EXPECT** A list of entries, newest at the top.
   **RECORD** The date and time on the top entry.

2. **DO** Look at the coloured labels in the list. They are the only ones that exist:
   Mapped · Re-mapped · Mapping removed · Deferred · Reopened · Marked unmappable ·
   Flagged wrong family · Confirmed in family · Note added · Note erased · Bookmarked.
   **FAILS IF** you see a raw code instead, like `mapping_accepted` or `note_cleared`.
   That means a label is missing and the page fell back to the internal name.

3. **DO** Click the **Today** filter.
   **EXPECT** Only entries from today.
   **FAILS IF** entries from other days remain.

4. **DO** Click **Mine**.
   **EXPECT** Only entries where you are the person who decided.
   **FAILS IF** you see someone else's name.

5. **DO** Click the circular arrow (**Reload from server**) at the top.
   **EXPECT** The list reloads and the top entry is the same one you recorded in step 1
   (unless someone else has been working in the meantime).

---

## Scenario B — the history of one parameter shows only that parameter

This one has a specific past failure behind it. The search used to match anything
*containing* what you typed, so looking up the parameter `io` returned 131 entries
spanning 119 different parameters — every one with "io" somewhere in its name.

1. **DO** In the Decision Log search box, type `io` and wait a moment.
   **RECORD** How many entries come back.

2. **DO** Click any entry to open it, and find the per-parameter history inside.
   **EXPECT** Every row in that history is for the **same** parameter name.
   **FAILS IF** you see a mix — `io`, `iout`, `vio`, `ratio` — in one parameter's history.
   That is the bug, and it means the log is telling you about decisions that were
   never made about the parameter you're looking at.

3. **DO** Click the small ID chip next to the parameter name to copy it.
   **EXPECT** A confirmation that it copied.

---

## Scenario C — undoing a mapping

1. **DO** In the Decision Log, find an entry labelled **Mapped**.
   **RECORD** The parameter name and the exact date/time.

2. **DO** Click its undo arrow. Confirm in the dialog.
   **EXPECT** The dialog title reads exactly **"Undo this decision?"**
   **EXPECT** Afterwards, a report of **1 undone**.

3. **DO** Reload the page.
   **EXPECT** **Two** entries for that parameter now: the original **Mapped** at its
   original time, and a new **Mapping removed** at today's time.
   **FAILS IF** the original entry changed, moved, or disappeared. The log is supposed
   to be add-only — undoing appends a new line, it never rewrites the old one. If the
   original's timestamp changed, something is editing history.

---

## Scenario D — undoing the same thing twice (do this deliberately)

1. **DO** Take the same entry you just undid in Scenario C. Undo it **again**.
   **EXPECT** A report of **0 undone**, with a reason mentioning the mapping was
   already inactive.
   **FAILS IF** it reports 1 undone.

2. **DO** Reload.
   **RECORD** How many **Mapping removed** entries exist for that parameter.
   **EXPECT** Exactly **one** — from Scenario C.
   **FAILS IF** there are two. That is a permanent false record: it says you removed
   the mapping twice, at two different times, and nothing can delete it.

---

## Scenario E — undoing a defer, and a defer that has a note

The note is the engineer's reasoning. Reopening a parameter must not destroy it.

1. **DO** In Triage, defer a parameter **without** writing a note.
   **DO** In the Decision Log, undo that **Deferred** entry.
   **EXPECT** 1 undone, and a new **Reopened** entry.
   **DO** Go back to Triage and find that parameter.
   **EXPECT** It is back in the open queue.

2. **DO** Now defer a different parameter and **write a note** in the box
   (something you'll recognise, e.g. `QA test — keep me`).
   **RECORD** The exact note text.

3. **DO** Undo that **Deferred** entry from the Decision Log.
   **EXPECT** 1 undone. The parameter returns to the open queue.
   **EXPECT** **Your note is still there.**
   **FAILS IF** the note is gone. Reopening is about the *status*; erasing the
   reasoning is a separate decision that nobody made.

---

## Scenario F — things that must refuse, and say why

Some entries can't be undone. What matters here is that the greyed-out button and the
server give you the **same** explanation.

1. **DO** Find an entry labelled **Re-mapped** and hover over its undo button.
   **EXPECT** the tooltip reads exactly:
   > Undoing a re-map means restoring the previous mapping. Do that on the Triage page,
   > where the sample values and suggestion are visible.

2. **DO** Find an entry labelled **Mapping removed** or **Reopened** and hover.
   **EXPECT** exactly:
   > This entry is itself an undo. Re-apply it from the Triage page.

3. **DO** Find an entry labelled **Note added** or **Bookmarked** and hover.
   **EXPECT** exactly:
   > This kind of entry has nothing to reverse.

**FAILS IF** any button is clickable when it shows one of those messages, or the
wording differs from the above.

---

## Scenario G — batch accept, then batch undo, returns to exactly where you started

1. **DO** In Triage, note how many parameters are waiting in the open queue.
   **RECORD** that number as **BEFORE**.

2. **DO** Tick several starred rows (5–10 is plenty) and use **Batch Accept**.
   **RECORD** How many it reports accepting, as **N**.
   **EXPECT** The open queue is now **BEFORE − N**.
   **FAILS IF** the drop doesn't match N. A mismatch means some rows were counted as
   accepted but not written, or vice versa.

3. **DO** Use the one-click **Undo** offered right after the batch.
   **EXPECT** The open queue returns to **exactly BEFORE**.
   **FAILS IF** it lands anywhere else, even by one.

4. **DO** Open the Decision Log.
   **EXPECT** The batch appears as a single collapsed group you can expand to see all
   N parameters, followed by the undo.
   **FAILS IF** you see N separate ungrouped entries with no way to tell they were one
   action.

---

## Scenario H — revoking something already revoked

1. **DO** In Triage, find a parameter showing **Accepted** and click **Revert**.
   **EXPECT** The row returns to the open queue.

2. **DO** Do it again on the same parameter, if the button is still available.
   **DO** Check the Decision Log for that parameter.
   **EXPECT** Exactly **one** *Mapping removed* entry.
   **FAILS IF** there are two.

---

## Scenario I — does an accepted mapping actually get used?

**This is the important one.** Everything else checks that the app records what you did.
This checks that what you did has an effect on the data.

Both commands below only *look*; neither writes anything. Run them from the project
folder in Terminal.

> ⚠️ **Do not substitute `--report --dry-run` for these.** That is the one mode that
> runs without a database connection, so it loads **zero** mappings — your accepted
> mapping will show as still unmapped, and it will look like a bug that isn't one.

### Set-up

1. **DO** In Triage, pick a parameter in the open queue that you're confident about.
   **RECORD** its exact name, its family, and the manufacturer.
   **RECORD** the open-queue count as **OPEN-BEFORE**.

2. **DO** Run:
   ```bash
   node scripts/atlas-ingest.mjs --rescan-unmapped-params --dry-run
   ```
   **EXPECT** The last line reads `[dry-run] No writes. Re-run without --dry-run to apply.`
   **RECORD** from the output:
   - the number in `Loaded N unique mapped-key candidates …` → **KEYS-BEFORE**
   - both numbers in `X batches need updating; Y stale entries to remove.` →
     **BATCHES-BEFORE** and **STALE-BEFORE**

   > As of 20 July 2026 this run is completely clean — it reports
   > `0 batches need updating; 0 stale entries to remove`. That is good news for the
   > test: it means step 5 has an unmistakable signal to look for, 0 becoming a
   > positive number, rather than a small change in a big number.

3. **DO** Run the command below. `--mfr` matches **part of the source file name**, not
   a code — so for `mfr_402_Caelus_奇历士_params.json` you type `Caelus`. Use the
   manufacturer from step 1; `ls data/atlas` shows the file names if you need it.
   ```bash
   npm run atlas:backfill:dry -- --mfr Caelus
   ```
   **EXPECT** Output ending like this (the real thing, from a small manufacturer):
   ```
   Backfill — 1 source file (DRY RUN)
   ────────────────────────────────────────────────────────────
     Caelus                                  0 would change / 3 same / 0 missing
   ────────────────────────────────────────────────────────────
   Scanned 3 / Changed 0 / Unchanged 3 / Missing 0 / Errors 0
   ```
   **RECORD** the "would change" number → **CHANGE-BEFORE**

   > Pick a manufacturer that actually has the parameter from step 1, and one with a
   > decent number of parts — a maker with 3 products can't show much movement.

### The test

4. **DO** Go back to Triage and **accept** the mapping for that parameter.
   **EXPECT** The open queue is now **OPEN-BEFORE − 1**.
   **FAILS IF** it doesn't drop.

5. **DO** Re-run the command from step 2.
   **EXPECT** **STALE has gone UP** (from 0, if it was 0 when you started). The
   parameter you just mapped is sitting in the "still unmapped" list of at least one
   batch, so mapping it makes at least one entry stale.
   **FAILS IF** all three numbers are completely unchanged. That means your accept was
   recorded in the app but never reached the code that does the mapping — the exact
   failure this whole exercise exists to catch.

   > **On KEYS-BEFORE:** it usually goes up by exactly 1, but not always. That count is
   > the number of *distinct parameter spellings* mapped across **all** families at
   > once, so if the identical spelling is already mapped under some other family, it
   > stays flat. A flat KEYS number on its own is **not** a failure. STALE is the
   > number to judge by.

6. **DO** Re-run the command from step 3.
   **EXPECT** The "would change" number is **larger** than CHANGE-BEFORE.
   **FAILS IF** it is unchanged. This is the strongest signal in the whole checklist:
   it means real product records would now be translated differently because of your
   accept.

   Want to see exactly what changed? Add `--verbose` to that command and it prints each
   affected part number with the attributes added and removed.

### Putting it back

7. **DO** In the Decision Log, undo the accept from step 4.
   **EXPECT** **1 undone**, and the parameter shows two entries — **Mapped** at the
   original time and **Mapping removed** at today's — with two different timestamps.

8. **DO** Re-run both commands one more time.
   **EXPECT** STALE and "would change" are back at **exactly** STALE-BEFORE and
   CHANGE-BEFORE.
   **FAILS IF** either is off by any amount. Undo is supposed to return the system to
   where it started; landing somewhere nearby is not the same thing.

### Negative control

At steps 1, 5 and 8, also pick a **second** parameter in a **different** family and
check that nothing about it changed. If everything moves whenever you touch anything,
the numbers above prove nothing.

---

## What this checklist deliberately does not cover

Being explicit, so nobody reads a clean run as more than it is:

- **Two people at once.** Nothing here tests you and someone else accepting the same
  parameter simultaneously.
- **How the page looks.** No test here or in the automated suite checks layout,
  spacing, or whether something is readable on a small screen.
- **The AI's judgement.** These steps check that an accepted suggestion is recorded and
  applied correctly. Whether the suggestion was *right* is a separate question and
  still needs a human who knows the parts.

---

## If something fails

Send me: the scenario and step number, what you expected, what you actually saw, and
the recorded numbers from the steps before it. The numbers are what make it diagnosable
— without them a report is a description, and I'll be guessing.
