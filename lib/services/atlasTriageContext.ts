/**
 * Shared context helpers for the Atlas dictionary triage AI routes
 * (/suggest and /investigate). Pure data fetchers; no caching here —
 * each consumer manages its own cache lifecycle.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable, logicTableRegistry } from '@/lib/logicTables';
import {
  getL2ParamMapForCategory,
  type ParamMapEntry,
  type ParamMapping,
} from '@/lib/services/digikeyParamMap';
import {
  getAtlasDictionaryFamilyIds,
  getAtlasParamDictionary,
  getAtlasL2DictionaryCategories,
  getAtlasL2ParamDictionary,
} from '@/lib/services/atlasMapper';

export interface SchemaAttr {
  attributeId: string;
  attributeName: string;
  unit?: string;
  /** L3-only: the engineering rationale from the logic-table rule. Critical
   *  for the triage AI to disambiguate same-named canonicals — e.g., to
   *  distinguish "Gate Drive Supply VDD Range" (vdd_range, OUTPUT side) from
   *  a generic VCC reading on an isolated driver's INPUT side. Without this,
   *  the AI matches on labels only and confuses semantically distinct rules
   *  that happen to share a name pattern. L2 entries leave this undefined
   *  (no logic table → no engineering reasoning encoded). */
  engineeringReason?: string;
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
      engineeringReason: r.engineeringReason,
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

// ─── Family ID validation ───────────────────────────────────
//
// The AI Triage Investigator (Decision #185) returns a `suggestedFamily`
// or `recommendation.primaryActionPayload.familyId` field that's not
// constrained by the prompt to known IDs — once observed: it invented
// `BJT_DIGITAL` for KEXIN pre-biased digital transistors (real family
// is B6). If an engineer copied that into the registry verbatim it
// would target a non-existent family.
//
// This set is the source of truth for valid scope keys in
// atlas_dictionary_overrides.family_id — both L3 logic-table IDs
// (B5, C1, '52', etc.) and L2 category names ('Microcontrollers',
// 'Sensors', etc., per Decision #178's L2 override scope work).

export const KNOWN_FAMILY_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(logicTableRegistry),
  ...getAtlasL2DictionaryCategories(),
]);

/**
 * Same values as KNOWN_FAMILY_IDS but as a sorted array. Used as the
 * `enum` constraint in the Anthropic tool-use JSON schema for the
 * /investigate route — the API rejects any out-of-set value at the SDK
 * boundary, so the model literally cannot return `BJT_DIGITAL` or any
 * other invented ID. Sorted for prompt-readability (L3 IDs first, then
 * L2 categories alphabetical).
 */
export const KNOWN_FAMILY_IDS_LIST: readonly string[] = (() => {
  const l3Ids = Object.keys(logicTableRegistry).sort((a, b) => {
    // Numeric passives (12, 13, 52, ...) first, then letter blocks (B1..F2).
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) return parseInt(a, 10) - parseInt(b, 10);
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b);
  });
  const l2Categories = getAtlasL2DictionaryCategories().slice().sort();
  return [...l3Ids, ...l2Categories];
})();

export function validateFamilyId(id: string | null | undefined): boolean {
  if (!id) return false;
  return KNOWN_FAMILY_IDS.has(id);
}

// ─── Cross-family canonical inventory ───────────────────────
//
// Used in /suggest prompts so Sonnet knows what canonicals already
// exist across all families before inventing duplicates. Caught case:
// for KEXIN ICC(mA) row, AI suggested minting `supply_current_ma`
// despite an existing `supply_current` canonical in C4 — the prompt
// had no way to surface that conflict.
//
// Index combines:
//   1. TS-coded family + L2 dicts in atlasMapper.ts (the "built-in"
//      canonicals)
//   2. Active rows in atlas_dictionary_overrides (engineer-accepted
//      canonicals, possibly minted in earlier Triage sessions)
//
// Satellite canonicals (leading underscore, display-only — `_vbr_max`,
// `_isw_peak_a`, etc.) are EXCLUDED. They're family-specific by
// convention and not collision candidates.

export interface CanonicalSummary {
  attributeId: string;
  attributeName: string;
  families: string[]; // sorted list of family IDs / L2 categories where the canonical appears
}

export type CrossFamilyCanonicalIndex = CanonicalSummary[];

let canonicalCache: { value: CrossFamilyCanonicalIndex; expiresAt: number } | null = null;
const CANONICAL_CACHE_TTL_MS = 60_000;

export async function getCrossFamilyCanonicalSummary(): Promise<CrossFamilyCanonicalIndex> {
  if (canonicalCache && Date.now() < canonicalCache.expiresAt) {
    return canonicalCache.value;
  }

  const acc = new Map<string, { name: string; families: Set<string> }>();

  // (1) TS-coded L3 family dicts.
  for (const familyId of getAtlasDictionaryFamilyIds()) {
    const dict = getAtlasParamDictionary(familyId);
    if (!dict) continue;
    for (const mapping of Object.values(dict)) {
      const id = mapping.attributeId;
      if (!id || id.startsWith('_')) continue;
      let entry = acc.get(id);
      if (!entry) {
        entry = { name: mapping.attributeName, families: new Set() };
        acc.set(id, entry);
      }
      entry.families.add(familyId);
    }
  }

  // (2) TS-coded L2 category dicts.
  for (const category of getAtlasL2DictionaryCategories()) {
    const dict = getAtlasL2ParamDictionary(category);
    if (!dict) continue;
    for (const mapping of Object.values(dict)) {
      const id = mapping.attributeId;
      if (!id || id.startsWith('_')) continue;
      let entry = acc.get(id);
      if (!entry) {
        entry = { name: mapping.attributeName, families: new Set() };
        acc.set(id, entry);
      }
      entry.families.add(category);
    }
  }

  // (3) Active engineer overrides. Fail-open on DB error — the TS dicts
  // alone are already useful context for the AI. Paginate: this is unscoped
  // (all families) and the table is >1000 rows (1136 active), so a single
  // SELECT would hit PostgREST's 1000 cap and feed the AI an incomplete view
  // of already-mapped canonicals — nudging it to re-suggest existing mappings.
  // Same 1000-row footgun as triageQueueCompute (Decisions #206/#232).
  try {
    const supabase = createServiceClient();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('atlas_dictionary_overrides')
        .select('family_id, attribute_id, attribute_name')
        .eq('is_active', true)
        .not('attribute_id', 'is', null)
        .order('attribute_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) break; // fail-open on any page
      const batch = data ?? [];
      for (const row of batch) {
        const id = row.attribute_id as string | null;
        const fam = row.family_id as string | null;
        if (!id || !fam || id.startsWith('_')) continue;
        let entry = acc.get(id);
        if (!entry) {
          entry = { name: (row.attribute_name as string) ?? id, families: new Set() };
          acc.set(id, entry);
        }
        entry.families.add(fam);
      }
      if (batch.length < PAGE) break;
    }
  } catch {
    // fail-open
  }

  const result: CrossFamilyCanonicalIndex = [...acc.entries()]
    .map(([attributeId, { name, families }]) => ({
      attributeId,
      attributeName: name,
      families: [...families].sort(),
    }))
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId));

  canonicalCache = { value: result, expiresAt: Date.now() + CANONICAL_CACHE_TTL_MS };
  return result;
}

export function invalidateCrossFamilyCanonicalCache(): void {
  canonicalCache = null;
}

/**
 * Normalize a canonical attributeId for collision detection.
 * Lowercases, strips leading/trailing underscores, and removes common
 * unit-suffix patterns so `supply_current_ma`, `supply_current`, and
 * `supply_current_total` all collapse to the same stem.
 */
function normalizeCanonicalStem(id: string): string {
  let s = id.toLowerCase().trim();
  // Strip leading/trailing underscores (satellite convention)
  s = s.replace(/^_+|_+$/g, '');
  // Strip common unit + qualifier suffixes
  s = s.replace(/_(ma|ua|µa|na|mv|uv|µv|nv|v|a|ka|w|mw|kw|mhz|khz|ghz|hz|pf|nf|uf|µf|ohm|ohms|kohm|mohm|c|degc|pct|percent|min|max|typ|total|nom|nominal|avg|peak)$/g, '');
  // Compress repeated underscores
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return s;
}

/**
 * Check whether a proposed NEW canonical ID collides with an existing one.
 * Returns the collision details (with kind discriminator) if found; otherwise null.
 *
 * - kind: 'exact' — proposed ID is verbatim identical to an existing canonical
 *   in another family. This is NOT a "duplicate to prevent" — it's an opportunity
 *   to reuse a known canonical and extend it to the current family. Callers
 *   should treat this as a non-blocking note ("extends existing canonical;
 *   accepting writes the override but the current family's logic table needs
 *   a rule for the matching engine to use it").
 * - kind: 'near' — proposed ID is a unit-suffixed or stem-variant of an existing
 *   canonical (`supply_current_ma` ↔ `supply_current`). This IS a duplicate
 *   risk: callers should block the action and ask the engineer to either reuse
 *   the existing canonical or pick a clearly differentiating name.
 *
 * Algorithm: normalize both stems, then check if either contains the other.
 * Catches `supply_current_ma` ↔ `supply_current`, `vbr_max` ↔ `vbr`, etc.
 */
export function detectCanonicalCollision(
  proposedId: string,
  inventory: CrossFamilyCanonicalIndex,
  currentFamilyId: string,
): { kind: 'exact' | 'near'; existingId: string; existingName: string; families: string[] } | null {
  const proposed = normalizeCanonicalStem(proposedId);
  if (!proposed) return null;

  for (const candidate of inventory) {
    // Direct match on the proposed ID — engineer is proposing to extend an
    // existing canonical to the current family. Surface but do NOT block.
    if (candidate.attributeId === proposedId) {
      return {
        kind: 'exact',
        existingId: candidate.attributeId,
        existingName: candidate.attributeName,
        families: candidate.families,
      };
    }
    // Skip canonicals that already exist in the current family — the AI
    // is allowed to "mint" something that already exists in this scope
    // (it's effectively re-affirming the existing canonical). The /suggest
    // path will rewrite that to a map-to-existing anyway.
    if (candidate.families.includes(currentFamilyId)) continue;

    const existing = normalizeCanonicalStem(candidate.attributeId);
    if (!existing) continue;

    // Substring containment in either direction. Tight: only fires when
    // one stem fully contains the other (not just shares a fragment).
    if (existing === proposed || proposed.includes(existing) || existing.includes(proposed)) {
      // Tiny stems (< 4 chars) would over-fire (e.g., 'ic' inside 'ic_max').
      // Require min stem length 4 to declare collision.
      const minLen = Math.min(existing.length, proposed.length);
      if (minLen >= 4) {
        return {
          kind: 'near',
          existingId: candidate.attributeId,
          existingName: candidate.attributeName,
          families: candidate.families,
        };
      }
    }
  }
  return null;
}
