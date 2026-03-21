import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, ApplicationContext, XrefRecommendation } from '@/lib/types';
import { getRecommendations } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { logRecommendation } from '@/lib/services/recommendationLogger';
import { runWithServiceTracking, getServiceWarnings } from '@/lib/services/serviceStatusTracker';
import { fetchUserPreferences } from '@/lib/services/userPreferencesService';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  return runWithServiceTracking(async () => {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { mpn } = await params;
    const decodedMpn = decodeURIComponent(mpn);
    const prefs = await fetchUserPreferences(user!.id);

    const result = await getRecommendations(decodedMpn, undefined, undefined, undefined, undefined, prefs, user!.id);

    // QC log (awaited to ensure it completes within request lifecycle)
    await logRecommendation({
      userId: user!.id,
      sourceMpn: decodedMpn,
      sourceManufacturer: result.sourceAttributes.part.manufacturer,
      familyId: result.familyId,
      familyName: result.familyName,
      recommendationCount: result.recommendations.length,
      requestSource: 'direct',
      dataSource: result.dataSource,
      snapshot: {
        sourceAttributes: result.sourceAttributes,
        recommendations: result.recommendations,
      },
    });

    const warnings = getServiceWarnings();
    return NextResponse.json({
      success: true,
      data: result.recommendations,
      ...(warnings.length > 0 && { serviceWarnings: warnings }),
    });
  }) as Promise<NextResponse<ApiResponse<XrefRecommendation[]>>>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  return runWithServiceTracking(async () => {
    const { user, error: authError2 } = await requireAuth();
    if (authError2) return authError2;

    const { mpn } = await params;
    const decodedMpn = decodeURIComponent(mpn);
    const prefs = await fetchUserPreferences(user!.id);
    const { overrides, applicationContext } = await request.json() as {
      overrides?: Record<string, string>;
      applicationContext?: ApplicationContext;
    };

    const result = await getRecommendations(decodedMpn, overrides, applicationContext, undefined, undefined, prefs, user!.id);

    // QC log (awaited to ensure it completes within request lifecycle)
    await logRecommendation({
      userId: user!.id,
      sourceMpn: decodedMpn,
      sourceManufacturer: result.sourceAttributes.part.manufacturer,
      familyId: result.familyId,
      familyName: result.familyName,
      recommendationCount: result.recommendations.length,
      requestSource: 'direct',
      dataSource: result.dataSource,
      snapshot: {
        sourceAttributes: result.sourceAttributes,
        recommendations: result.recommendations,
        contextAnswers: applicationContext,
        attributeOverrides: overrides,
      },
    });

    const warnings = getServiceWarnings();
    return NextResponse.json({
      success: true,
      data: result.recommendations,
      ...(warnings.length > 0 && { serviceWarnings: warnings }),
    });
  }) as Promise<NextResponse<ApiResponse<XrefRecommendation[]>>>;
}
