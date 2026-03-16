'use client';
import { useMemo, useState } from 'react';
import { Box, Checkbox, CircularProgress, FormControlLabel, MenuItem, Select, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { XrefRecommendation } from '@/lib/types';
import RecommendationCard from './RecommendationCard';
import { HEADER_HEIGHT, HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE } from '@/lib/layoutConstants';

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
    const byScore = [...recommendations].sort((a, b) => b.matchPercentage - a.matchPercentage);
    if (!preferredMpn) return byScore;
    const prefIdx = byScore.findIndex(r => r.part.mpn === preferredMpn);
    if (prefIdx <= 0) return byScore; // Already first or not found
    const [preferred] = byScore.splice(prefIdx, 1);
    return [preferred, ...byScore];
  }, [recommendations, preferredMpn]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedMfr, setSelectedMfr] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [showCommercial, setShowCommercial] = useState(false);

  const manufacturers = [...new Set(sorted.map(r => r.part.manufacturer))].sort();

  // Compute available data sources for filter
  const sourceCounts = useMemo(() => {
    const counts = { digikey: 0, atlas: 0, partsio: 0 };
    for (const r of sorted) {
      if (r.dataSource === 'digikey') counts.digikey++;
      else if (r.dataSource === 'atlas') counts.atlas++;
      else if (r.dataSource === 'partsio') counts.partsio++;
    }
    return counts;
  }, [sorted]);
  const hasMultipleSources = [sourceCounts.digikey, sourceCounts.atlas, sourceCounts.partsio].filter(c => c > 0).length > 1;

  const activeCount = sorted.filter(r => r.part.status === 'Active').length;
  const hiddenCount = sorted.length - activeCount;

  const filtered = sorted
    .filter(r => !selectedMfr || r.part.manufacturer === selectedMfr)
    .filter(r => !selectedSource || r.dataSource === selectedSource);

  // Parameter coverage is family-level (same for all candidates), so compute from first recommendation
  const firstMatch = sorted[0]?.matchDetails;
  const coverage = firstMatch && firstMatch.length > 0
    ? Math.round((firstMatch.filter(d => d.sourceValue !== 'N/A' && d.replacementValue !== 'N/A').length / firstMatch.length) * 100)
    : null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box
        sx={{
          height: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
          minHeight: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
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
          {hiddenCount > 0 && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  size="small"
                  sx={{ p: 0.5 }}
                />
              }
              label={t('recommendations.activeOnly')}
              sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.72rem' } }}
            />
          )}
        </Box>
        <Typography variant="h6" sx={{ fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
          {activeOnly && hiddenCount > 0
            ? t('recommendations.headerFiltered', { activeCount, hiddenCount, matchWord: activeCount !== 1 ? t('recommendations.matches') : t('recommendations.match') })
            : t('recommendations.headerUnfiltered', { count: recommendations.length, matchWord: recommendations.length !== 1 ? t('recommendations.matches') : t('recommendations.match') })
          }
          {coverage !== null && (
            <Typography component="span" sx={{ fontSize: '0.95rem' }}>
              {' / '}{coverage}% {t('recommendations.paramCoverage', 'param coverage')}
            </Typography>
          )}
        </Typography>
      </Box>

      {/* Filter strip — matches AttributesPanel table header height/background */}
      <Box
        sx={{
          height: 45,
          minHeight: 45,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
        }}
      >
        <Select
          value={selectedMfr}
          onChange={(e) => setSelectedMfr(e.target.value)}
          displayEmpty
          variant="outlined"
          size="small"
          sx={{
            fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
            height: 22,
            minHeight: 22,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
            '& .MuiSelect-select': { py: '1px', px: '8px' },
          }}
        >
          <MenuItem value="" sx={{ fontSize: '0.78rem' }}>{t('recommendations.allManufacturers', 'All Manufacturers')}</MenuItem>
          {manufacturers.map((mfr) => (
            <MenuItem key={mfr} value={mfr} sx={{ fontSize: '0.78rem' }}>{mfr}</MenuItem>
          ))}
        </Select>
        {hasMultipleSources && (
          <Select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            displayEmpty
            variant="outlined"
            size="small"
            sx={{
              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
              height: 22,
              minHeight: 22,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
              '& .MuiSelect-select': { py: '1px', px: '8px' },
            }}
          >
            <MenuItem value="" sx={{ fontSize: '0.78rem' }}>All Sources</MenuItem>
            {sourceCounts.digikey > 0 && <MenuItem value="digikey" sx={{ fontSize: '0.78rem' }}>Digikey ({sourceCounts.digikey})</MenuItem>}
            {sourceCounts.atlas > 0 && <MenuItem value="atlas" sx={{ fontSize: '0.78rem' }}>Atlas ({sourceCounts.atlas})</MenuItem>}
            {sourceCounts.partsio > 0 && <MenuItem value="partsio" sx={{ fontSize: '0.78rem' }}>Parts.io ({sourceCounts.partsio})</MenuItem>}
          </Select>
        )}
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={
            <Checkbox
              checked={showCommercial}
              onChange={(e) => setShowCommercial(e.target.checked)}
              size="small"
              sx={{ p: 0.5 }}
            />
          }
          label={t('recommendations.showPriceStock', 'Show price & stock')}
          sx={{ mr: 0, flexShrink: 0, '& .MuiFormControlLabel-label': { fontSize: '0.72rem' } }}
        />
      </Box>

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
