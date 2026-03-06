import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/** PATCH /api/admin/releases/:id — update a release note (admin only) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;
    const { content } = await request.json();
    if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Content required (max 1000 chars)' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('release_notes')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Release note update error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update release note' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Release note PATCH error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/releases/:id — delete a release note (admin only) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('release_notes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Release note delete error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete release note' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Release note DELETE error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
