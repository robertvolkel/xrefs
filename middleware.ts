import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_ROUTES = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  // Guard: if Supabase env vars are missing, pass through.
  // NEXT_PUBLIC_ vars are inlined at build time — if the Vercel build
  // ran without them they'll be undefined at runtime.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  try {
    const { user, disabled, supabaseResponse } = await updateSession(request);
    const { pathname } = request.nextUrl;

    // Allow public routes
    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
      // Logged-in users visiting auth pages → redirect home
      if (user && !disabled) {
        return NextResponse.redirect(new URL('/', request.url));
      }
      return supabaseResponse;
    }

    // Allow API auth route (register endpoint)
    if (pathname.startsWith('/api/auth')) {
      return supabaseResponse;
    }

    // Everything else requires authentication
    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Block disabled users — redirect to login with disabled flag
    if (disabled) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('disabled', '1');
      return NextResponse.redirect(redirectUrl);
    }

    return supabaseResponse;
  } catch {
    // If Supabase middleware throws (e.g., invalid URL/key), pass through
    // rather than crashing with 500
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
