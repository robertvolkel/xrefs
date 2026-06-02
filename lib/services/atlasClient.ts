/**
 * Atlas Client — Supabase queries for Atlas products
 *
 * Provides search, attribute lookup, and candidate fetching for the
 * Atlas Chinese manufacturer product database stored in Supabase.
 */

import { createClient } from '../supabase/server';
import type { PartAttributes, SearchResult, Part, PartSummary, ParametricAttribute } from '../types';
import { fromParametersJsonb } from './atlasMapper';
import { fetchAllDictOverrides, type DictOverrideRow } from './atlasDictOverrides';
import { resolveManufacturerAlias } from './manufacturerAliasResolver';

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

function rowToPartAttributes(row: AtlasProductRow, overrides?: DictOverrideRow[]): PartAttributes {
  // Extract AEC qualifications from parameters JSONB
  const qualifications: string[] = [];
  const params = row.parameters || {};
  if (params.aec_q200?.value === 'Yes') qualifications.push('AEC-Q200');
  if (params.aec_q101?.value === 'Yes') qualifications.push('AEC-Q101');
  if (params.aec_q100?.value === 'Yes') qualifications.push('AEC-Q100');

  // Lift compliance + lifecycle fields from parameters JSONB onto the top-level
  // Part so the Overview / Environmental & Export section renders them. These
  // keys are flat in Atlas (`rohs`, `reach`, `eccn`, `hts`, etc.) and don't
  // appear in any family's logic table — without this lift, the admin
  // detail view shows them under "additional attributes not in schema" but
  // the front-end Overview shows blanks.
  //
  // Atlas convention is `YES`/`NO`; downstream consumers (compositeScore's
  // hasRohs/hasReach predicates) match on the substring "compliant", so we
  // normalize here. ECCN/HTS pass through verbatim (e.g. `EAR99`, `8541.10`).
  const normalizeYesNo = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    const s = v.trim().toLowerCase();
    if (s === 'yes' || s === 'y' || s === 'compliant') return 'Compliant';
    if (s === 'no' || s === 'n' || s === 'non-compliant') return 'Non-Compliant';
    return v;
  };
  const paramValue = (key: string): string | undefined => {
    const raw = params[key]?.value;
    if (typeof raw !== 'string' || raw.trim() === '') return undefined;
    return raw.trim();
  };

  const rohsStatus = normalizeYesNo(paramValue('rohs') ?? paramValue('rohs_compliant'));
  const reachCompliance = normalizeYesNo(paramValue('reach') ?? paramValue('reach_compliant'));
  const eccnCode = paramValue('eccn') ?? paramValue('eccn_code');
  const htsCode = paramValue('hts') ?? paramValue('hts_code');
  const moistureSensitivityLevel = paramValue('msl') ?? paramValue('moisture_sensitivity_level');

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
    ...(rohsStatus && { rohsStatus }),
    ...(reachCompliance && { reachCompliance }),
    ...(eccnCode && { eccnCode }),
    ...(htsCode && { htsCode }),
    ...(moistureSensitivityLevel && { moistureSensitivityLevel }),
  };

  const parameters: ParametricAttribute[] = fromParametersJsonb(row.parameters, row.family_id, row.category, overrides);

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
 *
 * When `manufacturer` is provided, the MPN query is INTERSECTED with the
 * resolved canonical's variant set — guarantees that "1.5KE10 from Galaxy"
 * surfaces Galaxy's rows even when other manufacturers share the MPN. Without
 * this filter, the un-ordered substring query could trim Galaxy out at the
 * 50-row cap before the orchestrator's post-filter ever ran.
 */
export async function searchAtlasProducts(
  query: string,
  manufacturer?: string,
): Promise<SearchResult> {
  try {
    const supabase = await createClient();

    // Resolve MFR identity from EITHER the explicit `manufacturer` arg (when
    // the LLM extracted "from Galaxy") OR the query string itself (when the
    // user typed only the MFR name). The explicit arg wins — it's the strong
    // signal that the user has a specific MFR in mind for this MPN.
    const explicitMfrMatch = manufacturer ? await resolveManufacturerAlias(manufacturer) : null;
    const queryMfrMatch = await resolveManufacturerAlias(query);

    const columns = 'id, mpn, manufacturer, description, clean_description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country';

    // Stable ordering: deterministic across runs, prevents silent drops at the
    // trim boundary. Earlier versions had no ORDER BY → Postgres returned rows
    // in internal-ID order → MFRs whose rows were inserted later were silently
    // dropped at .slice() time even when present in the DB.
    const mpnQueryBase = supabase
      .from('atlas_products')
      .select(columns)
      .ilike('mpn', `%${query}%`)
      .order('manufacturer', { ascending: true })
      .order('mpn', { ascending: true })
      .limit(50);

    const mpnQuery = explicitMfrMatch
      ? mpnQueryBase.in('manufacturer', explicitMfrMatch.variants)
      : mpnQueryBase;

    // Second query: pull products by MFR name. Skipped when MFR is explicit
    // (we already have intersection above; loading all of Galaxy's catalog
    // would dilute the result with non-1.5KE10 products).
    const mfrQuery = explicitMfrMatch
      ? null
      : queryMfrMatch
        ? supabase
            .from('atlas_products')
            .select(columns)
            .in('manufacturer', queryMfrMatch.variants)
            .order('manufacturer', { ascending: true })
            .order('mpn', { ascending: true })
            .limit(50)
        : supabase
            .from('atlas_products')
            .select(columns)
            .ilike('manufacturer', `%${query}%`)
            .order('manufacturer', { ascending: true })
            .order('mpn', { ascending: true })
            .limit(50);

    const [mpnRes, mfrRes] = await Promise.all([
      mpnQuery,
      mfrQuery ?? Promise.resolve({ data: [] as AtlasProductRow[], error: null }),
    ]);

    if (mpnRes.error && mfrRes.error) {
      console.warn('Atlas search error:', mpnRes.error.message || mfrRes.error?.message);
      return { type: 'none', matches: [] };
    }

    // Merge + dedup by id — replaces the single .or() round trip with two
    // targeted queries. Safer than string-escaping variants into an .or() clause.
    const byId = new Map<string, AtlasProductRow>();
    for (const row of (mpnRes.data ?? []) as AtlasProductRow[]) byId.set(row.id, row);
    for (const row of (mfrRes.data ?? []) as AtlasProductRow[]) byId.set(row.id, row);
    const data = [...byId.values()];

    if (data.length === 0) {
      return { type: 'none', matches: [] };
    }

    // Filter out disabled manufacturers, then trim to 50 (matches the merged
    // SEARCH_RESULT_CAP in partDataService — used to be 20, which caused
    // silent drops when many MFRs share the same MPN prefix).
    const disabled = await getDisabledManufacturers();
    const filtered = disabled.size > 0
      ? data.filter((row) => !disabled.has(row.manufacturer))
      : data;
    const trimmed = filtered.slice(0, 50);

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
 *
 * When `manufacturer` is provided, the lookup is INTERSECTED with the
 * resolved canonical's variant set — necessary when multiple MFRs ship the
 * same MPN (e.g. 1.5KE100 is in Atlas from Galaxy, AK, LGE, Pingwei). Without
 * the filter, the bare `.ilike(mpn).limit(1)` picks an arbitrary row, which
 * is wrong whenever the user explicitly clicked one specific MFR's card.
 */
export async function getAtlasAttributes(
  mpn: string,
  manufacturer?: string,
): Promise<PartAttributes | null> {
  try {
    const supabase = await createClient();

    const aliasMatch = manufacturer ? await resolveManufacturerAlias(manufacturer) : null;

    let query = supabase
      .from('atlas_products')
      .select('*')
      .ilike('mpn', mpn);

    if (aliasMatch) {
      query = query.in('manufacturer', aliasMatch.variants);
    } else if (manufacturer) {
      // No alias hit — fall back to substring match so Western MFRs not in
      // atlas_manufacturers still narrow the lookup.
      query = query.ilike('manufacturer', `%${manufacturer}%`);
    }

    const { data, error } = await query.limit(1).single();

    if (error || !data) return null;

    // Skip disabled manufacturers
    const disabled = await getDisabledManufacturers();
    if (disabled.has((data as AtlasProductRow).manufacturer)) return null;

    const overrides = await fetchAllDictOverrides();
    return rowToPartAttributes(data as AtlasProductRow, overrides);
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

    const overrides = await fetchAllDictOverrides();
    return data.map((row: AtlasProductRow) => rowToPartAttributes(row, overrides));
  } catch (error) {
    console.warn('Atlas candidate fetch failed:', error);
    return [];
  }
}
