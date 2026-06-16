// Assertion-based unit tests for lib/ics.ts (outbound calendar feed).
// Run: npx tsx lib/ics.test.ts   (exits non-zero on any failure)
//
// buildIcs is pure (ical-generator, no I/O) but the library owns the exact
// output, so we assert on stable structure, not full-string equality. Notable
// behaviors pinned here: assignments → due-1h..due blocks, applications →
// 30-min blocks but ONLY when next_action_at is set, course-scoped summaries,
// deep-link URL fallbacks, and timezone conversion of DTSTART/DTEND. DTSTAMP
// is the current time, so it's never asserted.

import { buildIcs, type IcsAssignmentRow, type IcsApplicationRow } from './ics';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function has(name: string, haystack: string, needle: string): void {
  check(name, haystack.includes(needle), `missing: ${needle}`);
}
function lacks(name: string, haystack: string, needle: string): void {
  check(name, !haystack.includes(needle), `unexpectedly present: ${needle}`);
}
// RFC5545 unfolding — long lines (e.g. DESCRIPTION) wrap with a leading space.
const unfold = (s: string): string => s.replace(/\r?\n[ \t]/g, '');
const countEvents = (s: string): number => (s.match(/BEGIN:VEVENT/g) ?? []).length;

const assignment = (over: Partial<IcsAssignmentRow> = {}): IcsAssignmentRow => ({
  id: 'a1',
  title: 'HW5',
  type: 'homework',
  due_at: '2026-04-28T23:59:00.000Z',
  completed_at: null,
  notes: null,
  external_url: null,
  courses: { code: 'STA 240' },
  ...over,
});
const application = (over: Partial<IcsApplicationRow> = {}): IcsApplicationRow => ({
  id: 'p1',
  company: 'Cisco',
  role: 'SWE Intern',
  stage: 'interview',
  next_action: 'thank-you email',
  next_action_at: '2026-04-30T18:00:00.000Z',
  ...over,
});

// ================= main fixture (NY timezone) =================

const out = buildIcs({
  calendarName: 'My Deadlines',
  appUrl: 'https://ddl.example.com',
  timezone: 'America/New_York',
  assignments: [
    assignment({ id: 'a1', notes: 'do the hard one', courses: { code: 'STA 240' } }),
    assignment({
      id: 'a2',
      title: 'Read ch 7',
      type: 'reading',
      due_at: '2026-05-01T12:00:00.000Z',
      notes: null,
      external_url: 'https://canvas.duke.edu/x',
      courses: null,
    }),
  ],
  applications: [
    application({ id: 'p1' }),
    application({ id: 'p2', company: 'NoAction', role: 'PM', next_action: null, next_action_at: null }),
    application({ id: 'p3', company: 'Stripe', role: 'Backend Intern', next_action: null,
      next_action_at: '2026-05-02T15:00:00.000Z' }),
  ],
});
const u = unfold(out);

// ---- calendar envelope ----
has('envelope: VCALENDAR open', out, 'BEGIN:VCALENDAR');
has('envelope: VCALENDAR close', out, 'END:VCALENDAR');
has('envelope: calendar name', out, 'X-WR-CALNAME:My Deadlines');
has('envelope: prodId', out, 'PRODID:-//Deadline Tracker//ddl//EN');

// ---- event count: 2 assignments + 2 apps with next_action_at (p1, p3); p2 skipped ----
check('count: 4 VEVENTs (p2 has no next_action_at → skipped)', countEvents(out) === 4,
  `got ${countEvents(out)}`);
has('uid: assignment-a1', out, 'UID:assignment-a1');
has('uid: assignment-a2', out, 'UID:assignment-a2');
has('uid: application-p1', out, 'UID:application-p1');
has('uid: application-p3', out, 'UID:application-p3');
lacks('uid: application-p2 absent (no next_action_at)', out, 'application-p2');

// ---- summaries ----
has('summary: course-scoped assignment', out, 'SUMMARY:[STA 240] HW5');
has('summary: bare title when no course', out, 'SUMMARY:Read ch 7');
has('summary: application uses next_action', out, 'SUMMARY:[Cisco] thank-you email');
has('summary: application falls back to role when next_action null', out, 'SUMMARY:[Stripe] Backend Intern');

// ---- DTSTART/DTEND: timezone-converted (NY = EDT -4), assignment = due-1h ----
has('a1: DTEND = due in NY (23:59Z → 19:59)', out, 'DTEND:20260428T195900');
has('a1: DTSTART = due-1h (18:59)', out, 'DTSTART:20260428T185900');
has('a2: DTEND (12:00Z → 08:00)', out, 'DTEND:20260501T080000');
has('a2: DTSTART = due-1h (07:00)', out, 'DTSTART:20260501T070000');
// ---- application = 30-min block ----
has('p1: DTSTART (18:00Z → 14:00)', out, 'DTSTART:20260430T140000');
has('p1: DTEND = +30min (14:30)', out, 'DTEND:20260430T143000');

// ---- URLs (deep-link fallbacks) ----
has('url: a1 falls back to app assignments page', out, 'URL;VALUE=URI:https://ddl.example.com/assignments');
has('url: a2 uses external_url', out, 'URL;VALUE=URI:https://canvas.duke.edu/x');
has('url: application points at applications page', out, 'URL;VALUE=URI:https://ddl.example.com/applications');

// ---- descriptions (assert on unfolded text) ----
has('desc: a1 includes type', u, 'type: homework');
has('desc: a1 includes notes', u, 'do the hard one');
has('desc: a1 includes open-in-app link', u, 'Open in app: https://ddl.example.com/assignments');
has('desc: a2 includes type', u, 'type: reading');
has('desc: application includes role + stage', u, 'SWE Intern');
has('desc: application includes stage line', u, 'stage: interview');

// ================= timezone conversion cross-check (UTC) =================

{
  const utc = buildIcs({
    calendarName: 'UTC Cal',
    appUrl: 'https://x.test',
    timezone: 'UTC',
    assignments: [assignment({ id: 'z', due_at: '2026-04-28T23:59:00.000Z' })],
    applications: [],
  });
  has('utc: DTEND has no offset applied', utc, 'DTEND:20260428T235900');
  has('utc: DTSTART = due-1h in UTC', utc, 'DTSTART:20260428T225900');
}

// ================= empty feed =================

{
  const empty = buildIcs({
    calendarName: 'Empty',
    appUrl: 'https://x.test',
    timezone: 'America/New_York',
    assignments: [],
    applications: [],
  });
  has('empty: still a valid calendar', empty, 'BEGIN:VCALENDAR');
  check('empty: zero events', countEvents(empty) === 0, `got ${countEvents(empty)}`);
}

console.log(`\nics.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
