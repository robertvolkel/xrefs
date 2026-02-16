/**
 * Column Definition System
 *
 * Defines the catalog of all available columns for the parts list table,
 * from three sources: system columns, original spreadsheet columns, and
 * Digikey API data (product fields + parametric attributes).
 */

import { PartsListRow, EnrichedPartData } from './types';

// ============================================================
// TYPES
// ============================================================

export type ColumnSource = 'spreadsheet' | 'system' | 'digikey-product' | 'digikey-param';

export interface ColumnDefinition {
  /** Unique stable ID, e.g. "ss:3", "sys:row_number", "dk:unitPrice", "dkp:capacitance" */
  id: string;
  /** Display label for the column header */
  label: string;
  /** Where this column's data comes from */
  source: ColumnSource;
  /** Category for grouping in the column picker UI */
  group: string;
  /** For spreadsheet columns: the original column index */
  spreadsheetIndex?: number;
  /** For digikey param columns: the parameterId key */
  parameterKey?: string;
  /** For digikey product columns: the field name on EnrichedPartData */
  enrichedField?: keyof EnrichedPartData;
  /** Default width (CSS value for colgroup) */
  defaultWidth?: string;
  /** Text alignment */
  align?: 'left' | 'right' | 'center';
  /** Whether this is a numeric column */
  isNumeric?: boolean;
  /** Whether this is a URL/link column */
  isLink?: boolean;
}

// ============================================================
// SYSTEM COLUMN DEFINITIONS (always available)
// ============================================================

export const SYSTEM_COLUMNS: ColumnDefinition[] = [
  { id: 'sys:row_number', label: '#', source: 'system', group: 'System', defaultWidth: '40px', align: 'center' },
  { id: 'sys:status', label: 'Status', source: 'system', group: 'System', defaultWidth: '90px' },
  { id: 'sys:hits', label: 'Hits', source: 'system', group: 'System', defaultWidth: '50px', align: 'center' },
  { id: 'sys:top_suggestion', label: 'Top Suggestion', source: 'system', group: 'System', defaultWidth: '160px' },
  { id: 'sys:top_suggestion_mfr', label: 'Sug. Mfr', source: 'system', group: 'System', defaultWidth: '130px' },
  { id: 'sys:top_suggestion_price', label: 'Sug. Price', source: 'system', group: 'System', defaultWidth: '70px', align: 'right', isNumeric: true },
  { id: 'sys:top_suggestion_stock', label: 'Sug. Stock', source: 'system', group: 'System', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'sys:action', label: '', source: 'system', group: 'System', defaultWidth: '40px' },
  { id: 'sys:row_actions', label: '', source: 'system', group: 'System', defaultWidth: '44px' },
];

// ============================================================
// DIGIKEY PRODUCT COLUMN DEFINITIONS (always available)
// ============================================================

const DIGIKEY_PRODUCT_COLUMNS: ColumnDefinition[] = [
  { id: 'dk:digikeyPartNumber', label: 'DigiKey Part #', source: 'digikey-product', enrichedField: 'digikeyPartNumber', group: 'DigiKey: Product ID', defaultWidth: '140px' },
  { id: 'dk:category', label: 'Category', source: 'digikey-product', enrichedField: 'category', group: 'DigiKey: Product Attributes', defaultWidth: '120px' },
  { id: 'dk:subcategory', label: 'Subcategory', source: 'digikey-product', enrichedField: 'subcategory', group: 'DigiKey: Product Attributes', defaultWidth: '140px' },
  { id: 'dk:datasheetUrl', label: 'Datasheet', source: 'digikey-product', enrichedField: 'datasheetUrl', group: 'DigiKey: Documentation', defaultWidth: '80px', isLink: true },
  { id: 'dk:photoUrl', label: 'Photo', source: 'digikey-product', enrichedField: 'photoUrl', group: 'DigiKey: Documentation', defaultWidth: '80px', isLink: true },
  { id: 'dk:productUrl', label: 'Product Page', source: 'digikey-product', enrichedField: 'productUrl', group: 'DigiKey: Documentation', defaultWidth: '80px', isLink: true },
  { id: 'dk:unitPrice', label: 'DK Price', source: 'digikey-product', enrichedField: 'unitPrice', group: 'DigiKey: Pricing', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'dk:quantityAvailable', label: 'DK Stock', source: 'digikey-product', enrichedField: 'quantityAvailable', group: 'DigiKey: Pricing', defaultWidth: '80px', align: 'right', isNumeric: true },
  { id: 'dk:productStatus', label: 'Product Status', source: 'digikey-product', enrichedField: 'productStatus', group: 'DigiKey: Pricing', defaultWidth: '100px' },
  { id: 'dk:rohsStatus', label: 'RoHS Status', source: 'digikey-product', enrichedField: 'rohsStatus', group: 'DigiKey: Compliance', defaultWidth: '100px' },
  { id: 'dk:moistureSensitivityLevel', label: 'MSL', source: 'digikey-product', enrichedField: 'moistureSensitivityLevel', group: 'DigiKey: Compliance', defaultWidth: '60px' },
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
  'dk:unitPrice',
  'dk:quantityAvailable',
  'sys:status',
  'sys:hits',
  'sys:top_suggestion',
  'sys:top_suggestion_mfr',
  'sys:top_suggestion_price',
  'sys:top_suggestion_stock',
  'sys:action',
];

// ============================================================
// DYNAMIC BUILDERS
// ============================================================

/**
 * Scan all rows to collect the set of Digikey parameter keys and their display names.
 * Returns a Map of parameterId → display name.
 */
export function collectParameterKeys(rows: PartsListRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.enrichedData?.parameters) {
      for (const [key, val] of Object.entries(row.enrichedData.parameters)) {
        if (!map.has(key)) {
          map.set(key, val.name);
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
 * @param parameterKeys - Map of Digikey parameterId → display name (from collectParameterKeys)
 */
export function buildAvailableColumns(
  spreadsheetHeaders: string[],
  parameterKeys: Map<string, string>,
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
      group: 'Spreadsheet',
      defaultWidth: '120px',
    });
  });

  // Digikey product columns
  columns.push(...DIGIKEY_PRODUCT_COLUMNS);

  // Digikey parametric columns (dynamic from actual data)
  for (const [key, name] of parameterKeys) {
    columns.push({
      id: `dkp:${key}`,
      label: name,
      source: 'digikey-param',
      parameterKey: key,
      group: 'DigiKey: Parameters',
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
 */
export function getCellValue(
  column: ColumnDefinition,
  row: PartsListRow,
): string | number | undefined {
  switch (column.source) {
    case 'spreadsheet':
      return column.spreadsheetIndex !== undefined
        ? row.rawCells?.[column.spreadsheetIndex]
        : undefined;

    case 'digikey-product': {
      if (!row.enrichedData || !column.enrichedField) return undefined;
      const val = row.enrichedData[column.enrichedField];
      // parameters is a Record, not a display value
      if (column.enrichedField === 'parameters') return undefined;
      return val as string | number | undefined;
    }

    case 'digikey-param':
      if (!row.enrichedData?.parameters || !column.parameterKey) return undefined;
      return row.enrichedData.parameters[column.parameterKey]?.value;

    case 'system':
      // System columns are handled by custom renderers in the table
      return undefined;

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
): string | number | undefined {
  if (column.source !== 'system') {
    return getCellValue(column, row);
  }

  switch (column.id) {
    case 'sys:row_number':
      return row.rowIndex;
    case 'sys:status':
      return row.status;
    case 'sys:hits':
      return row.allRecommendations?.length ?? (row.suggestedReplacement ? 1 : 0);
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
