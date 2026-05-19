import { cn } from '@/lib/utils';
import { formatDueAt, formatRelative } from '@/lib/format';

// Schema stages from supabase/migrations/0001_init.sql:
//   'applied','oa','phone_screen','technical','onsite','offer','rejected','withdrawn'
// HANDOFF.md kanban + funnel collapse to four lanes:
//   applied · interview · offer · rejected
export type ApplicationStage =
  | 'applied'
  | 'oa'
  | 'phone_screen'
  | 'technical'
  | 'onsite'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type DisplayStage = 'applied' | 'interview' | 'offer' | 'rejected';

export function toDisplayStage(stage: ApplicationStage): DisplayStage {
  if (stage === 'applied') return 'applied';
  if (stage === 'offer') return 'offer';
  if (stage === 'rejected' || stage === 'withdrawn') return 'rejected';
  return 'interview'; // oa, phone_screen, technical, onsite
}

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
}

export function ApplicationCard({
  application: a,
  timezone,
  variant,
  className,
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
