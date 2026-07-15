'use client';

import { cn } from '@/lib/utils';
import { formatDueAt, formatRelative } from '@/lib/format';
import type { ApplicationCardData } from './ApplicationCard';
import { ApplicationCardInteractive } from './ApplicationCardInteractive';

export interface PipelineTimelineProps {
  applications: ApplicationCardData[];
  timezone: string;
}

const URGENCY_RED_HOURS = 48;

export function PipelineTimeline({ applications, timezone }: PipelineTimelineProps) {
  const ordered = [...applications]
    .filter((a) => a.next_action_at)
    .sort(
      (a, b) =>
        new Date(a.next_action_at as string).getTime() -
        new Date(b.next_action_at as string).getTime()
    );

  if (ordered.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-display text-2xl font-semibold text-ink-faint">no upcoming actions</p>
        <p className="mt-1 text-sm text-ink-faint">
          set a <code className="font-mono">next action at</code> on an application to see it here.
        </p>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- intentional wall-clock read: `now` anchors display-only relative-time positions on the timeline, recomputed each render to stay fresh. The transient result never feeds state or effects.
  const now = Date.now();

  return (
    <ol className="relative space-y-4 border-l border-ink-faint/60 pl-6">
      {ordered.map((a, i) => {
        const due = new Date(a.next_action_at as string).getTime();
        const overdue = due < now;
        const urgent = !overdue && (due - now) / (60 * 60 * 1000) < URGENCY_RED_HOURS;

        return (
          <li key={a.id} className="relative">
            <span
              className={cn(
                'absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-bg',
                i === 0 && !overdue ? 'bg-urgent' : '',
                overdue ? 'bg-urgent' : '',
                !overdue && i !== 0 ? 'bg-ink' : ''
              )}
            />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  'font-mono text-xs',
                  overdue ? 'font-medium text-urgent' : urgent ? 'text-urgent' : 'text-ink-soft'
                )}
              >
                {formatDueAt(a.next_action_at as string, timezone)}
              </span>
              <span
                className={cn(
                  'font-mono text-xs',
                  overdue ? 'text-urgent' : 'text-ink-faint'
                )}
              >
                · {formatRelative(a.next_action_at as string)}
              </span>
              {overdue ? (
                <span className="rounded-sm bg-urgent/10 px-1.5 py-0.5 font-mono text-xs uppercase text-urgent">
                  missed
                </span>
              ) : null}
            </div>
            <div className="mt-1">
              <ApplicationCardInteractive application={a} timezone={timezone} variant="timeline" />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
