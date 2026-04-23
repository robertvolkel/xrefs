/**
 * Batch canonicalization endpoint for client-side BOM dedup.
 * Accepts an array of raw manufacturer strings, returns parallel results
 * (canonical name or null). Used by usePartsListState before findDuplicateGroups.
 *
 * Batch, not per-name: 1 round trip per BOM upload instead of N.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { resolveManufacturerAlias } from '@/lib/services/manufacturerAliasResolver';

const MAX_NAMES = 5000;

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const names = body?.names;
    if (!Array.isArray(names)) {
      return NextResponse.json({ error: 'names must be an array of strings' }, { status: 400 });
    }
    if (names.length > MAX_NAMES) {
      return NextResponse.json({ error: `names exceeds max ${MAX_NAMES}` }, { status: 400 });
    }

    const results = await Promise.all(
      (names as unknown[]).map(async (raw) => {
        if (typeof raw !== 'string' || !raw.trim()) return { input: raw, canonical: null, slug: null };
        const match = await resolveManufacturerAlias(raw);
        return {
          input: raw,
          canonical: match?.canonical ?? null,
          slug: match?.slug ?? null,
        };
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error('POST /api/manufacturer-aliases/canonicalize error:', err);
    return NextResponse.json({ error: 'Canonicalization failed' }, { status: 500 });
  }
}
