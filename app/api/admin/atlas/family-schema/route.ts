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

    return NextResponse.json({ success: true, schemaIds: [...ids] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
