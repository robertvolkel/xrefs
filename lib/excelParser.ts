/**
 * Client-side spreadsheet parsing using SheetJS.
 * Handles .xlsx, .xls, and .csv files.
 */

import * as XLSX from 'xlsx';
import { ParsedSpreadsheet, ColumnMapping } from './types';

/** Parse a File object into a ParsedSpreadsheet */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Spreadsheet has no sheets');

  const sheet = workbook.Sheets[sheetName];
  const raw: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (raw.length < 2) throw new Error('Spreadsheet must have a header row and at least one data row');

  const headers = raw[0].map(h => String(h).trim());
  const rows = raw.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));

  if (rows.length === 0) throw new Error('No data rows found in spreadsheet');

  return { headers, rows: rows.map(r => r.map(c => String(c).trim())), fileName: file.name };
}

// ============================================================
// COLUMN AUTO-DETECTION
// ============================================================

const MPN_PATTERNS = [
  'mpn', 'part number', 'part no', 'part #', 'part#',
  'mfr part', 'mfg part', 'manufacturer part',
  'manufacturer part number', 'mfr part number', 'mfg part number',
  'pn', 'p/n',
];

const MFR_PATTERNS = [
  'manufacturer', 'mfr', 'mfg', 'brand', 'vendor', 'make',
  'manufacturer name', 'mfr name',
];

const DESC_PATTERNS = [
  'description', 'desc', 'detail', 'name', 'part description',
  'component description', 'item description',
];

function matchesPatterns(header: string, patterns: string[]): boolean {
  const normalized = header.toLowerCase().trim();
  return patterns.some(p => normalized === p || normalized.includes(p));
}

/** Auto-detect column indices for MPN, Manufacturer, Description */
export function autoDetectColumns(headers: string[]): ColumnMapping | null {
  let mpnColumn = -1;
  let manufacturerColumn = -1;
  let descriptionColumn = -1;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (mpnColumn === -1 && matchesPatterns(header, MPN_PATTERNS)) {
      mpnColumn = i;
    } else if (manufacturerColumn === -1 && matchesPatterns(header, MFR_PATTERNS)) {
      manufacturerColumn = i;
    } else if (descriptionColumn === -1 && matchesPatterns(header, DESC_PATTERNS)) {
      descriptionColumn = i;
    }
  }

  // Need at least MPN or description to be useful
  if (mpnColumn === -1 && descriptionColumn === -1) return null;

  return {
    mpnColumn,
    manufacturerColumn,
    descriptionColumn,
  };
}
