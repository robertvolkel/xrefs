'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
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
  Skeleton,
  InputAdornment,
  IconButton,
  Collapse,
  LinearProgress,
  Paper,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import { useTranslation } from 'react-i18next';
import AtlasExplorerTab from './AtlasExplorerTab';
import FlaggedProductsTab from './FlaggedProductsTab';
import { getAtlasFlags, syncAllMfrProfiles } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils/dateFormatting';

interface MfrListItem {
  id: number;
  // Source MFR identity from atlas_manufacturers.atlas_id (distinct from the
  // Supabase row PK `id`). Surfaced as the Atlas ID column. Null if unset.
  atlasId: number | null;
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
  // Weighted uplift to matching coverage if every currently-unmapped param
  // affecting this MFR's products were mapped. Null when the triage cache
  // was cold at compute time (UI renders "—" so the engineer knows the
  // signal hasn't loaded yet, not that the MFR is fully mapped).
  improvementPotentialPpt: number | null;
  improvementPotentialDetail: { unmappedParams: number; addressableSlots: number } | null;
  crossRefCount: number;
  lastProductUpdate: string | null;
  lastProfileUpdate: string | null;
  lastCrossRefUpdate: string | null;
  lastModified: string | null;
}

interface MfrListData {
  manufacturers: MfrListItem[];
  cachedAt?: string | null;
  stale?: boolean;
  summary: {
    totalManufacturers: number;
    withProducts: number;
    enabledWithProducts: number;
    totalProducts: number;
    scorableProducts: number;
    familiesCovered: number;
    // Unweighted mean coverage % across MFRs with scorable products, and the
    // count it was averaged over. Optional for back-compat with pre-v3 payloads.
    avgCoveragePct?: number;
    avgCoverageMfrCount?: number;
  };
}

type MfrSortKey = 'manufacturer' | 'atlasId' | 'productCount' | 'scorableCount' | 'coveragePct' | 'improvementPotentialPpt' | 'crossRefCount' | 'families' | 'lastModified';
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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Atlas translation backfill state — drives the "Refresh from accepts"
  // button + inline status badge. Polled every 10s while in-flight; idle
  // when null. See /api/admin/atlas/backfill-translations for the contract.
  const [backfillStatus, setBackfillStatus] = useState<{
    lastStartedAt: string;
    lastFinishedAt: string | null;
    scanned: number;
    changed: number;
    unchanged: number;
    missing: number;
    errors: number;
    exitCode: number | null;
    // Live progress (present only while in-flight; written by the script heartbeat)
    totalFiles?: number;
    processedFiles?: number;
    currentMfr?: string | null;
    recentMfrs?: Array<{ name: string; changed: number; unchanged: number; missing: number }>;
    heartbeatAt?: string;
  } | null>(null);
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  // Optimistic flag: keeps the progress panel open the instant the button is
  // clicked (before the POST returns / the route compiles in dev), so the user
  // gets immediate feedback instead of a dead 10-20s wait. Cleared once the run
  // resolves (real status takes over) or the start fails.
  const [backfillStarting, setBackfillStarting] = useState(false);

  useEffect(() => {
    getAtlasFlags('open').then((resp) => setFlaggedCount(resp.flags.length)).catch(() => {});
  }, []);

  const loadData = useCallback(async (forceRefresh: boolean) => {
    try {
      const res = await fetch(`/api/admin/manufacturers${forceRefresh ? '?refresh=1' : ''}`);
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.detail) detail = String(body.detail);
          else if (body?.error) detail = String(body.error);
        } catch {}
        setFetchError(detail);
        return;
      }
      const json = (await res.json()) as MfrListData;
      setData(json);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network error');
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  // ── Atlas translation backfill ──────────────────────────
  // Fetch current status (called on mount + after start + during in-flight
  // polling). Idempotent — just reads the admin_stats_cache status row.
  const fetchBackfillStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/atlas/backfill-translations', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setBackfillStatus(json.status ?? null);
    } catch {
      // Status read failure is non-fatal — button keeps working.
    }
  }, []);

  useEffect(() => {
    void fetchBackfillStatus();
  }, [fetchBackfillStatus]);

  // Poll every 10s while a run is in-flight. Stops automatically once
  // lastFinishedAt > lastStartedAt. Also reloads MFR list once when the
  // run completes so the coverage % column reflects the rewrite.
  useEffect(() => {
    if (!backfillStatus) return;
    const inFlight = !backfillStatus.lastFinishedAt;
    if (!inFlight) return;
    const interval = setInterval(async () => {
      const before = backfillStatus.lastFinishedAt;
      await fetchBackfillStatus();
      // After fetch, the closure-captured backfillStatus is stale; the
      // setter inside fetchBackfillStatus already wrote the new value, so
      // checking `before` against the latest from a re-fetched read isn't
      // worth it here. Instead let the next render's effect re-evaluate
      // `inFlight` and tear down on the next cycle.
      void before;
    }, 1_500);
    return () => clearInterval(interval);
  }, [backfillStatus, fetchBackfillStatus]);

  // Side-effect: when the run completes (lastFinishedAt transitions from
  // null → set), refresh the MFR list so coverage % updates. The cache
  // invalidation on the script side already deleted the L2 row; this
  // just kicks the UI fetch. Tracked via ref so the transition detection
  // doesn't fire on every render.
  const prevFinishedAtRef = useRef<string | null>(null);
  // Tracks whether we observed this run while it was in-flight, so we only show
  // the "complete" toast for a run that finished WHILE the user watched — not for
  // a pre-existing finished row that's simply present on mount. Set in render
  // (see backfillInFlight below).
  const sawInFlightRef = useRef(false);
  // Holds the data the progress panel renders: an optimistic placeholder the
  // instant the button is clicked, then live heartbeat snapshots, then the last
  // in-flight snapshot retained through the Collapse exit animation.
  const backfillProgressRef = useRef<typeof backfillStatus>(null);
  useEffect(() => {
    const cur = backfillStatus?.lastFinishedAt ?? null;
    if (cur && cur !== prevFinishedAtRef.current) {
      // Run just finished. If we watched it run, replace the stale "started…"
      // banner with an explicit completion message (the badge alone is too quiet).
      if (sawInFlightRef.current) {
        const changed = backfillStatus?.changed ?? 0;
        const errors = backfillStatus?.errors ?? 0;
        setBackfillMessage(
          `Backfill complete — ${changed.toLocaleString()} product${changed === 1 ? '' : 's'} updated${errors ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''}.`,
        );
        sawInFlightRef.current = false;
      }
      // Serve the cached stats (which always exist) rather than forcing a
      // synchronous cold recompute (?refresh=1) that can hang under post-backfill
      // load and surface "Stats failed to refresh". The backfill route already
      // kicked a background SWR recompute (invalidateManufacturersListCache), so
      // fresh coverage lands shortly and shows on the next read.
      void loadData(false);
    }
    prevFinishedAtRef.current = cur;
  }, [backfillStatus?.lastFinishedAt, backfillStatus, loadData]);

  const handleRunBackfill = useCallback(async () => {
    setBackfillSubmitting(true);
    setBackfillMessage(null);
    // Optimistic: render the panel immediately with a "Starting…" placeholder so
    // the user gets instant feedback during the POST + script cold-start window.
    // This placeholder has lastFinishedAt: null and no progress fields, so the
    // panel shows "Starting…" + indeterminate bar until the first real heartbeat
    // (or a real in-flight status) replaces it. It deliberately does NOT set
    // backfillStatus, so the completion-toast logic (keyed on real status) is
    // untouched.
    backfillProgressRef.current = {
      lastStartedAt: new Date().toISOString(),
      lastFinishedAt: null,
      scanned: 0, changed: 0, unchanged: 0, missing: 0, errors: 0,
      exitCode: null,
    };
    setBackfillStarting(true);
    try {
      const res = await fetch('/api/admin/atlas/backfill-translations', { method: 'POST' });
      const json = await res.json();
      if (res.status === 202) {
        setBackfillMessage('Backfill started — coverage will update in a few minutes.');
        await fetchBackfillStatus();
      } else if (res.status === 409) {
        setBackfillMessage('A backfill is already running — please wait.');
        await fetchBackfillStatus(); // sync the panel to the run that's actually going
      } else {
        setBackfillMessage(`Start failed: ${json?.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setBackfillMessage(`Start failed: ${err instanceof Error ? err.message : 'network error'}`);
    } finally {
      setBackfillSubmitting(false);
      setBackfillStarting(false); // real status (if any) now drives the panel
    }
  }, [fetchBackfillStatus]);

  const handleSyncProfiles = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncAllMfrProfiles();
      setSyncResult(`Synced ${result.updated} profiles (${result.skipped} unchanged, ${result.errors} errors)`);
      // Refresh the stats to reflect updated data
      await loadData(true);
    } catch (err) {
      setSyncResult(`Sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

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
        case 'atlasId': return dir * ((a.atlasId ?? -Infinity) - (b.atlasId ?? -Infinity));
        case 'productCount': return dir * (a.productCount - b.productCount);
        case 'scorableCount': return dir * (a.scorableCount - b.scorableCount);
        case 'coveragePct': return dir * (a.coveragePct - b.coveragePct);
        case 'improvementPotentialPpt': {
          // Sort order on DESC: real values > 0 first (engineer's queue),
          // then real zeros (in queue but fully mapped), then non-scorable
          // and cache-cold MFRs (which render "—" — least informative).
          // Use widely-spaced sentinels so equal-zero MFRs stay grouped
          // together and don't accidentally tie-break against "—".
          const score = (m: MfrListItem): number => {
            if (m.scorableCount === 0) return -2;
            if (m.improvementPotentialPpt === null || m.improvementPotentialPpt === undefined) return -1;
            return m.improvementPotentialPpt;
          };
          return dir * (score(a) - score(b));
        }
        case 'crossRefCount': return dir * (a.crossRefCount - b.crossRefCount);
        case 'families': return dir * (a.families.length - b.families.length);
        case 'lastModified': {
          const av = a.lastModified ?? '';
          const bv = b.lastModified ?? '';
          return dir * av.localeCompare(bv);
        }
        default: return 0;
      }
    });
    return list;
  }, [data, sortKey, sortDir, search]);

  // Snapshot the last in-flight backfill status so the progress panel keeps its
  // content (currentMfr/recentMfrs/totalFiles) through the Collapse EXIT
  // animation. On completion the route's `close` write drops those progress-only
  // fields, so rendering straight from `backfillStatus` would blank the panel
  // before it could animate closed. Render-phase ref capture is the standard
  // "remember previous value" pattern.
  const backfillInFlight = !!(backfillStatus && !backfillStatus.lastFinishedAt);
  if (backfillInFlight) {
    backfillProgressRef.current = backfillStatus;
    sawInFlightRef.current = true; // so the completion effect knows to toast "complete"
  }
  const backfillProgress = backfillProgressRef.current;

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
          {!data && fetchError ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={handleRefresh} disabled={refreshing}>
                  {refreshing ? 'Retrying…' : 'Retry'}
                </Button>
              }
            >
              Stats unavailable: {fetchError}
            </Alert>
          ) : !data ? (
            <ManufacturersPanelSkeleton />
          ) : (
            <Box>
              {(() => {
                const looksPoisoned = data.summary.totalManufacturers > 0 && data.summary.totalProducts === 0;
                const showBanner = data.stale || !!fetchError || looksPoisoned;
                if (!showBanner) return null;
                const msg = fetchError
                  ? `Stats failed to refresh (${fetchError}) — showing last known good data.`
                  : data.stale
                    ? 'Stats failed to refresh — showing last known good data.'
                    : 'Product counts look wrong (every manufacturer shows zero). The stats aggregation may have failed. Try Refresh.';
                return (
                  <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={
                      <Button color="inherit" size="small" onClick={handleRefresh} disabled={refreshing}>
                        {refreshing ? 'Retrying…' : 'Retry'}
                      </Button>
                    }
                  >
                    {msg}
                  </Alert>
                );
              })()}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {`${data.summary.withProducts} manufacturers with products · ${data.summary.totalProducts.toLocaleString()} products · ${data.summary.scorableProducts.toLocaleString()} scorable · ${data.summary.familiesCovered} families`}
                  {typeof data.summary.avgCoveragePct === 'number' && (
                    <>
                      {' · '}
                      <Tooltip
                        title={`Unweighted average of each manufacturer's coverage %, across the ${(data.summary.avgCoverageMfrCount ?? 0).toLocaleString()} manufacturers with scorable products. Every manufacturer counts equally regardless of size — this is "the typical manufacturer is X% covered", not the dataset-wide weighted coverage.`}
                      >
                        <Box
                          component="span"
                          sx={{ borderBottom: '1px dotted', borderColor: 'text.disabled', cursor: 'help' }}
                        >
                          {`${data.summary.avgCoveragePct}% average coverage`}
                        </Box>
                      </Tooltip>
                    </>
                  )}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  {data.cachedAt && (
                    <Tooltip title={new Date(data.cachedAt).toLocaleString()}>
                      <Typography variant="caption" color="text.secondary">
                        Computed {formatRelativeTime(data.cachedAt)}
                      </Typography>
                    </Tooltip>
                  )}
                  {/* Backfill status badge — shown when there's any history
                      to report. Counts come from the most-recent run's
                      parsed summary; relative time tells the engineer how
                      long since the coverage column reflected today's
                      accepts. Decision #200. */}
                  {backfillStatus?.lastFinishedAt && (
                    <Tooltip
                      arrow
                      title={`Last backfill: ${new Date(backfillStatus.lastFinishedAt).toLocaleString()} — ${backfillStatus.changed.toLocaleString()} of ${backfillStatus.scanned.toLocaleString()} products updated${backfillStatus.errors > 0 ? `, ${backfillStatus.errors} errors` : ''}`}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Backfill {formatRelativeTime(backfillStatus.lastFinishedAt)} · {backfillStatus.changed.toLocaleString()} changed
                      </Typography>
                    </Tooltip>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<BuildOutlinedIcon fontSize="small" />}
                    onClick={handleRunBackfill}
                    disabled={
                      backfillSubmitting ||
                      (backfillStatus && !backfillStatus.lastFinishedAt) ||
                      false
                    }
                    sx={{ textTransform: 'none' }}
                  >
                    {backfillSubmitting
                      ? 'Starting…'
                      : backfillStatus && !backfillStatus.lastFinishedAt
                        ? 'Backfilling…'
                        : 'Refresh from accepts'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SyncIcon fontSize="small" />}
                    onClick={handleSyncProfiles}
                    disabled={syncing || refreshing}
                    sx={{ textTransform: 'none' }}
                  >
                    {syncing ? 'Syncing Profiles…' : 'Sync Profiles'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RefreshIcon fontSize="small" />}
                    onClick={handleRefresh}
                    disabled={refreshing || syncing}
                    sx={{ textTransform: 'none' }}
                  >
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </Button>
                </Box>
              </Box>
              {syncResult && (
                <Alert severity={syncResult.includes('failed') ? 'error' : 'success'} sx={{ mb: 2 }} onClose={() => setSyncResult(null)}>
                  {syncResult}
                </Alert>
              )}
              {backfillMessage && (
                <Alert
                  severity={backfillMessage.startsWith('Start failed') ? 'error' : 'info'}
                  sx={{ mb: 2 }}
                  onClose={() => setBackfillMessage(null)}
                >
                  {backfillMessage}
                </Alert>
              )}

              {/* Live backfill progress — inline panel while a run is in-flight.
                  Fed by the script's throttled heartbeats on the admin_stats_cache
                  status row (polled every 1.5s above). Collapses on completion;
                  the badge then shows the summary. */}
              <Collapse in={backfillStarting || backfillInFlight} unmountOnExit>
                {backfillProgress && (() => {
                  const total = backfillProgress.totalFiles ?? 0;
                  const done = backfillProgress.processedFiles ?? 0;
                  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                  const stalled = backfillProgress.heartbeatAt
                    ? Date.now() - Date.parse(backfillProgress.heartbeatAt) > 30_000
                    : false;
                  return (
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'action.hover' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {backfillProgress.currentMfr ? `Now: ${backfillProgress.currentMfr}` : 'Starting…'}
                          {' · '}
                          {backfillProgress.changed.toLocaleString()} changed / {backfillProgress.scanned.toLocaleString()} scanned
                          {backfillProgress.errors > 0 ? ` · ${backfillProgress.errors} errors` : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {total > 0 ? `${done} / ${total} manufacturers` : `${done} manufacturers`}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant={total > 0 ? 'determinate' : 'indeterminate'}
                        value={pct}
                        sx={{ height: 6, borderRadius: 1, mb: stalled ? 0.5 : 1 }}
                      />
                      {stalled && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                          No update in 30s+ — likely a large manufacturer, or the run stalled.
                        </Typography>
                      )}
                      {!!backfillProgress.recentMfrs?.length && (
                        <Box
                          sx={{
                            maxHeight: 160,
                            overflowY: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            lineHeight: 1.6,
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            p: 1,
                          }}
                        >
                          {backfillProgress.recentMfrs.map((m) => (
                            <Box key={m.name} sx={{ whiteSpace: 'pre', color: 'text.secondary' }}>
                              {`${m.name.padEnd(28).slice(0, 28)} ${String(m.changed).padStart(6)} changed / ${m.unchanged} same / ${m.missing} missing`}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Paper>
                  );
                })()}
              </Collapse>

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
                        <TableCell align="right" sortDirection={sortKey === 'atlasId' ? sortDir : false}>
                          <Tooltip arrow title="Atlas source manufacturer ID — the stable identity for this company. Two rows sharing a name but showing different Atlas IDs are different records (genuine collision or duplicate import).">
                            <TableSortLabel active={sortKey === 'atlasId'} direction={sortKey === 'atlasId' ? sortDir : 'asc'} onClick={() => handleSort('atlasId')}>
                              Atlas ID
                            </TableSortLabel>
                          </Tooltip>
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
                        <TableCell align="right" sortDirection={sortKey === 'improvementPotentialPpt' ? sortDir : false}>
                          <Tooltip
                            arrow
                            title="Weighted uplift to matching coverage if every currently-unmapped param affecting this MFR's products were mapped. Heavier rules (blocking gates) count more than display-only rules. Sort DESC to find the highest-leverage MFRs for your engineer to work on next."
                          >
                            <TableSortLabel
                              active={sortKey === 'improvementPotentialPpt'}
                              direction={sortKey === 'improvementPotentialPpt' ? sortDir : 'desc'}
                              onClick={() => handleSort('improvementPotentialPpt')}
                            >
                              Improvement Potential
                            </TableSortLabel>
                          </Tooltip>
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
                        <TableCell sortDirection={sortKey === 'lastModified' ? sortDir : false}>
                          <TableSortLabel active={sortKey === 'lastModified'} direction={sortKey === 'lastModified' ? sortDir : 'desc'} onClick={() => handleSort('lastModified')}>
                            Last Modified
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
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary', opacity: mfr.atlasId != null ? 1 : 0.3 }}
                            >
                              {mfr.atlasId != null ? mfr.atlasId : '\u2014'}
                            </Typography>
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
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Typography variant="body2" sx={{ opacity: mfr.coveragePct > 0 ? 1 : 0.3 }}>
                                {mfr.coveragePct > 0 ? `${mfr.coveragePct}%` : '\u2014'}
                              </Typography>
                              {/* Per-MFR Triage drilldown \u2014 deep-links to the
                                  Dict Triage page filtered to this MFR with
                                  the queue sorted by matching impact, so the
                                  engineer lands on the highest-leverage
                                  pending accepts for the manufacturer they
                                  just looked at. Decision #200. */}
                              {mfr.slug && (
                                <Tooltip arrow title={`Open Triage filtered to ${mfr.nameEn} \u2014 see pending accepts ranked by impact`}>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/admin?section=atlas-dict-triage&mfr=${encodeURIComponent(mfr.slug)}`);
                                    }}
                                    sx={{ p: 0.25, opacity: 0.6, '&:hover': { opacity: 1 } }}
                                  >
                                    <BuildOutlinedIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            {(() => {
                              const ppt = mfr.improvementPotentialPpt;
                              // No scorable products \u2192 no matching budget, so
                              // improvement potential is meaningless. Show "\u2014"
                              // with explanation instead of "0.0 ppt" which
                              // would conflate "nothing to fix" with "nothing
                              // to fix BECAUSE nothing exists".
                              if (mfr.scorableCount === 0) {
                                return (
                                  <Tooltip arrow title="No scorable products for this manufacturer \u2014 no matching budget to improve.">
                                    <Typography variant="body2" sx={{ opacity: 0.3 }}>{'\u2014'}</Typography>
                                  </Tooltip>
                                );
                              }
                              if (ppt === null || ppt === undefined) {
                                return (
                                  <Tooltip arrow title="Improvement potential is still loading \u2014 refresh in a few seconds to see this manufacturer's uplift estimate.">
                                    <Typography variant="body2" sx={{ opacity: 0.3 }}>{'\u2014'}</Typography>
                                  </Tooltip>
                                );
                              }
                              // Tier-color the chip so the engineer can scan
                              // the column without sorting: green \u22655 ppt big
                              // wins, amber 1\u20135 ppt moderate, grey <1 ppt
                              // essentially fully-mapped.
                              const color = ppt >= 5 ? '#66BB6A' : ppt >= 1 ? '#FFB74D' : undefined;
                              const detail = mfr.improvementPotentialDetail;
                              if (ppt === 0) {
                                return (
                                  <Tooltip arrow title="No currently-unmapped params in the Triage queue affect this manufacturer. Either its products are fully mapped, or it hasn't been ingested recently. New uploads will populate this once they appear in the queue.">
                                    <Typography variant="body2" sx={{ opacity: 0.3 }}>0.0 ppt</Typography>
                                  </Tooltip>
                                );
                              }
                              const tooltip = detail && detail.unmappedParams > 0
                                ? `${detail.unmappedParams.toLocaleString()} unmapped params \u00b7 ${detail.addressableSlots.toLocaleString()} weighted product-rule slots addressable`
                                : 'No unmapped params currently affect this manufacturer.';
                              return (
                                <Tooltip arrow title={tooltip}>
                                  <Typography variant="body2" sx={{ color }}>
                                    {`+${ppt.toFixed(1)} ppt`}
                                  </Typography>
                                </Tooltip>
                              );
                            })()}
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
                          <TableCell>
                            {mfr.lastModified ? (
                              <Tooltip title={new Date(mfr.lastModified).toLocaleString()} arrow>
                                <Typography variant="caption" color="text.secondary">
                                  {formatRelativeTime(mfr.lastModified)}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="caption" sx={{ opacity: 0.3 }}>{'\u2014'}</Typography>
                            )}
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

function ManufacturersPanelSkeleton() {
  return (
    <Box>
      {/* Summary + action buttons row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Skeleton variant="text" width={460} height={20} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Skeleton variant="text" width={110} height={16} />
          <Skeleton variant="rounded" width={140} height={30} />
          <Skeleton variant="rounded" width={105} height={30} />
        </Box>
      </Box>

      {/* Search field */}
      <Skeleton variant="rounded" width={320} height={40} sx={{ mb: 2 }} />

      {/* Table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Manufacturer', 'Products', 'Scorable', 'Coverage', 'Improvement Potential', 'MFR Crosses', 'Families', 'Last Modified', 'Enabled'].map((col) => (
                <TableCell
                  key={col}
                  align={['Products', 'Scorable', 'Coverage', 'Improvement Potential', 'MFR Crosses'].includes(col) ? 'right' : col === 'Enabled' ? 'center' : 'left'}
                >
                  <Skeleton variant="text" width={col === 'Manufacturer' || col === 'Last Modified' || col === 'Improvement Potential' ? 100 : 70} height={18} />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 12 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton variant="text" width={160} height={18} />
                  <Skeleton variant="text" width={110} height={14} />
                </TableCell>
                <TableCell align="right"><Skeleton variant="text" width={50} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell align="right"><Skeleton variant="text" width={50} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: 'auto' }} /></TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {Array.from({ length: (i % 3) + 1 }).map((_, j) => (
                      <Skeleton key={j} variant="rounded" width={36} height={22} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell><Skeleton variant="text" width={80} /></TableCell>
                <TableCell align="center" sx={{ width: 60 }}>
                  <Skeleton variant="rounded" width={30} height={18} sx={{ mx: 'auto' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
