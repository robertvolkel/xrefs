import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/service';

const resend = new Resend(process.env.RESEND_API_KEY);

interface DigestNote {
  id: string;
  content: string;
  created_at: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDigestHtml(notes: DigestNote[]): string {
  const noteItems = notes
    .map((n) => {
      const date = new Date(n.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #2a2a2a;">
          <p style="margin: 0 0 4px; color: #888; font-size: 12px;">${date}</p>
          <p style="margin: 0; color: #e0e0e0; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(n.content)}</p>
        </td>
      </tr>`;
    })
    .join('');

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
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">XRefs Updates</h1>
            </td>
          </tr>
          ${noteItems}
          <tr>
            <td style="padding: 16px; text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">
                You're receiving this because you have an active XRefs account.
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

async function handleDigest(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const supabase = createServiceClient();

    // 2. Get last digest timestamp
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('last_digest_sent_at')
      .eq('id', 'global')
      .single();

    const lastSentAt = settings?.last_digest_sent_at ?? '1970-01-01T00:00:00Z';

    // 3. Fetch new release notes since last digest
    const { data: notes, error: notesError } = await supabase
      .from('release_notes')
      .select('id, content, created_at')
      .gt('created_at', lastSentAt)
      .order('created_at', { ascending: true });

    if (notesError) {
      console.error('Failed to fetch release notes:', notesError.message);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 },
      );
    }

    if (!notes || notes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new release notes since last digest',
        sent: 0,
      });
    }

    // 4. Fetch all active user emails
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('email')
      .eq('disabled', false);

    if (usersError) {
      console.error('Failed to fetch users:', usersError.message);
      return NextResponse.json(
        { success: false, error: 'Database error' },
        { status: 500 },
      );
    }

    const emails = (users ?? []).map((u) => u.email).filter(Boolean) as string[];

    if (emails.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active users to email',
        sent: 0,
      });
    }

    // 5. Build and send email
    const html = buildDigestHtml(notes);
    const fromEmail =
      process.env.DIGEST_FROM_EMAIL || 'XRefs <notifications@xrefs.app>';
    const subject = `XRefs — ${notes.length} new update${notes.length > 1 ? 's' : ''}`;

    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: fromEmail,
      bcc: emails,
      subject,
      html,
    });

    if (sendError) {
      console.error('Resend error:', sendError);
      return NextResponse.json(
        { success: false, error: 'Email send failed', detail: sendError.message },
        { status: 500 },
      );
    }

    // 6. Update last_digest_sent_at
    const { error: updateError } = await supabase
      .from('platform_settings')
      .update({ last_digest_sent_at: new Date().toISOString() })
      .eq('id', 'global');

    if (updateError) {
      // Email already sent — log but don't fail. Next run may re-send (acceptable).
      console.error('Failed to update last_digest_sent_at:', updateError.message);
    }

    console.log(
      `Release digest sent to ${emails.length} users (${notes.length} notes)`,
    );

    return NextResponse.json({
      success: true,
      sent: emails.length,
      notes: notes.length,
    });
  } catch (err) {
    console.error('Release digest cron error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// POST for external cron services
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleDigest(request);
}

// GET for Vercel Crons compatibility
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleDigest(request);
}
