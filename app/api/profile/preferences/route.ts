import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { UserPreferences } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', user!.id)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (data?.preferences as UserPreferences) ?? {},
    });
  } catch (error) {
    console.error('GET preferences error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const updates: Partial<UserPreferences> = await request.json();

    const supabase = await createClient();

    // Fetch existing preferences for deep merge
    const { data: existing } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', user!.id)
      .single();

    const currentPrefs = (existing?.preferences as UserPreferences) ?? {};
    const merged: UserPreferences = { ...currentPrefs, ...updates };

    // Write merged preferences + denormalized columns
    const { error } = await supabase
      .from('profiles')
      .update({
        preferences: merged,
        business_role: merged.businessRole ?? null,
        industry: merged.industry ?? null,
        company: merged.company ?? null,
      })
      .eq('id', user!.id);

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to update preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error('PUT preferences error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
