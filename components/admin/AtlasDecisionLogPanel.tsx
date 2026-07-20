'use client';

/**
 * AtlasDecisionLogPanel — every decision made about an Atlas Triage
 * parameter, newest first, with the evidence that informed it.
 *
 * REPLACES the AI Investigation Log, which showed only decisions routed
 * through the AI Investigate drawer: 65 of 2,032 accepted mappings and none
 * of the 80 deferred params. A surface named for decisions has to contain
 * them all, so the decision is the record here and the AI verdict is one
 * optional input to it.
 *
 * TWO THINGS THE USER ASKED FOR, both load-bearing:
 *   1. Newest at the top — the point is to find what you just did. Sorting is
 *      done by the SERVER (see the route); sorting a page slice here would
 *      reorder 50 arbitrary rows and look right while being wrong.
 *   2. Act on a decision from this page — Undo, single or bulk.
 *
 * APPEND-ONLY. Undo never edits or removes the original entry; it performs
 * the reversal and appends a new one, so the log reads "Accepted 09:00 →
 * Reverted 09:05". That is why there is no delete affordance anywhere here.
 *
 * RECONSTRUCTED vs OBSERVED. Rows carrying source='backfill' were rebuilt
 * from records that already existed rather than recorded as they happened,
 * and they are marked as such. Reconstructed history must never be presented
 * as observed history — see the tooltip on the chip.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Pagination,
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
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useTranslation } from 'react-i18next';
import { paramUid } from '@/lib/services/paramUid';
// Client-safe module by design — paramDecisionLog imports createServiceClient
// (SUPABASE_SERVICE_ROLE_KEY) and must never reach a client bundle.
import {
  isUndoableDecision,
  undoRefusalReason,
  type ParamDecisionType,
} from '@/lib/services/paramDecisionTypes';

const PAGE_SIZE = 50;
/** How many history entries the drawer requests. Anything beyond this is
 *  REPORTED, never silently dropped — see the drawer's footer. */
const HISTORY_LIMIT = 100;
/** Search is a per-keystroke refetch against a growing table; wait for a
 *  pause before firing. */
const SEARCH_DEBOUNCE_MS = 300;

type DecisionType = ParamDecisionType;

export interface DecisionItem {
  id: string;
  paramName: string;
  paramKey: string;
  familyId: string | null;
  category: string | null;
  decision: DecisionType;
  note: string | null;
  hasEvidence: boolean;
  evidence?: Record<string, unknown> | null;
  attributeId: string | null;
  attributeName: string | null;
  overrideId: string | null;
  investigationId: string | null;
  batchId: string | null;
  source: 'ui' | 'batch' | 'script' | 'backfill';
  decidedBy: string;
  decidedByName: string;
  decidedAt: string;
}

/** Plain-language label + colour per decision. The wording is deliberately
 *  what a person would say happened, not the enum. */
const DECISION_META: Record<
  DecisionType,
  { label: string; color: 'success' | 'info' | 'error' | 'warning' | 'default' | 'primary' }
> = {
  mapping_accepted: { label: 'Mapped', color: 'success' },
  mapping_edited: { label: 'Re-mapped', color: 'info' },
  mapping_revoked: { label: 'Mapping removed', color: 'error' },
  deferred: { label: 'Deferred', color: 'warning' },
  reopened: { label: 'Reopened', color: 'primary' },
  marked_unmappable: { label: 'Marked unmappable', color: 'default' },
  flagged_wrong_family: { label: 'Flagged wrong family', color: 'error' },
  confirmed_in_family: { label: 'Confirmed in family', color: 'success' },
  note_added: { label: 'Note added', color: 'default' },
  note_cleared: { label: 'Note erased', color: 'warning' },
  flag_toggled: { label: 'Bookmarked', color: 'default' },
};

/**
 * The date this entry was decided.
 *
 * The YEAR is not optional here. This log spans months and holds
 * reconstructed rows dated back to May, so dropping it renders a 2026 entry
 * and a 2027 entry identically — on the one surface whose job is "find the
 * decision I just made and act on it", where acting on the wrong row is the
 * failure. The panel this replaced included the year; the rewrite lost it.
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Turn an undo response into ONE message that reports the whole arithmetic.
 *
 * Pure so it can be tested; previously this was inline and had two defects
 * that only show up on a partial failure — the moment a user most needs to be
 * told the truth. It quoted `skipped[0].reason` as if every skip shared it,
 * and the log-write warning OVERWROTE the skip message instead of joining it,
 * so "undid 3 of 5" silently became "the log entry could not be written" and
 * the user concluded all five reverted.
 */
export function buildUndoMessage(
  requested: number,
  undone: number,
  skipped: Array<{ reason: string }>,
  logged: boolean,
): { severity: 'success' | 'warning'; text: string } {
  // Distinct reasons, each with its own count — heterogeneous skips are the
  // normal case (one "already inactive", one "no such decision").
  const byReason = new Map<string, number>();
  for (const s of skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
  const reasons = [...byReason.entries()]
    .map(([reason, n]) => (n > 1 ? `${n}× ${reason}` : reason))
    .join('; ');

  const parts: string[] = [];
  if (undone === 0) parts.push('Nothing was undone.');
  else if (skipped.length > 0) parts.push(`Undid ${undone} of ${requested}.`);
  else parts.push(`Undid ${undone} ${undone === 1 ? 'decision' : 'decisions'}.`);

  if (skipped.length > 0) parts.push(`${skipped.length} skipped — ${reasons}`);
  // Appended, never substituted: this is additional bad news, not a
  // replacement for the count above.
  if (!logged) parts.push('The log entry for this undo could not be written — check the server logs.');

  return {
    severity: undone === 0 || skipped.length > 0 || !logged ? 'warning' : 'success',
    text: parts.join(' '),
  };
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

/** Consecutive rows from the same Batch Accept collapse into one line.
 *  One batch already wrote 54 rows — newest-first, that single click would
 *  otherwise bury an entire day of other work. The rows are still stored and
 *  filtered individually (per-parameter history is the whole point); only the
 *  display collapses. */
export type Group =
  | { kind: 'single'; row: DecisionItem }
  | { kind: 'batch'; batchId: string; rows: DecisionItem[]; totalInBatch: number };

/**
 * Exported for unit test. Verified against live data (July 2026): under the
 * route's `decided_at DESC, id DESC` ordering, rows sharing a batch_id are
 * CONTIGUOUS — 7 distinct batches in the newest 200 rows, none fragmented —
 * which is what makes a consecutive-run scan sufficient. One of those batches
 * holds 55 rows against a 50-row page, so the straddle case below is real.
 */
export function groupRows(rows: DecisionItem[], batchCounts: Record<string, number>): Group[] {
  const out: Group[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (!row.batchId) {
      out.push({ kind: 'single', row });
      i++;
      continue;
    }
    const batchId = row.batchId;
    const run: DecisionItem[] = [];
    while (i < rows.length && rows[i].batchId === batchId) {
      run.push(rows[i]);
      i++;
    }
    // A run of one is not worth a collapse affordance.
    if (run.length === 1) out.push({ kind: 'single', row: run[0] });
    else out.push({ kind: 'batch', batchId, rows: run, totalInBatch: batchCounts[batchId] ?? run.length });
  }
  return out;
}

export default function AtlasDecisionLogPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<DecisionItem[]>([]);
  const [batchCounts, setBatchCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState<DecisionType | ''>('');
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<'' | 'today' | 'week' | 'mine'>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // TWO sets, not one. These previously shared a single `expanded` Set keyed
  // by batch id and by `ev-<id>`, coupling table expansion to drawer
  // expansion through one collision-prone namespace and one setter.
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DecisionItem | null>(null);
  const [history, setHistory] = useState<DecisionItem[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  // Debounced mirror of `search` — the value actually sent to the server.
  const [searchDebounced, setSearchDebounced] = useState('');
  // Monotonic request ids. A slower earlier response must never overwrite a
  // newer one: typing "voltage" fires a request per keystroke, and if "vo"
  // returns after "voltage" the table shows rows that don't match what is in
  // the box, with nothing on screen to reveal it.
  const listReqRef = useRef(0);
  const detailReqRef = useRef(0);
  const [confirmUndo, setConfirmUndo] = useState<DecisionItem[] | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [toast, setToast] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Debounce the search box so a 7-character word is one request, not seven.
  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(page * PAGE_SIZE));
    if (decision) sp.set('decision', decision);
    if (searchDebounced.trim()) sp.set('param_name', searchDebounced.trim());
    if (quick === 'mine') sp.set('mine', '1');
    if (quick === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      sp.set('since', d.toISOString());
    }
    if (quick === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      sp.set('since', d.toISOString());
    }
    return sp.toString();
  }, [page, decision, searchDebounced, quick]);

  const fetchRows = useCallback(async () => {
    const reqId = ++listReqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/atlas/param-decisions?${queryString}`, { cache: 'no-store' });
      const json = await res.json();
      // A newer request started while this one was in flight — drop this
      // result rather than painting stale rows over fresher ones.
      if (reqId !== listReqRef.current) return;
      if (!res.ok || !json.success) throw new Error(json.error || `Fetch failed (${res.status})`);
      setItems(json.items ?? []);
      setBatchCounts(json.batchCounts ?? {});
      setTotal(json.total ?? 0);
      setSelected(new Set());
    } catch (err) {
      if (reqId !== listReqRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (reqId === listReqRef.current) setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /** Per-parameter history — every decision ever made about THIS param. */
  const openDetail = useCallback(async (row: DecisionItem) => {
    const reqId = ++detailReqRef.current;
    setDetail(row);
    setHistory(null);
    setHistoryTotal(0);
    try {
      const sp = new URLSearchParams({
        param_name: row.paramKey,
        // EXACT, not substring. Without this the drawer answered a different
        // question than its own heading asked: on live data 95 of 823 params
        // (12%) are a substring of another, so "aec-q" listed aec-q100
        // compliance / aec-q100 compliant / aec-q101 as its own history, and
        // "io" pooled 89 distinct parameters into one timeline.
        param_exact: '1',
        limit: String(HISTORY_LIMIT),
        include_evidence: '1',
      });
      const res = await fetch(`/api/admin/atlas/param-decisions?${sp}`, { cache: 'no-store' });
      const json = await res.json();
      // Clicking a second row while the first is in flight must not pair
      // row B's header with row A's history.
      if (reqId !== detailReqRef.current) return;
      if (res.ok && json.success) {
        setHistory(json.items ?? []);
        setHistoryTotal(json.total ?? 0);
      } else {
        setHistory([]);
      }
    } catch {
      if (reqId === detailReqRef.current) setHistory([]);
    }
  }, []);

  const runUndo = useCallback(async (rows: DecisionItem[]) => {
    setUndoing(true);
    try {
      const res = await fetch('/api/admin/atlas/param-decisions/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionIds: rows.map((r) => r.id) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Undo failed');

      // ONE message covering the whole outcome — count, every distinct skip
      // reason, and any log-write failure. Built by a pure, tested function
      // because the inline version dropped information exactly when the user
      // most needed it (see buildUndoMessage).
      setToast(
        buildUndoMessage(rows.length, json.undone ?? 0, json.skipped ?? [], json.logged !== false),
      );
      setConfirmUndo(null);
      await fetchRows();
    } catch (err) {
      setToast({ severity: 'error', text: err instanceof Error ? err.message : 'Undo failed' });
    } finally {
      setUndoing(false);
    }
  }, [fetchRows]);

  const groups = useMemo(() => groupRows(items, batchCounts), [items, batchCounts]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedRows = useMemo(() => items.filter((r) => selected.has(r.id)), [items, selected]);
  const selectedUndoable = useMemo(() => selectedRows.filter((r) => isUndoableDecision(r.decision)), [selectedRows]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleBatch = (id: string) =>
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleEvidence = (id: string) =>
    setExpandedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (r: DecisionItem, opts: { nested?: boolean } = {}) => {
    const meta = DECISION_META[r.decision] ?? { label: r.decision, color: 'default' as const };
    const refusal = undoRefusalReason(r.decision);
    return (
      <TableRow
        key={r.id}
        hover
        sx={{ cursor: 'pointer', '& td': opts.nested ? { bgcolor: 'action.hover' } : undefined }}
        onClick={() => openDetail(r)}
      >
        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
          <Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
          {formatTime(r.decidedAt)}
          {isToday(r.decidedAt) && (
            <Chip label="today" size="small" sx={{ ml: 0.75, height: 16, fontSize: '0.6rem' }} />
          )}
        </TableCell>
        <TableCell sx={{ fontSize: '0.78rem' }}>{r.decidedByName}</TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Tooltip title={`Copy ${paramUid(r.paramName)} — paste into Triage search to find this row again`}>
            <Chip
              label={paramUid(r.paramName)}
              size="small"
              variant="outlined"
              onClick={() => navigator.clipboard?.writeText(paramUid(r.paramName))}
              sx={{ height: 20, fontFamily: 'monospace', fontSize: '0.68rem' }}
            />
          </Tooltip>
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 200 }}>{r.paramName}</TableCell>
        <TableCell sx={{ fontSize: '0.75rem' }}>{r.familyId ?? r.category ?? '—'}</TableCell>
        <TableCell>
          <Chip label={meta.label} size="small" color={meta.color} sx={{ height: 20, fontSize: '0.68rem' }} />
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.72rem', maxWidth: 180 }}>
          {r.attributeId ?? '—'}
        </TableCell>
        <TableCell sx={{ fontSize: '0.72rem', maxWidth: 220 }}>
          <Typography variant="inherit" noWrap title={r.note ?? ''}>
            {r.note ?? '—'}
          </Typography>
        </TableCell>
        <TableCell>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {r.hasEvidence && (
              <Tooltip title="An AI analysis informed this decision — open the row to read it">
                <AutoAwesomeIcon fontSize="inherit" color="primary" />
              </Tooltip>
            )}
            {r.source === 'backfill' && (
              <Tooltip title="Reconstructed from existing records rather than recorded as it happened. Status history before the log went live shows only the most recent state.">
                <Chip label="rebuilt" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
              </Tooltip>
            )}
          </Stack>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()} align="right">
          <Tooltip title={refusal ?? 'Undo this decision'}>
            {/* span so the tooltip still fires on a disabled button */}
            <span>
              <IconButton size="small" disabled={!!refusal} onClick={() => setConfirmUndo([r])}>
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box sx={{ px: 3, pt: 2, pb: 4 }}>
      <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mb: 1 }}>
        <Typography variant="h6">{t('admin.decisionLog.title', 'Decision Log')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {total.toLocaleString()} {total === 1 ? 'decision' : 'decisions'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Reload from server">
          <IconButton size="small" onClick={fetchRows} disabled={loading}>
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every decision made about a Triage parameter — mapped, deferred, marked unmappable, flagged, noted — newest
        first, with the AI analysis and notes that informed it. Nothing here is ever edited or deleted: undoing a
        decision performs the reversal and adds a new entry, so the record reads <em>Mapped → Removed</em> rather
        than quietly changing.
      </Typography>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Search parameter…"
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
          sx={{ minWidth: 220 }}
        />
        <Select
          size="small"
          displayEmpty
          value={decision}
          onChange={(e) => {
            setPage(0);
            setDecision(e.target.value as DecisionType | '');
          }}
          sx={{ minWidth: 200, fontSize: '0.8rem' }}
        >
          <MenuItem value="">All decisions</MenuItem>
          {(Object.keys(DECISION_META) as DecisionType[]).map((d) => (
            <MenuItem key={d} value={d} sx={{ fontSize: '0.8rem' }}>
              {DECISION_META[d].label}
            </MenuItem>
          ))}
        </Select>
        {(['today', 'week', 'mine'] as const).map((q) => (
          <Chip
            key={q}
            label={q === 'today' ? 'Today' : q === 'week' ? 'Last 7 days' : 'Mine'}
            size="small"
            color={quick === q ? 'primary' : 'default'}
            variant={quick === q ? 'filled' : 'outlined'}
            onClick={() => {
              setPage(0);
              setQuick((cur) => (cur === q ? '' : q));
            }}
          />
        ))}
      </Stack>

      {selectedRows.length > 0 && (
        <Paper sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2">
            {selectedRows.length} selected
            {selectedUndoable.length !== selectedRows.length && (
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}
                · {selectedRows.length - selectedUndoable.length} cannot be undone here
              </Typography>
            )}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<UndoIcon />}
            disabled={selectedUndoable.length === 0}
            onClick={() => setConfirmUndo(selectedUndoable)}
          >
            Undo {selectedUndoable.length}
          </Button>
        </Paper>
      )}

      {error && (
        <Paper sx={{ p: 2, bgcolor: 'error.dark', color: 'error.contrastText', mb: 2 }}>{error}</Paper>
      )}
      {toast && (
        <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ mb: 2 }}>
          {toast.text}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell sx={{ fontWeight: 600, width: 130 }}>When</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 110 }}>Who</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 80 }}>UID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Parameter</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 80 }}>Scope</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 150 }}>Decision</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 160 }}>Mapped to</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Note</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 80 }} />
              <TableCell sx={{ fontWeight: 600, width: 50 }} align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No decisions match these filters.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => {
                if (g.kind === 'single') return renderRow(g.row);
                const open = expandedBatches.has(g.batchId);
                const undoableInRun = g.rows.filter((r) => isUndoableDecision(r.decision));
                const partial = g.rows.length < g.totalInBatch;
                return (
                  // Fragment carries the key — a keyless fragment from a
                  // .map() makes React re-key the whole list on every render.
                  <Fragment key={g.batchId}>
                    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => toggleBatch(g.batchId)}>
                      <TableCell padding="checkbox">
                        {open ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {formatTime(g.rows[0].decidedAt)}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{g.rows[0].decidedByName}</TableCell>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Batch — {g.totalInBatch} parameters mapped at once
                          {partial && (
                            <Typography component="span" variant="caption" color="text.secondary">
                              {' '}
                              ({g.rows.length} on this page)
                            </Typography>
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell />
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip
                          title={
                            partial
                              ? `Undo the ${undoableInRun.length} shown on this page`
                              : `Undo all ${undoableInRun.length}`
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={undoableInRun.length === 0}
                              onClick={() => setConfirmUndo(undoableInRun)}
                            >
                              <UndoIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                    {open && g.rows.map((r) => renderRow(r, { nested: true }))}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pageCount > 1 && (
        <Stack alignItems="center" sx={{ mt: 2 }}>
          <Pagination
            count={pageCount}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
            size="small"
          />
        </Stack>
      )}

      {/* ── Confirm undo ───────────────────────────────────────────────── */}
      <Dialog open={!!confirmUndo} onClose={() => !undoing && setConfirmUndo(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Undo {confirmUndo?.length === 1 ? 'this decision' : `${confirmUndo?.length} decisions`}?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {confirmUndo?.length === 1 && confirmUndo[0] && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>{DECISION_META[confirmUndo[0].decision]?.label}</strong> · {confirmUndo[0].paramName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Decided {formatTime(confirmUndo[0].decidedAt)} by {confirmUndo[0].decidedByName}
                </Typography>
              </Box>
            )}
            {/* Undo has no time limit — it works off exact ids, so a decision
                from months ago is reversible. Correct for an audit surface,
                but the age has to be visible so a stale bulk undo isn't fired
                by reflex. */}
            {confirmUndo && confirmUndo.some((r) => !isToday(r.decidedAt)) && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {confirmUndo.length === 1
                  ? 'This decision was not made today.'
                  : 'Some of these were not made today.'}{' '}
                Undo is not time-limited — check the dates above before continuing.
              </Alert>
            )}
            A mapping will be switched off and the parameter returned to the Triage queue. The original entry stays
            in the log exactly as it is; a new &ldquo;undone&rdquo; entry is added above it.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUndo(null)} disabled={undoing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={undoing}
            onClick={() => confirmUndo && runUndo(confirmUndo)}
          >
            {undoing ? 'Undoing…' : 'Undo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Detail: this decision + the param's full history ────────────── */}
      <Drawer anchor="right" open={!!detail} onClose={() => setDetail(null)}>
        <Box sx={{ width: 560, p: 3 }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ flex: 1, fontFamily: 'monospace', fontSize: '1rem' }}>
              {detail?.paramName}
            </Typography>
            <Tooltip title="Copy UID — paste into Triage search to find this row">
              <IconButton
                size="small"
                onClick={() => detail && navigator.clipboard?.writeText(paramUid(detail.paramName))}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setDetail(null)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          {detail && (
            <>
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Chip
                  label={DECISION_META[detail.decision]?.label ?? detail.decision}
                  size="small"
                  color={DECISION_META[detail.decision]?.color ?? 'default'}
                  sx={{ mb: 1 }}
                />
                <Typography variant="body2">
                  {detail.decidedByName} · {formatTime(detail.decidedAt)}
                </Typography>
                {detail.attributeId && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Mapped to <code>{detail.attributeId}</code>
                    {detail.attributeName ? ` (${detail.attributeName})` : ''}
                  </Typography>
                )}
                {detail.note && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                    {detail.note}
                  </Typography>
                )}
                {detail.source === 'backfill' && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Reconstructed from existing records, not recorded as it happened. Status changes before the log
                    went live show only the most recent state — earlier back-and-forth is not recoverable.
                  </Alert>
                )}
              </Paper>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {history && historyTotal > history.length
                  ? `Decisions about this parameter — showing the ${history.length} most recent of ${historyTotal}`
                  : 'Everything decided about this parameter'}
              </Typography>
              {history === null ? (
                <CircularProgress size={18} />
              ) : history.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nothing else recorded.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {history.map((h) => (
                    <Paper
                      key={h.id}
                      variant="outlined"
                      sx={{ p: 1.5, borderColor: h.id === detail.id ? 'primary.main' : undefined }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={DECISION_META[h.decision]?.label ?? h.decision}
                          size="small"
                          color={DECISION_META[h.decision]?.color ?? 'default'}
                          sx={{ height: 20, fontSize: '0.68rem' }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatTime(h.decidedAt)} · {h.decidedByName}
                          {h.familyId ? ` · ${h.familyId}` : ''}
                        </Typography>
                      </Stack>
                      {h.attributeId && (
                        <Typography variant="caption" display="block" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
                          {h.attributeId}
                        </Typography>
                      )}
                      {h.note && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {h.note}
                        </Typography>
                      )}
                      {h.evidence && (
                        <>
                          <Button size="small" onClick={() => toggleEvidence(h.id)} sx={{ mt: 0.5, px: 0 }}>
                            {expandedEvidence.has(h.id) ? 'Hide' : 'Show'} AI analysis
                          </Button>
                          <Collapse in={expandedEvidence.has(h.id)}>
                            <Box
                              component="pre"
                              sx={{
                                fontSize: '0.68rem',
                                bgcolor: 'action.hover',
                                p: 1,
                                borderRadius: 1,
                                overflow: 'auto',
                                maxHeight: 300,
                              }}
                            >
                              {JSON.stringify(h.evidence, null, 2)}
                            </Box>
                          </Collapse>
                        </>
                      )}
                    </Paper>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
