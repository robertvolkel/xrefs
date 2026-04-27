'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
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
import StarIcon from '@mui/icons-material/Star';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { PartsListRow, XrefRecommendation, PartType, RecommendationBucket, ColumnMapping, SupplierQuote, computeRecommendationCounts, deriveRecommendationBucket } from '@/lib/types';
import SupplierBreakdownPopover from './SupplierBreakdownPopover';
import CheapestViablePopover from './CheapestViablePopover';
import { SUPPLIER_DISPLAY } from '@/components/AttributesTabContent';
import { ColumnDefinition, getCellValue, computePriceDelta, getColumnDisplayLabel, resolveBestRecPrice, pickCheapestViableRecs } from '@/lib/columnDefinitions';

// Column IDs that display replacement data
const REPLACEMENT_COLUMN_IDS = new Set([
  'sys:top_suggestion',
  'sys:top_suggestion_mfr',
  'sys:top_suggestion_price',
  'sys:top_suggestion_stock',
  'sys:top_suggestion_supplier',
  'sys:priceDelta',
]);

/**
 * Extract up to (maxReplacements - 1) additional non-failing replacements for sub-row display.
 * Uses live allRecommendations when available, falls back to persisted replacementAlternates.
 */
function getAlternateReplacements(
  row: PartsListRow,
  hideZeroStock = false,
  buckets?: RecommendationBucket[],
  maxReplacements = 3,
): XrefRecommendation[] {
  let base: XrefRecommendation[];
  if (row.allRecommendations && row.allRecommendations.length >= 2) {
    const nonFailing = row.allRecommendations
      .filter(rec => !rec.matchDetails.some(d => d.ruleResult === 'fail'));
    // If a preferred MPN is set, exclude it from alternates (it's the top replacement)
    base = row.preferredMpn
      ? nonFailing.filter(rec => rec.part.mpn !== row.preferredMpn)
      : nonFailing.slice(1); // Skip #1 (already the top replacement)
  } else {
    // Fallback: persisted alternates (up to 4 positions #2–#5)
    base = row.replacementAlternates ?? [];
  }

  // If an alternate was promoted to effective top, exclude it from sub-rows
  const effectiveTop = pickEffectiveTopRec(row, hideZeroStock, buckets);
  if (effectiveTop && effectiveTop.part.mpn !== row.replacement?.part.mpn) {
    base = base.filter(r => r.part.mpn !== effectiveTop.part.mpn);
  }

  // Apply filters: bucket match + zero-stock
  base = base.filter(r => recPassesFilters(r, hideZeroStock, buckets));

  // Cap to (maxReplacements - 1) since 1 slot is used by the top replacement
  const subCap = Math.max(0, (maxReplacements ?? 3) - 1);
  return base.slice(0, subCap);
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
  /** Column map for calculated field operand resolution */
  columnMap?: Map<string, ColumnDefinition>;
  /** Called when user edits a spreadsheet cell inline */
  onCellEdit?: (rowIndex: number, columnId: string, newValue: string) => void;
  /** Row index to briefly highlight (new part just added) */
  highlightedRowIndex?: number | null;
  /** Called to cancel in-progress validation */
  onCancelValidation?: () => void;
  /** Called when user changes part type via inline dropdown */
  onSetPartType?: (rowIndex: number, partType: PartType) => void;
  /** Column IDs that were resolved via portable mapping (mapped:* or header remapping) */
  portableColumnIds?: Set<string>;
  /** List-level hideZeroStock filter — promotes a stocked sub-rec over a zero-stock top at render time */
  hideZeroStock?: boolean;
  /** List-level bucket filter for sub-rows (multi-select). Empty / undefined = all. */
  buckets?: RecommendationBucket[];
  /** Max number of total replacements (top + alternates) rendered per row. */
  maxReplacements?: number;
  /** Called when user clicks the status chip on a row with status='ambiguous',
   *  to open the row-identity picker with the row's candidateMatches. */
  onAmbiguousClick?: (rowIndex: number) => void;
  /** Column mapping — used to detect which ss:* column is the MPN column so
   *  Enter in that cell forces a commit (opens the picker) even without edits. */
  columnMapping?: ColumnMapping | null;
}

const ROW_FONT_SIZE = '0.78rem';

// ============================================================
// STATUS CHIP
// ============================================================

function StatusChip({
  status,
  candidateCount,
  onClick,
}: {
  status: PartsListRow['status'];
  candidateCount?: number;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  switch (status) {
    case 'pending':
      return <Chip label={t('status.pending')} size="small" sx={{ fontSize: '0.7rem' }} />;
    case 'validating':
      return <Chip label={t('status.validating')} size="small" color="info" sx={{ fontSize: '0.7rem' }} />;
    case 'resolved':
      return <Chip label={t('status.resolved')} size="small" color="success" sx={{ fontSize: '0.7rem' }} />;
    case 'ambiguous':
      return (
        <Chip
          label={candidateCount && candidateCount > 0 ? `${candidateCount} matches` : 'Pick match'}
          size="small"
          color="warning"
          clickable={!!onClick}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
          sx={{ fontSize: '0.7rem' }}
        />
      );
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
// EDITABLE CELL
// ============================================================

function EditableCell({
  value,
  onCommit,
  alwaysCommitOnEnter,
}: {
  value: string;
  onCommit: (newValue: string) => void;
  /** When true, pressing Enter fires onCommit even if the draft matches the
   *  current value. Used for MPN cells where Enter means "confirm identity"
   *  (open the row-identity picker) — retrying a Not Found row without edits
   *  is legitimate and shouldn't be a silent no-op. */
  alwaysCommitOnEnter?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit]);

  const commitFromEnter = useCallback(() => {
    setEditing(false);
    if (alwaysCommitOnEnter || draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit, alwaysCommitOnEnter]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  if (!editing) {
    return (
      <Box
        onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        sx={{
          cursor: 'text',
          minHeight: 20,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          '&:hover': { outline: '1px dashed', outlineColor: 'divider', outlineOffset: 1, borderRadius: 0.5 },
        }}
        title={value || undefined}
      >
        {value || '\u00A0'}
      </Box>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commitFromEnter(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        e.stopPropagation();
      }}
      onClick={e => e.stopPropagation()}
      style={{
        width: '100%',
        background: 'transparent',
        border: '1px solid var(--mui-palette-primary-main, #90caf9)',
        borderRadius: 3,
        color: 'inherit',
        font: 'inherit',
        fontSize: 'inherit',
        padding: '1px 4px',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ============================================================
// CELL RENDERER
// ============================================================

function formatPrice(value: number, currency: string): string {
  try {
    // min 2 / max 4 decimals — keeps standard prices ($1.23) clean, but preserves
    // significant digits on sub-cent passives ($0.0035) instead of rounding to $0.00.
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
  } catch {
    return `${value.toFixed(4)} ${currency}`;
  }
}

/** Click-to-reveal wrapper for the "Lowest Repl. Price" cell. Same visual
 *  affordance as SupplierBreakdownTrigger — bubbles the row's cheapest viable
 *  recs up to PartsListTable's CheapestViablePopover. */
function CheapestViableTrigger({
  onClick,
  recs,
  sourceMpn,
  rowIndex,
  isFallback,
  children,
}: {
  onClick?: (
    anchor: HTMLElement,
    info: { recs: XrefRecommendation[]; sourceMpn: string; rowIndex: number; isFallback?: boolean },
  ) => void;
  recs: XrefRecommendation[] | undefined;
  sourceMpn: string;
  rowIndex: number;
  isFallback?: boolean;
  children: React.ReactNode;
}) {
  if (!onClick || !recs || recs.length === 0) return <>{children}</>;
  return (
    <Box
      component="span"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget as HTMLElement, { recs, sourceMpn, rowIndex, isFallback });
      }}
      sx={{
        cursor: 'pointer',
        textDecoration: 'underline dotted',
        textUnderlineOffset: '2px',
        textDecorationColor: 'text.disabled',
        '&:hover': { textDecorationColor: 'primary.main', color: 'primary.main' },
      }}
    >
      {children}
    </Box>
  );
}

/** Click-to-reveal wrapper for FC-aggregated price/stock cells. Renders the
 *  numeric value with a subtle dotted underline + pointer cursor; clicking
 *  bubbles up the cell anchor + supplier data to PartsListTable's popover. */
function SupplierBreakdownTrigger({
  onClick,
  supplierQuotes,
  mpn,
  manufacturer,
  title,
  children,
}: {
  onClick?: (
    anchor: HTMLElement,
    info: { supplierQuotes: SupplierQuote[] | undefined; mpn: string; manufacturer: string; title?: string },
  ) => void;
  supplierQuotes: SupplierQuote[] | undefined;
  mpn: string;
  manufacturer: string;
  title?: string;
  children: React.ReactNode;
}) {
  if (!onClick) return <>{children}</>;
  return (
    <Box
      component="span"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget as HTMLElement, { supplierQuotes, mpn, manufacturer, title });
      }}
      sx={{
        cursor: 'pointer',
        textDecoration: 'underline dotted',
        textUnderlineOffset: '2px',
        textDecorationColor: 'text.disabled',
        '&:hover': { textDecorationColor: 'primary.main', color: 'primary.main' },
      }}
    >
      {children}
    </Box>
  );
}

/** A rec is "known zero stock" iff supplierQuotes has data AND sums to 0. Unknown stock stays visible. */
function hasKnownZeroStock(rec: XrefRecommendation | undefined): boolean {
  const quotes = rec?.part.supplierQuotes;
  if (!quotes || quotes.length === 0) return false;
  return quotes.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0) === 0;
}

/** Does a rec match the selected buckets? Empty / undefined means "all". */
function recMatchesBuckets(rec: XrefRecommendation, buckets?: RecommendationBucket[]): boolean {
  if (!buckets || buckets.length === 0) return true;
  return buckets.includes(deriveRecommendationBucket(rec));
}

/** A rec passes the filters when it matches the bucket set AND isn't known-zero-stock (if filtered). */
function recPassesFilters(
  rec: XrefRecommendation | undefined,
  hideZeroStock: boolean,
  buckets?: RecommendationBucket[],
): boolean {
  if (!rec) return false;
  if (hideZeroStock && hasKnownZeroStock(rec)) return false;
  return recMatchesBuckets(rec, buckets);
}

/** Promote the first filter-passing candidate from [top, ...subs] to be the displayed top.
 *  Falls back to the original top if nothing in the persisted set passes. */
function pickEffectiveTopRec(
  row: PartsListRow,
  hideZeroStock: boolean,
  buckets?: RecommendationBucket[],
): XrefRecommendation | undefined {
  const base = row.replacement;
  if (!base) return base;
  if (recPassesFilters(base, hideZeroStock, buckets)) return base;
  const passingAlt = row.replacementAlternates?.find(r => recPassesFilters(r, hideZeroStock, buckets));
  return passingAlt ?? base;
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
  columnMap,
  onCellEdit,
  onSetPartType,
  hideZeroStock,
  buckets,
  onAmbiguousClick,
  columnMapping,
  onSupplierBreakdownClick,
  onCheapestViableClick,
}: {
  column: ColumnDefinition;
  row: PartsListRow;
  onRowClick: (rowIndex: number) => void;
  onRefreshRow?: (rowIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
  onHideRow?: (rowIndex: number) => void;
  currency?: string;
  columnMap?: Map<string, ColumnDefinition>;
  recommendation?: XrefRecommendation;
  isSubRow?: boolean;
  onCellEdit?: (rowIndex: number, columnId: string, newValue: string) => void;
  onSetPartType?: (rowIndex: number, partType: PartType) => void;
  hideZeroStock?: boolean;
  buckets?: RecommendationBucket[];
  onAmbiguousClick?: (rowIndex: number) => void;
  columnMapping?: ColumnMapping | null;
  /** Click handler for FC-aggregated price/stock cells. Opens a popover
   *  showing per-distributor pricing & stock for the relevant part. */
  onSupplierBreakdownClick?: (
    anchor: HTMLElement,
    info: { supplierQuotes: SupplierQuote[] | undefined; mpn: string; manufacturer: string; title?: string },
  ) => void;
  /** Click handler for the "Lowest Repl. Price" cell. Opens a popover listing
   *  the row's top viable replacements ranked by best FC price. */
  onCheapestViableClick?: (
    anchor: HTMLElement,
    info: { recs: XrefRecommendation[]; sourceMpn: string; rowIndex: number; isFallback?: boolean },
  ) => void;
}) {
  const { t } = useTranslation();

  // Sub-rows only render replacement system columns
  if (isSubRow && column.source !== 'system') return null;
  if (isSubRow && !REPLACEMENT_COLUMN_IDS.has(column.id)) return null;

  // Hide zero-stock sub-row entirely when the filter is on
  if (isSubRow && hideZeroStock && hasKnownZeroStock(recommendation)) return null;

  // System columns have custom rendering
  if (column.source === 'system') {
    const recCount = row.allRecommendations?.length ?? row.recommendationCount ?? (row.replacement ? 1 : 0);
    // For parent rows, honor the list-level hideZeroStock filter by picking the first
    // stocked candidate from persisted recs (replacement + replacementAlternates).
    const effectiveTop = recommendation ?? pickEffectiveTopRec(row, !!hideZeroStock, buckets);
    const topRec = effectiveTop;

    switch (column.id) {
      case 'sys:row_number':
        return <>{row.rowIndex + 1}</>;

      case 'sys:status':
        return (
          <StatusChip
            status={row.status}
            candidateCount={row.candidateMatches?.length}
            onClick={row.status === 'ambiguous' && onAmbiguousClick ? () => onAmbiguousClick(row.rowIndex) : undefined}
          />
        );

      case 'sys:partType': {
        if (isSubRow) return null;
        const currentType = row.partType ?? 'electronic';
        return (
          <Select
            size="small"
            value={currentType}
            onChange={(e) => onSetPartType?.(row.rowIndex, e.target.value as PartType)}
            onClick={(e) => e.stopPropagation()}
            variant="standard"
            disableUnderline
            sx={{ fontSize: ROW_FONT_SIZE, minWidth: 80 }}
          >
            <MenuItem value="electronic">{t('partType.electronic')}</MenuItem>
            <MenuItem value="mechanical">{t('partType.mechanical')}</MenuItem>
            <MenuItem value="pcb">{t('partType.pcb')}</MenuItem>
            <MenuItem value="custom">{t('partType.custom')}</MenuItem>
            <MenuItem value="other">{t('partType.other')}</MenuItem>
          </Select>
        );
      }

      case 'sys:hits':
        if (row.status !== 'resolved') return null;
        if (recCount === 0) return <Box component="span" sx={{ color: 'text.disabled', fontSize: ROW_FONT_SIZE }}>NO</Box>;
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
            YES
          </Link>
        );

      case 'sys:logicBasedCount':
      case 'sys:mfrCertifiedCount':
      case 'sys:accurisCertifiedCount': {
        if (row.status !== 'resolved') return null;
        const key =
          column.id === 'sys:logicBasedCount' ? 'logicDrivenCount' :
          column.id === 'sys:mfrCertifiedCount' ? 'mfrCertifiedCount' :
          'accurisCertifiedCount';
        // Row has no recs at all — real zero
        if (recCount === 0) return <Box component="span" sx={{ color: 'text.disabled', fontSize: ROW_FONT_SIZE }}>0</Box>;
        // Compute from live recs when available; otherwise rely on persisted field
        let count: number | undefined;
        if (row.allRecommendations) count = computeRecommendationCounts(row.allRecommendations)[key];
        else if (row[key] !== undefined) count = row[key];
        // Legacy list: recs exist but per-bucket counts were never persisted — refresh to backfill
        if (count === undefined) {
          return <Tooltip title="Refresh this row to populate bucket counts"><Box component="span" sx={{ color: 'text.disabled', fontSize: ROW_FONT_SIZE }}>—</Box></Tooltip>;
        }
        if (count === 0) return <Box component="span" sx={{ color: 'text.disabled', fontSize: ROW_FONT_SIZE }}>0</Box>;
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
            {count}
          </Link>
        );
      }

      case 'sys:top_suggestion':
        if (topRec) {
          const hasFails = topRec.matchDetails.some(d => d.ruleResult === 'fail');
          const dotColor = hasFails ? '#FF5252' : topRec.matchPercentage >= 85 ? '#69F0AE' : '#FFD54F';
          const isUserPicked = !isSubRow && row.preferredMpn != null && row.preferredMpn === topRec.part.mpn;
          // Hide both the match-quality dot and % for certified recs — both derive
          // from the parametric matching engine, which is orthogonal to external
          // certification. Replace with a "Cert" label so the slot isn't blank.
          const bucket = deriveRecommendationBucket(topRec);
          const isCertified = bucket !== 'logic';
          const certTooltip = bucket === 'accuris' ? 'Accuris Certified' : bucket === 'manufacturer' ? 'MFR Certified' : '';
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              {!isCertified && (
                <FiberManualRecordIcon sx={{ fontSize: 8, color: dotColor, flexShrink: 0 }} />
              )}
              <OverflowTooltip variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                {topRec.part.mpn}
              </OverflowTooltip>
              {isUserPicked && (
                <Tooltip title="Preferred alternate">
                  <StarIcon sx={{ fontSize: 12, color: '#FFD54F', flexShrink: 0 }} />
                </Tooltip>
              )}
              {isCertified ? (
                <Tooltip title={certTooltip}>
                  <Box
                    component="span"
                    sx={{
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'info.main',
                      border: '1px solid',
                      borderColor: 'info.main',
                      borderRadius: '4px',
                      px: 0.5,
                      py: 0,
                      lineHeight: 1.4,
                      flexShrink: 0,
                      ml: 'auto',
                    }}
                  >
                    Cert
                  </Box>
                </Tooltip>
              ) : (
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
              )}
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

      case 'sys:top_suggestion_price': {
        if (!topRec) return null;
        // Prefer cross-distributor best price from supplierQuotes (FindChips enrichment).
        // Covers parts.io-sourced certified recs that never populate Digikey-only part.unitPrice.
        const prices = topRec.part.supplierQuotes
          ?.map(q => q.unitPrice)
          .filter((p): p is number => p != null && p > 0);
        const best = prices && prices.length > 0 ? Math.min(...prices) : topRec.part.unitPrice;
        if (best == null) return null;
        return (
          <SupplierBreakdownTrigger
            onClick={onSupplierBreakdownClick}
            supplierQuotes={topRec.part.supplierQuotes}
            mpn={topRec.part.mpn}
            manufacturer={topRec.part.manufacturer}
            title={`Replacement: ${topRec.part.mpn}`}
          >
            {formatPrice(best, currency)}
          </SupplierBreakdownTrigger>
        );
      }

      case 'sys:top_suggestion_stock': {
        if (!topRec) return null;
        const totals = topRec.part.supplierQuotes
          ?.map(q => q.quantityAvailable)
          .filter((s): s is number => s != null);
        const stock = totals && totals.length > 0
          ? totals.reduce((a, b) => a + b, 0)
          : topRec.part.quantityAvailable;
        if (stock == null) return null;
        return (
          <SupplierBreakdownTrigger
            onClick={onSupplierBreakdownClick}
            supplierQuotes={topRec.part.supplierQuotes}
            mpn={topRec.part.mpn}
            manufacturer={topRec.part.manufacturer}
            title={`Replacement: ${topRec.part.mpn}`}
          >
            {stock.toLocaleString()}
          </SupplierBreakdownTrigger>
        );
      }

      case 'sys:top_suggestion_supplier': {
        // Winning distributor = first entry in supplierQuotes (mapper pre-sorts by best unit price)
        const winner = topRec?.part.supplierQuotes?.[0]?.supplier;
        if (!winner) return null;
        const display = SUPPLIER_DISPLAY[winner.toLowerCase()]
          ?? winner.charAt(0).toUpperCase() + winner.slice(1);
        return <OverflowTooltip>{display}</OverflowTooltip>;
      }

      case 'sys:priceDelta': {
        const delta = computePriceDelta({ ...row, replacement: topRec });
        if (delta === undefined) return null;
        const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
        const color = delta > 0 ? 'success.main' : delta < 0 ? 'error.main' : 'text.primary';
        return (
          <Box component="span" sx={{ color }}>
            {sign}{formatPrice(Math.abs(delta), currency)}
          </Box>
        );
      }

      case 'sys:cheapest_viable_price': {
        if (isSubRow) return null; // row-level field — skip on alternate sub-rows
        // Prefer the validation-time computed list. If absent (column was added
        // to the view after rows were validated, or row was saved before this
        // field existed), fall back to the persisted top-5 (replacement +
        // replacementAlternates). The fallback is bounded by what's stored, so
        // it might miss cheaper recs at position 6+; the next refresh fixes it.
        const persistedRecs = row.cheapestViableRecs;
        const fallbackPool: XrefRecommendation[] = persistedRecs && persistedRecs.length > 0
          ? persistedRecs
          : [
              ...(row.replacement ? [row.replacement] : []),
              ...(row.replacementAlternates ?? []),
            ];
        const recs = persistedRecs && persistedRecs.length > 0
          ? persistedRecs
          : pickCheapestViableRecs(fallbackPool);
        const cheapest = recs[0];
        if (!cheapest) return null;
        const price = resolveBestRecPrice(cheapest);
        if (price == null) return null;
        const isFallback = !persistedRecs || persistedRecs.length === 0;
        return (
          <CheapestViableTrigger
            onClick={onCheapestViableClick}
            recs={recs}
            sourceMpn={row.resolvedPart?.mpn ?? row.rawMpn}
            rowIndex={row.rowIndex}
            isFallback={isFallback}
          >
            {formatPrice(price, currency)}
          </CheapestViableTrigger>
        );
      }

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
  const value = getCellValue(column, row, columnMap);

  // Editable spreadsheet cells — render EditableCell even when empty.
  // MPN cells opt into alwaysCommitOnEnter so hitting Enter without typing
  // still opens the row-identity picker (useful for retrying Not Found rows).
  if (column.editable && onCellEdit) {
    const isMpnCol = columnMapping?.mpnColumn != null
      && columnMapping.mpnColumn >= 0
      && column.id === `ss:${columnMapping.mpnColumn}`;
    return (
      <EditableCell
        value={String(value ?? '')}
        onCommit={(newValue) => onCellEdit(row.rowIndex, column.id, newValue)}
        alwaysCommitOnEnter={isMpnCol}
      />
    );
  }

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
    const calcFormat = column.calculatedField?.format;
    const isPrice = calcFormat === 'currency' || column.id.includes('Price') || column.id.includes('unitPrice');
    const formatted = isPrice
      ? formatPrice(value, currency)
      : calcFormat === 'percentage'
        ? `${(value * 100).toFixed(1)}%`
        : value.toLocaleString();

    // FC-aggregated source-part columns become clickable, opening the
    // per-distributor breakdown popover for the row's source data.
    if (column.id === 'commercial:bestPrice' || column.id === 'commercial:totalStock') {
      const sourceMpn = row.enrichedData?.mpn ?? row.resolvedPart?.mpn ?? row.rawMpn;
      const sourceMfr = row.enrichedData?.manufacturer ?? row.resolvedPart?.manufacturer ?? row.rawManufacturer;
      return (
        <SupplierBreakdownTrigger
          onClick={onSupplierBreakdownClick}
          supplierQuotes={row.enrichedData?.supplierQuotes}
          mpn={sourceMpn}
          manufacturer={sourceMfr}
          title={`Source: ${sourceMpn}`}
        >
          {formatted}
        </SupplierBreakdownTrigger>
      );
    }

    return <>{formatted}</>;
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
  columnMap,
  onCellEdit,
  highlightedRowIndex,
  onCancelValidation,
  onSetPartType,
  portableColumnIds,
  hideZeroStock,
  buckets,
  maxReplacements,
  onAmbiguousClick,
  columnMapping,
}: PartsListTableProps) {
  const { t } = useTranslation();
  const total = rows.length;
  const processed = rows.filter(r => r.status !== 'pending' && r.status !== 'validating').length;
  const hasSelection = selectedRows !== undefined && onToggleRow !== undefined;

  // Per-distributor breakdown popover (FC-aggregated price/stock cell clicks)
  const [supplierPopover, setSupplierPopover] = useState<{
    anchor: HTMLElement;
    supplierQuotes: SupplierQuote[] | undefined;
    mpn: string;
    manufacturer: string;
    title?: string;
  } | null>(null);
  const handleSupplierBreakdownClick = useCallback(
    (anchor: HTMLElement, info: { supplierQuotes: SupplierQuote[] | undefined; mpn: string; manufacturer: string; title?: string }) => {
      setSupplierPopover({ anchor, ...info });
    },
    [],
  );

  // Cheapest-viable popover (Lowest Repl. Price cell clicks)
  const [cheapestPopover, setCheapestPopover] = useState<{
    anchor: HTMLElement;
    recs: XrefRecommendation[];
    sourceMpn: string;
    rowIndex: number;
    isFallback?: boolean;
  } | null>(null);
  const handleCheapestViableClick = useCallback(
    (anchor: HTMLElement, info: { recs: XrefRecommendation[]; sourceMpn: string; rowIndex: number; isFallback?: boolean }) => {
      setCheapestPopover({ anchor, ...info });
    },
    [],
  );
  const allSelected = hasSelection && rows.length > 0 && rows.every(r => selectedRows!.has(r.rowIndex));
  const someSelected = hasSelection && rows.some(r => selectedRows!.has(r.rowIndex));
  const hasReplacementColumns = columns.some(col => REPLACEMENT_COLUMN_IDS.has(col.id));

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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {processed === 0
                  ? t('partsList.startingValidation', { total })
                  : t('partsList.validatingProgress', { processed, total })}
              </Typography>
              {onCancelValidation && (
                <Button
                  size="small"
                  onClick={onCancelValidation}
                  sx={{ minWidth: 0, px: 1, py: 0, fontSize: '0.7rem', textTransform: 'none', borderRadius: 1 }}
                >
                  {t('common.stop')}
                </Button>
              )}
            </Box>
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
                      // Allow long headers to wrap to 2 lines instead of overflowing
                      // into the adjacent column. Keep line-height tight so wrapped
                      // headers don't bloat the row height.
                      whiteSpace: 'normal',
                      lineHeight: 1.2,
                      verticalAlign: 'bottom',
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
                          ...(col.align === 'right' && { width: '100%', flexDirection: 'row-reverse' }),
                        }}
                      >
                        {getColumnDisplayLabel(col)}
                        {portableColumnIds?.has(col.id) && (
                          <Tooltip title="Matched from your data" arrow>
                            <AutoAwesomeIcon sx={{ fontSize: 12, ml: 0.25, color: 'text.disabled' }} />
                          </Tooltip>
                        )}
                      </TableSortLabel>
                    ) : (
                      <>
                        {getColumnDisplayLabel(col)}
                        {portableColumnIds?.has(col.id) && (
                          <Tooltip title="Matched from your data" arrow>
                            <AutoAwesomeIcon sx={{ fontSize: 12, ml: 0.25, color: 'text.disabled' }} />
                          </Tooltip>
                        )}
                      </>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const alternates = hasReplacementColumns
                ? getAlternateReplacements(row, hideZeroStock, buckets, maxReplacements)
                : [];
              const hasSubRows = alternates.length > 0;

              return (
                <Fragment key={row.rowIndex}>
                  {/* Parent row */}
                  <TableRow
                    hover
                    sx={{
                      ...(hasSubRows ? { '& td': { borderBottom: 'none' } } : undefined),
                      ...(row.rowIndex === highlightedRowIndex ? {
                        '@keyframes highlightFade': {
                          from: { backgroundColor: 'rgba(144, 202, 249, 0.15)' },
                          to: { backgroundColor: 'transparent' },
                        },
                        animation: 'highlightFade 1.5s ease-out',
                      } : undefined),
                    }}
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
                          columnMap={columnMap}
                          onCellEdit={onCellEdit}
                          onSetPartType={onSetPartType}
                          hideZeroStock={hideZeroStock}
                          buckets={buckets}
                          onAmbiguousClick={onAmbiguousClick}
                          columnMapping={columnMapping}
                          onSupplierBreakdownClick={handleSupplierBreakdownClick}
                          onCheapestViableClick={handleCheapestViableClick}
                        />
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Alternate replacement sub-rows */}
                  {alternates.map((rec, subIdx) => (
                    <TableRow
                      key={`${row.rowIndex}-sub-${subIdx}`}
                      onClick={() => onRowClick(row.rowIndex)}
                      sx={{
                        cursor: 'pointer',
                        '& td': {
                          py: '4px',
                          ...(subIdx < alternates.length - 1
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
                          {REPLACEMENT_COLUMN_IDS.has(col.id) ? (
                            <CellRenderer
                              column={col}
                              row={row}
                              recommendation={rec}
                              isSubRow
                              onRowClick={onRowClick}
                              currency={currency}
                              hideZeroStock={hideZeroStock}
                              buckets={buckets}
                              onSupplierBreakdownClick={handleSupplierBreakdownClick}
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

      <SupplierBreakdownPopover
        open={supplierPopover !== null}
        anchorEl={supplierPopover?.anchor ?? null}
        supplierQuotes={supplierPopover?.supplierQuotes}
        mpn={supplierPopover?.mpn}
        manufacturer={supplierPopover?.manufacturer}
        title={supplierPopover?.title}
        onClose={() => setSupplierPopover(null)}
      />

      <CheapestViablePopover
        open={cheapestPopover !== null}
        anchorEl={cheapestPopover?.anchor ?? null}
        recs={cheapestPopover?.recs}
        sourceMpn={cheapestPopover?.sourceMpn}
        isFallback={cheapestPopover?.isFallback}
        onRefresh={cheapestPopover && onRefreshRow ? () => {
          const rowIdx = cheapestPopover.rowIndex;
          setCheapestPopover(null);
          onRefreshRow(rowIdx);
        } : undefined}
        onClose={() => setCheapestPopover(null)}
        onSelectRec={cheapestPopover ? () => {
          // Click a card → open the row's full Recommendations modal so the
          // user can compare/confirm the cheaper candidate among the full set.
          const rowIdx = cheapestPopover.rowIndex;
          setCheapestPopover(null);
          onRowClick(rowIdx);
        } : undefined}
      />
    </Box>
  );
}
