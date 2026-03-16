import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  try {
    // Next.js request context — use cookie-based SSR client
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();

    return createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Called from a Server Component — safe to ignore
              // when middleware is refreshing sessions.
            }
          },
        },
      }
    );
  } catch {
    // Outside Next.js (MCP server, standalone scripts) — use direct client
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey;
    return createSupabaseClient(supabaseUrl, key);
  }
}
