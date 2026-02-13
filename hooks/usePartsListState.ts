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
import { validatePartsList, getPartAttributes, getRecommendations } from '@/lib/api';
import { PartsListSummary } from '@/lib/partsListStorage';
import {
  getSavedListsSupabase,
  savePartsListSupabase,
  updatePartsListSupabase,
  loadPartsListSupabase,
  deletePartsListSupabase,
} from '@/lib/supabasePartsListStorage';

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
  /** Name of the current list (from filename) */
  listName: string | null;
  /** All saved list summaries */
  savedLists: PartsListSummary[];
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
  savedLists: [],
};

// ============================================================
// HOOK
// ============================================================

export function usePartsListState() {
  const [state, setState] = useState<PartsListState>(INITIAL_STATE);
  // Guard against StrictMode double-invoking setState updaters with side effects
  const savedRef = useRef(false);

  // Load saved lists on mount
  useEffect(() => {
    getSavedListsSupabase().then(lists => {
      setState(prev => ({ ...prev, savedLists: lists }));
    });
  }, []);

  // ----------------------------------------------------------
  // File handling
  // ----------------------------------------------------------

  const handleFileSelected = useCallback(async (file: File) => {
    try {
      const parsedData = await parseSpreadsheetFile(file);
      const columnMapping = autoDetectColumns(parsedData.headers);

      setState(prev => ({
        ...prev,
        phase: 'mapping',
        parsedData,
        columnMapping,
        listName: file.name.replace(/\.[^.]+$/, ''),
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
  // Batch validation (defined before column mapping so it can be called directly)
  // ----------------------------------------------------------

  const startValidation = useCallback(async (initialRows: PartsListRow[]) => {
    savedRef.current = false;
    // Keep a local copy of rows so we can save the final state without reading React state
    let localRows = [...initialRows];

    const items = initialRows.map(r => ({
      rowIndex: r.rowIndex,
      mpn: r.rawMpn,
      manufacturer: r.rawManufacturer || undefined,
      description: r.rawDescription || undefined,
    }));

    try {
      const stream = await validatePartsList(items);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let processed = 0;
      const total = items.length;

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
            processed++;

            // Update local copy
            const localIdx = localRows.findIndex(r => r.rowIndex === item.rowIndex);
            if (localIdx >= 0) {
              localRows[localIdx] = {
                ...localRows[localIdx],
                status: item.status,
                resolvedPart: item.resolvedPart,
                sourceAttributes: item.sourceAttributes,
                suggestedReplacement: item.suggestedReplacement,
                allRecommendations: item.allRecommendations,
                errorMessage: item.errorMessage,
              };
            }

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
                  errorMessage: item.errorMessage,
                };
              }
              return {
                ...prev,
                rows: newRows,
                validationProgress: processed / total,
              };
            });
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Validation complete — save to Supabase
      if (!savedRef.current) {
        savedRef.current = true;

        // Read name/listId from state via functional update
        let saveName = 'Untitled List';
        let saveListId: string | null = null;
        setState(prev => {
          saveName = prev.listName ?? 'Untitled List';
          saveListId = prev.activeListId;
          return { ...prev, phase: 'results', validationProgress: 1 };
        });

        // Async save using local rows (avoids stale state reads)
        try {
          if (saveListId) {
            await updatePartsListSupabase(saveListId, localRows);
          } else {
            saveListId = await savePartsListSupabase(saveName, localRows);
          }
          const lists = await getSavedListsSupabase();
          setState(prev => ({
            ...prev,
            activeListId: saveListId,
            savedLists: lists,
          }));
        } catch {
          // Save failed silently — user can still see results
        }
      } else {
        setState(prev => ({ ...prev, phase: 'results', validationProgress: 1 }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        phase: 'results',
        error: error instanceof Error ? error.message : 'Validation failed',
      }));
    }
  }, []);

  // ----------------------------------------------------------
  // Column mapping
  // ----------------------------------------------------------

  const handleColumnMappingConfirmed = useCallback((mapping: ColumnMapping) => {
    let validRows: PartsListRow[] = [];

    setState(prev => {
      if (!prev.parsedData) return prev;

      const rows: PartsListRow[] = prev.parsedData.rows.map((row, i) => ({
        rowIndex: i,
        rawMpn: mapping.mpnColumn >= 0 ? (row[mapping.mpnColumn] ?? '') : '',
        rawManufacturer: mapping.manufacturerColumn >= 0 ? (row[mapping.manufacturerColumn] ?? '') : '',
        rawDescription: mapping.descriptionColumn >= 0 ? (row[mapping.descriptionColumn] ?? '') : '',
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
      };
    });

    // Start validation directly (no useEffect needed — prevents StrictMode double-fire)
    if (validRows.length > 0) {
      startValidation(validRows);
    }
  }, [startValidation]);

  const handleColumnMappingCancelled = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'empty', parsedData: null, columnMapping: null, listName: null }));
  }, []);

  // ----------------------------------------------------------
  // Load a saved list
  // ----------------------------------------------------------

  const handleLoadList = useCallback(async (id: string) => {
    const loaded = await loadPartsListSupabase(id);
    if (!loaded) return;

    setState(prev => ({
      ...prev,
      phase: 'results',
      rows: loaded.rows,
      listName: loaded.name,
      activeListId: id,
      validationProgress: 1,
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
    let rowsToSave: PartsListRow[] | null = null;
    let listIdToSave: string | null = null;

    setState(prev => {
      if (prev.modalRowIndex === null) return prev;

      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === prev.modalRowIndex);
      if (idx >= 0) {
        newRows[idx] = { ...newRows[idx], suggestedReplacement: rec };
      }

      // Capture for async save
      if (prev.activeListId) {
        rowsToSave = newRows;
        listIdToSave = prev.activeListId;
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

    // Auto-save if this list is persisted (fire-and-forget)
    if (rowsToSave && listIdToSave) {
      updatePartsListSupabase(listIdToSave, rowsToSave).catch(() => {});
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

  // ----------------------------------------------------------
  // Reset
  // ----------------------------------------------------------

  const handleReset = useCallback(() => {
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
    handleReset,
  };
}
