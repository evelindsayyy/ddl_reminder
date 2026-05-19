import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { gradescopeSyncSchema } from '@/lib/schemas';
import { pickColorForNewCourse } from '@/lib/colors';

// Public endpoint authed by `user_prefs.gradescope_sync_token`. The
// bookmarklet POSTs from gradescope.com → CORS allow that origin.
const ALLOWED_ORIGIN = 'https://www.gradescope.com';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonCors({ error: 'invalid_json' }, 400);
  }
  const parsed = gradescopeSyncSchema.safeParse(body);
  if (!parsed.success) {
    return jsonCors({ error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return jsonCors({ error: 'server_misconfigured' }, 500);
  const admin = createAdmin(supabaseUrl, serviceKey);

  // Token → user_id. Service role bypasses RLS.
  const prefs = await admin
    .from('user_prefs')
    .select('user_id')
    .eq('gradescope_sync_token', parsed.data.token)
    .maybeSingle();
  if (prefs.error || !prefs.data) return jsonCors({ error: 'unauthorized' }, 401);
  const userId = prefs.data.user_id;

  // Find-or-create the course.
  const courseCode = parsed.data.courseName.trim().slice(0, 32);
  let courseId: string | null = null;
  const courseLookup = await admin
    .from('courses')
    .select('id')
    .eq('user_id', userId)
    .eq('code', courseCode)
    .maybeSingle();
  if (courseLookup.data) {
    courseId = courseLookup.data.id;
  } else {
    const usedRes = await admin.from('courses').select('color').eq('user_id', userId);
    const color = pickColorForNewCourse((usedRes.data ?? []).map((r) => r.color));
    const ins = await admin
      .from('courses')
      .insert({ user_id: userId, code: courseCode, color })
      .select('id')
      .single();
    if (!ins.error && ins.data) courseId = ins.data.id;
  }

  // Pre-fetch existing imported rows for this user (Gradescope only) to
  // distinguish insert vs update.
  const existingRes = await admin
    .from('assignments')
    .select('id, external_id')
    .eq('user_id', userId)
    .eq('source', 'gradescope');
  const existingByExt = new Map<string, string>();
  for (const row of existingRes.data ?? []) {
    if (row.external_id) existingByExt.set(row.external_id, row.id);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const a of parsed.data.assignments) {
    const id = existingByExt.get(a.externalId);
    if (id) {
      const { error } = await admin
        .from('assignments')
        .update({
          title: a.title,
          due_at: a.dueAt,
          external_url: a.externalUrl ?? null,
          course_id: courseId,
        })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) skipped++;
      else updated++;
    } else {
      const { error } = await admin.from('assignments').insert({
        user_id: userId,
        course_id: courseId,
        title: a.title,
        type: 'other',
        due_at: a.dueAt,
        source: 'gradescope',
        external_id: a.externalId,
        external_url: a.externalUrl ?? null,
      });
      if (error) skipped++;
      else inserted++;
    }
  }

  return jsonCors({ inserted, updated, skipped, total: parsed.data.assignments.length });
}

function jsonCors(body: unknown, status: number = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}
