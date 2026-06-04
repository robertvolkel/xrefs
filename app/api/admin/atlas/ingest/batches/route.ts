/**
 * GET /api/admin/atlas/ingest/batches
 *
 * Query params:
 *   status:    pending | applied | reverted | expired (default: pending) — filters the
 *              `batches` list shown in the Ingest panel. Does NOT affect the
 *              `unmappedParamsGlobal` aggregation (see below).
 *   risk:      clean | review | attention (optional) — applied to `batches` filter
 *   limit:     number (default: 500)
 *   batch:     batch_id (optional) — when set, restricts BOTH `batches` and the
 *              unmapped-params aggregation to a single batch. Used by the
 *              "Review in Dictionary Triage →" deep link from a batch card.
 *   include:   synonyms | auto_flagged | all (default: synonyms) — filters the
 *              unmapped-params queue by effective triage classification.
 *
 * Returns the batch list along with aggregate dashboard counters, a
 * deduplicated global unmapped-params table, and triageCounts so the UI
 * can render bucket badges without re-querying.
 *
 * Caching (L1+L2+SWR, mirrors /api/admin/atlas):
 *   - L1 in-memory (30 min) + L2 Supabase admin_stats_cache row 'triage-queue'
 *     (persistent, no TTL — invalidation kicks off background recompute that
 *     upserts L2 in place).
 *   - SWR threshold (6h) on L2: if older, serve immediately and trigger a
 *     silent recompute. Safety net for invalidations we missed.
 *   - The HEAVY aggregation (queueSourceQuery + dictionary overrides + notes
 *     + classification + autoFlag pass) runs in computeTriageAggregation()
 *     at module scope. Registered with the cache module so invalidation hooks
 *     in mutating routes can refresh L2 in the background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';
import type { IngestBatch, IngestRisk, IngestStatus } from '@/lib/services/atlasIngestService';
import {
  detectForeignFamilyWithList,
  loadAllFamilyParamSignatures,
} from '@/lib/services/atlasFamilyParamSignatures';
import {
  readCachedTriageData,
  writeCachedTriageData,
  registerTriageCompute,
  triggerBackgroundRecompute,
} from '@/lib/services/triageQueueCache';
import { getLogicTable } from '@/lib/logicTables';

// Force the route to run dynamically on every request (no Next.js auto-caching).
// We have our own L1+L2 cache layer with explicit invalidation; we don't want
// Next.js's framework-level caching layered on top, which would mask the
// invalidation hooks and serve stale data.
export const dynamic = 'force-dynamic';

const VALID_STATUSES: IngestStatus[] = ['pending', 'applied', 'reverted', 'expired'];
const VALID_RISKS: IngestRisk[] = ['clean', 'review', 'attention'];
const VALID_INCLUDE = new Set(['synonyms', 'auto_flagged', 'all']);
type IncludeMode = 'synonyms' | 'auto_flagged' | 'all';
const VALID_STATUS_FILTER = new Set(['open', 'accepted', 'undone', 'deferred', 'unmappable', 'all']);
type StatusFilter = 'open' | 'accepted' | 'undone' | 'deferred' | 'unmappable' | 'all';

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

// ── Module-scope types — shared between GET and computeTriageAggregation ──
type AutoFlag = {
  suggestedFamily: string;        // familyId, e.g. 'B6'
  reasoning: string;              // human-readable rationale from registry
  matchingParam: string;          // the paramName that triggered the hit
};
type NoteStatus = 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null;
/** Per-row signal of how much accepting this row would improve matching
 *  quality. Used by the Triage table to sort + colour-tier rows so engineers
 *  can prioritise high-leverage accepts. See computeMatchingImpact() below. */
type MatchingImpact = {
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
type GlobalUnmapped = {
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
type Classified = GlobalUnmapped & { effective: 'synonym' | 'flagged' };
type OverrideMeta = {
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

function isOpen(r: Classified): boolean {
  return !r.acceptedOverride;
}
function isAccepted(r: Classified): boolean {
  return !!r.acceptedOverride && r.acceptedOverride.isActive;
}
function isUndone(r: Classified): boolean {
  return !!r.acceptedOverride && !r.acceptedOverride.isActive;
}
function isDeferred(r: Classified): boolean {
  return r.noteStatus === 'deferred';
}
function isUnmappable(r: Classified): boolean {
  return r.noteStatus === 'unmappable';
}
/** "OPEN queue" = lifecycle-open AND not parked. Drives the default
 *  view, the OPEN status chip, and triageCounts so the synonyms /
 *  auto-flagged tallies match what the engineer actually sees. */
function isInOpenQueue(r: Classified): boolean {
  return isOpen(r) && !isUnmappable(r) && !isDeferred(r);
}

/** Heavy aggregation: pulls every pending+applied batch's unmappedParams JSONB,
 *  the full overrides table, the notes table, runs cross-batch dedup +
 *  per-row dominant family/category compute + override annotation + orphan
 *  synthesis + autoFlag classification. 10–60+s on a cold start. Cached via
 *  L1+L2 below — only runs on cold cache or background SWR refresh. */
async function computeTriageAggregation(): Promise<{
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

  const overridesPromise = supabase
    .from('atlas_dictionary_overrides')
    .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_by, created_at, updated_at, is_active')
    .order('updated_at', { ascending: false });

  const notesPromise = supabase
    .from('atlas_unmapped_param_notes')
    .select('param_name, status, flagged_by, auto_diagnosis')
    .not('status', 'is', null);

  const [aggregateRes, overridesRes, notesRes] = await Promise.all([
    aggregatePromise,
    overridesPromise,
    notesPromise,
  ]);

  if (aggregateRes.error) throw new Error(`get_triage_unmapped_aggregate RPC failed: ${aggregateRes.error.message}`);
  const tQueueSource = Date.now();

  // RPC row shape — mirrors the SQL function's RETURNS TABLE definition.
  // BIGINT columns come back from postgres-js as string OR number depending
  // on driver config; we safely Number() them.
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
  }>();
  if (!notesRes.error) {
    for (const row of notesRes.data ?? []) {
      noteStatusByParam.set(row.param_name as string, {
        status: row.status as NoteStatus,
        flaggedBy: (row.flagged_by as 'auto' | 'engineer' | null) ?? null,
        autoDiagnosis: (row.auto_diagnosis as Record<string, unknown> | null) ?? null,
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
      effective,
    };
  });

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

// Register at module-load so invalidation hooks can refresh L2 in the
// background. The compute fn is a closure with no per-request deps.
registerTriageCompute(computeTriageAggregation);

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') ?? 'pending') as IngestStatus;
    const riskParam = searchParams.get('risk') as IngestRisk | null;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10) || 500, 5000);
    const batchFilter = searchParams.get('batch');
    // include / statusFilter / forceFresh: kept for back-compat with older
    // clients that pass them, but the route always returns the FULL classified
    // set. The current client filters mode + statusFilter locally to avoid a
    // server round-trip on every chip click. ?refresh=1 bypasses cache.
    const includeRaw = (searchParams.get('include') ?? 'all');
    const include: IncludeMode = VALID_INCLUDE.has(includeRaw) ? (includeRaw as IncludeMode) : 'all';
    const statusFilterRaw = (searchParams.get('status_filter') ?? 'all');
    const statusFilter: StatusFilter = VALID_STATUS_FILTER.has(statusFilterRaw) ? (statusFilterRaw as StatusFilter) : 'all';
    const forceFresh = searchParams.get('refresh') === '1';

    if (!VALID_STATUSES.includes(statusParam)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${statusParam}` }, { status: 400 });
    }
    if (riskParam && !VALID_RISKS.includes(riskParam)) {
      return NextResponse.json({ success: false, error: `Invalid risk: ${riskParam}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Batch list (status-filtered, for the Ingest panel). Per-request. ──
    // Projection — pulls only the report sub-fields the BatchCard summary
    // needs, NOT the heavy ones. Without this, large batches (e.g. Sunlord's
    // 16,756-product apply) bloat report.attrChanges.perProduct to MBs and
    // the response size triggers a 500 ("Applied fetch failed: 500").
    // BatchCard lazy-fetches the full report from /batches/[batchId] on
    // expand to render the per-product diff table.
    let batchListQuery = supabase
      .from('atlas_ingest_batches')
      .select(`
        batch_id, manufacturer, source_file, source_file_sha256, status, risk,
        created_at, applied_at, applied_by, reverted_at, reverted_by,
        productCounts:report->productCounts,
        attrChangesTotalNew:report->attrChanges->totalNewAttrs,
        attrChangesTotalChanged:report->attrChanges->totalChangedValues,
        attrChangesTotalRemoved:report->attrChanges->totalRemovedAttrs,
        attrCountStats:report->attrCountStats,
        unmappedParams:report->unmappedParams,
        familyCounts:report->familyCounts,
        categoryCounts:report->categoryCounts,
        mappingStats:report->mappingStats
      `)
      .order('risk', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (batchFilter) {
      // batch_id is a unique key — the user explicitly asked for this batch,
      // so don't filter by status (otherwise an APPLIED batch wouldn't appear
      // when the route's default status='pending' is in effect, and the
      // Triage page's "Filtered to <MFR> batch" chip can't resolve the MFR
      // name from data.batches[0]).
      batchListQuery = batchListQuery.eq('batch_id', batchFilter);
    } else {
      batchListQuery = batchListQuery.eq('status', statusParam);
      if (riskParam) batchListQuery = batchListQuery.eq('risk', riskParam);
    }

    const { data: batchListData, error: batchListErr } = await batchListQuery;
    if (batchListErr) throw new Error(batchListErr.message);

    // Reshape projected rows back into the IngestBatch shape the UI expects.
    // Heavy sub-fields (attrChanges.perProduct, classificationChanges, deletes)
    // are returned as empty arrays — BatchCard lazy-loads them on expand.
    type ProjectedRow = {
      batch_id: string;
      manufacturer: string;
      source_file: string;
      source_file_sha256: string;
      status: IngestStatus;
      risk: IngestRisk;
      created_at: string;
      applied_at: string | null;
      applied_by: string | null;
      reverted_at: string | null;
      reverted_by: string | null;
      productCounts: { inNewFile?: number; inDb?: number; willInsert?: number; willUpdate?: number; willDelete?: number } | null;
      attrChangesTotalNew: number | null;
      attrChangesTotalChanged: number | null;
      attrChangesTotalRemoved: number | null;
      attrCountStats: { avgBefore?: number; avgAfter?: number } | null;
      unmappedParams: unknown[] | null;
      familyCounts: Record<string, number> | null;
      categoryCounts: Record<string, number> | null;
      mappingStats: { total?: number; mapped?: number; errors?: number } | null;
    };
    const batches: IngestBatch[] = (batchListData as ProjectedRow[] ?? []).map((b) => ({
      batch_id: b.batch_id,
      manufacturer: b.manufacturer,
      source_file: b.source_file,
      source_file_sha256: b.source_file_sha256,
      report: {
        manufacturer: b.manufacturer,
        sourceFile: b.source_file,
        sourceFileSha256: b.source_file_sha256,
        productCounts: {
          inNewFile: b.productCounts?.inNewFile ?? 0,
          inDb: b.productCounts?.inDb ?? 0,
          willInsert: b.productCounts?.willInsert ?? 0,
          willUpdate: b.productCounts?.willUpdate ?? 0,
          willDelete: b.productCounts?.willDelete ?? 0,
        },
        attrChanges: {
          totalNewAttrs: b.attrChangesTotalNew ?? 0,
          totalChangedValues: b.attrChangesTotalChanged ?? 0,
          totalRemovedAttrs: b.attrChangesTotalRemoved ?? 0,
          perProduct: [],  // Lazy: fetched by BatchCard via /batches/[batchId] on expand
        },
        classificationChanges: [],  // Lazy
        deletes: [],                 // Lazy
        attrCountStats: { avgBefore: b.attrCountStats?.avgBefore ?? 0, avgAfter: b.attrCountStats?.avgAfter ?? 0 },
        unmappedParams: (b.unmappedParams ?? []) as IngestBatch['report']['unmappedParams'],
        familyCounts: b.familyCounts ?? {},
        categoryCounts: b.categoryCounts ?? {},
        mappingStats: { total: b.mappingStats?.total ?? 0, mapped: b.mappingStats?.mapped ?? 0, errors: b.mappingStats?.errors ?? 0 },
      },
      status: b.status,
      risk: b.risk,
      created_at: b.created_at,
      applied_at: b.applied_at,
      applied_by: b.applied_by,
      reverted_at: b.reverted_at,
      reverted_by: b.reverted_by,
    }));

    // ── Cached aggregation read (L1 → L2 → cold compute) ──────────────────
    let classified: Classified[];
    let cachedTriageCounts: { synonyms: number; autoFlagged: number; total: number };
    let cachedStatusCounts: { open: number; accepted: number; undone: number; deferred: number; unmappable: number };

    const cacheResult = await readCachedTriageData(forceFresh);
    if (cacheResult) {
      classified = cacheResult.data.classified as Classified[];
      cachedTriageCounts = cacheResult.data.triageCounts;
      // L2-migration safety: pre-deploy cached entries lack deferred /
      // unmappable. Recompute them from the cached classified set instead
      // of waiting for SWR refresh — keeps chip counts honest immediately.
      const rawCounts = cacheResult.data.statusCounts as Partial<typeof cachedStatusCounts>;
      cachedStatusCounts = {
        open: rawCounts.open ?? 0,
        accepted: rawCounts.accepted ?? 0,
        undone: rawCounts.undone ?? 0,
        deferred: rawCounts.deferred ?? classified.filter(isDeferred).length,
        unmappable: rawCounts.unmappable ?? classified.filter(isUnmappable).length,
      };
      // SWR: serve stale L2 immediately, refresh in background. The
      // recompute upserts L2 when finished; next request gets fresh data.
      if (cacheResult.source === 'l2-stale') {
        triggerBackgroundRecompute();
      }
    } else {
      // Fully cold cache (first load post-deploy or after explicit purge).
      // Compute synchronously — post-Supabase-upgrade (May 21, 2026, Decision
      // #194) this runs in ~1s; the prior 30-90s pathology was a Free-tier
      // Nano-compute symptom, not an RPC algorithmic issue.
      const fresh = await computeTriageAggregation();
      void writeCachedTriageData(fresh).catch(() => {});
      classified = fresh.classified;
      cachedTriageCounts = fresh.triageCounts;
      cachedStatusCounts = fresh.statusCounts;
    }

    // ── Aggregate counters (per-request, depend on the visible batch list) ─
    const counts = { clean: 0, review: 0, attention: 0, total: batches.length };
    const productCounts = { willInsert: 0, willUpdate: 0, willDelete: 0 };
    const attrChanges = { totalNewAttrs: 0, totalChangedValues: 0, totalRemovedAttrs: 0 };
    for (const b of batches) {
      counts[b.risk]++;
      const r = b.report;
      if (r?.productCounts) {
        productCounts.willInsert += r.productCounts.willInsert ?? 0;
        productCounts.willUpdate += r.productCounts.willUpdate ?? 0;
        productCounts.willDelete += r.productCounts.willDelete ?? 0;
      }
      if (r?.attrChanges) {
        attrChanges.totalNewAttrs += r.attrChanges.totalNewAttrs ?? 0;
        attrChanges.totalChangedValues += r.attrChanges.totalChangedValues ?? 0;
        attrChanges.totalRemovedAttrs += r.attrChanges.totalRemovedAttrs ?? 0;
      }
    }

    // ── Per-request: batchFilter slice + include + statusFilter + sort ────
    let workingClassified = classified;
    let triageCounts = cachedTriageCounts;
    let statusCounts = cachedStatusCounts;

    if (batchFilter) {
      workingClassified = classified.filter((r) => r.affectedBatchIds.includes(batchFilter));
      const openQueue = workingClassified.filter(isInOpenQueue);
      triageCounts = {
        synonyms: openQueue.filter((r) => r.effective === 'synonym').length,
        autoFlagged: openQueue.filter((r) => r.effective === 'flagged').length,
        total: openQueue.length,
      };
      statusCounts = {
        open: openQueue.length,
        accepted: workingClassified.filter(isAccepted).length,
        undone: workingClassified.filter(isUndone).length,
        deferred: workingClassified.filter(isDeferred).length,
        unmappable: workingClassified.filter(isUnmappable).length,
      };
    }

    let visible: Classified[];
    if (include === 'auto_flagged') visible = workingClassified.filter((r) => r.effective === 'flagged');
    else if (include === 'all') visible = workingClassified;
    else visible = workingClassified.filter((r) => r.effective === 'synonym');

    // Parked rows (deferred + unmappable) are hidden from synonyms +
    // auto_flagged default views. They remain visible when the engineer
    // explicitly clicks the DEFERRED or UNMAPPABLE status chip (or under
    // include=all so the audit trail stays accessible).
    if (include !== 'all') {
      visible = visible.filter((r) => {
        if (isUnmappable(r) && statusFilter !== 'unmappable') return false;
        if (isDeferred(r) && statusFilter !== 'deferred') return false;
        return true;
      });
    }

    if (statusFilter === 'open') visible = visible.filter(isInOpenQueue);
    else if (statusFilter === 'accepted') visible = visible.filter(isAccepted);
    else if (statusFilter === 'undone') visible = visible.filter(isUndone);
    else if (statusFilter === 'deferred') visible = visible.filter(isDeferred);
    else if (statusFilter === 'unmappable') visible = visible.filter(isUnmappable);

    const unmappedParamsGlobal: GlobalUnmapped[] = visible
      .map(({ effective: _effective, ...rest }) => rest)
      .sort((a, b) => {
        const aConfirmed = a.noteStatus === 'wrong_family' ? 1 : 0;
        const bConfirmed = b.noteStatus === 'wrong_family' ? 1 : 0;
        if (aConfirmed !== bConfirmed) return aConfirmed - bConfirmed;
        return b.productCount - a.productCount;
      });

    return NextResponse.json({
      success: true,
      batches,
      aggregate: { counts, productCounts, attrChanges },
      unmappedParamsGlobal,
      triageCounts,
      statusCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
