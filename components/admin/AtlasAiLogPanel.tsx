'use client';

/**
 * AtlasAiLogPanel — admin audit view for AI Triage Investigations
 * (Decision #185 follow-up). Every click of "Investigate" on a non-accept
 * Triage row logs a row to atlas_triage_investigations; every follow-up
 * action (Accept/Confirm/Mark Unmappable) updates that row with what the
 * engineer did and a link to the resulting override (if any). This panel
 * is the read-only audit surface — filter, browse, click for detail.
 *
 * Designed for "look back at what the AI told us and what we did about it"
 * months after the fact, not for active triage workflow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
  Pagination,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';

type Bucket = 'new_canonical' | 'disambiguation' | 'wrong_family' | 'unit_mismatch' | 'unscoped_products' | 'unmappable';
type Action = 'override_created' | 'flagged_wrong_family' | 'marked_unmappable' | 'dismissed';

interface InvestigationRow {
  id: string;
  paramName: string;
  scopeKind: 'family' | 'category' | 'none';
  scopeKey: string | null;
  bucket: Bucket;
  confidence: 'high' | 'medium' | 'low';
  summary: string | null;
  prose: string | null;
  primaryActionLabel: string | null;
  rawResponse: Record<string, unknown>;
  actionTaken: Action | null;
  actionAt: string | null;
  resultingOverrideId: string | null;
  revertedAt: string | null;
  revertedBy: string | null;
  revertedByName: string | null;
  ranBy: string;
  ranByName: string;
  ranAt: string;
}

const BUCKET_COLOR: Record<Bucket, { color: 'primary' | 'info' | 'error' | 'warning' | 'success'; label: string }> = {
  new_canonical: { color: 'primary', label: 'New canonical' },
  disambiguation: { color: 'info', label: 'Disambiguation' },
  wrong_family: { color: 'error', label: 'Wrong family' },
  unit_mismatch: { color: 'warning', label: 'Unit mismatch' },
  unscoped_products: { color: 'warning', label: 'Unscoped' },
  unmappable: { color: 'error', label: 'Unmappable' },
};

const ACTION_COLOR: Record<Action, { color: 'success' | 'error' | 'default' | 'warning'; label: string }> = {
  override_created: { color: 'success', label: 'Override created' },
  flagged_wrong_family: { color: 'error', label: 'Flagged wrong family' },
  marked_unmappable: { color: 'default', label: 'Marked unmappable' },
  dismissed: { color: 'warning', label: 'Dismissed' },
};

const PAGE_SIZE = 50;

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AtlasAiLogPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<InvestigationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<{
    bucket: Bucket | '';
    action: Action | '' | 'pending' | 'reverted';
    search: string;
  }>({
    bucket: '',
    action: '',
    search: '',
  });
  const [detail, setDetail] = useState<InvestigationRow | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(page * PAGE_SIZE));
    if (filters.bucket) sp.set('bucket', filters.bucket);
    if (filters.action === 'pending') sp.set('pending_only', '1');
    else if (filters.action === 'reverted') sp.set('reverted_only', '1');
    else if (filters.action) sp.set('action', filters.action);
    if (filters.search.trim()) sp.set('param_name', filters.search.trim());
    return sp.toString();
  }, [page, filters]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/atlas/triage-investigations?${queryString}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Fetch failed (${res.status})`);
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ px: 3, pt: 2, pb: 4 }}>
      <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mb: 1 }}>
        <Typography variant="h6">{t('admin.aiLog.title', 'AI Investigation Log')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {total} {total === 1 ? 'investigation' : 'investigations'} logged
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Reload from server">
          <IconButton size="small" onClick={fetchRows} disabled={loading}>
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every time you click <strong>Investigate</strong> in the Triage page, the AI&apos;s verdict gets recorded here. When you then accept, flag, or mark unmappable, the audit row is updated with the action. Persistent — survives cache expiry and reviewable months later.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Filter by paramName…"
          value={filters.search}
          onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, search: e.target.value })); }}
          sx={{ minWidth: 240 }}
        />
        <Select
          size="small"
          displayEmpty
          value={filters.bucket}
          onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, bucket: e.target.value as Bucket | '' })); }}
          sx={{ minWidth: 180, fontSize: '0.8rem' }}
        >
          <MenuItem value="">All AI verdicts</MenuItem>
          {(Object.keys(BUCKET_COLOR) as Bucket[]).map((b) => (
            <MenuItem key={b} value={b} sx={{ fontSize: '0.8rem' }}>{BUCKET_COLOR[b].label}</MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          displayEmpty
          value={filters.action}
          onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, action: e.target.value as Action | '' | 'pending' | 'reverted' })); }}
          sx={{ minWidth: 200, fontSize: '0.8rem' }}
        >
          <MenuItem value="">All outcomes</MenuItem>
          <MenuItem value="pending" sx={{ fontSize: '0.8rem' }}>No action yet</MenuItem>
          <MenuItem value="reverted" sx={{ fontSize: '0.8rem' }}>Reverted</MenuItem>
          {(Object.keys(ACTION_COLOR) as Action[]).map((a) => (
            <MenuItem key={a} value={a} sx={{ fontSize: '0.8rem' }}>{ACTION_COLOR[a].label}</MenuItem>
          ))}
        </Select>
      </Stack>

      {error && (
        <Paper sx={{ p: 2, bgcolor: 'error.dark', color: 'error.contrastText', mb: 2 }}>
          {error}
        </Paper>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 160 }}>When</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>Who</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Param</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 120 }}>Scope</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>AI Verdict</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 90 }}>Conf.</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 200 }}>Outcome</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No investigations match these filters.
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => {
                const bucket = BUCKET_COLOR[r.bucket];
                const outcome = r.actionTaken ? ACTION_COLOR[r.actionTaken] : null;
                return (
                  <TableRow
                    key={r.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setDetail(r)}
                  >
                    <TableCell sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{formatTime(r.ranAt)}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{r.ranByName}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-word' }}>{r.paramName}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>
                      {r.scopeKind === 'none' ? <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span> : (
                        <span>
                          <Box component="span" sx={{ color: 'text.disabled', mr: 0.5 }}>{r.scopeKind === 'family' ? 'L3' : 'L2'}</Box>
                          {r.scopeKey}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={bucket.color} label={bucket.label} sx={{ fontSize: '0.65rem', height: 20 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{r.confidence}</TableCell>
                    <TableCell>
                      {outcome ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title={`Acted ${formatTime(r.actionAt)}`}>
                            <Chip
                              size="small"
                              color={r.revertedAt ? 'default' : outcome.color}
                              label={outcome.label}
                              variant="outlined"
                              sx={{
                                fontSize: '0.65rem',
                                height: 20,
                                textDecoration: r.revertedAt ? 'line-through' : undefined,
                                opacity: r.revertedAt ? 0.6 : 1,
                              }}
                            />
                          </Tooltip>
                          {r.revertedAt && (
                            <Tooltip title={`Reverted ${formatTime(r.revertedAt)} by ${r.revertedByName ?? 'Unknown'}`}>
                              <Chip
                                size="small"
                                color="warning"
                                label="Reverted"
                                sx={{ fontSize: '0.6rem', height: 18, fontWeight: 700 }}
                              />
                            </Tooltip>
                          )}
                        </Stack>
                      ) : (
                        <Chip size="small" label="Pending" variant="outlined" sx={{ fontSize: '0.65rem', height: 20, color: 'text.disabled' }} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pageCount > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination
            count={pageCount}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
            size="small"
          />
        </Box>
      )}

      <Drawer
        anchor="right"
        open={!!detail}
        onClose={() => setDetail(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: 720 }, maxWidth: '100vw' } }}
      >
        {detail && (
          <InvestigationDetail
            row={detail}
            onClose={() => setDetail(null)}
            onReverted={(id) => {
              // Optimistic: stamp the visible row + the drawer's row with
              // reverted metadata. The next refetch will pull authoritative
              // timestamps + admin name from the server.
              const now = new Date().toISOString();
              setItems((prev) => prev.map((it) => it.id === id ? { ...it, revertedAt: now, revertedBy: it.ranBy, revertedByName: 'You' } : it));
              setDetail((prev) => (prev && prev.id === id) ? { ...prev, revertedAt: now, revertedBy: prev.ranBy, revertedByName: 'You' } : prev);
            }}
          />
        )}
      </Drawer>
    </Box>
  );
}

function InvestigationDetail({
  row,
  onClose,
  onReverted,
}: {
  row: InvestigationRow;
  onClose: () => void;
  onReverted: (id: string) => void;
}) {
  const bucket = BUCKET_COLOR[row.bucket];
  const outcome = row.actionTaken ? ACTION_COLOR[row.actionTaken] : null;
  const canRevert = !!row.actionTaken && !row.revertedAt;
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  const handleRevert = useCallback(async () => {
    if (!canRevert) return;
    const confirmMsg =
      row.actionTaken === 'override_created'
        ? `Revert the override created for "${row.paramName}"? The override will be deactivated and the row returns to the Triage queue. Reversible from the Atlas Dictionaries panel.`
        : row.actionTaken === 'flagged_wrong_family'
          ? `Revert the wrong-family flag on "${row.paramName}"? The row returns to the Triage queue with the auto-flag potentially re-firing on next render.`
          : row.actionTaken === 'marked_unmappable'
            ? `Un-mark "${row.paramName}" as unmappable? The row returns to the Triage queue for re-review.`
            : `Revert the action on "${row.paramName}"?`;
    if (!window.confirm(confirmMsg)) return;
    setReverting(true);
    setRevertError(null);
    try {
      const res = await fetch(`/api/admin/atlas/triage-investigations/${row.id}/revert`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(json as { success?: boolean }).success) {
        throw new Error((json as { error?: string }).error || `Revert failed (${res.status})`);
      }
      onReverted(row.id);
    } catch (err) {
      setRevertError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setReverting(false);
    }
  }, [canRevert, row, onReverted]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ flex: 1, fontFamily: 'monospace' }}>{row.paramName}</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary">When &amp; Who</Typography>
          <Typography variant="body2">{formatTime(row.ranAt)} · {row.ranByName}</Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">Scope</Typography>
          <Typography variant="body2">
            {row.scopeKind === 'none' ? (
              <Box component="span" sx={{ color: 'warning.main' }}>No scope (unscoped row)</Box>
            ) : (
              <span>
                <Box component="span" sx={{ color: 'text.disabled', mr: 0.5 }}>{row.scopeKind === 'family' ? 'L3 family' : 'L2 category'}:</Box>
                {row.scopeKey}
              </span>
            )}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">AI Verdict</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" color={bucket.color} label={bucket.label} />
            <Chip size="small" variant="outlined" label={`Confidence: ${row.confidence}`} />
          </Stack>
        </Box>

        {row.summary && (
          <Box>
            <Typography variant="caption" color="text.secondary">Summary</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.summary}</Typography>
          </Box>
        )}

        {row.prose && (
          <Box>
            <Typography variant="caption" color="text.secondary">Reasoning</Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>{row.prose}</Typography>
          </Box>
        )}

        {row.primaryActionLabel && (
          <Box>
            <Typography variant="caption" color="text.secondary">Proposed action</Typography>
            <Typography variant="body2">{row.primaryActionLabel}</Typography>
          </Box>
        )}

        <Box>
          <Typography variant="caption" color="text.secondary">Engineer outcome</Typography>
          {outcome ? (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  color={row.revertedAt ? 'default' : outcome.color}
                  label={outcome.label}
                  variant="outlined"
                  sx={{ textDecoration: row.revertedAt ? 'line-through' : undefined, opacity: row.revertedAt ? 0.6 : 1 }}
                />
                <Typography variant="caption" color="text.secondary">{formatTime(row.actionAt)}</Typography>
                {row.resultingOverrideId && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    → override {row.resultingOverrideId.slice(0, 8)}…
                  </Typography>
                )}
              </Stack>
              {row.revertedAt && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" color="warning" label="Reverted" sx={{ fontWeight: 700 }} />
                  <Typography variant="caption" color="text.secondary">
                    {formatTime(row.revertedAt)} by {row.revertedByName ?? 'Unknown'}
                  </Typography>
                </Stack>
              )}
              {canRevert && (
                <Stack spacing={0.5}>
                  <Tooltip title={
                    row.actionTaken === 'override_created'
                      ? 'Deactivate the dictionary override and send this row back to the Triage queue.'
                      : row.actionTaken === 'flagged_wrong_family'
                        ? 'Clear the wrong-family flag and send this row back to the Triage queue.'
                        : row.actionTaken === 'marked_unmappable'
                          ? 'Un-mark as unmappable and send this row back to the Triage queue.'
                          : 'Revert this action.'
                  }>
                    <span>
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label={reverting ? 'Reverting…' : 'Revert → send back to Triage'}
                        onClick={reverting ? undefined : handleRevert}
                        sx={{ cursor: reverting ? 'wait' : 'pointer', fontSize: '0.7rem', height: 22 }}
                      />
                    </span>
                  </Tooltip>
                  {revertError && (
                    <Typography variant="caption" color="error">{revertError}</Typography>
                  )}
                </Stack>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.disabled">No action yet — verdict was generated but the engineer didn&apos;t commit a follow-up.</Typography>
          )}
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">Raw AI response (replay / debug)</Typography>
          <Paper variant="outlined" sx={{ p: 1, bgcolor: 'background.default', overflow: 'auto', maxHeight: 320 }}>
            <pre style={{ margin: 0, fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(row.rawResponse, null, 2)}
            </pre>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
