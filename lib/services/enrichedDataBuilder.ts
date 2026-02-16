/**
 * Builds a storage-friendly EnrichedPartData from PartAttributes.
 *
 * EnrichedPartData is a flat structure optimized for column views — it drops
 * numericValue/unit/sortOrder that are only needed by the matching engine.
 */

import { PartAttributes, EnrichedPartData } from '../types';

export function buildEnrichedData(attrs: PartAttributes): EnrichedPartData {
  const params: Record<string, { name: string; value: string }> = {};
  for (const p of attrs.parameters) {
    params[p.parameterId] = { name: p.parameterName, value: p.value };
  }

  return {
    digikeyPartNumber: attrs.part.digikeyPartNumber,
    productUrl: attrs.part.productUrl,
    category: attrs.part.category,
    subcategory: attrs.part.subcategory,
    parameters: params,
    datasheetUrl: attrs.part.datasheetUrl,
    photoUrl: attrs.part.imageUrl,
    unitPrice: attrs.part.unitPrice,
    quantityAvailable: attrs.part.quantityAvailable,
    productStatus: attrs.part.status,
    rohsStatus: attrs.part.rohsStatus,
    moistureSensitivityLevel: attrs.part.moistureSensitivityLevel,
  };
}
