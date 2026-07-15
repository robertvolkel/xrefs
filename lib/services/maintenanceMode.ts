/**
 * Maintenance Mode — automatic "app is down for maintenance" switch.
 *
 * When Anthropic (Claude) credits run out, the chat routes flip a global
 * maintenance flag. Every browser polls it and shows a friendly full-screen
 * notice to regular users (admins bypass). While the flag is ON, the public
 * status route periodically re-tests Claude and clears the flag once credits
 * are back — so recovery is fully automatic, no manual switch.
 *
 * All DB access goes through the SECURITY DEFINER functions in
 * scripts/supabase-platform-settings-add-maintenance.sql, NOT direct table
 * writes: the auto-ON write runs under a regular (non-admin) user and the
 * read/recovery runs from a public/anon endpoint, and platform_settings RLS
 * would silently no-op those. See that SQL file for the rationale.
 */

import { createClient } from '@/lib/supabase/server';

const CACHE_TTL_MS = 60_000;

// Module-level cache for the flag (mirrors recommendationLogger.isQcLoggingEnabled)
let cachedMaintenance: boolean | null = null;
let cachedAt = 0;

/**
 * Is the app currently in maintenance mode? Cached for 60s.
 * Fails SAFE (returns false → app usable) if the DB is unreachable — a blip
 * must never black out the app; the poller retries in ~30s.
 */
export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cachedMaintenance !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedMaintenance;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_maintenance_status');
    if (error) throw error;
    const on = data === true;
    cachedMaintenance = on;
    cachedAt = now;
    return on;
  } catch {
    cachedMaintenance = false;
    cachedAt = now;
    return false;
  }
}

/**
 * Turn maintenance mode on/off. Writes through the definer function and
 * invalidates the local cache so the next read is fresh.
 */
export async function setMaintenanceMode(on: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_maintenance_mode', { p_on: on });
  if (error) throw error;
  invalidateMaintenanceCache();
}

/**
 * Atomically claim the once-a-minute recovery-check slot. Returns true iff
 * THIS caller won the slot and should fire the recovery ping. The throttle
 * lives in the DB WHERE clause, so it holds across serverless instances.
 * Fails safe to false (don't ping) on any error.
 */
export async function tryClaimRecoveryCheck(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('claim_maintenance_recovery_check');
    if (error) throw error;
    return data === true;
  } catch {
    return false;
  }
}

/** Clear the cache (called after a write). */
export function invalidateMaintenanceCache(): void {
  cachedMaintenance = null;
  cachedAt = 0;
}

/**
 * The safety linchpin. True ONLY for the genuine "out of credits" signature so
 * an ordinary hiccup can never black out the app:
 *   - HTTP 403 with error type `billing_error`, OR
 *   - HTTP 400/403 whose message mentions the credit balance.
 * False for 429 (rate limit), 529 (overloaded), 500, timeouts, and network
 * errors — all transient. Reads the @anthropic-ai/sdk typed error shape
 * (`.status` / `.type` / `.message`, with nested `.error` fallbacks), never a
 * bare message string.
 */
export function isOutOfCreditsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: number;
    type?: string;
    message?: string;
    error?: { type?: string; message?: string };
  };

  const status = typeof e.status === 'number' ? e.status : undefined;
  const type = e.type ?? e.error?.type;
  const message = String(e.message ?? e.error?.message ?? '').toLowerCase();
  const mentionsCredit = message.includes('credit balance');

  if (type === 'billing_error') return true;
  if ((status === 400 || status === 403) && mentionsCredit) return true;
  return false;
}

/**
 * Fire-and-forget: if `err` is the out-of-credits signature, enter maintenance
 * mode. Safe to call from any orchestrator-route catch block — it does nothing
 * for transient errors and never throws.
 */
export function maybeEnterMaintenance(err: unknown): void {
  if (!isOutOfCreditsError(err)) return;
  setMaintenanceMode(true).catch((e) =>
    console.error('Failed to enter maintenance mode:', e)
  );
}
