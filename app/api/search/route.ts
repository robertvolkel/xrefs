import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, SearchResult } from '@/lib/types';
import { searchParts } from '@/lib/services/partDataService';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<SearchResult>>> {
  try {
    const body = await request.json();
    const query: string = body.query;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 });
    }

    const result = await searchParts(query.trim());
    return NextResponse.json({ success: true, data: result });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
