import type { PartAttributes } from '../types';
import { getLogicTableForSubcategory, isFamilySupported } from '../logicTables';
import { countComparableSourceRules } from './matchingEngine';

/**
 * Can the matching engine produce a MEANINGFUL logic-driven cross-reference for
 * this part?
 *
 * Two questions, both of which must be yes:
 *   1. do we have a rulebook for this category, and
 *   2. does the part give us anything to compare against it?
 *
 * The second half is not hypothetical. Digikey lists parts it never
 * characterised — measured at 6 of 4,203 real cached lookups (0.1%) — plus
 * parts whose only published fields are non-parametric (`ES3GB` carries just
 * "Moisture Sensitivity Level" and "Recovery Behavior: Consult datasheet";
 * `MLM205G` carries only the former). With nothing comparable, EVERY rule
 * returns the silent full `pass` that a missing SOURCE value earns, so the
 * pipeline hands back dozens of ~94% candidates derived from nothing:
 * `MNS2N2222AUB`, a hi-rel military 2N2222A, returned 48 topped by a digital
 * transistor with built-in bias resistors. Not offering the action beats
 * offering a fabricated answer.
 *
 * ⚠️ ZERO is the gate — never a coverage ratio. A cutoff was measured against
 * all 174 real source parts in the production logs and REJECTED: the median
 * part answers only ~60% of its family's scored rule weight, and commodity
 * parts sit exactly where the bad ones do (`LL4148` 26%, `MAX232DRG4` 17%,
 * `2SC1815M-GR` 17% vs `MNS2N2222AUB` 13%). Any ratio that catches the bad
 * parts also strips replacements from everyday ones. The honest handling of a
 * thin-but-nonzero comparison is to REPORT it — see `countComparedSpecs` in
 * types.ts, surfaced per card and in the chat summary.
 *
 * This is ONE axis of `partCapabilities.replacements`, ORed with the certified
 * axes by `hasAnyReplacements`. A part with published manufacturer crosses
 * keeps its button even when this returns false — verified against real data:
 * `NLAS9041DFT2G` has no usable specs AND 3 active manufacturer crosses.
 *
 * Pure: no I/O, no cache, no network. Safe on client or server.
 */
export function canLogicMatch(attrs: PartAttributes): boolean {
  if (!isFamilySupported(attrs.part.subcategory)) return false;
  const logicTable = getLogicTableForSubcategory(attrs.part.subcategory, attrs);
  if (!logicTable) return false;
  return countComparableSourceRules(attrs, logicTable) > 0;
}
