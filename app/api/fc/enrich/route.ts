/**
 * On-demand FindChips enrichment endpoint.
 *
 * POST { mpns: string[] }
 * Returns SupplierQuotes[], LifecycleInfo, and ComplianceData for requested MPNs.
 * FC API returns data from ~80 distributors per MPN in a single call.
 * Used by the UI when opening part detail modals or for deferred enrichment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { isFindchipsConfigured, getFindchipsResultsBatch, hasFindchipsBudget } from '@/lib/services/findchipsClient';
import { mapFCToQuotes, mapFCLifecycle, mapFCCompliance } from '@/lib/services/findchipsMapper';
import type { SupplierQuote, LifecycleInfo, ComplianceData } from '@/lib/types';

interface FCEnrichResult {
  quotes: SupplierQuote[];
  lifecycle: LifecycleInfo | null;
  compliance: ComplianceData | null;
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    if (!isFindchipsConfigured()) {
      return NextResponse.json({ success: false, error: 'FindChips API not configured' }, { status: 503 });
    }

    if (!hasFindchipsBudget()) {
      return NextResponse.json({ success: false, error: 'FindChips daily API limit reached' }, { status: 429 });
    }

    const body = await request.json();
    const mpns: string[] = body.mpns;
    const chineseMpnsRaw: unknown = body.chineseMpns;

    if (!Array.isArray(mpns) || mpns.length === 0) {
      return NextResponse.json({ success: false, error: 'mpns must be a non-empty array' }, { status: 400 });
    }

    if (mpns.length > 50) {
      return NextResponse.json({ success: false, error: 'Maximum 50 MPNs per request' }, { status: 400 });
    }

    // Optional Atlas/Chinese-MFR hint from the caller — these fire FC + OEMS
    // in parallel. Non-Chinese MPNs default to FC with auto-fallback to OEMS
    // on empty/obsolete. Caller-side knowledge of `mfrOrigin === 'atlas'` lets
    // us preempt the round-trip that empty-fallback would otherwise wait for.
    const chineseMpns = Array.isArray(chineseMpnsRaw)
      ? new Set<string>((chineseMpnsRaw as unknown[]).filter((x): x is string => typeof x === 'string').map(s => s.toLowerCase()))
      : undefined;

    const fcResults = await getFindchipsResultsBatch(mpns, user?.id, chineseMpns ? { chineseMpns } : undefined);
    const results: Record<string, FCEnrichResult> = {};

    for (const [mpnLower, distResults] of fcResults) {
      results[mpnLower] = {
        quotes: mapFCToQuotes(distResults, mpnLower),
        lifecycle: mapFCLifecycle(distResults),
        compliance: mapFCCompliance(distResults),
      };
    }

    return NextResponse.json({ success: true, data: { results } });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
