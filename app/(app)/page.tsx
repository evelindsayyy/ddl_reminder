import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { firstRow } from '@/lib/supabaseJoin';
import { AddDeadline } from '@/components/assignments/AddDeadline';
import { DashboardBuckets } from '@/components/dashboard/DashboardBuckets';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, title, type, due_at, completed_at, notes, estimated_hours, actual_hours, tags, course_id, recurrence_group_id, source, external_url, courses(code, name, color)';

function deriveName(email: string | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[\d_-]+$/, '').replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });

  // Open or recently-completed (within 6 h) so a just-marked-done item
  // can still fade out — server-side filter trimmed by completed_at.
  // eslint-disable-next-line react-hooks/purity -- async Server Component: Date.now() computes a per-request DB query cutoff, not render output. The purity rule can't distinguish server from client components; there is no render impurity here.
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const [assignmentsRes, coursesRes] = await Promise.all([
    supabase
      .from('assignments')
      .select(SELECT)
      .eq('user_id', user.id)
      .or(`completed_at.is.null,completed_at.gt.${cutoff}`)
      .order('due_at', { ascending: true }),
    supabase
      .from('courses')
      .select('code, name, color')
      .eq('user_id', user.id)
      .order('code', { ascending: true }),
  ]);

  const { data, error } = assignmentsRes;
  const knownCourses = coursesRes.data ?? [];

  const rows: AssignmentCardData[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    due_at: row.due_at,
    completed_at: row.completed_at,
    notes: row.notes,
    estimated_hours: row.estimated_hours,
    actual_hours: row.actual_hours,
    tags: row.tags ?? [],
    course_id: row.course_id,
    recurrence_group_id: row.recurrence_group_id,
    source: row.source,
    external_url: row.external_url,
    courses: firstRow(row.courses),
  }));

  // Failed reminders for still-open assignments are real missed notifications:
  // the daily sweeper only retries 'scheduled', never 'failed'. Count them so
  // they're visible. Filtering on completed_at client-side keeps the banner
  // self-clearing as items get done. Best-effort — never break the dashboard.
  type FailedRow = {
    assignment: { completed_at: string | null } | { completed_at: string | null }[] | null;
  };
  const failedReminders = await supabase
    .from('reminders')
    .select('id, assignment:assignment_id(completed_at)')
    .eq('user_id', user.id)
    .eq('status', 'failed');
  const failedCount = ((failedReminders.data ?? []) as unknown as FailedRow[]).filter((r) => {
    const a = firstRow(r.assignment);
    return a != null && a.completed_at == null;
  }).length;

  const name = deriveName(user.email);
  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: prefs.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-none text-ink md:text-4xl">
          {name ? `hey ${name}` : 'hey there'}{' '}
          <span className="font-mono text-base font-normal text-ink-soft">— {todayLabel}</span>
        </h1>
      </header>

      <AddDeadline
        courses={knownCourses}
        timezone={prefs.timezone}
        semesterEndDate={prefs.semester_end_date}
      />

      {error ? (
        <p className="rounded border border-urgent/40 bg-urgent/5 p-3 text-sm text-urgent">
          Failed to load: {error.message}
        </p>
      ) : (
        <DashboardBuckets
          assignments={rows}
          timezone={prefs.timezone}
          nowIso={new Date().toISOString()}
        />
      )}

      {failedCount > 0 ? (
        <p className="rounded border border-urgent/40 bg-urgent/5 p-3 text-sm text-urgent">
          ⚠ {failedCount} reminder {failedCount === 1 ? 'email' : 'emails'} failed to send for open
          assignments and will not be retried — double-check those deadlines.
        </p>
      ) : null}
    </div>
  );
}
