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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddIcon from '@mui/icons-material/Add';
import {
  AppFeedbackListItem,
  AppFeedbackStatus,
  AppFeedbackCategory,
} from '@/lib/types';
import { getAdminAppFeedbackList } from '@/lib/api';
import AppFeedbackDialog from '@/components/AppFeedbackDialog';
import FeedbackDetailModal from '@/components/feedback/FeedbackDetailModal';
import FeedbackRowMenu from '@/components/feedback/FeedbackRowMenu';
import PaginatedTableSkeleton from './PaginatedTableSkeleton';

const POLL_INTERVAL_MS = 30_000;

type StatusFilter = AppFeedbackStatus | 'all';
type CategoryFilter = AppFeedbackCategory | 'all';

const PAGE_SIZE = 50;

function statusChipColor(status: AppFeedbackStatus): 'default' | 'warning' | 'info' | 'success' | 'secondary' {
  switch (status) {
    case 'open': return 'warning';
    case 'reviewed': return 'info';
    case 'wip': return 'secondary';
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
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('activity');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<AppFeedbackListItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, debouncedSearch, sortColumn, sortDirection, page]);

  useEffect(() => { load(); }, [load]);

  // Refresh when a thread read-state or status changes elsewhere (detail view
  // stamps admin_last_read_at; FeedbackShell posts comments).
  useEffect(() => {
    const handler = () => { load(); };
    window.addEventListener('feedback-unread-changed', handler);
    return () => window.removeEventListener('feedback-unread-changed', handler);
  }, [load]);

  // 30s background poll while the tab is visible + immediate refresh on
  // tab-visibility regain. Skipped when the tab is hidden.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

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
    { id: 'flag', label: '', sortable: false },
    { id: 'created_at', label: 'Submitted', sortable: true },
    { id: 'user', label: 'User', sortable: false },
    { id: 'category', label: 'Category', sortable: true },
    { id: 'comment', label: 'Comment', sortable: false },
    { id: 'status', label: 'Status', sortable: true },
    { id: 'actions', label: '', sortable: false },
  ];

  const handleRowDeleted = (deletedId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== deletedId));
    setTotal((prev) => Math.max(0, prev - 1));
    if (selected?.id === deletedId) setSelected(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filters + Search */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {(['all', 'open', 'reviewed', 'wip', 'resolved', 'dismissed'] as StatusFilter[]).map((f) => {
            const labelText = f === 'all' ? 'All' : f === 'wip' ? 'WIP' : f.charAt(0).toUpperCase() + f.slice(1);
            return (
              <Chip
                key={f}
                label={labelText}
                size="small"
                variant={statusFilter === f ? 'filled' : 'outlined'}
                color={statusFilter === f ? 'primary' : 'default'}
                onClick={() => { setStatusFilter(f); setPage(0); }}
                sx={{ height: 24, fontSize: '0.72rem' }}
              />
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

          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: '1rem' }} />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', height: 30, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          >
            New feedback
          </Button>

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
                  <TableCell sx={{ verticalAlign: 'top', width: 54, pr: 0 }}>
                    {!item.adminLastReadAt && item.status === 'open' && (
                      <Chip
                        label="NEW"
                        size="small"
                        color="info"
                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em' }}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {formatTimestamp(item.createdAt)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', verticalAlign: 'top' }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      {item.hasUnread && (
                        <Box
                          title="Unread reply from user"
                          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }}
                        />
                      )}
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', lineHeight: 1.3, fontWeight: item.hasUnread ? 600 : 400 }}>
                          {item.userName || '—'}
                        </Typography>
                        {item.userEmail && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', lineHeight: 1.3 }}>
                            {item.userEmail}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
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
                    <Stack direction="row" spacing={0.75} alignItems="flex-start">
                      {item.attachments && item.attachments.length > 0 && (
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.25}
                          sx={{ color: 'text.secondary', flexShrink: 0, mt: '1px' }}
                          title={`${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}`}
                        >
                          <AttachFileIcon sx={{ fontSize: '0.85rem' }} />
                          {item.attachments.length > 1 && (
                            <Typography component="span" sx={{ fontSize: '0.7rem', lineHeight: 1 }}>
                              {item.attachments.length}
                            </Typography>
                          )}
                        </Stack>
                      )}
                      {item.commentCount > 0 && (
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.25}
                          sx={{ color: 'text.secondary', flexShrink: 0, mt: '1px' }}
                          title={`${item.commentCount} comment${item.commentCount === 1 ? '' : 's'} in thread`}
                        >
                          <ChatBubbleOutlineIcon sx={{ fontSize: '0.78rem' }} />
                          <Typography component="span" sx={{ fontSize: '0.7rem', lineHeight: 1 }}>
                            {item.commentCount}
                          </Typography>
                        </Stack>
                      )}
                      <Box component="span">{truncate(item.userComment, 140)}</Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Chip
                      label={item.status === 'wip' ? 'WIP' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      size="small"
                      color={statusChipColor(item.status)}
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', width: 40, pl: 0, pr: 1 }} onClick={(e) => e.stopPropagation()}>
                    <FeedbackRowMenu
                      feedback={item}
                      viewerRole="admin"
                      onDeleted={handleRowDeleted}
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

      {/* Trello-style overlay */}
      {selected && (
        <FeedbackDetailModal
          open
          onClose={() => setSelected(null)}
          viewerRole="admin"
          feedback={selected}
          onUpdated={() => { load(); }}
        />
      )}

      {/* Admin-authored feedback */}
      <AppFeedbackDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmitted={() => { setCreateOpen(false); setPage(0); load(); }}
      />
    </Box>
  );
}
