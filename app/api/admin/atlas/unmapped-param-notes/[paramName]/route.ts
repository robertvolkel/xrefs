/**
 * PUT    /api/admin/atlas/unmapped-param-notes/[paramName]  — upsert note
 * DELETE /api/admin/atlas/unmapped-param-notes/[paramName]  — clear note
 *
 * Service-role writes (per Decision #176 lesson — admin auth gated by
 * requireAdmin() upstream).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';

const MAX_NOTE_LENGTH = 5000;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ paramName: string }> },
): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { paramName } = await params;
    const decodedParamName = decodeURIComponent(paramName);
    if (!decodedParamName.trim()) {
      return NextResponse.json({ success: false, error: 'paramName required' }, { status: 400 });
    }

    const body = await request.json();
    const note = typeof body?.note === 'string' ? body.note : '';

    const supabase = createServiceClient();

    // Empty note → treat as delete so the icon flips back to its empty
    // state and we don't leave dangling rows around.
    if (!note.trim()) {
      const { error: delErr } = await supabase
        .from('atlas_unmapped_param_notes')
        .delete()
        .eq('param_name', decodedParamName);
      if (delErr) {
        return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, deleted: true });
    }

    if (note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Note exceeds ${MAX_NOTE_LENGTH} character limit` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('atlas_unmapped_param_notes')
      .upsert(
        {
          param_name: decodedParamName,
          note,
          updated_by: user!.id,
          updated_at: now,
        },
        { onConflict: 'param_name' },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const nameMap = await resolveAdminNames([user!.id]);

    return NextResponse.json({
      success: true,
      item: {
        paramName: data.param_name as string,
        note: data.note as string,
        updatedBy: data.updated_by as string,
        updatedByName: nameMap.get(data.updated_by as string) ?? 'Unknown',
        updatedAt: data.updated_at as string,
        createdAt: data.created_at as string,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ paramName: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { paramName } = await params;
    const decodedParamName = decodeURIComponent(paramName);

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('atlas_unmapped_param_notes')
      .delete()
      .eq('param_name', decodedParamName);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
