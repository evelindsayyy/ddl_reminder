// Assertion-based unit tests for the pure parsing in lib/canvas.ts.
// Run: npx tsx lib/canvas.test.ts   (exits non-zero on any failure)
//
// Covers parseCanvasIcs (RFC5545 line-unfolding, property + DTSTART parsing,
// text unescaping, incomplete-event skipping) and splitCanvasSummary
// (course-code extraction from `[CODE] title` or CATEGORIES). The DB-backed
// syncCanvasForUser is not unit-tested here (needs Supabase) — its parsing
// inputs are what these tests pin down.

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCanvasIcs, splitCanvasSummary, syncCanvasForUser } from './canvas';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected ${String(expected)}, got ${String(actual)}`);
}
function eqArr(name: string, actual: string[], expected: string[]): void {
  check(
    name,
    actual.length === expected.length && actual.every((v, i) => v === expected[i]),
    `expected [${expected}], got [${actual}]`
  );
}

// Build a single VEVENT body from inner property lines.
function oneEvent(lines: string[]) {
  const body = ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\n');
  return parseCanvasIcs(body).events;
}
// Parse just a DTSTART line; returns the resulting ISO, or null if the event
// was dropped (e.g. unparseable DTSTART → no dtStart → incomplete).
function dtIso(dtstartLine: string): string | null {
  const evs = oneEvent(['UID:u', 'SUMMARY:s', dtstartLine]);
  return evs.length ? evs[0].dtStart.toISOString() : null;
}

// ================= parseCanvasIcs — full event =================

const basic = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Instructure//Canvas//EN',
  'BEGIN:VEVENT',
  'UID:event-aaa@instructure.com',
  'SUMMARY:[STA 240] HW5',
  'DTSTART:20260428T235900Z',
  'URL:https://canvas.duke.edu/courses/1/assignments/5',
  'CATEGORIES:STA 240,Homework',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

{
  const { events } = parseCanvasIcs(basic);
  eq('basic: one event', events.length, 1);
  const e = events[0];
  eq('basic: uid', e.uid, 'event-aaa@instructure.com');
  eq('basic: summary', e.summary, '[STA 240] HW5');
  eq('basic: dtStart iso', e.dtStart.toISOString(), '2026-04-28T23:59:00.000Z');
  eq('basic: url (colons preserved)', e.url, 'https://canvas.duke.edu/courses/1/assignments/5');
  eqArr('basic: categories', e.categories, ['STA 240', 'Homework']);
}

// ================= DTSTART variants =================

eq('dt: UTC Z', dtIso('DTSTART:20260428T235900Z'), '2026-04-28T23:59:00.000Z');
eq('dt: floating → treated as UTC', dtIso('DTSTART:20260428T235900'), '2026-04-28T23:59:00.000Z');
eq('dt: date-only → midnight UTC', dtIso('DTSTART;VALUE=DATE:20260428'), '2026-04-28T00:00:00.000Z');
eq('dt: TZID present → treated as UTC (documented fallback)',
  dtIso('DTSTART;TZID=America/New_York:20260428T120000'), '2026-04-28T12:00:00.000Z');
check('dt: unparseable → event dropped', dtIso('DTSTART:notadate') === null);

// ================= incomplete events skipped =================

check('skip: missing UID', oneEvent(['SUMMARY:s', 'DTSTART:20260101T120000Z']).length === 0);
check('skip: missing SUMMARY', oneEvent(['UID:u', 'DTSTART:20260101T120000Z']).length === 0);
check('skip: missing DTSTART', oneEvent(['UID:u', 'SUMMARY:s']).length === 0);

// ================= line folding (RFC5545) =================

{
  // The continuation line's first whitespace is the fold marker and is removed;
  // "due be" + "fore midnight" → "due before midnight".
  const folded = [
    'BEGIN:VEVENT',
    'UID:u-fold',
    'SUMMARY:[STA 240] Problem Set 5 due be',
    ' fore midnight',
    'DTSTART:20260428T235900Z',
    'END:VEVENT',
  ].join('\n');
  const fe = parseCanvasIcs(folded).events[0];
  eq('fold: summary unfolded', fe.summary, '[STA 240] Problem Set 5 due before midnight');
}

// ================= CRLF line endings =================

{
  const crlf = basic.replace(/\n/g, '\r\n');
  const evs = parseCanvasIcs(crlf).events;
  eq('crlf: one event', evs.length, 1);
  eq('crlf: dtStart', evs[0].dtStart.toISOString(), '2026-04-28T23:59:00.000Z');
}

// ================= text unescaping =================

{
  const esc = oneEvent(['UID:u', 'SUMMARY:Read ch 7\\, then 8\\; done', 'DTSTART:20260101T120000Z']);
  eq('unescape: \\, and \\; ', esc[0].summary, 'Read ch 7, then 8; done');
}

// ================= multiple events keep order =================

{
  const multi = [
    'BEGIN:VEVENT', 'UID:a', 'SUMMARY:First', 'DTSTART:20260101T120000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Second', 'DTSTART:20260102T120000Z', 'END:VEVENT',
  ].join('\n');
  const me = parseCanvasIcs(multi).events;
  eq('multi: count', me.length, 2);
  eq('multi: order[0]', me[0].uid, 'a');
  eq('multi: order[1]', me[1].uid, 'b');
}

// ================= key case-insensitivity / optional fields =================

{
  const lower = oneEvent(['uid:low', 'summary:Lower', 'dtstart:20260101T120000Z']);
  eq('lowercase keys: parsed', lower.length, 1);
  eq('lowercase keys: uid', lower[0]?.uid, 'low');
}
{
  const noUrl = oneEvent(['UID:u', 'SUMMARY:s', 'DTSTART:20260101T120000Z']);
  check('url absent → nullish', noUrl[0].url == null);
  eq('categories default empty', noUrl[0].categories.length, 0);
}
{
  const cats = oneEvent(['UID:u', 'SUMMARY:s', 'DTSTART:20260101T120000Z', 'CATEGORIES: STA 240 , Homework ,']);
  eqArr('categories: trimmed + empties dropped', cats[0].categories, ['STA 240', 'Homework']);
}

// ================= splitCanvasSummary =================

function scs(summary: string, cats: string[] = []) {
  return splitCanvasSummary(summary, cats);
}

{
  const r = scs('[STA 240] HW5');
  eq('split: bracket code', r.courseCode, 'STA 240');
  eq('split: bracket title', r.title, 'HW5');
}
eq('split: COMPSCI 210D code', scs('[COMPSCI 210D] Lab 6').courseCode, 'COMPSCI 210D');
{
  const r = scs('[ENG101] Essay'); // no inner space
  eq('split: no-space code normalized', r.courseCode, 'ENG 101');
  eq('split: no-space title', r.title, 'Essay');
}
{
  const r = scs('[ STA 240 ] HW'); // inner padding
  eq('split: padded code', r.courseCode, 'STA 240');
  eq('split: padded title', r.title, 'HW');
}
{
  const r = scs('Quiz 3', ['STA 199']); // CATEGORIES fallback
  eq('split: category fallback code', r.courseCode, 'STA 199');
  eq('split: category fallback keeps whole summary as title', r.title, 'Quiz 3');
}
{
  const r = scs('Some event', ['Homework']); // category isn't a code
  eq('split: non-code category → null', r.courseCode, null);
  eq('split: non-code category title', r.title, 'Some event');
}
{
  const r = scs('Plain title');
  eq('split: nothing → null', r.courseCode, null);
  eq('split: nothing → title', r.title, 'Plain title');
}
eq('split: trims title', scs('   spaced   ').title, 'spaced');
eq('split: bracket beats category', scs('[BIO 101] Lab', ['CHEM 200']).courseCode, 'BIO 101');
eq('split: skips non-matching category, uses the matching one',
  scs('Event', ['STA 240 Probability', 'MATH 122']).courseCode, 'MATH 122');

// ================= syncCanvasForUser: type preservation on re-sync =================
//
// Regression guard: the UPDATE path must NOT write `type`. Canvas can't tell us
// an assignment's type, so it's derived ('other') only on INSERT; a user who
// later edits the type in the app must keep it across every re-sync. We drive
// the real syncCanvasForUser with a stubbed fetch (returns one VEVENT whose UID
// matches an existing row) and a captured-write Supabase fake, then assert the
// update payload omits `type` while carrying Canvas-owned fields.

// A single-event feed whose UID collides with an existing row → the UPDATE path.
const RESYNC_ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:uid-existing',
  'SUMMARY:Rename this later', // no [CODE] → no course insert path
  'DTSTART:20260501T120000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

type FakeResult = { data: unknown; error: unknown };
function makeServiceClient(awaited: Record<string, FakeResult>) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const res = awaited[table] ?? { data: [], error: null };
    const b = {
      select: () => b,
      eq: () => b,
      insert: () => b,
      update: (payload: Record<string, unknown>) => {
        updates.push({ table, payload });
        return b;
      },
      single: () => Promise.resolve(res),
      maybeSingle: () => Promise.resolve(res),
      then: (onOk: (v: FakeResult) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(res).then(onOk, onErr),
    };
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, updates };
}

// tsx compiles to CJS (no top-level await), so the async re-sync check and the
// final summary run inside one async IIFE after the synchronous tests above.
async function resyncTypePreservation(): Promise<void> {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => RESYNC_ICS,
  })) as unknown as typeof fetch;

  try {
    const { client, updates } = makeServiceClient({
      assignments: {
        data: [
          {
            id: 'row-1',
            external_id: 'uid-existing',
            completed_at: null,
            notes: null,
            estimated_hours: null,
            actual_hours: null,
          },
        ],
        error: null,
      },
      courses: { data: [], error: null },
      user_prefs: { data: [], error: null },
    });

    const summary = await syncCanvasForUser(
      client,
      'user-1',
      'https://canvas.example.com/feed.ics'
    );

    eq('resync: one row updated', summary.updated, 1);
    eq('resync: nothing inserted', summary.inserted, 0);

    const assignmentUpdate = updates.find((u) => u.table === 'assignments');
    check('resync: an assignments UPDATE was issued', assignmentUpdate != null);
    check(
      'resync: UPDATE preserves user-edited type (no `type` in payload)',
      assignmentUpdate != null && !('type' in assignmentUpdate.payload)
    );
    // Canvas-owned fields are still written.
    check(
      'resync: UPDATE still writes Canvas-owned title',
      assignmentUpdate?.payload.title === 'Rename this later'
    );
    check(
      'resync: UPDATE still writes due_at',
      assignmentUpdate?.payload.due_at === '2026-05-01T12:00:00.000Z'
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
}

void resyncTypePreservation().then(() => {
  console.log(`\ncanvas.test.ts — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
