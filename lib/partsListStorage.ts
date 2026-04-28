/**
 * Parts List localStorage Persistence
 *
 * Stores saved parts lists in localStorage keyed by UUID.
 * Each list stores row data (without heavy allRecommendations to save space).
 */

import { PartsListRow, PartSummary, PartAttributes, XrefRecommendation, EnrichedPartData, PartType, computeRecommendationCounts } from './types';
import { classifyListTheme } from './themeClassifier';

const STORAGE_KEY = 'xrefs_parts_lists';

/** Lightweight row data for storage (strips allRecommendations and sourceAttributes) */
export interface StoredRow {
  rowIndex: number;
  rawMpn: string;
  rawManufacturer: string;
  rawDescription: string;
  /** Customer Part Number (optional mapped column) */
  rawCpn?: string;
  /** Internal Part Number (optional mapped column) */
  rawIpn?: string;
  /** Quantity (optional mapped column) */
  rawQty?: string;
  /** Current unit cost (optional mapped column) */
  rawUnitCost?: string;
  /** All original cell values from the uploaded spreadsheet row */
  rawCells: string[];
  status: PartsListRow['status'];
  resolvedPart?: PartSummary;
  /** Top replacement proposed for this row. */
  replacement?: XrefRecommendation;
  /** Up to 4 alternate non-failing replacements for sub-row display. */
  replacementAlternates?: XrefRecommendation[];
  /** @deprecated legacy alias of `replacement` — read-only back-compat for rows saved before Apr 2026. */
  suggestedReplacement?: XrefRecommendation;
  /** @deprecated legacy alias of `replacementAlternates` — read-only back-compat for rows saved before Apr 2026. */
  topNonFailingRecs?: XrefRecommendation[];
  /** Total recommendation count — for accurate hits column on load */
  recommendationCount?: number;
  /** Mutually-exclusive bucket counts (Accuris > MFR > Logic) */
  logicDrivenCount?: number;
  mfrCertifiedCount?: number;
  accurisCertifiedCount?: number;
  /** MPN explicitly chosen by user as preferred alternate */
  preferredMpn?: string;
  /** Flattened Digikey data stored during validation */
  enrichedData?: EnrichedPartData;
  errorMessage?: string;
  /** BOM line item classification */
  partType?: PartType;
  /** Top search candidates when status='ambiguous' — persisted so the picker
   *  can render them after a page reload without re-running batch validation. */
  candidateMatches?: PartSummary[];
  /** Up to 5 viable replacements (certified or rule-passing) sorted by best FC
   *  unit price ascending — persisted so the "Lowest Repl. Price (FC)" column
   *  survives reload without re-fetching full recs. */
  cheapestViableRecs?: XrefRecommendation[];
}

/** A saved parts list */
export interface SavedPartsList {
  id: string;
  name: string;
  description?: string;
  currency?: string;
  customer?: string;
  defaultViewId?: string;
  themeIcon?: string;
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
  customer?: string;
  defaultViewId?: string;
  themeIcon?: string;
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
  return rows.map(r => {
    // Derive top non-failing sub-recs (positions #2–#5) from live data.
    // Widened to support up to 5 total suggestions per row (Decision #145 Phase 1 follow-up).
    const nonFailing = r.allRecommendations
      ?.filter(rec => !rec.matchDetails.some(d => d.ruleResult === 'fail'))
      .slice(1, 5);

    const computed = r.allRecommendations ? computeRecommendationCounts(r.allRecommendations) : null;

    return {
      rowIndex: r.rowIndex,
      rawMpn: r.rawMpn,
      rawManufacturer: r.rawManufacturer,
      rawDescription: r.rawDescription,
      rawCpn: r.rawCpn,
      rawIpn: r.rawIpn,
      rawQty: r.rawQty,
      rawUnitCost: r.rawUnitCost,
      rawCells: r.rawCells ?? [],
      status: r.status,
      resolvedPart: r.resolvedPart,
      replacement: r.replacement,
      replacementAlternates: nonFailing?.length ? nonFailing : r.replacementAlternates,
      recommendationCount: r.allRecommendations?.length ?? r.recommendationCount,
      logicDrivenCount: computed?.logicDrivenCount ?? r.logicDrivenCount,
      mfrCertifiedCount: computed?.mfrCertifiedCount ?? r.mfrCertifiedCount,
      accurisCertifiedCount: computed?.accurisCertifiedCount ?? r.accurisCertifiedCount,
      enrichedData: r.enrichedData,
      errorMessage: r.errorMessage,
    };
  });
}

/** Convert stored rows back to PartsListRow (without heavy fields).
 *  Reads either the new (`replacement`, `replacementAlternates`) or legacy
 *  (`suggestedReplacement`, `topNonFailingRecs`) keys — rows saved before the
 *  Apr 2026 rename progressively migrate on next save. */
function fromStoredRows(stored: StoredRow[]): PartsListRow[] {
  return stored.map(r => {
    // Read legacy keys once, drop them from the mapped output.
    const legacyReplacement = (r as { suggestedReplacement?: XrefRecommendation }).suggestedReplacement;
    const legacyAlternates = (r as { topNonFailingRecs?: XrefRecommendation[] }).topNonFailingRecs;
    const { suggestedReplacement: _s, topNonFailingRecs: _t, ...rest } = r as StoredRow & {
      suggestedReplacement?: XrefRecommendation;
      topNonFailingRecs?: XrefRecommendation[];
    };
    void _s; void _t;
    return {
      ...rest,
      rawCells: r.rawCells ?? [],
      sourceAttributes: undefined,
      allRecommendations: undefined,
      replacement: rest.replacement ?? legacyReplacement,
      replacementAlternates: rest.replacementAlternates ?? legacyAlternates,
      recommendationCount: r.recommendationCount,
      logicDrivenCount: r.logicDrivenCount,
      mfrCertifiedCount: r.mfrCertifiedCount,
      accurisCertifiedCount: r.accurisCertifiedCount,
    };
  });
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
    themeIcon: classifyListTheme(name, '', ''),
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
