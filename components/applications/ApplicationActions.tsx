'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateApplication, deleteApplication } from '@/lib/applications';
import { buildStageChangePatch } from '@/lib/applicationPatch';
import { STAGE_LABELS } from '@/lib/applicationStage';
import { APPLICATION_STAGES } from '@/lib/schemas';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';
import type { ApplicationCardData, ApplicationStage } from './ApplicationCard';

export interface ApplicationActionsProps {
  application: ApplicationCardData; // uses id, stage, next_action_at, company, role
  onEdit?: () => void; // provided by Task 3's interactive wrapper; hidden when absent
  onStageOptimistic?: (stage: ApplicationStage) => void; // kanban passes its useOptimistic apply
}

// One row of card actions: an 8-stage <select>, an optional pencil (edit), and a
// trash (delete). All calls follow the AddApplicationForm template — server action
// → ActionResult.ok branch → error banner → router.refresh() (refresh-to-truth).
export function ApplicationActions({ application: a, onEdit, onStageOptimistic }: ApplicationActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  // Timeline path has no onStageOptimistic, so the select would snap back to the
  // old stage for the whole pending window. Hold the chosen stage locally until
  // the refresh makes the prop truth. Harmless alongside the kanban's own optimism.
  const [pendingStage, setPendingStage] = useState<ApplicationStage | null>(null);

  function onStageChange(next: ApplicationStage) {
    if (next === a.stage) return;
    setPendingStage(next);
    onStageOptimistic?.(next);
    startTransition(async () => {
      try {
        const res = await updateApplication(a.id, buildStageChangePatch(a, next));
        if (!res.ok) toast(humanizeError(res.error ?? 'move_failed'));
      } catch {
        toast(humanizeError('move_failed'));
      } finally {
        router.refresh();
        setPendingStage(null);
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${a.company} — ${a.role}"?`)) return;
    startTransition(async () => {
      try {
        const res = await deleteApplication(a.id);
        if (!res.ok) toast(humanizeError(res.error ?? 'delete_failed'));
      } catch {
        toast(humanizeError('delete_failed'));
      } finally {
        router.refresh();
      }
    });
  }

  return (
    // draggable={false} + pointer-down stopPropagation so interacting with the
    // select/buttons never starts an HTML5 drag on the kanban wrapper (desktop).
    <div draggable={false} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <select
          value={pendingStage ?? a.stage}
          onChange={(e) => onStageChange(e.target.value as ApplicationStage)}
          disabled={pending}
          aria-label="Stage"
          className="flex-1 rounded border border-ink-faint bg-bg px-2 py-1 text-sm focus:border-ink focus:outline-none disabled:opacity-60"
        >
          {APPLICATION_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            aria-label="Edit application"
            className="rounded p-1.5 text-ink-faint hover:bg-bg-dim hover:text-ink disabled:opacity-60"
          >
            <PencilIcon />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label="Delete application"
          className="rounded p-1.5 text-ink-faint hover:bg-urgent/10 hover:text-urgent disabled:opacity-60"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// Inline SVG icons — copied from AssignmentCard (the repo hand-rolls icons; no
// icon library is in use despite lucide-react being an unused dependency).
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M10.4 2.6 11.7 3.9 4.3 11.3l-2 .4.4-2L10.4 2.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 4h8m-1 0v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4m2 0V3a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
