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
  'description', 'desc', 'detail', 'part description',
  'component description', 'item description', 'part name',
  'component name', 'item name', 'name',
];

/**
 * Score how well a header matches a set of patterns.
 * Exact match = 1000 + pattern length (highly specific).
 * Substring match = pattern length (longer patterns score higher).
 * Returns 0 for no match.
 */
function scoreHeader(header: string, patterns: string[]): number {
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
  type Field = 'mpn' | 'mfr' | 'desc';
  const fields: Field[] = ['mpn', 'mfr', 'desc'];
  const patternMap: Record<Field, string[]> = {
    mpn: MPN_PATTERNS,
    mfr: MFR_PATTERNS,
    desc: DESC_PATTERNS,
  };

  // Score every column for every field (header-based)
  const scores: Record<Field, number[]> = {
    mpn: headers.map((h) => scoreHeader(h, patternMap.mpn)),
    mfr: headers.map((h) => scoreHeader(h, patternMap.mfr)),
    desc: headers.map((h) => scoreHeader(h, patternMap.desc)),
  };

  // Add content-based bonus when rows are available
  if (rows && rows.length > 0) {
    for (let i = 0; i < headers.length; i++) {
      scores.desc[i] += scoreContentAsDescription(rows, i) * 0.5;
      scores.mpn[i] += scoreContentAsMPN(rows, i) * 0.5;
    }
  }

  // Greedy assignment: pick highest-scoring column per field (MPN > MFR > DESC).
  // Each column can only be assigned to one field.
  const assigned = new Set<number>();
  const result: Record<Field, number> = { mpn: -1, mfr: -1, desc: -1 };

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
  };
}
