/**
 * GET /api/admin/atlas/ingest/batches
 *
 * Query params:
 *   status:    pending | applied | reverted | expired (default: pending)
 *   risk:      clean | review | attention (optional)
 *   limit:     number (default: 500)
 *
 * Returns the batch list along with aggregate dashboard counters and a
 * deduplicated global unmapped-params table across the result set.
 *
 * Response:
 *   {
 *     success: true,
 *     batches: IngestBatch[],
 *     aggregate: {
 *       counts: { clean, review, attention, total },
 *       productCounts: { willInsert, willUpdate, willDelete },
 *       attrChanges: { totalNewAttrs, totalChangedValues, totalRemovedAttrs },
 *     },
 *     unmappedParamsGlobal: Array<{
 *       paramName, sampleValues, mfrCount, productCount,
 *       affectedBatchIds: string[],
 *     }>,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import type { IngestBatch, IngestRisk, IngestStatus } from '@/lib/services/atlasIngestService';

const VALID_STATUSES: IngestStatus[] = ['pending', 'applied', 'reverted', 'expired'];
const VALID_RISKS: IngestRisk[] = ['clean', 'review', 'attention'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') ?? 'pending') as IngestStatus;
    const riskParam = searchParams.get('risk') as IngestRisk | null;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10) || 500, 5000);

    if (!VALID_STATUSES.includes(statusParam)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${statusParam}` }, { status: 400 });
    }
    if (riskParam && !VALID_RISKS.includes(riskParam)) {
      return NextResponse.json({ success: false, error: `Invalid risk: ${riskParam}` }, { status: 400 });
    }

    const supabase = createServiceClient();
    let query = supabase
      .from('atlas_ingest_batches')
      .select('*')
      .eq('status', statusParam)
      .order('risk', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (riskParam) query = query.eq('risk', riskParam);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const batches = (data ?? []) as IngestBatch[];

    // Aggregate counters
    const counts = { clean: 0, review: 0, attention: 0, total: batches.length };
    const productCounts = { willInsert: 0, willUpdate: 0, willDelete: 0 };
    const attrChanges = { totalNewAttrs: 0, totalChangedValues: 0, totalRemovedAttrs: 0 };
    type GlobalUnmapped = {
      paramName: string;
      sampleValues: string[];
      mfrCount: number;
      productCount: number;
      affectedBatchIds: string[];
      // Dominant family across all affected batches: the family_id with the most
      // product-volume in batches that surfaced this unmapped param. Used as the
      // schema context when calling the AI suggestion endpoint. Falls back to the
      // category string if no family_id was assigned.
      dominantFamily: string | null;
      familyCounts: Record<string, number>; // for transparency / future UI
    };
    const unmappedMap = new Map<string, GlobalUnmapped>();

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
      const batchFamilyCounts = r?.familyCounts ?? {};
      for (const u of r?.unmappedParams ?? []) {
        const key = u.paramName;
        let entry = unmappedMap.get(key);
        if (!entry) {
          entry = {
            paramName: key,
            sampleValues: [],
            mfrCount: 0,
            productCount: 0,
            affectedBatchIds: [],
            dominantFamily: null,
            familyCounts: {},
          };
          unmappedMap.set(key, entry);
        }
        entry.mfrCount++;
        entry.productCount += u.productCount;
        entry.affectedBatchIds.push(b.batch_id);
        // Roll up family-counts from this batch — we can't know exactly how many
        // products *of this specific param* came from each family without per-param
        // family attribution in the report, so we approximate by adding the batch's
        // overall family distribution scaled by this param's product count.
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

    // Pick dominant family per entry (highest product-weighted count, must exceed 0)
    for (const entry of unmappedMap.values()) {
      const ranked = Object.entries(entry.familyCounts).sort((a, b) => b[1] - a[1]);
      entry.dominantFamily = ranked[0]?.[0] ?? null;
    }

    const unmappedParamsGlobal = [...unmappedMap.values()].sort((a, b) => b.productCount - a.productCount);

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
