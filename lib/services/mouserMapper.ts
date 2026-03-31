/**
 * Mouser API Response Mapper
 *
 * Converts MouserProduct data into internal multi-supplier types:
 * SupplierQuote, LifecycleInfo, ComplianceData.
 *
 * No parametric attribute mapping — Mouser returns zero electrical specs.
 */

import type {
  SupplierQuote,
  PriceBreak,
  LifecycleInfo,
  ComplianceData,
} from '../types';
import type { MouserProduct, MouserProductCompliance } from './mouserClient';

// ============================================================
// PRICE PARSING
// ============================================================

/**
 * Parse a Mouser price string into a numeric value.
 * Handles formats: "$0.73", "€0,56", "£1.20", "0.73", "$1,234.56"
 */
export function parseMouserPrice(priceStr: string): number | undefined {
  if (!priceStr) return undefined;

  // Strip currency symbols and whitespace
  const cleaned = priceStr.replace(/[^0-9.,]/g, '').trim();
  if (!cleaned) return undefined;

  // Handle European comma-as-decimal format (e.g., "0,56")
  // If there's exactly one comma and no period, treat comma as decimal
  const commaCount = (cleaned.match(/,/g) || []).length;
  const periodCount = (cleaned.match(/\./g) || []).length;

  let normalized: string;
  if (commaCount === 1 && periodCount === 0) {
    // European: "0,56" → "0.56"
    normalized = cleaned.replace(',', '.');
  } else if (commaCount === 1 && periodCount === 1) {
    // Thousands separator: "$1,234.56" → "1234.56"
    normalized = cleaned.replace(',', '');
  } else if (commaCount > 1) {
    // Multiple commas as thousands: "1,234,567.89" → "1234567.89"
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }

  const value = parseFloat(normalized);
  return isNaN(value) ? undefined : value;
}

// ============================================================
// QUOTE MAPPING
// ============================================================

/**
 * Map a MouserProduct to a SupplierQuote.
 */
export function mapMouserToQuote(product: MouserProduct): SupplierQuote {
  const priceBreaks: PriceBreak[] = product.PriceBreaks.map(pb => ({
    quantity: pb.Quantity,
    unitPrice: parseMouserPrice(pb.Price) ?? 0,
    currency: pb.Currency || 'USD',
  })).filter(pb => pb.unitPrice > 0);

  // unitPrice = qty-1 price if available, otherwise first (lowest-qty) break
  const qty1Break = priceBreaks.find(pb => pb.quantity === 1);
  const bestSinglePrice = qty1Break?.unitPrice ?? (priceBreaks.length > 0 ? priceBreaks[0].unitPrice : undefined);

  const stock = parseInt(product.AvailabilityInStock ?? '0', 10) || undefined;

  const availableOnOrder = product.AvailabilityOnOrder
    ?.filter(ao => ao.Quantity > 0)
    .map(ao => ({
      quantity: ao.Quantity,
      date: ao.Date,
    }));

  return {
    supplier: 'mouser',
    supplierPartNumber: product.MouserPartNumber || undefined,
    unitPrice: bestSinglePrice || (priceBreaks.length > 0 ? priceBreaks[0].unitPrice : undefined),
    priceBreaks,
    quantityAvailable: stock,
    availableOnOrder: availableOnOrder?.length ? availableOnOrder : undefined,
    leadTime: product.LeadTime && product.LeadTime !== '0 Days' ? product.LeadTime : undefined,
    productUrl: product.ProductDetailUrl || undefined,
    fetchedAt: new Date().toISOString(),
  };
}

// ============================================================
// LIFECYCLE MAPPING
// ============================================================

/**
 * Map Mouser lifecycle data to LifecycleInfo.
 * Returns null if no lifecycle info is available.
 */
export function mapMouserLifecycle(product: MouserProduct): LifecycleInfo | null {
  const status = product.LifecycleStatus;
  const isDiscontinued = product.IsDiscontinued === 'true' || product.IsDiscontinued === 'True';
  const suggestedReplacement = product.SuggestedReplacement || undefined;

  // Skip if no meaningful data
  if (!status && !isDiscontinued && !suggestedReplacement) return null;

  return {
    status: status || undefined,
    isDiscontinued: isDiscontinued || undefined,
    suggestedReplacement,
    source: 'mouser',
  };
}

// ============================================================
// COMPLIANCE MAPPING
// ============================================================

/** Maps Mouser ComplianceName to region code */
const COMPLIANCE_REGION_MAP: Record<string, string> = {
  USHTS: 'US',
  CNHTS: 'CN',
  CAHTS: 'CA',
  JPHTS: 'JP',
  KRHTS: 'KR',
  TARIC: 'EU',
  MXHTS: 'MX',
  BRHTS: 'BR',
};

/**
 * Map Mouser compliance data to ComplianceData.
 * Extracts regional HTS codes, ECCN, and RoHS status.
 * Returns null if no meaningful compliance data.
 */
export function mapMouserCompliance(product: MouserProduct): ComplianceData | null {
  const htsCodesByRegion: Record<string, string> = {};
  let eccnCode: string | undefined;

  if (product.ProductCompliance) {
    for (const entry of product.ProductCompliance) {
      if (entry.ComplianceName === 'ECCN') {
        eccnCode = entry.ComplianceValue;
      } else {
        const region = COMPLIANCE_REGION_MAP[entry.ComplianceName];
        if (region) {
          htsCodesByRegion[region] = entry.ComplianceValue;
        }
      }
    }
  }

  const rohsStatus = product.ROHSStatus || undefined;
  const hasHts = Object.keys(htsCodesByRegion).length > 0;

  if (!rohsStatus && !eccnCode && !hasHts) return null;

  return {
    rohsStatus,
    eccnCode,
    htsCodesByRegion: hasHts ? htsCodesByRegion : undefined,
    source: 'mouser',
  };
}

/**
 * Build a Digikey SupplierQuote from existing Part fields.
 * Uses real quantity-based price breaks from Digikey's StandardPricing
 * when available; falls back to a single qty-1 break from UnitPrice.
 */
export function buildDigikeyQuote(part: {
  unitPrice?: number;
  quantityAvailable?: number;
  digikeyPartNumber?: string;
  productUrl?: string;
  digikeyPriceBreaks?: PriceBreak[];
}): SupplierQuote {
  // Prefer real price breaks from Digikey API; fall back to synthetic single-tier
  let priceBreaks: PriceBreak[];
  if (part.digikeyPriceBreaks && part.digikeyPriceBreaks.length > 0) {
    priceBreaks = part.digikeyPriceBreaks;
  } else if (part.unitPrice != null) {
    priceBreaks = [{ quantity: 1, unitPrice: part.unitPrice, currency: 'USD' }];
  } else {
    priceBreaks = [];
  }

  return {
    supplier: 'digikey',
    supplierPartNumber: part.digikeyPartNumber,
    unitPrice: part.unitPrice,
    priceBreaks,
    quantityAvailable: part.quantityAvailable,
    productUrl: part.productUrl,
    fetchedAt: new Date().toISOString(),
  };
}
