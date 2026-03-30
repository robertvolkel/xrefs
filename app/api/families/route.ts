import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { logicTableRegistry, getFamilyLastUpdated } from '@/lib/logicTables';

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const category = request.nextUrl.searchParams.get('category');

    const families = Object.entries(logicTableRegistry).map(([id, table]) => ({
      familyId: id,
      familyName: table.familyName,
      category: table.category,
      description: table.description,
      ruleCount: table.rules.length,
      lastUpdated: getFamilyLastUpdated(id),
    }));

    const filtered = category
      ? families.filter(f => f.category.toLowerCase().includes(category.toLowerCase()))
      : families;

    return NextResponse.json({ success: true, data: filtered });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
