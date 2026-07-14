import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  isMaintenanceMode,
  tryClaimRecoveryCheck,
  setMaintenanceMode,
  isOutOfCreditsError,
} from '@/lib/services/maintenanceMode';

/**
 * GET /api/maintenance/status — public (no auth).
 *
 * Returns `{ maintenance: boolean }`. Every browser polls this; the login
 * screen reads it before sign-in, so it must be callable while anonymous. It
 * exposes only a boolean, so there is nothing sensitive to gate.
 *
 * When maintenance is ON, this route also drives AUTOMATIC RECOVERY: whichever
 * request wins the once-a-minute throttle slot fires a tiny Claude "ping". If
 * the ping succeeds, credits are back → maintenance is cleared. This is what
 * lets the app self-heal with no manual switch.
 */
export async function GET(): Promise<NextResponse> {
  let maintenance = await isMaintenanceMode();

  if (maintenance) {
    // Only the caller that wins the ~60s slot performs the (cheap) recovery
    // ping, so we never hammer the API regardless of how many browsers poll.
    const shouldCheck = await tryClaimRecoveryCheck();
    if (shouldCheck) {
      const cleared = await runRecoveryPing();
      if (cleared) maintenance = false;
    }
  }

  return NextResponse.json({ maintenance });
}

/**
 * Send a minimal request to Claude to see whether credits are back.
 * Uses the app's OWN model (not a hardcoded one) so a model the key can't
 * access never blocks recovery. Returns true iff it cleared maintenance.
 */
async function runRecoveryPing(): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return false; // no key → can't recover here; stay in maintenance

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    // Success → credits are back.
    await setMaintenanceMode(false);
    return true;
  } catch (err) {
    if (isOutOfCreditsError(err)) {
      // Still out of credits — stay in maintenance, try again next slot.
      return false;
    }
    // Any other error (rate limit, transient, network) — don't clear, don't
    // panic; the next slot will retry.
    console.error('Maintenance recovery ping failed (non-credit error):', err);
    return false;
  }
}
