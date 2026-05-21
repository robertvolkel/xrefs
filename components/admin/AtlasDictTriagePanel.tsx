'use client';

/**
 * AtlasDictTriagePanel — dedicated workspace for engineers reviewing unmapped
 * Atlas parameters across all manufacturers and batches.
 *
 * Why this exists separately from AtlasIngestPanel: the operator workflow
 * (upload + apply batches) and the engineer workflow (review AI-suggested
 * dictionary mappings) are different jobs that benefit from different page
 * surfaces. Operators see only a count summary on the Ingest page; engineers
 * own the full editing experience here. Same data behind both surfaces — see
 * /api/admin/atlas/ingest/batches which serves both consumers.
 *
 * URL contract: optional `?batch=<batch_id>` query param scopes the queue to
 * a single batch. The "Review in Dictionary Triage →" link from a batch card
 * uses this so an engineer can land on exactly the params for that one batch
 * (instead of the global unfiltered queue).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Alert, Stack, Typography, Chip, Button, Skeleton, CircularProgress, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSearchParams, useRouter } from 'next/navigation';
import GlobalUnmappedParamsTable, { paramUid } from './atlasIngest/GlobalUnmappedParamsTable';
import RecentDictAcceptsPanel from './atlasIngest/RecentDictAcceptsPanel';
import TriageFilterBar, { EMPTY_FILTERS, type TriageFilters, type TriageMode } from './atlasIngest/TriageFilterBar';
import type { NoteRecord } from './atlasIngest/UnmappedParamNoteCell';
import type { BatchListResponse, StatusFilter } from './atlasIngest/types';

// Parallel worker count for the deferred batch-regen flush. Each regen spawns
// a Node child process running scripts/atlas-ingest.mjs (~5–15s wall-clock per
// batch), so 3 keeps the dev server responsive while still scaling well.
const REGEN_CONCURRENCY = 3;

export default function AtlasDictTriagePanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const batchFilter = searchParams.get('batch');

  const [data, setData] = useState<BatchListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumps after every queue refresh so the Recently Accepted panel re-fetches
  // (Accept → regen → queue refresh → recent list refresh, in one chain).
  const [recentRefreshSignal, setRecentRefreshSignal] = useState(0);
  // Page-level filter state (search/MFR/family/min-prods/has-note). Pure
  // client-side slicing of the in-memory queue — no extra fetches.
  const [filters, setFilters] = useState<TriageFilters>(EMPTY_FILTERS);
  // Notes per paramName — owned at the panel level so the filter bar can
  // scope rows by has-note (the rows-needing-followup workflow). Single
  // fetch on mount; subsequent edits reconcile via onNoteChange.
  const [notesByParam, setNotesByParam] = useState<Record<string, NoteRecord>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/atlas/unmapped-param-notes');
        const json = await res.json();
        if (cancelled || !json?.success || !Array.isArray(json.items)) return;
        const next: Record<string, NoteRecord> = {};
        for (const item of json.items as NoteRecord[]) {
          next[item.paramName] = item;
        }
        setNotesByParam(next);
      } catch {
        // Notes are non-essential — fall through with empty map.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onNoteChange = useCallback((paramName: string, next: NoteRecord | null) => {
    setNotesByParam((prev) => {
      if (next === null) {
        const copy = { ...prev };
        delete copy[paramName];
        return copy;
      }
      return { ...prev, [paramName]: next };
    });
  }, []);
  // View mode — server-side. Changing the mode triggers a refetch since the
  // queue's classification (synonym vs auto-flagged) is computed in the route.
  const [mode, setMode] = useState<TriageMode>('synonyms');
  // Status filter — server-side. 'open' (default) shows un-accepted rows;
  // 'accepted' / 'undone' surface the audit trail of past Accepts; 'all'
  // shows the union (useful when an engineer wants the full picture).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  // Mode switches reset filters explicitly. Without this, filters set in one
  // mode (e.g. MFR=Delta in Open Synonyms) silently strip every row in the
  // next mode and the user sees "Showing 0 of N" with no obvious cause.
  // Filter state still persists for actions WITHIN a mode (search, scroll,
  // accept) — only the mode-chip click triggers the reset.
  const handleModeChange = useCallback((next: TriageMode) => {
    setMode(next);
    setFilters(EMPTY_FILTERS);
  }, []);
  // Batches affected by recent Accepts that haven't been regenerated yet.
  // Accept no longer auto-regens (each regen spawns a child process and runs
  // 5–15s; sequential per-affected-batch regens made each Accept feel like a
  // 30s reload). Instead we accumulate IDs here and let the user trigger a
  // parallel flush via the header chip when they're done reviewing.
  const [pendingRegenIds, setPendingRegenIds] = useState<Set<string>>(new Set());
  const [regenFlushing, setRegenFlushing] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{ done: number; total: number } | null>(null);

  // Single fetch on mount per (batchFilter); mode + statusFilter changes are
  // pure client-side filtering against the cached classified set, so chip
  // clicks are instant. The server returns the FULL set unconditionally.
  // forceFresh=true skips the L1/L2 cache (used by the Refresh button so the
  // user can demand a fresh compute when they need to see, e.g., a row they
  // just added in another tab).
  const refresh = useCallback(async (forceFresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (batchFilter) params.set('batch', batchFilter);
      if (forceFresh) params.set('refresh', '1');
      const url = `/api/admin/atlas/ingest/batches?${params.toString()}`;
      // cache: 'no-store' so the browser doesn't reuse a previous response
      // when the URL is the same (e.g. revisiting the page with the same
      // batch filter). Server-side L1/L2 still apply.
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const json = (await res.json()) as BatchListResponse;
      setData(json);
      setRecentRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load triage queue');
    } finally {
      setLoading(false);
    }
  }, [batchFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const regenerateBatch = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Regenerate failed');
    } catch {
      // Failures here are silent — the user will see stale batch metrics and
      // can retry from the Ingest page if needed. Don't block other regens.
    }
  }, []);

  // Accept callback: queue the affected batch IDs for later flush. We no
  // longer call refresh() here — the row's optimistic in-place update (via
  // onRowAccepted below) already shows the new "Accepted" state, and a
  // refetch would invalidate the server-side cache (the Accept POST bumps
  // it) and force a 30+s cold reload with a skeleton screen, which was the
  // user's biggest pain point. The Recently Accepted panel re-fetches via
  // recentRefreshSignal so it picks up the new override too.
  const onRegenerateAffected = useCallback(async (batchIds: string[]) => {
    if (batchIds.length > 0) {
      setPendingRegenIds((prev) => {
        const next = new Set(prev);
        for (const id of batchIds) next.add(id);
        return next;
      });
    }
    setRecentRefreshSignal((n) => n + 1);
  }, []);

  // Optimistic in-place mutation of a row's acceptedOverride after a
  // successful Accept POST. Avoids the round-trip refetch entirely.
  // Adjusts the global statusCounts so the FilterBar chips update too.
  const onRowAccepted = useCallback((paramName: string, override: NonNullable<BatchListResponse['unmappedParamsGlobal'][number]['acceptedOverride']>) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextRows = prev.unmappedParamsGlobal.map((r) =>
        r.paramName === paramName ? { ...r, acceptedOverride: override } : r,
      );
      const nextStatusCounts = prev.statusCounts
        ? {
          open: Math.max(0, prev.statusCounts.open - 1),
          accepted: prev.statusCounts.accepted + 1,
          undone: prev.statusCounts.undone,
        }
        : prev.statusCounts;
      // triageCounts (synonyms / autoFlagged) is scoped to OPEN status —
      // accepting a synonym row decrements that bucket too.
      const nextTriageCounts = prev.triageCounts
        ? {
          synonyms: Math.max(0, prev.triageCounts.synonyms - 1),
          autoFlagged: prev.triageCounts.autoFlagged,
          total: Math.max(0, prev.triageCounts.total - 1),
        }
        : prev.triageCounts;
      return { ...prev, unmappedParamsGlobal: nextRows, statusCounts: nextStatusCounts, triageCounts: nextTriageCounts };
    });
  }, []);

  // Optimistic in-place mutation after a successful Confirm-Flag or
  // Revert-Flag PUT. Mirrors the onRowAccepted / onRowReverted pattern so
  // the row's noteStatus updates immediately and the table's "wrong_family"
  // render branches (or auto-flag suppression for 'confirmed_in_family')
  // kick in without waiting on a queue refetch. The parent's notesByParam
  // map also drives `liveNoteStatus` in filteredRows; this complements it
  // by mutating row.noteStatus directly so the within-row UI (button
  // labels, badge state) also responds.
  const onRowFlagged = useCallback((
    paramName: string,
    status: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | null,
    flaggedBy: 'auto' | 'engineer' | null,
  ) => {
    setData((prev) => {
      if (!prev) return prev;
      // Look up the row's pre-mutation classification so we can decrement
      // the right mode bucket on its way out (and increment the right one
      // on its way in). Mirrors the row-classification logic in
      // filteredRows: a row is "auto-flagged" iff autoFlag exists OR
      // noteStatus is 'wrong_family'; otherwise it's a "synonym" row.
      const target = prev.unmappedParamsGlobal.find((r) => r.paramName === paramName);
      const wasFlagged = target ? (!!target.autoFlag || target.noteStatus === 'wrong_family') : false;
      const nextRows = prev.unmappedParamsGlobal.map((r) =>
        r.paramName === paramName ? { ...r, noteStatus: status, flaggedBy } : r,
      );
      // triageCounts (Open Synonyms / Auto-flagged) — adjust based on the
      // before/after classification + whether the row drops from the open
      // queue entirely (status='unmappable' hides it from every default
      // mode view, so it disappears from total too).
      const isFlaggedNow = !!target?.autoFlag || status === 'wrong_family';
      const isUnmappableNow = status === 'unmappable';
      const wasUnmappable = target?.noteStatus === 'unmappable';
      let triageCounts = prev.triageCounts;
      if (triageCounts) {
        let { synonyms, autoFlagged, total } = triageCounts;
        // Remove from previous bucket
        if (!wasUnmappable) {
          if (wasFlagged) autoFlagged = Math.max(0, autoFlagged - 1);
          else synonyms = Math.max(0, synonyms - 1);
          if (isUnmappableNow) total = Math.max(0, total - 1);
        }
        // Add into new bucket
        if (!isUnmappableNow) {
          if (isFlaggedNow) autoFlagged += 1;
          else synonyms += 1;
          if (wasUnmappable) total += 1;
        }
        triageCounts = { synonyms, autoFlagged, total };
      }
      return { ...prev, unmappedParamsGlobal: nextRows, triageCounts };
    });
    // Also seed notesByParam so filteredRows' liveNoteStatus lookup picks
    // up the change before the next /unmapped-param-notes refetch.
    setNotesByParam((prev) => {
      const existing = prev[paramName];
      if (status === null) {
        if (!existing) return prev;
        const { [paramName]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      }
      return {
        ...prev,
        [paramName]: existing
          ? { ...existing, status, flaggedBy }
          : {
              paramName,
              note: '',
              status,
              flaggedBy,
              autoDiagnosis: null,
              updatedBy: '',
              updatedByName: 'You',
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
      };
    });
  }, []);

  // Optimistic in-place mutation after a successful Revert DELETE.
  // Flips acceptedOverride.isActive to false and bumps statusCounts
  // (accepted-1, undone+1). Open-bucket count stays put because reverting
  // doesn't bring the row back into the open queue; the row is still
  // resolved (just by an inactive override) until a fresh refresh recomputes
  // classification.
  const onRowReverted = useCallback((paramName: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextRows = prev.unmappedParamsGlobal.map((r) => {
        if (r.paramName !== paramName || !r.acceptedOverride) return r;
        return { ...r, acceptedOverride: { ...r.acceptedOverride, isActive: false } };
      });
      const nextStatusCounts = prev.statusCounts
        ? {
          open: prev.statusCounts.open,
          accepted: Math.max(0, prev.statusCounts.accepted - 1),
          undone: prev.statusCounts.undone + 1,
        }
        : prev.statusCounts;
      return { ...prev, unmappedParamsGlobal: nextRows, statusCounts: nextStatusCounts };
    });
  }, []);

  // Worker-pool flush — REGEN_CONCURRENCY subprocesses in flight at once.
  // Tracks progress so the button shows "Regenerating 3 of 8…" feedback.
  const flushPendingRegens = useCallback(async () => {
    const ids = [...pendingRegenIds];
    if (ids.length === 0) return;
    setRegenFlushing(true);
    setRegenProgress({ done: 0, total: ids.length });
    let next = 0;
    let done = 0;
    async function worker() {
      while (next < ids.length) {
        const id = ids[next++];
        if (!id) break;
        await regenerateBatch(id);
        done++;
        setRegenProgress({ done, total: ids.length });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(REGEN_CONCURRENCY, ids.length) }, () => worker()),
    );
    setPendingRegenIds(new Set());
    setRegenProgress(null);
    setRegenFlushing(false);
    await refresh();
  }, [pendingRegenIds, regenerateBatch, refresh]);

  const clearBatchFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('batch');
    router.push(`/admin?${params.toString()}`);
  }, [searchParams, router]);

  // When batch-filtered, surface the actual batch's MFR in the chip.
  // Previously this used the first row's first MFR — misleading when params
  // are shared across batches (e.g. Yangjie + Vanguard both ship MOSFETs
  // with the same param names; if Vanguard had more products with that
  // param, the chip would show "Vanguard" even when filtered to Yangjie).
  // Now we resolve from data.batches[0] which the route returns regardless
  // of the batch's status (pending/applied/reverted).
  const batchMfrName = useMemo(() => {
    if (!batchFilter || !data) return null;
    const filteredBatch = data.batches.find((b) => b.batch_id === batchFilter);
    return filteredBatch?.manufacturer ?? null;
  }, [batchFilter, data]);

  // Apply the page-level filter pipeline. Pure client-side; cheap on the
  // hundreds-of-rows queues we expect.
  //
  // mode + statusFilter are also applied here (instead of server-side) so
  // chip-click switches are instant — no refetch + skeleton on every toggle.
  // The server returns the full classified set unconditionally; the client
  // slices it by all axes (mode, status, search, MFR, family, min-prods,
  // has-note) in this single pass.
  const allRows = data?.unmappedParamsGlobal ?? [];
  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const mfrSet = new Set(filters.mfrSlugs);
    const famSet = new Set(filters.families);
    return allRows.filter((row) => {
      // Live note status takes precedence over the row's server-fetched
      // noteStatus — after the engineer marks unmappable (or confirms a
      // flag), notesByParam updates immediately while row.noteStatus
      // wouldn't refresh until the next queue refetch. Using the live
      // value keeps the row visibility consistent with what just happened.
      const liveNoteStatus = notesByParam[row.paramName]?.status ?? row.noteStatus ?? null;
      // Unmappable rows drop from every default view. Only the "All" mode
      // keeps them visible so the engineer can audit (and revert via the
      // AI Investigation Log if needed).
      if (mode !== 'all' && liveNoteStatus === 'unmappable') return false;
      // Mode filter (Open Synonyms vs Auto-flagged vs All) — derived from
      // autoFlag + noteStatus; same logic as the route's classifier.
      const isFlagged = !!row.autoFlag || liveNoteStatus === 'wrong_family';
      if (mode === 'auto_flagged' && !isFlagged) return false;
      if (mode === 'synonyms' && isFlagged) return false;
      // Status filter (Open / Accepted / Undone / All).
      const ov = row.acceptedOverride;
      if (statusFilter === 'open' && ov) return false;
      if (statusFilter === 'accepted' && (!ov || !ov.isActive)) return false;
      if (statusFilter === 'undone' && (!ov || ov.isActive)) return false;
      if (search) {
        // Match against paramName OR the row's deterministic UID so an
        // engineer can paste "TR-a8f2c1" (from a Slack thread, a ticket,
        // an earlier debug session) into the search box and jump straight
        // to the row.
        const nameHit = row.paramName.toLowerCase().includes(search);
        const uidHit = paramUid(row.paramName).toLowerCase().includes(search);
        if (!nameHit && !uidHit) return false;
      }
      if (filters.minProductCount > 0 && row.productCount < filters.minProductCount) return false;
      if (mfrSet.size > 0) {
        const hit = (row.affectedManufacturers ?? []).some((m) => mfrSet.has(m.slug));
        if (!hit) return false;
      }
      if (famSet.size > 0) {
        if (!row.dominantFamily || !famSet.has(row.dominantFamily)) return false;
      }
      if (filters.hasNote && !notesByParam[row.paramName]) return false;
      if (filters.flaggedOnly && !notesByParam[row.paramName]?.flagged) return false;
      return true;
    });
  }, [allRows, filters, notesByParam, mode, statusFilter]);

  // Stable key the table uses to decide when to reset its pagination. Encodes
  // every input that should genuinely change the "view" (mode, status,
  // search, MFR/family chips, etc.) but NOT row-content mutations from
  // Accept/Revert/Flag. Without this, the table was keying off the `rows`
  // prop reference, which churned on every optimistic mutation and kicked
  // engineers back to the first 50 rows after every action.
  const viewKey = useMemo(
    () => JSON.stringify({
      mode,
      statusFilter,
      search: filters.search.trim().toLowerCase(),
      mfrSlugs: [...filters.mfrSlugs].sort(),
      families: [...filters.families].sort(),
      minProductCount: filters.minProductCount,
      hasNote: filters.hasNote,
      flaggedOnly: filters.flaggedOnly,
      aiVerdict: filters.aiVerdict,
      batchFilter,
    }),
    [mode, statusFilter, filters, batchFilter],
  );

  // Count of flagged params across the whole notes map — surfaced as the
  // chip badge on the Flagged toggle in the filter bar.
  const flaggedCount = useMemo(
    () => Object.values(notesByParam).filter((n) => n?.flagged).length,
    [notesByParam],
  );

  return (
    <Box sx={{ px: 3, pb: 3, pt: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        {batchFilter && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={
                batchMfrName
                  ? `Filtered to ${batchMfrName} batch (${batchFilter.slice(0, 8)}…)`
                  : `Filtered to batch ${batchFilter.slice(0, 8)}…`
              }
              onDelete={clearBatchFilter}
              color="primary"
              variant="outlined"
            />
            <Button size="small" onClick={clearBatchFilter}>Show all</Button>
          </Stack>
        )}
        {!batchFilter && data && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {(data.triageCounts?.total ?? data.unmappedParamsGlobal.length).toLocaleString()} unresolved param{(data.triageCounts?.total ?? data.unmappedParamsGlobal.length) === 1 ? '' : 's'} across all manufacturers
            {data.triageCounts && data.triageCounts.autoFlagged > 0 && (
              <Box component="span" sx={{ ml: 1, color: 'error.light', fontWeight: 600 }}>
                · {data.triageCounts.autoFlagged} auto-flagged misclassification{data.triageCounts.autoFlagged === 1 ? '' : 's'}
              </Box>
            )}
          </Typography>
        )}

        {/* Deferred-regen flush control — appears once an Accept has queued
            affected batches. Tooltip explains why this exists separate from
            Accept (so the user understands their accepted overrides are
            already live; this only refreshes batch report metrics). */}
        {pendingRegenIds.size > 0 && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={
                regenProgress
                  ? `Regenerating ${regenProgress.done} of ${regenProgress.total}…`
                  : `${pendingRegenIds.size} batch${pendingRegenIds.size === 1 ? '' : 'es'} need regen`
              }
            />
            <Button
              size="small"
              variant="contained"
              startIcon={regenFlushing ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon fontSize="small" />}
              onClick={flushPendingRegens}
              disabled={regenFlushing}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {regenFlushing ? 'Regenerating…' : 'Regen affected batches'}
            </Button>
          </Stack>
        )}

        {/* Refresh button — forces a fresh server compute (bypasses L1+L2).
            Use after a major upload to see new MFRs in the filter, or any
            time you want to skip cache and recompute from source. Always
            visible; pinned right with ml: 'auto'. */}
        <Tooltip title="Force a fresh fetch from the database (bypasses cache, ~10–30s)">
          <span style={{ marginLeft: 'auto' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon fontSize="small" />}
              onClick={() => refresh(true)}
              disabled={loading}
            >
              Refresh
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {loading && (
        <Box sx={{ mt: 1 }}>
          <Skeleton variant="rectangular" height={48} sx={{ mb: 2, borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={36} sx={{ mb: 1, borderRadius: 0.5 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={42} sx={{ mb: 0.5, borderRadius: 0.5 }} />
          ))}
        </Box>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {!loading && (
        <RecentDictAcceptsPanel
          refreshSignal={recentRefreshSignal}
          onUndone={refresh}
        />
      )}

      {/* Globally empty: 0 rows in EVERY mode. Hide the filter bar entirely
          and surface a green success state. */}
      {!loading && data && (data.triageCounts?.total ?? 0) === 0 && data.unmappedParamsGlobal.length === 0 && (
        <Alert severity="success" sx={{ my: 3 }}>
          {batchFilter
            ? 'No unresolved parameters for this batch — nothing to review.'
            : 'No unresolved parameters across any manufacturer. The queue is empty.'}
        </Alert>
      )}

      {/* Otherwise: keep the filter bar (mode chips + filters) mounted so the
          engineer can switch modes even when the current mode is empty. */}
      {!loading && data && ((data.triageCounts?.total ?? 0) > 0 || data.unmappedParamsGlobal.length > 0) && (
        <>
          <TriageFilterBar
            rows={allRows}
            filters={filters}
            onChange={setFilters}
            filteredCount={filteredRows.length}
            totalCount={allRows.length}
            mode={mode}
            onModeChange={handleModeChange}
            triageCounts={data.triageCounts}
            status={statusFilter}
            onStatusChange={setStatusFilter}
            statusCounts={data.statusCounts}
            noteCount={Object.keys(notesByParam).length}
            flaggedCount={flaggedCount}
          />
          {data.unmappedParamsGlobal.length === 0 ? (
            <Alert severity="info" sx={{ my: 2 }}>
              {mode === 'auto_flagged'
                ? 'No auto-flagged misclassifications. Switch to Open synonyms to continue mapping.'
                : mode === 'synonyms'
                  ? 'No open synonym rows in the queue.'
                  : 'No rows match the current view.'}
            </Alert>
          ) : filteredRows.length === 0 ? (
            <Alert severity="info" sx={{ my: 2 }}>
              No params match the current filters. Adjust or{' '}
              <Box
                component="span"
                onClick={() => setFilters(EMPTY_FILTERS)}
                sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'primary.main' }}
              >
                clear all filters
              </Box>
              .
            </Alert>
          ) : (
            <GlobalUnmappedParamsTable
              rows={filteredRows}
              viewKey={viewKey}
              pendingBatchCount={data.aggregate.counts.total}
              onRegenerateAffected={onRegenerateAffected}
              onRowAccepted={onRowAccepted}
              onRowReverted={onRowReverted}
              onRowFlagged={onRowFlagged}
              notesByParam={notesByParam}
              onNoteChange={onNoteChange}
              aiVerdictFilter={filters.aiVerdict}
            />
          )}
        </>
      )}
    </Box>
  );
}
