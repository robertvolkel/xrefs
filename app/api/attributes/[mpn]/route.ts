import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, PartAttributes } from '@/lib/types';
import { getAttributes } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { runWithServiceTracking, getServiceWarnings } from '@/lib/services/serviceStatusTracker';
import { resolveManufacturerAlias } from '@/lib/services/manufacturerAliasResolver';
import { classifyQualificationDomain, upgradeFromAttributes } from '@/lib/services/qualificationDomain';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<PartAttributes>>> {
  return runWithServiceTracking(async () => {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { mpn } = await params;

    // When the user click came from a search-result card, the PartSummary's
    // dataSource + manufacturer travel along as query params. This stops the
    // Digikey prefix-match fallback from silently shadowing the actual Atlas
    // row the user clicked (e.g. Galaxy 1.5KE100 → Littelfuse 1.5KE100A).
    const sourceParam = request.nextUrl.searchParams.get('source');
    const manufacturerParam = request.nextUrl.searchParams.get('manufacturer') || undefined;
    const preferredSource = sourceParam === 'digikey' || sourceParam === 'atlas' || sourceParam === 'partsio'
      ? sourceParam
      : undefined;

    // Next.js App Router already URL-decodes route params. A second
    // decodeURIComponent here throws on MPNs containing a literal '%' (e.g.
    // tolerance-encoded "1%" crosses like CDP060310K1%100PPM/KNP20) and
    // corrupts valid-looking sequences (%10 -> control char), so we pass mpn
    // through as-is.
    const attributes = await getAttributes(mpn, undefined, user?.id, {
      preferredSource,
      manufacturer: manufacturerParam,
    });
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
    // Tag qualification domain so the source panel can render the AEC chip +
    // Grade row even when the user hasn't requested cross-references yet.
    // Same approach as Decision #161: response-time resolution, no cache bump.
    if (!tagged.part.qualificationDomain) {
      const q200 = tagged.parameters.find(p => p.parameterId === 'aec_q200')?.value;
      const q101 = tagged.parameters.find(p => p.parameterId === 'aec_q101')?.value;
      const q100 = tagged.parameters.find(p => p.parameterId === 'aec_q100')?.value;
      const classification = upgradeFromAttributes(
        classifyQualificationDomain(tagged.part),
        q200, q101, q100,
        tagged.part.qualifications,
      );
      tagged = { ...tagged, part: { ...tagged.part, qualificationDomain: classification } };
    }
    return NextResponse.json({
      success: true,
      data: tagged,
      ...(warnings.length > 0 && { serviceWarnings: warnings }),
    });
  }) as Promise<NextResponse<ApiResponse<PartAttributes>>>;
}
