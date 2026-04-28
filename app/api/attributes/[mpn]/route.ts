import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, PartAttributes } from '@/lib/types';
import { getAttributes } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { runWithServiceTracking, getServiceWarnings } from '@/lib/services/serviceStatusTracker';
import { resolveManufacturerAlias } from '@/lib/services/manufacturerAliasResolver';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<PartAttributes>>> {
  return runWithServiceTracking(async () => {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { mpn } = await params;

    const attributes = await getAttributes(decodeURIComponent(mpn), undefined, user?.id);
    const warnings = getServiceWarnings();
    if (!attributes) {
      return NextResponse.json({
        success: false,
        error: 'Part not found',
        ...(warnings.length > 0 && { serviceWarnings: warnings }),
      }, { status: 404 });
    }
    // Tag source-part MFR origin (Decision #161). Resolved at response time so
    // L2-cached PartAttributes don't need a schema bump.
    let tagged = attributes;
    if (attributes.part.manufacturer && !attributes.part.mfrOrigin) {
      try {
        const alias = await resolveManufacturerAlias(attributes.part.manufacturer);
        tagged = { ...attributes, part: { ...attributes.part, mfrOrigin: alias?.source ?? 'unknown' } };
      } catch {
        // Ignore — mfrOrigin stays undefined.
      }
    }
    return NextResponse.json({
      success: true,
      data: tagged,
      ...(warnings.length > 0 && { serviceWarnings: warnings }),
    });
  }) as Promise<NextResponse<ApiResponse<PartAttributes>>>;
}
