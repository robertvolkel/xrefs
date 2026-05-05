'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  TextField,
  InputAdornment,
  Button,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useTranslation } from 'react-i18next';
import type { AtlasGrowthEvent } from '@/app/api/admin/atlas/growth/route';
import AtlasEventRow from './atlasCoverage/AtlasEventRow';

interface AtlasEventLogTableProps {
  events: AtlasGrowthEvent[];
}

type SortKey = 'date' | 'partsInserted' | 'attrChangeTotal';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export default function AtlasEventLogTable({ events }: AtlasEventLogTableProps) {
  const { t } = useTranslation();

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'desc');
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) => {
      const haystack = `${ev.nameEn ?? ''} ${ev.nameZh ?? ''} ${ev.manufacturer ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [events, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.appliedAt.localeCompare(b.appliedAt);
      else if (sortKey === 'partsInserted') cmp = a.partsInserted - b.partsInserted;
      else if (sortKey === 'attrChangeTotal') cmp = a.attrChangeTotal - b.attrChangeTotal;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="body1" fontWeight={600}>
            {t('admin.atlasGrowth.logTitle')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('admin.atlasGrowth.logSubtitle', { count: events.length })}
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder={t('admin.atlasGrowth.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 240 }}
        />
      </Box>

      {events.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t('admin.atlasGrowth.emptyLog')}
        </Typography>
      ) : (
        <>
          <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', width: 160 }}>
                  <TableSortLabel
                    active={sortKey === 'date'}
                    direction={sortKey === 'date' ? sortDir : 'desc'}
                    onClick={() => toggleSort('date')}
                  >
                    {t('admin.atlasGrowth.colDate')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  {t('admin.atlasGrowth.colMfr')}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', width: 140 }}>
                  {t('admin.atlasGrowth.colType')}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  {t('admin.atlasGrowth.colCategories')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem', width: 110 }}>
                  <TableSortLabel
                    active={sortKey === 'partsInserted'}
                    direction={sortKey === 'partsInserted' ? sortDir : 'desc'}
                    onClick={() => toggleSort('partsInserted')}
                  >
                    {t('admin.atlasGrowth.colPartsAdded')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem', width: 110 }}>
                  <TableSortLabel
                    active={sortKey === 'attrChangeTotal'}
                    direction={sortKey === 'attrChangeTotal' ? sortDir : 'desc'}
                    onClick={() => toggleSort('attrChangeTotal')}
                  >
                    {t('admin.atlasGrowth.colAttrUpdates')}
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((ev) => (
                <AtlasEventRow key={ev.id} ev={ev} />
              ))}
            </TableBody>
          </Table>

          {sorted.length > PAGE_SIZE && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t('admin.atlasGrowth.pageIndicator', { page: page + 1, total: totalPages })}
              </Typography>
              <Button size="small" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                {t('admin.atlasGrowth.prev')}
              </Button>
              <Button size="small" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                {t('admin.atlasGrowth.next')}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

