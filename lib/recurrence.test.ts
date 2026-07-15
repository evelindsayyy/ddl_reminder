// Assertion-based unit tests for lib/recurrence.ts.
// Run: npx tsx lib/recurrence.test.ts   (exits non-zero on any failure)
//
// Focus areas:
//   - detectRecurrence: pattern parsing + clean `rest` extraction
//   - expandRecurrence: occurrence math, first-week skip, DST wall-clock safety
//   - firstOccurrenceFor / computeDefaultUntil: edge behavior
//
// Calendar facts these tests rely on (America/New_York, 2026), verified against
// date-fns-tz: May 4 = Mon, May 5 = Tue, May 6 = Wed; DST falls back Nov 1, so a
// Tuesday-23:59 series across late Oct/Nov keeps wall-clock 23:59 while its UTC
// offset shifts from EDT (-4) to EST (-5).

import {
  detectRecurrence,
  expandRecurrence,
  firstOccurrenceFor,
  computeDefaultUntil,
  seriesPropagationPatch,
} from './recurrence';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const TZ = 'America/New_York';

// ---------- tiny test harness ----------

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected ${String(expected)}, got ${String(actual)}`);
}

function eqArr(name: string, actual: number[], expected: number[]): void {
  check(
    name,
    actual.length === expected.length && actual.every((v, i) => v === expected[i]),
    `expected [${expected}], got [${actual}]`
  );
}

// ---------- helpers ----------

const atLocal = (y: number, mon: number, day: number, h = 0, mi = 0, s = 0): Date =>
  fromZonedTime(new Date(y, mon - 1, day, h, mi, s, 0), TZ);

interface Wall {
  mon: number;
  day: number;
  dow: number;
  h: number;
  mi: number;
  s: number;
}

const wall = (d: Date): Wall => {
  const z = toZonedTime(d, TZ);
  return {
    mon: z.getMonth() + 1,
    day: z.getDate(),
    dow: z.getDay(),
    h: z.getHours(),
    mi: z.getMinutes(),
    s: z.getSeconds(),
  };
};

// ================= detectRecurrence =================

function detYes(
  name: string,
  input: string,
  interval: 1 | 2,
  days: number[],
  rest: string
): void {
  const { rec, rest: gotRest } = detectRecurrence(input);
  if (!rec) {
    check(name, false, 'expected a recurrence, got null');
    return;
  }
  eq(`${name} · interval`, rec.interval, interval);
  eqArr(`${name} · byweekday`, rec.byweekday, days);
  eq(`${name} · rest`, gotRest, rest);
}

function detNo(name: string, input: string): void {
  const { rec, rest } = detectRecurrence(input);
  check(`${name} · rec null`, rec === null);
  eq(`${name} · rest untouched`, rest, input);
}

detYes('weekly single day', 'COMPSCI 372 homework every Tuesday 11:59pm', 1, [2], 'COMPSCI 372 homework 11:59pm');
detYes('every other → biweekly', 'STA 210 pset every other Wednesday 23:59', 2, [3], 'STA 210 pset 23:59');
detYes('biweekly keyword', 'reading biweekly Tue', 2, [2], 'reading');
detYes('bi-weekly hyphen', 'reading bi-weekly Tue', 2, [2], 'reading');
detYes('compound MWF', 'Spanish 101 reflection every MWF', 1, [1, 3, 5], 'Spanish 101 reflection');
detYes('compact TuTh', 'lab every TuTh', 1, [2, 4], 'lab');
detYes('and-list', 'lab every Tue and Thu 11:59pm', 1, [2, 4], 'lab 11:59pm');
detYes('weekly on <day>', 'meeting weekly on Monday 3pm', 1, [1], 'meeting 3pm');
detYes('days are deduped + sorted', 'standup every Fri and Mon and Fri', 1, [1, 5], 'standup');

detNo('no recurrence phrase', 'STA 240 HW5 due Friday 11:59pm');
detNo('unknown day token aborts', 'do every blarg');

// ================= firstOccurrenceFor =================

{
  // Base Monday May 4 → first Tuesday is May 5.
  const base = atLocal(2026, 5, 4);
  const f = firstOccurrenceFor({ baseDate: base, hour: 9, minute: 0, byweekday: [2], timezone: TZ });
  const w = wall(f);
  eq('firstOcc · month', w.mon, 5);
  eq('firstOcc · day', w.day, 5);
  eq('firstOcc · is Tuesday', w.dow, 2);
  eq('firstOcc · hour', w.h, 9);

  // Base already on a target weekday → same day (offset 0).
  const tue = atLocal(2026, 5, 5);
  const same = firstOccurrenceFor({ baseDate: tue, hour: 23, minute: 59, byweekday: [2], timezone: TZ });
  eq('firstOcc · same-day when base is target', wall(same).day, 5);

  // Multi-day picks the earliest upcoming day. Base Mon May 4, MWF → Mon May 4.
  const mwf = firstOccurrenceFor({ baseDate: base, hour: 9, minute: 0, byweekday: [1, 3, 5], timezone: TZ });
  eq('firstOcc · MWF from Monday picks Monday', wall(mwf).day, 4);
}

// ================= expandRecurrence =================

{
  const firstTue = atLocal(2026, 5, 5, 9, 0); // Tue May 5 09:00
  const until = atLocal(2026, 5, 26, 23, 59, 59); // through Tue May 26

  const weekly = expandRecurrence({
    firstDueAt: firstTue,
    rec: { interval: 1, byweekday: [2], until: null },
    until,
    timezone: TZ,
  });
  eq('weekly · count (May 5,12,19,26)', weekly.length, 4);
  check('weekly · all Tuesdays 09:00', weekly.every((d) => {
    const w = wall(d);
    return w.dow === 2 && w.h === 9 && w.mi === 0;
  }));
  check('weekly · spaced 7 calendar days', weekly.every((d, i) =>
    i === 0 || wall(d).day - wall(weekly[i - 1]).day === 7
  ));

  const biweekly = expandRecurrence({
    firstDueAt: firstTue,
    rec: { interval: 2, byweekday: [2], until: null },
    until,
    timezone: TZ,
  });
  eq('biweekly · count (May 5,19)', biweekly.length, 2);
  eq('biweekly · second is May 19', wall(biweekly[1]).day, 19);

  // Empty when until precedes the first occurrence.
  const empty = expandRecurrence({
    firstDueAt: firstTue,
    rec: { interval: 1, byweekday: [2], until: null },
    until: atLocal(2026, 5, 1),
    timezone: TZ,
  });
  eq('expand · empty when until < first', empty.length, 0);
}

{
  // First-week skip: MWF series starting on a Wednesday must NOT emit that
  // week's Monday (it precedes firstDueAt).
  const firstWed = atLocal(2026, 5, 6, 23, 59); // Wed May 6 23:59
  const until = atLocal(2026, 5, 15, 23, 59, 59); // through Fri May 15
  const mwf = expandRecurrence({
    firstDueAt: firstWed,
    rec: { interval: 1, byweekday: [1, 3, 5], until: null },
    until,
    timezone: TZ,
  });
  // week0: Wed May6, Fri May8 (Mon May4 skipped); week1: Mon11, Wed13, Fri15
  eq('mwf · count', mwf.length, 5);
  eq('mwf · first is Wed May 6', wall(mwf[0]).day, 6);
  check('mwf · first-week Monday (May 4) skipped', !mwf.some((d) => wall(d).day === 4));
}

{
  // DST safety: a Tuesday-23:59 series across the Nov 1 fall-back must keep
  // wall-clock 23:59 while its UTC offset shifts EDT(-4) → EST(-5).
  const firstTueOct = atLocal(2026, 10, 27, 23, 59); // Tue Oct 27 23:59 EDT
  const until = atLocal(2026, 11, 17, 23, 59, 59);
  const dst = expandRecurrence({
    firstDueAt: firstTueOct,
    rec: { interval: 1, byweekday: [2], until: null },
    until,
    timezone: TZ,
  });
  eq('dst · count (Oct27, Nov3,10,17)', dst.length, 4);
  check('dst · every occurrence is Tue 23:59 local', dst.every((d) => {
    const w = wall(d);
    return w.dow === 2 && w.h === 23 && w.mi === 59;
  }));
  // Concrete UTC: EDT before fall-back, EST after.
  eq('dst · Oct 27 is 03:59Z (EDT)', dst[0].toISOString(), '2026-10-28T03:59:00.000Z');
  eq('dst · Nov 3 is 04:59Z (EST)', dst[1].toISOString(), '2026-11-04T04:59:00.000Z');
  check('dst · offset actually shifted across boundary',
    dst.some((d) => d.getUTCHours() === 3) && dst.some((d) => d.getUTCHours() === 4));
}

// ================= computeDefaultUntil =================

{
  const first = atLocal(2026, 5, 5, 9, 0);

  const sem = computeDefaultUntil(first, '2026-05-06', TZ);
  const w = wall(sem);
  eq('until · semester end month', w.mon, 5);
  eq('until · semester end day', w.day, 6);
  eq('until · semester end 23:59:59', `${w.h}:${w.mi}:${w.s}`, '23:59:59');

  const fallback = computeDefaultUntil(first, null, TZ);
  eq('until · fallback is first + 15 weeks',
    fallback.getTime(), first.getTime() + 15 * 7 * 24 * 60 * 60 * 1000);
}

// ================= seriesPropagationPatch =================

{
  // Maps the shared fields camelCase → snake_case DB columns.
  const full = seriesPropagationPatch({
    title: 'Weekly lab',
    type: 'lab',
    notes: 'bring laptop',
    estimatedHours: 2,
  });
  eq('series · title propagates', full.title as string, 'Weekly lab');
  eq('series · type propagates', full.type as string, 'lab');
  eq('series · notes propagates', full.notes as string, 'bring laptop');
  eq('series · estimatedHours → estimated_hours', full.estimated_hours as number, 2);
  eq('series · no stray keys', Object.keys(full).length, 4);

  // Per-occurrence fields are never propagated, even when present on input.
  // (Cast through unknown: these keys are intentionally outside the param type.)
  const perOcc = seriesPropagationPatch({
    title: 'Lab 5',
    dueAt: '2026-07-01T03:59:00.000Z',
    completedAt: '2026-06-20T12:00:00.000Z',
    actualHours: 3,
  } as unknown as Parameters<typeof seriesPropagationPatch>[0]);
  eq('series · per-occurrence fields excluded', Object.keys(perOcc).length, 1);
  check('series · due_at not in patch', !('due_at' in perOcc));
  check('series · completed_at not in patch', !('completed_at' in perOcc));
  check('series · actual_hours not in patch', !('actual_hours' in perOcc));

  // Only keys actually supplied appear (unchanged fields are not overwritten).
  const partial = seriesPropagationPatch({ notes: null });
  eq('series · single field only', Object.keys(partial).length, 1);
  check('series · explicit null notes is kept', partial.notes === null);

  // Empty input → empty patch (caller skips the sibling update).
  eq('series · empty input → empty patch', Object.keys(seriesPropagationPatch({})).length, 0);
}

// ---------- report ----------

console.log(`\nrecurrence.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
