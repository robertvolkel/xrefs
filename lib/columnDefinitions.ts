/**
 * Column Definition System
 *
 * Defines the catalog of all available columns for the parts list table.
 * Columns are organized by semantic category (Technical, Commercial,
 * Compliance, Risk & Lifecycle, Trade & Export) with source badges
 * indicating data origin (Digikey, Parts.io, Atlas).
 */

import { PartsListRow, EnrichedPartData } from './types';
import { CalculatedFieldDef, getCalculatedValue } from './calculatedFields';

// ============================================================
// TYPES
// ============================================================

export type ColumnSource = 'spreadsheet' | 'system' | 'digikey-product' | 'digikey-param' | 'calculated';

export interface ColumnDefinition {
  /** Unique stable ID, e.g. "ss:3", "sys:row_number", "dk:unitPrice", "dkp:capacitance" */
  id: string;
  /** Display label for the column header */
  label: string;
  /** Where this column's data comes from */
  source: ColumnSource;
  /** Semantic category for grouping in the column picker UI */
  group: string;
  /** For spreadsheet columns: the original column index */
  spreadsheetIndex?: number;
  /** For parametric columns: the parameterId key */
  parameterKey?: string;
  /** For product-level columns: the field name on EnrichedPartData */
  enrichedField?: keyof EnrichedPartData;
  /** Default width (CSS value for colgroup) */
  defaultWidth?: string;
  /** Text alignment */
  align?: 'left' | 'right' | 'center';
  /** Whether this is a numeric column */
  isNumeric?: boolean;
  /** Whether this is a URL/link column */
  isLink?: boolean;
  /** Data source for display badge in column picker (DK, PIO, Atlas, Mouser) */
  dataSource?: 'digikey' | 'partsio' | 'atlas' | 'mouser';
  /** For calculated columns: the formula definition */
  calculatedField?: CalculatedFieldDef;
}

/** Display order for column groups in the column picker */
export const GROUP_ORDER = [
  'System',
  'Replacements',
  'Your Data',
  'Product Identity',
  'Commercial',
  'Compliance',
  'Risk & Lifecycle',
  'Trade & Export',
  'Documentation',
  'Technical',
  'Calculated',
] as const;

// ============================================================
// SYSTEM COLUMN DEFINITIONS (always available)
// ============================================================

export const SYSTEM_COLUMNS: ColumnDefinition[] = [
  { id: 'sys:row_number', label: '#', source: 'system', group: 'System', defaultWidth: '40px', align: 'center' },
  { id: 'sys:status', label: 'Status', source: 'system', group: 'System', defaultWidth: '90px' },
  { id: 'sys:hits', label: 'Xrefs', source: 'system', group: 'Replacements', defaultWidth: '50px', align: 'center' },
  { id: 'sys:top_suggestion', label: 'Top Suggestion(s)', source: 'system', group: 'Replacements', defaultWidth: '160px' },
  { id: 'sys:top_suggestion_mfr', label: 'Sug. Mfr', source: 'system', group: 'Replacements', defaultWidth: '130px' },
  { id: 'sys:top_suggestion_price', label: 'Sug. Price', source: 'system', group: 'Replacements', defaultWidth: '70px', align: 'right', isNumeric: true },
  { id: 'sys:top_suggestion_stock', label: 'Sug. Stock', source: 'system', group: 'Replacements', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'sys:row_actions', label: '', source: 'system', group: 'System', defaultWidth: '44px', align: 'right' },
];

// ============================================================
// PRODUCT-LEVEL COLUMN DEFINITIONS (always available)
// Organized by semantic category, tagged with data source.
// ============================================================

const PRODUCT_COLUMNS: ColumnDefinition[] = [
  // Product Identity
  { id: 'dk:manufacturer', label: 'Manufacturer', source: 'digikey-product', enrichedField: 'manufacturer', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '140px' },
  { id: 'dk:digikeyPartNumber', label: 'DigiKey Part #', source: 'digikey-product', enrichedField: 'digikeyPartNumber', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '140px' },
  { id: 'dk:category', label: 'Category', source: 'digikey-product', enrichedField: 'category', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '120px' },
  { id: 'dk:subcategory', label: 'Subcategory', source: 'digikey-product', enrichedField: 'subcategory', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '140px' },
  // Documentation
  { id: 'dk:datasheetUrl', label: 'Datasheet', source: 'digikey-product', enrichedField: 'datasheetUrl', group: 'Documentation', dataSource: 'digikey', defaultWidth: '80px', isLink: true },
  { id: 'dk:photoUrl', label: 'Photo', source: 'digikey-product', enrichedField: 'photoUrl', group: 'Documentation', dataSource: 'digikey', defaultWidth: '80px', isLink: true },
  { id: 'dk:productUrl', label: 'Product Page', source: 'digikey-product', enrichedField: 'productUrl', group: 'Documentation', dataSource: 'digikey', defaultWidth: '80px', isLink: true },
  // Commercial
  { id: 'dk:unitPrice', label: 'DK Price', source: 'digikey-product', enrichedField: 'unitPrice', group: 'Commercial', dataSource: 'digikey', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'dk:quantityAvailable', label: 'DK Stock', source: 'digikey-product', enrichedField: 'quantityAvailable', group: 'Commercial', dataSource: 'digikey', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'dk:productStatus', label: 'Product Status', source: 'digikey-product', enrichedField: 'productStatus', group: 'Commercial', dataSource: 'digikey', defaultWidth: '100px' },
  { id: 'dk:factoryLeadTimeWeeks', label: 'Lead Time (Weeks)', source: 'digikey-product', enrichedField: 'factoryLeadTimeWeeks', group: 'Commercial', dataSource: 'partsio', defaultWidth: '100px', align: 'right', isNumeric: true },
  // Compliance
  { id: 'dk:rohsStatus', label: 'RoHS Status', source: 'digikey-product', enrichedField: 'rohsStatus', group: 'Compliance', dataSource: 'digikey', defaultWidth: '100px' },
  { id: 'dk:moistureSensitivityLevel', label: 'MSL', source: 'digikey-product', enrichedField: 'moistureSensitivityLevel', group: 'Compliance', dataSource: 'digikey', defaultWidth: '60px' },
  { id: 'dk:reachCompliance', label: 'REACH Compliance', source: 'digikey-product', enrichedField: 'reachCompliance', group: 'Compliance', dataSource: 'partsio', defaultWidth: '120px' },
  { id: 'dk:qualifications', label: 'Qualifications', source: 'digikey-product', enrichedField: 'qualifications', group: 'Compliance', dataSource: 'digikey', defaultWidth: '120px' },
  // Risk & Lifecycle
  { id: 'dk:yteol', label: 'YTEOL', source: 'digikey-product', enrichedField: 'yteol', group: 'Risk & Lifecycle', dataSource: 'partsio', defaultWidth: '70px', align: 'right', isNumeric: true },
  { id: 'dk:riskRank', label: 'Risk Rank', source: 'digikey-product', enrichedField: 'riskRank', group: 'Risk & Lifecycle', dataSource: 'partsio', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'dk:partLifecycleCode', label: 'Lifecycle Code', source: 'digikey-product', enrichedField: 'partLifecycleCode', group: 'Risk & Lifecycle', dataSource: 'partsio', defaultWidth: '100px' },
  // Trade & Export
  { id: 'dk:countryOfOrigin', label: 'Country of Origin', source: 'digikey-product', enrichedField: 'countryOfOrigin', group: 'Trade & Export', dataSource: 'partsio', defaultWidth: '110px' },
  { id: 'dk:eccnCode', label: 'ECCN Code', source: 'digikey-product', enrichedField: 'eccnCode', group: 'Trade & Export', dataSource: 'partsio', defaultWidth: '90px' },
  { id: 'dk:htsCode', label: 'HTS Code', source: 'digikey-product', enrichedField: 'htsCode', group: 'Trade & Export', dataSource: 'partsio', defaultWidth: '100px' },
  // Mouser Commercial
  { id: 'mouser:unitPrice', label: 'Mouser Price', source: 'digikey-product', group: 'Commercial', dataSource: 'mouser', defaultWidth: '90px', align: 'right', isNumeric: true },
  { id: 'mouser:stock', label: 'Mouser Stock', source: 'digikey-product', group: 'Commercial', dataSource: 'mouser', defaultWidth: '90px', align: 'right', isNumeric: true },
  { id: 'mouser:leadTime', label: 'Mouser Lead Time', source: 'digikey-product', group: 'Commercial', dataSource: 'mouser', defaultWidth: '110px' },
  // Multi-supplier summary
  { id: 'commercial:bestPrice', label: 'Best Price', source: 'digikey-product', group: 'Commercial', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'commercial:totalStock', label: 'Total Stock', source: 'digikey-product', group: 'Commercial', defaultWidth: '90px', align: 'right', isNumeric: true },
  // Mouser Risk & Lifecycle
  { id: 'mouser:lifecycle', label: 'Lifecycle (Mouser)', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'mouser', defaultWidth: '110px' },
  { id: 'mouser:suggestedReplacement', label: 'Suggested Replacement', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'mouser', defaultWidth: '140px' },
  // Mouser Trade & Export (regional HTS codes)
  { id: 'mouser:htsUS', label: 'HTS (US)', source: 'digikey-product', group: 'Trade & Export', dataSource: 'mouser', defaultWidth: '100px' },
  { id: 'mouser:htsCN', label: 'HTS (CN)', source: 'digikey-product', group: 'Trade & Export', dataSource: 'mouser', defaultWidth: '100px' },
  { id: 'mouser:htsEU', label: 'HTS (EU/TARIC)', source: 'digikey-product', group: 'Trade & Export', dataSource: 'mouser', defaultWidth: '110px' },
  { id: 'mouser:eccn', label: 'ECCN (Mouser)', source: 'digikey-product', group: 'Trade & Export', dataSource: 'mouser', defaultWidth: '100px' },
];

/** Standalone definition for the auto-appended row actions column */
export const ROW_ACTIONS_COLUMN: ColumnDefinition = SYSTEM_COLUMNS.find(c => c.id === 'sys:row_actions')!;

// ============================================================
// DEFAULT VIEW COLUMNS
// ============================================================

/** Column IDs for the built-in Default view.
 *  `mapped:*` placeholders are resolved at render time to the actual
 *  spreadsheet column indices based on the column mapping. */
export const DEFAULT_VIEW_COLUMNS: string[] = [
  'sys:row_number',
  'mapped:mpn',
  'mapped:manufacturer',
  'mapped:description',
  'mapped:cpn',
  'sys:status',
  'dk:unitPrice',
  'dk:quantityAvailable',
  'sys:hits',
  'sys:top_suggestion',
  'sys:top_suggestion_mfr',
  'sys:top_suggestion_price',
  'sys:top_suggestion_stock',
];

// ============================================================
// DYNAMIC BUILDERS
// ============================================================

/**
 * Scan all rows to collect the set of parametric keys, display names, and data sources.
 * Returns a Map of parameterId → { name, source }.
 */
export function collectParameterKeys(rows: PartsListRow[]): Map<string, { name: string; source?: string }> {
  const map = new Map<string, { name: string; source?: string }>();
  for (const row of rows) {
    if (row.enrichedData?.parameters) {
      for (const [key, val] of Object.entries(row.enrichedData.parameters)) {
        if (!map.has(key)) {
          map.set(key, { name: val.name, source: val.source });
        }
      }
    }
  }
  return map;
}

/**
 * Build the full catalog of available columns for the column picker.
 *
 * @param spreadsheetHeaders - Original headers from the uploaded file
 * @param parameterKeys - Map of parameterId → { name, source } (from collectParameterKeys)
 */
export function buildAvailableColumns(
  spreadsheetHeaders: string[],
  parameterKeys: Map<string, { name: string; source?: string }>,
): ColumnDefinition[] {
  const columns: ColumnDefinition[] = [];

  // System columns (exclude unlabeled utility columns like action/row_actions)
  columns.push(...SYSTEM_COLUMNS.filter(c => c.label));

  // Spreadsheet columns (from the original upload)
  spreadsheetHeaders.forEach((header, index) => {
    columns.push({
      id: `ss:${index}`,
      label: header || `Column ${index + 1}`,
      source: 'spreadsheet',
      spreadsheetIndex: index,
      group: 'Your Data',
      defaultWidth: '120px',
    });
  });

  // Product-level columns (from all data sources)
  columns.push(...PRODUCT_COLUMNS);

  // Parametric columns (dynamic from actual data, grouped as Technical)
  for (const [key, info] of parameterKeys) {
    columns.push({
      id: `dkp:${key}`,
      label: info.name,
      source: 'digikey-param',
      parameterKey: key,
      group: 'Technical',
      dataSource: (info.source as 'digikey' | 'partsio' | 'atlas') ?? 'digikey',
      defaultWidth: '120px',
    });
  }

  return columns;
}

// ============================================================
// CELL VALUE RESOLVER
// ============================================================

/**
 * Extract the display value for a given column definition and row.
 * System columns return undefined — they use custom renderers.
 *
 * @param columnMap - Optional map of all column definitions (needed for calculated fields
 *   to resolve operand references). Pass this when the view includes calc:* columns.
 * @param depth - Recursion depth for calculated field cycle protection.
 */
export function getCellValue(
  column: ColumnDefinition,
  row: PartsListRow,
  columnMap?: Map<string, ColumnDefinition>,
  depth?: number,
): string | number | undefined {
  switch (column.source) {
    case 'spreadsheet':
      return column.spreadsheetIndex !== undefined
        ? row.rawCells?.[column.spreadsheetIndex]
        : undefined;

    case 'digikey-product': {
      // Mouser columns (resolved from supplierQuotes/lifecycleInfo/complianceData)
      if (column.id.startsWith('mouser:')) {
        return getMouserCellValue(column.id, row);
      }
      // Multi-supplier summary columns
      if (column.id.startsWith('commercial:')) {
        return getCommercialSummaryCellValue(column.id, row);
      }
      if (!column.enrichedField) return undefined;
      // Manufacturer fallback: rows validated before this field was added
      // may not have enrichedData.manufacturer, so fall back to resolvedPart.
      if (column.enrichedField === 'manufacturer') {
        return row.enrichedData?.manufacturer ?? row.resolvedPart?.manufacturer;
      }
      if (!row.enrichedData) return undefined;
      const val = row.enrichedData[column.enrichedField];
      // parameters is a Record, not a display value
      if (column.enrichedField === 'parameters') return undefined;
      // Array fields (e.g. qualifications) → join for display
      if (Array.isArray(val)) return val.join(', ');
      return val as string | number | undefined;
    }

    case 'digikey-param':
      if (!row.enrichedData?.parameters || !column.parameterKey) return undefined;
      return row.enrichedData.parameters[column.parameterKey]?.value;

    case 'system':
      // System columns are handled by custom renderers in the table
      return undefined;

    case 'calculated': {
      if (!column.calculatedField || !columnMap) return undefined;
      return getCalculatedValue(
        column.calculatedField,
        row,
        (colId, r, d) => {
          const refCol = columnMap.get(colId);
          if (!refCol) return undefined;
          return getCellValue(refCol, r, columnMap, d);
        },
        depth ?? 0,
      );
    }

    default:
      return undefined;
  }
}

/**
 * Get a sortable value for any column + row combination.
 * Unlike getCellValue, this also resolves system columns so they can be sorted.
 */
export function getSortValue(
  column: ColumnDefinition,
  row: PartsListRow,
  columnMap?: Map<string, ColumnDefinition>,
): string | number | undefined {
  if (column.source !== 'system') {
    return getCellValue(column, row, columnMap);
  }

  switch (column.id) {
    case 'sys:row_number':
      return row.rowIndex;
    case 'sys:status':
      return row.status;
    case 'sys:hits':
      return row.allRecommendations?.length ?? row.recommendationCount ?? (row.suggestedReplacement ? 1 : 0);
    case 'sys:top_suggestion':
      return row.suggestedReplacement?.part.mpn?.toLowerCase();
    case 'sys:top_suggestion_mfr':
      return row.suggestedReplacement?.part.manufacturer?.toLowerCase();
    case 'sys:top_suggestion_price':
      return row.suggestedReplacement?.part.unitPrice;
    case 'sys:top_suggestion_stock':
      return row.suggestedReplacement?.part.quantityAvailable;
    default:
      return undefined;
  }
}

// ============================================================
// MOUSER / MULTI-SUPPLIER CELL VALUE HELPERS
// ============================================================

/** Extract a cell value from Mouser supplier data on a row */
function getMouserCellValue(columnId: string, row: PartsListRow): string | number | undefined {
  const quote = row.enrichedData?.supplierQuotes?.find(q => q.supplier === 'mouser');
  const lifecycle = row.enrichedData?.lifecycleInfo?.find(l => l.source === 'mouser');
  const compliance = row.enrichedData?.complianceData?.find(c => c.source === 'mouser');

  switch (columnId) {
    case 'mouser:unitPrice':
      return quote?.unitPrice;
    case 'mouser:stock':
      return quote?.quantityAvailable;
    case 'mouser:leadTime':
      return quote?.leadTime;
    case 'mouser:lifecycle':
      return lifecycle?.status;
    case 'mouser:suggestedReplacement':
      return lifecycle?.suggestedReplacement;
    case 'mouser:htsUS':
      return compliance?.htsCodesByRegion?.US;
    case 'mouser:htsCN':
      return compliance?.htsCodesByRegion?.CN;
    case 'mouser:htsEU':
      return compliance?.htsCodesByRegion?.EU;
    case 'mouser:eccn':
      return compliance?.eccnCode;
    default:
      return undefined;
  }
}

/** Compute multi-supplier summary values */
function getCommercialSummaryCellValue(columnId: string, row: PartsListRow): number | undefined {
  const quotes = row.enrichedData?.supplierQuotes;
  if (!quotes || quotes.length === 0) return undefined;

  switch (columnId) {
    case 'commercial:bestPrice': {
      const prices = quotes.map(q => q.unitPrice).filter((p): p is number => p != null && p > 0);
      return prices.length > 0 ? Math.min(...prices) : undefined;
    }
    case 'commercial:totalStock': {
      const stocks = quotes.map(q => q.quantityAvailable).filter((s): s is number => s != null);
      return stocks.length > 0 ? stocks.reduce((sum, s) => sum + s, 0) : undefined;
    }
    default:
      return undefined;
  }
}
