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
 *     + classification + autoFlag pass) lives in computeTriageAggregation() in
 *     lib/services/triageQueueCompute.ts. Importing that module registers the
 *     compute with the cache module so invalidation hooks in mutating routes —
 *     AND the cold-cache self-heal on /api/admin/manufacturers — can refresh L2
 *     in the background. It was lifted out of this route so the manufacturers
 *     route (Improvement Potential column) can register + run it too.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import type { IngestBatch, IngestRisk, IngestStatus } from '@/lib/services/atlasIngestService';
import {
  readCachedTriageData,
  writeCachedTriageData,
  triggerBackgroundRecompute,
} from '@/lib/services/triageQueueCache';
import {
  computeTriageAggregation,
  isAccepted,
  isUndone,
  isDeferred,
  isUnmappable,
  isInOpenQueue,
  type Classified,
  type GlobalUnmapped,
} from '@/lib/services/triageQueueCompute';

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
