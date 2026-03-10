import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateDictOverrideCache } from '@/lib/services/atlasMapper';

/** PATCH /api/admin/atlas/dictionaries/:overrideId */
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

    // Get familyId to invalidate correct cache
    const { data: row } = await supabase
      .from('atlas_dictionary_overrides')
      .select('family_id')
      .eq('id', overrideId)
      .single();

    if (row) invalidateDictOverrideCache(row.family_id as string);

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
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { overrideId } = await params;
    const supabase = await createClient();

    // Get familyId before deactivating
    const { data: row } = await supabase
      .from('atlas_dictionary_overrides')
      .select('family_id')
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

    if (row) invalidateDictOverrideCache(row.family_id as string);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Atlas dict override DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
