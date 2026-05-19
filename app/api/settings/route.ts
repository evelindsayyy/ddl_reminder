import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { updateSettingsSchema } from '@/lib/schemas';

export async function PATCH(request: NextRequest) {
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

  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  await ensureUserPrefs(supabase, { id: user.id, email: user.email });

  const patch: Record<string, unknown> = {};
  if (parsed.data.semesterEndDate !== undefined) {
    patch.semester_end_date = parsed.data.semesterEndDate ?? null;
  }
  if (parsed.data.canvasIcsUrl !== undefined) {
    const url = parsed.data.canvasIcsUrl;
    patch.canvas_ics_url = url === '' ? null : url;
  }
  if (parsed.data.reminderOffsetsHours !== undefined) {
    // Postgres int[]; deduplicate + sort descending so saved order is stable.
    const sorted = Array.from(new Set(parsed.data.reminderOffsetsHours)).sort(
      (a, b) => b - a
    );
    patch.reminder_offsets_hours = sorted;
  }

  const { data, error } = await supabase
    .from('user_prefs')
    .update(patch)
    .eq('user_id', user.id)
    .select('semester_end_date, canvas_ics_url, reminder_offsets_hours')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
