# Test Plan — Commercial Tab "Best Spot Price" + Bug Fixes

Covers the spot-price feature (highlight/reorder/qty control), the 3 correctness
review fixes, the 5 cleanup fixes, and the separate MPN double-decode fix.

## Branches & setup

- **Feature work** (everything except §8): branch `feat/commercial-best-spot-price`
  ```
  git checkout feat/commercial-best-spot-price
  ```
- **Decode fix** (§8 only): branch `fix/mpn-double-decode`
- Dev server: `npm run dev` → http://localhost:3000 (recompiles automatically on branch switch)
- Keep the browser **DevTools Console open** the whole time — several checks are "no red errors."

### Suggested test parts
- **P-RICH** (many distributors, sub-dollar pricing): `CRCW060310K0FKEA` (Vishay Dale, 0603 10k resistor) — ~15 distributors, price range ~$0.0014–$0.10. Primary part for most checks.
- **P-ACCURIS** (Accuris cross with `%` in MPN): `CDP060310K1%100PPM/KNP20` (Microtech) — appears as an Accuris-certified cross on P-RICH. Used in §8.
- **P-ATLAS** (Chinese MFR, may pull OEMS quotes): any Atlas part, e.g. a 3PEAK / GigaDevice MPN, to exercise mixed sources.

---

## §1 — Core best-price highlight & reorder (Source panel)

1. Search `CRCW060310K0FKEA`, confirm the part.
2. Open the **Commercial** tab on the Source panel.

**Expected:**
- [ ] A **Quantity** control shows at the top: a numeric field (showing `1`) + preset chips `1 / 10 / 100 / 1K / 10K / 100K`. The `1` chip is filled (active).
- [ ] Exactly **one** distributor card is crowned: green border, light-green tint, and a green **"Best @ qty 1"** chip next to the supplier name.
- [ ] The crowned card is at the **top** of the list.
- [ ] Inside the crowned card's price-break table, the row whose quantity applies at qty 1 is highlighted green (bold green text).
- [ ] The crowned card's unit price is the **lowest** at qty 1 among the listed distributors (eyeball the others).
- [ ] No red console errors.

## §2 — Changing quantity re-prices

1. Still on §1's Commercial tab. Click the **100** preset chip.

**Expected:**
- [ ] The field updates to `100`, the `100` chip becomes filled, `1` chip un-fills.
- [ ] The crown re-evaluates: the best distributor **at qty 100** floats to top and turns green (may be a different distributor than at qty 1).
- [ ] The crown chip now reads **"Best @ qty 100"**.
- [ ] The highlighted price-break row is now the tier that applies at 100 (largest tier ≤ 100).
- [ ] The list does **not** flash/flicker or visibly rebuild on the change (see §5 #2).

2. Type `2500` into the field and press **Enter** (or click away to blur).
- [ ] Re-prices at 2500; crown chip reads "Best @ qty 2500"; highlighted tier is the largest ≤ 2500.

3. Type `0` then Enter; type `abc`; type `-5`.
- [ ] Invalid inputs are rejected — the field reverts to the last valid quantity, no crash.

## §3 — Source ⇄ Replacement mirror (shared quantity)

1. From P-RICH, find cross-references and open a **replacement** (click a suggestion → Comparison view).
2. Open the **Commercial** tab. Both Source (left) and Replacement (right) Commercial tabs are now visible.

**Expected:**
- [ ] Both panels show their own Quantity control, both reflecting the **same** number.
- [ ] Each panel crowns the best price **for its own part** (the green winner can be a different distributor on each side).
- [ ] Change qty on the **Source** side → the **Replacement** side's quantity + crown update to the same qty (and vice-versa).

## §4 — Chat ↔ tab quantity sync

1. From a confirmed part (P-RICH), trigger the chat **"Best Spot Price"** action button.
2. When asked the quantity, pick **1,000** (preset or type it).

**Expected:**
- [ ] Chat posts the best-price answer and auto-switches to the **Commercial** tab.
- [ ] The Commercial tab's Quantity control now shows **1,000** (the chip filled), and the crown reflects qty 1,000 — i.e. the chat selection drove the tab.
- [ ] Conversely: change the tab quantity to 10,000, then ask Best Spot Price again — the prompt/answer is consistent with the shared value.

## §5 — Review fixes (the 3 correctness bugs)

### #1 — Quantity control works on mobile & in the parts-list modal
- **Desktop narrow / mobile:** shrink the browser to mobile width (or use device emulation) so the **MobileAppLayout** renders. Open a part → Commercial tab.
  - [ ] The Quantity field + presets render **and actually work** — tapping a preset / typing re-prices the crown. (Before the fix, the control was inert and stuck at 1.)
- **Parts-list modal:** go to a parts list, open a row's detail modal that shows Attributes/Commercial.
  - [ ] Same: the Commercial tab's Quantity control re-prices the crown; it is not stuck at 1.

### #2 — No remount/flicker on qty change; correct card crowned
1. On P-RICH (or P-ATLAS, more likely to have OEMS/broker quotes without part numbers), open Commercial.
2. Rapidly click between presets `1 → 100 → 1K → 10`.
   - [ ] Cards reorder smoothly; no full-list flash/rebuild, no flicker of individual cards.
3. If any distributor appears twice (same name) — e.g. an Atlas part pulling FC + OEMS:
   - [ ] Only **one** card is crowned, and it's the one whose highlighted price row actually shows the lowest applicable price (the crown isn't on a same-named duplicate with no highlighted row).

### #3 — In-progress edit is not wiped by an external update
1. Open the Comparison view so **both** Source and Replacement Commercial tabs are visible (shared qty).
2. Click into the **Source** Quantity field and type `250` but **do not** commit (don't blur/Enter).
3. While that field is still focused, click a preset on the **Replacement** panel (or trigger a chat qty change).

**Expected:**
- [ ] The Source field keeps your in-progress `250` — it is **not** silently overwritten by the external change while you're editing.
- [ ] When you blur the Source field, `250` commits.

## §6 — Cleanup fixes (verify nothing regressed)

### #5/#6 — Shared presets between chat & tab
- [ ] Chat Best Spot Price presets and the Commercial-tab presets show the **identical** tiers/labels: `1 / 10 / 100 / 1K / 10K / 100K`.

### #7 — Consistent green
- [ ] The best-price crown green matches the **"MFR Certified"** category chip green elsewhere in the UI (same shade — they now share one constant).

### #8 — Consistent price formatting
- [ ] A given unit price renders the same in the **chat best-price answer** and in the **Commercial-tab** card/table (e.g. a sub-cent price like `$0.0014` shows the same decimals in both; a round `$0.10` shows `$0.10`, not `$0.1000`).

### #9 — Quantity resets on a new part
1. Set qty to `10,000` on part A's Commercial tab.
2. Search and confirm a **different** part B.
   - [ ] Part B's Commercial tab opens at quantity **1** (not 10,000).
   - [ ] The attributes panel also returns to the **Overview** tab (unchanged prior behavior).

## §7 — Edge cases

- **No commercial data:** open a part with no distributor quotes (or an obscure Atlas-only MPN).
  - [ ] Commercial tab shows the "no commercial data" message and **no** Quantity control (control is suppressed when there are no quotes).
- **Qty below all MOQs (fallback):** pick a part/qty where the requested qty is below every distributor's minimum (try qty `1` on a part where distributors only break at 10+).
  - [ ] The cheapest accessible option is still crowned, but the chip reads **"Min qty N"** (the distributor's minimum), not "Best @ qty 1".
- **Mixed currency:** on a part with distributors quoting different currencies (e.g. an Atlas/LCSC part), confirm:
  - [ ] All distributor cards still render; only a dominant-currency distributor is ever crowned green (a non-dominant-currency card is shown but never green).

## §8 — MPN double-decode fix (separate branch)

> Switch first: `git checkout fix/mpn-double-decode` (dev server recompiles).

1. Search `CRCW060310K0FKEA`, find cross-references.
2. Click the Accuris-certified cross **`CDP060310K1%100PPM/KNP20`** (the `%` is the trap).

**Expected:**
- [ ] **No** `SyntaxError: Unexpected end of JSON input` and **no** corrupted-MPN "Part not found" crash in the console for the `%` MPNs.
- [ ] The replacement opens normally (loads specs), **or** shows a clean "Couldn't load specs" only if that cross genuinely isn't in any data source — but with no thrown error in the console.
3. Sanity: a normal cross-ref (no `%`) still opens fine.

---

## Automated checks (already green on the feature branch)

```
npx tsc --noEmit      # no new source errors
npm run lint          # 0 new errors (pre-existing warnings only)
npm test              # 2124 passing
npm run build         # compiles
```

## Sign-off

- [ ] §1–§4 feature behavior verified
- [ ] §5 all three review fixes verified
- [ ] §6 cleanups verified (no regression)
- [ ] §7 edge cases verified
- [ ] §8 decode fix verified on its branch
