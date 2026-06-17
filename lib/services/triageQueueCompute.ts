/**
 * Triage Queue aggregation — the heavy cross-batch compute that powers the
 * Dictionary Triage queue AND the /admin/manufacturers "Improvement Potential"
 * column.
 *
 * Why this lives in lib/services/ rather than inside the batches route:
 *   The aggregation is consumed by TWO routes —
 *     1. /api/admin/atlas/ingest/batches (the Triage queue itself)
 *     2. /api/admin/manufacturers (Improvement Potential column)
 *   Both need to be able to (re)compute + register the function with the
 *   cache module. Previously this was module-private to the batches route, so
 *   the compute was only registered when that route's module loaded. If a
 *   worker only ever served /api/admin/manufacturers, the compute was never
 *   registered there, the triage cache could never self-heal, and the
 *   Improvement Potential column went permanently "—" after any cache
 *   invalidation. Lifting it here lets EITHER route import-and-register it.
 *
 * Importing this module has a side effect: it registers computeTriageAggregation
 * with the triage cache so invalidation hooks + cold-cache self-heal can refresh
 * L2 in the background. The compute fn is a closure with no per-request deps.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';
import {
  detectForeignFamilyWithList,
  loadAllFamilyParamSignatures,
} from '@/lib/services/atlasFamilyParamSignatures';
import { getLogicTable } from '@/lib/logicTables';
import { registerTriageCompute } from '@/lib/services/triageQueueCache';
import { computeSimilarSiblings, type SiblingRef } from '@/lib/services/triageClustering';

/** Slugify a manufacturer display name as a fallback when we can't resolve the
 *  canonical slug from atlas_manufacturers (e.g. row never registered there). */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable lookup key for an override / row paramName. Applies in order:
 *  Unicode NFC normalization → lowercase → trim. Both the map-construction
 *  and lookup paths use this so previously-stored overrides whose paramName
 *  ended up in a different Unicode form (or with trailing whitespace) than
 *  the batch report's row paramName still join correctly. This was the root
 *  cause of accepted Chinese-param rows reappearing in the Open queue —
 *  the literal-equality match was sensitive to canonical-equivalent
 *  representations of the same characters. */
function normalizeOverrideKey(paramName: string): string {
  return paramName.normalize('NFC').toLowerCase().trim();
}

// ── Types — shared between the batches route GET handler, the compute fn,
//    and the manufacturers route rollup. ──
export type AutoFlag = {
  suggestedFamily: string;        // familyId, e.g. 'B6'
  reasoning: string;              // human-readable rationale from registry
  matchingParam: string;          // the paramName that triggered the hit
};
export type NoteStatus = 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null;
/** Per-row signal of how much accepting this row would improve matching
 *  quality. Used by the Triage table to sort + colour-tier rows so engineers
 *  can prioritise high-leverage accepts. See computeMatchingImpact() below. */
export type MatchingImpact = {
  /** product_count × weight. Higher = more impact. Always ≥ 0. */
  score: number;
  /** Destination attribute weight (0–10). 0 = display-only (satellite or
   *  not in any logic table). 10 = blocking gate. */
  weight: number;
  /** Destination attributeId if known (from acceptedOverride). Null when
   *  the row is still pending an AI suggestion / accept — score is then
   *  computed off a default weight estimate (see isEstimate). */
  canonical: string | null;
  /** True when weight was guessed (no override yet); false when looked up
   *  in the destination family's logic table. The client uses this to dim
   *  the chip slightly so engineers know the score will sharpen after
   *  Generate AI Suggestions runs (which the route doesn't see — server
   *  doesn't have access to client-side suggestion cache). */
  isEstimate: boolean;
};
export type GlobalUnmapped = {
  paramName: string;
  sampleValues: string[];
  mfrCount: number;
  productCount: number;
  affectedBatchIds: string[];
  affectedManufacturers: Array<{ slug: string; name: string; productCount: number }>;
  dominantFamily: string | null;
  familyCounts: Record<string, number>;
  dominantCategory: string | null;
  categoryCounts: Record<string, number>;
  autoFlag?: AutoFlag;
  noteStatus?: NoteStatus;
  flaggedBy?: 'auto' | 'engineer' | null;
  /** Engineer bookmark flag (atlas_unmapped_param_notes.is_flagged). Carried
   *  per-row so the server-side `flagged` Triage filter can run on the cached
   *  classified set instead of the client filtering the full set. */
  isFlagged?: boolean;
  /** True iff a non-empty team note exists for this paramName. Powers the
   *  server-side `has_note` Triage filter. */
  hasNote?: boolean;
  /** Cosmetic-variant siblings within the same override scope (Tier-1
   *  "+N similar" clustering). Computed over the FULL classified set in
   *  compute so it stays correct under server pagination. Carries the fields
   *  the bulk-accept path needs (scope + affected batches). */
  similarSiblings?: SiblingRef[];
  acceptedOverride?: {
    id: string;
    attributeId: string;
    attributeName: string;
    unit: string | null;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    wasEdited: boolean;
  };
  orphaned?: boolean;
  /** Set in computeMatchingImpact() after override annotation. */
  matchingImpact?: MatchingImpact;
};
export type Classified = GlobalUnmapped & { effective: 'synonym' | 'flagged' };
export type OverrideMeta = {
  id: string;
  familyId: string;
  paramName: string;
  attributeId: string;
  attributeName: string;
  unit: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

export function isOpen(r: Classified): boolean {
  return !r.acceptedOverride;
}
export function isAccepted(r: Classified): boolean {
  return !!r.acceptedOverride && r.acceptedOverride.isActive;
}
export function isUndone(r: Classified): boolean {
  return !!r.acceptedOverride && !r.acceptedOverride.isActive;
}
export function isDeferred(r: Classified): boolean {
  return r.noteStatus === 'deferred';
}
export function isUnmappable(r: Classified): boolean {
  return r.noteStatus === 'unmappable';
}
/** "OPEN queue" = lifecycle-open AND not parked. Drives the default
 *  view, the OPEN status chip, and triageCounts so the synonyms /
 *  auto-flagged tallies match what the engineer actually sees. */
export function isInOpenQueue(r: Classified): boolean {
  return isOpen(r) && !isUnmappable(r) && !isDeferred(r);
}

/** Heavy aggregation: pulls every pending+applied batch's unmappedParams JSONB,
 *  the full overrides table, the notes table, runs cross-batch dedup +
 *  per-row dominant family/category compute + override annotation + orphan
 *  synthesis + autoFlag classification. 10–60+s on a cold start. Cached via
 *  the triage cache (L1+L2+SWR) — only runs on cold cache or background SWR
 *  refresh. */
export async function computeTriageAggregation(): Promise<{
  classified: Classified[];
  triageCounts: { synonyms: number; autoFlagged: number; total: number };
  statusCounts: { open: number; accepted: number; undone: number; deferred: number; unmappable: number };
}> {
  const t0 = Date.now();
  const supabase = createServiceClient();

  // Three independent DB queries — fired in parallel.
  //
  // The unmapped-param aggregation is now done IN POSTGRES via the
  // get_triage_unmapped_aggregate() RPC (see scripts/supabase-triage-
  // aggregate-rpc.sql). Wire payload drops from MBs of JSONB to ~50KB of
  // pre-aggregated rows. Cold compute drops from 20-30s to ~2-3s.
  // Mirrors the atlas-coverage RPC pattern (Decision #179).
  const aggregatePromise = supabase.rpc('get_triage_unmapped_aggregate');

  // Paginate — atlas_dictionary_overrides has crossed 1000 rows (1319 at last
  // count: 1136 active + 183 inactive). A single un-paginated SELECT hits
  // PostgREST's 1000-row cap and silently drops the OLDEST overrides (this is
  // ordered updated_at desc), so the params they map are no longer recognised as
  // "already accepted" and REAPPEAR in the OPEN Triage queue — the engineer
  // re-maps work they already did. Third instance of the 1000-row footgun
  // (Decisions #206 RPC / #232 the two dict loaders; this compute path was
  // missed). Stable order (updated_at desc, id asc tiebreak) keeps "first-seen
  // per key = most recent" intact AND guarantees no skip/dup across pages. STOP
  // on error — never loop on a failed page (Decision #183 partial-result trap).
  const overridesPromise = (async () => {
    const PAGE = 1000;
    const all: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('atlas_dictionary_overrides')
        .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_by, created_at, updated_at, is_active')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { data: null, error };
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < PAGE) break;
    }
    return { data: all, error: null };
  })();

  // NOTE: no `.not('status','is',null)` filter — note-only and flag-only rows
  // have status=null but still need to feed the server-side `flagged` /
  // `has_note` Triage filters (isFlagged / hasNote below). Pulling all rows
  // (≤ a few hundred) is cheap, and status-null rows classify identically to a
  // missing note (noteStatus → null), so classification is unchanged.
  const notesPromise = supabase
    .from('atlas_unmapped_param_notes')
    .select('param_name, status, flagged_by, auto_diagnosis, is_flagged, note');

  const [aggregateRes, overridesRes, notesRes] = await Promise.all([
    aggregatePromise,
    overridesPromise,
    notesPromise,
  ]);

  if (aggregateRes.error) throw new Error(`get_triage_unmapped_aggregate RPC failed: ${aggregateRes.error.message}`);
  const tQueueSource = Date.now();

  // RPC row shape. The function RETURNS jsonb (a single array, one object per
  // paramName) rather than a TABLE — PostgREST hard-caps TABLE/SETOF returns at
  // 1000 rows and the legacy-discovery batches (Decision #231) push the
  // distinct-param count past that, so a TABLE return silently truncated the
  // queue (Decision #206). For a jsonb return, `data` is the parsed array
  // directly, so the `?? []` + cast below is unchanged.
  // BIGINT values come back as number from jsonb; we still Number() defensively.
  type AggregateRow = {
    param_name: string;
    product_count: number | string;
    affected_batch_ids: string[];
    affected_mfrs: Array<{ name: string; productCount: number }>;
    family_counts: Record<string, number | string>;
    category_counts: Record<string, number | string>;
    sample_values: string[];
  };
  const aggregateRows = (aggregateRes.data ?? []) as AggregateRow[];

  // Dictionary overrides (active + inactive, with metadata).
  // Service-role client — requireAdmin() upstream is the gate (Decision #176).
  const activeOverrideMap = new Map<string, OverrideMeta>();
  const inactiveOverrideMap = new Map<string, OverrideMeta>();
  if (!overridesRes.error) {
    for (const o of overridesRes.data ?? []) {
      const meta: OverrideMeta = {
        id: o.id as string,
        familyId: o.family_id as string,
        paramName: o.param_name as string,
        attributeId: (o.attribute_id as string) ?? '',
        attributeName: (o.attribute_name as string) ?? '',
        unit: (o.unit as string | null) ?? null,
        createdBy: o.created_by as string,
        createdAt: o.created_at as string,
        updatedAt: o.updated_at as string,
        isActive: o.is_active as boolean,
      };
      const key = `${meta.familyId}:${normalizeOverrideKey(meta.paramName)}`;
      if (meta.isActive) {
        if (!activeOverrideMap.has(key)) activeOverrideMap.set(key, meta);
      } else {
        if (!inactiveOverrideMap.has(key)) inactiveOverrideMap.set(key, meta);
      }
    }
  }

  // Per-paramName triage status from atlas_unmapped_param_notes.
  const noteStatusByParam = new Map<string, {
    status: NoteStatus;
    flaggedBy: 'auto' | 'engineer' | null;
    autoDiagnosis: Record<string, unknown> | null;
    isFlagged: boolean;
    hasNote: boolean;
  }>();
  if (!notesRes.error) {
    for (const row of notesRes.data ?? []) {
      const note = (row.note as string | null) ?? null;
      noteStatusByParam.set(row.param_name as string, {
        status: row.status as NoteStatus,
        flaggedBy: (row.flagged_by as 'auto' | 'engineer' | null) ?? null,
        autoDiagnosis: (row.auto_diagnosis as Record<string, unknown> | null) ?? null,
        isFlagged: (row.is_flagged as boolean | null) ?? false,
        hasNote: note !== null && note.trim() !== '',
      });
    }
  }

  const tParseQueries = Date.now();

  // Round 2 — these depend on queries above, fire in parallel:
  //   resolveAdminNames needs override author IDs
  //   atlas_manufacturers slug lookup needs the MFR display names from queueSource
  const overrideAuthorIds = [
    ...activeOverrideMap.values(),
    ...inactiveOverrideMap.values(),
  ].map((m) => m.createdBy);
  const distinctMfrNamesSet = new Set<string>();
  for (const row of aggregateRows) {
    for (const m of row.affected_mfrs ?? []) {
      if (m.name) distinctMfrNamesSet.add(m.name);
    }
  }
  const distinctMfrNames = [...distinctMfrNamesSet];

  const [overrideAuthorNames, mfrSlugRes] = await Promise.all([
    resolveAdminNames(overrideAuthorIds),
    distinctMfrNames.length > 0
      ? supabase
          .from('atlas_manufacturers')
          .select('slug, name_display')
          .in('name_display', distinctMfrNames)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const mfrSlugMap = new Map<string, string>();
  for (const row of mfrSlugRes.data ?? []) {
    mfrSlugMap.set(row.name_display as string, row.slug as string);
  }

  const tRound2 = Date.now();

  // Build GlobalUnmapped entries from the RPC's pre-aggregated rows. The
  // heavy cross-batch dedup (productCount sum, batch_id dedup, MFR rollup,
  // familyCounts/categoryCounts merge, sample-value dedup) is already done
  // server-side; here we just convert types + resolve MFR slugs + compute
  // dominantFamily/dominantCategory.
  const unmappedMap = new Map<string, GlobalUnmapped>();
  for (const row of aggregateRows) {
    // Convert merged JSONB count maps from {string: string|number} → {string: number}.
    const familyCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(row.family_counts ?? {})) {
      familyCounts[k] = typeof v === 'number' ? v : Number(v);
    }
    const categoryCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(row.category_counts ?? {})) {
      categoryCounts[k] = typeof v === 'number' ? v : Number(v);
    }

    const rankedFam = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);
    const rankedCat = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

    // Resolve MFR slugs. RPC returns {name, productCount}; route maps
    // name → canonical slug via atlas_manufacturers. Fallback to slugify
    // when not registered (matches the prior behavior).
    const affectedManufacturers = (row.affected_mfrs ?? [])
      .map((m) => ({
        slug: mfrSlugMap.get(m.name) ?? slugifyName(m.name),
        name: m.name,
        productCount: typeof m.productCount === 'number' ? m.productCount : Number(m.productCount),
      }))
      .sort((a, b) => b.productCount - a.productCount);

    unmappedMap.set(row.param_name, {
      paramName: row.param_name,
      sampleValues: row.sample_values ?? [],
      mfrCount: affectedManufacturers.length,
      productCount: typeof row.product_count === 'number' ? row.product_count : Number(row.product_count),
      affectedBatchIds: row.affected_batch_ids ?? [],
      affectedManufacturers,
      dominantFamily: rankedFam[0]?.[0] ?? null,
      familyCounts,
      dominantCategory: rankedCat[0]?.[0] ?? null,
      categoryCounts,
    });
  }

  // Override annotation + orphan synthesis.
  const seenOverrideIds = new Set<string>();
  function lookupOverride(entry: GlobalUnmapped): OverrideMeta | null {
    const candidates: string[] = [];
    const normalizedParam = normalizeOverrideKey(entry.paramName);
    if (entry.dominantFamily) candidates.push(`${entry.dominantFamily}:${normalizedParam}`);
    if (entry.dominantCategory && entry.dominantCategory !== entry.dominantFamily) {
      candidates.push(`${entry.dominantCategory}:${normalizedParam}`);
    }
    for (const k of candidates) {
      const m = activeOverrideMap.get(k);
      if (m) return m;
    }
    for (const k of candidates) {
      const m = inactiveOverrideMap.get(k);
      if (m) return m;
    }
    return null;
  }
  /** Look up the matching-engine weight of an attributeId within a family's
   *  logic table. Returns 0 for satellite attrs (`_*` convention) and for
   *  attrs that aren't in the logic table (display-only canonicals like the
   *  L2 RF param map). Memoised per (family, attr) for the duration of this
   *  request to amortise the rule scan. */
  const ruleWeightCache = new Map<string, number>();
  function lookupRuleWeight(familyId: string | null, attrId: string): number {
    if (!familyId || !attrId) return 0;
    if (attrId.startsWith('_')) return 0;
    const key = `${familyId}::${attrId}`;
    const hit = ruleWeightCache.get(key);
    if (hit !== undefined) return hit;
    const table = getLogicTable(familyId);
    const w = table?.rules.find((r) => r.attributeId === attrId)?.weight ?? 0;
    ruleWeightCache.set(key, w);
    return w;
  }
  /** Score a row's matching impact = how much coverage / matching quality
   *  would improve if this accept landed. Server-side estimate; client may
   *  refine for rows with cached AI suggestions (those carry a definitive
   *  suggestedAttributeId that the server can't see).
   *
   *  Formula: product_count × weight. Weight resolution:
   *    - If acceptedOverride is set → look up that attributeId in the
   *      dominantFamily's logic table. Exact, isEstimate=false.
   *    - Else if dominantFamily is L3 (has a logic table) → default to 7
   *      (medium-high). Most params being triaged tend to be matching-
   *      relevant; this biases sort toward "looks like real matching work".
   *      isEstimate=true.
   *    - Else (L2-only, e.g. RF/Microcontrollers) → weight 2 (display-only).
   *      isEstimate=true. */
  function computeMatchingImpact(entry: GlobalUnmapped): MatchingImpact {
    const family = entry.dominantFamily;
    const accepted = entry.acceptedOverride;
    if (accepted) {
      const w = lookupRuleWeight(family, accepted.attributeId);
      return {
        score: entry.productCount * w,
        weight: w,
        canonical: accepted.attributeId,
        isEstimate: false,
      };
    }
    if (family && getLogicTable(family)) {
      return { score: entry.productCount * 7, weight: 7, canonical: null, isEstimate: true };
    }
    return { score: entry.productCount * 2, weight: 2, canonical: null, isEstimate: true };
  }
  function annotateOverride(entry: GlobalUnmapped): GlobalUnmapped {
    const ov = lookupOverride(entry);
    if (!ov) return entry;
    seenOverrideIds.add(ov.id);
    return {
      ...entry,
      acceptedOverride: {
        id: ov.id,
        attributeId: ov.attributeId,
        attributeName: ov.attributeName,
        unit: ov.unit,
        createdBy: ov.createdBy,
        createdByName: overrideAuthorNames.get(ov.createdBy) ?? 'Unknown',
        createdAt: ov.createdAt,
        updatedAt: ov.updatedAt,
        isActive: ov.isActive,
        wasEdited: ov.updatedAt !== ov.createdAt,
      },
    };
  }
  const overrideAnnotated = [...unmappedMap.values()].map(annotateOverride);

  const orphans: GlobalUnmapped[] = [];
  for (const ov of [...activeOverrideMap.values(), ...inactiveOverrideMap.values()]) {
    if (seenOverrideIds.has(ov.id)) continue;
    orphans.push({
      paramName: ov.paramName,
      sampleValues: [],
      mfrCount: 0,
      productCount: 0,
      affectedBatchIds: [],
      affectedManufacturers: [],
      dominantFamily: ov.familyId,
      familyCounts: {},
      dominantCategory: null,
      categoryCounts: {},
      acceptedOverride: {
        id: ov.id,
        attributeId: ov.attributeId,
        attributeName: ov.attributeName,
        unit: ov.unit,
        createdBy: ov.createdBy,
        createdByName: overrideAuthorNames.get(ov.createdBy) ?? 'Unknown',
        createdAt: ov.createdAt,
        updatedAt: ov.updatedAt,
        isActive: ov.isActive,
        wasEdited: ov.updatedAt !== ov.createdAt,
      },
      orphaned: true,
    });
    seenOverrideIds.add(ov.id);
  }
  const overrideResolved = [...overrideAnnotated, ...orphans].map((entry) => ({
    ...entry,
    matchingImpact: computeMatchingImpact(entry),
  }));

  // Foreign-family auto-flag classification. Loads merged code+DB
  // signatures so engineer-curated entries (added via the AI Investigator
  // "wrong family" Confirm flow) take effect on the next queue render.
  const allSignatures = await loadAllFamilyParamSignatures();
  const classified: Classified[] = overrideResolved.map((entry) => {
    const noteRecord = noteStatusByParam.get(entry.paramName);
    const noteStatus: NoteStatus = noteRecord?.status ?? null;
    const flaggedBy = noteRecord?.flaggedBy ?? null;

    let autoFlag: AutoFlag | undefined;
    if (noteStatus !== 'confirmed_in_family') {
      const sig = detectForeignFamilyWithList(entry.paramName, entry.dominantFamily, allSignatures);
      if (sig) {
        autoFlag = {
          suggestedFamily: sig.target.familyId,
          reasoning: sig.reasoning,
          matchingParam: entry.paramName,
        };
      }
    }

    let effective: 'synonym' | 'flagged';
    if (noteStatus === 'wrong_family') effective = 'flagged';
    else if (noteStatus === 'confirmed_in_family') effective = 'synonym';
    else if (autoFlag) effective = 'flagged';
    else effective = 'synonym';

    return {
      ...entry,
      autoFlag,
      noteStatus,
      flaggedBy,
      isFlagged: noteRecord?.isFlagged ?? false,
      hasNote: noteRecord?.hasNote ?? false,
      effective,
    };
  });

  // Tier-1 "+N similar" clustering over the FULL classified set. Attached
  // per-row so the client (which may only hold one page under server
  // pagination) still renders accurate "+N similar" chips and can bulk-accept
  // cosmetic variants that live on other pages. computeSimilarSiblings already
  // excludes unscoped + active-override rows.
  const siblingMap = computeSimilarSiblings(classified);
  for (const row of classified) {
    const sibs = siblingMap.get(row.paramName);
    if (sibs && sibs.length > 0) row.similarSiblings = sibs;
  }

  // Global counts (over the FULL classified set). triageCounts and the
  // OPEN status count both use isInOpenQueue so synonyms / auto-flagged
  // tallies match what the engineer sees once deferred + unmappable rows
  // are hidden from the default view.
  const openQueueClassified = classified.filter(isInOpenQueue);
  const triageCounts = {
    synonyms: openQueueClassified.filter((r) => r.effective === 'synonym').length,
    autoFlagged: openQueueClassified.filter((r) => r.effective === 'flagged').length,
    total: openQueueClassified.length,
  };
  const statusCounts = {
    open: openQueueClassified.length,
    accepted: classified.filter(isAccepted).length,
    undone: classified.filter(isUndone).length,
    deferred: classified.filter(isDeferred).length,
    unmappable: classified.filter(isUnmappable).length,
  };

  const tEnd = Date.now();
  console.log(`[triage compute] rpc+overrides+notes parallel: ${tQueueSource - t0}ms, parse: ${tParseQueries - tQueueSource}ms, round2 (admin names + mfr slugs): ${tRound2 - tParseQueries}ms, build+classify: ${tEnd - tRound2}ms, total: ${tEnd - t0}ms (${aggregateRows.length} aggregate rows, ${classified.length} classified rows)`);

  return { classified, triageCounts, statusCounts };
}

// Register at module-load so invalidation hooks + cold-cache self-heal can
// refresh L2 in the background. The compute fn is a closure with no
// per-request deps. Any route that imports this module registers the compute.
registerTriageCompute(computeTriageAggregation);
