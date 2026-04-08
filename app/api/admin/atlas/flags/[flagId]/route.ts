import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ flagId: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { flagId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['resolved', 'dismissed', 'open'].includes(status)) {
      return NextResponse.json({ error: 'status must be open, resolved, or dismissed' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const updates: Record<string, unknown> = { status };
    if (status === 'resolved' || status === 'dismissed') {
      updates.resolved_by = user!.id;
      updates.resolved_at = new Date().toISOString();
    } else {
      updates.resolved_by = null;
      updates.resolved_at = null;
    }

    const { error } = await supabase
      .from('atlas_product_flags')
      .update(updates)
      .eq('id', flagId);

    if (error) {
      console.error('Atlas flag update error:', error.message);
      return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
