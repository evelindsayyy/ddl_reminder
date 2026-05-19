import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateCourseSchema } from '@/lib/schemas';

interface RouteContext {
  params: { id: string };
}

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

  const parsed = updateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) patch.code = parsed.data.code.trim();
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.color !== undefined) patch.color = parsed.data.color;

  const { data, error } = await supabase
    .from('courses')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id, code, name, color, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'course_exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // FK on assignments.course_id is ON DELETE SET NULL — existing assignments
  // are preserved, they just lose their course pill.
  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
