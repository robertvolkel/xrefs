import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateOverrideCache } from '@/lib/services/overrideMerger';
import { invalidateRecommendationsCache } from '@/lib/services/partDataCache';

/** PATCH /api/admin/overrides/context/:overrideId */
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

    if (body.questionText !== undefined) update.question_text = body.questionText;
    if (body.priority !== undefined) update.priority = body.priority;
    if (body.required !== undefined) update.required = body.required;
    if (body.optionValue !== undefined) update.option_value = body.optionValue;
    if (body.optionLabel !== undefined) update.option_label = body.optionLabel;
    if (body.optionDescription !== undefined) update.option_description = body.optionDescription;
    if (body.attributeEffects !== undefined) update.attribute_effects = body.attributeEffects;
    if (body.changeReason !== undefined) update.change_reason = body.changeReason;

    const { error } = await supabase
      .from('context_overrides')
      .update(update)
      .eq('id', overrideId);

    if (error) {
      console.error('Context override update error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update context override' },
        { status: 500 },
      );
    }

    const { data: row } = await supabase
      .from('context_overrides')
      .select('family_id')
      .eq('id', overrideId)
      .single();

    if (row) invalidateOverrideCache(row.family_id as string);
    invalidateRecommendationsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Context override PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/overrides/context/:overrideId (soft delete) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { overrideId } = await params;
    const supabase = await createClient();

    const { data: row } = await supabase
      .from('context_overrides')
      .select('family_id')
      .eq('id', overrideId)
      .single();

    const { error } = await supabase
      .from('context_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', overrideId);

    if (error) {
      console.error('Context override delete error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete context override' },
        { status: 500 },
      );
    }

    if (row) invalidateOverrideCache(row.family_id as string);
    invalidateRecommendationsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Context override DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
