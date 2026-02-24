import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, ApplicationContext, XrefRecommendation } from '@/lib/types';
import { getRecommendations } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { logRecommendation } from '@/lib/services/recommendationLogger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { mpn } = await params;
  const decodedMpn = decodeURIComponent(mpn);

  const result = await getRecommendations(decodedMpn);

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

  return NextResponse.json({ success: true, data: result.recommendations });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  const { user, error: authError2 } = await requireAuth();
  if (authError2) return authError2;

  const { mpn } = await params;
  const decodedMpn = decodeURIComponent(mpn);
  const { overrides, applicationContext } = await request.json() as {
    overrides?: Record<string, string>;
    applicationContext?: ApplicationContext;
  };

  const result = await getRecommendations(decodedMpn, overrides, applicationContext);

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

  return NextResponse.json({ success: true, data: result.recommendations });
}
