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
  Chip,
  CircularProgress,
  LinearProgress,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import IngestUploader from './IngestUploader';
import NewManufacturerPanel from './NewManufacturerPanel';
import BatchCard from './BatchCard';
import IngestHowToDrawer from './IngestHowToDrawer';
import { useRouter } from 'next/navigation';
import type { BatchListResponse, IngestBatch, StagedFile } from './types';

type TabValue = 'pending' | 'applied';

type DiscoverStatus = {
  lastStartedAt: string;
  lastFinishedAt: string | null;
  scanned: number;
  batchesCreated: number;
  skipped: number;
  errors: number;
};

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

  const [pendingState, setPendingState] = useState<PendingState>({
    pendingMfrRegistrations: [],
    stagedFilesAwaitingReport: [],
  });

  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  // Legacy-discovery scan (surfaces unmapped params from MFRs loaded before the
  // batch pipeline existed; they have no batch row so Triage can't see them).
  const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus | null>(null);
  const discoverRunning = !!discoverStatus && !discoverStatus.lastFinishedAt;

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

  const fetchDiscoverStatus = useCallback(async (): Promise<DiscoverStatus | null> => {
    try {
      const res = await fetch('/api/admin/atlas/ingest/discover-legacy', { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      const status = (json?.status as DiscoverStatus | null) ?? null;
      setDiscoverStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchDiscoverStatus();
  }, [fetchDiscoverStatus]);

  const handleDiscoverLegacy = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/atlas/ingest/discover-legacy', { method: 'POST' });
      const json = await res.json();
      if (res.status === 409) {
        setSnack({ msg: 'A discovery scan is already running.', severity: 'info' });
        await fetchDiscoverStatus();
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || `Discovery failed (${res.status})`);
      setSnack({ msg: 'Legacy discovery started — Triage updates when it finishes.', severity: 'info' });
      await fetchDiscoverStatus();

      // Poll until the run finishes (legacy scan maps ~102 MFRs; minutes).
      const POLL_INTERVAL_MS = 10_000;
      const POLL_BUDGET_MS = 30 * 60 * 1000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < POLL_BUDGET_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const status = await fetchDiscoverStatus();
        if (status?.lastFinishedAt) {
          setSnack({
            msg: `Legacy discovery done — ${status.batchesCreated} discovery batch(es) created. Open Dictionary Triage to map.`,
            severity: 'success',
          });
          return;
        }
      }
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Discovery failed', severity: 'error' });
    }
  }, [fetchDiscoverStatus]);

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
      // Capture the baseline pending-batch count so polling can detect when
      // the background script's new batches land.
      const baselineBatchCount = batchData?.batches?.length ?? 0;
      const expectedCount = baselineBatchCount + filenames.length;

      const res = await fetch('/api/admin/atlas/ingest/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filenames }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Report failed (${res.status})`);
      }

      setSnack({
        msg: `Report generation started for ${filenames.length} file(s). Watching for new batches…`,
        severity: 'info',
      });

      // The script runs detached on the server. Poll the batches list every
      // 5s until we see the expected count of new pending batches or hit the
      // poll budget. Large files (20+ MB) can take several minutes.
      const POLL_INTERVAL_MS = 5_000;
      const POLL_BUDGET_MS = 30 * 60 * 1000; // 30 min
      const startedAt = Date.now();

      while (Date.now() - startedAt < POLL_BUDGET_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        await refreshBatches();
        // refreshBatches updates batchData via setBatchData; re-read via ref
        // is awkward here, so we just trust the next render to surface the
        // new batches. Break when polling has run "long enough" for typical
        // file sizes — the user will see new batches as they appear.
        const current = (await (async () => {
          const r = await fetch('/api/admin/atlas/ingest/batches?status=pending', { cache: 'no-store' });
          if (!r.ok) return null;
          const data = await r.json();
          return data?.batches?.length ?? null;
        })());
        if (current != null && current >= expectedCount) {
          setSnack({
            msg: `Reports ready for ${filenames.length} file(s)`,
            severity: 'success',
          });
          return;
        }
      }

      setSnack({
        msg: 'Report generation still running after 30 min — refresh manually to check progress',
        severity: 'info',
      });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Report failed', severity: 'error' });
    } finally {
      setReportRunning(false);
    }
  }, [refreshBatches, batchData]);

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

  const renderingBlocked = pendingState.pendingMfrRegistrations.length > 0;

  return (
    <Box sx={{ p: 3, pt: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Upload Atlas manufacturer JSON files, review per-MFR diff reports, then apply with full revert support.
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {discoverStatus?.lastFinishedAt && !discoverRunning && (
            <Tooltip title={`Last scan: ${discoverStatus.scanned} legacy MFR(s) scanned · ${discoverStatus.batchesCreated} discovery batch(es) · ${discoverStatus.skipped} skipped${discoverStatus.errors ? ` · ${discoverStatus.errors} error(s)` : ''}`}>
              <Chip
                size="small"
                variant="outlined"
                label={`${discoverStatus.batchesCreated} legacy discovered`}
              />
            </Tooltip>
          )}
          <Tooltip title="Scan manufacturers loaded before the batch pipeline (no batch row) and surface their unmapped params into Dictionary Triage. Does not modify atlas_products.">
            <span>
              <Button
                startIcon={discoverRunning ? <CircularProgress size={14} /> : <TravelExploreIcon />}
                onClick={handleDiscoverLegacy}
                disabled={discoverRunning}
                size="small"
                variant="outlined"
              >
                {discoverRunning ? 'Scanning…' : 'Scan legacy MFRs'}
              </Button>
            </span>
          </Tooltip>
          <Button
            startIcon={<HelpOutlineIcon />}
            onClick={() => setHowToOpen(true)}
            size="small"
            variant="outlined"
          >
            How to
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            onClick={refreshBatches}
            disabled={loadingBatches}
            size="small"
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      <IngestHowToDrawer open={howToOpen} onClose={() => setHowToOpen(false)} />

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
