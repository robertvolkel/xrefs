/**
 * Digikey provider adapter — a CATALOG provider with the optional PARAMETRIC
 * capability. Byte-identical delegation to digikeyClient + digikeyMapper; it adds
 * NO logic of its own. UNUSED in Phase 1 (the orchestrator still calls the client
 * directly); Phases 2/4 route getByMpn / searchByKeyword through it.
 *
 * `fetchCandidates` is intentionally OMITTED (capabilities.candidateFetch=false):
 * Digikey candidate generation is the deferred parametric-widening island still
 * owned by partDataService. The parametric primitives below are the seam the
 * future convergence + Family Value Catalog build against.
 */

import {
  keywordSearch,
  getProductDetails,
  getCategoryParametricFacets,
  parametricFilterSearch,
  checkDigikeyHealth,
  isDigikeyConfigured,
} from '../digikeyClient';
import {
  mapDigikeyProductToAttributes,
  mapKeywordResponseToSearchResult,
  mapKeywordResponseToAttributesByMpn,
} from '../digikeyMapper';
import { resolveCategoryIdsForFamily } from '../greenfieldParametricFetch';
import { reportServiceFailure } from '../serviceStatusTracker';
import type { PartAttributes, ServiceStatusInfo } from '../../types';
import type {
  ParametricCatalogProvider,
  ProviderCapabilities,
  LookupOpts,
  KeywordSearchOpts,
  CatalogSearchResult,
  CategoryRef,
  FacetSet,
} from './types';

const CAPABILITIES: ProviderCapabilities = {
  mpnLookup: true,
  keywordSearch: true,
  candidateFetch: false, // deferred parametric-widening island stays in the orchestrator
  facets: true,
  parametricFilter: true,
  equivalents: false,
  quotes: false,
  compliance: false,
  distributorCounts: false,
};

function categoryId(cat: CategoryRef): number {
  return (cat.raw as { categoryId: number }).categoryId;
}

export const digikeyProvider: ParametricCatalogProvider = {
  id: 'digikey',
  kind: 'catalog',
  capabilities: CAPABILITIES,

  isConfigured: isDigikeyConfigured,
  checkHealth: (): Promise<ServiceStatusInfo> => checkDigikeyHealth(),

  // Mirrors getAttributesRaw's Digikey branch (details → keyword-prefix fallback),
  // MINUS enrichSourceInParallel (the orchestrator enriches the returned attrs).
  async getByMpn(mpn: string, opts?: LookupOpts): Promise<PartAttributes | null> {
    const currency = opts?.currency;
    const userId = opts?.userId;

    try {
      const response = await getProductDetails(mpn, currency, userId);
      if (response.Product) {
        return { ...mapDigikeyProductToAttributes(response.Product), dataSource: 'digikey' as const };
      }
    } catch {
      console.warn('Digikey product details lookup failed for', mpn, '— trying keyword search fallback');
      reportServiceFailure('digikey', 'unavailable', 'Product details failed');
    }

    // Fallback: keyword search by MPN (exact then prefix match, e.g. "BC857C" → "BC857C,115").
    try {
      const searchResponse = await keywordSearch(mpn, { limit: 5 }, currency, userId);
      const lowerMpn = mpn.toLowerCase();
      const match =
        searchResponse.Products?.find((p) => p.ManufacturerProductNumber?.toLowerCase() === lowerMpn) ??
        searchResponse.Products?.find((p) => p.ManufacturerProductNumber?.toLowerCase().startsWith(lowerMpn));
      if (match) {
        return { ...mapDigikeyProductToAttributes(match), dataSource: 'digikey' as const };
      }
    } catch {
      console.warn('Digikey keyword search fallback also failed for', mpn);
      reportServiceFailure('digikey', 'unavailable', 'Search fallback failed');
    }

    return null;
  },

  // ⚠ ERROR CONTRACT (Phase 4 wiring): unlike getByMpn, this does NOT internalize
  // a try/catch — it can THROW if keywordSearch rejects. That mirrors its inline
  // origin (the searchParts Digikey branch), whose errors are absorbed by the
  // caller's `Promise.allSettled` fan-out. Phase 4 MUST wire this inside that same
  // allSettled (never a bare await), or a Digikey outage will abort the whole
  // search instead of that one source contributing nothing — a behavior change.
  async searchByKeyword(query: string, opts?: KeywordSearchOpts): Promise<CatalogSearchResult> {
    const catId =
      opts?.category && typeof (opts.category.raw as { categoryId?: number })?.categoryId === 'number'
        ? categoryId(opts.category)
        : undefined;
    const response = await keywordSearch(query, { limit: opts?.limit ?? 20, categoryId: catId }, opts?.currency, opts?.userId);
    return {
      result: mapKeywordResponseToSearchResult(response),
      attrsByMpn: opts?.buildAttrs ? mapKeywordResponseToAttributesByMpn(response) : undefined,
    };
  },

  // ── Parametric capability (thin pass-throughs — nothing routes here yet) ──
  async resolveCategoryRefs(familyId: string): Promise<CategoryRef[]> {
    const ids = await resolveCategoryIdsForFamily(familyId);
    return ids.map((id) => ({ provider: 'digikey' as const, raw: { categoryId: id }, label: String(id) }));
  },

  async discoverFacets(cat: CategoryRef, keyword = '', opts?: LookupOpts): Promise<FacetSet> {
    const { facets } = await getCategoryParametricFacets(keyword, categoryId(cat), opts?.currency, opts?.userId);
    return {
      facets: facets.map((f) => ({
        parameterId: String(f.ParameterId),
        parameterName: f.ParameterName,
        values: f.FilterValues.map((v) => ({ valueId: v.ValueId, valueName: v.ValueName, productCount: v.ProductCount })),
      })),
    };
  },

  async filterByValues(
    cat: CategoryRef,
    parameterId: string,
    valueIds: string[],
    opts?: LookupOpts & { limit?: number },
  ): Promise<PartAttributes[]> {
    const response = await parametricFilterSearch(
      categoryId(cat),
      Number(parameterId),
      valueIds,
      { limit: opts?.limit ?? 25 },
      opts?.currency,
      opts?.userId,
    );
    return (response.Products ?? []).map((p) => ({ ...mapDigikeyProductToAttributes(p), dataSource: 'digikey' as const }));
  },
};
