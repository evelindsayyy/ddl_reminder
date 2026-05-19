import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { DashboardBuckets } from '@/components/dashboard/DashboardBuckets';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, title, type, due_at, completed_at, notes, estimated_hours, actual_hours, course_id, recurrence_group_id, source, external_url, courses(code, name, color)';

function deriveName(email: string | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[\d_-]+$/, '').replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });

  // Open or recently-completed (within 6 h) so a just-marked-done item
  // can still fade out — server-side filter trimmed by completed_at.
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('assignments')
    .select(SELECT)
    .eq('user_id', user.id)
    .or(`completed_at.is.null,completed_at.gt.${cutoff}`)
    .order('due_at', { ascending: true });

  const rows: AssignmentCardData[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    due_at: row.due_at,
    completed_at: row.completed_at,
    notes: row.notes,
    estimated_hours: row.estimated_hours,
    actual_hours: row.actual_hours,
    course_id: row.course_id,
    recurrence_group_id: row.recurrence_group_id,
    source: row.source,
    external_url: row.external_url,
    courses: Array.isArray(row.courses) ? (row.courses[0] ?? null) : row.courses,
  }));

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
        <h1 className="font-display text-3xl font-semibold leading-none text-ink">
          {name ? `hey ${name}` : 'hey there'}{' '}
          <span className="font-mono text-base font-normal text-ink-soft">— {todayLabel}</span>
        </h1>
      </header>

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
    </div>
  );
}
