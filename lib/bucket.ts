// Pure bucketing for the dashboard. No I/O, no React.
//
// Buckets, in display order on the dashboard:
//   overdue   — due_at < now AND completed_at IS NULL
//   today     — due_at within today (user's calendar day in IANA tz)
//   thisWeek  — due_at within next 7 calendar days, EXCLUDING today
//   later     — due_at > 7 days out
//
// "Today" is defined by the user's timezone, not the server's UTC clock.

import { toZonedTime } from 'date-fns-tz';

export interface Bucketable {
  id: string;
  due_at: string; // ISO UTC
  completed_at: string | null;
}

export interface Buckets<T> {
  overdue: T[];
  today: T[];
  thisWeek: T[];
  later: T[];
}

export interface BucketOptions {
  now?: Date;
  timezone: string;
  // If true, completed items are excluded entirely. The dashboard always
  // wants this; the assignments list passes false to keep done rows visible.
  excludeCompleted?: boolean;
}

/**
 * Returns the calendar day (year, month, day) of `instant` rendered in `tz`.
 * Used to compare two instants for "same day" without TZ surprises.
 */
function calendarDayInZone(instant: Date, tz: string): { y: number; m: number; d: number } {
  const z = toZonedTime(instant, tz);
  return { y: z.getFullYear(), m: z.getMonth(), d: z.getDate() };
}

function isSameDay(a: Date, b: Date, tz: string): boolean {
  const ca = calendarDayInZone(a, tz);
  const cb = calendarDayInZone(b, tz);
  return ca.y === cb.y && ca.m === cb.m && ca.d === cb.d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function bucketAssignments<T extends Bucketable>(
  rows: readonly T[],
  options: BucketOptions
): Buckets<T> {
  const now = options.now ?? new Date();
  const tz = options.timezone;
  const out: Buckets<T> = { overdue: [], today: [], thisWeek: [], later: [] };

  for (const row of rows) {
    if (options.excludeCompleted && row.completed_at) continue;

    const due = new Date(row.due_at);
    const overdue = !row.completed_at && due.getTime() < now.getTime();

    if (overdue) {
      out.overdue.push(row);
      continue;
    }
    if (isSameDay(due, now, tz)) {
      out.today.push(row);
      continue;
    }
    if (due.getTime() <= now.getTime() + 7 * DAY_MS) {
      out.thisWeek.push(row);
      continue;
    }
    out.later.push(row);
  }

  return out;
}
