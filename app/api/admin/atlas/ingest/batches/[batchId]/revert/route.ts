/**
 * POST /api/admin/atlas/ingest/batches/[batchId]/revert
 * Restores the affected products from atlas_products_snapshots.
 * Refuses if status is not 'applied' or if snapshots have expired (30 days).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { runIngestScript } from '@/lib/services/atlasIngestService';
import { invalidateAtlasCache } from '@/app/api/admin/atlas/route';
import { invalidateAtlasGrowthCache } from '@/app/api/admin/atlas/growth/route';
import { invalidateManufacturersListCache } from '@/app/api/admin/manufacturers/route';

export const maxDuration = 600;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
    const { batchId } = await params;

    const result = await runIngestScript(['--revert', batchId]);

    const supabase = createServiceClient();
    const { data: batch } = await supabase
      .from('atlas_ingest_batches')
      .select('status, reverted_at')
      .eq('batch_id', batchId)
      .single();

    if (result.exitCode !== 0 || batch?.status !== 'reverted') {
      return NextResponse.json({
        success: false,
        error: result.stderr || 'Revert failed',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        batchStatus: batch?.status,
      }, { status: 500 });
    }

    invalidateAtlasCache();
    invalidateAtlasGrowthCache();
    invalidateManufacturersListCache();

    return NextResponse.json({
      success: true,
      stdout: result.stdout,
      batchStatus: batch.status,
      revertedAt: batch.reverted_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
