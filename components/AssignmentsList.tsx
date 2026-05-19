'use client';

// Legacy flat-list view. The new design routes through
// `<AssignmentsView/>` (which owns the list/calendar toggle and grouping).
// This component is kept around so any direct importer continues to work
// and so the look matches the rest of the app via `<AssignmentCard/>`.

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AssignmentCard,
  type AssignmentCardData,
} from '@/components/dashboard/AssignmentCard';

export type AssignmentRow = AssignmentCardData;

interface Props {
  assignments: AssignmentRow[];
  timezone: string;
}

interface ToggleAction {
  id: string;
  completedAt: string | null;
}

export default function AssignmentsList({ assignments, timezone }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic<AssignmentRow[], ToggleAction>(
    assignments,
    (state, action) =>
      state.map((a) => (a.id === action.id ? { ...a, completed_at: action.completedAt } : a))
  );

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
    } catch {
      router.refresh();
    }
  }

  async function onEdit(id: string, patch: { title: string; dueAt: string }) {
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
      alert(err instanceof Error ? err.message : 'save failed');
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
    } catch {
      router.refresh();
    }
  }

  const open = optimistic.filter((a) => !a.completed_at);
  const done = optimistic.filter((a) => a.completed_at);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-display text-xl text-ink-soft">open · {open.length}</h2>
        {open.length === 0 ? (
          <p className="font-display text-lg text-ink-faint">nothing open — add something above</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {open.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                timezone={timezone}
                onToggleDone={onToggleDone}
                onEdit={(patch) => onEdit(a.id, patch)}
                onDelete={(scope) => onDelete(a.id, scope)}
              />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-xl text-ink-soft">done · {done.length}</h2>
          <ul className="flex flex-col gap-1">
            {done.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                timezone={timezone}
                onToggleDone={onToggleDone}
                onEdit={(patch) => onEdit(a.id, patch)}
                onDelete={(scope) => onDelete(a.id, scope)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
