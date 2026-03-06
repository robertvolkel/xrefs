import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateOverrideCache } from '@/lib/services/overrideMerger';

/** PATCH /api/admin/overrides/rules/:overrideId */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { overrideId } = await params;
    const body = await request.json();
    const supabase = await createClient();

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.weight !== undefined) update.weight = body.weight;
    if (body.logicType !== undefined) update.logic_type = body.logicType;
    if (body.thresholdDirection !== undefined) update.threshold_direction = body.thresholdDirection;
    if (body.upgradeHierarchy !== undefined) update.upgrade_hierarchy = body.upgradeHierarchy;
    if (body.blockOnMissing !== undefined) update.block_on_missing = body.blockOnMissing;
    if (body.tolerancePercent !== undefined) update.tolerance_percent = body.tolerancePercent;
    if (body.engineeringReason !== undefined) update.engineering_reason = body.engineeringReason;
    if (body.attributeName !== undefined) update.attribute_name = body.attributeName;
    if (body.sortOrder !== undefined) update.sort_order = body.sortOrder;
    if (body.changeReason !== undefined) update.change_reason = body.changeReason;

    const { error } = await supabase
      .from('rule_overrides')
      .update(update)
      .eq('id', overrideId);

    if (error) {
      console.error('Rule override update error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update rule override' },
        { status: 500 },
      );
    }

    // Get familyId to invalidate correct cache
    const { data: row } = await supabase
      .from('rule_overrides')
      .select('family_id')
      .eq('id', overrideId)
      .single();

    if (row) invalidateOverrideCache(row.family_id as string);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Rule override PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/overrides/rules/:overrideId (soft delete) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { overrideId } = await params;
    const supabase = await createClient();

    // Get familyId before deactivating
    const { data: row } = await supabase
      .from('rule_overrides')
      .select('family_id')
      .eq('id', overrideId)
      .single();

    const { error } = await supabase
      .from('rule_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', overrideId);

    if (error) {
      console.error('Rule override delete error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete rule override' },
        { status: 500 },
      );
    }

    if (row) invalidateOverrideCache(row.family_id as string);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Rule override DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
