import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateManufacturerCache } from '@/lib/services/atlasClient';
import { invalidateAtlasCache } from '../route';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const { manufacturer, enabled } = body;

    if (!manufacturer || typeof manufacturer !== 'string') {
      return NextResponse.json(
        { success: false, error: 'manufacturer is required' },
        { status: 400 },
      );
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled must be a boolean' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('atlas_manufacturer_settings')
      .upsert(
        {
          manufacturer,
          enabled,
          updated_at: new Date().toISOString(),
          updated_by: user!.id,
        },
        { onConflict: 'manufacturer' },
      );

    if (error) {
      console.error('Atlas manufacturer settings upsert error:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: 'Failed to update manufacturer setting' },
        { status: 500 },
      );
    }

    invalidateManufacturerCache();
    invalidateAtlasCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Atlas manufacturer PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
