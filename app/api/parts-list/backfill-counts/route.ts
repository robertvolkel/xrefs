import { NextRequest, NextResponse } from 'next/server';
import { lookupCachedRecommendations } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { fetchUserPreferences } from '@/lib/services/userPreferencesService';
import { createClient as createSbClient } from '@/lib/supabase/server';
import { computeRecommendationCounts } from '@/lib/types';

const CONCURRENCY = 5;

/**
 * Backfill per-bucket recommendation counts for rows that were validated
 * before the logicDrivenCount/mfrCertifiedCount/accurisCertifiedCount fields
 * existed. Reads ONLY from the L2 recommendations cache — never triggers a
 * live pipeline run, so this has zero Digikey/Mouser/parts.io blast radius.
 *
 * Returns the subset of rows for which the cache had a fresh entry; the
 * client merges into row state and saves once.
 */
export async function POST(request: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { listId } = (await request.json()) as { listId?: string };
  if (!listId) {
    return NextResponse.json({ success: false, error: 'listId required' }, { status: 400 });
  }

  const sb = await createSbClient();
  const { data: list, error } = await sb
    .from('parts_lists')
    .select('currency, rows')
    .eq('id', listId)
    .single();
  if (error || !list) {
    return NextResponse.json({ success: false, error: 'list not found' }, { status: 404 });
  }

  const prefs = await fetchUserPreferences(user!.id);
  const currency = (list as { currency?: string }).currency || 'USD';
  const rows = ((list as { rows: unknown[] }).rows ?? []) as Array<{
    rowIndex: number;
    resolvedPart?: { mpn?: string };
    status?: string;
    recommendationCount?: number;
    logicDrivenCount?: number;
    mfrCertifiedCount?: number;
    accurisCertifiedCount?: number;
  }>;

  const targets = rows.filter(
    r =>
      r.status === 'resolved' &&
      (r.recommendationCount ?? 0) > 0 &&
      r.logicDrivenCount === undefined &&
      r.mfrCertifiedCount === undefined &&
      r.accurisCertifiedCount === undefined &&
      r.resolvedPart?.mpn,
  );

  if (targets.length === 0) {
    return NextResponse.json({ success: true, data: { updates: [], scanned: rows.length, hit: 0, miss: 0 } });
  }

  const updates: Array<{
    rowIndex: number;
    logicDrivenCount: number;
    mfrCertifiedCount: number;
    accurisCertifiedCount: number;
  }> = [];
  let hit = 0;
  let miss = 0;

  // Batch mode opts MUST match the validation call so the cache variant aligns
  const BATCH_OPTS = { skipPartsioEnrichment: true, filterForBatch: true, skipFindchips: true } as const;

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++;
      const row = targets[i];
      const mpn = row.resolvedPart!.mpn!;
      try {
        const cached = await lookupCachedRecommendations(
          mpn, undefined, undefined, currency, undefined, prefs, BATCH_OPTS,
        );
        if (cached) {
          const counts = computeRecommendationCounts(cached.recommendations);
          updates.push({ rowIndex: row.rowIndex, ...counts });
          hit++;
        } else {
          miss++;
        }
      } catch {
        miss++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  return NextResponse.json({
    success: true,
    data: { updates, scanned: targets.length, hit, miss },
  });
}
