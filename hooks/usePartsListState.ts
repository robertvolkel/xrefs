'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  PartsListRow,
  ColumnMapping,
  ParsedSpreadsheet,
  XrefRecommendation,
  PartAttributes,
  BatchValidateItem,
  PartSummary,
  PartType,
} from '@/lib/types';
import { parseSpreadsheetFile, autoDetectColumns } from '@/lib/excelParser';
import { getPartAttributes, getRecommendations, validatePartsList, enrichWithFCBatch } from '@/lib/api';
import { PartsListSummary } from '@/lib/partsListStorage';
import { ViewState } from '@/lib/viewConfigStorage';
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
  cancelValidation,
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
  /** Customer name for this list */
  listCustomer: string | null;
  /** Default view ID for this list */
  listDefaultViewId: string | null;
  /** All saved list summaries */
  savedLists: PartsListSummary[];
  /** Original spreadsheet column headers */
  spreadsheetHeaders: string[];
  /** Per-list view configurations (null = not yet loaded / use templates) */
  listViewConfigs: ViewState | null;
  /** Timestamp of last completed validation/refresh */
  lastRefreshedAt: Date | null;
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
  listCustomer: null,
  listDefaultViewId: null,
  savedLists: [],
  spreadsheetHeaders: [],
  listViewConfigs: null,
  lastRefreshedAt: null,
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
  const listCustomerRef = useRef<string | null>(null);
  const listDefaultViewIdRef = useRef<string | null>(null);
  const activeListIdRef = useRef<string | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);

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
          ...(done ? { lastRefreshedAt: new Date() } : {}),
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
    overrideCustomer?: string,
    overrideDefaultViewId?: string,
  ) => {
    try {
      const parsedData = await parseSpreadsheetFile(file);
      const columnMapping = autoDetectColumns(parsedData.headers, parsedData.rows);

      const name = overrideName || file.name.replace(/\.[^.]+$/, '');
      const desc = overrideDescription ?? null;
      const cust = overrideCustomer ?? null;
      const viewId = overrideDefaultViewId ?? null;
      listNameRef.current = name;
      listDescriptionRef.current = desc;
      listCustomerRef.current = cust;
      listDefaultViewIdRef.current = viewId;
      activeListIdRef.current = null;

      setState(prev => ({
        ...prev,
        phase: 'mapping',
        parsedData,
        columnMapping,
        listName: name,
        listDescription: desc,
        listCustomer: cust,
        listDefaultViewId: viewId,
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

  /** Entry point for pre-parsed data (e.g. pasted text). Skips file parsing. */
  const handleParsedDataReady = useCallback((
    parsed: ParsedSpreadsheet,
    overrideName?: string,
    overrideDescription?: string,
    overrideCustomer?: string,
    overrideDefaultViewId?: string,
  ) => {
    const columnMapping = autoDetectColumns(parsed.headers, parsed.rows);

    const name = overrideName || parsed.fileName;
    const desc = overrideDescription ?? null;
    const cust = overrideCustomer ?? null;
    const viewId = overrideDefaultViewId ?? null;
    listNameRef.current = name;
    listDescriptionRef.current = desc;
    listCustomerRef.current = cust;
    listDefaultViewIdRef.current = viewId;
    activeListIdRef.current = null;

    setState(prev => ({
      ...prev,
      phase: 'mapping',
      parsedData: parsed,
      columnMapping,
      listName: name,
      listDescription: desc,
      listCustomer: cust,
      listDefaultViewId: viewId,
      activeListId: null,
      error: null,
    }));
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
        ...(mapping.cpnColumn != null && mapping.cpnColumn >= 0
          ? { rawCpn: row[mapping.cpnColumn] ?? '' }
          : {}),
        ...(mapping.ipnColumn != null && mapping.ipnColumn >= 0
          ? { rawIpn: row[mapping.ipnColumn] ?? '' }
          : {}),
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
      const saveCustomer = listCustomerRef.current ?? undefined;
      const saveDefaultViewId = listDefaultViewIdRef.current ?? undefined;
      const listId = await savePartsListSupabase(saveName, validRows, saveDesc, headers, saveCustomer, saveDefaultViewId);
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
      listCustomerRef.current = loaded?.customer || null;
      listDefaultViewIdRef.current = loaded?.defaultViewId || null;

      setState(prev => ({
        ...prev,
        phase: 'validating',
        rows: activeVal.rows,
        listName: name,
        listDescription: desc,
        listCurrency: listCurrencyRef.current,
        listCustomer: listCustomerRef.current,
        listDefaultViewId: listDefaultViewIdRef.current,
        activeListId: id,
        validationProgress: activeVal.progress,
        spreadsheetHeaders: loaded?.spreadsheetHeaders ?? [],
        listViewConfigs: loaded?.viewConfigs ?? null,
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
    listCustomerRef.current = loaded.customer || null;
    listDefaultViewIdRef.current = loaded.defaultViewId || null;
    activeListIdRef.current = id;

    setState(prev => ({
      ...prev,
      phase: 'results',
      rows: loaded.rows,
      listName: loaded.name,
      listDescription: loaded.description || null,
      listCurrency: listCurrencyRef.current,
      listCustomer: listCustomerRef.current,
      listDefaultViewId: listDefaultViewIdRef.current,
      activeListId: id,
      validationProgress: 1,
      spreadsheetHeaders: loaded.spreadsheetHeaders,
      listViewConfigs: loaded.viewConfigs,
      parsedData: null,
      columnMapping: null,
      error: null,
      lastRefreshedAt: loaded.updatedAt ? new Date(loaded.updatedAt) : new Date(),
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
        newRows[idx] = { ...newRows[idx], suggestedReplacement: rec, preferredMpn: rec.part.mpn };
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

    const currentRow = state.rows.find(r => r.rowIndex === rowIndex);
    if (!currentRow?.resolvedPart) return;

    const mpn = currentRow.resolvedPart.mpn;
    const needsAttrs = !currentRow.sourceAttributes;
    const needsRecs = !currentRow.allRecommendations;

    if (!needsAttrs && !needsRecs) return; // Both already cached

    // Fetch in parallel and update row atomically
    const [attrs, recs] = await Promise.all([
      needsAttrs ? getPartAttributes(mpn).catch(() => null) : Promise.resolve(null),
      needsRecs ? getRecommendations(mpn).catch(() => null) : Promise.resolve(null),
    ]);

    setState(prev => {
      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === rowIndex);
      if (idx >= 0) {
        const row = newRows[idx];
        // Resolve suggestedReplacement: prefer user's preferredMpn, fall back to recs[0]
        let topRec = recs ? recs[0] : undefined;
        if (recs && row.preferredMpn) {
          const preferred = recs.find(r => r.part.mpn === row.preferredMpn);
          if (preferred) topRec = preferred;
        }
        newRows[idx] = {
          ...row,
          ...(attrs ? { sourceAttributes: attrs } : {}),
          ...(recs ? {
            allRecommendations: recs,
            suggestedReplacement: topRec ?? row.suggestedReplacement,
            recommendationCount: recs.length,
          } : {}),
        };
      }

      // Persist updated row data so inline recs survive page reload
      const listId = activeListIdRef.current;
      if (listId) {
        updatePartsListSupabase(listId, newRows).catch((err) => {
          console.error('[PartsListState] Save after modal fetch failed:', err);
        });
      }

      return { ...prev, rows: newRows };
    });
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
        const row = newRows[idx];
        // Resolve suggestedReplacement: prefer user's preferredMpn, fall back to recs[0]
        let topRec = recs.length > 0 ? recs[0] : undefined;
        if (row.preferredMpn) {
          const preferred = recs.find(r => r.part.mpn === row.preferredMpn);
          if (preferred) topRec = preferred;
        }
        newRows[idx] = {
          ...row,
          allRecommendations: recs,
          suggestedReplacement: topRec ?? row.suggestedReplacement,
        };
      }
      return { ...prev, rows: newRows };
    });
  }, []);

  // ----------------------------------------------------------
  // Set / clear preferred alternate for a row
  // ----------------------------------------------------------

  const handleSetPreferred = useCallback((rowIndex: number, mpn: string | null) => {
    setState(prev => {
      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === rowIndex);
      if (idx < 0) return prev;

      const row = newRows[idx];
      const preferredMpn = mpn || undefined;

      // Resolve suggestedReplacement from allRecommendations
      let suggestedReplacement = row.suggestedReplacement;
      if (row.allRecommendations && row.allRecommendations.length > 0) {
        if (preferredMpn) {
          const preferred = row.allRecommendations.find(r => r.part.mpn === preferredMpn);
          if (preferred) suggestedReplacement = preferred;
        } else {
          // Cleared preference — revert to highest score
          suggestedReplacement = row.allRecommendations[0];
        }
      }

      newRows[idx] = { ...row, preferredMpn, suggestedReplacement };
      return { ...prev, rows: newRows };
    });

    // Auto-save
    const listId = activeListIdRef.current;
    if (listId) {
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
  // Update list details (name / description)
  // ----------------------------------------------------------

  const handleUpdateListDetails = useCallback(async (
    name: string,
    description: string,
    currency?: string,
    customer?: string,
    defaultViewId?: string,
  ) => {
    const listId = activeListIdRef.current;
    if (!listId) return;

    const currencyChanged = currency != null && currency !== listCurrencyRef.current;

    listNameRef.current = name;
    listDescriptionRef.current = description;
    if (currency) listCurrencyRef.current = currency;
    if (customer !== undefined) listCustomerRef.current = customer;
    if (defaultViewId !== undefined) listDefaultViewIdRef.current = defaultViewId;
    setState(prev => ({
      ...prev,
      listName: name,
      listDescription: description,
      ...(currency && { listCurrency: currency }),
      ...(customer !== undefined && { listCustomer: customer }),
      ...(defaultViewId !== undefined && { listDefaultViewId: defaultViewId }),
    }));

    await updatePartsListDetailsSupabase(listId, name, description, currency, customer, defaultViewId).catch(() => {});
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
          ? { ...r, status: 'pending' as const, resolvedPart: undefined, sourceAttributes: undefined, suggestedReplacement: undefined, allRecommendations: undefined, enrichedData: undefined, errorMessage: undefined /* preferredMpn deliberately preserved */ }
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
      // Create abort controller for this validation
      validationAbortRef.current?.abort();
      const abortController = new AbortController();
      validationAbortRef.current = abortController;

      const stream = await validatePartsList(items, listCurrencyRef.current, abortController.signal);
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
                const existingRow = newRows[idx];
                // Resolve suggestedReplacement: prefer user's preferredMpn if still in results
                let suggestedReplacement = item.suggestedReplacement;
                let preferredMpn = existingRow.preferredMpn;
                if (preferredMpn && item.allRecommendations) {
                  const preferred = item.allRecommendations.find(r => r.part.mpn === preferredMpn);
                  if (preferred) {
                    suggestedReplacement = preferred;
                  } else {
                    // Preferred MPN no longer in results — clear preference
                    preferredMpn = undefined;
                  }
                }
                newRows[idx] = {
                  ...existingRow,
                  status: item.status,
                  // Auto-classify as electronic when catalog validation resolves
                  ...(item.status === 'resolved' ? { partType: 'electronic' as const } : {}),
                  resolvedPart: item.resolvedPart,
                  sourceAttributes: item.sourceAttributes,
                  suggestedReplacement,
                  allRecommendations: item.allRecommendations,
                  enrichedData: item.enrichedData,
                  errorMessage: item.errorMessage,
                  preferredMpn,
                };
              }
              const pending = newRows.filter(r => indexSet.has(r.rowIndex) && r.status === 'pending').length;
              const done = pending === 0;
              return {
                ...prev,
                rows: newRows,
                phase: done ? 'results' : 'validating',
                ...(done ? { lastRefreshedAt: new Date() } : {}),
              };
            });
          } catch { /* skip malformed lines */ }
        }
      }

      // Final state + persist
      setState(prev => ({ ...prev, phase: 'results', lastRefreshedAt: new Date() }));
      const listId = activeListIdRef.current;
      if (listId) {
        setState(prev => {
          updatePartsListSupabase(listId, prev.rows).catch(() => {});
          return prev;
        });
      }
    } catch (error) {
      // Ignore abort errors (user cancelled)
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      setState(prev => ({
        ...prev,
        phase: 'results',
        error: isAbort ? null : (error instanceof Error ? error.message : 'Refresh failed'),
      }));
    }
  }, [state.rows]);

  // ----------------------------------------------------------
  // Set part type for rows (electronic, mechanical, pcb, custom, other)
  // ----------------------------------------------------------

  const handleSetPartType = useCallback((rowIndices: number[], partType: PartType) => {
    if (rowIndices.length === 0) return;
    const indexSet = new Set(rowIndices);
    const isElectronic = partType === 'electronic';

    setState(prev => {
      const newRows = prev.rows.map(r => {
        if (!indexSet.has(r.rowIndex)) return r;
        if (isElectronic) {
          // Switching to electronic: reset to pending for catalog validation
          return {
            ...r,
            partType,
            status: 'pending' as const,
            resolvedPart: undefined,
            sourceAttributes: undefined,
            suggestedReplacement: undefined,
            allRecommendations: undefined,
            enrichedData: undefined,
            errorMessage: undefined,
            recommendationCount: undefined,
            topNonFailingRecs: undefined,
          };
        } else {
          // Non-electronic: resolve immediately, clear catalog data
          return {
            ...r,
            partType,
            status: 'resolved' as const,
            resolvedPart: undefined,
            sourceAttributes: undefined,
            suggestedReplacement: undefined,
            allRecommendations: undefined,
            enrichedData: undefined,
            errorMessage: undefined,
            recommendationCount: undefined,
            topNonFailingRecs: undefined,
          };
        }
      });
      return { ...prev, rows: newRows };
    });

    // Persist
    const listId = activeListIdRef.current;
    if (listId) {
      setTimeout(() => {
        setState(prev => {
          updatePartsListSupabase(listId, prev.rows).catch(() => {});
          return prev;
        });
      }, 0);
    }

    // If switching to electronic, trigger re-validation
    if (isElectronic) {
      handleRefreshRows(rowIndices);
    }
  }, [handleRefreshRows]);

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
  // Create empty list (no file upload)
  // ----------------------------------------------------------

  const handleCreateEmptyList = useCallback(async (
    name: string,
    description: string,
    customer?: string,
    defaultViewId?: string,
  ) => {
    const headers = ['MPN', 'Manufacturer'];
    listNameRef.current = name;
    listDescriptionRef.current = description;
    listCustomerRef.current = customer ?? null;
    listDefaultViewIdRef.current = defaultViewId ?? null;
    activeListIdRef.current = null;

    setState(prev => ({
      ...prev,
      phase: 'results',
      rows: [],
      listName: name,
      listDescription: description,
      listCustomer: customer ?? null,
      listDefaultViewId: defaultViewId ?? null,
      spreadsheetHeaders: headers,
      parsedData: null,
      columnMapping: { mpnColumn: 0, manufacturerColumn: 1, descriptionColumn: -1 },
      error: null,
      validationProgress: 1,
    }));

    try {
      const listId = await savePartsListSupabase(name, [], description, headers, customer, defaultViewId);
      if (listId) {
        activeListIdRef.current = listId;
        setState(prev => ({ ...prev, activeListId: listId }));
      }
    } catch {
      // Save failed — list works locally but won't persist
    }

    // Refresh saved lists so dashboard card appears
    const lists = await getSavedListsSupabase();
    setState(prev => ({ ...prev, savedLists: lists }));
  }, []);

  // ----------------------------------------------------------
  // Add a single part manually
  // ----------------------------------------------------------

  const handleAddPart = useCallback((
    mpn: string,
    manufacturer: string,
    resolvedPart?: PartSummary,
    extraCells?: Record<number, string>,
  ): number | undefined => {
    const trimmedMpn = mpn.trim();
    const trimmedMfr = manufacturer.trim();
    if (!trimmedMpn) return undefined;

    // Compute new row index
    let maxIndex = -1;
    setState(prev => {
      maxIndex = prev.rows.length > 0
        ? Math.max(...prev.rows.map(r => r.rowIndex))
        : -1;
      return prev;
    });
    const newRowIndex = maxIndex + 1;

    // Build rawCells array matching spreadsheet headers
    const headers = state.spreadsheetHeaders.length > 0 ? state.spreadsheetHeaders : ['MPN', 'Manufacturer'];
    const rawCells = Array(headers.length).fill('');

    // Place MPN and MFR at correct positions
    const mapping = state.columnMapping;
    const mpnIdx = mapping && mapping.mpnColumn >= 0 ? mapping.mpnColumn : 0;
    const mfrIdx = mapping && mapping.manufacturerColumn >= 0 ? mapping.manufacturerColumn : 1;
    rawCells[mpnIdx] = trimmedMpn;
    if (mfrIdx < rawCells.length) rawCells[mfrIdx] = trimmedMfr;

    // Place extra column values
    if (extraCells) {
      for (const [idx, val] of Object.entries(extraCells)) {
        const i = Number(idx);
        if (i >= 0 && i < rawCells.length) rawCells[i] = val;
      }
    }

    const newRow: PartsListRow = {
      rowIndex: newRowIndex,
      rawMpn: trimmedMpn,
      rawManufacturer: trimmedMfr,
      rawDescription: '',
      rawCells,
      status: 'validating',
      // If we already resolved the part from quick search, show it immediately
      resolvedPart: resolvedPart ?? undefined,
    };

    // Add to state at the top so the new part is immediately visible
    setState(prev => ({
      ...prev,
      rows: [newRow, ...prev.rows],
      phase: 'validating',
    }));

    // Persist the new row immediately
    const listId = activeListIdRef.current;
    if (listId) {
      setState(prev => {
        updatePartsListSupabase(listId, prev.rows).catch(() => {});
        return prev;
      });
    }

    // Phase 2: Full validation in background (fire-and-forget — dialog closes immediately)
    (async () => {
      try {
        // Create abort controller for this single-part validation
        validationAbortRef.current?.abort();
        const abortController = new AbortController();
        validationAbortRef.current = abortController;

        const stream = await validatePartsList(
          [{ rowIndex: newRowIndex, mpn: resolvedPart?.mpn ?? trimmedMpn, manufacturer: trimmedMfr || undefined, skipSearch: !!resolvedPart }],
          listCurrencyRef.current,
          abortController.signal,
        );
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
                    recommendationCount: item.allRecommendations?.length,
                  };
                }
                return { ...prev, rows: newRows, phase: 'results', lastRefreshedAt: new Date() };
              });
            } catch { /* skip malformed lines */ }
          }
        }

        // Final state + persist
        setState(prev => ({ ...prev, phase: 'results', lastRefreshedAt: new Date() }));
        if (listId) {
          setState(prev => {
            updatePartsListSupabase(listId, prev.rows).catch(() => {});
            return prev;
          });
        }
      } catch (error) {
        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        if (!isAbort) {
          setState(prev => ({
            ...prev,
            phase: 'results',
            error: error instanceof Error ? error.message : 'Validation failed',
          }));
        }
      }
    })();

    return newRowIndex;
  }, [state.spreadsheetHeaders, state.columnMapping]);

  // ----------------------------------------------------------
  // Inline cell editing
  // ----------------------------------------------------------

  const cellEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCellEdit = useCallback((rowIndex: number, columnId: string, newValue: string) => {
    // Parse spreadsheet column index from "ss:3" → 3
    const match = columnId.match(/^ss:(\d+)$/);
    if (!match) return;
    const ssIndex = Number(match[1]);

    const mapping = state.columnMapping;
    const isMpnColumn = mapping && ssIndex === mapping.mpnColumn;
    const isMfrColumn = mapping && ssIndex === mapping.manufacturerColumn;

    setState(prev => {
      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === rowIndex);
      if (idx < 0) return prev;

      const row = { ...newRows[idx] };
      const rawCells = [...(row.rawCells ?? [])];
      rawCells[ssIndex] = newValue;
      row.rawCells = rawCells;

      if (isMpnColumn) row.rawMpn = newValue;
      if (isMfrColumn) row.rawManufacturer = newValue;

      newRows[idx] = row;
      return { ...prev, rows: newRows };
    });

    // Persist to Supabase
    const listId = activeListIdRef.current;
    if (listId) {
      setState(prev => {
        updatePartsListSupabase(listId, prev.rows).catch(() => {});
        return prev;
      });
    }

    // If MPN or MFR changed, debounce re-validation
    if (isMpnColumn || isMfrColumn) {
      if (cellEditTimerRef.current) clearTimeout(cellEditTimerRef.current);
      cellEditTimerRef.current = setTimeout(() => {
        handleRefreshRows([rowIndex]);
      }, 500);
    }
  }, [state.columnMapping, handleRefreshRows]);

  // ----------------------------------------------------------
  // Reset
  // ----------------------------------------------------------

  const handleReset = useCallback(() => {
    listNameRef.current = null;
    listDescriptionRef.current = null;
    listCurrencyRef.current = 'USD';
    listCustomerRef.current = null;
    listDefaultViewIdRef.current = null;
    activeListIdRef.current = null;
    clearValidation();
    setState(prev => ({ ...INITIAL_STATE, savedLists: prev.savedLists }));
  }, []);

  // ----------------------------------------------------------
  // Cancel validation
  // ----------------------------------------------------------

  const handleCancelValidation = useCallback(() => {
    // Abort background validation manager stream
    cancelValidation();
    // Abort direct validation streams (handleRefreshRows, handleAddPart)
    validationAbortRef.current?.abort();
    validationAbortRef.current = null;
    setState(prev => ({ ...prev, phase: 'results' }));
  }, []);

  // ----------------------------------------------------------
  // Post-validation FindChips enrichment
  // ----------------------------------------------------------

  /** Shared FC enrichment logic — returns { requested, enriched } counts */
  const runFCEnrichment = useCallback(async (): Promise<{ requested: number; enriched: number }> => {
    // Check for rows that have no FC-sourced quotes yet
    const rowsNeedingFC = state.rows.filter(r =>
      r.status === 'resolved' &&
      r.enrichedData &&
      r.resolvedPart?.mpn &&
      !r.enrichedData.supplierQuotes?.length
    );

    if (rowsNeedingFC.length === 0) return { requested: 0, enriched: 0 };

    const mpns = rowsNeedingFC.map(r => r.resolvedPart!.mpn);
    // Chunk into 50-MPN batches (server cap) and fire in parallel
    const CHUNK_SIZE = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < mpns.length; i += CHUNK_SIZE) {
      chunks.push(mpns.slice(i, i + CHUNK_SIZE));
    }
    const chunkResults = await Promise.all(chunks.map(c => enrichWithFCBatch(c).catch(() => ({}))));
    const results = Object.assign({}, ...chunkResults);
    const enrichedCount = Object.keys(results).length;

    if (enrichedCount > 0) {
      setState(prev => {
        const newRows = prev.rows.map(row => {
          const mpnLower = row.resolvedPart?.mpn?.toLowerCase();
          if (!mpnLower || !results[mpnLower] || !row.enrichedData) return row;

          const fc = results[mpnLower];
          return {
            ...row,
            enrichedData: {
              ...row.enrichedData,
              supplierQuotes: fc.quotes.length > 0 ? fc.quotes : row.enrichedData.supplierQuotes,
              lifecycleInfo: [...(row.enrichedData.lifecycleInfo ?? []), ...(fc.lifecycle ? [fc.lifecycle] : [])],
              complianceData: [...(row.enrichedData.complianceData ?? []), ...(fc.compliance ? [fc.compliance] : [])],
            },
          };
        });
        return { ...prev, rows: newRows };
      });

      const listId = activeListIdRef.current;
      if (listId) {
        setState(prev => {
          updatePartsListSupabase(listId, prev.rows).catch(() => {});
          return prev;
        });
      }
    }

    return { requested: mpns.length, enriched: enrichedCount };
  }, [state.rows]);

  // Progressive FC enrichment — runs during validation (every 10 resolved rows) + on completion
  const fcEnrichResultRef = useRef<{ requested: number; enriched: number } | null>(null);
  const fcEnrichRunningRef = useRef(false);
  const lastFCBatchCountRef = useRef(0);

  useEffect(() => {
    // Reset tracking when validation starts
    if (state.phase === 'validating' || state.phase === 'empty') {
      lastFCBatchCountRef.current = 0;
      fcEnrichResultRef.current = null;
    }

    // Don't run if already in progress or if no rows
    if (fcEnrichRunningRef.current) return;
    if (state.phase !== 'validating' && state.phase !== 'results') return;

    const resolvedCount = state.rows.filter(r => r.status === 'resolved' && r.enrichedData).length;
    const isDone = state.phase === 'results';
    const batchThreshold = 10;

    // During validation: trigger every 10 resolved rows. On completion: trigger for remaining.
    const newSinceLastBatch = resolvedCount - lastFCBatchCountRef.current;
    if (!isDone && newSinceLastBatch < batchThreshold) return;
    if (resolvedCount === 0) return;

    fcEnrichRunningRef.current = true;
    lastFCBatchCountRef.current = resolvedCount;

    runFCEnrichment()
      .then(result => {
        // Accumulate results across batches
        const prev = fcEnrichResultRef.current;
        fcEnrichResultRef.current = {
          requested: (prev?.requested ?? 0) + result.requested,
          enriched: (prev?.enriched ?? 0) + result.enriched,
        };
      })
      .catch(() => {})
      .finally(() => { fcEnrichRunningRef.current = false; });
  }, [state.phase, state.rows, runFCEnrichment]);

  /** Manual retry — called from snackbar "Retry" button */
  const handleRetryFCEnrichment = useCallback(async () => {
    return runFCEnrichment();
  }, [runFCEnrichment]);

  /** Get the latest Mouser enrichment result for notification logic */
  const getFCEnrichResult = useCallback(() => fcEnrichResultRef.current, []);

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
    handleParsedDataReady,
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
    handleSetPreferred,
    handleReset,
    handleUpdateListDetails,
    handleRefreshRows,
    handleSetPartType,
    handleDeleteRows,
    handleCreateEmptyList,
    handleAddPart,
    handleCellEdit,
    handleCancelValidation,
    handleRetryFCEnrichment,
    getFCEnrichResult,
  };
}
