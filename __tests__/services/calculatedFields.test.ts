import {
  getCalculatedValue,
  CalculatedFieldDef,
  isLiteralRef,
  generateCalcFieldId,
} from '@/lib/calculatedFields';
import type { PartsListRow } from '@/lib/types';

// Helper: create a minimal row with enriched data
function makeRow(overrides: Partial<PartsListRow> = {}): PartsListRow {
  return {
    rowIndex: 0,
    rawMpn: 'TEST-001',
    rawManufacturer: 'TestCorp',
    rawDescription: 'Test Part',
    rawCells: ['TEST-001', 'TestCorp', 'Test Part', '100', '2.50'],
    status: 'resolved',
    enrichedData: {
      parameters: {},
      unitPrice: 1.25,
      quantityAvailable: 500,
    },
    ...overrides,
  };
}

// Simple column resolver for tests: resolves ss:N from rawCells, dk:unitPrice from enrichedData
function resolveColumn(columnId: string, row: PartsListRow): string | number | undefined {
  if (columnId.startsWith('ss:')) {
    const idx = parseInt(columnId.slice(3), 10);
    return row.rawCells?.[idx];
  }
  if (columnId === 'dk:unitPrice') return row.enrichedData?.unitPrice;
  if (columnId === 'dk:quantityAvailable') return row.enrichedData?.quantityAvailable;
  return undefined;
}

// Wrap resolveColumn to match the expected signature (ignoring depth for basic tests)
const resolver = (columnId: string, row: PartsListRow, _depth: number) => resolveColumn(columnId, row);

describe('getCalculatedValue', () => {
  describe('multiply', () => {
    it('multiplies two column values', () => {
      const field: CalculatedFieldDef = {
        id: 'test1',
        label: 'Extended Price',
        formula: {
          op: 'multiply',
          left: { columnId: 'ss:3' },  // qty = '100'
          right: { columnId: 'dk:unitPrice' },  // price = 1.25
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBe(125);
    });

    it('multiplies column by literal', () => {
      const field: CalculatedFieldDef = {
        id: 'test2',
        label: 'Marked Up Price',
        formula: {
          op: 'multiply',
          left: { columnId: 'dk:unitPrice' },
          right: { literal: 1.15 },
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBeCloseTo(1.4375);
    });
  });

  describe('divide', () => {
    it('divides two column values', () => {
      const field: CalculatedFieldDef = {
        id: 'test3',
        label: 'Price per Unit',
        formula: {
          op: 'divide',
          left: { columnId: 'dk:quantityAvailable' },  // 500
          right: { columnId: 'ss:3' },  // 100
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBe(5);
    });

    it('returns undefined on division by zero', () => {
      const field: CalculatedFieldDef = {
        id: 'test4',
        label: 'Div Zero',
        formula: {
          op: 'divide',
          left: { columnId: 'dk:unitPrice' },
          right: { literal: 0 },
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBeUndefined();
    });
  });

  describe('add', () => {
    it('adds two values', () => {
      const field: CalculatedFieldDef = {
        id: 'test5',
        label: 'Sum',
        formula: {
          op: 'add',
          left: { columnId: 'ss:3' },  // 100
          right: { columnId: 'dk:quantityAvailable' },  // 500
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBe(600);
    });
  });

  describe('subtract', () => {
    it('subtracts two values', () => {
      const field: CalculatedFieldDef = {
        id: 'test6',
        label: 'Diff',
        formula: {
          op: 'subtract',
          left: { columnId: 'dk:quantityAvailable' },  // 500
          right: { columnId: 'ss:3' },  // 100
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBe(400);
    });
  });

  describe('null propagation', () => {
    it('returns undefined when left operand is missing', () => {
      const field: CalculatedFieldDef = {
        id: 'test7',
        label: 'Missing Left',
        formula: {
          op: 'multiply',
          left: { columnId: 'ss:99' },  // doesn't exist
          right: { columnId: 'dk:unitPrice' },
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBeUndefined();
    });

    it('returns undefined when right column operand is missing', () => {
      const field: CalculatedFieldDef = {
        id: 'test8',
        label: 'Missing Right',
        formula: {
          op: 'multiply',
          left: { columnId: 'dk:unitPrice' },
          right: { columnId: 'ss:99' },
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBeUndefined();
    });

    it('returns undefined when left operand is empty string', () => {
      const field: CalculatedFieldDef = {
        id: 'test9',
        label: 'Empty Left',
        formula: {
          op: 'multiply',
          left: { columnId: 'ss:0' },
          right: { literal: 10 },
        },
      };
      // rawCells[0] = 'TEST-001' which is not a number
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver)).toBeUndefined();
    });
  });

  describe('string-to-number parsing', () => {
    it('handles comma-formatted numbers', () => {
      const field: CalculatedFieldDef = {
        id: 'test10',
        label: 'Comma Number',
        formula: {
          op: 'multiply',
          left: { columnId: 'ss:3' },
          right: { literal: 2 },
        },
      };
      const row = makeRow({ rawCells: ['', '', '', '1,000', ''] });
      expect(getCalculatedValue(field, row, resolver)).toBe(2000);
    });

    it('handles dollar-sign prefix', () => {
      const field: CalculatedFieldDef = {
        id: 'test11',
        label: 'Dollar',
        formula: {
          op: 'add',
          left: { columnId: 'ss:4' },
          right: { literal: 0 },
        },
      };
      const row = makeRow({ rawCells: ['', '', '', '', '$2.50'] });
      expect(getCalculatedValue(field, row, resolver)).toBe(2.5);
    });

    it('returns undefined for non-numeric strings', () => {
      const field: CalculatedFieldDef = {
        id: 'test12',
        label: 'NaN',
        formula: {
          op: 'add',
          left: { columnId: 'ss:0' },
          right: { literal: 0 },
        },
      };
      const row = makeRow({ rawCells: ['hello', '', '', '', ''] });
      expect(getCalculatedValue(field, row, resolver)).toBeUndefined();
    });
  });

  describe('cycle protection', () => {
    it('returns undefined when depth exceeds limit', () => {
      const field: CalculatedFieldDef = {
        id: 'test13',
        label: 'Deep',
        formula: {
          op: 'add',
          left: { columnId: 'dk:unitPrice' },
          right: { literal: 1 },
        },
      };
      const row = makeRow();
      // Pass depth=6 (exceeds the limit of 5)
      expect(getCalculatedValue(field, row, resolver, 6)).toBeUndefined();
    });

    it('allows computation at depth exactly 5', () => {
      const field: CalculatedFieldDef = {
        id: 'test14',
        label: 'At Limit',
        formula: {
          op: 'add',
          left: { columnId: 'dk:unitPrice' },
          right: { literal: 1 },
        },
      };
      const row = makeRow();
      expect(getCalculatedValue(field, row, resolver, 5)).toBe(2.25);
    });
  });
});

describe('isLiteralRef', () => {
  it('identifies literal refs', () => {
    expect(isLiteralRef({ literal: 5 })).toBe(true);
  });

  it('identifies column refs', () => {
    expect(isLiteralRef({ columnId: 'dk:unitPrice' })).toBe(false);
  });
});

describe('generateCalcFieldId', () => {
  it('generates unique IDs', () => {
    const id1 = generateCalcFieldId();
    const id2 = generateCalcFieldId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^cf_\d+_\w+$/);
  });
});
