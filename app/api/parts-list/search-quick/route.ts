import { NextRequest, NextResponse } from 'next/server';
import { searchParts } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';

/**
 * Quick search endpoint for the Add Part dialog.
 * Runs searchParts() only — no attributes, no recommendations.
 * Returns matches + whether the provided manufacturer mismatches the top result.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const mpn = (body.mpn ?? '').trim();
    const manufacturer = (body.manufacturer ?? '').trim();

    if (!mpn) {
      return NextResponse.json({ error: 'MPN is required' }, { status: 400 });
    }

    const searchResult = await searchParts(mpn, undefined, user?.id, { skipMouser: true });

    if (searchResult.type === 'none' || searchResult.matches.length === 0) {
      return NextResponse.json({ matches: [], manufacturerMismatch: false });
    }

    // Check manufacturer mismatch against top result
    let manufacturerMismatch = false;
    if (manufacturer && searchResult.matches.length > 0) {
      const topMfr = (searchResult.matches[0].manufacturer ?? '').toLowerCase();
      const inputMfr = manufacturer.toLowerCase();
      // Match if input is a substring of resolved or vice versa
      manufacturerMismatch = !topMfr.includes(inputMfr) && !inputMfr.includes(topMfr);
    }

    return NextResponse.json({
      matches: searchResult.matches.slice(0, 10),
      manufacturerMismatch,
    });
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
