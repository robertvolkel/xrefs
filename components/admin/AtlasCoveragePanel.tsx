'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  LinearProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  Button,
  CircularProgress,
  Alert,
  GlobalStyles,
} from '@mui/material';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useTranslation } from 'react-i18next';
import { getAllLogicTables } from '@/lib/logicTables';

interface AtlasSummary {
  totalProducts: number;
  totalManufacturers: number;
  targetManufacturers: number;
  queuedManufacturers: number;
  enabledManufacturers: number;
  enabledProducts: number;
  scorableProducts: number;
  searchOnlyProducts: number;
  familiesCovered: number;
  lastUpdated: string | null;
}

interface AtlasMfr {
  manufacturer: string;
  nameEn: string | null;
  nameZh: string | null;
  slug: string | null;
  mfrId: number | null;
  productCount: number;
  scorableCount: number;
  families: string[];
  categories: string[];
  lastUpdated: string;
  coveragePct: number;
  enabled: boolean;
}

interface AtlasFamilyBreakdown {
  manufacturer: string;
  familyId: string | null;
  category: string;
  subcategory: string;
  count: number;
  scorableCount: number;
  coveragePct: number;
}

interface AtlasResponse {
  summary: AtlasSummary;
  manufacturers: AtlasMfr[];
  familyBreakdown: AtlasFamilyBreakdown[];
  familyNames: Record<string, string>;
}

const FAMILY_BLOCKS: { label: string; ids: string[] }[] = [
  { label: 'Passives', ids: ['12', '13', '52', '53', '54', '55', '58', '59', '60', '61', '64', '65', '66', '67', '68', '69', '70', '71', '72'] },
  { label: 'Discrete Semiconductors', ids: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'] },
  { label: 'ICs & Power Management', ids: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'] },
  { label: 'Frequency Control', ids: ['D1', 'D2'] },
  { label: 'Optoelectronics', ids: ['E1'] },
  { label: 'Relays', ids: ['F1', 'F2'] },
];

const allLogicTables = getAllLogicTables();
const LOCAL_FAMILY_NAMES: Record<string, string> = Object.fromEntries(
  allLogicTables.map((t) => [t.familyId, t.familyName]),
);
const TOTAL_FAMILIES = allLogicTables.length;

type SortKey = 'products' | 'coverage' | 'name';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function mfrDisplayName(m: AtlasMfr): string {
  if (m.nameEn && m.nameZh) return `${m.nameEn} · ${m.nameZh}`;
  return m.nameEn || m.manufacturer;
}

export default function AtlasCoveragePanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<AtlasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('products');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/atlas', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AtlasResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Aggregate product count per family from familyBreakdown
  const familyCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (!data) return counts;
    for (const fb of data.familyBreakdown) {
      if (!fb.familyId) continue;
      counts[fb.familyId] = (counts[fb.familyId] ?? 0) + fb.count;
    }
    return counts;
  }, [data]);

  const maxFamilyCount = useMemo(() => {
    const values = Object.values(familyCounts);
    return values.length ? Math.max(...values) : 0;
  }, [familyCounts]);

  const familiesWithCoverage = useMemo(
    () => Object.keys(familyCounts).filter((f) => familyCounts[f] > 0).length,
    [familyCounts],
  );

  const sortedMfrs = useMemo(() => {
    if (!data) return [];
    const arr = [...data.manufacturers];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'products') cmp = a.productCount - b.productCount;
      else if (sortKey === 'coverage') cmp = a.coveragePct - b.coveragePct;
      else if (sortKey === 'name') cmp = mfrDisplayName(a).localeCompare(mfrDisplayName(b));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const maxMfrProducts = useMemo(
    () => (sortedMfrs.length ? Math.max(...sortedMfrs.map((m) => m.productCount)) : 0),
    [sortedMfrs],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'No data'}</Alert>
      </Box>
    );
  }

  const s = data.summary;
  const livePct = s.targetManufacturers > 0 ? Math.round((s.enabledManufacturers / s.targetManufacturers) * 100) : 0;
  const scorablePct = s.totalProducts > 0 ? Math.round((s.scorableProducts / s.totalProducts) * 100) : 0;
  const generatedOn = formatDate(new Date().toISOString());

  return (
    <>
      <GlobalStyles
        styles={{
          '@media print': {
            '@page': { margin: '0.5in' },
            'html, body': {
              background: '#fff !important',
              color: '#000 !important',
            },
            '#admin-page-header, #admin-nav, [data-no-print="true"]': {
              display: 'none !important',
            },
            '.atlas-coverage-print-root': {
              overflow: 'visible !important',
              padding: '0 !important',
              background: '#fff !important',
              color: '#000 !important',
            },
            '.atlas-coverage-print-root *': {
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            },
            '.atlas-coverage-section': {
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
            },
            '.atlas-coverage-mfr-page': {
              pageBreakBefore: 'always',
              breakBefore: 'page',
            },
          },
        }}
      />

      <Box
        className="atlas-coverage-print-root"
        sx={{
          px: 3,
          pt: '16px',
          pb: 6,
          maxWidth: 960,
          mx: 'auto',
        }}
      >
        {/* Header strip */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 3,
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
              {t('admin.atlasCoverageReport.title')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('admin.atlasCoverageReport.subtitle', { date: generatedOn })}
            </Typography>
          </Box>
          <Button
            data-no-print="true"
            variant="outlined"
            size="small"
            startIcon={<PrintOutlinedIcon fontSize="small" />}
            onClick={() => window.print()}
            sx={{ flexShrink: 0 }}
          >
            {t('admin.atlasCoverageReport.exportPdf')}
          </Button>
        </Box>

        {/* Hero: Target vs. Live */}
        <Box
          className="atlas-coverage-section"
          sx={{
            p: 3,
            mb: 3,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            {t('admin.atlasCoverageReport.heroEyebrow')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
            <Typography variant="h3" fontWeight={700} sx={{ lineHeight: 1 }}>
              {s.targetManufacturers.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('admin.atlasCoverageReport.targetLabel')}
            </Typography>
            <Typography variant="body2" sx={{ mx: 1, color: 'text.disabled' }}>·</Typography>
            <Typography variant="h4" fontWeight={600} sx={{ lineHeight: 1 }}>
              {s.enabledManufacturers.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('admin.atlasCoverageReport.liveLabel')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 720, lineHeight: 1.6 }}>
            {t('admin.atlasCoverageReport.heroBody')}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t('admin.atlasCoverageReport.ingestedLabel')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {livePct}% ({s.enabledManufacturers}/{s.targetManufacturers})
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={livePct}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': { borderRadius: 4 },
              }}
            />
          </Box>
          {s.queuedManufacturers > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              {t('admin.atlasCoverageReport.queuedNote', { count: s.queuedManufacturers })}
            </Typography>
          )}
        </Box>

        {/* KPI tiles */}
        <Box
          className="atlas-coverage-section"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 2,
            mb: 4,
          }}
        >
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiLiveMfrs')}
            value={s.enabledManufacturers.toLocaleString()}
            subtitle={t('admin.atlasCoverageReport.kpiLiveMfrsSub', {
              disabled: s.totalManufacturers - s.enabledManufacturers,
            })}
          />
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiTotalProducts')}
            value={s.enabledProducts.toLocaleString()}
            subtitle={t('admin.atlasCoverageReport.kpiTotalProductsSub')}
          />
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiScorable')}
            value={s.scorableProducts.toLocaleString()}
            subtitle={`${scorablePct}% ${t('admin.atlasCoverageReport.kpiScorableSub')}`}
          />
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiCategories')}
            value={`${familiesWithCoverage} / ${TOTAL_FAMILIES}`}
            subtitle={t('admin.atlasCoverageReport.kpiCategoriesSub')}
          />
        </Box>

        {/* Category coverage matrix */}
        <Box className="atlas-coverage-section" sx={{ mb: 4 }}>
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            {t('admin.atlasCoverageReport.categoryCoverageTitle')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            {t('admin.atlasCoverageReport.categoryCoverageSubtitle', {
              covered: familiesWithCoverage,
              total: TOTAL_FAMILIES,
            })}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {FAMILY_BLOCKS.map((block) => (
              <Box key={block.label}>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}
                >
                  {block.label}
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                    gap: 1,
                  }}
                >
                  {block.ids.map((id) => {
                    const count = familyCounts[id] ?? 0;
                    const name = data.familyNames[id] || LOCAL_FAMILY_NAMES[id] || id;
                    const covered = count > 0;
                    const barPct = covered && maxFamilyCount > 0 ? (count / maxFamilyCount) * 100 : 0;
                    return (
                      <Box
                        key={id}
                        sx={{
                          p: 1.25,
                          border: 1,
                          borderColor: covered ? 'divider' : 'action.disabledBackground',
                          borderRadius: 1,
                          bgcolor: covered ? 'background.paper' : 'action.hover',
                          opacity: covered ? 1 : 0.55,
                          minHeight: 68,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: covered ? 600 : 500,
                            fontSize: '0.72rem',
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            color: covered ? 'text.primary' : 'text.disabled',
                          }}
                        >
                          {name}
                        </Typography>
                        <Box sx={{ mt: 0.75 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.7rem',
                              color: covered ? 'text.secondary' : 'text.disabled',
                              fontWeight: 500,
                            }}
                          >
                            {covered
                              ? t('admin.atlasCoverageReport.productCount', { count })
                              : t('admin.atlasCoverageReport.notYetRepresented')}
                          </Typography>
                          {covered && (
                            <Box
                              sx={{
                                mt: 0.5,
                                height: 3,
                                bgcolor: 'action.hover',
                                borderRadius: 1,
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${barPct}%`,
                                  height: '100%',
                                  bgcolor: 'primary.main',
                                }}
                              />
                            </Box>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Manufacturer breakdown table */}
        <Box className="atlas-coverage-mfr-page" sx={{ mb: 4 }}>
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            {t('admin.atlasCoverageReport.mfrsTitle')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            {t('admin.atlasCoverageReport.mfrsSubtitle', {
              live: s.enabledManufacturers,
              disabled: s.totalManufacturers - s.enabledManufacturers,
            })}
          </Typography>

          <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  <TableSortLabel
                    active={sortKey === 'name'}
                    direction={sortKey === 'name' ? sortDir : 'asc'}
                    onClick={() => toggleSort('name')}
                  >
                    {t('admin.atlasCoverageReport.colMfr')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  {t('admin.atlasCoverageReport.colStatus')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  <TableSortLabel
                    active={sortKey === 'products'}
                    direction={sortKey === 'products' ? sortDir : 'desc'}
                    onClick={() => toggleSort('products')}
                  >
                    {t('admin.atlasCoverageReport.colProducts')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  <TableSortLabel
                    active={sortKey === 'coverage'}
                    direction={sortKey === 'coverage' ? sortDir : 'desc'}
                    onClick={() => toggleSort('coverage')}
                  >
                    {t('admin.atlasCoverageReport.colCoverage')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  {t('admin.atlasCoverageReport.colCategories')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedMfrs.map((m) => (
                <MfrRow
                  key={m.manufacturer}
                  mfr={m}
                  maxProducts={maxMfrProducts}
                  disabledLabel={t('admin.atlasCoverageReport.statusDisabled')}
                  liveLabel={t('admin.atlasCoverageReport.statusLive')}
                  overflowLabel={(n: number) => t('admin.atlasCoverageReport.moreCategories', { count: n })}
                />
              ))}
            </TableBody>
          </Table>
        </Box>

        {/* Footer */}
        <Box
          sx={{
            mt: 6,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            color: 'text.secondary',
            fontSize: '0.7rem',
          }}
        >
          <span>{t('admin.atlasCoverageReport.footer', { date: generatedOn })}</span>
          <span>{t('admin.atlasCoverageReport.footerRefresh')}</span>
        </Box>
      </Box>
    </>
  );
}

function KpiTile({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontSize: '0.7rem' }}>
        {subtitle}
      </Typography>
    </Box>
  );
}

function MfrRow({
  mfr,
  maxProducts,
  disabledLabel,
  liveLabel,
  overflowLabel,
}: {
  mfr: AtlasMfr;
  maxProducts: number;
  disabledLabel: string;
  liveLabel: string;
  overflowLabel: (n: number) => string;
}) {
  const isDisabled = !mfr.enabled;
  const barPct = maxProducts > 0 ? (mfr.productCount / maxProducts) * 100 : 0;
  const visibleCategories = mfr.categories.slice(0, 4);
  const overflowCount = Math.max(0, mfr.categories.length - visibleCategories.length);
  const textColor = isDisabled ? 'text.disabled' : 'text.primary';

  return (
    <TableRow sx={{ '& td': { py: 1.25, fontSize: '0.74rem' } }}>
      <TableCell sx={{ color: textColor }}>
        <Box>
          <Typography
            variant="body2"
            sx={{ fontSize: '0.78rem', fontWeight: 500, color: textColor, lineHeight: 1.3 }}
          >
            {mfr.nameEn || mfr.manufacturer}
          </Typography>
          {mfr.nameZh && (
            <Typography variant="caption" sx={{ color: isDisabled ? 'text.disabled' : 'text.secondary', fontSize: '0.7rem' }}>
              {mfr.nameZh}
            </Typography>
          )}
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          label={isDisabled ? disabledLabel : liveLabel}
          size="small"
          variant={isDisabled ? 'outlined' : 'filled'}
          sx={{
            fontSize: '0.65rem',
            height: 20,
            bgcolor: isDisabled ? 'transparent' : 'action.selected',
            color: isDisabled ? 'text.disabled' : 'text.primary',
            borderColor: 'divider',
          }}
        />
      </TableCell>
      <TableCell align="right" sx={{ color: textColor }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600, color: textColor, lineHeight: 1 }}>
            {mfr.productCount.toLocaleString()}
          </Typography>
          <Box sx={{ width: 60, height: 3, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
            <Box
              sx={{
                width: `${barPct}%`,
                height: '100%',
                bgcolor: isDisabled ? 'text.disabled' : 'primary.main',
              }}
            />
          </Box>
        </Box>
      </TableCell>
      <TableCell align="right" sx={{ color: textColor, fontSize: '0.74rem' }}>
        {mfr.coveragePct}%
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 320 }}>
          {visibleCategories.map((c) => (
            <Chip
              key={c}
              label={c}
              size="small"
              variant="outlined"
              sx={{
                fontSize: '0.65rem',
                height: 20,
                color: textColor,
                borderColor: 'divider',
              }}
            />
          ))}
          {overflowCount > 0 && (
            <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: '0.68rem', color: 'text.secondary' }}>
              {overflowLabel(overflowCount)}
            </Typography>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
}
