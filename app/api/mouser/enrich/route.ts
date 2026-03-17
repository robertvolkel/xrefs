/**
 * On-demand Mouser enrichment endpoint.
 *
 * POST { mpns: string[] }
 * Returns Mouser SupplierQuotes, LifecycleInfo, and ComplianceData for requested MPNs.
 * Used by the UI when opening part detail modals or comparison views.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { isMouserConfigured, getMouserProductsBatch, hasMouserBudget } from '@/lib/services/mouserClient';
import { mapMouserToQuote, mapMouserLifecycle, mapMouserCompliance } from '@/lib/services/mouserMapper';
import type { SupplierQuote, LifecycleInfo, ComplianceData } from '@/lib/types';

interface MouserEnrichResult {
  quote: SupplierQuote;
  lifecycle: LifecycleInfo | null;
  compliance: ComplianceData | null;
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    if (!isMouserConfigured()) {
      return NextResponse.json({ error: 'Mouser API not configured' }, { status: 503 });
    }

    if (!hasMouserBudget()) {
      return NextResponse.json({ error: 'Mouser daily API limit reached' }, { status: 429 });
    }

    const body = await request.json();
    const mpns: string[] = body.mpns;

    if (!Array.isArray(mpns) || mpns.length === 0) {
      return NextResponse.json({ error: 'mpns must be a non-empty array' }, { status: 400 });
    }

    if (mpns.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 MPNs per request' }, { status: 400 });
    }

    const products = await getMouserProductsBatch(mpns);
    const results: Record<string, MouserEnrichResult> = {};

    for (const [mpnLower, product] of products) {
      results[mpnLower] = {
        quote: mapMouserToQuote(product),
        lifecycle: mapMouserLifecycle(product),
        compliance: mapMouserCompliance(product),
      };
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
