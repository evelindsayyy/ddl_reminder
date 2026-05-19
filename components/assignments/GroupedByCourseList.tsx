'use client';

import { useMemo } from 'react';
import {
  AssignmentCard,
  type AssignmentCardData,
} from '@/components/dashboard/AssignmentCard';
import { CourseChip } from '@/components/ui/CourseChip';

export interface GroupedByCourseListProps {
  assignments: AssignmentCardData[];
  timezone: string;
  onToggleDone: (id: string, completedAt: string | null) => void;
  onEdit: (id: string, patch: { title: string; dueAt: string }) => void;
  onDelete: (id: string, scope: 'one' | 'series') => void;
}

interface Group {
  key: string; // course code or '__none__'
  course: { code: string; name: string | null; color: string } | null;
  open: AssignmentCardData[];
  done: AssignmentCardData[];
}

export function GroupedByCourseList({
  assignments,
  timezone,
  onToggleDone,
  onEdit,
  onDelete,
}: GroupedByCourseListProps) {
  const groups = useMemo(() => groupByCourse(assignments), [assignments]);

  if (groups.length === 0) {
    return (
      <p className="py-8 text-center font-display text-2xl font-semibold text-ink-faint">
        nothing here yet — add a deadline above
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key}>
          <header className="mb-2 flex items-center gap-3">
            {g.course ? (
              <CourseChip code={g.course.code} color={g.course.color} size="lg" />
            ) : (
              <span className="rounded-sm border border-dashed border-ink-faint px-2 py-1 font-mono text-xs text-ink-soft">
                no course
              </span>
            )}
            <span className="font-mono text-[11px] text-ink-faint">
              {g.open.length} open
            </span>
            <div className="flex-1 border-t border-dashed border-ink-faint/50" />
          </header>

          {g.open.length === 0 && g.done.length === 0 ? (
            <p className="px-1 font-display text-base text-ink-faint">no items</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {g.open.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  timezone={timezone}
                  density="compact"
                  inline
                  onToggleDone={onToggleDone}
                  onEdit={(patch) => onEdit(a.id, patch)}
                  onDelete={(scope) => onDelete(a.id, scope)}
                />
              ))}
              {g.done.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  timezone={timezone}
                  density="compact"
                  inline
                  onToggleDone={onToggleDone}
                  onEdit={(patch) => onEdit(a.id, patch)}
                  onDelete={(scope) => onDelete(a.id, scope)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function groupByCourse(rows: AssignmentCardData[]): Group[] {
  const map = new Map<string, Group>();
  for (const a of rows) {
    const key = a.courses?.code ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        key,
        course: a.courses,
        open: [],
        done: [],
      });
    }
    const g = map.get(key)!;
    if (a.completed_at) g.done.push(a);
    else g.open.push(a);
  }
  // Sort open ascending by due_at, done at the bottom
  for (const g of map.values()) {
    g.open.sort((x, y) => new Date(x.due_at).getTime() - new Date(y.due_at).getTime());
    g.done.sort((x, y) => new Date(y.due_at).getTime() - new Date(x.due_at).getTime());
  }
  // Course groups sorted by code; "no course" group last
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === '__none__') return 1;
    if (b.key === '__none__') return -1;
    return a.key.localeCompare(b.key);
  });
}
