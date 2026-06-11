import { createServiceClient } from '@/lib/supabase/service';
import { sendNotificationEmail } from './emailService';
import {
  isNotificationEmailEnabled,
  type NotificationType,
  type UserPreferences,
} from '@/lib/types';

/**
 * Central, source-agnostic notification pipeline. Producers call
 * createNotification()/createNotifications() to (1) drop an in-app inbox
 * row and (2) send a transactional email gated by the recipient's prefs.
 *
 * Server-only — uses the service-role client (bypasses RLS) so it can write
 * inbox rows for any recipient. NEVER import this into a client bundle.
 *
 * Designed to be called fire-and-forget from producer routes:
 *   void createNotification({ ... }).catch(() => {});
 * Email failures only log; the inbox row is always created first.
 */

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app URL to navigate to on click (e.g. /feedback/<id>). */
  link?: string;
  /** Source metadata stored alongside the row. */
  data?: Record<string, unknown>;
  /** Idempotency key — skips creation if an identical one already exists. */
  dedupeKey?: string;
  /** Email subject line; defaults to `title`. */
  emailSubject?: string;
}

interface RecipientProfile {
  id: string;
  email: string | null;
  disabled: boolean | null;
  preferences: UserPreferences | null;
}

/** Create one notification (inbox row + optional email). */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const supabase = createServiceClient();
  const data: Record<string, unknown> = {
    ...(input.data ?? {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };

  // Dedup: skip if a row with this recipient/type/dedupeKey already exists.
  if (input.dedupeKey) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('recipient_id', input.recipientId)
      .eq('type', input.type)
      .eq('data->>dedupeKey', input.dedupeKey)
      .limit(1)
      .maybeSingle();
    if (existing) return;
  }

  // 1. Insert the inbox row (always succeeds even if email later fails).
  const { data: row, error } = await supabase
    .from('notifications')
    .insert({
      recipient_id: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      data,
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('createNotification insert failed:', error?.message);
    return;
  }

  // 2. Resolve recipient email + prefs.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, disabled, preferences')
    .eq('id', input.recipientId)
    .single<RecipientProfile>();

  if (!profile?.email || profile.disabled) return;
  if (!isNotificationEmailEnabled(profile.preferences?.notificationPreferences, input.type)) {
    return;
  }

  // 3. Send + 4. stamp email_sent_at.
  const res = await sendNotificationEmail({
    to: profile.email,
    subject: input.emailSubject ?? input.title,
    title: input.title,
    body: input.body,
    link: input.link,
  });

  if (res.ok) {
    await supabase
      .from('notifications')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', row.id);
  } else {
    console.error('Notification email failed (inbox row kept):', res.error);
  }
}

/**
 * Fan-out variant: one inbox row per recipient, per-recipient email gating.
 * Bulk-inserts rows in a single statement, then resolves prefs/emails in one
 * query and sends emails in small chunks to respect Resend rate limits.
 */
export async function createNotifications(
  recipientIds: string[],
  input: Omit<CreateNotificationInput, 'recipientId'>,
): Promise<void> {
  const ids = Array.from(new Set(recipientIds)).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createServiceClient();
  const data: Record<string, unknown> = {
    ...(input.data ?? {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };

  // Dedup at the set level — drop recipients who already have this notification.
  let targetIds = ids;
  if (input.dedupeKey) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('recipient_id')
      .in('recipient_id', ids)
      .eq('type', input.type)
      .eq('data->>dedupeKey', input.dedupeKey);
    const seen = new Set((existing ?? []).map((r) => r.recipient_id as string));
    targetIds = ids.filter((id) => !seen.has(id));
    if (targetIds.length === 0) return;
  }

  // 1. Bulk insert inbox rows.
  const { data: rows, error } = await supabase
    .from('notifications')
    .insert(
      targetIds.map((recipientId) => ({
        recipient_id: recipientId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        data,
      })),
    )
    .select('id, recipient_id');

  if (error || !rows) {
    console.error('createNotifications bulk insert failed:', error?.message);
    return;
  }
  const rowIdByRecipient = new Map<string, string>(
    rows.map((r) => [r.recipient_id as string, r.id as string]),
  );

  // 2. Resolve emails + prefs for all recipients in one query.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, disabled, preferences')
    .in('id', targetIds);

  const emailable = (profiles ?? []).filter((p): p is RecipientProfile =>
    !!(p as RecipientProfile).email &&
    !(p as RecipientProfile).disabled &&
    isNotificationEmailEnabled((p as RecipientProfile).preferences?.notificationPreferences, input.type),
  );

  // 3. Send in chunks of 25; stamp email_sent_at per success.
  const CHUNK = 25;
  for (let i = 0; i < emailable.length; i += CHUNK) {
    const slice = emailable.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (p) => {
        const res = await sendNotificationEmail({
          to: p.email as string,
          subject: input.emailSubject ?? input.title,
          title: input.title,
          body: input.body,
          link: input.link,
        });
        const rowId = rowIdByRecipient.get(p.id);
        if (res.ok && rowId) {
          await supabase
            .from('notifications')
            .update({ email_sent_at: new Date().toISOString() })
            .eq('id', rowId);
        } else if (!res.ok) {
          console.error(`Notification email failed for ${p.id} (inbox row kept):`, res.error);
        }
      }),
    );
  }
}

/** Resolve the user ids of all active (non-disabled) admins. */
export async function getAdminRecipientIds(excludeUserId?: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('disabled', false);
  if (error || !data) {
    console.error('getAdminRecipientIds failed:', error?.message);
    return [];
  }
  return data
    .map((r) => r.id as string)
    .filter((id) => id !== excludeUserId);
}
