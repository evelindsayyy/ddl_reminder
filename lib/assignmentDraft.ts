// Field-assembly + validation for the detailed add-deadline form.
//
// The detailed form collects labeled fields (course, title, type, separate
// date + time, repeats, until, notes, tags, estimated hours) and must POST the
// SAME payload shape QuickAdd sends to /api/assignments. This pure helper does
// that assembly: it validates the two required things (a title and a due
// date+time), derives the recurrence from the repeats choice, and returns
// either a wire-ready payload or a map of inline field errors. Kept pure (no
// React, no fetch) so it is unit-tested off the tsx chain and the round-trip
// against createAssignmentSchema is asserted there.
//
// dueAt is the picked wall time read in the USER'S CONFIGURED timezone pref
// (wallTimeToIsoInZone), not the browser's zone — matching how /api/parse
// resolves QuickAdd's wall times, so the two tabs save the same instant even
// when the browser sits in a different zone than the pref.

import { wallTimeToIsoInZone } from './datetime';
import { ASSIGNMENT_TYPES } from './schemas';

export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export type RepeatMode = 'never' | 'weekly' | 'biweekly';

// The wire payload — mirrors the object QuickAdd POSTs to /api/assignments
// (courseCode/title/type/dueAt/tags always present; recurrence/notes/
// estimatedHours only when the user supplied them). A structural subset of
// createAssignmentSchema's input.
export interface CreateAssignmentPayload {
  courseCode: string | null;
  title: string;
  type: AssignmentType;
  dueAt: string;
  tags: string[];
  recurrence?: { interval: 1 | 2; byweekday: number[]; until: string | null };
  notes?: string;
  estimatedHours?: number;
}

export interface BuildAssignmentDraftInput {
  courseCode: string;
  title: string;
  type: AssignmentType;
  date: string;
  time: string;
  repeats: RepeatMode;
  /** IANA zone the date+time wall time is read in (the user's timezone pref). */
  timezone: string;
  until?: string;
  notes?: string;
  tags?: string[];
  estimatedHours?: number | null;
}

export type BuildAssignmentDraftResult =
  | { ok: true; payload: CreateAssignmentPayload }
  | { ok: false; errors: Record<string, string> };

const TITLE_REQUIRED = 'Give it a title.';
const DUE_REQUIRED = 'Pick a due date and time.';
const DUE_INVALID = "That date and time didn't read — try again.";
// Mirrors createAssignmentSchema's estimatedHours bounds so an out-of-range
// value gets an inline field error instead of a generic save-failed toast.
const HOURS_RANGE = 'Estimated hours must be between 0 and 999.';

// Local weekday (0=Sun..6=Sat) of the picked date. Noon avoids DST edges; the
// value is the local weekday of the calendar day the user chose (matches the
// parser's byweekday convention and QuickAdd's weekdayInTz).
function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

export function buildAssignmentDraft(input: BuildAssignmentDraftInput): BuildAssignmentDraftResult {
  const errors: Record<string, string> = {};

  const title = input.title.trim();
  if (!title) errors.title = TITLE_REQUIRED;

  // Both parts are required; assemble the combined datetime-local string only
  // when both are present so a partial pick reports the same "due" error.
  const date = input.date.trim();
  const time = input.time.trim();
  let dueAt: string | null = null;
  if (!date || !time) {
    errors.due = DUE_REQUIRED;
  } else {
    dueAt = wallTimeToIsoInZone(date, time, input.timezone);
    if (!dueAt) errors.due = DUE_INVALID;
  }

  const estimatedHours =
    typeof input.estimatedHours === 'number' && !Number.isNaN(input.estimatedHours)
      ? input.estimatedHours
      : null;
  if (estimatedHours !== null && (estimatedHours < 0 || estimatedHours > 999)) {
    errors.estimatedHours = HOURS_RANGE;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const courseCode = input.courseCode.trim() || null;
  const notes = input.notes?.trim();

  const payload: CreateAssignmentPayload = {
    courseCode,
    title,
    type: input.type,
    // dueAt is non-null here: the only path that leaves it null pushed a `due`
    // error above and returned early.
    dueAt: dueAt as string,
    tags: input.tags ?? [],
    ...(input.repeats !== 'never'
      ? {
          recurrence: {
            interval: input.repeats === 'biweekly' ? (2 as const) : (1 as const),
            byweekday: [weekdayOf(date)],
            until: input.until && input.until.trim() ? input.until.trim() : null,
          },
        }
      : {}),
    ...(notes ? { notes } : {}),
    ...(estimatedHours !== null ? { estimatedHours } : {}),
  };

  return { ok: true, payload };
}
