/**
 * Tests for digikeyMapper.ts — the layer that converts Digikey API responses
 * into our internal types.
 *
 * We test the publicly exported functions and the key internal helpers
 * (extractNumericValue, mapCategory, mapSubcategory, value transformers)
 * indirectly through mapDigikeyProductToPart and mapDigikeyProductToAttributes.
 *
 * For direct unit-level access to non-exported helpers, we test them
 * through their observable effects on the mapped output.
 */

import {
  mapDigikeyProductToPart,
  mapDigikeyProductToAttributes,
  mapDigikeyProductToSummary,
  mapKeywordResponseToSearchResult,
} from '@/lib/services/digikeyMapper';
import { DigikeyProduct, DigikeyKeywordResponse } from '@/lib/services/digikeyClient';

// ============================================================
// HELPERS — minimal Digikey product stubs
// ============================================================

function makeProduct(overrides: Partial<DigikeyProduct> = {}): DigikeyProduct {
  return {
    Description: { ProductDescription: 'CAP CER 100NF 25V X7R 0402', DetailedDescription: '' },
    Manufacturer: { Id: 1, Name: 'Murata' },
    ManufacturerProductNumber: 'GRM155R71E104KA87D',
    DigiKeyPartNumber: 'DK-001',
    UnitPrice: 0.1,
    ProductUrl: 'https://digikey.com/p/1',
    DatasheetUrl: 'https://digikey.com/d/1',
    PhotoUrl: 'https://digikey.com/i/1',
    QuantityAvailable: 10000,
    ProductStatus: { Id: 1, Status: 'Active' },
    Parameters: [],
    Category: { CategoryId: 1, Name: 'Capacitors', ChildCategories: [{ CategoryId: 2, Name: 'Ceramic Capacitors' }] },
    Series: { Id: 1, Name: 'GRM' },
    ...overrides,
  };
}

// ============================================================
// mapCategory — tested through mapDigikeyProductToPart
// ============================================================

describe('digikeyMapper', () => {
  describe('mapCategory (via mapDigikeyProductToPart)', () => {
    const cases: [string, string][] = [
      ['Ceramic Capacitors', 'Capacitors'],
      ['Chip Resistor - Surface Mount', 'Resistors'],
      ['Fixed Inductors', 'Inductors'],
      ['Diodes - Rectifiers - Single', 'Diodes'],
      ['Bridge Rectifiers', 'Diodes'],
      ['Transistors - MOSFETs', 'Transistors'],
      ['Connectors - Headers', 'Connectors'],
      ['Varistors', 'Protection'],
      ['NTC Thermistors', 'Protection'],
      ['PTC Resettable Fuses', 'Protection'],
      ['Microcontrollers', 'ICs'], // default
    ];

    it.each(cases)('"%s" → %s', (categoryName, expected) => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: categoryName },
      });
      const part = mapDigikeyProductToPart(product);
      expect(part.category).toBe(expected);
    });
  });

  // ----------------------------------------------------------
  // mapSubcategory — tested through mapDigikeyProductToPart
  // ----------------------------------------------------------
  describe('mapSubcategory (via mapDigikeyProductToPart)', () => {
    const cases: [string, string][] = [
      ['Ceramic Capacitors', 'MLCC'],
      ['Aluminum Polymer Capacitors', 'Aluminum Polymer'],
      ['Aluminum Electrolytic Capacitors', 'Aluminum Electrolytic'],
      ['Tantalum Capacitors', 'Tantalum'],
      ['Electric Double Layer Capacitors (Supercapacitors)', 'Supercapacitor'],
      ['Film Capacitors', 'Film Capacitor'],
      ['Thick Film Resistors', 'Thick Film'],
      ['Thin Film Resistors', 'Thin Film'],
      ['Fixed Inductors', 'Fixed Inductor'],
      ['Ferrite Beads and Chips', 'Ferrite Bead and Chip'],
      ['Common Mode Chokes', 'Common Mode Choke'],
      ['Varistors - MOVs', 'Varistor'],
      ['PTC Resettable Fuses / PPTC', 'PTC Resettable Fuse'],
      ['NTC Thermistors', 'NTC Thermistor'],
      ['PTC Thermistors', 'PTC Thermistor'],
      ['Diodes - Bridge Rectifiers', 'Diodes - Bridge Rectifiers'],
      ['Single Diodes - Rectifier', 'Rectifier Diode'],
      // MOSFETs (Family B5)
      ['FETs - MOSFETs - Single', 'MOSFET'],
      ['FETs - MOSFETs - N-Channel', 'N-Channel MOSFET'],
      ['FETs - MOSFETs - P-Channel', 'P-Channel MOSFET'],
      ['FETs - SiC MOSFETs', 'SiC MOSFET'],
      ['FETs - GaN FET (Gallium Nitride)', 'GaN FET'],
      // BJTs (Family B6)
      ['Transistors - Bipolar (BJT) - Single', 'BJT'],
      ['Transistors - Bipolar (BJT) - Single - NPN', 'NPN BJT'],
      ['Transistors - Bipolar (BJT) - Single - PNP', 'PNP BJT'],
      ['Transistors - Bipolar (BJT) - Array', 'BJT'],
      ['Bipolar Transistors - NPN', 'NPN BJT'],
      ['Bipolar Transistors - PNP', 'PNP BJT'],
    ];

    it.each(cases)('"%s" → "%s"', (categoryName, expected) => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: categoryName },
      });
      const part = mapDigikeyProductToPart(product);
      expect(part.subcategory).toBe(expected);
    });
  });

  // ----------------------------------------------------------
  // mapStatus — tested through mapDigikeyProductToPart
  // ----------------------------------------------------------
  describe('mapStatus (via mapDigikeyProductToPart)', () => {
    const cases: [string, string][] = [
      ['Active', 'Active'],
      ['Obsolete', 'Obsolete'],
      ['Discontinued', 'Discontinued'],
      ['Not Recommended for New Designs', 'NRND'],
      ['NRND', 'NRND'],
      ['Last Time Buy', 'LastTimeBuy'],
      ['LTB', 'LastTimeBuy'],
      ['Unknown Status', 'Active'], // default
    ];

    it.each(cases)('"%s" → %s', (status, expected) => {
      const product = makeProduct({
        ProductStatus: { Id: 1, Status: status },
      });
      const part = mapDigikeyProductToPart(product);
      expect(part.status).toBe(expected);
    });
  });

  // ----------------------------------------------------------
  // extractNumericValue — tested through mapDigikeyProductToAttributes
  // The param map for "Ceramic Capacitors" maps "Capacitance" → capacitance.
  // When the product has that parameter, extractNumericValue runs on ValueText.
  // ----------------------------------------------------------
  describe('extractNumericValue (via attributes mapping)', () => {
    it('extracts picofarad value with SI prefix (100pF → 1e-10)', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Capacitors', ChildCategories: [{ CategoryId: 2, Name: 'Ceramic Capacitors' }] },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Capacitance', ValueId: '1', ValueText: '100pF' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const cap = result.parameters.find(p => p.parameterId === 'capacitance');
      expect(cap).toBeDefined();
      expect(cap!.numericValue).toBeCloseTo(1e-10, 15);
    });

    it('extracts microfarad value (4.7µF → 4.7e-6)', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Capacitors', ChildCategories: [{ CategoryId: 2, Name: 'Ceramic Capacitors' }] },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Capacitance', ValueId: '1', ValueText: '4.7µF' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const cap = result.parameters.find(p => p.parameterId === 'capacitance');
      expect(cap!.numericValue).toBeCloseTo(4.7e-6, 15);
    });

    it('does not scale mm values (0.90mm stays ~0.90)', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Capacitors', ChildCategories: [{ CategoryId: 2, Name: 'Ceramic Capacitors' }] },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Height - Seated (Max)', ValueId: '1', ValueText: '0.90mm' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const height = result.parameters.find(p => p.parameterId === 'height');
      expect(height).toBeDefined();
      expect(height!.numericValue).toBeCloseTo(0.9, 5);
    });

    it('handles kiloOhm values (10kΩ → 10000)', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Chip Resistor - Surface Mount' },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Resistance', ValueId: '1', ValueText: '10kΩ' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const res = result.parameters.find(p => p.parameterId === 'resistance');
      expect(res).toBeDefined();
      expect(res!.numericValue).toBeCloseTo(10000, 0);
    });
  });

  // ----------------------------------------------------------
  // VALUE TRANSFORMERS
  // ----------------------------------------------------------
  describe('value transformers (via attributes mapping)', () => {
    it('transformToAecQ200: detects AEC-Q200 in Ratings → Yes', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Capacitors', ChildCategories: [{ CategoryId: 2, Name: 'Ceramic Capacitors' }] },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Ratings', ValueId: '1', ValueText: 'AEC-Q200, X7R' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const aec = result.parameters.find(p => p.parameterId === 'aec_q200');
      expect(aec?.value).toBe('Yes');
    });

    it('transformToAecQ200: returns No when absent', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Capacitors', ChildCategories: [{ CategoryId: 2, Name: 'Ceramic Capacitors' }] },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Ratings', ValueId: '1', ValueText: 'General Purpose' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const aec = result.parameters.find(p => p.parameterId === 'aec_q200');
      expect(aec?.value).toBe('No');
    });

    it('transformToDiameter: extracts metric mm from "Dia (5.00mm)"', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Aluminum Electrolytic Capacitors' },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Size / Dimension', ValueId: '1', ValueText: '0.197" Dia (5.00mm)' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const dia = result.parameters.find(p => p.parameterId === 'diameter');
      expect(dia?.value).toBe('5.00mm');
    });

    it('transformBValue: preserves raw text (no SI scaling)', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'NTC Thermistors' },
        Parameters: [
          { ParameterId: 1, ParameterText: 'B25/50', ValueId: '1', ValueText: '3380K' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const bv = result.parameters.find(p => p.parameterId === 'b_value');
      expect(bv?.value).toBe('3380K');
    });

    it('transformToRecoveryCategory: extracts Standard/Fast/Ultrafast from Speed field', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Single Diodes' },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Speed', ValueId: '1', ValueText: 'Fast Recovery =< 500ns, > 200mA (Io)' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const cat = result.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Fast');
    });

    it('transformToRecoveryCategory: handles Ultrafast', () => {
      const product = makeProduct({
        Category: { CategoryId: 1, Name: 'Single Diodes' },
        Parameters: [
          { ParameterId: 1, ParameterText: 'Speed', ValueId: '1', ValueText: 'Ultrafast Recovery < 50ns' },
        ],
      });
      const result = mapDigikeyProductToAttributes(product);
      const cat = result.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Ultrafast');
    });
  });

  // ----------------------------------------------------------
  // mapDigikeyProductToPart — main mapper
  // ----------------------------------------------------------
  describe('mapDigikeyProductToPart', () => {
    it('maps all core Part fields', () => {
      const product = makeProduct();
      const part = mapDigikeyProductToPart(product);
      expect(part.mpn).toBe('GRM155R71E104KA87D');
      expect(part.manufacturer).toBe('Murata');
      expect(part.description).toBe('CAP CER 100NF 25V X7R 0402');
      expect(part.status).toBe('Active');
      expect(part.datasheetUrl).toBe('https://digikey.com/d/1');
      expect(part.imageUrl).toBe('https://digikey.com/i/1');
      expect(part.unitPrice).toBe(0.1);
      expect(part.quantityAvailable).toBe(10000);
      expect(part.digikeyPartNumber).toBe('DK-001');
    });

    it('traverses nested category hierarchy', () => {
      const product = makeProduct({
        Category: {
          CategoryId: 1,
          Name: 'Capacitors',
          ChildCategories: [{
            CategoryId: 2,
            Name: 'Ceramic Capacitors',
            ChildCategories: [{ CategoryId: 3, Name: 'Multilayer Ceramic Capacitors (MLCC)' }],
          }],
        },
      });
      const part = mapDigikeyProductToPart(product);
      // Deepest category should be used
      expect(part.subcategory).toBe('MLCC');
    });

    it('handles missing manufacturer gracefully', () => {
      const product = makeProduct({ Manufacturer: undefined as unknown as DigikeyProduct['Manufacturer'] });
      const part = mapDigikeyProductToPart(product);
      expect(part.manufacturer).toBe('Unknown');
    });
  });

  // ----------------------------------------------------------
  // mapDigikeyProductToSummary
  // ----------------------------------------------------------
  describe('mapDigikeyProductToSummary', () => {
    it('returns lightweight PartSummary', () => {
      const product = makeProduct();
      const summary = mapDigikeyProductToSummary(product);
      expect(summary.mpn).toBe('GRM155R71E104KA87D');
      expect(summary.manufacturer).toBe('Murata');
      expect(summary.category).toBe('Capacitors');
    });
  });

  // ----------------------------------------------------------
  // mapKeywordResponseToSearchResult
  // ----------------------------------------------------------
  describe('mapKeywordResponseToSearchResult', () => {
    it('returns "none" for empty results', () => {
      const response: DigikeyKeywordResponse = {
        Products: [],
        ProductsCount: 0,
        ExactMatches: [],
      };
      const result = mapKeywordResponseToSearchResult(response);
      expect(result.type).toBe('none');
      expect(result.matches).toHaveLength(0);
    });

    it('returns "single" for one match', () => {
      const response: DigikeyKeywordResponse = {
        Products: [],
        ProductsCount: 1,
        ExactMatches: [makeProduct()],
      };
      const result = mapKeywordResponseToSearchResult(response);
      expect(result.type).toBe('single');
      expect(result.matches).toHaveLength(1);
    });

    it('returns "multiple" for >1 matches', () => {
      const response: DigikeyKeywordResponse = {
        Products: [
          makeProduct({ ManufacturerProductNumber: 'A' }),
          makeProduct({ ManufacturerProductNumber: 'B' }),
        ],
        ProductsCount: 2,
        ExactMatches: [],
      };
      const result = mapKeywordResponseToSearchResult(response);
      expect(result.type).toBe('multiple');
      expect(result.matches).toHaveLength(2);
    });

    it('deduplicates by MPN across ExactMatches and Products', () => {
      const response: DigikeyKeywordResponse = {
        Products: [makeProduct({ ManufacturerProductNumber: 'SAME' })],
        ProductsCount: 1,
        ExactMatches: [makeProduct({ ManufacturerProductNumber: 'SAME' })],
      };
      const result = mapKeywordResponseToSearchResult(response);
      expect(result.type).toBe('single');
      expect(result.matches).toHaveLength(1);
    });
  });
});
