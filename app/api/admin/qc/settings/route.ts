import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { invalidateLoggingCache } from '@/lib/services/recommendationLogger';

export async function GET(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const supabase = await createClient();
    const { data } = await supabase
      .from('platform_settings')
      .select('qc_logging_enabled')
      .eq('id', 'global')
      .single();

    return NextResponse.json({
      success: true,
      data: { qcLoggingEnabled: data?.qc_logging_enabled ?? false },
    });
  } catch (error) {
    console.error('QC settings GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const { qcLoggingEnabled } = body;

    if (typeof qcLoggingEnabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'qcLoggingEnabled must be a boolean' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('platform_settings')
      .update({
        qc_logging_enabled: qcLoggingEnabled,
        updated_at: new Date().toISOString(),
        updated_by: user!.id,
      })
      .eq('id', 'global');

    if (error) {
      console.error('QC settings update failed:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to update settings' },
        { status: 500 },
      );
    }

    // Invalidate the server-side cache so the logger picks up the change immediately
    invalidateLoggingCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('QC settings PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
