'use client';

import { useState } from 'react';
import { ApplicationCard, type ApplicationCardData, type ApplicationStage } from './ApplicationCard';
import { ApplicationActions } from './ApplicationActions';
import { ApplicationEditForm } from './ApplicationEditForm';

export interface ApplicationCardInteractiveProps {
  application: ApplicationCardData;
  timezone: string;
  variant: 'kanban' | 'timeline';
  className?: string;
  onStageOptimistic?: (stage: ApplicationStage) => void;
  // Fired on every edit-mode transition so a drag-owning parent (PipelineKanban)
  // can set draggable={!editing} on its wrapper — the authoritative drag opt-out.
  onEditingChange?: (editing: boolean) => void;
}

// Owns per-card edit-mode state. Editing → the edit form in a bordered shell;
// otherwise → the presentational card with an actions footer (stage select,
// edit pencil, delete). The editing shell keeps draggable={false} + a
// pointer-down stop as belt-and-suspenders, but the real drag opt-out now lives
// in the kanban wrapper via onEditingChange (see PipelineKanban editingIds).
export function ApplicationCardInteractive({
  application: a,
  timezone,
  variant,
  className,
  onStageOptimistic,
  onEditingChange,
}: ApplicationCardInteractiveProps) {
  const [editing, setEditingState] = useState(false);
  const setEditing = (next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  };

  if (editing) {
    return (
      <div
        draggable={false}
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded border border-ink bg-bg p-3"
      >
        <ApplicationEditForm
          application={a}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <ApplicationCard
      application={a}
      timezone={timezone}
      variant={variant}
      className={className}
      footer={
        <ApplicationActions
          application={a}
          onEdit={() => setEditing(true)}
          onStageOptimistic={onStageOptimistic}
        />
      }
    />
  );
}
