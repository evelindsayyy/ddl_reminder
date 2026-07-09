import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { firstRow } from '@/lib/supabaseJoin';
import QuickAdd from '@/components/assignments/QuickAdd';
import {
  AssignmentsView,
  type FilterMode,
  type ViewMode,
} from '@/components/assignments/AssignmentsView';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, title, type, due_at, completed_at, notes, estimated_hours, actual_hours, tags, course_id, recurrence_group_id, source, external_url, courses(code, name, color)';

interface PageProps {
  searchParams?: { view?: string; filter?: string };
}

function parseView(raw: string | undefined): ViewMode {
  if (raw === 'calendar' || raw === 'timeline') return raw;
  return 'list';
}
function parseFilter(raw: string | undefined): FilterMode {
  if (raw === 'all' || raw === 'done' || raw === 'open') return raw;
  return 'open';
}

export default async function AssignmentsPage({ searchParams }: PageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
  const view = parseView(searchParams?.view);
  const filter = parseFilter(searchParams?.filter);

  // For 'open' filter (default), only fetch open + recently-done so the
  // optimistic fade has something to display. For 'done' / 'all', fetch all.
  let query = supabase
    .from('assignments')
    .select(SELECT)
    .eq('user_id', user.id)
    .order('due_at', { ascending: true });

  if (filter === 'open') {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    query = query.or(`completed_at.is.null,completed_at.gt.${cutoff}`);
  } else if (filter === 'done') {
    query = query.not('completed_at', 'is', null);
  }

  const [assignmentsRes, coursesRes] = await Promise.all([
    query,
    supabase
      .from('courses')
      .select('code, name, color')
      .eq('user_id', user.id)
      .order('code', { ascending: true }),
  ]);

  const { data, error } = assignmentsRes;
  const knownCourses = coursesRes.data ?? [];

  if (error) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Assignments</h1>
        <p className="rounded border border-urgent/40 bg-urgent/5 p-3 text-sm text-urgent">
          Failed to load: {error.message}
        </p>
      </section>
    );
  }

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

  return (
    <section className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-none">assignments</h1>
        <p className="mt-1 font-mono text-xs text-ink-soft">
          type a line, save, sort by course or month.
        </p>
      </header>

      <QuickAdd
        timezone={prefs.timezone}
        knownCourses={knownCourses}
        semesterEndDate={prefs.semester_end_date}
      />

      <AssignmentsView
        assignments={rows}
        timezone={prefs.timezone}
        initialView={view}
        initialFilter={filter}
      />
    </section>
  );
}
