import { parseAssignment } from './index';

// Today is Thursday, April 23, 2026 per the current session context.
const REF = new Date('2026-04-23T10:00:00-04:00');
const TZ = 'America/New_York';

const cases = [
  'STA 240 HW5 due Friday 11:59pm',
  'COMPSCI 210D lab 6 due tomorrow',
  'ENGLISH 208S Dark Knight paper due May 1',
  'WRITING 120 podcast analysis due next Wednesday',
  'STA 199 final exam May 5',                       // exam → 9am default
  'Cisco interview Thursday 2pm',                   // no course code
  'Read ch 7 of Dracula by Sunday',
  'HW due fri',                                     // sloppy
  'project presentation next monday 3pm #group',    // tag + time
  'groceries',                                      // no date
  'project due Dec 15 11:59pm',                     // DST edge: EST in Dec, not EDT
  // --- recurrence ---
  'COMPSCI 372 homework every Tuesday 11:59pm',     // weekly single-day
  'STA 210 pset every other Wednesday 23:59',       // biweekly single-day
  'Spanish 101 reflection every MWF',               // multi-day compound
  'weekly reading Sunday 9pm',                      // "weekly" keyword
  'COMPSCI 210 lab every Tue and Thu 11:59pm',      // multi-day with "and"
];

for (const c of cases) {
  const r = parseAssignment(c, { referenceDate: REF, timezone: TZ });
  console.log('IN :', c);
  console.log('OUT:', {
    course: r.courseCode,
    title: r.title,
    type:  r.type,
    dueUTC: r.dueAt?.toISOString(),
    dueDurham: r.dueAt?.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    tags:  r.tags,
    rec:   r.recurrence,
    conf:  r.confidence.toFixed(2),
  });
  console.log('---');
}
