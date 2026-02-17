/**
 * Parts List localStorage Persistence
 *
 * Stores saved parts lists in localStorage keyed by UUID.
 * Each list stores row data (without heavy allRecommendations to save space).
 */

import { PartsListRow, PartSummary, PartAttributes, XrefRecommendation, EnrichedPartData } from './types';

const STORAGE_KEY = 'xrefs_parts_lists';

/** Lightweight row data for storage (strips allRecommendations and sourceAttributes) */
export interface StoredRow {
  rowIndex: number;
  rawMpn: string;
  rawManufacturer: string;
  rawDescription: string;
  /** All original cell values from the uploaded spreadsheet row */
  rawCells: string[];
  status: PartsListRow['status'];
  resolvedPart?: PartSummary;
  suggestedReplacement?: XrefRecommendation;
  /** Flattened Digikey data stored during validation */
  enrichedData?: EnrichedPartData;
  errorMessage?: string;
}

/** A saved parts list */
export interface SavedPartsList {
  id: string;
  name: string;
  description?: string;
  currency?: string;
  createdAt: string;
  updatedAt: string;
  totalRows: number;
  resolvedCount: number;
  rows: StoredRow[];
  spreadsheetHeaders: string[];
}

/** Summary for listing (no row data) */
export interface PartsListSummary {
  id: string;
  name: string;
  description?: string;
  currency?: string;
  createdAt: string;
  updatedAt: string;
  totalRows: number;
  resolvedCount: number;
  spreadsheetHeaders: string[];
}

function generateId(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAll(): SavedPartsList[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(lists: SavedPartsList[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

/** Strip heavy fields from rows for storage */
function toStoredRows(rows: PartsListRow[]): StoredRow[] {
  return rows.map(r => ({
    rowIndex: r.rowIndex,
    rawMpn: r.rawMpn,
    rawManufacturer: r.rawManufacturer,
    rawDescription: r.rawDescription,
    rawCells: r.rawCells ?? [],
    status: r.status,
    resolvedPart: r.resolvedPart,
    suggestedReplacement: r.suggestedReplacement,
    enrichedData: r.enrichedData,
    errorMessage: r.errorMessage,
  }));
}

/** Convert stored rows back to PartsListRow (without heavy fields) */
function fromStoredRows(stored: StoredRow[]): PartsListRow[] {
  return stored.map(r => ({
    ...r,
    rawCells: r.rawCells ?? [],
    sourceAttributes: undefined,
    allRecommendations: undefined,
  }));
}

// ============================================================
// PUBLIC API
// ============================================================

/** Get summaries of all saved lists (sorted newest first) */
export function getSavedLists(): PartsListSummary[] {
  return readAll()
    .map(({ rows: _rows, ...summary }) => summary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Save a new parts list. Returns the generated ID. */
export function savePartsList(name: string, rows: PartsListRow[]): string {
  const lists = readAll();
  const id = generateId();
  const now = new Date().toISOString();

  lists.push({
    id,
    name,
    createdAt: now,
    updatedAt: now,
    totalRows: rows.length,
    resolvedCount: rows.filter(r => r.status === 'resolved').length,
    rows: toStoredRows(rows),
    spreadsheetHeaders: [],
  });

  writeAll(lists);
  return id;
}

/** Update an existing parts list */
export function updatePartsList(id: string, rows: PartsListRow[]): void {
  const lists = readAll();
  const idx = lists.findIndex(l => l.id === id);
  if (idx < 0) return;

  lists[idx] = {
    ...lists[idx],
    updatedAt: new Date().toISOString(),
    totalRows: rows.length,
    resolvedCount: rows.filter(r => r.status === 'resolved').length,
    rows: toStoredRows(rows),
  };

  writeAll(lists);
}

/** Load a saved parts list by ID */
export function loadPartsList(id: string): { name: string; rows: PartsListRow[] } | null {
  const lists = readAll();
  const list = lists.find(l => l.id === id);
  if (!list) return null;

  return {
    name: list.name,
    rows: fromStoredRows(list.rows),
  };
}

/** Delete a saved parts list */
export function deletePartsList(id: string): void {
  const lists = readAll().filter(l => l.id !== id);
  writeAll(lists);
}
