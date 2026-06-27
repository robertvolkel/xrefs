'use client';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, IconButton, LinearProgress, MenuItem, Popover, Select, Skeleton, Tooltip, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { useTranslation } from 'react-i18next';
import { XrefRecommendation, RecommendationCategory, PartStatus, deriveRecommendationCategories } from '@/lib/types';
import { isAecQualified } from '@/lib/services/recommendationFilter';
import RecommendationCard from './RecommendationCard';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE } from '@/lib/layoutConstants';
import { sortRecommendationsForDisplay } from '@/lib/services/recommendationSort';
import { inferContextActive } from './DomainChip';

// Re-export for backward compatibility with existing consumers (e.g. useAppState)
export { sortRecommendationsForDisplay };

// Lifecycle-status filter (Decision #232 follow-up). Display order + labels for the
// per-status checkboxes. The panel shows ALL statuses by default (empty hidden set);
// this is a purely additive, user-initiated narrow — never a default hide.
const STATUS_ORDER: PartStatus[] = ['Active', 'Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'];
const STATUS_LABELS: Record<PartStatus, string> = {
  Active: 'Active',
  Obsolete: 'Obsolete',
  Discontinued: 'Discontinued',
  NRND: 'NRND',
  LastTimeBuy: 'Last Time Buy',
};

interface RecommendationsPanelProps {
  recommendations: XrefRecommendation[];
  onSelect: (rec: XrefRecommendation) => void;
  onManufacturerClick?: (manufacturer: string) => void;
  loading?: boolean;
  preferredMpn?: string;
  onTogglePreferred?: (mpn: string) => void;
  isEnrichingFC?: boolean;
  /** List-level setting from Replacement Preferences — hide recs with known zero stock */
  hideZeroStock?: boolean;
  /** Use a compact header height. True when paired with a panel that has no header
   *  (e.g. the modal chat panel) so we don't render a 116px block of dead space. */
  compactHeader?: boolean;
  /** Controlled cross-reference-source filter (shared with the source-panel chips).
   *  When provided, the popover reads/writes this instead of local state so both
   *  surfaces stay in sync. Omit (modal chat panel) to keep purely local. */
  categoryFilter?: RecommendationCategory | 'all';
  onCategoryFilterChange?: (cat: RecommendationCategory | 'all') => void;
  /** Controlled manufacturer filter (shared with the source-panel MFR chips). */
  mfrFilter?: string;
  onMfrFilterChange?: (mfr: string) => void;
  /** The part's FULL replacement inventory, BEFORE any agent-applied chat filter.
   *  When provided (single-part view), the filter UI — manufacturer dropdown,
   *  CN/AEC/category/status counts — is built from this so a chat filter that
   *  narrowed the visible cards can't strand the dropdown on a single MFR. Cards
   *  still render the (possibly narrowed) `recommendations`. Omit (modal chat /
   *  mobile) to derive the filter UI from `recommendations` as before. */
  fullRecommendations?: XrefRecommendation[];
  /** Human-readable label of the active agent/chat filter (e.g. "onsemi"), if any.
   *  Renders a removable pill so the narrowing is visible and clearable AT the
   *  panel — independent of whatever the chat LLM believes is applied. */
  chatFilterLabel?: string | null;
  /** Clears the active agent/chat filter (restores the full inventory). Invoked by
   *  the active-filter pill's ✕ and before switching manufacturers in the dropdown
   *  (the dropdown and a chat manufacturer-filter are the same axis — they must
   *  not compound, or picking a different MFR yields zero cards). */
  onClearChatFilter?: () => void;
  /** When true (automotive-AEC context was selected), auto-check the
   *  "AEC-qualified only" filter once. The user can still uncheck it. */
  autoAecOnly?: boolean;
  /** Controlled price/stock visibility. When provided (single-part view), the
   *  "Price & stock" toggle reads this and calls `onToggleCommercial` — which
   *  also launches the deferred FindChips fetch on first enable. We don't
   *  auto-call FindChips on load, so price/stock is hidden until the user opts
   *  in. Omit (modal chat / parts-list modal, where data is already fetched) to
   *  fall back to local display-only state. */
  commercialEnabled?: boolean;
  onToggleCommercial?: () => void;
}

export default function RecommendationsPanel({ recommendations, onSelect, onManufacturerClick, loading, preferredMpn, onTogglePreferred, isEnrichingFC, hideZeroStock = false, compactHeader = false, categoryFilter, onCategoryFilterChange, mfrFilter, onMfrFilterChange, fullRecommendations, chatFilterLabel, onClearChatFilter, autoAecOnly = false, commercialEnabled, onToggleCommercial }: RecommendationsPanelProps) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => sortRecommendationsForDisplay(recommendations, preferredMpn),
    [recommendations, preferredMpn],
  );
  const [showCnOnly, setShowCnOnly] = useState(false);
  // Price/stock display is controlled-with-fallback. In the single-part view the
  // parent owns it (`commercialEnabled`/`onToggleCommercial`). FindChips data is
  // always loaded in the background when recs land, so this toggle is display-only
  // — it shows/hides the price chips on the cards (never launches the fetch).
  // Surfaces with no parent wiring (modal chat / parts-list modal) fall back to
  // local state — there the data is already fetched, so it defaults to shown.
  const commercialControlled = onToggleCommercial !== undefined;
  const [localShowCommercial, setLocalShowCommercial] = useState(true);
  const showCommercial = commercialControlled ? !!commercialEnabled : localShowCommercial;
  const toggleCommercial = commercialControlled ? onToggleCommercial : () => setLocalShowCommercial((prev) => !prev);
  // Manufacturer + cross-ref-source filters are controlled-with-fallback: when the
  // parent passes them (single-part view, shared with the source-panel chips) we
  // read/write the parent's state; otherwise we fall back to local state (modal chat).
  const [localMfr, setLocalMfr] = useState('');
  const [localCategory, setLocalCategory] = useState<RecommendationCategory | 'all'>('all');
  const selectedMfr = mfrFilter ?? localMfr;
  const setSelectedMfr = onMfrFilterChange ?? setLocalMfr;
  const selectedCategory = categoryFilter ?? localCategory;
  const setSelectedCategory = onCategoryFilterChange ?? setLocalCategory;
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  // The panel intentionally hides NOTHING by default (Decision #232): every
  // candidate shows regardless of lifecycle status (Active, Obsolete, Transferred…)
  // or match quality. Active parts are floated to the top of each certification
  // bucket by sortRecommendationsForDisplay instead. The only filters are the
  // EXPLICIT, user-initiated ones below (manufacturer / CN-only / category / stock /
  // AEC-qualified).
  const [aecOnly, setAecOnly] = useState(false);
  // Auto-apply the AEC filter to mirror automotive-AEC context (Decision #221 —
  // "Both" option). The effect fires only when `autoAecOnly` actually changes,
  // so a fresh automotive selection checks the box, but the user can uncheck it
  // afterwards and it stays unchecked (the effect won't re-run until the
  // automotive intent toggles again).
  useEffect(() => { setAecOnly(autoAecOnly); }, [autoAecOnly]);
  // Lifecycle-status filter: set of statuses the user has UNCHECKED (hidden). Empty =
  // all shown (Decision #232 default). A status is only listed if some rec carries it.
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<PartStatus>>(new Set());

  // The filter UI (MFR dropdown, CN/AEC/category/status counts) is derived from
  // the part's FULL inventory when supplied, so an agent-applied chat filter that
  // narrowed the visible cards can't strand the dropdown on the single surviving
  // MFR. Falls back to the rendered set (modal chat / mobile have no chat filter).
  const filterSource = useMemo(
    () => sortRecommendationsForDisplay(fullRecommendations ?? recommendations, preferredMpn),
    [fullRecommendations, recommendations, preferredMpn],
  );

  const manufacturers = useMemo(() => [...new Set(filterSource.map(r => r.part.manufacturer))].sort(), [filterSource]);
  const cnManufacturers = useMemo(() => new Set(filterSource.filter(r => r.dataSource === 'atlas').map(r => r.part.manufacturer)), [filterSource]);
  const displayedManufacturers = showCnOnly ? manufacturers.filter(m => cnManufacturers.has(m)) : manufacturers;

  const cnCount = useMemo(() => filterSource.filter(r => r.dataSource === 'atlas').length, [filterSource]);
  const aecCount = useMemo(() => filterSource.filter(isAecQualified).length, [filterSource]);

  // Per-status counts over the full inventory — used to label the checkboxes and
  // decide which statuses to surface at all.
  const statusCounts = useMemo(() => {
    const m = new Map<PartStatus, number>();
    for (const r of filterSource) m.set(r.part.status, (m.get(r.part.status) ?? 0) + 1);
    return m;
  }, [filterSource]);
  const presentStatuses = useMemo(() => STATUS_ORDER.filter(s => statusCounts.has(s)), [statusCounts]);
  // Hidden statuses that are actually present (guards against a stale hidden entry for a
  // status the current part has no candidates in — keeps the chip/filter count honest).
  const activeHiddenStatuses = useMemo(
    () => presentStatuses.filter(s => hiddenStatuses.has(s)),
    [presentStatuses, hiddenStatuses],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedMfr) count++;
    if (showCnOnly) count++;
    if (selectedCategory !== 'all') count++;
    if (aecOnly) count++;
    if (activeHiddenStatuses.length > 0) count++;
    return count;
  }, [selectedMfr, showCnOnly, selectedCategory, aecOnly, activeHiddenStatuses]);

  const handleClearFilters = () => {
    setSelectedMfr('');
    setShowCnOnly(false);
    setSelectedCategory('all');
    setAecOnly(false);
    setHiddenStatuses(new Set());
    onClearChatFilter?.();
  };

  const handleToggleStatus = (status: PartStatus, checked: boolean) => {
    setHiddenStatuses(prev => {
      const next = new Set(prev);
      if (checked) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleToggleCnOnly = (checked: boolean) => {
    setShowCnOnly(checked);
    if (checked && selectedMfr && !cnManufacturers.has(selectedMfr)) {
      setSelectedMfr('');
    }
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { logic_driven: 0, manufacturer_certified: 0, third_party_certified: 0 };
    for (const rec of filterSource) {
      const cats = deriveRecommendationCategories(rec);
      for (const c of cats) counts[c]++;
    }
    return counts;
  }, [filterSource]);
  const hasMultipleCategories = Object.values(categoryCounts).filter(c => c > 0).length > 1
    || categoryCounts.manufacturer_certified > 0 || categoryCounts.third_party_certified > 0;

  // `filtered` = candidate pool after the EXPLICIT user filters (manufacturer /
  // category / CN-only / zero-stock). Nothing is hidden by lifecycle status or
  // match quality (Decision #227) — every card here renders. The header count is
  // just this length.
  const filtered = sorted
    .filter(r => !selectedMfr || r.part.manufacturer === selectedMfr)
    .filter(r => !showCnOnly || r.dataSource === 'atlas')
    .filter(r => {
      if (!hideZeroStock) return true;
      // Hide only when quote data exists AND total stock is 0 — avoids hiding recs
      // whose stock is simply unknown (empty supplierQuotes → undefined, keep shown)
      const quotes = r.part.supplierQuotes;
      if (!quotes || quotes.length === 0) return true;
      const total = quotes.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0);
      return total > 0;
    })
    .filter(r => selectedCategory === 'all' || deriveRecommendationCategories(r).includes(selectedCategory))
    .filter(r => !aecOnly || isAecQualified(r))
    .filter(r => !hiddenStatuses.has(r.part.status));

  // Parameter coverage is family-level (same for all candidates), so compute from first recommendation
  const firstMatch = sorted[0]?.matchDetails;
  const coverage = firstMatch && firstMatch.length > 0
    ? Math.round((firstMatch.filter(d => d.sourceValue !== 'N/A' && d.replacementValue !== 'N/A').length / firstMatch.length) * 100)
    : null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box
        sx={{
          height: compactHeader
            ? 52
            : { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          minHeight: compactHeader
            ? 52
            : { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          px: 2,
          py: compactHeader ? 0.75 : 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('recommendations.header')}
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
          {loading
            ? t('recommendations.loading', 'Loading recommendations…')
            : t('recommendations.headerUnfiltered', { count: filtered.length, matchWord: filtered.length !== 1 ? t('recommendations.matches') : t('recommendations.match') })
          }
        </Typography>
      </Box>

      {/* Refresh progress bar — signals that recommendations are being reprocessed (e.g. after context answers). */}
      {loading && <LinearProgress sx={{ height: 2 }} />}

      {/* Filter row — single compact row with filter icon + active filter chips + price toggle */}
      <Box
        sx={{
          height: 45,
          minHeight: 45,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
        }}
      >
        <Tooltip title="Filters">
          <IconButton
            size="small"
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            sx={{ p: 0.5 }}
          >
            <Badge
              badgeContent={activeFilterCount}
              color="primary"
              invisible={activeFilterCount === 0}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 16, minWidth: 16 } }}
            >
              <FilterListIcon sx={{ fontSize: 18 }} />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* Active agent/chat filter — rendered as a removable pill so the
            narrowing is visible and clearable AT the panel, even when the chat
            LLM has lost track of it. Filled primary to distinguish it from the
            panel-local outlined chips below. */}
        {chatFilterLabel && onClearChatFilter && (
          <Chip
            label={chatFilterLabel}
            size="small"
            color="primary"
            onDelete={onClearChatFilter}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }}
          />
        )}

        {/* Inline dismissible chips for active (user-initiated) filters */}
        {selectedMfr && (
          <Chip label={selectedMfr} size="small" onDelete={() => setSelectedMfr('')}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }} />
        )}
        {showCnOnly && (
          <Chip label="CN MFRs" size="small" onDelete={() => setShowCnOnly(false)}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }} />
        )}
        {aecOnly && (
          <Chip label="AEC only" size="small" onDelete={() => setAecOnly(false)}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }} />
        )}
        {selectedCategory !== 'all' && (
          <Chip
            label={selectedCategory === 'logic_driven' ? 'Logic Driven' : selectedCategory === 'manufacturer_certified' ? 'MFR Certified' : 'Accuris Certified'}
            size="small"
            onDelete={() => setSelectedCategory('all')}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }}
          />
        )}
        {activeHiddenStatuses.length > 0 && (
          <Chip
            label={`Hiding: ${activeHiddenStatuses.map(s => STATUS_LABELS[s]).join(', ')}`}
            size="small"
            onDelete={() => setHiddenStatuses(new Set())}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }}
          />
        )}

        <Box sx={{ flex: 1 }} />

        {/* Price & stock toggle. Distributor pricing/stock from FindChips is
            always loaded in the background when recs land, so this button only
            shows/hides the price chips on the cards — it doesn't trigger a fetch.
            A labeled, outlined-vs-filled button is far more discoverable than a
            bare $ icon while staying compact in the 45px filter row. */}
        <Tooltip
          title={showCommercial
            ? 'Hide distributor price & stock on the cards'
            : 'Show distributor price & stock on the cards'}
        >
          <Button
            size="small"
            variant={showCommercial ? 'contained' : 'outlined'}
            color="primary"
            onClick={toggleCommercial}
            startIcon={
              showCommercial && isEnrichingFC
                ? <CircularProgress size={12} color="inherit" />
                : <AttachMoneyIcon sx={{ fontSize: 15 }} />
            }
            sx={{
              height: 26,
              px: 1,
              minWidth: 0,
              flexShrink: 0,
              textTransform: 'none',
              fontSize: '0.7rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              '& .MuiButton-startIcon': { mr: 0.5 },
            }}
          >
            {showCommercial && isEnrichingFC ? 'Loading Price & Stock' : 'Price & stock'}
          </Button>
        </Tooltip>
      </Box>

      {/* Filter popover */}
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 280, p: 2 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Filters</Typography>
          {activeFilterCount > 0 && (
            <Typography
              component="span"
              onClick={handleClearFilters}
              sx={{ fontSize: '0.72rem', color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
              Clear all
            </Typography>
          )}
        </Box>

        {/* QUALIFICATION section — explicit "automotive matters" opt-in filter (Decision
            #238). The panel itself hides nothing by default (Decision #232); this is a
            user-initiated narrow. Shown when some recs qualify, OR when the filter is
            already active (so it stays uncheckable after switching to a part with zero AEC
            candidates — otherwise the panel goes silently empty). */}
        {(aecCount > 0 || aecOnly) && (
          <>
            <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Qualification
            </Typography>
            <FormControlLabel
              control={
                <Checkbox checked={aecOnly} onChange={(e) => setAecOnly(e.target.checked)} size="small" sx={{ p: 0.5 }} />
              }
              label={`AEC-qualified only (${aecCount})`}
              sx={{ ml: 0, mb: 1.5, '& .MuiFormControlLabel-label': { fontSize: '0.76rem' } }}
            />
          </>
        )}

        {/* MANUFACTURER section */}
        <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Manufacturer
        </Typography>
        {cnCount > 0 && (
          <FormControlLabel
            control={
              <Checkbox checked={showCnOnly} onChange={(e) => handleToggleCnOnly(e.target.checked)} size="small" sx={{ p: 0.5 }} />
            }
            label={`CN manufacturers only (${cnCount})`}
            sx={{ ml: 0, mb: 0.5, '& .MuiFormControlLabel-label': { fontSize: '0.76rem' } }}
          />
        )}
        <Select
          value={selectedMfr}
          onChange={(e) => {
            // Switching manufacturers must clear any active chat filter first —
            // the dropdown is built from the FULL inventory, so without clearing,
            // picking an MFR that the chat filter excluded would intersect to zero
            // cards. (No-op when no chat filter is active.)
            onClearChatFilter?.();
            setSelectedMfr(e.target.value);
          }}
          displayEmpty
          variant="outlined"
          size="small"
          fullWidth
          sx={{
            fontSize: ROW_FONT_SIZE,
            height: 28,
            mb: 1.5,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
            '& .MuiSelect-select': { py: '2px', px: '8px' },
          }}
        >
          <MenuItem value="" sx={{ fontSize: '0.78rem' }}>{t('recommendations.allManufacturers', 'All Manufacturers')}</MenuItem>
          {displayedManufacturers.map((mfr) => (
            <MenuItem key={mfr} value={mfr} sx={{ fontSize: '0.78rem' }}>{mfr}</MenuItem>
          ))}
        </Select>

        {/* CROSS REFERENCE SOURCE section */}
        {hasMultipleCategories && (
          <>
            <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Cross Reference Source
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {([
                { key: 'all' as const, label: `All (${sorted.length})`, color: undefined },
                { key: 'logic_driven' as const, label: `Logic Driven (${categoryCounts.logic_driven})`, color: '#42A5F5' },
                ...(categoryCounts.manufacturer_certified > 0 ? [{ key: 'manufacturer_certified' as const, label: `MFR Certified (${categoryCounts.manufacturer_certified})`, color: '#66BB6A' }] : []),
                ...(categoryCounts.third_party_certified > 0 ? [{ key: 'third_party_certified' as const, label: `Accuris Certified (${categoryCounts.third_party_certified})`, color: '#FFA726' }] : []),
              ] as const).map(({ key, label, color }) => (
                <Chip
                  key={key}
                  label={label}
                  size="small"
                  variant={selectedCategory === key ? 'filled' : 'outlined'}
                  onClick={() => setSelectedCategory(key)}
                  sx={{
                    height: 22,
                    fontSize: '0.68rem',
                    cursor: 'pointer',
                    ...(selectedCategory === key
                      ? { bgcolor: color || 'action.selected', color: color ? '#fff' : undefined }
                      : { borderColor: color || 'divider', color: color || 'text.secondary' }),
                  }}
                />
              ))}
            </Box>
          </>
        )}

        {/* LIFECYCLE STATUS section (Decision #232 follow-up). All statuses are checked by
            default — the panel hides nothing until the user explicitly unchecks one. Counts
            are over the full set, so the external chip/chat counts stay reconciled. Rendered
            only when there's more than one status to choose between (or a hide is already
            active, so the user can always re-show). */}
        {(presentStatuses.length > 1 || activeHiddenStatuses.length > 0) && (
          <>
            <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mt: 1.5, mb: 0.5 }}>
              Lifecycle Status
            </Typography>
            {presentStatuses.map((status) => (
              <FormControlLabel
                key={status}
                control={
                  <Checkbox
                    checked={!hiddenStatuses.has(status)}
                    onChange={(e) => handleToggleStatus(status, e.target.checked)}
                    size="small"
                    sx={{ p: 0.5 }}
                  />
                }
                label={`${STATUS_LABELS[status]} (${statusCounts.get(status) ?? 0})`}
                sx={{ ml: 0, mb: 0.25, display: 'flex', '& .MuiFormControlLabel-label': { fontSize: '0.76rem' } }}
              />
            ))}
          </>
        )}
      </Popover>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {/* Stale-while-revalidate: dim existing cards while a refresh is in flight.
            Skeletons render below this wrapper at full opacity. */}
        <Box
          sx={{
            transition: 'opacity 0.2s ease',
            ...(loading && filtered.length > 0
              ? { opacity: 0.5, pointerEvents: 'none' }
              : {}),
          }}
        >
        {filtered.map((rec) => (
          <Box key={rec.part.mpn} sx={{ mb: 1.5 }}>
            <RecommendationCard
              recommendation={rec}
              onClick={() => onSelect(rec)}
              onManufacturerClick={onManufacturerClick}
              showCommercial={showCommercial}
              isPreferred={rec.part.mpn === preferredMpn}
              onTogglePreferred={onTogglePreferred ? () => {
                onTogglePreferred(rec.part.mpn === preferredMpn ? '' : rec.part.mpn);
              } : undefined}
              isEnrichingFC={isEnrichingFC}
              contextActive={inferContextActive(recommendations)}
            />
          </Box>
        ))}
        </Box>

        {/* Skeleton cards while recommendations are loading. Rendered inline
            (not as a scrim overlay) so the user sees exactly where cards will
            land. Count backs off if some real cards already exist. */}
        {loading && (
          <>
            {Array.from({ length: Math.max(0, 3 - filtered.length) }).map((_, i) => (
              <Box
                key={`skeleton-${i}`}
                sx={{
                  mb: 1.5,
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Skeleton variant="text" width={140} height={20} />
                  <Skeleton variant="rounded" width={52} height={18} />
                  <Skeleton variant="rounded" width={110} height={18} />
                </Box>
                <Skeleton variant="text" width="35%" height={16} sx={{ mb: 0.5 }} />
                <Skeleton variant="text" width="80%" height={14} />
                <Skeleton variant="text" width="55%" height={14} />
              </Box>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
