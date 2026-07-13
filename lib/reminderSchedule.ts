// Pure reminder-timing math, extracted from `scheduleAssignmentReminders`
// (lib/reminders.ts) so the part that — if wrong — silently misses a deadline
// is unit-testable in isolation, without pulling QStash/Supabase into the test.
//
// Per CLAUDE.md §6: for each configured offset, fire_at = due_at - offset_hours;
// any fire_at already in the past is skipped (e.g. adding "due tomorrow" drops
// the 1-week reminder).

const MS_PER_HOUR = 60 * 60 * 1000;

export interface PlannedReminder {
  /** The `reminder_offsets_hours` entry this reminder came from. */
  offsetHours: number;
  /** Absolute fire instant in epoch milliseconds. */
  fireAtMs: number;
  /** Same instant as an ISO-8601 UTC string, for the `reminders.fire_at` column. */
  fireAtIso: string;
}

/**
 * Absolute fire instant (epoch ms) for one reminder: `anchor − offsetHours`.
 * `anchorIso` is the assignment's `due_at` or the application's
 * `next_action_at` (both stored UTC). Returns `NaN` for an unparseable
 * anchor — callers guard.
 */
export function reminderFireAtMs(anchorIso: string, offsetHours: number): number {
  return new Date(anchorIso).getTime() - offsetHours * MS_PER_HOUR;
}

/**
 * The same fire instant as an ISO-8601 UTC string, or `null` when the anchor
 * is unparseable (so callers never reach `new Date(NaN).toISOString()`, which
 * throws).
 *
 * This is the single source of truth for the `reminders.fire_at` value: the
 * scheduler writes it (via `computeReminderFireTimes`) and the reminder webhook
 * recomputes it to target the exact row it just delivered
 * (`.eq('fire_at', …)`). Those two must agree byte-for-byte or the webhook's
 * "mark sent" silently matches nothing and the sweeper resends — so both go
 * through this helper.
 */
export function reminderFireAtIso(anchorIso: string, offsetHours: number): string | null {
  const ms = reminderFireAtMs(anchorIso, offsetHours);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Compute the set of reminder fire-times to schedule for one assignment.
 *
 * Faithful to the original inline logic, with one hardening: an unparseable
 * `dueAtIso` yields `NaN`, which would slip past the `<= now` skip check and
 * then throw in `new Date(NaN).toISOString()`. We treat a bad date as "nothing
 * schedulable" and return `[]` rather than crash the create/update flow.
 *
 * The math is pure epoch-ms arithmetic on an already-UTC instant, so it is
 * DST-agnostic (the timezone work happens earlier, at parse time — §5).
 *
 * @param dueAtIso  the assignment's `due_at` as an ISO string (stored UTC)
 * @param offsetsHours  `user_prefs.reminder_offsets_hours` (e.g. [168, 48, 12])
 * @param nowMs  the reference "now" in epoch ms (pass `Date.now()`)
 * @returns planned reminders in input-offset order, past ones omitted
 */
export function computeReminderFireTimes(
  dueAtIso: string,
  offsetsHours: number[],
  nowMs: number
): PlannedReminder[] {
  if (Number.isNaN(new Date(dueAtIso).getTime())) return [];

  const planned: PlannedReminder[] = [];
  for (const offsetHours of offsetsHours) {
    const fireAtMs = reminderFireAtMs(dueAtIso, offsetHours);
    if (fireAtMs <= nowMs) continue; // skip offsets whose fire time has passed
    planned.push({
      offsetHours,
      fireAtMs,
      fireAtIso: new Date(fireAtMs).toISOString(),
    });
  }
  return planned;
}
