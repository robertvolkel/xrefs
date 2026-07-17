/**
 * Parts.io provider adapter — an ENRICHMENT provider (gap-fill parametric +
 * lifecycle metadata, plus FFF/functional equivalents). Byte-identical delegation
 * to the orchestrator's former enrichWithPartsio / fetchPartsioEquivalents logic;
 * the shared extractPartsioLifecycle lives in partsioMapper.
 *
 * UNUSED in Phase 1. Phases 3/5 route enrich / getEquivalents through it.
 * Digikey/base values always win — enrich only fills gaps.
 */

import {
  isPartsioConfigured,
  getPartsioProductDetails,
  extractEquivalentMpns,
  mapPartsioStatus,
  checkPartsioHealth,
} from '../partsioClient';
import { mapPartsioProductToAttributes, extractPartsioLifecycle } from '../partsioMapper';
import { reportServiceFailure } from '../serviceStatusTracker';
import type { PartAttributes, ServiceStatusInfo } from '../../types';
import type { EnrichmentProvider, ProviderCapabilities } from './types';

const CAPABILITIES: ProviderCapabilities = {
  mpnLookup: false,
  keywordSearch: false,
  candidateFetch: false,
  facets: false,
  parametricFilter: false,
  equivalents: true,
  quotes: false,
  compliance: true, // listings carry reach/eccn/hts/coo (mapped onto Part fields)
  distributorCounts: false,
};

export const partsioProvider: EnrichmentProvider = {
  id: 'partsio',
  kind: 'enrichment',
  capabilities: CAPABILITIES,

  isConfigured: isPartsioConfigured,
  checkHealth: (): Promise<ServiceStatusInfo> => checkPartsioHealth(),

  // Mirrors enrichWithPartsio: gap-fill only (missing parameterIds + null Part fields).
  async enrich(attrs: PartAttributes, userId?: string): Promise<PartAttributes> {
    if (!isPartsioConfigured()) return attrs;

    try {
      const listing = await getPartsioProductDetails(attrs.part.mpn, userId);
      if (!listing) return attrs;

      const partsioParams = mapPartsioProductToAttributes(listing);
      const existingIds = new Set(attrs.parameters.map((p) => p.parameterId));
      const gapFills = partsioParams.filter((p) => !existingIds.has(p.parameterId));

      const lifecycle = extractPartsioLifecycle(listing);
      const enrichedPart = { ...attrs.part };
      let partChanged = false;
      for (const [key, value] of Object.entries(lifecycle)) {
        if ((enrichedPart as Record<string, unknown>)[key] == null) {
          (enrichedPart as Record<string, unknown>)[key] = value;
          partChanged = true;
        }
      }

      if (gapFills.length === 0 && !partChanged) return attrs;

      return {
        ...attrs,
        part: partChanged ? enrichedPart : attrs.part,
        parameters: gapFills.length > 0 ? [...attrs.parameters, ...gapFills] : attrs.parameters,
        enrichedFrom: 'partsio',
      };
    } catch (error) {
      console.warn('Parts.io enrichment failed for', attrs.part.mpn, error);
      reportServiceFailure('partsio', 'degraded', 'Enrichment failed');
      return attrs;
    }
  },

  // Mirrors fetchPartsioEquivalents: FFF/functional cross-refs → scorable attrs.
  async getEquivalents(mpn: string, userId?: string): Promise<PartAttributes[]> {
    if (!isPartsioConfigured()) return [];

    const listing = await getPartsioProductDetails(mpn, userId);
    if (!listing) return [];

    const equivalents = extractEquivalentMpns(listing, mpn, 10);
    if (equivalents.length === 0) return [];

    const results = await Promise.all(
      equivalents.map(async ({ mpn: eqMpn, type }) => {
        try {
          const eqListing = await getPartsioProductDetails(eqMpn, userId);
          if (!eqListing) return null;

          const parameters = mapPartsioProductToAttributes(eqListing);
          return {
            part: {
              mpn: eqListing['Manufacturer Part Number'] || eqMpn,
              manufacturer: eqListing.Manufacturer || 'Unknown',
              description: eqListing.Description || '',
              detailedDescription: eqListing.Description || '',
              status: mapPartsioStatus(eqListing['Part Life Cycle Code']),
              subcategory: eqListing.Category || eqListing.Class || '',
              ...extractPartsioLifecycle(eqListing),
            },
            parameters,
            dataSource: 'partsio' as const,
            equivalenceType: type,
          } as PartAttributes;
        } catch {
          return null;
        }
      }),
    );

    return results.filter((r): r is PartAttributes => r !== null);
  },
};
