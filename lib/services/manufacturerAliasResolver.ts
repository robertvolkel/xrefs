/**
 * Manufacturer Alias Resolver — canonical MFR-identity layer.
 *
 * Exact-hit resolution only (case-insensitive). Reads two sources on cold cache:
 *   - Atlas (Chinese MFRs): `atlas_manufacturers` with `aliases` JSONB.
 *     Decision #148.
 *   - Western (company-identity graph): `manufacturer_companies` +
 *     `manufacturer_aliases`. Decision #149.
 *
 * Western adds parent-chain walking (acquisitions / divisions / subsidiary
 * brands) via `parent_uid` graph AND via `context=acquired_by|merged_into`
 * alias rows (source data uses both mechanisms). Walk terminates at the
 * surviving canonical (status corporate/active, or a self-referencing row).
 *
 * Consumers call `resolveManufacturerAlias(input)`; null means "no alias hit,
 * fall through to whatever you did before". Never throws — Supabase failures
 * return null and are logged.
 */
import { createClient } from '../supabase/server';
import {
  getCachedResponse,
  setCachedResponse,
  invalidateCache,
  TTL_LIFECYCLE_MS,
} from './partDataCache';

export type ManufacturerAliasSource = 'atlas' | 'western';

export interface ManufacturerAliasLineage {
  uid: number;
  name: string;
  status: string | null;
}

export interface ManufacturerAliasMatch {
  canonical: string;                    // Atlas: name_display. Western: walked-up current owner's name.
  slug: string;
  source: ManufacturerAliasSource;
  variants: string[];                   // Original-case variant strings for Supabase .in() filters.
  companyUid?: number;                  // Western: terminal canonical uid — stable FK for AVL/AML ingestion.
  lineage?: ManufacturerAliasLineage[]; // Western only — ordered leaf → root (input → canonical).
}

// ─── Atlas (existing) ────────────────────────────────────

interface AtlasRow {
  slug: string;
  name_display: string;
  name_en: string;
  name_zh: string | null;
  aliases: string[] | null;
}

function buildAtlasMatch(row: AtlasRow): ManufacturerAliasMatch {
  const variantSet = new Set<string>();
  variantSet.add(row.name_display);
  if (row.name_en) variantSet.add(row.name_en);
  if (row.name_zh) variantSet.add(row.name_zh);

  // Defensive: the aliases JSONB column has historically been written both as
  // arrays (correct) and as JSON-encoded strings (pre-fix bug). If we get a
  // string, parse it back. Iterating a string directly would add every
  // character to the variant map and silently poison the resolver. Logged so
  // re-corruption doesn't go unnoticed.
  let aliasArray: string[] = [];
  if (Array.isArray(row.aliases)) {
    aliasArray = row.aliases;
  } else if (typeof row.aliases === 'string') {
    try {
      const parsed = JSON.parse(row.aliases);
      if (Array.isArray(parsed)) {
        aliasArray = parsed;
        console.warn(`manufacturerAliasResolver: aliases column for "${row.slug}" is a JSON string, not a JSONB array. Re-run scripts/atlas-manufacturers-import.mjs to fix.`);
      }
    } catch {
      // Not valid JSON — treat as no aliases.
    }
  }
  for (const a of aliasArray) {
    if (a && typeof a === 'string') variantSet.add(a);
  }

  return {
    canonical: row.name_display,
    slug: row.slug,
    source: 'atlas',
    variants: [...variantSet],
  };
}

// ─── Western ─────────────────────────────────────────────

interface WesternCompanyRow {
  uid: number;
  name: string;
  status: string | null;
  parent_uid: number | null;
  slug: string;
}
interface WesternAliasRow {
  company_uid: number;
  value: string;
  context: string;
}

interface WesternCompanyNode extends WesternCompanyRow {
  aliases: { value: string; context: string }[];
}

interface WesternIndex {
  companyByUid: Map<number, WesternCompanyNode>;
  canonicalByUid: Map<number, number>;              // input uid → terminal canonical uid
  lineageByUid: Map<number, number[]>;              // input uid → chain leaf → root (incl both ends)
  variantToUid: Map<string, number>;                // lowercased variant → uid
  matchByCanonicalUid: Map<number, ManufacturerAliasMatch>;
}

const MAX_PARENT_HOPS = 6;

function walkToCanonical(
  startUid: number,
  companyByUid: Map<number, WesternCompanyNode>,
  nameToUid: Map<string, number>,
): number[] {
  const visited = new Set<number>();
  const chain: number[] = [];
  let current = startUid;
  for (let hop = 0; hop < MAX_PARENT_HOPS; hop++) {
    if (visited.has(current)) break; // loop guard
    visited.add(current);
    chain.push(current);
    const node = companyByUid.get(current);
    if (!node) break;

    // Step 1: follow parent_uid graph (primary mechanism).
    if (
      node.parent_uid !== null &&
      node.parent_uid !== current &&
      companyByUid.has(node.parent_uid)
    ) {
      current = node.parent_uid;
      continue;
    }

    // Step 2: follow acquired_by / merged_into alias chain (secondary
    // mechanism). Source data represents some acquisitions as alias rows
    // rather than parent pointers — user confirmed both are authoritative.
    const chainAlias = node.aliases.find(
      a => a.context === 'acquired_by' || a.context === 'merged_into',
    );
    if (chainAlias) {
      const acquirerUid = nameToUid.get(chainAlias.value.toLowerCase());
      if (acquirerUid !== undefined && acquirerUid !== current) {
        current = acquirerUid;
        continue;
      }
    }

    break; // terminal
  }
  return chain;
}

function pickCollisionWinner(
  uidA: number,
  uidB: number,
  canonicalByUid: Map<number, number>,
  companyByUid: Map<number, WesternCompanyNode>,
): number {
  // Prefer the side whose canonical has status corporate/active (a surviving
  // entity). Ties broken by lowest uid — deterministic.
  const statusOf = (uid: number): string | null =>
    companyByUid.get(canonicalByUid.get(uid) ?? uid)?.status ?? null;
  const prefer = (s: string | null) => s === 'corporate' || s === 'active';
  const a = prefer(statusOf(uidA));
  const b = prefer(statusOf(uidB));
  if (a && !b) return uidA;
  if (b && !a) return uidB;
  return uidA < uidB ? uidA : uidB;
}

function buildWesternIndex(
  companies: WesternCompanyRow[],
  aliases: WesternAliasRow[],
): WesternIndex {
  const companyByUid = new Map<number, WesternCompanyNode>();
  for (const c of companies) {
    companyByUid.set(c.uid, { ...c, aliases: [] });
  }
  for (const a of aliases) {
    const node = companyByUid.get(a.company_uid);
    if (node) node.aliases.push({ value: a.value, context: a.context });
  }

  // Name/alias → uid for the walk's acquired_by-alias lookup. Needs to exist
  // before walking. Collisions here are resolved later during the main
  // variantToUid build; for the walk, a naive first-writer is fine since the
  // chain can only step sideways on identical names anyway.
  const nameToUid = new Map<string, number>();
  for (const node of companyByUid.values()) {
    const nameKey = node.name.toLowerCase();
    if (!nameToUid.has(nameKey)) nameToUid.set(nameKey, node.uid);
    for (const alias of node.aliases) {
      const key = alias.value.toLowerCase();
      if (!nameToUid.has(key)) nameToUid.set(key, node.uid);
    }
  }

  // Walk every node to its terminal canonical.
  const canonicalByUid = new Map<number, number>();
  const lineageByUid = new Map<number, number[]>();
  for (const uid of companyByUid.keys()) {
    const chain = walkToCanonical(uid, companyByUid, nameToUid);
    const canonicalUid = chain[chain.length - 1] ?? uid;
    canonicalByUid.set(uid, canonicalUid);
    lineageByUid.set(uid, chain);
  }

  // Group descendants by canonical.
  const descendantsByCanonical = new Map<number, number[]>();
  for (const [uid, canonical] of canonicalByUid) {
    let arr = descendantsByCanonical.get(canonical);
    if (!arr) {
      arr = [];
      descendantsByCanonical.set(canonical, arr);
    }
    arr.push(uid);
  }

  // Build one match per canonical; variants = union of every descendant's
  // name + aliases.
  const matchByCanonicalUid = new Map<number, ManufacturerAliasMatch>();
  for (const [canonicalUid, descUids] of descendantsByCanonical) {
    const canonicalNode = companyByUid.get(canonicalUid);
    if (!canonicalNode) continue;
    const variantSet = new Set<string>();
    for (const descUid of descUids) {
      const descNode = companyByUid.get(descUid);
      if (!descNode) continue;
      variantSet.add(descNode.name);
      for (const alias of descNode.aliases) variantSet.add(alias.value);
    }
    matchByCanonicalUid.set(canonicalUid, {
      canonical: canonicalNode.name,
      slug: canonicalNode.slug,
      source: 'western',
      variants: [...variantSet],
      companyUid: canonicalUid,
    });
  }

  // Build the primary variant → uid index with collision handling.
  const variantToUid = new Map<string, number>();
  const registerVariant = (key: string, uid: number) => {
    const existing = variantToUid.get(key);
    if (existing === undefined) {
      variantToUid.set(key, uid);
      return;
    }
    if (existing === uid) return;
    const winner = pickCollisionWinner(existing, uid, canonicalByUid, companyByUid);
    variantToUid.set(key, winner);
  };
  for (const node of companyByUid.values()) {
    registerVariant(node.name.toLowerCase(), node.uid);
    for (const alias of node.aliases) {
      registerVariant(alias.value.toLowerCase(), node.uid);
    }
  }

  return { companyByUid, canonicalByUid, lineageByUid, variantToUid, matchByCanonicalUid };
}

// ─── Cache ───────────────────────────────────────────────

// L1 in-memory cache: per-process, fast.
const CACHE_TTL_MS = 5 * 60_000;

// L2 persistent cache (Supabase part_data_cache): survives cold starts. Stores
// raw rows; index is rebuilt in-memory on hit. The Supabase scan + parent-chain
// walk costs ~400-600ms cold; L2 read collapses that to a single round-trip.
// Bump MFR_ALIAS_L2_VERSION when row shapes change.
const MFR_ALIAS_L2_SERVICE = 'search' as const;
const MFR_ALIAS_L2_MPN = '__mfr_alias_index__';
const MFR_ALIAS_L2_VARIANT = 'v1';
const MFR_ALIAS_L2_VERSION = 1;
const MFR_ALIAS_L2_TTL_MS = TTL_LIFECYCLE_MS; // 6 months — alias graph changes infrequently; admin writes invalidate explicitly.

interface CachedAliasRows {
  v: number;
  atlas: AtlasRow[];
  westernCompanies: WesternCompanyRow[];
  westernAliases: WesternAliasRow[];
}

let variantToMatch: Map<string, ManufacturerAliasMatch> | null = null;
let canonicalToMatch: Map<string, ManufacturerAliasMatch> | null = null;
let western: WesternIndex | null = null;
let cachedAt = 0;
let inflight: Promise<void> | null = null;

// ─── Data fetchers ───────────────────────────────────────

async function fetchAtlas(): Promise<AtlasRow[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('atlas_manufacturers')
      .select('slug, name_display, name_en, name_zh, aliases');
    if (error) {
      console.warn('manufacturerAliasResolver: Atlas error:', error.message);
      return [];
    }
    return (data ?? []) as AtlasRow[];
  } catch (err) {
    console.warn('manufacturerAliasResolver: Atlas fetch failed:', err);
    return [];
  }
}

/**
 * Paginated fetch to bypass the 1000-row PostgREST default. Ordered by a
 * stable key so range() is deterministic.
 */
async function fetchAllPages<T>(
  fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Safety cap: 100k rows. Plenty of headroom for a 25k-row table.
  for (let page = 0; page < 100; page++) {
    const { data, error } = await fetcher(from, from + pageSize - 1);
    if (error) {
      console.warn('manufacturerAliasResolver: Western page error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function fetchWestern(): Promise<{ companies: WesternCompanyRow[]; aliases: WesternAliasRow[] } | null> {
  try {
    const supabase = await createClient();
    const [companies, aliases] = await Promise.all([
      fetchAllPages<WesternCompanyRow>((from, to) =>
        supabase
          .from('manufacturer_companies')
          .select('uid, name, status, parent_uid, slug')
          .order('uid')
          .range(from, to),
      ),
      fetchAllPages<WesternAliasRow>((from, to) =>
        supabase
          .from('manufacturer_aliases')
          .select('company_uid, value, context')
          .order('id')
          .range(from, to),
      ),
    ]);
    return { companies, aliases };
  } catch (err) {
    console.warn('manufacturerAliasResolver: Western fetch failed:', err);
    return { companies: [], aliases: [] };
  }
}

async function loadFromL2(): Promise<CachedAliasRows | null> {
  try {
    const cached = await getCachedResponse<CachedAliasRows>(
      MFR_ALIAS_L2_SERVICE,
      MFR_ALIAS_L2_MPN,
      MFR_ALIAS_L2_VARIANT,
    );
    if (!cached) return null;
    if (cached.data?.v !== MFR_ALIAS_L2_VERSION) return null;
    return cached.data;
  } catch (err) {
    console.warn('manufacturerAliasResolver: L2 read failed:', err);
    return null;
  }
}

function writeToL2(payload: CachedAliasRows): void {
  setCachedResponse(
    MFR_ALIAS_L2_SERVICE,
    MFR_ALIAS_L2_MPN,
    MFR_ALIAS_L2_VARIANT,
    'parametric',
    payload,
    MFR_ALIAS_L2_TTL_MS,
  );
}

async function refreshCache(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      // L2 first — collapses 3 Supabase scans + walk into one round-trip on cold start.
      const l2 = await loadFromL2();
      let atlasRows: AtlasRow[] | null;
      let westernRaw: { companies: WesternCompanyRow[]; aliases: WesternAliasRow[] } | null;
      if (l2) {
        atlasRows = l2.atlas;
        westernRaw = { companies: l2.westernCompanies, aliases: l2.westernAliases };
      } else {
        [atlasRows, westernRaw] = await Promise.all([fetchAtlas(), fetchWestern()]);
        // Persist for next cold start. Fire-and-forget.
        if (atlasRows && westernRaw) {
          writeToL2({
            v: MFR_ALIAS_L2_VERSION,
            atlas: atlasRows,
            westernCompanies: westernRaw.companies,
            westernAliases: westernRaw.aliases,
          });
        }
      }

      const nextVariant = new Map<string, ManufacturerAliasMatch>();
      const nextCanonical = new Map<string, ManufacturerAliasMatch>();

      // Atlas first — Atlas wins cross-source collisions (rare, but documented
      // in the plan; log if we ever observe one).
      for (const row of atlasRows ?? []) {
        const match = buildAtlasMatch(row);
        nextCanonical.set(match.canonical, match);
        for (const variant of match.variants) {
          const key = variant.toLowerCase();
          if (!nextVariant.has(key)) nextVariant.set(key, match);
        }
      }

      // Western.
      let westernIndex: WesternIndex | null = null;
      if (westernRaw && westernRaw.companies.length > 0) {
        westernIndex = buildWesternIndex(westernRaw.companies, westernRaw.aliases);

        for (const match of westernIndex.matchByCanonicalUid.values()) {
          // Canonical map is keyed by display name for parity with Atlas;
          // Atlas entries may have already claimed this name — skip to honor
          // "Atlas wins collisions".
          if (!nextCanonical.has(match.canonical)) {
            nextCanonical.set(match.canonical, match);
          }
        }
        for (const [variantKey, uid] of westernIndex.variantToUid) {
          if (nextVariant.has(variantKey)) {
            // Cross-source collision: Atlas already registered this variant.
            console.warn(
              `manufacturerAliasResolver: cross-source variant collision on "${variantKey}" — Atlas wins`,
            );
            continue;
          }
          const canonicalUid = westernIndex.canonicalByUid.get(uid);
          if (canonicalUid === undefined) continue;
          const match = westernIndex.matchByCanonicalUid.get(canonicalUid);
          if (!match) continue;
          nextVariant.set(variantKey, match);
        }
      }

      variantToMatch = nextVariant;
      canonicalToMatch = nextCanonical;
      western = westernIndex;
      cachedAt = Date.now();
    } catch (err) {
      console.warn('manufacturerAliasResolver: refresh failed:', err);
      variantToMatch = new Map();
      canonicalToMatch = new Map();
      western = null;
      cachedAt = Date.now();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function ensureCache(): Promise<void> {
  if (variantToMatch !== null && Date.now() - cachedAt < CACHE_TTL_MS) return;
  await refreshCache();
}

// ─── Public API ──────────────────────────────────────────

export async function resolveManufacturerAlias(input: string): Promise<ManufacturerAliasMatch | null> {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  if (!key) return null;
  await ensureCache();
  const base = variantToMatch?.get(key);
  if (!base) return null;

  // For Western hits, attach per-input lineage. The variant map resolved to
  // the canonical's match object; `lineageByUid` needs the ORIGIN uid, which
  // requires a separate lookup against the western index.
  if (base.source === 'western' && western) {
    const originUid = western.variantToUid.get(key);
    if (originUid !== undefined) {
      const lineageUids = western.lineageByUid.get(originUid);
      if (lineageUids) {
        const lineage: ManufacturerAliasLineage[] = [];
        for (const uid of lineageUids) {
          const node = western.companyByUid.get(uid);
          if (node) lineage.push({ uid: node.uid, name: node.name, status: node.status });
        }
        return { ...base, lineage };
      }
    }
  }

  return base;
}

export async function getAllManufacturerVariants(): Promise<Map<string, ManufacturerAliasMatch>> {
  await ensureCache();
  return canonicalToMatch ?? new Map();
}

export function invalidateManufacturerAliasCache(): void {
  variantToMatch = null;
  canonicalToMatch = null;
  western = null;
  cachedAt = 0;
  inflight = null;
  // Fire-and-forget L2 purge so the next cold start rebuilds from Supabase.
  invalidateCache({
    service: MFR_ALIAS_L2_SERVICE,
    mpn: MFR_ALIAS_L2_MPN,
  }).catch((err) => {
    console.warn('manufacturerAliasResolver: L2 invalidation failed:', err);
  });
}
