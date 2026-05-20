/**
 * In-memory cache for /api/admin/atlas/dictionaries/suggest responses.
 * Lives 24h per entry; keyed on `family_id + paramName`. Extracted from
 * the route file so other admin endpoints (notably the Domain Cards
 * approve flow) can invalidate it without import-cycle headaches.
 *
 * Companion client cache: `atlas-ingest-ai-suggest-v6:` localStorage in
 * GlobalUnmappedParamsTable.tsx, 7-day TTL. The client cache key
 * additionally embeds the family's domain card `updated_at` so card
 * approvals invalidate per-engineer-browser entries automatically the
 * next time the schema endpoint is consulted on Triage page load.
 */

interface SuggestCacheEntry {
  value: unknown;
  expiresAt: number;
}

const SUGGEST_CACHE = new Map<string, SuggestCacheEntry>();

export const SUGGEST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Bump when prompt or post-validation logic changes — invalidates all
 *  previously-cached suggestions so the new context (cross-family canonicals,
 *  foreign-family signatures, domain cards) and guardrails (collision
 *  detection) reach the engineer on next /suggest call. */
export const SUGGEST_CACHE_VERSION = 'v7';

export function buildSuggestCacheKey(familyId: string | null, paramName: string): string {
  return `${SUGGEST_CACHE_VERSION}::${familyId ?? ''}::${paramName}`;
}

export function getSuggestCacheEntry(key: string): SuggestCacheEntry | undefined {
  return SUGGEST_CACHE.get(key);
}

export function setSuggestCacheEntry(key: string, value: unknown, ttlMs: number = SUGGEST_CACHE_TTL_MS): void {
  SUGGEST_CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Drop every cached suggestion for the given family. RETAINED for ad-hoc
 *  use but no longer called from the card-approve PATCH (Decision: visible
 *  staleness chips superseded silent cache invalidation, so engineers see
 *  WHAT changed instead of guessing why a row reverted to "Generate"). */
export function invalidateSuggestCacheForFamily(familyId: string): number {
  if (!familyId) return 0;
  // Cache keys are `${version}::${familyId}::${paramName}` — match the
  // middle segment exactly. Avoids accidentally clearing entries for
  // families whose IDs are substrings of others (none today, but cheap
  // safety against future family IDs).
  const prefix = `${SUGGEST_CACHE_VERSION}::${familyId}::`;
  let cleared = 0;
  for (const key of SUGGEST_CACHE.keys()) {
    if (key.startsWith(prefix)) {
      SUGGEST_CACHE.delete(key);
      cleared++;
    }
  }
  return cleared;
}
