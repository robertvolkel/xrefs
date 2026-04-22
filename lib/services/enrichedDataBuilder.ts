/**
 * Builds a storage-friendly EnrichedPartData from PartAttributes.
 *
 * EnrichedPartData is a flat structure optimized for column views — it drops
 * numericValue/unit/sortOrder that are only needed by the matching engine.
 * Captures data from all sources (Digikey, Parts.io, Atlas).
 */

import { PartAttributes, EnrichedPartData } from '../types';

export function buildEnrichedData(attrs: PartAttributes): EnrichedPartData {
  const params: Record<string, { name: string; value: string; source?: string }> = {};
  for (const p of attrs.parameters) {
    params[p.parameterId] = { name: p.parameterName, value: p.value, source: p.source };
  }

  return {
    // Product Identification
    mpn: attrs.part.mpn,
    manufacturer: attrs.part.manufacturer,
    digikeyPartNumber: attrs.part.digikeyPartNumber,
    productUrl: attrs.part.productUrl,
    category: attrs.part.category,
    subcategory: attrs.part.subcategory,
    parameters: params,
    // Documentation
    datasheetUrl: attrs.part.datasheetUrl,
    photoUrl: attrs.part.imageUrl,
    // Commercial
    unitPrice: attrs.part.unitPrice,
    quantityAvailable: attrs.part.quantityAvailable,
    productStatus: attrs.part.status,
    factoryLeadTimeWeeks: attrs.part.factoryLeadTimeWeeks,
    // Compliance
    rohsStatus: attrs.part.rohsStatus,
    moistureSensitivityLevel: attrs.part.moistureSensitivityLevel,
    reachCompliance: attrs.part.reachCompliance,
    qualifications: attrs.part.qualifications,
    // Risk & Lifecycle
    yteol: attrs.part.yteol,
    riskRank: attrs.part.riskRank,
    partLifecycleCode: attrs.part.status,
    // Trade & Export
    countryOfOrigin: attrs.part.countryOfOrigin,
    eccnCode: attrs.part.eccnCode,
    htsCode: attrs.part.htsCode,
    // Multi-supplier commercial data
    supplierQuotes: attrs.part.supplierQuotes,
    lifecycleInfo: attrs.part.lifecycleInfo,
    complianceData: attrs.part.complianceData,
  };
}
