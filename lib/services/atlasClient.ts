/**
 * Atlas Client — Supabase queries for Atlas products
 *
 * Provides search, attribute lookup, and candidate fetching for the
 * Atlas Chinese manufacturer product database stored in Supabase.
 */

import { createClient } from '../supabase/server';
import type { PartAttributes, SearchResult, Part, PartSummary, ParametricAttribute } from '../types';
import { fromParametersJsonb } from './atlasMapper';

// ─── Types ────────────────────────────────────────────────

interface AtlasProductRow {
  id: string;
  mpn: string;
  manufacturer: string;
  description: string | null;
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
  const part: Part = {
    mpn: row.mpn,
    manufacturer: row.manufacturer,
    description: row.description || '',
    detailedDescription: row.description || '',
    category: row.category as Part['category'],
    subcategory: row.subcategory,
    status: (row.status || 'Active') as Part['status'],
    datasheetUrl: row.datasheet_url || undefined,
    manufacturerCountry: row.manufacturer_country || 'CN',
  };

  const parameters: ParametricAttribute[] = fromParametersJsonb(row.parameters, row.family_id);

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

    // Search by MPN (trigram) or manufacturer name
    const { data, error } = await supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country')
      .or(`mpn.ilike.%${query}%,manufacturer.ilike.%${query}%`)
      .limit(20);

    if (error) {
      console.warn('Atlas search error:', error.message);
      return { type: 'none', matches: [] };
    }

    if (!data || data.length === 0) {
      return { type: 'none', matches: [] };
    }

    const matches: PartSummary[] = data.map((row: AtlasProductRow) => ({
      mpn: row.mpn,
      manufacturer: row.manufacturer,
      description: row.description || '',
      category: row.category as PartSummary['category'],
      status: (row.status || 'Active') as PartSummary['status'],
    }));

    return {
      type: data.length === 1 ? 'single' : 'multiple',
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

    const { data, error } = await supabase
      .from('atlas_products')
      .select('id, mpn, manufacturer, description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country')
      .eq('family_id', familyId)
      .limit(50);

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
