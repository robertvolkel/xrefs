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
  Card,
  CardContent,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlagIcon from '@mui/icons-material/Flag';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useTranslation } from 'react-i18next';
import {
  RecommendationLogEntry,
  QcFeedbackRecord,
  FeedbackStatus,
  XrefRecommendation,
} from '@/lib/types';
import {
  getAdminQcLog,
  getAdminQcLogDetail,
  updateFeedback,
  getQcExportUrl,
} from '@/lib/api';
import { statusColor } from './qcConstants';
import QcFeedbackCard from './QcFeedbackCard';
import QcRecommendationSummary from './QcRecommendationSummary';
import QcAnalysisDrawer from './QcAnalysisDrawer';

type SourceFilter = 'all' | 'chat' | 'direct' | 'batch';

export default function QcLogsTab() {
  const { t } = useTranslation();

  // Log list
  const [logs, setLogs] = useState<RecommendationLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [hasFeedbackFilter, setHasFeedbackFilter] = useState(false);
  const [page, setPage] = useState(0);

  // Search + sort
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Detail view
  const [selectedLog, setSelectedLog] = useState<RecommendationLogEntry | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<QcFeedbackRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Export + Analysis
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load logs
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const result = await getAdminQcLog({
        requestSource: sourceFilter === 'all' ? undefined : sourceFilter,
        hasFeedback: hasFeedbackFilter || undefined,
        search: debouncedSearch || undefined,
        sortBy: sortColumn,
        sortDir: sortDirection,
        page,
        limit: 50,
      });
      setLogs(result.items);
      setTotal(result.total);
    } catch {
      // silent
    } finally {
      setLogsLoading(false);
    }
  }, [sourceFilter, hasFeedbackFilter, debouncedSearch, sortColumn, sortDirection, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleLogClick = async (log: RecommendationLogEntry) => {
    setDetailLoading(true);
    setSelectedLog(log);
    try {
      const detail = await getAdminQcLogDetail(log.id);
      setSelectedLog(detail.log);
      setFeedbackItems(detail.feedback);
    } catch {
      // keep basic log data
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFeedbackAction = async (feedbackId: string, status: FeedbackStatus, adminNotes?: string) => {
    try {
      await updateFeedback(feedbackId, { status, adminNotes });
      setFeedbackItems((prev) =>
        prev.map((fb) => (fb.id === feedbackId ? { ...fb, status } : fb))
      );
    } catch {
      // silent
    }
  };

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnId);
      setSortDirection('desc');
    }
    setPage(0);
  };

  const handleExport = (format: 'csv' | 'json') => {
    setExportAnchor(null);
    const url = getQcExportUrl({
      format,
      requestSource: sourceFilter === 'all' ? undefined : sourceFilter,
      hasFeedback: hasFeedbackFilter || undefined,
      search: debouncedSearch || undefined,
      sortBy: sortColumn,
      sortDir: sortDirection,
    });
    window.open(url, '_blank');
  };

  const columns = [
    { id: 'created_at', label: t('adminQc.date'), sortable: true },
    { id: 'user', label: t('adminQc.user'), sortable: false },
    { id: 'source_mpn', label: t('adminQc.sourceMpn'), sortable: true },
    { id: 'family_name', label: t('adminQc.family'), sortable: true },
    { id: 'recommendation_count', label: t('adminQc.recs'), sortable: true, align: 'center' as const },
    { id: 'request_source', label: t('adminQc.source'), sortable: true },
    { id: 'feedback', label: t('adminQc.feedback'), sortable: false, align: 'center' as const },
    { id: 'data_source', label: t('adminQc.dataSource'), sortable: true },
  ];

  // ── Detail View ──
  if (selectedLog) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton onClick={() => { setSelectedLog(null); setFeedbackItems([]); }} size="small">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('adminQc.detailTitle')}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {selectedLog.sourceMpn}
                </Typography>
                {selectedLog.sourceManufacturer && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                    {selectedLog.sourceManufacturer}
                  </Typography>
                )}
                <Chip label={selectedLog.requestSource} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                {selectedLog.dataSource && (
                  <Chip label={selectedLog.dataSource} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                {selectedLog.userName || selectedLog.userEmail} — {new Date(selectedLog.createdAt).toLocaleString()}
                {selectedLog.familyName && ` — ${selectedLog.familyName}`}
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={2.5}>
              {/* Feedback items */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 1 }}>
                  {t('adminQc.feedbackItems')} ({feedbackItems.length})
                </Typography>
                {feedbackItems.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {t('adminQc.noFeedback')}
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {feedbackItems.map((fb) => (
                      <QcFeedbackCard
                        key={fb.id}
                        feedback={fb}
                        onAction={handleFeedbackAction}
                        t={t}
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Context answers */}
              {selectedLog.snapshot?.contextAnswers && Object.keys(selectedLog.snapshot.contextAnswers).length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 1 }}>
                    {t('adminQc.contextAnswers')}
                  </Typography>
                  <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                    <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                      {Object.entries(selectedLog.snapshot.contextAnswers).map(([key, value]) => (
                        <Stack key={key} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                            {key}
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                            {value}
                          </Typography>
                        </Stack>
                      ))}
                    </CardContent>
                  </Card>
                </Box>
              )}

              {/* Attribute overrides */}
              {selectedLog.snapshot?.attributeOverrides && Object.keys(selectedLog.snapshot.attributeOverrides).length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 1 }}>
                    {t('adminQc.overrides')}
                  </Typography>
                  <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                    <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                      {Object.entries(selectedLog.snapshot.attributeOverrides).map(([key, value]) => (
                        <Stack key={key} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                            {key}
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                            {value}
                          </Typography>
                        </Stack>
                      ))}
                    </CardContent>
                  </Card>
                </Box>
              )}

              {/* Recommendations list */}
              {selectedLog.snapshot?.recommendations && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 1 }}>
                    {t('adminQc.recommendations')} ({selectedLog.recommendationCount})
                  </Typography>
                  <Stack spacing={1}>
                    {selectedLog.snapshot.recommendations.map((rec: XrefRecommendation) => (
                      <QcRecommendationSummary key={rec.part.mpn} rec={rec} t={t} />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      </Box>
    );
  }

  // ── List View ──
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filters + Search */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {(['all', 'chat', 'direct', 'batch'] as SourceFilter[]).map((f) => (
            <Chip
              key={f}
              label={t(`adminQc.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
              size="small"
              variant={sourceFilter === f ? 'filled' : 'outlined'}
              color={sourceFilter === f ? 'primary' : 'default'}
              onClick={() => { setSourceFilter(f); setPage(0); }}
              sx={{ height: 24, fontSize: '0.72rem' }}
            />
          ))}
          <Chip
            icon={<FlagIcon sx={{ fontSize: '0.9rem !important' }} />}
            label={t('adminQc.filterHasFeedback')}
            size="small"
            variant={hasFeedbackFilter ? 'filled' : 'outlined'}
            color={hasFeedbackFilter ? 'warning' : 'default'}
            onClick={() => { setHasFeedbackFilter(!hasFeedbackFilter); setPage(0); }}
            sx={{ height: 24, fontSize: '0.72rem' }}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<FileDownloadIcon sx={{ fontSize: '0.9rem !important' }} />}
            onClick={(e) => setExportAnchor(e.currentTarget)}
            sx={{ height: 28, fontSize: '0.72rem', textTransform: 'none', minWidth: 'auto' }}
          >
            {t('adminQc.export')}
          </Button>
          <Menu
            anchorEl={exportAnchor}
            open={Boolean(exportAnchor)}
            onClose={() => setExportAnchor(null)}
          >
            <MenuItem onClick={() => handleExport('csv')} sx={{ fontSize: '0.78rem' }}>
              {t('adminQc.exportCsv')}
            </MenuItem>
            <MenuItem onClick={() => handleExport('json')} sx={{ fontSize: '0.78rem' }}>
              {t('adminQc.exportJson')}
            </MenuItem>
          </Menu>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoFixHighIcon sx={{ fontSize: '0.9rem !important' }} />}
            onClick={() => setAnalysisOpen(true)}
            sx={{ height: 28, fontSize: '0.72rem', textTransform: 'none', minWidth: 'auto' }}
          >
            {t('adminQc.analyze')}
          </Button>
          <TextField
            size="small"
            placeholder={t('adminQc.searchPlaceholder')}
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

      {/* Log table */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
        {logsLoading ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : logs.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
              {total === 0 ? t('adminQc.noEntries') : t('adminQc.noEntriesFiltered')}
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
              {logs.map((log) => (
                <TableRow
                  key={log.id}
                  hover
                  onClick={() => handleLogClick(log)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    {log.userName || log.userEmail || '—'}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 500 }}>
                    {log.sourceMpn}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>
                    {log.familyName || '—'}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.78rem' }}>
                    {log.recommendationCount}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.requestSource}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {(log.feedbackCount ?? 0) > 0 ? (
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                        <Badge badgeContent={log.feedbackCount} color={statusColor(log.feedbackStatus ?? 'open')} sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}>
                          <FlagIcon fontSize="small" sx={{ color: log.feedbackStatus === 'resolved' ? '#69F0AE' : log.feedbackStatus === 'dismissed' ? 'text.disabled' : log.feedbackStatus === 'reviewed' ? '#90CAF9' : '#FFD54F' }} />
                        </Badge>
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>
                    {log.dataSource || '—'}
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

      {/* Analysis drawer */}
      <QcAnalysisDrawer
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        filters={{
          requestSource: sourceFilter === 'all' ? undefined : sourceFilter,
          hasFeedback: hasFeedbackFilter || undefined,
          search: debouncedSearch || undefined,
        }}
      />
    </Box>
  );
}
