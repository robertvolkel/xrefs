/**
 * POST /api/admin/atlas/ingest/report
 *
 * Body: { files: string[] }  // basenames, must already be staged in data/atlas/
 *
 * Fires off scripts/atlas-ingest.mjs --report in the background. The script
 * inserts pending batch rows in atlas_ingest_batches and writes markdown
 * reports to /tmp. **Returns immediately** — does NOT wait for completion.
 *
 * Rationale: large MFR files (e.g. YANGJIE @ 20MB / 12,932 products) can take
 * 5+ minutes to process. Awaiting the script meant any browser disconnect,
 * page navigation, or platform request timeout left the upload in a bad state
 * (file on disk, no batch row inserted). The script writes to the DB
 * independently — we don't need the HTTP request alive.
 *
 * The UI calls this endpoint, sees a near-instant 200 response, then polls
 * /api/admin/atlas/ingest/batches?status=pending to detect new batches as
 * they land (typically within 30s-5min per file).
 *
 * Logs from the background run go to /tmp/atlas-ingest-bg-<timestamp>.log
 * for post-hoc debugging.
 *
 * Response:
 *   { success: true, queued: number, logPath: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, openSync } from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { invalidateTriageQueueCacheAndAwaitFresh } from '@/lib/services/triageQueueCache';

const ATLAS_DIR = resolve(process.cwd(), 'data/atlas');

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const filenames: unknown = body?.files;
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return NextResponse.json({ success: false, error: 'files[] required' }, { status: 400 });
    }

    // Resolve to absolute paths and validate existence
    const filePaths: string[] = [];
    for (const f of filenames) {
      if (typeof f !== 'string') continue;
      // Reject path traversal — only basenames are allowed
      if (f.includes('/') || f.includes('\\') || f === '..') {
        return NextResponse.json({ success: false, error: `Invalid filename: ${f}` }, { status: 400 });
      }
      const abs = resolve(ATLAS_DIR, f);
      if (!existsSync(abs)) {
        return NextResponse.json({ success: false, error: `Missing staged file: ${f}` }, { status: 400 });
      }
      filePaths.push(abs);
    }

    // Spawn the script detached with output redirected to a log file. The
    // child survives the HTTP request lifecycle; we don't await it.
    const cwd = process.cwd();
    const scriptPath = resolve(cwd, 'scripts/atlas-ingest.mjs');
    const logPath = `/tmp/atlas-ingest-bg-${Date.now()}.log`;
    const logFd = openSync(logPath, 'a');

    const child = spawn('node', [scriptPath, ...filePaths, '--report'], {
      cwd,
      env: { ...process.env },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });

    // When the background run finishes, invalidate the triage cache so the
    // new batch's unmapped params surface immediately on next queue read.
    // Fire-and-forget — failures here don't affect the user's flow.
    child.on('close', (code) => {
      void invalidateTriageQueueCacheAndAwaitFresh().catch((e) => {
        console.error('[ingest/report] cache invalidation failed:', e);
      });
      if (code !== 0) {
        console.error(`[ingest/report] background script exited with code ${code}; see ${logPath}`);
      }
    });

    // Detach so the Node.js parent doesn't wait on the child handle.
    child.unref();

    return NextResponse.json({
      success: true,
      queued: filenames.length,
      logPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
