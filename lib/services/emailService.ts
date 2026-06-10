import { Resend } from 'resend';

/**
 * Shared Resend email helpers. Factored out so the notification pipeline
 * and the release-digest cron can build consistent, brand-matched emails.
 * Server-only — never import into a client bundle.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns a Resend instance, or null when RESEND_API_KEY is not configured. */
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

/** From-address for all platform emails. */
export function getFromEmail(): string {
  return process.env.DIGEST_FROM_EMAIL || 'XRefs <notifications@xrefs.ai>';
}

/** Resolve an in-app path into an absolute URL for use in email links. */
export function toAbsoluteUrl(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://xrefs.ai';
  try {
    return new URL(link, base).toString();
  } catch {
    return undefined;
  }
}

/** Build the dark-theme notification email shell with an optional CTA button. */
export function buildNotificationEmailHtml(opts: {
  title: string;
  body?: string | null;
  link?: string | null; // already absolute
}): string {
  const bodyBlock = opts.body
    ? `<p style="margin: 0 0 20px; color: #e0e0e0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(opts.body)}</p>`
    : '';
  const ctaBlock = opts.link
    ? `<table cellpadding="0" cellspacing="0" style="margin: 4px 0;">
         <tr><td style="border-radius: 6px; background-color: #3b82f6;">
           <a href="${opts.link}" style="display: inline-block; padding: 10px 20px; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none;">Open in XRefs</a>
         </td></tr>
       </table>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #121212; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #121212; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e1e1e; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 24px 16px; text-align: center; border-bottom: 1px solid #2a2a2a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">XRefs</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 20px;">
              <h2 style="margin: 0 0 12px; color: #ffffff; font-size: 16px; font-weight: 600;">${escapeHtml(opts.title)}</h2>
              ${bodyBlock}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px; text-align: center; border-top: 1px solid #2a2a2a;">
              <p style="margin: 0; color: #666; font-size: 12px;">
                You're receiving this because of your XRefs notification settings.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a single transactional notification email. Returns a result object
 * rather than throwing so callers can keep the inbox row even on failure.
 */
export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  title: string;
  body?: string | null;
  link?: string | null; // in-app path; resolved to absolute here
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const html = buildNotificationEmailHtml({
    title: opts.title,
    body: opts.body,
    link: toAbsoluteUrl(opts.link),
  });

  const { error } = await resend.emails.send({
    from: getFromEmail(),
    to: opts.to,
    subject: opts.subject,
    html,
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}
