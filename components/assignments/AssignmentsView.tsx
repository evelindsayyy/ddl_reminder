'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';
import { GroupedByCourseList } from './GroupedByCourseList';
import { CalendarMonthView } from './CalendarMonthView';
import { SwimLaneTimeline } from './SwimLaneTimeline';

export type ViewMode = 'list' | 'calendar' | 'timeline';
export type FilterMode = 'all' | 'open' | 'done';

interface ToggleAction {
  id: string;
  completedAt: string | null;
}

export interface AssignmentsViewProps {
  assignments: AssignmentCardData[];
  timezone: string;
  initialView: ViewMode;
  initialFilter: FilterMode;
}

export function AssignmentsView({
  assignments,
  timezone,
  initialView,
  initialFilter,
}: AssignmentsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic state — shared across views.
  const [optimistic, applyOptimistic] = useOptimistic<AssignmentCardData[], ToggleAction>(
    assignments,
    (state, action) =>
      state.map((a) => (a.id === action.id ? { ...a, completed_at: action.completedAt } : a))
  );
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>(initialView);
  const filter: FilterMode = initialFilter;

  function setUrlParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set(key, value);
    router.replace(`?${params.toString()}`);
  }

  function onSetView(v: ViewMode) {
    setView(v);
    setUrlParam('view', v);
  }

  function onSetFilter(f: FilterMode) {
    setUrlParam('filter', f);
  }

  async function onToggleDone(id: string, completedAt: string | null) {
    setError(null);
    startTransition(() => applyOptimistic({ id, completedAt }));
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedAt }),
      });
      if (!res.ok) throw new Error(`PATCH ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'mark-done failed');
      router.refresh();
    }
  }

  async function onEdit(id: string, patch: { title: string; dueAt: string }) {
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: patch.title, dueAt: patch.dueAt }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'save_failed' }));
        throw new Error(body.error ?? `PATCH ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
      router.refresh();
    }
  }

  async function onDelete(id: string, scope: 'one' | 'series') {
    const a = optimistic.find((row) => row.id === id);
    const isSeries = scope === 'series';
    const msg = isSeries
      ? 'Delete the rest of this recurring series (occurrences after now)?'
      : `Delete "${a?.title ?? 'this assignment'}"?`;
    if (!confirm(msg)) return;
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${id}?scope=${scope}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
      router.refresh();
    }
  }

  const visible = useMemo(() => {
    if (filter === 'open') return optimistic.filter((a) => !a.completed_at);
    if (filter === 'done') return optimistic.filter((a) => a.completed_at);
    return optimistic;
  }, [optimistic, filter]);

  const renderTimeline = (
    <SwimLaneTimeline assignments={optimistic} timezone={timezone} onEdit={onEdit} />
  );
  const renderList = (
    <GroupedByCourseList
      assignments={visible}
      timezone={timezone}
      onToggleDone={onToggleDone}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="View mode"
          options={[
            { value: 'list', label: 'list' },
            { value: 'calendar', label: 'calendar' },
            { value: 'timeline', label: 'timeline' },
          ]}
          value={view}
          onChange={(v) => onSetView(v as ViewMode)}
        />
        {view === 'list' ? (
          <SegmentedControl
            aria-label="Filter"
            options={[
              { value: 'all', label: 'all' },
              { value: 'open', label: 'open' },
              { value: 'done', label: 'done' },
            ]}
            value={filter}
            onChange={(v) => onSetFilter(v as FilterMode)}
          />
        ) : null}
      </div>

      {error ? (
        <p className="rounded border border-urgent/40 bg-urgent/5 p-2 text-xs text-urgent">
          {error}
        </p>
      ) : null}

      {view === 'list' ? (
        renderList
      ) : view === 'calendar' ? (
        <CalendarMonthView
          assignments={optimistic}
          timezone={timezone}
          onToggleDone={onToggleDone}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        // Timeline view: desktop-only. On <md, fall back to the list.
        <>
          <div className="hidden md:block">{renderTimeline}</div>
          <div className="md:hidden">
            {renderList}
            <p className="mt-3 font-display text-base text-ink-faint">
              ~ timeline view is desktop-only — showing list instead
            </p>
          </div>
        </>
      )}
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  'aria-label'?: string;
  className?: string;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex rounded border border-ink-faint/60 bg-bg-soft p-0.5',
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-sm px-3 py-1 text-xs transition-colors duration-150',
            value === opt.value ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-bg-dim'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
