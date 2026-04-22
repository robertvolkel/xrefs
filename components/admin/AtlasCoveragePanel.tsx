'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  Button,
  Skeleton,
  Alert,
  GlobalStyles,
} from '@mui/material';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useTranslation } from 'react-i18next';
import type { ComponentCategory } from '@/lib/types';

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

const CATEGORY_BLOCKS: { label: string; categories: ComponentCategory[] }[] = [
  { label: 'Passives', categories: ['Capacitors', 'Resistors', 'Inductors', 'Filters'] },
  { label: 'Discretes', categories: ['Diodes', 'Transistors', 'Thyristors'] },
  {
    label: 'Power Management',
    categories: ['Voltage Regulators', 'Gate Drivers', 'Protection', 'Power Supplies', 'Transformers', 'Battery Products'],
  },
  { label: 'Analog & Data Converters', categories: ['Amplifiers', 'Voltage References', 'ADCs', 'DACs'] },
  {
    label: 'Digital ICs & Memory',
    categories: ['Logic ICs', 'Interface ICs', 'Microcontrollers', 'Processors', 'Memory', 'ICs'],
  },
  { label: 'Frequency & Timing', categories: ['Crystals', 'Timers and Oscillators'] },
  {
    label: 'Optoelectronics & Electromechanical',
    categories: ['Optocouplers', 'LEDs and Optoelectronics', 'Relays', 'Switches', 'Motors and Fans'],
  },
  {
    label: 'Sensors, RF & Connectivity',
    categories: ['Sensors', 'RF and Wireless', 'Audio', 'Connectors', 'Cables and Wires', 'Test and Measurement', 'Development Tools'],
  },
];

type SortKey = 'products' | 'name';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function mfrDisplayName(m: AtlasMfr): string {
  if (m.nameEn && m.nameZh) return `${m.nameEn} · ${m.nameZh}`;
  return m.nameEn || m.manufacturer;
}

const PDF_TITLE = 'Atlas MFR Report';

function handleAtlasPrint(rootEl: HTMLElement) {
  if (document.getElementById('atlas-print-portal')) return;

  const prevTitle = document.title;
  document.title = PDF_TITLE;

  const clone = rootEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-no-print="true"]').forEach((el) => el.remove());

  const portal = document.createElement('div');
  portal.id = 'atlas-print-portal';
  portal.setAttribute('data-mui-color-scheme', 'light');
  portal.appendChild(clone);
  document.body.appendChild(portal);
  document.body.classList.add('atlas-printing');

  const cleanup = () => {
    document.body.classList.remove('atlas-printing');
    if (portal.parentNode) portal.remove();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Give the browser a tick to apply the DOM + class before opening print dialog
  setTimeout(() => window.print(), 80);
}

export default function AtlasCoveragePanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<AtlasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('products');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rootRef = useRef<HTMLDivElement>(null);

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

  // Per-category product counts + MFR counts, aggregated across enabled MFRs.
  // Includes all familyBreakdown rows — both scorable (familyId set) and non-scorable (familyId null).
  const { categoryCounts, mfrsPerCategory } = useMemo(() => {
    const counts: Record<string, number> = {};
    const sets: Record<string, Set<string>> = {};
    if (!data) return { categoryCounts: counts, mfrsPerCategory: {} as Record<string, number> };
    const enabledSet = new Set(data.manufacturers.filter((m) => m.enabled).map((m) => m.manufacturer));
    for (const fb of data.familyBreakdown) {
      if (!enabledSet.has(fb.manufacturer)) continue;
      counts[fb.category] = (counts[fb.category] ?? 0) + fb.count;
      if (!sets[fb.category]) sets[fb.category] = new Set();
      sets[fb.category].add(fb.manufacturer);
    }
    const mfrCounts: Record<string, number> = {};
    for (const [cat, set] of Object.entries(sets)) mfrCounts[cat] = set.size;
    return { categoryCounts: counts, mfrsPerCategory: mfrCounts };
  }, [data]);

  const categoriesWithCoverage = useMemo(
    () => Object.keys(categoryCounts).filter((c) => categoryCounts[c] > 0).length,
    [categoryCounts],
  );

  const coveredBlocks = useMemo(
    () => CATEGORY_BLOCKS.filter((b) => b.categories.some((c) => (categoryCounts[c] ?? 0) > 0)).length,
    [categoryCounts],
  );

  const sortedMfrs = useMemo(() => {
    if (!data) return [];
    const arr = [...data.manufacturers];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'products') cmp = a.productCount - b.productCount;
      else if (sortKey === 'name') cmp = mfrDisplayName(a).localeCompare(mfrDisplayName(b));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (loading) {
    return <AtlasCoverageSkeleton />;
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'No data'}</Alert>
      </Box>
    );
  }

  const s = data.summary;
  const generatedOn = formatDate(new Date().toISOString());
  const lastUpdatedFmt = formatDate(s.lastUpdated);

  return (
    <>
      <GlobalStyles
        styles={{
          // Portal is invisible on screen — only appears during print
          '#atlas-print-portal': { display: 'none' },
          '@media print': {
            '@page': { margin: '0.5in', size: 'letter' },
            'html, body': {
              background: '#fff !important',
              margin: 0,
              padding: 0,
            },
            // Hide all non-portal body children when printing
            'body.atlas-printing > *:not(#atlas-print-portal)': {
              display: 'none !important',
            },
            // Reveal portal and force light theme via MUI CSS variable overrides
            'body.atlas-printing #atlas-print-portal': {
              display: 'block !important',
              background: '#fff',
              color: 'rgba(0, 0, 0, 0.87)',
              padding: 0,
              colorScheme: 'light',
              '--mui-palette-mode': 'light',
              '--mui-palette-text-primary': 'rgba(0, 0, 0, 0.87)',
              '--mui-palette-text-secondary': 'rgba(0, 0, 0, 0.6)',
              '--mui-palette-text-disabled': 'rgba(0, 0, 0, 0.38)',
              '--mui-palette-background-paper': '#fff',
              '--mui-palette-background-default': '#fff',
              '--mui-palette-divider': 'rgba(0, 0, 0, 0.18)',
              '--mui-palette-action-active': 'rgba(0, 0, 0, 0.54)',
              '--mui-palette-action-selected': 'rgba(0, 0, 0, 0.06)',
              '--mui-palette-action-hover': 'rgba(0, 0, 0, 0.04)',
              '--mui-palette-action-disabled': 'rgba(0, 0, 0, 0.26)',
              '--mui-palette-action-disabledBackground': 'rgba(0, 0, 0, 0.08)',
              '--mui-palette-primary-main': '#1976d2',
              '--mui-palette-common-black': '#000',
              '--mui-palette-common-white': '#fff',
            },
            'body.atlas-printing #atlas-print-portal *': {
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
              boxShadow: 'none !important',
            },
            '.atlas-coverage-section': {
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
            },
            '.atlas-coverage-mfr-page': {
              pageBreakBefore: 'always',
              breakBefore: 'page',
            },
            '.atlas-coverage-print-root': {
              maxWidth: 'none !important',
              padding: '0 !important',
            },
          },
        }}
      />

      <Box
        ref={rootRef}
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
            onClick={() => rootRef.current && handleAtlasPrint(rootRef.current)}
            sx={{ flexShrink: 0 }}
          >
            {t('admin.atlasCoverageReport.exportPdf')}
          </Button>
        </Box>

        {/* Hero: identified dataset */}
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
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}
          >
            {t('admin.atlasCoverageReport.heroEyebrow')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mt: 1, flexWrap: 'wrap' }}>
            <Typography variant="h2" fontWeight={700} sx={{ lineHeight: 1 }}>
              {s.targetManufacturers.toLocaleString()}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
              {t('admin.atlasCoverageReport.heroHeadlineSuffix')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 720, lineHeight: 1.6 }}>
            {t('admin.atlasCoverageReport.heroBody', {
              live: s.enabledManufacturers.toLocaleString(),
              products: s.enabledProducts.toLocaleString(),
            })}
          </Typography>
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
            subtitle={t('admin.atlasCoverageReport.kpiLiveMfrsSub')}
            accent
          />
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiTotalProducts')}
            value={s.enabledProducts.toLocaleString()}
            subtitle={t('admin.atlasCoverageReport.kpiTotalProductsSub')}
          />
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiCategories')}
            value={categoriesWithCoverage.toLocaleString()}
            subtitle={t('admin.atlasCoverageReport.kpiCategoriesSub', { blocks: coveredBlocks })}
          />
          <KpiTile
            label={t('admin.atlasCoverageReport.kpiFreshness')}
            value={lastUpdatedFmt}
            subtitle={t('admin.atlasCoverageReport.kpiFreshnessSub')}
          />
        </Box>

        {/* Product categories covered by Atlas MFRs */}
        <Box className="atlas-coverage-section" sx={{ mb: 4 }}>
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            {t('admin.atlasCoverageReport.categoryCoverageTitle')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            {t('admin.atlasCoverageReport.categoryCoverageSubtitle', {
              covered: categoriesWithCoverage,
              blocks: coveredBlocks,
            })}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {CATEGORY_BLOCKS.map((block) => {
              const represented = block.categories
                .filter((c) => (categoryCounts[c] ?? 0) > 0)
                .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0));
              if (represented.length === 0) return null;
              return (
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
                    {represented.map((cat) => {
                      const count = categoryCounts[cat] ?? 0;
                      const mfrCount = mfrsPerCategory[cat] ?? 0;
                      return (
                        <Box
                          key={cat}
                          sx={{
                            p: 1.25,
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            bgcolor: 'background.paper',
                            minHeight: 72,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.72rem',
                              lineHeight: 1.3,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              color: 'text.primary',
                            }}
                          >
                            {cat}
                          </Typography>
                          <Box sx={{ mt: 0.75 }}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.78rem',
                                color: 'text.primary',
                                fontWeight: 700,
                                lineHeight: 1,
                                display: 'block',
                              }}
                            >
                              {count.toLocaleString()}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.66rem',
                                color: 'text.secondary',
                                display: 'block',
                                mt: 0.25,
                              }}
                            >
                              {t('admin.atlasCoverageReport.productsFromMfrs', { count: mfrCount })}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
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
              queued: s.totalManufacturers - s.enabledManufacturers + s.queuedManufacturers,
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
                  queuedLabel={t('admin.atlasCoverageReport.statusQueued')}
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

function AtlasCoverageSkeleton() {
  return (
    <Box sx={{ px: 3, pt: '16px', pb: 6, maxWidth: 960, mx: 'auto' }}>
      {/* Header strip */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Skeleton variant="text" width={220} height={28} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width={160} height={16} />
        </Box>
        <Skeleton variant="rounded" width={140} height={32} />
      </Box>

      {/* Hero card */}
      <Box sx={{ p: 3, mb: 3, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
        <Skeleton variant="text" width={280} height={14} />
        <Skeleton variant="text" width={420} height={60} sx={{ mt: 1 }} />
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="text" width="100%" height={14} />
          <Skeleton variant="text" width="95%" height={14} />
          <Skeleton variant="text" width="70%" height={14} />
        </Box>
      </Box>

      {/* KPI tiles */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 4,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Box
            key={i}
            sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}
          >
            <Skeleton variant="text" width={110} height={12} />
            <Skeleton variant="text" width={90} height={34} sx={{ mt: 0.75 }} />
            <Skeleton variant="text" width={130} height={12} sx={{ mt: 0.5 }} />
          </Box>
        ))}
      </Box>

      {/* Category section */}
      <Box sx={{ mb: 4 }}>
        <Skeleton variant="text" width={320} height={22} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width={460} height={14} sx={{ mb: 2 }} />
        {Array.from({ length: 3 }).map((_, blockIdx) => (
          <Box key={blockIdx} sx={{ mb: 2.5 }}>
            <Skeleton variant="text" width={140} height={12} sx={{ mb: 1 }} />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                gap: 1,
              }}
            >
              {Array.from({ length: 4 - blockIdx }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={72} />
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      {/* MFR table */}
      <Box sx={{ mb: 4 }}>
        <Skeleton variant="text" width={180} height={22} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width={280} height={14} sx={{ mb: 2 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              py: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Skeleton variant="text" width={180} />
            <Skeleton variant="rounded" width={48} height={20} />
            <Box sx={{ flex: 1 }} />
            <Skeleton variant="text" width={50} />
            <Skeleton variant="rounded" width={260} height={22} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function KpiTile({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent?: boolean;
}) {
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
      <Typography
        variant="h5"
        fontWeight={700}
        sx={{ mt: 0.5, lineHeight: 1.1, color: accent ? 'primary.main' : 'text.primary' }}
      >
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
  queuedLabel,
  liveLabel,
  overflowLabel,
}: {
  mfr: AtlasMfr;
  queuedLabel: string;
  liveLabel: string;
  overflowLabel: (n: number) => string;
}) {
  const isQueued = !mfr.enabled;
  const visibleCategories = mfr.categories.slice(0, 4);
  const overflowCount = Math.max(0, mfr.categories.length - visibleCategories.length);
  const textColor = isQueued ? 'text.disabled' : 'text.primary';

  return (
    <TableRow sx={{ '& td': { py: 1.25, fontSize: '0.74rem' } }}>
      <TableCell sx={{ color: textColor }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25 }}>
          <Typography
            variant="body2"
            sx={{ fontSize: '0.78rem', fontWeight: 500, color: textColor, lineHeight: 1.3 }}
          >
            {mfr.nameEn || mfr.manufacturer}
          </Typography>
          {mfr.nameZh && (
            <Typography
              variant="caption"
              sx={{ color: isQueued ? 'text.disabled' : 'text.secondary', fontSize: '0.72rem', lineHeight: 1.3 }}
            >
              {mfr.nameZh}
            </Typography>
          )}
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          label={isQueued ? queuedLabel : liveLabel}
          size="small"
          variant={isQueued ? 'outlined' : 'filled'}
          sx={{
            fontSize: '0.65rem',
            height: 20,
            bgcolor: isQueued ? 'transparent' : 'action.selected',
            color: isQueued ? 'text.disabled' : 'text.primary',
            borderColor: 'divider',
          }}
        />
      </TableCell>
      <TableCell align="right" sx={{ color: textColor }}>
        <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 600, color: textColor, lineHeight: 1 }}>
          {mfr.productCount.toLocaleString()}
        </Typography>
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
