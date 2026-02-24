import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { RecommendationLogEntry, QcFeedbackRecord } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { logId } = await params;
    const supabase = await createClient();

    // Fetch log entry (no FK join — FK points to auth.users, not profiles)
    const { data: row, error } = await supabase
      .from('recommendation_log')
      .select('*')
      .eq('id', logId)
      .single();

    if (error || !row) {
      return NextResponse.json(
        { success: false, error: 'Log entry not found' },
        { status: 404 },
      );
    }

    // Fetch profile for the log entry user
    const { data: logProfile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', row.user_id)
      .single();

    const log: RecommendationLogEntry = {
      id: row.id,
      userId: row.user_id,
      sourceMpn: row.source_mpn,
      sourceManufacturer: row.source_manufacturer,
      familyId: row.family_id,
      familyName: row.family_name,
      recommendationCount: row.recommendation_count,
      requestSource: row.request_source,
      dataSource: row.data_source,
      snapshot: row.snapshot,
      createdAt: row.created_at,
      userEmail: logProfile?.email,
      userName: logProfile?.full_name,
    };

    // Fetch all feedback for this log entry (no FK join)
    const { data: fbRows } = await supabase
      .from('qc_feedback')
      .select('*')
      .eq('log_id', logId)
      .order('created_at', { ascending: false });

    // Fetch profiles for feedback users
    const fbUserIds = [...new Set((fbRows ?? []).map((fb: Record<string, unknown>) => fb.user_id as string))];
    const fbProfileMap = new Map<string, { email?: string; full_name?: string }>();

    if (fbUserIds.length > 0) {
      const { data: fbProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', fbUserIds);

      if (fbProfiles) {
        for (const p of fbProfiles) {
          fbProfileMap.set(p.id as string, { email: p.email, full_name: p.full_name });
        }
      }
    }

    const feedback: QcFeedbackRecord[] = (fbRows ?? []).map((fb: Record<string, unknown>) => {
      const fbProfile = fbProfileMap.get(fb.user_id as string);
      return {
        id: fb.id as string,
        logId: fb.log_id as string | undefined,
        userId: fb.user_id as string,
        feedbackStage: fb.feedback_stage as QcFeedbackRecord['feedbackStage'],
        status: fb.status as QcFeedbackRecord['status'],
        sourceMpn: fb.source_mpn as string,
        sourceManufacturer: fb.source_manufacturer as string | undefined,
        replacementMpn: fb.replacement_mpn as string | undefined,
        ruleAttributeId: fb.rule_attribute_id as string | undefined,
        ruleAttributeName: fb.rule_attribute_name as string | undefined,
        ruleResult: fb.rule_result as string | undefined,
        sourceValue: fb.source_value as string | undefined,
        replacementValue: fb.replacement_value as string | undefined,
        ruleNote: fb.rule_note as string | undefined,
        questionId: fb.question_id as string | undefined,
        questionText: fb.question_text as string | undefined,
        userComment: fb.user_comment as string,
        adminNotes: fb.admin_notes as string | undefined,
        resolvedBy: fb.resolved_by as string | undefined,
        resolvedAt: fb.resolved_at as string | undefined,
        createdAt: fb.created_at as string,
        updatedAt: fb.updated_at as string,
        userEmail: fbProfile?.email,
        userName: fbProfile?.full_name,
      };
    });

    return NextResponse.json({
      success: true,
      data: { log, feedback },
    });
  } catch (error) {
    console.error('QC log detail error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
