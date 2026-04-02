/**
 * Atlas Client — Supabase queries for Atlas products
 *
 * Provides search, attribute lookup, and candidate fetching for the
 * Atlas Chinese manufacturer product database stored in Supabase.
 */

import { createClient } from '../supabase/server';
import type { PartAttributes, SearchResult, Part, PartSummary, ParametricAttribute } from '../types';
import { fromParametersJsonb } from './atlasMapper';

// ─── Disabled Manufacturer Cache ─────────────────────────
const CACHE_TTL_MS = 60_000; // 1 minute, same as override caches
let disabledMfrsCache: Set<string> | null = null;
let disabledMfrsCachedAt = 0;

async function getDisabledManufacturers(): Promise<Set<string>> {
  const now = Date.now();
  if (disabledMfrsCache !== null && now - disabledMfrsCachedAt < CACHE_TTL_MS) {
    return disabledMfrsCache;
  }

  try {
    const supabase = await createClient();

    // Use legacy table as primary (proven, always works)
    const { data: legacyData } = await supabase
      .from('atlas_manufacturer_settings')
      .select('manufacturer')
      .eq('enabled', false);

    const set = new Set((legacyData ?? []).map((r: { manufacturer: string }) => r.manufacturer));

    // Also check atlas_manufacturers if available (new canonical table)
    try {
      const { data: newData, error: newErr } = await supabase
        .from('atlas_manufacturers')
        .select('name_display')
        .eq('enabled', false);

      if (!newErr && newData) {
        for (const r of newData as { name_display: string }[]) {
          set.add(r.name_display);
        }
      }
    } catch {
      // New table not available yet — no problem
    }

    disabledMfrsCache = set;
    disabledMfrsCachedAt = now;
    return set;
  } catch {
    // If tables don't exist yet or Supabase fails, treat all as enabled
    disabledMfrsCache = new Set();
    disabledMfrsCachedAt = now;
    return disabledMfrsCache;
  }
}

export function invalidateManufacturerCache(): void {
  disabledMfrsCache = null;
  disabledMfrsCachedAt = 0;
}

// ─── Types ────────────────────────────────────────────────

interface AtlasProductRow {
  id: string;
  mpn: string;
  manufacturer: string;
  description: string | null;
  clean_description?: string | null;
  category: string;
  subcategory: string;
  family_id: string | null;
  status: string;
  datasheet_url: string | null;
  package: string | null;
  parameters: Record<string, { value: string; numericValue?: number; unit?: string }>;
  manufacturer_country: string | null;
}

// ─── Helpers ──────────────────────────────────────────────

function rowToPartAttributes(row: AtlasProductRow): PartAttributes {
  // Extract AEC qualifications from parameters JSONB
  const qualifications: string[] = [];
  const params = row.parameters || {};
  if (params.aec_q200?.value === 'Yes') qualifications.push('AEC-Q200');
  if (params.aec_q101?.value === 'Yes') qualifications.push('AEC-Q101');
  if (params.aec_q100?.value === 'Yes') qualifications.push('AEC-Q100');

  const part: Part = {
    mpn: row.mpn,
    manufacturer: row.manufacturer,
    description: row.clean_description || row.description || '',
    detailedDescription: row.description || '',
    category: row.category as Part['category'],
    subcategory: row.subcategory,
    status: (row.status || 'Active') as Part['status'],
    datasheetUrl: row.datasheet_url || undefined,
    manufacturerCountry: row.manufacturer_country || 'CN',
    ...(qualifications.length > 0 && { qualifications }),
  };

  const parameters: ParametricAttribute[] = fromParametersJsonb(row.parameters, row.family_id, row.category);

  return {
    part,
    parameters,
    dataSource: 'atlas',
  };
}

// ─── Public API ───────────────────────────────────────────

/**
 * Search Atlas products by MPN or description.
 * Uses trigram similarity on mpn + ilike on manufacturer/description.
 */
export async function searchAtlasProducts(query: string): Promise<SearchResult> {
  try {
    const supabase = await createClient();

    // Over-fetch to compensate for disabled manufacturer filtering
    const { data, error } = await supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, description, clean_description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country')
      .or(`mpn.ilike.%${query}%,manufacturer.ilike.%${query}%`)
      .limit(50);

    if (error) {
      console.warn('Atlas search error:', error.message);
      return { type: 'none', matches: [] };
    }

    if (!data || data.length === 0) {
      return { type: 'none', matches: [] };
    }

    // Filter out disabled manufacturers, then trim to 20
    const disabled = await getDisabledManufacturers();
    const filtered = disabled.size > 0
      ? (data as AtlasProductRow[]).filter((row) => !disabled.has(row.manufacturer))
      : (data as AtlasProductRow[]);
    const trimmed = filtered.slice(0, 20);

    if (trimmed.length === 0) {
      return { type: 'none', matches: [] };
    }

    const matches: PartSummary[] = trimmed.map((row) => ({
      mpn: row.mpn,
      manufacturer: row.manufacturer,
      description: row.clean_description || row.description || '',
      category: row.category as PartSummary['category'],
      status: (row.status || 'Active') as PartSummary['status'],
      dataSource: 'atlas' as const,
    }));

    return {
      type: trimmed.length === 1 ? 'single' : 'multiple',
      matches,
    };
  } catch (error) {
    console.warn('Atlas search failed:', error);
    return { type: 'none', matches: [] };
  }
}

/**
 * Get full attributes for a single Atlas product by MPN.
 */
export async function getAtlasAttributes(mpn: string): Promise<PartAttributes | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('atlas_products')
      .select('*')
      .ilike('mpn', mpn)
      .limit(1)
      .single();

    if (error || !data) return null;

    // Skip disabled manufacturers
    const disabled = await getDisabledManufacturers();
    if (disabled.has((data as AtlasProductRow).manufacturer)) return null;

    return rowToPartAttributes(data as AtlasProductRow);
  } catch {
    return null;
  }
}

/**
 * Fetch Atlas candidates for the matching engine.
 * Returns all products in the same family, ready for scoring.
 */
export async function fetchAtlasCandidates(familyId: string): Promise<PartAttributes[]> {
  try {
    const supabase = await createClient();

    // Filter disabled manufacturers at the database level for candidates
    const disabled = await getDisabledManufacturers();
    let query = supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, description, clean_description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country')
      .eq('family_id', familyId);

    if (disabled.size > 0) {
      // PostgREST in-filter format: ("Name1","Name2")
      const list = `(${[...disabled].map((m) => `"${m}"`).join(',')})`;
      query = query.not('manufacturer', 'in', list);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.warn('Atlas candidate fetch error:', error.message);
      return [];
    }

    if (!data || data.length === 0) return [];

    return data.map((row: AtlasProductRow) => rowToPartAttributes(row));
  } catch (error) {
    console.warn('Atlas candidate fetch failed:', error);
    return [];
  }
}
