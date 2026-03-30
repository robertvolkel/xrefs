import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import {
  getCacheStats,
  invalidateCache,
  purgeExpired,
  type CacheService,
  type CacheTier,
} from '@/lib/services/partDataCache';

/** GET /api/admin/cache — Cache statistics */
export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const stats = await getCacheStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[admin/cache] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch cache stats' }, { status: 500 });
  }
}

/** DELETE /api/admin/cache — Purge cache entries
 *
 * Query params:
 *   service   — 'digikey' | 'partsio' | 'mouser'
 *   mpn       — specific MPN to invalidate
 *   tier      — 'parametric' | 'lifecycle' | 'commercial'
 *   expired   — 'true' to purge only expired entries
 */
export async function DELETE(req: NextRequest) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = req.nextUrl;
    const service = searchParams.get('service') as CacheService | null;
    const mpn = searchParams.get('mpn');
    const tier = searchParams.get('tier') as CacheTier | null;
    const expiredOnly = searchParams.get('expired') === 'true';

    let deleted: number;

    if (expiredOnly) {
      deleted = await purgeExpired();
    } else {
      deleted = await invalidateCache({
        service: service ?? undefined,
        mpn: mpn ?? undefined,
        tier: tier ?? undefined,
      });
    }

    return NextResponse.json({ deleted });
  } catch (err) {
    console.error('[admin/cache] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to purge cache' }, { status: 500 });
  }
}
