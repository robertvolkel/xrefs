import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, PartAttributes } from '@/lib/types';
import { getAttributes } from '@/lib/services/partDataService';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
): Promise<NextResponse<ApiResponse<PartAttributes>>> {
  const { mpn } = await params;

  const attributes = await getAttributes(decodeURIComponent(mpn));
  if (!attributes) {
    return NextResponse.json({ success: false, error: 'Part not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: attributes });
}
