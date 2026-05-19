import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateAssignmentSchema } from '@/lib/schemas';
import { ensureUserPrefs } from '@/lib/prefs';
import {
  cancelAssignmentReminders,
  scheduleAssignmentReminders,
} from '@/lib/reminders';

interface RouteContext {
  params: { id: string };
}

const SELECT =
  'id, title, type, due_at, completed_at, notes, estimated_hours, actual_hours, course_id, recurrence_group_id, source, external_url, courses(code, name, color)';

// PATCH /api/assignments/[id]
// Body: UpdateAssignmentInput (partial)
// Always affects only the single row (series-wide edits are a v2 feature).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
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

  const parsed = updateAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.type !== undefined) patch.type = parsed.data.type;
  if (parsed.data.dueAt !== undefined) patch.due_at = parsed.data.dueAt;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.estimatedHours !== undefined) patch.estimated_hours = parsed.data.estimatedHours;
  if (parsed.data.actualHours !== undefined) patch.actual_hours = parsed.data.actualHours;
  if (parsed.data.completedAt !== undefined) patch.completed_at = parsed.data.completedAt;

  const { data, error } = await supabase
    .from('assignments')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Reschedule reminders if due_at or completion changed.
  const dueChanged = parsed.data.dueAt !== undefined;
  const completedNowDone =
    parsed.data.completedAt !== undefined && parsed.data.completedAt !== null;
  const completedNowOpen =
    parsed.data.completedAt !== undefined && parsed.data.completedAt === null;

  if (completedNowDone) {
    void cancelAssignmentReminders(user.id, params.id);
  } else if (dueChanged || completedNowOpen) {
    const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
    void scheduleAssignmentReminders({
      userId: user.id,
      assignmentId: params.id,
      dueAtIso: data.due_at,
      reminderOffsetsHours: prefs.reminder_offsets_hours,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    });
  }
  return NextResponse.json({ data });
}

// DELETE /api/assignments/[id]?scope=one|series
// - scope=one (default): deletes only this row.
// - scope=series: deletes all rows in this row's recurrence_group_id
//                 with due_at > now() (i.e. future occurrences).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const scope = request.nextUrl.searchParams.get('scope') ?? 'one';

  if (scope === 'series') {
    const row = await supabase
      .from('assignments')
      .select('recurrence_group_id, due_at')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (row.error) return NextResponse.json({ error: row.error.message }, { status: 500 });
    if (!row.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!row.data.recurrence_group_id) {
      return NextResponse.json({ error: 'not_in_series' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const { error, count } = await supabase
      .from('assignments')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('recurrence_group_id', row.data.recurrence_group_id)
      .gt('due_at', nowIso);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  // scope === 'one'
  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  void cancelAssignmentReminders(user.id, params.id);
  return NextResponse.json({ ok: true });
}
