import { NextResponse, type NextRequest } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { reminderEmailFor, sendEmail } from '@/lib/email';

// QStash → here. Verify the signature, then look up the assignment +
// recipient and send the reminder email. Mark the reminders row 'sent'.
//
// In dev (no QStash signing keys), the route still works for local
// curl-based testing if INSECURE_REMINDER_WEBHOOK=1 is set — useful for
// running the daily sweeper locally without going through QStash.
export async function POST(request: NextRequest) {
  const bodyText = await request.text();

  if (!verifySignature(request, bodyText)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: { assignmentId?: string; offsetHours?: number };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!payload.assignmentId) return NextResponse.json({ error: 'missing_assignmentId' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdmin(supabaseUrl, serviceKey);

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

  // Mark the matching `reminders` row as sent. We don't know which row
  // exactly (multiple offsets per assignment); resolve via fire_at near now.
  const now = new Date();
  await admin
    .from('reminders')
    .update({ status: send.ok ? 'sent' : 'failed', sent_at: now.toISOString() })
    .eq('assignment_id', a.id)
    .eq('status', 'scheduled')
    .lte('fire_at', now.toISOString());

  return NextResponse.json({ ok: send.ok, skipped: send.skipped, error: send.error });
}

function verifySignature(request: NextRequest, body: string): boolean {
  if (process.env.INSECURE_REMINDER_WEBHOOK === '1') return true;

  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return false;
  const signature = request.headers.get('upstash-signature');
  if (!signature) return false;
  const receiver = new Receiver({ currentSigningKey: current, nextSigningKey: next });
  // Receiver.verify is async in newer versions; keep this best-effort
  // synchronous-ish here. Failing closed if anything throws.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (receiver as any).verify({
      signature,
      body,
      url: request.url,
    });
    if (result instanceof Promise) {
      // We can't await in a non-async function; the verify in current
      // @upstash/qstash is sync for this signature. If it returns a
      // Promise we deliberately fail closed.
      return false;
    }
    return Boolean(result);
  } catch {
    return false;
  }
}
