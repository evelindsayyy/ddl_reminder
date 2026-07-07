import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { syncCanvasForUser } from '@/lib/canvas';
import {
  applicationReminderEmailFor,
  digestEmailFor,
  reminderEmailFor,
  sendEmail,
} from '@/lib/email';
import { startOfDayInZone } from '@/lib/datetime';
import { scheduleAssignmentReminders } from '@/lib/reminders';

const DEFAULT_OFFSETS = [168, 48, 12];

// Constant-time string compare. Hashing both sides to a fixed 32-byte digest
// first keeps the compared buffers equal-length (timingSafeEqual throws on a
// length mismatch and the mismatch itself would leak length).
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

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
  if (!timingSafeEqualStr(authz, `Bearer ${secret}`)) {
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

  // 2b) Backfill — open future assignments with no reminder rows at all
  //     (e.g. Canvas/Gradescope imports, which insert rows directly and never
  //     call the scheduler). Runs after the Canvas import so rows created this
  //     run get scheduled the same day. Per CLAUDE.md §6 layer 2.
  out.backfill = await runReminderBackfill(admin, appUrl);

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
      'id, user_id, assignment_id, application_id, fire_at, ' +
        'assignment:assignment_id(id, title, due_at, completed_at, type, courses(code), user_prefs:user_id(email, timezone)), ' +
        'application:application_id(id, company, role, stage, next_action, next_action_at, user_prefs:user_id(email, timezone))'
    )
    .eq('status', 'scheduled')
    .lte('fire_at', nowIso);

  if (due.error) return { error: due.error.message };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  type PrefsJoin = { email: string; timezone: string } | { email: string; timezone: string }[] | null;
  type Joined = {
    id: string;
    user_id: string;
    assignment_id: string | null;
    application_id: string | null;
    fire_at: string;
    assignment: {
      title: string;
      due_at: string;
      completed_at: string | null;
      courses: { code: string } | { code: string }[] | null;
      user_prefs: PrefsJoin;
    } | null;
    application: {
      company: string;
      role: string;
      stage: string;
      next_action: string | null;
      next_action_at: string | null;
      user_prefs: PrefsJoin;
    } | null;
  };
  const firstPrefs = (p: PrefsJoin) => (Array.isArray(p) ? p[0] ?? null : p);
  const TERMINAL_STAGES = ['offer', 'rejected', 'withdrawn'];

  for (const r of (due.data ?? []) as unknown as Joined[]) {
    // Compose the email for whichever parent this reminder row points at
    // (exactly one is set, per the table's CHECK constraint).
    let to: string | null = null;
    let email: { subject: string; text: string; html: string } | null = null;

    if (r.assignment_id) {
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
      const prefs = firstPrefs(a.user_prefs);
      if (!prefs) {
        skipped++;
        continue;
      }
      const hoursUntilDue = (new Date(a.due_at).getTime() - Date.now()) / (60 * 60 * 1000);
      to = prefs.email;
      email = reminderEmailFor({
        appUrl,
        title: a.title,
        courseCode,
        dueAtIso: a.due_at,
        timezone: prefs.timezone,
        hoursUntilDue,
      });
    } else if (r.application_id) {
      const app = r.application;
      if (!app) {
        skipped++;
        continue;
      }
      // Terminal stage or cleared next action → stale, cancel like a
      // completed assignment.
      if (TERMINAL_STAGES.includes(app.stage) || !app.next_action_at) {
        skipped++;
        await admin.from('reminders').update({ status: 'cancelled' }).eq('id', r.id);
        continue;
      }
      const prefs = firstPrefs(app.user_prefs);
      if (!prefs) {
        skipped++;
        continue;
      }
      const hoursUntil =
        (new Date(app.next_action_at).getTime() - Date.now()) / (60 * 60 * 1000);
      to = prefs.email;
      email = applicationReminderEmailFor({
        appUrl,
        company: app.company,
        role: app.role,
        nextAction: app.next_action,
        nextActionAtIso: app.next_action_at,
        timezone: prefs.timezone,
        hoursUntil,
      });
    } else {
      skipped++;
      continue;
    }

    const res = await sendEmail({ to, ...email });
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

// Schedule reminders for open, future-due assignments that have NO reminder
// rows yet. The interactive create/update routes call the scheduler directly,
// but the Canvas and Gradescope importers insert assignment rows without it —
// so without this pass those deadlines get zero reminders (CLAUDE.md §6, the
// "something got dropped → re-schedule" safety net). `scheduleAssignmentReminders`
// skips any offset already in the past, so this never creates a due-now row.
async function runReminderBackfill(
  admin: SupabaseClient,
  appUrl: string
): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const open = await admin
    .from('assignments')
    .select('id, user_id, due_at')
    .is('completed_at', null)
    .gt('due_at', nowIso);
  if (open.error) return { error: open.error.message };

  const rows = (open.data ?? []) as Array<{ id: string; user_id: string; due_at: string }>;
  if (rows.length === 0) return { scheduled: 0, checked: 0 };

  // One query for all assignments that already have any reminder row.
  const existing = await admin
    .from('reminders')
    .select('assignment_id')
    .in(
      'assignment_id',
      rows.map((r) => r.id)
    );
  if (existing.error) return { error: existing.error.message };
  const haveReminders = new Set(
    (existing.data ?? []).map((r) => (r as { assignment_id: string }).assignment_id)
  );

  const missing = rows.filter((r) => !haveReminders.has(r.id));
  if (missing.length === 0) return { scheduled: 0, checked: rows.length, missing: 0 };

  // Per-user reminder offsets (fall back to the schema default).
  const userIds = Array.from(new Set(missing.map((r) => r.user_id)));
  const prefs = await admin
    .from('user_prefs')
    .select('user_id, reminder_offsets_hours')
    .in('user_id', userIds);
  const offsetsByUser = new Map<string, number[]>();
  for (const p of (prefs.data ?? []) as Array<{
    user_id: string;
    reminder_offsets_hours: number[] | null;
  }>) {
    offsetsByUser.set(p.user_id, p.reminder_offsets_hours ?? DEFAULT_OFFSETS);
  }

  let scheduled = 0;
  for (const r of missing) {
    await scheduleAssignmentReminders({
      userId: r.user_id,
      assignmentId: r.id,
      dueAtIso: r.due_at,
      reminderOffsetsHours: offsetsByUser.get(r.user_id) ?? DEFAULT_OFFSETS,
      appUrl,
    });
    scheduled++;
  }
  return { scheduled, checked: rows.length, missing: missing.length };
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
