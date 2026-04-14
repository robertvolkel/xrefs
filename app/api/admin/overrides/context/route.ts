import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { validateContextOverride } from '@/lib/services/overrideValidator';
import { invalidateOverrideCache } from '@/lib/services/overrideMerger';
import { invalidateRecommendationsCache } from '@/lib/services/partDataCache';
import { ContextOverrideRecord } from '@/lib/types';

/** GET /api/admin/overrides/context?family_id=12 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const familyId = new URL(request.url).searchParams.get('family_id');
    const supabase = await createClient();

    let query = supabase
      .from('context_overrides')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (familyId) {
      query = query.eq('family_id', familyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Context overrides query error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch context overrides' },
        { status: 500 },
      );
    }

    const items: ContextOverrideRecord[] = (data ?? []).map(mapRowToRecord);

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Context overrides GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** POST /api/admin/overrides/context */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const validation = validateContextOverride(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const insert: Record<string, unknown> = {
      family_id: body.familyId,
      question_id: body.questionId,
      action: body.action,
      change_reason: body.changeReason,
      created_by: user!.id,
    };

    if (body.questionText !== undefined) insert.question_text = body.questionText;
    if (body.priority !== undefined) insert.priority = body.priority;
    if (body.required !== undefined) insert.required = body.required;
    if (body.optionValue !== undefined) insert.option_value = body.optionValue;
    if (body.optionLabel !== undefined) insert.option_label = body.optionLabel;
    if (body.optionDescription !== undefined) insert.option_description = body.optionDescription;
    if (body.attributeEffects !== undefined) insert.attribute_effects = body.attributeEffects;

    const { data, error } = await supabase
      .from('context_overrides')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('Context override insert error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create context override' },
        { status: 500 },
      );
    }

    invalidateOverrideCache(body.familyId);
    invalidateRecommendationsCache();

    return NextResponse.json({ success: true, data: mapRowToRecord(data) }, { status: 201 });
  } catch (error) {
    console.error('Context overrides POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

function mapRowToRecord(row: Record<string, unknown>): ContextOverrideRecord {
  return {
    id: row.id as string,
    familyId: row.family_id as string,
    questionId: row.question_id as string,
    action: row.action as ContextOverrideRecord['action'],
    questionText: row.question_text as string | undefined,
    priority: row.priority as number | undefined,
    required: row.required as boolean | undefined,
    optionValue: row.option_value as string | undefined,
    optionLabel: row.option_label as string | undefined,
    optionDescription: row.option_description as string | undefined,
    attributeEffects: row.attribute_effects as ContextOverrideRecord['attributeEffects'],
    isActive: row.is_active as boolean,
    changeReason: row.change_reason as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
