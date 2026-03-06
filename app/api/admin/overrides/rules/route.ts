import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { validateRuleOverride } from '@/lib/services/overrideValidator';
import { invalidateOverrideCache } from '@/lib/services/overrideMerger';
import { RuleOverrideRecord } from '@/lib/types';

/** GET /api/admin/overrides/rules?family_id=12 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const familyId = new URL(request.url).searchParams.get('family_id');
    const supabase = await createClient();

    let query = supabase
      .from('rule_overrides')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (familyId) {
      query = query.eq('family_id', familyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Rule overrides query error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch rule overrides' },
        { status: 500 },
      );
    }

    const items: RuleOverrideRecord[] = (data ?? []).map(mapRowToRecord);

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Rule overrides GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** POST /api/admin/overrides/rules */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const validation = validateRuleOverride(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Deactivate any existing active override for this family+attribute
    await supabase
      .from('rule_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('family_id', body.familyId)
      .eq('attribute_id', body.attributeId)
      .eq('is_active', true);

    const insert: Record<string, unknown> = {
      family_id: body.familyId,
      attribute_id: body.attributeId,
      action: body.action,
      change_reason: body.changeReason,
      created_by: user!.id,
    };

    // Only include non-undefined fields
    if (body.weight !== undefined) insert.weight = body.weight;
    if (body.logicType !== undefined) insert.logic_type = body.logicType;
    if (body.thresholdDirection !== undefined) insert.threshold_direction = body.thresholdDirection;
    if (body.upgradeHierarchy !== undefined) insert.upgrade_hierarchy = body.upgradeHierarchy;
    if (body.blockOnMissing !== undefined) insert.block_on_missing = body.blockOnMissing;
    if (body.tolerancePercent !== undefined) insert.tolerance_percent = body.tolerancePercent;
    if (body.engineeringReason !== undefined) insert.engineering_reason = body.engineeringReason;
    if (body.attributeName !== undefined) insert.attribute_name = body.attributeName;
    if (body.sortOrder !== undefined) insert.sort_order = body.sortOrder;

    const { data, error } = await supabase
      .from('rule_overrides')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('Rule override insert error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create rule override' },
        { status: 500 },
      );
    }

    invalidateOverrideCache(body.familyId);

    return NextResponse.json({ success: true, data: mapRowToRecord(data) }, { status: 201 });
  } catch (error) {
    console.error('Rule overrides POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────

function mapRowToRecord(row: Record<string, unknown>): RuleOverrideRecord {
  return {
    id: row.id as string,
    familyId: row.family_id as string,
    attributeId: row.attribute_id as string,
    action: row.action as RuleOverrideRecord['action'],
    weight: row.weight as number | undefined,
    logicType: row.logic_type as RuleOverrideRecord['logicType'],
    thresholdDirection: row.threshold_direction as RuleOverrideRecord['thresholdDirection'],
    upgradeHierarchy: row.upgrade_hierarchy as string[] | undefined,
    blockOnMissing: row.block_on_missing as boolean | undefined,
    tolerancePercent: row.tolerance_percent as number | undefined,
    engineeringReason: row.engineering_reason as string | undefined,
    attributeName: row.attribute_name as string | undefined,
    sortOrder: row.sort_order as number | undefined,
    isActive: row.is_active as boolean,
    changeReason: row.change_reason as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
