'use client';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { usePartsListState } from '@/hooks/usePartsListState';
import { useListViewConfig } from '@/hooks/useListViewConfig';
import { useMasterViews } from '@/hooks/useMasterViews';
import { usePartsListAutoLoad } from '@/hooks/usePartsListAutoLoad';
import { useRowSelection } from '@/hooks/useRowSelection';
import { useRowDeletion } from '@/hooks/useRowDeletion';
import { useColumnCatalog } from '@/hooks/useColumnCatalog';
import {
  ColumnDefinition,
  getCellValue,
  getSortValue,
  ROW_ACTIONS_COLUMN,
} from '@/lib/columnDefinitions';
import { type ResolvedView, isBuiltinView, remapSpreadsheetColumns, remapCalcFieldRefs, sanitizeTemplateColumns, sanitizeTemplateCalcFields } from '@/lib/viewConfigStorage';
import PromoteViewDialog, { viewNeedsPromoteDialog, buildFastPathPromoteResult } from './PromoteViewDialog';
import type { CalculatedFieldDef } from '@/lib/calculatedFields';
import AddIcon from '@mui/icons-material/Add';
import PostAddIcon from '@mui/icons-material/PostAdd';
import PartsListHeader from './PartsListHeader';
import PartsListActionBar from './PartsListActionBar';
import ViewControls from './ViewControls';
import ColumnMappingDialog from './ColumnMappingDialog';
import PartsListTable from './PartsListTable';
import PartDetailModal from './PartDetailModal';
import ColumnPickerDialog from './ColumnPickerDialog';
import AddPartDialog from './AddPartDialog';
import NewListDialog from '@/components/lists/NewListDialog';
import ListAgentFooter from './ListAgentFooter';
import ListAgentDrawer from './ListAgentDrawer';
import NotificationSnackbar from '@/components/NotificationSnackbar';
import { useListAgent } from '@/hooks/useListAgent';

export default function PartsListShell() {
  const { t } = useTranslation();

  const {
    phase, parsedData, columnMapping, rows, validationProgress, error, lastRefreshedAt,
    listName, listDescription, listCurrency, listCustomer, listDefaultViewId,
    spreadsheetHeaders, activeListId, listViewConfigs,
    modalRow, modalSelectedRec, modalComparisonAttrs, modalComparing,
    handleFileSelected, handleParsedDataReady,
    handleColumnMappingConfirmed, handleColumnMappingCancelled,
    handleLoadList, handleOpenModal, handleCloseModal,
    handleModalSelectRec, handleModalBackToRecs,
    handleModalConfirmReplacement, handleModalRecsRefreshed,
    handleSetPreferred,
    handleUpdateListDetails, handleRefreshRows, handleSetPartType, handleDeleteRows,
    handleCreateEmptyList, handleAddPart, handleCellEdit, handleCancelValidation,
    handleRetryFCEnrichment, getFCEnrichResult,
  } = usePartsListState();

  const {
    masterViews,
    createMasterView, updateMasterView, deleteMasterView,
  } = useMasterViews();

  const {
    activeView, views, defaultViewId,
    selectView, createView, updateView, deleteView, setDefaultView,
    hideRowInView, getHiddenRows,
  } = useListViewConfig(activeListId, listViewConfigs, masterViews);

  // --- Promote-to-master flow (state + core logic) ---
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteTargetView, setPromoteTargetView] = useState<ResolvedView | null>(null);

  const doPromote = useCallback(async (view: ResolvedView, options: {
    columns: string[];
    columnMeta: Record<string, string>;
  }) => {
    const safeCalcFields = sanitizeTemplateCalcFields(view.calculatedFields);
    const created = await createMasterView({
      name: view.name,
      columns: options.columns,
      description: view.description,
      columnMeta: Object.keys(options.columnMeta).length > 0 ? options.columnMeta : undefined,
      calculatedFields: safeCalcFields,
    });
    if (created) {
      deleteView(view.id);
      selectView(created.id);
    }
  }, [createMasterView, deleteView, selectView]);

  const handleDemoteView = useCallback(async (view: ResolvedView) => {
    // Find the master view to get its full data
    const master = masterViews.find(mv => mv.id === view.id);
    if (!master) return;
    // Create a list-specific copy
    const listView = createView(
      master.name,
      master.columns,
      master.description,
      master.columnMeta,
      master.calculatedFields,
    );
    // Delete the master view
    await deleteMasterView(master.id);
    selectView(listView.id);
  }, [masterViews, createView, deleteMasterView, selectView]);

  const handleDeleteMasterView = useCallback(async (view: ResolvedView) => {
    await deleteMasterView(view.id);
    // activeView will auto-fallback in useListViewConfig
  }, [deleteMasterView]);

  // --- Extracted hooks ---

  // Prefer the starred default from ViewState (loaded from Supabase view_configs JSONB),
  // fall back to the list-level default (parts_lists.default_view_id column).
  // Use listViewConfigs directly (not the hook's defaultViewId) to avoid timing issues
  // where the hook hasn't re-initialized yet on first render.
  const effectiveDefaultViewId = listViewConfigs?.defaultViewId || listDefaultViewId;

  usePartsListAutoLoad({
    phase, rows, activeListId,
    listDefaultViewId: effectiveDefaultViewId,
    views, selectView,
    handleFileSelected, handleParsedDataReady, handleLoadList, handleRefreshRows,
    handleCreateEmptyList,
  });

  const {
    selectedRows, selectionCount, handleToggleRow, handleToggleAll,
    handleRefreshSelected, clearSelection,
  } = useRowSelection(rows, handleRefreshRows);

  const deletion = useRowDeletion(
    handleDeleteRows, hideRowInView, activeView.id, activeListId, clearSelection,
  );

  const { effectiveHeaders, availableColumns, inferredMapping } = useColumnCatalog(
    rows, columnMapping, spreadsheetHeaders,
  );

  // --- Promote-to-master handlers (need inferredMapping from useColumnCatalog) ---

  const handlePromoteView = useCallback((view: ResolvedView) => {
    // Fast-path: no remaining ss:* columns after reverse-mapping → skip dialog
    if (!viewNeedsPromoteDialog(view, inferredMapping)) {
      doPromote(view, buildFastPathPromoteResult(view, inferredMapping));
      return;
    }
    setPromoteTargetView(view);
    setPromoteDialogOpen(true);
  }, [inferredMapping, doPromote]);

  const handlePromoteConfirm = useCallback(async (options: {
    columns: string[];
    columnMeta: Record<string, string>;
  }) => {
    if (!promoteTargetView) return;
    setPromoteDialogOpen(false);
    await doPromote(promoteTargetView, options);
    setPromoteTargetView(null);
  }, [promoteTargetView, doPromote]);

  // --- Local UI state (thin dialog toggles) ---

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'create' | 'edit'>('edit');
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (highlightedRowIndex != null) {
      highlightTimerRef.current = setTimeout(() => setHighlightedRowIndex(null), 2000);
      return () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current); };
    }
  }, [highlightedRowIndex]);

  // --- Notification snackbar ---

  const [notification, setNotification] = useState<{
    message: string;
    severity: 'warning' | 'error' | 'info';
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    const wasValidating = prevPhaseRef.current === 'validating';
    prevPhaseRef.current = phase;
    if (!wasValidating || phase !== 'results') return;

    // Check for validation failures
    const errorCount = rows.filter(r => r.status === 'error').length;
    const notFoundCount = rows.filter(r => r.status === 'not-found').length;
    const resolvedCount = rows.filter(r => r.status === 'resolved').length;

    if (errorCount > 0) {
      setNotification({
        message: t('partsList.notifications.validationErrors', { count: errorCount }),
        severity: 'warning',
      });
      return;
    }

    // Check FC enrichment after a short delay (it runs async after validation)
    const timer = setTimeout(() => {
      const result = getFCEnrichResult();
      if (result && result.requested > 0 && result.enriched === 0) {
        setNotification({
          message: t('partsList.notifications.fcUnavailable'),
          severity: 'warning',
          actionLabel: t('partsList.notifications.retry'),
          onAction: () => {
            setNotification(null);
            handleRetryFCEnrichment().then(retryResult => {
              if (retryResult.enriched > 0) {
                setNotification({
                  message: t('partsList.notifications.fcLoaded', { count: retryResult.enriched }),
                  severity: 'success' as 'info',
                });
              }
            }).catch(() => {});
          },
        });
      } else if (resolvedCount > 0 && notFoundCount > 0) {
        setNotification({
          message: t('partsList.notifications.someNotFound', { count: notFoundCount }),
          severity: 'info',
        });
      }
    }, 3000); // Wait for FC enrichment to finish

    return () => clearTimeout(timer);
  }, [phase, rows, t, getFCEnrichResult, handleRetryFCEnrichment]);

  // --- Sort/search/filter pipeline (stays in shell) ---

  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // --- List Agent ---

  const listAgent = useListAgent({
    rows, listId: activeListId, listName, listDescription: listDescription ?? '',
    listCustomer: listCustomer ?? '', listCurrency: listCurrency ?? 'USD',
    activeView, views,
    setSearchTerm, setSortColumnId, setSortDirection,
    selectView, handleRefreshRows, handleDeleteRows, handleSetPreferred,
  });

  // Resolve view columns: handle Original view, replace mapped:* placeholders
  const resolvedViewColumns = useMemo(() => {
    let cols: string[];
    if (activeView.id === 'raw') {
      cols = effectiveHeaders
        .map((_, i) => i)
        .filter(i => rows.some(r => {
          const val = r.rawCells?.[i];
          return val !== undefined && val !== null && val.toString().trim() !== '';
        }))
        .map(i => `ss:${i}`);
    } else {
      cols = activeView.columns;
    }

    // Remap ss:* columns using stored header metadata (cross-list portability)
    cols = remapSpreadsheetColumns(cols, activeView.columnMeta, effectiveHeaders);

    if (inferredMapping) {
      cols = cols
        .map(id => {
          if (id === 'mapped:mpn' && inferredMapping.mpnColumn >= 0) return `ss:${inferredMapping.mpnColumn}`;
          if (id === 'mapped:manufacturer') {
            if (inferredMapping.manufacturerColumn >= 0) return `ss:${inferredMapping.manufacturerColumn}`;
            return 'dk:manufacturer';
          }
          if (id === 'mapped:description' && inferredMapping.descriptionColumn >= 0) return `ss:${inferredMapping.descriptionColumn}`;
          if (id === 'mapped:cpn') {
            if (inferredMapping.cpnColumn != null && inferredMapping.cpnColumn >= 0) return `ss:${inferredMapping.cpnColumn}`;
            return 'mapped:cpn'; // Will be filtered out below
          }
          if (id === 'mapped:ipn') {
            if (inferredMapping.ipnColumn != null && inferredMapping.ipnColumn >= 0) return `ss:${inferredMapping.ipnColumn}`;
            return 'mapped:ipn'; // Will be filtered out below
          }
          return id;
        })
        .filter(id => !id.startsWith('mapped:'));
    } else {
      cols = cols.filter(id => !id.startsWith('mapped:'));
    }

    const seen = new Set<string>();
    return cols.filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [activeView, effectiveHeaders, rows, inferredMapping]);

  // Track which columns in the resolved view were portable (mapped:* or header-remapped)
  const portableColumnIds = useMemo(() => {
    if (activeView.scope !== 'master') return undefined;
    const ids = new Set<string>();
    const viewCols = activeView.columns;

    // mapped:* columns that were resolved to ss:* or dk:*
    if (inferredMapping) {
      for (const id of viewCols) {
        if (id === 'mapped:mpn' && inferredMapping.mpnColumn >= 0)
          ids.add(`ss:${inferredMapping.mpnColumn}`);
        if (id === 'mapped:manufacturer') {
          if (inferredMapping.manufacturerColumn >= 0) ids.add(`ss:${inferredMapping.manufacturerColumn}`);
          else ids.add('dk:manufacturer');
        }
        if (id === 'mapped:description' && inferredMapping.descriptionColumn >= 0)
          ids.add(`ss:${inferredMapping.descriptionColumn}`);
        if (id === 'mapped:cpn' && inferredMapping.cpnColumn != null && inferredMapping.cpnColumn >= 0)
          ids.add(`ss:${inferredMapping.cpnColumn}`);
        if (id === 'mapped:ipn' && inferredMapping.ipnColumn != null && inferredMapping.ipnColumn >= 0)
          ids.add(`ss:${inferredMapping.ipnColumn}`);
      }
    }

    // ss:* columns that have columnMeta (portable by header name)
    if (activeView.columnMeta) {
      for (const ssId of Object.keys(activeView.columnMeta)) {
        // Find the resolved ID (may have been remapped to a different index)
        if (resolvedViewColumns.includes(ssId)) ids.add(ssId);
        // Also check if it was remapped to a different ss:* by remapSpreadsheetColumns
        const storedHeader = activeView.columnMeta[ssId];
        if (storedHeader) {
          const remappedId = resolvedViewColumns.find(
            rId => rId.startsWith('ss:') && effectiveHeaders[parseInt(rId.slice(3), 10)]?.toLowerCase() === storedHeader.toLowerCase()
          );
          if (remappedId) ids.add(remappedId);
        }
      }
    }

    return ids.size > 0 ? ids : undefined;
  }, [activeView, inferredMapping, resolvedViewColumns, effectiveHeaders]);

  // Build ColumnDefinition objects for this view's calculated fields
  const calcColumnDefs = useMemo(() => {
    const fields = activeView.calculatedFields;
    if (!fields || fields.length === 0) return new Map<string, ColumnDefinition>();
    const map = new Map<string, ColumnDefinition>();
    for (const cf of fields) {
      const id = `calc:${cf.id}`;
      map.set(id, {
        id,
        label: cf.label,
        source: 'calculated',
        group: 'Calculated',
        align: cf.align ?? 'right',
        isNumeric: true,
        calculatedField: cf,
      });
    }
    return map;
  }, [activeView.calculatedFields]);

  const activeColumns: ColumnDefinition[] = useMemo(() => {
    const colMap = new Map(availableColumns.map(c => [c.id, c]));
    const viewCols = resolvedViewColumns
      .map(id => colMap.get(id) ?? calcColumnDefs.get(id))
      .filter((c): c is ColumnDefinition => c !== undefined);
    return [...viewCols, ROW_ACTIONS_COLUMN];
  }, [resolvedViewColumns, availableColumns, calcColumnDefs]);

  // Column map for calculated field resolution (all columns including calc)
  const columnMap = useMemo(() => {
    const map = new Map(availableColumns.map(c => [c.id, c]));
    for (const [id, def] of calcColumnDefs) map.set(id, def);
    return map;
  }, [availableColumns, calcColumnDefs]);

  const hiddenRows = useMemo(
    () => getHiddenRows(activeView.id, activeListId ?? ''),
    [getHiddenRows, activeView.id, activeListId],
  );

  const visibleRows = useMemo(
    () => hiddenRows.size > 0 ? rows.filter(r => !hiddenRows.has(r.rowIndex)) : rows,
    [rows, hiddenRows],
  );

  const searchedRows = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase();
    if (!trimmed) return visibleRows;
    return visibleRows.filter(row =>
      activeColumns.some(col => {
        const val = getCellValue(col, row, columnMap);
        return val != null && String(val).toLowerCase().includes(trimmed);
      }),
    );
  }, [visibleRows, searchTerm, activeColumns, columnMap]);

  const handleSort = useCallback((columnId: string) => {
    setSortColumnId(prev => {
      if (prev !== columnId) { setSortDirection('asc'); return columnId; }
      if (sortDirection === 'asc') { setSortDirection('desc'); return columnId; }
      setSortDirection('asc');
      return null;
    });
  }, [sortDirection]);

  const sortedRows = useMemo(() => {
    if (!sortColumnId) return searchedRows;
    const col = activeColumns.find(c => c.id === sortColumnId);
    if (!col) return searchedRows;
    return [...searchedRows].sort((a, b) => {
      const aVal = getSortValue(col, a, columnMap);
      const bVal = getSortValue(col, b, columnMap);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
      else cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [searchedRows, sortColumnId, sortDirection, activeColumns, columnMap]);

  const handleHideRow = useCallback((rowIndex: number) => {
    hideRowInView(activeView.id, activeListId ?? '', rowIndex);
  }, [hideRowInView, activeView.id, activeListId]);

  const showTable = phase === 'validating' || phase === 'results';

  // --- Render ---

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', position: 'relative' }}>
      <PartsListHeader
        listName={listName}
        onEditName={() => setEditNameOpen(true)}
        viewControls={
          <ViewControls
            activeView={activeView}
            views={views}
            defaultViewId={defaultViewId}
            selectView={selectView}
            deleteView={deleteView}
            setDefaultView={setDefaultView}
            onEditView={() => { setPickerMode('edit'); setPickerOpen(true); }}
            onCreateView={() => { setPickerMode('create'); setPickerOpen(true); }}
            onPromoteView={handlePromoteView}
            onDemoteView={handleDemoteView}
            onDeleteMasterView={handleDeleteMasterView}
          />
        }
        showViewControls={showTable}
      />

      {showTable && (
        <PartsListActionBar
          selectionCount={selectionCount}
          visibleRowCount={visibleRows.length}
          searchedRowCount={searchedRows.length}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefreshSelected}
          onDelete={() => deletion.promptDelete([...selectedRows])}
          onAddPart={() => setAddPartOpen(true)}
        />
      )}

      {showTable && rows.length === 0 && phase === 'results' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <PostAddIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            {t('partsList.emptyListHeading')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('partsList.emptyListSubheading')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddPartOpen(true)}
            sx={{ borderRadius: 20, textTransform: 'none' }}
          >
            {t('partsList.addPart')}
          </Button>
        </Box>
      )}

      {showTable && (rows.length > 0 || phase === 'validating') && (
        <PartsListTable
          rows={sortedRows}
          validationProgress={validationProgress}
          isValidating={phase === 'validating'}
          onRowClick={handleOpenModal}
          columns={activeColumns}
          error={error}
          selectedRows={selectedRows}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          sortColumnId={sortColumnId}
          sortDirection={sortDirection}
          onSort={handleSort}
          onRefreshRow={(idx) => handleRefreshRows([idx])}
          onDeleteRow={(idx) => deletion.promptDelete([idx])}
          onHideRow={handleHideRow}
          currency={listCurrency}
          columnMap={columnMap}
          onCellEdit={handleCellEdit}
          highlightedRowIndex={highlightedRowIndex}
          onCancelValidation={handleCancelValidation}
          onSetPartType={(idx, pt) => handleSetPartType([idx], pt)}
          portableColumnIds={portableColumnIds}
        />
      )}

      <ColumnMappingDialog
        open={phase === 'mapping'}
        parsedData={parsedData}
        initialMapping={columnMapping}
        onConfirm={handleColumnMappingConfirmed}
        onCancel={handleColumnMappingCancelled}
      />

      <PartDetailModal
        open={modalRow !== null}
        row={modalRow}
        selectedRec={modalSelectedRec}
        comparisonAttrs={modalComparisonAttrs}
        isComparing={modalComparing}
        onClose={handleCloseModal}
        onSelectRec={handleModalSelectRec}
        onBackToRecs={handleModalBackToRecs}
        onConfirmReplacement={handleModalConfirmReplacement}
        onRecommendationsRefreshed={handleModalRecsRefreshed}
        preferredMpn={modalRow?.preferredMpn}
        onTogglePreferred={(mpn) => {
          if (modalRow) handleSetPreferred(modalRow.rowIndex, mpn || null);
        }}
      />

      <ColumnPickerDialog
        open={pickerOpen}
        mode={pickerMode}
        availableColumns={availableColumns}
        initialView={pickerMode === 'edit' ? { ...activeView, columns: resolvedViewColumns } : undefined}
        isBuiltinView={pickerMode === 'edit' && activeView.id === 'raw'}
        viewScope={pickerMode === 'edit' ? activeView.scope : undefined}
        onSave={async (name, columns, description, calcFields, scope) => {
          // Build columnMeta: map each ss:N to its current header text
          const meta: Record<string, string> = {};
          for (const colId of columns) {
            if (colId.startsWith('ss:')) {
              const idx = parseInt(colId.slice(3), 10);
              if (idx >= 0 && idx < effectiveHeaders.length) {
                meta[colId] = effectiveHeaders[idx];
              }
            }
          }
          const columnMeta = Object.keys(meta).length > 0 ? meta : undefined;

          if (pickerMode === 'create') {
            if (scope === 'master') {
              // Create as master view (sanitize ss:* columns)
              const safeColumns = sanitizeTemplateColumns(columns);
              const safeCalcFields = sanitizeTemplateCalcFields(calcFields);
              const created = await createMasterView({
                name,
                columns: safeColumns,
                description,
                columnMeta,
                calculatedFields: safeCalcFields,
              });
              if (created) selectView(created.id);
            } else {
              createView(name, columns, description, columnMeta, calcFields);
            }
          } else {
            // Edit mode
            if (activeView.scope === 'master') {
              // Update master view via API
              const safeColumns = sanitizeTemplateColumns(columns);
              const safeCalcFields = sanitizeTemplateCalcFields(calcFields);
              await updateMasterView(activeView.id, {
                name: activeView.id !== 'raw' ? name : undefined,
                columns: safeColumns,
                description,
                columnMeta,
                calculatedFields: safeCalcFields,
              });
            } else {
              const newName = activeView.id !== 'raw' ? name : undefined;
              updateView(activeView.id, columns, newName, description, columnMeta, calcFields);
            }
          }
          setPickerOpen(false);
        }}
        onCancel={() => setPickerOpen(false)}
      />

      <AddPartDialog
        open={addPartOpen}
        onAdd={(mpn, mfr, resolvedPart, extra) => {
          const idx = handleAddPart(mpn, mfr, resolvedPart, extra);
          setAddPartOpen(false);
          if (idx != null) setHighlightedRowIndex(idx);
        }}
        onCancel={() => setAddPartOpen(false)}
        spreadsheetHeaders={effectiveHeaders}
        inferredMapping={inferredMapping}
      />

      <PromoteViewDialog
        open={promoteDialogOpen}
        view={promoteTargetView}
        effectiveHeaders={effectiveHeaders}
        inferredMapping={inferredMapping}
        onConfirm={handlePromoteConfirm}
        onCancel={() => { setPromoteDialogOpen(false); setPromoteTargetView(null); }}
      />

      <NewListDialog
        open={editNameOpen}
        fileName=""
        mode="edit"
        initialName={listName ?? ''}
        initialDescription={listDescription ?? ''}
        initialCurrency={listCurrency}
        initialCustomer={listCustomer ?? ''}
        initialDefaultViewId={listDefaultViewId ?? ''}
        views={views}
        onConfirm={async (name, description, currency, customer, dvId) => {
          const currencyChanged = await handleUpdateListDetails(name, description, currency, customer, dvId);
          setEditNameOpen(false);
          if (currencyChanged && rows.length > 0) {
            handleRefreshRows(rows.map(r => r.rowIndex));
          }
        }}
        onCancel={() => setEditNameOpen(false)}
      />

      {/* List Agent */}
      {showTable && (
        <>
          <ListAgentDrawer
            open={listAgent.isOpen}
            messages={listAgent.messages}
            isLoading={listAgent.isLoading}
            onClose={listAgent.toggleOpen}
            onSendMessage={listAgent.handleSendMessage}
            onActionConfirm={listAgent.handleActionConfirm}
            onActionCancel={listAgent.handleActionCancel}
          />
          <ListAgentFooter
            isOpen={listAgent.isOpen}
            onToggle={listAgent.toggleOpen}
            isLoading={listAgent.isLoading}
            lastRefreshedAt={lastRefreshedAt}
            itemCount={rows.length}
          />
        </>
      )}

      {/* Delete rows confirmation dialog */}
      <Dialog
        open={deletion.deleteConfirmOpen}
        onClose={() => deletion.setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('partsList.removePartsTitle', { count: deletion.pendingDeleteIndices.length })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('partsList.removePartsMessage', { count: deletion.pendingDeleteIndices.length })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            startIcon={<VisibilityOffIcon />}
            onClick={deletion.handleHideFromViewConfirmed}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {t('partsList.removeFromViewOnly')}
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={deletion.handleDeleteConfirmed}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {t('partsList.deleteFromListPermanently')}
          </Button>
          <Button
            color="inherit"
            onClick={() => deletion.setDeleteConfirmOpen(false)}
            sx={{ textTransform: 'none' }}
          >
            {t('common.cancel')}
          </Button>
        </DialogActions>
      </Dialog>

      <NotificationSnackbar
        open={notification !== null}
        message={notification?.message ?? ''}
        severity={notification?.severity}
        onClose={() => setNotification(null)}
        actionLabel={notification?.actionLabel}
        onAction={notification?.onAction}
      />
    </Box>
  );
}
