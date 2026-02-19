/**
 * Parse pasted text (tab-separated, CSV, or plain MPN list) into ParsedSpreadsheet.
 * Converges with the excelParser pipeline at the same output type.
 */

import { ParsedSpreadsheet } from './types';

// ============================================================
// DELIMITER DETECTION
// ============================================================

/**
 * Detect whether lines use tabs, commas, or no delimiter.
 * Tabs preferred (most common when copy-pasting from Excel/Sheets).
 */
function detectDelimiter(lines: string[]): string | null {
  const sample = lines.filter(l => l.trim()).slice(0, 10);
  if (sample.length === 0) return null;

  const tabCounts = sample.map(l => (l.match(/\t/g) || []).length);
  const commaCounts = sample.map(l => (l.match(/,/g) || []).length);

  const avgTabs = tabCounts.reduce((a, b) => a + b, 0) / sample.length;
  const avgCommas = commaCounts.reduce((a, b) => a + b, 0) / sample.length;

  // Check consistency — a good delimiter appears in most lines at a similar count
  const tabConsistent = tabCounts.filter(c => c > 0).length >= sample.length * 0.6 && avgTabs >= 1;
  const commaConsistent = commaCounts.filter(c => c > 0).length >= sample.length * 0.6 && avgCommas >= 1;

  // Prefer tab (Excel/Sheets copy always uses tabs)
  if (tabConsistent && avgTabs >= 1) return '\t';
  if (commaConsistent && avgCommas >= 1) return ',';

  // Fallback: any tabs → tab; any commas → comma
  if (avgTabs >= 1) return '\t';
  if (avgCommas >= 1) return ',';

  return null; // single-column (plain MPN list)
}

// ============================================================
// LINE PARSING
// ============================================================

/** Parse a single CSV line with RFC 4180 quoting support */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Parse a single line with the detected delimiter */
function parseLine(line: string, delimiter: string | null): string[] {
  if (delimiter === null) return [line.trim()];
  if (delimiter === ',') return parseCSVLine(line);
  return line.split(delimiter);
}

// ============================================================
// HEADER DETECTION
// ============================================================

const HEADER_KEYWORDS = [
  'mpn', 'part number', 'part no', 'part #', 'part#', 'p/n', 'pn',
  'manufacturer', 'mfr', 'mfg', 'brand', 'vendor',
  'description', 'desc', 'detail', 'part name',
  'qty', 'quantity', 'reference', 'ref', 'designator',
  'value', 'footprint', 'package', 'supplier', 'price',
];

/** Heuristic: does the first row look like column headers? */
function detectHeaderRow(rows: string[][]): boolean {
  if (rows.length < 2) return false;

  const firstRow = rows[0];
  const firstRowLower = firstRow.map(c => c.toLowerCase().trim());

  // If any cell in the first row matches a known header keyword, treat it as a header
  const headerMatches = firstRowLower.filter(c =>
    HEADER_KEYWORDS.some(kw => c === kw || c.includes(kw)),
  ).length;
  if (headerMatches >= 1) return true;

  // If first row has no part-number-like values but data rows do, it's a header
  const partNumberPattern = /^[A-Z0-9]{3,}[-/][A-Z0-9]/i;
  const firstRowHasPartNumbers = firstRow.some(c => partNumberPattern.test(c.trim()));
  const dataRows = rows.slice(1, Math.min(6, rows.length));
  const dataHasPartNumbers = dataRows.some(row =>
    row.some(c => partNumberPattern.test(c.trim())),
  );
  if (!firstRowHasPartNumbers && dataHasPartNumbers) return true;

  return false;
}

// ============================================================
// MAIN PARSER
// ============================================================

/**
 * Parse pasted text into a ParsedSpreadsheet.
 *
 * Supports:
 * - Tab-separated (copied from Excel/Sheets)
 * - Comma-separated (CSV)
 * - Plain list of MPNs (one per line)
 *
 * Auto-detects delimiter and whether the first row is a header.
 */
export function parseTextInput(text: string): ParsedSpreadsheet {
  // 1. Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Split into lines, trim trailing empties
  let lines = normalized.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) throw new Error('No data found in pasted text');

  // 3. Detect delimiter
  const delimiter = detectDelimiter(lines);

  // 4. Parse all lines
  const allRows = lines.map(line => parseLine(line, delimiter));

  // 5. Normalize column count (pad short rows)
  const maxCols = Math.max(...allRows.map(r => r.length));
  const paddedRows = allRows.map(r => {
    const padded = [...r];
    while (padded.length < maxCols) padded.push('');
    return padded.map(c => c.trim());
  });

  // 6. Detect headers
  const hasHeader = detectHeaderRow(paddedRows);

  let headers: string[];
  let dataRows: string[][];

  if (hasHeader) {
    headers = paddedRows[0];
    dataRows = paddedRows.slice(1);
  } else {
    // Synthetic headers
    if (maxCols === 1) {
      headers = ['MPN'];
    } else {
      headers = paddedRows[0].map((_, i) => `Column ${i + 1}`);
    }
    dataRows = paddedRows;
  }

  // 7. Filter empty rows
  dataRows = dataRows.filter(row => row.some(cell => cell !== ''));

  if (dataRows.length === 0) throw new Error('No data rows found in pasted text');

  return {
    headers,
    rows: dataRows,
    fileName: 'Pasted Data',
  };
}
