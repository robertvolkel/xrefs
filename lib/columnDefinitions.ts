/**
 * Column Definition System
 *
 * Defines the catalog of all available columns for the parts list table.
 * Columns are organized by semantic category (Technical, Commercial,
 * Compliance, Risk & Lifecycle, Trade & Export) with source badges
 * indicating data origin (Digikey, Parts.io, Atlas).
 */

import { PartsListRow, EnrichedPartData, computeRecommendationCounts } from './types';
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
  /** Data source for display badge in column picker (DK, PIO, Atlas, FC) */
  dataSource?: 'digikey' | 'partsio' | 'atlas' | 'mouser' | 'findchips';
  /** For calculated columns: the formula definition */
  calculatedField?: CalculatedFieldDef;
  /** Whether this cell can be edited inline (only ss:* columns) */
  editable?: boolean;
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
  { id: 'sys:partType', label: 'Type', source: 'system', group: 'System', defaultWidth: '110px' },
  { id: 'sys:hits', label: 'Xrefs', source: 'system', group: 'Replacements', defaultWidth: '50px', align: 'center' },
  { id: 'sys:logicBasedCount', label: 'Logic-Based', source: 'system', group: 'Replacements', defaultWidth: '85px', align: 'center', isNumeric: true },
  { id: 'sys:mfrCertifiedCount', label: 'MFR Certified', source: 'system', group: 'Replacements', defaultWidth: '95px', align: 'center', isNumeric: true },
  { id: 'sys:accurisCertifiedCount', label: 'Accuris Certified', source: 'system', group: 'Replacements', defaultWidth: '110px', align: 'center', isNumeric: true },
  { id: 'sys:top_suggestion', label: 'Repl. MPN', source: 'system', group: 'Replacements', defaultWidth: '160px' },
  { id: 'sys:top_suggestion_mfr', label: 'Repl. MFR', source: 'system', group: 'Replacements', defaultWidth: '130px' },
  { id: 'sys:top_suggestion_price', label: 'Repl. Price', source: 'system', group: 'Replacements', defaultWidth: '70px', align: 'right', isNumeric: true },
  { id: 'sys:top_suggestion_stock', label: 'Repl. Stock', source: 'system', group: 'Replacements', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'sys:top_suggestion_supplier', label: 'Repl. Distributor', source: 'system', group: 'Replacements', defaultWidth: '110px' },
  { id: 'sys:row_actions', label: '', source: 'system', group: 'System', defaultWidth: '44px', align: 'right' },
];

// ============================================================
// PRODUCT-LEVEL COLUMN DEFINITIONS (always available)
// Organized by semantic category, tagged with data source.
// ============================================================

const PRODUCT_COLUMNS: ColumnDefinition[] = [
  // Product Identity
  { id: 'dk:mpn', label: 'MPN (DK)', source: 'digikey-product', enrichedField: 'mpn', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '140px' },
  { id: 'dk:manufacturer', label: 'Manufacturer', source: 'digikey-product', enrichedField: 'manufacturer', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '140px' },
  { id: 'dk:category', label: 'Category', source: 'digikey-product', enrichedField: 'category', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '120px' },
  { id: 'dk:subcategory', label: 'Subcategory', source: 'digikey-product', enrichedField: 'subcategory', group: 'Product Identity', dataSource: 'digikey', defaultWidth: '140px' },
  // Documentation
  { id: 'dk:datasheetUrl', label: 'Datasheet', source: 'digikey-product', enrichedField: 'datasheetUrl', group: 'Documentation', dataSource: 'digikey', defaultWidth: '80px', isLink: true },
  { id: 'dk:photoUrl', label: 'Photo', source: 'digikey-product', enrichedField: 'photoUrl', group: 'Documentation', dataSource: 'digikey', defaultWidth: '80px', isLink: true },
  { id: 'dk:productUrl', label: 'Product Page', source: 'digikey-product', enrichedField: 'productUrl', group: 'Documentation', dataSource: 'digikey', defaultWidth: '80px', isLink: true },
  // Commercial
  { id: 'dk:digikeyPartNumber', label: 'DigiKey SKU', source: 'digikey-product', enrichedField: 'digikeyPartNumber', group: 'Commercial', dataSource: 'digikey', defaultWidth: '140px' },
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
  // Multi-supplier summary (aggregated from FindChips N-distributor quotes)
  { id: 'commercial:bestPrice', label: 'Best Price', source: 'digikey-product', group: 'Commercial', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'commercial:totalStock', label: 'Total Stock', source: 'digikey-product', group: 'Commercial', defaultWidth: '90px', align: 'right', isNumeric: true },
  // FindChips Risk & Lifecycle
  { id: 'fc:lifecycle', label: 'Lifecycle', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'findchips', defaultWidth: '100px' },
  { id: 'fc:riskRank', label: 'Risk Rank', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'findchips', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'fc:designRisk', label: 'Design Risk', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'findchips', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'fc:productionRisk', label: 'Production Risk', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'findchips', defaultWidth: '90px', align: 'right', isNumeric: true },
  { id: 'fc:longTermRisk', label: 'Long-term Risk', source: 'digikey-product', group: 'Risk & Lifecycle', dataSource: 'findchips', defaultWidth: '90px', align: 'right', isNumeric: true },
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
  'sys:partType',
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

  // Portable mapped columns (resolve to actual ss:N at render time — safe for master views)
  columns.push(
    { id: 'mapped:mpn', label: 'MPN', source: 'spreadsheet' as const, group: 'Your Data', defaultWidth: '140px' },
    { id: 'mapped:manufacturer', label: 'Manufacturer', source: 'spreadsheet' as const, group: 'Your Data', defaultWidth: '140px' },
    { id: 'mapped:description', label: 'Description', source: 'spreadsheet' as const, group: 'Your Data', defaultWidth: '200px' },
    { id: 'mapped:cpn', label: 'CPN', source: 'spreadsheet' as const, group: 'Your Data', defaultWidth: '120px' },
    { id: 'mapped:ipn', label: 'IPN', source: 'spreadsheet' as const, group: 'Your Data', defaultWidth: '120px' },
  );

  // Spreadsheet columns (from the original upload)
  spreadsheetHeaders.forEach((header, index) => {
    columns.push({
      id: `ss:${index}`,
      label: header || `Column ${index + 1}`,
      source: 'spreadsheet',
      spreadsheetIndex: index,
      group: 'Your Data',
      defaultWidth: '120px',
      editable: true,
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
      if (column.id.startsWith('fc:')) {
        return getFCCellValue(column.id, row);
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
      // MPN fallback: legacy rows lack enrichedData.mpn; resolvedPart.mpn is the canonical MPN.
      if (column.enrichedField === 'mpn') {
        return row.enrichedData?.mpn ?? row.resolvedPart?.mpn;
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
    case 'sys:partType':
      return row.partType ?? 'electronic';
    case 'sys:hits': {
      const total = row.allRecommendations?.length ?? row.recommendationCount ?? (row.replacement ? 1 : 0);
      return total > 0 ? 1 : 0;
    }
    case 'sys:logicBasedCount':
      return row.allRecommendations
        ? computeRecommendationCounts(row.allRecommendations).logicDrivenCount
        : row.logicDrivenCount;
    case 'sys:mfrCertifiedCount':
      return row.allRecommendations
        ? computeRecommendationCounts(row.allRecommendations).mfrCertifiedCount
        : row.mfrCertifiedCount;
    case 'sys:accurisCertifiedCount':
      return row.allRecommendations
        ? computeRecommendationCounts(row.allRecommendations).accurisCertifiedCount
        : row.accurisCertifiedCount;
    case 'sys:top_suggestion':
      return row.replacement?.part.mpn?.toLowerCase();
    case 'sys:top_suggestion_mfr':
      return row.replacement?.part.manufacturer?.toLowerCase();
    case 'sys:top_suggestion_price': {
      const p = row.replacement?.part;
      if (!p) return undefined;
      const prices = p.supplierQuotes
        ?.map(q => q.unitPrice)
        .filter((v): v is number => v != null && v > 0);
      return prices && prices.length > 0 ? Math.min(...prices) : p.unitPrice;
    }
    case 'sys:top_suggestion_stock': {
      const p = row.replacement?.part;
      if (!p) return undefined;
      const totals = p.supplierQuotes
        ?.map(q => q.quantityAvailable)
        .filter((v): v is number => v != null);
      return totals && totals.length > 0 ? totals.reduce((a, b) => a + b, 0) : p.quantityAvailable;
    }
    case 'sys:top_suggestion_supplier': {
      // Winning distributor = supplierQuotes[0] (mapper pre-sorts by best unit price)
      return row.replacement?.part.supplierQuotes?.[0]?.supplier?.toLowerCase();
    }
    default:
      return undefined;
  }
}

// ============================================================
// FINDCHIPS / MULTI-SUPPLIER CELL VALUE HELPERS
// ============================================================

/** Extract a cell value from FindChips lifecycle/risk data on a row */
function getFCCellValue(columnId: string, row: PartsListRow): string | number | undefined {
  const lifecycle = row.enrichedData?.lifecycleInfo?.find(l => l.source === 'findchips');

  switch (columnId) {
    case 'fc:lifecycle':
      return lifecycle?.status;
    case 'fc:riskRank':
      return lifecycle?.riskRank != null ? Number(lifecycle.riskRank.toFixed(2)) : undefined;
    case 'fc:designRisk':
      return lifecycle?.designRisk != null ? Number(lifecycle.designRisk.toFixed(2)) : undefined;
    case 'fc:productionRisk':
      return lifecycle?.productionRisk != null ? Number(lifecycle.productionRisk.toFixed(2)) : undefined;
    case 'fc:longTermRisk':
      return lifecycle?.longTermRisk != null ? Number(lifecycle.longTermRisk.toFixed(2)) : undefined;
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
