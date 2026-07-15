// Outbound calendar feed (Apple/Google/Outlook subscription).
// Uses ical-generator to produce a strict-compliant .ics file.
// Per CLAUDE.md §8.

import ical, { ICalCalendarMethod } from 'ical-generator';
import { toZonedTime } from 'date-fns-tz';

// How often subscribing clients (Apple/Google/Outlook) should re-poll the feed.
// Mirrors the route's 15-min Cache-Control. Emitted three ways for broad client
// support: METHOD:PUBLISH (marks the feed as a publication), the modern
// RFC 7986 REFRESH-INTERVAL, and the legacy X-PUBLISHED-TTL fallback.
const REFRESH_INTERVAL = 'PT15M';

// ical-generator renders a Date using the *process* timezone, not the
// calendar's `timezone` option (it does no UTC→zone conversion itself). On
// Vercel the process zone is UTC, so a NY deadline at 23:59Z would otherwise
// be emitted as a floating 23:59 instead of 19:59 EDT (CLAUDE.md §5). We
// convert each UTC instant to the user's zone ourselves with date-fns-tz and
// emit it as a `floating` wall-clock time, making the feed independent of the
// server's timezone.
function zoned(instant: Date, timezone: string): Date {
  return toZonedTime(instant, timezone);
}

export interface IcsAssignmentRow {
  id: string;
  title: string;
  type: string;
  due_at: string;
  completed_at: string | null;
  notes: string | null;
  external_url: string | null;
  courses: { code: string } | null;
}

export interface IcsApplicationRow {
  id: string;
  company: string;
  role: string;
  stage: string;
  next_action: string | null;
  next_action_at: string | null;
}

export interface BuildIcsArgs {
  calendarName: string;
  appUrl: string; // for VEVENT URL deep-links
  timezone: string;
  assignments: IcsAssignmentRow[];
  applications: IcsApplicationRow[];
}

export function buildIcs(args: BuildIcsArgs): string {
  const cal = ical({
    name: args.calendarName,
    description: 'Deadlines synced from your Deadline Tracker.',
    timezone: args.timezone,
    prodId: { company: 'Deadline Tracker', product: 'ddl', language: 'EN' },
  });

  // Refresh hints so subscribers re-poll every 15 min. PUBLISH + X-PUBLISHED-TTL
  // go through ical-generator; REFRESH-INTERVAL (a non-`X-` RFC 7986 property)
  // has no first-class setter and is injected into the rendered output below.
  cal.method(ICalCalendarMethod.PUBLISH);
  cal.x([{ key: 'X-PUBLISHED-TTL', value: REFRESH_INTERVAL }]);

  // Assignments → 1-hour blocks ending at due_at, with deep-link to the app.
  for (const a of args.assignments) {
    const due = new Date(a.due_at);
    const start = new Date(due.getTime() - 60 * 60 * 1000); // due_at - 1h
    cal.createEvent({
      id: `assignment-${a.id}`,
      start: zoned(start, args.timezone),
      end: zoned(due, args.timezone),
      floating: true,
      summary: courseScopedTitle(a),
      description: descriptionFor(a, args.appUrl),
      url: a.external_url ?? `${args.appUrl}/assignments`,
    });
  }

  // Applications: only events with a `next_action_at` (otherwise nothing to schedule).
  for (const app of args.applications) {
    if (!app.next_action_at) continue;
    const at = new Date(app.next_action_at);
    cal.createEvent({
      id: `application-${app.id}`,
      start: zoned(at, args.timezone),
      end: zoned(new Date(at.getTime() + 30 * 60 * 1000), args.timezone), // 30 min default block
      floating: true,
      summary: `[${app.company}] ${app.next_action ?? app.role}`,
      description: `${app.role}\nstage: ${app.stage}`,
      url: `${args.appUrl}/applications`,
    });
  }

  // ical-generator only exposes `.x()` for `X-`-prefixed keys, so the standard
  // REFRESH-INTERVAL property is inserted as a calendar-level line right after
  // METHOD (guaranteed present since we always set PUBLISH above).
  return cal
    .toString()
    .replace(
      'METHOD:PUBLISH\r\n',
      `METHOD:PUBLISH\r\nREFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}\r\n`
    );
}

function courseScopedTitle(a: IcsAssignmentRow): string {
  const code = a.courses?.code;
  return code ? `[${code}] ${a.title}` : a.title;
}

function descriptionFor(a: IcsAssignmentRow, appUrl: string): string {
  const parts: string[] = [];
  parts.push(`type: ${a.type}`);
  if (a.notes) parts.push('', a.notes);
  parts.push('', `Open in app: ${appUrl}/assignments`);
  return parts.join('\n');
}
