import { NextRequest, NextResponse } from 'next/server';
import { QcFeedbackSubmission } from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body: QcFeedbackSubmission = await request.json();

    if (!body.userComment?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Comment is required' },
        { status: 400 },
      );
    }
    if (!body.sourceMpn) {
      return NextResponse.json(
        { success: false, error: 'Source MPN is required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Auto-resolve log_id: find the most recent recommendation_log for this user + MPN
    let logId: string | null = null;
    const { data: logRow } = await supabase
      .from('recommendation_log')
      .select('id')
      .eq('user_id', user!.id)
      .eq('source_mpn', body.sourceMpn)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (logRow) {
      logId = logRow.id;
    }

    const { data, error } = await supabase
      .from('qc_feedback')
      .insert({
        log_id: logId,
        user_id: user!.id,
        feedback_stage: body.feedbackStage,
        source_mpn: body.sourceMpn,
        replacement_mpn: body.replacementMpn ?? null,
        rule_attribute_id: body.ruleAttributeId ?? null,
        rule_attribute_name: body.ruleAttributeName ?? null,
        rule_result: body.ruleResult ?? null,
        source_value: body.sourceValue ?? null,
        replacement_value: body.replacementValue ?? null,
        rule_note: body.ruleNote ?? null,
        question_id: body.questionId ?? null,
        question_text: body.questionText ?? null,
        user_comment: body.userComment.trim(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Feedback insert failed:', error.message, error.details, error.hint);
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
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
