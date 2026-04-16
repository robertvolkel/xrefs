'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  Chip,
  Switch,
  InputAdornment,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import AtlasExplorerTab from './AtlasExplorerTab';
import FlaggedProductsTab from './FlaggedProductsTab';
import { getAtlasFlags } from '@/lib/api';

interface MfrListItem {
  id: number;
  slug: string;
  nameEn: string;
  nameZh: string | null;
  nameDisplay: string;
  enabled: boolean;
  websiteUrl: string | null;
  productCount: number;
  scorableCount: number;
  families: string[];
  coveragePct: number;
  crossRefCount: number;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo}mo ago`;
}

interface MfrListData {
  manufacturers: MfrListItem[];
  cachedAt?: string | null;
  summary: {
    totalManufacturers: number;
    withProducts: number;
    enabledWithProducts: number;
    totalProducts: number;
    scorableProducts: number;
    familiesCovered: number;
  };
}

type MfrSortKey = 'manufacturer' | 'productCount' | 'scorableCount' | 'coveragePct' | 'crossRefCount' | 'families';
type SortDir = 'asc' | 'desc';

export default function ManufacturersPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState<MfrListData | null>(null);
  const [sortKey, setSortKey] = useState<MfrSortKey>('productCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getAtlasFlags('open').then((resp) => setFlaggedCount(resp.flags.length)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/admin/manufacturers')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/manufacturers?refresh=1');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Manufacturers refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSort = useCallback((key: MfrSortKey) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
    setSortKey(key);
  }, [sortKey]);

  const handleToggle = useCallback(async (nameDisplay: string, enabled: boolean) => {
    if (!data) return;

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        manufacturers: prev.manufacturers.map((m) =>
          m.nameDisplay === nameDisplay ? { ...m, enabled } : m
        ),
      };
    });

    try {
      const res = await fetch('/api/admin/atlas/manufacturers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturer: nameDisplay, enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err) {
      console.error('Manufacturer toggle failed:', err);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          manufacturers: prev.manufacturers.map((m) =>
            m.nameDisplay === nameDisplay ? { ...m, enabled: !enabled } : m
          ),
        };
      });
    }
  }, [data]);

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let list = [...data.manufacturers];

    // Client-side search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.nameEn.toLowerCase().includes(q) ||
          (m.nameZh && m.nameZh.includes(q)) ||
          m.nameDisplay.toLowerCase().includes(q)
      );
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'manufacturer': return dir * a.nameEn.localeCompare(b.nameEn);
        case 'productCount': return dir * (a.productCount - b.productCount);
        case 'scorableCount': return dir * (a.scorableCount - b.scorableCount);
        case 'coveragePct': return dir * (a.coveragePct - b.coveragePct);
        case 'crossRefCount': return dir * (a.crossRefCount - b.crossRefCount);
        case 'families': return dir * (a.families.length - b.families.length);
        default: return 0;
      }
    });
    return list;
  }, [data, sortKey, sortDir, search]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.82rem' } }}
      >
        <Tab label={t('admin.manufacturers', 'Manufacturers')} />
        <Tab label={t('admin.atlasSearch', 'Search')} />
        <Tab label={`Flagged${flaggedCount > 0 ? ` (${flaggedCount})` : ''}`} />
      </Tabs>

      {activeTab === 0 && (
        <>
          {!data ? (
            <Typography variant="body2" color="text.secondary">
              {t('common.loading')}
            </Typography>
          ) : (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {`${data.summary.withProducts} manufacturers with products · ${data.summary.totalProducts.toLocaleString()} products · ${data.summary.scorableProducts.toLocaleString()} scorable · ${data.summary.familiesCovered} families`}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  {data.cachedAt && (
                    <Tooltip title={new Date(data.cachedAt).toLocaleString()}>
                      <Typography variant="caption" color="text.secondary">
                        Computed {formatRelativeTime(data.cachedAt)}
                      </Typography>
                    </Tooltip>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RefreshIcon fontSize="small" />}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    sx={{ textTransform: 'none' }}
                  >
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </Button>
                </Box>
              </Box>

              <TextField
                size="small"
                placeholder={t('admin.mfrSearchPlaceholder', 'Search manufacturers...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlinedIcon fontSize="small" sx={{ opacity: 0.5 }} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ mb: 2, width: 320 }}
              />

              {filteredAndSorted.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {search ? t('admin.mfrNoResults', 'No manufacturers match your search.') : t('admin.atlasNoData')}
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
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
                            {t('admin.atlasScorableCol', 'Scorable')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right" sortDirection={sortKey === 'coveragePct' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'coveragePct'} direction={sortKey === 'coveragePct' ? sortDir : 'desc'} onClick={() => handleSort('coveragePct')}>
                            {t('admin.atlasCoverageCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right" sortDirection={sortKey === 'crossRefCount' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'crossRefCount'} direction={sortKey === 'crossRefCount' ? sortDir : 'desc'} onClick={() => handleSort('crossRefCount')}>
                            MFR Crosses
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={sortKey === 'families' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'families'} direction={sortKey === 'families' ? sortDir : 'desc'} onClick={() => handleSort('families')}>
                            {t('admin.atlasFamiliesCol')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="center" sx={{ width: 60 }}>
                          {t('admin.atlasEnabledCol', 'Enabled')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredAndSorted.map((mfr) => (
                        <TableRow
                          key={mfr.id}
                          hover
                          onClick={() => mfr.slug && router.push(`/admin/manufacturers/${mfr.slug}`)}
                          sx={{
                            cursor: mfr.slug ? 'pointer' : 'default',
                            opacity: mfr.productCount === 0 ? 0.4 : mfr.enabled ? 1 : 0.5,
                          }}
                        >
                          <TableCell>
                            <Box>
                              <Typography variant="body2" fontWeight={500}>
                                {mfr.nameEn}
                              </Typography>
                              {mfr.nameZh && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, fontSize: '0.7rem' }}>
                                  {mfr.nameZh}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ opacity: mfr.productCount > 0 ? 1 : 0.3 }}>
                              {mfr.productCount > 0 ? mfr.productCount.toLocaleString() : '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ opacity: mfr.scorableCount > 0 ? 1 : 0.3 }}>
                              {mfr.scorableCount > 0 ? mfr.scorableCount.toLocaleString() : '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ opacity: mfr.coveragePct > 0 ? 1 : 0.3 }}>
                              {mfr.coveragePct > 0 ? `${mfr.coveragePct}%` : '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ opacity: mfr.crossRefCount > 0 ? 1 : 0.3, color: mfr.crossRefCount > 0 ? '#66BB6A' : undefined }}>
                              {mfr.crossRefCount > 0 ? mfr.crossRefCount.toLocaleString() : '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {mfr.families.map((f) => (
                                <Chip key={f} label={f} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
                              ))}
                            </Box>
                          </TableCell>
                          <TableCell align="center" sx={{ width: 60 }}>
                            <Switch
                              size="small"
                              checked={mfr.enabled}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleToggle(mfr.nameDisplay, e.target.checked)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
        </>
      )}

      {activeTab === 1 && <AtlasExplorerTab />}

      {activeTab === 2 && <FlaggedProductsTab />}
    </Box>
  );
}
