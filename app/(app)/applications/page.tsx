import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureUserPrefs } from '@/lib/prefs';
import { AddApplicationForm } from '@/components/applications/AddApplicationForm';
import {
  ApplicationsView,
  type AppViewMode,
} from '@/components/applications/ApplicationsView';
import type { ApplicationCardData } from '@/components/applications/ApplicationCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ view?: string }>;
}

function parseView(raw: string | undefined): AppViewMode {
  if (raw === 'timeline' || raw === 'funnel') return raw;
  return 'kanban';
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
  const sp = await searchParams;
  const view = parseView(sp?.view);

  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, company, role, stage, next_action, next_action_at, notes, applied_at, updated_at'
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const applications: ApplicationCardData[] = (data ?? []) as ApplicationCardData[];

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-none md:text-4xl">internships</h1>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            kanban · timeline · funnel
          </p>
        </div>
        <AddApplicationForm />
      </header>

      {error ? (
        <p className="rounded border border-urgent/40 bg-urgent/5 p-3 text-sm text-urgent">
          Failed to load: {error.message}
        </p>
      ) : (
        <ApplicationsView
          applications={applications}
          timezone={prefs.timezone}
          initialView={view}
        />
      )}
    </section>
  );
}
