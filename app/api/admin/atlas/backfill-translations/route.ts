/**
 * Atlas Translation Backfill — admin trigger + status.
 *
 * Replaces the engineer-typing-`npm run atlas:backfill` workflow with a
 * one-click button + status badge in the Atlas MFRs admin panel.
 *
 * Why this exists (May 23, 2026 — Decision #199 sequel):
 *   Dict overrides fire at INGEST time only — for already-applied products
 *   to reflect today's accepts, we must re-translate their parameters JSONB
 *   against current overrides. That's what scripts/atlas-ingest.mjs
 *   --backfill-translations does. Asking an engineer to drop to a terminal
 *   after every Triage session was friction; this endpoint spawns the same
 *   script detached and tracks its run state so the UI can render
 *   "Last run: 23m ago — 37,514 changed" inline next to the trigger.
 *
 * Why a child process (not in-process loop):
 *   The backfill walks 144 source files + 37K UPDATEs against Supabase.
 *   Wall time is ~5 min. Running it inside the Next.js request lifecycle
 *   would either block the request (terrible UX, fetch timeouts in
 *   production) or require an ad-hoc job queue. The same atlas-ingest.mjs
 *   already implements --backfill-translations correctly and is spawnable
 *   detached (mirrors the ingest/report pattern). Single-source for the
 *   mapping logic, no duplication.
 *
 * Status tracking:
 *   `admin_stats_cache` row keyed 'atlas-backfill-status' carries the
 *   most-recent run's lifecycle in its payload JSONB:
 *     { lastStartedAt, lastFinishedAt | null, scanned, changed, missing,
 *       errors, logPath }
 *   - lastFinishedAt null + lastStartedAt recent → in-flight (button
 *     disables; UI polls)
 *   - lastFinishedAt > lastStartedAt → done; UI shows counts + age
 *   - The status row is the lock: a second POST while in-flight 409s,
 *     preventing double-runs that would race on atlas_products writes.
 *
 * Endpoints:
 *   POST  /api/admin/atlas/backfill-translations   — spawn + return 202
 *   GET   /api/admin/atlas/backfill-translations   — read status row
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { openSync, readFileSync, existsSync } from 'fs';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateManufacturersListCache } from '@/app/api/admin/manufacturers/route';

const STATUS_KEY = 'atlas-backfill-status';

type BackfillStatus = {
  lastStartedAt: string;
  lastFinishedAt: string | null;
  scanned: number;
  changed: number;
  unchanged: number;
  missing: number;
  errors: number;
  logPath: string;
  exitCode: number | null;
  // Live progress fields — written by the script's throttled heartbeat while
  // in-flight (lastFinishedAt === null). All optional/additive: pre-progress
  // rows and the final write (close listener) simply omit them.
  totalFiles?: number;
  processedFiles?: number;
  currentMfr?: string | null;
  recentMfrs?: Array<{ name: string; changed: number; unchanged: number; missing: number }>;
  heartbeatAt?: string;
};

async function readStatus(): Promise<BackfillStatus | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_stats_cache')
    .select('payload')
    .eq('key', STATUS_KEY)
    .maybeSingle();
  return (data?.payload as BackfillStatus | undefined) ?? null;
}

async function writeStatus(status: BackfillStatus): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('admin_stats_cache')
    .upsert(
      { key: STATUS_KEY, payload: status, computed_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
}

/** Parse the final summary line written by atlas-ingest.mjs:
 *  "Scanned 198626 / Changed 37514 / Unchanged 145425 / Missing 15687 / Errors 0"
 *  Resilient to extra log noise — looks for the line by its label set. */
function parseFinalSummary(log: string): Partial<BackfillStatus> | null {
  const m = log.match(
    /Scanned (\d+) \/ Changed (\d+) \/ Unchanged (\d+) \/ Missing (\d+) \/ Errors (\d+)/,
  );
  if (!m) return null;
  return {
    scanned: Number(m[1]),
    changed: Number(m[2]),
    unchanged: Number(m[3]),
    missing: Number(m[4]),
    errors: Number(m[5]),
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

    // Lock-by-status: refuse to start if an earlier run hasn't finished.
    // The status row IS the lock — no separate mutex needed because
    // Supabase upserts are serialised. Worst case (a stale in-flight row
    // from a crashed run): user waits at most ~10 min after the original
    // start time before they can retry; we treat any started_at older than
    // 10 min as a dead lock and let the new run claim it.
    const existing = await readStatus();
    if (existing && !existing.lastFinishedAt) {
      const startedMs = Date.parse(existing.lastStartedAt);
      const ageMs = Date.now() - startedMs;
      const STALE_LOCK_MS = 10 * 60 * 1000;
      if (ageMs < STALE_LOCK_MS) {
        return NextResponse.json(
          { success: false, error: 'A backfill is already running. Wait for it to finish.', status: existing },
          { status: 409 },
        );
      }
      // else fall through; the new spawn will overwrite the stale row.
    }

    const cwd = process.cwd();
    const scriptPath = resolve(cwd, 'scripts/atlas-ingest.mjs');
    const logPath = `/tmp/atlas-backfill-${Date.now()}.log`;
    const logFd = openSync(logPath, 'a');

    const startedAt = new Date().toISOString();
    await writeStatus({
      lastStartedAt: startedAt,
      lastFinishedAt: null,
      scanned: 0,
      changed: 0,
      unchanged: 0,
      missing: 0,
      errors: 0,
      logPath,
      exitCode: null,
    });

    // Spread an args array (not a literal) so Turbopack doesn't statically
    // analyse the spawn() call and mis-resolve scriptPath as a module import.
    // Same trick as app/api/admin/atlas/ingest/report/route.ts.
    const scriptArgs = ['--backfill-translations'];
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      cwd,
      env: {
        ...process.env,
        // Opt the script into writing live progress heartbeats to the same
        // admin_stats_cache status row this route manages. Absent for terminal
        // runs, so a manual `npm run atlas:backfill` never touches the row.
        BACKFILL_EMIT_STATUS: '1',
        BACKFILL_STARTED_AT: startedAt,
        BACKFILL_LOG_PATH: logPath,
      },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });

    // On exit, read the log tail and persist the parsed summary.
    // Fire-and-forget — failure to write status doesn't roll back the
    // backfill (atlas_products is already updated by the script).
    child.on('close', async (code) => {
      try {
        const finishedAt = new Date().toISOString();
        const log = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
        const parsed = parseFinalSummary(log);
        await writeStatus({
          lastStartedAt: startedAt,
          lastFinishedAt: finishedAt,
          scanned: parsed?.scanned ?? 0,
          changed: parsed?.changed ?? 0,
          unchanged: parsed?.unchanged ?? 0,
          missing: parsed?.missing ?? 0,
          errors: parsed?.errors ?? (code === 0 ? 0 : 1),
          logPath,
          exitCode: code,
        });
        // Refresh the admin manufacturers/coverage stats now that the backfill
        // re-translated parameters. Use the same SWR helper the proceed/revert
        // routes use (background recompute that keeps serving the prior payload
        // until fresh lands) — NOT a synchronous force-refresh, which can hang
        // under post-burst load and surface "Stats failed to refresh". Only when
        // something actually changed; a 0-change run leaves coverage untouched.
        if ((parsed?.changed ?? 0) > 0) {
          invalidateManufacturersListCache();
        }
      } catch (err) {
        console.error('[atlas-backfill] status write failed:', err);
      }
    });

    child.unref();

    return NextResponse.json(
      { success: true, lastStartedAt: startedAt, logPath, message: 'Backfill started — coverage will update in ~5 min.' },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
