'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  PartsListRow,
  ColumnMapping,
  ParsedSpreadsheet,
  XrefRecommendation,
  PartAttributes,
  BatchValidateItem,
} from '@/lib/types';
import { parseSpreadsheetFile, autoDetectColumns } from '@/lib/excelParser';
import { getPartAttributes, getRecommendations, validatePartsList } from '@/lib/api';
import { PartsListSummary } from '@/lib/partsListStorage';
import {
  getSavedListsSupabase,
  savePartsListSupabase,
  updatePartsListSupabase,
  updatePartsListDetailsSupabase,
  loadPartsListSupabase,
  deletePartsListSupabase,
} from '@/lib/supabasePartsListStorage';
import {
  startBackgroundValidation,
  getActiveValidation,
  subscribe as subscribeValidation,
  clearValidation,
} from '@/lib/validationManager';

// ============================================================
// STATE
// ============================================================

export type PartsListPhase = 'empty' | 'mapping' | 'validating' | 'results';

interface PartsListState {
  phase: PartsListPhase;
  parsedData: ParsedSpreadsheet | null;
  columnMapping: ColumnMapping | null;
  rows: PartsListRow[];
  validationProgress: number;
  modalRowIndex: number | null;
  modalSelectedRec: XrefRecommendation | null;
  modalComparisonAttrs: PartAttributes | null;
  modalComparing: boolean;
  error: string | null;
  /** ID of the currently active saved list (null if unsaved) */
  activeListId: string | null;
  /** Name of the current list (from filename or user input) */
  listName: string | null;
  /** User-provided description for AI context */
  listDescription: string | null;
  /** Currency code for pricing (e.g. 'USD', 'CNY') */
  listCurrency: string;
  /** All saved list summaries */
  savedLists: PartsListSummary[];
  /** Original spreadsheet column headers */
  spreadsheetHeaders: string[];
}

const INITIAL_STATE: PartsListState = {
  phase: 'empty',
  parsedData: null,
  columnMapping: null,
  rows: [],
  validationProgress: 0,
  modalRowIndex: null,
  modalSelectedRec: null,
  modalComparisonAttrs: null,
  modalComparing: false,
  error: null,
  activeListId: null,
  listName: null,
  listDescription: null,
  listCurrency: 'USD',
  savedLists: [],
  spreadsheetHeaders: [],
};

// ============================================================
// HOOK
// ============================================================

export function usePartsListState() {
  const [state, setState] = useState<PartsListState>(INITIAL_STATE);
  // Refs to reliably read latest values from async code (setState batching
  // means functional updaters don't run synchronously in React 18)
  const listNameRef = useRef<string | null>(null);
  const listDescriptionRef = useRef<string | null>(null);
  const listCurrencyRef = useRef<string>('USD');
  const activeListIdRef = useRef<string | null>(null);

  // Load saved lists on mount
  useEffect(() => {
    getSavedListsSupabase().then(lists => {
      setState(prev => ({ ...prev, savedLists: lists }));
    });
  }, []);

  // ----------------------------------------------------------
  // Validation manager subscription
  // ----------------------------------------------------------

  // Subscribe to the background validation manager for live updates.
  // The manager runs outside React lifecycle, so validation continues
  // even if this component unmounts.
  useEffect(() => {
    const unsub = subscribeValidation((rows, progress, done, error) => {
      setState(prev => {
        // Only update if we're in a validating/results phase for this list
        if (prev.phase !== 'validating' && prev.phase !== 'results') return prev;
        return {
          ...prev,
          rows,
          validationProgress: progress,
          phase: done ? 'results' : 'validating',
          error: error || prev.error,
        };
      });

      // Refresh saved lists when done so card counts update
      if (done) {
        getSavedListsSupabase().then(lists => {
          setState(prev => ({ ...prev, savedLists: lists }));
        });
      }
    });

    return unsub;
  }, []);

  // ----------------------------------------------------------
  // File handling
  // ----------------------------------------------------------

  const handleFileSelected = useCallback(async (
    file: File,
    overrideName?: string,
    overrideDescription?: string,
  ) => {
    try {
      const parsedData = await parseSpreadsheetFile(file);
      const columnMapping = autoDetectColumns(parsedData.headers, parsedData.rows);

      const name = overrideName || file.name.replace(/\.[^.]+$/, '');
      const desc = overrideDescription ?? null;
      listNameRef.current = name;
      listDescriptionRef.current = desc;
      activeListIdRef.current = null;

      setState(prev => ({
        ...prev,
        phase: 'mapping',
        parsedData,
        columnMapping,
        listName: name,
        listDescription: desc,
        activeListId: null,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to parse file',
      }));
    }
  }, []);

  // ----------------------------------------------------------
  // Column mapping
  // ----------------------------------------------------------

  const handleColumnMappingConfirmed = useCallback(async (mapping: ColumnMapping) => {
    let validRows: PartsListRow[] = [];
    let headers: string[] = [];

    setState(prev => {
      if (!prev.parsedData) return prev;

      headers = prev.parsedData.headers;

      const rows: PartsListRow[] = prev.parsedData.rows.map((row, i) => ({
        rowIndex: i,
        rawMpn: mapping.mpnColumn >= 0 ? (row[mapping.mpnColumn] ?? '') : '',
        rawManufacturer: mapping.manufacturerColumn >= 0 ? (row[mapping.manufacturerColumn] ?? '') : '',
        rawDescription: mapping.descriptionColumn >= 0 ? (row[mapping.descriptionColumn] ?? '') : '',
        rawCells: row,
        status: 'pending' as const,
      }));

      // Keep rows that have either an MPN or a description to search with
      validRows = rows.filter(r => r.rawMpn.trim() !== '' || r.rawDescription.trim() !== '');

      return {
        ...prev,
        phase: 'validating',
        columnMapping: mapping,
        rows: validRows,
        validationProgress: 0,
        spreadsheetHeaders: headers,
      };
    });

    if (validRows.length === 0) return;

    // Save list to Supabase immediately (all rows as "pending") so it
    // appears in the Lists dashboard right away.
    const saveName = listNameRef.current || 'Untitled List';
    const saveDesc = listDescriptionRef.current ?? undefined;
    try {
      const listId = await savePartsListSupabase(saveName, validRows, saveDesc, headers);
      if (listId) {
        activeListIdRef.current = listId;
        setState(prev => ({ ...prev, activeListId: listId }));
      }

      // Start background validation (runs outside React lifecycle)
      startBackgroundValidation(listId || '', validRows, listCurrencyRef.current);
    } catch {
      // Save failed — start validation anyway (just won't persist)
      startBackgroundValidation('', validRows, state.listCurrency);
    }
  }, []);

  const handleColumnMappingCancelled = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'empty', parsedData: null, columnMapping: null, listName: null }));
  }, []);

  // ----------------------------------------------------------
  // Load a saved list
  // ----------------------------------------------------------

  const handleLoadList = useCallback(async (id: string) => {
    // Check if there's an active background validation for this list
    const activeVal = getActiveValidation(id);
    if (activeVal) {
      // Rejoin the in-progress validation
      listNameRef.current = null; // will be set from Supabase data below
      activeListIdRef.current = id;

      // Load the name from Supabase, but use live rows from the manager
      const loaded = await loadPartsListSupabase(id);
      const name = loaded?.name || 'Untitled List';
      const desc = loaded?.description || null;
      listNameRef.current = name;
      listDescriptionRef.current = desc;
      listCurrencyRef.current = loaded?.currency || 'USD';

      setState(prev => ({
        ...prev,
        phase: 'validating',
        rows: activeVal.rows,
        listName: name,
        listDescription: desc,
        listCurrency: listCurrencyRef.current,
        activeListId: id,
        validationProgress: activeVal.progress,
        spreadsheetHeaders: loaded?.spreadsheetHeaders ?? [],
        parsedData: null,
        columnMapping: null,
        error: null,
      }));
      return;
    }

    const loaded = await loadPartsListSupabase(id);
    if (!loaded) return;

    listNameRef.current = loaded.name;
    listDescriptionRef.current = loaded.description || null;
    listCurrencyRef.current = loaded.currency || 'USD';
    activeListIdRef.current = id;

    setState(prev => ({
      ...prev,
      phase: 'results',
      rows: loaded.rows,
      listName: loaded.name,
      listDescription: loaded.description || null,
      listCurrency: listCurrencyRef.current,
      activeListId: id,
      validationProgress: 1,
      spreadsheetHeaders: loaded.spreadsheetHeaders,
      parsedData: null,
      columnMapping: null,
      error: null,
    }));
  }, []);

  // ----------------------------------------------------------
  // Delete a saved list
  // ----------------------------------------------------------

  const handleDeleteList = useCallback(async (id: string) => {
    await deletePartsListSupabase(id);
    const lists = await getSavedListsSupabase();
    setState(prev => ({
      ...prev,
      savedLists: lists,
      // If we deleted the active list, go back to empty
      ...(prev.activeListId === id ? { phase: 'empty' as const, rows: [], activeListId: null, listName: null } : {}),
    }));
  }, []);

  // ----------------------------------------------------------
  // Save after replacement change in modal
  // ----------------------------------------------------------

  const handleModalConfirmReplacement = useCallback((rec: XrefRecommendation) => {
    setState(prev => {
      if (prev.modalRowIndex === null) return prev;

      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === prev.modalRowIndex);
      if (idx >= 0) {
        newRows[idx] = { ...newRows[idx], suggestedReplacement: rec };
      }

      return {
        ...prev,
        rows: newRows,
        modalRowIndex: null,
        modalSelectedRec: null,
        modalComparisonAttrs: null,
        modalComparing: false,
      };
    });

    // Auto-save if this list is persisted (fire-and-forget, read from ref)
    const listId = activeListIdRef.current;
    if (listId) {
      // Small delay so React processes the setState above first
      setTimeout(() => {
        setState(prev => {
          if (prev.activeListId) {
            updatePartsListSupabase(prev.activeListId, prev.rows).catch(() => {});
          }
          return prev;
        });
      }, 0);
    }
  }, []);

  // ----------------------------------------------------------
  // Modal (detail view)
  // ----------------------------------------------------------

  const handleOpenModal = useCallback(async (rowIndex: number) => {
    setState(prev => ({
      ...prev,
      modalRowIndex: rowIndex,
      modalSelectedRec: null,
      modalComparisonAttrs: null,
      modalComparing: false,
    }));

    // Fetch recommendations asynchronously
    const currentRow = state.rows.find(r => r.rowIndex === rowIndex);
    if (currentRow?.resolvedPart && !currentRow.allRecommendations) {
      try {
        const recs = await getRecommendations(currentRow.resolvedPart.mpn);
        setState(prev => {
          const newRows = [...prev.rows];
          const idx = newRows.findIndex(r => r.rowIndex === rowIndex);
          if (idx >= 0) {
            newRows[idx] = { ...newRows[idx], allRecommendations: recs };
          }
          return { ...prev, rows: newRows };
        });
      } catch {
        // Recommendations will show as empty
      }
    }
  }, [state.rows]);

  const handleCloseModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      modalRowIndex: null,
      modalSelectedRec: null,
      modalComparisonAttrs: null,
      modalComparing: false,
    }));
  }, []);

  const handleModalSelectRec = useCallback(async (rec: XrefRecommendation) => {
    setState(prev => ({
      ...prev,
      modalSelectedRec: rec,
      modalComparing: true,
      modalComparisonAttrs: null,
    }));

    try {
      const attrs = await getPartAttributes(rec.part.mpn);
      setState(prev => ({ ...prev, modalComparisonAttrs: attrs }));
    } catch {
      // Comparison view will show without full attributes
    }
  }, []);

  const handleModalBackToRecs = useCallback(() => {
    setState(prev => ({
      ...prev,
      modalSelectedRec: null,
      modalComparisonAttrs: null,
      modalComparing: false,
    }));
  }, []);

  const handleModalRecsRefreshed = useCallback((recs: XrefRecommendation[]) => {
    setState(prev => {
      if (prev.modalRowIndex === null) return prev;
      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === prev.modalRowIndex);
      if (idx >= 0) {
        const topRec = recs.length > 0 ? recs[0] : undefined;
        newRows[idx] = {
          ...newRows[idx],
          allRecommendations: recs,
          suggestedReplacement: topRec ?? newRows[idx].suggestedReplacement,
        };
      }
      return { ...prev, rows: newRows };
    });
  }, []);

  // ----------------------------------------------------------
  // Update list details (name / description)
  // ----------------------------------------------------------

  const handleUpdateListDetails = useCallback(async (name: string, description: string, currency?: string) => {
    const listId = activeListIdRef.current;
    if (!listId) return;

    const currencyChanged = currency != null && currency !== listCurrencyRef.current;

    listNameRef.current = name;
    listDescriptionRef.current = description;
    if (currency) listCurrencyRef.current = currency;
    setState(prev => ({
      ...prev,
      listName: name,
      listDescription: description,
      ...(currency && { listCurrency: currency }),
    }));

    await updatePartsListDetailsSupabase(listId, name, description, currency).catch(() => {});
    const lists = await getSavedListsSupabase();
    setState(prev => ({ ...prev, savedLists: lists }));

    return currencyChanged;
  }, []);

  // ----------------------------------------------------------
  // Refresh selected rows (re-validate)
  // ----------------------------------------------------------

  const handleRefreshRows = useCallback(async (rowIndices: number[]) => {
    if (rowIndices.length === 0) return;
    const indexSet = new Set(rowIndices);

    // Reset selected rows to pending
    setState(prev => ({
      ...prev,
      phase: 'validating',
      error: null,
      rows: prev.rows.map(r =>
        indexSet.has(r.rowIndex)
          ? { ...r, status: 'pending' as const, resolvedPart: undefined, sourceAttributes: undefined, suggestedReplacement: undefined, allRecommendations: undefined, enrichedData: undefined, errorMessage: undefined }
          : r,
      ),
    }));

    // Build items for the subset
    const items = rowIndices.map(idx => {
      // Read from current state via a synchronous snapshot
      const row = state.rows.find(r => r.rowIndex === idx);
      return {
        rowIndex: idx,
        mpn: row?.rawMpn ?? '',
        manufacturer: row?.rawManufacturer || undefined,
        description: row?.rawDescription || undefined,
      };
    });

    try {
      const stream = await validatePartsList(items, listCurrencyRef.current);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item: BatchValidateItem = JSON.parse(line);
            setState(prev => {
              const newRows = [...prev.rows];
              const idx = newRows.findIndex(r => r.rowIndex === item.rowIndex);
              if (idx >= 0) {
                newRows[idx] = {
                  ...newRows[idx],
                  status: item.status,
                  resolvedPart: item.resolvedPart,
                  sourceAttributes: item.sourceAttributes,
                  suggestedReplacement: item.suggestedReplacement,
                  allRecommendations: item.allRecommendations,
                  enrichedData: item.enrichedData,
                  errorMessage: item.errorMessage,
                };
              }
              const pending = newRows.filter(r => indexSet.has(r.rowIndex) && r.status === 'pending').length;
              return {
                ...prev,
                rows: newRows,
                phase: pending === 0 ? 'results' : 'validating',
              };
            });
          } catch { /* skip malformed lines */ }
        }
      }

      // Final state + persist
      setState(prev => ({ ...prev, phase: 'results' }));
      const listId = activeListIdRef.current;
      if (listId) {
        setState(prev => {
          updatePartsListSupabase(listId, prev.rows).catch(() => {});
          return prev;
        });
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        phase: 'results',
        error: error instanceof Error ? error.message : 'Refresh failed',
      }));
    }
  }, [state.rows]);

  // ----------------------------------------------------------
  // Delete selected rows
  // ----------------------------------------------------------

  const handleDeleteRows = useCallback(async (rowIndices: number[]) => {
    if (rowIndices.length === 0) return;
    const indexSet = new Set(rowIndices);

    setState(prev => {
      const newRows = prev.rows.filter(r => !indexSet.has(r.rowIndex));
      return { ...prev, rows: newRows };
    });

    const listId = activeListIdRef.current;
    if (listId) {
      // Persist the updated rows (read from next state)
      setTimeout(() => {
        setState(prev => {
          updatePartsListSupabase(listId, prev.rows).catch(() => {});
          return prev;
        });
      }, 0);
    }
  }, []);

  // ----------------------------------------------------------
  // Reset
  // ----------------------------------------------------------

  const handleReset = useCallback(() => {
    listNameRef.current = null;
    listDescriptionRef.current = null;
    listCurrencyRef.current = 'USD';
    activeListIdRef.current = null;
    clearValidation();
    setState(prev => ({ ...INITIAL_STATE, savedLists: prev.savedLists }));
  }, []);

  // ----------------------------------------------------------
  // Derived values
  // ----------------------------------------------------------

  const modalRow = state.modalRowIndex !== null
    ? state.rows.find(r => r.rowIndex === state.modalRowIndex) ?? null
    : null;

  return {
    ...state,
    modalRow,
    handleFileSelected,
    handleColumnMappingConfirmed,
    handleColumnMappingCancelled,
    handleLoadList,
    handleDeleteList,
    handleOpenModal,
    handleCloseModal,
    handleModalSelectRec,
    handleModalBackToRecs,
    handleModalConfirmReplacement,
    handleModalRecsRefreshed,
    handleReset,
    handleUpdateListDetails,
    handleRefreshRows,
    handleDeleteRows,
  };
}
