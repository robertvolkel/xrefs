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

import { useCallback, useEffect, useState } from 'react';
import { Box, Alert, Stack, Typography, Chip, Button, Skeleton } from '@mui/material';
import { useSearchParams, useRouter } from 'next/navigation';
import GlobalUnmappedParamsTable from './atlasIngest/GlobalUnmappedParamsTable';
import type { BatchListResponse } from './atlasIngest/types';

export default function AtlasDictTriagePanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const batchFilter = searchParams.get('batch');

  const [data, setData] = useState<BatchListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load triage queue');
    } finally {
      setLoading(false);
    }
  }, [batchFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  // Per-batch regenerate — same flow as AtlasIngestPanel, just inlined here
  // since the engineer triages from this surface and regeneration must follow
  // any accept/edit action.
  const regenerateBatch = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Regenerate failed');
    } catch {
      // Surface failures via the panel's own state — but don't block the next
      // accept action. Engineer will see stale state and re-trigger.
    }
  }, []);

  const onRegenerateAffected = useCallback(async (batchIds: string[]) => {
    for (const id of batchIds) {
      await regenerateBatch(id);
    }
    await refresh();
  }, [regenerateBatch, refresh]);

  const clearBatchFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('batch');
    router.push(`/admin?${params.toString()}`);
  }, [searchParams, router]);

  return (
    <Box sx={{ px: 3, pb: 3, pt: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Dictionary Triage</Typography>
        {batchFilter && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={`Filtered to batch ${batchFilter.slice(0, 8)}…`}
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

      {!loading && data && data.unmappedParamsGlobal.length === 0 && (
        <Alert severity="success" sx={{ my: 3 }}>
          {batchFilter
            ? 'No unresolved parameters for this batch — nothing to review.'
            : 'No unresolved parameters across any manufacturer. The queue is empty.'}
        </Alert>
      )}

      {!loading && data && data.unmappedParamsGlobal.length > 0 && (
        <GlobalUnmappedParamsTable
          rows={data.unmappedParamsGlobal}
          pendingBatchCount={data.aggregate.counts.total}
          onRegenerateAffected={onRegenerateAffected}
        />
      )}
    </Box>
  );
}
