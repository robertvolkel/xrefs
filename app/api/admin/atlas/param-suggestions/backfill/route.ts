/**
 * POST /api/admin/atlas/param-suggestions/backfill
 *
 * One-time migration of an engineer's browser-only AI suggestions
 * (localStorage `atlas-ingest-ai-suggest-v7:*`) into the durable
 * atlas_param_suggestions table. Runs once per browser (the client guards with
 * a localStorage flag) so the pile already generated pre-launch counts toward
 * "generated so far" and isn't re-charged to regenerate.
 *
 * Body: { items: Array<{ familyId, paramName, suggestion, cardVersion?, schemaVersion? }> }
 * Only rows with an accept/defer verdict are persisted (the store filters).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { upsertParamSuggestionsBulk } from '@/lib/services/atlasParamSuggestionStore';
import type { StoredSuggestion } from '@/lib/services/atlasParamSuggestionTypes';

export const dynamic = 'force-dynamic';

interface BackfillItem {
  familyId?: unknown;
  paramName?: unknown;
  suggestion?: StoredSuggestion;
  cardVersion?: string | null;
  schemaVersion?: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user, error: authError } = await requireAdmin();
  if (authError) return authError;
  try {
    const body = await request.json();
    const rawItems: BackfillItem[] = Array.isArray(body?.items) ? body.items : [];
    // Cap per request to protect the endpoint; the client chunks anyway.
    const rows = rawItems
      .filter((it) => it && typeof it.paramName === 'string' && it.suggestion)
      .slice(0, 2000)
      .map((it) => ({
        familyId: typeof it.familyId === 'string' ? it.familyId : '',
        rawParamName: it.paramName as string,
        suggestion: it.suggestion as StoredSuggestion,
        cardVersion: it.cardVersion ?? null,
        schemaVersion: it.schemaVersion ?? null,
        generatedBy: user?.id ?? null,
      }));
    const upserted = await upsertParamSuggestionsBulk(rows);
    return NextResponse.json({ success: true, upserted });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
