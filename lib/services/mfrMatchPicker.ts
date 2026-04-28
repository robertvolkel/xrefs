/**
 * MFR-aware match picker — used by BOM batch validation.
 *
 * When search returns multiple candidates AND the user supplied a manufacturer,
 * prefer the candidate whose MFR canonically matches the input over blind
 * first-match. Falls through to matches[0] when:
 *   - only one match exists
 *   - input MFR is blank
 *   - input MFR doesn't resolve to an alias
 *   - no candidate MFR canonically matches the input
 *
 * Fixes the "Digikey returns LT1086|Analog Devices while user typed
 * LT1086|Linear Technology → we silently accept whatever came back first"
 * class of issue.
 */
import type { PartSummary } from '../types';
import { resolveManufacturerAlias } from './manufacturerAliasResolver';

export async function pickMfrAwareMatch(
  matches: PartSummary[],
  inputManufacturer: string | undefined,
): Promise<PartSummary> {
  if (matches.length <= 1 || !inputManufacturer?.trim()) return matches[0];
  const inputAlias = await resolveManufacturerAlias(inputManufacturer);
  if (!inputAlias) return matches[0];
  for (const m of matches) {
    if (!m.manufacturer) continue;
    const candAlias = await resolveManufacturerAlias(m.manufacturer);
    if (candAlias?.slug === inputAlias.slug) return m;
  }
  return matches[0];
}
