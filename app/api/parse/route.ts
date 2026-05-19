import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { parseAssignment } from '@/lib/parser';
import { parseInputSchema } from '@/lib/schemas';

// POST /api/parse
// Body: { input: string, referenceDate?: ISO string }
// Returns: ParsedAssignment (dueAt as ISO string or null)
export async function POST(request: NextRequest) {
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

  const parsed = parseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
  const referenceDate = parsed.data.referenceDate ? new Date(parsed.data.referenceDate) : new Date();

  const result = parseAssignment(parsed.data.input, {
    referenceDate,
    timezone: prefs.timezone,
  });

  // Never log raw input (CLAUDE.md §13) — just return.
  return NextResponse.json({
    courseCode: result.courseCode,
    title: result.title,
    type: result.type,
    dueAt: result.dueAt ? result.dueAt.toISOString() : null,
    tags: result.tags,
    confidence: result.confidence,
    rawInput: result.rawInput,
    recurrence: result.recurrence,
  });
}
