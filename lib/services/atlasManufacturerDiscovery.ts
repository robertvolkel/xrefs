/**
 * Atlas manufacturer discovery — "which Chinese manufacturers make X?"
 *
 * Resolves a free-text component term into a query scope at one of three
 * grains, then lists the Chinese (Atlas) manufacturers in that scope:
 *
 *   - specific family   "BJTs", "MLCC", "tantalum capacitors"  → family_id set
 *   - component supertype "capacitors", "diodes", "voltage regulators" → category
 *   - high-level group   "passive components", "discrete semiconductors", "ICs"
 *                        → family_id set derived from the logic-table registry
 *
 * The chat tool `find_component_manufacturers` (lib/services/llmOrchestrator.ts)
 * passes the user's phrase here; the deterministic resolution lives in TS so the
 * LLM never has to know our family IDs / category taxonomy.
 *
 * Backing data: atlas_products.category (the ComponentCategory enum — the
 * supertype grain) and atlas_products.family_id (the specific grain), both
 * indexed. The single RPC `get_atlas_manufacturers_for_scope` (jsonb return,
 * cap-proof) does the grouping. See scripts/supabase-atlas-manufacturers-by-scope-rpc.sql.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { resolveFamilyFromText, getAllLogicTables } from '@/lib/logicTables';
import { GROUP_SYNONYMS, SUPERTYPE_SYNONYMS } from './componentVocabulary';

export type DiscoveryScopeKind = 'family' | 'supertype' | 'group' | 'all' | 'unresolved';

export interface DiscoveryScope {
  kind: DiscoveryScopeKind;
  /** Specific family IDs to filter on (kind 'family' | 'group'). */
  familyIds?: string[];
  /** ComponentCategory values to filter on (kind 'supertype'). */
  categories?: string[];
  /** Human label for the resolved scope, e.g. "BJTs", "capacitors", "passive components". */
  label: string;
}

export interface ManufacturerListItem {
  manufacturer: string;
  productCount: number;
}

export interface ManufacturerListing {
  totalManufacturerCount: number;
  totalProductCount: number;
  manufacturers: ManufacturerListItem[];
}

// GROUP_SYNONYMS + SUPERTYPE_SYNONYMS now live in the client-safe
// componentVocabulary module (imported above) so the chat search-result
// origin-filter detector shares the exact same component vocabulary and the two
// can't drift. Behavior here is unchanged — same maps, relocated.

/** Phrases meaning "everything" — list all manufacturers regardless of family. */
const ALL_SYNONYMS = ['all components', 'all parts', 'everything', 'all manufacturers', 'any component', 'all your parts'];

/** Filler words ignored when deciding whether a qualifier remains after the head term. */
const FILLER = new Set([
  'component', 'components', 'part', 'parts', 'type', 'types', 'product', 'products',
  'the', 'a', 'an', 'of', 'any', 'some', 'all', 'that', 'which', 'who', 'make', 'makes',
  'making', 'made', 'do', 'does', 'sell', 'sells', 'produce', 'produces', 'manufacture',
  'manufactures', 'and', 'or', 'for',
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word (boundary = not adjacent to alphanumeric) match with optional trailing plural. */
function containsTerm(haystack: string, term: string): boolean {
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}s?(?![a-z0-9])`, 'i');
  return re.test(haystack);
}

/** Tokens left after removing `matchedTerm` (+ trailing s) and filler words. Empty ⇒ bare term. */
function meaningfulRemainder(text: string, matchedTerm: string): string[] {
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(matchedTerm)}s?(?![a-z0-9])`, 'gi');
  const stripped = text.replace(re, ' ');
  return stripped
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !FILLER.has(t));
}

interface SynMatch {
  value: string;
  matchedTerm: string;
}

/** Longest matching synonym (so multi-word phrases win over their head word). */
function matchLongest(text: string, table: Record<string, string>): SynMatch | null {
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (containsTerm(text, key)) return { value: table[key], matchedTerm: key };
  }
  return null;
}

/** Family IDs whose registry category equals the given high-level group. */
function familyIdsForGroup(group: string): string[] {
  return getAllLogicTables()
    .filter((t) => t.category === group)
    .map((t) => t.familyId);
}

/**
 * Resolve a free-text component term to a query scope.
 *
 * Arbitration handles the bare-supertype hijack: `subcategoryToFamily` has broad
 * keys ("Resistors"→52, "Relay"→F1) that would narrow a group/supertype question
 * to one family. We only accept the specific-family match when a *qualifier*
 * remains after removing the supertype head word ("tantalum capacitors" keeps
 * "tantalum" → family 59; bare "resistors" leaves nothing → supertype Resistors).
 */
export function resolveDiscoveryScope(text: string | undefined): DiscoveryScope {
  const raw = (text ?? '').trim();
  if (!raw) return { kind: 'unresolved', label: '' };

  const group = matchLongest(raw, GROUP_SYNONYMS);
  const supertype = matchLongest(raw, SUPERTYPE_SYNONYMS as Record<string, string>);
  const familyId = resolveFamilyFromText(raw);

  // 1. Pure high-level group (no qualifier beyond the group term + filler).
  if (group && meaningfulRemainder(raw, group.matchedTerm).length === 0) {
    const familyIds = familyIdsForGroup(group.value);
    if (familyIds.length > 0) {
      return { kind: 'group', familyIds, label: group.matchedTerm };
    }
  }

  // 2. Specific family — only when there's a qualifier beyond a bare supertype word,
  //    so "tantalum capacitors" → family but bare "capacitors"/"resistors" → supertype.
  if (familyId) {
    const bareSupertype = supertype && meaningfulRemainder(raw, supertype.matchedTerm).length === 0;
    if (!bareSupertype) {
      return { kind: 'family', familyIds: [familyId], label: raw };
    }
  }

  // 3. Component supertype → category filter.
  if (supertype) {
    return { kind: 'supertype', categories: [supertype.value], label: supertype.matchedTerm };
  }

  // 4. "everything".
  const lower = raw.toLowerCase();
  if (ALL_SYNONYMS.some((s) => lower.includes(s))) {
    return { kind: 'all', label: 'all components' };
  }

  return { kind: 'unresolved', label: raw };
}

/**
 * List the Chinese (Atlas) manufacturers within a resolved scope, ordered by
 * product volume. Returns the true distinct manufacturer count plus the top N.
 * `unresolved` scopes must be handled by the caller (no DB call).
 */
export async function listManufacturersForScope(
  scope: DiscoveryScope,
  limit = 30,
): Promise<ManufacturerListing> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('get_atlas_manufacturers_for_scope', {
    p_family_ids: scope.familyIds ?? null,
    p_categories: scope.categories ?? null,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`get_atlas_manufacturers_for_scope failed: ${error.message}`);
  }

  const payload = (data ?? {}) as {
    total_manufacturer_count?: number | string;
    total_product_count?: number | string;
    manufacturers?: Array<{ manufacturer: string; product_count: number | string }>;
  };

  return {
    totalManufacturerCount: Number(payload.total_manufacturer_count ?? 0),
    totalProductCount: Number(payload.total_product_count ?? 0),
    manufacturers: (payload.manufacturers ?? []).map((m) => ({
      manufacturer: m.manufacturer,
      productCount: Number(m.product_count),
    })),
  };
}
