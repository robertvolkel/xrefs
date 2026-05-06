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
import { Box, Alert, Stack, Typography, Chip, Button, Skeleton, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSearchParams, useRouter } from 'next/navigation';
import GlobalUnmappedParamsTable from './atlasIngest/GlobalUnmappedParamsTable';
import RecentDictAcceptsPanel from './atlasIngest/RecentDictAcceptsPanel';
import TriageFilterBar, { EMPTY_FILTERS, type TriageFilters } from './atlasIngest/TriageFilterBar';
import type { BatchListResponse } from './atlasIngest/types';

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
  // Page-level filter state (search/MFR/family/min-prods). Pure client-side
  // slicing of the in-memory queue — no extra fetches.
  const [filters, setFilters] = useState<TriageFilters>(EMPTY_FILTERS);
  // Batches affected by recent Accepts that haven't been regenerated yet.
  // Accept no longer auto-regens (each regen spawns a child process and runs
  // 5–15s; sequential per-affected-batch regens made each Accept feel like a
  // 30s reload). Instead we accumulate IDs here and let the user trigger a
  // parallel flush via the header chip when they're done reviewing.
  const [pendingRegenIds, setPendingRegenIds] = useState<Set<string>>(new Set());
  const [regenFlushing, setRegenFlushing] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{ done: number; total: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = batchFilter
        ? `/api/admin/atlas/ingest/batches?batch=${encodeURIComponent(batchFilter)}`
        : `/api/admin/atlas/ingest/batches`;
      const res = await fetch(url);
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

  // Accept callback: queue the affected batch IDs for later flush, then
  // refresh the queue immediately. The override is already in atlas_dictionary_overrides
  // (created by the Accept POST), so the queue route's override-aware filter
  // drops the row from the queue on the next fetch — no regen needed for the
  // queue to self-clean. Regen only refreshes the per-batch report metrics
  // (AVG ATTRS/PRODUCT, attrs added) shown on the Ingest page; deferring it
  // to a single button-press at end of session avoids the Nx subprocess spawn.
  const onRegenerateAffected = useCallback(async (batchIds: string[]) => {
    if (batchIds.length > 0) {
      setPendingRegenIds((prev) => {
        const next = new Set(prev);
        for (const id of batchIds) next.add(id);
        return next;
      });
    }
    await refresh();
  }, [refresh]);

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

  // When batch-filtered, every row shares the same source MFR — surface its
  // display name in the chip instead of the opaque truncated UUID.
  const batchMfrName = useMemo(() => {
    if (!batchFilter || !data) return null;
    const rows = data.unmappedParamsGlobal;
    if (rows.length === 0) return null;
    const first = rows[0]?.affectedManufacturers?.[0]?.name;
    return first ?? null;
  }, [batchFilter, data]);

  // Apply the page-level filter pipeline. Pure client-side; cheap on the
  // hundreds-of-rows queues we expect.
  const allRows = data?.unmappedParamsGlobal ?? [];
  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const mfrSet = new Set(filters.mfrSlugs);
    const famSet = new Set(filters.families);
    return allRows.filter((row) => {
      if (search && !row.paramName.toLowerCase().includes(search)) return false;
      if (filters.minProductCount > 0 && row.productCount < filters.minProductCount) return false;
      if (mfrSet.size > 0) {
        const hit = (row.affectedManufacturers ?? []).some((m) => mfrSet.has(m.slug));
        if (!hit) return false;
      }
      if (famSet.size > 0) {
        if (!row.dominantFamily || !famSet.has(row.dominantFamily)) return false;
      }
      return true;
    });
  }, [allRows, filters]);

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
            {data.unmappedParamsGlobal.length} unresolved param{data.unmappedParamsGlobal.length === 1 ? '' : 's'} across all manufacturers
          </Typography>
        )}

        {/* Deferred-regen flush control — appears once an Accept has queued
            affected batches. Tooltip explains why this exists separate from
            Accept (so the user understands their accepted overrides are
            already live; this only refreshes batch report metrics). */}
        {pendingRegenIds.size > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 'auto' }}>
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

      {!loading && data && data.unmappedParamsGlobal.length === 0 && (
        <Alert severity="success" sx={{ my: 3 }}>
          {batchFilter
            ? 'No unresolved parameters for this batch — nothing to review.'
            : 'No unresolved parameters across any manufacturer. The queue is empty.'}
        </Alert>
      )}

      {!loading && data && data.unmappedParamsGlobal.length > 0 && (
        <>
          <TriageFilterBar
            rows={allRows}
            filters={filters}
            onChange={setFilters}
            filteredCount={filteredRows.length}
            totalCount={allRows.length}
          />
          {filteredRows.length === 0 ? (
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
              pendingBatchCount={data.aggregate.counts.total}
              onRegenerateAffected={onRegenerateAffected}
            />
          )}
        </>
      )}
    </Box>
  );
}
