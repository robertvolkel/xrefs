import { NextRequest, NextResponse } from 'next/server';
import { AppFeedbackSubmission, AppFeedbackCategory } from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

const VALID_CATEGORIES: AppFeedbackCategory[] = ['idea', 'issue', 'other'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body: AppFeedbackSubmission = await request.json();

    if (!body.userComment?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Comment is required' },
        { status: 400 },
      );
    }
    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { success: false, error: 'Invalid category' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('app_feedback')
      .insert({
        user_id: user!.id,
        category: body.category,
        user_comment: body.userComment.trim(),
        user_agent: body.userAgent?.slice(0, 500) ?? null,
        viewport: body.viewport?.slice(0, 50) ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('App feedback insert failed:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: `Failed to save feedback: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { id: data.id },
    });
  } catch (error) {
    console.error('App feedback API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
