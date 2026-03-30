import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/admin/overrides/rules/annotations/:annotationId
 *
 * Update annotation body (own comments only) or resolve/unresolve (any admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ annotationId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { annotationId } = await params;
    const body = await request.json();
    const supabase = await createClient();

    // Fetch current annotation
    const { data: current, error: fetchError } = await supabase
      .from('rule_annotations')
      .select('*')
      .eq('id', annotationId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: 'Annotation not found' },
        { status: 404 },
      );
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Body update — own comments only
    if (body.body !== undefined) {
      if (current.created_by !== user!.id) {
        return NextResponse.json(
          { success: false, error: 'Can only edit your own annotations' },
          { status: 403 },
        );
      }
      if (!body.body?.trim()) {
        return NextResponse.json(
          { success: false, error: 'Annotation body cannot be empty' },
          { status: 400 },
        );
      }
      update.body = body.body.trim();
    }

    // Resolve/unresolve — any admin
    if (body.isResolved !== undefined) {
      update.is_resolved = body.isResolved;
      if (body.isResolved) {
        update.resolved_by = user!.id;
        update.resolved_at = new Date().toISOString();
      } else {
        update.resolved_by = null;
        update.resolved_at = null;
      }
    }

    const { error } = await supabase
      .from('rule_annotations')
      .update(update)
      .eq('id', annotationId);

    if (error) {
      console.error('Rule annotation update error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update annotation' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Rule annotation PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/overrides/rules/annotations/:annotationId
 *
 * Hard delete — own annotations only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ annotationId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { annotationId } = await params;
    const supabase = await createClient();

    // Verify ownership
    const { data: current, error: fetchError } = await supabase
      .from('rule_annotations')
      .select('created_by')
      .eq('id', annotationId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: 'Annotation not found' },
        { status: 404 },
      );
    }

    if (current.created_by !== user!.id) {
      return NextResponse.json(
        { success: false, error: 'Can only delete your own annotations' },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from('rule_annotations')
      .delete()
      .eq('id', annotationId);

    if (error) {
      console.error('Rule annotation delete error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete annotation' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Rule annotation DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
