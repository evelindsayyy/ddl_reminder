import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCourseSchema } from '@/lib/schemas';
import { pickColorForNewCourse } from '@/lib/colors';

export async function GET(_: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('courses')
    .select('id, code, name, color, created_at')
    .eq('user_id', user.id)
    .order('code', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

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

  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  let color = parsed.data.color;
  if (!color) {
    const used = await supabase.from('courses').select('color').eq('user_id', user.id);
    color = pickColorForNewCourse((used.data ?? []).map((r) => r.color));
  }

  const { data, error } = await supabase
    .from('courses')
    .insert({
      user_id: user.id,
      code: parsed.data.code.trim(),
      name: parsed.data.name ?? null,
      color,
    })
    .select('id, code, name, color, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'course_exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
