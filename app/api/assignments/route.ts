import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { createAssignmentSchema } from '@/lib/schemas';
import { pickColorForNewCourse } from '@/lib/colors';
import { computeDefaultUntil, expandRecurrence } from '@/lib/recurrence';
import { scheduleAssignmentReminders } from '@/lib/reminders';
import { normalizeTags } from '@/lib/tags';

const SELECT =
  'id, title, type, due_at, completed_at, notes, estimated_hours, actual_hours, tags, course_id, recurrence_group_id, source, external_url, courses(code, name, color)';

// GET /api/assignments?status=open|done|all
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status') ?? 'open';

  let query = supabase
    .from('assignments')
    .select(SELECT)
    .eq('user_id', user.id)
    .order('due_at', { ascending: true });

  if (status === 'open') query = query.is('completed_at', null);
  else if (status === 'done') query = query.not('completed_at', 'is', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

// POST /api/assignments
// Body: CreateAssignmentInput (optionally with `recurrence` for series expansion)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });

  // Find-or-create course if courseCode provided.
  let courseId: string | null = null;
  if (parsed.data.courseCode) {
    const code = parsed.data.courseCode.trim();
    const existing = await supabase
      .from('courses')
      .select('id')
      .eq('user_id', user.id)
      .eq('code', code)
      .maybeSingle();

    if (existing.data) {
      courseId = existing.data.id;
    } else {
      const used = await supabase.from('courses').select('color').eq('user_id', user.id);
      const color = pickColorForNewCourse((used.data ?? []).map((r) => r.color));
      const insert = await supabase
        .from('courses')
        .insert({ user_id: user.id, code, color })
        .select('id')
        .single();
      if (insert.error) {
        return NextResponse.json(
          { error: `course_create_failed: ${insert.error.message}` },
          { status: 500 }
        );
      }
      courseId = insert.data.id;
    }
  }

  const firstDueAt = new Date(parsed.data.dueAt);
  const tags = normalizeTags(parsed.data.tags);

  // Non-recurring path: single insert.
  if (!parsed.data.recurrence) {
    const insert = await supabase
      .from('assignments')
      .insert({
        user_id: user.id,
        course_id: courseId,
        title: parsed.data.title,
        type: parsed.data.type,
        due_at: parsed.data.dueAt,
        notes: parsed.data.notes ?? null,
        estimated_hours: parsed.data.estimatedHours ?? null,
        tags,
      })
      .select(SELECT)
      .single();

    if (insert.error) {
      return NextResponse.json(
        { error: `insert_failed: ${insert.error.message}` },
        { status: 500 }
      );
    }
    // Fire-and-forget reminder scheduling. Soft-fails if QStash isn't configured.
    void scheduleAssignmentReminders({
      userId: user.id,
      assignmentId: insert.data.id,
      dueAtIso: parsed.data.dueAt,
      reminderOffsetsHours: prefs.reminder_offsets_hours,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    });
    return NextResponse.json({ data: insert.data }, { status: 201 });
  }

  // Recurring path: expand and bulk-insert.
  const rec = {
    interval: parsed.data.recurrence.interval,
    byweekday: parsed.data.recurrence.byweekday,
    until: parsed.data.recurrence.until ?? null,
  };
  const until = computeDefaultUntil(
    firstDueAt,
    rec.until ?? prefs.semester_end_date,
    prefs.timezone
  );

  const dates = expandRecurrence({
    firstDueAt,
    rec,
    until,
    timezone: prefs.timezone,
  });

  if (dates.length === 0) {
    return NextResponse.json({ error: 'recurrence_produces_no_rows' }, { status: 400 });
  }

  // crypto.randomUUID is available in Node ≥ 19.
  const groupId = crypto.randomUUID();
  const rows = dates.map((d) => ({
    user_id: user.id,
    course_id: courseId,
    title: parsed.data.title,
    type: parsed.data.type,
    due_at: d.toISOString(),
    notes: parsed.data.notes ?? null,
    estimated_hours: parsed.data.estimatedHours ?? null,
    tags,
    recurrence_group_id: groupId,
  }));

  const insert = await supabase.from('assignments').insert(rows).select(SELECT);

  if (insert.error) {
    return NextResponse.json(
      { error: `recurrence_insert_failed: ${insert.error.message}` },
      { status: 500 }
    );
  }

  // Schedule reminders for each generated occurrence.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  for (const row of insert.data ?? []) {
    void scheduleAssignmentReminders({
      userId: user.id,
      assignmentId: row.id,
      dueAtIso: row.due_at,
      reminderOffsetsHours: prefs.reminder_offsets_hours,
      appUrl,
    });
  }

  return NextResponse.json({ data: insert.data, count: insert.data?.length ?? 0 }, { status: 201 });
}
