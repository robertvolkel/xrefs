/**
 * GET /api/admin/atlas/dictionaries/recent
 *
 * Returns the N most recent active dictionary overrides across all families
 * and L2 categories, joined with admin display names — feeds the
 * "Recently Accepted" panel on the Dictionary Triage page so engineers can
 * see/undo their recent accepts.
 *
 * Query params:
 *   limit: number (default 20, max 100)
 *
 * Service-role read: requireAdmin() upstream is the gate; bypassing RLS keeps
 * us from hitting the cookie-propagation edge case (Decision #176).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100);

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, action, attribute_id, attribute_name, unit, change_reason, created_by, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const userIds = rows.map((r) => r.created_by as string).filter(Boolean);
    const nameMap = await resolveAdminNames(userIds);

    const items = rows.map((r) => ({
      id: r.id as string,
      familyId: r.family_id as string,
      paramName: r.param_name as string,
      action: r.action as 'modify' | 'add' | 'remove',
      attributeId: (r.attribute_id as string) ?? null,
      attributeName: (r.attribute_name as string) ?? null,
      unit: (r.unit as string) ?? null,
      changeReason: (r.change_reason as string) ?? null,
      createdBy: (r.created_by as string) ?? null,
      createdByName: nameMap.get(r.created_by as string) ?? 'Unknown',
      createdAt: r.created_at as string,
    }));

    return NextResponse.json({ success: true, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
