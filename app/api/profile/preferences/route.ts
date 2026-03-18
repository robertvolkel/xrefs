import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { UserPreferences } from '@/lib/types';
import { migratePreferences } from '@/lib/services/userPreferencesService';
import { extractProfileFields } from '@/lib/services/profileExtractor';

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

    const raw = (data?.preferences as UserPreferences) ?? {};
    const { migrated, changed } = migratePreferences(raw);

    // Auto-write-back migrated values
    if (changed) {
      await supabase
        .from('profiles')
        .update({
          preferences: migrated,
          business_role: migrated.businessRole ?? null,
          industry: migrated.industries?.[0] ?? migrated.industry ?? null,
        })
        .eq('id', user!.id);
    }

    return NextResponse.json({
      success: true,
      data: migrated,
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
    let merged: UserPreferences = { ...currentPrefs, ...updates };

    // If profilePrompt changed, extract structured fields via LLM
    if (
      updates.profilePrompt !== undefined &&
      updates.profilePrompt !== currentPrefs.profilePrompt
    ) {
      const extracted = await extractProfileFields(updates.profilePrompt);
      merged = { ...merged, ...extracted };
    }

    // Write merged preferences + denormalized columns
    const { error } = await supabase
      .from('profiles')
      .update({
        preferences: merged,
        business_role: merged.businessRole ?? null,
        industry: merged.industries?.[0] ?? merged.industry ?? null,
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
