'use client';

import { Fragment, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { PartsListRow, XrefRecommendation } from '@/lib/types';
import { ColumnDefinition, getCellValue } from '@/lib/columnDefinitions';

// Column IDs that display suggestion/replacement data
const SUGGESTION_COLUMN_IDS = new Set([
  'sys:top_suggestion',
  'sys:top_suggestion_mfr',
  'sys:top_suggestion_price',
  'sys:top_suggestion_stock',
]);

/**
 * Extract up to 2 additional non-failing recommendations for sub-row display.
 * Uses live allRecommendations when available, falls back to persisted topNonFailingRecs.
 */
function getSubSuggestions(row: PartsListRow): XrefRecommendation[] {
  if (row.allRecommendations && row.allRecommendations.length >= 2) {
    return row.allRecommendations
      .filter(rec => !rec.matchDetails.some(d => d.ruleResult === 'fail'))
      .slice(1, 3);
  }
  // Fallback: persisted top non-failing recs (already positions #2 and #3)
  return row.topNonFailingRecs ?? [];
}

interface PartsListTableProps {
  rows: PartsListRow[];
  validationProgress: number;
  isValidating: boolean;
  onRowClick: (rowIndex: number) => void;
  columns: ColumnDefinition[];
  error?: string | null;
  selectedRows?: Set<number>;
  onToggleRow?: (rowIndex: number) => void;
  onToggleAll?: () => void;
  sortColumnId?: string | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
  onRefreshRow?: (rowIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
  onHideRow?: (rowIndex: number) => void;
  currency?: string;
}

const ROW_FONT_SIZE = '0.78rem';

// ============================================================
// STATUS CHIP
// ============================================================

function StatusChip({ status }: { status: PartsListRow['status'] }) {
  const { t } = useTranslation();
  switch (status) {
    case 'pending':
      return <Chip label={t('status.pending')} size="small" sx={{ fontSize: '0.7rem' }} />;
    case 'validating':
      return <Chip label={t('status.validating')} size="small" color="info" sx={{ fontSize: '0.7rem' }} />;
    case 'resolved':
      return <Chip label={t('status.resolved')} size="small" color="success" sx={{ fontSize: '0.7rem' }} />;
    case 'not-found':
      return <Chip label={t('status.notFound')} size="small" color="error" sx={{ fontSize: '0.7rem' }} />;
    case 'error':
      return <Chip label={t('status.error')} size="small" color="warning" sx={{ fontSize: '0.7rem' }} />;
  }
}

// ============================================================
// ROW ACTIONS MENU
// ============================================================

function RowActionsMenu({
  rowIndex,
  onRefresh,
  onHide,
  onDelete,
}: {
  rowIndex: number;
  onRefresh?: (rowIndex: number) => void;
  onHide?: (rowIndex: number) => void;
  onDelete?: (rowIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          setAnchorEl(e.currentTarget);
        }}
        sx={{ p: 0.25 }}
      >
        <MoreVertIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {onRefresh && (
          <MenuItem
            onClick={() => { onRefresh(rowIndex); setAnchorEl(null); }}
            sx={{ fontSize: '0.82rem' }}
          >
            <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('rowActions.refresh')}</ListItemText>
          </MenuItem>
        )}
        {onHide && (
          <MenuItem
            onClick={() => { onHide(rowIndex); setAnchorEl(null); }}
            sx={{ fontSize: '0.82rem' }}
          >
            <ListItemIcon><VisibilityOffIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('rowActions.removeFromView')}</ListItemText>
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem
            onClick={() => { onDelete(rowIndex); setAnchorEl(null); }}
            sx={{ fontSize: '0.82rem', color: 'error.main' }}
          >
            <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
            <ListItemText>{t('rowActions.deleteFromList')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

// ============================================================
// OVERFLOW TOOLTIP — only shows when text is truncated
// ============================================================

function OverflowTooltip({
  children,
  sx,
  variant,
}: {
  children: string;
  sx?: React.ComponentProps<typeof Typography>['sx'];
  variant?: React.ComponentProps<typeof Typography>['variant'];
}) {
  const ref = useRef<HTMLElement>(null);
  const [overflowed, setOverflowed] = useState(false);

  return (
    <Tooltip title={children} disableHoverListener={!overflowed} enterDelay={400}>
      <Typography
        ref={ref}
        variant={variant}
        noWrap
        onMouseEnter={() => {
          const el = ref.current;
          if (el) setOverflowed(el.scrollWidth > el.clientWidth);
        }}
        sx={{ fontSize: ROW_FONT_SIZE, ...sx }}
      >
        {children}
      </Typography>
    </Tooltip>
  );
}

// ============================================================
// CELL RENDERER
// ============================================================

function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function CellRenderer({
  column,
  row,
  onRowClick,
  onRefreshRow,
  onDeleteRow,
  onHideRow,
  currency = 'USD',
  recommendation,
  isSubRow,
}: {
  column: ColumnDefinition;
  row: PartsListRow;
  onRowClick: (rowIndex: number) => void;
  onRefreshRow?: (rowIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
  onHideRow?: (rowIndex: number) => void;
  currency?: string;
  recommendation?: XrefRecommendation;
  isSubRow?: boolean;
}) {
  const { t } = useTranslation();

  // Sub-rows only render suggestion system columns
  if (isSubRow && column.source !== 'system') return null;
  if (isSubRow && !SUGGESTION_COLUMN_IDS.has(column.id)) return null;

  // System columns have custom rendering
  if (column.source === 'system') {
    const recCount = row.allRecommendations?.length ?? row.recommendationCount ?? (row.suggestedReplacement ? 1 : 0);
    const topRec = recommendation ?? row.suggestedReplacement;

    switch (column.id) {
      case 'sys:row_number':
        return <>{row.rowIndex + 1}</>;

      case 'sys:status':
        return <StatusChip status={row.status} />;

      case 'sys:hits':
        if (row.status !== 'resolved') return null;
        if (recCount === 0) return <>0</>;
        return (
          <Link
            component="button"
            variant="body2"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onRowClick(row.rowIndex);
            }}
            sx={{ fontSize: ROW_FONT_SIZE, fontWeight: 500 }}
          >
            {recCount}
          </Link>
        );

      case 'sys:top_suggestion':
        if (topRec) {
          const hasFails = topRec.matchDetails.some(d => d.ruleResult === 'fail');
          const dotColor = hasFails ? '#FF5252' : topRec.matchPercentage >= 85 ? '#69F0AE' : '#FFD54F';
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <FiberManualRecordIcon sx={{ fontSize: 8, color: dotColor, flexShrink: 0 }} />
              <OverflowTooltip variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                {topRec.part.mpn}
              </OverflowTooltip>
              <Typography
                component="span"
                sx={{
                  fontSize: '0.68rem',
                  color: topRec.matchPercentage >= 85 ? 'success.main' : 'warning.main',
                  fontWeight: 600,
                  flexShrink: 0,
                  ml: 'auto',
                }}
              >
                {Math.round(topRec.matchPercentage)}%
              </Typography>
            </Box>
          );
        }
        return row.status === 'resolved' && !isSubRow ? (
          <Typography variant="caption" color="text.secondary">
            {t('partsList.noMatch')}
          </Typography>
        ) : null;

      case 'sys:top_suggestion_mfr':
        return topRec?.part.manufacturer ? (
          <OverflowTooltip>
            {topRec.part.manufacturer}
          </OverflowTooltip>
        ) : null;

      case 'sys:top_suggestion_price':
        return topRec?.part.unitPrice != null ? <>{formatPrice(topRec.part.unitPrice, currency)}</> : null;

      case 'sys:top_suggestion_stock':
        return topRec?.part.quantityAvailable != null
          ? <>{topRec.part.quantityAvailable.toLocaleString()}</>
          : null;

      case 'sys:row_actions':
        return (
          <RowActionsMenu
            rowIndex={row.rowIndex}
            onRefresh={onRefreshRow}
            onHide={onHideRow}
            onDelete={onDeleteRow}
          />
        );

      default:
        return null;
    }
  }

  // Data columns: use getCellValue
  const value = getCellValue(column, row);
  if (value === undefined || value === null || value === '') return null;

  // Link columns
  if (column.isLink) {
    if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('//'))) {
      return (
        <Link
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={{ fontSize: ROW_FONT_SIZE }}
        >
          {t('partsList.linkText')}
        </Link>
      );
    }
    return null;
  }

  // Numeric columns
  if (column.isNumeric && typeof value === 'number') {
    if (column.id.includes('Price') || column.id.includes('unitPrice')) {
      return <>{formatPrice(value, currency)}</>;
    }
    return <>{value.toLocaleString()}</>;
  }

  // Default: text with ellipsis
  return (
    <OverflowTooltip>
      {String(value)}
    </OverflowTooltip>
  );
}

// ============================================================
// TABLE
// ============================================================

export default function PartsListTable({
  rows,
  validationProgress,
  isValidating,
  onRowClick,
  columns,
  error,
  selectedRows,
  onToggleRow,
  onToggleAll,
  sortColumnId,
  sortDirection = 'asc',
  onSort,
  onRefreshRow,
  onDeleteRow,
  onHideRow,
  currency = 'USD',
}: PartsListTableProps) {
  const { t } = useTranslation();
  const total = rows.length;
  const processed = rows.filter(r => r.status !== 'pending' && r.status !== 'validating').length;
  const hasSelection = selectedRows !== undefined && onToggleRow !== undefined;
  const allSelected = hasSelection && rows.length > 0 && rows.every(r => selectedRows!.has(r.rowIndex));
  const someSelected = hasSelection && rows.some(r => selectedRows!.has(r.rowIndex));
  const hasSuggestionColumns = columns.some(col => SUGGESTION_COLUMN_IDS.has(col.id));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', px: 3 }}>
      {/* Progress bar */}
      <Box sx={{ pt: 2, pb: 1, flexShrink: 0 }}>
        {error ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
            <Typography variant="body2" color="error.main">
              {error}
            </Typography>
            {processed > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {t('partsList.errorProgress', { processed, total })}
              </Typography>
            )}
          </Box>
        ) : isValidating ? (
          <>
            <LinearProgress
              variant={processed === 0 ? 'indeterminate' : 'determinate'}
              value={validationProgress * 100}
              sx={{ mb: 1, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {processed === 0
                ? t('partsList.startingValidation', { total })
                : t('partsList.validatingProgress', { processed, total })}
            </Typography>
          </>
        ) : null}
      </Box>

      {/* Table */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            {hasSelection && <col style={{ width: '40px' }} />}
            {columns.map(col => (
              <col key={col.id} style={{ width: col.defaultWidth ?? '120px' }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {hasSelection && (
                <TableCell sx={{ px: 0.5, width: 40 }}>
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={onToggleAll}
                    sx={{ p: 0.25 }}
                  />
                </TableCell>
              )}
              {columns.map(col => {
                const isSortable = onSort && col.label && col.id !== 'sys:row_number' && col.id !== 'sys:action' && col.id !== 'sys:row_actions';
                const isActive = sortColumnId === col.id;
                return (
                  <TableCell
                    key={col.id}
                    sortDirection={isActive ? sortDirection : false}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      px: 1,
                      textAlign: col.align ?? 'left',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isSortable ? (
                      <TableSortLabel
                        active={isActive}
                        direction={isActive ? sortDirection : 'asc'}
                        onClick={() => onSort(col.id)}
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          ...(col.align === 'center' && { width: '100%', justifyContent: 'center' }),
                        }}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : (
                      col.label
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const subSuggestions = hasSuggestionColumns ? getSubSuggestions(row) : [];
              const hasSubRows = subSuggestions.length > 0;

              return (
                <Fragment key={row.rowIndex}>
                  {/* Parent row */}
                  <TableRow
                    hover
                    sx={hasSubRows ? { '& td': { borderBottom: 'none' } } : undefined}
                  >
                    {hasSelection && (
                      <TableCell sx={{ px: 0.5, width: 40 }}>
                        <Checkbox
                          size="small"
                          checked={selectedRows!.has(row.rowIndex)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => onToggleRow!(row.rowIndex)}
                          sx={{ p: 0.25 }}
                        />
                      </TableCell>
                    )}
                    {columns.map(col => (
                      <TableCell
                        key={col.id}
                        sx={{
                          fontSize: ROW_FONT_SIZE,
                          px: 1,
                          textAlign: col.align ?? 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <CellRenderer
                          column={col}
                          row={row}
                          onRowClick={onRowClick}
                          onRefreshRow={onRefreshRow}
                          onDeleteRow={onDeleteRow}
                          onHideRow={onHideRow}
                          currency={currency}
                        />
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Suggestion sub-rows */}
                  {subSuggestions.map((rec, subIdx) => (
                    <TableRow
                      key={`${row.rowIndex}-sub-${subIdx}`}
                      onClick={() => onRowClick(row.rowIndex)}
                      sx={{
                        cursor: 'pointer',
                        '& td': {
                          py: '4px',
                          ...(subIdx < subSuggestions.length - 1
                            ? { borderBottom: 'none' }
                            : { borderBottom: '2px solid', borderColor: 'divider' }),
                        },
                      }}
                    >
                      {hasSelection && <TableCell sx={{ px: 0.5, width: 40 }} />}
                      {columns.map(col => (
                        <TableCell
                          key={col.id}
                          sx={{
                            fontSize: ROW_FONT_SIZE,
                            px: 1,
                            textAlign: col.align ?? 'left',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {SUGGESTION_COLUMN_IDS.has(col.id) ? (
                            <CellRenderer
                              column={col}
                              row={row}
                              recommendation={rec}
                              isSubRow
                              onRowClick={onRowClick}
                              currency={currency}
                            />
                          ) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
