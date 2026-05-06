/**
 * GET /api/admin/atlas/unmapped-param-notes
 *
 * Returns every team note attached to an unmapped param. The Triage page
 * fetches once on mount and keeps the keyed map in component state — count
 * is bounded by the dedup-keyed unmapped-params space (≤ a few hundred), so
 * pagination is not required.
 *
 * Service-role read: requireAdmin() upstream is the gate; bypassing RLS
 * keeps us from hitting the cookie-propagation edge case (Decision #176).
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';

export async function GET(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('atlas_unmapped_param_notes')
      .select('param_name, note, updated_by, updated_at, created_at')
      .order('updated_at', { ascending: false });

    if (error) {
      // Table missing / transient failure — surface empty list rather than
      // breaking the Triage page entirely.
      return NextResponse.json({ success: true, items: [] });
    }

    const rows = data ?? [];
    const userIds = rows.map((r) => r.updated_by as string).filter(Boolean);
    const nameMap = await resolveAdminNames(userIds);

    const items = rows.map((r) => ({
      paramName: r.param_name as string,
      note: r.note as string,
      updatedBy: r.updated_by as string,
      updatedByName: nameMap.get(r.updated_by as string) ?? 'Unknown',
      updatedAt: r.updated_at as string,
      createdAt: r.created_at as string,
    }));

    return NextResponse.json({ success: true, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
