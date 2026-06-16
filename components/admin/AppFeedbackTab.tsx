'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddIcon from '@mui/icons-material/Add';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
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

type StatusFilter = AppFeedbackStatus | 'all';
type CategoryFilter = AppFeedbackCategory | 'all';

const PAGE_SIZE = 50;

// Admin-pinned feedback IDs (pin-order, earliest first). Persisted to
// localStorage so a refresh keeps the same focus set. Per-browser only —
// mirrors the Atlas domain-cards pin pattern.
const PINNED_STORAGE_KEY = 'app-feedback-pinned-v1';

function loadPinnedFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function savePinnedToStorage(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota or disabled storage — non-fatal */
  }
}

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

  // Pinned feedback IDs. `pinned` (state) drives the row partition + icon;
  // `pinnedRef` lets `load` send the current set to the server without being
  // re-created on every toggle (which would trigger a skeleton-flashing reload).
  const [pinned, setPinned] = useState<string[]>([]);
  const pinnedRef = useRef<string[]>([]);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  useEffect(() => {
    const stored = loadPinnedFromStorage();
    setPinned(stored);
    pinnedRef.current = stored;
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      savePinnedToStorage(next);
      pinnedRef.current = next;
      return next;
    });
  }, []);

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
        pinnedIds: pinnedRef.current,
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
    { id: 'pin', label: '', sortable: false },
    { id: 'flag', label: '', sortable: false },
    { id: 'created_at', label: 'Submitted', sortable: true },
    { id: 'user', label: 'User', sortable: false },
    { id: 'category', label: 'Category', sortable: true },
    { id: 'comment', label: 'Comment', sortable: false },
    { id: 'status', label: 'Status', sortable: true },
    { id: 'actions', label: '', sortable: false },
  ];

  // Stable-partition the current page: pinned rows float to the top in
  // pin-order, unpinned rows keep the server's ordering below. The server
  // already pins-first within the activity sort across the full set so a
  // pinned item lands on page 1; this keeps the visual float correct for
  // other sort columns and for instant toggle feedback.
  const orderedItems = useMemo(() => {
    const pinIndex = new Map(pinned.map((id, i) => [id, i]));
    const pinnedRows = items
      .filter((it) => pinnedSet.has(it.id))
      .sort((a, b) => (pinIndex.get(a.id) ?? 0) - (pinIndex.get(b.id) ?? 0));
    const unpinnedRows = items.filter((it) => !pinnedSet.has(it.id));
    return [...pinnedRows, ...unpinnedRows];
  }, [items, pinned, pinnedSet]);

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
              {orderedItems.map((item) => {
                const isPinned = pinnedSet.has(item.id);
                return (
                <TableRow
                  key={item.id}
                  hover
                  onClick={() => setSelected(item)}
                  sx={{
                    cursor: 'pointer',
                    ...(isPinned && { bgcolor: (t) => t.palette.action.selected }),
                  }}
                >
                  <TableCell
                    sx={{ verticalAlign: 'top', width: 40, px: 0.5 }}
                    align="center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title={isPinned ? 'Unpin' : 'Pin to top'}>
                      <IconButton
                        size="small"
                        onClick={() => togglePin(item.id)}
                        sx={{ color: isPinned ? 'warning.main' : 'text.disabled' }}
                      >
                        {isPinned
                          ? <PushPinIcon sx={{ fontSize: 16 }} />
                          : <PushPinOutlinedIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
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
                );
              })}
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
