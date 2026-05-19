'use client';

import { useMemo, useState } from 'react';
import { toZonedTime } from 'date-fns-tz';
import { cn } from '@/lib/utils';
import type { AssignmentCardData } from '@/components/dashboard/AssignmentCard';
import { AssignmentCard } from '@/components/dashboard/AssignmentCard';

export interface CalendarMonthViewProps {
  assignments: AssignmentCardData[];
  timezone: string;
  onToggleDone: (id: string, completedAt: string | null) => void;
  onEdit: (id: string, patch: { title: string; dueAt: string }) => void;
  onDelete: (id: string, scope: 'one' | 'series') => void;
}

interface DayCell {
  ymd: string; // YYYY-MM-DD
  date: number;
  monthOffset: -1 | 0 | 1; // -1 prev, 0 current, 1 next
  items: AssignmentCardData[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarMonthView({
  assignments,
  timezone,
  onToggleDone,
  onEdit,
  onDelete,
}: CalendarMonthViewProps) {
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const today = toZonedTime(new Date(), timezone);
    return { y: today.getFullYear(), m: today.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(
    () => buildMonthGrid(cursor.y, cursor.m, assignments, timezone),
    [cursor, assignments, timezone]
  );

  const todayYmd = useMemo(() => ymd(toZonedTime(new Date(), timezone)), [timezone]);

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const n = new Date(c.y, c.m + delta, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });
    setSelected(null);
  }

  function gotoToday() {
    const t = toZonedTime(new Date(), timezone);
    setCursor({ y: t.getFullYear(), m: t.getMonth() });
    setSelected(null);
  }

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const selectedDay = selected ? grid.find((c) => c.ymd === selected) ?? null : null;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold leading-none">{monthLabel}</h2>
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="rounded border border-ink-faint/60 px-2 py-1 hover:border-ink"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={gotoToday}
            className="rounded border border-ink-faint/60 px-2 py-1 hover:border-ink"
          >
            today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="rounded border border-ink-faint/60 px-2 py-1 hover:border-ink"
          >
            ›
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 overflow-hidden rounded border border-ink-faint/60">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="border-b border-ink-faint/40 bg-bg-dim/60 px-2 py-1 font-mono text-[10px] uppercase text-ink-soft"
          >
            {d}
          </div>
        ))}
        {grid.map((cell) => {
          const isToday = cell.ymd === todayYmd;
          const muted = cell.monthOffset !== 0;
          return (
            <button
              type="button"
              key={cell.ymd}
              onClick={() => setSelected(cell.ymd)}
              aria-label={`${cell.ymd}, ${cell.items.length} items`}
              className={cn(
                'group flex min-h-[80px] flex-col items-stretch gap-1 border-b border-r border-ink-faint/30 p-1 text-left transition-colors duration-150',
                muted && 'bg-bg-soft/60 text-ink-faint',
                isToday && 'bg-urgent/5',
                selected === cell.ymd && 'ring-1 ring-ink',
                'hover:bg-bg-dim/40'
              )}
            >
              <span
                className={cn(
                  'font-mono text-xs',
                  isToday && 'font-semibold text-urgent',
                  !isToday && muted && 'text-ink-faint',
                  !isToday && !muted && 'text-ink'
                )}
              >
                {cell.date}
              </span>
              {cell.items.slice(0, 3).map((it) => (
                <span
                  key={it.id}
                  className={cn(
                    'truncate rounded-sm border-l-[3px] px-1 py-px text-[11px]',
                    it.completed_at && 'line-through opacity-60'
                  )}
                  style={{
                    borderLeftColor: it.courses?.color ?? '#a3a3a3',
                    background: (it.courses?.color ?? '#a3a3a3') + '20',
                  }}
                  title={it.title}
                >
                  {it.title}
                </span>
              ))}
              {cell.items.length > 3 ? (
                <span className="font-mono text-[10px] text-ink-soft">
                  +{cell.items.length - 3} more
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDay ? (
        <div className="rounded border border-ink-faint/60 bg-bg-soft p-3">
          <header className="mb-2 flex items-baseline justify-between">
            <h3 className="font-display text-xl leading-none">
              {new Date(selectedDay.ymd + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="font-mono text-xs text-ink-faint hover:text-ink"
            >
              ✕
            </button>
          </header>
          {selectedDay.items.length === 0 ? (
            <p className="font-display text-base text-ink-faint">nothing due this day</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {selectedDay.items.map((a) => (
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
        </div>
      ) : null}
    </div>
  );
}

// ---- helpers ----

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildMonthGrid(
  year: number,
  month: number,
  assignments: AssignmentCardData[],
  timezone: string
): DayCell[] {
  // First-of-month in user's tz, then back up to Sunday.
  const firstOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startDayOfWeek);

  // Group assignments by ymd in user's tz
  const byDay = new Map<string, AssignmentCardData[]>();
  for (const a of assignments) {
    const z = toZonedTime(new Date(a.due_at), timezone);
    const key = ymd(z);
    const list = byDay.get(key) ?? [];
    list.push(a);
    byDay.set(key, list);
  }
  for (const [, list] of byDay) {
    list.sort((x, y) => new Date(x.due_at).getTime() - new Date(y.due_at).getTime());
  }

  const cells: DayCell[] = [];
  // 6 rows × 7 cols = 42 cells covers all month layouts.
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = ymd(d);
    const monthOffset: -1 | 0 | 1 =
      d.getMonth() < month || (d.getMonth() > month && d.getFullYear() === year && month === 11 && d.getMonth() === 0)
        ? -1
        : d.getMonth() > month || (d.getMonth() < month && d.getFullYear() > year)
        ? 1
        : 0;
    cells.push({
      ymd: key,
      date: d.getDate(),
      monthOffset,
      items: byDay.get(key) ?? [],
    });
  }
  return cells;
}
