/**
 * Tests for mouserMapper.ts — converts Mouser API responses
 * into internal SupplierQuote, LifecycleInfo, and ComplianceData types.
 */

import {
  parseMouserPrice,
  mapMouserToQuote,
  mapMouserLifecycle,
  mapMouserCompliance,
  buildDigikeyQuote,
} from '@/lib/services/mouserMapper';
import type { MouserProduct } from '@/lib/services/mouserClient';

// ============================================================
// HELPERS
// ============================================================

function makeMouserProduct(overrides: Partial<MouserProduct> = {}): MouserProduct {
  return {
    MouserPartNumber: '511-LM317T',
    ManufacturerPartNumber: 'LM317T',
    Manufacturer: 'STMicroelectronics',
    Description: 'Linear Voltage Regulators 1.2-37V Adj Positive 1.5 Amp Output',
    Category: 'Linear Voltage Regulators',
    PriceBreaks: [
      { Quantity: 1, Price: '$0.56', Currency: 'USD' },
      { Quantity: 10, Price: '$0.397', Currency: 'USD' },
      { Quantity: 100, Price: '$0.31', Currency: 'USD' },
    ],
    AvailabilityInStock: '37444',
    LeadTime: '98 Days',
    ROHSStatus: 'RoHS Compliant By Exemption',
    ProductDetailUrl: 'https://www.mouser.com/ProductDetail/STMicroelectronics/LM317T',
    ProductCompliance: [
      { ComplianceName: 'USHTS', ComplianceValue: '8542390090' },
      { ComplianceName: 'CNHTS', ComplianceValue: '8542399000' },
      { ComplianceName: 'TARIC', ComplianceValue: '8542319000' },
      { ComplianceName: 'ECCN', ComplianceValue: 'EAR99' },
    ],
    ...overrides,
  };
}

// ============================================================
// parseMouserPrice
// ============================================================

describe('parseMouserPrice', () => {
  it('parses USD prices', () => {
    expect(parseMouserPrice('$0.56')).toBe(0.56);
    expect(parseMouserPrice('$1.41')).toBe(1.41);
    expect(parseMouserPrice('$0.007')).toBe(0.007);
  });

  it('parses European comma-decimal prices', () => {
    expect(parseMouserPrice('€0,56')).toBe(0.56);
    expect(parseMouserPrice('£1,20')).toBe(1.2);
  });

  it('parses prices with thousands separators', () => {
    expect(parseMouserPrice('$1,234.56')).toBe(1234.56);
    expect(parseMouserPrice('$1,234,567.89')).toBe(1234567.89);
  });

  it('parses bare numeric strings', () => {
    expect(parseMouserPrice('0.73')).toBe(0.73);
  });

  it('returns undefined for empty/invalid', () => {
    expect(parseMouserPrice('')).toBeUndefined();
    expect(parseMouserPrice('N/A')).toBeUndefined();
  });
});

// ============================================================
// mapMouserToQuote
// ============================================================

describe('mapMouserToQuote', () => {
  it('maps a fully-stocked product to SupplierQuote', () => {
    const product = makeMouserProduct();
    const quote = mapMouserToQuote(product);

    expect(quote.supplier).toBe('mouser');
    expect(quote.supplierPartNumber).toBe('511-LM317T');
    expect(quote.unitPrice).toBe(0.56);
    expect(quote.priceBreaks).toHaveLength(3);
    expect(quote.priceBreaks[0]).toEqual({ quantity: 1, unitPrice: 0.56, currency: 'USD' });
    expect(quote.priceBreaks[2]).toEqual({ quantity: 100, unitPrice: 0.31, currency: 'USD' });
    expect(quote.quantityAvailable).toBe(37444);
    expect(quote.leadTime).toBe('98 Days');
    expect(quote.productUrl).toContain('mouser.com');
    expect(quote.fetchedAt).toBeTruthy();
  });

  it('handles zero-stock products', () => {
    const product = makeMouserProduct({
      AvailabilityInStock: '0',
      PriceBreaks: [],
    });
    const quote = mapMouserToQuote(product);

    expect(quote.quantityAvailable).toBeUndefined();
    expect(quote.unitPrice).toBeUndefined();
    expect(quote.priceBreaks).toHaveLength(0);
  });

  it('handles null stock', () => {
    const product = makeMouserProduct({ AvailabilityInStock: null });
    const quote = mapMouserToQuote(product);
    expect(quote.quantityAvailable).toBeUndefined();
  });

  it('omits "0 Days" lead time', () => {
    const product = makeMouserProduct({ LeadTime: '0 Days' });
    const quote = mapMouserToQuote(product);
    expect(quote.leadTime).toBeUndefined();
  });

  it('maps on-order availability', () => {
    const product = makeMouserProduct({
      AvailabilityOnOrder: [
        { Quantity: 5000, Date: '2026-04-15T00:00:00' },
      ],
    });
    const quote = mapMouserToQuote(product);
    expect(quote.availableOnOrder).toHaveLength(1);
    expect(quote.availableOnOrder![0].quantity).toBe(5000);
  });

  it('filters zero-quantity on-order entries', () => {
    const product = makeMouserProduct({
      AvailabilityOnOrder: [
        { Quantity: 0, Date: '2026-04-15T00:00:00' },
        { Quantity: 1000, Date: '2026-05-01T00:00:00' },
      ],
    });
    const quote = mapMouserToQuote(product);
    expect(quote.availableOnOrder).toHaveLength(1);
  });

  it('uses lowest single-qty price as unitPrice', () => {
    const product = makeMouserProduct({
      PriceBreaks: [
        { Quantity: 1, Price: '$0.56', Currency: 'USD' },
        { Quantity: 10, Price: '$0.40', Currency: 'USD' },
      ],
    });
    const quote = mapMouserToQuote(product);
    expect(quote.unitPrice).toBe(0.56);
  });

  it('falls back to first price break when no qty-1 exists', () => {
    const product = makeMouserProduct({
      PriceBreaks: [
        { Quantity: 5000, Price: '$0.25', Currency: 'USD' },
      ],
    });
    const quote = mapMouserToQuote(product);
    expect(quote.unitPrice).toBe(0.25);
  });
});

// ============================================================
// mapMouserLifecycle
// ============================================================

describe('mapMouserLifecycle', () => {
  it('maps obsolete product with suggested replacement', () => {
    const product = makeMouserProduct({
      LifecycleStatus: 'Obsolete',
      IsDiscontinued: 'true',
      SuggestedReplacement: '863-LM317TG',
    });
    const info = mapMouserLifecycle(product);

    expect(info).not.toBeNull();
    expect(info!.status).toBe('Obsolete');
    expect(info!.isDiscontinued).toBe(true);
    expect(info!.suggestedReplacement).toBe('863-LM317TG');
    expect(info!.source).toBe('mouser');
  });

  it('maps End of Life status', () => {
    const product = makeMouserProduct({ LifecycleStatus: 'End of Life' });
    const info = mapMouserLifecycle(product);
    expect(info!.status).toBe('End of Life');
  });

  it('returns null when no lifecycle data', () => {
    const product = makeMouserProduct({
      LifecycleStatus: null,
      IsDiscontinued: undefined,
      SuggestedReplacement: '',
    });
    expect(mapMouserLifecycle(product)).toBeNull();
  });

  it('handles IsDiscontinued = "True" (capitalized)', () => {
    const product = makeMouserProduct({ IsDiscontinued: 'True' });
    const info = mapMouserLifecycle(product);
    expect(info!.isDiscontinued).toBe(true);
  });
});

// ============================================================
// mapMouserCompliance
// ============================================================

describe('mapMouserCompliance', () => {
  it('extracts HTS codes by region', () => {
    const product = makeMouserProduct();
    const compliance = mapMouserCompliance(product);

    expect(compliance).not.toBeNull();
    expect(compliance!.htsCodesByRegion).toEqual({
      US: '8542390090',
      CN: '8542399000',
      EU: '8542319000',
    });
    expect(compliance!.eccnCode).toBe('EAR99');
    expect(compliance!.rohsStatus).toBe('RoHS Compliant By Exemption');
    expect(compliance!.source).toBe('mouser');
  });

  it('maps all 8 HTS regions', () => {
    const product = makeMouserProduct({
      ProductCompliance: [
        { ComplianceName: 'USHTS', ComplianceValue: '111' },
        { ComplianceName: 'CNHTS', ComplianceValue: '222' },
        { ComplianceName: 'CAHTS', ComplianceValue: '333' },
        { ComplianceName: 'JPHTS', ComplianceValue: '444' },
        { ComplianceName: 'KRHTS', ComplianceValue: '555' },
        { ComplianceName: 'TARIC', ComplianceValue: '666' },
        { ComplianceName: 'MXHTS', ComplianceValue: '777' },
        { ComplianceName: 'BRHTS', ComplianceValue: '888' },
      ],
    });
    const compliance = mapMouserCompliance(product);
    expect(Object.keys(compliance!.htsCodesByRegion!)).toHaveLength(8);
    expect(compliance!.htsCodesByRegion!.JP).toBe('444');
    expect(compliance!.htsCodesByRegion!.BR).toBe('888');
  });

  it('returns null when no compliance data', () => {
    const product = makeMouserProduct({
      ROHSStatus: '',
      ProductCompliance: [],
    });
    expect(mapMouserCompliance(product)).toBeNull();
  });
});

// ============================================================
// buildDigikeyQuote
// ============================================================

describe('buildDigikeyQuote', () => {
  it('uses real price breaks when available', () => {
    const quote = buildDigikeyQuote({
      unitPrice: 0.73,
      quantityAvailable: 6458,
      digikeyPartNumber: 'DK-001',
      productUrl: 'https://digikey.com/p/1',
      digikeyPriceBreaks: [
        { quantity: 1, unitPrice: 0.73, currency: 'USD' },
        { quantity: 10, unitPrice: 0.65, currency: 'USD' },
        { quantity: 100, unitPrice: 0.50, currency: 'USD' },
      ],
    });

    expect(quote.supplier).toBe('digikey');
    expect(quote.supplierPartNumber).toBe('DK-001');
    expect(quote.unitPrice).toBe(0.73);
    expect(quote.priceBreaks).toHaveLength(3);
    expect(quote.priceBreaks[0]).toEqual({ quantity: 1, unitPrice: 0.73, currency: 'USD' });
    expect(quote.priceBreaks[1]).toEqual({ quantity: 10, unitPrice: 0.65, currency: 'USD' });
    expect(quote.priceBreaks[2]).toEqual({ quantity: 100, unitPrice: 0.50, currency: 'USD' });
    expect(quote.quantityAvailable).toBe(6458);
    expect(quote.productUrl).toBe('https://digikey.com/p/1');
  });

  it('falls back to synthetic single-tier when no price breaks', () => {
    const quote = buildDigikeyQuote({
      unitPrice: 0.73,
      quantityAvailable: 6458,
      digikeyPartNumber: 'DK-001',
      productUrl: 'https://digikey.com/p/1',
    });

    expect(quote.supplier).toBe('digikey');
    expect(quote.unitPrice).toBe(0.73);
    expect(quote.priceBreaks).toEqual([{ quantity: 1, unitPrice: 0.73, currency: 'USD' }]);
  });

  it('handles missing price', () => {
    const quote = buildDigikeyQuote({});
    expect(quote.unitPrice).toBeUndefined();
    expect(quote.priceBreaks).toHaveLength(0);
  });
});
