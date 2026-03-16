import { createClient } from './server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { User } from '@supabase/supabase-js';

/** Fixed service user returned for valid API key auth */
const API_KEY_SERVICE_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '',
} as User;

/**
 * Check for API key in Authorization header.
 * Accepts: Authorization: Bearer <key>
 * Valid keys are set in XREFS_API_KEYS env var (comma-separated).
 */
async function checkApiKey(): Promise<User | null> {
  const apiKeysRaw = process.env.XREFS_API_KEYS;
  if (!apiKeysRaw) return null;

  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const validKeys = apiKeysRaw.split(',').map(k => k.trim()).filter(Boolean);

  if (validKeys.includes(token)) {
    return API_KEY_SERVICE_USER;
  }

  return null;
}

export async function requireAuth() {
  // Check API key first (for external/sister product access)
  const apiKeyUser = await checkApiKey();
  if (apiKeyUser) {
    return { user: apiKeyUser, error: null };
  }

  // Fall back to Supabase session cookie auth
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

  // API key users are not admin — admin routes require Supabase session
  if (user?.id === API_KEY_SERVICE_USER.id) {
    return {
      user,
      error: NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      ),
    };
  }

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
