import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatDueAt, formatRelative } from '@/lib/format';
import type { ApplicationStage } from '@/lib/schemas';
import { toDisplayStage, type DisplayStage } from '@/lib/applicationStage';

// Re-exported so existing consumers can keep importing from this module.
// Stage↔lane mapping lives in lib/applicationStage.ts (pure + unit-tested).
export type { ApplicationStage, DisplayStage };
export { toDisplayStage };

export interface ApplicationCardData {
  id: string;
  company: string;
  role: string;
  stage: ApplicationStage;
  next_action: string | null;
  next_action_at: string | null; // ISO UTC
  notes: string | null;
  applied_at: string;
  updated_at: string;
}

const URGENCY_RED_HOURS = 48;

export interface ApplicationCardProps {
  application: ApplicationCardData;
  timezone: string;
  variant: 'kanban' | 'timeline';
  className?: string;
  // Optional interactive slot (stage select / edit / delete). Rendered as the
  // last child of the card. Kept as a ReactNode so the card itself stays a pure,
  // RSC-safe presentational component — interactivity lives in the passed node.
  footer?: ReactNode;
}

export function ApplicationCard({
  application: a,
  timezone,
  variant,
  className,
  footer,
}: ApplicationCardProps) {
  const display = toDisplayStage(a.stage);
  const next = a.next_action_at;
  const urgent =
    next !== null
      ? (new Date(next).getTime() - Date.now()) / (60 * 60 * 1000) < URGENCY_RED_HOURS
      : false;

  return (
    <article
      className={cn(
        'flex flex-col rounded border bg-bg p-3 transition-colors duration-150',
        'border-ink-faint/40 hover:border-ink-faint',
        variant === 'kanban' && 'cursor-grab active:cursor-grabbing',
        className
      )}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold leading-snug text-ink truncate">{a.company}</div>
          <div className="font-mono text-[11px] text-ink-soft truncate">{a.role}</div>
        </div>
        {variant === 'timeline' ? <StageBadge stage={display} /> : null}
      </header>

      {a.next_action ? (
        <div className="mt-2 border-t border-dashed border-ink-faint/50 pt-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">next:</div>
          <div className="text-sm text-ink leading-snug">{a.next_action}</div>
          {next ? (
            <div
              className={cn(
                'mt-0.5 font-mono text-[11px]',
                urgent ? 'font-medium text-urgent' : 'text-ink-soft'
              )}
            >
              {formatDueAt(next, timezone)} · {formatRelative(next)}
            </div>
          ) : null}
        </div>
      ) : null}

      {footer ? (
        <div className="mt-2 border-t border-dashed border-ink-faint/50 pt-2">{footer}</div>
      ) : null}
    </article>
  );
}

const STAGE_COLOR_CLASS: Record<DisplayStage, string> = {
  applied: 'border-stage-applied text-stage-applied',
  interview: 'border-stage-interview text-stage-interview',
  offer: 'border-stage-offer text-stage-offer',
  rejected: 'border-stage-rejected text-stage-rejected',
};

export function StageBadge({ stage }: { stage: DisplayStage }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
        STAGE_COLOR_CLASS[stage]
      )}
    >
      {stage}
    </span>
  );
}
