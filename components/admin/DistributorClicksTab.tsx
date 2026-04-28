'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  InputAdornment,
  TextField,
  Button,
  Link,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslation } from 'react-i18next';
import { DistributorClickEntry } from '@/lib/types';
import { getAdminDistributorClicks } from '@/lib/api';
import PaginatedTableSkeleton from './PaginatedTableSkeleton';

const DISTRIBUTOR_FILTERS = ['All', 'Digikey', 'Mouser', 'Arrow', 'LCSC', 'Farnell', 'RS', 'TME'] as const;

export default function DistributorClicksTab() {
  const { t } = useTranslation();

  const [clicks, setClicks] = useState<DistributorClickEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [distributorFilter, setDistributorFilter] = useState('All');
  const [page, setPage] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadClicks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminDistributorClicks({
        distributor: distributorFilter === 'All' ? undefined : distributorFilter.toLowerCase(),
        search: debouncedSearch || undefined,
        sortBy: sortColumn,
        sortDir: sortDirection,
        page,
        limit: 50,
      });
      setClicks(result.items);
      setTotal(result.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [distributorFilter, debouncedSearch, sortColumn, sortDirection, page]);

  useEffect(() => { loadClicks(); }, [loadClicks]);

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnId);
      setSortDirection('desc');
    }
    setPage(0);
  };

  const columns = [
    { id: 'created_at', label: t('adminDistributorClicks.date'), sortable: true },
    { id: 'user', label: t('adminDistributorClicks.user'), sortable: false },
    { id: 'mpn', label: t('adminDistributorClicks.mpn'), sortable: true },
    { id: 'manufacturer', label: t('adminDistributorClicks.manufacturer'), sortable: true },
    { id: 'distributor', label: t('adminDistributorClicks.distributor'), sortable: true },
    { id: 'url', label: '', sortable: false, align: 'center' as const },
  ];

  const PAGE_SIZE = 50;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filters + Search */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {DISTRIBUTOR_FILTERS.map((f) => (
            <Chip
              key={f}
              label={f === 'All' ? t('adminDistributorClicks.filterAll') : f}
              size="small"
              variant={distributorFilter === f ? 'filled' : 'outlined'}
              color={distributorFilter === f ? 'primary' : 'default'}
              onClick={() => { setDistributorFilter(f); setPage(0); }}
              sx={{ height: 24, fontSize: '0.72rem' }}
            />
          ))}
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder={t('adminDistributorClicks.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')} edge="end">
                      <ClearIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{
              width: 300,
              '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.5 },
              '& .MuiOutlinedInput-root': { height: 30 },
            }}
          />
        </Stack>
      </Box>

      {/* Table */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <PaginatedTableSkeleton columns={columns} />
        ) : clicks.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
              {total === 0 ? t('adminDistributorClicks.noEntries') : t('adminDistributorClicks.noEntriesFiltered')}
            </Typography>
          </Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    align={col.align}
                    sortDirection={sortColumn === col.id ? sortDirection : false}
                    sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}
                  >
                    {col.sortable ? (
                      <TableSortLabel
                        active={sortColumn === col.id}
                        direction={sortColumn === col.id ? sortDirection : 'desc'}
                        onClick={() => handleSort(col.id)}
                        sx={{ '& .MuiTableSortLabel-icon': { fontSize: '0.85rem' } }}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : (
                      col.label
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {clicks.map((click) => (
                <TableRow key={click.id} hover>
                  <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(click.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    {click.userName || click.userEmail || '—'}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 500 }}>
                    {click.mpn}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    {click.manufacturer}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    <Chip
                      label={click.distributor.charAt(0).toUpperCase() + click.distributor.slice(1)}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell align="center" sx={{ width: 40 }}>
                    {click.productUrl && (
                      <Link href={click.productUrl} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <OpenInNewIcon sx={{ fontSize: '0.85rem' }} />
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <Stack direction="row" justifyContent="center" spacing={1} sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Button size="small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            {t('adminQc.previous')}
          </Button>
          <Typography variant="caption" sx={{ lineHeight: '30px' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </Typography>
          <Button size="small" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
            {t('adminQc.next')}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
