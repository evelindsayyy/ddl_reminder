// Assertion-based unit tests for the Zod schemas in lib/schemas.ts.
// Run: npx tsx lib/schemas.test.ts   (exits non-zero on any failure)
//
// schemas.ts is the validation boundary in front of every API route and server
// action: bad lengths, wrong enum members, malformed dates/colors, and empty
// update bodies must all be rejected here before they ever touch Postgres. A
// regression that loosens one of these checks would let junk (or oversized)
// data through RLS-protected writes, so the accept/reject contract is pinned
// down explicitly below.

import {
  assignmentTypeSchema,
  parsedAssignmentSchema,
  recurrenceSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  parseInputSchema,
  createCourseSchema,
  updateCourseSchema,
  updateSettingsSchema,
  applicationStageSchema,
  createApplicationSchema,
  updateApplicationSchema,
  gradescopeAssignmentSchema,
  gradescopeSyncSchema,
} from './schemas';
import type { ZodTypeAny } from 'zod';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
// Assert a value is accepted / rejected, naming the case for failure output.
function accepts(schema: ZodTypeAny, name: string, value: unknown): void {
  const r = schema.safeParse(value);
  check(name, r.success, r.success ? '' : JSON.stringify(r.error.issues));
}
function rejects(schema: ZodTypeAny, name: string, value: unknown): void {
  check(name, !schema.safeParse(value).success, 'expected rejection');
}

const ISO = '2026-09-01T23:59:00.000Z';
const DATE = '2026-09-01';

// --- assignmentTypeSchema ---
accepts(assignmentTypeSchema, 'type homework', 'homework');
accepts(assignmentTypeSchema, 'type other', 'other');
rejects(assignmentTypeSchema, 'unknown type rejected', 'quiz');
rejects(assignmentTypeSchema, 'empty type rejected', '');

// --- parsedAssignmentSchema (dueAt nullable, confidence 0..1) ---
const parsedBase = {
  courseCode: 'STA 240',
  title: 'HW5',
  type: 'homework',
  dueAt: ISO,
  tags: ['hard'],
  confidence: 0.9,
  rawInput: 'STA 240 HW5 due Friday',
};
accepts(parsedAssignmentSchema, 'parsed base', parsedBase);
accepts(parsedAssignmentSchema, 'parsed null course + null date', {
  ...parsedBase,
  courseCode: null,
  dueAt: null,
});
rejects(parsedAssignmentSchema, 'parsed confidence > 1', { ...parsedBase, confidence: 1.5 });
rejects(parsedAssignmentSchema, 'parsed confidence < 0', { ...parsedBase, confidence: -0.1 });
rejects(parsedAssignmentSchema, 'parsed empty title', { ...parsedBase, title: '' });
rejects(parsedAssignmentSchema, 'parsed too many tags', {
  ...parsedBase,
  tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
});
rejects(parsedAssignmentSchema, 'parsed non-datetime dueAt', { ...parsedBase, dueAt: DATE });

// --- recurrenceSchema ---
accepts(recurrenceSchema, 'recurrence weekly', { interval: 1, byweekday: [1, 3] });
accepts(recurrenceSchema, 'recurrence biweekly with until', {
  interval: 2,
  byweekday: [0, 6],
  until: DATE,
});
accepts(recurrenceSchema, 'recurrence until null', { interval: 1, byweekday: [2], until: null });
rejects(recurrenceSchema, 'recurrence interval 3 rejected', { interval: 3, byweekday: [1] });
rejects(recurrenceSchema, 'recurrence empty byweekday', { interval: 1, byweekday: [] });
rejects(recurrenceSchema, 'recurrence weekday 7 out of range', { interval: 1, byweekday: [7] });
rejects(recurrenceSchema, 'recurrence non-int weekday', { interval: 1, byweekday: [1.5] });
rejects(recurrenceSchema, 'recurrence malformed until', {
  interval: 1,
  byweekday: [1],
  until: '09-01-2026',
});

// --- createAssignmentSchema (dueAt REQUIRED + datetime) ---
accepts(createAssignmentSchema, 'create minimal', {
  courseCode: null,
  title: 'Read ch 7',
  type: 'reading',
  dueAt: ISO,
});
accepts(createAssignmentSchema, 'create full', {
  courseCode: 'COMPSCI 210D',
  title: 'lab 6',
  type: 'lab',
  dueAt: ISO,
  notes: 'bring laptop',
  estimatedHours: 3,
  tags: ['group'],
  recurrence: { interval: 1, byweekday: [4] },
});
rejects(createAssignmentSchema, 'create missing dueAt', {
  courseCode: null,
  title: 'x',
  type: 'lab',
});
rejects(createAssignmentSchema, 'create non-datetime dueAt', {
  courseCode: null,
  title: 'x',
  type: 'lab',
  dueAt: DATE,
});
rejects(createAssignmentSchema, 'create title too long', {
  courseCode: null,
  title: 'x'.repeat(201),
  type: 'lab',
  dueAt: ISO,
});
rejects(createAssignmentSchema, 'create estimatedHours over cap', {
  courseCode: null,
  title: 'x',
  type: 'lab',
  dueAt: ISO,
  estimatedHours: 1000,
});

// --- updateAssignmentSchema (refine: at least one field) ---
accepts(updateAssignmentSchema, 'update single field', { title: 'New title' });
accepts(updateAssignmentSchema, 'update clear notes via null', { notes: null });
accepts(updateAssignmentSchema, 'update actualHours', { actualHours: 4.5 });
accepts(updateAssignmentSchema, 'update completedAt null (reopen)', { completedAt: null });
rejects(updateAssignmentSchema, 'update empty object rejected', {});
rejects(updateAssignmentSchema, 'update bad type', { type: 'quiz' });
rejects(updateAssignmentSchema, 'update negative actualHours', { actualHours: -1 });

// --- parseInputSchema ---
accepts(parseInputSchema, 'parse input ok', { input: 'HW due fri' });
accepts(parseInputSchema, 'parse input with referenceDate', { input: 'x', referenceDate: ISO });
rejects(parseInputSchema, 'parse input empty', { input: '' });
rejects(parseInputSchema, 'parse input too long', { input: 'x'.repeat(501) });

// --- createCourseSchema (hex color) ---
accepts(createCourseSchema, 'course minimal', { code: 'STA 240' });
accepts(createCourseSchema, 'course with hex color', { code: 'STA 240', color: '#6366f1' });
accepts(createCourseSchema, 'course name null', { code: 'STA 240', name: null });
rejects(createCourseSchema, 'course empty code', { code: '' });
rejects(createCourseSchema, 'course bad color (no hash)', { code: 'STA 240', color: '6366f1' });
rejects(createCourseSchema, 'course bad color (3 digit)', { code: 'STA 240', color: '#abc' });

// --- updateCourseSchema (refine) ---
accepts(updateCourseSchema, 'update course color', { color: '#abcdef' });
rejects(updateCourseSchema, 'update course empty rejected', {});

// --- updateSettingsSchema ---
accepts(updateSettingsSchema, 'settings offsets', { reminderOffsetsHours: [168, 48, 12] });
accepts(updateSettingsSchema, 'settings empty offsets allowed', { reminderOffsetsHours: [] });
accepts(updateSettingsSchema, 'settings canvas url', {
  canvasIcsUrl: 'https://canvas.duke.edu/feeds/calendars/x.ics',
});
accepts(updateSettingsSchema, 'settings canvas cleared with empty string', { canvasIcsUrl: '' });
accepts(updateSettingsSchema, 'settings canvas null', { canvasIcsUrl: null });
accepts(updateSettingsSchema, 'settings semester end date', { semesterEndDate: DATE });
rejects(updateSettingsSchema, 'settings empty object rejected', {});
rejects(updateSettingsSchema, 'settings bad canvas url', { canvasIcsUrl: 'not a url' });
rejects(updateSettingsSchema, 'settings too many offsets', {
  reminderOffsetsHours: [1, 2, 3, 4, 5, 6, 7, 8, 9],
});
rejects(updateSettingsSchema, 'settings offset over 30 days', { reminderOffsetsHours: [24 * 30 + 1] });
rejects(updateSettingsSchema, 'settings malformed semester date', { semesterEndDate: '2026/09/01' });

// --- applications ---
accepts(applicationStageSchema, 'stage applied', 'applied');
accepts(applicationStageSchema, 'stage withdrawn', 'withdrawn');
rejects(applicationStageSchema, 'stage unknown rejected', 'ghosted');

accepts(createApplicationSchema, 'application minimal', { company: 'Cisco', role: 'SWE Intern' });
accepts(createApplicationSchema, 'application full', {
  company: 'Cisco',
  role: 'SWE Intern',
  stage: 'phone_screen',
  nextAction: 'prep system design',
  nextActionAt: ISO,
  notes: 'recruiter: Pat',
});
rejects(createApplicationSchema, 'application empty company', { company: '', role: 'x' });
rejects(createApplicationSchema, 'application bad stage', {
  company: 'Cisco',
  role: 'x',
  stage: 'ghosted',
});

accepts(updateApplicationSchema, 'application update stage', { stage: 'offer' });
accepts(updateApplicationSchema, 'application clear nextAction', { nextAction: null });
rejects(updateApplicationSchema, 'application update empty rejected', {});

// --- gradescope sync ---
const token = 'a'.repeat(40);
accepts(gradescopeAssignmentSchema, 'gradescope assignment ok', {
  externalId: 'gs-123',
  title: 'PS1',
  dueAt: ISO,
});
accepts(gradescopeAssignmentSchema, 'gradescope assignment with url', {
  externalId: 'gs-123',
  title: 'PS1',
  dueAt: ISO,
  externalUrl: 'https://gradescope.com/courses/1/assignments/2',
});
rejects(gradescopeAssignmentSchema, 'gradescope assignment non-datetime due', {
  externalId: 'gs-123',
  title: 'PS1',
  dueAt: DATE,
});

accepts(gradescopeSyncSchema, 'gradescope sync ok', {
  token,
  courseName: 'STA 199',
  assignments: [{ externalId: 'gs-1', title: 'PS1', dueAt: ISO }],
});
accepts(gradescopeSyncSchema, 'gradescope sync empty assignments', {
  token,
  courseName: 'STA 199',
  assignments: [],
});
rejects(gradescopeSyncSchema, 'gradescope sync short token', {
  token: 'short',
  courseName: 'STA 199',
  assignments: [],
});
rejects(gradescopeSyncSchema, 'gradescope sync too many assignments', {
  token,
  courseName: 'STA 199',
  assignments: Array.from({ length: 201 }, (_, i) => ({
    externalId: `gs-${i}`,
    title: 'PS',
    dueAt: ISO,
  })),
});

console.log(`\nschemas.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
