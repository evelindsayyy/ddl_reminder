import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { buildIcs } from '@/lib/ics';

interface RouteContext {
  params: { token: string };
}

// Public endpoint. Apple Calendar can't send cookies, so the URL token
// IS the auth. We use the service-role client because we have NO user
// session here — token → user_id is the only mapping.
export async function GET(_: NextRequest, { params }: RouteContext) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  if (!url || !serviceKey) {
    return new NextResponse('server misconfigured', { status: 500 });
  }

  // Service role bypasses RLS — required to look up the row by token alone.
  const admin = createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const prefs = await admin
    .from('user_prefs')
    .select('user_id, email, timezone, ics_token')
    .eq('ics_token', params.token)
    .maybeSingle();

  if (prefs.error || !prefs.data) {
    // Don't leak whether the token is malformed vs not-found.
    return new NextResponse('not found', { status: 404 });
  }

  const userId = prefs.data.user_id;
  const timezone = prefs.data.timezone ?? 'America/New_York';

  const [assignmentsRes, applicationsRes] = await Promise.all([
    admin
      .from('assignments')
      .select(
        'id, title, type, due_at, completed_at, notes, external_url, courses(code)'
      )
      .eq('user_id', userId)
      .is('completed_at', null) // only open items in the calendar
      .order('due_at', { ascending: true }),
    admin
      .from('applications')
      .select('id, company, role, stage, next_action, next_action_at')
      .eq('user_id', userId)
      .not('next_action_at', 'is', null)
      .order('next_action_at', { ascending: true }),
  ]);

  if (assignmentsRes.error || applicationsRes.error) {
    return new NextResponse('internal error', { status: 500 });
  }

  type SupabaseAssignment = {
    id: string;
    title: string;
    type: string;
    due_at: string;
    completed_at: string | null;
    notes: string | null;
    external_url: string | null;
    courses: { code: string } | null | { code: string }[];
  };

  const assignments = (assignmentsRes.data ?? []).map((a) => {
    const row = a as SupabaseAssignment;
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      due_at: row.due_at,
      completed_at: row.completed_at,
      notes: row.notes,
      external_url: row.external_url,
      courses: Array.isArray(row.courses) ? row.courses[0] ?? null : row.courses,
    };
  });

  const ics = buildIcs({
    calendarName: 'Deadlines',
    appUrl,
    timezone,
    assignments,
    applications: applicationsRes.data ?? [],
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="deadlines.ics"',
      // Cache for 15 min — Apple Calendar polls hourly anyway.
      'Cache-Control': 'private, max-age=900',
    },
  });
}
