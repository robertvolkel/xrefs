import { NextRequest, NextResponse } from 'next/server';
import { searchParts } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { resolveManufacturerAlias } from '@/lib/services/manufacturerAliasResolver';

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

    const searchResult = await searchParts(mpn, undefined, user?.id, { skipFindchips: true });

    if (searchResult.type === 'none' || searchResult.matches.length === 0) {
      return NextResponse.json({ matches: [], manufacturerMismatch: false });
    }

    // Check manufacturer mismatch against top result. Alias-aware: if input and
    // the top result's manufacturer resolve to the same canonical (e.g. "GD" +
    // "GIGADEVICE 兆易创新"), suppress the warning. Falls through to the original
    // substring check when neither side has an alias hit.
    let manufacturerMismatch = false;
    if (manufacturer && searchResult.matches.length > 0) {
      const topMfrRaw = searchResult.matches[0].manufacturer ?? '';
      const topMfr = topMfrRaw.toLowerCase();
      const inputMfr = manufacturer.toLowerCase();

      const [inputMatch, topMatch] = await Promise.all([
        resolveManufacturerAlias(manufacturer),
        resolveManufacturerAlias(topMfrRaw),
      ]);
      const sameCanonical = inputMatch && topMatch && inputMatch.slug === topMatch.slug;

      manufacturerMismatch = sameCanonical
        ? false
        : !topMfr.includes(inputMfr) && !inputMfr.includes(topMfr);
    }

    return NextResponse.json({
      matches: searchResult.matches.slice(0, 10),
      manufacturerMismatch,
    });
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
