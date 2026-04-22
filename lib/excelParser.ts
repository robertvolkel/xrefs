/**
 * Client-side spreadsheet parsing using SheetJS.
 * Handles .xlsx, .xls, and .csv files.
 */

import * as XLSX from 'xlsx';
import { ParsedSpreadsheet, ColumnMapping } from './types';

/** Read the raw rows for a given sheet */
function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): string[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  return raw;
}

/**
 * Parse a File object into a ParsedSpreadsheet.
 * If `sheetName` is provided, reads that sheet. Otherwise defaults to the first
 * sheet — and, if the workbook has multiple sheets but the first is empty,
 * automatically falls back to the first non-empty sheet.
 */
export async function parseSpreadsheetFile(
  file: File,
  sheetName?: string,
): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) throw new Error('Spreadsheet has no sheets');

  // Resolve which sheet to read
  let activeSheet = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  let raw = readSheetRows(workbook, activeSheet);

  // If caller didn't specify a sheet and the default is empty, pick the first
  // non-empty sheet so users with a summary/cover tab don't hit a dead end.
  if (!sheetName && raw.length < 2 && sheetNames.length > 1) {
    for (const name of sheetNames) {
      const candidate = readSheetRows(workbook, name);
      if (candidate.length >= 2) {
        activeSheet = name;
        raw = candidate;
        break;
      }
    }
  }

  if (raw.length < 2) {
    throw new Error(
      sheetNames.length > 1
        ? `Sheet "${activeSheet}" has no data. Pick a different sheet to continue.`
        : 'Spreadsheet must have a header row and at least one data row',
    );
  }

  const headers = raw[0].map(h => String(h).trim());
  const rows = raw.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));

  if (rows.length === 0) {
    throw new Error(
      sheetNames.length > 1
        ? `Sheet "${activeSheet}" has no data rows. Pick a different sheet to continue.`
        : 'No data rows found in spreadsheet',
    );
  }

  return {
    headers,
    rows: rows.map(r => r.map(c => String(c).trim())),
    fileName: file.name,
    sheetNames,
    activeSheet,
  };
}

// ============================================================
// COLUMN AUTO-DETECTION
// ============================================================

export const MPN_PATTERNS = [
  'mpn', 'part number', 'part no', 'part #', 'part#',
  'mfr part', 'mfg part', 'manufacturer part',
  'manufacturer part number', 'mfr part number', 'mfg part number',
  'pn', 'p/n',
];

export const MFR_PATTERNS = [
  'manufacturer', 'mfr', 'mfg', 'brand', 'vendor', 'make',
  'manufacturer name', 'mfr name',
];

export const DESC_PATTERNS = [
  'description', 'desc', 'detail', 'part description',
  'component description', 'item description', 'part name',
  'component name', 'item name', 'name',
];

export const CPN_PATTERNS = [
  'cpn', 'customer part number', 'customer part', 'customer pn',
  'customer number', 'customer p/n',
];

export const IPN_PATTERNS = [
  'ipn', 'internal part number', 'internal pn', 'internal p/n',
  'internal number',
];

export const QTY_PATTERNS = [
  'qty', 'quantity', 'qnty', 'count', 'amount', 'qty.',
];

/**
 * Score how well a header matches a set of patterns.
 * Exact match = 1000 + pattern length (highly specific).
 * Substring match = pattern length (longer patterns score higher).
 * Returns 0 for no match.
 */
export function scoreHeader(header: string, patterns: string[]): number {
  const normalized = header.toLowerCase().trim();
  let best = 0;
  for (const p of patterns) {
    if (normalized === p) return 1000 + p.length; // exact match, can't beat this
    if (normalized.includes(p)) best = Math.max(best, p.length);
  }
  return best;
}

/** Descriptions contain semicolons, units, and longer text */
function scoreContentAsDescription(rows: string[][], colIndex: number): number {
  const sample = rows.slice(0, 10);
  let score = 0;
  for (const row of sample) {
    const cell = row[colIndex] || '';
    if (cell.includes(';')) score += 3;
    if (cell.length > 20) score += 2;
    if (/\d+\s*(V|A|[uµnp]F|ohm|Ω|%|mA|W|MHz|kHz)/i.test(cell)) score += 2;
  }
  return score;
}

/** MPNs are short alphanumeric codes */
function scoreContentAsMPN(rows: string[][], colIndex: number): number {
  const sample = rows.slice(0, 10);
  let score = 0;
  for (const row of sample) {
    const cell = (row[colIndex] || '').trim();
    if (!cell) continue;
    if (cell.length >= 3 && cell.length <= 40 && /^[A-Z0-9]/i.test(cell)) score += 2;
    if (!cell.includes(';') && cell.split(/\s+/).length <= 3) score += 1;
  }
  return score;
}

/**
 * Auto-detect column indices for MPN, Manufacturer, Description.
 * Uses a scoring system: exact header matches beat substring matches,
 * with content-based heuristics as a tiebreaker.
 */
export function autoDetectColumns(headers: string[], rows?: string[][]): ColumnMapping | null {
  type Field = 'mpn' | 'mfr' | 'desc' | 'cpn' | 'ipn' | 'qty';
  const fields: Field[] = ['mpn', 'mfr', 'desc', 'cpn', 'ipn', 'qty'];
  const patternMap: Record<Field, string[]> = {
    mpn: MPN_PATTERNS,
    mfr: MFR_PATTERNS,
    desc: DESC_PATTERNS,
    cpn: CPN_PATTERNS,
    ipn: IPN_PATTERNS,
    qty: QTY_PATTERNS,
  };

  // Score every column for every field (header-based)
  const scores: Record<Field, number[]> = {
    mpn: headers.map((h) => scoreHeader(h, patternMap.mpn)),
    mfr: headers.map((h) => scoreHeader(h, patternMap.mfr)),
    desc: headers.map((h) => scoreHeader(h, patternMap.desc)),
    cpn: headers.map((h) => scoreHeader(h, patternMap.cpn)),
    ipn: headers.map((h) => scoreHeader(h, patternMap.ipn)),
    qty: headers.map((h) => scoreHeader(h, patternMap.qty)),
  };

  // Add content-based bonus when rows are available
  if (rows && rows.length > 0) {
    for (let i = 0; i < headers.length; i++) {
      scores.desc[i] += scoreContentAsDescription(rows, i) * 0.5;
      scores.mpn[i] += scoreContentAsMPN(rows, i) * 0.5;
    }
  }

  // Greedy assignment: pick highest-scoring column per field (MPN > MFR > DESC > CPN > IPN > QTY).
  // Each column can only be assigned to one field.
  const assigned = new Set<number>();
  const result: Record<Field, number> = { mpn: -1, mfr: -1, desc: -1, cpn: -1, ipn: -1, qty: -1 };

  for (const field of fields) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < headers.length; i++) {
      if (assigned.has(i)) continue;
      if (scores[field][i] > bestScore) {
        bestScore = scores[field][i];
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      assigned.add(bestIdx);
      result[field] = bestIdx;
    }
  }

  if (result.mpn === -1 && result.desc === -1) return null;

  return {
    mpnColumn: result.mpn,
    manufacturerColumn: result.mfr,
    descriptionColumn: result.desc,
    ...(result.cpn >= 0 ? { cpnColumn: result.cpn } : {}),
    ...(result.ipn >= 0 ? { ipnColumn: result.ipn } : {}),
    ...(result.qty >= 0 ? { qtyColumn: result.qty } : {}),
  };
}
