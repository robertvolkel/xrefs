/**
 * Atlas provider adapter — a CATALOG provider, DB-only (Supabase-ingested Chinese-
 * MFR rows). Pure pass-through: atlasClient already returns internal types with
 * `dataSource:'atlas'` set. NO facets / parametric-filter (capabilities false) —
 * `isParametricProvider(atlasProvider)` is false, so parametric callers degrade
 * exactly as they do today when no facet source is present.
 *
 * UNUSED in Phase 1. Phases 4/5 route searchByKeyword / fetchCandidates through it.
 */

import {
  searchAtlasProducts,
  getAtlasAttributes,
  fetchAtlasCandidates,
  type AtlasCandidateWidening,
} from '../atlasClient';
import type { PartAttributes } from '../../types';
import type {
  CatalogProvider,
  ProviderCapabilities,
  LookupOpts,
  KeywordSearchOpts,
  CatalogSearchResult,
  CandidateRequest,
} from './types';

const CAPABILITIES: ProviderCapabilities = {
  mpnLookup: true,
  keywordSearch: true,
  candidateFetch: true,
  facets: false,          // Atlas has no facet discovery
  parametricFilter: false, // only a single-attribute numeric-band RPC (used via fetchCandidates.widen)
  equivalents: false,
  quotes: false,
  compliance: true,        // rows carry rohs/reach/eccn/hts on Part
  distributorCounts: false,
};

export const atlasProvider: CatalogProvider = {
  id: 'atlas',
  kind: 'catalog',
  capabilities: CAPABILITIES,

  // Atlas is the persistent store itself (Supabase); "configured" = Supabase URL
  // AND an anon key present (URL alone doesn't make a query succeed).
  isConfigured: () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),

  getByMpn(mpn: string, opts?: LookupOpts): Promise<PartAttributes | null> {
    // getAtlasAttributes already sets dataSource:'atlas'.
    return getAtlasAttributes(mpn, opts?.manufacturer);
  },

  async searchByKeyword(query: string, opts?: KeywordSearchOpts): Promise<CatalogSearchResult> {
    const { result, attrsByMpn } = await searchAtlasProducts(query, opts?.manufacturer, !!opts?.buildAttrs);
    return { result, attrsByMpn };
  },

  fetchCandidates(req: CandidateRequest): Promise<PartAttributes[]> {
    const widen: AtlasCandidateWidening | undefined = req.widen
      ? { attrId: req.widen.attributeId, lo: req.widen.lo, hi: req.widen.hi, sourceNv: req.widen.sourceValue }
      : undefined;
    return fetchAtlasCandidates(req.familyId, widen);
  },
};
