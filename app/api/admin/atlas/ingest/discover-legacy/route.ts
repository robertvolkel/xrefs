/**
 * Atlas Legacy Discovery — admin trigger + status.
 *
 * "Legacy" Atlas MFRs were loaded before the batch pipeline (Decision #174)
 * existed, so they have no atlas_ingest_batches row — and the Triage queue
 * reads unmapped params ONLY from batch reports. Their genuinely-unmapped
 * params are therefore invisible/undiscoverable in Triage.
 *
 * This endpoint spawns `scripts/atlas-ingest.mjs --discover-legacy`, which
 * re-runs the current mapper over every source file that has no batch and
 * writes a slim status='discovery' batch carrying that MFR's unmappedParams.
 * The existing Triage RPC/compute/UI then surface them with ~zero downstream
 * changes. It does NOT touch atlas_products (that's --backfill-translations).
 *
 * Mirrors app/api/admin/atlas/backfill-translations/route.ts: detached child
 * process, status row in admin_stats_cache as the lock, 202 on start. The one
 * addition is that on child exit we invalidate the in-process Triage queue
 * cache (the spawned .mjs can only clear the persistent admin_stats_cache rows;
 * the L1 cache + wait-then-restart recompute live in this Next.js process).
 *
 * Endpoints:
 *   POST  /api/admin/atlas/ingest/discover-legacy   — spawn + return 202
 *   GET   /api/admin/atlas/ingest/discover-legacy   — read status row
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { openSync, readFileSync, existsSync } from 'fs';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateTriageQueueCacheAndAwaitFresh } from '@/lib/services/triageQueueCache';

const STATUS_KEY = 'atlas-discover-legacy-status';

type DiscoverStatus = {
  lastStartedAt: string;
  lastFinishedAt: string | null;
  scanned: number;
  batchesCreated: number;
  skipped: number;
  errors: number;
  logPath: string;
  exitCode: number | null;
};

async function readStatus(): Promise<DiscoverStatus | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_stats_cache')
    .select('payload')
    .eq('key', STATUS_KEY)
    .maybeSingle();
  return (data?.payload as DiscoverStatus | undefined) ?? null;
}

async function writeStatus(status: DiscoverStatus): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('admin_stats_cache')
    .upsert(
      { key: STATUS_KEY, payload: status, computed_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
}

/** Parse the final summary line written by atlas-ingest.mjs:
 *  "Scanned 102 / BatchesCreated 102 / Skipped 280 / Errors 0" */
function parseFinalSummary(log: string): Partial<DiscoverStatus> | null {
  const m = log.match(
    /Scanned (\d+) \/ BatchesCreated (\d+) \/ Skipped (\d+) \/ Errors (\d+)/,
  );
  if (!m) return null;
  return {
    scanned: Number(m[1]),
    batchesCreated: Number(m[2]),
    skipped: Number(m[3]),
    errors: Number(m[4]),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
    const status = await readStatus();
    return NextResponse.json({ success: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    // Lock-by-status (same mechanism as backfill-translations): the status row
    // is the lock; a started_at older than 10 min is treated as a dead lock.
    const existing = await readStatus();
    if (existing && !existing.lastFinishedAt) {
      const ageMs = Date.now() - Date.parse(existing.lastStartedAt);
      const STALE_LOCK_MS = 10 * 60 * 1000;
      if (ageMs < STALE_LOCK_MS) {
        return NextResponse.json(
          { success: false, error: 'A discovery scan is already running. Wait for it to finish.', status: existing },
          { status: 409 },
        );
      }
      // else fall through; the new spawn overwrites the stale row.
    }

    const cwd = process.cwd();
    const scriptPath = resolve(cwd, 'scripts/atlas-ingest.mjs');
    const logPath = `/tmp/atlas-discover-legacy-${Date.now()}.log`;
    const logFd = openSync(logPath, 'a');

    const startedAt = new Date().toISOString();
    await writeStatus({
      lastStartedAt: startedAt,
      lastFinishedAt: null,
      scanned: 0,
      batchesCreated: 0,
      skipped: 0,
      errors: 0,
      logPath,
      exitCode: null,
    });

    // Spread an args array (not a literal) so Turbopack doesn't statically
    // analyse the spawn() call and mis-resolve scriptPath as a module import.
    const scriptArgs = ['--discover-legacy'];
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      cwd,
      env: { ...process.env },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });

    child.on('close', async (code) => {
      try {
        const finishedAt = new Date().toISOString();
        const log = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
        const parsed = parseFinalSummary(log);
        await writeStatus({
          lastStartedAt: startedAt,
          lastFinishedAt: finishedAt,
          scanned: parsed?.scanned ?? 0,
          batchesCreated: parsed?.batchesCreated ?? 0,
          skipped: parsed?.skipped ?? 0,
          errors: parsed?.errors ?? (code === 0 ? 0 : 1),
          logPath,
          exitCode: code,
        });
        // The script cleared the persistent admin_stats_cache rows; here we
        // drain + restart the in-process Triage queue cache so the engineer's
        // next Triage load reflects the new discovery params immediately.
        if (code === 0 && (parsed?.batchesCreated ?? 0) > 0) {
          await invalidateTriageQueueCacheAndAwaitFresh();
        }
      } catch (err) {
        console.error('[atlas-discover-legacy] status write failed:', err);
      }
    });

    child.unref();

    return NextResponse.json(
      { success: true, lastStartedAt: startedAt, logPath, message: 'Legacy discovery started — Triage will update when it finishes.' },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
