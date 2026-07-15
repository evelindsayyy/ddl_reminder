// Run: npx tsx lib/assignmentDraft.test.ts
// Pure assertion suite (no DB) for buildAssignmentDraft — the detailed
// add-form's field-assembly + validation helper. The final assertion is a
// round-trip: every ok:true payload must parse under createAssignmentSchema
// (the same schema the POST /api/assignments handler validates against), so the
// detailed form and QuickAdd stay wire-compatible.

import { buildAssignmentDraft } from './assignmentDraft';
import { createAssignmentSchema } from './schemas';

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown): void {
  assert(
    `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}

// Base valid input; individual tests override fields. The timezone is the
// user's configured pref (NOT the machine zone) — a non-UTC zone here pins the
// conversion machine-independently.
function base() {
  return {
    courseCode: 'STA 240',
    title: 'HW5',
    type: 'homework' as const,
    date: '2026-04-28', // a Tuesday → weekday 2
    time: '23:59',
    repeats: 'never' as const,
    timezone: 'America/New_York',
  };
}

// --- happy path: dueAt is the wall time read in the CONFIGURED zone ---
{
  const res = buildAssignmentDraft(base());
  assert('happy path ok', res.ok === true);
  if (res.ok) {
    eq('courseCode passthrough', res.payload.courseCode, 'STA 240');
    eq('title passthrough', res.payload.title, 'HW5');
    eq('type passthrough', res.payload.type, 'homework');
    // 2026-04-28 23:59 in America/New_York is EDT (UTC-4) → 03:59 next day UTC.
    // Pinned exactly (never the machine's local zone).
    eq('dueAt is the pref-zone instant', res.payload.dueAt, '2026-04-29T03:59:00.000Z');
    eq('tags default to empty array', res.payload.tags, []);
    assert('no recurrence key when never', !('recurrence' in res.payload));
    assert('no notes key when absent', !('notes' in res.payload));
    assert('no estimatedHours key when absent', !('estimatedHours' in res.payload));
    // round-trip: the payload validates under the create schema.
    assert('happy payload parses under createAssignmentSchema', createAssignmentSchema.safeParse(res.payload).success);
  }
}

// --- UTC pref zone: same wall time, no offset ---
{
  const res = buildAssignmentDraft({ ...base(), timezone: 'UTC' });
  assert('utc zone ok', res.ok === true);
  if (res.ok) eq('dueAt in UTC pref', res.payload.dueAt, '2026-04-28T23:59:00.000Z');
}

// --- empty title → errors.title, no fetch-able payload ---
{
  const res = buildAssignmentDraft({ ...base(), title: '   ' });
  assert('empty title not ok', res.ok === false);
  if (!res.ok) assert('errors.title present', typeof res.errors.title === 'string' && res.errors.title.length > 0);
}

// --- missing date → errors.due ---
{
  const res = buildAssignmentDraft({ ...base(), date: '' });
  assert('missing date not ok', res.ok === false);
  if (!res.ok) assert('errors.due present (missing date)', typeof res.errors.due === 'string' && res.errors.due.length > 0);
}

// --- missing time → errors.due ---
{
  const res = buildAssignmentDraft({ ...base(), time: '' });
  assert('missing time not ok', res.ok === false);
  if (!res.ok) assert('errors.due present (missing time)', typeof res.errors.due === 'string' && res.errors.due.length > 0);
}

// --- weekly → recurrence { interval: 1, byweekday: [<weekday of date>] } ---
{
  const res = buildAssignmentDraft({ ...base(), repeats: 'weekly' });
  assert('weekly ok', res.ok === true);
  if (res.ok) {
    eq('weekly interval', res.payload.recurrence?.interval, 1);
    eq('weekly byweekday derived from date', res.payload.recurrence?.byweekday, [2]);
    eq('weekly until null when absent', res.payload.recurrence?.until, null);
    assert('weekly payload parses', createAssignmentSchema.safeParse(res.payload).success);
  }
}

// --- biweekly → interval: 2 ---
{
  const res = buildAssignmentDraft({ ...base(), repeats: 'biweekly' });
  assert('biweekly ok', res.ok === true);
  if (res.ok) eq('biweekly interval', res.payload.recurrence?.interval, 2);
}

// --- until passes through as YYYY-MM-DD ---
{
  const res = buildAssignmentDraft({ ...base(), repeats: 'weekly', until: '2026-06-30' });
  assert('until ok', res.ok === true);
  if (res.ok) {
    eq('until passthrough', res.payload.recurrence?.until, '2026-06-30');
    assert('until payload parses', createAssignmentSchema.safeParse(res.payload).success);
  }
}

// --- empty courseCode string → courseCode: null ---
{
  const res = buildAssignmentDraft({ ...base(), courseCode: '   ' });
  assert('empty course ok', res.ok === true);
  if (res.ok) {
    eq('empty courseCode → null', res.payload.courseCode, null);
    assert('null-course payload parses', createAssignmentSchema.safeParse(res.payload).success);
  }
}

// --- notes / tags / estimatedHours flow through the "more" row ---
{
  const res = buildAssignmentDraft({
    ...base(),
    notes: 'chapters 4-6',
    tags: ['exam-prep', 'group'],
    estimatedHours: 3,
  });
  assert('more-row ok', res.ok === true);
  if (res.ok) {
    eq('notes passthrough', res.payload.notes, 'chapters 4-6');
    eq('tags passthrough', res.payload.tags, ['exam-prep', 'group']);
    eq('estimatedHours passthrough', res.payload.estimatedHours, 3);
    assert('more-row payload parses', createAssignmentSchema.safeParse(res.payload).success);
  }
}

// --- estimatedHours null is dropped (not sent as an invalid field) ---
{
  const res = buildAssignmentDraft({ ...base(), estimatedHours: null, notes: '  ' });
  assert('null hours ok', res.ok === true);
  if (res.ok) {
    assert('estimatedHours omitted when null', !('estimatedHours' in res.payload));
    assert('notes omitted when blank', !('notes' in res.payload));
  }
}

if (failed > 0) {
  console.error(`\nassignmentDraft: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`assignmentDraft: ${passed} passed`);
