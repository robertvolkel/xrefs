import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateOverrideCache } from '@/lib/services/overrideMerger';
import { invalidateRecommendationsCache } from '@/lib/services/partDataCache';
import { snapshotRuleState } from '@/lib/services/overrideHistoryHelper';

/**
 * POST /api/admin/overrides/rules/restore
 *
 * Restores a rule override to a previous version from the history chain.
 * Creates a new active record with the source record's field values.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const { overrideId, changeReason } = body;

    if (!overrideId || !changeReason?.trim()) {
      return NextResponse.json(
        { success: false, error: 'overrideId and changeReason are required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // 1. Fetch the source record (can be active or inactive)
    const { data: source, error: fetchError } = await supabase
      .from('rule_overrides')
      .select('*')
      .eq('id', overrideId)
      .single();

    if (fetchError || !source) {
      return NextResponse.json(
        { success: false, error: 'Source override not found' },
        { status: 404 },
      );
    }

    const familyId = source.family_id as string;
    const attributeId = source.attribute_id as string;

    // 2. Fetch current active override to compute previous_values
    const { data: currentActive } = await supabase
      .from('rule_overrides')
      .select('*')
      .eq('family_id', familyId)
      .eq('attribute_id', attributeId)
      .eq('is_active', true)
      .maybeSingle();

    const previousValues = snapshotRuleState(
      familyId,
      attributeId,
      currentActive as Record<string, unknown> | null,
      source.action as string,
    );

    // 3. Deactivate any currently active override
    await supabase
      .from('rule_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('family_id', familyId)
      .eq('attribute_id', attributeId)
      .eq('is_active', true);

    // 4. Insert new record with source's field values
    const insert: Record<string, unknown> = {
      family_id: familyId,
      attribute_id: attributeId,
      action: source.action,
      weight: source.weight,
      logic_type: source.logic_type,
      threshold_direction: source.threshold_direction,
      upgrade_hierarchy: source.upgrade_hierarchy,
      block_on_missing: source.block_on_missing,
      tolerance_percent: source.tolerance_percent,
      engineering_reason: source.engineering_reason,
      attribute_name: source.attribute_name,
      sort_order: source.sort_order,
      change_reason: changeReason.trim(),
      created_by: user!.id,
      previous_values: previousValues,
    };

    const { error: insertError } = await supabase
      .from('rule_overrides')
      .insert(insert);

    if (insertError) {
      console.error('Rule override restore insert error:', insertError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to restore override' },
        { status: 500 },
      );
    }

    invalidateOverrideCache(familyId);
    invalidateRecommendationsCache();

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Rule override restore error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
