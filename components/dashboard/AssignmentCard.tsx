'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { formatDueAt, formatRelative } from '@/lib/format';
import { CourseChip } from '@/components/ui/CourseChip';
import { TypePill } from '@/components/ui/TypePill';

// Reused by dashboard buckets and by the grouped/list views. Kept here in
// `dashboard/` per HANDOFF.md "Files to touch", since dashboard owns it.
export interface AssignmentCardData {
  id: string;
  title: string;
  type: string;
  due_at: string; // ISO UTC
  completed_at: string | null;
  notes: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  course_id: string | null;
  recurrence_group_id: string | null;
  source: string | null;
  external_url: string | null;
  courses: { code: string; name: string | null; color: string } | null;
}

export interface AssignmentCardProps {
  assignment: AssignmentCardData;
  timezone: string;
  density?: 'compact' | 'comfortable';
  onToggleDone: (id: string, completedAt: string | null) => void;
  onEdit?: (patch: { title: string; dueAt: string }) => void;
  onDelete?: (scope: 'one' | 'series') => void;
  // When true (calendar/list rows where the row IS the action), tile is denser.
  inline?: boolean;
  // When true, the card shrinks + fades out over 200ms — used by the dashboard
  // mid-mark-done before the row is filtered out of the list entirely.
  fading?: boolean;
}

const URGENCY_RED_HOURS = 12;

export function AssignmentCard({
  assignment: a,
  timezone,
  density = 'comfortable',
  onToggleDone,
  onEdit,
  onDelete,
  inline = false,
  fading = false,
}: AssignmentCardProps) {
  const [editing, setEditing] = useState(false);
  const isDone = a.completed_at !== null;
  const due = new Date(a.due_at).getTime();
  const hoursUntilDue = (due - Date.now()) / (60 * 60 * 1000);
  const overdue = !isDone && hoursUntilDue < 0;
  const urgentSoon = !isDone && hoursUntilDue >= 0 && hoursUntilDue < URGENCY_RED_HOURS;
  const inSeries = a.recurrence_group_id !== null;
  const imported = a.source === 'canvas' || a.source === 'gradescope';

  const padding = density === 'compact' ? 'p-2' : 'p-3';

  if (editing && onEdit) {
    return (
      <li className={cn('rounded border border-ink bg-bg', padding)}>
        <EditForm
          a={a}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            onEdit(patch);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  function handleToggle() {
    onToggleDone(a.id, isDone ? null : new Date().toISOString());
  }

  return (
    <li
      data-fading={fading || undefined}
      className={cn(
        'group flex items-start gap-3 rounded border transition-all duration-200 ease-out',
        padding,
        isDone
          ? 'border-ink-faint/40 bg-bg-soft text-ink-soft'
          : 'border-ink-faint/40 bg-bg hover:border-ink-faint',
        inline && 'rounded-none border-x-0 border-t-0',
        fading && 'pointer-events-none -my-px max-h-0 overflow-hidden border-transparent !p-0 opacity-0'
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? 'Mark undone' : 'Mark done'}
        onClick={handleToggle}
        className={cn(
          'mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border transition-colors duration-150',
          isDone
            ? 'border-success bg-success text-bg'
            : 'border-ink-faint hover:border-ink'
        )}
      >
        {isDone ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2.5 6.2 5 8.7 9.8 3.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {a.courses ? (
            <CourseChip
              code={a.courses.code}
              color={a.courses.color}
              size="sm"
              title={a.courses.name ?? undefined}
            />
          ) : null}
          <TypePill type={a.type as Parameters<typeof TypePill>[0]['type']} />
          {inSeries ? (
            <span
              title="Part of a recurring series"
              className="rounded-sm bg-bg-dim px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft"
            >
              series
            </span>
          ) : null}
          {imported ? (
            <span
              title={`Synced from ${a.source}`}
              className="rounded-sm bg-info/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-info"
            >
              {a.source}
            </span>
          ) : null}
        </div>

        <div
          className={cn(
            'mt-1 text-sm leading-snug',
            isDone ? 'text-ink-soft line-through' : 'text-ink'
          )}
        >
          {a.external_url ? (
            <a
              href={a.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {a.title}
            </a>
          ) : (
            a.title
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span
            className={cn(
              'font-mono',
              overdue || urgentSoon ? 'font-medium text-urgent' : 'text-ink-soft'
            )}
          >
            {formatDueAt(a.due_at, timezone)}
          </span>
          <span className={cn('font-mono', overdue ? 'text-urgent' : 'text-ink-faint')}>
            · {formatRelative(a.due_at)}
          </span>
          {a.estimated_hours ? (
            <span className="font-mono text-ink-faint">· ~{a.estimated_hours}h</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        {onEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit"
            className="rounded p-1 text-ink-faint hover:bg-bg-dim hover:text-ink"
          >
            <PencilIcon />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete('one')}
            aria-label="Delete"
            title="Delete this one"
            className="rounded p-1 text-ink-faint hover:bg-urgent/10 hover:text-urgent"
          >
            <TrashIcon />
          </button>
        ) : null}
        {inSeries && onDelete ? (
          <button
            type="button"
            onClick={() => onDelete('series')}
            title="Delete the rest of this recurring series"
            className="rounded border border-ink-faint/60 px-1.5 py-0.5 text-[10px] font-mono text-ink-soft hover:border-urgent hover:text-urgent"
          >
            series
          </button>
        ) : null}
      </div>
    </li>
  );
}

// --- inline edit form ---

function EditForm({
  a,
  onCancel,
  onSave,
}: {
  a: AssignmentCardData;
  onCancel: () => void;
  onSave: (patch: { title: string; dueAt: string }) => void;
}) {
  const [title, setTitle] = useState(a.title);
  const [localDt, setLocalDt] = useState(() => {
    const d = new Date(a.due_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    const utc = new Date(localDt).toISOString();
    onSave({ title: title.trim(), dueAt: utc });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="flex-1 min-w-[10rem] rounded border border-ink-faint px-2 py-1 text-sm focus:border-ink focus:outline-none"
      />
      <input
        type="datetime-local"
        value={localDt}
        onChange={(e) => setLocalDt(e.target.value)}
        className="rounded border border-ink-faint px-2 py-1 text-sm font-mono focus:border-ink focus:outline-none"
      />
      <button
        type="submit"
        className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:bg-ink-soft"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-ink-faint px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
      >
        Cancel
      </button>
    </form>
  );
}

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
