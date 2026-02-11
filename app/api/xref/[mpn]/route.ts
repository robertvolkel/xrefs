import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, XrefRecommendation } from '@/lib/types';
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
  const { overrides } = await request.json() as { overrides?: Record<string, string> };

  const recommendations = await getRecommendations(decodeURIComponent(mpn), overrides);
  return NextResponse.json({ success: true, data: recommendations });
}
