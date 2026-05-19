import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { syncCanvasForUser } from '@/lib/canvas';
import { digestEmailFor, reminderEmailFor, sendEmail } from '@/lib/email';

// Vercel Cron → here, once per day. Per CLAUDE.md §6:
//
//   1. Sweeper — pick up reminders whose fire_at < now() that QStash
//      missed; send + mark sent.
//   2. Canvas import — for every user with a canvas_ics_url, fetch the
//      feed and upsert. Errors don't abort other users.
//   3. Daily digest email — for every user, send a "today's plate" mail.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`.
export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_secret_unset' }, { status: 500 });
  const authz = request.headers.get('authorization') ?? '';
  if (authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdmin(supabaseUrl, serviceKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const out: Record<string, unknown> = {
    started_at: new Date().toISOString(),
  };

  // 1) Sweeper
  out.sweeper = await runSweeper(admin, appUrl);

  // 2) Canvas import per user
  out.canvas = await runCanvasSync(admin);

  // 3) Daily digest
  out.digest = await runDailyDigest(admin, appUrl);

  out.finished_at = new Date().toISOString();
  return NextResponse.json(out);
}

async function runSweeper(
  admin: SupabaseClient,
  appUrl: string
): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const due = await admin
    .from('reminders')
    .select(
      'id, user_id, assignment_id, fire_at, assignment:assignment_id(id, title, due_at, completed_at, type, courses(code), user_prefs:user_id(email, timezone))'
    )
    .eq('status', 'scheduled')
    .lte('fire_at', nowIso);

  if (due.error) return { error: due.error.message };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  type Joined = {
    id: string;
    user_id: string;
    assignment_id: string;
    fire_at: string;
    assignment: {
      title: string;
      due_at: string;
      completed_at: string | null;
      courses: { code: string } | { code: string }[] | null;
      user_prefs: { email: string; timezone: string } | { email: string; timezone: string }[] | null;
    } | null;
  };

  for (const r of (due.data ?? []) as unknown as Joined[]) {
    const a = r.assignment;
    if (!a) {
      skipped++;
      continue;
    }
    if (a.completed_at) {
      skipped++;
      await admin.from('reminders').update({ status: 'cancelled' }).eq('id', r.id);
      continue;
    }
    const courseCode = Array.isArray(a.courses) ? a.courses[0]?.code ?? null : a.courses?.code ?? null;
    const prefs = Array.isArray(a.user_prefs) ? a.user_prefs[0] ?? null : a.user_prefs;
    if (!prefs) {
      skipped++;
      continue;
    }
    const hoursUntilDue = (new Date(a.due_at).getTime() - Date.now()) / (60 * 60 * 1000);
    const email = reminderEmailFor({
      appUrl,
      title: a.title,
      courseCode,
      dueAtIso: a.due_at,
      timezone: prefs.timezone,
      hoursUntilDue,
    });
    const res = await sendEmail({ to: prefs.email, ...email });
    if (res.ok) {
      sent++;
      await admin
        .from('reminders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', r.id);
    } else {
      failed++;
      await admin.from('reminders').update({ status: 'failed' }).eq('id', r.id);
    }
  }
  return { sent, failed, skipped, total: (due.data ?? []).length };
}

async function runCanvasSync(
  admin: SupabaseClient
): Promise<Record<string, unknown>> {
  const users = await admin
    .from('user_prefs')
    .select('user_id, canvas_ics_url')
    .not('canvas_ics_url', 'is', null);
  if (users.error) return { error: users.error.message };

  const perUser: Array<Record<string, unknown>> = [];
  for (const row of users.data ?? []) {
    if (!row.canvas_ics_url) continue;
    const r = await syncCanvasForUser(admin, row.user_id, row.canvas_ics_url);
    perUser.push({ user_id: row.user_id, ...r });
  }
  return { users: perUser.length, results: perUser };
}

async function runDailyDigest(
  admin: SupabaseClient,
  appUrl: string
): Promise<Record<string, unknown>> {
  const users = await admin
    .from('user_prefs')
    .select('user_id, email, timezone');
  if (users.error) return { error: users.error.message };

  let sent = 0;
  let skipped = 0;
  for (const u of users.data ?? []) {
    // "Today" boundaries computed in the user's tz.
    const tz = u.timezone ?? 'America/New_York';
    const now = new Date();
    const todayLabel = now.toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    // Today's items: due_at within the user's calendar day, open only.
    const startOfToday = startOfDayInZone(now, tz);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const items = await admin
      .from('assignments')
      .select('title, due_at, courses(code)')
      .eq('user_id', u.user_id)
      .is('completed_at', null)
      .gte('due_at', startOfToday.toISOString())
      .lt('due_at', startOfTomorrow.toISOString())
      .order('due_at', { ascending: true });

    type DigestRow = { title: string; due_at: string; courses: { code: string } | { code: string }[] | null };
    const todayItems = ((items.data ?? []) as unknown as DigestRow[]).map((row) => ({
      title: row.title,
      dueAtIso: row.due_at,
      courseCode: Array.isArray(row.courses) ? row.courses[0]?.code ?? null : row.courses?.code ?? null,
    }));
    if (todayItems.length === 0) {
      skipped++;
      continue;
    }
    const email = digestEmailFor({ appUrl, todayLabel, todayItems, timezone: tz });
    const res = await sendEmail({ to: u.email, ...email });
    if (res.ok && !res.skipped) sent++;
    else skipped++;
  }
  return { sent, skipped, users: (users.data ?? []).length };
}

// Returns the UTC instant corresponding to "00:00:00 today" in the given tz.
function startOfDayInZone(now: Date, tz: string): Date {
  // Use Intl to extract Y-M-D in the zone.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const ymd = fmt.format(now); // YYYY-MM-DD
  // Build a UTC midnight for that date, then offset by the zone's offset to
  // express the same calendar moment back to UTC.
  const localMidnight = new Date(`${ymd}T00:00:00Z`);
  // Compute the offset between localMidnight (interpreted as UTC) and what
  // the zone calls midnight on that date.
  const tzMidnightStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(localMidnight);
  // Parse "YYYY-MM-DD, HH:MM:SS" or similar — en-CA uses ISO-style.
  const m = tzMidnightStr.match(/(\d{4})-(\d{2})-(\d{2}),?\s*(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return localMidnight;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  // Difference between what UTC says and what zone-local says, in ms.
  const fakeAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMs = fakeAsUtc - localMidnight.getTime();
  return new Date(localMidnight.getTime() - offsetMs);
}
