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
import { mapFCToQuotes, mapFCLifecycle, mapFCCompliance } from '../findchipsMapper';
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
  async getCommercial(mpn: string, opts: { source: CommercialSource; userId?: string }): Promise<CommercialData | null> {
    if (!isFindchipsConfigured() || !hasFindchipsBudget()) return null;

    try {
      const results = await getFindchipsResults(mpn, opts.userId, { source: opts.source });
      if (!results || results.length === 0) return null;

      const quotes = mapFCToQuotes(results, mpn);
      const lifecycle = mapFCLifecycle(results);
      const compliance = mapFCCompliance(results);

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

  async getDistributorCount(mpn: string): Promise<number | undefined> {
    const counts = await getCachedDistributorCounts([mpn]);
    return counts.get(mpn);
  },
};
