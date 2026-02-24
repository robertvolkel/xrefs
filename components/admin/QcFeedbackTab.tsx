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
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useTranslation } from 'react-i18next';
import {
  QcFeedbackListItem,
  FeedbackStatus,
  FeedbackStatusCounts,
} from '@/lib/types';
import {
  getAdminFeedbackList,
  updateFeedback,
} from '@/lib/api';
import { statusColor } from './qcConstants';
import QcFeedbackDetailView from './QcFeedbackDetailView';

type StatusFilter = FeedbackStatus | 'all';

export default function QcFeedbackTab() {
  const { t } = useTranslation();

  // List state
  const [items, setItems] = useState<QcFeedbackListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<FeedbackStatusCounts>({ open: 0, reviewed: 0, resolved: 0, dismissed: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  // Detail
  const [selectedFeedback, setSelectedFeedback] = useState<QcFeedbackListItem | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load feedback list
  const loadFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminFeedbackList({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        sortBy: sortColumn,
        sortDir: sortDirection,
        page,
        limit: 50,
      });
      setItems(result.items);
      setTotal(result.total);
      setStatusCounts(result.statusCounts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch, sortColumn, sortDirection, page]);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnId);
      setSortDirection('desc');
    }
    setPage(0);
  };

  const handleStatusChange = async (feedbackId: string, status: FeedbackStatus, notes?: string) => {
    try {
      await updateFeedback(feedbackId, { status, adminNotes: notes });
      // Update in list + detail
      setItems(prev => prev.map(fb => fb.id === feedbackId ? { ...fb, status } : fb));
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, status } : null);
      }
    } catch {
      // silent
    }
  };

  const columns = [
    { id: 'created_at', label: t('adminQc.date'), sortable: true },
    { id: 'user', label: t('adminQc.user'), sortable: false },
    { id: 'source_mpn', label: t('adminQc.sourceMpn'), sortable: true },
    { id: 'feedback_stage', label: t('adminQc.type'), sortable: true },
    { id: 'detail', label: t('adminQc.detail'), sortable: false },
    { id: 'status', label: t('adminQc.statusLabel'), sortable: true },
    { id: 'user_comment', label: t('adminQc.comment'), sortable: false },
  ];

  const statusFilters: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'all', label: t('adminQc.filterStatusAll') },
    { key: 'open', label: t('adminQc.filterStatusOpen'), count: statusCounts.open },
    { key: 'reviewed', label: t('adminQc.filterStatusReviewed'), count: statusCounts.reviewed },
    { key: 'resolved', label: t('adminQc.filterStatusResolved'), count: statusCounts.resolved },
    { key: 'dismissed', label: t('adminQc.filterStatusDismissed'), count: statusCounts.dismissed },
  ];

  // ── Detail View ──
  if (selectedFeedback) {
    return (
      <QcFeedbackDetailView
        feedback={selectedFeedback}
        onBack={() => { setSelectedFeedback(null); loadFeedback(); }}
        onStatusChange={handleStatusChange}
      />
    );
  }

  // ── List View ──
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filters + Search */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {statusFilters.map((f) => (
            <Badge
              key={f.key}
              badgeContent={f.count}
              color={f.key === 'all' ? 'default' : statusColor(f.key as FeedbackStatus)}
              max={999}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}
              invisible={f.count === undefined || f.count === 0}
            >
              <Chip
                label={f.label}
                size="small"
                variant={statusFilter === f.key ? 'filled' : 'outlined'}
                color={statusFilter === f.key ? (f.key === 'all' ? 'primary' : statusColor(f.key as FeedbackStatus)) : 'default'}
                onClick={() => { setStatusFilter(f.key); setPage(0); }}
                sx={{ height: 24, fontSize: '0.72rem' }}
              />
            </Badge>
          ))}
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder={t('adminQc.searchFeedbackPlaceholder')}
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

      {/* Feedback table */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
              {total === 0 ? t('adminQc.noFeedbackItems') : t('adminQc.noFeedbackFiltered')}
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
              {items.map((fb) => (
                <TableRow
                  key={fb.id}
                  hover
                  onClick={() => setSelectedFeedback(fb)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(fb.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    {fb.userName || fb.userEmail || '—'}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 500 }}>
                    {fb.sourceMpn}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={fb.feedbackStage === 'rule_logic' ? t('adminQc.typeRule') : t('adminQc.typeQuestion')}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fb.feedbackStage === 'rule_logic'
                      ? (fb.ruleAttributeName || (fb.replacementMpn ? `vs ${fb.replacementMpn}` : '—'))
                      : (fb.questionText || '—')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(`adminQc.status${fb.status.charAt(0).toUpperCase() + fb.status.slice(1)}`)}
                      size="small"
                      color={statusColor(fb.status)}
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fb.userComment}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Pagination */}
      {total > 50 && (
        <Stack direction="row" justifyContent="center" spacing={1} sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Button size="small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <Typography variant="caption" sx={{ lineHeight: '30px' }}>
            {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}
          </Typography>
          <Button size="small" disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </Stack>
      )}
    </Box>
  );
}
