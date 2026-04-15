import { createClient } from '@/lib/supabase/server';
import type { ManufacturerCrossReference } from '@/lib/types';
import { mpnLookupCandidates } from './mpnNormalizer';

/**
 * Manufacturer cross-reference lookup service.
 * Caches results for 60s to avoid repeated DB hits during recommendation pipeline.
 */

let cache = new Map<string, { data: ManufacturerCrossReference[]; ts: number }>();
const CACHE_TTL = 60_000; // 60s

/** Invalidate the entire manufacturer cross-ref cache */
export function invalidateMfrCrossRefCache(): void {
  cache = new Map();
}

/**
 * Fetch manufacturer-certified cross-references for a given MPN.
 *
 * Searches both directions: rows where the MPN is the `original_mpn` and
 * rows where it is the `xref_mpn`. For reverse matches, the row's fields
 * are swapped so the consumer always sees the "other side" as `xref_mpn`
 * (the recommendation to surface). Pin-to-pin and functional equivalence
 * are symmetric, so reverse matches are semantically valid.
 */
export async function fetchManufacturerCrossRefs(
  originalMpn: string
): Promise<ManufacturerCrossReference[]> {
  const key = originalMpn.toLowerCase();

  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const supabase = await createClient();
    const candidates = mpnLookupCandidates(key);
    const candidatesSet = new Set(candidates.map(c => c.toLowerCase()));
    const orFilter = candidates
      .flatMap(c => [`original_mpn.ilike.${c}`, `xref_mpn.ilike.${c}`])
      .join(',');

    const { data, error } = await supabase
      .from('manufacturer_cross_references')
      .select('*')
      .or(orFilter)
      .eq('is_active', true);

    if (error) {
      console.error('fetchManufacturerCrossRefs error:', error.message);
      return [];
    }

    const rows = (data || []) as ManufacturerCrossReference[];
    console.log(
      `[mfr-xref] lookup="${originalMpn}" candidates=[${candidates.join(', ')}] matched=${rows.length}`,
    );
    const results: ManufacturerCrossReference[] = rows.map((row) => {
      const origLower = row.original_mpn.toLowerCase();
      const forwardMatch = candidatesSet.has(origLower);
      if (forwardMatch) return row;
      // Reverse match — swap so xref_mpn carries the recommendation MPN.
      // xref_description described the original xref side and no longer applies.
      return {
        ...row,
        original_mpn: row.xref_mpn,
        original_manufacturer: row.xref_manufacturer,
        xref_mpn: row.original_mpn,
        xref_manufacturer: row.original_manufacturer,
        xref_description: undefined,
      };
    });

    cache.set(key, { data: results, ts: Date.now() });
    return results;
  } catch (err) {
    console.error('fetchManufacturerCrossRefs exception:', err);
    return [];
  }
}
