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
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { recordParamDecisions } from '@/lib/services/paramDecisionLog';

interface UndoneRow {
  id: string;
  family_id: string;
  param_name: string;
  attribute_id: string | null;
  attribute_name: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
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

    // Service client, matching the sibling param-decisions/undo route. With the
    // RLS-subject cookie client an update the policy filters out returns
    // `{ data: [], error: null }` — indistinguishable from "nothing needed
    // undoing", so this route would report a successful undo that changed
    // nothing at all.
    const supabase = createServiceClient();
    // Widened from `family_id` alone so the decision log can record WHICH
    // params were undone, not just how many.
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', overrideIds)
      .eq('is_active', true)
      .select('id, family_id, param_name, attribute_id, attribute_name');

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to undo batch' }, { status: 500 });
    }

    // Undo is itself a decision. It APPENDS `mapping_revoked` rows rather
    // than deleting the original `mapping_accepted` ones, so the log reads
    // "Accepted 09:00 → Reverted 09:05" instead of losing what happened.
    await recordParamDecisions(
      ((data ?? []) as UndoneRow[]).map((r) => ({
        paramName: r.param_name,
        decision: 'mapping_revoked' as const,
        decidedBy: user!.id,
        familyId: r.family_id,
        attributeId: r.attribute_id ?? null,
        attributeName: r.attribute_name ?? null,
        overrideId: r.id,
        note: 'Batch Accept undone',
        source: 'ui' as const,
      })),
    );

    // Invalidate each affected family's dict cache, then ONE triage invalidation.
    const families = new Set<string>();
    for (const r of (data ?? []) as UndoneRow[]) families.add(r.family_id);
    for (const fam of families) invalidateDictOverrideCache(fam);
    if (families.size > 0) await invalidateTriageQueueCache();

    return NextResponse.json({ success: true, reverted: (data ?? []).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
