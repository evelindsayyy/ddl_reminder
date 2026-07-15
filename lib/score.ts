// Urgency score for ordering assignments within a dashboard bucket.
// Pure function. Higher = more urgent / show first.
//
// Heuristic (intentionally simple, per CLAUDE.md §10 Day 11 — "keep simple,
// tune later"):
//   - Closer due dates get more points.
//   - Heavier estimated_hours items get more points (so "5h essay" outranks
//     "30m quiz" on the same day).
//   - Overdue items get a strong boost so they sort to the top.

export interface Scoreable {
  due_at: string; // ISO UTC
  estimated_hours: number | null;
  completed_at: string | null;
}

export interface ScoreOptions {
  now?: Date;
}

export function urgencyScore(row: Scoreable, options: ScoreOptions = {}): number {
  if (row.completed_at) return -Infinity; // sort completed to the bottom
  const now = options.now ?? new Date();
  const due = new Date(row.due_at).getTime();
  const hoursUntilDue = (due - now.getTime()) / (60 * 60 * 1000);

  // Time component: maxes out at ~100 when due now, decays to ~10 over a week.
  let timeScore: number;
  if (hoursUntilDue < 0) timeScore = 100 + Math.min(50, -hoursUntilDue); // overdue boost
  else if (hoursUntilDue < 12) timeScore = 100;
  else if (hoursUntilDue < 24) timeScore = 80;
  else if (hoursUntilDue < 72) timeScore = 60;
  else if (hoursUntilDue < 7 * 24) timeScore = 40;
  else timeScore = Math.max(10, 30 - hoursUntilDue / 24);

  // Effort component: 0..15 based on estimated hours, capped at 5h.
  const hours = row.estimated_hours ?? 0;
  const effortScore = Math.min(15, hours * 3);

  return timeScore + effortScore;
}

/**
 * Comparator for Array.prototype.sort that puts the most urgent first.
 */
export function compareUrgency<T extends Scoreable>(now?: Date): (a: T, b: T) => number {
  const ref = now ?? new Date();
  return (a, b) => urgencyScore(b, { now: ref }) - urgencyScore(a, { now: ref });
}

/**
 * Spec wording: "sort by due_at asc, then estimated_hours desc". Use this
 * for in-bucket ordering on the dashboard so the cheapest reading task on
 * Friday doesn't outrank the heavy essay due same Friday.
 */
export function compareDueThenEffort<
  T extends { due_at: string; estimated_hours: number | null }
>(): (a: T, b: T) => number {
  return (a, b) => {
    const dueDiff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    if (dueDiff !== 0) return dueDiff;
    return (b.estimated_hours ?? 0) - (a.estimated_hours ?? 0);
  };
}
