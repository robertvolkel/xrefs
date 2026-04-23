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
  ReplacementPriorities,
  DuplicateGroup,
  computeRecommendationCounts,
} from '@/lib/types';
import { parseSpreadsheetFile, autoDetectColumns } from '@/lib/excelParser';
import { getPartAttributes, getRecommendations, validatePartsList, enrichWithFCBatch, backfillListCounts } from '@/lib/api';
import { PartsListSummary } from '@/lib/partsListStorage';
import { ViewState } from '@/lib/viewConfigStorage';
import { findDuplicateGroups, consolidateDuplicates } from '@/lib/services/bomDeduper';
import { canonicalizeRowManufacturers } from '@/lib/services/manufacturerAliasClient';
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

export type PartsListPhase = 'empty' | 'mapping' | 'dedupe-prompt' | 'validating' | 'results';

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
  /** True while handleOpenModal's initial attributes/recs fetch is in flight.
   *  Drives the RecommendationsPanel loading overlay inside PartDetailModal so
   *  the modal doesn't read as "1 match found + blank space" before data lands. */
  modalInitialFetching: boolean;
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
  /** Per-list composite ranking priorities (null = server applies defaults) */
  replacementPriorities: ReplacementPriorities | null;
  /** Timestamp of last completed validation/refresh */
  lastRefreshedAt: Date | null;
  /** Result of the last cache-only bucket-count backfill (null = no attempt this session) */
  backfillCountsResult: { scanned: number; hit: number; miss: number } | null;
  /** Rows staged during column mapping, awaiting user's duplicate-resolution choice */
  pendingRows: PartsListRow[] | null;
  /** Duplicate groups detected in pendingRows (only set during 'dedupe-prompt' phase) */
  pendingDuplicateGroups: DuplicateGroup[] | null;
  /** Whether the pending column mapping included a qty column (shapes dialog UI) */
  pendingQtyMapped: boolean;
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
  modalInitialFetching: false,
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
  replacementPriorities: null,
  lastRefreshedAt: null,
  backfillCountsResult: null,
  pendingRows: null,
  pendingDuplicateGroups: null,
  pendingQtyMapped: false,
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
  const listPrioritiesRef = useRef<ReplacementPriorities | null>(null);
  const activeListIdRef = useRef<string | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);
  // Retain the uploaded File so we can re-parse a different sheet from the
  // column-mapping dialog without re-prompting the user.
  const pendingFileRef = useRef<File | null>(null);

  // Row-identity picker state — drives the shared AddPartDialog in 'replace' mode.
  // Populated on MPN cell edit (cancel reverts) or on ambiguous status chip click.
  const [pickerState, setPickerState] = useState<{
    rowIndex: number;
    mpn: string;
    manufacturer: string;
    candidates?: PartSummary[];
    /** Snapshot captured on cell-edit open so cancel can revert the unsaved edit.
     *  Absent when picker was opened from the ambiguous chip (no revert needed). */
    revertSnapshot?: { rawCells: string[]; rawMpn: string };
  } | null>(null);

  // Scope of the most recent validation run. PartsListShell reads this to
  // decide whether to show list-level summary notifications ("N parts could
  // not be found") — those make sense after a full-list validation but are
  // misleading after a single-row refresh (e.g. picker confirmation).
  const lastValidationScopeRef = useRef<'full' | 'partial'>('full');

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
      pendingFileRef.current = file;

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
    pendingFileRef.current = null;

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

  /**
   * Persist a set of rows (original or consolidated) and kick off background
   * validation. Shared tail of the column-mapping → validation path, also
   * invoked from the dedupe-prompt handlers after the user makes a choice.
   */
  const startValidationForRows = useCallback(async (
    rows: PartsListRow[],
    headers: string[],
    uploadSettings?: { duplicateCheckDismissed?: boolean },
  ) => {
    const saveName = listNameRef.current || 'Untitled List';
    const saveDesc = listDescriptionRef.current ?? undefined;
    try {
      const saveCustomer = listCustomerRef.current ?? undefined;
      const saveDefaultViewId = listDefaultViewIdRef.current ?? undefined;
      const listId = await savePartsListSupabase(
        saveName,
        rows,
        saveDesc,
        headers,
        saveCustomer,
        saveDefaultViewId,
        undefined,
        undefined,
        uploadSettings,
      );
      if (listId) {
        activeListIdRef.current = listId;
        setState(prev => ({ ...prev, activeListId: listId }));
      }
      lastValidationScopeRef.current = 'full';
      startBackgroundValidation(listId || '', rows, listCurrencyRef.current);
    } catch {
      lastValidationScopeRef.current = 'full';
      startBackgroundValidation('', rows, listCurrencyRef.current);
    }
  }, []);

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
        ...(mapping.qtyColumn != null && mapping.qtyColumn >= 0
          ? { rawQty: row[mapping.qtyColumn] ?? '' }
          : {}),
        rawCells: row,
        status: 'pending' as const,
      }));

      // Keep rows that have either an MPN or a description to search with
      validRows = rows.filter(r => r.rawMpn.trim() !== '' || r.rawDescription.trim() !== '');

      return {
        ...prev,
        columnMapping: mapping,
        rows: validRows,
        validationProgress: 0,
        spreadsheetHeaders: headers,
      };
    });

    if (validRows.length === 0) {
      setState(prev => ({ ...prev, phase: 'validating' }));
      return;
    }

    // Canonicalize manufacturer names against atlas_manufacturers aliases BEFORE
    // duplicate detection. Rows under "GD", "GigaDevice", and "兆易创新" collapse
    // to one `name_display` so findDuplicateGroups groups them. Unresolved names
    // pass through unchanged. Failure (auth, network) is non-blocking.
    const canonicalized = await canonicalizeRowManufacturers(validRows);
    if (canonicalized !== validRows) {
      validRows = canonicalized;
      setState(prev => ({ ...prev, rows: validRows }));
    }

    // Scan for duplicate MPN+MFR pairs before saving. If any are found, park
    // the work in 'dedupe-prompt' phase and let the user choose.
    const qtyMapped = mapping.qtyColumn != null && mapping.qtyColumn >= 0;
    const groups = findDuplicateGroups(validRows, qtyMapped);
    if (groups.length > 0) {
      setState(prev => ({
        ...prev,
        phase: 'dedupe-prompt',
        pendingRows: validRows,
        pendingDuplicateGroups: groups,
        pendingQtyMapped: qtyMapped,
      }));
      return;
    }

    setState(prev => ({ ...prev, phase: 'validating' }));
    await startValidationForRows(validRows, headers);
  }, [startValidationForRows]);

  const handleConsolidateDuplicates = useCallback(async () => {
    let rowsToUse: PartsListRow[] | null = null;
    let headers: string[] = [];
    let qtyMapped = false;
    setState(prev => {
      if (prev.phase !== 'dedupe-prompt' || !prev.pendingRows || !prev.pendingDuplicateGroups) return prev;
      const consolidated = consolidateDuplicates(prev.pendingRows, prev.pendingDuplicateGroups, prev.pendingQtyMapped);
      rowsToUse = consolidated;
      headers = prev.spreadsheetHeaders;
      qtyMapped = prev.pendingQtyMapped;
      return {
        ...prev,
        phase: 'validating',
        rows: consolidated,
        pendingRows: null,
        pendingDuplicateGroups: null,
        pendingQtyMapped: false,
      };
    });
    // reference qtyMapped to satisfy the linter even though consolidation already used it
    void qtyMapped;
    if (rowsToUse) {
      await startValidationForRows(rowsToUse, headers);
    }
  }, [startValidationForRows]);

  const handleLeaveDuplicatesAsIs = useCallback(async () => {
    let rowsToUse: PartsListRow[] | null = null;
    let headers: string[] = [];
    setState(prev => {
      if (prev.phase !== 'dedupe-prompt' || !prev.pendingRows) return prev;
      rowsToUse = prev.pendingRows;
      headers = prev.spreadsheetHeaders;
      return {
        ...prev,
        phase: 'validating',
        rows: prev.pendingRows,
        pendingRows: null,
        pendingDuplicateGroups: null,
        pendingQtyMapped: false,
      };
    });
    if (rowsToUse) {
      await startValidationForRows(rowsToUse, headers, { duplicateCheckDismissed: true });
    }
  }, [startValidationForRows]);

  const handleColumnMappingCancelled = useCallback(() => {
    pendingFileRef.current = null;
    setState(prev => ({ ...prev, phase: 'empty', parsedData: null, columnMapping: null, listName: null }));
  }, []);

  /** Re-parse the pending file using a different sheet and re-run auto-detect. */
  const handleSheetChange = useCallback(async (sheetName: string) => {
    const file = pendingFileRef.current;
    if (!file) return;
    try {
      const parsedData = await parseSpreadsheetFile(file, sheetName);
      const columnMapping = autoDetectColumns(parsedData.headers, parsedData.rows);
      setState(prev => ({ ...prev, parsedData, columnMapping, error: null }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to read sheet',
      }));
    }
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
      listPrioritiesRef.current = loaded?.replacementPriorities ?? null;

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
        replacementPriorities: listPrioritiesRef.current,
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
    listPrioritiesRef.current = loaded.replacementPriorities;
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
      replacementPriorities: loaded.replacementPriorities,
      parsedData: null,
      columnMapping: null,
      error: null,
      lastRefreshedAt: loaded.updatedAt ? new Date(loaded.updatedAt) : new Date(),
      backfillCountsResult: null,
    }));

    // Cache-only backfill of per-bucket counts for rows saved before those fields
    // existed. Zero live-API cost — server reads from L2 recs cache only.
    const needsBackfill = loaded.rows.some(
      r => (r.status === 'resolved' || r.status === 'ambiguous')
        && (r.recommendationCount ?? 0) > 0
        && r.logicDrivenCount === undefined
        && r.mfrCertifiedCount === undefined
        && r.accurisCertifiedCount === undefined,
    );
    if (needsBackfill) {
      backfillListCounts(id).then(result => {
        if (result.updates.length === 0) {
          setState(prev => ({ ...prev, backfillCountsResult: { scanned: result.scanned, hit: result.hit, miss: result.miss } }));
          return;
        }
        const byIndex = new Map(result.updates.map(u => [u.rowIndex, u]));
        setState(prev => {
          // Only apply if this list is still active
          if (prev.activeListId !== id) return prev;
          const newRows = prev.rows.map(r => {
            const u = byIndex.get(r.rowIndex);
            return u ? { ...r, logicDrivenCount: u.logicDrivenCount, mfrCertifiedCount: u.mfrCertifiedCount, accurisCertifiedCount: u.accurisCertifiedCount } : r;
          });
          // Persist updated counts so subsequent reloads skip the backfill
          updatePartsListSupabase(id, newRows).catch(err => {
            console.error('[PartsListState] Save after backfill failed:', err);
          });
          return { ...prev, rows: newRows, backfillCountsResult: { scanned: result.scanned, hit: result.hit, miss: result.miss } };
        });
      }).catch(err => {
        console.warn('[PartsListState] Backfill counts call failed:', err);
      });
    }
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
        newRows[idx] = { ...newRows[idx], replacement: rec, preferredMpn: rec.part.mpn };
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
    const currentRow = state.rows.find(r => r.rowIndex === rowIndex);
    const willFetch = !!currentRow?.resolvedPart && (!currentRow.sourceAttributes || !currentRow.allRecommendations);

    setState(prev => ({
      ...prev,
      modalRowIndex: rowIndex,
      modalSelectedRec: null,
      modalComparisonAttrs: null,
      modalComparing: false,
      modalInitialFetching: willFetch,
    }));

    if (!currentRow?.resolvedPart) return;

    const mpn = currentRow.resolvedPart.mpn;
    const needsAttrs = !currentRow.sourceAttributes;
    const needsRecs = !currentRow.allRecommendations;

    if (!needsAttrs && !needsRecs) return; // Both already cached

    // Fetch in parallel and update row atomically
    const [attrs, recs] = await Promise.all([
      needsAttrs ? getPartAttributes(mpn).catch(() => null) : Promise.resolve(null),
      needsRecs ? getRecommendations(mpn, undefined, listPrioritiesRef.current ?? undefined).catch(() => null) : Promise.resolve(null),
    ]);

    setState(prev => {
      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === rowIndex);
      if (idx >= 0) {
        const row = newRows[idx];
        // Resolve replacement: prefer user's preferredMpn, fall back to recs[0]
        let topRec = recs ? recs[0] : undefined;
        if (recs && row.preferredMpn) {
          const preferred = recs.find(r => r.part.mpn === row.preferredMpn);
          if (preferred) topRec = preferred;
        }
        const recCounts = recs ? computeRecommendationCounts(recs) : null;
        newRows[idx] = {
          ...row,
          ...(attrs ? { sourceAttributes: attrs } : {}),
          ...(recs && recCounts ? {
            allRecommendations: recs,
            replacement: topRec ?? row.replacement,
            recommendationCount: recs.length,
            logicDrivenCount: recCounts.logicDrivenCount,
            mfrCertifiedCount: recCounts.mfrCertifiedCount,
            accurisCertifiedCount: recCounts.accurisCertifiedCount,
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

      return { ...prev, rows: newRows, modalInitialFetching: false };
    });
  }, [state.rows]);

  const handleCloseModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      modalRowIndex: null,
      modalSelectedRec: null,
      modalComparisonAttrs: null,
      modalComparing: false,
      modalInitialFetching: false,
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
        // Resolve replacement: prefer user's preferredMpn, fall back to recs[0]
        let topRec = recs.length > 0 ? recs[0] : undefined;
        if (row.preferredMpn) {
          const preferred = recs.find(r => r.part.mpn === row.preferredMpn);
          if (preferred) topRec = preferred;
        }
        // Rebuild persisted sub-rec slots from the new recs so the main-list
        // Repl. MPN column's filter-fallback path (pickEffectiveTopRec →
        // replacementAlternates) doesn't keep pointing at stale candidates from
        // the pre-context fetch.
        const nonFailing = recs.filter(r => !r.matchDetails.some(d => d.ruleResult === 'fail'));
        const subs = row.preferredMpn
          ? nonFailing.filter(r => r.part.mpn !== row.preferredMpn)
          : nonFailing.slice(1);
        const recCounts = computeRecommendationCounts(recs);
        newRows[idx] = {
          ...row,
          allRecommendations: recs,
          replacement: topRec ?? row.replacement,
          recommendationCount: recs.length,
          logicDrivenCount: recCounts.logicDrivenCount,
          mfrCertifiedCount: recCounts.mfrCertifiedCount,
          accurisCertifiedCount: recCounts.accurisCertifiedCount,
          replacementAlternates: subs.slice(0, 4),
        };
      }

      // Persist so the refreshed top + counts survive page reload.
      const listId = activeListIdRef.current;
      if (listId) {
        updatePartsListSupabase(listId, newRows).catch((err) => {
          console.error('[PartsListState] Save after modal rec refresh failed:', err);
        });
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

      // Resolve replacement from allRecommendations
      let replacement = row.replacement;
      if (row.allRecommendations && row.allRecommendations.length > 0) {
        if (preferredMpn) {
          const preferred = row.allRecommendations.find(r => r.part.mpn === preferredMpn);
          if (preferred) replacement = preferred;
        } else {
          // Cleared preference — revert to highest score
          replacement = row.allRecommendations[0];
        }
      }

      newRows[idx] = { ...row, preferredMpn, replacement };
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
    replacementPriorities?: ReplacementPriorities,
  ): Promise<{ currencyChanged: boolean; prioritiesChanged: boolean }> => {
    const listId = activeListIdRef.current;
    if (!listId) return { currencyChanged: false, prioritiesChanged: false };

    const currencyChanged = currency != null && currency !== listCurrencyRef.current;
    // Only ranking changes (axis order / enabled) warrant a row refresh — they affect
    // composite scoring. `hideZeroStock` is a display-time filter, so toggling it alone
    // should persist without re-running validation.
    const rankingChanged = replacementPriorities !== undefined && (
      JSON.stringify(replacementPriorities.order) !== JSON.stringify(listPrioritiesRef.current?.order) ||
      JSON.stringify(replacementPriorities.enabled) !== JSON.stringify(listPrioritiesRef.current?.enabled)
    );
    const prioritiesChanged = rankingChanged;

    listNameRef.current = name;
    listDescriptionRef.current = description;
    if (currency) listCurrencyRef.current = currency;
    if (customer !== undefined) listCustomerRef.current = customer;
    if (defaultViewId !== undefined) listDefaultViewIdRef.current = defaultViewId;
    if (replacementPriorities !== undefined) listPrioritiesRef.current = replacementPriorities;
    setState(prev => ({
      ...prev,
      listName: name,
      listDescription: description,
      ...(currency && { listCurrency: currency }),
      ...(customer !== undefined && { listCustomer: customer }),
      ...(defaultViewId !== undefined && { listDefaultViewId: defaultViewId }),
      ...(replacementPriorities !== undefined && { replacementPriorities }),
    }));

    await updatePartsListDetailsSupabase(listId, name, description, currency, customer, defaultViewId, replacementPriorities).catch(() => {});
    const lists = await getSavedListsSupabase();
    setState(prev => ({ ...prev, savedLists: lists }));

    return { currencyChanged, prioritiesChanged };
  }, []);

  // ----------------------------------------------------------
  // Refresh selected rows (re-validate)
  // ----------------------------------------------------------

  const handleRefreshRows = useCallback(async (
    rowIndices: number[],
    options?: {
      skipSearch?: boolean;
      /** Per-row overrides for the validate request — used when the caller has
       *  already mutated row identity (e.g. picker confirmed a new PartSummary)
       *  and can't rely on the closure's stale state.rows snapshot. */
      itemOverrides?: Record<number, { mpn?: string; manufacturer?: string; description?: string }>;
    },
  ) => {
    if (rowIndices.length === 0) return;
    const indexSet = new Set(rowIndices);
    const skipSearch = options?.skipSearch ?? false;
    const itemOverrides = options?.itemOverrides ?? {};
    // A refresh covering every row counts as full-list (Refresh All button);
    // anything smaller is treated as a per-row refresh and suppresses the
    // list-level summary snackbar.
    lastValidationScopeRef.current = rowIndices.length >= state.rows.length ? 'full' : 'partial';

    // Reset selected rows to pending (also clear any stale candidateMatches
    // so the ambiguous chip disappears while re-validating)
    setState(prev => ({
      ...prev,
      phase: 'validating',
      error: null,
      rows: prev.rows.map(r =>
        indexSet.has(r.rowIndex)
          ? { ...r, status: 'pending' as const, resolvedPart: undefined, sourceAttributes: undefined, replacement: undefined, allRecommendations: undefined, enrichedData: undefined, errorMessage: undefined, candidateMatches: undefined /* preferredMpn deliberately preserved */ }
          : r,
      ),
    }));

    // Build items for the subset
    const items = rowIndices.map(idx => {
      // Read from current state via a synchronous snapshot
      const row = state.rows.find(r => r.rowIndex === idx);
      const override = itemOverrides[idx] ?? {};
      return {
        rowIndex: idx,
        mpn: override.mpn ?? row?.rawMpn ?? '',
        manufacturer: override.manufacturer ?? (row?.rawManufacturer || undefined),
        description: override.description ?? (row?.rawDescription || undefined),
        skipSearch,
      };
    });

    try {
      // Create abort controller for this validation
      validationAbortRef.current?.abort();
      const abortController = new AbortController();
      validationAbortRef.current = abortController;

      // forceRefresh=true: user-initiated Refresh must bypass the recs L2 cache
      // so recovered upstream services (e.g. parts.io after VPN reconnect) get
      // incorporated. Initial validation from upload stays cache-friendly.
      const stream = await validatePartsList(
        items,
        listCurrencyRef.current,
        abortController.signal,
        true,
        listPrioritiesRef.current ?? undefined,
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
            const rawItem = JSON.parse(line) as BatchValidateItem & { suggestedReplacement?: XrefRecommendation };
            // Wire-format back-compat: accept either `replacement` (current) or
            // `suggestedReplacement` (pre-rename) from the NDJSON stream.
            const item: BatchValidateItem = rawItem.replacement
              ? rawItem
              : { ...rawItem, replacement: rawItem.suggestedReplacement };
            setState(prev => {
              const newRows = [...prev.rows];
              const idx = newRows.findIndex(r => r.rowIndex === item.rowIndex);
              if (idx >= 0) {
                const existingRow = newRows[idx];
                // Resolve replacement: prefer user's preferredMpn if still in results
                let replacement = item.replacement;
                let preferredMpn = existingRow.preferredMpn;
                if (preferredMpn && item.allRecommendations) {
                  const preferred = item.allRecommendations.find(r => r.part.mpn === preferredMpn);
                  if (preferred) {
                    replacement = preferred;
                  } else {
                    // Preferred MPN no longer in results — clear preference
                    preferredMpn = undefined;
                  }
                }
                newRows[idx] = {
                  ...existingRow,
                  status: item.status,
                  // Auto-classify as electronic when catalog validation resolves
                  // (ambiguous counts — we got candidates back from the catalog)
                  ...(item.status === 'resolved' || item.status === 'ambiguous' ? { partType: 'electronic' as const } : {}),
                  resolvedPart: item.resolvedPart,
                  sourceAttributes: item.sourceAttributes,
                  replacement,
                  allRecommendations: item.allRecommendations,
                  enrichedData: item.enrichedData,
                  errorMessage: item.errorMessage,
                  preferredMpn,
                  candidateMatches: item.candidateMatches,
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
            replacement: undefined,
            allRecommendations: undefined,
            enrichedData: undefined,
            errorMessage: undefined,
            recommendationCount: undefined,
            logicDrivenCount: undefined,
            mfrCertifiedCount: undefined,
            accurisCertifiedCount: undefined,
            replacementAlternates: undefined,
          };
        } else {
          // Non-electronic: resolve immediately, clear catalog data
          return {
            ...r,
            partType,
            status: 'resolved' as const,
            resolvedPart: undefined,
            sourceAttributes: undefined,
            replacement: undefined,
            allRecommendations: undefined,
            enrichedData: undefined,
            errorMessage: undefined,
            recommendationCount: undefined,
            logicDrivenCount: undefined,
            mfrCertifiedCount: undefined,
            accurisCertifiedCount: undefined,
            replacementAlternates: undefined,
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
    lastValidationScopeRef.current = 'partial';
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
          undefined,
          listPrioritiesRef.current ?? undefined,
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
              const rawItem = JSON.parse(line) as BatchValidateItem & { suggestedReplacement?: XrefRecommendation };
            // Wire-format back-compat: accept either `replacement` (current) or
            // `suggestedReplacement` (pre-rename) from the NDJSON stream.
            const item: BatchValidateItem = rawItem.replacement
              ? rawItem
              : { ...rawItem, replacement: rawItem.suggestedReplacement };
              setState(prev => {
                const newRows = [...prev.rows];
                const idx = newRows.findIndex(r => r.rowIndex === item.rowIndex);
                if (idx >= 0) {
                  const streamCounts = computeRecommendationCounts(item.allRecommendations);
                  newRows[idx] = {
                    ...newRows[idx],
                    status: item.status,
                    resolvedPart: item.resolvedPart,
                    sourceAttributes: item.sourceAttributes,
                    replacement: item.replacement,
                    allRecommendations: item.allRecommendations,
                    enrichedData: item.enrichedData,
                    errorMessage: item.errorMessage,
                    recommendationCount: item.allRecommendations?.length,
                    logicDrivenCount: streamCounts.logicDrivenCount,
                    mfrCertifiedCount: streamCounts.mfrCertifiedCount,
                    accurisCertifiedCount: streamCounts.accurisCertifiedCount,
                    candidateMatches: item.candidateMatches,
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

    // Prefer the persisted column mapping, but fall back to row-data inference
    // for lists saved before column mapping was persisted (mirrors the same
    // inference that useColumnCatalog performs for the table).
    let mapping = state.columnMapping;
    if (!mapping) {
      const sample = state.rows.find(r => r.rawMpn && r.rawCells?.length);
      if (sample) {
        mapping = {
          mpnColumn: sample.rawCells.findIndex(c => c === sample.rawMpn),
          manufacturerColumn: sample.rawManufacturer
            ? sample.rawCells.findIndex(c => c === sample.rawManufacturer)
            : -1,
          descriptionColumn: sample.rawCells.findIndex(c => c === sample.rawDescription),
        };
      }
    }
    const isMpnColumn = mapping && ssIndex === mapping.mpnColumn;
    const isMfrColumn = mapping && ssIndex === mapping.manufacturerColumn;

    // MPN edits open the row-identity picker instead of running a silent
    // background re-validation. The picker forces the user to explicitly
    // confirm a catalog match so MFR/description don't drift out of sync
    // with the new MPN. Cancel reverts the cell (edit is not persisted yet).
    // Always opens — even when the value is unchanged — so pressing Enter on
    // a Not Found row is a valid "retry this MPN" gesture.
    if (isMpnColumn) {
      const trimmed = newValue.trim();
      const rowSnapshot = state.rows.find(r => r.rowIndex === rowIndex);
      if (!rowSnapshot) return;
      const previousCells = [...(rowSnapshot.rawCells ?? [])];
      const previousMpn = rowSnapshot.rawMpn ?? '';
      const valueChanged = trimmed !== previousMpn.trim();

      // Only mutate the cell locally if the user actually typed a new value.
      // Still open the picker in both cases.
      if (valueChanged) {
        setState(prev => {
          const idx = prev.rows.findIndex(r => r.rowIndex === rowIndex);
          if (idx < 0) return prev;
          const nextCells = [...(prev.rows[idx].rawCells ?? [])];
          nextCells[ssIndex] = newValue;
          const newRows = [...prev.rows];
          newRows[idx] = { ...prev.rows[idx], rawCells: nextCells, rawMpn: newValue };
          return { ...prev, rows: newRows };
        });
      }

      setPickerState({
        rowIndex,
        mpn: trimmed,
        manufacturer: rowSnapshot.rawManufacturer ?? '',
        // Only capture a revert snapshot when the cell was actually modified —
        // no-op Enter shouldn't revert anything on cancel.
        revertSnapshot: valueChanged ? { rawCells: previousCells, rawMpn: previousMpn } : undefined,
      });

      // Clear any stale MFR-edit debounce scheduled before this MPN edit.
      if (cellEditTimerRef.current) clearTimeout(cellEditTimerRef.current);
      return;
    }

    setState(prev => {
      const newRows = [...prev.rows];
      const idx = newRows.findIndex(r => r.rowIndex === rowIndex);
      if (idx < 0) return prev;

      const row = { ...newRows[idx] };
      const rawCells = [...(row.rawCells ?? [])];
      rawCells[ssIndex] = newValue;
      row.rawCells = rawCells;

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

    // MFR edits keep the existing silent debounced revalidation — MFR alone
    // doesn't change row identity, so a background refresh is safe.
    if (isMfrColumn) {
      if (cellEditTimerRef.current) clearTimeout(cellEditTimerRef.current);
      cellEditTimerRef.current = setTimeout(() => {
        handleRefreshRows([rowIndex]);
      }, 500);
    }
  }, [state.columnMapping, state.rows, handleRefreshRows]);

  // ----------------------------------------------------------
  // Row-identity picker (MPN edit + ambiguous row disambiguation)
  // ----------------------------------------------------------

  /** Commit a user-picked PartSummary to a row: overwrite identity cells,
   *  clear stale match data, persist, and kick off a skipSearch revalidation. */
  const handleReplaceRowIdentity = useCallback((rowIndex: number, picked: PartSummary) => {
    const mapping = state.columnMapping;
    const pickedMpn = picked.mpn ?? '';
    const pickedMfr = picked.manufacturer ?? '';
    const pickedDesc = picked.description ?? '';

    setState(prev => {
      const idx = prev.rows.findIndex(r => r.rowIndex === rowIndex);
      if (idx < 0) return prev;
      const row = prev.rows[idx];
      const nextCells = [...(row.rawCells ?? [])];

      if (mapping) {
        if (mapping.mpnColumn >= 0) nextCells[mapping.mpnColumn] = pickedMpn;
        if (mapping.manufacturerColumn >= 0) nextCells[mapping.manufacturerColumn] = pickedMfr;
        if (mapping.descriptionColumn >= 0) nextCells[mapping.descriptionColumn] = pickedDesc;
      }

      const newRows = [...prev.rows];
      newRows[idx] = {
        ...row,
        rawMpn: pickedMpn,
        rawManufacturer: pickedMfr,
        rawDescription: pickedDesc,
        rawCells: nextCells,
        status: 'pending' as const,
        candidateMatches: undefined,
        // Clear prior match data so the UI doesn't render stale attrs during revalidation
        resolvedPart: undefined,
        sourceAttributes: undefined,
        replacement: undefined,
        replacementAlternates: undefined,
        allRecommendations: undefined,
        enrichedData: undefined,
        errorMessage: undefined,
        recommendationCount: undefined,
        logicDrivenCount: undefined,
        mfrCertifiedCount: undefined,
        accurisCertifiedCount: undefined,
      };
      return { ...prev, rows: newRows };
    });

    setPickerState(null);

    const listId = activeListIdRef.current;
    if (listId) {
      setState(prev => {
        updatePartsListSupabase(listId, prev.rows).catch(() => {});
        return prev;
      });
    }

    // We already have a verified catalog identity — skip search, go straight to
    // getAttributes + recommendations. Pass itemOverrides so the refresh closure
    // doesn't read a stale rawMpn snapshot before the setState above commits.
    handleRefreshRows([rowIndex], {
      skipSearch: true,
      itemOverrides: { [rowIndex]: { mpn: pickedMpn, manufacturer: pickedMfr, description: pickedDesc } },
    });
  }, [state.columnMapping, handleRefreshRows]);

  /** Open the picker for an ambiguous row (status='ambiguous') without any
   *  revert snapshot — the row's current identity stays put if the user cancels. */
  const handleOpenAmbiguousPicker = useCallback((rowIndex: number) => {
    const row = state.rows.find(r => r.rowIndex === rowIndex);
    if (!row) return;
    setPickerState({
      rowIndex,
      mpn: row.rawMpn ?? '',
      manufacturer: row.rawManufacturer ?? '',
      candidates: row.candidateMatches,
    });
  }, [state.rows]);

  /** Close the picker. If it was opened from an MPN cell edit, revert the
   *  unsaved cell mutation so the row remains consistent with the original data. */
  const handlePickerCancel = useCallback(() => {
    setPickerState(ps => {
      if (!ps) return null;
      if (ps.revertSnapshot) {
        const { rawCells, rawMpn } = ps.revertSnapshot;
        const rowIndex = ps.rowIndex;
        setState(prev => {
          const idx = prev.rows.findIndex(r => r.rowIndex === rowIndex);
          if (idx < 0) return prev;
          const newRows = [...prev.rows];
          newRows[idx] = { ...prev.rows[idx], rawCells: [...rawCells], rawMpn };
          return { ...prev, rows: newRows };
        });
      }
      return null;
    });
  }, []);

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
    // Collect MPNs needing FC enrichment from two sources:
    //   (1) source parts whose enrichedData lacks supplierQuotes
    //   (2) replacement parts whose supplierQuotes are empty (batch validation
    //       passes skipFindchips=true, so certified recs land with no commercial data —
    //       Repl. Price / Repl. Stock columns go blank until we backfill here)
    const mpnsToEnrich = new Set<string>();
    const rowsWithSourceNeed = new Set<number>();
    const rowsWithRecNeed = new Set<number>();
    for (const r of state.rows) {
      // Ambiguous rows still render with a top-match snapshot (MFR/Repl. Price /
      // Repl. Stock columns need FC enrichment to populate). Skip only rows that
      // genuinely have nothing to enrich.
      if (r.status !== 'resolved' && r.status !== 'ambiguous') continue;
      if (r.enrichedData && r.resolvedPart?.mpn && !r.enrichedData.supplierQuotes?.length) {
        mpnsToEnrich.add(r.resolvedPart.mpn);
        rowsWithSourceNeed.add(r.rowIndex);
      }
      const recMpn = r.replacement?.part.mpn;
      if (recMpn && !r.replacement!.part.supplierQuotes?.length) {
        mpnsToEnrich.add(recMpn);
        rowsWithRecNeed.add(r.rowIndex);
      }
      // Alternate replacements render the same Repl. Price / Repl. Stock columns
      for (const sub of r.replacementAlternates ?? []) {
        if (sub.part.mpn && !sub.part.supplierQuotes?.length) {
          mpnsToEnrich.add(sub.part.mpn);
          rowsWithRecNeed.add(r.rowIndex);
        }
      }
    }

    if (mpnsToEnrich.size === 0) return { requested: 0, enriched: 0 };

    const mpns = Array.from(mpnsToEnrich);
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
          let next = row;

          // Enrich the source part's enrichedData
          if (rowsWithSourceNeed.has(row.rowIndex) && row.enrichedData) {
            const srcMpnLower = row.resolvedPart?.mpn?.toLowerCase();
            const fc = srcMpnLower ? results[srcMpnLower] : undefined;
            if (fc) {
              next = {
                ...next,
                enrichedData: {
                  ...next.enrichedData!,
                  supplierQuotes: fc.quotes.length > 0 ? fc.quotes : next.enrichedData!.supplierQuotes,
                  lifecycleInfo: [...(next.enrichedData!.lifecycleInfo ?? []), ...(fc.lifecycle ? [fc.lifecycle] : [])],
                  complianceData: [...(next.enrichedData!.complianceData ?? []), ...(fc.compliance ? [fc.compliance] : [])],
                },
              };
            }
          }

          // Enrich the replacement's Part with FC commercial data so the
          // Repl. Price / Repl. Stock columns can render without opening the modal.
          if (rowsWithRecNeed.has(row.rowIndex)) {
            if (next.replacement) {
              const recMpnLower = next.replacement.part.mpn.toLowerCase();
              const fc = results[recMpnLower];
              if (fc && (fc.quotes.length > 0 || fc.lifecycle || fc.compliance)) {
                next = {
                  ...next,
                  replacement: {
                    ...next.replacement,
                    part: {
                      ...next.replacement.part,
                      ...(fc.quotes.length > 0 ? { supplierQuotes: fc.quotes } : {}),
                      ...(fc.lifecycle ? { lifecycleInfo: [...(next.replacement.part.lifecycleInfo ?? []), fc.lifecycle] } : {}),
                      ...(fc.compliance ? { complianceData: [...(next.replacement.part.complianceData ?? []), fc.compliance] } : {}),
                    },
                  },
                };
              }
            }
            // Same enrichment for each persisted sub-suggestion
            if (next.replacementAlternates?.length) {
              next = {
                ...next,
                replacementAlternates: next.replacementAlternates.map(sub => {
                  const fc = results[sub.part.mpn.toLowerCase()];
                  if (!fc || (fc.quotes.length === 0 && !fc.lifecycle && !fc.compliance)) return sub;
                  return {
                    ...sub,
                    part: {
                      ...sub.part,
                      ...(fc.quotes.length > 0 ? { supplierQuotes: fc.quotes } : {}),
                      ...(fc.lifecycle ? { lifecycleInfo: [...(sub.part.lifecycleInfo ?? []), fc.lifecycle] } : {}),
                      ...(fc.compliance ? { complianceData: [...(sub.part.complianceData ?? []), fc.compliance] } : {}),
                    },
                  };
                }),
              };
            }
          }

          return next;
        });

        // After FC data is merged, if the list-level hideZeroStock filter is on and
        // the top suggestion has known zero stock, promote the first stocked sub to top
        // and demote the zero-stock original into sub position. Persisted, so subsequent
        // loads no longer depend on the render-time fallback (Decision #145 follow-up).
        const hideZeroStock = listPrioritiesRef.current?.hideZeroStock;
        const finalRows = hideZeroStock ? newRows.map(row => {
          const top = row.replacement;
          if (!top) return row;
          const topQuotes = top.part.supplierQuotes;
          const topHasZero = topQuotes && topQuotes.length > 0
            && topQuotes.reduce((s, q) => s + (q.quantityAvailable ?? 0), 0) === 0;
          if (!topHasZero) return row;
          const subs = row.replacementAlternates ?? [];
          const stockedIdx = subs.findIndex(s => {
            const q = s.part.supplierQuotes;
            return q && q.length > 0 && q.reduce((n, x) => n + (x.quantityAvailable ?? 0), 0) > 0;
          });
          if (stockedIdx < 0) return row;
          const promoted = subs[stockedIdx];
          const newSubs = [...subs];
          newSubs.splice(stockedIdx, 1);
          newSubs.unshift(top); // demote old top into position 0 of subs
          return {
            ...row,
            replacement: promoted,
            replacementAlternates: newSubs.slice(0, 2),
          };
        }) : newRows;

        return { ...prev, rows: finalRows };
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

  // ── Zero-stock promotion (Decision #145 follow-up) ───────────────────────────
  // When hideZeroStock is enabled, promote the first stocked sub into the top
  // suggestion slot. Runs independently of FC enrichment so it fires on list
  // load (where rows arrive with FC data already persisted) and whenever the
  // user toggles the filter. Persists the swap so subsequent loads see the
  // stocked rec as the top without needing the render-time fallback.
  const promotionRunningRef = useRef(false);
  useEffect(() => {
    if (promotionRunningRef.current) return;
    if (!listPrioritiesRef.current?.hideZeroStock) return;
    if (state.phase !== 'results') return;

    const totalStock = (rec?: { part: { supplierQuotes?: { quantityAvailable?: number }[] } }) => {
      const q = rec?.part.supplierQuotes;
      if (!q || q.length === 0) return -1; // unknown
      return q.reduce((s, x) => s + (x.quantityAvailable ?? 0), 0);
    };

    const updates: Array<{ rowIndex: number; newTop: XrefRecommendation; newSubs: XrefRecommendation[] }> = [];
    for (const row of state.rows) {
      const top = row.replacement;
      if (!top) continue;
      if (totalStock(top) !== 0) continue; // top not known-zero
      const subs = row.replacementAlternates ?? [];
      const stockedIdx = subs.findIndex(s => totalStock(s) > 0);
      if (stockedIdx < 0) continue;
      const promoted = subs[stockedIdx];
      const newSubs = [...subs];
      newSubs.splice(stockedIdx, 1);
      newSubs.unshift(top);
      updates.push({ rowIndex: row.rowIndex, newTop: promoted, newSubs: newSubs.slice(0, 2) });
    }
    if (updates.length === 0) return;

    promotionRunningRef.current = true;
    const byIndex = new Map(updates.map(u => [u.rowIndex, u]));
    setState(prev => {
      const newRows = prev.rows.map(r => {
        const u = byIndex.get(r.rowIndex);
        return u ? { ...r, replacement: u.newTop, replacementAlternates: u.newSubs } : r;
      });
      const listId = activeListIdRef.current;
      if (listId) updatePartsListSupabase(listId, newRows).catch(() => {});
      return { ...prev, rows: newRows };
    });
    promotionRunningRef.current = false;
  }, [state.phase, state.rows, state.replacementPriorities]);

  // ── Deep-fetch for rows still zero-stock after promotion ─────────────────────
  // If every persisted candidate in top-3 is zero-stock, fetch the full rec set
  // for that MPN, FC-enrich the top candidates (getRecommendations returns recs
  // with empty supplierQuotes by design — FC enrichment is deferred), then look
  // for a stocked pick further down the list. Concurrency-limited to 2 since
  // each worker now makes 2 upstream round trips + burns 30 FC calls per row.
  const deepFetchRunningRef = useRef<Set<number>>(new Set());
  const deepFetchAttemptedRef = useRef<Set<number>>(new Set());

  // Reset the attempted set when hideZeroStock transitions off, so a subsequent
  // toggle-on retries rows we previously gave up on.
  useEffect(() => {
    if (!listPrioritiesRef.current?.hideZeroStock) {
      deepFetchAttemptedRef.current.clear();
    }
  }, [state.replacementPriorities]);

  useEffect(() => {
    if (!listPrioritiesRef.current?.hideZeroStock) return;
    if (state.phase !== 'results') return;

    const totalStock = (rec?: { part: { supplierQuotes?: { quantityAvailable?: number }[] } }) => {
      const q = rec?.part.supplierQuotes;
      if (!q || q.length === 0) return -1;
      return q.reduce((s, x) => s + (x.quantityAvailable ?? 0), 0);
    };

    // Candidates: rows whose top is known-zero AND no sub has positive stock,
    // AND we haven't already tried + exhausted deep-fetch for them this session.
    const stuckRows = state.rows.filter(r => {
      if (!r.replacement) return false;
      if (deepFetchRunningRef.current.has(r.rowIndex)) return false;
      if (deepFetchAttemptedRef.current.has(r.rowIndex)) return false;
      if (totalStock(r.replacement) !== 0) return false;
      const subs = r.replacementAlternates ?? [];
      return !subs.some(s => totalStock(s) > 0);
    });
    if (stuckRows.length === 0) return;

    const CONCURRENCY = 2;
    const SCAN_TOP_N = 30; // under the 50-MPN /api/fc/enrich cap and keeps FC rate burn bounded
    let cursor = 0;
    const worker = async () => {
      while (cursor < stuckRows.length) {
        const row = stuckRows[cursor++];
        const mpn = row.resolvedPart?.mpn;
        if (!mpn) continue;
        deepFetchRunningRef.current.add(row.rowIndex);
        try {
          const recs = await getRecommendations(mpn, undefined, listPrioritiesRef.current ?? undefined);

          // getRecommendations returns candidates with empty supplierQuotes — FC
          // enrichment is deferred by design. Batch-enrich the top-N so totalStock()
          // can actually evaluate stock instead of always returning -1 (unknown).
          const topMpns = recs.slice(0, SCAN_TOP_N).map(r => r.part.mpn);
          const fcResults = topMpns.length > 0
            ? await enrichWithFCBatch(topMpns).catch(() => ({} as Record<string, { quotes: import('@/lib/types').SupplierQuote[]; lifecycle: import('@/lib/types').LifecycleInfo | null; compliance: import('@/lib/types').ComplianceData | null }>))
            : {};
          const enriched = recs.slice(0, SCAN_TOP_N).map(rec => {
            const fc = fcResults[rec.part.mpn.toLowerCase()];
            if (!fc || fc.quotes.length === 0) return rec;
            return {
              ...rec,
              part: {
                ...rec.part,
                supplierQuotes: fc.quotes,
                ...(fc.lifecycle ? { lifecycleInfo: [...(rec.part.lifecycleInfo ?? []), fc.lifecycle] } : {}),
                ...(fc.compliance ? { complianceData: [...(rec.part.complianceData ?? []), fc.compliance] } : {}),
              },
            };
          });

          const stocked = enriched.find(r => totalStock(r) > 0);
          if (!stocked) {
            // Genuinely no stocked alternative in top-N — don't retry this session.
            deepFetchAttemptedRef.current.add(row.rowIndex);
            continue;
          }
          // Build new top-3: stocked rec + next 2 non-failing (excluding stocked),
          // using `enriched` so the persisted subs also carry FC data.
          const nonFailingOthers = enriched
            .filter(r => r.part.mpn !== stocked.part.mpn)
            .filter(r => !r.matchDetails.some(d => d.ruleResult === 'fail'));
          setState(prev => {
            const newRows = prev.rows.map(r =>
              r.rowIndex === row.rowIndex
                ? { ...r, replacement: stocked, replacementAlternates: nonFailingOthers.slice(0, 2) }
                : r,
            );
            const listId = activeListIdRef.current;
            if (listId) updatePartsListSupabase(listId, newRows).catch(() => {});
            return { ...prev, rows: newRows };
          });
        } catch {
          // Swallow — row stays zero-stock; render-time fallback still shows it.
          // Mark attempted so we don't hammer on every re-render.
          deepFetchAttemptedRef.current.add(row.rowIndex);
        } finally {
          deepFetchRunningRef.current.delete(row.rowIndex);
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(CONCURRENCY, stuckRows.length) }, worker)).catch(() => {});
  }, [state.phase, state.rows, state.replacementPriorities]);

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
    handleConsolidateDuplicates,
    handleLeaveDuplicatesAsIs,
    handleSheetChange,
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
    // Row-identity picker
    pickerState,
    handleReplaceRowIdentity,
    handleOpenAmbiguousPicker,
    handlePickerCancel,
    /** Returns the scope of the most recent validation run. PartsListShell uses
     *  this to suppress list-level summary snackbars after per-row refreshes. */
    getLastValidationScope: () => lastValidationScopeRef.current,
  };
}
