/**
 * POST /api/admin/atlas/ingest/batches/[batchId]/proceed
 *
 * Spawns scripts/atlas-ingest.mjs --proceed <batchId>. Synchronously awaits
 * completion; returns final status. Apply time scales with batch size — most
 * single-MFR batches finish in 5–60 seconds.
 *
 * For Phase 2 v1 the UI shows a spinner/progress dialog and waits for this
 * route to return. SSE streaming is a Phase 2 follow-up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { runIngestScript } from '@/lib/services/atlasIngestService';
import { invalidateAtlasCache } from '@/app/api/admin/atlas/route';
import { invalidateAtlasGrowthCache } from '@/app/api/admin/atlas/growth/route';
import { invalidateManufacturersListCache } from '@/app/api/admin/manufacturers/route';

export const maxDuration = 600; // 10 minutes hard cap; should rarely approach

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
    const { batchId } = await params;

    const result = await runIngestScript(['--proceed', batchId]);

    // Re-fetch batch to confirm new status (script may have failed mid-way)
    const supabase = createServiceClient();
    const { data: batch } = await supabase
      .from('atlas_ingest_batches')
      .select('status, applied_at')
      .eq('batch_id', batchId)
      .single();

    if (result.exitCode !== 0 || batch?.status !== 'applied') {
      return NextResponse.json({
        success: false,
        error: result.stderr || 'Apply failed',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        batchStatus: batch?.status,
      }, { status: 500 });
    }

    // Apply succeeded — clear admin-stats caches so the Atlas MFRs panel and
    // the manufacturer-list page reflect the new product counts on next load.
    // Mirrors what scripts/atlas-ingest.mjs does for direct CLI applies.
    invalidateAtlasCache();
    invalidateAtlasGrowthCache();
    invalidateManufacturersListCache();

    return NextResponse.json({
      success: true,
      stdout: result.stdout,
      batchStatus: batch.status,
      appliedAt: batch.applied_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
