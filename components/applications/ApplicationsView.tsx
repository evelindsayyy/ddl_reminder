'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const VIEWS = ['kanban', 'timeline', 'funnel'] as const;
  const PANEL_ID = 'applications-view-panel';

  function setUrlView(v: AppViewMode) {
    setView(v);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('view', v);
    router.replace(`?${params.toString()}`);
  }

  // Roving-tabindex arrow-key navigation (WAI-ARIA tabs pattern): Left/Right
  // wrap, Home/End jump to ends; the newly focused tab is also activated.
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = VIEWS.indexOf(view);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % VIEWS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + VIEWS.length) % VIEWS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = VIEWS.length - 1;
    else return;
    e.preventDefault();
    setUrlView(VIEWS[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="View mode"
          className="inline-flex rounded border border-ink-faint/60 bg-bg-soft p-0.5"
        >
          {VIEWS.map((v, i) => (
            <button
              key={v}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`applications-view-tab-${v}`}
              role="tab"
              aria-selected={view === v}
              aria-controls={PANEL_ID}
              tabIndex={view === v ? 0 : -1}
              type="button"
              onClick={() => setUrlView(v)}
              onKeyDown={onTabKeyDown}
              className={cn(
                'rounded-sm px-3 py-1 text-xs transition-colors duration-150',
                view === v ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-dim'
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-ink-faint">
          {applications.length} total
        </span>
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`applications-view-tab-${view}`}
        tabIndex={0}
      >
        {view === 'kanban' ? (
          <PipelineKanban applications={applications} timezone={timezone} />
        ) : view === 'timeline' ? (
          <PipelineTimeline applications={applications} timezone={timezone} />
        ) : (
          <PipelineFunnel applications={applications} timezone={timezone} />
        )}
      </div>
    </div>
  );
}
