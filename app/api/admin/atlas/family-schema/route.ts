/**
 * GET /api/admin/atlas/family-schema?familyId=B6
 *
 * Returns the canonical attributeId list for a family. Cheap (no Anthropic call,
 * no DB query — just reads logic table / L2 param map from in-process module state).
 *
 * Used by the admin ingest UI to populate canonical-vs-invented indicators on
 * already-cached suggestions where /suggest wasn't called and schemaIds weren't
 * piggybacked back to the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { getLogicTable } from '@/lib/logicTables';
import {
  getL2ParamMapForCategory,
  type ParamMapping,
} from '@/lib/services/digikeyParamMap';
import { createServiceClient } from '@/lib/supabase/service';
import { computeSchemaVersion } from '@/lib/services/atlasSchemaVersion';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const familyId = new URL(request.url).searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json({ success: false, error: 'familyId required' }, { status: 400 });
    }

    // Mirror the same lookup priority the suggest endpoint uses so canonical-id
    // sets match exactly: L3 logic table → L2 param map.
    const ids = new Set<string>();
    const table = getLogicTable(familyId);
    if (table) {
      for (const r of table.rules) ids.add(r.attributeId);
    } else {
      const l2Map = getL2ParamMapForCategory(familyId);
      if (l2Map) {
        for (const entry of Object.values(l2Map)) {
          const mappings: ParamMapping[] = Array.isArray(entry) ? entry : [entry];
          for (const m of mappings) ids.add(m.attributeId);
        }
      }
    }

    // Also return the family's domain card version (the active row's
    // updated_at). The client bakes it into the /suggest localStorage
    // cache key, so when an admin approves a new/updated card the
    // engineer's cached suggestions become unreachable on next page
    // load — fresh /suggest calls happen and pick up the new card.
    let cardUpdatedAt: string | null = null;
    try {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('atlas_family_domain_cards')
        .select('updated_at')
        .eq('family_id', familyId)
        .eq('status', 'active')
        .maybeSingle();
      if (data?.updated_at) cardUpdatedAt = data.updated_at as string;
    } catch {
      // Fail-open — without this, the cache key just degrades to the
      // old format and stale entries persist normally until 7d expiry.
    }

    // Schema fingerprint — deterministic hash over the family's logic-table
    // rules + targeting signatures. Drives proactive staleness chips on the
    // Triage page: when the engineer adds a rule or edits an engineeringReason,
    // this hash flips and cached suggestions for that family render as stale.
    const schemaVersion = computeSchemaVersion(familyId);

    return NextResponse.json({ success: true, schemaIds: [...ids], cardUpdatedAt, schemaVersion });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
