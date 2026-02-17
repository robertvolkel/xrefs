'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ClearIcon from '@mui/icons-material/Clear';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import { usePartsListState } from '@/hooks/usePartsListState';
import { useViewConfig } from '@/hooks/useViewConfig';
import { consumePendingFile, peekPendingFile } from '@/lib/pendingFile';
import {
  buildAvailableColumns,
  collectParameterKeys,
  ColumnDefinition,
  getCellValue,
  getSortValue,
  ROW_ACTIONS_COLUMN,
} from '@/lib/columnDefinitions';
import { isBuiltinView } from '@/lib/viewConfigStorage';
import PartsListHeader from './PartsListHeader';
import ColumnMappingDialog from './ColumnMappingDialog';
import PartsListTable from './PartsListTable';
import PartDetailModal from './PartDetailModal';
import ColumnPickerDialog from './ColumnPickerDialog';
import NewListDialog from '@/components/lists/NewListDialog';

export default function PartsListShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const willAutoLoad = useRef(
    !!searchParams.get('listId') || !!peekPendingFile(),
  );

  const {
    phase,
    parsedData,
    columnMapping,
    rows,
    validationProgress,
    error,
    listName,
    listDescription,
    listCurrency,
    spreadsheetHeaders,
    activeListId,
    modalRow,
    modalSelectedRec,
    modalComparisonAttrs,
    modalComparing,
    handleFileSelected,
    handleColumnMappingConfirmed,
    handleColumnMappingCancelled,
    handleLoadList,
    handleOpenModal,
    handleCloseModal,
    handleModalSelectRec,
    handleModalBackToRecs,
    handleModalConfirmReplacement,
    handleModalRecsRefreshed,
    handleUpdateListDetails,
    handleRefreshRows,
    handleDeleteRows,
  } = usePartsListState();

  const {
    activeView,
    views,
    defaultViewId,
    selectView,
    createView,
    updateView,
    deleteView,
    setDefaultView,
    hideRowInView,
    getHiddenRows,
  } = useViewConfig();

  // Column picker dialog state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'create' | 'edit'>('edit');

  // View actions menu state
  const [viewMenuAnchor, setViewMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteViewConfirmOpen, setDeleteViewConfirmOpen] = useState(false);

  // Edit name dialog state
  const [editNameOpen, setEditNameOpen] = useState(false);

  // Row selection state
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Sort state
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Clear selection when rows change (e.g., after delete or validation)
  const rowCountRef = useRef(rows.length);
  useEffect(() => {
    if (rows.length !== rowCountRef.current) {
      setSelectedRows(new Set());
      rowCountRef.current = rows.length;
    }
  }, [rows.length]);

  const handleToggleRow = useCallback((rowIndex: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedRows(prev => {
      const allSelected = rows.length > 0 && rows.every(r => prev.has(r.rowIndex));
      if (allSelected) return new Set();
      return new Set(rows.map(r => r.rowIndex));
    });
  }, [rows]);

  const handleRefreshSelected = useCallback(() => {
    handleRefreshRows([...selectedRows]);
    setSelectedRows(new Set());
  }, [selectedRows, handleRefreshRows]);

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteIndices, setPendingDeleteIndices] = useState<number[]>([]);

  const promptDelete = useCallback((indices: number[]) => {
    setPendingDeleteIndices(indices);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirmed = useCallback(() => {
    handleDeleteRows(pendingDeleteIndices);
    setSelectedRows(new Set());
    setDeleteConfirmOpen(false);
  }, [pendingDeleteIndices, handleDeleteRows]);

  const handleHideFromViewConfirmed = useCallback(() => {
    for (const idx of pendingDeleteIndices) {
      hideRowInView(activeView.id, activeListId ?? '', idx);
    }
    setSelectedRows(new Set());
    setDeleteConfirmOpen(false);
  }, [pendingDeleteIndices, hideRowInView, activeView.id, activeListId]);

  // Guard against React Strict Mode double-invoking the effect.
  // consumePendingFile() is destructive (nullifies the singleton), so the
  // second invocation would find nothing and incorrectly clear willAutoLoad.
  const autoLoadFired = useRef(false);

  // Flag for auto-refreshing all rows after load (e.g. currency change)
  const pendingRefreshAll = useRef(false);

  // Auto-process pending file or load list from URL param
  useEffect(() => {
    if (autoLoadFired.current) return;
    autoLoadFired.current = true;

    const pending = consumePendingFile();
    if (pending) {
      handleFileSelected(pending.file, pending.name, pending.description);
      return;
    }

    const listId = searchParams.get('listId');
    if (listId) {
      if (searchParams.get('refresh') === 'true') {
        pendingRefreshAll.current = true;
      }
      handleLoadList(listId);
      return;
    }

    // Nothing to auto-load — clear the flag so the redirect effect can fire
    willAutoLoad.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger full refresh once list loads with rows available
  useEffect(() => {
    if (pendingRefreshAll.current && phase === 'results' && rows.length > 0) {
      pendingRefreshAll.current = false;
      handleRefreshRows(rows.map(r => r.rowIndex));
    }
  }, [phase, rows, handleRefreshRows]);

  // Redirect to /lists whenever phase falls back to 'empty' (e.g. cancel mapping)
  useEffect(() => {
    if (phase !== 'empty') {
      // Phase moved past empty — auto-load succeeded, safe to clear the flag
      willAutoLoad.current = false;
      return;
    }
    if (!willAutoLoad.current) {
      router.replace('/lists');
    }
  }, [phase, router]);

  // Build available column catalog from current list data
  const parameterKeys = useMemo(() => collectParameterKeys(rows), [rows]);

  // If spreadsheetHeaders is empty but rows have rawCells, infer column count
  // and recover labels from the column mapping where possible.
  // (handles lists saved before headers were properly persisted)
  const effectiveHeaders = useMemo(() => {
    if (spreadsheetHeaders.length > 0) return spreadsheetHeaders;
    const maxCols = rows.reduce((max, r) => Math.max(max, r.rawCells?.length ?? 0), 0);
    if (maxCols === 0) return [];

    // Try to recover labels from the inferred mapping
    const mapping = columnMapping ?? (() => {
      const row = rows.find(r => r.rawMpn && r.rawCells?.length);
      if (!row) return null;
      return {
        mpnColumn: row.rawCells.findIndex(c => c === row.rawMpn),
        manufacturerColumn: row.rawCells.findIndex(c => c === row.rawManufacturer),
        descriptionColumn: row.rawCells.findIndex(c => c === row.rawDescription),
      };
    })();

    return Array.from({ length: maxCols }, (_, i) => {
      if (mapping?.mpnColumn === i) return 'MPN';
      if (mapping?.manufacturerColumn === i) return 'Manufacturer';
      if (mapping?.descriptionColumn === i) return 'Description';
      return `Column ${i + 1}`;
    });
  }, [spreadsheetHeaders, rows, columnMapping]);

  const availableColumns = useMemo(() => {
    const all = buildAvailableColumns(effectiveHeaders, parameterKeys);
    // Track max content length and non-empty status per spreadsheet column
    const nonEmptyIndices = new Set<number>();
    const maxContentLen = new Map<number, number>();
    for (const row of rows) {
      if (!row.rawCells) continue;
      row.rawCells.forEach((val, i) => {
        if (val !== undefined && val !== null && val.toString().trim() !== '') {
          nonEmptyIndices.add(i);
          const len = val.toString().length;
          maxContentLen.set(i, Math.max(maxContentLen.get(i) ?? 0, len));
        }
      });
    }
    return all
      .filter(col =>
        col.source !== 'spreadsheet' || (col.spreadsheetIndex !== undefined && nonEmptyIndices.has(col.spreadsheetIndex)),
      )
      .map(col => {
        if (col.source !== 'spreadsheet' || col.spreadsheetIndex === undefined) return col;
        // Size spreadsheet columns based on actual content width
        const contentLen = maxContentLen.get(col.spreadsheetIndex) ?? 0;
        const headerLen = col.label.length;
        const maxLen = Math.max(contentLen, headerLen);
        let width: string;
        if (maxLen <= 5) width = '65px';
        else if (maxLen <= 10) width = '100px';
        else if (maxLen <= 20) width = '160px';
        else if (maxLen <= 35) width = '220px';
        else width = '280px';
        return { ...col, defaultWidth: width };
      });
  }, [effectiveHeaders, parameterKeys, rows]);

  // Infer the column mapping from row data (needed when loading saved lists
  // where columnMapping isn't persisted). Matches rawMpn/rawManufacturer/rawDescription
  // back to their rawCells index.
  const inferredMapping = useMemo(() => {
    if (columnMapping) return columnMapping;
    const row = rows.find(r => r.rawMpn && r.rawCells?.length);
    if (!row) return null;
    return {
      mpnColumn: row.rawCells.findIndex(c => c === row.rawMpn),
      manufacturerColumn: row.rawCells.findIndex(c => c === row.rawManufacturer),
      descriptionColumn: row.rawCells.findIndex(c => c === row.rawDescription),
    };
  }, [columnMapping, rows]);

  // Resolve view columns: handle Original view (dynamic from headers),
  // and replace mapped:* placeholders with actual spreadsheet column IDs.
  const resolvedViewColumns = useMemo(() => {
    let cols: string[];

    if (activeView.id === 'raw') {
      // Original view: all non-empty spreadsheet columns
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

    // Resolve mapped:* placeholders to actual ss:X column IDs
    if (inferredMapping) {
      cols = cols
        .map(id => {
          if (id === 'mapped:mpn' && inferredMapping.mpnColumn >= 0) return `ss:${inferredMapping.mpnColumn}`;
          if (id === 'mapped:manufacturer' && inferredMapping.manufacturerColumn >= 0) return `ss:${inferredMapping.manufacturerColumn}`;
          if (id === 'mapped:description' && inferredMapping.descriptionColumn >= 0) return `ss:${inferredMapping.descriptionColumn}`;
          return id;
        })
        .filter(id => !id.startsWith('mapped:')); // Drop unresolved placeholders
    } else {
      cols = cols.filter(id => !id.startsWith('mapped:'));
    }

    // Deduplicate — mapped:* may resolve to the same ss:X as another column
    const seen = new Set<string>();
    return cols.filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [activeView, effectiveHeaders, rows, inferredMapping]);

  // Resolve active column definitions + always append row actions column
  const activeColumns: ColumnDefinition[] = useMemo(() => {
    const colMap = new Map(availableColumns.map(c => [c.id, c]));
    const viewCols = resolvedViewColumns
      .map(id => colMap.get(id))
      .filter((c): c is ColumnDefinition => c !== undefined);
    return [...viewCols, ROW_ACTIONS_COLUMN];
  }, [resolvedViewColumns, availableColumns]);

  // Per-view hidden rows
  const hiddenRows = useMemo(
    () => getHiddenRows(activeView.id, activeListId ?? ''),
    [getHiddenRows, activeView.id, activeListId],
  );

  // Filter out hidden rows, then sort
  const visibleRows = useMemo(
    () => hiddenRows.size > 0 ? rows.filter(r => !hiddenRows.has(r.rowIndex)) : rows,
    [rows, hiddenRows],
  );

  // Filter rows by search term across all visible columns
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

  // Sort handler: cycle through asc → desc → none
  const handleSort = useCallback((columnId: string) => {
    setSortColumnId(prev => {
      if (prev !== columnId) {
        setSortDirection('asc');
        return columnId;
      }
      if (sortDirection === 'asc') {
        setSortDirection('desc');
        return columnId;
      }
      // Was desc → clear sort
      setSortDirection('asc');
      return null;
    });
  }, [sortDirection]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    if (!sortColumnId) return searchedRows;
    const col = activeColumns.find(c => c.id === sortColumnId);
    if (!col) return searchedRows;

    return [...searchedRows].sort((a, b) => {
      const aVal = getSortValue(col, a);
      const bVal = getSortValue(col, b);

      // Nulls/undefined always sort last
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [searchedRows, sortColumnId, sortDirection, activeColumns]);

  // Row actions handlers
  const handleHideRow = useCallback((rowIndex: number) => {
    hideRowInView(activeView.id, activeListId ?? '', rowIndex);
  }, [hideRowInView, activeView.id, activeListId]);

  const showTable = phase === 'validating' || phase === 'results';
  const selectionCount = selectedRows.size;

  // View controls JSX — rendered in the header
  const viewControlsNode = (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, mr: 0.5 }}>
        {t('partsList.viewLabel')}
      </Typography>

      <Select
        value={activeView.id}
        onChange={(e) => selectView(e.target.value)}
        size="small"
        variant="outlined"
        sx={{
          minWidth: 140,
          fontSize: '0.82rem',
          '& .MuiSelect-select': { py: 0.5 },
        }}
      >
        {views.map(v => (
          <MenuItem key={v.id} value={v.id} sx={{ fontSize: '0.82rem' }}>
            {v.name}
          </MenuItem>
        ))}
      </Select>

      <IconButton
        size="small"
        onClick={(e) => setViewMenuAnchor(e.currentTarget)}
      >
        <MoreVertIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu
        anchorEl={viewMenuAnchor}
        open={Boolean(viewMenuAnchor)}
        onClose={() => setViewMenuAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem
          disabled={activeView.id === 'raw'}
          onClick={() => {
            setViewMenuAnchor(null);
            setPickerMode('edit');
            setPickerOpen(true);
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('partsList.editView')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setViewMenuAnchor(null);
            setPickerMode('create');
            setPickerOpen(true);
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('partsList.createNewView')}</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isBuiltinView(activeView.id)}
          onClick={() => {
            setViewMenuAnchor(null);
            setDeleteViewConfirmOpen(true);
          }}
          sx={{ fontSize: '0.82rem', ...(!isBuiltinView(activeView.id) && { color: 'error.main' }) }}
        >
          <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ ...(!isBuiltinView(activeView.id) && { color: 'error.main' }) }} /></ListItemIcon>
          <ListItemText>{t('partsList.deleteThisView')}</ListItemText>
        </MenuItem>
      </Menu>

      <Tooltip title={activeView.id === defaultViewId ? t('partsList.isDefaultView') : t('partsList.setDefaultView')}>
        <IconButton
          size="small"
          onClick={() => setDefaultView(activeView.id)}
        >
          {activeView.id === defaultViewId
            ? <StarIcon sx={{ fontSize: 18, color: 'warning.main' }} />
            : <StarOutlineIcon sx={{ fontSize: 18 }} />
          }
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <PartsListHeader
        listName={listName}
        onEditName={() => setEditNameOpen(true)}
        viewControls={viewControlsNode}
        showViewControls={showTable}
      />

      {/* Action toolbar */}
      {showTable && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 3,
            py: 0.75,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
            {selectionCount > 0
              ? t('partsList.selectedCount', { selected: selectionCount, total: visibleRows.length })
              : searchTerm.trim()
                ? t('partsList.searchCount', { filtered: searchedRows.length, total: visibleRows.length, defaultValue: '{{filtered}} of {{total}} parts' })
                : t('partsList.partsCount', { count: visibleRows.length })}
          </Typography>

          <Tooltip title={t('partsList.refreshTooltip')}>
            <span>
              <Button
                size="small"
                startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                disabled={selectionCount === 0}
                onClick={handleRefreshSelected}
                sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'text.secondary' }}
              >
                {t('partsList.refreshButton')}
              </Button>
            </span>
          </Tooltip>

          <Tooltip title={t('partsList.deleteTooltip')}>
            <span>
              <Button
                size="small"
                startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                disabled={selectionCount === 0}
                onClick={() => promptDelete([...selectedRows])}
                sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'text.secondary' }}
              >
                {t('partsList.deleteButton')}
              </Button>
            </span>
          </Tooltip>

          <TextField
            size="small"
            placeholder={t('partsList.searchPlaceholder', { defaultValue: 'Search…' })}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            sx={{ ml: 'auto', maxWidth: 250 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')} sx={{ p: 0.25 }}>
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                sx: { fontSize: '0.82rem' },
              },
            }}
          />
        </Box>
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
          onDeleteRow={(idx) => promptDelete([idx])}
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
        isBuiltinView={pickerMode === 'edit' && isBuiltinView(activeView.id)}
        onSave={(name, columns, description) => {
          if (pickerMode === 'create') {
            createView(name, columns, description);
          } else {
            const newName = !isBuiltinView(activeView.id) ? name : undefined;
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
        onConfirm={async (name, description, currency) => {
          const currencyChanged = await handleUpdateListDetails(name, description, currency);
          setEditNameOpen(false);
          if (currencyChanged && rows.length > 0) {
            handleRefreshRows(rows.map(r => r.rowIndex));
          }
        }}
        onCancel={() => setEditNameOpen(false)}
      />

      {/* Delete view confirmation dialog */}
      <Dialog
        open={deleteViewConfirmOpen}
        onClose={() => setDeleteViewConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('partsList.deleteViewTitle', { name: activeView.name })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('partsList.deleteViewMessage')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setDeleteViewConfirmOpen(false)}
            sx={{ textTransform: 'none' }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDeleteViewConfirmOpen(false);
              deleteView(activeView.id);
            }}
            sx={{ textTransform: 'none' }}
          >
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete rows confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('partsList.removePartsTitle', { count: pendingDeleteIndices.length })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('partsList.removePartsMessage', { count: pendingDeleteIndices.length })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            startIcon={<VisibilityOffIcon />}
            onClick={handleHideFromViewConfirmed}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {t('partsList.removeFromViewOnly')}
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleDeleteConfirmed}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {t('partsList.deleteFromListPermanently')}
          </Button>
          <Button
            color="inherit"
            onClick={() => setDeleteConfirmOpen(false)}
            sx={{ textTransform: 'none' }}
          >
            {t('common.cancel')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
