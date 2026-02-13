import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, ApplicationContext, XrefRecommendation } from '@/lib/types';
import { getRecommendations } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { mpn } = await params;

  const recommendations = await getRecommendations(decodeURIComponent(mpn));
  return NextResponse.json({ success: true, data: recommendations });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  const { error: authError2 } = await requireAuth();
  if (authError2) return authError2;

  const { mpn } = await params;
  const { overrides, applicationContext } = await request.json() as {
    overrides?: Record<string, string>;
    applicationContext?: ApplicationContext;
  };

  const recommendations = await getRecommendations(decodeURIComponent(mpn), overrides, applicationContext);
  return NextResponse.json({ success: true, data: recommendations });
}
