import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { getContextQuestionsForFamily } from '@/lib/contextQuestions';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> }
) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const { familyId } = await params;
    const config = getContextQuestionsForFamily(familyId);

    if (!config) {
      return NextResponse.json(
        { success: false, error: `No context questions found for family ID: ${familyId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
