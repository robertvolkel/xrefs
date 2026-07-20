import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { recordParamDecision } from '@/lib/services/paramDecisionLog';

/** PATCH /api/admin/atlas/dictionaries/:overrideId */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { overrideId } = await params;
    const body = await request.json();
    const supabase = await createClient();

    const update: Record<string, unknown> = {};

    if (body.attributeId !== undefined) update.attribute_id = body.attributeId;
    if (body.attributeName !== undefined) update.attribute_name = body.attributeName;
    if (body.unit !== undefined) update.unit = body.unit;
    if (body.sortOrder !== undefined) update.sort_order = body.sortOrder;
    if (body.changeReason !== undefined) update.change_reason = body.changeReason;

    // Nothing recognized in the body ⇒ nothing changed. Return before writing.
    //
    // Two reasons this can't just fall through with a bare `updated_at` bump.
    // (1) It would append a `mapping_edited` decision for an edit that never
    //     happened — and the log is append-only, so that row is permanent.
    // (2) `updated_at` is load-bearing: for an override deactivated with
    //     nothing replacing it, that column IS the revocation time and the
    //     only record of it (see paramDecisionBackfill). Touching it on a
    //     no-op corrupts the timeline of a future revoke.
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true, unchanged: true });
    }
    update.updated_at = new Date().toISOString();

    // `.select()` ON THE UPDATE, not as a follow-up read. The previous version
    // updated, then re-read the row with `const { data: row }` — discarding
    // the read's error. A failed read left `row` null, which silently skipped
    // BOTH the decision-log write AND the dictionary cache invalidation, so a
    // stale mapping stayed live with no record that anything had changed.
    // One round trip, and an error that can't be swallowed.
    const { data: updated, error } = await supabase
      .from('atlas_dictionary_overrides')
      .update(update)
      .eq('id', overrideId)
      .select('family_id, param_name, attribute_id, attribute_name');

    if (error) {
      console.error('Atlas dict override update error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update dictionary override' },
        { status: 500 },
      );
    }

    const row = (updated ?? [])[0] as
      | { family_id: string; param_name: string; attribute_id: string | null; attribute_name: string | null }
      | undefined;

    // No row matched ⇒ the override id doesn't exist. Nothing was edited, so
    // nothing is logged.
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'Dictionary override not found' },
        { status: 404 },
      );
    }

    await recordParamDecision({
      paramName: row.param_name,
      decision: 'mapping_edited',
      decidedBy: user!.id,
      familyId: row.family_id,
      attributeId: row.attribute_id ?? null,
      attributeName: row.attribute_name ?? null,
      overrideId,
      note: (body.changeReason as string | undefined) ?? null,
      source: 'ui',
    });

    invalidateDictOverrideCache(row.family_id);
    // Single-flight per-row mutation — see dictionaries/route.ts:236 for rationale.
    await invalidateTriageQueueCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Atlas dict override PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/atlas/dictionaries/:overrideId (soft delete) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { overrideId } = await params;
    const supabase = await createClient();

    // `.eq('is_active', true)` + `.select()` — both load-bearing, and this is
    // the same defect that was already fixed once in the Decision Log's undo
    // route. Without the guard, deactivating an ALREADY-inactive override
    // still "succeeds" (0 rows matched, no error), and the old code then
    // appended a `mapping_revoked` decision crediting this admin, now, for a
    // revocation that happened earlier — or twice for one revocation if the
    // button was double-clicked. The decision log has no DELETE policy, so
    // every phantom row is permanent. Log ONLY what this request changed.
    //
    // Selecting on the update also replaces the old read-then-update pair,
    // whose read error was discarded (`const { data: row }`) — a failed read
    // silently skipped both the log write and the cache invalidation.
    const { data: revoked, error } = await supabase
      .from('atlas_dictionary_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', overrideId)
      .eq('is_active', true)
      .select('family_id, param_name, attribute_id, attribute_name');

    if (error) {
      console.error('Atlas dict override delete error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete dictionary override' },
        { status: 500 },
      );
    }

    const row = (revoked ?? [])[0] as
      | { family_id: string; param_name: string; attribute_id: string | null; attribute_name: string | null }
      | undefined;

    // Already inactive (or gone). Idempotent success for the caller — the UI
    // shows the mapping as removed either way — but nothing to log.
    if (!row) {
      await invalidateTriageQueueCache();
      return NextResponse.json({ success: true, alreadyInactive: true });
    }

    // A soft-delete with nothing replacing it is a genuine revoke (unlike
    // the accept route's deactivate-then-insert, which is an edit).
    await recordParamDecision({
      paramName: row.param_name,
      decision: 'mapping_revoked',
      decidedBy: user!.id,
      familyId: row.family_id,
      attributeId: row.attribute_id ?? null,
      attributeName: row.attribute_name ?? null,
      overrideId,
      source: 'ui',
    });

    invalidateDictOverrideCache(row.family_id);
    // Single-flight per-row mutation — see dictionaries/route.ts:236 for rationale.
    await invalidateTriageQueueCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Atlas dict override DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
