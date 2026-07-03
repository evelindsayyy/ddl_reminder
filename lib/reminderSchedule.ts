// Pure reminder-timing math, extracted from `scheduleAssignmentReminders`
// (lib/reminders.ts) so the part that — if wrong — silently misses a deadline
// is unit-testable in isolation, without pulling QStash/Supabase into the test.
//
// Per CLAUDE.md §6: for each configured offset, fire_at = due_at - offset_hours;
// any fire_at already in the past is skipped (e.g. adding "due tomorrow" drops
// the 1-week reminder).

export interface PlannedReminder {
  /** The `reminder_offsets_hours` entry this reminder came from. */
  offsetHours: number;
  /** Absolute fire instant in epoch milliseconds. */
  fireAtMs: number;
  /** Same instant as an ISO-8601 UTC string, for the `reminders.fire_at` column. */
  fireAtIso: string;
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
  const dueMs = new Date(dueAtIso).getTime();
  if (Number.isNaN(dueMs)) return [];

  const planned: PlannedReminder[] = [];
  for (const offsetHours of offsetsHours) {
    const fireAtMs = dueMs - offsetHours * 60 * 60 * 1000;
    if (fireAtMs <= nowMs) continue; // skip offsets whose fire time has passed
    planned.push({
      offsetHours,
      fireAtMs,
      fireAtIso: new Date(fireAtMs).toISOString(),
    });
  }
  return planned;
}
