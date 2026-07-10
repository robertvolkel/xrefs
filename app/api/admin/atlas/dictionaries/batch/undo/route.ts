/**
 * POST /api/admin/atlas/dictionaries/batch/undo
 *
 * One-click Undo for a just-completed Batch Accept. Keys off the exact override
 * IDs the batch write returned (`approvedIds`) — a PRIMARY-KEY `id IN (...)`
 * update, indexed and exact, NOT an unindexed `change_reason` text scan (the
 * overrides table has crossed PostgREST's 1000-row cap; a text scan would be
 * slow + fragile). Deactivates those rows (soft-delete, mirrors the single
 * override DELETE) so the params return to the open queue.
 *
 * Since batch-accepted rows came from the open queue (unmapped), there's no
 * prior override to re-activate — deactivating the batch's inserts is a clean
 * return to unmapped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json().catch(() => null);
    const rawIds = body?.overrideIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ success: false, error: 'overrideIds[] required' }, { status: 400 });
    }
    const overrideIds = rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (overrideIds.length === 0) {
      return NextResponse.json({ success: false, error: 'no valid overrideIds' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', overrideIds)
      .eq('is_active', true)
      .select('family_id');

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to undo batch' }, { status: 500 });
    }

    // Invalidate each affected family's dict cache, then ONE triage invalidation.
    const families = new Set<string>();
    for (const r of (data ?? []) as Array<{ family_id: string }>) families.add(r.family_id);
    for (const fam of families) invalidateDictOverrideCache(fam);
    if (families.size > 0) await invalidateTriageQueueCache();

    return NextResponse.json({ success: true, reverted: (data ?? []).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
