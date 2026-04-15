/**
 * FindChips Response Mapper
 *
 * Converts FC API distributor results into internal SupplierQuote[],
 * LifecycleInfo, and ComplianceData types. One SupplierQuote per distributor,
 * selecting the best-matching part entry per distributor.
 */

import type { SupplierQuote, PriceBreak, LifecycleInfo, ComplianceData } from '@/lib/types';
import type { FCDistributorResult, FCPart } from './findchipsClient';

// ============================================================
// DISTRIBUTOR NAME NORMALIZATION
// ============================================================

const DISTRIBUTOR_NAME_MAP: Record<string, string> = {
  'digi-key': 'digikey',
  'digi-key electronics': 'digikey',
  'digikey': 'digikey',
  'mouser electronics': 'mouser',
  'mouser': 'mouser',
  'arrow electronics': 'arrow',
  'arrow': 'arrow',
  'lcsc': 'lcsc',
  'element14 asia-pacific': 'element14',
  'element14': 'element14',
  'newark': 'newark',
  'newark electronics': 'newark',
  'farnell': 'farnell',
  'rs': 'rs',
  'rs components': 'rs',
  'tme': 'tme',
  'avnet': 'avnet',
  'avnet americas': 'avnet',
  'avnet abacus': 'avnet-abacus',
  'avnet asia': 'avnet-asia',
  'future electronics': 'future',
  'rochester electronics': 'rochester',
  'rutronik': 'rutronik',
  'verical': 'verical',
  'chip one stop': 'chip1stop',
  'onlinecomponents.com': 'onlinecomponents',
};

/** Normalize FC distributor name to a stable lowercase key. */
export function normalizeDistributorName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (DISTRIBUTOR_NAME_MAP[lower]) return DISTRIBUTOR_NAME_MAP[lower];

  // Strip common suffixes and try again
  const stripped = lower
    .replace(/,?\s*(inc\.?|ltd\.?|co\.?|llc|gmbh|pte|limited|corporation|electronics)$/g, '')
    .trim();
  if (DISTRIBUTOR_NAME_MAP[stripped]) return DISTRIBUTOR_NAME_MAP[stripped];

  // Fallback: lowercase with spaces replaced by hyphens
  return stripped.replace(/\s+/g, '-');
}

// ============================================================
// BEST PART SELECTION
// ============================================================

/**
 * From a distributor's part list, select the best entry for a given MPN.
 * Prefers exact MPN match → most price breaks → highest stock.
 */
function selectBestPart(parts: FCPart[], targetMpn: string): FCPart | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  const targetLower = targetMpn.toLowerCase();

  // Sort: exact match first, then by price breaks count desc, then stock desc
  const sorted = [...parts].sort((a, b) => {
    const aExact = a.part.toLowerCase() === targetLower ? 1 : 0;
    const bExact = b.part.toLowerCase() === targetLower ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    // Prefer entries with pricing
    if (a.price.length !== b.price.length) return b.price.length - a.price.length;

    // Prefer higher stock
    return (b.stock ?? 0) - (a.stock ?? 0);
  });

  return sorted[0];
}

// ============================================================
// QUOTE MAPPING
// ============================================================

/**
 * Map FC distributor results to SupplierQuote[].
 * One quote per distributor, sorted by best unit price ascending.
 */
export function mapFCToQuotes(results: FCDistributorResult[], mpn: string): SupplierQuote[] {
  const quotes: SupplierQuote[] = [];
  const now = new Date().toISOString();

  for (const dist of results) {
    if (!dist.parts || dist.parts.length === 0) continue;

    const best = selectBestPart(dist.parts, mpn);
    if (!best) continue;

    // Build price breaks
    const priceBreaks: PriceBreak[] = best.price
      .filter(p => p.price > 0)
      .map(p => ({
        quantity: p.quantity,
        unitPrice: p.price,
        currency: p.currency || 'USD',
      }))
      .sort((a, b) => a.quantity - b.quantity);

    // Unit price = lowest quantity price break (or first)
    const unitPrice = priceBreaks.length > 0
      ? priceBreaks[0].unitPrice
      : undefined;

    quotes.push({
      supplier: normalizeDistributorName(dist.distributor.name),
      supplierPartNumber: best.distributorItemNo,
      unitPrice,
      priceBreaks,
      quantityAvailable: best.stock ?? undefined,
      leadTime: best.leadTime,
      productUrl: best.buyNowUrl,
      fetchedAt: now,
      packageType: best.packageType,
      minimumQuantity: best.minimumQuantity,
      authorized: dist.distributor.authorized,
    });
  }

  // Sort by unit price ascending (best price first); no-price quotes at end
  quotes.sort((a, b) => {
    if (a.unitPrice == null && b.unitPrice == null) return 0;
    if (a.unitPrice == null) return 1;
    if (b.unitPrice == null) return -1;
    return a.unitPrice - b.unitPrice;
  });

  return quotes;
}

// ============================================================
// LIFECYCLE MAPPING
// ============================================================

/**
 * Extract lifecycle info from FC results.
 * Takes the first part entry with a non-empty partLifecycleCode.
 * Risk scores are part-level (same across distributors).
 */
export function mapFCLifecycle(results: FCDistributorResult[]): LifecycleInfo | null {
  for (const dist of results) {
    for (const part of dist.parts) {
      if (part.partLifecycleCode && part.partLifecycleCode.length > 0) {
        return {
          status: part.partLifecycleCode,
          isDiscontinued: part.partLifecycleCode === 'obsolete',
          source: 'findchips',
          riskRank: part.riskRank,
          designRisk: part.designRisk,
          productionRisk: part.productionRisk,
          longTermRisk: part.longTermRisk,
        };
      }
    }
  }

  // Even if no lifecycle code, check for risk scores
  for (const dist of results) {
    for (const part of dist.parts) {
      if (part.riskRank != null) {
        return {
          source: 'findchips',
          riskRank: part.riskRank,
          designRisk: part.designRisk,
          productionRisk: part.productionRisk,
          longTermRisk: part.longTermRisk,
        };
      }
    }
  }

  return null;
}

// ============================================================
// COMPLIANCE MAPPING
// ============================================================

/**
 * Extract compliance data from FC results.
 * FC provides RoHS status but NOT HTS codes or ECCN (partsio covers those).
 */
export function mapFCCompliance(results: FCDistributorResult[]): ComplianceData | null {
  for (const dist of results) {
    for (const part of dist.parts) {
      const rohsStatus = part.rohs?.DEFAULT;
      if (rohsStatus) {
        return {
          rohsStatus,
          source: 'findchips',
        };
      }
    }
  }
  return null;
}
