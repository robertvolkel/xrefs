/**
 * POST /api/admin/atlas/ingest/batches/[batchId]/regenerate
 *
 * Re-runs the report for a single pending batch — typically used after the
 * admin adds a dictionary mapping that affects this batch's unmapped params.
 * Replaces the existing pending batch row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { runIngestScript } from '@/lib/services/atlasIngestService';
import { resolve } from 'path';
import { existsSync } from 'fs';

const ATLAS_DIR = resolve(process.cwd(), 'data/atlas');
export const maxDuration = 600;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
    const { batchId } = await params;

    const supabase = createServiceClient();
    const { data: batch, error: fetchErr } = await supabase
      .from('atlas_ingest_batches')
      .select('source_file, status, manufacturer')
      .eq('batch_id', batchId)
      .single();
    if (fetchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }
    if (batch.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: `Cannot regenerate batch with status='${batch.status}'`,
      }, { status: 400 });
    }

    const filePath = resolve(ATLAS_DIR, batch.source_file);
    if (!existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: `Source file no longer exists: ${batch.source_file}`,
      }, { status: 400 });
    }

    // Re-running --report on the same file will replace the pending batch
    // (the script deletes pending rows for the same file before inserting a new one).
    const result = await runIngestScript([filePath, '--report']);

    if (result.exitCode !== 0) {
      return NextResponse.json({
        success: false,
        error: result.stderr || 'Regeneration failed',
        stdout: result.stdout,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, stdout: result.stdout });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
