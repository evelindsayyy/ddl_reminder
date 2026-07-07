import { NextResponse, type NextRequest } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { createClient as createAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { applicationReminderEmailFor, reminderEmailFor, sendEmail } from '@/lib/email';

// QStash → here. Verify the signature, then look up the assignment +
// recipient and send the reminder email. Mark the reminders row 'sent'.
//
// In dev (no QStash signing keys), the route still works for local
// curl-based testing if INSECURE_REMINDER_WEBHOOK=1 is set — useful for
// running the daily sweeper locally without going through QStash.
export async function POST(request: NextRequest) {
  const bodyText = await request.text();

  if (!(await verifySignature(request, bodyText))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: { assignmentId?: string; applicationId?: string; offsetHours?: number };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdmin(supabaseUrl, serviceKey);

  if (payload.applicationId) {
    return handleApplicationReminder(admin, payload.applicationId, payload.offsetHours);
  }
  if (!payload.assignmentId) {
    return NextResponse.json({ error: 'missing_target_id' }, { status: 400 });
  }

  const fetched = await admin
    .from('assignments')
    .select(
      'id, user_id, title, due_at, completed_at, type, courses(code), user_prefs:user_id(email, timezone)'
    )
    .eq('id', payload.assignmentId)
    .maybeSingle();
  // Fallback fetch (the join above may fail depending on schema awareness):
  if (fetched.error || !fetched.data) {
    return NextResponse.json({ error: 'assignment_not_found' }, { status: 404 });
  }
  type AssignmentWithJoin = {
    id: string;
    user_id: string;
    title: string;
    due_at: string;
    completed_at: string | null;
    type: string;
    courses: { code: string } | { code: string }[] | null;
    user_prefs: { email: string; timezone: string } | { email: string; timezone: string }[] | null;
  };
  const a = fetched.data as unknown as AssignmentWithJoin;
  const courseCode = Array.isArray(a.courses) ? a.courses[0]?.code ?? null : a.courses?.code ?? null;
  const prefs = Array.isArray(a.user_prefs) ? a.user_prefs[0] ?? null : a.user_prefs;

  // Skip silently if marked done — user already handled it.
  if (a.completed_at) return NextResponse.json({ ok: true, skipped: 'already_done' });
  if (!prefs) return NextResponse.json({ error: 'no_user_prefs' }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const hoursUntilDue = (new Date(a.due_at).getTime() - Date.now()) / (60 * 60 * 1000);
  const email = reminderEmailFor({
    appUrl,
    title: a.title,
    courseCode,
    dueAtIso: a.due_at,
    timezone: prefs.timezone,
    hoursUntilDue,
  });
  const send = await sendEmail({ to: prefs.email, ...email });

  // Mark the delivered `reminders` row. The payload's `offsetHours` pins the
  // exact fire_at (due_at − offset), so we target only the row that actually
  // fired — flipping every overdue sibling would let a later, still-pending
  // offset be marked 'sent' and never retried by the sweeper. Fall back to the
  // near-now sweep only for legacy payloads that carry no offsetHours.
  const now = new Date();
  const newStatus = send.ok ? 'sent' : 'failed';
  if (typeof payload.offsetHours === 'number') {
    const fireAtIso = new Date(
      new Date(a.due_at).getTime() - payload.offsetHours * 60 * 60 * 1000
    ).toISOString();
    await admin
      .from('reminders')
      .update({ status: newStatus, sent_at: now.toISOString() })
      .eq('assignment_id', a.id)
      .eq('status', 'scheduled')
      .eq('fire_at', fireAtIso);
  } else {
    // Legacy payload with no offsetHours — fall back to the near-now sweep.
    await admin
      .from('reminders')
      .update({ status: newStatus, sent_at: now.toISOString() })
      .eq('assignment_id', a.id)
      .eq('status', 'scheduled')
      .lte('fire_at', now.toISOString());
  }

  return NextResponse.json({ ok: send.ok, skipped: send.skipped, error: send.error });
}

// Application reminders: same delivery contract as assignments, keyed on
// next_action_at instead of due_at. Terminal stages (offer/rejected/withdrawn)
// skip silently — same semantics as a completed assignment.
async function handleApplicationReminder(
  admin: SupabaseClient,
  applicationId: string,
  offsetHours: number | undefined
) {
  const fetched = await admin
    .from('applications')
    .select(
      'id, user_id, company, role, stage, next_action, next_action_at, user_prefs:user_id(email, timezone)'
    )
    .eq('id', applicationId)
    .maybeSingle();
  if (fetched.error || !fetched.data) {
    return NextResponse.json({ error: 'application_not_found' }, { status: 404 });
  }
  type AppWithJoin = {
    id: string;
    company: string;
    role: string;
    stage: string;
    next_action: string | null;
    next_action_at: string | null;
    user_prefs: { email: string; timezone: string } | { email: string; timezone: string }[] | null;
  };
  const app = fetched.data as unknown as AppWithJoin;
  const prefs = Array.isArray(app.user_prefs) ? app.user_prefs[0] ?? null : app.user_prefs;

  const TERMINAL_STAGES = ['offer', 'rejected', 'withdrawn'];
  if (TERMINAL_STAGES.includes(app.stage) || !app.next_action_at) {
    // Stale message (stage moved on, or next action cleared) — skip silently
    // and cancel any leftover scheduled rows so the sweeper won't resend.
    await admin
      .from('reminders')
      .update({ status: 'cancelled' })
      .eq('application_id', app.id)
      .eq('status', 'scheduled');
    return NextResponse.json({ ok: true, skipped: 'stale' });
  }
  if (!prefs) return NextResponse.json({ error: 'no_user_prefs' }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const hoursUntil =
    (new Date(app.next_action_at).getTime() - Date.now()) / (60 * 60 * 1000);
  const email = applicationReminderEmailFor({
    appUrl,
    company: app.company,
    role: app.role,
    nextAction: app.next_action,
    nextActionAtIso: app.next_action_at,
    timezone: prefs.timezone,
    hoursUntil,
  });
  const send = await sendEmail({ to: prefs.email, ...email });

  // Mark the delivered row — exact fire_at when the payload pins the offset,
  // near-now sweep otherwise (same policy as assignments).
  const now = new Date();
  const newStatus = send.ok ? 'sent' : 'failed';
  if (typeof offsetHours === 'number') {
    const fireAtIso = new Date(
      new Date(app.next_action_at).getTime() - offsetHours * 60 * 60 * 1000
    ).toISOString();
    await admin
      .from('reminders')
      .update({ status: newStatus, sent_at: now.toISOString() })
      .eq('application_id', app.id)
      .eq('status', 'scheduled')
      .eq('fire_at', fireAtIso);
  } else {
    await admin
      .from('reminders')
      .update({ status: newStatus, sent_at: now.toISOString() })
      .eq('application_id', app.id)
      .eq('status', 'scheduled')
      .lte('fire_at', now.toISOString());
  }

  return NextResponse.json({ ok: send.ok, skipped: send.skipped, error: send.error });
}

async function verifySignature(request: NextRequest, body: string): Promise<boolean> {
  // Dev-only escape hatch for curl-based local testing. Never honored in
  // production — a forged request here sends real email via the service role.
  if (
    process.env.INSECURE_REMINDER_WEBHOOK === '1' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return true;
  }

  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return false;
  const signature = request.headers.get('upstash-signature');
  if (!signature) return false;
  const receiver = new Receiver({ currentSigningKey: current, nextSigningKey: next });
  // Receiver.verify is async (returns a Promise in every @upstash/qstash 2.x
  // release); it throws SignatureError on a bad signature. Fail closed.
  try {
    await receiver.verify({ signature, body, url: request.url });
    return true;
  } catch {
    return false;
  }
}
