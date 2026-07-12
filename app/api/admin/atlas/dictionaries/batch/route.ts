/**
 * POST /api/admin/atlas/dictionaries/batch
 *
 * Batch-accept N Triage dictionary-override mappings in ONE request — the
 * server side of the "Batch Accept" button (star high-confidence rows → tick →
 * accept all at once). Mirrors the single-write path in
 * ../dictionaries/route.ts (normalize NFC+lower+trim, deactivate-then-insert),
 * but hardened for the batch case:
 *
 *   - Normalizes + DEDUPES the input by (familyId, normalizedParam). Two
 *     cosmetic-variant rows that collapse to the same key would otherwise
 *     violate the partial unique index `(family_id, param_name) WHERE
 *     is_active=true` in one bulk insert and fail the whole chunk.
 *   - SKIPS rows already mapped to the same attribute_id (idempotent).
 *   - Writes PER FAMILY with `.in('param_name', names)` — never a composite
 *     multi-tuple `.or()` (PostgREST can't OR tuples safely; the codebase
 *     already avoids it, see atlasClient.ts). On a unique-violation race, falls
 *     back to per-row insert for that family so one bad row never poisons the
 *     batch.
 *   - Fires EXACTLY ONE triage-cache invalidation at the very end (never per
 *     row) — the recompute is expensive at Atlas scale.
 *
 * No safe-subset re-validation: the engineer hand-selected each row, so this
 * mirrors the trust model of the single-accept endpoint plus the correctness
 * guards above. Every written override is tagged `[batch:<uuid>]` in
 * change_reason for later manual discoverability, and the returned
 * `approvedIds` drive the one-click Undo (POST ./batch/undo).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateDictOverrideCache } from '@/lib/services/atlasDictOverrides';
import { invalidateTriageQueueCache } from '@/lib/services/triageQueueCache';
import { prepareBatchItems, type PreparedBatchItem } from '@/lib/services/triageBatchApprove';

interface InsertedRow {
  id: string;
  param_name: string;
  attribute_id: string | null;
  attribute_name: string | null;
  unit: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

const SELECT_COLS = 'id, param_name, attribute_id, attribute_name, unit, created_by, created_at, updated_at, is_active';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json().catch(() => null);
    const rawItems = body?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ success: false, error: 'items[] required' }, { status: 400 });
    }

    // ── Validate + normalize + dedupe within the request (pure, testable) ──
    const { prepared, skipped, deduped } = prepareBatchItems(rawItems);

    const batchId = crypto.randomUUID();
    const approved: Array<{ paramName: string; familyId: string; override: Record<string, unknown> }> = [];
    const approvedIds: string[] = [];
    const failed: Array<{ paramName: string; familyId: string; reason: string }> = [];
    const affectedFamilies = new Set<string>();

    if (prepared.length === 0) {
      return NextResponse.json({ success: true, batchId: null, approvedIds, approved, skipped, failed, deduped });
    }

    const supabase = await createClient();
    const changeReason = `Batch-accepted (AI high-confidence) [batch:${batchId}]`;

    // Group by family so every deactivate/insert is scoped to one family_id.
    const byFamily = new Map<string, PreparedBatchItem[]>();
    for (const p of prepared) {
      const arr = byFamily.get(p.familyId) ?? [];
      arr.push(p);
      byFamily.set(p.familyId, arr);
    }

    const pushApproved = (row: InsertedRow, it: PreparedBatchItem) => {
      approvedIds.push(row.id);
      approved.push({
        paramName: it.rawParamName,
        familyId: it.familyId,
        override: {
          id: row.id,
          attributeId: row.attribute_id ?? it.attributeId,
          attributeName: row.attribute_name ?? it.attributeName,
          unit: row.unit ?? null,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isActive: row.is_active,
        },
      });
    };

    for (const [familyId, items] of byFamily) {
      const names = items.map((i) => i.paramName);

      // Skip rows already mapped to the SAME attribute_id (idempotent — no churn).
      const { data: existing } = await supabase
        .from('atlas_dictionary_overrides')
        .select('param_name, attribute_id')
        .eq('family_id', familyId)
        .in('param_name', names)
        .eq('is_active', true);
      const activeAttrByName = new Map<string, string | null>();
      for (const e of (existing ?? []) as Array<{ param_name: string; attribute_id: string | null }>) {
        activeAttrByName.set(e.param_name, e.attribute_id);
      }
      const toWrite = items.filter((it) => {
        if (activeAttrByName.get(it.paramName) === it.attributeId) {
          skipped.push({ paramName: it.rawParamName, familyId, reason: 'already mapped to same attribute' });
          return false;
        }
        return true;
      });
      if (toWrite.length === 0) continue;

      affectedFamilies.add(familyId);
      const writeNames = toWrite.map((i) => i.paramName);

      // Deactivate any active override for the names we're (re)writing so the
      // partial unique index accepts the new inserts.
      await supabase
        .from('atlas_dictionary_overrides')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('family_id', familyId)
        .in('param_name', writeNames)
        .eq('is_active', true);

      const insertRows = toWrite.map((it) => ({
        family_id: familyId,
        param_name: it.paramName,
        action: 'add',
        attribute_id: it.attributeId,
        attribute_name: it.attributeName,
        unit: it.unit ?? null,
        change_reason: changeReason,
        created_by: user!.id,
      }));

      const { data: inserted, error: insErr } = await supabase
        .from('atlas_dictionary_overrides')
        .insert(insertRows)
        .select(SELECT_COLS);

      if (insErr || !inserted) {
        // Isolate the offending row(s): retry this family per-row so one bad
        // insert doesn't drop the whole family's mappings.
        const byName = new Map(toWrite.map((it) => [it.paramName, it]));
        for (const it of toWrite) {
          const { data: one, error: oneErr } = await supabase
            .from('atlas_dictionary_overrides')
            .insert({
              family_id: familyId,
              param_name: it.paramName,
              action: 'add',
              attribute_id: it.attributeId,
              attribute_name: it.attributeName,
              unit: it.unit ?? null,
              change_reason: changeReason,
              created_by: user!.id,
            })
            .select(SELECT_COLS)
            .single();
          if (oneErr || !one) {
            failed.push({ paramName: it.rawParamName, familyId, reason: oneErr?.message ?? 'insert failed' });
            continue;
          }
          pushApproved(one as InsertedRow, byName.get(it.paramName)!);
        }
      } else {
        const byName = new Map(toWrite.map((it) => [it.paramName, it]));
        for (const row of inserted as InsertedRow[]) {
          const it = byName.get(row.param_name);
          if (it) pushApproved(row, it);
        }
      }
    }

    // ── Exactly ONE invalidation pass at the very end ─────────────────────
    for (const fam of affectedFamilies) invalidateDictOverrideCache(fam);
    if (affectedFamilies.size > 0) await invalidateTriageQueueCache();

    return NextResponse.json({ success: true, batchId, approvedIds, approved, skipped, failed, deduped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
