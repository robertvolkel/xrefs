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
  Badge,
  TextField,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import {
  AppFeedbackListItem,
  AppFeedbackStatus,
  AppFeedbackStatusCounts,
  AppFeedbackCategory,
} from '@/lib/types';
import { getAdminAppFeedbackList } from '@/lib/api';
import AppFeedbackDetailView from './AppFeedbackDetailView';
import PaginatedTableSkeleton from './PaginatedTableSkeleton';

type StatusFilter = AppFeedbackStatus | 'all';
type CategoryFilter = AppFeedbackCategory | 'all';

const PAGE_SIZE = 50;

function statusChipColor(status: AppFeedbackStatus): 'default' | 'warning' | 'info' | 'success' {
  switch (status) {
    case 'open': return 'warning';
    case 'reviewed': return 'info';
    case 'resolved': return 'success';
    case 'dismissed': return 'default';
  }
}

function categoryIcon(category: AppFeedbackCategory) {
  switch (category) {
    case 'idea': return <LightbulbOutlinedIcon sx={{ fontSize: '0.9rem' }} />;
    case 'issue': return <BugReportOutlinedIcon sx={{ fontSize: '0.9rem' }} />;
    case 'other': return <ChatBubbleOutlineIcon sx={{ fontSize: '0.9rem' }} />;
  }
}

function categoryLabel(category: AppFeedbackCategory): string {
  switch (category) {
    case 'idea': return 'Idea';
    case 'issue': return 'Issue';
    case 'other': return 'Other';
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function truncate(str: string, n: number): string {
  if (str.length <= n) return str;
  return str.slice(0, n).trimEnd() + '…';
}

export default function AppFeedbackTab() {
  const [items, setItems] = useState<AppFeedbackListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<AppFeedbackStatusCounts>({
    open: 0, reviewed: 0, resolved: 0, dismissed: 0,
  });
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<AppFeedbackListItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminAppFeedbackList({
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        search: debouncedSearch || undefined,
        sortBy: sortColumn,
        sortDir: sortDirection,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
      setStatusCounts(result.statusCounts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, debouncedSearch, sortColumn, sortDirection, page]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnId);
      setSortDirection('desc');
    }
    setPage(0);
  };

  const columns = [
    { id: 'created_at', label: 'Submitted', sortable: true },
    { id: 'user', label: 'User', sortable: false },
    { id: 'category', label: 'Category', sortable: true },
    { id: 'comment', label: 'Comment', sortable: false },
    { id: 'status', label: 'Status', sortable: true },
  ];

  if (selected) {
    return (
      <AppFeedbackDetailView
        item={selected}
        onBack={() => setSelected(null)}
        onUpdated={async () => {
          await load();
          setSelected(null);
        }}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filters + Search */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {(['all', 'open', 'reviewed', 'resolved', 'dismissed'] as StatusFilter[]).map((f) => {
            const count = f === 'all' ? total : statusCounts[f as AppFeedbackStatus];
            const labelText = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
            return (
              <Badge key={f} badgeContent={count} color="primary" max={999} sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 14, minWidth: 14 } }}>
                <Chip
                  label={labelText}
                  size="small"
                  variant={statusFilter === f ? 'filled' : 'outlined'}
                  color={statusFilter === f ? 'primary' : 'default'}
                  onClick={() => { setStatusFilter(f); setPage(0); }}
                  sx={{ height: 24, fontSize: '0.72rem' }}
                />
              </Badge>
            );
          })}

          <Box sx={{ width: 16 }} />

          {(['all', 'idea', 'issue', 'other'] as CategoryFilter[]).map((c) => {
            const labelText = c === 'all' ? 'All types' : categoryLabel(c as AppFeedbackCategory);
            return (
              <Chip
                key={c}
                label={labelText}
                size="small"
                variant={categoryFilter === c ? 'filled' : 'outlined'}
                color={categoryFilter === c ? 'primary' : 'default'}
                onClick={() => { setCategoryFilter(c); setPage(0); }}
                sx={{ height: 24, fontSize: '0.72rem' }}
              />
            );
          })}

          <Box sx={{ flex: 1 }} />

          <TextField
            size="small"
            placeholder="Search comments, users…"
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
              width: 260,
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
        ) : items.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
              {total === 0 ? 'No app feedback yet.' : 'No feedback matches the current filters.'}
            </Typography>
          </Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
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
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  onClick={() => setSelected(item)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {formatTimestamp(item.createdAt)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', verticalAlign: 'top' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem', lineHeight: 1.3 }}>
                      {item.userName || '—'}
                    </Typography>
                    {item.userEmail && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', lineHeight: 1.3 }}>
                        {item.userEmail}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', verticalAlign: 'top' }}>
                    <Chip
                      icon={categoryIcon(item.category)}
                      label={categoryLabel(item.category)}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', verticalAlign: 'top', maxWidth: 480 }}>
                    {truncate(item.userComment, 140)}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Chip
                      label={item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      size="small"
                      color={statusChipColor(item.status)}
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
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
          <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Typography variant="caption" sx={{ lineHeight: '30px' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </Typography>
          <Button size="small" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </Stack>
      )}
    </Box>
  );
}
