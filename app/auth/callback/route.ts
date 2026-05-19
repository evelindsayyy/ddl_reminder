import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Magic-link clicks land here. Exchange the `code` for a session cookie,
// then redirect the user to `next` (or `/`).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const msg = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
