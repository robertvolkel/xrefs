'use client';

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
  Chip,
  Switch,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useTranslation } from 'react-i18next';
import AtlasCoverageDrawer from './AtlasCoverageDrawer';
import AtlasExplorerTab from './AtlasExplorerTab';

interface AtlasStats {
  summary: {
    totalProducts: number;
    totalManufacturers: number;
    enabledManufacturers: number;
    enabledProducts: number;
    scorableProducts: number;
    searchOnlyProducts: number;
    familiesCovered: number;
    lastUpdated: string | null;
  };
  manufacturers: {
    manufacturer: string;
    productCount: number;
    scorableCount: number;
    families: string[];
    categories: string[];
    lastUpdated: string;
    coveragePct: number;
    enabled: boolean;
  }[];
  familyBreakdown: {
    manufacturer: string;
    familyId: string | null;
    category: string;
    subcategory: string;
    count: number;
    scorableCount: number;
    coveragePct: number;
  }[];
  familyNames: Record<string, string>;
}

type MfrSortKey = 'manufacturer' | 'productCount' | 'scorableCount' | 'coveragePct' | 'families' | 'lastUpdated';
type SortDir = 'asc' | 'desc';

function MfrRow({
  row,
  breakdown,
  familyNames,
  onFamilyClick,
  onToggle,
}: {
  row: AtlasStats['manufacturers'][number];
  breakdown: AtlasStats['familyBreakdown'];
  familyNames: Record<string, string>;
  onFamilyClick: (manufacturer: string, familyId: string) => void;
  onToggle: (manufacturer: string, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mfrBreakdown = breakdown.filter((b) => b.manufacturer === row.manufacturer);

  return (
    <Fragment>
      <TableRow
        hover
        onClick={() => setOpen(!open)}
        sx={{ cursor: 'pointer', '& > td': { borderBottom: open ? 0 : undefined }, opacity: row.enabled ? 1 : 0.5 }}
      >
        <TableCell sx={{ width: 40, p: 0, pl: 1 }}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={500}>
            {row.manufacturer}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">{row.productCount.toLocaleString()}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">{row.scorableCount.toLocaleString()}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" sx={{ opacity: row.coveragePct > 0 ? 1 : 0.3 }}>
            {row.coveragePct > 0 ? `${row.coveragePct}%` : '\u2014'}
          </Typography>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {row.families.map((f) => (
              <Tooltip key={f} title={familyNames[f] || f} arrow>
                <Chip label={f} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
              </Tooltip>
            ))}
          </Box>
        </TableCell>
        <TableCell>
          <Typography variant="caption" color="text.secondary">
            {new Date(row.lastUpdated).toLocaleDateString()}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ width: 60 }}>
          <Switch
            size="small"
            checked={row.enabled}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggle(row.manufacturer, e.target.checked)}
          />
        </TableCell>
      </TableRow>

      {/* Expanded family breakdown */}
      <TableRow>
        <TableCell colSpan={8} sx={{ py: 0, px: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ mx: 4, my: 1.5 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><Typography variant="caption" fontWeight={600}>{t('admin.atlasFamilyCol')}</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={600}>{t('admin.atlasCategoryCol')}</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={600}>{t('admin.atlasSubcategoryCol')}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={600}>{t('admin.atlasProductsCol')}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={600}>{t('admin.atlasScorableCol', 'Scorable')}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={600}>{t('admin.atlasCoverageCol')}</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mfrBreakdown.map((fb) => {
                    const hasFamilyId = fb.familyId !== null;
                    return (
                      <TableRow
                        key={fb.familyId ?? `${fb.category}::${fb.subcategory}`}
                        hover={hasFamilyId}
                        onClick={() => hasFamilyId && onFamilyClick(fb.manufacturer, fb.familyId!)}
                        sx={{ cursor: hasFamilyId ? 'pointer' : 'default' }}
                      >
                        <TableCell>
                          {hasFamilyId ? (
                            <Tooltip title={familyNames[fb.familyId!] || fb.familyId} arrow>
                              <Chip label={fb.familyId} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" sx={{ opacity: 0.4 }}>{'\u2014'}</Typography>
                          )}
                        </TableCell>
                        <TableCell><Typography variant="caption">{fb.category}</Typography></TableCell>
                        <TableCell><Typography variant="caption">{fb.subcategory}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="caption">{fb.count}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" sx={{ opacity: fb.scorableCount > 0 ? 1 : 0.3 }}>
                            {fb.scorableCount > 0 ? fb.scorableCount : '\u2014'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" sx={{ opacity: fb.coveragePct > 0 ? 1 : 0.3 }}>
                            {fb.coveragePct > 0 ? `${fb.coveragePct}%` : '\u2014'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

export default function AtlasPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState<AtlasStats | null>(null);
  const [sortKey, setSortKey] = useState<MfrSortKey>('productCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Coverage drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedMfr, setSelectedMfr] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');

  const handleFamilyClick = (manufacturer: string, familyId: string) => {
    setSelectedMfr(manufacturer);
    setSelectedFamilyId(familyId);
    setDrawerOpen(true);
  };

  const handleSort = useCallback((key: MfrSortKey) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
    setSortKey(key);
  }, [sortKey]);

  const handleToggle = useCallback(async (manufacturer: string, enabled: boolean) => {
    if (!data) return;

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        manufacturers: prev.manufacturers.map((m) =>
          m.manufacturer === manufacturer ? { ...m, enabled } : m
        ),
      };
    });

    try {
      const res = await fetch('/api/admin/atlas/manufacturers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturer, enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err) {
      console.error('Atlas manufacturer toggle failed:', err);
      // Revert on failure
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          manufacturers: prev.manufacturers.map((m) =>
            m.manufacturer === manufacturer ? { ...m, enabled: !enabled } : m
          ),
        };
      });
    }
  }, [data]);

  useEffect(() => {
    fetch('/api/admin/atlas')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const sortedManufacturers = useMemo(() => {
    if (!data) return [];
    const list = [...data.manufacturers];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'manufacturer': return dir * a.manufacturer.localeCompare(b.manufacturer);
        case 'productCount': return dir * (a.productCount - b.productCount);
        case 'scorableCount': return dir * (a.scorableCount - b.scorableCount);
        case 'coveragePct': return dir * (a.coveragePct - b.coveragePct);
        case 'families': return dir * (a.families.length - b.families.length);
        case 'lastUpdated': return dir * a.lastUpdated.localeCompare(b.lastUpdated);
        default: return 0;
      }
    });
    return list;
  }, [data, sortKey, sortDir]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.82rem' } }}
      >
        <Tab label={t('admin.atlasOverview')} />
        <Tab label={t('admin.atlasSearch')} />
      </Tabs>

      {activeTab === 0 && (
        <>
          {!data ? (
            <Typography variant="body2" color="text.secondary">
              {t('common.loading')}
            </Typography>
          ) : (
            <Box>
              <Typography variant="h6" sx={{ mb: 0.5 }}>
                {t('admin.atlas', 'Atlas Manufacturers')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('admin.atlasDesc', 'Chinese manufacturer product catalog.')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {data.summary.enabledManufacturers < data.summary.totalManufacturers
                  ? `${data.summary.enabledManufacturers} of ${data.summary.totalManufacturers} manufacturers enabled · ${data.summary.enabledProducts.toLocaleString()} of ${data.summary.totalProducts.toLocaleString()} products active · ${data.summary.scorableProducts.toLocaleString()} scorable · ${data.summary.familiesCovered} families`
                  : `${data.summary.totalManufacturers} manufacturers · ${data.summary.totalProducts.toLocaleString()} products · ${data.summary.scorableProducts.toLocaleString()} scorable · ${data.summary.familiesCovered} families`
                }
              </Typography>

              {data.manufacturers.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('admin.atlasNoData')}
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 40 }} />
                        <TableCell sortDirection={sortKey === 'manufacturer' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'manufacturer'} direction={sortKey === 'manufacturer' ? sortDir : 'asc'} onClick={() => handleSort('manufacturer')}>
                            {t('admin.atlasManufacturer')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right" sortDirection={sortKey === 'productCount' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'productCount'} direction={sortKey === 'productCount' ? sortDir : 'desc'} onClick={() => handleSort('productCount')}>
                            {t('admin.atlasProductsCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right" sortDirection={sortKey === 'scorableCount' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'scorableCount'} direction={sortKey === 'scorableCount' ? sortDir : 'desc'} onClick={() => handleSort('scorableCount')}>
                            {t('admin.atlasScorableCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right" sortDirection={sortKey === 'coveragePct' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'coveragePct'} direction={sortKey === 'coveragePct' ? sortDir : 'desc'} onClick={() => handleSort('coveragePct')}>
                            {t('admin.atlasCoverageCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={sortKey === 'families' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'families'} direction={sortKey === 'families' ? sortDir : 'desc'} onClick={() => handleSort('families')}>
                            {t('admin.atlasFamiliesCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={sortKey === 'lastUpdated' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'lastUpdated'} direction={sortKey === 'lastUpdated' ? sortDir : 'desc'} onClick={() => handleSort('lastUpdated')}>
                            {t('admin.atlasLastUpdatedCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="center" sx={{ width: 60 }}>
                          {t('admin.atlasEnabledCol', 'Enabled')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedManufacturers.map((mfr) => (
                        <MfrRow key={mfr.manufacturer} row={mfr} breakdown={data.familyBreakdown} familyNames={data.familyNames} onFamilyClick={handleFamilyClick} onToggle={handleToggle} />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Coverage gap analysis drawer */}
              <AtlasCoverageDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                manufacturer={selectedMfr}
                familyId={selectedFamilyId}
                familyName={data?.familyNames[selectedFamilyId] ?? selectedFamilyId}
              />
            </Box>
          )}
        </>
      )}

      {activeTab === 1 && <AtlasExplorerTab />}
    </Box>
  );
}
