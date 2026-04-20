import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { syncSingleProfile } from '@/lib/services/atlasProfileSync';
import { invalidateManufacturersListCache } from '../../route';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const supabase = await createClient();

    // Look up atlas_id from slug
    const { data: mfr, error: mfrErr } = await supabase
      .from('atlas_manufacturers')
      .select('atlas_id, name_display')
      .eq('slug', slug)
      .single();

    if (mfrErr || !mfr?.atlas_id) {
      return NextResponse.json(
        { error: 'Manufacturer not found or has no atlas_id' },
        { status: 404 },
      );
    }

    const result = await syncSingleProfile(mfr.atlas_id);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 },
      );
    }

    // Invalidate list cache so updated profile data shows
    invalidateManufacturersListCache();

    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/admin/manufacturers/[slug]/sync error:', err);
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
