import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateOverrideCache } from '@/lib/services/overrideMerger';
import { invalidateRecommendationsCache } from '@/lib/services/partDataCache';
import { snapshotRuleState } from '@/lib/services/overrideHistoryHelper';

/** Fields that can be patched on a rule override. */
const PATCH_FIELD_MAP: Record<string, string> = {
  weight: 'weight',
  logicType: 'logic_type',
  thresholdDirection: 'threshold_direction',
  upgradeHierarchy: 'upgrade_hierarchy',
  blockOnMissing: 'block_on_missing',
  tolerancePercent: 'tolerance_percent',
  valueAliases: 'value_aliases',
  engineeringReason: 'engineering_reason',
  attributeName: 'attribute_name',
  sortOrder: 'sort_order',
  changeReason: 'change_reason',
};

/**
 * PATCH /api/admin/overrides/rules/:overrideId
 *
 * Converted to deactivate-and-create pattern for audit trail.
 * The current record is deactivated, and a new record is inserted
 * with merged fields + previous_values snapshot.
 */
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

    // 1. Fetch the current active record
    const { data: current, error: fetchError } = await supabase
      .from('rule_overrides')
      .select('*')
      .eq('id', overrideId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: 'Override not found' },
        { status: 404 },
      );
    }

    // 2. Snapshot current state as previous_values
    const previousValues = snapshotRuleState(
      current.family_id as string,
      current.attribute_id as string,
      current as Record<string, unknown>,
      current.action as string,
    );

    // 3. Deactivate the current record
    await supabase
      .from('rule_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', overrideId);

    // 4. Build new record: current fields merged with patch body
    const insert: Record<string, unknown> = {
      family_id: current.family_id,
      attribute_id: current.attribute_id,
      action: current.action,
      weight: current.weight,
      logic_type: current.logic_type,
      threshold_direction: current.threshold_direction,
      upgrade_hierarchy: current.upgrade_hierarchy,
      block_on_missing: current.block_on_missing,
      tolerance_percent: current.tolerance_percent,
      value_aliases: current.value_aliases,
      engineering_reason: current.engineering_reason,
      attribute_name: current.attribute_name,
      sort_order: current.sort_order,
      change_reason: current.change_reason,
      created_by: user!.id,
      previous_values: previousValues,
    };

    // Apply patch fields on top
    for (const [camel, snake] of Object.entries(PATCH_FIELD_MAP)) {
      if (body[camel] !== undefined) {
        insert[snake] = body[camel];
      }
    }

    const { error: insertError } = await supabase
      .from('rule_overrides')
      .insert(insert);

    if (insertError) {
      console.error('Rule override patch-insert error:', insertError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update rule override' },
        { status: 500 },
      );
    }

    invalidateOverrideCache(current.family_id as string);
    invalidateRecommendationsCache();

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
    invalidateRecommendationsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Rule override DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
