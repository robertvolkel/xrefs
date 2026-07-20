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

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.attributeId !== undefined) update.attribute_id = body.attributeId;
    if (body.attributeName !== undefined) update.attribute_name = body.attributeName;
    if (body.unit !== undefined) update.unit = body.unit;
    if (body.sortOrder !== undefined) update.sort_order = body.sortOrder;
    if (body.changeReason !== undefined) update.change_reason = body.changeReason;

    const { error } = await supabase
      .from('atlas_dictionary_overrides')
      .update(update)
      .eq('id', overrideId);

    if (error) {
      console.error('Atlas dict override update error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update dictionary override' },
        { status: 500 },
      );
    }

    // Get familyId to invalidate correct cache (widened for the decision log).
    const { data: row } = await supabase
      .from('atlas_dictionary_overrides')
      .select('family_id, param_name, attribute_id, attribute_name')
      .eq('id', overrideId)
      .single();

    if (row) {
      await recordParamDecision({
        paramName: row.param_name as string,
        decision: 'mapping_edited',
        decidedBy: user!.id,
        familyId: row.family_id as string,
        attributeId: (row.attribute_id as string | null) ?? null,
        attributeName: (row.attribute_name as string | null) ?? null,
        overrideId,
        note: (body.changeReason as string | undefined) ?? null,
        source: 'ui',
      });
    }

    if (row) invalidateDictOverrideCache(row.family_id as string);
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

    // Read before deactivating — afterwards the row is inactive and we'd
    // still need its identity for the log entry.
    const { data: row } = await supabase
      .from('atlas_dictionary_overrides')
      .select('family_id, param_name, attribute_id, attribute_name')
      .eq('id', overrideId)
      .single();

    const { error } = await supabase
      .from('atlas_dictionary_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', overrideId);

    if (error) {
      console.error('Atlas dict override delete error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete dictionary override' },
        { status: 500 },
      );
    }

    // A soft-delete with nothing replacing it is a genuine revoke (unlike
    // the accept route's deactivate-then-insert, which is an edit).
    if (row) {
      await recordParamDecision({
        paramName: row.param_name as string,
        decision: 'mapping_revoked',
        decidedBy: user!.id,
        familyId: row.family_id as string,
        attributeId: (row.attribute_id as string | null) ?? null,
        attributeName: (row.attribute_name as string | null) ?? null,
        overrideId,
        source: 'ui',
      });
    }

    if (row) invalidateDictOverrideCache(row.family_id as string);
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
