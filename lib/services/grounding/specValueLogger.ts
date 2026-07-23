/**
 * Fire-and-forget sink for SPEC-VALUE observations (chat redesign, Phase 1 prerequisite).
 *
 * Sibling of groundingLogger (which logs would-be MPN fabrications). This logs would-be
 * spec-VALUE fabrications — value+unit tokens the assistant wrote in prose that don't trace
 * to the turn's grounded attributes. OBSERVE-ONLY: it NEVER alters the message and NEVER
 * throws into the chat path.
 *
 * Writes use the service-role client (RLS-locked table, no end-user access) and silently
 * no-op when SUPABASE_SERVICE_ROLE_KEY is absent OR the table hasn't been created yet — so
 * this ships dark and only starts measuring once scripts/supabase-spec-value-observations-schema.sql
 * has been applied. See the MPN sink for the same pattern.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  KnownSpecValue,
  detectUngroundedSpecValues,
} from './specValueDetector';
import type { GroundingObservationMeta } from './observeGrounding';

/**
 * Observe a drafted assistant message against the turn's known spec values and log what a
 * spec-value gate WOULD catch. Fire-and-forget; safe to call unconditionally before returning.
 */
export function observeAndLogSpecValues(
  message: string,
  known: ReadonlyArray<KnownSpecValue>,
  meta: GroundingObservationMeta,
): void {
  try {
    if (!message) return;
    const findings = detectUngroundedSpecValues(message, known);
    void persist(message, known.length, findings, meta);
  } catch {
    // Observe-only — never affect the response.
  }
}

async function persist(
  message: string,
  knownValueCount: number,
  findings: ReturnType<typeof detectUngroundedSpecValues>,
  meta: GroundingObservationMeta,
): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return; // logging disabled without service role
    const client = createSupabaseClient(url, key, { auth: { persistSession: false } });
    await client.from('spec_value_observations').insert({
      surface: meta.surface,
      conversation_id: meta.conversationId ?? null,
      user_id: meta.userId ?? null,
      model: meta.model ?? null,
      message_length: message.length,
      known_value_count: knownValueCount,
      finding_count: findings.length,
      high_count: findings.filter((f) => f.confidence === 'high').length,
      medium_count: findings.filter((f) => f.confidence === 'medium').length,
      findings,
    });
  } catch {
    // Swallow — measurement must never break chat (also no-ops if the table is absent).
  }
}
