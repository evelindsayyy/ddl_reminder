'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type {
  AssignmentCardData,
  AssignmentEditPatch,
} from '@/components/dashboard/AssignmentCard';
import { GroupedByCourseList } from './GroupedByCourseList';
import { CalendarMonthView } from './CalendarMonthView';
import { SwimLaneTimeline } from './SwimLaneTimeline';
import { collectTags, filterByStatus, filterByTag } from '@/lib/assignmentFilter';
import { useToast } from '@/components/ui/Toast';
import { humanizeError } from '@/lib/errorCopy';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

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
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  // Optimistic state — shared across views.
  const [optimistic, applyOptimistic] = useOptimistic<AssignmentCardData[], ToggleAction>(
    assignments,
    (state, action) =>
      state.map((a) => (a.id === action.id ? { ...a, completed_at: action.completedAt } : a))
  );

  const [view, setView] = useState<ViewMode>(initialView);
  const filter: FilterMode = initialFilter;
  const [tag, setTag] = useState<string | null>(null);

  // Distinct tags across all (unfiltered) assignments, for the chooser.
  const availableTags = useMemo(() => collectTags(optimistic), [optimistic]);

  // A tag can disappear after a mark-done/delete refresh; drop a stale selection
  // so we don't silently show an empty list.
  const activeTag = tag && availableTags.includes(tag) ? tag : null;

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
      toast(humanizeError(err instanceof Error ? err.message : 'save_failed'));
      router.refresh();
    }
  }

  async function onEdit(
    id: string,
    patch: AssignmentEditPatch,
    scope: 'one' | 'series' = 'one'
  ) {
    try {
      const url =
        scope === 'series' ? `/api/assignments/${id}?scope=series` : `/api/assignments/${id}`;
      // Only include the optional fields when the edit form actually provided
      // them (the timeline tooltip omits them) so we never overwrite a stored
      // value with undefined.
      const body: Record<string, unknown> = { title: patch.title, dueAt: patch.dueAt };
      if (patch.actualHours !== undefined) body.actualHours = patch.actualHours;
      if (patch.estimatedHours !== undefined) body.estimatedHours = patch.estimatedHours;
      if (patch.notes !== undefined) body.notes = patch.notes;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'save_failed' }));
        throw new Error(body.error ?? `PATCH ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      toast(humanizeError(err instanceof Error ? err.message : 'save_failed'));
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
    try {
      const res = await fetch(`/api/assignments/${id}?scope=${scope}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      router.refresh();
    } catch (err) {
      toast(humanizeError(err instanceof Error ? err.message : 'delete_failed'));
      router.refresh();
    }
  }

  const visible = useMemo(
    () => filterByTag(filterByStatus(optimistic, filter), activeTag),
    [optimistic, filter, activeTag]
  );

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
          label="View mode"
          controls="assignments-view-panel"
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
            label="Filter"
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

      {view === 'list' && availableTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          <TagChip label="all" active={activeTag === null} onClick={() => setTag(null)} />
          {availableTags.map((t) => (
            <TagChip
              key={t}
              label={`#${t}`}
              active={activeTag === t}
              onClick={() => setTag(activeTag === t ? null : t)}
            />
          ))}
        </div>
      ) : null}

      <div
        id="assignments-view-panel"
        role="tabpanel"
        aria-labelledby={`assignments-view-panel-${view}`}
        tabIndex={0}
      >
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
    </div>
  );
}

interface TagChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TagChip({ label, active, onClick }: TagChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150',
        active
          ? 'border-ink bg-ink text-bg'
          : 'border-ink-faint/60 bg-bg-soft text-ink-soft hover:bg-bg-dim'
      )}
    >
      {label}
    </button>
  );
}
