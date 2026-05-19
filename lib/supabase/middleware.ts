import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Supabase env vars missing in middleware.');
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: this call refreshes the session and MUST run between
  // createServerClient and returning the response, or the session will go stale.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname === '/manifest.json' ||
    pathname === '/icon' ||
    pathname === '/icon.svg' ||
    pathname === '/apple-icon' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api/ics') || // public outbound calendar feed
    pathname.startsWith('/api/sync/gradescope') || // public CORS endpoint, token-authed
    pathname.startsWith('/api/cron'); // bearer-authed by CRON_SECRET
  // API routes return their own 401 JSON — don't redirect them.
  const isApiRoute = pathname.startsWith('/api');

  // Unauthenticated users hitting app routes → bounce to /login.
  if (!user && !isAuthRoute && !isPublicAsset && !isApiRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users hitting /login → send to dashboard.
  if (user && pathname.startsWith('/login')) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = '/';
    return NextResponse.redirect(dashUrl);
  }

  return response;
}
