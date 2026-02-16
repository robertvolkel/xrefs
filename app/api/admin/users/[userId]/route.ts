import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { userId } = await params;
    const body = await request.json();

    // Determine what action is being performed
    if ('role' in body) {
      return handleRoleUpdate(user!.id, userId, body.role);
    }

    if ('disabled' in body) {
      return handleDisableToggle(user!.id, userId, body.disabled);
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request body — expected { role } or { disabled }' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

async function handleRoleUpdate(adminId: string, targetId: string, role: string) {
  if (role !== 'user' && role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Role must be "user" or "admin"' },
      { status: 400 },
    );
  }

  if (adminId === targetId) {
    return NextResponse.json(
      { success: false, error: 'Cannot change your own role' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', targetId);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

async function handleDisableToggle(adminId: string, targetId: string, disabled: boolean) {
  if (typeof disabled !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'disabled must be a boolean' },
      { status: 400 },
    );
  }

  if (adminId === targetId) {
    return NextResponse.json(
      { success: false, error: 'Cannot disable your own account' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ disabled, updated_at: new Date().toISOString() })
    .eq('id', targetId);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
