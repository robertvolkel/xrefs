'use client';

import { useCallback, useState, useMemo } from 'react';
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
import { useViewConfig } from '@/hooks/useViewConfig';
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
import PartsListHeader from './PartsListHeader';
import PartsListActionBar from './PartsListActionBar';
import ViewControls from './ViewControls';
import ColumnMappingDialog from './ColumnMappingDialog';
import PartsListTable from './PartsListTable';
import PartDetailModal from './PartDetailModal';
import ColumnPickerDialog from './ColumnPickerDialog';
import NewListDialog from '@/components/lists/NewListDialog';

export default function PartsListShell() {
  const { t } = useTranslation();

  const {
    phase, parsedData, columnMapping, rows, validationProgress, error,
    listName, listDescription, listCurrency, listCustomer, listDefaultViewId,
    spreadsheetHeaders, activeListId,
    modalRow, modalSelectedRec, modalComparisonAttrs, modalComparing,
    handleFileSelected, handleParsedDataReady,
    handleColumnMappingConfirmed, handleColumnMappingCancelled,
    handleLoadList, handleOpenModal, handleCloseModal,
    handleModalSelectRec, handleModalBackToRecs,
    handleModalConfirmReplacement, handleModalRecsRefreshed,
    handleUpdateListDetails, handleRefreshRows, handleDeleteRows,
  } = usePartsListState();

  const {
    activeView, views, defaultViewId,
    selectView, createView, updateView, deleteView, setDefaultView,
    hideRowInView, getHiddenRows,
  } = useViewConfig();

  // --- Extracted hooks ---

  usePartsListAutoLoad({
    phase, rows, activeListId, listDefaultViewId, views, selectView,
    handleFileSelected, handleParsedDataReady, handleLoadList, handleRefreshRows,
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

  // --- Local UI state (thin dialog toggles) ---

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'create' | 'edit'>('edit');
  const [editNameOpen, setEditNameOpen] = useState(false);

  // --- Sort/search/filter pipeline (stays in shell) ---

  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

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

    if (inferredMapping) {
      cols = cols
        .map(id => {
          if (id === 'mapped:mpn' && inferredMapping.mpnColumn >= 0) return `ss:${inferredMapping.mpnColumn}`;
          if (id === 'mapped:manufacturer') {
            if (inferredMapping.manufacturerColumn >= 0) return `ss:${inferredMapping.manufacturerColumn}`;
            return 'dk:manufacturer';
          }
          if (id === 'mapped:description' && inferredMapping.descriptionColumn >= 0) return `ss:${inferredMapping.descriptionColumn}`;
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

  const activeColumns: ColumnDefinition[] = useMemo(() => {
    const colMap = new Map(availableColumns.map(c => [c.id, c]));
    const viewCols = resolvedViewColumns
      .map(id => colMap.get(id))
      .filter((c): c is ColumnDefinition => c !== undefined);
    return [...viewCols, ROW_ACTIONS_COLUMN];
  }, [resolvedViewColumns, availableColumns]);

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
        const val = getCellValue(col, row);
        return val != null && String(val).toLowerCase().includes(trimmed);
      }),
    );
  }, [visibleRows, searchTerm, activeColumns]);

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
      const aVal = getSortValue(col, a);
      const bVal = getSortValue(col, b);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
      else cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [searchedRows, sortColumnId, sortDirection, activeColumns]);

  const handleHideRow = useCallback((rowIndex: number) => {
    hideRowInView(activeView.id, activeListId ?? '', rowIndex);
  }, [hideRowInView, activeView.id, activeListId]);

  const showTable = phase === 'validating' || phase === 'results';

  // --- Render ---

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
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
        />
      )}

      {showTable && (
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
      />

      <ColumnPickerDialog
        open={pickerOpen}
        mode={pickerMode}
        availableColumns={availableColumns}
        initialView={pickerMode === 'edit' ? { ...activeView, columns: resolvedViewColumns } : undefined}
        isBuiltinView={pickerMode === 'edit' && activeView.id === 'raw'}
        onSave={(name, columns, description) => {
          if (pickerMode === 'create') createView(name, columns, description);
          else {
            const newName = activeView.id !== 'raw' ? name : undefined;
            updateView(activeView.id, columns, newName, description);
          }
          setPickerOpen(false);
        }}
        onCancel={() => setPickerOpen(false)}
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
    </Box>
  );
}
