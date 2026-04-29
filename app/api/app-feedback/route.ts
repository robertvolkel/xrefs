import { NextRequest, NextResponse } from 'next/server';
import { AppFeedbackCategory, AppFeedbackAttachment } from '@/lib/types';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

const VALID_CATEGORIES: AppFeedbackCategory[] = ['idea', 'issue', 'other'];
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_ATTACHMENTS = 5;
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024;
const BUCKET = 'app-feedback-attachments';

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    default: return 'bin';
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const form = await request.formData();
    const category = String(form.get('category') ?? '') as AppFeedbackCategory;
    const userComment = String(form.get('userComment') ?? '').trim();
    const userAgent = (form.get('userAgent') as string | null)?.slice(0, 500) ?? null;
    const viewport = (form.get('viewport') as string | null)?.slice(0, 50) ?? null;

    if (!userComment) {
      return NextResponse.json({ success: false, error: 'Comment is required' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const rawFiles = form.getAll('attachments').filter((v): v is File => v instanceof File);
    if (rawFiles.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_ATTACHMENTS} attachments allowed` },
        { status: 400 },
      );
    }
    for (const f of rawFiles) {
      if (!ALLOWED_IMAGE_MIME.has(f.type)) {
        return NextResponse.json(
          { success: false, error: `Unsupported file type: ${f.type || 'unknown'}` },
          { status: 400 },
        );
      }
      if (f.size > MAX_BYTES_PER_FILE) {
        return NextResponse.json(
          { success: false, error: `File ${f.name} exceeds 10 MB limit` },
          { status: 400 },
        );
      }
    }

    const supabase = await createClient();
    const feedbackId = crypto.randomUUID();
    const uploaded: AppFeedbackAttachment[] = [];

    for (const file of rawFiles) {
      const objectId = crypto.randomUUID();
      const path = `${user!.id}/${feedbackId}/${objectId}.${extFromMime(file.type)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false });
      if (upErr) {
        // Best-effort cleanup of any prior uploads
        if (uploaded.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploaded.map((a) => a.path));
        }
        console.error('Feedback attachment upload failed:', upErr.message);
        return NextResponse.json(
          { success: false, error: `Failed to upload attachment: ${upErr.message}` },
          { status: 500 },
        );
      }
      uploaded.push({ path, mimeType: file.type, sizeBytes: file.size });
    }

    const { data, error } = await supabase
      .from('app_feedback')
      .insert({
        id: feedbackId,
        user_id: user!.id,
        category,
        user_comment: userComment,
        user_agent: userAgent,
        viewport,
        attachments: uploaded,
      })
      .select('id')
      .single();

    if (error) {
      if (uploaded.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploaded.map((a) => a.path));
      }
      console.error('App feedback insert failed:', error.message, error.details, error.hint);
      return NextResponse.json(
        { success: false, error: `Failed to save feedback: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: { id: data.id } });
  } catch (error) {
    console.error('App feedback API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
