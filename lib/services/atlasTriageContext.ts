/**
 * Shared context helpers for the Atlas dictionary triage AI routes
 * (/suggest and /investigate). Pure data fetchers; no caching here —
 * each consumer manages its own cache lifecycle.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';
import {
  getL2ParamMapForCategory,
  type ParamMapEntry,
  type ParamMapping,
} from '@/lib/services/digikeyParamMap';

export interface SchemaAttr {
  attributeId: string;
  attributeName: string;
  unit?: string;
}

/** Get schema attributes for a family (L3 logic table) OR an L2 category.
 *  familyId is overloaded — atlas_dictionary_overrides.family_id can hold
 *  either an L3 familyId ('B5') or an L2 category name ('Microcontrollers'). */
export function getSchemaAttributes(familyId: string): SchemaAttr[] {
  const table = getLogicTable(familyId);
  if (table) {
    return table.rules.map((r) => ({
      attributeId: r.attributeId,
      attributeName: r.attributeName,
      unit: undefined,
    }));
  }

  const l2Map = getL2ParamMapForCategory(familyId);
  if (l2Map) {
    const seen = new Set<string>();
    const attrs: SchemaAttr[] = [];
    for (const entry of Object.values(l2Map)) {
      const mappings: ParamMapping[] = Array.isArray(entry as ParamMapEntry)
        ? (entry as ParamMapping[])
        : [entry as ParamMapping];
      for (const m of mappings) {
        if (!seen.has(m.attributeId)) {
          seen.add(m.attributeId);
          attrs.push({ attributeId: m.attributeId, attributeName: m.attributeName, unit: m.unit });
        }
      }
    }
    return attrs;
  }

  return [];
}

/** One entry per previously-accepted attributeId in this scope, with the
 *  oldest paramName attached as the canonical example — that's the param
 *  the engineer originally minted the attributeId for, so it's the
 *  strongest signal of what concept the canonical actually represents. */
export type AcceptedCanonical = {
  attributeId: string;
  attributeName: string;
  unit: string | null;
  exampleRawParam: string;
};

/** Fetch active dictionary overrides for the given family/category scope,
 *  group by attributeId, return one entry per unique ID with the OLDEST
 *  paramName attached. Fail-open: returns [] on any error so the caller's
 *  AI prompt still proceeds without the previously-accepted hints. */
export async function fetchAcceptedCanonicals(familyId: string): Promise<AcceptedCanonical[]> {
  if (!familyId) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('param_name, attribute_id, attribute_name, unit, created_at')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .not('attribute_id', 'is', null)
      .order('created_at', { ascending: true });
    if (error || !data) return [];

    const byAttrId = new Map<string, AcceptedCanonical>();
    for (const row of data) {
      const attrId = row.attribute_id as string | null;
      if (!attrId) continue;
      if (byAttrId.has(attrId)) continue;
      byAttrId.set(attrId, {
        attributeId: attrId,
        attributeName: (row.attribute_name as string) ?? attrId,
        unit: (row.unit as string | null) ?? null,
        exampleRawParam: row.param_name as string,
      });
    }
    return [...byAttrId.values()];
  } catch {
    return [];
  }
}
