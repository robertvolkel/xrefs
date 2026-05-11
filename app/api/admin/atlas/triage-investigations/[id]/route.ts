/**
 * PATCH /api/admin/atlas/triage-investigations/[id] — record the engineer's
 * follow-up action on a previously-logged investigation. Called by the UI
 * after Accept (override created), Confirm Wrong Family, or Mark Unmappable
 * complete successfully. First action wins — re-PATCHing the same row is a
 * no-op so concurrent click handlers can't race.
 *
 * Body shape:
 *   {
 *     action_taken: 'override_created' | 'flagged_wrong_family' | 'marked_unmappable' | 'dismissed',
 *     resulting_override_id?: string  // UUID, only populated when action_taken='override_created'
 *   }
 *
 * Service-role write — requireAdmin gates upstream (Decision #176 pattern).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

const VALID_ACTIONS = new Set([
  'override_created',
  'flagged_wrong_family',
  'marked_unmappable',
  'dismissed',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }

    const body = await request.json();
    const actionTaken = body?.action_taken as string | undefined;
    const resultingOverrideId = (body?.resulting_override_id as string | undefined) ?? null;

    if (!actionTaken || !VALID_ACTIONS.has(actionTaken)) {
      return NextResponse.json(
        { success: false, error: `Invalid action_taken: ${actionTaken}` },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // First-action-wins: only update rows where action_taken IS NULL. This
    // makes the endpoint idempotent under concurrent click handlers and
    // preserves the original action record if the engineer clicks twice.
    const { data, error } = await supabase
      .from('atlas_triage_investigations')
      .update({
        action_taken: actionTaken,
        action_at: new Date().toISOString(),
        resulting_override_id: resultingOverrideId,
      })
      .eq('id', id)
      .is('action_taken', null)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('atlas_triage_investigations PATCH failed:', error);
      return NextResponse.json(
        { success: false, error: 'Database error', detail: error.message },
        { status: 500 },
      );
    }

    // data === null means either: the row doesn't exist, or action_taken
    // was already set. Both cases are non-errors from the caller's POV —
    // the audit row is in a final state.
    return NextResponse.json({ success: true, updated: !!data });
  } catch (err) {
    console.error('triage-investigations PATCH error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
