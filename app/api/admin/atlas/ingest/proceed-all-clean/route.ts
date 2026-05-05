/**
 * POST /api/admin/atlas/ingest/proceed-all-clean
 *
 * Bulk-applies every pending batch with risk='clean'.
 * Concurrency is handled inside the script (--concurrency flag).
 * Returns summary counts and per-failure detail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { runIngestScript } from '@/lib/services/atlasIngestService';
import { invalidateAtlasCache } from '@/app/api/admin/atlas/route';
import { invalidateAtlasGrowthCache } from '@/app/api/admin/atlas/growth/route';
import { invalidateManufacturersListCache } from '@/app/api/admin/manufacturers/route';

export const maxDuration = 600;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const concurrency = Math.min(Math.max(parseInt(String(body?.concurrency ?? '5'), 10) || 5, 1), 20);

    const result = await runIngestScript(['--proceed-all-clean', '--concurrency', String(concurrency)]);

    if (result.exitCode !== 0) {
      return NextResponse.json({
        success: false,
        error: result.stderr || 'Bulk apply failed',
        stdout: result.stdout,
        stderr: result.stderr,
      }, { status: 500 });
    }

    invalidateAtlasCache();
    invalidateAtlasGrowthCache();
    invalidateManufacturersListCache();

    return NextResponse.json({
      success: true,
      stdout: result.stdout,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
