/**
 * Search History Logger — fire-and-forget Supabase inserts.
 * Called from client components via the browser Supabase client.
 */

import { createClient } from './supabase/client';

interface LogSearchParams {
  query: string;
  sourceMpn?: string;
  sourceManufacturer?: string;
  sourceCategory?: string;
  recommendationCount: number;
  phaseReached: string;
}

/** Log a search to the search_history table. Non-blocking. */
export function logSearch(params: LogSearchParams): void {
  const supabase = createClient();

  // Fire-and-forget — don't await
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;

    supabase
      .from('search_history')
      .insert({
        user_id: user.id,
        query: params.query,
        source_mpn: params.sourceMpn ?? null,
        source_manufacturer: params.sourceManufacturer ?? null,
        source_category: params.sourceCategory ?? null,
        recommendation_count: params.recommendationCount,
        phase_reached: params.phaseReached,
      })
      .then(); // consume the promise
  });
}
