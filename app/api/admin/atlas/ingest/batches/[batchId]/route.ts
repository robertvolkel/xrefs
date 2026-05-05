/**
 * GET    /api/admin/atlas/ingest/batches/[batchId] — full batch detail (incl. report JSONB)
 * DELETE /api/admin/atlas/ingest/batches/[batchId] — discard a pending batch (refuses if applied/reverted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
    const { batchId } = await params;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_ingest_batches')
      .select('*')
      .eq('batch_id', batchId)
      .single();
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json({ success: true, batch: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
    const { batchId } = await params;

    const supabase = createServiceClient();
    // Refuse to discard non-pending batches — they have snapshots that
    // need to be preserved for the revert window.
    const { data: batch, error: fetchErr } = await supabase
      .from('atlas_ingest_batches')
      .select('status, manufacturer')
      .eq('batch_id', batchId)
      .single();
    if (fetchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }
    if (batch.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: `Cannot discard batch with status='${batch.status}'. Only pending batches can be discarded.`,
      }, { status: 400 });
    }

    const { error: delErr } = await supabase
      .from('atlas_ingest_batches')
      .delete()
      .eq('batch_id', batchId);
    if (delErr) throw new Error(delErr.message);

    return NextResponse.json({ success: true, manufacturer: batch.manufacturer });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
