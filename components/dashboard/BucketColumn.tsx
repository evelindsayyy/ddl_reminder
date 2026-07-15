'use client';

import { cn } from '@/lib/utils';
import {
  AssignmentCard,
  type AssignmentCardData,
} from '@/components/dashboard/AssignmentCard';

export interface BucketColumnProps {
  title: string;
  items: AssignmentCardData[];
  timezone: string;
  // Forwarded from DashboardBuckets so optimistic state lives in one place.
  fadingIds: ReadonlySet<string>;
  // Ids with an outstanding mark-done PATCH — the card dims + disables.
  pendingIds: ReadonlySet<string>;
  onToggleDone: (id: string, completedAt: string | null) => void;
  // Prose counter copy, e.g. `(n) => `${n} due today``. Passed from
  // DashboardBuckets so BucketColumn stays generic.
  countLabel: (n: number) => string;
  // Per-bucket empty-state copy, e.g. `nothing due today 🎉`.
  emptyLabel: string;
  // Visual emphasis — true for "today" + the overdue banner.
  urgent?: boolean;
  // When true, bucket column expands and items render in a flat grid (mobile).
  flat?: boolean;
}

export function BucketColumn({
  title,
  items,
  timezone,
  fadingIds,
  pendingIds,
  onToggleDone,
  countLabel,
  emptyLabel,
  urgent = false,
  flat = false,
}: BucketColumnProps) {
  const visible = items.filter((a) => !a.completed_at || fadingIds.has(a.id));

  return (
    <section
      className={cn(
        'flex flex-col gap-2',
        flat ? 'min-w-0' : 'min-w-0 rounded-md bg-bg-dim/60 p-3'
      )}
      aria-labelledby={`bucket-${title}`}
    >
      <header className="flex items-baseline justify-between">
        <h2
          id={`bucket-${title}`}
          className={cn(
            'font-display text-2xl font-semibold leading-none',
            urgent ? 'text-urgent' : 'text-ink'
          )}
        >
          {title}
        </h2>
        <span className="text-sm text-ink-faint">{countLabel(visible.length)}</span>
      </header>

      {visible.length === 0 ? (
        <p className="py-2 text-center font-display text-lg text-ink-faint">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              timezone={timezone}
              onToggleDone={onToggleDone}
              fading={fadingIds.has(a.id)}
              pending={pendingIds.has(a.id)}
              density="comfortable"
            />
          ))}
        </ul>
      )}
    </section>
  );
}
