// Outbound calendar feed (Apple/Google/Outlook subscription).
// Uses ical-generator to produce a strict-compliant .ics file.
// Per CLAUDE.md §8.

import ical from 'ical-generator';

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

  // Assignments → 1-hour blocks ending at due_at, with deep-link to the app.
  for (const a of args.assignments) {
    const due = new Date(a.due_at);
    const start = new Date(due.getTime() - 60 * 60 * 1000); // due_at - 1h
    cal.createEvent({
      id: `assignment-${a.id}`,
      start,
      end: due,
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
      start: at,
      end: new Date(at.getTime() + 30 * 60 * 1000), // 30 min default block
      summary: `[${app.company}] ${app.next_action ?? app.role}`,
      description: `${app.role}\nstage: ${app.stage}`,
      url: `${args.appUrl}/applications`,
    });
  }

  return cal.toString();
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
