'use client';
import { useMemo, useState } from 'react';
import { Badge, Box, Checkbox, Chip, CircularProgress, FormControlLabel, IconButton, MenuItem, Popover, Select, Tooltip, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AttachMoneyOutlinedIcon from '@mui/icons-material/MoneyOffOutlined';
import { useTranslation } from 'react-i18next';
import { XrefRecommendation, RecommendationCategory, deriveRecommendationCategories } from '@/lib/types';
import RecommendationCard from './RecommendationCard';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE } from '@/lib/layoutConstants';

interface RecommendationsPanelProps {
  recommendations: XrefRecommendation[];
  onSelect: (rec: XrefRecommendation) => void;
  onManufacturerClick?: (manufacturer: string) => void;
  loading?: boolean;
  preferredMpn?: string;
  onTogglePreferred?: (mpn: string) => void;
}

export default function RecommendationsPanel({ recommendations, onSelect, onManufacturerClick, loading, preferredMpn, onTogglePreferred }: RecommendationsPanelProps) {
  const { t } = useTranslation();
  const sorted = useMemo(() => {
    // Category priority: MFR Certified (0) > 3rd Party Certified (1) > Logic Driven only (2)
    const categoryPriority = (rec: XrefRecommendation): number => {
      const cats = deriveRecommendationCategories(rec);
      if (cats.includes('manufacturer_certified')) return 0;
      if (cats.includes('third_party_certified')) return 1;
      return 2;
    };
    // Within a category, pin-to-pin MFR certifications outrank functional ones.
    const mfrEqRank = (rec: XrefRecommendation): number => {
      if (rec.mfrEquivalenceType === 'pin_to_pin') return 0;
      if (rec.mfrEquivalenceType === 'functional') return 1;
      return 2;
    };
    const byCategoryThenScore = [...recommendations].sort((a, b) => {
      const catDiff = categoryPriority(a) - categoryPriority(b);
      if (catDiff !== 0) return catDiff;
      const mfrDiff = mfrEqRank(a) - mfrEqRank(b);
      if (mfrDiff !== 0) return mfrDiff;
      return b.matchPercentage - a.matchPercentage;
    });
    if (!preferredMpn) return byCategoryThenScore;
    const prefIdx = byCategoryThenScore.findIndex(r => r.part.mpn === preferredMpn);
    if (prefIdx <= 0) return byCategoryThenScore; // Already first or not found
    const [preferred] = byCategoryThenScore.splice(prefIdx, 1);
    return [preferred, ...byCategoryThenScore];
  }, [recommendations, preferredMpn]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedMfr, setSelectedMfr] = useState('');
  const [showCnOnly, setShowCnOnly] = useState(false);
  const [showCommercial, setShowCommercial] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<RecommendationCategory | 'all'>('all');
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

  const manufacturers = [...new Set(sorted.map(r => r.part.manufacturer))].sort();
  const cnManufacturers = useMemo(() => new Set(sorted.filter(r => r.dataSource === 'atlas').map(r => r.part.manufacturer)), [sorted]);
  const displayedManufacturers = showCnOnly ? manufacturers.filter(m => cnManufacturers.has(m)) : manufacturers;

  const cnCount = useMemo(() => sorted.filter(r => r.dataSource === 'atlas').length, [sorted]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!activeOnly) count++;
    if (selectedMfr) count++;
    if (showCnOnly) count++;
    if (selectedCategory !== 'all') count++;
    return count;
  }, [activeOnly, selectedMfr, showCnOnly, selectedCategory]);

  const handleClearFilters = () => {
    setActiveOnly(true);
    setSelectedMfr('');
    setShowCnOnly(false);
    setSelectedCategory('all');
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
    for (const rec of sorted) {
      const cats = deriveRecommendationCategories(rec);
      for (const c of cats) counts[c]++;
    }
    return counts;
  }, [sorted]);
  const hasMultipleCategories = Object.values(categoryCounts).filter(c => c > 0).length > 1
    || categoryCounts.manufacturer_certified > 0 || categoryCounts.third_party_certified > 0;

  const activeCount = sorted.filter(r => r.part.status === 'Active').length;
  const hiddenCount = sorted.length - activeCount;

  const filtered = sorted
    .filter(r => !selectedMfr || r.part.manufacturer === selectedMfr)
    .filter(r => !showCnOnly || r.dataSource === 'atlas')
    .filter(r => selectedCategory === 'all' || deriveRecommendationCategories(r).includes(selectedCategory));

  // Parameter coverage is family-level (same for all candidates), so compute from first recommendation
  const firstMatch = sorted[0]?.matchDetails;
  const coverage = firstMatch && firstMatch.length > 0
    ? Math.round((firstMatch.filter(d => d.sourceValue !== 'N/A' && d.replacementValue !== 'N/A').length / firstMatch.length) * 100)
    : null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box
        sx={{
          height: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          minHeight: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('recommendations.header')}
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
          {activeOnly && hiddenCount > 0
            ? t('recommendations.headerFiltered', { activeCount, hiddenCount, matchWord: activeCount !== 1 ? t('recommendations.matches') : t('recommendations.match') })
            : t('recommendations.headerUnfiltered', { count: recommendations.length, matchWord: recommendations.length !== 1 ? t('recommendations.matches') : t('recommendations.match') })
          }
        </Typography>
      </Box>

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

        {/* Inline dismissible chips for active filters */}
        {!activeOnly && (
          <Chip label="Include inactive" size="small" onDelete={() => setActiveOnly(true)}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }} />
        )}
        {selectedMfr && (
          <Chip label={selectedMfr} size="small" onDelete={() => setSelectedMfr('')}
            sx={{ height: 20, fontSize: '0.68rem', '& .MuiChip-deleteIcon': { fontSize: 14 } }} />
        )}
        {showCnOnly && (
          <Chip label="CN MFRs" size="small" onDelete={() => setShowCnOnly(false)}
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

        <Box sx={{ flex: 1 }} />

        <Tooltip title={showCommercial ? 'Hide price & stock' : 'Show price & stock'}>
          <IconButton
            size="small"
            onClick={() => setShowCommercial(prev => !prev)}
            sx={{ p: 0.5, color: showCommercial ? 'primary.main' : 'text.secondary' }}
          >
            {showCommercial ? <AttachMoneyIcon sx={{ fontSize: 18 }} /> : <AttachMoneyOutlinedIcon sx={{ fontSize: 18 }} />}
          </IconButton>
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

        {/* STATUS section */}
        <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Status
        </Typography>
        <FormControlLabel
          control={
            <Checkbox checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} size="small" sx={{ p: 0.5 }} />
          }
          label={`Active only${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}`}
          sx={{ ml: 0, mb: 1.5, '& .MuiFormControlLabel-label': { fontSize: '0.76rem' } }}
        />

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
          onChange={(e) => setSelectedMfr(e.target.value)}
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
      </Popover>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {filtered.map((rec) => {
          const isNonActive = rec.part.status !== 'Active';
          const shouldHide = activeOnly && isNonActive;
          return (
            <Box
              key={rec.part.mpn}
              sx={{
                maxHeight: shouldHide ? 0 : 300,
                opacity: shouldHide ? 0 : 1,
                overflow: 'hidden',
                mb: shouldHide ? 0 : 1.5,
                transition: 'opacity 0.3s ease, max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s, margin-bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s',
              }}
            >
              <RecommendationCard
                recommendation={rec}
                onClick={() => onSelect(rec)}
                onManufacturerClick={onManufacturerClick}
                showCommercial={showCommercial}
                isPreferred={rec.part.mpn === preferredMpn}
                onTogglePreferred={onTogglePreferred ? () => {
                  onTogglePreferred(rec.part.mpn === preferredMpn ? '' : rec.part.mpn);
                } : undefined}
              />
            </Box>
          );
        })}
      </Box>

      {/* Loading overlay while recommendations are refreshing */}
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 1.5,
            zIndex: 1,
          }}
        >
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
            {t('recommendations.updating', 'Updating recommendations...')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
