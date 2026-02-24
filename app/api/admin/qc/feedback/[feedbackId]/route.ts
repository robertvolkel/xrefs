import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { feedbackId } = await params;
    const body = await request.json();
    const { status, adminNotes } = body;

    const supabase = await createClient();

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      update.status = status;
      if (status === 'resolved' || status === 'dismissed') {
        update.resolved_by = user!.id;
        update.resolved_at = new Date().toISOString();
      }
    }
    if (adminNotes !== undefined) {
      update.admin_notes = adminNotes;
    }

    const { error } = await supabase
      .from('qc_feedback')
      .update(update)
      .eq('id', feedbackId);

    if (error) {
      console.error('Feedback update failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update feedback' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
