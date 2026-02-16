import { createClient } from './server';
import { NextResponse } from 'next/server';

export async function requireAuth() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        error: NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        ),
      };
    }

    return { user, error: null };
  } catch {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: 'Auth service unavailable' },
        { status: 503 }
      ),
    };
  }
}

export async function requireAdmin() {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };

  try {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user!.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return {
        user,
        error: NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        ),
      };
    }

    return { user, error: null };
  } catch {
    return {
      user,
      error: NextResponse.json(
        { success: false, error: 'Could not verify admin role' },
        { status: 503 }
      ),
    };
  }
}
