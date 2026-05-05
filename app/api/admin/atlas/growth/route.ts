/**
 * GET /api/admin/atlas/growth?mode=overview|full
 *
 * Powers the Atlas Coverage page's Activity tab: an event log of every MFR
 * touch event (initial bulk import + per-batch ingests) plus a cumulative
 * time-series for the growth chart.
 *
 * - mode=overview returns just the 5 most recent events (used by the Overview
 *   tab's "Latest MFRs updated" widget).
 * - mode=full returns the entire payload.
 *
 * Both modes serve from the same cached payload (key: 'atlas-growth' in
 * admin_stats_cache). Mirrors the L1/L2/SWR pattern used by /api/admin/atlas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';
import type { IngestDiffReport } from '@/lib/services/atlasIngestService';

const CACHE_KEY = 'atlas-growth';

let memCache: { body: string; cachedAt: string } | null = null;
let memCacheTimestamp = 0;
const MEM_CACHE_TTL_MS = 60_000;
const SWR_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;
let backgroundRecomputeInFlight = false;

export function invalidateAtlasGrowthCache() {
  memCache = null;
  memCacheTimestamp = 0;
  // Fire-and-forget background recompute. We DON'T delete the persistent row
  // first — `computeAndPersist` upserts on top of the existing row when it
  // finishes, so users keep seeing the previous (slightly stale) payload for
  // the ~20s the recompute takes. Zero blocking page loads after first compute.
  void (async () => {
    try {
      await computeAndPersist();
    } catch (err) {
      console.error('invalidateAtlasGrowthCache background error:', err);
    }
  })();
}

// ── Public response shape ─────────────────────────────────

export type AtlasGrowthEventType =
  | 'first_added'
  | 'parts_added'
  | 'attributes_enriched'
  | 're_ingested';

export interface AtlasGrowthEvent {
  id: string;
  manufacturer: string | null;
  nameEn: string | null;
  nameZh: string | null;
  slug: string | null;
  eventType: AtlasGrowthEventType;
  mfrCount: number;
  categoriesAffected: string[];
  partsInserted: number;
  partsAttrUpdated: number;
  attrChangeTotal: number;
  appliedAt: string;
  isSynthetic: boolean;
}

export interface AtlasGrowthSeriesPoint {
  date: string;
  cumulativeMfrs: number;
  cumulativeProducts: number;
}

export interface AtlasGrowthResponse {
  events: AtlasGrowthEvent[];
  recentEvents: AtlasGrowthEvent[];
  series: AtlasGrowthSeriesPoint[];
  totals: { mfrCount: number; productCount: number };
  cachedAt: string;
}

// ── Helpers ───────────────────────────────────────────────

async function fetchAllPages<T>(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any,
  orderColumn = 'id',
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const results: T[] = [];
  let offset = 0;
  while (true) {
    let query = supabase.from(table).select(columns).order(orderColumn).range(offset, offset + PAGE_SIZE - 1);
    if (filter) query = filter(query);
    const { data: page } = await query;
    if (!page || page.length === 0) break;
    results.push(...(page as T[]));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

function utcDay(iso: string): string {
  // Truncate ISO to UTC YYYY-MM-DD.
  return new Date(iso).toISOString().slice(0, 10);
}

function familyIdToCategory(familyId: string): string | null {
  const table = getLogicTable(familyId);
  return table ? table.category : null;
}

// ── Aggregation ───────────────────────────────────────────

interface BatchRow {
  batch_id: string;
  manufacturer: string;
  applied_at: string;
  report: IngestDiffReport;
}

interface ProductRow {
  manufacturer: string;
  family_id: string | null;
  category: string;
  created_at: string;
}

interface MfrRow {
  name_display: string;
  name_en: string;
  name_zh: string | null;
  slug: string;
}

async function computeAtlasGrowth(): Promise<AtlasGrowthResponse> {
  // Use the service-role client so background SWR recomputes (which run
  // outside any request context) bypass RLS and can still read
  // atlas_ingest_batches. The user-context client returns empty under RLS
  // when the request session isn't propagated.
  const supabase = createServiceClient();

  const [batches, products, mfrRecords] = await Promise.all([
    fetchAllPages<BatchRow>(
      supabase,
      'atlas_ingest_batches',
      'batch_id, manufacturer, applied_at, report',
      // Only applied batches power the growth log — pending/reverted/expired
      // are noise for the "what's been added to the dataset" narrative.
      (q) => q.eq('status', 'applied').not('applied_at', 'is', null),
      'applied_at',
    ),
    fetchAllPages<ProductRow>(
      supabase,
      'atlas_products',
      'manufacturer, family_id, category, created_at',
    ),
    (async () => {
      const { data } = await supabase
        .from('atlas_manufacturers')
        .select('name_display, name_en, name_zh, slug');
      return (data ?? []) as MfrRow[];
    })(),
  ]);

  // Identity lookup keyed by both name_display and name_en (mirrors /api/admin/atlas).
  const mfrIdentity = new Map<string, MfrRow>();
  for (const r of mfrRecords) {
    if (r.name_display) mfrIdentity.set(r.name_display, r);
    if (r.name_en && !mfrIdentity.has(r.name_en)) mfrIdentity.set(r.name_en, r);
  }

  // Group batches by manufacturer (sorted ascending by applied_at within group).
  const batchesByMfr = new Map<string, BatchRow[]>();
  for (const b of batches) {
    if (!b.applied_at) continue;
    const list = batchesByMfr.get(b.manufacturer) ?? [];
    list.push(b);
    batchesByMfr.set(b.manufacturer, list);
  }
  for (const list of batchesByMfr.values()) {
    list.sort((a, b) => a.applied_at.localeCompare(b.applied_at));
  }

  // Per-MFR product roll-ups.
  interface ProductRollup {
    productCount: number;
    minCreatedAt: string;
    maxCreatedAt: string;
    categories: Set<string>;
  }
  const productByMfr = new Map<string, ProductRollup>();
  for (const p of products) {
    let r = productByMfr.get(p.manufacturer);
    if (!r) {
      r = {
        productCount: 0,
        minCreatedAt: p.created_at,
        maxCreatedAt: p.created_at,
        categories: new Set<string>(),
      };
      productByMfr.set(p.manufacturer, r);
    }
    r.productCount++;
    if (p.created_at < r.minCreatedAt) r.minCreatedAt = p.created_at;
    if (p.created_at > r.maxCreatedAt) r.maxCreatedAt = p.created_at;
    if (p.category) r.categories.add(p.category);
  }

  // ── Build events ─────────────────────────────────────────
  const events: AtlasGrowthEvent[] = [];

  // Per-batch events.
  for (const b of batches) {
    const report = b.report;
    if (!report) continue;

    const willInsert = report.productCounts?.willInsert ?? 0;
    const willUpdate = report.productCounts?.willUpdate ?? 0;
    const willDelete = report.productCounts?.willDelete ?? 0;
    const attrChangeTotal =
      (report.attrChanges?.totalNewAttrs ?? 0) +
      (report.attrChanges?.totalChangedValues ?? 0) +
      (report.attrChanges?.totalRemovedAttrs ?? 0);

    // Classify event type. Even no-op batches (re-uploads with no diff) get a
    // row — the user wants visibility into every applied batch, not just the
    // ones that changed something.
    let eventType: AtlasGrowthEventType;
    if (willInsert > 0) {
      const mfrBatches = batchesByMfr.get(b.manufacturer) ?? [];
      const isFirstBatchForMfr = mfrBatches[0]?.batch_id === b.batch_id;
      // first_added only if MFR has no prior products from a pre-pipeline ingest
      const rollup = productByMfr.get(b.manufacturer);
      const HOUR_MS = 60 * 60 * 1000;
      const hasOlderProducts = rollup
        ? new Date(rollup.minCreatedAt).getTime() < new Date(b.applied_at).getTime() - HOUR_MS
        : false;
      eventType = isFirstBatchForMfr && !hasOlderProducts ? 'first_added' : 'parts_added';
    } else if (attrChangeTotal > 0) {
      eventType = 'attributes_enriched';
    } else {
      // No new parts, no attribute deltas — typically an idempotent re-upload.
      eventType = 're_ingested';
    }

    // Resolve categories. Prefer mapping the batch's familyCounts keys to
    // category labels via getLogicTable; fall back to the MFR's actual
    // atlas_products.category set when the report reports only uncovered
    // families (e.g. BRIGHT's products are classified L2-only with no
    // familyId, so familyCounts={"(uncovered)":47} which maps to nothing).
    const fromReport = Array.from(
      new Set(
        Object.keys(report.familyCounts ?? {})
          .map((fid) => familyIdToCategory(fid))
          .filter((c): c is string => !!c),
      ),
    );
    const rollupForCategories = productByMfr.get(b.manufacturer);
    const categoriesAffected =
      fromReport.length > 0
        ? fromReport.sort()
        : rollupForCategories
          ? Array.from(rollupForCategories.categories).sort()
          : [];

    const identity = mfrIdentity.get(b.manufacturer);

    events.push({
      id: b.batch_id,
      manufacturer: b.manufacturer,
      nameEn: identity?.name_en ?? null,
      nameZh: identity?.name_zh ?? null,
      slug: identity?.slug ?? null,
      eventType,
      mfrCount: 1,
      categoriesAffected,
      partsInserted: willInsert,
      partsAttrUpdated: willUpdate,
      attrChangeTotal,
      appliedAt: b.applied_at,
      isSynthetic: false,
    });
  }

  // ── Synthetic per-MFR events (one per pre-pipeline MFR) ──
  // "Pre-pipeline MFR" = present in atlas_products but no applied batch
  // covers it. Each gets its own 'first_added' event at MIN(created_at).
  // MFRs imported in the same bulk run share the same timestamp, but the
  // user wants them visible as discrete rows so the activity log shows the
  // full historical roster (per their explicit ask).
  const batchedMfrs = new Set(batchesByMfr.keys());
  const prePipelineMfrs: string[] = [];
  for (const mfr of productByMfr.keys()) {
    if (!batchedMfrs.has(mfr)) prePipelineMfrs.push(mfr);
  }

  for (const mfr of prePipelineMfrs) {
    const rollup = productByMfr.get(mfr)!;
    const identity = mfrIdentity.get(mfr);
    events.push({
      id: `synthetic:${mfr}`,
      manufacturer: mfr,
      nameEn: identity?.name_en ?? null,
      nameZh: identity?.name_zh ?? null,
      slug: identity?.slug ?? null,
      eventType: 'first_added',
      mfrCount: 1,
      categoriesAffected: Array.from(rollup.categories).sort(),
      partsInserted: rollup.productCount,
      partsAttrUpdated: 0,
      attrChangeTotal: 0,
      appliedAt: rollup.minCreatedAt,
      isSynthetic: true,
    });
  }

  // Sort events desc by appliedAt.
  events.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

  // ── Series (cumulative MFR + product counts over time) ───
  // Walk per-MFR pre-pipeline tuples + per-batch tuples in ASC order.
  interface SeriesTuple {
    date: string;
    mfrDelta: number;
    productDelta: number;
  }
  const tuples: SeriesTuple[] = [];

  // Pre-pipeline: one tuple per MFR at MIN(created_at).
  for (const m of prePipelineMfrs) {
    const r = productByMfr.get(m)!;
    tuples.push({
      date: r.minCreatedAt,
      mfrDelta: 1,
      productDelta: r.productCount,
    });
  }
  // Post-pipeline batches.
  for (const b of batches) {
    if (!b.applied_at || !b.report) continue;
    const willInsert = b.report.productCounts?.willInsert ?? 0;
    const willDelete = b.report.productCounts?.willDelete ?? 0;
    const mfrBatches = batchesByMfr.get(b.manufacturer) ?? [];
    const isFirstBatchForMfr = mfrBatches[0]?.batch_id === b.batch_id;
    // Only count toward mfrDelta if this is the MFR's first batch AND the MFR
    // wasn't already counted via the pre-pipeline tuple (rare crossover case
    // when a pre-pipeline MFR gets ingested through the new pipeline later).
    const rollup = productByMfr.get(b.manufacturer);
    const HOUR_MS = 60 * 60 * 1000;
    const hadPreProducts = rollup
      ? new Date(rollup.minCreatedAt).getTime() < new Date(b.applied_at).getTime() - HOUR_MS
      : false;
    const mfrDelta = isFirstBatchForMfr && !hadPreProducts ? 1 : 0;

    tuples.push({
      date: b.applied_at,
      mfrDelta,
      productDelta: willInsert - willDelete,
    });
  }

  tuples.sort((a, b) => a.date.localeCompare(b.date));

  // Bucket by UTC day, end-of-day cumulative.
  const series: AtlasGrowthSeriesPoint[] = [];
  let cumulativeMfrs = 0;
  let cumulativeProducts = 0;
  let currentDay: string | null = null;
  for (const t of tuples) {
    const day = utcDay(t.date);
    if (currentDay !== null && day !== currentDay) {
      series.push({ date: currentDay, cumulativeMfrs, cumulativeProducts });
    }
    cumulativeMfrs += t.mfrDelta;
    cumulativeProducts += t.productDelta;
    currentDay = day;
  }
  if (currentDay !== null) {
    series.push({ date: currentDay, cumulativeMfrs, cumulativeProducts });
  }

  // Final totals (independent of series so they reflect the live state).
  const totalMfrCount = productByMfr.size;
  const totalProductCount = Array.from(productByMfr.values()).reduce(
    (sum, r) => sum + r.productCount,
    0,
  );

  return {
    events,
    recentEvents: events.slice(0, 5),
    series,
    totals: { mfrCount: totalMfrCount, productCount: totalProductCount },
    cachedAt: '', // overwritten on serialize
  };
}

async function computeAndPersist(): Promise<{ payload: AtlasGrowthResponse; computedAt: string }> {
  const payload = await computeAtlasGrowth();
  const computedAt = new Date().toISOString();
  try {
    const svc = createServiceClient();
    await svc
      .from('admin_stats_cache')
      .upsert({ key: CACHE_KEY, payload, computed_at: computedAt }, { onConflict: 'key' });
  } catch (err) {
    console.error('admin_stats_cache persist failed (atlas-growth):', err);
  }
  return { payload, computedAt };
}

async function readPersistentCache(): Promise<{ payload: AtlasGrowthResponse; computedAt: string } | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('admin_stats_cache')
      .select('payload, computed_at')
      .eq('key', CACHE_KEY)
      .maybeSingle();
    if (data?.payload && data.computed_at) {
      return {
        payload: data.payload as AtlasGrowthResponse,
        computedAt: data.computed_at as string,
      };
    }
  } catch (err) {
    console.error('admin_stats_cache read failed (atlas-growth):', err);
  }
  return null;
}

function isStale(computedAt: string): boolean {
  return Date.now() - new Date(computedAt).getTime() > SWR_STALE_THRESHOLD_MS;
}

function triggerBackgroundRecompute() {
  if (backgroundRecomputeInFlight) return;
  backgroundRecomputeInFlight = true;
  void (async () => {
    try {
      await computeAndPersist();
    } catch (err) {
      console.error('Background recompute failed (atlas-growth):', err);
    } finally {
      backgroundRecomputeInFlight = false;
    }
  })();
}

function sliceForMode(payload: AtlasGrowthResponse, mode: string): AtlasGrowthResponse {
  if (mode === 'overview') {
    return {
      events: [],
      recentEvents: payload.recentEvents,
      series: [],
      totals: payload.totals,
      cachedAt: payload.cachedAt,
    };
  }
  return payload;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const mode = request.nextUrl.searchParams.get('mode') === 'overview' ? 'overview' : 'full';
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

    if (!forceRefresh && memCache && Date.now() - memCacheTimestamp < MEM_CACHE_TTL_MS) {
      const parsed = JSON.parse(memCache.body) as AtlasGrowthResponse;
      const sliced = sliceForMode(parsed, mode);
      return NextResponse.json(sliced);
    }

    let payload: AtlasGrowthResponse | null = null;
    let computedAt: string | null = null;

    if (!forceRefresh) {
      const cached = await readPersistentCache();
      if (cached) {
        payload = cached.payload;
        computedAt = cached.computedAt;
        if (isStale(cached.computedAt)) triggerBackgroundRecompute();
      }
    }

    if (!payload || !computedAt) {
      try {
        const fresh = await computeAndPersist();
        payload = fresh.payload;
        computedAt = fresh.computedAt;
      } catch (err) {
        console.error('computeAndPersist failed (atlas-growth):', err);
        const cached = await readPersistentCache();
        if (cached) {
          payload = cached.payload;
          computedAt = cached.computedAt;
        } else {
          return NextResponse.json(
            { error: 'Stats temporarily unavailable', detail: err instanceof Error ? err.message : String(err) },
            { status: 503 },
          );
        }
      }
    }

    const fullPayload: AtlasGrowthResponse = { ...payload, cachedAt: computedAt };
    const body = JSON.stringify(fullPayload);
    memCache = { body, cachedAt: computedAt };
    memCacheTimestamp = Date.now();

    return NextResponse.json(sliceForMode(fullPayload, mode));
  } catch (err) {
    console.error('GET /api/admin/atlas/growth error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
