# Source Part panel — loading states test script

Manual checklist for the change that makes the Source Part panel show **"still loading"** instead of looking empty (Decision #286).

**Time:** about 10 minutes.
**You need:** the app running, and about 20 seconds of patience per part — that is genuinely how long a part takes to load, and it is the whole window you are testing.

---

## Before you start

Run this once in the terminal. It should end with three OK/pass lines and no red:

```bash
npm run verify
```

Then start the app:

```bash
npm run dev
```

---

## Part numbers to use

Each one is here for a reason — they are not interchangeable. Load times were measured, not estimated.

| Part number | Manufacturer | Loads in | Why this one |
|---|---|---|---|
| `MNS2N2222AUB` | Microchip Technology | ~17 s | Has prices and a datasheet, but **no specifications at all** — tests both the shimmer and the new "no data" message |
| `GRM188R71H104KA93D` | Murata | ~18 s | Has **11 specifications** — tests that the shimmer turns into real rows |
| `SN74LVC1G08DBVR` | Texas Instruments | ~19 s | Has **14 specifications** — a second, independent example |
| `YNR4030-680M` | YJYCOIN (Chinese) | slow | A Chinese-manufacturer part — **the worst case before this fix**: the Specs tab was completely blank |

> **If a part loads instantly**, you are seeing a cached copy and there is nothing to observe. Use a different part number. In testing, repeat loads still took the full ~18 s, so this should be rare.

---

## Test 1 — Overview no longer looks empty ⭐ the main fix

1. Search for `MNS2N2222AUB` and click the result card.
2. The panel appears immediately. **Watch the Overview tab for the next ~17 seconds.**

**Expect while loading:**
- Grey shimmering bars where values will appear — Datasheet, Grade, Years to EOL, Risk Rank, Country of Origin, and the whole Distribution and Environmental sections.
- The part image box shimmers. It must **not** say "No image" yet.
- Next to **Distributors** there is a shimmer bar — **not the number 0**. This is the single most important thing on this screen. It used to say "0", which reads as a fact.

**Expect when it finishes:**
- Shimmers turn into real values: a **View PDF** datasheet link, **3** distributors, and a RoHS status.
- Some rows settle on a dash (—). That is correct — see "Expected quirks" below.

❌ **Fail if:** you see a wall of dashes for the whole 17 seconds, or "Distributors 0" at any point before loading finishes.

---

## Test 2 — Specs fills in instead of sitting blank

1. Same part still loading (reload the page and click it again), switch to the **Specs** tab.

**Expect while loading:** roughly a dozen shimmering rows filling the table.

**Expect when it finishes:** the message **"No parametric data available for this part."**

❌ **Fail if:** the shimmer disappears and leaves an empty table with just the "Parameter / Value" header. That is the outcome this test exists to catch — it would be worse than before the change.

---

## Test 3 — Specs with real data

1. Search `GRM188R71H104KA93D`, click it, go to **Specs**.

**Expect:** a few real rows appear immediately, shimmer rows below them, then the table fills with ~11 real specifications.

2. Repeat with `SN74LVC1G08DBVR` (~14 specs).

❌ **Fail if:** the "No parametric data available" message appears on a part that clearly has specs.

---

## Test 4 — The worst case: a Chinese-manufacturer part

1. Search `YNR4030-680M` and click the result (it shows a 🇨🇳 flag).
2. **Switch to the Specs tab right away**, while it is still loading.

**Expect:** shimmer rows fill the table straight away, and the real specs replace them ~10–20 s later when the load finishes. Before this change this exact case showed a bare column header over blank space for the entire load.

> The shimmer appears immediately; the **specs** do not. Waiting ~10 s for real rows is the pass condition, not a failure.

---

## Test 5 — Nothing jumps

While any part loads, keep your eye on one row — say **Total Stock** — and watch its position on screen as the data lands.

**Expect:** it stays exactly where it is. Values appear in place.

❌ **Fail if:** rows shift up or down, or the whole panel jolts, at the moment loading finishes.

---

## Test 6 — Nothing else changed

1. **Comparison view** — load a part, click **Find replacements**, then click a replacement card. Both panels should look and behave exactly as before.
2. **Parts list** — open any BOM list and click a row to open its detail popup. Should look exactly as before.

❌ **Fail if:** either surface shows shimmer bars where it used to show data, or looks different from what you remember.

---

## Expected quirks — please don't report these as bugs

- **Some rows shimmer and then land on a dash.** Grade, Years to EOL, Risk Rank, ECCN and HTS Code are genuinely empty for most parts. The shimmer means "we are checking"; the dash means "we checked, there is nothing." That is the intended behaviour — it cannot invent data that isn't published.
- **Chinese-manufacturer parts show "No image" straight away** instead of shimmering. Deliberate: we only ever get images from Digikey, so shimmering there would be a tease.
- **The lifecycle status chip shows "Active" immediately, even before loading finishes.** This is a known, separate flaw — for a part whose status we don't yet know, the app assumes Active. It is written down as an open issue, not fixed here.
- **Sections can appear late** (Qualifications, Cross References), pushing content below them down. Also pre-existing and not addressed here.

---

## If something fails

Note down: which test number, which part number, and what you saw instead. A screenshot mid-load is ideal — the loading window is ~17 seconds, so there is time to take one.
