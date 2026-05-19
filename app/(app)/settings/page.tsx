import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import CoursesManager, { type CourseRow } from '@/components/CoursesManager';
import SettingsForm from '@/components/SettingsForm';
import RemindersForm from '@/components/RemindersForm';
import IntegrationsPanel from '@/components/IntegrationsPanel';

export const dynamic = 'force-dynamic';

interface SettingsRowProps {
  label: string;
  note?: string;
  children: React.ReactNode;
}

function SettingsRow({ label, note, children }: SettingsRowProps) {
  return (
    <div className="border-b border-dashed border-ink-faint/40 py-4 first:border-t">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-start md:gap-6">
        <div className="md:w-44 md:shrink-0">
          <div className="text-sm font-medium text-ink">{label}</div>
          {note ? (
            <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{note}</div>
          ) : null}
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, code, name, color')
    .eq('user_id', user.id)
    .order('code', { ascending: true });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-none">settings</h1>
        <p className="mt-1 font-mono text-xs text-ink-soft">
          {user.email} · timezone <span className="text-ink">{prefs.timezone}</span>
        </p>
      </header>

      <div>
        <SettingsRow label="semester end" note="default 'until' for recurring assignments">
          <SettingsForm initialSemesterEndDate={prefs.semester_end_date} />
        </SettingsRow>

        <SettingsRow
          label="reminder offsets"
          note="hours before each deadline that an email goes out"
        >
          <RemindersForm initialOffsets={prefs.reminder_offsets_hours} />
        </SettingsRow>

        <SettingsRow label="integrations" note="calendar feed · canvas · gradescope">
          <IntegrationsPanel
            appUrl={appUrl}
            initialIcsToken={prefs.ics_token}
            initialCanvasUrl={prefs.canvas_ics_url}
            initialGradescopeToken={prefs.gradescope_sync_token}
          />
        </SettingsRow>

        <SettingsRow label="timezone" note="set once during signup; immutable for now">
          <span className="font-mono text-xs">{prefs.timezone}</span>
        </SettingsRow>

        <SettingsRow label="courses" note="auto-created the first time you save an assignment">
          {error ? (
            <p className="text-sm text-urgent">Failed to load: {error.message}</p>
          ) : (
            <CoursesManager courses={(courses ?? []) as CourseRow[]} />
          )}
        </SettingsRow>
      </div>
    </section>
  );
}
