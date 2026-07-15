import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rotateGradescopeSyncToken } from '@/lib/prefs';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const token = await rotateGradescopeSyncToken(supabase, user.id);
  return NextResponse.json({ token });
}
