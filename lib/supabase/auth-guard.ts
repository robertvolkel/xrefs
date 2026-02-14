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
