import { createClient } from '../supabase/server';
import { UserPreferences } from '../types';

/**
 * Fetch user preferences from Supabase (server-side).
 * Returns empty object if the user has no preferences set.
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
    return data.preferences as UserPreferences;
  } catch {
    // Column may not exist yet (pre-migration) — return empty
    return {};
  }
}
