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
import { detectForeignFamily } from '@/lib/services/atlasFamilyParamSignatures';
import {
  readCachedTriageData,
  writeCachedTriageData,
  registerTriageCompute,
  triggerBackgroundRecompute,
} from '@/lib/services/triageQueueCache';

const VALID_STATUSES: IngestStatus[] = ['pending', 'applied', 'reverted', 'expired'];
const VALID_RISKS: IngestRisk[] = ['clean', 'review', 'attention'];
const VALID_INCLUDE = new Set(['synonyms', 'auto_flagged', 'all']);
type IncludeMode = 'synonyms' | 'auto_flagged' | 'all';
const VALID_STATUS_FILTER = new Set(['open', 'accepted', 'undone', 'all']);
type StatusFilter = 'open' | 'accepted' | 'undone' | 'all';

/** Slugify a manufacturer display name as a fallback when we can't resolve the
 *  canonical slug from atlas_manufacturers (e.g. row never registered there). */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Module-scope types — shared between GET and computeTriageAggregation ──
type AutoFlag = {
  suggestedFamily: string;        // familyId, e.g. 'B6'
  reasoning: string;              // human-readable rationale from registry
  matchingParam: string;          // the paramName that triggered the hit
};
type NoteStatus = 'wrong_family' | 'confirmed_in_family' | null;
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

/** Heavy aggregation: pulls every pending+applied batch's unmappedParams JSONB,
 *  the full overrides table, the notes table, runs cross-batch dedup +
 *  per-row dominant family/category compute + override annotation + orphan
 *  synthesis + autoFlag classification. 10–60+s on a cold start. Cached via
 *  L1+L2 below — only runs on cold cache or background SWR refresh. */
async function computeTriageAggregation(): Promise<{
  classified: Classified[];
  triageCounts: { synonyms: number; autoFlagged: number; total: number };
  statusCounts: { open: number; accepted: number; undone: number };
}> {
  const supabase = createServiceClient();

  // Pull the FULL pending+applied set so the cached classified set serves
  // any batchFilter request via in-memory slicing in the GET handler.
  // Projection: only the JSONB sub-paths we need. Reports include the
  // per-product diff which can run multi-MB for large batches; selecting
  // sub-paths cuts the wire payload ~80%.
  const queueSourceQuery = supabase
    .from('atlas_ingest_batches')
    .select('batch_id, manufacturer, status, unmappedParams:report->unmappedParams, familyCounts:report->familyCounts, categoryCounts:report->categoryCounts')
    .in('status', ['pending', 'applied'])
    .limit(5000);
  const { data: queueSourceData, error: queueSourceErr } = await queueSourceQuery;
  if (queueSourceErr) throw new Error(queueSourceErr.message);
  const queueSourceBatches = (queueSourceData ?? []) as Array<{
    batch_id: string;
    manufacturer: string;
    status: IngestStatus;
    unmappedParams: Array<{
      paramName: string;
      sampleValues: string[];
      productCount: number;
      attributeId: string;
      kind: 'gaia' | 'standard';
      familyCounts?: Record<string, number>;
      categoryCounts?: Record<string, number>;
    }> | null;
    familyCounts: Record<string, number> | null;
    categoryCounts?: Record<string, number> | null;
  }>;

  // Dictionary overrides (active + inactive, with metadata).
  // Service-role client — requireAdmin() upstream is the gate (Decision #176).
  const activeOverrideMap = new Map<string, OverrideMeta>();
  const inactiveOverrideMap = new Map<string, OverrideMeta>();
  try {
    const { data: overrideData, error: ovErr } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_by, created_at, updated_at, is_active')
      .order('updated_at', { ascending: false });
    if (!ovErr) {
      for (const o of overrideData ?? []) {
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
        const key = `${meta.familyId}:${meta.paramName}`;
        if (meta.isActive) {
          if (!activeOverrideMap.has(key)) activeOverrideMap.set(key, meta);
        } else {
          if (!inactiveOverrideMap.has(key)) inactiveOverrideMap.set(key, meta);
        }
      }
    }
  } catch {
    // Table missing or transient failure — fail open.
  }

  const overrideAuthorIds = [
    ...activeOverrideMap.values(),
    ...inactiveOverrideMap.values(),
  ].map((m) => m.createdBy);
  const overrideAuthorNames = await resolveAdminNames(overrideAuthorIds);

  // Per-paramName triage status from atlas_unmapped_param_notes.
  const noteStatusByParam = new Map<string, {
    status: 'wrong_family' | 'confirmed_in_family' | null;
    flaggedBy: 'auto' | 'engineer' | null;
    autoDiagnosis: Record<string, unknown> | null;
  }>();
  try {
    const { data: notesData, error: notesErr } = await supabase
      .from('atlas_unmapped_param_notes')
      .select('param_name, status, flagged_by, auto_diagnosis')
      .not('status', 'is', null);
    if (!notesErr) {
      for (const row of notesData ?? []) {
        noteStatusByParam.set(row.param_name as string, {
          status: row.status as 'wrong_family' | 'confirmed_in_family' | null,
          flaggedBy: (row.flagged_by as 'auto' | 'engineer' | null) ?? null,
          autoDiagnosis: (row.auto_diagnosis as Record<string, unknown> | null) ?? null,
        });
      }
    }
  } catch {
    // Notes table missing — treat all rows as default.
  }

  // MFR slug lookup (display name → canonical slug).
  const distinctMfrNames = [...new Set(queueSourceBatches.map((b) => b.manufacturer).filter(Boolean))];
  const mfrSlugMap = new Map<string, string>();
  if (distinctMfrNames.length > 0) {
    const { data: mfrRows } = await supabase
      .from('atlas_manufacturers')
      .select('slug, name_display')
      .in('name_display', distinctMfrNames);
    for (const row of mfrRows ?? []) {
      mfrSlugMap.set(row.name_display, row.slug);
    }
  }

  // Aggregate unmappedParamsGlobal.
  const unmappedMap = new Map<string, GlobalUnmapped>();
  const mfrAggByParam = new Map<string, Map<string, { name: string; productCount: number }>>();

  for (const b of queueSourceBatches) {
    const batchFamilyCounts = b.familyCounts ?? {};
    const batchCategoryCounts = b.categoryCounts ?? {};
    const mfrSlug = mfrSlugMap.get(b.manufacturer) ?? slugifyName(b.manufacturer);
    for (const u of b.unmappedParams ?? []) {
      const key = u.paramName;
      let entry = unmappedMap.get(key);
      if (!entry) {
        entry = {
          paramName: key,
          sampleValues: [],
          mfrCount: 0,
          productCount: 0,
          affectedBatchIds: [],
          affectedManufacturers: [],
          dominantFamily: null,
          familyCounts: {},
          dominantCategory: null,
          categoryCounts: {},
        };
        unmappedMap.set(key, entry);
      }
      entry.productCount += u.productCount;
      entry.affectedBatchIds.push(b.batch_id);

      let perMfr = mfrAggByParam.get(key);
      if (!perMfr) {
        perMfr = new Map();
        mfrAggByParam.set(key, perMfr);
      }
      const existing = perMfr.get(mfrSlug);
      if (existing) {
        existing.productCount += u.productCount;
      } else {
        perMfr.set(mfrSlug, { name: b.manufacturer, productCount: u.productCount });
      }

      // Family rollup (per-param preferred; batch-level fallback).
      if (u.familyCounts && Object.keys(u.familyCounts).length > 0) {
        for (const [fam, count] of Object.entries(u.familyCounts)) {
          if (fam === '(uncovered)') continue;
          entry.familyCounts[fam] = (entry.familyCounts[fam] ?? 0) + (count as number);
        }
      } else {
        const batchTotal = Object.values(batchFamilyCounts).reduce((s: number, n) => s + (n as number), 0) || 1;
        for (const [fam, count] of Object.entries(batchFamilyCounts)) {
          if (fam === '(uncovered)') continue;
          entry.familyCounts[fam] = (entry.familyCounts[fam] ?? 0) + Math.round((count as number) * (u.productCount / batchTotal));
        }
      }
      // Category rollup.
      if (u.categoryCounts && Object.keys(u.categoryCounts).length > 0) {
        for (const [cat, count] of Object.entries(u.categoryCounts)) {
          if (cat === '(uncovered)') continue;
          entry.categoryCounts[cat] = (entry.categoryCounts[cat] ?? 0) + (count as number);
        }
      } else {
        const batchCatTotal = Object.values(batchCategoryCounts).reduce((s: number, n) => s + (n as number), 0) || 1;
        for (const [cat, count] of Object.entries(batchCategoryCounts)) {
          if (cat === '(uncovered)') continue;
          entry.categoryCounts[cat] = (entry.categoryCounts[cat] ?? 0) + Math.round((count as number) * (u.productCount / batchCatTotal));
        }
      }
      for (const sv of u.sampleValues) {
        if (entry.sampleValues.length < 5 && !entry.sampleValues.includes(sv)) {
          entry.sampleValues.push(sv);
        }
      }
    }
  }

  for (const [paramName, entry] of unmappedMap) {
    const rankedFam = Object.entries(entry.familyCounts).sort((a, b) => b[1] - a[1]);
    entry.dominantFamily = rankedFam[0]?.[0] ?? null;

    const rankedCat = Object.entries(entry.categoryCounts).sort((a, b) => b[1] - a[1]);
    entry.dominantCategory = rankedCat[0]?.[0] ?? null;

    const perMfr = mfrAggByParam.get(paramName);
    if (perMfr) {
      entry.affectedManufacturers = [...perMfr.entries()]
        .map(([slug, v]) => ({ slug, name: v.name, productCount: v.productCount }))
        .sort((a, b) => b.productCount - a.productCount);
      entry.mfrCount = entry.affectedManufacturers.length;
    }
  }

  // Override annotation + orphan synthesis.
  const seenOverrideIds = new Set<string>();
  function lookupOverride(entry: GlobalUnmapped): OverrideMeta | null {
    const candidates: string[] = [];
    if (entry.dominantFamily) candidates.push(`${entry.dominantFamily}:${entry.paramName.toLowerCase()}`);
    if (entry.dominantCategory && entry.dominantCategory !== entry.dominantFamily) {
      candidates.push(`${entry.dominantCategory}:${entry.paramName.toLowerCase()}`);
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
  const overrideResolved = [...overrideAnnotated, ...orphans];

  // Foreign-family auto-flag classification.
  const classified: Classified[] = overrideResolved.map((entry) => {
    const noteRecord = noteStatusByParam.get(entry.paramName);
    const noteStatus: NoteStatus = noteRecord?.status ?? null;
    const flaggedBy = noteRecord?.flaggedBy ?? null;

    let autoFlag: AutoFlag | undefined;
    if (noteStatus !== 'confirmed_in_family') {
      const sig = detectForeignFamily(entry.paramName, entry.dominantFamily);
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

  // Global counts (over the FULL classified set).
  const openClassified = classified.filter(isOpen);
  const triageCounts = {
    synonyms: openClassified.filter((r) => r.effective === 'synonym').length,
    autoFlagged: openClassified.filter((r) => r.effective === 'flagged').length,
    total: openClassified.length,
  };
  const statusCounts = {
    open: openClassified.length,
    accepted: classified.filter(isAccepted).length,
    undone: classified.filter(isUndone).length,
  };

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
    const includeRaw = (searchParams.get('include') ?? 'synonyms');
    const include: IncludeMode = VALID_INCLUDE.has(includeRaw) ? (includeRaw as IncludeMode) : 'synonyms';
    const statusFilterRaw = (searchParams.get('status_filter') ?? 'open');
    const statusFilter: StatusFilter = VALID_STATUS_FILTER.has(statusFilterRaw) ? (statusFilterRaw as StatusFilter) : 'open';

    if (!VALID_STATUSES.includes(statusParam)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${statusParam}` }, { status: 400 });
    }
    if (riskParam && !VALID_RISKS.includes(riskParam)) {
      return NextResponse.json({ success: false, error: `Invalid risk: ${riskParam}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Batch list (status-filtered, for the Ingest panel). Per-request. ──
    let batchListQuery = supabase
      .from('atlas_ingest_batches')
      .select('*')
      .eq('status', statusParam)
      .order('risk', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (riskParam) batchListQuery = batchListQuery.eq('risk', riskParam);
    if (batchFilter) batchListQuery = batchListQuery.eq('batch_id', batchFilter);

    const { data: batchListData, error: batchListErr } = await batchListQuery;
    if (batchListErr) throw new Error(batchListErr.message);
    const batches = (batchListData ?? []) as IngestBatch[];

    // ── Cached aggregation read (L1 → L2 → cold compute) ──────────────────
    let classified: Classified[];
    let cachedTriageCounts: { synonyms: number; autoFlagged: number; total: number };
    let cachedStatusCounts: { open: number; accepted: number; undone: number };

    const cacheResult = await readCachedTriageData();
    if (cacheResult) {
      classified = cacheResult.data.classified as Classified[];
      cachedTriageCounts = cacheResult.data.triageCounts;
      cachedStatusCounts = cacheResult.data.statusCounts;
      // SWR: serve stale L2 immediately, refresh in background. The
      // recompute upserts L2 when finished; next request gets fresh data.
      if (cacheResult.source === 'l2-stale') {
        triggerBackgroundRecompute();
      }
    } else {
      // Fully cold cache (first load post-deploy or after explicit purge).
      const fresh = await computeTriageAggregation();
      classified = fresh.classified;
      cachedTriageCounts = fresh.triageCounts;
      cachedStatusCounts = fresh.statusCounts;
      await writeCachedTriageData(fresh);
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
      const open = workingClassified.filter(isOpen);
      triageCounts = {
        synonyms: open.filter((r) => r.effective === 'synonym').length,
        autoFlagged: open.filter((r) => r.effective === 'flagged').length,
        total: open.length,
      };
      statusCounts = {
        open: open.length,
        accepted: workingClassified.filter(isAccepted).length,
        undone: workingClassified.filter(isUndone).length,
      };
    }

    let visible: Classified[];
    if (include === 'auto_flagged') visible = workingClassified.filter((r) => r.effective === 'flagged');
    else if (include === 'all') visible = workingClassified;
    else visible = workingClassified.filter((r) => r.effective === 'synonym');

    if (statusFilter === 'open') visible = visible.filter(isOpen);
    else if (statusFilter === 'accepted') visible = visible.filter(isAccepted);
    else if (statusFilter === 'undone') visible = visible.filter(isUndone);

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
