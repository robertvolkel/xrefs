import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

/** POST /api/admin/releases — create a release note (admin only) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { content } = await request.json();
    if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Content required (max 1000 chars)' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('release_notes')
      .insert({ content: content.trim(), created_by: user!.id })
      .select()
      .single();

    if (error) {
      console.error('Release note create error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create release note' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id as string,
        content: data.content as string,
        createdBy: data.created_by as string,
        createdAt: data.created_at as string,
        updatedAt: data.updated_at as string,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Release note POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
