'use client';

import { useOptimistic, useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  toDisplayStage,
  type ApplicationCardData,
  type ApplicationStage,
  type DisplayStage,
} from './ApplicationCard';
import { ApplicationCardInteractive } from './ApplicationCardInteractive';
import { moveApplicationToLane } from '@/lib/applications';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';

const LANES: { key: DisplayStage; label: string }[] = [
  { key: 'applied', label: 'applied' },
  { key: 'interview', label: 'interviewing' },
  { key: 'offer', label: 'offer' },
  { key: 'rejected', label: 'rejected' },
];

const DT_KEY = 'application/x-ddl-app-id';

// Drag drops move by lane (preserving interview sub-stage via laneStageFor);
// the actions <select> moves to a concrete 8-stage value directly.
type OptimisticAction = { id: string; lane: DisplayStage } | { id: string; stage: ApplicationStage };

export interface PipelineKanbanProps {
  applications: ApplicationCardData[];
  timezone: string;
}

export function PipelineKanban({ applications, timezone }: PipelineKanbanProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic<ApplicationCardData[], OptimisticAction>(
    applications,
    (state, action) =>
      state.map((a) => {
        if (a.id !== action.id) return a;
        const stage = 'stage' in action ? action.stage : laneStageFor(a.stage, action.lane);
        return { ...a, stage };
      })
  );
  const [hoverLane, setHoverLane] = useState<DisplayStage | null>(null);
  // Cards in edit mode opt out of drag so form interaction never starts an
  // HTML5 drag on the wrapper. Immutable Set updates (new Set per transition).
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());

  const grouped: Record<DisplayStage, ApplicationCardData[]> = {
    applied: [],
    interview: [],
    offer: [],
    rejected: [],
  };
  for (const a of optimistic) {
    grouped[toDisplayStage(a.stage)].push(a);
  }

  function onDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.setData(DT_KEY, id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: DragEvent<HTMLDivElement>, lane: DisplayStage) {
    e.preventDefault();
    setHoverLane(null);
    const id = e.dataTransfer.getData(DT_KEY);
    if (!id) return;
    const current = optimistic.find((a) => a.id === id);
    if (!current) return;
    if (toDisplayStage(current.stage) === lane) return;
    startTransition(() => applyOptimistic({ id, lane }));
    void (async () => {
      const res = await moveApplicationToLane(id, lane);
      if (!res.ok) toast(humanizeError(res.error ?? 'move_failed'));
      router.refresh();
    })();
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {LANES.map((lane) => {
          const items = grouped[lane.key];
          const faded = lane.key === 'rejected';
          return (
            <div
              key={lane.key}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverLane(lane.key);
              }}
              onDragLeave={() => setHoverLane((h) => (h === lane.key ? null : h))}
              onDrop={(e) => onDrop(e, lane.key)}
              className={cn(
                'flex flex-col gap-2 rounded-md border p-2 transition-colors duration-150',
                faded ? 'opacity-80' : '',
                hoverLane === lane.key
                  ? 'border-ink bg-bg-dim/80'
                  : 'border-ink-faint/40 bg-bg-dim/40'
              )}
            >
              <header className="flex items-baseline justify-between border-b border-stage-applied pb-1">
                <h3
                  className={cn(
                    'font-display text-xl leading-none',
                    lane.key === 'interview' && 'text-stage-interview',
                    lane.key === 'offer' && 'text-stage-offer',
                    lane.key === 'rejected' && 'text-stage-rejected',
                    lane.key === 'applied' && 'text-stage-applied'
                  )}
                >
                  {lane.label}
                </h3>
                <span className="font-mono text-[11px] text-ink-faint">{items.length}</span>
              </header>
              {items.length === 0 ? (
                <p className="py-2 text-center font-mono text-[11px] text-ink-faint">—</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((a) => (
                    <div
                      key={a.id}
                      draggable={!editingIds.has(a.id)}
                      onDragStart={(e) => onDragStart(e, a.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <ApplicationCardInteractive
                        application={a}
                        timezone={timezone}
                        variant="kanban"
                        onStageOptimistic={(s) =>
                          startTransition(() => applyOptimistic({ id: a.id, stage: s }))
                        }
                        onEditingChange={(editing) =>
                          setEditingIds((prev) => {
                            const next = new Set(prev);
                            if (editing) next.add(a.id);
                            else next.delete(a.id);
                            return next;
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Local mirror of the server-side rule for instant optimistic update.
function laneStageFor(
  current: ApplicationCardData['stage'],
  target: DisplayStage
): ApplicationCardData['stage'] {
  if (target === 'applied') return 'applied';
  if (target === 'offer') return 'offer';
  if (target === 'rejected') return current === 'withdrawn' ? 'withdrawn' : 'rejected';
  // target === 'interview'
  const interviewSet: ApplicationCardData['stage'][] = ['oa', 'phone_screen', 'technical', 'onsite'];
  return interviewSet.includes(current) ? current : 'phone_screen';
}
