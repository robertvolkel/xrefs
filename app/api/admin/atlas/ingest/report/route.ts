/**
 * POST /api/admin/atlas/ingest/report
 *
 * Body: { files: string[] }  // basenames, must already be staged in data/atlas/
 *
 * Spawns scripts/atlas-ingest.mjs --report against the given files.
 * The script inserts pending batch rows in atlas_ingest_batches and writes
 * markdown reports to /tmp.
 *
 * Response:
 *   { success: true, exitCode, batchIds: string[], stdout, stderr? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { runIngestScript } from '@/lib/services/atlasIngestService';

const ATLAS_DIR = resolve(process.cwd(), 'data/atlas');

export const maxDuration = 600; // 10 minutes; report generation can be slow at scale

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

    // Run the script. It writes one pending batch row per file to atlas_ingest_batches.
    const result = await runIngestScript([...filePaths, '--report']);

    if (result.exitCode !== 0) {
      return NextResponse.json({
        success: false,
        exitCode: result.exitCode,
        error: result.stderr || 'Report generation failed',
        stdout: result.stdout,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
