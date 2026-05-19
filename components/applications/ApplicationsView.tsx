'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ApplicationCardData } from './ApplicationCard';
import { PipelineKanban } from './PipelineKanban';
import { PipelineTimeline } from './PipelineTimeline';
import { PipelineFunnel } from './PipelineFunnel';

export type AppViewMode = 'kanban' | 'timeline' | 'funnel';

export interface ApplicationsViewProps {
  applications: ApplicationCardData[];
  timezone: string;
  initialView: AppViewMode;
}

export function ApplicationsView({
  applications,
  timezone,
  initialView,
}: ApplicationsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<AppViewMode>(initialView);

  function setUrlView(v: AppViewMode) {
    setView(v);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('view', v);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="View mode"
          className="inline-flex rounded border border-ink-faint/60 bg-bg-soft p-0.5"
        >
          {(['kanban', 'timeline', 'funnel'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              type="button"
              onClick={() => setUrlView(v)}
              className={cn(
                'rounded-sm px-3 py-1 text-xs transition-colors duration-150',
                view === v ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-dim'
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-ink-faint">
          {applications.length} total
        </span>
      </div>

      {view === 'kanban' ? (
        <PipelineKanban applications={applications} timezone={timezone} />
      ) : view === 'timeline' ? (
        <PipelineTimeline applications={applications} timezone={timezone} />
      ) : (
        <PipelineFunnel applications={applications} timezone={timezone} />
      )}
    </div>
  );
}
