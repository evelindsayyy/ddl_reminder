import { NextResponse } from 'next/server';
import { createClient as createSsrClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { syncCanvasForUser } from '@/lib/canvas';

// User-triggered "Sync now" from Settings. Authed via the existing user
// session, then runs the sync against their saved Canvas URL using the
// service-role client (so the canvas helper can be reused by cron too).
export async function POST() {
  const ssr = createSsrClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const prefs = await ssr
    .from('user_prefs')
    .select('canvas_ics_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (prefs.error || !prefs.data) {
    return NextResponse.json({ error: 'prefs_not_found' }, { status: 500 });
  }
  const url = prefs.data.canvas_ics_url;
  if (!url) {
    return NextResponse.json({ error: 'no_canvas_url' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdmin(supabaseUrl, serviceKey);

  const result = await syncCanvasForUser(admin, user.id, url);
  if (result.error) {
    return NextResponse.json({ error: result.error, ...result }, { status: 502 });
  }
  return NextResponse.json(result);
}
