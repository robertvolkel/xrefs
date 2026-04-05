import { createClient } from '@/lib/supabase/server';
import type { ManufacturerCrossReference } from '@/lib/types';

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
 * Fetch manufacturer-certified cross-references for a given original MPN.
 * Returns xref (replacement) parts that manufacturers have certified as equivalents.
 */
export async function fetchManufacturerCrossRefs(
  originalMpn: string
): Promise<ManufacturerCrossReference[]> {
  const key = originalMpn.toLowerCase();

  // Check cache
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('manufacturer_cross_references')
      .select('*')
      .ilike('original_mpn', key)
      .eq('is_active', true);

    if (error) {
      console.error('fetchManufacturerCrossRefs error:', error.message);
      return [];
    }

    const results = (data || []) as ManufacturerCrossReference[];
    cache.set(key, { data: results, ts: Date.now() });
    return results;
  } catch (err) {
    console.error('fetchManufacturerCrossRefs exception:', err);
    return [];
  }
}
