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
}

// Owns per-card edit-mode state. Editing → the edit form in a bordered shell;
// otherwise → the presentational card with an actions footer (stage select,
// edit pencil, delete). The editing shell sets draggable={false} and stops
// pointer-down propagation so that interacting with the form never starts an
// HTML5 drag on the kanban's draggable wrapper (mirrors ApplicationActions).
export function ApplicationCardInteractive({
  application: a,
  timezone,
  variant,
  className,
  onStageOptimistic,
}: ApplicationCardInteractiveProps) {
  const [editing, setEditing] = useState(false);

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
