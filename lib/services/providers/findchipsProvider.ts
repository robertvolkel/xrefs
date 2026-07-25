/**
 * FindChips provider adapter — a COMMERCIAL provider (multi-distributor
 * price/stock/lifecycle/compliance). Byte-identical delegation to the fetch+map
 * portion of the orchestrator's former enrichWithFindchips.
 *
 * The fc/oems SOURCE SELECTION (Atlas vs Western) stays in the orchestrator — it
 * needs resolveManufacturerAlias, which a provider must NOT import. The resolved
 * `source` is passed in. UNUSED in Phase 1; Phase 3 routes getCommercial through it.
 *
 * (Mouser is intentionally NOT a provider — its only live use is the pure string
 * helper resolveMouserSuggestedMpn, which stays in the orchestrator.)
 */

import {
  isFindchipsConfigured,
  hasFindchipsBudget,
  getFindchipsResults,
  getCachedDistributorCounts,
} from '../findchipsClient';
import { mapFCToQuotes, mapFCLifecycle, mapFCCompliance, filterFcResultsByMaker } from '../findchipsMapper';
import { reportServiceFailure } from '../serviceStatusTracker';
import type { LifecycleInfo, ComplianceData } from '../../types';
import type { CommercialProvider, ProviderCapabilities, CommercialData, CommercialSource } from './types';

const CAPABILITIES: ProviderCapabilities = {
  mpnLookup: false,
  keywordSearch: false,
  candidateFetch: false,
  facets: false,
  parametricFilter: false,
  equivalents: false,
  quotes: true,
  compliance: true,
  distributorCounts: true,
};

export const findchipsProvider: CommercialProvider = {
  id: 'findchips',
  kind: 'commercial',
  capabilities: CAPABILITIES,

  isConfigured: isFindchipsConfigured,

  // Mirrors enrichWithFindchips fetch+map. `source` is resolved by the orchestrator.
  async getCommercial(mpn: string, opts: { source: CommercialSource; userId?: string; manufacturer?: string | null }): Promise<CommercialData | null> {
    if (!isFindchipsConfigured() || !hasFindchipsBudget()) return null;

    try {
      const results = await getFindchipsResults(mpn, opts.userId, { source: opts.source });
      if (!results || results.length === 0) return null;

      // Mirror the inline enrichWithFindchips path: keep only this maker's offers so a shared MPN
      // doesn't attribute another company's price/buy-link to this part.
      const scoped = filterFcResultsByMaker(results, opts.manufacturer);
      const quotes = mapFCToQuotes(scoped, mpn);
      const lifecycle = mapFCLifecycle(scoped);
      const compliance = mapFCCompliance(scoped);

      const lifecycleInfos: LifecycleInfo[] = lifecycle ? [lifecycle] : [];
      const complianceEntries: ComplianceData[] = compliance ? [compliance] : [];

      return {
        supplierQuotes: quotes.length > 0 ? quotes : undefined,
        lifecycleInfo: lifecycleInfos.length > 0 ? lifecycleInfos : undefined,
        complianceData: complianceEntries.length > 0 ? complianceEntries : undefined,
      };
    } catch (error) {
      console.warn('[findchips] Enrichment failed for', mpn, error);
      reportServiceFailure('findchips', 'degraded', 'Enrichment failed');
      return null;
    }
  },

  async getDistributorCount(mpn: string, maker?: string | null): Promise<number | undefined> {
    // `maker` scopes the count to that manufacturer (a shared MPN mixes makers). The map
    // is keyed by LOWERCASED mpn (getCachedDistributorCounts → set(mpnLower)), so both the
    // maker-map key and the lookup lowercase — matching the original consumer.
    const counts = await getCachedDistributorCounts(
      [mpn],
      maker && maker.trim() ? { [mpn.toLowerCase()]: maker } : undefined,
    );
    return counts.get(mpn.toLowerCase());
  },
};
