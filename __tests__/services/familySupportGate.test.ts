/**
 * Family-support gate integrity.
 *
 * The gate (`isFamilySupported`) and the scoring path (`getLogicTableForSubcategory`) both key on
 * the exact-string map `subcategoryToFamily`. They receive the OUTPUT of `mapSubcategory`, which
 * normalizes a raw Digikey category leaf to a canonical registry key. `mapSubcategory` (the emit)
 * and `subcategoryToFamily` (the keys) are two hand-maintained lists that must agree on exact
 * strings — and they had drifted three ways, each surfacing to the user as a false "we don't
 * support this part" (which reads as a product limitation, so the user never retries):
 *
 *   1. "Mica and PTFE Capacitors" → matched no capacitor branch → returned verbatim (family 13 lost).
 *   2. "Diode Arrays" → matched no diode branch → returned verbatim (B-block lost).
 *   3. "Solid State Relays - Industrial Mount" → mapSubcategory emitted the SINGULAR non-key form.
 *      NOTE: this leaf is DEFENSIVE — digikeyParamMap's F2 taxonomy override documents that Digikey's
 *      live tree has no such leaf (the real one, "Solid State Relays (SSR)", already mapped to F2
 *      pre-fix). Kept consistent so it maps correctly IF that leaf ever appears; it was never a
 *      real production false-reject. So the production drifts fixed were TWO (mica, diode arrays).
 *
 * What this registry-derived test guarantees, precisely: no leaf in the app's coverage/taxonomy maps
 * is falsely REJECTED — every one resolves through the real mapper to SOME supported family, so a
 * user is never wrongly told "we don't support this part". It does NOT assert the leaf maps to the
 * RIGHT family: a leaf listed under a family only for param-coverage may map to a different-but-
 * supported family (e.g. family 13's coverage entry "Ceramic Capacitors" maps to 12/MLCC, and that is
 * correct — mica merely shares the ceramic param map). The THREE targeted tests below assert the
 * correct family for the real drifts. A separate check keeps the corpus honest: every registry family
 * must contribute at least one leaf, so a NEW family added without wiring it into the coverage maps
 * fails loudly instead of getting silently zero coverage here.
 */

import { mapSubcategory } from '@/lib/services/digikeyMapper';
import {
  getDigikeyCategoriesForFamily,
  getTaxonomyPatternsForFamily,
} from '@/lib/services/digikeyParamMap';
import { isFamilySupported, getLogicTableForSubcategory, logicTableRegistry } from '@/lib/logicTables';

/** Every raw Digikey leaf name the app claims belongs to a covered (logic-table) family. */
function coveredFamilyLeaves(): Array<{ familyId: string; leaf: string }> {
  const out: Array<{ familyId: string; leaf: string }> = [];
  for (const familyId of Object.keys(logicTableRegistry)) {
    const leaves = new Set([
      ...getDigikeyCategoriesForFamily(familyId),
      ...getTaxonomyPatternsForFamily(familyId),
    ]);
    for (const leaf of leaves) out.push({ familyId, leaf });
  }
  return out;
}

describe('family-support gate — no covered family is falsely rejected', () => {
  it('every covered-family Digikey leaf resolves through mapSubcategory to a supported family', () => {
    const falseRejects = coveredFamilyLeaves()
      .filter(({ leaf }) => !isFamilySupported(mapSubcategory(leaf)))
      .map(({ familyId, leaf }) => `${familyId}: "${leaf}" → "${mapSubcategory(leaf)}"`);
    // Pre-fix this array held the 3 drifts above. A helpful message names any regression.
    expect(falseRejects).toEqual([]);
  });

  it('every covered-family leaf also yields a scoring logic table (gate + scorer agree)', () => {
    const noTable = coveredFamilyLeaves()
      .filter(({ leaf }) => getLogicTableForSubcategory(mapSubcategory(leaf)) === null)
      .map(({ familyId, leaf }) => `${familyId}: "${leaf}"`);
    expect(noTable).toEqual([]);
  });

  it('every registry family contributes at least one leaf (a new family cannot be silently uncovered)', () => {
    // coveredFamilyLeaves() derives its corpus from the coverage/taxonomy maps. A family added to
    // logicTableRegistry but NOT wired into either map produces zero leaves — the leaf-resolution
    // checks above would then assert nothing for it and pass vacuously. This makes that gap loud.
    const uncovered = Object.keys(logicTableRegistry).filter(
      (familyId) =>
        getDigikeyCategoriesForFamily(familyId).length === 0 &&
        getTaxonomyPatternsForFamily(familyId).length === 0,
    );
    expect(uncovered).toEqual([]);
  });
});

describe('family-support gate — the three specific drifts (readable regressions)', () => {
  it('industrial-mount SSR maps to a supported F2 subcategory (singular/plural drift)', () => {
    const mapped = mapSubcategory('Solid State Relays - Industrial Mount');
    expect(isFamilySupported(mapped)).toBe(true);
    expect(getLogicTableForSubcategory(mapped)?.familyId).toBe('F2');
  });

  it('mica capacitors map to family 13 (was a verbatim pass-through)', () => {
    const mapped = mapSubcategory('Mica and PTFE Capacitors');
    expect(isFamilySupported(mapped)).toBe(true);
    expect(getLogicTableForSubcategory(mapped)?.familyId).toBe('13');
  });

  it('generic diode arrays map to the B1 base so the classifier can refine the variant', () => {
    const mapped = mapSubcategory('Diode Arrays');
    expect(isFamilySupported(mapped)).toBe(true);
    // Base family B1 — getLogicTableForSubcategory(_, attrs) then refines to B2/B3/B4 from the part.
    expect(getLogicTableForSubcategory(mapped)?.familyId).toBe('B1');
  });
});

describe('family-support gate — genuinely unsupported categories are still rejected', () => {
  // The fix must not over-open the gate: parts we deliberately don't cover must stay unsupported.
  it.each([
    'Microcontroller',
    'FPGA',
    'Temperature Sensor',
    'LED',
    'Motor',
    'Tactile Switch',
    'DRAM',
  ])('"%s" is not falsely reported as supported', (category) => {
    expect(isFamilySupported(mapSubcategory(category))).toBe(false);
  });
});
