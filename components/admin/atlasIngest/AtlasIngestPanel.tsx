'use client';

/**
 * AtlasIngestPanel — top-level orchestrator for the Atlas ingest admin page.
 *
 * Responsibilities:
 *   - Fetch + render pending and applied batches
 *   - Coordinate the upload → register-mfrs → report → review → proceed flow
 *   - Wire the global unmapped-params table to dictionary-edit flow
 *
 * Layout (top to bottom):
 *   1. Tabs: Pending | Applied
 *   2. Uploader (always visible on Pending tab)
 *   3. New-MFR registration panel (conditional, before report runs)
 *   4. Aggregate dashboard (Pending tab only)
 *   5. Global unmapped-params table (Pending tab only, only if any)
 *   6. Batch list (filtered by risk, sorted by risk severity)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import IngestUploader from './IngestUploader';
import NewManufacturerPanel from './NewManufacturerPanel';
import IngestDashboard from './IngestDashboard';
import BatchCard from './BatchCard';
import { useRouter } from 'next/navigation';
import type { BatchListResponse, IngestBatch, StagedFile } from './types';

type TabValue = 'pending' | 'applied';

interface PendingState {
  pendingMfrRegistrations: StagedFile[];   // staged files needing MFR registration first
  stagedFilesAwaitingReport: string[];     // basenames ready for /report after registration
}

export default function AtlasIngestPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<TabValue>('pending');

  const [batchData, setBatchData] = useState<BatchListResponse | null>(null);
  const [appliedData, setAppliedData] = useState<BatchListResponse | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reportRunning, setReportRunning] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<{ batchId: string; kind: 'proceed' | 'revert' | 'discard' | 'regenerate' } | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const [pendingState, setPendingState] = useState<PendingState>({
    pendingMfrRegistrations: [],
    stagedFilesAwaitingReport: [],
  });

  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'info' } | null>(null);

  const refreshBatches = useCallback(async () => {
    setLoadingBatches(true);
    setLoadError(null);
    try {
      const [pendingRes, appliedRes] = await Promise.all([
        fetch('/api/admin/atlas/ingest/batches?status=pending'),
        fetch('/api/admin/atlas/ingest/batches?status=applied'),
      ]);
      if (!pendingRes.ok) throw new Error(`Pending fetch failed: ${pendingRes.status}`);
      if (!appliedRes.ok) throw new Error(`Applied fetch failed: ${appliedRes.status}`);
      setBatchData(await pendingRes.json());
      setAppliedData(await appliedRes.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load batches');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    refreshBatches();
  }, [refreshBatches]);

  // Upload flow handler — fed from IngestUploader.
  const handleUploadComplete = useCallback(async (staged: StagedFile[], skipped: Array<{ filename: string; reason: string }>) => {
    if (skipped.length > 0) {
      setSnack({ msg: `${skipped.length} file(s) skipped: ${skipped[0].reason}`, severity: 'error' });
    }
    if (staged.length === 0) return;

    const newMfrs = staged.filter((s) => s.isNewManufacturer);
    if (newMfrs.length > 0) {
      setPendingState({
        pendingMfrRegistrations: newMfrs,
        stagedFilesAwaitingReport: staged.map((s) => s.filename),
      });
    } else {
      // Straight to report
      await runReport(staged.map((s) => s.filename));
    }
  }, []);

  const handleNewMfrsConfirmed = useCallback(async () => {
    // After registration completes, run the report on all originally staged files
    const filenames = pendingState.stagedFilesAwaitingReport;
    setPendingState({ pendingMfrRegistrations: [], stagedFilesAwaitingReport: [] });
    await runReport(filenames);
  }, [pendingState.stagedFilesAwaitingReport]);

  const handleNewMfrsCancelled = useCallback(() => {
    setPendingState({ pendingMfrRegistrations: [], stagedFilesAwaitingReport: [] });
    setSnack({ msg: 'Upload cancelled. Files are still staged in data/atlas/.', severity: 'info' });
  }, []);

  const runReport = useCallback(async (filenames: string[]) => {
    if (filenames.length === 0) return;
    setReportRunning(true);
    try {
      const res = await fetch('/api/admin/atlas/ingest/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filenames }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Report failed (${res.status})`);
      }
      setSnack({ msg: `Reports generated for ${filenames.length} file(s)`, severity: 'success' });
      await refreshBatches();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Report failed', severity: 'error' });
    } finally {
      setReportRunning(false);
    }
  }, [refreshBatches]);

  const proceedBatch = useCallback(async (batchId: string) => {
    setActionInFlight({ batchId, kind: 'proceed' });
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}/proceed`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Apply failed`);
      setSnack({ msg: 'Batch applied', severity: 'success' });
      await refreshBatches();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Apply failed', severity: 'error' });
    } finally {
      setActionInFlight(null);
    }
  }, [refreshBatches]);

  const revertBatch = useCallback(async (batchId: string) => {
    setActionInFlight({ batchId, kind: 'revert' });
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}/revert`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Revert failed`);
      setSnack({ msg: 'Batch reverted', severity: 'success' });
      await refreshBatches();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Revert failed', severity: 'error' });
    } finally {
      setActionInFlight(null);
    }
  }, [refreshBatches]);

  const discardBatch = useCallback(async (batchId: string) => {
    setActionInFlight({ batchId, kind: 'discard' });
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Discard failed`);
      setSnack({ msg: 'Batch discarded', severity: 'success' });
      await refreshBatches();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Discard failed', severity: 'error' });
    } finally {
      setActionInFlight(null);
    }
  }, [refreshBatches]);

  const regenerateBatch = useCallback(async (batchId: string) => {
    setActionInFlight({ batchId, kind: 'regenerate' });
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Regenerate failed`);
      setSnack({ msg: 'Report regenerated', severity: 'success' });
      await refreshBatches();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Regenerate failed', severity: 'error' });
    } finally {
      setActionInFlight(null);
    }
  }, [refreshBatches]);

  const proceedAllClean = useCallback(async () => {
    if (!batchData) return;
    const cleanCount = batchData.aggregate.counts.clean;
    if (cleanCount === 0) {
      setSnack({ msg: 'No clean batches to apply', severity: 'info' });
      return;
    }
    // Surface unresolved-params status — operators may not realize their
    // upload introduced new param names that need engineer review (Decision-
    // driven Model 3). Light friction; they can still proceed.
    const unresolvedCount = batchData.unmappedParamsGlobal.length;
    const unresolvedNote = unresolvedCount > 0
      ? `\n\nNote: ${unresolvedCount} unmapped parameter${unresolvedCount === 1 ? '' : 's'} across pending batches haven't been reviewed by an engineer. Applying will store those values under raw IDs; clean up later via Dictionary Triage.`
      : '';
    if (!confirm(`Apply ${cleanCount} clean batch(es) in parallel? Each is reversible for 30 days.${unresolvedNote}`)) return;
    setBulkRunning(true);
    try {
      const res = await fetch('/api/admin/atlas/ingest/proceed-all-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurrency: 5 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Bulk apply failed`);
      setSnack({ msg: `Bulk apply complete`, severity: 'success' });
      await refreshBatches();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Bulk apply failed', severity: 'error' });
    } finally {
      setBulkRunning(false);
    }
  }, [batchData, refreshBatches]);

  const renderingBlocked = pendingState.pendingMfrRegistrations.length > 0;

  return (
    <Box sx={{ p: 3, pt: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, height: PAGE_HEADER_HEIGHT, pb: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Atlas Ingest</Typography>
          <Typography variant="body2" color="text.secondary">
            Upload Atlas manufacturer JSON files, review per-MFR diff reports, then apply with full revert support.
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={refreshBatches}
          disabled={loadingBatches}
          size="small"
        >
          Refresh
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab value="pending" label={`Pending (${batchData?.aggregate.counts.total ?? 0})`} />
        <Tab value="applied" label={`Applied (${appliedData?.aggregate.counts.total ?? 0})`} />
      </Tabs>

      {tab === 'pending' && (
        <Box>
          <IngestUploader onUploadComplete={handleUploadComplete} disabled={reportRunning || renderingBlocked} />

          {reportRunning && (
            <Box sx={{ my: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary">Generating reports — this can take a minute for large batches…</Typography>
            </Box>
          )}

          {renderingBlocked && (
            <NewManufacturerPanel
              stagedFiles={pendingState.pendingMfrRegistrations}
              onConfirmed={handleNewMfrsConfirmed}
              onCancelled={handleNewMfrsCancelled}
            />
          )}

          {loadingBatches && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {loadError && <Alert severity="error" sx={{ my: 2 }}>{loadError}</Alert>}

          {!loadingBatches && batchData && batchData.batches.length === 0 && !renderingBlocked && (
            <Alert severity="info" sx={{ my: 3 }}>
              No pending batches. Upload Atlas JSON files above to generate diff reports.
            </Alert>
          )}

          {!loadingBatches && batchData && batchData.batches.length > 0 && (
            <>
              <IngestDashboard
                aggregate={batchData.aggregate}
                onProceedAllClean={proceedAllClean}
                bulkRunning={bulkRunning}
              />

              {/* Read-only triage summary — Decision-driven (Model 3): operators
                  see a count + link to the dedicated Dictionary Triage workspace,
                  but don't get edit power over mappings here. The full editor
                  lives at ?section=atlas-dict-triage so engineers own that
                  workflow independently of the upload/apply flow. */}
              {batchData.unmappedParamsGlobal.length > 0 && (
                <Alert
                  severity="warning"
                  sx={{ my: 2 }}
                  action={(
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => router.push('/admin?section=atlas-dict-triage')}
                    >
                      Open Dictionary Triage →
                    </Button>
                  )}
                >
                  <strong>{batchData.unmappedParamsGlobal.length}</strong> unmapped parameter{batchData.unmappedParamsGlobal.length === 1 ? '' : 's'} across pending batches need engineer review before high-fidelity matching.
                </Alert>
              )}

              <Stack spacing={2}>
                {batchData.batches.map((b) => (
                  <BatchCard
                    key={b.batch_id}
                    batch={b}
                    onProceed={() => proceedBatch(b.batch_id)}
                    onDiscard={() => discardBatch(b.batch_id)}
                    onRegenerate={() => regenerateBatch(b.batch_id)}
                    actionInFlight={actionInFlight?.batchId === b.batch_id ? actionInFlight.kind : null}
                  />
                ))}
              </Stack>
            </>
          )}
        </Box>
      )}

      {tab === 'applied' && (
        <Box>
          {loadingBatches && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {!loadingBatches && appliedData && appliedData.batches.length === 0 && (
            <Alert severity="info">No applied batches in the last 30 days.</Alert>
          )}
          {!loadingBatches && appliedData && appliedData.batches.length > 0 && (
            <Stack spacing={2}>
              {appliedData.batches.map((b) => (
                <BatchCard
                  key={b.batch_id}
                  batch={b}
                  variant="applied"
                  onRevert={() => revertBatch(b.batch_id)}
                  actionInFlight={actionInFlight?.batchId === b.batch_id ? actionInFlight.kind : null}
                />
              ))}
            </Stack>
          )}
        </Box>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snack ? (
          <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(null)}>
            {snack.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
