import { createClient } from '../supabase/server';
import type { BusinessRole, IndustryVertical, UserPreferences } from '../types';

// ============================================================
// LEGACY VALUE MIGRATION
// ============================================================

/** Maps old BusinessRole values to new ones */
const ROLE_MIGRATION: Record<string, BusinessRole> = {
  procurement: 'procurement_buyer',
  supply_chain: 'supply_chain_manager',
  commodity_manager: 'supply_chain_manager',
  quality: 'quality_engineer',
};

/**
 * Migrate legacy preference values to current schema.
 * - Old BusinessRole values → new values
 * - Singular industry → industries array
 * Returns the migrated prefs and whether anything changed.
 */
export function migratePreferences(
  prefs: UserPreferences,
): { migrated: UserPreferences; changed: boolean } {
  let changed = false;
  const result = { ...prefs };

  // Migrate old BusinessRole values
  if (result.businessRole && ROLE_MIGRATION[result.businessRole]) {
    result.businessRole = ROLE_MIGRATION[result.businessRole];
    changed = true;
  }

  // Normalize singular industry → industries array
  if (result.industry && !result.industries?.length) {
    result.industries = [result.industry as IndustryVertical];
    changed = true;
  }

  return { migrated: result, changed };
}

// ============================================================
// FETCH
// ============================================================

/**
 * Fetch user preferences from Supabase (server-side).
 * Returns empty object if the user has no preferences set.
 * Automatically migrates legacy values on read.
 */
export async function fetchUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();

    if (error || !data?.preferences) return {};

    const raw = data.preferences as UserPreferences;
    const { migrated, changed } = migratePreferences(raw);

    // Auto-write-back migrated values (fire-and-forget)
    if (changed) {
      supabase
        .from('profiles')
        .update({
          preferences: migrated,
          business_role: migrated.businessRole ?? null,
          industry: migrated.industries?.[0] ?? null,
        })
        .eq('id', userId)
        .then(() => {});
    }

    return migrated;
  } catch {
    // Column may not exist yet (pre-migration) — return empty
    return {};
  }
}
