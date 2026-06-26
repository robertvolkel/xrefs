/**
 * Fire-and-forget sink for grounding observations (docs/mpn-grounding-gate-plan.md,
 * step 3). The orchestrators call observeAndLogGrounding() right before returning their
 * reply: it measures what a gate WOULD catch and writes a row to
 * mpn_grounding_observations. It NEVER alters the message and NEVER throws into the
 * chat path — observe-only, zero customer impact.
 *
 * Writes use the service-role client because the table is RLS-locked (no end-user
 * access). Logging silently no-ops when SUPABASE_SERVICE_ROLE_KEY is absent.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  ChatGroundingContext,
  GroundingObservation,
  GroundingObservationMeta,
  buildVerifiedSetFromContext,
  observeMessage,
} from './observeGrounding';

// MPN-ish token: leading alphanumeric + ≥3 more (so length ≥ 4), allowing internal
// . / , - separators. Filtered to tokens carrying both a letter and a digit.
const USER_MPN_TOKEN = /[A-Za-z0-9][A-Za-z0-9./,-]{3,}/g;

/**
 * Pull MPN-ish tokens from the USER's own messages so the assistant echoing a part the
 * user themselves named is never counted as a fabrication (treated as "mentionable").
 */
export function extractUserMpnCandidates(
  messages: ReadonlyArray<{ role: string; content: unknown }>,
): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user' || typeof m.content !== 'string') continue;
    for (const t of m.content.match(USER_MPN_TOKEN) ?? []) {
      if (/[a-z]/i.test(t) && /[0-9]/.test(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Observe a drafted assistant message against the turn's catalog context and log what
 * a gate would catch. Fire-and-forget; safe to call unconditionally before returning.
 */
export function observeAndLogGrounding(
  message: string,
  ctx: ChatGroundingContext,
  meta: GroundingObservationMeta,
): void {
  try {
    if (!message) return;
    const verifiedSet = buildVerifiedSetFromContext(ctx);
    const observation = observeMessage(message, verifiedSet, meta);
    void persistObservation(observation);
  } catch {
    // Observe-only — never affect the response.
  }
}

async function persistObservation(obs: GroundingObservation): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return; // logging disabled without service role
    const client = createSupabaseClient(url, key, { auth: { persistSession: false } });
    await client.from('mpn_grounding_observations').insert({
      surface: obs.surface,
      conversation_id: obs.conversationId ?? null,
      user_id: obs.userId ?? null,
      model: obs.model ?? null,
      message_length: obs.messageLength,
      verified_mpn_count: obs.verifiedMpnCount,
      finding_count: obs.findingCount,
      high_count: obs.highCount,
      medium_count: obs.mediumCount,
      findings: obs.findings,
    });
  } catch {
    // Swallow — measurement must never break chat.
  }
}
