import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, ApplicationContext, XrefRecommendation } from '@/lib/types';
import { getRecommendations } from '@/lib/services/partDataService';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  const { mpn } = await params;

  const recommendations = await getRecommendations(decodeURIComponent(mpn));
  return NextResponse.json({ success: true, data: recommendations });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<XrefRecommendation[]>>> {
  const { mpn } = await params;
  const { overrides, applicationContext } = await request.json() as {
    overrides?: Record<string, string>;
    applicationContext?: ApplicationContext;
  };

  const recommendations = await getRecommendations(decodeURIComponent(mpn), overrides, applicationContext);
  return NextResponse.json({ success: true, data: recommendations });
}
