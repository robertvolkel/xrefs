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
 *
 * Returns the batch list along with aggregate dashboard counters and a
 * deduplicated global unmapped-params table.
 *
 * The unmapped-params queue is INDEPENDENTLY scoped:
 *   - Includes both pending AND applied batches (the JSONB report.unmappedParams
 *     survives apply; previously we filtered them out by inheriting the status
 *     filter on the batch list query, which made the "queue" disappear after
 *     Proceed). Decision-derived: persistent queue across batch lifecycle.
 *   - Excludes params that already have an active dictionary override for the
 *     row's dominant family — those are de-facto resolved (next regenerate
 *     would map them) and shouldn't clutter the engineer's queue.
 *   - Each row carries `affectedManufacturers: Array<{slug, name, productCount}>`
 *     so the engineer sees provenance, not just an opaque count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import type { IngestBatch, IngestRisk, IngestStatus } from '@/lib/services/atlasIngestService';

const VALID_STATUSES: IngestStatus[] = ['pending', 'applied', 'reverted', 'expired'];
const VALID_RISKS: IngestRisk[] = ['clean', 'review', 'attention'];

/** Slugify a manufacturer display name as a fallback when we can't resolve the
 *  canonical slug from atlas_manufacturers (e.g. row never registered there). */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') ?? 'pending') as IngestStatus;
    const riskParam = searchParams.get('risk') as IngestRisk | null;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10) || 500, 5000);
    const batchFilter = searchParams.get('batch');

    if (!VALID_STATUSES.includes(statusParam)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${statusParam}` }, { status: 400 });
    }
    if (riskParam && !VALID_RISKS.includes(riskParam)) {
      return NextResponse.json({ success: false, error: `Invalid risk: ${riskParam}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Batch list (status-filtered, for the Ingest panel) ─────────────────
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

    // ── Unmapped-params source (pending + applied, for the persistent queue) ──
    // Independent of statusParam: the queue spans all batches whose unmapped
    // params haven't been resolved yet, regardless of whether the batch itself
    // is still pending or already applied.
    // Projection: pull only the JSONB slices we actually need for aggregation
    // (unmappedParams + familyCounts), not the full report. Reports include the
    // per-product diff which can run multi-MB for large batches; selecting the
    // sub-paths cuts the wire payload ~80% and parse cost proportionally.
    let queueSourceQuery = supabase
      .from('atlas_ingest_batches')
      .select('batch_id, manufacturer, status, unmappedParams:report->unmappedParams, familyCounts:report->familyCounts')
      .in('status', ['pending', 'applied'])
      .limit(5000);
    if (batchFilter) queueSourceQuery = queueSourceQuery.eq('batch_id', batchFilter);
    const { data: queueSourceData, error: queueSourceErr } = await queueSourceQuery;
    if (queueSourceErr) throw new Error(queueSourceErr.message);
    const queueSourceBatches = (queueSourceData ?? []) as Array<{
      batch_id: string;
      manufacturer: string;
      status: IngestStatus;
      unmappedParams: Array<{ paramName: string; sampleValues: string[]; productCount: number; attributeId: string; kind: 'gaia' | 'standard' }> | null;
      familyCounts: Record<string, number> | null;
    }>;

    // ── Active dictionary overrides (used to filter resolved params) ───────
    // Use the service-role client directly (bypasses RLS). The shared
    // fetchAllDictOverrides() helper uses a cookie-bound user client which
    // hit RLS-blocked-reads in this admin endpoint context — admin requires
    // are already enforced by requireAdmin() at the top of the route, so
    // service role is the right authority here. Wrapped in try/catch to
    // preserve the fail-open behavior when the table isn't present.
    const activeOverrideKeys = new Set<string>();
    try {
      const { data: activeOverridesData, error: ovErr } = await supabase
        .from('atlas_dictionary_overrides')
        .select('family_id, param_name')
        .eq('is_active', true);
      if (!ovErr) {
        for (const o of activeOverridesData ?? []) {
          activeOverrideKeys.add(`${o.family_id}:${o.param_name}`);
        }
      }
    } catch {
      // Table missing or transient failure — fail open (queue stays unfiltered).
    }

    // ── MFR slug lookup (display name → canonical slug) ────────────────────
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

    // ── Aggregate counters (computed from the visible batch list, not the
    //    queue source — these are operator-facing dashboard numbers) ────────
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

    // ── Aggregate unmappedParamsGlobal across the queue source ─────────────
    type GlobalUnmapped = {
      paramName: string;
      sampleValues: string[];
      mfrCount: number;
      productCount: number;
      affectedBatchIds: string[];
      affectedManufacturers: Array<{ slug: string; name: string; productCount: number }>;
      dominantFamily: string | null;
      familyCounts: Record<string, number>;
    };
    const unmappedMap = new Map<string, GlobalUnmapped>();
    // Per-row, dedupe MFR aggregation by slug — avoids double-counting when the
    // same MFR appears in multiple batches (re-ingest case).
    const mfrAggByParam = new Map<string, Map<string, { name: string; productCount: number }>>();

    for (const b of queueSourceBatches) {
      const batchFamilyCounts = b.familyCounts ?? {};
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
          };
          unmappedMap.set(key, entry);
        }
        entry.productCount += u.productCount;
        entry.affectedBatchIds.push(b.batch_id);

        // Per-MFR rollup (deduped by slug across batches)
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

        // Family rollup — same approximation as before (batch-level family
        // distribution scaled by the param's product share).
        const batchTotal = Object.values(batchFamilyCounts).reduce((s: number, n) => s + (n as number), 0) || 1;
        for (const [fam, count] of Object.entries(batchFamilyCounts)) {
          if (fam === '(uncovered)') continue;
          entry.familyCounts[fam] = (entry.familyCounts[fam] ?? 0) + Math.round((count as number) * (u.productCount / batchTotal));
        }
        for (const sv of u.sampleValues) {
          if (entry.sampleValues.length < 5 && !entry.sampleValues.includes(sv)) {
            entry.sampleValues.push(sv);
          }
        }
      }
    }

    // Finalize: per-row dominantFamily + MFR list + override filter
    for (const [paramName, entry] of unmappedMap) {
      const ranked = Object.entries(entry.familyCounts).sort((a, b) => b[1] - a[1]);
      entry.dominantFamily = ranked[0]?.[0] ?? null;

      const perMfr = mfrAggByParam.get(paramName);
      if (perMfr) {
        entry.affectedManufacturers = [...perMfr.entries()]
          .map(([slug, v]) => ({ slug, name: v.name, productCount: v.productCount }))
          .sort((a, b) => b.productCount - a.productCount);
        entry.mfrCount = entry.affectedManufacturers.length;
      }
    }

    // Drop entries that already have an active override for their dominant family
    // — those are de-facto resolved. Override.param_name is stored lowercased
    // (the Accept flow normalizes via .toLowerCase() before insert), so compare
    // against entry.paramName.toLowerCase() too — otherwise raw source casing
    // like "Type" won't match the lowercase "type" key in the override set,
    // and accepted rows reappear after regen.
    const unmappedParamsGlobal = [...unmappedMap.values()]
      .filter((entry) => {
        if (!entry.dominantFamily) return true; // no family signal — keep visible
        return !activeOverrideKeys.has(`${entry.dominantFamily}:${entry.paramName.toLowerCase()}`);
      })
      .sort((a, b) => b.productCount - a.productCount);

    return NextResponse.json({
      success: true,
      batches,
      aggregate: { counts, productCounts, attrChanges },
      unmappedParamsGlobal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
